# PLAN — An agent on a remote Linux server uses what the person opened to it, through a bridge scoped to that server

> Status: **E1 in progress on `feat/remote-bridge-e1`, 2026-11-05.** Epoch 3, after a whole re-review (`proceed`, 2 of 4 reviewers; the other vendor's quota was out, and its answers come back at E1's code gate). Scope: `src_vs_code` (broker doors, bridge lifecycle, scope,
> agent actions), `src_broker_client`, `src_cli`, `src_mcp`, `install.sh`. No server change. Extends the shipped bridge of
> [PLAN_remote_broker_bridge.md](../research/PLAN_remote_broker_bridge.md).

## Plan changes

> Epoch 1 · approved 2026-11-04 · by reviewers · state: closed

- 1.1 · 2026-11-04 · owner · scope,dod — bridges must survive a reboot of the person's PC
- 1.2 · 2026-11-04 · owner · scope,dod,epics,approach — the VPN serves websites and vpn-up is a script entry: the db tunnel goes, scripts run on the server
  (This second change stopped the plan. Nothing is built, so the re-review has no work to sort.)

### Re-review for epoch 2

Narrowed: yes — the db tunnel left the scope and the Definition of Done, by the owner's own words: "VPN вобще не для баз... забудь"

| Work | Where | Verdict | Action |
|---|---|---|---|
| Nothing built | — | — | — |

> Epoch 2 · approved 2026-11-04 · by owner · state: closed

- 2.1 · 2026-11-04 · agent · approach — an unrelated extension tag would ship the new door before clients are on servers, and an old client never shows the update sentence, so the new flow stays behind a switch until E4
- 2.2 · 2026-11-05 · reviewer · approach — each window holds its own copy of `globalState` and the last write wins, so a narrowed scope may never reach the owning window and another window can restore it; scope records move to a file in the shared storage folder
  (This second change stopped the plan. E1.1, E1.2 and E1.3 are committed on the branch and go to the re-review's sort.)

### Re-review for epoch 3

Narrowed: no

| Work | Where | Verdict | Action |
|---|---|---|---|
| Plan history and the epoch 2 approval (d427713, 8a23190, 96a563a, c6800b8, fe86db8, 1184575) | pushed, unmerged | fits | kept; the revised plan replaces the sentences the changes touched |
| E1 stories, 9dbcd57 | pushed, unmerged | fits | a dated amendment: the store, the jump paragraph, the token path's shared throttle |
| E1.3 spec, cbb1431, and 4341cba | pushed, unmerged | fits | a dated amendment: F12 and S3.2.5 (store), S3.1 item 1 and S3.10 item 6 (the jump's name IS disclosed at `sshOptions.ts:153`, and the linked key was not covered), S3.3 step 4 (gate before `releaseWaiting`), S14, S17, S20 |
| E1.2 and E1.4 specs, 5368d46 | pushed, unmerged | fits | S2 kept; S4 amended for the per-bridge prompt window and its line budget |
| E1.1, b26fb81 and 4c47ebc | pushed, unmerged | fits | kept; M4 is still owed by the person |
| E1.2, 547d9e9 and 52cb8a5 | pushed, unmerged | fits | kept; no revision touches the door, key, context or listener |
| E1.3, a91e981 | pushed, unmerged | fits | allow-list, note schema, per-call token grant, launch gate and reference check kept; fix forward: the file store with revisions, generic refusal bodies with `ctx.bridge` set, `agentForward` refused, per-account suppliers, the gate before `releaseWaiting`, a token re-read at entry and at the gate, per-bridge prompt windows. `credsAgentServer.ts` is at 788 of 800 |

> Epoch 3 · approved 2026-11-05 · by reviewers · state: open

- 3.1 · 2026-11-05 · reviewer · approach — an in-scope entry's port forwards would give the server a road through the laptop for the life of an exec: on a bridge they are stripped from the argv and ssh is told to clear every forwarding, share no connection and open no X11 or tun channel
  (E1.3 spec, Amendment 3, C.1–C.2. The first change of epoch 3; the plan goes on.)

## 1. Goal

The person works in VS Code on Windows, in a Remote-SSH window attached to an Ubuntu server. The vault lives in the
extension on Windows (`extensionKind: ["ui"]`). Claude Code runs on that server, usually inside tmux. It should be able to
use, through MCP, the entries the person opened to it: run SSH commands, query databases, use a password without seeing
it, and run stored scripts on the server, such as restarting a VPN it needs for reaching websites. All of this must come back by
itself after the person's PC reboots.

Today it cannot, and the reasons are not the entry kinds. The bridge is half built:

| # | Symptom | Cause (verified) |
|---|---|---|
| D1 | Claude has no working tools on the server | `Windows.cs:56` and `:126` return when the announcement folder is empty, before `BrokerClient.Create` reads `CREDS_BROKER_SOCKET` (`BrokerClient.cs:57-60`). Nothing installs or registers `creds-mcp` remotely (`mcpInstallTarget.ts:62-86`, `install.sh:65` fetches `cli-v*` only) |
| D2 | By-name `creds` calls fail through the real bridge | `Program.cs:183,303,355` build `new Endpoint(0, 1, …)`, so the request says `Host: 127.0.0.1:1`. The forward lands on the TCP port (`sshBridge.ts:216`), whose door requires the real port (`brokerOrigin.ts:200-203`). The compiled `admitsRequest` was run on these shapes: port door refuses, socket door admits. `creds-cli-itest.cjs:211-223` uses the socket door, so CI cannot see this |
| D3 | tmux loses the bridge | The path is random per open (`agentCommands.ts:447`), setup is a pasted `export` (`sshBridge.ts:247-261`), and a dropped ssh only logs (`extension.ts:196-202`) |
| D4 | The bridge skips SSH settings | `agentCommands.ts:448-452` passes neither `knownHostsFile` nor a jump, so it is always `accept-new`; the exec path honours both (`sshUseActions.ts:153,201`) |
| D5 | The socket reaches the whole broker | One router behind every door (`credsAgentServer.ts:435-489`). MCP and alias routes take no token, "never ask" settles with no modal (`brokerMcpDoor.ts`), and consent stamps carry no host (`mcpConsentPolicy.ts:85`). The config route returns a whole secret body (`brokerConfigRoute.ts:76`) |
| D6 | An agent's stored command or script runs on the wrong machine | A person's click on a Terminal entry runs on the server (`hostShell.ts:185-191`). The agent's run compares with and spawns on `process.platform` (`agentUseActions.ts:206,220`), and `scriptRunAction` (`agentUseActions.ts:125-175`) runs a script from a temp file on Windows, so a bash script needs a bash on Windows and never reaches the server |
| D7 | A password can reach the server | `exportEnv` writes values to the window's environment collection with no remote check (`agentUseActions.ts:245-274`). In a Remote-SSH window those terminals are on the server. Not yet measured live (M4) |
| D8 | Nothing survives a reboot | A bridge lives only in the memory of `SshBridgeManager`; nothing records that it was open, and `dispose` kills it (`sshBridgeManager.ts:92-96`) |

## 2. Owner decisions (2026-11-04)

1. Finish the bridge AND scope it per server. `ssh -R` is the transport.
2. No plaintext secret reaches the server. A password is used without being seen: the laptop runs a stored command with
   the password in a variable, and the agent gets only the output.
3. No open window means no access: no daemon and no relay. Calls fail with a clear message.
4. **Bridges survive a reboot of the person's PC.** A bridge stays open until the person closes it. Closing a window suspends it;
   only *Close Remote Bridge* ends it.
5. The person's own `Set env` keeps working in a Remote-SSH window, with a warning. Only an agent's export is refused.
6. Script entries are usable by the agent when access is open. The VPN is one such script (`vpn-up`, bash, on the server), it serves
   websites, not databases, and it does not prompt for a sudo password; the plan does not handle one.
7. Each login user has its own entry and bridge. The Remote-SSH window `ai-runner1` logs in as `dev2`, so an agent there needs an entry
   for that login; a root entry's private directory cannot serve it.
8. Out of scope: RDP, and any tunnel to a database. Databases are queried from the laptop as today.

## 3. Rejected

| Option | Why |
|---|---|
| Cloud relay through the vault server | Puts the server in the agent's path, needs a sync location, carries no TCP |
| Laptop daemon so the editor may be closed | The vault lives in the extension host; needs its own unlock and consent UI; contradicts decision 3 |
| Companion `workspace` extension relaying over `executeCommand` (designed in full) | Three foundations are unmeasured (a command promise held 5 minutes, where the extension installs, whether `asExternalUri` carries raw TCP); `workspace.openTunnel` is proposed API only; a second Marketplace extension; and `ssh -R` must stay anyway for a plain SSH terminal |
| Reverse SOCKS proxy, or the VPN config on the server | A proxy hides which process connects. The config is a secret |
| A db tunnel through the server (in epoch 1) | The owner: the VPN is for websites, so nothing needs it |
| A stable socket path (measured) | With the client hung, binding the same path fails with `remote port forwarding failed`; a new path after unlinking works at once (§4.3) |
| A pid in a claim file, for who owns a bridge | A pid is reused after a reboot and `pidIsAlive` calls a protected process alive, so a stale claim can block forever; two windows can both reclaim it (§4.7) |
| Dropping or widening the Host check on a shared port | Reopens DNS rebinding and still cannot tell which server called |

## 4. Design

### 4.1 One listener per open bridge, behind a third door

`ssh -R` from Windows can only target a TCP port (`sshBridge.ts:12-17`), so each open bridge gets its own
`startLoopbackServer()` port, closed with the bridge and on `dispose`. `doorsFor` (`brokerOrigin.ts:75-92`) mints a third
door, `forBridge(port, context)`, so "every listener is covered" stays structural. The door keeps the browser-header
checks and the exact Host rule, and additionally requires an `X-Creds-Bridge` key with a constant-time compare.

The key exists because any local Windows process can reach that port, and without it such a process could raise a modal
claiming to come from this server, or borrow a quiet scope. It is minted per open, dies with the listener, and opens no
secret. It does sit on the server (§4.3), readable by that unix user, who can reach the socket anyway.

The door hands a trusted `BridgeContext` `{bridgeId, accountId, serverEntityId, serverName, target, remoteOs}`, the key staying at the door, to
`handle`. Nothing in a request can set or change it. `credsAgentServer.ts` is at 779 of 800 lines, so new behaviour goes in
new modules (`brokerBridgeListeners.ts`, `bridgeContext.ts`).

### 4.2 Scope at the lookups, not the listings

`bridgeScope.ts` (pure) wraps the resolvers (`resolveMcpUse`, `resolveAlias`, the token's grant) and the read sources for a
bridge door, so a direct call with a known id meets the same wall as the list. Out of scope answers exactly like "not
found".

- **Stored:** one file per record, `<globalStorageUri>/bridges/scopes/<hash>.json`, machine-local and never in the vault (the argument of `mcpConsentPolicy.ts:13-18`), named by a hash of account and server entry because the key's characters
  are not legal in a Windows file name. Not `globalState`: each window holds its own copy and the last write wins (`mcpConsentPolicy.ts:234-241`), so a scope narrowed in one window might never reach the window that owns the bridge, and a stale
  write could restore it. Every check reads the file fresh; an absent or corrupt file is an empty scope.
- **Retired with the bridge:** *Close Remote Bridge* removes the scope record and that server's consent stamps along with the bridge's record, whichever window it runs in. Opening the bridge again starts from an empty pick.
- **Written safely:** a record carries a revision. A write takes the cross-window lock of `leasedQueue.ts`, re-reads, and is refused if its revision is stale, so an edit made from an old copy cannot restore what another window removed, and the person is told to look again. The write itself is temp-and-rename.
- **Chosen:** when opening the bridge, from that account's entries already open to MCP (the same wall as the MCP listing), and editable on the bridged row. A new server starts empty. The pick names the key each ssh entry uses (below).
- **The bridge door serves an allow-list, default deny.** A route or action added later is refused here until it is named. Never on
  the list: `/v1/config/read`, `exportEnv`, `/v1/mcp/create`, `/v1/mcp/folder/*`.
- **Checked again just before launch.** Name resolution is one wall; a token's grant skips it, and a scope can change while a consent
  modal is open. So the scope is also checked in one place at the moment an action starts, whichever route it came by, and before anything an Allow triggers (`releaseWaiting`, `credsAgentServer.ts:586`), so a narrow during a modal promotes nothing. A token denied while its call waits is refused at that point too. The gap between the start of `run` and the spawn is a keychain read and is accepted.
- **References are scoped too.** Every entry a stored command or script reaches through a `creds://` reference must be in the same server's
  scope, or the call is refused with one sentence that echoes nothing from the stored text. Otherwise an entry in scope becomes a road to one that is not.
- **Listings are per account.** `McpEntry` carries no account and an envelope may repeat an id across accounts (`idQuarantine.ts:41` keeps a safe id), so walling by id alone is a breach: the wall reads the listing and the config snippet from per-account suppliers. Use paths already search one account (`mcpHooks.ts` `accountOnly`).
- **What an entry links to is part of using it.** An ssh entry's `sshKeyEntityId` and jump chain are not scope targets. `sshkey` can never be opened to MCP (`entityKind.ts:155,179`), so requiring it would refuse every ssh entry with a linked key. The value stays on the laptop, the person set the link, and edit verbs are off the allow-list, so an agent cannot repoint it. This covers what using the key does, including promoting a rotation already waiting on it (`automaticRead.ts:28-33`). A `creds://` reference stays strictly scoped, because it puts a value into a command.
- **But never the laptop's whole agent:** `agentForward` forwards the shared agent, which lists every loaded identity (`sshUseActions.ts:83-97`, `sshAgentServer.ts:207-208`). An ssh entry with it set is refused on a bridge door, with a sentence saying why, until forwarding has its own boundary. Nor any other forwarding, and no shared connection (change 3.1): on a bridge the entry's port forwards are dropped from the composed argv and `ssh` is told `ClearAllForwardings=yes`, `ForwardX11=no`, `Tunnel=no`, `ControlPath=none` and `ControlMaster=no` — one fresh connection that carries the command and nothing else, so an exec cannot join the person's own multiplexed session (which would hand it the forwarded agent and skip the pinned key and host key) or open a road from the server through the laptop; off a bridge the argv is unchanged.
- **Refusals name nothing out of scope.** On a bridge door the sentences that carry a linked entry's or jump host's name (`sshExecAuth.ts:125-127`, `sshOptions.ts:153`) become generic. `ssh`'s own stderr is returned as is, and may carry a jump host's address, or the laptop's key path and a linked key's id in the file name of a key `ssh` could not load.
- **Server identity is the vault entry id** (`serverEntityId`), never a host string, so aliases and jump chains cannot split or merge it.
- **Prompts:** each bridge has its own sliding window of prompts, so one server's agent cannot spend the laptop's or another server's, while one dialog at a time stays global. A call the gate refuses before any dialog spends no prompt.
- **"Never ask" and "every 12 hours":** a per-server `quiet` switch, default off, which means every call through this bridge
  asks. When on, the entry's own policy applies, with stamps keyed by server too, so an answer given through server A
  silences neither server B nor local use. `stampKey` keeps its length-prefixed encoding with a third segment, so a local stamp and a
  server stamp cannot collide.
- **Modal and journal:** one added line from the context, not from the caller's self-declared label: which server, and
  whether the action runs on the laptop or on that server. Audit lines gain `bridge=<name>`.

### 4.3 A stable note, not a stable socket

A stable socket path has a trap: after a laptop sleeps, the old `sshd` session can keep the path bound with no client-alive
check, so a reconnect either fails on `ExitOnForwardFailure` or has to unlink a socket that might be another window's
live one. So the **socket path stays per connection**, and the stable thing is a **note**:

- Directory: `~/.creds-for-devs/bridge/`, mode 0700. The 0700 parent is the first layer; sshd's mask (which the client
  cannot set, `sshBridge.ts:19-24`) is the second, still checked by `verifyBridgeSocket`.
- **Every live bridge has its own note**, `<bridgeId>.json`. An entry has one bridge per laptop: a second Open from another window finds the existing one (§4.7). Different logins are different entries, so different bridges with their own notes and scopes, and each writes and removes only its own note. A second laptop has its own `bridgeId`.
- Each connection: unlink every earlier socket of this `bridgeId`, listening or not, because the supervisor knows they are superseded and
  clients follow the note; then sweep other sockets, removing one only when `ss -lx` ran successfully and does not list it as listening. If `ss` is missing or fails, the other sockets are left alone, because nothing has proven them dead; spawn `ssh -R <dir>/<bridgeId>-<n>.sock:127.0.0.1:<bridgePort>`;
  verify the socket; and only then atomically write the note (mode 0600): `{socket, port, brokerPort, key, serverName, openedAt}`.
- A note whose socket is gone is removed by the same sweep, whoever wrote it.
- **Each attempt owns its generation** of socket and note; the listener and key live as long as the open bridge. A superseded attempt can neither publish nor delete a newer note
  (the identity check `sshBridgeManager.ts` already makes for a late exit, extended to verify, publish, retry and clean up).
- Close removes the note, best effort, and cancels any waiting retry. A stale note is harmless: its socket is dead and its key died
  with the listener.
- A path over the socket limit is refused with a sentence, using the limit of `src_cli/src/AgentRelay.cs:116-119`, moved to `src_broker_client` so both clients share it.
- So without `ss`, a bridge still unlinks its own earlier sockets; only other bridges' dead sockets stay, at most one per bridge ever
  opened, and this is said once (§6).

A connection belongs to the login user of the entry. A bridge opened on a root entry serves agents running as root; an
agent running as another user needs an entry for that login, which is another bridge.

### 4.4 The supervisor

`BridgeSupervisor` (pure, spawner and clock injected) replaces `SshBridgeManager`: `connecting → up → down(retry) → closed`,
backoff 2 to 60 s with jitter, until Close; it is suspended when the window ends (§4.7). A row reads `up` only after `verifyBridgeSocket` (a local function at `commands/agentCommands.ts:208`, extracted for this) succeeds, never
because a process is alive (the class of defect `sshBridge.ts:95-101` records). The host key and jump chain come from the exec
path's existing code (`materializeKnownHosts`, `resolveJumpChain`), and `bridgeAuthParity.test.ts` extends to the new execs.

**Nothing is ever replayed.** The supervisor owns only the tunnel. A call in flight when the tunnel dies answers "may or may not
have run" (the sentence of `Program.cs:235`), for `creds` and `creds-mcp` alike.

### 4.5 Clients find the note

`BridgeNote.cs` in `src_broker_client` lists the notes and keeps those whose socket exists. **Each live note is one endpoint** in the rung
`Endpoints` gains for when announcements are empty, so the walk that already serves several windows decides (`Windows.cs:104-119`): reads
merge, and a use call moves on from a `not_found`. That is how an entry scoped to an older bridge stays reachable while a newer bridge exists. `BrokerClient` sends the key and the note's port, so Host is right and D2 goes away. **A note is one
snapshot per logical call:** the health probe and the POST use the same socket, port and key, so old and new bridge state never mix.
`CREDS_BROKER_SOCKET` stays as an override that names a socket: key and port still come from the note for that socket. A socket that exists with no note
behaves as today, which keeps `creds-cli-itest.cjs` and the local socket door unchanged. A socket that does not exist gets a sentence: the variable points at a
bridge that no longer exists, unset it. The note is read **per call**, so a running `creds-mcp` and old tmux panes follow a
reconnect with nothing to re-export. A dead socket fails on the existing 2 s health timeout and the next note is tried.

**Token calls must change too.** `CallWithTokenAsync` (`Program.cs:132-156`) dials `token.Port`, which is the main broker's port,
and the bridge door requires its own. A token belongs to one window, so the client picks the note whose `brokerPort` equals `token.Port`, uses
that note's socket, port and key, and sends the token as today.

**Compatibility:** an old `creds` against the new door is refused, because it has no key and the wrong port, and it cannot even say why: `IsOurBrokerAsync` (`BrokerClient.cs:96-105`) discards a refused health probe, so it reports that no window is listening. Extension tags also go out for unrelated work (`release.yml:809`), so ordering this plan's releases is not enough. So:

- **The new open flow and restore stay behind a switch**, off in every build until E4 flips it after the clients are released. Until then *Open Remote Bridge* behaves as it does today, and CI turns the switch on.
- **Clients ship first** (`cli-v*`, `mcp-v*`). Released is not installed, so before the new flow opens on a host it checks that host's `creds` and `creds-mcp` versions and offers the update, instead of relying on a refusal the old client cannot show.
- E4 tests the previously released `creds` against the new listener and asserts its real output.

Install: `install.sh` gains a product switch (asset name `creds-mcp-$VERSION-$RID`, `release.yml:687`), the host menu offers
`creds`, `creds-mcp` or both, and registration stays offered rather than written (`mcpClientConfig.ts:9-13`): the person is
shown `claude mcp add --scope user creds -- <path>/creds-mcp` to run on the server.

### 4.6 Where a stored command runs

The bridge door decides, through a pure `decideRunSite`:

| Line | `terminalOs` | Runs on |
|---|---|---|
| No `creds://` reference | unset or linux | **Server**, over the exec path to the bridge's own entry |
| No `creds://` reference | windows | Laptop |
| Has `creds://` references | windows | **Laptop**, values in the child's environment |
| Has `creds://` references | unset or linux | **Refused**, with a sentence: the value would have to reach the server; set "Runs on" to Windows to run it on the laptop |
| A script injecting a variable, no reference | unset or linux | **Refused**, with a sentence (below) |
| A script injecting a variable | windows | Laptop, variables in the child's environment as today |

Unset means the server on a bridge door, as it does for the person's click, whether or not the line has references. Adding a reference to a line
therefore never moves it silently to another machine: it refuses until the person says so.

**The table covers Terminal and script entries alike.** A script entry gains the existing `terminalOs` "Runs on" field. On the server rows:

- The body reaches the server **over stdin**, never argv, and is not capped by the 8000-character command limit (`sshExecCommand.ts:25`). It is written to a private file in
  `~/.creds-for-devs/run/` (0700), then run by its interpreter with **stdin from `/dev/null`** and the file removed at the end. Feeding `bash -s` directly would let a script that reads stdin
  eat its own body. `sshExecRunner.ts:134` ignores stdin today, so it gains a bounded input path with end-of-file and error handling.
- **A script that injects any variable does not run on the server**: `Object.keys(resolveScriptEnv(…).env).length > 0` (`scriptRender.ts:169`, which injects
  every enabled named variable whether or not the body mentions it, so a Python script reading `os.environ` is caught too). A variable may hold a secret and
  nothing marks which, so the refusal says so and names the two ways out: move the value to a `creds://` reference and set "Runs on" to Windows, or remove it.
  A literal secret typed into a body is outside this guard, because nothing can tell it from any other string and a heuristic would promise what it cannot keep. So the limit is said where it matters: the scope pick states that a script's body goes to the server, and the file holding it lives only for the run.

A call not on a bridge door behaves exactly as today. Content trust (`isCommandTrusted`) is unchanged: the person runs the
line once by hand first. For a script in a Remote-SSH window that click confirms trust (`passScriptGates`, `commands/runCommands.ts:173`) and is then refused by the pinned
terminal (`launchScript`), so trust is recorded but the words read like a failure: they are reworded to say the agent can now run it. Running a script by a
person's click on the server is a separate todo (§8). An agent still cannot supply a command (`CommandLine.cs:129-134`). `timeoutMs` becomes sendable,
clamped by `clampExecTimeout` to 120 s. The wait ends when stdio closes (`sshExecRunner.ts:191-203`), so a script leaving a
daemon holding stdout runs to the timeout (M3).

For the laptop rows, the agent path adopts what `runWithSecrets` does for the person (`runCommands.ts:244-253`): references
resolve into the child's environment, never argv, and every resolved value joins that call's mask table. PIN and woven refusals
surface as sentences. Masking is a guard against accident only (`secretMasker.ts`); the guard against intent is that the line is
the person's, trusted, and not the agent's to change.

### 4.7 Surviving a reboot

**The intent is durable, the access is not.** Opening a bridge creates `<globalStorageUri>/bridges/<hash of account and entry>.json`, exclusively, so two windows racing get one record: `{accountId, serverEntityId, bridgeId, target}`, the
scope staying in its own record (§4.2). **The record is never rewritten:** it is created by Open and removed by Close, and those are its only changes, so a slow window has nothing to write back and cannot resurrect it. That folder is the one every window of this VS Code shares, as the announcement files already rely on (`cliEndpoint.ts`, `Endpoints.cs:55-61`). The file is written by temp-and-rename. A file rather than `globalState`, because several windows must see a Close at once.
Only *Close Remote Bridge* removes it, and that is offered in every state the record can be in, from any window. Closing or crashing a window removes nothing.

**Any window restores every saved bridge** once its vault is unlocked. Supervisors live in a window's memory, so nothing carries over from a window that ended: at activation, and again on every unlock, a window reads all records and, for each it does not already own, tries the lock and starts a new supervisor if it wins. That
fresh attempt on unlock is also how a bridge returns when every window had been locked and nobody was trying. `VaultKeys` has `onDidLock` (`vaultKeys.ts:112`) and no unlock event, and ordinary and
recovery-code unlock are separate paths, so one `onDidUnlock` is added and both fire it.

**Exactly one window owns a bridge, by a lock the OS releases.** The owner holds a named pipe, `\\.\pipe\creds-bridge-<bridgeId>`. Measured on the owner's PC in VS Code's own Node 24: a second process
gets `EADDRINUSE` while the holder lives, and gets the pipe the moment the holder is killed. So a power-off leaves no stale claim, two windows cannot both win, and no pid is read. Linux uses an abstract socket
(`\0creds-bridge-<bridgeId>`), which the kernel also releases on death. macOS has neither, and a socket file survives a kill, so it would need probe and re-verify that must be proven: until that is tested, **a bridge on
macOS does not restore by itself**; it says so and offers Open. The durable record and the live lock are different mechanisms on purpose.

**The order is the contract.** The lock is the authority: take it, re-read the record, compare the target, re-check the account and scope, start the listener, connect, verify, and only then publish the note. Nothing is published
or swept without the lock held, and generations carry across a handover, so a previous owner's late verify, publish or cleanup cannot touch the new owner's note or socket.

- **Claim only when able to connect:** a locked window does not claim. A window that locks closes its listener and tunnel and releases the pipe, so another unlocked window can take over.
  Its record stays.
- **Windows not owning a bridge** try the pipe every 30 s, so a surviving window takes over when the owner closes.
- **Close** removes the record; the owner re-reads it every 5 s and shuts down, so revocation from another window takes at most 5 s, and from the owner's own window it is immediate. A retry never brings it back.

**A restored bridge restores only what was opened.** The record's `target` is compared with the entry's current user, host and port. If the entry now points elsewhere, the bridge does not come back, and its row says why and offers Open:
otherwise a scope would silently follow an edited entry to another machine. A PIN-protected or woven credential cannot open unattended, so that row says "needs you" and does not loop.

**A Close from a window that does not own the bridge removes the record; the owner then removes the note.** After a power-off there is no owner, so the note stays until a sweep on that server finds its socket dead, which is harmless by §4.3's argument.

**What a person sees:** after a reboot the row reads *waiting for unlock*, then connecting, then up. The agent door row (`agentDoors.ts:96`) says the bridge reopens by itself until closed. On the server nothing needs doing: the stable `bridgeId`
lets the new connection unlink its own old sockets, the note is rewritten with the new port and key, and clients read notes per call.

### 4.8 The export guard

`credentialExportEnvAction` refuses whenever `windowKind(remoteName) === 'other'`, with a sentence naming where the value would land.
On a bridge door the allow-list refuses first, in the same words, so the agent sees one stable sentence. The person's `Set env` proceeds with a warning that names the server's terminals. If M4 shows that the
collection does not reach remote terminals, the warning is dropped and the refusal stays.

## 5. Build order

Step 0 is a measurement, E1's entry condition. Every other step is its own mergeable change, RED first where it fixes a defect. The run-site table and the reference rule are settled in
this plan before step 3, because scope authorizes what they mean; only their executors come later.

0. **Measure first: M1 and M2.** Done on 2026-11-04, results in §7. Both passed.
1. The export guard and warning (§4.8). Independent, and closes the one path a password can take today.
2. The bridge door and listener (§4.1), the allow-list, and the note's schema in the contract. No UI yet.
3. Scope at the lookups and before launch, references, per-server consent, modal and audit lines (§4.2).
4. Clients read a note, the token port, down messages (§4.5), against a real `ssh -R` in CI from this step on. The harness gains a
   non-debug `sshd` MODE (`sshd -d` at `itestSshd.cjs:90` serves one connection and a bridge needs several; `ssh-agent-itest.cjs` keeps
   today's). The test writes the note itself, because the publisher arrives in step 5.
5. Supervisor, generations, note publication, host key and jump, the open flow with the scope pick (§4.3, §4.4). Reconnect joins the
   real-topology test.
6. Surviving a reboot: the record, `onDidUnlock`, the ownership lock, restore, Close from any window (§4.7).
7. The run site for Terminal and script entries, and running on the server over stdin (§4.6).
8. `creds://` in agent runs on the laptop (§4.6). With step 7 it is one pipeline.
9. Install and registration on the server (§4.5), with a check that says when the host's client is too old.
10. **Releases last, clients first:** `cli-v*` and `mcp-v*`, then the extension. Released is not installed, so the door's refusal still
    names the update. Clients are released after step 8, so the client side has stopped moving.
11. Docs, help in five languages (`CLAUDE.md` rule 7), both-sides boundaries, promotion.

Nothing reaches a person until step 5 uses the door, and scope lands before that, so the wider reach never exists unscoped.

## 6. Growth surfaces

| Surface | Size | Retired by | If interrupted |
|---|---|---|---|
| Bridge listeners | One per open bridge; single digits | Close and `dispose` | Dies with the extension host |
| Scope records in the shared storage folder | Under 1 KB per server; at most one per entry a person bridged | *Close Remote Bridge* removes it together with the bridge's record | Temp-and-rename, so an interrupted write leaves the old file; a leftover temp file is removed at the next write |
| Notes on the server | One per live bridge; single digits | Overwritten per connection; removed on Close and by the sweep when the socket is gone | A stale note is harmless (§4.3) |
| Sockets on the server | One per connection, sshd leaves them behind (`sshBridge.ts:339-357`) | A bridge unlinks its own earlier ones at each connect, listening or not, so a flapping link holds at most one; others swept when `ss` exists | Without `ss`, at most one dead file per bridge ever opened, each under 100 bytes of directory entry; said once to the person |
| Per-bridge prompt windows | One small list of timestamps per open bridge | Gone with the listener | In memory only |
| Reconnect loop | One timer per bridge | Close or window end | Dies with the extension host |
| Bridge records in the extension's storage | Under 1 KB per bridge; one per bridge a person opened | Removed by Close; a record whose entry no longer exists is removed at restore | Kept deliberately: that is the feature |
| Polls for §4.7 | One timer per record per window: non-owners try the lock every 30 s, the owner re-reads its record every 5 s | Close or window end | Dies with the extension host |
| Ownership pipes | One per owned bridge | Released by the OS on process death | Nothing is left after a power-off |
| Script files on the server, `~/.creds-for-devs/run/` | One per running script, at most the exec-slot cap (8), each the size of its body | Removed when the run ends; leftovers swept at the next connect | A killed run leaves one file until then; it holds no variable, because a script with variables does not reach the server |

## 7. Test plan

- **Door table:** bridge door × {no key, wrong key, right key} × {right port, main port, `localhost`, rebound name, `Origin` present}.
- **Scope walk:** every route in `contract/broker-v1.json` through a bridge scoped to one entry. An out-of-scope id never gets a 200,
  on any route. This test is the gate for every later route.
- **Transitive:** a `creds://` target outside the scope refuses the call; a scope narrowed while a modal is open stops
  the launch.
- **Across windows:** a scope narrowed in one window binds the owner's next check; a write from a stale copy is refused and restores nothing; a forget racing a write stays forgotten. Two accounts holding one id: the listing and the snippet answer only the bridge's account.
- **Links:** through the real exec action, an in-scope ssh entry with a linked key outside the scope runs, returns no key material, and a refusal about that key names nothing; an entry with `agentForward` is refused; a narrow during a modal promotes no waiting rotation; a token denied while its call waits does not run; one server's agent spending its prompts leaves another's untouched.
- **Generations:** a superseded attempt neither publishes nor deletes a newer note; Close during a backoff wait stays closed.
- **Consent:** quiet off asks every time; a stamp via server A covers neither B nor local; Forget clears them.
- **Real topology, in CI:** the existing user-mode `sshd` harness (`scripts/itestSshd.cjs`, `ci-extension.yml:129-146`) runs a real
  `ssh -R` to a bridge listener, then real `creds ls`, `creds ssh <alias>`, `creds ssh <token> …` and `creds-mcp` `tools/list` and a
  use call through it. Watched RED against today's code first. It replaces nothing in `creds-cli-itest.cjs`.
- **Reconnect:** kill the ssh under a running `creds-mcp`: the next call says the bridge is down, then works after the reconnect
  with no restart of `creds-mcp`. An in-flight call answers "may or may not have run" and is not repeated.
- **Several bridges:** two bridges on one server with different scopes both resolve their own entries; closing one leaves the other's note and
  reachability; a token finds its own note; an old `CREDS_BROKER_SOCKET` gets the sentence.
- **Run site:** the §4.6 table, including the refusal; the laptop path is byte-for-byte unchanged off a bridge door.
- **Secrets:** a reference's value is in the child's environment, never in argv, always in the mask table. **A file listing of the
  server before and after a run of every action shows no secret value**, the DoD of the parent plan.
- **Scripts on the server:** a body over 8000 characters runs; a script reading stdin gets end-of-file, not its own body; the body never appears in argv; the file is gone afterwards; an injected variable refuses, including one the body never mentions; end-of-file and a write error on stdin are handled.
- **Reboot, simulated in CI** (a Linux runner, so the abstract socket; the Windows pipe is M6 and M7, and a green here says nothing about it): a record present at activation restores the bridge once unlocked, with the same `bridgeId` and a new key; the note is rewritten and a client that held the old one follows.
- **Ownership:** two windows racing get one owner; a killed owner's bridge is taken over within 30 s; a locked owner releases and an unlocked window takes over; Close from a non-owner stops the owner and nothing reopens it; an edited entry target does not restore; a PIN-protected credential says "needs you" and does not loop.

**Measured on the owner's host, because CI cannot:**

| # | What | Why it matters |
|---|---|---|
| M1 | **Done 2026-11-04.** Windows OpenSSH 9.5 to Ubuntu OpenSSH 10.2, strict host key with a Windows `UserKnownHostsFile`: `-R` into the 0700 directory gives a socket of mode 600 owned by the login user, and a request reaches a listener on Windows. After the client ends the socket stays, not listening, and connecting fails at once. **Not checked: `-J`**, because this host has no jump | The bridge path has failed on real hosts before (`PLAN_cli_bridge_tail.md`) |
| M2 | **Done 2026-11-04, by suspending the client rather than dropping the network.** `sshd` keeps the session: the old path stays listening and a connect hangs (so clients need their 2 s timeout). Binding the same path fails with `remote port forwarding failed`. Unlinking the old path and binding a new one serves at once. **Not checked: how long a real network loss takes `ssh` to exit**, covered by M7 | §4.3 rests on it |
| M3 | The real `vpn-up` over a non-TTY exec as `dev2`: duration against 120 s, output size, whether it leaves stdout held, whether it has variables (§4.6) | §4.6 |
| M4 | Does a UI extension's environment collection reach terminals in a Remote-SSH window | §4.8 wording |
| M5 | `creds-mcp` in a tmux pane older than the bridge; the unix socket path length under a long home | §4.5 |
| M6 | **Done 2026-11-04.** A named pipe in VS Code's Node 24 on Windows: `EADDRINUSE` while a live process holds it, available once the holder is killed | §4.7 rests on it |
| M8 | Windows `ssh.exe` on a bridged call with `Host * / ForwardAgent yes`, a `RemoteForward`, `ForwardX11 yes` and — if Win32-OpenSSH knows the options at all — `ControlMaster auto` / `ControlPath` in the person's config, while the person's own Connect is up: the bridged option set (`ForwardAgent=no`, `ControlPath=none`, `ControlMaster=no`, `ClearAllForwardings=yes`, `ForwardX11=no`, `Tunnel=no`) really holds — no `SSH_AUTH_SOCK` on the server, no forward, a fresh connection on the port the argv names. Win32-OpenSSH is believed to have no connection multiplexing (unverified; `ssh -G` on the owner's host says whether `controlmaster` is reported). CI proves OpenSSH's precedence, and the multiplexing case, on Linux only. **Added 2026-11-05 (E1.3 spec, Amendment 4, D.1):** the bridged call is run under a written `ssh_config` (`-F`) so the options reach the `-J` hop legs too; on this host `ssh -G -F <that file> -l hop -p 1 -W "[x]:22" 127.0.0.1` reports `passwordauthentication no`, `kbdinteractiveauthentication no`, `batchmode yes`, `controlmaster false`, `clearallforwardings yes`, and `-G` of the outer with the person's own config shows their `IdentityFile` through the file's `Include` — Win32-OpenSSH's `Include` of an absolute Windows path and of `%ProgramData%\ssh\ssh_config` is the unverified part | §4.2 *never the laptop's whole agent*, change 3.1 |
| M7 | **Blocks the releases and promotion (E4).** A real reboot of the owner's PC and a real network drop. Passes when: after each, with a window open and the vault unlocked, the row reads `up` with no click; a `creds-mcp` tool call from a tmux session older than the event succeeds with no action on the server; the old note and socket are gone; `ssh` exited within 90 s of the drop; and after *Close Remote Bridge* and another reboot the bridge stays closed | Owner decision 4 |

## 8. Boundaries

| Item | Built by | The other plan's part |
|---|---|---|
| `ssh -R`, `creds` on the host, the door rules | `research/PLAN_remote_broker_bridge.md` (shipped) | This plan replaces its manager and setup block; that plan's §11 table gets a row pointing here |
| Connect SSH in a remote window, its refusal and the Remote Bridge button | `todo/PLAN_connect_in_a_remote_window.md` | Unchanged; the button now opens the new flow |
| The stable `creds` location and PATH | `todo/PLAN_creds_cli_reachable_from_every_caller.md` | Disjoint: Windows and WSL, not a remote host |
| VPN-kind entries in a remote window (`vpnRun.ts:82` gate also blocks a launcher) | A new todo, not built here | Recorded so it is not lost |
| A person's click running a script on the server in a Remote-SSH window (today refused by `pinnedTerminal`) | A new todo, not built here | This plan only rewords the refusal and keeps the trust it records |
| Found on the way, existing defects outside this plan: a linked entry's woven password is judged by the connection's flag (`sshExecAuth.ts` `byPassword`); `GET //` is never answered; deleting an entry leaves its bound values in the environment collection; `creds env` tells an agent no window has it enabled | New todos, E4 writes them | The `creds env` fall-through is E2.1's, because E2 changes that client |
| Forwarding the agent over a bridge | A new todo, not built here | Refused here until it has a boundary of its own |
| Folder verbs and create over a bridge; `ControlMaster` reuse | Todos | Refused or per-call until then |

`research/module_mcp.md:15` already claims MCP reaches the broker over a forwarded socket on Remote-SSH. That is false until step 4,
and step 11 corrects it.

Release coupling: extension, `cli-v*` and `mcp-v*` are separate tags. Windows `creds` releases stay unsigned until the signing cutover
(`todo/PLAN_windows_code_signing.md`); that does not affect the Linux binaries on the server.

## 9. Definition of Done

- [ ] On the owner's server, in tmux, Claude lists and uses through `creds-mcp` exactly the entries scoped to that server, and an entry
      outside the scope is indistinguishable from one that does not exist.
- [ ] A script entry the agent runs, `vpn-up` as `dev2` among them, runs on the server, after a consent on the laptop, and returns its exit code and output.
- [ ] A command using a password runs on the laptop; the agent sees only masked output.
- [ ] A database query runs from the laptop, and its password never reaches the server.
- [ ] Closing the window ends all access, with a clear message; reopening restores it, with no action on the server.
- [ ] **After a reboot of the PC, the bridge returns by itself once a window is open and the vault unlocked**, and only *Close Remote Bridge* ends it.
- [ ] A dropped network recovers by itself; nothing is replayed; a running `creds-mcp` needs no restart.
- [ ] File listings before and after show no secret on the server.
- [ ] The real-topology test runs in CI and was watched RED. M1-M7 are done and recorded.
- [ ] `coai` plan and code gates reached `proceed`; docs, help in five languages and both-sides boundaries are done; the plan is
      promoted with its deviations.

## Epics

Four epics, in the order of §5, each of three or four stories (the gate's operator command: 3-4 epics of 3-4 logically complete stories). E1 is the authorization boundary, and nothing reaches a person until it is in; E2 is the cross-machine
contract and the bridge's whole lifecycle, reboot included, proven against a real `sshd`; E3 is the executors the boundary authorizes; E4 delivers, clients before the extension. Each epic is one branch, one gated commit, one PR, with its own plan
review. Each epic's stories are one document, `todo/PLAN_remote_bridge_scoped_E<n>.md`, written when that epic starts; it links back here and gets its own `todo/README.md` row. Four epics make Q = 2. The story writer marks the one story in each of E1
and E2 that owns the area and updates the ledger in the same commit. Everything else named below as a security surface takes the security judgement at review, outside the quota. Story names are areas, not titles.

Cornerstones: 1 of 2 — E1.3 ([PLAN_remote_bridge_scoped_E1.md](PLAN_remote_bridge_scoped_E1.md)); the E2 area is still to be marked

### E1 — The authorization boundary. Nothing reaches a person.

- **Goal.** No password can leave by the one road open today (D7); every open bridge gets its own listener behind a door that hands `handle` a trusted `BridgeContext`; the door serves an allow-list, default deny; a bridge scoped to one server answers
  for exactly its entries on every route, and an out-of-scope entry is indistinguishable from one that does not exist; consent through server A silences neither server B nor local use. No UI, no publisher, no client change: nothing in E1 can be reached from a server.
- **Scope.** §5 steps 1-3: §4.8, §4.1, the allow-list and the note schema of §4.3 in `contract/broker-v1.json`, §4.2. New modules, since `credsAgentServer.ts` is at 779 of 800. The run-site table and the reference rule of §4.6 are settled text here; E3 builds their executors.
- **Stories.** E1.1 the export guard and the `Set env` warning (RED first; M4 recorded with it, since it decides the wording). E1.2 the per-bridge listener, the third door, the key and `BridgeContext`, with the door table. E1.3 the allow-list, the note schema, and the scope wall
  (resolvers, before-launch re-check, references, per-account listings, the file store, links and `agentForward`), with the scope walk RED first. E1.4 per-server consent, per-bridge prompts, the modal line and the audit line from the context.
- **Depends on.** Nothing in this plan.
- **Done when.** §7 door table, scope walk, transitive and consent pass; the walk refuses on the bridge door any contract route not on the allow-list, and is the gate every later route must pass; an agent's export is refused with one stable sentence while the person's `Set env` warns;
  the two existing doors are byte-for-byte unchanged (`creds-cli-itest.cjs` green, untouched); M4 recorded.
- **Cornerstone AREA.** The authorization boundary: `BridgeContext` as the only source of server identity, the allow-list as default deny, the wall at the resolvers, the before-launch re-check. A mistake here is a local process raising a modal "from" a server, or an in-scope entry becoming a road to one that is not; nothing downstream catches either.

### E2 — The contract across machines and the bridge's lifecycle, through a reboot

- **Inherits from E1.3:** the wall's two per-account suppliers are wired here, with a cache per bridge account, because a listing costs keychain reads per entry; the scope pick offers only that account's entries and names the key each uses.
- **Goal.** `creds` and `creds-mcp` on the server reach the broker through a note, one snapshot per logical call, with nothing to re-export after a reconnect; the bridge survives a dropped network and a reboot of the PC by itself, replays nothing, is owned by exactly one window, and ends only on
  *Close Remote Bridge* from any window; two bridges to one server keep their own notes and scopes; all of it proven in CI against a real `ssh -R` into a real `sshd`, watched RED first.
- **Scope.** §5 steps 4-6: §4.5, the harness's non-debug `sshd` mode and the real-topology test, §4.3, §4.4, §4.7.
- **The switch.** Everything a person can reach in E2 sits behind the switch of §4.5.
- **Stories.** E2.1 the note contract and the clients, with the harness mode and the real-topology test RED against today's code (the test writes the note itself). E2.2 the supervisor: generations, publication, sweep, backoff, host key and jump parity, the open flow and scope pick; reconnect and several-bridges cases.
  E2.3 durable intent: the record, `onDidUnlock` on both unlock paths, the ownership lock, restore in the fixed order, "needs you" for PIN and woven. E2.4 Close from any window, handover, and the reboot and ownership tests end to end.
- **Depends on.** E1.
- **Done when.** The real-topology test runs in `ci-extension.yml` and was watched RED; §7 generations, reconnect, several bridges, reboot and ownership pass; a row reads `up` only after the socket verified; nothing is published or swept without the lock held; an in-flight call during a drop answers "may or may not have run" and is not repeated; M5 recorded.
- **Cornerstone AREA.** The cross-machine contract and its lifecycle: the note as one snapshot and one endpoint in the walk on the client side; on the laptop side generation ownership of socket and note, carried across a handover by the fixed order of §4.7. The client half is frozen in the wild once on servers; the lifecycle half is where a race publishes or deletes another owner's note, or two windows both win.

### E3 — Where a stored command or script runs

- **Order inside the epic.** `run` joins the allow-list at the end of E3, after both executors pass, not in E3.1: policy alone cannot make the laptop executor run on the server.
- **Goal.** A script entry the agent runs, `vpn-up` as `dev2` among them, runs on the server after a consent on the laptop and returns exit code and output; a script that injects a variable does not run on the server; a command with a password runs on the laptop with the value in the child's environment only and the agent sees masked output; a line whose reference would have to reach the server is refused.
- **Scope.** §5 steps 7-8: §4.6 whole.
- **Stories.** E3.1 the shared run-site policy: `decideRunSite`, the script "Runs on" field, the reworded refusal, the run-site table. E3.2 scripts on the server: the private file, `/dev/null`, the variable guard, bounded stdin, the sweep, `timeoutMs`. E3.3 the laptop rows with `creds://`: environment never argv, the mask table, PIN and woven refusals.
- **Depends on.** E1 and E2; the real-topology test gains the run-site and script cases.
- **Done when.** §7 run site, scripts on the server and secrets pass, including a file listing of the server before and after a run of every action showing no secret value; the laptop path is byte-for-byte unchanged off a bridge door; M3 recorded.
- **Cornerstone AREA.** None marked. `decideRunSite`, the variable guard and the environment-not-argv rule take the security judgement at review; the table is that review's checklist.

### E4 — Delivery: install, the owner's measurements, releases clients first, docs and promotion

- **Goal.** A person installs `creds-mcp` on the server from the host menu, registers it with one shown command, and is told when the host's client is too old; a real reboot and a real network drop on the owner's PC bring the bridge back by themselves; documentation is true; the plan and its stories documents are promoted with their deviations.
- **Scope.** §5 steps 9-11: install and registration from §4.5, the too-old check, M7 and what remains of M3-M5, releases, `research/module_mcp.md:15`, help in five languages, the §8 rows and the two new todos.
- **Stories.** E4.1 the `install.sh` product switch, the host menu, the version check before the new flow opens, registration offered not written, and flipping the switch of §4.5 only after the clients are released. E4.2 the owner-host measurements and the §9 walk on the owner's server in tmux. E4.3 the releases clients first, docs and help, boundaries and todos, promotion.
- **Depends on.** E3 merged.
- **Done when.** M7 passed on its stated conditions before any release tag; every line of §9 is ticked; `coai` plan and code gates at `proceed`; the plan and its four stories documents are in `research/` with deviations.
- **Cornerstone AREA.** None.
