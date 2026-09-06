using FluentAssertions;

namespace CredVaultServer.Tests;

/// <summary>
/// The source-generated JSON contract, checked structurally — because this is the one class of bug the
/// endpoint suites cannot see.
/// </summary>
/// <remarks>
/// <para><c>Program.cs</c> inserts <see cref="AppJsonContext"/> at the HEAD of the resolver chain, not
/// alone in it. Under JIT a type the context does not know falls through to the reflection serializer:
/// every request succeeds, every endpoint test stays green. The published Native AOT binary has no
/// reflection serializer, so the same request fails at RUNTIME with "metadata not found" — on the
/// release runner, or in production, never on a developer's machine. Asking the context directly is the
/// only place the gap is visible before a publish.</para>
/// </remarks>
public sealed class AppJsonContextTests
{
    [Theory]
    [InlineData(typeof(MemberSelfDto))]
    [InlineData(typeof(ProjectSelfDto))]
    [InlineData(typeof(PolicyDto))]
    [InlineData(typeof(PendingFolderRemoval))]
    [InlineData(typeof(ErrorDto))]
    [InlineData(typeof(IReadOnlyList<ProjectSelfDto>))]
    [InlineData(typeof(IReadOnlyList<PendingFolderRemoval>))]
    [InlineData(typeof(MemberListEntryDto))]
    [InlineData(typeof(List<MemberListEntryDto>))]
    [InlineData(typeof(SetMemberRequest))]
    [InlineData(typeof(SetSettingsRequest))]
    [InlineData(typeof(SetActiveRequest))]
    [InlineData(typeof(OrgSettingsDto))]
    public void EveryOrgResponseTypeIsInTheSourceGeneratedContext(Type type)
    {
        // Every DTO the org routes and their refusals serialize, lists included. A missing entry here is
        // a 500 in the AOT binary and nothing at all in this suite's endpoint tests.
        AppJsonContext.Default.GetTypeInfo(type).Should().NotBeNull(
            $"{type.Name} crosses HTTP from /api/org/* and must be in AppJsonContext, or the AOT binary fails at runtime");
    }
}
