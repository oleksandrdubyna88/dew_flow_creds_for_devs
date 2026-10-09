using System.Text;

namespace CredsCli;

/// <summary>A config key, or the sentence for why there is none. The sentence never contains a key.</summary>
internal abstract record ConfigKey
{
    internal sealed record Found(string Value) : ConfigKey
    {
        /// <summary>
        /// Never the key. A record's generated <c>ToString</c> prints every member, so one
        /// interpolated log line or one failed assertion would otherwise write it out.
        /// </summary>
        public override string ToString() => "Found { Value = *** }";
    }

    internal sealed record Missing(string Message) : ConfigKey;
}

/// <summary>
/// Where <c>creds config</c> gets its key: one line of stdin for <c>creds config -</c>, the
/// <c>CREDSFORDEVS_KEY</c> variable for <c>creds config</c>. Never the command line.
/// </summary>
/// <remarks>
/// <para><b>No fallback between the two.</b> A caller that wrote <c>-</c> and sent nothing has a bug;
/// quietly reading the variable instead would hide it, and might use a key they did not mean.</para>
/// <para><b>Every message is a constant.</b> They go to stderr, which service managers, CI logs and
/// crash reporters capture; a message built from what was read could carry the key there.</para>
/// <para>No <c>cfgk_</c> shape check here — the window's <c>isConfigKeyShape</c> is the check, and a
/// second copy of the rule in this binary would be one more place for the two to disagree.</para>
/// </remarks>
internal static class ConfigKeyInput
{
    /// <summary>The variable the extension names everywhere (<c>configKey.ts</c> <c>CONFIG_KEY_ENV</c>).</summary>
    internal const string Variable = "CREDSFORDEVS_KEY";

    /// <summary>A key is ~50 bytes. A line longer than this is not one, and is not buffered whole.</summary>
    internal const int MaxLineBytes = 4096;

    internal const string NothingOnStdin =
        "`creds config -` read no key from stdin. Write the key and a newline to its stdin, or set "
            + Variable + " and run `creds config` with nothing after it.";

    internal const string LineTooLong =
        "`creds config -` read more than 4096 bytes without a newline — that is not a config key. Write the key and a newline to its stdin.";

    internal const string VariableNotSet =
        Variable + " is not set. Set it to the key you were given when you enabled code access and run `creds config`, "
            + "or pipe the key in with `creds config -`.";

    private static readonly byte[] Utf8Bom = [0xEF, 0xBB, 0xBF];

    /// <param name="source">Which form was typed.</param>
    /// <param name="environment">Reads an environment variable.</param>
    /// <param name="stdin">Opens stdin — called only for the stdin form, so the variable form never blocks on it.</param>
    internal static ConfigKey Resolve(ConfigKeySource source, Func<string, string?> environment, Func<Stream> stdin) =>
        source == ConfigKeySource.Stdin
            ? FromStdin(stdin())
            : FromVariable(environment(Variable));

    private static ConfigKey FromVariable(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? new ConfigKey.Missing(VariableNotSet)
            : new ConfigKey.Found(value.Trim());

    /// <summary>
    /// One line, byte by byte, so nothing past the newline is consumed and nothing past the cap is held.
    /// </summary>
    /// <remarks>
    /// Bytes rather than <c>Console.In</c>: the console's input decoder on Windows is the OEM code page,
    /// and a reader that buffers ahead would take more than the one line it was asked for.
    /// </remarks>
    private static ConfigKey FromStdin(Stream stream)
    {
        var line = new List<byte>(64);
        int next;
        while ((next = stream.ReadByte()) is >= 0 and not '\n')
        {
            if (line.Count == MaxLineBytes)
            {
                return new ConfigKey.Missing(LineTooLong);
            }

            line.Add((byte)next);
        }

        var key = Decode(line).Trim();
        return key.Length == 0 ? new ConfigKey.Missing(NothingOnStdin) : new ConfigKey.Found(key);
    }

    private static string Decode(List<byte> line)
    {
        ReadOnlySpan<byte> bytes = line.ToArray();
        return Encoding.UTF8.GetString(bytes.StartsWith(Utf8Bom) ? bytes[Utf8Bom.Length..] : bytes);
    }
}
