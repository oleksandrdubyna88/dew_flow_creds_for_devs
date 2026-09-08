# PLAN — epic 5: one encrypted archive of the whole server, and somewhere safe to put it

> Status: **IMPLEMENTED, 2026-09-07.** All five stories ship: the chunked AES-256-GCM archive format
> with `--create-archive`, `--verify-archive` and `--decrypt-archive` on the server binary; the
> printable `BK1-` backup key with its four-state lookup and the four files a backup deployment
> keeps; the run with its OS-handle claim, the five-minute scheduler and six admin-only routes; S3
> and Azure Blob as hand-signed REST with retention at each; and the administrator's own half — the
> **Server Backup…** tab, the key shown once, the streamed download, the nag, and
> `deploy/restore-archive.sh`.
>
> **One tail, and it is a person's:** the live rehearsal — an archive taken from a running server and
> restored onto an empty stack — has NOT been run, and this is a tracked exception to the Definition
> of Done rather than a box quietly left unticked. What stands in for it is
> `deploy/restore-archive-itest.sh`, which runs the restore script as a program with `docker`
> replaced by a recording shim (seven scenarios, 23 assertions, in `ci · server`), plus
> `backup-archive-itest.cjs` driving the archive verbs against the published AOT binary. Those
> exercise every decision the script makes and prove nothing about a real image on a real host. The
> unbuilt drive targets left as [PLAN_corp_backup_drives.md](../todo/PLAN_corp_backup_drives.md).
>
> **Deviations, which are the part worth reading.** The nonce prefix is **8 bytes with a 4-byte
> counter**, not the 4 this plan sketched, and the counter is refused rather than wrapped; the header
> carries a chunk size, every declared length is bounded before allocation, and the whole header is
> associated data for every chunk. `--create-archive` and `--verify-archive` were added beside the
> planned `--decrypt-archive`, because a format whose only writer does not exist yet cannot be
> exercised by anything.
>
> From story 2: the printable form is HKDF **input** rather than the key itself, so what is sealed is
> the derived key and "shown once" is a fact rather than a policy; the key lookup has **four**
> answers, not three, because a key minted and not yet shown to a person is its own state and no run
> may use it; and `PrintableKey` is generic over the prefix and the checksum's domain string, so the
> eventual C# port of `RC1-` cannot become a second copy of the construction.
>
> From story 3: the run claim is an OS file HANDLE rather than the lock file with an age ceiling this
> plan sketched — a ceiling reclaims a live run on the day an archive takes longer than the guess,
> and a second container cannot tell live from dead by a timestamp. `GET /api/org/backup/archive`
> answers **404** when there is no archive instead of starting a run and answering 202, because a GET
> with a side effect is wrong HTTP and a loop for any client that retries. The due-math asks
> `hour >= configured`, so a server that slept through its window still takes the day's backup. The
> claim and the in-progress status are written INSIDE the request, because detaching the whole run
> left a window where a reloaded page saw "never run" for a backup that had just started — found by
> the `.http` suite, not by a unit test.
>
> From story 4: an upload is followed by a HEAD comparing the stored length, because
> `UNSIGNED-PAYLOAD` leaves the body out of the signature and a 200 would otherwise mean "accepted"
> rather than "stored"; listings follow their continuation token; the save-time check WRITES a probe
> object rather than doing a HEAD, because both clouds routinely grant read while denying write;
> credentials omitted from an edit keep the ones already sealed, since nothing ever shows them again;
> and a run whose every target refused reads as `failed` rather than `ok`.
>
> **What the review rounds changed, and none of it was in the plan.** An OMITTED `targets` member
> means unchanged while an empty array removes them all — conflating them would have wiped a
> deployment's destinations on the next schedule edit. Half a credential is refused by the field that
> is missing rather than reaching a base64 decoder. A listing that FAILED is not an empty one. The
> deadline carried into a body read came from a `CancellationTokenSource` that had already been
> disposed, so it could never fire: measured on .NET 10, `Register()` does not even throw, which is
> why every call site read as correct. `BackupRunner` is a singleton and its `_uploads` was a field,
> so a second run inherited the first's target rows. `BackupQueue` used `DropWrite`, which discards
> the ticket and answers `true` — and the ticket owns the run claim, so the deployment would have
> been unable to take another backup for the life of the process. The configuration snapshot survived
> a killed run in plaintext. An upload that landed where retention could not run read as `ok`. A
> `Content-Disposition` filename was taken as a path and handed to a save dialog. And the restore
> script refused an unfinished restore only after stopping the stack — a second outage for somebody
> already recovering from the first.
>
> The five stories are documented in [module_server.md](module_server.md),
> [module_extension.md](module_extension.md), [module_deployment.md](module_deployment.md),
> [module_tests.md](module_tests.md) and [architecture.md](architecture.md).
>
> Scope: an admin, without shell access
> to the host, can take an encrypted archive of everything the server holds — vault blobs, sealed
> login keys, the registry, projects, the event log, the recovery files, the server's own logs and a
> snapshot of its configuration — download it, or have the server ship it nightly to S3 or Azure
> Blob, with a retention window and a nagging notice when it has not run. Fifth of five epics under
> [PLAN_corp_control_plane.md](PLAN_corp_control_plane.md), which holds the owner decisions, the
> invariants and the shared shapes.
>
> Depends on [PLAN_corp_registry_roles.md](PLAN_corp_registry_roles.md) (`RequireAdmin`, runtime
> settings), [PLAN_corp_blocking_login_key.md](PLAN_corp_blocking_login_key.md) (the deployment KEK
> that seals what this archive carries) and [PLAN_corp_event_log.md](PLAN_corp_event_log.md) (every
> run leaves a row).
>
> Related docs: [module_deployment.md](module_deployment.md) (the container stack,
> `backup.sh` and the rehearsed restore), [module_server.md](module_server.md)
> (configuration table, the maintenance services, `--healthcheck`).

## The symptom

The deployment already has a backup — `deploy/backup.sh` and `deploy/backup/backup-once.sh` tar the
data directory and the certificates on the host. It is a good script and it answers a different
question: it needs a shell on the server, it writes to that host's disk, and it is unencrypted, so
where it lands has to be trusted.

The person who actually cares whether the company's credentials survive a dead disk is an
administrator with an editor and no ssh key. They have no way to take a copy, no way to have one
taken automatically, and nowhere to put it that is safe by construction rather than by an
arrangement with whoever runs the box.

## What this epic delivers

1. **An archive format**: tar plus gzip, encrypted with AES-256-GCM in chunks, streamable in both
   directions, tamper- and truncation-detecting.
2. **A backup key** the server generates once, shows once, and keeps sealed outside the archive.
3. **Admin endpoints**: status, settings, run now, download.
4. **A nightly scheduler** with an hour in UTC, a retention window and single-flight.
5. **Two cloud targets** written as signed REST calls, no SDKs: S3 and Azure Blob.
6. **A restore path** that needs nothing but the server binary and the key.
7. **Notices** in the extension: daily while backup is unconfigured, hourly while the last run is
   failing.

Phase 2 — OneDrive and Google Drive — is designed to a seam here and extracted as its own plan when
this one is promoted.

## Decisions taken here, with their reasons

**Chunked AES-256-GCM, not one-shot, and not CTR-plus-HMAC.** `AesGcm` encrypts a whole buffer in one
call, so a one-shot archive means holding hundreds of megabytes in RAM inside a container whose
memory limit is set in `deploy/README.md`. AES-CTR with an HMAC streams too, but it is two primitives
whose failure modes are ordering and comparison mistakes; per-chunk GCM is one AEAD call per chunk
with the library doing the hard part. The construction is the well-trodden one: a per-archive random
nonce prefix plus a chunk counter, and **the counter and an is-last flag bound as associated data**,
which is what turns "each chunk is authentic" into "no chunk was reordered, dropped, or the file
truncated". A stream that ends without a chunk marked last fails loudly.

**A fresh salt per archive, HKDF from the long-lived key.** So one archive's key is not the secret
that opens every archive ever taken.

**The key is shown once, in the shape of the recovery code.** `RC1-…` already exists
(`src_vs_code/src/recoveryCode.ts`) with Crockford Base32, confusable folding and a checksum, because
the input is a person reading a screen and typing later. The backup key is `BK1-…`, same alphabet,
same checksum construction with its own info string. It is ported to C#, and **both suites assert the
same vectors from one shared file**, so a drift between the two implementations is a red test rather
than a key that will not type in a year.

**The key is sealed under the KEK and stored beside the archives, never inside one.**
`org/backup/key.sealed` is the one file the archive builder skips by name, next to the `*.tmp` rule
it already needs.

**The configuration snapshot includes secrets, deliberately.** The container never sees `.env`, so a
restore on a fresh host has no other way to recover the KEK and the local signing key. That makes the
**backup key the highest-value secret in the system** — higher than the KEK, which is inside the
archive while the backup key is not. This is stated in the module doc and in the admin's UI at the
moment the key is shown, not buried here.

**One list of configuration keys, read twice.** The snapshot must not drift from what `Program.cs`
reads (`:37-74`, `:207-219`). A `ConfigKeys.cs` naming them once, consumed by both, is the only
version of this that survives someone adding a key.

**Nothing is locked while the archive is built.** Every write is already atomic — a rename, so a
reader sees the old file or the new one, never half of one (`VaultStore.cs:301-306`), which is the
same property `backup-once.sh` already relies on. The builder skips `*.tmp` and takes no stripe
locks, because serialising against the vault would buy contention and no correctness.

**Download serves the newest archive from disk; it does not build one inside the request.** Building
takes as long as it takes, and a request that outlives the browser is a download that fails at 90%.
So: a run writes to `org/backup/archives/`, exactly one local archive is kept (the newest), and
`GET /api/org/backup/archive` streams it with a known length. Asking to download when none exists
starts a run and answers `202`, so the button always means something. **This is my decision, not the
owner's** — it is called out in Risks so it can be overruled cheaply.

**The scheduler polls every five minutes rather than sleeping until the hour.** A restart at 02:59
must not skip the 03:00 run; "due" is "this hour, and not already done today in UTC", the shape
`backupSchedule.ts` already uses for the extension's own snapshots. One flag guards overlap and is
shared with "run now", so the manual button answers `409` rather than starting a second build.

**Retention never empties the destination.** Objects older than the window are deleted after a
*successful* upload, and the newest object is never deleted whatever its age — the rule
`backup-once.sh` already encodes, for the failure where a broken build plus an eager retention pass
leaves nothing at all.

**Signed REST, no SDKs.** `Directory.Packages.props` has no cloud SDK, the server publishes Native
AOT, and both signatures are about 150 lines of HMAC. S3 uses SigV4 with the documented
`UNSIGNED-PAYLOAD` sentinel so the body is not hashed twice; Azure uses SharedKey. Both have
published test vectors, which is what makes hand-rolling them defensible: the vectors are the test.

**A single PUT is the phase-1 limit** — 5 GiB on S3, about 4.75 GiB on Azure. Multipart is not built;
a build that exceeds the limit fails with a message naming the limit rather than uploading something
truncated.

**`--decrypt-archive` is a subcommand of the server binary**, intercepted the way `--healthcheck`
already is (`Program.cs:13-18`). A restore then needs the image and the key, not a second tool
somebody has to find in an emergency.

**The restore script does not overwrite `.env`.** It writes `.env.snapshot.restored` beside it and
prints a diff. The snapshot holds resolved values from a host that may not be this host — domain, TLS
mode, secret paths — and silently applying them is exactly the "worse than where the operator
started" outcome the existing restore's rollback exists to prevent.

## The shapes

```csharp
// the archive header, plaintext, before the ciphertext stream
// "CVBK" | version(u16) | salt(16) | noncePrefix(4) | chunkSize(u32) | createdAtUnixMs(i64)

public sealed record BackupStatusDto(bool Configured, IReadOnlyList<string> Targets,
    int ScheduleHourUtc, int RetentionDays, long? LastRunAt, string LastResult, string LastError,
    bool Running, long? LocalArchiveBytes, bool KeyShown);

public sealed record BackupSettingsRequest(IReadOnlyList<BackupTargetRequest> Targets,
    int ScheduleHourUtc, int RetentionDays);

// credentials are write-only: accepted, sealed under the KEK, never echoed
public sealed record BackupTargetRequest(string Kind,        // "s3" | "azure-blob"
    string Endpoint, string Region, string Bucket, string Prefix,
    string? AccessKeyId, string? SecretAccessKey,            // s3
    string? AccountName, string? AccountKey);                // azure
```

## Files

### Server

| File | New/modify | Responsibility |
|---|---|---|
| `src/ConfigKeys.cs` | new | Every `Vault:*`, `Auth:*`, `Logging:*`, `Serilog:*` key, once. |
| `src/BackupConfigSnapshot.cs` | new | `Build(IConfiguration)` over that list — a pure function, one JSON object. |
| `src/BackupArchive.cs` | new | The header, the chunked GCM writer and reader, `System.Formats.Tar` + `GZipStream`. Skips `*.tmp` and `org/backup/key.sealed`; walks `DataDir` plus the log directory; adds the snapshot as one entry. |
| `src/BackupKey.cs` | new | 32 random bytes, the `BK1-` rendering and parser, the shared checksum vectors. |
| `src/BackupStore.cs` | new | `org/backup/settings.json`, `key.sealed`, `status.json`, `archives/`. Atomic writes. |
| `src/BackupRunner.cs` | new | Build → upload to each target → retention → status → event rows. Single-flight. |
| `src/BackupScheduleService.cs` | new | `BackgroundService` + `PeriodicTimer(5 min)`, registered only when configured, never throws out of `ExecuteAsync` — the shape of `ShareMaintenance` and `OrgRecoveryMaintenance` (`Program.cs:119-134`). |
| `src/S3Signer.cs`, `src/AzureBlobSigner.cs` | new | SigV4 and SharedKey, HMAC only, plus `PutObject`/`PutBlob`, `ListObjectsV2`/`List Blobs`, `DeleteObjects`/`Delete Blob`. |
| `src/OrgBackupEndpoints.cs` | new | The five backup routes, as this epic's own extension method. |
| `src/Program.cs` | modify | `--decrypt-archive` beside `--healthcheck` (`:13-18`); the hosted-service registration; one `MapOrgBackupEndpoints` call. |
| `src/AppJsonContext.cs` | modify | Registrations. |
| `deploy/restore-archive.sh` | new | Stop, decrypt to a scratch directory, move the current data aside, move the restored data in, roll back on failure, write `.env.snapshot.restored` and print the diff. |
| `http/org/backup.http` | new | Status, settings, run, download, and each refusal. |

**Endpoints** (all `RequireAdmin`)

| Method | Path | Answers |
|---|---|---|
| GET | `/api/org/backup/status` | `BackupStatusDto`. |
| PUT | `/api/org/backup/settings` | Targets, hour (0–23), retention (≥ 1). Credentials accepted and never returned. First configuration mints the key and returns it **once**; a later read cannot. |
| POST | `/api/org/backup/run` | `202`, or `409` while a run is live. |
| GET | `/api/org/backup/archive` | Streams the newest local archive with a length; `202` and a started run when there is none. |
| POST | `/api/org/backup/key/rotate` | **Not built.** `501` with a sentence saying why: rotating orphans every archive taken under the old key, which is a decision, not a button. |

The download streams from a `FileStream` with sequential-scan hints, never a `MemoryStream` — the
pattern `GET /api/vault` uses for a small blob (`Program.cs:560-575`) must not be copied for a file
this size. The per-caller request limiter (`:190-205`) already bounds how often a download can start;
`ByteBudget` is a write-side control and is deliberately not reused here.

### Extension

| File | New/modify | Responsibility |
|---|---|---|
| `src/orgBackupClient.ts` | new | Status, settings, run, and the streamed download to a path from a save dialog — on epic 1's `corpApiClient`, not a fourth copy of its plumbing. |
| `src/backupNotice.ts` | new, pure | The cadence: once a day while unconfigured, once an hour while the last run failed, silent while healthy; dedupe per account per window, the shape `lockedNotice.ts` uses for its own warnings. |
| `src/commands/accountCommands.ts` | modify | "Server Backup…" on `account-corpAdmin` rows: status, configure a target, run now, download, show the key once. |
| `package.json` | modify | The command and its `when`, on the corp-admin contextValue only. |

The notice check rides the policy fetch of epic 1 — one more field on the status it already reads,
not a second timer.

## Growth

| Surface | Size | Retired by | Interrupted |
|---|---|---|---|
| `org/backup/archives/` | one archive, ≈ the size of `DataDir` (200 vaults × ~2 MB + the log) ≈ 400 MB | the next successful run replaces it; exactly one is kept | a partial build is a `*.tmp` and is swept at startup, the rule `VaultStore.SweepStaleTempFiles` already implements |
| the cloud target | 400 MB × retention (default 10) ≈ 4 GB per target | the retention pass after a successful run; the newest is never deleted | a failed upload leaves the previous objects untouched |
| `status.json`, `settings.json`, `key.sealed` | three small files | overwritten | atomic writes |
| a run's own state | one flag | reset at startup, and a run older than six hours is treated as stale and cleared | the guard is in memory; a crash mid-run leaves a `*.tmp` and a failed status |

### What story 4 added to that budget, as built

The three rows below are the remote surface as it actually shipped, and they belong here rather than in
the commit message because a retention chosen after the first write is a conversation about somebody's
data. The review round was right that the table above described the destination as one line when the
code creates three separate things at it.

| Surface | Projected size | Retired by | Interrupted |
|---|---|---|---|
| archive objects at each target, `<prefix>/cred-vault-<stamp>.cvbk` | 400 MB × retention (default 10) = **4 GB per target**, × the number of configured targets — an unbounded list in `settings.json`, so an admin with four destinations is projecting **16 GB** off-machine | `BackupRunner.PruneAsync` after each SUCCESSFUL upload, over the FULL paginated listing; `ArchiveTargets.Expired` never returns every archive, so a misconfigured window cannot empty a destination | a failed upload prunes nothing at that target — the previous objects stay; the next successful run prunes what this one would have |
| the write probe, `<prefix>/.credvault-write-probe` | **9 bytes**, one per target, and never more than one — the name is fixed, so a re-save overwrites rather than accumulates | deleted by the probe itself in the same call; a target that accepts the write and refuses the delete is REFUSED at save time, naming the object it left behind | the object survives a crash between the two calls. It is 9 bytes of the literal `credvault` and is not a secret; the next save overwrites it, and retention ignores it because it does not match the archive name |
| `status.json`'s `targets` array | one row per configured target per run, rewritten in place after each upload — **not** appended; the file holds the LAST run only, so it is bounded by the target count, not by time | overwritten wholesale by the next run's first status write | a crash mid-run leaves rows for the targets that finished, which is the point of writing them per target; the startup sweep moves the run itself out of `in progress` |

Two things the story deliberately did NOT make grow: cloud credentials are sealed INTO `settings.json`
(one record per target, a few hundred bytes, replaced on edit) rather than into a store of their own,
and no listing is cached — every retention pass re-reads the destination, because a cache of what is at
a target is a second opinion about which archives exist and the expensive way to be wrong.

## The boundary with the plans on either side

Named here **and** in the other document, per
[planning-docs.md](../.claude/rules/shared/common/planning-docs.md) § *A boundary between two plans is
named on BOTH sides*. This is the whole division; anything not in the table belongs to this plan.

| Item | Built by | The other plan's part | Order |
|---|---|---|---|
| the KEK that seals the backup key and every target credential | [PLAN_corp_blocking_login_key.md](PLAN_corp_blocking_login_key.md) | this plan consumes `Vault:LoginKey:Kek` through `KekSeal` and adds no key of its own | that plan first; it shipped 2026-09-05 |
| `RequireAdmin`, the runtime settings file, the corp-admin role | [PLAN_corp_registry_roles.md](PLAN_corp_registry_roles.md) | every route here is behind its guard; this plan adds the `backup` block to the settings file it owns | that plan first |
| the event log and its reader | [PLAN_corp_event_log.md](PLAN_corp_event_log.md) | this plan only APPENDS four kinds (`backup.taken`, `backup.failed`, `backup.key_issued`, `backup.settings_changed`) through `OrgEndpoints.Row`; it owns no reader, no query and no retention over rows | that plan first |
| S3 and Azure Blob targets, their signers, retention at the destination | **this plan** (story 4) | — | — |
| OneDrive and Google Drive targets | [PLAN_corp_backup_drives.md](../todo/PLAN_corp_backup_drives.md), extracted at promotion | it implements the SAME `IArchiveTarget` this plan defines and adds nothing to it; what it needs and this plan does not have is a consent flow and a server-held refresh token | this plan first — the seam is here |
| `deploy/backup.sh` and `deploy/backup/backup-once.sh` | [module_deployment.md](module_deployment.md), already shipped | it stays, and answers a different question: a host-side tar for whoever has a shell. This plan neither replaces nor calls it | already there |

## Build order

1. A spike: `System.Formats.Tar` and `GZipStream` under `PublishAot`, clean, no new suppressions.
2. `ConfigKeys.cs` and `BackupConfigSnapshot.cs` — the smallest independently testable piece.
3. `BackupArchive.cs`: header, chunked GCM, round-trip, tamper and truncation tests.
4. `BackupKey.cs` with the shared vectors, and the sealing under the KEK (needs epic 2).
5. `BackupStore.cs` and the status and settings endpoints (needs epic 1's `RequireAdmin`).
6. `BackupRunner.cs`, run-now, single-flight, the event rows.
7. `BackupScheduleService.cs`, due-math, retention.
8. `S3Signer.cs` against the published vectors, then `AzureBlobSigner.cs` against its documented
   example.
9. `--decrypt-archive` and `deploy/restore-archive.sh`, **rehearsed once end to end** on a scratch
   stack, the way the existing restore was.
10. `http/org/backup.http`.
11. Extension: the client, the QuickPick, the download, the key-shown-once dialog, the notices.
12. Docs: `module_server.md`, `module_deployment.md` (including how this differs from `backup.sh`,
    which stays), `module_extension.md`.

## Test plan

**Server**: an archive round-trips byte-identically, including a `*.tmp` that must be absent and
`key.sealed` that must be absent; one flipped ciphertext byte fails at that chunk and not later; a
dropped final chunk is reported as truncation, not as a shorter archive; the due-math table across
hours, days and a restart; retention selects correctly and never the newest; the admin-only matrix
(no token, wrong domain, member, admin); the signers against published vectors; a run while a run is
live is `409`.

**Extension** (`node:test`): the notice cadence — unconfigured is daily, failing is hourly, healthy
is silent, and the windows reset on success; settings validation for the hour and the retention.

**By hand, once**: configure a target against a real bucket, let the schedule fire, then restore the
archive onto an empty stack and sign in. An archive that has never been restored is a belief.

## Risks

1. **The archive holds everything, and the backup key outranks the KEK.** One file plus one key
   reconstitutes the deployment: every vault ciphertext, the sealed login keys, the KEK that opens
   them, the local signing key. This is the owner's decision, and it belongs on screen when the key
   is shown, not only in a plan.
2. **Download serves the newest archive rather than building one per request** — my call, stated
   above, cheap to overrule.
3. **Cloud credentials become a second class of secret this server custodies.** Every scheduled run
   that authenticates leaves an event row, for the same reason the break-glass log exists.
4. **Hand-rolled signing** is only defensible because the vectors are published and used as tests. If
   a vector cannot be made to pass, the answer is to stop, not to loosen the test.
5. **Phase 2 (OneDrive, Google Drive)** needs a consent flow and a refresh token held by the server —
   a third class of custodied secret and a new failure mode (a revoked grant), which is why it is a
   separate plan rather than a fourth target here.

## Phase 2, to the seam only

`IBackupTarget` — `UploadAsync(stream, name, ct)`, `ListAsync(ct)`, `DeleteAsync(name, ct)` — is what
S3 and Azure implement, and what a drive target will implement. The parts that do not exist yet: the
extension asks the admin to consent through the deployment's existing Entra application or Google
OAuth client with a files scope added, the resulting refresh token is sent once to the server and
sealed under the KEK, and the target refreshes its own access token per run. Retention is the same
list-and-delete over a folder. Extracted as [PLAN_corp_backup_drives.md](../todo/PLAN_corp_backup_drives.md) when this plan is
promoted.

## Definition of Done

- [ ] Both suites green; the tamper and truncation tests were watched failing first.
- [ ] A scheduled run reaches a real bucket, and the retention window prunes it without ever emptying
      it.
- [ ] An archive taken from a live server restores onto an empty stack, and the restored server
      serves a vault to a signed-in client.
- [ ] The key is shown exactly once, is not recoverable from the server afterwards, and the archive
      does not contain it — asserted by a test that greps the built archive.
- [ ] `http/org/backup.http` runs green.
- [ ] `module_server.md`, `module_deployment.md` and `module_extension.md` updated, including why
      `deploy/backup.sh` still exists and what it is for.
- [ ] The `coai` gate: `review_plan` reached `proceed`, `review_code` ran, findings resolved,
      verdicts and reviewer counts reported.
- [ ] `/security-review` run over the archive crypto and both signers.
- [ ] [PLAN_corp_backup_drives.md](../todo/PLAN_corp_backup_drives.md) extracted at promotion.
