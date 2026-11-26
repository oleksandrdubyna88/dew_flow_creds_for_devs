using System.Net.Sockets;
using System.Text;
using FluentAssertions;

namespace CredsBroker.Tests;

/// <summary>
/// Change 11.1, the 72-hour slice, S1: <c>creds</c> and <c>creds-mcp</c> on the server find their Remote Bridge by its note, and say the
/// listener's port and key on every request. POSIX only: the note is a file of the server's login, and its modes are the boundary.
/// </summary>
[System.Runtime.Versioning.UnsupportedOSPlatform("windows")]
public sealed class BridgeNoteTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"creds-bridge-note-{Guid.NewGuid():N}");
    private readonly List<Socket> sockets = [];

    private const UnixFileMode Folder = UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute;
    private const UnixFileMode Note = UnixFileMode.UserRead | UnixFileMode.UserWrite;

    public void Dispose()
    {
        foreach (var socket in sockets)
        {
            socket.Dispose();
        }
        if (Directory.Exists(root))
        {
            Directory.Delete(root, recursive: true);
        }
    }

    /// <summary>A listening unix socket at a fresh path: what sshd leaves for a live forward.</summary>
    private string LiveSocket(string name)
    {
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, name);
        var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        socket.Bind(new UnixDomainSocketEndPoint(path));
        socket.Listen(4);
        sockets.Add(socket);
        return path;
    }

    /// <summary>
    /// A socket file with nobody listening: what an ended forward leaves when the server keeps <c>StreamLocalBindUnlink no</c> (the default,
    /// seen on a real Ubuntu server, 2026-11-26).
    /// </summary>
    private string DeadSocket(string name)
    {
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, name);
        var bound = path + ".bound";
        using (var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified))
        {
            socket.Bind(new UnixDomainSocketEndPoint(bound));
            socket.Listen(1);
            // .NET removes the file it bound when the socket closes; sshd does not. A rename keeps the file where .NET will not look.
            File.Move(bound, path);
        }
        Path.Exists(path).Should().BeTrue("the ended listener's file stays, as sshd leaves it");
        return path;
    }

    private string NoteFolder(UnixFileMode mode = Folder)
    {
        var folder = Path.Combine(root, "bridge");
        Directory.CreateDirectory(folder);
        File.SetUnixFileMode(folder, mode);
        return folder;
    }

    private static void WriteNote(string folder, string id, string socket, int port, string openedAt, UnixFileMode mode = Note)
    {
        var file = Path.Combine(folder, $"{id}.json");
        File.WriteAllText(file, $$"""{"socket":"{{socket}}","port":{{port}},"brokerPort":4242,"key":"key-{{id}}","serverName":"box","openedAt":"{{openedAt}}"}""");
        File.SetUnixFileMode(file, mode);
    }

    [Fact]
    public void The_newest_owner_only_note_whose_socket_is_live_is_the_bridge()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }
        var folder = NoteFolder();
        WriteNote(folder, "old", LiveSocket("old.sock"), 51001, "2026-11-25T10:00:00.000Z");
        WriteNote(folder, "new", LiveSocket("new.sock"), 51002, "2026-11-25T11:00:00.000Z");
        WriteNote(folder, "gone", Path.Combine(root, "gone.sock"), 51003, "2026-11-25T12:00:00.000Z");
        WriteNote(folder, "dead", DeadSocket("dead.sock"), 51004, "2026-11-25T13:00:00.000Z");

        var note = BridgeNotes.Find(folder);

        note.Should().NotBeNull();
        note!.Port.Should().Be(51002, "the newest note with a live socket wins; one whose socket is gone, or left behind by an ended forward, is stale");
        note.Key.Should().Be("key-new");
    }

    [Fact]
    public void A_folder_or_a_note_that_others_can_read_or_write_is_not_read()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }
        var wide = NoteFolder(Folder | UnixFileMode.GroupRead | UnixFileMode.GroupExecute);
        WriteNote(wide, "a", LiveSocket("a.sock"), 51001, "2026-11-25T10:00:00.000Z");
        BridgeNotes.Find(wide).Should().BeNull("a folder others can enter is not the login's own");

        File.SetUnixFileMode(wide, Folder);
        File.SetUnixFileMode(Path.Combine(wide, "a.json"), Note | UnixFileMode.OtherRead);
        BridgeNotes.Find(wide).Should().BeNull("a note others can read has shown its key");

        File.SetUnixFileMode(Path.Combine(wide, "a.json"), Note);
        BridgeNotes.Find(wide).Should().NotBeNull("control: the same note, owner-only, is read");
    }

    [Fact]
    public void A_note_that_does_not_parse_or_names_no_key_or_a_bad_port_is_passed_over()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }
        var folder = NoteFolder();
        var socket = LiveSocket("s.sock");
        File.WriteAllText(Path.Combine(folder, "broken.json"), "{not json");
        File.SetUnixFileMode(Path.Combine(folder, "broken.json"), Note);
        WriteNote(folder, "zero", socket, 0, "2026-11-25T10:00:00.000Z");
        BridgeNotes.Find(folder).Should().BeNull();
        BridgeNotes.Find(Path.Combine(root, "absent")).Should().BeNull("no folder, no bridge");
        BridgeNotes.Find(null).Should().BeNull();
    }

    [Fact]
    public async Task A_bridged_client_talks_to_the_notes_socket_with_the_listeners_port_in_Host_and_its_key_whatever_port_it_was_handed()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }
        var path = LiveSocket("door.sock");
        var listener = sockets[^1];
        var received = new TaskCompletionSource<string>();
        var ct = TestContext.Current.CancellationToken;
        _ = Task.Run(async () =>
        {
            using var accepted = await listener.AcceptAsync(ct);
            var buffer = new byte[8192];
            var text = new StringBuilder();
            while (!text.ToString().Contains("\r\n\r\n", StringComparison.Ordinal))
            {
                var read = await accepted.ReceiveAsync(buffer, SocketFlags.None, ct);
                if (read == 0)
                {
                    break;
                }
                text.Append(Encoding.ASCII.GetString(buffer, 0, read));
            }
            received.TrySetResult(text.ToString());
            await accepted.SendAsync(Encoding.ASCII.GetBytes("HTTP/1.1 404 Not Found\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}"), SocketFlags.None, ct);
        }, ct);
        var note = new BridgeNote(path, 51234, 4242, "the-listener-key", "box", "2026-11-25T10:00:00.000Z");
        using var client = BrokerClient.ForBridge(BrokerContract.Current, note);

        var reply = await client.GetAsync(1, "/v1/aliases", TestContext.Current.CancellationToken);

        reply.Status.Should().Be(404);
        var request = await received.Task.WaitAsync(TimeSpan.FromSeconds(10), TestContext.Current.CancellationToken);
        request.Should().Contain("Host: 127.0.0.1:51234\r\n", "the bridge door admits only its own port (cause D2: the old client said port 1)");
        request.Should().Contain($"{BridgeNotes.KeyHeader}: the-listener-key\r\n");
    }
}
