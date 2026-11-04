# PLAN — The scoped remote bridge, E1: the authorization boundary. Nothing reaches a person.

> Status: **plan only, nothing implemented yet, 2026-11-04.** Stories of epic E1 of [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) (§4.1, §4.2, §4.3 schema only, §4.8, §5 steps 1-3, §7, `## Epics` E1).
> Scope: `src_vs_code/src` (new modules, the broker, one wiring argument), `src_vs_code/scripts/emit-contract.mjs`, `contract/broker-v1.json`. No client, no UI, no publisher, no server change. Branch `feat/remote-bridge-e1`; one gated commit, one PR.

Every path below is relative to `src_vs_code/src/` unless it says otherwise. Every `file:line` was opened on commit c6800b8.

## What E1 builds, in one paragraph

Four things, none reachable from a server when E1 ends. An agent's `exportEnv` is refused in a Remote-SSH window, and the
person's own binding warns (E1.1). Each bridge gets its own loopback listener behind a third door that requires a key and hands the
router a trusted `BridgeContext` (E1.2). That door serves an allow-list, default deny, and every lookup behind it is walled to the
entries scoped to that server, again at the moment an action starts, including references (E1.3). Consent through a bridge
asks every call unless the server's `quiet` switch is on, stamps are keyed by server, and the modal and the audit line
name the server from the context (E1.4). E2 is what first opens a listener for a person.

## Stories, and who writes what

| Story | Area | Spec and scenarios | Code and tests | Review | Security judgement |
|---|---|---|---|---|---|
| E1.1 | Export guard, `Set env` warning, M4 | Opus, this document | Sonnet | Opus | not needed: no authentication or authorisation decision |
| E1.2 | Listener, third door, key, `BridgeContext` | Opus, this document | Sonnet | Opus | **Fable, at review, outside the quota** (authentication: the key) |
| **E1.3 — cornerstone, `model: fable` on its spec** | Allow-list, note schema, scope wall | **Fable**: `todo/PLAN_remote_bridge_scoped_E1_S3_spec.md`, written from the section below, with its own `todo/README.md` row | Sonnet | Opus | Fable, at review, outside the quota |
| E1.4 | Per-server consent, modal line, audit line | Opus, this document | Sonnet | Opus | **Fable, at review, outside the quota** (authorisation: what silences a prompt) |

The parent's ledger reads `Cornerstones: 1 of 2`. E1.3 is the one mark in E1, because it owns what nothing downstream catches: `BridgeContext` as the
only identity, default deny, the wall at the resolvers, the re-check before launch. The rule's Security row covers
authentication and authorisation, so E1.2 and E1.4 take that judgement too, and neither spends the quota. The coai gate runs once for
E1 on this branch: `review_plan` first, `review_code` on the finished branch. The stories stay as the epic names them; the code showed one
sequencing fact (E1.2 lands default deny with a table of one route, so the door never exists unscoped) and no reason to re-split.

## Binding constraints, for every story

- **`credsAgentServer.ts` is 779 of 800 lines** (ESLint `max-lines`, `eslint.config.mjs:30`). New behaviour goes in new modules. E1.2's first edit moves `readBody`
  (`credsAgentServer.ts:756-772`) to `brokerRequests.ts`, which frees 17 lines. Budget: E1.2 +12, E1.3 +20, E1.4 +3, so at most 797 at the end. If a story passes its budget, it moves code out instead of asking for more.
- **`extension.ts` is 1003 lines and its ratchet baseline is 1003** (`src_vs_code/.size-baseline.json`). It may not gain a line. E1 changes two existing lines of it and adds none.
- **Lint limits:** complexity 4, 50 code lines per function (120 in tests), `eslint.config.mjs:30-32,60`.
- **Pure logic imports no `vscode`** (`CLAUDE.md` rule 3). `bridgeContext.ts`, `brokerBridgeListeners.ts`, `bridgeAllowList.ts`, `bridgeScope.ts`, `bridgeNote.ts`, `bridgeConsentText.ts` import none, and `envApplyNotice.ts` stays free of it.
  A test reads each file's source and asserts no `from 'vscode'` (scenario R2).
- **Nothing is reachable from a server.** No UI, no publisher, no client change; no `package.json` command. Nothing in production calls `openBridgeListener`, and `extension.ts` passes no `bridgeWall`. Scenario R1 asserts this; E2.2 removes R1 in the commit that opens the flow.
- **`creds-cli-itest.cjs` stays green and untouched.** `src_cli`, `src_mcp`, `src_broker_client`, `install.sh` have an empty diff.
- **The two existing doors are byte-for-byte unchanged in behaviour.** `admitsRequest` (`brokerOrigin.ts:161-163`) keeps its signature and answers. Scenario R3 is written first and watched GREEN on untouched code, with literal expected answers, and must stay green with no edit.

## The commands

From the repository root, following `CLAUDE.md` §Commands. `npm test` and every `npm run itest:*` lower themselves (`scripts/lower-priority.mjs`); everything else goes through `$LP`.

```bash
LP=$PWD/.claude/rules/shared/tools/low-priority.mjs
cd src_vs_code && npm ci
node $LP npm run typecheck
node $LP npm run lint
node $LP npm run ratchet                                    # extension.ts must not have grown
node $LP npm run compile                                    # before a single test file:
node $LP node --test --test-concurrency=1 out/test/<name>.test.js
npm test                                                    # the whole suite, at most 8 workers
```

Each story names the extra commands it needs. Before the PR, the whole set, one after another:

```bash
cd "$(git rev-parse --show-toplevel)"
node $LP dotnet build dew_flow_creds_for_devs.slnx -c Debug -m:4 --disable-build-servers
node $LP ./src_broker_client/tests/bin/Debug/net10.0/CredsBroker.Tests     # the embedded contract grew; clients must not care
cd src_vs_code && npm test && npm run itest:agent && npm run itest:cli && npm run itest:mcp && npm run itest:ssh-agent
cd .. && git diff --exit-code main -- src_vs_code/scripts/creds-cli-itest.cjs src_cli src_mcp src_broker_client install.sh
node .claude/rules/shared/tools/plan-lifecycle.mjs && node .claude/rules/shared/tools/pin-check.mjs
```

## Scenarios that hold for the whole epic (written in E1.2, kept to the end)

File: `test/bridgeBoundary.test.ts`.

| # | Scenario | Passes when |
|---|---|---|
| R1 | Nothing opens a bridge door | Reading `extension.ts` and every `commands/*.ts`: no `openBridgeListener`, no `bridgeWall`. Same technique as `test/mcpHooks.test.ts:249`. `package.json` has no new command |
| R2 | The new modules are pure | No `vscode` import in the six files above |
| R3 | **GREEN first.** The two existing doors answer as today | Through the real port door and the real socket door (`world({storageDir})`, as `test/brokerOriginDoor.test.ts` does): one request per contract route, one browser-shaped, one wrong `Host`. Status and body compared with literals recorded from untouched code. `durationMs` is stripped. No expected value is edited in any later story |
| R4 | A bridge cannot open without the wall (from E1.3) | `openBridgeListener` with no `bridgeWall` hook rejects with `Error('A Remote Bridge cannot open without its scope wall.')` and binds no port |

---

## E1.1 — The export guard and the `Set env` warning (RED first; M4)

Closes D7, the one road a password can take today. Independent of the other three stories.

### What changes

1. **`brokerProtocol.ts`**, beside `INTERNAL_FAILURE` (`:95`), one exported constant. The same words on every door:

   ```text
   EXPORT_REFUSED = 'An agent cannot export a secret here: the value would land in the terminals of another computer (this window's, or the server behind a Remote Bridge). Where the person has stored a command for the job, run that instead: the agent gets only its output.'
   ```

   It claims two things only. It does not say "no secret leaves the computer that holds the vault": owner decision 5 lets a person put a value on the server, so that sentence would be false. And it does not say "use a stored command" flatly: no agent executor resolves a `creds://` reference before E3 (`agentUseActions.ts:150,201,221` run the text as saved), so a stored command cannot be promised to carry a vault value. It points at a command the person already has.

2. **`useActions.ts:90`.** `validate` may name a code: `{ ok: true } | { ok: false; message: string; code?: ErrorCode }`. Import `ErrorCode` as a type.
3. **`credsAgentServer.ts:550`.** `this.respondError(res, validated.code ?? 'invalid_request', validated.message, …)`. Zero added lines; every existing action sends no code, so nothing else changes.
4. **`agentUseActions.ts:245-274`.** `credentialExportEnvAction(deps: AgentUseDeps & { remoteName: string | undefined })`. Its `validate` (`:255`) becomes:
   `windowKind(deps.remoteName) === 'other' ? { ok: false, code: 'denied', message: EXPORT_REFUSED } : { ok: true }`. `windowKind` is `hostShell.ts:154`, already a neighbour (`agentUseActions.ts:20`).
   In `validate` and not in `run`, because validation runs before the modal (`credsAgentServer.ts:515,524`): a person is never asked to allow something that will be refused. `denied` (403), and neither `not_supported` nor `invalid_request`. `not_supported` is a 404 (`brokerProtocol.ts:46`): the CLI reads every 404 as "this window does not have that name" and tries the next window (`src_cli/src/Program.cs:209`), and if none answers otherwise it says no window has the entry enabled and exits 93, `entityGone` (`Program.cs:219-220`; `ExitForError` maps `not_supported` to the same code), for an entry that exists. `invalid_request` would tell the agent its own request was wrong (`src_mcp/src/UseTools.cs:502`). `denied` stops the walk on both clients: the CLI falls through only on a 404, so a 403 goes to `ReportError` and exit `denied` (`Program.cs:209-216,451`); the MCP walk moves on only from `not_found` (`Windows.cs:160-161`, `MeansNotMine`); and `UseTools.cs:503` hints "Ask the person to allow it, or … unless the message says it cannot be done by an agent at all, in which case the person does it themselves", which is the case. Checked by reading those lines; no client was run, and `src_cli` is untouched.
5. **`extension.ts:640`,** same line count: `useActions.register(credentialExportEnvAction({ ...agentDeps, remoteName: vscode.env.remoteName }));`
6. **`envApplyNotice.ts:36`.** `envAppliedNotice(result, remoteName?: string)`. When `written` is not empty and `windowKind(remoteName) === 'other'`, the `warning` gains this sentence, after any withheld sentences:

   ```text
   One name:  $X reaches another computer: the new terminals of this window run there (ssh-remote), so each one starts on that computer with the value in its environment, where any process running under your login can read it. The value stays until you remove the binding through Edit in this window; deleting the entry does not remove it. Terminals already open keep it until they close.
   Two names: $X, $Y reach another computer: the new terminals of this window run there (ssh-remote), so each one starts on that computer with the values in their environment, where any process running under your login can read them. The values stay until you remove their bindings through Edit in this window; deleting the entry does not remove them. Terminals already open keep them until they close.
   ```

   "Through Edit in this window" because that is the road that applies the bindings to the collection; deleting the entry applies nothing (a gap, recorded below for E4), so the sentence must not let a person believe a delete takes the value back.

   `(ssh-remote)` is the `remoteName` given. `writtenSentence` (`:44`) is unchanged, so the person still sees "set for NEW integrated terminals". The value is still written: owner decision 5.
7. **`envCollectionRef.ts:12,34`.** `setEnvCollection(value, remoteName?: string)` keeps the second argument in a module variable, and `showEnvNotice` passes it on. A module variable rather than `vscode.env.remoteName` at the call, because the stubs in `test/revisionRestore.test.ts`, `test/addEntityPin.test.ts` and others have no `env` and call `showEnvNotice` through real code; they stay untouched and read as local.
8. **`extension.ts:126`,** same line count: `setEnvCollection(context.environmentVariableCollection, vscode.env.remoteName);`

The warning goes in the notice and not at the `ENV` button, which is wider than the plan's words: `showEnvNotice` is the one sentence every surface that writes the collection says (the viewer `entityViewerCommands.ts:284`, create `commands/treeMutationCommands.ts:339`, edit `entityEditCommands.ts:344`, restore `revisionRestore.ts:99`), and a save with a binding writes the same value to the same terminals as the button.

### What stays untouched

`applyEnvBindings`, `exposeEnv`, `settleReadings` (`envApply.ts`): what is written, and what the policy withholds. Export in a local or WSL window: `windowKind` answers `local` or `wsl`, and `pinnedShellRefusal` (`hostShell.ts:264`) already treats WSL as this machine.

### Scenarios

In `test/agentUseActions.test.ts` and `test/envApplyNotice.test.ts`; `X3` in a new `test/exportRefused.test.ts`.

| # | Scenario | Expected |
|---|---|---|
| X1 | **RED first.** `credentialExportEnvAction({… remoteName: 'ssh-remote'})`, an entry with a binding | Today `applyEnv` is called and `written` comes back: watch that. After: `validate` answers `{ok:false, code:'denied', message: EXPORT_REFUSED}`. That `applyEnv` was never called is asserted in X3, through the broker: `validate` alone cannot show it |
| X2 | The table | `undefined`, `''`, `'wsl'` admit. `'ssh-remote'`, `'dev-container'`, `'attached-container'`, `'codespaces'`, and an unknown `'tunnel'` refuse with exactly `EXPORT_REFUSED`. The sentence does not vary with the name |
| X3 | Through the real broker: `world({ realAction: credentialExportEnvAction(…), supports: ['exec'], alias: … })`, and on the real route: `world({ kind: 'credential', realAction: …, supports: ['exportEnv'] })` | On `/v1/use/exec` with a token, `/v1/alias/exec`, `/v1/use/exportEnv` with a `credential` token, and `/v1/mcp/use/exportEnv`: status 403, `error.code === 'denied'`, message `EXPORT_REFUSED`; `w.dialogs` is empty; `applyEnv` not called. Control: the same `/v1/use/exportEnv` in a local window answers 200 `{written}` after one dialog |
| X5 | The window passes its real remote name (`test/exportWiring.test.ts`) | Reading `extension.ts`: `setEnvCollection(…, vscode.env.remoteName)` and `credentialExportEnvAction({ ...agentDeps, remoteName: vscode.env.remoteName })` each appear once, and a companion shows the scan matches the real lines and not the argument-less forms. Deleting either argument turns it RED |
| X4 | The other actions are unchanged by the new optional code | An action whose `validate` sends no code still answers `invalid_request` (existing `validate` cases in `test/credsAgentServer.test.ts` stay green with no edit) |
| W1 | **RED first.** `envAppliedNotice({written:['X'],withheld:[]}, 'ssh-remote')` | `info` as today; `warning` is exactly the one-name sentence |
| W2 | Two names, and a withheld name beside them | Exactly the two-name sentence, after the withheld sentence |
| W3 | `undefined`, `'wsl'`, and `written: []` in `ssh-remote` | No such sentence. `envAppliedNotice(result)` with one argument equals today's answer |
| W4 | `setEnvCollection(env, 'ssh-remote')`, then a real `showEnvNotice` | The stubbed `showWarningMessage` got the sentence and the collection was still written (`test/envSaveNotice.test.ts:272-275` shows the road) |

Commands: the common block, with `<name>` = `agentUseActions`, `envApplyNotice`, `exportRefused`, `exportWiring`, `envSaveNotice`.

### M4 — how the person measures it, and where the result goes

CI has no Remote-SSH window, so this is measured by a person, and it needs no build: the released extension writes the collection already.

1. On Windows, open a Remote-SSH window to the server.
2. Make a throwaway Credential entry `m4-canary` with password `m4-canary-value`, and bind that field to `CREDS_M4_CANARY`. Press **ENV** in its viewer.
3. In the same window open a **new** integrated terminal. It must be on the server: run `hostname`.
4. Run `printenv CREDS_M4_CANARY`.
5. Reload the window, open another new terminal, and run step 4 again: the collection persists across reloads (`envApply.ts:19-21`), and this says whether the persisted value reaches it too.
6. Open the entry's **Edit**, in the same window, switch the binding off and save, then reload. Run step 4 a third time to confirm the value went. (Deleting the entry is not the road: it applies no bindings, so the value is expected to stay. That is the gap recorded below for E4.)

**The wording above is written for the case it does reach**, which is the safe assumption. If steps 4 and 5 print nothing: delete the sentence, W1, W2 and W4, keep `EXPORT_REFUSED` and X1-X4 (§4.8: the refusal stays), and say so in the PR. Record the result here, in the table below, in the same commit. E4 carries it to §7 of the parent at promotion.

| M4 | Result |
|---|---|
| Date, VS Code version, Remote-SSH version, `hostname` | not measured yet |
| Step 4, new terminal | not measured yet |
| Step 5, after a reload | not measured yet |
| Step 6, after the binding is removed through Edit in the same window and a reload | not measured yet |

---

## E1.2 — The per-bridge listener, the third door, the key, `BridgeContext`

Depends on nothing but the common constraints. Security-judged by Fable at review. Starts by writing R1-R3.

### What changes

1. **`credsAgentServer.ts:756-772` → `brokerRequests.ts`.** Move `readBody` as it is and export it. Nothing else in this step, so the diff is one move.
2. **New `bridgeContext.ts`** (pure). The context a door hands the router:

   ```ts
   export interface BridgeContext {
     readonly bridgeId: string;
     readonly accountId: string;
     readonly serverEntityId: string;   // the vault entry's id: the only server identity
     readonly serverName: string;       // for the modal and the audit line; decides nothing
     readonly target: string;           // user@host:port, for E2's restore comparison
     readonly remoteOs: string | undefined;
   }
   ```

   The key is **not** in it (a correction to §4.1, see *Gaps*): the door compares it and nothing behind the door needs it, so it cannot reach a grant or a log line. `freezeBridgeContext(c)` returns `Object.freeze({...c})`.
3. **`brokerOrigin.ts`.** The third door, still only obtainable from `doorsFor`, so "every listener is covered" stays structural.
   - `behindTheDoor` (`:44-57`) and `turnAwayAtTheDoor` (`:108-121`) take the decision as a function `(headers) => DoorRefusal | undefined`, and `handle` gains a third parameter: `export type Handle = (req, res, bridge: BridgeContext | undefined) => void`. `onThePort` and `onTheSocket` pass `admitsRequest` and an explicit `undefined`, the doctrine of `brokerMcpDoor.ts:86-88`: written, never omitted.
   - `Doors` (`:63-66`) gains `forBridge(port: number, key: string, context: BridgeContext): Served`.
   - New exported `admitsBridgeRequest(headers, at: { port: number; key: string }): DoorRefusal | undefined`, deciding in this order:
     1. `browserMarked(headers)` → `REFUSED` (`:151-153`, unchanged)
     2. no `x-creds-bridge` header → `BRIDGE_NO_KEY`
     3. the key differs → `BRIDGE_WRONG_KEY`. Constant time: `timingSafeEqual(sha256(given), sha256(key))`, digests so a different length neither throws nor returns early. Node joins a repeated header with `, `, so it compares unequal.
     4. `!loopbackHost(headers.host, at)` (`:200-203`) → `REFUSED`

     No key is decided before `Host` on purpose: §4.5's old `creds` sends `Host: 127.0.0.1:1` or the main port and no key, and it must be told to update rather than be told it looks like a browser. Nothing leaks by this order: all three answers are 403 and carry only a fixed sentence.

     ```text
     BRIDGE_NO_KEY    = 'This is a Remote Bridge listener, and this request carries no bridge key. Update creds on this host: this version cannot use it. Nothing ran.'
     BRIDGE_WRONG_KEY = 'This Remote Bridge listener did not accept that key. The bridge has reconnected or closed. Nothing ran.'
     ```

   - The header name comes from `bridgeNote.ts` (`BRIDGE_KEY_HEADER = 'X-Creds-Bridge'`; create that file here with this one constant, E1.3 grows it).
   - Notes: a `REFUSED` answer shares the window's existing `once` (`:81-87`). A key refusal has its own once-per-window note, because `REFUSAL_NOTE` says "browser-shaped", which would be false: `'Something on this machine called a Remote Bridge listener without its key, and it was refused. Nothing ran and nothing was asked of you. An older creds on that server does this too; updating it stops this line.'`
4. **New `brokerBridgeListeners.ts`** (pure: `node:http`, `node:crypto`, and `startLoopbackServer`, which is `loopbackServer.ts:13`).

   ```ts
   export interface BridgeListener { readonly port: number; readonly key: string; close(): Promise<void>; }
   export class BridgeListeners {
     constructor(doorFor: (port: number, key: string, context: BridgeContext) => Served);
     open(context: BridgeContext): Promise<BridgeListener>;
     closeAll(): void;
   }
   ```

   **Opens for one `bridgeId` are serialized.** A reconnect can overlap an open, and a map write would otherwise drop the earlier server without closing it, leaving its port and key usable. So the id is reserved before the first await, a second open waits for the first, and a superseded listener is closed before the new one is returned. Scenario: two overlapping opens; afterwards the earlier port refuses connections and its key serves nothing.

   `open` starts a loopback server, mints `randomBytes(32).toString('base64url')`, attaches the door with `server.on('request', …)` as `credsAgentServer.ts:193-196` does, and holds the server in a `Map` keyed by bridge id. A second `open` for a live `bridgeId` closes the first: a key lives per open (§4.1). `close()` calls `server.close()` **and** `server.closeAllConnections()`, because a keep-alive connection that outlives its bridge would otherwise still be served. Closed twice is a no-op.
5. **New `bridgeAllowList.ts`** (pure). Default deny from the first commit: `bridgeRouteRefusal(method, pathname)` knows one route, `GET /v1/health`, and refuses all else with

   ```text
   BRIDGE_NOT_SERVED = 'A Remote Bridge does not serve this request. A person can do it in the VS Code window.'     code: not_supported
   ```

   E1.3 fills the table. So the wider reach never exists unscoped, even between two commits of this branch.
6. **`credsAgentServer.ts`.** `handle` (`:435`) gains `bridge: BridgeContext | undefined`, and first thing after `signal` (`:438`):
   `const refused = bridge === undefined ? undefined : bridgeRouteRefusal(req.method, url.pathname);` then, if refused, `res.setHeader('Connection', 'close')` (the body was never read, the reason at `brokerOrigin.ts:105-106`) and `respondError`. `doors` (`:670-675`) passes all three arguments. A field `bridgeListeners = new BridgeListeners((p, k, c) => this.doors.forBridge(p, k, c))`; a public `async openBridgeListener(context): Promise<BridgeListener>` that awaits `ensureStarted()` and opens; `dispose` (`:747-753`) calls `closeAll()`.

### What stays untouched

`admitsRequest`, `browserMarked`, `loopbackHost`, `REFUSED`, `REFUSAL_NOTE`; `startExtraListener` and `socketPathFor` (`brokerListeners.ts`); `sshBridge.ts`, `sshBridgeManager.ts`, `commands/agentCommands.ts` (E2 replaces them); `doorFor`, `perform` and everything after the new guard in `handle`.

### Scenarios

`test/brokerBridgeDoor.test.ts` decides on headers; `test/brokerBridgeListeners.test.ts` runs over real HTTP with the `raw` helper of `test/brokerOriginDoor.test.ts:15-27`, because `fetch` cannot set `Host`.

**The door table (§7).** `<bp>` is the bridge's port, `<mp>` the main broker's. "R" is `REFUSED`, "NK" `BRIDGE_NO_KEY`, "WK" `BRIDGE_WRONG_KEY`, all with status 403, code `forbidden`, `Connection: close`, and nothing routed.

| `Host` and browser headers | No key | Wrong key | Right key |
|---|---|---|---|
| `127.0.0.1:<bp>` | NK | WK | **admitted** |
| `localhost:<bp>` | NK | WK | **admitted**, the existing loopback rule |
| `127.0.0.1:<mp>`, the main port | NK | WK | R |
| `localhost` with no port | NK | WK | R |
| `127.0.0.1:1`, today's by-name `creds` (D2) | NK | WK | R |
| `evil.example:<bp>`, rebound | NK | WK | R |
| `127.0.0.1:<bp>` with `Origin: http://evil.example` | R | R | R |
| `127.0.0.1:<bp>` with `Sec-Fetch-Site: cross-site` | R | R | R |

| # | Scenario | Expected |
|---|---|---|
| D1 | The table, cell by cell, on `admitsBridgeRequest` and again over HTTP | As above. On every refusal `w.dialogs` and `w.ran` are empty |
| D2 | Key shapes | Empty header, a key of another length, a key differing in the last byte, two `X-Creds-Bridge` headers: all WK, none throws |
| D3 | `admitsRequest` is unaffected | The header `X-Creds-Bridge` changes nothing on the port and socket doors: R3, plus a right-key request to the main port answers exactly as without it |
| D4 | The key is per listener | Bridge A's key on bridge B's port: WK. A second `open` with the same `bridgeId`: a new port and a new key, the old key refused, the old port closed |
| D5 | The key dies with the listener | After `close()` a new connection is refused, and a connection held open with `agent: new http.Agent({ keepAlive: true })` gets no answer |
| D6 | Two listeners at once | Each has its own port, key and context. Closing one leaves the other serving. A modal open when a bridge closes is S12: no bridged route can raise one until E1.3 |
| D7 | The right key reaches `handle` with its context | A spy handle sees `bridge` deep-equal to the context, frozen, and with no `key` property. On the port and socket doors it sees `undefined` |
| D8 | Nothing in a request can set the context | Headers `X-Creds-Server: other`, `X-Bridge-Id: other`, and a query string naming another entry: the spy sees the same context |
| D9 | Default deny at this stage | With the right key: `GET /v1/health` is 200 and its usual body. `POST /v1/use/exec`, `GET /v1/aliases`, `POST /v1/config/read`, `GET /v1/nope`: 404, `not_supported`, `BRIDGE_NOT_SERVED`, `Connection: close` |
| D10 | Notes said once | Two browser-shaped requests: one `REFUSAL_NOTE`. Two keyless ones: one line of the key note. On the same window, across two listeners |
| D11 | `dispose` closes every listener | After `w.server.dispose()` both ports refuse connections |

Commands: the common block, with `<name>` = `bridgeBoundary`, `brokerBridgeDoor`, `brokerBridgeListeners`, `brokerOrigin`, `brokerOriginDoor`, `credsAgentServer`. Check the size: `wc -l src/credsAgentServer.ts`.

---

## E1.3 — The allow-list, the note schema, the scope wall. **Cornerstone: `model: fable` on the spec.**

Depends on E1.2. This section is the input to Fable's spec, `todo/PLAN_remote_bridge_scoped_E1_S3_spec.md`; where the spec differs, the spec wins and says why. Sonnet codes from the spec.

### How it is built, given the code

The router has one tail: every call that performs something passes `perform` (`credsAgentServer.ts:499`), then `performCall`, then `answer` (`brokerCall.ts:124-134`), which checks the client and starts the action in one synchronous step. And every door mints a grant before that (`:286`, `:344`), or finds one (`:468`). Three facts follow, and they are the design:

1. **The context rides the grant.** `Grant` (`grantRegistry.ts:20-49`) gains `readonly bridge?: BridgeGrant`, and `mint` (`:132-155`) gains a last optional parameter. `BridgeGrant = BridgeContext & { quiet: boolean; spendToken?: string }`. A bridge door mints with it; the two existing doors never pass it, so `grant.bridge` is `undefined` and every new branch is skipped. No request field can reach `mint`'s seventh argument. `settle` and `reserve` spread the grant, so the field survives (asserted by S10). This is what spares threading a parameter through a 780-line file: consent, launch, remember and audit all already hold the grant.
2. **A view wraps the suppliers, in one place.** `bridgeScope.ts` exports `doorView(bridge, wall): DoorView`, and `handle` asks it for every lookup. For `bridge === undefined` it returns `OPEN_VIEW`, whose methods hand back the same function object they were given, so the existing doors run today's code path. Scenario S13 asserts identity with `assert.equal`.
3. **One gate at launch.** `CallDeps` gains an optional `atLaunch(): {code, message} | undefined`. `answer` calls it after the abort check and before `reservedNow`, in the same synchronous step as the start. That is where a call arrives after the longest wait on the path, the one-use lane, whichever route it came by. A refusal spends nothing.

**The wall, route by route.** `Scope` is read fresh each time from `BridgeScopes` (below), never held across an await.

| Way in | What the view wraps | Out of scope answers | Same as not-found because |
|---|---|---|---|
| `GET /v1/aliases` | `aliases`. The list has no ids (`cliAliases.ts:102-106`), so each name goes through the real `resolveAlias` and is kept only if its target is in scope | Absent from the list | The list is all a caller sees |
| `GET /v1/mcp/entries` | `mcpEntries`, kept when `scope.has(entry.id)`. **`can` is narrowed to what this door permits** (`mcpEntries.ts:127` copies it from the vault), so a row never advertises `edit` or `delete` that every bridge request refuses; scenario: an entry with every permission on lists only allow-listed ones, and the refused call agrees. **`dependsOn` is cut down to names of entries kept in the same answer**, or an in-scope row would name an out-of-scope entry (`mcpEntries.ts:60,273`) | Absent | As above |
| `GET /v1/mcp/config-snippet` | `visibleConfig`: `scope.has(id) ? real(id) : undefined` | The refusal body of `configSnippetResult(undefined, …)`, status 200 | `brokerReadRoutes.ts:109-116` answers an unknown id the same way |
| `GET /v1/mcp/folders` | `folders: () => []` | Empty | A folder is in no scope, and no folder verb is served |
| `POST /v1/mcp/use/<action>` | `resolveUse`: `scope.has(id)` first, without touching the real lookup; then the real one, restricted to `context.accountId`; a `usable` target from another account is `undefined` | `not_found`, `'No such entry, or this window does not serve it.'` | `refusalFor(undefined)`, `brokerRequests.ts:183`: the code path is the same one, not a copy |
| `POST /v1/alias/<action>` | `resolveAlias`: target's account and id in scope, else `undefined` | `not_found`, `No entry is enabled for the CLI under "<name>".` | `aliasTarget`, `brokerRequests.ts:165`. Before the throttle (`credsAgentServer.ts:334-338`), as for a name that does not exist |
| `POST /v1/use/<action>`, a token | **Before `grantForToken`**, peek `grants.get(secret)`. Found and out of scope: refuse now. `lookup` would delete an expired grant and answer `expired` (`grantRegistry.ts:173-177`), which an unknown token never does | `unauthorized`, `'Unknown or missing grant token.'` | `brokerRequests.ts:238` |
| At launch, any route | `atLaunch`: the grant's account and entity against a fresh `Scope` | The route's own sentence above, by `who.via`: `refusalFor(undefined)`, `aliasTarget(undefined, String(body.alias))`, or the token sentence. Built by calling those same functions, so a sentence cannot drift | They are the same functions |

**A token never rides its own grant on a bridge.** The gate short-circuits on an allowed grant (`brokerConsent.ts:59-60,76-79`), and a token's allowance is per token, for its whole life. So a token allowed locally would run silently through a bridge, and one allowed through server A would be allowed for local use and for server B. On a bridge door the token only authenticates, and `handle` calls a private `bridgedToken`: if the token's grant is `denied`, answer `denied` with `'The human did not allow this grant.'` (the sentence of `credsAgentServer.ts:625`); else take a slot (`admitAliasCall(res, true)`, because this path now raises a modal per call and a token path has no throttle today), mint a `'call'` grant with `bridge: {...context, quiet, spendToken: secret}`, `perform`, and release in `finally`. `atLaunch` reserves the token last (`grants.reserve(spendToken, now, grantLimits())`), so its use count and idle clock still move, and a spent token answers `reservationRefused` (`brokerRequests.ts:249`). A Deny given through a bridge refuses that call only; it does not tombstone the token.

**`creds://` targets, and why the check is E1's while the executors are E3's.** Today no agent executor resolves a reference: `terminalRunAction` and `scriptRunAction` run the text as saved (`agentUseActions.ts:150,201,221`). The only resolver is the person's `runWithSecrets` (`commands/runCommands.ts:244-253,310`). So E1 builds two things that do not need an executor, and E3.3 is obliged to use the second.

1. **The check.** `referenceRefusal(context, grant, wall)`: `storedTexts` → `planRefs(texts).refs` (`runPlan.ts:45`) → for each, `parseSecretRef` and `locate` (`secretRef.ts:130`, exported by this story, no change inside), both wrapped so that any throw or diagnostic message becomes the refusal and never a 500 or a leaked path → the target's account and id against a fresh `Scope`. **One sentence for every failure: no such account, no such entity, ambiguous, out of scope.** `locate`'s own messages are never surfaced here: they would tell a dangling reference from a real one, and "ambiguous" would list real paths. The sentence repeats the reference as stored, which discloses nothing new: the listing already shows the same text (`McpEntry.command`, `mcpEntries.ts:48-49`), and a stored reference may dangle. Code `denied`, so the client's walk stops rather than treating it as "not mine" (`src_mcp/src/Windows.cs:161`):

   ```text
   `"${grant.entityName}" uses ${ref}, which this Remote Bridge does not serve. Add that entry to this bridge's scope, or take the reference out of the stored command.`
   ```

   It runs twice: in `perform` right after `usable` (`credsAgentServer.ts:515`), so no modal is raised for a call that cannot run; and inside `atLaunch`, so a line edited while the modal is open stops too. In E1 it is tested with the harness's stub action and a `storedTexts` that returns references. In production it first has text to read when E3.1 puts `run` on the list.
2. **The seam.** `scopedRefSource(context, wall, source: RefSource): RefSource` wraps the real source: `accounts()` answers `context.accountId`'s row only, `entities()` only entries in a fresh `Scope`, `fieldReading()` answers `absent` for anything else. Exported and unit-tested against the real `resolveSecretRefs`, unused in production until E3.3. An action re-reads the live entity after launch (`agentUseActions.ts:79`), so a line can change between the gate and the resolver; with this source the resolver cannot read an out-of-scope value at all. `UseActionContext` (`useActions.ts:14-33`) gains `readonly bridge?: BridgeContext`, set by `startNow` (`brokerCall.ts:162-167`) from `grant.bridge`, without `quiet` or `spendToken`, so E3 can tell a bridge run from any other.

   **E3 inherits three obligations, and E3's stories document must name them:** E3 adds `run` to the table and the walk at its end, after both executors pass; E3.3 resolves through `scopedRefSource` when `ctx.bridge` is set; both keep the gate's sentence.

**The jump chain is not a scope target.** `resolveJumpChain` reads the jump entry's metadata into `-J` (`sshUseActions.ts:201`), no secret of it goes to the agent, and the agent cannot run anything on the jump host. It is part of how the in-scope entry connects, as the person set it. Fable's spec confirms or overturns this; if overturned, it is one more text source for the same check.

### What changes

1. **`bridgeAllowList.ts`.** One table, every contract route named, served or not, and the reason. A route absent from the table is refused at run time (default deny) **and** makes the walk RED (S1).

   | Route | Decision |
   |---|---|
   | `GET /v1/health`, `GET /v1/mcp/kinds`, `GET /v1/mcp/kind-help` | served: no vault data |
   | `GET /v1/aliases`, `GET /v1/mcp/entries`, `GET /v1/mcp/config-snippet`, `GET /v1/mcp/folders` | served, walled |
   | `POST /v1/mcp/use/exec`, `/query`; `POST /v1/alias/exec`, `/query`; `POST /v1/use/exec`, `/query` | served, walled. Both already run in the right place: `ssh` from the laptop to the entry, a query from the laptop (owner decision 8) |
   | `…/exportEnv` on all three prefixes | refused, 403 `denied`, `EXPORT_REFUSED`: the allow-list refuses first, in the action's words (§4.8) |
   | `…/run` on all three | refused, `BRIDGE_NOT_SERVED`, until E3.1. Today it would run on the laptop's `process.platform` (D6). E2 opens the flow and E3 fixes the site, and any extension tag between them would ship that defect through a bridge |
   | `POST /v1/config/read`, `POST /v1/mcp/create`, `POST /v1/mcp/folder/{create,edit,delete}` | refused, `BRIDGE_NOT_SERVED`: §4.2's never-list |
   | `POST /v1/mcp/delete`, `…/rotate`, `…/terminal`, `…/up`, `…/down` | refused, `BRIDGE_NOT_SERVED`: not named by §1 or §9, so default deny decides. `up`/`down` are also §8's new todo |
   | any other method or path | refused, `BRIDGE_NOT_SERVED`, whether or not such a route exists |

   A refusal here reads no body and sets `Connection: close`. Nothing is written to the journal, as for any refusal without a grant (`credsAgentServer.ts:702-704`).
2. **`bridgeNote.ts` and the contract.** Constants only; the publisher is E2.2 and the reader E2.1. `BRIDGE_KEY_HEADER`, `BRIDGE_NOTE_DIR = '.creds-for-devs/bridge'`, `BRIDGE_NOTE_SUFFIX = '.json'`, `BRIDGE_NOTE_FIELDS = { socket:'string', port:'number', brokerPort:'number', key:'string', serverName:'string', openedAt:'string' }` and the `BridgeNote` type from §4.3. `brokerProtocol.ts` exports `ALIAS_ROUTE_PREFIX` and uses it at `:223`.
   `scripts/emit-contract.mjs` adds, beside `caller`, with the comment saying additive so `version` stays 1:
   `aliasPrefix: protocol.ALIAS_ROUTE_PREFIX` and `bridge: { keyHeader, noteDir, noteSuffix, noteFields }`. Regenerate with `npm run contract`. The C# record ignores the new keys: `BrokerJsonContext.cs:19` sets no unmapped-member handling, and `BrokerContract.cs` is left alone.
3. **`bridgeScope.ts`.**
   - `BridgeScopes`, over the same `Memento` subset as `ConsentStampStore` (`mcpConsentPolicy.ts:72-75`), key `credSshManager.bridgeScopes`, in `globalState`, never in the vault (§4.2). A record: `{ entries: string[], quiet: boolean, at: number }`, under `scopeKey(accountId, serverEntityId)`, length-prefixed like `stampKey`. `read` goes to the store every time, as `ConsentStamps.live` does (`:210-212`), and read defensively: a malformed record is an empty scope with `quiet: false`. Writes run in a `SerialQueue`. Cap 64, oldest `at` pruned (the parent's §6). `set`, `forget`. A server with no record has an empty scope: "a new server starts empty".
   - `DoorView`, `OPEN_VIEW`, `doorView`, as above.
   - `atLaunchRefusal`, `referenceRefusal`, `scopedRefSource`, `outOfScopeAnswer(via, body)`.
   - `referenceTextsOf(details)` in `runPlan.ts`: `details.isScript === true ? [script, ...scriptVars values] : [command, ...commandArgs values]`, the texts `commands/runCommands.ts:323,326-328` searches. All rows, disabled too: strict, and a person can delete a disabled row.
4. **`brokerHooks.ts`.** One new hook, `bridgeWall?: BridgeWallSource`, kind `'object'` in `HOOK_KINDS` (`:184-199`; the compile assertion at `:213` forces it): `{ scopes: BridgeScopes; storedTexts(accountId, entityId): readonly string[]; refSource: Pick<RefSource,'accounts'|'entities'> }`. Absent: `openBridgeListener` rejects (R4), so a build with no wall cannot open a door. `resolveMcpUse` (`:129`) gains an optional third parameter `server?: { accountId: string; serverEntityId: string }`; `mcpUseLookup` (`mcpHooks.ts:145`) searches only that account when it is given, by narrowing `getAccounts`. Until E1.4 the view forces `preConsented: false, rungs: ''` on every bridged lookup, so nothing is quiet and nothing is stamped.
5. **`credsAgentServer.ts`**, within the +20 budget: `handle` builds `view` once and uses it at `:443` (`view.sources(this.readSources())`), `:449` and `:253` (`answerMcp` takes the view: `resolveUse: view.resolveUse(this.hooks.resolveMcpUse)`, `door: this.doorFor(signal, view.bridge)`), `:454` and `:327` (`handleAlias` takes the view), and before `:468` (the token peek) and at `:488` (`bridgedToken`). `:286` and `:344` pass `view.grantFor(...)`, `undefined` on the existing doors. `perform` calls the early reference check after `usable`. `runAndDeliver` (`:649`) passes `atLaunch`.
6. **`brokerCall.ts`.** `answer` (`:124-134`) as above, with the check in a helper `refusedAtLaunch`, because complexity is 4. `startNow` passes `bridge`.
7. **`test/brokerWorld.ts`.** A new option `aliasMap?: Record<string, target>` beside `alias`; `aliasResolverFor` (`:477-481`) reads it. `hooks` already rides through (`:253-255`) and carries `bridgeWall`. No existing option changes.

### What stays untouched

`brokerMcpDoor.ts` (it calls what it is given); `brokerMcpRoutes.ts`; `brokerReadRoutes.ts`; `brokerFolderDoor.ts`; `brokerConfigRoute.ts`; `mcpEntries.ts` until E1.4; `commands/runCommands.ts`; every use action; `src_cli`, `src_mcp`, `src_broker_client` and their tests. `decideRunSite` and every executor of §4.6 are E3's; §4.6's table is settled text and this story builds nothing of it except the reference rule.

### Scenarios

`test/bridgeAllowList.test.ts`, `test/bridgeScope.test.ts` (pure); `test/bridgeScopeWalk.test.ts`, `test/bridgeTransitive.test.ts` (real broker through a real listener, `world` plus `w.server.openBridgeListener`); additions to `test/brokerContract.test.ts`.

**How a route is enumerated, so a future route fails.** `contractRoutes(contract)` in the test reads `contract/broker-v1.json`: `health`, `reads.*`, `configRead`, `routes.*`, `mcpDeleteRoute`, `mcpCreateRoute`, `aliasPrefix` × the actions of `routes`, `mcpUsePrefix` × `mcpActions`, `mcpFolderPrefix` × `mcpFolderActions`. A deep scan then finds every string in the file that starts with `/v1/`, and fails if one is neither in that list nor a known prefix. So a route under a key nobody has seen yet still fails, with its name in the message.

| # | Scenario | Expected |
|---|---|---|
| S1 | **RED first:** every contract route is named | E1.2's table names one route, so this fails listing the others, with `<route> is in contract/broker-v1.json and not named in bridgeAllowList.ts. Name it: served, or refused and why.` Watch that. Green when the table is complete. And the reverse: no table entry is missing from the contract |
| S2 | The check catches a future route | `contractRoutes` over a copy of the contract with `mcpFutureRoute: '/v1/mcp/future'`, a new action in `mcpActions`, and a new top-level `/v1/x` string: all three reported as unnamed |
| S3 | **The walk.** Every route through a bridge scoped to `e1`, with `e-out` real and usable in the same world | Every performing route with `e-out`, its alias, and its token: never 200, `w.ran` empty, `w.dialogs` empty. Every read: 200 and the raw text contains neither `e-out` nor its name nor its alias. A served route with `e1`: reaches the action after Allow (`w.ran` has `e1`) |
| S4 | **Negative control.** The same walk through the main port door | The walk's finding list is **not** empty, and names `e-out`. Kept for good: it proves the walk can see a leak, and is what the walk's RED looks like |
| S5 | **Indistinguishable.** Two worlds: A has `x` out of scope, B has no `x` at all | For every route, the same request answers the same status and the same body bytes in both. Token: A's real out-of-scope token, live and expired, against B's made-up one. Neither takes a throttle slot; a following call is not refused for lack of one |
| S6 | The refused routes | `exportEnv` on `/v1/use/`, `/v1/alias/`, `/v1/mcp/use/`: 403, `denied`, exactly `EXPORT_REFUSED`, for `e1` and `e-out` alike. `/v1/config/read` with a valid key: 404, `BRIDGE_NOT_SERVED`, and the `configRoute` hook was never called. `run`, `rotate`, `terminal`, `up`, `down`, delete, create, folder verbs: 404, `BRIDGE_NOT_SERVED`, `Connection: close`, no dialog. `GET /v1/use/exec`: the same |
| S7 | Context is the only identity | Two listeners, A scoped to `e1`, B to `e2`. `e2` through A is refused and through B works, whatever the body, header or query claims (`serverEntityId`, `bridgeId`, `accountId`, `caller.agent` set to B's). A's key on B's port: WK |
| S8 | **Transitive, RED first** (§7): a reference outside the scope | Stored line `deploy creds://a@x/Other/db/password`: `denied`, the exact sentence, no dialog, `w.ran` empty. Through MCP, alias and token alike. RED against E1.2's code once `exec` is on the table |
| S9 | All reference failures read alike | Out of scope, no such entity, no such account, ambiguous: the same sentence shape, with only the reference text differing, and no candidate path in it. In a script body, a script variable, a command, a command argument, a disabled argument. All targets in scope: the call proceeds |
| S10 | **Scope narrowed while the modal is open** (§7) | `holdDialogs`; narrow the scope; answer Allow. `w.ran` empty; the answer is the route's own not-found sentence, for each of the three routes; `grant.bridge` was still there after `allow` and `reserve`. Nothing was spent |
| S11 | A line edited while the modal is open | `storedTexts` returns a new out-of-scope reference after the dialog was raised: refused at launch with the sentence |
| S12 | A one-use entry queued in the lane, narrowed meanwhile; and the listener closed with a modal open | The first refuses at its turn with nothing spent. The second: one `ABANDONED` line, nothing runs |
| S13 | `OPEN_VIEW` is identity | `assert.equal(OPEN_VIEW.resolveUse(f), f)`, and for `resolveAlias`; `sources(s) === s`; `grantFor` undefined; `tokenOutOfScope` false. A grant from either existing door has no `bridge` key at all |
| S14 | A token on a bridge | Allowed locally first, then through the bridge: asks anyway, and the local grant's status and the local door's silence are unchanged. Asked through the bridge and allowed: local use of that token still asks. Denied token: `denied`, no dialog. With `maxCalls: 1`: the first call runs, the second answers the uses-expired sentence. Six at once meet the throttle, `too_many_requests` |
| S15 | `dependsOn` trimmed | An in-scope entry depending on an out-of-scope one: its row's `dependsOn` lacks that name; a dependency also in scope stays |
| S16 | `scopedRefSource` with the real `resolveSecretRefs` | In scope: the value. Out of scope: refused, and `fieldReading` was never called with that id |
| S17 | `BridgeScopes` | A missing record, a malformed one, a non-array `entries`: empty scope, `quiet: false`. Cap 64, the oldest goes. `read` after another store's write sees it. Two accounts with one server id do not mix |
| S18 | The contract, both directions | `aliasPrefix` is what `parseAliasRoute` accepts. `bridge.*` equal the constants in `bridgeNote.ts`. `version` is still 1. `CredsBroker.Tests` is green with no edit: the C# side reads the grown file |
| S19 | The grant's new field does not disturb the existing tail | `credsAgentServer.test.ts`, `brokerMcpRoutes.test.ts`, `brokerAbandoned.test.ts`, `oneUse*` tests green with no edit |

Commands: the common block, with `<name>` = each file above; `npm run contract` from `src_vs_code`, then `git diff contract/broker-v1.json` shows additions only; the pre-PR block, including `CredsBroker.Tests`.

---

## E1.4 — Per-server consent, the modal line, the audit line

Depends on E1.3. Security-judged by Fable at review.

### What changes

1. **`mcpConsentPolicy.ts:85-87`.** `stampKey(accountId, entityId, serverEntityId?)`. Absent: **today's exact string**, `` `${accountId.length}:${accountId}:${entityId}` ``. Given: `` `s${accountId.length}:${accountId}:${entityId.length}:${entityId}:${serverEntityId}` ``.
   - **The leading `s` is the part that keeps the promise.** A plain third segment does not: with `<n>:<a>:<m>:<e>:<s>`, a local entry whose id is `<m>:<e>:<s>` makes the same key, and an entry's id arrives by sync. A local key always starts with a digit, a server key never does, so the two cannot collide whatever the ids are. The entity is length-prefixed and the rest is the server, so a server key is injective too.
   - **Two-segment keys on disk: checked, nothing breaks.** `readStamps`, `prune` and `live` (`:262-269,304-307,210-212`) treat a key as an opaque map key and never parse it. `stampKey`'s only production callers are `mcpEntries.ts:439,529`. `forgetAll` (`:202-207`) empties the whole map, so Forget clears server stamps too. `MAX_STAMPS` (`:40`) now bounds both kinds together. Existing stamps keep matching, so no one is asked again on upgrade; a downgrade ignores `s…` keys, which expire by arithmetic. Only tests call `stampKey` elsewhere, with two arguments.
2. **`mcpEntries.ts`.** `preConsentedFor(found, stamps, now, serverEntityId?)` (`:435-441`) and `rememberMcpConsent(…, now, serverEntityId?)` (`:517-530`) pass it to `stampKey`. `consentDue` is unchanged.
3. **`mcpHooks.ts:145,191-202`.** `mcpUseLookup` and `mcpUseHooks` hand `server?.serverEntityId` down; `rememberMcpConsent` gains an optional fourth parameter. `extension.ts:541` is unchanged.
4. **`brokerConsentMemory.ts:42,101`.** `ConsentRecord.serverEntityId?`, passed to `remember`. **`credsAgentServer.ts:636`,** `serverEntityId: grant.bridge?.serverEntityId`. `brokerHooks.ts:138` gains the optional parameter.
5. **`bridgeScope.ts`, `view.resolveUse`.** E1.3's forcing becomes the switch: quiet off answers `{...found, preConsented: false, rungs: ''}`, quiet on answers `found`, which the entry's own policy decided against a server-keyed stamp. `rungs: ''` is what stops a stamp being written with quiet off: `answeredHere` refuses an empty fingerprint (`brokerConsentMemory.ts:37-39`). So turning quiet on later cannot reach back to an answer given while it was off. `view.grantFor` snapshots `quiet` onto the grant, for the modal. **Quiet speaks only for the MCP door**, as the policy does today (`agentDoors.ts:85-88`): the alias and token routes on a bridge ask every call whatever it says.
6. **New `bridgeConsentText.ts`** (pure). `bridgeModalLine(bridge, site)` and `bridgeCoverageLine(bridge)`, where `site` is `'laptop' | 'server'`, and `bridgeRunSite()` answers `'laptop'` in E1, because `exec` and `query` are the only served actions and both start here. E3.1 replaces it with `decideRunSite`.

   ```text
   laptop:  Through the Remote Bridge of "<serverName>". It runs on this computer, and only its output goes to that server.
   server:  Through the Remote Bridge of "<serverName>". It runs on that server.
   coverage, quiet off:  Allowing covers this call only.
   coverage, quiet on:   Allowing follows this entry's own consent setting, for this server only: not for another server, and not for this computer.
   ```

   `<serverName>` passes through the same sanitising as a caller label (`brokerCaller.ts`), since an entry name is a person's text inside a security dialog.
7. **`brokerConsent.ts:142-157`.** `wording` puts the modal line after the request-time line, and on a bridged grant the coverage line replaces `Allowing covers every later call on this token…` (`:153-154`), which would be false there. Without `grant.bridge`, the text is byte-identical.
8. **`grantRegistry.ts:316-318` and `bridgeContext.ts`.** `describe(grant)` appends ` bridge=<name>` when `grant.bridge` is set; `bridgeAuditName(name)` replaces every run of whitespace, `(`, `)`, `→` with `_` and caps at 40. Every line about a bridged call therefore carries it through `GrantRegistry.describe`, at all the funnel's sites, with no new parameter. An example:

   ```text
   [12:00:00Z] #3 exec orders-db (tok…f2 bridge=ai-runner1) via mcp by Claude Code 2.1.268 → exit 0  uptime
   ```

   It sits in the existing `grant` group, whose pattern is `[^)]*`, which is why the name has no `)`. So `LINE` (`agentAuditLog.ts:135-136`) and `formatAuditLine` do not change, and every old line and reader still parses. The one line with no grant, `too_many_requests` at `credsAgentServer.ts:236`, takes `admitAliasCall`'s third argument and writes `— bridge=<name>`.

### What stays untouched

`consentDue`, `covers`, `windowEnd`, `remembersConsent`, `readStamps`, `prune`; `SharedPrompts`; `formatAuditLine`, `parseAuditLine`, the `LINE` pattern, `AuditDoor`; `commands/agentCommands.ts:495-509` (Forget); `callerLine` and `CALLER_DISCLAIMER`. The caller's label stays a label: nothing in the modal line comes from it.

### Scenarios

`test/bridgeConsent.test.ts` drives the real `mcpUseHooks` through a real listener (`mcpResolve` and `mcpRemember` in `world`, `test/brokerWorld.ts:132`, and the fake store of `test/mcpHooks.test.ts`). Additions to `test/mcpConsentPolicy.test.ts`, `test/brokerConsentText.test.ts`, `test/agentAuditLog.test.ts`.

| # | Scenario | Expected |
|---|---|---|
| C1 | **GREEN first, pinned before the edit:** the on-disk form | `stampKey('acct','e1') === '4:acct:e1'`. A store seeded with that literal is still read by `ConsentStamps.get` after the change, and the entry stays quiet for local use |
| C2 | **RED first:** a third segment | `stampKey('a','e','s')` differs from `stampKey('a','e')`, and from `stampKey('a','e','t')`. Injective across `a:b`/`c` splits in all three positions |
| C3 | The crafted id | A local entry with id `1:e:s` under `stampKey('a', '1:e:s')` never equals `stampKey('a','e','s')`, and no local key starts with `s` |
| C4 | **Quiet off asks every time** (§7) | An entry with `ask: 'never'`, then one with `every12h` and a fresh stamp, through a bridge with `quiet: false`: a dialog on every call. Allow writes no stamp: `w.consents` empty and the store has no new key |
| C5 | Quiet on, the entry's own policy | `never`: no dialog, and the `allowed without a prompt` line (`brokerMcpDoor.ts:241-250`). `every12h`: one dialog, then quiet inside the window, asked again past it. `always`: asks every time |
| C6 | **A stamp via A covers neither B nor local** (§7) | Two bridges, quiet on both, same entry. Allow through A: A goes quiet, B asks, the local MCP door asks. And the reverse: a local stamp silences neither bridge |
| C7 | Quiet turned on after an answer given with it off | Asks: no stamp reached back |
| C8 | **Forget clears them** (§7) | Stamps through A and locally; `forgetAll`; both ask again. A window's late write of an old server stamp is dropped by the tombstone, as `test/mcpConsentPolicy.test.ts:248` does for a local one |
| C9 | Quiet does not speak for the other routes | Quiet on with `never`: `/v1/alias/exec` and `/v1/use/exec` through the bridge still raise a dialog |
| C10 | **RED first:** the modal line | The dialog contains the exact laptop sentence with the context's name, immediately after the request-time line. A body with `caller: {agent:'evil'}` and `serverName:'evil'`: the sentence still names the context's server, and the caller line shows `evil` with its disclaimer |
| C11 | The coverage line | Quiet off and quiet on: exact sentences. `Allowing covers every later call` is absent on a bridged dialog. Off a bridge the dialog equals today's text exactly (existing `test/brokerConsentText.test.ts` green with no edit) |
| C12 | The unused branch is a sentence too | `bridgeModalLine(ctx, 'server')` is exact, for E3.1 |
| C13 | **RED first:** the audit line | Across one bridged call's whole life (minted, ALLOWED, exit, a refusal, ABANDONED, too_many_requests) every line has ` bridge=<name>`. No line off a bridge has `bridge=` |
| C14 | The line reads back | `parseAuditLine(formatAuditLine(…))` round-trips with the name `prod (eu) → db`, `grant` holding `tok…f2 bridge=prod_eu_db`, `via` and `caller` intact. A line written before this still parses |
| C15 | The context's name, not a claim | A body naming another `serverName`: the audit line still has the context's |

Commands: the common block, with `<name>` = `bridgeConsent`, `mcpConsentPolicy`, `mcpHooks`, `forgetAgentConsents`, `brokerConsentText`, `brokerConsentMemory`, `agentAuditLog`, `mcpLogRows`; then the pre-PR block.

---

## Which story owns each fact, and how it is tested

| Fact | Owner | Test |
|---|---|---|
| `credsAgentServer.ts` stays under its ceiling; new behaviour is in new modules | every story; the move is E1.2 | `npm run lint` (`max-lines`); `npm run ratchet` for `extension.ts` |
| Pure logic imports no `vscode` | E1.2 | R2 |
| Nothing can be reached from a server | E1.2 | R1, R4; the `git diff --exit-code` line in the pre-PR block |
| `creds-cli-itest.cjs` green and untouched | E1.2 onward | `npm run itest:cli`; the same diff line |
| The two existing doors unchanged | E1.2, held by all | R3, D3, S13, and existing suites with no edit |
| Default deny, a future route fails until named | E1.2 at run time, E1.3 in the walk | D9, S1, S2, S6 |
| `BridgeContext` is the only identity | E1.2 hands it, E1.3 relies on it | D7, D8, S7, C10, C15 |
| Scope at the resolvers, again at launch, token's grant included | E1.3 | S3, S10, S12, S14 |
| Every `creds://` target in scope, with the executors in E3 | E1.3 builds the check and the seam, E3.3 uses the seam | S8, S9, S11, S16 |
| Out of scope is indistinguishable from not-found | E1.3 | S4, S5 |
| `stampKey` third segment; nothing breaks on a two-segment key | E1.4 | C1, C2, C3 |
| Consent through A silences neither B nor local | E1.3 for tokens, E1.4 for stamps | S14, C4, C6 |
| One stable export sentence, on the bridge door and in an `other` window | E1.1 writes it, E1.3 refuses first in its words | X1-X3, X5, S6 |
| The person's warning, written for the case M4 reaches | E1.1 | W1-W4 unless M4 shows the value does not reach those terminals, then W3 only; the M4 table |

## Gaps found in the parent (recorded, not fixed there)

Only the `Cornerstones:` line of the parent changes. These are decisions this document takes, and the first two are the ones a reader should look at.

1. **`run` is off the allow-list until E3.1.** §5 opens the flow in step 5 and fixes the run site in step 7. With `run` on the list between them, any extension tag would ship D6 through a bridge. The epic's `Done when` needs only that the walk refuses what is not listed, so this breaks nothing there. E3's document must add it.
2. **The plan names the never-list and no positive list.** `rotate`, `delete`, `terminal`, `up`, `down` are named by neither §4.2 nor §8. §1 and §9 need `exec`, `query` and, from E3, `run`. Default deny decides: they are off.
3. **`/v1/alias/` is not in the contract.** The prefix is a literal in `brokerProtocol.ts:223` and `src_cli/src/Program.cs:197`, so a walk reading the contract would have skipped the route with no token. E1.3 adds `aliasPrefix`, additive.
4. **A plain third segment on `stampKey` does not keep §4.2's "cannot collide"** against the two-segment keys on disk. E1.4 adds a leading tag.
5. **"Quiet off asks every call" cannot hold on a token's own grant**, nor can "an answer through A silences neither B nor local", because consent is per grant and terminal (`grantRegistry.ts:212-214`). E1.3 mints per call on a bridge, and adds the throttle a token path did not need before.
6. **§4.1 puts `key` in `BridgeContext`.** Nothing behind the door needs it, and the context now rides a grant. It stays at the door.
7. **§4.2's "refused naming the missing entry" is an oracle unless it is one sentence for every failure.** Built that way, naming the reference as stored.
8. **The listing leaks through `dependsOn`** (`mcpEntries.ts:60,273`), and `listAliases` has no ids to filter on. §4.2 says "wraps the resolvers and the read sources", and these are how.
9. **§4.8 says `Set env`.** The same value goes to the same terminals on create, edit and restore, so the warning sits in `showEnvNotice`.
10. **§4.1 counts only `credsAgentServer.ts`.** `extension.ts` has zero lines to spare under its ratchet. E2.2 meets the same limit when it wires `bridgeWall`.
11. **§7's door table reads as if a key refusal could come after `Host`.** §4.5 needs the reverse, so an old `creds` hears "update".
12. **Not this plan's, for a todo:** `LINE` in `agentAuditLog.ts:135-136` accepts `via (token|alias|mcp)` and not `config`, though `AuditDoor` has it and `credsAgentServer.ts:303` writes it, so a config line reads back as `undefined`. Read, not run. E1 leaves it.

13. **For E2.1: `creds env <name>` cannot reach `exportEnv` today, and the CLI misreads a refusal.** `WireVerb` (`src_cli/src/CommandLine.cs:78`) maps only `ssh` to `exec`, so `creds env <name>` posts to `/v1/alias/env`, while the action the broker registers is `exportEnv`: the broker answers `not_supported`, a 404; and `Program.cs:209` falls through on every 404 and then tells the agent no window has the entry enabled (exit 93). E2.1 should fall through only on the `not_found` code, as `src_mcp/src/Windows.cs:160-161` does; derive the alias action from the contract and not from a second hand-kept map; and add a client itest (`creds-cli-itest.cjs`) that runs `creds env` against a real broker, so the verb is shown to reach the route. E1 leaves `src_cli` untouched, and E1.1's `denied` is chosen so that the refusal is heard once the CLI does reach it.
14. **A new todo for E4: deleting an entry leaves its bound values in the environment collection.** No delete or trash path calls `applyEnvBindings`, so a value written by `ENV` or by a save stays in `context.environmentVariableCollection` after the entry is gone, until a person removes the binding through Edit or the collection is cleared. Values an agent exported before E1.1 stay the same way. The warning says so ("deleting the entry does not remove it"), and M4 step 6 measures the Edit road. E4 should open the todo and decide whether delete and trash apply the bindings, and whether to clear collection names no entry owns.
15. **`brokerMcpDoor.ts:215-217` journals "allowed without a prompt" before the refusal.** `quietly(door, grant, read.target, caller, prompts)` writes the audit line when the door settles the grant, and the action's `validate` runs after it, so when the entry's consent is already remembered, an export that `EXPORT_REFUSED` then refuses on `/v1/mcp/use/exportEnv` reads in the journal as "allowed without a prompt" and nothing else. Not fixed here; the refusal itself and the absence of a dialog are held by X3.

## Order

E1.1, then E1.2, E1.3 after Fable's spec, E1.4. E1.1 is independent and may go first or in parallel, but all four are one commit on this branch. The epic's `Done when`, as a checklist:

- [ ] Door table, scope walk, transitive and consent pass (D1, S3-S5, S8-S12, C4-C8).
- [ ] The walk refuses every contract route not on the allow-list, and fails on an unnamed one (S1, S2, S6).
- [ ] An agent's export is refused with one stable sentence; the person's `Set env` warns (X1-X3, X5, S6, and W1-W4 unless M4 removed them, as that section says).
- [ ] The two existing doors are unchanged, and `creds-cli-itest.cjs` is green and untouched (R3, the pre-PR block).
- [ ] M4 recorded in the table above, by the person.
- [ ] Every RED-first test's failure and pass are in the summary; lint, ratchet and the pre-PR block are green; `coai` plan and code gates at `proceed`.
