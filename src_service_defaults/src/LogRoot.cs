namespace CredsForDevs.ServiceDefaults;

/// <summary>The three platform families a log root is chosen for.</summary>
public enum LogPlatform
{
    /// <summary><c>%LOCALAPPDATA%</c>.</summary>
    Windows,

    /// <summary><c>~/Library/Logs</c>.</summary>
    MacOS,

    /// <summary>The XDG state directory — every other unix, WSL included.</summary>
    Linux,
}

/// <summary>
/// Where the AOT binaries keep their logs — never beside the binary.
/// </summary>
/// <remarks>
/// <para><c>CREDS_LOG_DIR</c> first, then the place each platform tells a person to look:
/// <c>%LOCALAPPDATA%\creds-for-devs\logs</c>, <c>$XDG_STATE_HOME/creds-for-devs/logs</c> (or
/// <c>~/.local/state/creds-for-devs/logs</c>), <c>~/Library/Logs/creds-for-devs</c>.</para>
/// <para><b>Why not beside the binary</b> — coai learned it (<c>CoaiLogPath.RootFor</c>): the extension
/// installs <c>creds-mcp</c> into its own <c>globalStorage</c> folder, a path nobody would think to open,
/// and inside WSL the Linux half usually sits in a <c>bin</c> folder a person may not be able to write.
/// The server is the exception and keeps its own root (<c>Logging:Directory</c>, a container mount).</para>
/// <para>An empty answer means "no root could be decided" — <see cref="CredsLogging.Build"/> then logs to
/// the console alone and says so, rather than writing into whatever the working directory happens to be.</para>
/// </remarks>
public static class LogRoot
{
    /// <summary>The product's folder name under each platform's root.</summary>
    public const string ProductFolder = "creds-for-devs";

    /// <summary>
    /// The root, from the override, the platform and the folders that platform names. Pure.
    /// </summary>
    /// <param name="platform">Which family's convention applies.</param>
    /// <param name="env">Reads one environment variable; null or empty means unset.</param>
    /// <param name="home">The user's home directory; empty when unknown.</param>
    /// <param name="localAppData">Windows' local application data folder; empty when unknown.</param>
    public static string For(LogPlatform platform, Func<string, string?> env, string home, string localAppData) =>
        env(CredsLogging.DirectoryVariable) is { Length: > 0 } chosen
            ? chosen
            : platform switch
            {
                LogPlatform.Windows => Under(localAppData, ProductFolder, "logs"),
                LogPlatform.MacOS => Under(home, "Library", "Logs", ProductFolder),
                _ => Linux(env("XDG_STATE_HOME"), home),
            };

    /// <summary>This process's platform.</summary>
    public static LogPlatform Here() =>
        OperatingSystem.IsWindows() ? LogPlatform.Windows
        : OperatingSystem.IsMacOS() ? LogPlatform.MacOS
        : LogPlatform.Linux;

    /// <summary>
    /// XDG says a relative <c>XDG_STATE_HOME</c> is invalid and must be ignored — taking it would put
    /// the logs under whatever directory the process was started in.
    /// </summary>
    private static string Linux(string? stateHome, string home) =>
        stateHome is { Length: > 0 } && Path.IsPathRooted(stateHome)
            ? Path.Combine(stateHome, ProductFolder, "logs")
            : Under(home, ".local", "state", ProductFolder, "logs");

    private static string Under(string root, params string[] parts) =>
        root.Length == 0 ? string.Empty : Path.Combine([root, .. parts]);
}
