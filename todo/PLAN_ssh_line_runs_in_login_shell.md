# PLAN — a line that runs over SSH runs in the server's login shell

> Status: **built on `fix/ssh-line-runs-in-login-shell`, 2026-11-11 (S1-S3 as written; the code round, the pull request and the owner's hand checks are pending).** Approved 2026-11-11 (the ledger is below). Scope: the
> extension (`src_vs_code`) only — the composer `remoteLaunch.ts` (two remote command texts, one new builder, two marker
> lines in the script of Run with Secrets, the PowerShell 5.1 check and its sentence), one sentence of `COPY_NOTE`,
> their tests, the scan `shellQuotingRoadScan.test.ts`, help ×5, `src_vs_code/README.md`, `src_vs_code/CHANGELOG.md`,
> `research/module_extension.md`, `research/module_tests.md`, `todo/README.md`, and one boundary row in three neighbour
> plans (§9). No road file changes. No server change, no HTTP contract change, no MCP tool shape change, no trust record
> change. One epic, one pull request, on `fix/ssh-line-runs-in-login-shell` from `main` at `3abb01a3` (extension 1.21.1).
> The owner's decision (2026-11-11, final): the line runs in the server's LOGIN shell; not an interactive shell.

## Plan changes

> Epoch 1 · approved 2026-11-11 · by reviewers · state: open

  (Baseline of epoch 1.) The coai plan round approved this plan on 2026-11-11 (session dad88dee, verdict `proceed`).
  The text below is one approved baseline. It holds the accepted findings of that round, the findings of the lead's
  own Opus review (run at the same time as the round), and the cadence consultation 461ce30e, with the Fable revision
  of the cornerstone story S2 that folds them in. They are not changes after the approval, so the ledger has no entry.
  What each source asked for, and what was rejected, is in §12.

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

**Reproduced here, 2026-11-11** (bash 5 and dash 0.5 on this machine). A temp `HOME` whose `.profile` adds
`$HOME/.local/bin` (it holds a fake `tool`), run the way sshd does
(`env -i HOME=… SHELL=<sh> PATH=/usr/bin:/bin <sh> -c '<remote command>'`):

- today's bare line `tool a b`: bash `bash: line 1: tool: command not found`, status 127; dash `tool: not found`, 127;
- today's stay-open wrapper: the same message, then `creds: the command ended with exit code 127`, then the login shell;
- today's secrets command: not run separately — it is `-s` without `-l`, the same non-login read.

**The shells of the measurements.** bash 5.3.9 and dash 0.5.12 are installed on this machine (Ubuntu 26.04). For this
revision zsh 5.9, mksh R59 (59c), ksh93u+m 1.0.10 and busybox ash 1.37.0 were run too: the Ubuntu 26.04 packages,
unpacked into a scratch folder with `dpkg -x`, not installed. "The six shells" below means these six. Today's bare
line fails with status 127 on all six. Not measured: a real sshd, macOS (its `/bin/sh` and `/bin/bash` are bash 3.2),
a pty with zsh, mksh, ksh93 or ash, and Windows. The hand checks (§8) cover the real sshd and Windows.

## 2. Decisions

| # | Decision | By |
|---|---|---|
| L1 | Every road of §1 runs the line in the server's LOGIN shell. Measured on the six shells, for `<sh> -l -c '<line>'`: bash reads `/etc/profile` and then the first that exists of `~/.bash_profile`, `~/.bash_login`, `~/.profile`; dash, mksh, ksh93 and busybox ash read `/etc/profile` and `~/.profile`; zsh reads `~/.zshenv` (it reads that file today also), `~/.zprofile` and `~/.zlogin`, and not `~/.zshrc`. It is NOT an interactive shell: no `-i`. So the part of `~/.bashrc` that runs only in an interactive shell does not run for the line, and a tool that only that part sets up (nvm, conda, many installers) is not found. This is a documented limit; an interactive option may come later. "`~/.bashrc` is not read" is NOT exact, and no text of this plan says it: see risk 5. | owner, 2026-11-11 (final); the file lists measured by the lead and by Fable |
| L2 | The form is `exec ${SHELL:-sh} -l -c '<inner>'`: sshd's shell replaces itself by a login shell that runs `<inner>`. `exec` keeps the exit code (the login shell's status is the line's), keeps one process, and keeps the working folder and the variables of the line for the stay-open shell (§3.1). `${SHELL:-sh}` stays UNQUOTED, as in today's wrapper, so the text adds no `"` and never trips the Windows PowerShell 5.1 refusal (§4.6 of the parent). | lead |
| L3 | `<inner>` is today's text, unchanged: the stay-open wrapper (`stayOpenWrapper`) on the arrow, the folder run and the VPN launcher; the bare line on the chain step and the agent's run. Only the outer layer is new. | lead |
| L4 | The single quotes of `<inner>` are escaped as `'` → `'\''` by ONE private function that the stay-open wrapper and the new builder share (today the wrapper has the escape inline, `remoteLaunch.ts:228`). Not `quoteFor('posix', …)`: its `'"'"'` would put a `"` into the remote command for every `'` of the line, and the PowerShell 5.1 refusal would then fire on any line with a `'` (E1.S2 spec §S2.1 item 1, the same reason). | lead |
| L5 | *Run with Secrets*: the login shell must NOT read the script from its standard input while it reads its profile. sshd's shell moves the script to file descriptor 3 and gives the login shell an empty input. After the profile, the login shell reads fd 3 whole with the real `cat`, runs the script only when it arrived whole (a first and a last marker line), runs it in a subshell with fd 3 closed, and first turns off the shell options `-a`, `-v` and `-x` and removes any variable of the same name. Every word has a measured reason (§3.3). **The promise:** the login profile, and what it sources, read an EMPTY standard input, so they cannot take a value by accident; a script that did not arrive whole is never run. **Not promised:** secrecy from the person's own startup files. They are the person's own trusted code, they run as the same user in the same shell, and fd 3 is open while they run (measured: a child of the profile can read the script from fd 3). Two forms are REJECTED, both measured: `"${SHELL:-sh}" -l -s` (a `~/.profile` with `read -r x` took the first export line WITH THE SECRET VALUE, and the line then ran with an EMPTY value and status 0), and the text of the first approval, `creds_script=$(cat <&3) && eval "$creds_script"` (the failures of §3.3). | Fable (the security judgement of S2), measured; first form by the lead |
| L6 | The stay-open shell stays as today: after the line, `exec ${SHELL:-sh} -l` starts an interactive login shell (D3 of the parent). So on the three interactive roads the profile is read twice: once for the line (non-interactive) and once for the shell the person types into. Accepted and recorded (§6, risk 1). The help and the CHANGELOG say it, and they give the guard: put what must run once per login (ssh-agent, keychain, a greeting) inside `case $- in *i*) … ;; esac`. | lead; the owner may override (§10) |
| L7 | The trust line does NOT change. It is built from the person's line (`plan.line`), never from the remote command, on every road: `sshRoad.ts:215`, `:280`; `commands/runCommands.ts:569`; `agentUseActions.ts:282`, `:409`; `folderRun.ts:155` and `dependencyRunHost.ts:145` (both through `shownTrustLine`, `remoteLaunch.ts:334`). So no linked entry asks again after the update, and the consent dialog of an agent's run shows the same text. Reading the person's own profile on their own server is not a new target or a new command, so it needs no new approval: a person who can write that profile already owns the account. The CHANGELOG says this. | lead |
| L8 | *Copy Command*, the viewer row and *Copy All* keep copying the trust line, byte-identical (parent §4.4: "the composed launch line is never copied"). Copying the login form instead would put `'\''` into every copied line, and a copied line pasted into PowerShell would then break for every line, not only for a line with a `'`. `COPY_NOTE` (`remoteLaunch.ts:338`) gains one clause that says the difference (§3.4). | lead; the owner may override (§10) |
| L9 | `creds_exec` (`ssh:exec`, the agent's own command on an SSH entry, `sshUseActions.ts:327`) is NOT changed: the agent writes that command, it is a shipped tool contract, and an agent can write `bash -lc '…'` itself. SSH Connect is not changed: it sends no remote command, so sshd already starts a login shell. | lead; a question for the owner (§10) |
| L10 | fish, csh and tcsh stay unsupported (parent §4.2). Note: today the chain step, the agent's run and Run with Secrets ran a fish-syntax line on a fish login shell by accident (the bare line under `fish -c`). After this plan every road starts with the POSIX word `${SHELL:-sh}`, which fish does not parse. The help already says fish is not supported; the CHANGELOG says that the three roads now need a POSIX login shell too. | lead |
| L11 | **Logout files.** bash runs `~/.bash_logout` when a login shell ends through the `exit` builtin, also a non-interactive one. Measured: a line with no `exit` does not run it; a line that calls `exit` runs it; a logout file that itself calls `exit N` then REPLACES the status (`exit 9` made a line's `exit 0` a 9, and `exit 0` made a line's `exit 7` a 0); a logout file that ends with `false` keeps the status. **Run with Secrets is protected:** its script runs in a subshell, so no `exit` reaches the login shell, no logout file runs, and the status is always the line's (measured, §3.3). **The other roads are a recorded limit:** the inner text stays the person's line (L3), so a line that calls `exit` runs `~/.bash_logout`, and a logout file with its own `exit N` replaces the status of that line. zsh, ksh93, mksh, dash and busybox ash ran no logout file for the line (zsh 5.9 did not run `~/.zlogout` for a non-interactive login shell, with or without `exit`). | Fable for Run with Secrets, measured; the limit: a question for the owner (§10) |
| L12 | **The Windows PowerShell 5.1 refusal names only the double quote.** With the login form the remote command of every plan ends with `'`, so the final-backslash half can never fire (§3.5). The check keeps the `"` half; the sentence, the help ×5 and the README name only the double quote. | lead's review, measured there; the code shape in §3.5 |

## 3. Design — the exact texts

All of it is in `remoteLaunch.ts`. No road file changes: every road gets its remote command from `planLaunch` or from
`SECRETS_REMOTE_COMMAND` already, and Run with Secrets gets its script from `secretsStdin` already.

### 3.0 The final remote command of each road

These are the exact texts, given once. The line is `aws sso login`. `${SHELL:-sh}` is unquoted in all three (one
builder, L2); a local shell types the first two.

Arrow, folder run, VPN launcher (`stayOpen: true`):

```text
exec ${SHELL:-sh} -l -c 'eval '\''aws sso login'\''; s=$?; test $s -eq 0 || printf '\''creds: the command ended with exit code %s\n'\'' $s >&2; exec ${SHELL:-sh} -l'
```

Chain step, agent's linked run (`stayOpen: false`):

```text
exec ${SHELL:-sh} -l -c 'aws sso login'
```

Run with Secrets (a fixed text; the line and the values are in the script on standard input, §3.3):

```text
exec ${SHELL:-sh} -l -c 'set +avx; unset creds_script && creds_script=$(command cat <&3) && case $creds_script in "#creds-secrets-1"*"#creds-secrets-end") (eval "$creds_script") 3<&- ;; *) echo "creds: the script with the values did not arrive whole, and nothing was run. A startup file on the server, such as ~/.bashrc, possibly read the standard input." >&2; false ;; esac' 3<&0 </dev/null
```

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

**Nesting.** On the stay-open roads the person's line is single-quoted twice: once by the wrapper (`eval '…'`), once
by the builder. A `'` in the line becomes `'\''` and then `'\''\'''\''`. On the typed roads the whole remote command
is then quoted a third time for the LOCAL shell by `buildSshCommand` (`quoteFor` posix or PowerShell, unchanged). Each
layer is the same mechanical escape, and the delivery tests (§5) prove the round trip through real shells.

**What the stay-open roads keep.** Measured under bash and dash (§1's setup, a stand-in `$SHELL` that marks the final
`-l` shell): the line's output, then the exit-code sentence for a failure (`TOOL_EXIT=4 tool fail` → `exit code 4`),
then the login shell; `echo ok # a note` and `echo a &` keep the login shell; `cd /tmp && tool cd` → the final shell
starts in `/tmp` (the same as today, because `exec` keeps the folder); `exit 3` ends with status 3 and no login shell
(the same as today); an unclosed quote behaves as today (bash: message, sentence, login shell; dash: the special builtin
`eval` ends the shell, status 2 — the parent's recorded limit). With a real pty (`script -qec`, bash and dash): the
profile ran for the line (`$-` = `hBc`, non-interactive), the line found `tool`, then the profile ran again for the
final shell (`$-` = `himBH`), which showed a normal prompt, ran typed commands with `tool` on `PATH`, and passed `exit 5`
back as the status.

Measured again for this revision on the six shells, with no pty: eight lines of the lead's corpus on the bare road
(typed by a real local bash, then run as `<sh> -c`) gave the same output and status as `<sh> -l -c '<line>'` run
directly, 8 of 8 on each shell; on the stay-open road `tool "it's"`, `TOOL_EXIT=7 tool x` (the sentence says 7),
`cd "$HOME/sub" && tool cd` (the final shell starts in `sub`), `exit 3` (status 3, no login shell), `echo a &` and
`echo ok # c` behaved the same on all six.

### 3.2 Exit codes and logout files

`exec` replaces sshd's shell by the login shell, so ssh's exit status is the line's. Measured (bash, dash):
`TOOL_EXIT=7 tool x` → 7, `false` → 1, a line that prints and pipes → 0, with the same output as the line run directly.
Measured again on the six shells: `TOOL_EXIT=4 tool fail` → 4 on the bare road, with the output of the line run
directly. The chain reads the step's status, and the agent's answer carries `exitCode` (`sshExecRunner.ts`), so both
keep it.

**One exception, bash only (L11).** Measured with a `~/.bash_logout` that prints a marker, on bash 5.3.9 (status, and
`L` when the logout file ran):

| The line | Logout file ends with | Bare line (chain step, agent) | Stay-open roads | Run with Secrets |
|---|---|---|---|---|
| `TOOL_EXIT=7 tool x` | anything | 7 | sentence "7", then the login shell | 7 |
| `exit 7` | `false`, or no `exit` | 7 `L` | 7 `L` | 7 |
| `exit 7` | `exit 0` | **0** `L` | **0** `L` | 7 |
| `exit 0` | `exit 9` | **9** `L` | **9** `L` | 0 |

Run with Secrets never ran the logout file. The bold cells are the recorded limit of the other roads. The final login
shell of the stay-open roads runs its logout file when the person leaves it, as after SSH Connect.

### 3.3 Run with Secrets

```ts
export const SECRETS_SCRIPT_FIRST = '#creds-secrets-1';
export const SECRETS_SCRIPT_LAST = '#creds-secrets-end';
export const SECRETS_NOT_WHOLE =
  'creds: the script with the values did not arrive whole, and nothing was run. A startup file on the server, such as ~/.bashrc, possibly read the standard input.';

const SECRETS_INNER =
  'set +avx; unset creds_script && creds_script=$(command cat <&3) && ' +
  `case $creds_script in "${SECRETS_SCRIPT_FIRST}"*"${SECRETS_SCRIPT_LAST}") (eval "$creds_script") 3<&- ;; ` +
  `*) echo "${SECRETS_NOT_WHOLE}" >&2; false ;; esac`;

export const SECRETS_REMOTE_COMMAND = `${loginShellCommand(SECRETS_INNER)} 3<&0 </dev/null`;   // the text of §3.0
```

`secretsStdin` (`:319-322`) gains its first and its last line, and nothing else changes in it. For
`secretsStdin({ CREDS_REF_1: "it's" }, 'tool sec')`:

```text
#creds-secrets-1
CREDS_REF_1='it'"'"'s'; export CREDS_REF_1
{
tool sec

} </dev/null
exit $?
#creds-secrets-end
```

The two marker lines are shell comments, so they do nothing when the script runs. The sentence holds no `"`, `$`,
`` ` ``, `\` or `'`, because it stands inside `"…"` in the command; U4 checks that. The text holds `"`; this road
spawns ssh with no local shell (D12), so the PowerShell 5.1 refusal does not apply, as today.

**What happens, in order.**

1. sshd's shell runs `exec … 3<&0 </dev/null`: the script (ssh's stdin) moves to fd 3, and the login shell's standard
   input is `/dev/null`.
2. The login shell reads its profile. The profile, and what it sources, read an empty input.
3. `set +avx` turns off three options that the profile could have turned on: `-a` (every new variable is exported),
   `-x` and `-v` (the shell prints what it runs or reads).
4. `unset creds_script &&` removes a variable of that name, with its export mark. If it cannot (a read-only variable),
   the run stops there with a status that is not 0.
5. `creds_script=$(command cat <&3) &&` reads fd 3 to its end into a shell variable. The variable is not exported and
   is on no command line (`cat` gets no argument). `command` makes it the real `cat` of `PATH`, not an alias or a
   function of the same name.
6. `case … in "#creds-secrets-1"*"#creds-secrets-end")` runs the script only when its first and its last line are
   there. Standard input is a stream, so something that reads it before `cat` takes the START of the script; a write
   that stops early loses the END. Any other text gets the sentence on standard error and status 1. That branch ends
   with `false`, not `exit 1`, so bash runs no logout file there (measured: with `exit 1` and a logout file that says
   `exit 0`, the refusal ended with status 0).
7. `(eval "$creds_script") 3<&-` runs the script in a subshell with fd 3 closed. The line and its children have no
   fd 3. The script's `exit $?` ends the subshell, and its status is the status of the login shell, which then ends
   without `exit`: no logout file runs (L11).

**Every word has a measured reason.** "The first approved text" is
`exec ${SHELL:-sh} -l -c 'creds_script=$(cat <&3) && eval "$creds_script"' 3<&0 </dev/null` with a script that has no
marker lines. Measured 2026-11-11 on the six shells, sshd's way (`env -i HOME=… SHELL=<sh> PATH=/usr/bin:/bin <sh> -c
'<command>'`, the script on a real pipe), unless a row names fewer shells:

| The word | What it stops | Measured without it | Measured with the final text |
|---|---|---|---|
| `3<&0 </dev/null` | the profile reads the script | `"${SHELL:-sh}" -l -s` (rejected): a `.profile` with `read -r x` printed the export line WITH THE VALUE; the line saw an EMPTY value; status 0 (lead, bash and dash) | the profile read nothing (`[]`); the value byte-equal; status 0 |
| `set +a`, `unset creds_script` | the whole script goes into the environment of every child of the line | first approved text, a profile with `set -a`, or with `creds_script=OLD; export creds_script`: a child of the line had `creds_script` in its environment, on all six (the consultation 461ce30e found it under bash and dash) | the child had no `creds_script`; the value byte-equal; status 0. A profile with `readonly creds_script`: nothing ran, status 1 or 2 |
| `set +x` | the shell traces the script, with the values, to standard error | first approved text, a profile with `set -x`: all six printed the script. dash printed the value whole; the other five printed it in another quoting, which the masked terminal does not replace (`secretMasker.ts`: only exact values) | standard error held only the trace of `set +avx` itself (ksh93: nothing); no part of the value |
| `set +v` | the shell prints the script as it reads it | first approved text, a profile with `set -v`: bash, mksh and ksh93 printed the script with the value | bash, zsh and ksh93 printed the fixed command text only; no part of the value |
| `command` before `cat` | an alias or a function named `cat` reads the script | plain `cat`, a profile with `alias cat="cat -v"`: on dash, zsh, mksh, ksh93 and ash the value `pässwörd` arrived as `pM-CM-$sswM-CM-6rd`, status 0 (bash does not expand an alias here; it does use a function `cat`) | the value byte-equal on all six, with the alias and with a function |
| the two marker lines and `case` | a script that did not arrive whole runs | first approved text: (a) sshd's own bash read `~/.bashrc` first (see below) with `read -r x`: it took `A='SECRET…'; export A`, the line ran with `A=` EMPTY, status 0 (lead; again here; the same with zsh and `~/.zshenv`); (b) a child of the profile ran `cat <&3`: nothing ran, status 0. With the first marker only: 20 of the 127 cut scripts ended with status 0 and nothing run (bash) | (a) the startup file took the marker line, not a value; the sentence; status 1; nothing ran. (b) the sentence, status 1. Each of the 145 cuts that lose a part of the last marker (bash and dash): nothing ran, status not 0. The whole script, with and without its final line break: ran, status 0 |
| `( … )` | a logout file changes the status | `eval` in the login shell: `~/.bash_logout` ran on every run; with `exit 0` in it a line's status 7 became 0, and with `exit 9` a status 0 became 9 | the logout file never ran; the status was the line's (the table of §3.2) |
| `3<&-` | the line and its children hold fd 3 | without it the line could open fd 3 (lead; again here, bash and dash) | the line could not open fd 3, on all six |
| `false`, not `exit 1` | a logout file hides the refusal | with `exit 1` and a logout file that says `exit 0`: the refusal ended with status 0 | status 1; the logout file did not run |

Also measured with the final text, on the six shells: `exit 7` → 7; `TOOL_EXIT=7 tool x` → 7; `false` → 1;
`echo tail \` → `tail`; `cat; echo after-cat` → `after-cat` (the line reads an empty input); a value that holds `'`,
`"`, `$HOME`, a backtick, `\n`, two line breaks and a final `\` came back byte-equal with `tool` found through the
profile; twenty values of about 35 kB each (a script of 1.16 MB) byte-equal, in less than 0.3 s on each shell; a
profile with `set -u` ran the line, and one with `set -e` ran it under `-e`; no history file held a value with
`set -o history` in the profile. The bash-only line `[[ x = x ]] && printf ok` printed `ok` under bash, zsh, mksh,
ksh93 and ash, and gave status 127 under dash, as the parent's F3 tests expect. A profile that sets `PATH` without
`/usr/bin`: status 127 (bash: `cat: command not found`), nothing of the line ran (fails closed: `&&`); busybox ash has
`cat` built in and ran the line.

**A startup file that runs BEFORE the redirection.** sshd's own shell starts before `3<&0 </dev/null` applies. What it
reads at its start, it reads with the script on standard input. Measured:

- **bash 5.3.9 (Ubuntu)** reads `~/.bashrc` for a `-c` command when `SHLVL` is not set (the environment that sshd
  gives a command has none; the real sshd is hand check 4) AND one of these is true: `SSH_CLIENT` or `SSH2_CLIENT` is
  set (sshd sets `SSH_CLIENT`), or standard input is a socket. `SSH_CONNECTION` alone did not do it. It does this
  today also, before this plan.
- **zsh 5.9** reads `~/.zshenv` at every start, so twice here: in sshd's shell and in the login shell.
- dash, mksh, ksh93 and busybox ash read no file for a `-c` command.

Such a file is the person's own. The usual one returns at its first lines when the shell is not interactive (Ubuntu's
default `~/.bashrc` does). If it reads standard input, it takes the START of the script. The first line is the marker,
so one `read` takes no value; a reader that takes more (a `cat`) takes values, as any of the person's own programs
can. In both cases the script is no longer whole, the run stops with the sentence and status 1, and nothing runs.

**What a cut at the end does.** A script that lost its end has no last marker and is refused. If the person's own line
ends with the text of the last marker and the cut is directly after it, the `{` group is not closed: a syntax error,
nothing runs, status not 0 (measured on the six shells).

**Rejected in the approving round, and why that stays.** `$( )` removes the line breaks at the end of the script: the
script ends with the marker line, and the script with and without its final line break ran the same (measured). The
`cat` dependency: a missing `cat` fails closed with 127 (measured above).

### 3.4 `COPY_NOTE`

Today: "This line uses your own ssh setup (agent, ~/.ssh/config); the vault's key and password are not in it — use Run
to connect with them." New: "This line uses your own ssh setup (agent, ~/.ssh/config); the vault's key and password are
not in it, and on the server it does not start your login shell — use Run to connect with them." The copied text
itself does not change (L8).

### 3.5 The PowerShell 5.1 refusal

`powerShell51Refusal` (`remoteLaunch.ts:272-277`) refuses today when the remote command holds `"` or ends with `\`.
Windows PowerShell 5.1 puts an argument with a space inside `"…"` and escapes nothing in it. The Windows argument rules
read `\` as special only directly before a `"`. With the login form the remote command of every plan that `planLaunch`
makes ends with `'` (§3.0), so the character before that closing `"` is always `'`, never `\`. The final-backslash half
can never fire again, and a line that ends in `\` is safe to type.

So (L12):

- the check keeps the `"` half only (`plan.remoteCommand.includes('"')`); the `endsWith('\\')` half is removed. A guard
  that cannot fire, beside a sentence that no longer names it, reads as a protection that is not there (`security.md`:
  delete an inert measure). U8 pins the reason: the remote command of every plan ends with `'`.
- the sentence becomes: `This terminal is Windows PowerShell 5.1, which cannot pass a double quote to ssh correctly.
  Install PowerShell 7 (pwsh) and run "<name>" again.`
- the help ×5 and `src_vs_code/README.md:309-310` name only the double quote (§7).
- R20 (§5) asserts that a line that ends in `\` is typed under 5.1; hand check 3 observes that line on a real
  Windows PowerShell 5.1.

The `"` half fires exactly as today: only a `"` of the person's line puts one into the remote command. No new refusal:
the new text adds `$`, `{`, `}`, `\` and `'` only, and inside a PowerShell single-quoted word `quoteFor('powershell')`
doubles every `'` and leaves the rest literal. Windows' native re-quoting of the argument is hand check 3 (§8).

### 3.6 Class sweep — every site that builds, types, shows or spawns a remote command

Method: `grep -rn` over `src_vs_code/src` (tests excluded) for `planLaunch(`, `stayOpen`, `.remoteCommand`,
`SECRETS_REMOTE_COMMAND`, `stayOpenWrapper`, `buildSshExecArgv(`, `remote: {`, `typedLine(`, `recheckedLine(`,
`trustLineFor(`, `shownTrustLine(`, `copiedLineOf(` and `${SHELL`, 2026-11-11 at `3abb01a3`; for this revision also
`secretsStdin(`. Every hit:

| Site | What it does with the remote command | After this plan |
|---|---|---|
| `remoteLaunch.ts:195` `planRemote` | makes it | the login form (§3.1) — the one change |
| `remoteLaunch.ts:288` `typedLine` → `buildSshCommand` `remote` | quotes it for the local shell (posix or PowerShell) | unchanged; the delivery tests cover the new text |
| `remoteLaunch.ts:272` `powerShell51Refusal` | refuses a remote command that 5.1 cannot pass | the `"` half only (§3.5) |
| `remoteLaunch.ts:437` `secretsArgv` | passes `SECRETS_REMOTE_COMMAND` as the last argv word | unchanged; the constant changes (§3.3) |
| `commands/runCommands.ts:584` `secretsStdin(…)` | the one caller of the script; writes it to ssh's stdin | unchanged; the script gains its two marker lines (§3.3) |
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
proof: the delivery test). RED first: the widened pattern finds the new site before its row exists. The templates of
`SECRETS_INNER` hold the two marker constants and the sentence inside `"…"`. Whether the widened shapes match them is
found when the scan runs. If they do, each gets a row (`vault: 'none'`: constants of the same file, not values); if
they do not, U4 is the control of that text.

## 4. Build order

One epic, one pull request. Each step is RED first.

1. **The real-shell reproduction (§5 T1-T4), RED on `main`'s code.** The new test file runs today's composed remote
   commands the way sshd does and fails with 127. Keep the failure messages for the summary.
2. **The composer.** `singleQuotedBody`, `loginShellCommand`, `planRemote`'s one expression, the three constants and
   `SECRETS_REMOTE_COMMAND`, the two marker lines of `secretsStdin`, the `"` half of `powerShell51Refusal` and its
   sentence (§3.5), and the comments that said "login shell" untruly (`:222`, `:297`, `:314`, `:412`, `:446`). The unit
   tests of §5 U1-U9 go RED first, then green. Existing tests that pin today's text are rewritten in the same commit
   (§5 "Tests that change").
3. **The scan.** `SHELL_TEMPLATES` widened, watched RED on the new template; the rows written; green.
4. **`COPY_NOTE`** (§3.4) and its test.
5. **Help ×5** (English first), `src_vs_code/README.md`, `research/module_extension.md`, `research/module_tests.md`,
   `src_vs_code/CHANGELOG.md` `## [Unreleased]` (§7).
6. **The gates**: `npm run typecheck`, `npm test`, lint, at lowered priority; the coai code round; the pull request.
   The owner's hand checks (§8) go into the pull request text.

## 5. Test plan

**The environment of every real-shell run.** Each run uses an OWNED temp folder (`ownedDir(t, …)` from
`scripts/lib/leftovers.cjs`, the test-leftovers rule) as `HOME`, so no test reads the developer's or the CI runner's own
profile. Each run also sets `ZDOTDIR` to that folder (zsh) and removes `ENV` and `BASH_ENV` from the child's
environment. Each run removes `SSH_CLIENT`, `SSH2_CLIENT` and `SSH_CONNECTION` too, and sets `SHLVL` on purpose, not
by inheritance: bash's read of `~/.bashrc` for a `-c` command depends on all of them and on the kind of standard input
(§3.3). Node gives a child a SOCKET as its piped standard input, so with no `SHLVL` bash reads the `~/.bashrc` of the
owned `HOME` even with no `SSH_*` variable; an owned `HOME` has no such file unless the test writes one. Only the
startup-file case of T6 sets `SSH_CLIENT` and removes `SHLVL`, and it asserts that the file's own marker is in the
output: a test of that case that never read the file would pass and prove nothing. `/etc/profile` is still read; so an
assertion on exact output compares against the same line run by a LOGIN shell directly (`<sh> -l -c '<line>'` with the
same `HOME`), not against fixed text, and a marker assertion uses `includes`, not equality.

**The sites that run a composed remote command in a real shell** (each must use the owned `HOME`; method:
`grep -n` over `src_vs_code/src/test` for `SECRETS_REMOTE_COMMAND`, `.remoteCommand`, `stayOpenWrapper(`, `'-c'` and
`-c "$`, 2026-11-11): the new file below; `remoteLaunchDelivery.test.ts:239` (`viaRemoteLoginShell`); and
`maskedTerminal.test.ts:535-555` (`writeFakeSsh`: its fake `ssh` runs `/bin/sh -c "$1"` with the real
`SECRETS_REMOTE_COMMAND` at `:581`, `:617` and `:655`, and it has the developer's `HOME` today). The wrapper tests of
`remoteLaunchDelivery.test.ts:159-204` run `stayOpenWrapper` alone, with no `-l` shell of their own, and do not change.

**Shells.** bash and dash (and `sh`, which is dash here), each probed and skipped with a printed reason when absent;
zsh, ksh93, mksh and busybox ash the same. These four are not installed on this machine, and the CI job installs none
of them (whether the runner image has one is not checked). Where one is absent the test prints its skip reason; what
these four do is then the dated measurement of §3 (risk 7).

**New file `test/remoteLoginShell.test.ts`** — the owner's bug, reproduced through the composer:

| # | Test | Assertion | RED on `main` |
|---|---|---|---|
| T1 | `the_profile_path_reaches_the_bare_line_on_every_login_shell` | `HOME` holds `.profile` that adds `$HOME/bin` (a fake `tool` that prints its arguments and exits with `$TOOL_EXIT`); the remote command of a plan with `stayOpen: false` for `tool a b`, run as `<sh> -c '<remote command>'` with `SHELL=<sh>` (bash, dash, `/bin/sh`), prints `tool ran: a b`, status 0 | `tool: command not found`, 127 |
| T2 | `the_profile_path_reaches_the_line_on_the_stay_open_roads` | `stayOpen: true`; `SHELL` = an owned stand-in that, called with exactly `-l`, prints `LOGIN-SHELL` and its `PATH` check, else `exec`s the real shell; output has `tool ran: a b`, then `LOGIN-SHELL`, no exit-code sentence | the 127 sentence |
| T3 | `the_profile_path_reaches_run_with_secrets` | `SECRETS_REMOTE_COMMAND` with `secretsStdin({ CREDS_REF_1: <the §S2.4 hostile value> }, 'printf "<%s>" "$CREDS_REF_1"; tool sec')` on stdin: the value byte-equal and `tool ran: sec`, status 0. A second line, `(: <&3) 2>/dev/null && echo open \|\| echo closed`, prints `closed`: the line has no fd 3 | 127 |
| T4 | `bash_reads_bash_profile_first` | a `HOME` with `.bash_profile` (adds the folder) and a `.profile` that does not: bash finds `tool`; dash (which reads only `.profile`) does not, 127 — what a login at a prompt does | bash 127 |
| T5 | `the_exit_code_of_the_line_is_the_status` | bare: `TOOL_EXIT=7 tool x` → 7, `false` → 1; secrets: 7 and 1, and `exit 7` → 7; stay-open: the sentence says 7 and the login shell follows | green on `main` (a guard: proves `exec` keeps it) |
| T6 | `a_startup_file_that_reads_stdin_gets_no_value` | (a) `.profile` holds `read -r x; printf '[%s]\n' "$x"`: output has `[]`, the value byte-equal, status 0. (b) bash, with `SSH_CLIENT` set and no `SHLVL`: `.bashrc` holds `read -r x; printf 'RC[%s]\n' "$x"`: output has `RC[#creds-secrets-1]` (the file WAS read, and it took the marker), standard error is `SECRETS_NOT_WHOLE`, status 1, the line did not run. (c) the same with `cat >/dev/null` in `.bashrc`: the sentence, status 1 | (a) green on `main` (no profile is read); RED under the rejected `"${SHELL:-sh}" -l -s` — the teeth: that text is put in temporarily, watched red (the profile prints the export line, the value is empty), and restored. (b) and (c): RED under the first approved text (the line runs with an empty value, status 0). The messages go in the summary |
| T7 | `a_profile_that_hides_cat_fails_closed` | `.profile` sets `PATH="$HOME/bin"` (bash and dash): Run with Secrets ends 127, `tool` did not run | n/a (new behaviour) |
| T8 | `the_stay_open_shell_keeps_the_folder_and_exit` | `cd "$HOME/sub" && tool` → the stand-in reports `$HOME/sub`; `exit 3` → 3, no `LOGIN-SHELL` | green on `main` (a guard) |
| T9 | `the_typed_line_end_to_end` | `typedLine` of a `stayOpen: true` plan through the REAL local bash with the fake `ssh` of `remoteLaunchDelivery.test.ts` (shared, not copied), then the recorded element run as `<sh> -c` with the owned `HOME`: `tool ran:` and `LOGIN-SHELL` | 127 |
| T10 | `a_logout_file_runs_only_after_exit_and_never_for_run_with_secrets` | bash only. `.bash_logout` prints `LOGOUT-RAN` and ends with `false`: the bare line `exit 7` → `LOGOUT-RAN`, status 7 (kept); the bare line `TOOL_EXIT=7 tool x` → no `LOGOUT-RAN`, 7; Run with Secrets of `exit 7` and of `TOOL_EXIT=7 tool x` → no `LOGOUT-RAN`, 7. `.bash_logout` ends with `exit 0`: Run with Secrets of `exit 7` → 7; a script that is not whole → status 1, no `LOGOUT-RAN`. RECORDED, the limit of L11: the bare line `exit 7` with that logout file → 0 | the secrets rows: RED when `eval` runs in the login shell (status 0), and the refusal row RED with `exit 1` in place of `false` (status 0) |
| T11 | `the_script_is_not_in_a_childs_environment` | three profiles: `set -a`; `creds_script=OLD; export creds_script`; `creds_script=OLD; readonly creds_script`. The line is `sh -c 'echo "child:${creds_script+SET}"'`. The first two: output is `child:` (never `child:SET`), status 0, and `CREDS_REF_1` still arrives byte-equal. The third: status not 0, the line did not run. The test prints the word `SET`, never the variable's value | RED under the first approved text: `child:SET` |
| T12 | `a_profile_that_traces_does_not_print_the_values` | a profile with `set -x`, and one with `set -v`; the value is `s3cr3t'q"x`. Standard error holds neither the value nor its core `s3cr3t`; standard output has the value byte-equal; status 0 | RED under the first approved text: the script is on standard error |
| T13 | `the_script_runs_whole_or_not_at_all` | bash and dash. Every cut of one script that loses a part of the last marker line (each length from 0 bytes up): `tool` did not run, status not 0. The script without its final line break, and the whole script: `tool ran`, the value byte-equal, status 0. A profile whose child runs `cat <&3 >/dev/null`: `SECRETS_NOT_WHOLE`, status 1 | RED under the first approved text (a cut script ends with status 0), and with the first marker only (20 cuts end with status 0) |
| T14 | `the_script_is_read_by_the_real_cat` | a profile with `alias cat="cat -v"` (dash, and zsh, mksh, ksh93, ash where installed), and one with the function `cat() { command cat -E "$@"; }` (bash): the value `pässwörd` arrives byte-equal, status 0 | RED with plain `cat`: the value arrives as `pM-CM-$sswM-CM-6rd` with status 0 (dash, the alias), or the sentence and status 1 (bash, the function) |

**Unit tests, `test/remoteLaunch.test.ts`** (each RED first):

| # | Assertion |
|---|---|
| U1 | `loginShellCommand('x')` is exactly `exec ${SHELL:-sh} -l -c 'x'`; `loginShellCommand("it's")` is `exec ${SHELL:-sh} -l -c 'it'\''s'` |
| U2 | `loginShellCommand` adds no `"`: for the corpus of the delivery test, the count of `"` in the output equals the count in the input |
| U3 | `planLaunch(…, { stayOpen: true })` → `remoteCommand === loginShellCommand(stayOpenWrapper(line))`; `stayOpen: false` → `loginShellCommand(line)`; both start with `exec ${SHELL:-sh} -l -c '` |
| U4 | `SECRETS_REMOTE_COMMAND` is exactly the third text of §3.0, as one literal; `SECRETS_SCRIPT_FIRST`, `SECRETS_SCRIPT_LAST` and `SECRETS_NOT_WHOLE` are the texts of §3.3; `SECRETS_NOT_WHOLE` and the two markers hold none of `"`, `$`, `` ` ``, `\`, `'` and no line break |
| U5 | `stayOpenWrapper` is byte-identical to today for the existing cases (it now calls `singleQuotedBody`) |
| U6 | the trust line of a linked entry is the same before and after (L7): `trustLineFor(ssh, jump, plan.line)` of a plan, and the plan's `line` is the person's line, not the remote command |
| U7 | `COPY_NOTE` is the text of §3.4; `copiedLineOf` of a linked entry is still the trust line (`sshRoadCopies.test.ts`) |
| U8 | for every element of the delivery corpus and for `echo a\`, with `stayOpen` true and false: the plan's remote command ends with `'` and never with `\` (the reason of §3.5) |
| U9 | `secretsStdin` is exact (R23 rewritten): the first line is `SECRETS_SCRIPT_FIRST`, the line before the final line break is `SECRETS_SCRIPT_LAST`, and the lines between are today's, in today's order |

**Windows delivery** (the login form through the local shells and the Windows parsers). The corpus `CORPUS`
(`remoteLaunchDelivery.test.ts:37`) moves to a small helper module with no test in it, so two files share it and
neither copies it. For each element `c`, `bash_delivers_one_remote_element_byte_equal` (`:107`) and
`pwsh_delivers_one_remote_element_byte_equal` (`:117`) deliver three commands, not one: `c`, `loginShellCommand(c)` and
`loginShellCommand(stayOpenWrapper(c))`. `windowsParsers.test.ts` (the `runner-windows` job of `ci-extension.yml`,
step `:236`; the case at `:330`) reads the `remote` word of `buildSshCommand(…, 'win32', …)` for the same three
commands of each element back through a real Windows PowerShell 5.1 and PowerShell 7, byte for byte. That case observes
PowerShell's reading of the word; Windows' native re-quoting of an argument under 5.1 stays hand check 3.

**Tests that change** (they pin today's text; each is rewritten to the new text, and the rewrite is the RED):

- `remoteLaunch.test.ts:243-247` (R15: the plan's remote command);
- `remoteLaunch.test.ts:330` (R20): the name and the sentence name only the double quote; the `quoted` plan is refused
  under 5.1 as today; the `slashed` plan (`echo a\`) is now TYPED under 5.1, and the test says why (U8);
- `remoteLaunch.test.ts:347` (R21) and `:364` (R22): they pin `… deploy@host 'echo hi'`; the last word becomes the
  login form in the posix quoting (`'exec ${SHELL:-sh} -l -c '"'"'echo hi'"'"''`) and in the PowerShell quoting
  (`'exec ${SHELL:-sh} -l -c ''echo hi'''`);
- `remoteLaunch.test.ts:375` (R23): the script's first and last line (U9);
- `agentSshRun.test.ts:34`: `'echo linked'` → `loginShellCommand('echo linked')`, and the message "the bare line: no
  eval, no exec, no wrapper" becomes false; it becomes "the line in the login form: no eval, no stay-open wrapper";
- `sshRoadChain.test.ts:104-105` (`'migrate'` → `loginShellCommand('migrate')`, still no `eval`);
- `sshRoadHelp.test.ts:38` (`EN_ADVICE`, asserted at `:48`): the exact English paragraph changes (the login shell
  sentences, the PowerShell 5.1 sentence, the *Copy Command* sentence), so this test changes with the help; any other
  exact paragraph of that file that §7 changes is rewritten the same way;
- `remoteLaunchDelivery.test.ts:209` (`the_secrets_script_runs_under_sh_s_…`): it feeds the script to `<sh> -s`, which
  the product no longer does; it runs the script through `SECRETS_REMOTE_COMMAND` with the owned `HOME`, with the same
  assertions;
- `remoteLaunchDelivery.test.ts:239-271` (the F3 tests: `viaRemoteLoginShell` gets the owned `HOME` and the environment
  of this section; `F3_the_secrets_remote_command_names_the_login_shell` asserts the new text);
- `remoteLaunchDelivery.test.ts:107` and `:117`, and `windowsParsers.test.ts:330` (the three commands, above);
- `maskedTerminal.test.ts:535-555` (`writeFakeSsh`): the fake sets `HOME` to its owned folder, removes `ENV` and
  `BASH_ENV`, and sets the variables of this section, so `/bin/sh -l` does not read the developer's profile;
- `shellQuotingRoadScan.test.ts:94` and `:109` (rows move), and the tests that compare `COPY_NOTE` text.

**Tests that stay green unchanged:** `launchRoadScan.test.ts`, `commandRoadScan.test.ts`, `linkedNeverLocal.test.ts`,
the road worlds (`sshRoadArrow`, `sshRoadFolder`, `sshRoadSecrets`, `secretsLaunch`, `sshExecOver`, `agentSshGate`,
`agentSshOneUse`: they read the remote command and the script from the composer or pass their own), the wrapper tests
of the delivery file, and SSH Connect's suites. The help tests do NOT stay unchanged (above).

## 6. Risks

1. **The profile is read twice on the arrow, the folder run and the VPN launcher** (L6, measured with a pty). A
   profile that starts a daemon (`eval $(ssh-agent)`, `keychain`) starts it twice per run, and a profile that prints
   prints twice. On the chain step, the agent's run and Run with Secrets it starts it once per run, and nothing stops
   that daemon when the run ends: no logout file runs for a line with no `exit` (L11). The guard is
   `case $- in *i*) … ;; esac` around what must run once per login; the help and the CHANGELOG say it. The final shell
   is the one SSH Connect gives, as today.
2. **The profile's own output is now part of the run's output** on every road: the chain step's terminal, Run with
   Secrets' masked output and the agent's captured answer (masked as before). An agent that parses the output can see
   extra lines. A profile that prints only in an interactive shell (the usual guard; measured on this machine's
   `/etc/profile`, which printed the motd text only for the interactive shell) adds nothing.
3. **A profile that is not safe in a non-interactive login shell** (asks a question, runs `exec tmux` or `exit`, or
   fails under `set -e`) now changes or stops the line. Before, it changed only the stay-open shell. Measured on the
   six shells with Run with Secrets: a profile that says `exit 0`, one that replaces the shell (`exec` of another
   shell) and one that says `set -n` each ended with status 0 and NOTHING run. No value is read in these cases. The
   command cannot detect them: the profile ends or disables the shell before the command starts. Recorded; the help
   says that the profile is read and that it must not end or replace the shell.
4. **Slower start:** `/etc/profile.d/*` runs before every line. Not measured on a real server; hand check 1 notes it.
5. **`~/.bashrc` and the line** (L1). The limit of the owner's decision is that the shell of the line is not
   interactive: nvm, conda and other setups in the interactive part of `~/.bashrc` are not found, and the help says to
   set such a `PATH` in `~/.profile`. It is not true that bash never reads `~/.bashrc` for the line. Two cases, both
   measured on bash 5.3.9 (Ubuntu): (a) Ubuntu's default `~/.profile` sources `~/.bashrc` when the shell is bash, and
   the default `~/.bashrc` returns at its first lines when the shell is not interactive; (b) sshd's own `bash -c` reads
   `~/.bashrc` before the command starts, in the conditions of §3.3 — today also. So what stands above the "not
   interactive" guard of `~/.bashrc` runs for the line, and what stands below it does not.
6. **fish, csh, tcsh** (L10): the chain step, the agent's run and Run with Secrets no longer run a fish-syntax line on a
   fish login shell. Unsupported before; said in the CHANGELOG now.
7. **What is measured and what is not.** Measured 2026-11-11: bash 5.3.9 and dash 0.5.12 (installed here), and zsh 5.9,
   mksh R59, ksh93u+m 1.0.10 and busybox ash 1.37.0 (Ubuntu 26.04 packages unpacked into a scratch folder): the three
   commands of §3.0 and every row of §3.3. This is a dated measurement, not a control: the tests run those four shells
   only where they are installed, and the CI job installs none of them. NOT measured: a real sshd, bash 3.2 (macOS),
   the pty behaviour of the final shell under zsh, mksh, ksh93 and ash, any other `sh`, and Windows. The promises of
   the help stay the ones it makes today ("sh, bash, zsh, ksh or dash"). Hand check 2 asks for a zsh server if the
   owner has one.
8. **Run with Secrets: fd 3 is open while the startup files run.** The profile's own child processes inherit fd 3 (the
   script, with the values). Measured: a child of the profile that runs `cat <&3` reads the whole script. A program
   that reads fd 3 on purpose can read it; no usual profile command does; the run is then refused (the script is not
   whole). The promise is an empty standard input, not secrecy from the person's own profile (L5). `cat` must be on
   `PATH` after the profile, else the run fails closed with 127 (§3.3). The script is read whole before it runs, not
   as a stream; it is a few lines (1.16 MB measured).
9. **Longer remote command.** Each `'` of the line grows to ten characters on the stay-open roads, before the local
   quoting. No length limit applies to these roads (`MAX_REMOTE_COMMAND_CHARS`, `sshExecCommand.ts:51`, is checked only
   for `ssh:exec`, `sshUseActions.ts:303`); sshd accepts a command of this size.
10. **An older extension build** on another machine of the person still runs the line without the profile until it is
    updated (the parent's risk 1, for a behaviour instead of a field).
11. **Logout files** (L11, §3.2). On bash, a line that calls `exit` on the chain step, the agent's run or a stay-open
    road now runs `~/.bash_logout`: its commands run, its output is part of the run's output, and a logout file with
    its own `exit N` replaces the status of that line. An agent or a chain that reads the status can then see a wrong
    one, also a 0 for a line that failed. Run with Secrets is protected. The help and the CHANGELOG say it.
12. **A startup file that reads standard input before the login shell starts** (§3.3) makes every Run with Secrets on
    that server stop with the sentence. This is a correct refusal, not a wrong run, but the person must change the
    file: put the read behind the "not interactive" guard. The sentence names the usual file; the help says the rest.
13. **Tracing is off for Run with Secrets.** A profile that turns on `set -x` or `set -v` gets no trace of the script
    and of the line on this road, because a trace prints the values. The other roads keep the profile's tracing.

No growth surface: nothing new is stored, written or spawned (planning-docs.md § growth). The fd-3 handoff and the
variable live as long as the remote run. (A daemon that the person's own profile starts is the profile's, risk 1.)

## 7. Documents

- **Help ×5** (`helpEn.ts` first, then De, Es, Ru, Uk; UI labels stay English). (a) The *terminal* kind,
  `helpEn.ts:84`, paragraph "To run a line on a server": "the line runs in your login shell there" becomes true for
  every road; add: "Your login shell reads `/etc/profile` and your `~/.profile` (bash: `~/.bash_profile` first; zsh:
  `~/.zprofile` and `~/.zlogin`) before the line, as at a login, so the `PATH` you get when you connect is the `PATH`
  of the line. The shell of the line is not interactive: a tool that only the interactive part of `~/.bashrc` sets up,
  such as nvm or conda, is not found — set its `PATH` in `~/.profile` instead. What your profile prints is part of the
  output. Your profile must not end or replace the shell, or the line does not run. On the arrow, a folder run and a
  VPN's *Started by*, your profile is read twice: for the line, and for the shell that stays open. Put what must run
  once per login, such as `ssh-agent` or `keychain`, inside `case $- in *i*) … ;; esac`. On bash, a line that calls
  `exit` also runs your `~/.bash_logout`, and an `exit` in that file replaces the exit code of the line." The chain
  sentence ("A step set to run over SSH runs there and ends there") gains "in your login shell". The PowerShell 5.1
  sentence becomes "Windows PowerShell 5.1 cannot pass a double quote to ssh, so such a line is refused there; install
  PowerShell 7 (`pwsh`)." The *Copy Command* sentence gains "and on the server it does not start your login shell".
  (b) Run with Secrets, `helpEn.ts:177` and `:180`: "the server's login shell" is now true; add: "Your profile is read
  first. It reads an empty input, so it cannot take a value by accident. If a startup file on the server reads the
  input before your login shell starts (a `read` in `~/.bashrc`, for example), the run stops, says so and runs
  nothing: put that read behind the file's check for an interactive shell. Your `~/.bash_logout` does not run here,
  and a trace that your profile turns on (`set -x`) is off for this run, because it would print the values."
- **`src_vs_code/README.md`** `:302-316` and `:411`: the same sentences; `:309-310` names only the double quote.
- **`research/module_extension.md`**: `:2247` (the wrapper sentence) gains the outer login layer and L2-L4; `:2458` (Run
  with Secrets over SSH) gains §3.3 with the measured reason of each word, the promise and what is not promised (L5);
  one line on L7 (the trust line is unchanged); one line on L11 and one on L12.
- **`research/module_tests.md`** `:1493-1499`: rows for `remoteLoginShell.test.ts` T1-T14 and U1-U9, the Windows
  delivery cases, and the note that real-shell runs use an owned `HOME` and the environment of §5.
- **`src_vs_code/CHANGELOG.md` `## [Unreleased]`**: `### Fixed — a line that runs over SSH now runs in your login shell
  on the server`, with: the symptom (`command not found`, 127, for a tool that SSH Connect finds); every road named;
  the limit (the shell is not interactive, so the interactive part of `~/.bashrc` does not run); the profile's output
  in the run's output; the profile read twice on the arrow, folder run and VPN launcher, with the
  `case $- in *i*) … ;; esac` guard for `ssh-agent` and `keychain`; on bash, a line that calls `exit` runs
  `~/.bash_logout`, and an `exit` in that file replaces the exit code (not on Run with Secrets); Run with Secrets'
  profile reads an empty input, a script that did not arrive whole is refused with a sentence, and a trace is off;
  Windows PowerShell 5.1 now refuses only a line with a double quote (a line that ends in `\` is typed); **"No entry
  asks for approval again: the approval is keyed on the line and the connection, and neither changed"**; fish now
  fails on the chain step, an agent's run and Run with Secrets too.

## 8. Hand checks (owner)

1. **The bug.** On the owner's server (bash): the Terminal entry `aws sso login` with *Runs over SSH* → the arrow runs
   `aws` (no 127), and the login shell stays open with a normal prompt. `shopt -q login_shell && echo login` typed there
   prints `login`. Note how long the start takes compared with 1.21.1.
2. **The other roads.** The same entry as a dependency-chain step of `command -v aws` (prints the path, the chain goes
   on); Run with Secrets of `command -v aws; printf '%s' "$CREDS_REF_1" | wc -c` with one `creds://` reference, from the
   local window on the owner's Windows machine (the path, and the value's length: the long remote command of §3.0
   reached the server whole through the Windows `ssh`); an agent's `creds_run` of `command -v aws` (the path, exit 0).
   If a zsh server is at hand, the arrow once there.
3. **Windows delivery.** The 8 hostile lines of the parent's hand check 4 (2026-11-10), again, and one more line that
   ends in a backslash (`echo a\`), through the arrow from pwsh 7 and from Windows PowerShell 5.1, against a real sshd:
   each prints what a local bash prints, then the login shell. 5.1 refuses the lines that hold `"`, as before, and it
   now TYPES the line that ends in `\` (§3.5).
4. **A startup file that reads the input** (it records what the owner's server does; both outcomes are safe). Put
   `read -r x` as the FIRST line of `~/.bashrc` on the server, run Run with Secrets of `true`, then remove the line.
   Expected on a Debian or Ubuntu server: the sentence of §3.3 and exit code 1. If the run ends with exit code 0, that
   sshd's bash does not read `~/.bashrc` first; note which of the two happened.

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
table has its boundary row from its side; the rows came with this plan's first commit.

**What this revision adds, and the rows.** The revision adds two marker lines to the script that Run with Secrets
writes (`secretsStdin`) and narrows the PowerShell 5.1 refusal. Checked again, 2026-11-11: `grep -n` over `todo/*.md`
for `secretsStdin`, `SECRETS_REMOTE_COMMAND`, `powerShell51Refusal` and `PowerShell 5.1` finds no other open plan that
names the script, the command or that refusal (`PLAN_terminal_runs_followups.md:56` and
`PLAN_creds_cli_reachable_from_every_caller.md:321` name PowerShell 5.1 for other things). The script on ssh's standard
input is not an option, an environment variable or an argv word, so the three rows on the other side stay true as
written, and this commit does not edit them.

**The parent.** [PLAN_terminal_command_over_ssh.md](../research/PLAN_terminal_command_over_ssh.md) is implemented and
in `research/`. This plan corrects three of its shipped texts: §4.2's "hands the one string to the remote login shell
(`$SHELL -c`)" (it is not a login shell), D12's `"${SHELL:-sh}" -s` (now §3.3), and §4.6's refusal of a final backslash
under Windows PowerShell 5.1 (now §3.5). The parent is not edited before this plan ships (`research/` describes the
system as it is); at promotion, its §4.2, §4.6 and D12 get a dated pointer here.

## 10. Questions for the owner

Asked of nobody yet; the coai question consultants come first (`coai-question-consultant.md`).

1. **Hand checks 1-4 of §8** are the owner's.
2. **L6:** the profile is read twice on the three interactive roads. Accept? (The other shape — the final shell as
   `-i` — gives a shell that is not the login shell SSH Connect gives, against D3.)
3. **L9:** `creds_exec` keeps sshd's non-login shell. Keep, or a todo to give it the login shell too (a change of a
   shipped agent tool's behaviour)?
4. **L8:** the copy stays the trust line and the note says it starts no login shell. Accept?
5. **L11:** on the roads other than Run with Secrets, a `~/.bash_logout` with its own `exit N` replaces the status of a
   line that calls `exit`. Accept as a limit? (The other shape runs every line in a subshell, `(eval '<line>')`: one
   more layer of quoting on the chain step and the agent's run, against L3.)

## 11. Definition of Done

- [ ] Every road of §1 runs the line in the server's login shell: T1-T4 and T9 green, each watched RED on `main` first
      (the 127 messages in the summary).
- [ ] Exit codes, the stay-open shell, the folder and `exit` behave as today (T5, T8); the trust line is unchanged (U6).
- [ ] Run with Secrets: a profile that reads stdin gets nothing and the values arrive (T6 a), watched RED under the
      rejected `-l -s`; a startup file that reads the script first gets no value and the run is refused (T6 b, c); a
      profile that hides `cat` fails closed (T7).
- [ ] Run with Secrets: no logout file runs and the status is the line's (T10); the script is not in a child's
      environment (T11); a tracing profile prints no value (T12); a script that is not whole never runs (T13); the real
      `cat` reads it (T14); the line has no fd 3 (T3). Each watched RED under the text that its row names.
- [ ] U1-U9 green, each RED first; the tests of §5 "Tests that change" rewritten; the rest green unchanged.
- [ ] The Windows delivery cases of §5 are green in `bash_delivers_…`, `pwsh_delivers_…` and the `runner-windows` job.
- [ ] Windows PowerShell 5.1 refuses only a remote command with `"`; the sentence, the help ×5 and the README name only
      the double quote (R20, U8).
- [ ] `shellQuotingRoadScan.test.ts`: the widened template shape watched RED on the new site, then the row; green.
- [ ] Every real-shell run uses an owned `HOME` and the environment of §5, also the fake `ssh` of
      `maskedTerminal.test.ts`; no test reads the runner's own profile.
- [ ] `npm run typecheck`, `npm test` and lint in `src_vs_code` green, at lowered priority.
- [ ] Help ×5 (English first), README, `research/module_extension.md`, `research/module_tests.md`, CHANGELOG
      `## [Unreleased]` changed as §7 says; no text says "login shell" where none runs, none says that the profile
      cannot read the values, and none says that `~/.bashrc` is never read.
- [ ] The boundary rows of §9 are in the three neighbour plans.
- [ ] coai: a plan round reached `proceed`; a code round ran; every finding resolved; verdicts and reviewer counts in the
      summary.
- [ ] The hand checks of §8 are handed to the owner with the pull request; if 1 or 3 fails, stop.
- [ ] Plan promoted with its deviations when shipped; the parent's §4.2, §4.6 and D12 get their dated pointer.

## 12. The approving round, the lead's review and the consultation — what each one changed

This is the record of the approved baseline (the ledger's note). Nothing here is a change after the approval.

| Source | Finding | Decision | Where |
|---|---|---|---|
| coai plan round, session dad88dee (`proceed`) | The claim that the profile never sees the secrets is too strong: fd 3 is open while `~/.profile` runs, and the profile's children inherit it | accepted: the promise is an empty standard input, not secrecy from the person's own profile | L5, §3.3, risk 8, §7 |
| the same round | The profile is read twice on the arrow, the folder run and the VPN launcher | accepted as a document change, the design stays: the help and the CHANGELOG say it and give the `case $- in *i*)` guard | L6, risk 1, §7 |
| the same round | `$( )` removes the final line breaks of the script | rejected: measured harmless | §3.3 |
| the same round | the command depends on `cat` | rejected: a missing `cat` fails closed with 127 | §3.3, T7 |
| the lead's Opus review, item 1 | "Tests that change" missed R20, R21, R22, `EN_ADVICE` and the message of `agentSshRun.test.ts:34`; the help tests do not stay unchanged | accepted; this revision also found R23, the `-s` test of the delivery file and the fake `ssh` of `maskedTerminal.test.ts` | §5 |
| item 2 | With the login form the PowerShell 5.1 final-backslash refusal can never fire | accepted | L12, §3.5, R20, U8, §7, hand check 3 |
| item 3 | The login form is not delivered through the local shells and the Windows parsers | accepted | §5 "Windows delivery" |
| item 4 | bash runs `~/.bash_logout` for a non-interactive login shell on `exit`, and a logout file with `exit 9` changed a line's status | accepted: Run with Secrets is protected by a subshell; the other roads are a recorded limit | L11, §3.2, T10, risk 11, §7, §10 question 5 |
| item 5 | sshd's own `bash -c` reads `~/.bashrc` before the redirection; a `read` there took the first script line and the line ran with an empty value, status 0 | accepted: the marker lines and the `case`; L1 and risk 5 corrected; the test environment | §3.3, T6, §5, risk 5, risk 12, hand check 4 |
| item 6 | The line holds fd 3 | accepted: `3<&-` | §3.3, T3, U4 |
| cadence consultation 461ce30e | A profile with `set -a`, or one that exported `creds_script`, puts the whole script into the environment of the line's children | accepted: `set +a` and `unset creds_script` | §3.3, T11 |
| the same consultation | A profile that turns on `set -x` | decided: `set +x`, and `set +v` for the same reason; measured | §3.3, T12, risk 13 |
| the same consultation | No claim for zsh or ksh without a run | done: zsh 5.9, mksh R59, ksh93u+m 1.0.10 and busybox ash 1.37.0 were run from unpacked packages; what is not measured is named | §1, risk 7 |
| Fable, the security judgement of S2 (this revision) | An alias or a function named `cat` reads the script (a wrong value with status 0, measured) | `command cat` | §3.3, T14 |
| the same | A script cut at its end, or read by a child of the profile, ended with status 0 and nothing run | the last marker line; the refusal ends with `false` | §3.3, T13, T10 |
| the same | A profile that ends or replaces the shell, or says `set -n`, gives status 0 and nothing run, on every road | cannot be stopped by the command; recorded | risk 3, §7 |

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
- **Cornerstone area.** Run with Secrets' remote command and its script (S2): a mistake there lets a startup file take
  a secret value by accident, puts the script into a child's environment or onto standard error, or runs the line with
  an empty or a wrong value and status 0, and every other test stays green (measured, §3.3).

**Stories.**

- **S1 · The login builder and the plan.** `singleQuotedBody`, `loginShellCommand`, `planRemote`, the comments, the
  PowerShell 5.1 check and its sentence (§3.5); T1, T2, T4, T5, T8, T9, the bare and stay-open rows of T10, U1-U3, U5,
  U6, U8; the Windows delivery cases; the tests that change; the scan (build step 3).
- **S2 · Run with Secrets** (cornerstone, `model: fable` for its scenarios). The three constants,
  `SECRETS_REMOTE_COMMAND` and the two marker lines of `secretsStdin` (§3.3); T3, T6 with its teeth, T7, the secrets
  rows of T10, T11-T14, U4, U9; the F3 tests and the `-s` test of the delivery file; the fake `ssh` of
  `maskedTerminal.test.ts`. Follows S1 (it uses `loginShellCommand`). The design of §3.3 and these scenarios were
  revised by Fable on 2026-11-11, with the measurements of §3.3; a change to any word of the command needs the row of
  §3.3 for that word measured again.
- **S3 · The documents.** `COPY_NOTE` and U7; help ×5, README, the two `research/` files, the CHANGELOG; then the code
  round and the pull request with the hand checks.
