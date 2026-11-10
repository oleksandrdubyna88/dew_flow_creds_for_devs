# PLAN — Terminal command over SSH, E3: Run with Secrets, the agent's run, and the closing

> Status: **stories of E3, nothing implemented yet, 2026-11-10. The parent is stopped for re-review (entry 2.2): no E3 code until epoch 3 opens.** Parent: [PLAN_terminal_command_over_ssh.md](PLAN_terminal_command_over_ssh.md) › E3.
> Branch `feat/terminal-command-over-ssh-e3`, started from E2's commit (a5ddd73, E1 + E2 on the Windows quoting security
> fix) and rebased on 2026-11-10 onto `origin/main` 454e990 (E1 #335, E2 #337, and #336 — the SSH Connect tab title
> `Creds SSH: <folder> / <entry>`, a session found by account + entry through `sshTerminalOwners.ts`, never by title); E3
> lands as ONE commit. Scope: `src_vs_code` only. Three stories, no cornerstone (the parent's ledger stays
> `Cornerstones: 2 of 2 — E1.S2, E1.S3`). Scenarios and briefs by Opus; code and tests by Sonnet; review by Opus. The
> AUTHORISATION part of S2 is a Fable security judgement (outside the quota), in its own file:
> [PLAN_terminal_command_over_ssh_E3_S2_security.md](PLAN_terminal_command_over_ssh_E3_S2_security.md).
> The eight amendments of E3's first plan round are written into the sections they change (§E3.R1 says where).

Every path below is relative to `src_vs_code/src/` unless it says otherwise. Every `file:line` was opened on a5ddd73 and
checked again on 454e990: of the cited source files only `sshSession.ts` moved (#336 added 4 lines at `:103`), and of the
documents `research/module_extension.md` and `research/module_tests.md`; those references are updated. E3 finds no session
by a terminal title: the masked run is its own pseudoterminal, and `sshTerminalOwners.ts` is SSH Connect's alone.

## The three stories

| Story | What | Scenarios and brief | Code and tests | Review |
|---|---|---|---|---|
| S1 | Run with Secrets over SSH: the values on ssh's STDIN for the remote login shell, the masked child by argv | Opus, §S1 | Sonnet | Opus |
| **S2 — authorisation part: Fable security judgement** | The agent's `creds_run` (and CLI `run`) over SSH | the gate, the refusal texts and the consent: **Fable**, `PLAN_terminal_command_over_ssh_E3_S2_security.md`; everything else: Opus, §S2 | Sonnet | Opus |
| S3 | Closing: the limits in the help ×5, README, CHANGELOG, `research/` as a whole, the promotion | Opus, §S3 | Sonnet | Opus |

S1 and S2 do not depend on each other. S2's code waits for the Fable spec. S3 comes last: it describes the roads as built.
Each story is complete alone: a road whose story is not built keeps E1's refusal (D8).

S2 is not a cornerstone. The parent gives E3 no cornerstone area (its area (3) is "watched"), and `subagent-models.md` puts
authorisation in the Fable row "Security judgement", outside any quota. So the ledger line does not change.

### S1 — Run with Secrets over SSH

- **Goal.** *Run with Secrets* on a linked Terminal entry runs the line on the chosen host. The order is: link and plan →
  prepare → the trust question on the trust line → dependencies → resolve the values → spawn. The child is `ssh` by argv
  with no shell. Its STDIN carries `secretsStdin` and is then closed. A password goes in the CHILD's environment through
  askpass. The output is masked. A banner says the run is not interactive, and carries the launch's own warning. A
  Windows remote, a remote VS Code window and a line break are refused before anything is asked. ONE OWNER and ONE
  SNAPSHOT as on every other road; the owner hands the session to the run in one atomic, once-only step. The run is
  bounded: `ConnectTimeout=10`, and closing its terminal kills the child through `childKill`; no stdin write outlives it.
- **Scope.** Parent §4.4 bullet "Run with Secrets"; build step 7; D12. Help ×5 for Run with Secrets over SSH.
- **Depends on.** E1 (`SECRETS_REMOTE_COMMAND`, `secretsStdin`, `trustLineFor`, the seam), E2 (`SshRoad`, `ownedSessions`).
- **Done when.** §S1.6 scenarios green, each watched RED first (LN1-LN6 by the temporary bypass of parent §4.5 (5));
  the scan edits of §S1.3; typecheck and lint green; no file over its ceiling; `extension.ts` not one line longer.

### S2 — The agent's run over SSH

- **Goal.** An agent's `creds_run` (and the CLI's `run`) on a linked Terminal entry runs the BARE line on the chosen host
  through `buildSshExecArgv`, only when the Fable gate lets it through. The credential comes from `resolveExecAuth` (a
  PIN-locked or woven password is refused). Jump and pin come as the agent's `ssh:exec` has them. The key file is
  deleted in `finally`. The trust key is the trust line, so one approval covers the arrow and the agent.
- **Scope.** Parent §4.4 bullet "Agent"; build step 8; D2. Help ×5 for the agent's run.
- **Depends on.** The Fable spec (the gate, the refusal texts, the consent text); E1; E2.
- **Done when.** §S2.5 scenarios green (and the Fable spec's own scenarios), each watched RED first; the scan edits of
  §S2.4; typecheck and lint green; `extension.ts` not one line longer.

### S3 — Closing

- **Goal.** Every document describes the shipped system; the parent, its five stories and spec documents, and the E3.S2
  security spec are promoted together, with their deviations, the `git mv` last.
- **Scope.** Build step 9; DoD rows "Help changed in all five languages" and "Plan promoted"; hand check 3 handed to
  the owner.
- **Depends on.** S1 and S2 built and reviewed.
- **Done when.** §S3.3 checklist done; `node .agents/conventions/tools/plan-lifecycle.mjs` clean.

## E3.0 — Decisions taken here (Opus)

| # | Decision | Why |
|---|---|---|
| E3-D1 | **The pure part of the secrets launch lives in `remoteLaunch.ts`**: `secretsLaunch(plan, prepared)` (the argv), `secretsRemoteLine(plan, refs)` (the line with each reference replaced by its POSIX read), `secretsOverSshBanner(target, secrets)`. | D7: one pure module is the only road from "entry + link" to a launch. `secretsLaunch` is to the spawn what `typedLine` is to the terminal. |
| E3-D2 | **The remote line is the trust line's line.** `secretsRemoteLine` = `rewriteRefs(plan.line, refs, 'linux')`; the references are planned from `plan.line` only (`planRefs([plan.line])`). | What the person approves (`trustLineFor(…, plan.line)`) is what runs, except that each `creds://` reference becomes `"$CREDS_REF_n"`. The local road plans from the parts, disabled rows included; a reference only in a disabled row is not in the line, so over SSH it is not read at all. Recorded as a deviation in S3. |
| E3-D3 | **"No reference" is said BEFORE prepare.** Planning names reads no secret, so a linked entry with no `creds://` reference gets today's sentence and no PIN, no host-key question, no key file. | The parent's order (prepare → trust → dependencies → resolve values → spawn) is kept for everything that reads or asks. |
| E3-D4 | **The secrets spawn prepares with `agentServesKey: false`.** `SshRoad.prepare` gains a third parameter `use: 'terminal' \| 'spawn'` (default `'terminal'`). For `'spawn'` a stored key is always written to its isolated file and `-i` names it. | A terminal reaches the extension's agent through the window's environment collection; a child spawned by the extension host does not. With no key file the child would use whatever `SSH_AUTH_SOCK` the host process has: the "silently authenticates with whatever keys" hazard `sshSession.ts:400-406` refuses on the relay route. |
| E3-D5 | **`SshRoad.spawnLaunch(ssh, env)`** gives the program and the extra environment of a spawned ssh: `openSshBinary('ssh', ssh.agentForward === true, process.platform)` (never a bare name searched in the current folder on Windows) and `SSH_AUTH_SOCK` = the extension's agent socket when the SSH entry forwards the agent, plus the askpass `env`. Composed by ONE new pure function `sshSpawnLaunch` in `sshProgram.ts`, which `sshUseActions.ts` `agentAwareLaunch` (`:95-109`) also uses. Its `warning` (today only `NO_AGENT_TO_FORWARD`, `sshProgram.ts:251-253`, from `agentForwardEnv` `:267-279`) goes into the banner (E3-D12). | The agent's exec already does exactly this; one composition, two callers (reuse-first). `SshRoadDeps` gains an optional `agentSocket`; `sshRoadOf(sshDeps)` already receives it (`sshUseActions.ts:398`), so `extension.ts` does not change. |
| E3-D6 | **Local window only, checked before prepare**: `windowKind(vscode.env.remoteName) !== 'local'` → `secretsLocalOnly(name)`, nothing prepared. `secretsLaunch` also refuses a prepared session with a relay `prefix` or a client `program` (fail closed; unreachable in a local window). | Parent §4.4 "local window only". The extension host spawns on THIS machine; a WSL or Remote-SSH window's preparation is composed for another shell. |
| E3-D7 | **ONE atomic, once-only hand-over from the owner to the masked run** (round 1, item 5). `OwnedSessions` gains `handOverToRun(ready: ReadySsh): () => void`: it takes `ready` off the owner's list and answers the run's cleanup, a once-only wrapper of `ready.cleanup()` (a second call does nothing). The road calls it and then `runInMaskedTerminal({ …, onEnded: ended })` in ONE synchronous block with no `await` between them; when `runInMaskedTerminal` throws (the terminal was never made), the road's `catch` calls `ended()` and rethrows. `MaskedRunOptions.onEnded` is called EXACTLY ONCE for a run whose terminal was made: child `close`, child `error`, a failed start, or the terminal closed before the child started — whichever comes first; a throw from `createTerminal` is the caller's to clean. So `ready.cleanup()` runs exactly once on every exit: the run's end, a failed creation, a creation that ended and then threw, a close before the start; the owner's `finally` never sees a handed-over session again. | Parent §4.4: after the spawn the owner is the child's exit handler. The pty spawns in `open()`, after `createTerminal` returns, so the hand-over is to the run, which owns every later exit. A hand-over in two steps (create, then leave the list) cleans twice when the creation fails after the run ended, and a list entry that outlives the hand-over is a second owner. |
| E3-D8 | **The SSH child's environment never holds a value** (D12; round 1, item 4). `MaskedRunOptions.env` in argv mode is `spawnLaunch`'s answer only: the askpass variables of a password SSH entry (`SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE`, `CREDS_SSH_PASSWORD`, `sshAskpass.ts:43-45`) and `SSH_AUTH_SOCK`; no `CREDS_REF_n` and no resolved value. The values reach the remote only in `stdinText`. The askpass variables carry the SSH entry's own password and are the ACCEPTED LIMIT of `research/PLAN_windows_shell_quoting_injection.md` §8 (owner, 2026-11-10; `research/module_extension.md:221`): a person's own `SendEnv` pattern that matches them, with a server `AcceptEnv` that matches too, sends the password to the server. E3 adds no `-o SendEnv=-NAME`: it was MEASURED not to remove a wildcard pattern (OpenSSH removes only a literally equal one; `ssh -G` on OpenSSH 10.2p1 and Windows OpenSSH 9.5p2 still listed `sendenv CREDS_*`), so it would only look like protection. | D12 promises the values never in argv, the remote `ps` or a history; nothing gains by putting them in the local ssh's environment, and there no `SendEnv` can reach them. The password limit is the same on SSH Connect and E2's password terminals today; this road does not widen it. |
| E3-D11 | **The masked run is bounded** (round 1, item 1). (a) Connecting: the argv carries `-o ConnectTimeout=10` in both branches (`sshExecCommand.ts:115`), and the password branch `NumberOfPasswordPrompts=1` (`:106`), the key branch `BatchMode=yes` (`:107`): ssh answers no prompt from stdin. That is what we ASK ssh; hand check 3 observes the effect (a wrong password or a dead host ends with ssh's error, not a hang). (b) Closing: the terminal's `close()` calls `killChild(child, { tree: true })` (`childKill.ts:81-87`) as today: on Windows `taskkill /pid <pid> /T /F` (`:32-37`) ends `ssh.exe` and a jump host's helper `ssh`; on POSIX `SIGTERM`, then `SIGKILL` after `KILL_GRACE_MS` = 2000 (`:23`), to the child, which in argv mode IS `ssh` (no shell between). (c) Stdin: the script is written once, in `open()`, right after the spawn; when the run ends (E3-D7's once-only `ended()`), the child's stdin is DESTROYED, so a part of the script not yet taken by the child (it holds the values) is dropped, never written later; `open()` after the run ended spawns nothing and writes nothing. | Parent §4.4: no byte to stdin before trust, and the run must end. A child that never reads stdin (stalled before the server answers) would otherwise keep the script, values included, in the extension host's write buffer for as long as it lives. |
| E3-D12 | **The launch's warning is a line of the banner, not a toast** (round 1, item 3). `maskedOverSshBanner(described, warning, target, secrets)` (pure, `remoteLaunch.ts`) joins with `\r\n`: `described`; `Note: <warning>.` when `warning` is set; `secretsOverSshBanner(target, secrets)`. Nothing calls `showWarningMessage` for it. | A one-argument toast is not awaited and races the launch: the run's output can be on screen before it, or the person closes the toast unread. The banner is written in `open()` before the first byte of output. |
| E3-D13 | **`LaunchPlan` is NOT changed** (round 1, item 2; E3.L flag 1 WITHDRAWN). `commands/runCommands.ts` keeps importing `resolveCommand` (`:9`) for its two LOCAL uses: `arrowLine` (`:170`) and the local Run with Secrets' `commandJob` (`:350`, whose `parts` feed `buildCommandLineWithRefs`, `:430`). After S2 the road scan's `RESOLVE_IMPORTERS` (`test/launchRoadScan.test.ts:103`) is `['commands/runCommands.ts', 'remoteLaunch.ts']`. Counted as parent entry 2.2; since the epoch-3 revision, parent §4.5 (1) names this list, and the guarantee that the import target served is held by the no-local-sink tests (parent §4.5 (5); §S1.6 LN1-LN6). | `LaunchPlan` is E1.S2's cornerstone type (`remoteLaunch.ts:152-167`); widening it for a local road reopens a reviewed cornerstone for no gain on the SSH roads, which already read only `planLaunch`. |
| E3-D9 | **The agent's SSH call is injected**, as `overSsh` on the deps of `terminalRunAction`. Its implementation `execOverSsh(deps)` lives in `sshUseActions.ts` (the `vscode` side) and is shared with `sshExecAction`. `sshDepsFor` (`sshUseActions.ts:383-405`) returns it, and `agentDeps` already spreads `sshDeps` (`extension.ts:629-637`). | `agentUseActions.ts` imports no `vscode` and its tests load it directly; `resolveExecAuth` and `materializeKnownHosts` reach `vscode` (`keyInstaller.ts:5`, `hostKeyTrust.ts:3`). And `extension.ts` is at its size ratchet (1003). |
| E3-D10 | **No new two-argument prompt and no renamed prompt function** (as E2-D10). If `test/promptSites.test.ts` goes red, stop and report to the judge. | The prompt ledger keys rows by `file#function#…`. |

**The exact sentences and texts** (each lives once, as a constant or a function; tests compare with it):

| Name | Where | Text |
|---|---|---|
| `secretsLocalOnly(name)` | `remoteLaunch.ts` | `Run with Secrets over SSH works only in a local VS Code window, and this window is not one. Nothing was run: open "<name>" from a local window.` |
| `NO_REFERENCE(name)` | `commands/runCommands.ts` (today's literal at `:369-371`, made a function; text unchanged) | `"<name>" holds no creds:// reference. Write one as a value — creds://<account email>/<entity>/<field> — then run this again. Nothing was run.` |
| `secretsOverSshBanner(target, secrets)` | `remoteLaunch.ts` | `Over SSH to <target>. The values go to the remote login shell on its standard input, never on a command line, and are replaced with <CREDS_MASKED:NAME> in what it prints here.<caveat> This run is not interactive: there is no terminal, and the command reads an empty input, so a command that asks a question usually stops. To answer questions, use Run in Terminal instead; the values are not injected there.` |
| `<caveat>` = `shortValuesCaveat(secrets)` | `outputMask.ts` (new export, the words of `extension.ts:972-976` moved, not changed) | `''`, or ` NOT masked, because they are too short to replace without mangling ordinary output: <labels> — a one-time code is six digits, so treat this window as showing it.` |
| `maskedOverSshBanner(described, warning, target, secrets)` | `remoteLaunch.ts` (E3-D12) | the lines `described`, then `Note: <warning>.` only when `warning !== undefined`, then `secretsOverSshBanner(target, secrets)`, joined with `\r\n` (no trailing `\r\n`; `open()` adds the `\n`) |

`<target>` is the `target` of `secretsLaunch`'s `spawn` answer, which is `ready.target` (`describeSshTarget`: `user@host`
with `:port` when not 22; K2 refuses a session whose `target` is undefined, so it is a string here). The masked run's
banner is `maskedOverSshBanner(described, spawn.warning, launch.target, resolved.secrets)` where `described` is today's
first line (`runCommands.ts:414-416`), built the same way from `refs`.

---

## S1 — Run with Secrets over SSH (scenarios and brief)

### S1.1 What the road does

`runWithSecrets` (`commands/runCommands.ts:299-308`) becomes:

1. `secretsJobAt` as today (`:328-334`): no command, an empty script and the `{name}` refusal in today's words.
2. **A script job never reads a link** (a script cannot carry one written by this build: the form keeps the field on
   Terminal entries only). It goes to the local road, whose `secretsRefusal` (`:311-313`) still refuses a script that a
   sync gave a link, with E1's sentence. Fail closed.
3. A command job: `const link = sshLinkOf(job.entry.details, (id) => host.storage.getNode(job.entry.accountId, id))`.
   `none` → `runSecretsHere(host, job)`: today's body of `:301-307`, byte for byte (its `secretsRefusal` answers
   `undefined` for the link and keeps the OS check).
4. Linked → `runSecretsOverSsh(host, job, link)`:
   1. `windowKind(vscode.env.remoteName) !== 'local'` → warn `secretsLocalOnly(name)`; return (E3-D6).
   2. `const plan = planLaunch(job.entry.details, link, { stayOpen: false })`. `refused` → warn `plan.reason` (the link's
      sentence, D9's, the line break's); return. (`empty` and `local` cannot happen here; treat them as "return".)
   3. `const refs = planRefs([plan.line])`; no reference → warn `NO_REFERENCE(name)`; return (E3-D3).
   4. `spawnOverSsh(host, job, plan, refs)`, below.
5. `spawnOverSsh` — the ONE OWNER:

```ts
const sessions = ownedSessions();
try {
  const prepared = await host.sshRoad.prepare(job.entry.accountId, plan.ssh, 'spawn');
  if (prepared.kind === 'refused') { await host.sshRoad.sayRefused(prepared, plan.ssh); }
  if (prepared.kind !== 'ready') { return; }
  sessions.own(prepared);
  await trustedThenSpawned(host, job, plan, refs, prepared, sessions);
} finally {
  sessions.cleanAll();
}
```

`trustedThenSpawned` (split as needed: ≤ 50 lines, complexity ≤ 4 per function):

- `const launch = secretsLaunch(plan, ready)`; `refused` → warn; return. (Pure, before anyone is asked: E2-D6.)
- `passGates(host, job.entry, trustLineFor(ready.entity, ready.jump, plan.line), undefined)` false → return. This is the
  trust modal and then `runDependenciesFirst` (`:101-111`). No child exists and no byte is written yet.
- `const resolution = await resolveSecretRefs(refs.refs, host.refSource)`; not ok → today's error message; return.
- `const resolved = withValues(refs, resolution.values, { env: {}, body: '' })` (`:401-411`, unchanged).
- `const spawn = host.sshRoad.spawnLaunch(ready.snapshot, ready.env)`. Its `warning` is NOT shown as a toast: it is a
  line of the banner (E3-D12), on screen before the first byte of output. No `showWarningMessage` on this path.
- The hand-over (E3-D7), in `maskedOverSsh`, ONE synchronous block — no `await` from `handOverToRun` to the end of the
  `try`:

```ts
const ended = sessions.handOverToRun(ready);   // off the owner's list; the once-only cleanup of this session
try {
  runInMaskedTerminal({
    name: maskedRunTitle(name),
    argv: [spawn.program, ...launch.argv],
    env: spawn.env,                                                  // askpass + SSH_AUTH_SOCK only (E3-D8)
    stdinText: secretsStdin(resolved.env, secretsRemoteLine(plan, refs)),
    secrets: resolved.secrets,
    banner: maskedOverSshBanner(described, spawn.warning, launch.target, resolved.secrets),
    onEnded: ended,
  });
} catch (error) {
  ended();          // no terminal was made, so the run can never end on its own
  throw error;      // the owner's finally runs; the session is no longer on its list
}
```

**ONE SNAPSHOT** (as code review checks it): from `prepare` to the spawn there is no `storage.getNode` of the SSH id, no
`sshLinkOf`, and `plan.ssh` is not read again. The trust line, the argv, the spawn program and the banner target are
built from `ready` only (`ready.entity`, `ready.jump`, `ready.options`, `ready.snapshot`, `ready.target`).

### S1.2 What ssh does with stdin, why nothing else reads it, and what ends the run

`buildSshExecArgv` (`sshExecCommand.ts:94-140`) gives the key branch `-o BatchMode=yes` and the password branch
`-o NumberOfPasswordPrompts=1` with `SSH_ASKPASS_REQUIRE=force` in the environment; both have `ConnectTimeout=10` and
`StrictHostKeyChecking` (`accept-new`, or `yes` with the pinned file). So ssh answers no prompt from stdin, and stdin goes
whole to the remote command. No `-t`: no remote pty. The remote command is `SECRETS_REMOTE_COMMAND`
(`remoteLaunch.ts:298`, `"${SHELL:-sh}" -s`), the last argv element, after `--` and the destination.

**What ends the run** (E3-D11; the scenarios K1, K2, M2, M9-M11):

| Moment | What bounds it | Who observes it |
|---|---|---|
| connecting, authenticating | `-o ConnectTimeout=10` (both branches) and no prompt answered from stdin (`BatchMode=yes` or `NumberOfPasswordPrompts=1` with `SSH_ASKPASS_REQUIRE=force`) — what we ASK ssh | K1 and K2 assert the words are SENT; hand check 3 observes the effect (a wrong password or a dead host ends with ssh's error, not a hang) |
| the remote command runs | the person: the masked terminal is the run's only handle; closing it is the stop | — (by design: a long command is allowed to run) |
| the terminal closes | `pty.close()` → `killChild(child, { tree: true })` (`maskedTerminal.ts:107`, unchanged): Windows `taskkill /T /F` on the tree; POSIX `SIGTERM`, then `SIGKILL` after `KILL_GRACE_MS` | M9: a child that ignores `SIGTERM` is gone after the close; the kill is recorded with `{ tree: true }` |
| the run ends (any of the four ways of E3-D7) | `ended()` destroys the child's stdin: an unwritten tail of the script (values included) is dropped, never written later; `open()` after the end does nothing | M9 (stdin destroyed with a script larger than the pipe takes), M6b (`close()` then `open()` spawns nothing) |

Not observed by a unit test, and so written as a request, not a fact: on POSIX `childKill` signals `ssh` only; with a jump
host, `ssh`'s `ProxyJump` helper is its own child, and that helper ending with it is OpenSSH's behaviour, not ours. Hand
check 3 (parent §10) observes it: with a jump host, `pgrep -f 'ssh .*-W'` on this machine is empty a few seconds after the
masked terminal is closed mid-run. S3 hands that line to the owner with hand check 3.

### S1.3 The brief — every file, the place, the change

**`remoteLaunch.ts`** (pure; 369 → about 430 lines)

| Add | Content |
|---|---|
| imports | `buildSshExecArgv` from `./sshExecCommand`; `RefPlan`, `rewriteRefs` from `./runPlan`; `shortValuesCaveat` from `./outputMask`; `sshDestination` is already imported for the trust line. Check that no import cycle appears (`runPlan.ts` imports `commandLine`, `types`, `secretRef`, `hostShell`). |
| `export interface PreparedForSpawn` | `entity`, `options: Pick<SshCommandOptions, 'knownHostsFile' \| 'program'>`, `jump`, `prefix`, `env: Readonly<Record<string, string>> \| undefined`, `target: string \| undefined`. Structural, so a `ReadySsh` is assignable with no adapter; doc: reads the snapshot only. |
| `export type SecretsLaunch` | `{ kind: 'spawn'; argv: readonly string[]; target: string } \| { kind: 'refused'; reason: string }`. |
| `export function secretsLaunch(plan: RemotePlan, prepared: PreparedForSpawn): SecretsLaunch` | Rows K1-K3: K1 `prefix !== undefined \|\| options.program !== undefined` → `refused` with `secretsLocalOnly(plan.entryName)`; K2 `buildSshExecArgv(prepared.entity, prepared.entity.sshKeyPath, SECRETS_REMOTE_COMMAND, prepared.env === undefined ? 'key' : 'askpass', { jump: prepared.jump, knownHostsFile: prepared.options.knownHostsFile })` answers `undefined`, or `prepared.target` is `undefined` → `refused` with `noHostSentence(plan.sshName)`; K3 → `{ kind: 'spawn', argv, target: prepared.target }`. Doc names D12, E3-D4 and E3-D11 (a): the argv carries `ConnectTimeout=10` and answers no prompt from stdin. |
| `export function maskedOverSshBanner(described: string, warning: string \| undefined, target: string, secrets: readonly { value: string; label: string }[]): string` | E3-D12, the E3.0 row. |
| `export function secretsRemoteLine(plan: RemotePlan, refs: RefPlan): string` | `rewriteRefs(plan.line, refs, 'linux')` (E3-D2). Doc: the remote shell is POSIX (D9), so the reads are `"$CREDS_REF_n"`. |
| `export function secretsLocalOnly(name: string): string` | The E3.0 text. |
| `export function secretsOverSshBanner(target: string, secrets: readonly { value: string; label: string }[]): string` | The E3.0 text. |

**`outputMask.ts`** (pure) — add `export function shortValuesCaveat(secrets: readonly { value: string; label: string }[]): string`
with the words of `extension.ts:969-976` (the `short` filter on `MIN_MASKABLE_LENGTH` and the `caveat` text).
**`extension.ts`** — in place, no line added: `maskingBanner` (`:968-978`) uses `shortValuesCaveat(secrets)`; the import on
`:88` names both (`MIN_MASKABLE_LENGTH` stays only if another line still uses it). The file shrinks; `test/sizeRatchet.test.ts`
accepts a shrink. The banner text of the local road does not change (`test/maskedTerminal.test.ts` and the banner tests
stay green unchanged).

**`maskedTerminal.ts`** (172 → about 230 lines)

| Place | Change |
|---|---|
| `MaskedRunOptions` `:27-53` | `commandLine` and `shell` become optional, and three fields are added: `argv?: readonly string[]` — the program and its arguments, spawned with `shell: false`; when set, `commandLine` and `shell` are not read; `stdinText?: string` — written to the child's stdin once, right after the spawn, then stdin is closed; keystrokes are then NOT forwarded; `onEnded?: () => void` — called exactly once for a run whose terminal was made, when the run ends (E3-D7: `close`, `error`, a failed start, or a close before the start); a throw from `createTerminal` is the caller's to clean. The `env` doc says: on top of the parent environment; in argv mode it carries no value (E3-D8). Exactly one of `commandLine` and `argv` must be set: put this in the type (a union), not in a comment. |
| `spawnChild` `:155-172` | One spawn line, from a helper `launchOf(options)` that answers `{ program, args, shell }`: argv mode → `{ program: argv[0], args: argv.slice(1), shell: false }`; else `{ program: options.commandLine, args: [], shell: shellOption(options.shell) }` (today). The line becomes `const child = childProcess.spawn(launch.program, launch.args, {` with `shell: launch.shell`. |
| `runInMaskedTerminal` `:66-119`, new state | Beside `let child` (`:69`): `let over = false`, and `const ended = (): void => { if (over) { return; } over = true; child?.stdin.destroy(); options.onEnded?.(); }` (E3-D11 (c): the unwritten tail of the script is dropped with the stdin). |
| `open()` `:74-98` | First line: `if (over) { return; }` (a close before the start: nothing is spawned, nothing written). After `child = started.child`: `if (options.stdinText !== undefined) { child.stdin.end(options.stdinText); }` (the `stdin` `error` listener of `:167` is already on). `ended()` is called on `!started.ok` (after `closer.fire(1)`), and in the child's `error` (`:87-90`) and `close` (`:91-97`) handlers, after their writes. |
| `close()` `:99-108` | `child === undefined` → `ended()` (the terminal closed before the child started); else `killChild(child, { tree: true })` as today (its `close` event then calls `ended()`). |
| `handleInput` `:109-113` | `stdinText !== undefined` → return without echo or write (stdin is the script, and closed). |
| `killChild` comment `:103-106` | Add: in argv mode there is no shell and the child IS the program (`ssh`); `tree: true` stays — on Windows it also ends a jump host's helper `ssh`; on POSIX that helper is OpenSSH's to end (E3-D11, hand check 3). |
| file doc `:8-25` | One paragraph: the argv mode of Run with Secrets over SSH (E3.S1): no shell, a script on stdin then end of input, no keystrokes forwarded; the run ends exactly once (`onEnded`), and its end destroys stdin. The sentence `:24` ("Input is forwarded…") gains "— except in argv mode with a script on stdin". |

**`sshProgram.ts`** (pure) — add `export function sshSpawnLaunch(entity: EntityMetadata, socket: string | undefined, platform: NodeJS.Platform): { program: string; env: NodeJS.ProcessEnv; warning?: string }`
= `openSshBinary('ssh', entity.agentForward === true, platform)` and `agentForwardEnv({}, entity.agentForward === true, socket)`.
`sshUseActions.ts` `agentAwareLaunch` (`:95-109`) calls it and merges `env` over its base; its `deps.note` of the warning stays.

**`sshRoad.ts`** (226 → about 260 lines)

| Place | Change |
|---|---|
| `SshRoad` `:21-33` | `prepare(accountId, ssh, use?: 'terminal' \| 'spawn')` with a doc for `'spawn'` (E3-D4); new `spawnLaunch(ssh: EntityMetadata, env: Readonly<Record<string, string>> \| undefined): { program: string; env: Record<string, string>; warning?: string }` (E3-D5): `sshSpawnLaunch(ssh, deps.agentSocket?.(), process.platform)`, its `env` with `env` merged on top. |
| `SshRoadDeps` `:36` | `Pick<SshUseDeps, 'storage' \| 'storageDir' \| 'relays' \| 'servesKeyForEntity'> & Partial<Pick<SshUseDeps, 'agentSocket'>>`. |
| `sshRoadOf` `:38-52` | `optionsFor(ssh, use)`: `agentServesKey: use === 'spawn' ? false : deps.servesKeyForEntity?.(ssh) === true`; everything else as today (`isolate: true`). |
| `OwnedSessions` `:61-81` | Add `handOverToRun(ready: ReadySsh): () => void` with the doc of E3-D7: `owned.delete(ready)`, then answer `once(() => ready.cleanup())` — a local `let done = false` guard, so a second call does nothing even if a future `cleanup()` is not idempotent. The class doc (`:54-60`) gains: "A session `handOverToRun`ed to a spawned run leaves the list; the run's end cleans it, once." |

**`commands/runCommands.ts`** (436 → about 520 lines)

| Place | Change |
|---|---|
| imports `:13-26` | `planRefs` stays; `resolveCommand` from `../commandLine` (`:9`) STAYS (E3-D13); add `windowKind` to the `../hostShell` import; `../remoteLaunch` adds `RemotePlan`, `maskedOverSshBanner`, `secretsLaunch`, `secretsLocalOnly`, `secretsRemoteLine`, `secretsStdin`, `trustLineFor`; `../sshRoad` adds `ownedSessions`; `ReadySsh` type from `../sshSession`; `RefPlan` from `../runPlan`. |
| `runWithSecrets` `:299-308` | §S1.1 steps 2-4: `const job = …; if (job === undefined) return; const link = secretsLinkOf(host, job); await (link.kind === 'none' ? runSecretsHere(host, job) : runSecretsOverSsh(host, job, link));`. `secretsLinkOf`: a script → `{ kind: 'none' }`; a command → `sshLinkOf(…)`. |
| new `runSecretsHere(host, job)` | Today's `:301-307` (gates with `secretsRefusal`, `resolvedRefs`, `runMasked`), unchanged. |
| `secretsRefusal` `:311-313` | Unchanged (the script with a synced link, and the OS check). Its doc: the script path and the local road; a linked command goes over SSH (E3.S1). |
| `resolvedRefs` `:369-371` | The literal becomes `NO_REFERENCE(job.entry.name)`; same text. |
| new `runSecretsOverSsh`, `spawnOverSsh`, `trustedThenSpawned`, `maskedOverSsh` | §S1.1 step 4 and 5. `maskedOverSsh(sessions, run)` — `run` a small record `{ job, plan, refs, ready, launch, resolved, spawn }` — is the ONLY function that calls `handOverToRun` and `runInMaskedTerminal`, in the one synchronous block of §S1.1 (keep each ≤ 50 lines, complexity ≤ 4, parameters ≤ 4). No `showWarningMessage` for `spawn.warning` (E3-D12). |
| file doc of Run with Secrets `:288-298` | One paragraph: a linked command runs over SSH (E3.S1): the order, ssh by argv, the script on stdin, local window only, the banner. |

**Test helpers**

| File | Change |
|---|---|
| `test/arrowWorld.ts` `:23` and `:134` | The `masked` record type takes the new options (`argv?`, `env`, `stdinText?`, `secrets`, `banner`, `onEnded?`, `commandLine?`). `ArrowOptions` gains `remoteName?: string`, set on the stub's `env.remoteName` (absent = a local window). Expose `events` pushes: the mock of `runInMaskedTerminal` pushes `'spawn'` into the road's shared `events` when the test passes one (`ArrowOptions.events?: string[]`); the vault's `refSource` read pushes `'resolve'` the same way (wrap `vaultOf`'s source in the test). `ArrowOptions` also gains `onMasked?: (options: <the masked record>) => void`, called by the mock AFTER it records the run: a test throws from it (a failed terminal creation, O5) or calls `options.onEnded?.()` in it (a run that ended while being created, O8). |
| `test/sshRoadWorld.ts` `fakeRoad` `:76-` | `prepare(accountId, ssh, use)` records `use` in a NEW array `uses: string[]` (NOT in `calls`: E2 tests deep-equal `calls`). New `spawnLaunch(ssh, env)` → `{ program: 'ssh', env: { ...(env ?? {}) }, warning: spawnWarning }` (`warning` key absent when `spawnWarning` is undefined), recorded in `launches`; `spawnWarning` is a new LAST parameter of `fakeRoad` (`fakeRoad(script, lookup, events, spawnWarning?)`), so E2's calls are unchanged. New `cleanupCalls: string[]`: one `'<sshId>#<n>'` per call of a ready's `cleanup`, repeats INCLUDED (`cleaned` keeps recording only the call that did something, `:107-112`), so a test can see "exactly once" through an idempotent cleanup. |

**The road scan — `test/launchRoadScan.test.ts`** (same commit; the stale-entry test forces it)

| List | Change |
|---|---|
| `SENDS` `:20` | Add `/\brunInMaskedTerminal\s*\(/g`: the linked road calls the masked run directly, and no pattern saw it. |
| `ALLOWED_SENDS['commands/runCommands.ts']` `:136-141` | Add `{ line: 'runInMaskedTerminal({', because: 'Run with Secrets: the local child through its shell (runMasked), and the linked child by argv with the script on stdin (E3.S1)', count: 2 }`. `runMasked(host, job, refs);` and its declaration stay (the local road). |
| `ALLOWED_SENDS['maskedTerminal.ts']` `:178` | The spawn line's new text `const child = childProcess.spawn(launch.program, launch.args, {`, `because: 'the masked child of Run with Secrets: through a shell (local) or by argv with shell false (over SSH, E3.S1)'`; add `export function runInMaskedTerminal(options: MaskedRunOptions): vscode.Terminal {` (`because: 'the declaration'`). |
| `REFUSAL_SITES` `:189-195` | Unchanged: `commands/runCommands.ts:secretsRefusal` STAYS (the script path). |
| `RESOLVE_IMPORTERS` `:103` | Unchanged in S1, and `commands/runCommands.ts` STAYS in it after E3 (E3-D13: `LaunchPlan` is not changed; the local road's `parts` and E2's `arrowLine` resolve locally). S2 removes only `agentUseActions.ts`. Its failure message (`:107`) stays. |
| self-check `:214-226` | Add `assert.equal(sitesIn('literal.ts', 'x = runInMaskedTerminal\n(\n {})', SENDS).length, 1);`. |

**Existing tests whose expected values change**

- `test/sshLinkRoads.test.ts` W2 (`:55`) and W2b (`:65`): the road now exists and `s1` is not in that world, so the
  warning is `sshLinkOf(LINKED, () => undefined).reason` (read from the function, never retyped); still no masked run and
  `vault.calls` `[]`. Rename both to `run_with_secrets_refuses_a_linked_entry_whose_ssh_entry_is_missing_…`.
- `test/sshRoadHelp.test.ts` `EN_BULLET` (`:35-36`) and `CHAIN_BULLET` (`:64-70`): the second sentence becomes the S1
  text below, in each language.
- Any OTHER existing test that goes red: stop and report; do not edit an expected value.

**The help ×5** (`help<Lang>.ts:84`, article `basics`, the `- **terminal**` bullet; double-quoted strings: no `"` in the
texts; UI labels in English in every language, `CLAUDE.md` rule 7). Replace only the bullet's sentence about the roads
that still refuse (do not reorder the list before it: `test/sshRoadHelp.test.ts:59` forbids `*Run All in Folder*, `):

| Lang | Old sentence | New sentence |
|---|---|---|
| EN | `*Run with Secrets* and an agent's run still refuse such an entry and say why.` | `*Run with Secrets* runs it there too, from a local window; an agent's run still refuses such an entry and says why.` |
| DE | `*Run with Secrets* und der Lauf eines Agenten lehnen einen solchen Eintrag weiterhin ab und sagen warum.` | `*Run with Secrets* führt sie dort ebenfalls aus, aus einem lokalen Fenster; der Lauf eines Agenten lehnt einen solchen Eintrag weiterhin ab und sagt warum.` |
| ES | `*Run with Secrets* y la ejecución de un agente siguen rechazando esa entrada y dicen por qué.` | `*Run with Secrets* también la ejecuta allí, desde una ventana local; la ejecución de un agente sigue rechazando esa entrada y dice por qué.` |
| RU | `*Run with Secrets* и запуск агентом пока отказывают такой записи и объясняют почему.` | `*Run with Secrets* тоже выполняет её там, из локального окна; запуск агентом пока отказывает такой записи и объясняет почему.` |
| UK | `*Run with Secrets* і запуск агентом поки відмовляють такому запису й пояснюють чому.` | `*Run with Secrets* теж виконує його там, із локального вікна; запуск агентом поки відмовляє такому запису й пояснює чому.` |

And the article `secret-references`, field `usage` (`help<Lang>.ts:180`): append at its end:

- EN: ` For an entry set to run over SSH, the values go to the server's login shell on its standard input as export lines — never on a command line, never in the server's process list or history — and the output is masked the same way. That run is not interactive: the command's input is empty, so a command that asks a question usually stops; use *Run in Terminal* for such a command (the values are then not injected). It works only in a local VS Code window.`
- DE: ` Für einen Eintrag, der über SSH laufen soll, gehen die Werte als export-Zeilen über die Standardeingabe an die Login-Shell des Servers — nie auf eine Befehlszeile, nie in die Prozessliste oder den Verlauf des Servers —, und die Ausgabe wird genauso maskiert. Dieser Lauf ist nicht interaktiv: Die Eingabe des Befehls ist leer, darum hält ein Befehl, der eine Frage stellt, meist an; nutzen Sie für einen solchen Befehl *Run in Terminal* (die Werte werden dann nicht eingesetzt). Das geht nur in einem lokalen VS-Code-Fenster.`
- ES: ` En una entrada que se ejecuta por SSH, los valores van a la shell de inicio de sesión del servidor por su entrada estándar como líneas export — nunca en una línea de comandos, nunca en la lista de procesos ni en el historial del servidor — y la salida se enmascara igual. Esa ejecución no es interactiva: la entrada del comando está vacía, así que un comando que hace una pregunta suele detenerse; use *Run in Terminal* para ese comando (los valores no se inyectan entonces). Solo funciona en una ventana local de VS Code.`
- RU: ` Для записи, которая выполняется через SSH, значения идут в оболочку входа сервера через её стандартный ввод строками export — никогда не в командную строку, никогда в список процессов или историю сервера, — а вывод маскируется так же. Такой запуск не интерактивен: ввод команды пуст, поэтому команда, которая задаёт вопрос, обычно останавливается; для такой команды используйте *Run in Terminal* (значения тогда не подставляются). Это работает только в локальном окне VS Code.`
- UK: ` Для запису, що виконується через SSH, значення йдуть до оболонки входу сервера через її стандартне введення рядками export — ніколи не в командний рядок, ніколи в список процесів чи історію сервера, — а виведення маскується так само. Такий запуск не інтерактивний: введення команди порожнє, тож команда, що ставить запитання, зазвичай зупиняється; для такої команди використовуйте *Run in Terminal* (значення тоді не підставляються). Це працює лише в локальному вікні VS Code.`

Check the line numbers of `secret-references` in each file before the edit (`grep -n "'secret-references'"`: 175 in all
five on a5ddd73; `usage` is the fifth line after it).

**README** (`src_vs_code/README.md`)
- `:256-260` (the *Runs over SSH* bullet): `*Run with Secrets* and an agent's run still refuse such an entry` → *Run with
  Secrets* runs it there too, from a local window; an agent's run still refuses such an entry (wrapped like its neighbours).
- `## Secret references and *Run with Secrets*` (`:379-`): one paragraph at its end, the EN `usage` sentences above.

**research/**
- `research/module_extension.md` `:2367-2369` ("The agent's `creds_run` (`capturedRun`) and *Run with Secrets* spawn on
  THIS machine"): add "— unless the entry runs over SSH (E3)".
- `:2393-2400` ("The refusal on every road"): Run with Secrets leaves the caller list, except a SCRIPT that a sync linked.
  `:2248` ("It is still called by Run with Secrets, the agent's run, …"): the same.
- A new paragraph after the E2.S3 paragraph (`:2437-2455`, before `### Which shell parses the line` at `:2457`), **Run
  with Secrets over SSH (E3.S1)**: the order; the checks before prepare (plan, local window, no reference);
  `prepare(…, 'spawn')` and why (E3-D4); `secretsLaunch` (argv, `-o BatchMode=yes` or askpass, `ConnectTimeout=10`,
  `SECRETS_REMOTE_COMMAND` last); `secretsRemoteLine` (E3-D2); the script on stdin then end of input; `spawnLaunch`
  (E3-D5) and its warning as a banner line (E3-D12); the one owner and the once-only `handOverToRun` with `onEnded`
  (E3-D7); what ends the run (E3-D11: the close kills through `childKill`, the end destroys stdin); the child's environment
  holds no value (E3-D8) and the askpass variables are the known `SendEnv` limit of `:221` (link that paragraph, do not
  repeat it); the banner.
- `research/module_tests.md`: a new section `## Run with Secrets and the agent's run over SSH (E3 of PLAN_terminal_command_over_ssh.md)`
  after the E2 section (`:1374-1391`, before `## The composer for a Terminal entry over SSH` at `:1392`), the run command,
  one row per new test file, a **Teeth** line and a **Not covered** line (a real sshd, a Windows local host with a password
  entry, the POSIX jump helper after a close: hand check 3). The `:1365` row ("The refusal on every road") says which
  roads still refuse (the agent's run until S2; a linked script; an agent's VPN start).

### S1.4 Line budget (checked before the first edit)

| File | Now | After S1 | Ceiling | How |
|---|---|---|---|---|
| `extension.ts` | 1003 | ≤ 1003 | ratchet 1003 | edits in place only; it shrinks |
| `commands/runCommands.ts` | 436 | about 520 | 800 | — |
| `remoteLaunch.ts` | 369 | about 430 | 800 | — |
| `maskedTerminal.ts` | 172 | about 230 | 800 | — |
| `sshRoad.ts` | 226 | about 260 | 800 | — |
| `help<Lang>.ts` | 319 each | 319 each | 800 | in-place string edits |

### S1.5 What the tests must not get wrong

- **A value under 8 characters is never masked** (`MIN_MASKABLE_LENGTH`, `secretMasker.ts:28`). Every value a masking test
  asserts on is at least 12 characters; one test asserts `value.length >= MIN_MASKABLE_LENGTH` for its own fixture.
- **The fake road's ready is the real shape**: `sshRoadWorld.ts` already checks `const assignable: ReadySsh`; a
  `secretsLaunch` test builds its prepared session with `fakeRoad`'s `readies[0]` or asserts once that its fixture is
  assignable to `PreparedForSpawn`.
- **No hand-typed argv.** Expected argv is `buildSshExecArgv(…)` called in the test with the same inputs; expected
  stdin is `secretsStdin(…)`; the remote command is `SECRETS_REMOTE_COMMAND`.
- **One positive per file** (testing.md): `sshRoadSecrets.test.ts` holds the happy run S7, which fails when the fixture
  is wrong.
- **Every real-child test is bounded, and kills what it started** (round 1, items 1 and 7). In `test/maskedTerminal.test.ts`
  every NEW test is `test(name, { timeout: 15_000 }, async () => …)` and waits with a new helper
  `closedWithin(w, ms)` instead of `closed(w)` (`:93-106`, whose 20-second wait kills nothing): it polls `w.exitCode()`
  every 10 ms; at `ms` (5 000 unless a row says otherwise) it calls `w.pty().close()` — which is `killChild(child,
  { tree: true })` — waits up to `KILL_GRACE_MS + 1_000` for the exit code, and then rejects with
  `child never closed within <ms> ms; killed; output so far: <written>`. So a RED test fails in seconds, on its own
  message, and leaves no process behind. Existing tests keep `closed(w)`.
- **"Exactly once" is counted through a counter, never through an idempotent cleanup**: `onEnded` with a counter in
  `maskedTerminal.test.ts`; `fakeRoad`'s `cleanupCalls` (every call) beside `cleaned` (every call that did something).

### S1.6 Scenarios — RED first

Write each test, run it, watch it fail for the reason in "RED today", then build. For a new export, first add a stub
(`return { kind: 'refused', reason: '' }`, `return ''`) so the test fails on its assertion, not on a missing name.
`LINKED` = `{ id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'printenv', commandArgs: [{ value: 'creds://me/alert/password' }], sshEntityId: 's1' }`;
`S1` = `sshNode('s1')`; the vault is `vaultOf(['alert'], () => ({ kind: 'value', value: 'correct-horse-battery-staple' }))`
(`test/arrowWorld.ts:160`); `PLAN` = `planLaunch(LINKED, sshLinkOf(LINKED, lookup), { stayOpen: false })`; `r1` is the
fake road's first ready.

**`test/secretsLaunch.test.ts`** (new, pure)

| # | Test | Assertion | RED today |
|---|---|---|---|
| K1 | `the_argv_ends_with_the_remote_login_shell_reading_stdin_after_the_destination` | for a key ready (`entity.sshKeyPath: '/keys/s1.key'`, no env): `kind 'spawn'`; argv deep-equals `buildSshExecArgv(entity, '/keys/s1.key', SECRETS_REMOTE_COMMAND, 'key', { jump, knownHostsFile })`; its last element is `SECRETS_REMOTE_COMMAND`; the two before it are `--` and `deploy@prod.example`; no element is `-t`; it holds the pair `-o`, `ConnectTimeout=10` and the pair `-o`, `BatchMode=yes` (E3-D11 (a): the words are SENT); `target === 'deploy@prod.example'` | no export |
| K2 | `a_password_session_uses_askpass_one_prompt_and_a_connect_timeout` | ready with `env` set: argv holds `NumberOfPasswordPrompts=1` and `ConnectTimeout=10`, not `BatchMode=yes`; no element holds the password value of `env` | no export |
| K3 | `a_pinned_host_is_enforced` | `options.knownHostsFile: '/keys/kh-s1'`: argv holds `StrictHostKeyChecking=yes` and `UserKnownHostsFile=/keys/kh-s1`; without it, `StrictHostKeyChecking=accept-new` | no export |
| K4 | `the_jump_and_the_forwards_are_the_trust_lines` | an SSH entry with `agentForward: true`, one enabled `-L` forward and `jump 'deploy@bastion'`: every word of `sshOptionArgv(entity, jump)` appears in the argv, in that order (the trust line's words, so what was approved is what connects) | no export |
| K5 | `a_relay_prefix_or_a_client_program_is_refused_as_not_local` | `prefix: 'env SSH_AUTH_SOCK=… '` → `refused` with `secretsLocalOnly('deploy')`; the same for `options.program: '/mnt/c/…/ssh.exe'` | no export |
| K6 | `an_entity_with_no_safe_host_is_refused_with_the_no_host_sentence` | `entity.host: '-oProxyCommand=x'` → `refused` with `noHostSentence('prod box')` | no export |
| K7 | `the_remote_line_reads_each_reference_from_the_posix_environment` | `secretsRemoteLine(PLAN, planRefs([PLAN.line]))` equals `'printenv "$CREDS_REF_1"'`; it holds no `creds://` | no export |
| K8 | `the_banner_is_exact_and_names_the_target` | `secretsOverSshBanner('deploy@prod.example:2222', [{ value: 'x'.repeat(12), label: 'CREDS_REF_1' }])` equals the E3.0 text literally, with `<caveat>` empty; with a 6-character value it holds `shortValuesCaveat(…)` and names `CREDS_REF_1` | no export |
| K9 | `the_short_value_caveat_is_the_words_the_local_banner_had` | `maskingBanner(secrets)` (from `../extension`, through the stub) still includes `shortValuesCaveat(secrets)` for a short value — the local banner did not change | no export |
| K10 | `the_launch_warning_is_a_banner_line_before_the_secrets_text` | `maskedOverSshBanner('CREDS_REF_1 = password of me/alert', NO_AGENT_TO_FORWARD, 'deploy@prod.example', S)` with `S = [{ value: 'x'.repeat(12), label: 'CREDS_REF_1' }]` equals `['CREDS_REF_1 = password of me/alert', `Note: ${NO_AGENT_TO_FORWARD}.`, secretsOverSshBanner('deploy@prod.example', S)].join('\r\n')`; with `warning` undefined it equals the first and the last joined by `\r\n` (no empty line, no `Note:`) | no export |

**`test/maskedTerminal.test.ts`** (append; its `world()`, a real child, as the file's doc says). POSIX only (`/bin/sh`): on
win32 each new test is skipped with a printed reason. Every new test is bounded per §S1.5 (`{ timeout: 15_000 }` and
`closedWithin`). `world()` gains an optional `mocks` argument passed to `loadWithVscode` (`test/vscodeStub.ts:16-28`,
keyed by the request string `maskedTerminal.ts` writes): `spawnSpy(w)` = `{ 'node:child_process': { ...childProcess,
spawn: (...a) => { const c = childProcess.spawn(...a); w.children.push(c); return c; } } }` and `killSpy(w)` =
`{ './childKill': { ...childKill, killChild: (c, o) => { w.kills.push(o); childKill.killChild(c, o); } } }` (`w.children`,
`w.kills` new arrays on the world). A helper `runArgv(w, options)` is `run()` (`:76-91`) with `argv`, `stdinText`,
`onEnded` in place of `commandLine`/`shell`, and it does NOT wait (each test waits with `closedWithin`).

| # | Test | Assertion | RED today |
|---|---|---|---|
| M1 | `argv_mode_runs_no_shell` | `argv: ['/bin/echo', '$HOME;id']`: the screen shows `$HOME;id` literally | `argv` is ignored, `commandLine` undefined: the spawn fails |
| M2 | `stdin_text_is_written_once_then_closed` | `argv: ['/bin/sh', '-c', 'cat; echo END']`, `stdinText: 'hello-from-stdin\n'`; `await closedWithin(w, 3_000)`: the screen holds `hello-from-stdin` then `END`, and `[exit 0]` (cat ended, so stdin was closed) | no stdin write: `cat` waits; at 3 s `closedWithin` closes the pty (`killChild`, tree) and rejects `child never closed within 3000 ms; killed; …` — the test fails in about 3 s and no `cat` is left (round 1, item 7) |
| M3 | `keystrokes_are_not_forwarded_when_stdin_is_a_script` | M2's child with `sleep 1` before `cat`; `pty.handleInput('typed\r')` during the sleep: the screen does not hold `typed` | `typed` is echoed and written |
| M4 | `on_ended_is_called_once_when_the_child_exits` | `argv: ['/bin/true']`, a counter: after the close, `1` | no option |
| M5 | `on_ended_is_called_once_when_the_program_does_not_exist` | `argv: ['/nonexistent/ssh-xyz']`: the screen says it could not start, and after both `error` and any `close` (wait 200 ms after the exit code), the counter is `1` | no option |
| M6 | `on_ended_is_called_once_when_the_terminal_closes_before_the_child_starts` | `pty.close()` before `pty.open()`: counter `1` | no option |
| M6b | `a_run_closed_before_it_started_never_spawns_or_writes` | with `spawnSpy`: `pty.close()`, then `pty.open()` (VS Code should not, the code must not care): `w.children` `[]`, counter still `1`, the screen holds the banner at most | `open()` spawns after the close |
| M7 | `the_env_of_argv_mode_reaches_the_child` | `argv: ['/bin/sh', '-c', 'printf %s "$ASKPASS_PROBE"']`, `env: { ASKPASS_PROBE: 'probe-value-1234' }`: shown | `argv` ignored |
| M8 | `end_to_end_values_echoed_to_stdout_and_stderr_are_masked` | A fake `ssh` in an `ownedDir(t, 'ssh')` (the pattern of `test/remoteLaunchDelivery.test.ts:66-80`): it records its argv NUL-separated and its environment (`env -0`) to two files, skips its options to `--`, skips the destination, and runs the last argument with `/bin/sh -c` (what sshd does with an exec request), stdin inherited. Run `argv: [fake, ...secretsLaunch(PLAN, ready).argv]`, `env: {}`, `stdinText: secretsStdin(env, 'printf "%s\\n" "$CREDS_REF_1"; printf "%s\\n" "$CREDS_REF_2" >&2')` with `CREDS_REF_1 = "it's $HOME \"quoted\" value"` and `CREDS_REF_2 = 'second-secret-value-42'`, `secrets` both with their labels. The screen holds `<CREDS_MASKED:CREDS_REF_1>` and `<CREDS_MASKED:CREDS_REF_2>` and neither raw value; the recorded argv holds neither value; the recorded environment holds neither value | no argv mode |
| M9 | `closing_the_terminal_kills_a_stalled_child_and_drops_the_unwritten_script` (round 1, item 1) | with `spawnSpy` and `killSpy`: `argv: ['/bin/sh', '-c', "echo PID=$$; trap '' TERM; exec sleep 300"]` (the shell becomes `sleep`, same pid, and `SIGTERM` stays ignored across `exec`), `stdinText: 'x'.repeat(4 * 1024 * 1024)` (more than a pipe takes; `sleep` never reads), a counter. Wait for `PID=<n>` on the screen (≤ 3 s), then `pty.close()`; `await closedWithin(w, KILL_GRACE_MS + 3_000)`. Then: the screen ends with `[exit killed]`; the counter is `1`; `w.kills` deep-equals `[{ tree: true }]`; `process.kill(n, 0)` throws `ESRCH`; `w.children[0].stdin.destroyed === true` | no argv mode |
| M10 | `a_terminal_that_cannot_be_created_throws_and_never_spawns` (round 1, item 5) | a world whose `createTerminal` throws `new Error('no terminal')`, with `spawnSpy`: `runInMaskedTerminal(…)` throws that error; the counter stays `0` (the caller cleans, E3-D7); `w.children` `[]` | (green before and after: a guard that pins E3-D7's "a throw from `createTerminal` is the caller's" — say so) |
| M11 | `the_ssh_childs_environment_holds_no_secret_value` (round 1, item 4; D12) | M8's fake `ssh` and launch, with `env` = a password session's askpass set `{ SSH_ASKPASS: '/keys/askpass.sh', SSH_ASKPASS_REQUIRE: 'force', CREDS_SSH_PASSWORD: 'ssh-entry-password-77' }` and the resolved values `CREDS_REF_1 = 'first-secret-value-0001'`, `CREDS_REF_2 = 'second-secret-value-42'` ONLY in `stdinText`: the environment the fake recorded (`env -0`, split on NUL) holds no entry whose value contains either resolved value and no name starting `CREDS_REF_`; it DOES hold `SSH_ASKPASS_REQUIRE=force` (the positive control: the recording works). The askpass password IS there — the accepted limit (E3-D8), asserted present, not hidden | no argv mode |

**`test/sshRoad.test.ts`** (append; its `loadWithVscode` world)

| # | Test | Assertion | RED today |
|---|---|---|---|
| H6 | `a_spawn_preparation_never_relies_on_the_agent` | `servesKeyForEntity` answers true; `prepare(acct, ssh, 'spawn')` → the mocked `prepareSshSession` got `agentServesKey === false` and `isolate === true`; `prepare(acct, ssh)` still gets `true` | the third argument is ignored |
| H7 | `spawn_launch_names_the_built_in_client_and_the_extensions_agent_for_a_forwarding_entry` | `agentSocket: () => '/tmp/agent.sock'`, `ssh.agentForward: true`: `program` equals `openSshBinary('ssh', true, process.platform)`; `env.SSH_AUTH_SOCK === '/tmp/agent.sock'`; the askpass `env` passed in is merged; without forwarding, no `SSH_AUTH_SOCK` | no method |
| H8 | `hand_over_to_run_leaves_the_list_and_answers_a_once_only_cleanup` (round 1, item 5) | `r` with a COUNTING `cleanup` (not idempotent: it counts every call); `own(r)`; `const ended = handOverToRun(r)`; `cleanAll()` → count 0; `ended(); ended()` → count 1 | no method |
| H9 | `a_hand_over_of_a_session_never_owned_still_cleans_once` | no `own`; `handOverToRun(r)()` twice → count 1; a later `cleanAll()` → still 1 | no method |

**`test/sshRoadSecrets.test.ts`** (new; `arrowWorld({ others: [S1, alert], sshRoad: road, events }, [], vault.source)` and `aw.runWithSecrets(LINKED)`)

| # | Test | Assertion | RED today |
|---|---|---|---|
| S1 | `the_order_is_prepare_trust_dependencies_resolve_spawn` | `LINKED` + `dependsOn: ['dep']`, `runDependencies: true`, `dep` a trusted local step; trust modal answered Run: one ordered `events`: `prepare s1#1`, the trust modal, `dep` executed, `resolve`, `spawn` | E1's sentence, nothing |
| S2 | `no_child_and_no_value_before_the_trust_answer` | the trust modal HELD: `aw.masked` `[]`, `vault.calls` `[]`, `road.calls.length === 1`; then answered: one masked run | E1's sentence |
| S3 | `the_child_is_ssh_by_argv_with_no_value_in_argv_or_env` | after the run: `masked[0].argv` deep-equals `['ssh', ...secretsLaunch(PLAN, r1).argv]`; `commandLine` undefined; no element of `argv` and no value of `env` holds `correct-horse-battery-staple`; `road.uses` deep-equals `['spawn']` | E1's sentence |
| S4 | `stdin_carries_the_exports_and_the_line_in_a_group_then_exit` | `masked[0].stdinText === secretsStdin({ CREDS_REF_1: 'correct-horse-battery-staple' }, 'printenv "$CREDS_REF_1"')`; it holds `} </dev/null` and ends with `exit $?\n` | E1's sentence |
| S5 | `the_output_is_masked_and_the_banner_says_not_interactive` | `masked[0].secrets` deep-equals `[{ value: 'correct-horse-battery-staple', label: 'CREDS_REF_1' }]`; `masked[0].banner` ends with `secretsOverSshBanner(r1.target, masked[0].secrets)` and holds no `Note:` (the fake road gives no warning) | E1's sentence |
| S6 | `trust_is_asked_on_the_trust_line_and_one_approval_covers_the_arrow` | the modal text includes `trustLineFor(r1.entity, r1.jump, PLAN.line)`; afterwards `isCommandTrusted(aw.trust, 'e1', thatLine)` true; a local trust of `PLAN.line` alone does NOT skip the modal | E1's sentence |
| S7 | `a_linked_entry_runs_with_secrets_over_ssh` | the happy run, trusted: one masked run; `cleaned` `[]` and `road.cleanupCalls` `[]` after the road returned (the run owns it now; the owner's `finally` did not touch it); then `masked[0].onEnded()` twice → `road.cleanupCalls` `['s1#1']` (exactly one call) | E1's sentence |
| S8 | `a_password_entry_puts_askpass_in_the_child_env_never_in_argv` | script `{ password: true }`: `masked[0].env` includes every key and value of `r1.env`; `argv` holds `NumberOfPasswordPrompts=1`; no `argv` element holds `r1.env.CREDS_ASKPASS_PASSWORD` (the fake road's name for the password variable, `test/sshRoadWorld.ts:54`; the real one is `CREDS_SSH_PASSWORD`, `sshAskpass.ts:45`) | E1's sentence |
| S9 | `the_child_env_is_the_askpass_and_agent_variables_only_and_holds_no_value` (round 1, item 4; E3-D8) | for a key session and for `{ password: true }`: every key of `masked[0].env` is a key of `r1.env ?? {}` or `SSH_AUTH_SOCK`; no key starts with `CREDS_REF_`; no value contains `correct-horse-battery-staple`; and `masked[0].stdinText` DOES contain it (the value went somewhere: stdin, and only there) | E1's sentence |
| S10 | `the_spawn_warning_is_in_the_banner_and_no_toast_races_the_run` (round 1, item 3; E3-D12) | `fakeRoad(…, …, events, NO_AGENT_TO_FORWARD)`, `recordDialogs(aw, events)` (`test/sshRoadWorld.ts:119-128`): `masked[0].banner === maskedOverSshBanner(described, NO_AGENT_TO_FORWARD, r1.target, masked[0].secrets)` with `described` = the banner's first line; the `Note:` line comes before `secretsOverSshBanner(…)`; `events` holds no `dialog:` entry that includes `NO_AGENT_TO_FORWARD` | E1's sentence |
| O1 | `owner_a_declined_trust_spawns_nothing_and_cleans` | modal `'dismiss'`: `aw.masked` `[]`, `vault.calls` `[]`, `cleaned` `['s1#1']` | `road.calls` is 0 (E1) |
| O2 | `owner_a_cancelled_dependency_spawns_nothing_and_cleans` | S1's world, the chain modal answered `undefined`: `masked` `[]`, `vault.calls` `[]`, `cleaned` `['s1#1']` | E1's sentence |
| O3 | `owner_a_failed_resolution_spawns_nothing_and_cleans` | a reference to `creds://me/gone/password` (no such entity): the error message is today's `Nothing was run: …`; `masked` `[]`; `cleaned` `['s1#1']` | E1's sentence |
| O4 | `owner_a_thrown_error_cleans` | a `refSource` that throws: `await assert.rejects(aw.runWithSecrets(LINKED))`; `cleaned` `['s1#1']` | E1's sentence, no throw |
| O5 | `owner_a_failed_terminal_creation_cleans_exactly_once` (round 1, item 5) | `onMasked` throws: `aw.runWithSecrets(LINKED)` rejects with that error; `road.cleanupCalls` `['s1#1']` — ONE call (the road's `catch`), not two (the owner's `finally` no longer holds the session) | E1's sentence |
| O8 | `owner_a_run_that_ended_while_its_terminal_was_made_and_then_threw_cleans_once` (round 1, item 5) | `onMasked` calls `options.onEnded()` and then throws: rejects; `road.cleanupCalls` `['s1#1']` | E1's sentence |
| O9 | `owner_a_close_before_start_cleans_once_and_a_late_end_does_nothing` (round 1, item 5) | `onMasked` calls `options.onEnded()` (the terminal closed before its child started) and returns: the road resolves; `road.cleanupCalls` `['s1#1']`; then the test calls `masked[0].onEnded()` again → still `['s1#1']` | E1's sentence |
| O6 | `a_stopped_preparation_asks_nothing_and_spawns_nothing` | script `'stopped'`: no modal, `masked` `[]`, `refusedShown` 0 | E1's sentence |
| O7 | `a_refused_preparation_shows_the_remedy_and_spawns_nothing` | script `'refused'`: `refusedShown` 1, no trust modal, `masked` `[]` | E1's sentence |
| N1 | `snapshot_a_host_changed_during_the_trust_question_does_not_reach_the_child` | modal held; `aw.nodes['s1']` REPLACED with host `evil.example`; answered Run: `masked[0].argv` holds `deploy@prod.example` and nothing holds `evil`; `aw.reads('s1')` after `prepare` returned is 0 | E1's sentence |
| R1 | `a_windows_remote_is_refused_before_prepare` | `terminalOs: 'windows'`: the warning is `PLAN.reason` of that entry; `road.calls` `[]`; `vault.calls` `[]` | E1's sentence |
| R2 | `a_remote_window_is_refused_before_prepare` | `remoteName: 'ssh-remote'`: warning `secretsLocalOnly('deploy')`; `road.calls` `[]` | E1's sentence |
| R3 | `no_reference_is_said_before_prepare` | `commandArgs` without a reference: warning `NO_REFERENCE('deploy')`; `road.calls` `[]` | E1's sentence |
| R4 | `a_missing_ssh_entry_says_why_and_prepares_nothing` | no `S1` in storage: warning `sshLinkOf(LINKED, () => undefined).reason`; `road.calls` `[]`; `vault.calls` `[]` | E1's sentence differs |
| R5 | `a_linked_script_is_still_refused_with_the_shared_sentence` | a SCRIPT entry with `sshEntityId: 's1'`: warning `sshLinkRefusal(script)`; `road.calls` `[]` — a guard, GREEN before and after; say so | (green) |
| R6 | `an_unlinked_command_runs_here_as_before` | `LINKED` without `sshEntityId`: one masked run with `commandLine` set, `argv` undefined, `env.CREDS_REF_1` set — the local road unchanged; GREEN before and after | (green) |

**`test/sshRoadHelp.test.ts`** (append)

| # | Test | Assertion | RED today |
|---|---|---|---|
| Hp6 | `every_language_says_run_with_secrets_runs_over_ssh_from_a_local_window` | each language's `basics` body includes the S1 sentence of its row above; the `secret-references` body (`bodyFor`, `fallback === false`) includes `*Run in Terminal*` and `export` | absent |
| Hp7 | `the_english_secrets_text_is_exact` | the EN `secret-references` body includes the EN `usage` text above, literally | absent |

**`test/linkedNeverLocal.test.ts`** (new; parent §4.5 (5), added by the epoch-3 re-review). The road scan reads imports, not
where a resolved line flows, and `commands/runCommands.ts` resolves the line before it reads the link (`runEntryLine` →
`arrowLine` → `sshLinkOf`; `secretsJobAt` → `commandJob`). These tests hold the guarantee instead. The three links: VALID
(`S1` in storage, a fake road that answers ready), MISSING (no `S1`), REFUSED (`S1` is not an SSH entry, or has the host
`-oProxyCommand=x`: `sshLinkOf` answers `refused`). `BARE` = `resolveCommand(LINKED)`'s line, read in the test. The local
sinks: the arrow's `typeIntoEntryTerminal` (seen as a terminal whose `sent` holds `BARE` as one whole send) and the local
masked run (seen as an `aw.masked` record with `commandLine` set).

| # | Test | Assertion | RED proof |
|---|---|---|---|
| LN1 | `the_arrow_never_types_the_bare_line_of_a_valid_link` | VALID, trusted: no terminal's `sent` holds an element equal to `BARE`; the one send equals the composed line (`typedLine`) | GREEN on E2's code; RED with the bypass: the routing in `runEntryLine` made `runLocalLine` for every link |
| LN2 | `the_arrow_never_types_the_bare_line_of_a_missing_link` | MISSING, trusted: no terminal sent anything; the warning is `sshLinkOf`'s reason | the same bypass |
| LN3 | `the_arrow_never_types_the_bare_line_of_a_refused_link` | REFUSED (each of the two cases), trusted: no terminal sent anything | the same bypass |
| LN4 | `run_with_secrets_never_runs_a_valid_link_here` | VALID, trusted: no `aw.masked` record has `commandLine`; the one record has `argv` | RED with the bypass: `runWithSecrets` sends every link to `runSecretsHere` AND `secretsRefusal` skips `sshLinkRefusal` (both walls, parent §4.5 (5)) |
| LN5 | `run_with_secrets_never_runs_a_missing_link_here` | MISSING: `aw.masked` `[]`; `vault.calls` `[]` | the same bypass |
| LN6 | `run_with_secrets_never_runs_a_refused_link_here` | REFUSED (each case): `aw.masked` `[]`; `vault.calls` `[]` | the same bypass |

Each bypass is a temporary local edit, run once, never committed. The summary of S1 names each RED message and the pass.
LN1-LN3 are guards of E2's merged code, written in S1 because S1 changes the routing in the same file.

### S1.7 Commands

From the repository root (`CLAUDE.md` §Commands; `common/local-cpu-budget.md`):

```bash
LP=$PWD/.agents/conventions/tools/low-priority.mjs
cd src_vs_code
node $LP npm run typecheck
node $LP npm run lint
node $LP npm run compile
node $LP node --test out/test/secretsLaunch.test.js out/test/maskedTerminal.test.js out/test/sshRoad.test.js out/test/sshRoadSecrets.test.js out/test/sshRoadHelp.test.js out/test/linkedNeverLocal.test.js
node $LP node --test out/test/launchRoadScan.test.js out/test/commandRoadScan.test.js out/test/sshLinkRoads.test.js out/test/remoteLaunch.test.js out/test/remoteLaunchDelivery.test.js out/test/sshRoadArrow.test.js out/test/sshRoadFolder.test.js out/test/sshRoadChain.test.js out/test/runPlan.test.js out/test/secretMasker.test.js out/test/promptSites.test.js out/test/sizeRatchet.test.js out/test/agentUseActions.test.js out/test/sshExecCommand.test.js
node $LP node scripts/size-ratchet.mjs
```

The lead runs the full `npm test`.

---

## S2 — The agent's run over SSH (non-authorisation brief)

### S2.1 What the Fable spec owns, and what it must answer

The spec [PLAN_terminal_command_over_ssh_E3_S2_security.md](PLAN_terminal_command_over_ssh_E3_S2_security.md) (Fable, a
security judgement outside the quota) owns these and nothing in §S2.2-§S2.5 decides them (its answers: the spec's §0
table; the gate order of item 6 of round 1 is its §2.1 and §4):

1. **The gate.** Parent D2: `findUsableEntry(…, sshEntityId, 'exec')` must answer `usable`. Questions: `findUsableEntry`
   (`mcpEntries.ts:344-356`) searches EVERY account — must the SSH entry be looked up with `accountOnly(source,
   ctx.accountId)` (`mcpEntries.ts:363-371`), and must the answer's account equal the Terminal entry's? Is the rung
   `'exec'` right (it maps to `use`, `mcpEntries.ts:404-419`, the same rung as `terminal`)? A PIN-protected SSH entry
   answers `undefined` there, as a made-up id does — what does the agent hear?
2. **No confused deputy.** The agent's grant names the Terminal entry; running over SSH uses the SSH entry's credential.
   Is the SSH entry's `Usable by agents` switch enough, or must the SSH entry's own consent policy (every time / 12 hours /
   never) also apply — a second consent, or the stricter of the two? Must a remembered Allow (the MCP door's `rungs`,
   `credsAgentServer.ts:522-524`) be keyed on the link too, so a link set later by a sync is not covered by an Allow
   given before it?
3. **The order and TOCTOU.** The consent dialog comes BEFORE `run` (`credsAgentServer.ts:530-537`; E1 S1.7 note (a)).
   Where is the gate checked: in `validate`/`summarize` (they get no target today), at the door, in `run`, or more than
   one of them? What happens when the switch or the link changes while the dialog is open?
4. **The refusal texts.** The parent's sentence is `"<entry>" runs over the SSH connection "<ssh>", which is not open to
   agents. Nothing ran.` Does naming `<ssh>` leak an entry name that is not open to the agent? Must "closed", "PIN
   protected", "missing", "in the Trash", "not an SSH entry", "no safe host" and "another account" be one sentence, so the
   agent cannot probe the vault? `sshLinkOf`'s own sentences (`remoteLaunch.ts:67-94`, `targetRefusal` and `linkTo`) name the SSH entry and the fix:
   may an agent see them? The jump chain's refusal (`resolveJumpChain`'s reason) names a hop: may it? Which of
   `planLaunch`'s refusals (D9 Windows, the line break, `{name}`) come before the gate and which after?
5. **The consent text.** The parent: it names the SSH entry and its target. `UseAction.summarize(body)` (`useActions.ts:139`)
   has no target. Is the change `summarize(body, target)`, or a broker-side lookup? What target string (`describeSshTarget`:
   `user@host:port`, plus the jump)? What is shown for an entry whose link changes between the dialog and the run?
6. **`asksAfterConsent`.** An SSH entry that forwards the agent (`-A`) can raise a signing prompt after the Allow, as
   `sshExecAction` declares (`sshUseActions.ts:228`). Must `terminalRunAction` declare it for a linked entry? (Then
   `test/agentUseActions.test.ts:347` "C.3 … on no other action of this module" changes.)
7. **Masking.** `credsAgentServer` masks every response with the GRANT's table (`credsAgentServer.ts:587-595`). Must the
   SSH entry's password and key be in the table for this call?
8. **The bridge.** A bridge refuses `run` today (`bridgeAllowList.ts:44-65`). Must `terminalRunAction` also refuse a
   linked entry when `ctx.bridge` is set (fail closed if the allow-list changes)?
9. **The audit line.** Does `deps.note` name the SSH entry and the target?
10. **The agent's VPN start** (`creds_vpn_up` with a linked launcher or chain step) stays refused (parent §9; E2-D2). The
    spec says so and why, so the two decisions do not drift.

The spec writes its decisions as a table, the exact sentences, its own RED-first scenarios (the gate's test file
`test/agentSshGate.test.ts`), the help ×5 sentence if it differs from §S2.3, and a fixture `usableSsh(…)` (an SSH node
plus a storage with `getAccounts`) built against the REAL `findUsableEntry` (testing.md: a fixture the code rejects
proves nothing). §S2.5 uses that fixture.

### S2.2 What the road does — the gate FIRST

**The gate runs before any refusal that reads the link or the SSH entry** (round 1, item 6; the spec's §2.1 and §2.3,
which decide it). `planLaunch` is NOT called before the gate: its order is `{name}`/empty → the LINK's refusal (which
names the SSH entry, `remoteLaunch.ts:54-106`) → D9 Windows → the line break (`:174-199`, `:205-215`), so calling it first
would hand the agent `sshLinkOf`'s sentences, and would tell it "Windows" or "line break" about an entry whose SSH
connection it may not use. Until the gate has passed, the agent reads exactly one of three answers: `not_found` (the
Terminal entry itself is gone — the Terminal entry is the agent's) or the one sentence `linkedRunRefused(T)` (the spec's
§4), whatever the reason: missing, another account, in the Trash, not an SSH entry, unsafe host, self, closed, PIN-hidden
— and also a malformed line or a Windows remote on such an entry. On a bridge it is `BRIDGE_NOT_SERVED`, for every linked
entry alike (the spec's §2.1 step 3, before the link is resolved).

`terminalRunAction` (`agentUseActions.ts:188-237`; `run` has 48 of its 50 code lines) becomes a short dispatcher:

1. `entityFor` as today; gone → `not_found` (today's words, `:200-202`).
2. `const gate = linkedCall(deps, ctx, ctx.bridge)` — the spec's gate (§2.1), the ONLY reader of the link in `run`.
   `refused` → `deps.note(journalLine(ctx.entityName, gate.why))`, then `fail(gate.code, gate.message)`. Nothing below runs.
3. The compare, for `local` and `linked` alike (spec §2.3 step 3): `ctx.summary !== undefined && ctx.summary !==
   linkedSummary(gate, entity)` → `fail('denied', changedWhileAsking(ctx.entityName))`. For an entry that was unlinked
   when the dialog stood both are today's words and it passes; a link removed while the dialog stood is refused (spec
   §2.4 row 4, G10 (c)), never run here.
4. `local` (no link) → `runHere(deps, ctx, entity)`: `const plan = planLaunch(entity, { kind: 'none' }, { stayOpen: false })`;
   `empty` → `fail('no_credential', `"${ctx.entityName}" has no command.`)` (today's words); `refused` (only `{name}` can
   reach here) → `fail('not_supported', refusalSaid(entity, plan.reason))`, which is today's `"<T>" will not run: <reason>`;
   `local` → today's `:211-235` with `plan.line` (OS check without `sshLinkRefusal`, trust on the line, slot,
   `capturedRun`), unchanged in behaviour.
5. `linked` → `const plan = planLaunch(entity, gate.link, { stayOpen: false })` — the gate's OWN `link`
   object, so `plan.ssh === gate.link.ssh` and no second `sshLinkOf` runs (D11's bare line: ssh's exit status is the
   command's). `empty` → today's `has no command.`; `refused` → `fail('not_supported', refusalSaid(entity, plan.reason))`
   — only `{name}`, D9 Windows and the line break can reach here, and each names the Terminal entry only; `remote` →
   `runThere(deps, ctx, plan)`:
   - `const chain = resolveJumpChain(plan.ssh, (id) => deps.storage.getNode(ctx.accountId, id)?.details)`; not ok →
     `fail('no_credential', chain.reason)` (spec §2.3 step 5: after the gate, `ssh:exec`'s words).
   - `trustLineFor(plan.ssh, chain.value, plan.line)` not trusted (`isCommandTrusted(deps.trustStore, ctx.entityId, …)`)
     → `untrusted(ctx.entityName, 'the line')` (`:108-113`, today's words). Before the slot, as today.
   - `const release = deps.acquireExecSlot()`; none → `too_many_requests` (today's words).
   - `try { return await deps.overSsh(ctx, { ssh: plan.ssh, jump: () => chain, remoteCommand: plan.remoteCommand,
     timeoutMs: clampExecTimeout(undefined) }); } finally { release(); }`.

`validate` and `summarize` call the same `linkedCall` (spec §2.2), so a refused gate is answered in `validate`, before any
dialog, with the same one sentence.

**ONE SNAPSHOT:** `plan.ssh` is the object `sshLinkOf` read inside the gate, once. The trust line and the argv are built
from it and from `chain`, resolved once; nothing reads the SSH entry again. `resolveExecAuth` reads the CREDENTIAL (the key
entity), which is not the target.

**`execOverSsh(deps)`** (`sshUseActions.ts`, new export; E3-D9) answers `OverSsh = (ctx, call) => Promise<UseActionResult>`:
`prepareAuth(deps, ctx, call.ssh, refuse)` (`:158-182`) → `const chain = call.jump()`; not ok → `refuse('no_credential',
chain.reason)` → `buildSshExecArgv(call.ssh, keyPath, call.remoteCommand, auth, connectionArgvOptions(deps, call.ssh,
chain.value, ctx.bridge !== undefined))` → `agentAwareLaunch(deps, call.ssh, env)` → `runSshExec(argv, { program, env,
timeoutMs: call.timeoutMs, ...launchGuards(deps.signal, ctx) })` → `{ status: 200, body: outcome }`; a throw →
`refuse('internal', `Could not run ssh: …`)`; `finally` → `removeKeyFile(deps, materialized)`. `refuse` =
`bridgedRefusal(deps, ctx)` (`:124-132`). This is `sshExecAction.run`'s body from `prepareAuth` to its `finally`
(`:260-291`), moved: `sshExecAction.run` keeps `entityFor`, `unusableEntity`, the slot and its `release`, and calls
`execOverSsh(deps)(ctx, { ssh: entity, jump: () => resolveJumpChain(entity, …), remoteCommand: body.command, timeoutMs:
clampExecTimeout(body.timeoutMs) })`. The `jump` thunk keeps today's order for `ssh:exec` (the chain is resolved after
the credential). Its tests stay green unchanged; if one goes red, stop and report.

### S2.3 The brief — files

| File | Change |
|---|---|
| `useActions.ts` or `agentUseActions.ts` (`vscode`-free) | `export interface OverSshCall { readonly ssh: EntityMetadata; readonly jump: () => JumpChain; readonly remoteCommand: string; readonly timeoutMs: number }` and `export type OverSsh = (ctx: UseActionContext, call: OverSshCall) => Promise<UseActionResult>`. `JumpChain` = the return type of `resolveJumpChain` (`sshOptions.ts`, pure). |
| `agentUseActions.ts` (437 → about 490) | `terminalRunAction(deps: AgentUseDeps & { onPath?: …; overSsh: OverSsh })`; §S2.2 as small functions (`runHere`, `runThere`, the gate from the Fable spec), each ≤ 50 lines, complexity ≤ 4. Imports: `planLaunch`, `sshLinkOf`, `trustLineFor`, `refusalSaid` from `./remoteLaunch`; `resolveJumpChain` from `./sshOptions`; drop `resolveCommand` and `sshLinkRefusal`. The doc of `terminalRunAction` (`:181-187`): one paragraph on the linked road. |
| `remoteLaunch.ts` | `export function refusalSaid(entry: LaunchEntry, reason: string): string` = today's `refusedCopyReason` (`:367-369`), renamed and exported; `copyOfPlan` (`:351`) calls it. |
| `sshUseActions.ts` (405 → about 440) | `execOverSsh` (§S2.2); `sshExecAction.run` calls it; `sshDepsFor` (`:383-405`) adds `overSsh: execOverSsh(deps)` to the record it returns (build the record in a `const`, then return it with the field). `agentAwareLaunch` uses `sshSpawnLaunch` (S1). |
| `extension.ts` | No change from this brief: `agentDeps` spreads `sshDeps` (`:629`). The security spec's §7 changes `:516` and `:69` in place (`maskEntriesWithLink`); not one line longer. |
| `test/agentUseActions.test.ts` `fakeDeps` `:38-53`, `test/sshLinkRoads.test.ts` `:166-177`, `test/promptSites.test.ts:214` | Their deps gain `overSsh: async () => { throw new Error('this world has no SSH road'); }` (a test that reaches it fails loudly). |

**The road scan — `test/launchRoadScan.test.ts`**

| List | Change |
|---|---|
| `ROAD_FILES` `:24-36` | Add `'sshUseActions.ts'`. |
| `SENDS` `:20` | Add `/\brunSshExec\s*\(/g`. |
| `ALLOWED_SENDS['sshUseActions.ts']` | The ONE `runSshExec(` line, as written in `execOverSsh`, `because: 'ssh:exec and the agent\'s run over SSH (E3.S2): argv from buildSshExecArgv, no shell'`. |
| `ALLOWED_SENDS['agentUseActions.ts']` `:164` | The `capturedRun` line keeps its text; `because: 'the agent creds_run of an entry with no link: the local road'`. |
| `RESOLVE_IMPORTERS` `:103` | Remove `'agentUseActions.ts'`. |
| `REFUSAL_SITES` `:189-195` | Remove `'agentUseActions.ts:terminalRunAction'`. |
| self-check | Add `assert.equal(sitesIn('literal.ts', 'x = runSshExec\n(\n a)', SENDS).length, 1);`. |

**Existing tests whose expected values change** — `test/sshLinkRoads.test.ts` W8 (`:163`): the Fable spec gives the new
expected sentence (the world has no `s1`); still `slotCalls === 0`. `test/sshRoadHelp.test.ts` `EN_BULLET` and
`CHAIN_BULLET`: the S2 text below. Any other: stop and report.

**The help ×5** — the bullet's sentence S1 wrote is replaced (the Fable spec may rewrite it if its gate says more):

| Lang | New sentence |
|---|---|
| EN | `*Run with Secrets* runs it there too, from a local window, and so does an agent's run, but only when the SSH entry itself is *Usable by agents*; otherwise the agent is refused and nothing runs.` |
| DE | `*Run with Secrets* führt sie dort ebenfalls aus, aus einem lokalen Fenster, und der Lauf eines Agenten auch, aber nur, wenn der SSH-Eintrag selbst *Usable by agents* ist; sonst wird der Agent abgelehnt und nichts läuft.` |
| ES | `*Run with Secrets* también la ejecuta allí, desde una ventana local, y la ejecución de un agente también, pero solo cuando la propia entrada SSH es *Usable by agents*; si no, el agente se rechaza y no se ejecuta nada.` |
| RU | `*Run with Secrets* тоже выполняет её там, из локального окна, и запуск агентом тоже, но только если сама запись SSH — *Usable by agents*; иначе агенту отказывают и ничего не выполняется.` |
| UK | `*Run with Secrets* теж виконує його там, із локального вікна, і запуск агентом теж, але лише коли сам запис SSH — *Usable by agents*; інакше агентові відмовляють і нічого не виконується.` |

**README** — the *Runs over SSH* bullet: the agent's run moves to the running list with the same condition.
**research/** — `module_extension.md`: a paragraph **The agent's run over SSH (E3.S2)** (the order, the gate as the Fable
spec decided it, the bare line, `execOverSsh` shared with `ssh:exec`, the trust line as the key, the snapshot); the
"refusal on every road" paragraph loses the agent's run. `module_tests.md`: the E3 section gets the S2 rows.

### S2.4 Line budget

| File | Now | After S2 | Ceiling |
|---|---|---|---|
| `agentUseActions.ts` | 437 | about 490 | 800 |
| `sshUseActions.ts` | 405 | about 440 | 800 |
| `extension.ts` | 1003 (≤ after S1) | unchanged | ratchet |
| `terminalRunAction`'s `run` | 48 code lines | ≤ 20 | 50 per function |

### S2.5 Scenarios — RED first (the non-authorisation part)

`LINKED` as in S1 with `command: 'echo linked'` and no arguments; the SSH entry is the Fable spec's `usableSsh('s1')`;
`TRUST` = `trustLineFor(s1.details, chain.value, 'echo linked')`; the deps carry a recording `overSsh` (`calls`, and an
answer `{ status: 200, body: { exitCode: 0, stdout: 'ok', … } }`).

**`test/agentSshRun.test.ts`** (new)

| # | Test | Assertion | RED today |
|---|---|---|---|
| AG1 | `a_usable_trusted_linked_entry_runs_the_bare_line_over_ssh` | trusted on `TRUST`: one `overSsh` call; `call.ssh` is the SAME object the storage returned for `s1` (`===`); `call.remoteCommand === 'echo linked'` (no `eval`, no `exec`); `call.jump()` equals `resolveJumpChain(…)`; `call.timeoutMs === clampExecTimeout(undefined)`; the result is `overSsh`'s answer | E1's sentence |
| AG2 | `the_trust_key_is_the_trust_line_not_the_local_line` | trusted on `'echo linked'` only: `no_credential` with `untrusted`'s text; `overSsh` 0; slot 0 | E1's sentence |
| AG3 | `a_busy_window_answers_too_many_and_runs_nothing` | `acquireExecSlot` → `undefined`: `too_many_requests`; `overSsh` 0 | E1's sentence |
| AG4 | `the_slot_is_released_when_the_ssh_call_throws` | `overSsh` rejects: the action rejects or answers `internal` as the Fable spec says; the release function was called once | E1's sentence |
| AG5 | `snapshot_the_ssh_entry_is_read_once` | `getNode` counts reads of `s1`: exactly the two the gate makes (`linkTo` and `lookedUp`, spec §2.1), and none after the gate — `planLaunch` gets the gate's `link`, so it reads nothing | E1's sentence |
| AG6 | `a_linked_entry_written_for_windows_is_refused_after_the_gate_naming_only_the_terminal_entry` | S usable (the gate passes), `terminalOs: 'windows'`: `not_supported`, message `=== refusalSaid(T, planLaunch(T, sshLinkOf(T, lookup), { stayOpen: false }).reason)`, which includes `"deploy"` and not `prod box` or `prod.example`; `overSsh` 0, slot 0. The same entry with S CLOSED answers the one sentence instead: that case is the spec's G20 | E1's sentence differs |
| AG7 | `an_unlinked_entry_runs_here_as_before` | the existing tests `the_agent_runs_the_resolved_line` and the #103 pair (`agentUseActions.test.ts:214-229`, `:377-399`) green unchanged; and here: an unlinked entry never calls `overSsh` | (green; guard) |

**`test/sshExecOver.test.ts`** (new; `loadWithVscode('../sshUseActions', stub, { './sshExecRunner': { runSshExec: recorder } })`)

| # | Test | Assertion | RED today |
|---|---|---|---|
| X1 | `the_argv_is_buildSshExecArgv_with_the_snapshots_jump_and_pin` | a key SSH entry: the recorded argv deep-equals `buildSshExecArgv(ssh, keyPath, 'echo linked', 'key', { jump, knownHostsFile, bridged: false })` (with `keyPath` and `knownHostsFile` read back from what was written, never guessed); the program is `sshSpawnLaunch(ssh, socket, process.platform).program` | no export |
| X2 | `the_written_key_is_removed_after_the_call_and_after_a_throw` | the materialised key file exists during the recorded call and is gone after; the same when `runSshExec` rejects (answer `internal`) | no export |
| X3 | `a_password_entry_uses_askpass_and_puts_no_password_in_argv` | a stored (not woven, not PIN-locked) password: argv holds `NumberOfPasswordPrompts=1`; the env holds `SSH_ASKPASS_REQUIRE=force`; no argv element holds the password | no export |
| X4 | `a_pin_locked_password_is_refused_and_nothing_is_spawned` | a sealed password: `no_credential` with `pinRefusalFor(name)`; the recorder was not called | no export |
| X5 | `ssh_exec_still_resolves_its_chain_after_the_credential` | `sshExecAction` with a chain that loops and a credential that fails: the answer is the credential's refusal (today's order) | (green; guard — say so) |

**`test/sshRoadHelp.test.ts`** (append) — Hp8 `every_language_says_the_agents_run_needs_the_ssh_entry_usable_by_agents`:
each body includes its S2 sentence; RED: absent.

### S2.6 Commands

```bash
node $LP npm run typecheck && node $LP npm run lint && node $LP npm run compile
node $LP node --test out/test/agentSshRun.test.js out/test/agentSshGate.test.js out/test/sshExecOver.test.js out/test/agentUseActions.test.js out/test/sshLinkRoads.test.js out/test/launchRoadScan.test.js out/test/sshRoadHelp.test.js out/test/promptSites.test.js out/test/consentContract.test.js out/test/agentConsent.test.js out/test/sshExecCommand.test.js out/test/sshExecAuth.test.js
node $LP node scripts/size-ratchet.mjs
```

The lead runs the full `npm test`.

---

## S3 — Closing (brief)

### S3.1 What is still to say, after S1 and S2

| Where | Change |
|---|---|
| help ×5, the paragraph that starts EN `To run a line on a server` (the E2 advice) | Append the risk-1 note (the limits "POSIX login shells only" and "a Windows server is refused" are already in that paragraph since E2). EN: ` An older version of CredsForDevs does not know *Runs over SSH*: it runs such an entry on its own machine, and a save there removes the choice for every machine. Update CredsForDevs on all your machines before you choose an SSH entry.` DE: ` Eine ältere Version von CredsForDevs kennt *Runs over SSH* nicht: Sie führt einen solchen Eintrag auf ihrem eigenen Rechner aus, und ein Speichern dort entfernt die Wahl für alle Rechner. Aktualisieren Sie CredsForDevs auf allen Ihren Rechnern, bevor Sie einen SSH-Eintrag wählen.` ES: ` Una versión anterior de CredsForDevs no conoce *Runs over SSH*: ejecuta esa entrada en su propia máquina, y guardarla allí quita la elección en todas las máquinas. Actualice CredsForDevs en todas sus máquinas antes de elegir una entrada SSH.` RU: ` Старая версия CredsForDevs не знает *Runs over SSH*: она выполняет такую запись на своей машине, а сохранение записи там убирает выбор на всех машинах. Обновите CredsForDevs на всех своих машинах, прежде чем выбирать запись SSH.` UK: ` Старша версія CredsForDevs не знає *Runs over SSH*: вона виконує такий запис на своїй машині, а збереження запису там прибирає вибір на всіх машинах. Оновіть CredsForDevs на всіх своїх машинах, перш ніж обирати запис SSH.` The paragraph's existing text stays first, so `EN_ADVICE` (`test/sshRoadHelp.test.ts:38`) stays a substring. New test Hp9 `every_language_warns_that_an_older_version_runs_a_linked_entry_locally` (each language includes its sentence; RED: absent). |
| `src_vs_code/README.md` | Read every mention of *Runs over SSH*, the trust line, the refusals, *Run with Secrets* and the agent (`grep -n "Runs over SSH\|Run with Secrets\|ssh … --\|creds_run"`); each must describe the system as built after S1 and S2. Add the risk-1 note after the E2 advice paragraph (`:300-`). The feature table row (`:44`) adds: over SSH, the values go on ssh's standard input. |
| `src_vs_code/CHANGELOG.md` `## [Unreleased]` | The field, the arrow, a VPN's *Start*, *Run All in Folder*, a dependency step, the trust line, *Copy Command*, share and export and the older-build note are already in `## [1.20.0]` (#338, E1 and E2); do not repeat them. E3's own block: `### Added — Run with Secrets and an agent's run over SSH`: *Run with Secrets* on a linked entry (values on the remote login shell's standard input, masked output, not interactive, local window only, a Windows server refused); an agent's `creds_run` only when the SSH entry itself is *Usable by agents*, else one sentence naming only the Terminal entry, code `denied` (was `not_supported` in 1.20.0); the consent names the SSH entry and its target; the agent's output is also masked with the SSH entry's values. Remove nothing from 1.20.0: its *Not yet over SSH* section stays true of that release. Cite `file:line` as the existing entries do. |
| `research/module_extension.md` | Read the whole SSH-link section (from `#### Terminal entry SSH link`, about `:2356`, to the end of the E3 paragraphs) as ONE text: no sentence says a road "still refuses" that runs now; "The refusal on every road" lists exactly the remaining callers of `sshLinkRefusal` (scan 4's list); the module map names `remoteLaunch.ts`, `sshSession.ts`, `sshRoad.ts`, `entityCommandRows.ts`, the scan. |
| `research/module_tests.md` | The E1, E2 and E3 sections: every new test file has a row; each row's flow is covered or `not covered` with a reason; one **Not covered** line names the hand checks of parent §10 and who runs them. |
| parent §10 | Hand check 3 is handed to the owner (it is owed, not a gate for the merge); the summary says so. With it go the observations E3 could not make in a unit test (E3-D11): with a jump host, closing the masked terminal mid-run leaves no `ssh` helper on this machine (`pgrep -f 'ssh .*-W'` empty after a few seconds), and an unreachable host ends the run with ssh's error after about 10 s. They are the owner's to run, written into the hand-over message, not into the parent (§E3.R1, flag 7). |

### S3.2 The promotion — together, the `git mv` LAST (`planning-docs.md` § *The `git mv` goes LAST*)

The documents are SEVEN, listed in the table below. NOT `research/PLAN_windows_shell_quoting_injection.md` (its own
plan, already promoted by #334, parent §7a).

**Each document, its index rows and its links** (round 1, item 8). Line numbers are as on 454e990 + this branch; find each
`todo/README.md` row by its link text, not by its number. `research/README.md` gets ONE new row at the top of the
*Implemented plans* table (after the header at `:37-38`, before the `PLAN_windows_shell_quoting_injection.md` row at `:39`),
in the shape of the multi-document row at `:41`, and that one row is the mention of all seven (the checker,
`plan-lifecycle.mjs` "research/README.md never mentions <plan>", asks for a mention of each file name):

`| [PLAN_terminal_command_over_ssh.md](PLAN_terminal_command_over_ssh.md), with stories [E1](PLAN_terminal_command_over_ssh_E1.md) (specs [S2](PLAN_terminal_command_over_ssh_E1_S2_spec.md), [S3](PLAN_terminal_command_over_ssh_E1_S3_spec.md)), [E2](PLAN_terminal_command_over_ssh_E2.md), [E3](PLAN_terminal_command_over_ssh_E3.md) (security spec [S2](PLAN_terminal_command_over_ssh_E3_S2_security.md)) | <YYYY-MM-DD> | <the release, then one sentence per epic of what shipped, and the deviations that a reader needs first> |`

| # | Document | `todo/README.md` row removed (link text; line on this branch) | `research/README.md` mention (in the one row above) | Its own links that change (the three cases) |
|---|---|---|---|---|
| 1 | `PLAN_terminal_command_over_ssh.md` | `[PLAN_terminal_command_over_ssh.md]` — `:30` | the row's first link | case 1: `PLAN_askpass_answers_the_hop.md` (×2), `PLAN_terminal_runs_followups.md`, `PLAN_remote_bridge_scoped.md` gain `../todo/`; case 2: `../research/PLAN_windows_shell_quoting_injection.md` (×3) drops `../research/`; siblings unchanged; the path `todo/PLAN_terminal_command_over_ssh_E<n>.md` in the text (`:424`) becomes `research/…` |
| 2 | `PLAN_terminal_command_over_ssh_E1.md` | `[PLAN_terminal_command_over_ssh_E1.md]` — `:31` | `[E1]` | case 2: `../research/PLAN_windows_shell_quoting_injection.md` drops `../research/`; siblings unchanged |
| 3 | `PLAN_terminal_command_over_ssh_E1_S2_spec.md` | `[PLAN_terminal_command_over_ssh_E1_S2_spec.md]` — `:35` | `[S2]` after E1 | siblings only (none change) |
| 4 | `PLAN_terminal_command_over_ssh_E1_S3_spec.md` | `[PLAN_terminal_command_over_ssh_E1_S3_spec.md]` — `:36` | `[S3]` after E1 | siblings only; the path `todo/PLAN_terminal_…` in its F12 row (`:34`) becomes `research/…` |
| 5 | `PLAN_terminal_command_over_ssh_E2.md` | `[PLAN_terminal_command_over_ssh_E2.md]` — `:32` | `[E2]` | siblings only |
| 6 | `PLAN_terminal_command_over_ssh_E3.md` | `[PLAN_terminal_command_over_ssh_E3.md]` — `:33` | `[E3]` | siblings only; the backticked paths `todo/PLAN_terminal_command_over_ssh_E3_S2_security.md` in its text become `research/…` or links |
| 7 | `PLAN_terminal_command_over_ssh_E3_S2_security.md` | `[PLAN_terminal_command_over_ssh_E3_S2_security.md]` — `:34` | `[S2]` after E3 | case 1: `PLAN_consent_coverage_per_door.md` (§3.2) gains `../todo/`; siblings unchanged |

Inbound references outside the seven (case 3, and the paths no renderer checks): `research/PLAN_windows_shell_quoting_injection.md:67`
cites `todo/PLAN_terminal_command_over_ssh.md` → `research/…`; `src_vs_code/src/remoteLaunch.ts:11` cites
`todo/PLAN_terminal_command_over_ssh_E1_S2_spec.md` → `research/…`. Find any others by
`grep -rn "todo/PLAN_terminal_command_over_ssh" --include=*.ts --include=*.md --include=*.mjs --include=*.cjs .` (the
bare name `PLAN_terminal_command_over_ssh.md` in a code comment names no folder and does not change), not from memory.

The steps, in this order:

1. While every file is still in `todo/`: each status line becomes `> Status: **IMPLEMENTED, <YYYY-MM-DD>.**` with its
   deviations. The parent's deviations section collects at least: E1 §S4 F1-F7; E2's four recorded deviations and its
   flags 2-5; E3-D2 (references only from the line that runs, over SSH); E3-D4 (a spawn always writes the key file);
   **E3-D13 and entry 2.2: the first §4.5 (1) importer target was given up** — `commands/runCommands.ts` still imports
   `resolveCommand` for the local Run with Secrets and the arrow's local line, because `LaunchPlan` was deliberately not
   widened (E3's plan round 1); the epoch-3 revision wrote the shipped list into §4.5 (1) and put the guarantee on the
   no-local-sink tests (LN1-LN6), so this is history for the reader, not a gap; the `sshLinkRefusal` sentence's last callers (Flag 4); the CHANGELOG path; and, recorded as CHECKED and not
   built, `-o SendEnv=-NAME` for the askpass variables (measured not to remove a wildcard pattern,
   `PLAN_windows_shell_quoting_injection.md` §8; the limit stays accepted). A deviation that records something as
   impossible names what was CHECKED.
2. The parent's ledger: read it whole. Epoch 2 stopped at entry 2.2; E3 is built only after epoch 3 opens. A second
   entry of the CURRENT epoch is a new full stop of `plan-change-control.md`, before anything is promoted. A stories
   document keeps no ledger.
3. Edit, still in `todo/`: every link of the table's last column, written for the DESTINATION; the two inbound paths;
   delete the seven `todo/README.md` rows; add the one `research/README.md` row.
4. `git mv` each of the seven to `research/`, `git add` each DESTINATION (the move staged the original bytes;
   `git-workflow.md` rule 8), `git show :research/<file> | head -3` shows the IMPLEMENTED status for each, and commit in
   the same breath with `todo/README.md`, `research/README.md`, `research/PLAN_windows_shell_quoting_injection.md` and
   `src_vs_code/src/remoteLaunch.ts`. `git diff --cached --name-status` shows seven renames, none `R100`.
5. Then run `node .agents/conventions/tools/plan-lifecycle.mjs`: it must print `plan-lifecycle: clean.` (no "omits", no
   "still lists", no "never mentions", no unresolved link). Walk every markdown link in `todo/` and `research/` that the
   commit touched and resolve it against its own file.

### S3.3 Checklist

- [ ] The help tests pass, five languages, English first; no help text says a road refuses that runs.
- [ ] README, CHANGELOG, `module_extension.md`, `module_tests.md` describe the shipped system.
- [ ] The seven documents promoted together, each with its `todo/README.md` row removed and its mention in the one
      `research/README.md` row (§S3.2 table), deviations recorded (E3-D13 and entry 2.2 among them), links walked, then
      `plan-lifecycle.mjs` clean.
- [ ] Hand check 3 handed to the owner; hand checks 1, 2 and 4 still listed as owed if not done.

---

## What E3 does NOT do

- **No new road.** An agent's `creds_vpn_up` with a linked launcher or a linked chain step stays refused (parent §9,
  E2-D2); the bridge keeps refusing `run` (`bridgeAllowList.ts`).
- **No interactive Run with Secrets over SSH**: no tty, no `-t`, no forwarded keystrokes; *Run in Terminal* is the way
  out, without the values.
- **No Run with Secrets over SSH from a WSL or Remote-SSH window**, and no linked SCRIPT anywhere (a script cannot carry
  a link written by this build; a synced one keeps E1's sentence).
- **No change to the local Run with Secrets** (its shell, its line from the parts, its references in disabled rows, its
  banner text), to `runMasked`, or to `secretsStdin`, `SECRETS_REMOTE_COMMAND`, `trustLineFor`, `planLaunch`,
  `LaunchPlan` (E3-D13), `prepareSshSession`, `cleanup()`, `childKill.ts`, the trust store or `commandFingerprint`.
- **No change to `ssh:exec`'s behaviour**: its body moves into `execOverSsh`, in the same order.
- **No fix of risk 7** (askpass answers a jump host's password prompt): a password SSH entry with a jump host has it on
  these roads too (`PLAN_askpass_answers_the_hop.md`).
- **No `SendEnv` control, and no `-o SendEnv=-NAME`** (E3-D8). The removal form was MEASURED not to work on a wildcard
  pattern (`research/PLAN_windows_shell_quoting_injection.md` §8), so it would only look like protection. A password SSH
  entry's askpass variables stay in the LOCAL ssh's environment; a person's own `SendEnv` pattern together with a
  server's `AcceptEnv` could send that password to the server — the limit the owner accepted and documented on
  2026-11-10 (`research/module_extension.md:221`, `src_vs_code/CHANGELOG.md:34-36`, release 1.19.0), the same as on SSH Connect today.
  The resolved VALUES are never in that environment (stdin only, M11 and S9), so no `SendEnv` can carry them.
- **No overall time limit on a masked run.** It is bounded by `ConnectTimeout` while connecting and by the person after
  that (closing the terminal kills it, E3-D11), as the local Run with Secrets is today.
- **No authorisation decision outside the Fable spec**: S2's gate, refusal texts and consent text are the spec's.
- **No change of the translated *Runs on* labels** in `helpDe.ts` and `helpEs.ts` (older than this plan; E1 note 6).
- **No promotion before S1 and S2 are built and reviewed**, and no promotion of `PLAN_windows_shell_quoting_injection.md`.

## Flags for the lead (found while writing this)

1. **Possible plan change (contract / approach), not decided here.** Parent §4.5 (1) wants `resolveCommand(` imported
   only by `commandLine.ts` and `remoteLaunch.ts`; the E1.S2 spec made it a list that E2 and E3 shrink. After S2 the list
   is `['commands/runCommands.ts', 'remoteLaunch.ts']`. `runCommands.ts` keeps the import for two LOCAL uses: the local
   Run with Secrets needs `parts` (`buildCommandLineWithRefs(parts, …)`, `:430`), which `LaunchPlan` does not carry, and
   E2's `arrowLine` (`:169-172`). Reaching the target means adding `parts` to `LaunchPlan` (a change to E1.S2's
   cornerstone type, and `test/remoteLaunch.test.ts:223`'s expected value) or changing the local road's line. Either
   keep it as a recorded deviation, or count it.
   (Settled by E3's plan round 1, item 2: `LaunchPlan` is not changed, E3-D13. Counted as parent entry 2.2, which
   stopped the plan; the epoch-3 revision rewrote parent §4.5 (1) to the shipped list — flag 7.)
2. **Possible plan change (contract), for the Fable spec.** Naming the SSH entry and its target in the consent
   (parent §4.4 "Agent", D2) needs the broker to know the target at the dialog; `UseAction.summarize(body)` has none
   (`useActions.ts:139`). An interface change of the broker's consent path may follow from the spec.
3. **Not a plan change, by my reading — in doubt the lead counts it.** E3-D2 (over SSH, references come only from the
   line that runs, not from disabled rows), E3-D3 (no reference is said before prepare) and E3-D4 (a spawn always writes
   the key file) each only make the plan true as written; record them as deviations at promotion.
4. **Text, not a change.** After E3, `sshLinkRefusal`'s `"…which this version cannot do yet…"` is said only to an agent's
   VPN start and to a linked script. "Yet" is then misleading for a person who reads the help. A rewording is the lead's
   choice; this document does not make it.
5. **Paths.** The parent's E3 scope says `CHANGELOG.md`; the file is `src_vs_code/CHANGELOG.md`. The parent's §4.4 names
   `buildSshExecArgv(ssh, keyPath, …)` for the secrets child; E3-D5 adds the program choice (`openSshBinary`) and the
   agent socket, which the parent did not name.
6. **Both-sides rule.** This document was written alone (one file). The parent's `### E3` needs the line `Stories:
   [PLAN_terminal_command_over_ssh_E3.md](PLAN_terminal_command_over_ssh_E3.md).` and `todo/README.md` needs this
   document's row, in the SAME commit as this file; the security spec's row comes with the spec.
7. **Round-1 amendments that may touch the parent (flagged by the Opus judge who wrote them in, 2026-11-10; not decided
   here, in doubt they count).** (a) E3-D13 leaves parent §4.5 (1)'s structural target ("`resolveCommand(` is imported
   only by `commandLine.ts` and `remoteLaunch.ts`") unreached for good, not for a while: the parent's structural-test
   contract then reads wider than what ships. (b) The askpass `SendEnv` exposure on this road is the owner-accepted limit
   of the security plan's §8, not a new one; parent §4.4 "Run with Secrets" says nothing about `SendEnv`, so nothing in
   the parent changes — named only so the count is a decision. (c) The hand-check observations of §S3.1 (the POSIX jump
   helper after a close, an unreachable host) are handed with hand check 3 and NOT written into parent §10; writing them
   there would change a parent section. Everything else of round 1 (the bounded run, the warning in the banner, the
   once-only hand-over, the bounded tests, the gate first, the per-document promotion list) only makes parent §4.4 and
   the E3 epic true as written.
   (Decided 2026-11-10: (a) counted as parent entry 2.2, the second change of epoch 2, which stopped the plan. The
   epoch-3 revision rewrote parent §1, §4.4, §4.5, §6, the Definition of Done and the E1 and E3 epic texts; it moved
   the guarantee from the import target to behavioural tests (parent §4.5 (5), here §S1.6 LN1-LN6). (b) and (c) are not
   counted. The revision also wrote the round-1 bounds and the child's clean environment into parent §4.4, as the
   baseline of epoch 3, not as entries.)

## E3.L — Lead decisions on the flags (2026-11-10)

| Flag | Decision |
|---|---|
| 1 — `resolveCommand(` still imported by `commands/runCommands.ts` after E3 | `LaunchPlan`'s `local` (and `remote`) variant carries the resolved `parts`, so the local roads read them from the plan and stop importing `resolveCommand`; the road scan's importer list then ends at `commandLine.ts` and `remoteLaunch.ts` (parent §4.5 (1), as written). Built in S1. Not a plan change: it makes the plan's own target true. **WITHDRAWN 2026-11-10 by E3's plan round 1 (item 2): `LaunchPlan` is not changed; see E3-D13.** |
| 2 — the consent must name the SSH entry and target, but `UseAction.summarize(body)` has no target | An internal interface widening that makes D2 true as written; the Fable spec (§S2.1) chooses its shape. Not a plan change. |
| 3 — references only from the line that runs; "no reference" said before prepare; the spawn always writes the key file | Implementation details within D12; recorded as deviations at promotion. |

S2 security spec: [PLAN_terminal_command_over_ssh_E3_S2_security.md](PLAN_terminal_command_over_ssh_E3_S2_security.md) (Fable, 2026-11-10). Its finding F7 (outside this plan: `refusalFor` in `brokerRequests.ts` can confirm an entry's name to an agent on a guessed id) is reported to the owner, not built here.

## E3.R1 — applied (round 1 of 2026-11-10: revise, 7 gating of 6, 2 of 2 reviewers; all 8 findings accepted)

Written into the sections they change by an Opus judge on 2026-11-10, before round 2:

| # | Finding | Now in |
|---|---|---|
| 1 | The masked run is bounded; a closed terminal kills the child; no stdin write outlives the run | E3-D11; §S1.2 *What ends the run*; §S1.3 `maskedTerminal.ts` (`ended()`, stdin destroyed, `open()` after the end); K1; M9 (stalled child), M6b; §S3.1 (the POSIX jump helper, handed with hand check 3) |
| 2 | E3.L flag 1 withdrawn: `LaunchPlan` not changed | E3-D13; E3.L row 1 marked WITHDRAWN; §S1.3 imports and `RESOLVE_IMPORTERS`; §S3.2 step 1 (the deviation); flag 1's note; flag 7 (a) |
| 3 | The spawn warning in the banner, not a toast | E3-D5, E3-D12; the texts table (`maskedOverSshBanner`); §S1.1; K10; S10 |
| 4 | Security, REWRITTEN: the round's `-o SendEnv=-<name>` was measured NOT to work (OpenSSH removes only a literally equal pattern; `research/PLAN_windows_shell_quoting_injection.md` §8, owner-accepted limit). So: no removal flag; the askpass limit stated; the VALUES never in the ssh environment | E3-D8; "What E3 does NOT do" (`SendEnv`); M11 (the real child's environment); S9 (the options); §S3.2 step 1 (checked, not built); flag 7 (b) |
| 5 | One atomic, once-only hand-over | E3-D7; §S1.1 (the block); §S1.3 `sshRoad.ts`, `maskedTerminal.ts`, test helpers (`onMasked`, `cleanupCalls`); H8, H9; M6, M10; S7, O5, O8, O9 |
| 6 | S2: the gate before any refusal that reads the link or the SSH entry; every pre-gate outcome the one sentence | §S2.2 (rewritten: gate first, `planLaunch` after it with the gate's `link`); AG5, AG6; the security spec §2.1 (bridge first), §2.3, §4 (the pre-gate rule), G13, G20, G21, §14, §15. Found while applying it: the spec's §2.3 skipped the compare for an unlinked answer, against its own §2.4 row 4 and G10 (c); corrected there and in §S2.2 step 3 (the compare runs for both) |
| 7 | M2 bounded, with a tree kill on timeout | §S1.5 (`closedWithin`, `{ timeout: 15_000 }`); M2 |
| 8 | S3's promotion, document by document | §S3.2 (the table, the one `research/README.md` row, the steps, then `plan-lifecycle.mjs`); §S3.3 |

Line references re-checked on 454e990 (header). Parent-plan questions raised while applying: flag 7.
