using CredsForDevs.Tests.Leftovers;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace CredVaultServer.Tests;

/// <summary>
/// The folder every <see cref="VaultServer"/> hosts the API on (E2.3.S4, S4.1): an OWNED folder - claimed first, named
/// for what it holds, in the temp root itself and not under a shared parent - that goes when the server goes, and not
/// before the host has ended. A host that still runs on a folder somebody removed fails in ways that look like the
/// product's own faults.
/// </summary>
[Collection(ServerCollection.Name)]
public sealed class VaultServerFolderTests
{
    [Fact]
    public void The_data_folder_is_an_owned_folder_with_a_claim_beside_it_and_both_are_gone_after_the_dispose()
    {
        string dir;
        using (var server = new VaultServer())
        {
            dir = server.DataDir;

            Directory.Exists(dir).Should().BeTrue("premise: the host has its data folder from the constructor on");
            Owned.Pattern().IsMatch(Path.GetFileName(dir)).Should().BeTrue("the name is an owned name (rule 2): the sweep can tell whose it is");
            File.Exists(dir + ".owner").Should().BeTrue("the claim is a SIBLING, made first - nothing is written inside the data folder");
            OwnedDir.Unreclaimed().Select(unreclaimed => unreclaimed.Path).Should().Contain(dir, "premise: the registry knows the folder while the server lives");
        }

        Directory.Exists(dir).Should().BeFalse("the dispose removed the data folder");
        File.Exists(dir + ".owner").Should().BeFalse("and its claim");
        OwnedDir.Unreclaimed().Select(unreclaimed => unreclaimed.Path).Should().NotContain(dir, "the registry has no entry: nothing is left for the audit to name");
    }

    [Fact]
    public void The_data_folder_has_no_shared_parent_and_no_guid_name()
    {
        using var server = new VaultServer();

        var parent = Path.GetDirectoryName(server.DataDir)!;
        Path.GetFileName(parent).Should().NotBe("cred-vault-tests", "the shared parent of the old form is gone: one more folder nobody removes");
        // testsToDelete-exempt: raw-temp — the temp root is only compared as a string: nothing is created under it here
        OwnedCreds.Canonical(parent).Should().Be(OwnedCreds.Canonical(Owned.TempRoot()), "the folder lies in the temp root itself, owned by name and claim");
        Path.GetFileName(server.DataDir).Should().NotMatchRegex("^[0-9a-f]{32}$", "a bare GUID names nobody");
    }

    /// <summary>
    /// Takes the ORDER out of the code: a hosted service, built by a factory so the host's own container owns and disposes it, looks at the folder when the host stops it and when the container
    /// disposes it. Both are steps of ending the host, so both must see the folder. A <c>VaultServer</c> that removed the folder first would show false here.
    /// </summary>
    [Fact]
    public void The_host_has_ended_before_its_folder_is_removed()
    {
        var probe = new EndProbe();
        using (var server = new VaultServer(services: services => services.AddSingleton<IHostedService>(_ => probe)))
        {
            probe.DataDir = server.DataDir;
            using var client = server.CreateClient(); // creating a client is what starts the host
        }

        probe.Seen.Should().NotBeEmpty("premise: the host reached the probe while it ended (a probe nothing called passes for ever)");
        probe.Seen.Should().OnlyContain(seen => seen.FolderThere, "every step of ending the host saw the data folder; it is removed after them, never before");
    }

    private sealed class EndProbe : IHostedService, IDisposable
    {
        private readonly List<(string Step, bool FolderThere)> _seen = [];

        public string? DataDir { get; set; }

        public IReadOnlyList<(string Step, bool FolderThere)> Seen
        {
            get
            {
                lock (_seen) return [.. _seen];
            }
        }

        public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        public Task StopAsync(CancellationToken cancellationToken)
        {
            Note("stop");
            return Task.CompletedTask;
        }

        public void Dispose() => Note("dispose");

        private void Note(string step)
        {
            lock (_seen) _seen.Add((step, DataDir is not null && Directory.Exists(DataDir)));
        }
    }
}
