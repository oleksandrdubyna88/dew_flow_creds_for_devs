# PLAN — a Terminal entry runs its command over a chosen SSH connection

> Status: **epoch 2 open 2026-11-10 after the re-review. E1 built locally (782444a, cut: to be split under the security plan and fixed forward per E1 §S4); E2 built locally on feat/terminal-command-over-ssh-e2; E3 not started; nothing pushed.** Scope: the extension (`src_vs_code`) — a new
> Terminal-entry field, the form, every road that runs a Terminal entry (arrow, folder run, dependency chain, VPN
> launcher, Run with Secrets, agent `creds_run`), SSH Connect's preparation half, help in five languages, README,
> `research/`. No server change, no HTTP contract change, no MCP tool shape change.

## Plan changes

> Epoch 1 · approved 2026-11-09 · by reviewers · state: closed

  (Approval: the plan gate's round 2, verdict good_enough, committed in e468285 with that round's accepted findings
  and the three-epic split the same round's operator command ordered.)
- 1.1 · 2026-11-10 · agent · approach — the E1.S2 spec measured the two parses: the stay-open wrapper becomes an `eval` form (a trailing comment or `&` broke the old one) and the PowerShell 5.1 refusal also covers a trailing `\`
  (Not counted, each only makes the plan true as written: the trust line built from the prepared snapshot per §4.4,
  the seam's range taking the password branch's preparation, `stopped` leaving nothing on disk, and the importer
  count of `resolveCommand(` repaired.)
- 1.2 · 2026-11-10 · reviewer · scope, contract — the E1.S2 review and the security.md class sweep: PowerShell typographic quotes doubled in `quoteFor`, the win32 `shellQuote` words that carry vault data (`-i`, destination, jump and forwards) and the askpass `.bat` no longer expand vault data; SSH Connect's shipped win32 line changes; followups item 5 closed here
  (First recorded as "not counted"; the E1 conventions review showed it is a change: its own cause, a shipped contract
  changed, a slice of another plan taken. In doubt it is a change. This second change stopped the plan.)

### Re-review for epoch 2

Narrowed: no — the Definition of Done is identical to epoch 1's; the trust line, the secrets shell and Update-it only widen or tighten; the security sweep leaves to its own plan and was never in epoch 1's scope

| Work | Where | Verdict | Action |
|---|---|---|---|
| b65139c, e75dd44, e468285 plan, gate rounds 1-2, epoch 1 approval | local, not pushed | fits | kept |
| 38d72cb E1 stories and the S2/S3 specs | local, not pushed | fits | kept; spec text for the trust line and the secrets shell fixed forward |
| c4bac82 the cadence consultation's three points | local, not pushed | fits | kept |
| 782444a E1 code with the security sweep inside | local, not pushed | cut | security hunks extracted onto their own branch (PLAN_windows_shell_quoting_injection), E1 rebased onto it, E1 §S4 F1-F7 fixed forward |
| 6fb4ba7 entry 1.2, the stop | local, not pushed | fits | kept |
| 6271779 the epoch 2 revision | local, not pushed | fits | kept; one README row fixed forward |

  (Sorted by an Opus judge, 2026-11-10. The stop commit was not pushed: the repository is public and the cut commit
  describes unreleased security defects; the push is the owner's decision.)

> Epoch 2 · approved 2026-11-10 · by reviewers · state: open

  (The re-review round on branch feat/terminal-command-over-ssh-epoch2: verdict proceed, 1 of 2 reviewers answered —
  antigravity's answer was unparseable; the Update-it finding accepted (already E1 §S4 F2), the `exit` finding
  rejected with its reason.)

## 1. Goal

Today a Terminal entry ("Terminal command") always runs on THIS machine: its line is typed into a local VS Code
terminal, and *Runs on* only picks the local shell. A person who wants a command to run on a server writes the ssh
line into the command by hand. The help even tells them to: `ssh -t <host> tmux new -A -s {name}`
(`src_vs_code/src/helpEn.ts:84`). That hand-written line uses none of the vault's SSH entry: not its stored key, not
its password, not its host-key pin, not its jump host.

The owner asked (2026-11-09): in the Terminal command section of the form, add a dropdown of the vault's SSH
connection entries, default **Do not use**. When one is chosen, running the entry first connects over SSH with that
entry, then runs the command inside that SSH session.

Done when: every road that runs a Terminal entry either runs the command on the chosen SSH host, or refuses with a
sentence that says why. **No road of this build or a later one runs a linked entry's command on the local
machine.** An OLDER build does not know the field; that exposure is risk 1, not covered by this guarantee.

## 2. Decisions taken, and by whom

| # | Decision | By |
|---|---|---|
| D1 | All human roads support SSH in v1: Run in Terminal (arrow), folder run, dependency-chain step, VPN launcher, Run with Secrets. | owner, 2026-11-09 |
| D2 | Agent `creds_run` / CLI `run`: allowed only when the SSH entry itself is open to the agent for `exec`; else refused with a sentence. The consent dialog names the SSH entry and says the line runs there. | owner, 2026-11-09 |
| D3 | After the remote command ends, the remote login shell stays open. The owner was told this works only on POSIX remotes. | owner, 2026-11-09 |
| D4 | Share with… and Export remove the SSH link (Share strips it in `shareFormat.ts` as it strips `vpnLauncherEntityId`; Export strips it in `exportSecrets.ts` `exportedNode`, where no reference is stripped today). The recipient's copy then runs locally; accepted. An in-place update of an entry the recipient already holds (*Update it*) keeps the RECIPIENT's own link: the sender's link never travels, the recipient's is never erased (re-review, epoch 2). | owner, 2026-11-09; update rule lead, 2026-11-10 |
| D5 | One ssh line, never "connect, then type": text typed after ssh starts can land in a password, passphrase or host-key prompt. | lead |
| D6 | Trust (the "run this stored command?" modal and its fingerprint) covers the SSH target, not only the line — else a synced host change runs a trusted line on a new machine without a question. | lead |
| D7 | Structure: ONE pure module is the only road from "entry + link" to a launch, and a structural scan test fails if a road reads a line another way. | lead + consultants (2 of 2 answered: codex, gemini; 1 row refused on a config limit), 2026-11-09 |
| D8 | Story order: the field ships together with a refusal on every road, so no intermediate build runs a linked command locally. | lead + consultants |
| D9 | A Windows remote (*Runs on* = Windows with a link) is refused in v1: the remote shell (cmd or PowerShell) is unknown and stay-open is POSIX only. | lead + consultants |
| D10 | A password SSH entry needs a fresh terminal (the password rides the terminal's environment, settable only at creation). A new terminal opens BESIDE any live one with the same title; nothing is disposed. | lead + consultants |
| D11 | A dependency-chain step over SSH does not stay open (a step must end for the chain to go on); a password step in a chain is refused (one shared terminal has one environment). | lead |
| D12 | Run with Secrets over SSH: values go to the child's STDIN as `export` lines for the remote LOGIN shell reading stdin, `"${SHELL:-sh}" -s` — the same shell that parses the line on every other road (re-review, epoch 2: a plain `sh -s` failed bash syntax, measured); never in argv, never in the remote `ps`, never in a history. | lead |
| D13 | Dropdown candidates: kind `ssh` entries with a host, not itself, not in Trash. A stored id that is no longer offered shows **(missing entry)** so a save does not drop it. At run time a missing or trashed SSH entry refuses. | lead |
| D14 | With a link, *Runs on* describes the REMOTE system; the local terminal is chosen as SSH Connect chooses it (`composedShellPath()`, `src_vs_code/src/pinnedTerminal.ts:54`). | lead |

## 3. What the code does today (verified 2026-11-09 at `origin/main` 16975d0)

Paths are under `src_vs_code/src/`.

- **Field pattern to copy — `vpnLauncherEntityId`** (a VPN entry pointing at a Terminal entry): `types.ts:115`;
  type guard `typeGuards.ts:337`; form select with "(missing entry)" `execFormFields.ts:42-58`; save scrub by kind
  `execFormFields.ts:80-91`, spread into the whole-record save at `entityFormPanel.ts:645`; webview post
  `entityFormScript.ts:688`; share strip `shareFormat.ts:537`; id remap on quarantine `idQuarantine.ts:82`.
  Candidates: `commandTargets.ts:74-121` (`collectJumpCandidates` lists ssh-reachable entries but includes Trash).
  Filled at `entityEditCommands.ts:194-199` and `commands/treeMutationCommands.ts:271-276`; empty on purpose in
  `commands/shareCommands.ts:90-97`. External export gives every node a new id and remaps no reference
  (`externalBundle.ts:76`).
- **The one road to a line**: `resolveCommand` (`commandLine.ts:76`), enforced by `test/commandRoadScan.test.ts`.
- **Roads that run a Terminal entry**:
  - Arrow: `commands/runCommands.ts:115-147` — `passGates` (OS refusal, `confirmTrusted` `trustPrompt.ts:12`,
    `runDependenciesFirst`), then `sendGuarded` (`terminalGuard.ts:33`), which is synchronous from find to send and
    opens `Creds: <folder> / <entry>` via `openEntryTerminal` (`pinnedTerminal.ts:130`, no env).
  - Folder run: `commands/folderRunCommand.ts:74-210` + `folderRun.ts`; a modal lists every line; `typeAll` is
    synchronous.
  - Dependency chain: `dependencyRun.ts` (planner; `executableLine` has 4 readers pinned by the road scan) and
    `dependencyRunHost.ts` (ONE shared terminal; each step waits for its end via shell integration).
  - VPN launcher: `vpnLauncherRun.ts` via `sendGuarded`.
  - Run with Secrets: `commands/runCommands.ts:260-311`; `creds://` refs become environment reads
    (`runPlan.ts:106`) and the values go into the env of a hidden LOCAL child (`maskedTerminal.ts:66`).
  - Agent: `agentUseActions.ts:187-237` (`terminalRunAction`) spawns a local shell and captures output.
- **SSH Connect**: `connectEntity` (`sshConnect.ts:136-348`) does, in order: request-gone check, ssh client check,
  `resolveSshCredential` (PIN), `remoteRoute` (local / WSL relay / Windows client / refuse), `connectionOptions`
  (jump chain, host-key modal, known_hosts file), known_hosts translation, `terminalPlatform`, then opens one of four
  ways: relay prefix, agent serves the key, stored key written to a 0600 file deleted on terminal close, password via
  SSH_ASKPASS in the env of a fresh terminal. It returns a boolean. `buildSshCommand` (`sshCommand.ts:125`) has no
  `-t`, no `--`, no remote command. The agent's remote exec is `buildSshExecArgv` (`sshExecCommand.ts:94`: `--`,
  remote command as one argv element) with `resolveExecAuth` (`sshExecAuth.ts`).
- **Quoting helpers**: `quoteFor` (`hostShell.ts:117`) single-quotes for posix and PowerShell; `shellQuote`
  (`sshCommand.ts:97`) double-quotes, so `$` would expand in PowerShell — not used for the remote command.
- **Trust**: `commandFingerprint` (`commandTrust.ts:38`) hashes entry id + line. The file holds a literal NUL byte as
  a separator (line 39); it is not edited by this plan.
- **Agent access**: `findUsableEntry` (`mcpEntries.ts:344`).

## 4. Design

```
entry (command, args, terminalOs, sshEntityId)
   │ sshLinkOf(entry, lookup)                       [pure  · remoteLaunch.ts]
   ▼
SshLink:  none | linked(ssh) | refused(sentence)
   │ planLaunch(entry, link, {stayOpen})            [pure]
   ▼
LaunchPlan: empty | refused | local{line} | remote{ssh, line, remoteCommand}
            (the trust line is built AFTER prepare, from the prepared snapshot: trustLineFor(prepared.ssh, prepared.jump, line))
   │                                    │ prepareSshSession(ssh)   [vscode · sshSession.ts, cut from connectEntity]
   │                                    ▼
   │                         PreparedSsh: ready{options, platform, prefix, env?, cleanup} | refused | stopped
   │                                    │ typedLine(plan, prepared, localFamily)   [pure]
   ▼                                    ▼
arrow · folder run · chain step · VPN launcher · Run with Secrets · agent   →  terminal / child process
```

### 4.1 The field

`sshEntityId?: string` on `EntityMetadata`, Terminal entries only. Same plumbing as `vpnLauncherEntityId`: type
guard (lenient string), `execDetails` scrub (`kind === 'terminal'`, never itself), new `sshLinkField` in
`execFormFields.ts` (label **Runs over SSH**, first option **— Do not use —**, then candidates, then
**(missing entry)** for a stored id not offered), one `${…}` in `entityFormPage.ts` after *Runs on*, the post key
on the existing line of `entityFormScript.ts:690`, optional `sshCandidates` in `entityFormShape.ts`, a new
`collectSshCandidates` (kind `ssh`, host, not self, not Trash), viewer row, quarantine remap, share strip, export
strip, agent-create deny-list entry. The *Runs on* hint adds: "With an SSH connection, this is the remote system."

### 4.2 The pure composer — `remoteLaunch.ts` (no `vscode`)

- `sshLinkOf(entry, lookup)`: `none` when unset; `refused` with a sentence when the id is missing, in Trash, not an
  SSH entry, has no safe host (`isSafeSshTarget`), or is the entry itself; else `linked`.
- `planLaunch(entry, link, {stayOpen})`: resolves the line through `resolveCommand` (the composer becomes one of the
  two allowed importers); refuses a linked entry whose *Runs on* is Windows (D9) or whose line has a newline, CR or
  NUL. Stay-open is for the INTERACTIVE roads only (arrow, folder run, VPN launcher); there the remote command is
  `eval '<line>'; s=$?; test $s -eq 0 || printf 'creds: the command ended with exit code %s\n' $s >&2; exec ${SHELL:-sh} -l`
  (the line single-quoted with `'` → `'\''`; no `"` in the wrapper itself, so it never trips the PowerShell 5.1
  refusal; `eval` parses the person's text as one script, so a trailing `# comment` or `&` cannot eat the wrapper —
  entry 1.1, exact text in the E1.S2 spec §S2.4), so a failed command is said in the terminal before the login shell starts (the login shell's own exit status is
  not the command's). The chain step, Run with Secrets and the agent get the bare line, and ssh's exit status IS the
  remote command's.
- `trustLineFor(ssh, jump, line)`: the canonical text trust is keyed on —
  `ssh [-p port] [-J jump] [-A] [-L …] [-R …] [-D …] -- user@host '<line>'` — the jump, the agent forwarding and every
  enabled forward exactly as `sshOptionArgv` composes them for the launch (re-review, epoch 2: a forward or `-A` applies
  to the launch, so a synced change that adds one must ask again), built from the person's LINE, not from the wrapped remote command,
  so one approval covers every road (arrow, folder, chain, launcher, secrets, agent). No `-i`, no known_hosts path, no
  program word, no env prefix (they hold per-window paths). A changed host, user, port, jump, agent forwarding or forward gives a
  new text, so trust asks again (D6). Today's `commandFingerprint` is reused unchanged with this text as its `line`.
- **The remote serialization contract.** ssh joins its remote arguments with spaces and hands the one string to the
  remote login shell (`$SHELL -c`); argument boundaries do not survive. So the composer passes EXACTLY ONE remote
  argument, and the local quoting exists only to deliver that argument to ssh byte-for-byte. The remote shell then
  parses the person's text exactly as if it were typed at a remote prompt: `;`, `$()`, quotes and pipes in the line
  are the person's remote syntax and are meant to be parsed there (D14: the line is written for the remote system).
  What is tested is the delivery: the typed line, run through the REAL local shell (`/bin/bash -c`, and `pwsh -c`
  when installed) with a fake `ssh` first on PATH that records its argv NUL-separated, gives ONE element after `--`
  and the destination, equal byte-for-byte to the remote command, for a corpus holding `;`, `&&`, `|`, `'`, `"`,
  `$()`, backtick, `\`, `%`, `!`, `*`, a tab and non-ASCII. The remote side is then EMULATED: the received element
  is run as `<shell> -c '<element>'` — what sshd does with an exec request, which carries one command string
  (RFC 4254 §6.5) — under `dash` and `bash` (and `zsh` when installed, else skipped with a printed reason), and its
  output must equal running the line directly in that shell. A real sshd round trip stays hand check 4.
- **Supported remote login shells**: the POSIX family — `sh`, `dash`, `bash`, `zsh`, `ksh`. One measured limit (2026-11-10): on a `dash`
  login shell, a SYNTAX error in the stored line (an unclosed quote) ends the session after dash prints the error —
  plain `eval` is a special builtin there. `command eval` would keep dash open but breaks zsh (`command` runs only
  external commands in zsh), so plain `eval` stays. `fish`, `csh` and
  `tcsh` are not supported (their syntax differs and the stay-open wrapper is POSIX); the help says so. The remote
  shell cannot be known before connecting, so this is a documented limit, not a check.
- `typedLine(plan, prepared, localFamily)`: `buildSshCommand` with a new optional `remote = {command, tty}` option:
  program, `-t`, the existing options, `--`, destination, then the remote command as ONE word quoted by
  `quoteFor(localFamily, …)`. Without `remote` the builder's output is byte-identical to today — "today" meaning after
  the security plan, which changes the win32 words that hold `$`, a backtick or a double-quote character.
- `secretsStdin(env, line)`: `NAME=<quoteFor('posix', value)>; export NAME` lines — `quoteFor` (`hostShell.ts:117`)
  closes, escapes and reopens around every `'` in a value, so a value is one literal word whatever it holds; a test
  runs the produced script under a real local `sh` and checks each variable equals its raw value for values holding
  `'`, `"`, `$`, `` ` ``, `\` and a newline — then the line inside a group
  with each brace on its own line — `{\n<line>\n} </dev/null` — then `exit $?`. The line holds no newline (refused
  above), so a trailing `# comment` in it ends at its own line and cannot swallow the closing brace. A shell's `-s` reads its script from stdin as it goes, so a command that reads
  stdin would otherwise swallow the rest of the script; a `{ … }` group is parsed whole before it runs, and its stdin
  is `/dev/null` (raised by a consultant, 2026-11-09). The exit code of the group is the exit code of the run.

### 4.3 The seam — `sshSession.ts`

`prepareSshSession(accountId, ssh, connect)` = `sshConnect.ts:143-295` moved, in the same order, opening no terminal.
Returns `ready` (entity with key path set or cleared, options, platform, relay prefix, askpass env for a password,
`acceptNew`, `cleanup()` = forget the materialised key and our pin), `refused` (reasons, for the existing
`refuseAndOfferTheFix`) or `stopped`. `connectEntity` becomes prepare + its existing open branches; its tests
(`test/sshConnect.test.ts`, `test/sshConnectRemote.test.ts`) must stay green unchanged. Roads call it with no retry:
a refusal still shows its remedy, and the person runs the entry again.

### 4.4 The roads

Order on every road a person starts: resolve and link → `prepareSshSession` (all awaits: PIN, host-key modal, route
refusal) → `confirmTrusted(trustLine)` → dependencies → the synchronous find-and-send, or the spawn.

**One owner per prepared session.** The road that called `prepareSshSession` owns its `ready` result until the
hand-over: the moment the line is sent into a terminal (the owner becomes that terminal's close handler) or the
child is spawned (the owner becomes the child's exit handler). Until then the road holds it in a `try … finally`
whose `finally` calls `cleanup()` unless the hand-over happened — so a declined trust, a cancelled dependency, a
thrown error, a failed terminal creation and a row that is never sent all leave no key file and no pin behind. Each of
these five exits is a named test (§6).

**One snapshot per prepared session.** `ready` carries the SSH entry as it was read for the preparation, and the
jump string it resolved. The trust line, the typed line and the spawn argv are all built from THAT snapshot; nothing
between `prepareSshSession` and the send or spawn reads the SSH entry from storage again. So a sync that changes the
host while the trust dialog is open cannot send the line, or the secrets, to a host the dialog did not name.

- **Arrow and VPN launcher**: `sendGuarded` takes a target: `{kind:'entry', terminalOs}` (today) or
  `{kind:'ssh', env?}`. For `ssh` the shell is the one SSH Connect pins. With `env` (password) the guard never finds
  or disposes: it opens a new terminal with the env (D10). The key file is deleted when that terminal closes, as
  SSH Connect does. A launcher whose line uses `{config}` (a local file) is refused when linked.
- **Folder run**: the modal shows each row's trust line; after the modal and the chain, EVERY linked row is
  prepared, one after another in row order (their PIN and host-key prompts come in that order), and only then does
  the synchronous `typeAll` send anything. A row whose preparation is `refused` is reported as failed and the others
  are typed. A `stopped` row (the person cancelled a PIN or a host-key prompt) stops the whole run: nothing is typed —
  linked or not — and every row prepared so far is cleaned. `stopped` is a run-level state, checked once more
  immediately before the synchronous `typeAll`, and no row of any kind is sent after it is set.
  The modal is the folder's approval, and it is shown BEFORE preparation, from its own read of each SSH entry. So after
  preparation each linked row's trust line is rebuilt from its prepared snapshot; a row whose text differs from the one
  the modal showed (its SSH entry or jump changed while the dialog was open) is NOT trusted and NOT typed — it is
  reported as failed with "changed while the dialog was open — run the folder again" and its session is cleaned. A named
  folder test changes a jump host while the modal is open (one snapshot, §4.4). The prepared rows are one list owned by the run, and the run's `finally`
  cleans every row that was not handed over to a terminal.
- **Dependency chain**: a linked step has no stay-open (D11); a password step is refused at plan time; *Runs on* of a
  linked step is not an OS refusal; the step's key is deleted when the step ends.
- **Run with Secrets**: local window only. Order: prepare → `confirmTrusted(trustLine)` (the same host-bound trust as
  every road; it is asked AFTER the host-key decision, so it names the host the values will reach) → dependencies →
  resolve the secret values → spawn. No child exists and no byte is written to any stdin before the trust is given;
  a declined trust cleans the session and spawns nothing. The child is `ssh` by argv
  (`buildSshExecArgv(ssh, keyPath, '"${SHELL:-sh}" -s', …)`, no `-t`, `shell:false`); STDIN carries `secretsStdin` (D12), then
  is closed; output masked as today. The run is NON-INTERACTIVE: no tty, and the command's stdin is `/dev/null`, so a
  command that asks a question (`terraform apply`, `apt-get install` without `-y`) reads end-of-input and usually
  stops. The banner says so before the output and names the way out: "Run in Terminal" (interactive, but the values
  are not injected); the help says the same. A **password** SSH entry: the
  human PIN prompt runs inside `prepareSshSession` as for any road; its askpass env (`SSH_ASKPASS`,
  `SSH_ASKPASS_REQUIRE=force`, the password variable) goes into the CHILD's environment — never argv — with
  `NumberOfPasswordPrompts=1` from `buildSshExecArgv`'s askpass branch and its `ConnectTimeout=10`, so a wrong password
  ends the child with ssh's error instead of a hang. `MaskedRunOptions` gains `argv`, `env` and `stdinText`.
- **Agent**: `findUsableEntry(…, sshEntityId, 'exec')` must answer `usable`, else
  `"<entry>" runs over the SSH connection "<ssh>", which is not open to agents. Nothing ran.` Then `resolveExecAuth`
  (refuses a PIN-locked or woven password), jump and pin as the agent exec does, `buildSshExecArgv` with the remote
  command WITHOUT stay-open, key deleted in `finally`. Trust uses the same trust line, so one approval covers the
  arrow and the agent. Consent text names the SSH entry and its target.
- **Copy Command / viewer** (both copy roads: the Copy Command command and the viewer's full-command row, `entityViewCopy.ts`): show and copy the trust line for a linked entry, with one sentence beside it: "This line
  uses your own ssh setup (agent, `~/.ssh/config`); the vault's key and password are not in it — use Run to connect
  with them." The composed launch line is never copied: it holds a per-window key path and, on the relay route, a
  socket path.

### 4.5 The structural test — `test/launchRoadScan.test.ts`

Shape of `commandRoadScan.test.ts`: (1) `resolveCommand(` is imported only by `commandLine.ts` and `remoteLaunch.ts`;
(2) `.sshEntityId` is read only on an exact allow-list of lines, with a stale-entry check; (3) in the road files, each
send or spawn call sits on an allow-listed line; (4) a self-check that every pattern still matches something.

### 4.6 Quoting, in two parses

Local shell: `quoteFor` single quotes (posix and PowerShell). Windows PowerShell 5.1 passes an argument that holds a
double quote to a native program wrongly; when the pinned shell is `powershell.exe` (5.1) and the remote command holds
`"` or ends in `\` (5.1 wraps an argument with a space in `"…"` and does not escape either; entry 1.1), the road
refuses with "install PowerShell 7". Remote shell: the person's line is written for the remote login
shell and is not re-quoted. A login shell that is not POSIX-like (fish) is a recorded limitation.

## 5. Build order

1. Field, form, round trips — and a refusal on EVERY road while the link is set (D8).
2. Pure composer, `buildSshCommand` `remote` option, structural scan.
3. The seam (`prepareSshSession`), SSH Connect unchanged.
4. Arrow and VPN launcher.
5. Folder run.
6. Dependency chain.
7. Run with Secrets.
8. Agent.
9. Help ×5, README, CHANGELOG, `research/`.

Each step is mergeable alone: a road not yet built keeps step 1's refusal.

## 6. Test plan

| What | Where | Proves |
|---|---|---|
| Guard accepts string / undefined, rejects a number | `test/typeGuards` style | a synced node is not dropped |
| `sshLinkField` default, candidates, (missing entry); `execDetails` scrub by kind and self | `test/terminalOs.test.ts` style | the form never drops or forges a link |
| post literal holds `sshEntityId: val('sshEntityId')` | file-text pin as `terminalOs.test.ts:101-109` | the key reaches the host |
| share strip, export strip, quarantine remap | `shareFormat`, `exportSecrets`, `idQuarantine` tests | D4, renamed ids |
| candidates: not self, not Trash, host required, kind ssh | `commandTargets` test | D13 |
| every road refuses a linked entry (step 1) | arrow / folder / vpn / chain / secrets / agent worlds | D8 |
| link none / linked / missing / trashed / self / no host; Windows refusal; newline refusal; wrapper text; trust line differs per host / user / port / jump and holds no `-i` | `test/remoteLaunch.test.ts` | D5, D6, D9 |
| `buildSshCommand` byte-identical without `remote`; `-t`, `--` order; quoting of `'`, `"`, `$`, backtick for posix and PowerShell | `test/sshCommand.test.ts` | two parses |
| PowerShell 5.1 + `"` refused | composer test | §4.6 |
| delivery: the typed line through the REAL local shell (`/bin/bash -c`; `pwsh -c` when installed, else skipped with a printed reason) and a recording fake `ssh` gives one remote element equal to the remote command, for the metacharacter corpus | `test/remoteLaunchDelivery.test.ts` | §4.2 serialization contract |
| stay-open wrapper text; a non-zero exit prints the sentence (run the wrapper with `sh -c` locally, `SHELL=/bin/true`) | `test/remoteLaunch.test.ts` | finding: status not lost |
| `secretsStdin`: braces on their own lines, `exit $?`, a `# comment` line, a value with `'` | `test/remoteLaunch.test.ts`, plus a local `sh -s` run of the produced script with a stdin-reading command | §4.2 |
| cleanup ownership: declined trust, cancelled dependency, thrown error, failed terminal creation, unsent folder row each leave no key file and no pin | the road worlds | §4.4 one owner |
| a chain step linked to the same SSH entry as its parent: the step's cleanup leaves the parent's key and pin (isolated per-session file names) | `test/sshSession.test.ts` T20, chain world | §4.4 one owner |
| folder: a `stopped` row stops the run, nothing typed, every prepared row cleaned | folder world | §4.4 |
| secrets: no child and no stdin write before trust; declined trust spawns nothing; password entry → askpass vars in the child env, not argv | masked-run test with a fake spawn | §4.4 |
| Copy Command on a linked entry copies the trust line, never a key path | viewer / copy test | §4.4 |
| delivery corpus re-parsed by `dash -c` and `bash -c` (zsh when installed) equals the line run directly | `test/remoteLaunchDelivery.test.ts` | supported shells |
| folder: cancel after mixed linked and unlinked rows were prepared — no row typed | folder world | run-level `stopped` |
| snapshot: the SSH entry changed in storage after prepare (during the trust dialog) — the sent line and the spawn argv still name the prepared host; nothing re-reads storage | arrow world, masked-run test | one snapshot |
| masking end to end: a fake `ssh` echoes each injected value to stdout and stderr; the shown output is masked | masked-run test | D12 |
| export: the exported Terminal entry has no `sshEntityId`; importing the bundle does not restore it | `externalBundle` test | D4 |
| prepare opens no terminal; `cleanup` deletes key and pin; `refused` leaves nothing on disk | `test/sshSession.test.ts` | the seam |
| existing SSH Connect suites green, unchanged | `sshConnect.test.ts`, `sshConnectRemote.test.ts` | no regression |
| arrow: typed line, password → new terminal with env beside a live one, nothing disposed; declined trust → cleanup; missing link → sentence, nothing typed | arrow world | D10 |
| folder: one refused row among typed rows; prepare before the synchronous send | folder world | §4.4 |
| chain: no wrapper, password step refused, key deleted at step end | dependency tests | D11 |
| secrets: no value in argv, stdin has the exports, the remote command is `"${SHELL:-sh}" -s`, no `-t`, output masked, Windows refused | masked-run test with a fake spawn | D12 |
| agent: closed SSH entry → exact sentence; usable → argv via `buildSshExecArgv`; consent names the SSH entry | agent tests | D2 |
| road scan fails on a road that reads a line another way | `test/launchRoadScan.test.ts` | D7 |
| help tests (5 languages) | existing help tests | rule 7 |

## 7. Risks

1. **An older extension build** ignores the field and runs the command locally; its Save rebuilds the whole record
   and erases the field, and sync carries that everywhere. No version gate exists for any field of this product; the
   same risk was accepted for `vpnLauncherEntityId` and `dependsOn` (`research/PLAN_os_aware_execution.md`, risk 2).
   The exposure is the window between a person's first link and the update of their other machines (the Marketplace
   updates extensions by default). Recorded, not solved here; the guarantee of §1 is narrowed to this build and later.
   Checked and not built: storing a *Runs on* value that old builds refuse — `entryShell` uses the default profile in
   a Remote-SSH window and does not refuse there, so it is not airtight (§9).
2. **Windows PowerShell 5.1 quoting** of native arguments (§4.6) — refused for `"`; other cases are a hand check.
3. **A key file lives while the stay-open terminal lives** — the same lifetime as SSH Connect's session today, plus
   the purge on activate and deactivate.
4. **A second terminal with the same title** after a password run (D10).
5. **A reused terminal that is still in the remote shell**: a second run types into the remote shell. The guard's
   `finished` verdict cannot see this; after an SSH run the terminal's state is `unknown`, so the person is asked.
6. **Non-POSIX remote login shells** (fish) break the wrapper.
7. **A password SSH entry with a jump host** hands the askpass environment to the hop's nested ssh, so a hop that asks
   for a password is answered with the destination's password. This is the open defect of
   [PLAN_askpass_answers_the_hop.md](PLAN_askpass_answers_the_hop.md), shared today by SSH Connect; this plan reuses
   SSH Connect's preparation and so inherits it, and is fixed with it there.

## 7a. Neighbour plans

| Plan | Touches | This plan's part |
|---|---|---|
| [PLAN_askpass_answers_the_hop.md](PLAN_askpass_answers_the_hop.md) | askpass + `-J` defect | none; inherits the fix (risk 7) |
| [PLAN_terminal_runs_followups.md](PLAN_terminal_runs_followups.md) | the same roads (`sendPinned`, the arrow's `{config}`, `fresh` disposing by name), and item 5 (`quoteFor` and typographic quotes) | none: item 5 is closed by the security plan below, not here; E2 adds the `ssh` target to `sendGuarded` |
| [PLAN_windows_shell_quoting_injection.md](../research/PLAN_windows_shell_quoting_injection.md) | `quoteFor('powershell')`, the win32 `shellQuote` words, the askpass `.bat`, `envPrefix` — shipped local-injection defects found by E1's class sweep (entry 1.2) | none: that plan owns the fix and ships FIRST, as its own PR on its own clock; E1 is rebased onto it and keeps only its own changes |
| [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) | stored commands run by an agent ON a server through the bridge | none; the bridge keeps refusing `run` (§9). Disjoint: that plan runs a line on the server an agent lives on; this one runs a person's line on a server they connect to |

The table is complete for plans open on 2026-11-09 that touch these files.

## 8. Growth surfaces

None new. Materialised key files already have an owner: deleted on terminal close, child exit or `finally`, and the
`keys/<pid>/` purge on activate and deactivate (`keyInstaller.ts`).

## 9. Not in this plan

- An AGENT-started VPN (`creds_vpn_up`) whose launcher, or one of whose chain steps, is a linked Terminal entry: it
  stays REFUSED with the shared sentence (fail closed, which meets §1). D2 opens only `creds_run`; opening this road is
  an authorisation decision for a later plan with its own security judgement (raised by the E2 stories, 2026-11-10).

- The Windows quoting security fix of SSH Connect (entry 1.2) — its own plan, [PLAN_windows_shell_quoting_injection.md](../research/PLAN_windows_shell_quoting_injection.md), landing before E1.

- A Windows remote (D9) — a later plan, after a hand check of Windows OpenSSH's default shell.
- Remapping references on external import (an existing gap for all four reference fields).
- A version gate against older builds (risk 1) — a product-wide sync/schema feature. A cheaper idea for later: a
  fail-closed marker that every road of an old build already refuses in every window kind (the *Runs on* value is
  not one, see risk 1).
- The bridge: it refuses `run` and `terminal` today (`bridgeAllowList.ts:44-46`) and keeps doing so.

## 10. Hand checks (owner)

1. Local Windows, pwsh 7: arrow on an entry linked to a key SSH entry; `tmux new -A -s {name}`; detach; the remote
   shell stays.
2. The same with a password SSH entry; a second run opens a second terminal.
3. Run with Secrets over SSH on a Linux host, once with a key entry and once with a password entry; the value is
   masked; `ps` on the host shows the login shell with `-s`; a bash-only line (`[[ … ]]`) runs under a bash login shell; a wrong password ends with ssh's error, not a hang.
4. A real peer: a linked entry whose line is `printf '%s|' a\ b "c;d" '$(x)' && echo; echo "$HOME"` prints the same
   on the server as when typed at a remote prompt (bash and zsh login shells).

## 11. Definition of Done

- [ ] Every road runs a linked entry over SSH or refuses with a sentence; none runs it locally.
- [ ] `launchRoadScan.test.ts` and `commandRoadScan.test.ts` green.
- [ ] `npm run typecheck`, `npm test` and lint in `src_vs_code` green, at lowered priority.
- [ ] SSH Connect's existing tests green, unchanged.
- [ ] Help changed in all five languages, English first; README, CHANGELOG, `research/module_extension.md`,
      `research/module_tests.md` updated.
- [ ] coai: a plan round reached `proceed`; a code round ran; every finding resolved; verdicts and reviewer counts in
      the summary.
- [ ] Plan promoted with its deviations when shipped.

## Epics

Three epics over the nine build-order steps of §5, each of three stories. The split was five epics until the plan
gate's round 2 (2026-11-09), when the operator commanded: 2-3 epics of 2-3 logically complete stories, fewer is fine,
never more; the gate runs once per epic; each epic has its own branch, started from the previous epic's commit, and
lands as ONE commit. That command outranks our defaults, so five became three: the seam joined the field and the
composer (no road runs without the three), the terminal roads kept one epic, and the two non-interactive roads took
the closing documents with them. Documentation is updated with every change: the help, README and `research/` lines
for a road land in that road's story, so no epic is only documents. Each epic is mergeable alone: a road not yet built
keeps E1's refusal (D8), so no build between two epics runs a linked command locally.

The gate runs once per epic, declared with `plan` and `epic: "k/3"`. The consultation cadence is once per three
epics, so one consultation runs before E1 is built and none is owed before E2 or E3. The stories below carry one line
of scope each; each epic's stories document, `todo/PLAN_terminal_command_over_ssh_E<n>.md`, is written by Opus when
that epic starts, and this section gets the link to it then (the both-sides rule of `planning-docs.md`).

The question consultant was asked what is important (2 of 2 answered, 2026-11-09). Ranked: (1) the single launch
composer with the canonical trust line, two-shell quoting and fail-closed coverage of every road — a missed road runs
a destructive command LOCALLY; (2) the SSH preparation seam cut from `connectEntity` — identity, host pin, route, the
lifetime of the credential and the key, and the "one owner" and "one snapshot" rules of §4.4 — the largest regression
radius on an existing security flow; (3) the non-interactive boundary — Run with Secrets over stdin to the login shell's `-s`, and
the agent gate. With three epics the quota is Q = ⌈2·3/5⌉ = 2, so areas (1) and (2) are the cornerstone areas. Both
live in E1, so at most two E1 stories can be marked, and E2 and E3 carry no mark. Area (3) is watched without a mark:
its agent gate is authorisation, which `subagent-models.md` gives to a Fable security judgement outside any quota; the
rest of it is an Opus judge's.

| Epic | Steps of §5 | Stories | Cornerstone area |
|---|---|---|---|
| E1 · Foundation: the field, the refusal on every road, the composer, the seam | 1, 2, 3 | S1 field · S2 composer · S3 seam | yes — areas (1) and (2) |
| E2 · Terminal roads: arrow and VPN launcher, folder run, dependency chain | 4, 5, 6 | S1 arrow + launcher · S2 folder run · S3 chain | none |
| E3 · Non-interactive roads and closing: Run with Secrets, agent, the rest of the documents | 7, 8, 9 | S1 secrets · S2 agent · S3 closing | none (area (3), watched) |

### E1 · Foundation: the field, the refusal on every road, the composer, the seam

Stories: [PLAN_terminal_command_over_ssh_E1.md](PLAN_terminal_command_over_ssh_E1.md); cornerstone specs
[E1.S2](PLAN_terminal_command_over_ssh_E1_S2_spec.md) and [E1.S3](PLAN_terminal_command_over_ssh_E1_S3_spec.md).

- **Goal.** A Terminal entry can store an SSH link, the form round-trips it, every road refuses a linked entry with a
  sentence, ONE pure module is the only way from "entry + link" to a launch (held there by a structural test), and
  `prepareSshSession` does everything `connectEntity` does before it opens a terminal. After E1 no road can run a
  linked line locally, built or not, and every road of E2 and E3 has its composer and its seam ready.
- **Stories.**
  - **S1 — The field.** `sshEntityId` on `EntityMetadata`, the `sshLinkField` select (**— Do not use —**, candidates,
    **(missing entry)**), every round trip (guard, scrub, post, share strip, export strip, quarantine remap,
    `collectSshCandidates`, viewer row, agent-create deny-list), and a refusal on EVERY road while a link is set
    (step 1, D8). Lands first. Its help line for the field in five languages, English first, and the README sentence.
  - **S2 — The composer.** `remoteLaunch.ts` (`sshLinkOf`, `planLaunch`, `trustLineFor`, `typedLine`,
    `secretsStdin`), `buildSshCommand`'s `remote` option (byte-identical without it), the delivery test through the
    REAL local shell with a recording fake `ssh` and the emulated remote parse, the PowerShell 5.1 refusal, and the
    road scan `test/launchRoadScan.test.ts` (step 2). `research/module_extension.md` names the module and the scan.
  - **S3 — The seam.** `prepareSshSession` in `sshSession.ts`, cut from `sshConnect.ts:143-295` in the same order,
    returning `ready | refused | stopped` with `cleanup()`; `connectEntity` becomes prepare + its four open branches;
    its two suites green unchanged (step 3). `research/module_extension.md` names the seam and its contract.
- **Scope.** §4.1 whole, §4.2 whole, §4.3 whole, §4.5, §4.6 (the PowerShell 5.1 refusal); build steps 1, 2 and 3;
  D5–D9, D13, D14. Files: `types.ts`, `typeGuards.ts`, `execFormFields.ts`, `entityFormPanel.ts`,
  `entityFormScript.ts`, `entityFormPage.ts`, `entityFormShape.ts`, `commandTargets.ts` (`collectSshCandidates`),
  `shareFormat.ts`, `externalBundle.ts`, `idQuarantine.ts`, the viewer row, the agent-create deny-list; a refusal line
  in each of `commands/runCommands.ts` (arrow and Run with Secrets), `commands/folderRunCommand.ts`,
  `dependencyRun.ts`, `vpnLauncherRun.ts`, `agentUseActions.ts`; new `remoteLaunch.ts`; `sshCommand.ts`
  (`buildSshCommand` `remote` option); new `sshSession.ts` and `sshConnect.ts` (the call and the open branches); new
  `test/launchRoadScan.test.ts`, `test/remoteLaunch.test.ts`, `test/remoteLaunchDelivery.test.ts`,
  `test/sshSession.test.ts`, `test/sshCommand.test.ts` additions; the five help files (the field's line), `README.md`,
  `research/module_extension.md`, `research/module_tests.md`. Risk 7 is inherited by S3 on purpose and not fixed here.
- **Depends on.** The coai plan round at `proceed` and the one consultation of the cadence; since epoch 2 also the
  security plan [PLAN_windows_shell_quoting_injection.md](../research/PLAN_windows_shell_quoting_injection.md), which lands
  first. S1 lands before S2 (D8); S3 can be built beside them; the three land in E1's one commit on E1's branch.
- **As built and re-reviewed (epoch 2).** E1 was built as one local commit (782444a) and passed its coai code round
  (`proceed`, 8 of 8 reviewers). That commit also holds the security sweep, which moves to its own plan: E1 is
  rebased onto that plan's commit and keeps only its own changes. The fixes owed before E1 merges are listed in
  [PLAN_terminal_command_over_ssh_E1.md](PLAN_terminal_command_over_ssh_E1.md) §S4.
- **Done when.** §6 rows "guard", "`sshLinkField`", "post literal", "share strip", "candidates", "every road
  refuses", "export", "link none / linked / …", "`buildSshCommand` byte-identical", "PowerShell 5.1", "delivery",
  "stay-open wrapper text", "`secretsStdin`", "delivery corpus re-parsed", "road scan", "prepare opens no terminal" and
  "existing SSH Connect suites green, unchanged" are green; `commandRoadScan.test.ts` still green; `resolveCommand(` is
  imported by exactly two files; `cleanup()` deletes the materialised key and our pin; a `refused` result leaves
  nothing on disk; no road calls the seam yet; the help tests pass for the field's line.
- **Cornerstone areas (1) and (2).** Area (1) is S2: the canonical trust line (no `-i`, no known_hosts path, a new
  text for a new host, user, port or jump), the two-shell quoting (`quoteFor` for the local parse, the line untouched
  for the remote parse), and the fail-closed coverage — S1's refusals plus the road scan that pins every `.sshEntityId`
  reader and every send or spawn to an allow-listed line. Area (2) is S3: the order of the awaits, the per-window
  route, and the lifetime of the credential, the key file and the askpass env from `ready` to `cleanup()` — the
  contract behind the "one owner" and "one snapshot" rules every road in E2 and E3 relies on. Opus marks the concrete
  stories (at most two, within Q = 2) when the E1 stories document is written, and updates the ledger line below in
  the same commit.

### E2 · Terminal roads: arrow and VPN launcher, folder run, dependency chain

Stories: [PLAN_terminal_command_over_ssh_E2.md](PLAN_terminal_command_over_ssh_E2.md).

- **Goal.** A person's roads that type into a VS Code terminal run a linked entry on the chosen host, in the order
  "resolve and link → prepare → trust → dependencies → synchronous send", with `cleanup()` on every exit that sends
  nothing, from one snapshot of the SSH entry. The help, README and `research/` lines for each road land with it.
- **Stories.**
  - **S1 — Arrow and VPN launcher.** `sendGuarded` takes a target `{kind:'entry', terminalOs}` or `{kind:'ssh', env?}`;
    a password entry opens a new terminal with the env BESIDE a live one (D10); a launcher whose line uses `{config}`
    is refused when linked; Copy Command and the viewer show the trust line with its one sentence (step 4). Help ×5
    for the arrow, the launcher and Copy Command; the `helpEn.ts:84` hand-written ssh advice is replaced here.
  - **S2 — Folder run.** The modal shows each row's trust line; every linked row is prepared in row order before the
    synchronous `typeAll`; a `refused` row is reported and the others typed; a `stopped` row stops the whole run and
    cleans every prepared row; the run's `finally` cleans what was not handed over (step 5). Help ×5 for the folder run.
  - **S3 — Dependency chain.** A linked step has no stay-open (D11); a password step is refused at plan time; *Runs on*
    of a linked step is not an OS refusal; the step's key is deleted when the step ends (step 6). Help ×5 for the chain.
- **Scope.** §4.4 head (order, one owner, one snapshot) and bullets "Arrow and VPN launcher", "Folder run",
  "Dependency chain", "Copy Command / viewer"; build steps 4, 5, 6; D10, D11; risks 3, 4, 5. Files: `terminalGuard.ts`
  (`sendGuarded` target), `pinnedTerminal.ts`, `commands/runCommands.ts:115-147`, `vpnLauncherRun.ts`,
  `commands/folderRunCommand.ts`, `folderRun.ts`, `dependencyRun.ts`, `dependencyRunHost.ts`, the Copy Command and
  viewer; their test worlds; the five help files, `README.md`, `research/module_extension.md`,
  `research/module_tests.md` for these roads. It adds the `ssh` target to `sendGuarded` and must not close or change
  the items of `PLAN_terminal_runs_followups.md` (§7a).
- **Depends on.** E1 merged (composer, scan allow-list, seam). E2's branch starts from E1's commit and lands as one
  commit. Each story is complete alone; a road whose story is not yet built keeps E1's refusal.
- **Done when.** §6 rows "arrow", "folder" (both), "chain", "cleanup ownership" (declined trust, cancelled dependency,
  thrown error, failed terminal creation, unsent folder row), "folder: a `stopped` row", "folder: cancel after mixed
  rows", "snapshot" (the arrow world half) and "Copy Command" are green; the road scan is green with the new send lines
  allow-listed; the help tests pass for the changed lines; hand checks 1, 2 and 4 of §10 are handed to the owner (they
  are owed, not a gate for the merge).
- **Cornerstone areas.** None. The key-file and password lifetimes these roads use are E1 S3's contract; the roads
  only call `cleanup()`. Opus judges each story.

### E3 · Non-interactive roads and closing: Run with Secrets, agent, the rest of the documents

- **Goal.** The two roads that run a child process instead of typing into a terminal run a linked entry over SSH
  without a secret in argv, in the remote `ps` or in a history; the agent road runs only when the SSH entry itself is
  open to the agent for `exec`, and refuses with the exact sentence otherwise. Then every document describes the
  shipped system and the plan is promoted with its deviations.
- **Stories.**
  - **S1 — Run with Secrets.** Order prepare → `confirmTrusted(trustLine)` → dependencies → resolve values → spawn; the
    child is `ssh` by argv (`buildSshExecArgv(ssh, keyPath, '"${SHELL:-sh}" -s', …)`, no `-t`, `shell:false`); STDIN carries
    `secretsStdin` then closes; askpass env in the CHILD's environment, never argv; the non-interactive banner; output
    masked; Windows refused (step 7, D12). Help ×5 for Run with Secrets, with the banner's way out.
  - **S2 — Agent.** `findUsableEntry(…, sshEntityId, 'exec')` must answer `usable`, else the exact sentence and nothing
    runs; `resolveExecAuth`, jump and pin as the agent exec does; `buildSshExecArgv` with the bare line; key deleted in
    `finally`; the consent text names the SSH entry and its target (step 8, D2). Help ×5 for the agent road.
  - **S3 — Closing.** What the road stories did not already change: the remaining help ×5 lines (the limits — POSIX
    remote shells only, Windows remote refused, the risk-1 note), `README.md`, `CHANGELOG.md`,
    `research/module_extension.md` and `research/module_tests.md` as a whole, the `todo/README.md` and
    `research/README.md` rows, and the promotion of the plan and its three stories documents together, deviations
    recorded (step 9).
- **Scope.** §4.4 bullets "Run with Secrets" and "Agent"; build steps 7, 8, 9; D2, D12; DoD rows "Help changed in
  all five languages" and "Plan promoted". Files: `maskedTerminal.ts` (`MaskedRunOptions` gains `argv`, `env` and
  `stdinText`; `shell:false`), `commands/runCommands.ts:260-311`, `runPlan.ts`, `agentUseActions.ts:187-237`,
  `mcpEntries.ts` (`findUsableEntry` on the SSH entry), `sshExecCommand.ts` (`buildSshExecArgv`), `sshExecAuth.ts`
  (`resolveExecAuth`), the consent text; `test/maskedTerminal.test.ts` with a fake spawn, `test/agentUseActions.test.ts`;
  the five help files, `README.md`, `CHANGELOG.md`, `research/module_extension.md`, `research/module_tests.md`,
  `todo/README.md`, `research/README.md`; the plan and its stories documents (the `git mv` last).
- **Depends on.** E1 (`secretsStdin`, trust line, scan, seam) and E2 (so the closing text describes every road as it
  exists). E3's branch starts from E2's commit and lands as one commit. S1 and S2 are each complete alone; S3 closes
  what the earlier stories left.
- **Done when.** §6 rows "secrets" (both), "masking end to end", "snapshot" (the masked-run half), "agent" and "help
  tests (5 languages)" are green: no value in argv, the exports and the `{ … } </dev/null` group on stdin, `"${SHELL:-sh}" -s`,
  no `-t`, output masked, Windows refused; the closed SSH entry gives the exact sentence, the usable one gives argv via
  `buildSshExecArgv`, the consent names the SSH entry; the `research/` pages and the README name the field, the trust
  line and the refusals; `helpEn.ts` no longer tells a person to write the ssh line by hand; the plan and its stories
  documents are promoted together with the deviations recorded; hand check 3 of §10 is handed to the owner.
- **Cornerstone areas.** None within the quota: this is consultant area (3), ranked below (1) and (2). The agent gate
  (the SSH entry's own `exec` eligibility, no confused deputy, no leak in the refusal text) is authorisation, so its
  judgement is a Fable security judgement outside the quota, not a marked story. Stdin ownership, EOF, the group's
  `/dev/null`, secret-free argv and masking are an Opus judge's, with the fake-spawn test as the proof.

Cornerstones: 2 of 2 — E1.S2, E1.S3
