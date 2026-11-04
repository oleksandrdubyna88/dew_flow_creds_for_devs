# PLAN — An agent on a remote Linux server uses what the person opened to it, through a bridge scoped to that server

> Status: **plan only, nothing implemented yet, stopped for re-review, 2026-11-04.** The owner changed it twice after its approval. Scope: `src_vs_code` (broker doors, bridge lifecycle, scope,
> agent actions), `src_broker_client`, `src_cli`, `src_mcp`, `install.sh`. No server change. Extends the shipped bridge of
> [PLAN_remote_broker_bridge.md](../research/PLAN_remote_broker_bridge.md).

## Plan changes

> Epoch 1 · approved 2026-11-04 · by reviewers · state: stopped

- 1.1 · 2026-11-04 · owner · scope,dod — bridges must survive a reboot of the person's PC
- 1.2 · 2026-11-04 · owner · scope,dod,epics,approach — the VPN serves websites and vpn-up is a script entry: the db tunnel goes, scripts run on the server
  (This second change stopped the plan. Nothing is built, so the re-review has no work to sort.)

## 1. Goal

The person works in VS Code on Windows, in a Remote-SSH window attached to an Ubuntu server. The vault lives in the
extension on Windows (`extensionKind: ["ui"]`). Claude Code runs on that server, usually inside tmux. It should be able to
use, through MCP, the entries the person opened to it: run SSH commands, query databases, use a password without seeing
it, and restart a work VPN that sometimes drops by running a stored script on the server.

Today it cannot, and the reasons are not the entry kinds. The bridge is half built:

| # | Symptom | Cause (verified) |
|---|---|---|
| D1 | Claude has no working tools on the server | `Windows.cs:56` and `:126` return when the announcement folder is empty, before `BrokerClient.Create` reads `CREDS_BROKER_SOCKET` (`BrokerClient.cs:57-60`). Nothing installs or registers `creds-mcp` remotely (`mcpInstallTarget.ts:62-86`, `install.sh:65` fetches `cli-v*` only) |
| D2 | By-name `creds` calls fail through the real bridge | `Program.cs:183,303,355` build `new Endpoint(0, 1, …)`, so the request says `Host: 127.0.0.1:1`. The forward lands on the TCP port (`sshBridge.ts:216`), whose door requires the real port (`brokerOrigin.ts:200-203`). The compiled `admitsRequest` was run on these shapes: port door refuses, socket door admits. `creds-cli-itest.cjs:211-223` uses the socket door, so CI cannot see this |
| D3 | tmux loses the bridge | The path is random per open (`agentCommands.ts:447`), setup is a pasted `export` (`sshBridge.ts:247-261`), and a dropped ssh only logs (`extension.ts:196-202`) |
| D4 | The bridge skips SSH settings | `agentCommands.ts:448-452` passes neither `knownHostsFile` nor a jump, so it is always `accept-new`; the exec path honours both (`sshUseActions.ts:153,201`) |
| D5 | The socket reaches the whole broker | One router behind every door (`credsAgentServer.ts:435-489`). MCP and alias routes take no token, "never ask" settles with no modal (`brokerMcpDoor.ts`), and consent stamps carry no host (`mcpConsentPolicy.ts:85`). The config route returns a whole secret body (`brokerConfigRoute.ts:76`) |
| D6 | An agent's stored command runs on the wrong machine | The person's click runs on the server (`hostShell.ts:185-191`). The agent's run compares with and spawns on `process.platform` (`agentUseActions.ts:206,220`), so a Linux entry is refused and any other runs on Windows |
| D7 | A password can reach the server | `exportEnv` writes values to the window's environment collection with no remote check (`agentUseActions.ts:245-274`). In a Remote-SSH window those terminals are on the server. Not yet measured live (M4) |

## 2. Owner decisions (2026-11-04)

1. Finish the bridge AND scope it per server. `ssh -R` is the transport.
2. No plaintext secret reaches the server. A password is used without being seen: the laptop runs a stored command with
   the password in a variable, and the agent gets only the output.
3. No open window means no access: no daemon and no relay. Calls fail with a clear message.
4. The person's own `Set env` keeps working in a Remote-SSH window, with a warning. Only an agent's export is refused.
5. `vpn-up` is a stored Terminal entry, a bash script on the server. It needs no sudo password prompt; the plan does not
   handle one.
6. RDP is not in scope.

Assumption, stated to the owner and not objected to: the VPN is up on the server, and the databases are behind it. If
that proves false, epic-level work on the db tunnel (§4.7) is dropped and nothing else changes.

## 3. Rejected

| Option | Why |
|---|---|
| Cloud relay through the vault server | Puts the server in the agent's path, needs a sync location, carries no TCP |
| Laptop daemon so the editor may be closed | The vault lives in the extension host; needs its own unlock and consent UI; contradicts decision 3 |
| Companion `workspace` extension relaying over `executeCommand` (designed in full) | Three foundations are unmeasured (a command promise held 5 minutes, where the extension installs, whether `asExternalUri` carries raw TCP); `workspace.openTunnel` is proposed API only; a second Marketplace extension; and `ssh -R` must stay anyway for a plain SSH terminal |
| Reverse SOCKS proxy, or the VPN config on the server | A proxy hides which process connects. The config is a secret |
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

The door hands a trusted `BridgeContext` `{bridgeId, key, accountId, serverEntityId, serverName, target, remoteOs}` to
`handle`. Nothing in a request can set or change it. `credsAgentServer.ts` is at 779 of 800 lines, so new behaviour goes in
new modules (`brokerBridgeListeners.ts`, `bridgeContext.ts`).

### 4.2 Scope at the lookups, not the listings

`bridgeScope.ts` (pure) wraps the resolvers (`resolveMcpUse`, `resolveAlias`, the token's grant) and the read sources for a
bridge door, so a direct call with a known id meets the same wall as the list. Out of scope answers exactly like "not
found".

- **Stored:** `globalState`, machine-local and never in the vault, keyed by account and server entry (the argument of
  `mcpConsentPolicy.ts:13-18`).
- **Chosen:** when opening the bridge, from entries already open to MCP (the same wall as the MCP listing), and editable on
  the bridged row. A new server starts empty.
- **The bridge door serves an allow-list, default deny.** A route or action added later is refused here until it is named. Never on
  the list: `/v1/config/read`, `exportEnv`, `/v1/mcp/create`, `/v1/mcp/folder/*`.
- **Checked again just before launch.** Name resolution is one wall; a token's grant skips it, and a scope can change while a consent
  modal is open. So the scope is also checked in one place at the moment an action starts, whichever route it came by.
- **References are scoped too.** A stored command's `creds://` targets and a db entry's tunnel entry must each be in the same server's
  scope, or the call is refused naming the missing entry. Otherwise an entry in scope becomes a road to one that is not.
- **Server identity is the vault entry id** (`serverEntityId`), never a host string, so aliases and jump chains cannot split or merge it.
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
- **Every live bridge has its own note**, `<bridgeId>.json`, with `bridgeId` random per open. Two windows on one laptop to one entry are two
  bridges, and each writes and removes only its own note.
- Each connection: unlink every earlier socket of this `bridgeId`, listening or not, because the supervisor knows they are superseded and
  clients follow the note; then sweep other sockets that are not listening; spawn `ssh -R <dir>/<bridgeId>-<n>.sock:127.0.0.1:<bridgePort>`;
  verify the socket; and only then atomically write the note (mode 0600): `{socket, port, brokerPort, key, serverName, openedAt}`.
- A note whose socket is gone is removed by the same sweep, whoever wrote it.
- **Each attempt owns its generation** of socket and note; the listener and key live as long as the open bridge. A superseded attempt can neither publish nor delete a newer note
  (the identity check `sshBridgeManager.ts` already makes for a late exit, extended to verify, publish, retry and clean up).
- Close removes the note, best effort, and cancels any waiting retry. A stale note is harmless: its socket is dead and its key died
  with the listener.
- A path over the socket limit is refused with a sentence, using the limit of `src_cli/src/AgentRelay.cs:116-119`, moved to `src_broker_client` so both clients share it.
- If `ss` is absent, a bridge still unlinks its own earlier sockets; only other bridges' dead sockets stay, at most one per bridge ever
  opened, and this is said once (§6).

A connection belongs to the login user of the entry. A bridge opened on a root entry serves agents running as root; an
agent running as another user needs an entry for that login, which is another bridge.

### 4.4 The supervisor

`BridgeSupervisor` (pure, spawner and clock injected) replaces `SshBridgeManager`: `connecting → up → down(retry) → closed`,
backoff 2 to 60 s with jitter, until Close or the window ends. A row reads `up` only after `verifyBridgeSocket` (a local function at `commands/agentCommands.ts:208`, extracted for this) succeeds, never
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

**Compatibility:** an old `creds` against the new door is refused, because it has no key and the wrong port. So **clients ship
first** (`cli-v*`, `mcp-v*`), and the door's refusal says "update creds on this host". Today's working `creds ssh <token>` is the
only thing that can regress, and only between the extension release and the update on the host.

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

Unset means the server on a bridge door, as it does for the person's click, whether or not the line has references. Adding a reference to a line
therefore never moves it silently to another machine: it refuses until the person says so.

A call not on a bridge door behaves exactly as today. Content trust (`isCommandTrusted`) is unchanged: the person runs the
line once by hand first. An agent still cannot supply a command (`CommandLine.cs:129-134`). `timeoutMs` becomes sendable,
clamped by `clampExecTimeout` to 120 s. The wait ends when stdio closes (`sshExecRunner.ts:191-203`), so a script leaving a
daemon holding stdout runs to the timeout (M3).

For the laptop rows, the agent path adopts what `runWithSecrets` does for the person (`runCommands.ts:244-253`): references
resolve into the child's environment, never argv, and every resolved value joins that call's mask table. PIN and woven refusals
surface as sentences. Masking is a guard against accident only (`secretMasker.ts`); the guard against intent is that the line is
the person's, trusted, and not the agent's to change.

### 4.7 A database behind the server's VPN

A db entry gains `dbTunnelEntityId`, a typed reference like `jumpHostEntityId` (`types.ts:84`), with share stripping and id
remapping. Per call, `dbQueryAction`: picks a free loopback port, spawns `ssh -N -L 127.0.0.1:<p>:<host>:<port>` to that entry,
waits until it accepts (at most 10 s), runs the existing launch against the rewritten address with the password in that child's
environment only, and kills the tunnel in `finally`. No listener outlives a call.

**Stated limits:** the local port is reachable by local processes for those seconds; `verify-full` fails on the hostname when the
host becomes `127.0.0.1`, and the entry's form says so rather than downgrading silently; and without TLS the server can observe the
traffic. So the password is not stored on the server, but only TLS protects it from that server. The form says this next to the
field.

### 4.8 The export guard

`credentialExportEnvAction` refuses whenever `windowKind(remoteName) === 'other'`, with a sentence naming where the value would land.
On a bridge door the allow-list refuses first, in the same words, so the agent sees one stable sentence. The person's `Set env` proceeds with a warning that names the server's terminals. If M4 shows that the
collection does not reach remote terminals, the warning is dropped and the refusal stays.

## 5. Build order

Step 0 is a measurement, E1's entry condition. Every other step is its own mergeable change, RED first where it fixes a defect. The run-site table and the reference rule are settled in
this plan before step 3, because scope authorizes what they mean; only their executors come later.

0. **Measure first: M1 and M2**, by hand with Windows `ssh.exe` against the owner's host. §4.3 and §4.5 rest on them. If either fails, stop and
   rework that design before building on it.
1. The export guard and warning (§4.8). Independent, and closes the one path a password can take today.
2. The bridge door and listener (§4.1), the allow-list, and the note's schema in the contract. No UI yet.
3. Scope at the lookups and before launch, references, per-server consent, modal and audit lines (§4.2).
4. Clients read a note, the token port, down messages (§4.5), against a real `ssh -R` in CI from this step on. The harness gains a
   non-debug `sshd` MODE (`sshd -d` at `itestSshd.cjs:90` serves one connection and a bridge needs several; `ssh-agent-itest.cjs` keeps
   today's). The test writes the note itself, because the publisher arrives in step 5.
5. Supervisor, generations, note publication, host key and jump, the open flow with the scope pick (§4.3, §4.4). Reconnect joins the
   real-topology test.
6. The run site and running on the server (§4.6).
7. `creds://` in agent runs on the laptop (§4.6). With step 6 it is one pipeline.
8. The db tunnel (§4.7).
9. Install and registration on the server (§4.5), with a check that says when the host's client is too old.
10. **Releases last, clients first:** `cli-v*` and `mcp-v*`, then the extension. Released is not installed, so the door's refusal still
    names the update. Clients are released after steps 6-8, so the client side has stopped moving.
11. Docs, help in five languages (`CLAUDE.md` rule 7), both-sides boundaries, promotion.

Nothing reaches a person until step 5 uses the door, and scope lands before that, so the wider reach never exists unscoped.

## 6. Growth surfaces

| Surface | Size | Retired by | If interrupted |
|---|---|---|---|
| Bridge listeners | One per open bridge; single digits | Close and `dispose` | Dies with the extension host |
| Scope records in `globalState` | Under 1 KB per server; capped at 64 | Oldest pruned; removed by Close-and-forget | Local data, read fresh |
| Notes on the server | One per live bridge; single digits | Overwritten per connection; removed on Close and by the sweep when the socket is gone | A stale note is harmless (§4.3) |
| Sockets on the server | One per connection, sshd leaves them behind (`sshBridge.ts:339-357`) | A bridge unlinks its own earlier ones at each connect, listening or not, so a flapping link holds at most one; others swept when `ss` exists | Without `ss`, at most one dead file per bridge ever opened, each under 100 bytes of directory entry; said once to the person |
| Reconnect loop | One timer per bridge | Close or window end | Dies with the extension host |
| Db tunnel processes | At most the exec-slot cap (8) | `finally` per call | Killed with the window by the existing child handling; a port is never reused across calls |

## 7. Test plan

- **Door table:** bridge door × {no key, wrong key, right key} × {right port, main port, `localhost`, rebound name, `Origin` present}.
- **Scope walk:** every route in `contract/broker-v1.json` through a bridge scoped to one entry. An out-of-scope id never gets a 200,
  on any route. This test is the gate for every later route.
- **Transitive:** a `creds://` target or tunnel entry outside the scope refuses the call; a scope narrowed while a modal is open stops
  the launch.
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
- **Db tunnel:** argv shape, address rewrite for URI and key-value forms, tunnel killed on success, failure, timeout and abandon.

**Measured on the owner's host, because CI cannot:**

| # | What | Why it matters |
|---|---|---|
| M1 | Windows `ssh.exe`: `-R` into the 0700 directory, with `-J` and a Windows `UserKnownHostsFile`; the socket's mode | The bridge path has failed on real hosts before (`PLAN_cli_bridge_tail.md`) |
| M2 | Drop the laptop's network: how long until ssh exits, and whether the new connection serves while the old `sshd` still holds its socket | §4.3 rests on it |
| M3 | The real `vpn-up` over a non-TTY exec: duration against 120 s, output size, whether it leaves stdout held | §4.6 |
| M4 | Does a UI extension's environment collection reach terminals in a Remote-SSH window | §4.8 wording |
| M5 | `creds-mcp` in a tmux pane older than the bridge; the unix socket path length under a long home | §4.5 |
| M6 | `psql` through the tunnel with the owner's TLS settings | §4.7 |

## 8. Boundaries

| Item | Built by | The other plan's part |
|---|---|---|
| `ssh -R`, `creds` on the host, the door rules | `research/PLAN_remote_broker_bridge.md` (shipped) | This plan replaces its manager and setup block; that plan's §11 table gets a row pointing here |
| Connect SSH in a remote window, its refusal and the Remote Bridge button | `todo/PLAN_connect_in_a_remote_window.md` | Unchanged; the button now opens the new flow |
| The stable `creds` location and PATH | `todo/PLAN_creds_cli_reachable_from_every_caller.md` | Disjoint: Windows and WSL, not a remote host |
| VPN-kind entries in a remote window (`vpnRun.ts:82` gate also blocks a launcher) | A new todo, not built here | Recorded so it is not lost |
| Folder verbs and create over a bridge; `ControlMaster` reuse | Todos | Refused or per-call until then |

`research/module_mcp.md:15` already claims MCP reaches the broker over a forwarded socket on Remote-SSH. That is false until step 4,
and step 11 corrects it.

Release coupling: extension, `cli-v*` and `mcp-v*` are separate tags. Windows `creds` releases stay unsigned until the signing cutover
(`todo/PLAN_windows_code_signing.md`); that does not affect the Linux binaries on the server.

## 9. Definition of Done

- [ ] On the owner's server, in tmux, Claude lists and uses through `creds-mcp` exactly the entries scoped to that server, and an entry
      outside the scope is indistinguishable from one that does not exist.
- [ ] `vpn-up` restarted by the agent runs on the server, after a consent on the laptop, and returns its exit code and output.
- [ ] A command using a password runs on the laptop; the agent sees only masked output.
- [ ] A database behind the server's VPN answers a query, with the password never stored on the server.
- [ ] Closing the window ends all access, with a clear message; reopening restores it, with no action on the server.
- [ ] A dropped network recovers by itself; nothing is replayed; a running `creds-mcp` needs no restart.
- [ ] File listings before and after show no secret on the server.
- [ ] The real-topology test runs in CI and was watched RED. M1-M6 are done and recorded.
- [ ] `coai` plan and code gates reached `proceed`; docs, help in five languages and both-sides boundaries are done; the plan is
      promoted with its deviations.

## Epics

Four epics, in the order of §5, each of three or four stories (the gate's operator command: 3-4 epics of 3-4 logically complete stories). E1 is the
authorization boundary and lands before anything reaches a person; E2 makes the bridge usable and proves it against a real `sshd`; E3 is the executors
the boundary authorizes; E4 delivers, clients before the extension. Each epic is one branch and one gated commit with its own plan review, so one PR per
epic, in sequence. Each epic's stories are one document, `todo/PLAN_remote_bridge_scoped_E<n>.md`, written when that epic starts; it links back here and
gets its own `todo/README.md` row. Four epics make Q = 2. The story writer marks the one story in each of E1 and E2 that owns the area and updates the
ledger in the same commit. E3's `decideRunSite` and tunnel take the security judgement at review, outside the quota. Story names below are areas, not titles.

Cornerstones: 0 of 2 — no story marked yet; the areas are named in E1 and E2

### E1 — The authorization boundary

- **Goal.** No password can leave by the one road open today; every open bridge gets its own listener behind a door that hands `handle` a trusted
  `BridgeContext` nothing in a request can set; the door serves an allow-list, default deny; a bridge scoped to one server answers for exactly its entries
  on every route, and an out-of-scope entry is indistinguishable from one that does not exist; consent through server A silences neither server B nor
  local use. Nothing is wired to a person yet.
- **Scope.** §5 steps 0-3. Step 0 (M1, M2) is this epic's entry condition, recorded in its stories document before any story is coded; if either fails the
  plan is reworked first. Then §4.8, §4.1, §4.2, and the note schema in `contract/broker-v1.json`. New modules throughout: `credsAgentServer.ts` is at 779 of 800.
- **Stories.** E1.1 the export guard and warning. E1.2 the listener, the door, the key and `BridgeContext`, with the door table. E1.3 the allow-list, the note
  schema and the scope wall (resolvers, before launch, transitive), with the scope walk RED first. E1.4 per-server consent, modal and audit lines.
- **Depends on.** Nothing in this plan; M1 and M2 recorded.
- **Done when.** The §7 door table, scope walk, transitive and consent tests pass, and the walk refuses on the bridge door any contract route not on the
  allow-list; an agent's export is refused with one stable sentence while the person's `Set env` warns; the two existing doors are byte-for-byte unchanged
  (`creds-cli-itest.cjs` green and untouched); M1, M2 and M4 recorded.
- **Cornerstone AREA.** The authorization boundary: the door's trusted context as the only source of server identity, the allow-list as default deny, the
  wall at the resolvers, the before-launch re-check. A mistake here is a local process raising a modal "from" a server, or an entry in scope becoming a road
  to one that is not, and nothing downstream can catch either.

### E2 — The contract across machines and its lifecycle, proven on a real topology

- **Goal.** `creds` and `creds-mcp` on the server reach the broker through a note, one snapshot per logical call, with nothing to re-export after a reconnect;
  the bridge survives a dropped network by itself and replays nothing; two bridges to one server keep their own notes and scopes; the whole path is proven in
  CI against a real `ssh -R` into a real `sshd`, watched RED first.
- **Scope.** §5 steps 4-5 (§4.5, §4.3, §4.4).
- **Stories.** E2.1 the harness mode and the real-topology test, RED against today's code, writing two notes with different `brokerPort`s itself. E2.2 the
  clients: the note as endpoint, key and port, the token's note by `brokerPort`, the override, the down messages, the shared socket limit; the test goes green.
  E2.3 the supervisor: generations, publication, sweep, backoff, Close. E2.4 host key and jump with parity, the open flow and scope pick, and the reconnect and
  several-bridges cases.
- **Depends on.** E1.
- **Done when.** The real-topology test runs in `ci-extension.yml` and was watched RED; the §7 generations, reconnect and several-bridges tests pass; a row
  reads `up` only after the socket verified; an in-flight call during a drop answers "may or may not have run" and is not repeated; M5 recorded.
- **Cornerstone AREA.** The cross-machine contract and its lifecycle: the note as one snapshot and one endpoint on the client side, generation ownership on the
  supervisor side. The client half is frozen in the wild once on servers; the supervisor half is where a race deletes another bridge's live note.

### E3 — Where a stored command runs, and a database behind the server's VPN

- **Goal.** `vpn-up` restarted by the agent runs on the server after a consent on the laptop and returns exit code and output; a command with a password runs on
  the laptop with the value in the child's environment only, and the agent sees masked output; a line whose reference would have to reach the server is refused;
  a database behind the server's VPN answers with the password never stored on the server, through a tunnel no listener outlives.
- **Scope.** §5 steps 6-8 (§4.6, §4.7).
- **Stories.** E3.1 `decideRunSite` and the server rows, with `timeoutMs`. E3.2 the laptop rows with `creds://`. E3.3 the typed tunnel reference, share, remap and
  form. E3.4 the per-call tunnel. If the §2 assumption proves false, E3.3 and E3.4 are dropped; nothing else changes.
- **Depends on.** E1 and E2.
- **Done when.** The §7 run-site, secrets and db tunnel tests pass; the path off a bridge door is byte-for-byte unchanged; M3 and M6 recorded.
- **Cornerstone AREA.** None marked. `decideRunSite`, the environment-not-argv rule and the tunnel's lifetime take the security judgement at review; the table is
  that review's checklist.

### E4 — Delivery: install, registration, releases clients first, docs and promotion

- **Goal.** A person installs `creds-mcp` on the server from the host menu, registers it with one shown command, is told when the host's client is too old, reads
  documentation that is true, and the §9 Definition of Done is walked on the owner's server.
- **Scope.** §5 steps 9-11.
- **Stories.** E4.1 install and the host menu, with the too-old check. E4.2 registration, docs and the five-language help. E4.3 releases clients first, the DoD walk in
  tmux, the both-sides boundaries, the new VPN-kind todo, promotion with deviations.
- **Depends on.** E3 merged; M1-M6 recorded.
- **Done when.** Every line of §9 is ticked; the plan and its four stories documents are in `research/` with deviations and the three link cases fixed.
- **Cornerstone AREA.** None.
