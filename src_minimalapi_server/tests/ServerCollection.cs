namespace CredVaultServer.Tests;

/// <summary>
/// Every test configures the server through process environment variables (see
/// <see cref="VaultServer"/> for why that is unavoidable), and process environment is
/// global state. Two tests running at once would let one test's DataDir become another's,
/// so every test class joins this one non-parallel collection.
/// </summary>
[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class ServerCollection
{
    public const string Name = "cred-vault-server";
}
