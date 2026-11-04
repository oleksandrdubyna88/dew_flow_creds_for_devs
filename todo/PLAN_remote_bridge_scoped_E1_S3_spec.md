# PLAN — E1.3 spec: the allow-list, the note schema, the scope wall (CORNERSTONE)

> Status: **plan only, nothing implemented yet, 2026-11-04 — cornerstone spec by Fable, written before its code.**
> Story E1.3 of [PLAN_remote_bridge_scoped_E1.md](PLAN_remote_bridge_scoped_E1.md) (parent
> [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) §4.1, §4.2, §4.3 schema only, §4.6 reference rule, `## Epics` E1).
> Its own file because the stories document goes whole to the review gate and must stay short; it is promoted with E1's.
> Where this spec differs from the E1 document, this spec wins and §S3.1 says why.
>
> Scope: `src_vs_code/src` — new `bridgeAllowList.ts`, `bridgeScope.ts`, `brokerBridgeToken.ts`; `bridgeNote.ts` and
> `bridgeContext.ts` grow; small edits to `grantRegistry.ts`, `brokerCall.ts`, `useActions.ts`, `brokerHooks.ts`,
> `brokerRequests.ts`, `brokerProtocol.ts`, `runPlan.ts`, `secretRef.ts`, `mcpEntries.ts`, `mcpHooks.ts`,
> `credsAgentServer.ts` (+14 lines at most); `src_vs_code/scripts/emit-contract.mjs`; `contract/broker-v1.json` (additive).
> Depends on E1.2 (the third door, `BridgeContext`, `bridgeRouteRefusal` with one route, `openBridgeListener`). A Sonnet
> coder builds from this file and re-discovers nothing; an Opus judge reviews against §S3.9.

Every path below is relative to `src_vs_code/src/` unless it says otherwise. Every `file:line` was opened on commit `fe86db8`
(the source is that of `c6800b8`; only `todo/` changed since).

## S3.0 — Facts this spec rests on

| # | Fact (verified) | Consequence |
|---|---|---|
| F1 | Every call that performs anything passes `perform` (`credsAgentServer.ts:499-533`) → `prepared` (`:560-578`) → `runAndDeliver` (`:649-667`) → `performCall` → `answer` (`brokerCall.ts:124-134`), which checks the client and starts the action in one synchronous step. A one-use entry waits in the lane between `performCall` and `answer` (`:91-106`). | One launch gate, in `answer`, covers every route and the longest wait on the path. |
| F2 | Every door mints or finds a `Grant` before `perform`: the MCP door at `:286`, the alias route at `:344`, the token route at `:468`. `GrantRegistry.reserve` and `settle` spread the grant (`grantRegistry.ts:203,310`), so an added field survives Allow and the use count. `GrantRegistry.describe` is called at every log site and reads only `grant.secret` (`:316-318`); nothing stringifies a grant. | The grant can carry the bridge context to consent, launch, remember and audit without a new parameter through the 779-line file. |
| F3 | `ConsentGate.consent` short-circuits on an `allowed` grant (`brokerConsent.ts:59-60,76-79`); `allow` is terminal for the grant's life (`grantRegistry.ts:212-214`). | A token's own grant, once allowed anywhere, would run silently everywhere. On a bridge a token may only authenticate. |
| F4 | `GrantRegistry.lookup` deletes an expired grant and answers `expired` (`grantRegistry.ts:168-179`); `get` applies no expiry (`:158-160`). `grantForToken` turns `unknown` into `'Unknown or missing grant token.'` (`brokerRequests.ts:238`) and so does `reservationRefused` (`:252`). | An out-of-scope token must be refused by a `get` peek, with the unknown sentence, before `lookup` could say `expired`. |
| F5 | `refusalFor(undefined)` is `not_found`, `'No such entry, or this window does not serve it.'` (`brokerRequests.ts:183`); `aliasTarget(undefined, name)` is `not_found`, `` `No entry is enabled for the CLI under "${name}".` `` (`:165`); the alias throttle runs after the name resolves (`credsAgentServer.ts:334-338`). | Out of scope answers through the same functions as not-found, before any slot is taken. |
| F6 | `McpEntry` carries `dependsOn` as names and `can` copied from the vault (`mcpEntries.ts:60,62,127-130,273`); `listAliases` carries no ids (`cliAliases.ts:102-106`); `visibleConfig` answers by id alone (`brokerReadRoutes.ts:47-49,109-116`), and `configSnippetResult(undefined, …)` is a 200 with `error` in the body (`mcpSnippetRoute.ts:84-85`). | The listings are walled by wrapping the suppliers; `can` and `dependsOn` need trimming; the snippet route's not-found body already exists. |
| F7 | `findUsableEntry` searches every account because "an id is unique to a vault" (`mcpEntries.ts:323-324,344-356`); a protected or absent entry is `undefined`, a switched-off one is `closed` (`:365-376`). | The real lookup is narrowed to the context's account by a third parameter; `closed` for an out-of-scope id must become `undefined`, or it discloses existence. |
| F8 | `parseAliasRoute` holds `/v1/alias/` as a literal (`brokerProtocol.ts:223`); the contract has no alias prefix (`contract/broker-v1.json`); `src_cli/src/Program.cs:197` holds the same literal. `BrokerContract` (`src_broker_client/src/BrokerContract.cs:19-37`) names its properties; `System.Text.Json` skips unmapped members by default and `BrokerJsonContext.cs` sets no handling. | `aliasPrefix` and `bridge` can be added to the contract additively; the C# reads the grown file with no change. |
| F9 | No agent executor resolves a `creds://` reference today (`agentUseActions.ts:150,201,221` run the text as saved); the only resolver is the person's `runWithSecrets` (`commands/runCommands.ts:244-253,301-312`), which searches `[command, ...commandArgs values]` or `[script body, ...scriptVars values]` (`:321-328`). `planRefs` (`runPlan.ts:45-59`) extracts references; `locate` (`secretRef.ts:130-156`) is not exported and its messages name real paths. | The reference check and the seam are built and tested in E1 without an executor; `locate` is exported through a wrapper that drops its messages. |
| F10 | The agent exec path resolves the jump chain from the jump entry's `host`, `user`, `port` only (`sshOptions.ts:107-110,168-186`); authentication is prepared for the target entity alone (`sshUseActions.ts:115-137,201-204`); `-J` is appended by `sshExecCommand.ts:99`. | The jump entry's secrets are never read on an agent call (§S3.1 item 1). |
| F11 | `handle` (`credsAgentServer.ts:435-489`) is 43 code lines against a 50-line ceiling (`eslint.config.mjs:31`); `complexity` is 4 (`:32`); `answer` has complexity 3 and `perform` has 3. The file is 779 of 800 lines. E1.2 frees 17 by moving `readBody` and spends 12. | Every edit here is counted in §S3.6; E1.2's route guard in `handle` must be a three-line call, not six lines inline. |
| F12 | `Memento.get` is synchronous; `ConsentStampStore` (`mcpConsentPolicy.ts:72-75`) is the subset the consent stamps use, read fresh per call (`:210-212`); `SerialQueue.run` serialises writes (`serialQueue.ts:20-29`). | `BridgeScopes.read` is synchronous and fresh; writes queue. |
| F13 | `UseActionContext` (`useActions.ts:14-33`) is built in `startNow` (`brokerCall.ts:162-167`); an action re-reads the live entity at run (`agentUseActions.ts:79-81`). | A bridge run can be told it is one (`ctx.bridge`), and the seam of §S3.2.9 is what E3.3 must read values through, since the line can change after the gate. |
| F14 | `test/brokerWorld.ts` spreads `options.hooks` first (`:253-256`), so a `bridgeWall` passed there survives; `aliasResolverFor` knows one name, `prod` (`:477-481`); `fetch` sends `Host: 127.0.0.1:<port>` for the port it connects to, which is the bridge door's exact-Host rule. | The walk needs an `aliasMap` option and nothing else new in the world; bridge requests go through `call(port, path, { headers: { 'X-Creds-Bridge': key } })`. |

## S3.1 — The E1 document's choices, judged

1. **The jump chain is not a scope target — upheld.** F10: the agent runs nothing on the jump host, reads no secret of it, and
   cannot change the chain; the in-scope entry connects exactly as the person configured it and as the person's own click does.
   Making the jump a scope target would refuse an in-scope entry for a reason the agent cannot see, and the only fix would be to
   add the jump entry to the scope, which *widens* what the agent may do (it could then `exec` on the jump host). A scope rule
   whose remedy is widening is the wrong rule. The jump's name is not disclosed either: `dependsOn` is trimmed (§S3.2.6).
2. **`Grant.bridge` as the carrier — upheld, with one field removed.** F2 is the argument: consent, launch, remember and the
   audit funnel already hold the grant, and E1.4's `bridge=<name>` on every line needs it on the grant or at ten log sites. But the
   E1 document put `spendToken` — a token's secret — inside another grant's record. That is a second place a token secret lives, in
   a map with a cap and an eviction policy, handed to `describe` and copied into `UseActionContext` with a manual strip. **Overturned:**
   `BridgeGrant` is `{ context, quiet }` and nothing else; the token a bridged token call spends rides the per-request `RequestWho`
   into `CallSubject.spend` and is reserved by `brokerCall.ts`, where "count this use" already lives (§S3.2.3). Nested, not
   intersected, so `ctx.bridge = grant.bridge?.context` strips nothing by hand.
3. **One sentence for every reference failure — upheld.** `locate`'s messages tell a dangling reference from a real one and list
   candidate paths on ambiguity (`secretRef.ts:137,143,149-152`); through a bridge each would be an oracle over the whole vault.
   The sentence repeats the reference as stored, which the listing already shows (`McpEntry.command`). One wording change: the
   E1 text says "stored command"; a script body is a text source too, so it says "stored command or script" (§S3.4).
4. **A token on a bridge door mints a per-call grant — upheld.** F3: a token's allowance is per token for its life, so a token
   allowed locally would run silently through a bridge and one allowed through server A would be allowed for local use and server
   B. Minting per call makes a bridged token call the shape of an alias call: throttled by the modal budget, asked every time, a
   Deny refusing that call only. A token denied *locally* keeps its tombstone and is refused with no dialog. One correction, from
   item 2: the token's use count and idle clock move in `reservedNow`, before the call grant's, so a token that has run out spends
   nothing and answers `reservationRefused`'s sentence.
5. **The positive allow-list — upheld: reads, `exec`, `query`; `run` at the end of E3; `rotate`, `delete`, `terminal`, `up`,
   `down`, create, folder verbs and `/v1/config/read` refused.** `exec` and `query` already run in the right place (the laptop
   connects to the entry's host; the laptop queries, owner decision 8). `terminal` opens a VS Code terminal on the laptop, which an
   agent on a server cannot type into, so refusing it costs nothing and the owner's question about it is trivial. `up`/`down` act on
   the laptop's VPN, and owner decision 6 made the server VPN a script. `rotate` writes the vault from a server-side agent and sits on
   the `edit` rung. Default deny decides all of them; a row is added only by name.

   Two further E1 details are overturned, both from §E1.3 *The wall, route by route*:
   - **`resolveUse: scope.has(id) first, without touching the real lookup`** — overturned. An out-of-scope id would answer faster
     than an unknown one, and the two must do the same work. The real lookup runs for every id, narrowed to the context's account,
     and the scope decides afterwards (§S3.2.5). Both answers are `undefined` through `refusalFor`.
   - **`scopedRefSource.entities()` answers only in-scope entries** — overturned. A reference ambiguous for the person (two
     entries named `db`, one in scope) would resolve silently for the agent to the in-scope one — "it would work until the day it
     chose the other" (`secretRef.ts:10-17`). `entities()` answers the account's full list, so ambiguity is decided as the person's
     run decides it; the wall is `fieldReading`, which answers `absent` for anything the scope does not admit, and `accounts()`,
     which answers the context's account only (§S3.2.9).

## S3.2 — Types and signatures

### S3.2.1 `bridgeContext.ts` (E1.2's file; pure)

```ts
export interface BridgeContext {            // E1.2, unchanged: no key, frozen by freezeBridgeContext
  readonly bridgeId: string;
  readonly accountId: string;
  readonly serverEntityId: string;
  readonly serverName: string;
  readonly target: string;
  readonly remoteOs: string | undefined;
}
/** What a grant minted on a bridge door carries. `quiet` is the scope's switch at mint time (E1.4 reads it). */
export interface BridgeGrant {
  readonly context: BridgeContext;
  readonly quiet: boolean;
}
```

### S3.2.2 `bridgeNote.ts` (pure; constants only — the publisher is E2.2, the reader E2.1)

```ts
export const BRIDGE_KEY_HEADER = 'X-Creds-Bridge';          // E1.2
export const BRIDGE_NOTE_DIR = '.creds-for-devs/bridge';     // under the login user's home, mode 0700 (parent §4.3)
export const BRIDGE_NOTE_SUFFIX = '.json';                   // the file is `<bridgeId>.json`
export const BRIDGE_NOTE_FIELDS = {
  socket: 'string', port: 'number', brokerPort: 'number', key: 'string', serverName: 'string', openedAt: 'string',
} as const;
export interface BridgeNote {
  readonly socket: string;      // the forwarded unix socket path, this connection's
  readonly port: number;        // the bridge listener's port: what a client puts in `Host`
  readonly brokerPort: number;  // the main broker's port: how a token call finds its window (parent §4.5)
  readonly key: string;         // the value of X-Creds-Bridge, base64url, 43 chars
  readonly serverName: string;  // the server entry's name, for the client's messages; decides nothing
  readonly openedAt: string;    // ISO 8601 UTC
}
type SameSet<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;   // brokerHooks.ts:207
const FIELDS_MATCH_THE_TYPE: SameSet<keyof BridgeNote, keyof typeof BRIDGE_NOTE_FIELDS> = true;
void FIELDS_MATCH_THE_TYPE;
```

`brokerProtocol.ts`: `export const ALIAS_ROUTE_PREFIX = '/v1/alias/';` and `parseAliasRoute` (`:222-229`) uses it in place of its
literal. Nothing else in that file: E1.1 adds `EXPORT_REFUSED` beside `INTERNAL_FAILURE` (`:95`) on branch `feat/remote-bridge-e1-s1`,
and a second constant in that hunk would collide. So `export const GRANT_NOT_ALLOWED = 'The human did not allow this grant.';` lives
in `brokerRequests.ts` beside `UNKNOWN_TOKEN`, used at `credsAgentServer.ts:625` in place of the literal (same line count) and by
§S3.2.10. `bridgeAllowList.ts` imports `EXPORT_REFUSED` from `brokerProtocol.ts`, so E1.1 lands before E1.3 is built.

`scripts/emit-contract.mjs`: after `caller` (`:154-160`) a `bridge` block read off `out/bridgeNote.js`, and `aliasPrefix` read off
`protocol.ALIAS_ROUTE_PREFIX`; both placed after `caller` in `contract` (`:194`) with a comment in the words of `:192-194`
(additive, `version` stays 1):

```js
const bridgeNote = await import(pathToFileURL(join(extensionRoot, 'out', 'bridgeNote.js')).href);
// in `contract`, after `caller`:
  aliasPrefix: protocol.ALIAS_ROUTE_PREFIX,
  bridge: {
    keyHeader: bridgeNote.BRIDGE_KEY_HEADER,
    noteDir: bridgeNote.BRIDGE_NOTE_DIR,
    noteSuffix: bridgeNote.BRIDGE_NOTE_SUFFIX,
    noteFields: { ...bridgeNote.BRIDGE_NOTE_FIELDS },
  },
```

### S3.2.3 `grantRegistry.ts`, `brokerCall.ts`, `useActions.ts`, `brokerRequests.ts`

```ts
// grantRegistry.ts:20-49
export interface Grant { /* as today */ readonly bridge?: BridgeGrant; }
// :132-139 — a seventh parameter; the key is ABSENT when undefined, never present as undefined
mint(accountId, entityId, entityName, kind, now = Date.now(), scope: GrantScope = 'token', bridge?: BridgeGrant): Grant
//   ...  scope, ...(bridge === undefined ? {} : { bridge }) };

// brokerCall.ts:23-49
export interface CallDeps { /* as today */
  /** The scope wall's gate at the action boundary; absent on a build with no bridge. A refusal spends nothing. */
  atLaunch?(): Refusal | undefined;
}
// :51-63
export interface CallSubject { /* as today */
  /** The token a bridged token call spends: reserved first, in the same step as the call grant. */
  readonly spend?: string;
}
// :124-134 — order: aborted → atLaunch → reservedNow → startNow. Complexity 4.
function answer(deps, call) {
  if (call.signal.aborted) { deps.abandon('before the action started'); return Promise.resolve(); }
  const refused = deps.atLaunch?.();
  if (refused !== undefined) { deps.refuse(refused.code, refused.message); return Promise.resolve(); }
  if (!reservedNow(deps, call)) { return Promise.resolve(); }
  return deliver(deps, call, startNow(call));
}
// :146-154 — the token first, so one that has run out costs nothing
function reservedNow(deps, call): boolean {
  const limits = grantLimits(); const now = Date.now();
  const reserved = spentToken(deps, call, now, limits) ?? deps.grants.reserve(call.grant.secret, now, limits);
  if (reserved.kind !== 'live') { deps.refuse('unauthorized', reservationRefused(reserved, limits)); return false; }
  return true;
}
/** The token behind a bridged call, reserved — or the non-live answer that refuses the call. `undefined` when there is none or it is live. */
function spentToken(deps, call, now, limits): GrantLookup | undefined
// :162-167
startNow: useAction.run({ accountId, entityId, entityName, signal, bridge: grant.bridge?.context }, body)

// useActions.ts:14-33
export interface UseActionContext { /* as today */ readonly bridge?: BridgeContext; }   // import type

// brokerRequests.ts
export const UNKNOWN_TOKEN = 'Unknown or missing grant token.';   // used at :238 and :252 in place of the literal
export type Refusal = { readonly code: ErrorCode; readonly message: string };
```

### S3.2.4 `bridgeAllowList.ts` (pure; E1.2 created it with one route)

```ts
export const BRIDGE_NOT_SERVED = 'A Remote Bridge does not serve this request. A person can do it in the VS Code window.';  // E1.2
export type BridgeRouteDecision =
  | { readonly served: true; readonly walled: boolean; readonly why: string }
  | { readonly served: false; readonly code: 'not_supported'; readonly message: string; readonly why: string };
export interface BridgeRoute { readonly method: 'GET' | 'POST'; readonly path: string; readonly decision: BridgeRouteDecision; }
/** Every contract route, and `/v1/alias/<action>`, by name. The table of §S3.3. Exported for the walk (S1). */
export const BRIDGE_ROUTES: readonly BridgeRoute[];
/** `undefined` admits. Exact method and pathname; the query string is not looked at. Anything not in the table is refused. */
export function bridgeRouteRefusal(method: string | undefined, pathname: string): Refusal | undefined;
```

`BRIDGE_ROUTES` is built from the vocabulary, not retyped: the use actions from the contract's own list (`exec`, `terminal`,
`query`, `run`, `exportEnv`, `up`, `down`; `mcpActions` adds `rotate`) under the three prefixes, the reads, and the five fixed POSTs.
`exportEnv` rows carry `EXPORT_REFUSED` (E1.1, `brokerProtocol.ts`); every other refused row carries `BRIDGE_NOT_SERVED`.

### S3.2.5 `bridgeScope.ts` (pure)

```ts
import type { ConsentStampStore } from './mcpConsentPolicy';   // the Memento subset (:72-75)

export const SCOPES_KEY = 'credSshManager.bridgeScopes';
export const MAX_SCOPES = 64;              // records; the oldest `at` is pruned on `set`
export const MAX_SCOPE_ENTRIES = 256;      // `set` throws past it: no picker offers that many
export interface ScopeRecord { readonly entries: readonly string[]; readonly quiet: boolean; readonly at: number; }
/** Length-prefixed like `stampKey` (mcpConsentPolicy.ts:84-86), so `a:b`+`c` and `a`+`b:c` differ. */
export function scopeKey(accountId: string, serverEntityId: string): string;   // `${accountId.length}:${accountId}:${serverEntityId}`

/** One server's scope, read fresh. `admits` closes over the account it was read for. */
export interface Scope {
  readonly entries: ReadonlySet<string>;
  readonly quiet: boolean;
  admits(accountId: string, entityId: string): boolean;   // accountId === the context's && entries.has(entityId)
}
export class BridgeScopes {
  constructor(store: ConsentStampStore, now: () => number = Date.now);
  /** Synchronous and fresh: `store.get` every time. A missing or malformed record is an empty scope with `quiet: false`. */
  read(accountId: string, serverEntityId: string): Scope;
  set(accountId: string, serverEntityId: string, entries: readonly string[], quiet: boolean): Promise<void>;  // SerialQueue
  forget(accountId: string, serverEntityId: string): Promise<void>;
}

/** What the wall needs from the vault side. Wired by E2.2 (`extension.ts`); a build without it opens no bridge (R4). */
export interface BridgeWallSource {
  readonly scopes: BridgeScopes;
  /** The texts a stored command or script would be searched in — `referenceTextsOf(details)` of the LIVE entity. */
  storedTexts(accountId: string, entityId: string): readonly string[];
  readonly refSource: Pick<RefSource, 'accounts' | 'entities'>;
}

export type ResolveUse = (entryId: string, action: string, server?: { accountId: string; serverEntityId: string }) => McpUseLookup;
export type AliasResolver = (name: string) => McpUseTarget | undefined;

export interface DoorView {
  readonly bridge: BridgeContext | undefined;
  sources(real: ReadRouteSources, resolveAlias: AliasResolver | undefined): ReadRouteSources;
  resolveUse(real: ResolveUse | undefined): ResolveUse | undefined;
  resolveAlias(real: AliasResolver | undefined): AliasResolver | undefined;
  grantFor(): BridgeGrant | undefined;
  /** `grantForToken` (brokerRequests.ts:226-240) behind the wall: an out-of-scope token is `UNKNOWN_TOKEN`, decided by `get`, before any `lookup`. */
  grantForToken(authorization: string | undefined, grants: GrantRegistry, limits: GrantLimits): { ok: true; grant: Grant } | { ok: false; message: string };
}
/** The existing doors' view: every method hands back the function object it was given (S13). */
export const OPEN_VIEW: DoorView;
/** A bridge with no wall is unreachable (R4) and still fails closed: every lookup answers nothing. */
export const CLOSED_VIEW: DoorView;
export function doorView(bridge: BridgeContext | undefined, wall: BridgeWallSource | undefined): DoorView;

/** The gate at launch: the grant's account and entity against a fresh scope, then its references. `undefined` off a bridge. */
export function launchRefusal(grant: Grant, wall: BridgeWallSource | undefined, via: AuditDoor, body: Record<string, unknown>): Refusal | undefined;
/** The route's own not-found sentence, built by the route's own function so it cannot drift (F5). */
export function outOfScopeAnswer(via: AuditDoor, body: Record<string, unknown>): Refusal;
/** Every `creds://` target of the grant's entity admitted by a fresh scope, or the one sentence of §S3.4. `undefined` off a bridge. */
export function referenceRefusal(grant: Grant, wall: BridgeWallSource | undefined): Refusal | undefined;
/** The seam E3.3 resolves through: `accounts()` the context's row only; `entities()` that account's full list; `fieldReading` `absent` unless admitted. */
export function scopedRefSource(context: BridgeContext, wall: BridgeWallSource, source: RefSource): RefSource;
```

**Behaviour of `doorView(bridge, wall)` on a bridge** (`scope()` = `wall.scopes.read(bridge.accountId, bridge.serverEntityId)`,
called inside each wrapped function, never when the view is built):

- `sources(real, resolveAlias)`:
  - `aliases`: `(real.aliases?.() ?? [])` kept where `resolveAlias?.(name)` is a target `scope().admits(target.accountId, target.entityId)`.
    No resolver → an empty list.
  - `mcpEntries`: `await real.mcpEntries?.()`, kept where `scope().entries.has(entry.id)`; each kept row gets
    `can: { use: entry.can.use, edit: false, create: false, delete: false }` and `dependsOn` filtered to names of kept rows.
  - `visibleConfig`: `(id) => scope().entries.has(id) ? real.visibleConfig?.(id) : undefined`.
  - `folders`: `() => []`.
- `resolveUse(real)`: `(id, action) => { const found = real?.(id, action, { accountId, serverEntityId }); ... }` — `undefined` stays;
  `closed` stays only when `scope().entries.has(id)`, else `undefined`; `usable` stays only when
  `scope().admits(found.target.accountId, found.target.entityId)`, else `undefined`, and is answered as
  `{ ...found, preConsented: false, rungs: '' }` (E1.4 turns this into the quiet switch). The real lookup runs for every id (§S3.1).
- `resolveAlias(real)`: `(name) => admitted(real?.(name))`, the same `admits` test.
- `grantFor()`: `{ context: bridge, quiet: scope().quiet }`.
- `grantForToken(auth, grants, limits)`: `const secret = parseBearer(auth); const peek = secret === undefined ? undefined : grants.get(secret);`
  if `peek !== undefined && !scope().admits(peek.accountId, peek.entityId)` → `{ ok: false, message: UNKNOWN_TOKEN }`; else the real
  `grantForToken(auth, grants, limits)`.

**`launchRefusal(grant, wall, via, body)`**: `grant.bridge === undefined` → `undefined`. Else `scope = wall.scopes.read(…)` from
`grant.bridge.context`; `!scope.admits(grant.accountId, grant.entityId)` → `outOfScopeAnswer(via, body)`; else `referenceRefusal(grant, wall)`.
`wall === undefined` with a bridged grant → `outOfScopeAnswer` (fail closed; unreachable by R4).

**`outOfScopeAnswer(via, body)`**: `'mcp'` → `refusalFor(undefined)`; `'alias'` → `aliasTarget(undefined, String(body.alias))` without
its `ok`; `'token'` and `'config'` → `{ code: 'unauthorized', message: UNKNOWN_TOKEN }`.

**`referenceRefusal(grant, wall)`**: `grant.bridge === undefined` → `undefined`. `refs = planRefs(wall.storedTexts(accountId, entityId)).refs`;
for each `ref` in order: `located = locateRef(ref, wall.refSource)` (§S3.2.8); refused when `!located.ok` or
`!scope.admits(located.accountId, located.entityId)`, with `{ code: 'denied', message: REFERENCE_REFUSED(grant.entityName, ref) }`.
`storedTexts` and `locateRef` are called inside `try`; any throw is the same refusal for that reference. Never a 500, never a path.

### S3.2.6 `mcpEntries.ts` and `mcpHooks.ts`

```ts
// mcpEntries.ts — pure helper beside findUsableEntry (:344-356)
/** The same source with `getAccounts` answering one row, or none: how a bridge lookup is kept to its account. */
export function accountOnly(source: Pick<McpVaultSource, 'getAccounts' | 'getNode'>, accountId: string): Pick<McpVaultSource, 'getAccounts' | 'getNode'>;

// mcpHooks.ts:145-153 — a sixth parameter; :154 searches `server === undefined ? storage : accountOnly(storage, server.accountId)`
export function mcpUseLookup(storage, entryId, action, stamps?, now = Date.now(), server?: { accountId: string; serverEntityId: string }): McpUseLookup
// :198 — resolveMcpUse: (entryId, action, server) => mcpUseLookup(storage, entryId, action, stamps, now(), server)
```

`brokerHooks.ts:129`: `resolveMcpUse?: ResolveUse` (the three-parameter type above; existing two-parameter callers still fit).
`brokerHooks.ts`, after `configRoute` (`:161`): `readonly bridgeWall?: BridgeWallSource;` and in `HOOK_KINDS` (`:184-199`)
`bridgeWall: 'object'` — the assertion at `:213` forces it.

### S3.2.7 `runPlan.ts`

```ts
/** Where a reference may be written, the texts `commands/runCommands.ts:321-328` searches — every row, disabled too. */
export function referenceTextsOf(details: Pick<EntityMetadata, 'isScript' | 'script' | 'scriptVars' | 'command' | 'commandArgs'>): string[];
// isScript === true ? [script ?? '', ...(scriptVars ?? []).map((v) => v.value)] : [command ?? '', ...(commandArgs ?? []).map((a) => a.value)]
```

### S3.2.8 `secretRef.ts`

```ts
/** `locate` for a caller that must not see its messages: parsed and located, or `ok: false` with no reason. Never throws. */
export function locateRef(raw: string, source: Pick<RefSource, 'accounts' | 'entities'>): { ok: true; accountId: string; entityId: string } | { ok: false };
```

`locate` (`:130-156`) itself is unchanged; `locateRef` calls `parseSecretRef` then `locate` with a `RefSource` whose `fieldReading`
rejects (it is never reached). Nothing else in the file changes.

### S3.2.9 `scopedRefSource(context, wall, source)`

- `accounts()`: `source.accounts().filter((a) => a.accountId === context.accountId)`.
- `entities(accountId)`: `accountId === context.accountId ? source.entities(accountId) : []`.
- `fieldReading(accountId, entityId, field)`: `wall.scopes.read(context.accountId, context.serverEntityId).admits(accountId, entityId)`
  → `source.fieldReading(…)`; else `Promise.resolve({ kind: 'absent' })` and the real `fieldReading` is not called (S16).

Exported and tested in E1; unused in production until E3.3, which must resolve through it whenever `ctx.bridge` is set and map any
`ok: false` of `resolveSecretRefs` under a bridge to the one sentence of §S3.4 (E3's document names this obligation).

### S3.2.10 `brokerBridgeToken.ts` (pure)

```ts
/**
 * A token on a bridge door authenticates only (§S3.1 item 4): the call is minted and asked like an alias call.
 * `door` is the broker's `BrokerDoor` built with `via: 'token'` and the token's secret as `spend`.
 */
export async function bridgedTokenCall(
  door: BrokerDoor, res: http.ServerResponse, token: Pick<Grant, 'secret' | 'accountId' | 'entityId' | 'entityName' | 'kind' | 'status'>,
  action: string, body: Record<string, unknown>, caller: CallerLabel | undefined,
): Promise<void>
```

In order: `token.status === 'denied'` → `door.refuse(res, 'denied', GRANT_NOT_ALLOWED, token, action, undefined, caller)` and return.
`slot = door.admit(res, true)`; `undefined` → return. `grant = door.mint({ accountId, entityId, entityName, kind })`;
`door.note({ grant: door.describe(grant), entityName, action: 'token', outcome: 'minted', detail: `${entityName} · ${kind} · through a bridge`, caller })`.
`try { await door.perform(res, grant, action, body, caller, undefined); } finally { slot.release(); }`.

## S3.3 — The decision table, in check order

Every request on a bridge door passes, in this order: **0** the door (E1.2: browser marks → `REFUSED`; no key → `BRIDGE_NO_KEY`;
wrong key → `BRIDGE_WRONG_KEY`; wrong `Host` → `REFUSED`; all 403 `forbidden`, `Connection: close`); **1** the allow-list,
`bridgeRouteRefusal(method, pathname)`, body unread, `Connection: close`, no journal line; **2** the route's own steps with the view;
**3** `perform`: kind/action (`not_supported`), `validate` (`invalid_request` or the action's code), the early reference check; consent;
**4** `answer`: client gone → `ABANDONED`; `atLaunch` (scope, then references); reserve (token first); start.

"IN" = the entry is in the bridge's scope; "OUT" = in the vault and not in scope; "ABSENT" = no such entry. OUT and ABSENT are one
column because they must be one answer. `<r>` is the request's own refusal as today (413 `payload_too_large`, 400 `invalid_request`).

| # | Route | Step 1 | Step 2 (IN) | Step 2 (OUT = ABSENT) |
|---|---|---|---|---|
| 1 | `GET /v1/health` | served | `{ ok: true, service }` | — |
| 2 | `GET /v1/mcp/kinds`, `GET /v1/mcp/kind-help` | served | as today; no vault data | — |
| 3 | `GET /v1/aliases` | served, walled | the name is listed | the name is absent |
| 4 | `GET /v1/mcp/entries` | served, walled | the row, `can` narrowed to `{ use, false, false, false }`, `dependsOn` trimmed to kept names | the row is absent, and no kept row names it |
| 5 | `GET /v1/mcp/config-snippet?id=` | served, walled | the snippet body | 200, `{ error: 'no such config is open to agents', envVar, languages: [] }` |
| 6 | `GET /v1/mcp/folders` | served, empty | `{ folders: [] }` | `{ folders: [] }` |
| 7 | `POST /v1/mcp/use/exec`, `…/query` | served, walled | `<r>` → `closed` (403 `denied`, the switch sentence) or usable → throttle (429 `too_many_requests`) → mint with `grantFor()` → step 3 → modal every call → step 4 | `<r>` → 404 `not_found` `No such entry, or this window does not serve it.` No slot taken, no dialog, no journal line |
| 8 | `POST /v1/alias/exec`, `…/query` | served, walled | `<r>` → throttle → mint → step 3 → modal → step 4 | `<r>` → 404 `not_found` `No entry is enabled for the CLI under "<name>".` No slot, no dialog, no line |
| 9 | `POST /v1/use/exec`, `…/query` (token) | served, walled | `grantForToken` (401 unknown or expired as today) → `<r>` → §S3.2.10: denied token 403 `GRANT_NOT_ALLOWED`, no dialog; throttle; mint; step 3; modal every call; step 4, the token reserved first | 401 `unauthorized` `Unknown or missing grant token.` — before the body is read, for a live and for an expired token alike |
| 10 | `…/exportEnv` on `/v1/use/`, `/v1/alias/`, `/v1/mcp/use/` | refused | 403 `denied`, `EXPORT_REFUSED` | the same |
| 11 | `…/run`, `…/terminal`, `…/up`, `…/down` on the three prefixes; `…/rotate` on `/v1/mcp/use/` (and on the other two, which never served it) | refused | 404 `not_supported`, `BRIDGE_NOT_SERVED` | the same |
| 12 | `POST /v1/config/read`, `POST /v1/mcp/create`, `POST /v1/mcp/delete`, `POST /v1/mcp/folder/create`, `…/edit`, `…/delete` | refused | 404 `not_supported`, `BRIDGE_NOT_SERVED`; the hook is never called | the same |
| 13 | any other method or path (`GET /v1/use/exec`, `POST /v1/health`, `/v1/nope`, `/v1/mcp/future`) | refused | 404 `not_supported`, `BRIDGE_NOT_SERVED` | the same |

**Step 4 for rows 7-9 when the scope changed while the modal was open**: `atLaunch` answers the route's own OUT sentence of the row
(7: `not_found` entry; 8: `not_found` alias; 9: 401 `UNKNOWN_TOKEN`), through `respondError` with the grant, so one journal line is
written; nothing is reserved, started or burned. **Step 3 and step 4 for a reference**: 403 `denied`, the sentence of §S3.4; in step 3
before any dialog, in step 4 after it.

Off a bridge (`bridge === undefined`) nothing in this table applies: `OPEN_VIEW` hands back the real functions, `grantFor()` is
`undefined`, `launchRefusal` and `referenceRefusal` return `undefined` on the first line, and `spend` is never set.

## S3.4 — The sentences and statuses (exact)

| Name | Where | Status · code | Text |
|---|---|---|---|
| `BRIDGE_NOT_SERVED` | `bridgeAllowList.ts` (E1.2) | 404 `not_supported` | `A Remote Bridge does not serve this request. A person can do it in the VS Code window.` |
| `EXPORT_REFUSED` | `brokerProtocol.ts` (E1.1) | 403 `denied` | E1.1's text, verbatim |
| not-found entry | `refusalFor(undefined)`, `brokerRequests.ts:183` | 404 `not_found` | `No such entry, or this window does not serve it.` |
| not-found alias | `aliasTarget(undefined, name)`, `:165` | 404 `not_found` | `No entry is enabled for the CLI under "<name>".` |
| `UNKNOWN_TOKEN` | `brokerRequests.ts` (new constant, `:238,252`) | 401 `unauthorized` | `Unknown or missing grant token.` |
| `GRANT_NOT_ALLOWED` | `brokerRequests.ts` (new constant, used at `credsAgentServer.ts:625`) | 403 `denied` | `The human did not allow this grant.` |
| `REFERENCE_REFUSED(entityName, ref)` | `bridgeScope.ts` | 403 `denied` | `"<entityName>" uses <ref>, which this Remote Bridge does not serve. Add that entry to this bridge's scope, or take the reference out of the stored command or script.` |
| snippet not found | `configSnippetResult(undefined, …)`, `mcpSnippetRoute.ts:84-85` | 200 | `{ error: 'no such config is open to agents', envVar: 'CREDSFORDEVS_KEY', languages: [] }` (`CONFIG_KEY_ENV`, `configKey.ts:44`; assert through `configSnippetResult(undefined, …)`, not the literal) |

`REFERENCE_REFUSED` is one function; the four failures (no such account, no such entity, ambiguous, out of scope) and a throw all call
it with the same two arguments. `<ref>` is the reference as stored, untrimmed, as `planRefs` returned it. `denied` because the MCP
client's walk moves on only from a `not_found` (`src_mcp/src/Windows.cs:158-159`), and this call must stop.

## S3.5 — Every file, and what changes

| File | Change | Against `fe86db8` |
|---|---|---|
| `bridgeContext.ts` (new in E1.2) | add `BridgeGrant` (§S3.2.1) | — |
| `bridgeNote.ts` (new in E1.2) | add the four constants, `BridgeNote`, the compile assertion (§S3.2.2) | — |
| `bridgeAllowList.ts` (new in E1.2) | fill `BRIDGE_ROUTES` and `bridgeRouteRefusal` (§S3.2.4, §S3.3) | — |
| `bridgeScope.ts` (new) | everything in §S3.2.5, §S3.2.9 | — |
| `brokerBridgeToken.ts` (new) | §S3.2.10 | — |
| `brokerProtocol.ts` | `ALIAS_ROUTE_PREFIX`, used in `parseAliasRoute`; nothing near `:95` (E1.1's hunk) | `:222-229` |
| `brokerRequests.ts` | `UNKNOWN_TOKEN`, `GRANT_NOT_ALLOWED`, `Refusal`; the two literals replaced | `:238`, `:252` |
| `grantRegistry.ts` | `Grant.bridge?`; `mint`'s seventh parameter, key absent when undefined | `:20-49`, `:132-155` |
| `brokerCall.ts` | `CallDeps.atLaunch?`, `CallSubject.spend?`, `answer`, `reservedNow` + `spentToken`, `startNow` passes `bridge` | `:23-49`, `:51-63`, `:124-134`, `:146-154`, `:162-167` |
| `useActions.ts` | `UseActionContext.bridge?` | `:14-33` |
| `brokerHooks.ts` | `resolveMcpUse` type widened; `bridgeWall?`; `HOOK_KINDS.bridgeWall: 'object'` | `:129`, after `:161`, `:184-199` |
| `mcpEntries.ts` | `accountOnly` | beside `:344-356` |
| `mcpHooks.ts` | `mcpUseLookup` sixth parameter; `mcpUseHooks` passes `server` | `:145-154`, `:198` |
| `runPlan.ts` | `referenceTextsOf` | after `:59` |
| `secretRef.ts` | `locateRef` | after `:156` |
| `credsAgentServer.ts` | §S3.6, line by line | — |
| `scripts/emit-contract.mjs` | `aliasPrefix`, `bridge` (§S3.2.2); `npm run contract` regenerates `contract/broker-v1.json` | `:154-160`, `:194` |
| `test/brokerWorld.ts` | option `aliasMap?: Record<string, { accountId; entityId; entityName; kind }>`; `aliasResolverFor(options.alias, options.aliasMap)` reads it before the `prod` rule | `:107`, `:477-481` |

**Untouched:** `brokerMcpDoor.ts`, `brokerMcpRoutes.ts`, `brokerReadRoutes.ts`, `brokerFolderDoor.ts`, `brokerConfigRoute.ts`,
`brokerOrigin.ts` beyond E1.2, `commands/runCommands.ts`, every use action, `agentAuditLog.ts`, `mcpConsentPolicy.ts` (E1.4's),
`src_cli`, `src_mcp`, `src_broker_client` and their tests, `install.sh`, `scripts/creds-cli-itest.cjs`, `extension.ts` (zero lines:
nothing wires `bridgeWall` until E2.2, R1).

## S3.6 — `credsAgentServer.ts`, every edit, counted

E1.2's guard in `handle` (`:435-489`) must be **three** lines — `if (refusedOnBridge(bridge, req.method, url.pathname, res, (code, message) => this.respondError(res, code, message))) { return; }`
with the `Connection: close` inside the pure `refusedOnBridge` of `bridgeAllowList.ts` (the S2 spec, §S2.2) — because `handle` is 43
code lines today and the fifty-line ceiling counts code lines (F11). With that, this story adds:

| Where | Edit | Lines |
|---|---|---|
| `:16-42` imports | `import { DoorView, doorView, launchRefusal, referenceRefusal } from './bridgeScope';` `import { bridgedTokenCall } from './brokerBridgeToken';`; `UNKNOWN_TOKEN` is not needed here (the view answers it) | +2 |
| `:243-248` `answerMcp(req, res, pathname, signal, view: DoorView)` | one parameter line; `:251` `door: this.doorFor(signal, view)`; `:253` `resolveUse: view.resolveUse(this.hooks.resolveMcpUse)` | +1 |
| `:275` `doorFor(signal, view: DoorView, via: AuditDoor = 'mcp', spend?: string)` | `:278` `…, via, caller)`; `:286` `this.grants.mint(…, Date.now(), 'call', view.grantFor())`; `:290` `{ via, caller, signal, spend }`; `:295` `{ via, caller }` | 0 |
| `:312-317` `handleAlias(req, res, action, signal, view: DoorView)` | one parameter line; `:327` `aliasTarget(view.resolveAlias(this.hooks.resolveAlias), name)`; `:344` `…, 'call', view.grantFor())` | +1 |
| `handle`, after E1.2's guard | `const view = doorView(bridge, this.hooks.bridgeWall);` | +1 |
| `:443` | `readRouteBody(url.pathname, view.sources(this.readSources(), this.hooks.resolveAlias), url.searchParams)` | 0 |
| `:449`, `:454` | pass `view` | 0 |
| `:468` | `const authorised = view.grantForToken(req.headers.authorization, this.grants, grantLimits());` | 0 |
| `:488` | `const who: RequestWho = { via: 'token', caller: callerFrom(body), signal };` then `await (view.bridge === undefined ? this.perform(res, grant, action, body, who) : bridgedTokenCall(this.doorFor(signal, view, 'token', grant.secret), res, grant, action, body, who.caller));` over three lines | +2 |
| `perform`, after `:518` (`usable` answered) | `const refused = referenceRefusal(grant, this.hooks.bridgeWall);` `if (refused !== undefined) { this.respondError(res, refused.code, refused.message, grant, action, undefined, who.via, who.caller); return; }` | +5 |
| `:532` `prepared(res, { …, signal: who.signal, spend: who.spend })` | same line | 0 |
| `runAndDeliver`, in the `CallDeps` literal after `:663` | `atLaunch: () => launchRefusal(grant, this.hooks.bridgeWall, via, call.body),` | +1 |
| `:775-779` `RequestWho` | `readonly spend?: string;` | +1 |
| `openBridgeListener` (E1.2's arrow property) | first line: `if (this.hooks.bridgeWall === undefined) { throw new Error('A Remote Bridge cannot open without its scope wall.'); }` (R4) | +3 |
| | **Total** | **+17** |

`handle` ends at 43 + 3 (E1.2) + 3 (here) = 49 code lines; `perform` at complexity 4; `answer` at complexity 4. The file ends at
779 − 17 + 14 (E1.2, the S2 spec §S2.5) + 17 + 1 (E1.4, the S4 spec) = 794 at most. Check with `wc -l src/credsAgentServer.ts` and `npm run lint`.

## S3.7 — Scenarios, with the RED-first order

Files: `test/bridgeAllowList.test.ts`, `test/bridgeScope.test.ts`, `test/bridgeNote.test.ts` (pure); `test/bridgeScopeWalk.test.ts`,
`test/bridgeTransitive.test.ts` (real broker through `w.server.openBridgeListener(ctx)`, requests through `call(port, path, { headers: { 'X-Creds-Bridge': key } })`
and `method: 'GET'` for reads); additions to `test/brokerContract.test.ts` and `test/brokerCall.test.ts` (or `credsAgentServer.test.ts`).

**The order that makes the RED real.** Against E1.2's code every performing route is refused by the one-route table, so a walk
asserting "never 200 with `e-out`" is green for nothing. So: **step A** fills `BRIDGE_ROUTES` (S1, S2, S6 go green) with the view
still `OPEN_VIEW` for every door; at that point S3, S5, S7, S8, S10, S14, S15 are RED for the right reason — `e-out` reaches the
action through the bridge — and each failure is recorded in the summary. **Step B** builds the wall. S4 is kept green for good as the
negative control.

The world for the walk: `world({ supports: ['exec', 'query'], mcpResolve: <real mcpUseLookup over a tree with e1 and e-out in account a1, both open to agents>, aliasMap: { one: e1, out: e-out }, aliasList: [...], mcpEntries: [row e1 (dependsOn ['e-out'], can all true), row e-out], visibleConfig: <e1 and e-out as configs>, hooks: { bridgeWall } })`
with `bridgeWall = { scopes: new BridgeScopes(fakeMemento), storedTexts: () => [], refSource: <a1 with both entities> }` and the scope of
`(a1, server1)` set to `['e1']`. Tokens: `w.server.share('a1', 'e1', …)` and `share('a1', 'e-out', …)`.

| # | Scenario | Expected | RED first, because |
|---|---|---|---|
| S1 | Every contract route is named | `contractRoutes(contract)` (E1 §E1.3 *How a route is enumerated*) ∪ `/v1/alias/<a>` for each use action ⊆ `BRIDGE_ROUTES` paths, and the reverse; a missing one fails with `<route> is in contract/broker-v1.json and not named in bridgeAllowList.ts. Name it: served, or refused and why.` | E1.2's table names one route |
| S2 | A future route fails | A copy of the contract with `mcpFutureRoute: '/v1/mcp/future'`, `mcpActions` plus `'future'`, and a top-level `'/v1/x'` string: all three reported unnamed | passes at step A; a break-it keeps it honest (B9) |
| S3 | **The walk** | For every row of §S3.3: through the bridge with `e-out` by id, by alias `out`, and by its token: never 200, `w.ran` empty, `w.dialogs` empty, the status and code of the row. Every read: 200 and the raw body text contains neither `e-out`, its name nor `out`. With `e1`: rows 7-9 reach the action after Allow (`w.ran` has `e1`); row 4 shows `e1` with `can: { use: true, edit: false, create: false, delete: false }` | at step A `e-out` runs through the bridge on rows 7-9 and appears in rows 3-5 |
| S4 | **Negative control** | The same walk through the main port: the finding list is non-empty and names `e-out` on rows 3-5 and 7-9 | green by design; it is what S3's RED looks like |
| S5 | **Indistinguishable** | World A: `x` exists, open to agents, out of scope — once usable, once `closed` (switch off). World B: no `x`. For rows 3-9 the same request answers the same status and byte-equal body (`durationMs` stripped) in both. The spy on `resolveMcpUse` saw the same calls with the same arguments in both. Token: A's real `x` token, live and then expired, against B's made-up one: 401 and the same body; a following call is not refused for lack of a slot | at step A, A answers 200 or `closed` where B answers 404 |
| S6 | The refused rows | Rows 10-13 of §S3.3, each with a valid key: the status, code and sentence; `Connection: close`; `w.dialogs` empty; for row 12 the `configRoute`, `mcpCreate`, `moveToTrash` and folder hooks were never called (spies) | E1.2's table refuses them already; kept as the table's pin |
| S7 | Context is the only identity | Listeners A (scope `e1`) and B (scope `e2`). `e2` through A refuses and through B works whatever the body carries (`serverEntityId`, `bridgeId`, `accountId`, `caller.agent` set to B's) or the query string says. A's key on B's port: `BRIDGE_WRONG_KEY` | at step A `e2` through A runs |
| S8 | **Transitive** | `storedTexts` → `['deploy creds://a1@x.test/Other/db/password']` where `Other/db` is `e-out`: rows 7-9 answer 403 `denied`, the exact sentence, `w.dialogs` empty, `w.ran` empty | at step A the call runs |
| S9 | All reference failures read alike | No such account, no such entity, ambiguous (two `db`), out of scope, a `storedTexts` that throws: the same sentence with only `<ref>` differing, no path and no email of a candidate in it. Placed in a script body, a script variable, a command, a command argument, a disabled argument (`referenceTextsOf` over `EntityMetadata` fixtures). All targets in scope: the call proceeds | at step A the call runs |
| S10 | **Scope narrowed while the modal is open** | `holdDialogs`; narrow to `[]`; answer Allow. Rows 7, 8, 9: `w.ran` empty; the row's OUT sentence; `grants.get(secret).bridge` still set after `allow`; the token's `uses` unchanged; the one-use lane not spent | at step A the action runs after Allow |
| S11 | A line edited while the modal is open | `storedTexts` answers `[]` before the dialog and an out-of-scope reference after: 403 `denied`, the sentence, `w.ran` empty | at step A it runs |
| S12 | The lane, and a closing listener | `oneUse: true`; two calls; the second waits; narrow; the second refuses at its turn, nothing reserved. A listener `close()`d with a modal open: one `ABANDONED` line, nothing runs | at step A both run |
| S13 | `OPEN_VIEW` is identity | `assert.equal(OPEN_VIEW.resolveUse(f), f)`, `resolveAlias(g) === g`, `sources(s, r) === s`, `grantFor() === undefined`, `grantForToken` answers exactly what `grantForToken` answers. A grant minted by `share`, by the alias route and by the MCP door has no `bridge` key (`'bridge' in grant === false`) | green at step A; pins the existing doors |
| S14 | A token on a bridge | Allowed locally first, then through the bridge: a dialog anyway, the local grant still `allowed`, a following local call silent. Asked through the bridge and allowed: a local call on the same token still asks (its grant is `pending`). Denied locally: 403 `GRANT_NOT_ALLOWED`, no dialog. `maxCalls: 1`: the first bridged call runs, the second answers the `uses` sentence of `expiredMessage` and nothing ran. Six at once: `too_many_requests` for the sixth | at step A the allowed token runs silently through the bridge |
| S15 | `can` and `dependsOn` | Row 4: `e1`'s `dependsOn` lacks `e-out`; add `e2` to the scope with `e1` depending on it: `e2` stays. `e1` with every permission lists `can.edit === false`, and `POST /v1/mcp/delete` for `e1` answers `BRIDGE_NOT_SERVED` | at step A the row shows `e-out` and `edit: true` |
| S16 | `scopedRefSource` with the real `resolveSecretRefs` | In scope: the value. Out of scope: `ok: false`, and the real `fieldReading` was never called with that id. Ambiguous: `ok: false` as for the person (both `db` listed by `entities()`). Another account's email: `ok: false` | pure, new |
| S17 | `BridgeScopes` | Missing record, malformed record, non-array `entries`, non-boolean `quiet`: empty scope, `quiet: false`. `admits` false for another account with the same entity id. Cap 64, the oldest `at` goes. `set` with 257 entries throws. `read` after a second store's write sees it. Two accounts with one server id do not mix | pure, new |
| S18 | The contract, both directions | `aliasPrefix` is accepted by `parseAliasRoute` and refused with anything appended that is not an action name; `bridge.*` equal `bridgeNote.ts`'s constants and `Object.keys(bridge.noteFields)` equal `Object.keys(BRIDGE_NOTE_FIELDS)`; `version === 1`; `git diff contract/broker-v1.json` shows additions only; `CredsBroker.Tests` green with no edit | RED until `npm run contract` is run |
| S19 | Nothing else moved | `credsAgentServer.test.ts`, `brokerMcpRoutes.test.ts`, `brokerAbandoned.test.ts`, `oneUse*`, `brokerCall*`, `grantRegistry.test.ts`, `brokerContract.test.ts` green with no expected value edited; R3 green | pins |
| S20 | Account mismatch | Account `a2` holds an entry with the same id `e1` (constructible in the fake tree). Scope `(a1, server1) = ['e1']`; a bridge context for `a1`: `e1` of `a2` by alias and by token is refused with the row's OUT sentence; the MCP lookup through the bridge never saw `a2` (`getAccounts` of the narrowed source answers `a1` only) | at step A `a2`'s entry runs |
| S21 | A refused launch spends nothing | After S10 and S12: `grant.uses === 0` for the call grant, the token's `uses` and `lastUsedAt` unchanged, `w.burned` empty | at step A it runs and burns |

Commands: the common block of E1 with `<name>` = `bridgeAllowList`, `bridgeScope`, `bridgeNote`, `bridgeScopeWalk`, `bridgeTransitive`,
`brokerContract`, `brokerCall`, `credsAgentServer`, `brokerBridgeListeners`; then `cd src_vs_code && npm run contract && git diff --stat contract/`;
then E1's pre-PR block, `CredsBroker.Tests` included.

## S3.8 — Break-its (mutate, watch the named case fail, restore; both outputs in the PR)

| # | Attack | Mutation | Red case | Symptom |
|---|---|---|---|---|
| B1 | A known id on a direct call | `view.resolveUse` passes a `usable` target through without `admits` | S3 row 7, S5 | 200, `w.ran` has `e-out` |
| B2 | A token minted for an out-of-scope entry | `view.grantForToken` calls the real `grantForToken` without the peek | S3 row 9, S5 token leg | the dialog is raised for `e-out`; or `expired` where B says unknown |
| B3 | Scope narrowed during an open modal | `answer` skips `deps.atLaunch` | S10, S12 | `w.ran` non-empty after Allow |
| B4 | An account mismatch | `Scope.admits` tests `entries.has(entityId)` only | S17, S20 | `a2`'s `e1` runs |
| B5 | A reference to an out-of-scope or ambiguous target | `referenceRefusal` admits when `located.ok` is false; or the early call in `perform` is dropped | S9 (ambiguous, dangling), S8 (`w.dialogs` non-empty) | the call runs, or a dialog is raised for a call that cannot run |
| B6 | A reference hiding in args or a variable | `referenceTextsOf` drops `commandArgs`, `scriptVars`, or disabled rows | S9 | the argument case runs |
| B7 | `dependsOn` and `can` in listings | the `mcpEntries` wrapper keeps `can` or `dependsOn` as received | S15, S3 row 4 | `e-out` named in `e1`'s row; `can.edit === true` |
| B8 | Timing or message differences | `view.resolveUse` short-circuits on `scope.has(id)` before the real lookup; or `closed` passes through for an out-of-scope id | S5 (spy sees fewer calls in A; `closed` body differs) | A ≠ B |
| B9 | A future route | add `{ method: 'POST', path: '/v1/mcp/future', decision: served }` to `BRIDGE_ROUTES`; separately, make `bridgeRouteRefusal` admit an unknown path | S1 reverse; S6 row 13 | a table row no contract names; 200 for `/v1/nope` |
| B10 | A request on an existing door acquiring a bridge context | `onThePort` passes a context (E1.2 code); or `mint` writes `bridge: undefined` as a key; or `grantFor()` on `OPEN_VIEW` returns an object | D7, S13, R3 | the spy sees a context on the port; `'bridge' in grant` |
| B11 | The sentence drifts | `outOfScopeAnswer` returns a literal instead of calling `refusalFor` / `aliasTarget` | S10 (compare with S3's OUT bodies byte for byte) | two spellings of one refusal |
| B12 | The seam reads through | `scopedRefSource.fieldReading` calls the real one unconditionally | S16 | the real `fieldReading` called with the out-of-scope id |
| B13 | The list is not walled | `sources().aliases` returns the real list | S3 row 3 | `out` in the body |
| B14 | The token is counted late | `spentToken` runs after the call grant's reserve, or not at all | S14 `maxCalls: 1` | the second call runs; `uses` stays 0 |

## S3.9 — Opus review checklist for the code

- `bridgeScope.ts`, `bridgeAllowList.ts`, `bridgeNote.ts`, `bridgeContext.ts`, `brokerBridgeToken.ts` import no `vscode` (R2); `Scope` is
  read inside each wrapped function and never held across an `await`; `admits` compares the account.
- `BRIDGE_ROUTES` is built from the vocabulary (`routes` actions, `mcpActions`, the reads, the five POSTs, `ALIAS_ROUTE_PREFIX`), not
  retyped; `bridgeRouteRefusal` matches method and pathname exactly and refuses everything else; `exportEnv` rows carry `EXPORT_REFUSED`.
- The real `resolveMcpUse` is called for every id on a bridge, with the third argument; `closed` becomes `undefined` out of scope; a
  `usable` answer is forced to `preConsented: false, rungs: ''`; nothing is stamped (`answeredHere`, `brokerConsentMemory.ts:37-39`).
- `grantForToken` on the view peeks with `get`, never `lookup`, and answers `UNKNOWN_TOKEN` for an out-of-scope token before the body
  is read; the main-door path is the unchanged `grantForToken`.
- `Grant.bridge` is `{ context, quiet }` and holds no secret; `mint` omits the key when undefined; `startNow` passes `grant.bridge?.context`.
- `answer`: aborted → `atLaunch` → `reservedNow` (token first) → `startNow`, with no `await` between them; a refusal at launch reserves,
  starts and burns nothing; complexity 4 or under.
- `referenceRefusal` runs in `perform` after `usable` and again inside `launchRefusal`; both paths produce `REFERENCE_REFUSED` with the
  stored reference text; `locateRef` swallows messages and throws; no `locate` message and no path reaches a response.
- `scopedRefSource`: `accounts()` one row, `entities()` the full account list, `fieldReading` `absent` unless admitted; the real
  `fieldReading` is not called for an out-of-scope id.
- `outOfScopeAnswer` calls `refusalFor(undefined)` and `aliasTarget(undefined, …)`; `UNKNOWN_TOKEN` and `GRANT_NOT_ALLOWED` are the
  constants, and the old literals are gone from `brokerRequests.ts:238,252` and `credsAgentServer.ts:625`.
- `credsAgentServer.ts`: the edits of §S3.6 and no others; `handle` ≤ 50 code lines; the file under 800; `doorFor`'s `via` reaches
  `refuse`, `perform` and `abandon`; `extension.ts` unchanged; `npm run ratchet` green.
- `brokerHooks.ts`: `bridgeWall` in the interface and in `HOOK_KINDS` as `'object'`; `openBridgeListener` rejects without it (R4).
- `contract/broker-v1.json` is regenerated, not edited; `aliasPrefix` and `bridge` are the only additions; `version` is 1;
  `CredsBroker.Tests` green with no change under `src_broker_client`.
- The RED record in the PR shows step A's failures for S3, S5, S7, S8, S10, S14, S15 and S20 before step B's passes; S4 is green and kept.
- The two existing doors: R3, D3, S13, S19 green with no expected value edited; `scripts/creds-cli-itest.cjs` untouched.

## S3.10 — Decisions closed, and what E2 and E3 inherit

1. The scope is per `(accountId, serverEntityId)`; an entry of another account is never in scope. `Scope.admits` is the one test.
2. Out of scope and absent are one answer on every route, produced by the route's own not-found function.
3. `can` on a bridged listing is `{ use, false, false, false }`; `dependsOn` names only kept rows. A stored `creds://` text in `command`
   is shown as today: it is the person's own text and the gate refuses the call anyway.
4. `BridgeGrant = { context, quiet }`; the spend token travels in `RequestWho`/`CallSubject`, reserved first in `reservedNow`.
5. A token on a bridge: authenticates only; denied locally → `GRANT_NOT_ALLOWED` with no dialog; otherwise a `'call'` grant, the
   modal budget, a modal every call, a Deny refusing that call only.
6. The jump chain is not a scope target (§S3.1 item 1).
7. The note schema is §4.3's six fields, `brokerPort` included: §4.5 uses it to match a token to its window. E2.1 may add fields
   additively; it may not remove or rename one without a change ledger entry in the parent.
8. **E2 inherits:** wiring `bridgeWall` in `extension.ts` within the ratchet (`storedTexts` = `referenceTextsOf(storage.getNode(a, e)?.details ?? {})`,
   `refSource` = the person's `host.refSource` of `commands/runCommands.ts`), the scope picker from the MCP listing, and a word in that
   picker when a chosen entry's host is the bridge's own server under another login (owner decision 7): the agent would then run as that
   login after a consent on the laptop. Not E1.3's to refuse; the person sees it in the modal.
9. **E3 inherits:** `run` joins `BRIDGE_ROUTES` at the end of E3 with S1 updated in the same commit; E3.3 resolves through
   `scopedRefSource` whenever `ctx.bridge` is set and maps every `ok: false` to `REFERENCE_REFUSED`; `decideRunSite` reads `ctx.bridge`.
10. **Growth:** scope records ≤ 64 × (256 ids × 37 bytes + 40) ≈ 610 KB worst case in `globalState`, typically under 4 KB each; the
    oldest `at` is pruned on `set`; Close-and-forget removes one (E2); a malformed record reads as empty. No other new store.

## S3.11 — Not verified by this spec

- The code-line counts of §S3.6 are a hand count under ESLint's `skipBlankLines`/`skipComments`; the coder confirms with `npm run lint`
  after E1.2's guard is shaped as three lines.
- The `.cjs` harnesses construct `resolveMcpUse` with two parameters; they ignore the third and lose the account narrowing, which
  `admits` still catches for a `usable` target. Not run here.
- `fetch` sending `Host: 127.0.0.1:<port>` is the standard; not run against the bridge door here (E1.2's D1 does).
- `System.Text.Json` skipping the two new contract keys is read from the record and the default, not run; S18's `CredsBroker.Tests` is the check.
