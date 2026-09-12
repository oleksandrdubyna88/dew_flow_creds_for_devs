using CredsBroker;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace CredsMcp;

/// <summary>
/// The caller record the tools close over: the session half known at start-up, the agent half
/// learnt from the client's handshake, read lazily on every call.
/// </summary>
/// <remarks>
/// <para><b>Why a holder and not a value.</b> The tools are built before the server exists
/// (<c>Program.RunAsync</c> adds them to the options that <c>McpServer.Create</c> takes), and
/// <c>ClientInfo</c> is <c>null</c> until the <c>initialize</c> handshake has been answered — so the
/// one thing that names the client cannot be known when the delegates are made. They capture this
/// object instead and ask it per call.</para>
/// <para><b>Why the client, and not a delegate parameter.</b> Measured on 2026-09-12 against the
/// SDK pinned here (2.2.0): there is no <c>IMcpServer</c>, and the <c>RequestContext</c> a tool
/// delegate can take carries no reference to the server. <see cref="McpServer.ClientInfo"/> is the
/// route that exists, and using it changes no delegate's signature — so no tool's schema moves.</para>
/// <para><b>Under the WSL bridge, this half fills only the agent.</b> The session, its name and the
/// folder were computed by the Linux half from ITS environment and forwarded; recomputing them here
/// would attach a different person's session name. The rule, in one sentence: the side that spoke
/// to the client names the client; the side that spoke to the environment names the session.</para>
/// </remarks>
internal sealed class CallerSource(CallerRecord known)
{
    private Func<Implementation?> _client = static () => null;

    /// <summary>Bind the server whose handshake names the client. After <c>Create</c>, before <c>RunAsync</c>.</summary>
    internal void Bind(McpServer server) => Bind(() => server.ClientInfo);

    /// <summary>The same, from any source of a client — what the tests drive.</summary>
    internal void Bind(Func<Implementation?> client) => _client = client;

    /// <summary>What a body carries right now: the known half, named by the client if nobody named it yet.</summary>
    internal CallerRecord Current => known.NamedBy(AgentLabel(_client()));

    /// <summary>
    /// <c>Claude Code 2.1.268</c> from a client's name and version; whichever half is blank is left out,
    /// and the result is cleaned like every other field — the client is somebody else's program.
    /// </summary>
    internal static string AgentLabel(Implementation? client) =>
        client is null
            ? string.Empty
            : string.Join(' ', new[] { client.Name, client.Version }.Where(part => !string.IsNullOrWhiteSpace(part)).Select(part => part.Trim()));
}
