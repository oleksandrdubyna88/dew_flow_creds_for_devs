using System.Text.RegularExpressions;

namespace CredsForDevs.Tests.Leftovers;

/// <summary>The guard's <c>docker-name</c> class (rule §5): every container, volume, network, image tag and compose project a test
/// names must be an owner-form leftover name or wholly a shell expansion. One line at a time; a command continued with a backslash
/// is judged line by line. Every detector word is spelled in two pieces — this file is scanned like any other.</summary>
internal static class GuardDocker
{
    private static readonly Regex DockerWord = Rx(@"\bdocker\b");
    private static readonly Regex DashName = Rx(@"--na" + @"me[ =]+(?=\S)");
    private static readonly Regex CreateName = Rx(@"\bdocker\s+(volume|network)\s+create\b");
    private static readonly Regex WithName = Rx("With" + @"Name\(\s*""([^""]*)""");
    private static readonly Regex ImageBuild = Rx(@"\bdocker\s+build\b");
    private static readonly Regex TagFlag = Rx(@"(?<=\s)(?:-t|--tag)(?:\s+|=)(?=\S)");
    private static readonly Regex ComposeCommand = Rx(@"\bdocker(?:\s+|-)compose\b");
    private static readonly Regex ProjectFlag = Rx(@"(?<=\s)(?:-p|--project-name)(?:\s+|=)(?=\S)");
    private static readonly Regex ComposeEnv = Rx("COMPOSE_PROJECT" + @"_NAME[""']?\s*[:=]\s*[""']?");
    private static readonly Regex WholeVariable = Rx(@"^\$[A-Za-z_][A-Za-z0-9_]*\z");
    private static readonly Regex WholeBraced = Rx(@"^\$\{[A-Za-z_][A-Za-z0-9_]*(?::?[-=]([^${}]+))?\}\z");
    private static readonly Regex WholeSubstitution = Rx(@"^\$\(.*\)\z", RegexOptions.Singleline);

    private static readonly string[] OptionsWithValue = ["-d", "--driver", "--label", "-l", "-o", "--opt", "--subnet", "--gateway", "--ip-range", "--scope", "--ipam-driver", "--na" + "me"];

    private static Regex Rx(string pattern, RegexOptions options = RegexOptions.None) => new(pattern, options | RegexOptions.CultureInvariant);

    /// <summary>What this line names that is not an owner-form leftover name, one sentence each.</summary>
    internal static IEnumerable<string> NameHits(string line) =>
        ContainerNames(line).Concat(CreatedNames(line)).Concat(FixtureNames(line)).Concat(ImageTags(line)).Concat(ComposeProjects(line)).Concat(ComposeEnvironment(line));

    private static IEnumerable<string> ContainerNames(string line) =>
        !DockerWord.IsMatch(line) ? [] : ValuesAfter(DashName, line).Where(name => !NameOk(name)).Select(name => $"the container name {name} is not an owner-form leftover name");

    private static IEnumerable<string> CreatedNames(string line) =>
        CreateName.Matches(line).Select(m => CreateProblem(m.Groups[1].Value, CreatedName(line[(m.Index + m.Length)..]))).OfType<string>();

    private static string? CreateProblem(string kind, string name)
    {
        if (name.Length == 0) return $"docker {kind} create makes an unnamed {kind}";
        return NameOk(name) ? null : $"docker {kind} create {name} is not an owner-form leftover name";
    }

    private static IEnumerable<string> FixtureNames(string line) =>
        WithName.Matches(line).Select(m => m.Groups[1].Value).Where(name => !LeftoversGuard.OwnerForm.IsMatch(name)).Select(name => $"the fixture name \"{name}\" is not an owner-form leftover name");

    private static IEnumerable<string> ImageTags(string line) =>
        !ImageBuild.IsMatch(line) ? [] : ValuesAfter(TagFlag, line).Where(tag => !NameOk(tag)).Select(tag => $"the image {tag} a test builds is not an owner-form leftover name");

    private static IEnumerable<string> ComposeProjects(string line) =>
        !ComposeCommand.IsMatch(line) ? [] : ValuesAfter(ProjectFlag, line).Where(name => !NameOk(name)).Select(name => $"the compose project {name} is not an owner-form leftover name");

    private static IEnumerable<string> ComposeEnvironment(string line) =>
        ValuesAfter(ComposeEnv, line).Where(name => !NameOk(name)).Select(name => $"the compose project name is not an owner-form leftover name: {(name.Length == 0 ? "(empty)" : name)}");

    /// <summary>The value that follows each match of <paramref name="flag"/>.</summary>
    private static IEnumerable<string> ValuesAfter(Regex flag, string line) =>
        flag.Matches(line).Select(m => ReadValue(line[(m.Index + m.Length)..]));

    /// <summary>A name the guard accepts: the owner form, or a value that is wholly a shell expansion (<c>"${x}"</c>, <c>$(f a)</c>) —
    /// dynamic, never guessed at. A literal default (<c>${V:-w}</c>) is the name the command gets when V is unset, so it must be
    /// in the owner form.</summary>
    private static bool NameOk(string name) => LeftoversGuard.OwnerForm.IsMatch(name) || IsExpansion(name);

    private static bool IsExpansion(string name) =>
        WholeVariable.IsMatch(name) || WholeSubstitution.IsMatch(name) || DefaultsToOwnerForm(WholeBraced.Match(name));

    private static bool DefaultsToOwnerForm(Match braced) =>
        braced.Success && (!braced.Groups[1].Success || LeftoversGuard.OwnerForm.IsMatch(braced.Groups[1].Value));

    /// <summary>The value at the start of <paramref name="rest"/>: an opening quote is skipped, a <c>$(…)</c> or <c>${…}</c> is read
    /// whole (it may hold spaces), and the value ends at white space, a quote, a comma or a semicolon.</summary>
    internal static string ReadValue(string rest)
    {
        var start = OpeningQuote(rest);
        var i = start;
        while (i < rest.Length && !EndsValue(rest[i])) i = Advance(rest, i);
        return rest[start..i];
    }

    private static int OpeningQuote(string rest) => rest.Length > 0 && rest[0] is '"' or '\'' ? 1 : 0;

    private static bool EndsValue(char c) => char.IsWhiteSpace(c) || c is '"' or '\'' or ',' or ';';

    private static int Advance(string rest, int i) => OpensExpansion(rest, i) ? AfterClosing(rest, i + 1) : i + 1;

    private static bool OpensExpansion(string rest, int i) => rest[i] == '$' && i + 1 < rest.Length && rest[i + 1] is '(' or '{';

    /// <summary>The index just past the bracket that closes the one at <paramref name="open"/>, counting nesting.</summary>
    private static int AfterClosing(string text, int open)
    {
        var closing = text[open] == '(' ? ')' : '}';
        var depth = 0;
        for (var i = open; i < text.Length; i++)
        {
            depth += Step(text[i], text[open], closing);
            if (depth == 0) return i + 1;
        }

        return text.Length;
    }

    private static int Step(char c, char opening, char closing) => c == opening ? 1 : c == closing ? -1 : 0;

    /// <summary>The name argument of <c>docker volume|network create</c>: the first word that is not an option or an option's value.</summary>
    private static string CreatedName(string rest)
    {
        var words = rest.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        for (var i = 0; i < words.Length; i++)
        {
            if (!words[i].StartsWith('-')) return words[i].Trim('"', '\'', ',', ';');
            if (OptionsWithValue.Contains(words[i], StringComparer.Ordinal)) i++;
        }

        return "";
    }
}
