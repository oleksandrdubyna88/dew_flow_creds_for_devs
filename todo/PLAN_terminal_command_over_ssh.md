# PLAN — a Terminal entry runs its command over a chosen SSH connection

> Status: **plan only, nothing implemented yet, 2026-11-09.** Scope: the extension (`src_vs_code`) — a new
> Terminal-entry field, the form, every road that runs a Terminal entry (arrow, folder run, dependency chain, VPN
> launcher, Run with Secrets, agent `creds_run`), SSH Connect's preparation half, help in five languages, README,
> `research/`. No server change, no HTTP contract change, no MCP tool shape change.

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
sentence that says why. **No road ever runs a linked entry's command on the local machine.**

## 2. Decisions taken, and by whom

| # | Decision | By |
|---|---|---|
| D1 | All human roads support SSH in v1: Run in Terminal (arrow), folder run, dependency-chain step, VPN launcher, Run with Secrets. | owner, 2026-11-09 |
| D2 | Agent `creds_run` / CLI `run`: allowed only when the SSH entry itself is open to the agent for `exec`; else refused with a sentence. The consent dialog names the SSH entry and says the line runs there. | owner, 2026-11-09 |
| D3 | After the remote command ends, the remote login shell stays open. The owner was told this works only on POSIX remotes. | owner, 2026-11-09 |
| D4 | Share with… and Export remove the SSH link (as `vpnLauncherEntityId`). The recipient's copy then runs locally; accepted. | owner, 2026-11-09 |
| D5 | One ssh line, never "connect, then type": text typed after ssh starts can land in a password, passphrase or host-key prompt. | lead |
| D6 | Trust (the "run this stored command?" modal and its fingerprint) covers the SSH target, not only the line — else a synced host change runs a trusted line on a new machine without a question. | lead |
| D7 | Structure: ONE pure module is the only road from "entry + link" to a launch, and a structural scan test fails if a road reads a line another way. | lead + consultants (2 of 2 answered: codex, gemini; 1 row refused on a config limit), 2026-11-09 |
| D8 | Story order: the field ships together with a refusal on every road, so no intermediate build runs a linked command locally. | lead + consultants |
| D9 | A Windows remote (*Runs on* = Windows with a link) is refused in v1: the remote shell (cmd or PowerShell) is unknown and stay-open is POSIX only. | lead + consultants |
| D10 | A password SSH entry needs a fresh terminal (the password rides the terminal's environment, settable only at creation). A new terminal opens BESIDE any live one with the same title; nothing is disposed. | lead + consultants |
| D11 | A dependency-chain step over SSH does not stay open (a step must end for the chain to go on); a password step in a chain is refused (one shared terminal has one environment). | lead |
| D12 | Run with Secrets over SSH: values go to the child's STDIN as `export` lines for a remote `sh -s`; never in argv, never in the remote `ps`, never in a history. | lead |
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
LaunchPlan: empty | refused | local{line, trustLine} | remote{ssh, remoteCommand, trustLine}
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
  NUL; the remote command is `<line>; exec "${SHELL:-sh}" -l` when `stayOpen`, else the line.
- `trustLineFor(ssh, jump, remoteCommand)`: the canonical text trust is keyed on —
  `ssh [-p port] [-J jump] -- user@host '<remote command>'`. No `-i`, no known_hosts path, no program word, no env
  prefix (they hold per-window paths). A changed host, user, port or jump gives a new text, so trust asks again (D6).
  Today's `commandFingerprint` is reused unchanged with this text as its `line`.
- `typedLine(plan, prepared, localFamily)`: `buildSshCommand` with a new optional `remote = {command, tty}` option:
  program, `-t`, the existing options, `--`, destination, then the remote command as ONE word quoted by
  `quoteFor(localFamily, …)`. Without `remote` the builder's output is byte-identical to today.
- `secretsStdin(env, line)`: `NAME='value'; export NAME` lines (posix single quotes), then the line inside a group
  `{ <line>\n} </dev/null`, then `exit $?`. `sh -s` reads its script from stdin as it goes, so a command that reads
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

Order on every interactive road: resolve and link → `prepareSshSession` (all awaits: PIN, host-key modal, route
refusal) → `confirmTrusted(trustLine)` → dependencies → the synchronous find-and-send. `cleanup()` runs on every exit
that sends nothing.

- **Arrow and VPN launcher**: `sendGuarded` takes a target: `{kind:'entry', terminalOs}` (today) or
  `{kind:'ssh', env?}`. For `ssh` the shell is the one SSH Connect pins. With `env` (password) the guard never finds
  or disposes: it opens a new terminal with the env (D10). The key file is deleted when that terminal closes, as
  SSH Connect does. A launcher whose line uses `{config}` (a local file) is refused when linked.
- **Folder run**: the modal shows each row's trust line; linked rows are prepared after the modal and the chain,
  before the synchronous `typeAll`; a row whose preparation refuses is reported as failed, the others are typed.
- **Dependency chain**: a linked step has no stay-open (D11); a password step is refused at plan time; *Runs on* of a
  linked step is not an OS refusal; the step's key is deleted when the step ends.
- **Run with Secrets**: local window only; the child is `ssh` by argv (`buildSshExecArgv(ssh, keyPath, 'sh -s', …)`,
  no `-t`, `shell:false`); STDIN carries `secretsStdin` (D12); output masked as today; the banner says typed input is
  not forwarded. `MaskedRunOptions` gains `argv` and `stdinText`.
- **Agent**: `findUsableEntry(…, sshEntityId, 'exec')` must answer `usable`, else
  `"<entry>" runs over the SSH connection "<ssh>", which is not open to agents. Nothing ran.` Then `resolveExecAuth`
  (refuses a PIN-locked or woven password), jump and pin as the agent exec does, `buildSshExecArgv` with the remote
  command WITHOUT stay-open, key deleted in `finally`. Trust uses the same trust line, so one approval covers the
  arrow and the agent. Consent text names the SSH entry and its target.
- **Copy Command / viewer**: show the trust line for a linked entry.

### 4.5 The structural test — `test/launchRoadScan.test.ts`

Shape of `commandRoadScan.test.ts`: (1) `resolveCommand(` is imported only by `commandLine.ts` and `remoteLaunch.ts`;
(2) `.sshEntityId` is read only on an exact allow-list of lines, with a stale-entry check; (3) in the road files, each
send or spawn call sits on an allow-listed line; (4) a self-check that every pattern still matches something.

### 4.6 Quoting, in two parses

Local shell: `quoteFor` single quotes (posix and PowerShell). Windows PowerShell 5.1 passes an argument that holds a
double quote to a native program wrongly; when the pinned shell is `powershell.exe` (5.1) and the remote command holds
`"`, the road refuses with "install PowerShell 7". Remote shell: the person's line is written for the remote login
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
| share strip, export strip, quarantine remap | `shareFormat`, `externalBundle`, `idQuarantine` tests | D4, renamed ids |
| candidates: not self, not Trash, host required, kind ssh | `commandTargets` test | D13 |
| every road refuses a linked entry (step 1) | arrow / folder / vpn / chain / secrets / agent worlds | D8 |
| link none / linked / missing / trashed / self / no host; Windows refusal; newline refusal; wrapper text; trust line differs per host / user / port / jump and holds no `-i` | `test/remoteLaunch.test.ts` | D5, D6, D9 |
| `buildSshCommand` byte-identical without `remote`; `-t`, `--` order; quoting of `'`, `"`, `$`, backtick for posix and PowerShell | `test/sshCommand.test.ts` | two parses |
| PowerShell 5.1 + `"` refused | composer test | §4.6 |
| prepare opens no terminal; `cleanup` deletes key and pin; `refused` leaves nothing on disk | `test/sshSession.test.ts` | the seam |
| existing SSH Connect suites green, unchanged | `sshConnect.test.ts`, `sshConnectRemote.test.ts` | no regression |
| arrow: typed line, password → new terminal with env beside a live one, nothing disposed; declined trust → cleanup; missing link → sentence, nothing typed | arrow world | D10 |
| folder: one refused row among typed rows; prepare before the synchronous send | folder world | §4.4 |
| chain: no wrapper, password step refused, key deleted at step end | dependency tests | D11 |
| secrets: no value in argv, stdin has the exports, `sh -s`, no `-t`, output masked, Windows refused | masked-run test with a fake spawn | D12 |
| agent: closed SSH entry → exact sentence; usable → argv via `buildSshExecArgv`; consent names the SSH entry | agent tests | D2 |
| road scan fails on a road that reads a line another way | `test/launchRoadScan.test.ts` | D7 |
| help tests (5 languages) | existing help tests | rule 7 |

## 7. Risks

1. **An older extension build** ignores the field and runs the command locally; its Save rebuilds the whole record
   and erases the field, and sync carries that everywhere. No version gate exists. Recorded, not solved here.
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
| [PLAN_terminal_runs_followups.md](PLAN_terminal_runs_followups.md) | the same roads (`sendPinned`, the arrow's `{config}`, `fresh` disposing by name) | none of its items; this plan adds the `ssh` target to `sendGuarded` and must not close or change those items |
| [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) | stored commands run by an agent ON a server through the bridge | none; the bridge keeps refusing `run` (§9). Disjoint: that plan runs a line on the server an agent lives on; this one runs a person's line on a server they connect to |

The table is complete for plans open on 2026-11-09 that touch these files.

## 8. Growth surfaces

None new. Materialised key files already have an owner: deleted on terminal close, child exit or `finally`, and the
`keys/<pid>/` purge on activate and deactivate (`keyInstaller.ts`).

## 9. Not in this plan

- A Windows remote (D9) — a later plan, after a hand check of Windows OpenSSH's default shell.
- Remapping references on external import (an existing gap for all four reference fields).
- A version gate against older builds (risk 1).
- The bridge: it refuses `run` and `terminal` today (`bridgeAllowList.ts:44-46`) and keeps doing so.

## 10. Hand checks (owner)

1. Local Windows, pwsh 7: arrow on an entry linked to a key SSH entry; `tmux new -A -s {name}`; detach; the remote
   shell stays.
2. The same with a password SSH entry; a second run opens a second terminal.
3. Run with Secrets over SSH on a Linux host; the value is masked; `ps` on the host shows `sh -s`.

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

Five epics over the nine build-order steps of §5. Steps that share a seam sit in one epic; a step that is a seam
of its own is an epic of its own. Each epic is mergeable alone: a road not yet built keeps E1's refusal (D8), so no
build between two epics runs a linked command locally. Stories are not written now: each epic's stories document,
`todo/PLAN_terminal_command_over_ssh_E<n>.md`, is written by Opus when that epic starts, and this section gets the
link to it then (the both-sides rule of `planning-docs.md`).

The question consultant was asked what is important (2 of 2 answered, 2026-11-09). Ranked: (1) the single launch
composer with the canonical trust line, two-shell quoting and fail-closed coverage of every road — a missed road runs
a destructive command LOCALLY; (2) the SSH preparation seam cut from `connectEntity` — the largest regression radius
on an existing security flow; (3) the non-interactive boundary — Run with Secrets over stdin to `sh -s`, and the
agent gate. With five epics the quota is Q = 2, so areas (1) and (2) are the cornerstone areas. Area (3) is watched
without a mark: its agent gate is authorisation, which `subagent-models.md` gives to a Fable security judgement
outside any quota; the rest of it is an Opus judge's.

| Epic | Steps of §5 | Cornerstone area |
|---|---|---|
| E1 · The field, the refusal on every road, the composer, the scan | 1, 2 | yes — area (1) |
| E2 · The SSH preparation seam | 3 | yes — area (2) |
| E3 · The terminal roads: arrow, VPN launcher, folder run, chain | 4, 5, 6 | none |
| E4 · The non-interactive roads: Run with Secrets, agent | 7, 8 | none (area (3), watched) |
| E5 · Help, README, CHANGELOG, `research/` | 9 | none |

### E1 · The field, the refusal on every road, the composer, the scan

- **Goal.** A Terminal entry can store an SSH link, the form round-trips it, every road refuses a linked entry with
  a sentence, and ONE pure module is the only way from "entry + link" to a launch, held there by a structural test.
  After E1 no road can run a linked line locally, built or not.
- **Scope.** §4.1 whole, §4.2 whole, §4.5, §4.6 (the PowerShell 5.1 refusal); build steps 1 and 2; D5–D9, D13, D14.
  Files: `types.ts`, `typeGuards.ts`, `execFormFields.ts`, `entityFormPanel.ts`, `entityFormScript.ts`,
  `entityFormPage.ts`, `entityFormShape.ts`, `commandTargets.ts` (`collectSshCandidates`), `shareFormat.ts`,
  `externalBundle.ts`, `idQuarantine.ts`, the viewer row, the agent-create deny-list; a refusal line in each of
  `commands/runCommands.ts` (arrow and Run with Secrets), `commands/folderRunCommand.ts`, `dependencyRun.ts`,
  `vpnLauncherRun.ts`, `agentUseActions.ts`; new `remoteLaunch.ts` (`sshLinkOf`, `planLaunch`, `trustLineFor`,
  `typedLine`, `secretsStdin`); `sshCommand.ts` (`buildSshCommand` `remote` option, byte-identical without it);
  new `test/launchRoadScan.test.ts`, `test/remoteLaunch.test.ts`, `test/sshCommand.test.ts` additions.
- **Depends on.** The coai plan round at `proceed`. Nothing else in this plan. Step 1 is the first story and lands
  before step 2 (D8); each is mergeable alone.
- **Done when.** §6 rows "guard", "`sshLinkField`", "post literal", "share strip", "candidates", "every road
  refuses", "link none / linked / …", "`buildSshCommand` byte-identical", "PowerShell 5.1" and "road scan" are
  green; `commandRoadScan.test.ts` still green; `resolveCommand(` is imported by exactly two files.
- **Cornerstone area (1).** The launch composer: the canonical trust line (no `-i`, no known_hosts path, a new
  text for a new host, user, port or jump), the two-shell quoting (`quoteFor` for the local parse, the line
  untouched for the remote parse), and the fail-closed coverage — the step-1 refusals plus the road scan that pins
  every `.sshEntityId` reader and every send or spawn to an allow-listed line. One marked story at most here; Opus
  picks it when the stories document is written.

### E2 · The SSH preparation seam

- **Goal.** `prepareSshSession` does everything `connectEntity` does before it opens a terminal — identity and PIN,
  route per window, jump chain, host-key pin and modal, known_hosts, platform, key file or askpass env — and hands
  back `ready | refused | stopped` with a `cleanup()`. `connectEntity` becomes prepare + its four open branches, and
  its tests pass unchanged.
- **Scope.** §4.3 whole; build step 3. Files: new `sshSession.ts` (moved from `sshConnect.ts:143-295`, same order),
  `sshConnect.ts` (the call and the open branches), new `test/sshSession.test.ts`. Risk 7 is inherited here on
  purpose and not fixed here.
- **Depends on.** Nothing in this plan; it can start beside E1. SSH Connect's two suites are its guard.
- **Done when.** §6 rows "prepare opens no terminal" and "existing SSH Connect suites green, unchanged" are green;
  `cleanup()` deletes the materialised key and our pin; a `refused` result leaves nothing on disk; no road calls the
  seam yet.
- **Cornerstone area (2).** The seam itself: the order of the awaits, the per-window route, and the lifetime of the
  credential, the key file and the askpass env from `ready` to `cleanup()` — the contract every road in E3 and E4
  will rely on. One marked story at most here.

### E3 · The terminal roads: arrow, VPN launcher, folder run, chain

- **Goal.** A person's roads that type into a VS Code terminal run a linked entry on the chosen host, in the order
  "resolve and link → prepare → trust → dependencies → synchronous send", with `cleanup()` on every exit that sends
  nothing.
- **Scope.** §4.4 bullets "Arrow and VPN launcher", "Folder run", "Dependency chain", "Copy Command / viewer";
  build steps 4, 5, 6; D10, D11; risks 3, 4, 5. Files: `terminalGuard.ts` (`sendGuarded` takes a target
  `{kind:'entry'}` or `{kind:'ssh', env?}`), `pinnedTerminal.ts`, `commands/runCommands.ts:115-147`,
  `vpnLauncherRun.ts`, `commands/folderRunCommand.ts`, `folderRun.ts`, `dependencyRun.ts`, `dependencyRunHost.ts`,
  the Copy Command and viewer; their test worlds. It adds the `ssh` target to `sendGuarded` and must not close or
  change the items of `PLAN_terminal_runs_followups.md` (§7a).
- **Depends on.** E1 (composer, scan allow-list) and E2 (the seam). Steps 4, 5 and 6 are each mergeable alone; the
  roads not yet built keep E1's refusal.
- **Done when.** §6 rows "arrow", "folder" and "chain" are green; the road scan is green with the new send lines
  allow-listed; hand checks 1 and 2 of §10 are handed to the owner (they are owed, not a gate for the merge).
- **Cornerstone areas.** None. The key-file and password lifetimes these roads use are E2's contract; the roads only
  call `cleanup()`. Opus judges each story.

### E4 · The non-interactive roads: Run with Secrets, agent

- **Goal.** The two roads that run a child process instead of typing into a terminal run a linked entry over SSH
  without a secret in argv, in the remote `ps` or in a history; the agent road runs only when the SSH entry itself
  is open to the agent for `exec`, and refuses with the exact sentence otherwise.
- **Scope.** §4.4 bullets "Run with Secrets" and "Agent"; build steps 7 and 8; D2, D12. Files: `maskedTerminal.ts`
  (`MaskedRunOptions` gains `argv` and `stdinText`; `shell:false`), `commands/runCommands.ts:260-311`, `runPlan.ts`,
  `agentUseActions.ts:187-237`, `mcpEntries.ts` (`findUsableEntry` on the SSH entry), `sshExecCommand.ts`
  (`buildSshExecArgv`), `sshExecAuth.ts` (`resolveExecAuth`), the consent text; `test/maskedTerminal.test.ts` with a
  fake spawn, `test/agentUseActions.test.ts`.
- **Depends on.** E1 (`secretsStdin`, trust line, scan) and E2 (Run with Secrets prepares through the seam). The
  agent road uses the existing exec auth and argv builder. Steps 7 and 8 are each mergeable alone.
- **Done when.** §6 rows "secrets" and "agent" are green: no value in argv, the exports and the `{ … } </dev/null`
  group on stdin, `sh -s`, no `-t`, output masked, Windows refused; the closed SSH entry gives the exact sentence,
  the usable one gives argv via `buildSshExecArgv`, the consent names the SSH entry; hand check 3 of §10 is handed
  to the owner.
- **Cornerstone areas.** None within the quota: this is consultant area (3), ranked below (1) and (2). The agent
  gate (the SSH entry's own `exec` eligibility, no confused deputy, no leak in the refusal text) is authorisation, so
  its judgement is a Fable security judgement outside the quota, not a marked story. Stdin ownership, EOF, the
  group's `/dev/null`, secret-free argv and masking are an Opus judge's, with the fake-spawn test as the proof.

### E5 · Help, README, CHANGELOG, `research/`

- **Goal.** The help in five languages says what the field does and no longer tells a person to write the ssh line
  by hand (`helpEn.ts:84`); README, CHANGELOG and `research/` describe the shipped system; the plan is promoted with
  its deviations.
- **Scope.** Build step 9; DoD rows "Help changed in all five languages" and "Plan promoted". Files: `helpEn.ts`
  first, then the four other help files; `README.md`; `CHANGELOG.md`; `research/module_extension.md`,
  `research/module_tests.md`; `todo/README.md` and `research/README.md` rows for the plan and its stories documents.
- **Depends on.** E1–E4 merged, so the text describes what exists. Help lines for a road may land with that road's
  epic when its story needs them; this epic closes what is left.
- **Done when.** §6 row "help tests (5 languages)" is green; the `research/` pages and the README name the field,
  the trust line and the refusals; the plan and its stories documents are promoted together with the deviations
  recorded.
- **Cornerstone areas.** None.

Cornerstones: 0 of 2 — none marked yet
