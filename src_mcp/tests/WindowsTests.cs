using CredsBroker;
using CredsMcp;
using FluentAssertions;

namespace CredsMcp.Tests;

/// <summary>
/// Which refusal means "ask the next window", and which means "you have your answer".
/// </summary>
/// <remarks>
/// <para>An entry id came from a list that had already merged every open window, so this binary
/// does not know which one holds it and asks them in turn. What ends that walk is the only
/// decision in it — and reading the HTTP status alone got it wrong, which the integration test
/// found: <c>not_supported</c> rides on 404 exactly as <c>not_found</c> does, so "this kind of
/// entry has no such action" looked like "not my entry". Every window was then asked, and the
/// person was finally told that no window answered: wrong, and nothing they could act on.</para>
/// <para>Getting it wrong the other way is worse than a bad message. Falling through after a
/// real refusal — the person clicked Deny, the switch is off — means asking the next window,
/// which raises a second consent prompt for a call that was already decided.</para>
/// </remarks>
public sealed class WindowsTests
{
    private const string NotFound = @"{""error"":{""code"":""not_found""}}";
    private const string NotSupported = @"{""error"":{""code"":""not_supported""}}";
    private const string Denied = @"{""error"":{""code"":""denied""}}";

    [Fact]
    public void Not_found_is_the_one_refusal_that_means_try_the_next_window()
    {
        Windows.MeansNotMine(new BrokerReply(404, NotFound)).Should().BeTrue();
    }

    [Fact]
    public void Not_supported_shares_the_status_and_is_not_the_same_answer()
    {
        // The defect this file exists for. Both are 404; only one means "not mine".
        Windows.MeansNotMine(new BrokerReply(404, NotSupported)).Should().BeFalse();
    }

    [Fact]
    public void A_real_refusal_ends_the_walk_rather_than_raising_a_second_prompt()
    {
        Windows.MeansNotMine(new BrokerReply(403, Denied)).Should().BeFalse();
    }

    [Fact]
    public void Success_ends_it_too()
    {
        Windows.MeansNotMine(new BrokerReply(200, @"{""rotated"":true}")).Should().BeFalse();
    }

    [Fact]
    public void An_unreadable_refusal_is_an_answer_rather_than_an_absence()
    {
        // A window running a newer build can refuse in a shape this one cannot parse. Falling
        // through would ask the next window and prompt somebody twice for one call.
        Windows.MeansNotMine(new BrokerReply(404, "not json at all")).Should().BeFalse();
        Windows.ErrorCodeOf("not json at all").Should().BeEmpty();
    }

    [Fact]
    public void The_code_is_read_from_the_envelope_the_broker_actually_sends()
    {
        Windows.ErrorCodeOf(Denied).Should().Be("denied");
        Windows.ErrorCodeOf(@"{}").Should().BeEmpty();
    }
}
