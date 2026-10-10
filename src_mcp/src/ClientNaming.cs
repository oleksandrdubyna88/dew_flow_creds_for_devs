using CredsBroker;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;
using Serilog;

namespace CredsMcp;

/// <summary>
/// Puts the client that shook hands into the log, once — and every incoming method NAME at Debug.
/// </summary>
/// <remarks>
/// <para><b>Why a message filter.</b> The plan's start line wants "the client name after the handshake"
/// (PLAN_wsl_bridge_outlives_its_client.md, E1.S2), and which client a leaked process served is the
/// first question an orphan raises. The SDK's incoming message filter is the one seam every message
/// passes through, and its <see cref="MessageContext.Server"/> is bound to the REQUEST — which matters
/// because the two protocol revisions name the client in different places: the <c>initialize</c>
/// handshake (2025-06-18 and earlier) fills it when that request has been answered, while 2026-07-28
/// carries it in each request's <c>_meta</c>. So it is read before the message is handled (newer clients)
/// and again after (an <c>initialize</c>). Reading only after would postpone the line until a
/// <c>subscriptions/listen</c> ends — which is never, for the client that matters (cadence consultation,
/// epics 1–3).</para>
/// <para><b>What it never logs</b>: a body. The method name is protocol vocabulary; parameters and
/// results are the caller's data (plan §5.1).</para>
/// <para><b>Both strings are the CLIENT's</b>, so both go through <see cref="CallerIdentity.Clean"/> — one
/// line, no control characters, capped — the cleaning every other caller field already gets. A line
/// break in either would let a client write what reads as a separate event (code round, finding 3).</para>
/// </remarks>
internal sealed class ClientNaming(ILogger log)
{
    private int _named;

    /// <summary>The filter to add to <c>options.Filters.Message.IncomingFilters</c>.</summary>
    internal McpMessageFilter Filter => next => async (context, cancellationToken) =>
    {
        Received(MethodOf(context.JsonRpcMessage));
        Name(context.Server.ClientInfo);
        await next(context, cancellationToken).ConfigureAwait(false);
        Name(context.Server.ClientInfo);
    };

    /// <summary>Log the client, the first time one is known; never again, never a blank.</summary>
    internal void Name(Implementation? client)
    {
        if (client is null || Interlocked.Exchange(ref _named, 1) == 1)
        {
            return;
        }
        var label = CallerIdentity.Clean(CallerSource.AgentLabel(client));
        log.Information("client: {Client}", label.Length > 0 ? label : "(unnamed)");
    }

    /// <summary>One Debug line per incoming request or notification, by method name only.</summary>
    internal void Received(string method)
    {
        var clean = CallerIdentity.Clean(method);
        if (clean.Length > 0)
        {
            log.Debug("received {Method}", clean);
        }
    }

    /// <summary>The method of a request or notification; a response has none.</summary>
    internal static string MethodOf(JsonRpcMessage message) =>
        message switch
        {
            JsonRpcRequest request => request.Method,
            JsonRpcNotification notification => notification.Method,
            _ => string.Empty,
        };
}
