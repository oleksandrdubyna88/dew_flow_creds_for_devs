using System.Text.Json;
using System.Net;
using System.Security.Claims;
using System.Threading.RateLimiting;
using CredVaultServer;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Serilog;

// `--healthcheck` is the container HEALTHCHECK exec'ing this same binary: the chiseled
// image has no shell and no curl to ask with. Handled before any host is built.
if (args is ["--healthcheck"])
{
    return await HealthProbe.RunAsync();
}

var builder = WebApplication.CreateBuilder(args);

// First statement after the builder: a host that crashes while wiring itself up is
// exactly when the log matters (.claude/rules/shared/common/logging-serilog.md).
builder.AddCredVaultLogging("cred-vault-server");

// ---------- configuration ----------
// Vault:DataDir          where blobs live (default ./data)
// Vault:AllowedDomains   csv of email domains that may use the server ("" = any verified caller)
// Vault:MaxVaultBytes    per-vault upload cap (default 8 MiB)
// Auth:Microsoft:Tenant  Entra tenant id/domain (issuer trust) — required to accept MS tokens
// Auth:Microsoft:Audiences  csv of accepted audiences ("" = don't validate audience; see README)
// Auth:Google:Enabled    "true" to also accept Google id tokens
// Auth:Google:Audiences  csv of accepted Google client ids
// Auth:Local:SigningKey  HMAC secret enabling a LOCAL token scheme — for
//                        tests and offline/self-hosted deployments only;
//                        leave empty in any cloud-auth deployment.
var config = builder.Configuration;
var dataDir = config["Vault:DataDir"] ?? Path.Combine(AppContext.BaseDirectory, "data");
var allowedDomains = SplitCsv(config["Vault:AllowedDomains"]);
var allowAnyDomain = config.GetValue("Vault:AllowAnyDomain", false);
var maxVaultBytes = config.GetValue("Vault:MaxVaultBytes", 8L * 1024 * 1024);
var maxShareBytes = config.GetValue("Vault:MaxShareBytes", 1L * 1024 * 1024);
var maxInboxItems = config.GetValue("Vault:MaxInboxItems", 500);
// A pending share nobody accepted is swept after this many days. Without it an inbox only ever
// shrank when its owner acted, so one that filled to MaxInboxItems refused every later share —
// a failure the SENDER sees, about a state only the recipient can clear.
var shareMaxAgeDays = config.GetValue("Vault:ShareMaxAgeDays", 31);
// Corporate break-glass recovery. Empty roster = the feature does not exist on this server;
// a non-empty one enrols EVERY account here, which is why the roster is published to every
// caller rather than to officers only. See OrgRecovery.cs and todo/PLAN_org_recovery.md.
var orgRecovery = OrgRecoveryConfig.Read(
    SplitCsv(config["Vault:CorpRecovery:OfficerEmails"]),
    config.GetValue("Vault:CorpRecovery:Threshold", 2));
// How long an unacknowledged setup invite lives. A ceremony that stalls must expire rather
// than leave a sealed share somebody accepts a year later into a key never published.
var orgSetupTtlHours = config.GetValue("Vault:CorpRecovery:SetupTtlHours", 72);
var maintenanceMinutes = config.GetValue("Vault:MaintenanceIntervalMinutes", 60);
// Raise this the day an older extension would MISREAD a response, never merely because a newer
// one exists. Below it the server refuses with 426 instead of answering something the client
// will get wrong.
var minimumClientContract = config.GetValue("Vault:MinimumClientContract", ContractVersion.DefaultMinimumSupported);
var requireHttps = config.GetValue("Vault:RequireForwardedHttps", false);
var rateLimitPermits = config.GetValue("Vault:RateLimit:PermitLimit", 120);
var rateLimitWindow = TimeSpan.FromSeconds(config.GetValue("Vault:RateLimit:WindowSeconds", 10));

// Probe BEFORE constructing the store. VaultStore's constructor creates its two
// subdirectories, so an unwritable DataDir used to surface as a raw
// UnauthorizedAccessException from a stack frame that says nothing about what to do —
// and the single most common cause is the ordinary one: a bind-mounted host directory
// owned by root while the container runs unprivileged.
try
{
    Directory.CreateDirectory(dataDir);
    var probe = Path.Combine(dataDir, ".startup-probe");
    File.WriteAllText(probe, "ok");
    File.Delete(probe);
}
catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
{
    throw new InvalidOperationException(
        $"DataDir '{dataDir}' is not writable by uid {Environment.UserName}: {ex.Message}. "
        + "In Docker this is almost always a host directory owned by root: run "
        + $"`chown -R 10001:10001 <host path>`, or let the stack's `init` service do it.",
        ex);
}

// One JSON contract, generated at compile time — the AOT requirement that also makes
// every JIT build faster. See AppJsonContext.
builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.TypeInfoResolverChain.Insert(0, AppJsonContext.Default));

var store = new VaultStore(dataDir);
builder.Services.AddSingleton(store);

// The hourly pass: retire receipts the recipient has already dealt with, prune what nobody
// touched in a month. Registered from the same instance the endpoints close over, so tests and
// production sweep exactly one store.
builder.Services.AddHostedService(sp => new ShareMaintenance(
    store,
    sp.GetRequiredService<ILoggerFactory>().CreateLogger<ShareMaintenance>(),
    TimeSpan.FromMinutes(Math.Max(1, maintenanceMinutes)),
    TimeSpan.FromDays(Math.Max(1, shareMaxAgeDays))));

var orgStore = new OrgRecoveryStore(dataDir);
if (orgRecovery.Enabled)
{
    // Only when the feature is on: an idle timer sweeping an empty directory every hour on
    // every other deployment is noise with a cost, however small.
    builder.Services.AddHostedService(sp => new OrgRecoveryMaintenance(
        orgStore,
        sp.GetRequiredService<ILoggerFactory>().CreateLogger<OrgRecoveryMaintenance>(),
        TimeSpan.FromMinutes(Math.Max(1, maintenanceMinutes)),
        TimeSpan.FromHours(Math.Max(1, orgSetupTtlHours))));
}

// Hard request-body ceiling (backstop; endpoints also check Content-Length).
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = maxVaultBytes + 64 * 1024);

// Light rate limiting per caller — cheap DoS guard.
//
// The partition key is the VERIFIED caller email (resolved by the middleware that runs
// just before UseRateLimiter), so one noisy account cannot throttle anyone else.
//
// Requests carrying no valid token have no identity to partition by and fall back to the
// remote address — which is the caller's own only because `UseForwardedHeaders` above
// resolves it from the entry nginx appended. Without that step it is nginx's address for
// every caller alive, i.e. one bucket for the internet, and the first noisy sender takes
// the public health probe and every legitimate 401 down with them.
// Docker bridge networks live in the private ranges; loopback covers a host run and the
// in-process test server. Nothing public is here, so a header arriving from a public
// address is never trusted — and while the port stays unpublished that cannot happen.
var trustedProxyNetworks = new System.Net.IPNetwork[]
{
    new(IPAddress.Parse("127.0.0.0"), 8),
    new(IPAddress.Parse("10.0.0.0"), 8),
    new(IPAddress.Parse("172.16.0.0"), 12),
    new(IPAddress.Parse("192.168.0.0"), 16),
    new(IPAddress.IPv6Loopback, 128),
};

// The true client address, for the anonymous partition below.
//
// This container publishes no port — every request arrives through nginx on the docker
// network — so `RemoteIpAddress` is nginx's address for every caller alive. Partitioning
// anonymous traffic on it put the whole internet in one bucket, which is a 429 on the
// public health probe and on every legitimate 401 as soon as one sender is noisy.
//
// Trusting a client-supplied header is normally how you LOSE a rate limiter, so two
// things make it safe here. nginx sets `$proxy_add_x_forwarded_for`, which APPENDS the
// address it observed to whatever the client sent — so the rightmost entry is the proxy's
// own observation and `ForwardLimit = 1` reads exactly that one. And `KnownIPNetworks`
// restricts the whole mechanism to requests that arrived from a private address, which,
// given no published port, is the only way in.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor;
    options.ForwardLimit = 1;
    // Deliberately NOT XForwardedProto: `RequireForwardedHttps` below reads that header
    // itself and treats a missing one as plaintext. Letting the middleware consume it
    // would quietly turn that guard into something else.
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
    foreach (var network in trustedProxyNetworks)
    {
        options.KnownIPNetworks.Add(network);
    }
});

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
    {
        var key = TokenIdentity.Email(ctx.User) is { } email
            ? "user:" + email
            : "anon:" + (ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown");
        return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = rateLimitPermits,
            Window = rateLimitWindow,
            QueueLimit = 0,
        });
    });
});

// ---------- authentication: Microsoft Entra + (optional) Google ----------
var msTenant = config["Auth:Microsoft:Tenant"];
var msAudiences = SplitCsv(config["Auth:Microsoft:Audiences"]);
// The scope a client must ASK Entra for, which is not the same string as the
// audience this server accepts: the audience is the app registration, the scope
// names a permission inside it. It cannot be derived — the scope name is whatever
// the operator called it — so it is configured, once, here rather than by hand in
// every developer's settings.json.
var msClientScope = (config["Auth:Microsoft:ClientScope"] ?? string.Empty).Trim();
var googleEnabled = config.GetValue("Auth:Google:Enabled", false);
var googleAudiences = SplitCsv(config["Auth:Google:Audiences"]);
var localKey = config["Auth:Local:SigningKey"];
var localEnabled = !string.IsNullOrWhiteSpace(localKey);

// Concrete schemes only; RequireCaller/AuthenticateAny try each explicitly.
var authBuilder = builder.Services.AddAuthentication();

if (!string.IsNullOrWhiteSpace(msTenant))
{
    authBuilder.AddJwtBearer("Microsoft", options =>
    {
        options.MetadataAddress =
            $"https://login.microsoftonline.com/{msTenant}/v2.0/.well-known/openid-configuration";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuers =
            [
                $"https://login.microsoftonline.com/{msTenant}/v2.0",
                $"https://sts.windows.net/{msTenant}/",
            ],
            ValidateAudience = msAudiences.Count > 0,
            ValidAudiences = msAudiences,
            ValidateLifetime = true,
        };
    });
}

if (googleEnabled)
{
    authBuilder.AddJwtBearer("Google", options =>
    {
        options.MetadataAddress = "https://accounts.google.com/.well-known/openid-configuration";
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuers = ["https://accounts.google.com", "accounts.google.com"],
            ValidateAudience = googleAudiences.Count > 0,
            ValidAudiences = googleAudiences,
            ValidateLifetime = true,
        };
    });
}

if (localEnabled)
{
    // Symmetric-key scheme: no cloud dependency. Tokens are issued by an
    // operator-side tool (or the test harness) with an `email` claim.
    authBuilder.AddJwtBearer("Local", options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = "cred-vault-local",
            ValidateAudience = false,
            ValidateLifetime = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                System.Text.Encoding.UTF8.GetBytes(localKey!)),
            ValidateIssuerSigningKey = true,
        };
    });
}

var app = builder.Build();

// Before anything reads the remote address — the limiter partitions on it.
app.UseForwardedHeaders();

var log = app.Logger;

// The contract version, decided before authentication so a client too old to be served is told
// THAT rather than being handed a 401 about a token that was never the problem. Every response
// carries the server version, so a client learns it from a call it was already making.
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers[ContractVersion.Header] = ContractVersion.Current.ToString();
    var decision = ContractVersion.Judge(ctx.Request.Headers[ContractVersion.Header], minimumClientContract);
    if (decision.Verdict == ContractVersion.Verdict.TooOld)
    {
        ctx.Response.StatusCode = StatusCodes.Status426UpgradeRequired;
        await ctx.Response.WriteAsync(decision.Reason);
        return;
    }
    await next();
});

// ---------- fail fast on misconfiguration ----------
if (string.IsNullOrWhiteSpace(msTenant) && !googleEnabled && !localEnabled)
{
    throw new InvalidOperationException(
        "No authentication scheme configured — set Auth:Microsoft:Tenant, Auth:Google:Enabled, "
        + "or Auth:Local:SigningKey. Refusing to start a server that would 401 every request.");
}
if (allowedDomains.Count == 0 && !allowAnyDomain)
{
    throw new InvalidOperationException(
        "Vault:AllowedDomains is empty. Set it to your company domain(s), or set "
        + "Vault:AllowAnyDomain=true to explicitly run without a domain boundary.");
}
if (localEnabled)
{
    // HMAC-SHA256 needs a 256-bit key. A shorter one is the nastiest kind of
    // misconfiguration: the scheme registers without complaint, the host starts,
    // /api/health reports OK — and every single request is rejected with 401 with
    // nothing in the log to connect the two. Same reasoning as the guard above.
    var keyBytes = System.Text.Encoding.UTF8.GetByteCount(localKey!);
    if (keyBytes < 32)
    {
        throw new InvalidOperationException(
            $"Auth:Local:SigningKey is {keyBytes} bytes; HMAC-SHA256 requires at least 32. "
            + "A shorter key would start a server that answers 401 to everything. "
            + "Generate one with: openssl rand -base64 48");
    }
}
if (orgRecovery.Enabled)
{
    // Said at startup, at Warning, because it is the one setting that changes what happens to
    // OTHER people's vaults: every account on this server becomes recoverable by this quorum.
    // An operator who did not mean to enable it should find out from the log, not from a user.
    log.LogWarning(
        "CORPORATE RECOVERY IS ON: {Threshold} of {Count} officers ({Officers}) can jointly "
        + "recover any vault on this server. Every account here is enrolled automatically. "
        + "Roster fingerprint {Fingerprint}.",
        orgRecovery.Threshold,
        orgRecovery.OfficerEmails.Count,
        string.Join(", ", orgRecovery.OfficerEmails),
        orgRecovery.RosterFingerprint());
}
store.SweepStaleTempFiles();
if ((msAudiences.Count == 0 && !string.IsNullOrWhiteSpace(msTenant))
    || (googleEnabled && googleAudiences.Count == 0))
{
    log.LogWarning(
        "AUDIENCE VALIDATION DISABLED: any token from the trusted issuer is accepted regardless "
        + "of which app it was minted for. Set Auth:*:Audiences once the client has its own API "
        + "registration. See README.");
}

// ---------- pipeline ----------
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    ExceptionHandler = async ctx =>
    {
        var ex = ctx.Features.Get<IExceptionHandlerFeature>()?.Error;
        log.LogError(ex, "Unhandled error on {Method} {Path}", ctx.Request.Method, ctx.Request.Path);
        ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await ctx.Response.WriteAsJsonAsync(new ErrorDto("internal error"), AppJsonContext.Default.ErrorDto);
    },
});
if (requireHttps)
{
    // Behind a TLS-terminating proxy. The proxy ALWAYS sets X-Forwarded-Proto, so a
    // request that does not carry it did not come through the proxy — treat a missing
    // header exactly like a plaintext one. (Until 2026-08-23 the check only fired when
    // the header was present and not https, so omitting it was a one-line bypass.)
    //
    // Enable this ONLY when the app's port is unreachable except through that proxy;
    // the header is trusted, and anything that can reach the app directly can set it.
    app.Use(async (ctx, next) =>
    {
        // The container's own healthcheck runs inside the network with no proxy in
        // front of it. Health carries no secret, so it is the one exemption.
        if (ctx.Request.Path.StartsWithSegments("/api/health"))
        {
            await next();
            return;
        }

        var proto = ctx.Request.Headers["X-Forwarded-Proto"].ToString();
        if (!proto.Equals("https", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            await ctx.Response.WriteAsync("HTTPS required.");
            return;
        }
        await next();
    });
}

// Resolve the caller BEFORE the rate limiter runs.
//
// This ordering is the whole point: the limiter partitions on the caller's email, and
// nothing else in this pipeline populates ctx.User (the endpoints authenticate by hand,
// there is no UseAuthentication, and there is no default scheme to give it one). Until
// 2026-08-23 the limiter ran first, found an always-empty ctx.User, and fell back to the
// remote IP — which behind a reverse proxy is the PROXY's address for every caller alive,
// so one busy client throttled the entire company out of the server.
app.Use(async (ctx, next) =>
{
    var principal = await AuthenticateAny(ctx, msTenant, googleEnabled, localEnabled);
    if (principal is not null)
    {
        ctx.User = principal;
    }
    await next();
});

app.UseRateLimiter();

// Authorize the caller resolved above; 403 for outside-domain callers.
(string Email, string? Name)? RequireCaller(HttpContext ctx)
{
    var email = TokenIdentity.Email(ctx.User);
    if (email is null)
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return null;
    }
    if (!allowAnyDomain && !TokenIdentity.DomainAllowed(email, allowedDomains))
    {
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        return null;
    }
    return (email, TokenIdentity.Name(ctx.User));
}

// The same status-plus-plain-text shape the older endpoints spell inline three lines at a
// time. Extracted rather than repeated because the org-recovery endpoints below have eight
// refusal paths between them, and eight copies is where one of them ends up saying something
// slightly different from the rest.
static async Task Fail(HttpContext ctx, int status, string message)
{
    ctx.Response.StatusCode = status;
    await ctx.Response.WriteAsync(message, ctx.RequestAborted);
}

/// <summary>
/// Stream a JSON array to the response, one element live at a time.
/// </summary>
/// <remarks>
/// Written by hand rather than handed an <c>IAsyncEnumerable</c>, because the AOT source
/// generator has no converter for one — a fact the build now enforces rather than leaves to be
/// discovered at runtime. Materialising instead would put a whole inbox resident at once, which
/// a 512 MiB container does not survive and which any caller can provoke.
///
/// Extracted when the org-recovery invites needed the same shape: both callers are edited here,
/// so this is one implementation rather than a second copy of the share inbox's.
/// </remarks>
static async Task WriteJsonArrayAsync<T>(
    HttpContext ctx,
    IAsyncEnumerable<T> items,
    System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> typeInfo,
    CancellationToken ct)
{
    ctx.Response.ContentType = "application/json";
    var body = ctx.Response.Body;
    await body.WriteAsync("["u8.ToArray(), ct);
    var first = true;
    await foreach (var item in items.WithCancellation(ct))
    {
        if (!first)
        {
            await body.WriteAsync(","u8.ToArray(), ct);
        }
        first = false;
        await JsonSerializer.SerializeAsync(body, item, typeInfo, ct);
    }
    await body.WriteAsync("]"u8.ToArray(), ct);
}

/// <summary>The grouped-hex fingerprint clients compare a published key against.</summary>
static string FingerprintOf(string keyBase64)
{
    var digest = System.Security.Cryptography.SHA256.HashData(Convert.FromBase64String(keyBase64));
    return string.Join(' ', Convert.ToHexString(digest)[..32].Chunk(4).Select(c => new string(c)));
}

app.MapGet("/api/health", () =>
{
    try
    {
        var probe = Path.Combine(dataDir, ".health-probe");
        File.WriteAllText(probe, "ok");
        File.Delete(probe);
        return Results.Json(new HealthDto("ok", "cred-vault-server", "writable"), AppJsonContext.Default.HealthDto);
    }
    catch (Exception ex)
    {
        log.LogError(ex, "Health probe failed writing to DataDir");
        return Results.Json(
            new HealthDto("unhealthy", "cred-vault-server", "unwritable"),
            AppJsonContext.Default.HealthDto,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

// What a client needs before it can authenticate. Anonymous by necessity — the
// caller has no token yet, which is the whole point — and rate-limited like
// everything else. Deliberately NOT folded into /api/health: nginx exempts that
// path from its limiter so monitoring cannot exhaust the budget, and an anonymous
// endpoint outside the limiter is one somebody will eventually poll in a loop.
app.MapGet("/api/client-config", () =>
    Results.Json(new ClientConfigDto(msClientScope), AppJsonContext.Default.ClientConfigDto));

app.MapGet("/api/whoami", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    var hasVault = await store.ReadVaultAsync(caller.Value.Email, ct) is not null;
    await ctx.Response.WriteAsJsonAsync(
        new WhoAmIDto(caller.Value.Email, caller.Value.Name, hasVault),
        AppJsonContext.Default.WhoAmIDto,
        cancellationToken: ct);
});

// ----- own vault -----
app.MapGet("/api/vault", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    var bytes = await store.ReadVaultAsync(caller.Value.Email, ct);
    if (bytes is null)
    {
        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }
    // The version to echo back on the next write. Without it a client has no way to
    // say "only if nobody else changed this since I read it".
    ctx.Response.Headers.ETag = VaultStore.ETagFor(bytes);
    ctx.Response.ContentType = "application/octet-stream";
    await ctx.Response.Body.WriteAsync(bytes, ct);
});

app.MapPut("/api/vault", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    if (ctx.Request.ContentLength is long declared && declared > maxVaultBytes)
    {
        ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
        await ctx.Response.WriteAsync($"Vault must be 1..{maxVaultBytes} bytes.", ct);
        return;
    }
    using var ms = new MemoryStream();
    await ctx.Request.Body.CopyToAsync(ms, ct);
    if (ms.Length == 0 || ms.Length > maxVaultBytes)
    {
        ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
        await ctx.Response.WriteAsync($"Vault must be 1..{maxVaultBytes} bytes.", ct);
        return;
    }
    // Optimistic concurrency. Two of one person's machines syncing at once is ordinary,
    // and without this the second write silently discards the first at the blob level.
    // Opt-in by design: a client that sends neither header keeps the old behaviour.
    var precondition = VaultPrecondition.FromHeaders(
        ctx.Request.Headers.IfMatch.ToString(),
        ctx.Request.Headers.IfNoneMatch.ToString());

    var content = ms.ToArray();
    // A caller may write ONLY their own vault (email is taken from the token).
    if (!await store.TryWriteVaultAsync(caller.Value.Email, content, precondition, ct))
    {
        log.LogInformation(
            "stale vault write refused for {Email} — the caller's copy is out of date",
            caller.Value.Email);
        ctx.Response.StatusCode = StatusCodes.Status412PreconditionFailed;
        await ctx.Response.WriteAsync(
            "The vault changed since you read it. Re-read, merge, and write again.", ct);
        return;
    }

    log.LogInformation("vault write by {Email} ({Bytes} bytes)", caller.Value.Email, ms.Length);
    await store.RecordOwnerAsync(caller.Value.Email, ct);
    ctx.Response.Headers.ETag = VaultStore.ETagFor(content);
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
});

// ----- delete my own vault + inbox (account removal) -----
app.MapDelete("/api/vault", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    store.DeleteEverythingFor(caller.Value.Email);
    log.LogInformation("vault + inbox deleted for {Email}", caller.Value.Email);
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
});

// ----- team discovery (emails only, same-domain) -----
app.MapGet("/api/team", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    var callerDomain = DomainOf(caller.Value.Email);
    var members = store.ListVaultOwners()
        .Where(e => DomainOf(e) == callerDomain)
        .Select(e => new TeamMemberDto(e))
        .ToList();
    await ctx.Response.WriteAsJsonAsync(members, AppJsonContext.Default.ListTeamMemberDto);
});

// ----- corporate recovery: what every account here is subject to -----
//
// Readable by ANY allowed caller, not officers only. On a server with a roster configured,
// every account is enrolled automatically — its vault gains an escrow wrap on the next write —
// and somebody whose secrets a quorum of named colleagues can recover is entitled to know that,
// and to know which colleagues. A silent escrow is a backdoor by shape even when it is
// legitimate by intent.
//
// Every field is public by construction: a roster the operator wrote, a threshold, and (once
// the ceremony has run) an X25519 PUBLIC key. The private half exists only as Shamir shares
// sealed inside the officers' own vaults; this server has no code path that could hold one.
app.MapGet("/api/org-recovery/config", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    // A published key from a ceremony run against a DIFFERENT roster is not usable: the
    // officers who hold its shares are not the officers this server now names. Reported as
    // "setup not complete" so clients refuse to enrol rather than sealing to a quorum that
    // no longer exists — and the operator's own log line said the roster changed.
    var setup = orgRecovery.Enabled ? await orgStore.ReadSetupAsync(ct) : null;
    var current = setup is not null && setup.RosterFingerprint == orgRecovery.RosterFingerprint();
    await ctx.Response.WriteAsJsonAsync(
        new OrgRecoveryConfigDto(
            Enabled: orgRecovery.Enabled,
            OfficerEmails: orgRecovery.OfficerEmails,
            Threshold: orgRecovery.Threshold,
            // Two facts, not one: `enabled` says the operator asked for this, `setupComplete`
            // says the officers have actually run the ceremony and it still matches the roster.
            SetupComplete: current,
            OrgPublicKey: current ? setup!.OrgPublicKey : "",
            OrgPublicKeyFingerprint: current ? setup!.OrgPublicKeyFingerprint : "",
            RosterFingerprint: orgRecovery.Enabled ? orgRecovery.RosterFingerprint() : "",
            PublishedAt: current ? setup!.PublishedAt : 0),
        AppJsonContext.Default.OrgRecoveryConfigDto,
        cancellationToken: ct);
});

// Every endpoint below is officer-only. Not because the payloads are readable — they are
// opaque — but because these are the levers of the ceremony, and a stranger who can post an
// invite can seat their own share where a real officer's belongs.
(string Email, string? Name)? RequireOfficer(HttpContext ctx)
{
    var caller = RequireCaller(ctx);
    if (caller is null) return null;
    if (!orgRecovery.Enabled || !orgRecovery.IsOfficer(caller.Value.Email))
    {
        // One answer for "the feature is off here" and "you are not on the roster": telling a
        // caller which of the two it is hands them the roster's shape for free.
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        return null;
    }
    return caller;
}

// ----- the setup ceremony: one sealed Shamir share per officer -----
app.MapPost("/api/org-recovery/invites", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return;
    var request = await ctx.Request.ReadFromJsonAsync(
        AppJsonContext.Default.EscrowInviteRequest, ct);
    if (request is null || !request.IsValid())
    {
        await Fail(ctx, StatusCodes.Status400BadRequest, "Malformed escrow invite.");
        return;
    }
    if (request.PayloadBytes() > maxShareBytes)
    {
        await Fail(ctx, StatusCodes.Status400BadRequest, "Escrow invite payload too large.");
        return;
    }
    // A share may only be sent to somebody the OPERATOR put on the roster. Without this an
    // officer could seat a share with an accomplice outside it and quietly lower the real
    // threshold to one.
    if (!orgRecovery.IsOfficer(request.ToEmail))
    {
        await Fail(ctx, StatusCodes.Status403Forbidden, "That recipient is not a recovery officer.");
        return;
    }
    if (request.TotalShares != orgRecovery.OfficerEmails.Count
        || request.Threshold != orgRecovery.Threshold)
    {
        // The split has to match the roster this server publishes, or clients would pin a
        // fingerprint describing one scheme while the shares implement another.
        await Fail(
            ctx,
            StatusCodes.Status409Conflict,
            $"This server's roster is {orgRecovery.Threshold} of {orgRecovery.OfficerEmails.Count}.");
        return;
    }
    await orgStore.AppendInviteAsync(
        new EscrowInviteItem
        {
            SetupId = request.SetupId,
            FromEmail = caller.Value.Email, // stamped, never accepted from the body
            ToEmail = request.ToEmail.Trim().ToLowerInvariant(),
            ShareIndex = request.ShareIndex,
            Threshold = request.Threshold,
            TotalShares = request.TotalShares,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Salt = request.Salt,
            Iv = request.Iv,
            Tag = request.Tag,
            Data = request.Data,
            KdfN = request.KdfN,
            KdfR = request.KdfR,
            KdfP = request.KdfP,
        },
        ct);
    ctx.Response.StatusCode = StatusCodes.Status201Created;
});

app.MapGet("/api/org-recovery/invites", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return;
    await WriteJsonArrayAsync(
        ctx, orgStore.ListInvitesAsync(caller.Value.Email, ct), AppJsonContext.Default.EscrowInviteItem, ct);
});

app.MapPost("/api/org-recovery/invites/{id}/ack", (HttpContext ctx, string id) =>
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return Task.CompletedTask;
    if (!Guid.TryParse(id, out _))
    {
        return Fail(ctx, StatusCodes.Status400BadRequest, "Malformed invite id.");
    }
    // Only out of the CALLER's own inbox — the path names no owner, so a caller holding
    // somebody else's invite id has nothing to reach it with.
    ctx.Response.StatusCode = orgStore.AcknowledgeInvite(caller.Value.Email, id)
        ? StatusCodes.Status204NoContent
        : StatusCodes.Status404NotFound;
    return Task.CompletedTask;
});

app.MapGet("/api/org-recovery/invites/status", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return;
    var setupId = ctx.Request.Query["setupId"].ToString();
    if (!Guid.TryParse(setupId, out _))
    {
        await Fail(ctx, StatusCodes.Status400BadRequest, "Malformed setupId.");
        return;
    }
    var pending = await orgStore.PendingOfficersAsync(setupId, orgRecovery.OfficerEmails, ct);
    await ctx.Response.WriteAsJsonAsync(
        new SetupStatusDto(setupId, orgRecovery.OfficerEmails.Count, pending),
        AppJsonContext.Default.SetupStatusDto,
        cancellationToken: ct);
});

// ----- publishing the key the ceremony produced -----
app.MapPost("/api/org-recovery/setup", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return;
    var request = await ctx.Request.ReadFromJsonAsync(
        AppJsonContext.Default.PublishSetupRequest, ct);
    if (request is null || !request.IsValid())
    {
        await Fail(ctx, StatusCodes.Status400BadRequest, "Malformed setup publication.");
        return;
    }
    var existing = await orgStore.ReadSetupAsync(ct);
    if (existing is not null && existing.SetupId == request.SetupId)
    {
        // A retry after a dropped response is idempotent; the same ceremony offering a
        // DIFFERENT key is a swap attempt and is refused.
        if (existing.OrgPublicKey == request.OrgPublicKey)
        {
            ctx.Response.StatusCode = StatusCodes.Status200OK;
            return;
        }
        await Fail(
            ctx,
            StatusCodes.Status409Conflict,
            "That ceremony has already published a different key.");
        return;
    }
    var pending = await orgStore.PendingOfficersAsync(request.SetupId, orgRecovery.OfficerEmails, ct);
    if (pending.Count > 0)
    {
        // Publishing before everyone has stored their share would leave a key whose quorum
        // cannot be assembled — recoverable-looking and not recoverable.
        await Fail(
            ctx,
            StatusCodes.Status409Conflict,
            $"{pending.Count} officer(s) have not acknowledged their share yet.");
        return;
    }
    await orgStore.WriteSetupAsync(
        new OrgRecoverySetup
        {
            SetupId = request.SetupId,
            OrgPublicKey = request.OrgPublicKey,
            OrgPublicKeyFingerprint = FingerprintOf(request.OrgPublicKey),
            RosterFingerprint = orgRecovery.RosterFingerprint(),
            PublishedBy = caller.Value.Email,
            PublishedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        },
        ct);
    log.LogWarning(
        "CORPORATE RECOVERY KEY PUBLISHED by {Officer}, ceremony {SetupId}. Every vault on this "
        + "server will seal its master key to it on the next write.",
        caller.Value.Email,
        request.SetupId);
    ctx.Response.StatusCode = StatusCodes.Status200OK;
});

// ----- shares -----
app.MapPost("/api/shares", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    var req = await ctx.Request.ReadFromJsonAsync(AppJsonContext.Default.ShareRequest, ct);
    if (req is null || !req.IsValid())
    {
        ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
        await ctx.Response.WriteAsync("Invalid share request.", ct);
        return;
    }
    // Recipient must be in the sender's own domain.
    if (DomainOf(req.ToEmail.ToLowerInvariant()) != DomainOf(caller.Value.Email))
    {
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        await ctx.Response.WriteAsync("Recipient is outside your domain.", ct);
        return;
    }
    if (req.PayloadBytes() > maxShareBytes || req.EntityName.Length > 512)
    {
        ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
        await ctx.Response.WriteAsync($"Share payload exceeds {maxShareBytes} bytes.", ct);
        return;
    }
    if (await store.CountSharesAsync(req.ToEmail.Trim().ToLowerInvariant(), ct) >= maxInboxItems)
    {
        ctx.Response.StatusCode = StatusCodes.Status409Conflict;
        await ctx.Response.WriteAsync("Recipient inbox is full.", ct);
        return;
    }
    // Sender identity is stamped from the VERIFIED token — cannot be forged.
    var item = new ShareItem
    {
        FromEmail = caller.Value.Email,
        FromName = caller.Value.Name,
        ToEmail = req.ToEmail.Trim().ToLowerInvariant(),
        EntityName = req.EntityName,
        EntityKind = req.EntityKind,
        CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        Salt = req.Salt,
        Iv = req.Iv,
        Tag = req.Tag,
        Data = req.Data,
        KdfN = req.KdfN,
        KdfR = req.KdfR,
        KdfP = req.KdfP,
    };
    await store.AppendShareAsync(item.ToEmail, item, ct);
    // The sender's own receipt — no ciphertext, just enough to name what they sent. Without it
    // a share could not be withdrawn at all: the inbox is keyed by the recipient, so the sender
    // had no way to learn the id of the thing waiting there.
    await store.AppendSentAsync(
        item.FromEmail,
        new SentShare
        {
            Id = item.Id,
            ToEmail = item.ToEmail,
            EntityName = item.EntityName,
            EntityKind = item.EntityKind,
            CreatedAt = item.CreatedAt,
        },
        ct);
    log.LogInformation("share {Kind} from {From} to {To}", item.EntityKind, item.FromEmail, item.ToEmail);
    ctx.Response.StatusCode = StatusCodes.Status201Created;
});

app.MapGet("/api/shares", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    // You can read ONLY your own inbox, and one item is live at a time — see
    // WriteJsonArrayAsync for why it is streamed by hand.
    await WriteJsonArrayAsync(
        ctx, store.ListSharesAsync(caller.Value.Email, ct), AppJsonContext.Default.ShareItem, ct);
});

// What YOU have sent and nobody has dealt with yet. Your own actions, told back to you — the
// disclosure the alternative would have needed (scanning every inbox for your name) is exactly
// what this avoids.
app.MapGet("/api/shares/sent", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    ctx.Response.ContentType = "application/json";
    var body = ctx.Response.Body;
    await body.WriteAsync("["u8.ToArray(), ct);
    var first = true;
    await foreach (var receipt in store.ListSentAsync(caller.Value.Email, ct))
    {
        if (!first)
        {
            await body.WriteAsync(","u8.ToArray(), ct);
        }
        first = false;
        await JsonSerializer.SerializeAsync(body, receipt, AppJsonContext.Default.SentShare, ct);
    }
    await body.WriteAsync("]"u8.ToArray(), ct);
});

// Take back something you sent, while it is still pending.
//
// The receipt names the recipient, so the inbox this reaches into is decided by what the SENDER
// once wrote rather than by anything in the request — a caller cannot name someone else's inbox
// here any more than they could before. Already accepted is 409 rather than 404: "there is no
// such share" and "it is beyond recall" are different answers, and only one of them means the
// secret is now somewhere you cannot reach.
app.MapDelete("/api/shares/sent/{id}", async (HttpContext ctx, string id, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    var receipt = await store.ReadSentAsync(caller.Value.Email, id, ct);
    if (receipt is null)
    {
        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }
    var withdrawn = store.DeleteShare(receipt.ToEmail, receipt.Id);
    store.DeleteSent(caller.Value.Email, receipt.Id);
    if (!withdrawn)
    {
        ctx.Response.StatusCode = StatusCodes.Status409Conflict;
        await ctx.Response.WriteAsync("Already accepted or declined — it can no longer be withdrawn.", ct);
        return;
    }
    log.LogInformation("withdrew share from {From} to {To}", caller.Value.Email, receipt.ToEmail);
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
});

app.MapDelete("/api/shares/{id}", async (HttpContext ctx, string id) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    ctx.Response.StatusCode = store.DeleteShare(caller.Value.Email, id)
        ? StatusCodes.Status204NoContent
        : StatusCodes.Status404NotFound;
});

// Tell the DewFlow editor panel where this instance ended up, so a locally running
// server shows up beside the family's other hosts instead of being invisible. Opt-out
// for a container, where a per-user profile file helps nobody.
if (config.GetValue("Vault:PublishInstanceFile", true))
{
    app.Lifetime.ApplicationStarted.Register(() =>
    {
        // Read AFTER the server has bound: before that the address is a wish, and with
        // an in-process test server there is no address at all.
        var bound = app.Urls.FirstOrDefault(u => !u.Contains('*') && !u.Contains('+'))
            ?? app.Urls.FirstOrDefault()?.Replace("*", "localhost").Replace("+", "localhost");
        InstanceFile.Publish(bound ?? "");
        if (!string.IsNullOrWhiteSpace(bound))
        {
            log.LogInformation("published this instance to {Path}", InstanceFile.Path);
        }
    });
    app.Lifetime.ApplicationStopping.Register(InstanceFile.Withdraw);
}

try
{
    app.Run();

return 0;
}
catch (Exception ex)
{
    // The last frame before "nobody above me": a startup or shutdown fault must reach the
    // log rather than only the exit code (.claude/rules/shared/common/reliability.md).
    Log.Fatal(ex, "cred-vault-server terminated unexpectedly");
    throw;
}
finally
{
    Log.CloseAndFlush();
}

// Try each configured scheme until one yields a principal (multi-provider).
static async Task<ClaimsPrincipal?> AuthenticateAny(
    HttpContext ctx,
    string? msTenant,
    bool googleEnabled,
    bool localEnabled)
{
    if (!string.IsNullOrWhiteSpace(msTenant))
    {
        var ms = await ctx.AuthenticateAsync("Microsoft");
        if (ms.Succeeded)
        {
            return ms.Principal;
        }
    }
    if (googleEnabled)
    {
        var google = await ctx.AuthenticateAsync("Google");
        if (google.Succeeded)
        {
            return google.Principal;
        }
    }
    if (localEnabled)
    {
        var local = await ctx.AuthenticateAsync("Local");
        if (local.Succeeded)
        {
            return local.Principal;
        }
    }
    return null;
}

static string DomainOf(string email)
{
    var at = email.LastIndexOf('@');
    return at < 0 ? "" : email[(at + 1)..].ToLowerInvariant();
}

static List<string> SplitCsv(string? value) =>
    string.IsNullOrWhiteSpace(value)
        ? []
        : value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

// Exposed for the smoke test.
public partial class Program;
