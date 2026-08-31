using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// Which answers carry the protocol's error flag.
/// </summary>
/// <remarks>
/// <para>Every refusal on this surface used to arrive as an ordinary successful result whose body
/// happened to carry an <c>error</c> — so an agent checking the flag and not the body read "the
/// person refused" as "it worked". The body was always readable; the signal was missing.</para>
/// <para>What is under test is the one decision that adds it, and both directions matter equally:
/// a refusal not flagged is the defect this closes, and a SUCCESS flagged as an error is a new one
/// — a client would show a working call as a failure, and an agent would retry something that
/// already happened.</para>
/// </remarks>
public sealed class AnswerTests
{
    [Fact]
    public void A_body_with_an_error_is_a_refusal()
    {
        // What every failure path here produces: a ToolFailure, or the window's own envelope.
        Answer.IsRefusal("""{"error":"No CredsForDevs window answered.","hint":"Open the folder…"}""")
            .Should().BeTrue();
        Answer.IsRefusal("""{"error":{"code":"denied","message":"The human did not allow this."}}""")
            .Should().BeTrue();
    }

    [Fact]
    public void A_success_from_the_window_is_not()
    {
        // The other direction, and it is not the lesser one: a working call shown as a failure
        // would have an agent retry something that already happened.
        Answer.IsRefusal("""{"rotated":true,"output":"ALTER USER"}""").Should().BeFalse();
        Answer.IsRefusal("""{"created":true,"id":"e-1","name":"app-03"}""").Should().BeFalse();
        Answer.IsRefusal("""{"deleted":true,"restorable":true}""").Should().BeFalse();
    }

    [Fact]
    public void A_listing_is_an_array_and_can_never_match()
    {
        // creds_list and creds_folders answer with a JSON array. An array has no properties, so
        // the check cannot mistake one for a refusal however its entries are named.
        Answer.IsRefusal("""[{"id":"e-1","name":"orders-db"}]""").Should().BeFalse();
        Answer.IsRefusal("[]").Should().BeFalse();
        Answer.IsRefusal("""[{"error":"this is an entry called error, not a refusal"}]""")
            .Should().BeFalse();
    }

    [Fact]
    public void A_body_this_build_cannot_read_is_not_called_a_failure()
    {
        // It reached here through a path that had already decided it was an answer. Inventing a
        // failure from an unreadable shape would turn "a window running a newer extension" into
        // "the call failed" — the same reasoning that makes Windows.Parse skip rather than throw.
        Answer.IsRefusal("not json at all").Should().BeFalse();
        Answer.IsRefusal(string.Empty).Should().BeFalse();
    }

    [Fact]
    public void The_flag_travels_with_the_body_rather_than_replacing_it()
    {
        // The shape is unchanged and still reaches the model: flagging is not throwing, and the
        // `hint` is the half a person can act on.
        var refused = Answer.From("""{"error":"…","hint":"Ask the person to allow it."}""");

        refused.IsError.Should().BeTrue();
        refused.Content.Should().ContainSingle();
        refused.Content[0].Should().BeOfType<ModelContextProtocol.Protocol.TextContentBlock>()
            .Which.Text.Should().Contain("hint");
    }

    [Fact]
    public void A_success_carries_the_same_shape_without_the_flag()
    {
        var fine = Answer.From("""{"rotated":true}""");

        fine.IsError.Should().BeFalse();
        fine.Content.Should().ContainSingle();
    }
}
