# PLAN — Terminal command over SSH, E3: Run with Secrets, the agent's run, and the closing

> Status: **stories of E3, S1 and S2 built (d4ebcab9 … 7c6e4ffb, pushed, unmerged), S3 and the fix forward of §E3.4 not built, 2026-11-10. The parent's epoch 4 is open (after the re-review of entry 3.2's stop); §E3.4 here is that revision's share of the stories; next: build F-S1 and F-S2, then S3 with F-S3.** Parent: [PLAN_terminal_command_over_ssh.md](PLAN_terminal_command_over_ssh.md) › E3.
> Branch `feat/terminal-command-over-ssh-e3`, started from E2's commit (a5ddd73, E1 + E2 on the Windows quoting security
> fix) and rebased on 2026-11-10 onto `origin/main` 454e990 (E1 #335, E2 #337, and #336 — the SSH Connect tab title
> `Creds SSH: <folder> / <entry>`, a session found by account + entry through `sshTerminalOwners.ts`, never by title); E3
> lands as ONE commit. Scope: `src_vs_code` only. Three stories, no cornerstone (the parent's ledger stays
> `Cornerstones: 2 of 2 — E1.S2, E1.S3`). Scenarios and briefs by Opus; code and tests by Sonnet; review by Opus. The
> AUTHORISATION part of S2 is a Fable security judgement (outside the quota), in its own file:
> [PLAN_terminal_command_over_ssh_E3_S2_security.md](PLAN_terminal_command_over_ssh_E3_S2_security.md).
> The eight amendments of E3's first plan round are written into the sections they change (§E3.R1 says where); so are
> round 2's accepted findings and the lead's Opus review (§E3.R2 says where). The re-review of epoch 4 (the security
> spec's third amendment as 21b8f5ce leaves it, the lead's decisions after the consultants, the conventions review of
> the S1 and S2 code and the lead's Opus review) is §E3.4, with pointers in the sections it changes.

Every path below is relative to `src_vs_code/src/` unless it says otherwise. Every `file:line` was opened on a5ddd73 and
checked again on 454e990: of the cited source files only `sshSession.ts` moved (#336 added 4 lines at `:103`), and of the
documents `research/module_extension.md` and `research/module_tests.md`; those references are updated. Checked a third
time on e57eb80f (main with #338): since 454e990 only `src_vs_code/CHANGELOG.md` and `todo/README.md` changed; the
CHANGELOG references are updated (§S3.1, "What E3 does NOT do"). E3 finds no session
by a terminal title: the masked run is its own pseudoterminal, and `sshTerminalOwners.ts` is SSH Connect's alone.

## The three stories

| Story | What | Scenarios and brief | Code and tests | Review |
|---|---|---|---|---|
| S1 | Run with Secrets over SSH: the values on ssh's STDIN for the remote login shell, the masked child by argv | Opus, §S1 | Sonnet | Opus |
| **S2 — authorisation part: Fable security judgement** | The agent's `creds_run` (and CLI `run`) over SSH | the gate, the refusal texts and the consent: **Fable**, `PLAN_terminal_command_over_ssh_E3_S2_security.md`; everything else: Opus, §S2 | Sonnet | Opus |
| S3 | Closing: the limits in the help ×5, README, CHANGELOG, `research/` as a whole, the promotion | Opus, §S3 | Sonnet | Opus |

S1 and S2 do not depend on each other. S2's code waits for the Fable spec. S3 comes last: it describes the roads as built.
S1 and S2 are built (epoch 3); the re-review of epoch 4 adds §E3.4 to each of the three stories (F-S1, F-S2, F-S3),
fixed forward before E3 merges.
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
- **Done when.** §S1.6 scenarios green, each watched RED first (LN1-LN11 by the temporary bypass of every wall, parent §4.5 (5));
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
| E3-D4 | **The secrets spawn prepares with `agentServesKey: false`.** `SshRoad.prepare` gains a third parameter `use: 'terminal' \| 'spawn'` (default `'terminal'`). For `'spawn'` a stored key is always written to its isolated file and `-i` names it. | A terminal reaches the extension's agent through the window's environment collection; a child spawned by the extension host does not. With no key file the child would depend on whatever `SSH_AUTH_SOCK` the host process has: the "silently authenticates with whatever keys" hazard `sshSession.ts:400-406` refuses on the relay route. With the key file, `-i` names the stored key; and since the re-review of epoch 4 the host's `SSH_AUTH_SOCK` is REMOVED from the child's environment (parent D17 (a), §E3.4 F-S1), so the person's own agent is not offered through the inherited variable either. A person's own config line `IdentityAgent` still wins (parent risk 8). |
| E3-D5 | **`SshRoad.spawnLaunch(ssh, env)`** answers `{ kind: 'spawn', program, cwd, env, warning? }` or `{ kind: 'refused', reason }` for a spawned ssh. **Program:** `sshSpawnLaunch(ssh, socket, process.platform).program` (that is `openSshBinary('ssh', ssh.agentForward === true, …)`), then `spawnableSshProgram(program, process.platform, process.env.PATH, fs.existsSync)` (new, pure, `sshProgram.ts`). Off Windows the program is kept (`execvp` searches `PATH`, not the current folder). On Windows a program with a drive letter or a `\\` prefix is kept (the built-in that `openSshBinary` chose); a bare name becomes the FIRST `ssh.exe` in an absolute folder of `PATH` (`pathDirsOf(PATH, ';')`, `sshProgram.ts:116-118`; an entry with no drive letter and no `\\` prefix — `.`, `tools`, `\dir` — is skipped), else `builtInOpenSsh('ssh')` when it exists, else `undefined` → `refused` with `NO_SSH_TO_SPAWN`. **Folder:** `cwd` = `deps.storageDir`, NEVER the workspace folder (round 2, B1). **Environment:** the run ADDS only the askpass variables and, when the extension's agent serves the run (the entry forwards and the socket is up), its `SSH_AUTH_SOCK`; since the re-review of epoch 4 it REMOVES the host's `SSH_AUTH_SOCK` and every `CREDS_REF_` name (`SpawnLaunch.withoutEnv` = `E3_INHERITED_DROP`, `envWithout` in `spawnChild`; parent D17 (a), §E3.4 F-S1); other ordinary variables (`PATH`, `HOME`, …) are inherited as by every spawned program. **`ownAgent`** (epoch 4, §E3.4): the answer says `ownAgent: true` only when the entry forwards and the extension's agent is up; `secretsLaunch` hands it to `buildSshExecArgv`, which for a forwarding entry with `ownAgent: false` sends no `-A` and sends `-o ForwardAgent=no` (parent D17 (b)). `sshSpawnLaunch` is ONE new pure function in `sshProgram.ts`, which `sshUseActions.ts` `agentAwareLaunch` (`:95-109`) also uses; `spawnableSshProgram` and the folder are the masked run's only (`ssh:exec` is not changed, flag 8). Counted as parent entry 3.1 (the lead, 2026-11-10). Its `warning` (today only `NO_AGENT_TO_FORWARD`, `sshProgram.ts:251-253`, from `agentForwardEnv` `:267-279`) goes into the banner (E3-D12). | The agent's exec composes the program and the agent socket this way; one composition, two callers (reuse-first). **B1 (the lead's Opus review; CWE-426):** without agent forwarding `openSshBinary` answers the bare word `ssh` (`sshProgram.ts:182-216`), and `spawnChild` gives the child the first workspace folder as its `cwd` (`maskedTerminal.ts:151-153`, `:160`). On Windows libuv searches the child's `cwd` before `PATH` (the hole named at `sshProgram.ts:186-197`), so a repository with an `ssh.exe` in its root would receive the askpass password and every value on stdin. The absolute program closes the search; the folder closes it a second time and on POSIX too (a `PATH` with `.` or an empty entry). Why `storageDir` and not the home folder: it is the extension's own folder (its key files, pins and the window lock, `leasedWrites.ts:32`), no repository and no other program writes there, and the remote command does not use the local folder at all. It exists whenever the vault was ever written (the window lock lives in it); if it is missing, the spawn fails with "Could not start" and the run ends — never a fallback to the workspace. Why the PATH lookup before the built-in: it keeps the client a bare spawn finds (the person's own, minus the current folder), as `openSshBinary`'s doc wants (`:200-203`). `SshRoadDeps` gains an optional `agentSocket`; `sshRoadOf(sshDeps)` already receives it (`sshUseActions.ts:398`), and `storageDir` (`sshRoad.ts:36`), so `extension.ts` does not change. |
| E3-D6 | **Local window only, checked before prepare**: `windowKind(vscode.env.remoteName) !== 'local'` → `secretsLocalOnly(name)`, nothing prepared. `secretsLaunch` also refuses a prepared session with a relay `prefix` or a client `program` (fail closed; unreachable in a local window). | Parent §4.4 "local window only". The extension host spawns on THIS machine; a WSL or Remote-SSH window's preparation is composed for another shell. |
| E3-D7 | **ONE atomic, once-only hand-over from the owner to the masked run** (round 1, item 5; round 2, R2-2). `OwnedSessions` keeps ONE once-only end per owned session, `once(() => ready.cleanup())` (a local `done` flag: a second call does nothing), and `cleanAll()` calls that end, not `ready.cleanup()` directly. It gains `handOverToRun(ready: ReadySsh, start: (ended: () => void) => void): void`, in three steps: (1) take `ready`'s once-only end (`ready` is put on the list first when it is not on it); (2) `start(ended)` — the road's `runInMaskedTerminal({ …, onEnded: ended })`; (3) only when `start` returned, take `ready` off the list. The road calls it INSIDE its `try … finally` (§S1.1), with no `await` in it, so the hand-over and the creation are one guarded block. A throw from step 1 or step 2 leaves `ready` ON the list, so the owner's `finally` (`cleanAll`) is the ONE path that cleans it, before and after a run's end alike, through the same once-only end: a run that already called `ended` is not cleaned twice. After step 3 only the run cleans it. `MaskedRunOptions.onEnded` is called EXACTLY ONCE for a run whose terminal was made: child `close`, child `error`, a failed start, the terminal closed before the child started, or a throw from `terminal.show()` (`maskedTerminal.ts:117`; the masked run then ends the run itself, disposes the terminal and rethrows, so a later `open()` finds the run over and spawns nothing — round 2, Minor 7) — whichever comes first. A throw from `createTerminal` is the caller's to clean (no terminal, no run): `ready` is still on the list. So `ready.cleanup()` runs exactly once on every exit: the run's end, a failed creation, a creation that ended and then threw, a throwing `show()`, a close before the start; the owner's `finally` never cleans a session the run has taken. | Parent §4.4: after the spawn the owner is the child's exit handler. The pty spawns in `open()`, after `createTerminal` returns, so the hand-over is to the run, which owns every later exit. Round 1 called `handOverToRun` BEFORE the `try` and cleaned in the road's `catch`: a throw inside the hand-over then had no cleaner when `ready` was already off the list, and two cleaners (the `catch` and the `finally`) when it was not. With the removal LAST and one once-only end shared by the list and the run, every state before the removal is the owner's and every state after it is the run's. |
| E3-D8 | **The run adds no value to the SSH child's environment** (D12; round 1, item 4; the words corrected in the re-review of epoch 4, security spec §18.2 (a)). `MaskedRunOptions.env` in argv mode — what the run ADDS on top of the inherited environment — is `spawnLaunch`'s answer only: the askpass variables of a password SSH entry (`SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE`, `CREDS_SSH_PASSWORD`, `sshAskpass.ts:43-45`) and, when the extension's agent serves the run, its `SSH_AUTH_SOCK`; no `CREDS_REF_n` and no resolved value. Since the re-review of epoch 4 the inherited part loses the host's `SSH_AUTH_SOCK` and every `CREDS_REF_` name (`withoutEnv`, §E3.4 F-S1), so the approved row holds for the WHOLE environment: no `CREDS_REF_` key, no host socket, no resolved value, and the keys added or changed over the base are exactly askpass and our socket (F6). Other ordinary variables (`PATH`, `HOME`, …) are inherited as by every spawned program. The values reach the remote only in `stdinText`. The askpass variables carry the SSH entry's own password and are the ACCEPTED LIMIT of `research/PLAN_windows_shell_quoting_injection.md` §8 (owner, 2026-11-10; `research/module_extension.md:221`): a person's own `SendEnv` pattern that matches them, with a server `AcceptEnv` that matches too, sends the password to the server. E3 adds no `-o SendEnv=-NAME`: it was MEASURED not to remove a wildcard pattern (OpenSSH removes only a literally equal one; `ssh -G` on OpenSSH 10.2p1 and Windows OpenSSH 9.5p2 still listed `sendenv CREDS_*`), so it would only look like protection. | D12 promises the values never in argv, the remote `ps` or a history; nothing gains by putting them in the local ssh's environment, and there no `SendEnv` can reach them. The password limit is the same on SSH Connect and E2's password terminals today; this road does not widen it. |
| E3-D11 | **The masked run is bounded** (round 1, item 1). (a) Connecting: the argv carries `-o ConnectTimeout=10` in both branches (`sshExecCommand.ts:115`), and the password branch `NumberOfPasswordPrompts=1` (`:106`), the key branch `BatchMode=yes` (`:107`): ssh answers no prompt from stdin. That is what we ASK ssh; hand check 3 observes the effect (a wrong password or a dead host ends with ssh's error, not a hang). (b) Closing: the terminal's `close()` calls `killChild(child, { tree: true })` (`childKill.ts:81-87`) as today: on Windows `taskkill /pid <pid> /T /F` (`:32-37`) ends `ssh.exe` and a jump host's helper `ssh`; on POSIX `SIGTERM`, then `SIGKILL` after `KILL_GRACE_MS` = 2000 (`:23`), to the child, which in argv mode IS `ssh` (no shell between). (c) Stdin: the script is written once, in `open()`, right after the spawn; when the run ends (E3-D7's once-only `ended()`), the child's stdin is DESTROYED, so a part of the script not yet taken by the child (it holds the values) is dropped, never written later; `open()` after the run ended spawns nothing and writes nothing — also after a throw from `terminal.show()`, which ends the run before it rethrows (E3-D7). (d) This is the LOCAL end (round 2, R2-1): see §S1.2 for the remote command. | Parent §4.4: no byte to stdin before trust, and the run must end. A child that never reads stdin (stalled before the server answers) would otherwise keep the script, values included, in the extension host's write buffer for as long as it lives. |
| E3-D12 | **The launch's warning is a line of the banner, not a toast** (round 1, item 3). `maskedOverSshBanner(described, warning, target, secrets)` (pure, `remoteLaunch.ts`) joins with `\r\n`: `described`; `Note: <warning>.` when `warning` is set; `secretsOverSshBanner(target, secrets)`. Nothing calls `showWarningMessage` for it. | A one-argument toast is not awaited and races the launch: the run's output can be on screen before it, or the person closes the toast unread. The banner is written in `open()` before the first byte of output. |
| E3-D13 | **`LaunchPlan` is NOT changed** (round 1, item 2; E3.L flag 1 WITHDRAWN). `commands/runCommands.ts` keeps importing `resolveCommand` (`:9`) for its two LOCAL uses: `arrowLine` (`:170`) and the local Run with Secrets' `commandJob` (`:350`, whose `parts` feed `buildCommandLineWithRefs`, `:430`). After S2 the road scan's `RESOLVE_IMPORTERS` (`test/launchRoadScan.test.ts:103`) is `['commands/runCommands.ts', 'remoteLaunch.ts']`. Counted as parent entry 2.2; since the epoch-3 revision, parent §4.5 (1) names this list, and the guarantee that the import target served is held by the no-local-sink tests (parent §4.5 (5); §S1.6 LN1-LN11, §S2.5 AG8). | `LaunchPlan` is E1.S2's cornerstone type (`remoteLaunch.ts:152-167`); widening it for a local road reopens a reviewed cornerstone for no gain on the SSH roads, which already read only `planLaunch`. |
| E3-D9 | **The agent's SSH call is injected**, as `overSsh` on the deps of `terminalRunAction`. Its implementation `execOverSsh(deps)` lives in `sshUseActions.ts` (the `vscode` side) and is shared with `sshExecAction`. `sshDepsFor` (`sshUseActions.ts:383-405`) returns it, typed `SshWiredDeps = SshUseDeps & { readonly overSsh: OverSsh }` (spec §6; with today's return type `SshUseDeps` the typecheck fails), and `agentDeps` already spreads `sshDeps` (`extension.ts:629-637`). | `agentUseActions.ts` imports no `vscode` and its tests load it directly; `resolveExecAuth` and `materializeKnownHosts` reach `vscode` (`keyInstaller.ts:5`, `hostKeyTrust.ts:3`). And `extension.ts` is at its size ratchet (1003). |
| E3-D10 | **No new two-argument prompt and no renamed prompt function** (as E2-D10). If `test/promptSites.test.ts` goes red, stop and report to the judge. Two edits are named in advance and are NOT that case (spec §13): `test/promptSiteLedger.ts:186-187`, the two signing rows, gain `run`; `test/promptSites.test.ts:234` loses `run` from its "keep nothing" list. Any other red there is. | The prompt ledger keys rows by `file#function#…`. |

**The exact sentences and texts** (each lives once, as a constant or a function; tests compare with it):

| Name | Where | Text |
|---|---|---|
| `secretsLocalOnly(name)` | `remoteLaunch.ts` | `Run with Secrets over SSH works only in a local VS Code window, and this window is not one. Nothing was run: open "<name>" from a local window.` |
| `NO_REFERENCE(name)` | `commands/runCommands.ts` (today's literal at `:369-371`, made a function; text unchanged) | `"<name>" holds no creds:// reference. Write one as a value — creds://<account email>/<entity>/<field> — then run this again. Nothing was run.` |
| `secretsOverSshBanner(target, secrets)` | `remoteLaunch.ts` | `Over SSH to <target>. The values go to the remote login shell on its standard input, never on a command line, and are replaced with <CREDS_MASKED:NAME> in what it prints here.<caveat> This run is not interactive: there is no terminal, and the command reads an empty input, so a command that asks a question usually stops. To answer questions, use Run in Terminal instead; the values are not injected there.` |
| `<caveat>` = `shortValuesCaveat(secrets)` | `outputMask.ts` (new export, beside `maskingBanner`, which moves there too, round 2 M7; the words of `extension.ts:972-976` moved, not changed) | `''`, or ` NOT masked, because they are too short to replace without mangling ordinary output: <labels> — a one-time code is six digits, so treat this window as showing it.` |
| `NO_SSH_TO_SPAWN` | `sshProgram.ts` (E3-D5) | `No ssh client was found to start: no absolute folder of PATH holds ssh.exe, and C:\Windows\System32\OpenSSH\ssh.exe is not there. Nothing was run: install the OpenSSH client, then run this again.` |
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
- `const spawn = host.sshRoad.spawnLaunch(ready.snapshot, ready.env)` (E3-D5); `refused` → warn `spawn.reason`; return.
  (No value is read and nobody is asked yet; the owner's `finally` cleans the session.) Its `warning` is NOT shown as a
  toast: it is a line of the banner (E3-D12), on screen before the first byte of output. No `showWarningMessage` on this
  path.
- `passGates(host, job.entry, trustLineFor(ready.entity, ready.jump, plan.line), undefined)` false → return. This is the
  trust modal and then `runDependenciesFirst` (`:101-111`). No child exists and no byte is written yet.
- `const resolution = await resolveSecretRefs(refs.refs, host.refSource)`; not ok → today's error message; return.
- `const resolved = withValues(refs, resolution.values, { env: {}, body: '' })` (`:401-411`, unchanged).
- The hand-over (E3-D7; round 2, R2-2), in `maskedOverSsh`: ONE synchronous call, no `await` in it, inside
  `spawnOverSsh`'s `try … finally` (the guarded block). No `catch` of its own:

```ts
sessions.handOverToRun(ready, (ended) => {          // the session stays on the owner's list until this returns
  runInMaskedTerminal({
    name: maskedRunTitle(name),
    argv: [spawn.program, ...launch.argv],
    cwd: spawn.cwd,                                                  // the extension's storage folder, never the workspace (E3-D5)
    env: spawn.env,                                                  // what the run ADDS: askpass + SSH_AUTH_SOCK only (E3-D8)
    stdinText: secretsStdin(resolved.env, secretsRemoteLine(plan, refs)),
    secrets: resolved.secrets,
    banner: maskedOverSshBanner(described, spawn.warning, launch.target, resolved.secrets),
    onEnded: ended,                                                  // the list's own once-only end
  });
});
// A throw from the hand-over or from the creation leaves the session on the list: the owner's finally cleans it, once.
```

**ONE SNAPSHOT** (as code review checks it): from `prepare` to the spawn there is no `storage.getNode` of the SSH id, no
`sshLinkOf`, and `plan.ssh` is not read again. The trust line, the argv, the spawn program, its folder and the banner
target are built from `ready` only (`ready.entity`, `ready.jump`, `ready.options`, `ready.snapshot`, `ready.target`).

### S1.2 What ssh does with stdin, why nothing else reads it, and what ends the run

`buildSshExecArgv` (`sshExecCommand.ts:94-140`) gives the key branch `-o BatchMode=yes` and the password branch
`-o NumberOfPasswordPrompts=1` with `SSH_ASKPASS_REQUIRE=force` in the environment; both have `ConnectTimeout=10` and
`StrictHostKeyChecking` (`accept-new`, or `yes` with the pinned file). So ssh answers no prompt from stdin, and stdin goes
whole to the remote command. No `-t`; and since the re-review of epoch 4 `-T` is the FIRST word (`noTty: true`,
parent D16), because "no `-t`" alone was no remote pty only while the person's ssh config said nothing: with
`RequestTTY force` there, ssh asked for a pty, and the script on stdin would be typed into a terminal and echoed back
(security spec §18.1; `ssh -G` measured, a real session is hand check 3). The remote command is `SECRETS_REMOTE_COMMAND`
(`remoteLaunch.ts:298`, `"${SHELL:-sh}" -s`), the last argv element, after `--` and the destination.

**What ends the run** (E3-D11; the scenarios K1, K2, M2, M9-M11):

| Moment | What bounds it | Who observes it |
|---|---|---|
| connecting, authenticating | `-o ConnectTimeout=10` (both branches) and no prompt answered from stdin (`BatchMode=yes` or `NumberOfPasswordPrompts=1` with `SSH_ASKPASS_REQUIRE=force`) — what we ASK ssh | K1 and K2 assert the words are SENT; hand check 3 observes the effect (a wrong password or a dead host ends with ssh's error, not a hang) |
| the remote command runs | the person: the masked terminal is the run's only handle; closing it stops the LOCAL `ssh` (next row), not always the remote command (below the table) | — (by design: a long command is allowed to run) |
| the terminal closes | `pty.close()` → `killChild(child, { tree: true })` (`maskedTerminal.ts:107`, unchanged): Windows `taskkill /T /F` on the tree; POSIX `SIGTERM`, then `SIGKILL` after `KILL_GRACE_MS` | M9: a child that ignores `SIGTERM` is gone after the close; the kill is recorded with `{ tree: true }` |
| the run ends (any of the ways of E3-D7) | `ended()` destroys the child's stdin: an unwritten tail of the script (values included) is dropped, never written later; `open()` after the end does nothing, also after a throw from `terminal.show()` | M9 (stdin destroyed with a script larger than the pipe takes), M6b (`close()` then `open()` spawns nothing), M10b (`show()` throws, then `open()` spawns nothing) |

**This table is the LOCAL end** (round 2, R2-1). It says when the run on THIS machine ends. The remote command can keep
running after a close: there is no `-t`, so it has no terminal on the server, and sshd sends it no hangup when the
connection drops. A command that only computes or sleeps runs on until it ends by itself; one that writes to the closed
connection usually ends on `SIGPIPE`. That is sshd's behaviour, not ours, and no unit test here observes it. The help
says so (§S1.3, the `usage` text: "Closing its terminal stops ssh on this machine; the command on the server has no
terminal, so it can keep running there until it ends").

Not observed by a unit test, and so written as a request, not a fact: on POSIX `childKill` signals `ssh` only; with a jump
host, `ssh`'s `ProxyJump` helper is its own child, and that helper ending with it is OpenSSH's behaviour, not ours. Hand
check 3 (parent §10) observes it: with a jump host, `pgrep -f 'ssh .*-W'` on this machine is empty a few seconds after the
masked terminal is closed mid-run. S3 hands that line to the owner with hand check 3.

### S1.3 The brief — every file, the place, the change

(Built in epoch 3. The re-review of epoch 4 adds to it: `sshExecCommand.ts` `noTty` and `ownAgent`, `sshProgram.ts`
`envWithout` and `E3_INHERITED_DROP`, `secretsArgv`'s options, `SpawnLaunch.ownAgent` and `.withoutEnv`,
`MaskedRunOptions.withoutEnv`, `secretsLaunch`'s third parameter, `launchesOf`'s order, `maskedOverSsh` passing
`withoutEnv`, and the doc of `sshRoad.ts:31-33`, `:39-41`. They are §E3.4 F-S1, not built.)

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
| `sshLinkRefusal`'s doc, its paragraph `:120-123` (round 2, Minor 8) | "Run with Secrets (until E3)" becomes "Run with Secrets for a SCRIPT that a sync linked (a linked command runs over SSH since E3.S1)". S2 takes "the agent's run" out of the same list (§S2.3). |

**`outputMask.ts`** (pure; 100 → about 140 lines; round 2, M7) — `maskingBanner` MOVES here from `extension.ts:958-978`
(its doc and its body, the text unchanged), and beside it `export function shortValuesCaveat(secrets: readonly { value:
string; label: string }[]): string` with the `short` filter on `MIN_MASKABLE_LENGTH` and the `caveat` words
(`extension.ts:969-976`); `maskingBanner` calls it. `MIN_MASKABLE_LENGTH` is already re-exported here (`:35`).
**`extension.ts`** — no line added: the block `:958-978` is deleted, and the import on `:88`
(`import { MIN_MASKABLE_LENGTH } from './outputMask';`, used only by that block) becomes, on the same line,
`export { maskingBanner } from './outputMask';`. So `commands/runCommands.ts:15` (`import { maskingBanner } from
'../extension'`) and the worlds that stand `../extension` in (`test/arrowWorld.ts:74`, `test/commandLineHandlers.test.ts:38`,
`test/sshLinkRoads.test.ts:203`, `test/sshRoadCopies.test.ts:111`) do not change, and no unit test loads `../extension`
(K9 tests the banner in `outputMask`). The file shrinks by about 21 lines; `test/sizeRatchet.test.ts` accepts a shrink. The
banner text of the local road does not change (`test/maskedTerminal.test.ts` and the banner tests stay green unchanged).

**`maskedTerminal.ts`** (172 → about 250 lines)

| Place | Change |
|---|---|
| `MaskedRunOptions` `:27-53` | A union, so exactly one of `commandLine` and `argv` is set (in the type, not in a comment): the shell variant `{ commandLine: string; shell?: string; cwd?: string }` (today), and the argv variant `{ argv: readonly [string, ...string[]]; cwd: string }` — the program and its arguments, spawned with `shell: false`; `cwd` is REQUIRED there, so argv mode never falls back to the workspace folder (E3-D5, round 2 B1). Two fields for both: `stdinText?: string` — written to the child's stdin once, right after the spawn, then stdin is closed; keystrokes are then NOT forwarded; `onEnded?: () => void` — called exactly once for a run whose terminal was made, when the run ends (E3-D7: `close`, `error`, a failed start, a close before the start, a throw from `show()`); a throw from `createTerminal` is the caller's to clean. The `env` doc says: on top of the parent environment; in argv mode it carries no value (E3-D8). The `cwd` doc says: the first workspace folder when omitted, shell variant only. |
| `spawnChild` `:155-172` | One spawn line, from an exported helper `launchOf(options)` that answers `{ program, args, shell, cwd }`: argv mode → `{ program: argv[0], args: argv.slice(1), shell: false, cwd: options.cwd }`; else `{ program: options.commandLine, args: [], shell: shellOption(options.shell), cwd: workingDirectory(options.cwd) }` (today, `:151-153`). The line becomes `const child = childProcess.spawn(launch.program, launch.args, {` with `shell: launch.shell` and `cwd: launch.cwd`. |
| `runInMaskedTerminal` `:66-119` (round 2, M5) | About 45 code lines today; with the additions it goes over `max-lines-per-function` (50, `eslint.config.mjs:31`; a nested function's lines count for the outer one). So the pseudoterminal gets its own function: `maskedRun(options): { pty: vscode.Pseudoterminal; ended: () => void }` holds the run's state (`child`, `over`) and builds the pty; its `open`, `close` and `handleInput` each call one named module function (`openRun`, `closeRun`, `inputRun`) with that state. `runInMaskedTerminal` keeps only `const run = maskedRun(options)`, `createTerminal({ name: options.name, pty: run.pty })`, the guarded `show()` (row below) and `return terminal`. Every function ≤ 50 code lines, complexity ≤ 4; no `eslint-disable`. |
| the run's state (was beside `let child`, `:69`) | `over = false`, and `ended = (): void => { if (over) { return; } over = true; child?.stdin.destroy(); options.onEnded?.(); }` (E3-D11 (c): the unwritten tail of the script is dropped with the stdin). |
| `open()` `:74-98` → `openRun` | First line: `if (over) { return; }` (a close before the start, or a `show()` that threw: nothing is spawned, nothing written). After `child = started.child`: `if (options.stdinText !== undefined) { child.stdin.end(options.stdinText); }` (the `stdin` `error` listener of `:167` is already on). `ended()` is called on `!started.ok` (after `closer.fire(1)`), and in the child's `error` (`:87-90`) and `close` (`:91-97`) handlers, after their writes. |
| `close()` `:99-108` → `closeRun` | `child === undefined` → `ended()` (the terminal closed before the child started); else `killChild(child, { tree: true })` as today (its `close` event then calls `ended()`). |
| `handleInput` `:109-113` → `inputRun` | `stdinText !== undefined` → return without echo or write (stdin is the script, and closed). |
| `terminal.show()` `:117` (round 2, Minor 7) | In a `try`. A throw comes AFTER `createTerminal`, so VS Code may still call `open()` later. The `catch`: `run.ended()` first (the run is over: a later `open()` spawns nothing and writes nothing; `onEnded` is called, once), then `terminal.dispose()` (its `close()` finds the run over and does nothing), then rethrow. The road's session is still on the owner's list, and its once-only end has already run, so the `finally` cleans nothing twice (E3-D7). |
| `killChild` comment `:103-106` | Add: in argv mode there is no shell and the child IS the program (`ssh`); `tree: true` stays — on Windows it also ends a jump host's helper `ssh`; on POSIX that helper is OpenSSH's to end (E3-D11, hand check 3). |
| file doc `:8-25` | One paragraph: the argv mode of Run with Secrets over SSH (E3.S1): no shell, a script on stdin then end of input, no keystrokes forwarded; the run ends exactly once (`onEnded`), and its end destroys stdin. The sentence `:24` ("Input is forwarded…") gains "— except in argv mode with a script on stdin". |

**`sshProgram.ts`** (pure) — add `export function sshSpawnLaunch(entity: EntityMetadata, socket: string | undefined, platform: NodeJS.Platform): { program: string; env: NodeJS.ProcessEnv; warning?: string }`
= `openSshBinary('ssh', entity.agentForward === true, platform)` and `agentForwardEnv({}, entity.agentForward === true, socket)`.
`sshUseActions.ts` `agentAwareLaunch` (`:95-109`) calls it and merges `env` over its base; its `deps.note` of the warning stays.
Also add (round 2, B1; used by `SshRoad.spawnLaunch` only) `export function spawnableSshProgram(program: string, platform:
NodeJS.Platform, pathValue: string | undefined, exists: (candidate: string) => boolean): string | undefined` with the rules
of E3-D5 (off Windows: `program`; on Windows: kept when it has a drive letter or a `\\` prefix, else the first
`path.win32.join(dir, 'ssh.exe')` that exists for an absolute `dir` of `pathDirsOf(pathValue, ';')`, else
`builtInOpenSsh('ssh')` when it exists, else `undefined`), and `export const NO_SSH_TO_SPAWN` (the E3.0 text). Its doc
names CWE-426 and points at `openSshBinary`'s doc (`:186-197`): this is the same hole closed for a spawn that also gets a
working folder.

**`sshRoad.ts`** (226 → about 260 lines)

| Place | Change |
|---|---|
| `SshRoad` `:21-33` | `prepare(accountId, ssh, use?: 'terminal' \| 'spawn')` with a doc for `'spawn'` (E3-D4); new `spawnLaunch(ssh: EntityMetadata, env: Readonly<Record<string, string>> \| undefined): SpawnLaunch` with `type SpawnLaunch = { kind: 'spawn'; program: string; cwd: string; env: Record<string, string>; warning?: string } \| { kind: 'refused'; reason: string }` (E3-D5): `const base = sshSpawnLaunch(ssh, deps.agentSocket?.(), process.platform)`; `const program = spawnableSshProgram(base.program, process.platform, process.env.PATH, fs.existsSync)`; `undefined` → `{ kind: 'refused', reason: NO_SSH_TO_SPAWN }`; else `{ kind: 'spawn', program, cwd: deps.storageDir, env: { ...base.env, ...env }, warning: base.warning }` (the `warning` key absent when undefined). |
| `SshRoadDeps` `:36` | `Pick<SshUseDeps, 'storage' \| 'storageDir' \| 'relays' \| 'servesKeyForEntity'> & Partial<Pick<SshUseDeps, 'agentSocket'>>`. |
| `sshRoadOf` `:38-52` | `optionsFor(ssh, use)`: `agentServesKey: use === 'spawn' ? false : deps.servesKeyForEntity?.(ssh) === true`; everything else as today (`isolate: true`). |
| `OwnedSessions` `:61-81` (round 2, R2-2) | The list becomes a `Map<ReadySsh, () => void>`: `own(ready)` stores `once(() => ready.cleanup())` (a local `let done = false` guard, so a second call does nothing even if a future `cleanup()` is not idempotent); `cleanAll()` calls each stored end; `handOver` (the terminal's) deletes as today. Add `handOverToRun(ready: ReadySsh, start: (ended: () => void) => void): void` with the doc of E3-D7, in its three steps: `const ended = owned.get(ready) ?? stored(ready)` (put on the list when absent), `start(ended)`, then `owned.delete(ready)`. The class doc (`:54-60`) gains: "A session `handOverToRun`ed to a spawned run stays on the list until the run exists, and the list and the run share its one once-only end; a throw while the run is being made is cleaned by `cleanAll`, once." |

**`commands/runCommands.ts`** (436 → about 520 lines)

| Place | Change |
|---|---|
| imports `:13-26` | `planRefs` stays; `resolveCommand` from `../commandLine` (`:9`) STAYS (E3-D13); add `windowKind` to the `../hostShell` import; `../remoteLaunch` adds `RemotePlan`, `maskedOverSshBanner`, `secretsLaunch`, `secretsLocalOnly`, `secretsRemoteLine`, `secretsStdin`, `trustLineFor`; `../sshRoad` adds `ownedSessions`; `ReadySsh` type from `../sshSession`; `RefPlan` from `../runPlan`. |
| `runWithSecrets` `:299-308` | §S1.1 steps 2-4: `const job = …; if (job === undefined) return; const link = secretsLinkOf(host, job); await (link.kind === 'none' ? runSecretsHere(host, job) : runSecretsOverSsh(host, job, link));`. `secretsLinkOf`: a script → `{ kind: 'none' }`; a command → `sshLinkOf(…)`. |
| new `runSecretsHere(host, job)` | Today's `:301-307` (gates with `secretsRefusal`, `resolvedRefs`, `runMasked`), unchanged. |
| `secretsRefusal` `:311-313` | Unchanged (the script with a synced link, and the OS check). Its doc: the script path and the local road; a linked command goes over SSH (E3.S1). |
| `resolvedRefs` `:369-371` | The literal becomes `NO_REFERENCE(job.entry.name)`; same text. |
| new `runSecretsOverSsh`, `spawnOverSsh`, `trustedThenSpawned`, `maskedOverSsh` | §S1.1 step 4 and 5. `maskedOverSsh(sessions, run)` — `run` a small record `{ job, plan, refs, ready, launch, resolved, spawn }` — is the ONLY function that calls `handOverToRun` and `runInMaskedTerminal`, in the one synchronous call of §S1.1, with no `catch` of its own (keep each ≤ 50 lines, complexity ≤ 4, parameters ≤ 4). `spawnLaunch` is called right after `secretsLaunch`, before `passGates`; its `refused` is a warning and a return (E3-D5). No `showWarningMessage` for `spawn.warning` (E3-D12). |
| file doc of Run with Secrets `:288-298` | One paragraph: a linked command runs over SSH (E3.S1): the order, ssh by argv, the script on stdin, local window only, the banner. |

**Test helpers**

| File | Change |
|---|---|
| `test/arrowWorld.ts` `:23` and `:134` | The `masked` record type takes the new options (`argv?`, `cwd?`, `env`, `stdinText?`, `secrets`, `banner`, `onEnded?`, `commandLine?`). `ArrowOptions` gains `remoteName?: string`, set on the stub's `env.remoteName` (absent = a local window). Expose `events` pushes: the mock of `runInMaskedTerminal` pushes `'spawn'` into the road's shared `events` when the test passes one (`ArrowOptions.events?: string[]`); the vault's `refSource` read pushes `'resolve'` the same way (wrap `vaultOf`'s source in the test). `ArrowOptions` also gains `onMasked?: (options: <the masked record>) => void`, called by the mock AFTER it records the run: a test throws from it (a failed terminal creation, O5) or calls `options.onEnded?.()` in it (a run that ended while being created, O8; a `show()` that threw after the masked run ended itself, the same shape). |
| `test/sshRoadWorld.ts` `fakeRoad` `:76-` | `prepare(accountId, ssh, use)` records `use` in a NEW array `uses: string[]` (NOT in `calls`: E2 tests deep-equal `calls`). New `spawnLaunch(ssh, env)` → `{ kind: 'spawn', program: 'ssh', cwd: '/storage', env: { ...(env ?? {}) }, warning: spawnWarning }` (`warning` key absent when `spawnWarning` is undefined), or `{ kind: 'refused', reason: spawnRefused }` when `spawnRefused` is set, recorded in `launches`; `spawnWarning` and `spawnRefused` are new LAST parameters of `fakeRoad` (`fakeRoad(script, lookup, events, spawnWarning?, spawnRefused?)`), so E2's calls are unchanged. New `cleanupCalls: string[]`: one `'<sshId>#<n>'` per call of a ready's `cleanup`, repeats INCLUDED (`cleaned` keeps recording only the call that did something, `:107-112`), so a test can see "exactly once" through an idempotent cleanup. |

**The road scan — `test/launchRoadScan.test.ts`** (same commit; the stale-entry test forces it)

| List | Change |
|---|---|
| `SENDS` `:20` | Add `/\brunInMaskedTerminal\s*\(/g`: the linked road calls the masked run directly, and no pattern saw it. |
| `ALLOWED_SENDS['commands/runCommands.ts']` `:136-141` | Add `{ line: 'runInMaskedTerminal({', because: 'Run with Secrets: the local child through its shell (runMasked), and the linked child by argv with the script on stdin (E3.S1)', count: 2 }`. `runMasked(host, job, refs);` and its declaration stay (the local road). |
| `ALLOWED_SENDS['maskedTerminal.ts']` `:178` | The spawn line's new text `const child = childProcess.spawn(launch.program, launch.args, {`, `because: 'the masked child of Run with Secrets: through a shell (local) or by argv with shell false (over SSH, E3.S1)'`; add `export function runInMaskedTerminal(options: MaskedRunOptions): vscode.Terminal {` (`because: 'the declaration'`). |
| `REFUSAL_SITES` `:189-195` | Unchanged: `commands/runCommands.ts:secretsRefusal` STAYS (the script path). |
| `RESOLVE_IMPORTERS` `:103` | Unchanged in S1, and `commands/runCommands.ts` STAYS in it after E3 (E3-D13: `LaunchPlan` is not changed; the local road's `parts` and E2's `arrowLine` resolve locally). S2 removes only `agentUseActions.ts`. S1 rewrites the list's doc comment (`:99-102`) and the failure message (`:107`), which contradict parent §4.5 (1) after the re-review. The comment: `Sorted, compared whole, so a new importer and a vanished one both fail. After E3 the list is commands/runCommands.ts (its LOCAL roads only, E3-D13) and remoteLaunch.ts (parent §4.5 (1)). It proves who imports, not where a resolved line flows: that a linked entry reaches no local sink is linkedNeverLocal.test.ts (parent §4.5 (5)).` The message: `a new file imports resolveCommand: a linked entry must take its launch from remoteLaunch.ts (planLaunch); add the file's no-local-sink tests to linkedNeverLocal.test.ts and edit this list in the same commit`. |
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

And the article `secret-references` (`help<Lang>.ts:175-182`). Round 2 (the lead's Opus review, Minor 5; R2-1): `whatItIs`
(`:177`) and the first sentence of `usage` (`:180`) say today that the value reaches ONLY the child's environment, which
is false over SSH, and the first draft's "never in the server's process list" was too strong: on the server the values
are in the environment of the remote command (`ps e`, `/proc/<pid>/environ`, for the same user and root). So the two
places are REWORDED in all five languages (replaced, not appended to), and the over-SSH text is appended at the end of
`usage`. The apostrophe is the file's own `’`. The rest of each field stays as it is.

`whatItIs` — the whole new value:

- EN: `` Write `creds://you@corp.com/prod-db/password` where a value would go, then Run with Secrets: the value is never on a command line — on this machine it goes only into the child process’s environment, and over SSH it goes on standard input to the server’s login shell, which puts it into the command’s environment there. Every appearance of it in the output is replaced with a named marker. ``
- DE: `` Schreiben Sie `creds://you@corp.com/prod-db/password` dorthin, wo ein Wert stünde, und dann Run with Secrets: der Wert steht nie auf einer Kommandozeile — auf diesem Rechner geht er nur in die Umgebung des Kindprozesses, und über SSH geht er über die Standardeingabe an die Login-Shell des Servers, die ihn dort in die Umgebung des Befehls setzt. Jedes Vorkommen davon in der Ausgabe wird durch einen benannten Marker ersetzt. ``
- ES: `` Escriba `creds://you@corp.com/prod-db/password` donde iría un valor, y luego Run with Secrets: el valor nunca va en una línea de comandos — en esta máquina va sólo al entorno del proceso hijo, y por SSH va por la entrada estándar a la shell de inicio de sesión del servidor, que allí lo pone en el entorno del comando. Cada aparición suya en la salida se sustituye por un marcador con nombre. ``
- RU: `` Пишете `creds://you@corp.com/prod-db/password` вместо значения, затем Run with Secrets: значение никогда не попадает в командную строку — на этой машине оно идёт только в окружение дочернего процесса, а через SSH — через стандартный ввод в оболочку входа сервера, которая кладёт его там в окружение команды. Каждое его появление в выводе заменяется именованным маркером. ``
- UK: `` Напишіть `creds://you@corp.com/prod-db/password` там, де мало б стояти значення, і виконайте Run with Secrets: значення ніколи не потрапляє в командний рядок — на цій машині воно йде лише в середовище дочірнього процесу, а через SSH — через стандартне введення до оболонки входу сервера, яка кладе його там у середовище команди. Кожна його поява у виводі замінюється іменованим маркером. ``

`usage` — its FIRST sentence, replaced (the sentence about the broker after it stays):

- EN: `argv carries the reference NAME; the value travels in an environment only — the local child’s or, over SSH, the remote command’s (it reaches the server on standard input, never in argv).`
- DE: `argv trägt den NAMEN des Verweises; der Wert reist nur in einer Umgebung — der des lokalen Kindes oder, über SSH, der des Befehls auf dem Server (dorthin gelangt er über die Standardeingabe, nie in argv).`
- ES: `argv lleva el NOMBRE de la referencia; el valor viaja sólo en un entorno — el del hijo local o, por SSH, el del comando en el servidor (llega allí por la entrada estándar, nunca en argv).`
- RU: `argv несёт ИМЯ ссылки; значение едет только в окружении — локального потомка или, через SSH, команды на сервере (туда оно попадает через стандартный ввод, никогда не через argv).`
- UK: `У argv їде НАЗВА посилання; значення подорожує лише середовищем — локального дочірнього процесу або, через SSH, команди на сервері (туди воно потрапляє через стандартне введення, ніколи не через argv).`

`usage` — appended at its end (a leading space):

- EN: ``  For an entry set to run over SSH, the values go to the server’s login shell on its standard input as export lines — never on a command line or in the shell history; on the server they are in the environment of the command, where the same user and root can read them (for example with `ps e` or `/proc/<pid>/environ`), as for a run on this machine. The output is masked the same way. That run is not interactive: the command’s input is empty, so a command that asks a question usually stops; use *Run in Terminal* for such a command (the values are then not injected). Closing its terminal stops ssh on this machine; the command on the server has no terminal, so it can keep running there until it ends. It works only in a local VS Code window. ``
- DE: ``  Für einen Eintrag, der über SSH laufen soll, gehen die Werte als export-Zeilen über die Standardeingabe an die Login-Shell des Servers — nie auf eine Befehlszeile und nie in den Verlauf der Shell; auf dem Server stehen sie in der Umgebung des Befehls, wo derselbe Benutzer und root sie lesen können (zum Beispiel mit `ps e` oder `/proc/<pid>/environ`), wie bei einem Lauf auf diesem Rechner. Die Ausgabe wird genauso maskiert. Dieser Lauf ist nicht interaktiv: Die Eingabe des Befehls ist leer, darum hält ein Befehl, der eine Frage stellt, meist an; nutzen Sie für einen solchen Befehl *Run in Terminal* (die Werte werden dann nicht eingesetzt). Das Schließen seines Terminals beendet ssh auf diesem Rechner; der Befehl auf dem Server hat kein Terminal und kann dort weiterlaufen, bis er endet. Das geht nur in einem lokalen VS-Code-Fenster. ``
- ES: ``  En una entrada que se ejecuta por SSH, los valores van a la shell de inicio de sesión del servidor por su entrada estándar como líneas export — nunca en una línea de comandos ni en el historial de la shell; en el servidor están en el entorno del comando, donde el mismo usuario y root pueden leerlos (por ejemplo con `ps e` o `/proc/<pid>/environ`), igual que en una ejecución en esta máquina. La salida se enmascara igual. Esa ejecución no es interactiva: la entrada del comando está vacía, así que un comando que hace una pregunta suele detenerse; use *Run in Terminal* para ese comando (los valores no se inyectan entonces). Cerrar su terminal detiene ssh en esta máquina; el comando en el servidor no tiene terminal y puede seguir ejecutándose allí hasta que termine. Solo funciona en una ventana local de VS Code. ``
- RU: ``  Для записи, которая выполняется через SSH, значения идут в оболочку входа сервера через её стандартный ввод строками export — никогда не в командную строку и не в историю оболочки; на сервере они находятся в окружении команды, где их может прочитать тот же пользователь и root (например, через `ps e` или `/proc/<pid>/environ`), как и при запуске на этой машине. Вывод маскируется так же. Такой запуск не интерактивен: ввод команды пуст, поэтому команда, которая задаёт вопрос, обычно останавливается; для такой команды используйте *Run in Terminal* (значения тогда не подставляются). Закрытие его терминала останавливает ssh на этой машине; у команды на сервере нет терминала, и она может продолжать работать там, пока не завершится. Это работает только в локальном окне VS Code. ``
- UK: ``  Для запису, що виконується через SSH, значення йдуть до оболонки входу сервера через її стандартне введення рядками export — ніколи не в командний рядок і не в історію оболонки; на сервері вони є в середовищі команди, де їх може прочитати той самий користувач і root (наприклад, через `ps e` або `/proc/<pid>/environ`), як і під час запуску на цій машині. Виведення маскується так само. Такий запуск не інтерактивний: введення команди порожнє, тож команда, що ставить запитання, зазвичай зупиняється; для такої команди використовуйте *Run in Terminal* (значення тоді не підставляються). Закриття його терміналу зупиняє ssh на цій машині; команда на сервері не має терміналу й може працювати там далі, доки не завершиться. Це працює лише в локальному вікні VS Code. ``

The code spans (`` `ps e` ``, `` `/proc/<pid>/environ` ``) are written with plain backticks inside the double-quoted string,
as `whatItIs` already does for `creds://…`; no `"` in any text.

Check the line numbers of `secret-references` in each file before the edit (`grep -n "'secret-references'"`: 175 in all
five on a5ddd73 and on e57eb80f; `whatItIs` is the second line after it, `usage` the fifth). No existing test pins
the old `whatItIs` or `usage` words (checked: no test file quotes them).

**README** (`src_vs_code/README.md`)
- `:256-260` (the *Runs over SSH* bullet): `*Run with Secrets* and an agent's run still refuse such an entry` → *Run with
  Secrets* runs it there too, from a local window; an agent's run still refuses such an entry (wrapped like its neighbours).
- `## Secret references and *Run with Secrets*` (`:379-`): one paragraph at its end, the EN sentences appended to `usage`
  above (round 2: the reworded ones, with the remote environment and the close).

**research/**
- `research/module_extension.md` `:2367-2369` ("The agent's `creds_run` (`capturedRun`) and *Run with Secrets* spawn on
  THIS machine"): add "— unless the entry runs over SSH (E3)".
- `:2393-2400` ("The refusal on every road"): Run with Secrets leaves the caller list, except a SCRIPT that a sync linked.
  `:2248` ("It is still called by Run with Secrets, the agent's run, …"): the same.
- A new paragraph after the E2.S3 paragraph (`:2437-2455`, before `### Which shell parses the line` at `:2457`), **Run
  with Secrets over SSH (E3.S1)**: the order; the checks before prepare (plan, local window, no reference);
  `prepare(…, 'spawn')` and why (E3-D4); `secretsLaunch` (argv, `-o BatchMode=yes` or askpass, `ConnectTimeout=10`,
  `SECRETS_REMOTE_COMMAND` last); `secretsRemoteLine` (E3-D2); the script on stdin then end of input; `spawnLaunch`
  (E3-D5: on Windows an absolute program, and the storage folder as the working folder, never the workspace — CWE-426)
  and its warning as a banner line (E3-D12); the one owner and the once-only `handOverToRun` that leaves the list only
  when the run exists (E3-D7); what ends the run (E3-D11: the close kills through `childKill`, the end destroys stdin;
  the remote command may keep running, §S1.2); the child's environment
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
| `extension.ts` | 1003 | about 982 | ratchet 1003 | `maskingBanner` moves out, `:88` rewritten in place (M7); it shrinks |
| `commands/runCommands.ts` | 436 | about 520 | 800 | — |
| `remoteLaunch.ts` | 369 | about 430 | 800 | — |
| `maskedTerminal.ts` | 172 | about 250 | 800 | the pty in its own function (M5) |
| `outputMask.ts` | 100 | about 140 | 800 | `maskingBanner` and `shortValuesCaveat` |
| `sshProgram.ts` | 321 | about 370 | 800 | `sshSpawnLaunch`, `spawnableSshProgram`, `NO_SSH_TO_SPAWN` |
| `sshRoad.ts` | 226 | about 260 | 800 | — |
| `help<Lang>.ts` | 319 each | 319 each | 800 | in-place string edits |

**No stale `eslint-disable`** (round 2, Minor 1). `eslint.config.mjs:20` sets `reportUnusedDisableDirectives: 'error'`, so a
directive that stops being needed after a move fails `npm run lint`. After S1's moves, run lint; a rule it reports as an
unused directive is removed from that directive in the same commit (the whole comment when it names no rule left). S1
expects none: the files it touches carry no directive except `extension.ts:1` (`max-lines, max-lines-per-function,
complexity`, file-wide), and the file stays over 800 lines with its other long functions. No new directive is added: every
new or split function stays ≤ 50 code lines and complexity ≤ 4. S2 has its own list (§S2.4).

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
- **Every real-child test is bounded, and kills what it started** (round 1, items 1 and 7; round 2, R2-4). In
  `test/maskedTerminal.test.ts` every NEW test — M8 and M11 with their fake `ssh` included — is `test(name, { timeout: 15_000 }, async () => …)` and waits with a new helper
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
| K1 | `the_argv_ends_with_the_remote_login_shell_reading_stdin_after_the_destination` (epoch 4, §E3.4: `launch.argv[0] === '-T'`, said by name; the deep-equal's expected argv is `buildSshExecArgv(…, { jump, knownHostsFile, ownAgent, noTty: true })`; RED then: `argv[0] === '-o'`) | for a key ready (`entity.sshKeyPath: '/keys/s1.key'`, no env): `kind 'spawn'`; argv deep-equals `buildSshExecArgv(entity, '/keys/s1.key', SECRETS_REMOTE_COMMAND, 'key', { jump, knownHostsFile })`; its last element is `SECRETS_REMOTE_COMMAND`; the two before it are `--` and `deploy@prod.example`; no element is `-t`; it holds the pair `-o`, `ConnectTimeout=10` and the pair `-o`, `BatchMode=yes` (E3-D11 (a): the words are SENT); `target === 'deploy@prod.example'` | no export |
| K2 | `a_password_session_uses_askpass_one_prompt_and_a_connect_timeout` (epoch 4, §E3.4: `launch.argv[0] === '-T'` too) | ready with `env` set: argv holds `NumberOfPasswordPrompts=1` and `ConnectTimeout=10`, not `BatchMode=yes`; no element holds the password value of `env` | no export |
| K3 | `a_pinned_host_is_enforced` | `options.knownHostsFile: '/keys/kh-s1'`: argv holds `StrictHostKeyChecking=yes` and `UserKnownHostsFile=/keys/kh-s1`; without it, `StrictHostKeyChecking=accept-new` | no export |
| K4 | `the_jump_and_the_forwards_are_the_trust_lines` | an SSH entry with `agentForward: true`, one enabled `-L` forward and `jump 'deploy@bastion'`: every word of `sshOptionArgv(entity, jump)` appears in the argv, in that order (the trust line's words, so what was approved is what connects) | no export |
| K5 | `a_relay_prefix_or_a_client_program_is_refused_as_not_local` | `prefix: 'env SSH_AUTH_SOCK=… '` → `refused` with `secretsLocalOnly('deploy')`; the same for `options.program: '/mnt/c/…/ssh.exe'` | no export |
| K6 | `an_entity_with_no_safe_host_is_refused_with_the_no_host_sentence` | `entity.host: '-oProxyCommand=x'` → `refused` with `noHostSentence('prod box')` | no export |
| K7 | `the_remote_line_reads_each_reference_from_the_posix_environment` | `secretsRemoteLine(PLAN, planRefs([PLAN.line]))` equals `'printenv "$CREDS_REF_1"'`; it holds no `creds://` | no export |
| K8 | `the_banner_is_exact_and_names_the_target` | `secretsOverSshBanner('deploy@prod.example:2222', [{ value: 'x'.repeat(12), label: 'CREDS_REF_1' }])` equals the E3.0 text literally, with `<caveat>` empty; with a 6-character value it holds `shortValuesCaveat(…)` and names `CREDS_REF_1` | no export |
| K10 | `the_launch_warning_is_a_banner_line_before_the_secrets_text` | `maskedOverSshBanner('CREDS_REF_1 = password of me/alert', NO_AGENT_TO_FORWARD, 'deploy@prod.example', S)` with `S = [{ value: 'x'.repeat(12), label: 'CREDS_REF_1' }]` equals `['CREDS_REF_1 = password of me/alert', `Note: ${NO_AGENT_TO_FORWARD}.`, secretsOverSshBanner('deploy@prod.example', S)].join('\r\n')`; with `warning` undefined it equals the first and the last joined by `\r\n` (no empty line, no `Note:`) | no export |

**`test/outputMask.test.ts`** (append; pure, round 2, M7: no unit test loads `../extension`, and `test/arrowWorld.ts:10`,
`:74` stand it in for exactly that reason)

| # | Test | Assertion | RED today |
|---|---|---|---|
| K9 | `the_local_banner_is_unchanged_and_names_its_short_values` | `maskingBanner(secrets)` from `../outputMask`: for one 12-character value it equals today's text, written once in the test from `extension.ts:970-977` on this commit (the moved words are not changed); for a 6-character value it includes `shortValuesCaveat(secrets)` and names its label | no export (the stub answers `''`) |

**`test/maskedTerminal.test.ts`** (append; its `world()`, a real child, as the file's doc says). POSIX only (`/bin/sh`): on
win32 each new real-child test is skipped with a printed reason (M12 and M14 are not real-child tests and run everywhere).
Every new real-child test is bounded per §S1.5 (`{ timeout: 15_000 }` and `closedWithin`). `world()` gains an optional
`mocks` argument passed to `loadWithVscode` (`test/vscodeStub.ts:16-28`, keyed by the request string `maskedTerminal.ts`
writes): `spawnSpy(w)` = `{ 'node:child_process': { ...childProcess, spawn: (...a) => { const c = childProcess.spawn(...a);
w.children.push(c); return c; } } }` and `killSpy(w)` = `{ './childKill': { ...childKill, killChild: (c, o) => {
w.kills.push(o); childKill.killChild(c, o); } } }` (`w.children`, `w.kills` new arrays on the world). It also gains two
options: `workspaceDir?: string` (the stub's `workspace.workspaceFolders` becomes `[{ uri: { fsPath: workspaceDir } }]`;
today it is `undefined`, `:70`) and `showThrows?: boolean` (the terminal's `show()` throws `new Error('no show')`, and a
`w.disposed` counter records `dispose()`). A helper `runArgv(w, options)` is `run()` (`:76-91`) with `argv`, `cwd` (an
`ownedDir` unless a row says otherwise), `stdinText`, `onEnded` in place of `commandLine`/`shell`, and it does NOT wait
(each test waits with `closedWithin`).

**The order, and so what "RED today" means** (round 2, Minor 3). The tests below do not compile against today's
`MaskedRunOptions` (`commandLine` is required, `argv` does not exist). So the FIRST edit is the type only: the union with
`argv`, `cwd`, `stdinText` and `onEnded`, and `launchOf` exported with today's behaviour (it answers the shell launch for
every input). No behaviour changes in that edit. Then the tests are written and run, and "RED today" is read on that
code: an argv-mode run calls `childProcess.spawn(undefined, [], …)`, which throws `ERR_INVALID_ARG_TYPE`; `spawnChild`
catches it, the screen says `Could not start: The "file" argument must be of type string. Received undefined` at once,
`closer.fire(1)` ends the run with code 1, and `onEnded` is never called. So these tests fail at once on their own
assertion, not on a timeout.

**The fake `ssh` of M8 and M11** (round 2, R2-4 and Minor 6). An executable `/bin/sh` script in an `ownedDir(t, 'ssh')`
(the pattern of `test/remoteLaunchDelivery.test.ts:66-80`). It appends its own PID (`$$`) to `pids`, records its argv
NUL-separated to `argv` and its environment (`env -0`) to `env`, then sets `SHELL=/bin/sh` and exports it (as sshd sets
the login shell; the runner's own `$SHELL` can be fish, and the remote command `"${SHELL:-sh}" -s` would then not read
the POSIX script), skips its options to `--`, skips the destination, and runs the last argument with `/bin/sh -c` (what
sshd does with an exec request), stdin inherited. The script on stdin starts with `echo $$ >> <dir>/pids` (the remote
`sh -s` records its own PID). Each of M8 and M11 runs in `try { … await closedWithin(w, 5_000) … } finally { … }`, and
the `finally` checks every PID in `pids` with `process.kill(pid, 0)`: each must throw `ESRCH`, when the test passed and
when it failed. A live one is killed with `SIGKILL`, and the test fails naming it (`fake ssh process <pid> was left
running`). So the fake's process tree is proved gone on success and on failure, and a RED run leaves nothing behind.

| # | Test | Assertion | RED today (on the type-only edit) |
|---|---|---|---|
| M1 | `argv_mode_runs_no_shell` | `argv: ['/bin/echo', '$HOME;id']`: the screen shows `$HOME;id` literally | `Could not start: …` at once; `$HOME;id` absent |
| M2 | `stdin_text_is_written_once_then_closed` | `argv: ['/bin/sh', '-c', 'cat; echo END']`, `stdinText: 'hello-from-stdin\n'`; `await closedWithin(w, 3_000)`: the screen holds `hello-from-stdin` then `END`, and `[exit 0]` (cat ended, so stdin was closed) | `Could not start: …` at once (code 1); `hello-from-stdin` and `END` absent. (Once argv mode spawns but before the stdin write exists, `cat` waits: at 3 s `closedWithin` closes the pty — `killChild`, tree — and rejects `child never closed within 3000 ms; killed; …`, with no `cat` left: round 1, item 7) |
| M3 | `keystrokes_are_not_forwarded_when_stdin_is_a_script` | M2's child with `sleep 1` before `cat`; `pty.handleInput('typed\r')` during the sleep: the screen does not hold `typed` | `Could not start: …`, and `handleInput` still echoes: the screen holds `typed` |
| M4 | `on_ended_is_called_once_when_the_child_exits` | `argv: ['/bin/true']`, a counter: after the close, `1` | counter `0` (`onEnded` is not read) |
| M5 | `on_ended_is_called_once_when_the_program_does_not_exist` | `argv: ['/nonexistent/ssh-xyz']`: the screen says it could not start, and after both `error` and any `close` (wait 200 ms after the exit code), the counter is `1` | counter `0` |
| M6 | `on_ended_is_called_once_when_the_terminal_closes_before_the_child_starts` | `pty.close()` before `pty.open()`: counter `1` | counter `0` |
| M6b | `a_run_closed_before_it_started_never_spawns_or_writes` | with `spawnSpy`: `pty.close()`, then `pty.open()` (VS Code should not, the code must not care): `w.children` `[]`, counter still `1`, the screen holds the banner at most | counter `0`; the screen holds `Could not start: …` (`open()` tried to spawn after the close) |
| M7 | `the_env_of_argv_mode_reaches_the_child` | `argv: ['/bin/sh', '-c', 'printf %s "$ASKPASS_PROBE"']`, `env: { ASKPASS_PROBE: 'probe-value-1234' }`: shown | `Could not start: …`; the value absent |
| M8 | `end_to_end_values_echoed_to_stdout_and_stderr_are_masked` | The fake `ssh` above. Run `argv: [fake, ...secretsLaunch(PLAN, ready).argv]`, `env: {}`, `stdinText: secretsStdin(env, 'echo $$ >> <dir>/pids; printf "%s\\n" "$CREDS_REF_1"; printf "%s\\n" "$CREDS_REF_2" >&2')` with `CREDS_REF_1 = "it's $HOME \"quoted\" value"` and `CREDS_REF_2 = 'second-secret-value-42'`, `secrets` both with their labels; `await closedWithin(w, 5_000)`. The screen holds `<CREDS_MASKED:CREDS_REF_1>` and `<CREDS_MASKED:CREDS_REF_2>` and neither raw value; `[exit 0]`; the recorded argv holds neither value; the recorded environment holds neither value; `pids` holds two PIDs, both gone (the `finally`) | `Could not start: …` at once; the fake never ran (`argv`, `env` and `pids` absent) |
| M9 | `closing_the_terminal_kills_a_stalled_child_and_drops_the_unwritten_script` (round 1, item 1) | with `spawnSpy` and `killSpy`: `argv: ['/bin/sh', '-c', "echo PID=$$; trap '' TERM; exec sleep 300"]` (the shell becomes `sleep`, same pid, and `SIGTERM` stays ignored across `exec`), `stdinText: 'x'.repeat(4 * 1024 * 1024)` (more than a pipe takes; `sleep` never reads), a counter. Wait for `PID=<n>` on the screen (≤ 3 s), then `pty.close()`; `await closedWithin(w, KILL_GRACE_MS + 3_000)`. Then: the screen ends with `[exit killed]`; the counter is `1`; `w.kills` deep-equals `[{ tree: true }]`; `process.kill(n, 0)` throws `ESRCH`; `w.children[0].stdin.destroyed === true` | `Could not start: …`: no `PID=` within 3 s, and the test fails on that wait |
| M10 | `a_terminal_that_cannot_be_created_throws_and_never_spawns` (round 1, item 5) | a world whose `createTerminal` throws `new Error('no terminal')`, with `spawnSpy`: `runInMaskedTerminal(…)` throws that error; the counter stays `0` (the caller cleans, E3-D7); `w.children` `[]` | (green before and after: a guard that pins E3-D7's "a throw from `createTerminal` is the caller's" — say so) |
| M10b | `a_show_that_throws_ends_the_run_and_a_later_open_spawns_nothing` (round 2, Minor 7) | `world({ showThrows: true })` with `spawnSpy`, `argv: ['/bin/echo', 'x']`, a counter: `runInMaskedTerminal(…)` throws `no show`; the counter is `1`; `w.disposed === 1`; then `pty.open()`: `w.children` `[]`, the screen is empty, the counter still `1` | the throw passes through and the run is not ended: counter `0`, `w.disposed === 0` |
| M11 | `the_ssh_childs_environment_holds_no_secret_value` (round 1, item 4; D12) | M8's fake `ssh` and launch, with `env` = a password session's askpass set `{ SSH_ASKPASS: '/keys/askpass.sh', SSH_ASKPASS_REQUIRE: 'force', CREDS_SSH_PASSWORD: 'ssh-entry-password-77' }` and the resolved values `CREDS_REF_1 = 'first-secret-value-0001'`, `CREDS_REF_2 = 'second-secret-value-42'` ONLY in `stdinText`; `await closedWithin(w, 5_000)`: the environment the fake recorded (`env -0`, split on NUL) holds no entry whose value contains either resolved value and no name starting `CREDS_REF_`; it DOES hold `SSH_ASKPASS_REQUIRE=force` (the positive control: the recording works). The askpass password IS there — the accepted limit (E3-D8), asserted present, not hidden. `pids`: both gone (the `finally`) | `Could not start: …` at once; the fake's `env` record absent |
| M12 | `launch_of_argv_mode_takes_its_own_folder_never_the_workspace` (round 2, B1) | `world({ workspaceDir: '/work/repo' })`; `mod.launchOf({ name: 't', argv: ['C:/Windows/System32/OpenSSH/ssh.exe', '-o', 'BatchMode=yes'], cwd: 'C:/Users/me/AppData/Roaming/Code/User/globalStorage/x', env: {}, secrets: [], banner: '' })` deep-equals `{ program: 'C:/Windows/System32/OpenSSH/ssh.exe', args: ['-o', 'BatchMode=yes'], shell: false, cwd: 'C:/Users/me/AppData/Roaming/Code/User/globalStorage/x' }`; the shell variant without `cwd` still answers `cwd: '/work/repo'` (the local road unchanged). Pure: nothing is spawned | the stub `launchOf` answers the shell launch: `program` undefined, `shell: true`, `cwd: '/work/repo'` |
| M13 | `an_argv_run_starts_in_its_own_folder` (round 2, B1) | `world({ workspaceDir: <ownedDir A> })`, `runArgv` with `argv: ['/bin/sh', '-c', 'pwd']`, `cwd: <ownedDir B>`; `await closedWithin(w, 3_000)`: the screen holds B's real path and not A's | `Could not start: …`; B absent |
| M14 | typed fixture `src/test/fixtures/typed/argv_run_needs_a_cwd.ts` (round 2, B1) | `runInMaskedTerminal({ name: 't', argv: ['ssh'], env: {}, secrets: [], banner: '' })` with no `cwd` is REFUSED by the compiler; the header line names the code the compiler gives, as its neighbours do (`typedFixtures.test.ts:11`) | on the type-only edit it is already refused (the type is the fix); watched RED by making `cwd` optional for one run, never committed |

**`test/sshProgram.test.ts`** (append; pure, any host: the platform, the `PATH` value and `exists` are injected; round 2, B1)

`WIN_PATH` = `'.;tools;\\rooted;C:\\Git\\usr\\bin;C:\\Windows\\System32\\OpenSSH'` (in the test, each `\\` is one backslash).

| # | Test | Assertion | RED today |
|---|---|---|---|
| P1 | `on_windows_a_bare_ssh_becomes_the_first_absolute_path_folder_that_holds_it` | `exists` true for every `…\\ssh.exe`: `spawnableSshProgram('ssh', 'win32', WIN_PATH, exists)` equals `path.win32.join('C:\\Git\\usr\\bin', 'ssh.exe')` — `.`, `tools` and the drive-relative `\\rooted` are skipped, never asked (the recorded `exists` calls name none of them) | no export |
| P2 | `on_windows_with_no_ssh_on_the_path_the_built_in_is_used` | `PATH` `'C:\\bin'`, `exists` true only for `builtInOpenSsh('ssh')`: the answer is `builtInOpenSsh('ssh')` | no export |
| P3 | `on_windows_with_no_client_at_all_the_answer_is_undefined` | `exists` always false: `undefined` | no export |
| P4 | `on_windows_an_absolute_program_is_kept_and_nothing_is_searched` | `program` = `builtInOpenSsh('ssh')`: kept; `exists` was not called | no export |
| P5 | `off_windows_the_bare_name_is_kept_and_nothing_is_searched` | `'linux'` and `'darwin'`: `'ssh'`; `exists` not called | no export |
| P6 | `on_windows_the_spawned_program_is_never_a_bare_name` | for `agentForward` true and false: `spawnableSshProgram(sshSpawnLaunch(entity, '/tmp/a.sock', 'win32').program, 'win32', WIN_PATH, exists)` matches `/^[A-Za-z]:[\\\/]/` (a drive letter); with `exists` always false it is `undefined`, never `'ssh'` | no export |

**`test/sshRoad.test.ts`** (append; its `loadWithVscode` world)

| # | Test | Assertion | RED today |
|---|---|---|---|
| H6 | `a_spawn_preparation_never_relies_on_the_agent` | `servesKeyForEntity` answers true; `prepare(acct, ssh, 'spawn')` → the mocked `prepareSshSession` got `agentServesKey === false` and `isolate === true`; `prepare(acct, ssh)` still gets `true` | the third argument is ignored |
| H7 | `spawn_launch_names_the_client_its_folder_and_the_extensions_agent_for_a_forwarding_entry` | `agentSocket: () => '/tmp/agent.sock'`, `storageDir: '/storage'`, `ssh.agentForward: true`: `kind 'spawn'`; `program` equals `spawnableSshProgram(openSshBinary('ssh', true, process.platform), process.platform, process.env.PATH, fs.existsSync)` (read from the functions, never retyped); `cwd === '/storage'` (round 2, B1: the storage folder, never the workspace); `env.SSH_AUTH_SOCK === '/tmp/agent.sock'`; the askpass `env` passed in is merged; without forwarding, no `SSH_AUTH_SOCK` | no method |
| H8 | `hand_over_to_run_leaves_the_list_only_after_the_run_exists_and_shares_one_end` (round 1, item 5; round 2, R2-2) | `r` with a COUNTING `cleanup` (not idempotent: it counts every call); `own(r)`; `handOverToRun(r, (e) => { ended = e; })`; `cleanAll()` → count 0 (the run owns it now); `ended(); ended()` → count 1 | no method |
| H9 | `a_hand_over_of_a_session_never_owned_still_cleans_once` | no `own`; `handOverToRun(r, (e) => { ended = e; })`; `ended(); ended()` → count 1; a later `cleanAll()` → still 1 | no method |
| H10 | `a_throw_while_the_run_is_made_leaves_the_session_to_the_owner_once` (round 2, R2-2) | (a) `own(r)`; `start` throws: `handOverToRun` rethrows; `cleanAll()` → count 1. (b) `own(r)`; `start` calls `e()` and then throws: count 1 after the throw; `cleanAll()` → still 1 (one shared once-only end). (c) never owned; `start` throws: `cleanAll()` → count 1 | no method |

**`test/sshRoadSecrets.test.ts`** (new; `arrowWorld({ others: [S1, alert], sshRoad: road, events }, [], vault.source)` and `aw.runWithSecrets(LINKED)`)

| # | Test | Assertion | RED today |
|---|---|---|---|
| S1 | `the_order_is_prepare_trust_dependencies_resolve_spawn` | `LINKED` + `dependsOn: ['dep']`, `runDependencies: true`, `dep` a trusted local step; trust modal answered Run: one ordered `events`: `prepare s1#1`, the trust modal, `dep` executed, `resolve`, `spawn` | E1's sentence, nothing |
| S2 | `no_child_and_no_value_before_the_trust_answer` | the trust modal HELD: `aw.masked` `[]`, `vault.calls` `[]`, `road.calls.length === 1`; then answered: one masked run | E1's sentence |
| S3 | `the_child_is_ssh_by_argv_with_no_value_in_argv_or_env` | after the run: `masked[0].argv` deep-equals `['ssh', ...secretsLaunch(PLAN, r1).argv]`; `commandLine` undefined; no element of `argv` and no value of `env` holds `correct-horse-battery-staple`; `road.uses` deep-equals `['spawn']`; `masked[0].cwd === road.launches[0].cwd` (`'/storage'`, the folder `spawnLaunch` gave, never the workspace; round 2, B1) | E1's sentence |
| S4 | `stdin_carries_the_exports_and_the_line_in_a_group_then_exit` | `masked[0].stdinText === secretsStdin({ CREDS_REF_1: 'correct-horse-battery-staple' }, 'printenv "$CREDS_REF_1"')`; it holds `} </dev/null` and ends with `exit $?\n` | E1's sentence |
| S5 | `the_output_is_masked_and_the_banner_says_not_interactive` | `masked[0].secrets` deep-equals `[{ value: 'correct-horse-battery-staple', label: 'CREDS_REF_1' }]`; `masked[0].banner` ends with `secretsOverSshBanner(r1.target, masked[0].secrets)` and holds no `Note:` (the fake road gives no warning) | E1's sentence |
| S6 | `trust_is_asked_on_the_trust_line_and_one_approval_covers_the_arrow` | the modal text includes `trustLineFor(r1.entity, r1.jump, PLAN.line)`; afterwards `isCommandTrusted(aw.trust, 'e1', thatLine)` true; a local trust of `PLAN.line` alone does NOT skip the modal | E1's sentence |
| S7 | `a_linked_entry_runs_with_secrets_over_ssh` | the happy run, trusted: one masked run; `cleaned` `[]` and `road.cleanupCalls` `[]` after the road returned (the hand-over took it off the list once the run existed; the owner's `finally` did not touch it); then `masked[0].onEnded()` twice → `road.cleanupCalls` `['s1#1']` (exactly one call) | E1's sentence |
| S8 | `a_password_entry_puts_askpass_in_the_child_env_never_in_argv` | script `{ password: true }`: `masked[0].env` includes every key and value of `r1.env`; `argv` holds `NumberOfPasswordPrompts=1`; no `argv` element holds `r1.env.CREDS_ASKPASS_PASSWORD` (the fake road's name for the password variable, `test/sshRoadWorld.ts:54`; the real one is `CREDS_SSH_PASSWORD`, `sshAskpass.ts:45`) | E1's sentence |
| S9 | `the_run_adds_only_the_askpass_and_agent_variables_and_no_value` (round 1, item 4; E3-D8; renamed in epoch 4, §E3.4: it was `the_child_env_is_the_askpass_and_agent_variables_only_and_holds_no_value`, and `masked[0].env` is what the run ADDS, not the child's whole environment; its assertions do not change) | for a key session and for `{ password: true }`: every key of `masked[0].env` is a key of `r1.env ?? {}` or `SSH_AUTH_SOCK`; no key starts with `CREDS_REF_`; no value contains `correct-horse-battery-staple`; and `masked[0].stdinText` DOES contain it (the value went somewhere: stdin, and only there) | E1's sentence |
| S10 | `the_spawn_warning_is_in_the_banner_and_no_toast_races_the_run` (round 1, item 3; E3-D12) | `fakeRoad(…, …, events, NO_AGENT_TO_FORWARD)`, `recordDialogs(aw, events)` (`test/sshRoadWorld.ts:119-128`): `masked[0].banner === maskedOverSshBanner(described, NO_AGENT_TO_FORWARD, r1.target, masked[0].secrets)` with `described` = the banner's first line; the `Note:` line comes before `secretsOverSshBanner(…)`; `events` holds no `dialog:` entry that includes `NO_AGENT_TO_FORWARD` | E1's sentence |
| O1 | `owner_a_declined_trust_spawns_nothing_and_cleans` | modal `'dismiss'`: `aw.masked` `[]`, `vault.calls` `[]`, `cleaned` `['s1#1']` | `road.calls` is 0 (E1) |
| O2 | `owner_a_cancelled_dependency_spawns_nothing_and_cleans` | S1's world, the chain modal answered `undefined`: `masked` `[]`, `vault.calls` `[]`, `cleaned` `['s1#1']` | E1's sentence |
| O3 | `owner_a_failed_resolution_spawns_nothing_and_cleans` | a reference to `creds://me/gone/password` (no such entity): the error message is today's `Nothing was run: …`; `masked` `[]`; `cleaned` `['s1#1']` | E1's sentence |
| O4 | `owner_a_thrown_error_cleans` | a `refSource` that throws: `await assert.rejects(aw.runWithSecrets(LINKED))`; `cleaned` `['s1#1']` | E1's sentence, no throw |
| O5 | `owner_a_failed_terminal_creation_cleans_exactly_once` (round 1, item 5) | `onMasked` throws: `aw.runWithSecrets(LINKED)` rejects with that error; `road.cleanupCalls` `['s1#1']` — ONE call, by the owner's `finally` (the session was still on its list: the hand-over removes it only after the run exists; round 2, R2-2) | E1's sentence |
| O8 | `owner_a_run_that_ended_while_its_terminal_was_made_and_then_threw_cleans_once` (round 1, item 5; round 2, R2-2 and Minor 7) | `onMasked` calls `options.onEnded()` and then throws (the shape of a `show()` that threw after the masked run ended itself): rejects; `road.cleanupCalls` `['s1#1']` — the run's end cleaned it, and the owner's `finally` called the same once-only end, which did nothing | E1's sentence |
| O9 | `owner_a_close_before_start_cleans_once_and_a_late_end_does_nothing` (round 1, item 5) | `onMasked` calls `options.onEnded()` (the terminal closed before its child started) and returns: the road resolves; `road.cleanupCalls` `['s1#1']`; then the test calls `masked[0].onEnded()` again → still `['s1#1']` | E1's sentence |
| O10 | `a_refused_spawn_launch_asks_nothing_and_cleans` (round 2, B1) | `fakeRoad(…, …, events, undefined, NO_SSH_TO_SPAWN)`: the warning is `NO_SSH_TO_SPAWN`; no trust modal; `vault.calls` `[]`; `masked` `[]`; `road.cleanupCalls` `['s1#1']` | E1's sentence |
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
| Hp6 | `every_language_says_run_with_secrets_runs_over_ssh_from_a_local_window` | each language's `basics` body includes the S1 sentence of its row above; the `secret-references` body (`bodyFor`, `fallback === false`) includes its language's new `whatItIs` value, the new first sentence of `usage` and the appended text above, and no longer includes the old `whatItIs` clause (EN `the value reaches only the child process’s environment`) | absent |
| Hp7 | `the_english_secrets_text_is_exact` | the EN `secret-references` body includes, literally, the EN `whatItIs`, the EN first sentence of `usage` and the EN appended text above; it includes `ps e` and `can keep running there` (round 2: the remote environment and the close are said) and not `never in the server’s process list` | absent |

**`test/linkedNeverLocal.test.ts`** (new; parent §4.5 (5), added by the epoch-3 re-review). The road scan reads imports, not
where a resolved line flows. Five roads resolve the line before they read the link, or treat the link as absent by
construction (parent §4.4 table): the arrow (`runEntryLine` → `arrowLine` → `sshLinkOf`), *Run with Secrets*
(`secretsJobAt` → `commandJob`), the dependency chain (`visitNode` → `executableLine` → `addStep` → `sshLinkOf`,
`dependencyRun.ts:127`, `:148`), a chain planned with no lookup (`NO_LINK`, `:157`) and an agent's VPN start (`linkOf`,
`vpnLauncherRun.ts:84-86`). These tests hold the guarantee instead. The three links: VALID
(`S1` in storage, a fake road that answers ready), MISSING (no `S1`), REFUSED (`S1` is not an SSH entry, or has the host
`-oProxyCommand=x`: `sshLinkOf` answers `refused`). `BARE` = `resolveCommand(LINKED)`'s line, read in the test. The local
sinks: the arrow's `typeIntoEntryTerminal` (seen as a terminal whose `sent` holds `BARE` as one whole send) and the local
masked run (seen as an `aw.masked` record with `commandLine` set), the chain's typed step (`dependencyRunHost.ts`:
`terminal.sendText(step.typed, true)` without shell integration, `:449`, or `integration.executeCommand(line)` with it,
`:518`; seen as `BARE` in a terminal record's `sent` OR its `executed` — every chain test checks BOTH, through
`sentAnywhere` and `executedAnywhere` as in `test/sshRoadChain.test.ts:78-79`; round 2), and the launcher's local send (seen as a terminal whose `sent` holds the launcher's bare line).

**Trust in the fixture.** In every trusted case the trust store ALSO trusts `BARE` (the bare local line), not only the
trust line. Without that, a bypassed road would stop at the local trust modal, and the test would stay green for the wrong
reason.

| # | Test | Assertion | RED proof |
|---|---|---|---|
| LN1 | `the_arrow_never_types_the_bare_line_of_a_valid_link` | VALID, trusted: no terminal's `sent` holds an element equal to `BARE`; the one send equals the composed line (`typedLine`) | GREEN on E2's code; RED with the bypass: the routing in `runEntryLine` made `runLocalLine` for every link |
| LN2 | `the_arrow_never_types_the_bare_line_of_a_missing_link` | MISSING, trusted: no terminal sent anything; the warning is `sshLinkOf`'s reason | the same bypass |
| LN3 | `the_arrow_never_types_the_bare_line_of_a_refused_link` | REFUSED (each of the two cases), trusted: no terminal sent anything | the same bypass |
| LN4 | `run_with_secrets_never_runs_a_valid_link_here` | VALID, trusted: no `aw.masked` record has `commandLine`; the one record has `argv` | RED with the bypass: `runWithSecrets` sends every link to `runSecretsHere` AND `secretsRefusal` skips `sshLinkRefusal` (both walls, parent §4.5 (5)) |
| LN5 | `run_with_secrets_never_runs_a_missing_link_here` | MISSING: `aw.masked` `[]`; `vault.calls` `[]` | the same bypass |
| LN6 | `run_with_secrets_never_runs_a_refused_link_here` | REFUSED (each case): `aw.masked` `[]`; `vault.calls` `[]` | the same bypass |
| LN7 | `a_chain_never_types_the_bare_line_of_a_valid_linked_step` | a local entry that `dependsOn` a VALID linked step, `runDependencies: true`, trusted: neither `sentAnywhere(aw)` nor `executedAnywhere(aw)` holds `BARE`; the linked step runs over SSH (E2.S3) | GREEN on E2's code; RED with the bypass of BOTH walls: `addStep` sends every step to `addLocalStep` AND `stepRefusal` skips `sshLinkRefusal` (`:203`) |
| LN8 | `a_chain_never_types_the_bare_line_of_a_missing_linked_step` | MISSING: neither `sentAnywhere(aw)` nor `executedAnywhere(aw)` holds `BARE`; the chain is refused before any step is typed | the same bypass |
| LN9 | `a_chain_never_types_the_bare_line_of_a_refused_linked_step` | REFUSED (each case): as LN8 | the same bypass |
| LN10 | `an_agents_vpn_start_never_types_a_linked_launcher_here` | an agent's start (no road, `linkOf` answers `none`) of a VPN whose launcher is linked, trusted: no terminal sent anything; the answer is E1's shared sentence | GREEN (E2-D2); RED with the bypass of its one wall: `launcherRefusal` skips `sshLinkRefusal` (`vpnLauncherRun.ts:157`) |
| LN11 | `a_chain_with_no_lookup_never_types_a_linked_step_here` | the same agent start, the launcher unlinked, one chain step linked (the walk has no `lookup`, so `NO_LINK`): neither `sentAnywhere(aw)` nor `executedAnywhere(aw)` holds that step's `BARE`; the answer is E1's shared sentence | GREEN; RED with the bypass of its one wall: `stepRefusal` skips `sshLinkRefusal` |

Each bypass is a temporary local edit, run once, never committed. The summary of S1 names each RED message and the pass.
LN1-LN3 and LN7-LN11 are guards of E2's merged code (tests only), written in S1 because S1 changes the routing of the same
guarantee. The agent's run has its own test in S2 (AG8), because its routing is built there.

### S1.7 Commands

From the repository root (`CLAUDE.md` §Commands; `common/local-cpu-budget.md`):

```bash
LP=$PWD/.agents/conventions/tools/low-priority.mjs
cd src_vs_code
node $LP npm run typecheck
node $LP npm run lint
node $LP npm run compile
node $LP node --test out/test/secretsLaunch.test.js out/test/outputMask.test.js out/test/sshProgram.test.js out/test/typedFixtures.test.js out/test/maskedTerminal.test.js out/test/sshRoad.test.js out/test/sshRoadSecrets.test.js out/test/sshRoadHelp.test.js out/test/linkedNeverLocal.test.js
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

`terminalRunAction` (`agentUseActions.ts:188-238`; the outer function has 48 of its 50 code lines; its `run` (`:198-236`) has
37 and a complexity of 10 — measured with the repository's ESLint 10.13.0, forwarded from the Fable spec) becomes a short
dispatcher:

1. `entityFor` as today; gone → `not_found` (today's words, `:200-202`).
2. `const gate = linkedCall(deps, ctx, ctx.bridge)` — the spec's gate (§2.1), the ONLY reader of the link in `run`.
   `refused` → `deps.note(journalLine(ctx.entityName, gate.why))`, then `fail(gate.code, gate.message)`. Nothing below runs.
3. The compare, for `local` and `linked` alike (spec §2.3 step 3): `ctx.summary !== undefined && ctx.summary !==
   linkedSummary(gate, entity)` → `fail('denied', changedWhileAsking(ctx.entityName))`. For an entry that was unlinked
   when the dialog stood both are today's words and it passes; a link removed while the dialog stood is refused (spec
   §2.4 row 4, G10 (c)), never run here. (As built in epoch 3. The re-review of epoch 4 makes it TWO parts, spec §2.3
   step 3 as rewritten, §E3.4 F-S2: for a `linked` gate an ABSENT summary refuses, and `ctx.uses?.entityId !==
   gate.link.ssh.id` refuses; for a `local` gate a `ctx.uses` refuses and an absent summary is not compared.)
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
     timeoutMs: clampExecTimeout(undefined) }); } finally { release(); }`. (Epoch 4, §E3.4 F-S2: the call gains
     `ownAgentOnly: true` and `noTty: true`, spec §2.3 step 8.)

`validate` and `summarize` call the same `linkedCall` (spec §2.2), so a refused gate is answered in `validate`, before any
dialog, with the same one sentence. So does `asksAfterConsent`: it is `(target) => forwardsAgentNow(deps, target)`, which
asks `linkedCall` first and answers `true` only when it is `linked` (and that SSH entry forwards the agent while the
socket is up); before the gate passes it says nothing about the SSH entry (spec §6; G22).

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
| `useActions.ts` or `agentUseActions.ts` (`vscode`-free) | (Built in `useActions.ts`. Epoch 4, §E3.4 F-S2: `OverSshCall` gains the REQUIRED `readonly ownAgentOnly: boolean` and the optional `readonly noTty?: boolean`.) `export interface OverSshCall { readonly ssh: EntityMetadata; readonly jump: () => JumpChain; readonly remoteCommand: string; readonly timeoutMs: number }` and `export type OverSsh = (ctx: UseActionContext, call: OverSshCall) => Promise<UseActionResult>`. `JumpChain` = the return type of `resolveJumpChain` (`sshOptions.ts`, pure). |
| `agentUseActions.ts` (437 → about 490) | `terminalRunAction(deps: AgentUseDeps & { onPath?: …; overSsh: OverSsh })`; §S2.2 as small functions (`runHere`, `runThere`, the gate from the Fable spec), each ≤ 50 lines, complexity ≤ 4. Imports: `planLaunch`, `sshLinkOf`, `trustLineFor`, `refusalSaid` from `./remoteLaunch`; `resolveJumpChain` from `./sshOptions`; drop `resolveCommand` and `sshLinkRefusal`. The doc of `terminalRunAction` (`:181-187`): one paragraph on the linked road. |
| `remoteLaunch.ts` | `export function refusalSaid(entry: LaunchEntry, reason: string): string` = today's `refusedCopyReason` (`:367-369`), renamed and exported; `copyOfPlan` (`:351`) calls it. `sshLinkRefusal`'s doc (`:120-123`, as S1 left it): "the agent's run" leaves the list of callers (round 2, Minor 8). |
| `sshUseActions.ts` (405 → about 440) | `execOverSsh` (§S2.2); `sshExecAction.run` calls it; `sshDepsFor` (`:383-405`) adds `overSsh: execOverSsh(deps)` to the record it returns (build the record in a `const`, then return it with the field), and its return type becomes `export type SshWiredDeps = SshUseDeps & { readonly overSsh: OverSsh }` (spec §6, §11): with today's `SshUseDeps` the typecheck fails. `agentAwareLaunch` uses `sshSpawnLaunch` (S1). |
| `extension.ts` | No change from this brief: `agentDeps` spreads `sshDeps` (`:629`). The security spec's §7 changes `:516` and `:69` in place (`maskEntriesWithLink`); not one line longer. |
| The authorisation files (the Fable spec owns them; listed here so the brief is whole) | `test/promptSiteLedger.ts` (the two signing rows gain `run`) and `test/promptSites.test.ts:234`: spec §13. The four test files with the fifteen one-argument `validate`/`summarize` calls (`test/useActions.test.ts`, `test/sshUseActions.test.ts`, `test/agentUseActions.test.ts`, `test/rotateAction.test.ts`): each call gains the target, which stays REQUIRED (spec §5, §13). `maskEntries.ts`: the `LinkedSecretSource` interface and `maskEntriesWithLink` (spec §7). `bridgeAllowList.ts`: the `run` branch of `useRoute` (spec §8). The whole list: spec §11. |
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
| `terminalRunAction` (the outer function) | 48 code lines | ≤ 50 | 50 per function |
| `terminalRunAction`'s `run` | 37 code lines, complexity 10 | ≤ 20, complexity ≤ 4 | 50 per function |

**No stale `eslint-disable`** (round 2, Minor 1; the rule of §S1.4). S2's moves make three directives likely unused:
`agentUseActions.ts:197` (`complexity`, on `terminalRunAction`'s `run`, which becomes a short dispatcher),
`sshUseActions.ts:221` (`max-lines-per-function`, on `sshExecAction`, whose `run` body moves into `execOverSsh`) and
`sshUseActions.ts:245` (`complexity`, on that `run`). Run lint after the moves; each directive it reports as unused is
removed in the same commit, and one it does not report stays. The other directives of those files (`agentUseActions.ts:121`,
`:131`, `:296`, `:319`: `scriptRunAction` and `dbQueryAction`) are not touched by S2. `execOverSsh`, `runHere`, `runThere` and
the gate get no directive: each ≤ 50 code lines and complexity ≤ 4, split when needed.

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
| AG5 | `snapshot_the_ssh_entry_is_read_once` | `getNode` counts reads of `s1` INSIDE `run` only (the counter is reset just before `run` is called): exactly the two the gate makes (`linkTo` and `lookedUp`, spec §2.1), and none after the gate — `planLaunch` gets the gate's `link`, so it reads nothing. The gate itself is evaluated up to five times in one broker call (`validate`, `summarize`, `asksAfterConsent` and `run` each ask it, spec §2.2), so a count over the whole call is not the snapshot claim | E1's sentence |
| AG6 | `a_linked_entry_written_for_windows_is_refused_after_the_gate_naming_only_the_terminal_entry` | S usable (the gate passes), `terminalOs: 'windows'`: `not_supported`, message `=== refusalSaid(T, planLaunch(T, sshLinkOf(T, lookup), { stayOpen: false }).reason)`, which includes `"deploy"` and not `prod box` or `prod.example`; `overSsh` 0, slot 0. The same entry with S CLOSED answers the one sentence instead: that case is the spec's G20 | E1's sentence differs |
| AG8 | `a_linked_entry_never_reaches_the_local_captured_run` (parent §4.5 (5)) | T's command is `echo local-run-probe-8`; a linked T with S usable and trusted on its trust line AND on the bare line, and a linked T with S closed: no answer's `stdout` holds `local-run-probe-8` (`capturedRun` really spawns, as in `the_agent_runs_the_resolved_line`, `test/agentUseActions.test.ts:377-382`, so a local run would print it); usable → exactly one `overSsh` call; closed → the one sentence, slot 0 | GREEN after S2; RED with the bypass of its one wall: the gate answers `local` for every entry, so `runHere` runs the bare line |
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
node $LP node --test out/test/agentSshRun.test.js out/test/agentSshGate.test.js out/test/sshExecOver.test.js out/test/agentUseActions.test.js out/test/sshLinkRoads.test.js out/test/launchRoadScan.test.js out/test/sshRoadHelp.test.js out/test/promptSites.test.js out/test/consentContract.test.js out/test/agentConsent.test.js out/test/sshExecCommand.test.js out/test/sshExecAuth.test.js out/test/useActions.test.js out/test/sshUseActions.test.js out/test/rotateAction.test.js out/test/maskEntries.test.js out/test/bridgeAllowList.test.js
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
| `src_vs_code/CHANGELOG.md` `## [Unreleased]` (`:7`) | (Epoch 4 adds three lines to E3's block: §E3.4 F-S3.) The field, the arrow, a VPN's *Start*, *Run All in Folder*, a dependency step, the trust line, *Copy Command*, share and export and the older-build note are already in `## [1.20.0]` (#338, E1 and E2); do not repeat them. E3's own block: `### Added — Run with Secrets and an agent's run over SSH`: *Run with Secrets* on a linked entry (values on the remote login shell's standard input, masked output, not interactive, local window only, a Windows server refused); an agent's `creds_run` only when the SSH entry itself is *Usable by agents*, else one sentence naming only the Terminal entry, code `denied` (was `not_supported` in 1.20.0); the consent names the SSH entry and its target; the agent's output is also masked with the SSH entry's values. Remove nothing from 1.20.0: its *Not yet over SSH* section (`:42-45`) stays true of that release. (Line numbers re-checked on e57eb80f, main with #338: `## [1.20.0]` is `:9-51`, `## [1.19.0]` starts at `:53`.) Cite `file:line` as the existing entries do. |
| `research/module_extension.md` | Read the whole SSH-link section (from `#### Terminal entry SSH link` at `:2371` to the end of the E3 paragraphs; round 2, Minor 8) as ONE text: no sentence says a road "still refuses" that runs now; "The refusal on every road" lists exactly the remaining callers of `sshLinkRefusal` (scan 4's list); the module map names `remoteLaunch.ts`, `sshSession.ts`, `sshRoad.ts`, `entityCommandRows.ts`, the scan. |
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
   E3-D5 (round 2, B1: the masked ssh child is an absolute program on Windows and starts in the storage folder, never
   the workspace; `ssh:exec` and the agent's run keep their own program and folder, flag 8);
   **E3-D13 and entry 2.2: the first §4.5 (1) importer target was given up** — `commands/runCommands.ts` still imports
   `resolveCommand` for the local Run with Secrets and the arrow's local line, because `LaunchPlan` was deliberately not
   widened (E3's plan round 1); the epoch-3 revision wrote the shipped list into §4.5 (1) and put the guarantee on the
   no-local-sink tests (LN1-LN11, AG8), so this is history for the reader, not a gap; the `sshLinkRefusal` sentence's last callers (Flag 4); the CHANGELOG path; and, recorded as CHECKED and not
   built, `-o SendEnv=-NAME` for the askpass variables (measured not to remove a wildcard pattern,
   `PLAN_windows_shell_quoting_injection.md` §8; the limit stays accepted). A deviation that records something as
   impossible names what was CHECKED.
2. The parent's ledger: read it whole. Epoch 2 stopped at entry 2.2 and epoch 3 opened after its re-review; epoch 3
   stopped at entry 3.2 and epoch 4 opens after its re-review. A second
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
- [ ] Hand check 3 handed to the owner, with its two lines of epoch 4; hand checks 1, 2 and 4 still listed as owed if not done.
- [ ] §E3.4 done: F-S1 and F-S2 built (T1, T2, F1-F6, U1-U11, G11, G17, G23, G24, Hp10 green, each watched RED
      first as an assertion after a no-op type, never a compile error; the guards U6 (c), T2's and F6's `ssh:exec`
      halves green before and after) and F-S3 written (the CHANGELOG lines, the S2 documents, the deviations list, the
      ratchet baseline, the one help table, the typed factory, the bridged journal line).

---

## E3.4 — The fix forward of epoch 4 (re-review of entry 3.2; not built)

The parent stopped at entry 3.2. Its revision for epoch 4 keeps every S1 and S2 commit (`fits`, the parent's record)
and adds the items below, fixed forward on this branch before E3 merges (parent §5: E3 merges as one unit with them).
The authorisation decisions are the security spec's third amendment as 21b8f5ce leaves it
([PLAN_terminal_command_over_ssh_E3_S2_security.md](PLAN_terminal_command_over_ssh_E3_S2_security.md) §0 A1-A6, §2.5,
§7, §11, §13, §16 items 11 and 15-17, §18, §19), with the lead's decisions:

- **`-T` on BOTH of E3's roads** (parent D16): `noTty: true` stands at exactly two production sites, `secretsArgv` and
  the linked run's call `overSshWithSlot`. `ssh:exec` and the three clicks of `commands/agentCommands.ts` keep today's
  argv.
- **The host's `SSH_AUTH_SOCK` and every inherited `CREDS_REF_` name are removed** from the child's environment on both
  roads (parent D17 (a)). The `CREDS_REF_` prefix is the lead's extension of the spec's §18.2 (a), decided after the
  consultants (b73776c0, f778e98d); the spec is not changed for it, and this section and the parent are its text. The
  sentence that is true after the build: *the run ADDS only the askpass variables and, when the extension's agent
  serves the run, its `SSH_AUTH_SOCK`; it REMOVES the host's `SSH_AUTH_SOCK` and every `CREDS_REF_` name; other
  ordinary variables (`PATH`, `HOME`, …) are inherited as by every spawned program.*

The spec's §11 brief and its §13 and §18.4 scenarios are the source; this section says which story each one is, adds
the lead's prefix rule, and adds the conventions review of the S1 and S2 code and the lead's Opus review (m5, m6).
Line numbers are 5b221602's unless a row says otherwise. Each story: the scenarios RED first, code by Sonnet, review by
Opus. Every function ≤ 50 code lines, complexity ≤ 4, no new lint directive; `extension.ts` not one line longer;
`credsAgentServer.ts` at most 797 of its 800 lines (else `releaseWaiting` moves to `brokerCall.ts`, spec §11).

**How a RED is watched here** (the reviewer's m4; spec §13). `npm test` runs `tsc` first, so a test that names a field,
an option or a method that does not exist yet does not compile, and a compile error is not a RED. The FIRST step for
every new name is the type alone, as a no-op: the optional field, option or method is declared and nothing reads or
sets it; a new function is a stub that answers the wrong thing (`usedEntrySpent = () => ''`, `envWithout` answers
`base`, `asBroker` answers `ctx`). Then each test compiles and fails on its ASSERTION, and that failure is the RED to
report. The two names that are REQUIRED in the end (`OverSshCall.ownAgentOnly`, the third parameter of `secretsLaunch`)
are optional for that step and become required in the build.

### F-S1 — Run with Secrets: `-T`, the agent socket and the child's environment (parent D16, D17)

| File | Change |
|---|---|
| `sshExecCommand.ts` | `SshExecOptions.noTty?: boolean`: with `noTty: true` `buildSshExecArgv` returns `-T` as its FIRST element, for both branches; absent or `false` is today's argv element for element. `SshExecOptions.ownAgent?: boolean`: `ownAgent === false` and `entity.agentForward === true` → the composer gets the entry with `agentForward: false` and the argv gains `-o`, `ForwardAgent=no` (the way the bridged branch takes the flag away, `:117-124`; `-A` wins over the option in either order, measured); `true` or absent → today's argv. An entry that does not forward gets neither word. No `-o EscapeChar=none` (inert without a pty, spec §18.1). **The waiver is not widened** (the reviewer's m6): `buildSshExecArgv` already carries `// eslint-disable-next-line complexity` (`:93`). The `-T` word and the `ownAgent` rule go into small named helpers (for example `noTtyPrefix(options)` and `forwardingOf(entity, options)`, each ≤ 50 lines, complexity ≤ 4) that the builder calls; no new branch is added under that directive. If lint then reports the directive as unused, it is removed. |
| `sshProgram.ts` | `export const AGENT_SOCKET_ENV = 'SSH_AUTH_SOCK'`; `export interface EnvDrop { readonly names: readonly string[]; readonly prefixes: readonly string[] }`; `export const E3_INHERITED_DROP: EnvDrop = { names: [AGENT_SOCKET_ENV], prefixes: ['CREDS_REF_'] }` and `NOTHING_DROPPED: EnvDrop = { names: [], prefixes: [] }`; the pure `export function envWithout(base: NodeJS.ProcessEnv, drop: EnvDrop, platform: NodeJS.Platform): NodeJS.ProcessEnv` — a COPY of `base` without each key equal to a name or starting with a prefix; on `win32` both match in any letter case (a Windows environment does not tell `SSH_AUTH_SOCK` from `Ssh_Auth_Sock`), elsewhere exactly. One shape for both roads, said once here. `sshSpawnLaunch` and `agentForwardEnv` are not changed. |
| `remoteLaunch.ts` | `secretsLaunch(plan, prepared, ownAgent: boolean)` — a REQUIRED third parameter; `secretsArgv` (`:433-436`) passes `{ jump: prepared.jump, knownHostsFile: prepared.options.knownHostsFile, ownAgent, noTty: true }`. |
| `sshRoad.ts` | `SpawnLaunch`'s `spawn` shape (`:52-54`) gains `readonly ownAgent: boolean` (true only when `ssh.agentForward === true` and the extension's agent socket is up) and `readonly withoutEnv: EnvDrop`, always `E3_INHERITED_DROP`. The doc at `:31-33` loses *never "whatever `SSH_AUTH_SOCK` the host process has"* and the doc at `:39-41` loses *the environment holds `SSH_AUTH_SOCK` (when the entry forwards the agent) and the askpass variables*; both say the sentence above, and no more: they do not say that no agent of the person can ever be used (a config `IdentityAgent` still can, spec §16 item 15). |
| `maskedTerminal.ts` | The argv variant of `MaskedRunOptions` gains `withoutEnv?: EnvDrop` (*names and prefixes taken out of the inherited environment before `env` is laid on top*); `spawnChild` (`:278-294`) spawns with `{ ...envWithout(process.env, options.withoutEnv ?? NOTHING_DROPPED, process.platform), ...options.env }`. The shell variant (the local Run with Secrets) is not changed. The `env` doc and the argv-mode paragraph say the sentence above (E3-D8 as corrected). |
| `commands/runCommands.ts` | `launchesOf` (`:558-565`) asks `spawnLaunch` FIRST and hands its `ownAgent` to `secretsLaunch` (today it asks `secretsLaunch` first). A refused `spawnLaunch` is still a warning and a return, before anyone is asked. `maskedOverSsh` (`:576-590`) passes `withoutEnv: launches.spawn.withoutEnv`. |
| `test/sshExecCommand.test.ts` | T1 `no_tty_is_said_first_and_only_when_the_caller_asks`: with `{ noTty: true }`, for `'key'` and `'askpass'`: `argv[0] === '-T'`; exactly one element is `-T`; no element is `-t` or `-tt`; no element is `EscapeChar=none`; `argv.slice(1)` deep-equals the same call without `noTty`. With no `noTty` and with `noTty: false`: no `-T`, `argv[0] === '-o'`. RED after the no-op option: `argv[0] === '-o'` for `noTty: true`. F1 `a_forwarding_entry_with_no_agent_of_ours_gets_no_dash_a_and_forward_agent_no` (spec §18.4). |
| `test/secretsLaunch.test.ts` | K1 and K2: `launch.argv[0] === '-T'`, said by name; the deep-equal's expected argv is `buildSshExecArgv(…, { jump, knownHostsFile, ownAgent, noTty: true })`. RED: `argv[0] === '-o'`. |
| `test/sshRoad.test.ts` | F2 `spawn_launch_says_whether_the_agent_is_ours` (H7 gains it; spec §18.4); and `spawn.withoutEnv` deep-equals `E3_INHERITED_DROP` in every case. |
| `test/sshRoadSecrets.test.ts` | F3 `a_run_with_secrets_that_forwards_with_no_agent_up_sends_no_dash_a` (spec §18.4): the trust line that was asked still holds ` -A `. F6 (3): `masked[0].withoutEnv` deep-equals `E3_INHERITED_DROP` for a key session, a password session and a forwarding entry. S9 renamed `the_run_adds_only_the_askpass_and_agent_variables_and_no_value`; its assertions do not change. |
| `test/sshProgram.test.ts`, `test/maskedTerminal.test.ts` (beside M11) | F6 (1) and (2), below. |

**F6 `the_hosts_agent_socket_does_not_reach_the_ssh_of_e3s_two_roads`** — spec §18.4 F6, with the lead's whole-environment
part. (1) `envWithout({ SSH_AUTH_SOCK: '/h', CREDS_REF_9: 'x', PATH: '/p' }, E3_INHERITED_DROP, 'linux')` deep-equals
`{ PATH: '/p' }`, and its argument still holds all three (a copy); on `'win32'`, `{ Ssh_Auth_Sock: '/h', creds_ref_9:
'x', Path: 'p' }` loses the first two; on `'linux'` those other spellings stay. (2) On the REAL recording child (M11's
fake `ssh`, which records `env -0`), with `process.env.SSH_AUTH_SOCK = '/tmp/host-agent.sock'` and
`process.env.CREDS_REF_7 = 'seeded'` set for the test and put back in `finally`, an argv run with `withoutEnv:
E3_INHERITED_DROP`, a password session's askpass as `env` and a resolved value `correct-horse-battery-staple` on stdin:
the record holds NO `SSH_AUTH_SOCK` entry, NO key that starts with `CREDS_REF_` in any letter case, and no value that
contains the resolved value; it holds a `PATH=` entry (the positive control); and the set of keys whose value differs
from `process.env` (added or changed) is EXACTLY the askpass variables of `env`. The same run with `env.SSH_AUTH_SOCK =
'/tmp/ours.sock'`: that set is the askpass variables plus `SSH_AUTH_SOCK`, whose value is `/tmp/ours.sock` exactly
once, and `/tmp/host-agent.sock` stands nowhere. A key session with no `env`: that set is empty. (3) above. (4) in
F-S2. RED after the no-op types (`withoutEnv?` declared and not read; `envWithout` answers `base`): (1) the result
still holds both names; (2) the record holds `SSH_AUTH_SOCK=/tmp/host-agent.sock` and `CREDS_REF_7=seeded`.

### F-S2 — The agent's run: the used entry, its turn and its burn; the compare; the release; `-T` and the environment (parent D15, D16, D17)

| File | Change |
|---|---|
| `useActions.ts` | `export interface UsedEntry { accountId; entityId; entityName }`; the OPTIONAL `UseAction.uses?(target: CallTarget): UsedEntry \| undefined`; `UseActionContext.uses?: UsedEntry`; `OverSshCall.ownAgentOnly: boolean`, REQUIRED, and `OverSshCall.noTty?: boolean` (spec §2.5, §18.1, §18.2). |
| `agentUseActions.ts` | `usedEntryOf(deps, target)` (the gate first: S only when the gate answers `linked`); `terminalRunAction` declares `uses`; `changedSince` (`:313-315`) becomes the two-part compare of spec §2.3 step 3; `overSshWithSlot` (`:382-391`) passes `ownAgentOnly: true` and `noTty: true`. The bridged gate refusal writes a journal line that is true for the bridge: today `journalLine` (`:206-208`) always ends *(the agent was told only that the SSH connection is not open to it)*, which is the spec's literal text and false on a bridge, where the agent was told `BRIDGE_NOT_SERVED`; the bridged line says what the agent was told (a test asserts each of the two endings). |
| `sshUseActions.ts` | `execOverSsh` (`:226-248`). **The options are written at the call site** (the reviewer's m5): the call at `:238` becomes `buildSshExecArgv(call.ssh, prepared.keyPath, call.remoteCommand, prepared.auth, { ...connectionArgvOptions(deps, call.ssh, chain.value, ctx.bridge !== undefined), ownAgent: call.ownAgentOnly ? deps.agentSocket() !== undefined : undefined, noTty: call.noTty })`, so F5's scan finds the `ownAgent` key at that call and needs no reading of `connectionArgvOptions` (`:192-199`, which is not changed). For `ownAgentOnly` it hands `agentAwareLaunch` `envWithout(prepared.env, E3_INHERITED_DROP, process.platform)`; `agentAwareLaunch` lays the extension's socket on top when it serves, as today (`:107`). `sshExecAction` passes `ownAgentOnly: false`, with a comment that names [PLAN_ssh_exec_own_agent_forwarding.md](PLAN_ssh_exec_own_agent_forwarding.md), and no `noTty`; its environment and argv are today's. |
| `brokerCall.ts` | `CallSubject.uses: UsedEntry \| undefined` (the key REQUIRED); `CallDeps.burn(status, of?: UsedEntry)`; `CallDeps.refuse(code, message, why?)`; `export function usedEntrySpent(name: string): string`; the turns of spec §2.5 in place of `queuedIfOneUse` and `takesItsTurn` (`:108-123`): spent markers first, the grant's entry first; the one-use turns sorted by lane key, ascending, plain compare; nested. `burnInTurn` is `try { await deps.burn(status); } finally { if (call.uses !== undefined) { await deps.burn(status, call.uses); } }` (the reviewer's m7: `burnAndMark`'s one-use question reads storage and can throw, and a throw for the grant's entry must not leave a USED S unburned and unmarked). `startNow` (`:203`) adds `uses: call.uses`; the doc block `:93-107` says the fixed order and why, and where the spent marker lives (the lane's existing per-window set, at most 512 keys, as for `creds_exec`). |
| `credsAgentServer.ts` | In place (spec §11): `const uses = useAction.uses?.(grant);` after `:530` and into the object of `:544`; `releaseWaiting(grant)` then `releaseWaiting(call.uses)` before `tableOrFail` (`:583`, the method `:620-626` takes `undefined`); the `refuse` closure (`:683`) appends `why`; the `burn` closure (`:687`) takes `of = grant`. |
| `test/agentSshWorld.ts` | `asBroker(action, ctx)` (the context a broker hands `run`: the shown summary and `uses`) and `oneUseStorage` (spec §12). |
| `test/agentSshGate.test.ts` | G11 rewritten; G17 extended; G23; G24; the `run` helper (`:172`) hands the run what the broker hands it (`asBroker`); G9 and G10 build `shown = asBroker(…)` before they change the world (spec §13, no expected value changes). A test that pins the recorded call of the linked run gains `noTty: true` and `ownAgentOnly: true` and changes nothing else. |
| `test/agentSshRun.test.ts` | The `run` helper (`:19`) the same; no expected value changes but the two words of the recorded call. |
| `test/agentSshOneUse.test.ts` (new) | U1-U11 (spec §13), through the REAL broker (`brokerWorld` with its `vault` option); U7 through `performCall` with the real `OneUseLane` and `burnAndMark`. U6 (c) (the summary changed while the dialog stood) is a GUARD, green before and after: the compare already refuses that case, and nothing is spent. |
| `test/brokerWorld.ts` | One option, `vault?: { isOneUse; burnAfterUse }`, read by `hooksFor` (`:331-345`) in place of the two stubs when it is given. |
| `test/brokerCallLaunch.test.ts` | `callFor` (`:63`) gains `uses: undefined`. |
| `test/sshExecOver.test.ts` | F4 `the_linked_run_never_sends_dash_a_without_our_agent_and_ssh_exec_is_not_changed` (spec §18.4). T2 `the_linked_run_says_no_tty_and_ssh_exec_does_not`: `execOverSsh` as the linked run calls it (`noTty: true`): `runs[0].argv[0] === '-T'`, exactly one `-T`, and `runs[0].argv.slice(1)` deep-equals the argv of the same call without `noTty`; as `ssh:exec` calls it (no `noTty`): no `-T`, `runs[0].argv[0] === '-o'` — the GUARD half (green before and after; watched RED once with `noTty: true` written in `sshExecAction`, not committed). RED of the first half after the no-op type: the linked call's `runs[0].argv[0]` is `'-o'`. F6 (4): with `process.env.SSH_AUTH_SOCK = '/tmp/host-agent.sock'` and `CREDS_REF_7` seeded: as the linked run calls it, with `agentSocket: () => undefined`, `'SSH_AUTH_SOCK' in runs[0].env` is false, no key starts with `CREDS_REF_`, and `runs[0].env.PATH === process.env.PATH`; with a forwarding entry and a socket, `runs[0].env.SSH_AUTH_SOCK` is the extension's socket; with a socket and an entry that does not forward, no `SSH_AUTH_SOCK`. As `ssh:exec` calls it: `runs[0].env.SSH_AUTH_SOCK === '/tmp/host-agent.sock'` (the GUARD). The deep-equal at `:134` keeps its expected value but for `ownAgent`. The cast of `:50-56` (`as unknown as EntityMetadata`) is replaced by a typed factory built against the real validators (the conventions review). |
| `test/launchRoadScan.test.ts` (or a scan file of its own) | F5 `only_ssh_exec_still_sends_dash_a_without_our_agent` (spec §18.4): it reads the `ownAgent` key at each call of `buildSshExecArgv(` (the call site of `execOverSsh` names it, m5); the calls with no `ownAgent` are exactly the three of `commands/agentCommands.ts`. T2's scan half: `noTty: true` stands at exactly TWO production sites, `secretsArgv` of `remoteLaunch.ts` and `overSshWithSlot` of `agentUseActions.ts`; no file of `commands/` and no `sshExecAction` names `noTty`; a failure names file and line; a companion finds the two sites (RED before the build: it finds none). |
| help ×5 (`help<Lang>.ts`, the `- **terminal**` bullet, after the S2 sentence *… but only when the SSH entry itself is *Usable by agents*; otherwise the agent is refused and nothing runs.*), English first | EN: `If that SSH entry is set to last until an agent uses it once, the agent's run is that use, and the SSH entry is deleted after it.` DE, ES, RU and UK are written from the English by the coder and checked by the Opus reviewer, UI labels in English (`CLAUDE.md` rule 7). `test/sshRoadHelp.test.ts` Hp10 `every_language_says_a_linked_run_spends_a_one_use_ssh_entry` (each body includes its sentence; RED: absent). |

### F-S3 — The closing: CHANGELOG lines, and the conventions review of the S1 and S2 code

| Where | Change |
|---|---|
| `src_vs_code/CHANGELOG.md`, E3's block of §S3.1 | Four more lines: a one-use SSH entry is spent by an agent's linked run, as by its own `creds_exec` (the SSH entry is deleted after it); `Run with Secrets over SSH and an agent's run over SSH ask ssh for no terminal (-T), also when your ssh config says RequestTTY force.`; on those two roads an SSH entry that forwards the agent sends no `-A` while the extension's own agent is not up; and they do not use the agent of your own shell (`SSH_AUTH_SOCK` of the extension host is not passed on; spec §16 item 17). No line for `ssh:exec`: its argv and environment do not change. |
| `src_vs_code/README.md:259-260` | Still says *an agent's run still refuses such an entry and says why*, false since c0bbe5ce: the agent's run joins the running list with its condition (*Usable by agents*) and the one-use sentence above. |
| `research/module_extension.md:2248`, `:2396` | Both still list the agent's run as a caller of `sshLinkRefusal` (*E3.S2 follows for the agent's run*), false since c0bbe5ce: the agent's run leaves both lists. The paragraph **The agent's run over SSH (E3.S2)** that §S2.3 asks for is missing: written now, with the gate, the compare, the used entry and its burn, `ownAgentOnly`, `-T`, the child's environment, the bare line, `execOverSsh` shared with `ssh:exec`, the trust line as the key, the snapshot. |
| `research/module_tests.md` | Rows for `agentSshGate.test.ts`, `agentSshRun.test.ts`, `sshExecOver.test.ts`, `agentSshOneUse.test.ts`, F6 and Hp8/Hp10; the `:1365` row and the E3 section's text still say the agent's run refuses until E3.S2: corrected. |
| this document, a new list `### Deviations of S1 and S2` under §S3.2 (before the promotion) | The S2 RED evidence (each new test's RED message, from the coder's runs: the S2 commit messages do not carry them) and the deviations the conventions review found: `linkedSummary`'s signature is `(deps, call, entity, accountId)` (`agentUseActions.ts:278`), not the spec's `(linked, entity)`; the test fixes of G19, G10 (b) and G4 (what the spec row said, what the test does, and why); `NO_REFERENCE` is exported from `commands/runCommands.ts` (`:397`); the shape of `maskedOverSsh(sessions, run, launches, resolved)` and `trustedThenSpawned(run, sessions)` with the record `SecretsOverSsh` (`:474`, `:546`, `:576`), not §S1.3's one record `{ job, plan, refs, ready, launch, resolved, spawn }`. Each names what was CHECKED. |
| the size-ratchet baseline (`src_vs_code/scripts/size-ratchet.mjs`) | Lowered where S1 and S2 shrank a file (`npm run ratchet -- --update`, in the S3 commit), so the ratchet holds the smaller size. |
| `test/sshRoadHelp.test.ts` | `RUNS_BULLET_SENTENCE` (`:96`) and `AGENT_RUN_SENTENCE` (`:160`) are two tables of one bullet that overlap: one table of the bullet's sentences, read by both tests. |

The parent's hand check 3 gains three lines (parent §10): with `RequestTTY force`, `tty` prints `not a tty` and the
script is not echoed; with `ForwardAgent yes` and no key in the extension's agent, `SSH_AUTH_SOCK` is `none`; a key
only in the person's own agent is not used (a stored key the server refuses ends with `Permission denied`; on Windows
with the agent service too). If any fails: stop and report. S3 hands them to the owner with hand check 3.

**Commands** — §S1.7 and §S2.6, plus `out/test/agentSshOneUse.test.js`, `out/test/secretsLaunch.test.js`,
`out/test/sshRoad.test.js`, `out/test/sshRoadSecrets.test.js`, `out/test/sshProgram.test.js`,
`out/test/maskedTerminal.test.js`, `out/test/brokerCallLaunch.test.js` and every suite that loads `brokerWorld.ts`; the
lead runs the full `npm test`.

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
- **No change to `ssh:exec`'s behaviour**: its body moves into `execOverSsh`, in the same order, with its own program and
  folder (B1's absolute program and storage folder are the masked run's, E3-D5; flag 8). Its argv and environment are
  today's: `ownAgentOnly: false` (its `-A` with no agent of ours, and the host's `SSH_AUTH_SOCK`, are
  [PLAN_ssh_exec_own_agent_forwarding.md](PLAN_ssh_exec_own_agent_forwarding.md)'s). The person's clicks of
  `commands/agentCommands.ts` keep their argv too.
- **No `-T` on `ssh:exec`** and on the three clicks (the lead, epoch 4): E3's two roads say `-T`; a forced pty on the
  shipped `ssh:exec` is a recorded limit (parent risk 9), routed to that plan.
- **No fix of risk 7** (askpass answers a jump host's password prompt): a password SSH entry with a jump host has it on
  these roads too (`PLAN_askpass_answers_the_hop.md`).
- **No `SendEnv` control, and no `-o SendEnv=-NAME`** (E3-D8). The removal form was MEASURED not to work on a wildcard
  pattern (`research/PLAN_windows_shell_quoting_injection.md` §8), so it would only look like protection. A password SSH
  entry's askpass variables stay in the LOCAL ssh's environment; a person's own `SendEnv` pattern together with a
  server's `AcceptEnv` could send that password to the server — the limit the owner accepted and documented on
  2026-11-10 (`research/module_extension.md:221`, `src_vs_code/CHANGELOG.md:66-71`, release 1.19.0, the *Known limits* bullet), the same as on SSH Connect today.
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
   (Stale since the first commit of this document; re-checked on e57eb80f: the parent's `### E3` carries the Stories
   line (`PLAN_terminal_command_over_ssh.md:671`), and `todo/README.md` has this document's row (`:33`) and the security
   spec's (`:34`). Nothing is owed.)
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
   the guarantee from the import target to behavioural tests (parent §4.5 (5), here §S1.6 LN1-LN11 and §S2.5 AG8). (b) and (c) are not
   counted. The revision also wrote the round-1 bounds and the child's clean environment into parent §4.4, as the
   baseline of epoch 3, not as entries.)

8. **Outside B1, named so the lead decides it (round 2, found while writing B1).** `ssh:exec` spawns through
   `runSshExec` with no `cwd` (`sshUseActions.ts:278-283`, `sshExecRunner.ts:129-133`), so its child starts in the
   extension host's own folder, and on Windows without agent forwarding its program is the bare `ssh`
   (`agentAwareLaunch`, `:95-109`). S2's agent run over SSH goes through the same `execOverSsh`. B1's fix (an absolute
   program, the storage folder) is written for the masked run only, because "What E3 does NOT do" keeps `ssh:exec`'s
   behaviour; widening it to `ssh:exec` (and so to the agent's run) changes a shipped road and is the lead's choice.
   The workspace folder is NOT that road's folder, so B1's repository attack does not apply to it as written.
   (Decided 2026-11-10 by the lead: not built in E3; a todo item of its own, `todo/PLAN_ssh_exec_absolute_program.md`.)

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

## E3.R2 — applied (round 2 of 2026-11-10 and the lead's Opus review)

E3's plan round 2 (coai session 8da9aab9) answered `proceed`. Its findings 1, 2 and 4 were accepted (here R2-1, R2-2,
R2-4); findings 0 and 3 were rejected, with their reasons, in that session. The lead's own Opus review of the same text
gave the other rows. An Opus judge wrote all of them into the sections they change on 2026-11-10. The lead judged none of
them a parent change except B1, which is counted as parent entry 3.1 (in doubt it counts: parent §4.4 said the program
is chosen as `ssh:exec` chooses it). The others only make the plan true as written, and no owner decision moves. This is a record of where
each went, not a ledger (a stories document keeps none; the parent's ledger is unchanged).

| # | Finding | Now in | Why it is not a parent change |
|---|---|---|---|
| R2-1 | The table of what ends the run is the LOCAL end; the remote command can keep running after a close | §S1.2 (the paragraph under the table, the "remote command runs" row); E3-D11 (d); the help `usage` text (§S1.3) | Wording: parent §4.4's bound ("closing its terminal kills the child") is kept; the remote command's end was never promised |
| R2-2 | The hand-over sits inside the guarded block, so a throw from the hand-over or the creation has one cleaner | E3-D7; §S1.1 (the call); §S1.3 `sshRoad.ts` `OwnedSessions`; H8-H10; O5, O8 | Makes round 1's "atomic, once-only" and parent §4.4's one owner true; no contract moves |
| R2-4 | M8 and M11 are bounded by `closedWithin` and prove the fake ssh's processes gone | §S1.5; the fake `ssh` paragraph of §S1.6; M8, M11 | Tests only, for parent §6's bounded-run row as written |
| B1 | Argv mode on Windows spawned a bare `ssh` in the workspace folder (CWE-426) | E3-D5; the texts table (`NO_SSH_TO_SPAWN`); §S1.1; §S1.3 `maskedTerminal.ts`, `sshProgram.ts`, `sshRoad.ts`, test helpers; P1-P6, M12-M14, H7, S3, O10; §S3.2 step 1; flag 8 | COUNTED as parent entry 3.1 (approach). It is the same client, hardened, but parent §4.4 said the program is chosen "as the agent's `ssh:exec` chooses them"; in doubt it counts. Parent §4.4 now names the absolute program and the `storageDir` folder |
| M5 | `runInMaskedTerminal` would pass the 50-line limit | §S1.3 `maskedTerminal.ts` (`maskedRun`, `openRun`, `closeRun`, `inputRun`); §S1.4 | A function split for the lint limit; no behaviour |
| M6 | The branch has #338; the CHANGELOG references | the header; §S3.1 CHANGELOG row; "What E3 does NOT do" (`:66-71`) | References only |
| M7 | K9 would load `../extension` in a unit test | §S1.3 `outputMask.ts` and `extension.ts`; K9 in `outputMask.test.ts`; §S1.4 | A test seam; the local banner text is unchanged and `extension.ts` gets no line longer |
| Minor 1 | An `eslint-disable` left unused by a move fails lint | §S1.4, §S2.4 | The lint rule as configured (`eslint.config.mjs:20`) |
| Minor 3 | M2's "RED today" was wrong; the tests do not compile before the type | §S1.6 (the order paragraph, the RED column) | Test order and text |
| Minor 5 | "Never in the server's process list" was too strong; `whatItIs` and `usage` said "child environment only" | §S1.3 help (reworded in five languages); Hp6, Hp7; README | Help wording made accurate; D12 is not changed |
| Minor 6 | M8 and M11 used the runner's `$SHELL` | the fake `ssh` paragraph of §S1.6 | Test fixture |
| Minor 7 | A throw from `terminal.show()` could leave a run that spawns later | E3-D7; E3-D11 (c); §S1.2; §S1.3 `maskedTerminal.ts` (the `show()` row); M10b; O8 | Makes E3-D11 (c) ("`open()` after the end does nothing") true for that exit too |
| Minor 8 | `module_extension.md`'s SSH-link section starts at `:2371`; `sshLinkRefusal`'s doc needs an edit; flag 6 is stale | §S3.1; §S1.3 and §S2.3 `remoteLaunch.ts`; flag 6 | References and a doc comment |
| LN7-LN9 | The chain tests must look at both sinks, `sent` and `executed` | §S1.6 (the sinks paragraph, LN7-LN9, LN11) | Makes parent §4.4's chain sink ("`sendText`, or `executeCommand`") fully observed |
