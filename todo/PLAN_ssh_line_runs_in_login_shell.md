# PLAN — a line that runs over SSH runs in the server's login shell

> Status: **plan only, nothing implemented yet, 2026-11-11.** Scope: the extension (`src_vs_code`) only — the composer
> `remoteLaunch.ts` (two remote command texts and one new builder), one sentence of `COPY_NOTE`, their tests, the scan
> `shellQuotingRoadScan.test.ts`, help ×5, `src_vs_code/README.md`, `src_vs_code/CHANGELOG.md`,
> `research/module_extension.md`, `research/module_tests.md`, `todo/README.md`, and one boundary row in three neighbour
> plans (§9). No road file changes. No server change, no HTTP contract change, no MCP tool shape change, no trust record
> change. One epic, one pull request, on `fix/ssh-line-runs-in-login-shell` from `main` at `3abb01a3` (extension 1.21.1).
> The owner's decision (2026-11-11, final): the line runs in the server's LOGIN shell; not an interactive shell.

## 1. Symptom

The owner, 2026-11-11, on extension 1.21.1: a Terminal entry with *Runs over SSH* set (the server's login shell is
bash) ran `aws sso login`. The terminal said `bash: line 1: aws: command not found`, exit code 127. A manual SSH Connect
to the same server finds `aws`.

**Cause.** sshd runs the remote command of an exec request as `$SHELL -c '<remote command>'`. That shell is NOT a
login shell, so it does not read `/etc/profile`, `~/.profile` or `~/.bash_profile`. On the owner's server
`~/.profile` adds `~/.local/bin` to `PATH`, and `aws` is there. SSH Connect sends no remote command, so sshd starts
a login shell, and `aws` is found.

**Every road that runs a line over SSH has the defect.** Verified at `3abb01a3` (paths under `src_vs_code/src/`):

| Road | Where the remote command is made | Today's remote command | Why it misses the profile |
|---|---|---|---|
| Arrow (*Run in Terminal*) | `commands/runCommands.ts:161` → `planLaunch(…, { stayOpen: true })` → `sshRoad.ts:276` `typedLine` | `eval '<line>'; s=$?; test $s -eq 0 \|\| printf '…%s\n' $s >&2; exec ${SHELL:-sh} -l` (`remoteLaunch.ts:227-230`) | the line runs in sshd's non-login `-c` shell; the login shell starts only AFTER the line |
| Folder run | `folderRun.ts:118` (`stayOpen: true`) → `commands/folderRunCommand.ts:262` `recheckedLine` → `sshRoad.ts:221` | the same wrapper | the same |
| VPN *Started by* | `vpnLauncherRun.ts:107` (`stayOpen: true`) → `sshRoad.ts:276` | the same wrapper | the same |
| Dependency chain step | `dependencyRun.ts:179` (`stayOpen: false`) → `dependencyRunHost.ts:259` `recheckedLine` | the bare line | sshd's non-login `-c` shell |
| Agent's linked `creds_run` | `agentUseActions.ts:429` (`stayOpen: false`) → `:418` `overSsh` → `sshUseActions.ts:237` `buildSshExecArgv` | the bare line | the same |
| *Run with Secrets* | `commands/runCommands.ts:512` → `remoteLaunch.ts:437` `secretsArgv` | `"${SHELL:-sh}" -s` (`remoteLaunch.ts:302`), the script on stdin | `-s` without `-l`: a non-login shell reads the script |
| *Copy Command*, the viewer row, *Copy All* (`copiedLineOf`, `remoteLaunch.ts:350-353`) | `shownTrustLine` (`:332-335`) | nothing runs: the copy is the trust line `ssh … -- user@host '<line>'` | a person who pastes it gets sshd's non-login `-c` shell, the same defect |

**The help says the opposite.** `helpEn.ts:84` (the *terminal* kind): "the line runs in your login shell there". The
Run with Secrets article (`helpEn.ts:177`, `:180`) says the values go "to the server's login shell". The same in the
four other languages, in `src_vs_code/README.md:302-316` and `:411`, and in the composer's own comments
(`remoteLaunch.ts:222`, `:297`, `:314`). The parent plan said it too (`research/PLAN_terminal_command_over_ssh.md`
§4.2: "hands the one string to the remote login shell (`$SHELL -c`)"; D12). It was never true: `$SHELL -c` is not a
login shell.

**Reproduced here, 2026-11-11** (bash 5 and dash 0.5 on this machine; zsh and ksh are not installed). A temp `HOME`
whose `.profile` adds `$HOME/.local/bin` (it holds a fake `tool`), run the way sshd does
(`env -i HOME=… SHELL=<sh> PATH=/usr/bin:/bin <sh> -c '<remote command>'`):

- today's bare line `tool a b`: bash `bash: line 1: tool: command not found`, status 127; dash `tool: not found`, 127;
- today's stay-open wrapper: the same message, then `creds: the command ended with exit code 127`, then the login shell;
- today's secrets command: not run separately — it is `-s` without `-l`, the same non-login read.

## 2. Decisions

| # | Decision | By |
|---|---|---|
| L1 | Every road of §1 runs the line in the server's LOGIN shell: it reads `/etc/profile` and then `~/.bash_profile`, `~/.bash_login` or `~/.profile` (bash), `~/.profile` (dash, sh, ksh) or `~/.zprofile` (zsh). It is NOT an interactive shell: no `-i`, so `~/.bashrc` is not read for the line. A tool that only `~/.bashrc` sets up (nvm, conda, many installers) is not found. This is a documented limit; an interactive option may come later. | owner, 2026-11-11 (final) |
| L2 | The form is `exec ${SHELL:-sh} -l -c '<inner>'`: sshd's shell replaces itself by a login shell that runs `<inner>`. `exec` keeps the exit code (the login shell's status is the line's), keeps one process, and keeps the working folder and the variables of the line for the stay-open shell (§3.1). `${SHELL:-sh}` stays UNQUOTED, as in today's wrapper, so the text adds no `"` and never trips the Windows PowerShell 5.1 refusal (§4.6 of the parent). | lead |
| L3 | `<inner>` is today's text, unchanged: the stay-open wrapper (`stayOpenWrapper`) on the arrow, the folder run and the VPN launcher; the bare line on the chain step and the agent's run. Only the outer layer is new. | lead |
| L4 | The single quotes of `<inner>` are escaped as `'` → `'\''` by ONE private function that the stay-open wrapper and the new builder share (today the wrapper has the escape inline, `remoteLaunch.ts:228`). Not `quoteFor('posix', …)`: its `'"'"'` would put a `"` into the remote command for every `'` of the line, and the PowerShell 5.1 refusal would then fire on any line with a `'` (E1.S2 spec §S2.1 item 1, the same reason). | lead |
| L5 | *Run with Secrets*: the login shell must NOT read the script from its standard input while it reads its profile. sshd's shell moves the script to file descriptor 3 and gives the login shell an empty input; the login shell reads its profile, then reads fd 3 whole and runs it. The plain fix `"${SHELL:-sh}" -l -s` is REJECTED: measured, a `~/.profile` with `read -r x` took the first export line WITH THE SECRET VALUE, and the line then ran with an EMPTY value and status 0 (§3.3). | lead (measured) |
| L6 | The stay-open shell stays as today: after the line, `exec ${SHELL:-sh} -l` starts an interactive login shell (D3 of the parent). So on the three interactive roads the profile is read twice: once for the line (non-interactive) and once for the shell the person types into. Accepted and recorded (§6, risk 1). | lead; the owner may override (§10) |
| L7 | The trust line does NOT change. It is built from the person's line (`plan.line`), never from the remote command, on every road: `sshRoad.ts:215`, `:280`; `commands/runCommands.ts:569`; `agentUseActions.ts:282`, `:409`; `folderRun.ts:155` and `dependencyRunHost.ts:145` (both through `shownTrustLine`, `remoteLaunch.ts:334`). So no linked entry asks again after the update, and the consent dialog of an agent's run shows the same text. Reading the person's own profile on their own server is not a new target or a new command, so it needs no new approval: a person who can write that profile already owns the account. The CHANGELOG says this. | lead |
| L8 | *Copy Command*, the viewer row and *Copy All* keep copying the trust line, byte-identical (parent §4.4: "the composed launch line is never copied"). Copying the login form instead would put `'\''` into every copied line, and a copied line pasted into PowerShell would then break for every line, not only for a line with a `'`. `COPY_NOTE` (`remoteLaunch.ts:338`) gains one clause that says the difference (§3.4). | lead; the owner may override (§10) |
| L9 | `creds_exec` (`ssh:exec`, the agent's own command on an SSH entry, `sshUseActions.ts:327`) is NOT changed: the agent writes that command, it is a shipped tool contract, and an agent can write `bash -lc '…'` itself. SSH Connect is not changed: it sends no remote command, so sshd already starts a login shell. | lead; a question for the owner (§10) |
| L10 | fish, csh and tcsh stay unsupported (parent §4.2). Note: today the chain step, the agent's run and Run with Secrets ran a fish-syntax line on a fish login shell by accident (the bare line under `fish -c`). After this plan every road starts with the POSIX word `${SHELL:-sh}`, which fish does not parse. The help already says fish is not supported; the CHANGELOG says that the three roads now need a POSIX login shell too. | lead |

## 3. Design — the exact texts

All of it is in `remoteLaunch.ts`. No road file changes: every road gets its remote command from `planLaunch` or from
`SECRETS_REMOTE_COMMAND` already.

### 3.1 The builder and the plan

```ts
/** `'` → `'\''`: one POSIX single-quoted word's body. Shared by the stay-open wrapper and the login builder (L4). */
function singleQuotedBody(text: string): string;            // text.replace(/'/g, `'\\''`)

/** `exec ${SHELL:-sh} -l -c '<inner>'` (L2): the remote login shell runs `inner`. Exported for the tests. */
export function loginShellCommand(inner: string): string;
```

`stayOpenWrapper` (`:227-230`) keeps its exact text and calls `singleQuotedBody` instead of its inline `replace`.
`planRemote` (`:195`) changes one expression:

```ts
remoteCommand: loginShellCommand(options.stayOpen ? stayOpenWrapper(line) : line)
```

The new remote commands, for the line `aws sso login`:

| Roads | New remote command |
|---|---|
| Arrow, folder run, VPN launcher (`stayOpen: true`) | `exec ${SHELL:-sh} -l -c 'eval '\''aws sso login'\''; s=$?; test $s -eq 0 \|\| printf '\''creds: the command ended with exit code %s\n'\'' $s >&2; exec ${SHELL:-sh} -l'` |
| Chain step, agent's linked run (`stayOpen: false`) | `exec ${SHELL:-sh} -l -c 'aws sso login'` |

(In the table, `\|` is the escaped pipe of a markdown cell; the text has a plain `|`.)

**Nesting.** On the stay-open roads the person's line is single-quoted twice: once by the wrapper (`eval '…'`), once
by the builder. A `'` in the line becomes `'\''` and then `'\''\'''\''`. On the typed roads the whole remote command
is then quoted a third time for the LOCAL shell by `buildSshCommand` (`quoteFor` posix or PowerShell, unchanged). Each
layer is the same mechanical escape, and the delivery test (§5) proves the round trip through real shells.

**What the stay-open roads keep.** Measured under bash and dash (§1's setup, a stand-in `$SHELL` that marks the final
`-l` shell): the line's output, then the exit-code sentence for a failure (`TOOL_EXIT=4 tool fail` → `exit code 4`),
then the login shell; `echo ok # a note` and `echo a &` keep the login shell; `cd /tmp && tool cd` → the final shell
starts in `/tmp` (the same as today, because `exec` keeps the folder); `exit 3` ends with status 3 and no login shell
(the same as today); an unclosed quote behaves as today (bash: message, sentence, login shell; dash: the special builtin
`eval` ends the shell, status 2 — the parent's recorded limit). With a real pty (`script -qec`, bash and dash): the
profile ran for the line (`$-` = `hBc`, non-interactive), the line found `tool`, then the profile ran again for the
final shell (`$-` = `himBH`), which showed a normal prompt, ran typed commands with `tool` on `PATH`, and passed `exit 5`
back as the status.

### 3.2 Exit codes

`exec` replaces sshd's shell by the login shell, so ssh's exit status is the line's. Measured (bash, dash):
`TOOL_EXIT=7 tool x` → 7, `false` → 1, a line that prints and pipes → 0, with the same output as the line run directly.
The chain reads the step's status, and the agent's answer carries `exitCode` (`sshExecRunner.ts`), so both keep it.

### 3.3 Run with Secrets

```ts
export const SECRETS_REMOTE_COMMAND = `${loginShellCommand('creds_script=$(cat <&3) && eval "$creds_script"')} 3<&0 </dev/null`;
// = exec ${SHELL:-sh} -l -c 'creds_script=$(cat <&3) && eval "$creds_script"' 3<&0 </dev/null
```

sshd's shell runs `exec … 3<&0 </dev/null`: the script (ssh's stdin) moves to fd 3 and the login shell's stdin is
`/dev/null`. The login shell reads its profile, then reads fd 3 to its end into a shell variable (not exported, not on
any command line: `cat` gets no argument) and runs it with `eval`. The script (`secretsStdin`, `:319-322`) does not
change: the export lines, the `{ … } </dev/null` group, `exit $?`. The text holds `"`; this road spawns ssh with no
local shell (D12), so the PowerShell 5.1 refusal does not apply, as today.

Measured 2026-11-11, bash and dash, with the script of §S2.4 of the E1.S2 spec (a value holding `'`, `"`, `$HOME`, a
backtick and a trailing `\`):

| `.profile` | `"${SHELL:-sh}" -l -s` (rejected) | the command above |
|---|---|---|
| adds `~/.local/bin` | value byte-equal, `tool` found, `cat` in the group reads end-of-input, status 0 | the same |
| also `read -r x; echo "[$x]"` | the profile printed the export line WITH THE VALUE; the line saw an EMPTY value; status 0 | the profile read nothing (`[]`); the value byte-equal; status 0 |
| sets `PATH` without `/usr/bin` | — | `cat: not found`, status 127, nothing of the line runs (fails closed: `&&`) |

Also measured with the command above: `exit 7` → 7; `false` → 1; `echo tail \` → `tail`; the bash-only line
`[[ x = x ]] && printf ok` → `ok` under bash and status 127 under dash, as the parent's F3 tests expect.

### 3.4 `COPY_NOTE`

Today: "This line uses your own ssh setup (agent, ~/.ssh/config); the vault's key and password are not in it — use Run
to connect with them." New: "This line uses your own ssh setup (agent, ~/.ssh/config); the vault's key and password are
not in it, and on the server it does not start your login shell — use Run to connect with them." The copied text
itself does not change (L8).

### 3.5 The PowerShell 5.1 refusal

`typedLine`'s row T1 (`remoteLaunch.ts:272-277`) refuses when the remote command holds `"` or ends with `\`. After this
plan the remote command of every typed road ends with `'`, so the trailing-`\` half cannot fire for a plan that
`planLaunch` made; the `"` half fires exactly as today (only a `"` of the person's line puts one there). The check stays
as it is: `typedLine` takes any `RemotePlan`, and its tests build plans by hand. Its comment gains one sentence that says
this. No new refusal: the new text adds `$`, `{`, `}`, `\` and `'` only, and inside a PowerShell single-quoted word
`quoteFor('powershell')` doubles every `'` and leaves the rest literal. Windows' native re-quoting of the argument is
hand check 3 (§8).

### 3.6 Class sweep — every site that builds, types, shows or spawns a remote command

Method: `grep -rn` over `src_vs_code/src` (tests excluded) for `planLaunch(`, `stayOpen`, `.remoteCommand`,
`SECRETS_REMOTE_COMMAND`, `stayOpenWrapper`, `buildSshExecArgv(`, `remote: {`, `typedLine(`, `recheckedLine(`,
`trustLineFor(`, `shownTrustLine(`, `copiedLineOf(` and `${SHELL`, 2026-11-11 at `3abb01a3`. Every hit:

| Site | What it does with the remote command | After this plan |
|---|---|---|
| `remoteLaunch.ts:195` `planRemote` | makes it | the login form (§3.1) — the one change |
| `remoteLaunch.ts:288` `typedLine` → `buildSshCommand` `remote` | quotes it for the local shell (posix or PowerShell) | unchanged; the delivery test covers the new text |
| `remoteLaunch.ts:437` `secretsArgv` | passes `SECRETS_REMOTE_COMMAND` as the last argv word | unchanged; the constant changes (§3.3) |
| `agentUseActions.ts:418` → `sshUseActions.ts:237` | passes `plan.remoteCommand` as the last argv word | unchanged; the value changes |
| `sshUseActions.ts:327` (`ssh:exec`) | the agent's own command | NOT changed (L9) |
| `commands/agentCommands.ts:197`, `:222`, `:351` | the person's three agent-setup clicks: fixed commands of their own | NOT changed: no Terminal entry, no line of the person |
| `sshBridge.ts` (via `commands/agentCommands.ts:211`) | a socket forward, no remote line of a Terminal entry | not affected |
| trust, copies, modals (L7, L8) | read `plan.line`, never `remoteCommand` | unchanged |
| journal, consent, banner | no site shows or logs `remoteCommand` (`grep -n remoteCommand` in `sshUseActions.ts`, `agentUseActions.ts`) | unchanged; the banner's "the remote login shell" (`:460`) becomes true |

The scan `test/shellQuotingRoadScan.test.ts` lists every site that quotes, escapes or wraps a value for a shell. Its
escaper row for the wrapper (`:94`) moves to `singleQuotedBody`. Its template shapes (`SHELL_TEMPLATES`, `:36-37`) do
NOT match the new template `` `exec \${SHELL:-sh} -l -c '${…}'` ``: no token of the list (`ssh -`, `export`, `eval '`,
…) stands before the quote. A structural test that does not match a site passes forever (`testing.md`), so the list
gains the token `-c ` followed by a quote, and the new template gets its row (`parser: 'posix'`, `vault: 'guarded'`,
proof: the delivery test). RED first: the widened pattern finds the new site before its row exists.

## 4. Build order

One epic, one pull request. Each step is RED first.

1. **The real-shell reproduction (§5 T1-T4), RED on `main`'s code.** The new test file runs today's composed remote
   commands the way sshd does and fails with 127. Keep the failure messages for the summary.
2. **The composer.** `singleQuotedBody`, `loginShellCommand`, `planRemote`'s one expression, `SECRETS_REMOTE_COMMAND`,
   the comments that said "login shell" untruly (`:222`, `:297`, `:314`, `:412`, `:446`) and the T1 sentence (§3.5).
   The unit tests of §5 U1-U6 go RED first, then green. Existing tests that pin today's text are rewritten in the same
   commit (§5 "Tests that change").
3. **The scan.** `SHELL_TEMPLATES` widened, watched RED on the new template; the rows written; green.
4. **`COPY_NOTE`** (§3.4) and its test.
5. **Help ×5** (English first), `src_vs_code/README.md`, `research/module_extension.md`, `research/module_tests.md`,
   `src_vs_code/CHANGELOG.md` `## [Unreleased]` (§7).
6. **The gates**: `npm run typecheck`, `npm test`, lint, at lowered priority; the coai code round; the pull request.
   The owner's hand checks (§8) go into the pull request text.

## 5. Test plan

Every real-shell run uses an OWNED temp folder (`ownedDir(t, …)` from `scripts/lib/leftovers.cjs`, the test-leftovers
rule) as `HOME`, so no test reads the developer's or the CI runner's own profile. Each run also sets `ZDOTDIR` to that
folder (zsh) and removes `ENV` and `BASH_ENV` from the child's environment. `/etc/profile` is still read; so an
assertion on exact output compares against the same line run by a LOGIN shell directly (`<sh> -l -c '<line>'` with the
same `HOME`), not against fixed text, and a marker assertion uses `includes`, not equality. Shells: bash and dash (and
`sh`, which is dash here), each probed and skipped with a printed reason when absent; zsh and ksh/mksh the same (not
installed here: they print their skip reason locally and run where installed).

**New file `test/remoteLoginShell.test.ts`** — the owner's bug, reproduced through the composer:

| # | Test | Assertion | RED on `main` |
|---|---|---|---|
| T1 | `the_profile_path_reaches_the_bare_line_on_every_login_shell` | `HOME` holds `.profile` that adds `$HOME/bin` (a fake `tool` that prints its arguments and exits with `$TOOL_EXIT`); the remote command of a plan with `stayOpen: false` for `tool a b`, run as `<sh> -c '<remote command>'` with `SHELL=<sh>` (bash, dash, `/bin/sh`), prints `tool ran: a b`, status 0 | `tool: command not found`, 127 |
| T2 | `the_profile_path_reaches_the_line_on_the_stay_open_roads` | `stayOpen: true`; `SHELL` = an owned stand-in that, called with exactly `-l`, prints `LOGIN-SHELL` and its `PATH` check, else `exec`s the real shell; output has `tool ran: a b`, then `LOGIN-SHELL`, no exit-code sentence | the 127 sentence |
| T3 | `the_profile_path_reaches_run_with_secrets` | `SECRETS_REMOTE_COMMAND` with `secretsStdin({ CREDS_REF_1: <the §S2.4 hostile value> }, 'printf "<%s>" "$CREDS_REF_1"; tool sec')` on stdin: the value byte-equal and `tool ran: sec`, status 0 | 127 |
| T4 | `bash_reads_bash_profile_first` | a `HOME` with `.bash_profile` (adds the folder) and a `.profile` that does not: bash finds `tool`; dash (which reads only `.profile`) does not, 127 — what a login at a prompt does | bash 127 |
| T5 | `the_exit_code_of_the_line_is_the_status` | bare: `TOOL_EXIT=7 tool x` → 7, `false` → 1; secrets: 7 and 1; stay-open: the sentence says 7 and the login shell follows | green on `main` (a guard: proves `exec` keeps it) |
| T6 | `a_profile_that_reads_stdin_gets_nothing_and_the_values_arrive` | `.profile` holds `read -r x; printf '[%s]\n' "$x"`: output has `[]`, the value byte-equal, status 0 | green on `main` (no profile is read); RED under the rejected `"${SHELL:-sh}" -l -s` — the teeth: that text is put in temporarily, watched red (the profile prints the export line, the value is empty), and restored; the message goes in the summary |
| T7 | `a_profile_that_hides_cat_fails_closed` | `.profile` sets `PATH="$HOME/bin"`: Run with Secrets ends 127, `tool` did not run | n/a (new behaviour) |
| T8 | `the_stay_open_shell_keeps_the_folder_and_exit` | `cd "$HOME/sub" && tool` → the stand-in reports `$HOME/sub`; `exit 3` → 3, no `LOGIN-SHELL` | green on `main` (a guard) |
| T9 | `the_typed_line_end_to_end` | `typedLine` of a `stayOpen: true` plan through the REAL local bash with the fake `ssh` of `remoteLaunchDelivery.test.ts` (shared, not copied), then the recorded element run as `<sh> -c` with the owned `HOME`: `tool ran:` and `LOGIN-SHELL` | 127 |

**Unit tests, `test/remoteLaunch.test.ts`** (each RED first):

| # | Assertion |
|---|---|
| U1 | `loginShellCommand('x')` is exactly `exec ${SHELL:-sh} -l -c 'x'`; `loginShellCommand("it's")` is `exec ${SHELL:-sh} -l -c 'it'\''s'` |
| U2 | `loginShellCommand` adds no `"`: for the corpus of the delivery test, the count of `"` in the output equals the count in the input |
| U3 | `planLaunch(…, { stayOpen: true })` → `remoteCommand === loginShellCommand(stayOpenWrapper(line))`; `stayOpen: false` → `loginShellCommand(line)`; both start with `exec ${SHELL:-sh} -l -c '` |
| U4 | `SECRETS_REMOTE_COMMAND` is exactly the text of §3.3 |
| U5 | `stayOpenWrapper` is byte-identical to today for the existing cases (it now calls `singleQuotedBody`) |
| U6 | the trust line of a linked entry is the same before and after (L7): `trustLineFor(ssh, jump, plan.line)` of a plan, and the plan's `line` is the person's line, not the remote command |
| U7 | `COPY_NOTE` is the text of §3.4; `copiedLineOf` of a linked entry is still the trust line (`sshRoadCopies.test.ts`) |

**Tests that change** (they pin today's text; each is rewritten to the new text, and the rewrite is the RED):
`remoteLaunch.test.ts:245-247` (the plan's remote command), `agentSshRun.test.ts:34` (`'echo linked'` →
`loginShellCommand('echo linked')`; the message "no eval, no wrapper" stays true), `sshRoadChain.test.ts:104-105`
(`'migrate'` → `loginShellCommand('migrate')`, still no `eval`), `remoteLaunchDelivery.test.ts:239-271` (the F3 tests:
`viaRemoteLoginShell` gets the owned `HOME`; `F3_the_secrets_remote_command_names_the_login_shell` asserts the new
text), `shellQuotingRoadScan.test.ts:94` and `:109` (rows move), and the tests that compare `COPY_NOTE` text.

**Tests that stay green unchanged:** the delivery corpus (`bash_delivers_…`, `pwsh_delivers_…`: they feed raw
commands, not plans), `launchRoadScan.test.ts`, `commandRoadScan.test.ts`, `linkedNeverLocal.test.ts`, the road
worlds (`sshRoadArrow`, `sshRoadFolder`, `sshRoadSecrets`, `secretsLaunch`, `maskedTerminal`, `sshExecOver`,
`agentSshGate`, `agentSshOneUse`: they read the remote command from the composer or pass their own), SSH Connect's
suites, the help tests (they check the five languages exist and agree in shape).

## 6. Risks

1. **The profile is read twice on the arrow, the folder run and the VPN launcher** (L6, measured with a pty). A
   profile that starts a daemon (`eval $(ssh-agent)`, `keychain`) starts it twice per run, and a profile that prints
   prints twice. The final shell is the one SSH Connect gives, as today.
2. **The profile's own output is now part of the run's output** on every road: the chain step's terminal, Run with
   Secrets' masked output and the agent's captured answer (masked as before). An agent that parses the output can see
   extra lines. A profile that prints only in an interactive shell (the usual guard; measured on this machine's
   `/etc/profile`, which printed the motd text only for the interactive shell) adds nothing.
3. **A profile that is not safe in a non-interactive login shell** (asks a question, runs `exec tmux` or `exit`, or
   fails under `set -e`) now changes or stops the line. Before, it changed only the stay-open shell. Recorded; the help
   says the profile is read.
4. **Slower start:** `/etc/profile.d/*` runs before every line. Not measured on a real server; hand check 1 notes it.
5. **`~/.bashrc` is not read for the line** (L1): nvm, conda and other `~/.bashrc`-only setups are not found. The
   documented limit of the owner's decision. The help says to set such a `PATH` in `~/.profile`.
6. **fish, csh, tcsh** (L10): the chain step, the agent's run and Run with Secrets no longer run a fish-syntax line on a
   fish login shell. Unsupported before; said in the CHANGELOG now.
7. **zsh and ksh `-l -c` are not measured here** (not installed). bash 5 and dash 0.5 are measured. zsh, ksh93, mksh and
   busybox `sh` document `-l`; the tests run them where installed; hand check 2 asks for a zsh server if the owner has
   one. `-l` on any other `sh` is not checked.
8. **Run with Secrets: fd 3.** The profile's own child processes inherit fd 3 (the script, with the values). A program
   that reads fd 3 on purpose could read it; no usual profile command does. `cat` must be on `PATH` after the profile,
   else the run fails closed with 127 (§3.3). The script is now read whole before it runs, not as a stream; it is a few
   lines.
9. **Longer remote command.** Each `'` of the line grows to ten characters on the stay-open roads, before the local
   quoting. No length limit applies to these roads (`MAX_REMOTE_COMMAND_CHARS`, `sshExecCommand.ts:51`, is checked only
   for `ssh:exec`, `sshUseActions.ts:303`); sshd accepts a command of this size.
10. **An older extension build** on another machine of the person still runs the line without the profile until it is
    updated (the parent's risk 1, for a behaviour instead of a field).

No growth surface: nothing new is stored, written or spawned (planning-docs.md § growth). The fd-3 handoff and the
variable live as long as the remote run.

## 7. Documents

- **Help ×5** (`helpEn.ts` first, then De, Es, Ru, Uk; UI labels stay English). (a) The *terminal* kind,
  `helpEn.ts:84`, paragraph "To run a line on a server": "the line runs in your login shell there" becomes true for
  every road; add: "Your login shell reads `/etc/profile` and your `~/.profile` (bash: `~/.bash_profile` first; zsh:
  `~/.zprofile`) before the line, as at a login, so the `PATH` you get when you connect is the `PATH` of the line. It
  does not read `~/.bashrc`: a tool that only `~/.bashrc` sets up, such as nvm or conda, is not found — set its `PATH`
  in `~/.profile` instead. What your profile prints is part of the output." The chain sentence ("A step set to run over
  SSH runs there and ends there") gains "in your login shell". The *Copy Command* sentence gains "and on the server it
  does not start your login shell". (b) Run with Secrets, `helpEn.ts:177` and `:180`: "the server's login shell" is
  now true; add "Your profile is read first, and it reads an empty input, never the values."
- **`src_vs_code/README.md`** `:302-316` and `:411`: the same sentences.
- **`research/module_extension.md`**: `:2247` (the wrapper sentence) gains the outer login layer and L2-L4; `:2458` (Run
  with Secrets over SSH) gains §3.3 with the measured reason for fd 3; one line on L7 (the trust line is unchanged).
- **`research/module_tests.md`** `:1493-1499`: rows for `remoteLoginShell.test.ts` T1-T9 and U1-U7, and the note that
  real-shell runs use an owned `HOME`.
- **`src_vs_code/CHANGELOG.md` `## [Unreleased]`**: `### Fixed — a line that runs over SSH now runs in your login shell
  on the server`, with: the symptom (`command not found`, 127, for a tool that SSH Connect finds); every road named;
  the `~/.bashrc` limit; the profile's output in the run's output; the profile read twice on the arrow, folder run and
  VPN launcher; Run with Secrets' profile reads an empty input; **"No entry asks for approval again: the approval is
  keyed on the line and the connection, and neither changed"**; fish now fails on the chain step, an agent's run and
  Run with Secrets too.

## 8. Hand checks (owner)

1. **The bug.** On the owner's server (bash): the Terminal entry `aws sso login` with *Runs over SSH* → the arrow runs
   `aws` (no 127), and the login shell stays open with a normal prompt. `shopt -q login_shell && echo login` typed there
   prints `login`. Note how long the start takes compared with 1.21.1.
2. **The other roads.** The same entry as a dependency-chain step of `command -v aws` (prints the path, the chain goes
   on); Run with Secrets of `command -v aws; printf '%s' "$CREDS_REF_1" | wc -c` with one `creds://` reference (the path,
   and the value's length); an agent's `creds_run` of `command -v aws` (the path, exit 0). If a zsh server is at hand,
   the arrow once there.
3. **Windows delivery.** The 8 hostile lines of the parent's hand check 4 (2026-11-10), again, through the arrow from
   pwsh 7 and from Windows PowerShell 5.1 (5.1 refuses the lines that hold `"`, as before), against a real sshd: each
   prints what a local bash prints, then the login shell.

If 1 or 3 fails: stop and report. The fix is then a claim, not a fix (`security.md`, "a measure you have not observed
working is a comment").

## 9. Neighbour plans

| Plan | Touches | This plan's part | Order |
|---|---|---|---|
| [PLAN_agent_refusal_names_unlisted_entry.md](PLAN_agent_refusal_names_unlisted_entry.md) (F7), epic 2 | the refusal sentences of `sshUseActions.ts` (`bridgedRefusal`, `prepareAuth`, `execOverSsh`'s `refuse` lines) and `agentUseActions.ts:398-403` (`remoteRefusal`); its tests `sshUseActions.test.ts`, `agentSshGate.test.ts` | none in those files: this plan changes the VALUE of `plan.remoteCommand` that `agentUseActions.ts:418` hands on, not a line of either file, and no refusal. Disjoint by line. Both edit `CHANGELOG.md`, `module_extension.md` and `module_tests.md` in different sections, and the help in different articles (F7: `helpEn.ts:137`; this plan: `:84`, `:177`, `:180`) | either first; the second to merge re-reads those three documents |
| [PLAN_askpass_answers_the_hop.md](PLAN_askpass_answers_the_hop.md) | ssh's argv and environment for a password entry with a jump host; whether the person's ssh setup applies to a spawned ssh | none: this plan changes only the remote command (the last argv word), never the options, the environment or askpass. Disjoint | either first |
| [PLAN_ssh_exec_own_agent_forwarding.md](PLAN_ssh_exec_own_agent_forwarding.md) | `ssh:exec`'s argv and environment (`-A`, `-T`) | none: `ssh:exec` keeps its command (L9); the linked run's argv words other than the last do not change. Disjoint | either first |

Not neighbours, checked: `PLAN_ssh_exec_absolute_program.md` (the program path of `ssh:exec` on Windows; this plan
changes no program), `PLAN_terminal_runs_followups.md` (the same roads, other lines: `sendPinned`, the arrow's
`{config}`; this plan changes no road file). Method: `grep -l` over `todo/*.md` for `remoteLaunch.ts`, `planLaunch`,
`stayOpenWrapper`, `SECRETS_REMOTE_COMMAND`, `secretsStdin`, `remoteLaunchDelivery`, `shellQuotingRoadScan`,
`agentSshRun.test`, `sshRoadChain.test`, `COPY_NOTE` and `copiedLineOf` (matched: F7, F7's E1 document, the askpass
plan), and for `helpEn` and `Runs over SSH` (matched plans edit other help articles). Each of the three plans in the
table gets one boundary row from its side, in this commit.

**The parent.** [PLAN_terminal_command_over_ssh.md](../research/PLAN_terminal_command_over_ssh.md) is implemented and
in `research/`. This plan corrects two of its shipped texts: §4.2's "hands the one string to the remote login shell
(`$SHELL -c`)" (it is not a login shell) and D12's `"${SHELL:-sh}" -s` (now §3.3). The parent is not edited before this
plan ships (`research/` describes the system as it is); at promotion, its §4.2 and D12 get a dated pointer here.

## 10. Questions for the owner

Asked of nobody yet; the coai question consultants come first (`coai-question-consultant.md`).

1. **Hand checks 1-3 of §8** are the owner's.
2. **L6:** the profile is read twice on the three interactive roads. Accept? (The other shape — the final shell as
   `-i` — gives a shell that is not the login shell SSH Connect gives, against D3.)
3. **L9:** `creds_exec` keeps sshd's non-login shell. Keep, or a todo to give it the login shell too (a change of a
   shipped agent tool's behaviour)?
4. **L8:** the copy stays the trust line and the note says it starts no login shell. Accept?

## 11. Definition of Done

- [ ] Every road of §1 runs the line in the server's login shell: T1-T4 and T9 green, each watched RED on `main` first
      (the 127 messages in the summary).
- [ ] Exit codes, the stay-open shell, the folder and `exit` behave as today (T5, T8); the trust line is unchanged (U6).
- [ ] Run with Secrets: a profile that reads stdin gets nothing and the values arrive (T6), watched RED under the
      rejected `-l -s`; a profile that hides `cat` fails closed (T7).
- [ ] U1-U7 green, each RED first; the tests of §5 "Tests that change" rewritten; the rest green unchanged.
- [ ] `shellQuotingRoadScan.test.ts`: the widened template shape watched RED on the new site, then the row; green.
- [ ] Every real-shell run uses an owned `HOME`; no test reads the runner's own profile.
- [ ] `npm run typecheck`, `npm test` and lint in `src_vs_code` green, at lowered priority.
- [ ] Help ×5 (English first), README, `research/module_extension.md`, `research/module_tests.md`, CHANGELOG
      `## [Unreleased]` changed as §7 says; no text says "login shell" where none runs.
- [ ] The boundary rows of §9 are in the three neighbour plans.
- [ ] coai: a plan round reached `proceed`; a code round ran; every finding resolved; verdicts and reviewer counts in the
      summary.
- [ ] The hand checks of §8 are handed to the owner with the pull request; if 1 or 3 fails, stop.
- [ ] Plan promoted with its deviations when shipped; the parent's §4.2 and D12 get their dated pointer.

## Epics

One epic, by the lead's brief (2026-11-11): one change of two texts in one pure module, with its tests and documents.
The split was not made by Fable. Its stories are here, not in a document of their own, as for a plan this size.

Cornerstones: 1 of 1 — S2

### E1 · The login shell on every SSH road, on `fix/ssh-line-runs-in-login-shell`

- **Goal.** A line that runs over SSH finds what the person's login profile puts on `PATH`, on every road, and the help
  says what is true.
- **Scope.** §3 whole, §5, §7, the rows of §9.
- **Depends on.** Nothing.
- **Done when.** §11 is ticked, except the hand checks, which are owed to the owner.
- **Cornerstone area.** Run with Secrets' remote command (S2): a mistake there sends a secret value to the person's
  profile, or runs the line with an empty value and status 0, and every other test stays green (measured, §3.3).

**Stories.**

- **S1 · The login builder and the plan.** `singleQuotedBody`, `loginShellCommand`, `planRemote`, the comments, the T1
  sentence; T1, T2, T4, T5, T8, T9, U1-U3, U5, U6; the tests that change; the scan (build step 3).
- **S2 · Run with Secrets** (cornerstone, `model: fable` for its scenarios). `SECRETS_REMOTE_COMMAND` (§3.3); T3, T6
  with its teeth, T7, U4; the F3 tests of the delivery file. Follows S1 (it uses `loginShellCommand`).
- **S3 · The documents.** `COPY_NOTE` and U7; help ×5, README, the two `research/` files, the CHANGELOG; then the code
  round and the pull request with the hand checks.
