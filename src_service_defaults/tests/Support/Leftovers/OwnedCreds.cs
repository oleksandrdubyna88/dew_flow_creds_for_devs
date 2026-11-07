namespace CredsForDevs.Tests.Leftovers;

/// <summary>RED stub (E2.3.S2): the short socket root and its canonical form, before the real ones.</summary>
internal static class OwnedCreds
{
    internal static string ShortSocketRoot => "/tmp";

    internal static string Canonical(string path) => Path.GetFullPath(path);

    internal static bool RootsDiffer(string first, string second) => Canonical(first) != Canonical(second);
}
