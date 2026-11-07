using System.Text.Json;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The conformance vectors of the conventions, read from the mounted submodule. The contract has two
/// implementations — the conventions' Node helper and shell janitor, and this one — so the vectors are the one
/// table all of them are held to. A missing or unreadable file FAILS the test that needs it: an uninitialised
/// submodule is a broken setup, not a clean one.</summary>
internal static class OwnerVectors
{
    public static readonly string File = Path.Combine(RepositoryRoot.Path, ".claude", "rules", "shared", "tools", "fixtures", "owner-vectors.json");

    /// <summary>The <c>vectors</c> of one table (<c>names</c>, <c>windows-owner</c>, <c>hostnames</c>, <c>record</c>,
    /// <c>grammar</c>, <c>scope</c>, <c>verdicts</c>).</summary>
    public static IReadOnlyList<JsonElement> Table(string name)
    {
        using var doc = JsonDocument.Parse(System.IO.File.ReadAllText(File));
        return doc.RootElement.GetProperty(name).GetProperty("vectors").EnumerateArray().Select(v => v.Clone()).ToList();
    }

    public static string Text(this JsonElement vector, string property) => vector.GetProperty(property).GetString()!;

    public static string? TextOrNull(this JsonElement vector, string property) =>
        vector.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
