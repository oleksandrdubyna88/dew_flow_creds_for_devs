using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The replace that waits out a reader (<c>VaultStore.RetryReplaceAsync</c>), on every platform: the move and the
/// "is this Windows" answer are handed in, so the Windows-only road is exercised by the Linux CI too, not only on
/// a Windows machine (Sonar's new-code coverage on #185 found it unrun).
/// </summary>
public sealed class VaultStoreReplaceTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task OnWindowsAReplaceRefusedByAReaderIsRetriedUntilItLands()
    {
        var attempts = 0;
        void Move()
        {
            attempts++;
            if (attempts < 3)
            {
                throw new UnauthorizedAccessException("Access to the path is denied.");
            }
        }

        await VaultStore.RetryReplaceAsync(Move, overwrite: true, onWindows: true, Ct);

        attempts.Should().Be(3, "two refusals waited out, the third attempt landed");
    }

    [Fact]
    public async Task OffWindowsTheFirstRefusalIsReal()
    {
        var attempts = 0;
        void Move()
        {
            attempts++;
            throw new UnauthorizedAccessException("Permission denied");
        }

        var refused = await Record.ExceptionAsync(() => VaultStore.RetryReplaceAsync(Move, overwrite: true, onWindows: false, Ct));

        refused.Should().BeOfType<UnauthorizedAccessException>("a POSIX rename never waits for a reader, so a refusal is a real one");
        attempts.Should().Be(1);
    }

    [Fact]
    public async Task ACreateIfAbsentIsNeverRetried()
    {
        var attempts = 0;
        void Move()
        {
            attempts++;
            throw new IOException("The file exists.");
        }

        var refused = await Record.ExceptionAsync(() => VaultStore.RetryReplaceAsync(Move, overwrite: false, onWindows: true, Ct));

        refused.Should().BeOfType<IOException>("its refusal is the answer a create-if-absent exists to give");
        attempts.Should().Be(1);
    }

    [Fact]
    public async Task ARefusalThatOutlastsTheWaitIsReported()
    {
        var attempts = 0;
        void Move()
        {
            attempts++;
            throw new UnauthorizedAccessException("Access to the path is denied.");
        }

        var started = System.Diagnostics.Stopwatch.GetTimestamp();
        var refused = await Record.ExceptionAsync(() => VaultStore.RetryReplaceAsync(Move, overwrite: true, onWindows: true, Ct));

        refused.Should().BeOfType<UnauthorizedAccessException>("a reader that never lets go is a failed write, reported");
        System.Diagnostics.Stopwatch.GetElapsedTime(started).Should().BeLessThan(TimeSpan.FromSeconds(5), "the wait is bounded");
        attempts.Should().BeGreaterThan(1);
    }
}
