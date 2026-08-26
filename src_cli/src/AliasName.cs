using System.Text.RegularExpressions;

namespace CredsCli;

/// <summary>
/// The grammar for an alias, mirroring <c>cliAliases.ts</c>.
/// </summary>
/// <remarks>
/// <para>Narrow on purpose: lowercase letters, digits, dash and underscore. A name is typed on a
/// command line, so anything a shell might read as an operator, a path, a flag or a glob is
/// refused here rather than escaped later by whoever remembers to.</para>
/// <para>The absence of a dot is load-bearing beyond safety: a grant token always contains one,
/// so no string can be read as both a token and an alias, which is what lets the CLI take either
/// in the same position.</para>
/// </remarks>
internal static partial class AliasName
{
    internal const int MaxLength = 40;

    internal const string Rule =
        "An alias is lowercase letters, digits, dash and underscore, starting with a letter or digit.";

    [GeneratedRegex("^[a-z0-9][a-z0-9_-]*$")]
    private static partial Regex Grammar();

    internal static bool IsValid(string? name) =>
        !string.IsNullOrEmpty(name) && name.Length <= MaxLength && Grammar().IsMatch(name);
}
