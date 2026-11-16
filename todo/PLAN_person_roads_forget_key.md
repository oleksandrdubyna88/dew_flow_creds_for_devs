# PLAN — three roads of the person delete the key file they wrote (N16)

> Status: **plan only, nothing implemented yet, 2026-11-16.** Scope: the extension only (`src_vs_code/src`): the bridge
> socket check, *Install creds on host* and *Open Remote Bridge…* in `commands/agentCommands.ts`, the bridge spawner of
> `extension.ts`, one small new helper module, their tests, the docs. Found as N16 of
> [PLAN_agent_refusal_key_file_path.md](../research/PLAN_agent_refusal_key_file_path.md) (§13) by the lead's Opus review
> on 2026-11-12, by reading. The next plan after N17 in the order the question consultants advised on 2026-11-15
> (`ad7ce1a5`).

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

### 2.1 The two bounded roads (E1.S1)

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

### 2.2 The bridge (E1.S2)

- After `bridges.start(...)` returns, the bridge's own `process.exited` gets one continuation that forgets THIS call's
  `materialized`. It is attached to the returned process, not to the manager's `onEnded`: `stop()` deletes the map row
  before it kills the process, and a replacement suppresses the old bridge's `onEnded` (`sshBridgeManager.ts:69-78`,
  `:81-89`), so `onEnded` does not fire on every end. `exited` resolves on the process's end whatever ended it (its
  own end, *Close*, a replacement, the window's `dispose`).
- When `buildBridgeArgv` gives no argv (`:453-459`), the key is forgotten at once. When `bridges.start` throws (a
  synchronous spawn error), the key is forgotten and the same error is rethrown.
- **Why not delete after authentication** (the question consultants, 2026-11-16, `f4c62413`, both): a plain `ssh -N`
  gives no clean signal that it has authenticated; a timer races a slow login or a jump host, and parsing `-v` output or
  a `ControlMaster` is new machinery for a cleanup. The process's end is observable and testable. The cost: the key
  stays while the bridge lives (hours possibly), as a Connect terminal's key stays while its terminal lives.
- **The spawner settles on a failed start:** the real spawner moves out of `activate` into an exported function (the
  spawn options do not change: `windowsHide`, `stdio: 'ignore'`, the resolved env), and `exited` also settles with
  `null` on the child's `'error'`, once. A failed start then ends like any other end: the manager drops the row and
  calls `onEnded` (a log line and a tree refresh), and the key goes. A behaviour change, on purpose: today such a
  bridge stays *bridged* in the tree forever.

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
| a `call-<uuid>.key` of a bridge | one per LIVE bridge; a bridge is one per entry (`start` replaces) | the continuation on that bridge's `exited` | as above; `dispose` stops every bridge, so each `exited` settles at the window's end |
| a continuation on `exited` | one per started bridge | it runs once when the process ends | ends with the extension host |

**Projected size.** A key file is about 0.4 kB (ed25519) to 3.3 kB (RSA 4096). A heavy window with 10 open bridges, one
socket check and one install running holds 12 files, at most 12 × 3.3 kB ≈ 40 kB. Today the same window, after 50
bridge starts and 20 installs, holds 120 files (≈ 400 kB) until it ends; after this plan the count is bounded by the
bridges open now.

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
   the second's; no argv forgets it at once; a throwing `start` forgets it and the command's promise rejects with the
   same error.
4. **The spawner**: a fake child that emits `'error'` settles `exited` with `null`; one that emits `'exit'` with its
   code; one that emits both settles once with the first.
5. **Mutation checks** (by hand, recorded in the commit body): remove each of the four forgets in turn → its test is
   red; attach the bridge's forget to `onEnded` instead → the *Close* and replacement tests are red; drop the `'error'`
   listener → test 4 is red.
6. The whole extension suite (`npm test` in `src_vs_code`), lint (`max-lines` included) and the build green before the PR.

## 4. Docs

- `src_vs_code/CHANGELOG.md`, `[Unreleased]`: a security entry (the three roads delete their key; a bridge whose `ssh`
  cannot start ends instead of staying *bridged*).
- `research/module_extension.md:6134`, the row *SSH private key on disk*: the socket check and the install delete their
  file when they finish, a bridge when its `ssh` ends. The bridge's own section gets the spawner's `'error'` sentence.
- `research/module_tests.md`: the new test file and what it holds.
- At promotion: the N16 line of [PLAN_agent_refusal_key_file_path.md](../research/PLAN_agent_refusal_key_file_path.md)
  gets its "Fixed in" text; the `todo/README.md` rows move to `research/README.md`.

## 5. Out of scope

- Deleting a bridge's key before the bridge ends (§2.2: no signal).
- Moving the socket check or the install out of `agentCommands.ts` (§2.3).
- The other open notes of N17: F1 (the `suffix` parameter, after #365), F3 (`keyEntityId` unread), F4, F5.
- The forwarded own agent of the three clicks ([PLAN_ssh_exec_own_agent_forwarding.md](PLAN_ssh_exec_own_agent_forwarding.md)).

## 6. Definition of Done

- [ ] The three roads forget the key they wrote, on every exit path of §2.1 and §2.2, and only a key they wrote.
- [ ] The spawner's `exited` settles on `'error'`; a failed start ends the bridge row.
- [ ] `agentCommands.ts` at most 800 lines, lint green.
- [ ] The tests of §3 RED first, then GREEN; the mutation checks recorded.
- [ ] The docs of §4.
- [ ] The coai code gate at `proceed`; the lead's Opus review; CI green on the head sha; CodeRabbit read.
- [ ] Released as an extension patch with the owner's word; the plan promoted.

## 7. Build order and merge conditions

1. This plan through the coai plan gate (`review_plan` → `resolve` until `proceed`).
2. The stories document [PLAN_person_roads_forget_key_E1.md](PLAN_person_roads_forget_key_E1.md) and a spec by Fable;
   the cadence consult the gate orders, BEFORE the build.
3. E1.S1, then E1.S2, each RED → GREEN, by a Sonnet coder; the lead's Opus review of each.
4. `review_code` over the whole diff → `resolve` until `proceed`.
5. One PR (a squash merge) after the head sha's checks exist and pass. The repository has five open PRs; a sixth needs
   the owner's word.
6. The release (a patch) with the owner's word, then the promotion PR.

## Epics

Cornerstones: 1 of 2 — E1.S1

### E1 · The three roads of the person delete their key file

- **Goal:** no key written by the socket check, the install or a bridge outlives the `ssh` that needs it.
- **Scope:** §2; the stories in [PLAN_person_roads_forget_key_E1.md](PLAN_person_roads_forget_key_E1.md).
- **Depends on:** nothing unmerged (PR #365 does not touch these files).
- **Done when:** §6.
- **Cornerstone:** E1.S1 (the helper that spells the rule, and the grouped imports that make room for every later line).
