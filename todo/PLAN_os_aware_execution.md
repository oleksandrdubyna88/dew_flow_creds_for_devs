# PLAN — everything the extension executes knows which OS and shell will parse it (issue #103)

> Status: **plan only, nothing implemented yet, 2026-09-23.** Scope: `src_vs_code` — the VPN run path,
> the install offer, Terminal entries, the Depends-on section and a new dependency runner. No server,
> CLI or MCP-binary change; the MCP tool text is untouched.
>
> Related docs: [module_extension.md](../research/module_extension.md) §Terminal commands, §VPN start and
> stop, §Depends on, §The form is three modules; [PLAN_depends_on.md](../research/PLAN_depends_on.md);
> [PLAN_connect_in_a_remote_window.md](PLAN_connect_in_a_remote_window.md) (the same class of defect,
> fixed for SSH).

## 1. The symptom

Issue #103, reported from a local Windows window whose **default terminal profile is WSL bash**:

```text
jinx@jinx:~/git/scoreMeter$ Start-Process -Verb RunAs -FilePath 'C:\Program Files\OpenVPN\bin\openvpn.exe' -ArgumentList '--config "c:\Users\…\keys\36848\org_meter_stage.ovpn"'
Start-Process: command not found
```

The line is composed for the **extension host's** platform and typed into **whatever terminal the
window opens by default**. Those are two different questions answered as one:

- `vpnRun.ts:50` reads `process.platform` (win32) and `vpnCommand.ts:64` composes
  `Start-Process -Verb RunAs …` — PowerShell syntax.
- `vpnRun.ts:117` opens `vscode.window.createTerminal({ name })` with **no `shellPath`**, so the
  terminal is the window's default profile — WSL bash here, Git-bash or cmd elsewhere.
- The same split exists at `vpnRun.ts:94` (the PowerShell call operator `&` for OpenVPN Connect),
  `toolEnsure.ts:29` (the winget recipe typed into the default profile) and
  `commands/runCommands.ts:160` (`runScript` composes per `process.platform`, types into the default
  profile).

`remoteWindow.terminalPlatform` (`remoteWindow.ts:86`) — the existing answer to "which shell parses
this line" — reacts only to `vscode.env.remoteName`, so a LOCAL window with a non-native default
profile is detected nowhere.

The owner asked for more than the fix, in the same issue:

1. Whatever the extension can do automatically per OS, it does (the example: `ls` in bash vs
   `Get-ChildItem` in PowerShell — i.e. never type one shell's syntax into another).
2. A VPN entry can pick **which client launches it**: a Terminal entry the person wrote themselves,
   picked the way an SSH connection picks its key.
3. A Terminal entry carries an **OS** (Windows / macOS / Linux) — a dropdown, defaulting to the OS
   detected now, overridable.
4. In the **Depends on** section, once a dependency is chosen, a second checkbox: **execute what is
   executable**. The example chain: VPN → (launcher) "start openvpn" → depends on "install openvpn",
   both with execute on; starting the VPN runs the installer, then the launcher, automatically.

Decisions taken with the owner on 2026-09-23 (the questions asked before this plan):

| Question | Decision |
|---|---|
| Fix the shell mismatch by pinning or by adapting to the detected shell? | **Pin.** A line composed for the host platform runs in that platform's native shell, opened explicitly. |
| One execute checkbox per entry or per dependency? | **One per entry.** |
| How does the chain wait for a step to finish? | **Raise `engines.vscode` to `^1.93.0`** and use the stable shell-integration API. |
| The launcher picker | **A `<select>`**, like the SSH key picker (`entityFormPage.ts:510`). |

## 2. What must be true when this is done

1. A line the extension composes for platform P runs in P's native shell, whatever the window's
   default profile is: **PowerShell on Windows, `/bin/bash` (else `/bin/sh`) on macOS and Linux.**
   The #103 line, reproduced with a WSL default profile, opens a PowerShell terminal and raises UAC.
2. In a remote window that is **not** WSL (Remote-SSH, containers, Codespaces), *Start VPN* refuses
   with a sentence saying a tunnel is started on the machine the editor runs on — it never types a
   line into a foreign machine's shell. In a WSL window the pinned shell is `powershell.exe` through
   WSL interop (measured before relying on it — §6, step 0).
3. There is **one** shell-family detector. `envProbe.ts:12` and `runPlan.ts:36` currently carry two
   copies of the same basename test; `envProbeCommand` calls `shellFamily`.
4. A Terminal entry has an OS, stored as `terminalOs: 'windows' | 'macos' | 'linux'`. New entries
   default to the host OS; an entry without one (every existing entry) behaves exactly as today.
   *Run in Terminal* on an entry whose OS is not this machine's refuses with a sentence naming both.
   An entry whose OS IS this machine's runs in the pinned native shell.
5. A VPN entry has an optional **Launcher**: a same-account Terminal entry. When set, *Start VPN*
   runs that entry's command instead of the built-in composition, with `{config}` replaced by the
   materialized config path quoted for the pinned shell. The launcher works for **every** VPN type
   (IKEv2/L2TP/other included — the person is supplying the knowledge the built-in lacks), so the
   `:vpnrun` menu token lights up when a launcher is set. *Stop* with a launcher says to stop it where
   it runs.
6. An entry with dependencies can tick **Execute executable dependencies first**
   (`runDependencies: true`). Using that entry — *Run in Terminal*, *Run Script*, *Start VPN*, and the
   agent's `creds_vpn_up`, which calls the same `runVpn` — first runs its executable dependencies:
   - **executable** means a Terminal entry with a command (v1; see §7 for scripts and VPNs);
   - a dependency's OWN dependencies are included only when that dependency also has
     `runDependencies: true` — which is exactly the owner's example;
   - order is dependencies-first (post-order DFS), each entry once; a **cycle refuses the whole
     run**, naming the cycle; depth is capped at 16;
   - a **dangling id** (the dependency was deleted) cannot run and is never silently dropped: the
     pre-run modal names it as *missing* and the person chooses *Run the rest* or *Cancel*; the modal
     appears for this reason even when every present line is already trusted (gate round 1, finding 2);
   - every step runs in **one** terminal with the pinned shell — deliberately: the chain is what the
     person would type into one terminal by hand, and a later step may rely on an earlier one (a PATH
     refreshed by an installer). Each step is awaited through shell integration, and a **non-zero
     exit stops the chain** with the step's name and code;
   - a step whose OS is not this machine's refuses the chain before anything runs;
   - untrusted lines (`commandTrust.ts`) are confirmed in **one** modal listing every step, before
     the first one runs;
   - the 10 s budget bounds only the **activation** of shell integration, never a step's duration —
     an active step is awaited on its own end event with no timeout. When activation misses the
     budget, or a step ends with no exit code, the person is asked *Continue / Cancel* before the
     next step starts — never a silent guess;
   - if the pinned terminal **closes on its own** before integration activates (the shell could not
     be started — e.g. `powershell.exe` unreachable from a WSL window), the run stops with a sentence
     naming the shell that failed, instead of waiting for an integration that will never come
     (gate round 1, finding 0).
7. `runVpn` tells its caller whether it started anything. Today `extension.ts:664-665` returns `true`
   after `runVpn` refused (no config, missing launcher, unsupported type), so an agent is told
   "opened" about a tunnel that never started — fixed with a red test first.
8. The new references are safe on the way out and in: `shareableDetails` (`shareFormat.ts:519`)
   strips `vpnLauncherEntityId` and `runDependencies` (a recipient's vault has neither the target nor
   the right to run a chain the sender set up); `remapDetails` (`idQuarantine.ts:72`) remaps
   `vpnLauncherEntityId`; the type guard (`typeGuards.ts`) accepts the three fields, with
   `terminalOs` a **loose string** so a future value does not make an older build reject the entity
   (the closed `vpnType` list is the counter-example, `typeGuards.ts:317`).
9. macOS is a platform, not "no apt": the install offer (`toolCheck.ts:98`) has a Homebrew recipe
   when `brew` is on PATH, and the launcher probe (`vpnExec.ts:31`) checks `/opt/homebrew/sbin` and
   `/usr/local/sbin` before giving up.

## 3. Design

### 3.1 `hostShell.ts` — new, pure

```ts
export type OsName = 'windows' | 'macos' | 'linux';
export function osOf(platform: NodeJS.Platform): OsName;              // win32→windows, darwin→macos, else linux
export function hostShell(platform, exists): { shellPath: string; family: ShellFamily };
export function quoteFor(family: ShellFamily, value: string): string; // PS '…''…', posix '…'"'"'…', cmd "…"
```

`ShellFamily` and `shellFamily` move here from `runPlan.ts` (re-exported there so no import churn);
`envProbe.ts` calls it. `vpnRun.ts`, `toolEnsure.ts`, `runCommands.ts` open their terminals through
one `vscode`-side helper, `pinnedTerminal(name, env?)` in a new `pinnedTerminal.ts`, which passes
`shellPath` and refuses (returns `undefined` + a reason) for a non-WSL remote window via
`windowSide` (`remoteWindow.ts:50`).

### 3.2 Terminal OS

`types.ts`: `terminalOs?: string` beside `command` (`types.ts:148`). Form: a `<select id="terminalOs">`
in the Terminal section (`entityFormPage.ts` ~`:586`), options Windows / macOS / Linux, the default
passed in as a new **optional** `EntityFormOptions.hostOs` (optional so the seven `as
EntityFormOptions` fixtures keep compiling — the trap recorded in `PLAN_depends_on.md`). Save:
`toValues` (`entityFormPanel.ts:488`) writes it for terminal entries only. The viewer shows it on the
Terminal card. The markup goes into a new fragment module (`entityFormPage.ts` is at 779/800 lines,
`entityFormScript.ts` at 799/800 — the save line is added to an existing payload line, or the
payload builder is extracted, whichever the line budget forces).

The agent path (`agentUseActions.ts:197`, `runBounded(line, [], true)` — Node's `shell: true`, i.e.
cmd.exe on Windows) runs an entry **that has a `terminalOs`** through the same pinned shell as the
human path and refuses on an OS mismatch; an entry without one keeps today's behaviour, so nothing
an agent already relies on changes under it.

### 3.3 VPN launcher

`types.ts`: `vpnLauncherEntityId?: string` beside `vpnConfigFileName` (`types.ts:108`). Form: a
`<select id="vpnLauncherEntityId">` in the VPN section, options built from same-account Terminal
entries (`— built-in (detect) —` first; each option labelled `name · OS`), candidates collected like
`collectKeyCandidates` (`entityEditCommands.ts:215`). `runVpn` gains a branch before the built-in
launcher resolution: resolve the entry (dangling → warning, fall back to built-in, the
`sshCredential.ts:35` precedent), check its OS, substitute `{config}`, trust-gate the template line
(the stored template is what is trusted — the substituted path contains a per-process directory and
would re-prompt every session), run through the dependency runner (3.4) so the launcher's own
dependencies run first when it asks for them.

### 3.4 Execute dependencies

`types.ts`: `runDependencies?: boolean`. Form: a checkbox inside the Depends-on fieldset
(`entityFormPage.ts:442-454`), shown only while `dependsOnOn` is checked, in `depPickerScript.ts`
(which already owns that toggle, `:209-223`).

Two new modules:

- `dependencyRun.ts` — pure. `planDependencyRun(rootId, nodeOf, hostOs)` returns either
  `{ ok: true, steps: Step[], skipped: string[] }` or `{ ok: false, reason }` (cycle / depth /
  OS mismatch / empty command). Unit-tested on graphs: the owner's chain, a diamond, a cycle, a
  dangling id, a non-executable dependency, a dependency with `runDependencies` off.
- `dependencyRunHost.ts` — `vscode`. Opens the pinned terminal, waits for
  `onDidChangeTerminalShellIntegration` (10 s budget), runs each step with
  `shellIntegration.executeCommand(line)`, awaits `onDidEndTerminalShellExecution` for that execution,
  stops on a non-zero `exitCode`, asks *Continue / Cancel* when integration is absent or the code is
  `undefined`. Returns `boolean` so each caller can stop before its own action.

Callers: `runCommand` and `runScript` (`commands/runCommands.ts:41`, `:85`) and `runVpn`, each at
their top, when the entry has `runDependencies === true`.

### 3.5 Engines

`package.json` `engines.vscode` and `@types/vscode` → `^1.93.0` together (vsce refuses types newer
than engines — `.github/dependabot.yml:40`), lock file regenerated. 1.93 is where
`TerminalShellIntegration.executeCommand` and `onDidEndTerminalShellExecution` became stable. This
drops VS Code older than August 2024; the CHANGELOG says so.

## 4. Stories and build order

The epic is one PR with one commit per story; the gate runs once on the plan and once on the code.

1. **S1 — the pinned shell (the bug).** `hostShell.ts`, `pinnedTerminal.ts`, the three terminal
   sites, `envProbe` onto the one detector, the remote-window refusal, `runVpn` returning `boolean`
   and the agent `open` using it, the macOS recipe and launcher probe.
2. **S2 — Terminal OS.** Field, guard, form, save, viewer, run-time refusal, agent path.
3. **S3 — VPN launcher.** Field, guard, share strip, import remap, form picker, `runVpn` branch,
   `:vpnrun` token, `{config}` substitution.
4. **S4 — execute dependencies.** Engines bump, field, guard, share strip, checkbox, the planner, the
   host runner, the three callers.
5. Docs: `research/module_extension.md` (§Terminal commands, §VPN start and stop — which still says
   `runVpn` is in `extension.ts`, §Depends on, and a new §Which shell parses the line), help text in
   the five languages (`helpEn/De/Es/Ru/Uk.ts`), `CHANGELOG.md`.

## 5. Test plan

All `node:test` over `out/`, pure modules without `vscode`:

- `hostShell.test.ts` — `osOf`, `hostShell` per platform with an injected `exists`, `quoteFor` with
  apostrophes, spaces, `$`, backticks and double quotes per family.
- `envProbe.test.ts` / `runPlan.test.ts` — unchanged outputs after the detector merge (they are the
  regression net for the move).
- `vpnRunReports.test.ts` (**red first**): the agent `open` answers `false` when there is no config.
- `vpnCommand.test.ts` / `vpnExec.test.ts` — macOS Homebrew paths; unchanged Windows/Linux lines.
- `toolCheck.test.ts` — the brew recipe when brew is present, apt when apt is, the adapt note otherwise.
- `terminalOs.test.ts` — guard accepts any string, form markup defaults to `hostOs`, `toValues`
  keeps it only for terminal entries, mismatch refusal sentence.
- `vpnLauncher.test.ts` — `{config}` substitution per family, dangling launcher falls back,
  `:vpnrun` for an IKEv2 entry with a launcher, `shareableDetails` strips, `remapDetails` remaps.
- `dependencyRun.test.ts` — the graphs listed in 3.4.
- `formStructure.test.ts` / `webviewHtml.test.ts` — the new controls parse for every kind; the
  section colour rule still holds.
- The shell-integration host runner is exercised in `test:host` (the real-editor harness) if the
  harness can drive a terminal; otherwise its decision logic is kept in the pure planner and the host
  half is thin wiring, said so in the PR.

Full suite: `npm run typecheck`, `npm test`, `npm run lint`, `npm run package`, plus the family
checks (`plan-lifecycle`, `pin-check`).

## 6. Risks and how each is handled

0. **Measure the WSL window before relying on interop.** In a Remote-WSL window a UI extension's
   `createTerminal({ shellPath: 'powershell.exe' })` opens on the WSL side; interop resolves
   `powershell.exe` only when `appendWindowsPath` is on. Step 0 of S1 measures it on this machine;
   if it does not open, the WSL window gets the same refusal as the other remote kinds, with a
   sentence saying to start the tunnel from a local window. The plan does not depend on either answer.
   And because one machine's measurement is not every machine's configuration, the runtime guard
   stands regardless of it: a pinned terminal that exits before it is usable is reported by name
   (`onDidCloseTerminal` with its exit status), never waited on (gate round 1, finding 0).
1. **Pinning changes behaviour for people whose default profile is Git-bash** and who relied on the
   VPN line being typed there. On Windows that line never worked in bash; nothing working is lost.
2. **An older build saving a Terminal/VPN entry drops the new fields** (`toValues` rebuilds details
   from a literal) and the loss syncs out. Accepted and stated: the fields are conveniences, and
   nothing becomes less safe when they vanish — the entry falls back to today's behaviour.
3. **Transitive execution of synced commands.** Every step goes through the per-line trust record,
   and a chain is refused whole on the first untrusted line the person declines. A shared entry
   arrives without `runDependencies` and without a launcher (stripped), so a chain can only be
   armed by the vault's owner.
4. **Shell integration is not universal** (cmd.exe has none; some custom prompts break it). The
   Continue/Cancel fallback keeps the chain honest instead of fast.

## 7. Out of scope (recorded, not built)

- Scripts and VPNs as *executable dependencies* — a script needs its env materialization and a VPN
  never exits (`openvpn` runs in the foreground), so neither fits "await, then continue" without a
  separate design.
- SSH connect as a caller of the dependency runner — it has five routes (`sshConnect.ts:125`) and
  deserves its own story.
- A filterable combobox for pickers — the owner chose the `<select>`.

## 8. Definition of Done

- [ ] The #103 line no longer reaches bash: a VPN start from a window with a WSL default profile
      opens PowerShell (observed on this machine, not inferred).
- [ ] One shell-family detector in the codebase.
- [ ] `runVpn` reports failure to the agent — red test observed failing first, then green.
- [ ] Terminal OS, VPN launcher and execute-dependencies work as §2 states, each with tests.
- [ ] `npm run typecheck`, `npm test`, `npm run lint`, `npm run package` green; `dotnet build` of the
      solution unaffected.
- [ ] `research/module_extension.md`, help text ×5, `CHANGELOG.md` updated; this plan promoted.
- [ ] The `coai` gate: one plan round to `proceed`, one code round, every finding resolved.
- [ ] PR merged, CodeRabbit threads resolved, extension release cut through release-please.
