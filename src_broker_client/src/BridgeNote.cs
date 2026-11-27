using System.Net.Sockets;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CredsBroker;

/// <summary>
/// A Remote Bridge's note on the server (change 11.1, the 72-hour slice, S1): which forwarded socket leads to the laptop, the bridge
/// listener's port (what goes into <c>Host</c>) and its key (the <c>X-Creds-Bridge</c> header). The laptop writes it with a one-shot ssh
/// into <c>~/.creds-for-devs/bridge/&lt;id&gt;.json</c>, owner-only, by a rename; <c>creds</c> and <c>creds-mcp</c> read it here, so
/// nothing has to be pasted or exported and a tmux pane opened before the bridge finds it.
/// </summary>
public sealed record BridgeNote(
    [property: JsonPropertyName("socket")] string Socket,
    [property: JsonPropertyName("port")] int Port,
    [property: JsonPropertyName("brokerPort")] int BrokerPort,
    [property: JsonPropertyName("key")] string Key,
    [property: JsonPropertyName("serverName")] string ServerName,
    [property: JsonPropertyName("openedAt")] string OpenedAt);

[JsonSerializable(typeof(BridgeNote))]
internal sealed partial class BridgeNoteJsonContext : JsonSerializerContext;

/// <summary>Finding the note of this login's bridge.</summary>
public static class BridgeNotes
{
    /// <summary>The header the bridge listener reads its key from.</summary>
    public const string KeyHeader = "X-Creds-Bridge";

    /// <summary>The largest note read: a few hundred bytes of JSON.</summary>
    private const long MaxNoteBytes = 16 * 1024;

    /// <summary>The longest key read. The listener's key is 43 characters of base64url.</summary>
    private const int MaxKeyLength = 256;

    /// <summary>How long the probe of a note's socket may wait for a connect: a socket whose queue is full never stalls a call.</summary>
    private static readonly TimeSpan ProbeLimit = TimeSpan.FromSeconds(2);

    /// <summary>The note folder of this login, or <c>null</c> where there is none to look for (Windows, or no <c>HOME</c>).</summary>
    public static string? DirectoryHere() =>
        OperatingSystem.IsWindows() || Environment.GetEnvironmentVariable("HOME") is not { Length: > 0 } home
            ? null
            : Path.Combine(home, ".creds-for-devs", "bridge");

    /// <summary>The note to use here, or <c>null</c>: <see cref="Find"/> over <see cref="DirectoryHere"/>.</summary>
    public static BridgeNote? Here() => Find(DirectoryHere());

    /// <summary>
    /// The newest usable note in <paramref name="directory"/>, or <c>null</c>.
    /// </summary>
    /// <remarks>
    /// <para><b>Owner-only or nothing.</b> The note holds the listener's key, so a folder whose mode is not 0700, or a note whose mode is not
    /// 0600, is not read at all: another login on the server could have written it, or read it. The writer sets both.</para>
    /// <para><b>A note whose socket is gone, or is a file left behind that refuses a connect, is stale</b> (its ssh ended) and is passed over; the newest of the rest wins, by the time the
    /// note itself says it was opened. A note that does not parse, or names a port out of range, or a key that is empty, too long or not
    /// base64url (it goes into a header: a line break would make the client throw), is passed over too.</para>
    /// </remarks>
    public static BridgeNote? Find(string? directory)
    {
        if (directory is null || !Directory.Exists(directory) || !OwnerOnly(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute))
        {
            return null;
        }
        return Directory.EnumerateFiles(directory, "*.json")
            .Select(Read)
            .OfType<BridgeNote>()
            .Where(note => SocketIsThere(note.Socket))
            .OrderByDescending(note => note.OpenedAt, StringComparer.Ordinal)
            .FirstOrDefault();
    }

    private static BridgeNote? Read(string file)
    {
        try
        {
            var info = new FileInfo(file);
            if (info.Length > MaxNoteBytes || !OwnerOnly(file, UnixFileMode.UserRead | UnixFileMode.UserWrite))
            {
                return null;
            }
            var note = JsonSerializer.Deserialize(File.ReadAllText(file), BridgeNoteJsonContext.Default.BridgeNote);
            return note is { Port: > 0 and < 65536, Socket.Length: > 0 } && IsHeaderSafeKey(note.Key) ? note : null;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException)
        {
            return null;
        }
    }

    /// <summary>Whether <paramref name="key"/> is 1 to <see cref="MaxKeyLength"/> characters of base64url: legal as a header value as it is.</summary>
    private static bool IsHeaderSafeKey(string? key) =>
        key is { Length: > 0 and <= MaxKeyLength } && key.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');

    /// <summary>Whether the path's mode is exactly <paramref name="mode"/>: nothing for the group, nothing for others.</summary>
    private static bool OwnerOnly(string path, UnixFileMode mode)
    {
        if (OperatingSystem.IsWindows())
        {
            return false;
        }
        try
        {
            return File.GetUnixFileMode(path) == mode;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    /// <summary>
    /// Whether a bridge answers on the socket: a connect succeeds. A path that merely exists is not enough: sshd removes a forward's socket
    /// file only when the server sets <c>StreamLocalBindUnlink yes</c>, and the default is <c>no</c>, so a dead bridge leaves its file
    /// behind and only a refused connect tells the two apart. The connect waits at most <see cref="ProbeLimit"/>: a socket that does not
    /// answer by then (its queue is full) is passed over, never waited on.
    /// </summary>
    private static bool SocketIsThere(string socket)
    {
        if (!Path.IsPathRooted(socket) || !Path.Exists(socket))
        {
            return false;
        }
        try
        {
            using var probe = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
            using var limit = new CancellationTokenSource(ProbeLimit);
            probe.ConnectAsync(new UnixDomainSocketEndPoint(socket), limit.Token).AsTask().GetAwaiter().GetResult();
            return true;
        }
        catch (Exception e) when (e is SocketException or OperationCanceledException)
        {
            return false;
        }
    }
}
