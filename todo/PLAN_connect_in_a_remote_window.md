# PLAN — Connect SSH composes for the WRONG machine in a remote window

> Status: **built and verified, 2026-09-17 — NOT yet promoted, because it is not yet on `main`.**
> Every story is written, the suite is green (4391 tests, 4387 pass, 0 fail, 4 skipped) and the
> integration test has been RUN on a real Windows + WSL machine: twenty checks, all `ok`, quoted in
> §Test plan. It stays in `todo/` deliberately — `research/` describes the system as it IS, and this
> lives on `fix/ssh-connect-in-a-remote-window`, which has not been pushed. **Promote it when the
> branch lands**, carrying the open tail with it: nobody has clicked *Connect* in a real VS Code
> window attached to WSL, so the last centimetre — VS Code creating the terminal and posting the
> line into it — has only ever been exercised by a stub; and the viewer's copyable `ssh` line is
> still composed for the host (§What this deliberately does NOT change).
>
> Four `coai` rounds so far: the plan round (2 of 3 reviewers; 12 findings, all accepted), S1's code
> round (12 reviewers; 24 findings, 11 accepted), Epic 2/3's plan round (3 reviewers; 17 findings,
> 6 accepted) and its code round (12 reviewers; 49 findings, 14 accepted). Every round is recorded
> in §Story log with what it changed and what was declined.
>
> Scope, as built: four new modules — `remoteWindow.ts`, `remoteRoute.ts`, `remoteWindowMessage.ts`
> (all `vscode`-free) and `remoteConnectHost.ts` (the thin `vscode` reader); changes to
> `sshConnect.ts`, `terminalManager.ts`, `wslProcess.ts`, `wslRelay.ts`, `sshAgentManager.ts`,
> `sshUseActions.ts`, `commands/agentCommands.ts` and `extension.ts`; and the help article in five
> languages.
>
> Related: [PLAN_wsl_agent_relay.md](../research/PLAN_wsl_agent_relay.md) (the crossing this rides),
> [PLAN_remote_broker_bridge.md](../research/PLAN_remote_broker_bridge.md) (the parent plan; this is
> the "Г-2" it named and left open), [PLAN_tails_2.md](PLAN_tails_2.md) §2.3 (which states the same
> `extensionKind: ui` consequence and owes the README/help half),
> [module_extension.md](../research/module_extension.md), [module_tests.md](../research/module_tests.md).
> The boundary between all four is §Boundary with the related plans, and it is written into each of
> them, not only here.

## The symptom

Reported 2026-09-17 by the owner, with a screenshot. *Connect SSH* on the same entity:

| window | result |
|---|---|
| VS Code on Windows | connects |
| VS Code attached to WSL | `Warning: Identity file c:\Users\strug\AppData\Roaming\Code\User\globalStorage\remsoftdev.creds-for-devs\keys\23284\<guid>.key not accessible: No such file or directory.` |

## The cause, and it is one sentence

**Nothing on the connect path ever asks where the command will run.** The line is composed for the
machine the *extension host* runs on and posted into the *window's* terminal, and in a remote window
those are two different operating systems:

- [terminalManager.ts:13](../src_vs_code/src/terminalManager.ts) — `buildSshCommand(entity, process.platform, options)`.
  `process.platform` is the extension host's, and `extensionKind: ["ui"]`
  ([package.json:49](../src_vs_code/package.json)) pins that host to Windows even in a WSL window.
- [terminalManager.ts:31](../src_vs_code/src/terminalManager.ts) — `createTerminal({ name })` with no
  `shellPath`: that is the *window's* default profile, i.e. the shell inside the distribution.
- [keyInstaller.ts:130](../src_vs_code/src/keyInstaller.ts) writes the key under
  `globalStorageUri.fsPath/keys/<pid>/` — a Windows path — and
  [sshCommand.ts:124](../src_vs_code/src/sshCommand.ts) pastes it after `-i`, quoted by the **win32**
  branch of `shellQuote` ([sshCommand.ts:80](../src_vs_code/src/sshCommand.ts)).

`vscode.env.remoteName` is read in exactly ONE place in the extension —
[keyringWarningHost.ts:22](../src_vs_code/src/keyringWarningHost.ts) — and its consumer
`keyringMayBeUnprotected` ([keyringWarning.ts:42-47](../src_vs_code/src/keyringWarning.ts)) does not
even look at the field. So the product has never asked the question this defect is about.
`PLAN_remote_broker_bridge.md:106-109` recorded exactly that as obstacle **Г-2** and it is still true.

## It is five breakages, not one

The `-i` is merely the one that shows. All five have the same cause and must be fixed together, or
the fix moves the error one argument to the right.

| site | what a WSL window gets |
|---|---|
| [sshConnect.ts:38](../src_vs_code/src/sshConnect.ts) | `sshClientPresent()` probes **Windows** `ssh.exe` and the Windows `PATH` — it vouches for a client the terminal will not use, and would offer to install one on the wrong machine |
| [sshCommand.ts:124](../src_vs_code/src/sshCommand.ts) | `-i "c:\…\<guid>.key"` — the reported symptom |
| [sshCommand.ts:161](../src_vs_code/src/sshCommand.ts) | a **pinned host key** passes `UserKnownHostsFile="c:\…\known_hosts-<id>"`, so B10's protection silently fails open |
| [sshConnect.ts:87-95](../src_vs_code/src/sshConnect.ts) | the **password** branch writes `askpass.bat` and exports `SSH_ASKPASS` to a Windows path |
| [sshProgram.ts:171](../src_vs_code/src/sshProgram.ts) | with `agentForward`, the program word becomes `C:/Windows/System32/OpenSSH/ssh.exe` |

And the one branch that already behaves — [sshConnect.ts:57-62](../src_vs_code/src/sshConnect.ts),
where the agent serves the key and **no `-i` is emitted at all** — is the shape the fix generalises.

## Measured before it was designed (2026-09-17)

Everything below was observed on the owner's machine, not reasoned. It killed the obvious fix.

1. **Translation works.** `wslpath -a 'C:\…\probe.key'` → `/mnt/c/Users/strug/…/probe.key`.
2. **And it is useless on its own.** That file lists as `-rwxrwxrwx` inside WSL: `/mnt/c` is
   `9p` / DrvFs mounted **without `metadata`** (`mount` output:
   `type 9p (rw,noatime,aname=drvfs;path=C:\;uid=1000;gid=1000;…)`), so every file on it is 0777.
3. **`chmod 600` on it is a silent no-op** — the file is still `-rwxrwxrwx` afterwards.
4. **So OpenSSH refuses the key**, which is the whole point:
   `ssh-keygen -y -f /mnt/c/…/probe.key` answers
   `Permissions 0777 for '…' are too open. … This private key will be ignored.` /
   `Load key "…": bad permissions`.

   > Consequence to state plainly: **"just translate the path" cannot be the fix.** Any route that
   > makes `ssh -i` work inside WSL has to put the key on a filesystem where a mode sticks — which
   > means the private key inside the distribution, which is the widening this product has refused
   > everywhere else. The remaining route is the one already built: don't pass a key at all.

5. **The remote authority is lowercased.** VS Code records `wsl+ubuntu` (every occurrence under
   `%APPDATA%\Code`), while `wsl -l -q` answers `Ubuntu`, `docker-desktop`, `Ubuntu-26.04`. Any match
   between the window's distro and `wslRelayDistros` / `WslRelayManager`'s keys must therefore be
   **case-insensitive**, or the relay socket is looked up under a name that is never found.
6. **The relay half is present but idle here**: `creds` is installed inside the distribution
   (`/home/jinx/.local/bin/creds`), `credSshManager.wslAgentRelay` is `false`, and no
   `creds-agent.sock` exists. So the honest message has a real remedy to offer, and this is the
   common state rather than an edge case.

## Decisions, settled — not left open

The first plan round refused this plan for leaving two decisions to the implementer, and it was
right: both change the observable behaviour, so two implementations could follow the plan and
disagree. Settled here, under stated assumptions, rather than blocking on a question.

- **DEC-1 — the refusal offers to fix itself, in one click.** When the relay is off but everything
  else is present, the message's primary button turns it on and connects, rather than sending the
  person to the palette. Assumption: acceptable because `credSshManager.setUpWslRelay` is already
  idempotent, already asks before touching `~/.bashrc`, and the setting it writes is the one the
  person is being told about. The refusal is still a refusal — nothing happens without the click.
- **DEC-2 — `ssh -A` is unchanged on the relay route**: allowed, carrying the warning
  `PLAN_wsl_agent_relay.md:93-95` already attaches to it. Assumption: this plan is about *where* a
  command runs, and silently narrowing agent forwarding would be an unrelated policy change.

## Design

Owner decisions taken 2026-09-17: **route stored keys through the agent relay, refuse honestly
everywhere else**, and **detect every remote window kind**, not only WSL.

### D1. One new pure module: `remoteWindow.ts` (imports no `vscode`)

Per repository rule 3, the decision is pure and the `vscode` reads happen at the call site.

```ts
export type WindowSide =
  | { kind: 'local' }
  | { kind: 'wsl'; distro: string }
  | { kind: 'other'; remoteName: string };

export function windowSide(
  remoteName: string | undefined,
  authorities: readonly string[],
  configuredDistros?: readonly string[],   // credSshManager.wslRelayDistros
  servingDistros?: readonly string[],      // WslRelayManager.serving()
): WindowSide;
```

`remoteName` is `undefined` locally, `'wsl'`, `'ssh-remote'`, `'dev-container'`,
`'attached-container'` or `'codespaces'`.

**The distro is resolved by a ladder, not by one lookup** — the plan round was right that one
workspace folder is not a reliable source:

| rung | source | when |
|---|---|---|
| 1 | every workspace folder authority (`vscode-remote://wsl+ubuntu/…` → `ubuntu`, measured) | the ordinary case |
| 2 | **all folders must agree** | a multi-root workspace spanning two distributions yields `{ kind: 'wsl', distro: '' }` **and a distinct refusal reason** (`'distro-ambiguous'`) — connecting to an arbitrary one of them would be a guess about which agent socket to use |
| 3 | the ONE relay that is running, else the single known distribution | a rootless window (a single file, an empty window): no authority exists. A running relay is consulted **first** and outranks the configured list — S1's code round found that two configured distributions with one relay up was refused into a picker while the socket wanted was the only one that existed |
| 4 | `''` — the "whatever WSL calls default" sentinel `WslRelayManager` already uses (`wslRelayManager.ts:44`), carrying **no** problem | nothing is configured and nothing is running. Deliberately not `'distro-unknown'`: the person here has never switched the relay on, so the honest message is the relay's own, not a distribution picker — the circle `wslRelayReadiness` exists to avoid. Several known and none running is `'distro-unknown'` |

Every comparison lowercases both sides (measurement 5). `distro: ''` is never allowed to *silently*
pick a socket when more than one relay is running — that was the plan round's sharpest catch.

### D2. `buildSshCommand` is given the TERMINAL's platform, not the host's

This is the core of the fix and it changes no signature: the parameter already exists and is simply
fed the wrong value.

```ts
export function terminalPlatform(
  side: WindowSide,
  hostPlatform: NodeJS.Platform,
): NodeJS.Platform | undefined;   // undefined = nothing may be composed for this window
```

[terminalManager.ts:13](../src_vs_code/src/terminalManager.ts) and
[sshConnect.ts:81](../src_vs_code/src/sshConnect.ts) pass `terminalPlatform(side, process.platform)`.
That one substitution fixes the quoting branch
([sshCommand.ts:80](../src_vs_code/src/sshCommand.ts)) and the program word
([sshProgram.ts:171](../src_vs_code/src/sshProgram.ts)) together, because both already take the
platform as an argument.

> **`undefined`, not `'linux'`, for everything else** — corrected by S1's code round. The first
> draft answered `'linux'` for every non-local window on the reasoning that the route refuses the
> other kinds first. That hard-codes one caller's policy into a general function, and it is wrong on
> its own terms twice: a Remote-SSH host can be Windows, and a WSL window whose distribution could
> not be resolved has no shell to name either. An answer that is correct only because somebody else
> remembered to refuse first is the exact shape of defect this plan exists to fix, so the refusal is
> carried by the type instead.

### D3. The route decision, also pure — and it reports EVERY missing piece

The plan round killed the first shape of this: `relaySocket: string` alone cannot tell "the relay is
switched off" from "it is on but not running", and a single `reason` cannot keep D7's promise to list
everything missing at once. So the input is a readiness record and the output is an ordered list.

```ts
export interface RelayReadiness {
  enabled: boolean;          // credSshManager.wslAgentRelay
  running: boolean;          // WslRelayManager.serving() includes this distro
  socket: string;            // socketPathFor(distro), '' until the relay has said
}

export type RefusalReason =
  | 'not-wsl'                      // ssh-remote, dev-container, attached-container, codespaces
  | 'distro-ambiguous'             // multi-root across distributions (D1 rung 2)
  | 'distro-unknown'               // no authority, several relays (D1 rung 4)
  | 'relay-off'                    // the setting is false
  | 'relay-not-running'            // enabled, no socket yet
  | 'agent-has-no-key'             // the agent does not serve this entity's key
  | 'credential-is-a-password'     // askpass cannot cross
  | 'credential-is-a-key-path'     // a path on the Windows disk
  | 'known-hosts-translation-failed';

export type ConnectRoute =
  | { kind: 'compose' }                                  // local: exactly today's behaviour
  | { kind: 'agent'; socketPath: string }
  | { kind: 'refuse'; reasons: readonly RefusalReason[] };  // ordered, never empty

export function remoteRoute(
  side: WindowSide,
  credential: 'storedKey' | 'keyPath' | 'password' | 'none',
  agentServesKey: boolean,
  relay: RelayReadiness,
): ConnectRoute;
```

Ordered by what the person must fix **first**, following `whatIsMissing`
(`wslRelayReadiness.ts:39`) — an operator who fixes one thing and is then told about the next is an
operator who stops reading.

**The precedence, stated rather than left to a helper** (asked for by S2/S3's plan round):

| input | route | reasons, in this order |
|---|---|---|
| `local`, anything | `compose` | — (no relay state may change a local answer) |
| `other` | `refuse` | `not-wsl`, alone |
| wsl, `password` | `refuse` | `credential-is-a-password`, **alone**, even with a distro problem |
| wsl, `keyPath` | `refuse` | `credential-is-a-key-path`, alone |
| wsl, `none`, distro resolved | `compose` | — |
| wsl, `none`, distro unresolved | `refuse` | `distro-ambiguous` or `distro-unknown` |
| wsl, `storedKey`, all present | `agent` | — |
| wsl, `storedKey`, otherwise | `refuse` | `distro-*`, then `relay-off` or `relay-not-running`, then `agent-has-no-key` — every one that applies |

Two rules inside that table are worth naming. **A credential no relay can carry refuses alone**,
because listing relay problems beside it points at a button that cannot help. And **the distribution
comes first**, because an unresolved one makes the relay question unanswerable rather than merely
unanswered.

The `agent` route requires a **non-empty socket**, not merely `running: true`: the relay announces
its address on its first line of stdout, so until it has said, there is nothing to point
`SSH_AUTH_SOCK` at and `relay-not-running` is the honest answer.

### D4. What the agent route actually emits

`ssh user@host` with no `-i`, with the relay socket set for that one command:

```
env SSH_AUTH_SOCK=/run/user/1000/creds-agent.sock ssh ubuntu@10.120.39.139
```

**`env VAR=… cmd`, not a bare `VAR=… cmd` assignment prefix** — both reviewers raised this
independently and the repository already knew it: `wslRelay.ts:60-61` records *"`env` rather than a
bare `VAR=value` assignment, because `exec` takes a COMMAND and an assignment prefix is not one —
measured in a real shell before it was written this way."* A bare prefix is a parse error in `fish`
and in `pwsh`, both of which can be a WSL window's default profile, and `createTerminal` uses that
profile. `env` is an ordinary command word every one of those shells runs.

A **per-command prefix**, deliberately, not `EnvironmentVariableCollection` and not
`createTerminal({ env })`. `PLAN_wsl_agent_relay.md:173-179` already recorded why the collection
cannot serve this — it is one namespace per window, a Windows terminal needs the named pipe where a
WSL one needs this socket, and there is no per-shell scope. A prefix is per command, visible to the
person, and assumes nothing about whether a UI extension's `env` reaches a remote terminal.

The socket path is **read from `WslRelayManager.socketPathFor(distro)`** (`wslRelayManager.ts:79`),
never recomposed — the same rule `wslRelay.ts:6-11` states for parsing the relay's own
`export SSH_AUTH_SOCK=` line.

### D5. A pinned host key still works, is ASKED for, and cannot strand a file

`UserKnownHostsFile` has no permission requirement (measurement 4 applies to private keys only), so
the pin survives translation. It is translated by **asking the distribution** —
`wslPathArgv(distro, windowsPath)` (`wslMcpInstall.ts:36`), `wsl -d <distro> -e wslpath -a <path>` —
never by composing `/mnt/c/…`. That is the house rule, stated at `mcpInstallTarget.ts:98` (*"Asked,
not composed"*) and `wslMcpInstall.ts:18-22`: the automount root is configurable in `/etc/wsl.conf`,
so a composed path is a guess. `toWslPath` (`wslRelay.ts:79`) stays confined to the one self-owned
path it already serves.

Three things the plan round added, all of them real gaps:

- **The call is bounded.** `runWsl` (`wslProcess.ts:16`) never rejects but has **no timeout and no
  kill** — a stopped distribution can hang the click for ever. `wslProcess.ts` gains
  `runWslBounded(args, ms)` built from the `withTimeout` (`withTimeout.ts:20`) and
  `killChild(child, { tree: true })` (`childKill.ts:65`) this repository already has, rather than a
  third spawn. Timeout, non-zero exit, malformed output and empty output all map to the SAME typed
  refusal: `'known-hosts-translation-failed'`.
- **The refusal cleans up after itself.** `materializeKnownHosts` (`hostKeyTrust.ts:77`) has already
  written a Windows file by the time translation is attempted. Every refusal path calls
  `forgetMaterializedKey` on it (`keyInstaller.ts:220`, already `rmSync(force)`), so a refused
  connection leaves nothing on disk — the same guarantee `sshConnect.ts:110-121` gives the key.
- **The distro is named.** `wsl -d <distro> -e …`, never bare `wsl -e`, so the answer comes from the
  distribution the window is actually attached to.

### D6. `sshClientPresent()` is skipped in a remote window

It probes the wrong machine ([sshProgram.ts:239](../src_vs_code/src/sshProgram.ts)). Probing the
right one would cost a `wsl -e command -v ssh` round trip on every click; the failure it guards
against is `ssh: command not found` in a terminal the person is looking at, which is legible. It is
skipped, and the skip is stated in the code rather than left to be rediscovered.

### D7. The wording lives in its own module, with its own tests

`remoteWindowMessage.ts`, modelled on `wslRelayReadiness.ts` — the precedent exists precisely because
an operator once did everything right and got a message that named nothing. It takes the **ordered
list** from D3 and names every missing piece; the button comes from the FIRST reason, which is why
the list is ordered rather than a set.

| first reason | primary button |
|---|---|
| `relay-off`, and it is the ONLY reason | *Set Up the Relay and Connect* — DEC-1: runs `credSshManager.setUpWslRelay`, then retries the connect once |
| `relay-off` **beside** another reason | *Set Up the WSL Agent Relay* — the promise is dropped, because `setUpWslRelay` starts the relay and does not put this key into the agent; a button promising a connection would set the relay up, retry, and land the person on a second refusal. Found by S2/S3's plan round |
| `relay-not-running` | *Set Up the WSL Agent Relay* |
| `agent-has-no-key` | *Add Key to Agent* (`credSshManager.addKeyToAgent`) |
| `credential-is-a-password` / `credential-is-a-key-path` | *Copy the Windows Command* |
| `distro-ambiguous` / `distro-unknown` | *Choose a Distribution…* (the picker `setUpWslRelay` already has) |
| `known-hosts-translation-failed` | *Retry*, and the message names the distribution |
| `not-wsl` | *Open Remote Bridge…* where an SSH entity exists, else help |

Every message names **which machine** is which — the open DoD item of
[PLAN_tails_2.md](PLAN_tails_2.md) §2.3, discharged here for this surface.

## What this deliberately does NOT change, and what it leaves open

Named, because each of these looks from a distance like the same defect, and a reader who cannot
tell them apart will either "fix" something correct or assume the rest was missed.

**The broker's `ssh exec` is correct as it stands and is untouched.** It does not post a line into a
terminal — `sshExecAction` SPAWNS `ssh` as a child of the extension host
(`sshUseActions.ts:95`, `openSshBinary('ssh', wanted, process.platform)`), so it runs on the machine
the extension runs on, reads the key file that machine holds, and is unaffected by what the window
is attached to. Composing it for the terminal's platform would be the defect, not the fix.

**The viewer's copyable `ssh` line is still composed for the host** — `entityViewerCommands.ts:131`
and `:242`, `entityText.ts:95`, all `buildSshCommand(details)` with the platform defaulted. In a WSL
window that text is a Windows command. It is the same FAMILY as this defect and it is not fixed
here: that line is a thing to read and paste rather than a thing this extension runs, the entity
view is reached from several places with no window context threaded, and doing it properly means
deciding what a *Copy* button in a remote window should even produce — a question worth its own
change. Recorded here so it is a known gap rather than an oversight.

**`ssh -A` keeps its existing meaning and its existing warning** (DEC-2). On the relay route it
forwards the relay onward, which `PLAN_wsl_agent_relay.md` §Security already covers.

**The agent route does not constrain `ssh` to the entity's own key.** With `SSH_AUTH_SOCK` set and
no `IdentitiesOnly`, `ssh` may offer every key the agent holds and then the shell's own
`~/.ssh/id_*`. That is true of the LOCAL agent route too and has been since the agent shipped — the
WSL route is deliberately the same command — so narrowing it is a change to the agent feature on
both routes at once, with its own failure mode (a host that accepts a different loaded key would
stop connecting). Raised by a code round, rejected as out of scope, and listed as an open question.

## Boundary with the related plans

Written into each of those documents too, in the same change — a boundary recorded on one side only
is how the same work gets built twice.

| item | owner | not owned by |
|---|---|---|
| the relay itself: socket, lifecycle, `creds` inside the distro, the `~/.bashrc` export | `PLAN_wsl_agent_relay.md` (shipped) | this plan, which only READS `socketPathFor` |
| making the CONNECT action remote-aware: side, route, refusal, `-i`, `UserKnownHostsFile`, askpass, program word | **this plan** | the parent and Tails plans |
| the broker reaching a remote window (HTTP, `CREDS_BROKER_SOCKET`, Remote-SSH `ssh -R`) | `PLAN_remote_broker_bridge.md`, phase 4 | this plan, which refuses non-WSL remotes rather than bridging them |
| naming which machine to fix in the KEYRING diagnosis, and the README/help statement of `extensionKind: ui` | `PLAN_tails_2.md` §2.3 | this plan — except the help article below, which is its connect-surface half |
| Dev Container support | nobody: owner decision "last or never" (`PLAN_remote_broker_bridge.md:62-63`) | — |

Order: this plan is independent of the parent's phase 4 and can ship first; it hard-depends on the
relay, which has already shipped.

## Build order — three epics, eight stories

The split and the per-story review loop are the operator's gate commands. Each story is implemented,
reviewed by `review_code` on its own diff, documented, tested and **committed** before the next
starts — so each must compile and run green alone.

### Epic 1 — decide where the command will run (pure, no `vscode`)

| # | story | files |
|---|---|---|
| **S1** | `remoteWindow.ts` — `WindowSide`, `windowSide()`, `terminalPlatform(side, hostPlatform)` | + `remoteWindow.ts`, + its test |
| **S2** | `remoteRoute.ts` — `RelayReadiness`, `RefusalReason`, `ConnectRoute`, `remoteRoute()` | + `remoteRoute.ts`, + its test |
| **S3** | `remoteWindowMessage.ts` — the wording and the button per FIRST reason | + `remoteWindowMessage.ts`, + its test |

### Epic 2 — reach the terminal without lying to it

| # | story | files |
|---|---|---|
| **S4** | `runWslBounded` + `translateWindowsPath` — bounded, tree-killed, injectable spawner | `wslProcess.ts`, + `wslProcess.test.ts` |
| **S5** | `openSshTerminal(entity, options, platform, prefix)`; `envPrefix` extracted from `binaryPrefix` | `terminalManager.ts`, `wslRelay.ts`, both tests |

### Epic 3 — the connect action decides before it writes

| # | story | files |
|---|---|---|
| **S6** | `connectEntity` branches on the route; the relay is threaded in | `sshConnect.ts`, `commands/agentCommands.ts`, `sshUseActions.ts`, `extension.ts`, `sshConnect.test.ts` |
| **S7** | the `connect-in-a-remote-window` help article, five languages, one commit | `helpOrder.ts`, `helpEn/De/Es/Ru/Uk.ts`, `helpCatalog.test.ts` |
| **S8** | the itest run for real, the boundary tables, the promotion | `scripts/wsl-agent-relay-itest.cjs`, `research/*`, the three related plans, `todo/README.md` |

Order: **S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8.** S4 and S5 are leaves; S6 consumes everything.

### Ten gaps the split found in the first build order — all folded in above

1. **The relay manager is threaded into the connect path, and that was missing entirely.**
   `WslRelayManager` is built at `extension.ts:592`, but `registerAgentCommands`
   (`agentCommands.ts:63`), `sshDeps` (`sshUseActions.ts:38`) and `connectEntity`
   (`sshConnect.ts:23-34`) carry no readiness source at all. Four files; it is S6's largest non-test
   diff.
2. **`windowSide` needs four inputs, not two**, and must return the **configured spelling**:
   `socketPathFor` (`wslRelayManager.ts:79`) is an exact-key `Map.get`, so `'ubuntu'` taken from the
   authority would never find a relay keyed `'Ubuntu'`. Signature becomes
   `(remoteName, authorities, configuredDistros, servingDistros)`, and the WSL variant carries its own
   `problem` so S2 can emit `distro-ambiguous` / `distro-unknown` — `distro: ''` alone cannot tell
   "default", "ambiguous" and "unknown" apart.
3. **The `wslpath` translation must come BEFORE `sshConnect`**, not after it: a `sshConnect` story
   shipped without it emits `UserKnownHostsFile="c:\…"` for every pinned host, which is exactly the
   "one argument to the right" this plan warns about. It is S4, and it returns `''` on failure so it
   depends on nothing in Epic 1.
4. **The broker's terminal action never passes `agentServesKey`** — `sshUseActions.ts:236` calls
   `connectEntity` with the default `false`, so an agent-driven terminal in a WSL window would be
   refused as `agent-has-no-key` even while the agent serves the key. `servesKeyFor` joins `SshUseDeps`
   in S6.
5. **`runWslBounded` needs an injectable spawner** (precedent: `RelaySpawner`,
   `wslRelayManager.ts:37`) — `runWsl` hard-codes `spawn('wsl.exe', …)` and CI is Linux, so the
   "a hang is bounded and the child killed" test cannot otherwise run.
6. **`envPrefix` is an extraction, not a new helper.** `wslRelay.ts:67 binaryPrefix` already composes
   `env NAME='value' ` with a single-quote refusal; reuse-first move 2.2 makes it exported with two
   callers. Its open corner — a socket path containing `'` yields no prefix *silently* — is decided in
   S5 rather than left implicit.
7. **The help article touches two files this plan had not named**: `helpOrder.ts` (the id list) and
   `helpCatalog.test.ts:45` (`HELP_ARTICLES.length === 37`, verified), which refuses the article until
   the count moves.
8. **The itest extension had no build step** — it lived only in the test plan and the DoD. It is S8.
9. **DEC-1 is "one click plus the picker"**: `setUpWslRelay` (`wslRelayCommands.ts:28`) opens a
   distribution picker and a readiness modal before writing the setting. S6's test stubs
   `executeCommand` and asserts the single retry, not a silent connect.
10. **`terminalPlatform` takes the host platform as an argument** rather than reading
    `process.platform` inside a pure module.

## Test plan

- **The RED test that reproduces the report**: `sshConnect` with a stored key, a WSL window and no
  relay → asserts that **nothing is written to disk** and **no terminal is created**, and that the
  message names the key's machine. Against today's code it fails by producing the `-i "c:\…"` line.
- **The positive counterpart**: with the relay running and the agent serving the key, the composed
  line is `env SSH_AUTH_SOCK=… ssh …` — **no `-i`**, and `-p`, `-J`, `-L/-R`, `-A` and `user@host`
  all preserved in their existing order.
- `windowSide()` over every `remoteName` value; one folder, several folders agreeing, several
  folders disagreeing (→ `distro-ambiguous`), no folder at all; and `wsl+ubuntu` against a configured
  `Ubuntu` (the case trap, measurement 5).
- `terminalPlatform()` — a remote window never yields `'win32'`.
- `buildSshCommand` with `platform: 'linux'` — POSIX quoting, bare `ssh`, no `.exe`, including with
  `agentForward` set.
- The route table: every `(side × credential × agentServesKey × readiness)` combination lands on
  exactly one route, asserted as a table rather than as branches, and every refusal lists ALL missing
  pieces, not the first.
- Each refusal's wording, asserted on the WHOLE sentence — a fragment match survives its own break.
- `runWslBounded`: an answer, a non-zero exit, a hang (→ bounded, child killed), and empty output —
  all four mapping to the one typed refusal.
- `known_hosts` translation refused → the Windows file is gone afterwards.
- **The one with teeth**: extend `scripts/wsl-agent-relay-itest.cjs` to drive the composed line
  through a real WSL shell against the real relay, and assert the session authenticates with the key
  never existing inside the distribution.

  > **What the skip does not prove**, recorded because the plan round was right that a skipped lane
  > can satisfy a DoD: CI is Linux and has no WSL, so this suite prints its reason and passes there.
  > It therefore proves nothing about the relay route in CI. The DoD below requires it to have been
  > RUN on a machine with WSL and its output quoted — a green CI run is not evidence for this item,
  > and `research/module_tests.md` says so beside the lane rather than only here.

  **RUN, 2026-09-17, on the reporter's machine** (Windows 11, WSL Ubuntu, .NET inside the
  distribution). Twenty checks, all `ok`. The three this change added are the last word on the
  mechanism, and the third is what makes the other two a measurement:

  ```
  ok   the connect path composes an env WORD, not the bare assignment fish and pwsh reject
  ok   that composed line reaches the agent in a REAL WSL shell
  ok   and the same shell WITHOUT it reaches nothing — so the prefix is what did the work
  ```

  The prefix is generated by the REAL `envPrefix` rather than written into the script, and the shell
  it runs in does not export `SSH_AUTH_SOCK` — so the control proves the prefix, not a leftover
  environment, is what reached the agent. Alongside them the pre-existing checks passed too:
  `ssh-add` inside WSL listed a key living in a Windows process, `ssh-keygen -Y sign` produced a
  signature through the relay, `-Y verify` accepted it, and the key never existed inside the
  distribution.

## Definition of Done

- [x] A WSL window with a stored key and a running relay connects, and the key never enters the
      distribution — **at the mechanism level**: the composed line reaches the agent in a real WSL
      shell and the control without it reaches nothing (itest, above). See the caveat below.
- [x] A WSL window without a relay refuses, names every missing piece at once, and offers the button
      that fixes it — or NO button where nothing we run would fix it. It never emits a command that
      cannot work.
- [x] Every other remote window kind refuses with a message naming which machine holds the key.
- [x] A local window's behaviour is byte-identical to today, asserted by the existing suite and by a
      test that pins the platform and the absent prefix.
- [x] A pinned host key survives the WSL route, translated by asking `wslpath` with a bound; every
      refusal leaves no `known_hosts` file behind, and a file OUTSIDE our own directory is never
      deleted.
- [x] The password and key-path branches refuse rather than writing Windows paths into a WSL shell.
- [x] The emitted prefix is `env VAR=…` rather than a bare assignment, asserted by a unit test that
      also refuses the bare form AND by the itest running the real prefix in a real shell. **No test
      runs `fish` itself** — the claim rests on `env` being an ordinary command word, which is why
      the assertion is about the shape of the line and this says so rather than implying coverage
      nobody has.
- [x] Help updated in all five languages in the same commit.
- [x] `npm test` green in `src_vs_code` — 4391 tests, 4387 pass, 0 fail, 4 skipped.
- [x] `scripts/wsl-agent-relay-itest.cjs` **actually run on a machine with WSL**, extended to drive
      the composed line, twenty checks all `ok`, output quoted above — not merely skipped green.
- [x] `research/module_extension.md`, `research/module_tests.md` and `research/architecture.md`
      updated; the boundary table written into `PLAN_wsl_agent_relay.md`,
      `PLAN_remote_broker_bridge.md` and `PLAN_tails_2.md`.
- [x] `plan-lifecycle.mjs`, `pin-check.mjs`, `gate-snippet-check.mjs` and `build-flags-check.mjs`
      pass.
- [x] The `coai` gate: four rounds — two plan, two code — every finding resolved with an accept or a
      reasoned reject, and §Story log reports each verdict and how many reviewers answered.

**The one thing still unobserved, and it is worth stating rather than ticking around.** Nobody has
clicked *Connect* in a real VS Code window attached to WSL. The unit suite drives every branch
against stubs, and the integration test drives the real relay and the real composed line through a
real shell — but the last centimetre, VS Code creating the terminal and posting the line into it,
has only ever been exercised by a stub. Closing it means building the `.vsix`, installing it in a
WSL window and clicking once. Until somebody does, this plan describes a mechanism proven in parts.

## Story log

### S1 — `remoteWindow.ts` (2026-09-17)

`coai` code round, verdict `proceed`, **all 12 reviewers answered**, 24 findings: **11 accepted, 13
rejected with reasons**. The three that changed the code:

1. **The no-folder rung bypassed the spelling rule.** `distinct([...configured, ...serving])` keeps
   the FIRST spelling seen — the configured one — so `configured: ['UBUNTU']` with a relay serving
   `Ubuntu` returned `UBUNTU`, which an exact-key `socketPathFor` never finds. The very trap the
   module was written for, on the one rung that had been left out of it.
2. **A running relay now outranks the configured list.** Two distributions configured and a relay up
   in one of them was refused into a picker, while that socket was the only one that existed.
3. **`terminalPlatform` answers `undefined` rather than `'linux'`** for a window whose shell cannot
   be named — see D2.

The 13 rejections, with the reason each was rejected, because a rejection without one is just
agreement postponed:

- **Four were the local engine's own reasoning, committed as findings.** Their text ends mid-thought
  ("Wait, let's re-read the plan's", "Check whether distinct handles it or if there is another
  defect"), and two of them state outright that the code matches the plan. One, filed **Blocking /
  Security**, claims `WSL_AUTHORITY` has a trailing space and offers a fix character-identical to
  the current line; the constant is `'wsl+'`.
- **`''` for a WSL window with nothing configured and nothing running should stay problem-free**
  (raised three times). Naming it `'unknown'` would show a distribution picker to someone who has
  never switched the relay on, when the honest message is the relay's own.
- **An empty `remoteName` stays local.** `vscode.env.remoteName` is `string | undefined` and never
  `''`; treating a blank as remote would refuse every local connect if it ever were.
- **No `null` guard on `remoteName`**, for the same reason — the value comes from a typed VS Code
  API, and a guard against a value it cannot produce is a comment pretending to be code.
- **The `Set` in `distinct` and the linear `find` in `preferredSpelling` stay** (raised twice). The
  arrays are a handful of distribution names, read once per click; a `Map` here is more code for no
  measurable gain.
- **`withoutAFolder` keeps its name** — it is the no-folder branch of the ladder and is named for
  its precondition, which is how the ladder reads top to bottom.
- **The `'unknown'` case IS covered by a test** that asserts the whole value; the finding says so
  itself.

### S2–S3 — `remoteRoute.ts` and `remoteWindowMessage.ts` (2026-09-17)

Two rounds on one branch. The **plan** round (3 reviewers, 13 findings, 3 accepted) found the button
defect: `setUpWslRelay` starts the relay and does not put the key into the agent, so *and Connect*
beside a missing key would set up, retry and land on a second refusal. The **code** round (12
reviewers, 37 findings, 12 accepted) found two more, both mine:

1. `storedKeyRoute` reported relay state even when the DISTRIBUTION was unresolved. Readiness is
   read for one distribution, so with none named `running` is false whatever the machine is doing —
   and the refusal then said "the relay is off" about a relay that may well be running.
2. `relay-not-running` alone still carried *and Connect*. That reason means the relay is ALREADY on
   and still silent, so running setup again may not fix it. Five reviewers raised it independently.

Also from that round: the tests retyped the reason and credential lists the code holds, so a tenth
entry would have left the coverage loops green — both are exported tuples now with the unions
derived from them. Twenty-five findings were declined, including four that were the local engine's
own reasoning committed as findings (one, filed **Blocking / Security**, claimed a trailing space in
`WSL_AUTHORITY` and offered a fix character-identical to the existing line) and seven citing a
`readonly`-on-parameters rule that does not exist in `typescript/doctrine.md` — verified by grep,
zero occurrences — and would not be valid TypeScript.

### S4–S7 plus S8's documentation (2026-09-17)

The **plan** round (3 reviewers, 17 findings, 6 accepted) found the worst defect of the whole
change: `envPrefix` DROPS a value it cannot single-quote, which is right for its original caller
where the relay falls back to the PATH — and on this path the fallback was `ssh` with no agent and
no `-i`, which does not fail. It silently authenticates with whatever keys that shell already has.
It refuses as `relay-socket-unusable` now. The same round found the retry had no budget at all,
although the plan claimed "at most once".

The **code** round (12 reviewers, 49 findings, 14 accepted) found the one that made the whole button
a lie: the retry closed over the SAME window snapshot the first attempt refused on, so *Set Up the
Relay and Connect* set the relay up and then refused again for the reason it had just fixed.
`RemoteWindowDeps.refresh` re-reads the window. It also found that `connectEntity` returned `void`
while the broker reported `opened: true` whatever happened — harmless when the only failure was an
entity with no host, not harmless now that a window can refuse — and that two late refusals left the
host-pin file `connectionOptions` had already written.

**A test of mine was silently dead, and the assertion I had added for exactly that reason caught
it.** A python-written regex turned `\b` into a literal BACKSPACE (0x08), so the call-site scan
matched nothing and two loops ran zero times while passing. Found on the way and NOT fixed here
because it is not this change's: `src/scriptRender.ts:197` carries the same 0x08 in
`/^\s*import\s+os<BS>/m`, in `origin/main` since e28c7b7 — that regex cannot match, so `needsImport`
is always false and `import os` is never added to a python script.

### The self-review after the rounds (2026-09-17)

Re-reading the finished work found four things no round had:

1. **A button that could not deliver its promise — mine, and the third instance of the pattern two
   rounds had already corrected here.** `relay-socket-unusable` offered *Set Up the WSL Agent
   Relay*, which restarts the relay at the same unusable path: the socket comes from
   `CREDS_RELAY_SOCKET` by way of the CLI, and nothing this extension runs changes it. That reason
   now offers NO button, and the sentence names the variable.
2. **The pin deletion was a substring sniff** (`.includes('known_hosts-')`) when the precise answer,
   `materializedKeysDir(storageDir)`, was in scope. A path outside it is now never deleted, with a
   test that hands it `/home/someone/.ssh/known_hosts-e1`.
3. **`module_tests.md` stated test counts that were wrong** — 16 and 12 against the real 15 and 15.
4. **The DoD claimed a `fish` default profile was "covered by a test"**, and no test runs `fish`.
   It says what is actually asserted now.

## What the plan round changed (2026-09-17)

`coai` session `5b20f7e7`, verdict `good_enough` (one round is the configured budget), **2 of 3
reviewers answered** — the local engine was busy for the whole 290 s it was given, so its question
was never asked. Twelve findings, **all twelve accepted**. The five that changed the design rather
than adding detail:

1. **`VAR=value cmd` is not portable** (both reviewers, independently). `fish` and `pwsh` can be a
   WSL window's default profile and both reject it. Now `env VAR=… cmd` — which is what
   `wslRelay.ts:60-61` had already measured and written down for the relay itself. The first draft
   would have shipped a connect action that failed on someone's shell for a reason the message could
   not have explained.
2. **The route API could not represent what it promised**: `relaySocket: string` collapses "off" and
   "not running", and one `reason` cannot list everything missing while the wording section promises
   exactly that. Now `RelayReadiness` in, an ordered `reasons[]` out.
3. **One workspace folder is not the distro.** Multi-root across two distributions, a single file, an
   empty window — the first draft silently fell back to `''` and would have pointed `SSH_AUTH_SOCK`
   at whichever socket it found. Now a four-rung ladder with two distinct refusals of its own.
4. **`wslpath` was unbounded and could strand a file.** `runWsl` has no timeout; and
   `materializeKnownHosts` has already written a Windows file before translation is attempted, which
   the first draft's refusal left on disk.
5. **A skipped lane can satisfy a DoD.** The integration test is skipped on CI by design, so the DoD
   now requires it to have been run where WSL exists, with its output quoted.

Two decisions the round refused to let the plan leave open are settled above as DEC-1 and DEC-2.

### S9 — the route the plan did not have: the WINDOWS client, launched from the WSL shell (2026-09-17)

The plan above is built on one premise, stated in D3 and repeated in the route table's own comment:
a Windows-side key cannot be used from a WSL shell, so it is the agent relay or a refusal. **Half of
that is wrong, and it took shipping the honest refusal to find out.**

What is true: the DISTRIBUTION'S `ssh` cannot use it. /mnt/c reports 0777, `chmod` there is a no-op,
and OpenSSH refuses a key whose permissions it cannot trust.

What is not: WSL can *launch the Windows client*, which reads that same file under the Windows ACLs
where the permissions are real. Measured on the reporting machine:

```
$ /mnt/c/Windows/System32/OpenSSH/ssh.exe -V
OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2
$ wslpath -u 'C:\Windows\System32\OpenSSH\ssh.exe'
/mnt/c/Windows/System32/OpenSSH/ssh.exe
```

and, earlier in the same session, an ed25519 key in `openssh-key-v1` format — the format our own
agent cannot parse at all — authenticated through it. So the route needs **no agent, no relay, no
key parser, and not even the distribution's name**, and the key does not merely stay out of the
distribution: it never leaves Windows.

**How it was found.** Not by review and not by a test. The person who reported the original defect
clicked Connect on 1.9.5, was told in careful, correct, measured prose to convert their key with
`ssh-keygen -p -m PKCS8`, and said what the product is actually for: it should work out where it is
running and do what is needed. A refusal that is accurate is still a refusal. A consultant reading
this branch raised the same route independently; both were right.

**What was built** (`kind: 'windowsClient'` in `remoteRoute.ts`):

| | |
|---|---|
| the program word | `/mnt/c/Windows/System32/OpenSSH/ssh.exe`, from `wslWindowsSshClient()` |
| `-i` | the Windows path, **untranslated** — this client reads Windows paths |
| `UserKnownHostsFile` | likewise untranslated; `withTranslatedKnownHosts` is skipped on this route |
| quoting | still the SHELL's, which is bash — the client's OS and the shell's are two facts |
| the distribution's name | not consulted, so `distro-ambiguous`/`distro-unknown` no longer block a key |

**The order is the decision, and the relay still wins.** Where the agent can serve the key and the
relay is up, the route is unchanged: the distribution's own client uses the distribution's
`~/.ssh/config`, resolver, network namespace and idea of `localhost`. The Windows client is the one
that always *works*, not the one that always *fits*, so it takes the cases the relay cannot serve —
which today is nearly all of them, because nearly every key is in the format the agent cannot read.

**What it costs, said out loud rather than hidden.** A `-L` forward binds on the CLIENT, and the
client is now a Windows process: `localhost:5432` typed into that very terminal does not reach it.
`-A` carries the WINDOWS agent's keys, because `SSH_AUTH_SOCK` does not cross interop unless
`WSLENV` names it. `windowsClientCaveat` says so at the moment of the click, and **only for an entity
that actually asks for one of the two** — a note everybody sees on every connection is a note nobody
reads by the third day, and then it is not there for the one connection it was written for.

**Still refused, and the reasons did not change.** A password: the askpass helper is a shell script
the distribution holds and a Windows program cannot exec it, and the environment carrying the
password does not cross interop either. Remote-SSH, containers, Codespaces: the Windows client is
reachable from WSL because WSL runs on *this* machine; there is no interop to borrow across a
network.

**Red first, with real symptoms.** The new route branch was disabled and the suite re-run: 8 red
across `remoteRoute.test.ts` and `sshConnect.test.ts`, the leading failure reading
`+ kind: 'refuse' / - kind: 'windowsClient'` — which is the screenshot, as a diff.

**Two known gaps this route has of its own**, recorded rather than discovered later:

1. **A non-default `[automount] root`** makes the `/mnt/c` constant wrong. `wslpath` is the general
   answer and this repository already asks it, but it costs a `wsl.exe` subprocess on a path that
   runs on every click to translate a string that is fixed on every default machine. What a custom
   root gets is a terminal saying the file does not exist, in front of a person looking at it.
2. **Interop disabled** (`[interop] enabled=false`) makes the client unlaunchable. Same shape: the
   failure is visible in the terminal, not silent.
