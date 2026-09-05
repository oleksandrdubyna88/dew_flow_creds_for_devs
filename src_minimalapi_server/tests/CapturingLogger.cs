using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace CredVaultServer.Tests;

/// <summary>
/// An <see cref="ILogger{T}"/> that keeps what was logged, for the tests whose guarantee IS a log
/// line — "logged once per file", "logged, not thrown". A <c>NullLogger</c> proves nothing about either.
/// </summary>
internal sealed class CapturingLogger<T> : ILogger<T>
{
    private readonly ConcurrentQueue<(LogLevel Level, string Message, Exception? Exception)> _entries = new();

    public IReadOnlyList<(LogLevel Level, string Message, Exception? Exception)> Entries => [.. _entries];

    public IReadOnlyList<string> Errors =>
        [.. _entries.Where(e => e.Level == LogLevel.Error).Select(e => e.Message)];

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(
        LogLevel logLevel,
        EventId eventId,
        TState state,
        Exception? exception,
        Func<TState, Exception?, string> formatter) =>
        _entries.Enqueue((logLevel, formatter(state, exception), exception));
}
