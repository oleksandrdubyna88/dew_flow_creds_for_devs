# PLAN — `creds` can be found by every program that is told to run it: on PATH by consent, and inside WSL

> Status: **plan only, nothing implemented yet, 2026-09-26.** Plan gate passed on the whole plan (`good_enough`, 3 of
> 3 reviewers, one round — §14); split into three epics per the gate's order (§10), each re-gated on its own branch.
> Scope: `src_vs_code/src` (the install flow, `binaryInstaller.ts`, `credsInstall.ts`, `installCommand.ts`, the
> code-access panel, the snippets, the WSL install, help, a new uninstall hook), `src_broker_client/src/WslInterop.cs`
> (one new resolution rung), `src_cli` (help text), and `src_mcp` (the agent-facing instructions). Issue #159.
>
> **Crosses a repository boundary.** The `coai` half is `dew_flow_connect_other_ais · todo/PLAN_coai_finds_creds_where_it_is.md`;
> this plan owns the contract that one relies on (§6, *the stable location*). Each names the other.
>
> Related docs: [module_extension.md](../research/module_extension.md), [module_tests.md](../research/module_tests.md),
> [PLAN_mcp_wsl_bridge.md](../research/PLAN_mcp_wsl_bridge.md), [PLAN_config_entities.md](../research/PLAN_config_entities.md),
> [PLAN_os_aware_execution.md](../research/PLAN_os_aware_execution.md), [PLAN_headless_cli.md](../research/PLAN_headless_cli.md).

## 1. The symptom (issue #159, owner, 2026-09-26)

An agent, setting up `coai`'s vault key after **Enable Code Access…**, reported:

> Found the CLI at `globalStorage/remsoftdev.creds-for-devs/bin/creds.exe`, but it's not on PATH … coai looks for
> `creds` on PATH, but the CLI lives inside the CredsForDevs extension folder, so the coai server VS Code launches
> can't read the vault either. The probe only worked because I pointed it at the extension's folder by hand.

The owner asks for three checks: that installing `creds` registers its path on **Windows**, sets up the environment
correctly on **Linux**, and that **WSL** can reach the Windows CLI.

## 2. What exists today — verified 2026-09-26

### 2.1 Two installers that disagree about PATH

| Installer | Where it puts `creds` | PATH | Evidence |
|---|---|---|---|
| **Install… → Install `creds`** (the button — what the owner used) | `globalStorage/…/bin/creds[.exe]` | **never touched, on any OS — by design** | `binaryInstaller.ts:28-31`, `credsInstall.ts:9-12`, `binaryPath` `binaryInstaller.ts:64-66`; after install `installFlow.ts:40-43` only copies the path to the clipboard |
| **Copy install command for another machine…** (Windows) | `%LOCALAPPDATA%\Programs\creds` | **adds it to the user PATH** | `installCommand.ts:90-116`, the write at `:111-112` |
| same (Linux / WSL / macOS) | `~/.local/bin` | relies on the directory already being on PATH | `installCommand.ts:62-82` |
| `install.sh` (`curl \| sh` on a remote host) | `/usr/local/bin` or `$CREDS_PREFIX` | on PATH by convention; refuses macOS | `install.sh` |

The design sentence behind the button is *"writing an executable into a directory on somebody's PATH is a change to
their machine that outlives the extension and that nothing here would ever clean up"*. That is a reason **not to do it
silently**. It is not a reason to leave every other program unable to find the binary. `credsInstall.ts:5-7` says
*"on this machine … nothing needs installing"* because the extension ships `agentCli.js`. That is true for the
editor's own terminals, and #159 is the case it misses: a program started **outside** them.

### 2.2 The features that assume PATH without saying so

- **All 22 snippet bodies (20 languages)** start the CLI by bare name — e.g. C# `new ProcessStartInfo("creds")` at
  `configSnippetBodies.ts:26`. None of them says it needs `creds` on PATH.
- The **same text goes to agents**: `configSnippetResult` in `mcpSnippetRoute.ts:79-88` serves the one catalog, and
  the agent-facing instructions (`src_mcp/src/Tools.cs:36` `ConfigSnippetDescription`, and `Instructions` at
  `src_mcp/src/Program.cs:459`, wired at `:178`) say nothing about finding the binary.
- **Nothing warns in the UI**: `configCodePanel.ts:53-58` (`accessLine`) talks only about the key; the
  `config-entities` help (`helpEn.ts:151-157`) talks about losing the key and about tracked paths.
- **`coai`** runs bare `creds` from its own PATH — `dew_flow_connect_other_ais · src_mcp/src/Server/KeyVault.cs:28` —
  and reports a miss as *"the `creds` CLI is not installed on this machine"* (`KeyVault.cs:49-52`), which is false in
  exactly this case.

### 2.3 WSL

- **The bridge exists and works**: a Linux `creds` re-executes `creds.exe` through interop and carries its streams
  (`src_broker_client/src/WslInterop.cs`). The Windows binary is resolved by `CREDS_WINDOWS_BINARY` or else by the
  bare name `creds.exe` on the interop PATH (`WindowsBinary()`, `WslInterop.cs:126-129`). When neither works, the Linux
  CLI already says so: *"Put creds.exe on the PATH, or set CREDS_WINDOWS_BINARY"* (`src_cli/src/Program.cs:47-59`).
- **The extension sets the bridge up for `creds-mcp` only**:
  - `installFlow.ts:40` forks: the CLI returns, and only the MCP server reaches `offerMcpClientConfig`
    (`mcpInstallTarget.ts:33-121`).
  - That flow installs the Linux half into the distribution, asks `wslpath` for the Windows path, and writes
    `CREDS_MCP_WINDOWS_BINARY` into the client config.
  - `installArgv` hard-codes `creds-mcp` (`wslMcpInstall.ts:41-43`).
- **The SSH-agent relay** does reach the Windows `creds.exe`:
  - It passes `env CREDS_WINDOWS_BINARY=` on its own command line (`wslRelay.ts:72`), computed by
    `windowsCredsForWsl()` (`extension.ts:606-617`) from `binaryPath`.
  - It only **checks** whether a Linux `creds` exists (`src_vs_code/src/commands/wslRelayCommands.ts:107-146`,
    `credsIsInside`; its report is `whatIsMissing`, `wslRelayReadiness.ts:39`). The fix it offers (`:119`) is "copy
    the install command and run it there".
  - `windowsCredsForWsl` **composes** the WSL path (`toWslPath`), where `wslMcpInstall.ts:17-21` states the rule
    *"translated by `wslpath`, never composed here"*. Two answers to one question: a neighbour defect, §4 F5.

### 2.4 Measured on the owner's machine, 2026-09-26

| Probe | Result |
|---|---|
| `Get-Command creds` (Windows) | not found |
| `HKCU\Environment\Path` value kind | `ExpandString` (`REG_EXPAND_SZ`); 0 entries containing `%` |
| distributions (`wsl -l -q`) | `Ubuntu`, `Ubuntu-26.04`, `docker-desktop` (the last is filtered by `SYSTEM_DISTROS`, `wslRelay.ts:171-177`) |
| default distribution: `/mnt/c` entries on PATH | 35 — `appendWindowsPath` is on |
| default distribution: `command -v creds`, `command -v creds.exe` | neither found |
| default distribution: `~/.local/bin` on PATH | yes |

### 2.5 One fact that shapes every fix: an environment is inherited once

A process gets its environment when it starts and keeps it. A new user PATH written to the registry reaches programs
started **afterwards** from Explorer. It does not reach a VS Code that is already running, and so it does not reach
anything VS Code starts: its terminals, the Claude Code extension, or the MCP servers those spawn — `coai-mcp`
included. **So "added to PATH" is only true after VS Code and every MCP client restart.** A plan that does not say
this out loud reproduces #159 on the first try.

## 3. Owner decisions (2026-09-26)

| # | Decision |
|---|---|
| O1 | **Opt-in "Add `creds` to PATH"** — offered, never done silently; **Remove** undoes it. |
| O2 | **A stable location**, the one the published one-liners already use — `%LOCALAPPDATA%\Programs\creds\` on Windows, `~/.local/bin/` on Linux and macOS — not a PATH entry into `globalStorage`. |
| O3 | **WSL the way `creds-mcp` already works**: the install offers the distributions, installs the Linux half there, points it at the Windows half, **probes from inside the distribution**, and names the exact fix when a probe fails. |

## 4. Found on the way

| # | Finding | Where | Treatment |
|---|---|---|---|
| F1 | The one-liner reads the user PATH **expanded** and writes it back with `SetEnvironmentVariable`, which (to be measured, M1) stores `REG_SZ` — flattening any `%USERPROFILE%\…` entry into a literal path for good | `installCommand.ts:111-112` | fixed by sharing ONE PATH composer (§5.2) with the button |
| F2 | The same line decides "already present" with a **substring** match (`-notlike "*$dest*"`), so `…\Programs\creds-old` counts as `…\Programs\creds` | `installCommand.ts:112` | the shared composer matches whole entries, case-insensitively, trailing separator ignored |
| F3 | Updating a **running** `creds.exe` is expected to fail on Windows (`workspace.fs.copy` over a mapped image — not yet measured, M4); `creds relay` and `creds ssh … -- tail -f` run for hours, and at a location other programs use this becomes the common case | `binaryInstaller.ts:133` (`copy … overwrite: true`) | the update sequence in §5.1 |
| F4 | The button and the one-liner would now write the **same** file; neither can tell whose it is | O2 | an ownership marker, §5.1 |
| F5 | `windowsCredsForWsl` composes `/mnt/c/…` itself, against the rule the MCP bridge wrote down | `extension.ts:606-617` | **Owner decision 2026-09-26: switch it to `wslpath`**, through the existing `translateWindowsPath` (`wslProcess.ts:153`), in story C2 |
| F6 | `coai` calls a present-but-unfindable binary "not installed" | `coai · KeyVault.cs:49-52` | the paired `coai` plan |
| F7 | **Two editor builds share one file.** VS Code Stable and Insiders, or separate profiles, keep separate `globalState` (`binaryInstaller.ts:49-77`, `stateKey`) and would both target the one stable file. This is not the one-profile-many-windows case `crossWindowWrites.test.ts` covers | own review, §14 | install id + re-verify before acting, §5.1 |

## 5. Design

### 5.1 One install, in one of two places — `credsInstall.ts`, `binaryInstaller.ts`

- **`InstallRecord` gains `location: 'storage' | 'path'`, `installId` and `pathEntryAdded`.** An absent `location`
  reads as `'storage'`, so every record written today stays valid.
- **`binaryPath()` follows the record.** This is the one seam every caller already goes through: `runInstall`,
  `copyInstalledPath`, `removeInstall`, `installedRecord`, and `windowsCredsForWsl` (`extension.ts:611`), which feeds
  the SSH relay.
- **One copy, never two.** Choosing *Add to PATH* **moves** the binary: download to the stable directory, write the
  marker, then delete the storage copy. Update, Remove and Reinstall act on wherever the record says it is. Two copies
  would drift at the first update, and the stale one would be the one on PATH.
- **The stable directory is a pure function** `pathInstallDir(platform, env)` in `credsInstall.ts`:
  - Windows: `%LOCALAPPDATA%\Programs\creds`;
  - Linux / macOS: `$HOME/.local/bin`.

  A test asserts that it equals what `bashInstall` / `powershellInstall` write, so the button and the one-liner cannot
  drift apart. It stays `vscode`-free, because the uninstall hook (§5.6) imports it.
- **An ownership marker** `creds.owner.json` sits beside the binary:
  `{ installedBy: "creds-for-devs", version, sha256, installId, pathEntryAdded }`.
  - Remove and the uninstall hook delete a binary **only if its hash matches the marker**.
  - A `creds` there without a marker (the one-liner's, or the person's own) is never deleted. The menu says
    `A creds this extension did not install is at <path> — Replace it / Leave it`.
- **Another install may have acted since (F7).** Right before Update or Remove, the physical file is re-hashed and
  the marker's `installId` compared with this record's. On a mismatch, **surface it and act on nothing**:
  `creds at <path> was changed by another installation (another VS Code build or profile). Take it over / Leave it`.
  The record is never silently wrong about a file another build replaced.
- **Update of a running binary (F3), in an order that cannot lose the binary:**
  1. download and verify (checksum) to `creds.exe.new-<epochMs>` **in the same directory**;
  2. rename the current `creds.exe` → `creds.exe.old-<epochMs>` (Windows can rename a running image);
  3. rename `.new-*` → `creds.exe`;
  4. **if step 3 fails, rename the `.old-*` back**, and report;
  5. delete `.old-*` best-effort.

  The sweep, at the next install and at activation, deletes `.old-*` and `.new-*` **only while `creds.exe` exists and
  matches the marker**. Otherwise it leaves them, and the menu offers to restore. Linux and macOS use the same
  sequence; the rename is atomic there.
- **Permission failures change nothing.** EACCES or EPERM at the stable directory can come from a root-owned
  `~/.local/bin` after a `sudo pip`, or a locked-down corporate profile. Then the record stays `'storage'`, the
  storage copy is intact, and the message names the directory and the error. That locked-down profile applies to
  `globalStorage` too, which is also user-writable, so O2 is no worse there.
- **Who this is for:** only the CLI. `creds-mcp` is always named by full path in a client's config
  (`mcpClientConfig.ts:29-34`), so PATH buys it nothing.

### 5.2 Windows — one PATH composer, shared with the one-liner

- A pure `userPathEdit(op: 'add' | 'remove', dir)` returns the PowerShell. It is run by
  `powershell.exe -NoProfile -NonInteractive`, through the same launch helper `hostShell.ts:233-252` uses.
- **Read unexpanded**: `(Get-Item HKCU:\Environment).GetValue('Path', '', 'DoNotExpandEnvironmentNames')`.
- **Match whole entries**: split on `;`; compare case-insensitively; ignore a trailing `\`.
- **Append, never prepend.** Our binary must not shadow a same-named tool the person already has. If an earlier
  entry already holds a *different* `creds.exe`, say so (§5.3) rather than reorder their PATH.
- **Write as `ExpandString`** through `Microsoft.Win32.Registry`, so `%VAR%` entries survive (F1).
- **Only what we added is ours.** `pathEntryAdded` is set, in the record **and** the marker, only when the entry was
  absent and this extension wrote it. Remove and the uninstall hook delete the entry only when it is set. An entry the
  person or the one-liner added stays.
- **Broadcast `WM_SETTINGCHANGE`** so programs started from Explorer see it. How to do that without P/Invoke is M2.
- `powershellInstall` embeds the **same** text instead of its own two lines (`installCommand.ts:111-112`). One
  implementation, with F1 and F2 fixed for the people who already paste it.
- `setx` is never used: it truncates at 1024 characters.

### 5.3 Saying what is true afterwards (§2.5)

- **Verification is a fresh read, not the command's exit code**, and it has **four** results — three that need something said, and the one that is right:

  | State | How it is read | What the person is told |
  |---|---|---|
  | `absent` | no file at the stable location | *Install `creds`* |
  | `installedNotOnPath` | the file exists, but the entry is missing (Windows: the registry value, unexpanded; Linux/macOS: `$SHELL -lc 'command -v creds'` finds nothing) | `creds is at <path> but not on your PATH` + the exact fix: *Add to PATH* on Windows, the profile line elsewhere (§5.4) |
  | `shadowed` | the lookup resolves to a **different** file | `Another creds comes first on PATH: <path>` |
  | on PATH | resolves to ours | the message below |

- The message after *Add to PATH*:

  > `creds` is on your PATH now (`C:\Users\…\Programs\creds`). **Programs started from now on** find it. VS Code and
  > the MCP clients it started (Claude Code, Codex, `coai`) keep the old PATH until they restart — **Restart VS Code**.

  Buttons: *Restart VS Code* (`workbench.action.reloadWindow` reloads one window only, so the button text must be
  honest — M3 decides between "reload" and "quit and reopen"), *Copy the path*.
- **Terminals opened in this session** are fixed at once: `environmentVariableCollection.append('PATH', <delimiter>dir)`
  through `envCollectionRef.ts`, removed on Remove. **Local windows only** (`vscode.env.remoteName === undefined`). In
  a WSL or SSH window the collection reaches a Linux shell, where a Windows directory is garbage (`hostShell.ts:154`,
  `windowKind`).

### 5.4 Linux and macOS — copy, check, never edit a profile

- The binary goes to `~/.local/bin/creds` (§5.1). If the login-shell probe (§5.3) does not find it, **the extension
  does not edit `~/.profile` / `~/.zprofile`**. It shows the one line for the detected shell, with a Copy button:
  - bash / sh: `export PATH="$HOME/.local/bin:$PATH"` → `~/.profile`
  - zsh: the same line → `~/.zprofile`
  - fish: `fish_add_path ~/.local/bin`
- It names the two known traps:
  - **macOS** has no `~/.local/bin` on its default PATH, so this will be the common macOS answer.
  - **Ubuntu's** `~/.profile` adds the directory only if it existed **at login**, so the first install needs a new
    login, not just a new terminal.
- Editing someone's shell profile is the kind of change the original design sentence is right to refuse; showing the
  line keeps the person in control.

### 5.5 WSL (O3) — the Linux half, and a pointer it can read

**Why a pointer file rather than relying on the interop PATH:**
- The interop PATH is only as fresh as the `wsl.exe` that started the session (M5). It is off wherever
  `appendWindowsPath=false`. And it would make WSL depend on O1 having been accepted.
- `creds-mcp` avoided all of that with an explicit variable in its config block (`wslMcpInstall.ts:71-81`). The CLI
  has no config block, and a variable that must be set for *every* process in the distribution means editing profiles
  (§5.4 refuses that).
- So the Linux CLI learns **one more rung**.

**The resolution ladder — a pure function with its I/O injected** (own review, §14). Today `WindowsBinary()`
(`WslInterop.cs:126-129`) does no I/O. The new rung reads a file on every crossing, so the decision moves into a
static `WindowsBridge.Resolve(overrideValue, pointerPath, isRunnable, readPointer)`, the same shape as the `coai`
locator. `WindowsBinary()` only supplies the real readers. The rungs:
1. the override variable (unchanged);
2. **new**: the pointer file `PointerPath(env)` = `${XDG_CONFIG_HOME:-$HOME/.config}/creds/windows-binary`, one line
   holding the path as WSL sees it. It is used only if it can be read **and** names a runnable file. An unreadable
   pointer (`IOException` / `UnauthorizedAccessException`) or one naming a non-runnable file is **ignored with one
   stderr note naming the file**, in the style of `Program.Note`, and resolution falls through;
3. the bare name on the interop PATH (unchanged).

The pointer is **per binary**, like the variables. `CredsMcp` gets no pointer path and never reads one, and a test
pins that. It keeps its config-block variable. The reason is the one at `WslInterop.cs:30-50`: pointing one binary
somewhere must not silently redirect the other.

**The flow.** After the Windows install on a machine with distributions:
1. Ask **"Also make `creds` work inside WSL?"**, a multi-pick of `parseDistros` (`wslRelay.ts:171-177`), with *Not now*.
   `chooseAgentHome` (`mcpInstallTarget.ts:45-69`) is widened with a product and its wording (reuse, move 1) rather
   than copied.
2. For each distribution:
   - install the Linux half with `installArgv(distro, CREDS_CLI)`, `wslMcpInstall.ts:41-43` widened with a target;
   - read where it landed (`installedPathFrom`);
   - ask **`wslpath -a`** for the Windows binary's path (`wslPathArgv`, never composed);
   - `mkdir -p` the directory, then write the pointer with the path on **stdin** (`runWsl(argv, stdin)`,
     `wslProcess.ts:45`), never interpolated into a shell line. A failed write (e.g. a root-owned `~/.config`) is
     **named**: the distribution, the path, and what the shell said. That distribution is then not recorded as set up;
   - check the binary is new enough to read the pointer — `knowsTheBridge`'s pattern (`wslMcpInstall.ts:103-105`)
     applied to `creds --help` naming the pointer file — and warn by name if not, as `staleBinaryWarning` does for
     the MCP server.
3. **Probe, per distribution, from inside:**
   - `bash -lc 'command -v creds'` — found for a login shell?
   - `sh -c 'command -v creds'` — found by a non-login process? This is what an MCP server or `coai-mcp` inside WSL
     usually is.
   - one consent-free round trip that proves the Linux half reaches the window. Which verb does this is M6.

   Report each line OK or with its exact fix, as `ReadinessCheck` rows through `whatIsMissing` (`wslRelayReadiness.ts:39`).
4. **Remember which distributions were set up** in `globalState` (`credsInstall.wslDistros`). When the Windows binary
   **moves** (§5.1, storage ↔ path), rewrite their pointers; on Remove, offer to remove their Linux halves and pointers.

**The SSH relay benefits without a change of its own:** `windowsCredsForWsl` reads `binaryPath`, which now follows
the record. Its fix text (`commands/wslRelayCommands.ts:119`) changes from *copy the install command* to *run
Install `creds` and pick this distribution*.

### 5.6 Leaving cleanly — a `vscode:uninstall` hook

- `package.json` has none today (checked 2026-09-26). Add `"vscode:uninstall": "node ./out/uninstall.js"`, and make
  sure the bundle step ships that file in the `.vsix`.
- VS Code runs it with plain Node, no editor API, on the first start after the extension is removed (M7 checks that it
  runs at all).
- It removes **only what the marker proves is ours**:
  - the stable-location binary, if its hash matches `creds.owner.json`;
  - the marker itself, **including an orphaned marker whose binary is already gone**;
  - the PATH entry, **only if the marker's `pathEntryAdded` is true** (Windows, the §5.2 composer; exact entry only).
- It never touches WSL. The help page names `~/.local/bin/creds` and the pointer file as what an uninstall leaves
  inside a distribution.
- **Between epic A's release and epic C's**, there is no hook yet. The `cli` help carries one interim line, *Remove
  `creds` before uninstalling the extension*, and C3 replaces it.
- This is what answers the original design sentence: the change now outlives the extension only in WSL, and there it
  is documented.

### 5.7 The code-access feature says what it needs — to people and to agents

- **Panel** (`configCodePanel.ts:53-58`): one more line when `creds` is not on the **persisted** PATH, read through
  §5.3's verifier. It does not use `onPath` (`installFlow.ts:91-102`), because that checks the extension host's stale
  environment (§2.5).

  > These snippets start `creds` by name. It is not on this machine's PATH yet — **Add `creds` to PATH**, or replace
  > `"creds"` with the full path: `<path>`.

- **Every snippet body** gets one comment line in its language: *needs `creds` on PATH — or replace "creds" with its
  full path*. A snippet is pasted into a repository and read months later, without the panel.
- **The agent route** (`mcpSnippetRoute.ts:79-88`) gains an **additive** `cli: { onPath: boolean, path: string }`,
  supplied by the caller so the route stays pure.
- **And the agent is told to use it** (gate finding 7). `ConfigSnippetDescription` (`src_mcp/src/Tools.cs:36`) and
  `Instructions` (`src_mcp/src/Program.cs:459`) say: when the answer carries `cli` and `cli.onPath` is false, start
  the CLI by `cli.path`, never by the bare name. Tests assert both texts name the field, the pattern at
  `ToolsTests.cs:127-130` / `StartupTests.cs:86`. That is an **mcp-v** release, cut after the extension release that
  carries the field.
- **Help**: `cli` (`helpEn.ts:191-197`) gets the PATH choice and the restart sentence; `config-entities`
  (`:151-157`) gets the prerequisite; a new `cli-in-wsl` topic is the CLI twin of `mcp-in-wsl` (`:143`). English and
  Russian complete (Russian is enforced by `helpContent.test.ts:114`); uk/de/es translated or visibly falling back
  (`:60-87`).

## 6. The contract this plan publishes, for the `coai` plan

**The stable location is public.** `%LOCALAPPDATA%\Programs\creds\creds.exe` and `~/.local/bin/creds` are where
`creds` lives when a person chose PATH or ran the one-liner. `coai` may probe them after its own PATH lookup fails. It
must not probe `globalStorage/…`: that path depends on the editor build (Code, Insiders, VSCodium, Cursor), the
profile and portable mode, and it is private to this extension. Written down in `research/module_extension.md`
§Install and in the README's *`creds` on another machine* section (`README.md:149`), in epic A, so a change to it is
visibly a contract change.

## 7. What must be measured first

| # | Question | How | Decides | Epic |
|---|---|---|---|---|
| M1 | Does `[Environment]::SetEnvironmentVariable('Path', …, 'User')` store `REG_SZ` and expand `%VAR%` entries, on Windows PowerShell 5.1 and on pwsh 7? | a scratch user variable holding `%USERPROFILE%\x`, then `GetValueKind` and the unexpanded value | F1's severity, and the break-it test for §5.2 | A1 |
| M2 | The cheapest reliable `WM_SETTINGCHANGE` broadcast from PowerShell without compiling P/Invoke (e.g. setting and removing a scratch user variable through `SetEnvironmentVariable`) | a freshly started `cmd` from Explorer sees the new PATH | §5.2's last step | A1 |
| M3 | Does "Reload Window" hand a window the new PATH? Almost certainly not — the extension host inherits the main process. What does? | reload vs full quit | the button's honest label | A3 |
| M4 | Does `workspace.fs.copy(…, { overwrite: true })` over a running `creds.exe` fail, and does the §5.1 rename sequence work? | start `creds relay`, update | F3 | A2 |
| M5 | Does a new `wsl.exe` started from a VS Code launched **before** the PATH change see the new entry through interop? | owner's machine, `Ubuntu` | confirms the pointer file is needed, not merely nicer | C1 |
| M6 | Which CLI verb proves a round trip to the window **without** raising a consent modal? | `src_cli/src/CommandLine.cs` verbs against a live window | the probe in §5.5 step 3 | C2 |
| M7 | Does `vscode:uninstall` run on 1.93 (the `engines` floor) and on current stable, and with which cwd? | install, uninstall, restart | §5.6 — if it does not run, §5.6 becomes a documented manual step, rewritten rather than footnoted | C3 |

## 8. Growth budget

| Surface | Size | Retired by |
|---|---|---|
| The stable-location binary | one AOT file (the release asset's size) — **moved**, not copied, so the total on disk is unchanged | Remove; the uninstall hook |
| `creds.owner.json` | < 300 bytes | with its binary; an orphan by the hook |
| `creds.exe.new-*` / `.old-*` (update) | at most one pair per interrupted update | the sweep, only while the main binary matches the marker (§5.1) |
| PATH entry | one | Remove / the hook, only when `pathEntryAdded` |
| WSL: Linux binary + pointer per distribution | one AOT file + < 300 bytes, per chosen distribution | Remove offers to delete them; an uninstall cannot (§5.6), and the help page says so |
| `credsInstall.wslDistros` | one name per distribution set up | Remove clears it |

No in-flight state is introduced, so there is nothing for a sweep to strand. The one interrupted case — a crash
between writing the new file and deleting the storage copy during a move — leaves two copies with the record naming
the old one. The next menu open sees a marker-matching file at the stable location and offers to finish the move.

## 9. Security

- **Trust is unchanged.** `creds` holds no secret, and every action it asks for is performed by the window, behind
  the consent modal. Putting it on PATH lets more programs *ask*; it lets none of them *have*.
- **The pointer file** is in the same trust domain as `~/.local/bin/creds` itself: anyone who can rewrite it can
  already replace the binary. It is read only if it exists and names a runnable file. It is never evaluated by a
  shell.
- **Nothing crosses a shell as text:**
  - the PATH composer receives a directory this extension computed;
  - `quoteFor` still applies (`hostShell.ts:117`);
  - WSL paths travel as argv (`wslpath`) or stdin (the pointer).
- **Append, never prepend** (§5.2): the only change to lookup order is at the end.
- **Remove never deletes what it cannot prove it wrote**: the binary is deleted by hash, the PATH entry by
  `pathEntryAdded`, and nothing at all is deleted after a foreign change (F7).

## 10. Build order — three epics, three stories each

**Split per the gate's order, and done by Fable** (the gate's model order for the split; §14). Each epic has its own
branch, starting from the previous epic's final commit. Each gets one `review_plan` with its own section of this plan
(`plan: todo/PLAN_creds_cli_reachable_from_every_caller.md`, `epic: k/3`) and one `review_code` over its whole
committed diff. There is no gate per story. **Rebase first:** the branch `feat/159-creds-on-path` was created at
`4d35afa`, two shared-rules commits behind `origin/main` (`be3b165`), so it is rebased before A1.

### Epic A — one `creds`, at the stable location, on this machine
Branch `feat/159-creds-on-path`. Measures M1–M4. **Releases one extension minor, at A3.**

| Story | Content | Carries |
|---|---|---|
| **A1** Pure decisions + tests | `InstallRecord.location` / `installId` / `pathEntryAdded`; the marker; `pathInstallDir` and its test against both one-liners; `userPathEdit` (red-first F1/F2 against `installCommand.ts:111-112`); the §5.3 four-result `verifyPath` interpreter (`absent` / `installedNotOnPath` / `shadowed` / `onPath`); the §5.1 update state machine and sweep predicate; `foreignChange(record, marker, hashOnDisk)`; the permission-failure sentence; the profile line per shell. M1, M2 measured before any composer runs. | the pure halves of every §5.1–5.3 rule |
| **A2** The location core, and Linux/macOS complete | `binaryPath()` follows the record; the move and its interrupted-move recovery; the update sequence (after M4, on Windows); re-verify before Update/Remove; EACCES/EPERM changes nothing; unmarked file → Replace/Leave; the Linux/macOS probe and profile line. *Add to PATH* offered on linux/darwin, win32 gated until A3. New harness `scripts/creds-install-itest.cjs`, a sibling of the existing `creds-cli-itest.cjs` (vscode and `fetch` stubbed, temp HOME/LOCALAPPDATA): move, marker mismatch, foreign change, rename-aside while a real `creds` runs (win32 branch), EACCES via `chmod 555` (POSIX branch). | — |
| **A3** Windows — the PATH entry by consent | `userPathEdit` run through `hostShell.ts:233-252`; `WM_SETTINGCHANGE` per M2; registry re-read → the four §5.3 results; `pathEntryAdded` written only when we wrote the entry; §5.3 message and button (M3); the terminal collection, local windows only; `powershellInstall` on the shared composer; the real composer run against a scratch `HKCU` variable, win32-gated in the harness and recorded here; `cli` help + the interim uninstall line. | **extension minor** |

**Epic A DoD:**
- M1–M4 recorded, and any line a measurement contradicted rewritten.
- Watched failing first: the F1/F2 composer test, and "Remove never deletes an unmarked `creds`".
- `npm test` green. Windows and Linux exercised by hand; macOS stated as untested if no Mac was available.
- `research/module_extension.md` §Install carries the §6 contract; README `README.md:149`; `src_vs_code/CHANGELOG.md`.
- `module_tests.md` rows for `creds-install-itest.cjs`, listing what it does not cover: restart semantics (M3), the
  broadcast's reach into an Explorer-started process (M2 is a manual observation), and ACL-based EACCES on Windows.
- The paired `coai` plan's §6 paths match character for character.

### Epic B — code access says what it needs, to people and to agents
Branch `feat/159-code-access-names-path`, from A's final commit. No measurements (it uses A's verifier). **Releases
an extension minor, then an mcp-v minor.**

| Story | Content | Carries |
|---|---|---|
| **B1** Extension: panel, snippets, route, help | §5.7's panel line through `verifyPath`; the comment line in all 22 `SNIPPET_BODIES` (red-first loop); the additive `cli` field (additivity test); `config-entities` help; one `creds-mcp-itest.cjs` check that `creds_config_snippet`'s body carries `cli.onPath` / `cli.path` through the real binary. | **extension minor** |
| **B2** `creds-mcp`: the agent is told | `Tools.cs:36` and `Program.cs:459` name `cli.path` / `onPath`; tests in the `ToolsTests.cs:127-130` / `StartupTests.cs:86` pattern. Conventional commit; release-please cuts mcp-v (`src_mcp/RELEASES.md` is generated). | **mcp-v minor**, after B1's release is published |

**Epic B DoD:**
- The snippet loop watched failing for all 22; Russian help complete.
- `dotnet build` 0 warnings; the mcp tests green.
- The extension release published before the mcp-v PR merges.
- A `module_tests.md` row for the itest check; `module_extension.md`'s code-access section names the `cli` field.

### Epic C — `creds` inside WSL, and leaving cleanly
Branch `feat/159-creds-in-wsl`, from B's final commit. Measures M5–M7. **Releases a cli-v minor (C1), then one
extension minor (C2 + C3).**

| Story | Content | Carries |
|---|---|---|
| **C1** CLI: the pointer rung | `WindowsBridge.Resolve(…)` pure with injected I/O; `PointerPath(env)`; the defensive read with one stderr note; `CredsMcp` never reads a pointer; `CommandLine.HelpText` names the pointer file (the stale-binary signal); xUnit v3 tests in `src_broker_client/tests`. M5 measured here. | **cli-v minor**, tagged with assets before C2's stale check is written |
| **C2** Extension: the WSL flow | §5.5's flow: widened `chooseAgentHome` and `installArgv`, `wslpath`, `mkdir -p` + pointer on stdin with a named failure, `knowsThePointer` + stale warning, three probes as `ReadinessCheck` rows (M6), `credsInstall.wslDistros`, pointer rewrite on move, Remove's cleanup, the relay fix text (`commands/wslRelayCommands.ts:119`), `cli-in-wsl` help, and F5: `windowsCredsForWsl` asks `wslpath` through `translateWindowsPath` instead of composing (owner decision), with a test that no `/mnt/` literal is composed. New harness `scripts/creds-cli-wsl-itest.cjs`, a sibling of `creds-mcp-wsl-itest.cjs`: the Linux `creds` built in the distribution, a pointer in a temp `XDG_CONFIG_HOME`, `sh -c 'creds ls'` reaching a Windows broker; an unreadable pointer gives one stderr note, then the PATH rung. | — (ships with C3) |
| **C3** The `vscode:uninstall` hook | §5.6: plain Node, reuses `pathInstallDir`; binary by hash, orphan marker, PATH entry only with `pathEntryAdded`, never WSL; M7; the interim help line removed. Harness: `node out/uninstall.js` over a temp dir in `creds-install-itest.cjs`. Then §11's end-to-end row on the owner's machine, and promotion. | **extension minor** (with C2) |

**Epic C DoD:**
- M5–M7 recorded.
- The broker-client tests green; `dotnet build dew_flow_creds_for_devs.slnx` 0 warnings.
- The cli-v tag with assets exists before `knowsThePointer` is written.
- WSL exercised by hand in `Ubuntu`: both probes and the round trip.
- §11's whole-issue row recorded, including `coai providers` with the paired plan.
- `module_extension.md` §WSL and §Install (uninstall); `module_tests.md` rows for both new harnesses, with reasons for
  anything not in CI (WSL + .NET SDK, the existing reason).
- The plan promoted with its deviations (`/promote-plan`).

### Ordering constraints

1. **A → B → C** by branch base. B's panel and route need A's verifier and the record-following `binaryPath()`; C's
   pointer content and rewrite-on-move need the same; C3 reads the `pathEntryAdded` that A3 writes.
2. **Within B:** the extension release carrying `cli` ships before the mcp-v release whose instructions name it —
   nothing is claimed before it exists.
3. **Within C:** cli-v (C1) is released before C2, whose stale check needs a real release to be true against; C3
   comes after C2.
4. **Measurements gate code:** M1/M2 before the composer, M4 before the rename sequence, M3 before the button, M5
   before the rung, M6 before the third probe, M7 before the hook's help text is final.
5. **Across repositories:** `coai`'s rung 3 can ship any time after epic A's release; the §6 contract is written in
   epic A.

**If a story proves too big** (Fable's note): A2 can move `creds-install-itest.cjs` to A3; C2 can move the
`cli-in-wsl` help and the relay text to C3.

## 11. Test plan

| Guarantee | Test | Red first? | Epic |
|---|---|---|---|
| A record with no `location` reads as storage; `binaryPath` follows the record | `binaryInstaller` / `credsInstall` tests | new | A |
| `pathInstallDir` equals the directory both one-liners write | `installCommand.test.ts` | new | A |
| The PATH composer keeps `%VAR%` entries, matches whole entries, appends, and removes exactly its own | `userPathEdit` tests over sample values, plus **one real run** against a scratch `HKCU` variable, gated on `win32` — the extension CI is Linux-only (`ci-extension.yml:28`), so the implementer runs it on Windows and records the output here | **yes** — F1 and F2 against today's two lines | A |
| The PATH entry is removed only when `pathEntryAdded` | pure test + harness | new | A |
| Remove never deletes a `creds` without a matching marker | `binaryInstaller` test over a temp dir | new | A |
| A foreign change (another build's `installId`, or a different hash) is surfaced and nothing is acted on | pure `foreignChange` test + harness | new | A |
| An update that fails at any step leaves a runnable `creds` | the update state machine, every failure point | new | A |
| EACCES/EPERM changes nothing and names the directory | harness, POSIX branch | new | A |
| All four verification results (`absent`, `installedNotOnPath`, `shadowed`, `onPath`), per OS | `verifyPath` tests | new | A |
| The profile line is right per shell, and no file is ever written | pure test | new | A |
| Terminal collection only in a local window | test over `remoteName` values, as `hostShell.test.ts` does for `windowKind` | new | A |
| Every snippet body names the PATH prerequisite | a loop over `SNIPPET_BODIES` | **yes** — fails for all 22 today | B |
| The agent route carries `cli` and is additive | `mcpSnippetRoute` test | new | B |
| Both agent-facing texts name `cli.path` | `ToolsTests` / `StartupTests` | **yes** | B |
| The pointer rung: override > pointer > PATH; unreadable or non-runnable pointers are ignored with one note; `CredsMcp` never reads one | `WslInterop` tests (C#, xUnit v3) over the pure `Resolve` | new | C |
| The WSL flow asks `wslpath`, writes the pointer via stdin, names a failed write, warns on a stale binary, and reports each probe line | `wslCliInstall.test.ts`, the shape of `wslMcpInstall.test.ts` | new | C |
| The uninstall hook: binary by hash, orphan marker, PATH entry only with `pathEntryAdded` | harness over a temp dir | new | C |
| Help: English complete, Russian complete (`helpContent.test.ts:114`), uk/de/es translated or visibly falling back (`:60-87`) | `helpContent.test.ts` | yes, until Russian is written | A–C |
| **End to end, the issue itself** | on the owner's machine: install → *Add to PATH* → restart → a fresh `cmd` resolves `creds`; `coai providers` lists the vault as available (with the paired `coai` plan); in `Ubuntu`, `sh -c 'creds …'` reaches the window | recorded in this plan at promotion | C |

## 12. Not doing, and why

- **No shell-profile edits, no `HKLM`, no `setx`** — §5.2, §5.4.
- **No PATH entry into `globalStorage`** — O2; it breaks with the editor build and dies with the extension.
- **No change to what `creds-mcp` does in WSL** — it already works, and its config-block variable stays its own.
- **No `coai` code here** — the paired plan owns it. This plan owns only the contract it relies on (§6).
- **No custom install directory** — the gate suggested one for locked-down profiles. It would make §6's contract a
  per-person path and send the `coai` probe back to guessing. A locked-down profile keeps the storage install, and the
  message says why.

## 13. Definition of Done (the whole plan; each epic's own DoD is in §10)

- [ ] M1–M7 measured and recorded here; any design line a measurement contradicted is rewritten, not footnoted.
- [ ] Every red-first row of §11 was watched failing, and the summary reports the failure message and the pass.
- [ ] `dotnet build dew_flow_creds_for_devs.slnx` with 0 warnings; the server test executable, the broker-client
      tests, the mcp tests and `npm test` are green.
- [ ] Windows, Linux and WSL each exercised by hand once, the result recorded (§11, last row); macOS stated as
      untested if no Mac was available.
- [ ] `research/module_extension.md`, `research/module_tests.md`, README, the help files and
      `src_vs_code/CHANGELOG.md` updated. The cli and mcp notes come from conventional commits through release-please.
- [ ] The paired `coai` plan names this one, and the §6 contract matches in both.
- [ ] Each epic: `review_plan` on its branch before its first story, `review_code` over its committed diff; every
      finding resolved; verdicts and reviewer counts reported.
- [ ] `plan-lifecycle.mjs` and `pin-check.mjs` pass; promoted with deviations when epic C ships.

## 14. Review record

**Plan gate, 2026-09-26** — session `04b3d21f`, branch `feat/159-creds-on-path`, one round over the whole plan,
verdict `good_enough`, **all 3 reviewers answered** (codex, gemini, local). 11 findings: **8 accepted, 3 rejected.**

| # | Finding (reviewer) | Decision |
|---|---|---|
| 0 | the stdin pointer write may be lost; echo it in `sh -c` instead (local) | rejected — `runWsl` resolves after the child exits and `cat` reads to EOF; the proposed fix is the shell interpolation §9 forbids |
| 1 | verification treats "exists but not on PATH" as "not installed" (local) | accepted — §5.3 four results |
| 2 | an orphaned marker survives uninstall (local) | accepted — §5.6 |
| 3 | the probe races the pointer write (local) | rejected — the writer has exited before the probe starts, on one filesystem; a retry would only hide a real fault |
| 4 | no restart warning (local) | rejected — already §5.3's message |
| 5 | the rename-aside update can lose the binary (codex) | accepted — §5.1 update order with rollback and a guarded sweep |
| 6 | Remove deletes a PATH entry it did not add (codex) | accepted — `pathEntryAdded` in the record and the marker |
| 7 | the `cli` field has no consumer in the agent instructions (codex) | accepted — §5.7, story B2, an mcp-v release |
| 8 | no scenario harness or `module_tests.md` rows (codex) | accepted — harnesses in A2 and C2, rows in each epic's DoD |
| 9 | EACCES/EPERM at the stable directory (gemini) | accepted — §5.1; the custom-directory part declined (§12) |
| 10 | the pointer write and read under bad permissions (gemini) | accepted — §5.5 named write failure, defensive read |

**The gate's orders for this plan, as applied:**
- **split into 2–3 epics of 2–3 stories:** applied, §10.
- **the split made by Fable:** applied. The split is Fable's, and its citation corrections were verified and folded
  in: `commands/wslRelayCommands.ts`, `wslRelayReadiness.ts:39`, `Program.cs:459`, and only `src_vs_code` having a
  hand-written CHANGELOG.
- **stories on Opus, security-sensitive ones on Fable:** recorded for the implementer. A2, A3 and C3 touch the
  person's PATH and delete files, so they go on Fable.
- **consult once per three epics:** due before epic A is built.

**Own review, 2026-09-26** (a separate code-reviewer pass against the code):
- **High:** two editor builds share one stable file → F7, §5.1 install id and re-verify.
- **Medium:** the pointer rung turns a pure property into hot-path I/O → §5.5 pure `Resolve` with injected readers.
- **Checked and clean:** the Remote-SSH *Install `creds` on the Host* flow (`remoteCliInstall.ts`) runs entirely on
  the remote host and never touches `binaryPath` or `InstallRecord`.
