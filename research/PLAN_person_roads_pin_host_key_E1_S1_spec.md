# PLAN — E1.S1 spec: the words of a pinned call come from one function (SECURITY)

> Status: **IMPLEMENTED, 2026-11-27.** Story E1.S1 (spec) of G1: merged (#379, squash `f3e9887d`) and released in extension 1.23.0 on 2026-11-23 (release PR #383, `95e11116`, tag `extension-v1.23.0`). G1 as a whole was finished and released in extension 1.24.0 on 2026-11-27 (release PR #395, squash `a63dee35`, tag `extension-v1.24.0` at `a63dee35`, published to the Marketplace the same day). The parent [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) records the release and the run on the release commit (§10.5).
>
> The status as it stood before the promotion, kept as it was written: **built 2026-11-17/18 (91bd94a7) on `fix/g1-person-roads-pin`, merged (#379, `f3e9887d`), not released. Its rule of the path (the bare apostrophe, `/dev/null` for a double quote) is replaced in epoch 2 by the parent's §3.11, and is corrected by E2's pull request. Spec written 2026-11-17, by Fable.** A security spec, written before its code (the row *Security
> judgement* of `subagent-models.md`; not the cornerstone: E1.S2 holds it). Story E1.S1 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its §3.9, the tests 12, 13 and 14 of its §5 and the two
> mutation checks of item 15 that name `GlobalKnownHostsFile` and a bare path) and of its stories document
> [PLAN_person_roads_pin_host_key_E1.md](PLAN_person_roads_pin_host_key_E1.md) (`## E1.S1`). This file is promoted together with
> the parent.
>
> Scope: `src_vs_code/src` — `hostKeyPin.ts` (one new exported function), its two callers `sshExecCommand.ts` and `sshBridge.ts`;
> tests: new `test/hostKeyWords.test.ts`, new `test/pinnedArgv.ts`, one assertion of `test/sshExecCommand.test.ts`; two documents
> (§8). No call site, no helper of `writtenKey.ts`, nothing of `commands/agentCommands.ts` (E1.S2, E1.S3), no script (E1.S4).
> Branch `fix/g1-person-roads-pin`. Each `file:line` below was read on `main` at `ca99cd91` (G2 merged, #376). Fable writes this
> spec, a Sonnet coder builds it, Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above. The names
of this document: the facts K1 to K12, the RED tests R1 to R11, the guards U1 to U5, the mutations MU1 to MU14, the break-its X1
to X9. "The three options" are `StrictHostKeyChecking`, `UserKnownHostsFile` and `GlobalKnownHostsFile`; "the six words" are
`-o StrictHostKeyChecking=yes -o UserKnownHostsFile=<word> -o GlobalKnownHostsFile=<word>`, in that order, the same `<word>`
twice. This document keeps no change ledger: a change of it is an entry in the parent (`plan-change-control.md`), and the parent
has one entry in its epoch, so a second one stops the whole plan.

## What E1.S1 builds, in one paragraph

An SSH entry can hold a pinned host key. A call that the extension starts with no terminal says the pin to `ssh` with two options
today: `StrictHostKeyChecking=yes` and `UserKnownHostsFile=<the pin file>`. Both argv builders write these words, each by itself.
Two things are wrong with the words. `UserKnownHostsFile` replaces only the person's own files, so `ssh` still reads the
system-wide ones, and a key that such a file lists for the host passes the check beside the pin (the parent's P1). And both
options take a LIST of files, split at white space, so a pin file under a folder like `Application Support` is read as two
names, neither of which is the file, and the call is refused. E1.S1 gives the words one writer, `hostKeyWords` in `hostKeyPin.ts`,
and both builders call it. With a pin file it answers the six words: strict checking, and the pin file as BOTH known-hosts files.
A path with white space goes in double quotes. A path that holds a double quote is not named at all: both options then name a
file that holds no key, so `ssh` refuses every host. The function always answers words, so no builder gains a branch and no
caller gets a new answer to handle. The unit tests show what is SENT. Three tests ask the real `ssh -G` what a client RESOLVES
from the words. What a real `sshd` then gets was measured by hand (K6) and is E1.S4's and E2's to test.

| File | Change | Where |
|---|---|---|
| `hostKeyPin.ts` | new `export function hostKeyWords(pinFile: string \| undefined): string[]`; its private helper `oneFileWord` and the constant `NO_KEY_FILE`; four lines in the module's docblock. 155 → 213 lines | §1 |
| `sshExecCommand.ts` | one import; the expression of the host-key words becomes one call. 201 → 197 lines | §2 |
| `sshBridge.ts` | one import; the private `hostKeyArgv` goes, `buildBridgeArgv` calls `hostKeyWords`. 386 → 382 lines | §3 |
| `test/pinnedArgv.ts` (new) | what the tests ask of an argv about the host's key: `HOST_KEY_OPTIONS`, `valuesOf`, `hostKeyWordsOf`, `lastHostKeyWordAt`, `withoutGlobal`. 55 lines | §4 |
| `test/hostKeyWords.test.ts` (new) | 15 tests: what is sent (9), the real `ssh -G` (4), the list of places (2). 261 lines | §5 |
| `test/sshExecCommand.test.ts` | one import; the test of G2's two literals takes G1's one pair out before it compares. 332 → 335 lines | §6 |
| `src_vs_code/CHANGELOG.md`, `research/module_extension.md` | the texts of §8 | §8 |

## Binding constraints

- **No plan change.** Build what the parent and this document say. If a step cannot be done as written, a code block here does
  not compile, or a test is not RED or GREEN as this document says: stop and tell the lead. Do not repair the parent, the stories
  document or this document.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first. Read the exit of `tsc` before any
  test result. This is why the two tests of the function (R5, R6) read the export through the module object: the test files
  compile before the function exists (K10 a).
- **Keep what the runner printed.** Save each RED text in the scratchpad folder of the session and quote it in the commit body.
- **Stage by path.** Read `git diff --staged --stat` before the commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history. Never a bare `git stash`. Never commit `.claude/settings.json`.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): 800 lines per file, 50 code lines per function (120 in `src/test/`),
  complexity 4, also in tests. No new `eslint-disable`. `buildSshExecArgv` keeps its one `eslint-disable-next-line complexity`
  (`sshExecCommand.ts:155`). `buildBridgeArgv` is at complexity 4 today (K3): it gains no branch.
- **The product change is §1, §2 and §3 and nothing else.** No call site changes. No field is added to `SshExecOptions` or
  `BridgeOptions`. Both builders keep their signature and their answers: `undefined` still means only what it means today.
  `hostKeyTrust.ts` (`materializeKnownHosts`), `sshCommand.ts`, `sshOptions.ts`, `sshSession.ts`, `sshUseActions.ts`,
  `remoteLaunch.ts`, `writtenKey.ts`, `commands/agentCommands.ts` do not change.
- **An unpinned argv does not change by one word**, and a pinned argv whose pin file has no white space changes by exactly one
  pair, `-o GlobalKnownHostsFile=<file>`, right behind the pair of `UserKnownHostsFile`. U1 and U2 hold both.
- **The three options are spelled in ONE product file**, `hostKeyPin.ts`, as `Name=value` (and in `sshCommand.ts`, the line of a
  Connect terminal, which this story does not touch). Every other product file says `hostKeyWords`. A comment in another file may
  name an option (`UserKnownHostsFile`) and never the `Name=` spelling: R10 reads comments too.
- **`hostKeyWords` never answers a pinned call with `accept-new`, and never with fewer than the six words.** There is no answer
  that a caller could read as "no pin". MU4 and MU10 turn red if there is.
- **Tests leave nothing outside an owned temp folder.** Four tests write a real file (the config of `ssh -G`): through `ownedFile`
  of `scripts/lib/leftovers.cjs`, with the test's own context as the scope (the guard `test/leftoversSites.test.ts` reads every
  test file).
- **Existing tests that change: the one of §6, and no other.** If another existing test turns red after §1 to §3, stop and tell
  the lead. Measured: none does (K10 d).
- **Node only.** No Python, also not for a helper script. Write files with the Edit or Write tool, not with a shell heredoc.

## Facts read on `ca99cd91` and measured on 2026-11-17 that this spec uses

| # | Fact | Where |
|---|---|---|
| K1 | Three places of the shipped source spell `UserKnownHostsFile=`: `hostKeyArgv` of the tunnel (`sshBridge.ts:182-187`), the expression in `buildSshExecArgv` (`sshExecCommand.ts:173-178`), and `knownHostsOption` with `hostKeyArgv` of the line of a Connect terminal (`sshCommand.ts:312-330`). The first two write the same two pairs. `GlobalKnownHostsFile` is in no file of `src/`. `StrictHostKeyChecking=yes` is spelled in those three places and in comments of `hostKeyPin.ts:15` and `sshCommand.ts:281`. Other files name `UserKnownHostsFile` without `=` (`remoteRoute.ts:9`, `sshSession.ts:355`, `:564`) | a search of `src_vs_code/src`, tests left out |
| K2 | `buildSshExecArgv` (`sshExecCommand.ts:156-201`) builds: `-T` when asked and the authentication option (`:166-169`), the host-key words and `ConnectTimeout=10` (`:173-178`), the composer's words and `ForwardAgent=no` of `ownAgentWords` (`:183`), `NO_CONNECTION_SHARING` or the six bridged options (`:185`), `-i` (`:186-188`), `-p` (`:189-191`), `--` (`:196`), the destination and the command. It has no parameter through which a caller adds an option word. The composer adds `-J`, `-A`, `-L` and `-R` and no `-o` word (`sshOptions.ts:199-204`) | read |
| K3 | `buildBridgeArgv` (`sshBridge.ts:220-245`) returns: the authentication option (`:230`), `FIXED_OPTIONS` (`:231`; `:174-180`), the host-key words (`:232`), `-N`, `-R` and its value, `options.extra` (`:236`), `-i`, `-p`, `--`, the destination. So the host-key words stand before every word a caller can add. Its complexity is 4, the limit: the `if` and the two `??` (measured: one more branch made `eslint` refuse the function) | read; lint on a scratch copy |
| K4 | The callers of the two builders (the list of `test/noConnectionSharing.test.ts:150-155`): `commands/agentCommands.ts` (`runRemote`, `sweepDeadSockets`, `verifyBridgeSocket`, and `buildBridgeArgv` in `registerAgentCommands`), `remoteLaunch.ts#secretsArgv`, `sshUseActions.ts#execArgv`. `execArgv` casts the answer to `string[]` (`sshUseActions.ts:259-263`: "the host was checked by the caller"), so a NEW reason for `undefined` would reach `spawn` there as no argv at all. This is why `hostKeyWords` has no `undefined` answer | read |
| K5 | `hostKeyPin.ts` imports `./sshKeyParse` and `./sshCommand` (`:1-2`) and no `vscode`. `sshExecCommand.ts` and `sshBridge.ts` import neither of the two builders into it, so the new import makes no cycle that was not there (`sshCommand.ts` and `sshOptions.ts` import each other today). Measured: `tsc` exit 0, and the whole suite loads (K10 d) | read; a scratch copy |
| K6 | **Measured against a real `sshd`, by hand** (OpenSSH 10.2p1 on both ends, Ubuntu `1:10.2p1-2ubuntu3.8`, loopback, one user, an `sshd -D -e` unpacked without root; the client with `-F /dev/null` or the named config, `BatchMode`, a login key, G2's two options). *Accepted*: exit code 0, the remote `echo` printed, one more `Accepted publickey` in the server's log. *Refused*: exit code 255, `Host key verification failed.`, no new accepted login. (a) The real key in a pin file at a path with a space, the six words with the path in double quotes: accepted. (b) The same path bare in both options: refused. (c) Another key in the pin file, a config that names a system-wide file with the real key, today's two pairs: accepted, the hole of P1. (d) The same with the six words: refused. (e) The real key, no space, the six words, the same config: accepted, the control. (f) The six words with `/dev/null` as both files: refused, with `No ED25519 host key is known for [127.0.0.1]:<port> and you have requested strict checking.`, also under a config that names a file with the real key as both lists and says `StrictHostKeyChecking no`. These are the rows 7, 6, 1 and 2 of the parent's §3.9 again, with the words as this story writes them | by hand; the script is not kept |
| K7 | **Measured on Windows, the client alone, 2026-11-17:** `ssh.exe -G` of OpenSSH_for_Windows_9.5p2 (LibreSSL 3.8.2; the owner's PC, started from WSL with the argv as separate arguments, no shell string), with the words of a pinned run as `buildSshExecArgv` will write them (`-o BatchMode=yes`, the six words, `-o ConnectTimeout=10`, G2's two options, `--`, a destination, a command) and `-F none`. The pin file: `C:\Users\<first> <last>\AppData\Roaming\Code\User\globalStorage\<extension>\keys\<pid>\known_hosts-e1-<uuid>`, in double quotes inside both words. It printed `stricthostkeychecking true`, and `userknownhostsfile` and `globalknownhostsfile` each followed by that path, once, with its space and without the quotes. **`-G` joins the files of a list with a space, so this line alone looks the same for one file and for two** (the bare word printed the identical line). The control that tells them apart: a path with ` ~` after the space (`ssh` expands a `~` only at the start of a name). In double quotes: exit code 0 and the path as it is, one file. Bare: exit code 255 and `tilde_expand: No such user`, so the bare word was split in two. The same control on the Linux client: quoted, the path as it is; bare, two names with the second expanded to the home folder. Today's two pairs with a path that has no space printed the pin as `userknownhostsfile` and `__PROGRAMDATA__\ssh/ssh_known_hosts __PROGRAMDATA__\ssh/ssh_known_hosts2` as `globalknownhostsfile`: the system-wide files are read beside the pin on Windows too. **Not measured: any login on Windows.** There is no Windows `sshd` counterpart here; the key check against a real host on Windows stays candidate C6 of the parent | by hand |
| K8 | **What the rule of this story does NOT make safe, measured with `ssh -G` on both clients (10.2p1 and 9.5p2), `-F none`.** Each is today's behaviour of a pinned call and stays. (a) A path with ONE apostrophe and no white space, bare: `command-line line 0: invalid quotes`, exit code 255, on both. No `ssh` starts a connection; every pinned call of such a storage folder fails today and after this story. In double quotes the same path resolves to itself. (b) A path with a PAIR of apostrophes and no white space, bare: the apostrophes are taken out, one other path (the Linux client). (c) `\\` in a path: read as one `\` (the Windows client, bare and in double quotes; the Linux client, bare). A storage folder on a UNC path (`\\server\share\…`) therefore resolves to `\server\share\…`, another path. (d) `%h` in a path: expanded in `UserKnownHostsFile` and NOT in `GlobalKnownHostsFile`, on both; `${HOME}` the same, and an unknown `%z` ends with exit code 255 (the Linux client). (e) `=` inside a path: read as it is, on both; `#` the same (the Linux client). (f) An empty value: `no argument after keyword "userknownhostsfile"`, exit code 255. (g) A double quote, bare or inside double quotes: `invalid quotes`, exit code 255; with two of them and white space between, bare: the quotes are taken out and the result is one other path (the Linux client; §7, the RED text of R9). Escaped as `\"` inside double quotes it resolves to the path on both clients. **Not measured:** an `ssh` older than 8.7, which reads a `-o` value with another tokenizer (read: it knows no `\"`, and it splits a bare value at `=` too) | by hand |
| K9 | `ssh` takes the FIRST value it is given for an option, also for the two known-hosts options, and a command-line value wins over a config file: `-o UserKnownHostsFile=/a -o UserKnownHostsFile=/b -o GlobalKnownHostsFile=/c -o GlobalKnownHostsFile=/d` resolves to `/a` and `/c` (`ssh -G`, 10.2p1). `-G` prints `stricthostkeychecking true` for `yes` | by hand; R7 holds it |
| K10 | **Measured on a scratch copy of the repository at `ca99cd91`** (`git archive`, the shared rules and `node_modules` linked in; the copy was edited and compiled, not the repository; not kept). OpenSSH 10.2p1 client, Node 26.12.1, Linux. (a) The tests of §4 to §6 compile on the unchanged product (`tsc` exit 0). (b) On the unchanged product `test/hostKeyWords.test.ts` has 15 tests: 11 fail (R1 to R11, §7) and 4 pass (U1 to U4); the changed test of §6 (U5) passes. (c) After §1 to §3: 15 of 15 pass, and the ten files of the commands (item 2) have 195 tests, 194 pass, 0 fail, 1 skipped (the test of `noConnectionSharing.test.ts` that runs only where `CI=true`). (d) `npm run typecheck` and `npm run lint`: exit 0. The whole suite: 7959 tests, 7920 pass, 38 skipped, 1 fail. That one is the copy's own: `leftoversRunnerSweep.test.js` asks `git worktree list` of the copy, which is no repository; run alone it fails the same, with that message. (e) The mutations of §10, each on the product of §1 to §3 | a scratch copy |
| K11 | How a scan of the shipped source is written here, as G2 wrote its own: `discoverSources(root, excluded)` lists every `.ts` under a folder, sorted (`test/tempSiteScan.ts:62-76`); `importedUses(file, text, name, module)` finds every reference to a binding imported from a module, with the function it stands in as `within` (`test/funnelScan.ts`); `test/noConnectionSharing.test.ts:120-155` is the pattern. A temp file of a test: `ownedFile(scope, what, name)`; a `node:test` context is a scope. A tool that may be missing skips locally with a reason and fails where `CI=true` (`test/noConnectionSharing.test.ts:37-43`) | the helpers |
| K12 | PR #365 (open) changes `sshExecCommand.ts` and `test/sshExecCommand.test.ts` too (read from its file list, 2026-11-17). Whoever merges second merges `main` and runs both suites again. G2's test of the two bridged literals (`test/sshExecCommand.test.ts:315-332`) is the one existing expectation that this story meets (§6) | the PR's file list |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.** A test result after a failed `tsc` is the result of old files.
2. The ten files: `node $LP node --test --test-concurrency=4 out/test/hostKeyWords.test.js out/test/sshExecCommand.test.js out/test/sshBridge.test.js out/test/bridgeLinks.test.js out/test/secretsLaunch.test.js out/test/sshExecOver.test.js out/test/hostKeyPin.test.js out/test/noConnectionSharing.test.js out/test/sshUseActions.test.js out/test/hostKeyTrust.test.js`
3. `node $LP npm run typecheck`
4. `node $LP npm run lint`
5. `npm test` — the full suite (it compiles first and lowers itself).

## 1. The product: `hostKeyPin.ts`

**1.1 The module's docblock.** After the paragraph that ends with "…a scrollback nobody reads.</p>" (`:13-16`), one more
paragraph. The sentence above it says "built from it alone"; that was not so (K6 c), and after this story it is so for the calls
without a terminal only:

```ts
 *
 * <p>"Built from it alone" is what the calls without a terminal ask of `ssh`: {@link hostKeyWords} names the pin file as BOTH
 * known-hosts files. The line of a Connect terminal (`sshCommand.ts`) names it as the person's file only, so there `ssh` still
 * reads the system-wide files beside it.</p>
```

**1.2 The function.** Directly above `export type PinVerdict` (`:132`), this block, word for word:

```ts
/** A known-hosts file that holds no key. It stands in for a pin file whose path cannot be written as one word: see {@link oneFileWord}. */
const NO_KEY_FILE = '/dev/null';

/**
 * The words that tell `ssh` how to check the host's key, on a call the extension starts with no terminal. The one place they are
 * written: both argv builders call it (`buildSshExecArgv`, `buildBridgeArgv`), and `hostKeyWords.test.ts` holds the list.
 *
 * <p><b>No pin file:</b> `accept-new`, as before. <b>A pin file:</b> strict checking, and that file as the person's known-hosts
 * file AND as the system-wide one. The second is the point (G1, P1). `UserKnownHostsFile` replaces only the person's own files:
 * `ssh` still reads the system-wide ones (`/etc/ssh/ssh_known_hosts`), so a key that such a file lists for the host passed the
 * check beside the pin. The same path twice needs no second name for "no file", which differs between the platforms.</p>
 *
 * <p><b>Measured 2026-11-17</b>, OpenSSH 10.2p1 against a real `sshd` on the loopback, by hand. The pin file held ANOTHER key and
 * a config named a system-wide file with the host's real key: with the first two options the login was accepted; with all three,
 * `Host key verification failed.`, exit code 255. What a client resolves from these words is asked of the PATH's `ssh -G` in
 * `hostKeyWords.test.ts`; no test of the suite asks a real `sshd`.</p>
 *
 * <p><b>What these words do NOT switch off:</b> the sources that only an `ssh` config turns on, `KnownHostsCommand` and
 * `VerifyHostKeyDNS` (candidate C2 of the plan). And the line of a Connect terminal (`sshCommand.ts`) writes its own words, the
 * pin as the person's file only (candidate C4).</p>
 *
 * <p>It always answers words, and with a pin file always strict ones: there is no answer that a caller could read as "no pin".</p>
 */
export function hostKeyWords(pinFile: string | undefined): string[] {
  if (pinFile === undefined) {
    return ['-o', 'StrictHostKeyChecking=accept-new'];
  }
  const file = oneFileWord(pinFile);
  return ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${file}`, '-o', `GlobalKnownHostsFile=${file}`];
}

/**
 * A path as the value of an option that takes a LIST of files, so that `ssh` reads one file.
 *
 * <p>`ssh` splits the value of both known-hosts options at white space. Measured 2026-11-17 against a real `sshd` (OpenSSH
 * 10.2p1, loopback): a pin file at a bare path with a space is two names, neither is the file, and the call ends with `Host key
 * verification failed.`; in double quotes it is one file and the login is accepted. `ssh -G` of OpenSSH_for_Windows 9.5p2
 * resolves the quoted word to one file too (the client alone; no login was made on Windows).</p>
 *
 * <p>A path with no white space is written as it is, byte for byte.</p>
 *
 * <p>A path that holds a double quote is not written at all. The quote would end the quoted word, two of them can split the path
 * in two, and an `ssh` older than 8.7 knows no escape for it (read, not measured). The answer is {@link NO_KEY_FILE}: with strict
 * checking and no key in either list `ssh` refuses every host (measured as above: `No ED25519 host key is known`, exit code
 * 255, also under a config that trusts the host's key). The call fails; it never trusts a file the pin did not name. Windows
 * allows no double quote in a path, so this is a POSIX case.</p>
 */
function oneFileWord(file: string): string {
  if (file.includes('"')) {
    return NO_KEY_FILE;
  }
  return /\s/.test(file) ? `"${file}"` : file;
}
```

**Why each line is as it is.**

- **One function, three answers, all of them words.** No pin file: one pair, `accept-new`, today's word. A pin file: the six
  words. A pin file whose path holds a double quote: the six words too, with `/dev/null` as the file. The return type is
  `string[]`. A builder cannot forget a branch, because there is none.
- **Why the pin file as `GlobalKnownHostsFile` too, and not `/dev/null` there.** The parent's §3.9: the same path twice needs no
  name for "no file" that differs between the platforms. K6 (d) and K7 measured it.
- **Why double quotes for white space, and only for white space.** The parent fixes it: a path with no white space is written as
  today, byte for byte; a path with white space goes in double quotes (its rows 6 and 7; K6 a and b). `\s` of JavaScript is wider
  than what `ssh` splits at; a quoted word that did not need its quotes is still one file.
- **Why a path with a double quote is not written, in any spelling.** The parent asks that such a path never reaches `ssh` as two
  paths. Bare or quoted, a current client answers `invalid quotes` or reads another path (K8 g). The escape `\"` resolves on the
  two clients measured, and an older client does not know it (K8, not measured), so no spelling is one file for every `ssh`.
  What remains is to refuse. `NO_KEY_FILE` refuses inside the words: strict checking against a file that holds no key ends every
  call with `Host key verification failed.` (K6 f). The other way, a new `undefined` from the builders, would need every caller
  to handle it, and one caller casts the answer (K4): a fail-closed that depends on six call sites is the pattern that
  `security.md` names (*a measure applied at some of its sites*). The cost: the call makes a connection and a key exchange
  before `ssh` refuses, and on the three roads E1.S3 will show sentence C for it, which names the host's key and not the folder.
  Accepted: the case needs a double quote in the path of the editor's storage folder, on POSIX (Windows allows none).
- **`/dev/null` on Windows.** The case cannot arise there. `ssh.exe -G` resolves the word as it is (9.5p2); what it opens was
  not measured.

## 2. The product: `sshExecCommand.ts`

```diff
@@ -1,3 +1,4 @@
+import { hostKeyWords } from './hostKeyPin';
 import { EntityMetadata } from './types';
 import { DEFAULT_SSH_PORT, isSafeSshTarget } from './sshCommand';
 import { sshOptionArgv } from './sshOptions';
@@ -169,13 +170,8 @@
   ];
   // A pinned key is enforced here exactly as on the human path (audit B10): with a pin, a
   // changed host key fails the call instead of being accepted silently. An agent's exec is
-  // precisely where nobody is watching a warning scroll past.
-  argv.push(
-    ...(options.knownHostsFile === undefined
-      ? ['-o', 'StrictHostKeyChecking=accept-new']
-      : ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${options.knownHostsFile}`]),
-    '-o', 'ConnectTimeout=10',
-  );
+  // precisely where nobody is watching a warning scroll past. The words are `hostKeyWords`'s.
+  argv.push(...hostKeyWords(options.knownHostsFile), '-o', 'ConnectTimeout=10');
   // The same shared composer the human path uses — see `sshOptions.ts`. A bridged call is one fresh connection: the composer gets the
   // entry with its forwards and `-A` off, and BRIDGED_SSH_OPTIONS tells ssh to share no connection and clear what a config file adds.
   // `-A` would win over `-o ForwardAgent=no` in either order (S3.14 item 3), so the entry's own flag is taken away, not out-voted.
```

The comment keeps its three lines and gains one sentence. It names the function and no option with `=`.

## 3. The product: `sshBridge.ts`

```diff
@@ -1,3 +1,4 @@
+import { hostKeyWords } from './hostKeyPin';
 import { NO_CONNECTION_SHARING, SshExecAuth } from './sshExecCommand';
 import { EntityMetadata } from './types';
 
@@ -179,13 +180,6 @@
   ...NO_CONNECTION_SHARING,
 ];
 
-/** A pinned host key when the entity has one; otherwise trust on first use, as the exec path does. */
-function hostKeyArgv(knownHostsFile: string | undefined): string[] {
-  return knownHostsFile === undefined
-    ? ['-o', 'StrictHostKeyChecking=accept-new']
-    : ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${knownHostsFile}`];
-}
-
 function keyArgv(keyPath: string | undefined): string[] {
   return keyPath !== undefined && keyPath.length > 0 ? ['-i', keyPath] : [];
 }
@@ -229,7 +223,9 @@
   return [
     ...authArgv(options.auth ?? 'key'),
     ...FIXED_OPTIONS,
-    ...hostKeyArgv(options.knownHostsFile),
+    // A pinned host key when the entity has one; otherwise trust on first use, as the exec path does. Before `-N`, `-R` and every
+    // word of `extra`: `ssh` takes the first value of an option, so a caller's host-key word comes too late.
+    ...hostKeyWords(options.knownHostsFile),
     // No shell, no command: this connection exists only to carry the forward.
     '-N',
     '-R', `${options.remote.path}:127.0.0.1:${options.port}`,
```

`hostKeyArgv` goes: it would be a second name for one call. The comment moves to the call, and says why the place matters.

## 4. The helper of the tests: new `test/pinnedArgv.ts`

The whole file. `noSharingArgv.ts` of G2 is its pattern. E1.S3's tests can ask "the same file as both" with `valuesOf`.

```ts
/**
 * What the tests of G1 ask of an `ssh` argv about the host's key (`PLAN_person_roads_pin_host_key.md` §3.9 and §5, test 13): which
 * words say how the key is checked, and which file they name. Shared by `hostKeyWords.test.ts` and `sshExecCommand.test.ts`, so
 * they ask the same question.
 *
 * <p>These say what is SENT. What the client resolves from the words is asked of a real `ssh -G` (`hostKeyWords.test.ts`). What a
 * real `sshd` then gets is not asked by any test that uses this file.</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

/** The three options of a host-key check, in the order a pinned call says them. */
export const HOST_KEY_OPTIONS: readonly string[] = ['StrictHostKeyChecking', 'UserKnownHostsFile', 'GlobalKnownHostsFile'];

/** One `Name=value` that an argv gives `ssh` with `-o`, and where its first word stands. */
interface OptionWord {
  readonly at: number;
  readonly words: readonly string[];
  readonly text: string;
}

/** The words before `--`: behind it stand the destination and the remote command, which are no options. */
const beforeTheTarget = (argv: readonly string[]): readonly string[] => argv.slice(0, argv.includes('--') ? argv.indexOf('--') : argv.length);

/** Every `-o Name=value` before `--`, also in the one-word spelling (`-oName=value`). */
function optionWords(argv: readonly string[]): OptionWord[] {
  const words = beforeTheTarget(argv);
  return words.flatMap((word, i): OptionWord[] => {
    if (words[i - 1] === '-o') {
      return [{ at: i - 1, words: ['-o', word], text: word }];
    }
    return word.startsWith('-o') && word.length > 2 ? [{ at: i, words: [word], text: word.slice(2) }] : [];
  });
}

/** `ssh` reads an option's name without regard to case. */
const names = (text: string, name: string): boolean => text.toLowerCase().startsWith(`${name.toLowerCase()}=`);

/** Every value the argv gives the option `name`, in the order of the argv. `ssh` takes the first. */
export const valuesOf = (argv: readonly string[], name: string): string[] =>
  optionWords(argv).filter((option) => names(option.text, name)).map((option) => option.text.slice(name.length + 1));

/** The words of the argv that name one of the three options, in the order of the argv. */
export const hostKeyWordsOf = (argv: readonly string[]): string[] =>
  optionWords(argv).filter((option) => HOST_KEY_OPTIONS.some((name) => names(option.text, name))).flatMap((option) => [...option.words]);

/** Where the last word of the host-key words stands, or -1 when the argv has none. */
export const lastHostKeyWordAt = (argv: readonly string[]): number =>
  Math.max(-1, ...optionWords(argv).filter((option) => HOST_KEY_OPTIONS.some((name) => names(option.text, name))).map((option) => option.at + option.words.length - 1));

/** The argv with every `GlobalKnownHostsFile` word taken out: what a builder sent before G1. */
export function withoutGlobal(argv: readonly string[]): string[] {
  const gone = new Set(optionWords(argv).filter((option) => names(option.text, 'GlobalKnownHostsFile')).flatMap((option) => option.words.map((_, i) => option.at + i)));
  return argv.filter((_, i) => !gone.has(i));
}
```

## 5. New `test/hostKeyWords.test.ts`

The whole file, 15 tests. Written FIRST, on the unchanged product, and watched there (§7).

```ts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type TestContext, test } from 'node:test';
import { ownedFile } from '../../scripts/lib/leftovers.cjs';
import * as hostKeyPin from '../hostKeyPin';
import { buildBridgeArgv } from '../sshBridge';
import { type SshExecAuth, type SshExecOptions, buildSshExecArgv } from '../sshExecCommand';
import { EntityMetadata } from '../types';
import { fakePath } from './fakePaths';
import { importedUses } from './funnelScan';
import { hostKeyWordsOf, lastHostKeyWordAt, valuesOf, withoutGlobal } from './pinnedArgv';
import { discoverSources } from './tempSiteScan';

/**
 * G1, E1.S1 (`PLAN_person_roads_pin_host_key.md` §3.9 and §5, tests 13 and 14): the words of a pinned call come from one function.
 *
 * <p><b>Part 1 is what is SENT.</b> Both argv builders say `StrictHostKeyChecking=yes` and the pin file as `UserKnownHostsFile` AND as
 * `GlobalKnownHostsFile`; a path with white space is one quoted word; a path with a double quote is not named at all.</p>
 *
 * <p><b>Part 2 asks the real client.</b> The PATH's `ssh -G` resolves each argv under a config that names other known-hosts files and
 * prints what is IN EFFECT. `-G` connects to nothing. It shows what one client resolves. That a host with another key is then
 * refused was measured by hand against a real `sshd` (the docblock of `hostKeyWords`); no test of this file shows it.</p>
 *
 * <p><b>Part 3 is the list of places</b> that write these words.</p>
 */

const PIN = fakePath('keys/4242/known_hosts-e1-0b6f3c1e');
/** As on macOS, where the editor's storage folder is under `Application Support`. */
const SPACED = fakePath('Application Support/Code/keys/4242/known_hosts-e1-0b6f3c1e');
const TABBED = fakePath('a\tb/known_hosts-e1');
const QUOTED_TWICE = fakePath('a"b c"d/known_hosts-e1');
const QUOTED_ONCE = fakePath('a"b/known_hosts-e1');
const KEY = fakePath('k.key');

const HOST: EntityMetadata = { id: 'e1', name: 'build box', host: 'build.example.com', user: 'dev', isSshEnabled: true };
/** An entry that adds every word the shared composer can add: `-A`, a forward, a port. */
const BUSY: EntityMetadata = { ...HOST, port: 2222, agentForward: true, portForwards: [{ kind: 'local', bindPort: 8080, host: 'localhost', hostPort: 80 }] };

/** What a caller could put into `extra` to switch the check off. `ssh` takes the FIRST value of an option, and the builder's stand first. */
const HOSTILE_EXTRA = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'GlobalKnownHostsFile=/dev/null'];

type Argv = string[] | undefined;

const run = (pin: string | undefined, auth: SshExecAuth, options: SshExecOptions = {}, entity: EntityMetadata = HOST): Argv =>
  buildSshExecArgv(entity, KEY, 'id', auth, { ...options, knownHostsFile: pin });

const tunnel = (pin: string | undefined, auth: SshExecAuth, extra: readonly string[] = []): Argv =>
  buildBridgeArgv(HOST, { port: 51234, remote: { path: '/tmp/creds-dev-abc.sock' }, auth, extra, keyPath: KEY, knownHostsFile: pin }, () => true);

/** Every kind of argv the extension starts an `ssh` with, for one pin file (or none). No kind has a caller's `extra`. */
const everyKind = (pin: string | undefined): readonly (readonly [string, Argv])[] => [
  ['the tunnel of a bridge, a key', tunnel(pin, 'key')],
  ['the tunnel of a bridge, a password', tunnel(pin, 'askpass')],
  ['a run off a bridge, a key', run(pin, 'key')],
  ['a run off a bridge, a password', run(pin, 'askpass')],
  ['a run off a bridge: a jump host, no pty, the agent taken away, a forward, a port', run(pin, 'key', { jump: 'hop@jump.example.com', noTty: true, ownAgent: false }, BUSY)],
  ['a bridged run, a key', run(pin, 'key', { bridged: true })],
  ['a bridged run, a password', run(pin, 'askpass', { bridged: true }, BUSY)],
];

/** The argv of each kind; a kind whose builder answered none fails here, by its name. */
function argvs(pin: string | undefined): (readonly [string, string[]])[] {
  return everyKind(pin).map(([name, argv]) => {
    assert.ok(argv !== undefined, `${name}: expected an argv`);
    return [name, argv] as const;
  });
}

/** The six words of a pinned call, for the word that names the file. */
const pinned = (file: string): string[] => ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${file}`, '-o', `GlobalKnownHostsFile=${file}`];

const UNPINNED = ['-o', 'StrictHostKeyChecking=accept-new'];

/** What stands in for a pin file that cannot be named: it holds no key, so `ssh` refuses every host. */
const NO_KEY_FILE = '/dev/null';

/* --- part 1: what is sent --- */

test('G1: a pinned argv of both builders names the pin file as BOTH known-hosts files, side by side, and no other host-key word', () => {
  for (const [name, argv] of argvs(PIN)) {
    const at = argv.indexOf('StrictHostKeyChecking=yes') - 1;
    assert.deepEqual(argv.slice(at, at + 6), pinned(PIN), `${name}: the three options do not stand side by side`);
    assert.deepEqual(hostKeyWordsOf(argv), pinned(PIN), name);
  }
});

test('G1: a pin file whose path holds white space is ONE quoted word, the same in both options', () => {
  for (const file of [SPACED, TABBED]) {
    for (const [name, argv] of argvs(file)) {
      assert.deepEqual(hostKeyWordsOf(argv), pinned(`"${file}"`), `${name}: ssh would read this path as two files`);
    }
  }
});

test('G1: a pin file whose path holds a double quote is not named at all: both options name a file that holds no key, and the check stays strict', () => {
  for (const file of [QUOTED_TWICE, QUOTED_ONCE]) {
    for (const [name, argv] of argvs(file)) {
      assert.deepEqual(hostKeyWordsOf(argv), pinned(NO_KEY_FILE), `${name}: ${file} reached ssh`);
    }
  }
});

test('G1: a caller\'s own host-key words in extra come too late: the builder\'s stand first, and ssh takes the first', () => {
  const argv = tunnel(PIN, 'key', HOSTILE_EXTRA) ?? [];
  assert.deepEqual(valuesOf(argv, 'StrictHostKeyChecking'), ['yes', 'no']);
  assert.deepEqual(valuesOf(argv, 'UserKnownHostsFile'), [PIN, '/dev/null']);
  assert.deepEqual(valuesOf(argv, 'GlobalKnownHostsFile'), [PIN, '/dev/null']);
});

/** The function, read through the module object: this file compiles before the function exists, so its absence is a failed assertion. */
function theFunction(): (pinFile: string | undefined) => string[] {
  const found = (hostKeyPin as Record<string, unknown>).hostKeyWords;
  assert.equal(typeof found, 'function', 'hostKeyPin.ts exports no hostKeyWords');
  return found as (pinFile: string | undefined) => string[];
}

test('G1: one function writes the words: its four answers', () => {
  const hostKeyWords = theFunction();
  assert.deepEqual(hostKeyWords(undefined), UNPINNED);
  assert.deepEqual(hostKeyWords(PIN), pinned(PIN));
  assert.deepEqual(hostKeyWords(SPACED), pinned(`"${SPACED}"`));
  assert.deepEqual(hostKeyWords(QUOTED_TWICE), pinned(NO_KEY_FILE));
});

test('G1: and both builders say exactly what it answers', () => {
  const hostKeyWords = theFunction();
  for (const file of [undefined, PIN, SPACED, QUOTED_TWICE]) {
    for (const [name, argv] of argvs(file)) {
      assert.deepEqual(hostKeyWordsOf(argv), hostKeyWords(file), `${name}, ${file ?? 'no pin'}`);
    }
  }
});

test('an unpinned argv says accept-new and names no known-hosts file', () => {
  for (const [name, argv] of argvs(undefined)) {
    assert.deepEqual(hostKeyWordsOf(argv), UNPINNED, name);
  }
});

/** Copied from the output of `main` at ca99cd91 (after G2, before G1), for the pin file `PIN`. */
const RUN_BEFORE_G1 = [
  '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${PIN}`, '-o', 'ConnectTimeout=10',
  '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-i', KEY, '--', 'dev@build.example.com', 'id',
];
const TUNNEL_BEFORE_G1 = [
  '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=10',
  '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${PIN}`,
  '-N', '-R', '/tmp/creds-dev-abc.sock:127.0.0.1:51234', '-i', KEY, '--', 'dev@build.example.com',
];

test('a pin file whose path holds no white space is the word of before G1, byte for byte: only the third option is new', () => {
  assert.deepEqual(withoutGlobal(run(PIN, 'key') ?? []), RUN_BEFORE_G1);
  assert.deepEqual(withoutGlobal(tunnel(PIN, 'key') ?? []), TUNNEL_BEFORE_G1);
});

/** The words behind which a host-key option would come too late, or would be the entry's or a caller's. */
const LATER = ['-J', '-A', '-L', '-N', '-R', '-i', '-p', '--'];

test('the host-key words stand before every word that the entry or a caller adds', () => {
  for (const [name, argv] of argvs(PIN)) {
    const own = withoutGlobal(argv); // the third option stands beside the second: the first test of this file
    const later = Math.min(...LATER.map((word) => own.indexOf(word)).filter((at) => at !== -1));
    assert.ok(lastHostKeyWordAt(own) !== -1 && lastHostKeyWordAt(own) < later, `${name}: ${own.join(' ')}`);
  }
});

/* --- part 2: the real client --- */

const OTHER_USER_FILE = fakePath('other/user_known_hosts');
const OTHER_SYSTEM_FILE = fakePath('other/system_known_hosts');

/** A config that trusts other files and checks nothing: what the words of a pinned call have to win against. */
const OTHER_FILES_CONFIG = `Host *\n  StrictHostKeyChecking no\n  UserKnownHostsFile ${OTHER_USER_FILE}\n  GlobalKnownHostsFile ${OTHER_SYSTEM_FILE}\n`;

/** With a `~` after the space: `ssh` expands a `~` only at the start of a file name, so a path that was split in two shows it. */
const SPACE_THEN_TILDE = fakePath('a ~/known_hosts-e1');

// The PATH lookup is on purpose: the PATH's ssh is the client the extension starts, and it is the thing asked here.
const ssh = (args: readonly string[]) => spawnSync('ssh', [...args], { encoding: 'utf8', timeout: 15_000 }); // NOSONAR: the PATH's ssh is the subject

const HAS_SSH = ssh(['-V']).error === undefined;

/** Locally a machine with no ssh skips, with the reason; where CI=true nothing skips, so a missing ssh fails. */
const NEEDS_SSH = { skip: HAS_SSH || process.env.CI === 'true' ? false : 'no ssh on the PATH' };

/** What `ssh -G` answers for `argv` under a config file of this test that holds `config`. */
function asked(t: TestContext, config: string, argv: readonly string[]): ReturnType<typeof ssh> {
  const file = ownedFile(t, 'hkw', 'ssh_config');
  fs.writeFileSync(file, config);
  return ssh(['-G', '-F', file, ...argv]);
}

/** The three lines `ssh -G` prints about the host-key check for `argv`, under the config that names other files. */
function resolved(t: TestContext, argv: readonly string[]): string[] {
  const answer = asked(t, OTHER_FILES_CONFIG, argv);
  assert.equal(answer.status, 0, `ssh -G did not resolve the argv: ${answer.error ?? answer.stderr}`);
  return answer.stdout.split(/\r?\n/).filter((line) => /^(stricthostkeychecking|userknownhostsfile|globalknownhostsfile) /.test(line)).sort();
}

/** What `ssh -G` prints when the check is strict and `file` is the only known-hosts file of both lists. */
const onlyFile = (file: string): string[] => [`globalknownhostsfile ${file}`, 'stricthostkeychecking true', `userknownhostsfile ${file}`];

test('G1: under a config that names other known-hosts files, the real ssh resolves every pinned argv to the pin file alone', NEEDS_SSH, (t) => {
  for (const [name, argv] of [...argvs(PIN), ['the tunnel with a caller\'s hostile extra', tunnel(PIN, 'key', HOSTILE_EXTRA) ?? []] as const]) {
    assert.deepEqual(resolved(t, argv), onlyFile(PIN), name);
  }
});

test('G1: the real ssh reads a pin file whose path holds white space as ONE file', NEEDS_SSH, (t) => {
  for (const [name, argv] of argvs(SPACE_THEN_TILDE)) {
    assert.deepEqual(resolved(t, argv), onlyFile(SPACE_THEN_TILDE), name);
  }
});

test('G1: for a pin file whose path holds a double quote the real ssh resolves a strict check against the file that holds no key', NEEDS_SSH, (t) => {
  for (const [name, argv] of argvs(QUOTED_TWICE)) {
    assert.deepEqual(resolved(t, argv), onlyFile(NO_KEY_FILE), name);
  }
});

test('the control: the same path as a bare word is read as two files, so the test above can show the fault', NEEDS_SSH, (t) => {
  const bare = ['-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${SPACE_THEN_TILDE}`, '--', 'dev@build.example.com'];
  const answer = asked(t, '', bare);
  const user = answer.stdout.split(/\r?\n/).filter((line) => line.startsWith('userknownhostsfile '));
  // POSIX: two names, the second with its `~` expanded. Win32-OpenSSH 9.5: no line at all, `tilde_expand: No such user`.
  assert.notDeepEqual(user, [`userknownhostsfile ${SPACE_THEN_TILDE}`], `the bare word was read as one file: ${answer.stderr}`);
});

/* --- part 3: the places --- */

const SRC = path.resolve(__dirname, '..', '..', 'src');

/** Every shipped source file. The tests write such words of their own. */
const SOURCES = discoverSources(SRC, new Map([['test', 'the tests are not shipped: they write option words of their own']]));

const read = (file: string): string => fs.readFileSync(path.join(SRC, file), 'utf8');

/** Each file that holds a match of `pattern`, once, sorted. Comments are read too. */
const filesWith = (pattern: RegExp): string[] => SOURCES.filter((file) => pattern.test(read(file)));

/** `file#function` of every reference to `name` imported from the module `from`, sorted. */
const usesOf = (name: string, from: string): string[] =>
  SOURCES.flatMap((file) => importedUses(file, read(file), name, from).map((use) => `${file}#${use.within}`)).sort();

const HOW_TO_FIX =
  'a place that writes a known-hosts option, or strict checking, was added, moved or renamed. The words of a pinned call come from hostKeyWords (hostKeyPin.ts). Then edit this list in the same commit';

test('G1: the known-hosts options and strict checking are spelled in one function, and at the reviewed place of Connect\'s line', () => {
  assert.ok(SOURCES.length > 100, `the discovery found only ${SOURCES.length} files`);
  // `Name=value` only: prose may name an option (`UserKnownHostsFile`). `sshCommand.ts` is the line of a Connect terminal, shell words
  // per platform: it says the pin as the person's file only, until candidate C4 of the plan gives it these words.
  assert.deepEqual(filesWith(/UserKnownHostsFile\s*=/), ['hostKeyPin.ts', 'sshCommand.ts'], HOW_TO_FIX);
  assert.deepEqual(filesWith(/StrictHostKeyChecking\s*=\s*yes/), ['hostKeyPin.ts', 'sshCommand.ts'], HOW_TO_FIX);
  assert.deepEqual(filesWith(/GlobalKnownHostsFile\s*=/), ['hostKeyPin.ts'], HOW_TO_FIX);
});

test('G1: and that function is called by the two argv builders, and by nothing else', () => {
  assert.deepEqual(usesOf('hostKeyWords', 'hostKeyPin'), ['sshBridge.ts#buildBridgeArgv', 'sshExecCommand.ts#buildSshExecArgv'], HOW_TO_FIX);
});
```

| # | Test (its name starts with) | RED first? | What it holds |
|---|---|---|---|
| R1 | `G1: a pinned argv of both builders names the pin file as BOTH…` | RED | the six words stand side by side in each of the 7 kinds of argv, and no other word of the argv names one of the three options |
| R2 | `G1: a pin file whose path holds white space is ONE quoted word…` | RED | a space and a tab: `"<path>"`, the same word in both options, in each kind |
| R3 | `G1: a pin file whose path holds a double quote is not named at all…` | RED | two paths, with two double quotes and with one: the six words with `/dev/null`, in each kind |
| R4 | `G1: a caller's own host-key words in extra come too late…` | RED | for each option the builder's value is the FIRST of the argv, the caller's the second |
| R5 | `G1: one function writes the words: its four answers` | RED | the export exists; its answers for no pin, a plain path, a path with a space, a path with a double quote, as literals |
| R6 | `G1: and both builders say exactly what it answers` | RED | for no pin and three pin files, each kind's host-key words ARE the function's answer |
| U1 | `an unpinned argv says accept-new…` | green before and after | an unpinned argv has the one pair and no known-hosts word |
| U2 | `a pin file whose path holds no white space is the word of before G1…` | green before and after | two whole argvs as literals copied from `main`: with G1's pair taken out, nothing else differs |
| U3 | `the host-key words stand before every word that the entry or a caller adds` | green before and after | in each kind the last host-key word stands before `-J`, `-A`, `-L`, `-N`, `-R`, `-i`, `-p`, `--` |
| R7 | `G1: under a config that names other known-hosts files, the real ssh resolves…` | RED | `ssh -G`, a config with other files and `StrictHostKeyChecking no`: strict, and the pin file alone in both lists, for each kind and for a tunnel with a caller's hostile `extra` |
| R8 | `G1: the real ssh reads a pin file whose path holds white space as ONE file` | RED | `ssh -G`, a path with ` ~` after the space: the name as it is, not split |
| R9 | `G1: for a pin file whose path holds a double quote the real ssh resolves…` | RED | `ssh -G`: strict, and `/dev/null` alone in both lists |
| U4 | `the control: the same path as a bare word is read as two files…` | green before and after | the bare word IS split by this client, so R8 can show the fault |
| R10 | `G1: the known-hosts options and strict checking are spelled in one function…` | RED | the files of `src/` (tests left out, comments read) that spell `UserKnownHostsFile=`, `StrictHostKeyChecking=yes`, `GlobalKnownHostsFile=`: `hostKeyPin.ts`, and `sshCommand.ts` for the first two |
| R11 | `G1: and that function is called by the two argv builders, and by nothing else` | RED | `hostKeyWords` is used in `sshBridge.ts#buildBridgeArgv` and `sshExecCommand.ts#buildSshExecArgv` |

R10 is the parent's test 14: written before the change, its first run names today's three places (§7). It holds both places, so
it cannot pass by matching nothing; `SOURCES.length > 100` holds the discovery. R7 to R9 are not in the parent's list: they are
what `security.md` asks for (*a test that asserts presence, not effect*), one step short of a server. They need an `ssh` client:
locally a machine without one skips them with the reason, and where `CI=true` they run or fail.

## 6. `test/sshExecCommand.test.ts`: the one expectation that changes (the parent's test 12)

G2's test holds a whole pinned bridged argv as a literal (`:316-321`). A pinned bridged call gets G1's pair like every pinned
call. The literal stays as G2 copied it; the test takes G1's one pair out before it compares, so it still says that nothing
else of a bridged argv moved. Where the pair stands is R1's.

```diff
@@ -11,6 +11,7 @@
 import { EntityMetadata } from '../types';
 import { KEY_FILE } from './fakePaths';
 import { TWO, saysNoSharingBefore, sharingWords } from './noSharingArgv';
+import { withoutGlobal } from './pinnedArgv';
 
 const entity = (over: Partial<EntityMetadata> = {}): EntityMetadata => ({
   id: 'e1',
@@ -325,8 +326,10 @@
   '--', 'deploy@example.com', 'id',
 ];
 
-test('G2: a bridged argv is byte for byte the one before G2', () => {
+test('G2: a bridged argv is byte for byte the one before G2 (the one pair that G1 added to a pinned call taken out)', () => {
   const pinned = { jump: 'hop@jump.example.com', bridged: true, noTty: true, knownHostsFile: '/keys/known_hosts' };
-  assert.deepEqual(argvWith({ ...everything, port: 2222 }, pinned, 'key', KEY_FILE), BRIDGED_KEY_BEFORE_G2);
+  // G1 (E1.S1) names the pin file as the system-wide known-hosts file too: one pair more on a pinned call, bridged or not.
+  // `hostKeyWords.test.ts` says where it stands. Without it the argv is the one before G2.
+  assert.deepEqual(withoutGlobal(argvWith({ ...everything, port: 2222 }, pinned, 'key', KEY_FILE)), BRIDGED_KEY_BEFORE_G2);
   assert.deepEqual(argvWith(entity(), { bridged: true }, 'askpass'), BRIDGED_ASKPASS_BEFORE_G2);
 });
```

U5 is this test. It is green on the unchanged product too (there is no pair to take out), and green after §1 to §3. With the
edit left out it is RED after §1 to §3: that was watched (K10; the whole suite then had this one failure of its own).

Every other test of the ten files of the commands passes unchanged (K10 c): they build their expected argv with the builder
itself or look for single words.

## 7. The RED texts (the unchanged product, K10 b)

`node --test out/test/hostKeyWords.test.js out/test/sshExecCommand.test.js` on the unchanged product: 37 tests, 26 pass, 11 fail.
The first lines of each failure, as the runner printed them (`<home>` stands for the home folder of the machine):

```text
✖ G1: a pinned argv of both builders names the pin file as BOTH known-hosts files, side by side, and no other host-key word
  AssertionError [ERR_ASSERTION]: the tunnel of a bridge, a key: the three options do not stand side by side
      'UserKnownHostsFile=/nonexistent/creds-test/keys/4242/known_hosts-e1-0b6f3c1e',
  +   '-N',
  +   '-R'
  -   '-o',
  -   'GlobalKnownHostsFile=/nonexistent/creds-test/keys/4242/known_hosts-e1-0b6f3c1e'
✖ G1: a pin file whose path holds white space is ONE quoted word, the same in both options
  AssertionError [ERR_ASSERTION]: the tunnel of a bridge, a key: ssh would read this path as two files
  +   'UserKnownHostsFile=/nonexistent/creds-test/Application Support/Code/keys/4242/known_hosts-e1-0b6f3c1e'
  -   'UserKnownHostsFile="/nonexistent/creds-test/Application Support/Code/keys/4242/known_hosts-e1-0b6f3c1e"',
  -   '-o',
  -   'GlobalKnownHostsFile="/nonexistent/creds-test/Application Support/Code/keys/4242/known_hosts-e1-0b6f3c1e"'
✖ G1: a pin file whose path holds a double quote is not named at all: both options name a file that holds no key, and the check stays strict
  AssertionError [ERR_ASSERTION]: the tunnel of a bridge, a key: /nonexistent/creds-test/a"b c"d/known_hosts-e1 reached ssh
  +   'UserKnownHostsFile=/nonexistent/creds-test/a"b c"d/known_hosts-e1'
  -   'UserKnownHostsFile=/dev/null',
  -   '-o',
  -   'GlobalKnownHostsFile=/dev/null'
✖ G1: a caller's own host-key words in extra come too late: the builder's stand first, and ssh takes the first
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  -   '/nonexistent/creds-test/keys/4242/known_hosts-e1-0b6f3c1e',
      '/dev/null'
✖ G1: one function writes the words: its four answers
  AssertionError [ERR_ASSERTION]: hostKeyPin.ts exports no hostKeyWords
✖ G1: and both builders say exactly what it answers
  AssertionError [ERR_ASSERTION]: hostKeyPin.ts exports no hostKeyWords
✖ G1: under a config that names other known-hosts files, the real ssh resolves every pinned argv to the pin file alone
  AssertionError [ERR_ASSERTION]: the tunnel of a bridge, a key
  +   'globalknownhostsfile /nonexistent/creds-test/other/system_known_hosts',
  -   'globalknownhostsfile /nonexistent/creds-test/keys/4242/known_hosts-e1-0b6f3c1e',
      'stricthostkeychecking true',
      'userknownhostsfile /nonexistent/creds-test/keys/4242/known_hosts-e1-0b6f3c1e'
✖ G1: the real ssh reads a pin file whose path holds white space as ONE file
  AssertionError [ERR_ASSERTION]: the tunnel of a bridge, a key
  +   'globalknownhostsfile /nonexistent/creds-test/other/system_known_hosts',
  -   'globalknownhostsfile /nonexistent/creds-test/a ~/known_hosts-e1',
      'stricthostkeychecking true',
  +   'userknownhostsfile /nonexistent/creds-test/a <home>/known_hosts-e1'
  -   'userknownhostsfile /nonexistent/creds-test/a ~/known_hosts-e1'
✖ G1: for a pin file whose path holds a double quote the real ssh resolves a strict check against the file that holds no key
  AssertionError [ERR_ASSERTION]: the tunnel of a bridge, a key
  +   'globalknownhostsfile /nonexistent/creds-test/other/system_known_hosts',
  -   'globalknownhostsfile /dev/null',
      'stricthostkeychecking true',
  +   'userknownhostsfile /nonexistent/creds-test/ab cd/known_hosts-e1'
  -   'userknownhostsfile /dev/null'
✖ G1: the known-hosts options and strict checking are spelled in one function, and at the reviewed place of Connect's line
  AssertionError [ERR_ASSERTION]: a place that writes a known-hosts option, or strict checking, was added, moved or renamed. […]
  +   'sshBridge.ts',
  -   'hostKeyPin.ts',
      'sshCommand.ts',
  +   'sshExecCommand.ts'
✖ G1: and that function is called by the two argv builders, and by nothing else
  AssertionError [ERR_ASSERTION]: a place that writes a known-hosts option, or strict checking, was added, moved or renamed. […]
  + []
  - [
  -   'sshBridge.ts#buildBridgeArgv',
  -   'sshExecCommand.ts#buildSshExecArgv'
  - ]
```

Each is the right reason: no argv names `GlobalKnownHostsFile` today (the parent's test 13, "RED first"); a path with white space
is bare; a path with a double quote reaches `ssh`; the function does not exist; the real client resolves the system-wide list
to the config's file; the scan names today's three places. The coder's own RED run must show these eleven and no other. A
different text, or a twelfth failure, is a reason to stop.

## 8. The documents of this story

**8.1 `src_vs_code/CHANGELOG.md`, under `## [Unreleased]`,** a new entry above G2's. It is the second half of the security entry
of the parent's §6; E1.S2 and E1.S3 add their clauses to it. No version heading: the release writes it.

```markdown
### Changed — security: a saved host key is the only key a call without a terminal accepts

An SSH entry can hold a saved host key (you confirmed its fingerprint with *Trust and connect*). On every call that the extension
starts for such an entry without a terminal (an agent's `ssh:exec` and its run over SSH, *Run with Secrets* over SSH), `ssh` now
gets the saved key as its ONLY known-hosts file. Before, it got the saved key as your own known-hosts file, and still read the
system-wide ones (`/etc/ssh/ssh_known_hosts`): a key that such a file listed for the host was accepted beside the saved one.
Measured (OpenSSH 10.2p1 on both ends, loopback): with another key saved and the host's real key in a system-wide file, the
login was accepted before and now ends with `Host key verification failed`. What is not covered yet: your own terminal,
*Connect via SSH*, still reads the system-wide files beside the saved key; and a `KnownHostsCommand` or `VerifyHostKeyDNS` in
your own `ssh` config is still asked.

And a storage folder whose path holds a space no longer breaks these calls. `ssh` read such a path as two file names, found the
saved key in neither, and refused the host. This is the usual place of the editor's storage on macOS (`Application Support`).

An entry with no saved host key connects as before.
```

**8.2 `research/module_extension.md`, the paragraph "B10 — the host key" (`:5196-5213`).** After its last sentence ("A pin that
already exists is enforced on both."), one new paragraph:

```markdown
**The words of a pinned call (G1, E1.S1).** A call that the extension starts with no terminal says its host-key check with words
from ONE function, `hostKeyWords` in `hostKeyPin.ts`; both argv builders call it (`buildSshExecArgv`, `buildBridgeArgv`). With no
pin file it answers `-o StrictHostKeyChecking=accept-new`. With a pin file it answers strict checking and that file as
`UserKnownHostsFile` AND as `GlobalKnownHostsFile`, because the first replaces only the person's own files and `ssh` read the
system-wide ones beside the pin. A path with white space goes in double quotes (both options take a list of files); a path that
holds a double quote is not written, and both options then name `/dev/null`, so `ssh` refuses every host. Measured by hand
against a real `sshd` (OpenSSH 10.2p1, loopback, 2026-11-17): the conditions and the results are in the docblock of the
function. The line of a Connect terminal (`sshCommand.ts`) is not among them yet: it names the pin as the person's file only.
`KnownHostsCommand` and `VerifyHostKeyDNS` of a person's config are not switched off.
```

`research/module_tests.md` is not in this story: the stories document begins that section in E1.S2. See *Notes for the lead*.

## 9. Order of work, and the commit

1. `test/pinnedArgv.ts`, `test/hostKeyWords.test.ts`, the edit of `test/sshExecCommand.test.ts` (§4 to §6). Compile (exit 0). Run
   the two test files: the eleven RED texts of §7, U1 to U5 green. Save the output.
2. §1, §2, §3. Compile (exit 0). The ten files: 195 tests, 194 pass, 0 fail, 1 skipped.
3. The mutation checks of §10, one at a time, each restored.
4. §8. `npm run typecheck`, `npm run lint`, `npm test`.
5. One commit: `fix(ssh): G1 E1.S1 — a pinned call names its pin file as both known-hosts files, from one function`. Its body:
   what was observed (the RED texts, the counts of items 2 and 4, each mutation with what it turned red), that the one changed
   expectation is G2's test of the bridged literals and why, and what is not measured (§14). `node
   .agents/conventions/tools/plan-lifecycle.mjs .` and `node .github/scripts/public-hygiene.mjs` clean.

## 10. The mutation checks (each one must turn the named tests red; restore after each one)

Measured on the scratch copy, on the product of §1 to §3, with the ten files of the commands (195 tests; `tsc` exit 0 for each).
The last column lists every test that failed, by its name in §5 and §6; an existing test is quoted. A mutation that turns nothing red is a finding: stop and tell the lead.

| # | The mutation | What turned red (of 195) |
|---|---|---|
| MU1 | `hostKeyWords` answers the first two pairs only (no `GlobalKnownHostsFile`) | 9 red: R1, R2, R3, R4, R5, R7, R8, R9, R10 |
| MU2 | `oneFileWord` writes a path with white space bare | 3 red: R2, R5, R8 |
| MU3 | `oneFileWord` treats a path with a double quote like any other path | 3 red: R3, R5, R9 |
| MU4 | `hostKeyWords` answers `accept-new` for a pin file whose path holds a double quote ("no pin") | 3 red: R3, R5, R9 |
| MU5a | `buildSshExecArgv` writes the six words itself, the path bare, and does not call the function | 7 red: R2, R3, R6, R8, R9, R10, R11 |
| MU5b | `buildBridgeArgv` writes the six words itself, the path bare, and does not call the function | 7 red: R2, R3, R6, R8, R9, R10, R11 |
| MU6 | `GlobalKnownHostsFile` names `/dev/null` and not the pin file | 6 red: R1, R2, R4, R5, R7, R8 |
| MU7 | `buildBridgeArgv` puts the words behind `extra` | 4 red: R4, U2, U3, R7 |
| MU8 | `oneFileWord` uses single quotes | 2 red: R2, R5 |
| MU9 | `oneFileWord` quotes every path | 7 red: R1, R4, R5, U2, U5; existing: "a_pinned_host_is_enforced", "a pinned host key is enforced when one exists, and accept-new only when none does" |
| MU10 | the six words say `StrictHostKeyChecking=accept-new` | 12 red: R1, R2, R3, R4, R5, U2, R7, R8, R9, U5; existing: "a_pinned_host_is_enforced", "a pinned host key is enforced when one exists, and accept-new only when none does" |
| MU11 | `buildSshExecArgv` puts the words behind the words of the entry and the sharing options | 4 red: U2, U3, U5; existing: "F1: off a bridge the same entry keeps -J -A -L … -R …, then says the two no-sharing options, and none of the other four" |
| MU12 | `buildBridgeArgv` calls `hostKeyWords(undefined)`: the tunnel leaves the pin out | 10 red: R1, R2, R3, R4, R6, U2, R7, R8, R9; existing: "a pinned host key is enforced when one exists, and accept-new only when none does" |
| MU13 | `buildSshExecArgv` calls `hostKeyWords(undefined)`: a run leaves the pin out | 11 red: R1, R2, R3, R6, U2, R7, R8, R9, U5; existing: "a_pinned_host_is_enforced", "the_argv_is_buildSshExecArgv_with_the_snapshots_jump_and_pin" |
| MU14 | `NO_KEY_FILE` is the relative name `none` | 3 red: R3, R5, R9 |

MU1 and MU2 are the two checks of the parent's item 15 for this story. MU8 leaves R8 green: the client of this machine reads
single quotes as one file too, and R2 and R5 hold the spelling that the parent measured. The existing tests named in the table
are of `test/secretsLaunch.test.ts`, `test/sshBridge.test.ts`, `test/sshExecCommand.test.ts` and `test/sshExecOver.test.ts`. Restore
after each one, compile, and see the ten files green before the next.

## 11. Done when (each item can be counted)

1. `hostKeyPin.ts` exports `hostKeyWords`, and R10 and R11 are green: the three options are spelled in `hostKeyPin.ts` and in
   `sshCommand.ts` only, and the function has exactly two users.
2. `test/hostKeyWords.test.ts` has 15 tests; R1 to R11 were watched RED on the unchanged product with the texts of §7, and all 15
   are green after §1 to §3.
3. The ten files of the commands: 195 tests, 0 fail.
4. One existing test changed (§6), and no other existing test file.
5. The mutations of §10 (MU1 to MU14, MU5 once for each builder: 15 runs) each turned red what the table names, and were
   restored.
6. `npm run typecheck`, `npm run lint` (no new `eslint-disable`) and `npm test` are green.
7. `sshUseActions.ts`, `remoteLaunch.ts`, `sshCommand.ts`, `hostKeyTrust.ts`, `writtenKey.ts` and `commands/agentCommands.ts` are
   byte for byte unchanged (`git diff --stat` names none of them).
8. The two documents of §8 are in the commit.

## 12. Break it — ways to make the tests pass while the defect stays, and the row that stops each one

| # | The way | What stops it |
|---|---|---|
| X1 | The function is right, and a builder keeps its own words | R10 (the options are spelled in a builder's file), R11 (the function has one user), R2 and R3 for that builder |
| X2 | `GlobalKnownHostsFile` is added in one builder only | R1 and R7 run over the tunnel and over four kinds of run |
| X3 | The tests compare the builders with the function only, so both can be wrong together | R1, R2, R3, R5 and U2 hold literals; R7 to R9 ask the real client |
| X4 | The scan passes because it finds nothing | R10 compares whole lists that are not empty, and `SOURCES.length > 100` |
| X5 | The six words are in the argv, behind the words of a caller, where `ssh` no longer takes them | U3 (the place), R4 (the first value), R7 with the hostile `extra` (the real client) |
| X6 | A pin file with a double quote is "handled" by a spelling that one client accepts | R3 and R9 hold `/dev/null`; MU3 |
| X7 | The quoting is changed to one that reads well and that `ssh` splits | R8 with its control U4 |
| X8 | A pinned call answers the right files and `accept-new` | R1 (the literal), R7 (`stricthostkeychecking true`), MU10 |
| X9 | The unpinned argv gains a known-hosts word "for symmetry" | U1 |

## 13. Opus review checklist

1. Read `hostKeyWords` and `oneFileWord` against §1: three answers, the return type `string[]`, no answer with fewer than the
   six words for a pin file, no `accept-new` beside a file. Is there any input for which a pinned call is not strict?
2. `git diff --stat`: the six files of the table and the two documents, and no other. `sshUseActions.ts` (the cast of K4),
   `remoteLaunch.ts` and `commands/agentCommands.ts` are untouched.
3. Both builders call the function at the place of the old words: before the composer's words and before `extra` (K2, K3).
   `hostKeyArgv` of `sshBridge.ts` is gone.
4. The docblocks say what was ASKED of `ssh` and what was measured, with the conditions, and what is not covered (Connect's
   line, the config's own sources, Windows logins). No sentence claims an effect that only a test of what is sent holds.
5. The RED texts in the commit body are the eleven of §7. The mutation results are the table of §10.
6. The edit of G2's test (§6) keeps G2's literal as it was. A reviewer who wants the literal edited in place is right only if
   the title then stops saying "the one before G2".
7. `test/hostKeyWords.test.ts` writes its config file through `ownedFile`; `test/leftoversSites.test.ts` is green.
8. K8 is read: does anything in it need more than a note before E1 merges? (a) and (c) are today's failures of real storage
   folders; they are for the lead (*Notes for the lead*).
9. The CHANGELOG entry says what is not covered, and names no version.

## 14. Not verified by this spec

- **A login on Windows.** K7 is the client's `-G` alone. Whether Win32-OpenSSH then finds the key in a pin file at a quoted
  path with a space, and what it prints for a refused key, is candidate C6.
- **The test file under a Windows Node.** It runs in `npm test` on Ubuntu. It was not added to the Windows step of
  `ci-extension.yml`; there R8's control would meet the other answer of K7 (exit code 255), which the test allows for by reading.
- **An `ssh` older than 8.7** (K8). The rule "white space → double quotes" is read for it, not run.
- **macOS.** The folder `Application Support` is the reason for the quoting; no run was made there.
- **The three roads.** After this story they still pass no pin file: E1.S3. And what a real `sshd` gets from the registered
  commands: E1.S4 and E2.
- **`KnownHostsCommand` and `VerifyHostKeyDNS`** of a person's config: not switched off (candidate C2; E2's M8).

## Notes for the lead

- **`/dev/null` for a path with a double quote is this spec's decision** inside what the parent delegates ("what a path that
  holds a double quote does: it must never reach `ssh` as two paths"). The other form, `undefined` from the builders, was built
  and measured first on the scratch copy and dropped: it needs a refusal branch at every call site, `sshUseActions.ts` casts the
  answer (K4), and `buildBridgeArgv` has no room for a branch (K3).
- **K8 (a): a storage folder whose path holds one apostrophe fails every pinned call today, on both clients, and still after
  this story.** A Windows profile folder with an apostrophe in the person's name is the likely case. Double quotes heal it
  (measured). This story does not quote it: the parent says "a path with no white space is written as today, byte for byte".
  Making the rule "white space or an apostrophe" is one line in `oneFileWord` and one test; whether it is inside the parent's
  sentence or a change of it is the lead's call. If it is a change, it is a candidate beside C4 and C6, not a second entry.
- **K8 (c): a storage folder on a UNC path** resolves to another path on Windows, bare and quoted. Today's behaviour; for C6.
- **K8 (d): the two options expand a path differently** (`%h`, `${…}`). With a `%` in the storage folder's path the
  system-wide list still names the pin file and the person's list names another path. No fix is proposed; recorded.
- **`research/module_tests.md`.** This story adds a test file and the stories document gives the new section to E1.S2 ("begins").
  E1.S2's commit should name `hostKeyWords.test.ts` (15 tests) and `pinnedArgv.ts` there, or this story's commit adds two lines;
  the spec of E1.S2 was written at the same time and does not know this file.
- **E1.S2's test world** has `knownHostsOf(argv)`, which reads the path of `UserKnownHostsFile` bare or in double quotes: the two
  forms of §1. `valuesOf` of §4 does the same for both options; E1.S3's spec can choose one.
- **The docblock of `hostKeyWords` says "no test of the suite asks a real `sshd`".** E1.S4 changes that sentence when its smoke
  exists.
