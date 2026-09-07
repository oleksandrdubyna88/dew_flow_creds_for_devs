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

// `--create-archive`, `--verify-archive` and `--decrypt-archive` take, check and open a backup with
// this same binary. The moment anyone needs them is the moment a server is gone, so the recovery kit
// is the image and the key — not a second tool somebody has to find. Intercepted here for the same
// reason the health probe is. `Handles` owns the list of verbs, so adding one never needs a change
// here; a reviewer reading only this comment mistook it for the list and reported the create verb as
// unrouted, which is why the comment now names all three.
if (BackupArchiveCommand.Handles(args))
{
    return BackupArchiveCommand.Run(args);
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
// caller rather than to officers only. See OrgRecovery.cs and research/PLAN_org_recovery.md.
var orgRecovery = OrgRecoveryConfig.Read(
    SplitCsv(config["Vault:CorpRecovery:OfficerEmails"]),
    config.GetValue("Vault:CorpRecovery:Threshold", 2));
// The key this deployment seals developers' login keys under, base64 of 32 bytes. Empty or malformed
// disables ONE route and nothing else — the officer roster taught this lesson the expensive way
// (module_server.md): refusing to boot over an optional feature took ordinary vault sync down for
// everyone. What must hold instead of availability is narrower: no wrap is ever bound to a key this
// server cannot reproduce, which is a fingerprint check in the client, not a boot refusal.
var loginKeyKek = LoginKeyKek.Read(config["Vault:LoginKey:Kek"]);
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
// Bytes, not requests (roadmap E1): a full vault costs as much as it weighs. Eight of them per
// ten minutes per caller by default; the ninth waits for the window.
var byteBudget = new ByteBudget(
    config.GetValue("Vault:RateLimit:BytesPerWindow", 64L * 1024 * 1024),
    TimeSpan.FromSeconds(config.GetValue("Vault:RateLimit:ByteWindowSeconds", 600)));
// A good health verdict is served from memory this long; a bad one is never cached (item 6).
var healthCache = new HealthCache(TimeSpan.FromSeconds(config.GetValue("Vault:HealthCacheSeconds", 5)));
var allowNetworkDataDir = config.GetValue(DataDirCheck.OverrideKey, false);
// Process-lifetime counters for the officers' metrics page (item 5).
var metrics = new ServerMetrics(DateTimeOffset.UtcNow);

// Writable is not enough: the store's durability is atomic rename, which a network filesystem
// does not promise (item 2). Refused here, before a single blob depends on it.
var networkRefusal = DataDirCheck.Judge(
    dataDir,
    allowNetworkDataDir,
    () => File.Exists("/proc/mounts") ? File.ReadAllText("/proc/mounts") : null);
if (networkRefusal is not null)
{
    throw new InvalidOperationException(networkRefusal);
}

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
    TimeSpan.FromDays(Math.Max(1, shareMaxAgeDays)),
    // The log, so an expiry leaves a row. Only on a corporate deployment: a personal one has no org/
    // tree and must never grow one — the sweep runs on every deployment there is.
    orgRecovery.Enabled ? sp.GetRequiredService<OrgEventLog>() : null));

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

// The members registry, the runtime settings and the event log — on EVERY deployment, because the
// routes that read them exist on every deployment and answer "corp mode off" from the same code.
// Nothing here may create their directories: each appears on its first write (OrgMembersStore says
// why), and an `org/` on a personal server would tell an operator looking at the disk that this
// server has a roster when it has none. Registered rather than constructed, unlike the stores above:
// these take an ILogger<T>, and the logger factory exists only after Build().
builder.Services.AddSingleton(sp => new OrgMembersStore(
    dataDir, sp.GetRequiredService<ILoggerFactory>().CreateLogger<OrgMembersStore>()));
builder.Services.AddSingleton(sp => new OrgSettingsStore(
    dataDir, sp.GetRequiredService<ILoggerFactory>().CreateLogger<OrgSettingsStore>()));
builder.Services.AddSingleton(sp => new OrgEventLog(
    dataDir, sp.GetRequiredService<ILoggerFactory>().CreateLogger<OrgEventLog>(), () => DateTimeOffset.UtcNow));
// Custody of the developers' login keys. Registered on EVERY deployment, personal ones included, and
// with whatever KEK the configuration holds — including none: deleting a key is not decryption, so
// DELETE /api/vault must be able to remove one on a server that can no longer issue any.
// The projects a company runs. Registered on every deployment, like the other org stores: the
// tree under org/ appears on the first WRITE, so a personal server grows none.
builder.Services.AddSingleton(sp => new OrgProjectsStore(
    dataDir, sp.GetRequiredService<ILoggerFactory>().CreateLogger<OrgProjectsStore>()));
builder.Services.AddSingleton(sp => new LoginKeyStore(
    dataDir, loginKeyKek, sp.GetRequiredService<ILoggerFactory>().CreateLogger<LoginKeyStore>()));

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
// Counted once the status is known, whatever produced it — the limiter's 429 included.
app.Use(async (ctx, next) =>
{
    await next();
    metrics.Record(ctx.Response.StatusCode, ctx.Request.Method, ctx.Request.Path);
});

var log = app.Logger;
var runtimeSupport = RuntimeSupport.Describe(Environment.Version, DateOnly.FromDateTime(DateTime.UtcNow));
if (runtimeSupport.Urgent)
{
    log.LogWarning("runtime: {Line}", runtimeSupport.Line);
}
else
{
    log.LogInformation("runtime: {Line}", runtimeSupport.Line);
}
var serverVersion = typeof(Program).Assembly
    .GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
    .OfType<System.Reflection.AssemblyInformationalVersionAttribute>()
    .FirstOrDefault()?.InformationalVersion ?? typeof(Program).Assembly.GetName().Version?.ToString(3) ?? "unknown";

// The corporate stores, resolved once the factory exists, and the one record the corporate routes
// take. RequireCaller and DomainOf are local functions below and cross into OrgEndpoints.cs only as
// delegates — the gates stay in this file, so it still answers "who may do this".
var orgMembers = app.Services.GetRequiredService<OrgMembersStore>();
var orgProjects = app.Services.GetRequiredService<OrgProjectsStore>();
var orgDeps = new OrgEndpointDeps(
    RequireCaller,
    RequireAdminAsync,
    DomainOf,
    orgRecovery,
    orgMembers,
    app.Services.GetRequiredService<OrgSettingsStore>(),
    app.Services.GetRequiredService<OrgEventLog>(),
    // The same instance the share endpoints close over: blocking withdraws pending shares from it.
    store,
    app.Services.GetRequiredService<LoginKeyStore>(),
    // The name a project id resolves to, for the assignments /api/org/me answers. A function
    // rather than the store: this surface reads names and never writes projects.
    orgProjects.NameOf,
    allowAnyDomain,
    log,
    ContractVersion.Current);

// The contract version, decided before authentication so a client too old to be served is told
// THAT rather than being handed a 401 about a token that was never the problem. Every response
// carries the server version, so a client learns it from a call it was already making.
//
// The minimum applied is the EFFECTIVE one: in corp mode it is floored at the contract from which
// the role-and-policy document exists (3). A client below it does not know GET /api/org/me is
// there, so on a server with a policy it obeys none of it, and serving it would hide that from
// whoever deployed the server. Math.Max, so an operator's higher minimum stands; personal mode is
// the configured value and nothing else, exactly as before.
var effectiveMinimumContract = ContractVersion.MinimumFor(minimumClientContract, orgRecovery.Enabled);
var corpFloorReason = orgRecovery.Enabled ? ContractVersion.CorpFloorReason : null;
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers[ContractVersion.Header] = ContractVersion.Current.ToString();
    var decision = ContractVersion.Judge(
        ctx.Request.Headers[ContractVersion.Header], effectiveMinimumContract, corpFloorReason);
    if (decision.Verdict == ContractVersion.Verdict.TooOld)
    {
        // The corporate surface promises a JSON {error} on every refusal, and this is the one refusal
        // that runs before any of its endpoints: a contract-2 client asking for /api/org/me otherwise
        // got a plain sentence the admin UI cannot parse, at the moment it needs to show why. Every
        // older route keeps its plain text byte for byte — /api/org-recovery/* included, which shares
        // a prefix and none of the shape; StartsWithSegments matches whole segments, so it stays out.
        if (ctx.Request.Path.StartsWithSegments("/api/org"))
        {
            await OrgEndpoints.FailJson(ctx, StatusCodes.Status426UpgradeRequired, decision.Reason);
            return;
        }
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
else if (orgRecovery.Misconfiguration.Length > 0)
{
    // The server starts anyway. Corporate recovery is one optional feature among many, and
    // refusing to boot over a typo in its roster stops ordinary vault sync for everybody —
    // an outage caused by the safety check, on a server where nothing was enrolled yet.
    // At Error, not Warning: unlike the empty default this is a setting somebody wrote and
    // is entitled to believe is working.
    log.LogError("CORPORATE RECOVERY IS OFF: {Reason}", orgRecovery.Misconfiguration);
}
// The login-key KEK, same discipline: at Error when something is wrong, silent when a personal server
// simply never wanted the feature, and never a reason to refuse to start.
var kekComplaint = LoginKeyKek.Complaint(config["Vault:LoginKey:Kek"], orgRecovery.Enabled);
if (kekComplaint.Length > 0)
{
    log.LogError("LOGIN KEYS ARE OFF: {Reason}", kekComplaint);
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

// Authorize the caller resolved above: 401 with no identity, 403 outside the domain — and, in corp
// mode, the blocking gate: 403 with X-Creds-Reason for a person whose record says `active: false`,
// 503 with Retry-After for a record this build cannot read. CallerStanding.Decide holds the five
// branches and the reasons; this applies them.
//
// INSIDE this function rather than beside it, deliberately. Every endpoint opens with RequireCaller —
// RequireOfficer, RequireAdminAsync and the corporate routes' own wrapper included — so one edit here
// covers every call site, and a route added tomorrow is covered by opening the way every route does.
// A sibling gate would have meant converting seventeen call sites by hand, which is "a measure
// applied at some of the sites that need it": the class of defect this repository keeps finding
// (security.md). Find is synchronous and answered from a stat-checked cache, so the gate stays
// synchronous and costs microseconds; the rate limiter is untouched and still partitions on the
// email before this runs, so a blocked caller's retries punish nobody else.
(string Email, string? Name)? RequireCaller(HttpContext ctx)
{
    var email = TokenIdentity.Email(ctx.User);
    if (email is null)
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return null;
    }
    if (!DomainServed(email))
    {
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        return null;
    }
    return RefusedByStanding(ctx, email) ? null : (email, TokenIdentity.Name(ctx.User));
}

bool DomainServed(string email) => allowAnyDomain || TokenIdentity.DomainAllowed(email, allowedDomains);

// The status and the header for the two refusals; the decision is CallerStanding.Decide's. No body on
// either, because the older routes answer their 401 and 403 with none — the corporate surface adds its
// JSON sentence in RequireOrgCallerAsync, which reads the status and the header set here.
bool RefusedByStanding(HttpContext ctx, string email)
{
    switch (StandingOf(email))
    {
        case Standing.Deactivated:
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            ctx.Response.Headers[CallerStanding.ReasonHeader] = CallerStanding.AccountDeactivated;
            return true;
        case Standing.Unavailable:
            // The same 503 and Retry-After the corporate surface answers for the same file.
            Unavailable(ctx);
            return true;
        default:
            return false;
    }
}

// The one shape for "a record exists and this build cannot read it", so the caller gate, the recipient
// rule below and the corporate surface cannot drift into three slightly different answers.
static void Unavailable(HttpContext ctx)
{
    ctx.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
    ctx.Response.Headers.RetryAfter =
        OrgEndpoints.UnavailableRetryAfterSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
}

// The RECIPIENT half of blocking, which the caller gate cannot cover: it judges whoever is calling, and
// a share is addressed to somebody else. Without this a colleague who types the address — a blocked
// person is hidden from /api/team, not from a client's memory — drops material into an inbox its owner
// is refused at, where it waits out the 31-day prune and becomes readable on the day they are
// re-admitted. Fail-closed on an unreadable record for the gate's own reason: one corrupt file must not
// deliver to somebody who may be blocked.
//
// No X-Creds-Reason on either answer. That header tells a client to lock ITS OWN account and purge its
// key material, and this response is about somebody else's standing — an honest client that matched it
// here would lock the innocent sender out of their vault.
async Task<bool> RecipientRefused(HttpContext ctx, string recipient, CancellationToken ct)
{
    switch (StandingOf(recipient))
    {
        case Standing.Deactivated:
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            await ctx.Response.WriteAsync("Recipient's account has been deactivated.", ct);
            return true;
        case Standing.Unavailable:
            Unavailable(ctx);
            await ctx.Response.WriteAsync("The recipient's account cannot be checked right now; try again shortly.", ct);
            return true;
        default:
            return false;
    }
}

// The registry is consulted only on the branch that needs it — the lookup is the lambda — so a personal
// server, and an officer on any server, never stat a record: personal mode stays byte-identical, and the
// break-glass quorum cannot be locked out by its own records.
Standing StandingOf(string email) =>
    CallerStanding.Decide(orgRecovery.Enabled, orgRecovery.IsOfficer(email), () => orgMembers.Find(email));

// Epic 3's project boundary — the one rule of that epic the server enforces rather than asks an honest
// client to obey. The decision itself is a pure truth table (ShareRule); this gathers the facts and
// applies the answer, which is the same division CallerStanding/RequireCaller already uses.
//
// A personal server reads NOTHING: the guard returns before a single record is stat-ed, so personal mode
// stays byte-identical whatever a leftover org/ tree holds. An officer is decided by configuration, and
// their record is never read either.
async Task<bool> ProjectShareRefused(HttpContext ctx, string sender, ShareRequest req, CancellationToken ct)
{
    if (!orgRecovery.Enabled || orgRecovery.IsOfficer(sender))
    {
        return false;
    }
    var decision = ShareRule.Decide(new ShareRuleFacts(
        CorpMode: true,
        SenderIsOfficer: false,
        Sender: orgMembers.Find(sender),
        ProjectId: req.ProjectId,
        // Invoked only if a developer's share gets that far: an ordinary member's POST must not pay
        // for three registry reads to reach a branch that consults none of them — and the recipient's
        // record was already read by the gate one line above.
        Project: () => ShareRule.NamesAProject(req.ProjectId) ? orgProjects.Find(req.ProjectId!.Trim()) : ProjectResult.Absent,
        Recipient: () => orgMembers.Find(req.ToEmail.Trim().ToLowerInvariant())));
    if (decision.Verdict == ShareVerdict.Allow)
    {
        return false;
    }
    if (decision.Verdict == ShareVerdict.Unavailable)
    {
        Unavailable(ctx);
        await ctx.Response.WriteAsync(decision.Message, ct);
        return true;
    }
    // No X-Creds-Reason, for RecipientRefused's reason: that header tells a client to lock its own
    // account and purge key material, and this refusal is about one share, not about who is calling.
    await Fail(ctx, StatusCodes.Status403Forbidden, decision.Message);
    return true;
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
    // Still a real probe — a health check that cannot see a full or detached volume is the
    // constant the reliability rule warns against — but a good verdict is served from memory for
    // a few seconds, and a bad one is re-probed on every call (item 6).
    var ok = healthCache.Check(() =>
    {
        try
        {
            var probe = Path.Combine(dataDir, ".health-probe");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            log.LogError(ex, "Health probe failed writing to DataDir");
            return false;
        }
    }, DateTimeOffset.UtcNow);
    return ok
        ? Results.Json(new HealthDto("ok", "cred-vault-server", "writable"), AppJsonContext.Default.HealthDto)
        : Results.Json(
            new HealthDto("unhealthy", "cred-vault-server", "unwritable"),
            AppJsonContext.Default.HealthDto,
            statusCode: StatusCodes.Status503ServiceUnavailable);
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
    // The byte budget (E1): charged only when the write goes ahead, so a refusal costs nothing.
    var (allowed, retryAfter) = byteBudget.TryConsume(caller.Value.Email, ms.Length, DateTimeOffset.UtcNow);
    if (!allowed)
    {
        metrics.RateLimited();
        ctx.Response.Headers.RetryAfter = retryAfter.ToString();
        ctx.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await ctx.Response.WriteAsync(
            $"Vault writes are limited to {byteBudget.BytesPerWindow} bytes per {byteBudget.Window.TotalSeconds:0} seconds; try again in {retryAfter} s.", ct);
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
    metrics.VaultWritten(ms.Length);
    await store.RecordOwnerAsync(caller.Value.Email, ct);
    // The registry's sibling of the sidecar above: corp mode only, idempotent, and it can never fail
    // this response — the vault has already landed, and a 500 over a vault that was in fact stored is
    // a worse failure than an unregistered person, whom the next sync registers anyway.
    //
    // Inside it the record is written and THEN the member.registered row appended, so a crash between
    // the two costs one row and never produces a duplicate: the row rides on `Created`, which the
    // store computes inside the per-member lock, and every later sync finds the record.
    await OrgEndpoints.RegisterOnSyncAsync(orgDeps, caller.Value.Email, ct);
    ctx.Response.Headers.ETag = VaultStore.ETagFor(content);
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
});

// ----- delete my own vault + inbox (account removal) -----
app.MapDelete("/api/vault", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    store.DeleteEverythingFor(caller.Value.Email);
    // The registry record goes with the vault, so the registry cannot outgrow the people it describes.
    // Not gated on corp mode: a record left behind by a roster since removed is still one to remove,
    // and where no org/ exists this is one stat and nothing else.
    //
    // Vault first, then the record — and the vault decides the response. RemoveAsync swallows a lock or
    // a permission itself (logging at Error, naming the person), so a registry the OS will not let us
    // touch cannot turn a delete that happened into a 500. The surviving state is a record with no
    // vault: the admin list shows it, and the next DELETE or an admin removes it.
    //
    // CancellationToken.None on purpose. The vault is already gone, so the removal is owed whether or
    // not the client is still listening: a disconnect that cancelled the wait would leave that record
    // behind AND throw out of a handler whose work had already happened — watched, with the lock held
    // by a test. What this makes uncancellable is one per-member lock held for a stat and an unlink.
    await orgMembers.RemoveAsync(caller.Value.Email, CancellationToken.None);
    // The login key goes LAST, and the order is the whole design here rather than a detail. A crash
    // between two of these steps leaves something behind either way, and the two leftovers are not
    // equally bad: a key that outlives its vault is 300 bytes of ciphertext nobody can use, while a
    // vault that outlives its key is a vault nobody can OPEN. So the key is removed only once there is
    // no vault left for it to belong to. Not gated on corp mode, for the reason the record above is
    // not: where no org/ exists this is one stat. RemoveAsync logs at Error and answers false rather
    // than throwing, so a file the OS will not unlink cannot turn a deletion that happened into a 500.
    await app.Services.GetRequiredService<LoginKeyStore>().RemoveAsync(caller.Value.Email, CancellationToken.None);
    log.LogInformation("vault + inbox deleted for {Email}", caller.Value.Email);
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
});

// ----- team discovery (emails only, same-domain) -----
app.MapGet("/api/team", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    var callerDomain = DomainOf(caller.Value.Email);
    // ONE read per person for the whole request. The discoverability pass reads each record through
    // StandingOf, and the roster below reads it again for the role and the projects — two parses of the
    // same file per colleague, per request, to answer one question about them.
    var seen = new Dictionary<string, MemberLookupResult>(StringComparer.Ordinal);
    MemberLookupResult Remember(string email) =>
        seen.TryGetValue(email, out var known) ? known : seen[email] = orgMembers.Find(email);
    var discoverable = store.ListVaultOwners()
        .Where(e => DomainOf(e) == callerDomain)
        .Where(e => IsDiscoverable(orgRecovery.Enabled, orgRecovery.IsOfficer(e), () => Remember(e)))
        .ToList();
    await WriteTeamAsync(ctx, caller.Value.Email, discoverable, Remember, ct);
});

// Two things happen here, and they are gated on DIFFERENT questions — which is the clarification the
// plan round earned, because the plan had them as one.
//
//   * The FILTER is about the caller's role. A developer is offered the colleagues they share a project
//     with, and nobody else: a client that proposes a recipient the share rule will refuse is a client
//     that teaches people the feature is broken. It applies whatever the caller claims, header or none.
//   * The SHAPE is about the caller's contract. A header-less client is served even on a corp server
//     (ContractVersion.Judge serves an absent claim), and a test pins its rows as byte-identical to
//     personal mode's — so the wider row travels only to a caller that says it speaks contract 3.
//
// Personal mode consults nothing at all and returns exactly what it always did.
async Task WriteTeamAsync(
    HttpContext ctx,
    string caller,
    List<string> discoverable,
    Func<string, MemberLookupResult> find,
    CancellationToken ct)
{
    if (!orgRecovery.Enabled)
    {
        await ctx.Response.WriteAsJsonAsync(
            discoverable.Select(e => new TeamMemberDto(e)).ToList(),
            AppJsonContext.Default.ListTeamMemberDto,
            cancellationToken: ct);
        return;
    }
    var rows = TeamRoster.For(
        caller,
        orgRecovery.IsOfficer(caller),
        discoverable,
        find,
        // Open = it exists and is not archived. The same question ShareRule asks of the same store, so
        // the picker cannot offer a recipient the share rule will then refuse.
        id => orgProjects.Find(id) is { Status: ProjectLookup.Found, Record.Archived: false });
    if (ContractVersion.Judge(ctx.Request.Headers[ContractVersion.Header]).Claimed < ContractVersion.OrgPolicyContract)
    {
        await ctx.Response.WriteAsJsonAsync(
            rows.Select(r => new TeamMemberDto(r.Email)).ToList(),
            AppJsonContext.Default.ListTeamMemberDto,
            cancellationToken: ct);
        return;
    }
    await ctx.Response.WriteAsJsonAsync(rows, AppJsonContext.Default.ListTeamMemberDetailDto, cancellationToken: ct);
}

// Filtered, not replaced — and by the caller gate's OWN decision, not a second reading of the record.
// A colleague the gate would refuse — blocked, or a record this build cannot read — is not offered as
// a recipient, because a share to them would wait in an inbox nobody can open, and "unreadable" must
// never read as "fine" (the escalation the plan round found). One rule in one place: this used to be
// a private three-arm switch of its own, which is how a gate and a filter come to disagree about the
// same person. Personal mode consults nothing and stays byte-identical.
//
// The lookup is a PARAMETER since epic 3: the roster built from this list reads the same records
// again for the role and the projects, so the route hands both passes one memoized reader rather
// than parsing every colleague's file twice per request.
static bool IsDiscoverable(bool corpMode, bool isOfficer, Func<MemberLookupResult> find) =>
    CallerStanding.Decide(corpMode, isOfficer, find) == Standing.Admitted;

// The corporate surface, mapped from its own file — Program.cs is past the size ceiling and four
// more epics add about twenty routes. The gates stay above; only routes live there.
app.MapOrgEndpoints(orgDeps);
// The project surface, from its own file for the reason the corporate one is: this file is past
// the size a reader can hold, and each epic adds routes.
app.MapOrgProjectsEndpoints(orgDeps, orgProjects);
// The event log's reader, from its own file for the same reason. Any allowed caller; the SCOPE
// is decided there, from the same record RequireAdminAsync reads.
app.MapOrgEventsEndpoints(orgDeps);

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
// Who may administer, and it is deliberately TWO answers to one question. An officer passes
// unconditionally: the roster is the operator's own list, an officer cannot be given a registry role
// (the 409 on the upsert), and a deployment whose officers could not administer would need a second
// list to say who can. Everybody else passes only by their record saying so.
//
// Every refusal is the SAME 403 — not an admin, never registered, corp mode off, and a record this
// build cannot read. RequireOfficer's doctrine, for its reason: telling a caller WHICH fact failed
// hands them the roster's shape for free. The unreadable case is the one worth naming: a record the
// server cannot parse is not a person whose standing it may guess, and guessing would mean the
// computed default, which is a member — one gate later, the same escalation the plan round found.
//
// It writes its own body, unlike RequireOfficer: this surface promises a JSON reason, and an empty
// 403 is not one.
async Task<(string Email, string? Name)?> RequireAdminAsync(HttpContext ctx)
{
    var caller = await OrgEndpoints.RequireOrgCallerAsync(ctx, RequireCaller);
    if (caller is null)
    {
        return null;
    }
    if (orgRecovery.Enabled
        && (orgRecovery.IsOfficer(caller.Value.Email)
            || orgMembers.Find(caller.Value.Email) is { Status: MemberLookup.Found, Record.Role: MemberRole.Admin }))
    {
        return caller;
    }
    await OrgEndpoints.FailJson(
        ctx,
        StatusCodes.Status403Forbidden,
        "This deployment does not let you administer its people.");
    return null;
}

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

// The officers' metrics page (item 5, the owner's shape): one JSON document for a human, read
// through the extension, for whoever is on the recovery roster — whether or not the ceremony
// has run. Officer-only for the same reason the ceremony is: whoever can read the server's
// load and disk is whoever the operator named.
app.MapGet("/api/metrics", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return;
    await ctx.Response.WriteAsJsonAsync(
        metrics.Snapshot(store, dataDir, DateTimeOffset.UtcNow, serverVersion, runtimeSupport),
        AppJsonContext.Default.MetricsDto,
        cancellationToken: ct);
});

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
    // Record what this ceremony IS before relaying anything for it. Without a record, the
    // publish guard below has nothing to ask its question about: "is anybody still pending?"
    // can only be answered from invites that exist, so a ceremony nobody ever ran had nobody
    // pending and published unopposed.
    await orgStore.NoteInvitedAsync(
        request.SetupId, caller.Value.Email, request.ToEmail.Trim().ToLowerInvariant(), ct);
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
    // Three questions the "nobody pending" test cannot answer on its own, in the order a
    // forged publish would fail them.
    var ceremony = await orgStore.ReadCeremonyAsync(request.SetupId, ct);
    if (ceremony is null)
    {
        await Fail(
            ctx,
            StatusCodes.Status409Conflict,
            "There is no such ceremony on this server — a key may only be published for one it saw run.");
        return;
    }
    if (ceremony.InitiatorEmail != caller.Value.Email)
    {
        // Otherwise a second officer waits for somebody else's ceremony to complete and
        // publishes THEIR key against its legitimately-assembled quorum.
        await Fail(ctx, StatusCodes.Status409Conflict, "You did not run that ceremony.");
        return;
    }
    if (ceremony.Invited.Count < orgRecovery.OfficerEmails.Count)
    {
        await Fail(
            ctx,
            StatusCodes.Status409Conflict,
            $"That ceremony invited {ceremony.Invited.Count} of {orgRecovery.OfficerEmails.Count} officers.");
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

// ----- break-glass: a quorum opening one vault whose owner is gone -----

/// <summary>
/// The gate on the ONE place this server hands somebody a vault that is not theirs.
///
/// <para>Three conditions, all of them necessary: the caller is the officer who STARTED this
/// session (not merely an officer), the session is still open, and the quorum has actually
/// contributed. Read and write share the gate because a recovery that may read must also be
/// the one that writes the re-keyed result back — splitting them would let one caller open a
/// vault and another replace it.</para>
/// </summary>
async Task<RecoverySession?> RequireReadySession(HttpContext ctx, string id, CancellationToken ct)
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return null;
    var session = await orgStore.ReadSessionAsync(id, ct);
    if (session is null || session.InitiatorEmail != caller.Value.Email)
    {
        // Not "403 you are not the initiator": an officer who is not this session's initiator
        // has no business learning that this session exists, or whose vault it is about.
        await Fail(ctx, StatusCodes.Status404NotFound, "No such recovery session.");
        return null;
    }
    if (session.Status != "open")
    {
        await Fail(ctx, StatusCodes.Status409Conflict, "That recovery session is finished.");
        return null;
    }
    if (session.Contributions.Count < orgRecovery.Threshold)
    {
        await Fail(
            ctx,
            StatusCodes.Status409Conflict,
            $"{session.Contributions.Count} of {orgRecovery.Threshold} officers have contributed.");
        return null;
    }
    return session;
}

static RecoverySessionDto SessionView(RecoverySession session, int threshold) =>
    new(
        session.SessionId,
        session.InitiatorEmail,
        session.TargetEmail,
        session.SessionPublicKey,
        session.Status,
        threshold,
        session.Contributions.Count,
        [.. session.Contributions.Select(c => c.OfficerEmail)],
        session.StartedAt,
        session.ExpiresAt,
        session.Contributions);

app.MapPost("/api/org-recovery/sessions", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return;
    var setup = await orgStore.ReadSetupAsync(ct);
    if (setup is null)
    {
        await Fail(ctx, StatusCodes.Status409Conflict, "No corporate recovery key has been published.");
        return;
    }
    var request = await ctx.Request.ReadFromJsonAsync(AppJsonContext.Default.StartSessionRequest, ct);
    if (request is null || !request.IsValid())
    {
        await Fail(ctx, StatusCodes.Status400BadRequest, "Malformed recovery session request.");
        return;
    }
    // Recovering somebody on another tenant is not a thing this server can be asked to do.
    if (!allowAnyDomain && DomainOf(request.TargetEmail) != DomainOf(caller.Value.Email))
    {
        await Fail(ctx, StatusCodes.Status403Forbidden, "That account is outside your domain.");
        return;
    }
    var now = DateTimeOffset.UtcNow;
    var session = new RecoverySession
    {
        InitiatorEmail = caller.Value.Email,
        TargetEmail = request.TargetEmail.Trim().ToLowerInvariant(),
        SessionPublicKey = request.SessionPublicKey,
        StartedAt = now.ToUnixTimeMilliseconds(),
        ExpiresAt = now.AddHours(Math.Max(1, orgSetupTtlHours)).ToUnixTimeMilliseconds(),
    };
    await orgStore.WriteSessionAsync(session, ct);
    log.LogWarning(
        "BREAK-GLASS STARTED by {Initiator} for {Target}, session {SessionId}.",
        session.InitiatorEmail,
        session.TargetEmail,
        session.SessionId);
    ctx.Response.StatusCode = StatusCodes.Status201Created;
    await ctx.Response.WriteAsJsonAsync(
        SessionView(session, orgRecovery.Threshold),
        AppJsonContext.Default.RecoverySessionDto,
        cancellationToken: ct);
});

app.MapGet("/api/org-recovery/sessions/{id}", async (HttpContext ctx, string id, CancellationToken ct) =>
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return;
    var session = await orgStore.ReadSessionAsync(id, ct);
    if (session is null)
    {
        await Fail(ctx, StatusCodes.Status404NotFound, "No such recovery session.");
        return;
    }
    await ctx.Response.WriteAsJsonAsync(
        SessionView(session, orgRecovery.Threshold),
        AppJsonContext.Default.RecoverySessionDto,
        cancellationToken: ct);
});

app.MapPost("/api/org-recovery/sessions/{id}/contribute", async (HttpContext ctx, string id, CancellationToken ct) =>
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return;
    var session = await orgStore.ReadSessionAsync(id, ct);
    if (session is null || session.ExpiresAt < DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
    {
        await Fail(ctx, StatusCodes.Status404NotFound, "No such recovery session, or it has expired.");
        return;
    }
    if (session.Status != "open")
    {
        await Fail(ctx, StatusCodes.Status409Conflict, "That recovery session is finished.");
        return;
    }
    var request = await ctx.Request.ReadFromJsonAsync(AppJsonContext.Default.ContributeRequest, ct);
    if (request is null || !request.IsValid() || request.PayloadBytes() > maxShareBytes)
    {
        await Fail(ctx, StatusCodes.Status400BadRequest, "Malformed contribution.");
        return;
    }
    // Upsert by officer: contributing twice is a person retrying, not a second vote, and
    // counting it twice would let one officer alone satisfy a threshold of two.
    var others = session.Contributions.Where(c => c.OfficerEmail != caller.Value.Email).ToList();
    others.Add(new SessionContribution
    {
        OfficerEmail = caller.Value.Email, // stamped, never from the body
        ShareIndex = request.ShareIndex,
        ContributedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        EphemeralPublicKey = request.EphemeralPublicKey,
        Salt = request.Salt,
        Iv = request.Iv,
        Tag = request.Tag,
        Data = request.Data,
    });
    await orgStore.WriteSessionAsync(session with { Contributions = others }, ct);
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
});

app.MapGet("/api/org-recovery/sessions/{id}/target-vault", async (HttpContext ctx, string id, CancellationToken ct) =>
{
    var session = await RequireReadySession(ctx, id, ct);
    if (session is null) return;
    var content = await store.ReadVaultAsync(session.TargetEmail, ct);
    if (content is null)
    {
        await Fail(ctx, StatusCodes.Status404NotFound, "That account has no stored vault.");
        return;
    }
    ctx.Response.ContentType = "application/octet-stream";
    ctx.Response.Headers.ETag = VaultStore.ETagFor(content);
    await ctx.Response.Body.WriteAsync(content, ct);
});

app.MapPut("/api/org-recovery/sessions/{id}/target-vault", async (HttpContext ctx, string id, CancellationToken ct) =>
{
    var session = await RequireReadySession(ctx, id, ct);
    if (session is null) return;
    using var buffer = new MemoryStream();
    await ctx.Request.Body.CopyToAsync(buffer, ct);
    var content = buffer.ToArray();
    if (content.Length == 0 || content.Length > maxVaultBytes)
    {
        await Fail(ctx, StatusCodes.Status400BadRequest, "Re-keyed vault is empty or too large.");
        return;
    }
    // Conditional, exactly like an ordinary PUT: the target may still have a machine online
    // and syncing. Break-glass is not a licence to clobber a write that happened while the
    // quorum was being assembled.
    var wrote = await store.TryWriteVaultAsync(
        session.TargetEmail,
        content,
        VaultPrecondition.FromHeaders(ctx.Request.Headers.IfMatch, ctx.Request.Headers.IfNoneMatch),
        ct);
    if (!wrote)
    {
        await Fail(
            ctx,
            StatusCodes.Status412PreconditionFailed,
            "That vault changed while the quorum was being collected — re-read it and re-key again.");
        return;
    }
    // Single-use: the contributions are purged the moment the recovery lands, so a session
    // left lying around is not a standing licence to read that vault again.
    await orgStore.WriteSessionAsync(session with { Status = "completed", Contributions = [] }, ct);
    await orgStore.AppendAuditAsync(
        new AuditEntryDto(
            session.SessionId,
            "vault-recovery",
            session.InitiatorEmail,
            session.TargetEmail,
            [.. session.Contributions.Select(c => c.OfficerEmail)],
            session.StartedAt,
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()),
        ct);
    log.LogWarning(
        "BREAK-GLASS COMPLETED: {Target} recovered by {Initiator} with {Officers}, session {SessionId}.",
        session.TargetEmail,
        session.InitiatorEmail,
        string.Join(", ", session.Contributions.Select(c => c.OfficerEmail)),
        session.SessionId);
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
});

app.MapDelete("/api/org-recovery/sessions/{id}", async (HttpContext ctx, string id, CancellationToken ct) =>
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return;
    var session = await orgStore.ReadSessionAsync(id, ct);
    if (session is null || session.InitiatorEmail != caller.Value.Email)
    {
        await Fail(ctx, StatusCodes.Status404NotFound, "No such recovery session.");
        return;
    }
    orgStore.DeleteSession(id);
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
});

app.MapGet("/api/org-recovery/audit", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireOfficer(ctx);
    if (caller is null) return;
    // Every officer, not only initiators: a recovery nobody else can see is a recovery nobody
    // else can question, and being witnessed is the whole point of a quorum.
    await WriteJsonArrayAsync(ctx, orgStore.ReadAuditAsync(ct), AppJsonContext.Default.AuditEntryDto, ct);
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
    // Blocking's recipient rule, before anything is written: see RecipientRefused.
    if (await RecipientRefused(ctx, req.ToEmail.Trim().ToLowerInvariant(), ct))
    {
        return;
    }
    // Epic 3's project rule, AFTER that one and never re-reading `active`: see ShareRule.
    if (await ProjectShareRefused(ctx, caller.Value.Email, req, ct))
    {
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
        // The normalised kind, never the raw property: a client may omit it or send null, and a
        // null landing in an inbox is dropped by a released extension's own shape check — the
        // recipient then sees an empty inbox rather than an error. See ShareRequest.Kind.
        EntityKind = req.Kind,
        // Carried for every sender and read by nobody here: the rule above has already decided, epic 4
        // logs it, and story 4 binds it into the AAD. Blank becomes absent on the wire — see ShareItem.
        ProjectId = string.IsNullOrWhiteSpace(req.ProjectId) ? null : req.ProjectId.Trim(),
        CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        Salt = req.Salt,
        Iv = req.Iv,
        Tag = req.Tag,
        Data = req.Data,
        KdfN = req.KdfN,
        KdfR = req.KdfR,
        KdfP = req.KdfP,
        // Opaque, and carried for the same reason the scrypt parameters are: the recipient cannot
        // reconstruct the AAD without knowing which fields went into it. Contract 2.
        Format = req.Format,
    };
    await store.AppendShareAsync(item.ToEmail, item, ct);
    // The row goes with the INBOX write, not after both: that write is the durable fact the row is
    // about — the recipient can open it from this moment — and the receipt below is the sender's own
    // copy. A receipt write that fails answers 500 and the client retries, which posts a second share
    // and leaves a second row; both rows are then true, which is the property that matters.
    await RecordShareAsync(OrgEventKinds.ShareSent, item.FromEmail, item.ToEmail, ShareFacts.Of(item));
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
            // Carried so a withdrawal's row can cite the project: those paths hold the receipt, not
            // the inbox item.
            ProjectId = item.ProjectId,
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
    if (receipt.IsWithdrawn)
    {
        // The server already took this one out of the inbox when the recipient was blocked; the receipt
        // stayed only so the sender could read why. Dismissing it is a 204 whatever the inbox says — the
        // branch below would read the missing inbox file as "already accepted" and answer 409, which is
        // the one thing a withdrawn share is not.
        store.DeleteSent(caller.Value.Email, receipt.Id);
        ctx.Response.StatusCode = StatusCodes.Status204NoContent;
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
    // Only on this path: the 404, the 409 and the dismissal of a receipt the SERVER withdrew are not
    // withdrawals by the sender, and the last of them already has a share.withdrawn_blocked row.
    await RecordShareAsync(
        OrgEventKinds.ShareWithdrawn,
        caller.Value.Email,
        receipt.ToEmail,
        ShareFacts.Of(caller.Value.Email, receipt));
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
});

// The recipient deals with a share, and says which way — `?outcome=accepted` or `?outcome=declined`.
//
// The item is READ before it is deleted, because the row needs the entity's name and kind and the
// sender's address, and the inbox file is the only place holding them together; the sent-side path
// above has always read before it deleted, so this is that shape, not a new one. The read and the
// delete are both keyed by the CALLER's own email, so nobody can reach another person's inbox with a
// guessed id — the same property this route has always had.
//
// The row is written only when the delete actually removed the file. Two clients racing the same
// share — a retried request, a second window — both read it, and only one deletes; without that
// check the log would carry two answers for one share, and one of them would be a lie.
//
// An absent or unrecognised outcome is share.unknown, never a refusal: every released client sends
// none, and breaking an inbox over a log field would be the tail wagging the dog.
app.MapDelete("/api/shares/{id}", async (HttpContext ctx, string id, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    var (removed, item) = await store.TakeShareAsync(caller.Value.Email, id, ct);
    if (!removed)
    {
        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
    if (item is null)
    {
        // Deleted, but this build could not read it — a half-written file, or one from a newer server.
        // The share is gone either way; the row would be a fabrication.
        log.LogWarning(
            "share {ShareId} was deleted from {Email}'s inbox and this build could not read it; no row was written",
            id,
            caller.Value.Email);
        return;
    }
    var outcome = ShareOutcome.Of(ctx.Request.Query["outcome"]);
    await RecordShareAsync(
        ShareOutcome.KindFor(outcome), caller.Value.Email, item.FromEmail, ShareFacts.Of(item), outcome);
});

// One share row, appended after the write it records has landed, and never on a personal deployment —
// which has no org/ tree and must not grow one. CancellationToken.None for the reason every other row
// site uses it: the mutation is already durable, so a client that hung up must not cost the trail.
async Task RecordShareAsync(string kind, string actor, string subject, ShareFacts share, string? outcome = null)
{
    if (!orgRecovery.Enabled)
    {
        return;
    }
    await orgDeps.Events.AppendAsync(
        OrgEndpoints.ShareRow(kind, actor, subject, share, outcome), CancellationToken.None);
}

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
