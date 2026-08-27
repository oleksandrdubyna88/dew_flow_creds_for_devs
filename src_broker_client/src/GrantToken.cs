namespace CredsBroker;

/// <summary>
/// The <c>&lt;port&gt;.&lt;secret&gt;</c> a share hands out, parsed.
/// </summary>
/// <remarks>
/// <para>The whole of broker discovery lives in this string, deliberately: there is no services
/// file to find, go stale, or be read by something that should not. A token names the window
/// that minted it and authorizes exactly one entity there. The port half is not a secret and is
/// never used for authorization — the broker authorizes on the secret alone.</para>
/// <para><b>This mirrors <c>grantToken.ts</c> exactly, and the details matter.</b> The secret is
/// base64url with no padding, so its charset is <c>[A-Za-z0-9_-]</c> and there is no minimum
/// length; the port is decimal digits only. A first draft here used
/// <c>int.TryParse</c> and invented a minimum secret length, which would have refused tokens the
/// extension considers valid and accepted <c>" +80"</c>, which it does not — drift of exactly the
/// kind the generated contract exists to prevent, in the one field that decides where a bearer
/// secret gets sent.</para>
/// </remarks>
public sealed record GrantToken(int Port, string Secret)
{
    private const int MinPort = 1;
    private const int MaxPort = 65535;

    public static GrantToken? Parse(string? raw)
    {
        if (raw is null)
        {
            return null;
        }

        var dot = raw.IndexOf('.');
        if (dot <= 0 || dot == raw.Length - 1)
        {
            return null;
        }

        var portText = raw[..dot];
        var secret = raw[(dot + 1)..];
        if (!IsDigits(portText) || !IsBase64Url(secret))
        {
            return null;
        }

        // Digits-only above, so this can still overflow on an absurdly long run of them.
        return int.TryParse(portText, out var port) && port >= MinPort && port <= MaxPort
            ? new GrantToken(port, secret)
            : null;
    }

    private static bool IsDigits(string value) =>
        value.Length > 0 && value.All(char.IsAsciiDigit);

    private static bool IsBase64Url(string value) =>
        value.Length > 0 && value.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-');
}
