# PLAN — Terminal command over SSH, E2: the arrow and the VPN launcher, the folder run, the dependency chain

> Status: **built 2026-11-10 on feat/terminal-command-over-ssh-e2 (local, not pushed), promotes with the parent.** Parent: [PLAN_terminal_command_over_ssh.md](PLAN_terminal_command_over_ssh.md) › E2.
> Branch `feat/terminal-command-over-ssh-e2`, started from E1's commit (2a42365); E2 lands as ONE PR. Scope: `src_vs_code`
> only. Three stories, no cornerstone (the parent's ledger stays `Cornerstones: 2 of 2 — E1.S2, E1.S3`). Scenarios and
> briefs by Opus; code and tests by Sonnet; review by Opus.

Every path below is relative to `src_vs_code/src/` unless it says otherwise. Every `file:line` was opened on 2a42365.

## The three stories

| Story | What | Scenarios and brief | Code and tests | Review |
|---|---|---|---|---|
| S1 | Arrow and VPN launcher, `sendGuarded`'s `ssh` target, the road host `sshRoad.ts`, Copy Command and the viewer copies | Opus, §S1 | Sonnet | Opus |
| S2 | Folder run | Opus, §S2 | Sonnet | Opus |
| S3 | Dependency chain | Opus, §S3 | Sonnet | Opus |

S1 lands first (S2 and S3 use its `SshRoad`, `ownedSession`, `cleanWhenClosed`, `sshReaderShell` and the `ssh` target).
S2 and S3 do not depend on each other. Each story is complete alone: a road whose story is not built keeps E1's refusal.

### S1 — Arrow and VPN launcher

- **Goal.** The green arrow and a VPN's *Started by* (the person's own Start) run a linked entry on the chosen host in
  the order link → prepare → trust → dependencies → synchronous send, from one snapshot of the SSH entry, with
  `cleanup()` on every exit that sends nothing. A password entry opens a NEW terminal with its env beside a live one,
  nothing disposed (D10). A linked launcher whose line uses `{config}` is refused. Copy Command, the viewer's *Full
  command* row and copy, and Copy All show the trust line with the one sentence (§4.4 "Copy Command / viewer").
- **Scope.** Parent §4.4 head (order, one owner, one snapshot), bullets "Arrow and VPN launcher" and "Copy Command /
  viewer"; build step 4; D10; risks 3, 4, 5. Help ×5 for the arrow, the launcher and Copy Command; the hand-written
  `ssh -t <host>` advice is replaced.
- **Depends on.** E1 (2a42365).
- **Done when.** §S1.4 scenarios green, each watched RED first; the road scan and `commandRoadScan.test.ts` green with
  the list edits of §S1.3; typecheck and lint green; no file over its ceiling; `extension.ts` not one line longer.

### S2 — Folder run

- **Goal.** *Run All in Folder* shows each linked row's trust line in its modal, prepares every linked row in row order
  after the modal and the chain and before the synchronous `typeAll`, re-checks each trust line from its prepared
  snapshot, reports a refused or changed row as failed and types the others, stops the WHOLE run on a `stopped` row
  (nothing typed, every prepared row cleaned), and cleans in the run's `finally` every row not handed over.
- **Scope.** Parent §4.4 bullet "Folder run"; build step 5. Help ×5 for the folder run.
- **Depends on.** S1.
- **Done when.** §S2.4 scenarios green, each watched RED first; the scan list edits of §S2.3; typecheck, lint green.

### S3 — Dependency chain

- **Goal.** A linked dependency step runs over SSH with the bare line (no stay-open, D11), so the chain sees its exit
  code; *Runs on* of a linked step is not an OS refusal; a password step refuses the whole chain before any step; each
  step has its own isolated key and pin, deleted when the step ends; a step linked to the same SSH entry as its parent
  leaves the parent's files alone.
- **Scope.** Parent §4.4 bullet "Dependency chain"; build step 6; D11. Help ×5 for the chain.
- **Depends on.** S1.
- **Done when.** §S3.4 scenarios green, each watched RED first; the scan edits of §S3.3; typecheck, lint green.

## E2.0 — Decisions taken here (Opus), and the shared contract

| # | Decision | Why |
|---|---|---|
| E2-D1 | **One road host, `sshRoad.ts` (new, `vscode`).** `interface SshRoad { prepare(accountId, ssh): Promise<PreparedSsh>; sayRefused(refused, ssh): Promise<void> }`, built by `sshRoadOf(deps)` from the existing `SshUseDeps` record (`storage`, `storageDir`, `relays`, `servesKeyForEntity`). `prepare` calls `prepareSshSession` with `isolate: true`, `agentServesKey: deps.servesKeyForEntity?.(ssh) === true` and `remote: remoteWindowDeps(deps.relays, remedyRunner(undefined))` when `relays` is set. `sayRefused` shows SSH Connect's own refusal modal with its remedy and NO retry (parent §4.3: "the person runs the entry again"). | Every road prepares the same way; a test injects a fake `SshRoad` through the host record (no module mock). `isolate: true` is the S3 spec's A1 contract ("every road passes it"). |
| E2-D2 | **The road host is passed only by the PERSON's roads.** `RunCommandsHost.sshRoad` (required), `EntityCommandsHost.sshRoad?` → `runVpn(…, sshRoad?)` → `VpnRunContext.sshRoad?`, and (S3) `DependencyRunRequest.ssh?`. The agent's `creds_vpn_up` (`vpnRun.ts:38-42`, `agentVpnOpener`) passes none, so a linked launcher or a linked chain step on an agent call keeps E1's sentence (`sshLinkRefusal`). | The parent does not say whether an agent's VPN grant may reach an SSH entry through a launcher or a chain step (D2 covers `creds_run` only). Fail closed until that is decided — see "Flags" at the end. |
| E2-D3 | **`sendGuarded` and `typeIntoNew` take a `SendTarget`**: `{ kind: 'entry'; terminalOs: string \| undefined }` (today) or `{ kind: 'ssh'; env?: Record<string, string> }`. For `ssh` the local shell is SSH Connect's (`composedShellPath()`, `pinnedTerminal.ts:54-56`, D14); *Runs on* is not read. With `env` (password) the guard never finds and never disposes: it opens a new terminal with the env (D10). | Parent §4.4 "Arrow and VPN launcher". |
| E2-D4 | **ONE OWNER is one helper**, `ownedSession(ready, use)` in `sshRoad.ts`, for the arrow and the launcher (shape below). The folder run owns a list (§S2.2); the chain owns one session per step (§S3.2). After the hand-over, `cleanWhenClosed(terminal, ready)` (`sshRoad.ts`) calls `cleanup()` on that terminal's close, or at once when it is already closed. | Five exits (declined trust, cancelled dependency, thrown error, failed terminal creation, unsent row) in one `finally`. |
| E2-D5 | **ONE SNAPSHOT.** The road passes `link.ssh` (as `sshLinkOf` read it) to `prepare`; from then on the trust line is `trustLineFor(ready.entity, ready.jump, plan.line)` and the typed line is `typedLine(plan, ready, sshReaderShell())`. Between `prepare` and the send or hand-over, nothing reads the SSH entry from storage. The folder is the one road whose approval comes BEFORE preparation, so it re-reads the SSH entry after the modal, prepares, rebuilds the trust line and compares it with the one the modal showed (§S2). | Parent §4.4 "One snapshot". |
| E2-D6 | **`typedLine`'s refusal (PowerShell 5.1) comes before the trust question**, right after `prepare`: it is pure and needs only the plan and the prepared session. | "Refused BEFORE the person is asked to trust a line that then could not run" — the order the arrow already keeps (`runCommands.ts:91-96`). |
| E2-D7 | **`sshReaderShell()`** (new, `pinnedTerminal.ts`): the `HostShell` that reads a typed ssh line — `pinnedShell()` when `composedShellPath()` is set (a local window), else `{ shellPath: vscode.env.shell ?? '', family: 'posix' }` (a WSL window's default profile). It feeds only `typedLine`'s PowerShell 5.1 check; the quoting family comes from `ready.platform` (E1.S2 spec S2-D5). | `typedLine` takes a `HostShell` (`remoteLaunch.ts:277`), not the parent's `localFamily`. |
| E2-D8 | **The copies use one pure function**, `copiedLineOf(entry, lookup): CopiedLine` in `remoteLaunch.ts`: `{kind:'local'}` (no link, or no command: the caller's own words), `{kind:'linked', line, note}` (the trust line from storage's read of the SSH entry and its jump chain, and `COPY_NOTE`), or `{kind:'refused', reason}`. The viewer rows and Copy All read it through `entityCommandRows.ts` (new, pure). | Copy Command, the viewer row, the viewer copy and Copy All (`entityText.ts`, the third copy road E1 added) give one text. |
| E2-D9 | **The road host is wired without growing `extension.ts`.** `extension.ts` is at its size-ratchet baseline (1003 lines, `.size-baseline.json`; `test/sizeRatchet.test.ts:30-44`). `sshUseActions.ts` re-exports `sshRoadOf`, `extension.ts:31` imports it on the existing line, and `extension.ts:840` and `:928` pass `sshRoad: sshRoadOf(sshDeps)` on their existing lines (`sshDeps` is declared at `:623`, in the same `activate`). | The ratchet fails CI on one added line. If `sshDeps` is not in scope at `:840` or `:928`, stop and report. |
| E2-D10 | **No new two-argument prompt.** Every new message is a one-argument `showWarningMessage(text)` / `showInformationMessage(text)`; the modals are today's (`confirmTrusted`, the guard's busy question, the folder modal, the chain modal, SSH Connect's refusal). No function that holds a prompt site is renamed. | `test/promptSites.test.ts:129-133` holds the count at 172 and keys rows by `file#function#…`. If it goes red, stop and report to the judge; do not class a site yourself. |

**The exact sentences** (each lives once, as a constant or a function, and tests compare with it):

| Name | Where | Text |
|---|---|---|
| `COPY_NOTE` | `remoteLaunch.ts` | `This line uses your own ssh setup (agent, ~/.ssh/config); the vault's key and password are not in it — use Run to connect with them.` |
| Copy Command, linked | `commands/entityCommands.ts` | `Copied: <trust line> — <COPY_NOTE>` (information) |
| `linkedConfigRefusal(name)` | `vpnLauncherRun.ts` | `The launcher "<name>" runs over SSH, and its line uses {config}, a file on this machine. Remove {config} from the line, or set "Runs over SSH" to "Do not use".` |
| `refusedRowReason(sshName)` | `folderRun.ts` | `its SSH connection "<ssh>" cannot be opened from this window: run it with its own arrow to see why` |
| `CHANGED_ROW` | `folderRun.ts` | `its SSH connection changed while the dialog was open — run the folder again` |
| `sshStopped(folder)` | `folderRun.ts` | `Nothing was typed in "<folder>" and no entry's terminal was closed: a question for an SSH connection was cancelled.` |
| `passwordStepRefusal(step, ssh)` | `dependencyRun.ts` | `"<step>" runs over the SSH connection "<ssh>", which signs in with a password. A dependency step cannot, because the chain's one terminal has one environment. Use a key for "<ssh>", or run "<step>" with its own arrow.` |

Names in sentences shown in the folder report go through `shown` (`folderRun.ts:20`), as today.

**The ONE OWNER shape** (`sshRoad.ts`; the arrow and the launcher call it, nothing else cleans their session):

```ts
/**
 * ONE OWNER (parent §4.4). The road holds `ready` from `prepare` to the hand-over. `use` answers the terminal the line
 * was sent into, or `undefined` when nothing was sent. On `undefined` AND on a throw the session is cleaned here; after a
 * hand-over, that terminal's close cleans it (`cleanWhenClosed`).
 */
export async function ownedSession(ready: ReadySsh, use: () => Promise<vscode.Terminal | undefined>): Promise<boolean> {
  let handedTo: vscode.Terminal | undefined;
  try {
    handedTo = await use();
    return handedTo !== undefined;
  } finally {
    if (handedTo === undefined) {
      ready.cleanup();
    } else {
      cleanWhenClosed(handedTo, ready);
    }
  }
}

/** After a hand-over: `cleanup()` when THIS terminal closes (at once if it already has). Disposes its own listener. */
export function cleanWhenClosed(terminal: vscode.Terminal, ready: Pick<ReadySsh, 'cleanup'>): void {
  if (terminal.exitStatus !== undefined) {
    ready.cleanup();
    return;
  }
  const listener = vscode.window.onDidCloseTerminal((closed) => {
    if (closed === terminal) {
      listener.dispose();
      ready.cleanup();
    }
  });
}
```

`cleanup()` is idempotent (`sshSession.ts:538-547`). Calling it after a hand-over while the session lives is forbidden by
the S3 spec §S3.4; each story's review checks every call site.

**The ONE SNAPSHOT rule, as code review checks it:** in each road function from `road.prepare(…)` to the send, there is
no `storage.getNode`, no `sshLinkOf`, no `lookup(` of the SSH id, and `plan.ssh` is not read again (`typedLine` already
reads `prepared.entity` only, `remoteLaunch.ts:282`). Each story has a test that changes the stored SSH entry after
`prepare` and checks the sent line.

**Line ceilings.** ESLint: 800 lines per file, 50 code lines per function (120 in tests), complexity at most 4
(`eslint.config.mjs:30-32`). Files near a limit:

| File | Now | After E2 | Ceiling | How |
|---|---|---|---|---|
| `extension.ts` | 1003 | 1003 | ratchet 1003 | only in-place edits on `:31`, `:840`, `:928` (E2-D9) |
| `entityViewPage.ts` | 795 | ≤ 798 | 800 | import line 11 replaced in place; option `sshCopy` +2; one new row +1; nothing else |
| `commands/treeMutationCommands.ts`, `entityFormPage.ts`, `entityFormScript.ts` | 747, 786, 791 | unchanged | 800 | not touched |
| every other touched file | under 500 | under 600 | 800 | — |

---

## S1 — Arrow and VPN launcher (scenarios and brief)

### S1.1 What the road does (arrow)

`runEntryLine` (`commands/runCommands.ts:128-133`) becomes:

1. `arrowLine(entry)` as today (`:136-139`): no command and the `{name}` refusal are said in today's words, for a linked
   entry too.
2. `const link = sshLinkOf(entry.details, (id) => host.storage.getNode(entry.accountId, id))`.
3. `link.kind === 'none'` → today's road, unchanged: `passGates(host, entry, line, windowRefusal(entry))`, then
   `sendGuarded(entry.key, { kind: 'entry', terminalOs: entry.details.terminalOs }, () => line)`.
4. Else `const plan = planLaunch(entry.details, link, { stayOpen: true })`. `refused` → warn `plan.reason` (the link's
   sentence, the Windows-remote sentence D9, or the line-break sentence), nothing asked. No `windowRefusal` for a linked
   entry (D14: *Runs on* is the remote).
5. `remote` → `runLinkedLine(host, entry, plan)`:
   - `const prepared = await host.sshRoad.prepare(entry.accountId, plan.ssh)`; `stopped` → return (the seam already said
     what it had to); `refused` → `await host.sshRoad.sayRefused(prepared, plan.ssh)`, return.
   - `await ownedSession(prepared, () => trustedThenSent(host, entry, plan, prepared))`, where `trustedThenSent`:
     `typedLine(plan, ready, sshReaderShell())` (refused → warn, `undefined`) → `trustLineFor(ready.entity, ready.jump,
     plan.line)` → `passGates(host, entry, trustLine, undefined)` (the trust modal, then the dependencies) → `sendGuarded(
     entry.key, { kind: 'ssh', env: ready.env }, () => typed.line)` → `typed` answers `sent.terminal`, `refused` warns,
     `declined` answers `undefined`.

The VPN launcher (`vpnLauncherRun.ts`) follows the same steps; see the brief.

### S1.2 The brief — every file, the place, the change

**New: `sshRoad.ts`** (`vscode`; about 80 lines)

| What | Content |
|---|---|
| imports | `vscode`; `EntityMetadata`; `PreparedSsh`, `ReadySsh`, `RefusedSsh`, `prepareSshSession`, `windowOf` from `./sshSession`; `offerTheFix` from `./sshConnect`; `remoteWindowDeps`, `remedyRunner` from `./remoteConnectHost`; `type SshUseDeps` from `./sshUseActions` (type only, so no cycle at run time). |
| `export interface SshRoad` | `prepare(accountId: string, ssh: EntityMetadata): Promise<PreparedSsh>` and `sayRefused(refused: RefusedSsh, ssh: EntityMetadata): Promise<void>`, each with a doc comment (E2-D1). |
| `export type SshRoadDeps` | `Pick<SshUseDeps, 'storage' \| 'storageDir' \| 'relays' \| 'servesKeyForEntity'>`. |
| `export function sshRoadOf(deps: SshRoadDeps): SshRoad` | `optionsFor(ssh)` = `{ storage, storageDir, agentServesKey: deps.servesKeyForEntity?.(ssh) === true, remote: deps.relays === undefined ? undefined : remoteWindowDeps(deps.relays, remedyRunner(undefined)), isolate: true }`; `prepare` = `prepareSshSession(accountId, ssh, optionsFor(ssh))`; `sayRefused` = `offerTheFix(refused, ssh, windowOf(optionsFor(ssh)))`, its boolean dropped. No `startGate` (person's roads only, E2-D2). |
| `ownedSession`, `cleanWhenClosed` | Exactly the shape in E2.0. |

**`sshConnect.ts`** — after `refuseAndOfferTheFix` (`:146-171`) add (+8 lines):

```ts
/** A road's refusal (E2 of PLAN_terminal_command_over_ssh.md): the same modal and remedy, and NO retry — the person runs the entry again (parent §4.3). */
export function offerTheFix(refused: RefusedSsh, entity: EntityMetadata, remote: RemoteWindowDeps): Promise<boolean> {
  return refuseAndOfferTheFix(refused.reasons, entity, remote, undefined, undefined);
}
```

Nothing else in `sshConnect.ts` changes; `test/sshConnect.test.ts` and `test/sshConnectRemote.test.ts` stay unchanged and green.

**`sshUseActions.ts`** — one line near `sshDepsFor` (`:380`): `export { sshRoadOf } from './sshRoad';` with a one-line
comment: `extension.ts` is under the size ratchet, so it imports the road host from the module that already assembles
the SSH deps (E2-D9).

**`extension.ts`** — in place, no line added (E2-D9):
- `:31` → `import { sshDepsFor, sshExecAction, sshRoadOf, sshTerminalAction } from './sshUseActions';`
- `:840` → `registerRunCommands({ context, refSource, register, storage, storageDir, vaultKeys, sshRoad: sshRoadOf(sshDeps) });`
- `:928` → `registerEntityCommands({ doorsAt, mutated, register, storage, storageDir, vaultKeys, trust: context.globalState, sshRoad: sshRoadOf(sshDeps) });`

**`pinnedTerminal.ts`**

| Place | Change |
|---|---|
| after `composedShellPath` (`:54-56`) | `export function sshReaderShell(): HostShell` (E2-D7). |
| after `openEntryTerminal` (`:130-139`) | `export function findSshTerminal(key: EntryTerminalKey): vscode.Terminal \| undefined` = the first of `liveTerminalsOfEntry(key)` whose `shellPathOf(t) === composedShellPath()` (in a WSL window both are `undefined`, so the default-profile terminal matches). `export function openSshEntryTerminal(key: EntryTerminalKey, env: Record<string, string> \| undefined): vscode.Terminal` = `createTerminal({ name: entryTerminalTitle(key), shellPath: composedShellPath(), env })`, `show()`, return it. Doc comments name D10 and D14. |

**`terminalGuard.ts`**

| Place | Change |
|---|---|
| after the imports | `export type SendTarget = { readonly kind: 'entry'; readonly terminalOs: string \| undefined } \| { readonly kind: 'ssh'; readonly env?: Record<string, string> };` with a doc comment (E2-D3). |
| `sendGuarded` `:33-49` | Parameter `terminalOs` → `target: SendTarget`. Body: `ssh` with `env` → `return typeIntoNew(key, target, lineFor)` (never a find, never a dispose, D10). Otherwise a lookup by target: `entry` → `findEntryTerminal(key, target.terminalOs)` as today; `ssh` → `{ ok: true, terminal: findSshTerminal(key), family: sshReaderShell().family }`. The rest (verdict, `shownAndTyped`, `askThenType`) is unchanged. Keep it synchronous from the find to the send; split a helper `lookupFor(key, target)` to stay at complexity 4. |
| `typeIntoNew` `:55-58` | `terminalOs` → `target: SendTarget`. `entry` → today's `openEntryTerminal`; `ssh` → `typed(openSshEntryTerminal(key, target.env), lineFor(sshReaderShell().family))`. |
| doc comment `:8-14` | Name the `ssh` target and D10. |

**`commands/runCommands.ts`**

| Place | Change |
|---|---|
| `:16`, `:17`, `:25` | Add `sshReaderShell` to the `../pinnedTerminal` import; keep `sendGuarded`; `:25` → `import { RemotePlan, planLaunch, sshLinkOf, sshLinkRefusal, trustLineFor, typedLine } from '../remoteLaunch';` (`sshLinkRefusal` stays for `secretsRefusal`, E3). New import `import { SshRoad, ownedSession } from '../sshRoad';` and `import type * as vscode` is already there. |
| `RunCommandsHost` `:27-34` | Add `readonly sshRoad: SshRoad;` with a doc comment: the person's road host (E2-D1). |
| `arrowRefusal` `:114-117` | Delete. `windowRefusal` stays for the local road. |
| `runEntryLine` `:128-133` | §S1.1 steps 1-5. Split so each function has complexity ≤ 4: `runEntryLine` (line → link → local or linked), `runLocalLine(host, entry, line)`, `runLinkedEntry(host, entry, link, line)` (plan → refused or `runLinkedLine`), `runLinkedLine(host, entry, plan)` (prepare → refused/stopped → `ownedSession`), `trustedThenSent(host, entry, plan, ready)`. |
| `typeIntoEntryTerminal` `:148-153` | `sendGuarded(entry.key, { kind: 'entry', terminalOs: entry.details.terminalOs }, () => line)`. |
| `RemotePlan` | Export it from `remoteLaunch.ts` (`:263` is a private `type RemotePlan`): `export type RemotePlan = Extract<LaunchPlan, { kind: 'remote' }>;`. |

The file grows from 403 to about 450 lines.

**`vpnLauncherRun.ts`**

| Place | Change |
|---|---|
| imports `:1-17` | Add `sshLinkOf`, `planLaunch`, `trustLineFor`, `typedLine`, `RemotePlan`, `SshLink` from `./remoteLaunch` (keep `sshLinkRefusal`); `SshRoad`, `ownedSession` from `./sshRoad`; `sshReaderShell` with `shellContext` from `./pinnedTerminal`; `type * as vscode` exists. |
| `VpnRunContext` `:32-49` | Add `readonly sshRoad?: SshRoad;` — doc: set by the person's Start only; absent (an agent's `creds_vpn_up`) keeps E1's refusal of a linked launcher (E2-D2). |
| `runWithLauncher` `:56-66` | After the `stop` branch: `const link: SshLink = ctx.sshRoad === undefined ? { kind: 'none' } : sshLinkOf(launcher, (id) => ctx.storage.getNode(ctx.accountId, id));` then `link.kind === 'none' ? runLocalLauncher(ctx, launcher) : runLinkedLauncher(ctx, ctx.sshRoad, launcher, link)` (narrow `sshRoad` with a guard, not a cast). `runLocalLauncher` = today's `:61-65`, byte for byte. |
| `launcherLine` `:69-77`, `launcherRefusal` `:80-83` | `launcherLine(launcher, placeRefusal)`: keeps the ONE `executableLine(` read (`commandRoadScan.test.ts:109-116` pins `vpnLauncherRun.ts:launcherLine`); `why` = no command, else `nameRefusal(launcher)` (today's `commandRefusal` wording), else `placeRefusal(launcher)`. The local road passes `(l) => sshLinkRefusal(l) ?? refusedHere(l)` (so `launcherRefusal` keeps its name and its `sshLinkRefusal(` call: the agent path); the linked road passes `() => undefined`. |
| new `runLinkedLauncher(ctx, road, launcher, link)` | `launcherLine(launcher, () => undefined)` → `undefined` → `false`. `planLaunch(launcher, link, { stayOpen: true })`: `refused` → warn, `false`; `usesConfig(plan.line)` → warn `linkedConfigRefusal(launcher.name)`, `false` (before `prepare`, so no PIN and no config file). `prepare` → `stopped` → `false`; `refused` → `sayRefused`, `false`. Else `return ownedSession(ready, () => trustThenLaunch(ctx, launcher, plan, ready))`. |
| new `trustThenLaunch(ctx, launcher, plan, ready)` | `typedLine(plan, ready, sshReaderShell())` refused → warn, `undefined`; `confirmTrusted(ctx.trust, launcher.id, launcher.name, trustLineFor(ready.entity, ready.jump, plan.line))` false → `undefined`; `runDependenciesFirst(vpnDependencies(ctx, [ctx.details, launcher], new Set([launcher.id])))` not ready → `undefined`; `sendGuarded(launcherKey(ctx, launcher), { kind: 'ssh', env: ready.env }, () => typed.line)` (no `startGate`: the person's road); `refused` → warn; answers `sent.terminal` when `typed`. No `configFor`, no `afterTheChain` (agent-only). |
| `launch` `:119-132` | The local `sendGuarded` call takes `{ kind: 'entry', terminalOs: launcher.terminalOs }`. |
| file doc `:19-30` | One paragraph: a linked launcher on the person's Start (E2.S1): link → prepare → trust → chain → send, `{config}` refused; an agent's start keeps E1's refusal. |

**`vpnRun.ts`** — `runVpn` (`:78-97`) gains a last parameter `sshRoad?: SshRoad` and puts it into the context at `:96`
(`{ ...entry, storage, storageDir, trust, startGate, lateAnswer, standingPrompt, sshRoad }`). `agentVpnOpener` (`:38-42`)
does NOT pass it. Doc: one sentence naming E2-D2.

**`commands/entityCommands.ts`**

| Place | Change |
|---|---|
| `EntityCommandsHost` `:31-40` | Add `readonly sshRoad?: SshRoad;` (optional: test hosts need none; absent keeps E1's refusal of a linked launcher). |
| `:201` | `register('credSshManager.startVpn', (target) => runVpn(target, 'start', storage, storageDir, vaultKeys, trust, undefined, undefined, undefined, sshRoad));` with `sshRoad` taken from `host` where the function destructures it. `:202` (stop) unchanged. |
| `copyCommandLine` `:225-233` | Signature `copyCommandLine(node: TreeNode, lookup: NodeLookup)`. `const entry = node.details ?? { id: node.id, name: node.name }; const copy = copiedLineOf(entry, lookup);` `local` → `copyLocalLine(node.name, entry)` (unchanged); `refused` → warn `copy.reason`, nothing copied; `linked` → `await vscode.env.clipboard.writeText(copy.line)`, then info `` `Copied: ${copy.line} — ${copy.note}` ``. The `sshLinkRefusal` import goes. Keep complexity ≤ 4 (a `switch` in a helper). |
| `:262-268` | `await copyCommandLine(element.node, (id) => storage.getNode(element.accountId, id));`. |
| `showCommandText` `:249-256` | Unchanged (a display, E1 S1.3 item 28; see "What E2 does NOT do"). |

**`remoteLaunch.ts`** (pure; 316 → about 375 lines)

| Add | Content |
|---|---|
| import | `resolveJumpChain` with `sshOptionArgv` from `./sshOptions`; `commandRefusal` with `resolveCommand` from `./commandLine`. |
| `export type RemotePlan` | E2.0 / S1.2 above. |
| `export const COPY_NOTE` | The E2.0 text. |
| `export function shownTrustLine(plan: RemotePlan, lookup: NodeLookup): { kind: 'shown'; line: string } \| { kind: 'refused'; reason: string }` | `resolveJumpChain(plan.ssh, (id) => lookup(id)?.details)`: not ok → `refused` with its reason; ok → `trustLineFor(plan.ssh, chain.value, plan.line)`. Doc: the trust line a person is SHOWN before any preparation (Copy Command, the viewer, the folder modal), from storage's read of the SSH entry and its jump chain — the same read `connectionOptions.ts:28-30, 54` makes; a road that prepares rebuilds it from the snapshot (E2-D5). |
| `export type CopiedLine` and `export function copiedLineOf(entry: LaunchEntry, lookup: NodeLookup): CopiedLine` | `sshLinkOf` none → `local`. Else `planLaunch(entry, link, { stayOpen: false })`: `remote` → `shownTrustLine` → `linked { line, note: COPY_NOTE }` or `refused`; `refused` → `refused { reason }`, where a `{name}` refusal (the reason equals `commandRefusal(entry)`) reads `` `"${entry.name}" will not run: ${reason}` `` (the arrow's words, `runCommands.ts:87`) and every other reason is planLaunch's sentence as it is; `empty` (and `local`, unreachable once linked) → `local`. Complexity ≤ 4 per function. |

**New: `entityCommandRows.ts`** (pure, about 40 lines) — imports `CopiedLine`, `copiedLineOf` from `./remoteLaunch`,
`commandRefusal`, `describeCommand`, `shownCommandLine` from `./commandLine`, `EntityMetadata`.
- `export function commandRowsOf(d: EntityMetadata, copy: CopiedLine | undefined): { full?: string; refusal?: string; note?: string }`
  — `copy ?? copiedLineOf(d, () => undefined)` (absent means "no lookup was made": a linked entry then fails closed with
  the missing-entry sentence; production always passes it). `local` → `{ full: shownCommandLine(d), refusal:
  commandRefusal(d) }` (today's two rows); `linked` → `{ full: copy.line, note: copy.note }`; `refused` → `{ refusal:
  copy.reason }`.
- `export function commandBlockOf(d: EntityMetadata, copy: CopiedLine | undefined): string` — `local` →
  `describeCommand(d)`; `linked` → `` `${copy.line}\n${copy.note}` ``; `refused` → `copy.reason`.

**The viewer and Copy All**

| File:line | Change |
|---|---|
| `entityViewPage.ts:11` | `entityCommandRows.ts` re-exports the type (`export type { CopiedLine } from './remoteLaunch';`), and line 11 becomes `import { CopiedLine, commandRowsOf } from './entityCommandRows';` — one import line replaced, 0 lines added. |
| `entityViewPage.ts:100-101` | After `sshLinkName?: string;` add `/** What the command rows show for a Terminal entry, read by the caller with storage (E2.S1): the line, the trust line and its note, or why not. */` and `sshCopy?: CopiedLine;` (+2). |
| `entityViewPage.ts:514-515` | `row('Full command', 'fullCommand', d.isTerminal ? commandRowsOf(d, options.sshCopy).full : undefined),` / one new line `row('About this line', 'sshCopyNote', d.isTerminal ? commandRowsOf(d, options.sshCopy).note : undefined),` / `row('Will not run', 'commandRefusal', d.isTerminal ? commandRowsOf(d, options.sshCopy).refusal : undefined),` (+1). The file ends at ≤ 798. |
| `entityViewCopy.ts:8`, `:152-154` | Import `commandRowsOf` instead of `sshLinkRefusal`; `case 'fullCommand': value = commandRowsOf(d, options.sshCopy).full; break;`, `case 'commandRefusal': value = commandRowsOf(d, options.sshCopy).refusal; break;`, new `case 'sshCopyNote': value = commandRowsOf(d, options.sshCopy).note; break;`. |
| `entityText.ts:12`, `:18-24`, `:40` | `formatEntityBlock` gains a sixth optional parameter `sshCopy?: CopiedLine`; `:40` becomes `const described = commandBlockOf(details, sshCopy);`; the `sshLinkRefusal` import goes. |
| `entityViewerCommands.ts:156` and `:170-171` | In `viewOptions` add `sshCopy: copiedLineOf(details, (id) => storage.getNode(accountId, id)),` and pass `sshCopy` to `formatEntityBlock` as its sixth argument (compute it once in a `const` above the literal). |
| `entityViewerCommands.ts:355-371` (the revision page) | The same for the revision's `details`: `sshCopy` in its options and as the sixth argument at `:369`. Take `accountId` and `storage` from that function's own context; if they are not in scope there, stop and report. |

**Test helpers**

| File | Change |
|---|---|
| `test/vpnWorld.ts` `FakeTerminal` `:26-35`, `makeTerminal` `:126-130`, `createTerminal` `:199` | Record `env?: Record<string, string>` from the creation options (`o.env`), and accept it in the option type. |
| `test/vpnWorld.ts` `startVpn` `:399-406` | `StartOptions` gains `sshRoad?: unknown`, passed as `runVpn`'s 10th argument. |
| `test/arrowWorld.ts` | `RunWorldHost.sshRoad?: unknown` passed to `registerRunCommands`; default `NO_ROAD` whose `prepare` and `sayRefused` reject with `new Error('this world has no SSH road')` (a test that reaches it fails loudly). `ArrowOptions` gains `sshRoad?` and `others?: TreeNode[]` (seeded into `nodes` once); `ArrowWorld` exposes `nodes` (the record) and `reads(id)` (how many times `getNode` was called with that id). |
| new `test/sshRoadWorld.ts` (not `*.test.ts`) | `sshNode(id, extra?)`: a `TreeNode` of an SSH entry `{ id, name: 'prod box', isSshEnabled: true, host: 'prod.example', user: 'deploy', … }`; the file asserts ONCE at load that it passes `isLinkTarget(node, lookup)` (testing.md: build the fixture against the real validator). `fakeRoad(script, lookup?)`: an `SshRoad` that records `calls` (`{ ssh, n }`, n from 1), `refusedShown`, `cleaned` (`'<sshId>#<n>'` per `cleanup()` call, idempotent like the real one), and an `events` array shared with the test; `script(ssh, n)` answers `'stopped'`, `'refused'` or `{ password?: true }`. A ready is `{ kind: 'ready', snapshot: ssh, entity: { ...ssh, sshKeyPath: '/keys/<id>-<n>.key' }, options: { jump, knownHostsFile: '/keys/known_hosts-<id>-<n>' }, platform: process.platform, prefix: undefined, env: password ? { SSH_ASKPASS: '/keys/askpass.sh', SSH_ASKPASS_REQUIRE: 'force', CREDS_ASKPASS_PASSWORD: 'pw-<n>' } : undefined, acceptNew: false, jump, target: 'deploy@prod.example', materializedKeyPath: '/keys/<id>-<n>.key', cleanup }`, with `jump = lookup ? resolveJumpChain(ssh, (id) => lookup(id)?.details).value : undefined` computed AT CALL TIME (like `connectionOptions`). The file holds `const assignable: ReadySsh = readyOf(…)` so a drift of `ReadySsh` fails the compile. |

**The road scan — `test/launchRoadScan.test.ts`** (same commit; the stale-entry test forces it)

| List | Change |
|---|---|
| `ALLOWED_SENDS['commands/runCommands.ts']` `:136` | The arrow's local send line, replaced by its new exact text (`{ kind: 'entry', terminalOs: … }`); add the linked send `const sent = await sendGuarded(entry.key, { kind: 'ssh', env: ready.env }, () => typed.line);` (exact text as written), `because: 'Run in Terminal over SSH (E2.S1): the line typedLine built from the prepared snapshot'`. |
| `ALLOWED_SENDS['vpnLauncherRun.ts']` `:147-152` | The local line's new text; add the linked launcher's `sendGuarded` line, `because: 'a VPN launcher over SSH on the person\'s Start (E2.S1)'`. |
| `ALLOWED_SENDS['commands/folderRunCommand.ts']` `:144` | The `typeIntoNew` line's new text (`{ kind: 'entry', terminalOs: row.details.terminalOs }`); S2 changes it again. |
| `ALLOWED_SENDS['terminalGuard.ts']` `:154-159` | The new `typeIntoNew` declaration line and the `return typeIntoNew(key, target, lineFor);` line(s) as written. |
| `REFUSAL_SITES` `:172-186` | Remove `commands/runCommands.ts:arrowRefusal`, `commands/entityCommands.ts:copyCommandLine`, `entityText.ts:formatEntityBlock`, both `entityViewCopy.ts:copyValueFor`, both `entityViewPage.ts:renderEntityViewHtml`. `vpnLauncherRun.ts:launcherRefusal` STAYS (the agent path, E2-D2). |
| scan 1, scan 2 | Unchanged in S1. |

**The help ×5** (`help<Lang>.ts:84`, article `basics`; double-quoted strings: the texts below hold no `"`; keep `\n`
paragraph breaks as they are; UI labels in English in every language, `CLAUDE.md` rule 7)

*Paragraph 8, the `terminal` bullet.* Replace E1's text from `*Runs over SSH* can name…` to the end of the bullet:

- EN: `*Runs over SSH* can name one of your **ssh** entries; it starts on *— Do not use —*. With one chosen, *Run in Terminal* and a VPN's *Started by* run the line on that host, and *Runs on* then names the host's system. *Run All in Folder*, a dependency chain, *Run with Secrets* and an agent's run still refuse such an entry and say why. A share and an export leave the choice out.`
- DE: `*Runs over SSH* kann einen Ihrer **ssh**-Einträge nennen; voreingestellt ist *— Do not use —*. Ist einer gewählt, führen *Run in Terminal* und *Started by* eines VPN die Zeile auf diesem Host aus, und *Runs on* nennt dann das System des Hosts. *Run All in Folder*, eine Abhängigkeitskette, *Run with Secrets* und der Lauf eines Agenten lehnen einen solchen Eintrag weiterhin ab und sagen warum. Eine Freigabe und ein Export lassen die Wahl weg.`
- ES: `*Runs over SSH* puede nombrar una de sus entradas **ssh**; empieza en *— Do not use —*. Con una elegida, *Run in Terminal* y el *Started by* de una VPN ejecutan la línea en ese host, y *Runs on* indica entonces el sistema del host. *Run All in Folder*, una cadena de dependencias, *Run with Secrets* y la ejecución de un agente siguen rechazando esa entrada y dicen por qué. Al compartir y al exportar, la elección no se incluye.`
- RU: `*Runs over SSH* может указать одну из ваших записей **ssh**; по умолчанию стоит *— Do not use —*. Если запись выбрана, *Run in Terminal* и *Started by* у VPN выполняют строку на этом хосте, а *Runs on* тогда указывает систему хоста. *Run All in Folder*, цепочка зависимостей, *Run with Secrets* и запуск агентом пока отказывают такой записи и объясняют почему. Отправка записи другому человеку и экспорт этот выбор не переносят.`
- UK: `*Runs over SSH* може вказати один із ваших записів **ssh**; за замовчуванням стоїть *— Do not use —*. Якщо запис вибрано, *Run in Terminal* і *Started by* у VPN виконують рядок на цьому хості, а *Runs on* тоді вказує систему хоста. *Run All in Folder*, ланцюжок залежностей, *Run with Secrets* і запуск агентом поки відмовляють такому запису й пояснюють чому. Надсилання запису іншій людині та експорт цей вибір не переносять.`

*Paragraph 25, the hand-written `ssh -t <host>` advice* (EN `From a local window on Windows, put…`). Replace the
whole paragraph:

- EN: ``To run a line on a server, choose its **ssh** entry under *Runs over SSH* instead of writing `ssh` into the line. The arrow then connects with that entry — its key or password, its pinned host key, its jump host — and the line runs in your login shell there, which stays open after the line ends; a line that fails says its exit code first. Write the line for the server, such as `tmux new -A -s {name}` with *Runs on* set to Linux or macOS; a Windows server is refused. The login shell must be sh, bash, zsh, ksh or dash; fish and csh are not supported. The approval names the host, so a changed host, user, port, jump host, agent forwarding or port forward asks again. If the SSH entry signs in with a password, every run opens a new terminal beside any open one. Windows PowerShell 5.1 cannot pass a double quote or a final backslash to ssh, so such a line is refused there; install PowerShell 7 (`pwsh`). After a run, the arrow asks before it types into that terminal again, because the login shell is still open. A VPN's *Started by* runs over SSH the same way, but a launcher line with `{config}` is refused, because the config is a file on this machine, and an agent's VPN start with such a launcher is refused. *Copy Command* copies `ssh … -- user@host '<line>'`: it uses your own ssh setup (agent, `~/.ssh/config`), and the vault's key and password are not in it.``
- DE: ``Um eine Zeile auf einem Server auszuführen, wählen Sie dessen **ssh**-Eintrag unter *Runs over SSH*, statt `ssh` in die Zeile zu schreiben. Der Pfeil verbindet sich dann mit diesem Eintrag — seinem Schlüssel oder Passwort, seinem gepinnten Host-Schlüssel, seinem Jump-Host — und die Zeile läuft dort in Ihrer Login-Shell, die nach dem Ende der Zeile offen bleibt; eine Zeile, die scheitert, nennt zuerst ihren Exit-Code. Schreiben Sie die Zeile für den Server, etwa `tmux new -A -s {name}` mit *Runs on* auf Linux oder macOS; ein Windows-Server wird abgelehnt. Die Login-Shell muss sh, bash, zsh, ksh oder dash sein; fish und csh werden nicht unterstützt. Die Freigabe nennt den Host, darum fragt ein geänderter Host, Benutzer, Port, Jump-Host, ein geändertes Agent-Forwarding oder Port-Forwarding erneut. Meldet sich der SSH-Eintrag mit einem Passwort an, öffnet jeder Lauf ein neues Terminal neben einem offenen. Windows PowerShell 5.1 kann ein doppeltes Anführungszeichen oder einen Backslash am Ende nicht an ssh übergeben, darum wird eine solche Zeile dort abgelehnt; installieren Sie PowerShell 7 (`pwsh`). Nach einem Lauf fragt der Pfeil, bevor er wieder in dieses Terminal tippt, denn die Login-Shell ist noch offen. *Started by* eines VPN läuft genauso über SSH, aber eine Starter-Zeile mit `{config}` wird abgelehnt, denn die Konfiguration ist eine Datei auf diesem Rechner, und der VPN-Start eines Agenten mit einem solchen Starter wird abgelehnt. *Copy Command* kopiert `ssh … -- user@host '<line>'`: Das nutzt Ihre eigene ssh-Einrichtung (Agent, `~/.ssh/config`), und Schlüssel und Passwort des Tresors sind nicht darin.``
- ES: ``Para ejecutar una línea en un servidor, elija su entrada **ssh** en *Runs over SSH* en lugar de escribir `ssh` en la línea. La flecha se conecta entonces con esa entrada — su clave o contraseña, su clave de host fijada, su host de salto — y la línea se ejecuta allí en su shell de inicio de sesión, que sigue abierta cuando la línea termina; una línea que falla dice primero su código de salida. Escriba la línea para el servidor, por ejemplo `tmux new -A -s {name}` con *Runs on* en Linux o macOS; un servidor Windows se rechaza. La shell de inicio de sesión debe ser sh, bash, zsh, ksh o dash; fish y csh no son compatibles. La aprobación nombra el host, así que un host, usuario, puerto, host de salto, reenvío del agente o reenvío de puertos cambiado vuelve a preguntar. Si la entrada SSH inicia sesión con una contraseña, cada ejecución abre un terminal nuevo junto a cualquiera abierto. Windows PowerShell 5.1 no puede pasar a ssh una comilla doble ni una barra invertida final, así que allí esa línea se rechaza; instale PowerShell 7 (`pwsh`). Después de una ejecución, la flecha pregunta antes de volver a escribir en ese terminal, porque la shell de inicio de sesión sigue abierta. El *Started by* de una VPN se ejecuta por SSH de la misma forma, pero una línea de lanzador con `{config}` se rechaza, porque la configuración es un archivo de esta máquina, y el inicio de VPN de un agente con ese lanzador se rechaza. *Copy Command* copia `ssh … -- user@host '<line>'`: usa su propia configuración de ssh (agente, `~/.ssh/config`), y la clave y la contraseña de la caja fuerte no están en ella.``
- RU: ``Чтобы выполнить строку на сервере, выберите его запись **ssh** в *Runs over SSH*, а не пишите `ssh` в самой строке. Тогда стрелка подключается с этой записью — её ключом или паролем, её закреплённым ключом хоста, её jump-хостом, — и строка выполняется там в вашей оболочке входа, которая остаётся открытой после конца строки; строка, завершившаяся ошибкой, сначала сообщает свой код выхода. Пишите строку для сервера, например `tmux new -A -s {name}`, а в *Runs on* — Linux или macOS; сервер Windows отклоняется. Оболочка входа должна быть sh, bash, zsh, ksh или dash; fish и csh не поддерживаются. Подтверждение называет хост, поэтому изменённый хост, пользователь, порт, jump-хост, проброс агента или проброс порта спрашивает снова. Если запись SSH входит по паролю, каждый запуск открывает новый терминал рядом с уже открытым. Windows PowerShell 5.1 не может передать ssh двойную кавычку или обратную косую черту в конце, поэтому там такая строка отклоняется; установите PowerShell 7 (`pwsh`). После запуска стрелка спрашивает, прежде чем снова печатать в этот терминал, потому что оболочка входа ещё открыта. *Started by* у VPN работает через SSH так же, но строка запуска с `{config}` отклоняется, потому что конфиг — файл на этой машине, а запуск такого VPN агентом отклоняется. *Copy Command* копирует `ssh … -- user@host '<line>'`: эта строка использует вашу собственную настройку ssh (агент, `~/.ssh/config`), а ключа и пароля из хранилища в ней нет.``
- UK: ``Щоб виконати рядок на сервері, оберіть його запис **ssh** у *Runs over SSH*, а не пишіть `ssh` у самому рядку. Тоді стрілка під'єднується з цим записом — його ключем або паролем, його закріпленим ключем хоста, його jump-хостом, — і рядок виконується там у вашій оболонці входу, яка лишається відкритою після кінця рядка; рядок, що завершився помилкою, спершу повідомляє свій код виходу. Пишіть рядок для сервера, наприклад `tmux new -A -s {name}`, а в *Runs on* — Linux або macOS; сервер Windows відхиляється. Оболонка входу має бути sh, bash, zsh, ksh або dash; fish і csh не підтримуються. Підтвердження називає хост, тож змінений хост, користувач, порт, jump-хост, переспрямування агента або переспрямування порту питає знову. Якщо запис SSH входить за паролем, кожен запуск відкриває новий термінал поруч із уже відкритим. Windows PowerShell 5.1 не може передати ssh подвійні лапки або зворотну скісну риску в кінці, тож там такий рядок відхиляється; встановіть PowerShell 7 (`pwsh`). Після запуску стрілка питає, перш ніж знову друкувати в цей термінал, бо оболонка входу ще відкрита. *Started by* у VPN працює через SSH так само, але рядок запуску з `{config}` відхиляється, бо конфігурація — файл на цій машині, а запуск такого VPN агентом відхиляється. *Copy Command* копіює `ssh … -- user@host '<line>'`: цей рядок використовує ваше власне налаштування ssh (агент, `~/.ssh/config`), а ключа й пароля зі сховища в ньому немає.``

No "Checked with …" sentence: the new road is not hand-checked yet (§10 hand checks 1, 2, 4 are owed to the owner).

**README** (`src_vs_code/README.md`)
- `:256-260` (the *Runs over SSH* bullet) → ``- **Runs over SSH** can name one of your SSH entries; it starts on *— Do not use —*. With one chosen, *Run in Terminal* and a VPN's *Started by* connect with that entry — its key or password, its pinned host key, its jump host — and run the line there; *Runs on* then names the server's system. *Run All in Folder*, a dependency chain, *Run with Secrets* and an agent's run still refuse such an entry and say why. Nothing runs on this machine instead. The choice is kept through sync and backup and left out of a share and an export.`` (wrapped at about 100 columns like its neighbours).
- `:292-297` (the hand-written `ssh -t <host>` paragraph) → the EN paragraph 25 text above, wrapped.

**research/**
- `research/module_extension.md:2246` → `The arrow, a VPN's launcher and the copies call it since E2.S1; the folder run (E2.S2), the chain (E2.S3), Run with Secrets and the agent (E3) follow.`
- `research/module_extension.md:2378-2386` ("The refusal on every road"): the caller list becomes Run with Secrets, the agent's run, a VPN launcher on an AGENT's start and a chain step with no road (the agent's start), the folder run until E2.S2; add one sentence: the copies now show the trust line (`copiedLineOf`).
- New paragraph after `:2386`, **The arrow, the launcher and the copies over SSH (E2.S1)**: the order (link → prepare → `typedLine` refusal → trust on the trust line → dependencies → `sendGuarded` with the `ssh` target); `sshRoad.ts` (`SshRoad`, `sshRoadOf` with `isolate: true`, no retry on a refusal); ONE OWNER (`ownedSession`, `cleanWhenClosed`); ONE SNAPSHOT; D10 for a password; `sshReaderShell`; the launcher's `{config}` refusal and the agent path kept refused (E2-D2); the copies (`copiedLineOf`, `COPY_NOTE`, `entityCommandRows.ts`).
- `research/module_tests.md`: a new section `## Terminal roads over SSH (E2 of PLAN_terminal_command_over_ssh.md)` after the E1 section (`:1294-1310`), with the run command and one row per new test file (`sshRoad.test.ts`, `sshRoadArrow.test.ts`, `sshRoadCopies.test.ts`, `sshRoadHelp.test.ts`) and a **Teeth** line; the row at `:1304` ("The refusal on every road") says which roads still refuse.

### S1.3 Scan and existing tests whose expected values change

- `test/launchRoadScan.test.ts`: the edits in the brief.
- `test/sshLinkRoads.test.ts` W1 (`:31`) and W1b (`:40`): the arrow now has a road, and `s1` is not in that world, so the
  warning is `sshLinkOf`'s missing-entry sentence, read from `sshLinkOf(LINKED, () => undefined)` (never retyped), and
  still nothing is asked and nothing typed. Rename both to `…_refuses_a_linked_entry_whose_ssh_entry_is_missing_…`.
- `test/sshLinkRoads.test.ts` W9 (`:205`): Copy Command of `LINKED` (no `s1`) warns the same missing-entry sentence and
  copies nothing.
- `test/sshLinkCopies.test.ts` `:96`, `:103`, `:114`: the viewer and Copy All of a linked entry without `sshCopy` fail
  closed with the missing-entry sentence (not E1's sentence); with `sshCopy` see V1-V4 below.
- Unchanged and still green (the no-road guards): W2 (secrets), W5, W5b, W6 (chain without a road), W7 (launcher without
  a road), W8 (agent). Say so in the report.
- Any OTHER existing test that goes red: stop and report; do not edit an expected value.

### S1.4 Scenarios — RED first

Write each test, run it, watch it fail for the reason in "RED today", then build. For a new export, first add a stub
(`return { kind: 'local' }`, `return undefined`, `return Promise.resolve(false)`) so the test fails on its assertion.
`LINKED` = `{ id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo linked', sshEntityId: 's1' }`;
`S1` = `sshNode('s1')`; `lookup` = the world's `getNode`. `PLAN(e)` = `planLaunch(e, sshLinkOf(e, lookup), { stayOpen: true })`;
`TRUST(r, e)` = `trustLineFor(r.entity, r.jump, PLAN(e).line)`; `TYPED(r, e)` = `typedLine(PLAN(e), r, { shellPath: '/bin/bash', family: 'posix' }).line`
(the shell feeds only the PowerShell 5.1 check, which the wrapper never meets: no `"`), where `r` is the fake ready of
that call. Never a hand-typed ssh line.

**`test/sshRoad.test.ts`** (new; `loadWithVscode('../sshRoad', stub, { './sshSession': …, './sshConnect': …, './remoteConnectHost': … })`)

| # | Test | Assertion | RED today |
|---|---|---|---|
| H1 | `the_road_prepares_isolated_with_this_windows_route_and_the_agents_answer` | the mocked `prepareSshSession` got `(accountId, ssh, options)` with `options.isolate === true`, `agentServesKey === true` when `servesKeyForEntity` answers true for THAT ssh, `storage`/`storageDir` from the deps, and `remote` = the mocked `remoteWindowDeps` result when `relays` is set (undefined when not) | no module |
| H2 | `a_refusal_shows_the_remedy_once_and_never_retries` | `sayRefused(refused, ssh)` calls the mocked `offerTheFix` once with `(refused, ssh, <window>)`; and, through `test/sshConnectWorld.ts` (the pattern of `sshConnectRemote.test.ts:73`), the real `offerTheFix` whose remedy answers `true` prepares nothing again (`prepareSshSession` call count stays 0) | no export |
| H3 | `owned_session_cleans_on_undefined_and_on_a_throw_and_hands_over_otherwise` | pure on fakes: `use` → `undefined` → `cleanup` 1; `use` throws → rejects and `cleanup` 1; `use` → terminal → `cleanup` 0, then the stub fires close for ANOTHER terminal → 0, for THAT terminal → 1, fired again → still 1 and the listener count is back to before | no module |
| H4 | `a_terminal_already_closed_at_the_hand_over_is_cleaned_at_once` | `cleanWhenClosed({ exitStatus: { code: 0 } }, r)` → `cleanup` 1, no listener added | no module |

**`test/sshRoadArrow.test.ts`** (new; `arrowWorld({ others: [S1], sshRoad: road })`)

| # | Test | Assertion | RED today |
|---|---|---|---|
| A1 | `the_arrow_types_the_composed_line_into_the_entry_terminal` | modal answered Run; `road.calls` = `[{ ssh: S1.details, n: 1 }]`; the terminal titled `entryTerminalTitle(key)` has `sent` `[TYPED(r1, LINKED)]`; the line holds `-- deploy@prod.example` and `eval '`; its `shellPath` equals the world's pinned shell path | E1 sentence, nothing typed |
| A2 | `the_trust_question_shows_the_trust_line_and_records_it` | the one modal text includes `TRUST(r1, LINKED)`; afterwards `isCommandTrusted(aw.trust, 'e1', TRUST(r1, LINKED))` true and `isCommandTrusted(aw.trust, 'e1', 'echo linked')` false | E1 sentence |
| A3 | `a_trusted_local_line_does_not_cover_the_ssh_run` | world trusted `[['e1', 'echo linked']]`, modal `'dismiss'`: one trust modal was shown, nothing typed | E1 sentence, no modal |
| A4 | `the_order_is_prepare_then_typed_refusal_then_trust_then_dependencies_then_send` | `LINKED` + `dependsOn: ['dep']`, `runDependencies: true`, `dep` a local trusted step in `others`: `road.events` (prepare) then the trust modal, then the chain step executed, then the entry's send — one ordered array | E1 sentence |
| A5 | `a_missing_ssh_entry_says_why_and_prepares_nothing` | no `S1` in storage: `aw.warnings` deep-equals `[sshLinkOf(LINKED, () => undefined).reason]`; `road.calls` `[]`; `aw.terminals` `[]` | E1's sentence differs |
| A6 | `a_linked_entry_written_for_windows_is_refused_before_prepare` | `terminalOs: 'windows'`: warning = `planLaunch(…).reason`; `road.calls` `[]` | E1 sentence |
| A7 | `a_linux_runs_on_with_a_link_is_not_an_os_refusal_on_this_machine` | on a win32 host the local road would refuse `terminalOs: 'linux'` in a local window; here (any host) `terminalOs` set to the OS the local road REFUSES on this host (`hostOs === 'linux' ? 'macos' : 'linux'`): prepared and typed | E1 sentence |
| A8 | `a_stopped_preparation_types_nothing_and_asks_nothing` | script `'stopped'`: no modal, no terminal, `refusedShown` 0 | E1 sentence |
| A9 | `a_refused_preparation_shows_the_remedy_and_types_nothing` | script `'refused'`: `refusedShown` 1, no trust modal, no terminal | E1 sentence |
| O1 | `owner_a_declined_trust_cleans_the_session` | modal `'dismiss'`: `cleaned` `['s1#1']`; no terminal of the entry | `calls` is 0 (E1) |
| O2 | `owner_a_cancelled_dependency_cleans_the_session` | A4's world; the chain modal (`/^Before /`) held and answered `undefined`: `cleaned` `['s1#1']`; the entry's terminal has nothing sent | E1 sentence |
| O3 | `owner_a_thrown_send_cleans_the_session` | `failSend` on the entry title: `await assert.rejects(aw.run(LINKED))`; `cleaned` `['s1#1']` | E1 sentence, no throw |
| O4 | `owner_a_failed_terminal_creation_cleans_the_session` | `failCreate` on the entry title: rejects; `cleaned` `['s1#1']` | E1 sentence |
| O5 | `owner_a_declined_busy_question_cleans_only_the_second_session` | run twice (key entry); the second run meets the busy question (`/Type It Anyway|still running|cannot tell/` — read the text from `busyQuestion` in `terminalActivity.ts`) and dismisses it: `cleaned` `['s1#2']`, one `sent` line in the terminal | E1 sentence |
| O6 | `owner_the_terminal_owns_the_session_after_the_send` | after A1: `cleaned` `[]`; `w.exit(w.live[title])` → `cleaned` `['s1#1']` | E1 sentence |
| N1 | `snapshot_a_host_changed_during_the_trust_question_does_not_reach_the_line` | trust modal held; while held, `aw.nodes['s1']` is REPLACED by a new node object with host `evil.example` (a sync writes a new record); answered Run: the sent line holds `prod.example` and not `evil`; `aw.reads('s1')` after `prepare` returned is 0 | E1 sentence |
| P1 | `a_password_entry_opens_a_new_terminal_with_its_env_beside_a_live_one_and_disposes_nothing` | script `{ password: true }`, run twice: two LIVE terminals with the entry title; each `env` deep-equals its ready's `env`; `disposed` 0 on both; no busy question was asked | E1 sentence; `FakeTerminal` has no `env` |
| P2 | `a_key_entry_reuses_a_finished_terminal_of_the_composed_shell` | run once; `w.shell.start` then `w.shell.end(…, 0)` on that terminal; run again: still ONE terminal with two `sent` lines | E1 sentence |
| L1 | `the_persons_start_runs_a_linked_launcher_over_ssh` | `startVpn(scope, w, nodes, { sshRoad: road })` with `ownerChain()`'s `start` linked to `s1` and its command `openvpn --config /etc/vpn.conf` (no `{config}`), `install` trusted: `started === true`; the launcher terminal's `sent` `[TYPED(r1, start)]`; no config file in `dir`; `w.exit(launcherTerminal)` → `cleaned` `['s1#1']` | E1 sentence, `started` false |
| L2 | `a_linked_launcher_with_config_is_refused_before_prepare` | `ownerChain()` with `start.sshEntityId = 's1'` (its line holds `{config}`): warning = `linkedConfigRefusal('start openvpn')`; `road.calls` `[]`; no config written; no trust modal | E1 sentence |
| L3 | `the_launcher_asks_trust_on_the_trust_line_after_prepare_and_cleans_on_decline` | modal `'dismiss'`: `road.calls` 1, the modal text includes `TRUST(r1, start)`, `cleaned` `['s1#1']`, `started` false | E1 sentence |
| L4 | `an_agents_start_of_a_linked_launcher_stays_refused` | `startGate` set, no `sshRoad`: warning includes `sshLinkRefusal(start)`; `started` false — a guard of E2-D2, GREEN before and after; say so | (green) |

**`test/sshRoadCopies.test.ts`** (new)

| # | Test | Assertion | RED today |
|---|---|---|---|
| U1 | `copied_line_of_an_unlinked_entry_is_local` | `copiedLineOf({ …, command: 'ls' }, lookup)` deep-equals `{ kind: 'local' }`; same for `sshEntityId: ''` | stub |
| U2 | `copied_line_of_a_linked_entry_is_the_trust_line_with_the_jump_and_the_note` | `S1` with `jumpHostEntityId: 'j1'` (a second `sshNode('j1')` with host `bastion.example`): `kind 'linked'`, `line === trustLineFor(S1.details, resolveJumpChain(S1.details, byId).value, 'echo linked')`, it holds `-J` and no `-i`, no `known_hosts`, no `keys/`; `note === COPY_NOTE` | stub |
| U3 | `copied_line_of_a_broken_link_or_a_bad_plan_is_refused` | missing `s1` → the missing sentence; `terminalOs: 'windows'` → the D9 sentence; a line with `\n` → the line-break sentence; a jump chain that loops → `resolveJumpChain`'s reason | stub |
| U4 | `copied_line_of_a_linked_entry_with_a_refused_name_says_will_not_run` | command `x {name}`, name `a b`: `refused` with `` `"a b" will not run: ${commandRefusal(entry)}` `` | stub |
| C1 | `copy_command_copies_the_trust_line_and_says_the_note` | the `handlers()` world of `test/commandLineHandlers.test.ts:20-46` (copied, with a storage that holds `S1`): `h.copied` `[line]` where `line` is U2's; `h.infos` `` [`Copied: ${line} — ${COPY_NOTE}`] `` | E1: nothing copied |
| C2 | `copy_command_of_a_broken_link_copies_nothing_and_says_why` | no `S1`: `h.copied` `[]`, `h.warnings` `[missing sentence]` | E1's sentence differs |
| V1 | `the_viewer_shows_the_trust_line_and_the_note_not_a_refusal` | `renderEntityViewHtml(options({ details: LINKED, sshLinkName: 'prod box', sshCopy: copiedLineOf(LINKED, lookup) }))` (builder of `test/entityViewPage.test.ts:32-56`): holds `escapeHtml(line)` in the *Full command* row, an *About this line* row with `escapeHtml(COPY_NOTE)`, and no `Will not run` | row hidden |
| V2 | `the_viewer_copies_the_trust_line_and_the_note` | `copyValueFor(o, 'fullCommand') === line`; `'sshCopyNote' === COPY_NOTE`; `'commandRefusal'` `undefined` | `undefined` |
| V3 | `the_viewer_and_copy_all_are_wired_with_storage` | file-text pins on `entityViewerCommands.ts`: `sshCopy: copiedLineOf(` appears twice (entry and revision) and both `formatEntityBlock(` calls end with `, sshCopy)` (exact text as written) | absent |
| V4 | `copy_all_of_a_linked_entry_holds_the_trust_line_and_the_note_not_the_local_line` | `formatEntityBlock(LINKED, undefined, undefined, undefined, undefined, copiedLineOf(LINKED, lookup))` includes `line` and `COPY_NOTE` and not `\necho linked` | E1 sentence |
| V5 | `an_unlinked_viewer_and_block_are_unchanged` | for `{ command: 'ls' }` with and without `sshCopy: { kind: 'local' }`: the HTML and the block equal what they are without the option (one positive per file, testing.md) | (green; guard) |

**`test/sshRoadHelp.test.ts`** (new; shape of `test/folderRunHelp.test.ts:14-24`)

| # | Test | Assertion | RED today |
|---|---|---|---|
| Hp1 | `the_hand_written_ssh_advice_is_gone_in_every_language` | no `basics` body (`bodyFor`, `fallback === false`) of `HELP_LANGUAGES` includes `ssh -t <host>` | present in all five |
| Hp2 | `every_language_explains_the_arrow_over_ssh_with_english_labels` | each body includes `*Runs over SSH*`, `*Started by*`, `~/.ssh/config`, `PowerShell 7` and `ssh … -- user@host` | `~/.ssh/config` absent |
| Hp3 | `the_english_text_is_exact` | the EN body includes the EN paragraph 25 text of the brief, literally | absent |

`test/sshLinkHelp.test.ts` H1 stays green (the labels are still there).

### S1.5 Commands

From the repository root (`CLAUDE.md` §Commands; `common/local-cpu-budget.md`):

```bash
LP=$PWD/.claude/rules/shared/tools/low-priority.mjs
cd src_vs_code
node $LP npm run typecheck
node $LP npm run lint
node $LP npm run compile
node $LP node --test out/test/sshRoad.test.js out/test/sshRoadArrow.test.js out/test/sshRoadCopies.test.js out/test/sshRoadHelp.test.js
node $LP node --test out/test/launchRoadScan.test.js out/test/commandRoadScan.test.js out/test/sshLinkRoads.test.js out/test/sshLinkCopies.test.js out/test/sshLinkHelp.test.js out/test/remoteLaunch.test.js out/test/sshSession.test.js
node $LP node --test out/test/sshConnect.test.js out/test/sshConnectRemote.test.js out/test/launcherBusyTerminal.test.js out/test/commandLineHandlers.test.js out/test/entityViewPage.test.js out/test/entityText.test.js out/test/sshRowsByKind.test.js out/test/vpnLauncher.test.js out/test/dependencyChain.test.js out/test/vpnGoneRequest.test.js out/test/commandNameRoads.test.js out/test/promptSites.test.js out/test/sizeRatchet.test.js out/test/folderRunCommand.test.js
node $LP node scripts/size-ratchet.mjs
```

The lead runs the full `npm test`.

---

## S2 — Folder run (scenarios and brief)

### S2.1 What the road does

1. **Plan (pure, before the modal).** Each Terminal row is planned with `planLaunch(details, sshLinkOf(details,
   facts.lookup), { stayOpen: true })`. A linked row whose plan is `remote` gets `line` = its SHOWN trust line
   (`shownTrustLine(plan, facts.lookup)`) and `remote` = the plan; it is not asked `facts.shellRefusal` (D14). The
   `{config}` and control-name refusals (`lineRefusal`) apply to every row as today. The modal therefore lists
   `name: ssh … -- user@host '<line>'`, `(new)` is `isCommandTrusted(row.id, trustLine)`, and `trustAll` records the
   trust line — the same key the arrow uses, so one approval covers both roads.
2. **After the modal, trust and the chain** (`runChosen`, `commands/folderRunCommand.ts:154-167`): for each row of
   `linesToType(plan, closing)` with `remote`, IN ROW ORDER, one after another: re-read the link
   (`sshLinkOf(row.details, lookupNow)`) — refused → the row fails with the link's sentence; else `road.prepare(…)`:
   - `stopped` → the RUN is stopped: no further prepare, every prepared row cleaned, `sshStopped(folder)` said, nothing
     typed (linked or not), no terminal closed.
   - `refused` → the row fails with `refusedRowReason(sshName)`; no modal per row.
   - `ready` → `trustLineFor(ready.entity, ready.jump, row.remote.line) !== row.line` → cleaned now, the row fails with
     `CHANGED_ROW`; else `typedLine(row.remote, ready, sshReaderShell())` refused → cleaned, the row fails with its
     reason; else the row is prepared `{ ready, typed }`.
3. **The run-level stop is read once more, then `typeAll` runs synchronously** (nothing awaited from here to the last
   send, as today). A linked row that settles to `type` and is prepared is typed with `typeIntoNew(key, { kind: 'ssh',
   env: ready.env }, () => typed)` and handed over (`cleanWhenClosed`); a linked row that failed in step 2 is
   `failed`; a linked row with no state (never prepared) is `failed` with `CHANGED_ROW` — fail closed, never typed.
4. **The run's `finally`** (around steps 2 and 3) cleans every prepared row not handed over (rows settled `open`, rows
   whose send threw) and drops the list (S3 spec §S3.12: `ready.env` holds the password).

### S2.2 The brief

**`folderRun.ts`** (pure)

| Place | Change |
|---|---|
| imports `:1-7` | Drop `resolveCommand` and `sshLinkRefusal`; import `NodeLookup`, `RemotePlan`, `planLaunch`, `shownTrustLine`, `sshLinkOf` from `./remoteLaunch`. |
| `LineRow` `:38-44` | Add `readonly remote?: RemotePlan;` — doc: set for a linked row; then `line` is the SHOWN trust line (what the modal shows and `trustAll` records), and `remote.line` is the person's line. |
| `FolderFacts` `:65-70` | Add `readonly lookup: NodeLookup;` — doc: the vault as the folder's plan reads it, for the link and the shown trust line. |
| `lineOrReason` `:104-114` | `const plan = planLaunch(details, sshLinkOf(details, facts.lookup), { stayOpen: true })`: `empty` → `NO_COMMAND`; `refused` → `plan.reason` (the `{name}` fragment as today, or the link's / D9 / line-break sentence); `local` → `judgedLine(details, plan.line, facts)`; `remote` → `linkedLine(details, plan, facts)`. |
| `judgedLine` `:116-119` | `const reason = lineRefusal(details.name, line) ?? facts.shellRefusal(details.name, details.terminalOs);` (the `sshLinkRefusal(` call goes). |
| new `linkedLine(details, plan, facts)` | `lineRefusal(details.name, plan.line)` → reason; else `shownTrustLine(plan, facts.lookup)` refused → reason; else `{ line: shown.line, remote: plan }`. `Candidate` and `judgeTerminal` (`:72`, `:95-98`) carry `remote` through to the `LineRow`. |
| new exports | `refusedRowReason(sshName)`, `CHANGED_ROW`, `sshStopped(folderName)` (E2.0 texts). |
| `folderQuestion` | Unchanged: it shows `row.line`, which is the trust line for a linked row. |

**`commands/folderRunCommand.ts`**

| Place | Change |
|---|---|
| imports | `SshRoad`, `cleanWhenClosed` from `../sshRoad`; `sshReaderShell` with `entryOpenRefusal`, `liveTerminalsOfEntry` from `../pinnedTerminal`; `ReadySsh` type from `../sshSession`; `sshLinkOf`, `trustLineFor`, `typedLine` from `../remoteLaunch`; the three new exports of `../folderRun`. |
| `factsOf` `:67-69` | Add `lookup: (id) => host.storage.getNode(folder.accountId, id)` — `factsOf(host, folder)`. |
| new type | `type LinkedState = { readonly kind: 'ready'; readonly ready: ReadySsh; readonly typed: string } \| { readonly kind: 'failed'; readonly reason: string };` and `interface Prepared { readonly rows: Map<string, LinkedState>; stopped: boolean }` (by row id). |
| `runChosen` `:154-167` | After `chain.ready`: `const prepared = { rows: new Map(), stopped: false }; try { await prepareLinked(host, folder, linesToType(plan, closing), prepared); if (prepared.stopped) { warned(sshStopped(folder.name)); return; } say(reportNotice(folder.name, typeAll(plan, chosen, keyOfRow, prepared))); } finally { cleanUnsent(prepared); }` — split into helpers to keep ≤ 50 lines and complexity ≤ 4. |
| new `prepareLinked(host, folder, rows, prepared)` | §S2.1 step 2, a `for … of` with `await` (row order), `break` on `stopped`. On `stopped` it cleans every `ready` already in the map before it returns. |
| new `cleanUnsent(prepared)` | `cleanup()` on every `ready` state not marked handed (keep a `handed: Set<string>` in `Prepared`), then `prepared.rows.clear()`. |
| `typeAll` `:170-173` | Takes `prepared`; reads `prepared.stopped` first (returns `[]` — unreachable after `runChosen`'s check, kept as the parent's "checked once more"). For a `type` step of a linked row: `typeLinkedLine(row, state, toClose, keyOfRow, prepared)`. |
| `typeLine` `:193-202` | Local row: `typeIntoNew(keyOfRow(row), { kind: 'entry', terminalOs: row.details.terminalOs }, () => row.line)`. New `typeLinkedLine`: state `failed` → `failed(row, state.reason)`; missing → `failed(row, CHANGED_ROW)`; `ready` → the same dispose-then-send as `typeLine`, with `typeIntoNew(keyOfRow(row), { kind: 'ssh', env: state.ready.env }, () => state.typed)`; on `typed` → `prepared.handed.add(row.id)` and `cleanWhenClosed(sent.terminal, state.ready)`. The `try/catch` of `typeLine` stays (a thrown send is that row's failure; the `finally` then cleans it). |
| file doc `:33-50` | One paragraph: linked rows (E2.S2) — the modal shows the trust line; preparation after the chain in row order; the re-check; the run-level stop; the run owns the list. |

`registerFolderRun(host)` already receives `RunCommandsHost`, which has `sshRoad` since S1.

**The road scan** — `RESOLVE_IMPORTERS` (`launchRoadScan.test.ts:102`) loses `'folderRun.ts'`; `REFUSAL_SITES` loses
`'folderRun.ts:judgedLine'`; `ALLOWED_SENDS['commands/folderRunCommand.ts']` gets the two `typeIntoNew` lines as written
(local and linked), `because` naming E2.S2.

**Existing tests whose expected values change** — `test/sshLinkRoads.test.ts` W3 (`:79`): `FACTS` gains `lookup: () =>
undefined`, and row `b`'s reason is the missing-entry sentence (`sshLinkOf(b, () => undefined).reason`); W4 (`:89`): the
report holds that sentence without its last full stop. Every `FolderFacts` literal in `test/folderRun.test.ts` and
`test/folderRunEdges.test.ts` gains `lookup: () => undefined` (no expected value changes there).

**The help ×5** — paragraph 8: the S1 sentences change to:
- EN: `With one chosen, *Run in Terminal*, a VPN's *Started by* and *Run All in Folder* run the line on that host, and *Runs on* then names the host's system. A dependency chain, *Run with Secrets* and an agent's run still refuse such an entry and say why.`
- DE: `Ist einer gewählt, führen *Run in Terminal*, *Started by* eines VPN und *Run All in Folder* die Zeile auf diesem Host aus, und *Runs on* nennt dann das System des Hosts. Eine Abhängigkeitskette, *Run with Secrets* und der Lauf eines Agenten lehnen einen solchen Eintrag weiterhin ab und sagen warum.`
- ES: `Con una elegida, *Run in Terminal*, el *Started by* de una VPN y *Run All in Folder* ejecutan la línea en ese host, y *Runs on* indica entonces el sistema del host. Una cadena de dependencias, *Run with Secrets* y la ejecución de un agente siguen rechazando esa entrada y dicen por qué.`
- RU: `Если запись выбрана, *Run in Terminal*, *Started by* у VPN и *Run All in Folder* выполняют строку на этом хосте, а *Runs on* тогда указывает систему хоста. Цепочка зависимостей, *Run with Secrets* и запуск агентом пока отказывают такой записи и объясняют почему.`
- UK: `Якщо запис вибрано, *Run in Terminal*, *Started by* у VPN і *Run All in Folder* виконують рядок на цьому хості, а *Runs on* тоді вказує систему хоста. Ланцюжок залежностей, *Run with Secrets* і запуск агентом поки відмовляють такому запису й пояснюють чому.`

Paragraph 17 (*Run All in Folder*): append at its end:
- EN: `` A line set to run over SSH is shown as the `ssh … -- user@host '<line>'` it runs. After the question and the dependencies, each such entry connects in turn, in the folder's order, and only then is anything typed: cancelling one of its questions types nothing at all, and an entry whose SSH entry or jump host changed while the question was open is not typed — run the folder again. ``
- DE: `` Eine Zeile, die über SSH laufen soll, wird als das `ssh … -- user@host '<line>'` gezeigt, das sie ausführt. Nach der Frage und den Abhängigkeiten verbindet sich jeder solche Eintrag der Reihe nach, in der Reihenfolge des Ordners, und erst dann wird etwas getippt: Bricht man eine ihrer Fragen ab, wird gar nichts getippt, und ein Eintrag, dessen SSH-Eintrag oder Jump-Host sich geändert hat, während die Frage offen war, wird nicht getippt — führen Sie den Ordner erneut aus. ``
- ES: `` Una línea que se ejecuta por SSH se muestra como el `ssh … -- user@host '<line>'` que ejecuta. Después de la pregunta y de las dependencias, cada una de esas entradas se conecta por turno, en el orden de la carpeta, y solo entonces se escribe algo: cancelar una de sus preguntas no escribe nada, y una entrada cuya entrada SSH o host de salto cambió mientras la pregunta estaba abierta no se escribe — ejecute la carpeta otra vez. ``
- RU: `` Строка, которая выполняется через SSH, показана как `ssh … -- user@host '<line>'`, который она запускает. После вопроса и зависимостей каждая такая запись по очереди, в порядке папки, подключается, и только потом что-либо печатается: отмена одного из её вопросов не печатает ничего, а запись, у которой запись SSH или jump-хост изменились, пока вопрос был открыт, не печатается — запустите папку снова. ``
- UK: `` Рядок, що виконується через SSH, показано як `ssh … -- user@host '<line>'`, який він запускає. Після запитання й залежностей кожен такий запис по черзі, у порядку папки, під'єднується, і лише потім щось друкується: скасування одного з його запитань не друкує нічого, а запис, у якого запис SSH або jump-хост змінилися, поки запитання було відкрите, не друкується — запустіть папку знову. ``

**README** — the *Runs over SSH* bullet (S1's text) moves *Run All in Folder* from the refusing list to the running
one; the folder paragraph (`src_vs_code/README.md:275-286`) gets the EN sentence above after `…is not run.`

**research/** — `module_extension.md`: a paragraph **The folder run over SSH (E2.S2)** after S1's (the shown trust
line, the order, the re-check, the run-level stop, the run's list and its `finally`); the "refusal on every road"
paragraph loses the folder. `module_tests.md`: one row for `sshRoadFolder.test.ts` in the E2 section; the `:1304` row
loses the folder.

### S2.3 Scenarios — RED first

World: `folderWorld([...], { outside: [...], sshRoad: road })` — `FolderWorldOptions` and `registerRunWorld` take the
road as in S1; the SSH nodes go in `outside`. `b`/`c`/`d` are `session(name, { sshEntityId })`; `SHOWN(row)` =
`shownTrustLine(PLAN(row), lookupAtModal).line`, read at the modal, never typed by hand.

**`test/sshRoadFolder.test.ts`** (new)

| # | Test | Assertion | RED today |
|---|---|---|---|
| F1 | `the_modal_shows_each_linked_rows_trust_line` | `[a (local), b → s1]`: the folder modal text includes `` `b: ${SHOWN(b)}` `` and `` `a: ${L('a')}` `` | `b` is under "Not run" |
| F2 | `linked_rows_are_prepared_in_row_order_after_the_modal_and_the_chain_and_before_any_typing` | `[a, b → s1, c → s2]`, `b` needs an outside trusted step `dep`: one ordered `events` array: folder modal, `dep` executed, prepare s1, prepare s2, then the sends; at each `prepare` call, `w.terminals.flatMap((t) => t.sent)` is `[]` | E1 refusal |
| F3 | `a_refused_row_is_reported_and_the_others_are_typed` | `s1` scripted `'refused'`: `named(w, 'a')` and `named(w, 'c')` sent; `named(w, 'b')` `[]`; the report includes `refusedRowReason('prod box')`; `refusedShown` 0 | E1 refusal |
| F4 | `a_stopped_row_stops_the_whole_run_and_cleans_every_prepared_row` | `[b → s1 ready, c → s2 stopped, d → s3]`: no terminal has a `sent` line; `road.calls` length 2 (no prepare after the stop); `cleaned` `['s1#1']`; warning `sshStopped(FOLDER)` | E1 refusal |
| F5 | `cancel_after_mixed_linked_and_unlinked_rows_types_no_row` | `[a, b → s1 ready, c, d → s2 stopped]`: `a` and `c` have no terminal and nothing sent; `cleaned` `['s1#1']` | E1 refusal |
| F6 | `snapshot_a_jump_host_changed_while_the_modal_was_open_is_not_typed` | `s1` with `jumpHostEntityId: 'j1'`; the modal held; while held, `s1`'s node is REPLACED with `jumpHostEntityId: 'j2'`; Run: `b` not typed, the report includes `CHANGED_ROW`, `cleaned` includes `'s1#1'`; `a` typed | E1 refusal |
| F7 | `snapshot_a_host_changed_while_the_modal_was_open_is_not_typed` | the same with `host` changed | E1 refusal |
| F8 | `owner_an_unsent_linked_row_is_cleaned_by_the_runs_finally` | modal held; a live terminal with `b`'s title appears (`w.list(w.open(T('b')))`); Run: `b` is "Left alone", `cleaned` `['s1#1']` | E1 refusal |
| F9 | `owner_a_typed_row_is_handed_to_its_terminal` | after a run: `cleaned` `[]`; `w.exit(w.live[T('b')])` → `['s1#1']` | E1 refusal |
| F10 | `owner_a_failed_send_is_the_rows_failure_and_is_cleaned` | `failSend: /b$/`: `b` failed in the report, `cleaned` `['s1#1']`, `a` typed | E1 refusal |
| F11 | `a_password_row_opens_a_new_terminal_with_its_env` | `s1` scripted `{ password: true }`: `named(w, 'b')[0].env` deep-equals the ready's `env`; sent `[TYPED]` | E1 refusal |
| F12 | `one_approval_covers_the_folder_and_the_arrow` | after a folder run: `isCommandTrusted(w.trust, 'b', SHOWN(b))` true; then `w.arrow('b')` with the same road: no trust modal is shown | E1 refusal |
| F13 | `the_plan_gives_a_linked_row_no_local_os_refusal_and_refuses_a_windows_remote` | pure `planFolderRun` with `FACTS` whose `shellRefusal` refuses everything: `b → s1` (`terminalOs: 'linux'`) is a line row; `b` with `terminalOs: 'windows'` is `notRun` with the D9 sentence | stub (`b` is `notRun` with E1's sentence) |

### S2.4 Commands

```bash
node $LP npm run typecheck && node $LP npm run lint && node $LP npm run compile
node $LP node --test out/test/sshRoadFolder.test.js out/test/folderRun.test.js out/test/folderRunCommand.test.js out/test/folderRunEdges.test.js out/test/folderRunTitlesDuringTheWait.test.js out/test/folderRunHelp.test.js out/test/sshLinkRoads.test.js out/test/launchRoadScan.test.js out/test/sshRoadHelp.test.js out/test/promptSites.test.js
```

The lead runs the full `npm test`.

---

## S3 — Dependency chain (scenarios and brief)

### S3.1 What the road does

1. **Plan (pure).** `planDependencyRun` gains an optional `lookup`. Without it (an agent's start, E2-D2) a linked step
   refuses the whole chain with E1's sentence, as today. With it, a linked step is planned with `planLaunch(node, link,
   { stayOpen: false })` (D11: the bare line, so ssh's exit status is the remote command's): a refused plan refuses the
   whole chain with its sentence; `{config}` in the line still refuses it; `walk.refusalOf` (the local OS) is NOT asked
   for it (D14). The step carries `remote`.
2. **Prepare (host, before the modal).** `runDependenciesFirst` prepares every `remote` step in step order, after the
   plan and before the approval modal: `stopped` → nothing runs, every prepared step cleaned, quietly; `refused` →
   `sayRefused`, every prepared step cleaned, nothing runs; `ready` with `env` (a password) → cleaned, every prepared
   step cleaned, `passwordStepRefusal` warned, nothing runs; `typedLine` refused → the same with its reason.
3. **Approve and run.** A linked step's shown and trusted text is `trustLineFor(ready.entity, ready.jump,
   step.remote.line)`; its typed text is `typedLine(step.remote, ready, sshReaderShell())`. The chain is pinned when
   any step is linked and `composedShellPath()` is set (a local window), so the line meets the shell it was composed
   for. Each step's session is cleaned right after that step ends (its exit, the Continue answer, a close); the chain's
   `finally` cleans every session (idempotent) — a step never reached, a stop, a throw.

Because each preparation is `isolate: true`, a step linked to the same SSH entry as its parent has its own key and pin
files, so the step's `cleanup()` cannot delete the parent's (S3 spec §S3.13 A1).

### S3.2 The brief

**`dependencyRun.ts`** (pure)

| Place | Change |
|---|---|
| imports `:1-5` | Add `NodeLookup`, `RemotePlan`, `planLaunch`, `sshLinkOf` from `./remoteLaunch` (keep `sshLinkRefusal`). |
| `RunStep` `:36-41` | Add `readonly remote?: RemotePlan;` — doc: a linked step (E2.S3); `line` stays the person's line until the host replaces it by the trust line for the modal. |
| `Walk` `:52-60`, `planDependencyRun` `:69-78` | A fifth optional parameter `lookup?: NodeLookup`, kept on the walk. |
| `addStep` `:136-142`, `stepRefusal` `:149-159` | With `walk.lookup` and `sshLinkOf(node, walk.lookup).kind !== 'none'`: `linkedStep(walk, node, line)` — plan; `refused` → `walk.refusal ??= plan.reason`; `usesConfig(plan.line)` → today's `{config}` sentence; else push `{ id, name, line, terminalOs, remote: plan }`. Without a lookup, `stepRefusal` is unchanged (its `sshLinkRefusal(` call stays: the agent's start). Do NOT add an `executableLine(` call (`commandRoadScan.test.ts:109-116`). |
| new export | `passwordStepRefusal(stepName, sshName)` (E2.0 text). |

**`dependencyRunHost.ts`**

| Place | Change |
|---|---|
| imports | `SshRoad` from `./sshRoad`; `ReadySsh` type from `./sshSession`; `NodeLookup`, `trustLineFor`, `typedLine` from `./remoteLaunch`; `composedShellPath`, `sshReaderShell` with `pinnedShell`, `pinnedTerminal`, `shellContext` from `./pinnedTerminal`; `passwordStepRefusal` from `./dependencyRun`. |
| `DependencyRunRequest` `:29-51` | Add `readonly ssh?: { readonly road: SshRoad; readonly accountId: string; readonly lookup: NodeLookup };` — doc: the person's roads only (E2-D2); absent, a linked step refuses the chain. |
| new export `withSshSteps(request, road, accountId, source: NodeSource)` | `{ ...request, ssh: { road, accountId, lookup: (id) => source.getNode(accountId, id) } }`. |
| `runDependenciesFirst` `:95-102` | Pass `request.ssh?.lookup` to `planDependencyRun`. When the plan is ok: `const sessions = await prepareSteps(request, plan.steps)` → `undefined` (stopped/refused/password, already said and cleaned) → `NOTHING_RAN`; else `try { return await approveAndRun(request, sessions.steps, plan.missing, chainIsPinned(ctx, sessions.steps)); } finally { sessions.all.forEach((r) => r.cleanup()); }`. |
| new `prepareSteps(request, steps)` | §S3.1 step 2, in step order; answers `{ steps: ChainStep[], all: ReadySsh[], byStep: Map<string, ReadySsh> }` where a linked `ChainStep` has `line` = the trust line (shown and trusted) and `typed` = the typed line; a local step has `typed` = `line`. On any stop it cleans what it prepared before returning `undefined`. |
| `chainIsPinned` `:137-139` | A step with `remote` counts as pinned when `composedShellPath() !== undefined`; others as today. |
| `approve` `:147-159` | Unchanged: it shows and trusts `step.line` (the trust line for a linked step). |
| `runAll` `:240-254`, `runStep` `:292-304`, `ran` `:310-316` | Type `step.typed` (both the `sendText` at `:300` and `executeCommand` at `:369` through `executed`'s `line` argument); in `runAll`, after each `runStep` returns, `byStep.get(step.id)?.cleanup()` ("the step's key is deleted when the step ends"). Thread `byStep` without passing more than 4 parameters (put it on the request object you already pass, or a small context). |
| the person's callers | `commands/runCommands.ts:104` and `:201` (arrow, Run Script, Run with Secrets) and `commands/folderRunCommand.ts:159` wrap their request: `withSshSteps(dependencyRequest(…), host.sshRoad, accountId, host.storage)`. `vpnLauncherRun.ts:52-54` (`vpnDependencies`) adds it only when `ctx.sshRoad` is set. `agentVpnOpener` passes no road, so the agent's chain keeps E1's refusal. |

**The road scan** — add `/\.executeCommand\s*\(/g` to `SENDS` (`launchRoadScan.test.ts:20`): the chain's main send
(with shell integration) was not seen by scan 3. Allow-list `dependencyRunHost.ts: execution = integration.executeCommand(line);`
(`because: 'a chain step through shell integration: the line is the step\'s typed text (E2.S3)'`) and the `sendText` line
as written; add the self-check `sitesIn('literal.ts', 'x\n  .executeCommand(\n y)', SENDS).length === 1`.
`REFUSAL_SITES` keeps `dependencyRun.ts:stepRefusal` (the no-road path).

**Existing tests** — `test/sshLinkRoads.test.ts` W5, W5b, W6 stay green unchanged (no lookup, no road). Every other
chain test must stay green unchanged; if one goes red, stop and report.

**The help ×5** — paragraph 8: the S2 sentences change to:
- EN: `With one chosen, *Run in Terminal*, a VPN's *Started by*, *Run All in Folder* and a dependency chain run the line on that host, and *Runs on* then names the host's system. *Run with Secrets* and an agent's run still refuse such an entry and say why.`
- DE: `Ist einer gewählt, führen *Run in Terminal*, *Started by* eines VPN, *Run All in Folder* und eine Abhängigkeitskette die Zeile auf diesem Host aus, und *Runs on* nennt dann das System des Hosts. *Run with Secrets* und der Lauf eines Agenten lehnen einen solchen Eintrag weiterhin ab und sagen warum.`
- ES: `Con una elegida, *Run in Terminal*, el *Started by* de una VPN, *Run All in Folder* y una cadena de dependencias ejecutan la línea en ese host, y *Runs on* indica entonces el sistema del host. *Run with Secrets* y la ejecución de un agente siguen rechazando esa entrada y dicen por qué.`
- RU: `Если запись выбрана, *Run in Terminal*, *Started by* у VPN, *Run All in Folder* и цепочка зависимостей выполняют строку на этом хосте, а *Runs on* тогда указывает систему хоста. *Run with Secrets* и запуск агентом пока отказывают такой записи и объясняют почему.`
- UK: `Якщо запис вибрано, *Run in Terminal*, *Started by* у VPN, *Run All in Folder* і ланцюжок залежностей виконують рядок на цьому хості, а *Runs on* тоді вказує систему хоста. *Run with Secrets* і запуск агентом поки відмовляють такому запису й пояснюють чому.`

Paragraph 13 (*Depends on → …*): append at its end:
- EN: ` A step set to run over SSH runs there and ends there, so the chain sees its exit code; its connection is made, and its PIN or host key asked, before the chain is shown. A step whose SSH entry signs in with a password is refused, because the chain's one terminal has one environment.`
- DE: ` Ein Schritt, der über SSH laufen soll, läuft dort und endet dort, die Kette sieht also seinen Exit-Code; seine Verbindung wird vorbereitet und seine PIN oder sein Host-Schlüssel erfragt, bevor die Kette gezeigt wird. Ein Schritt, dessen SSH-Eintrag sich mit einem Passwort anmeldet, wird abgelehnt, denn das eine Terminal der Kette hat eine Umgebung.`
- ES: ` Un paso que se ejecuta por SSH se ejecuta allí y termina allí, así que la cadena ve su código de salida; su conexión se prepara, y se pregunta su PIN o su clave de host, antes de mostrar la cadena. Un paso cuya entrada SSH inicia sesión con una contraseña se rechaza, porque el único terminal de la cadena tiene un único entorno.`
- RU: ` Шаг, который выполняется через SSH, выполняется там и там же завершается, поэтому цепочка видит его код выхода; его подключение готовится, а PIN или ключ хоста спрашиваются до того, как цепочка показана. Шаг, чья запись SSH входит по паролю, отклоняется, потому что у единственного терминала цепочки одно окружение.`
- UK: ` Крок, що виконується через SSH, виконується там і там же завершується, тож ланцюжок бачить його код виходу; його з'єднання готується, а PIN або ключ хоста запитуються до того, як ланцюжок показано. Крок, чий запис SSH входить за паролем, відхиляється, бо єдиний термінал ланцюжка має одне оточення.`

**README** — the *Runs over SSH* bullet moves "a dependency chain" to the running list; the chain paragraph
(`src_vs_code/README.md:262-266`) gets the EN sentence above.

**research/** — `module_extension.md`: a paragraph **A dependency step over SSH (E2.S3)** (the optional lookup, the
bare line, preparation before the modal, the password refusal after preparation, the per-step cleanup and the
`finally`, `isolate` and the parent's files, the agent path kept refused); `module_tests.md`: one row for
`sshRoadChain.test.ts`, and the scan row names the `executeCommand` pattern.

### S3.3 Scenarios — RED first

`STEP` = `{ id: 'st', name: 'migrate', isSshEnabled: false, isTerminal: true, command: 'migrate', sshEntityId: 's1' }`.
The roots are run from the arrow world with a road (S1), so the chain is the real `runDependenciesFirst`.

**`test/sshRoadChain.test.ts`** (new)

| # | Test | Assertion | RED today |
|---|---|---|---|
| D1 | `a_linked_step_is_planned_with_the_bare_line_and_no_os_refusal` | pure: `planDependencyRun([root], nodeOf, () => 'refused here', undefined, lookup)` → `ok`, one step with `remote.remoteCommand === 'migrate'` and no `eval` | `ok: false`, E1 sentence |
| D2 | `without_a_lookup_a_linked_step_still_refuses_the_whole_chain` | the same without `lookup` → `{ ok: false, reason: sshLinkRefusal(STEP) }` — GREEN before and after (the agent path, E2-D2); say so | (green) |
| D3 | `a_linked_step_for_windows_or_with_config_is_refused` | `terminalOs: 'windows'` → the D9 sentence; command `x {config}` → the `{config}` sentence | E1 sentence |
| D4 | `a_linked_step_runs_its_typed_line_and_the_chain_waits_for_its_exit` | arrow on a local trusted root with `dependsOn: ['st']`, `runDependencies: true`: the chain modal lists `` `migrate: ${trustLineFor(r1.entity, r1.jump, 'migrate')}` ``; the chain terminal `executed` `[typedLine(stepPlan, r1, shell).line]`; exit 0 → the root's line is typed after it | E1 sentence, nothing runs |
| D5 | `a_password_step_refuses_the_whole_chain_before_any_step_and_cleans` | `s1` scripted `{ password: true }`: warning `passwordStepRefusal('migrate', 'prod box')`; no chain modal; nothing executed; the root not typed; `cleaned` `['s1#1']` | E1 sentence |
| D6 | `owner_the_steps_session_is_cleaned_when_the_step_ends` | `holdExecutions`: while the step runs `cleaned` `[]`; `w.shell.end(…, 0)` → `['s1#1']` BEFORE the root's send | E1 sentence |
| D7 | `owner_a_step_on_the_same_ssh_entry_as_its_parent_leaves_the_parents_files` | root linked to `s1` (prepared first, `#1`), step linked to `s1` (`#2`): after the step ends `cleaned` `['s1#2']`; the root's sent line holds `/keys/s1-1.key` and not `/keys/s1-2.key`; the root's session is cleaned only when its terminal closes | E1 sentence |
| D8 | `owner_a_stopped_step_preparation_runs_nothing_and_cleans_what_was_prepared` | two linked steps, the second `'stopped'`: nothing executed; `cleaned` `['s1#1']` (and the root's `#…` when the root is linked) | E1 sentence |
| D9 | `owner_a_chain_stopped_after_a_typed_step_cleans_every_session` | two linked steps, the first exits 1 and the person answers `Stop`: the second never executed; `cleaned` holds both | E1 sentence |
| D10 | `a_refused_step_preparation_shows_the_remedy_and_runs_nothing` | `'refused'`: `refusedShown` 1, nothing executed | E1 sentence |
| D11 | `the_chain_is_pinned_when_a_step_is_linked_in_a_local_window` | the chain terminal's `shellPath` is the pinned shell path, though the only other step has no OS | E1 sentence |
| D12 | `snapshot_a_step_whose_ssh_entry_changes_during_the_chain_modal_runs_on_the_prepared_host` | chain modal held; `s1` replaced with host `evil.example`; Run: the executed line holds `prod.example`, not `evil` | E1 sentence |
| D13 | `the_chain_approval_is_keyed_on_the_trust_line` | after D4: `isCommandTrusted(trust, 'st', trustLine)` true, `isCommandTrusted(trust, 'st', 'migrate')` false | E1 sentence |
| D14 | `the_scan_sees_execute_command` | `launchRoadScan.test.ts` self-check (the brief) | the pattern is absent |

### S3.4 Commands

```bash
node $LP npm run typecheck && node $LP npm run lint && node $LP npm run compile
node $LP node --test out/test/sshRoadChain.test.js out/test/dependencyRun.test.js out/test/dependencyChain.test.js out/test/vpnGoneRequest.test.js out/test/sshLinkRoads.test.js out/test/launchRoadScan.test.js out/test/commandRoadScan.test.js out/test/sshRoadHelp.test.js out/test/promptSites.test.js out/test/consentContractVpn.test.js
```

The lead runs the full `npm test`, then hands hand checks 1, 2 and 4 of the parent's §10 to the owner (owed, not a
gate for the merge).

---

## What E2 does NOT do

- **Run with Secrets and the agent's `creds_run` stay refused** with E1's sentence (`runCommands.ts:278-280`
  `secretsRefusal`, `agentUseActions.ts:212`) until E3.S1 and E3.S2.
- **An agent's `creds_vpn_up` with a linked launcher or a linked chain step stays refused** (E2-D2). Whether an agent's
  VPN grant may ever reach an SSH entry that way is not decided by the parent (see Flags).
- No change to `prepareSshSession`, `cleanup()`, `remoteLaunch.ts`'s existing functions (`sshLinkOf`, `planLaunch`,
  `trustLineFor`, `typedLine`, `secretsStdin`), the trust store or `commandFingerprint`.
- No change to SSH Connect's behaviour (`connectEntity`); only `offerTheFix` is added beside it.
- *Show Command and Notes* (`commands/entityCommands.ts:249-256`) still shows the stored line: a display, as in E1.
- The items of `PLAN_terminal_runs_followups.md` are not closed or changed (`sendPinned`, the arrow's `{config}`,
  `fresh` disposing by name); `sendPinned` (`pinnedTerminal.ts:82-90`) is not touched.
- No `CHANGELOG.md`, no `todo/README.md` row, no parent-plan edit, no promotion (the lead and E3.S3).
- Risk 7 (askpass answers the hop) stays inherited; a password SSH entry with a jump host has it on these roads too.
- No fix of the translated *Runs on* labels in `helpDe.ts` / `helpEs.ts` (older than this plan; E1 note 6).

## Flags for the lead (found while writing this)

1. **Possible plan change (scope), not decided here:** the agent's `creds_vpn_up` can reach a linked launcher and linked
   chain steps; D2 governs `creds_run` only. E2 keeps that path refused (fail closed). Either E3.S2 takes it (the SSH
   entry's own `exec` eligibility, as D2) or the parent records that it stays refused. Authorisation: a Fable security
   judgement.
2. **Parent wording:** "a password step is refused at plan time" (§4.4, E2 S3) cannot hold: the credential kind is known
   only inside `prepareSshSession` (`resolveSshCredential`, `sshCredential.ts:43-61`), after a PIN. E2 refuses it after
   the chain's preparation, before the modal and before any step; the PIN may be asked first. By my reading this only
   satisfies the plan's intent (nothing starts), so not a change; in doubt the lead counts it.
3. **Scan gap (not a change):** `launchRoadScan` scan 3 did not see `executeCommand(`, the chain's main send; S3 adds it.
4. **Not named by the parent:** Copy All (`entityText.ts`, added by E1) is a third copy road; S1 covers it. The parent's
   §4.2 `typedLine(plan, prepared, localFamily)` is `typedLine(plan, prepared, localShell: HostShell)` in the code.
5. **Files the parent's E2 list does not name:** `sshRoad.ts` (new), `entityCommandRows.ts` (new), `sshConnect.ts`
   (`offerTheFix`), `sshUseActions.ts` (re-export), `extension.ts` (three in-place edits, size ratchet), `vpnRun.ts`,
   `commands/entityCommands.ts`, `entityText.ts`, `entityViewPage.ts`, `entityViewCopy.ts`, `entityViewerCommands.ts`,
   `remoteLaunch.ts` (additions), `test/promptSiteLedger.ts` only if the prompt scan goes red.

## E2.A — Lead amendment after E2's plan round (2026-11-10; verdict proceed, 2 of 2 reviewers, all four findings accepted)

These override the sections they name; the coder builds the amended form.

| # | Finding | The amended rule | Test |
|---|---|---|---|
| A1 | `cleanWhenClosed` adds one close-listener per run, so a REUSED terminal piles up listeners and keeps every earlier session's files until it closes | `sshRoad.ts` keeps ONE session per terminal (a `WeakMap<vscode.Terminal, {ready, listener}>`). A terminal is reused only when its last command is known finished (`terminalGuard.ts` verdict), so its earlier ssh has ended: handing a new session to it first calls the earlier session's `cleanup()` and disposes its listener, then registers the new one. Close still cleans the current one; a terminal already closed is cleaned at once (H4 stays). | H5: two runs into one reused terminal → the first session's `cleanup` runs at the second hand-over, exactly one listener remains, close cleans the second |
| A2 | S3 prepared every linked step BEFORE the chain modal, so a PIN or host-key prompt came before the person agreed to the chain | The chain follows the folder model (§S2.1): the modal shows each step's trust line from `shownTrustLine` (no preparation); after approval the linked steps are prepared in step order; each prepared step's trust line is rebuilt from its snapshot and a step whose text differs from the one shown is not run — the chain stops before that step with "changed while the dialog was open — run it again", and every session is cleaned. A password step is still refused after its preparation and before any step runs. | S3 scenarios: no `prepareSshSession` call before the modal's answer; a declined modal prepares nothing; a jump changed while the modal is open stops the chain |
| A3 | Which local refusals apply to a LINKED row or step was unclear | For a linked row/step exactly two local checks apply: `{config}` (a local file — refused when linked) and the control-character / newline refusal (`planLaunch` P6). `facts.shellRefusal` / the local OS check does NOT apply (D14). `lineRefusal`'s `{name}` rule applies as on every road (it is about the entry's name, not the shell). Written as a table in `linkedLine`'s doc and pinned by one test per check | one test per check: `{config}` refused, control char refused, a Windows-OS-only local refusal NOT applied |
| A4 | `prepareSteps` returned before the `try/finally`, so a THROW in a later preparation leaked the earlier sessions' files | Preparation runs INSIDE the owner: `const sessions = newSessionList(); try { await prepareStepsInto(sessions, …); … run … } finally { sessions.all.forEach((r) => r.cleanup()); }` — the same shape for the folder run's list. A throw at step k cleans steps 1..k-1. | a stub `prepare` that resolves for step 1 and THROWS for step 2 → step 1's `cleanup` ran, nothing typed; the same for the folder run |

### Recorded deviations (what shipped differently from the plan above)

1. **`sshStopped`'s text differs from the E2.0 table.** The table says `…: a question for an SSH connection was cancelled.` The shipped text is `…: an SSH connection could not be prepared (a question was cancelled, or SSH Connect said why).` Why: a stop has several causes (a cancelled PIN or host-key question, a refusal SSH Connect says in its own words), and a sentence that names only one of them misleads the person about the others.
2. **The `carriesEnvironment` rule was added after the S1 review.** A terminal opened with an environment (a password session's askpass variables) is never reused by any road: the SSH finder, the local road's finder and the pinned finder all skip it (`pinnedTerminal.ts`). The plan only said a password send opens a new terminal (D10); it did not say that a later key session or an unlinked local line must not find that terminal.
3. **A1 was corrected in the fix pass after the code round.** The amendment above cleans the earlier session of a reused terminal at every hand-over. That is true only after a `finished` verdict. After "Type It Anyway" into a busy or unknown terminal the earlier ssh may still be running, so the terminal keeps both sessions under one listener and its close cleans all of them (`GuardedSend.earlierEnded`, `sshRoad.ts`).
4. **The one owner and the one re-check moved into `sshRoad.ts` and serve four roads.** `ownedSessions()`, `recheckedLine` and `linkedNow` replace the folder run's and the chain's own copies; `runOverSsh` replaces the arrow's and the launcher's. The folder run now reads a row's link from the Terminal entry as storage holds it after the modal (the chain's read), which is stricter than the plan's re-read of the SSH entry alone. `runOverSsh` takes `key` as a function, because the launcher reads its terminal's key after the chain.
