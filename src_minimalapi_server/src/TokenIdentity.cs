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
            var value = user.FindFirstValue(claim);
            if (!string.IsNullOrWhiteSpace(value) && value.Contains('@'))
            {
                return value.Trim().ToLowerInvariant();
            }
        }
        return null;
    }

    public static string? Name(ClaimsPrincipal user)
    {
        foreach (var claim in NameClaims)
        {
            var value = user.FindFirstValue(claim);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }
        return null;
    }

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
