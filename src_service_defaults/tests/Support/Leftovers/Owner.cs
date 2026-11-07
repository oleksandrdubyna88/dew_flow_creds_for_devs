using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The owner record of rule §3, <c>&lt;owner&gt;:&lt;host&gt;@&lt;os&gt;:&lt;pid&gt;[:&lt;start&gt;[:&lt;ns&gt;]]</c> — ONE grammar
/// for a claim file, in the shape every implementation of the contract reads. <c>Host</c> is
/// <c>&lt;hostname&gt;[~&lt;distro&gt;]@&lt;linux|macos|windows&gt;</c>; <c>Start</c> is integer Unix seconds and
/// <c>Ns</c> the pid namespace, both only where the OS gives them without a child process (Linux).</summary>
public sealed partial record Owner(string Token, string Host, long Pid, long? Start, long? Ns)
{
    private const long MaxSafeInteger = (1L << 53) - 1;

    private static readonly Lazy<Owner> Current = new(ComputeThis);

    /// <summary>A pid, start or namespace written with a leading zero (<c>007</c>): the grammar reads it, but it is not how a
    /// reader writes a number, so liveness refuses it — <c>007</c> could be a real process.</summary>
    public bool NonCanonical { get; init; }

    /// <summary>This process: computed once. Start and namespace only on Linux and only together; when the rate or any
    /// read is missing, NO start and NO namespace — never a guess; macOS and Windows carry neither (no read without a child process).
    /// Throws on any platform but Linux, macOS and Windows.</summary>
    public static Owner This => Current.Value;

    /// <summary>The record a helper writes: the run's own, handed down in <c>TESTSTODELETE_RUN</c> when that is set and
    /// names a LIVE run of the caller (so what a child makes belongs to the run), else this process's. Any other value —
    /// not the grammar, another owner, a run that is gone — is ignored with ONE warning: a claim of a run that is already
    /// gone is dead at birth, and the caller's own sweep would remove what the run is still using.</summary>
    public static Owner RunRecord(Func<string, string?>? env = null, Action<string>? warn = null)
    {
        var given = (env ?? Environment.GetEnvironmentVariable)("TESTSTODELETE_RUN");
        if (string.IsNullOrEmpty(given)) return This;
        var parsed = Parse(given);
        if (parsed is not null && parsed.Token == This.Token && Liveness.State(parsed, Liveness.ProbeProcess) == OwnerState.Live) return parsed;
        (warn ?? Owned.DefaultWarn)("owned: TESTSTODELETE_RUN is not the record of a live run of this user — ignored, this process's own record is used");
        return This;
    }

    /// <summary>A machine's DNS host name as an owner writes it: each run of <c>@</c>, <c>:</c> or whitespace becomes ONE
    /// <c>-</c>; nothing is trimmed and the case is kept. <c>Environment.MachineName</c> is never used: NetBIOS, cut at
    /// 15 characters, and the janitor reads <c>hostname</c>.</summary>
    public static string HostName(string raw) => HostSeparators().Replace(raw, "-");

    /// <summary><see cref="HostName"/>, and under WSL <c>~</c> and the normalised distribution: distributions share one
    /// host name but not pid spaces, so another distribution's claim must be another host's.</summary>
    public static string HostId(string raw, string distro) =>
        string.IsNullOrWhiteSpace(distro) ? HostName(raw) : $"{HostName(raw)}~{HostName(distro)}";

    public string Format() => $"{Token}:{Host}:{Pid}" + (Start is null ? "" : $":{Start}" + (Ns is null ? "" : $":{Ns}"));

    /// <summary>The owner a text names, or null when it is unreadable: longer than 512 bytes, not exactly the grammar
    /// (the old form without an owner included), more than one line. One trailing line end (LF or CRLF) is stripped by
    /// explicit comparison, never by the expression.</summary>
    public static Owner? Parse(string text)
    {
        if (Encoding.UTF8.GetByteCount(text) > Owned.MaxClaimBytes) return null;
        var line = text.EndsWith("\r\n", StringComparison.Ordinal) ? text[..^2] : text.EndsWith('\n') ? text[..^1] : text;
        var match = Grammar().Match(line);
        if (!match.Success) return null;
        var fields = new[] { match.Groups[4], match.Groups[5], match.Groups[6] };
        return new Owner(
            match.Groups[1].Value,
            match.Groups[2].Value,
            Number(match.Groups[4].Value),
            match.Groups[5].Success ? Number(match.Groups[5].Value) : null,
            match.Groups[6].Success ? Number(match.Groups[6].Value) : null)
        {
            NonCanonical = fields.Any(g => g.Success && g.Value.Length > 1 && g.Value[0] == '0'),
        };
    }

    /// <summary>Digits as a number; past 2^53 (no pid, start or namespace is that large) as <c>long.MaxValue</c>, which
    /// <c>State</c> refuses.</summary>
    private static long Number(string digits) =>
        long.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out var value) && value <= MaxSafeInteger ? value : long.MaxValue;

    private static Owner ComputeThis()
    {
        var tag = OperatingSystem.IsLinux() ? "linux"
            : OperatingSystem.IsMacOS() ? "macos"
            : OperatingSystem.IsWindows() ? "windows"
            : throw new PlatformNotSupportedException("owned: the leftovers helper supports Linux, macOS and Windows only");
        var host = HostId(Dns.GetHostName(), Environment.GetEnvironmentVariable("WSL_DISTRO_NAME") ?? "") + "@" + tag;
        var owner = new Owner(OwnerToken.This, host, Environment.ProcessId, null, null);
        if (tag != "linux") return owner;
        var start = Liveness.ReadLinuxStart(Environment.ProcessId);
        var ns = start is null ? null : Liveness.ReadPidNamespace();
        return start is null ? owner : owner with { Start = start, Ns = ns };
    }

    [GeneratedRegex(@"[@:\s]+")]
    private static partial Regex HostSeparators();

    [GeneratedRegex(@"^([uw][0-9]{1,10}):([^@:\s]+@(linux|macos|windows)):([0-9]+)(?::([0-9]+)(?::([0-9]+))?)?\z", RegexOptions.CultureInvariant)]
    private static partial Regex Grammar();
}
