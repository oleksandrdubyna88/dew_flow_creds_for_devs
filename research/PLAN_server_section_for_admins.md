# PLAN — a "Server" section on an administrator's account row

> Status: **IMPLEMENTED, 2026-09-12.** Three commits: the server half, the tree refactor that paid
> for the new arm under the 800-line ceiling, and the client half. Both gate rounds run (plan:
> good_enough, 3 of 3 reviewers — code: proceed after a revise round, 12 of 12 reviewers).
>
> **Deviations.** The extraction took `compareVersions` with it, into `credsInstall.ts` beside
> `versionFromTag` — the plan named only the release lookup. And both caches hold an ENVELOPE rather
> than a value: `ServerRead` was in the plan, `BackupRead` was not, and the code round below is why
> it exists.
>
> **What the code round changed, and it is the part worth reading.** Four findings were real and
> none of them was in the feature as designed. The GitHub walk stopped at the first PAGE holding a
> match, and the list is newest-first by PUBLICATION rather than by version — so a backport
> published after a higher version hid it, and the Version row would have called a deployment
> current while an upgrade was published. A failed check stamped nothing, so the next readiness
> tick walked every page again — and there is a tick on activation, on unlock and on lock, which is
> an anonymous quota of sixty an hour spent in a minute. No request carried a deadline, so a proxy
> that accepts a connection and never answers would have stopped the repaint rather than one row.
> And the Backup row drew the last good status as the CURRENT one, because only successes reached
> its cache: a green check and yesterday’s timestamp against a server that could not be reached.
> That last one is the same defect shape the metrics side had already solved with an envelope, and
> the backup cache now carries the same one.
>
> Two more came out of verifying those: a metrics read still in flight when the account is
> repointed used to write the OLD server’s facts back under the same id, and a version carrying a
> build stamp (`0.6.0+2f1c9ab`, which is what `AssemblyInformationalVersion` produces) was compared
> as though its first segment were zero.
>
> Scope: `/api/metrics` opens from officer to admin (both halves + the `.http` suite),
> `GET /api/org/backup/status` gained the CONFIGURED target kinds, and the tree grew a second
> corporate section beside Team — `serverItems.ts`, `githubReleases.ts`, four `TreeElement` arms,
> two caches, and the latest-release check extracted from `binaryInstaller.ts`.
>
> Issues: [#56 "версия сервера"](https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs/issues/56).
> The owner's decisions are already taken and are recorded verbatim in §1.2.
>
> Related docs: [module_server.md](module_server.md),
> [module_extension.md](module_extension.md),
> [architecture.md](architecture.md),
> [PLAN_corp_backup_drives.md](../todo/PLAN_corp_backup_drives.md) (why OneDrive/Google Drive are NOT kinds this
> section may show).

---

## 1. The symptom, and what an administrator cannot see today

### 1.1 Everything the tree says about a corporate server today is about PEOPLE

An account row on a corporate server expands into the Team section — `teamScope` plus one row per
colleague (`treeDataProvider.ts:442-448`, rendered by `teamItems.ts:25-40` and `:79-91`). There is no
row anywhere in the tree that says anything about the **server** itself. An administrator who wants to
know what version is deployed, whether it is behind, how much it is storing, or whether it has ever
taken a backup has exactly three ways to find out, and all three are wrong for the question:

- **Server Metrics…** — a webview tab (`serverMetricsCommand.ts:12-38`), and it is contributed on an
  **officer's** row only: `package.json:1305` reads
  `view == credSshManagerView && viewItem == account-corpOfficer`. An admin who is not on the recovery
  roster does not get the menu entry at all.
- Pressing it anyway (palette) fails on the client's own pre-emptive sentence, not the server's:
  `orgRecoveryClient.ts:168-181` turns the 403 into
  `"… is not a recovery officer on … — the metrics page is theirs."` (`:171`).
- **Server Backup** — a second webview tab (`commands/orgBackupCommands.ts:26-46`), gated at
  `package.json:1703-1706` on `account-corpAdmin || account-corpOfficer`. It shows the backup, but it
  is a tab somebody must decide to open, and it says nothing about version or footprint.

So the three facts an administrator checks most often — *what is running, is it current, is it backed
up* — each cost a deliberate navigation into a tab, and one of the three is invisible to half the
people entitled to it.

### 1.2 The gate evidence, exactly

| Fact | Where | What it says today |
|---|---|---|
| `/api/metrics` is officer-only | `src_minimalapi_server/src/Program.cs:1139-1147` | `var caller = RequireOfficer(ctx); if (caller is null) return;` |
| `RequireOfficer` | `Program.cs:1121-1133` | `!orgRecovery.Enabled \|\| !orgRecovery.IsOfficer(email)` → bare `403`, no body |
| `RequireAdminAsync` already exists | `Program.cs:1101-1119` | officer **or** `orgMembers.Find(email) is { Status: Found, Record.Role: MemberRole.Admin }`; writes a JSON reason |
| The client mirrors the officer gate | `src_vs_code/src/orgRecoveryClient.ts:168-181` | its own 403 sentence names the recovery roster |
| The menu mirrors it again | `src_vs_code/package.json:1303-1306` | `viewItem == account-corpOfficer` |
| The prose mirrors it a fourth time | `research/module_server.md:1108-1118` | *"Officer-only through `RequireOfficer` … whoever may read the server's load is whoever the operator named."* |
| Who the client already calls an admin | `src_vs_code/src/corpPolicy.ts:138-140` | `isCorpAdmin(state) => state.role === 'admin' \|\| state.isOfficer` |
| The three-way agreement is already a test | `src_vs_code/src/test/backupMenuGate.test.ts:38-56` | the backup menu's `when` tokens must equal the set `isCorpAdmin` accepts |

**The decision (owner's, already taken):** `/api/metrics` becomes `RequireAdminAsync`. This is an HTTP
contract change under CLAUDE.md repository rule 6 — a status a released client depends on is changing —
so both halves and `research/module_server.md` move in the same task.

### 1.3 The two things the current contract cannot answer

Found while verifying, and both change the design rather than the wording:

**(a) `GET /api/org/backup/status` reports the LAST RUN's destinations, not the configured ones.**
`OrgBackupEndpoints.cs:82-87` builds `Targets` from `status.Targets` — the per-destination *outcomes*
of the last run (`BackupTargetStatus`, `Models.cs:398-399`) — and `BackupStatus.NeverRun` is
`new(0, "never run", string.Empty, 0, [])` (`Models.cs:319`). A deployment with an S3 destination saved
and no run yet therefore answers `targets: []`. Item 4 of the issue ("to which target kind(s)") is
**unanswerable from today's contract** in exactly the state where it matters most: freshly configured,
never run. The configured destinations live in `BackupSettings.Targets` (`Models.cs:298-303`,
`SealedTarget` at `BackupTargets.cs:59-75`), which `StatusAsync` already reads at
`OrgBackupEndpoints.cs:68` and does not surface.

**(b) `Configured` is about the KEK, not about destinations.** `BackupStore.Configured` is
`kek.Length == Key32.Bytes` (`BackupStore.cs:109`) — "this server can seal an archive at all". A server
can be `configured: true` with zero destinations (local archive only) or `configured: false` with
destinations saved. Three states, not a boolean, and the row must not collapse them.

### 1.4 What the issue asks for, and where each fact comes from

| # | Row | Source | Verified at |
|---|---|---|---|
| 1 | Deployed version | `MetricsDto.Version` | `ServerMetrics.cs:9`; stamped `Program.cs:384-387` from `AssemblyInformationalVersionAttribute`, which the release sets via `-p:Version` (`.github/workflows/release.yml:159`). `/api/health` carries no version (`Program.cs:780`) |
| 2 | Latest `server-v*` release, + an "update available" icon | `api.github.com/repos/oleksandrdubyna88/dew_flow_creds_for_devs/releases` | the tag DOES publish a GitHub Release: `release.yml:203-224`, `gh release create "$GITHUB_REF_NAME"` (`:220`) |
| 3 | Total size of all vault files | `MetricsDto.VaultBytesOnDisk` (and `Vaults` for the count) | `ServerMetrics.cs:21-22`, from `store.VaultFootprint()` at `:67, 83-84` |
| 4 | Backup configured, and to which kinds | `BackupStatusDto.Configured` + a NEW `ConfiguredTargetKinds` | `Models.cs:332-343`; kinds are exactly `s3` and `azure-blob` (`BackupTargets.cs:20-28`) |
| 5 | When the last backup ran | `BackupStatusDto.LastRunAt` (unix ms, `0` = never) | `Models.cs:337`, the `0`-means-never rule stated at `Models.cs:311-313` |
| 6 | Right-click → Configure backup… | the EXISTING `credSshManager.orgBackup` | `commands/orgBackupCommands.ts:26-46`; menu `package.json:1703-1706` |

**Not shown, deliberately:** OneDrive and Google Drive. They are an unbuilt plan
([`todo/PLAN_corp_backup_drives.md`](../todo/PLAN_corp_backup_drives.md), status *"plan only, nothing
implemented yet"*), and `TargetKinds.Known` accepts only the two (`BackupTargets.cs:27-28`). NAS is the
LOCAL snapshot destination, not a server target — `orgBackupCommands.ts:39-42` already draws that line
in words. The section shows the kinds the server really has and says *not configured* otherwise.

---

## 2. Design

### 2.1 Server: `/api/metrics` opens to administrators

One line of behaviour, three lines of code.

```
Program.cs:1139-1147  →  var caller = await RequireAdminAsync(ctx);  if (caller is null) return;
```

`RequireAdminAsync` (`Program.cs:1101-1119`) is already the gate every `/api/org/backup/*` route uses
(`OrgBackupEndpoints.cs`, `Admin(ctx, deps)`), it writes a JSON reason rather than a bare 403, and its
refusal sentence is *"This deployment does not let you administer its people."* — which is the right
sentence here too, because it is the same fact being refused.

**The one non-obvious consequence, and it is load-bearing for the tests:** `RequireAdminAsync` opens
with `orgRecovery.Enabled && (…)` (`Program.cs:1107-1109`). A server with **no recovery roster** has no
officers *and* no admins as far as this gate is concerned, so it still answers 403 to everybody. That
is what keeps `WithoutARoster_ThereAreNoOfficers_AndTheEndpointIs403ForEveryone`
(`tests/OpsTests.cs:195-202`) green **without editing its assertions** — but its NAME now claims
something narrower than what it proves, so it is renamed in this task
(`WithoutACorpRoster_TheEndpointIs403ForEveryone_AdminsIncluded`) and gains a case for an admin.

The comment block at `Program.cs:1135-1138` ("The officers' metrics page … Officer-only for the same
reason the ceremony is") is rewritten: the reason has changed, and a comment that argues for the old
gate beside the new one is worse than no comment.

### 2.2 Server: the backup status names its CONFIGURED destinations

Additive, and additive is safe here (CLAUDE.md rule 6's own carve-out — an old client is served
normally because it names no contract version).

```
Models.cs:332-343   BackupStatusDto  += IReadOnlyList<string> ConfiguredTargetKinds
OrgBackupEndpoints.cs:68-89  StatusAsync fills it from the settings it ALREADY reads:
    settings.Targets.Select(t => t.Kind).Distinct(StringComparer.Ordinal).Order().ToList()
```

Distinct and ordered, because the row renders *"s3, azure-blob"* and two S3 buckets are one kind. It is
a list of kinds and never a list of destinations: a bucket name and a prefix are operational detail
that belongs on the backup tab, and `SealedTarget.Describe` (`BackupTargets.cs:71-74`) already exists
for that page. **Nothing sealed ever travels** — `SealedTarget`'s `Iv`/`Tag`/`Data`
(`BackupTargets.cs:65-67`) are not read here, which the existing contract test
`org_backup_status_never_carries_a_credential` (`http/org/backup.http:204`) continues to pin.

Why not reuse `Targets[].kind`: §1.3(a). Why not a second route: one document, one read, and
`StatusAsync` already holds `settings`.

### 2.3 Client: the widened access, in the three places that mirror the gate

| File | Line | Change |
|---|---|---|
| `src_vs_code/src/orgRecoveryClient.ts` | `171` | the 403 sentence stops naming the recovery roster: `"… may not read this server's metrics — an administrator or a recovery officer may."` |
| `src_vs_code/package.json` | `1305` | `viewItem == account-corpOfficer` → `(viewItem == account-corpAdmin \|\| viewItem == account-corpOfficer)` — byte-identical in shape to the `orgBackup` clause at `:1705`, so one regex reads both |
| `src_vs_code/src/test/backupMenuGate.test.ts` | `38-56` | the existing test is generalised over BOTH commands rather than copied — see §4.2 |

`accountContextValue` (`orgRecoveryAccess.ts:88-100`) already produces `account-corpAdmin` for a
registry admin and `account-corpOfficer` for an officer, and `isCorpAdmin` (`corpPolicy.ts:138-140`)
accepts exactly those two. No new context value is invented.

### 2.4 The Server section

#### The rows

```
▸ account  alice@example.com
  ▸ Server                      2 rows in one line: "v0.6.0" / an update icon
      Version        0.6.0          ↑ 0.7.0 available        (icon only, no action)
      Vaults         41 · 1.2 GiB
      Backup         s3, azure-blob · 2026-09-11 03:04       (right-click → Configure backup…)
  ▸ Team  4
    …
```

Four `TreeElement` arms, added to the union at `types.ts:506-510`, immediately after `teamScope` so the
two corporate sections read together:

```ts
| { kind: 'serverScope';   account: StoredAccount }
| { kind: 'serverVersion'; account: StoredAccount }
| { kind: 'serverVaults';  account: StoredAccount }
| { kind: 'serverBackup';  account: StoredAccount }
```

Each carries the whole `StoredAccount` rather than an id, for the reason `teamScope` does
(`types.ts:506`): `accountPick.ts:23-28` resolves a command target straight off the element.

#### `serverItems.ts` — new, pure, mirroring `teamItems.ts`

One exported function per row, each taking everything it decides as an argument and returning a
`vscode.TreeItem` — the shape `teamItems.ts:17-40` established and stated in its own header comment
(`teamItems.ts:7-12`): *"Everything a row decides is taken as an argument, so the row can be built in a
test without the provider."* It imports `vscode` only for `TreeItem`/`ThemeIcon`/`ThemeColor`, exactly
as `teamItems.ts:1` does, and is tested through `loadWithVscode` (`test/vscodeStub.ts`, the pattern
`test/depTreeItems.test.ts:38-40` uses).

```ts
export interface ServerScopeRowInput  { account; collapsibleState; version: string; failure?: ServerFailure }
export interface ServerVersionRowInput{ account; deployed: string; latest: string }   // '' = unknown
export interface ServerVaultsRowInput { account; vaults: number; bytes: number }
export interface ServerBackupRowInput { account; status: BackupStatus | undefined; locale: () => string }
```

- `serverScopeItem` — label `Server`, `id = serverScope:${accountId}`, `contextValue = 'serverScope'`,
  icon `server` in a new `credSshManager.serverIcon` theme colour (the Team rows have their own,
  `TEAM_COLOR` at `teamItems.ts:15`; a section that borrowed the people colour would read as people).
  When the metrics read failed, it degrades exactly the way `teamScopeItem` does
  (`teamItems.ts:31-38`): a `warning` icon and `unreachable` / `refused (403)` in the description,
  never an empty section that looks like a healthy one.
- `serverVersionItem` — label `Version`, description `deployed`; when `latest` is newer, the icon
  becomes `arrow-circle-up` and the description becomes `0.6.0 → 0.7.0 available`. **Icon only, no
  command, no `contextValue`** — the issue says so, and the upgrade is a `workflow_dispatch` on a host
  this extension cannot reach (CLAUDE.md *Releasing and deploying*).
- `serverVaultsItem` — label `Vaults`, description `${vaults} · ${formatBytes(bytes)}` reusing
  `formatBytes` from `serverMetricsPage.ts:47-54`. Not a second byte formatter: that function already
  answers `unknown` for a negative, which is how `DataDirFreeBytes` spells "could not tell".
- `serverBackupItem` — label `Backup`, `contextValue = 'serverBackup'`, description per §2.6.

`treeDataProvider.ts` gets one arm that delegates; see §2.4.4 for why that is not free.

#### 2.4.1 Caches, and their budget

Two maps on the provider, beside `orgPolicy` / `orgRoster` / `orgProjects`
(`treeDataProvider.ts:102-113`) and with the same contract, stated there in prose and repeated here
because it is the part that keeps the tree honest: **absent means "not asked yet", and a FAILED read
keeps the previous entry** (`corpPolicy.ts:143-152`, *"not knowing changes nothing"*).

```ts
readonly serverMetrics = new Map<string, ServerRead>();         // keyed by accountId
readonly serverBackup  = new Map<string, BackupStatus>();       // keyed by accountId

/** The last answer AND the current standing of the read — so a failure is a fact the row can show. */
interface ServerRead {
  readonly value?: ServerMetrics;          // the last successful document, kept through failures
  readonly failure?: 'unreachable' | 'refused' | 'older';   // the CURRENT read's outcome, absent when it succeeded
  readonly at: number;                     // when the current outcome was recorded (unix ms, UTC)
}
```

**Why an envelope and not a bare value** (plan round, gemini and codex independently): "a failed read
keeps the previous entry" and "the scope row shows `unreachable` / `refused (403)`" cannot both be true
of a `Map<string, ServerMetrics>` — the first `403` has no previous value to keep and no place to record
itself, and after one success a later failure would leave the row looking healthy for ever. The
envelope keeps the last value (so the version and footprint stay readable, dimmed by the description)
AND records the current failure (so the scope row degrades as §2.7 promises). The row builders read
both; the test drives the transitions first-403 → success → unreachable → success.

Both maps are dropped by the same `forgetAnswersFromAnotherServer` path that drops the policy caches
(`orgPolicyRefresh.ts:87-97`) — an account repointed at another server keeps its id, and a version drawn
from the server it has left is a stale fact rendered as a current one. **And on a role change** (plan
round, local): when a cycle's `next.isAdmin` is false for an account that has entries, both entries are
deleted in the same step — a demoted administrator's tree loses the section AND its cached facts at
once, and a promoted developer gets a fresh read on the cycle that promoted them.

**Growth budget** (planning-docs.md, *a plan that creates something that GROWS names its budget*):

| Surface | Size at this plan's volumes | Who retires it |
|---|---|---|
| `serverMetrics` | one `MetricsDto` (18 scalars, < 400 B) per signed-in account. Corporate accounts on one machine are single digits; 10 accounts ≈ 4 KB, in memory only | dropped on account removal and on a repoint, with the policy caches; dies with the extension host |
| `serverBackup` | one `BackupStatus` per account; `targets[]` is bounded by the destinations an admin saved (0–2 kinds today). ≈ 1 KB × 10 | as above |
| the GitHub answer | ONE `{ version, at }` per extension-host session, in memory, not `globalState` | a 6-hour TTL (§2.5); no persistence, so nothing survives to accumulate |

Nothing is written to disk, nothing is appended, and no new file or table is created. The section adds
no growth surface that outlives a window.

#### 2.4.2 Refresh timing — ride the loop that already runs

The backup half needs **no new fetch at all**. `backupWatch.ts:105-114` (`statusOf`) already calls
`client.readStatus(account)` for every account whose `policy.isAdmin` is true, once per readiness cycle,
and `checkOneBackup` (`:74-95`) **throws the status away**, keeping only a `BackupCheck`
(`:35-40`). The reuse-first move is #1, *widen the existing thing*:

```ts
export interface BackupCheck {
  readonly healthy: boolean;
  readonly notice?: BackupNotice;
  /** The status this check read, for the caller that draws it. Absent = the read said nothing. */
  readonly status?: BackupStatus;
}
```

`checkBackups` (`:123-144`) already has the account beside its check in `entries`/`checked`
(`:132-136`), so recording is one `host.record?.(accountId, status)` seam on `BackupWatchHost`
(`:51-60`), filled in `vscodeBackupWatch` (`corpPolicyWiring.ts:56-67`) with
`(id, s) => provider.serverBackup.set(id, s)`. **No second poll, no second timer** — the module's own
header argues against exactly that (`backupWatch.ts:21-24`).

The metrics half needs a fetch, and it goes in the same place: an `afterRead`-style step in the
readiness cycle, gated on `next.isAdmin`, mirroring `refreshRoster(host, client, account, next.isAdmin)`
at `orgPolicyRefresh.ts:115`. It is a **new pure function in `orgPolicyRefresh.ts`**
(`refreshServerMetrics`) taking the client structurally, so the rule it enforces stays a unit test:
never throws, a failure keeps the previous answer.

**Cadence.** `refreshReadiness` (`extension.ts:453-478`) runs on activation (`:485`), after every
unlock/lock (`:379`) and after the commands that call it (`:934`, `:987`). It is not a timer — there is
no periodic readiness tick — so the cost is bounded by what a person does. One extra `GET /api/metrics`
per corporate admin account per cycle, against a server that endpoint was built for
(`module_server.md:1108-1118`: *"Read by a human through the extension; not a scrape target"*), which
stays true: a cycle is a human action.

#### 2.4.3 Expansion key, and `getParent`

`treeExpansion.ts:62-73` (`sharingKey`) gains the `serverScope` arm — `serverScope:${accountId}`,
byte-identical in shape to `teamScope:${accountId}` at `:64-65`. The three child rows are **leaves** and
answer `undefined`, which `treeExpansion.ts:41-44` documents as the rule (*"a caller cannot accidentally
remember a row that has no twisty"*) and `test/treeExpansion.test.ts:111-134` already pins for every
other kind. Default state: **collapsed** — `this.collapsible(element, false)`
(`treeDataProvider.ts:686-693`), matching Team at `:465`.

`treeParent.ts:23-30` (`parentOf`): today every unhandled kind falls to `ownerEntityOf`
(`:46-51`), which answers `undefined` — so `teamScope` has no parent either and `TreeView.reveal`
cannot walk to it. The four new kinds get a real answer, because the backup row is the first row in
this tree that a *notification* could plausibly reveal:

```ts
serverScope        → { kind: 'account', account }
serverVersion / serverVaults / serverBackup → { kind: 'serverScope', account }
```

The element carries the account, so this needs no `ParentSource` lookup.

#### 2.4.4 The provider's arm — and the 800-line wall

**`src_vs_code/src/treeDataProvider.ts` is exactly 800 lines**, and `eslint.config.mjs:28` sets
`'max-lines': ['error', { max: 800, skipBlankLines: false, skipComments: false }]` with
`reportUnusedDisableDirectives: 'error'` (`:19`). The file carries `complexity` and
`max-lines-per-function` disables (`:329, :454, :708, :734`) and **no `max-lines` disable**. So *one
added line fails CI*, and the disable cannot simply be added — the config's own header calls a disable
"an exemption nobody granted" and the ratchet doctrine
(`research/module_extension.md:3892`) is that an exempted file may shrink, never grow.

`extension.ts` is worse: 1052 lines, on the size ratchet (`.size-baseline.json`), and its own header
disable (`extension.ts:1`) exempts it. `corpPolicyWiring.ts:15-19` already records the rule in prose —
*"that file is at its size ratchet and may only shrink — a feature paid for by taking something else out
of it is a feature that made an unrelated one harder to find."*

**So step 0 of the build order is to make room, and it is the same move `teamItems.ts` was created by**
(`teamItems.ts:7-12`): lift the `teamScope` and `teamMember` arms of `getTreeItem`
(`treeDataProvider.ts:462-479`, 18 lines) into a `teamRowFor(element, ctx)` dispatcher inside
`teamItems.ts`, where the two row builders already live. The provider's arm becomes two lines; the new
Server arm becomes two more calling `serverRowFor(element, ctx)` in `serverItems.ts`. Net effect on
`treeDataProvider.ts`: ≈ −14 lines before the Server section is added, ≈ −10 after. Measured with
`npx eslint src --max-warnings 0` and `npm run ratchet`, both of which must be green before any Server
row is written — a refactor whose payoff is a line count is a refactor that has to be counted.

The children injection at `treeDataProvider.ts:442-448` gains the Server section **above** Team, which is
one condition rather than two nested ones:

```ts
if (element.kind === 'account') {
  return [...corpSections(element.account, this), ...children];
}
```

`corpSections` is a pure function in `serverItems.ts` taking `{ policy, teamCount }`; it returns
`[serverScope?, teamScope?]` in that order. Server first because it is one row and Team is a list, and a
single row above a list is a header; below it, it reads as the list's last member.

**The children of `serverScope` are an explicit branch** (plan round, codex — the first draft injected
the scope and forgot what expands under it): `getChildren({ kind: 'serverScope', account })` returns
`[serverVersion, serverVaults, serverBackup]` for that account, always all three — a row whose cache is
empty renders its `checking…` state rather than disappearing (§2.6, §2.7), so the section's shape is
constant and a person learns where to look. A provider-level test expands the section for an
administrator through the stub and asserts the three kinds in order; a developer's account yields no
`serverScope` at all.

**The Server section appears only for `isCorpAdmin(policy)`** (`corpPolicy.ts:138-140`) — the same
predicate `backupWatch.ts:110` polls on and `backupMenuGate.test.ts:50` pins. A developer's row is
byte-identical to what it is today.

### 2.5 The GitHub latest-release check

#### The extraction

`latestVersion` (`binaryInstaller.ts:65-81`) is **private**, lives in a module that imports `vscode`
(`:1`), and is therefore untestable and unreusable as it stands. `newestOf` (`:90-100`) is already pure
but equally private. Reuse-first move **#2, extract the shared half**:

- **New `src_vs_code/src/githubReleases.ts`**, `vscode`-free (CLAUDE.md repository rule 3 — *"keep new
  pure logic on that side of the line"*), exporting:
  ```ts
  export interface ReleaseFetch { (url: string, init: RequestInit): Promise<Response>; }
  export function newestOf(tagPrefix: string, releases: readonly { tag_name?: unknown }[]): string | undefined;
  export async function latestRelease(tagPrefix: string, fetcher?: ReleaseFetch): Promise<string | undefined>;
  ```
  `fetcher` defaults to the global `fetch`, which is how `corpApiClient.ts:56` already reaches the
  network in a `vscode`-free module — and what lets a test drive it with a fake.
- **`versionFromTag` widens rather than forks** (reuse move #1). `credsInstall.ts:133-137` takes a
  `CredsProduct` but reads only `tagPrefix` (`:134-135`). Change the parameter to
  `{ readonly tagPrefix: string }`; every existing call site compiles unchanged, because `CredsProduct`
  (`:54-61`) satisfies it structurally. No fake `CredsProduct` is invented for a server that installs
  nothing.
- `binaryInstaller.ts` deletes both private functions and calls
  `latestRelease(product.tagPrefix)`. Its behaviour is unchanged, and `test/credsInstall.test.ts` plus
  `test/installCommand.test.ts` are the characterization tests for the move — the same argument
  `corpApiClient.ts:10-15` makes about its own extraction.

#### `per_page` — measured, and changed

`binaryInstaller.ts:68` asks for `?per_page=30`. Four tag lines publish into one release list
(CLAUDE.md *Releasing and deploying*), and the extension ships far more often than the server: **72
`extension-v*` tags against 13 `server-v*`**. Measured on this checkout with
`git for-each-ref --sort=-creatordate`: `server-v0.6.0` is the **4th** newest tag, and the gap before it
(`server-v0.5.3` → `server-v0.6.0`) was **11 releases**. So 30 works today with real headroom — and a
single quiet quarter on the server with a normal extension cadence closes it silently, producing "up to
date" for a server that is a year behind. **Use `per_page=100` AND page** (plan round, gemini: a hundred
mixed releases can still hold zero `server-v*` ones once the server has been quiet long enough):
`latestRelease(tagPrefix)` walks `?per_page=100&page=N` until a release with the prefix is found or the
page comes back short (the last page), capped at **5 pages** — 500 releases is more than every tag line
here has published together (97 tags today). Found → its version; pages exhausted → `undefined`, which
renders as "no icon", the same as offline. The cap is a constant with the reason beside it, and the
fake-fetcher test drives both the first-page hit and the found-on-page-three case.

#### When it runs, and what it costs

- **Only for administrators**, and only inside `refreshServerMetrics`, which is itself gated on
  `next.isAdmin`. A developer's window never makes this request.
- **Only when the Server section has been drawn at least once** — the check is called from the metrics
  refresh, which is called from the readiness cycle, which only runs the Server path for a corporate
  admin. It is **never** called on activation for a non-corporate account.
- **Cached in memory for 6 hours** (`{ version, at }`, one entry, not per account — the repository is
  the same for everybody). A release cadence of days does not need a tighter answer, and 6 hours keeps
  an editor left open for a week from making 300 requests.
- **Best effort, and silent on failure.** `latestRelease` already swallows everything
  (`binaryInstaller.ts:76-80`, *"Offline, rate-limited, or behind a proxy that refuses. All of them
  mean the same thing to the person"*). Offline → `latest` is `''` → **no icon, no description
  suffix, no error toast, no log line.** The version row still shows what is deployed.
- **It carries no identifying data.** The request is `GET` to a public repository's public release list
  with `Accept: application/vnd.github+json` and `User-Agent: creds-for-devs`
  (`binaryInstaller.ts:69`) — no token, no email, no account id, no server location. Unauthenticated
  and therefore subject to GitHub's per-IP anonymous limit; the TTL is what keeps one machine's usage
  at ~4 requests a day.
- **This is the extension's only outbound call to a host that is not the person's own server** for a
  corporate account — it is worth saying out loud in `module_extension.md`, because the product's
  pitch is that it talks to your server and nobody else's. It is not new (`binaryInstaller.ts:67`
  already makes it for the CLI/MCP binaries); what is new is that it now fires for somebody who never
  asked to install a binary. **Open question for the owner** (§6): should this row be behind a setting
  (`credSshManager.checkServerUpdates`, default `true`)? **Assumption taken to proceed (2026-09-12):
  no setting in this change** — the call already exists for the binaries without one, it is anonymous,
  admin-only and TTL'd; the question goes to the owner in the delivery summary, and a setting is a
  one-line follow-up if they want it.

#### Comparing

`compareVersions` (`credsInstall.ts:146-158`) — numeric, segment by segment, `0.10.0 > 0.9.0`. It is
already the one function that knows that, and its own comment says why a string compare was wrong.

**Refuse to compare what cannot be compared.** `MetricsDto.Version` falls back to `"unknown"`
(`Program.cs:387`) when the assembly carries no informational version — a locally built or
`docker compose`-from-source server. `"unknown"` parses through `numericParts`
(`credsInstall.ts:160-163`) as `[0]` because a non-numeric segment counts as zero, so a naive compare
would announce that **every** dev server is out of date. The version row therefore checks
`/^\d+\.\d+/` on the deployed string before comparing at all; anything else renders the raw string with
no icon. This is a pure predicate and a unit test.

### 2.6 The backup row, and its menu

`serverBackupItem` reads its whole description from one cached `BackupStatus`, and there are four
states, not two:

| `status` | icon | description |
|---|---|---|
| absent (not asked yet, or the read failed) | `sync~spin`-less `question` | `checking…` |
| `NO_BACKUP_HERE` (`orgBackupClient.ts:83-95` — the server answered 404) | `circle-slash` | `not available on this server` |
| `configured: false`, no kinds | `warning` (problems-warning colour, as `teamItems.ts:35`) | `not configured` |
| `configured: false`, kinds saved | `warning` | `not configured · ${kinds}` — the destinations are saved and unusable until a key exists (plan round, codex: §1.3(b)'s third state must be visible, not collapsed into the second) |
| `configured: true` | `check` / `warning` on `lastResult` | `${kinds} · ${when}` |

where `kinds` is `configuredTargetKinds.join(', ')` or `local archive only` when the list is empty, and
`when` is `never` for `lastRunAt === 0` (the rule `Models.cs:311-313` states) or the instant rendered in
the person's locale.

**The row also answers a left click** (plan round, gemini): `serverBackupItem.command =
{ command: 'credSshManager.orgBackup', arguments: [element] }`, the same command the context menu
offers — a person who selects the row or presses Enter lands on the backup tab rather than on nothing.
The other two rows carry no command: the issue asks for an icon, not an action, on the version, and the
vault footprint has no page of its own.

**UTC, converted once, at the edge** ([utc-timestamps.md](../.claude/rules/shared/common/utc-timestamps.md)
rule 4). `lastRunAt` is unix **milliseconds** — a true instant, not a calendar day — so it carries no
offset and cannot shift: `new Date(ms).toLocaleString()` in the tree, and nowhere else. The pure row
builder takes the formatter as an argument so the test pins a fixed locale rather than the runner's.
The server stays UTC end to end (`BackupRun.cs:46-49` already says so for the schedule).

**Forward compatibility.** `configuredTargetKinds` is **optional on the client** (`BackupStatus` in
`orgBackupClient.ts:33-47`), and `isBackupStatus` (`:315-323`) must NOT add it to `STATUS_SHAPE`: the
guard requires every declared field to be present (`matches`, `:334-339`), so requiring it would make a
new extension reject an older server's perfectly good status document. Absent → fall back to
`[...new Set(targets.map(t => t.kind))]`, which is right for a server that has run at least once and
honestly empty for one that has not.

**The menu entry is a contribution, not a command.** No `registerCommand`, no new id, nothing for
`test/commandsRegistered.test.ts:45+` or `test/helpCoverage.test.ts` to demand an article for:

```json
{ "command": "credSshManager.orgBackup",
  "when": "view == credSshManagerView && viewItem == serverBackup",
  "group": "1_backup@1" }
```

For that to act on the right account without a QuickPick, **`accountPick.ts:23-28` must learn the new
kinds**. Today `elementAccount` answers only for `account` and `teamScope` (`:27`); a `serverBackup`
target falls through to `pickAccount` (`:15`) and asks *"Which server's backup?"* about the row that was
just right-clicked. Verified as a real defect in waiting, and it is one line:

```ts
const WITH_ACCOUNT = new Set(['account', 'teamScope', 'serverScope', 'serverVersion', 'serverVaults', 'serverBackup']);
return WITH_ACCOUNT.has(element.kind) ? (element as { account: StoredAccount }).account : undefined;
```

(Spelled as a set rather than a growing `||` chain because `complexity: 4` is an eslint error,
`eslint.config.mjs:30`.)

`orgBackupCommands.ts` changes **not at all**. Its "no server here" sentence (`:39-42`) stays reachable
via the palette; from a Server row it is unreachable by construction, because the section only exists
where a corporate server does.

### 2.7 What is shown when things are not normal

Every one of these is a row a person can see, never a silent absence — the lesson `teamItems.ts:29-30`
records (*"An empty team and a refused one used to look identical. Only one of them is somebody's
fault, and it is the one nobody could see."*).

| Situation | What the section does |
|---|---|
| **Not a corporate account** (folder, git remote, server with no roster) | the section does not exist. `isCorpAdmin` is false, and `corpServerFor` answers nothing (`transportFactory.ts:82-84`) |
| **Corporate, but the viewer is a developer** | the section does not exist. The row is byte-identical to today's |
| **Server older than this feature** — `/api/org/backup/status` 404s | `readStatus` already answers `NO_BACKUP_HERE` (`orgBackupClient.ts:124-127`, `:83-95`); the backup row reads *not available on this server*. Version and Vaults still work, because `/api/metrics` has existed since 2026-08-28 |
| **Server older than THIS release** — `/api/metrics` still `RequireOfficer` | an admin who is not an officer gets 403. The scope row degrades to `refused (403)` with a tooltip naming the cause: *"this server is older than the change that opened metrics to administrators."* This is the one asymmetry the split release creates, and CLAUDE.md's *"a new extension against an old server is told the server is older than the feature"* is exactly this sentence |
| **Corp mode on, no recovery roster** | `RequireAdminAsync` refuses (`Program.cs:1107`, §2.1). Same `refused (403)` row. Worth the tooltip naming it, because it is the surprising one |
| **Server unreachable** | `unreachable` on the scope row, both child caches keep their previous values and are drawn dimmed-by-description rather than cleared (`corpPolicy.ts:143-147`, *not knowing changes nothing*) |
| **GitHub unreachable / rate-limited** | no icon, no suffix, no toast. The deployed version still renders |
| **`Version: "unknown"`** (dev build) | rendered verbatim, never compared (§2.5) |

**Durable status** ([durable-status.md](../.claude/rules/shared/common/durable-status.md)): the section
is **read-only**. The one status-changing action reachable from it — *Configure backup…* → run a backup
— already satisfies the rule on the server side (`BackupRunResults.InProgress` written before the work,
`BackupRun.cs:9`; `Running` derived from one field, `:22-30`; the tab re-reads it). This plan adds the
missing third leg for free: the backup row is re-read every readiness cycle, so an in-flight run now
shows up in the **tree** and not only in a tab somebody has open.

---

## 3. Build order

**The server half can ship alone and should go first** (CLAUDE.md: *the two halves are independent and
either may go first*; an old extension against a new server is served normally).

### Server (one `server-v*` release)

1. **RED** — change `tests/OpsTests.cs:185-202` (§4.1) and watch the new admin case fail with the real
   symptom (`403 Forbidden` where `OK` is expected), not a setup error.
2. `Program.cs:1139-1141` → `RequireAdminAsync`; rewrite the comment at `:1135-1138`.
3. Green. Whole suite.
4. **RED** — `BackupStatusDto.ConfiguredTargetKinds` asserted absent in a new test.
5. `Models.cs:332-343` + `OrgBackupEndpoints.cs:68-89`. Green.
6. `http/metrics/metrics.http` (§4.3) and `http/org/backup.http` — `node .agents/conventions/tools/http-run.mjs`,
   report the **exit code** (0 pass · 1 contract · 3/4/5 environment — the API was NOT exercised).
7. `research/module_server.md:1108-1118` and `:1356`.

### Client (one `extension-v*` release)

8. **Make room** (§2.4.4): lift the Team arms into `teamItems.ts`. `npx eslint src` and `npm run ratchet`
   green before anything is added. No behaviour change; `test/treeProvider*.test.ts` are the
   characterization suite.
9. `githubReleases.ts` + `versionFromTag` widening + `binaryInstaller.ts` calling through (§2.5). Tests
   first: `test/serverRelease.test.ts` with a fake fetcher.
10. `types.ts:506-510` — the four arms. `treeExpansion.ts:62-73`, `treeParent.ts:23-30`,
    `accountPick.ts:23-28`. Each with its test first; all four are pure.
11. `serverItems.ts` + `test/serverItems.test.ts` (§4.2), written before the provider knows the rows
    exist — the module is pure, so it needs nothing else to be true.
12. The caches (`treeDataProvider.ts:102-113`), the `serverBackup` recording seam in `backupWatch.ts` +
    `corpPolicyWiring.ts`, `refreshServerMetrics` in `orgPolicyRefresh.ts`.
13. `treeDataProvider.ts:442-448` and the `getTreeItem` arm. `npx eslint` green.
14. `package.json:1305` (metrics gate) + the new `serverBackup` menu entry; `backupMenuGate.test.ts`
    generalised (§4.2).
15. `orgRecoveryClient.ts:171`.
16. `research/module_extension.md`, `src_vs_code/CHANGELOG.md`, version bump.

**Why the client is one release and not two:** steps 9–13 produce nothing visible on their own, and a
tree section that renders a `checking…` row for a week is worse than no section.

---

## 4. Test plan

Server: `dotnet build dew_flow_creds_for_devs.slnx -c Debug` then
`./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe` — **never `dotnet test`**
([testing.md](../.claude/rules/shared/common/testing.md); CLAUDE.md *Commands*). Extension:
`cd src_vs_code && npm test` (node:test over `out/test/*.test.js`).

### 4.1 Server — `tests/OpsTests.cs`, `MetricsEndpointTests` (`:149-203`)

| Test | Today | After | Why it is a deliberate CHANGE, not a deletion |
|---|---|---|---|
| `AnOfficerReadsTheMetrics_…` (`:163-183`) | passes | **unchanged** | an officer is still served — `RequireAdminAsync:1107-1109` accepts `IsOfficer` first |
| `AMemberIsRefused_AnAnonymousCallerToo` (`:185-193`) | member 403, anonymous 401 | **unchanged assertions**, renamed `AMemberIsStillRefused_AnAnonymousCallerToo` | this is the security-relevant half: opening to admins must not open to members. Keeping the assertions byte-identical is the point |
| `WithoutARoster_…403ForEveryone` (`:195-202`) | alice 403 | assertions unchanged, **renamed** `WithoutACorpRoster_TheEndpointIs403ForEveryone_AdminsIncluded`, **+ an admin case** | `RequireAdminAsync` is inside the `orgRecovery.Enabled` guard, so the name was about to become a lie |
| **NEW** `AnAdministratorWhoIsNotAnOfficerIsServed` | — | enrol `alice` as `admin` via the members route, then `GET /api/metrics` → `200` with `service == "cred-vault-server"` | **this is the RED test.** Against unfixed code it fails `403 != 200`, which is the real symptom |
| **NEW** `TheStatusNamesTheKindsThatAreCONFIGURED_BeforeAnyRunHasHappened` | — | `PUT settings` with one `s3` target, then `GET status` → `configuredTargetKinds == ["s3"]` **and** `targets == []` | pins §1.3(a) — that the two lists answer different questions |
| **NEW** `TheStatusNeverNamesADestinationsCredentials` | — | assert `configuredTargetKinds` is `["s3"]` and the body contains neither the access key nor the bucket | the new field is a kind list, forever |

The admin enrolment follows `RequireAdminAsync`'s own reading: `orgMembers.Find(email)` with
`Record.Role: MemberRole.Admin` (`Program.cs:1109-1110`). `MetricsEndpointTests.Server()`
(`:155-160`) already configures three officers, which is what `orgRecovery.Enabled` needs.

### 4.2 Extension

| File | What it proves |
|---|---|
| **NEW `test/serverItems.test.ts`** | Every row, through `loadWithVscode` (`test/depTreeItems.test.ts:38-40`): the scope row's id/contextValue/icon, and its `failure` states (`unreachable`, `refused (403)`, `older`) drawn from a `ServerRead` envelope that still carries the last value; the version row with `latest` newer → `arrow-circle-up`, equal → no icon, `latest === ''` → no icon; **`deployed === 'unknown'` → no icon and no comparison** (§2.5); the vaults row's `formatBytes` reuse; the backup row's FIVE states (§2.6) with a fixed formatter, including `not configured · s3`; `not configured` vs `not available on this server` distinguished; the backup row carries the `orgBackup` command; `corpSections` returning nothing for a developer |
| **NEW provider-level test** (`test/treeProvider*.test.ts`, the existing pattern) | an administrator's account expands to a `serverScope` above `teamScope`; expanding `serverScope` yields `serverVersion`, `serverVaults`, `serverBackup` in that order even with empty caches; a developer's account yields neither `serverScope` nor its children; a cycle whose `next.isAdmin` is false drops that account's two cache entries |
| **NEW `test/serverRelease.test.ts`** | `newestOf('server-v', …)` picks `0.10.0` over `0.9.0` from a list where the 0.9.0 entry is FIRST (the ordering trap `binaryInstaller.ts:86-88` documents); ignores `extension-v1.6.0`, `cli-v0.1.5`, `mcp-v0.5.1`; `latestRelease` with a fake fetcher asserts the URL carries **`per_page=100`** and no `Authorization` header, finds a release on page 3 when pages 1–2 hold only other prefixes, stops at a short page, and gives up after the 5-page cap with `undefined`; a non-200 → `undefined`; a throwing fetcher → `undefined` and **no rethrow**; the 6-hour TTL serves a second call without a second fetch |
| `test/orgPolicyRefresh.test.ts` (or the file that tests `refreshRoster`) | `refreshServerMetrics`: a first `403` records `{ failure: 'refused' }` with no value; a later success replaces it with `{ value }`; a later network failure keeps `value` and sets `failure: 'unreachable'`; a `403` after a success sets `failure: 'refused'` and keeps the value; never throws |
| `test/credsInstall.test.ts` | extended: `versionFromTag({ tagPrefix: 'server-v' }, 'server-v0.6.0') === '0.6.0'` and `versionFromTag(CREDS_CLI, 'server-v0.6.0') === undefined` — the widened signature still refuses a foreign line (`credsInstall.ts:129-131`) |
| `test/treeExpansion.test.ts:111-134` | `+ assert.equal(expansionKey({ kind: 'serverScope', account: ACCOUNT }), 'serverScope:a1')` beside the `teamScope:a1` line at `:120`, and the three child kinds asserted `undefined` in the leaves block at `:125-133` |
| `test/treeParent.test.ts` | `parentOf({kind:'serverBackup'…})` → the `serverScope`; `parentOf(serverScope)` → the `account` |
| `test/commandTargets.test.ts` | a `serverBackup` element resolves to its account — **the RED test for the §2.6 defect**: against unfixed `accountPick.ts` it returns `undefined` and the command would prompt |
| `test/backupMenuGate.test.ts:38-65` | **generalised, not copied**: the existing assertion runs over a table of `[command, allowed]` pairs — `credSshManager.orgBackup` → `isCorpAdmin`, and now `credSshManager.serverMetrics` → `isCorpAdmin` too. Its header (`:8-20`) already argues that hand-maintained client lists drift; adding a second list by copy-paste would be the thing it warns about. Plus a literal assertion that the set is exactly `{officer, admin}` |
| `test/orgRecoveryClient.test.ts` | the 403 sentence no longer contains `recovery officer` and names both standings — a string test, because the string is the whole user-visible behaviour of that branch |
| `test/commandsRegistered.test.ts` | unchanged, and that is the evidence no command was invented |
| `test/listingCoverage.test.ts`, `test/helpCoverage.test.ts` | unchanged for the same reason |
| `npx eslint src --max-warnings 0` | `treeDataProvider.ts` ≤ 800 after step 13 — the check that step 8 actually paid for itself |
| `npm run ratchet` | `extension.ts` did not grow |

### 4.3 `http/metrics/metrics.http`

The suite mints exactly two tokens — `token` (alice, a member) and `officerToken`
(`http/httpyac.config.js:51-53`); **there is no `adminToken`**. Promoting alice inside the file and
demoting her afterwards was the first draft, and the plan round (codex) named its failure: a run killed
between the promote and the put-back leaves the shared server's alice an administrator, and every later
"a member is refused" assertion in the suite passes for the wrong reason. httpyac has no `finally`. So:
**a third minted identity, `adminToken`** — a dedicated `admin@{domain}` in `httpyac.config.js`
beside the two, enrolled as `admin` ONCE at the top of `metrics.http` by the officer (idempotent: a
`PUT` of the same role twice is the same state) and never demoted, because that identity exists for
nothing else. Ordering across files is not guaranteed, so the enrolment lives in `metrics.http` itself:

- header prose: *"Officer-only"* → *"Administrators and recovery officers"*, keeping the PRECONDITION
  block (`:4-6`) because it is still true.
- `metrics_are_readable_by_a_recovery_officer` — unchanged.
- **NEW** `metrics_are_readable_by_an_administrator`: `PUT /api/org/members/admin@{domain}`
  `{"role":"admin"}` as the officer → `GET /api/metrics` with `{{adminToken}}` → `200`, same body
  assertions. No put-back: alice's role is never touched.
- `metrics_for_a_caller_who_is_not_an_officer_is_403` → renamed
  `metrics_for_a_caller_who_does_not_administer_is_403`, still `{{token}}` (alice, a member), still
  `403`, and its comment rewritten: the one-answer-for-two-reasons argument (`:32-34`) still holds.
- `metrics_without_a_token_is_401` — unchanged.
- `# @uncovered 403 for an admin on a corp server with NO recovery roster — `RequireAdminAsync` sits
  inside `orgRecovery.Enabled`, and the suite's server is started WITH a roster` (§2.1).

`http/README.md:14` and `:51` mention `/api/metrics` as officer-only — `:51` must be reworded.

**Report the verdict by exit code, never the log tail**
([http-contracts.md](../.claude/rules/shared/common/http-contracts.md)): `0` pass · `1` **contract
regression** · `3`/`4`/`5` environment/config/no-report — the last three mean the API was not exercised
and prove nothing.

---

## 5. Docs

| File | Change |
|---|---|
| `research/module_server.md:1108-1118` | retitle *"one document, for the officers"* → *"one document, for whoever administers"*; replace the *"Officer-only through `RequireOfficer`"* sentence with the admin rule **and the roster caveat** (§2.1); note it is now read by the tree as well as the metrics tab |
| `research/module_server.md:1356` | the `GET /api/org/backup/status` row gains the configured kinds, and a line saying why it is separate from `targets[]` (§1.3a) |
| `research/module_extension.md:3895` | the *Server Metrics…* row: `account-corpOfficer` → *"an administrator's or an officer's row"*; add the new files |
| `research/module_extension.md`, new section after *Server Backup* (`:4612-4680`) | **"The Server section — what the deployment is, in the tree (2026-09-12)"**: the four rows, the reuse of the backup poll, the icon-only update hint, the outbound GitHub call and its budget, the 800-line move that paid for it, and the six degraded states |
| `research/module_extension.md:3888` | the *tree in layers* row gains the Server/Team ordering rule |
| `research/architecture.md` | **Planned as no change, and that was half right.** The verification behind it was about `/api/metrics` and the tree sections, and it still holds: neither belongs in a document about how the two halves fit together, and inventing a mention to satisfy a checklist is worse than leaving it. What it did not consider is that this section's Version row made the extension a SECOND caller of GitHub's public release list — an outbound call to a third party, which is exactly what the container diagram is for, and which the diagram had been omitting since the binary installer was written. So the diagram gained the external system and a cross-cutting section names all three hosts the extension reaches. The rule the original row was defending is intact: the change is about a thing the diagram exists to show, not about this feature |
| `src_vs_code/CHANGELOG.md` | one entry. **This is the only CHANGELOG in the repository** — verified: `find . -maxdepth 3 -name CHANGELOG.md` returns it alone; `src_minimalapi_server/` has none |
| the server's "changelog" | is its GitHub release body, generated by `release.yml:220-223` as a fixed string (*"Native AOT builds. Docker: …"*). The server half's written record is therefore `module_server.md` + the `.http` suite, and this plan does not introduce a second changelog to keep in sync |
| `todo/README.md` | the *Currently open* table gains this plan on creation, and loses it on promotion |

---

## 6. Release

Two artefacts, two tags, and **only one of them is a deploy** (CLAUDE.md *Releasing and deploying —
four artefacts, four tags*).

1. `server-vX.Y.Z` → builds the image and publishes the release (`release.yml:36, 203-224`). **A push
   to `main` publishes nothing deployable**; `edge`/`sha-…` never reach a host, because the deploy takes
   a version.
2. **The deploy is manual and is a question for the owner, not a step in this plan.** The
   `rsd server deploy` workflow is `workflow_dispatch`, it runs `deploy/update.sh` on **the single
   production host**, and there is no staging environment to rehearse in. Ask before dispatching.
3. Before claiming the server half is live, run the check CLAUDE.md:110-113 spells out — that the last
   `server-v*` tag **contains the commit**, and that a deploy ran after it. A green CI is not a running
   server.
4. `extension-vA.B.C` → the Marketplace.

**Order and asymmetry.** Server first is the comfortable order, because the extension can then ship
against a server that already answers. Extension first is survivable and the section says so out loud
(§2.7, *server older than THIS release*). What must not happen is shipping the extension and *silently*
rendering an empty section — hence that row.

---

## 7. Definition of Done

- [ ] `dotnet build dew_flow_creds_for_devs.slnx -c Debug` — **0 warnings** (warnings are errors here).
- [ ] `./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe` green, and the summary
      reports the **step-2 failure message** of `AnAdministratorWhoIsNotAnOfficerIsServed` as well as the pass.
- [ ] `cd src_vs_code && npm run typecheck && npm test` green; `npx eslint src --max-warnings 0` green
      (which is the proof `treeDataProvider.ts` is still ≤ 800); `npm run ratchet` green.
- [ ] `node .agents/conventions/tools/http-run.mjs` — verdict reported **by exit code**, and an
      environment failure reported as an environment failure.
- [ ] The HTTP contract change updated **both halves and `research/module_server.md`** (CLAUDE.md rule 6).
- [ ] A member is still refused `/api/metrics`; an anonymous caller still gets 401. Asserted, unchanged.
- [ ] Nothing in the section can reach a credential: `configuredTargetKinds` is a kind list, pinned by a test.
- [ ] The GitHub call is admin-only, TTL'd, silent on failure, carries no identifying data, and is
      documented in `module_extension.md`.
- [ ] Reuse recorded: `latestRelease`/`newestOf` **extracted** rather than copied (move 2);
      `versionFromTag` **widened** rather than forked (move 1); the backup poll **widened** rather than
      duplicated (move 1); `formatBytes`, `compareVersions`, `CorpApiClient`, `RequireAdminAsync` and
      `credSshManager.orgBackup` reused as they are. **No new command was registered.**
- [ ] `research/` updated per the Knowledge Base DoD; `todo/README.md` matches the folder.
- [ ] `node .claude/rules/shared/tools/plan-lifecycle.mjs` and `pin-check.mjs` pass.
- [ ] The `coai` gate: `review_plan` reached `proceed` **before** implementation, `review_code` ran on
      the finished branch, every finding resolved with `accept` or a reasoned `reject`, and the summary
      reports the verdicts **and how many reviewers answered**.
- [ ] This plan promoted to `research/` with `IMPLEMENTED <date>` and its deviations recorded.

---

## 8. What this plan could NOT verify

Named rather than assumed, per [planning-docs.md](../.claude/rules/shared/common/planning-docs.md) —
*a conclusion may not be wider than the conditions checked*.

1. **Issue #56's own text.** Taken from the task brief; `gh issue view 56` was **not** run (the session
   is read-only against this repo and made no network call). If the issue says anything the brief
   omitted, §1.4 is the table to re-check.
2. **The live GitHub release list.** `api.github.com/…/releases` was **not** called. What *was* checked
   is local: 97 tags, of which 72 `extension-v*` / 13 `server-v*` / 6 `cli-v*` / 6 `mcp-v*`;
   `server-v0.6.0` is 4th newest by `creatordate`; and `release.yml:220` proves a `server-v*` tag
   creates a Release. **Not checked:** whether every `server-v*` tag actually has a Release object (the
   workflow's `needs: server-binaries` means a failed leg publishes none — `release.yml:191-197` records
   exactly that having happened), and whether any were later deleted. `server-v0.5.2` is referenced in
   that comment but is **not** among the local tags, which is the one concrete smell.
3. **GitHub's anonymous rate limit** (commonly 60/hour/IP) is cited from general knowledge, not measured.
   The 6-hour TTL is sized against it and should be confirmed against the `x-ratelimit-*` headers when
   the code exists.
4. **`npx eslint` was not run.** `treeDataProvider.ts` = 800 is `wc -l` (newline count). eslint's
   `max-lines` counts the same way for a file ending in a newline, but step 8 must **measure**, not assume.
5. **`research/module_extension.md` has no single "tree section table."** There is a capability table
   (`:3860-3900`) whose *tree in layers* (`:3888`) and *Server Metrics…* (`:3895`) rows are the nearest
   thing; §5 targets those. If a dedicated table is wanted, that is a docs decision, not a finding.
6. **No test was executed and no build was run** — this plan is a document, per the brief. Every
   `file:line` in it was opened in this session at commit `4ec61c0`.
7. **`corpSections` ordering (Server above Team) is a judgement**, not a measurement. It is the one
   thing here a person might simply disagree with, and it costs one line to flip.
8. **Open question for the owner** (§2.5): should the GitHub check be behind
   `credSshManager.checkServerUpdates`? It is the only outbound call to a host that is not the person's
   own server, and a corporate deployment may have a policy about that. A setting adds a
   `listingCoverage`/`helpCoverage` obligation, which is why it is asked rather than assumed.
