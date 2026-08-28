using System.Text.Json;
using CredsBroker;

namespace CredsMcp;

/// <summary>
/// Level 2: asking a window to USE a credential, without ever receiving it.
/// </summary>
/// <remarks>
/// <para>Every one of these posts to <c>/v1/mcp/use/&lt;action&gt;</c> and comes back with what
/// the action produced — a command's output, a query's rows, "opened". <b>None of them can
/// return a secret</b>, because no response shape in the protocol has a field one could travel
/// in; the window holds the password, uses it, and answers with the result.</para>
/// <para>Two gates stand in front of each, and they are not the same gate. The entry's
/// <b>Usable by agents</b> switch says an agent may ask at all — off by default, and off for
/// every entry that existed before the feature. The consent modal in the window says whether
/// this particular call happens, every time, showing the person the real entry and the real
/// command. Turning the switch on does not pre-authorise anything.</para>
/// <para>The tool descriptions say both of those out loud. A model that does not know a human
/// will be asked writes a different, worse plan — one that batches twenty calls, or apologises
/// in advance for something that is going to work.</para>
/// </remarks>
internal static class UseTools
{
    /// <summary>One tool: what it is called, what it posts to, and what to tell the model.</summary>
    /// <remarks>
    /// <c>Route</c> is set only for the one tool that does not live under the use prefix.
    /// Deleting is not a use of a credential, so it has a route of its own.
    /// </remarks>
    internal sealed record UseTool(string Name, string Action, string Title, string Description, bool OwnRoute = false);

    /// <summary>The routes that are not under the use prefix, by action.</summary>
    private static string RouteFor(BrokerContract contract, UseTool tool) =>
        tool.Action switch
        {
            "delete" => contract.DeleteRoute(),
            "create" => contract.CreateRoute(),
            _ => contract.McpUseRoute(tool.Action),
        };

    /// <summary>
    /// The catalog, as data.
    /// </summary>
    /// <remarks>
    /// The actions are the broker's own vocabulary, the same words the CLI's verbs map onto. A
    /// name invented here would be a second vocabulary to keep in step with the first.
    /// </remarks>
    internal static readonly UseTool[] All =
    [
        new(
            "creds_exec",
            "exec",
            "Run a command on a host",
            """
            Run a shell command on an SSH host from the person's vault. Give the entry's `id` from
            creds_list and the `command` to run; you get its stdout, stderr and exit code back.

            You never receive the key or the password — the window connects with it. The person is
            shown the entry and the exact command and must approve it, every call. Assume a few
            seconds of waiting, and do not batch: twenty calls is twenty prompts.
            """),
        new(
            "creds_query",
            "query",
            "Run a query on a database",
            """
            Run a SQL query against a database entry from the person's vault. Give the entry's
            `id` from creds_list and the `query`; you get the result back as text.

            The password never reaches you or the command line — it goes to the client through its
            environment. The person approves each query, and sees it in full before doing so, so
            write queries you would be comfortable showing them.
            """),
        new(
            "creds_run",
            "run",
            "Run a saved command or script",
            """
            Run what a `terminal` or `script` entry already holds — the command the person saved,
            not one you supply. Give the entry's `id` from creds_list.

            Use this when creds_list showed you an entry of kind `terminal` or `script`: its own
            `command` field tells you what it will do. The person approves the run.
            """),
        new(
            "creds_open_terminal",
            "terminal",
            "Open a terminal for the person",
            """
            Open an interactive terminal on an SSH host, in the person's editor, connected with
            the stored credential. Give the entry's `id` from creds_list.

            This is for THEM, not for you: you get back only whether it opened. You cannot read
            what happens in it or type into it. Use it when the next step needs a human at a
            prompt — and the person approves the opening, as they do every action here.
            """),
        new(
            "creds_vpn_up",
            "up",
            "Bring a VPN up",
            """
            Bring up a VPN connection from the person's vault. Give the entry's `id` from
            creds_list.

            Reach for this when an entry's `dependsOn` names a VPN and the host it fronts is not
            answering: that dependency is the person saying "this needs that first". You get back
            whether it came up, never the configuration. The person approves it, as they do every
            action here.
            """),
        new(
            "creds_vpn_down",
            "down",
            "Take a VPN down",
            """
            Take down a VPN connection you or the person brought up. Give the entry's `id` from
            creds_list. Courtesy after a task that needed one; the person still approves it.
            """),
        new(
            "creds_rotate",
            "rotate",
            "Replace a secret, without ever seeing it",
            """
            Change a credential on the far side AND in the vault, in one step, without the new
            secret ever reaching you. Give the entry's `id` from creds_list and a `statement`
            containing the literal text {{creds:new}} where the new secret goes:

              ALTER USER app IDENTIFIED BY '{{creds:new}}'

            The window generates the value, substitutes it, runs the statement, snapshots the old
            value into that entry's history, and stores the new one. You get back that it worked
            and whatever the statement printed — with the new secret masked out of it. You never
            see either value, old or new.

            Only a statement that SUCCEEDS updates the vault, so a refusal on the far side leaves
            everything as it was. Needs the entry's "Agents may replace the secret" switch, which
            is a rung above using it, and the person approves the statement — they see it with
            {{creds:new}} still in it, which is what makes it safe to show them.

            `secretKind` picks what gets made: "password" (the default) or "passphrase". Key pairs
            and certificates are not made here — ask for one and you get a refusal saying why,
            which you can pass on rather than guess at.

            You can also say WHAT the value should look like, which matters when the far side caps
            the length or forbids symbols: `length` (8-128), `lower`, `upper`, `digits`, `symbols`,
            `avoidAmbiguous` for a password; `words` (3-24) and `separator` (one of - _ . a space,
            or empty) for a passphrase. Anything you leave out stays as it normally would. Asking
            for a password with every character set off is refused rather than drawn, and the
            person sees what you asked for in the prompt.
            """),
        new(
            "creds_delete",
            "delete",
            "Move an entry to the Trash",
            """
            Move an entry from the person's vault to the Trash. Give the entry's `id` from
            creds_list.

            It goes to the Trash and nowhere else — you cannot delete permanently, and there is no
            argument that would let you. Restoring is dragging it back out, so this is reversible
            until the Trash empties on the timer they chose.

            Needs the entry's delete switch, which may be set to only what an agent created
            itself; on that setting this refuses for anything the person made. They approve each
            deletion, and the prompt says the Trash rather than the word "delete".
            """,
            OwnRoute: true),
        new(
            "creds_create",
            "create",
            "Store a credential you just made",
            """
            Save a credential into the person's vault — for something you just provisioned and now
            hold the access to. Give a `name`, a `kind` (ssh, db, credential, vpn, terminal,
            script, sshkey, config) and the `secret`; `host`, `user` and `port` if you have them.

            You do NOT choose where it goes. It lands in a folder the person opened for this, and
            if they opened more than one you name which in `folder` — creds_list shows the folders
            entries live in. If none is open, this refuses and says which switch to turn on.

            PREFER `secretKind` over `secret`. Naming a kind — "password" or "passphrase" — has
            the window make the value, so it never enters your context; that is how every other
            call in this server works. Send `secret` only when you already hold the value because
            you provisioned the thing yourself. When you do, the person's journal records that the
            secret came from you, which is the honest cost of that path.

            You can shape what gets made instead of taking the default 32 characters of
            everything: `length` (8-128), `lower`, `upper`, `digits`, `symbols`, `avoidAmbiguous`
            for a password; `words` (3-24) and `separator` for a passphrase. Use them when the
            system you are provisioning has rules — a length cap or no symbols is exactly the case
            where an agent would otherwise generate the value itself and put it in its context.
            Anything omitted stays as it normally would.

            The entry is marked as agent-created, which is what the narrow delete permission keys
            on. They approve the creation.
            """,
            OwnRoute: true),
        new(
            "creds_export_env",
            "exportEnv",
            "Put a credential into the person's terminals",
            """
            Make an entry's secret available to NEW terminals the person opens, as the environment
            variable they configured for it. Give the entry's `id` from creds_list.

            You are told the variable NAMES that were written and never their values — that is the
            whole point of the verb: the person's own shell gets the secret, you get the names to
            refer to. Existing terminals are unaffected, and the person approves the write.
            """),
    ];

    /// <summary>
    /// Perform one action and answer with whatever the window said.
    /// </summary>
    /// <remarks>
    /// <para>The body is built here rather than taken from the model: `entry` is the id, and the
    /// one extra field an action needs (a command, a query) is added under the name the broker
    /// expects. A model handing over a whole JSON body would be a model choosing which fields
    /// this program sends.</para>
    /// <para>Failures come back as an object with a sentence in it, never as a thrown exception.
    /// An MCP client shows a tool error to the model, and the model has to act on it: "no window
    /// answered" and "that entry is not open to you" are both fixable in seconds when the answer
    /// says so.</para>
    /// </remarks>
    internal static async Task<string> InvokeAsync(
        BrokerContract contract,
        UseTool tool,
        string entryId,
        string? extraName,
        string? extraValue)
    {
        if (string.IsNullOrWhiteSpace(entryId))
        {
            return Failure("No entry id was given.", "Call creds_list first and pass an entry's `id`.");
        }

        var route = RouteFor(contract, tool);
        var reply = await Windows.PostAsync(contract, route, Body(entryId, extraName, extraValue));
        if (reply is null)
        {
            return Failure(
                "No CredsForDevs window answered for that entry.",
                Windows.Announced() == 0
                    ? "Open the folder in VS Code with the CredsForDevs extension and unlock the vault."
                    : "The entry id may be stale — call creds_list again. Ids do not survive the entry being deleted and re-created.");
        }
        return reply.Status == 200 ? reply.Body : Refused(reply);
    }

    /// <summary>
    /// Creating an entry: the one call whose body names no entry.
    /// </summary>
    /// <remarks>
    /// Its own method rather than another shape threaded through <see cref="InvokeAsync"/>,
    /// because the difference is not one more optional field — it is that there is nothing to
    /// address. Everything else about it is the same: the window decides where it lands, the
    /// person approves, and the refusal comes back in the window's own words.
    /// </remarks>
    internal static async Task<string> CreateAsync(
        BrokerContract contract,
        UseTool tool,
        string name,
        string kind,
        string? secretKind,
        string? secret,
        string? folder,
        string? host,
        string? user,
        int? port = null,
        IReadOnlyList<(string Key, string? Value)>? draw = null)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Failure("No name was given.", "Give the new entry a name the person will recognise.");
        }

        var fields = new Dictionary<string, string> { ["name"] = name, ["kind"] = kind };
        Put(fields, "secretKind", secretKind);
        Put(fields, "secret", secret);
        Put(fields, "folder", folder);
        Put(fields, "host", host);
        Put(fields, "user", user);
        Put(fields, "port", port?.ToString());
        PutAll(fields, draw);

        var reply = await Windows.PostAsync(
            contract,
            RouteFor(contract, tool),
            JsonSerializer.Serialize(fields, McpJsonContext.Default.DictionaryStringString));
        if (reply is null)
        {
            return Failure(
                "No CredsForDevs window answered.",
                "Open the folder in VS Code with the CredsForDevs extension and unlock the vault.");
        }
        return reply.Status == 200 ? reply.Body : Refused(reply);
    }

    /// <summary>
    /// Rotating: the statement, and optionally what kind of secret to make.
    /// </summary>
    /// <remarks>
    /// Its own method only because the body carries two named fields rather than one. Everything
    /// else — the gate, the prompt, the refusal in the window's own words — is
    /// <see cref="InvokeAsync"/>'s, and the body is still built here rather than handed over by a
    /// model.
    /// </remarks>
    internal static async Task<string> RotateAsync(
        BrokerContract contract,
        UseTool tool,
        string entryId,
        string statement,
        string? secretKind,
        IReadOnlyList<(string Key, string? Value)>? draw = null)
    {
        if (string.IsNullOrWhiteSpace(entryId))
        {
            return Failure("No entry id was given.", "Call creds_list first and pass an entry's `id`.");
        }

        var fields = new Dictionary<string, string> { ["entry"] = entryId, ["statement"] = statement };
        Put(fields, "secretKind", secretKind);
        PutAll(fields, draw);

        var reply = await Windows.PostAsync(
            contract,
            RouteFor(contract, tool),
            JsonSerializer.Serialize(fields, McpJsonContext.Default.DictionaryStringString));
        if (reply is null)
        {
            return Failure(
                "No CredsForDevs window answered for that entry.",
                "The entry id may be stale — call creds_list again.");
        }
        return reply.Status == 200 ? reply.Body : Refused(reply);
    }

    /// <summary>
    /// The generation options, each left out when it was not asked for.
    /// </summary>
    /// <remarks>
    /// A null list is no options at all, which is the ordinary case. The separator is the one
    /// field whose EMPTY value is meaningful ("join the words with nothing"), so it travels when
    /// it is non-null rather than when it is non-empty — everything else uses <see cref="Put"/>.
    /// </remarks>
    private static void PutAll(
        Dictionary<string, string> fields,
        IReadOnlyList<(string Key, string? Value)>? draw)
    {
        foreach (var (key, value) in draw ?? [])
        {
            if (value is not null && (key == "separator" || value.Length > 0))
            {
                fields[key] = value;
            }
        }
    }

    /// <summary>An absent optional field is left out rather than sent as an empty string.</summary>
    private static void Put(Dictionary<string, string> fields, string key, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            fields[key] = value;
        }
    }

    /// <summary>The request body, built field by field — never a blob handed over by a model.</summary>
    private static string Body(string entryId, string? extraName, string? extraValue)
    {
        var fields = new Dictionary<string, string> { ["entry"] = entryId };
        if (extraName is not null && extraValue is not null)
        {
            fields[extraName] = extraValue;
        }
        return JsonSerializer.Serialize(fields, McpJsonContext.Default.DictionaryStringString);
    }

    /// <summary>
    /// A refusal, passed on with the window's own sentence.
    /// </summary>
    /// <remarks>
    /// The broker already says the useful thing — which switch to turn on, that the person
    /// declined, that this kind of entry has no such action. Rewriting it here would be a second
    /// place to keep those sentences correct, and the second copy is always the vague one.
    /// </remarks>
    internal static string Refused(BrokerReply reply)
    {
        var envelope = Windows.Parse(reply.Body, McpJsonContext.Default.BrokerErrorEnvelope);
        var message = envelope?.Error?.Message;
        return Failure(
            message is { Length: > 0 } ? message : $"The window refused the call (HTTP {reply.Status}).",
            HintFor(envelope?.Error?.Code));
    }

    /// <summary>What to do about it — one sentence per refusal a person can actually act on.</summary>
    private static string HintFor(string? code) =>
        code switch
        {
            "denied" => "Ask the person to allow it, or to turn the switch on in the entry's Agent access section.",
            "not_found" => "Call creds_list again — the entry may have been deleted or the window closed.",
            "not_supported" => "Either that action does not apply to this kind of entry, or the window cannot generate the kind of secret you asked for — the message says which. If it is the generator, you can offer to make the value yourself and let the person decide.",
            "too_many_requests" => "Too many prompts too quickly. Wait a moment and make one call, not several.",
            "consent_timeout" => "Nobody answered the prompt. Ask the person to look at their editor.",
            "tool_missing" => "The machine is missing a program this needs — the message says which.",
            _ => "Tell the person what you were trying to do; the window's own log has the detail.",
        };

    internal static string Failure(string error, string hint) =>
        JsonSerializer.Serialize(new ToolFailure(error, hint), McpJsonContext.Default.ToolFailure);
}
