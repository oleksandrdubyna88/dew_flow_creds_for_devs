// The start-of-run sweep: the C# encoding of `common/test-leftovers.md` §4 for this repository, in the shape of the
// conventions' Node sweep (`tools/lib/leftovers-sweep.mjs`) — the same order, the same decision table, the same
// quarantine and restore, without the worktree pass (this repository makes no worktree).
//
// Scope selects, liveness authorises, uncertainty preserves. A folder is removed only on TWO keys, both required:
//   scope        its name's owner, its record's owner and the caller's token are ONE, this repository's token is its own,
//                and the kernel owner of the folder AND of its claim is the caller (`Mine`);
//   abandonment  the record's liveness is `Gone` — no process has that pid, in a process list that hides none.
// Everything else is kept and named: `young` (age SELECTS: it keeps the sweep off a folder between its creation and its
// claim, it never authorises), `live`, `foreign host`, `unknown`, `unreadable`, `foreign-uid` (another uid owns it,
// whatever its name says), `unmarked` (an owner-form folder with no claim is nobody's the helper knows: listed, never
// collected, however old), `other clone` (a folder holding a `.git` FILE), `legacy` and `replaced`.
//
// The lists. What a sweep may not touch it still says: `foreign:` (another owner's resource of this token), `legacy:` (a
// name from before the owner segment, with the exact command a person would run — listed, never collected: the rule allows
// preserving more, and this repository never produced a legacy name) and `unmarked:`. They go in `Listed` and change nothing.
//
// Removal is by identity, never by a name read earlier. The folder's device and inode and its claim are captured BEFORE
// the claim is judged; just before the removal both are re-checked, the folder is renamed atomically to the sibling
// `.<name>.<quarantine word>-<pid>-<hex>` (same parent, so never across a file system; a leading `.` so no prefix match
// reaches it), checked again where it is, and only then removed — what changed in between is renamed back and named
// `replaced`. The claim is deleted afterwards only while its identity and text are still the ones captured. A quarantine a
// killed sweep left is restored under its name when that is free and its renamer is gone, and listed — every run, never
// removed — when the name is taken.
//
// Candidates are real directories (a symlink or a junction is never one, whatever its name or its claim says) and orphan
// claims are regular files. Order: quarantines, folders, orphan claims, each step in its own `try`. A sweep never throws:
// every failure is an `Errors` entry, and the caller decides what to print — it never changes a run's exit code.

using System.Globalization;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>Seams for a change between the capture, the verdict and the removal. Each runs at the named moment and
/// nothing else does: <c>AfterCapture(dir)</c> after the identity and claim are captured, <c>AfterVerdict(dir)</c> after
/// the verdict and before the identity is re-checked, <c>AfterRename(dir, quarantine)</c> after the rename,
/// <c>AfterRemove(dir, quarantine)</c> after the quarantine is removed and before the claim is, <c>AfterReserve(original,
/// quarantine)</c> between the restore's placeholder and its rename (Linux).</summary>
public sealed record SweepHooks(
    Action<string>? AfterCapture = null,
    Action<string>? AfterVerdict = null,
    Action<string, string>? AfterRename = null,
    Action<string, string>? AfterRemove = null,
    Action<string, string>? AfterReserve = null,
    Func<string, string>? QuarantineName = null);

/// <summary>What one sweep needs: the folder to sweep, the clock, the age window, the liveness query, and the kernel-owner
/// question (default <see cref="Scope.IsMine"/>; a seam, because a second uid cannot be had in a test).</summary>
public sealed record SweepOptions(
    string Tmp, DateTimeOffset Now, TimeSpan MinAge, Func<long, Probe> Probe, Func<string, bool>? Mine = null, SweepHooks? Hooks = null);

/// <summary>What one sweep did: the folders and claims it removed, the entries it kept with their reasons, the
/// <c>foreign:</c> / <c>legacy:</c> / <c>unmarked:</c> / <c>notice:</c> lines, and the errors it met.</summary>
public sealed record SweepResult(
    IReadOnlyList<string> Removed,
    IReadOnlyList<(string Path, string Reason)> Preserved,
    IReadOnlyList<string> Listed,
    IReadOnlyList<string> Errors)
{
    public static SweepResult Empty { get; } = new([], [], [], []);

    public int Count => Removed.Count + Preserved.Count + Listed.Count + Errors.Count;
}

public static class LeftoversSweep
{
    // Spelled in two pieces: this file reads names, and the machine scan reads it for the bare prefix too.
    private static readonly Regex QuarantineEntry = new(
        @"^\.(.+)\." + "teststo" + @"delete-quarantine-([0-9]+)-([0-9a-f]+)\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>The names whose folder sits in a sibling quarantine of <paramref name="tmp"/>: a <c>.&lt;name&gt;.&lt;quarantine word&gt;-…</c> entry
    /// (compared without case). A claim of such a name is not an orphan — the quarantine is restored (or removed by a person) under it, and a
    /// claim deleted now would leave that folder behind with nobody's mark.</summary>
    internal static HashSet<string> QuarantinedNames(string tmp) =>
        new(Directory.EnumerateFileSystemEntries(tmp).Select(entry => QuarantineEntry.Match(Path.GetFileName(entry))).Where(m => m.Success).Select(m => m.Groups[1].Value),
            StringComparer.OrdinalIgnoreCase);

    /// <summary>Rule §4: ten minutes.</summary>
    public static readonly TimeSpan MinAge = TimeSpan.FromMinutes(10);

    /// <summary>Collect what a killed run left behind. Never throws.</summary>
    public static SweepResult Run(SweepOptions options)
    {
        var pass = new Pass(options);
        try
        {
            pass.Go();
        }
        catch (Exception ex)
        {
            pass.Fail("sweep", ex);
        }

        return pass.Result();
    }

    private sealed class Pass(SweepOptions options)
    {
        private readonly List<string> _removed = [];
        private readonly List<(string Path, string Reason)> _preserved = [];
        private readonly List<string> _listed = [];
        private readonly List<string> _errors = [];
        private readonly Dictionary<long, Probe> _asked = [];
        private readonly Func<string, bool> _mine = options.Mine ?? Scope.IsMine;
        private readonly SweepHooks _hooks = options.Hooks ?? new SweepHooks();
        private string _owner = "";

        private enum Relation { Other, Own, Foreign, Legacy }

        public SweepResult Result() => new(_removed, _preserved, _listed, _errors);

        public void Fail(string label, Exception ex) => _errors.Add($"{label}: {FirstLine(ex)}");

        public void Go()
        {
            _owner = OwnerToken.This;
            try
            {
                _ = Entries();
            }
            catch (Exception ex)
            {
                Fail("temp root " + options.Tmp, ex);
                return;
            }

            Step("quarantines", RestoreQuarantines);
            Step("folders", SweepFolders);
            Step("claims", SweepOrphanClaims);
        }

        // ---- the passes -----------------------------------------------------------------------------------------

        /// <summary>A quarantine a killed sweep left: put it back under its name when the name is free and its renamer is
        /// gone; list it, every run, when the name is taken.</summary>
        private void RestoreQuarantines() => ForEachEntry("quarantine", entry =>
        {
            var found = QuarantineEntry.Match(Path.GetFileName(entry));
            if (!found.Success) return;
            var inner = found.Groups[1].Value;
            if (RelationOf(inner).Relation == Relation.Other) return;
            var identity = Native.IdentityOf(entry);
            if (identity is not { IsDirectory: true, IsLink: false } real) return;
            if (!_mine(entry)) return; // another uid's
            // The owner-state checks come BEFORE the probe: a renamer that is not a canonical pid the OS can have is unknown, never asked.
            if (Liveness.AskablePid(found.Groups[2].Value) is not { } renamer) return;
            if (StateOf(renamer) != ProbeState.Dead) return; // its renamer may still be working
            // A renamer in another pid namespace has a pid this process cannot see: it reads dead here and may be mid-delete.
            if (!PastWindow(real)) return;
            var original = Path.Combine(options.Tmp, inner);
            if (RestoreOnto(entry, original)) _listed.Add($"notice: restored {inner} from a quarantine a killed sweep left");
            else Conflict(entry, inner);
        });

        private void SweepFolders() => ForEachEntry("folder", dir =>
        {
            var name = Path.GetFileName(dir);
            var (relation, nameOwner) = RelationOf(name);
            if (relation == Relation.Other) return;
            // The entry ITSELF, a link never followed: a symlink or junction is no candidate, whatever its name says.
            var identity = Native.IdentityOf(dir);
            if (identity is not { IsDirectory: true, IsLink: false } real) return;
            if (relation == Relation.Foreign)
            {
                _listed.Add($"foreign: folder {name} — owner {nameOwner}");
                return;
            }

            if (HasGitFile(dir))
            {
                Keep(dir, "other clone"); // a linked worktree this repository does not list
                return;
            }

            if (relation == Relation.Legacy)
            {
                if (Young(real)) Keep(dir, "young");
                else
                {
                    Keep(dir, "legacy");
                    _listed.Add($"legacy: folder {name} — remove with: {RemoveCommand(dir, dir + ClaimSuffix)}");
                }

                return;
            }

            // Identity first, BEFORE the claim is read and the verdict made.
            var captured = Captured.Of(real, dir, _mine);
            _hooks.AfterCapture?.Invoke(dir);
            var (remove, reason, _) = Judge(dir, dir + ClaimSuffix, real.WriteTime, nameOwner!);
            if (!remove)
            {
                Explain("folder", dir, reason, nameOwner!);
                return;
            }

            RemoveFolder(dir, captured);
        });

        /// <summary>A claim with no folder is what a helper that claims FIRST leaves when it dies between the claim and the
        /// create. It is a claim like any other: its owner decides — gone removes it; live, foreign, unknown and
        /// unreadable keep it. Age only selects.</summary>
        private void SweepOrphanClaims()
        {
            var quarantined = QuarantinedNames(); // read once, after the quarantine pass has restored what it could
            ForEachEntry("claim", claim => SweepOrphanClaim(claim, quarantined));
        }

        private void SweepOrphanClaim(string claim, HashSet<string> quarantined)
        {
            if (!claim.EndsWith(ClaimSuffix, StringComparison.Ordinal)) return;
            var identity = Native.IdentityOf(claim);
            if (identity is not { IsRegular: true, IsLink: false } written) return; // never a link, never a folder
            var folder = claim[..^ClaimSuffix.Length];
            var (relation, nameOwner) = RelationOf(Path.GetFileName(folder));
            if (relation == Relation.Other || Native.IdentityOf(folder) is not null || Young(written)) return;
            if (quarantined.Contains(Path.GetFileName(folder))) return; // its folder is in a sibling quarantine: the claim goes with that folder, not before
            if (relation == Relation.Foreign)
            {
                _listed.Add($"foreign: claim {Path.GetFileName(claim)} — owner {nameOwner}");
                return;
            }

            if (relation == Relation.Legacy)
            {
                Keep(claim, "legacy");
                _listed.Add($"legacy: claim {Path.GetFileName(claim)} — remove with: {RemoveClaimCommand(claim)}");
                return;
            }

            var (remove, reason, read) = Judge(claim, claim, written.WriteTime, nameOwner!);
            if (!remove)
            {
                Explain("claim", claim, reason, nameOwner!);
                return;
            }

            RemoveOrphanClaim(claim, written, read);
        }

        /// <summary>The quarantines in the temp root now, and the <c>quarantine-conflict</c> entries this report already named (compared without case).</summary>
        private HashSet<string> QuarantinedNames()
        {
            var names = LeftoversSweep.QuarantinedNames(options.Tmp);
            foreach (var kept in _preserved.Where(p => p.Reason == "quarantine-conflict")) names.UnionWith(QuarantineEntry.Match(Path.GetFileName(kept.Path)) is { Success: true } m ? [m.Groups[1].Value] : []);
            return names;
        }

        /// <summary>Still the file that was judged, with the text that was judged: delete it. Anything else is kept, <c>replaced</c>.</summary>
        internal void RemoveOrphanClaim(string claim, Identity written, ClaimRead read)
        {
            if (!SameIdentity(Native.IdentityOf(claim), written) || Scope.ReadClaimText(claim, _mine) != read)
            {
                Keep(claim, "replaced");
                return;
            }

            File.Delete(claim);
            _removed.Add(claim);
        }

        // ---- the verdict ----------------------------------------------------------------------------------------

        /// <summary>Rule §4's table for one own-scope candidate: age selects, the kernel owner and the record authorise,
        /// liveness decides. <paramref name="scopePath"/> is what the kernel owner is asked about (the folder, or for an
        /// orphan the claim); <paramref name="claim"/> is read through the same seam.</summary>
        private (bool Remove, string Reason, ClaimRead Read) Judge(string scopePath, string claim, DateTimeOffset written, string nameOwner)
        {
            var read = Scope.ReadClaimText(claim, _mine);
            if (options.Now - written < options.MinAge) return (false, "young", read);
            if (!_mine(scopePath)) return (false, "foreign-uid", read);
            switch (read)
            {
                case ClaimRead.Missing:
                    return (false, "unmarked", read);
                case ClaimRead.Unreadable unreadable:
                    return (false, unreadable.Reason ?? "unreadable", read);
            }

            var record = Owner.Parse(((ClaimRead.Text)read).Value);
            if (record is null) return (false, "unreadable", read);
            var facts = new Facts(CallerOwner: _owner, NameOwner: nameOwner, KernelMine: true);
            return Liveness.State(record, Probe, facts) switch
            {
                OwnerState.Gone => (true, "", read),
                OwnerState.Live => (false, "live", read),
                _ => (false, string.Equals(record.Host, Owner.This.Host, StringComparison.OrdinalIgnoreCase) ? "unknown" : "foreign host", read),
            };
        }

        /// <summary>A kept entry, and for what is not the caller's to remove, the line a person reads.</summary>
        private void Explain(string kind, string target, string reason, string nameOwner)
        {
            Keep(target, reason);
            var name = Path.GetFileName(target);
            if (reason == "unmarked") _listed.Add($"unmarked: {kind} {name}");
            if (reason == "foreign-uid") _listed.Add($"foreign: {kind} {name} — owner {nameOwner}");
        }

        // ---- removal by identity --------------------------------------------------------------------------------

        /// <summary>Re-check the folder and its claim, rename it away atomically, check it again where it is, remove it, then
        /// delete its claim only while the claim is still the one captured. A change in between puts the folder back
        /// under its own name (only if that is still free) and says <c>replaced</c>.</summary>
        internal void RemoveFolder(string dir, Captured captured)
        {
            _hooks.AfterVerdict?.Invoke(dir);
            if (!Unchanged(dir, captured))
            {
                Keep(dir, "replaced");
                return;
            }

            var quarantine = MoveToQuarantine(dir);
            _hooks.AfterRename?.Invoke(dir, quarantine);
            if (!IntactAt(dir, quarantine, captured))
            {
                if (RestoreOnto(quarantine, dir)) Keep(dir, "replaced");
                else Conflict(quarantine, Path.GetFileName(dir));
                return;
            }

            // Removal.Quietly unlinks every top-level link first (as a link, never what it points at), then removes the folder.
            string? detail = null;
            if (!Removal.Quietly(quarantine, line => detail = line)) throw new IOException(detail ?? "it could not be removed");
            _removed.Add(dir);
            _hooks.AfterRemove?.Invoke(dir, quarantine);
            DeleteClaimIfStill(dir + ClaimSuffix, captured);
        }

        /// <summary>Rename <paramref name="dir"/> to a quarantine name nothing holds: the rename is EXCLUSIVE (a name already taken is
        /// somebody else's — an empty folder there is never replaced), and a taken name draws another suffix, at most
        /// <see cref="Owned.MaxDraws"/> times.</summary>
        private string MoveToQuarantine(string dir)
        {
            for (var draw = 0; draw < Owned.MaxDraws; draw++)
            {
                var quarantine = _hooks.QuarantineName?.Invoke(dir) ?? QuarantinePath(dir);
                if (Native.RenameExclusively(dir, quarantine)) return quarantine;
            }

            throw new IOException($"no free quarantine name for {Path.GetFileName(dir)} after {Owned.MaxDraws} draws");
        }

        /// <summary>The claim goes only under the identity AND the text captured before the rename: a claim another run
        /// put under that name since is not the one that was judged.</summary>
        private void DeleteClaimIfStill(string claim, Captured captured)
        {
            var now = Native.IdentityOf(claim);
            if (now is null) return; // already gone: nothing to remove
            if (SameIdentity(now, captured.Claim) && Scope.ReadClaimText(claim, _mine) == captured.Text) File.Delete(claim);
            else Keep(claim, "replaced");
        }

        private bool Unchanged(string dir, Captured captured) =>
            SameIdentity(Native.IdentityOf(dir), captured.Dir) && ClaimUnchanged(dir + ClaimSuffix, captured);

        /// <summary>Is what is in the quarantine still the folder that was judged, with the claim at its ORIGINAL path
        /// unchanged? A read that fails is a change: the folder is put back, never removed on a guess.</summary>
        private bool IntactAt(string dir, string quarantine, Captured captured)
        {
            try
            {
                return SameIdentity(Native.IdentityOf(quarantine), captured.Dir) && ClaimUnchanged(dir + ClaimSuffix, captured);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
            {
                return false;
            }
        }

        private bool ClaimUnchanged(string claim, Captured captured) =>
            SameIdentity(Native.IdentityOf(claim), captured.Claim) && Scope.ReadClaimText(claim, _mine) == captured.Text;

        private static bool SameIdentity(Identity? a, Identity? b) =>
            a is not null && b is not null && a.Value.Dev == b.Value.Dev && a.Value.Ino == b.Value.Ino && a.Value.IsDirectory == b.Value.IsDirectory;

        private static string QuarantinePath(string dir) =>
            Path.Combine(
                Path.GetDirectoryName(dir)!,
                "." + Path.GetFileName(dir) + "." + "teststo" + "delete-quarantine-" + Environment.ProcessId + "-" + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(4)));

        /// <summary>Put a quarantined folder back under <paramref name="original"/> only if that name is FREE. Windows: a
        /// directory move onto an existing one fails, so it is exclusive by itself. Linux: the name is reserved with an
        /// empty mode-700 folder, then <c>rename(2)</c> replaces it atomically; when the rename fails the placeholder is
        /// removed only while it is still a real, empty folder of the caller's — a name taken over in between is never
        /// touched, and the quarantine stays, listed, instead of being orphaned behind a claim nobody can read.</summary>
        private bool RestoreOnto(string quarantine, string original)
        {
            if (OperatingSystem.IsWindows())
            {
                try
                {
                    Directory.Move(quarantine, original);
                    return true;
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    return false;
                }
            }

            try
            {
                if (!Native.MakeDirectoryExclusively(original)) return false;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                return false;
            }

            try
            {
                _hooks.AfterReserve?.Invoke(original, quarantine);
                Native.RenameOnto(quarantine, original);
                return true;
            }
            catch (Exception)
            {
                RemoveOwnEmptyPlaceholder(original);
                return false;
            }
        }

        private void RemoveOwnEmptyPlaceholder(string placeholder)
        {
            try
            {
                if (Native.IdentityOf(placeholder) is { IsDirectory: true, IsLink: false } && _mine(placeholder)) Directory.Delete(placeholder, recursive: false);
            }
            catch (Exception)
            {
                // Gone, not empty, or not ours: leave it.
            }
        }

        /// <summary>A quarantine that could not go back: kept, and listed with the command that removes it by hand.</summary>
        private void Conflict(string quarantine, string name)
        {
            Keep(quarantine, "quarantine-conflict");
            _listed.Add($"quarantine-conflict: folder {Path.GetFileName(quarantine)} — its name {name} is taken; remove by hand with: {RemoveCommand(quarantine)}");
        }

        // ---- reads ----------------------------------------------------------------------------------------------

        /// <summary>What a name says about whose it is, for THIS repository: <c>Own</c> (the caller's), <c>Foreign</c>
        /// (another owner's), <c>Legacy</c> (before the owner segment) or <c>Other</c> (not this sweep's business).</summary>
        private (Relation Relation, string? NameOwner) RelationOf(string name)
        {
            switch (Owned.Classify(name))
            {
                case NameForm.Owner form when string.Equals(form.Token, OwnedToken.RepoToken, StringComparison.OrdinalIgnoreCase):
                    return (form.Segment == _owner ? Relation.Own : Relation.Foreign, form.Segment);
                case NameForm.Legacy form when string.Equals(form.Token, OwnedToken.RepoToken, StringComparison.OrdinalIgnoreCase):
                    return (Relation.Legacy, null);
                default:
                    return (Relation.Other, null);
            }
        }

        private bool Young(Identity written) => options.Now - written.WriteTime < options.MinAge;

        /// <summary>Is the quarantine as old as the window by BOTH stamps — its rename (change time) and its last deletion
        /// (write time)?</summary>
        private bool PastWindow(Identity identity) =>
            options.Now - identity.ChangeTime >= options.MinAge && options.Now - identity.WriteTime >= options.MinAge;

        private static bool HasGitFile(string dir)
        {
            try
            {
                return Native.IdentityOf(Path.Combine(dir, ".git")) is { IsRegular: true };
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
            {
                return false;
            }
        }

        /// <summary>The probe, asked at most once per pid.</summary>
        private Probe Probe(long pid)
        {
            if (!_asked.TryGetValue(pid, out var seen))
            {
                seen = options.Probe(pid); // a throw is not cached: State reads it as unknown
                _asked[pid] = seen;
            }

            return seen;
        }

        private ProbeState StateOf(long pid)
        {
            try
            {
                return Probe(pid).State;
            }
            catch (Exception ex) when (ex is not OutOfMemoryException)
            {
                return ProbeState.Unknown;
            }
        }

        private string[] Entries() => [.. Directory.EnumerateFileSystemEntries(options.Tmp)];

        private void ForEachEntry(string label, Action<string> body)
        {
            foreach (var entry in Entries())
            {
                try
                {
                    body(entry);
                }
                catch (Exception ex)
                {
                    Fail($"{label} {entry}", ex);
                }
            }
        }

        private void Step(string label, Action run)
        {
            try
            {
                run();
            }
            catch (Exception ex)
            {
                Fail(label, ex);
            }
        }

        private void Keep(string target, string reason) => _preserved.Add((target, reason));

        private static string FirstLine(Exception ex) => ex.Message.Split('\n')[0].TrimEnd('\r');

        // ---- the lists ------------------------------------------------------------------------------------------

        /// <summary>The command a person would run to remove these by hand, for this platform.</summary>
        private static string RemoveCommand(string target, string? claim = null)
        {
            var windows = OperatingSystem.IsWindows();
            var targets = string.Join(windows ? ", " : " ", new[] { target, claim }.OfType<string>().Select(Quote));
            return windows ? $"Remove-Item -Recurse -Force {targets}" : $"rm -rf -- {targets}";
        }

        /// <summary>The same for an orphan claim: one file, no recursion.</summary>
        private static string RemoveClaimCommand(string claim) =>
            OperatingSystem.IsWindows() ? $"Remove-Item -Force {Quote(claim)}" : $"rm -f -- {Quote(claim)}";

        private static string Quote(string text) =>
            OperatingSystem.IsWindows() ? $"'{text.Replace("'", "''")}'" : $"'{text.Replace("'", "'\\''")}'";

    }

    /// <summary>What identifies a candidate at the moment BEFORE it is judged: the folder's device and inode, the
    /// claim's identity and its text.</summary>
    internal sealed record Captured(Identity Dir, Identity? Claim, ClaimRead Text)
    {
        /// <summary>The capture of <paramref name="dir"/> whose own identity is <paramref name="real"/> — the claim beside it is
        /// read through <paramref name="mine"/>.</summary>
        public static Captured Of(Identity real, string dir, Func<string, bool> mine) =>
            new(real, Native.IdentityOf(dir + ClaimSuffix), Scope.ReadClaimText(dir + ClaimSuffix, mine));

        /// <summary>The capture of the real directory at <paramref name="dir"/>, or null when it is not one (absent, a file, a link).</summary>
        public static Captured? Read(string dir, Func<string, bool>? mine = null) =>
            Native.IdentityOf(dir) is { IsDirectory: true, IsLink: false } real ? Of(real, dir, mine ?? Scope.IsMine) : null;
    }

    private const string ClaimSuffix = ".owner";

    /// <summary>The ONE removal of a folder the caller found earlier — the sweep's own: the folder and its claim are re-checked
    /// against <paramref name="captured"/>, the folder is renamed away atomically, checked again where it is, removed, and its
    /// claim goes only while it is still the one captured. What changed since is kept and named <c>replaced</c>. Never throws.</summary>
    internal static SweepResult RemoveCaptured(string dir, Captured captured, Func<string, bool>? mine = null, SweepHooks? hooks = null)
    {
        var pass = new Pass(new SweepOptions(Path.GetDirectoryName(dir)!, DateTimeOffset.UtcNow, MinAge, Liveness.ProbeProcess, mine, hooks));
        try
        {
            pass.RemoveFolder(dir, captured);
        }
        catch (Exception ex)
        {
            pass.Fail("remove " + dir, ex);
        }

        return pass.Result();
    }

    /// <summary>The same for an orphan claim: it goes only while it is the file, with the text, that the caller saw.</summary>
    internal static SweepResult RemoveCapturedClaim(string claim, Identity written, ClaimRead read, Func<string, bool>? mine = null)
    {
        var pass = new Pass(new SweepOptions(Path.GetDirectoryName(claim)!, DateTimeOffset.UtcNow, MinAge, Liveness.ProbeProcess, mine));
        try
        {
            pass.RemoveOrphanClaim(claim, written, read);
        }
        catch (Exception ex)
        {
            pass.Fail("remove " + claim, ex);
        }

        return pass.Result();
    }
}
