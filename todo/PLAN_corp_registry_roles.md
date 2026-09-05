# PLAN — epic 1: the members registry, roles, runtime settings, contract 3

> Status: **plan only, nothing implemented yet, 2026-09-04.** Scope: the server learns who its
> people are and what each of them is — a registry under `${DataDir}/org/`, three roles, an
> admin gate, a policy document every client reads each cycle, runtime settings admins can edit
> without a restart, and the client-version floor a corporate deployment needs. First of five
> epics under [PLAN_corp_control_plane.md](PLAN_corp_control_plane.md), which holds the owner
> decisions, the invariants and the shared shapes this plan implements against.
>
> Next epics depend on this one: [PLAN_corp_blocking_login_key.md](PLAN_corp_blocking_login_key.md)
> needs `active` and `RequireAdmin`,
> [PLAN_corp_projects_share_rule.md](PLAN_corp_projects_share_rule.md) needs roles,
> [PLAN_corp_event_log.md](PLAN_corp_event_log.md)'s *store* ships here so epics 1–3 emit into it.
>
> Related docs: [module_server.md](../research/module_server.md),
> [module_extension.md](../research/module_extension.md),
> [PLAN_org_recovery.md](../research/PLAN_org_recovery.md) (every pattern below is its pattern).

## The symptom

A company deploying this server can name recovery officers and nothing else. The server's whole
model of a person is the email in a verified token; its whole model of a team is "everyone who has
written a vault in your domain", derived by listing `.email` sidecars
(`src_minimalapi_server/src/VaultStore.cs:143-168`, consumed by `GET /api/team`,
`Program.cs:644-654`). There is one role-shaped check in the codebase, `OrgRecoveryConfig.IsOfficer`
(`OrgRecovery.cs:30`), gating exactly one thing through `RequireOfficer` (`Program.cs:696-708`).

So there is nowhere to record that Anna administers, that Boris is a developer who may not export,
or that Clara has left. Every later epic needs that record; this one writes it, and nothing else.

## What this epic delivers

1. A **members registry** at `${DataDir}/org/members/<key>.json`, one small JSON record per person,
   written atomically, read defensively.
2. **`RequireAdmin`**, next to `RequireOfficer`, admitting officers unconditionally and registry
   admins by their record.
3. **`GET /api/org/me`** — the one document every client fetches each cycle, in corp mode and out
   of it, carrying role, flags, policy and the offline lease.
4. **Admin endpoints** to list members, set a role and a share default, and read and write runtime
   settings.
5. **Contract 3**, with a corp-mode floor: on a server with a roster, a client below 3 is answered
   `426` with a sentence that says why.
6. The **event-log store** (append-only NDJSON), so this epic and the next two record what they do
   from the first commit. Its query endpoint and viewer belong to epic 4.

Out of scope, by decision: blocking and the login key (epic 2 owns `active`'s *behaviour*; this epic
only reserves the field), projects (epic 3 owns `projects[]`'s *behaviour*; this epic reserves the
field and the DTO shape), the log's query surface (epic 4), backup (epic 5).

## What this epic is NOT — the finding the round opened with

**Contract 3 and the policy document are not an enforcement boundary, and this plan has to say so
where somebody reading only this plan will see it.** A developer holding a valid token can call
`POST /api/shares` or `GET /api/vault` with `curl`; nothing in this epic stops them, because
everything this epic ships is a document the client is expected to obey. The umbrella's *Boundaries*
table grades every rule, and the three this epic publishes fall out like this:

| Rule | Enforced where | Lands in |
|---|---|---|
| a developer may not export, back up locally, clone into a personal account | the shipped extension only — a mistake, not an insider | epic 2 |
| a developer may share only inside a project, with an active member of it | **the server**, at `POST /api/shares` | **epic 3** |
| a blocked person may do nothing at all | **the server**, in the caller gate | **epic 2** |

So the contract floor exists for a narrower reason than "make the policy binding": a client below 3
cannot even READ the policy, and one that cannot read it cannot be expected to obey any of it.
Serving it would be serving a bypass *and* hiding that from whoever deployed the server. That is
worth a `426`; it is not worth calling security.

## Decisions taken here, with their reasons

**Corp mode is `orgRecovery.Enabled`, not a new key.** `OrgRecoveryConfig.Read` already computes it
at `Program.cs:51-53` and the value is in closure scope for every endpoint registered after it. A
second switch would be a second thing to misconfigure, and the umbrella's decision 1 says the roster
*is* the switch.

**Registration happens on the first vault write, not on the first authenticated call.** The default
role is `member` and the umbrella's decision 2 words it "auto-registered on first sync". `PUT
/api/vault` already calls `RecordOwnerAsync` at `Program.cs:628` for exactly this purpose; the
registry write is its sibling, idempotent, and gated on corp mode so a personal deployment never
creates the directory at all. Registering on every authenticated call would fill an admin's list
with tokens that synced nothing.

**And the hook may never fail the write it rides on.** By the time it runs, `TryWriteVaultAsync` has
already succeeded, so a registry write that throws — disk full, a lock, a permission — is caught,
logged at `Error`, and swallowed: answering `500` for a vault that was in fact stored is a worse
failure than an unregistered person, and an unregistered person is a state this design already
handles, because `GET /api/org/me` computes the default and the next sync retries the same
idempotent write.

**`GET /api/org/me` never writes.** A caller whose token is valid but who has never synced gets a
*computed* default — `member`, active, no projects — with no file created. This is
`OrgRecoveryConfig.Read`'s "off is the shape, not a flag" discipline applied to a person: the answer
is correct before the disk agrees.

**`/api/team` is filtered, not replaced, and its DTO is not widened here.** In personal mode it
stays byte-identical (sidecars, domain filter). In corp mode it drops members whose record says
`active: false`, so a blocked colleague cannot be picked as a recipient. **The role and the projects
join the DTO in epic 3**, which is the epic that touches `Models.cs` and needs the richer shape for
its own filtering — one epic owns one field, or two plans describe the same change and neither
builds it.

**A role may be set only for somebody in the caller's own domain.** Two reviewers found this
independently and it was a real hole: the plan scoped the LIST by `DomainOf` and said nothing about
the upsert, so on a server whose `Vault:AllowedDomains` names two companies, an admin at one could
write a role for a person at the other. `PUT /api/org/members/{email}` refuses a cross-domain target
with `403`, exactly as the break-glass session start already does (`Program.cs:983` —
`!allowAnyDomain && DomainOf(target) != DomainOf(caller)`), and the refusal has its own test.
`Vault:AllowAnyDomain` keeps its meaning: a deployment that deliberately turned domain scoping off
gets none here either.

**An officer's email cannot be given a role.** `PUT /api/org/members/{email}` naming an officer
answers `409`, never a silent no-op — the roster is config, changing it needs a ceremony
(`PLAN_org_recovery.md` §Top risks 1), and a UI that appeared to demote an officer would be lying.

**A record this build cannot read is not a person without rights — and it is not a person with
DEFAULT rights either.** This plan said an unparseable record "is treated as *not registered*", and
the round is what showed that sentence to be a privilege escalation wearing a defensive coat: not
registered means the default, the default is `member`, and a member may export. Corrupt one file —
a half-written record, a bad sector, a restore from a truncated archive — and a developer becomes a
member. So the lookup has three answers, not two:

```csharp
public enum MemberLookup { Found, NotRegistered, Unavailable }
```

- **`NotRegistered`** — no file. The person has never synced, so the computed default applies; that
  is the whole reason `GET /api/org/me` can answer before the disk agrees.
- **`Unavailable`** — a file exists and this build could not read it: malformed JSON, an I/O error,
  a schema version it refuses. Every caller fails CLOSED — `RequireAdmin` refuses, `GET /api/org/me`
  answers **`503`** with `Retry-After`, and the reason is logged at `Error` naming the file. A
  refusal a person can see and an operator can fix beats a silent promotion nobody can.
- **A read on the request path may never throw.** The gate calls `Find` on every request; an
  exception there answers a stack trace where a sentence belongs. The store catches `IOException`,
  `UnauthorizedAccessException` and `JsonException`, answers `Unavailable`, and logs once per file
  rather than once per request.

**The registry is read synchronously, from an in-memory cache.** Epic 2 puts an `active` check
inside the caller gate, which runs on every request and is synchronous today
(`Program.cs:445-459`). A disk read per request on that path is the wrong shape, and making the gate
async turns roughly seventeen call sites into awaits for a file that is at most a few hundred small
records. So the store exposes:

```csharp
// Three answers, never two — a null here is what the escalation above was made of.
MemberLookupResult Find(string email);          // synchronous, from the cache, never throws
Task<UpsertResult> UpsertAsync(string email, Func<MemberRecord, MemberRecord> edit,
                               string byAdmin, CancellationToken ct);   // says whether it CREATED
IReadOnlyList<MemberRecord> ListForDomain(string domain);
void Remove(string email);                       // DELETE /api/vault takes the record with it
```

`UpsertResult` reports `Created` because two callers need to know: the registration hook emits
`member.registered` only on a create, and an admin upsert that creates a record emits it too, with
the admin as the actor. **Epic 2's `SetActiveAsync` is this same `UpsertAsync`**
(`r => r with { Active = false }`), not a second write path around the lock; epic 2's plan is
corrected to say so.

The cache is filled lazily per email and invalidated by every write that goes through the store, so
there is exactly one path that mutates it — and that is not enough on its own, which two findings
caught between them:

- **A cached record goes stale the moment anything outside this process writes the file** — a
  restore, an operator's editor, a second instance during a rolling restart. Left alone, epic 2's
  block check would keep admitting somebody blocked minutes ago, which is the one thing it exists to
  prevent. So a cache entry carries the file's `LastWriteTimeUtc` and length and `Find` re-stats
  before answering; a mismatch re-reads. A stat is microseconds; a stale block is the failure this
  whole epic is scaffolding for. **The test is an ALREADY-CACHED record changed on disk by another
  writer** — not the cache miss this plan originally tested, which proved nothing about it.
- **Two admins editing one person can lose an edit.** Atomic replacement stops a torn file, not a
  lost update: both calls read the same record, each applies its own change, and the second write
  wins whole. `UpsertAsync` does its read-modify-write **inside a per-member lock**, the striped
  semaphore `VaultStore` already uses for this exact reason (`VaultStore.cs:115-119`, and the
  TOCTOU note above it). Tested with two concurrent edits to two different fields, both surviving.

This is a contract epics 2, 3 and 4 build on; changing it later changes them.

**Runtime settings are runtime because they have no cryptographic consequence.** `offlineLeaseHours`
changes behaviour; the officer roster changes what a key is sealed to. The first is one PUT away,
the second is a restart plus a ceremony, and `GET /api/org/settings` says so in its own shape.

**Refusals on `/api/org/*` are JSON `ErrorDto`**, the shape the exception handler already emits
(`Program.cs:384-393`), because an admin UI must show *why*. The old endpoints keep plain-text
`Fail`. Status codes follow `RequireOfficer`'s doctrine: `403` for both "not admin" and "corp mode
off", because distinguishing them hands out the shape of the roster for free.

## The shapes

```csharp
// src/OrgMembers.cs — records only, no I/O
public sealed record MemberRecord(
    string Email,
    string Role,             // "admin" | "member" | "dev"
    bool Active,             // epic 2 owns the behaviour; the field is written here
    string ShareDefault,     // devs only: "project" | "none"
    IReadOnlyList<ProjectAssignment> Projects,          // epic 3
    IReadOnlyList<PendingFolderRemoval> PendingFolderRemovals,  // epic 3
    int LoginKeyVersion,     // epic 2
    long UpdatedAt,
    string UpdatedBy);

public sealed record ProjectAssignment(string ProjectId, string Share);   // "inherit"|"allow"|"deny"
public sealed record PendingFolderRemoval(string ProjectId, bool DeleteFolder, long At);

// the wire
// ProjectSelfDto carries only what THIS epic can know: the assignment. Epic 3 owns the project
// store, so it is epic 3 that adds Name and joins it in — named there as a build item, because a
// field in a documented response that no epic can fill is how a shape becomes a lie.
public sealed record ProjectSelfDto(string ProjectId, string Share);

public sealed record MemberSelfDto(bool CorpMode, string Email, string Role, bool Active,
    bool IsOfficer, string ShareDefault, IReadOnlyList<ProjectSelfDto> Projects,
    IReadOnlyList<PendingFolderRemoval> PendingFolderRemovals, PolicyDto Policy,
    int OfflineLeaseHours, int LoginKeyVersion, int ServerContract);
public sealed record PolicyDto(bool Export, string Share, bool MoveOutOfProject);
public sealed record MemberListEntryDto(string Email, string Role, bool Active, string ShareDefault,
    IReadOnlyList<string> ProjectIds, bool IsOfficer, long UpdatedAt, string UpdatedBy);
public sealed record SetMemberRequest(string? Role, string? ShareDefault);
public sealed record OrgSettingsDto(int OfflineLeaseHours, long UpdatedAt, string UpdatedBy);
```

`PolicyDto` is derived on the server from the role, never stored: `dev` → `{export: false, share:
shareDefault, moveOutOfProject: false}`; `member`/`admin` → `{export: true, share: "any",
moveOutOfProject: true}`. Derived, because a stored copy of a rule is a second source of truth that
drifts from the role it was derived from — the failure `module_extension.md` records as "the kind is
carried, not re-derived" in reverse.

**A record from a NEWER build must round-trip through this one.** `System.Text.Json` drops an
unknown property in silence, so an older server reading a record a newer one wrote and then writing
it back — which every role change does — would strip whatever the newer build added, and nothing
would notice. This is the extension's own hard-won rule in a second setting: *a wrap this build
cannot use is one it must carry* (`module_extension.md`, §Cryptography). So `MemberRecord` carries:

```csharp
int SchemaVersion,                                                        // 1 today
[property: JsonExtensionData] IDictionary<string, JsonElement>? Unknown   // carried, never dropped
```

A record whose `SchemaVersion` exceeds this build's is `Unavailable`, not "unknown fields I will
ignore": a build that cannot promise it understands a record must not act on it. The test writes a
record with an extra field and a bumped version, reads it, writes it back, and asserts the extra
field survives byte for byte.

**Every DTO gets a `[JsonSerializable]` line in `AppJsonContext.cs:33-59`.** AOT has no reflection
serializer; a missing entry fails at runtime, and the file's own header says so.

## Files

### Server

| File | New/modify | Responsibility |
|---|---|---|
| `src/OrgMembers.cs` | new | The records above, `MemberRole`/`ShareDefault` validation, `PolicyFor(role, shareDefault)` as a pure function. |
| `src/OrgMembersStore.cs` | new | `${DataDir}/org/members/<KeyFor(email)>.json`, with the four methods named above. Same idioms as `OrgRecoveryStore.cs` — atomic write per `OrgRecoveryStore.cs:374-379`, keys from `VaultStore.KeyFor` (`VaultStore.cs:30-36`) so one identity space has one hashing scheme — with **two deliberate departures from that template, both stated in the file header**: its directories are created lazily on the first write, not in the constructor (`OrgRecoveryStore.cs:29-40` creates eagerly, and this store is constructed on every deployment including personal ones, where no `org/` may appear); and a record that will not parse is **`Unavailable`, never *not registered*** — the difference is the escalation this plan's round found. The per-member lock reuses `VaultStore`'s stripe by widening `GateFor` (`VaultStore.cs:115-119`) from `private static` to `internal static`, rather than standing up a second one; a member upsert and a vault write for the same email then share a gate, which is harmless and worth saying out loud. |
| `src/OrgSettingsStore.cs` | new | `${DataDir}/org/settings.json`, one record. Absent → the endpoint answers the default and writes nothing. |
| `src/OrgEventLog.cs` | new | Append-only NDJSON at `${DataDir}/org/events/<yyyy-MM-dd>.ndjson`, `AppendAsync(OrgEventDto)` under **one dedicated `SemaphoreSlim(1,1)`** — every writer appends to the same file, so the vault's 64-way stripe does not apply and a comment says why, or somebody will "optimise" it into a race. The row shape and the kinds are defined in [PLAN_corp_event_log.md](PLAN_corp_event_log.md); the reader is that epic's. The break-glass audit log's bare `File.AppendAllTextAsync` (`OrgRecoveryStore.cs:312-317`) is safe only because a recovery is rare — it is the precedent for the *format*, not for the locking. Its own root, never under `org-recovery/`, so no future sweep can reach it. |
| `src/OrgEndpoints.cs` | new | `MapOrgEndpoints(...)`, an extension method holding this epic's five routes. **`Program.cs` is 1,381 lines today** and the five epics add about twenty endpoints between them, against the coding-style ceiling of 800. So the corporate surface is registered from per-epic files starting with the first one, the way the logic and storage halves are already split into `Org*.cs` / `Org*Store.cs`. |
| `src/Program.cs` | modify | `RequireAdmin` after `RequireOfficer` (`:696-708`); the registry hook beside `RecordOwnerAsync` (`:628`); the corp-mode contract floor in the middleware (`:309-320`); `orgMembers`/`orgSettings`/`orgEvents` constructed beside `orgRecovery` (`:48-56`), their directories created only in corp mode; one `app.MapOrgEndpoints(...)` call. The gates stay here beside `RequireOfficer`, so one file still answers "who may do this". |
| `src/ContractVersion.cs` | modify | `Current = 3` (`:40`), and `Judge` gains an optional corp reason so the `426` body names the cause. |
| `src/AppJsonContext.cs` | modify | Registrations. |
| `http/org/` | new | `.http` contract files per the shared rule: `me.http`, `members.http`, `settings.http`, one `# @name` per request, an `# @uncovered` line for anything the wire cannot provoke. |

### Endpoints

| Method | Path | Auth | Mirrors | Answers |
|---|---|---|---|---|
| GET | `/api/org/me` | any allowed caller | `/api/whoami` (`Program.cs:548-557`) | `MemberSelfDto`. Corp off → `corpMode:false` and inert defaults. Never writes. |
| GET | `/api/org/members` | `RequireAdmin` | `/api/team` (`:644-654`) | `MemberListEntryDto[]`, domain-scoped by `DomainOf` (`:1369-1373`). Not streamed: 200 records of ~1 KB. |
| PUT | `/api/org/members/{email}` | `RequireAdmin` | `/api/org-recovery/setup` (`:830-911`) for validation style | Upsert — an admin may set a role before the person's first sync. Officer → `409`. Bad role/shareDefault → `400`. `UpdatedBy` stamped from the token, never the body. |
| GET | `/api/org/settings` | `RequireAdmin` | `/api/org-recovery/config` read half | `OrgSettingsDto`; absent file → default 24. |
| PUT | `/api/org/settings` | `RequireAdmin` | same, write half | `offlineLeaseHours >= 0`; `0` is the legal "strictly online", not an error. |

### The event log — what emits, and what a failure means

The round's sharpest reliability finding was that this epic ships a log nothing is required to write
to: every endpoint here could pass its tests over an empty file. So the emissions are part of the
plan rather than of somebody's memory.

| Event | Emitted by | Carries |
|---|---|---|
| `member.registered` | the registration hook (`Program.cs:628`), on the write that creates a record | subject, the default role |
| `member.role_changed` | `PUT /api/org/members/{email}` when the role differs | actor, subject, from → to |
| `member.share_default_changed` | the same endpoint when the share default differs | actor, subject, from → to |
| `settings.changed` | `PUT /api/org/settings` | actor, the field, from → to |

Two rules about failure, because "append-only" says nothing about what happens when the append
cannot:

1. **The row is appended AFTER the mutation has landed, and a failed append never fails the
   mutation.** A role change that happened must not be reported as a `500`; the write is already on
   disk, and a client that retried would be acting on a lie. The failure is logged at `Error` naming
   the file — the operator's signal that the log has stopped recording.
2. **The append waits for its lock with a bound.** One `SemaphoreSlim(1, 1)` is the right shape —
   there is exactly one file per day, so a "per-file lock" is the same lock under another name — but
   an unbounded wait on a request path is how one stuck writer becomes a stalled server. The wait is
   bounded at five seconds; past it the append is abandoned under rule 1.

Every mutation above gets an **end-to-end test** that performs the request and reads the log back,
because the failure this prevents is exactly a green suite over a silent log.

### Contract 3 and the corp floor

`ContractVersion.Current` becomes 3 (`ContractVersion.cs:40`). `Vault:MinimumClientContract` stays
operator-configurable; the middleware computes an **effective** minimum,
`orgRecovery.Enabled ? Math.Max(configured, 3) : configured`, and passes it to the existing
`Judge` (`ContractVersion.cs:77`). `orgRecovery` is already in scope at `Program.cs:309-320`.

The `426` text in corp mode names the reason: a pre-3 client does not know about roles, and the
policy it would ignore is enforced in the extension, so serving it would be serving a bypass. This
is a hard cutover on the day a corp server upgrades — decision 12, taken deliberately, and it
belongs in the release notes.

### Extension

| File | New/modify | Responsibility |
|---|---|---|
| `src/corpApiClient.ts` | new | The request plumbing every corporate client needs — `url()`, `headersFor()`, `request()`, the contract header, the timeout — extracted from `orgRecoveryClient.ts`, which becomes its first caller with no change in behaviour. **Extracted here, not later**: epics 2 and 5 each add a client, so by epic 2 there would be three copies of it and by epic 5 four. The reuse-first rule's answer to that is to pull the common half out before the second copy exists. |
| `src/orgMembersClient.ts` | new | `readMe`, `listMembers`, `setMember`, `readSettings`, `writeSettings`, on top of `corpApiClient`. Separate from `ServerTransport` for the reason `orgRecoveryClient.ts:10-14` gives: `VaultTransport` is implemented by a folder and a git remote too, and widening it with corp methods makes them carry a concept they cannot mean. |
| `src/corpPolicy.ts` | new, pure | `corpPolicy(facts)` → `{role, policy, leaseHours, fetchedAt}` and `accountContextValue` extension. Pure so the rule is a unit test, exactly as `orgRecoveryAccess.ts:38-64` is. **The admin predicate is `role === 'admin' \|\| isOfficer`, never the role alone** — the round caught this backwards: the server's `RequireAdmin` admits an officer unconditionally, and an officer cannot be given a registry role (that is the `409`), so gating the UI on the role would show an officer no management actions while the server served every one of them. `MemberSelfDto` already carries `IsOfficer` for it. |
| `src/orgRecoveryAccess.ts` | modify | The union gains `admin` and `dev`; `accountContextValue` (`:53-64`) gains `account-corpAdmin` and `account-corpDev`. Officer stays highest — an officer is always an admin, so no combined state exists. The prefix rule (`viewItem =~ /^account-corp/`) keeps working for everything already contributed against it. |
| `src/extension.ts` | modify | `refreshOrgPolicy(account)` beside `refreshOrgAccess` (`:459-479`), called from the same per-account loop (`:481-489`). One fetch per readiness cycle. A failure caches the previous answer and never throws — the org-escrow rule "not knowing changes nothing" applies here too. **The success timestamp is the offline lease's heartbeat** (epic 2 reads it). |
| `src/treeDataProvider.ts` | modify | `orgPolicy` cache beside `orgAccess` (`:91`); the `teamMember` row (`:455-466`) shows the role in its description and takes `teamMember-adminView` when the viewing account is an admin, so the QuickPick does not appear for a member looking at colleagues. |
| `src/orgMemberPolicyPanel.ts` | new | "My role and policy" — a read-only webview built exactly like `orgRecoveryPanel.ts:33-41` (`enableScripts: false`, escaped HTML). It exists for the same reason that page does: a policy nobody can see reads as a broken product. |
| `package.json` | modify | `credSshManager.setMemberRole` beside `createForUser` (`:637`, menu `:1393`), gated `viewItem == teamMember-adminView`; `credSshManager.showMyRole` beside `showOrgRecovery` (`:803`, menu `:1588`), reusing the existing `viewItem =~ /^account-corp/` guard, which already means "corp mode is on for this account". |
| `src/contractVersion.ts` | modify | `CLIENT_CONTRACT_VERSION = 3` (`:19`), with an `ORG_POLICY_CONTRACT = 3` documented in the style of `SHARE_FORMAT_CONTRACT`. |

## The small decisions the story split had to ask about

Each of these was under-specified enough that two people would have implemented it two ways.

- **`member.registered` has two emitters**, not one: the sync hook, and an admin upsert that creates
  a record before the person has ever synced. The actor differs (the person, then the admin); the
  kind does not. It is added to epic 4's kinds union, where it was missing.
- **`SetMemberRequest` with both fields null is `400`**, not a no-op that answers `200` and changes
  nothing. A `shareDefault` sent for a non-developer is **stored**, not refused: it only takes
  effect for `dev`, exactly as `MemberPolicy.For` reads it, and refusing it would stop an admin
  setting the shape before demoting somebody.
- **The gate writes the JSON body itself.** `RequireOfficer` sets a status and writes nothing
  (`Program.cs:696-708`), so a `RequireAdmin` modelled on it would produce an empty `403` where this
  plan promised an `ErrorDto`. A `FailJson` sibling of `Fail` (`Program.cs:465-469`) is what the
  gate and the endpoints both call.
- **`Retry-After` on the `503` is one named constant** in `OrgEndpoints.cs`, not a number typed at
  each site.
- **`MapOrgEndpoints` takes one `OrgEndpointDeps` record** — the gates, `DomainOf`, `orgRecovery`,
  the three stores, `allowAnyDomain`, the logger. They are local functions in a top-level
  `Program.cs` and cross the file boundary only as delegates; a record lets epics 2–5 widen the
  dependency set without editing the call site each time.
- **The appender guarantees the shape of the file, not the reader's tolerance of it.** Epic 4 owns
  the reader and its torn-line skip. What this epic can promise is that an append after a torn final
  line starts on a fresh one — it checks the last byte and prefixes `\n` — because otherwise the
  torn row and the next one fuse, and epic 4's skip loses two rows where it should lose one.
- **The client trusts the server's `policy` and uses `role` only for the UI.** The server derives
  the policy (§The shapes); a client that re-derived it would be a second implementation of the same
  rule, drifting the day either changes. An unknown role therefore means "show no admin actions",
  and the most-restrictive fallback applies only when `policy` itself is absent or malformed.

## Growth

| Surface | Size at 200 people | Retired by | Interrupted |
|---|---|---|---|
| `org/members/*.json` | ~200 KB | deleted with the vault (`DELETE /api/vault` gains the registry file); otherwise kept — a person leaves by being blocked | atomic write, nothing partial |
| `org/settings.json` | one record | overwritten | atomic write |
| `org/events/*.ndjson` | ~50 KB/day, **kept forever**, ~18 MB/year — decision 11 | nobody; the sweeps must skip it, pinned by a test | a torn final line is skipped by the reader (epic 4) and logged once |

## Build order

Server first; the extension cannot be tested against an endpoint that does not exist.

1. `OrgMembers.cs` + `OrgMembersStore.cs` + **`OrgSettingsStore.cs`** + `AppJsonContext` entries;
   store-level tests. The settings store moves up from step 5: `MemberSelfDto.OfflineLeaseHours`
   comes out of it, so `GET /api/org/me` cannot be built before it exists — the original order had
   the endpoint preceding its own data source.
2. `OrgEventLog.cs` + its append test, plus the test proving `ShareMaintenance` and
   `OrgRecoveryMaintenance` do not touch `org/events/`.
3. The registration hook at `Program.cs:628`; `GET /api/org/me` including the no-write default;
   **`DELETE /api/vault` removes the registry record** (named only in §Growth before this, and a
   growth budget nothing implements is a budget nobody keeps).
4. `RequireAdmin` — moved down to sit with its first caller. A gate with no caller is exactly the
   "control that exists in source and is never called" this repository has shipped before.
5. `GET /api/org/members`, `PUT /api/org/members/{email}`, and both settings endpoints.
6. `/api/team` corp-mode filter: inactive members dropped. The DTO keeps its single field until
   epic 3 widens it.
7. `ContractVersion.Current = 3` + the corp floor + the reason text, **and the client constant in
   the same story** (`contractVersion.ts:19`) — the two are one cutover, and splitting them opens a
   window in which this repository's own extension is refused by its own server.
8. `http/org/*.http` written and run green — **and `http/httpyac.config.js:43` bumped from
   `contract: '2'` to `'3'`**, which nothing else in this plan mentioned: the suite runs against a
   corp-mode server, so without it every request in the whole tree answers `426`.
9. Extension: `contractVersion.ts`, `orgMembersClient.ts`, `corpPolicy.ts` + tests.
10. Extension: `refreshOrgPolicy` wiring, the cache, the contextValues, and a **wiring test** in the
    shape of `orgRecoveryWiring.test.ts` — this repository has already shipped a corp feature whose
    resolver was never assigned, green tests and all (`module_extension.md` §What the reviews caught).
11. Extension: the Team row, `setMemberRole` QuickPick, `showMyRole` panel.
12. `research/module_server.md` and `module_extension.md` updated in the same task.

## Test plan

**Server** (`tests/`, xUnit v3 on MTP, `VaultServer` + `Tokens.For`, `[Collection(ServerCollection.Name)]`):

- `OrgMembersStoreTests`: `Find` answers from the cache after one read; a write invalidates it;
  **an ALREADY-CACHED record changed on disk by another writer is re-read on the next `Find`** (the
  stat check, not a cache miss); two concurrent `UpsertAsync` calls editing different fields both
  survive; a malformed record answers `Unavailable`, never `NotRegistered`; a record with a higher
  `SchemaVersion` answers `Unavailable`; an unknown field round-trips byte for byte; a read that
  throws `IOException` answers `Unavailable` and does not propagate.
- `OrgMembersTests`: registration happens on the first `PUT /api/vault` and not on `GET /api/org/me`;
  default role is `member`; a second PUT does not rewrite the record; personal mode creates no
  `org/` directory at all.
- `OrgAdminGateTests`: an officer with no registry row passes `RequireAdmin`; a registry admin
  passes; a member gets `403`; corp mode off gets the same `403`, indistinguishable.
- `OrgMembersAdminTests`: list is domain-scoped; upsert for a never-synced email; **a cross-domain
  target → `403`**; officer → `409`; invalid role → `400`; `UpdatedBy` comes from the token even
  when the body claims otherwise; a role change and a share-default change each leave exactly one
  event-log row.
- `OrgUnavailableTests`: with a corrupted record on disk, `GET /api/org/me` answers `503` and
  `RequireAdmin` refuses — never the member default, which is the escalation the round found.
- `OrgRegistrationTests`: a registry write that fails does not fail the vault write, and the next
  write registers the person after all.
- `OrgSettingsTests`: default without a file; PUT then GET; `0` accepted; negative `400`;
  non-admin `403`; a change leaves exactly one `settings.changed` row.
- `TeamCorpTests`: an inactive member is absent in corp mode and present in personal mode; the
  response shape is unchanged for an old client.
- `ContractVersionTests` (extend): corp mode floors the minimum at 3 even with the configured
  default; the body names the corp reason; personal mode is unchanged.
- `OrgEventLogTests`: append then read back; a day boundary starts a new file; a torn line does not
  break the reader; both maintenance sweeps leave the folder alone.

**Extension** (`node:test` over `out/test/*.test.js`, modules importing no `vscode`):

- `corpPolicy.test.ts`: role → policy table, including the two dev share defaults; a failed fetch
  keeps the previous answer; an unknown role from a newer server degrades to the most restrictive
  policy rather than the most permissive; **an officer whose role is `member` still gets the admin
  view**.
- `orgRecoveryAccess.test.ts` (extend): the two new contextValues, and that `account` is still
  byte-identical when corp mode is off.
- `orgMembersClient.test.ts`: response shape guards, contract header sent, `426` surfaced as the
  server's own sentence.
- `orgMembersWiring.test.ts`: the structural check that `refreshOrgPolicy` is actually called.

## Risks

1. **Two sources for "who is here"** — sidecars plus the registry — for the length of this epic.
   Accepted: the filter is additive and personal mode is untouched. Epic 3 revisits it.
2. **Extracting `corpApiClient` touches working code** (`orgRecoveryClient.ts`), which is exactly why
   it is done here rather than once four copies exist: the extraction is smallest now, and its
   characterization test is that the org-recovery client behaves identically afterwards.
3. **Contract 3 is a hard cutover** for an existing corp deployment. Deliberate (decision 12);
   it needs a release note, not a mitigation.
4. **An unknown role from a newer server** must fail closed. Written as a test above because the
   opposite is the natural mistake.
5. **`503` on an unreadable record is a refusal a person meets.** Fail-closed is right — the
   alternative promotes a developer by corrupting a file — but one bad file locks one person out
   until an operator looks. Taken deliberately: it is loud, it names the file, and it costs one
   record rather than the service.

## How this epic is built: four stories

Split by Fable after the plan round, and regrouped rather than sliced along the build order — the
regrouping is what the numbered steps above now reflect. Each story is reviewed on its own diff,
tested, documented and committed before the next one starts.

| # | Story | Risk |
|---|---|---|
| 1 | The server can persist who its people are, and never mistakes a record it cannot read for one it can — the three stores, the three-state lookup, the schema version, the per-member lock | expensive to get wrong: the data-format and concurrency contract every later epic reads |
| 2 | On a corp server everyone who syncs is registered, every client can read its role and policy, and a client too old to read it is refused — the hook, `GET /api/org/me`, the team filter, the contract cutover on both halves | expensive: a fail-closed `503` on the request path and a hard version cutover |
| 3 | An admin can see the roster, set a role and a share default, and change the offline lease, and every change leaves a row — `RequireAdmin` and the four admin routes | expensive: this is the authorization surface, and both the cross-domain hole and the officer-demotion lie were real findings |
| 4 | The extension knows each account's role, shows it, and lets an admin set one from the Team row | ordinary: every rule is a pure module with a unit test, and the server is the boundary |

## The plan round (2026-09-04)

Three reviewers, three vendors, all three answered; fourteen findings, twelve gating; verdict
`good_enough`, the stage's round budget being one.

**Twelve accepted and folded in above**: the export ban graded honestly rather than implied by the
contract floor; cross-domain role writes refused; the event log given its emissions and its failure
semantics; the cache made to notice an external write; lost updates closed with a per-member lock;
officers admitted to the admin view; the log's lock bounded; a three-state lookup so an unreadable
record can never read as the member default; a schema version with unknown fields carried; and the
registration hook made unable to fail a vault write that had already landed.

**Two rejected as duplicates** of findings already accepted — a second statement of the stale-cache
defect and a second of the schema-version one — with the reason recorded in the gate: one change
described twice is how the two descriptions later disagree.

The most valuable finding was one this plan created itself. *"An unparseable record is treated as not
registered"* read as defensive, and was an escalation whose trigger is a corrupted file.

## Definition of Done

- [ ] `dotnet build dew_flow_creds_for_devs.slnx` clean; server suite and `npm test` green.
- [ ] Every new behaviour has a test; the summary reports the watched failure and the pass.
- [ ] `http/org/*.http` runs green and declares what it does not cover.
- [ ] `research/module_server.md` documents the `/api/org/*` surface, the `org/` storage layout and
      the corp contract floor; `module_extension.md` documents the policy fetch, the contextValues
      and the panel.
- [ ] The `coai` gate: a `review_plan` round reached `proceed` before implementation, `review_code`
      ran on the finished branch, every finding resolved, verdicts and reviewer counts reported.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` clean.
