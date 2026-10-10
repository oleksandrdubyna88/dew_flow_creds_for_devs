using System.Runtime.InteropServices;
using FluentAssertions;

namespace CredsForDevs.ServiceDefaults.Tests;

/// <summary>The handled termination signals: which, the first one wins, and the exit code each one means.</summary>
public sealed class ShutdownSignalsTests
{
    [Fact]
    public void The_four_termination_signals_are_handled()
    {
        ShutdownSignals.Handled.Should().BeEquivalentTo(
            [PosixSignal.SIGINT, PosixSignal.SIGTERM, PosixSignal.SIGHUP, PosixSignal.SIGQUIT]);
    }

    [Fact]
    public async Task The_first_signal_is_the_one_reported()
    {
        using var signals = new ShutdownSignals();

        signals.Deliver(PosixSignal.SIGINT).Should().BeTrue();
        signals.Deliver(PosixSignal.SIGTERM).Should().BeFalse("a second signal changes nothing");

        (await signals.Received).Should().Be(PosixSignal.SIGINT);
    }

    [Fact]
    public void Registering_with_the_OS_neither_throws_nor_reports_a_signal_nobody_sent()
    {
        using var signals = ShutdownSignals.Register();

        signals.Received.IsCompleted.Should().BeFalse();
    }

    [Theory]
    [InlineData(PosixSignal.SIGHUP, 1)]
    [InlineData(PosixSignal.SIGINT, 2)]
    [InlineData(PosixSignal.SIGQUIT, 3)]
    [InlineData(PosixSignal.SIGTERM, 15)]
    [InlineData((PosixSignal)42, 0)]
    public void Numbers_are_the_POSIX_ones_not_the_enum_values(PosixSignal signal, int number) =>
        ShutdownSignals.Number(signal).Should().Be(number);
}
