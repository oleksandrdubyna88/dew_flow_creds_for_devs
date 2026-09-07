using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The queue between the endpoint that claims a run and the service that carries it out.
/// </summary>
/// <remarks>
/// One property, and it is the difference between a refusal and a deployment that can never take
/// another backup: a hand-over that did not happen must SAY it did not happen.
/// </remarks>
public class BackupQueueTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public void AHandOverThatDidNotHappenAnswersFALSERatherThanPretending()
    {
        // The channel was DropWrite, which discards the item and answers true anyway. The endpoint
        // would then have answered 202 for a run nothing would carry out — and the ticket it dropped
        // OWNS the run claim, an open file handle, so nothing would ever release it: the status would
        // say "in progress" for ever and every later run would be told one was already going.
        var queue = new BackupQueue();

        queue.Enqueue(Ticket()).Should().BeTrue("the queue was empty");
        queue.Enqueue(Ticket()).Should().BeFalse(
            "one ticket is already waiting, and a silent drop would strand the run claim inside it");
    }

    [Fact]
    public async Task AQueuedRunIsHandedToTheReaderInOrder()
    {
        // The other half, so the test above cannot pass by refusing everything.
        var queue = new BackupQueue();
        var first = Ticket("first@corp.com");
        queue.Enqueue(first).Should().BeTrue();

        await foreach (var taken in queue.ReadAllAsync(Ct))
        {
            taken.Should().BeSameAs(first);
            break;
        }

        queue.Enqueue(Ticket()).Should().BeTrue("the reader took the first, so there is room again");
    }

    /// <summary>A ticket holding no claim — the queue never looks inside one.</summary>
    private static RunTicket Ticket(string actor = "admin@corp.com") =>
        new(RunClaim.Refused, [], DateTimeOffset.UnixEpoch, actor);
}
