# PLAN — E2.S3 spec: sentence C only when `ssh` names the pin file of the call, sentence D otherwise (SECURITY)

> Status: **spec, 2026-11-18, by Fable; not built.** A security spec, written before its code (the row *Security judgement* of
> `subagent-models.md`; outside the quota, not the cornerstone: E2.S2 holds it). Story E2.S3 of
> [PLAN_person_roads_pin_host_key.md](PLAN_person_roads_pin_host_key.md) (its §3.12 parts 2 and 3, the rows of sentences C and D
> in §3.5, §3.6, the tests 24 and 25 of its §5, the mutation checks of test 26 that name the `Offending` line, the folder and
> sentence D; repair R4 of its `## Epics`, E2) and of its stories document
> [PLAN_person_roads_pin_host_key_E2.md](PLAN_person_roads_pin_host_key_E2.md) (`## E2.S3`). It replaces the condition of
> sentence C that [PLAN_person_roads_pin_host_key_E1_S3_spec.md](PLAN_person_roads_pin_host_key_E1_S3_spec.md) built. It is built
> after E2.S1 and E2.S2 on E2's branch
> ([PLAN_person_roads_pin_host_key_E2_S2_spec.md](PLAN_person_roads_pin_host_key_E2_S2_spec.md), the cornerstone: its checked
> pin is this story's input, *What this story takes from E2.S2*). The parent and the stories document do not link to this file
> yet: the lead adds those two links (*Notes for the lead*). This file is promoted together with the parent.
>
> Scope: `src_vs_code/src` — `hostKeyPin.ts` (one function replaced by another, one new sentence), `commands/agentCommands.ts`
> (one import line and two branches, 0 lines added: 797 before and after); tests: new `test/hostKeyTold.test.ts`, four tests
> removed from and two fixtures changed in `test/personRoadsHostKey.test.ts`; and three documents (§6). No builder, no guard,
> no pin writer, no word of an argv, no script. Each `file:line` below was read on `fix/g1-e2-measurements` at `cbeae5b8`, whose `src_vs_code` is
> the one of `main` at `f3e9887d` (`git diff f3e9887d cbeae5b8 -- src_vs_code` is empty). Fable writes this spec, a Sonnet coder
> builds it, Opus reviews it.

Paths are relative to `src_vs_code/src/` unless they start with another folder. "The parent" is the plan linked above; a section
named as §3.12 and so on is the parent's, and a section named as "§2 of this spec" is this document's. "E1.S3" is the spec
linked above; its names keep their meaning (L9, T9a to T9e, H1 to H5, the world). This document's own names: the facts J1 to
J17, what it takes from E2.S2 I1 to I5, the scenarios S0 to S6 and X0 to X8, the mutations Y1 to Y28, the break-its U1 to U12.
"The pin file of a call" is the file `known_hosts-<entry id>-<uuid>` that the guard wrote for one call of a road and deletes
with it (E1.S2). "The verification line" is `Host key verification failed.`. "The `Offending` line" is
`Offending <type> key in <file>:<n>`. This document keeps no change ledger: a change of it is an entry in the parent
(`plan-change-control.md`), and the parent's epoch 2 has one entry (2.1), so a second one stops the whole plan.

## What E2.S3 builds, in one paragraph

Since E1, a pinned call of the three roads whose `ssh` printed the verification line shows sentence C: "`<name>` did not
present its saved host key". That is wider than what the call saw (the parent's V4). The stderr of one run holds three voices:
the `ssh` of the call, the nested `ssh` of a jump host of the person's own config, and the remote command. Each of the three
can write the verification line. Only the first one judged the pin of this call. E2.S3 makes sentence C wait for that `ssh`'s
own evidence: its line `Offending <type> key in <file>:<n>`, with the pin file of THIS call as the whole name. The name ends
with a uuid that no other call has, a nested `ssh` reads other files, and a remote command never learns the name. The
verification line without that evidence gets a new sentence, D: it says that the connection ended with the line, that `ssh`
did not name this entry's saved key, where the cause can be, and that no saved key is to be replaced. One pure function,
`hostKeyTold` in `hostKeyPin.ts`, answers both forms of the sentence (the install's, the bridge's) or nothing; it stands in
place of `hostKeyRefused`. The two branches of `commands/agentCommands.ts` ask it and keep their size. An unpinned call, a
host that is down, a refused login and a time limit keep the sentences of before.

| File | Change | Where |
|---|---|---|
| `hostKeyPin.ts` | `hostKeyRefused` goes. New `export function hostKeyTold(pin, stderr, name)`, `export interface HostKeyTold`, `export function unnamedHostKeySentence(name)` (sentence D), two private helpers and two constants. `refusedHostKeySentence` keeps its words and its export. +53 lines: 373 after E2.S2 (its spec, §2.1) → 426 | §2 |
| `commands/agentCommands.ts` | the import line names `hostKeyTold`; the branch of the socket check (7 lines) and the branch of the install (4 lines) ask it. **0 lines added: 797 → 797** (797 on `f3e9887d`, and 797 after E2.S2 by its spec, §4.3) | §3 |
| `test/hostKeyTold.test.ts` (new) | 49 tests: S0, S1 (10), S2 (15), S3, S3b, S4, S5, S6, X0, X1 (2), X2 (4), X3 to X6, X7 (6), X8. 358 lines | §4 |
| `test/personRoadsHostKey.test.ts` | H1 to H4 go with the function they ask (their cases are rows of S1 to S4); T9a and T9b answer the text with the pin file of their own run. 37 → 33 tests, 469 → 428 lines | §4.3 |
| `src_vs_code/CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md` | the texts of §6 | §6 |

## Binding constraints

- **No plan change.** Build what the parent and this document say. If a step cannot be done as written, a code block here does
  not compile, or a test is not RED or GREEN as this document says: stop and tell the lead. Do not repair the parent, the
  stories document or this document. The parent has one recorded change in its epoch (2.1); a second one stops the whole plan.
- **A RED proof is a failed assertion, never a compile error.** `npm test` runs `tsc` first. Read the exit of `tsc` before any
  test result. This is why the tests of part 1 read the exports through the module object: the test file compiles before the
  functions exist (J16 a).
- **Keep what the runner printed.** Save each RED text in the scratchpad folder of the session and quote it in the commit body.
- **Stage by path.** Read `git diff --staged --stat` before each commit. Do not push; the lead pushes. No revert, no amend, no
  rewrite of history. Never a bare `git stash`. Never commit `.claude/settings.json`.
- **Limits** (`src_vs_code/eslint.config.mjs:30-32`, `:60`): 800 lines per file, 50 code lines per function (120 in `src/test/`),
  complexity 4, also in tests. No new `eslint-disable`. **`commands/agentCommands.ts` has 797 lines after this story, the count
  that E2.S2 left: this story adds 0 lines** (§3.3). Do not break one of its lines in two and do not add a comment line that this
  document does not show.
- **The product change is §2 and §3 and nothing else.** No word of an argv changes: `hostKeyWords`, both builders,
  `writtenKey.ts`, `personPin.ts`, `hostKeyTrust.ts`, `sshExecRunner.ts`, `remoteCliInstall.ts` and every script are not
  touched. `test/personRoadsWorld.ts` and `test/pinnedArgv.ts` do not change.
- **`hostKeyTold` reads the `file` of the checked pin, the path as it is on the disk, never its `word`.** `ssh` prints a path
  that was written in double quotes with none (J5). The checked pin is the one of the ONE value of the road,
  `credential.knownHostsFile` (I2).
- **The evidence is the WHOLE name.** Not the folder, not the start, not the end, not the entry's id. And it is the `Offending`
  line, not the line `Add correct host key in`, which `ssh` cuts at 100 characters (J4).
- **An unpinned call is told nothing by this function, whatever its `ssh` printed**, and no word of its argv changes.
- **Sentence C is the parent's §3.5, character for character, and stays where it is** (`refusedHostKeySentence`): the smoke
  reads it from the product (`scripts/itestPinnedRoads.cjs:55-56`). **Sentence D is §1 of this spec, character for character**,
  written in ONE place (`unnamedHostKeySentence`). The two openings of the bridge's form are written in one place,
  `hostKeyTold`.
- **The sentence is shown for the first run whose answer each bounded road reads, and for no other run** (as E1.S3): the probe
  of the install and the mode check of the socket check. The sweep's answer is read by nobody; the install's second run keeps
  the sentence of today (§3.5).
- **Every other sentence of these roads stays as it is.**
- **Tests leave nothing outside an owned temp folder.** Every real file of the new tests is in a folder of `ownedDir`
  (`scripts/lib/leftovers.cjs`), registered in a `cleanupScope` that the file closes in `after`. No test starts a process.
- **Node only.** No Python, also not for a helper script. Write files with the Edit or Write tool, not with a shell heredoc.

## What this story takes from E2.S2

E2.S2 is built before this story. Its spec was written at the same time as this one; the five things below were read in it
after it was committed (`9e4f58d5`). If the tree after E2.S2 is otherwise in one of them, stop and tell the lead.

| # | Taken from E2.S2 | Where in its spec | Where this spec uses it |
|---|---|---|---|
| I1 | every pinned call carries `-o LogLevel=ERROR` | its §2, the words; K12 | under it the lines of J4 are printed also when the person's config is quiet (J13). No line of this story's code or tests depends on it: without it a quiet config prints nothing and the function answers nothing, as today |
| I2 | the ONE value of a road gives the pin of its call as a CHECKED pin: `credential.knownHostsFile` is a `CheckedPin \| undefined`. Its `file` is "the path of the file as it was written to the disk: for the delete, and for the match of `ssh`'s own lines", its `word` the value of the two options (in double quotes for some paths). Only `checkedPin` makes one | its §2.1 and §2.3; its S10: "`hostKeyRefused` takes the checked pin … E2.S3 replaces the function" | `hostKeyTold` takes the checked pin as its first parameter and reads `pin.file`. The two call sites hand it `credential.knownHostsFile`, the same text as today's call of `hostKeyRefused` |
| I3 | a test hands a pin through `testPin(file)` of `test/pinnedArgv.ts`, which makes the value with the product's own `checkedPin` and throws for a path that the rule refuses | its §6.1 | part 1 of the new test file. So every path of S1 is a path that the rule of §3.11 takes |
| I4 | the world's `runs` holds one record per `ssh` connection run: the question about the client is a part that the world stands in for, and "no count of E1 changes". `knownHostsOf(argv)` answers the path with no quotes, as before | its §6.2; its note 14 | X0 to X8, T9a and T9b count runs (`w.runs.length` is 1 or 2; X8 answers by `index === 0`) and read the pin file of a run from its argv |
| I5 | `commands/agentCommands.ts` has 797 lines after E2.S2, and the two calls of `hostKeyRefused` (`:216`, `:283`) did not change a character; `test/personRoadsHostKey.test.ts` passes unchanged after it (37 tests) | its §4.3; its note 16 | §3.3: this story adds 0 lines. §7, step 1: the 37 tests of E1's file are green before this story's product |

The RED run of step 1 (§7) is on E2.S2's tree. `hostKeyRefused` kept its body there, so the RED set is the one of §5. If it
is another set, stop and tell the lead.

## Facts read on `cbeae5b8` and measured on 2026-11-18 that this spec uses

**How the measurements were made.** The real client, OpenSSH 10.2p1 (Ubuntu `1:10.2p1-2ubuntu3.8`), by hand, against public
`sshd`s: `github.com`, `gitlab.com`, `bitbucket.org`, `codeberg.org`, `git.sr.ht`, and the port-443 names of the first three.
Every run: `ssh` with `BatchMode=yes`, `IdentitiesOnly=yes`, `IdentityFile=/dev/null`, the six words of a pinned call (E1.S1),
E2's three pairs (`VerifyHostKeyDNS=no`, `KnownHostsCommand=none`, `LogLevel=ERROR`), `ConnectTimeout`, G2's two options, the
command `true`, and `-F none` unless the row names a config. The pin file was a file named as the product names it
(`…/keys/4242/known_hosts-e1-<a uuid>`), in a folder of the session's scratchpad, and held ANOTHER ed25519 key for the host (a
key made for the run). So every run ended at the host key check of some `ssh`: no login was attempted, no key was offered,
nothing was written on a host. One of the hosts stopped answering for some minutes after three connections in a row; it was
asked about 18 times in half an hour, each of the others at most three times, 20 to 30 s apart. The scripts and their folder
are not kept. **What was written down before the runs,
and what came:**

| Expected before the run | Observed |
|---|---|
| a path written in double quotes is printed with none | so (J5) |
| a backslash is printed as two | so (J6) |
| letters outside ASCII are printed as octal escapes; under `LC_ALL=C` not known | so, under both (J7) |
| a pin of another type than the host's key gives `No <type> host key is known`, as the parent reads it (§3.12 part 3) | **not so**: the 15 lines, with `Offending RSA key in <the pin file>:1` (J9) |
| a jump host's refusal names the file that the nested `ssh` read, and adds `Connection closed by UNKNOWN port 65535` | the first: so. The second: **not so** under the outer's `LogLevel=ERROR` (J11) |
| a config that renames the host makes `ssh` look the key up under the new name | so (J10) |

| # | Fact | How |
|---|---|---|
| J1 | `hostKeyPin.ts` (250 lines on `f3e9887d`; E2.S2 puts its rule and its checked pin above this block, and changes the parameter of `hostKeyRefused` to `pin: CheckedPin \| undefined`, I2): `HOST_KEY_REFUSED_LINE` (`:194`), `hostKeyRefused` (`:214-216`, its docblock `:196-213`), `refusedHostKeySentence` (`:223-225`, its docblock `:218-222`), then `export type PinVerdict` (`:227`). `commands/agentCommands.ts` (797 lines): the import of the two functions (`:27`), the branch of the socket check (`:216-222`, 7 lines, behind the run of the mode check `:211-215` and before `interpretSocketProbe` `:223`), the branch of the install (`:283-286`, 4 lines, behind the probe `:282` and before the time-limit branch `:287`). The socket check says `entity.name`, the install `node.name` | read |
| J2 | Who reads the two functions. `hostKeyRefused`: the two branches, and H1 to H4 of `test/personRoadsHostKey.test.ts` (`:108-139`). `refusedHostKeySentence`: the two branches, H5 (`:141-145`), and the smoke `scripts/itestPinnedRoads.cjs` (`:45`, `:55`, `:56`: it reads sentence C from the compiled product and joins the opening `The bridge to "<name>" is not open: ` itself). Nothing else calls them (a search of `src_vs_code/src` and `src_vs_code/scripts` for both names). Two documents name `hostKeyRefused` in prose, `research/module_extension.md:5355` and `research/module_tests.md:2563`; §6 rewrites both places | read |
| J3 | The stderr of a run is one string: what the `ssh` of the call printed, what a nested `ssh` printed (it inherits the stderr), and what the remote command wrote to its own stderr (E1.S3, L5). The runner decodes it as UTF-8 (`sshExecRunner.ts:90`) and cuts it at a byte limit (`MAX_STREAM_BYTES`, `:74-81`) | read |
| J4 | **A host with another key** (the plain path, 179 characters, bare, `-F none`): exit code 255, no stdout, 15 lines. Lines 10 to 15: `Add correct host key in <the first 100 characters of the path> to get rid of this message.`, `Offending ED25519 key in <the whole path>:1`, `  remove with:`, `  ssh-keygen -f '<the whole path>' -R '<host>'`, `Host key for <host> has changed and you have requested strict checking.`, `Host key verification failed.`. Every line ends with CR LF, but "The fingerprint for the ED25519 key sent by the remote host is" ends with LF alone (E1.S3, L9 b: the same). With a path of 258 characters the `Offending` line holds all 258 | measured |
| J5 | **A word in double quotes is printed with none.** The pin file in a folder `Application Support`, in a folder `it's`, in a folder `a'b'c`, and in a folder with a space and letters outside ASCII, each written in double quotes in both options: the `Offending` line names the path with no quote. In each run `ssh` had read that file: it found the key in it | measured |
| J6 | **A backslash is printed as two.** The pin file in a folder `a\b`, the word bare: `ssh` read the file, and the `Offending` line and the `ssh-keygen` line say `a\\b` | measured |
| J7 | **A byte outside printable ASCII is printed as a backslash and three octal digits.** The folder `Jörg Пётр`: `J\303\266rg \320\237\321\221\321\202\321\200` (the bytes of the UTF-8 form, one escape each; the space as it is), under `LC_CTYPE=C.UTF-8` and under `LC_ALL=C` | measured |
| J8 | **`ssh.exe` of OpenSSH_for_Windows 9.5p2** (LibreSSL 3.8.2; the owner's PC, started from WSL with the argv as separate words; the same words; the pin file reached as a network path of forward slashes that ends with `\keys\4242\known_hosts-e1-<uuid>`): exit code 255, 13 lines (the 15 without `  remove with:` and the `ssh-keygen` line), CR LF and the one LF as in J4, and `Offending ED25519 key in <the path>:1` with every backslash as two (`\\keys\\4242\\known_hosts-e1-…`). `ssh.exe -G` resolved the same word with single backslashes. No login was made on Windows, as before. Not run: a path with a drive letter (it needs a file outside the scratchpad) | measured |
| J9 | **The saved key is of another type than the key the host presents** (an RSA key in the pin file; `HostKeyAlgorithms=ssh-ed25519`): the same 15 lines, with `The fingerprint for the ED25519 key sent by the remote host is` and `Offending RSA key in <the pin file>:1`. The type in the `Offending` line is the type of the SAVED key. So a host that offers no key of the saved type is told with the evidence, as a host with another key | measured |
| J10 | **`ssh` finds no key for the name it looks up:** exit code 255, two lines, `No ED25519 host key is known for <name> and you have requested strict checking.` and the verification line; no `Offending` line. Three ways to it: an empty pin file (E1.S3, L9 c); a config that says `Host box` and `HostName <real name>`, the pin line under `box`: `<name>` is the real name; a config that gives the host `Port 443`, the pin line with no port: `<name>` is `[<host>]:443`. So `ssh` looks the key up under the name and port that its config resolved, and the pin file holds the entry's own | measured (two hosts for the second) |
| J11 | **A jump host of the config's `ProxyJump` whose key the nested `ssh` refuses** (the config gives the hop its own known-hosts file with another key; the call's pin file is for the destination): exit code 255 and the same 15 lines, printed by the nested `ssh`. They name the HOP's file and the hop's host: `Offending ED25519 key in <the hop's file>:1`, `Host key for <the hop> has changed …`. No line names the pin file of the call. **No line follows the verification line:** `Connection closed by UNKNOWN port 65535`, which E1.S3 measured behind it (L9 h, the outer `ssh` at its default level), is not printed when the outer says `LogLevel=ERROR`. So after E2.S2 a hop's refusal and the destination's differ ONLY by the names in the lines | measured (two pairs of hosts) |
| J12 | **The same hop under a config that says `LogLevel QUIET`:** exit code 255 and an EMPTY stderr. The outer's `LogLevel=ERROR` is a word of its own command line and does not reach the nested `ssh`, which prints nothing; and the outer has nothing of its own to print at `ERROR` | measured (two pairs of hosts) |
| J13 | **A config that says `LogLevel QUIET`, no hop:** the 15 lines of J4, because of `LogLevel=ERROR` on the command line (the parent measured the same, §3.12 part 1) | measured |
| J14 | **A host that does not answer**, under the same words: exit code 255 and one line, `ssh: connect to host <host> port 22: Connection timed out`, or `Connection timed out during banner exchange` (the public host that had stopped answering). No verification line | measured |
| J15 | **Not measured again; the texts of E1.S3's L9, a real `sshd` on the loopback, 2026-11-17:** a refused login, `<user>@<host>: Permission denied (publickey,password).` (d); a port where nothing listens, `ssh: connect to host <host> port <n>: Connection refused` (e); a remote command that writes the verification line to its stderr and ends with 255: that one line, ending with LF alone (i); the same words inside a longer line (j). A public `sshd` gives no login, so none of them can be made there | carried |
| J16 | **Measured on a scratch copy** of `src_vs_code` at `cbeae5b8` (`git archive`; `node_modules` and the shared rules linked in), edited and compiled there, not in the repository; removed after. Node 26.12.1, Linux; the machine was shared (a load average of about 25 during the last runs). **In three forms.** *First, on the product of `f3e9887d` as it is,* with the parameter of the function as a `string` (the path): the RED run, the GREEN run, the twelve files of (c), and the 28 mutations of §8, twice. *Then in the form of this document,* with E2.S2's checked pin EMULATED in the copy, because E2.S2 is not built yet: `PIN_PATH_KINDS`, `pinPathRefusal`, `CheckedPin`, `PinCheck` and `checkedPin` copied from the E2.S2 spec (its §2.1), the two types of E2.S1, `testPin` copied from the E2.S2 spec (its §6.1), and one scratch-only function that makes the checked pin from the path at the two call sites (E1's roads hold a path; after E2.S2 they hold the checked pin, and the call sites are the text of §3.1). Not emulated: the rest of E2.S2 (the words, the asynchronous writer, the asker of the world). In this form the 28 mutations were run again, Y1 to Y3 against the twelve files and Y4 to Y28 against the two files in which every red test of the first form stands (`hostKeyTold`, `personRoadsHostKey`). *Third, once, on a copy of the branch's working files while E2.S2 was being built* (`c20be822` and the product of E2.S2 as it stood uncommitted on 2026-11-18, late evening: a snapshot that no commit names): the block of §2, the diff of §3.1 and the test files of §4, applied as they are, with no emulation. There: `tsc` exit 0; the RED run of step 1, the same 37 with the same texts and 12 green, `personRoadsHostKey` 37 of 37; after the product, `hostKeyTold` 49 of 49, `personRoadsHostKey` 33 of 33, `personRoadsPin` 28, `pinWords` 19, `hostKeyWords` 16; lint clean; `commands/agentCommands.ts` 797 lines and `hostKeyPin.ts` 426. The whole suite and the mutations were not run in that form. The numbers below are those of the second form; the first form gave the same RED set, the same counts and, for each of the 28 mutations, the same red set. (a) The test file of §4.2 and the two changed fixtures of §4.3 compile on the product without this story (`tsc` exit 0). (b) There `hostKeyTold.test.ts` has 49 tests: 37 fail with the texts of §5, 12 pass (S0, X0, X1 both, X5, X7 all six, X8); `personRoadsHostKey` with the two changed fixtures: 37 of 37 pass. (c) After §2, §3 and §4.3: `hostKeyTold` 49 of 49, `personRoadsHostKey` 33 of 33; `personRoadsPin` 28, `personPin` 10, `writtenKey` 18, `personRoadsForgetKey` 15, `bridgeKeyHandoff` 9, `hostKeyWords` 18, `hostKeyPin` 10, `launchRoadScan` 10, `promptSites` 16 pass, and `noConnectionSharing` 8 of 9 (1 skipped: the test that runs only where `CI=true`): 225 tests in the twelve files. (d) `wc -l` of `commands/agentCommands.ts`: 797 before and after (the first form; the second has the scratch-only function in its two calls). The block of §2 is 86 lines where 33 stood. `npm run typecheck` and `npm run lint`: exit 0, in both forms. (e) The whole suite, in the first form: on a second copy that holds the WHOLE repository (a copy of `src_vs_code` alone fails 63 tests that read files of the repository's root): 8251 tests, 8205 pass, 44 skipped, 2 fail. `leftoversRunnerSweep.test.js` asks `git worktree list` of the copy, which is no git repository (the same failure as in the specs of E1). `leftoversRunnerAudit.test.js` failed one test ("the exit code does not change": 1 where 0 is expected); in the first whole run of the same product (with a test file of 48 tests: 8250 tests, 8205 pass, 44 skipped) only the first of the two failed, and alone the file passes (4 of 4, twice). It was not traced: during that run another session ran tests on the same machine and in the same temp root. Neither file reads a file of this story. (f) The mutations of §8, each on the product of §2 and §3 | a scratch copy |
| J17 | **Why `ssh` prints a name otherwise than it is** was not opened in the source for this spec. The rule of §1 is built from J5 to J8 alone: what was printed for which name | not read |

## Commands

In `src_vs_code`. `LP=../.agents/conventions/tools/low-priority.mjs` lowers a command that does not lower itself.

1. `node $LP npm run compile` — **read its exit first.** A test result after a failed `tsc` is the result of old files.
2. One suite: `node --import ./scripts/lower-priority.mjs scripts/run-tests.mjs "out/test/<file>.test.js"`
3. `node $LP npm run typecheck`
4. `node $LP npm run lint`
5. `node $LP npm run ratchet` (it compiles first; this story changes no file of its baseline).
6. `npm test` — the full suite (it compiles first and lowers itself).

## 1. How the sentence is chosen

**The rule** (§3.12, the table). One run of a road ended. Its call is PINNED when the ONE value of the road holds a checked
pin (I2); the pin file of the call is that pin's `file`. Then:

| The stderr of the run holds | The person is shown |
|---|---|
| the verification line as a whole line, AND a line `Offending <type> key in <file>:<n>` whose `<file>` is the pin file of this call, the whole name | **sentence C** |
| the verification line as a whole line, and no such line | **sentence D** |
| no verification line (also when the `Offending` line of this call is there without it) | nothing: the sentences of before |

An unpinned call is shown nothing by this rule, whatever its `ssh` printed. Nothing else is asked: not the exit code, not the
stdout, not whether the run timed out, not the order of the two lines. One pure function answers it,
`hostKeyTold(pin, stderr, name)` in `hostKeyPin.ts`, and two places call it.

| Road | The run that is asked | Sentence C | Sentence D | Nothing |
|---|---|---|---|---|
| *Install creds on host* | the probe, the first run | ONE error message: sentence C as it is. The road returns: no warning, no question, no second run | ONE error message: sentence D as it is. The road returns in the same way | as today |
| *Install creds on host* | the install run is NOT asked | the sentence of today, `Could not install on "<name>": the installer produced no result and exited 255.` | the same | as today |
| the socket check | the mode check, its second run | ONE error message, `The bridge to "<name>" is not open: ` + sentence C; the same text as one line of the log (area `bridge`). The check returns before it reads the stdout | ONE error message, `The bridge to "<name>" could not be checked: ` + sentence D; the same text as one line of the log. The check returns before it reads the stdout | as today |
| the socket check | the sweep is NOT asked | nothing | nothing | as today |
| *Open Remote Bridge…* | cannot be asked: its `ssh` has no stdio | nothing of its own; the socket check speaks | the same | as today |

**Sentence C** (§3.5; its words do not change; `<name>` is the entry's name):

```text
"<name>" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.
```

**Sentence D** (new; the final words):

```text
The connection to "<name>" ended with "Host key verification failed", and ssh did not name the saved host key of this entry as the reason. It can be the key of a jump host in your own ssh config, which your own known_hosts file checks, or your ssh config gives this host another name or port than this entry does. Do not replace a saved key because of this message. Connect SSH on this entry checks this host's key again and asks before it changes anything.
```

**The two forms.** *Install creds on host* shows the sentence as it is, as an error message, for C and for D. The socket check
shows `The bridge to "<name>" is not open: ` + sentence C, or `The bridge to "<name>" could not be checked: ` + sentence D.

**Why each part is as it is.**

- **The evidence is `ssh`'s own line about a file, and the file is the pin file of THIS call.** With the words of a pinned call
  the `ssh` of the call reads ONE known-hosts file, the pin file (E1.S1). When the key that the host presents does not fit the
  key in it, that `ssh` says in which file and line the saved key stands (J4). Nobody else can say that about this file:
  - **A nested `ssh` of a jump host** is started by the outer one with none of the outer's `-o` words (§4, G2's H1). It reads
    the files that the person's config gives the hop, and its lines name those (J11, measured: the hop's file and the hop's
    host). So an `Offending` line for the person's own `known_hosts`, or for any file of a hop, has another name than the pin
    file of the call, and is no evidence. The outer `ssh` of a pinned call can never name the person's `known_hosts`: it was
    given the pin file as the person's file AND as the system-wide one.
  - **A remote command** writes to the same stderr (J3), so it can write an `Offending` line. It cannot write THIS one: the
    name of the pin file is a word of the local argv and is sent to nobody, and it ends with a uuid that is made for this call
    (`materializeKnownHosts` with its suffix, E1.S2) and never used again. An older refusal that a person pasted somewhere
    names the file of an older call. **Why that is enough:** the rule has to keep sentence C from naming a cause that the call
    did not see. It does not have to stop an attack: a remote command runs only on a host that has already presented the saved
    key, so a forged line could only make that host raise a false alarm about itself, and sentence C's advice then leads to
    Connect SSH, which finds the saved key and replaces nothing (§3.5, *Sentence C against P2*). A machine that is NOT the saved
    one never gets to write anything: the `ssh` of the call ends at the key exchange.
  - **Another call of the same entry** (the bridge's `ssh` beside its socket check, two installs at once) has another uuid in
    the same folder. So the folder, the entry's id or the start of the name are not enough: the whole name is asked (S2, X2, X6).
- **The name is read back from what `ssh` prints.** `ssh` does not print every name as it is. A name that was written in
  double quotes is printed with none (J5), so the function reads the `file` of the checked pin and never its `word` (I2). A backslash is printed
  as two, and each byte outside printable ASCII as a backslash and three octal digits (J6, J7, J8). On Windows every path has
  backslashes, and a home folder can hold letters outside ASCII on every platform. A plain comparison of the printed name with
  the path would miss all of them, and each miss would show sentence D for a host that did present another key: the wrong
  sentence in the very case the pin exists for. So the function undoes those two escapes in the name that the line holds, and
  compares the result with the path, as a whole. A name that `ssh` printed as it is (no backslash in it) is not changed by
  that. What undoing cannot do is turn the name of another file into this one: the two escapes are read back to exactly the
  bytes they stand for.
- **Both lines are asked, and the verification line as a whole line.** §3.12 names both. The `ssh` of the call that printed
  the `Offending` line for its pin file always ends with the verification line (J4, J9), so asking both loses nothing; and a
  stderr that was cut at the byte limit before the last line (J3) is then told nothing, not a sentence. A whole line keeps a
  text that only quotes the words from reading as a refusal (E1.S3, L9 j).
- **CR LF.** `ssh` ends its own lines with CR LF (J4), a remote command with LF (J15 i). The text is split at both, as E1.S3
  built it.
- **The `Offending` line is a whole line of exactly this shape:** `Offending`, one word with no space (the type of the saved
  key, J9: `ED25519`, `RSA`), `key in`, the name, a colon and digits, and nothing more. So a line that holds it behind other
  text, a line with text behind the number, and `ssh`'s other line `Offending key for IP in <file>:<n>` are no evidence (S2).
  The name is everything between `key in ` and the LAST colon with digits behind it, so a name with a colon in it (a drive
  letter, `v:2`) is read whole (S1).
- **The line `Add correct host key in <file>` is not the evidence.** It is cut at 100 characters (J4: of a path of 179
  characters it holds the folder of the scratchpad), and a short path would fit into it by chance.
- **Sentence D covers what the verification line can mean when the `ssh` of the call did not name its pin file** (measured):
  a hop's refused key (J11); `ssh` looked the key up under another name or port than the pin file holds, because the person's
  config renames the host (J10); a remote command that wrote the line (J15 i); and a text that names the pin file of another
  call. **Not** among them, against the parent's reading in §3.12 part 3: a host that offers no key of the saved type. `ssh`
  names the pin file for it (J9), so it is sentence C, which is true for it: the host did not present its saved key.
- **Sentence D's words.** The baseline of §3.12, with one clause more. Each part against the contract of §3.12:
  - "ended with …, and ssh did not name the saved host key of this entry as the reason": what was seen, and no more. It
    names no host as the cause.
  - "It can be the key of a jump host in your own ssh config, which your own known_hosts file checks": the contract's
    possible place, as a possibility ("can be").
  - "or your ssh config gives this host another name or port than this entry does": **added by this spec, from J10.** It is
    the second cause that was measured, and the baseline's one cause would send its person to look for a jump host that is
    not there. The words are the spec's (the stories document, E2.S3); if the lead wants the baseline's words alone, this
    clause goes and one test literal with it (*Notes for the lead*).
  - "Do not replace a saved key because of this message": the contract's "never tells the person to replace a saved key",
    said as an order, because sentence C beside it does name Connect SSH as the way to a new key.
  - "Connect SSH on this entry checks this host's key again and asks before it changes anything": the advice cannot end in an
    unchecked connection, by the argument of *Sentence C against P2* (§3.5). The pin of this entry parses (a pin that does not
    parse never reaches an `ssh`: sentence A), so Connect keeps enforcing it and asks before it replaces it.
- **"Could not be checked", not "is not open".** With sentence C the check's `ssh` met a host with another key, and the
  bridge's `ssh` met the same host with the same words a moment earlier: the bridge is not open (E1.S3; the limits of that are
  in its §12). With sentence D the check knows less. The tunnel can be up: a remote command that wrote the line ran on a host
  that presented the saved key (X3). Or it is down: the bridge's `ssh` met the same hop (X4). The row in the tree says which.
  So the opening says what the check did not do, and the check ends there: it has no stdout that it could trust.
- **The install shows sentence D as an error message with no opening,** as it shows sentence C (E1.S3, §1): the sentence opens
  with what it is about, and it is a refusal, not the warning of the blocker it replaces.
- **An unpinned call keeps today's sentences.** It has no saved key to speak of (§3.5). The function is handed `undefined` for
  it (the ONE value of its road holds no pin) and does not look at the text.
- **What the rule cannot tell, and what it misses** (each is in §12 and in *Notes for the lead*): a run whose stderr is empty
  (a hop under a quiet config, J12; a client that does not keep `LogLevel=ERROR`) is told nothing; a remote command that wrote
  the verification line gets sentence D also when the run answered and ended with 0. In no case is sentence C shown without
  `ssh`'s own line about the pin file of the call.

## 2. The product: `hostKeyPin.ts`

The block from `/** The line that \`ssh\` ends with when the host's key did not pass its check. */` (`:193` on `f3e9887d`) to
the closing brace of `refusedHostKeySentence` (`:225` there) is replaced by this block, word for word: 33 lines go, 86 come.
One empty line before it and one after, as today; `export type PinVerdict` follows. `CheckedPin` is E2.S2's type of the same
file (I2): no import is added.

```ts
/** The line that `ssh` ends with when a host's key did not pass its check. */
const HOST_KEY_REFUSED_LINE = 'Host key verification failed.';

/** The line in which `ssh` names the known-hosts file, and the line of it, that holds the key the host's key does not fit. */
const OFFENDING_KEY_LINE = /^Offending \S+ key in (.+):\d+$/;

/** What `ssh` prints in place of one backslash (two of them) and in place of the bytes outside printable ASCII (each a backslash and three octal digits). */
const PRINTED_ESCAPES = /\\\\|(?:\\[0-7]{3})+/g;

/**
 * A file name as it was before `ssh` printed it. `ssh` writes its messages through a filter: a backslash comes out as two, and a byte
 * outside printable ASCII as a backslash and three octal digits, so `Jörg` is printed `J\303\266rg` and `C:\keys` is printed
 * `C:\\keys`. Measured 2026-11-18: OpenSSH 10.2p1 on Linux (under `C.UTF-8` and under `LC_ALL=C`), and the backslash also with
 * `ssh.exe` of OpenSSH_for_Windows 9.5p2.
 */
function unprinted(name: string): string {
  return name.replace(PRINTED_ESCAPES, (escaped) => (escaped === '\\\\' ? '\\' : Buffer.from(escaped.split('\\').slice(1).map((octal) => Number.parseInt(octal, 8))).toString('utf8')));
}

/** Whether one line of a stderr is `ssh`'s own word that the key which does not fit stands in THIS file: the whole name, read back from what `ssh` prints. */
function namesFile(line: string, file: string): boolean {
  const named = OFFENDING_KEY_LINE.exec(line)?.[1];
  return named !== undefined && unprinted(named) === file;
}

/** What a person is told about the host's key after one run of a pinned call: the text of *Install creds on host*, and the text of the bridge socket check. */
export interface HostKeyTold {
  readonly install: string;
  readonly bridge: string;
}

/**
 * What to tell the person when one run of a PINNED call ended with `ssh`'s line `Host key verification failed.` (G1, sentences C and D).
 * `undefined`: nothing, the road shows the sentences of before. `pin` is the checked pin of THIS call, and its `file` is the pin
 * file as it is on the disk; an unpinned call has none and is told nothing, whatever its `ssh` printed.
 *
 * <p><b>The rule: a sentence names a cause only when the call saw it.</b> The stderr of a run holds what the `ssh` of the call
 * printed, what a nested `ssh` of a jump host printed, and what the remote command wrote. The verification line can come from each
 * of the three. Sentence C says that the entry's host did not present its saved key, so it needs evidence that the `ssh` of THIS
 * call judged the pin of this call: its line `Offending <type> key in <file>:<n>` with the pin file of the call as the whole name.
 * Only the `ssh` that was handed that file reads it, and its name ends with a uuid of this call alone. The verification line
 * without that line is sentence D, which names no host as the cause. Neither line, or the `Offending` line alone: nothing.</p>
 *
 * <p><b>Measured 2026-11-18</b>, OpenSSH 10.2p1, the words of a pinned call with `LogLevel=ERROR`, against public `sshd`s (the pin
 * file held another key; no login was attempted). A host with another key: 15 lines, among them the `Offending` line with the whole
 * path of the pin file (258 characters in one run) and `:1`, and the verification line last. A path that was written in double
 * quotes is printed with none. The type in the line is the type of the SAVED key, also when the host presents a key of another
 * type. `ssh` ends its lines with CR LF, also on Linux, so the text is split at both. The line `Add correct host key in` is cut at
 * 100 characters and is no evidence. A jump host of a config's `ProxyJump` whose key the nested `ssh` refused: the same 15 lines,
 * and they name the file that the nested `ssh` read, not the pin file. A config that gives the host another name or port:
 * `No ED25519 host key is known for <that name>` and the verification line, with no `Offending` line. `ssh.exe` of
 * OpenSSH_for_Windows 9.5p2: 13 lines, the same `Offending` line.</p>
 *
 * <p><b>What it cannot tell.</b> A run whose `ssh` printed nothing (a client that does not keep `LogLevel=ERROR`; a nested `ssh`
 * under a config that says `LogLevel QUIET`, measured: exit code 255, no text) is told nothing. A remote command that wrote the
 * verification line reads as sentence D whatever the run's exit code was. A miss is sentence D or nothing; it is never sentence C.</p>
 */
export function hostKeyTold(pin: CheckedPin | undefined, stderr: string, name: string): HostKeyTold | undefined {
  const lines = stderr.split(/\r?\n/);
  if (pin === undefined || !lines.includes(HOST_KEY_REFUSED_LINE)) {
    return undefined;
  }
  if (lines.some((line) => namesFile(line, pin.file))) {
    return { install: refusedHostKeySentence(name), bridge: `The bridge to "${name}" is not open: ${refusedHostKeySentence(name)}` };
  }
  return { install: unnamedHostKeySentence(name), bridge: `The bridge to "${name}" could not be checked: ${unnamedHostKeySentence(name)}` };
}

/**
 * Sentence C: `ssh` refused the host's key on a pinned entry, and named the pin file of the call ({@link hostKeyTold}). *Install
 * creds on host* shows it as it is; the bridge socket check opens it with `The bridge to "<name>" is not open: `. Its advice cannot
 * end in an unchecked connection: with a saved key that parses, Connect SSH keeps enforcing it, and asks before it replaces it.
 */
export function refusedHostKeySentence(name: string): string {
  return `"${name}" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.`;
}

/**
 * Sentence D: the run of a pinned call ended with the verification line, and `ssh` did not name the pin file of the call
 * ({@link hostKeyTold}). It names no host as the one that changed and never tells the person to replace a saved key. The bridge
 * socket check opens it with `The bridge to "<name>" could not be checked: `: the tunnel can be up. Its advice cannot end in an
 * unchecked connection, for the reason of sentence C.
 */
export function unnamedHostKeySentence(name: string): string {
  return `The connection to "${name}" ended with "Host key verification failed", and ssh did not name the saved host key of this entry as the reason. It can be the key of a jump host in your own ssh config, which your own known_hosts file checks, or your ssh config gives this host another name or port than this entry does. Do not replace a saved key because of this message. Connect SSH on this entry checks this host's key again and asks before it changes anything.`;
}
```

**Why each part is as it is.**

- **One function answers both forms, or nothing.** The two branches of the roads then hold no condition of their own and no
  opening: which sentence, and which opening the bridge's form gets with it, is decided in one place (§3.12: "one pure
  function of `hostKeyPin.ts` answers the sentence or nothing").
- **`pin === undefined` first.** For an unpinned call no line is looked at. For a pinned one the function reads `pin.file` and
  nothing else of the pin: not its `word`, which can stand in double quotes (J5).
- **`OFFENDING_KEY_LINE`** is anchored at both ends. `\S+` is the type; `(.+)` is greedy, so the name ends at the last
  `:<digits>` of the line.
- **`unprinted`** undoes the two escapes of J6 and J7 and nothing else. A run of octal escapes is turned into its bytes and
  read as UTF-8 together, because one letter is several bytes (J7). Two backslashes become one. Any other text stays.
- **`namesFile` compares the WHOLE name** with `===`. No `startsWith`, no `includes`, no folder.
- **`refusedHostKeySentence` keeps its words and its export** (J2: the smoke reads it). Only its docblock changes.
- **`unnamedHostKeySentence`** builds sentence D and nothing else. It is exported so that a script of E2.S4 or E3 can read
  the sentence from the product, as the smoke reads sentence C.
- **The docblock of `hostKeyTold` says what was measured, with the date, and what the function cannot tell.** "What it cannot
  tell apart" of `hostKeyRefused` goes with the function (the stories document, E2.S3, *Docs*).
- **Complexity:** each function is at 4 or below (lint, J16 d).

## 3. The product: `commands/agentCommands.ts`

### 3.1 The diff

Against the file of `f3e9887d` (797 lines). E2.S2 changes five other lines of the file and none of these (I5); one of them is
a context line below, the import of `../personPin`. The two branches and the import are found by their text.

```diff
--- a/src_vs_code/src/commands/agentCommands.ts
+++ b/src_vs_code/src/commands/agentCommands.ts
@@ -24,7 +24,7 @@
 import { resolveExecAuth } from '../sshExecAuth';
 import { ReadyCall, withWrittenKey, withWrittenKeyUntilExit } from '../writtenKey';
 import { writePersonPin } from '../personPin';
-import { hostKeyRefused, refusedHostKeySentence } from '../hostKeyPin';
+import { hostKeyTold } from '../hostKeyPin';
 import { probeCommand, blockerFor, interpretProbe, confirmationFor, installCommand, interpretInstall } from '../remoteCliInstall';
 import { entityKey } from '../entityFlags';
 import { parseToken } from '../grantToken';
@@ -213,11 +213,11 @@
           timeoutMs: 15_000,
           signal: agentServer.signal,
         });
-        if (hostKeyRefused(credential.knownHostsFile, outcome.stderr)) {
-          // The ssh of the bridge has no stdio, so this check is the one place that can say why the bridge is not open (G1, P3).
-          const text = `The bridge to "${entity.name}" is not open: ${refusedHostKeySentence(entity.name)}`;
-          log.info('bridge', text);
-          void vscode.window.showErrorMessage(text);
+        const told = hostKeyTold(credential.knownHostsFile, outcome.stderr, entity.name);
+        if (told !== undefined) {
+          // The ssh of the bridge has no stdio, so this check is the one place that can say what the host key check of the bridge came to (G1, P3).
+          log.info('bridge', told.bridge);
+          void vscode.window.showErrorMessage(told.bridge);
           return;
         }
         const probe = interpretSocketProbe(outcome.stdout ?? '');
@@ -280,9 +280,9 @@
       }
 
       const facts = await runRemote(details, credential, probeCommand(), 20_000);
-      if (hostKeyRefused(credential.knownHostsFile, facts.stderr)) {
-        void vscode.window.showErrorMessage(refusedHostKeySentence(node.name));
-        return;
+      const told = hostKeyTold(credential.knownHostsFile, facts.stderr, node.name);
+      if (told !== undefined) {
+        return void vscode.window.showErrorMessage(told.install);
       }
       if (facts.timedOut) {
         void vscode.window.showWarningMessage(
```

### 3.2 In words

1. **The import.** The line of `../hostKeyPin` names `hostKeyTold` in place of the two functions.
2. **The socket check.** Behind the run of the mode check and before `interpretSocketProbe`: the answer of
   `hostKeyTold(credential.knownHostsFile, outcome.stderr, entity.name)` is kept in `told`. When it is there, its `bridge`
   text is written to the log (`log.info('bridge', told.bridge)`) and shown (`showErrorMessage(told.bridge)`), and the check
   returns. The comment line says why this check speaks for the bridge; its words change, because with sentence D the check
   does not say that the bridge is not open.
3. **The install.** Directly behind the probe: the answer of `hostKeyTold(credential.knownHostsFile, facts.stderr, node.name)`
   is kept in `told`. When it is there, the road shows `told.install` as an error and returns, in one statement.
4. Nothing else changes in the file. No road builds a sentence or an opening any more.

### 3.3 The line count

| Step | Lines | How |
|---|---|---|
| `f3e9887d` (E1) | 797 | J1 |
| after E2.S2 | 797 (its spec: 5 lines changed, 0 added) | I5 |
| after this story | **797: +0** | the socket check: 7 lines before and 7 after (the line that built the text goes, the line that keeps the answer comes). The install: 4 lines before and 4 after (the `if` and its two lines become the answer, the `if` and one line that shows and returns). The import: one line before and after |

Measured on the tree of `f3e9887d`: `wc -l` says 797 before and after, and `npm run lint` is clean (J16 d). Three lines stay
under the limit of 800.

**Why the install returns in one statement.** The answer has to be kept in a name, because it is asked once and read once, and
that is one line more than E1's `if (hostKeyRefused(…))`. The branch keeps its four lines with
`return void vscode.window.showErrorMessage(told.install);`. The file's neighbour already writes a message and a return so
(`commands/runCommands.ts:222`, `:374`, `:377`, `:571`). The handler returns `Promise<void>`, and `void <call>` is `undefined`.
The other form, `void …;` and `return;` on two lines, costs one line of the three that are left (*Notes for the lead*).

### 3.4 What a person sees on each road after this story

| The entry and the host | The install | The bridge and its socket check |
|---|---|---|
| unpinned, any host, whatever `ssh` printed | as today | as today |
| pinned, the host presents the pinned key | as today | as today |
| pinned, the host presents ANOTHER key (also one of another type) | ONE error message, sentence C; no question; nothing is installed | the tunnel's `ssh` ends (255), the row goes back to *Open Remote Bridge…*; ONE error message of the socket check, `The bridge to "<name>" is not open: ` + sentence C, and the same line in the log |
| pinned, a jump host of the person's own config refuses its key; or the person's config gives the host another name or port | ONE error message, sentence D; no question; nothing is installed | the tunnel's `ssh` ends (255), the row goes back; ONE error message of the socket check, `The bridge to "<name>" could not be checked: ` + sentence D, and the same line in the log |
| pinned, the host presents the pinned key and the remote side writes the verification line | ONE error message, sentence D; no question; nothing is installed | the bridge stays open, its row stays *bridged*; ONE error message of the socket check, `The bridge to "<name>" could not be checked: ` + sentence D, and the same line in the log |
| pinned, the host is down, does not answer, or refuses the login | as today | as today |
| pinned, a hop refuses its key and the person's config is quiet (J12) | as today: "did not answer the probe" | as today: no message of the check |

## 4. Scenarios

Each row is one test, or one group of tests with one name. "RED" is the text of the first assertion that fails on the product
of `f3e9887d`. A guard is green before and after; a mutation of §8 proves it.

### 4.1 The rows

Part 1 asks the function alone, through the module object, with a checked pin that `testPin` makes (I3). Part 2 runs the real `registerAgentCommands` over the world of
E1.S2, with the real `materializeKnownHosts` and `forgetMaterializedKey` in a real storage folder of `ownedDir`, and a
password login (no key file, so every known-hosts file of the folder is a pin file). The texts that the stand-in of `ssh`
answers are the measured ones (J4 to J11, J14, J15), with `box.example` as the host and with their CR LF. **A text that has
to name the pin file of a run is built from the argv of that run** (`knownHostsOf`, the world's reader): the name is read
back, never guessed, and it is written as `ssh` prints it (`asSshPrints`: a backslash as two, a byte outside printable ASCII
as an octal escape), so that the tests hold on a machine whose temp folder has such a path.

| Id | Setup and action | Expected | RED on `f3e9887d` |
|---|---|---|---|
| S0 (guard) | the printer of the fixtures, `asSshPrints`, on the two names that a real `ssh` printed (J6, J7) and on a name with an apostrophe, a space and a colon | `a\b` is `a\\b`; `Jörg Пётр` is `J\303\266rg \320\237\321\221\321\202\321\200`; the third name as it is | green |
| S1 (10 tests; the parent's test 24, "gives sentence C") | `hostKeyTold` with the checked pin of a file and the 15 lines that name that file: as `ssh` prints them (J4); with LF alone; a path with a space (J5); with a pair of apostrophes (J5); with a colon and digits in it; with a backslash, printed as two (J6); with letters outside ASCII, printed as octal escapes (J7); the same path printed as it is; a path of Windows in the 13 lines of `ssh.exe`, every backslash as two (J8); a saved key of another type (J9) | both forms of sentence C: the sentence, and `The bridge to "box" is not open: ` + the sentence | `hostKeyPin.ts exports no hostKeyTold` |
| S2 (15 tests; test 24, "give sentence D") | the same function with a pin file, on texts that hold the verification line and do not name that file: the 15 lines with the pin file of ANOTHER call (another uuid, the same folder); the lines of a hop (J11); `No ED25519 host key is known` (J10); a remote text that IS the line (J15 i); a remote text that ENDS with the line; the line with no line end; `Add correct host key in <the pin file>` with no `Offending` line; an `Offending` line that names the FOLDER, a name that only STARTS with the pin file, one that only ENDS with it, a name cut before its end, a name with no line number, the line inside a longer line, the line with text behind the number, and `Offending key for IP in <the pin file>:1` | both forms of sentence D: the sentence, and `The bridge to "box" could not be checked: ` + the sentence | the same |
| S3 (test 24, "give nothing") | with a pin file, on seven texts with no verification line: a host that is down, a refused login, no answer (both texts of J14), no text, the words inside a longer line, the words with no full stop | `undefined`, seven times | the same |
| S3b | with a pin file: the `Offending` line of this call and NO verification line | `undefined` | the same |
| S4 (test 24, "an unpinned call gives nothing") | with NO pin (`undefined`), on four texts of S1 and S2 | `undefined`, four times | the same |
| S5 | `unnamedHostKeySentence('box')` and `refusedHostKeySentence('box')` | sentence D and sentence C, word for word, as literals | `hostKeyPin.ts exports no unnamedHostKeySentence` |
| S6 | sentence D, read for what it must and must not say | it holds "Do not replace a saved key because of this message."; it holds none of "did not present", "was rebuilt", "Trust and connect", "forget", "is not open" | the same |
| X0 | the fixtures of part 2: the pin file that the helper reads from an argv, and "another call" | a file of one call (`known_hosts-e1-<uuid>`) that is on the disk; "another call" is another name in the same folder | green |
| X1 (2 tests; test 25, the install, C) | a pinned entry in a storage folder `Application Support`, and in one `it's here`; the probe answers 255 and the 15 lines with the pin file of the probe | the errors are exactly `[sentence C]`; no warning; one run | green (E1 shows sentence C for every verification line) |
| X2 (4 tests; test 25, the install, D) | a pinned entry; the probe answers 255 and: the lines of a hop; the 15 lines with the pin file of ANOTHER call; `No ED25519 host key is known`; the line as a remote command writes it | the errors are exactly `[sentence D]`; no warning; one run; no question; no pin file is left | `X2: a verification line that does not name the pin file of the call was not told with sentence D` — sentence C is not sentence D |
| X3 (test 25, the bridge, D, the tunnel up) | a pinned entry; *Open Remote Bridge…*, its socket check to the end; both runs of the check answer 255 and the line as a remote command writes it; the tunnel is not ended | two runs; the errors are exactly `[The bridge to "box" could not be checked: ` + sentence D`]`; the log holds that line once; no log line about a mode that could not be read; the bridge IS open; one pin file is left, the bridge's | `X3: the socket check did not show ONE error message with the opening "could not be checked" and sentence D` — "is not open" and sentence C |
| X4 (test 25, the bridge, D, the tunnel down) | a pinned entry; the test ends the tunnel with 255; both runs of the check answer 255 and the lines of a hop | the same one error message; the bridge is not open; no pin file is left | `X4: the socket check did not show ONE error message …` — the same |
| X5 (guard; test 25, the bridge, C) | a pinned entry; the test ends the tunnel with 255; the runs of the check answer 255 and the 15 lines with the pin file of their own run | the errors are exactly `[The bridge to "box" is not open: ` + sentence C`]`; the file of the mode check is not the file of the bridge | green |
| X6 (the whole name, on the road) | a pinned entry; the bridge's spawner keeps the pin file of the BRIDGE; both runs of the check answer 255 and the 15 lines with THAT file | the errors are exactly `[… could not be checked: ` + sentence D`]`: the evidence of another call is none | `X6: the evidence of another call was read as the evidence of the check` |
| X7 (guard, 6 tests; test 25, "the guard of test 9 holds for both sentences") | an UNPINNED entry; the install, and the socket check; the run answers 255 and the 15 lines, the lines of a hop, or the line alone | the install: no error, the one warning "did not answer the probe". The check: no error, the log line about a mode that could not be read | green |
| X8 (guard; §3.5, the second run) | a pinned entry; the probe answers; the install run answers 255 and the 15 lines with the pin file of the call | the errors are exactly `[Could not install on "box": the installer produced no result and exited 255.]` | green |

The guard of test 9 for a PINNED entry (a host that is down, a refused login, no answer, the time limit) is E1.S3's T9c and
T9d: they stay as they are and stay green (§4.3). In every RED of X2 to X6 the road ran on the unchanged product as the row
says, and showed E1's sentence C: what is missing is the evidence in the condition.

**Why X1 and X5 are guards and not RED.** E1 shows sentence C for every verification line of a pinned call, so a run with the
evidence shows it before and after. They are here because the evidence must not be lost on the roads: a rule that never finds
it turns them red (Y6 for X1 and X5; Y24 for X5; Y25 for X1), as it turns T9a and T9b red.

### 4.2 New `test/hostKeyTold.test.ts`

The whole file, as measured (49 tests, 358 lines). Written FIRST, on the product before this story, and
watched there (§5).

```ts
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { after, test, TestContext } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import * as hostKeyPin from '../hostKeyPin';
import { KEY, Parts, World, click, knownHostsOf, passwordLogin, pinFiles, ran, settled, world } from './personRoadsWorld';
import { testPin } from './pinnedArgv';

/**
 * G1, E2.S3: what a person is told when a PINNED call ended with `ssh`'s line `Host key verification failed.`. Sentence C names the
 * entry's host as the cause, so it is shown only on evidence: `ssh`'s own line `Offending <type> key in <file>:<n>` that names the
 * pin file of THIS call. The verification line without that evidence gets sentence D, which names no host as the cause.
 *
 * <p><b>Part 1</b> is the one function alone (`hostKeyTold` of `hostKeyPin.ts`), on the texts that a real `ssh` printed. <b>Part
 * 2</b> is the two roads that show its answer, driven as the extension registers them, over the world of `personRoadsWorld.ts`.</p>
 *
 * <p>The texts are those of OpenSSH 10.2p1 with the words of a pinned call and `LogLevel=ERROR`, measured by hand on 2026-11-18
 * against public `sshd`s (the pin file held another key; no login was attempted). The file that a text names is always handed in:
 * a road test reads it back from the argv of the run, it is never guessed. No test of this file starts a process: that a real `ssh`
 * prints the line with the pin file of a call through these roads is shown by the smoke (section 10 of `scripts/ssh-agent-itest.cjs`).
 * One text is that of `ssh.exe` (OpenSSH_for_Windows 9.5p2, the same day): 13 lines, with every backslash of the path as two.</p>
 */

const scope = cleanupScope();
after(() => scope.close());

const SENTENCE_C =
  '"box" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.';
const SENTENCE_D =
  'The connection to "box" ended with "Host key verification failed", and ssh did not name the saved host key of this entry as the reason. It can be the key of a jump host in your own ssh config, which your own known_hosts file checks, or your ssh config gives this host another name or port than this entry does. Do not replace a saved key because of this message. Connect SSH on this entry checks this host\'s key again and asks before it changes anything.';
const TOLD_C = { install: SENTENCE_C, bridge: `The bridge to "box" is not open: ${SENTENCE_C}` };
const TOLD_D = { install: SENTENCE_D, bridge: `The bridge to "box" could not be checked: ${SENTENCE_D}` };

/** The lines of a real `ssh` as it prints them: it ends its own lines with CR LF, also on Linux. */
const printed = (...lines: string[]): string => lines.map((line) => `${line}\r\n`).join('');

/**
 * A file name as `ssh` prints it: a backslash as two, and each byte outside printable ASCII as a backslash and three octal digits
 * (measured; S0 holds this helper to the two names that were printed). A road test passes the pin file of its run through it, so
 * that its text is the one a real `ssh` would print on every platform: on Windows every path has backslashes.
 */
const asSshPrints = (name: string): string =>
  [...Buffer.from(name, 'utf8')].map((byte) => (byte === 0x5c ? '\\\\' : byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : `\\${byte.toString(8).padStart(3, '0')}`)).join('');

/**
 * What `ssh` prints when the key that `host` presents is not the one in the file it names: 15 lines, exit code 255. `named` is the
 * file AS `ssh` PRINTS IT. The line `Add correct host key in` is cut at 100 characters; the `Offending` line holds the whole name.
 */
const refusedKey = (named: string, host = 'box.example'): string =>
  printed(
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    '@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @',
    '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
    'IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!',
    'Someone could be eavesdropping on you right now (man-in-the-middle attack)!',
    'It is also possible that a host key has just been changed.',
    'The fingerprint for the ED25519 key sent by the remote host is\nSHA256:LffarYzG0qeh+MC4Rg4fmMufJMJIjrjBIuqoQgUO2YE.',
    'Please contact your system administrator.',
    `Add correct host key in ${named.slice(0, 100)} to get rid of this message.`,
    `Offending ED25519 key in ${named}:1`,
    '  remove with:',
    `  ssh-keygen -f '${named}' -R '${host}'`,
    `Host key for ${host} has changed and you have requested strict checking.`,
    'Host key verification failed.',
  );

/** The same refusal as `ssh.exe` of OpenSSH_for_Windows 9.5p2 prints it: 13 lines, without the two lines about `ssh-keygen`. */
const refusedKeyOnWindows = (named: string): string => refusedKey(named).split('\r\n').filter((line) => !line.startsWith('  ')).join('\r\n');

const FOLDER = '/storage/keys/4242';
/** The pin file of the call that is asked about, and the pin file of ANOTHER call of the same entry in the same folder. */
const PIN_FILE = `${FOLDER}/known_hosts-e1-3f2b8c1e-7a4d-4e9b-9c55-0d1e2f3a4b5c`;
const OTHER_CALL = `${FOLDER}/known_hosts-e1-9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d`;
const VERIFICATION = 'Host key verification failed.';

/** A hop of the person's own `ProxyJump` whose key the nested `ssh` refused: the same 15 lines, and they name the person's file. */
const HOP_REFUSED = refusedKey('/home/dev/.ssh/known_hosts', 'hop.example');
/** `ssh` found no key for the name it looked up: a config that gives the host another name or port, or a file with no key for it. */
const NO_KEY_KNOWN = printed('No ED25519 host key is known for box.example and you have requested strict checking.', VERIFICATION);
const HOST_DOWN = printed('ssh: connect to host box.example port 22: Connection refused');
const LOGIN_REFUSED = printed('dev@box.example: Permission denied (publickey,password).');
const NO_ANSWER = printed('ssh: connect to host box.example port 22: Connection timed out');
const NO_BANNER = printed('Connection timed out during banner exchange');

/* --- part 1: the one function --- */

/** `hostKeyTold`. Its first argument is the checked pin of the call (E2.S2's `CheckedPin`): a test makes one with `testPin`, through the product's own maker. */
type Told = (pin: unknown, stderr: string, name: string) => { install: string; bridge: string } | undefined;

/** An export of `hostKeyPin.ts`, read through the module object: this file compiles before the export exists, so its absence is a failed assertion. */
function exported<T>(name: string): T {
  const found = (hostKeyPin as Record<string, unknown>)[name];
  assert.equal(typeof found, 'function', `hostKeyPin.ts exports no ${name}`);
  return found as T;
}

test('S0 (guard): the printer of the fixtures writes a name as ssh printed it: a backslash as two, a letter outside ASCII as octal escapes, the rest as it is', () => {
  assert.equal(asSshPrints('/st/a\\b/keys/4242/known_hosts-e1-3f2b8c1e'), '/st/a\\\\b/keys/4242/known_hosts-e1-3f2b8c1e');
  assert.equal(asSshPrints('/st/Jörg Пётр/keys'), '/st/J\\303\\266rg \\320\\237\\321\\221\\321\\202\\321\\200/keys');
  assert.equal(asSshPrints("/st/it's here/a:1"), "/st/it's here/a:1");
});

/** Texts in which `ssh` names the pin file of THIS call beside the verification line: the file as the call knows it, and the text. */
const EVIDENCE: readonly { label: string; pinFile: string; stderr: string }[] = [
  { label: 'the 15 lines as ssh prints them, with CR LF', pinFile: PIN_FILE, stderr: refusedKey(PIN_FILE) },
  { label: 'the same lines ended with LF alone', pinFile: PIN_FILE, stderr: refusedKey(PIN_FILE).replaceAll('\r\n', '\n') },
  { label: 'a path with a space (the word was in double quotes; ssh prints the path with none)', pinFile: '/Users/dev/Library/Application Support/keys/4242/known_hosts-e1-3f2b8c1e', stderr: refusedKey('/Users/dev/Library/Application Support/keys/4242/known_hosts-e1-3f2b8c1e') },
  { label: 'a path with a pair of apostrophes', pinFile: "/home/dev/a'b'c/keys/4242/known_hosts-e1-3f2b8c1e", stderr: refusedKey("/home/dev/a'b'c/keys/4242/known_hosts-e1-3f2b8c1e") },
  { label: 'a path with a colon and digits in it', pinFile: '/home/dev/v:2/keys/4242/known_hosts-e1-3f2b8c1e', stderr: refusedKey('/home/dev/v:2/keys/4242/known_hosts-e1-3f2b8c1e') },
  { label: 'a path with a backslash, which ssh prints as two', pinFile: '/home/dev/a\\b/keys/4242/known_hosts-e1-3f2b8c1e', stderr: refusedKey('/home/dev/a\\\\b/keys/4242/known_hosts-e1-3f2b8c1e') },
  { label: 'a path with letters outside ASCII, which ssh prints byte by byte as a backslash and three octal digits', pinFile: '/home/dev/Jörg Пётр/keys/4242/known_hosts-e1-3f2b8c1e', stderr: refusedKey('/home/dev/J\\303\\266rg \\320\\237\\321\\221\\321\\202\\321\\200/keys/4242/known_hosts-e1-3f2b8c1e') },
  { label: 'the same path printed as it is', pinFile: '/home/dev/Jörg Пётр/keys/4242/known_hosts-e1-3f2b8c1e', stderr: refusedKey('/home/dev/Jörg Пётр/keys/4242/known_hosts-e1-3f2b8c1e') },
  { label: 'a path of Windows, as ssh.exe prints it: every backslash as two (a path with a drive letter was not run)', pinFile: 'C:\\Users\\dev\\keys\\4242\\known_hosts-e1-3f2b8c1e', stderr: refusedKeyOnWindows('C:\\\\Users\\\\dev\\\\keys\\\\4242\\\\known_hosts-e1-3f2b8c1e') },
  { label: 'a key of another type', pinFile: PIN_FILE, stderr: refusedKey(PIN_FILE).replaceAll('ED25519', 'RSA') },
];

for (const row of EVIDENCE) {
  test(`S1: ssh names the pin file of this call beside the verification line, ${row.label}: sentence C in both forms`, () => {
    const hostKeyTold = exported<Told>('hostKeyTold');

    assert.deepEqual(hostKeyTold(testPin(row.pinFile), row.stderr, 'box'), TOLD_C);
  });
}

/** The line that names a file, as the only line before the verification line. */
const offending = (line: string): string => printed(line, VERIFICATION);

/** Texts that hold the verification line and do NOT name the pin file of this call. */
const NO_EVIDENCE: readonly { label: string; stderr: string }[] = [
  { label: 'the lines name the pin file of ANOTHER call (another uuid, the same folder)', stderr: refusedKey(OTHER_CALL) },
  { label: "a hop of the person's own ProxyJump: the nested ssh names the person's own known_hosts", stderr: HOP_REFUSED },
  { label: 'ssh found no key for the name it looked up', stderr: NO_KEY_KNOWN },
  { label: 'a remote text that IS the line', stderr: `${VERIFICATION}\n` },
  { label: 'a remote text that ENDS with the line', stderr: `profile: sourcing extras\nfetch failed\n${VERIFICATION}\n` },
  { label: 'the line with no line end', stderr: VERIFICATION },
  { label: 'the line "Add correct host key in" names the pin file, and no Offending line does', stderr: offending(`Add correct host key in ${PIN_FILE} to get rid of this message.`) },
  { label: 'the Offending line names the FOLDER of the pin file', stderr: offending(`Offending ED25519 key in ${FOLDER}:1`) },
  { label: 'the Offending line names a file whose name only STARTS with the pin file', stderr: offending(`Offending ED25519 key in ${PIN_FILE}.old:1`) },
  { label: 'the Offending line names a file whose name only ENDS with the pin file', stderr: offending(`Offending ED25519 key in /mnt/copy${PIN_FILE}:1`) },
  { label: 'the Offending line is cut before the end of the name', stderr: offending(`Offending ED25519 key in ${PIN_FILE.slice(0, -4)}:1`) },
  { label: 'the Offending line has no line number', stderr: offending(`Offending ED25519 key in ${PIN_FILE}`) },
  { label: 'the Offending line stands inside a longer line', stderr: offending(`remote: Offending ED25519 key in ${PIN_FILE}:1`) },
  { label: 'the Offending line has more text behind the line number', stderr: offending(`Offending ED25519 key in ${PIN_FILE}:1 (or so)`) },
  { label: 'the line about a key for an IP address', stderr: offending(`Offending key for IP in ${PIN_FILE}:1`) },
];

for (const row of NO_EVIDENCE) {
  test(`S2: the verification line with no evidence, ${row.label}: sentence D in both forms, never sentence C`, () => {
    const hostKeyTold = exported<Told>('hostKeyTold');

    assert.deepEqual(hostKeyTold(testPin(PIN_FILE), row.stderr, 'box'), TOLD_D);
  });
}

test('S3: a pinned call whose stderr holds no verification line is told nothing: a host that is down, a refused login, no answer, no text, words inside another line', () => {
  const hostKeyTold = exported<Told>('hostKeyTold');

  for (const stderr of [HOST_DOWN, LOGIN_REFUSED, NO_ANSWER, NO_BANNER, '', printed(`note: ${VERIFICATION} earlier`), printed('Host key verification failed')]) {
    assert.equal(hostKeyTold(testPin(PIN_FILE), stderr, 'box'), undefined, stderr);
  }
});

test('S3b: the Offending line of this call WITHOUT the verification line is told nothing: both lines are needed', () => {
  const hostKeyTold = exported<Told>('hostKeyTold');

  assert.equal(hostKeyTold(testPin(PIN_FILE), printed(`Offending ED25519 key in ${PIN_FILE}:1`), 'box'), undefined);
});

test('S4: an unpinned call is told nothing, whatever its ssh printed', () => {
  const hostKeyTold = exported<Told>('hostKeyTold');

  for (const stderr of [refusedKey(PIN_FILE), HOP_REFUSED, NO_KEY_KNOWN, `${VERIFICATION}\n`]) {
    assert.equal(hostKeyTold(undefined, stderr, 'box'), undefined, stderr);
  }
});

test('S5: sentence D, word for word, and sentence C as E1 wrote it', () => {
  const unnamedHostKeySentence = exported<(name: string) => string>('unnamedHostKeySentence');
  const refusedHostKeySentence = exported<(name: string) => string>('refusedHostKeySentence');

  assert.equal(unnamedHostKeySentence('box'), SENTENCE_D);
  assert.equal(refusedHostKeySentence('box'), SENTENCE_C);
});

test('S6: sentence D never tells the person to replace, trust or forget a saved key, and names no host as the one that changed', () => {
  const unnamedHostKeySentence = exported<(name: string) => string>('unnamedHostKeySentence');
  const sentence = unnamedHostKeySentence('box');

  assert.match(sentence, /Do not replace a saved key because of this message\./);
  assert.doesNotMatch(sentence, /did not present|was rebuilt|Trust and connect|[Ff]orget|is not open/);
});

/* --- part 2: the two roads --- */

const HOST_KEY = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' };
const PIN = hostKeyPin.formatHostKey(HOST_KEY);
const PROBE_OK = 'creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n';
const NOT_READ = 'its mode could not be read';

const yes = (_message: string, rest: readonly unknown[]): string | undefined => rest.find((one): one is string => typeof one === 'string');

/** A real storage folder of one test: owned, and removed when this file's tests end. */
const storage = (what: string): string => ownedDir(scope, what);

/** A pinned entry with a password login, in a real storage folder: no key file, so every known-hosts file of the folder is a pin file. */
const pinned = (dir: string, parts: Parts = {}): Parts => ({ storageDir: dir, hostKey: PIN, realForget: true, clicks: [passwordLogin(), passwordLogin()], checks: [passwordLogin()], ...parts });

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

/** The pin file that the argv of a run names, read back from the argv: the file of THIS call. */
function pinFileOf(argv: readonly string[]): string {
  const named = knownHostsOf(argv);
  assert.ok(named !== undefined && named.text !== undefined, 'the run of a pinned entry names no pin file that is on the disk');
  return named.file;
}

/** The pin file of another call of the same entry: the same folder, another uuid. */
const otherCallOf = (argv: readonly string[]): string => pinFileOf(argv).replace(/[0-9a-f-]{36}$/, '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d');

test('X0: the fixtures of part 2 are what they say: the pin file of a run is a file of one call, and "another call" is another file of its folder', async () => {
  const dir = storage('x0');
  const seen: string[][] = [];
  const w = world(pinned(dir, { run: (_index, argv) => { seen.push([pinFileOf(argv), otherCallOf(argv)]); return ran(PROBE_OK); } }));
  await click(w, 'installRemoteCli');

  assert.equal(seen.length, 1);
  assert.match(seen[0][0], /known_hosts-e1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(seen[0][1], seen[0][0]);
  assert.equal(seen[0][1].slice(0, -36), seen[0][0].slice(0, -36));
});

for (const folder of ['Application Support', "it's here"]) {
  test(`X1: the install shows sentence C when ssh names the pin file of the probe, in a storage folder named "${folder}"`, async () => {
    const dir = `${storage('x1')}/${folder}`;
    fs.mkdirSync(dir, { recursive: true });
    const w = world(pinned(dir, { answer: yes, run: (_index, argv) => ran('', 255, refusedKey(asSshPrints(pinFileOf(argv)))) }));
    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [SENTENCE_C], 'X1: a refused host key with the evidence of the call was not told with sentence C');
    assert.deepEqual(w.warnings, []);
    assert.equal(w.runs.length, 1, 'X1: the install went on after a refused host key');
  });
}

const INSTALL_D: readonly { label: string; stderr: (argv: readonly string[]) => string }[] = [
  { label: "a hop of the person's own config was refused", stderr: () => HOP_REFUSED },
  { label: 'ssh names the pin file of ANOTHER call', stderr: (argv) => refusedKey(asSshPrints(otherCallOf(argv))) },
  { label: 'ssh found no key for the name it looked up', stderr: () => NO_KEY_KNOWN },
  { label: 'the remote side wrote the line', stderr: () => `${VERIFICATION}\n` },
];

for (const row of INSTALL_D) {
  test(`X2: the install shows sentence D, and not sentence C, when ${row.label}`, async () => {
    const dir = storage('x2');
    const w = world(pinned(dir, { answer: yes, run: (_index, argv) => ran('', 255, row.stderr(argv)) }));
    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [SENTENCE_D], 'X2: a verification line that does not name the pin file of the call was not told with sentence D');
    assert.deepEqual(w.warnings, [], `X2: it was told as something else too: ${w.warnings.join(' | ')}`);
    assert.equal(w.runs.length, 1, 'X2: the install went on');
    assert.deepEqual(w.asked, [], 'X2: the install asked its question');
    assert.deepEqual(pinFiles(dir), [], 'X2: the install left its pin file');
  });
}

test('X3: the socket check shows ONE error message, "could not be checked" and sentence D, when the remote side wrote the line; the tunnel is up and stays', async (t) => {
  const dir = storage('x3');
  const w = await bridged(t, pinned(dir, { run: () => ran('', 255, `${VERIFICATION}\n`) }));

  assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
  assert.deepEqual(w.errors, [TOLD_D.bridge], 'X3: the socket check did not show ONE error message with the opening "could not be checked" and sentence D');
  assert.deepEqual(w.logs.filter((line) => line === TOLD_D.bridge), [TOLD_D.bridge], 'X3: the message of the check is not in the log once');
  assert.equal(w.logs.some((line) => line.includes(NOT_READ)), false, 'X3: the check also logged a socket that is there');
  assert.equal(w.bridges.isOpen(KEY), true, 'X3: the check closed a bridge whose tunnel is up');
  assert.equal(pinFiles(dir).length, 1, 'X3: the check left its pin file, or deleted the pin file of the bridge');
});

test('X4: the socket check shows the same message when a hop was refused and the tunnel has ended', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dir = storage('x4');
  const w = world(pinned(dir, { run: () => ran('', 255, HOP_REFUSED) }));
  await click(w, 'openRemoteBridge');
  await settled();
  w.children[0].end(255); // the ssh of the bridge met the same hop; it has no stdio, so it says nothing
  await settled();
  t.mock.timers.tick(1500);
  await settled();

  assert.deepEqual(w.errors, [TOLD_D.bridge], 'X4: the socket check did not show ONE error message with the opening "could not be checked" and sentence D');
  assert.equal(w.bridges.isOpen(KEY), false);
  assert.deepEqual(pinFiles(dir), [], 'X4: a pin file stays after the bridge and its check have ended');
});

test('X5: the socket check shows "is not open" and sentence C when ssh names the pin file of the mode check, and not the file of the bridge', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dir = storage('x5');
  const w = world(pinned(dir, { run: (_index, argv) => ran('', 255, refusedKey(asSshPrints(pinFileOf(argv)))) }));
  await click(w, 'openRemoteBridge');
  await settled();
  w.children[0].end(255);
  await settled();
  t.mock.timers.tick(1500);
  await settled();

  assert.deepEqual(w.errors, [TOLD_C.bridge], 'X5: a refused host key with the evidence of the check was not told with "is not open" and sentence C');
  assert.notEqual(w.runs[1].knownHosts?.file, knownHostsOf(w.bridgeArgvs[0])?.file, 'X5: the check read the pin file of the bridge');
});

test('X6: the socket check shows sentence D when ssh names the pin file of the BRIDGE and not the file of the check', async (t) => {
  const dir = storage('x6');
  const ofBridge: string[] = [];
  const spawn: Parts['spawn'] = (_command, argv) => { ofBridge.push(pinFileOf(argv)); return { exited: new Promise<number | null>(() => {}), kill: (): void => undefined }; };
  const w = await bridged(t, pinned(dir, { spawn, run: () => ran('', 255, refusedKey(asSshPrints(ofBridge[0]))) }));

  assert.deepEqual(w.errors, [TOLD_D.bridge], 'X6: the evidence of another call was read as the evidence of the check');
});

/** Runs of an UNPINNED entry whose stderr holds the verification line: the sentences of before, on both roads. */
const UNPINNED: readonly { label: string; stderr: string }[] = [
  { label: 'the 15 lines', stderr: refusedKey(PIN_FILE) },
  { label: 'the lines of a hop', stderr: HOP_REFUSED },
  { label: 'the line alone', stderr: `${VERIFICATION}\n` },
];

for (const row of UNPINNED) {
  test(`X7 (guard): the install on an UNPINNED entry whose ssh printed ${row.label} shows the sentence of before, and neither sentence C nor D`, async () => {
    const w = world(pinned(storage('x7'), { hostKey: undefined, run: () => ran('', 255, row.stderr) }));
    await click(w, 'installRemoteCli');

    assert.deepEqual(w.errors, [], `X7: an unpinned entry was told about a saved host key: ${w.errors.join(' | ')}`);
    assert.equal(w.warnings.length, 1, `the install did not show one warning: ${w.warnings.join(' | ')}`);
    assert.match(w.warnings[0], /did not answer the probe/);
  });

  test(`X7 (guard): the socket check on an UNPINNED entry whose ssh printed ${row.label} shows no message and logs the mode as not read`, async (t) => {
    const w = await bridged(t, pinned(storage('x7'), { hostKey: undefined, run: () => ran('', 255, row.stderr) }));

    assert.deepEqual(w.errors, [], `X7: an unpinned entry was told about a saved host key: ${w.errors.join(' | ')}`);
    assert.ok(w.logs.some((line) => line.includes(NOT_READ)), `the unreadable mode was not logged: ${w.logs.join(' | ')}`);
  });
}

test('X8 (guard): the SECOND run of the install keeps the sentence of before, also when ssh names the pin file of the call', async () => {
  const w = world(pinned(storage('x8'), { answer: yes, run: (index, argv) => (index === 0 ? ran(PROBE_OK) : ran('', 255, refusedKey(asSshPrints(pinFileOf(argv))))) }));
  await click(w, 'installRemoteCli');

  assert.equal(w.runs.length, 2);
  assert.deepEqual(w.errors, ['Could not install on "box": the installer produced no result and exited 255.']);
});
```

### 4.3 `test/personRoadsHostKey.test.ts`: two fixtures, and four tests that go with their function

```diff
--- a/src_vs_code/src/test/personRoadsHostKey.test.ts
+++ b/src_vs_code/src/test/personRoadsHostKey.test.ts
@@ -65,6 +65,4 @@
 );
-/** The pin file holds no key for the host (E1.S1's file for a path that cannot be named). */
-const NO_KEY_KNOWN = printed('No ED25519 host key is known for box.example and you have requested strict checking.', 'Host key verification failed.');
-/** A person's config says `LogLevel FATAL`: the one line is all that is printed. */
-const ONLY_THE_LINE = printed('Host key verification failed.');
+/** The same 15 lines, naming the pin file of THIS run, read back from its argv and written as `ssh` prints it (a backslash as two): sentence C needs that line (E2.S3). */
+const refusedKeyOf = (argv: readonly string[]): string => REFUSED_KEY.replaceAll('/storage/keys/4242/known_hosts-e1-0b6f3c1e', (knownHostsOf(argv)?.file ?? '(the argv names no known-hosts file)').replaceAll('\\', '\\\\'));
 const HOST_DOWN = printed('ssh: connect to host box.example port 22: Connection refused');
@@ -72,4 +70,2 @@
 const NO_ANSWER = printed('ssh: connect to host box.example port 22: Connection timed out');
-/** A hop of the person's own `ProxyJump` whose key `ssh` refused: the nested `ssh` prints the same line, the outer one a line more. */
-const HOP_REFUSED = `${REFUSED_KEY}${printed('Connection closed by UNKNOWN port 65535')}`;
 
@@ -103,39 +99,2 @@
 
-type Match = (pinFile: string | undefined, stderr: string) => boolean;
-
-const A_PIN_FILE = '/storage/keys/4242/known_hosts-e1-0b6f3c1e';
-
-test('H1: a refused host key is a PINNED call whose ssh printed the line "Host key verification failed."', () => {
-  const hostKeyRefused = exported<Match>('hostKeyRefused');
-
-  assert.equal(hostKeyRefused(A_PIN_FILE, REFUSED_KEY), true, 'the text of a host with another key');
-  assert.equal(hostKeyRefused(A_PIN_FILE, NO_KEY_KNOWN), true, 'the text of a pin file that holds no key for the host');
-  assert.equal(hostKeyRefused(A_PIN_FILE, ONLY_THE_LINE), true, 'the line alone');
-  assert.equal(hostKeyRefused(A_PIN_FILE, REFUSED_KEY.replaceAll('\r\n', '\n')), true, 'lines that end with LF alone');
-  assert.equal(hostKeyRefused(A_PIN_FILE, 'Host key verification failed.'), true, 'the line with no line end');
-});
-
-test('H2: an unpinned call is never a refused host key, whatever ssh printed', () => {
-  const hostKeyRefused = exported<Match>('hostKeyRefused');
-
-  for (const stderr of [REFUSED_KEY, NO_KEY_KNOWN, ONLY_THE_LINE]) {
-    assert.equal(hostKeyRefused(undefined, stderr), false);
-  }
-});
-
-test('H3: a host that is down, a refused login, a host that does not answer, no text, and the words inside another line are no refused host key', () => {
-  const hostKeyRefused = exported<Match>('hostKeyRefused');
-
-  for (const stderr of [HOST_DOWN, LOGIN_REFUSED, NO_ANSWER, '', printed('note: Host key verification failed. earlier'), printed('Host key verification failed')]) {
-    assert.equal(hostKeyRefused(A_PIN_FILE, stderr), false, stderr);
-  }
-});
-
-test('H4: what the match cannot tell from a refused host key of the entry: a hop of the person\'s own config, and a host that prints the line itself', () => {
-  const hostKeyRefused = exported<Match>('hostKeyRefused');
-
-  assert.equal(hostKeyRefused(A_PIN_FILE, HOP_REFUSED), true);
-  assert.equal(hostKeyRefused(A_PIN_FILE, 'Host key verification failed.\n'), true);
-});
-
 test('H5: sentence C, word for word', () => {
@@ -360,3 +319,3 @@
   const dir = storage('t9a');
-  const w = world(pinned(dir, { answer: yes, run: () => ran('', 255, REFUSED_KEY) }));
+  const w = world(pinned(dir, { answer: yes, run: (_index, argv) => ran('', 255, refusedKeyOf(argv)) }));
   await click(w, 'installRemoteCli');
@@ -373,3 +332,3 @@
   const dir = storage('t9b');
-  const w = world(pinned(dir, { run: () => ran('', 255, REFUSED_KEY) }));
+  const w = world(pinned(dir, { run: (_index, argv) => ran('', 255, refusedKeyOf(argv)) }));
   await click(w, 'openRemoteBridge');
```

**In step 1 (with the new test file, before the product):** only the helper `refusedKeyOf` and the two changed lines of T9a
and T9b. The helper writes the name as `ssh` prints it, a backslash as two. E1's fixture named a file that no call has (`/storage/keys/4242/known_hosts-e1-0b6f3c1e`); after this story that text
is sentence D. The two tests now answer the same 15 lines with the pin file of their own run, read back from its argv. They
are green before the product changes (E1 asks for no evidence) and after. The commit names them (the parent's §5: "the commit
that changes it names it").

**In step 2 (with the product):** H1 to H4 go, with the type `Match`, the constant `A_PIN_FILE` and the three fixtures that
only they read (`NO_KEY_KNOWN`, `ONLY_THE_LINE`, `HOP_REFUSED`; the compiler refuses an unread constant). They asked
`hostKeyRefused`, which is gone. Nothing of them is lost; the commit names them with this table:

| E1.S3's test | What it held | Where it is held now |
|---|---|---|
| H1 | five texts are a refused host key: another key; no key for the host; the line alone; LF alone; no line end | another key and LF alone: S1 (sentence C, with the evidence). No key for the host, the line alone, no line end: S2 (sentence D: the three were told as a changed host, and are not one) |
| H2 | an unpinned call never | S4 |
| H3 | six texts are none | S3 (the same six, and one more) |
| H4 | a hop and a remote line are told as a refused key of the entry, "held as it is" | S2: both are sentence D. This is the repair |

H5 (sentence C, word for word), T1 to T4, T9c, T9d, T9e and T11 do not change. T9c and T9d are the guard of test 9 for both
sentences on a pinned entry: a host that is down, a refused login, no answer and the time limit show no error.

### 4.4 Existing tests do not change

`test/personRoadsPin.test.ts` (28), `test/personPin.test.ts` (10), `test/writtenKey.test.ts` (18),
`test/personRoadsForgetKey.test.ts` (15), `test/bridgeKeyHandoff.test.ts` (9), `test/hostKeyWords.test.ts` (18),
`test/hostKeyPin.test.ts` (10), `test/launchRoadScan.test.ts` (10), `test/noConnectionSharing.test.ts` (9) and
`test/promptSites.test.ts` (16) run with no edit and pass (J16 c; the counts are those of `f3e9887d`, and E2.S1 and E2.S2 can
have changed them). If an existing test turns red after §2 and §3, stop and tell the lead.

## 5. The RED texts (the product of `f3e9887d`, J16 b)

`hostKeyTold.test.js` on the unchanged product: 49 tests, 12 pass, 37 fail. The first lines of each failure, as the
runner printed them; a group of tests with one name and one text is printed once:

```text
✖ S1: ssh names the pin file of this call beside the verification line, the 15 lines as ssh prints them, with CR LF: sentence C in both forms
  (and the nine others of S1)
✖ S2: the verification line with no evidence, the lines name the pin file of ANOTHER call (another uuid, the same folder): sentence D in both forms, never sentence C
  (and the fourteen others of S2)
✖ S3: a pinned call whose stderr holds no verification line is told nothing: a host that is down, a refused login, no answer, no text, words inside another line
✖ S3b: the Offending line of this call WITHOUT the verification line is told nothing: both lines are needed
✖ S4: an unpinned call is told nothing, whatever its ssh printed
  AssertionError [ERR_ASSERTION]: hostKeyPin.ts exports no hostKeyTold
  + 'undefined'
  - 'function'
✖ S5: sentence D, word for word, and sentence C as E1 wrote it
✖ S6: sentence D never tells the person to replace, trust or forget a saved key, and names no host as the one that changed
  AssertionError [ERR_ASSERTION]: hostKeyPin.ts exports no unnamedHostKeySentence
  + 'undefined'
  - 'function'
✖ X2: the install shows sentence D, and not sentence C, when a hop of the person's own config was refused
  (and the three others of X2: ssh names the pin file of ANOTHER call, ssh found no key for the name it looked up, the remote side wrote the line)
  AssertionError [ERR_ASSERTION]: X2: a verification line that does not name the pin file of the call was not told with sentence D
    [
  +   '"box" did not present its saved host key, so CredsForDevs did not connect. If this server was rebuilt, use Connect SSH on this entry: it shows the new key and asks before it replaces the saved one. If it was not, do not connect.'
  -   `The connection to "box" ended with "Host key verification failed", and ssh did not name the saved host key of this entry as the reason. […]`
    ]
✖ X3: the socket check shows ONE error message, "could not be checked" and sentence D, when the remote side wrote the line; the tunnel is up and stays
  AssertionError [ERR_ASSERTION]: X3: the socket check did not show ONE error message with the opening "could not be checked" and sentence D
    [
  +   'The bridge to "box" is not open: "box" did not present its saved host key, so CredsForDevs did not connect. […]'
  -   `The bridge to "box" could not be checked: The connection to "box" ended with "Host key verification failed", […]`
    ]
✖ X4: the socket check shows the same message when a hop was refused and the tunnel has ended
  AssertionError [ERR_ASSERTION]: X4: the socket check did not show ONE error message with the opening "could not be checked" and sentence D
✖ X6: the socket check shows sentence D when ssh names the pin file of the BRIDGE and not the file of the check
  AssertionError [ERR_ASSERTION]: X6: the evidence of another call was read as the evidence of the check
```

Each is the right reason: the two functions do not exist; and on the roads E1 shows sentence C, with "is not open" on the
bridge, for a hop, for another call's file, for a name that `ssh` did not find and for a remote line. The coder's own RED run
must show these 37 and no other. A different text, or a 38th failure, is a reason to stop.

## 6. The documents of this story

Three documents, in a commit of their own. The texts below are what each must say; fit the wording to the lines around it, and
keep every fact. E2.S2 wrote into the same places before this story (the stories document, E2.S2, *Docs*); if a sentence that
this section names is not there, stop and tell the lead.

**6.1 `src_vs_code/CHANGELOG.md`, under `## [Unreleased]`,** in the entry `### Changed — security: …`, its first paragraph. No
version heading: the release writes it. The sentence "A host key that a jump host of your own `ProxyJump` refuses is told with
the same sentence." is replaced by:

```markdown
The sentence about the saved host key is shown only when `ssh` itself names the saved key of this entry as the key that does
not fit. When `ssh` ends with `Host key verification failed` and does not name it, the message is another one: `The connection
to "<name>" ended with "Host key verification failed", and ssh did not name the saved host key of this entry as the reason. It
can be the key of a jump host in your own ssh config, which your own known_hosts file checks, or your ssh config gives this
host another name or port than this entry does. Do not replace a saved key because of this message. Connect SSH on this entry
checks this host's key again and asks before it changes anything.` A host key that a jump host of your own `ProxyJump` refuses
is told so, and so is a remote command that prints that line. After *Open Remote Bridge…* the socket check opens this message
with `The bridge to "<name>" could not be checked: `, because the bridge itself can be up. Measured by hand (OpenSSH 10.2p1):
when your own `ssh` config gives the entry's host another name or port (`HostName`, `Port`), `ssh` looks for the saved key
under that name, does not find it, and the call is refused with this message.
```

The last sentence states a fact of E1 that no test of the suite and no row of E3 holds (J10). E2.S4 lists the claims of the
entry with their tests; it lists this one as "measured by hand" (*Notes for the lead*).

**6.2 `research/module_extension.md`,** the paragraph **B10 — the host key**, in E1.S3's paragraph "**The three roads of the
person (G1, E1.S3).**". Its text from "A host key that `ssh` refused is told to the person" to its end is replaced by:

```markdown
What a person is told when a pinned call ended with `ssh`'s line `Host key verification failed.` is decided by one function,
`hostKeyTold` in `hostKeyPin.ts` (G1, E2.S3). **Sentence C** (`refusedHostKeySentence`: the entry's host did not present its
saved key) is shown only on evidence: `ssh`'s own line `Offending <type> key in <file>:<n>`, with the pin file of THIS call as
the whole name. Only the `ssh` that was handed that file reads it, and its name ends with a uuid of this call alone; the nested
`ssh` of a jump host names the files of the person's own config, and a remote command never learns the name. `ssh` prints a
name otherwise than it is (a path in double quotes with none, a backslash as two, a byte outside printable ASCII as a backslash
and three octal digits), so the function is handed the path, not the word, and reads the printed name back. **Sentence D**
(`unnamedHostKeySentence`) is shown for the verification line without that evidence: a jump host's refused key, an `ssh` config
that gives the host another name or port, a remote text. It names no host as the cause and tells the person not to replace a
saved key. The install shows either sentence for its probe, as an error in place of "the host did not answer the probe". The
socket check shows it for the bridge, as an error message, and writes it to the log, because the tunnel's `ssh` has no stdio:
`The bridge to "<name>" is not open: ` with sentence C, `The bridge to "<name>" could not be checked: ` with sentence D (the
tunnel can be up). A host that is down, a host that does not answer, a refused login, a run with no text and every run of an
entry with no saved host key keep the sentences of before. What was measured, and what the function cannot tell, is in its
docblock. The text of `ssh.exe` was measured for the client alone; no login was made on Windows.
```

**6.3 `research/module_tests.md`,** the section `## The three roads of the person and the saved host key (G1)`.

1. Its table gains one row, and the row of `personRoadsHostKey.test.ts` changes. Read the counts from the runner, not from
   this document:

   | File | Tests | What it holds |
   |---|---|---|
   | `hostKeyTold.test.ts` | 49 | E2.S3. S1 to S6: `hostKeyTold` alone, on the texts a real `ssh` printed. Sentence C in both forms when `ssh` names the pin file of the call beside the verification line (a path with a space, apostrophes, a colon, a backslash printed as two, letters outside ASCII printed as octal escapes, the 13 lines of `ssh.exe`, a saved key of another type); sentence D in both forms for the verification line with no such line (another call's pin file, a hop, a name `ssh` did not find, a remote text, and nine lines that only look like the evidence); nothing without the verification line and for an unpinned call; sentence D word for word. X0 to X8: the install and the socket check show the sentence that the function answers, once; the bridge's form of sentence D opens with "could not be checked" and leaves an open bridge open; the pin file of another call is no evidence on the road; an unpinned entry and the install's second run keep the sentences of before |
   | `personRoadsHostKey.test.ts` | 33 | the row as it is, with two changes. Its opening, "H1 to H5: `hostKeyRefused` and sentence C alone, on the texts a real `ssh` printed (…)", becomes "H5: sentence C, word for word (which sentence a text gets is `hostKeyTold.test.ts`)". And its part about T9 says that T9a and T9b answer the 15 lines with the pin file of their own run, read from its argv |
2. Its paragraph **What none of them proves** gains: these tests show which sentence the roads show for a text; the texts are
   those of OpenSSH 10.2p1 (and one of OpenSSH_for_Windows 9.5p2), printed once, by hand, against public `sshd`s with no login.
   That a real `ssh` prints the `Offending` line with the pin file of a call THROUGH these roads is shown by leg 2 of the smoke
   (section 10 of `scripts/ssh-agent-itest.cjs`, E2.S4's test 27) and by E3's M5 and M7. A hop on the roads, a remote command on
   the roads, and a login on Windows are E3's or not measured.

## 7. Order of work, and the commits

1. **The tests:** the new file (§4.2) and the step-1 part of §4.3. Compile: exit 0. Run `hostKeyTold`: 12 green and 37 red with
   the texts of §5; `personRoadsHostKey`: all green. Save the output.
2. **The product** (§2, §3) and the step-2 part of §4.3. Compile: exit 0. `hostKeyTold` all green, `personRoadsHostKey` 33
   green; the suites of §4.4 green. `wc -l src/commands/agentCommands.ts` says 797.
3. **The mutation checks** (§8), one at a time, each restored before the next. Save what each one printed.
4. Typecheck, lint, the ratchet, the whole suite: green. Commit c1:
   `fix(ssh): G1 E2.S3 — sentence C only when ssh names the pin file of the call, sentence D otherwise`. Its body quotes the
   RED texts of step 1 and the result of each mutation, names the changed tests of E1 (T9a, T9b: the fixture; H1 to H4: gone,
   with the table of §4.3), says "+0 lines" with the count of `commands/agentCommands.ts`, and says what is not measured (§12).
5. **The documents** (§6). `node .agents/conventions/tools/plan-lifecycle.mjs .` and `node .github/scripts/public-hygiene.mjs`
   from the repository root: clean. Commit c2:
   `docs(extension): G1 E2.S3 — the rule of evidence for sentence C, and sentence D`.

If a test of step 1 is red with another text, or a guard is red: stop and tell the lead. No commit holds a red test.

## 8. The mutation checks (each one must turn the named tests red; restore after each one)

Each mutation is a temporary edit of the PRODUCT, never of a test. Compile (read the exit), run the twelve files of J16 (c)
(225 tests on the tree of `f3e9887d`; E2.S1 and E2.S2 change some of the counts), read what is red, restore, and compile again before the next one. "Red" below is what
was measured (J16 f). A mutation that turns red something else, or less, is a finding for the lead. `A` is the line
`if (lines.some((line) => namesFile(line, pin.file))) {`, `B` the line `return named !== undefined && unprinted(named) === file;`,
`V` the line `if (pin === undefined || !lines.includes(HOST_KEY_REFUSED_LINE)) {`.

| # | The mutation | Red (of 225) |
|---|---|---|
| Y1 | The `Offending` line is not asked: every verification line of a pinned call is sentence C. `A` becomes `if ((void namesFile, lines.length > 0)) {` (the `void` reads the function, which the compiler refuses when nothing reads it) | 22: S2 (all 15), X2 (all 4), X3, X4, X6 |
| Y2 | The FOLDER of the pin file is enough: `B` becomes `return named !== undefined && unprinted(named).startsWith(file.slice(0, file.lastIndexOf('/')));` | 6: S2 (another call, the folder, only STARTS with, cut before its end), X2 (another call), X6 |
| Y3 | The check writes its message to the log only: its `void vscode.window.showErrorMessage(told.bridge);` is removed | 5: X3, X4, X5, X6; T9b |
| Y4 | The check shows its message and does not log it: its `log.info('bridge', told.bridge);` is removed | 2: X3; T9b |
| Y5 | "Pinned" is dropped from the condition: `V` becomes `if (!lines.includes(HOST_KEY_REFUSED_LINE)) {`, and `A` asks `namesFile(line, pin?.file ?? '')` | 9: S4, X7 (all 6); T9c and T9d for the unpinned entry |
| Y6 | The text is split at LF alone: `stderr.split('\n')` | 31: S1 (9: all but "LF alone"), S2 (12: all but the three texts that hold no CR LF), X1 (both), X2 (3: all but the remote line), X4, X5, X6; T9a, T9b |
| Y7 | The words of the verification line anywhere in the text: `V` asks `!stderr.includes(HOST_KEY_REFUSED_LINE)` | 1: S3 |
| Y8 | The `Offending` line of the call is enough without the verification line: `V` becomes `if (pin === undefined \|\| !(lines.includes(HOST_KEY_REFUSED_LINE) \|\| lines.some((line) => namesFile(line, pin.file)))) {` | 1: S3b |
| Y9 | The `Offending` line may stand inside a longer line: the pattern loses its `^` | 1: S2 (inside a longer line) |
| Y10 | Text may follow the line number: the pattern loses its `$` | 1: S2 (text behind the number) |
| Y11 | A name that only ENDS with the pin file is enough: `B` compares with `unprinted(named).endsWith(file)` | 1: S2 (only ENDS with) |
| Y12 | A name that only STARTS with the pin file is enough: `B` compares with `unprinted(named).startsWith(file)` | 1: S2 (only STARTS with) |
| Y13 | The name is compared as `ssh` printed it: `B` becomes `return named !== undefined && (void unprinted, named === file);` | 3: S1 (a backslash, the octal escapes, the 13 lines of `ssh.exe`) |
| Y14 | Every line `Offending … in <file>:<n>` is evidence: the pattern becomes `/^Offending .+ in (.+):\d+$/` | 1: S2 (the line about a key for an IP address) |
| Y15 | Every pinned run that printed something gets a sentence: `V` becomes `if (pin === undefined \|\| (void HOST_KEY_REFUSED_LINE, stderr.length === 0)) {` | 8: S3, S3b; T9c and T9d for the host that is down, the refused login and the host that does not answer |
| Y16 | The bridge's form of sentence D opens with "is not open": in the last `return` of `hostKeyTold`, `could not be checked: ` becomes `is not open: ` | 18: S2 (all 15), X3, X4, X6 |
| Y17 | One sentence of sentence D changes: `Do not replace a saved key because of this message.` becomes `Replace the saved key if this message comes again.` | 24: S2 (all 15), S5, S6, X2 (all 4), X3, X4, X6 |
| Y18 | One word of sentence C changes: `so CredsForDevs did not connect.` becomes `so CredsForDevs did not go on.` | 17: S1 (all 10), S5, X1 (both), X5; H5, T9a, T9b |
| Y19 | The install shows the sentence as a warning: `showWarningMessage(told.install)` | 7: X1 (both), X2 (all 4); T9a |
| Y20 | The install goes on after the sentence: `return void vscode.window.showErrorMessage(told.install);` loses its `return` | 7: X1 (both), X2 (all 4); T9a |
| Y21 | The install has no branch for the host key: its four lines are removed | 7: X1 (both), X2 (all 4); T9a |
| Y22 | The check asks about the host key only after it has read the answer: its seven lines move behind the branch of `unreadable` | 5: X3, X4, X5, X6; T9b |
| Y23 | The install's SECOND run is asked too: before `return run.timedOut`, `const again = hostKeyTold(credential.knownHostsFile, run.stderr, node.name); if (again !== undefined) { return { kind: 'failed', reason: again.install } as const; }` | 2: X8; T9e |
| Y24 | The check asks with no pin file: `hostKeyTold(undefined, outcome.stderr, entity.name)` | 5: X3, X4, X5, X6; T9b |
| Y25 | The install asks about the stdout of the probe: `facts.stdout` | 7: X1 (both), X2 (all 4); T9a |
| Y26 | The check shows the form of the install, with no opening: `told.install` in its two lines | 5: X3, X4, X5, X6; T9b |
| Y27 | The install shows the form of the bridge: `told.bridge` | 7: X1 (both), X2 (all 4); T9a |
| Y28 | The bridge's form of sentence C opens with "could not be checked": in the first `return` of `hostKeyTold` | 12: S1 (all 10), X5; T9b |

All 28 compiled (`tsc` exit 0). How these map to the parent's §5, test 26, as the stories document assigns it to this story:
"drop the `Offending` line from the condition of sentence C → the hop and the remote text of 24 are red" is Y1; "match the pin
file's folder in place of its whole path → 'another call' of 24 is red" is Y2; "show sentence D in the log only → 25 is red"
is Y3. Y4 to Y28 are this spec's own. T9a to T9e and H5 are E1.S3's tests in `personRoadsHostKey.test.ts`.

## 9. Done when (each item can be counted)

- [ ] `test/hostKeyTold.test.ts` has 49 tests; 37 were watched red on the product before this story with the texts
      of §5 and pass after §2 and §3; the 12 guards were green at both.
- [ ] `hostKeyPin.ts` exports `hostKeyTold`, `HostKeyTold`, `unnamedHostKeySentence` and `refusedHostKeySentence`, and no
      `hostKeyRefused`; in the block of §2 its diff is that block and nothing else.
- [ ] `commands/agentCommands.ts` has 797 lines; its diff is §3.1 and nothing else.
- [ ] `hostKeyTold` is called in two places of that file and in no other file of `src_vs_code/src` outside the tests.
- [ ] `test/personRoadsHostKey.test.ts` has 33 tests; its diff is §4.3. `test/personRoadsWorld.ts` and `test/pinnedArgv.ts`
      have no diff in this story.
- [ ] No argv word changed: `hostKeyWords`, `sshExecCommand.ts`, `sshBridge.ts`, `writtenKey.ts`, `personPin.ts` and every
      script have no diff in this story.
- [ ] Y1 to Y28 each turned red what §8 names, and the product was restored after each.
- [ ] The three documents of §6 are changed; `plan-lifecycle.mjs` and `public-hygiene.mjs` are clean.
- [ ] `npm run typecheck`, `npm run lint` (no new `eslint-disable`), `npm run ratchet` and `npm test` are green; the leftovers
      audit of `npm test` names no folder of this run.

## 10. Break it — ways to make the tests pass while the defect stays, and the row that stops each one

| # | The way | What stops it |
|---|---|---|
| U1 | Sentence D is added, and sentence C is still shown for every verification line: the tests of sentence C pass | S2 (all 15), X2, X3, X4, X6; Y1 |
| U2 | The evidence is "an `Offending` line is there", for any file: a hop's lines hold one | S2 (another call, a hop), X2, X4; Y1 |
| U3 | The evidence is the folder of the pin file, the entry's id in the name, or the start of the name: every test with one call passes | S2 (another call, the folder, the start, a name cut short), X2 (another call), X6; Y2, Y12 |
| U4 | The name is searched with `includes` or `endsWith`: a longer path that ends with the pin file passes | S2 (only ENDS with); Y11 |
| U5 | The line is searched anywhere in a line, or with text behind it: a remote text that quotes it passes | S2 (inside a longer line, text behind the number); Y9, Y10 |
| U6 | The line `Add correct host key in` is taken as the evidence, because it also holds a path | S2 (that line alone); and it is cut at 100 characters (J4), so the real text of S1 holds no whole name in it |
| U7 | The fixtures name a fixed file, and the product compares with a fixed pattern: the road tests pass and a real call never matches | X1, X5, T9a, T9b read the pin file from the argv of their run; X0 holds the helper to it, and S0 holds the printer of the names to what `ssh` printed |
| U8 | The printed name is compared as it is: the tests with plain paths pass, and every path of Windows and every home folder with letters outside ASCII gets sentence D | S1 (a backslash, the octal escapes, the 13 lines of `ssh.exe`); Y13 |
| U9 | The function compares with the WORD of the checked pin (in double quotes) in place of its `file` | X1 runs in `Application Support` and in `it's here`, where the word has quotes: the text names the path with none, as `ssh` does (J5), and sentence C must be shown. S1 has the same two kinds of path on the function alone |
| U10 | Sentence D is shown, and the bridge's form still says "is not open"; or the check closes or hides an open bridge | X3: the exact message, and the bridge is open; S2 holds both forms; Y16 |
| U11 | Sentence D is written to the log only, or shown and not logged | X3: `errors` is exactly the one message, and the log holds it once; Y3, Y4 |
| U12 | The tests take the expected sentence from the product's own function | `SENTENCE_C`, `SENTENCE_D` and both openings are literals of the test; S5, S6; Y17, Y18, Y28 |

## 11. Opus review checklist

1. `hostKeyPin.ts`: the diff of the block is §2. `hostKeyTold` tests `pin === undefined` first, then the verification line
   as a whole line of a text split at `/\r?\n/`, then the evidence. No exit code, no stdout, no other condition.
2. The evidence: `OFFENDING_KEY_LINE` is anchored at both ends; `namesFile` compares the WHOLE name with `===` after
   `unprinted`; no `startsWith`, `endsWith` or `includes` on the name; the line `Add correct host key in` is read nowhere.
3. `unprinted` undoes two backslashes and runs of `\ooo` and nothing else. Ask: can it turn the printed name of ANOTHER file
   into the path of this call? (It reads each escape back to the bytes it stands for; two names that read back to one path
   are two spellings of that path.)
4. Sentence D is §1 of this spec, character for character (compare with §1, not with the tests). It names no host as the one
   that changed, does not say "is not open", and does not tell the person to replace, trust or forget a key. Sentence C's
   words did not change (`git diff` of the template literal is empty).
5. The two openings: `is not open: ` only with sentence C, `could not be checked: ` only with sentence D, both written in
   `hostKeyTold` and nowhere else in `src_vs_code/src` outside the tests.
6. `commands/agentCommands.ts`: the diff is §3.1; 797 lines; no new `eslint-disable`. The first argument at both call sites
   is `credential.knownHostsFile`, the checked pin of the road's ONE value (I2): not the bridge's pin in the check, not a pin
   or a path that the road made. Inside the function only `pin.file` is read.
7. `hostKeyTold` is called behind the probe of the install (with `facts.stderr`) and behind the run of the mode check (with
   `outcome.stderr`), before the stdout is read. Not for the sweep, not for the install run.
8. The install shows `told.install` with `showErrorMessage` and returns. The check logs `told.bridge`, shows it with
   `showErrorMessage`, and returns. No other sentence of these roads changed; an unpinned entry is byte for byte as before
   (X7; E1.S2's Q1).
9. `test/hostKeyTold.test.ts` is the text of §4.2. Its texts of `ssh` carry CR LF. Its expected sentences are literals. Every
   text that names the pin file of a run reads the name from the argv of that run. It writes only into folders of `ownedDir`
   under a `cleanupScope` closed in `after`, and starts no process.
10. H1 to H4 are gone and each of their cases is a row of S1 to S4 (§4.3, the table); T9a and T9b changed only by their
    fixture; T9c, T9d and T9e are as E1 wrote them and green.
11. The RED texts in the body of c1 are those of §5; each mutation in the body names what turned red, and it is what §8 says.
12. The documents say what is shown for which text, and what was measured by hand. No sentence says that a real `ssh` was
    seen on these roads printing the line: that is E2.S4's and E3's to add.
13. Read §12 and *Notes for the lead*: is one of the open points (a run that ended with 0 and holds the line; a hop under a
    quiet config; the clause that this spec added to sentence D; the last sentence of the CHANGELOG text) more than a note
    before E2 merges?

## 12. Not verified by this spec

- **A real `ssh` through the roads.** The runner and the spawner are stand-ins. What is proven is which sentence the roads show
  for a text, and that the text is what a real client prints for the words of a pinned call (J4 to J14, by hand). That the
  client prints the `Offending` line with the pin file that a ROAD wrote is leg 2 of the smoke on the changed code (E2.S4's test
  27: it shows sentence C on both roads only with that line) and E3's M5 (a) and M7. The smoke was not run for this spec.
- **A hop on the roads, and a remote command on the roads** (E3's M5 f and g). J11 is the client alone with a config; J15 (i)
  is carried from E1.S3.
- **Windows beyond the client's text.** J8 is one run of `ssh.exe` 9.5p2 that ended at the host key check. Not run: a path with
  a drive letter, a path with letters outside ASCII on Windows, a hop, a login (C6). If `ssh.exe` prints a name in a way that
  `unprinted` does not read back, the person is shown sentence D: a miss, never a false sentence C.
- **Another OpenSSH than 10.2p1 and 9.5p2 for Windows.** The lines are read as they are in these. A client older than 8.5
  (E3's M11) can word the `Offending` line otherwise; then sentence D is shown where sentence C is due.
- **A locale in which `ssh` prints letters outside ASCII as they are.** Not found (J7: `C.UTF-8` and `C` both print escapes).
  S1 holds the row "printed as it is" all the same.
- **A run whose stderr is empty** although the host key was refused: a hop under the person's `LogLevel QUIET` (J12, measured),
  or a client that does not keep `LogLevel=ERROR`. The roads show the sentences of before. The parent's §3.12, *What stays
  open*, names the second; the first is new (*Notes for the lead*).
- **A run that answered and ended with 0, and whose stderr holds the verification line** (a profile of the remote login shell
  that runs an `ssh` or a `git fetch` of its own, which fails). The rule asks the text only (§3.12), so the install shows
  sentence D and stops, and the check says "could not be checked" although it could read the mode. Sentence D's "the connection
  ended with" is then not true. Not tested, not built (*Notes for the lead*).
- **A stderr cut at the byte limit** (J3). The 15 lines are about 1 kB with a long path; a remote command that writes more than
  the limit before the lines could cut them. Then nothing or sentence D is shown, never sentence C without the line.
- **A very long pin path with letters outside ASCII.** `ssh` cuts its own log line at 1024 bytes, and a byte outside printable ASCII is printed as four characters, so a pin path of about 250 such bytes or more loses the `:<n>` that ends its `Offending` line: the line then names no file, and a real key change shows sentence D, not C (a miss only; reported by the review of E2.S3, not run). `hostKeyTold` says it in its docblock, *What it cannot tell*.
- **The order of the messages** after *Open Remote Bridge…* (*Bridge open to …*, then the check's error): E3's M5 records it.
- **"Is not open" when the tunnel IS open** (E1.S3, §12): unchanged for sentence C.
- **That a person understands sentence D.** Its words were checked against the contract of §3.12 and against the measured
  causes, by reading.

## Notes for the lead

- **The links to this file.** The parent's status block and its `## Epics`, E2, *Stories*, and the stories document's status
  block and `## E2.S3`, do not name this file. I do not edit them: the lead adds the links. This file links to both, and to
  the spec of E2.S2.
- **Budget (the parent's §3.6).** `commands/agentCommands.ts`: +0, measured on `f3e9887d` (797 → 797). The install's branch
  keeps four lines by `return void vscode.window.showErrorMessage(told.install);` (§3.3; `commands/runCommands.ts` writes it so
  in four places). If the lead prefers `void …;` and `return;` on two lines, the file gains one line (798 on `f3e9887d`), the
  spec's diff changes by that line, and mutations Y19 and Y20 change their text; nothing else.
- **For the parent, §3.12 part 2, "Not measured: how the line prints a path that was written in double quotes".** Measured
  (J5): with no quotes. And two more facts that the parent does not have (J6, J7, J8): a backslash is printed as two, a byte
  outside printable ASCII as a backslash and three octal digits, and `ssh.exe` 9.5p2 doubles the backslash too. The rule "the
  whole path of this call" is kept; the function reads the printed name back before it compares. I read this as the spec
  fixing the match from the measurement (the stories document, E2.S3: "fixes the match from that"), not as a plan change:
  without it sentence C would never be shown on Windows, where every path has a backslash. The lead's call.
- **For the parent, §3.12 part 2, "Windows' `ssh.exe`" and "Windows stays not measured".** The client's text is now measured
  (J8): 13 lines, the same `Offending` line. A login on Windows stays not measured (C6). E3's M13 (the Windows client alone)
  could take this text as a row.
- **For the parent, §3.12 part 3 and §3.5 ("a host that offers no key of the saved type (`No <type> host key is known for …`)").**
  Measured otherwise (J9): for a saved key of another type than the key the host presents, `ssh` prints the 15 lines and
  `Offending <the saved type> key in <the pin file>:1`. That is sentence C, with the evidence, and it is true for that host.
  `No <type> host key is known` comes when `ssh` finds NO key under the name it looks up (J10). A repaired description; test
  24's words ("`No <type> host key is known` give sentence D") stay true.
- **A finding outside this story: a person's config that renames the host breaks every pinned call (J10).** With `Host box`
  and `HostName real.example`, or with a `Port`, in the person's `ssh` config (both measured; a `HostKeyAlias` by reading
  only), `ssh` looks the key up under the resolved name, and the pin file holds the line under the entry's own host and port. The call is refused with
  `No <type> host key is known for <the resolved name>`. This is E1's behaviour on the three roads (before E1 they ran with
  `accept-new` against the person's own file) and the older behaviour of the agent's pinned exec. It fails closed. No test and
  no row of E3 holds it; §3.9 says "these roads honour the person's config (a jump host, an alias)". Sentence D names it as a
  possible cause. Whether a pinned call should say `HostKeyAlias` itself is a candidate, not proposed here.
- **Sentence D has one clause more than the baseline** ("or your ssh config gives this host another name or port than this
  entry does"), because of that finding. The contract of §3.12 is kept. If the lead wants the baseline alone: the clause goes
  from §1, from the function of §2, from `SENTENCE_D` of the test and from the two documents of §6.
- **For the parent, §3.12, *What stays open*: a hop under a quiet config (J12).** A refused key of a jump host, under a config
  that says `LogLevel QUIET`, ends with 255 and an empty stderr: `LogLevel=ERROR` is a word of the outer command line and does
  not reach the nested `ssh`. The roads show the sentences of before. E3's M5 has (e) a quiet config and (f) a hop, and no row
  with both.
- **For the parent's C12 and for E3's M5 (f): `Connection closed by UNKNOWN port 65535` is gone under `LogLevel=ERROR`
  (J11).** After E2.S2 a hop's refusal ends with the verification line as its last line. C12's remedy ("the LAST line") would
  no longer tell a hop apart; the evidence of the pin file does.
- **A candidate, not built: sentence D only for a run that did not end with 0.** §12 names the case (a remote profile that
  writes the line while the command answers). The rule of §3.12 asks the text only, and I did not widen it: it would be a
  change of the contract, and the SECOND entry of epoch 2, which stops the plan. One more parameter (`exitCode`) and one more condition would do it;
  sentence C needs no such condition (its `ssh` always ends with 255).
- **For E2.S4.** The smoke reads `refusedHostKeySentence` from the product and builds the bridge's form itself
  (`itestPinnedRoads.cjs:55-56`); both stay true for sentence C. Leg 2 shows sentence C only when the real client's `Offending`
  line names the pin file of the call; if it shows `could not be checked`, the rule missed on the real client, and that is a
  finding against this story, not a repair of the script. The CHANGELOG text of §6.1 holds one claim that is measured by hand
  and held by no test (the last sentence).
- **For the spec of E2.S2** (read after it was committed, `9e4f58d5`). This spec uses its checked pin as its note 11 asks:
  `hostKeyTold` takes a `CheckedPin | undefined` and reads `.file`; a test makes one with its `testPin`. Facts measured here
  that its K12 and its §2 do not have: (1) under `LogLevel=ERROR` (J11, J14) the 15 lines, `ssh: connect to host … Connection
  timed out` and `Connection timed out during banner exchange` are printed; `Connection closed by UNKNOWN port 65535` is not.
  No road reads that line, so its K12 holds. (2) At a real key exchange, with no login (J5, J6, J8): the quoted word of a path
  with a space, with one apostrophe, with a pair of apostrophes and with letters outside ASCII was READ as that one file (the
  `Offending` line names it); a single backslash, bare, was read as itself on Linux and by `ssh.exe` 9.5p2. Its "not measured:
  a login" stays true. (3) A config that renames the host makes `ssh` look the key up under another name (J10): no rule of the
  path can help there.
- **E1's tests H1 to H4 go** (four tests; `personRoadsHostKey` 37 → 33). The stories document names only "E1's test 9 changes
  where its stderr fixture lacks the `Offending` line". H1 to H4 asked `hostKeyRefused` directly, and their cases are rows of
  the new file (§4.3, the table).
