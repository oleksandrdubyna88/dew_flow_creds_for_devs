# PLAN — three roads of the person delete the key file they wrote (N16)

> Status: **IMPLEMENTED, 2026-11-17.** Extension 1.22.2 (#373, squash 4020515e; release PR #374). Epoch 1, one change (1.1).
> Split into three stories (`## Stories`), S2 the cornerstone; the two security specs by Fable. Deviations: §8.
> Scope: the extension only (`src_vs_code/src`): the bridge
> socket check, *Install creds on host* and *Open Remote Bridge…* in `commands/agentCommands.ts`, the bridge spawner of
> `extension.ts` (its exported function lives in a module of its own, `bridgeSpawner.ts`), one small new helper module
> (`writtenKey.ts`), their tests, the docs. Found as N16 of
> [PLAN_agent_refusal_key_file_path.md](PLAN_agent_refusal_key_file_path.md) (§13) by the lead's Opus review
> on 2026-11-12, by reading. The next plan after N17 in the order the question consultants advised on 2026-11-15
> (`ad7ce1a5`).

## Plan changes

> Epoch 1 · approved 2026-11-16 · by reviewers · state: open

  (The plan round's four accepted findings were folded in at its resolve, before approval, and are not entries: the
  whole span of the bridge guarded, the `'error'` of a started child, the real-file test.)
  (The split into three stories with no epics was ordered by the same gate at that approval. It is the baseline of
  epoch 1, not an entry: `## Stories`.)

- 1.1 · 2026-11-16 · reviewer · approach — the `'error'` of a bridge's child: the spawner hands every `'error'` to a
  reporter that `extension.ts` points at the diagnostic log (`bridge`, the error's text), so a failed start keeps its
  cause (`spawn ssh ENOENT`; before, an uncaught exception of the host) and a started child's error is seen; it still
  settles `exited` only when the child never started. And §2.4 is narrowed: a started child whose `kill()` fails and
  that never exits keeps its key until the purge (`stop()` drops the row before the kill, `sshBridgeManager.ts:81-89`,
  so `dispose` cannot retry it); the synchronous purge on the window's dispose (`extension.ts:222-223`) and the next
  activation retire it, best effort. Raised by the cadence consultant (`e7ead04b`) before the build; checked by
  reading. A retry of a failed kill is not built.

## 1. Symptom

`resolveExecAuth` (`sshExecAuth.ts:115`) writes a stored key to `keys/<pid>/call-<uuid>.key` and returns its path as
`materialized` (`sshExecAuth.ts:161-162`); the field says "only that caller may delete it" (`:37`). Three callers in
`commands/agentCommands.ts` never read `materialized` and never delete the file (the file has no
`forgetMaterializedKey`):

| Road | Where | What runs | How long the key stays today |
|---|---|---|---|
| the bridge socket check `verifyBridgeSocket` | `agentCommands.ts:208-262`, the resolve at `:217` | two short `ssh` runs (the sweep and the mode check, 15 s timeout each) after a 1.5 s pause | until the window ends |
| *Install creds on host* (`credSshManager.installRemoteCli`) | `:274-342`, the resolve at `:287` | a probe run (20 s), a modal question, the install run (up to 180 s) | until the window ends |
| *Open Remote Bridge…* (`credSshManager.openRemoteBridge`) | `:394-484`, the resolve at `:437`, the spawn at `:463` | one long-lived `ssh -R` started by `SshBridgeManager.start` (`sshBridgeManager.ts:65-79`) | until the window ends, also after the bridge has ended |

Each start of a bridge writes two files (the bridge's and the check's, `:471` resolves again), and each click of the
install writes one. They stay until `purgeMaterializedKeys` of a later activate or deactivate. The product's own rule
is that a key is on disk only while an `ssh -i` needs the path (`research/module_extension.md:6134`, the row *SSH
private key on disk*). No agent reads these paths (the parent's §13); this is the person's own key on the person's own
disk, an old defect, not a leak to an agent.

A second, older fault on the bridge road: the real spawner (`extension.ts:188-194`) builds `exited` from the child's
`'exit'` event only. When `ssh` cannot start (`ENOENT`), Node emits `'error'` and may emit no `'exit'`: `exited` never
settles, the row stays *bridged*, and with no `'error'` listener the event is thrown in the extension host. A cleanup
that waits for `exited` would wait forever there.

## 2. Fix

The rule, the same as the solved instance `sshUseActions.ts:283-300` (a `finally` around the run): **the caller that
got `materialized` deletes it when no `ssh` of its own will read the path again.** `forgetMaterializedKey`
(`keyInstaller.ts:262`) never throws. A credential with no `materialized` (a key given as a path, a password, the agent)
deletes nothing: the extension did not write it.

### 2.1 The two bounded roads (S1)

- **The socket check:** a `try … finally` from the resolve to the end; the `finally` forgets `credential.materialized`.
  Every early return after the resolve (`argv === undefined`, a `missing` or `unreadable` probe) and a throw pass
  through it.
- **The install:** the same, from the resolve to the end of the handler: the probe's timeout, a blocker, the person's
  *no* to the modal question, an install that fails or succeeds all forget the key. The key stays while the modal
  question is open (the person answers it; the install run after a *yes* needs the same key). Resolving a second time
  after the answer was decided against: it can open the PIN dialog twice.
- **One helper for both**, in a new small module beside the caller (named in the spec), e.g.
  `withWrittenKey(credential, run)`: runs `run` and forgets `credential.materialized` in a `finally`. It is the one
  place the rule is spelled for these roads, so a test can import it and a mutation can remove it.

### 2.2 The bridge (S2)

- **The whole span is guarded.** From the resolve until the continuation below is attached, the command owns the key:
  a `try … finally` with a flag set only after that attach forgets `credential.materialized` on every other exit (no
  argv, a throw while the argv is built, a throwing `start`, any early return), and a throw is rethrown unchanged (the
  plan round, antigravity and codex).
- After `bridges.start(...)` returns, the bridge's own `process.exited` gets one continuation that forgets THIS call's
  `materialized`. It is attached to the returned process, not to the manager's `onEnded`: `stop()` deletes the map row
  before it kills the process, and a replacement suppresses the old bridge's `onEnded` (`sshBridgeManager.ts:69-78`,
  `:81-89`), so `onEnded` does not fire on every end. `exited` resolves on the process's end whatever ended it (its
  own end, *Close*, a replacement, the window's `dispose`).
- **Why not delete after authentication** (the question consultants, 2026-11-16, `f4c62413`, both): a plain `ssh -N`
  gives no clean signal that it has authenticated; a timer races a slow login or a jump host, and parsing `-v` output or
  a `ControlMaster` is new machinery for a cleanup. The process's end is observable and testable. The cost: the key
  stays while the bridge lives (hours possibly), as a Connect terminal's key stays while its terminal lives.
- **The spawner settles on a failed start:** the real spawner moves out of `activate` into an exported function (the
  spawn options do not change: `windowsHide`, `stdio: 'ignore'`, the resolved env), and `exited` also settles with
  `null` on the child's `'error'` **when the child never started** (`child.pid === undefined`), once. An `'error'` of a
  started child (Node also emits one when a kill fails) settles nothing: the process may still run and read its key,
  and its `'exit'` settles `exited` later (the plan round, codex). A failed start then ends like any other end: the manager drops the row and
  calls `onEnded` (a log line and a tree refresh), and the key goes. A behaviour change, on purpose: today such a
  bridge stays *bridged* in the tree forever.
- **Every `'error'` of the child goes to a reporter** (change 1.1). The listener above takes the event, which today is
  an uncaught exception of the extension host; without more, a failed start would lose its cause (`spawn ssh ENOENT`)
  and a kill that failed would be seen by nobody. So the spawner is handed a reporter, `(error: Error) => void`, and it
  is required: a spawner made without one does not compile. Every `'error'` is handed to it, of a child that never
  started and of a started one alike. `extension.ts` points it at the diagnostic log: `log.warn('bridge', …)`, one
  line that says the `ssh` of a bridge did not start or could not be stopped, and the text of the error
  (`describeError`). The line never holds the argv: Node's error object carries it, and the argv of a bridge names the
  key file. The report changes nothing of the settle: `exited` still settles only when the child never started, and it
  settles before the reporter is called, so a reporter that throws cannot keep a key file on the disk.

### 2.3 The file size

`commands/agentCommands.ts` is at 800 lines, and lint enforces `max-lines: 800` (`eslint.config.mjs:30`, an error).
The imports that name one symbol per line from the same module (ten from `../sshBridge`, six from `../remoteCliInstall`,
five from `../cliAliases`) are grouped into one import each; the file already groups imports elsewhere (four lines) and
so do the other command files (`commands/runCommands.ts:4`). The import request strings do not change, so no test's
module mock changes. (The question consultants, `19c18f3e`: codex for grouping; gemini for moving the socket check out,
with grouping as the answer when other files group imports and no lint rule forbids it, which is the case. Moving the
socket check is not done here.)

### 2.4 What grows, and who retires it

| What | How many, after this plan | Who retires it | When it is interrupted |
|---|---|---|---|
| a `call-<uuid>.key` of a socket check | one while that check runs (at most about 32 s: 1.5 s plus two runs of 15 s), none after | the check's `finally` | a killed window leaves `keys/<pid>/`; `purgeMaterializedKeys` (`keyInstaller.ts:280`) of the next window that activates or deactivates removes it |
| a `call-<uuid>.key` of an install | one while that install runs or its question is open, none after | the handler's `finally` | as above |
| a `call-<uuid>.key` of a bridge | one per LIVE bridge; a bridge is one per entry (`start` replaces). Plus one per `ssh` that a failed kill left running (change 1.1, below) | the continuation on that bridge's `exited` | as above; `dispose` kills every bridge, and each `exited` settles when its killed `ssh` has ended. **Narrowed (change 1.1):** a STARTED child whose `kill()` fails and that never exits keeps its file. `stop()` drops the row before the kill (`sshBridgeManager.ts:81-89`), so `dispose` cannot try again, and a retry of a failed kill is not built. The failed kill is in the log (§2.2). The synchronous purge on the window's dispose (`extension.ts:222-223`) and the purge of the next activation retire the file, best effort |
| a continuation on `exited` | one per started bridge | it runs once when the process ends | ends with the extension host |

**Projected size.** A key file is about 0.4 kB (ed25519) to 3.3 kB (RSA 4096). A heavy window with 10 open bridges, one
socket check and one install running holds 12 files, at most 12 × 3.3 kB ≈ 40 kB. Today the same window, after 50
bridge starts and 20 installs, holds 120 files (≈ 400 kB) until it ends; after this plan the count is bounded by the
bridges open now, plus the `ssh` processes that a failed kill left running (change 1.1; one file each, until the
purge of the window's dispose or of the next activation; a kill that fails is rare and is in the log).

### 2.5 What does not change

`sshExecAuth.ts`, `keyInstaller.ts`, `materializedKeys.ts`, `sshBridgeManager.ts`'s rules (start, stop, dispose,
`onEnded`), any purge, the argv of every `ssh`, every sentence a person sees. PR #365 touches `sshExecAuth.ts` and
`materializedKeys.ts` but not `agentCommands.ts` or the spawner (checked with `gh pr diff 365 --name-only`).

## 3. Tests (RED first)

Each new assertion is watched RED on `main`'s code, then GREEN. The commands are driven as the extension registers them
(`registerAgentCommands` with a stubbed `vscode` and module mocks, the pattern of `test/forgetAgentConsents.test.ts`),
with `../sshExecAuth` returning a credential whose `materialized` is a known path and `../keyInstaller`'s
`forgetMaterializedKey` recording what it was given.

1. **The socket check** forgets the written key after a normal check, after a `missing` probe, after `argv ===
   undefined`, and after the runner throws; it forgets nothing when the credential has no `materialized`.
2. **The install** forgets the written key after a success, a failed install, the probe's timeout, a blocker, and the
   person's *no*; it does not forget it before the install run when the person says *yes* (the run is given the same
   path); nothing is forgotten for a credential with no `materialized`.
3. **The bridge**: right after the command returns the key is NOT forgotten; when the bridge's `exited` settles, it is
   forgotten once; *Close* and a replacement (a second open of the same entry) forget the first bridge's key and not
   the second's; no argv forgets it at once; a throw while the argv is built and a throwing `start` forget it and
   the command's promise rejects with the same error.
4. **The spawner**: a fake child that emits `'error'` settles `exited` with `null`; one that emits `'exit'` with its
   code; one that emits both settles once with the first; a STARTED child
   (it has a `pid`) that emits `'error'` settles nothing, and its later `'exit'` settles `exited` with its code.
   The reporter (change 1.1): the error of a child that never started is reported AND settles `exited` with `null`;
   each error of a started child is reported and does NOT settle `exited`; a reporter that throws does not keep
   `exited` from settling; the log line holds the text of the error and never the argv; `extension.ts` hands the
   spawner a reporter that writes that line to the `bridge` log (read from the source, as the other wiring scans do).
4a. **A real file** (the plan round, codex): one road per kind (the socket check and a bridge) runs with the REAL
   `forgetMaterializedKey` and a key file written into a temporary `keys/<pid>/`; the file is gone after the check
   finishes and after the bridge's `exited` settles. A failed delete stays silent, as on every road today
   (`forgetMaterializedKey` is best effort); the purge of §2.4 is what retires such a file.
5. **Mutation checks** (by hand, recorded in the commit body): remove each of the four forgets in turn → its test is
   red; attach the bridge's forget to `onEnded` instead → the *Close* and replacement tests are red; drop the `'error'`
   listener → test 4 is red; drop its `pid` condition → the started-child case of test 4 is red; set the bridge's
   flag before `start` → the throwing-`start` test is red. The reporter (change 1.1): drop the call of the reporter →
   the report tests are red; report only when the child never started → the started-child report test is red; report
   before the settle → the throwing-reporter test is red; hand the spawner a reporter that does nothing in
   `extension.ts` → the wiring test is red; build the log line from the whole error object → the log-line test is red.
6. The whole extension suite (`npm test` in `src_vs_code`), lint (`max-lines` included) and the build green before the PR.

## 4. Docs

- `src_vs_code/CHANGELOG.md`, `[Unreleased]`: a security entry (the three roads delete their key; a bridge whose `ssh`
  cannot start ends instead of staying *bridged*).
- `research/module_extension.md:6134`, the row *SSH private key on disk*: the socket check and the install delete their
  file when they finish, a bridge when its `ssh` ends. The bridge's own section gets the spawner's `'error'` sentence.
- `research/module_tests.md`: the new test file and what it holds.
- At promotion: the N16 line of [PLAN_agent_refusal_key_file_path.md](PLAN_agent_refusal_key_file_path.md)
  gets its "Fixed in" text; the `todo/README.md` rows move to `research/README.md`.

## 5. Out of scope

- Deleting a bridge's key before the bridge ends (§2.2: no signal).
- Moving the socket check or the install out of `agentCommands.ts` (§2.3).
- The other open notes of N17: F1 (the `suffix` parameter, after #365), F3 (`keyEntityId` unread), F4, F5.
- The forwarded own agent of the three clicks ([PLAN_ssh_exec_own_agent_forwarding.md](../todo/PLAN_ssh_exec_own_agent_forwarding.md)).

**Found during the build, not built here** (the lead's Opus review of S2 and a Fable security pass of the whole diff,
2026-11-16; each read in code unless it says run; all older than N16):

- **G1 (medium).** The three roads do not enforce the entry's pinned host key: they pass no `knownHostsFile`, so `ssh`
  runs with `StrictHostKeyChecking=accept-new` against `~/.ssh/known_hosts` (`sshBridge.ts:164-167`,
  `sshExecCommand.ts:146-148`), where the agent's exec uses the pin (`sshUseActions.ts:224`). Another machine at that
  address is accepted on first contact. Its plan, written 2026-11-17 and not built yet:
  [PLAN_person_roads_pin_host_key.md](../todo/PLAN_person_roads_pin_host_key.md); it is built after G2's plan.
- **G2 (medium if it holds, not measured).** The bridge's argv does not turn connection sharing off (`sshBridge.ts:156-161`
  has no `ControlPath=none`/`ControlMaster=no`); with `ControlMaster auto` + `ControlPersist` in the person's config the
  `-R` forward may live in a master that *Close* and the window's dispose do not kill. The key is not needed after login,
  so N16 is not affected.
- **G3.** The Windows facts of the spawner (ENOENT with no `pid`, the delete after exit) are read, not run: the extension
  suite runs on Ubuntu; `bridgeSpawner.test.ts` could join a windows-latest step.
- **G4.** A password with a NUL byte makes the spawn throw a message that quotes the environment value; on the agent's
  exec `describeError` puts it into the refusal the agent reads (`sshUseActions.ts:295-296`; run with the compiled
  modules). Fix in `byPassword` (`sshExecAuth.ts`).
- **G5.** `materializePrivateKey` leaves a partial or un-chmodded key when the write or `chmodSync` throws (no
  `materialized` is returned, so no guard deletes it; F4 of N17, fixed by #365's `withoutPartialKey`).
- **G6.** A failed delete is silent (`forgetMaterializedKey`); and `removeKeyFile` (`sshUseActions.ts:232-243`) logs
  `describeError`, which holds the key file's path, though its comment says it does not.
- **G7.** The socket check resolves with no opener, so for a PIN-protected entry it is skipped without a word.
- **G8.** When `ssh` never starts, the person still sees *Bridge open to …* (the error arrives a tick after `start`); only
  the log and the row say otherwise. The reporter is handed the raw `Error`, whose `spawnargs` hold the argv; the
  product writes only its message (P12), a later reporter could print more.

## 6. Definition of Done

- [x] The three roads forget the key they wrote, on every exit path of §2.1 and §2.2, and only a key they wrote.
- [x] The spawner's `exited` settles on `'error'`; a failed start ends the bridge row.
- [x] `agentCommands.ts` at most 800 lines, lint green.
- [x] The tests of §3 RED first, then GREEN; the mutation checks recorded.
- [x] The docs of §4.
- [x] The coai code gate at `proceed`; the lead's Opus review; CI green on the head sha; CodeRabbit read.
- [x] Released as an extension patch with the owner's word; the plan promoted.

## 8. Deviations

What shipped differently from the plan as approved (5d49cc9b):

1. **Change 1.1** (the cadence consult `e7ead04b`, before the build): the spawner reports every `'error'` of its child to the
   diagnostic log, and §2.4's bound was narrowed for a started child whose kill fails and that never exits (its key stays until the purge); a child that
   exits later settles `exited`, and its key is deleted then.
2. **A second new module.** The spawner lives in `bridgeSpawner.ts`, beside the helper `writtenKey.ts`; the question consultants
   (`72e7e3c9`) both read it as placement of the approved move, not a change. `.size-baseline.json` went 981 → 975.
3. **The reporter must not throw** (the lead's Opus review of S2): Node emits a failed kill's `'error'` inside `child.kill()`,
   so a throwing reporter would leave `stop()`/`dispose()` halfway. Documented on `BridgeErrorReport`; latent, the product's
   reporter is the log, which never throws.
4. **Tests added after the S1 review:** C3 asserts its road, C3b (a wide socket mode), U3b (a password credential), R1 and B9
   use `ownedFile`, and the test world builds its bridge manager without an `as never` cast.
5. **Rejected in the code rounds, with reasons:** moving `forgetMaterializedKey` out of a module that imports `vscode`
   (twice; out of scope, and #365 changes its natural home); a timeout on the bridge process (a bridge is long-lived by
   design); reporting a rejected `exited` (it cannot reject); a person-facing message for a failed start (older
   behaviour, a change of the command's sentences; G8).
6. **Checked: Linux, with real processes (a missing program, a live child, a real `ssh` with no answer) and real files.
   Not checked: Windows and an authenticated `ssh`** (no `sshd` here); the Windows facts are read from Node's contract (G3).
7. **Open after this plan:** G1-G8 of §5 (G1 and G2 medium: the three roads do not enforce the pinned host key; the bridge
   does not turn off connection sharing).

## 7. Build order and merge conditions

1. This plan through the coai plan gate (`review_plan` → `resolve` until `proceed`).
2. The split into three stories (`## Stories`, below; no epics and no stories document, by the gate's order) and the two
   security specs by Fable: [PLAN_person_roads_forget_key_S1_spec.md](PLAN_person_roads_forget_key_S1_spec.md) and
   [PLAN_person_roads_forget_key_S2_spec.md](PLAN_person_roads_forget_key_S2_spec.md); the cadence consult the gate
   orders, BEFORE the build.
3. S1, then S2 (the cornerstone), each RED → GREEN, by a Sonnet coder, each from its spec; the lead's Opus review of
   each. Then S3, the documents, from its brief in `## Stories`.
4. `review_code` over the whole diff → `resolve` until `proceed`.
5. One PR (a squash merge) after the head sha's checks exist and pass. The repository has five open PRs; a sixth needs
   the owner's word.
6. The release (a patch) with the owner's word, then the promotion PR.

## Stories

Split straight into three stories, no epics (the coai plan gate's order at the approval of 2026-11-16: three to five
stories, no epics, at most one cornerstone; the question consultants advised this split, consult `15dd230a`, both
answers agree). One branch `fix/n16-forget-person-keys`, one PR, one code round over the whole diff. There is no stories
document. S1 and S2 handle a decrypted key on disk, so each has a security spec that Fable writes before its code (the
row *Security judgement* of `subagent-models.md`, outside the quota); S2 is also the one cornerstone. Per story: the
spec or brief first, then a Sonnet coder (tests RED first, then the code), then the lead's Opus review. The two specs
keep no change ledger: a change of one is an entry here. They promote together with this plan.

### S1 — The two bounded roads delete their key file

- **Goal.** The bridge socket check and *Install creds on host* delete the key file that `resolveExecAuth` wrote for
  them, on every way out (§2.1), and only a file that was written for them.
- **Scope.** `commands/agentCommands.ts`: the imports of `../sshBridge`, `../remoteCliInstall` and `../cliAliases`
  grouped (§2.3; 800 → 782 lines), `verifyBridgeSocket` and the handler of `credSshManager.installRemoteCli` run inside
  the helper (787 lines after S1). New `src/writtenKey.ts`: `forgetWrittenKey(credential)` and
  `withWrittenKey(credential, run)`. Tests: new `test/personRoadsWorld.ts` (the real registered commands over a stubbed
  `vscode`, the real `SshBridgeManager`), new `test/personRoadsForgetKey.test.ts` (tests 1, 2 and the socket-check half
  of 4a of §3), new `test/writtenKey.test.ts`. No document (S3). Two commits: the imports alone, then the rest.
- **Depends on.** Nothing unmerged (PR #365 does not touch these files).
- **Done when.** The twelve RED scenarios of the spec were watched failing on the unchanged code and pass; its two
  guards pass before and after; its seven mutations each turned red what the spec names and were restored;
  `agentCommands.ts` has 787 lines; typecheck, lint and the whole suite green.
- **Spec.** [PLAN_person_roads_forget_key_S1_spec.md](PLAN_person_roads_forget_key_S1_spec.md) (Fable, 2026-11-16).
- **model:** fable writes the spec; sonnet codes; opus reviews.

### S2 — A bridge's key file goes when its `ssh` ends, and a start that fails ends (CORNERSTONE)

- **Goal.** The key file that *Open Remote Bridge…* wrote is the command's to delete until the bridge's `ssh` holds it,
  and is deleted when THAT `ssh` has ended, whatever ended it; the real spawner's `exited` always settles, so that end
  always comes (§2.2).
- **Why one story, and why the cornerstone.** The command is the consumer of the guarantee "`exited` always settles" and
  the spawner is its producer. Built apart, a cooperative fake lets the command's tests pass while the real spawner
  never settles on a failed start, and the key then stays for the life of the window. So both halves are specified,
  built and verified together, with a real process in the tests.
- **Scope.** `src/writtenKey.ts`: `withWrittenKeyUntilExit(credential, start)`. `commands/agentCommands.ts`: the
  handler of `credSshManager.openRemoteBridge` from its resolve to `bridges.start` (794 lines after S2). New
  `src/bridgeSpawner.ts`: `bridgeSpawner(parts)` and `bridgeProcessOf(child)`, moved out of `activate` first, word
  for word, and then changed: `exited` settles on a failed start, and every `'error'` goes to a required reporter
  (`parts.report`, `bridgeProcessOf(child, report)`; the log line is `describeBridgeError(error)`; change 1.1);
  `extension.ts` calls it and hands it the reporter (981 → 975 lines, `.size-baseline.json` lowered). Tests: new
  `test/bridgeKeyHandoff.test.ts` (test 3 and the bridge half of 4a of §3), new `test/bridgeSpawner.test.ts` (test 4,
  two real processes, the wiring of `extension.ts`), `test/writtenKey.test.ts` extended. No change of
  `sshBridgeManager.ts`. Two commits: the move alone, then the rest (both halves in one commit).
- **How two sentences of §3 are built.** "A replacement (a second open of the same entry)": an ordinary second *Open*
  of an open bridge asks *Keep it open* / *Close the bridge* and starts nothing (`agentCommands.ts:403-413`), so the
  replacement is two *Opens* of one entry that overlap, both past the open check before either has started (the spec's
  B4); the ordinary second *Open* is B3. "Remove each of the four forgets": the four are the socket check's and the
  install's guard (S1, M1 and M2), the continuation on `exited` (N1) and the delete at once (N2).
- **Depends on.** S1 (`writtenKey.ts`, the world, the headroom under 800 lines).
- **Done when.** The spawner was moved with no change of behaviour and the suite stayed green; the spec's sixteen RED
  scenarios were watched failing and pass, its four guards pass before and after; *Close* alone deletes nothing in a
  test whose process ends only when the test says so; the two real-process tests pass, and the real failed start is
  reported; its sixteen mutations each turned red what the spec names and were restored; `agentCommands.ts` has 794 lines; typecheck, lint, the ratchet and
  the whole suite green.
- **Spec.** [PLAN_person_roads_forget_key_S2_spec.md](PLAN_person_roads_forget_key_S2_spec.md) (Fable, 2026-11-16).
- **model:** fable writes the spec (the cornerstone, and security judgement); sonnet codes; opus reviews.

### S3 — The documents

- **Goal.** The documents say what S1 and S2 built (§4).
- **Scope, which is also the brief** (no spec; one commit; no code):
  1. `src_vs_code/CHANGELOG.md`, under `## [Unreleased]`, one entry with the heading
     `### Changed — security: a bridge, its socket check and Install creds on host delete their key file`. It says, in
     plain sentences: these three roads write the stored key to a `call-<uuid>.key` for their `ssh`; before, none of
     them deleted it, so each start of a bridge left two files and each install one, until the window ended; now the
     socket check and the install delete their file when they finish, on every way out, and the file of a bridge is
     deleted when its `ssh` has ended (by itself, by *Close Remote Bridge*, by a newer bridge of the same entry, or
     with the window); the file of a bridge stays while the bridge is open; a key file of your own (an entry that
     names a key file by its path) is never deleted. A second paragraph: a bridge whose `ssh` cannot start (`ssh` is
     not installed, for example) now ends, and its row goes back to *Open Remote Bridge…*; before, it stayed
     *bridged* until the window ended. The diagnostic log says why it did not start. No version heading: the release writes it.
  2. `research/module_extension.md`, the row *SSH private key on disk* of the table *Secrets at rest and in flight*
     (`:6134`): add that the bridge socket check and *Install creds on host* delete their file when they finish, and
     that a bridge's file is deleted when its `ssh` has ended. Keep every sentence the row has.
  3. `research/module_extension.md`, the paragraph **The refresh is the load-bearing half.** of the bridge pair
     (`:2575-2579`): add the spawner's sentence: the bridge's `ssh` is started by `bridgeSpawner` (`bridgeSpawner.ts`);
     its `exited` settles on the child's `'exit'`, and also, with `null`, on the `'error'` of a child that never
     started (it has no `pid`), so a start that fails ends the bridge like any other end (`onEnded`, the row back to
     *Open*) and the key file goes; the `'error'` of a started child settles nothing. Every `'error'` is handed to a
     reporter that `extension.ts` points at the diagnostic log (`describeBridgeError`: one sentence and the text of
     the error, never the argv). And the bound that stays (§2.4): a started `ssh` whose kill fails and that never
     exits keeps its key file until the purge. Add one sentence on
     `writtenKey.ts`: the one place where the rule "the caller that got `materialized` deletes it" is written for
     these three roads.
  4. `research/module_tests.md`: a new section `## A bridge, its socket check and the install delete their key file
     (N16)` after the last section about SSH key files, naming `personRoadsWorld.ts` and the four test files with
     their counts (read from the runner, not from the specs), what each proves, the real pieces (the registered
     commands, `SshBridgeManager`, one real key file per kind, two real processes), and what none of them proves: no
     real `ssh`, no real host, Windows only by reading, and a key file whose delete fails stays until the purge of
     §2.4.
  5. This plan: tick §6; record in the status paragraph what was built. Nothing else of this plan changes.
- **Depends on.** S1 and S2 (their final names, counts and line numbers).
- **Done when.** Every sentence of 1 to 4 describes code that is on the branch (each name grepped);
  `node .agents/conventions/tools/plan-lifecycle.mjs` is clean; no sentence names a version, a sha or a count that the
  next commit moves, except the test counts of 4.
- **model:** the brief is the list above (Fable wrote it with the split); sonnet writes the documents; opus reviews them.

Cornerstones: 1 of 1 — S2
