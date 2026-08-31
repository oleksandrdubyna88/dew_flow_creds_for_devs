using System.Text.Json;
using ModelContextProtocol.Protocol;

namespace CredsMcp;

/// <summary>
/// A tool's answer, with the protocol's own flag on it when it is a refusal.
/// </summary>
/// <remarks>
/// <para><b>Why this exists.</b> Every refusal on this surface — the person clicking Deny, a
/// switch that is off, a stale id, a prompt nobody answered, no window at all — used to come back
/// as an ordinary SUCCESSFUL result whose body happened to carry an <c>error</c>. An agent that
/// checks the protocol flag and not the body then reads "the person refused" as "it worked" and
/// reports success. The body was always readable; what was missing was the signal.</para>
/// <para><b>The flag is read FROM the body, not tracked alongside it.</b> Every path already
/// produces JSON that says whether it failed — <c>ToolFailure</c> here, the broker's error
/// envelope from the window — so a second channel carrying the same fact is a second thing that
/// can disagree with the first. One source, read once, at the boundary.</para>
/// <para>This does not contradict the recorded decision to answer with a readable SHAPE rather
/// than a thrown exception: the shape is unchanged and still reaches the model. Flagging is not
/// throwing. What changes is that a client no longer has to parse the body to know something went
/// wrong.</para>
/// </remarks>
internal static class Answer
{
    /// <summary>Wrap a tool's JSON, marking it an error when the JSON says it is one.</summary>
    internal static CallToolResult From(string json) =>
        new()
        {
            Content = [new TextContentBlock { Text = json }],
            IsError = IsRefusal(json),
        };

    /// <summary>
    /// Does this body report a failure?
    /// </summary>
    /// <remarks>
    /// <para>An OBJECT with an <c>error</c> property, and nothing else. The listings answer with a
    /// JSON array and can never match; a success from the window is an object without that
    /// property (<c>{"rotated":true}</c>, <c>{"created":true,…}</c>).</para>
    /// <para><b>A body this build cannot parse is NOT called an error.</b> It reached here through
    /// a path that had already decided it was an answer, and inventing a failure from an unreadable
    /// shape would turn "a window running a newer extension" into "the call failed" — the same
    /// reasoning that makes <c>Windows.Parse</c> skip rather than throw.</para>
    /// </remarks>
    internal static bool IsRefusal(string json)
    {
        try
        {
            using var parsed = JsonDocument.Parse(json);
            return parsed.RootElement.ValueKind == JsonValueKind.Object
                && parsed.RootElement.TryGetProperty("error", out _);
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
