using System.Text.Json;
using CredsBroker;

namespace CredsMcp;

/// <summary>
/// Finding a live CredsForDevs window, and reading from it.
/// </summary>
/// <remarks>
/// <para>Discovery is the CLI's, unchanged: every window writes an announcement, none of them is
/// trusted, and what decides is the unauthenticated health probe — the OS reissues port numbers,
/// so a freed port can belong to anything by the time we dial it. What differs here is only that
/// nothing is being performed: these are GET routes that raise no modal.</para>
/// <para><b>Every window, not the first one.</b> A person can have several open, and the entries
/// they opened to agents are per VAULT rather than per window — but a window serves the accounts
/// it has unlocked, so two windows can answer differently and both be right. Asking all of them
/// and merging by entry id is the only answer that does not depend on which window happened to
/// start last.</para>
/// </remarks>
internal static class Windows
{
    /// <summary>
    /// Read one route from every live window and hand back the raw bodies, newest window first.
    /// </summary>
    /// <remarks>
    /// Bodies rather than parsed objects: the caller knows what shape it asked for, and this
    /// stays the one place that knows how to find a window. A window that fails the probe, or
    /// answers anything but 200, is skipped in silence — it is not an error that a window closed
    /// between the announcement being written and this call being made.
    /// </remarks>
    internal static async Task<IReadOnlyList<string>> ReadAllAsync(BrokerContract contract, string route)
    {
        var endpoints = Endpoints.Read(Endpoints.DirectoryHere());
        if (endpoints.Count == 0)
        {
            return [];
        }

        using var client = BrokerClient.Create(contract);
        var bodies = new List<string>();
        foreach (var endpoint in endpoints)
        {
            var body = await ReadOneAsync(client, endpoint, route);
            if (body is not null)
            {
                bodies.Add(body);
            }
        }
        return bodies;
    }

    private static async Task<string?> ReadOneAsync(BrokerClient client, Endpoint endpoint, string route)
    {
        if (!await client.IsOurBrokerAsync(endpoint.Port))
        {
            return null;
        }
        var reply = await client.GetAsync(endpoint.Port, route);
        return reply.Status == 200 ? reply.Body : null;
    }

    /// <summary>How many windows announced themselves, live or not — for a diagnostic.</summary>
    internal static int Announced() => Endpoints.Read(Endpoints.DirectoryHere()).Count;

    /// <summary>
    /// Post an action to whichever window serves this entry.
    /// </summary>
    /// <remarks>
    /// <para>The entry id came from a list that had already merged every window, so which window
    /// holds it is not something the caller knows — and cannot be, since a person can have two
    /// open with different accounts unlocked. Windows are tried newest-first and the first one
    /// that does not answer <c>not_found</c> is the answer; a 404 means "not mine", which is
    /// exactly what the broker says for an id it does not serve.</para>
    /// <para><b>Only "not found" falls through, and it is read from the CODE.</b> The status is
    /// not enough: <c>not_supported</c> rides on 404 as well, so a status check alone would treat
    /// "this kind of entry has no such action" as "not my entry", try every other window, and
    /// finally tell the person no window answered — which is both wrong and unactionable. Every
    /// other refusal is a real answer from the window that owns the entry, and asking the next
    /// window after one would raise a second consent modal for a call already decided.</para>
    /// </remarks>
    internal static async Task<BrokerReply?> PostAsync(BrokerContract contract, string route, string json)
    {
        var endpoints = Endpoints.Read(Endpoints.DirectoryHere());
        if (endpoints.Count == 0)
        {
            return null;
        }

        using var client = BrokerClient.Create(contract);
        foreach (var endpoint in endpoints)
        {
            if (!await client.IsOurBrokerAsync(endpoint.Port))
            {
                continue;
            }
            var reply = await client.PostAliasAsync(endpoint.Port, route, json);
            if (!MeansNotMine(reply))
            {
                return reply;
            }
        }
        return null;
    }

    /// <summary>Does this reply mean "that entry is not mine", as opposed to any other refusal?</summary>
    internal static bool MeansNotMine(BrokerReply reply) =>
        reply.Status != 200 && ErrorCodeOf(reply.Body) == "not_found";

    /// <summary>The error code in a refusal, or empty when the body is not one we can read.</summary>
    internal static string ErrorCodeOf(string body)
    {
        var envelope = Parse(body, McpJsonContext.Default.BrokerErrorEnvelope);
        return envelope?.Error?.Code ?? string.Empty;
    }

    /// <summary>
    /// A body this build cannot read is skipped, never thrown over.
    /// </summary>
    /// <remarks>
    /// A window running a newer extension can answer with a shape this binary does not know. One
    /// unreadable window must not take the others down with it — an agent asking what it may use
    /// deserves the answer from the windows that could answer.
    /// </remarks>
    internal static T? Parse<T>(string body, System.Text.Json.Serialization.Metadata.JsonTypeInfo<T> shape)
        where T : class
    {
        try
        {
            return JsonSerializer.Deserialize(body, shape);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
