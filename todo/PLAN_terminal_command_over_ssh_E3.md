# PLAN — Terminal command over SSH, E3: Run with Secrets, the agent's run, and the closing

> Status: **stories of E3, nothing implemented yet, 2026-11-10.** Parent: [PLAN_terminal_command_over_ssh.md](PLAN_terminal_command_over_ssh.md) › E3.
> Branch `feat/terminal-command-over-ssh-e3`, started from E2's commit (a5ddd73, E1 + E2 on the Windows quoting security
> fix); E3 lands as ONE commit. Scope: `src_vs_code` only. Three stories, no cornerstone (the parent's ledger stays
> `Cornerstones: 2 of 2 — E1.S2, E1.S3`). Scenarios and briefs by Opus; code and tests by Sonnet; review by Opus. The
> AUTHORISATION part of S2 is a Fable security judgement (outside the quota), in its own file:
> `todo/PLAN_terminal_command_over_ssh_E3_S2_security.md` (not written yet; it becomes a link in the commit that adds it).

Every path below is relative to `src_vs_code/src/` unless it says otherwise. Every `file:line` was opened on a5ddd73.

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
  askpass. The output is masked. A banner says the run is not interactive. A Windows remote, a remote VS Code window and
  a line break are refused before anything is asked. ONE OWNER and ONE SNAPSHOT as on every other road.
- **Scope.** Parent §4.4 bullet "Run with Secrets"; build step 7; D12. Help ×5 for Run with Secrets over SSH.
- **Depends on.** E1 (`SECRETS_REMOTE_COMMAND`, `secretsStdin`, `trustLineFor`, the seam), E2 (`SshRoad`, `ownedSessions`).
- **Done when.** §S1.6 scenarios green, each watched RED first; the scan edits of §S1.4; typecheck and lint green; no
  file over its ceiling; `extension.ts` not one line longer.

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
| E3-D4 | **The secrets spawn prepares with `agentServesKey: false`.** `SshRoad.prepare` gains a third parameter `use: 'terminal' \| 'spawn'` (default `'terminal'`). For `'spawn'` a stored key is always written to its isolated file and `-i` names it. | A terminal reaches the extension's agent through the window's environment collection; a child spawned by the extension host does not. With no key file the child would use whatever `SSH_AUTH_SOCK` the host process has: the "silently authenticates with whatever keys" hazard `sshSession.ts:396-402` refuses on the relay route. |
| E3-D5 | **`SshRoad.spawnLaunch(ssh, env)`** gives the program and the extra environment of a spawned ssh: `openSshBinary('ssh', ssh.agentForward === true, process.platform)` (never a bare name searched in the current folder on Windows) and `SSH_AUTH_SOCK` = the extension's agent socket when the SSH entry forwards the agent, plus the askpass `env`. Composed by ONE new pure function `sshSpawnLaunch` in `sshProgram.ts`, which `sshUseActions.ts` `agentAwareLaunch` (`:95-109`) also uses. | The agent's exec already does exactly this; one composition, two callers (reuse-first). `SshRoadDeps` gains an optional `agentSocket`; `sshRoadOf(sshDeps)` already receives it (`sshUseActions.ts:398`), so `extension.ts` does not change. |
| E3-D6 | **Local window only, checked before prepare**: `windowKind(vscode.env.remoteName) !== 'local'` → `secretsLocalOnly(name)`, nothing prepared. `secretsLaunch` also refuses a prepared session with a relay `prefix` or a client `program` (fail closed; unreachable in a local window). | Parent §4.4 "local window only". The extension host spawns on THIS machine; a WSL or Remote-SSH window's preparation is composed for another shell. |
| E3-D7 | **The masked run takes the session over when it is created.** `OwnedSessions` gains `handOverToRun(ready)` (leaves the list, no clean). `MaskedRunOptions.onEnded` is called EXACTLY ONCE: child `close`, child `error`, a failed start, or the terminal closed before the child started. The road passes `onEnded: () => ready.cleanup()`. | Parent §4.4: after the spawn the owner is the child's exit handler. The pty spawns in `open()`, after `createTerminal` returns, so the hand-over is to the run, which owns every later exit. |
| E3-D8 | **The SSH child's environment never holds a value.** `MaskedRunOptions.env` in argv mode is the askpass and agent variables only; the values reach the remote only in `stdinText`. | D12: never argv, never the remote `ps`; and nothing gains by putting them in the local ssh's environment. |
| E3-D9 | **The agent's SSH call is injected**, as `overSsh` on the deps of `terminalRunAction`. Its implementation `execOverSsh(deps)` lives in `sshUseActions.ts` (the `vscode` side) and is shared with `sshExecAction`. `sshDepsFor` (`sshUseActions.ts:383-405`) returns it, and `agentDeps` already spreads `sshDeps` (`extension.ts:629-637`). | `agentUseActions.ts` imports no `vscode` and its tests load it directly; `resolveExecAuth` and `materializeKnownHosts` reach `vscode` (`keyInstaller.ts:5`, `hostKeyTrust.ts:3`). And `extension.ts` is at its size ratchet (1003). |
| E3-D10 | **No new two-argument prompt and no renamed prompt function** (as E2-D10). If `test/promptSites.test.ts` goes red, stop and report to the judge. | The prompt ledger keys rows by `file#function#…`. |

**The exact sentences and texts** (each lives once, as a constant or a function; tests compare with it):

| Name | Where | Text |
|---|---|---|
| `secretsLocalOnly(name)` | `remoteLaunch.ts` | `Run with Secrets over SSH works only in a local VS Code window, and this window is not one. Nothing was run: open "<name>" from a local window.` |
| `NO_REFERENCE(name)` | `commands/runCommands.ts` (today's literal at `:369-371`, made a function; text unchanged) | `"<name>" holds no creds:// reference. Write one as a value — creds://<account email>/<entity>/<field> — then run this again. Nothing was run.` |
| `secretsOverSshBanner(target, secrets)` | `remoteLaunch.ts` | `Over SSH to <target>. The values go to the remote login shell on its standard input, never on a command line, and are replaced with <CREDS_MASKED:NAME> in what it prints here.<caveat> This run is not interactive: there is no terminal, and the command reads an empty input, so a command that asks a question usually stops. To answer questions, use Run in Terminal instead; the values are not injected there.` |
| `<caveat>` = `shortValuesCaveat(secrets)` | `outputMask.ts` (new export, the words of `extension.ts:972-976` moved, not changed) | `''`, or ` NOT masked, because they are too short to replace without mangling ordinary output: <labels> — a one-time code is six digits, so treat this window as showing it.` |

`<target>` is `ready.target` (`describeSshTarget`: `user@host` with `:port` when not 22). The masked run's banner is
`` `${described}\r\n${secretsOverSshBanner(target, refs.secrets)}` `` where `described` is today's first line
(`runCommands.ts:414-416`).

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
- `const spawn = host.sshRoad.spawnLaunch(ready.snapshot, ready.env)`; a `warning` → `showWarningMessage` (one argument).
- `runInMaskedTerminal({ name: maskedRunTitle(name), argv: [spawn.program, ...launch.argv], env: spawn.env,
  stdinText: secretsStdin(resolved.env, secretsRemoteLine(plan, refs)), secrets: resolved.secrets, banner: …,
  onEnded: () => ready.cleanup() })`, then `sessions.handOverToRun(ready)`.

**ONE SNAPSHOT** (as code review checks it): from `prepare` to the spawn there is no `storage.getNode` of the SSH id, no
`sshLinkOf`, and `plan.ssh` is not read again. The trust line, the argv, the spawn program and the banner target are
built from `ready` only (`ready.entity`, `ready.jump`, `ready.options`, `ready.snapshot`, `ready.target`).

### S1.2 What ssh does with stdin, and why nothing else reads it

`buildSshExecArgv` (`sshExecCommand.ts:94-140`) gives the key branch `-o BatchMode=yes` and the password branch
`-o NumberOfPasswordPrompts=1` with `SSH_ASKPASS_REQUIRE=force` in the environment; both have `ConnectTimeout=10` and
`StrictHostKeyChecking` (`accept-new`, or `yes` with the pinned file). So ssh answers no prompt from stdin, and stdin goes
whole to the remote command. No `-t`: no remote pty. The remote command is `SECRETS_REMOTE_COMMAND`
(`remoteLaunch.ts:298`, `"${SHELL:-sh}" -s`), the last argv element, after `--` and the destination.

### S1.3 The brief — every file, the place, the change

**`remoteLaunch.ts`** (pure; 369 → about 430 lines)

| Add | Content |
|---|---|
| imports | `buildSshExecArgv` from `./sshExecCommand`; `RefPlan`, `rewriteRefs` from `./runPlan`; `shortValuesCaveat` from `./outputMask`; `sshDestination` is already imported for the trust line. Check that no import cycle appears (`runPlan.ts` imports `commandLine`, `types`, `secretRef`, `hostShell`). |
| `export interface PreparedForSpawn` | `entity`, `options: Pick<SshCommandOptions, 'knownHostsFile' \| 'program'>`, `jump`, `prefix`, `env: Readonly<Record<string, string>> \| undefined`, `target: string \| undefined`. Structural, so a `ReadySsh` is assignable with no adapter; doc: reads the snapshot only. |
| `export type SecretsLaunch` | `{ kind: 'spawn'; argv: readonly string[] } \| { kind: 'refused'; reason: string }`. |
| `export function secretsLaunch(plan: RemotePlan, prepared: PreparedForSpawn): SecretsLaunch` | Rows K1-K3: K1 `prefix !== undefined \|\| options.program !== undefined` → `refused` with `secretsLocalOnly(plan.entryName)`; K2 `buildSshExecArgv(prepared.entity, prepared.entity.sshKeyPath, SECRETS_REMOTE_COMMAND, prepared.env === undefined ? 'key' : 'askpass', { jump: prepared.jump, knownHostsFile: prepared.options.knownHostsFile })` answers `undefined` → `refused` with `noHostSentence(plan.sshName)`; K3 → `spawn` with that argv. Doc names D12 and E3-D4. |
| `export function secretsRemoteLine(plan: RemotePlan, refs: RefPlan): string` | `rewriteRefs(plan.line, refs, 'linux')` (E3-D2). Doc: the remote shell is POSIX (D9), so the reads are `"$CREDS_REF_n"`. |
| `export function secretsLocalOnly(name: string): string` | The E3.0 text. |
| `export function secretsOverSshBanner(target: string, secrets: readonly { value: string; label: string }[]): string` | The E3.0 text. |

**`outputMask.ts`** (pure) — add `export function shortValuesCaveat(secrets: readonly { value: string; label: string }[]): string`
with the words of `extension.ts:969-976` (the `short` filter on `MIN_MASKABLE_LENGTH` and the `caveat` text).
**`extension.ts`** — in place, no line added: `maskingBanner` (`:968-978`) uses `shortValuesCaveat(secrets)`; the import on
`:88` names both (`MIN_MASKABLE_LENGTH` stays only if another line still uses it). The file shrinks; `test/sizeRatchet.test.ts`
accepts a shrink. The banner text of the local road does not change (`test/maskedTerminal.test.ts` and the banner tests
stay green unchanged).

**`maskedTerminal.ts`** (172 → about 215 lines)

| Place | Change |
|---|---|
| `MaskedRunOptions` `:27-53` | `commandLine` and `shell` become optional, and three fields are added: `argv?: readonly string[]` — the program and its arguments, spawned with `shell: false`; when set, `commandLine` and `shell` are not read; `stdinText?: string` — written to the child's stdin once, right after the spawn, then stdin is closed; keystrokes are then NOT forwarded; `onEnded?: () => void` — called exactly once when the run ends (E3-D7). The `env` doc says: on top of the parent environment; in argv mode it carries no value (E3-D8). Exactly one of `commandLine` and `argv` must be set: put this in the type (a union), not in a comment. |
| `spawnChild` `:155-172` | One spawn line, from a helper `launchOf(options)` that answers `{ program, args, shell }`: argv mode → `{ program: argv[0], args: argv.slice(1), shell: false }`; else `{ program: options.commandLine, args: [], shell: shellOption(options.shell) }` (today). The line becomes `const child = childProcess.spawn(launch.program, launch.args, {` with `shell: launch.shell`. |
| `open()` `:74-98` | After `child = started.child`: `if (options.stdinText !== undefined) { child.stdin.end(options.stdinText); }` (the `stdin` `error` listener of `:167` is already on). A once-only `ended()` guard calls `options.onEnded?.()`: on `!started.ok`, in the child's `error` and `close` handlers. |
| `close()` `:99-108` | `child === undefined` → `ended()` (the terminal closed before the child started); else kill as today (its `close` event then calls `ended()`). |
| `handleInput` `:109-113` | `stdinText !== undefined` → return without echo or write (stdin is the script, and closed). |
| `killChild` comment `:103-106` | Add: in argv mode there is no shell; `tree: true` stays harmless. |
| file doc `:8-25` | One paragraph: the argv mode of Run with Secrets over SSH (E3.S1): no shell, a script on stdin then end of input, no keystrokes forwarded. |

**`sshProgram.ts`** (pure) — add `export function sshSpawnLaunch(entity: EntityMetadata, socket: string | undefined, platform: NodeJS.Platform): { program: string; env: NodeJS.ProcessEnv; warning?: string }`
= `openSshBinary('ssh', entity.agentForward === true, platform)` and `agentForwardEnv({}, entity.agentForward === true, socket)`.
`sshUseActions.ts` `agentAwareLaunch` (`:95-109`) calls it and merges `env` over its base; its `deps.note` of the warning stays.

**`sshRoad.ts`** (226 → about 260 lines)

| Place | Change |
|---|---|
| `SshRoad` `:21-33` | `prepare(accountId, ssh, use?: 'terminal' \| 'spawn')` with a doc for `'spawn'` (E3-D4); new `spawnLaunch(ssh: EntityMetadata, env: Readonly<Record<string, string>> \| undefined): { program: string; env: Record<string, string>; warning?: string }` (E3-D5): `sshSpawnLaunch(ssh, deps.agentSocket?.(), process.platform)`, its `env` with `env` merged on top. |
| `SshRoadDeps` `:36` | `Pick<SshUseDeps, 'storage' \| 'storageDir' \| 'relays' \| 'servesKeyForEntity'> & Partial<Pick<SshUseDeps, 'agentSocket'>>`. |
| `sshRoadOf` `:38-52` | `optionsFor(ssh, use)`: `agentServesKey: use === 'spawn' ? false : deps.servesKeyForEntity?.(ssh) === true`; everything else as today (`isolate: true`). |
| `OwnedSessions` `:61-81` | Add `handOverToRun(ready: ReadySsh): void` = `owned.delete(ready)` with the doc of E3-D7. |

**`commands/runCommands.ts`** (436 → about 520 lines)

| Place | Change |
|---|---|
| imports `:13-26` | `planRefs` stays; add `windowKind` to the `../hostShell` import; `../remoteLaunch` adds `RemotePlan`, `secretsLaunch`, `secretsLocalOnly`, `secretsOverSshBanner`, `secretsRemoteLine`, `secretsStdin`, `trustLineFor`; `../sshRoad` adds `ownedSessions`; `ReadySsh` type from `../sshSession`; `RefPlan` from `../runPlan`. |
| `runWithSecrets` `:299-308` | §S1.1 steps 2-4: `const job = …; if (job === undefined) return; const link = secretsLinkOf(host, job); await (link.kind === 'none' ? runSecretsHere(host, job) : runSecretsOverSsh(host, job, link));`. `secretsLinkOf`: a script → `{ kind: 'none' }`; a command → `sshLinkOf(…)`. |
| new `runSecretsHere(host, job)` | Today's `:301-307` (gates with `secretsRefusal`, `resolvedRefs`, `runMasked`), unchanged. |
| `secretsRefusal` `:311-313` | Unchanged (the script with a synced link, and the OS check). Its doc: the script path and the local road; a linked command goes over SSH (E3.S1). |
| `resolvedRefs` `:369-371` | The literal becomes `NO_REFERENCE(job.entry.name)`; same text. |
| new `runSecretsOverSsh`, `spawnOverSsh`, `trustedThenSpawned`, `maskedOverSsh` | §S1.1 step 4 and 5. `maskedOverSsh(job, plan, refs, ready, launch, resolved, spawn)` builds the options and calls `runInMaskedTerminal` (keep each ≤ 50 lines, complexity ≤ 4, parameters ≤ 4: pass a small record). |
| file doc of Run with Secrets `:288-298` | One paragraph: a linked command runs over SSH (E3.S1): the order, ssh by argv, the script on stdin, local window only, the banner. |

**Test helpers**

| File | Change |
|---|---|
| `test/arrowWorld.ts` `:23` and `:134` | The `masked` record type takes the new options (`argv?`, `env`, `stdinText?`, `secrets`, `banner`, `onEnded?`, `commandLine?`). `ArrowOptions` gains `remoteName?: string`, set on the stub's `env.remoteName` (absent = a local window). Expose `events` pushes: the mock of `runInMaskedTerminal` pushes `'spawn'` into the road's shared `events` when the test passes one (`ArrowOptions.events?: string[]`); the vault's `refSource` read pushes `'resolve'` the same way (wrap `vaultOf`'s source in the test). |
| `test/sshRoadWorld.ts` `fakeRoad` `:76-` | `prepare(accountId, ssh, use)` records `use` in a NEW array `uses: string[]` (NOT in `calls`: E2 tests deep-equal `calls`). New `spawnLaunch(ssh, env)` → `{ program: 'ssh', env: { ...(env ?? {}) } }`, recorded in `launches`. |

**The road scan — `test/launchRoadScan.test.ts`** (same commit; the stale-entry test forces it)

| List | Change |
|---|---|
| `SENDS` `:20` | Add `/\brunInMaskedTerminal\s*\(/g`: the linked road calls the masked run directly, and no pattern saw it. |
| `ALLOWED_SENDS['commands/runCommands.ts']` `:136-141` | Add `{ line: 'runInMaskedTerminal({', because: 'Run with Secrets: the local child through its shell (runMasked), and the linked child by argv with the script on stdin (E3.S1)', count: 2 }`. `runMasked(host, job, refs);` and its declaration stay (the local road). |
| `ALLOWED_SENDS['maskedTerminal.ts']` `:178` | The spawn line's new text `const child = childProcess.spawn(launch.program, launch.args, {`, `because: 'the masked child of Run with Secrets: through a shell (local) or by argv with shell false (over SSH, E3.S1)'`; add `export function runInMaskedTerminal(options: MaskedRunOptions): vscode.Terminal {` (`because: 'the declaration'`). |
| `REFUSAL_SITES` `:189-195` | Unchanged: `commands/runCommands.ts:secretsRefusal` STAYS (the script path). |
| `RESOLVE_IMPORTERS` `:103` | Unchanged in S1: `commands/runCommands.ts` still imports `resolveCommand` (the local road's `parts`, and E2's `arrowLine`). See Flag 1. |
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
- `research/module_extension.md` `:2352-2354` ("The agent's `creds_run` (`capturedRun`) and *Run with Secrets* spawn on
  THIS machine"): add "— unless the entry runs over SSH (E3)".
- `:2378-2386` ("The refusal on every road"): Run with Secrets leaves the caller list, except a SCRIPT that a sync linked.
- A new paragraph after the E2.S3 paragraph (it ends near `:2440`), **Run with Secrets over SSH (E3.S1)**: the order; the
  checks before prepare (plan, local window, no reference); `prepare(…, 'spawn')` and why (E3-D4); `secretsLaunch`
  (argv, `-o BatchMode=yes` or askpass, `SECRETS_REMOTE_COMMAND` last); `secretsRemoteLine` (E3-D2); the script on stdin
  then end of input; `spawnLaunch` (E3-D5); the one owner with `handOverToRun` and `onEnded`; the banner.
- `research/module_tests.md`: a new section `## Run with Secrets and the agent's run over SSH (E3 of PLAN_terminal_command_over_ssh.md)`
  after the E2 section (`:1313-1331`), the run command, one row per new test file, a **Teeth** line and a **Not covered**
  line (a real sshd, a Windows local host with a password entry: hand check 3). The `:1304` row says which roads still
  refuse (the agent's run until S2; a linked script; an agent's VPN start).

### S1.4 Line budget (checked before the first edit)

| File | Now | After S1 | Ceiling | How |
|---|---|---|---|---|
| `extension.ts` | 1003 | ≤ 1003 | ratchet 1003 | edits in place only; it shrinks |
| `commands/runCommands.ts` | 436 | about 520 | 800 | — |
| `remoteLaunch.ts` | 369 | about 430 | 800 | — |
| `maskedTerminal.ts` | 172 | about 215 | 800 | — |
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
| K1 | `the_argv_ends_with_the_remote_login_shell_reading_stdin_after_the_destination` | for a key ready (`entity.sshKeyPath: '/keys/s1.key'`, no env): `kind 'spawn'`; argv deep-equals `buildSshExecArgv(entity, '/keys/s1.key', SECRETS_REMOTE_COMMAND, 'key', { jump, knownHostsFile })`; its last element is `SECRETS_REMOTE_COMMAND`; the two before it are `--` and `deploy@prod.example`; no element is `-t` | no export |
| K2 | `a_password_session_uses_askpass_one_prompt_and_a_connect_timeout` | ready with `env` set: argv holds `NumberOfPasswordPrompts=1` and `ConnectTimeout=10`, not `BatchMode=yes`; no element holds the password value of `env` | no export |
| K3 | `a_pinned_host_is_enforced` | `options.knownHostsFile: '/keys/kh-s1'`: argv holds `StrictHostKeyChecking=yes` and `UserKnownHostsFile=/keys/kh-s1`; without it, `StrictHostKeyChecking=accept-new` | no export |
| K4 | `the_jump_and_the_forwards_are_the_trust_lines` | an SSH entry with `agentForward: true`, one enabled `-L` forward and `jump 'deploy@bastion'`: every word of `sshOptionArgv(entity, jump)` appears in the argv, in that order (the trust line's words, so what was approved is what connects) | no export |
| K5 | `a_relay_prefix_or_a_client_program_is_refused_as_not_local` | `prefix: 'env SSH_AUTH_SOCK=… '` → `refused` with `secretsLocalOnly('deploy')`; the same for `options.program: '/mnt/c/…/ssh.exe'` | no export |
| K6 | `an_entity_with_no_safe_host_is_refused_with_the_no_host_sentence` | `entity.host: '-oProxyCommand=x'` → `refused` with `noHostSentence('prod box')` | no export |
| K7 | `the_remote_line_reads_each_reference_from_the_posix_environment` | `secretsRemoteLine(PLAN, planRefs([PLAN.line]))` equals `'printenv "$CREDS_REF_1"'`; it holds no `creds://` | no export |
| K8 | `the_banner_is_exact_and_names_the_target` | `secretsOverSshBanner('deploy@prod.example:2222', [{ value: 'x'.repeat(12), label: 'CREDS_REF_1' }])` equals the E3.0 text literally, with `<caveat>` empty; with a 6-character value it holds `shortValuesCaveat(…)` and names `CREDS_REF_1` | no export |
| K9 | `the_short_value_caveat_is_the_words_the_local_banner_had` | `maskingBanner(secrets)` (from `../extension`, through the stub) still includes `shortValuesCaveat(secrets)` for a short value — the local banner did not change | no export |

**`test/maskedTerminal.test.ts`** (append; its `world()` and `run()`; a real child, as the file's doc says)

| # | Test | Assertion | RED today |
|---|---|---|---|
| M1 | `argv_mode_runs_no_shell` | `argv: ['/bin/echo', '$HOME;id']`: the screen shows `$HOME;id` literally (posix only; on win32 skip with a printed reason) | `argv` is ignored, `commandLine` undefined: the spawn fails |
| M2 | `stdin_text_is_written_once_then_closed` | `argv: ['/bin/sh', '-c', 'cat; echo END']`, `stdinText: 'hello-from-stdin\n'`: the screen holds `hello-from-stdin` then `END`, and `[exit 0]` (cat ended, so stdin was closed) | no stdin write: `cat` waits forever (the test's own timeout fails it) |
| M3 | `keystrokes_are_not_forwarded_when_stdin_is_a_script` | M2's child with `sleep 1` before `cat`; `pty.handleInput('typed\r')` during the sleep: the screen does not hold `typed` | `typed` is echoed and written |
| M4 | `on_ended_is_called_once_when_the_child_exits` | `argv: ['/bin/true']`, a counter: after the close, `1` | no option |
| M5 | `on_ended_is_called_once_when_the_program_does_not_exist` | `argv: ['/nonexistent/ssh-xyz']`: the screen says it could not start, and after both `error` and any `close`, the counter is `1` | no option |
| M6 | `on_ended_is_called_once_when_the_terminal_closes_before_the_child_starts` | `pty.close()` before `pty.open()`: counter `1`; `open()` is then not called by the stub | no option |
| M7 | `the_env_of_argv_mode_reaches_the_child` | `argv: ['/bin/sh', '-c', 'printf %s "$ASKPASS_PROBE"']`, `env: { ASKPASS_PROBE: 'probe-value-1234' }`: shown | `argv` ignored |
| M8 | `end_to_end_values_echoed_to_stdout_and_stderr_are_masked` | A fake `ssh` in an `ownedDir(t, 'ssh')` (the pattern of `test/remoteLaunchDelivery.test.ts:66-80`): it records its argv NUL-separated and its environment (`env -0`) to two files, skips its options to `--`, skips the destination, and runs the last argument with `/bin/sh -c` (what sshd does with an exec request), stdin inherited. Run `argv: [fake, ...secretsLaunch(PLAN, ready).argv]`, `env: {}`, `stdinText: secretsStdin(env, 'printf "%s\\n" "$CREDS_REF_1"; printf "%s\\n" "$CREDS_REF_2" >&2')` with `CREDS_REF_1 = "it's $HOME \"quoted\" value"` and `CREDS_REF_2 = 'second-secret-value-42'`, `secrets` both with their labels. The screen holds `<CREDS_MASKED:CREDS_REF_1>` and `<CREDS_MASKED:CREDS_REF_2>` and neither raw value; the recorded argv holds neither value; the recorded environment holds neither value | no argv mode |

**`test/sshRoad.test.ts`** (append; its `loadWithVscode` world)

| # | Test | Assertion | RED today |
|---|---|---|---|
| H6 | `a_spawn_preparation_never_relies_on_the_agent` | `servesKeyForEntity` answers true; `prepare(acct, ssh, 'spawn')` → the mocked `prepareSshSession` got `agentServesKey === false` and `isolate === true`; `prepare(acct, ssh)` still gets `true` | the third argument is ignored |
| H7 | `spawn_launch_names_the_built_in_client_and_the_extensions_agent_for_a_forwarding_entry` | `agentSocket: () => '/tmp/agent.sock'`, `ssh.agentForward: true`: `program` equals `openSshBinary('ssh', true, process.platform)`; `env.SSH_AUTH_SOCK === '/tmp/agent.sock'`; the askpass `env` passed in is merged; without forwarding, no `SSH_AUTH_SOCK` | no method |
| H8 | `hand_over_to_run_leaves_the_list_and_does_not_clean` | `own(r)`, `handOverToRun(r)`, `cleanAll()` → `cleanup` 0 | no method |

**`test/sshRoadSecrets.test.ts`** (new; `arrowWorld({ others: [S1, alert], sshRoad: road, events }, [], vault.source)` and `aw.runWithSecrets(LINKED)`)

| # | Test | Assertion | RED today |
|---|---|---|---|
| S1 | `the_order_is_prepare_trust_dependencies_resolve_spawn` | `LINKED` + `dependsOn: ['dep']`, `runDependencies: true`, `dep` a trusted local step; trust modal answered Run: one ordered `events`: `prepare s1#1`, the trust modal, `dep` executed, `resolve`, `spawn` | E1's sentence, nothing |
| S2 | `no_child_and_no_value_before_the_trust_answer` | the trust modal HELD: `aw.masked` `[]`, `vault.calls` `[]`, `road.calls.length === 1`; then answered: one masked run | E1's sentence |
| S3 | `the_child_is_ssh_by_argv_with_no_value_in_argv_or_env` | after the run: `masked[0].argv` deep-equals `['ssh', ...secretsLaunch(PLAN, r1).argv]`; `commandLine` undefined; no element of `argv` and no value of `env` holds `correct-horse-battery-staple`; `road.uses` deep-equals `['spawn']` | E1's sentence |
| S4 | `stdin_carries_the_exports_and_the_line_in_a_group_then_exit` | `masked[0].stdinText === secretsStdin({ CREDS_REF_1: 'correct-horse-battery-staple' }, 'printenv "$CREDS_REF_1"')`; it holds `} </dev/null` and ends with `exit $?\n` | E1's sentence |
| S5 | `the_output_is_masked_and_the_banner_says_not_interactive` | `masked[0].secrets` deep-equals `[{ value: 'correct-horse-battery-staple', label: 'CREDS_REF_1' }]`; `masked[0].banner` ends with `secretsOverSshBanner(r1.target, masked[0].secrets)` | E1's sentence |
| S6 | `trust_is_asked_on_the_trust_line_and_one_approval_covers_the_arrow` | the modal text includes `trustLineFor(r1.entity, r1.jump, PLAN.line)`; afterwards `isCommandTrusted(aw.trust, 'e1', thatLine)` true; a local trust of `PLAN.line` alone does NOT skip the modal | E1's sentence |
| S7 | `a_linked_entry_runs_with_secrets_over_ssh` | the happy run, trusted: one masked run, `cleaned` `[]` (the run owns it now), then `masked[0].onEnded()` twice → `cleaned` `['s1#1']` once | E1's sentence |
| S8 | `a_password_entry_puts_askpass_in_the_child_env_never_in_argv` | script `{ password: true }`: `masked[0].env` includes every key and value of `r1.env`; `argv` holds `NumberOfPasswordPrompts=1`; no `argv` element holds `r1.env.CREDS_ASKPASS_PASSWORD` | E1's sentence |
| O1 | `owner_a_declined_trust_spawns_nothing_and_cleans` | modal `'dismiss'`: `aw.masked` `[]`, `vault.calls` `[]`, `cleaned` `['s1#1']` | `road.calls` is 0 (E1) |
| O2 | `owner_a_cancelled_dependency_spawns_nothing_and_cleans` | S1's world, the chain modal answered `undefined`: `masked` `[]`, `vault.calls` `[]`, `cleaned` `['s1#1']` | E1's sentence |
| O3 | `owner_a_failed_resolution_spawns_nothing_and_cleans` | a reference to `creds://me/gone/password` (no such entity): the error message is today's `Nothing was run: …`; `masked` `[]`; `cleaned` `['s1#1']` | E1's sentence |
| O4 | `owner_a_thrown_error_cleans` | a `refSource` that throws: `await assert.rejects(aw.runWithSecrets(LINKED))`; `cleaned` `['s1#1']` | E1's sentence, no throw |
| O5 | `owner_a_failed_terminal_creation_cleans` | the mocked `runInMaskedTerminal` throws: rejects; `cleaned` `['s1#1']` | E1's sentence |
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

### S1.7 Commands

From the repository root (`CLAUDE.md` §Commands; `common/local-cpu-budget.md`):

```bash
LP=$PWD/.agents/conventions/tools/low-priority.mjs
cd src_vs_code
node $LP npm run typecheck
node $LP npm run lint
node $LP npm run compile
node $LP node --test out/test/secretsLaunch.test.js out/test/maskedTerminal.test.js out/test/sshRoad.test.js out/test/sshRoadSecrets.test.js out/test/sshRoadHelp.test.js
node $LP node --test out/test/launchRoadScan.test.js out/test/commandRoadScan.test.js out/test/sshLinkRoads.test.js out/test/remoteLaunch.test.js out/test/remoteLaunchDelivery.test.js out/test/sshRoadArrow.test.js out/test/sshRoadFolder.test.js out/test/sshRoadChain.test.js out/test/runPlan.test.js out/test/secretMasker.test.js out/test/promptSites.test.js out/test/sizeRatchet.test.js out/test/agentUseActions.test.js out/test/sshExecCommand.test.js
node $LP node scripts/size-ratchet.mjs
```

The lead runs the full `npm test`.

---

## S2 — The agent's run over SSH (non-authorisation brief)

### S2.1 What the Fable spec owns, and what it must answer

The spec `todo/PLAN_terminal_command_over_ssh_E3_S2_security.md` (Fable, a security judgement outside the quota) owns
these and nothing in §S2.2-§S2.5 decides them:

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

### S2.2 What the road does (after the gate)

`terminalRunAction` (`agentUseActions.ts:188-237`; `run` has 48 of its 50 code lines) becomes a short dispatcher:

1. `entityFor` as today; gone → `not_found`.
2. `const link = sshLinkOf(entity, (id) => deps.storage.getNode(ctx.accountId, id))`;
   `const plan = planLaunch(entity, link, { stayOpen: false })` (D11's bare line: ssh's exit status is the command's).
3. `empty` → `fail('no_credential', `"${ctx.entityName}" has no command.`)` (today's words). `refused` → the Fable
   spec's rule for which sentence the agent hears; a `{name}` refusal reads `` `"${ctx.entityName}" will not run: ${reason}` ``
   as today. Use the one helper `refusalSaid(entry, reason)` (below).
4. `local` → `runHere(deps, ctx, entity, plan.line)`: today's `:211-235` (OS check without `sshLinkRefusal`, trust on the
   line, slot, `capturedRun`), unchanged in behaviour.
5. `remote` → **the Fable gate**, then `runThere(deps, ctx, plan)`:
   - `const chain = resolveJumpChain(plan.ssh, (id) => deps.storage.getNode(ctx.accountId, id)?.details)`; not ok →
     the Fable spec's sentence (question 4).
   - `trustLineFor(plan.ssh, chain.value, plan.line)` not trusted (`isCommandTrusted(deps.trustStore, ctx.entityId, …)`)
     → `untrusted(ctx.entityName, 'the line')` (`:108-113`, today's words). Before the slot, as today.
   - `const release = deps.acquireExecSlot()`; none → `too_many_requests` (today's words).
   - `try { return await deps.overSsh(ctx, { ssh: plan.ssh, jump: () => chain, remoteCommand: plan.remoteCommand,
     timeoutMs: clampExecTimeout(undefined) }); } finally { release(); }`.

**ONE SNAPSHOT:** `plan.ssh` is the object `sshLinkOf` read, once. The trust line and the argv are built from it and from
`chain`, resolved once; nothing reads the SSH entry again. `resolveExecAuth` reads the CREDENTIAL (the key entity), which
is not the target.

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
| `extension.ts` | NOT touched: `agentDeps` spreads `sshDeps` (`:629`). |
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
| AG5 | `snapshot_the_ssh_entry_is_read_once` | `getNode` counts reads of `s1`: exactly the reads the gate and `sshLinkOf` make, as the Fable spec lists them, and none after the trust check | E1's sentence |
| AG6 | `a_linked_entry_written_for_windows_is_refused_and_runs_nothing` | `terminalOs: 'windows'`: `not_supported`, `overSsh` 0, slot 0 (the sentence per the Fable spec, question 4) | E1's sentence differs |
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
| `src_vs_code/CHANGELOG.md` `## [Unreleased]` | One `### Added — a Terminal entry runs its command over a chosen SSH connection` block: the field (*Runs over SSH*); every road (arrow, VPN *Started by*, *Run All in Folder*, a dependency step, *Run with Secrets*, an agent's run) with one line each; the trust line (a changed host, user, port, jump, agent forwarding or forward asks again); *Copy Command* copies the trust line; the refusals (Windows server, non-local window for secrets, `{config}` in a linked launcher, a password dependency step, PowerShell 5.1 with `"` or a final `\`, an agent's VPN start with a linked launcher); share and export leave the link out, *Update it* keeps the recipient's own; the older-build note. One `### Changed` line: SSH Connect's preparation is shared (no behaviour change). Cite `file:line` as the existing entries do. |
| `research/module_extension.md` | Read the whole SSH-link section (from `#### Terminal entry SSH link`, about `:2356`, to the end of the E3 paragraphs) as ONE text: no sentence says a road "still refuses" that runs now; "The refusal on every road" lists exactly the remaining callers of `sshLinkRefusal` (scan 4's list); the module map names `remoteLaunch.ts`, `sshSession.ts`, `sshRoad.ts`, `entityCommandRows.ts`, the scan. |
| `research/module_tests.md` | The E1, E2 and E3 sections: every new test file has a row; each row's flow is covered or `not covered` with a reason; one **Not covered** line names the hand checks of parent §10 and who runs them. |
| parent §10 | Hand check 3 is handed to the owner (it is owed, not a gate for the merge); the summary says so. |

### S3.2 The promotion — together, the `git mv` LAST (`planning-docs.md` § *The `git mv` goes LAST*)

The documents: `PLAN_terminal_command_over_ssh.md`, `_E1.md`, `_E1_S2_spec.md`, `_E1_S3_spec.md`, `_E2.md`, `_E3.md`,
`_E3_S2_security.md`. NOT `PLAN_windows_shell_quoting_injection.md` (its own plan and clock, parent §7a).

1. While every file is still in `todo/`: each status line becomes `> Status: **IMPLEMENTED, <YYYY-MM-DD>.**` with its
   deviations. The parent's deviations section collects at least: E1 §S4 F1-F7; E2's four recorded deviations and its
   flags 2-5; E3-D2 (references only from the line that runs, over SSH); E3-D4 (a spawn always writes the key file);
   the §4.5 (1) importer target as reached or not (Flag 1); the `sshLinkRefusal` sentence's last callers (Flag 4);
   the CHANGELOG path. A deviation that records something as impossible names what was CHECKED.
2. The parent's ledger: read it whole. If this epic's work accepted a change after epoch 2's approval, it is entry 2.1
   (and a second one is the full stop of `plan-change-control.md`). A stories document keeps no ledger.
3. Links, the three cases: (1) the movers' links to plans still in `todo/` (`PLAN_askpass_answers_the_hop.md`,
   `PLAN_terminal_runs_followups.md`, `PLAN_windows_shell_quoting_injection.md`, `PLAN_remote_bridge_scoped.md`) gain
   `../todo/`; (2) links to `research/` files (`PLAN_os_aware_execution.md`, `research/module_*.md`) drop `../research/`;
   (3) inbound links: `todo/README.md` rows go, `research/README.md` gets one mention per document (each stories
   document is a plan to the checker); `research/PLAN_windows_shell_quoting_injection.md:67` cites `todo/PLAN_terminal_command_over_ssh.md`;
   `remoteLaunch.ts:11` cites `todo/PLAN_terminal_command_over_ssh_E1_S2_spec.md` — both become `research/…`. Find the
   rest by `grep -rn "PLAN_terminal_command_over_ssh" --include=*.ts --include=*.md .`, not from memory.
4. `git mv` each of the seven, `git add` each destination (the move staged the original bytes), and commit in the same
   breath with `todo/README.md`, `research/README.md` and the referrers.
5. `node .agents/conventions/tools/plan-lifecycle.mjs` clean; every markdown link in `todo/` and `research/` resolves.

### S3.3 Checklist

- [ ] The help tests pass, five languages, English first; no help text says a road refuses that runs.
- [ ] README, CHANGELOG, `module_extension.md`, `module_tests.md` describe the shipped system.
- [ ] The seven documents promoted together, deviations recorded, links walked, `plan-lifecycle.mjs` clean.
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
  `prepareSshSession`, `cleanup()`, the trust store or `commandFingerprint`.
- **No change to `ssh:exec`'s behaviour**: its body moves into `execOverSsh`, in the same order.
- **No fix of risk 7** (askpass answers a jump host's password prompt): a password SSH entry with a jump host has it on
  these roads too (`PLAN_askpass_answers_the_hop.md`).
- **No `SendEnv` control.** The askpass variables stay in the LOCAL ssh's environment; the argv asks for no `SendEnv`.
  A person's own `~/.ssh/config` with `SendEnv` could forward them, as with SSH Connect today.
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

## E3.L — Lead decisions on the flags (2026-11-10)

| Flag | Decision |
|---|---|
| 1 — `resolveCommand(` still imported by `commands/runCommands.ts` after E3 | `LaunchPlan`'s `local` (and `remote`) variant carries the resolved `parts`, so the local roads read them from the plan and stop importing `resolveCommand`; the road scan's importer list then ends at `commandLine.ts` and `remoteLaunch.ts` (parent §4.5 (1), as written). Built in S1. Not a plan change: it makes the plan's own target true. |
| 2 — the consent must name the SSH entry and target, but `UseAction.summarize(body)` has no target | An internal interface widening that makes D2 true as written; the Fable spec (§S2.1) chooses its shape. Not a plan change. |
| 3 — references only from the line that runs; "no reference" said before prepare; the spawn always writes the key file | Implementation details within D12; recorded as deviations at promotion. |

S2 security spec: [PLAN_terminal_command_over_ssh_E3_S2_security.md](PLAN_terminal_command_over_ssh_E3_S2_security.md) (Fable, 2026-11-10). Its finding F7 (outside this plan: `refusalFor` in `brokerRequests.ts` can confirm an entry's name to an agent on a guessed id) is reported to the owner, not built here.

## E3.R1 — Owed after E3's first plan round (2026-11-10: revise, 7 gating of 6, 2 of 2 reviewers; all 8 findings accepted)

To be written into the stories (and the S2 security spec where named) before round 2:

1. The masked run is bounded: `ConnectTimeout`, and a run whose terminal closes kills the child tree; no stdin write can outlive the run (a test with a stalled child).
2. E3.L flag 1 is WITHDRAWN: `LaunchPlan` (E1.S2's cornerstone type) is not changed; `commands/runCommands.ts` keeps importing `resolveCommand` for the local Run with Secrets, recorded as a deviation from §4.5 (1) at promotion.
3. The spawn-road warning is part of the banner (or awaited before the run), not a one-argument toast racing the launch.
4. **Security:** the askpass variables (`SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE`, `CREDS_SSH_PASSWORD`) must not be sendable by the person's own `SendEnv`: the spawned ssh gets `-o SendEnv=-<name>` for each (OpenSSH removes a SendEnv pattern with a leading `-`), measured with a fake sshd/`ssh -G` that the effective SendEnv list holds none of them; a scenario with a `SendEnv CREDS_*` config. The same exposure exists TODAY in SSH Connect's password terminal and the E2 roads' password terminals — reported to the owner as its own security item, not fixed in E3.
5. One atomic, idempotent hand-over from the owner to the masked run, covering terminal-creation failure and close-before-start; cleanup exactly once (tests).
6. S2 (security spec): the gate runs BEFORE any refusal that reads the link or the SSH entry; every pre-gate outcome (missing, other account, unsafe host, malformed line, Windows remote) answers the one non-disclosing sentence; tests for each.
7. M2's real-child test has a short explicit timeout and kills the child tree on timeout.
8. S3's promotion lists, document by document, the `research/README.md` mention and the removed `todo/README.md` row for each of the seven documents, then runs `plan-lifecycle.mjs`.
