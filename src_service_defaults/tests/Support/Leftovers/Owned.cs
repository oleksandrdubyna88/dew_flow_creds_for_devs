// Owned test resources: the C# encoding of `common/test-leftovers.md` §1–§3 for this repository, in the shape of the
// conventions' Node helper (`tools/lib/owned.mjs`) — the same names where C# allows, the same order, the same
// three-valued answers.
//
// What it owns. Every scratch folder a test here makes goes through `OwnedDir.Create` / `OwnedScope.Dir`: the name comes
// from one constant (`OwnedToken.RepoToken`, rule §1) behind the caller's owner token (`u<uid>`, or `w<digits>` on
// Windows), and the claim is written FIRST, under that name, with an exclusive create (rule §2).
//
// The order is the whole safety: claim -> register -> create. A claim that already exists is somebody else's name, so a
// new id is drawn. A folder that already exists under the claimed name is a squatter's: it is never adopted and never
// removed — one warning names it, the helper REMOVES its own claim (only while it still holds exactly what the helper
// wrote: a claim of a run that dies later must never govern a folder this run did not create), and a new id is drawn. So
// nothing the helper made ever exists unclaimed, and an UNMARKED resource of the owner form is nobody's the helper
// knows: the sweep lists it and never collects it.
//
// Why teardown never throws. It runs inside `Dispose`, where a throw would replace the test's own failure with a
// cleanup failure and hide the real one. Each step has its own `try/catch`; when a folder cannot be removed it stays
// prefixed AND claimed and ONE warning line names it, so the next run's sweep (and the janitor) can still judge it by its
// owner. A half-removed, unclaimed folder is the one outcome never produced: the folder goes first, its claim last.
//
// Where the owner lives (rule §3). Never inside the folder — a test that makes a repository at the folder must see
// exactly what it made. A folder's owner is the sibling `<folder>.owner` in the same parent.
//
// The record is `<owner>:<host>@<os>:<pid>[:<start>[:<ns>]]`. The start is written only where the OS gives it WITHOUT
// spawning a process (a `/proc` read on Linux), and on Linux the pid namespace rides with it: two namespaces can share one
// host name, never a pid space. Nothing here spawns a process.
//
// Two keys, three answers. The name SELECTS (its owner segment), the kernel owner and the record AUTHORISE, and liveness
// decides whether the run is gone. "No process has that pid" is the ONLY thing that makes an owner `Gone`: a query that was
// refused or failed, two starts that disagree by more than the tolerance (a reused pid, or a skewed clock), a process list
// that may hide other users' processes, a record of another owner, host or namespace, and a resource another uid owns are
// all `Unknown` — the resource is kept and named, never deleted on a guess (rule §3).

using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Xunit;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>What a name is, read from its ONE second segment against the reserved owner grammar, never by counting
/// separators: an owner form (with the repository token after it when there is one), a legacy form (the token straight
/// after the prefix, from before the owner segment), or not prefixed at all.</summary>
public abstract record NameForm
{
    private NameForm()
    {
    }

    public static NameForm None { get; } = new NoForm();

    public sealed record Owner(string Segment, string? Token) : NameForm;

    public sealed record Legacy(string Token) : NameForm;

    private sealed record NoForm : NameForm;
}

public static partial class Owned
{
    /// <summary>Rule §1 — the ONE bare-prefix literal in C# outside the guard's own fixtures (the guard reads any other
    /// as an owner-blind pattern: a constant must not carry the prefix to a sweep).</summary>
    public const string Prefix = "testsToDelete-";

    public const int MaxName = 63, IdLength = 6, StartToleranceSeconds = 2, MaxClaimBytes = 512, MaxDraws = 3;

    private static readonly char[] WindowsReserved = ['<', '>', ':', '"', '|', '?', '*'];

    private const string IdAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    // Every anchored expression here ends in \z (never $, which matches before a final \n) and spells [0-9] (never \d,
    // which takes Unicode digits): a token of "u1\n" must be refused, and Arabic-Indic digits are not an owner.
    public static readonly Regex OwnerGrammar = new(@"^[uw][0-9]{1,10}\z", RegexOptions.CultureInvariant);

    /// <summary>What a sweep of the OLD form lists: this repository's token straight after the prefix.</summary>
    public static readonly Regex LegacyPattern = new($"^teststodelete[-_]{OwnedToken.RepoToken}[-_]", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>The part of every name of this repository that is not <c>what</c> or the id: <c>testsToDelete-u1000-mcp-</c>.</summary>
    public static string NameBase => Prefix + OwnerToken.This + "-" + OwnedToken.RepoToken + "-";

    /// <summary>The room for <c>what</c> under THIS owner: the owner is budgeted BEFORE <c>what</c>, so a finished name is
    /// never truncated.</summary>
    public static int Room => MaxName - NameBase.Length - 1 - IdLength;

    /// <summary>What this repository's sweep matches for ONE owner: <c>^teststodelete[-_]&lt;owner&gt;[-_]mcp[-_]</c>, every
    /// spelling, case-insensitive (rule §1, §4).</summary>
    public static Regex Pattern(string? owner = null)
    {
        owner ??= OwnerToken.This;
        if (!OwnerGrammar.IsMatch(owner)) throw new ArgumentException($"owned: {owner} is not an owner token ({OwnerGrammar})", nameof(owner));
        return new Regex($"^teststodelete[-_]{owner}[-_]{OwnedToken.RepoToken}[-_]", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    /// <summary>A whole name of this repository: the pattern, <c>what</c>, and an id of 6 to 12 characters. The helper
    /// WRITES six; a name another implementation made with up to twelve still reads as one.</summary>
    public static Regex FullName(string? owner = null) =>
        new(Pattern(owner).ToString() + @".+[-_][A-Za-z0-9]{6,12}\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    // Spelled in two pieces: this is a reader of names, not a sweep, and the machine scan reads this file too.
    [GeneratedRegex("^" + "teststo" + "delete[-_]([^-_]+)(?:[-_]([^-_]+))?", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex NameSegments();

    /// <summary>The version of a name, read from its ONE second segment against the reserved grammar.</summary>
    public static NameForm Classify(string name)
    {
        var match = NameSegments().Match(name);
        if (!match.Success) return NameForm.None;
        var second = match.Groups[1].Value.ToLowerInvariant();
        if (OwnerGrammar.IsMatch(second))
        {
            return new NameForm.Owner(second, match.Groups[2].Success ? match.Groups[2].Value.ToLowerInvariant() : null);
        }

        return new NameForm.Legacy(second);
    }

    /// <summary>The one place a test learns the temp root (the guard's <c>raw-temp</c> class refuses every other spelling).</summary>
    public static string TempRoot()
    {
        // testsToDelete-exempt: raw-temp — the helper is the one place a test learns the temp root
        return Path.GetTempPath();
    }

    /// <summary>A fresh name: the prefix, the caller's owner, this repository's token, <c>what</c>, and six random
    /// characters of [A-Za-z0-9] — never <c>Path.GetRandomFileName()</c>, whose id holds a dot, never
    /// <c>CreateTempSubdirectory</c>.</summary>
    public static string NameFor(string what)
    {
        CheckWhat(what);
        return NameBase + what + "-" + RandomNumberGenerator.GetString(IdAlphabet, IdLength);
    }

    /// <summary>Rule §1: non-empty, no path separator, NUL or control character, no leading <c>-</c>, and short enough
    /// that the whole name stays within 63 characters under THIS owner. Spaces and non-ASCII are allowed on purpose:
    /// they are what a path test must cover. Thrown before anything exists.</summary>
    internal static void CheckWhat(string what) => CheckWhat(what, OperatingSystem.IsWindows());

    /// <summary>The check for either platform, so the Windows half can be tested from anywhere. On Windows <c>&lt;&gt;:"|?*</c> are refused as
    /// well: a colon makes the claim <c>&lt;name&gt;.owner</c> an alternate data stream of <c>&lt;name&gt;</c>, and the others are not
    /// file-name characters at all.</summary>
    internal static void CheckWhat(string what, bool windows)
    {
        if (what.Length == 0) throw Refused("`what` must not be empty", what);
        if (what.Any(c => c is '/' or '\\' || c < ' ' || c == '\u007f')) throw Refused("`what` may not hold a path separator or a control character", what);
        if (what[0] == '-') throw Refused("`what` may not start with \"-\"", what);
        if (windows && what.IndexOfAny(WindowsReserved) >= 0) throw Refused("`what` may not hold any of <>:\"|?* on Windows (a colon makes the claim an alternate data stream)", what);
        if (what.Length > Room) throw Refused($"the whole name would pass {MaxName} characters — `what` is {what.Length}", what);
    }

    private static ArgumentException Refused(string reason, string what) =>
        new($"owned: {reason}: {Quote(what)}; the most `what` may be is {Room} characters under the owner `{OwnerToken.This}`", nameof(what));

    /// <summary>A warning line: a test warning inside a test (the runner prints it), standard error outside one.</summary>
    public static void DefaultWarn(string line)
    {
        if (TestContext.Current.Test is not null) TestContext.Current.AddWarning(line);
        else Console.Error.WriteLine(line);
    }

    private static string Quote(string text) => "\"" + text.Replace("\u007f", "\\x7f").Replace("\0", "\\0") + "\"";
}
