using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Principal;
using CredsForDevs.ServiceDefaults.Tests.Support;
using FluentAssertions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>
/// The Windows handoff (E2.3.S2, S2.7; <c>[cadence e2d20eab 2]</c>, revision row 10, F31): a folder and a claim made by the NODE wrapper
/// (<c>src_vs_code/scripts/lib/leftovers.cjs</c>, token <c>creds</c>) are read by the C# sweep, and the Node sweep (the mounted reference, loaded through
/// <c>run-tests.mjs</c>'s <c>loadReferenceSweep</c>) lists them without touching them (F16). Windows only; every other platform skips, saying why.
/// </summary>
/// <remarks>
/// <para><b>What this proves.</b> Interoperability on PREPARED ownership: a Node-made folder is read under both keys. The claim's pid is rewritten in place to a
/// pid no process has and the clocks are set 11 minutes on, so the entry is old and dead; cases (b) to (d) then say whose the folder is, because on an
/// elevated runner a new file is owned by <c>BUILTIN\Administrators</c> and would read as a stranger's (revision row 11).</para>
/// <para><b>What it does not prove.</b> That a real folder of an elevated run is collected: it is not. It waits for a person (F31). Case (e) is the natural
/// trace, MEASURED: the Node output, not re-owned, is collected when its owner is the caller and preserved as <c>foreign-uid</c> when it is another SID, and the test says which this
/// runner gave (on windows-latest, run 42388598855, it was the caller's own, elevated or not).</para>
/// <para>The template's word for the stories' <c>unknown</c> (R5) is <c>foreign-uid</c> (T:LeftoversSweep.cs:273, listed as <c>foreign:</c>); case (c) asserts what the
/// stories mean - kept, listed, not collected - and the label the code gives.</para>
/// </remarks>
[SupportedOSPlatform("windows")]
public sealed class WindowsHandoffTests : IDisposable
{
    private static readonly TimeSpan Bound = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan Old = TimeSpan.FromMinutes(11);

    private const string Maker = "const h = require(process.env.CREDS_LEFTOVERS_CJS); const scope = h.cleanupScope(); process.stdout.write(h.ownedDir(scope, 'handoff'));";

    // The reference sweep as run-tests.mjs loads it, called with the options the stories name: { tmp, token: 'creds', now }.
    private const string NodeSweep =
        "import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';"
        + " const helper = createRequire(import.meta.url)(process.env.CREDS_LEFTOVERS_CJS);"
        + " const { loadReferenceSweep } = await import(pathToFileURL(process.env.CREDS_RUN_TESTS).href);"
        + " const sweep = await loadReferenceSweep(helper);"
        + " const result = sweep({ repo: process.env.CREDS_REPO, tmp: process.env.CREDS_TMP, token: 'creds', now: Date.now() + 11 * 60 * 1000 });"
        + " process.stdout.write(JSON.stringify(result));";

    private readonly OwnedScope _owned = DarwinLayout.FreshOwnedScope();

    public void Dispose() => _owned.Dispose();

    private static string ScriptsFolder => Path.Combine(RepositoryRoot.Path, "src_vs_code", "scripts");

    private static Dictionary<string, string> NodeEnv(string root) => new()
    {
        ["TEMP"] = root,
        ["TMP"] = root,
        ["CREDS_TMP"] = root,
        ["CREDS_REPO"] = RepositoryRoot.Path,
        ["CREDS_LEFTOVERS_CJS"] = Path.Combine(ScriptsFolder, "lib", "leftovers.cjs"),
        ["CREDS_RUN_TESTS"] = Path.Combine(ScriptsFolder, "run-tests.mjs"),
    };

    private static void RequireWindows() =>
        Assert.SkipUnless(OperatingSystem.IsWindows(), "the Windows handoff: the owner SID, the profile and the F16/F31 limits exist on Windows only");

    /// <summary>Run <c>node</c> with the given arguments to its end; its standard output. A Node that cannot run is a failure on CI (the job sets Node up) and a skip elsewhere.</summary>
    private static async Task<string> NodeAsync(IReadOnlyList<string> args, IReadOnlyDictionary<string, string> env, CancellationToken ct)
    {
        System.Diagnostics.Process process;
        try
        {
            process = HostProcess.StartFile("node", args, env);
        }
        catch (System.ComponentModel.Win32Exception ex)
        {
            if (Environment.GetEnvironmentVariable("CI") == "true") throw new InvalidOperationException("node is not on PATH, and the CI job sets Node 22 up before this test", ex);
            Assert.Skip($"node is not on PATH ({ex.Message})");
            throw;
        }

        using (process)
        {
            using var reaper = HostProcess.KillOnDispose(process);
            var output = process.StandardOutput.ReadToEndAsync(ct);
            var errors = process.StandardError.ReadToEndAsync(ct);
            await process.WaitForExitAsync(ct).WaitAsync(Bound, ct);
            process.ExitCode.Should().Be(0, $"node must run to its end; it said: {await errors}");
            return await output;
        }
    }

    /// <summary>The Node wrapper makes <c>ownedDir</c> in <paramref name="root"/> (handed as TEMP and TMP) and leaves it; the claim's pid is then rewritten IN PLACE to a pid no
    /// process has. Returns the folder.</summary>
    private static async Task<string> MadeByNodeAsync(string root, CancellationToken ct)
    {
        var dir = (await NodeAsync(["-e", Maker], NodeEnv(root), ct)).Trim();
        Directory.Exists(dir).Should().BeTrue("premise: the Node wrapper made the folder");
        Path.GetDirectoryName(dir)!.TrimEnd('\\').Should().Be(root.TrimEnd('\\'), "premise: and made it in the root it was handed as TEMP");
        var claim = dir + ".owner";
        File.Exists(claim).Should().BeTrue("premise: and its claim, beside it");
        var written = Owner.Parse(File.ReadAllText(claim));
        written.Should().NotBeNull("premise: the Node record reads under the C# grammar");
        var dead = UnmatchablePid.Next();
        UnmatchablePid.AssertNoSuchProcess(dead);
        File.WriteAllText(claim, (written! with { Pid = dead, Start = null, Ns = null }).Format() + "\n");
        return dir;
    }

    private static SweepResult CSharpSweep(string root) =>
        LeftoversSweep.Run(new SweepOptions(root, DateTimeOffset.UtcNow + Old, LeftoversSweep.MinAge, Liveness.ProbeProcess, Scope.IsMine));

    private static string? ReasonOf(SweepResult result, string path) =>
        result.Preserved.Where(p => p.Path == path).Select(p => p.Reason).SingleOrDefault();

    private static bool Elevated() => new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);

    // ---- (a) and (b) ---------------------------------------------------------------------------------------------

    [Fact]
    public async Task The_node_sweep_keeps_a_node_made_folder_and_lists_it_unverified_and_the_csharp_sweep_collects_it_once_it_is_re_owned()
    {
        RequireWindows();
        var ct = TestContext.Current.CancellationToken;
        var root = _owned.Dir("handoff-root");
        var dir = await MadeByNodeAsync(root, ct);

        // (a) the Node sweep: it changes nothing on Windows until F16 closes, and it names THIS folder, so it read it as its own token's (F9)
        var node = await NodeAsync(["--input-type=module", "-e", NodeSweep], NodeEnv(root), ct);
        using var report = System.Text.Json.JsonDocument.Parse(node);
        var listed = report.RootElement.GetProperty("listed").EnumerateArray().Select(line => line.GetString()!).ToList();
        listed.Should().ContainSingle(line => line.StartsWith("unverified: ", StringComparison.Ordinal) && line.Contains(Path.GetFileName(dir), StringComparison.OrdinalIgnoreCase),
            "(a) exactly one `unverified: <path>` line, and it names THIS folder, not another token's");
        report.RootElement.GetProperty("removed").GetArrayLength().Should().Be(0, "(a) the Node sweep removes nothing on Windows");
        Directory.Exists(dir).Should().BeTrue("(a) the Node sweep removed nothing");
        File.Exists(dir + ".owner").Should().BeTrue();

        // (b) both keys right: folder and claim re-owned to the caller, inside the profile
        using var ownership = new WindowsOwnership();
        ownership.OwnedByCaller(dir);
        ownership.OwnedByCaller(dir + ".owner");
        Scope.IsMine(dir).Should().BeTrue("(b) premise: the folder reads as the caller's");
        Scope.IsMine(dir + ".owner").Should().BeTrue("(b) premise: so does its claim");

        var result = CSharpSweep(root);

        result.Removed.Should().Equal(dir);
        Directory.Exists(dir).Should().BeFalse();
        File.Exists(dir + ".owner").Should().BeFalse();
        result.Errors.Should().BeEmpty();
    }

    // ---- (c) -----------------------------------------------------------------------------------------------------

    [Fact]
    public async Task A_node_made_folder_whose_claim_is_owned_by_another_account_is_kept_and_listed()
    {
        RequireWindows();
        var ct = TestContext.Current.CancellationToken;
        var root = _owned.Dir("handoff-root");
        var dir = await MadeByNodeAsync(root, ct);
        using var ownership = new WindowsOwnership();
        ownership.OwnedByCaller(dir);
        ownership.OwnedByCaller(dir + ".owner");
        ownership.ForeignToCaller(dir + ".owner");
        Assert.SkipUnless(ownership.LastForeignBranch?.StartsWith("owner SID", StringComparison.Ordinal) == true, "the token may not own BUILTIN\\Administrators, so the claim's owner SID cannot be made foreign in place");
        TestContext.Current.AddWarning($"handoff (c): ForeignToCaller took the {ownership.LastForeignBranch}");

        var result = CSharpSweep(root);

        ReasonOf(result, dir).Should().Be("foreign-uid", "the claim's owner SID is another account's; the stories call this case `unknown`");
        result.Listed.Should().ContainSingle(line => line.StartsWith("foreign: folder " + Path.GetFileName(dir), StringComparison.Ordinal));
        result.Removed.Should().BeEmpty();
        Directory.Exists(dir).Should().BeTrue();
        File.Exists(dir + ".owner").Should().BeTrue();
    }

    // ---- (d) -----------------------------------------------------------------------------------------------------

    [Fact]
    public async Task A_node_made_folder_outside_the_profile_is_kept_and_listed_though_both_owners_are_the_callers()
    {
        RequireWindows();
        var ct = TestContext.Current.CancellationToken;
        var documents = Environment.GetFolderPath(Environment.SpecialFolder.CommonDocuments);
        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        Assert.SkipWhen(string.IsNullOrEmpty(documents), "this machine has no public documents folder");
        OwnedDir outside;
        try
        {
            outside = OwnedDir.Create("handoff-outside", documents);
        }
        catch (InvalidOperationException ex)
        {
            Assert.Skip($"the public documents folder is not writable here ({ex.Message})");
            throw;
        }

        using (outside)
        {
            var dir = await MadeByNodeAsync(outside.Path, ct);
            using var ownership = new WindowsOwnership();
            ownership.OwnedByCaller(dir);
            ownership.OwnedByCaller(dir + ".owner");
            var caller = WindowsIdentity.GetCurrent().User;
            new DirectoryInfo(dir).GetAccessControl().GetOwner(typeof(SecurityIdentifier)).Should().Be(caller, "(d) premise: the folder's owner is the caller's");
            new FileInfo(dir + ".owner").GetAccessControl().GetOwner(typeof(SecurityIdentifier)).Should().Be(caller, "(d) premise: so is the claim's");
            dir.StartsWith(profile, StringComparison.OrdinalIgnoreCase).Should().BeFalse("(d) premise: the path is outside the profile");

            var result = CSharpSweep(outside.Path);

            ReasonOf(result, dir).Should().Be("foreign-uid", "the profile is the other half of the key");
            result.Listed.Should().ContainSingle(line => line.StartsWith("foreign: folder " + Path.GetFileName(dir), StringComparison.Ordinal));
            result.Removed.Should().BeEmpty();
            Directory.Exists(dir).Should().BeTrue();
        }
    }

    // ---- (e) -----------------------------------------------------------------------------------------------------

    [Fact]
    public async Task The_natural_node_output_not_re_owned_is_judged_by_its_real_owner_and_the_runner_says_which_outcome_it_gave()
    {
        RequireWindows();
        var ct = TestContext.Current.CancellationToken;
        var root = _owned.Dir("handoff-root");
        var dir = await MadeByNodeAsync(root, ct);
        // MEASURED, never assumed: on an elevated runner a new folder was expected to be owned by BUILTIN\Administrators (F31), and on windows-latest (run 42388598855) it was the caller's own.
        var mine = Scope.IsMine(dir) && Scope.IsMine(dir + ".owner");
        TestContext.Current.AddWarning($"windows ownership: elevated={Elevated()}; a new folder of this run is owned by {OwnedCreds.OwnerKind(dir)}, its claim by {OwnedCreds.OwnerKind(dir + ".owner")}; outcome: {(mine ? "collected" : "foreign-uid, kept (F31)")}");

        var result = CSharpSweep(root);

        if (mine)
        {
            result.Removed.Should().Equal(dir, "both keys are the caller's, so the old, dead folder is collected");
            Directory.Exists(dir).Should().BeFalse();
            File.Exists(dir + ".owner").Should().BeFalse();
        }
        else
        {
            ReasonOf(result, dir).Should().Be("foreign-uid", "F31: what an elevated run leaves, owned by another SID, waits for a person");
            result.Removed.Should().BeEmpty();
            Directory.Exists(dir).Should().BeTrue();
            File.Exists(dir + ".owner").Should().BeTrue();
        }
    }
}
