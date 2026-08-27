using System.Text.Json;
using CredsBroker;

namespace CredsMcp;

/// <summary>
/// The tool catalog: what an agent may ask this binary to do.
/// </summary>
/// <remarks>
/// <para>One tool so far, and deliberately: <c>creds_list</c> answers level 1 of the ladder —
/// what a person opened to agents, and what may be done with each. The verbs of level 2 (use a
/// credential, replace a secret, create, delete) exist in the broker already but are reached
/// today through routes that are gated by the consent modal alone, not by the per-entry
/// switches. Publishing them here before they honour those switches would mean an agent could
/// use an entry the switches say it may not, which is the one thing this whole design is for.
/// They arrive when the routes do.</para>
/// <para>Every answer is a JSON string rather than a structured object. That keeps the tool
/// schema trivial — no reflection over our own types, which is what an AOT binary with
/// reflection-based JSON turned off wants — and it is what agents read anyway.</para>
/// </remarks>
internal static class Tools
{
    internal const string ListName = "creds_list";

    internal const string ListDescription =
        """
        List the credentials the person has explicitly opened to you in CredsForDevs — SSH hosts,
        databases, VPNs, saved commands and scripts.

        You get the NON-SECRET half of each: name, kind, folder, host, user, port, and for a
        database a connection string with the password removed. You never get a password, a
        private key, a VPN config or a one-time-code seed, and there is no way to ask for one.
        `hasPassword` tells you a password exists so you can say so; it does not tell you what
        it is.

        Everything is invisible until the person turns a switch on for that entry, so an empty
        list means nothing has been opened to you — not that the vault is empty. Each entry's
        `can` says what is allowed beyond looking.
        """;

    /// <summary>
    /// Every visible entry, from every open window, merged.
    /// </summary>
    /// <remarks>
    /// <para>Merged by entry id, keeping the first: windows are asked newest-first, and the same
    /// vault unlocked in two windows would otherwise be listed twice. Two DIFFERENT entries can
    /// share a name — that is what the folder is for — so the id is the only safe key.</para>
    /// <para>Never throws at the caller. A tool that threw would reach the model as a protocol
    /// error with no sentence it can act on; "no window is open" is something a person fixes in
    /// two seconds when the answer says so.</para>
    /// </remarks>
    internal static async Task<string> ListAsync(BrokerContract contract)
    {
        var route = contract.ReadRoute("mcpEntries", "/v1/mcp/entries");
        var bodies = await Windows.ReadAllAsync(contract, route);
        if (bodies.Count == 0)
        {
            return NoWindow();
        }

        return JsonSerializer.Serialize(Merge(bodies), McpJsonContext.Default.McpEntryArray);
    }

    /// <summary>
    /// Several windows' answers, as one list.
    /// </summary>
    /// <remarks>
    /// <para>By entry id, keeping the FIRST. Windows are asked newest-first, and the same vault
    /// unlocked in two windows would otherwise be listed twice — which an agent would read as
    /// two databases where there is one. Two DIFFERENT entries can share a name (that is what
    /// the folder is for), so the id is the only safe key.</para>
    /// <para>Separate from the reading so it can be tested without a listener: this is the part
    /// with a decision in it.</para>
    /// </remarks>
    internal static McpEntry[] Merge(IEnumerable<string> bodies)
    {
        var merged = new List<McpEntry>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var body in bodies)
        {
            foreach (var entry in EntriesIn(body))
            {
                if (seen.Add(entry.Id))
                {
                    merged.Add(entry);
                }
            }
        }
        return [.. merged];
    }

    private static IEnumerable<McpEntry> EntriesIn(string body)
    {
        var parsed = Windows.Parse(body, McpJsonContext.Default.McpEntriesResponse);
        return parsed?.Entries ?? [];
    }

    /// <summary>
    /// The one failure worth spelling out, because it is the one that will happen.
    /// </summary>
    /// <remarks>
    /// Told apart from an empty vault on purpose: "no window is open" and "nothing has been
    /// opened to you" call for completely different next moves, and an agent that cannot tell
    /// them apart will confidently give the wrong advice about whichever one it guessed.
    /// </remarks>
    private static string NoWindow()
    {
        var announced = Windows.Announced();
        var failure = new ToolFailure(
            "No CredsForDevs window answered.",
            announced == 0
                ? "Open the folder in VS Code with the CredsForDevs extension installed and unlock the vault. Nothing is readable until a window is running."
                : $"{announced} window(s) announced themselves but none is listening now — they were probably closed. Open one and try again.");
        return JsonSerializer.Serialize(failure, McpJsonContext.Default.ToolFailure);
    }
}
