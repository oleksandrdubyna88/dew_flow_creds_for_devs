# PLAN — the corporate control plane: roles, blocking, projects, an event log, a server backup

> Status: **plan only, nothing implemented yet, 2026-09-04.** Scope: the umbrella over five epic
> plans that together turn a Cred Vault Server with recovery officers into a company deployment —
> a members registry with roles, a server-held login key that makes a dev's vault file dead without
> a live login, projects with a folder-based share rule, one append-only event log, and an encrypted
> server backup. This document holds the decisions, the invariants, the shapes every epic shares, and
> the order. Each epic carries its own code references, tests and Definition of Done.
>
> Epics, in build order: [PLAN_corp_registry_roles.md](PLAN_corp_registry_roles.md) →
> [PLAN_corp_blocking_login_key.md](PLAN_corp_blocking_login_key.md) →
> [PLAN_corp_projects_share_rule.md](PLAN_corp_projects_share_rule.md) →
> [PLAN_corp_event_log.md](PLAN_corp_event_log.md) →
> [PLAN_corp_server_backup.md](PLAN_corp_server_backup.md).
>
> Related docs: [architecture.md](../research/architecture.md) (§The trust boundary),
> [module_server.md](../research/module_server.md), [module_extension.md](../research/module_extension.md),
> [PLAN_org_recovery.md](../research/PLAN_org_recovery.md) (the only corporate feature that exists),
> [PLAN_org_recovery_tail.md](PLAN_org_recovery_tail.md) (its unpaid rehearsal — a precondition here).

## The symptom

The server knows a caller by one fact, the email in a verified token, and uses it for three
decisions: which vault, which inbox, whose name on a share (`architecture.md` §Authorization). That is
the right shape for a team of peers. A company needs four things the shape cannot express:

1. **Somebody is in charge.** The nearest thing to a role is `OrgRecoveryConfig.IsOfficer`
   (`src_minimalapi_server/src/OrgRecovery.cs:30`), a config-file list read once at startup and
   consulted by exactly one gate, `RequireOfficer` (`Program.cs:696`). Officers can recover a vault;
   they cannot see who shared what, assign anyone to anything, or stop a colleague from using the
   server.
2. **Leaving must be revocable now, not when HR gets round to the identity provider.** Today the
   only thing that removes a person is deleting their vault (`Program.cs:634-641`), and the only
   thing that stops a copied vault file from opening is the strength of a PIN — every wrap in the
   file opens it offline (`src_vs_code/src/vaultKeys.ts:258` `unlockInner`; the file's `account` header
   is plaintext, so the `accountId + PIN` derivation of `keyWrap.ts:128` is reproducible by anyone
   holding the file). The security review of 2026-08-24 (M-1) is explicit that this blob is attacked
   offline and unthrottled.
3. **Sharing has no boundary inside the domain and no memory.** `POST /api/shares` checks only that
   the recipient shares the sender's domain (`Program.cs:1166`); the sender's receipt dies the moment
   the recipient acts, and both sides are swept after `Vault:ShareMaxAgeDays` (`Program.cs:47`, 31).
   "Who ever shared X with whom" is not recorded anywhere.
4. **Export is unconditional.** Every exit channel — external export, NAS backup, snapshot schedule,
   clone into another account — is a client-side command any unlocked vault can run
   (`module_extension.md` §Snapshots, §`Backup to NAS`). The server cannot see it, let alone
   forbid it.

Meanwhile the same person may hold ten corporate accounts and five personal ones in one window, and
nothing here may touch the personal ones (owner decision 8).

## Owner decisions (2026-09-04, fixed)

Recorded in the order they were taken; each epic cites the ones it implements.

1. **Corp mode is a consequence of the recovery roster.** `Vault:CorpRecovery:OfficerEmails`
   configured → corp mode on for every account on that server. Not configured → nothing below applies
   and every account behaves exactly as a personal one. There is no second switch.
2. **Roles are global per user: `admin`, `member`, `dev`.** Officers are always admin and cannot be
   demoted or blocked (they come from config). Admins named at runtime can be promoted, demoted and
   blocked by any admin. **`member` is today's behaviour and the default** for every existing user
   and every new one — a server upgrade changes nobody's rights on its own.
3. **A dev has a share default, `project` or `none`,** and each project assignment may override it
   (`inherit` / `allow` / `deny`). "Dev without sharing" still sees his Team, because he must see who
   shared with him; he cannot send.
4. **A dev cannot export, back up to disk, clone or move into a personal account.** MCP, the CLI and
   terminal environment variables stay: those are *use*, not export, and a dev may use everything he
   can see. Copy-to-clipboard stays, or the product is unusable. This is stated as **protection against
   a mistake, not against an insider** — see *Boundaries* below.
5. **Blocking** (`active = false`) refuses every authenticated request from that email, keeps the
   vault blob (officers can break-glass it), withdraws every pending share to and from that person
   immediately with a message the sender sees, and is reversible.
6. **The login key S**, dev roles only: a server-held random secret, issued only to an active dev,
   folded into the PIN and security-key wraps so the vault file is dead without it even to someone
   holding the PIN. Stored under `DataDir` sealed with a key from the deployment's `.env`, so a
   move or a restore of the server carries it. Rotated on unblock. The **recovery-code wrap is
   stripped** for devs and its three commands refused — a printed code opens the master key with no
   PIN and no S, so leaving it would be leaving the same door open under another name; a code
   printed earlier still opens copies written earlier, which only a break-glass re-key ends. The
   org-escrow wrap stays, because it is how the company gets in at all.
7. **Offline lease**: a server setting admins edit, default 24 hours, `0` = strictly online. The
   honest client keeps a corp dev account open while its last successful policy check is younger
   than the lease, then locks it until a login succeeds.
8. **Projects** are created by admins. Assigning a person creates, in *that* person's vault at their
   next sync, a project folder at the account root that carries the project id and follows the
   project's name; a dev cannot rename, move or delete it (subfolders inside are fine); members and
   admins get the folder too and keep full freedom. Unassigning asks the admin whether to delete the
   folder; "yes" deletes it permanently on all of that person's devices at next sync. A person who
   never syncs again keeps nothing that matters, because they are blocked.
9. **The share rule is folder-based.** An entity's project is the project folder above it. A dev
   may share iff the entity is under a project folder, the dev's effective permission in that project
   allows it, and the recipient is an active member of that project. Entities outside project folders
   cannot be shared by a dev. A dev cannot move an entity out of a project folder except to Trash.
   Replying to a sender who is not in the project is not allowed. Members and admins share as today.
10. **Team for a dev** = members of his projects ∪ everyone who has shared with him. Members and
    admins see the whole domain. The tree filter also matches Team rows.
11. **One event log**, append-only, kept forever, metadata only: shares with their outcome, roles,
    projects, assignments, blocks, login-key issuance and rotation, backups, settings. Admins see
    everything — in the tree under a person and in an editor tab with filters, search and
    pagination. Members and devs see their own rows.
12. **Minimum client version for everyone on a corp server**: contract 3, refused with `426`.
    On the day the server upgrades, the whole company updates the extension. Deliberate.
13. **Server backup**, admin-only: one encrypted archive of everything the server holds, downloadable
    through the extension, or pushed by the server to S3 / Azure Blob (phase 1) and OneDrive /
    Google Drive (phase 2, a tail). The archive key is generated once, shown once, kept by the admin
    in their own vault, never inside the archive. Daily at an hour UTC, retention in days (default
    10). Not configured → daily notice to every admin; failed → hourly until a run succeeds.
14. **Everything is managed in the tree** with QuickPicks, as the org-recovery panel is — except the
    log viewer, which is an editor tab.
15. **Personal accounts are untouched.** Policy is fetched per account from *its* server; an account
    syncing to a folder or a git remote has no server, hence no policy, hence no change.

## Invariants — what stays true, and the one rule that changes

**Kept, unchanged:**

- The server stores metadata and opaque ciphertext. No epic adds a field the server has to read
  out of a payload (`CLAUDE.md` rule 1, second sentence). The event log records entity *names* and
  *kinds*, which `ShareItem` already carries in plaintext (`module_server.md` §`POST /api/shares`),
  and never content.
- Sender identity is stamped from the token, never accepted (`CLAUDE.md` rule 2). Every new
  endpoint derives *who* from the token and *what* from the path; a URL naming another user exists
  only behind `RequireAdmin`.
- A refusal the server structurally cannot verify is a courtesy, not a boundary, and is labelled so
  in code and docs (`PLAN_org_recovery.md`, "threshold is a courtesy").
- A misconfigured optional feature degrades to *off* with an `Error` log; it does not stop vault
  sync for everybody (`module_server.md` §A bad roster does not stop the server).
- Enrolment transparency: a person whose account is governed by a policy can see the policy, who
  set it, and what it forbids — the org-recovery precedent (`module_server.md`
  §`/api/org-recovery/config` — and why it is not officer-only).
- A wrap this build cannot use is a wrap it must carry (`module_extension.md` §Cryptography); new
  wrap kinds are strings, routed through `isKnownWrapKind`.
- The testable half of the extension imports no `vscode` (`CLAUDE.md` rule 3). Every decision in
  these epics — share rule, lease arithmetic, folder actions, notification cadence, wrap selection —
  is a pure function with a `node:test` suite; the `vscode` layer only applies it.

**Changed, deliberately, and recorded here so nobody later reads it as an accident:**

> **`architecture.md:51` says "The server never holds a key that opens a vault." After epic 2 it
> reads: "The server never holds enough to open a vault alone."**

The login key S is one factor of a two-factor wrap. S plus the vault blob does not open anything
without the PIN or the security key; what the server operator *can* do with S and a blob — try PINs
offline — is exactly what they can do today against the plain `pin` wrap, so the operator's position
does not change. What changes is the position of a person holding a copy of the file without the
server's cooperation: nothing, ever. The README's comparison table and `architecture.md` §The trust
boundary get the new sentence in epic 2, not before.

## Boundaries — said once, so no epic has to pretend otherwise

The extension is the only component that ever sees plaintext, and on the local machine the
plaintext lives in the OS keychain and the sealed metadata tree (`module_extension.md` §Data model).
A server-side rule therefore has two enforcement grades, and every epic names which one it is:

| Grade | Where it holds | Examples |
|---|---|---|
| **Server-enforced** | any client, modified or not | blocking; the share rule at `POST /api/shares`; Team filtering; the login key; the contract minimum; the event log |
| **Honest-client** | the shipped extension only | the export/backup/clone bans; the recovery-code strip; project-folder locks; the offline lease; purging local secrets on a `403 deactivated` |

An honest-client rule protects a company from an ordinary user's mistake — the wrong menu item, a
backup on a laptop that gets lost — and from nothing else. Someone who reads their own keychain, or
builds their own client, has already taken what they could see. The owner accepted this on
2026-09-04. It is written here so that a future reviewer does not "fix" a client-side check by
moving it to the server, where the data it needs does not exist.

## Shared shapes — the contracts every epic implements against

Defined once. An epic that needs to widen one edits it *here* and says so in its deviations.

```jsonc
// org/members/<sha256(email)[..32]>.json — epic 1 owns it, 2 and 3 add fields
{
  "email": "dev@example.com",
  "role": "member",                 // "admin" | "member" | "dev"
  "active": true,                   // epic 2
  "shareDefault": "project",        // devs only: "project" | "none"
  "projects": [                     // epic 3
    { "projectId": "…", "share": "inherit" }   // "inherit" | "allow" | "deny"
  ],
  "pendingFolderRemovals": [        // epic 3: instructions the client acknowledges
    { "projectId": "…", "deleteFolder": true, "at": 1725400000000 }
  ],
  "loginKeyVersion": 3,             // epic 2: bumps on every rotation; S itself lives elsewhere
  "updatedAt": 1725400000000, "updatedBy": "admin@example.com"
}

// org/settings.json — epic 1 owns it, 5 adds the backup block
{ "offlineLeaseHours": 24, "updatedAt": 0, "updatedBy": "" }

// GET /api/org/me — the one document every client reads on every sync cycle
{
  "corpMode": true,
  "email": "dev@example.com", "role": "dev", "active": true,
  "isOfficer": false,
  "shareDefault": "project",
  "projects": [ { "projectId": "…", "name": "A1", "share": "allow" } ],  // name arrives in epic 3
  "pendingFolderRemovals": [ … ],
  "policy": { "export": false, "share": "project", "moveOutOfProject": false },
  "offlineLeaseHours": 24,
  "loginKeyVersion": 3,
  "serverContract": 3
}
```

- **Corp mode** is one predicate on the server, `orgRecovery.Enabled` after `OrgRecoveryConfig.Read`
  (`Program.cs:51-53`) — the same value the roster guard already computes. No second flag.
- **Contract 3** (`ContractVersion.cs:40`, `contractVersion.ts:19`) is bumped once, in epic 1, and
  covers everything the five epics add: the `outcome` query on inbox deletes, `projectId` on a share,
  the new `/api/org/*` surface. In corp mode `Vault:MinimumClientContract` is forced to 3 unless the
  operator sets it higher.
- **Refusals** on the new surface use the JSON `ErrorDto` the exception handler already emits
  (`Program.cs:384-393`), not the plain-text `Fail`, because the admin UI has to show *why*. The
  old endpoints keep their shapes.
- **Every new DTO is registered in `AppJsonContext.cs`** — AOT has no reflection serializer, and a
  missing registration fails at runtime, not at build.
- **Endpoints are registered from per-epic files**, never appended to `Program.cs`. That file is
  1,381 lines today and these five epics add about twenty routes between them, against the
  coding-style ceiling of 800. Each epic ships a `Map*Endpoints` extension method
  (`OrgEndpoints.cs`, `OrgProjectsEndpoints.cs`, `OrgEventsEndpoints.cs`, `OrgBackupEndpoints.cs`)
  called from one line in `Program.cs`, mirroring the `Org*.cs` / `Org*Store.cs` split that already
  exists for logic and storage. The authorization gates stay in `Program.cs` beside
  `RequireOfficer`, so one file still answers "who may do this".
- **One `corpApiClient` in the extension**, extracted in epic 1 out of `orgRecoveryClient.ts` and
  used by every corporate client after it. Three of these epics add a client; extracting afterwards
  would mean four copies of one request helper.
- **Event kinds** are one enum, owned by epic 4 but *emitted* from epics 1–5; each epic lists the
  kinds it raises, and epic 4 lists the union.

## Growth surfaces and their budgets

Named here because every epic adds one, and a budget assumed by a sibling and stated by none is the
anti-pattern `planning-docs.md` records. Volumes: a company of 200 people, 10 projects, 100 shares a
day. Each epic repeats its own line with the sweep that owns it.

| Surface | Projected size | Who retires it | If interrupted |
|---|---|---|---|
| `org/members/*.json` | 200 × ~1 KB = 200 KB | never — a person leaves by being blocked; a record is deleted only with their vault (`DELETE /api/vault` removes it too) | atomic write, nothing partial to sweep |
| `org/login-keys/*.sealed` | 200 × ~300 B | replaced on rotation; deleted with the vault | atomic write |
| `org/projects/*.json` | 10 × ~500 B | archived, never deleted (the log cites them) | atomic write |
| `pendingFolderRemovals` per member | ≤ 1 per project ever assigned | removed on the client's acknowledgement, or when the member is deleted | a lost ack re-sends the instruction; the client's delete is idempotent |
| `org/events/<yyyy-MM-dd>.ndjson` | ~120 rows/day × ~400 B ≈ 50 KB/day, **~18 MB/year, kept forever** on the same disk as the vaults | nobody, by decision 11; `ShareMaintenance` and `OrgRecoveryMaintenance` must not touch it, pinned by a test | append is a single `write` under a lock; a torn last line is skipped by the reader and logged once |
| backup archives, cloud | archive ≈ DataDir (200 × 2 MB vaults + log) ≈ 400 MB × retention 10 = **4 GB per target** | the server's own retention pass after every successful run | a run older than 6 h is stale and reset at startup |
| backup archives, downloaded | not ours — the admin's disk | the admin | — |

## Build order across epics

Server first inside every epic, extension second (`CLAUDE.md`: the two halves ship on their own
clocks, and a server that is ahead serves an old client by design). Across epics:

1. **Epic 1 — registry, roles, settings, contract 3.** Everything else reads the registry.
2. **Epic 2 — blocking and the login key.** Needs `active` and `RequireAdmin`; changes the
   trust-boundary sentence.
3. **Epic 3 — projects and the share rule.** Needs roles and `active`; widens `ShareRequest`.
4. **Epic 4 — the event log.** Its *store* ships inside epic 1 (so epics 1–3 emit into it from day
   one); its *query endpoint, viewer and outcome reporting* are this epic.
5. **Epic 5 — the server backup.** Last, because the archive must include everything above.

Each epic is its own branch, its own `review_plan` → `proceed` → implement → `review_code` loop
through the `coai` gate, and its own release tag pair. The umbrella is promoted when the fifth epic
is.

## Preconditions

1. **The org-recovery rehearsal** in [PLAN_org_recovery_tail.md](PLAN_org_recovery_tail.md) item 1
   runs *before the first dev receives a login key*. After epic 2, break-glass is the only road into
   a blocked dev's vault and into every dev vault if `.env` is lost; a feature that has never been
   run by three people on three machines must not become the only door.
2. The `coai` gate is open for the repository (`mcp__coai__providers` answers) — each epic's plan
   round is the first step of its build order.

## Test plan — the cross-epic part

Each epic owns its unit and in-process tests. Three things only the umbrella can ask for:

- **One end-to-end story, scripted as a manual check** (`ЗАДАЧА_проверка_корп_режима.md`, written
  with epic 5): an admin creates a project, assigns a dev, the dev's folder appears, the dev shares
  inside it and is refused outside it, the admin sees the row, blocks the dev, the dev's second
  machine locks, the sender sees the withdrawal, the backup runs, the archive restores on a fresh
  stack. Not automated; the parts a test cannot reach.
- **A personal account in the same window is byte-for-byte unaffected**: an itest (the extension's
  `scripts/*-itest.cjs` pattern) with one folder-synced account and one corp account asserts the
  folder account's tree, wraps, menus and settings are identical before and after policy arrives.
- **The contract minimum is one line**: a client at contract 2 against a corp-mode server gets
  `426` on `GET /api/vault`, and the same client against a non-corp server is served.

## Definition of Done (umbrella)

- [ ] All five epics promoted to `research/` with their deviations recorded.
- [ ] `architecture.md` §The trust boundary and the README's comparison table carry the reworded
      rule, and `CLAUDE.md` rule 1 cites epic 2 for why.
- [ ] `module_server.md` documents the `/api/org/*` surface, the storage layout under `org/`, the
      corp-mode contract minimum, and the growth table above as it shipped.
- [ ] `module_extension.md` documents the policy fetch, the per-account contextValues, the
      server-bound wraps, project folders and the log viewer.
- [ ] The rehearsal precondition is recorded as run, with its findings, in the tail plan.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` is clean.
