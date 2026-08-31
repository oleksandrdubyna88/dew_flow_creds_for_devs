namespace CredVaultServer;

/// <summary>
/// The version of the HTTP contract this server speaks, and what to do when a client speaks a
/// different one.
/// </summary>
/// <remarks>
/// <para><b>Why now, before anything is broken.</b> A server is updated by one person on one
/// evening; the extension is updated by everyone on their own schedule, so an old client talking
/// to a new server is the normal state of the world rather than an edge case. Today every shape
/// still matches, which is exactly why this is cheap: the day a response shape changes, the old
/// clients are already in the field and have no way to say what they speak, so there is nothing
/// to detect them with. The version has to exist BEFORE the first breaking change or it never
/// usefully exists at all.</para>
///
/// <para><b>It rides in headers, not in <c>/api/client-config</c>.</b> That endpoint's own
/// documentation argues for having exactly one field and names the slope — the next addition
/// after a useful one is the allowed email domains. A header is better here anyway: every
/// response carries it, so a client learns the server's version from a call it was making, and
/// no new endpoint exists to keep in step.</para>
///
/// <para><b>What a mismatch does, and why.</b> Below <see cref="MinimumSupported"/> the server
/// REFUSES with 426, because serving a client whose expectations it can no longer meet produces
/// a corrupted vault rather than an error message. Above <see cref="Current"/> it SERVES: a
/// newer client knows what it is doing better than an older server does, and its own check
/// against the response header is the right place to decide. Absent or unreadable is served as
/// legacy — every released client sends nothing today, and refusing them would turn a version
/// mechanism into an outage.</para>
/// </remarks>
public static class ContractVersion
{
    /// <summary>What this build speaks. Bump on any change a current client could misread.</summary>
    /// <remarks>
    /// <para><b>2 — a share carries its <c>format</c>.</b> Version 1 dropped the field, so a
    /// sender could not tell a recipient which fields its AAD covered. A client must know which
    /// version it is talking to BEFORE it seals: against a version-1 server it seals with no AAD
    /// at all, because a binding the recipient cannot reconstruct is worse than none. That makes
    /// this the first bump the mechanism was actually built for.</para>
    /// </remarks>
    public const int Current = 2;

    /// <summary>
    /// The default oldest a client may be and still be served.
    /// </summary>
    /// <remarks>
    /// <para>Raised only when an old client would MISREAD something, never merely because a newer
    /// one exists — the value of the mechanism is that it stays quiet until it matters.</para>
    /// <para><b>Configurable (<c>Vault:MinimumClientContract</c>) rather than a constant</b>, for
    /// two reasons. Cutting old clients off is an operational decision an administrator makes on
    /// a Tuesday, not a code change. And while the default equals <see cref="Current"/> the
    /// refusal branch is unreachable through HTTP — a mechanism whose one interesting path cannot
    /// be exercised is the kind that is discovered to be broken on the day it first matters.
    /// With this, a test raises the minimum and drives a real refusal.</para>
    /// </remarks>
    public const int DefaultMinimumSupported = 1;

    /// <summary>Sent by the client on every request, and by the server on every response.</summary>
    public const string Header = "X-Creds-Contract";

    /// <summary>What the server should do about the version a caller claims.</summary>
    public enum Verdict
    {
        /// <summary>Carry on — the versions are compatible, or the caller did not say.</summary>
        Serve,

        /// <summary>The caller is older than this server can honestly answer. 426.</summary>
        TooOld,
    }

    public readonly record struct Decision(Verdict Verdict, int Claimed, string Reason);

    /// <summary>
    /// Judge the header value.
    /// </summary>
    /// <param name="header">The raw <c>X-Creds-Contract</c> value, or null when absent.</param>
    /// <param name="minimumSupported">From <c>Vault:MinimumClientContract</c>.</param>
    public static Decision Judge(string? header, int minimumSupported = DefaultMinimumSupported)
    {
        if (!int.TryParse(header?.Trim(), out var claimed) || claimed <= 0)
        {
            // Absent, blank, or something a proxy mangled. Every client released before this
            // mechanism existed lands here, so it is the ordinary case and not a fault.
            return new Decision(Verdict.Serve, 0, "no version claimed");
        }
        if (claimed < minimumSupported)
        {
            return new Decision(
                Verdict.TooOld,
                claimed,
                $"this server speaks contract {Current} and no longer serves {claimed}; update the extension");
        }
        return new Decision(Verdict.Serve, claimed, "compatible");
    }
}
