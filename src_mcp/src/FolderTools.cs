using System.Text.Json;
using CredsBroker;

namespace CredsMcp;

/// <summary>
/// Folders: the second object an agent may be given.
/// </summary>
/// <remarks>
/// <para>Entries were the first, and everything structural about them is repeated here on
/// purpose: nothing is reachable until a person turns a switch on, every action raises the modal
/// in their editor, and a refusal comes back in the window's own words naming the control to
/// turn on.</para>
/// <para><b>There is no request here that can change a permission.</b> The edit tool takes a
/// name, a parent and a folder type — the switches are not among them, and no other shape is
/// sent. A permission that could change permissions would be a permission to grant itself every
/// other one, which is the one thing this whole design exists to prevent.</para>
/// </remarks>
internal static class FolderTools
{
    internal const string ListName = "creds_folders";

    internal const string ListDescription =
        """
        List the FOLDERS the person opened to you — the places an entry can go, and the things
        you may rename, move or remove.

        Each carries `id`, `name`, `parent` and `can` (create, edit, delete). Folders hold no
        secret, so nothing here is redacted; what limits the list is only what was opened. An
        empty list means no folder has been opened to you, not that the vault has none.

        Call this before creds_create_folder, creds_edit_folder or creds_delete_folder: the ids
        those take come from here, and an id from an older listing may be stale.
        """;

    internal const string CreateName = "creds_create_folder";

    internal const string CreateDescription =
        """
        Make a folder inside one the person opened to you. Give a `name` and the `parent` id
        from creds_folders; `folderType` optionally restricts what the folder may hold
        (credential, ssh, sshkey, vpn, db, terminal, script, config, or any).

        You do not choose the place freely: the parent must already be open for creating folders,
        and if it is not you get a refusal naming the switch. The person approves the creation and
        sees the name and the destination before it happens.

        The folder is marked as agent-created, which is what the narrow delete permission keys on.
        """;

    internal const string EditName = "creds_edit_folder";

    internal const string EditDescription =
        """
        Rename a folder, move it, or change what it may hold. Give the `folder` id from
        creds_folders and any of `name`, `parent`, `folderType`.

        A move needs the grant at BOTH ends: the folder and the destination must each be open to
        you. That is not a formality — a folder passes its agent-access answers down to everything
        inside it, so moving one changes what its contents allow. The Trash is not a destination,
        and a folder cannot be moved inside itself.

        You cannot change a folder's agent-access switches with this or with anything else. There
        is no field for them in any request; only the person can move those.
        """;

    internal const string DeleteName = "creds_delete_folder";

    internal const string DeleteDescription =
        """
        Move a folder to the Trash — with everything inside it. Give the `folder` id from
        creds_folders.

        To the Trash and nowhere else: you cannot delete permanently, and there is no argument
        that would let you, so this is reversible until the Trash empties on the person's timer.
        The permission may be set to only what you created yourself, in which case anything the
        person made is refused.

        The prompt they see says the Trash and names the folder, because "delete the folder" and
        "move it and its contents to the Trash" are different promises.
        """;

    /// <summary>
    /// Every folder open to this agent, from every live window.
    /// </summary>
    /// <remarks>
    /// Merged by id, keeping the first, exactly as the entry listing is: the same vault unlocked
    /// in two windows would otherwise be listed twice, and an agent would read that as two
    /// folders where there is one.
    /// </remarks>
    internal static async Task<string> ListAsync(BrokerContract contract)
    {
        var route = contract.ReadRoute("mcpFolders", "/v1/mcp/folders");
        var read = await Windows.ReadAllAsync(contract, route);
        if (read.Bodies.Count == 0)
        {
            return Tools.NoAnswer(read.RouteRefused);
        }

        return JsonSerializer.Serialize(Merge(read.Bodies), McpJsonContext.Default.McpFolderArray);
    }

    /// <summary>Several windows' answers, as one list. Separate so it is testable without one.</summary>
    internal static McpFolder[] Merge(IEnumerable<string> bodies)
    {
        var merged = new List<McpFolder>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var body in bodies)
        {
            foreach (var folder in FoldersIn(body))
            {
                if (seen.Add(folder.Id))
                {
                    merged.Add(folder);
                }
            }
        }
        return [.. merged];
    }

    private static IEnumerable<McpFolder> FoldersIn(string body)
    {
        var parsed = Windows.Parse(body, McpJsonContext.Default.McpFoldersResponse);
        return parsed?.Folders ?? [];
    }

    /// <summary>
    /// One folder verb, with the body built here rather than handed over by a model.
    /// </summary>
    /// <remarks>
    /// <para>Field by field, and the fields are named in this method. That is what makes the
    /// no-escalation rule structural on this side too: a model cannot add a key to a body it
    /// does not compose.</para>
    /// </remarks>
    internal static async Task<string> InvokeAsync(
        BrokerContract contract,
        string action,
        IReadOnlyList<(string Key, string? Value)> fields)
    {
        var body = new Dictionary<string, string>();
        foreach (var (key, value) in fields)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                body[key] = value;
            }
        }

        var reply = await Windows.PostAsync(
            contract,
            contract.FolderRoute(action),
            JsonSerializer.Serialize(body, McpJsonContext.Default.DictionaryStringString));
        if (reply is null)
        {
            return UseTools.Failure(
                "No CredsForDevs window answered.",
                Windows.Announced() == 0
                    ? "Open the folder in VS Code with the CredsForDevs extension and unlock the vault."
                    : "The folder id may be stale — call creds_folders again.");
        }
        return reply.Status == 200 ? reply.Body : UseTools.Refused(reply);
    }
}
