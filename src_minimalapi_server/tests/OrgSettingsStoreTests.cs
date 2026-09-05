using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The runtime settings: one file, absent by default, and what a bad one means.
/// </summary>
public sealed class OrgSettingsStoreTests : IDisposable
{
    private const string Admin = "admin@example.com";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private readonly string _dir =
        Path.Combine(Path.GetTempPath(), "cred-vault-tests", Guid.NewGuid().ToString("N"));

    private readonly CapturingLogger<OrgSettingsStore> _log = new();
    private readonly OrgSettingsStore _store;

    public OrgSettingsStoreTests()
    {
        Directory.CreateDirectory(_dir);
        _store = new OrgSettingsStore(_dir, _log);
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(_dir, recursive: true);
        }
        catch (IOException)
        {
            // A handle not yet released; the temp sweeper gets it.
        }
    }

    private string OrgDir => Path.Combine(_dir, "org");

    private string SettingsPath => Path.Combine(OrgDir, "settings.json");

    [Fact]
    public void AbsentFileAnswersTheDefaultAndWritesNothing()
    {
        // "Off is the shape, not a flag": the answer is correct before the disk agrees, and a read on
        // a personal deployment must not grow an org/ directory.
        var settings = _store.Read();

        settings.Should().Be(OrgSettingsDto.Default);
        settings.OfflineLeaseHours.Should().Be(24, "owner decision 7");
        Directory.Exists(OrgDir).Should().BeFalse();
    }

    [Fact]
    public async Task WriteThenRead()
    {
        var written = await _store.UpdateAsync(s => s with { OfflineLeaseHours = 0 }, Admin, Ct);

        written.OfflineLeaseHours.Should().Be(0, "zero is the legal strictly-online, not an error");
        written.UpdatedBy.Should().Be(Admin, "who changed it comes from the caller, never from the edit");
        written.UpdatedAt.Should().BePositive();
        File.Exists(SettingsPath).Should().BeTrue("the layout is DataDir/org/settings.json");
        _store.Read().Should().Be(written);
    }

    [Fact]
    public void AMalformedFileAnswersTheDefaultAndSaysSoOnce()
    {
        // Nothing in this file grants a permission, so the failing direction is the default lease,
        // said out loud: refusing every GET /api/org/me over a settings file would be an outage.
        Directory.CreateDirectory(OrgDir);
        File.WriteAllText(SettingsPath, "{ nope");

        _store.Read().Should().Be(OrgSettingsDto.Default);
        _store.Read().Should().Be(OrgSettingsDto.Default);

        _log.Errors.Should().ContainSingle(m => m.Contains(SettingsPath), "once per file, naming it");
    }

    [Fact]
    public async Task AChangeMadeOutsideTheProcessIsSeenOnTheNextRead()
    {
        // Same stat check as the members registry: a restore or a second instance changes the file
        // underneath this one.
        await _store.UpdateAsync(s => s with { OfflineLeaseHours = 8 }, Admin, Ct);
        _store.Read().OfflineLeaseHours.Should().Be(8);

        File.WriteAllBytes(
            SettingsPath,
            JsonSerializer.SerializeToUtf8Bytes(new OrgSettingsDto(3, 1, "ops@example.com"), AppJsonContext.Default.OrgSettingsDto));
        File.SetLastWriteTimeUtc(SettingsPath, File.GetLastWriteTimeUtc(SettingsPath).AddSeconds(2));

        _store.Read().OfflineLeaseHours.Should().Be(3);
    }

    [Fact]
    public async Task ANegativeLeaseIsRefusedBeforeAnythingIsWritten()
    {
        var act = () => _store.UpdateAsync(s => s with { OfflineLeaseHours = -1 }, Admin, Ct);

        await act.Should().ThrowAsync<ArgumentException>();
        Directory.Exists(OrgDir).Should().BeFalse("a refused edit leaves the disk as it found it");
    }
}
