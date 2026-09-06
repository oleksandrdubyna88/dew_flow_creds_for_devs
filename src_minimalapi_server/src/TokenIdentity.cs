using System.Security.Claims;

namespace CredVaultServer;

/// <summary>Reads the verified caller identity out of the JWT claims.</summary>
public static class TokenIdentity
{
    private static readonly string[] EmailClaims =
    [
        "email",
        "preferred_username",
        "upn",
        ClaimTypes.Email,
        ClaimTypes.Name,
    ];

    private static readonly string[] NameClaims = ["name", ClaimTypes.GivenName];

    public static string? Email(ClaimsPrincipal user)
    {
        // Reject a token that explicitly marks its email unverified (Google
        // sets email_verified=false in some tenants). Absent = accept, since
        // Microsoft tokens do not carry this claim.
        if (string.Equals(user.FindFirstValue("email_verified"), "false", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
        foreach (var claim in EmailClaims)
        {
            var value = user.FindFirstValue(claim)?.Trim();
            if (!string.IsNullOrWhiteSpace(value) && value.Contains('@') && IsPrintableIdentity(value))
            {
                return value.ToLowerInvariant();
            }
        }
        return null;
    }

    public static string? Name(ClaimsPrincipal user)
    {
        foreach (var claim in NameClaims)
        {
            var value = user.FindFirstValue(claim);
            if (!string.IsNullOrWhiteSpace(value) && IsPrintableIdentity(value))
            {
                return value;
            }
        }
        return null;
    }

    /// <summary>
    /// The longest address this server will act on — the same 320 the vault store already refuses past
    /// when it reads an owner sidecar. One number in one place, rather than two that can disagree.
    /// </summary>
    private const int MaxIdentityLength = 320;

    /// <summary>
    /// Whether a claim value is something this server can print, store and act on.
    /// </summary>
    /// <remarks>
    /// <para><b>A control character in an identity forges a log line.</b> The email is written into
    /// <c>"vault write by {Email}"</c>, into a registry record, into an audit row and into a share's
    /// stamped sender; a newline in the middle of it puts the rest of the value at the start of a line,
    /// where it reads as an entry the server never wrote — and a timeline the person it describes can
    /// write into is not evidence. Code scanning named it on the corporate log lines, and the fix
    /// belongs HERE rather than at each of them: the next log line would otherwise have to remember,
    /// and "a measure applied at some of the sites that need it" is a class of defect this repository
    /// has shipped more than once.</para>
    /// <para>Trimming is not enough — it only reaches the ends, and the forging character is in the
    /// middle. The claim list above includes <c>preferred_username</c>, <c>upn</c> and the name claim,
    /// which some directories let a person edit, so "the issuer signed it" is not "nobody chose it".</para>
    /// <para>A value that fails is refused, never sanitised into a different one: an identity this
    /// server cannot print is one it will not act under, and quietly rewriting somebody's address is
    /// how a person ends up reading somebody else's vault.</para>
    /// </remarks>
    private static bool IsPrintableIdentity(string value) =>
        value.Length <= MaxIdentityLength && !value.Any(char.IsControl);

    /// <summary>True when the email's domain is on the allow-list (empty = allow any verified caller).</summary>
    public static bool DomainAllowed(string email, IReadOnlyCollection<string> allowedDomains)
    {
        if (allowedDomains.Count == 0)
        {
            return true;
        }
        var at = email.LastIndexOf('@');
        if (at < 0)
        {
            return false;
        }
        var domain = email[(at + 1)..];
        return allowedDomains.Any(d => string.Equals(d, domain, StringComparison.OrdinalIgnoreCase));
    }
}
