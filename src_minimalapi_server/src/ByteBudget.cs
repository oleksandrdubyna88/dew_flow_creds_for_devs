using System.Collections.Concurrent;

namespace CredVaultServer;

/// <summary>
/// A per-caller byte budget for vault writes (roadmap E1, 2026-08-28).
///
/// <para>The request limiter counts requests, and a <c>PUT /api/vault</c> of 8 MiB cost exactly
/// what a <c>GET /api/health</c> did. This one counts bytes: each caller may write this many
/// bytes per fixed window — 64 MiB per ten minutes by default, eight full vaults — and the
/// ninth is refused with <c>429</c> and a <c>Retry-After</c> that names the seconds until the
/// window turns. Only accepted writes are charged: a refused one spends nothing.</para>
/// </summary>
public sealed class ByteBudget(long bytesPerWindow, TimeSpan window)
{
    private readonly ConcurrentDictionary<string, Bucket> _buckets = new();

    public long BytesPerWindow { get; } = bytesPerWindow;

    public TimeSpan Window { get; } = window;

    /// <summary>Spend <paramref name="bytes"/> for <paramref name="key"/> if the window allows it.</summary>
    public (bool Allowed, int RetryAfterSeconds) TryConsume(string key, long bytes, DateTimeOffset now)
    {
        var bucket = _buckets.GetOrAdd(key, _ => new Bucket());
        lock (bucket)
        {
            if (now - bucket.WindowStart >= Window)
            {
                bucket.WindowStart = now;
                bucket.Used = 0;
            }

            if (bucket.Used + bytes > BytesPerWindow)
            {
                var resets = bucket.WindowStart + Window - now;
                return (false, Math.Max(1, (int)Math.Ceiling(resets.TotalSeconds)));
            }

            bucket.Used += bytes;
            return (true, 0);
        }
    }

    private sealed class Bucket
    {
        public DateTimeOffset WindowStart = DateTimeOffset.MinValue;
        public long Used;
    }
}
