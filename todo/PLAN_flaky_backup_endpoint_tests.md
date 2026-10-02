# PLAN — a finished backup run is audited before it says so, and its tests wait for what they assert

> Status: **plan only, nothing implemented yet, 2026-10-02.** Scope: `src_minimalapi_server/src/BackupRunner.cs`
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
2. **A wait with a budget that names the load.** Give `Corp.Eventually` an explicit budget parameter
   (default unchanged) and pass a longer one (15 s) for the detached backup run's completion, so the
   guard still fails a run that never finishes, with the load's margin. Its failure message names the
   budget it was given (`within {budget} {what}`), so a 15-second timeout never reads "within five seconds"
   (CodeRabbit on #183); the default still reads five seconds.

## 4. Build order and tests

1. RED: a test that reads the status the moment it turns `Succeeded` and asserts the `BackupTaken` row is
   already there (poll the status, and on the first `Succeeded` read the rows in the same step) — red
   today by construction when the window is widened (a test seam that delays the row write, or the
   runner's own order asserted). Then move the row write; GREEN; break-it by moving it back.
2. Guard, green before and after: `AnEventLogThatCannotBeWrittenToDoesNotTurnAGoodRunIntoAFailedOne` —
   an audit append that returns `false` leaves the run `Succeeded`, not stuck — unchanged.
3. `Corp.Eventually(condition, what, budget)` with the default kept and the budget in its message; the
   two backup waits pass 15 s. No assertion changes.
4. Run the server suite via its test executable (`CredVaultServer.Tests.exe`, never `dotnet test`) three
   times under load; all green.

## 5. Docs

`research/module_server.md`: the order — audit row,
then terminal status — and why. CHANGELOG of the server if it keeps one.

## 6. Definition of Done

- [ ] `BackupTaken` is recorded before the terminal `Succeeded` status; RED → GREEN → break-it recorded.
- [ ] An audit append that returns `false` still leaves the run `Succeeded` and never stuck (the existing
      test, unchanged).
- [ ] `Corp.Eventually` takes a budget; the backup waits use 15 s; no assertion edited.
- [ ] The server suite green three runs in a row under load, via the test executable.
- [ ] Module docs updated; coai plan round and code round `proceed`; plan promoted when done.
