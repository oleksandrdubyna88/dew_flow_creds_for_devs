# PLAN — a finished backup run is audited before it says so, and its tests wait for what they assert

> Status: **built 2026-10-02 on `fix/backup-audit-first` (`81d56e47`, `693b7fc9`, the wait helper); code round and PR pending.** Scope: `src_minimalapi_server/src/BackupRunner.cs`
> (the order of the terminal status and the `BackupTaken` row), `src_minimalapi_server/tests/BackupEndpointTests.cs`
> and the shared wait in `src_minimalapi_server/tests/Corp.cs`.
>
> Related: [module_server.md](../research/module_server.md); found while releasing
> extension 1.12.1 / mcp 0.9.1 ([PLAN_rotation_quarantine.md](../research/PLAN_rotation_quarantine.md)).

## 1. The symptom

Two `BackupEndpointTests` failed on 2026-10-02 with no server change between them and a green run:

- **In CI, on release PR #181** (a change to `src_mcp` version files only):
  `RunningTakesAnArchiveAndTheStatusSaysSoAfterwards` —
  *"Expected Corp.Rows(server, OrgEventKinds.BackupTaken) to contain a single item, but the collection is empty."*
  (`BackupEndpointTests.cs:126`). A re-run of the job was green.
- **Locally, the whole server suite under load** (801 tests, parallel):
  `DownloadingStreamsTheArchiveWithALengthAndAFileName` —
  *"Expected condition() to be True because within five seconds the run finished, but found False."*
  (`BackupEndpointTests.cs:209` → `Corp.cs:258`). The test alone and a re-run of the suite were green.

A required check that fails on a change it cannot have been affected by costs a re-run and, worse, teaches
people to re-run red checks without reading them.

## 2. The causes (verified)

1. **The run says "succeeded" before it has audited the success.** `BackupRunner` writes the terminal
   status — `LastResult = Succeeded`, `LastSuccessAt` — at `BackupRunner.cs:458-469`, and only then records
   the `BackupTaken` org event at `:478`. The test waits for the status (`:118-119`, through `Result`,
   `:880-881`) and then asserts the row (`:126`): between the two writes the row does not exist yet. It is
   also a product question, not only a test one: a reader of the status page can see a success that the
   org's audit trail does not show yet, and a crash between the two writes leaves a success with no audit
   row at all.
2. **A fixed five-second wait under a parallel suite.** `Corp.Eventually` (`Corp.cs:251-259`) polls for at
   most five seconds. A detached backup run (key derivation, sealing, writing) under the full suite's load
   can take longer; the run was not wrong, the budget was.

### 2.1 The shared-state trace (done 2026-10-02, before any budget moved)

What a backup run shares with its parallel siblings: each test has its own data directory (`TempDir()`),
its own `BackupStore`, its own run claim and its own event log — none of those is shared. What IS shared,
within one test, is the **status file between its one writer and its readers**: the run writes it, and the
page, the scheduler and the test's own wait poll it. On Windows `File.Move(overwrite: true)` is REFUSED
while any reader has the destination open — measured: 102 to 163 of 200 writes refused under a polling
reader — so the run's terminal status write could fail, and the run ended "failed" or stuck "in progress".
That, not the load, is what the five-second wait was waiting on locally. Fixed at the source
(`VaultStore.MoveIntoPlaceAsync`, `81d56e47`); the 15 s budget below is then only the load's margin.

## 3. The fix

1. **Audit first, then say so.** Record `BackupTaken` before the terminal status is written (move the
   `RowAsync` at `BackupRunner.cs:478` ahead of the `WriteStatusAsync` at `:458`), so a status that says
   `Succeeded` implies the row was appended and flushed first. That covers a PROCESS crash between the
   two writes: the audit row is there and the status is still "running", which the startup sweep turns into
   a terminal state — it claims nothing about power loss or a storage failure, which the event log's own
   contract does not cover either. **The existing contract stays** (CodeRabbit on #183):
   `OrgEventLog.AppendAsync` does not throw, it returns `false`, and a backup whose audit row could not be
   written is still `Succeeded` — the archive is real — which
   `AnEventLogThatCannotBeWrittenToDoesNotTurnAGoodRunIntoAFailedOne` pins and keeps pinning unchanged. So
   "`Succeeded` implies the row" holds whenever the log could be written; when it could not, the run is
   still `Succeeded` and the failure is logged, never stuck "running" (rule 8: durable status).
2. **First, rule out shared state** (plan round, finding 1 — the repository's rule: *passes alone, fails in
   the suite is a shared-state defect until shown otherwise*). Trace what `DownloadingStreamsTheArchive…`
   shares with its siblings during a parallel run — data directories, the backup store and its run claim,
   static locks or caches in `BackupRunner` / `BackupStore`, the key derivation — and record what was
   found. Only if every per-test resource is isolated is the cause load, and only then does the wait move.
3. **A wait with a budget that names the load — in ONE place** (plan round, finding 0). Give
   `Corp.Eventually` an explicit budget parameter (default unchanged), and give `BackupEndpointTests` ONE
   helper that waits for a detached run to finish with 15 s, through which EVERY backup wait in the file
   goes (the two that failed and every sibling that waits for `Result`), so the guard still fails a run that
   never finishes, with the load's margin. Its failure message names the
   budget it was given (`within {budget} {what}`), so a 15-second timeout never reads "within five seconds"
   (CodeRabbit on #183); the default still reads five seconds.

## 4. Build order and tests

1. RED: a test that reads the status the moment it turns `Succeeded` and asserts the `BackupTaken` row is
   already there — the OBSERVABLE symptom of the CI failure, not a call order. The window is widened with a
   delay hook scoped to THAT test's own server (its `WebApplicationFactory` / DI registration of the event
   log), never a static or production seam in `BackupRunner.cs` (plan round, finding 2) — so no parallel
   sibling is slowed. Red today; then move the row write; GREEN; break-it by moving it back.
2. Guard, green before and after: `AnEventLogThatCannotBeWrittenToDoesNotTurnAGoodRunIntoAFailedOne` —
   an audit append that returns `false` leaves the run `Succeeded`, not stuck — unchanged.
3. `Corp.Eventually(condition, what, budget)` with the default kept and the budget in its message; the
   two backup waits pass 15 s. No assertion changes.
4. Run the server suite via its test executable (`CredVaultServer.Tests.exe`, never `dotnet test`) three
   times under load in BOTH Debug and Release (plan round, finding 3 — the change touches ordering); all green.

## 5. Docs

`research/module_server.md`: the order — audit row,
then terminal status — and why. CHANGELOG of the server if it keeps one.

## 6. Definition of Done

Built on Opus 5.5 (the plan's implementing agent found the shared state; the main session finished it after the agent's session limit). Server suite: 804/804 three runs in Debug and three in Release.


- [x] `BackupTaken` is recorded before the terminal `Succeeded` status; RED → GREEN → break-it recorded.
- [x] An audit append that returns `false` still leaves the run `Succeeded` and never stuck (the existing
      test, unchanged).
- [x] `Corp.Eventually` takes a budget; the backup waits use 15 s; no assertion edited.
- [x] The shared-state trace recorded (what is shared, what is isolated) before any budget changed.
- [x] Every backup wait in `BackupEndpointTests` goes through one helper with the 15 s budget.
- [x] The server suite green three runs in a row under load, Debug and Release, via the test executable.
- [ ] Module docs updated; coai plan round and code round `proceed`; plan promoted when done.
