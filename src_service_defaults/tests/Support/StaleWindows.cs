using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace CredsForDevs.ServiceDefaults.Tests.Support;

/// <summary>
/// What a crashed VS Code window leaves behind, built by a test in its own temporary folder: an announcement whose pid
/// is gone — and a listener that counts every connection a walk makes to the port such an announcement names.
/// </summary>
/// <remarks>
/// <para>Linked into the broker-client, CLI and MCP test projects rather than copied — the three walks are tested with
/// one definition of "a dead window" (research/PLAN_stale_endpoint_files_slow_every_refusal.md §6).</para>
/// <para>A dead pid is the pid of a process THIS test started and waited for — never a guessed number, which could be
/// a live process on the machine running the suite. Nothing here reads, moves or deletes a real endpoint folder.</para>
/// </remarks>
internal static class StaleWindows
{
    /// <summary>Pids of short processes this test started and that have exited.</summary>
    internal static IReadOnlyList<int> ExitedPids(int count)
    {
        var pids = new List<int>(count);
        for (var i = 0; i < count; i++)
        {
            var start = OperatingSystem.IsWindows()
                ? new ProcessStartInfo("cmd.exe", "/c exit 0")
                : new ProcessStartInfo("/bin/sh", "-c true");
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            using var child = Process.Start(start) ?? throw new InvalidOperationException("a short process did not start");
            child.WaitForExit();
            pids.Add(child.Id);
        }
        return pids;
    }

    /// <summary>Write the announcement a window writes, under the name a window uses.</summary>
    internal static void Announce(string directory, string name, int pid, int port, string startedAt)
    {
        Directory.CreateDirectory(directory);
        File.WriteAllText(
            Path.Combine(directory, $"window-{name}.json"),
            $$"""{"pid":{{pid}},"port":{{port}},"socket":null,"startedAt":"{{startedAt}}"}""");
    }

    /// <summary>Every file in the folder with its bytes — to prove a walk left it exactly as it found it.</summary>
    internal static IReadOnlyDictionary<string, string> Snapshot(string directory) =>
        Directory.GetFiles(directory)
            .OrderBy(f => f, StringComparer.Ordinal)
            .ToDictionary(file => Path.GetFileName(file), File.ReadAllText, StringComparer.Ordinal);
}

/// <summary>
/// A loopback port that counts the connections made to it and answers each with a plain 404 — never a CredsForDevs
/// health answer, so a probe that reaches it walks on at once.
/// </summary>
internal sealed class CountingListener : IAsyncDisposable
{
    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource _stop = new();
    private readonly Task _accepting;
    private int _connections;

    internal CountingListener()
    {
        _listener.Start();
        _accepting = AcceptAsync();
    }

    internal int Port => ((IPEndPoint)_listener.LocalEndpoint).Port;

    internal int Connections => Volatile.Read(ref _connections);

    private async Task AcceptAsync()
    {
        try
        {
            while (true)
            {
                var peer = await _listener.AcceptTcpClientAsync(_stop.Token);
                Interlocked.Increment(ref _connections);
                _ = AnswerAsync(peer);
            }
        }
        catch (Exception e) when (e is OperationCanceledException or ObjectDisposedException or SocketException)
        {
            // Stopped.
        }
        catch (InvalidOperationException) when (_stop.IsCancellationRequested)
        {
            // Stopped between two accepts: the next accept met a listener DisposeAsync had already stopped, and a stopped
            // TcpListener says "Not listening" rather than any of the above (measured on a macOS CI leg, #234).
        }
    }

    private static async Task AnswerAsync(TcpClient peer)
    {
        using (peer)
        {
            try
            {
                const string reply = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                await peer.GetStream().WriteAsync(Encoding.ASCII.GetBytes(reply));
            }
            catch (Exception e) when (e is IOException or ObjectDisposedException or SocketException)
            {
                // The prober let go first — still a connection, already counted.
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _stop.CancelAsync();
        _listener.Stop();
        _listener.Dispose();
        await _accepting;
        _stop.Dispose();
    }
}
