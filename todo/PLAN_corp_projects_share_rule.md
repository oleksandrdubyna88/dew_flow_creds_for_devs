# PLAN — epic 3: projects, project folders, and a share rule the server can check

> Status: **plan only, nothing implemented yet, 2026-09-04.** Scope: an admin creates projects and
> assigns people to them; each assignment grows a locked folder in that person's own vault; and a
> developer may share only what is inside such a folder, only with people in the same project. Third
> of five epics under [PLAN_corp_control_plane.md](PLAN_corp_control_plane.md), which holds the
> owner decisions, the invariants and the shared shapes.
>
> Depends on [PLAN_corp_registry_roles.md](PLAN_corp_registry_roles.md) (roles, `RequireAdmin`, the
> member record's `projects[]` and `pendingFolderRemovals[]`) and on
> [PLAN_corp_blocking_login_key.md](PLAN_corp_blocking_login_key.md) (`active`, which the share rule
> consults). [PLAN_corp_event_log.md](PLAN_corp_event_log.md) later replaces this epic's
> retention-bounded approximation of "who has shared with me".
>
> Related docs: [module_server.md](../research/module_server.md) §`POST /api/shares`,
> [module_extension.md](../research/module_extension.md),
> [PLAN_server_share_format.md](../research/PLAN_server_share_format.md) (the `format` mechanism this
> plan extends), [PLAN_sharing.md](../research/PLAN_sharing.md).

## The symptom

Inside one domain, sharing is unrestricted: `POST /api/shares` checks that the recipient's domain
equals the sender's (`src_minimalapi_server/src/Program.cs:1166-1171`) and nothing else. A company
with contractors on three customer projects has no way to say "this person works on A1 and must not
receive anything from A5", and no way to give a new joiner the shape of the work — a folder per
project, appearing where it belongs — without someone doing it by hand on every machine.

There is also a trap in the existing model, and finding it early is why this plan is shaped the way
it is: **`folderType: 'project'` already exists and means something else.** It is a client-side
template that scaffolds a set of default subfolders inside a new folder
(`src_vs_code/src/commands/treeMutationCommands.ts:210-216`, `defaultFolders.ts:102-107`,
`types.ts:300`). It is not a corporate project, it is a shortcut, and reusing that field for
assignment would give one value two meanings on machines that already have folders created with it.

## What this epic delivers

1. **Projects on the server** — create, rename, archive — and **assignment** of any person to any
   project, with a per-assignment share override for devs.
2. **A project folder in the assigned person's vault**, appearing at their next sync, carrying the
   project id, named after the project, and — for a dev — refusing rename, move and delete.
3. **Unassignment with a choice**: leave the folder, or delete it permanently on every device that
   person syncs.
4. **The share rule**, enforced by the server and mirrored by the client so the UI never offers a
   share that will be refused.
5. **Team filtered for devs** to project colleagues plus everyone who has shared with them.

## Decisions taken here, with their reasons

**A new field, `projectId`, orthogonal to `folderType`.** For the reason above. `isTreeNode`
(`types.ts:740-788`) gets the same string guard `folderType` has, so a malformed value from a foreign
build is dropped rather than trusted.

**The folder's node id is derived, not minted:** `id = hash(accountId, projectId)`. Two machines of
the same person, both offline, both seeing a new assignment, would otherwise mint two ids and
`syncMerge` — which merges by node id — would keep both, because nothing in it can know the two
folders mean one thing. A derived id makes them the same node by construction, and the ordinary
version-vector merge then resolves a concurrent rename the way it already resolves any other
(`module_extension.md` §What a sync actually does). This is the cheap case; first-wins would require
a device to have synced once to own the id, which is exactly the offline window that breaks.

**The instruction to delete a folder is a durable record the client acknowledges**, not a
fire-and-forget event: `pendingFolderRemovals[]` on the member record, read on every cycle, cleared
only by an explicit ack after the local delete has durably landed. The shape is the org-recovery
invite's ("ack only after the durable write", `PLAN_org_recovery.md` §Ceremonies) and
`pendingCleanup.ts`'s local-intent record. A person who never syncs again never acks, and the
instruction sits there — the umbrella's decision 8 accepts exactly that.

**Deleting is permanent, through the one real deletion path.** `deleteNodeRecursive` with the write
order the module doc pins (tombstone → node → secrets, `module_extension.md:274-350`), so the
deletion travels to that person's other machines. Trash would not: an unassignment that leaves the
material in a folder the person still owns is not a removal.

**The rule is evaluated on the folder, not on the people.** An entity's project is the project
folder above it. This is the only formulation that survives a per-project override: with a rule about
people, a dev allowed to share in A1 could take an entity out of A5 and send it, and both halves of
the check would pass. It follows that **a dev cannot move an entity out of a project folder** except
to Trash — otherwise the same hole reopens through the tree.

**The server verifies what it can and says so about the rest.** The client sends `projectId` beside
`entityKind`; the server checks the sender's permission in that project and the recipient's active
membership. It cannot check that the entity really sits in that folder — that is inside ciphertext.
This is the same trust class `entityKind` already occupies (`Models.cs:70-86`), and it is stated in
the code and the module doc rather than left for a reader to assume otherwise. The client-side rule
is not a duplicate of the server's: it stops the UI offering an impossible share.

**A dev's share with no `projectId` is refused, not treated as a legacy share.** Otherwise the whole
rule is one omitted field away from being off.

**`projectId` is bound as AAD, in a new `format: 4`.** `format: 3` binds `{entityName, entityKind}`
because the server stamps the rest; `projectId` is the same trust class — client-supplied,
server-carried verbatim, security-relevant — so leaving it outside the tag would reopen exactly the
gap the `format` mechanism was built to close (`PLAN_server_share_format.md`). A share without a
`projectId` stays `format: 3`. `format: 4` is server-transport only, guarded by the same
`serverStamped` resolution that guards 3, never by `senderIsVerified` — the misclassification that
plan recorded as still open.

**All refusals are `403`.** Different sentences for a person, one status code, per
`RequireOfficer`'s doctrine of not leaking which fact failed.

**Team for a dev, in this epic, is approximate — and the approximation is named.** "Everyone who has
shared with me" is derived from the sender receipts and the inbox, both swept after
`Vault:ShareMaxAgeDays` (31). So a colleague who shared two months ago disappears from a dev's Team
until epic 4's log, which is kept forever, replaces the source. Written here so the change of
behaviour in epic 4 is a planned improvement rather than a surprise.

## The shapes

```csharp
// src/OrgProjects.cs
public sealed record ProjectRecord(string Id, string Name, string CreatedBy, long CreatedAt,
    bool Archived, long UpdatedAt, string UpdatedBy);
public sealed record ProjectDto(string Id, string Name, bool Archived);
public sealed record ProjectMemberRequest(string Share);       // "inherit" | "allow" | "deny"

// This epic widens both wire shapes, because it owns the project store the names come from.
// TeamMemberDto (Models.cs:137) is one field today: (string Email).
public sealed record TeamMemberDto(string Email, string Role, IReadOnlyList<string> ProjectIds);
// epic 1's ProjectSelfDto(ProjectId, Share) gains the name it could not know:
public sealed record ProjectSelfDto(string ProjectId, string Name, string Share);
```

```ts
// types.ts — TreeNode gains one optional field
projectId?: string;   // set on a corp project folder; orthogonal to folderType

// projectFolders.ts — pure, vscode-free
export interface ProjectAssignment { projectId: string; projectName: string }
export interface ProjectFolderDecision {
  toCreate: { nodeId: string; projectId: string; projectName: string }[];
  toRename: { nodeId: string; projectName: string }[];
  toDelete: { nodeId: string; projectId: string }[];   // permanent, then ack
}
export function reconcileProjectFolders(
  nodes: readonly TreeNode[],
  assigned: readonly ProjectAssignment[],
  pendingRemovals: readonly { projectId: string; deleteFolder: boolean }[],
  accountId: string,
): ProjectFolderDecision;

// shareRule.ts — pure, the client twin of the server check
export function canShare(facts: ShareRuleFacts): { allowed: boolean; reason?: string };
```

## Files

### Server

| File | New/modify | Responsibility |
|---|---|---|
| `src/OrgProjects.cs` | new | The records above and `EffectiveShare(member, projectId)` as a pure function: the per-project override, else the member's `shareDefault`. |
| `src/OrgProjectsStore.cs` | new | `${DataDir}/org/projects/<id>.json`, atomic writes, the `OrgRecoveryStore` idiom. Ids are GUIDs; a project is archived, never deleted, because the event log cites it. |
| `src/OrgProjectsEndpoints.cs` | new | The six project and assignment routes, as this epic's own `MapOrgProjectsEndpoints`. `Program.cs` does not grow. |
| `src/Program.cs` | modify | The rule in `POST /api/shares` (`:1154-1224`), after the domain check and before the size checks; `/api/team` (`:644-654`) filtering; one `MapOrgProjectsEndpoints` call. |
| `src/Models.cs` | modify | `ProjectId` on `ShareRequest`/`ShareItem`; `TeamMemberDto` widened. |
| `src/AppJsonContext.cs` | modify | Registrations. |
| `http/org/projects.http` | new | Happy path, every refusal the endpoints decide themselves, and an `# @uncovered` line for what the wire cannot provoke. |

**Endpoints**

| Method | Path | Auth | Answers |
|---|---|---|---|
| GET | `/api/org/projects` | any allowed caller | All for admin and member; a dev sees only their own. |
| POST | `/api/org/projects` | `RequireAdmin` | `{name}` → `ProjectDto`. |
| PUT | `/api/org/projects/{id}` | `RequireAdmin` | `{name?, archived?}`. A rename is what propagates to folder names at the next sync. |
| PUT | `/api/org/projects/{id}/members/{email}` | `RequireAdmin` | `{share}` — assign or change the override. Assignment implies "create the folder". |
| DELETE | `/api/org/projects/{id}/members/{email}` | `RequireAdmin` | `?deleteFolder=true|false`. `true` appends a `pendingFolderRemovals` entry. |
| POST | `/api/org/members/me/pending-folder-removals/{projectId}/ack` | own caller | `204`, idempotent. The client's proof the delete ran on this device. |

**The rule, in `POST /api/shares`**

```csharp
// after the domain check at Program.cs:1166-1171
var sender = members.Find(caller.Value.Email);
if (sender?.Role == "dev" && string.IsNullOrEmpty(req.ProjectId))
    return await Fail(ctx, 403, "Developers may only share entities from a project folder.");

if (!string.IsNullOrEmpty(req.ProjectId))
{
    var project = projects.Find(req.ProjectId);
    if (project is null || project.Archived)
        return await Fail(ctx, 403, "That project is not available.");
    if (sender?.Role == "dev" && OrgProjects.EffectiveShare(sender, req.ProjectId) != "allow")
        return await Fail(ctx, 403, "You may not share entities from this project.");
    var recipient = members.Find(req.ToEmail);
    if (recipient is null || !recipient.Active
        || !recipient.Projects.Any(p => p.ProjectId == req.ProjectId))
        return await Fail(ctx, 403, "The recipient is not an active member of this project.");
}
```

Members and admins with no `projectId` fall through unchanged — today's behaviour, untouched.
"Replying to a sender outside the project is refused" needs no separate branch: it is the recipient
membership check with the two people swapped.

`createForUser` (`src_vs_code/src/commands/shareCommands.ts:41-113`) reaches the same endpoint
through `appendShares` (`serverTransport.ts:299-332`), so there is one rule and one place to enforce
it. Verified, not assumed.

### Extension

| File | New/modify | Responsibility |
|---|---|---|
| `src/types.ts` | modify | `projectId` on `TreeNode` (`:320-369`) and its guard in `isTreeNode` (`:740-788`). |
| `src/projectFolders.ts` | new, pure | `reconcileProjectFolders` — create, rename, delete decisions, idempotent by `projectId`, derived node id. |
| `src/syncManager.ts` | modify | `resolveProjectAssignments?`, settable after construction exactly like `resolveEscrow` (`:100-108`), wired in `activate()` once transports exist; `undefined` behaves as today. Each cycle: reconcile → apply → ack, **ack after the durable delete**. |
| `src/corpRoleAccess.ts` | new, pure | The account's role as a value the tree can read synchronously, cached where the policy fetch of epic 1 puts it. |
| `src/treeRowText.ts` | modify | `folderContextValue`/`entityContextValue` gain a `:locked` token when the row is a dev's project folder or lives under one. |
| `package.json` | modify | `editNode` (`:1434`), `moveNode` (`:1438-1440`), `deleteNode` (`:1448-1450`) exclude `:locked` with the negation idiom already used there for `:mixed`. |
| `src/commands/treeMutationCommands.ts` | modify | The move refusal in code (`moveNode`, `:351-377`) and in the drop handler (`treeDataProvider.ts:760-788`): an entity may not leave a project folder for anywhere but Trash. Menus are discoverability; this is the gate. |
| `src/shareRule.ts` | new, pure | The client twin of the server rule, used by `pickRecipients` (`shareInbox.ts:87-114`) and as a pre-flight in the deliver path. |
| `src/shareFormat.ts` | modify | `format: 4` binding `{entityName, entityKind, projectId}`, server transport only. |
| `src/serverTransport.ts` | modify | `projectId` in the POST body (`:299-332`). |
| `src/treeDataProvider.ts` | modify | Team rows carry role and projects (`:455-466`); admin QuickPicks "New project…", "Assign to project…", "Remove from project…" (the delete-folder choice is a two-item QuickPick, not a checkbox — VS Code has no checkbox in a QuickPick, and a two-item pick states both outcomes in words). |

## Growth

| Surface | Size | Retired by | Interrupted |
|---|---|---|---|
| `org/projects/*.json` | 10–100 × ~500 B | archived, never deleted — the log cites them | atomic write |
| `pendingFolderRemovals` | ≤ 1 per project ever assigned per person | the client's ack; the record dies with the member | a lost ack re-sends; the client's delete is idempotent |
| project folders in a vault | one per assignment, inside the person's own vault | the unassign instruction | tombstone-first write order, resumable |

## Build order

1. Server: `OrgProjects.cs`, `OrgProjectsStore.cs`, the five project/assignment endpoints,
   `AppJsonContext` entries.
2. Server: `ProjectId` on the share models, the rule in `POST /api/shares`, its test matrix red then
   green.
3. Server: `TeamMemberDto` widened with the role and the project ids — the field epic 1 deliberately
   left alone — and `/api/team` filtered for a dev, including the retention-bounded "shared with
   me" set and its stated limit.
3a. Server: `ProjectSelfDto` gains `Name`, and `GET /api/org/me` joins it from the project store.
   Epic 1 shipped that response with the assignment only, because the store did not exist yet.
4. Server: the ack endpoint.
5. Extension: `TreeNode.projectId` + guard; `projectFolders.ts` + tests, including two independent
   reconciles producing the same node id.
6. Extension: the sync wiring and the ack round-trip.
7. Extension: `corpRoleAccess.ts`, the `:locked` tokens, the `package.json` clauses, and the
   move-out refusal in both handlers.
8. Extension: `shareRule.ts`, recipient filtering, `format: 4`, the `projectId` on the wire.
9. Extension: Team rendering and the three admin QuickPicks.
10. Docs: `module_server.md`, `module_extension.md`.

## Test plan

**Server**: the share matrix — dev allowed in project; dev denied by override; dev denied by
default; dev with no `projectId`; recipient not a member; recipient inactive; archived project;
member and admin unaffected. Team: a dev sees project colleagues and recent senders and nobody else;
a member sees the domain. Projects: non-admin refused; rename; archive; assignment; unassignment with
and without the folder flag; the ack clears the entry and is idempotent.

**Extension** (`node:test`): `projectFolders.test.ts` — create when absent, never twice, rename when
the name differs, delete only on an instruction, the derived id stable across two runs and two
machines; `shareRule.test.ts` mirroring the server matrix case for case, because two rules that can
disagree will; `shareFormat.test.ts` — a `format: 4` share with a tampered `projectId` fails to open,
and a `format: 3` share still opens (the frozen-envelope discipline `envelopeAad.test.ts` already
practises).

## Risks

1. **`projectId` is an unverifiable claim about containment.** Stated, tested at the level the
   server can reach, and written into the module doc. Not hidden.
2. **Team-for-dev is retention-bounded** until epic 4. Named above; epic 4's DoD includes replacing
   the source.
3. **The derived node id must not collide with an existing folder id.** The hash is over
   `accountId` and `projectId` with a distinct prefix; a test asserts a vault of ordinary folders
   never matches one.
4. **Two meanings of the word "project"** in the codebase — the old `folderType` template and the new
   corporate project. The module doc gets one paragraph making the distinction, because the next
   contributor will otherwise reuse the wrong one.
5. **A locked folder in a vault that later leaves corp mode** (the account is removed from the
   server, or the roster is cleared) must unlock rather than stay frozen: the lock is a function of
   the live policy, never a stored flag. This is a test, not a note.

## Definition of Done

- [ ] Both suites green; the share matrix was watched failing first on the server side.
- [ ] A dev cannot rename, move or delete a project folder, cannot move an entity out of one, and
      cannot share outside the rule — verified in a running window, not only in tests.
- [ ] An unassignment with the delete flag removes the folder on a second machine of the same person.
- [ ] `http/org/projects.http` runs green.
- [ ] `module_server.md` documents the endpoints, the rule and what the server cannot verify;
      `module_extension.md` documents `projectId`, the derived id, the locks and `format: 4`.
- [ ] The `coai` gate: `review_plan` reached `proceed`, `review_code` ran, findings resolved,
      verdicts and reviewer counts reported.
