using System.Text.Json;
using System.Text.Json.Nodes;
using CredsBroker;

namespace CredsMcp;

/// <summary>
/// One road in for every body this binary posts: the named fields, then the caller label under
/// the contract's field name — and nothing else.
/// </summary>
/// <remarks>
/// <para>The no-escalation rule on this side is structural — a model cannot add a key to a body it
/// does not compose — and it holds only while every body is exactly its named fields plus this one
/// label. So the label is attached HERE, once, rather than by each builder: a builder that forgot
/// it would merely send an older wire, and a builder that attached it differently could not exist.</para>
/// <para>A <c>Dictionary&lt;string, JsonNode&gt;</c> rather than the <c>Dictionary&lt;string, string&gt;</c>
/// the bodies used to be, because a dictionary of strings cannot hold the nested object the contract
/// describes. Measured before it was written (2026-09-12): with reflection off and
/// <c>PublishAot</c> on, the source-generated context publishes it with zero trim warnings and the
/// published binary serialises a nested object at run time — the plan records the probe.</para>
/// </remarks>
internal static class Bodies
{
    internal static string Compose(IEnumerable<KeyValuePair<string, string>> fields, CallerRecord caller, BrokerContract contract)
    {
        var body = new Dictionary<string, JsonNode>();
        foreach (var (key, value) in fields)
        {
            body[key] = JsonValue.Create(value)!;
        }

        // An empty record sends no field at all, so an old window meets exactly the wire it always
        // met and a new one says "An agent" — deliberately, rather than rendering four blanks.
        if (!caller.IsEmpty)
        {
            body[contract.CallerField()] = CallerIdentity.ToJson(caller);
        }

        return JsonSerializer.Serialize(body, McpJsonContext.Default.DictionaryStringJsonNode);
    }
}
