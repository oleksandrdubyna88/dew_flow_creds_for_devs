using System.Text.Json;
using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The editor panel finds a locally running server by reading the file this writes. The
/// shape matters as much as the content: it is the same one
/// `dew_flow_rag_qln · src/ServiceDefaults/DaemonEndpointFile.cs` publishes, and a reader
/// written for that one has to be able to read this.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class InstanceFileTests
{
    [Fact]
    public void PublishingWithNoBoundAddressWritesNothing()
    {
        // An in-process test server has no address. Publishing then would point the panel
        // at nothing AND scribble on the developer's real profile during a test run — which
        // is why this guard exists rather than being left to the caller.
        var before = File.Exists(InstanceFile.Path);

        InstanceFile.Publish("");
        InstanceFile.Publish("   ");

        File.Exists(InstanceFile.Path).Should().Be(before, "an empty address is not an address");
    }

    [Fact]
    public void APublishedInstanceCarriesEverythingAReaderNeedsToProbeIt()
    {
        var existing = File.Exists(InstanceFile.Path)
            ? File.ReadAllText(InstanceFile.Path)
            : null;
        try
        {
            InstanceFile.Publish("http://127.0.0.1:5199/");

            File.Exists(InstanceFile.Path).Should().BeTrue();
            using var parsed = JsonDocument.Parse(File.ReadAllText(InstanceFile.Path));
            var root = parsed.RootElement;

            root.GetProperty("name").GetString().Should().Be("cred-vault-server");
            root.GetProperty("url").GetString().Should().Be(
                "http://127.0.0.1:5199", "the trailing slash would double up when a path is appended");
            root.GetProperty("pid").GetInt32().Should().Be(
                Environment.ProcessId, "a reader tells a live instance from an abandoned file by the pid");
            root.GetProperty("startedUtc").GetDateTimeOffset().Should().BeCloseTo(
                DateTimeOffset.UtcNow, TimeSpan.FromMinutes(1));

            var apps = root.GetProperty("apps");
            apps.GetArrayLength().Should().Be(1);
            apps[0].GetProperty("url").GetString().Should().Be("http://127.0.0.1:5199/api/health");
        }
        finally
        {
            Restore(existing);
        }
    }

    [Fact]
    public void WithdrawingRemovesTheFile()
    {
        var existing = File.Exists(InstanceFile.Path)
            ? File.ReadAllText(InstanceFile.Path)
            : null;
        try
        {
            InstanceFile.Publish("http://127.0.0.1:5199");
            File.Exists(InstanceFile.Path).Should().BeTrue();

            InstanceFile.Withdraw();

            File.Exists(InstanceFile.Path).Should().BeFalse();
        }
        finally
        {
            Restore(existing);
        }
    }

    [Fact]
    public void WithdrawingWhenThereIsNoFileIsNotAnError()
    {
        var existing = File.Exists(InstanceFile.Path)
            ? File.ReadAllText(InstanceFile.Path)
            : null;
        try
        {
            InstanceFile.Withdraw();
            var act = InstanceFile.Withdraw;

            act.Should().NotThrow("shutdown must not fail because a file was already gone");
        }
        finally
        {
            Restore(existing);
        }
    }

    /// <summary>Leave the developer's own profile exactly as the test found it.</summary>
    private static void Restore(string? contents)
    {
        if (contents is null)
        {
            InstanceFile.Withdraw();
            return;
        }
        Directory.CreateDirectory(Path.GetDirectoryName(InstanceFile.Path)!);
        File.WriteAllText(InstanceFile.Path, contents);
    }
}
