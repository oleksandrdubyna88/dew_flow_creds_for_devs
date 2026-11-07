namespace CredsForDevs.Tests;

/// <summary>The folder that holds this repository's <c>*.slnx</c>, found by walking up from the test
/// executable. One implementation for every test that needs the repository (the CPU-budget checks, the
/// mounted conventions vectors, the leftovers guard) — two copies would drift the first time the layout moved.</summary>
internal static class RepositoryRoot
{
    public static string Path { get; } = Find();

    private static string Find()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && dir.GetFiles("*.slnx").Length == 0) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException($"no .slnx above {AppContext.BaseDirectory}");
    }
}
