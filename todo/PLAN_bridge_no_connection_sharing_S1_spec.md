# PLAN — S1 spec: the tunnel of a bridge and every run say no connection sharing (SECURITY)

> Status: **spec, 2026-11-17, by Fable; nothing built yet.** Security spec, written before its code (the row *Security judgement*
> of `subagent-models.md`; not the cornerstone: S2 holds it). Story S1 of
> [PLAN_bridge_no_connection_sharing.md](PLAN_bridge_no_connection_sharing.md) (its §4.1 to §4.3, §7.1 to §7.3, the unit half of
> §7.5, `## Stories` S1, and the note on finding 1 in its `## Plan changes`). This file is promoted together with the parent.
>
> Scope: `src_vs_code` — `src/sshExecCommand.ts`, `src/sshBridge.ts`; tests: `src/test/sshExecCommand.test.ts`,
> `src/test/sshBridge.test.ts`, `src/test/bridgeLinks.test.ts`, new `src/test/noSharingArgv.ts`, new
> `src/test/noConnectionSharing.test.ts`; one line of `.github/workflows/ci-extension.yml`. No call site, no script (S2), no
> document (S3). Branch `fix/g2-no-connection-sharing`. Each `file:line` below was read on `30364080`; the product files there are
> those of `main` at `b84416aa`. Fable writes this spec, a Sonnet coder builds it, Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above. "The S2 spec"
is [PLAN_bridge_no_connection_sharing_S2_spec.md](PLAN_bridge_no_connection_sharing_S2_spec.md): it asks a real `sshd` what the
words of this story do. The names of this document: the facts K1 to K11, the RED tests R1 to R9, the guards G1 to G11, the
mutations M1 to M14, the break-its X1 to X9. "The two options" are `-o ControlPath=none` and `-o ControlMaster=no`, four words, in
that order. This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`).

## What S1 builds, in one paragraph

With `ControlMaster auto` and a `ControlPath` in a person's `~/.ssh/config`, an `ssh` that says nothing about connection sharing
hands its work to a master process. For the tunnel of a Remote Bridge that means: the process the extension started exits, a
master holds the forward, and *Close Remote Bridge* kills nothing. For a run (`ssh:exec`, *Run with Secrets*, the socket check,
*Install creds on host*) it means: the run rides a connection that was opened earlier and uses neither its own key nor its own
pinned host key. A bridged run already says the two options that stop this, among its six. S1 gives the two options a name of
their own, one exported constant `NO_CONNECTION_SHARING` in `sshExecCommand.ts`, and puts it into the two places where an argv is
built: every argv of `buildSshExecArgv`, and the fixed options of the tunnel. A bridged argv stays byte for byte what it is. No
call site changes, because no caller can leave the options out. The unit tests show what is SENT and where it stands. One new
test asks the real `ssh -G` what is IN EFFECT under a config that shares connections. What the options DO against a server is S2.

| File | Change | Where |
|---|---|---|
| `sshExecCommand.ts` | new `export const NO_CONNECTION_SHARING: readonly string[]`; `BRIDGED_SSH_OPTIONS` is built from it (the same six words); `buildSshExecArgv` pushes it for a run off a bridge. 174 → 194 lines | §1 |
| `sshBridge.ts` | the import; `FIXED_OPTIONS` ends with `...NO_CONNECTION_SHARING`; its docblock gains two paragraphs. 367 → 382 lines | §2 |
| `test/noSharingArgv.ts` (new) | what the tests ask of an argv: `TWO`, `pairAt`, `saysNoSharingBefore`, `withoutTheTwo`, `sharingWords`. 47 lines | §3 |
| `test/sshExecCommand.test.ts` | two imports; the tests at `:158` and `:172` change; five new tests. 226 → 332 lines | §4 |
| `test/sshBridge.test.ts` | one import; four new tests. 482 → 571 lines | §5 |
| `test/bridgeLinks.test.ts` | the off-bridge half of the test at `:222` changes; the comment of `OTHER_FIVE`. 495 → 494 lines | §6 |
| `test/noConnectionSharing.test.ts` (new) | eight tests: the real `ssh -G` (five), the list of places (three). 161 lines | §7 |
| `.github/workflows/ci-extension.yml` | the new test file joins the Windows step | §8 |

## Binding constraints

- **No plan change.** Build what the parent and this document say. If a step cannot be done as written, a code block here does not
  compile, or a test is not RED or GREEN as this document says: stop and tell the lead. Do not repair the parent or this document.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first. Read the exit of `tsc` before any test
  result. This is why the test of the constant (§4, R8) reads the export through the module object: the test files compile before
  the constant exists. Every test of §3 to §7 compiles on the unchanged product (K9 a).
- **Keep what the runner printed.** Save each RED text in the scratchpad folder of the session and quote it in the commit body.
- **Stage by path.** Read `git diff --staged --stat` before the commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history. Never a bare `git stash`. Never commit `.claude/settings.json`.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): a file has at most 800 lines, with blank lines and comments counted; a
  function has at most 50 code lines (120 in `src/test/`); complexity is at most 4, also in tests. No new `eslint-disable`.
  `buildSshExecArgv` keeps its one `eslint-disable-next-line complexity` (`sshExecCommand.ts:127`): the change replaces an `if` by
  a `?:`, so its complexity stays what it is.
- **The product change is §1 and §2 and nothing else.** No call site changes (the six roads of the parent's §1). No field is added
  to `SshExecOptions` or `BridgeOptions`. `sshOptions.ts`, `sshCommand.ts`, `sshBridgeManager.ts`, `bridgeSpawner.ts`,
  `sshExecAuth.ts`, `sshUseActions.ts`, `remoteLaunch.ts`, `commands/agentCommands.ts`, `commands/runCommands.ts` do not change.
- **A bridged argv does not change by one word.** `BRIDGED_SSH_OPTIONS` stays the same six options in the same order, in the same
  place of the argv. G9 pins two whole bridged argvs as literals.
- **`ClearAllForwardings` never reaches the tunnel**, and never a run off a bridge. Only the two options are shared (the parent's
  §4.1). G8 and G5 turn red if it does.
- **The two options are spelled in ONE product file**, `sshExecCommand.ts`, as `Name=value`. Every other product file says
  `NO_CONNECTION_SHARING`. A comment in another file may name an option (`ControlMaster`) or a config line (`ControlMaster auto`),
  and never the `Name=value` spelling: G11 reads comments too.
- **Tests leave nothing outside an owned temp folder.** One test writes a real file (the config of `ssh -G`): through `ownedFile`
  of `scripts/lib/leftovers.cjs`, with the test's own context as the scope, never through `os.tmpdir()` or `mkdtemp` (the guard
  `test/leftoversSites.test.ts` reads every test file).
- **Existing tests that change: the three of §4 and §6, and no other.** If another existing test turns red after §1 and §2, stop
  and tell the lead. Measured: none does (K9 d).
- **Node only.** No Python, also not for a helper script. Write files with the Edit or Write tool, not with a shell heredoc.

## Facts read on `30364080` that this spec uses

| # | Fact | Where |
|---|---|---|
| K1 | `BRIDGED_SSH_OPTIONS` (`:28-35`) is six `-o` pairs: `ForwardAgent=no`, `ControlPath=none`, `ControlMaster=no`, `ClearAllForwardings=yes`, `ForwardX11=no`, `Tunnel=no`. Its docblock (`:20-27`) says why. No other line of `src/` (tests left out) spells `ControlPath=` or `ControlMaster=` | `sshExecCommand.ts` |
| K2 | `buildSshExecArgv` (`:128-174`) builds: `-T` when asked (`:139`), the authentication option (`:140`), the host-key options and `ConnectTimeout=10` (`:145-150`), the composer's words and `ForwardAgent=no` of `ownAgentWords` (`:155`), the six options ONLY when `options.bridged === true` (`:154`, `:156-158`), `-i` (`:159-161`), `-p` (`:162-164`), `--` (`:169`), the destination and the command (`:171-172`). It has no parameter through which a caller can add an option word | `sshExecCommand.ts` |
| K3 | `FIXED_OPTIONS` (`:156-161`) is four `-o` pairs: `ServerAliveInterval=30`, `ServerAliveCountMax=3`, `ExitOnForwardFailure=yes`, `ConnectTimeout=10`. `buildBridgeArgv` (`:201-226`) returns: the authentication option (`:211`), `FIXED_OPTIONS` (`:212`), the host-key options (`:213`), `-N` (`:215`), `-R` and its value (`:216`), `options.extra` (`:217`), `-i` (`:218`), `-p` (`:219`), `--` and the destination (`:223-224`). So a word in `FIXED_OPTIONS` stands before every word a caller can add. The file imports `SshExecAuth` from `./sshExecCommand` (`:1`), and both modules import no `vscode` | `sshBridge.ts` |
| K4 | Production passes no `extra` to `buildBridgeArgv` (`commands/agentCommands.ts:437-441`). The field is in `BridgeOptions` (`sshBridge.ts:90-91`), so a later caller can | the call site |
| K5 | `ssh` takes the FIRST value it is given for a `-o` keyword, on the command line too, and a command-line value wins over the file. `ssh -G` under a `-F` file resolves and connects to nothing. With the two options it prints `controlmaster false` and NO `controlpath` line (the parent's §2, OpenSSH 10.2p1) | the parent |
| K6 | The tests that assert a run off a bridge OMITS the two options: `test/sshExecCommand.test.ts:158-164` and `:172-178`; `test/bridgeLinks.test.ts:222-246`, the loop at `:229-231`. `SIX` (`sshExecCommand.test.ts:126`), `sixAt` (`:129`), `everything` (`:131-137`) and `argvWith` (`:119-123`) are the fixtures of that file. `test/bridgeLinks.test.ts` drives the real action through a world (`both`, `lw.runs[n].argv`) | the tests |
| K7 | How a scan of the shipped source is written here: `discoverSources(root, excluded)` lists every `.ts` under a folder, as `/` paths, sorted (`test/tempSiteScan.ts:62-76`); `importedUses(file, text, name, module)` finds every reference to a binding imported from a module, with the function it stands in as `within` (`test/funnelScan.ts:160-162`, `:277-288`). A list that is compared whole is red when a site is added and when one goes (`test/launchRoadScan.test.ts`) | the tests |
| K8 | A temp file of a test: `ownedFile(scope, what, name)` makes an owned folder and returns a path in it; a `node:test` context is a scope (`scripts/lib/leftovers.cjs:54-59`, `scripts/lib/leftovers.d.cts:7-9`). A tool that may be missing: a test is skipped with a reason locally (`test/commandNameShell.test.ts:49`) | the helpers |
| K9 | **Measured 2026-11-17** on two copies of the repository at `30364080` in a scratch folder (`git archive`, the shared rules and `node_modules` linked in; the copies were edited and compiled, not the repository; not kept). OpenSSH 10.2p1 client, Node 26.12.1, Linux. (a) The tests of §3 to §7 compile on the unchanged product (`tsc` exit 0). (b) On the unchanged product the four test files have 106 tests: 9 fail with the texts of §9, 96 pass, 1 is skipped (the CI test). (c) With §1 and §2: 105 pass, 1 is skipped; `eslint` is clean on the seven files; the line counts are those of the table above. (d) The whole suite at that state (`node --test` over `out/test/*.test.js`): 7939 tests, 7900 pass, 38 skipped, 1 fails, and that one is a fault of the copy: `leftoversRunnerSweep` asks `git worktree list` of a folder that is no git checkout. No other existing test is red. (e) M1 to M14 turn red what §11 says. (f) The leftovers guard (`leftovers-check.mjs --profile node --token creds`) is clean over the copy with the new files. (g) `ssh-agent-itest.cjs` at that state, against a user-run `sshd` 10.2p1: every check of sections 1 to 8 passes (77 `ok` lines), so section 8's four legs are unchanged | a scratch copy |
| K10 | **Measured 2026-11-17, Windows:** `ssh.exe -G` of OpenSSH_for_Windows_9.5p2 (the owner's PC, started from WSL, the `-F` file on a `\\wsl.localhost` path) resolves the same way: the sharing config alone prints `controlmaster auto` and `controlpath /nonexistent/creds-test/cm.sock`; with the two options it prints `controlmaster false` and no `controlpath` line; with the caller's `-o ControlMaster=auto -o ControlPath=/x` AFTER the two options it still prints `controlmaster false` and no `controlpath` line; the tunnel keeps `remoteforward /tmp/creds-dev-abc.sock [127.0.0.1]:51234`. This was the client alone, by hand. The test file of §7 was NOT run under a Windows Node | by hand |
| K11 | PR #365 (open) changes `sshExecCommand.ts`, `test/sshExecCommand.test.ts`, `test/bridgeLinks.test.ts` and `ci-extension.yml` too (the parent's §4.6). Its bridged argv still starts with the six options. Whoever merges second merges `main` and runs both suites again | the parent |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.** A test result after a failed `tsc` is the result of old files.
2. The four files: `node $LP node --test --test-concurrency=4 out/test/sshExecCommand.test.js out/test/sshBridge.test.js out/test/bridgeLinks.test.js out/test/noConnectionSharing.test.js`
3. `node $LP npm run typecheck`
4. `node $LP npm run lint`
5. `npm test` — the full suite (it compiles first and lowers itself).

## 1. The product: `sshExecCommand.ts`

**1.1** The docblock and the constant at `:20-35` become the text below (two constants). The six options of `BRIDGED_SSH_OPTIONS`
keep their order: the second and the third come from the new constant.

```ts
/**
 * The two options that ask `ssh` to share no connection, whatever `~/.ssh/config` says: to join no master and to become none.
 * EVERY argv the extension starts an `ssh` with carries them, in this order: each run of {@link buildSshExecArgv}, and the tunnel
 * of a Remote Bridge (`sshBridge.ts`). They are spelled here and in no other file (`noConnectionSharing.test.ts`).
 *
 * <p>Why. With `ControlMaster auto` and a `ControlPath` in the person's config, an `ssh` that says nothing about sharing hands
 * its work to a master, which is another process. Measured 2026-11-17 with the tunnel's argv (OpenSSH 10.2p1 on both ends,
 * loopback, one user, a config with `ControlMaster auto`, a `ControlPath` and `ControlPersist`): without the two options the
 * spawned `ssh` exits with 0 after about half a second and a detached master holds the `-R` forward, so the kill of a closed
 * bridge reaches nothing; and with a master already up, the call rides it, and neither its own `-i` key nor its own pinned
 * host key is used. With the two options the spawned `ssh` is the connection: the kill ends the forward, a wrong key answers
 * `Permission denied` and a wrong pin `Host key verification failed`.</p>
 *
 * <p>What is NOT covered: the nested `ssh` of a jump host. `-J` starts one per hop and hands it none of the outer's `-o`
 * options, so a hop can still join a master or become one. And the person's own terminal (`sshCommand.ts`) keeps sharing, on
 * purpose.</p>
 *
 * <p>The cost: each call logs in by itself. A credential that needs a person (a key file with a passphrase that no agent holds,
 * a typed second factor) no longer works on these calls through a master the person opened.</p>
 */
export const NO_CONNECTION_SHARING: readonly string[] = ['-o', 'ControlPath=none', '-o', 'ControlMaster=no'];

/**
 * The options of a bridged call, in this order. `ForwardAgent=no` alone is not enough: a multiplexed session inherits the
 * master's forwarded agent and authenticates nothing itself, so connection sharing is off: the two options of
 * {@link NO_CONNECTION_SHARING}, which every other run carries too. `ClearAllForwardings=yes` drops every port forwarding a
 * config file names; `ForwardX11=no` and `Tunnel=no` the two other channels a config can open. Checked with `ssh -G -F none`
 * on OpenSSH 10.2: controlmaster false, clearallforwardings yes, forwardx11 no, tunnel false, forwardagent no, and no
 * localforward/remoteforward line even with -L and -R on the command line.
 */
export const BRIDGED_SSH_OPTIONS: readonly string[] = [
  '-o', 'ForwardAgent=no',
  ...NO_CONNECTION_SHARING,
  '-o', 'ClearAllForwardings=yes',
  '-o', 'ForwardX11=no',
  '-o', 'Tunnel=no',
];
```

The first paragraph of the new docblock says what is ASKED. The second says what was MEASURED, with its conditions (the parent's
§2, runs A to E). Do not shorten the conditions and do not write the effect without them (`security.md`: *a measure you have not
observed working is a comment*). S2 adds one more paragraph here: what each option does alone, seen on a real `sshd`.

**1.2** In `buildSshExecArgv`, the three lines `:156-158`

```ts
  if (bridged) {
    argv.push(...BRIDGED_SSH_OPTIONS);
  }
```

become two:

```ts
  // Every run shares no connection (G2). A bridged call says the same two options among its six, in the same place.
  argv.push(...(bridged ? BRIDGED_SSH_OPTIONS : NO_CONNECTION_SHARING));
```

Nothing else of the function changes: the comment at `:151-153`, `const bridged` and the composer's push stay. So a run off a
bridge gains exactly four words, in the place where a bridged run has its six: after the composer's words and `ForwardAgent=no`
of `ownAgentWords`, before `-i`, `-p` and `--`.

## 2. The product: `sshBridge.ts`

**2.1** Line 1 becomes:

```ts
import { NO_CONNECTION_SHARING, SshExecAuth } from './sshExecCommand';
```

**2.2** The end of the docblock of `FIXED_OPTIONS` (`:151-155`) and the constant (`:156-161`) become the text below. The first four
lines are the old ones (`:151-154`); the heading, the two paragraphs under it and the fifth entry of the list are new.

```ts
 * <p>The stale-socket refusal cannot bite us for a different reason — {@link remoteSocketPath}
 * gives every bridge a fresh random path, so nothing of ours ever collides. What it does leave
 * is litter: one dead socket per dropped bridge, which nobody unlinks. Bounded and inert
 * (owner-only, in a sticky `/tmp`), but real.</p>
 *
 * <h3>No connection sharing (G2)</h3>
 *
 * <p>The last two options are {@link NO_CONNECTION_SHARING}: this `ssh` joins no master and becomes none. A bridge is closed by
 * killing the process that was spawned, so that process must BE the connection that holds the forward. With `ControlMaster auto`
 * and a `ControlPath` in the person's config it was not. Measured 2026-11-17 with this argv (OpenSSH 10.2p1 on both ends,
 * loopback, one user, `ControlPersist` on): the spawned `ssh` exited with 0 after about half a second, a detached master held
 * the forward, and the kill hit a pid that was gone; with the two options the process stays and the kill ends the forward. The
 * measurement and its conditions are beside the constant.</p>
 *
 * <p>They stand before `-N`, `-R` and every word of `extra`, because `ssh` takes the FIRST value it is given for a `-o` keyword:
 * the `-o` words in `extra` come too late to change them. The flag spellings do not: `-S` sets the control path and `-M` the master
 * mode at option-parsing time, where the LAST one wins and the `-o` values lose (measured with `ssh -G`), so `extra` must never carry
 * `-S`, `-M` or `-O` (production passes no `extra`). Only these two are shared with a bridged run. Its
 * `ClearAllForwardings=yes` must never come here: it clears the forwards of the command line too, and the tunnel would lose
 * its own `-R`.</p>
 */
const FIXED_OPTIONS: readonly string[] = [
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ConnectTimeout=10',
  ...NO_CONNECTION_SHARING,
];
```

The docblock does not spell the two options (the constraint above): it links the constant. `buildBridgeArgv` does not change.

## 3. The helper of the tests: new `test/noSharingArgv.ts`

One module, so that the three test files ask the same question of an argv. It is not named `*.test.ts`, so the runner does not
treat it as a suite. The whole file:

```ts
/**
 * What the tests of G2 ask of an `ssh` argv (`PLAN_bridge_no_connection_sharing.md` §7.2): where the two no-sharing options stand,
 * and which other words name connection sharing. Shared by `sshExecCommand.test.ts`, `sshBridge.test.ts` and
 * `noConnectionSharing.test.ts`, so the three ask the same question.
 *
 * <p>These say what is SENT. What the options do is asked of a real `ssh` (`noConnectionSharing.test.ts`, the client alone) and
 * of a real `ssh` against a real `sshd` (section 9 of `scripts/ssh-agent-itest.cjs`).</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

/** The two options, spelled out once more here on purpose: the constant of `sshExecCommand.ts` is pinned to this, not to itself. */
export const TWO: readonly string[] = ['-o', 'ControlPath=none', '-o', 'ControlMaster=no'];

/** Every index where the pair `-o <value>` stands. The value is compared whole, so `ControlMaster=auto` is no `ControlMaster=no`. */
export const pairAt = (argv: readonly string[], value: string): number[] => argv.flatMap((arg, i) => (arg === '-o' && argv[i + 1] === value ? [i] : []));

/** The first of `words` in the argv, or its length when none is there. */
const firstOf = (argv: readonly string[], words: readonly string[]): number =>
  Math.min(argv.length, ...words.map((word) => argv.indexOf(word)).filter((at) => at !== -1));

/** Each of the two pairs stands exactly once, side by side in the order of `TWO`, and both stand before every one of `before`. */
export function saysNoSharingBefore(argv: readonly string[], before: readonly string[]): boolean {
  const path = pairAt(argv, TWO[1]);
  const master = pairAt(argv, TWO[3]);
  return path.length === 1 && master.length === 1 && master[0] === path[0] + 2 && master[0] + 2 <= firstOf(argv, before);
}

/** The argv with every pair of `TWO` taken out: what the builder sent before G2. */
export function withoutTheTwo(argv: readonly string[]): string[] {
  const gone = new Set([...pairAt(argv, TWO[1]), ...pairAt(argv, TWO[3])].flatMap((at) => [at, at + 1]));
  return argv.filter((_, i) => !gone.has(i));
}

const NAMES_SHARING = /control(master|path|persist)/i;
/** `-S <path>`, `-M` and `-O <command>`, also with the value written into the same word. */
const SHARING_FLAG = /^-[SMO]/;

/**
 * The words before `--` that name connection sharing, in any letter case and in the one-word spelling (`-oControlPath=/x`), the two
 * pairs of `TWO` left out. `skip` holds the indexes of the words a CALLER passed (the `extra` of a bridge): those are the caller's.
 */
export function sharingWords(argv: readonly string[], skip: readonly number[] = []): string[] {
  const fixed = new Set([...pairAt(argv, TWO[1]), ...pairAt(argv, TWO[3])].map((at) => at + 1));
  const named = (word: string): boolean => NAMES_SHARING.test(word) || SHARING_FLAG.test(word);
  return argv.slice(0, firstOf(argv, ['--'])).filter((word, i) => !fixed.has(i) && !skip.includes(i) && named(word));
}
```

What each one is for. `pairAt` compares the VALUE whole, so a caller's `ControlMaster=auto` is never counted as the fixed
`ControlMaster=no` (the parent's §7.2 item 2). `saysNoSharingBefore` is the rule "each of the two exactly once, side by side,
before these words". `withoutTheTwo` builds the control of §7. `sharingWords` is the rule "no other word names sharing" (item 5):
it reads the words before `--` only (after `--` nothing is an option), it leaves the fixed two out, and `skip` takes out the
words a caller passed in `extra` by their POSITION.

## 4. `test/sshExecCommand.test.ts`

**4.1 The imports.** The import block at `:3-11` gains a namespace import before it and one line after it:

```ts
import * as execCommand from '../sshExecCommand';
import {
  BRIDGED_SSH_OPTIONS,
  MAX_REMOTE_COMMAND_CHARS,
  type SshExecOptions,
  buildSshExecArgv,
  validateRemoteCommand,
} from '../sshExecCommand';
import { EntityMetadata } from '../types';
import { KEY_FILE } from './fakePaths';
import { TWO, saysNoSharingBefore, sharingWords } from './noSharingArgv';
```

**4.2 The test at `:158-164` (R6)** becomes:

```ts
test('F1: off a bridge the same entry keeps -J -A -L … -R …, then says the two no-sharing options, and none of the other four', () => {
  const argv = argvWith(everything, { jump: 'hop@jump.example.com' });
  assert.deepEqual(argv.slice(argv.indexOf('-J'), argv.indexOf('--')), ['-J', 'hop@jump.example.com', '-A', '-L', '8080:db:5432', '-R', '9000:intranet.example:443', ...TWO]);
  for (const word of ['ForwardAgent=no', 'ClearAllForwardings=yes', 'ForwardX11=no', 'Tunnel=no']) {
    assert.ok(!argv.includes(word), `${word} is not sent off a bridge: ${argv.join(' ')}`);
  }
});
```

**4.3 In the test at `:172-178` (R7)** the name and the first assertion change; the rest stays:

```ts
test('F2: { bridged: false } and {} send the two no-sharing options and none of the other four, and an entry that forwards keeps its own -A', () => {
  for (const options of [{ jump: 'hop@jump.example.com', bridged: false }, {}]) {
    const argv = argvWith(entity({ agentForward: true }), options);
    assert.deepEqual(SIX.filter((arg) => arg !== '-o' && argv.includes(arg)), ['ControlPath=none', 'ControlMaster=no'], `of the six, the two and only they: ${argv.join(' ')}`);
    assert.ok(argv.includes('-A'), 'control: the entry\'s own flag still gives -A');
  }
});
```

**4.4 Appended at the end of the file** (R8, R9, G6, G7, G9):

```ts
/* ---------------------------------------------------------------------------------------------------------------
 * G2 (`PLAN_bridge_no_connection_sharing.md` §4.3, §7.2) — every run shares no connection. These say what is SENT; what the
 * two options do is asked of a real ssh (`noConnectionSharing.test.ts`) and of a real sshd (section 9 of the SSH agent itest).
 * ------------------------------------------------------------------------------------------------------------- */

/** What a caller can say, one list per thing. `entry` is a plain entry, and one with `-A` and two forwards. */
const AXES = {
  auth: ['key', 'askpass'],
  bridged: [undefined, false, true],
  noTty: [undefined, true],
  ownAgent: [undefined, false, true],
  jump: [undefined, 'hop@jump.example.com'],
  entry: [entity(), everything],
  pin: [undefined, '/keys/known_hosts'],
  key: [undefined, KEY_FILE],
  port: [undefined, 2222],
} as const;

const SIZES = Object.values(AXES).map((list) => list.length);

/** How many argvs the lists make: every combination. */
const COMBINATIONS = SIZES.reduce((count, size) => count * size, 1);

/** Digit `i` of `n`, read as a number with one digit per list. */
const digit = (n: number, i: number): number => Math.floor(n / SIZES.slice(0, i).reduce((count, size) => count * size, 1)) % SIZES[i];

interface Run {
  readonly label: string;
  readonly argv: string[];
}

/** The argv of combination `n`, and a label that names it. */
function runOf(n: number): Run {
  const c = {
    auth: AXES.auth[digit(n, 0)],
    bridged: AXES.bridged[digit(n, 1)],
    noTty: AXES.noTty[digit(n, 2)],
    ownAgent: AXES.ownAgent[digit(n, 3)],
    jump: AXES.jump[digit(n, 4)],
    entry: AXES.entry[digit(n, 5)],
    pin: AXES.pin[digit(n, 6)],
    key: AXES.key[digit(n, 7)],
    port: AXES.port[digit(n, 8)],
  };
  const options: SshExecOptions = { bridged: c.bridged, noTty: c.noTty, ownAgent: c.ownAgent, jump: c.jump, knownHostsFile: c.pin };
  const argv = buildSshExecArgv({ ...c.entry, port: c.port }, c.key, 'id', c.auth, options);
  assert.notEqual(argv, undefined);
  const label = JSON.stringify({ ...c, entry: c.entry === everything ? 'forwards' : 'plain' }, (_key, value: unknown) => value ?? null);
  return { label, argv: argv ?? [] };
}

const everyRun = (): Run[] => Array.from({ length: COMBINATIONS }, (_, n) => runOf(n));

test('G2: NO_CONNECTION_SHARING is the two options, in this order, and nothing else', () => {
  // Read through the module object, so this file compiles before the constant exists and the first failure is an assertion.
  const exported: Record<string, unknown> = { ...execCommand };
  assert.deepEqual(exported.NO_CONNECTION_SHARING, TWO);
});

test('G2: every run says ControlPath=none and ControlMaster=no exactly once, side by side, before -i, -p and --', () => {
  const runs = everyRun();
  assert.equal(runs.length, 1152, 'every combination of the nine lists');
  assert.equal(new Set(runs.map((run) => run.label)).size, runs.length, 'no combination twice');
  const offenders = runs.filter((run) => !saysNoSharingBefore(run.argv, ['-i', '-p', '--']));
  assert.deepEqual(
    offenders.slice(0, 1).map((run) => `${run.label}: ${run.argv.join(' ')}`),
    [],
    `${offenders.length} of ${runs.length} argvs do not say the two options once, before -i, -p and --`,
  );
});

test('G2: no other word of a run names connection sharing', () => {
  const offenders = everyRun().flatMap((run) => sharingWords(run.argv).map((word) => `${word} in ${run.label}`));
  assert.deepEqual(offenders.slice(0, 3), [], `${offenders.length} words name sharing beside the two options`);
});

test('G2: the scan for sharing words finds each spelling, and leaves the two options alone', () => {
  const planted = ['-o', 'controlmaster=auto', '-oControlPath=/x', '-o', 'ControlPersist=60', '-S', '/y', '-M', '-O', 'exit', ...TWO, '--', 'host', '-S'];
  assert.deepEqual(sharingWords(planted), ['controlmaster=auto', '-oControlPath=/x', 'ControlPersist=60', '-S', '-M', '-O']);
  assert.deepEqual(sharingWords(planted, [1, 2]), ['ControlPersist=60', '-S', '-M', '-O'], 'the indexes a caller owns are skipped');
  assert.equal(saysNoSharingBefore(planted, ['--']), true, 'control: the two options of the planted argv are found');
  assert.equal(saysNoSharingBefore([...TWO, ...planted], ['--']), false, 'twice is not once');
  assert.equal(saysNoSharingBefore(planted, ['-M']), false, 'after a word of `before` is not before it');
});

/** Copied from the output of `main` at b84416aa (extension 1.22.2): G2 changes no bridged call. */
const BRIDGED_KEY_BEFORE_G2 = [
  '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=/keys/known_hosts', '-o', 'ConnectTimeout=10',
  '-J', 'hop@jump.example.com',
  '-o', 'ForwardAgent=no', '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-o', 'ClearAllForwardings=yes', '-o', 'ForwardX11=no', '-o', 'Tunnel=no',
  '-i', KEY_FILE, '-p', '2222', '--', 'deploy@example.com', 'id',
];
const BRIDGED_ASKPASS_BEFORE_G2 = [
  '-o', 'NumberOfPasswordPrompts=1', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10',
  '-o', 'ForwardAgent=no', '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-o', 'ClearAllForwardings=yes', '-o', 'ForwardX11=no', '-o', 'Tunnel=no',
  '--', 'deploy@example.com', 'id',
];

test('G2: a bridged argv is byte for byte the one before G2', () => {
  const pinned = { jump: 'hop@jump.example.com', bridged: true, noTty: true, knownHostsFile: '/keys/known_hosts' };
  assert.deepEqual(argvWith({ ...everything, port: 2222 }, pinned, 'key', KEY_FILE), BRIDGED_KEY_BEFORE_G2);
  assert.deepEqual(argvWith(entity(), { bridged: true }, 'askpass'), BRIDGED_ASKPASS_BEFORE_G2);
});
```

Notes. The nine lists of `AXES` make 2 × 3 × 2 × 3 × 2 × 2 × 2 × 2 × 2 = 1152 argvs: every combination of what a caller can say.
`digit` reads the number of a combination as one digit per list, so no test needs nine nested loops (the complexity limit).
`runOf` builds each argv with the real `buildSshExecArgv`. The two literals of the last test were copied from the output of the
unchanged product (K9), with `KEY_FILE` for the key path: do not build them from `SIX` or from the constant.

## 5. `test/sshBridge.test.ts`

**5.1** One import line after the import of `../sshBridge` (`:4-16`):

```ts
import { pairAt, saysNoSharingBefore, sharingWords } from './noSharingArgv';
```

**5.2 Appended at the end of the file** (R4, R5, G5, G8):

```ts
/* --- G2: the tunnel shares no connection (`PLAN_bridge_no_connection_sharing.md` §4.2, §7.2) --- */
//
// These say what is SENT, and where. What the two options do is asked of a real ssh (`noConnectionSharing.test.ts`) and of a
// real sshd (section 9 of the SSH agent itest).

/** Words a caller could pass in `extra`: none, a jump, and words that themselves name connection sharing. */
const HOSTILE_EXTRA = ['-o', 'ControlMaster=auto', '-o', 'ControlPath=/x'];
const EXTRAS: readonly (readonly string[])[] = [[], ['-J', 'hop@jump.example.com'], HOSTILE_EXTRA];

interface Tunnel {
  readonly label: string;
  readonly argv: string[];
  readonly extra: readonly string[];
}

interface TunnelParts {
  readonly auth: 'key' | 'askpass';
  readonly pin: boolean;
  readonly key: boolean;
  readonly port: boolean;
  readonly extra: readonly string[];
}

/** One tunnel argv: the authentication, with or without a pin, a key and a port, and the caller's `extra`. */
function tunnel(parts: TunnelParts): Tunnel {
  const built = buildBridgeArgv(
    parts.port ? { ...HOST, port: 2222 } : HOST,
    {
      port: 51234,
      remote: { path: '/tmp/creds-dev-abc.sock' },
      auth: parts.auth,
      extra: parts.extra,
      keyPath: parts.key ? '/keys/id_ed25519' : undefined,
      knownHostsFile: parts.pin ? '/keys/known_hosts' : undefined,
    },
    SAFE,
  );
  assert.ok(built !== undefined, 'expected an argv');
  return { label: JSON.stringify(parts), argv: built, extra: parts.extra };
}

const YES_NO = [false, true];

/** Every combination: 2 × 2 × 2 × 2 × 3 = 48 argvs. */
const everyTunnel = (): Tunnel[] =>
  (['key', 'askpass'] as const).flatMap((auth) =>
    YES_NO.flatMap((pin) => YES_NO.flatMap((key) => YES_NO.flatMap((port) => EXTRAS.map((extra) => tunnel({ auth, pin, key, port, extra }))))),
  );

/** Where the caller's `extra` stands: right after `-R` and its value. */
const extraAt = (t: Tunnel): number[] => t.extra.map((_, i) => t.argv.indexOf('-R') + 2 + i);

test('G2: every tunnel says ControlPath=none and ControlMaster=no exactly once, before -N, -R, the extra words, -i, -p and --', () => {
  const tunnels = everyTunnel();
  assert.equal(tunnels.length, 48, 'every combination');
  const offenders = tunnels.filter((t) => !saysNoSharingBefore(t.argv, ['-N', '-R', '-i', '-p', '--']));
  assert.deepEqual(
    offenders.slice(0, 1).map((t) => `${t.label}: ${t.argv.join(' ')}`),
    [],
    `${offenders.length} of ${tunnels.length} tunnels do not say the two options once, before every word a caller can add`,
  );
});

test('G2: a caller\'s own sharing words in extra stand after the two options, as they were passed', () => {
  for (const t of everyTunnel().filter((one) => one.extra === HOSTILE_EXTRA)) {
    const at = extraAt(t);
    assert.deepEqual(at.map((i) => t.argv[i]), HOSTILE_EXTRA, `${t.label}: the caller's words are passed on unchanged, after -R`);
    assert.deepEqual(pairAt(t.argv, 'ControlMaster=no').length, 1, `${t.label}: the caller's ControlMaster=auto is no second ControlMaster=no`);
    assert.ok(pairAt(t.argv, 'ControlMaster=no')[0] + 2 <= at[0], `${t.label}: the first value wins, so the two options stand first: ${t.argv.join(' ')}`);
  }
});

test('G2: no word the builder adds names connection sharing; only a caller\'s extra can', () => {
  for (const t of everyTunnel()) {
    assert.deepEqual(sharingWords(t.argv, extraAt(t)), [], t.label);
  }
  const hostile = everyTunnel().filter((one) => one.extra === HOSTILE_EXTRA)[0];
  assert.deepEqual(sharingWords(hostile.argv), ['ControlMaster=auto', 'ControlPath=/x'], 'control: with nothing skipped, the scan finds the caller\'s two words');
});

test('G2: the tunnel keeps its own forward: no ClearAllForwardings word, and -R with its value', () => {
  for (const t of everyTunnel()) {
    assert.deepEqual(t.argv.filter((word) => /clearallforwardings/i.test(word)), [], `${t.label}: ClearAllForwardings=yes would clear the tunnel's own -R`);
    assert.equal(t.argv[t.argv.indexOf('-R') + 1], '/tmp/creds-dev-abc.sock:127.0.0.1:51234', t.label);
    assert.equal(t.argv.filter((word) => word === '-R').length, 1, t.label);
  }
});
```

Notes. `everyTunnel` is 2 × 2 × 2 × 2 × 3 = 48 argvs. `HOSTILE_EXTRA` is the case of finding 1 of the plan round: an `extra` that
itself names sharing. The rule for it has three parts and each has its assertion: the fixed two stand exactly once, counted by
their exact words (R4, and the second assertion of R5); they stand before the first word of `extra` (the third assertion of
R5); the caller's four words are passed on unchanged and are not counted as the builder's (the first assertion of R5, and G5
with `extraAt`). What is then IN EFFECT is not asked here: R3 of §7 asks the real `ssh`.

## 6. `test/bridgeLinks.test.ts`

The comment at `:219`, the name of the test at `:222` and the loop at `:229-231` change. The bridged half of the test (`:233-245`)
does not.

The comment and the name become:

```ts
/** The other five of the six, in order. The first two are in EVERY argv since G2 (no connection sharing); the last three are sent on a bridge only. */
const OTHER_FIVE = ['ControlPath=none', 'ControlMaster=no', 'ClearAllForwardings=yes', 'ForwardX11=no', 'Tunnel=no'];

test('F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards, the two no-sharing options and none of the other four', async () => {
```

The three lines of the loop become two (R1):

```ts
    const sent = ['ForwardAgent=no', ...OTHER_FIVE].filter((word) => local.includes(word));
    assert.deepEqual(sent, OTHER_FIVE.slice(0, 2), `off a bridge, of the six: the two no-sharing options and no other (G2): ${local.join(' ')}`);
```

One `deepEqual` and no second loop: the callback of this test is at complexity 4 today, and a second `for` makes it 5 (measured:
`eslint` refuses it).

## 7. New `test/noConnectionSharing.test.ts`

The whole file:

```ts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type TestContext, test } from 'node:test';
import { ownedFile } from '../../scripts/lib/leftovers.cjs';
import { buildBridgeArgv } from '../sshBridge';
import { type SshExecAuth, buildSshExecArgv } from '../sshExecCommand';
import { EntityMetadata } from '../types';
import { importedUses } from './funnelScan';
import { withoutTheTwo } from './noSharingArgv';
import { discoverSources } from './tempSiteScan';

/**
 * G2 (`PLAN_bridge_no_connection_sharing.md` §7.2 item 6 and §7.3): the extension's own `ssh` calls share no connection.
 *
 * <p><b>Part 1 asks the real client.</b> `sshExecCommand.test.ts` and `sshBridge.test.ts` show that the two options are in the
 * argv. That is what was SENT. Here the PATH's `ssh -G` resolves each argv under a config file that shares connections and
 * prints what is IN EFFECT. `-G` connects to nothing, so this runs wherever an `ssh` client is. It shows what one client
 * resolves; that a resolved `controlmaster false` really keeps a call out of a master is shown against a real `sshd`
 * (section 9 of `scripts/ssh-agent-itest.cjs`). On Windows it shows that Win32-OpenSSH takes the two words and resolves them
 * the same way, and nothing about sharing there.</p>
 *
 * <p><b>Part 2 is the list of places.</b> Every place that starts an `ssh` from an argv, and every place that builds one, by
 * file and function. A new place fails the list until somebody has looked at where its argv comes from.</p>
 */

/* --- part 1: the real client --- */

/** The control path of the config below. `ssh -G` never makes it. */
const CONTROL_PATH = '/nonexistent/creds-test/cm.sock';

/** What a laptop that shares connections has in its `~/.ssh/config`. */
const SHARING_CONFIG = `Host *\n  ControlMaster auto\n  ControlPath ${CONTROL_PATH}\n  ControlPersist yes\n`;

// The PATH lookup is on purpose: the PATH's ssh is the client the extension starts, and it is the thing asked here.
const ssh = (args: readonly string[]) => spawnSync('ssh', [...args], { encoding: 'utf8', timeout: 15_000 }); // NOSONAR: the PATH's ssh is the subject

const HAS_SSH = ssh(['-V']).error === undefined;

/** Locally a machine with no ssh skips, with the reason; where CI=true nothing skips, so a missing ssh fails. */
const NEEDS_SSH = { skip: HAS_SSH || process.env.CI === 'true' ? false : 'no ssh on the PATH' };

/** The lines `ssh -G` prints for `argv` under the sharing config. */
function resolved(t: TestContext, argv: readonly string[]): string[] {
  const config = ownedFile(t, 'nsh', 'ssh_config');
  fs.writeFileSync(config, SHARING_CONFIG);
  const run = ssh(['-G', '-F', config, ...argv]);
  assert.equal(run.status, 0, `ssh -G did not resolve the argv: ${run.error ?? run.stderr}`);
  return run.stdout.split(/\r?\n/);
}

/** The lines that say whether, and where, this call would share. */
const sharing = (lines: readonly string[]): string => lines.filter((line) => /^control(master|path) /.test(line)).join(' | ');

/** A control path that is in effect: any `controlpath` line except `controlpath none` (OpenSSH 10.2 and 9.5 print no line at all). */
const controlPaths = (lines: readonly string[]): string[] => lines.filter((line) => line.startsWith('controlpath ') && line !== 'controlpath none');

const HOST: EntityMetadata = { id: 'e1', name: 'build box', host: 'build.example.com', user: 'dev', isSshEnabled: true };

const HOSTILE_EXTRA = ['-o', 'ControlMaster=auto', '-o', 'ControlPath=/x'];

function tunnelArgv(auth: SshExecAuth, extra: readonly string[] = []): string[] {
  const argv = buildBridgeArgv(HOST, { port: 51234, remote: { path: '/tmp/creds-dev-abc.sock' }, auth, extra }, () => true);
  assert.ok(argv !== undefined, 'expected an argv');
  return argv;
}

function runArgv(auth: SshExecAuth, bridged: boolean): string[] {
  const argv = buildSshExecArgv(HOST, undefined, 'id', auth, { bridged });
  assert.ok(argv !== undefined, 'expected an argv');
  return argv;
}

/** Every kind of argv the extension starts an `ssh` with. */
const PRODUCTION: readonly (readonly [string, string[]])[] = [
  ['the tunnel of a bridge, a key', tunnelArgv('key')],
  ['the tunnel of a bridge, a password', tunnelArgv('askpass')],
  ['a run off a bridge, a key', runArgv('key', false)],
  ['a run off a bridge, a password', runArgv('askpass', false)],
  ['a bridged run, a key', runArgv('key', true)],
  ['a bridged run, a password', runArgv('askpass', true)],
];

test('where CI=true an ssh client is on the PATH: a skipped check on the runner proves nothing', { skip: process.env.CI === 'true' ? false : 'only where CI=true' }, () => {
  assert.equal(HAS_SSH, true, 'no ssh on the PATH of the runner');
});

test('G2: under a config that shares connections, the real ssh resolves every argv of the extension to no sharing', NEEDS_SSH, (t) => {
  for (const [name, argv] of PRODUCTION) {
    const lines = resolved(t, argv);
    assert.ok(lines.includes('controlmaster false'), `${name}: this ssh would share a connection: ${sharing(lines)}`);
    assert.deepEqual(controlPaths(lines), [], `${name}: a control path is in effect`);
  }
});

test('the control: the same argvs without the two options DO share under this config, so the file can show the fault', NEEDS_SSH, (t) => {
  for (const [name, argv] of PRODUCTION) {
    const lines = resolved(t, withoutTheTwo(argv));
    assert.ok(lines.includes('controlmaster auto'), `${name}: ${sharing(lines)}`);
    assert.deepEqual(controlPaths(lines), [`controlpath ${CONTROL_PATH}`], name);
  }
});

test('G2: a caller\'s own sharing words in extra change nothing: the first value wins, and the two options stand first', NEEDS_SSH, (t) => {
  const lines = resolved(t, tunnelArgv('key', HOSTILE_EXTRA));
  assert.ok(lines.includes('controlmaster false'), `this ssh would share a connection: ${sharing(lines)}`);
  assert.deepEqual(controlPaths(lines), [], 'a control path is in effect');
});

test('G2: the tunnel still asks for its own forward', NEEDS_SSH, (t) => {
  for (const auth of ['key', 'askpass'] as const) {
    const forwards = resolved(t, tunnelArgv(auth)).filter((line) => line.startsWith('remoteforward '));
    assert.deepEqual(forwards, ['remoteforward /tmp/creds-dev-abc.sock [127.0.0.1]:51234'], auth);
  }
});

/* --- part 2: the places --- */

const SRC = path.resolve(__dirname, '..', '..', 'src');

/** Every shipped source file. The tests build argvs of their own and are not places the extension starts an `ssh` from. */
const SOURCES = discoverSources(SRC, new Map([['test', 'the tests are not shipped: they build argvs of their own']]));

const read = (file: string): string => fs.readFileSync(path.join(SRC, file), 'utf8');

/** `file#function` of every reference to `name` imported from the module `from`, sorted. */
const usesOf = (name: string, from: string): string[] =>
  SOURCES.flatMap((file) => importedUses(file, read(file), name, from).map((use) => `${file}#${use.within}`)).sort();

/** `file` once per match of `pattern` in it. */
const matchesOf = (pattern: RegExp): string[] => SOURCES.flatMap((file) => (read(file).match(pattern) ?? []).map(() => file));

const HOW_TO_FIX =
  'a place that starts an ssh, or builds its argv, was added, moved or renamed. Its argv must come from buildSshExecArgv or buildBridgeArgv: both say NO_CONNECTION_SHARING. Then edit this list in the same commit';

test('G2: an ssh is started from an argv only at the listed places', () => {
  assert.ok(SOURCES.length > 100, `the discovery found only ${SOURCES.length} files`);
  assert.deepEqual(
    usesOf('runSshExec', 'sshExecRunner'),
    ['commands/agentCommands.ts#runRemote', 'commands/agentCommands.ts#sweepDeadSockets', 'commands/agentCommands.ts#verifyBridgeSocket', 'sshUseActions.ts#execOverSsh'],
    HOW_TO_FIX,
  );
  assert.deepEqual(matchesOf(/\bbridges\s*\.\s*start\s*\(/g), ['commands/agentCommands.ts'], HOW_TO_FIX);
  assert.deepEqual(usesOf('secretsLaunch', 'remoteLaunch'), ['commands/runCommands.ts#launchesOf'], HOW_TO_FIX);
});

test('G2: and each of them takes its argv from one of the two builders', () => {
  assert.deepEqual(
    usesOf('buildSshExecArgv', 'sshExecCommand'),
    ['commands/agentCommands.ts#runRemote', 'commands/agentCommands.ts#sweepDeadSockets', 'commands/agentCommands.ts#verifyBridgeSocket', 'remoteLaunch.ts#secretsArgv', 'sshUseActions.ts#execArgv'],
    HOW_TO_FIX,
  );
  assert.deepEqual(usesOf('buildBridgeArgv', 'sshBridge'), ['commands/agentCommands.ts#registerAgentCommands'], HOW_TO_FIX);
});

test('G2: the two options are spelled in one file', () => {
  // `Name=value` only: prose may name the options (`ControlMaster`) and a config line (`ControlMaster auto`).
  const spelled = [...new Set(matchesOf(/control(master|path|persist)\s*=/gi))];
  assert.deepEqual(spelled, ['sshExecCommand.ts'], 'an option that names connection sharing is spelled outside sshExecCommand.ts: use NO_CONNECTION_SHARING');
});
```

Notes on part 1. The config file is the fault's own condition: `ControlMaster auto`, a `ControlPath`, `ControlPersist yes`. The
control path is a word: `ssh -G` never makes it. Each call of `resolved` makes its own owned folder through the test's context,
which removes it when the test ends. `spawnSync` has a timeout of 15 s. Where `CI=true` nothing is skipped: a runner with no
`ssh` fails G1 and the tests of part 1.

Notes on part 2. The lists name every place by `file#function`, where the function is the nearest NAMED function around the
reference (`funnelScan.ts:277-288`): the handler of *Open Remote Bridge…* is an arrow inside `registerAgentCommands`, so its
place reads `commands/agentCommands.ts#registerAgentCommands`. The three starters are the parent's §4.4: `runSshExec` (the
bounded runs), `bridges.start` (the tunnel), `secretsLaunch` (the argv of *Run with Secrets*, which `maskedOverSsh` hands to the
masked terminal). What this list does NOT see: a place that starts an `ssh` through a function that is none of these three.
`test/launchRoadScan.test.ts` (its scan 3) is the control for a new spawn in a road file.

## 8. `.github/workflows/ci-extension.yml`

The last step of the job `runner-windows` (`:236-237`) becomes:

```yaml
      - name: Windows parsers (cmd.exe askpass, PowerShell 5.1 and 7 quoting), and what ssh.exe resolves for the extension's argvs (G2)
        run: node --test out/test/windowsParsers.test.js out/test/sshAskpass.test.js out/test/hostShell.test.js out/test/noConnectionSharing.test.js
```

That job has run `npm ci` and `npm run compile`, and it has the shared rules (`:217-231`), which `ownedFile` needs. On Windows
the test shows that Win32-OpenSSH takes the two words and resolves them to no sharing (K10 measured the client alone). It says
nothing about connection sharing on Windows. The Ubuntu job needs no change: `npm test` runs every `out/test/*.test.js`.

## 9. The RED texts (the unchanged product, K9 b)

Step 2 of §10 must show exactly these nine tests red, and each with this text. A path of a temp folder and a uuid differ per
run. Every other test of the four files passes, and G1 is skipped.

| # | Test | Its first failing assertion says |
|---|---|---|
| R1 | `bridgeLinks`: *F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards, the two no-sharing options and none of the other four* | `off a bridge, of the six: the two no-sharing options and no other (G2): -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -J hop@jump.example.com -A -L 8080:db:5432 -R 9000:intranet.example:443 -i <a key file> -- deploy@prod.corp.com id`, actual `[]`, expected `['ControlPath=none', 'ControlMaster=no']` |
| R2 | `noConnectionSharing`: *G2: under a config that shares connections, the real ssh resolves every argv of the extension to no sharing* | `the tunnel of a bridge, a key: this ssh would share a connection: controlmaster auto \| controlpath /nonexistent/creds-test/cm.sock` |
| R3 | `noConnectionSharing`: *G2: a caller's own sharing words in extra change nothing: the first value wins, and the two options stand first* | `this ssh would share a connection: controlmaster auto \| controlpath /x` |
| R4 | `sshBridge`: *G2: every tunnel says ControlPath=none and ControlMaster=no exactly once, before -N, -R, the extra words, -i, -p and --* | `48 of 48 tunnels do not say the two options once, before every word a caller can add`, with the first offender: `{"auth":"key","pin":false,"key":false,"port":false,"extra":[]}: -o BatchMode=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -N -R /tmp/creds-dev-abc.sock:127.0.0.1:51234 -- dev@build.example.com` |
| R5 | `sshBridge`: *G2: a caller's own sharing words in extra stand after the two options, as they were passed* | `{"auth":"key","pin":false,"key":false,"port":false,"extra":["-o","ControlMaster=auto","-o","ControlPath=/x"]}: the caller's ControlMaster=auto is no second ControlMaster=no`, `0 !== 1`. Its first assertion (the caller's words are passed on unchanged) passes |
| R6 | `sshExecCommand`: *F1: off a bridge the same entry keeps -J -A -L … -R …, then says the two no-sharing options, and none of the other four* | `Expected values to be strictly deep-equal`: the actual list ends with `'9000:intranet.example:443'`, the expected one has `'-o', 'ControlPath=none', '-o', 'ControlMaster=no'` after it |
| R7 | `sshExecCommand`: *F2: { bridged: false } and {} send the two no-sharing options and none of the other four, and an entry that forwards keeps its own -A* | `of the six, the two and only they: -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -J hop@jump.example.com -A -- deploy@example.com id`, actual `[]`, expected `['ControlPath=none', 'ControlMaster=no']` |
| R8 | `sshExecCommand`: *G2: NO_CONNECTION_SHARING is the two options, in this order, and nothing else* | `Expected values to be strictly deep-equal`: actual `undefined`, expected `['-o', 'ControlPath=none', '-o', 'ControlMaster=no']` |
| R9 | `sshExecCommand`: *G2: every run says ControlPath=none and ControlMaster=no exactly once, side by side, before -i, -p and --* | `768 of 1152 argvs do not say the two options once, before -i, -p and --`, with the first offender: `{"auth":"key","bridged":null,"noTty":null,"ownAgent":null,"jump":null,"entry":"plain","pin":null,"key":null,"port":null}: -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -- deploy@example.com id`. Its two count assertions pass |

768 is two thirds of 1152: every combination that is not bridged. R2 stops at the first of its six argvs; with the product built
it reads all six. R8 is `undefined` and no compile error, because the test reads the module object.

The eleven guards are green on the unchanged product and stay green. A guard is proven by a mutation (§11), not by a RED.

| # | Guard | File | Red under |
|---|---|---|---|
| G1 | *where CI=true an ssh client is on the PATH: a skipped check on the runner proves nothing* (skipped where `CI` is not `true`) | `noConnectionSharing` | not run here; a runner with no `ssh` |
| G2 | *the control: the same argvs without the two options DO share under this config, so the file can show the fault* | `noConnectionSharing` | X3 |
| G3 | *G2: the tunnel still asks for its own forward* | `noConnectionSharing` | M4 |
| G4 | *G2: an ssh is started from an argv only at the listed places* | `noConnectionSharing` | M9 |
| G5 | *G2: no word the builder adds names connection sharing; only a caller's extra can* | `sshBridge` | M14 |
| G6 | *G2: no other word of a run names connection sharing* | `sshExecCommand` | M12 |
| G7 | *G2: the scan for sharing words finds each spelling, and leaves the two options alone* | `sshExecCommand` | a test of the helper: X5 |
| G8 | *G2: the tunnel keeps its own forward: no ClearAllForwardings word, and -R with its value* | `sshBridge` | M4 |
| G9 | *G2: a bridged argv is byte for byte the one before G2* | `sshExecCommand` | M5, M6, M8, M11 |
| G10 | *G2: and each of them takes its argv from one of the two builders* | `noConnectionSharing` | M13 |
| G11 | *G2: the two options are spelled in one file* | `noConnectionSharing` | M7, M14 |

## 10. Order of work, and the commit

1. **The tests** (§3 to §7): the new helper, the new test file, the changes of the three test files. No product file yet.
   Compile: exit 0.
2. **RED.** Run the four files (command 2). Expected: 106 tests, 9 fail, 96 pass, 1 skipped, and the nine are R1 to R9 with the
   texts of §9. Save the output. If another test is red, a text differs, or a guard is red: stop and tell the lead. A machine
   with no `ssh` on the PATH skips the four `ssh -G` tests (R2, R3, G2, G3): then say so, and the lead reads them on CI.
3. **The product** (§1, §2). Compile; the four files: 105 pass, 1 skipped. `wc -l` says 194 and 382.
4. **The mutation checks** (§11), one at a time, each restored before the next. Save what each one printed.
5. **The workflow line** (§8).
6. Typecheck, lint, the whole suite (`npm test`): green. Commit c1:
   `fix(ssh): G2 S1 — the tunnel of a bridge and every run say no connection sharing`. Its body quotes the RED texts of step 2 and
   the result of each mutation, and says that the effect on a server is S2's.

No commit holds a red test. S2 starts on top of c1.

## 11. The mutation checks (each one must turn the named tests red; restore after each one)

Each mutation is a temporary edit of the PRODUCT, never of a test. Compile (read the exit), run the four files, read what is
red, restore, and compile again before the next one. "Red" below is what was measured (K9 e); a mutation that turns red something
else, or less, is a finding for the lead. M1, M2, M4, M5 and M6 are run again on the real legs by S2.

| # | The mutation | Red |
|---|---|---|
| M1 | The tunnel says nothing: `...NO_CONNECTION_SHARING,` leaves `FIXED_OPTIONS` (keep the import used: `void NO_CONNECTION_SHARING;` after the list) | R2, R3, R4, R5 |
| M2 | A run off a bridge says nothing: in `buildSshExecArgv`, `: NO_CONNECTION_SHARING` becomes `: []` | R1, R2, R6, R7, R9 |
| M3 | The tunnel says it too late: `...NO_CONNECTION_SHARING,` moves from `FIXED_OPTIONS` to the line after `...(options.extra ?? []),` in `buildBridgeArgv` | R3, R4, R5 |
| M4 | The tunnel clears its own forward: `'-o', 'ClearAllForwardings=yes',` is added at the end of `FIXED_OPTIONS` | G3, G8 |
| M5 | Only the second option: the constant becomes `['-o', 'ControlMaster=no']` | R1, R2, R3, R4, R6, R7, R8, R9, G9, and four older tests of `sshExecCommand` (C.1, the two F1 of a bridged call, `a_forwarding_entry_…`) |
| M6 | Only the first option: the constant becomes `['-o', 'ControlPath=none']` | the same as M5, and R5 |
| M7 | The options are spelled a second time: in `FIXED_OPTIONS`, `...NO_CONNECTION_SHARING,` becomes `'-o', 'ControlPath=none',` and `'-o', 'ControlMaster=no',` | G11 only: the argv is the same, the spelling is in a second file |
| M8 | The other order: the constant becomes `['-o', 'ControlMaster=no', '-o', 'ControlPath=none']` | R1, R4, R6, R8, R9, G9, and the four older tests of M5 |
| M9 | A new place that could start an `ssh`: at the end of `sshUseActions.ts`, `export function g2Mutation(): unknown { return runSshExec; }` | G4 |
| M10 | Twice: `: NO_CONNECTION_SHARING` becomes `: [...NO_CONNECTION_SHARING, ...NO_CONNECTION_SHARING]` | R6, R9 |
| M11 | After the key: the line of §1.2 moves to just before the comment of `--` (after the `-i` and `-p` blocks) | R9, G9, `sshExecCommand`'s *F1: a bridged argv keeps the jump…*, and the BRIDGED half of the `bridgeLinks` test of R1 (*before the key and the destination*) |
| M12 | One more sharing word: `: NO_CONNECTION_SHARING` becomes `: [...NO_CONNECTION_SHARING, '-o', 'ControlPersist=no']` | R6, G6 |
| M13 | A new place that builds an argv: at the end of `sshUseActions.ts`, `export function g2Mutation(): unknown { return buildSshExecArgv; }` | G10 |
| M14 | One more sharing word in the tunnel: `'-o', 'ControlPersist=no',` is added at the end of `FIXED_OPTIONS` | G5, G11 |

M1 to M4 are the first four of the parent's §7.5. M5 and M6 are its fifth, on the unit side: both are red here, because the
tests pin BOTH words; which of the two carries the effect is S2's to show.

## 12. Done when (each item can be counted)

- [ ] The nine RED tests of §9 were watched failing with the texts of §9 on the unchanged product, and pass at c1; the eleven
      guards were green before and are green at c1 (G1 skipped where `CI` is not `true`).
- [ ] At c1 the four files have 106 tests: 105 pass, 1 skipped.
- [ ] M1 to M14 each turned red what §11 names, and the product was restored after each.
- [ ] `sshExecCommand.ts` has 194 lines and `sshBridge.ts` 382; the product diff is §1 and §2 and nothing else.
- [ ] No existing test changed except the three of §4.2, §4.3 and §6; no call site changed; `git diff --stat` names eight files.
- [ ] `grep -rn "ControlPath=\|ControlMaster=" src --include=*.ts` outside `src/test` names `sshExecCommand.ts` only.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` are green; the leftovers audit of `npm test` names no folder of this run.
- [ ] The commit body has the nine RED texts and the fourteen mutation results.

## 13. Break it — ways to make the tests pass while the defect stays, and the row that stops each one

| # | The way | What stops it |
|---|---|---|
| X1 | The options are in the argv but too late: after `extra`, or after `--`. (`-o` words in `extra` come too late; the flag spellings `-S` and `-M` would override the options, so `extra` must never carry them: follow-up H4 of the plan) | R4 and R5 (before `-N`, `-R` and the first word of `extra`), R9 (before `-i`, `-p`, `--`), and R3: the real `ssh` resolves the hostile `extra` (M3, M11) |
| X2 | The options are sent, and `ssh` does not do what their names say | R2 and R3 ask the real client what is in effect. What the server then sees is S2. This spec claims no more than "sent" and "resolved" |
| X3 | The `ssh -G` test passes because its config file shares nothing (a typo in the file, a client that ignores `-F`) | G2: the same argvs with the two options taken out must print `controlmaster auto` and the file's `controlpath`. Check by hand once: empty `SHARING_CONFIG`, and G2 is red |
| X4 | A caller's own `ControlMaster=auto` is counted as the fixed option, so "exactly once" passes with the fixed one missing | `pairAt` compares the value whole; R5's second assertion counts `ControlMaster=no` alone (M1 makes it `0 !== 1`) |
| X5 | The scan for other sharing words matches nothing, so G5 and G6 pass forever | G7 plants every spelling (`controlmaster=auto`, `-oControlPath=/x`, `ControlPersist=60`, `-S`, `-M`, `-O`) and reads them back; G5's last assertion finds the hostile `extra` when nothing is skipped (M12, M14) |
| X6 | A bridged argv changes, and the tests of the six still pass because they read the constant | `SIX` and the two literals of G9 are spelled in the test, not built from the product (M5, M6, M8) |
| X7 | A new road starts an `ssh` with a hand-written argv | G4 and G10 are lists compared whole: a new use of `runSshExec`, `secretsLaunch`, `buildSshExecArgv` or `buildBridgeArgv`, or a second `bridges.start(`, is red until somebody edits the list (M9, M13). Not seen: a new spawn through another function (the note of §7) |
| X8 | A second file spells the options, and the two spellings drift apart | G11 (M7) |
| X9 | A test passes because its subject never arrived: no `ssh`, or an argv that was `undefined` | G1 where `CI=true`; `resolved` asserts exit 0 of `ssh -G`; `tunnelArgv`, `runArgv`, `tunnel` and `runOf` assert that an argv was built; R9 asserts 1152 argvs and no label twice; R4 asserts 48 |

## 14. Opus review checklist

1. `NO_CONNECTION_SHARING` is the four words in the order `ControlPath=none`, `ControlMaster=no`; `BRIDGED_SSH_OPTIONS` spreads it
   between `ForwardAgent=no` and `ClearAllForwardings=yes`; G9's two literals are unchanged from §4.4.
2. `buildSshExecArgv` pushes one of the two lists in the one place of §1.2, for every call: no `if` around it, no option of
   `SshExecOptions` reads into it except `bridged`.
3. `FIXED_OPTIONS` ends with the spread; `buildBridgeArgv` is untouched; `extra` still stands after `-R`.
4. Neither docblock states an effect without its conditions (the date, OpenSSH 10.2p1, loopback, the config). The docblock of
   `sshBridge.ts` does not spell the options.
5. No call site, no `SshExecOptions` field, no `BridgeOptions` field, no document changed.
6. Each RED text in the commit body is one of §9, and the test's earlier assertions passed on the unchanged product (R5's first,
   R9's two counts).
7. Each mutation in the commit body names what turned red, and it is what §11 says.
8. `test/noConnectionSharing.test.ts` writes through `ownedFile(t, …)` only; `spawnSync` has its timeout; nothing skips where
   `CI=true`.
9. The lists of G4 and G10 are the ones of §7, and each entry was opened: the function really takes its argv from a builder
   (`execOverSsh` from `execArgv`, the bridge's handler from `buildBridgeArgv`, `launchesOf` from `secretsLaunch`, whose argv is
   `secretsArgv`'s).
10. No new `eslint-disable`; complexity 4 holds in the test files; 194 and 382 lines.
11. The workflow line names the new file in the Windows step and nothing else of the workflow changed.
12. Nothing in the commit says that sharing is OFF on a server, on Windows or for a jump host: S1 shows sent and resolved.

## 15. Not verified by this spec

- **The effect against a server.** That a resolved `controlmaster false` keeps a call out of a master, that a closed bridge
  serves nothing, that a wrong key or pin fails: S2, on a real `sshd`.
- **Windows under Node.** K10 measured the client by hand. The test file's first run on `windows-latest` is CI's. Checked there
  for the first time: that `ssh` is on the PATH of that step, and that the runner's version resolves as 9.5p2 did.
- **An older OpenSSH client.** 10.2p1 (Linux) and 9.5p2 (Windows) were asked. A client that prints `controlpath none` passes
  (`controlPaths` allows it); a client that prints another form of "off" would turn R2 red, and that is a finding, not a flake.
- **macOS.** Not run.
- **The nested `ssh` of a jump host** gets none of these options (the parent's decision 2, H1). No test here covers it, and no
  sentence here may say it is covered.
- **`git` over SSH** (H2) and the person's own terminal are out of scope and unchanged.

## Notes for the lead

- `test/noSharingArgv.ts` is a second new test file; the parent's scope names one. It holds the five functions that three test
  files share, so the rule of finding 1 (counted by exact words, the caller's words skipped by position) is written once.
- The list of places (G4, G10) is a counted list, as `launchRoadScan.test.ts` is, and not a proof of data flow. Item 9 of the
  checklist is the reading that the list cannot do.
- The scan G11 forbids the `Name=value` spelling in every other shipped file, comments included. S3's documents are outside
  `src/` and are not read by it; the help texts in `src/help*.ts` are: a help sentence must not spell `ControlMaster=…`.
- PR #365: its conflicts with c1 are in the import block and the F1/F2 tests of `sshExecCommand.test.ts`, in `bridgeLinks.test.ts`
  near `OTHER_FIVE`, and in the Windows step. The fixed point is G9: a bridged argv starts with the six options.
- The whole suite was run on a copy that is no git checkout, so one test of the leftovers runner failed there for that reason
  (K9 d). In the worktree `npm test` is expected green.
