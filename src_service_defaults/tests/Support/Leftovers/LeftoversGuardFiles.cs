using System.Text.RegularExpressions;

namespace CredsForDevs.Tests.Leftovers;

internal enum SourceKind
{
    Tests,
    Source,
    Workflow,
    Script,
}

/// <summary>One file the guard reads: its repository-relative path (forward slashes), its absolute path and what kind of file it is.</summary>
internal sealed record SourceFile(string Relative, string Absolute, SourceKind Kind)
{
    public string Extension => Path.GetExtension(Relative).ToLowerInvariant();

    /// <summary>Scripts and workflows are judged by the shipped classifier as well.</summary>
    public bool IsJudgedByClassifier => Kind is SourceKind.Script or SourceKind.Workflow;

    /// <summary>The languages with <c>/* … */</c> comments and string literals the walk must respect.</summary>
    public bool HasBlockComments => Extension is ".cs" or ".mjs" or ".js" or ".cjs";
}

/// <summary>Which files of a repository the guard reads, and which kind each is.</summary>
internal static class GuardFiles
{
    private static readonly string[] NeverEntered = ["bin", "obj", "node_modules", ".git", ".claude", ".http-artifacts", "logs"];
    private static readonly string[] ScriptExtensions = [".sh", ".ps1", ".py"];
    private static readonly string[] JavaScriptExtensions = [".mjs", ".js", ".cjs"];
    private static readonly string[] ScriptFolders = [".github/scripts/", "http/", "src_vs_code/scripts/", "src_minimalapi_server/scripts/"];
    private static readonly string[] TestRoots =
        ["tests/", "src_service_defaults/tests/", "src_cli/tests/", "src_mcp/tests/", "src_broker_client/tests/", "src_minimalapi_server/tests/"];
    private static readonly string[] SourceRoots =
        ["src/", "src_service_defaults/src/", "src_cli/src/", "src_mcp/src/", "src_broker_client/src/", "src_minimalapi_server/src/"];
    private static readonly Regex WorkflowPath = new(@"^\.github/workflows/[^/]+\z", RegexOptions.CultureInvariant);

    /// <summary>Every file the guard reads under <paramref name="root"/>, in ordinal path order; none when the root does not exist.</summary>
    internal static IReadOnlyList<SourceFile> Discover(string root) =>
        !Directory.Exists(root) ? [] : [.. Walk(root).Order(StringComparer.Ordinal).Select(path => Read(root, path)).OfType<SourceFile>()];

    internal static string RelativeTo(string root, string path) => Path.GetRelativePath(root, path).Replace('\\', '/');

    private static SourceFile? Read(string root, string path)
    {
        var relative = RelativeTo(root, path);
        return LeftoversGuard.ExcludedFiles.Contains(relative) || KindOf(relative) is not { } kind ? null : new SourceFile(relative, path, kind);
    }

    /// <summary>Every file below <paramref name="dir"/>, except under a folder named <c>bin</c>, <c>obj</c>, <c>node_modules</c>,
    /// <c>.git</c>, <c>.claude</c> (the mounted conventions are another repository), <c>.http-artifacts</c> or <c>logs</c>. A link to
    /// a folder is not entered.</summary>
    internal static IEnumerable<string> Walk(string dir) =>
        Directory.EnumerateFiles(dir).Concat(Directory.EnumerateDirectories(dir).Where(Enterable).SelectMany(Walk));

    private static bool Enterable(string folder) =>
        !NeverEntered.Contains(Path.GetFileName(folder), StringComparer.Ordinal) && !new DirectoryInfo(folder).Attributes.HasFlag(FileAttributes.ReparsePoint);

    private static SourceKind? KindOf(string relative)
    {
        var extension = Path.GetExtension(relative).ToLowerInvariant();
        if (extension == ".cs") return CSharpKind(relative);
        if (IsWorkflow(extension, relative)) return SourceKind.Workflow;
        return IsScript(extension, relative) ? SourceKind.Script : null;
    }

    private static SourceKind? CSharpKind(string relative) =>
        TestRoots.Any(root => relative.StartsWith(root, StringComparison.Ordinal)) ? SourceKind.Tests : SourceRoots.Any(root => relative.StartsWith(root, StringComparison.Ordinal)) ? SourceKind.Source : null;

    private static bool IsWorkflow(string extension, string relative) => extension is ".yml" or ".yaml" && WorkflowPath.IsMatch(relative);

    private static bool IsScript(string extension, string relative) =>
        ScriptExtensions.Contains(extension) || (JavaScriptExtensions.Contains(extension) && ScriptFolders.Any(f => relative.StartsWith(f, StringComparison.Ordinal)));
}
