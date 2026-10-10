namespace CredsCli.Tests;

/// <summary>
/// The sweep the no-echo tests run over everything a path wrote: does any line carry the key —
/// whole, or its body without the <c>cfgk_</c> prefix a careless redaction might strip?
/// </summary>
internal static class Diagnostics
{
    internal static bool Carry(IEnumerable<string> lines, string key)
    {
        var body = key.StartsWith("cfgk_", StringComparison.Ordinal) ? key["cfgk_".Length..] : key;
        return lines.Any(line => line.Contains(key, StringComparison.Ordinal) || line.Contains(body, StringComparison.Ordinal));
    }
}
