namespace CredsForDevs.Tests.Leftovers;

/// <summary>Many folders, one <c>Dispose</c> — a test class's field. xUnit v3 creates one instance per test and disposes it
/// after the test whether it passed or threw: that is this language's <c>t.after</c>. Disposal is last-made-first, so a
/// folder made under another goes before it. Every folder is tried even when one fails; the failures come back together as ONE
/// <see cref="AggregateException"/> after the last (a folder that cannot be removed is still warned about and left for the sweep by
/// <see cref="OwnedDir.Dispose"/>, which never throws — what the scope reports is a disposal that threw anyway).</summary>
public sealed class OwnedScope(Action<string>? warn = null) : IDisposable
{
    private readonly List<(string Path, IDisposable Resource)> _dirs = [];
    private readonly Lock _gate = new();

    /// <summary>A folder named for <paramref name="what"/>, claimed first, in <paramref name="parent"/> (default: the temp
    /// root), removed when the scope is disposed.</summary>
    public string Dir(string what, string? parent = null)
    {
        var dir = OwnedDir.Create(what, parent, warn);
        return Own(dir, dir.Path);
    }

    /// <summary>The seam: any disposable the scope disposes last-made-first with the folders, named by <paramref name="path"/> in a failure.</summary>
    internal string Own(IDisposable resource, string path)
    {
        lock (_gate) _dirs.Add((path, resource));
        return path;
    }

    public void Dispose()
    {
        (string Path, IDisposable Resource)[] dirs;
        lock (_gate)
        {
            dirs = [.. _dirs];
            _dirs.Clear();
        }

        var failures = new List<Exception>();
        for (var i = dirs.Length - 1; i >= 0; i--) TryDispose(dirs[i], failures);
        if (failures.Count > 0) throw new AggregateException($"owned: disposing {failures.Count} of {dirs.Length} folder(s) failed — the others were removed", failures);
    }

    /// <summary>One folder's disposal; a throw is kept, named by its path, and the next folder is still tried.</summary>
    private static void TryDispose((string Path, IDisposable Resource) dir, List<Exception> failures)
    {
        try
        {
            dir.Resource.Dispose();
        }
        catch (Exception ex)
        {
            failures.Add(new InvalidOperationException($"owned: disposing {dir.Path} failed ({ex.GetType().Name}: {ex.Message})", ex));
        }
    }
}
