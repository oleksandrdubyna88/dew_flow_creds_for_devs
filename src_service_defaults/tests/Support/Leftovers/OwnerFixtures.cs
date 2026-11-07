namespace CredsForDevs.Tests.Leftovers;

internal static class OwnerFixtures
{
    /// <summary>Another owner than the caller's: this token with its last digit changed.</summary>
    public static string Other
    {
        get
        {
            var token = OwnerToken.This;
            var last = token[^1];
            return token[..^1] + (last == '9' ? '0' : (char)(last + 1));
        }
    }
}
