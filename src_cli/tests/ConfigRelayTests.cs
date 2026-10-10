using System.ComponentModel;
using CredsBroker;
using CredsCli;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// <c>creds config</c> inside WSL: the key is resolved on the Linux side and handed to the Windows
/// <c>creds.exe</c> on STDIN — never in either command line, and never to a Windows binary that would
/// not read it there.
/// </summary>
/// <remarks>
/// Driven through injected seams; the real launch is <c>WindowsBridge.RelayWithInput</c>, tested
/// against a real process in the broker library's own suite.
/// </remarks>
public class ConfigRelayTests
{
    /// <summary>Key-shaped, and fake: no window ever minted it.</summary>
    private const string FakeKey = "cfgk_FAKEFAKEFAKEFAKEFAKEFAKEFAKE";

    private const string NewHelp = "creds — …\n  creds config -   …\n  (" + "config-key-stdin" + ")\n";

    private const string OldHelp = "creds — …\n  creds config <key>                 print one config file (for an app at startup)\n";

    private static readonly TimeSpan Quick = TimeSpan.FromMilliseconds(200);

    private static readonly BrokerContract Contract = BrokerContract.Current;

    /// <summary>Records everything the relay did, so a test can say what it did NOT do.</summary>
    private sealed class Recorder
    {
        public List<string> Notes { get; } = [];

        public List<(IReadOnlyList<string> Args, string Input)> Launches { get; } = [];

        public int Probes { get; set; }

        public int Resolves { get; set; }

        public ConfigRelaySeams Seams(
            ConfigKey? key = null,
            Func<Task<string?>>? probe = null,
            Func<IReadOnlyList<string>, string, int>? launch = null) =>
            new(
                ResolveKey: _ =>
                {
                    Resolves++;
                    return key ?? new ConfigKey.Found(FakeKey);
                },
                ProbeHelp: () =>
                {
                    Probes++;
                    return probe is null ? Task.FromResult<string?>(NewHelp) : probe();
                },
                Launch: (args, input) =>
                {
                    Launches.Add((args, input));
                    return launch is null ? 0 : launch(args, input);
                },
                Note: Notes.Add);
    }

    [Fact]
    public async Task The_windows_half_is_started_with_a_dash_and_the_key_on_stdin()
    {
        var recorder = new Recorder();

        var exit = await ConfigRelay.RunAsync(["config", "-"], Contract, recorder.Seams(), Quick);

        exit.Should().Be(0);
        recorder.Launches.Should().ContainSingle();
        recorder.Launches[0].Args.Should().Equal("config", "-");
        recorder.Launches[0].Input.Should().Be(FakeKey + "\n");
    }

    [Fact]
    public async Task The_environment_form_crosses_on_stdin_too()
    {
        // WSLENV does not carry the variable into the Windows child; stdin does.
        var recorder = new Recorder();

        await ConfigRelay.RunAsync(["config"], Contract, recorder.Seams(), Quick);

        recorder.Launches.Should().ContainSingle().Which.Args.Should().Equal("config", "-");
    }

    [Fact]
    public async Task No_launched_argument_ever_carries_the_key()
    {
        var recorder = new Recorder();

        await ConfigRelay.RunAsync(["config", "-"], Contract, recorder.Seams(), Quick);

        recorder.Launches.SelectMany(l => l.Args).Should().NotContain(a => a.Contains(FakeKey));
    }

    [Fact]
    public async Task The_windows_exit_code_passes_through()
    {
        var recorder = new Recorder();

        var exit = await ConfigRelay.RunAsync(["config", "-"], Contract, recorder.Seams(launch: (_, _) => 97), Quick);

        exit.Should().Be(97);
    }

    [Fact]
    public async Task An_argument_form_is_refused_on_this_side_and_nothing_crosses()
    {
        var recorder = new Recorder();

        var exit = await ConfigRelay.RunAsync(["config", FakeKey], Contract, recorder.Seams(), Quick);

        exit.Should().Be(Contract.Exit("usage"));
        recorder.Launches.Should().BeEmpty();
        recorder.Probes.Should().Be(0);
        recorder.Resolves.Should().Be(0);
        recorder.Notes.Should().ContainSingle().Which.Should().Be(CommandLine.ConfigArgumentRefused);
    }

    [Fact]
    public async Task A_missing_key_is_reported_here_and_nothing_crosses()
    {
        var recorder = new Recorder();

        var exit = await ConfigRelay.RunAsync(
            ["config", "-"], Contract, recorder.Seams(key: new ConfigKey.Missing("no key")), Quick);

        exit.Should().Be(Contract.Exit("usage"));
        recorder.Launches.Should().BeEmpty();
        recorder.Probes.Should().Be(0);
        recorder.Notes.Should().Equal("no key");
    }

    [Fact]
    public async Task An_old_windows_binary_is_refused_and_never_fed_the_key_as_an_argument()
    {
        // The one fallback this must never take: an old creds.exe only reads the key from argv,
        // and putting it there is the leak this whole change exists to end.
        var recorder = new Recorder();

        var exit = await ConfigRelay.RunAsync(
            ["config", "-"], Contract, recorder.Seams(probe: () => Task.FromResult<string?>(OldHelp)), Quick);

        exit.Should().Be(Contract.Exit("toolMissing"));
        recorder.Launches.Should().BeEmpty();
        recorder.Notes.Should().ContainSingle().Which.Should().Contain("Update creds.exe");
    }

    [Fact]
    public async Task A_probe_that_answers_nothing_is_treated_as_an_old_binary()
    {
        var recorder = new Recorder();

        var exit = await ConfigRelay.RunAsync(
            ["config", "-"], Contract, recorder.Seams(probe: () => Task.FromResult<string?>(null)), Quick);

        exit.Should().Be(Contract.Exit("toolMissing"));
        recorder.Launches.Should().BeEmpty();
    }

    [Fact]
    public async Task A_probe_that_hangs_is_abandoned_at_the_timeout_and_nothing_crosses()
    {
        var recorder = new Recorder();
        var never = new TaskCompletionSource<string?>();

        var exit = await ConfigRelay.RunAsync(["config", "-"], Contract, recorder.Seams(probe: () => never.Task), Quick);

        exit.Should().Be(Contract.Exit("toolMissing"));
        recorder.Launches.Should().BeEmpty();
    }

    [Fact]
    public async Task A_windows_binary_that_cannot_be_started_says_so_rather_than_calling_it_old()
    {
        var recorder = new Recorder();

        var exit = await ConfigRelay.RunAsync(
            ["config", "-"],
            Contract,
            recorder.Seams(probe: () => throw new Win32Exception(2, "No such file or directory")),
            Quick);

        exit.Should().Be(Contract.Exit("toolMissing"));
        recorder.Launches.Should().BeEmpty();
        recorder.Notes.Should().ContainSingle().Which.Should().Contain(WslInterop.BinaryOverrideVariable);
    }

    [Fact]
    public async Task A_launch_failure_after_a_good_probe_is_toolMissing()
    {
        var recorder = new Recorder();

        var exit = await ConfigRelay.RunAsync(
            ["config", "-"],
            Contract,
            recorder.Seams(launch: (_, _) => throw new InvalidOperationException("could not start creds.exe")),
            Quick);

        exit.Should().Be(Contract.Exit("toolMissing"));
    }

    [Fact]
    public async Task No_diagnostic_on_any_path_carries_the_key()
    {
        // Every way this can end, each driven with the marker value, and every line it wrote
        // collected. The positive control first: the sweep must be able to see a planted copy, or
        // an empty result would prove nothing.
        Diagnostics.Carry(["a line with " + FakeKey + " in it"], FakeKey).Should().BeTrue("the sweep can see a planted key");

        var paths = new (string[] Args, Func<Recorder, ConfigRelaySeams> Seams)[]
        {
            (["config", FakeKey], r => r.Seams()),
            (["config", "-", FakeKey], r => r.Seams()),
            (["config", "-"], r => r.Seams(probe: () => Task.FromResult<string?>(OldHelp))),
            (["config", "-"], r => r.Seams(probe: () => Task.FromResult<string?>(null))),
            (["config", "-"], r => r.Seams(probe: () => throw new Win32Exception(2, "No such file or directory"))),
            (["config", "-"], r => r.Seams(launch: (_, _) => throw new InvalidOperationException("could not start creds.exe"))),
            (["config", "-"], r => r.Seams()),
        };

        var lines = new List<string>();
        foreach (var (args, seams) in paths)
        {
            var recorder = new Recorder();
            await ConfigRelay.RunAsync(args, Contract, seams(recorder), Quick);
            lines.AddRange(recorder.Notes);
        }

        lines.Should().NotBeEmpty("the refusal paths do write diagnostics");
        Diagnostics.Carry(lines, FakeKey).Should().BeFalse();
    }
}
