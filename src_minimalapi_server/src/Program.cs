using System.Security.Claims;
using System.Threading.RateLimiting;
using CredVaultServer;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Serilog;

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

var store = new VaultStore(dataDir);
builder.Services.AddSingleton(store);

// Hard request-body ceiling (backstop; endpoints also check Content-Length).
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = maxVaultBytes + 64 * 1024);

// Light rate limiting per caller — cheap DoS guard.
//
// The partition key is the VERIFIED caller email (resolved by the middleware that runs
// just before UseRateLimiter), so one noisy account cannot throttle anyone else. Requests
// that carry no valid token have no identity to partition by and fall back to the remote
// address; behind a proxy that is one shared bucket for all of them, which is the correct
// behaviour for anonymous traffic and the wrong one for authenticated traffic.
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

var log = app.Logger;

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
        await ctx.Response.WriteAsJsonAsync(new { error = "internal error" });
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

app.MapGet("/api/health", () =>
{
    try
    {
        var probe = Path.Combine(dataDir, ".health-probe");
        File.WriteAllText(probe, "ok");
        File.Delete(probe);
        return Results.Ok(new { status = "ok", service = "cred-vault-server", storage = "writable" });
    }
    catch (Exception ex)
    {
        log.LogError(ex, "Health probe failed writing to DataDir");
        return Results.Json(
            new { status = "unhealthy", service = "cred-vault-server", storage = "unwritable" },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapGet("/api/whoami", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    var hasVault = await store.ReadVaultAsync(caller.Value.Email, ct) is not null;
    await ctx.Response.WriteAsJsonAsync(
        new WhoAmIDto(caller.Value.Email, caller.Value.Name, hasVault), ct);
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
    log.LogInformation("vault write by {Email} ({Bytes} bytes)", caller.Value.Email, ms.Length);
    // A caller may write ONLY their own vault (email is taken from the token).
    await store.WriteVaultAsync(caller.Value.Email, ms.ToArray(), ct);
    await store.RecordOwnerAsync(caller.Value.Email, ct);
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
});

// ----- delete my own vault + inbox (account removal) -----
app.MapDelete("/api/vault", async (HttpContext ctx) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    store.DeleteEverythingFor(caller.Value.Email);
    log.LogInformation("vault + inbox deleted for {Email}", caller.Value.Email);
    ctx.Response.StatusCode = StatusCodes.Status204NoContent;
});

// ----- team discovery (emails only, same-domain) -----
app.MapGet("/api/team", async (HttpContext ctx) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    var callerDomain = DomainOf(caller.Value.Email);
    var members = store.ListVaultOwners()
        .Where(e => DomainOf(e) == callerDomain)
        .Select(e => new TeamMemberDto(e))
        .ToList();
    await ctx.Response.WriteAsJsonAsync(members);
});

// ----- shares -----
app.MapPost("/api/shares", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    var req = await ctx.Request.ReadFromJsonAsync<ShareRequest>(ct);
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
    log.LogInformation("share {Kind} from {From} to {To}", item.EntityKind, item.FromEmail, item.ToEmail);
    ctx.Response.StatusCode = StatusCodes.Status201Created;
});

app.MapGet("/api/shares", async (HttpContext ctx, CancellationToken ct) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    // You can read ONLY your own inbox. Streamed item-by-item — see ListSharesAsync.
    ctx.Response.ContentType = "application/json";
    await ctx.Response.WriteAsJsonAsync(store.ListSharesAsync(caller.Value.Email, ct), ct);
});

app.MapDelete("/api/shares/{id}", async (HttpContext ctx, string id) =>
{
    var caller = RequireCaller(ctx);
    if (caller is null) return;
    ctx.Response.StatusCode = store.DeleteShare(caller.Value.Email, id)
        ? StatusCodes.Status204NoContent
        : StatusCodes.Status404NotFound;
});

try
{
    app.Run();
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
