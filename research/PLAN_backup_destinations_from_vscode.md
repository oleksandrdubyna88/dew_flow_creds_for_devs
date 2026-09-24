# PLAN — configure the backup destinations from VS Code, and tell "last run" from "last success" (#134)

> Status: **IMPLEMENTED, 2026-09-24.** All of S1–S7 and C1–C9 shipped, in one pull request as nine
> story commits. Scope: one new admin-only server route and four server-side fixes under
> `/api/org/backup/*` (`src_minimalapi_server/src/OrgBackupEndpoints.cs`, `BackupTargetPlan.cs`,
> `BackupTargets.cs`, `BackupRunner.cs`, `BackupStore.cs`, `S3Target.cs`, `AzureBlobTarget.cs`,
> `Models.cs`); the extension's Server backup tab (`src_vs_code/src/backupTab.ts`, `backupPage.ts`,
> `backupTargets.ts`, `orgBackupClient.ts`, `orgBackupPanel.ts`) and the tree's Server rows
> (`serverItems.ts`). Issue: oleksandrdubyna88/dew_flow_creds_for_devs#134 — the tail of #56.
>
> **Deviations — what shipped differently, and why.**
>
> - **The plan gate rewrote four things before a line was written** (3 of 3 reviewers, verdict
>   `good_enough` on a one-round budget; 6 findings accepted, 6 rejected with reasons): the probe's
>   DELETE ran on the two-minute request deadline while its PUT ran on the twenty-second probe deadline,
>   so one hung bucket held a save for 140 s — both halves now run on the probe's (`DeleteWithinAsync`);
>   a legacy `status.json` whose last run was `ok` would have read as *never succeeded* — the read
>   derives `lastSuccessAt` from it; the no-KEK `409` applies only when the plan actually SEALS, so a
>   keys-omitted edit still saves on such a deployment; an unopenable sibling re-sent unchanged is kept
>   and unprobed, which against the probe-all code was a real break; a region typed under S3 is blanked
>   for Azure; and the two-implementation contract got one fixture both suites assert,
>   `contract/backup-targets-v1.json`. Rejected: a `Task.WhenAll` wrapper (the per-request deadlines are
>   the bound), a null-status normaliser (`ReadOrDefaultAsync` already answers `NeverRun`), a
>   mixed-credentials warning (the design was per row), a second partial guard (the test pins it),
>   keeping typed credentials across a failed save (the owner's rule: a credential lives for one
>   message), an "optimistic status" warning (every status the tab assigns is a `readStatus` answer), and
>   Region in the identity (it would turn a region edit into a delete-plus-add that drops the keys).
> - **`BackupTargets.Open` grew `Opens`**, not a public `TryOpen`: the same AEAD open without the error
>   line, because a listing is read every time the tab opens.
> - **Two destinations with one identity are refused by name** — not in the plan; found writing the
>   planner, since the keep-the-keys rule can only ever match the first.
> - **The kind is fixed on an edit**, and an edit that changes the prefix is a NEW destination to the
>   server, asked for both halves on the client with the server's own first-save sentence — the plan had
>   `hasSealed` as a flag; it is `identityOf(row) === identityOf(edited)`.
> - **`VaultServer` takes service replacements** (`ConfigureTestServices`) so `BackupTargets` is built
>   over `StubTransport` in the endpoint tests — the plan said so, and it is what let a probe be a
>   request a test reads rather than a DNS lookup that fails differently on every network.
> - **`saveDeadlineMs` never shortens the client's deadline** — `max(base, 120 s)` — the plan said
>   "passes 120 s"; a client built with a longer one keeps it.
> - **Singular/plural on the Vaults row** (`1 pending share`) — a detail the plan did not spell.
> - **The `.http` suite covers the `403` and the empty `200` of the new route**; a populated listing
>   and a proved save are `@uncovered` with their reasons (both need a reachable bucket with credentials
>   nobody should commit). Exit `0` against a started stack, 185 requests, 405 checks; coverage 47/47.
> - **The code gate (12 of 12 reviewers, verdict `proceed`; 5 findings taken, 17 refused with reasons)
>   turned the plan's own deviation into a fix.** The plan had recorded *"not a cross-language live
>   run"* and both codex and gemini quoted `testing.md` back: two suites agreeing with one file is not
>   the live check the rule mandates. `src_vs_code/scripts/backup-targets-live.cjs` is that check now —
>   the REAL compiled client (`out/orgBackupClient.js`) driven against the REAL server the `.http`
>   contract job already starts: `readTargets` answers a list, the status carries `lastSuccessAt`, a
>   save with a destination at a host that cannot resolve is REFUSED through the client's own error
>   path naming the destination, and the list is unchanged afterwards. What it still cannot prove: a
>   PROVED save, which needs a bucket and credentials nobody should commit; that branch stays
>   in-process over the stubbed transport. Two more from the same round: the fixture became the exact
>   wire array rather than an envelope around one, so both suites consume it whole; and the client no
>   longer refuses a credentials word or a kind it does not know — a newer server's drive destination
>   is listed by its kind, says it needs attention, cannot be edited here, and can still be removed,
>   because an older extension against a newer server must be served normally. Refused, with the code
>   as the reason: a `StringBuilder` preference no rule states; a planner made generic for grant state
>   the drives plan has not decided; last-writer-wins on `PUT /settings`, which predates this change and
>   is an owner question; a concurrency cap for single-digit destinations; a duplicate-identity "hole"
>   the planner refuses by name; an NRE on a path no decision can reach; and several findings whose own
>   text concluded the code was correct.
> - **A Windows-only collision, pre-existing, seen once**: `AtomicWriteAsync` is a `File.Move` over the
>   destination, which fails under a concurrent reader on Windows (`rename(2)` on Linux succeeds), so the
>   restart test's ten-millisecond poll once made the sweep log *"could not read the backup status"* and
>   time out. Four re-runs clean; recorded in `module_tests.md` rather than papered over with a retry.
>
> **Open tail**, none of it this plan's to close: the two drive kinds
> ([PLAN_corp_backup_drives.md](../todo/PLAN_corp_backup_drives.md), boundary named on both sides);
> the two byte formatters (`humanBytes` in `backupPage.ts`, `formatBytes` in `serverMetricsPage.ts`)
> this work uses and does not unify; and two owner assumptions recorded so they can be reversed —
> only a NEW or CHANGED destination is probed on save (`TargetDecision.Probe`), and `partial` is not a
> success for `lastSuccessAt` (one comparison in `FinishAsync`).
>
> Related docs: [PLAN_corp_server_backup.md](PLAN_corp_server_backup.md) (epic 5, which
> built everything below the form), [PLAN_server_section_for_admins.md](PLAN_server_section_for_admins.md)
> (§2.2 — the decision that the STATUS names kinds only), [PLAN_corp_backup_drives.md](../todo/PLAN_corp_backup_drives.md)
> (the two drive kinds, still open — see *Boundary* below), [module_server.md](module_server.md),
> [module_extension.md](module_extension.md).

## The symptom

Epic 5 shipped the whole machinery of an off-machine backup — the archive, the key, the run, S3 and
Azure Blob as destinations, and a **Server Backup…** tab — and then `PLAN_corp_server_backup.md`'s
Extension table (`research/PLAN_corp_server_backup.md:243-251`) claimed *"status, configure a target,
run now, download, show the key once"*. Three of the five are true. **A destination cannot be added,
changed or removed from the editor**:

- `backupTab.ts:196-198` deliberately omits `targets` from the save, so the form edits only the
  schedule; `BackupTargetInput` (`orgBackupClient.ts:102`) is declared and filled by nothing.
- No route returns the configured destinations. `GET /api/org/backup/status` answers
  `configuredTargetKinds` — a list of KINDS, by the owner's decision (`PLAN_server_section_for_admins.md`
  §2.2) — and `targets[]`, which is the last RUN's outcomes. A client that wanted to edit one destination
  of three would have to retype all three, because `PUT /api/org/backup/settings` REPLACES the list
  (`OrgBackupEndpoints.cs:130-148`): omitted = unchanged, `[]` = remove all, non-empty = the whole set.

And four smaller things the audit of #56 found beside it (issue #134 items 3–4, plus what reading the
save path turned up):

1. **Editing a destination's region loses the edit.** `SealedAsync` keeps the sealed record whole when
   the keys are left out (`OrgBackupEndpoints.cs:182-196`: `secrets.Empty && kept is not null ? kept : …`),
   and the identity that decides "kept" is `Kind|Endpoint|Bucket|Prefix` (`BackupTargets.cs:69`) — the
   region is not in it, so a save that changes only the region writes the OLD region back. Silent, and
   S3 signs with the region, so the next run answers 400 from the bucket.
2. **Saving a destination on a deployment with no KEK is a 500.** `BackupTargets.Seal`
   (`BackupTargets.cs:106-121`) hands an empty key to `AesGcm`, which throws `CryptographicException`;
   nothing on the path catches it. The mint route answers 409 with a sentence naming
   `Vault:LoginKey:Kek` for the same deployment; the settings route should too.
3. **Every save probes every destination** (`OrgBackupEndpoints.cs:198-210`, `Task.WhenAll` over all
   sealed records): editing the prefix of one bucket writes-and-deletes a probe object in every other
   one, at up to twenty seconds each, and a destination that is temporarily unreachable blocks a change
   to an unrelated one.
4. **"Last backup" is the last RUN, failed ones included.** `status.json` carries one instant,
   `LastRunAt`, written by five writers (`BackupRunner.cs:112` Begin, `:161` Abandon, `:441` Finish,
   `:465` Fail, `BackupStoreRun.cs:138` the sweep). The tree's Backup row draws it with a warning icon on
   a failure, so an administrator sees *when it last tried* and cannot see *when it last worked* — the
   number that decides how much a restore would lose.
5. **The Vaults row counts vault files only** (`serverItems.ts:139-148`: `vaults · vaultBytesOnDisk`).
   The server already reports `PendingShares`/`ShareBytesOnDisk` (`ServerMetrics.cs:23-24`, `:85-86`)
   and the client already reads them (`serverMetricsPage.ts:24-25`); the row does not show them.
6. **Stale prose.** `SettingsAsync`'s remark (`OrgBackupEndpoints.cs:100-105`) and
   `BackupSettingsRequest`'s (`Models.cs:357-360`) both say *"no credential fields, deliberately —
   the cloud targets are story 4"*, a year after story 4 added them; the class summary says five
   routes; `module_server.md` says six.

## What must be true when it is done

1. An administrator, from the **Server Backup…** tab, **adds** an S3 or Azure Blob destination
   (endpoint, region for S3, bucket/container, prefix, the two credential halves), **edits** one
   (keys left empty keep the sealed ones — the server's own rule), and **removes** one after a modal
   that says the archives already at that destination stay there. The next run goes there and the
   tree's Backup row names the kind.
2. **No credential is ever shown back.** Not in the new route's answer, not in the status, not in the
   event row, not re-rendered into the form after a failed save, not in any notice or log line.
3. The Backup row and the tab **distinguish the last run from the last successful run**.
4. The four fixes above hold, each with a test watched failing first.
5. An extension against an OLDER server (no `GET /api/org/backup/targets`) does not offer the
   destinations form at all — without the list, a save would silently erase the destinations it
   cannot see — and says which side is older. An older extension against the new server is served
   exactly as before (the settings route's shape is unchanged; the status gains one optional field).

## Design

### Server

**S1 — `GET /api/org/backup/targets`, admin-only.** Answers a JSON array:

```json
[{ "kind": "s3", "endpoint": "https://s3.example.com", "region": "eu-central-1",
   "bucket": "vaults", "prefix": "nightly", "credentials": "sealed" }]
```

`credentials` is `"sealed"` when this server can open the record's credentials and `"unopenable"` when
it cannot (a KEK that changed, a settings file restored from elsewhere, or no KEK at all) — the one
fact the form needs to say *re-enter them*. **Never** `Iv`/`Tag`/`Data`, never a key. A new DTO
`BackupTargetSummaryDto(Kind, Endpoint, Region, Bucket, Prefix, Credentials)` in `Models.cs`,
registered in `AppJsonContext.cs` beside `BackupTargetDto` (`:83`).

*Why a new route and not the status.* The status is polled once per readiness cycle for every admin
account by the backup watch (`backupWatch.ts`); the owner decided on 2026-09-12 that it names KINDS
and nothing operational (`PLAN_server_section_for_admins.md` §2.2; pinned by
`TheStatusNeverNamesADestinationsCredentials`, `BackupEndpointTests.cs:485-500`, and
`org_backup_status_never_carries_a_credential`). The status is not touched. A bucket and a prefix are
operational detail *"that belongs on the backup tab, where `SealedTarget.Describe` already draws
them"* — this route IS the backup tab's read, made once when the tab opens, by the same admin gate.

`BackupTargets.Open` (`BackupTargets.cs:123-146`) logs an error on every failed open; a listing must
not spam the log once per tab open, so the decrypt moves into a private `TryOpen` that `Open` (logs)
and a new `Opens(SealedTarget)` (does not) both call. One AEAD call, as before.

*The contract has two implementations, so it gets one fixture both assert* (plan gate, codex):
`contract/backup-targets-v1.json` — a sample answer, in the shape `contract/printable-key-v1.json`
already has. The server test serialises the real route's answer for a seeded settings file and
compares it to the fixture; the extension test feeds the fixture verbatim to `readTargets` and asserts
it is accepted. Not a cross-language live run — none exists for any route here — and the report says so.

**S2 — the region survives a keys-omitted edit (fix 1).** In `SealedAsync`
(`OrgBackupEndpoints.cs:173-210`), a kept record is `kept with { Region = BackupTargets.Text(wanted.Region) }`.
The identity stays `Kind|Endpoint|Bucket|Prefix`: region is a *setting* of a destination, not what
makes it a different one — the same bucket in a different region is the same bucket.

**S3 — probe only what is NEW or CHANGED (fix 3). Owner assumption, recorded so it can be reversed.**
A destination is probed at save time when it has no kept record (new identity), when credentials were
sent (new keys), or when its region differs from the kept one. A destination whose identity, keys and
region are all unchanged is written back as it was, unprobed. The decision moves out of the endpoint
into a pure planner — `BackupTargetPlan.Of(requested, existing)` in a new
`src_minimalapi_server/src/BackupTargetPlan.cs` — that returns, per requested target, the record to
save and whether to probe it, or the problem. The endpoint seals, probes the marked ones together
(`Task.WhenAll`, as now), and writes. Reversing the assumption is one predicate in that planner.

*Why this is an assumption and not a finding:* the probe was designed as *"every target is proved
USABLE before any of them is written"* (`OrgBackupEndpoints.cs:168-172`), and re-proving an untouched
destination on every schedule edit does catch a key that was revoked since. It also makes editing one
destination depend on every other one being reachable now, and the nightly run reports a revoked key
within a day anyway (`targets[].error`, the notice). The owner may prefer the old behaviour; the plan
states the trade so the choice is theirs.

*A guarantee this rule carries, named by the plan gate (gemini):* a destination whose credentials
this server cannot open (`credentials: "unopenable"`) is, when re-sent unchanged beside an edit to a
sibling, **kept as it is and not probed**, so the save of the sibling answers 204 — against today's
probe-all code its probe would fail with *"cannot open the credentials"* and block the whole save.
Pinned by `EditingOneDestinationLeavesAnUnopenableSiblingInPlaceAndUnprobed`.

*The probe's own deadline, both halves* (plan gate, local): the probe's PUT runs on
`ArchiveTargets.ProbeTimeout` (20 s, `S3Target.cs:101`, `AzureBlobTarget.cs:91`) but its DELETE goes
through `DeleteAsync` on the 2-minute `Request` deadline (`S3Target.cs:82-85`, `:107`;
`AzureBlobTarget.cs:73-76`, `:97`), so one hung bucket could hold a save for 140 s — past the client
deadline C9 sets. The probe's delete runs on the probe deadline too, in both clients, so a save's worst
case is 40 s; C9's client deadline is three times that.

**S4 — no KEK is a sentence, not a 500 (fix 2).** Before sealing anything, `SettingsAsync` checks
`backups.Configured` (`BackupStore.cs:109`) **when the plan needs to seal** — a new destination, or
credentials sent for an existing one (plan gate, codex: a kept record needs no `Seal`, so a
keys-omitted or metadata-only save must not be refused for want of a KEK; its probe, if any, answers
the existing *"cannot open the credentials — re-enter them"*). A deployment that cannot seal answers
**409** with the mint route's own wording — *"Vault:LoginKey:Kek is not configured, so this server
cannot seal a destination's credentials. Set it to base64 of 32 random bytes — the same key seals
developer login keys."* 409 rather than 400 because the request is well formed and the server's state
is what refuses, which is the reading `MintAsync` (`:248`) already makes. `targets: []` (remove all)
and an omitted `targets` need no KEK and are unaffected.

**S5 — `LastSuccessAt` (issue item 3). Owner assumption: only the verdict `ok` is a success;
`partial` is not.** `BackupStatus` (`Models.cs:314-322`) gains `long LastSuccessAt`, `0` = never, the
same spelling `LastRunAt` uses. Every writer carries the previous value forward through
`previous with { … }` on a fresh read — Begin (`BackupRunner.cs:112`), Abandon (`:161`), Fail (`:465`),
the sweep (`BackupStoreRun.cs:138`, already `status with`), Progress (`:413`, already `status with`) —
and Finish (`:441`) stamps `now` when `Verdict(uploads) == Succeeded`. A `status.json` written by
today's build has no such member, and a missing positional member deserialises as `0` — which would
call a deployment whose last run before the upgrade was `ok` *never succeeded* (plan gate, codex). So
`ReadStatusAsync` normalises **where the value is read**, beside the `Targets` normalisation
(`BackupStore.cs:204-217`): a stored verdict of `ok` with `LastSuccessAt == 0` reads as
`LastSuccessAt = LastRunAt`. A legacy `failed`/`partial` status cannot establish a success, and the row
then says *no recorded success* rather than *never succeeded*. `BackupStatusDto` (`Models.cs:339-351`)
gains `LastSuccessAt` beside `LastRunAt`; `http/org/backup.http`'s shape test lists it.

*Why `partial` is not a success:* a partial run has an archive that reached SOME destinations; the
row's question is *"when did the last COMPLETE copy leave"*, and answering it with a run that missed a
destination would let a half-failing deployment show a fresh success for months. The owner may decide
`partial` counts; it is one comparison in `FinishAsync`.

**S6 — the settings row names what changed about the destinations.** `backup.settings_changed`
(`OrgEventLog.cs:136`, written by `RecordAsync`, `OrgBackupEndpoints.cs:151-158`) carries
`"04:00Z, 14 day(s)"` today. When the request carried `targets`, the detail gains
`; destinations +s3 vaults/nightly −azure vaults/old ~s3 vaults/weekly` — added, removed and re-keyed or
re-regioned, each by `SealedTarget.Describe`/its request twin, **never** a key, an endpoint or anything
sealed. Pure, in the planner, so it is a unit test. When nothing about the set changed:
`; destinations unchanged`.

**S7 — the prose.** The two stale remarks, the route count in the class summary, and `module_server.md`.

### Extension

**C1 — `readTargets(account)`** on `OrgBackupClient`: `GET /api/org/backup/targets`; a **404 answers
`undefined`** — *this server is older than destination editing* — which the tab draws as a sentence
naming the server, and does NOT offer the form; any other refusal throws the server's sentence; a body
that is not an array of `{kind, endpoint, region, bucket, prefix: string; credentials: 'sealed'|'unopenable'}`
throws the shape sentence, as `readStatus` does. Pure helpers, exported and tested:
`targetProblem(input, hasSealed)` (the server's own refusals — `BackupTargets.Problem`,
`ArchiveTargets.EndpointProblem` — spelled once here so a typo costs no round trip), `describeTarget`
(`kind bucket/prefix`, the same words `Describe` uses), `withTarget(list, edited, at)`,
`withoutTarget(list, at)`, and `toInputs(summaries)` (a summary becomes a request with no credential
fields — the "keep the sealed ones" request). `settingsProblem` (`orgBackupClient.ts:271`) validates
each target it is given.

**C2 — the Destinations section** of `backupPage.ts`. The "Destinations" table (`:190`, `:214`) becomes
two things: **Configured destinations** — one row per summary (`describeTarget`, endpoint, region,
`credentials` drawn as *sealed* / *cannot be opened — re-enter*), with **Edit** and **Remove** per row
and **Add destination…** below; and **Last run, per destination** — the existing outcome table,
whose empty sentence now depends on `targetKindsOf(status)`: *"No destination is configured …"* only
when none is; *"No run has reported on these destinations yet."* when some are (the sentence at
`:219` is wrong today before the first run). The **form** (drawn when the tab holds a draft): kind
(`<select>`: S3 / Azure Blob), endpoint, region (S3 only — hidden for Azure by the page script), bucket
or container, prefix, and the two credential halves — the id/name as `type="text"`, the secret as
`type="password"`, **both with no `value`**, with the hint *"Leave both empty to keep the ones already
sealed"* when editing and *"Required the first time"* when adding — the shape `entityFormPage.ts:321-325`
and `:654` use for a stored password. The page script is exported on its own (`backupPageScript()`)
so `runFragment` can drive it: reading the form, posting `saveTarget`, toggling the region row on kind
change. Nothing about a form value is ever put into `vscode.setState`.

**C3 — messages.** `BackupPageMessage.type` grows `addTarget | editTarget | cancelTarget | saveTarget |
removeTarget`; `isBackupPageMessage` (`backupPage.ts:39`) checks the optional numbers (`index` joins
them) AND the optional strings (the nine target fields) — a page is untrusted input. `BackupTab.handle`
(`backupTab.ts:114-122`) becomes a `Record` over the whole type union rather than `routes[type] ?? save`,
so a type without a handler is a compile error — the reading `SERVER_ROWS` (`serverItems.ts`) makes.

**C4 — the draft.** `BackupTab` holds `targets: BackupTargetSummary[] | undefined` (undefined = older
server) and `draft?: { index?: number; kind; endpoint; region; bucket; prefix }` — **non-secret fields
only**. A `saveTarget` message's credential fields go straight into the request and nowhere else: not
into the draft, not into a notice, not into a log. After a failed save the form is redrawn from the
draft (so the person does not retype the endpoint) and the error is shown; the test asserts the HTML
after a failed save contains none of the four credential strings. The region is normalised to `''`
for any kind that is not `s3` before the request is built (plan gate, local: a region typed under S3
survives a switch to Azure in the hidden input), and the server's planner reads a kept Azure record's
region as `''` too.

**C5 — remove** goes through a new host seam `confirmRemove(what: string): Promise<boolean>` on
`BackupTabHost` (`backupTab.ts:25-42`), wired in `orgBackupPanel.ts` to `confirmDestructive`
(`dialogs.ts:162`) with *"Remove `s3 vaults/nightly` from this server's backup destinations? Archives
already at that destination stay there; only this server stops sending new ones."* / **Remove
destination**. A dismissed dialog removes nothing and sends nothing.

**C6 — the Backup row** (`serverItems.ts:172-247`) reads `lastSuccessAt` (optional on the wire — an
older server omits it, and the row then draws as today). When the last run is not `ok` and a success
exists: `s3 · last run 2026-09-23 03:00 · last success 2026-09-20 03:00`; when none ever did:
`… · never succeeded`; when the last run IS the success: unchanged. The tab's run sentence
(`backupPage.ts:73`) adds *"The last successful backup was at …"* in the same two cases.

**C7 — the row moves at once.** `BackupTabHost` gains `record?: (status: BackupStatus) => void`; the
tab calls it from the ONE place it assigns `this.status`. `showOrgBackup` (`orgBackupPanel.ts:16`) takes
it, and `orgBackupCommands.ts` fills it from the provider the corporate commands already receive
(`extension.ts:919` passes `provider`): `provider.server.backup.set(accountId, { value, at })` then
`provider.refresh()` — the same envelope `backupWatch.ts` writes (`corpPolicyWiring.ts:75`), so the
row's next tick agrees with what the tab just did. `OrgBackupCommandsHost` gains
`provider: Pick<CredTreeDataProvider, 'server' | 'refresh'>`.

**C8 — the Vaults row** (`serverItems.ts:139-148`): `41 · 1.2 GiB · 3 pending shares (12.0 KiB)` when
`pendingShares > 0`; unchanged when it is `0`. Client only; the numbers are already on the wire.

**C9 — a save that carries `targets` waits longer.** The server probes each marked destination for up
to twenty seconds (`ArchiveTargets.ProbeTimeout`) — a PUT and a DELETE each — concurrently, behind a
reverse proxy, over a corporate VPN; the client's sixty seconds (`serverTransport.ts:41`) is a wall
one slow bucket walks into. `CorpApiClient.request` (`corpApiClient.ts:49`) gains an optional
`timeoutMs` argument (reuse-first step 2.1 — the existing thing, widened); `saveSettings` passes
`TARGET_SAVE_TIMEOUT_MS = 120_000` when `targets` is present — three times the server's worst case
once the probe's delete runs on the probe deadline (S3 above). After ANY failed save that carried
targets, the tab **re-reads the list** before redrawing, so the page shows what the server holds
rather than what the person hoped.

### What is deliberately NOT here

- OneDrive and Google Drive — [PLAN_corp_backup_drives.md](../todo/PLAN_corp_backup_drives.md). See *Boundary*.
- A per-destination "probe now" button. The save probes what changed; a nightly run reports the rest.
- Reordering destinations; the list is a set to the server (identity-keyed).
- A second byte formatter: `backupPage.ts` has `humanBytes` and `serverMetricsPage.ts` has
  `formatBytes` — a pre-existing duplication this plan uses but does not unify (named in the report).

## Boundary with `PLAN_corp_backup_drives.md`

| Item | This plan | The drives plan |
|---|---|---|
| The destinations list, the form, add/edit/remove, `GET …/targets` | builds | reuses; adds two kinds |
| Kinds offered by the form | `s3`, `azure-blob` — the two with a static credential the admin types | `onedrive`, `gdrive` — no key to type; the form's *Add* for those kinds starts a consent flow instead |
| `credentials: "sealed" \| "unopenable"` | defined here | a revoked grant is a THIRD answer that plan adds (`"withdrawn"`) |
| Probe on save | S3 above: new/changed only | a drive's "probe" is the token refresh; same planner, same flag |

Order: this plan first — it lands the route and the form the drives plan extends. Disjoint: nothing
here reads or writes a refresh token; nothing there changes the S3/Azure form.

## Growth

Nothing new grows. `status.json` gains one `long`. The `backup.settings_changed` row's detail grows by
one `Describe` per destination added/removed/re-keyed per save — single digits of destinations, one
row per save, bounded by the existing event-log retention. The targets route reads the settings file
the status already reads and creates nothing.

## Build order

Server stories first (each its own commit, RED before GREEN, break-it after GREEN):

1. **S5 `LastSuccessAt`** — add the field with `0` at every writer (compiles, no behaviour); test *an
   `ok` run stamps it* RED → Finish; test *a failed run keeps it* RED → Begin/Abandon/Fail through
   `previous with`; test *`partial` does not advance it*; test *an old `status.json` reads as never*;
   the DTO and the `.http` shape. Break-it: `== Succeeded` → `!= Failed`.
2. **S4 no-KEK 409** — test on `Corp.ServerWithoutKek()` RED (observes the 500) → the guard.
3. **S1 the targets route** — `Opens`, the DTO, the route; tests: admin-only (the developer-refusal
   test gains the route), the listing carries `where` and never a key or the sealed half, a record
   sealed under another KEK lists as `unopenable`, an older-server-shaped absence is the client's job.
   `.http`: the 403 and the empty 200; `@uncovered` for a populated listing (needs a reachable bucket).
4. **S2 + S3 + S6 the planner** — `BackupTargetPlan` pure tests: region carried onto a kept record
   (RED against today's `kept`), unchanged → not probed, new keys → probed, new region → probed, the
   delta sentence; then the endpoint through a stubbed transport (`VaultServer` gains
   `ConfigureTestServices` so `BackupTargets` can be built over `StubTransport`): *editing the region
   while keeping the keys saves the new region* (RED), *a save with an unchanged destination sends it
   no probe* (RED), *the row names +/− and never a key*.
5. **S7 prose**, `module_server.md`.

Then the extension (each its own commit):

6. **C1 + C9 client** — `readTargets` (404 → `undefined`, shape guard), the helpers, `settingsProblem`
   over targets, the longer timeout on a save with targets; `orgBackupClient.test.ts`.
7. **C3 + C4 + C2 tab and page** — messages, the complete route table, the draft, the form, the
   section, the page script under `runFragment`; `backupTab.test.ts` (+ a `backupPage.test.ts` for
   the script). The secrets test, the older-server test, the failed-save-rereads test.
8. **C5 + C7 panel and command** — the two seams, `confirmDestructive`, the provider write.
9. **C6 + C8 rows** — `serverItems.ts` and its tests.
10. Docs: `module_extension.md`, `module_tests.md`, the extension `CHANGELOG.md` `[Unreleased]`,
    the fix to `PLAN_corp_server_backup.md:243-251`, the boundary paragraph in the drives plan;
    promote this plan.

## Test plan

Server (`./src_minimalapi_server/tests/bin/Debug/net10.0/CredVaultServer.Tests.exe`):

| Test | Guarantee | RED against |
|---|---|---|
| `AnOkRunStampsLastSuccessAtAndAFailedRunLeavesItAlone` (BackupRunnerTests) | the number a restore depends on survives a bad night | the field written as `0` |
| `APartialRunDoesNotCountAsASuccess` | a half-arrived copy is not the last complete one | `!= Failed` (break-it) |
| `ALegacyStatusWhoseLastRunWasOkReadsThatRunAsItsLastSuccess` (BackupStoreTests) | a pre-upgrade deployment is not told it never succeeded | the bare `0` |
| `ALegacyStatusWhoseLastRunFailedHasNoRecordedSuccess` (BackupStoreTests) | and a failure is not promoted into one | — |
| `EditingOneDestinationLeavesAnUnopenableSiblingInPlaceAndUnprobed` (BackupEndpointTests) | gate finding 8 | the probe-all `Task.WhenAll` |
| `AKeysOmittedEditSavesWithoutAKek` (BackupEndpointTests) | gate finding 7: the guard applies only when sealing | a guard on any non-empty list |
| `TheProbesDeleteRunsOnTheProbeDeadline` (BackupTargetTests) | gate finding 0: a save's worst case is 40 s, not 140 | `_deadlines.Request` on the delete |
| `TheTargetsRouteAnswersTheSharedFixtureShape` (BackupEndpointTests) | gate finding 6: one fixture, both suites | — |
| `TheSweepKeepsTheLastSuccessOfTheRunItInterrupts` | the crash path does not erase it | a `new BackupStatus` in the sweep (break-it) |
| `ADestinationCannotBeSavedWithoutAKekAndTheRefusalNamesTheSetting` (BackupEndpointTests) | a sentence, not a stack trace | the 500 |
| `TheTargetsRouteIsAdminOnly` (joins `ADeveloperIsRefusedOnEveryBackupRoute`) | | |
| `TheTargetsRouteListsWhereEachDestinationIsAndNeverWhatOpensIt` | no key, no `iv`/`tag`/`data`, `credentials: sealed` | — |
| `ATargetSealedUnderAnotherKekIsListedAsUnopenable` | the form can say *re-enter* | — |
| `EditingTheRegionWhileKeepingTheKeysSavesTheNewRegion` | fix 1 | `kept` returned whole |
| `ASaveThatLeavesADestinationUnchangedSendsItNoProbe` | S3 | `Task.WhenAll` over all |
| `ASaveWithNewKeysOrANewRegionProbesThatDestination` | S3's other half, so the test above cannot pass by never probing | — |
| `TheSettingsRowNamesTheDestinationsAddedAndRemovedAndNeverAKey` | S6 | detail = schedule only |
| `BackupTargetPlanTests` (new file) | the planner's five branches and the delta sentence, pure | — |

Extension (`cd src_vs_code && rm -rf out && npm run typecheck && npm test && npx eslint src`):

| Test | Guarantee |
|---|---|
| `readTargets` on a 404 answers undefined, on a shape it cannot read throws the sentence, never leaks a key into the result | C1 |
| `readTargets` accepts `contract/backup-targets-v1.json` verbatim | C1 (gate finding 6) |
| a region typed under S3 is not sent once the kind is Azure | C4 (gate finding 2) |
| `targetProblem` mirrors the server: https, loopback http allowed, bucket required, both halves or neither, first time needs both | C1 |
| a save with targets uses the longer deadline; one without does not | C9 |
| the destinations form is NOT offered against an older server, and the page says so | C1/C2 |
| the HTML after a FAILED save carries the endpoint back and none of the four credential values | C4 |
| a failed save re-reads the list before drawing | C9 |
| remove asks first, names the destination, and a dismissed dialog sends nothing | C5 |
| saving a destination sends the whole list with the sealed ones as key-less inputs, then records the status for the tree | C2/C7 |
| the page script posts what the form holds, and hides the region row for Azure | C2 (runFragment) |
| every message type has a route (compile-time), and an unknown/malformed message is refused at the door | C3 |
| the Backup row: last run ≠ last success, never succeeded, older server unchanged | C6 |
| the Vaults row shows pending shares only when there are some | C8 |
| the run sentence names the last success when the last run failed | C6 |

Contract: `http/org/backup.http` gains `org_backup_targets_is_admin_only`,
`org_backup_targets_before_any_destination`, the `lastSuccessAt` field in the status shape test, and
three `@uncovered` lines (a populated listing, the 409 without a KEK, the probe-skip). Run per
`http/README.md`; the verdict is the exit code.

Family checks: `plan-lifecycle.mjs`, `pin-check.mjs`, `gate-snippet-check.mjs`, `build-flags-check.mjs`,
`.github/scripts/branch-protection.mjs --selftest`.

## Definition of Done

- [ ] Every server story above has its test, watched RED for the real symptom, then GREEN, then broken
      and restored; both observations in the report.
- [ ] `GET /api/org/backup/targets` never carries `iv`, `tag`, `data` or a credential — asserted in
      `BackupEndpointTests` and in `http/org/backup.http`.
- [ ] The status route is byte-for-byte what it was plus `lastSuccessAt`;
      `TheStatusNeverNamesADestinationsCredentials` untouched and green.
- [ ] An older server (404 on the new route) gets a sentence and no form; an older extension gets the
      old settings behaviour.
- [ ] After a failed save the page holds the non-secret draft and not one credential string.
- [ ] `dotnet build … -c Debug` 0 warnings; the server exe and the MCP exe green; `npm test`,
      `typecheck` (exit read) and eslint green; the `.http` suite exit `0` against a started stack
      (or exit 3/4/5 reported as *not exercised*, never as pass).
- [ ] `module_server.md` (the route table, the seven routes, `LastSuccessAt`, the probe rule),
      `module_extension.md` (the tab's destinations half), `module_tests.md` (the new tiers),
      `CHANGELOG.md` `[Unreleased]`, `PLAN_corp_server_backup.md:243-251` corrected, the boundary named
      in `PLAN_corp_backup_drives.md`.
- [ ] `review_plan` reached `proceed`; `review_code` ran on the rebased branch; every finding resolved.
- [ ] This plan promoted to `research/` with its deviations, `todo/README.md` updated.
