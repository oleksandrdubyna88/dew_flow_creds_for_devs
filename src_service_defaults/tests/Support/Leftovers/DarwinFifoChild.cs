using System.Globalization;
using System.Runtime.Versioning;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The CHILD half of the FIFO test of <see cref="DarwinNativeTests"/>: this test runs only when that test starts the executable
/// again and hands it a claim path and the identity judged. It does the one read that would hang for ever if the open waited for a writer —
/// in a process of its own, so the parent can bound it and kill it. Normally it skips.</summary>
public sealed class DarwinFifoChild
{
    /// <summary>The variable that makes the child's test run: <c>&lt;path&gt;|&lt;dev&gt;|&lt;ino&gt;</c> of the claim, as judged before the swap.</summary>
    internal const string Variable = "MCP_DARWIN_FIFO_CHILD";

    [Fact]
    [SupportedOSPlatform("macos")]
    public void Reads_a_claim_that_is_now_a_fifo_and_is_refused_without_waiting()
    {
        var spec = Environment.GetEnvironmentVariable(Variable);
        if (string.IsNullOrEmpty(spec)) Assert.Skip($"{Variable} is not set — this test is the child of DarwinNativeTests and runs only under it");

        var parts = spec.Split('|');
        var judged = new Identity(
            ulong.Parse(parts[1], CultureInfo.InvariantCulture), UInt128.Parse(parts[2], CultureInfo.InvariantCulture),
            IsDirectory: false, IsLink: false, IsRegular: true, Uid: null, default, default);

        // The read answers null for a refused FIFO AND for an open that failed for any reason (a missing path, ENOENT): so the entry is
        // shown to be a FIFO first, or a null would pass for the wrong reason.
        var entry = Native.DarwinLstat(parts[0]);
        entry.Should().NotBeNull($"the claim {parts[0]} must be there to be read");
        entry!.Value.IsFifo.Should().BeTrue($"the claim must be a FIFO before the read (mode 0x{entry.Value.Mode:x4})");

        var bytes = Native.ReadVerifiedRegular(parts[0], judged, 513);

        bytes.Should().BeNull("a FIFO is refused by its type, after an open that did not wait for a writer");
    }
}
