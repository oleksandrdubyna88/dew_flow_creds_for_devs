namespace CredsForDevs.ServiceDefaults.Tests.Support;

/// <summary>
/// Scripts that stand in for the Windows half of a bridge — <c>creds-mcp.exe</c>, <c>creds.exe relay-pipe</c> — so
/// the pump and the relay run against a real child process with no WSL and no Windows in sight.
/// </summary>
/// <remarks>
/// <para>Each answers <c>--help</c> by exiting at once (the pump probes the Windows half with it before a session) and
/// otherwise plays one of three parts. A <c>/bin/sh</c> script on Unix; a <c>.cmd</c> on Windows, where
/// <c>CreateProcess</c> runs a batch file through <c>cmd.exe</c> on its own (measured 2026-10-10), so the pump's
/// in-process tests run on every platform even though the built binary takes the pump path only inside WSL.</para>
/// <para>Linked into the mcp and cli suites rather than copied, like <see cref="HostProcess"/>.</para>
/// </remarks>
internal static class FakeChild
{
    /// <summary>
    /// A child that never reads its stdin, never closes its stdout and ignores TERM, HUP and INT: a Windows half stuck
    /// in defect A, or any child that will not leave on its own. Only a kill ends it.
    /// </summary>
    internal static string Stubborn(string directory) =>
        Script(
            directory,
            "stubborn",
            "trap '' TERM HUP INT\nwhile :; do sleep 1; done\n",
            ":loop\r\nping -n 2 127.0.0.1 >nul\r\ngoto loop\r\n");

    /// <summary>A child that echoes stdin to stdout and leaves on end-of-stream — <c>relay-pipe</c>'s ordinary shape.</summary>
    internal static string Echo(string directory) => Script(directory, "echo", "exec cat\n", "findstr \"^\"\r\n");

    /// <summary>A child that answers the first line it is given and then leaves on its own — a Windows half that ends first.</summary>
    internal static string Oneshot(string directory) =>
        Script(directory, "oneshot", "read line && echo \"$line\"\n", "set /p line=\r\necho %line%\r\n");

    private static string Script(string directory, string name, string shell, string batch)
    {
        if (OperatingSystem.IsWindows())
        {
            var cmd = Path.Combine(directory, name + ".cmd");
            File.WriteAllText(cmd, "@echo off\r\nif \"%1\"==\"--help\" exit /b 0\r\n" + batch);
            return cmd;
        }
        var path = Path.Combine(directory, name + ".sh");
        File.WriteAllText(path, "#!/bin/sh\n[ \"$1\" = \"--help\" ] && exit 0\n" + shell);
        File.SetUnixFileMode(
            path,
            UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute
                | UnixFileMode.GroupRead | UnixFileMode.GroupExecute
                | UnixFileMode.OtherRead | UnixFileMode.OtherExecute);
        return path;
    }
}
