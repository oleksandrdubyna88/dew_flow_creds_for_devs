# PLAN — E1.S2 spec: the pin of one call, and the guard that owns two files (SECURITY, CORNERSTONE)

> Status: **IMPLEMENTED, 2026-11-27.** Story E1.S2 (spec) of G1: merged (#379, squash `f3e9887d`) and released in extension 1.23.0 on 2026-11-23 (release PR #383, `95e11116`, tag `extension-v1.23.0`). G1 as a whole was finished and released in extension 1.24.0 on 2026-11-27 (release PR #395, squash `a63dee35`, tag `extension-v1.24.0` at `a63dee35`, published to the Marketplace the same day). The parent [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) records the release and the run on the release commit (§10.5).
>
> The status as it stood before the promotion, kept as it was written: **built 2026-11-17/18 (7f061190 the import lines, aad8b8ba the product and the tests, 08d65f5d the documents) on `fix/g1-person-roads-pin`, merged (#379, `f3e9887d`), not released. Spec written 2026-11-17, by Fable.** The cornerstone spec of the G1 plan, and a security spec, written
> before its code (the rows *Cornerstone spec* and *Security judgement* of `subagent-models.md`). Story E1.S2 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its §3.1, §3.2, sentences A and B of §3.5, §3.6, and the
> tests 1, 5, 6, 7, 8 and 10 of its §5) and of its stories document
> [PLAN_person_roads_pin_host_key_E1.md](PLAN_person_roads_pin_host_key_E1.md) (`## E1.S2`). This file is promoted together with
> the parent.
>
> Scope: `src_vs_code/src` — new `personPin.ts`; `writtenKey.ts` (both guards get a required pin writer and hand the road one
> value); `commands/agentCommands.ts` (first the import lines, then the three calls of the guards); tests: new
> `test/personPin.test.ts`, new `test/personRoadsPin.test.ts`, `test/writtenKey.test.ts` (U1 to U8 get the writer, nine more),
> `test/personRoadsWorld.ts`; and three documents (§6). Branch `fix/g1-person-roads-pin`, after E1.S1 on the same branch. Each
> `file:line` below was read on `ca99cd91` (`main` with G2 merged). E1.S1 does not touch a file of this story. Fable writes this
> spec, a Sonnet coder builds it, Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above; a section
named as §3.1 and so on is the parent's, and a section named as "§2 of this spec" is this document's. "N16" is
[PLAN_person_roads_forget_key.md](PLAN_person_roads_forget_key.md); its names keep their meaning (`forgetWrittenKey`,
`withWrittenKey`, `withWrittenKeyUntilExit`, the world, C1 to C6, I1 to I7, R1, B1 to B9, U1 to U8). This document's own names:
the facts K1 to K12, the scenarios Q0 to Q8 with QW and QS, P1 to P9, U9 to U17, the mutations N1 to N17, the break-its Y1 to
Y10. This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`).

## What E1.S2 builds, in one paragraph

An SSH entry can hold a saved host key (`hostKey`). Three roads of the person do not read it: the bridge socket check, *Install
creds on host* and *Open Remote Bridge…*. This story builds the decision that all three will read, and the files that go with
it. It does not yet put the file into an argv: that is E1.S3. For one call, the saved host key has three states. **Absent**
(no `hostKey`, an empty one, one of white space): the call runs as today and writes nothing. **Usable**: the key is written to a
file of this call alone, `known_hosts-<entry id>-<uuid>`, and the call is *ready* with the path of that file. **There, and not
usable** (the text is no host key, or the host cannot form a known_hosts line), or **the file cannot be written**: the call is
*refused* before any `ssh` starts, and the person reads one sentence. The two guards of N16 own the pin file as they own the
key file: each guard calls the pin writer itself, inside its guarded span, and hands the road ONE value that is ready or
refused. The pin file is deleted where the key file is deleted, whether or not a key file was written. A mistake here reaches
all three roads and still looks as if it works, so the story is the cornerstone.

| File | Change | Where |
|---|---|---|
| `commands/agentCommands.ts` | commit c1: seven groups of import lines become seven lines (794 → 785 lines). Commit c2: one import; the three calls of the guards take the answer of the resolve as their first argument and the pin writer as their second; one log line in the socket check (785 → 784 lines) | §4 |
| `personPin.ts` (new) | `writePersonPin(storageDir: string, entity: EntityMetadata, auth: SshExecAuth): PinOfCall`, `unusablePinSentence(name: string, auth: SshExecAuth): string`, `pinWriteFailedSentence(name: string, error: unknown): string` | §2 |
| `writtenKey.ts` | the types `PinOfCall`, `PinWriter`, `ReadyCall`, `RefusedCall`, `CallAuth`; `withWrittenKey<T>(credential: ExecAuth, writePin: PinWriter, run: (call: CallAuth) => Promise<T>): Promise<T>`; `withWrittenKeyUntilExit<T extends Started>(credential: ExecAuth, writePin: PinWriter, start: (call: CallAuth) => T \| undefined): T \| undefined`; `forgetWrittenKey` unchanged | §3 |
| `test/personRoadsWorld.ts` | a saved host key on the entry, a storage folder the test chooses, a question a test can hold open, the argv of each bridge, `passwordLogin`, `pinFiles`, `knownHostsOf` | §5.1 |
| `test/personRoadsPin.test.ts` (new) | 28 tests: Q0, QW, Q1 (3), Q5 (3), Q5b, Q6 (12), Q7a (2), Q7b, Q7c, Q8a, Q8b, QS | §5.2 |
| `test/personPin.test.ts` (new) | 10 tests: P1 to P9 and P2b | §5.3 |
| `test/writtenKey.test.ts` | U1 to U8 and U3b get the writer as an argument (17 lines); 9 more tests, U9 to U17: 18 tests | §5.4 |
| `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md` | the texts of §6 | §6 |

## Binding constraints

- **No plan change.** Build what the parent and this document say. If a step cannot be done as written, a code block here does
  not compile, or a test is not RED or GREEN as this document says: stop and tell the lead. Do not repair the parent, the stories
  document or this document. The parent has one recorded change in its epoch; a second one stops the whole plan.
- **A RED proof is a failed assertion, never a compile error.** Read the exit of `tsc` before any test result. This is why the
  world and `test/personRoadsPin.test.ts` are written FIRST, on the product of commit c1 (they compile there: they name no new
  type of the product), and are watched red there. The tests of `personPin.ts` (a new module) and U9 to U17 (they call the guards
  with an argument that the old guards do not have) cannot be red before the code without a compile error or a load error; they
  are written together with the code and proven by the mutations of §8.
- **Keep what the runner printed.** Save each RED text in the scratchpad folder of the session and quote it in the body of c2.
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history. Never commit `.claude/settings.json`.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): 800 lines per file, 50 code lines per function (120 in `src/test/`),
  complexity 4, also in tests. No new `eslint-disable`. `commands/agentCommands.ts` has **785 lines** after c1 and **784 lines**
  after c2 (§4.3).
- **`hostKeyTrust.ts` does not change**, and above all not `materializeKnownHosts`: the agent's exec calls it too and still reads
  `undefined` as "no pin" (the parent's §3.1, §7 F1). `hostKeyPin.ts` does not change in this story.
- **The pin writer is called by the guards and by nothing else.** No road calls `writePersonPin` itself, and no road hands a
  guard a path. The only use of the name `writePersonPin` in `commands/agentCommands.ts`, beside its import, is inside the arrow
  function that is the second argument of a guard.
- **The answer of `resolveExecAuth` has no name on the three roads.** It is written as the first argument of the guard:
  `withWrittenKey(await resolveExecAuth(…), …)`. The road then holds only the ONE value that the guard hands it. QS pins this
  (§5.2).
- **No `await` between the resolve and the start of the bridge.** The function that `withWrittenKeyUntilExit` runs is
  synchronous, as today. The pin writer is synchronous too.
- **No argv changes in this story.** The four argv calls (`:180`, `:206`, `:338`, `:437-441`) keep their arguments. A pinned
  call writes its pin file and its `ssh` does not read it yet. E1.S3 hands the path to the argv. E1 is one pull request, so this
  state is never released.
- **What a person sees changes in two places only:** the refusal branches of the install (`:277-280`) and of the bridge
  (`:430-433`) can now show sentence A or sentence B after their opening words. No dialog moves, none is added
  (`test/promptSiteLedger.ts:56-63`).
- **One line of the diagnostic log is new:** `socket check did not run: <the message of the refusal>`, area `bridge`, level
  `info`, when the socket check gets a refused value (a refused credential or a refused pin). Before, that branch was silent.
- **Files with no change:** `hostKeyTrust.ts`, `hostKeyPin.ts`, `sshExecAuth.ts`, `sshExecCommand.ts`, `sshBridge.ts`,
  `sshBridgeManager.ts`, `bridgeSpawner.ts`, `keyInstaller.ts`, `materializedKeys.ts`, `describeError.ts`, `extension.ts`,
  `test/personRoadsForgetKey.test.ts`, `test/bridgeKeyHandoff.test.ts`, `test/vscodeStub.ts`, `test/promptSiteLedger.ts`,
  `package.json`.
- **Tests leave nothing outside an owned temp folder.** Every real file of these tests is in a folder of `ownedDir` or
  `ownedFile` (`scripts/lib/leftovers.cjs`), registered in a `cleanupScope` that the file closes in `after`. No test starts a
  process. No test writes into `/storage`.
- **Node only.** No Python, also not for a helper script. Write documents with the Edit or Write tool, not with a shell heredoc.

## Facts read on `ca99cd91` that this spec uses

| # | Fact | Where |
|---|---|---|
| K1 | `commands/agentCommands.ts` has 794 lines, the same as on `b84416aa`: G2 did not touch the file (`git diff b84416aa..ca99cd91 -- src_vs_code/src/commands/agentCommands.ts` is empty). So every line reference of the parent and of the stories document into this file still holds. Lint refuses more than 800 (`eslint.config.mjs:30`) | the file, git |
| K2 | The import lines that name one symbol each from a module that another line also names: `../installCommand` (`:4`, `:19`, `:20`), `../credsInstall` (`:12`, `:49`, `:50`), `../sshExecCommand` (`:22`, `:23`), `../sshCommand` (`:32`, `:38`), `../agentShareSnippet` (`:39`, `:40`), `../secretClipboard` (`:41`, `:42`), `../gitSigningConfig` (`:45`, `:46`): 16 lines, 7 modules | `commands/agentCommands.ts` |
| K3 | The socket check `verifyBridgeSocket` (`:191-245`): no storage folder returns (`:197-199`); the resolve, with NO opener (`:200`); the guard (`:201`); a credential that is not ok returns with no word (`:202-204`); the argv of the mode check (`:206`); the sweep (`:214`, its argv `:180`, its run `:185`); the timer of 1.5 s (`:216`); the mode check's run (`:217`); a missing socket is logged and shown (`:223-231`); an unreadable mode is logged (`:232-235`); a wide mode is logged and warned about (`:236-240`); the outer `catch` logs `socket check did not complete` (`:242-244`). It is called once, detached, with the bridge's own snapshot: `void verifyBridgeSocket(accountId, details, remote)` (`:465`) | `commands/agentCommands.ts` |
| K4 | *Install creds on host* (`:259-329`): the snapshot `details` (`:266`); the resolve with a click opener (`:272`); the guard (`:273`); the warning (`:274-276`); not ok shows `Cannot reach "<name>": <message>` and returns (`:277-280`); the probe (`:282`); the question (`:297-305`); the install run (`:314`). `runRemote` (`:332-350`) takes the ok half of the answer of the resolve as its type (`:334`) and builds its argv at `:338` | `commands/agentCommands.ts` |
| K5 | *Open Remote Bridge…* (`:381-478`): the snapshot `details` (`:402`); the token (`:411`); no storage folder returns (`:421-423`); the resolve with a click opener (`:424`); N16's comment (`:425`); the guard (`:426`); the warning (`:427-429`); not ok shows `Cannot bridge to "<name>": <message>` and returns `undefined` (`:430-433`); the argv (`:437-441`); `bridges.start` (`:452`); nothing started returns (`:454-456`); the socket check (`:465`); *Bridge open to …* (`:471-473`). Between `:424` and `:452` there is no `await` | `commands/agentCommands.ts` |
| K6 | The guards today (`writtenKey.ts`, 66 lines): `forgetWrittenKey` (`:13-17`); `withWrittenKey(credential, run)` (`:23-29`): `try { return await run(); } finally { forgetWrittenKey(credential); }`; `withWrittenKeyUntilExit(credential, start)` (`:51-66`) with the one flag `handed` and the one continuation `then(forget, forget)`. Its one importer in the product is `commands/agentCommands.ts` (`:28`); in the tests, `test/writtenKey.test.ts` | `writtenKey.ts` |
| K7 | What `resolveExecAuth` answers (`sshExecAuth.ts:30-47`): ok with `auth: SshExecAuth`, `env`, an optional `keyPath`, `materialized` and `warning`; or not ok with `reason`, `message` and an optional `warning`. `SshExecAuth` is `'askpass' \| 'key'` (`sshExecCommand.ts:104`). A stored key is ok with `auth: 'key'` and `materialized` (`sshExecAuth.ts:160-162`); a key file of the person is ok with `auth: 'key'` and no `materialized` (`sshExecAuth.ts:146`); a password is ok with `auth: 'askpass'` (`sshExecAuth.ts:90-99`). **No credential is NOT ok** (`sshExecAuth.ts:139-141`: "has no stored password or key any more"). So a call with no credential never reaches the pin writer: it shows the refusal of the credential | `sshExecAuth.ts` |
| K8 | `materializeKnownHosts(storageDir, entity, suffix?)` (`hostKeyTrust.ts:80-98`) answers `undefined` and writes nothing when `parseHostKey(entity.hostKey)` is `undefined` or the entry has no host (`:85-88`), or when `knownHostsLine` is `undefined` (`:89-92`: the host is not safe, `hostKeyPin.ts:124-127`). Otherwise it makes the folder `keys/<pid>/` (mode `0700`, `:94`), writes the line (mode `0600`, `:95`), calls `lockToOwner` (`:96`) and answers the path. The name is `known_hosts-<entry id>-<suffix>` through `materializedKeyPath` (`:66-68`), which sanitises it (`materializedKeys.ts:75-81`, `:124-126`). `mkdirSync` and `writeFileSync` can throw. `hostKeyTrust.ts` imports `vscode` (`:3`), so a test loads it under the stub | `hostKeyTrust.ts`, `materializedKeys.ts` |
| K9 | `parseHostKey` trims the stored text first (`hostKeyPin.ts:107-111`). So "absent" as this story defines it, `(entity.hostKey ?? '').trim() === ''`, is the set of texts that hold nothing to parse | `hostKeyPin.ts` |
| K10 | `forgetMaterializedKey` deletes with `force` inside a `try` with an empty `catch`: it cannot throw (`keyInstaller.ts:262-268`). `EntityMetadata.name` is a `string` (`types.ts:58`); `hostKey` is an optional `string` (`types.ts:90-96`) | `keyInstaller.ts`, `types.ts` |
| K11 | The world (`test/personRoadsWorld.ts`, 225 lines): the storage folder is the text `/storage` (`:205`); the snapshot has no `hostKey` (`:186`); a resolve with an opener is a click and one without is the socket check (`:145-157`); `realForget` leaves the real `./keyInstaller` (`:177`); a dialog with a button answers what `parts.answer` returns, on a promise callback (`:119-128`); the log is one list, `logs` (`:188`, `:196`). `loadWithVscode` takes stand-ins by the request string that the loaded module writes (`test/vscodeStub.ts:16-28`) | the tests |
| K12 | **Measured 2026-11-17** on a scratch copy of the whole repository at `ca99cd91` (`git archive`, the modules folder and the shared-rules mount linked in; the copy was edited and compiled, not the repository; not kept). Node 26.12.1, Linux. (a) c1 alone: `tsc` exit 0, `eslint src` clean, 785 lines; the whole suite: 7944 tests, 7905 pass, 38 skipped, 1 fail. The one failure is `[E2.1 F22 wiring] the default sweep collects a dead, old creds folder…`: it asks git for the worktrees, and the copy is no git repository. (b) The world of §5.1 and `test/personRoadsPin.test.ts` on c1: `tsc` exit 0; 28 tests, 5 green (Q0, QW, the three Q1), 23 red with the texts of §5.2. (c) With §2, §3 and §4.2: `tsc` exit 0, `eslint src` clean, 784 lines; `personRoadsPin` 28 green, `personPin` 10 green, `writtenKey` 18 green, `personRoadsForgetKey` 15 green, `bridgeKeyHandoff` 9 green. (d) N1 to N17 turn red what §8 says, and the product was restored after each (the three files compared equal). (e) The whole suite of the copy with c1 and c2 built: 7991 tests (47 more than at c1: 28, 10 and 9), 7952 pass, 38 skipped, 1 fail, the same one; `tsc --noEmit`, `eslint src` and the ratchet clean; the leftovers audit of the run names no folder. The suite is run in the repository when the story is built, where that one test has its git | the run |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.** A test result after a failed `tsc` is the result of old files.
2. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
3. `node $LP npm run typecheck`
4. `node $LP npm run lint`
5. `node $LP npm run ratchet` (it compiles first; this story changes no file of its baseline).
6. `npm test` — the full suite (it compiles first and lowers itself).

## 1. The three states, and the one value a road reads

**The pin of one call** is decided once, by one function, from the snapshot of the entry that the road already holds.

| The stored `hostKey` | The answer of the pin writer | What is written | What the road gets |
|---|---|---|---|
| absent: `undefined`, empty, or only white space | `{ ok: true }` | nothing | ready, the credential as it is |
| there, and `materializeKnownHosts` answers a path | `{ ok: true, knownHostsFile }` | `keys/<pid>/known_hosts-<entry id>-<uuid>`, one known_hosts line | ready, the credential with `knownHostsFile` |
| there, and `materializeKnownHosts` answers `undefined` | `{ ok: false, message: <sentence A> }` | nothing | refused, with sentence A |
| there, and `materializeKnownHosts` throws | `{ ok: false, message: <sentence B> }` | nothing that the call knows of (a write that failed part way can leave a file whose name the call does not know; the parent's §3.7 gives it to the purge) | refused, with sentence B |

Three rules make it safe.

1. **Absent and unusable are two states, decided by two checks that cannot drift.** Absent is the one check
   `(entity.hostKey ?? '').trim() === ''`. Everything else goes to `materializeKnownHosts`, and its `undefined` is "there and not
   usable". There is no second copy of the parse. The dangerous mistake is to read `undefined` as "no pin", as the agent's exec
   does (the parent's §7, F1): the call would then run with `accept-new` against a host that the person had pinned. P4 to P6,
   Q6 and the mutation N4 hold this.
2. **A refusal is a value, and it is the only thing the road can read.** The guard decides the credential and the pin together
   and hands the road ONE value, `CallAuth`. Its ready half has the fields of an ok credential. Its refused half has `ok: false`
   and a `message`. The road tests `ok` once, in the branch that exists. There is no value that says "the credential is ready"
   without a pin decision, and the answer of the resolve has no name on the road, so no road can start `ssh` after a refused pin.
3. **The form of sentence A follows the login of THIS call**, the `auth` of the resolved credential. A password entry is never
   told to use Connect SSH to save the key again (the parent's P2). The pin writer is called only for a credential that is ok,
   so it always has a login to read.

**No credential.** The parent's §3.5 lists "no credential" under the key form. Read in the code (K7), a call with no credential
is refused by `resolveExecAuth`, the pin writer is not called (the parent's §3.2, item 1), and the person reads the refusal of
the credential, as today. Nothing is sent to the host on that way either. This spec builds that; see *Notes for the lead*.

## 2. `personPin.ts` (new): the pin writer

### 2.1 The file

The whole file, as measured:

```ts
import { randomUUID } from 'node:crypto';
import { describeError } from './describeError';
import { materializeKnownHosts } from './hostKeyTrust';
import type { SshExecAuth } from './sshExecCommand';
import type { EntityMetadata } from './types';
import type { PinOfCall } from './writtenKey';

/**
 * The saved host key of ONE call on the three roads of the person (G1): the bridge socket check, *Install creds on host* and
 * *Open Remote Bridge…*. One of three answers, and never a throw:
 *
 * <ul>
 * <li>the entry has no saved host key (`hostKey` is absent, empty or only white space): unpinned, nothing is written;</li>
 * <li>the saved host key can be used: it is written to a file of this call alone, `known_hosts-<entry id>-<uuid>`, and the answer
 *     holds the path;</li>
 * <li>the saved host key is there and cannot be used, or its file cannot be written: refused, with the sentence for the person.</li>
 * </ul>
 *
 * <p>It is called by the guards of `writtenKey.ts` and by nothing else: they keep the path and delete the file. The parse and the
 * write are `materializeKnownHosts`, unchanged; the agent's exec calls that function too and still reads `undefined` as "no pin".</p>
 */

/**
 * Sentence A: the saved host key is there and cannot be used. The login of the call chooses the form: a password entry is never
 * sent to Connect SSH, because Connect sends the password without a check of the host when its key scan answers nothing.
 */
export function unusablePinSentence(name: string, auth: SshExecAuth): string {
  const opening = `The saved host key of "${name}" cannot be used, so nothing was sent to that host. `;
  return auth === 'askpass'
    ? `${opening}Do not use Connect SSH to save it again: this entry signs in with a password, and when Connect SSH cannot read the host's key first, it sends the password without checking the host. There is no safe repair for such an entry yet; the bridge and the install stay refused for it.`
    : `${opening}Get the host's key fingerprint from the person who runs the server. Then use Connect SSH on this entry, and go on only if it shows that fingerprint: Trust and connect saves the key.`;
}

/** Sentence B: the file of the saved host key could not be written. */
export function pinWriteFailedSentence(name: string, error: unknown): string {
  return `Could not write the saved host key of "${name}" to disk: ${describeError(error)}`;
}

/** Absent is not unusable: the same trim that `parseHostKey` does. */
function isAbsent(hostKey: string | undefined): boolean {
  return (hostKey ?? '').trim() === '';
}

/** Decide the pin of one call, and write its file when there is one to write. `auth` only chooses the form of sentence A. */
export function writePersonPin(storageDir: string, entity: EntityMetadata, auth: SshExecAuth): PinOfCall {
  if (isAbsent(entity.hostKey)) {
    return { ok: true };
  }
  try {
    const knownHostsFile = materializeKnownHosts(storageDir, entity, randomUUID());
    return knownHostsFile === undefined ? { ok: false, message: unusablePinSentence(entity.name, auth) } : { ok: true, knownHostsFile };
  } catch (error) {
    return { ok: false, message: pinWriteFailedSentence(entity.name, error) };
  }
}
```

### 2.2 The sentences, word for word

They are the parent's §3.5. `<name>` is `entity.name`, the name in the snapshot of the call.

Sentence A, the key form (`auth: 'key'`: a stored key, or the person's own key file):

```text
The saved host key of "<name>" cannot be used, so nothing was sent to that host. Get the host's key fingerprint from the person who runs the server. Then use Connect SSH on this entry, and go on only if it shows that fingerprint: Trust and connect saves the key.
```

Sentence A, the password form (`auth: 'askpass'`):

```text
The saved host key of "<name>" cannot be used, so nothing was sent to that host. Do not use Connect SSH to save it again: this entry signs in with a password, and when Connect SSH cannot read the host's key first, it sends the password without checking the host. There is no safe repair for such an entry yet; the bridge and the install stay refused for it.
```

Sentence B (`<the error>` is `describeError(error)`):

```text
Could not write the saved host key of "<name>" to disk: <the error>
```

What the person reads is the opening of the road and the sentence: `Cannot reach "<name>": ` + the sentence on the install
(`:278`), `Cannot bridge to "<name>": ` + the sentence on the bridge (`:431`). The socket check shows nothing; it writes the
sentence to the log (§4.2).

### 2.3 Why each part is as it is

- **`isAbsent` is a function of its own** for lint's complexity limit of 4 (`??` and the `catch` each count), and so that the
  absent check has one place.
- **The `try` holds only the call of `materializeKnownHosts` and the reading of its answer.** Everything that can throw there is
  a failed write (K8): the folder, the file. The `catch` turns it into sentence B. `lockToOwner` does not throw
  (`materializedKeys.ts:28-38`).
- **`randomUUID()` is the suffix**, as `isolate` of a session uses it (`sshSession.ts:340`). Two calls of one entry get two
  files, and no call writes `known_hosts-<entry id>`, the name that the agent's exec and a Connect terminal use.
- **The function does not know the path of a file that a failed write left.** It answers a refusal with no path. The parent's
  §3.7 gives such a file to the purge.
- **`auth` is read only by `unusablePinSentence`.** It does not change what is written.
- **The module imports `./hostKeyTrust`, which imports `vscode`** (K8). It is on the `vscode` side, as `writtenKey.ts` already
  is through `./keyInstaller`; its test loads it under the stub. Its type comes from `./writtenKey` with `import type`, and
  `writtenKey.ts` imports nothing of `personPin.ts`, so the unit test of the guards loads no pin writer.

## 3. `writtenKey.ts`: the guards own two files

### 3.1 The file

The whole file after the change, as measured (140 lines; 66 before):

```ts
import { forgetMaterializedKey } from './keyInstaller';
import type { ExecAuth } from './sshExecAuth';
import type { SshExecAuth } from './sshExecCommand';

/**
 * The two files that the extension WROTE for one call of a road of the person, and the rules about them (N16, G1). The KEY file is
 * the one `resolveExecAuth` wrote (`materialized`). The PIN file is the one the pin writer of the call wrote (the saved host key,
 * `personPin.ts`). The caller that got them deletes each when no `ssh` of its own will read the path again.
 *
 * <ul>
 * <li>A credential with no `materialized` (the person's own key file, a password, a refusal) has no key file to delete.</li>
 * <li>A call with no pin (an unpinned entry, a refusal) has no pin file to delete.</li>
 * <li>The two deletes do not depend on each other.</li>
 * <li>Only a path that the pin writer returned in THIS call is deleted as a pin file. No caller hands a guard a pin path.</li>
 * </ul>
 *
 * <p>Both guards take what `resolveExecAuth` answered, as it is, so that no statement stands between the resolve and the guard. Both
 * call the pin writer themselves, inside their guarded span, and hand the road ONE value: the credential and the pin, decided
 * together ({@link CallAuth}). A road cannot hold a credential that is ready without a pin decision.</p>
 */

/** What the pin writer of one call answers: no pin, a pin file written now, or a refusal with its sentence. It never throws. */
export type PinOfCall =
  | { readonly ok: true; readonly knownHostsFile?: string }
  | { readonly ok: false; readonly message: string };

/** The pin writer of one call, bound to the call's storage folder and to its snapshot of the entry. `auth` is the login of the credential. */
export type PinWriter = (auth: SshExecAuth) => PinOfCall;

/** The call may start `ssh`: the credential, and `knownHostsFile` when the entry is pinned. */
export type ReadyCall = Extract<ExecAuth, { ok: true }> & { readonly knownHostsFile?: string };

/** The call starts nothing: the refusal of the credential as it is, or the refusal of the pin in the same shape. */
export interface RefusedCall {
  readonly ok: false;
  readonly message: string;
  readonly warning?: string;
}

/** The ONE value a road reads. */
export type CallAuth = ReadyCall | RefusedCall;

/** Delete the key file written for this credential, when one was. Never throws (`forgetMaterializedKey` is best effort). */
export function forgetWrittenKey(credential: ExecAuth): void {
  if (credential.ok && credential.materialized !== undefined) {
    forgetMaterializedKey(credential.materialized);
  }
}

/** Delete both files of one call: the key file when one was written, and the pin file when one was written. Never throws. */
function forgetBoth(credential: ExecAuth, pinFile: string | undefined): void {
  forgetWrittenKey(credential);
  if (pinFile !== undefined) {
    forgetMaterializedKey(pinFile);
  }
}

/** What one call decided: the value for the road, and the path of the pin file that the writer wrote for it. */
interface Decided {
  readonly call: CallAuth;
  readonly pinFile?: string;
}

/**
 * Decide the credential and the pin of one call together. The pin writer is called only for a credential that is `ok`. A refused
 * credential goes on as it is; a refused pin goes on as a refusal with the pin's sentence and the credential's warning.
 */
function decide(credential: ExecAuth, writePin: PinWriter): Decided {
  if (!credential.ok) {
    return { call: credential };
  }
  const pin = writePin(credential.auth);
  if (!pin.ok) {
    return { call: { ok: false, message: pin.message, warning: credential.warning } };
  }
  const pinFile = pin.knownHostsFile;
  return pinFile === undefined ? { call: credential } : { call: { ...credential, knownHostsFile: pinFile }, pinFile };
}

/**
 * Decide the call (the pin is written here, inside the guarded span), run `run` with the decided value, and delete both files of
 * the call when `run` has ended: after its value, after its rejection and after a synchronous throw alike. The value or the SAME
 * error goes on to the caller. A pin writer that throws (it must not) is inside the span too: the key file is deleted and its
 * error goes on.
 */
export async function withWrittenKey<T>(credential: ExecAuth, writePin: PinWriter, run: (call: CallAuth) => Promise<T>): Promise<T> {
  let pinFile: string | undefined;
  try {
    const decided = decide(credential, writePin);
    pinFile = decided.pinFile;
    return await run(decided.call);
  } finally {
    forgetBoth(credential, pinFile);
  }
}

/** What a started bridge hands back, as much as the handoff reads: its process, whose `exited` settles when the process has ended. */
interface Started {
  readonly process: { readonly exited: Promise<unknown> };
}

/**
 * Decide the call (the pin is written here, inside the guarded span), run `start` with the decided value while both files of the
 * call are the caller's to delete, and hand both files to the process that `start` started.
 *
 * <ul>
 * <li>`start` returns a started thing: ONE continuation on its process's `exited` deletes both files when that process has ended,
 *     whatever ended it; nothing is deleted now.</li>
 * <li>`start` returns `undefined` (nothing was started): both files are deleted at once.</li>
 * <li>`start` or the pin writer throws: what was written is deleted at once and the SAME error goes on to the caller.</li>
 * </ul>
 *
 * <p>`handed` is set by the statement directly after the one that attaches the continuation, with nothing between them: an attach
 * that throws leaves it false and the `finally` deletes; an attach that worked cannot be followed by a throw before the flag. So
 * exactly one of the two deletes runs, on every path, and it deletes both files. `start` is synchronous on purpose: no `await`
 * stands between the start and the attach.</p>
 */
export function withWrittenKeyUntilExit<T extends Started>(
  credential: ExecAuth,
  writePin: PinWriter,
  start: (call: CallAuth) => T | undefined,
): T | undefined {
  let pinFile: string | undefined;
  let handed = false;
  const forget = (): void => forgetBoth(credential, pinFile);
  try {
    const decided = decide(credential, writePin);
    pinFile = decided.pinFile;
    const started = start(decided.call);
    if (started !== undefined) {
      void started.process.exited.then(forget, forget);
      handed = true;
    }
    return started;
  } finally {
    if (!handed) {
      forget();
    }
  }
}
```

What changed against today's file: the module comment; the five types; `forgetBoth`, `Decided` and `decide` are new; each guard
has the pin writer as its second parameter, calls `decide` as the first statement of its `try`, hands `decided.call` to `run` or
`start`, and deletes with `forgetBoth`. `forgetWrittenKey` and `Started` are unchanged. In `withWrittenKeyUntilExit` the
continuation `forget` is declared before the `try`, because the `finally` now calls it too; the attach and `handed = true;` are
still adjacent statements in that order.

### 3.2 Every way out

`withWrittenKey(credential, writePin, run)`:

| # | What happens | The writer | `run` gets | Deleted in the `finally` |
|---|---|---|---|---|
| 1 | the credential is not ok | not called | the refusal of the credential, the same object | nothing |
| 2 | ok, the writer answers no pin | called once, with `credential.auth` | the credential, the same object | the key file when `materialized` |
| 3 | ok, the writer answers a path | called once | a new object: the credential and `knownHostsFile` | the key file when `materialized`, AND the pin file |
| 4 | ok, the writer answers a refusal | called once | `{ ok: false, message, warning }`: the pin's sentence, the credential's warning | the key file when `materialized`; no pin file (none was handed back) |
| 5 | ok, the writer throws (it must not) | called once | `run` is not called | the key file when `materialized`; the same error goes on |
| 6 | `run` rejects, or throws before it returns a promise | as 2 or 3 | as 2 or 3 | as 2 or 3; the same error goes on |
| 7 | `run` settles with a value | as 2 or 3 | as 2 or 3 | as 2 or 3, AFTER the value is there; the value goes on |

`withWrittenKeyUntilExit(credential, writePin, start)`:

| # | What happens | `start` gets | Deleted, and when |
|---|---|---|---|
| 1 | the credential is not ok (the road returns `undefined`) | the refusal of the credential, the same object | nothing |
| 2 | the writer answers a refusal (the road returns `undefined`) | the refusal with the pin's sentence | the key file, at once |
| 3 | the writer throws (it must not) | `start` is not called | the key file, at once; the same error goes on |
| 4 | `start` throws (the argv, a dialog, the spawner) | ready | both files, at once; the same error goes on |
| 5 | `start` returns `undefined` (no argv) | ready | both files, at once |
| 6 | `start` returns a started thing and the attach throws | ready | both files, once, at once; the error of the attach goes on |
| 7 | `start` returns a started thing; later its `exited` settles | ready | nothing now; both files once, when `exited` settles |
| 8 | as 7, and `exited` rejects | ready | both files once, then; no unhandled rejection |

"Both files" always means: the key file when the credential has `materialized`, and the pin file when the writer answered a
path. The two do not depend on each other: `forgetBoth` calls `forgetWrittenKey` first, which cannot throw (K10), and then
tests the pin path alone.

### 3.3 What becomes of N16's proof

N16 proved for the bridge: "exactly one of the two deletes runs, on every path". The two deletes were the continuation and the
`finally`. That proof stands with no new case, because nothing about the flag changed: ONE flag, set by the statement directly
after the ONE attach. What changed is what each of the two deletes does: it deletes two files in place of one. The pin path is
a local of the guard, set once, by the statement directly after `decide` returned; between the two nothing can throw. The
continuation reads that local when it runs, which is after the guard has returned.

**Only a path that the writer returned in this call is deleted as a pin file.** `pinFile` has one writer, the line
`pinFile = decided.pinFile;`, and `decided.pinFile` has one source, `pin.knownHostsFile` in `decide`. No parameter of a guard
is a path. That is why the folder check of `forgetOurPin` (`sshSession.ts:605-616`) is not copied (the parent's §3.2, item 4).
The road does get the path, as `knownHostsFile` of the ready value, for the argv of E1.S3; the guard does not read it back from
there.

## 4. `commands/agentCommands.ts`

### 4.1 Commit c1: the import lines (no change of behaviour)

The 16 lines of K2 become 7. Each group stands where its FIRST line stood, so the order in which the modules are first loaded
does not change. The request strings do not change, so no stand-in of a test changes.

```diff
--- a/src_vs_code/src/commands/agentCommands.ts
+++ b/src_vs_code/src/commands/agentCommands.ts
@@ -1,7 +1,7 @@
 /* eslint-disable complexity, max-lines-per-function -- command registrations moved verbatim out of extension.ts
    (roadmap A1 stage 2, 2026-08-28): one function that registers a family of closures, each the size it
    was. The ceilings are a boundary for NEW code here; a handler meets them when it is next touched. */
-import { Machine } from '../installCommand';
+import { Machine, installScript, InstallTarget } from '../installCommand';
 import { anyAgentAccess } from '../mcpAccess';
 import { ConsentStampStore, consentStampsFor } from '../mcpConsentPolicy';
 import { folderHooks } from '../mcpFolderHooks';
@@ -9,18 +9,15 @@
 import { AliasMap, aliasFor, withoutAlias, describeAliasProblem, withAlias } from '../cliAliases';
 import { SshBridgeManager } from '../sshBridgeManager';
 import { createDiagnosticLog } from '../diagnosticLog';
-import { CredsProduct } from '../credsInstall';
+import { CredsProduct, CREDS_MCP, CREDS_CLI } from '../credsInstall';
 import { CredTreeDataProvider } from '../treeDataProvider';
 import { SshAgentManager } from '../sshAgentManager';
 import { AGENT_SERVED_NOTE } from '../sshAgentTexts';
 import { StorageManager } from '../storageManager';
 import { VaultKeys } from '../vaultKeys';
 import * as vscode from 'vscode';
-import { installScript } from '../installCommand';
-import { InstallTarget } from '../installCommand';
 import { EntityMetadata } from '../types';
-import { SshExecAuth } from '../sshExecCommand';
-import { buildSshExecArgv } from '../sshExecCommand';
+import { SshExecAuth, buildSshExecArgv } from '../sshExecCommand';
 import { sweepCommand, modeCheckCommand, interpretSocketProbe, describeMissingSocket, isOwnerOnlyMode, describeWideSocket, remoteSocketPath, bridgeId, buildBridgeArgv, remoteInstructions } from '../sshBridge';
 import { runSshExec } from '../sshExecRunner';
 import { describeError } from '../describeError';
@@ -29,25 +26,19 @@
 import { probeCommand, blockerFor, interpretProbe, confirmationFor, installCommand, interpretInstall } from '../remoteCliInstall';
 import { entityKey } from '../entityFlags';
 import { parseToken } from '../grantToken';
-import { isSafeSshTarget } from '../sshCommand';
+import { isSafeSshTarget, describeSshTarget } from '../sshCommand';
 import { resolveKind } from '../entityKind';
 import { cliAliasNote, cliCommandFor } from '../cliCommandText';
 import { KeyRow, asElement, detailedNode, loadFailureWarnings } from '../commandTargets';
 import { connectEntity } from '../sshConnect';
 import * as path from 'node:path';
-import { describeSshTarget } from '../sshCommand';
-import { buildAgentSnippet } from '../agentShareSnippet';
-import { buildKindSnippet } from '../agentShareSnippet';
-import { copySecret } from '../secretClipboard';
-import { copiedMessage } from '../secretClipboard';
+import { buildAgentSnippet, buildKindSnippet } from '../agentShareSnippet';
+import { copySecret, copiedMessage } from '../secretClipboard';
 import { signingPublicLine } from '../gitSigningKey';
 import { clickOpener } from '../pinClick';
-import { gitSigningConfig } from '../gitSigningConfig';
-import { gitSigningClipboardText } from '../gitSigningConfig';
+import { gitSigningConfig, gitSigningClipboardText } from '../gitSigningConfig';
 import { showMcpLog } from '../mcpLogPanel';
 import { registerWslMcpCheck } from '../mcpInstallTarget';
-import { CREDS_MCP } from '../credsInstall';
-import { CREDS_CLI } from '../credsInstall';
 import { WslRelayManager } from '../wslRelayManager';
 import { remedyRunner, remoteWindowDeps } from '../remoteConnectHost';
 export interface AgentCommandsHost {
```

**794 → 785 lines** (9 lines fewer: 2 + 2 + 1 + 1 + 1 + 1 + 1). After it: compile, typecheck, lint and the whole suite are
green, and no test changes.

### 4.2 Commit c2: the three roads

Against the file of c1:

```diff
--- a/src_vs_code/src/commands/agentCommands.ts
+++ b/src_vs_code/src/commands/agentCommands.ts
@@ -23,6 +23,7 @@
 import { describeError } from '../describeError';
 import { resolveExecAuth } from '../sshExecAuth';
 import { withWrittenKey, withWrittenKeyUntilExit } from '../writtenKey';
+import { writePersonPin } from '../personPin';
 import { probeCommand, blockerFor, interpretProbe, confirmationFor, installCommand, interpretInstall } from '../remoteCliInstall';
 import { entityKey } from '../entityFlags';
 import { parseToken } from '../grantToken';
@@ -188,10 +189,10 @@
       if (storageDir === undefined) {
         return;
       }
-      const credential = await resolveExecAuth(storage, accountId, entity, storageDir);
-      await withWrittenKey(credential, async () => {
+      await withWrittenKey(await resolveExecAuth(storage, accountId, entity, storageDir), (auth) => writePersonPin(storageDir, entity, auth), async (credential) => {
         if (!credential.ok) {
-          return; // the bridge itself already reported this
+          log.info('bridge', `socket check did not run: ${credential.message}`);
+          return;
         }
         const keyPath = credential.keyPath;
         const argv = buildSshExecArgv(entity, keyPath, modeCheckCommand(remote), credential.auth);
@@ -260,8 +261,7 @@
       return;
     }
 
-    const credential = await resolveExecAuth(storage, accountId, details, storageDir, clickOpener(storage, accountId, 'connect'));
-    await withWrittenKey(credential, async () => {
+    await withWrittenKey(await resolveExecAuth(storage, accountId, details, storageDir, clickOpener(storage, accountId, 'connect')), (auth) => writePersonPin(storageDir, details, auth), async (credential) => {
       if (credential.warning !== undefined) {
         void vscode.window.showWarningMessage(credential.warning);
       }
@@ -412,9 +412,8 @@
     if (storageDir === undefined) {
       return;
     }
-    const credential = await resolveExecAuth(storage, accountId, details, storageDir, clickOpener(storage, accountId, 'connect'));
-    // N16: the key file of this call is this command's to delete until the bridge's ssh holds it; then that ssh's end deletes it.
-    const bridge = withWrittenKeyUntilExit(credential, () => {
+    // N16, G1: the key file and the pin file of this call are this command's to delete until the bridge's ssh holds them; then that ssh's end deletes them.
+    const bridge = withWrittenKeyUntilExit(await resolveExecAuth(storage, accountId, details, storageDir, clickOpener(storage, accountId, 'connect')), (auth) => writePersonPin(storageDir, details, auth), (credential) => {
       if (credential.warning !== undefined) {
         void vscode.window.showWarningMessage(credential.warning);
       }
```

In words:

1. **The import** of `writePersonPin`, one line after the import of the guards.
2. **The socket check** (`:200-204` of today's file). The resolve becomes the first argument of the guard and loses its name. The
   second argument is the pin writer, bound to this call's storage folder and to `entity`, the snapshot that the bridge handed
   over. The function that the guard runs takes ONE parameter, named `credential`, so no other line of its body changes: every
   `credential.` below it now reads the one value. The refusal branch gets the log line and loses its comment (the comment was
   not true for a refusal of the check's own resolve, which has no opener).
3. **The install** (`:272-273`). The same two lines become one. Its body does not change: `credential.warning`, `!credential.ok`
   with `credential.message`, and `runRemote(details, credential, …)`. After the `ok` test the value is the ready half, which
   has every field of an ok credential, so it is still what `runRemote` takes (`:334`); `runRemote` does not change.
4. **The bridge** (`:424-426`). The resolve line and the guard line become one; N16's comment line stays above it and now names
   both files. Its body does not change. It stays synchronous.

Nothing else changes in the file. `sweepDeadSockets`, `runRemote` and the four argv calls are E1.S3's.

### 4.3 The line count

| Step | Lines | How |
|---|---|---|
| `ca99cd91` | 794 | K1 |
| after c1 | **785** | −9: the import lines |
| after c2 | **784** | +1 the import; −1 the socket check's resolve joins its guard; +1 the log line (the `return;` keeps its own line); −1 the install's resolve joins its guard; −1 the bridge's resolve joins its guard |

So E1.S3 starts with 16 lines below the limit. The parent's §3.6 counted about 12 added lines for the whole of E1. The three
lines that open the guards are long: 165, 209 and 221 characters. The longest line of the file today has 209 (`:24`), and lint
has no line-length rule. Do not break them: a broken line changes the count and the text that QS reads.

### 4.4 What a person sees on each road, as far as this story changes it

| Road | The saved host key | Before this story | After it |
|---|---|---|---|
| all three | absent | the road runs | the same; nothing is written |
| all three | usable | the road runs, no file | the road runs, with the same argv; a pin file exists while it runs and is gone after (the check and the install: when they finish; the bridge: when its `ssh` has ended) |
| the install | there, not usable | the probe ran | one error message, `Cannot reach "<name>": ` + sentence A in the form of the login; no `ssh` |
| the bridge | there, not usable | the bridge was started | one error message, `Cannot bridge to "<name>": ` + sentence A; no `ssh`, no row turns *bridged*, *Bridge open to …* is not shown. The token was minted before (`:411`), as before a refused credential today (the parent's §3.4) |
| the install, the bridge | the file cannot be written | n/a | the same with sentence B |
| the socket check | the file cannot be written | n/a | no `ssh`; one log line `socket check did not run: ` + sentence B; no message |
| the socket check | a refused credential of the check's own resolve | silent | no `ssh`, as before; one log line `socket check did not run: <the message>` |

The socket check cannot meet a saved host key that is not usable: the bridge's command reads the same snapshot first and is
refused, so no check starts (the parent's §3.3).

## 5. Scenarios

Each row is one test, or one group of tests with one name. "RED" is the text of the first assertion that fails, in the state the
row names. A guard is green before and after; a mutation of §8 proves it.

### 5.1 The world `test/personRoadsWorld.ts`

The whole diff, as measured (225 → 272 lines):

```diff
--- a/src_vs_code/src/test/personRoadsWorld.ts
+++ b/src_vs_code/src/test/personRoadsWorld.ts
@@ -1,4 +1,6 @@
+import * as fs from 'node:fs';
 import { formatToken } from '../grantToken';
+import { materializedKeysDir } from '../materializedKeys';
 import { BridgeProcess, BridgeSpawner, SshBridgeManager } from '../sshBridgeManager';
 import type { ExecAuth } from '../sshExecAuth';
 import type { SshExecOutcome } from '../sshExecRunner';
@@ -13,6 +15,10 @@
  * resolve answers), `../sshExecRunner` (no real `ssh`), `./keyInstaller` (the recorder of `forgetMaterializedKey`; left out with
  * `realForget`), and with `noExecArgv` `../sshExecCommand`.</p>
  *
+ * <p>The saved host key of the entry (G1): `hostKey` puts one on the entry, and `storageDir` is the window's storage folder. A pin
+ * test gives a REAL folder and `realForget`, so `materializeKnownHosts` and `forgetMaterializedKey` are the real ones and the
+ * pin files are real files; `pinFiles` lists them, and `knownHostsOf` reads the file that an argv names.</p>
+ *
  * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
  */
 
@@ -45,6 +51,9 @@
 /** A resolved credential whose key is the person's own file: nothing was written, so nothing may be deleted. */
 export const ownKeyFile = (keyPath: string): ExecAuth => ({ ok: true, keyPath, env: {}, auth: 'key' });
 
+/** A resolved credential that signs in with a password: no key file is written for it. */
+export const passwordLogin = (): ExecAuth => ({ ok: true, env: {}, auth: 'askpass' });
+
 export const NO_CREDENTIAL: ExecAuth = { ok: false, reason: 'no_credential', message: 'nothing stored' };
 
 /** What one `ssh` run answers. */
@@ -70,10 +79,14 @@
   /** The n-th `ssh` run (0-based) of the window. It may throw. */
   run?: (index: number, argv: readonly string[]) => SshExecOutcome;
   host?: string;
-  /** The spawner of the bridges. Default: every bridge is a `heldChild`, kept in `children`. */
+  /** The saved host key of the entry (`hostKey`), as it is stored: a pin, or a text that is none. Left out: the entry has no `hostKey`. */
+  hostKey?: string;
+  /** The storage folder of the window. A pin test gives a real, owned folder. Default: `/storage`, which no test writes. */
+  storageDir?: string;
+  /** The spawner of the bridges. Default: every bridge is a `heldChild`, kept in `children`, and its argv in `bridgeArgvs`. */
   spawn?: BridgeSpawner;
-  /** What a modal question and the quick pick answer. Default: dismissed. */
-  answer?: (message: string, rest: readonly unknown[]) => string | undefined;
+  /** What a modal question and the quick pick answer. Default: dismissed. A promise holds the question open until the test settles it. */
+  answer?: (message: string, rest: readonly unknown[]) => string | undefined | Promise<string | undefined>;
   /** The real `forgetMaterializedKey` deletes; `forgotten` stays empty. */
   realForget?: boolean;
   /** `buildSshExecArgv` answers no argv. */
@@ -86,10 +99,12 @@
   handlers: Map<string, Handler>;
   bridges: SshBridgeManager;
   children: HeldChild[];
+  /** The argv of every bridge that the default spawner started, in order. */
+  bridgeArgvs: (readonly string[])[];
   /** Every path `forgetMaterializedKey` was given, in order. */
   forgotten: string[];
-  /** Every `ssh` run: its argv and how many paths were forgotten when it started. */
-  runs: { argv: readonly string[]; forgottenBefore: number }[];
+  /** Every `ssh` run: its argv, how many paths were forgotten when it started, and the known-hosts file its argv names, read at that moment. */
+  runs: { argv: readonly string[]; forgottenBefore: number; knownHosts: NamedKnownHosts | undefined }[];
   /** Every modal question and quick pick: its text and how many paths were forgotten when it was shown. */
   asked: { message: string; forgottenBefore: number }[];
   /** `onEnded` of the manager: a bridge that ended by itself. */
@@ -100,19 +115,45 @@
   logs: string[];
 }
 
+/** The known-hosts file that an argv names, and its text at the moment of the read (`undefined`: the file is not on the disk). */
+export interface NamedKnownHosts {
+  file: string;
+  text: string | undefined;
+}
+
+const KNOWN_HOSTS_WORD = 'UserKnownHostsFile=';
+
+/** What `-o UserKnownHostsFile=<path>` of an argv names, the path bare or in double quotes. `undefined`: the argv names no such file. */
+export function knownHostsOf(argv: readonly string[]): NamedKnownHosts | undefined {
+  const word = argv.find((one) => one.startsWith(KNOWN_HOSTS_WORD));
+  if (word === undefined) {
+    return undefined;
+  }
+  const file = word.slice(KNOWN_HOSTS_WORD.length).replace(/^"(.*)"$/, '$1');
+  return { file, text: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined };
+}
+
+/** The names of the known-hosts files in this window's key folder of `storageDir`, sorted. The folder is the one `materializedKeysDir` names. */
+export function pinFiles(storageDir: string): string[] {
+  const dir = materializedKeysDir(storageDir);
+  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.startsWith('known_hosts-')).sort() : [];
+}
+
 export const ROW = { accountId: 'a1', node: { id: 'e1', name: 'box' } };
 export const KEY = 'a1:e1';
 
 function emptyWorld(parts: Parts): World {
   const children: HeldChild[] = [];
+  const bridgeArgvs: (readonly string[])[] = [];
   const ended: string[] = [];
-  const held: BridgeSpawner = () => {
+  const held: BridgeSpawner = (_command, argv) => {
     const child = heldChild();
     children.push(child);
+    bridgeArgvs.push(argv);
     return child;
   };
   const bridges = new SshBridgeManager(parts.spawn ?? held, (key) => void ended.push(key));
-  return { handlers: new Map(), bridges, children, forgotten: [], runs: [], asked: [], ended, infos: [], warnings: [], errors: [], logs: [] };
+  return { handlers: new Map(), bridges, children, bridgeArgvs, forgotten: [], runs: [], asked: [], ended, infos: [], warnings: [], errors: [], logs: [] };
 }
 
 /** A dialog that records its text and answers what the test says; one without buttons answers nothing. */
@@ -161,7 +202,7 @@
   const answer = parts.run ?? ((): SshExecOutcome => ran('600'));
   return {
     runSshExec: (argv: readonly string[]): Promise<SshExecOutcome> => {
-      w.runs.push({ argv, forgottenBefore: w.forgotten.length });
+      w.runs.push({ argv, forgottenBefore: w.forgotten.length, knownHosts: knownHostsOf(argv) });
       const index = w.runs.length - 1;
       return Promise.resolve().then(() => answer(index, argv));
     },
@@ -180,10 +221,16 @@
   };
 }
 
+/** The snapshot of the entry that the storage answers: with `hostKey` only when the test gave one. */
+function detailsOf(parts: Parts): Record<string, unknown> {
+  const pin = parts.hostKey === undefined ? {} : { hostKey: parts.hostKey };
+  return { id: ROW.node.id, name: ROW.node.name, isSshEnabled: true, host: parts.host ?? 'box.example', user: 'dev', ...pin };
+}
+
 /** Register the real agent commands over the stand-ins, and hand back what they registered and what they did. */
 export function world(parts: Parts = {}): World {
   const w = emptyWorld(parts);
-  const details = { id: ROW.node.id, name: ROW.node.name, isSshEnabled: true, host: parts.host ?? 'box.example', user: 'dev' };
+  const details = detailsOf(parts);
   const mod = loadWithVscode<{ registerAgentCommands(host: Record<string, unknown>): void }>('../commands/agentCommands', vscodeStub(w, parts), mocksOf(w, parts));
   const say = (_area: string, text: string): void => void w.logs.push(text);
   // The host is an untyped record on purpose, as in forgetAgentConsents.test.ts: only the fields these three roads read are
@@ -202,7 +249,7 @@
     sshAgent: {},
     state: {},
     storage: { getAccounts: () => [], getNodes: () => [], getNode: () => ({ id: ROW.node.id, name: ROW.node.name, details }) },
-    storageDir: '/storage',
+    storageDir: parts.storageDir ?? '/storage',
     vaultKeys: {},
   });
   return w;
```

What it adds, and nothing else:

- `Parts.hostKey`: the saved host key of the entry, as it is stored. Left out, the snapshot has no `hostKey`, as today (so N16's
  tests run on an unpinned entry, unchanged).
- `Parts.storageDir`: the storage folder of the window. A pin test gives a real folder of `ownedDir`. The default stays the
  text `/storage`.
- `Parts.answer` may return a promise. The dialog already answers on a promise callback, so a returned promise holds the
  question open until the test settles it. Q8a uses it.
- `World.bridgeArgvs`: the argv of every bridge that the default spawner started. Q1 reads it; E1.S3 will.
- `passwordLogin()`: a resolved credential with `auth: 'askpass'` and no key file.
- `pinFiles(storageDir)`: the names of the known-hosts files in `keys/<pid>/`, read from the folder that `materializedKeysDir`
  names (never a guessed path).
- `knownHostsOf(argv)` and `runs[i].knownHosts`: the file that an argv names as `UserKnownHostsFile`, bare or in double quotes
  (the form of E1.S1 for a path with white space), and its text at the moment of the run. In this story no argv of the three
  roads names such a file, so it is `undefined` in every run; QW proves the reader on argvs of its own, and E1.S3 uses it.

### 5.2 New `test/personRoadsPin.test.ts` — RED on c1, GREEN with §2, §3 and §4.2

The real `registerAgentCommands` over the world. `realForget` is set in every test that writes a file, so `forgetMaterializedKey`
is the real one, and `materializeKnownHosts` is the real one except in Q7a and Q7c. The storage folder is a real folder of
`ownedDir`. The key file of a call is a real file in another owned folder.

| Id | Setup and action | Expected | RED on c1 |
|---|---|---|---|
| Q0 (guard) | the fixtures against the real functions | the pin parses to the fixture key and forms the line `box.example <pin>`; `not a host key` does not parse; `-oProxyCommand=evil` forms no line | green |
| QW (guard) | `knownHostsOf` on four argvs of the test's own | a bare path and a path in double quotes give the file and its text; a file that is gone gives `text: undefined`; an argv with no such word gives `undefined` | green |
| Q1 (guard, 3 tests; the parent's test 1) | an entry with no `hostKey`, with `''`, with `' \n\t '`; a password login; *Open Remote Bridge…*, its socket check to the end, then *Install creds on host* answered yes | five argvs (the bridge, the sweep, the mode check, the probe, the install run); each holds `StrictHostKeyChecking=accept-new` and no word with `KnownHostsFile=`; no known-hosts file during a run; no error; the folder `keys` was never made | green |
| Q5 (3 tests; the parent's test 5) | a usable pin; the install answered yes; the login is a password, the person's own key file (a real file), a stored key (a real written file) | at the probe, at the question and at the install run: ONE pin file, the same file, named `known_hosts-e1-<uuid>`, holding the line of the entry; the written key file is there at all three; after the install: no known-hosts file, the written key file gone, the person's own file with its bytes | `Q5: the pin file of the call was not on the disk at the probe, at the question and at the install run` — `[0, 0, 0]` is not `[1, 1, 1]` (all three) |
| Q5b (the parent's test 5, on the bridge) | a usable pin, a password login; *Open*; *Close Remote Bridge*; then the test ends the process | after *Open*: one bridge, one pin file with the line; after *Close*: the same file with the same text; after the end: no known-hosts file | `Q5b: the pin file of the bridge is not on the disk while its ssh runs` |
| Q6 (12 tests; the parent's test 6) | the install and the bridge; a `hostKey` that does not parse, and the usable pin on the host `-oProxyCommand=evil`; a stored key, the person's own key file, a password | the errors are exactly `[<the opening of the road> + sentence A]`, the key form for the two key logins and the password form for the password; no `ssh` run; no bridge, no row, no *Bridge open to*; the written key file gone; the person's own file with its bytes; no known-hosts file | `Q6: the refusal of the unusable pin was not shown, or not in the form of the login` — `[]` is not the one sentence (all 12) |
| Q7a (2 tests; the parent's test 7) | a usable pin, a stored key (a real written file); `./hostKeyTrust` is the real module with a `materializeKnownHosts` that throws `ENOSPC: no space left on device` on its first call; the install, the bridge | the errors are exactly `[<the opening> + 'Could not write the saved host key of "box" to disk: ENOSPC: no space left on device']`; no `ssh` run; no bridge; the key file gone | `Q7a: the failed write of the pin file was not shown` — `[]` is not the one sentence (both) |
| Q7b (the parent's test 7, the real folder) | the storage folder holds a FILE named `keys`, so the real `materializeKnownHosts` cannot make its folder; a stored key (a real written file); the install | one error, `Cannot reach "box": Could not write the saved host key of "box" to disk: ` and the real error text; no `ssh` run; the key file gone; the file `keys` untouched | `Q7b: the failed write of the pin file was not shown once: ` |
| Q7c (the parent's test 7, the socket check) | a usable pin; the bridge with a password; the check with a stored key (a real written file); `materializeKnownHosts` throws on its SECOND call (the check's) | one bridge, open; the check ran no `ssh`; the log holds exactly one line that starts `socket check did not run`, and it is `socket check did not run: ` + sentence B; no error message; the check's key file gone; the pin file of the bridge still there | `Q7c: the socket check ran an ssh after its pin file could not be written` |
| Q8a (the parent's test 8) | a file `known_hosts-e1` is in the key folder; two installs of one pinned entry, each held open at its question | at the first question: one pin file; at the second: two, and the first is one of them; after the first question is answered no: exactly the other file, with its text; after the second: none; `known_hosts-e1` has its bytes | `Q8a: the first install holds no pin file at its question` |
| Q8b (the parent's test 8) | a file `known_hosts-e1` is in the key folder; a pinned entry; *Open* and the socket check to its end | at both runs of the check: the same two pin files; after the check: exactly one, and it is one of the two; after the end of the bridge's process: none; `known_hosts-e1` has its bytes | `Q8b: the bridge and its socket check do not hold two distinct pin files during the check` — `[0, 0]` is not `[2, 2]` |
| QS (a scan that stays) | the source text of `commands/agentCommands.ts` | it holds three `resolveExecAuth(`, and each is the first argument of a guard whose second argument is `(auth) => writePersonPin(storageDir, <entity or details>, auth)` | `QS: a road keeps the answer of the resolve under a name, or hands its guard another pin writer` — `0 !== 3` |

In every RED above the test's road ran on the unchanged product as the row says (the install asked and ran, the bridge started,
the check ran twice): what is missing is the file, the refusal or the sentence. Q6 on the host that forms no line is red on
c1 for another reason than Q6 on the text that does not parse: there the old product starts no `ssh` either (the host gives no
argv), and it shows a warning in place of the sentence. Both are red at the same assertion.

QS has two assertions. The first, "three resolves are found", keeps the scan from passing by matching nothing. It is green on
c1; the second is red there.

The whole file, as measured:

```ts
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test, TestContext } from 'node:test';
import { cleanupScope, ownedDir, ownedFile } from '../../scripts/lib/leftovers.cjs';
import { formatHostKey, knownHostsLine, parseHostKey } from '../hostKeyPin';
import { materializedKeysDir } from '../materializedKeys';
import type { ExecAuth } from '../sshExecAuth';
import { KEY, Parts, World, click, knownHostsOf, ownKeyFile, passwordLogin, pinFiles, ran, settled, world, writtenKey } from './personRoadsWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * G1, E1.S2: the saved host key of one call on the three roads of the person. A pin that is there and can be used is written to a
 * file of that call alone and deleted with the call, whether or not a key file was written; a pin that is there and cannot be
 * used, and a pin file that cannot be written, start no `ssh`; an entry with no pin runs as before. The argv does not name the
 * file yet: that is E1.S3.
 *
 * <p>`materializeKnownHosts` and `forgetMaterializedKey` are the real ones (`realForget`), in a real storage folder that this file
 * owns, so every pin file here is a real file. The one exception is Q7a to Q7c, which stand in for `./hostKeyTrust` to make the
 * write fail.</p>
 */

const scope = cleanupScope();
after(() => scope.close());

const HOST_KEY = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' };
const PIN = formatHostKey(HOST_KEY);
const PIN_LINE = knownHostsLine('box.example', undefined, HOST_KEY);
const NOT_A_KEY = 'not a host key';
const BAD_HOST = '-oProxyCommand=evil';
/** The name of a pin file of one call: the entry's id and a uuid. `known_hosts-e1`, the name of the agent's exec, does not match. */
const CALL_PIN = /^known_hosts-e1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const PROBE_OK = 'creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n';
const INSTALLED = 'creds-install: installed /home/dev/.local/bin/creds\n';

const KEY_FORM =
  'The saved host key of "box" cannot be used, so nothing was sent to that host. Get the host\'s key fingerprint from the person who runs the server. Then use Connect SSH on this entry, and go on only if it shows that fingerprint: Trust and connect saves the key.';
const PASSWORD_FORM =
  'The saved host key of "box" cannot be used, so nothing was sent to that host. Do not use Connect SSH to save it again: this entry signs in with a password, and when Connect SSH cannot read the host\'s key first, it sends the password without checking the host. There is no safe repair for such an entry yet; the bridge and the install stay refused for it.';
const WRITE_FAILED = 'Could not write the saved host key of "box" to disk: ';
const DISK_FULL = 'ENOSPC: no space left on device';

const yes = (_message: string, rest: readonly unknown[]): string | undefined => rest.find((one): one is string => typeof one === 'string');

/** A real storage folder of one test: owned, and removed when this file's tests end. */
const storage = (what: string): string => ownedDir(scope, what);

/** A real file that stands for a key file of one call, or for a key file of the person: outside the storage folder. */
function keyFile(what: string): string {
  const file = ownedFile(scope, what, 'call.key');
  fs.writeFileSync(file, 'not a key', { mode: 0o600 });
  return file;
}

/** The pin files of calls that are on the disk now, with their text. */
function callPins(dir: string): { name: string; text: string }[] {
  return pinFiles(dir)
    .filter((name) => CALL_PIN.test(name))
    .map((name) => ({ name, text: fs.readFileSync(path.join(materializedKeysDir(dir), name), 'utf8') }));
}

/** A promise the test settles. */
function held<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Open a bridge and let its socket check run to its end: the check waits 1.5 s on a timer between its two runs. */
async function bridged(t: TestContext, parts: Parts): Promise<World> {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = world(parts);
  await click(w, 'openRemoteBridge');
  await settled();
  t.mock.timers.tick(1500);
  await settled();
  return w;
}

test('Q0: the fixtures are what the real functions say: the pin parses and forms a line, the other text does not parse, the other host forms no line', () => {
  assert.deepEqual(parseHostKey(PIN), HOST_KEY);
  assert.equal(PIN_LINE, `box.example ${PIN}\n`);
  assert.equal(parseHostKey(NOT_A_KEY), undefined);
  assert.equal(knownHostsLine(BAD_HOST, undefined, HOST_KEY), undefined);
});

test('QW: the world reads the known-hosts file that an argv names, bare and in double quotes, and none when the argv names none', () => {
  const file = ownedFile(scope, 'qw', 'known hosts');
  fs.writeFileSync(file, 'a line\n');

  assert.deepEqual(knownHostsOf(['-o', `UserKnownHostsFile=${file}`, 'dev@box']), { file, text: 'a line\n' });
  assert.deepEqual(knownHostsOf(['-o', `UserKnownHostsFile="${file}"`, 'dev@box']), { file, text: 'a line\n' });
  assert.deepEqual(knownHostsOf(['-o', `UserKnownHostsFile=${file}.gone`]), { file: `${file}.gone`, text: undefined });
  assert.equal(knownHostsOf(['-o', 'StrictHostKeyChecking=accept-new', 'dev@box']), undefined);
});

for (const [label, hostKey] of [['no saved host key', undefined], ['an empty saved host key', ''], ['a saved host key of white space', ' \n\t ']] as const) {
  test(`Q1: an entry with ${label} runs as before: accept-new in all five runs, no known-hosts file, nothing written`, async (t) => {
    const dir = storage('q1');
    const seen: string[][] = [];
    const answers = ['', '600', PROBE_OK, INSTALLED];
    const run = (index: number): ReturnType<typeof ran> => (seen.push(pinFiles(dir)), ran(answers[index]));
    const w = await bridged(t, { storageDir: dir, hostKey, clicks: [passwordLogin(), passwordLogin()], checks: [passwordLogin()], answer: yes, run });
    await click(w, 'installRemoteCli');

    const argvs = [...w.bridgeArgvs, ...w.runs.map((one) => one.argv)];
    assert.equal(argvs.length, 5, `the five runs did not all start (the bridge, the sweep, the mode check, the probe, the install): ${argvs.length}`);
    for (const argv of argvs) {
      assert.ok(argv.includes('StrictHostKeyChecking=accept-new'), `Q1: an unpinned run does not carry accept-new: ${argv.join(' ')}`);
      assert.equal(argv.find((word) => /KnownHostsFile=/.test(word)), undefined, 'Q1: an unpinned run names a known-hosts file');
    }
    assert.deepEqual(w.runs.map((one) => one.knownHosts), [undefined, undefined, undefined, undefined]);
    assert.deepEqual(seen, [[], [], [], []], 'Q1: a pin file was on the disk during a run of an unpinned entry');
    assert.deepEqual(w.errors, [], `Q1: an unpinned entry was refused: ${w.errors.join(' | ')}`);
    assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'Q1: an unpinned entry wrote into the key folder');
  });
}

/** The three logins of an entry whose pin can be used: what the resolve answers, and the file that must stay or go. */
const LOGINS: readonly { label: string; make(): { credential: ExecAuth; written?: string; own?: string } }[] = [
  { label: 'a password', make: () => ({ credential: passwordLogin() }) },
  {
    label: "the person's own key file",
    make: () => {
      const own = keyFile('own');
      return { credential: ownKeyFile(own), own };
    },
  },
  {
    label: 'a stored key',
    make: () => {
      const written = keyFile('written');
      return { credential: writtenKey(written), written };
    },
  },
];

for (const login of LOGINS) {
  test(`Q5: the install of a pinned entry with ${login.label} writes ONE pin file, keeps it for both runs and the question, and deletes it`, async () => {
    const dir = storage('q5');
    const { credential, written, own } = login.make();
    const seen: { name: string; text: string }[][] = [];
    const keyThere: boolean[] = [];
    const look = (): void => {
      seen.push(callPins(dir));
      keyThere.push(written === undefined || fs.existsSync(written));
    };
    const w = world({
      storageDir: dir,
      hostKey: PIN,
      realForget: true,
      clicks: [credential],
      answer: (message, rest) => (look(), yes(message, rest)),
      run: (index) => (look(), ran(index === 0 ? PROBE_OK : INSTALLED)),
    });
    await click(w, 'installRemoteCli');

    assert.equal(w.runs.length, 2, `the probe and the install did not both run: ${w.errors.join(' | ')}`);
    assert.deepEqual(seen.map((one) => one.length), [1, 1, 1], 'Q5: the pin file of the call was not on the disk at the probe, at the question and at the install run');
    assert.match(seen[0][0].name, CALL_PIN);
    assert.deepEqual(seen, [seen[0], seen[0], seen[0]], 'Q5: the two runs and the question did not see one and the same pin file');
    assert.equal(seen[0][0].text, PIN_LINE, 'Q5: the pin file does not hold the line of the entry');
    assert.deepEqual(keyThere, [true, true, true], 'Q5: the key file of the call was deleted before a run that reads it');
    assert.deepEqual(pinFiles(dir), [], 'Q5: the install left its pin file');
    assert.equal(written === undefined ? false : fs.existsSync(written), false, 'Q5: the install left its key file');
    assert.equal(own === undefined ? 'not a key' : fs.readFileSync(own, 'utf8'), 'not a key', "Q5: the person's own key file was touched");
  });
}

test('Q5b: the bridge of a pinned password entry keeps its pin file while its ssh runs, also after Close, and deletes it when the ssh has ended', async () => {
  const dir = storage('q5b');
  const w = world({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin()] });
  await click(w, 'openRemoteBridge');
  await settled();

  assert.equal(w.children.length, 1, `no bridge was started: ${w.errors.join(' | ')}`);
  const open = callPins(dir);
  assert.equal(open.length, 1, 'Q5b: the pin file of the bridge is not on the disk while its ssh runs');
  assert.equal(open[0].text, PIN_LINE);

  await click(w, 'closeRemoteBridge');
  await settled();
  assert.deepEqual(callPins(dir), open, 'Q5b: Close deleted the pin file of an ssh that has not ended');

  w.children[0].end(null);
  await settled();
  assert.deepEqual(pinFiles(dir), [], 'Q5b: the bridge ended and its pin file stays');
});

/** The two pins that are there and cannot be used. */
const UNUSABLE: readonly { label: string; parts: Parts }[] = [
  { label: 'a saved host key that does not parse', parts: { hostKey: NOT_A_KEY } },
  { label: 'a saved host key on a host that cannot form a known_hosts line', parts: { hostKey: PIN, host: BAD_HOST } },
];

/** The three logins, and the form of sentence A that each must be shown. */
const FORMS: readonly { label: string; form: string; make(): { credential: ExecAuth; written?: string; own?: string } }[] = [
  { ...LOGINS[2], form: KEY_FORM },
  { ...LOGINS[1], form: KEY_FORM },
  { ...LOGINS[0], form: PASSWORD_FORM },
];

const ROADS = [
  { command: 'installRemoteCli', opening: 'Cannot reach "box": ' },
  { command: 'openRemoteBridge', opening: 'Cannot bridge to "box": ' },
] as const;

for (const road of ROADS) {
  for (const pin of UNUSABLE) {
    for (const login of FORMS) {
      test(`Q6: ${road.command} with ${login.label} and ${pin.label} starts no ssh and shows sentence A in the form of that login`, async () => {
        const dir = storage('q6');
        const { credential, written, own } = login.make();
        const w = world({ storageDir: dir, realForget: true, clicks: [credential], ...pin.parts });
        await click(w, road.command);
        await settled();

        assert.deepEqual(w.errors, [`${road.opening}${login.form}`], 'Q6: the refusal of the unusable pin was not shown, or not in the form of the login');
        assert.equal(w.runs.length, 0, 'Q6: an ssh run started on an entry whose saved host key cannot be used');
        assert.equal(w.children.length, 0, 'Q6: a bridge was started on an entry whose saved host key cannot be used');
        assert.equal(w.bridges.isOpen(KEY), false);
        assert.equal(w.infos.some((text) => text.includes('Bridge open to')), false, 'Q6: the bridge was announced as open');
        assert.equal(written === undefined ? false : fs.existsSync(written), false, 'Q6: the refused call left its key file');
        assert.equal(own === undefined ? 'not a key' : fs.readFileSync(own, 'utf8'), 'not a key', "Q6: the person's own key file was touched");
        assert.deepEqual(pinFiles(dir), [], 'Q6: the refused call left a file in the key folder');
      });
    }
  }
}

/** `./hostKeyTrust` with a `materializeKnownHosts` that throws on the calls the test names (1-based) and is the real one on the others. */
function failingTrust(failOn: readonly number[]): Record<string, unknown> {
  const real = loadWithVscode<typeof import('../hostKeyTrust')>('../hostKeyTrust', {});
  let calls = 0;
  return {
    ...real,
    materializeKnownHosts: (...args: Parameters<typeof real.materializeKnownHosts>): string | undefined => {
      calls += 1;
      if (failOn.includes(calls)) {
        throw new Error(DISK_FULL);
      }
      return real.materializeKnownHosts(...args);
    },
  };
}

for (const road of ROADS) {
  test(`Q7a: ${road.command}: a pin file that cannot be written starts no ssh, shows sentence B, and the key file of the call is deleted`, async () => {
    const dir = storage('q7a');
    const written = keyFile('written');
    const w = world({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [writtenKey(written)], mocks: { './hostKeyTrust': failingTrust([1]) } });
    await click(w, road.command);
    await settled();

    assert.deepEqual(w.errors, [`${road.opening}${WRITE_FAILED}${DISK_FULL}`], 'Q7a: the failed write of the pin file was not shown');
    assert.equal(w.runs.length, 0, 'Q7a: an ssh run started after the pin file could not be written');
    assert.equal(w.children.length, 0, 'Q7a: a bridge was started after the pin file could not be written');
    assert.equal(fs.existsSync(written), false, 'Q7a: the key file of the call stays after the pin file could not be written');
  });
}

test('Q7b: a REAL folder that cannot be written: the install starts no ssh, shows sentence B with the error of the disk, and deletes its key file', async () => {
  const dir = storage('q7b');
  fs.writeFileSync(path.join(dir, 'keys'), 'a file where the key folder would be');
  const written = keyFile('written');
  const w = world({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [writtenKey(written)] });
  await click(w, 'installRemoteCli');

  assert.equal(w.errors.length, 1, `Q7b: the failed write of the pin file was not shown once: ${w.errors.join(' | ')}`);
  assert.match(w.errors[0], /^Cannot reach "box": Could not write the saved host key of "box" to disk: \S/);
  assert.equal(w.runs.length, 0, 'Q7b: an ssh run started after the pin file could not be written');
  assert.equal(fs.existsSync(written), false, 'Q7b: the key file of the call stays after the pin file could not be written');
  assert.equal(fs.readFileSync(path.join(dir, 'keys'), 'utf8'), 'a file where the key folder would be');
});

test('Q7c: the socket check whose pin file cannot be written runs no ssh, says so in the log, deletes its key file, and leaves the bridge and its pin file', async (t) => {
  const dir = storage('q7c');
  const written = keyFile('written');
  const parts: Parts = { storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin()], checks: [writtenKey(written)] };
  const w = await bridged(t, { ...parts, mocks: { './hostKeyTrust': failingTrust([2]) } });

  assert.equal(w.children.length, 1, `no bridge was started: ${w.errors.join(' | ')}`);
  assert.equal(w.runs.length, 0, 'Q7c: the socket check ran an ssh after its pin file could not be written');
  assert.deepEqual(
    w.logs.filter((line) => line.startsWith('socket check did not run')),
    [`socket check did not run: ${WRITE_FAILED}${DISK_FULL}`],
    'Q7c: the socket check that did not run is not in the log',
  );
  assert.deepEqual(w.errors, [], 'Q7c: the socket check showed a message of its own for a pin file that could not be written');
  assert.equal(fs.existsSync(written), false, 'Q7c: the socket check left its key file');
  assert.equal(w.bridges.isOpen(KEY), true);
  assert.equal(callPins(dir).length, 1, 'Q7c: the pin file of the bridge is not on the disk while its ssh runs');
});

/** The file that the agent's exec and a Connect terminal use, `known_hosts-e1`, as an earlier call of theirs left it. */
function olderPin(dir: string): string {
  const file = path.join(materializedKeysDir(dir), 'known_hosts-e1');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, 'the pin of another road\n', { mode: 0o600 });
  return file;
}

test('Q8a: two installs of one pinned entry that overlap hold two pin files; each end deletes only its own, and known_hosts-e1 stays', async () => {
  const dir = storage('q8a');
  const older = olderPin(dir);
  const questions = [held<string | undefined>(), held<string | undefined>()];
  let asked = 0;
  const w = world({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin(), passwordLogin()], run: () => ran(PROBE_OK), answer: () => questions[asked++].promise });

  const first = click(w, 'installRemoteCli');
  await settled();
  const one = callPins(dir);
  const second = click(w, 'installRemoteCli');
  await settled();
  const two = callPins(dir);

  assert.equal(one.length, 1, 'Q8a: the first install holds no pin file at its question');
  assert.equal(two.length, 2, 'Q8a: two installs that overlap do not hold two distinct pin files');
  assert.ok(two.some((file) => file.name === one[0].name));

  questions[0].resolve(undefined);
  await first;
  assert.deepEqual(callPins(dir), two.filter((file) => file.name !== one[0].name), 'Q8a: the end of the first install did not delete exactly its own pin file');

  questions[1].resolve(undefined);
  await second;
  assert.deepEqual(callPins(dir), [], 'Q8a: the second install left its pin file');
  assert.equal(fs.readFileSync(older, 'utf8'), 'the pin of another road\n', 'Q8a: known_hosts-e1 was touched');
  assert.equal(w.runs.length, 2);
});

test('Q8b: a bridge and its socket check hold two pin files; the check deletes only its own, and the bridge its own when its ssh has ended', async (t) => {
  const dir = storage('q8b');
  const older = olderPin(dir);
  const seen: { name: string; text: string }[][] = [];
  const run = (): ReturnType<typeof ran> => (seen.push(callPins(dir)), ran('600'));
  const w = await bridged(t, { storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin()], checks: [passwordLogin()], run });

  assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
  assert.deepEqual(seen.map((one) => one.length), [2, 2], 'Q8b: the bridge and its socket check do not hold two distinct pin files during the check');
  assert.deepEqual(seen[1], seen[0], 'Q8b: the two runs of the check did not see the same two files');

  const left = callPins(dir);
  assert.equal(left.length, 1, 'Q8b: the end of the check did not leave exactly the pin file of the bridge');
  assert.ok(seen[0].some((file) => file.name === left[0].name && file.text === left[0].text), 'Q8b: the file that stays is not one of the two');

  w.children[0].end(0);
  await settled();
  assert.deepEqual(callPins(dir), [], 'Q8b: the bridge ended and its pin file stays');
  assert.equal(fs.readFileSync(older, 'utf8'), 'the pin of another road\n', 'Q8b: known_hosts-e1 was touched');
});

test('QS: on the three roads the answer of the resolve has no name: each resolveExecAuth( of agentCommands.ts is the first argument of a guard that is given writePersonPin', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'commands', 'agentCommands.ts'), 'utf8');
  const resolves = source.match(/\bresolveExecAuth\s*\(/g) ?? [];
  const guarded = source.match(/\bwithWrittenKey(?:UntilExit)?\(await resolveExecAuth\([^\n]*?\), \(auth\) => writePersonPin\(storageDir, (?:entity|details), auth\), /g) ?? [];

  assert.equal(resolves.length, 3, `the scan does not find the three resolves of the three roads: ${resolves.length}`);
  assert.equal(guarded.length, 3, 'QS: a road keeps the answer of the resolve under a name, or hands its guard another pin writer');
});
```

### 5.3 New `test/personPin.test.ts` — written together with §2

`writePersonPin` alone, over the REAL `hostKeyTrust.ts` in a real owned folder, except P7 and P9, which stand in for it.

| Id | What it proves |
|---|---|
| P1 | `undefined`, `''`, `'   '` and `' \n\t '` are unpinned for both logins: the answer is exactly `{ ok: true }` and the folder `keys` is never made |
| P2 | a usable pin is written as `known_hosts-e1-<uuid>` in the folder that `materializedKeysDir` names, with the line that `knownHostsLine` forms (a port of 2222 gives `[box.example]:2222`); it is the only file there; the fixture passes the real `parseHostKey` |
| P2b | on POSIX the file has mode `0600` and its folder `0700` (skipped on Windows) |
| P3 | two calls of one entry write two files; a file `known_hosts-e1` that was there has its bytes |
| P4 | four texts that the real parser refuses (`not a host key`, a type with no key, a key that is too short, a type that is not accepted) give exactly `{ ok: false, message: <the key form> }` for a key login; nothing is written |
| P5 | the same on a password login gives exactly the password form; that form does not hold `Trust and connect` or `go on only if` |
| P6 | a usable pin on a host that forms no line gives the key form, and on an entry with no host the password form for a password login; nothing is written |
| P7 | a `materializeKnownHosts` that throws an `Error`, and one that throws a string, give exactly sentence B with the text; the function does not throw |
| P8 | a REAL folder that cannot be written (a file named `keys` stands where the folder would be) gives sentence B with the real error |
| P9 | the writer hands `materializeKnownHosts` the storage folder, the snapshot (the same object) and a uuid; two calls get two uuids |

None of these can be red before `personPin.ts` exists (the module would not load). N4 to N7, N14 and N17 prove them.

The whole file, as measured:

```ts
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { formatHostKey, knownHostsLine, parseHostKey } from '../hostKeyPin';
import { materializedKeysDir } from '../materializedKeys';
import type { EntityMetadata } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * The pin of one call on the three roads of the person (G1, `personPin.ts`), alone: its three answers, the two forms of sentence A
 * word for word, sentence B, and that it never throws. `materializeKnownHosts` is the REAL one, in a real folder that this file
 * owns, except in P7. The guards that call it are `writtenKey.test.ts`; the roads are `personRoadsPin.test.ts`.
 */

type PersonPin = typeof import('../personPin');

const scope = cleanupScope();
after(() => scope.close());

const HOST_KEY = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' };
const PIN = formatHostKey(HOST_KEY);
const CALL_PIN = /^known_hosts-e1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const KEY_FORM =
  'The saved host key of "box" cannot be used, so nothing was sent to that host. Get the host\'s key fingerprint from the person who runs the server. Then use Connect SSH on this entry, and go on only if it shows that fingerprint: Trust and connect saves the key.';
const PASSWORD_FORM =
  'The saved host key of "box" cannot be used, so nothing was sent to that host. Do not use Connect SSH to save it again: this entry signs in with a password, and when Connect SSH cannot read the host\'s key first, it sends the password without checking the host. There is no safe repair for such an entry yet; the bridge and the install stay refused for it.';

function entity(over: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: 'e1', name: 'box', isSshEnabled: true, host: 'box.example', user: 'dev', ...over };
}

/** `personPin.ts` over the real `hostKeyTrust.ts`, or over the stand-ins the test names. */
const pinModule = (mocks: Record<string, unknown> = {}): PersonPin => loadWithVscode<PersonPin>('../personPin', {}, mocks);

/** What is in this window's key folder of `dir`; none when the folder was never made. */
function written(dir: string): string[] {
  const keys = materializedKeysDir(dir);
  return fs.existsSync(keys) ? fs.readdirSync(keys).sort() : [];
}

test('P1: no saved host key, an empty one and one of white space are unpinned: the answer holds no file and nothing is written', () => {
  const dir = ownedDir(scope, 'p1');
  const mod = pinModule();

  for (const hostKey of [undefined, '', '   ', ' \n\t ']) {
    assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey }), 'key'), { ok: true });
    assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey }), 'askpass'), { ok: true });
  }
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P1: an unpinned entry wrote into the key folder');
});

test('P2: a saved host key that can be used is written to a file of this call: known_hosts-<id>-<uuid> in the key folder, the line of the entry', () => {
  const dir = ownedDir(scope, 'p2');
  assert.deepEqual(parseHostKey(PIN), HOST_KEY, 'the fixture is not a pin that the real parser reads');

  const answer = pinModule().writePersonPin(dir, entity({ hostKey: PIN, port: 2222 }), 'askpass');

  assert.equal(answer.ok, true);
  const file = answer.ok ? answer.knownHostsFile : undefined;
  assert.ok(file !== undefined, 'P2: a pinned entry got no pin file');
  assert.equal(path.dirname(file), materializedKeysDir(dir));
  assert.match(path.basename(file), CALL_PIN);
  assert.equal(fs.readFileSync(file, 'utf8'), knownHostsLine('box.example', 2222, HOST_KEY));
  assert.deepEqual(written(dir), [path.basename(file)]);
});

test('P2b: on POSIX the pin file is the owner\'s alone, in a folder that is the owner\'s alone', { skip: process.platform === 'win32' }, () => {
  const dir = ownedDir(scope, 'p2b');

  const answer = pinModule().writePersonPin(dir, entity({ hostKey: PIN }), 'key');

  const file = answer.ok ? answer.knownHostsFile : undefined;
  assert.ok(file !== undefined);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
});

test('P3: two calls of one entry write two distinct files, and neither writes or replaces known_hosts-<id>', () => {
  const dir = ownedDir(scope, 'p3');
  const older = path.join(materializedKeysDir(dir), 'known_hosts-e1');
  fs.mkdirSync(path.dirname(older), { recursive: true, mode: 0o700 });
  fs.writeFileSync(older, 'the pin of another road\n');
  const mod = pinModule();

  const first = mod.writePersonPin(dir, entity({ hostKey: PIN }), 'key');
  const second = mod.writePersonPin(dir, entity({ hostKey: PIN }), 'key');

  const files = [first, second].map((answer) => (answer.ok ? answer.knownHostsFile : undefined));
  assert.ok(files[0] !== undefined && files[1] !== undefined);
  assert.notEqual(files[0], files[1], 'P3: two calls share one pin file');
  assert.deepEqual(written(dir), ['known_hosts-e1', path.basename(files[0]), path.basename(files[1])].sort());
  assert.equal(fs.readFileSync(older, 'utf8'), 'the pin of another road\n');
});

test('P4: a saved host key that does not parse is refused with sentence A, the key form for a key login, word for word; nothing is written', () => {
  const dir = ownedDir(scope, 'p4');
  const mod = pinModule();

  for (const hostKey of ['not a host key', 'ssh-ed25519', 'ssh-ed25519 short', 'ssh-dss AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY']) {
    assert.equal(parseHostKey(hostKey), undefined, `the fixture ${hostKey} is a pin that the real parser reads`);
    assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey }), 'key'), { ok: false, message: KEY_FORM });
  }
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P4: a refused pin wrote into the key folder');
});

test('P5: the same pin on a password login is refused with the password form, word for word, which never sends the person to Connect SSH to save it', () => {
  const dir = ownedDir(scope, 'p5');

  const answer = pinModule().writePersonPin(dir, entity({ hostKey: 'not a host key' }), 'askpass');

  assert.deepEqual(answer, { ok: false, message: PASSWORD_FORM });
  assert.equal(PASSWORD_FORM.includes('Trust and connect'), false);
  assert.equal(PASSWORD_FORM.includes('go on only if'), false);
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P5: a refused pin wrote into the key folder');
});

test('P6: a pin that parses on a host that cannot form a known_hosts line, or on no host, is refused with sentence A too; nothing is written', () => {
  const dir = ownedDir(scope, 'p6');
  const mod = pinModule();

  assert.equal(knownHostsLine('-oProxyCommand=evil', undefined, HOST_KEY), undefined, 'the fixture host forms a line');
  assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey: PIN, host: '-oProxyCommand=evil' }), 'key'), { ok: false, message: KEY_FORM });
  assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey: PIN, host: undefined }), 'askpass'), { ok: false, message: PASSWORD_FORM });
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P6: a refused pin wrote into the key folder');
});

test('P7: a write that throws is refused with sentence B and the text of the error, for an Error and for a thrown string; it does not throw', () => {
  const throwing = (thrown: unknown): PersonPin => pinModule({ './hostKeyTrust': { materializeKnownHosts: (): never => { throw thrown; } } });

  assert.deepEqual(throwing(new Error('ENOSPC: no space left on device')).writePersonPin('/storage', entity({ hostKey: PIN }), 'key'), {
    ok: false,
    message: 'Could not write the saved host key of "box" to disk: ENOSPC: no space left on device',
  });
  assert.deepEqual(throwing('the disk is gone').writePersonPin('/storage', entity({ hostKey: PIN }), 'askpass'), {
    ok: false,
    message: 'Could not write the saved host key of "box" to disk: the disk is gone',
  });
});

test('P8: a REAL folder that cannot be written is refused with sentence B, and the real error is in it', () => {
  const dir = ownedDir(scope, 'p8');
  fs.writeFileSync(path.join(dir, 'keys'), 'a file where the key folder would be');

  const answer = pinModule().writePersonPin(dir, entity({ hostKey: PIN }), 'key');

  assert.equal(answer.ok, false);
  assert.match(answer.ok ? '' : answer.message, /^Could not write the saved host key of "box" to disk: \S/);
});

test('P9: the writer hands materializeKnownHosts the storage folder, the snapshot as it is, and a new uuid per call', () => {
  const calls: unknown[][] = [];
  const recording = { './hostKeyTrust': { materializeKnownHosts: (...args: unknown[]): string => (calls.push(args), `/storage/pin-${calls.length}`) } };
  const mod = pinModule(recording);
  const snapshot = entity({ hostKey: PIN });

  assert.deepEqual(mod.writePersonPin('/storage', snapshot, 'key'), { ok: true, knownHostsFile: '/storage/pin-1' });
  assert.deepEqual(mod.writePersonPin('/storage', snapshot, 'key'), { ok: true, knownHostsFile: '/storage/pin-2' });

  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], '/storage');
  assert.equal(calls[0][1], snapshot);
  assert.match(String(calls[0][2]), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(calls[0][2], calls[1][2], 'P9: two calls got one suffix');
});
```

### 5.4 `test/writtenKey.test.ts` — U1 to U8 get the writer, and nine more tests

**What changes in N16's tests, and why.** The pin writer is a REQUIRED parameter of both guards, so a call that names none does
not compile. Each of the 17 calls of a guard in U1 to U8 and U3b gets `NO_PIN` as its second argument, the pin writer of an
unpinned entry (`() => ({ ok: true })`). Nothing else of these nine tests changes: not a name, not an assertion, not a number.
With `NO_PIN` the guards do what they did before, so the nine tests still prove what they proved: the key file. Their `run` and
`start` functions take no parameter, which is still allowed.

The diff of the file up to the end of U8, as measured: the import, the first comment, the three writers, and the 17 calls:

```diff
--- a/src_vs_code/src/test/writtenKey.test.ts
+++ b/src_vs_code/src/test/writtenKey.test.ts
@@ -1,11 +1,14 @@
 import assert from 'node:assert/strict';
 import { test } from 'node:test';
 import type { ExecAuth } from '../sshExecAuth';
+import type { CallAuth, PinWriter } from '../writtenKey';
 import { loadWithVscode } from './vscodeStub';
 
 /**
- * The guards of a written key file (N16), alone: `withWrittenKey` for a road that ends, `withWrittenKeyUntilExit` for a road that
- * hands the file to a process. The roads themselves are `personRoadsForgetKey.test.ts` and `bridgeKeyHandoff.test.ts`.
+ * The guards of the two files of one call (N16, G1), alone: `withWrittenKey` for a road that ends, `withWrittenKeyUntilExit` for a
+ * road that hands the files to a process. U1 to U8 are N16's, about the key file, with the pin writer of an unpinned entry. U9 to
+ * U17 are about the pin: when the writer is called, the ONE value that `run` and `start` get, and the delete of the pin file.
+ * The roads themselves are `personRoadsForgetKey.test.ts`, `bridgeKeyHandoff.test.ts` and `personRoadsPin.test.ts`.
  */
 
 type Guards = typeof import('../writtenKey');
@@ -16,6 +19,14 @@
 const PASSWORD: ExecAuth = { ok: true, env: {}, auth: 'askpass' };
 const REFUSED: ExecAuth = { ok: false, reason: 'no_credential', message: 'nothing stored' };
 
+const PIN_FILE = '/storage/keys/1/known_hosts-e1-unit';
+/** The pin writer of an unpinned entry: nothing is written. */
+const NO_PIN: PinWriter = () => ({ ok: true });
+/** The pin writer of a pinned entry: the path of the file it wrote. */
+const PINNED: PinWriter = () => ({ ok: true, knownHostsFile: PIN_FILE });
+/** The pin writer of an entry whose saved host key cannot be used. */
+const BAD_PIN: PinWriter = () => ({ ok: false, message: 'the saved host key cannot be used' });
+
 function guards(): { mod: Guards; forgotten: string[] } {
   const forgotten: string[] = [];
   const mod = loadWithVscode<Guards>('../writtenKey', {}, { './keyInstaller': { forgetMaterializedKey: (keyPath: string): void => void forgotten.push(keyPath) } });
@@ -39,7 +50,7 @@
   const { mod, forgotten } = guards();
   const run = held<string>();
 
-  const result = mod.withWrittenKey(WRITTEN, () => run.promise);
+  const result = mod.withWrittenKey(WRITTEN, NO_PIN, () => run.promise);
   await turn();
   assert.deepEqual(forgotten, [], 'the key file was deleted while the run was going');
 
@@ -52,8 +63,8 @@
   const { mod, forgotten } = guards();
   const failure = new Error('the run failed');
 
-  await assert.rejects(mod.withWrittenKey(WRITTEN, () => Promise.reject(failure)), (error) => error === failure);
-  await assert.rejects(mod.withWrittenKey(WRITTEN, () => { throw failure; }), (error) => error === failure);
+  await assert.rejects(mod.withWrittenKey(WRITTEN, NO_PIN, () => Promise.reject(failure)), (error) => error === failure);
+  await assert.rejects(mod.withWrittenKey(WRITTEN, NO_PIN, () => { throw failure; }), (error) => error === failure);
 
   assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
 });
@@ -61,9 +72,9 @@
 test('U3: withWrittenKey deletes nothing for a key file of the person or for a refusal', async () => {
   const { mod, forgotten } = guards();
 
-  await mod.withWrittenKey(OWN_FILE, () => Promise.resolve());
-  await mod.withWrittenKey(REFUSED, () => Promise.resolve());
-  await assert.rejects(mod.withWrittenKey(OWN_FILE, () => Promise.reject(new Error('the run failed'))));
+  await mod.withWrittenKey(OWN_FILE, NO_PIN, () => Promise.resolve());
+  await mod.withWrittenKey(REFUSED, NO_PIN, () => Promise.resolve());
+  await assert.rejects(mod.withWrittenKey(OWN_FILE, NO_PIN, () => Promise.reject(new Error('the run failed'))));
 
   assert.deepEqual(forgotten, []);
 });
@@ -71,8 +82,8 @@
 test('U3b: withWrittenKey deletes nothing for a password credential, which writes no key file', async () => {
   const { mod, forgotten } = guards();
 
-  await mod.withWrittenKey(PASSWORD, () => Promise.resolve());
-  await assert.rejects(mod.withWrittenKey(PASSWORD, () => Promise.reject(new Error('the run failed'))));
+  await mod.withWrittenKey(PASSWORD, NO_PIN, () => Promise.resolve());
+  await assert.rejects(mod.withWrittenKey(PASSWORD, NO_PIN, () => Promise.reject(new Error('the run failed'))));
 
   assert.deepEqual(forgotten, []);
 });
@@ -82,7 +93,7 @@
   const exited = held<number | null>();
   const started = { process: { exited: exited.promise } };
 
-  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, () => started), started, 'the started thing was not handed back');
+  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => started), started, 'the started thing was not handed back');
   await turn();
   assert.deepEqual(forgotten, [], 'the key file was deleted while its process runs');
 
@@ -95,10 +106,10 @@
   const { mod, forgotten } = guards();
   const failure = new Error('spawn EACCES');
 
-  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, () => undefined), undefined);
+  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => undefined), undefined);
   assert.deepEqual(forgotten, [KEY_FILE]);
 
-  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, () => { throw failure; }), (error) => error === failure);
+  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => { throw failure; }), (error) => error === failure);
   assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
 });
 
@@ -107,7 +118,7 @@
   // What a broken spawner could hand back: a process with no `exited`. The attach throws; the finally is then the one delete.
   const broken = { process: { get exited(): Promise<unknown> { throw new TypeError('no exited'); } } };
 
-  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, () => broken), TypeError);
+  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => broken), TypeError);
   assert.deepEqual(forgotten, [KEY_FILE]);
 });
 
@@ -118,7 +129,7 @@
   const note = (reason: unknown): void => void unhandled.push(reason);
   process.on('unhandledRejection', note);
   try {
-    mod.withWrittenKeyUntilExit(WRITTEN, () => ({ process: { exited: exited.promise } }));
+    mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => ({ process: { exited: exited.promise } }));
     exited.reject(new Error('the wait failed'));
     await turn();
     await turn();
@@ -133,10 +144,10 @@
 test('U8: withWrittenKeyUntilExit deletes nothing for a key file of the person, a password credential or a refusal, at the start and at the end', async () => {
   const { mod, forgotten } = guards();
 
-  mod.withWrittenKeyUntilExit(OWN_FILE, () => ({ process: { exited: Promise.resolve(0) } }));
-  mod.withWrittenKeyUntilExit(OWN_FILE, () => undefined);
-  mod.withWrittenKeyUntilExit(REFUSED, () => undefined);
-  mod.withWrittenKeyUntilExit(PASSWORD, () => ({ process: { exited: Promise.resolve(0) } }));
+  mod.withWrittenKeyUntilExit(OWN_FILE, NO_PIN, () => ({ process: { exited: Promise.resolve(0) } }));
+  mod.withWrittenKeyUntilExit(OWN_FILE, NO_PIN, () => undefined);
+  mod.withWrittenKeyUntilExit(REFUSED, NO_PIN, () => undefined);
+  mod.withWrittenKeyUntilExit(PASSWORD, NO_PIN, () => ({ process: { exited: Promise.resolve(0) } }));
   await turn();
 
   assert.deepEqual(forgotten, []);
```

Appended after U8:

| Id | What it proves |
|---|---|
| U9 | `withWrittenKey` calls the writer once, with the `auth` of the credential, BEFORE `run`; `run` gets the credential with `knownHostsFile`; nothing is deleted while `run` goes; after it, the key file and the pin file, in that order |
| U10 | an unpinned call hands `run` the credential itself (the same object); a refused credential is handed on itself, by both guards, and the writer is not called for it |
| U11 | a refused pin reaches `run` and `start` as `{ ok: false, message, warning }` with the pin's sentence and the credential's warning; `run` and `start` are still called; the key file is deleted once per call |
| U12 | the pin file is deleted for a password and for a key file of the person, after a value, a rejection and a synchronous throw |
| U13 | a writer that throws: both guards hand on the same error, `run` and `start` are not called, the key file is deleted |
| U14 | `withWrittenKeyUntilExit`: the writer before `start`; `start` gets the pin file; nothing is deleted while the process runs; both files once when `exited` settles |
| U15 | both files at once when nothing was started, when `start` throws (the same error), and once when the attach throws |
| U16 | an `exited` that rejects deletes the pin file of a password call too, once, and leaves no unhandled rejection |
| U17 | two calls: the end of one process deletes the pin file of its own call and not the other's |

U9 to U17 call the guards with three arguments, which the old guards do not take; they are written together with §3 and proven
by N1 to N3, N8 to N11 and N16.

The appended text, as measured (the file has 297 lines after it):

```ts
test('U9: withWrittenKey calls the pin writer once, with the login of the credential, before the run; the run gets the pin file; both files go after the run', async () => {
  const { mod, forgotten } = guards();
  const order: string[] = [];
  const run = held<string>();
  const writer: PinWriter = (auth) => (order.push(`pin:${auth}`), { ok: true, knownHostsFile: PIN_FILE });
  let got: CallAuth | undefined;

  const result = mod.withWrittenKey(WRITTEN, writer, (call) => (order.push('run'), (got = call), run.promise));
  await turn();
  assert.deepEqual(order, ['pin:key', 'run']);
  assert.deepEqual(got, { ...WRITTEN, knownHostsFile: PIN_FILE });
  assert.deepEqual(forgotten, [], 'a file of the call was deleted while the run was going');

  run.resolve('done');
  assert.equal(await result, 'done');
  assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE]);
});

test('U10: an unpinned call hands the run the credential as it is; a refused credential goes on as it is and the pin writer is not called', async () => {
  const { mod, forgotten } = guards();
  const got: CallAuth[] = [];
  let written = 0;
  const counting: PinWriter = () => ((written += 1), { ok: true, knownHostsFile: PIN_FILE });

  await mod.withWrittenKey(PASSWORD, NO_PIN, (call) => (got.push(call), Promise.resolve()));
  await mod.withWrittenKey(REFUSED, counting, (call) => (got.push(call), Promise.resolve()));
  mod.withWrittenKeyUntilExit(REFUSED, counting, (call) => (got.push(call), undefined));

  assert.equal(got[0], PASSWORD, 'the run of an unpinned call did not get the credential itself');
  assert.equal(got[1], REFUSED, 'the run did not get the refusal of the credential itself');
  assert.equal(got[2], REFUSED, 'the start did not get the refusal of the credential itself');
  assert.equal(written, 0, 'a pin was written for a credential that is not ok');
  assert.deepEqual(forgotten, []);
});

test('U11: a refused pin reaches the run as a refusal with the sentence of the pin and the warning of the credential; the run is still called', async () => {
  const { mod, forgotten } = guards();
  const warned: ExecAuth = { ...WRITTEN, warning: 'this key is old' };
  const got: CallAuth[] = [];

  await mod.withWrittenKey(warned, BAD_PIN, (call) => (got.push(call), Promise.resolve()));
  mod.withWrittenKeyUntilExit(warned, BAD_PIN, (call) => (got.push(call), undefined));

  const refusal = { ok: false, message: 'the saved host key cannot be used', warning: 'this key is old' };
  assert.deepEqual(got, [refusal, refusal]);
  assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE], 'the key file of a call with a refused pin was not deleted once per call');
});

test('U12: the pin file is deleted whether or not a key file was written: a password, a key file of the person', async () => {
  const { mod, forgotten } = guards();

  await mod.withWrittenKey(PASSWORD, PINNED, () => Promise.resolve());
  await mod.withWrittenKey(OWN_FILE, PINNED, () => Promise.resolve());
  await assert.rejects(mod.withWrittenKey(PASSWORD, PINNED, () => Promise.reject(new Error('the run failed'))));
  await assert.rejects(mod.withWrittenKey(OWN_FILE, PINNED, () => { throw new Error('the run failed'); }));

  assert.deepEqual(forgotten, [PIN_FILE, PIN_FILE, PIN_FILE, PIN_FILE]);
});

test('U13: a pin writer that throws (it must not) is inside the guarded span: the key file is deleted, the same error goes on, nothing is run', async () => {
  const { mod, forgotten } = guards();
  const failure = new Error('the writer threw');
  const throwing: PinWriter = () => { throw failure; };
  let ran = 0;

  await assert.rejects(mod.withWrittenKey(WRITTEN, throwing, () => ((ran += 1), Promise.resolve())), (error) => error === failure);
  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, throwing, () => ((ran += 1), undefined)), (error) => error === failure);

  assert.equal(ran, 0, 'the run or the start was called after the pin writer threw');
  assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
});

test('U14: withWrittenKeyUntilExit hands both files to the process: nothing is deleted while it runs, both once when it has ended', async () => {
  const { mod, forgotten } = guards();
  const exited = held<number | null>();
  const started = { process: { exited: exited.promise } };
  const order: string[] = [];
  const writer: PinWriter = (auth) => (order.push(`pin:${auth}`), { ok: true, knownHostsFile: PIN_FILE });
  let got: CallAuth | undefined;

  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, writer, (call) => (order.push('start'), (got = call), started)), started);
  await turn();
  assert.deepEqual(order, ['pin:key', 'start']);
  assert.deepEqual(got, { ...WRITTEN, knownHostsFile: PIN_FILE });
  assert.deepEqual(forgotten, [], 'a file of the call was deleted while its process runs');

  exited.resolve(null);
  await turn();
  assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE]);
});

test('U15: withWrittenKeyUntilExit deletes both files at once when nothing was started, when the start throws, and when the continuation cannot be attached', () => {
  const { mod, forgotten } = guards();
  const failure = new Error('spawn EACCES');
  const broken = { process: { get exited(): Promise<unknown> { throw new TypeError('no exited'); } } };

  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => undefined), undefined);
  assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE]);

  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => { throw failure; }), (error) => error === failure);
  assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE, KEY_FILE, PIN_FILE]);

  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => broken), TypeError);
  assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE, KEY_FILE, PIN_FILE, KEY_FILE, PIN_FILE]);
});

test('U16: an exited that REJECTS deletes both files too, once, and leaves no unhandled rejection', async () => {
  const { mod, forgotten } = guards();
  const exited = held<number | null>();
  const unhandled: unknown[] = [];
  const note = (reason: unknown): void => void unhandled.push(reason);
  process.on('unhandledRejection', note);
  try {
    mod.withWrittenKeyUntilExit(PASSWORD, PINNED, () => ({ process: { exited: exited.promise } }));
    exited.reject(new Error('the wait failed'));
    await turn();
    await turn();
  } finally {
    process.off('unhandledRejection', note);
  }

  assert.deepEqual(forgotten, [PIN_FILE]);
  assert.deepEqual(unhandled, []);
});

test('U17: two calls keep their own pin files: the end of one process deletes the file of its call and not the other', async () => {
  const { mod, forgotten } = guards();
  const first = held<number | null>();
  const second = held<number | null>();
  const other = '/storage/keys/1/known_hosts-e1-other';

  mod.withWrittenKeyUntilExit(PASSWORD, PINNED, () => ({ process: { exited: first.promise } }));
  mod.withWrittenKeyUntilExit(PASSWORD, () => ({ ok: true, knownHostsFile: other }), () => ({ process: { exited: second.promise } }));

  second.resolve(0);
  await turn();
  assert.deepEqual(forgotten, [other]);

  first.resolve(0);
  await turn();
  assert.deepEqual(forgotten, [other, PIN_FILE]);
});
```

### 5.5 N16's road tests do not change

`test/personRoadsForgetKey.test.ts` (15 tests: C1 to C6, C3b, I1 to I7, R1) and `test/bridgeKeyHandoff.test.ts` (9 tests: B1 to
B9) run with no edit: their entry has no `hostKey`, so the writer answers "no pin" and the guards do what they did. They are
green on c1 and after c2 (K12). One thing is new in their runs and is asserted by none of them: a socket check that gets no
credential now writes the log line `socket check did not run: nothing stored`. C3 and C5 look for their own line with `some`,
so they are not touched by it.

## 6. Documents

Three documents, in commit c3. The texts below are what each must say; fit the wording to the lines around it, and keep every
fact.

**`src_vs_code/CHANGELOG.md`, under `## [Unreleased]`.** E1.S1 opens this plan's security entry there. Add this paragraph to it.
If the entry is not there yet (E1.S1 not built), stop and tell the lead: the order of the stories was changed.

```text
*Open Remote Bridge…* and *Install creds on host* now refuse an entry whose saved host key cannot be used: a stored text that is
no host key, or a host that cannot be written as a known_hosts line. No `ssh` starts, nothing is sent to that host, and the
message says what to do. An entry that signs in with a key is sent to *Connect SSH*, which shows the host's fingerprint and
saves the key when you confirm it. An entry that signs in with a password is told that there is no safe repair yet: Connect SSH
would send the password without a check of the host when it cannot read the host's key first. If the file of the saved host key
cannot be written to disk, the message says that, and nothing is sent either. An entry with no saved host key is not affected.
```

**`research/module_extension.md`.**

1. The paragraph **The bridge's `ssh` and its key file (N16)** (`:2581-2591`). After its sentence that ends "…is written for
   these three roads." add:

   ```text
   The same two guards own a second file of the call, the pin file (G1): the saved host key of the entry, written by
   `writePersonPin` (`personPin.ts`) as `known_hosts-<entry id>-<uuid>` through `materializeKnownHosts` with a suffix. Each guard
   takes the pin writer as a required parameter, calls it inside its guarded span and only for a credential that is `ok`, and
   hands the road ONE value (`CallAuth`): ready, with `knownHostsFile` when the entry has a saved host key, or refused. On the
   three roads the answer of `resolveExecAuth` has no name: it is the first argument of the guard. An entry with no saved host
   key (none, an empty one, one of white space) writes nothing and runs as before. A saved host key that is there and cannot be
   used (the text is no host key, or the host forms no known_hosts line) is a refusal with a sentence in the form of the login:
   a key entry is sent to Connect SSH, a password entry is told that there is no safe repair yet. A pin file that cannot be
   written is a refusal too. On a refusal no `ssh` starts. The pin file is deleted where the key file is, by the same `finally`
   and the same one continuation, whether or not a key file was written, and only a path that the writer returned in this call
   is deleted. The argv of these roads does not name the file yet.
   ```

   The last sentence is true at this story's commit; E1.S3 replaces it.
2. The table *Secrets at rest and in flight*, after the row *SSH private key on disk* (`:6185`), one new row:

   ```text
   | Saved host key on disk (a pin file) | Not a secret: one known_hosts line. It matters because a stale one would speak for a host. The three roads of the person write it per call, `known_hosts-<entry id>-<uuid>`, `0600` in the window's `0700` key folder, and delete it with the call: the bridge socket check and *Install creds on host* when they finish, a bridge when its `ssh` has ended (`writtenKey.ts`, the same guards as the key file). The agent's exec and a Connect terminal write `known_hosts-<entry id>` (with a uuid when a session is isolated). All of them are purged with the key folder |
   ```
3. The paragraph *Rule C: the name of a call file* (`:6613`). Its parenthesis "(the host-key pin `known_hosts-<id>` and the
   script `agent-script-<id>` of a call keep the id of an entry that the agent may view)" gets one more clause after it:

   ```text
   The pin file of one call of the person's three roads, `known_hosts-<id>-<uuid>`, keeps the entry's id in the same way; it is written for the person's own click, not for an agent.
   ```

**`research/module_tests.md`.** A new section behind the two sections `## A bridge, its socket check and the install delete
their key file (N16)` (`:2479`) and `## The extension's own ssh calls share no connection (G2)` (`:2501`), so directly before
`## What none of them covers` (`:2536`):

```text
## The three roads of the person and the saved host key (G1)
```

It begins with this story's part: one paragraph that says what is proven (the three states of a saved host key for one call,
the one value a road reads, and that the pin file is deleted with the call), the run command of the section above, and a table
with these rows. Read each count from the runner, not from this document:

| File | Tests | What it holds |
|---|---|---|
| `personRoadsWorld.ts` (not a suite) | n/a | what §5.1 of this spec adds: `hostKey`, `storageDir`, a question held open, `bridgeArgvs`, `passwordLogin`, `pinFiles`, `knownHostsOf` |
| `personPin.test.ts` | 10 | P1 to P9 and P2b, as §5.3 |
| `writtenKey.test.ts` | 18 | U1 to U8 and U3b (the key file, with the pin writer of an unpinned entry) and U9 to U17, as §5.4 |
| `personRoadsPin.test.ts` | 28 | Q0, QW, Q1, Q5, Q5b, Q6, Q7a to Q7c, Q8a, Q8b and QS, as §5.2 |

In the N16 section's own table, the row `writtenKey.test.ts` keeps its text about U1 to U8 and gets the words "with the pin
writer of an unpinned entry as the second argument; U9 to U17 are in the G1 section", and its count becomes the file's new
count. The new section ends with **What none of them proves**, from §12 of this spec: no real `ssh` reads the file; in this
story no argv names it; Windows by reading only.

## 7. Order of work, and the commits

1. **c1, the import lines** (§4.1). Compile (exit 0), typecheck, lint, the whole suite: green. `wc -l` says 785. Commit c1:
   `refactor(extension): agentCommands.ts groups its import lines (G1 E1.S2, the parent's §3.6)`. Its body says 794 → 785.
2. **The world and the road tests** (§5.1, §5.2). Compile: exit 0. Run `personRoadsPin`: 5 green (Q0, QW, the three Q1) and 23
   red with the texts of §5.2. Run `personRoadsForgetKey` and `bridgeKeyHandoff`: 15 and 9 green (the world changed under
   them). Save the output.
3. **The product** (§2, §3, §4.2) with `test/personPin.test.ts` (§5.3) and the edit of `test/writtenKey.test.ts` (§5.4), in one
   step: the guards' new parameter does not compile without its three callers and its tests. Compile: exit 0. The five suites:
   28, 10, 18, 15 and 9 green. `wc -l` says 784.
4. **The mutation checks** (§8), one at a time, each restored before the next. Save what each one printed.
5. Typecheck, lint, the ratchet, the whole suite: green. Commit c2:
   `fix(ssh): G1 E1.S2 — the saved host key of one call: a pin file that the guards own, and a refusal when it cannot be used`.
   Its body quotes the RED texts of step 2 and the result of each mutation, and says 785 → 784.
6. **The documents** (§6). `node .agents/conventions/tools/plan-lifecycle.mjs .` and `node .github/scripts/public-hygiene.mjs`
   from the repository root: clean. Commit c3: `docs(extension): G1 E1.S2 — the pin file of one call and the guards that own it`.

If a test of step 2 is red with another text, or a guard is red: stop and tell the lead. No commit holds a red test.

## 8. The mutation checks (each one must turn the named tests red; restore after each one)

Each mutation is a temporary edit of the PRODUCT, never of a test. Compile (read the exit), run `personRoadsPin`, `personPin`,
`writtenKey`, `personRoadsForgetKey` and `bridgeKeyHandoff`, read what is red, restore, and compile again before the next one.
"Red" below is what was measured (K12 d). A mutation that turns red something else, or less, is a finding for the lead.

| # | The mutation | Red |
|---|---|---|
| N1 | The pin file is deleted only when a key file was written: in `forgetBoth`, `if (pinFile !== undefined)` becomes `if (pinFile !== undefined && credential.ok && credential.materialized !== undefined)` | Q5 (the password, the person's own key file), Q5b, Q8a, Q8b; U12, U16, U17 |
| N2 | No delete of the pin file: in `forgetBoth`, the `if` with its body becomes `void pinFile;` | Q5 (all three), Q5b, Q8a, Q8b; U9, U12, U14, U15, U16, U17 |
| N3 | The pin is decided BEFORE the guarded span: in both guards the two statements `const decided = …` and `pinFile = decided.pinFile;` move above the `try` (`pinFile` becomes a `const`) | U13 |
| N4 | A saved host key that cannot be used is read as "no pin": in `writePersonPin`, the `return` of the `try` becomes `return { ok: true, knownHostsFile };` (with `void auth;` before it) | Q6 (all 12); P4, P5, P6 |
| N5 | An absent saved host key is not let through: the `if (isAbsent(…))` with its body becomes `void isAbsent;` | Q1 (all three); P1; all 15 of `personRoadsForgetKey`; all 9 of `bridgeKeyHandoff` |
| N6 | No suffix: `materializeKnownHosts(storageDir, entity, randomUUID())` becomes `(void randomUUID, materializeKnownHosts(storageDir, entity))` | Q5 (all three), Q5b, Q7c, Q8a, Q8b; P2, P3, P9 |
| N7 | A password entry gets the key form: in `unusablePinSentence`, `auth === 'askpass'` becomes `auth === ('never' as string)` | Q6 (the 4 password tests); P5, P6 |
| N8 | A refused pin is read as ready: in `decide`, the `return` of `if (!pin.ok)` becomes `return { call: credential };` | Q6 (all 12), Q7a (both), Q7b, Q7c; U11 |
| N9 | The writer is called for a refused credential too: in `decide`, the first `if` calls `writePin('key');` before its `return` | U10; Q5b (its socket check, which gets no credential, writes a file that nobody deletes) |
| N10 | The process is handed the key file only: the attach becomes `const onlyKey = (): void => forgetWrittenKey(credential); void started.process.exited.then(onlyKey, onlyKey);` | Q5b, Q8b; U14, U16, U17 |
| N11 | The pin file of a started bridge is deleted at once: after `handed = true;` comes `forgetBoth({ ok: false, reason: 'internal', message: '' }, pinFile);` | Q5b, Q7c, Q8b; U14, U16, U17 |
| N12 | The socket check says nothing: its `log.info('bridge', …)` line of §4.2 is removed | Q7c |
| N13a | The socket check hands its guard the writer of an unpinned entry: its `(auth) => writePersonPin(storageDir, entity, auth)` becomes `() => ({ ok: true })` | Q7c, Q8b, QS |
| N13b | The same on the install | Q5 (all three), Q6 (the 6 of the install), Q7a (the install), Q7b, Q8a, QS |
| N13c | The same on the bridge | Q5b, Q6 (the 6 of the bridge), Q7a (the bridge), Q7c, Q8b, QS |
| N14 | A failed write is not caught: in `writePersonPin`, the `try` and its `catch` go, their two statements stay (with `void pinWriteFailedSentence;`) | Q7a (both), Q7b, Q7c; P7, P8 |
| N15 | A road names the answer of the resolve again: on the bridge, `const resolved = await resolveExecAuth(…);` and `withWrittenKeyUntilExit(resolved, …)` | QS |
| N16 | The refusal of a pin loses the warning of the credential: in `decide`, `warning: credential.warning` is removed | U11 |
| N17 | One word of the key form changes: `Trust and connect saves the key.` becomes `Trust and connect saves it.` | Q6 (the 8 key-login tests); P4, P6 |

How these map to the parent's §5, item 15, as the stories document assigns it to this story: "delete the pin only when a key
file was written → test 5" is N1; "read an unusable pin as unpinned → test 6" is N4; "refuse an absent pin → test 1" is N5;
"drop the suffix → test 8" is N6; "give a password entry the key form → test 6" is N7. "Write the pin before the guard → test
7's key file stays" is N3, and it was measured differently: with a writer that never throws (the parent's §3.1) a pin that is
decided before the guarded span strands nothing, and Q7a to Q7c stay green; what turns red is U13, the writer that throws (the
parent's test 10). See *Notes for the lead*. N2 and N8 to N17 are this spec's own.

## 9. Done when (each item can be counted)

- [ ] c1 changes `commands/agentCommands.ts` and nothing else; the file has 785 lines; the suite is green at c1.
- [ ] Q5 (3), Q5b, Q6 (12), Q7a (2), Q7b, Q7c, Q8a, Q8b and QS, 23 tests, were watched red on c1 with the texts of §5.2 and pass
      at c2; Q0, QW and Q1 (3) were green at both.
- [ ] `test/personPin.test.ts` has P1 to P9 and P2b, 10 tests, and they pass.
- [ ] `test/writtenKey.test.ts` has 18 tests and they pass; `git diff` of U1 to U8 and U3b shows the 17 lines with `NO_PIN` and
      nothing else.
- [ ] `test/personRoadsForgetKey.test.ts` and `test/bridgeKeyHandoff.test.ts` have no diff, and pass: 15 and 9.
- [ ] N1 to N17 each turned red what §8 names, and the product was restored after each.
- [ ] `commands/agentCommands.ts` has 784 lines; `git diff c1..c2` of it is the diff of §4.2 and nothing else.
- [ ] `hostKeyTrust.ts` and `hostKeyPin.ts` have no diff in this story.
- [ ] `writePersonPin` is called only inside the three arrow functions of §4.2; `commands/agentCommands.ts` holds no name for
      an answer of `resolveExecAuth`.
- [ ] The three documents of §6 are changed; `plan-lifecycle.mjs` and `public-hygiene.mjs` are clean.
- [ ] `npm run typecheck`, `npm run lint`, `npm run ratchet` and `npm test` are green; the leftovers audit of `npm test` names no
      folder of this run.

## 10. Break it — ways to make the tests pass while the defect stays, and the row that stops each one

| # | The way | What stops it |
|---|---|---|
| Y1 | The pin writer reads `undefined` of `materializeKnownHosts` as "no pin", as the agent's exec does, so a saved host key that cannot be used runs with `accept-new` | P4 to P6 on the writer; Q6 on both roads: no `ssh` run, no bridge, and the exact sentence (N4) |
| Y2 | The road keeps the answer of the resolve under a name and tests ITS `ok`, so a refused pin is not seen and `ssh` starts | QS: the answer has no name on any of the three roads (N15); Q6 and Q7a count the runs (N8) |
| Y3 | The pin file is deleted inside `forgetWrittenKey`, or under its condition, so a password entry and a key file of the person leave their pin file | Q5 with a password and with the person's own key file, Q5b; U12 (N1) |
| Y4 | The pin is written by the road before it calls the guard, and its path is handed in | QS reads that the second argument of each guard is the arrow function with `writePersonPin`; the guards take no path (§3.3); U13 holds the span for a writer that throws (N3) |
| Y5 | One pin file per entry (no uuid), so two calls share it and the first end deletes the file of the second | Q8a, Q8b and P3: two files, each end deletes only its own, `known_hosts-e1` keeps its bytes (N6) |
| Y6 | The refusal is shown, and the `ssh` starts all the same (the sentence is added, the `return` is not reached) | Q6 and Q7a assert the sentence AND zero runs AND no bridge; Q7c asserts zero runs of the check |
| Y7 | The bridge's pin file is deleted when the command returns, or at *Close* | Q5b: the same file with the same text after *Open* and after *Close*, gone only after the end; U14 (N11) |
| Y8 | A password entry is shown the key form, which sends it to Connect SSH | Q6 for the password login asserts the whole password form; P5 asserts that it holds neither `Trust and connect` nor `go on only if` (N7) |
| Y9 | The tests pass on a pretended file system: the pin "file" is a path in a list | `materializeKnownHosts` and `forgetMaterializedKey` are the real ones (`realForget`); Q5, Q5b, Q8a and Q8b read the folder and the text of the file; P2 reads the file and P2b its mode |
| Y10 | An unpinned entry is refused, or gets a file, and nobody notices because every pin test has a pin | Q1 on the three absent forms, with all five argvs; P1; and all 24 of N16's road tests, which run on an entry with no `hostKey` (N5) |

## 11. Opus review checklist

1. `personPin.ts` is the text of §2.1. The absent check is `(hostKey ?? '').trim() === ''` and stands before the `try`. The
   `try` holds the call of `materializeKnownHosts` with `randomUUID()` and the reading of its answer, nothing else.
2. The three sentences are the parent's §3.5, character for character (compare with §2.2 of this spec, not with the tests). The
   password form does not send the person to Connect SSH.
3. `hostKeyTrust.ts` and `hostKeyPin.ts` have no diff. The agent's exec (`sshUseActions.ts`) has no diff.
4. `writtenKey.ts` is the text of §3.1. In both guards `decide` is the FIRST statement inside the `try`, and `pinFile` is
   assigned by the next statement. `decide` calls the writer only after `if (!credential.ok)` has returned.
5. `forgetBoth` calls `forgetWrittenKey(credential)` first and then tests `pinFile !== undefined` alone. Nothing joins the two
   conditions.
6. In `withWrittenKeyUntilExit`: one flag, one continuation, `then(forget, forget)`; the attach and `handed = true;` are adjacent
   statements in that order; the `finally` deletes only `if (!handed)`. `start` is synchronous; the writer is synchronous.
7. No parameter of a guard is a path. `pinFile` is written in one place per guard, from `decided.pinFile`.
8. The ready value of an unpinned call is the credential itself; of a pinned call a NEW object (the credential is not changed).
   A refused pin carries the credential's `warning`.
9. `commands/agentCommands.ts`: the diff of c1 is import lines only, each group at the place of its first line. The diff of c2
   is §4.2 and nothing else: no argv call changed, `runRemote` and `sweepDeadSockets` unchanged, no dialog added or moved.
10. The three guards are each given `await resolveExecAuth(…)` as the first argument and an arrow function with
    `writePersonPin(storageDir, <the snapshot of THIS call>, auth)` as the second: `entity` in the socket check, `details` in the
    install and in the bridge. No other use of `writePersonPin`.
11. The socket check's refusal branch logs and returns; it shows no message. The log line is
    `socket check did not run: ${credential.message}`.
12. 785 lines at c1, 784 at c2; no new `eslint-disable`.
13. Each RED text in the body of c2 is one of §5.2. Each mutation in the body names what turned red, and it is what §8 says.
14. The tests write real files only into folders of `ownedDir` and `ownedFile`, under a `cleanupScope` closed in `after`. No
    test starts a process. Q7a and Q7c are the only road tests that stand in for `./hostKeyTrust`, and their stand-in calls the
    real function on the calls it does not fail.
15. `test/personRoadsForgetKey.test.ts` and `test/bridgeKeyHandoff.test.ts` have no diff. In `test/writtenKey.test.ts` the diff
    of U1 to U8 and U3b is the 17 `NO_PIN` arguments.
16. The fixtures are checked against the real functions (Q0, P2, P4, P6): the pin parses, the other texts do not, the other
    host forms no line.
17. The documents say what is true at this commit: the argv does not name the pin file yet.

## 12. Not verified by this spec

- **That `ssh` reads the pin file.** In this story no argv names it. What is proven is WHEN the file is there and WHEN nothing
  starts. E1.S3 puts the path into the argv; E1.S4 and E2 run a real `ssh` against a real `sshd`.
- **A real `ssh` at all.** The runner and the spawner are stand-ins, as in N16's tests.
- **Windows.** The suite runs on Ubuntu. On Windows `lockToOwner` runs `icacls` once per pin file, synchronously, with a limit
  of 5 s (`materializedKeys.ts:28-38`); a pinned call of the three roads now pays that once more. Whether `ssh.exe` has released
  the pin file when the delete runs was not measured; a delete that fails is silent and the purge retires the file.
- **A write that fails part way** (the disk fills after the file was created). The call is refused with sentence B; the file,
  if one was made, stays until the purge (the parent's §3.7). No test fills a disk; Q7b and P8 fail at the folder.
- **The real `resolveExecAuth`.** The world stands in for it. That a real password entry answers `auth: 'askpass'` and a real
  key entry `auth: 'key'` is read in `sshExecAuth.ts` (K7) and is tested there, not here.
- **A saved host key that is replaced while a call runs.** By reading: the writer is bound to the snapshot of the call, so the
  running call keeps its pin and the next call reads the new one (the parent's §3.3). No test replaces a pin in the middle.
- **Sentence A's advice.** That Connect SSH repairs such a pin for a key entry, and that the password form's warning is true, is
  the parent's reading of §3.5 and E2's measurement M9.
- **A window that is killed.** No `finally` runs; the purge of the next activation retires `keys/<pid>/` with both files.

## Notes for the lead

- **Measured budget (the parent's §3.6).** `commands/agentCommands.ts` on `ca99cd91`: 794 lines, unchanged by G2. After c1:
  785, as the parent predicted. After c2: **784**, one line fewer, because each road hands the answer of the resolve straight
  to its guard (three lines saved) and gains one import and one log line. E1.S3 has 16 lines to the limit.
- **For the parent, §3.5 and §5 item 6: "no credential" has no form of sentence A.** Both list "no credential" under the key
  form. In the code a call with no credential is refused by `resolveExecAuth` (`sshExecAuth.ts:139-141`), and by the parent's
  own §3.2, item 1, a credential that is not ok writes no pin. So such a call shows the credential's refusal, as today, and
  starts nothing. This spec builds that and has no test for "no credential gets the key form". The two places in the parent
  need the words taken out; E2's M9 is not touched. Whether that is a repaired description or a change is the lead's call.
- **For the parent, §5 item 15, and the stories document, E1.S2's mutation list: "write the pin before the guard → test 7's
  key file stays".** Measured (N3): with a writer that never throws, nothing is stranded and test 7 stays green; the test that
  turns red is test 10's "a writer that throws" (U13). The sentence should name test 10.
- **For the stories document, E1.S2's scope: the socket check's log line.** The parent's §3.3 says that a refused value of the
  check "goes to the diagnostic log". The stories document gives that line to no story. This spec takes it, because test 7 on
  the socket check reads it (Q7c): `socket check did not run: <message>`. It is written for a refused CREDENTIAL of the check
  too, which was silent before; the one value does not say which of the two refused, on purpose.
- **Line references.** Every reference of this spec was read on `ca99cd91`. They agree with the revision of the parent and of
  the stories document against `ca99cd91` that was being written in the same worktree on 2026-11-17 (not committed when this
  spec was): `commands/agentCommands.ts` and `writtenKey.ts` as before G2; in `research/module_extension.md` the N16 paragraph at
  `:2581-2591`, the table row *SSH private key on disk* at `:6185`, *Rule C* at `:6613`; in `research/module_tests.md` the N16
  section at `:2479` and G2's at `:2501`.
- **The names.** `writePersonPin(storageDir, entity, auth)` in `personPin.ts`, as the parent has it. The types of the contract
  (`PinOfCall`, `PinWriter`, `ReadyCall`, `RefusedCall`, `CallAuth`) live in `writtenKey.ts`, with the guards that define them.
- **The answer of the resolve has no name on the roads** (QS). This is more than the parent asks. It makes "no ready value
  without a pin decision" a property of the text, not of the reviewer's attention, and it costs three long lines. If the lead
  wants the two-line form back, QS changes and the count is 787.
- **The world gains `knownHostsOf` now** (the stories document says so) though no road names a file until E1.S3. QW keeps it
  observed. It reads a path in double quotes as E1.S1's form for a path with white space; if E1.S1 chose another form, E1.S3
  adjusts the reader in the commit that first uses it.
- **Read for this spec, not built:** the three roads still send the pin to nobody after this story. A release between E1.S2 and
  E1.S3 would write files and check nothing. E1 is one pull request, so there is none.
