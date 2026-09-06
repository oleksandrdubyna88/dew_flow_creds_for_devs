using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace CredVaultServer;

/// <summary>What the store found: the project, nothing, or a file this build must not overwrite.</summary>
/// <remarks>
/// Three answers for the reason <see cref="MemberLookup"/> has three: a project that exists but
/// cannot be read is not an absent project. Treating it as absent would let a rename write a fresh
/// record over a half-written one and lose whatever it held — including, if the file was merely
/// locked for a moment, an assignment the admin never touched.
/// </remarks>
public enum ProjectLookup
{
    Found,
    Absent,
    Unreadable,
}

/// <summary>One answer from the store.</summary>
public readonly record struct ProjectResult(ProjectLookup Status, ProjectRecord? Record)
{
    public static readonly ProjectResult Absent = new(ProjectLookup.Absent, null);

    public static readonly ProjectResult Unreadable = new(ProjectLookup.Unreadable, null);

    public static ProjectResult Of(ProjectRecord record) => new(ProjectLookup.Found, record);
}

/// <summary>
/// The projects a company runs, one small JSON file each at <c>${DataDir}/org/projects/&lt;id&gt;.json</c>.
///
/// <para><b>Modelled on <see cref="OrgSettingsStore"/> and <see cref="OrgMembersStore"/>, not on
/// <c>OrgRecoveryStore</c></b>, and the difference is deliberate rather than stylistic: epic 1
/// departed from the older template for two reasons that apply here unchanged. The directory is
/// created on the first WRITE, never in the constructor, because an <c>org/</c> tree appearing on a
/// personal deployment tells an operator this server has a roster when it has none. And an unreadable
/// record is its own answer, never "absent".</para>
///
/// <para><b>Writes take the same striped lock every other store takes</b> (<see cref="VaultStore.GateFor"/>),
/// so a rename and an archive arriving together are serialised rather than racing: both read, both
/// write, and without the gate the second would silently discard the first. One stripe per project id,
/// shared with the vault and member stores, which is one set of failure modes to reason about instead
/// of three.</para>
/// </summary>
public sealed class OrgProjectsStore(string dataDir, ILogger<OrgProjectsStore> log)
{
    private readonly string _dir = Path.Combine(dataDir, "org", "projects");

    /// <summary>The project with this id, or why it cannot be given. Never throws.</summary>
    public ProjectResult Find(string projectId)
    {
        if (!IsUsableId(projectId))
        {
            return ProjectResult.Absent;
        }
        var path = PathFor(projectId);
        try
        {
            if (!File.Exists(path))
            {
                return ProjectResult.Absent;
            }
            var record = JsonSerializer.Deserialize(File.ReadAllBytes(path), AppJsonContext.Default.ProjectRecord);
            return record is null || record.Id != projectId ? Unreadable(projectId, "it does not hold the project it is named for") : ProjectResult.Of(record);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException)
        {
            return Unreadable(projectId, e.Message);
        }
    }

    /// <summary>
    /// This project's name, or empty when there is none to give.
    ///
    /// <para>Empty rather than a throw or an id: an assignment naming a project that has been
    /// removed, or one this build cannot read, must not fail the whole <c>/api/org/me</c>
    /// document — the person still needs their role, their policy and their lease.</para>
    /// </summary>
    public string NameOf(string projectId)
    {
        var found = Find(projectId);
        return found.Record?.Name ?? string.Empty;
    }

    /// <summary>Every project this server has, newest first. A file it cannot read is skipped and logged.</summary>
    public IReadOnlyList<ProjectRecord> List()
    {
        var found = new List<ProjectRecord>();
        foreach (var path in SafeFiles())
        {
            var record = ReadOrNull(path);
            if (record is not null)
            {
                found.Add(record);
            }
        }
        return [.. found.OrderByDescending(p => p.CreatedAt)];
    }

    /// <summary>Create one. The id is minted here, so two admins naming the same thing get two projects.</summary>
    public async Task<ProjectRecord> CreateAsync(string name, string byAdmin, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var record = new ProjectRecord(Guid.NewGuid().ToString("N"), name.Trim(), byAdmin, now, false, now, byAdmin);
        Directory.CreateDirectory(_dir);
        await WriteAsync(record, ct);
        log.LogInformation("{Admin} created project {Project} ({Id})", byAdmin, record.Name, record.Id);
        return record;
    }

    /// <summary>
    /// Change one under its own lock: read, apply, write. The edit is a function so the caller cannot
    /// hold a record across the gate and write back something it read before somebody else's change.
    /// </summary>
    public async Task<ProjectResult> UpdateAsync(
        string projectId,
        Func<ProjectRecord, ProjectRecord> edit,
        string byAdmin,
        CancellationToken ct)
    {
        var gate = VaultStore.GateFor(VaultStore.KeyFor(projectId));
        await gate.WaitAsync(ct);
        try
        {
            var found = Find(projectId);
            if (found.Status != ProjectLookup.Found || found.Record is null)
            {
                return found;
            }
            var updated = edit(found.Record) with
            {
                UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                UpdatedBy = byAdmin,
            };
            await WriteAsync(updated, ct);
            return ProjectResult.Of(updated);
        }
        finally
        {
            gate.Release();
        }
    }

    private string PathFor(string projectId) => Path.Combine(_dir, projectId + ".json");

    /// <summary>An id this store will touch: a hex GUID, so nothing a caller sends can leave the folder.</summary>
    private static bool IsUsableId(string projectId) =>
        projectId.Length == 32 && projectId.All(Uri.IsHexDigit);

    private Task WriteAsync(ProjectRecord record, CancellationToken ct) =>
        VaultStore.AtomicWriteAsync(
            PathFor(record.Id),
            JsonSerializer.SerializeToUtf8Bytes(record, AppJsonContext.Default.ProjectRecord),
            ct);

    private ProjectRecord? ReadOrNull(string path)
    {
        try
        {
            return JsonSerializer.Deserialize(File.ReadAllBytes(path), AppJsonContext.Default.ProjectRecord);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException)
        {
            log.LogError(e, "a project file could not be read and is left out of the list: {Path}", path);
            return null;
        }
    }

    private IEnumerable<string> SafeFiles()
    {
        try
        {
            return Directory.EnumerateFiles(_dir, "*.json").ToArray();
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return [];
        }
    }

    private ProjectResult Unreadable(string projectId, string why)
    {
        log.LogError(
            "project {Id} exists and cannot be read: {Why}. It is NOT treated as absent — a write over it "
            + "would lose whatever it holds.",
            projectId,
            why);
        return ProjectResult.Unreadable;
    }
}
