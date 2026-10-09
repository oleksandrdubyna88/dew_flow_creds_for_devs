using System.Text;
using CredsCli;
using FluentAssertions;

namespace CredsCli.Tests;

/// <summary>
/// Where <c>creds config</c> finds its key: one line of stdin for <c>-</c>, <c>CREDSFORDEVS_KEY</c>
/// with no argument — and never the other source as a quiet fallback.
/// </summary>
public class ConfigKeyInputTests
{
    /// <summary>Key-shaped, and fake: no window ever minted it.</summary>
    private const string FakeKey = "cfgk_FAKEFAKEFAKEFAKEFAKEFAKEFAKE";

    private const string OtherFakeKey = "cfgk_OTHEROTHEROTHEROTHEROTHER00";

    private static Func<Stream> Stdin(string text) => () => new MemoryStream(Encoding.UTF8.GetBytes(text));

    private static Func<Stream> Stdin(byte[] bytes) => () => new MemoryStream(bytes);

    private static Func<string, string?> Env(string? value) =>
        name => name == ConfigKeyInput.Variable ? value : null;

    private static Func<Stream> NeverOpened() => () => throw new InvalidOperationException("stdin was opened for the environment form");

    [Fact]
    public void The_variable_is_the_one_the_extension_names()
    {
        // configKey.ts:44 — the panel, the mint dialog and every snippet say this name.
        ConfigKeyInput.Variable.Should().Be("CREDSFORDEVS_KEY");
    }

    [Theory]
    [InlineData(FakeKey + "\n")]
    [InlineData(FakeKey + "\r\n")]
    [InlineData(FakeKey)]
    [InlineData("  " + FakeKey + "  \n")]
    public void One_line_of_stdin_is_the_key(string text)
    {
        var key = ConfigKeyInput.Resolve(ConfigKeySource.Stdin, Env(null), Stdin(text));

        key.Should().BeOfType<ConfigKey.Found>().Which.Value.Should().Be(FakeKey);
    }

    [Fact]
    public void A_byte_order_mark_is_not_part_of_the_key()
    {
        // Windows PowerShell 5.1 and .NET Framework writers can put one in front of a pipe.
        var bytes = new byte[] { 0xEF, 0xBB, 0xBF }.Concat(Encoding.UTF8.GetBytes(FakeKey + "\n")).ToArray();

        var key = ConfigKeyInput.Resolve(ConfigKeySource.Stdin, Env(null), Stdin(bytes));

        key.Should().BeOfType<ConfigKey.Found>().Which.Value.Should().Be(FakeKey);
    }

    [Fact]
    public void Only_the_first_line_is_read()
    {
        var stream = new MemoryStream(Encoding.UTF8.GetBytes(FakeKey + "\nsomething else entirely\n"));

        var key = ConfigKeyInput.Resolve(ConfigKeySource.Stdin, Env(null), () => stream);

        key.Should().BeOfType<ConfigKey.Found>().Which.Value.Should().Be(FakeKey);
        stream.Position.Should().Be(FakeKey.Length + 1, "nothing past the first newline is consumed");
    }

    [Theory]
    [InlineData("")]
    [InlineData("\n")]
    [InlineData("   \r\n")]
    public void An_explicit_dash_with_nothing_on_stdin_is_an_error_even_when_the_variable_is_set(string text)
    {
        // The caller chose stdin. Reading the variable instead would hide their bug — and would
        // read a key they may not have meant to use.
        var key = ConfigKeyInput.Resolve(ConfigKeySource.Stdin, Env(OtherFakeKey), Stdin(text));

        var missing = key.Should().BeOfType<ConfigKey.Missing>().Subject;
        missing.Message.Should().NotContain(OtherFakeKey);
        missing.Message.Should().Contain("creds config -");
    }

    [Fact]
    public void A_line_longer_than_any_key_is_refused_without_buffering_the_rest()
    {
        var text = new string('A', ConfigKeyInput.MaxLineBytes + 10);

        var key = ConfigKeyInput.Resolve(ConfigKeySource.Stdin, Env(null), Stdin(text));

        var missing = key.Should().BeOfType<ConfigKey.Missing>().Subject;
        missing.Message.Should().NotContain("AAAA");
    }

    [Fact]
    public void No_argument_reads_the_variable_and_never_touches_stdin()
    {
        var key = ConfigKeyInput.Resolve(ConfigKeySource.Environment, Env(FakeKey), NeverOpened());

        key.Should().BeOfType<ConfigKey.Found>().Which.Value.Should().Be(FakeKey);
    }

    [Fact]
    public void Whitespace_around_the_variable_is_not_part_of_the_key()
    {
        var key = ConfigKeyInput.Resolve(ConfigKeySource.Environment, Env("  " + FakeKey + "\r\n"), NeverOpened());

        key.Should().BeOfType<ConfigKey.Found>().Which.Value.Should().Be(FakeKey);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void An_unset_or_blank_variable_is_an_error_naming_both_forms(string? value)
    {
        var key = ConfigKeyInput.Resolve(ConfigKeySource.Environment, Env(value), NeverOpened());

        var missing = key.Should().BeOfType<ConfigKey.Missing>().Subject;
        missing.Message.Should().Contain("CREDSFORDEVS_KEY");
        missing.Message.Should().Contain("creds config -");
    }
}
