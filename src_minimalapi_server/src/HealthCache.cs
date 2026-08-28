namespace CredVaultServer;

/// <summary>
/// The health probe's verdict, cached while it is good (server-ops item 6, 2026-08-28).
///
/// <para><c>/api/health</c> proves the data directory is writable by writing to it — the one
/// check that actually fails when the volume is gone or full. With a 30-second container
/// healthcheck and an nginx probe on top, that was thousands of writes a day for an answer that
/// does not change between them. A good verdict is now served from memory for
/// <paramref name="window"/>; a bad one is never cached, so a volume that just came back is
/// seen on the very next call, and one that just went away is seen within the window.</para>
/// </summary>
public sealed class HealthCache(TimeSpan window)
{
    private readonly object _gate = new();
    private DateTimeOffset _okUntil = DateTimeOffset.MinValue;

    /// <summary>How many times the probe actually ran — the number the tests count.</summary>
    public int Probes { get; private set; }

    /// <summary>Serve the cached good verdict inside the window; probe otherwise.</summary>
    public bool Check(Func<bool> probe, DateTimeOffset now)
    {
        lock (_gate)
        {
            if (now < _okUntil)
            {
                return true;
            }

            Probes++;
            var ok = probe();
            _okUntil = ok ? now + window : DateTimeOffset.MinValue;
            return ok;
        }
    }
}
