# PLAN — epic 3: projects, project folders, and a share rule the server can check

> Status: **IMPLEMENTED, 2026-09-06.** All five stories shipped: the project store and its six admin
> routes, the server's share rule and the developer Team filter, project folders that appear in the
> assigned person's vault and are removed on instruction, `format: 4` binding the project into a
> share, and the admin's three actions in the tree. Third of five epics under
> [PLAN_corp_control_plane.md](../todo/PLAN_corp_control_plane.md).
>
> **What shipped differently, and why — the part worth reading.**
>
> **The share vocabulary is `inherit | project | none`, not `inherit | allow | deny`.** The plan's
> `ProjectShare` type had been reserved in epic 1 and referenced by nothing; its words could not
> express "only inside a project", which is the rule this epic exists for. The assignment override
> reuses `ShareDefaults`, and the dead type was deleted rather than left as a trap for the story that
> would have reached for it.
>
> **`EffectiveShare` resolves `inherit` through `MemberPolicy`, never off the record's stored
> `shareDefault`.** `PolicyDto` already documents why there may be only one source for a rule, and
> the two disagreed exactly where it mattered: a role written by a NEWER server fails closed in the
> policy and fell through to the stored value here.
>
> **An unassigned person may do nothing** — `EffectiveShare` answers `none` for an absent assignment
> rather than the person's own default, which would have given a member with a permissive default the
> run of every project on the server.
>
> **The reconcile gained two actions the plan did not have.** `toUnlock`: a folder kept after an
> assignment quietly ended is UNLOCKED, or the person holds a folder they can never rename or move
> again on behalf of a relationship that is over. `toRelock`: the same project given back adopts that
> kept folder instead of creating over its derived id, which would have duplicated a node id in a
> vault that merges by node id.
>
> **The reconcile PULLS before it decides.** The plan's ordering requirement was accepted and then
> not implemented: hung off the policy refresh, a second machine could read "no assignment, no
> instruction", unlock a folder the first machine had deleted, and resurrect it — the unlock's newer
> version vector beats the tombstone. Found by the code round.
>
> **The client's share rule does not check whether a project is archived.** It cannot: the policy
> document carries assignments with no lifecycle on them, and a second fetch on the share path is not
> worth it. The server refuses a closed engagement, which is the half that holds the fact.
>
> **`corpRoleAccess.ts` was never built.** `policyOf` already existed and is what every other corporate
> gate reads; a second reading of the same document would have drifted from it.
>
> **`/api/team` widened through a SECOND DTO** rather than nullable fields, so a header-less client's
> row stays byte-identical by construction. A developer is told only the projects they SHARE with each
> colleague — the full list would have leaked engagement names to exactly the role this epic fences —
> and only the projects they may actually SEND from, since an assignment with `none` is not a channel.
>
> **The contract floor went to 4, as planned**, and it is not lowerable from configuration: rolling it
> back means deploying the previous server build. `POST_DEPLOY.md` item 2 carries the number and
> records that its expectation moved without being re-verified against a deployment.
>
> **What the server cannot verify is now written down**: `projectId` is client-supplied and the payload
> is ciphertext, so the server cannot confirm the entity really sat in the folder it names — the same
> trust class `entityKind` has always occupied, and the reason the client-side move gate is part of
> this epic rather than a nicety.
>
> **Tails.** Epic 4's event-log reader replaces this epic's retention-bounded approximation of "who has
> shared with me" ([PLAN_corp_event_log.md](PLAN_corp_event_log.md)); the German and Spanish
> sentences added to the help article want a native speaker's eye; and `TimeProvider` instead of
> ambient `DateTimeOffset.UtcNow` was raised by the gate in four rounds and rejected each time as a
> repo-wide change rather than this epic's — it needs its own task.
>
> Depends on [PLAN_corp_registry_roles.md](PLAN_corp_registry_roles.md) (roles, `RequireAdmin`, the
> member record's `projects[]` and `pendingFolderRemovals[]`) and on
> [PLAN_corp_blocking_login_key.md](PLAN_corp_blocking_login_key.md) (`active`, which the share rule
> consults). [PLAN_corp_event_log.md](PLAN_corp_event_log.md) later replaces this epic's
> retention-bounded approximation of "who has shared with me".
>
> Related docs: [module_server.md](module_server.md) §`POST /api/shares`,
> [module_extension.md](module_extension.md),
> [PLAN_server_share_format.md](PLAN_server_share_format.md) (the `format` mechanism this
> plan extends), [PLAN_sharing.md](PLAN_sharing.md).

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

## How this epic is built: five stories

Split on 2026-09-06 against the code epics 1 and 2 actually shipped. Each story is a branch of its own
— the review gate is keyed by branch and closes after one round per stage — and the epic gets one pull
request.

| # | Story | Risk |
|---|---|---|
| 1 | Projects exist, people are assigned, and the instruction to remove a folder is a record the client acknowledges | expensive: a new store, a new admin surface, and the durability contract every later story leans on |
| 2 | The server refuses a developer's share outside the rule, and a developer's Team is their projects | expensive: the one server-enforced boundary of the epic, and it touches a pinned old-client wire shape |
| 3 | A project folder appears in the assigned person's vault, follows the project's name, locks for a developer, and is removed on instruction on every device | expensive: it deletes a person's data on a server instruction, and its ids must merge across machines |
| 4 | A developer's share carries and binds its project, and the UI never offers a share the server will refuse | expensive: a new AAD form is the exact failure class that broke server shares for six days |
| 5 | Team rows say role and projects; an admin creates, assigns and removes from the tree | ordinary |

### What the split found

**Every line number this plan cites is stale** — it was written on 2026-09-04 and twenty-five commits
have landed since. `isTreeNode` is not even in the file the plan names (it is `typeGuards.ts:466`).
Corrected references are recorded per story rather than re-listed here; the lesson is the one epic 1
already recorded: a plan's `file:line` is evidence with a shelf life.

The findings that change what gets built:

- **The rule must sit after epic 2's recipient check, and must not re-check `active`.** `RecipientRefused`
  already answers `403` for a deactivated recipient and **`503`** for a record it cannot read. The
  plan's `recipient is null || !recipient.Active` would answer `403` where the gate answers `503`, and
  would read *unavailable* as *not a member*. The project rule checks project membership and nothing else.
- **The plan's rule does not compile against the store.** `Find` returns a three-answer
  `MemberLookupResult`, not a nullable record, and an officer never reaches the lookup at the gate. The
  rule becomes `ShareRule.Decide(...)` — pure, a truth table, tested as one.
- **The plan enforces the rule on everyone who sends a `projectId`; decision 9 says members and admins
  share as today.** The client will send the field for any entity under a project folder whatever the
  role, so a member sharing out of A1 would have been refused. Enforced for DEV senders only; carried
  for everyone, because epic 4 logs it and format 4 binds it.
- **Widening `TeamMemberDto` breaks a pinned promise.** A header-less client is served even in corp
  mode, and a test asserts the team shape is byte-identical to personal mode for one. The new fields
  travel only to callers that declare contract ≥ 3.
- **No event rows.** Epic 4 assigns `project.created/renamed/archived/assigned/unassigned` to *this*
  epic's endpoints at their point of durable write. Without them epic 4 inherits a log nothing is
  required to write to — epic 1's sharpest finding, repeating.
- **`{name?, archived?}` needs `bool? Archived`.** A positional `bool` the client omitted binds
  `false`, so every rename would silently unarchive. This is `SetActiveRequest`'s lesson, one epic later.
- **The ack is per PERSON, not per device**, so it must happen after the push, not after the local
  delete: the first device to ack clears the instruction for every other one, which then depends on the
  tombstone having actually reached the remote.
- **Three files are within 2–31 lines of the 800-line ceiling** and the typed-folder move gate is
  already duplicated in two places. A third copy carrying the project lock is what the reuse rule
  forbids: the gate is extracted first, which also shrinks the file that hosts it.
- **An unknown `format` opens as legacy**, so a client from the epoch of epic 2 receiving `format: 4`
  would try the blob with no AAD and report a wrong PIN — the 0.82.1–0.87 failure exactly. Two answers
  are needed: refuse an unknown format with an "update" sentence, and bump the contract so a corp
  server refuses a client that cannot open what it will be sent.

### The two owner questions, answered here

Both were raised by the split; neither blocks the build, so each is proceeding under a stated answer.

1. **A developer's Team in this epic is their project colleagues, full stop.** The alternative —
   "everyone who has shared with me" — turns out to be *"everyone with a share pending right now"*: an
   inbox item is deleted the moment it is accepted or declined, the sender receipts name recipients
   rather than senders, and reading it would stream a whole inbox per Team call. Epic 4's log replaces
   the source with one that is kept.
2. **The contract floor goes to 4.** The mechanism exists for exactly this, and the failure it prevents
   is the worst kind: a colleague on an older build seeing a developer's share fail as a *wrong PIN*. A
   refusal that names the update is a better answer than a lie about a password.

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
