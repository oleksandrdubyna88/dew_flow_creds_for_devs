using System.Net;

namespace CredVaultServer.Tests;

/// <summary>
/// A transport that answers from a queue and keeps what it was sent.
/// </summary>
/// <remarks>
/// <para>Its own file because two suites need it: <c>BackupTargetTests</c> drives the two cloud clients
/// directly, and <c>BackupRunnerTests</c> drives a whole run through one. The second copy is the defect
/// — they would drift, and the one that drifts is the one nobody is looking at.</para>
/// <para>A stub rather than a live bucket, because what is under test is the REQUEST — the method, the
/// path, the signed headers, the continuation token — and a live service would test somebody's network
/// and a set of credentials nobody should commit.</para>
/// <para>An empty queue answers <c>200</c> with no body: a test says only as much as it cares about,
/// and the calls after the ones it is asserting on should not have to be spelled out.</para>
/// </remarks>
internal sealed class StubTransport : HttpMessageHandler
{
    private readonly Queue<Func<HttpResponseMessage>> _answers = new();

    private long _lastBodyLength;

    public List<HttpRequestMessage> Sent { get; } = [];

    public StubTransport Answer(
        HttpStatusCode status, string body = "", IReadOnlyList<(string, string)>? headers = null)
    {
        _answers.Enqueue(() =>
        {
            var response = new HttpResponseMessage(status) { Content = new StringContent(body) };
            foreach (var (name, value) in headers ?? [])
            {
                // Remove first: StringContent sets its own Content-Length, and a second one would make
                // the header a two-valued list that every reader takes the first of.
                response.Content.Headers.Remove(name);
                response.Content.Headers.TryAddWithoutValidation(name, value);
            }
            return response;
        });
        return this;
    }

    /// <summary>
    /// "I stored exactly what you just sent me" — a <c>200</c> whose length is the previous request's.
    /// </summary>
    /// <remarks>
    /// The post-upload <c>HEAD</c> compares the stored length against what was sent, and a test that
    /// drives a whole run cannot know the archive's size before the run makes it. Answering from the
    /// request rather than from a literal is what lets it assert the SUCCESS path at all — a literal
    /// would only ever be able to assert the mismatch.
    /// </remarks>
    public StubTransport AnswerStored()
    {
        _answers.Enqueue(() =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(string.Empty) };
            response.Content.Headers.ContentLength = _lastBodyLength;
            return response;
        });
        return this;
    }

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Sent.Add(request);
        _lastBodyLength = request.Content?.Headers.ContentLength ?? _lastBodyLength;
        return Task.FromResult(
            _answers.Count > 0 ? _answers.Dequeue()() : new HttpResponseMessage(HttpStatusCode.OK));
    }
}
