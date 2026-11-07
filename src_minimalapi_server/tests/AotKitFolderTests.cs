using System.Text.RegularExpressions;
using CredsForDevs.ServiceDefaults.Tests.Support;
using CredsForDevs.Tests.Leftovers;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The kit the native-binary check leaves (E2.3.S5, S5.1): <c>BackupArchiveCommandTests.ItLeavesAKit...</c> writes an archive and its key for a person to point the
/// published binary at. It used to write to ONE fixed folder in the temp root, shared by every run, owner-less and never removed. Now each run makes its own owned
/// folder and removes it, and a person who wants to keep the kit names a folder of their own (<c>CREDS_AOT_KIT_DIR</c>).
/// </summary>
/// <remarks>
/// <para>The test starts THIS executable twice at once, each running only the kit test, both with the same private <c>TMPDIR</c>, and reads the folder each printed.
/// POSIX and WSL only: the server executable runs on Linux only (F14), and two executables at once on Windows meet F29 (both sweep one root).</para>
/// <para>What the RED shows, said as it is: on <c>main</c> two overlapping runs wrote the one folder and BOTH PASSED, so the overlap itself never failed. What failed was
/// what they printed: the same path twice, in no owner form, and still there after both had ended.</para>
/// </remarks>
[Collection(ServerCollection.Name)]
public sealed class AotKitFolderTests : IDisposable
{
    private static readonly Regex Printed = new(@"aot-kit folder: (?<path>\S+)", RegexOptions.CultureInvariant);

    private readonly OwnedScope _owned = DarwinLayout.FreshOwnedScope();

    public void Dispose() => _owned.Dispose();

    [Fact]
    public async Task Two_runs_at_once_print_two_owned_folders_and_leave_neither()
    {
        Assert.SkipWhen(OperatingSystem.IsWindows(), "the server executable runs on Linux only (F14), and two executables at once on Windows meet F29");
        var ct = TestContext.Current.CancellationToken;
        File.Exists(HostProcess.Binary("CredVaultServer.Tests")).Should().BeTrue("premise: this executable's apphost is beside it");
        var tmp = _owned.Dir("kit-tmp"); // the children's TMPDIR, held by THIS test, so what they leave is still here to be read
        var env = new Dictionary<string, string> { ["TMPDIR"] = tmp, ["TEMP"] = tmp, ["TMP"] = tmp, ["CREDS_AOT_KIT_DIR"] = string.Empty };
        string[] args = ["--filter-method", "*BackupArchiveCommandTests.ItLeavesAKit*"];

        using var first = HostProcess.Start("CredVaultServer.Tests", args, env);
        using var second = HostProcess.Start("CredVaultServer.Tests", args, env);
        using var reapFirst = HostProcess.KillOnDispose(first);
        using var reapSecond = HostProcess.KillOnDispose(second);
        var outputs = await Task.WhenAll(OutputOf(first, ct), OutputOf(second, ct));

        first.ExitCode.Should().Be(0, "the kit test passes: " + outputs[0]);
        second.ExitCode.Should().Be(0, "and passes beside the other run: " + outputs[1]);
        var paths = outputs.Select(output => Printed.Match(output)).Select(match => { match.Success.Should().BeTrue("premise: each run printed its kit folder"); return match.Groups["path"].Value; }).ToArray();
        paths[0].Should().NotBe(paths[1], "two runs at once do not share a folder");
        foreach (var path in paths)
        {
            Owned.Pattern().IsMatch(Path.GetFileName(path)).Should().BeTrue($"{path} is an owned folder, not a fixed leaf");
            Path.GetFileName(path).Should().Contain("aot-kit");
            OwnedCreds.Canonical(Path.GetDirectoryName(path)!).Should().Be(OwnedCreds.Canonical(tmp), "it lies in the temp root the run was given");
            Directory.Exists(path).Should().BeFalse("the run removed its kit");
            File.Exists(path + ".owner").Should().BeFalse("and its claim");
        }

        Directory.EnumerateFileSystemEntries(tmp).Where(entry => Path.GetFileName(entry).Contains("aot-kit", StringComparison.Ordinal)).Should().BeEmpty("nothing of a kit is left in the temp root");
    }

    private static async Task<string> OutputOf(System.Diagnostics.Process process, CancellationToken ct)
    {
        var stdout = process.StandardOutput.ReadToEndAsync(ct);
        var stderr = process.StandardError.ReadToEndAsync(ct);
        (await HostProcess.ExitsWithinAsync(process, TimeSpan.FromSeconds(120), ct)).Should().BeTrue("the child run ends");
        return await stdout + await stderr;
    }
}
