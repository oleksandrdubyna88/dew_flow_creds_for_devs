# PLAN — E1.S2 spec: a Connect that reuses a live terminal leaves no key file (SECURITY)

> Status: **spec only, nothing built, 2026-11-15.** Security spec, written by Fable before its code (the row *Security
> judgement* of `subagent-models.md`; not a cornerstone: the plan's quota is 1 and E1.S1 holds it). Story E1.S2 of
> [PLAN_open_terminal_key_file_name.md](PLAN_open_terminal_key_file_name.md) (its §2.2, §2.3, §3 items 9 to 14, §4, `## Epics` E1).
> The parent is stopped for its re-review: no code of this story is written before epoch 2 is approved (the parent's §8).
> This file is promoted together with the parent.
>
> Scope: `src_vs_code/src` — `sshConnect.ts` (`openKeyTerminal`: one snapshot, one condition, its docblock), one comment in
> `terminalManager.ts`, and tests: `test/sshConnectWorld.ts`, `test/vscodeStub.ts` (one getter), `test/sshConnectKeyName.test.ts`.
> Then the documents of the parent's §4. Branch `fix/open-terminal-call-key-name` at `3e8270c1`. Each `file:line` below was read
> on `3e8270c1`. Fable writes this spec, a Sonnet coder builds it, Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above. "The S1 spec"
is [PLAN_open_terminal_key_file_name_E1_S1_spec.md](PLAN_open_terminal_key_file_name_E1_S1_spec.md); its names (FX, T-N17a, T-N17b,
T-N17c, L1 to L11, W1 to W5, M1 to M6, B1 to B12) keep their meaning. This document continues the numbers: W6 to W9, M7 to M17,
B13 to B21. FX-D, FX-L, T-N17d, G2, G3, G4 and the facts K1 to K13 are its own. **G1 of the S1 spec is replaced by G1 of this
document**, and the S1 spec's list *Files with no change* no longer holds for `sshConnect.ts`, `test/sshConnectWorld.ts` and `terminalManager.ts` (one comment).
This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`).

## What E1.S2 builds, in one paragraph

*Connect via SSH*, and an agent's `creds_open_terminal`, prepare a session first and open a terminal after. The prepare writes
the stored key to a `call-<uuid>.key`. When the entry already has a live terminal, `openSshTerminal` gives that terminal back
and types nothing, so no line names the new file and no `ssh` reads it. Today `openKeyTerminal` keeps the file and one more
close listener until that terminal closes: one decrypted copy of the key per call, with no bound. E1.S2 makes `openKeyTerminal`
see the reuse (the terminal was in the window directly before the open) and forget the new file at once, with no listener. An
open Connect terminal then holds exactly one key file and one listener. Before the product changes, the test world is repaired
in four places, so that the tests of this story, and three mutations that are green today, can turn red.

## Binding constraints

- **No plan change.** Build what the parent and this document say. If a step cannot be done as written, or a test shows something
  that this document does not say: stop and tell the lead. Do not repair the parent.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first. Read the exit of `tsc` before any
  test result. This is why the three tests of step 1 use only members that the world has today, and why the world gets its new
  members (step 2) before the tests of step 3 name them.
- **Keep what the runner printed.** Save each RED text in the scratchpad folder of the session and quote it in the commit body.
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history: this story is built forward on top of `3e8270c1`.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): a file has at most 800 lines, a function at most 50 code lines (120
  in `src/test/`), complexity at most 4 (also in tests). No new `eslint-disable`. `openKeyTerminal` is at complexity 4 after the
  change (K11): add no branch to it.
- **The product change is `openKeyTerminal` and nothing else.** No change of what `openSshTerminal` returns, no code change in
  `terminalManager.ts` (one comment, §5), no look-up of a live terminal in `prepareSshSession` or before it, no new module.
- **Files with no change:** `sshSession.ts`, `keyInstaller.ts`, `materializedKeys.ts`, `sshTerminalOwners.ts`, `sshCommand.ts`,
  `sshUseActions.ts`, `sshRoad.ts`, `dependencyRunHost.ts`, `keysPurge.ts`; `test/keysDirPaths.test.ts`, `test/sshSession.test.ts`,
  `test/sshConnect.test.ts`, `test/sshConnectRemote.test.ts`, `test/sshRoad.test.ts`, `test/connectSshCommandLog.test.ts`,
  `test/brokerAbandoned.test.ts`. Nothing in `contract/`, `src_mcp`, `src_cli`, `src_broker_client`, `src_minimalapi_server`.
- **The new tests write nothing to disk.** The key writer of the world is a stand-in that returns a path.
- **Node only.** No Python, also not for a helper script. Write documents with the Edit or Write tool, not with a shell heredoc.

## Facts read on `3e8270c1` that this spec uses

| # | Fact | Where |
|---|---|---|
| K1 | `openKeyTerminal` is `:117-134`: the open at `:118`; the key is forgotten at once when no terminal opened (`:122-123`); else a listener of `onDidCloseTerminal` forgets it when THIS terminal closes and disposes itself (`:125-130`, `sub.dispose()` at `:128`). Its one caller is `openReady` (`:112-114`), called from `connectEntity` (`:67-82`) after its two `await`s (`:74`, `:75`); the open half is synchronous (`:72-73`, `:111`) | `sshConnect.ts` |
| K2 | `openSshTerminal` (`:37-66`) finds a live terminal of the same account and entry in `vscode.window.terminals` (`:51-53`), shows it and returns it with nothing typed (`:54-57`); else it creates one (`:61`), claims it (`:62`) and types the line (`:64`). The owner map is keyed by the terminal object: "the extension host keeps one object per terminal for its whole life" (`sshTerminalOwners.ts:8-9`). So the reuse rule already stands on the identity that `before.has(terminal)` needs | `terminalManager.ts`, `sshTerminalOwners.ts` |
| K3 | The agent's road: `sshTerminalAction` (`:362`) calls `connectEntity` at `:382-392`. `test/brokerAbandoned.test.ts:533-570` runs that action with the real `connectEntity`; its `vscode` stand-in has `window.terminals: []` (`:536`) and replaces `./terminalManager` (`:559`) | `sshUseActions.ts`, the test |
| K4 | The world's key writer ignores the folder that it is handed: the path is the literal `` `/storage/keys/${name}.key` `` (`:220`); both members drop their first argument (`:229-231`). Its failure is `new Error('disk full')` (`:218`) and names no file | `test/sshConnectWorld.ts` |
| K5 | The world's close event: a plain list (`:122`); `closeTerminal` calls the live list with `forEach` (`:141`); the stand-in of `onDidCloseTerminal` (`:285-288`) returns a `dispose` that does nothing (`:287`) | `test/sshConnectWorld.ts` |
| K6 | The solved instance of an event: `StubEventEmitter<T>` (`:144-183`). `event` registers and returns a `dispose` that removes the listener (`:150-160`); `fire` goes over a COPY of the list (`:170`) and catches a throw of one listener into `StubEventEmitter.reported` (`:171-177`). `listeners` is private (`:148`); there is no count | `test/vscodeStub.ts` |
| K7 | The stand-in of the credential lookup calls `duringLookup` (synchronous) and returns `Promise.resolve(parts.source)` (`:155-161`): a test cannot hold a Connect inside prepare | `test/sshConnectWorld.ts` |
| K8 | The built suite: helpers `:35-46`, FX `:48-58`, T-N17b `:60-76`, T-N17c `:78-106`, G1 `:108-125`. T-N17c reads no leak from the two lines or the tabs (`:95-98` are the positive and the name pattern). G1 asserts at `:118` that NOTHING is forgotten after the second Connect of a live terminal | `test/sshConnectKeyName.test.ts` |
| K9 | L6 (`:51-71`) and L7 (`:73-87`) run on the stand-in of `./terminalManager`; its one `opened` object is never in `window.terminals`. The two tests of a failed key write match the dialog with a pattern, not with the whole text (`test/sshConnect.test.ts:102`, `test/sshSession.test.ts:205`) | `test/sshConnect.test.ts`, `test/sshSession.test.ts` |
| K10 | The dialog of a failed key write is `` `Could not write the stored key to disk: ${describeError(error)}` `` (`:476`). The real writer lets the error of `fs` pass (`keyInstaller.ts:152-168`), and that text names the file | `sshSession.ts`, `keyInstaller.ts` |
| K11 | Complexity of `openKeyTerminal` after the change: 1, the two `if`s and the one `\|\|` — 4, the limit. The listener is a function of its own | `sshConnect.ts`, the lint configuration |
| K12 | **Measured 2026-11-15** on a copy of the compiled `3e8270c1` in a scratch folder (the copy was edited, not the repository; not kept). (a) The three tests of step 1 on the unchanged world: 3 red, with the texts of §1. (b) With W6 to W9 on the unchanged product: those 3 pass, and the 101 tests of the six suites that load the world pass with no change (`sshConnect` 34, `sshConnectRemote` 25, `sshSession` 23, `sshConnectKeyName` 4, `sshRoad` and `connectSshCommandLog` 15). (c) With W7's `dispose` but a dispatch over the live list, the built G1 goes red on the unchanged product: the first listener removes itself and the second is skipped. (d) The tests of step 3 on the unchanged product: G1, G2, G3 red; G4 and T-N17c pass. (e) With the fix of §5: all pass, and the BUILT G1 is the one older test that goes red (at its `:118`). (f) M7 to M17 turn red what §6 says. (g) Three Connects started together with `Promise.all` and no gate do not overlap: the first has created its terminal before the second reaches its lookup. (h) On the unchanged world, the two mutations of the Opus review stay green: the writer handed `<storageDir>/<keyEntityId>`, and `sub.dispose()` outside its `if` | the run |
| K13 | PR #365 changes none of `sshConnect.ts`, `terminalManager.ts`, `test/sshConnectWorld.ts`, `test/vscodeStub.ts`, `test/sshConnectKeyName.test.ts`. It changes `research/module_extension.md`, `research/module_tests.md` and `todo/README.md` (`gh pr diff 365 --name-only`, read 2026-11-15) | the PR |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.** A test result after a failed `tsc` is the result of old files.
2. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
3. `node $LP npm run typecheck`
4. `node $LP npm run lint`
5. `npm test` — the full suite (it compiles first and lowers itself).

## 1. Scenarios

Each row is one test, in `test/sshConnectKeyName.test.ts`. Every world is `linkedWorld()` (the real `openSshTerminal`, the linked
key entry of FX). "RED" names the state in which the test is watched failing; the texts are those of K12, with other uuids.

**The tests of the world (step 1). RED on the UNCHANGED world and product; GREEN after W6 to W9; the product does not change.**

| Id | Setup | Action | Expected | RED reason on the current branch code |
|---|---|---|---|---|
| FX-D | `connect({ storageDir: '/elsewhere' })` | one Connect | one file written; its path starts with `/elsewhere/keys/`; its last part is a call name; the typed line holds `-i "<that path>"` | **red**, the world: the writer ignores its folder (K4). `FX-D: the key file is not under the folder that the product handed to the writer (/elsewhere): /storage/keys/call-<uuid>.key` |
| FX-L | — | one Connect; close the terminal; close the SAME terminal again | after the first close the file is forgotten once; after the second close still once | **red**, the world: `dispose` does nothing (K5), so the listener hears the second close. `FX-L: a listener that was disposed heard a later close: /storage/keys/call-<uuid>.key, /storage/keys/call-<uuid>.key` |
| T-N17d | `linkedWorld({ materialiseFails: true })` | one Connect | not opened; no terminal; no file; one dialog; it starts with `Could not write the stored key to disk: `; it names the file that could not be written; it holds neither the id nor the name of the linked key entry; the named file has a call name | **red**, the world: its failure names no file (K4), so the absence would prove nothing. `T-N17d: the dialog does not name the file that could not be written, as the text of the operating system does: Could not write the stored key to disk: disk full` |

**The tests of the product (step 3). RED on the product of `3e8270c1` with the repaired world; GREEN after the fix of §5.**

| Id | Setup | Action | Expected | RED reason on the current branch code |
|---|---|---|---|---|
| G1 (rewritten) | one `connect()` for both calls | Connect; Connect again while the terminal lives; close another terminal; close the terminal | after the first Connect nothing is forgotten and one listener is registered; after the second: one terminal, one typed line, two distinct files `[a, b]`, the line names `a`, `forgotten` is exactly `[b]`, one listener; the other terminal's close changes nothing; the own close gives `[b, a]` and no listener | **red** at `forgotten` is `[b]`: `openKeyTerminal` keeps the file of a reused terminal (`sshConnect.ts:122-130`). `G1: the key file of a Connect that reused a live terminal was not forgotten at once; kept: <a>, <b>` |
| G2 | the same | five Connects on one live terminal (the options are those of the agent's `creds_open_terminal`) ; close the terminal | one terminal, one typed line, five files written; the files not forgotten are exactly `[the first]`; one listener; after the close no file is left, five are forgotten, no listener | **red**: every call keeps its file and its listener. `G2: 5 calls on one live terminal left 5 key files: …` |
| G3 | `linkedWorld({ lookupGate, duringLookup })`: every lookup waits until the third has arrived | three Connects started together | all three were inside prepare before a terminal existed; then one terminal, one typed line, three distinct files; the line names exactly one of them; the files not forgotten are exactly that one; one listener; after the close no file is left, no listener | **red**: three files are kept. `G3: 3 Connects at once left 3 key files (the typed line names <x>): <x>, <y>, <z>` |
| G4 (a guard) | another LIVE terminal is in `w.existing` before the Connect | Connect; close the other terminal; close the own terminal | one new terminal with its line; nothing is forgotten although the snapshot is not empty; the other close forgets nothing and takes no listener away; the own close forgets the file; no listener | green before and after. Red only under M8, M11, M12, M14 and M16 (§6) |
| T-N17c (extended) | as built | as built | as built, and: neither line and neither tab holds the id or the name; nothing is forgotten before a close although the ENDED first terminal is in the snapshot; the listeners are two, then one, then none | green before and after (a guard of the fix). Red under M8, M11, M12, M13, M14, M15 and M16 (§6) |

Count. State 1: 3 failed tests (FX-D, FX-L, T-N17d) and no other. State 2: none. State 3: 3 failed tests (G1, G2, G3) and no
other; G4 and T-N17c pass. After the fix: none. `test/sshConnectKeyName.test.ts` then has 10 tests (FX, FX-D, FX-L, T-N17b,
T-N17c, T-N17d, G1, G2, G3, G4); the six suites of the world have 107.

**Which older tests change colour.** With the world repairs alone: none (K12 b). With the product change: only the built G1,
which step 3 has replaced before the fix (K12 e). L6 and L7 do not: on the stand-in of `./terminalManager` the returned object is
never in `window.terminals` (K9), so the new condition answers as the old one.

**Is a scenario needed for a source without a file?** No. With the agent's answer, a key path of the person or no credential,
`materializedKeyPath` is `undefined` and `openKeyTerminal` forgets nothing and registers nothing (`sshConnect.ts:121`), as before.
The password road opens its own terminal and writes no key file (`:144-165`).

## 2. Files and changes

| File | Step | Change |
|---|---|---|
| `test/sshConnectKeyName.test.ts` | 1 | the two helpers take overrides; FX-D, FX-L, T-N17d |
| `test/vscodeStub.ts` | 2 | W7: the getter `listenerCount` of `StubEventEmitter` |
| `test/sshConnectWorld.ts` | 2 | W6 to W9 (§3.2) |
| `test/sshConnectKeyName.test.ts` | 3 | G1 rewritten; G2, G3, G4; T-N17c extended; the helper `kept` |
| `sshConnect.ts` | 4 | the fix (§5) |
| `terminalManager.ts` | 4 | one comment (§5) |
| `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md`, `todo/README.md` | 6 | §7 |

No file comes near 800 lines (`test/sshConnectWorld.ts` has 436, `test/sshConnectKeyName.test.ts` 125).

## 3. Steps 1 and 2 — the tests of the world, then its repairs

### 3.1 Step 1 — three tests on the unchanged world (RED, state 1)

In `test/sshConnectKeyName.test.ts`. The two helpers take overrides, with no change for their callers (`Parts` is a new
type-only import from the world):

```ts
const linkedWorld = (extra: Partial<Parts> = {}): World => world({ source: LINKED_SOURCE, options: OPTIONS, realTerminal: true, ...extra });
const connect = (extra: Partial<ConnectOptions> = {}): ConnectOptions => ({ /* the six members of today */, ...extra });
```

**FX-D.** Name: `FX-D, the world's key writer: the key file is under the folder that the product handed to the writer`.
`await w.mod.connectEntity(ACCOUNT_ID, linked(), connect({ storageDir: '/elsewhere' }))`. Assertions, in this order:

1. `w.materialised.length` is 1; `written = w.materialised[0]`.
2. `written.startsWith('/elsewhere/keys/')`, with the message
   `` `FX-D: the key file is not under the folder that the product handed to the writer (/elsewhere): ${written}` ``.
3. `lastPart(written)` matches `CALL_KEY_FILE`; `w.created[0].sent[0]` includes `` `-i "${written}"` ``.

**FX-L.** Name: `FX-L, the close event of the world: a listener that was disposed hears no later close`. One Connect;
`a = writtenCallKey(w)`. Assertions, in this order:

1. `w.closeTerminal(w.created[0])`; `w.forgotten` is `[a]`.
2. `w.closeTerminal(w.created[0])` again; `w.forgotten` is still `[a]`, with the message
   `` `FX-L: a listener that was disposed heard a later close: ${w.forgotten.join(', ')}` ``.

**T-N17d.** Name: `T-N17d: the dialog of a key that could not be written names the call-named file, and holds no id and no name
of the linked key entry`. World: `linkedWorld({ materialiseFails: true })`. `opened = await w.mod.connectEntity(…)`. Assertions,
in this order:

1. `opened` is `false`; `w.created` is `[]`; `w.materialised` is `[]`; `w.errors.length` is 1; `text = w.errors[0]`.
2. `text` matches `/^Could not write the stored key to disk: /`.
3. **Positive first.** `named = /open '([^']+)'/.exec(text)` is not `null`, with the message
   `` `T-N17d: the dialog does not name the file that could not be written, as the text of the operating system does: ${text}` ``.
   Without it the absence of the id could pass because the stand-in's failure tells nothing.
4. `keyLeaks(text)` is `[]`, with the message `` `T-N17d: the dialog holds ${found.join(' and ')}: ${text}` ``.
5. `lastPart(named[1])` matches `CALL_KEY_FILE`.

T-N17d does not change what a person is shown: the text of the operating system stays in the dialog (Q1 of the N10 plan, kept
by the owner). It proves that this text holds no id and no name of a key entry, and M17 proves that it would see one.

**The run of step 1** (compile, then `npm test`): 3 failed tests and no other, each by its assertion. Save the three texts.

### 3.2 Step 2 — the repairs of the world (GREEN, state 2; no product change)

**W6, the key writer uses its folder** (`test/sshConnectWorld.ts:216-231`). The mutation of the Opus review,
`materializeCallKey(<storageDir>/<keyEntityId>, …)`, is green today because the stand-in drops the folder (K4, K12 h).

```ts
const keyWriter = (w: World, parts: Parts) => (dir: string, name: string): string => {
  const keyPath = `${dir}/keys/${name}.key`;
  if (parts.materialiseFails === true) {
    // W8: as the text of the operating system does (`fs.writeFileSync`), the failure names the file that could not be written.
    throw new Error(`ENOSPC: no space left on device, open '${keyPath}'`);
  }
  w.materialised.push(keyPath);
  return keyPath;
};
```

The two members hand their folder on: `materializePrivateKey: (dir: string, entityId: string, _content: string, suffix?: string)
=> write(dir, …)` and `materializeCallKey: (dir: string): string => write(dir, callKeyName())`. Every older test hands
`'/storage'`, so every older path is the same text as today (K12 b). The docblocks of `keyWriter` and of the stand-in say that
the path is built from the folder that the product handed in.

**W7, the close event is the shared `StubEventEmitter`** (K5, K6). Do not repair the list in place: the solved instance exists.

- `test/vscodeStub.ts`: `StubEventEmitter` gets one getter, below `listeners` (`:148`), with a docblock of one sentence:
  `get listenerCount(): number { return this.listeners.length; }`.
- `test/sshConnectWorld.ts`: the import becomes `import { StubEventEmitter, loadEachWithVscode } from './vscodeStub';`. In
  `world()` the list `closeListeners` (`:122`) becomes `const closed = new StubEventEmitter<unknown>();`. `closeTerminal`
  (`:141`) becomes `(t: unknown): void => closed.fire(t)`. `World` gets the member
  `/** How many listeners of the close event are registered now. */ closeListenerCount(): number;`, answered by
  `(): number => closed.listenerCount`. The helper `vscodeStub(w, parts, closed)` takes the emitter, and its
  `onDidCloseTerminal` (`:285-288`) becomes `onDidCloseTerminal: closed.event`.
- The docblock of `World.closeTerminal` (`:65`) says: every listener that is registered when the event fires hears it; a
  listener that was disposed does not.

`fire` goes over a copy of the list. That is needed, not a detail: with a `dispose` that removes and a dispatch over the live
list, the first of two listeners removes itself and the second is skipped (K12 c).

**W8, the failure of the world's writer names the file** — the `throw` of W6. The two older tests of a failed write match a
pattern that still fits (K9).

**W9, a gate on the credential lookup** (`test/sshConnectWorld.ts:155-161`). `Parts` gets
`/** Every credential lookup waits for this promise, so a test can hold several Connects inside prepare at once. */
lookupGate?: Promise<void>;`. The stand-in returns
`parts.lookupGate === undefined ? Promise.resolve(parts.source) : parts.lookupGate.then(() => parts.source)`, after the call
of `duringLookup` as today. Without a gate nothing changes, also not the number of ticks. (The same idea, private to one test:
`releaseLookup` of `test/brokerAbandoned.test.ts:546-551`.)

**Then:** `npm run typecheck` is clean. `npm test` shows no failed test: FX-D, FX-L and T-N17d pass, and every older test passes
with no change. A test that changes colour here stops the work: tell the lead.

## 4. Step 3 — the tests of the product (RED, state 3)

In `test/sshConnectKeyName.test.ts`. No test guesses a name: a path comes from `w.materialised`, a typed line from
`w.created[n].sent`. One new helper:

```ts
/** The written key files that nobody has forgotten yet, in the order of their writes. */
const kept = (w: World): string[] => w.materialised.filter((file) => !w.forgotten.includes(file));
```

### 4.1 G1, rewritten (RED)

The built G1 (`:108-125`) goes. New name: `G1: a second Connect of a live session opens no terminal and types nothing, and its
key file is forgotten at once; the first file stays until the terminal closes`. One `options = connect()` for both calls. Steps
and assertions, in this order:

1. Connect. `w.forgotten` is `[]` (message: `G1: the key of a NEW terminal is kept`); `w.closeListenerCount()` is 1.
2. Connect again. `w.created.length` is 1; `w.created[0].sent.length` is 1; `w.materialised.length` is 2 and
   `new Set(w.materialised).size` is 2; with `[a, b] = w.materialised`: `w.created[0].sent[0]` includes `` `-i "${a}"` ``.
   (The positives: the terminal WAS reused, the second prepare DID write a file, and the line names the first.)
3. `w.forgotten` is `[b]`, with the message
   `` `G1: the key file of a Connect that reused a live terminal was not forgotten at once; kept: ${kept(w).join(', ')}` ``.
4. `w.closeListenerCount()` is 1 (message: `G1: a reused terminal got one more close listener`).
5. `w.closeTerminal({ name: 'somebody else' })`; `w.forgotten` is still `[b]`; `w.closeListenerCount()` is still 1.
6. `w.closeTerminal(w.created[0])`; `w.forgotten` is `[b, a]`; `w.closeListenerCount()` is 0.

### 4.2 G2 — no accumulation (RED)

Name: `G2: five calls on one live terminal leave one key file and one close listener`. Five Connects in a loop, one
`options`. Assertions, in this order:

1. `w.created.length` is 1; `w.created[0].sent.length` is 1; `w.materialised.length` is 5.
2. `kept(w)` is `[w.materialised[0]]`, with the message
   `` `G2: 5 calls on one live terminal left ${kept(w).length} key files: ${kept(w).join(', ')}` ``.
3. `w.closeListenerCount()` is 1.
4. `w.closeTerminal(w.created[0])`; `kept(w)` is `[]`; `w.forgotten.length` is 5; `w.closeListenerCount()` is 0.

### 4.3 G3 — Connects that overlap (RED)

Name: `G3: three Connects that overlap open one terminal, and the one key file that is left is the file that its line names`.
The world holds every lookup until the third has arrived:

```ts
let arrived = 0;
let createdWhenAllArrived = -1;
let open: () => void = () => undefined;
const gate = new Promise<void>((resolve) => { open = resolve; });
const w = linkedWorld({
  lookupGate: gate,
  duringLookup: () => {
    arrived += 1;
    if (arrived === 3) {
      createdWhenAllArrived = w.created.length;
      open();
    }
  },
});
```

`opened = await Promise.all([1, 2, 3].map(() => w.mod.connectEntity(ACCOUNT_ID, linked(), options)))`. Assertions, in this order:

1. `opened` is `[true, true, true]`. `createdWhenAllArrived` is 0 (message: `G3: the three Connects were all inside prepare
   before a terminal existed`). This is the proof that the test overlaps; without the gate it does not (K12 g).
2. `w.created.length` is 1; `w.created[0].sent.length` is 1; `w.materialised.length` is 3 and the set has 3.
3. `named = w.materialised.filter((file) => w.created[0].sent[0].includes(`-i "${file}"`))` has length 1.
4. `kept(w)` is deep-equal to `named`, with the message
   `` `G3: 3 Connects at once left ${kept(w).length} key files (the typed line names ${named[0]}): ${kept(w).join(', ')}` ``.
   The file that is kept must be the one that the line names, whichever Connect opened first.
5. `w.closeListenerCount()` is 1. `w.closeTerminal(w.created[0])`; `kept(w)` is `[]`; `w.forgotten.length` is 3;
   `w.closeListenerCount()` is 0.

### 4.4 G4 — another terminal in the window (a guard; green before and after)

Name: `G4: another terminal in the window changes nothing: the key of a new terminal is kept until its own terminal closes`.
`const foreign: Terminal = { name: 'somebody else', sent: [], disposed: false };` and `w.existing.push(foreign)` before the
Connect (`Terminal` is a type-only import from the world; the terminal is live and nobody claimed it). Steps and assertions:

1. Connect. `w.created.length` is 1; `w.created[0].sent.length` is 1; `a = writtenCallKey(w)`.
2. `w.forgotten` is `[]`, with the message
   `` `G4: another terminal was in the window, and the key of the NEW terminal was forgotten: ${w.forgotten.join(', ')}` ``;
   `w.closeListenerCount()` is 1.
3. `w.closeTerminal(foreign)`; `w.forgotten` is `[]`; `w.closeListenerCount()` is 1.
4. `w.closeTerminal(w.created[0])`; `w.forgotten` is `[a]`; `w.closeListenerCount()` is 0.

### 4.5 T-N17c, extended (a guard of the fix; green before and after)

The test `:78-106` keeps its name and every line. Added, in this order:

- after the two positives of `:95-96`: for each of `first.sent[0]`, `second.sent[0]`, `first.name` and `second.name`,
  `keyLeaks(text)` is `[]`, with the message `` `T-N17c: ${text}` `` (the leak check on the second line was missing);
- the assertion of `:99` gets the message
  `` `T-N17c: the key of the terminal that replaced an ended one was forgotten before a close: ${w.forgotten.join(', ')}` ``,
  and after it `w.closeListenerCount()` is 2. Here the ENDED first terminal is still in `window.terminals`, so it is in the
  snapshot; the second terminal is new and its key must stay;
- after the first close (`:101-102`) the count is 1; after the second (`:104-105`) it is 0.

**The run of step 3** (compile, then `npm test`): 3 failed tests and no other (G1, G2, G3), each by its assertion. G4 and
T-N17c pass. Save the three texts.

## 5. Step 4 — the fix

In `sshConnect.ts`, `openKeyTerminal` (`:116-134`) becomes:

```ts
/**
 * The key, the agent's answer or no credential: one terminal. Its key file is forgotten when THAT terminal closes; at once when
 * no terminal opened; and at once when `openSshTerminal` gave back a terminal that was in the window before the call (a live
 * terminal of this entry, reused). It typed nothing then, so no line names this file and no `ssh` will read it. The file that
 * the reused terminal's own line names stays until that terminal closes. So an open terminal holds one key file and one listener.
 */
function openKeyTerminal(ready: ReadySsh, place: SshTerminalPlace): boolean {
  // The terminals of the window DIRECTLY before the open, with no `await` between: one that is in this set was not made by this call.
  const before = new Set(vscode.window.terminals);
  const terminal = openSshTerminal(ready.entity, ready.options, ready.platform, ready.prefix, place);
  const materialized = ready.materializedKeyPath;
  if (materialized !== undefined) {
    if (terminal === undefined || before.has(terminal)) {
      forgetMaterializedKey(materialized);
    } else {
      const sub = vscode.window.onDidCloseTerminal((closed) => {
        if (closed === terminal) {
          forgetMaterializedKey(materialized);
          sub.dispose();
        }
      });
    }
  }
  return terminal !== undefined;
}
```

Three edits: the docblock, the line of `before` with its comment, and the condition. The listener, the `return` and every other
function of the file do not change. The comment `// Wipe the decrypted key from disk as soon as the session ends.` (`:120`) goes:
the docblock says it.

**The reason, to be kept in the docblock as written:** the new path was never sent to any terminal. Do not write "the `ssh` of
the live terminal has authenticated": `exitStatus === undefined` proves neither that an `ssh` runs nor that it has read its key.

In `terminalManager.ts`, one comment line above `if (existing) {` (`:54`), and no other change of that file:

```ts
  // A reused terminal gets NO line: `openKeyTerminal` (sshConnect.ts) forgets the key file of such a call at once.
```

Then: the 3 tests pass, the full suite is green, `typecheck` and `lint` are clean. If a test of another world fails at
`vscode.window.terminals`, the `vscode` stand-in of that world has no `window`: tell the lead. (None is known: the world of this
story has the list, `test/brokerAbandoned.test.ts:536` has it, and a stand-in whose `window` has no `terminals` gives an empty
set.)

## 6. Step 5 — the mutation checks (each one must turn the named tests red; restore after each one)

Each mutation must compile (`tsc`; lint is not asked of a mutation): a red by a compile error proves nothing. After each one,
restore the file and see that `git status --short` shows only the changes of the story. Record the red tests of each mutation.
The lists are those of K12 (f); a difference goes to the lead.

| # | The change, exact | Must go red |
|---|---|---|
| M7 | The check dropped: the condition is `terminal === undefined` again (the line of `before` stays) | G1 (step 3), G2, G3 |
| M8 | The snapshot AFTER the call: the line of `before` moves below the line of `openSshTerminal` | G1 (step 1: the key of a new terminal is forgotten), G2, G3, G4 (step 2), T-N17c |
| M9 | The snapshot before the `await` of prepare: `const before = new Set(vscode.window.terminals);` stands in `connectEntity` above `const prepared = await prepareSshSession(…)` and is handed through `openReady` to `openKeyTerminal`, which takes none of its own | G3 (three files kept), and no other: only an overlap shows it |
| M10 | A listener also on reuse: `if (terminal === undefined) { forget } else { if (before.has(terminal)) { forget } const sub = … }` | G1 (step 4: two listeners), G2, G3 |
| M11 | Forget on any close: `if (closed === terminal)` becomes `if (closed !== undefined)` (M3 of the S1 spec, on the new tests) | G1 (step 5), G4 (step 3), T-N17c, L6 |
| M12 | The dispose mutation of the Opus review: `sub.dispose();` moves out of the `if`, to the end of the listener | G1 (step 5: no listener left), G4 (step 3), T-N17c, L6. Green on the world of today (K12 h) |
| M13 | The folder mutation of the Opus review, in `sshSession.ts:473`: `` materializeCallKey(`${storageDir}/${source.keyEntityId}`, source.content) `` | FX-D, T-N17a (2), T-N17b, T-N17c (the new leak checks), T-N17d. Green on the world of today (K12 h) |
| M14 | Any terminal counts: `before.has(terminal)` becomes `before.size > 0` | G4 (step 2), T-N17c |
| M15 | Reuse judged by an earlier terminal of the entry, an ended one too: `before.has(terminal)` becomes `[...before].some((t) => isSshTerminalOf(t, place.accountId, ready.entity.id))` | T-N17c (the key of the terminal that replaced an ended one is forgotten), and no other |
| M16 | The world's `dispose` a no-op again: in `test/vscodeStub.ts:156`, `this.listeners.splice(at, 1);` becomes `void at;` | FX-L, G1, G2, G3, G4, T-N17c |
| M17 | The old writer back (M1 of the S1 spec) | T-N17d, at its assertion 4 (`the dialog holds hid-key-8f3k2`); and the tests of M1 |

## 7. Step 6 — the documents (the parent's §4)

- **`src_vs_code/CHANGELOG.md`**, under `## [Unreleased]`, the section `### Changed — security: the key file of a terminal`
  (`:9-15`). Its last two sentences (`:14-15`, from "Two Connects of one entry now write two files") are replaced by, in plain
  sentences for a user: two terminals of one entry have two files, and each terminal deletes its own. A second *Connect via
  SSH*, or a second `creds_open_terminal` of an agent, while the entry's terminal is still open brings that terminal forward
  and types nothing; the key file written for that call is deleted at once. So an open terminal keeps exactly one key file,
  however often it is asked for. The sentence "it leaves one more key file until that terminal closes" must be gone: that
  state is never released.
- **`research/module_extension.md`**: after the sentence on `isolate` (`:257-259`), who owns the key file on Connect:
  `openKeyTerminal` (`sshConnect.ts`) forgets it when its terminal closes, at once when no terminal opened, and at once when
  `openSshTerminal` gave back a terminal that was in the window before the call (a reused live terminal: no line names the
  new file); an open Connect terminal holds one key file and one close listener. The row *SSH private key on disk* (`:6126`):
  add that a Connect which reuses an open terminal deletes its file at once.
- **`research/module_tests.md`**: the row of the connect path (`:1159`): the count of `sshConnectKeyName.test.ts` that the
  runner prints; G1 as rewritten; G2, G3, G4; FX-D, FX-L, T-N17d; T-N17c with its leak checks; the world's close event is the
  shared `StubEventEmitter` and `closeListenerCount` reads it; `lookupGate`. What the tests do NOT prove: a real VS Code
  window (§11, item 1).
- **`todo/README.md`**: the row of the parent says what is built. The rows of the two specs stand (the row of this spec was
  added with this file).
- The parent's §13 N17 line and the promotion are not part of this story.

## 8. Order of work, and the commits

Every commit is green (`git-workflow.md` rule 2). The RED states stay in the working tree, never committed: run, read, save the
text, go on.

| State or commit | Holds | The state of `npm test` | Message |
|---|---|---|---|
| state 1 (RED, not committed) | step 1: FX-D, FX-L, T-N17d on the unchanged world | 3 red, no other | — |
| c3 | steps 1 and 2: the three tests and W6 to W9 | green; `typecheck` clean; no older test changed | `test(ssh): N17 — the world's key writer uses its folder, its close event disposes, its failed write names the file` — its body quotes the three RED texts and says that no older test changed colour |
| state 3 (RED, not committed) | step 3: G1 rewritten, G2, G3, G4, T-N17c extended | 3 red (G1, G2, G3), no other | — |
| c4 | steps 3 to 5: the tests, the fix, the comment in `terminalManager.ts`, the results of M7 to M17 | green | `fix(ssh): N17 — a Connect that reuses a live terminal forgets its key file at once` — its body quotes the three RED texts, the pass, and the red tests of each mutation |
| c5 | step 6: the documents | green | `docs(ssh): N17 — one key file per terminal: the CHANGELOG and the module documents` |

## 9. Done when (each item can be counted)

- [ ] **The world first.** In state 1, 3 tests fail (FX-D, FX-L, T-N17d), each by its assertion, 0 compile errors. After step 2,
      `typecheck` exits 0 and `npm test` shows 0 failed tests, with no older test edited.
- [ ] **RED.** In state 3, 3 tests fail (G1, G2, G3), each by its assertion; G4 and T-N17c pass. The texts are saved.
- [ ] **GREEN.** After the fix all pass. `npm test`, `npm run typecheck` and `npm run lint` are clean, with no new
      `eslint-disable`.
- [ ] **One place.** `git diff 3e8270c1 -- src_vs_code/src ':!src_vs_code/src/test'` shows `sshConnect.ts` (`openKeyTerminal`
      only) and one comment line in `terminalManager.ts`, and no other file.
- [ ] **The 11 mutations** each turned its named tests red, and each was restored.
- [ ] **No other file.** The files of *Files with no change* have no difference against `3e8270c1`.
- [ ] **The documents** of §7 are in c5; the CHANGELOG no longer says that a key file is left.

## 10. Break it — ways to make the tests pass while the defect stays, and the row that stops each one

| # | The wrong way | What stops it |
|---|---|---|
| B13 | On reuse the product forgets the FIRST file, or both, so the count is right and the live line names a deleted file | G1 step 3: `forgotten` is exactly `[b]`; step 2: the line names `a`. G3 step 4: the kept file is the named one |
| B14 | The tests never reuse: the world lists no terminal, so every Connect opens a new one | G1 and G2: `w.created.length` is 1 and one line was typed, after several Connects |
| B15 | The second prepare writes nothing in the test, so "forgotten at once" is empty | G1 step 2 and G2 step 1: the number of files written |
| B16 | The overlap test does not overlap | G3 step 1 (`createdWhenAllArrived` is 0). K12 (g). M9 |
| B17 | The listener count is read from a list that `dispose` does not touch | FX-L. M16 |
| B18 | The files are thinned later (a timer, "keep the newest") | G1 step 3 and G2 step 2 read the state directly after the call, with no wait, and name the file that stays |
| B19 | Reuse is found from the extension's own list of claimed terminals, which also holds ended ones | T-N17c. M15 |
| B20 | The key of every Connect is forgotten at once when any terminal is open | G4. M14 |
| B21 | T-N17d passes because the dialog names no file | T-N17d assertion 3; state 1 is that case. M17 |

## 11. Not verified by this spec

1. **A real VS Code window.** No test runs in one. The fix needs two things of `vscode.window.terminals`: a terminal that this
   call created is not in a list read before the call (true by construction), and a reused terminal is the same object in the
   snapshot and in the `find` of `openSshTerminal` (K2: the reuse rule already stands on it). If the second failed, the result
   would be today's behaviour, a file kept until the close, and never a key deleted under a line that names it.
2. The tests of this document were run as compiled JavaScript on a scratch copy (K12), not written in TypeScript and not run by
   `npm test`. The whole suite, `typecheck` and `lint` were not run with the change. The first run of each step is the check.
   A difference from §1 goes to the lead before any fix.
3. **The file of a reused call still exists for a moment**: prepare writes it, and the open half deletes it right after, with
   no dialog and no wait between. It is not avoided (the parent's §2.2, decided against).
4. No test drives the agent's `sshTerminalAction` into the real terminal manager (F7 of the S1 spec). G2 calls `connectEntity`
   with the options that the agent's action passes.
5. Windows, a real `ssh`, and a terminal whose `ssh` has ended while its shell is open (the reuse rule types nothing there
   too; the parent's §5).
6. `StubEventEmitter.fire` keeps a throw of a listener in `StubEventEmitter.reported` and goes on (K6); the old dispatch let it
   reach the test. The listener of `openKeyTerminal` cannot throw in this world (the stand-in of `forgetMaterializedKey` adds to
   a list).

## Notes for the lead

Nothing below is decided in this spec against the parent. Each note says what the spec does and why.

1. **`Promise.all` alone is no overlap in this world** (K12 g). The re-review consult asked for "overlapping Connects with
   `Promise.all`". Measured, the first Connect has opened its terminal before the second reaches its lookup, so such a test is
   G2 again and M9 stays green. The spec adds the gate W9 and proves the overlap inside G3.
2. **The close event is not repaired in place; it becomes the shared `StubEventEmitter`** (`reuse-first.md`: the solved
   instance exists). It gives the real `dispose` and the dispatch over a copy that the consult asked for. Its price is one
   getter in `test/vscodeStub.ts`, a file that the parent's first scope did not name. `test/sshRoad.test.ts:28-41` and
   `test/vpnWorld.ts:133-136` hold two more private copies of such an event; they are not touched.
3. **G4 and the extended T-N17c are guards**: green before and after the fix, red only under mutations (§6). The RED proofs of the product change are G1, G2 and G3.
4. **T-N17d needs W8.** With the failure `disk full` the dialog names no file, and the leak check would pass for any name.
   The stand-in now fails as `fs` does. No product text changes.
5. **`terminalManager.ts` gets one comment** and no code. The condition of `openKeyTerminal` rests on "a reused terminal gets
   no line"; G1 (`sent.length` is 1) fails if that changes, and the comment tells the one who changes it.
6. **The call of the agent's action is `sshUseActions.ts:382`**, not `:377` as the parent's first text said; the parent is
   corrected.
7. **The S1 spec stays as the record of what E1.S1 built.** Its G1 and its list *Files with no change* are replaced here (the
   paragraph under the status line). Its status line still says "spec only, nothing built"; the code is at `3099f5a5`.
8. **PR #365 changes the three documents of §7** (K13). Whichever of the two merges second takes `main` in by a merge and
   resolves the documents by hand.
9. **M16 edits the shared stand-in** `test/vscodeStub.ts` for one run. Restore it before any other suite is trusted.
10. **Models.** Spec: Fable (security judgement). Code and tests: one Sonnet coder with this document as its brief. Review: Opus.
    The cornerstone ledger of the parent stays `1 of 1`.
