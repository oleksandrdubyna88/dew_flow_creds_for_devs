using System.Text;
using Microsoft.Extensions.Configuration;

namespace CredVaultServer;

/// <summary>
/// The deployment's configuration as one text file, to travel inside an archive.
/// </summary>
/// <remarks>
/// <para><b>A restore of the data alone is not a restore.</b> The container never sees <c>.env</c>, so
/// on a fresh host the KEK and the local signing key are gone and the vaults are intact and
/// permanently unopenable. The snapshot is the half that makes recovery possible, and it carries
/// resolved values — secrets included — because a redacted snapshot recovers nothing.</para>
///
/// <para><b>It is written as <c>KEY=value</c> lines, not JSON</b>, for one reason: what an operator
/// does with it is compare it to the <c>.env</c> they have. A diff of two env files is a thing anyone
/// can read; a diff of two JSON documents with different key ordering is not. The restore script
/// writes it beside <c>.env</c> as <c>.env.snapshot.restored</c> and prints the difference rather than
/// applying it — the values came from a host that may not be this host.</para>
///
/// <para><b>A key with no value is written as an empty value rather than omitted.</b> "This deployment
/// did not set it" and "this snapshot forgot it" are different facts, and only the first is useful.</para>
///
/// <para>Pure: configuration in, bytes out, no clock and no I/O, so its guarantees are unit tests.</para>
/// </remarks>
public static class BackupConfigSnapshot
{
    /// <summary>The file the snapshot travels as, inside the archive.</summary>
    public const string EntryName = "config-snapshot.env";

    /// <summary>Every key in <see cref="ConfigKeys.All"/>, in that order, one per line.</summary>
    public static byte[] Build(IConfiguration config)
    {
        var lines = new StringBuilder();
        lines.AppendLine("# The deployment's configuration at the moment this archive was taken.");
        lines.AppendLine("# Resolved values, SECRETS INCLUDED — a restore onto a fresh host needs them,");
        lines.AppendLine("# which is what makes the backup key the highest-value secret in the system.");
        lines.AppendLine("# Compare this with the .env you have. Do not apply it blindly: these values");
        lines.AppendLine("# came from a host that may not be the host you are restoring onto.");
        foreach (var key in ConfigKeys.All)
        {
            lines.AppendLine($"{Env(key)}={config[key] ?? string.Empty}");
        }
        return Encoding.UTF8.GetBytes(lines.ToString());
    }

    /// <summary>
    /// The environment-variable spelling of a configuration key: <c>__</c> for the separator.
    /// </summary>
    /// <remarks>
    /// This is .NET's own convention and it is the spelling the compose stack already uses
    /// (<c>Vault__DataDir</c>), so what the snapshot writes can be pasted into an <c>.env</c> without
    /// translation. Writing <c>Vault:DataDir</c> instead would produce a file that looks right and is
    /// silently ignored by every reader of it.
    /// </remarks>
    public static string Env(string key) => key.Replace(":", "__", StringComparison.Ordinal);
}
