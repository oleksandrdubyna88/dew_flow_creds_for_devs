# PLAN — E1.S4 spec: the smoke on real input (section 10 of `ssh-agent-itest.cjs`)

> Status: **IMPLEMENTED, 2026-11-27.** Story E1.S4 (spec) of G1: merged (#379, squash `f3e9887d`) and released in extension 1.23.0 on 2026-11-23 (release PR #383, `95e11116`, tag `extension-v1.23.0`). G1 as a whole was finished and released in extension 1.24.0 on 2026-11-27 (release PR #395, squash `a63dee35`, tag `extension-v1.24.0` at `a63dee35`, published to the Marketplace the same day). The parent [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) records the release and the run on the release commit (§10.5).
>
> The status as it stood before the promotion, kept as it was written: **built 2026-11-18 (abd43690) on `fix/g1-person-roads-pin`, merged (#379, `f3e9887d`), not released: 40 of 40 checks locally on OpenSSH 10.2p1, and section 10 passed in CI on the merge commit (`ci · extension`, run 44362280657, both legs). Spec written 2026-11-17, by Opus.** A test harness, not a security judgement (the row *Judge* of
> `subagent-models.md`: test scenarios and the brief). Story E1.S4 of [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md)
> (its E1 *Done when*, the smoke; §5, P4; §3.7, its last row) and of its stories document
> [PLAN_person_roads_pin_host_key_E1.md](PLAN_person_roads_pin_host_key_E1.md) (`## E1.S4`, with its feasibility probe). This file is
> promoted together with the parent.
>
> Scope: `src_vs_code` — new `scripts/itestPinnedRoads.cjs`; `scripts/ssh-agent-itest.cjs` (its header and the call of section 10);
> the `module.exports` line of `scripts/itestSshd.cjs` and of `scripts/itestNoSharing.cjs` (two more names each, no other line);
> `src/test/personRoadsWorld.ts` (the entry's `user` and `port`); one document, `research/module_tests.md`. No product file. Branch
> `fix/g1-person-roads-pin`, after E1.S1 to E1.S3 on the same branch. Each `file:line` below was read in the worktree at `47b8579b`
> (E1.S1 and E1.S2 being built beside it) and on `main` at `ca99cd91`. Opus writes this spec, a Sonnet coder builds it, Opus reviews it.

Paths are relative to `src_vs_code/` unless they start with another folder. "The parent" is the plan linked above; "the stories
document" is E1's. This document's own names: the facts F1 to F12, the checks T1 to T40, the control MC1, the break-its Z1 to Z11.
"K1" and "K2" are two host keys, and the `sshd` that presents each. "The pin words" are E1.S1's six words,
`-o StrictHostKeyChecking=yes -o UserKnownHostsFile=<file> -o GlobalKnownHostsFile=<file>`. "Sentence C" is the parent's §3.5,
sentence C. This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`), and the parent
has one entry in its epoch, so a second one stops the whole plan.

## What E1.S4 builds, in one paragraph

The unit tests of E1.S1 to E1.S3 show the words that a pinned call SENDS and the file it writes. Whether `ssh` then refuses a host
with another key is `ssh`'s decision, and only a real `ssh` against a real `sshd` shows it (`testing.md`, *Asserting that you SENT a
protective option is not testing that it protects*). E1.S4 adds section 10 to `scripts/ssh-agent-itest.cjs`, in a new file
`scripts/itestPinnedRoads.cjs`. It drives the two registered commands *Install creds on host* and *Open Remote Bridge…* (whose socket
check makes the third road's two runs) through the compiled test world of N16 and E1.S2 (`out/test/personRoadsWorld.js`), with the
real runner, the real bridge spawner, the real pin writer and the real deletes, and with the real `ssh`, started through a shim that
records each start. The counterpart is ONE `sshd -D -e` per leg that serves every connection at its address. **Leg 1:** the entry is
pinned to K1 and K1 answers: the install reaches its question, the socket check reads the socket's mode, K1 logs one accepted login per
start, every start carries the pin words, and no pin file or client is left. **Leg 2:** the entry stays pinned to K1 and K2 answers at
the same address: every start ends with `Host key verification failed.`, K2 logs no login, the install shows sentence C and the
bridge's check shows its message. 40 checks. A hand control in a scratch copy (MC1: E1.S1's function made to answer `accept-new`) turns
leg 2 red.

| File | Change | Where |
|---|---|---|
| `scripts/itestPinnedRoads.cjs` (new) | section 10: the rig, the multi-connection starter, the end of a server, the shim, the two legs, 40 checks. About 420 lines | §4 |
| `scripts/ssh-agent-itest.cjs` | five header lines, one `require`, two lines of the call. 764 → 772 lines | §5 |
| `scripts/itestSshd.cjs` | its `module.exports` line (`:205`) names `freePort` and `listeningFailure` too. Nothing else | §3.1 |
| `scripts/itestNoSharing.cjs` | its `module.exports` line (`:443`) names `tool`, `within` and `settledAfter` too. Nothing else | §3.2 |
| `src/test/personRoadsWorld.ts` | `Parts.user` and `Parts.port`, and the snapshot that names them | §3.3 |
| `research/module_tests.md` | one row and one paragraph in the G1 section; one sentence in the row of `ssh-agent-itest.cjs` | §7 |

## Binding constraints

- **No plan change.** Build what the parent, the stories document and this document say. If a step cannot be done as written, a
  code block here does not run, a check does not turn out as this document says, or a name of E1.S1 to E1.S3 is not what §2 expects:
  stop and tell the lead. Do not repair the parent, the stories document or this document. A check name, a count or a bound that the
  first run shows to be wrong is reported as a fact, with the run's lines, and is not silently changed.
- **This code was written, not run.** This machine has no `/usr/sbin/sshd`, and E1.S1 to E1.S3 are not built yet. The first local run
  (§8, step 3) is its measurement. The feasibility probe of the stories document (F1 to F6) is what it rests on.
- **No product file changes.** `src/` changes only in `src/test/personRoadsWorld.ts`, by §3.3 and nothing else.
- **`scripts/itestSshd.cjs` changes by its exports line only.** PR #365 is open (§2, F9) and edits `startSshd`, its doc comment and the
  lines around `:111`. No line of `startSshd` is edited here, and its signature does not change. Sections 5, 7 and 9 start the same
  `sshd -d` as before, byte for byte.
- **The leftovers rules hold** (`common/test-leftovers.md`). Everything the run makes is in ONE owned folder made by `ownedDir` under
  the section's own scope, except the forwarded socket that the PRODUCT names (§4.9, F11), which the run removes by its exact path. The
  script never calls a temp-path API and never spells the temp variables: a child's environment comes from `harnessScope.tempEnv`.
  `test/harnessSites.test.ts` and the shipped guard read every script.
- **Never a guessed value the code computes** (`testing.md`). The saved host key comes from `formatHostKey(parseHostKey(<K1's .pub>))`;
  the pin folder from `materializedKeysDir`; the remote commands from `probeCommand`, `sweepCommand` and `modeCheckCommand`; the
  question from `confirmationFor`; sentence C from the function E1.S3 exports. The script types none of them.
- **A check is taken before anything of the cleanup runs.** "No client is alive" and "no pin file is left" are checked after the
  product's own ends (the close command, the end of each run) and BEFORE the end of the server, which signals what is left.
- **Stage by path.** Read `git diff --staged --stat` before the commit. Do not push; the lead pushes. No revert, no amend, no rewrite
  of history. Never a bare `git stash`. Never commit `.claude/settings.json`. Nothing of the local recipe (§8.2) is committed.
- **Node only.** No Python, also not for a helper. Write files with the Edit or Write tool, not with a shell heredoc. End a process by
  its pid, never by name.

## Facts that this spec uses

| # | Fact | Where |
|---|---|---|
| F1 | **One `sshd -D -e` serves a bridge and two runs at once, at one port.** Measured 2026-11-17: a bridge-like `ssh -N -R` and two runs, exit codes 0 and 0, the one log held 3 lines `Accepted publickey`. Each connection is an `sshd-session … [priv]` with a child, and each leads a session of its own, so a signal to the listener's process group does not reach it | the stories document, the probe, item 1 |
| F2 | **`endChild` of the listener alone does not end the server side**: the listener exits with 0 and what it forked lives on with new parents. The bounded recipe that ended all of it in about 5 s: list the descendants with their start times while the listener lives; end the clients; at most 3 s; TERM to what is left, at most 2 s, then KILL, only to a pid whose start time is still the recorded one; then `endChild`. The list has to be taken BEFORE the clients are ended | the probe, items 2 and 3 |
| F3 | **K2 can take K1's port** 45 ms after K1's end began. Four runs pinned to K1: exit code 255 and `Host key verification failed.` each; K2's log: 0 accepted logins, 0 lines of an authentication attempt | the probe, item 4 |
| F4 | **`PerSourcePenalties no` is needed in this mode** on `sshd` 10.2: with the default, after 17 refused host keys in a row the listener resets the next connections and refuses a right pin too | the probe, item 5 |
| F5 | `scripts/itestSshd.cjs` exports `SSHD`, `setChildTemp`, `launch`, `startSshd`, `endChild`, `lastLines`, `login` (`:205`). `freePort` (`:70`) and `listeningFailure` (`:122`) are private. `launch` registers `endChild` of the child with the scope right after the spawn (`:33`) | read |
| F6 | `scripts/itestNoSharing.cjs` exports `liveNoSharing` only (`:443`). Its `tool` (`:51`), `within` (`:61`) and `settledAfter` (`:164`) are the helpers this section needs | read |
| F7 | The test world (`src/test/personRoadsWorld.ts`, 225 lines at `47b8579b`; E1.S2's spec §5.1 takes it to 272) registers the REAL `registerAgentCommands` under a `vscode` stub through `loadWithVscode` (`test/vscodeStub.ts`), and `Parts.mocks` is spread LAST over its stand-ins (`mocksOf`), so a script can put the real runner back. The entry's snapshot has `user: 'dev'` and no `port` (`world`, `:184`; E1.S2's `detailsOf`). `realForget`, `spawn`, `storageDir`, `hostKey`, `clicks` and `checks` exist after E1.S2. `loadWithVscode` evicts every compiled module of `out/` from the require cache before it loads | read |
| F8 | The commands spawn the PATH's `ssh` with the resolved credential's environment: `runSshExec(argv, { env: credential.env, … })` (`commands/agentCommands.ts:185`, `:217`, `:343`) runs `options.program ?? 'ssh'` (`sshExecRunner.ts:95`), and the bridge `bridges.start(key, remote.path, 'ssh', argv, credential.env)` (`:452`) with `spawn(command, args, { env, … })` (`bridgeSpawner.ts:79`). Node looks the program up on the `PATH` of that environment. `todo/PLAN_ssh_exec_absolute_program.md` is about `ssh:exec` on Windows and changes none of these | read |
| F9 | PR #365 is OPEN (`gh pr view 365`, 2026-11-17): it gives `startSshd` a sixth parameter `options` (`address`, `port`, `first`) and edits its doc comment, its signature, the port, the known-hosts line, `ListenAddress` and the listening pattern. It does not touch `module.exports` | `gh pr diff 365` |
| F10 | **The runner's `sshd` is older.** `ubuntu-latest` is Ubuntu 24.04, whose `openssh-server` is 9.6p1 (read; measured later by the reviewer: 40/40, three runs). `PerSourcePenalties` came in 9.8, so a 9.6 `sshd` refuses the config line and does not start. 9.6 has no penalties to turn off. The CI step installs the package only when `/usr/sbin/sshd` is missing (`.github/workflows/ci-extension.yml:162-165`) | read |
| F11 | **The forwarded socket is not in the owned folder.** `openRemoteBridge` names it `remoteSocketPath(details.user, bridgeId(…))` (`agentCommands.ts:436`), which is `/tmp/creds-<user>-<id>.sock` (`sshBridge.ts:63-70`). Here the "remote" host is this machine, so `sshd` makes that socket in this machine's `/tmp`, and does not unlink it when the session ends (`sshBridge.ts:356-359`). The socket check's sweep (`sweepCommand`, `sshBridge.ts:373-382`) removes this user's `creds-<user>-*.sock` in that `/tmp` that nothing listens on | read |
| F12 | The install's question: `confirmationFor(interpretProbe(facts.stdout), node.name)` shown with `showInformationMessage(message, { modal: true, … }, action)` (`agentCommands.ts:297-302`); the world records a dialog that offers a button as `asked`. The bridge's own *Bridge open to …* offers a button too (`:471-473`) | read |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs`.

1. `node $LP npm run compile` — **read its exit first.**
2. Section 10 alone, in the scratch copy: `node "$SP/g1-run/run10.cjs" "$SP/g1-copy/src_vs_code"` (§8.2).
3. The whole script: `npm run itest:ssh-agent` (it compiles first and lowers itself).
4. `node $LP npm run typecheck`, `node $LP npm run lint`, `npm test`.
5. The leftovers guard, from the repository root: `node .agents/conventions/tools/leftovers-check.mjs --repo . --profile node --token creds --identity "the developer-credentials server and extension"`.
6. `node .agents/conventions/tools/plan-lifecycle.mjs .` and `node .github/scripts/public-hygiene.mjs`.

## 1. The legs, the checks, and what each check reads

**The rig** (one per run of the section). An owned folder `pin` under the short socket root. Inside it: three key pairs made by the
PATH's `ssh-keygen` (`k1`, `k2`: host keys; `user`: the login key), `authorized_keys` (the user key), `storage/` (the window's storage
folder: the pin files land in `storage/keys/<pid>/`), `shim/ssh` (§4.6), `records/` (one file per start), `client_config` (§4.6), and
one folder per server (`k1/`, `k2/`: `sshd_config`, `sshd.pid`). The entry: `host` `127.0.0.1`, `user` the user that runs the script,
`port` K1's, `hostKey` K1's public key as `formatHostKey` writes it. The credential that the world's resolver hands each click and the
check: `{ ok: true, keyPath: <user key>, env: <the rig's env>, auth: 'key' }`, a key the run named by its path, so the guards delete no
key file. The rig's env: this process's environment without `SSH_AUTH_SOCK`, with `<rig>/shim` first on `PATH`, through `tempEnv`.

**Leg 1** (K1 at a free port): the install, then the bridge, then its socket check, then *Close Remote Bridge*. **Leg 2** (K2 at K1's
port, after K1 ended): the install, then the bridge, then its socket check. A leg is four starts of `ssh`: the probe, the bridge, the
sweep and the mode check (the install's second run never starts: the question is dismissed in leg 1, and the probe fails in leg 2).

The checks, verbatim, in the order they are printed. `<n>` is filled at run time. A check name is printed as written here.

| # | Check (the name the script prints) | What it reads |
|---|---|---|
| T1 | `the throwaway keys were generated: K1, K2 and the user key` | `ssh-keygen` answered nothing on stderr, three times |
| T2 | `the shim resolved the real ssh outside its own folder` | `realSsh` found one (§4.6) |
| T3 | `K1 listens: one sshd -D -e at 127.0.0.1, on a port of its own` | `listeningFailure` |
| T4 | `the saved host key is K1's, and the product reads it: parseHostKey reads it and knownHostsLine forms its line` | `parseHostKey`, `knownHostsLine('127.0.0.1', port, key)` |
| T5 | `leg 1: Install creds on host ended within 30 s` | the click's promise |
| T6 | `leg 1: the install's probe was answered: exit 0, and no blocker` | the recorded outcome whose last word is `probeCommand()`; `blockerFor(interpretProbe(stdout)) === ''` |
| T7 | `leg 1: Install creds on host reached its question: one question, the one confirmationFor builds from the probe's answer` | the world's `asked`, new during the click |
| T8 | `leg 1: Open Remote Bridge… ended within 30 s, and the bridge is open` | the click; `bridges.isOpen(KEY)` |
| T9 | `leg 1: the forwarded socket exists while the bridge is open` | `lstat` of `bridges.remotePathFor(KEY)` is a socket |
| T10 | `leg 1: the socket check ran within 40 s: the sweep and the mode check, each exit 0` | the recorded outcomes |
| T11 | `leg 1: the bridge's check read the socket's mode: owner only` | `interpretSocketProbe(stdout).kind === 'mode'` and `isOwnerOnlyMode` |
| T12 | `leg 1: no warning and no error was shown, and the bridge's spawner reported nothing` | the world's `warnings`, `errors`; the spawner's reporter |
| T13 | `leg 1: Close Remote Bridge ends the bridge's ssh within 5 s` | the bridge's recorded pid and start time |
| T14 | `leg 1: the shim recorded 4 starts of ssh, each whole: the probe, the bridge, the sweep and the mode check` | `records/` |
| T15 | `leg 1: every start says StrictHostKeyChecking=yes and names ONE file as both known-hosts files` | `valuesOf` of E1.S1's `test/pinnedArgv.ts` |
| T16 | `leg 1: each named file is a pin file of this window: <keys folder>/known_hosts-e1-<uuid>` | `materializedKeysDir(storage)` |
| T17 | `leg 1: the install, the bridge and the check named 3 distinct pin files; the check's two runs named the same one` | the values of T15 |
| T18 | `leg 1: no pin file of these calls is left in the keys folder (5 s)` | `pinFiles(storage)` of the world |
| T19 | `leg 1: no ssh that the leg started is alive, by its recorded pid and start time` | `/proc/<pid>/stat` |
| T20 | `leg 1: K1 logged one accepted login per start: 4` | K1's stderr, `Accepted publickey for <user> from 127.0.0.1` |
| T21 | `K1 and every process it forked are gone` | the list of §4.4, after `endServer` |
| T22 | `K2 listens at K1's address after K1 ended: 127.0.0.1:<n>` | `listeningFailure` |
| T23 | `leg 2: Install creds on host ended within 30 s, and asked no question` | the click; `asked` |
| T24 | `leg 2: the install's probe was refused: exit 255 and "Host key verification failed."` | the recorded outcome |
| T25 | `leg 2: the install showed sentence C once, and never "did not answer the probe"` | `warnings` and `errors`, new during the click |
| T26 | `leg 2: Open Remote Bridge… ended within 30 s` | the click |
| T27 | `leg 2: the bridge's ssh ended by itself within 15 s: no bridge is open` | the world's `ended` holds `KEY`; `isOpen(KEY)` is false |
| T28 | `leg 2: the socket check ran within 40 s: the sweep and the mode check, each exit 255 and "Host key verification failed."` | the recorded outcomes |
| T29 | `leg 2: the bridge's check showed its message: exactly one error, "The bridge to \"box\" is not open: " and sentence C` | `errors`, new since the bridge click |
| T30 | `leg 2: no forwarded socket was made at the path the bridge named` | the `-R` value of the recorded bridge argv |
| T31 | `leg 2: the shim recorded 4 starts of ssh, each whole: the probe, the bridge, the sweep and the mode check` | as T14 |
| T32 | `leg 2: every start says StrictHostKeyChecking=yes and names ONE file as both known-hosts files` | as T15 |
| T33 | `leg 2: each named file is a pin file of this window: <keys folder>/known_hosts-e1-<uuid>` | as T16 |
| T34 | `leg 2: the install, the bridge and the check named 3 distinct pin files; the check's two runs named the same one` | as T17 |
| T35 | `leg 2: no pin file of these calls is left in the keys folder (5 s)` | as T18 |
| T36 | `leg 2: no ssh that the leg started is alive, by its recorded pid and start time` | as T19 |
| T37 | `leg 2: K2 was reached: its log holds a connection from 127.0.0.1 per start (at least 4)` | K2's stderr, `Connection from 127.0.0.1 port <p> on 127.0.0.1 port <n>` (`LogLevel VERBOSE`) |
| T38 | `leg 2: K2 logged no accepted login and no authentication attempt` | K2's stderr: no `Accepted `, `Failed `, `Postponed `, `Invalid user`, `authenticating user` |
| T39 | `K2 and every process it forked are gone` | as T21 |
| T40 | `the person's ~/.ssh/known_hosts is unchanged: the same bytes, or absent before and after` | a SHA-256 of the file before and after the section, read only |

Where `CI=true` and `/usr/sbin/sshd` is missing, the section prints one failed check instead, `the live pinned-roads legs ran`, and
nothing else. On a platform other than Linux, and locally without `sshd`, it prints one `skip` line.

**Why these and not more.** T14 to T17 and T31 to T34 are the argv as the product wrote it, read at the moment of the start; T20, T37
and T38 are the server's side, which no argv can show; T6, T7, T11 and T24 to T29 are what the person sees. T37 is the positive of leg 2
(`testing.md`, *A file full of negative assertions needs one positive*): without it, a leg 2 that reached no server would pass T38.

## 2. The names of E1.S1 to E1.S3 that the script reads

Read them in the built code before you write §4, and use the names that shipped:

| What | Where, as the specs name it | If it is not there |
|---|---|---|
| `valuesOf(argv, name)` | `test/pinnedArgv.ts` (E1.S1's spec §4) | stop and tell the lead |
| `pinFiles(storageDir)`, `world`, `click`, `KEY`, `ROW`, `Parts.hostKey`, `Parts.storageDir`, `World.ended` | `test/personRoadsWorld.ts` (E1.S2's spec §5.1) | stop |
| sentence C, as a function of the entry's name | `hostKeyPin.ts`, the new pure function of E1.S3 (the parent's §3.5; E1.S3's spec names it). §4 writes it `sentenceC` | if E1.S3 exports no function that returns the sentence, stop and tell the lead: the script must not type it |
| the bridge's form, `The bridge to "<name>" is not open: ` + sentence C | E1.S3 (the parent's §3.5). If E1.S3 exports a function for the whole form, use it; else the script joins that prefix and `sentenceC` | — |

## 3. The changes outside the new script

### 3.1 `scripts/itestSshd.cjs`: one line

`:205`, as it is now:

```js
module.exports = { SSHD, setChildTemp, launch, startSshd, endChild, lastLines, login };
```

becomes:

```js
module.exports = { SSHD, setChildTemp, launch, startSshd, endChild, lastLines, login, freePort, listeningFailure };
```

Nothing else in the file. `git diff --stat` shows `1 file changed, 1 insertion(+), 1 deletion(-)`.

### 3.2 `scripts/itestNoSharing.cjs`: one line

`:443`, `module.exports = { liveNoSharing };`, becomes `module.exports = { liveNoSharing, tool, within, settledAfter };`. Nothing else.

**Why exports and not copies** (`reuse-first.md`, *widen the existing thing*): `freePort`, `listeningFailure`, `tool`, `within` and
`settledAfter` are exactly what the new starter and the legs need, and a copy of each would drift. No signature changes, and #365
touches neither exports line (F9).

### 3.3 `src/test/personRoadsWorld.ts`: the entry's login and port

The world as E1.S2 left it builds the snapshot in `detailsOf` (E1.S2's spec §5.1). Three edits, against that file:

1. In the class docblock, after the paragraph that E1.S2 added about the saved host key, one more:

   ```ts
    * <p>The entry's `user` and `port` (E1.S4): the smoke of section 10 of `scripts/ssh-agent-itest.cjs` loads this world with a real runner
    * and a real spawner, and names the user that runs it and the port of its own `sshd`. Every suite leaves them out.</p>
    *
   ```

2. In `interface Parts`, directly below `hostKey?: string;`:

   ```ts
     /** The login of the entry (`user`). Default: `dev`. */
     user?: string;
     /** The port of the entry (`port`). Left out: the entry has no `port`, as before. */
     port?: number;
   ```

3. `detailsOf` becomes these two functions (complexity 3 and 1; lint's limit is 4):

   ```ts
   /** The fields of the entry that a test chose and that have no default: a field left out is not in the snapshot. */
   function chosenFields(parts: Parts): Record<string, unknown> {
     const fields: Record<string, unknown> = { hostKey: parts.hostKey, port: parts.port };
     return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
   }

   /** The snapshot of the entry that the storage answers. */
   function detailsOf(parts: Parts): Record<string, unknown> {
     return { id: ROW.node.id, name: ROW.node.name, isSshEnabled: true, host: parts.host ?? 'box.example', user: parts.user ?? 'dev', ...chosenFields(parts) };
   }
   ```

   E1.S2's `const pin = …` line goes: `chosenFields` carries `hostKey` the same way. A suite that gives no `user`, `port` or `hostKey`
   gets the same snapshot as before, byte for byte. `npm test` proves it: every suite that loads the world passes unchanged.

## 4. New `scripts/itestPinnedRoads.cjs`

The file, in the order below. Each block is meant word for word; a line may be wrapped differently. Functions stay short (the
scripts are not linted, and the repository's limits still apply in spirit: 50 lines, little nesting).

### 4.1 The header and the imports

```js
// Section 10 of `ssh-agent-itest.cjs` (G1, `research/PLAN_person_roads_pin_host_key_E1.md`, E1.S4), in a file of its own so that script stays
// under the 800-line limit.
//
// A pinned entry's roads must start `ssh` only against the saved host key. The unit tests show the words a pinned call SENDS and the file it
// writes; only a real `ssh` against a real `sshd` shows what the words DO (`testing.md`: a sent option is not a measured protection). So this
// drives the REGISTERED commands *Install creds on host* and *Open Remote Bridge…* (whose socket check is the third road) through the compiled
// test world `out/test/personRoadsWorld.js`, with the real runner, the real bridge spawner, the real pin writer and the real deletes, and the
// real `ssh` (through a shim first on PATH that records each start) against ONE `sshd -D -e` per leg, which serves every connection:
//   leg 1  pinned to K1, K1 answers: the install reaches its question, the socket check reads the socket's mode, K1 logs one accepted
//          login per start, every start carries the pin words, and no pin file and no client is left;
//   leg 2  still pinned to K1, K2 answers at the same address: every start ends with `Host key verification failed.`, K2 logs no login,
//          the install shows sentence C and the bridge's check shows its message.
// The control, by hand (`hostKeyWords` made to answer `accept-new`), turns leg 2 red: K2 then logs the logins.
//
// Linux only: the end of a server reads `/proc`. Where `CI=true` a missing sshd FAILS. The world's stand-ins that stay: `vscode`, and
// `resolveExecAuth`, which hands a key the run named by its path. Teardown, per leg: the bridges, then the server by the bounded recipe of
// the stories document (its descendants listed while it lives, the clients, then the rest by pid and start time, then the listener), then the
// forwarded socket by its exact path; the section's folder last.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('node:child_process');
const { SSHD, launch, endChild, freePort, listeningFailure } = require('./itestSshd.cjs');
const { tool, within, settledAfter } = require('./itestNoSharing.cjs');
const { ownedDir, shortSocketRoot } = require('./lib/leftovers.cjs');
const harnessScope = require('./lib/harnessScope.cjs');

const me = os.userInfo().username;
const VERIFY_FAILED = 'Host key verification failed.';
/** A line of an sshd log that only a client past the key check can cause. */
const AUTH_ATTEMPT = /Accepted |Failed |Postponed |Invalid user|authenticating user/;

/** `text` as a regular expression that matches it literally. */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
/** How many times `pattern` (a source, no flags) occurs in `text`. */
const occurrences = (text, pattern) => (text.match(new RegExp(pattern, 'g')) ?? []).length;
```

### 4.2 The product, loaded once

```js
/** The compiled modules this section reads, loaded ONCE before any world: `world()` evicts every module of `out/` from the require cache. */
function productOf(out) {
  const load = (file) => require(path.join(out, file));
  return {
    ...load('sshBridge.js'), // sweepCommand, modeCheckCommand, interpretSocketProbe, isOwnerOnlyMode
    ...load('remoteCliInstall.js'), // probeCommand, interpretProbe, blockerFor, confirmationFor
    ...load('hostKeyPin.js'), // parseHostKey, formatHostKey, knownHostsLine, and E1.S3's sentence C
    ...load('materializedKeys.js'), // materializedKeysDir
    runner: load('sshExecRunner.js'),
    spawner: load('bridgeSpawner.js'),
    world: load(path.join('test', 'personRoadsWorld.js')),
    argv: load(path.join('test', 'pinnedArgv.js')),
  };
}
```

`sentenceC` below stands for E1.S3's exported function (§2): write its real name where `sentenceC` stands, and import nothing else for it.

### 4.3 The multi-connection starter

```js
/** The config of a serving sshd. `penalties` false leaves `PerSourcePenalties no` out, for an sshd older than 9.8, which has no penalties. */
function servingConfig(rig, dir, hostKey, port, penalties) {
  return [
    `ListenAddress 127.0.0.1:${port}`,
    `HostKey ${hostKey}`,
    `AuthorizedKeysFile ${rig.authorizedKeys}`,
    `PidFile ${path.join(dir, 'sshd.pid')}`,
    'UsePAM no',
    'StrictModes no',
    'PasswordAuthentication no',
    'KbdInteractiveAuthentication no',
    // `Connection from …` is a VERBOSE line: it is how K2's log shows that leg 2 reached it (T37). `Accepted publickey` is there at any level.
    'LogLevel VERBOSE',
    // Measured on sshd 10.2 (2026-11-17): with the default, a run of refused host keys makes the listener refuse every next connection.
    ...(penalties ? ['PerSourcePenalties no'] : []),
    '',
  ].join('\n');
}

/** One start of the listener, waited for (10 s) by its "Server listening" line. */
async function startOnce(rig, dir, hostKey, port, penalties) {
  const config = path.join(dir, 'sshd_config');
  fs.writeFileSync(config, servingConfig(rig, dir, hostKey, port, penalties));
  const sshd = launch(rig.scope, SSHD, ['-D', '-e', '-f', config]);
  // The listener's identity, taken at once: the pid and the start time it has from the fork on. Once `sshd.exited` its pid may be another process's.
  const identity = { pid: sshd.child.pid, start: startOf(sshd.child.pid) };
  const listening = new RegExp(String.raw`Server listening on 127\.0\.0\.1 port ${port}`);
  return { sshd, identity, port, failure: await listeningFailure(sshd, listening, Date.now() + 10_000) };
}

/**
 * One `sshd -D -e` that serves EVERY connection to 127.0.0.1:`port` (a free port when none is given), in a folder `name` of its own: the
 * multi-connection mode of the stories document, a starter of this section because PR #365 edits `startSshd` (`itestSshd.cjs`), whose `sshd -d`
 * serves one connection. Once more without `PerSourcePenalties no` when this sshd does not know the word, and once more after 300 ms when the
 * port is still held (K2 on K1's port: the same port; a free port this starter took itself: a fresh one). `launch` registers the listener's end with the scope; `endServer` is the leg's own, first.
 */
async function startServingSshd(rig, name, hostKey, port) {
  const dir = path.join(rig.dir, name);
  fs.mkdirSync(dir);
  let chosen = port ?? (await freePort());
  let penalties = true;
  let started = await startOnce(rig, dir, hostKey, chosen, penalties);
  if (started.failure !== undefined && /PerSourcePenalties/.test(started.sshd.stderr)) {
    console.log(`info  ${name}: this sshd does not know PerSourcePenalties (before 9.8 it has none); started without the line`);
    await endChild(started.sshd);
    penalties = false;
    started = await startOnce(rig, dir, hostKey, chosen, penalties);
  }
  if (started.failure !== undefined && /Address already in use/i.test(started.sshd.stderr)) {
    await endChild(started.sshd);
    await new Promise((resolve) => setTimeout(resolve, 300));
    chosen = port ?? (await freePort()); // K2 waits for K1's port; K1 takes a fresh one, as `startOneSshd` does
    started = await startOnce(rig, dir, hostKey, chosen, penalties);
  }
  return started;
}
```

### 4.4 The end of a server (the recipe of the stories document, F2)

```js
/** The start time of a running process (field 22 of `/proc/<pid>/stat`), or `undefined` when it does not run or is a zombie. */
function startOf(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' '); // fields[0] is field 3, the state
    return fields[0] === 'Z' ? undefined : fields[19];
  } catch {
    return undefined;
  }
}

/** Whether `one` (`{ pid, start }`) still runs as the SAME process: a reused pid has another start time. */
const alive = (one) => one.start !== undefined && startOf(one.pid) === one.start;

/**
 * Every process below `root` now, with its start time: `ps -e -o pid=,ppid=`, walked from `root`. Answers `{ list, error }`: a `ps` that
 * failed is an `error` (the list is then empty and proves nothing), never a quiet empty list.
 */
async function descendantsOf(root) {
  const table = await new Promise((resolve) => {
    // The PATH lookup is on purpose, as `tool` does: `ps` of the machine the run is on.
    execFile('ps', ['-e', '-o', 'pid=,ppid='], { timeout: 5_000 }, (error, stdout) => resolve(error ? { error: String(error) } : { text: String(stdout) })); // NOSONAR: a CI rig
  });
  if (table.error !== undefined) {
    return { list: [], error: `ps failed: ${table.error}` };
  }
  const children = new Map();
  for (const line of table.text.trim().split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  return { list: below(children, root).map((pid) => ({ pid, start: startOf(pid) })).filter((one) => one.start !== undefined), error: undefined };
}

/** Every pid below `pid` in the table `children` (parent → its children), each once. */
function below(children, pid) {
  return (children.get(pid) ?? []).flatMap((child) => [child, ...below(children, child)]);
}

/** A signal to every one of `list` that still runs as the same process. */
function signalAll(list, signal) {
  for (const one of list.filter(alive)) {
    try {
      process.kill(one.pid, signal);
    } catch {
      // it ended between the look and the signal
    }
  }
}

const noneAlive = (ms, list) => within(ms, () => !list.some(alive));

/**
 * What the listener of `server` forked, now, as `descendantsOf` answers: `{ list, error }`. Only while it is still the SAME listener: once its
 * `sshd` exited (its pid may be reused) nothing is listed, and a listener that was gone by the end of the `ps` snapshot (the table may then
 * be a foreign process's) gives an empty list too; the processes the leg recorded while it ran are the caller's `taken`.
 */
async function descendantsOfListener(server) {
  const same = () => !server.sshd.exited && alive(server.identity);
  if (!same()) {
    return { list: [], error: undefined };
  }
  const seen = await descendantsOf(server.identity.pid);
  return same() ? seen : { list: [], error: seen.error }; // a changed listener lists nothing, but a failed `ps` stays a failure
}

/**
 * Ends a serving sshd and everything it forked, bounded: (a) its descendants are listed now (`descendantsOfListener`: never the descendants
 * of a pid that sshd no longer has), beside `taken` (a list made earlier, before a client was ended: afterwards a remote command is no
 * descendant any more); (b) the clients still running are ended by their recorded pids;
 * (c) at most 3 s for the rest to go with them; (d) TERM to what is left, at most 2 s, then KILL, at most 2 s, each only to a pid whose start
 * time is still the recorded one; (e) the listener, by `endChild`. `taken` is `{ list, error }` of an earlier `descendantsOf`. Answers
 * `{ list, error }`, for T21 and T39: an `error` of either listing makes the check fail. Never throws.
 */
async function endServer(server, clients, taken) {
  const now = await descendantsOfListener(server);
  const list = [...taken.list, ...now.list];
  const error = taken.error ?? now.error;
  signalAll(clients, 'SIGTERM');
  if (!(await noneAlive(3_000, list))) {
    signalAll(list, 'SIGTERM');
    if (!(await noneAlive(2_000, list))) {
      signalAll(list, 'SIGKILL');
      await noneAlive(2_000, list);
    }
  }
  await endChild(server.sshd);
  return { list, error };
}

/**
 * Registers a leg's teardown with the section's scope, so a signal or an uncaught error in the middle of a leg ends its processes too (the
 * leg's `finally` does not run when `harnessScope.finish` exits the process). ONE callback, in this order: what the listener forked is listed
 * FIRST (the scope runs its callbacks in reverse registration order, so two callbacks would close the bridges before the listing, and a remote
 * command that left the tree by then would be missed), then the bridges are closed, then `endServer` with that list. After the leg's own end
 * the listener has `exited`, nothing is listed (`descendantsOfListener`) and the second `endServer` signals no foreign pid. SIGKILL cannot be
 * handled: it still leaves them.
 */
function endLegWithScope(rig, leg, server, saved) {
  rig.scope.after(async () => {
    const fresh = await descendantsOfListener(server);
    const earlier = saved(); // read after the await: the leg may have taken a later snapshot meanwhile
    await leg.w.bridges.dispose();
    await endServer(server, startsOf(rig, leg), { list: [...earlier.list, ...fresh.list], error: earlier.error ?? fresh.error });
  });
}
```

Each leg declares `let taken` first and passes `() => taken`, so a signal after the leg took its snapshot still ends a remote
command that has left the listener's tree (CodeRabbit on #379). A failed `ps` stays a failure in both lists.

### 4.5 The forwarded socket (F11)

```js
/**
 * Removes the forwarded socket of a bridge by its EXACT path: `sshd` makes it where the product names it (`/tmp/creds-<user>-<id>.sock`,
 * outside the owned folder) and never unlinks it. Only a socket, and only one this user owns. Never throws.
 */
function removeSocket(socketPath) {
  try {
    const stat = fs.lstatSync(socketPath);
    if (stat.isSocket() && stat.uid === process.getuid()) {
      fs.rmSync(socketPath);
    }
  } catch {
    // not there: nothing to remove
  }
}

const isSocket = (socketPath) => {
  try {
    return fs.lstatSync(socketPath).isSocket();
  } catch {
    return false;
  }
};

/** The remote socket path of a recorded bridge argv: the `-R` value up to its first `:`. */
const remoteOf = (argv) => (argv.includes('-R') ? argv[argv.indexOf('-R') + 1].split(':')[0] : undefined);
```

### 4.6 The shim and its records

```js
/** `text` in single quotes for `sh`: a `'` inside ends the quote, is escaped, and opens it again. */
const shQuote = (text) => `'${text.replaceAll("'", String.raw`'\''`)}'`;

/** The real path of an executable file, or `undefined`. */
function realExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.realpathSync(file);
  } catch {
    return undefined;
  }
}

/**
 * The real `ssh`: the first on this process's PATH whose REAL path is outside `shimDir` (`testing.md`: a shim resolves the program it wraps
 * once, at install, with its own folder out of the lookup, by real path, and never at run time).
 */
function realSsh(shimDir) {
  const own = fs.realpathSync(shimDir);
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter((dir) => dir !== '');
  return dirs
    .map((dir) => realExecutable(path.join(dir, 'ssh')))
    .find((real) => real !== undefined && path.dirname(real) !== own && !real.startsWith(`${own}${path.sep}`));
}

/**
 * Writes `<shim>/ssh`: it records each start as `<records>/<pid>.argv` (its pid, its start time, how many words, then each word, every one ended
 * by a NUL byte: the probe's command holds newlines), then becomes the real client by `exec` (so the recorded pid IS the client's), with the rig's config before the product's
 * argv. `set -C`: a record that exists already is never overwritten, and that start fails with 97. Answers the real path, or `undefined`.
 */
function installShim(rig) {
  const real = realSsh(rig.shimDir);
  if (real !== undefined) {
    const record = `${shQuote(rig.records)}/"$$".argv`;
    const lines = [
      '#!/bin/sh',
      '# The ssh of section 10 of ssh-agent-itest.cjs: it records this start, then becomes the real client. Written once, at install.',
      'set -C',
      `{ printf '%s\\0' "$$" "$(cut -d' ' -f22 /proc/$$/stat)" "$#"; printf '%s\\0' "$@"; } > ${record} || exit 97`,
      `exec ${shQuote(real)} -F ${shQuote(rig.clientConfig)} "$@"`,
      '',
    ];
    fs.writeFileSync(path.join(rig.shimDir, 'ssh'), lines.join('\n'), { mode: 0o700 });
  }
  return real;
}

/**
 * The client config the shim hands the real `ssh`, so the person's `~/.ssh/config` and `/etc/ssh/ssh_config` are not read. Its two lines
 * are what a call WITHOUT the pin words falls back to (the control MC1): no known-hosts file at all, so every host is a first contact and
 * nothing is written into the person's files. A command-line `-o` wins over these (E1.S1's fact K9), so a pinned call reads its pin file.
 */
function writeClientConfig(rig) {
  fs.writeFileSync(rig.clientConfig, 'Host *\n  UserKnownHostsFile /dev/null\n  GlobalKnownHostsFile /dev/null\n');
}

/** Every start the shim recorded: `{ file, pid, start, argv, whole }`; `whole` is false when the count of words does not match. */
function recordedStarts(rig) {
  return fs.readdirSync(rig.records).filter((name) => name.endsWith('.argv')).sort().map((file) => {
    const [pid, start, size, ...argv] = fs.readFileSync(path.join(rig.records, file), 'utf8').split('\0').slice(0, -1);
    return { file, pid: Number(pid), start, argv, whole: argv.length === Number(size) };
  });
}
```

### 4.7 One leg's world

```js
/** The credential the world's resolver hands each click and the check: a key the run named by its path, so no key file is deleted. */
const credentialOf = (rig) => ({ ok: true, keyPath: rig.userKey, env: rig.env, auth: 'key' });

/** The real `runSshExec`, recording each run's argv and outcome. It changes nothing of what the product gets. */
function recordingRunner(runner, outcomes) {
  return {
    runSshExec: (argv, options) =>
      runner.runSshExec(argv, options).then(
        (outcome) => {
          outcomes.push({ argv, outcome });
          return outcome;
        },
        (error) => {
          outcomes.push({ argv, error: String(error) });
          throw error;
        },
      ),
  };
}

/** The world of one leg: the real agent commands, the real runner and spawner, the real pin writer and deletes, the entry pinned to K1 at `port`. */
function openLeg(rig, port) {
  const { product } = rig;
  const outcomes = [];
  const reported = [];
  const w = product.world.world({
    host: '127.0.0.1',
    user: me,
    port,
    hostKey: rig.pin,
    storageDir: rig.storage,
    realForget: true,
    clicks: [credentialOf(rig), credentialOf(rig)],
    checks: [credentialOf(rig)],
    spawn: product.spawner.bridgeSpawner({ report: (error) => reported.push(String(error)) }),
    mocks: { '../sshExecRunner': recordingRunner(product.runner, outcomes) },
  });
  return { w, outcomes, reported, before: new Set(recordedStarts(rig).map((one) => one.file)) };
}

/** The starts of this leg so far. */
const startsOf = (rig, leg) => recordedStarts(rig).filter((one) => !leg.before.has(one.file));

/**
 * Resolves `{ ended, error }`: `ended` is true when `promise` FULFILLS within `ms`; a rejection is kept as `error` (its text), not an end,
 * and a click that is still running after `ms` has neither. The checks that read it put `error` into their detail (T5, T8, T23, T26).
 */
const finishes = (promise, ms) =>
  settledAfter(promise.then(() => ({ ended: true }), (error) => ({ ended: false, error: String(error?.stack ?? error) })), ms).then((result) => ({ ended: result?.ended === true, error: result?.error }));

/** The recorded outcome of the run whose last word is `command`, or `undefined`. */
const runOf = (leg, command) => leg.outcomes.find((one) => one.argv.at(-1) === command);

/** What a world array holds that it did not hold at `mark`. */
const since = (list, mark) => list.slice(mark);
```

### 4.8 What every leg checks about its starts (T14 to T19, T31 to T36)

```js
/** Which run a recorded start is: by `-N` for the bridge, by its remote command for the three runs. */
function kindOf(argv, commands) {
  if (argv.includes('-N')) {
    return 'bridge';
  }
  return Object.keys(commands).find((kind) => commands[kind] === argv.at(-1)) ?? 'other';
}

/** The pin file a start names, when it names ONE file as both known-hosts files and says `yes`; else `undefined`. */
function pinOf(product, argv) {
  const strict = product.argv.valuesOf(argv, 'StrictHostKeyChecking');
  const user = product.argv.valuesOf(argv, 'UserKnownHostsFile');
  const global = product.argv.valuesOf(argv, 'GlobalKnownHostsFile');
  const one = strict.length === 1 && strict[0] === 'yes' && user.length === 1 && global.length === 1 && user[0] === global[0];
  return one ? user[0].replace(/^"(.*)"$/, '$1') : undefined;
}

async function startsHoldThePin(check, rig, leg, label) {
  const { product } = rig;
  const starts = startsOf(rig, leg);
  const remote = remoteOf(starts.find((one) => one.argv.includes('-N'))?.argv ?? []) ?? '';
  const commands = { probe: product.probeCommand(), sweep: product.sweepCommand(me), mode: product.modeCheckCommand({ path: remote }) };
  const kinds = starts.map((one) => kindOf(one.argv, commands)).sort();
  check(`${label}: the shim recorded 4 starts of ssh, each whole: the probe, the bridge, the sweep and the mode check`, starts.every((one) => one.whole) && kinds.join(',') === 'bridge,mode,probe,sweep', JSON.stringify(kinds));
  const pins = starts.map((one) => ({ kind: kindOf(one.argv, commands), file: pinOf(product, one.argv) }));
  check(`${label}: every start says StrictHostKeyChecking=yes and names ONE file as both known-hosts files`, pins.length === 4 && pins.every((one) => one.file !== undefined), JSON.stringify(starts.map((one) => product.argv.valuesOf(one.argv, 'UserKnownHostsFile'))));
  const keys = product.materializedKeysDir(rig.storage);
  const named = /^known_hosts-e1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  check(`${label}: each named file is a pin file of this window: ${keys}/known_hosts-e1-<uuid>`, pins.length === 4 && pins.every((one) => one.file !== undefined && path.dirname(one.file) === keys && named.test(path.basename(one.file))), JSON.stringify(pins));
  const of = (kind) => pins.find((one) => one.kind === kind)?.file;
  const distinct = new Set([of('probe'), of('bridge'), of('sweep')]);
  check(`${label}: the install, the bridge and the check named 3 distinct pin files; the check's two runs named the same one`, !distinct.has(undefined) && distinct.size === 3 && of('sweep') === of('mode'), JSON.stringify(pins));
  return starts;
}

async function nothingLeft(check, rig, leg, label) {
  const files = () => rig.product.world.pinFiles(rig.storage);
  const empty = await within(5_000, () => files().length === 0);
  check(`${label}: no pin file of these calls is left in the keys folder (5 s)`, empty, JSON.stringify(files()));
  const living = startsOf(rig, leg).filter(alive);
  check(`${label}: no ssh that the leg started is alive, by its recorded pid and start time`, living.length === 0, JSON.stringify(living.map((one) => one.pid)));
}
```

`pinOf` takes the double quotes off a quoted path (E1.S1 writes a path with white space in double quotes); the owned folder has no white
space, so here every value is bare.

### 4.9 Leg 1

```js
/** Leg 1, the install: it reaches its question (T5 to T7). */
async function installAsks(check, rig, leg) {
  const { product, w } = { product: rig.product, w: leg.w };
  const asked = w.asked.length;
  const click = await finishes(product.world.click(w, 'installRemoteCli'), 30_000);
  check('leg 1: Install creds on host ended within 30 s', click.ended, click.error);
  const probe = runOf(leg, product.probeCommand());
  const facts = product.interpretProbe(probe?.outcome?.stdout ?? '');
  check('leg 1: the install\'s probe was answered: exit 0, and no blocker', probe?.outcome?.exitCode === 0 && product.blockerFor(facts) === '', JSON.stringify({ probe, blocker: product.blockerFor(facts) }));
  const questions = since(w.asked, asked);
  const expected = product.confirmationFor(facts, product.world.ROW.node.name).message;
  check('leg 1: Install creds on host reached its question: one question, the one confirmationFor builds from the probe\'s answer', questions.length === 1 && questions[0].message === expected, JSON.stringify(questions));
}

/** Leg 1, the bridge and its socket check (T8 to T12). Answers the remote path. */
async function bridgeIsChecked(check, rig, leg) {
  const { product, w } = { product: rig.product, w: leg.w };
  const click = await finishes(product.world.click(w, 'openRemoteBridge'), 30_000);
  check('leg 1: Open Remote Bridge… ended within 30 s, and the bridge is open', click.ended && w.bridges.isOpen(product.world.KEY), click.error);
  const remote = w.bridges.remotePathFor(product.world.KEY);
  if (remote !== undefined) {
    rig.scope.after(() => removeSocket(remote)); // at once, before anything can fail
  }
  // `sshd` binds the socket once the login is through, which the click does not wait for: a bounded wait (5 s) while the bridge is open.
  const bound = remote !== undefined && (await within(5_000, () => isSocket(remote)));
  check('leg 1: the forwarded socket exists while the bridge is open', bound && w.bridges.isOpen(product.world.KEY), String(remote));
  const mode = () => runOf(leg, product.modeCheckCommand({ path: remote ?? '' }));
  const ran = await within(40_000, () => mode() !== undefined);
  const sweep = runOf(leg, product.sweepCommand(me));
  check('leg 1: the socket check ran within 40 s: the sweep and the mode check, each exit 0', ran && sweep?.outcome?.exitCode === 0 && mode()?.outcome?.exitCode === 0, JSON.stringify({ sweep, mode: mode() }));
  const answer = mode()?.outcome?.stdout ?? '';
  const probe = product.interpretSocketProbe(answer);
  check('leg 1: the bridge\'s check read the socket\'s mode: owner only', probe.kind === 'mode' && product.isOwnerOnlyMode(probe.mode), JSON.stringify(answer));
  check('leg 1: no warning and no error was shown, and the bridge\'s spawner reported nothing', w.warnings.length === 0 && w.errors.length === 0 && leg.reported.length === 0, JSON.stringify({ warnings: w.warnings, errors: w.errors, reported: leg.reported }));
}

/** Leg 1, the close (T13). */
async function closeEnds(check, rig, leg) {
  const bridge = startsOf(rig, leg).find((one) => one.argv.includes('-N'));
  await rig.product.world.click(leg.w, 'closeRemoteBridge');
  const ended = bridge !== undefined && (await within(5_000, () => !alive(bridge)));
  check('leg 1: Close Remote Bridge ends the bridge\'s ssh within 5 s', ended, JSON.stringify(bridge?.pid));
}

/** Leg 1: K1 answers, the entry is pinned to K1. Answers K1's port, or `undefined` when K1 did not start. */
async function legOne(check, rig) {
  const server = await startServingSshd(rig, 'k1', rig.k1, undefined);
  check('K1 listens: one sshd -D -e at 127.0.0.1, on a port of its own', server.failure === undefined, server.failure);
  const key = rig.product.parseHostKey(rig.pin);
  check('the saved host key is K1\'s, and the product reads it: parseHostKey reads it and knownHostsLine forms its line', key !== undefined && rig.product.knownHostsLine('127.0.0.1', server.port, key) !== undefined, rig.pin);
  if (server.failure !== undefined) {
    await endChild(server.sshd);
    return undefined;
  }
  const leg = openLeg(rig, server.port);
  endLegWithScope(rig, leg, server);
  let taken = { list: [], error: undefined };
  try {
    await installAsks(check, rig, leg);
    await bridgeIsChecked(check, rig, leg);
    taken = await descendantsOfListener(server); // before the close: afterwards a remote command is no descendant any more
    await closeEnds(check, rig, leg);
    const starts = await startsHoldThePin(check, rig, leg, 'leg 1');
    await nothingLeft(check, rig, leg, 'leg 1');
    const accepted = occurrences(server.sshd.stderr, `Accepted publickey for ${literal(me)} from 127\\.0\\.0\\.1`);
    check('leg 1: K1 logged one accepted login per start: 4', accepted === 4 && starts.length === 4, `${accepted} accepted\n${server.sshd.stderr.trim().split('\n').slice(-20).join('\n')}`);
  } finally {
    leg.w.bridges.dispose();
    const { list, error } = await endServer(server, startsOf(rig, leg), taken);
    // The bridge's session was alive when `taken` was made, so an empty list means the listing saw nothing: it proves nothing.
    check('K1 and every process it forked are gone', server.sshd.exited && error === undefined && list.length > 0 && !list.some(alive), error ?? JSON.stringify({ forked: list.length, alive: list.filter(alive) }));
  }
  return server.port;
}
```

### 4.10 Leg 2

```js
/** Leg 2, the install: refused, and sentence C (T23 to T25). */
async function installRefused(check, rig, leg) {
  const { product, w } = { product: rig.product, w: leg.w };
  const [asked, warned, failed] = [w.asked.length, w.warnings.length, w.errors.length];
  const click = await finishes(product.world.click(w, 'installRemoteCli'), 30_000);
  check('leg 2: Install creds on host ended within 30 s, and asked no question', click.ended && w.asked.length === asked, click.error ?? JSON.stringify(since(w.asked, asked)));
  const probe = runOf(leg, product.probeCommand());
  check('leg 2: the install\'s probe was refused: exit 255 and "Host key verification failed."', probe?.outcome?.exitCode === 255 && probe.outcome.stderr.includes(VERIFY_FAILED), JSON.stringify(probe));
  const shown = [...since(w.warnings, warned), ...since(w.errors, failed)];
  const sentence = product.sentenceC(product.world.ROW.node.name); // E1.S3's function: write its real name here (§2)
  const withC = shown.filter((text) => text.includes(sentence));
  check('leg 2: the install showed sentence C once, and never "did not answer the probe"', withC.length === 1 && !shown.some((text) => text.includes('did not answer the probe')), JSON.stringify(shown));
}

/** Leg 2, the bridge and its check: refused, and the check's message (T26 to T30). */
async function bridgeRefused(check, rig, leg) {
  const { product, w } = { product: rig.product, w: leg.w };
  const failed = w.errors.length;
  const click = await finishes(product.world.click(w, 'openRemoteBridge'), 30_000);
  check('leg 2: Open Remote Bridge… ended within 30 s', click.ended, click.error);
  // The click returns when the bridge's `ssh` is spawned; its shim writes the record a moment later: a bounded wait (5 s) for it.
  const recorded = () => startsOf(rig, leg).find((one) => one.whole && one.argv.includes('-N'));
  await within(5_000, () => recorded() !== undefined);
  const remote = remoteOf(recorded()?.argv ?? []);
  if (remote !== undefined) {
    rig.scope.after(() => removeSocket(remote)); // a control run (MC1) makes one
  }
  const ended = await within(15_000, () => w.ended.includes(product.world.KEY) && !w.bridges.isOpen(product.world.KEY));
  check('leg 2: the bridge\'s ssh ended by itself within 15 s: no bridge is open', ended, JSON.stringify({ ended: w.ended, open: w.bridges.isOpen(product.world.KEY) }));
  const mode = () => runOf(leg, product.modeCheckCommand({ path: remote ?? '' }));
  const ran = await within(40_000, () => mode() !== undefined);
  const refused = (run) => run?.outcome?.exitCode === 255 && run.outcome.stderr.includes(VERIFY_FAILED);
  const sweep = runOf(leg, product.sweepCommand(me));
  check('leg 2: the socket check ran within 40 s: the sweep and the mode check, each exit 255 and "Host key verification failed."', ran && refused(sweep) && refused(mode()), JSON.stringify({ sweep, mode: mode() }));
  const expected = `The bridge to "${product.world.ROW.node.name}" is not open: ${product.sentenceC(product.world.ROW.node.name)}`; // or E1.S3's function for the whole form (§2)
  const errors = since(w.errors, failed);
  check('leg 2: the bridge\'s check showed its message: exactly one error, "The bridge to \\"box\\" is not open: " and sentence C', errors.length === 1 && errors[0] === expected, JSON.stringify(errors));
  check('leg 2: no forwarded socket was made at the path the bridge named', remote !== undefined && !fs.existsSync(remote), String(remote));
}

/** Leg 2: K2 answers at K1's port, the entry is still pinned to K1. */
async function legTwo(check, rig, port) {
  const server = await startServingSshd(rig, 'k2', rig.k2, port);
  check(`K2 listens at K1's address after K1 ended: 127.0.0.1:${port}`, server.failure === undefined, server.failure);
  if (server.failure !== undefined) {
    await endChild(server.sshd);
    return;
  }
  const leg = openLeg(rig, port);
  endLegWithScope(rig, leg, server);
  let taken = { list: [], error: undefined };
  try {
    await installRefused(check, rig, leg);
    await bridgeRefused(check, rig, leg);
    taken = await descendantsOfListener(server);
    await startsHoldThePin(check, rig, leg, 'leg 2');
    await nothingLeft(check, rig, leg, 'leg 2');
    const log = server.sshd.stderr;
    const reached = occurrences(log, `Connection from 127\\.0\\.0\\.1 port \\d+ on 127\\.0\\.0\\.1 port ${port}`);
    check('leg 2: K2 was reached: its log holds a connection from 127.0.0.1 per start (at least 4)', reached >= 4, `${reached} connections\n${log.trim().split('\n').slice(-20).join('\n')}`);
    check('leg 2: K2 logged no accepted login and no authentication attempt', !AUTH_ATTEMPT.test(log), log.trim().split('\n').filter((line) => AUTH_ATTEMPT.test(line)).join('\n'));
  } finally {
    leg.w.bridges.dispose();
    const { list, error } = await endServer(server, startsOf(rig, leg), taken);
    check('K2 and every process it forked are gone', server.sshd.exited && error === undefined && !list.some(alive), error ?? JSON.stringify(list.filter(alive)));
  }
}
```

### 4.11 The rig and the section

```js
/** The keys: two host keys and the login key, made by the PATH's `ssh-keygen`; the login key is the one authorized key. */
async function makeKeys(check, rig) {
  const keygen = (file) => tool('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', file]);
  const failed = (await keygen(rig.k1)) ?? (await keygen(rig.k2)) ?? (await keygen(rig.userKey));
  check('the throwaway keys were generated: K1, K2 and the user key', failed === undefined, failed);
  if (failed === undefined) {
    fs.writeFileSync(rig.authorizedKeys, fs.readFileSync(`${rig.userKey}.pub`, 'utf8'));
  }
  return failed === undefined;
}

/** The SHA-256 of the person's `~/.ssh/known_hosts`, or `absent`. Read only. */
function knownHostsDigest() {
  const file = path.join(os.homedir(), '.ssh', 'known_hosts');
  return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : 'absent';
}

/** The rig in the section's owned folder. Its environment: ours without the person's agent, the shim first on PATH, the temp vars on the folder. */
function rigOf(section, dir, out) {
  const { SSH_AUTH_SOCK: _own, ...ours } = process.env;
  const shimDir = path.join(dir, 'shim');
  const env = harnessScope.tempEnv(dir, { ...ours, PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}` });
  const rig = {
    dir, scope: section, out, env, shimDir, product: productOf(out),
    records: path.join(dir, 'records'), storage: path.join(dir, 'storage'), clientConfig: path.join(dir, 'client_config'),
    k1: path.join(dir, 'k1_key'), k2: path.join(dir, 'k2_key'), userKey: path.join(dir, 'user_key'), authorizedKeys: path.join(dir, 'authorized_keys'),
  };
  [shimDir, rig.records, rig.storage].forEach((folder) => fs.mkdirSync(folder));
  return rig;
}

async function pinnedLegs(check, rig) {
  if (!(await makeKeys(check, rig))) {
    return;
  }
  writeClientConfig(rig);
  check('the shim resolved the real ssh outside its own folder', installShim(rig) !== undefined, process.env.PATH);
  const pinned = { ...rig, pin: rig.product.formatHostKey(rig.product.parseHostKey(fs.readFileSync(`${rig.k1}.pub`, 'utf8')) ?? { algorithm: '', base64: '' }) };
  const port = await legOne(check, pinned);
  if (port !== undefined) {
    await legTwo(check, pinned, port);
  }
}

async function livePinnedRoads(check, out) {
  if (process.platform !== 'linux') {
    console.log('skip  live pinned-roads legs — Linux only (the end of a server reads /proc)');
    return;
  }
  if (!fs.existsSync(SSHD)) {
    if (process.env.CI === 'true') {
      check('the live pinned-roads legs ran', false, `${SSHD} is missing — a skipped live check on the runner proves nothing`);
    } else {
      console.log('skip  live pinned-roads legs — sshd not installed');
    }
    return;
  }
  // Its own scope, registered in the module scope at once, closed in the `finally`; the folder is made under the short socket root, as G2's.
  const section = harnessScope.sectionScope();
  const dir = ownedDir(section, 'pin', { parent: shortSocketRoot() });
  const before = knownHostsDigest();
  try {
    await pinnedLegs(check, rigOf(section, dir, out));
  } finally {
    check('the person\'s ~/.ssh/known_hosts is unchanged: the same bytes, or absent before and after', knownHostsDigest() === before);
    await section.close(); // the folder goes last: the children hold files in it, and the section ended them first
  }
}

module.exports = { livePinnedRoads };
```

**About T4's fixture.** If `parseHostKey` answers `undefined`, `pin` becomes ` ` (a key of nothing): T4 is then red and the legs run on
an absent pin, so every pin check is red too. That is the intended loud failure; do not make the legs skip.

**Bounds, all named:** a click 30 s (the probe's own limit is 20 s, `agentCommands.ts:282`); the socket check 40 s (the sweep's 15 s, the
1.5 s pause and the mode check's 15 s, `:185`, `:216`, `:217`); a bridge that ends by itself 15 s (`ConnectTimeout=10` of the argv); a
close 5 s; the pin files 5 s; a listener 10 s to listen; a server's end 3 + 2 + 2 s plus `endChild`'s at most 10 s; `ps` 5 s; `ssh-keygen`
15 s. A run of the section on the loopback takes about 4 s (measured: three runs, 3.9 s each).

### 4.12 What grows (`planning-docs.md`)

| What | How much | Who retires it | When the run is killed |
|---|---|---|---|
| the owned folder `testsToDelete-u<uid>-creds-pin-<id>` | three key pairs, two `sshd_config`, the client config, the shim, eight records, the storage folder (pin files deleted by the product): a few kB on disk; the two `sshd` logs live in this process's memory (about 30 lines per connection at `VERBOSE`) | the section's scope, in its `finally`, pass or fail; on SIGTERM, SIGHUP, SIGINT or an uncaught error the scope too (§4.4's `endLegWithScope`) | on SIGKILL: the janitor of the `creds` token, by the owner record beside the folder |
| the two listeners and what they forked | at most one listener at a time, plus four connections of a leg | `endServer` per leg, then `launch`'s `endChild` at the scope's close; a signal or an uncaught error in the middle of a leg: the same through the scope (`endLegWithScope`, one callback: the listener's descendants listed first, then the bridges' `dispose`, then `endServer`) | SIGTERM, SIGHUP, SIGINT: they are ended (measured: SIGTERM once the socket appeared in leg 1, every pid the run had started gone afterwards). SIGKILL: they stay (the stories document, *Not measured*); the runner's next start does not see them |
| one forwarded socket per leg that opened a bridge: `/tmp/creds-<user>-<id>.sock` (F11) | one inert socket of 0 bytes per run (two under MC1) | `removeSocket` by its exact path, registered with the scope the moment the path is known | removed on SIGTERM, SIGHUP, SIGINT. On SIGKILL it stays. The product's own sweep removes it: the next run's leg 1 runs that sweep against this machine and removes this user's sockets nothing listens on |

## 5. `scripts/ssh-agent-itest.cjs`: the call

1. **The header.** After the paragraph of section 9 (`:38-40`), before `const crypto = require('crypto');`, five lines:

   ```js
   //
   // Section 10 (Linux only, `itestPinnedRoads.cjs`) is G1's smoke on real input: *Install creds on host* and *Open Remote Bridge…*, run as the
   // extension registers them, with the real `ssh` against one `sshd -D -e` that serves every connection. Pinned to that server's key, every
   // start carries the pin words and logs in; when another key answers at the same address, every start is refused, the server logs no login,
   // and the person is told so.
   ```

2. **The require.** After `const { liveNoSharing } = require('./itestNoSharing.cjs');` (`:48`):

   ```js
   const { livePinnedRoads } = require('./itestPinnedRoads.cjs');
   ```

3. **The call.** After `await liveNoSharing(check, OUT);` (`:226`), inside the same `withVscodeStub` block:

   ```js
       // ---- 10. a pinned entry's roads connect only to its saved host key (G1, E1.S4) ---------------------------------------------------
       await livePinnedRoads(check, OUT);
   ```

764 + 5 + 1 + 2 = **772 lines**, under 800. Inside `withVscodeStub` is right: the world's `loadWithVscode` puts its own stub in front
(`Module._load` is asked before `Module._resolveFilename`), and section 10 is the last section, so the cache eviction of `world()`
(F7) touches nothing that runs after it except the `sshProgram.js` check, which loads its module fresh.

**CI.** No workflow change. The step *Install sshd for the live OpenSSH login* and *Integration test (SSH agent against a real ssh-add)*
(`ci-extension.yml:162-168`) already install `sshd` when it is missing and run `npm run itest:ssh-agent` under `CI=true`, where a missing
`sshd` fails the section. `npm run itest:all` runs the same script.

## 6. The control MC1 (by hand, in the scratch copy, recorded in the commit body)

**What it proves:** leg 2 fails when the pin words are not sent, so the smoke can fail (the stories document, *A control, so that the
smoke can fail*).

**How.** In the scratch COPY only (§8.2), never in the worktree: in `src/hostKeyPin.ts` of the copy, make `hostKeyWords` answer
`['-o', 'StrictHostKeyChecking=accept-new']` for every input (its first line becomes `return ['-o', 'StrictHostKeyChecking=accept-new'];`).
Compile the copy, run section 10 alone, keep the output. Then copy the worktree's `src/hostKeyPin.ts` over the copy's again and confirm
with `cmp` that they are equal.

**Expected:** at least T15 and T32 (no pin words), T24 (the probe exits 0), T25, T27 (the bridge stays open until the dispose), T28,
T29, T30 (a socket is made) and T38 (K2 logs `Accepted publickey`) are FAIL; T16, T17, T33 and T34 are FAIL with them (no file is named);
T23 is FAIL (the install reaches its question). T40 stays ok: the client config names `/dev/null` (§4.6). Record the FAIL lines as the
runner printed them, and their count. If T38 is not among them, the smoke cannot fail where it matters: stop and tell the lead.

## 7. The document: `research/module_tests.md`

1. **The G1 section** (`## The three roads of the person and the saved host key (G1)`, which E1.S2 opens and E1.S3 completes). Its
   run-command paragraph gets: "the smoke with `npm run itest:ssh-agent` (section 10)". Its table gets one row, last:

   ```text
   | `scripts/itestPinnedRoads.cjs` (section 10 of `ssh-agent-itest.cjs`) | 40 checks, two legs | Linux only; where `CI=true` a missing `sshd` fails. The registered commands *Install creds on host* and *Open Remote Bridge…* (its socket check is the third road), driven through the compiled world `personRoadsWorld.ts` with the real runner, the real bridge spawner, the real pin writer and the real deletes; the stand-ins are `vscode` and the resolve, which hands a key named by its path. The real `ssh` runs through a shim first on `PATH` that records each start (pid, start time, argv) and hands it a client config with no known-hosts file; ONE `sshd -D -e` per leg serves every connection (`PerSourcePenalties no` where the `sshd` knows it; `LogLevel VERBOSE`). **Leg 1**, pinned to K1, K1 answers: the install reaches its question, the socket check reads mode 600, K1 logs 4 accepted logins for 4 starts, each start says `StrictHostKeyChecking=yes` and one pin file as both known-hosts files (3 distinct files: the install's, the bridge's, the check's), *Close* ends the bridge, no pin file and no client is left. **Leg 2**, K2 at K1's port: the four starts end with `Host key verification failed.`, K2 logs a connection per start and no login, the install shows sentence C, the bridge ends by itself and its check shows one error with sentence C, no socket is made. Each server is ended by the bounded recipe of E1's stories document (descendants by pid and start time) |
   ```

   After the table's existing *Seen when it was built* text, a paragraph of the run (fill from the runner, never from this document):

   ```text
   **The smoke, seen when it was built (<date>).** <client and server versions>, an `sshd` unpacked from the distribution's package and run by the user (this PC has none at `/usr/sbin/sshd`), loopback, Node <v>, Linux (WSL2). Section 10 alone, three runs in a row: <n> ok each, about <s> s; the whole script <n> ok lines. *The control* (`hostKeyWords` answering `accept-new`, in a scratch copy): <k> FAIL, among them T38 (K2 logged <a> accepted logins). The first run on the runner's own `sshd` (9.6 on `ubuntu-latest`, read) is the CI run of the head sha.
   ```

   And in the section's **What none of them proves**, these sentences: "The smoke runs one user on the loopback of one Linux machine, with
   a key named by its path: not the real resolve, a password entry, a stored key, the install's second run (E2's M1), the system-wide
   known-hosts file of P1 (E2's M2), a live master (M3), or Windows and macOS. A run ended by SIGTERM, SIGHUP, SIGINT or an uncaught
   error in the middle of a leg ends its bridge `ssh`, its listener and what it forked, and removes the forwarded socket, through the section's
   scope; a run killed with SIGKILL still leaves its listener, what it forked, the bridge's `ssh` and one forwarded socket in `/tmp` (the
   product names it there)."

2. **The folders table, the row of `scripts/ssh-agent-itest.cjs`** (`:274`), at its end, one sentence:

   ```text
   Since G1, section 10 (`itestPinnedRoads.cjs`, Linux only) has an owned `pin` folder of its own under the short socket root, closed by its own scope in a `finally`; the forwarded socket of its bridge is where the product names it, `/tmp/creds-<user>-<id>.sock`, and is removed by its exact path (see *The three roads of the person and the saved host key (G1)*)
   ```

3. **The world's row** in the G1 section (`personRoadsWorld.ts`, not a suite): add "`user` and `port` (E1.S4)".

## 8. Order of work, and the commit

### 8.1 The steps

1. Read the built E1.S1 to E1.S3: the names of §2. Read `scripts/itestSshd.cjs`, `scripts/itestNoSharing.cjs` and the world as they
   stand. Stop on any difference from §2 and F5 to F7.
2. Write §3.1, §3.2, §3.3, §4 and §5 in the worktree. `node $LP npm run compile` (exit 0), `node $LP npm run typecheck`, `node $LP npm run lint`.
3. The local run (§8.2): section 10 alone, three times in a row; every check ok, and §8.2's leftovers look empty after each. Then the
   whole script once in the copy. The first run measures what this spec could not: F10's fallback is not exercised here (10.2 knows
   the word), so it must stay unexercised and be named so; T37's `Connection from` lines appear at `VERBOSE` (if they do not, stop and
   tell the lead: T37 is the leg's positive).
4. The control MC1 (§6) in the copy; record it.
5. `npm test` in the worktree: green, with the suites that load the world unchanged (§3.3).
6. The leftovers guard (Commands, 5) and `out/test/harnessSites.test.js`: clean and green.
7. §7, with the numbers of steps 3 and 4.
8. One commit, by path (§8.3). Do not push.

### 8.2 A run on a machine with no `sshd` (this PC)

The recipe is G2's, `todo/PLAN_bridge_no_connection_sharing_S2_spec.md` §2, with `g1-` in place of `g2-` in every folder name and these
differences. Nothing of it is committed, and no scratch path enters a committed file.

- **2.3 of that recipe, a third edit in the COPY:** in the copy's `scripts/itestPinnedRoads.cjs`, in `servingConfig`, after
  `'KbdInteractiveAuthentication no',`, the same two lines (`SshdSessionPath …/sshd-session`, `SshdAuthPath …/sshd-auth`). The copy's
  `scripts/itestSshd.cjs` gets G2's two edits as before (sections 5, 7 and 9 need them in the whole-script run).
- **Section 10 alone:** `$SP/g1-run/run10.cjs`, the same 16 lines as G2's `run9.cjs` with `itestPinnedRoads.cjs` and `livePinnedRoads` in
  place of `itestNoSharing.cjs` and `liveNoSharing`. Section 10 needs the `vscode` stub of the world only, so it runs alone.
- **Uncommitted files:** E1.S1 to E1.S4 may not be committed yet when you run; copy each changed file into the copy with `cp`, as 2.2 of
  that recipe says, and compile the copy.
- **After every run:**

  ```bash
  ls /tmp | grep -E "creds-pin|^creds-$(id -un)-"                              # expected: nothing (the owned folder, a forwarded socket)
  ps -u "$(id -u)" -o pid,args | grep -E 'sshd|ssh -F' | grep -v grep          # expected: nothing of this rig
  ```

  If the short socket root of `scripts/lib/leftovers.cjs` is not under `/tmp` on this machine, look for the owned folder there instead.

  A process that is left is ended by its pid; a socket `creds-<user>-<id>.sock` that a run left is removed by its exact name.

### 8.3 The commit

Files, by path: `src_vs_code/scripts/itestPinnedRoads.cjs`, `src_vs_code/scripts/ssh-agent-itest.cjs`, `src_vs_code/scripts/itestSshd.cjs`,
`src_vs_code/scripts/itestNoSharing.cjs`, `src_vs_code/src/test/personRoadsWorld.ts`, `research/module_tests.md`. The world is a file that
E1.S2's and E1.S3's work also touches: stage only the hunks of §3.3 if anything else of it is uncommitted (`git-workflow.md`, rule 4).

```text
test(itest): G1 E1.S4 — section 10, the smoke on real input: a pinned entry's install and bridge against a real sshd

<the observed numbers: section 10 alone, three runs, n ok each; the whole script; the versions>
<the control MC1: its FAIL lines, as printed>
<the line count of ssh-agent-itest.cjs>
<what was not exercised: F10's fallback; the runner's sshd>

<the attribution trailer that the lead's brief names>
```

## 9. Done when (each item can be counted)

1. Section 10 alone passed three runs in a row locally, 40 ok each (the unpacked `sshd`), and the whole `ssh-agent-itest.cjs` passed once.
2. The control MC1 printed FAIL for T38 and the others of §6; recorded in the commit body.
3. In CI, the head sha's step *Integration test (SSH agent against a real ssh-add)* printed the 40 checks ok (the first run on the
   runner's `sshd`; the lead reads it).
4. `scripts/ssh-agent-itest.cjs` is 772 lines; `scripts/itestSshd.cjs` and `scripts/itestNoSharing.cjs` differ by their exports line only.
5. `npm test`, typecheck and lint are green; no suite that loads the world changed.
6. The leftovers guard is clean, and `test/harnessSites.test.ts` is green.
7. After each local run, §8.2's look shows no folder, process or socket of the rig.
8. `research/module_tests.md` carries §7 with the runner's numbers.

## 10. Break it — ways to make the smoke pass while the defect stays, and the row that stops each one

| # | The way | What stops it |
|---|---|---|
| Z1 | Keep the world's runner stand-in (no real `ssh`) | T14 and T31: the shim records 0 starts |
| Z2 | The product spawns an `ssh` that is not the PATH's (an absolute program), so the shim sees nothing | T14 and T31 again: a count of 4 is asserted, not "every recorded start" |
| Z3 | Leg 2 against K1, or K2 on another port | T24 (the probe exits 0) and T37 (K2's log has no connection) |
| Z4 | Assert only the argv, not the server | T20, T37 and T38 read the server's log |
| Z5 | Type sentence C or the question into the script | §2: both are read back from the product; review item 4 |
| Z6 | Let the cleanup end the clients before they are checked | T19 and T36 run before `endServer`; review item 6 |
| Z7 | Delete the pin files from the script | the script never writes or deletes in the keys folder; review item 7 |
| Z8 | A client config that trusts K1 itself (`StrictHostKeyChecking yes`, a file with K1) | the config holds the two `/dev/null` lines only; MC1 shows leg 2 red without the pin words |
| Z9 | A skip under `CI=true` when `sshd` is missing | the failed check `the live pinned-roads legs ran` |
| Z10 | A leg 2 that reached no server passes T38 by an empty log | T37, the positive |
| Z11 | `endServer` signals a reused pid | every signal goes only to a pid whose start time is the recorded one (`alive`) |

## 11. Opus review checklist

1. `scripts/itestSshd.cjs` and `scripts/itestNoSharing.cjs`: `git diff` shows the exports line and nothing else. `startSshd` is byte for
   byte as on `main`.
2. `src/test/personRoadsWorld.ts`: the diff is §3.3. A test that gives no `user`, `port` or `hostKey` gets the snapshot of before.
3. The new script spells no temp-path API and no temp variable; its children's environment comes from `harnessScope.tempEnv`; its one
   folder is `ownedDir(section, 'pin', …)`; `section.close()` runs in a `finally`.
4. No value the code computes is typed: the pin (`formatHostKey(parseHostKey(…))`), the keys folder (`materializedKeysDir`), the three
   remote commands, the question (`confirmationFor`), sentence C and the bridge's form (E1.S3's export, §2), the mode (`interpretSocketProbe`,
   `isOwnerOnlyMode`).
5. The shim: resolved once at install by real path outside its folder; it `exec`s, so the recorded pid is the client's; `set -C`; the
   client config is the two `/dev/null` lines only.
6. In each leg, T13/T18/T19 (leg 1) and T35/T36 (leg 2) are checked before `endServer`; `endServer` runs in the leg's `finally`, and the
   descendants are listed before the close (leg 1) and before the end (leg 2).
7. The script never writes, renames or deletes a file in `storage/keys/<pid>/`; only the product does.
8. `removeSocket` is registered with the scope as soon as a bridge's path is known, removes only a socket of this uid, by its exact path.
9. Every wait has a bound (§4.11), and none is a bare `sleep` except the 300 ms before K2's second try.
10. The checks print the names of §1, in its order; their count is 40 on a passing run.
11. The commit body has the three runs, the whole-script run, MC1's FAIL lines, the line count and what was not exercised.

## 12. Not verified by this spec

- **The code itself.** Written, not run (Binding constraints). F1 to F4 were measured by the stories document's probe with a script of
  that session; the first run of THIS script is step 3 of §8.1.
- **The runner's `sshd`.** Measured by the reviewer (2026-11-18): the OpenSSH 9.6p1 client and `sshd`, section 10 40/40 in three runs, the
  fallback without `PerSourcePenalties` (§4.3) exercised, T37's `Connection from …` lines present. The run of the head sha on the runner is CI's.
- **A run killed with SIGKILL.** No cleanup runs: the listener, what it forked, the bridge's `ssh`, the clients and the forwarded socket stay
  (§4.12). SIGTERM, SIGHUP, SIGINT and an uncaught error are handled: the scope ends the leg's processes (`endLegWithScope`, §4.4).
- **macOS and Windows.** The section skips there. On Windows the roads are read, not run (the parent's C6).
- **What the smoke leaves to E2:** the install's second run (M1), the system-wide known-hosts file (M2: leg 2 here has no file that lists
  K2 for the host, so it does not show that `GlobalKnownHostsFile` matters), a live master (M3), an unusable pin and a failed write (M4),
  a host that is down and a refused login (M5), overlapping calls and a password entry (M6), a path with a space (M7), `KnownHostsCommand`
  (M8), the repair of sentence A (M9).
- **The real resolve.** The world hands a key the run named by its path; a stored key written for the call is N16's and E2's.
- **The sweep against this machine's `/tmp`.** Leg 1's sweep removes this user's `creds-<user>-*.sock` there that nothing listens on (F11).
  Read, not run here: only a bridge TO this machine makes such a file.

## Notes for the lead

1. **PR #365 is open (2026-11-17), so the multi-connection mode is a starter of this section** (`startServingSshd`, §4.3), built from
   `launch`, `endChild`, `freePort` and `listeningFailure`. No line of `startSshd` is edited; the exports line of `itestSshd.cjs` gains
   two names (#365 does not touch it). When #365 has merged, the mode can be folded into its `options` (the stories document says so);
   that is a later change, not this story's.
2. **The CI runner's `sshd` is 9.6, which does not know `PerSourcePenalties`** (F10, read). The starter starts once more without the line
   when the `sshd` refuses it, and prints an `info` line. The stories document's recipe names the line as required; on 9.6 there are no
   penalties to turn off. Measured by the reviewer (2026-11-18) on 9.6p1: the fallback was exercised.
3. **The forwarded socket is NOT in the owned folder** (F11). The stories document gives the short socket root as the reason for the
   folder's place ("the forwarded socket's path has a length limit"); the product names the socket `/tmp/creds-<user>-<id>.sock`, and on
   this rig the remote host is this machine, so it lands in this machine's `/tmp`. This spec keeps the short root (as G2's) and removes
   the socket by its exact path; a run killed with SIGKILL leaves one inert socket that the next run's sweep removes (SIGTERM and SIGHUP are handled through the scope). A correction of a fact in the
   stories document, for the lead to write; and a question for the lead whether the sweep's reach into this machine's `/tmp` (only this
   user's sockets of the product's own name that nothing listens on) is accepted for a local run.
4. **`LogLevel VERBOSE`** in the server config, where the stories document says "`LogLevel` stays the default": it gives T37, the
   positive of leg 2 (K2 was reached), from the server's side. Without it leg 2 rests on the client's stderr alone. If the lead keeps
   the default, T37 goes and the count is 39.
5. **Two servers per run, one after the other** (K1, then K2 at its port); the parent's §3.7, last row, says one `sshd` process per run.
   A fact for the parent's table, not a change of its bound.
6. **E1.S3's names are not known yet.** §2 says what the script reads and that a missing export of sentence C is a stop. The leg-2 checks
   T25 and T29 are written against the parent's §3.5; if E1.S3 shows the install's sentence C through another window function than a
   warning or an error, T25's reading has to follow it (a fact, reported).
7. **The links to this spec** from the stories document (`## E1.S4`) and from the parent's E1 *Stories* line are the lead's to add.
8. **The forwarded socket lies outside the owned folder** (the product names it `/tmp/creds-<user>-<id>.sock`); accepted by the lead
   2026-11-18: the product's own sweep removes only this user's dead `creds` sockets there, and the run removes its own by its exact path.
