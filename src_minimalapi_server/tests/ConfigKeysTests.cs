using System.Text.RegularExpressions;
using FluentAssertions;
using Microsoft.Extensions.Configuration;

namespace CredVaultServer.Tests;

/// <summary>
/// The configuration list, checked against the code rather than trusted.
/// </summary>
/// <remarks>
/// <para><b>Why this test exists.</b> An archive carries a snapshot of the deployment's configuration,
/// because the container never sees <c>.env</c> and a restore onto a fresh host without the KEK
/// recovers data nobody can open. The snapshot is built from <see cref="ConfigKeys"/>, which makes
/// that list a MIRROR of what the server reads — and a mirror drifts. A key added to the code and not
/// to the list is a value that quietly stops travelling, and the day anyone notices is the day they
/// are restoring.</para>
///
/// <para><b>The scan looks for the key SHAPE, not for one spelling of a read.</b> A first version
/// matched <c>config["X"]</c> only, and would have stayed green through
/// <c>config.GetValue&lt;int&gt;("X")</c>, <c>GetSection("X").Bind(...)</c> or any helper somebody
/// writes next year. So it finds every string literal shaped like a configuration key —
/// <c>Word:Word</c>, no spaces, no slashes — in the files that read configuration, and requires the
/// list to name each one. A Roslyn analyser over <c>IConfiguration</c> call sites would be stronger
/// still; this is the version that costs one file and catches the drift that actually happens.</para>
/// </remarks>
public class ConfigKeysTests
{
    /// <summary>`Word:Word` with no spaces and no slashes: a configuration key, not a URL or a header.</summary>
    private static readonly Regex KeyShaped = new(
        @"^[A-Za-z][A-Za-z0-9]*(:[A-Za-z0-9]+)+$", RegexOptions.Compiled);

    /// <summary>
    /// Literals that LOOK like keys and are not, each with the reason it is here.
    /// </summary>
    /// <remarks>
    /// An allow-list rather than a cleverer pattern: every entry is a decision somebody can read, and a
    /// new one has to be justified in this file rather than absorbed silently by a regex.
    /// </remarks>
    private static readonly HashSet<string> NotConfiguration = new(StringComparer.Ordinal)
    {
        // The prefix under which a Serilog override names a source, never read as a key on its own.
        "Serilog:MinimumLevel:Override",
    };

    private static readonly string[] ReadsConfiguration =
    [
        "Program.cs",
        "Logging.cs",
        "LogRetention.cs",
    ];

    [Fact]
    public void EveryConfigurationKeyTheServerReadsIsInTheList()
    {
        var named = ConfigKeys.All.ToHashSet(StringComparer.Ordinal);
        var missing = new List<string>();
        foreach (var file in ReadsConfiguration)
        {
            missing.AddRange(
                KeysIn(file).Where(key => !named.Contains(key) && !NotConfiguration.Contains(key))
                    .Select(key => $"{file}: {key}"));
        }

        missing.Should().BeEmpty(
            "a configuration key the server reads and ConfigKeys does not name is a value that stops "
            + "travelling in the archive — add it to ConfigKeys, or to NotConfiguration with a reason");
    }

    [Fact]
    public void TheListNamesNothingTheServerNeverReads()
    {
        // The other direction, and it matters as much: a key in the list that nothing reads is a line
        // in every snapshot that means nothing, and a reader who trusts the list learns something false.
        var read = ReadsConfiguration.SelectMany(KeysIn).ToHashSet(StringComparer.Ordinal);

        ConfigKeys.All.Should().OnlyContain(
            key => read.Contains(key),
            "every key in the list is read somewhere in the server");
    }

    [Fact]
    public void TheSnapshotCarriesEveryKeyInTheListAndSaysWhatItIs()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Vault:DataDir"] = "/data",
                ["Vault:LoginKey:Kek"] = "a-secret",
            })
            .Build();

        var snapshot = System.Text.Encoding.UTF8.GetString(BackupConfigSnapshot.Build(config));

        foreach (var key in ConfigKeys.All)
        {
            snapshot.Should().Contain($"{BackupConfigSnapshot.Env(key)}=", $"{key} travels with the archive");
        }
        snapshot.Should().Contain("Vault__DataDir=/data");
        snapshot.Should().Contain("Vault__LoginKey__Kek=a-secret", "a redacted snapshot recovers nothing");
        snapshot.Should().Contain("SECRETS INCLUDED", "the file says what it is to whoever opens it");
    }

    [Fact]
    public void AKeyThisDeploymentDidNotSetIsWrittenEmptyRatherThanOmitted()
    {
        // "Not set here" and "this snapshot forgot it" are different facts, and only the first is
        // useful to somebody restoring.
        var snapshot = System.Text.Encoding.UTF8.GetString(
            BackupConfigSnapshot.Build(new ConfigurationBuilder().Build()));

        snapshot.Should().Contain("Vault__DataDir=");
        snapshot.Split('\n').Count(line => line.Contains('=') && !line.StartsWith('#'))
            .Should().Be(ConfigKeys.All.Count(), "one line per key, always");
    }

    [Fact]
    public void TheEnvironmentSpellingIsTheOneTheComposeStackUses()
    {
        // Writing Vault:DataDir into an env file produces something that looks right and is silently
        // ignored by every reader of it.
        BackupConfigSnapshot.Env("Vault:RateLimit:PermitLimit").Should().Be("Vault__RateLimit__PermitLimit");
    }

    private static IEnumerable<string> KeysIn(string file)
    {
        var path = Path.Combine(PrintableKeyTests.RepoRoot(), "src_minimalapi_server", "src", file);
        File.Exists(path).Should().BeTrue($"{file} is where configuration is read");
        return Regex.Matches(File.ReadAllText(path), "\"([^\"\\n]{3,80})\"")
            .Select(match => match.Groups[1].Value)
            .Where(literal => KeyShaped.IsMatch(literal))
            .Distinct(StringComparer.Ordinal);
    }
}
