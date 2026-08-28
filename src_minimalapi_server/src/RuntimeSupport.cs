namespace CredVaultServer;

/// <summary>
/// How long the runtime this binary runs on is supported — said at startup, in the log, and on
/// the officers' metrics page (server-ops item 5, the owner: "just write it to the log").
///
/// <para>The policy this encodes: a .NET LTS is supported for three years from release, an STS
/// for two; this server moves to the next LTS within three months of its release and never runs
/// past end of support. The dates are Microsoft's published ones; a major this table does not
/// know is reported as unknown rather than guessed, because a wrong "supported until" is worse
/// than none.</para>
/// </summary>
public static class RuntimeSupport
{
    public sealed record Verdict(string Runtime, DateOnly? SupportEnds, int DaysLeft, bool Urgent, string Line);

    /// <summary>Warn this many days before end of support — a quarter, the length of one upgrade.</summary>
    public const int WarnWithinDays = 90;

    private static readonly IReadOnlyDictionary<int, (DateOnly Ends, string Channel)> Known =
        new Dictionary<int, (DateOnly, string)>
        {
            [8] = (new DateOnly(2026, 11, 10), "LTS"),
            [9] = (new DateOnly(2026, 5, 12), "STS"),
            [10] = (new DateOnly(2028, 11, 14), "LTS"),
        };

    public static Verdict Describe(Version runtime, DateOnly today)
    {
        var name = $".NET {runtime.Major}.{runtime.Minor}.{runtime.Build}";
        if (!Known.TryGetValue(runtime.Major, out var known))
        {
            return new Verdict(name, null, int.MaxValue, false,
                $"{name} — support window unknown to this build; check https://dotnet.microsoft.com/platform/support/policy");
        }

        var daysLeft = known.Ends.DayNumber - today.DayNumber;
        var urgent = daysLeft <= WarnWithinDays;
        var line = daysLeft < 0
            ? $"{name} ({known.Channel}) is PAST end of support since {known.Ends:yyyy-MM-dd} — move to the current LTS now"
            : $"{name} ({known.Channel}) — supported until {known.Ends:yyyy-MM-dd}, {daysLeft} days left"
              + (urgent ? " — move to the next LTS within three months of its release" : "");
        return new Verdict(name, known.Ends, daysLeft, urgent, line);
    }
}
