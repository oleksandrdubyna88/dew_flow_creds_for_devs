namespace CredsForDevs.Tests.Leftovers;

/// <summary>THIS repository's token and its row of the rule's <c>## Tokens</c> table (<c>common/test-leftovers.md</c>,
/// rule §1) — the ONE file of the folder that is not copied as it is. Every other file of this folder is the same
/// bytes in every C# repository of the family but for its namespace line; a copy writes its OWN token file from its
/// own row, never a copy of this one. The guard counts <c>RepoToken</c>: it must be written once, here.</summary>
public static class OwnedToken
{
    public const string RepoToken = "creds"; // rule §1 — the ONLY place the token is written

    public const string RepoRow = "the developer-credentials server and extension"; // the `repository` column of the `creds` row: the guard's identity check
}
