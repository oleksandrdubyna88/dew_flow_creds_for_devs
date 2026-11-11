# PLAN — E1.3 spec: the allow-list, the note schema, the scope wall (CORNERSTONE)

> Status: **built 2026-11-05 on branch `feat/remote-bridge-e1` (see §S3.12 *As built*); spec by Fable, 2026-11-04, written before its code.**
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
| 7 | `POST /v1/mcp/use/exec`, `…/query` | served, walled | `<r>` → for an entry the agent may view with its switch off, `closed` (403 `denied`, the switch sentence); for an entry the agent may not view, the OUT answer of this row, byte-equal (since the F7 fix, creds #347: see the note under this table); or usable → throttle (429 `too_many_requests`) → mint with `grantFor()` → step 3 → modal every call → step 4 | `<r>` → 404 `not_found` `No such entry, or this window does not serve it.` No slot taken, no dialog, no journal line |
| 8 | `POST /v1/alias/exec`, `…/query` | served, walled | `<r>` → throttle → mint → step 3 → modal → step 4 | `<r>` → 404 `not_found` `No entry is enabled for the CLI under "<name>".` No slot, no dialog, no line |
| 9 | `POST /v1/use/exec`, `…/query` (token) | served, walled | `grantForToken` (401 unknown or expired as today) → `<r>` → §S3.2.10: denied token 403 `GRANT_NOT_ALLOWED`, no dialog; throttle; mint; step 3; modal every call; step 4, the token reserved first | 401 `unauthorized` `Unknown or missing grant token.` — before the body is read, for a live and for an expired token alike |
| 10 | `…/exportEnv` on `/v1/use/`, `/v1/alias/`, `/v1/mcp/use/` | refused | 403 `denied`, `EXPORT_REFUSED` | the same |
| 11 | `…/run`, `…/terminal`, `…/up`, `…/down` on the three prefixes; `…/rotate` on `/v1/mcp/use/` (and on the other two, which never served it) | refused | 404 `not_supported`, `BRIDGE_NOT_SERVED` | the same |
| 12 | `POST /v1/config/read`, `POST /v1/mcp/create`, `POST /v1/mcp/delete`, `POST /v1/mcp/folder/create`, `…/edit`, `…/delete` | refused | 404 `not_supported`, `BRIDGE_NOT_SERVED`; the hook is never called | the same |
| 13 | any other method or path (`GET /v1/use/exec`, `POST /v1/health`, `/v1/nope`, `/v1/mcp/future`) | refused | 404 `not_supported`, `BRIDGE_NOT_SERVED` | the same |

**Row 7, IN, split in two (the parent's revision for epoch 9, from its change 8.2; read on `main` at `b95282f1`, 2026-11-12).** The row
said only `closed` for an entry in scope. Since the F7 security fix (creds #347, `todo/PLAN_agent_refusal_names_unlisted_entry.md` §7a,
its rule A), `verdictFor` (`mcpEntries.ts:434-452`) answers `undefined` for a node the agent may not view and `closed` only for a
visible node whose needed switch is off; `scopedLookup` and `closedIn` (`bridgeScope.ts:167-177`) keep that answer in scope. So an
in-scope entry the agent may not view answers 404 `not_found` `No such entry, or this window does not serve it.`, identical to OUT and
ABSENT (`agentNamesOnlyViewable.test.ts:382`), and an in-scope entry it may view with its switch off still answers 403 `denied` with the
switch sentence. The remedy a person can act on stays; the diagnostic for a hidden entry is gone on purpose. The parent's §4.2 and §8
carry the same split.

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

## S3.12 — As built (Sonnet, 2026-11-05)

Built in the spec's order: the pure pieces and the table first (step A, with the view still `OPEN_VIEW` for every
door and nothing at the action boundary), the walk written and watched RED, then the wall (step B). The wall is what
§S3.2 and §S3.6 say. These are the differences, none of which moves the boundary.

1. **`answer` and `perform` stay at complexity 4 by a different route than the spec's.** ESLint counts `?.` and `??`,
   which the spec's hand count did not, so `deps.atLaunch?.()` in `answer` and the `?.` already in `perform` made 5
   each. `answer` now calls `launchRefused(deps)` (a small function that asks the gate, answers a refusal and says
   whether it did), so `answer` is `aborted → launchRefused || !reservedNow → start`. The early reference check is in
   `usable`, at its end, where the capability check and the validation already are ("before anybody is asked
   anything"), and `validated.code ?? 'invalid_request'` moved out to `validationRefusal` in `brokerRequests.ts` to pay
   for it. Same order of checks, same answers.
2. **`credsAgentServer.ts` is 788 lines** (the spec's budget: 794 with E1.4's one line). §S3.6's table summed to +17
   with the token edit at +2; written over three lines it is +3, and `usable` took +2 where `perform` was to take +5.
   `handle` is 48 code lines (49 was the spec's count), `perform` and `answer` complexity 4, `extension.ts` 1003 (unchanged).
3. **`openBridgeListener` rejects, it does not throw.** The spec says "throw"; R4 says "rejects", and a synchronous throw
   from a function that returns a promise is not what `assert.rejects` (or any caller that `await`s in a `try`) sees as
   a rejection. `Promise.reject(new Error('A Remote Bridge cannot open without its scope wall.'))`, before
   `ensureStarted`, so nothing is bound or created.
4. **`BridgeRouteDecision.code` is `ErrorCode`, not `'not_supported'`.** The `exportEnv` rows carry `denied`
   (the task's "Export refusal is 403 `denied`"), so the literal type in §S3.2.4 could not hold them.
   The "five fixed POSTs" are six: `config/read`, `create`, `delete` and the three folder verbs.
5. **`BRIDGE_ROUTES` is built from vocabulary kept in `bridgeAllowList.ts`** (`USE_ACTIONS`, three prefixes, the folder
   verbs), because the only list of use actions in the repository is a literal in `scripts/emit-contract.mjs`, which
   no module can import. `ALIAS_ROUTE_PREFIX` is shared. What keeps the copy honest is S1 in both directions, and the
   served list in `bridgeAllowList.test.ts` is written out on purpose, not derived: it is the authorization decision.
6. **`bridgeScope.ts` imports `brokerRequests.ts`, which reaches `grantLimits.ts`, which imports `vscode`.** The file
   imports no `vscode` (R2 reads imports) but cannot be `require`d without the stub, so its tests load it through
   `loadEachWithVscode` (`test/bridgeModules.ts`). Splitting `expiredMessage` out of `grantLimits.ts` would make it
   loadable bare; not done, it is not this story's file.
7. **S14's "six at once" is not what the throttle does.** The modal budget is one dialog in flight plus five a minute.
   A second concurrent bridged call is `too_many_requests` ("Another request is already waiting"), and the sixth in a
   minute is `too_many_requests` ("at most 5 times a minute"). Both are tested, as two scenarios. The same fact makes
   the spec's S12 lane scenario ("two calls; the second waits") impossible through two bridged calls: the lane is
   entered by a call that holds no slot, so the test queues the bridged call behind a main-port token call, which
   takes none. A call refused for a reference still took a slot and a prompt of the five (the throttle sits before
   `perform`), which `S9` had to know: the positive control has its own world.
8. **Tests that E1.2 wrote and E1.3 had to change**, each because the table grew or a wall became mandatory, none
   because an answer moved for an existing door: `bridgeAllowList.test.ts` (the one-route table test became the full
   table's), `brokerBridgeRealDoor.test.ts` (D9 asks routes still refused; K5 and K10 post to `/v1/use/run`, because
   `/v1/use/exec` is served now and K10 would wait for a body forever; every `world` that opens a listener passes
   `emptyWall()`), `bridgeBoundary.test.ts` (R1 names two files that define the names, `brokerHooks.ts` as well as the
   broker; R2 lists the two new modules; R4 added) and `brokerHooks.test.ts` (fifteen hooks, not fourteen). R3 and
   its fixture are untouched.
9. **Added beyond §S3.7:** `brokerCallLaunch.test.ts` (the action boundary's order at its finest grain: B3, B14 and
   what `startNow` hands an action), `bridgeReferences.test.ts` (S9, S16 and the pure halves of S8, S10, S20),
   `mcpUseHooks` narrowing the account (the factory is what production calls, and `mcpUseLookup` alone would not show a
   dropped argument), `test/contractRoutes.ts` (the enumeration of S1/S2 with a companion that shows it finds
   routes), and a per-action split of the walk's "e1 is served" leg (five prompts a minute is five).
10. **`test/brokerWorld.ts`** gained `aliasMap` as specified, and `mcpResolve` is typed `ResolveUse`.
11. **Totals at the end:** `npm test` 6133 tests, 6129 pass, 0 fail, 4 skipped; `itest:cli` all checks passed; `npm run typecheck`, `lint` and `ratchet` clean;
    `node plan-lifecycle.mjs` clean; `pin-check.mjs` reports the shared rules stale against `release`, as it did before
    this branch and as the task says to leave it. `CredsBroker.Tests` is not in the solution (its project is
    `src_broker_client/tests/BrokerClient.Tests.csproj`), so the E1 document's `dotnet build` of the `.slnx` does not build
    it: it was built on its own and ran 159 of 159 against the grown contract, with `src_broker_client` untouched. 73 mutations were run (§S3.8's and the other guards of the wall), all caught.

### The RED record (step A, before the wall; the failure each scenario gave)

- **Pure scenarios** (written first): the test files did not compile against E1.2's tree (`Module '"../bridgeAllowList"'
  has no exported member 'BRIDGE_ROUTES'`, `Cannot find module '../bridgeScope'`, `Property 'locateRef' does not exist`).
- **S18**, old contract file with the new code: `actual: undefined, expected: '/v1/alias/'`.
- **S1**, E1.2's one-route table: `/v1/aliases is in contract/broker-v1.json and not named in bridgeAllowList.ts. Name it:
  served, or refused and why.` **S6** `exportEnv`: `actual { code: 'not_supported', message: 'A Remote Bridge does not
  serve this request...' }`, expected `{ code: 'denied', message: "An agent cannot export a secret here..." }`.
- **Walk at step A** (table filled, every door `OPEN_VIEW`): S3 `row 3 GET /v1/aliases must not say "leaky":
  {"aliases":[{"name":"one"},{"name":"leaky"},{"name":"second"},{"name":"foreign"}]}`; S4 through the bridge found `row 3 ...
  names leaky`, `row 4 ... names e-out, leak-target`, `row 5 ... serves it` and `row 7/8/9 ... reached e-out (200)` for both
  actions; S4's control through the main port was green by design (rows 3, 4, 5, 7, 8, 9); S5 `usable: answer 0` listed
  `xalias` where the world without it did not, and the token leg answered `200 {"stdout":"ok\n"}` where `401` was
  expected; S7 `through A: /v1/mcp/use/exec?serverEntityId=server-B actual: true`; S15 `actual: ['leak-target', 'second']
  expected: []`; S20 the modal read `An agent wants to run a command on "foreign"`; S13 `0 !== 1` (no grant carried the
  bridge).
- **Transitive at step A**: S8, S9, S11 ran the call (`200`); S10 ran the action after Allow; S21 `actual: 200, expected: 401`;
  S12 lane `timed out waiting for the second call to have been asked` (the token shared ONE dialog); S14 `a dialog anyway
  actual: 1 expected: 2`, `pending` was `allowed`, `does not tombstone the token` was `denied`.
- **`brokerCallLaunch.test.ts`** at step A: `actual: ['reserve call-secret', 'start', 'respond 200']`, expected `['launch gate',
  'refuse not_found gone']`; the token legs expected `['reserve token-secret', 'reserve call-secret', 'start']`; `startNow`
  handed the action `bridge: undefined`.
- **S6 stayed green at step A** (E1.2's table already refused those rows): kept as the table's pin.

**A gap in the spec, recorded, not fixed.** The listing and the snippet are walled by entry id alone: `McpEntry` carries
no account, and `visibleConfigDetails` answers the first account that holds the id. If two accounts held an entry with
one id (a uuid collision, or a copied vault), a bridge scoped to that id in account A would also list, and serve the
snippet of, the entry in account B, while every use path (id, alias, token, launch) refuses it correctly by account.
The spec's own S20 builds that collision for the use paths only. Closing it needs the account on the listing's rows or
an account-aware `visibleConfig`, which is a contract or hook change; the test world builds the collision only for S20
(`collide: true`) so no other scenario asserts around it.

Mutations were run with a script that replaces one exact snippet (it must occur once), re-emits the one file, runs the
sixteen test files that touch the wall, restores the file and compares its hash. B1-B14 are §S3.8's, with B5, B6, B7,
B8, B10, B11 and B14 split where the spec's single row names two mutations. W1-W46 are the other guards of the wall,
the table and the scope store. One guard had no test: a bridge door's grant minted with `'token'` scope in place of
`'call'` (W46) passed everything; a test now pins it. The table follows.

### Break-its run (all caught; each mutation applied, tests run, file restored byte for byte and its hash compared)

| # | Mutation | Failing tests (first two) | Failures |
|---|---|---|---|
| B1 | view.resolveUse passes a usable target without admits | resolveUse: the real lookup runs for EVERY id with the bridge...; resolveUse: the scope is read when the function is called, no... | 5 |
| B2 | view.grantForToken without the peek | grantForToken: an out-of-scope token is unknown, live or expi...; S3: through a bridge scoped to e1, e-out answers nothing it s... | 5 |
| B3 | answer skips atLaunch | S10: scope narrowed while the modal is open — the call is ref...; S11: a line edited while the modal is open — the new referenc... | 8 |
| B4 | Scope.admits tests entries.has(entityId) only | launchRefusal: the grant's account and entry against a fresh ...; S16: fieldReading answers `absent` for anything the scope doe... | 8 |
| B5a | referenceRefusal never finds an unserved reference | S9: every way a reference can fail reads alike — one sentence...; S9: the first reference that cannot be served is the one name... | 9 |
| B5b | serves admits when locateRef is not ok | S9: every way a reference can fail reads alike — one sentence...; S9: a storedTexts or a vault that THROWS is the same refusal,... | 3 |
| B5c | early reference check in usable dropped | S8: a stored command that names an entry out of scope is refu...; S9: every way a reference can fail reads alike through the re... | 2 |
| B5d | launchRefusal does not check references | launchRefusal: the grant's account and entry against a fresh ...; S11: a line edited while the modal is open — the new referenc... | 2 |
| B6a | referenceTextsOf drops commandArgs | S9: referenceTextsOf lists every place a reference may be wri...; S9: a reference hiding in a script body, a variable, a comman... | 2 |
| B6b | referenceTextsOf drops scriptVars | S9: referenceTextsOf lists every place a reference may be wri...; S9: a reference hiding in a script body, a variable, a comman... | 2 |
| B6c | referenceTextsOf drops disabled rows | S9: referenceTextsOf lists every place a reference may be wri...; S9: a reference hiding in a script body, a variable, a comman... | 2 |
| B6d | referenceTextsOf drops disabled script vars | S9: referenceTextsOf lists every place a reference may be wri... | 1 |
| B7a | mcpEntries wrapper keeps can | sources.mcpEntries: kept rows are those in scope, can is narr...; S3: through the same bridge e1 is served — rows 3, 4, 5 show it | 3 |
| B7b | mcpEntries wrapper keeps dependsOn | sources.mcpEntries: kept rows are those in scope, can is narr...; S3: through a bridge scoped to e1, e-out answers nothing it s... | 5 |
| B8a | resolveUse short-circuits on scope before the real lookup | resolveUse: the real lookup runs for EVERY id with the bridge...; S5: an entry that exists and is out of scope answers as one t... | 2 |
| B8b | closed passes through for an out-of-scope id | resolveUse: the real lookup runs for EVERY id with the bridge...; S5: an entry that exists and is out of scope answers as one t... | 2 |
| B9a | a future route added served | S1: every route the contract names is named in the table, and...; S2: a route the contract gains later is reported unnamed, how... | 4 |
| B9b | bridgeRouteRefusal admits an unknown path | row 11 and 12: run, terminal, up, down, rotate, delete, creat...; row 13: any other method or path is refused, whether or not s... | 5 |
| B10a | onThePort passes a bridge context | R3: the two existing doors answer as they did before the thir...; S4: the same walk through the main port finds e-out on rows 3... | 67 |
| B10b | mint writes bridge: undefined as a key | S13: a grant minted by share, by the alias route or by the MC... | 1 |
| B10c | OPEN_VIEW.grantFor returns an object | S13: OPEN_VIEW is the identity — the existing doors run the c...; S4: the same walk through the main port finds e-out on rows 3... | 16 |
| B11 | outOfScopeAnswer returns a literal for mcp | B11: outOfScopeAnswer asks the route's own functions, so the ... | 1 |
| B11b | outOfScopeAnswer returns a literal for alias | B11: outOfScopeAnswer asks the route's own functions, so the ... | 1 |
| B12 | scopedRefSource.fieldReading reads through | S16: scopedRefSource with the real resolveSecretRefs — in sco...; S16: fieldReading answers `absent` for anything the scope doe... | 2 |
| B13 | sources().aliases returns the real list | sources.aliases: a name is listed only when it resolves to a ...; S3: through a bridge scoped to e1, e-out answers nothing it s... | 6 |
| B14a | spentToken not at all | S14: with a limit of one call, the first bridged call runs an...; B14: a spent token is reserved FIRST, in the same step, then ... | 3 |
| B14b | spentToken after the call grant | B14: a spent token is reserved FIRST, in the same step, then ...; B14: a token that has run out refuses the call with the token... | 2 |
| W1 | sources.visibleConfig unwalled | sources.visibleConfig: a config only in scope, and the real s...; S3: row 5 for an entry out of scope is the usual not-found bo... | 3 |
| W2 | sources.folders returns the real list | sources.folders: no folders at all; S3: through the same bridge e1 is served — rows 3, 4, 5 show it | 2 |
| W3 | resolveAlias not walled | resolveAlias: a target is served only when its account and en...; S3: through a bridge scoped to e1, e-out answers nothing it s... | 5 |
| W4 | grantFor returns nothing on a bridge | grantFor: the context and the scope's switch as it is NOW; S13: a grant minted by share, by the alias route or by the MC... | 9 |
| W5 | startNow does not pass the bridge | startNow hands the action the CONTEXT of the bridge and nothi... | 1 |
| W6 | openBridgeListener opens without a wall | R4: a broker with no scope wall cannot open a bridge, and bin... | 1 |
| W7 | launchRefusal skips the entry/account scope check | launchRefusal: the grant's account and entry against a fresh ...; launchRefusal: the scope is the grant's own context's, not th... | 5 |
| W8 | scopedRefSource.accounts unfiltered | S16: another account's email resolves to nothing, and its ent... | 1 |
| W9 | scopedRefSource.entities lists other accounts | S16: another account's email resolves to nothing, and its ent... | 1 |
| W10 | scopedRefSource.entities narrowed to the scope (the overturned design) | S16: an ambiguous reference stays ambiguous for the agent, ex...; S16: another account's email resolves to nothing, and its ent... | 2 |
| W11 | BridgeScopes.read is cached | S9: a reference to an entry in scope lets the call proceed; s...; S9: the first reference that cannot be served is the one name... | 47 |
| W12 | accountOnly does not narrow | accountOnly: the same source with one account, so a lookup ne...; mcpUseHooks: the resolveMcpUse it builds takes the bridge's s... | 3 |
| W13 | mcpUseLookup ignores the server | mcpUseHooks: the resolveMcpUse it builds takes the bridge's s...; S20: an entry of another account with the same id is not in s... | 2 |
| W14 | mcpUseHooks does not pass the server | mcpUseHooks: the resolveMcpUse it builds takes the bridge's s... | 1 |
| W15 | bridged token: denied token not refused | S14: a token the person denied is refused through a bridge wi... | 1 |
| W16 | bridged token: no throttle slot | S14: a token path is throttled like an alias call — one dialo...; S14: the sixth token call inside a minute is refused | 2 |
| W17 | bridged token: rides its own grant | S8: a stored command that names an entry out of scope is refu...; S10: scope narrowed while the modal is open — the call is ref... | 10 |
| W18 | doorFor perform forgets its via | S10: scope narrowed while the modal is open — the call is ref...; S12: a one-use entry queued in the lane behind a call of anot... | 3 |
| W19 | prepared drops the spend | S14: with a limit of one call, the first bridged call runs an... | 1 |
| W20 | GET routes not walled | S3: through a bridge scoped to e1, e-out answers nothing it s...; S3: row 5 for an entry out of scope is the usual not-found bo... | 7 |
| W21 | alias route not walled | S3: through a bridge scoped to e1, e-out answers nothing it s...; S5: an entry that exists and is out of scope answers as one t... | 4 |
| W22 | mcp route not walled | S3: through a bridge scoped to e1, e-out answers nothing it s...; S5: an entry that exists and is out of scope answers as one t... | 4 |
| W23 | token on a bridge rides its own grant | S8: a stored command that names an entry out of scope is refu...; S10: scope narrowed while the modal is open — the call is ref... | 10 |
| W24 | exportEnv refused with the generic sentence | S6: every route of the table answers as its row says, and the...; S6: exportEnv is refused with the export sentence on all thre... | 2 |
| W25 | run served | the table serves exactly the routes the authorization decisio...; row 11 and 12: run, terminal, up, down, rotate, delete, creat... | 8 |
| W26 | method not compared | row 13: any other method or path is refused, whether or not s...; S6: every route a bridge does not serve is refused with its s... | 2 |
| W27 | reference sentence changed | the reference sentence is the one of the spec, built by one f...; S9: every way a reference can fail reads alike — one sentence... | 7 |
| W28 | CLOSED_VIEW serves lookups | CLOSED_VIEW: a bridge with no wall answers no lookup | 1 |
| W29 | usable answer keeps the vault's quiet | resolveUse: a usable answer is never quiet on a bridge, whate... | 1 |
| W30 | contract aliasPrefix drifts | S18: the alias prefix travels, and it is the one parseAliasRo... | 1 |
| W31 | note field list loses key | the note schema is the six fields of the parent plan, and the...; a note built to the interface has exactly the declared fields... | 3 |
| W32 | bridged view mints with the wrong account (grantFor context swapped) | grantFor: the context and the scope's switch as it is NOW; S3: through the same bridge e1 reaches the action after Allow... | 15 |
| W33 | alias list resolver missing returns real aliases | sources.aliases: a name is listed only when it resolves to a ...; D9: the real router — health is served, a route the table doe... | 2 |
| W34 | locateRef lets a throw escape | locateRef: parsed and located, or `ok: false` with no reason;... | 1 |
| W35 | unservedReference does not swallow a throw | S9: a storedTexts or a vault that THROWS is the same refusal,...; S9: a storedTexts that throws is the same refusal, not a 500 | 2 |
| W36 | handle asks the open view for the token | S3: through a bridge scoped to e1, e-out answers nothing it s...; S5: an entry that exists and is out of scope answers as one t... | 4 |
| W37 | scope store never prunes | S17: at most 64 records; the oldest `at` is pruned, never the... | 1 |
| W38 | scope store accepts any number of entries | S17: a scope of 256 entries is written; 257 are refused and n... | 1 |
| W39 | a record with a non-boolean quiet is read | S17: a malformed record, in any of its parts, is an empty sco... | 1 |
| W40 | scope writes are not queued | S17: writes queue — two sets in flight at once both land, eve... | 1 |
| W41 | scopeKey is not length-prefixed | S17: scopeKey is injective across the colon, as stampKey is | 1 |
| W42 | validation refusal loses its default code | a body the action rejects is refused BEFORE the human is asked | 1 |
| W43 | BRIDGE_NOTE_FIELDS not frozen | the field table cannot be changed from outside the module | 1 |
| W44 | BRIDGE_ROUTES not frozen | the table cannot be changed from outside | 1 |
| W45 | forget removes nothing | S17: forget removes one record and leaves the others | 1 |
| W46 | a bridged call grant takes the token scope instead of call | a grant a bridge door mints is a call grant, reclaimed before... | 1 |

## S3.13 — Amendment, epoch 3 (Fable, 2026-11-05)

E1.3 is built as `a91e981`; the plan stopped for a whole re-review and is epoch 3 (`764c9e9`, its *Re-review for epoch 3*
table). This section is the complete brief for one **fix-forward commit** on `credsAgentServer.ts` at 788 of 800 and
`extension.ts` at its ratchet (1003, may not grow). Every `file:line` below was opened on `764c9e9` (the source is `a91e981`'s).
Nothing above is deleted; where this section differs from §S3.0–§S3.12, this section wins. Sentences for E1.4 follow in the
S4 spec's §S4.10; the E1 document carries a short dated note pointing here.

### A.1 Corrections to the record

- **F10 and §S3.1 item 1 claimed the jump's name is not disclosed. False.** `sshOptions.ts:153` answers `The jump host "<hop.name>" cannot be used: its address is not a valid host.`, and `sshUseActions.ts:203` sends it to the agent as a `no_credential` body. The linked key was not covered at all: `sshExecAuth.ts:126` names the key entity (`"<ownerName>" is protected with its own PIN…`), `:157` carries a path in `Could not write the stored key to disk: <error>`, and `sshUseActions.ts:133` sends them; `:224` sends `Could not run ssh: <error>`, which can carry argv. The decision stands (A.2 item 2): the link and the chain are part of using the entry. What changes is the body of a refusal on a bridge (A.3.6).
- **F12 and §S3.2.5 put the scope in `globalState`.** Overturned by the plan (§4.2, epoch 3): each window holds its own copy and the last write wins, so a narrow in one window can fail to reach the owner and a stale write can restore it. The store is a file per record with a revision, under the cross-window lock (A.3.1).
- **§S3.3 step 4 and §S3.9 placed the gate at `answer` only.** `releaseWaiting` (`credsAgentServer.ts:586`) runs between consent and the gate, so a narrow during a modal still promoted a waiting rotation onto an entry the scope no longer admits. The gate is asked first before `releaseWaiting`, and kept at `answer` (A.3.4).
- **§S3.9 said "the scope is read inside each wrapped function, never held across an `await`".** `bridgeScope.ts:245` reads it before the `await` of the listing. Fixed and tested (A.3.3).
- **S14** gains a token denied while its call waits; **S17** is rewritten for the file store; **S20** becomes the use half of the collision whose listing half is S22/S23 (the gap §S3.12 recorded).
- **§S3.12 item 7**: a call refused before any dialog spent a prompt. With A.3.5 it spends none.

### A.2 The eleven decisions, judged

1. **File store — upheld.** `<globalStorageUri>/bridges/scopes/<sha256 hex of scopeKey>.json`; revisioned; written under `LeasedQueue` over a `WindowLock` at `<globalStorageUri>/bridges/scopes.lock`; re-read inside the lock; a stale revision refused with one sentence; temp-and-rename; `read` synchronous and fresh; absent or corrupt is an empty scope at revision 0. Added, because a file can be moved by hand: the record carries `accountId` and `serverEntityId`, and `read` answers empty when they are not the ones asked for. The cap of 64 stays (pruned inside the lock, oldest `at`). No migration; `SCOPES_KEY` goes.
2. **Linked key and jump chain part of using an entry; `creds://` strictly scoped — upheld.** `sshkey` can never be opened to MCP (`entityKind.ts:155`), the value stays on the laptop, edit verbs are off the list; a reference puts a value into a command, which is the different thing.
3. **Generic refusal bodies with `ctx.bridge` set — upheld**, at the three sites in `sshUseActions.ts` where every such sentence passes (`:133`, `:203`, `:224`); `sshExecAuth.ts` and `sshOptions.ts` are not edited, since nothing there knows the door. The real reason goes to the journal. `ssh`'s own stderr stays as returned (the plan's words) and may carry a jump host's address.
4. **`agentForward` refused on a bridge — upheld, twice:** before the modal through the wall (`entryRefusal`), and in the action against the live entity.
5. **Per-account suppliers — my judgement: on `BridgeWallSource`, not on `BrokerHooks`.** `extension.ts` may not gain a line, E2.2 wires the wall anyway, and `McpEntry` (a contract shape) stays as it is. `closedIn` stays: the lookup is already narrowed by `accountOnly`.
6. **Scope read after the await — fixed**, with a mid-listing narrow.
7. **Gate before `releaseWaiting`, kept in `answer` — upheld.** Built once in `prepared`, asked there and handed to `performCall`.
8. **A token denied mid-flight — upheld.** `bridgedTokenCall` already reads the token fresh at entry (`view.grantForToken` → `lookup`); the launch gate now reads `grants.get(spend)?.status` too and answers `denied`, `GRANT_NOT_ALLOWED`, before anything is reserved.
9. **Per-bridge prompt windows, one dialog in flight globally, a pre-dialog refusal spends nothing — upheld.** The split is A.3.5. One consequence is stated rather than hidden: the local alias and MCP doors also stop spending a prompt on a call refused before its dialog, because the window now counts dialogs raised; five dialogs a minute and one in flight hold exactly as before.
10. **`REFERENCE_REFUSED` echoes nothing — upheld.** The stored text of an argument or a variable is text no listing shows.
11. **Pure modules reach `vscode` through `grantLimits.ts` — upheld.** `expiredMessage` moves to a pure `grantWords.ts`; R2 becomes transitive.

### A.3 What changes, with types and signatures

#### A.3.1 The scope store (`bridgeScope.ts:27-137` replaced)

```ts
export const SCOPES_DIR = 'bridges/scopes';              // under globalStorageUri
export const SCOPES_LOCK_DIR = 'bridges/scopes.lock';    // the WindowLock's directory, beside it
export const MAX_SCOPES = 64;
export const MAX_SCOPE_ENTRIES = 256;
export const SCOPE_STALE = 'The scope of this Remote Bridge changed in another window. Look at it again, then save.';

/** The file: what we wrote, and whose it is. */
export interface ScopeFile {
  readonly v: 1;
  readonly accountId: string;
  readonly serverEntityId: string;
  readonly entries: readonly string[];
  readonly quiet: boolean;
  readonly revision: number;   // 1 on the first write
  readonly at: number;
}
export function scopeFileName(accountId: string, serverEntityId: string): string;  // `${sha256hex(scopeKey(accountId, serverEntityId))}.json`

/** The filesystem as a port, like `LockFs` (windowLock.ts:45-56). */
export interface ScopeFs {
  readSync(file: string): string | undefined;          // undefined on ANY error
  list(dir: string): Promise<readonly string[]>;       // names ending in `.json`; [] when the directory is absent
  write(file: string, text: string): Promise<void>;    // mkdir -p the parent; write `<file>.<uuid>.tmp`; rename over `file`
  remove(file: string): Promise<void>;                 // ENOENT is success
}
export function nodeScopeFs(): ScopeFs;                 // node:fs; rename retried 3 × 50 ms on EPERM/EBUSY (Windows, a reader holding the file)

export interface Scope {
  readonly entries: ReadonlySet<string>;
  readonly quiet: boolean;
  readonly revision: number;                            // 0 when absent or corrupt; what `set` must be handed back
  admits(accountId: string, entityId: string): boolean;
}

export class BridgeScopes {
  constructor(dir: string, io: ScopeFs, writes: { run<T>(work: () => Promise<T>): Promise<T> }, now: () => number = Date.now);
  /** Synchronous, fresh: `io.readSync` every call. Empty (revision 0) when absent, unparseable, not a `ScopeFile`, or naming another account or server. */
  read(accountId: string, serverEntityId: string): Scope;
  /** Inside `writes.run`: re-read; `revision !== expectedRevision` → reject `Error(SCOPE_STALE)`; write revision+1; prune to MAX_SCOPES by `at`, never this file. Answers the new revision. */
  set(accountId: string, serverEntityId: string, entries: readonly string[], quiet: boolean, expectedRevision: number): Promise<number>;
  /** Inside `writes.run`: remove the file. Close-and-forget (E2 wires it). */
  forget(accountId: string, serverEntityId: string): Promise<void>;
}
```

`writes` is `new LeasedQueue(new WindowLock(path.join(globalStorageUri, SCOPES_LOCK_DIR), nodeLockFs()))` in production (E2.2 builds
it; `LeasedQueue.run` is the shape, `leasedQueue.ts:70`); a `SerialQueue` in a unit test (`LeasedQueue` without a lock *is* one). The
pruning reads each listed file once inside the lock: ≤ 65 small reads per write. Growth (§S3.10 item 10) is unchanged in size; the
retirement is `forget` on Close and the prune. `BridgeWallSource.scopes` keeps its type.

#### A.3.2 Per-account suppliers and the entry refusal (`bridgeScope.ts:140-145`, `:243-248`; `mcpEntries.ts:363`)

```ts
export interface BridgeWallSource {
  readonly scopes: BridgeScopes;
  storedTexts(accountId: string, entityId: string): readonly string[];
  readonly refSource: Pick<RefSource, 'accounts' | 'entities'>;
  /** The listing of ONE account: `visibleMcpEntries(accountOnlyVault(storage, accountId))`. */
  listEntriesOf(accountId: string): Promise<readonly McpEntry[]>;
  /** The snippet's supplier for ONE account: `visibleConfigDetails(accountOnlyVault(storage, accountId), entityId)`. */
  visibleConfigOf(accountId: string, entityId: string): EntityMetadata | undefined;
  /** Why this entry cannot be used through a bridge at all, asked before anybody is: E2 wires `details.agentForward === true ? { code: 'denied', message: AGENT_FORWARD_REFUSED(name) } : undefined`. */
  entryRefusal(accountId: string, entityId: string): Refusal | undefined;
}
// mcpEntries.ts — beside accountOnly (:363), which narrows a Pick and stays for the lookups:
/** The whole `McpVaultSource` with `getAccounts` answering one row; every other method delegates by name (a spread of a StorageManager would lose its prototype). */
export function accountOnlyVault(source: McpVaultSource, accountId: string): McpVaultSource;
```

The bridged view's `sources()` ignores `real.mcpEntries` and `real.visibleConfig` and answers from the wall:
`mcpEntries: async () => { const rows = await wall.listEntriesOf(bridge.accountId); return entriesIn(scope(), rows); }` — the scope read
**after** the await (A.2 item 6) — and `visibleConfig: (id) => (scope().entries.has(id) ? wall.visibleConfigOf(bridge.accountId, id) : undefined)`.
`aliases` and `folders` as built. `referenceRefusal(grant, wall)` (`:324-330`) first asks `wall.entryRefusal(grant.accountId, grant.entityId)`
and answers it when set, then the references as built; its name and both call sites (`credsAgentServer.ts:569`, the gate) are unchanged.

#### A.3.3 Sentences (`bridgeScope.ts:297-299` replaced; two added)

```ts
export function REFERENCE_REFUSED(entityName: string): string;
//  `"${entityName}" uses a creds:// reference this Remote Bridge does not serve. Add every entry it names to this bridge's scope, or take the reference out of the stored command or script.`
export function AGENT_FORWARD_REFUSED(entityName: string): string;
//  `"${entityName}" is set to forward this computer's SSH agent, and the shared agent answers for every loaded key. A Remote Bridge does not use it: turn agent forwarding off on that entry, or use it from this computer.`
export function BRIDGE_USE_REFUSED(entityName: string): string;
//  `"${entityName}" could not be used through this Remote Bridge. The reason is in the agent journal on the computer that holds the vault.`
```

`UNREADABLE` (`:302`) and the `ref` parameter of `REFERENCE_REFUSED` go; `unservedReference` answers a boolean. Codes: `denied` for the first
two; the third keeps the code of the refusal it replaces (A.3.6).

#### A.3.4 The gate before `releaseWaiting`, and the denied token (`credsAgentServer.ts:581-599`, `:670-689`; `bridgeScope.ts:336-350`)

```ts
// bridgeScope.ts
export function launchRefusal(grant: Grant, wall: BridgeWallSource | undefined, via: AuditDoor, body: Record<string, unknown>, tokenDenied = false): Refusal | undefined;
//  off a bridge → undefined (as built); on a bridge, in order: tokenDenied → { code: 'denied', message: GRANT_NOT_ALLOWED }; the scope (as built) → outOfScopeAnswer; referenceRefusal (as built, now with entryRefusal first).
```

`prepared` builds the closure once and asks it before anything an Allow triggers:

```ts
const atLaunch = (): Refusal | undefined => launchRefusal(grant, this.hooks.bridgeWall, via, call.body, call.spend !== undefined && this.grants.get(call.spend)?.status === 'denied');
if (this.stopped(res, call, 'after consent', atLaunch)) { return; }          // replaces `if (this.gone(call, 'after consent')) { return; }`
await this.releaseWaiting(grant);
…
await this.runAndDeliver(res, { ...call, table }, atLaunch);                 // runAndDeliver(res, call, atLaunch) passes `atLaunch,` in CallDeps in place of :685
```

`private stopped(res, call, stage, atLaunch): boolean` — `gone(call, stage)` → `true`; `atLaunch()` refused → `respondError(res, code, message, grant, action, summary, via, caller)` and `true`; else `false`. `prepared` keeps complexity 4; `brokerCall.ts` is unchanged (`answer` still asks `deps.atLaunch`, `:139-150`).

#### A.3.5 Prompts per bridge (`aliasThrottle.ts` whole; `brokerConsent.ts:29-35,38-44,81-95`; `credsAgentServer.ts:118,228-244,284,344`)

`AliasThrottle` (`:67-150`) couples the in-flight rule and the window. It is split into two classes and one coordinator; the class goes
and `aliasThrottle.test.ts` is rewritten over the three (22 tests' behaviours kept: five a minute, one in flight, the clock-jump rule,
the two sentences, `release` twice, a refusal releases nothing):

```ts
/** The count: stamps inside the window that ends now (`inWindow` as built, both bounds). */
export class SlidingWindow {
  constructor(max: number, windowMs: number);
  full(nowMs: number): boolean;
  stamp(nowMs: number): void;
  admit(nowMs: number): 'allow' | 'too-many';   // full → too-many, else stamp and allow
  idle(nowMs: number): boolean;                 // no stamp inside the window: the coordinator prunes such a door
}
/** One dialog at a time, for a HUMAN — global, never per door. */
export class OneInFlight { hold(): boolean; release(): void; }

export const LOCAL_DOOR = 'local';
export class TokenlessCeilings {
  /** prompts: `inFlight` held → busy; the door's modal window full → too-many (nothing held); else hold and allow — NO stamp here. Silent: the door's silent window `admit` (stamps now), no in-flight. */
  admit(prompts: boolean, nowMs: number, door: string = LOCAL_DOOR): Admission;
  /** A dialog was raised for this grant: stamp the modal window of its door. Nothing for a local token call (`via === 'token'` and no bridge), which is not throttled. */
  prompted(grant: { bridge?: { context: { bridgeId: string } } }, via: AuditDoor, nowMs: number): void;
  /** E2 on Close; also prunes doors whose windows are idle. */
  forget(door: string): void;
}
```

Sentences (`describe`): `busy` as built; too-many prompts: local as built (`…a caller without a token may prompt at most 5 times a minute.`),
on a bridge `Too many requests: this Remote Bridge may prompt at most 5 times a minute.`; silent: local as built, on a bridge
`Too many requests: this Remote Bridge may make at most 60 silent calls a minute — ones a consent policy lets through without a prompt.`
On a bridge every door (token included) is bridged, so the local sentence cannot appear on a token route.

The stamp moves to where the dialog is raised: `ConsentGateDeps.prompted?(question: ConsentQuestion): void`, called in `ask`
(`brokerConsent.ts:81`) immediately before `showWarningMessage`; `ConsentQuestion.via: AuditDoor` is added and both callers pass it
(`credsAgentServer.ts:297` `via`, `:543` `who.via`). `:118` gains `prompted: (q) => this.ceilings.prompted(q.grant, q.via, Date.now())`
on the same line. `admitAliasCall(res, prompts, bridge?: BridgeContext)` calls `this.ceilings.admit(prompts, Date.now(), bridge?.bridgeId)`;
`:284` and `:344` pass `view.bridge`. (E1.4's `auditGrantMark(bridge?.serverName)` reads the same parameter, S4 §S4.10.)

#### A.3.6 Generic bodies and `agentForward` in the real action (`sshUseActions.ts:115-137,181-233`)

```ts
/** A refusal as the agent reads it: the sentence as today off a bridge; on a bridge the generic sentence, the real one in the journal. The code is kept. */
function bridgedRefusal(deps: SshUseDeps, ctx: UseActionContext): (code: ErrorCode, message: string) => UseActionResult;
```

In `sshExecAction.run`: `const refuse = bridgedRefusal(deps, ctx);` after `entityFor`; `prepareAuth(deps, ctx, entity, refuse)` builds `:133`
with it; `:203` → `refuse('no_credential', chain.reason)`; `:224` → `refuse('internal', …)`. After the `entity.host` check and before
`acquireExecSlot`: `if (ctx.bridge !== undefined && entity.agentForward === true) { return fail('denied', AGENT_FORWARD_REFUSED(ctx.entityName)); }`.
The refusals that name only the in-scope entry (`:189`, `:196`) are unchanged. `sshTerminalAction` is not served and is not touched.

#### A.3.7 `grantWords.ts` (new, pure) and R2 transitive

`expiredMessage` (`grantLimits.ts:40-44`) moves to `grantWords.ts` unchanged; `grantLimits.ts` keeps `grantLimits()` and `describeLimits`;
`brokerRequests.ts:4` imports from `./grantWords`. R2 (`test/bridgeBoundary.test.ts:183`) walks `import … from './x'` (not `import type`)
recursively from `bridgeContext`, `bridgeNote`, `bridgeAllowList`, `bridgeScope`, `brokerBridgeToken`, `brokerBridgeListeners`,
`grantWords` and fails naming the chain (`bridgeScope → brokerRequests → grantLimits`) when any module in the closure imports or
requires `vscode`. `test/bridgeModules.ts` may then `require` the modules bare; keeping the stub loader is allowed.

#### A.3.8 `execSlots.ts` (new, pure) — paying for A.3.4

`acquireExecSlot` (`credsAgentServer.ts:150-163`, 14 lines) becomes `acquireExecSlot = (): (() => void) | undefined => this.slots.acquire();`
over `private readonly slots = new ExecSlots(MAX_CONCURRENT_EXECS);`, with `class ExecSlots { acquire(): (() => void) | undefined }` and three
tests (the cap, a release, a second release a no-op).

### A.4 `credsAgentServer.ts`, counted (788 today)

| Where | Edit | Lines |
|---|---|---|
| `:150-163` | `acquireExecSlot` → one line over `ExecSlots`, plus the field | −12 |
| `:118` | `prompted: (q) => this.ceilings.prompted(q.grant, q.via, Date.now())` in the gate's deps | 0 |
| `:228`, `:229`, `:284`, `:344` | `admitAliasCall(res, prompts, bridge?: BridgeContext)`; `admit(prompts, Date.now(), bridge?.bridgeId)`; callers pass `view.bridge` | 0 |
| `:297`, `:543` | `via` on the consent question | 0 |
| `prepared` `:581-599` | `const atLaunch = …` (+1); `stopped` in place of the first `gone` (0); `runAndDeliver(res, …, atLaunch)` (0) | +1 |
| new `stopped(res, call, stage, atLaunch)` | ~10 lines with its comment | +10 |
| `:670-689` | `runAndDeliver(res, call, atLaunch)`; `:685` becomes `atLaunch,` | 0 |
| | **Total** | **−1 → 787**; E1.4's +1 → 788 |

`handle` is untouched (48 code lines); `prepared` and `perform` stay at complexity 4; `extension.ts` unchanged.

### A.5 Scenarios (each RED today, and why)

Files: `test/bridgeScope.test.ts` (S17 rewritten), `test/bridgeStore.test.ts` (new, S25), `test/bridgeScopeWalk.test.ts` (S22–S24),
`test/bridgeTransitive.test.ts` (S10, S14, S27–S29), `test/bridgePrompts.test.ts` (new, S26), `test/bridgeLinks.test.ts` (new, L1–L5),
`test/bridgeBoundary.test.ts` (R2), `test/aliasThrottle.test.ts`, `test/execSlots.test.ts`, `test/grantWords.test.ts`.

**How a real-action leg joins the wall world.** `test/brokerWorld.ts` gains `realActions?: Record<string, unknown>`, read before `realAction`
in `action()` (`:229`), so one route can be real while the others stay scripted. `WallOptions` gains `exec?: UseAction` and
`releaseWaiting?: (accountId, entityId) => Promise<unknown>`; `wallWorld` passes `realActions: { exec }` and `hooks: { …, releaseWaiting }`
(`hooks` is spread first and `releaseWaiting` is not shaped, `brokerWorld.ts:253-271`). New `test/bridgeLinksWorld.ts` builds the real
`sshExecAction` the way `test/sshUseActions.test.ts:90-160` does — `loadWithVscode('../sshUseActions', stub, mocks)` with only
`./sshExecRunner` (records argv, program, env), `./keyInstaller` (real files, as there) and `./hostKeyTrust` substituted, the REAL
`./sshCredential` — over `memoryStorage(stub)` from `test/pinWorld.ts:214` seeded with `e1` (ssh, `host: 'prod.corp.com'`, `user: 'deploy'`,
`sshKeyEntityId: 'k1'`, optionally `jumpHostEntityId: 'j1'`, `agentForward`), `k1` (an `sshkey` holding `PRIVATE KEY BODY`, optionally
`pinProtected: true` with a sealed value) and `j1` (ssh, `host: 'jump.example.com'`, `user: 'hop'`, or the invalid host `'bad host!'`), all in
`a1`; the scope is `['e1']`. The action reads `memoryStorage`; the lookups read the wall world's tree — two sources, by the same ids, said here
so nobody "fixes" it.

| # | Scenario | Expected | RED today, because |
|---|---|---|---|
| S17 | The store, pure | Absent, unparseable, not a `ScopeFile`, `v !== 1`, another account's or server's ids: empty, revision 0. `set` with `expectedRevision` 0 on a new file → 1; again with 1 → 2; with 0 → `SCOPE_STALE` and the file unchanged. 257 entries refused. Cap 64 by `at`, never the file just written. `forget` removes one. A `.tmp` left behind is not listed. `read` after a `set` through a second `BridgeScopes` over the same directory sees it | the class takes a `Memento` |
| S25 | Across windows (real `node:fs`, a `mkdtemp`, two `LeasedQueue`s over two `WindowLock`s on the one lock directory) | A narrows; B's next `read` is the narrowed scope. B `set`s from a copy at revision 1 after A wrote 2: `SCOPE_STALE`, nothing restored. A reads revision 1, B `forget`s, A `set`s expecting 1: `SCOPE_STALE` (the file is gone, revision 0), still forgotten. Two `set`s racing from both queues: exactly one lands, the other is stale. A corrupt file written beside: empty scope, and the next `set` expecting 0 replaces it | no file store |
| S22 | The listing is per account (`collide: true`) | Row 4 through the bridge lists `e1` once, named `prod`; `foreign` is nowhere in the body; `listEntriesOf` was called with `a1` only | §S3.12's recorded gap: the row `foreign` is listed |
| S23 | The snippet is per account (`collide: true`) | Row 5 for `e1` answers `a1`'s config; a world where only `a2` holds a config `e1`: the not-found body | `visibleConfigDetails` answers the first account |
| S24 | A narrow during the listing | `listEntriesOf` answers a promise the test holds; the scope is narrowed to `[]`; the promise resolves: `entries: []` | `entriesIn(scope(), await …)` read the scope first |
| S26 | Prompts per bridge | Five dialogs through bridge A inside a minute; the sixth is `too_many_requests` with the bridge sentence; a sixth through bridge B is asked; a local alias call is asked. A dialog held open on A: B's call and a local alias call are `busy`. Five calls refused before any dialog (an out-of-scope reference) then five dialogs: all five asked. The sixth through the token route on a bridge: the bridge sentence, never `a caller without a token`. `forget(A)` then five more on A are asked. Local alias door: five, then the sixth refused, as today (existing route tests green) | one shared window (`§S3.12` item 7); a pre-dialog refusal spends |
| S27 | The gate before `releaseWaiting` (S10 extended) | `holdDialogs`, narrow, Allow: `releaseWaiting` spy never called, the route's OUT sentence, nothing reserved | `:586` runs before `answer` |
| S28 | A token denied mid-flight (S14 leg) | A bridged token call's dialog is held; the token is denied through a local dialog answered Deny (or `registryOf(ww).grants` via `deny`); the bridged dialog is answered Allow: 403 `denied`, `GRANT_NOT_ALLOWED`; the token's `uses` unchanged; `w.ran` empty | the gate does not read the token |
| S29 | `REFERENCE_REFUSED` echoes nothing (S9 extended) | A stored argument `creds://a@x.test/Other/db/password`: the body contains no `creds://`, no `Other`, no `db`; the same sentence for every failure | the sentence carries `<ref>` |
| L1 | A linked key out of scope is part of using `e1` (real action) | Through the bridge, Allow: 200; `runs[0].argv` has `-i <path under storageDir>`; the body carries no key material, no `k1`, no key name; the materialised file is gone | the wall world has no real action: the file does not compile |
| L2 | A protected linked key refuses generically | `k1` sealed (`pinProtected`): bridge → 409 `no_credential`, body exactly `BRIDGE_USE_REFUSED('prod')`, no `k1` or its name; `deps.note` got the real sentence; main port → today's sentence naming the key entity (control) | the body names the key entity |
| L3 | A jump host out of scope | `j1` valid: bridge → 200, argv has `-J hop@jump.example.com`, the body does not carry `jump.example.com`'s entry name. `j1` with `'bad host!'`: bridge → generic body; main → `The jump host "jump" cannot be used…` (control) | the body names the jump host |
| L4 | `agentForward` refused twice | `e1.agentForward: true`: bridge → 403 `denied`, `AGENT_FORWARD_REFUSED('prod')`, `w.dialogs` empty (the wall refused first), `runSshExec` never called. The same with `entryRefusal` stubbed to answer `undefined`: a dialog, then the action refuses with the same sentence. Main port: runs with `-A` (control) | runs with `-A` through the bridge |
| L5 | `ssh`'s stderr stays | The runner stub answers `stderr: 'kex_exchange_identification: jump.example.com'`: the body carries it, through the bridge too (the decision, pinned) | compiles with L1 |
| R2 | Transitive purity | Walking imports from the seven modules reaches no `vscode`; a planted `import * as v from 'vscode'` in a copied `grantWords.ts` is reported with its chain | `bridgeScope → brokerRequests → grantLimits → vscode` |

### A.6 Break-its (mutate, watch the named case fail, restore; both outputs in the PR)

| # | Mutation | Red case |
|---|---|---|
| N1 | `set` writes outside `writes.run` | S25 racing `set`s both land |
| N2 | `set` ignores `expectedRevision` | S17, S25 stale writes land |
| N3 | `read` caches the parsed file | S17 "a second `BridgeScopes` sees it", S25 |
| N4 | `read` skips the account/server check | S17 another server's file admits |
| N5 | `sources.mcpEntries` reads `real.mcpEntries` | S22 |
| N6 | `sources.visibleConfig` reads `real.visibleConfig` | S23 |
| N7 | the scope read before the listing's await | S24 |
| N8 | `prepared` asks nothing before `releaseWaiting` | S27 |
| N9 | `launchRefusal` ignores `tokenDenied` | S28 |
| N10 | `admit` keys every door as `LOCAL_DOOR` | S26 (B's sixth refused) |
| N11 | the modal window stamped at `admit` | S26 (pre-dialog refusals spend) |
| N12 | `OneInFlight` per door | S26 (two dialogs at once) |
| N13 | the local sentence on a bridge | S26 token leg |
| N14 | `REFERENCE_REFUSED` with the reference | S29 |
| N15a-c | `bridgedRefusal` dropped at `:133` / `:203` / `:224` | L2 / L3 / L3 with a failing runner |
| N16 | the action's `agentForward` check dropped | L4 second leg |
| N17 | `referenceRefusal` skips `entryRefusal` | L4 first leg (a dialog is raised) |
| N18 | `grantWords.ts` imports `grantLimits.ts` | R2 |
| N19 | R2 reads only the listed files | R2 "has teeth" with the planted import two hops away |
| N20 | `ExecSlots.acquire` ignores the cap | `execSlots.test.ts` |

### A.7 Order of the fix-forward commit

1. `grantWords.ts`, `execSlots.ts`, R2 transitive (RED first), `aliasThrottle.test.ts` rewritten — pure, no behaviour change on the doors.
2. The store (A.3.1) with S17/S25; the wall world over a `mkdtemp` and a real `LeasedQueue`.
3. The suppliers, the listing order, the sentences (A.3.2, A.3.3) with S22–S24, S29.
4. The gate and the denied token (A.3.4) with S27, S28.
5. The prompt windows (A.3.5) with S26.
6. The real action (A.3.6, `bridgeLinksWorld.ts`) with L1–L5.
7. `npm run lint`, `wc -l src/credsAgentServer.ts` (787), `npm run ratchet`, the pre-PR block; then E1.4 from the S4 spec with §S4.10.

### A.8 Opus checklist, added to §S3.9

- `BridgeScopes` has no `Memento`; `set` and `forget` run inside `writes.run`; `set` re-reads inside; `SCOPE_STALE` on a mismatch; temp-and-rename; `read` is `readSync` and verifies `v`, `accountId`, `serverEntityId`; `revision` is on `Scope`.
- The bridged view's listing and snippet come from `wall.listEntriesOf`/`wall.visibleConfigOf`; the scope is read after the listing's await; `accountOnlyVault` delegates every method by name.
- `prepared`: `stopped` asked before `releaseWaiting`; `atLaunch` built once and handed to `performCall`; `answer` still asks it; `tokenDenied` read from `grants.get(spend)` inside the closure.
- `TokenlessCeilings`: one `OneInFlight`; windows per door; the modal window stamped in `ConsentGate.ask` only, never in `admit`; `prompted` ignores a local token call; the bridge sentences carry no "caller without a token".
- `sshUseActions.ts`: the three sites go through `bridgedRefusal`; the `agentForward` check sits before `acquireExecSlot`; `sshExecAuth.ts` and `sshOptions.ts` are untouched.
- `REFERENCE_REFUSED(entityName)` has one parameter; `AGENT_FORWARD_REFUSED` is the one sentence on both legs.
- No module in R2's closure imports `vscode`; `grantLimits.ts` has no `expiredMessage`.
- `credsAgentServer.ts` at 787; `extension.ts` at 1003; `npm run ratchet` green.

### A.9 Not verified by this spec

- `fs.rename` over a `.json` another window is reading: atomic within one volume on POSIX and NTFS; on Windows a concurrent reader can make it fail with `EPERM`/`EBUSY`, hence the bounded retry, which S25 cannot provoke on a Linux runner. The owner's M7 is the only real Windows exercise.
- The line counts (`stopped`, the `prepared` edit) and ESLint's complexity for `prepared` after the change are hand counts; `npm run lint` decides.
- `memoryStorage` from `test/pinWorld.ts` seeding an `sshkey` entity with a sealed value for L2 is read from that helper's exports, not run.

### Amendment 2 (Fable, 2026-11-05) — after the fix-forward `c58842e` and its review

Eight review items. Every `file:line` is at `c58842e`; `credsAgentServer.ts` is 787 of 800. **None is a plan change**: items 1–7 bring the
code to §4.2's own sentences (one dialog in flight, prompts and bounds per bridge, refusals naming nothing, a scope that cannot be
restored from a stale copy, suppliers the tests run as production does). Item 1 adds one number §4.2 does not carry — sixty asking calls
a minute per door — which narrows nothing a person can do and belongs in §4.2's *Prompts* bullet at promotion, not in the change ledger.
Item 8 is a note, with one small fix. Nothing above is deleted; where this amendment differs from A.1–A.9 and from Sonnet's *As built*,
this amendment wins.

#### B.1 A pre-dialog refusal is bounded, holds no grant and cannot flood the journal (HIGH)

What is true today: `askingVerdict` (`aliasThrottle.ts:282-291`) checks `busy` and the dialog window only, so a loop of
`POST /v1/mcp/use/exec {"entry":"e1","command":""}` is admitted every time; each admission mints a `'call'` grant and writes a `minted`
line (`brokerMcpDoor.ts:209-219`, `brokerBridgeToken.ts:34-45`, `credsAgentServer.ts:332-352` for the alias route), then `usable`
(`:544-562`) refuses with a second line. At 256 grants `prune` (`grantRegistry.ts:261-279`) evicts the oldest non-allowed grant — a shared
token whose dialog is open or a denied tombstone — before any call grant, and `brokerAuditWriter.append` (`:65`) grows at request speed.

```ts
// aliasThrottle.ts
export const ASKING_CEILING = 60;                        // asking calls a minute, per door: SILENT_CEILING's number, for the same kind of loop
interface DoorCounts { modal; silent; asking: SlidingWindow; reportedAt }     // `asking` stamped at ADMIT of a prompting call
// askingVerdict(counts, nowMs): busy (the place held) → asking window full → 'too-many' (nothing held, STAMPED anyway: a refusal is a call) →
//   modal window full → 'too-many' → hold the place, stamp `asking`, 'allow'. The silent path is unchanged.
// describe(): the asking refusal reads `Too many requests: <who> may ask at most 60 times a minute, calls refused before any dialog included.`
//   with <who> `a caller without a token` on LOCAL_DOOR and `this Remote Bridge` otherwise. `refused().report` is true for an asking
//   refusal exactly as for a silent one: `firstThisWindow(counts, nowMs)` — one journal line per door per window.

// grantRegistry.ts
/** Delete a `'call'` grant that is still `pending`: a call refused before anybody was asked. A token, or a settled grant, is never dropped. */
drop(secret: string): void;
/** Eviction, in one ordered list so the registry never reaches a token while a call grant exists. */
const EVICTION_ORDER: ReadonlyArray<(grant: Grant) => boolean> = [
  (g) => g.scope === 'call' && g.status !== 'allowed',   // refused or abandoned calls
  (g) => g.scope === 'call',                             // allowed calls (silent MCP use)
  (g) => g.status === 'denied',                          // tombstones (already capped at 64)
  (g) => g.scope === 'token' && g.status === 'pending',  // a token whose first dialog is open
  (g) => g.scope === 'token',                            // the last resort, as before
];
private oldestEvictable(): string | undefined {          // `EVICTION_ORDER.map((fits) => this.oldestWhere(fits)).find((v) => v !== undefined)` — complexity 1
```

`credsAgentServer.ts`: in `usable` (`:544-562`) both refusal branches call `this.grants.drop(grant.secret)` before `respondError` (+2);
`admitAliasCall`'s report line (`:228`) writes `via: prompts ? undefined : 'mcp'` — the comment's "via mcp is a fact" is false for an asking
refusal (same line). The `minted` line stays: calls under the ceiling are logged as today (two lines each); beyond it one line per window.
Worst case per door per minute: 60 × 2 + 1 = 121 lines, against unbounded today.

**What this changes on the existing doors, exactly.** The local alias and MCP doors gain the same 60-asking-calls bound (legitimate use is
a person in a terminal or an agent that thinks between calls; neither nears it). A call they refuse before its dialog no longer leaves a
pending call grant in the registry. The eviction order change means an idle shared token, a denied tombstone or a token with an open
dialog is never evicted while any call grant exists — today each of them can be. No answer, status or sentence on either door changes
below the ceiling; above it a new `too_many_requests` sentence appears where today the call reaches `usable`.

#### B.2 The one place is the dialog's, not the call's (MEDIUM)

Today `OneInFlight` is held from `admit` to the route's `finally` (`credsAgentServer.ts:347-353`, `brokerMcpDoor.ts:216-220`,
`brokerBridgeToken.ts:41-45`), so (a) a client that hangs up during its dialog ends its call, frees the place, and the next call raises a
second modal while the first stays on screen defused (`sharedPrompt.ts:52-55,82-85`, `brokerConsent.ts:90-101`), and (b) the place is held
through the action, so one 120-second `exec` makes every other door `busy` with "waiting for the person to answer".

Decision applied: the place is tied to the modal's life. Reused from `6879db3` (`consentTurns.ts`): the rule that a gone waiter does not
free the slot its open modal holds, and `first` for one journal line per burst. Its class is not reused: `ConsentTurns` queues up to three
waiters per SSH key and runs their jobs in turn, while this door refuses with `busy` and has one place for every key.

```ts
// aliasThrottle.ts
export class OneInFlight {
  /** Take the place; `undefined` while it is held. The holding is this ADMISSION's, so a stale release cannot free a later holder's place. */
  hold(): Holding | undefined;
  /** A dialog is on screen for the holder: the place now belongs to the dialog. */
  prompted(held: Holding): void;
  /** The dialog closed — the person's click, or the 5-minute timeout: the place is free, whatever the call does next. */
  dialogClosed(held: Holding): void;
  /** The call ended. Frees the place only if no dialog of this holding is on screen, and only if it still holds the place. */
  released(held: Holding): void;
}
export interface Holding { readonly id: number; }
// TokenlessCeilings: `admit` holds and puts the Holding into the Slot's closure; `prompted(grant, via, nowMs)` stamps the door's modal
// window AND calls flight.prompted(current) when doorOfDialog(...) !== undefined; new `dialogClosed(grant, via)` calls flight.dialogClosed(current)
// under the same condition. Local token dialogs: doorOfDialog is undefined, nothing is held, stamped or closed — `bridgeTransitive.test.ts:239` holds.

// brokerConsent.ts:29-40  ConsentGateDeps.dialogClosed?(question: ConsentQuestion): void
// brokerConsent.ts:81-95  ask(): `this.deps.prompted?.(question)` before showWarningMessage (as built); the await is wrapped in try/finally and the
//                          finally calls `this.deps.dialogClosed?.(question)` — before `stillWanted`, so a defused modal frees the place at its click too.
// credsAgentServer.ts:118  `…, dialogClosed: (q) => this.ceilings.dialogClosed(q.grant, q.via) })` on the same line.
```

The five-minute timeout: `withTimeout` settles the `ask` and `dialogClosed` frees the place, although VS Code cannot take the modal down.
Otherwise one unanswered modal would lock every door until the person found it. The stale modal decides nothing (`stillWanted` is false
once its waiters left; a live waiter was answered `timeout`), and at most one such dead modal per five minutes can stack above a new one.

#### B.3 `ForwardAgent=no` on a bridged call (MEDIUM)

`unusableEntity` (`sshUseActions.ts:129-135`) refuses `entity.agentForward` on a bridge, while `ssh` also reads the laptop's
`~/.ssh/config`: `Host *` / `ForwardAgent yes` forwards the whole agent for an entry whose flag is off (`sshExecCommand.ts:85-113` sets no
`ForwardAgent`). A command-line `-o` outranks every config file (ssh_config(5), "command-line options take precedence"), and forwarding
happens only when `ForwardAgent` is yes, so `-o ForwardAgent=no` alone makes it false.

```ts
// sshExecCommand.ts:6-9
export interface SshExecOptions { jump?: string; knownHostsFile?: string; /** A bridged call: never forward the agent, whatever a config file says. */ noAgentForward?: boolean; }
// buildSshExecArgv, after `sshOptionArgv` (:99): `if (options.noAgentForward === true) { argv.push('-o', 'ForwardAgent=no'); }` — after `-A` would have been,
// so the option wins over the composer too (there is no `-A` on a bridge, by B.3's guard, but the order makes that irrelevant).
// sshUseActions.ts connectionArgvOptions(deps, entity, jump, bridged: boolean) → { jump, knownHostsFile, noAgentForward: bridged };  call site :242 passes ctx.bridge !== undefined.
```

`SSH_AUTH_SOCK` is **not** cleared: with `ForwardAgent=no` the agent is not forwarded, and clearing the socket would also change how the
in-scope entry *authenticates* (ssh offers agent identities before `-i`), which is not this item's question. Live check: `ssh-agent-itest.cjs`
style against the harness `sshd` — a config file with `Host *\nForwardAgent yes` passed with `-F`, a live `SSH_AUTH_SOCK`, remote command
`printenv SSH_AUTH_SOCK`: without `-o ForwardAgent=no` the output is non-empty, with it empty. That proves ssh's precedence on the
runner's OpenSSH; the action's argv is pinned by F1. Unobserved, for the M-list as **M8**: the same through the real action from the owner's
Windows OpenSSH 9.5 with a `ForwardAgent yes` in the Windows `ssh_config`.

#### B.4 The token's status is read after the body (LOW)

`handle` reads the token at `:474-478` and `bridgedTokenCall` tests the snapshot (`brokerBridgeToken.ts:29`) after the body was read
(`:481-493`). A Deny in between is missed until the launch gate.

```ts
export async function bridgedTokenCall(door, res, token, action, body, caller, status: () => GrantStatus | undefined): Promise<void>
//  :29  `if (status() === 'denied')`;  credsAgentServer.ts:495 passes `() => this.grants.get(grant.secret)?.status` on the same line.
```

#### B.5 The revision is a fresh random id

`revision: number` with absent = 0 repeats after `forget` (Sonnet's *As built* note): forget, re-pick (`set` expecting 0 → 1), and a copy
held at 1 from before the Close saves over it.

```ts
export const NO_SCOPE = 'absent';                        // the absent state's own revision
export interface ScopeFile { …; readonly revision: string; }   // `crypto.randomUUID()` at every write
export interface Scope { …; readonly revision: string; }       // NO_SCOPE when absent or corrupt
set(accountId, serverEntityId, entries, quiet, expectedRevision: string): Promise<string>;  // `expected !== (file?.revision ?? NO_SCOPE)` → SCOPE_STALE
```

E2's picker reads `scope.revision` and hands it back; `Scope` changes shape, which E2 (not built) absorbs.

#### B.6 The wall's suppliers are one production function

`bridgeWallWorld.ts:225-239,284` hold their own copies of what E2 would wire, so S22, S23 and L4's first leg exercise the test world.

```ts
// bridgeWallSource.ts (new, pure)
/** Everything of a BridgeWallSource that comes from the vault, over one `McpVaultSource`. E2 wires `{ scopes, refSource, ...wallSuppliersOf(storage) }`. */
export function wallSuppliersOf(vault: McpVaultSource & { getNode(accountId: string, id: string): TreeNode | undefined }): Pick<BridgeWallSource, 'storedTexts' | 'listEntriesOf' | 'visibleConfigOf' | 'entryRefusal'>;
//  storedTexts: referenceTextsOf(vault.getNode(a, e)?.details ?? {});  listEntriesOf: visibleMcpEntries(accountOnlyVault(vault, a));
//  visibleConfigOf: visibleConfigDetails(accountOnlyVault(vault, a), e);  entryRefusal: agentForwardRefusal(vault.getNode(a, e)?.details)
export function agentForwardRefusal(details: EntityMetadata | undefined): Refusal | undefined;   // moved from the test world
```

The wall world builds `wall = { scopes, refSource, ...spied(wallSuppliersOf(vault)) }`, where `spied` wraps each function to record its
arguments and, for `listEntriesOf`, to hold the listing when asked; it defines none of the four itself.

#### B.7 (S4) — in the S4 spec §S4.10, item 4.

#### B.8 Notes, and one small fix

- **Said, not coded:** `ssh`'s stderr on a bridge is returned as is (A.2 item 3) and may carry the laptop's materialised key path and the
  linked key's id, which is in that file's name (`sshExecAuth.ts:155`, `sshUseActions.ts:251`). The owner decides; E3 inherits the answer.
- **Fix:** a throw out of `prepareAuth` (`sshUseActions.ts:227`) leaks the exec slot taken at `:223`. `const prepared = await prepareAuth(deps, ctx, entity, refuse).catch((error: unknown) => { release(); throw error; });`
  (+1 line, in a function already exempt from the complexity rule). E3's server-side runs take the same slot.

#### B.9 `credsAgentServer.ts`, counted (787 today)

| Where | Edit | Lines |
|---|---|---|
| `:118` | `dialogClosed: (q) => this.ceilings.dialogClosed(q.grant, q.via)` added to the gate's deps | 0 |
| `:228` | `via: prompts ? undefined : 'mcp'` | 0 |
| `:495` | `bridgedTokenCall(…, who.caller, () => this.grants.get(grant.secret)?.status)` | 0 |
| `usable` `:544-562` | `this.grants.drop(grant.secret);` before each of the two `respondError` calls | +2 |
| | **Total** | **+2 → 789**; E1.4 adds two (S4 §S4.10: `serverEntityId`, `remember` after the gate) → 791 |

`usable`, `prepared`, `perform`, `handle` keep their complexity and length; `extension.ts` stays at 1003.

#### B.10 Scenarios (each RED today, and why)

Files: `test/bridgePrompts.test.ts` (A1–A3, P1–P3), `test/grantRegistry.test.ts` (A4), `test/aliasThrottle.test.ts` (the three classes),
`test/bridgeTransitive.test.ts` (T1), `test/bridgeStore.test.ts` (V1), `test/bridgeLinks.test.ts` (F1), `test/bridgeWallSource.test.ts`
(W1), `test/sshUseActions.test.ts` (X1). `test/brokerWorld.ts` gains `consentTimeoutMs?: number`, passed as a mock of `./agentConsent`
(`loadWithVscode`'s third argument, as `sshUseActions.test.ts:93` does) so P3 does not wait five minutes; `bridgeWallWorld.ts` gains
`sendAbortable(door, ask): { reply: Promise<Reply>; abort(): void }` over `http.request` (`req.destroy()`) and `sendSlow(door, ask, bodyAfter: Promise<void>)`
(headers now, body later).

| # | Scenario | Expected | RED today, because |
|---|---|---|---|
| A1 | The refused loop, through a bridge | 300 `command: ''` posts to `/v1/mcp/use/exec` within a minute: 60 answer `invalid_request`, 240 answer `too_many_requests` with the asking sentence; the registry holds no pending `'call'` grant afterwards; the journal grew by ≤ 121 lines; `w.dialogs` empty | 300 grants, 600 lines, no refusal |
| A2 | A held token survives it | Before A1: a shared token with its first dialog open on the main port (`holdDialogs`), an allowed token, and three denied tombstones. After A1 and 300 more alias calls with `command: ''`: the open dialog still decides its call; the allowed token still runs; the tombstones still answer `denied` | `oldestEvictable` evicts the pending token at the 256th mint |
| A3 | The same loop on the local MCP door and the local alias door | As A1, with the local sentence; the existing five-dialogs-a-minute tests green | unbounded today |
| A4 | Eviction order | 300 pending calls + 1 pending token + 1 allowed token + 3 denied: after `mint`, every token and tombstone remains; `drop` deletes a pending call, and is a no-op on a token, an allowed call, a denied grant | tier 1 is `status !== 'allowed'` |
| P1 | Post-and-disconnect | `holdDialogs`; `sendAbortable` through the bridge, abort once the dialog is up; a second call: `busy`, `w.dialogs.length === 1`; answer the dialog: an `ignored` line; a third call: asked | the aborted call's `finally` frees the place; the second raises a modal |
| P2 | A long action frees the place | Allow a bridged `exec` whose action is held (`w.hold`); a call through another bridge and a local alias call: both asked (`dialogs === 3`), none `busy` | the place is held until the action ends |
| P3 | The timeout | `consentTimeoutMs: 100`; a dialog never answered: the caller gets 504 `consent_timeout`; the next asking call is admitted; a late click on the first → `ignored`, and the place it would have freed is not the second's (the second's dialog still blocks a third as `busy`) | green today for the first half, pinned; the holding-id half is new |
| F1 | `ForwardAgent=no` on a bridge | Through the bridge: `runs[0].argv` contains `-o ForwardAgent=no` after the `sshOptionArgv` block; off a bridge it does not; off a bridge with `agentForward: true` the argv has `-A` as today | no such option |
| T1 | A Deny between the token's lookup and its body | `sendSlow` with a valid token; deny the token (a local dialog answered Deny) before the body is sent; send the body: 403 `GRANT_NOT_ALLOWED`, no dialog, no `minted` line | the snapshot was `pending` |
| V1 | The ABA on the revision | A reads (revision r1); B `forget`s; B `set`s expecting `NO_SCOPE` → r2; A `set`s expecting r1 → `SCOPE_STALE`; a `set` expecting `NO_SCOPE` on an existing file → `SCOPE_STALE` | 0 → 1 → 1 lands |
| W1 | The production suppliers | `wallSuppliersOf(collideVault).listEntriesOf('a1')` lists `prod` and not `foreign`; `visibleConfigOf('a1','e1')` is `a1`'s; `entryRefusal` answers `AGENT_FORWARD_REFUSED` for an `agentForward` entry and `undefined` otherwise; `storedTexts` equals `referenceTextsOf` of the entry. S22, S23, L4 run through them (the spies record the calls) | the function does not exist |
| X1 | The leaked slot | `prepareAuth` made to throw (the mocked `./sshCredential` rejects): `tally.slotsHeld` is 0 afterwards and the result is a failure, not a hang | the slot stays held |

#### B.11 Break-its

| # | Mutation | Red case |
|---|---|---|
| R1 | `askingVerdict` without the asking window | A1, A3 |
| R2 | an asking refusal not stamped (`'too-many'` without `stamp`) | A1 (the 61st is admitted after the 60 refusals… the count must include refusals) |
| R3 | `drop` deletes a token or an allowed grant | A4 |
| R4 | `EVICTION_ORDER` as today's three tiers | A2, A4 |
| R5 | `released` frees while a dialog is open | P1 |
| R6 | `dialogClosed` not called on timeout | P3 (the second call `busy` after the timeout) |
| R7 | `released(held)` without the holding id | P3 second half, P2 (a late release frees a new holder) |
| R8 | `noAgentForward` not pushed, or pushed before `sshOptionArgv` | F1 |
| R9 | `bridgedTokenCall` tests the snapshot | T1 |
| R10 | revision a counter again | V1 |
| R11 | the wall world defines a supplier of its own | W1 (a planted difference between the world's and `wallSuppliersOf`'s answer) |
| R12 | `.catch` dropped at `prepareAuth` | X1 |

#### B.12 Order, Opus additions, unverified

Order: B.1 registry (`drop`, `EVICTION_ORDER`, A4) → B.1 throttle and B.2 together (one `aliasThrottle.ts` edit, A1–A3, P1–P3) → B.4 → B.5 →
B.6 → B.3 and B.8 (`sshUseActions.ts`, F1, X1) → lint, `wc -l` (789), ratchet, the pre-PR block; then E1.4.

Opus: `OneInFlight` frees only on a matching `Holding`; `dialogClosed` is in a `finally` in `ask`; local token calls hold, stamp and close
nothing; `drop` touches only `'call'` + `'pending'`; `EVICTION_ORDER` is a list, `oldestEvictable` complexity 1; the asking window is
stamped on admission and on refusal; the report line is once per window per door; `-o ForwardAgent=no` comes after `sshOptionArgv`;
`SSH_AUTH_SOCK` untouched; `revision` is a string and `NO_SCOPE` is never written to a file; the wall world imports `wallSuppliersOf`.

Unverified: `-o ForwardAgent=no` outranking a `Host *` stanza is read from ssh_config(5) and is checked live only on the runner's OpenSSH
(M8 for Windows); `withTimeout`'s settlement shape (resolve `undefined` or reject) decides where `dialogClosed` sits — the `finally` covers
both, which is why it is a `finally`; the `./agentConsent` mock reaching `brokerConsent.ts` through `loadWithVscode` is assumed from
`sshUseActions.test.ts`'s use of the same loader.


## S3.13 — As built, epoch 3 (Sonnet, 2026-11-05)

One fix-forward commit on `feat/remote-bridge-e1`, built in the order of A.7. `credsAgentServer.ts` is **787** lines (A.4's
count, to the line), `extension.ts` 1003 and unchanged, `handle` untouched (48 code lines), `prepared` and `perform` at complexity 4. R3 and
its fixture (`test/fixtures/bridgeBoundary.r3.json`) are untouched, and R3 is green. Nothing of E1.4 was built. `.claude/rules/shared`
was not bumped (`pin-check.mjs` reports the shared rules stale, as expected).

### Differences from A.1-A.9, none of which moves the boundary

1. **The store is in `bridgeScopeStore.ts`**, re-exported by `bridgeScope.ts` (so every import path A.3 names holds). It keeps
   `node:fs` out of the module that decides, and `bridgeScope.ts` at 344 lines. `Scope`, `ScopeFile`, `ScopeFs`, `scopeKey` and
   `scopeFileName` are there too.
2. **`accountOnlyVault` is in its own file, `mcpAccountVault.ts`, not `mcpEntries.ts`.** `pinReaderBoundary.test.ts` classifies
   `mcpEntries.ts` an *automatic* reader and refused five delegations of the secret getters in it ("no automatic primitive in that
   function"): the first full run of `npm test` failed on exactly that. The new file is classified a *carrier* in that test's table
   (it hands the getters on and reads nothing). Behaviour as A.3.2.
3. **`launchGate(grants, wall, call)` in `bridgeScope.ts`** builds `atLaunch` (A.3.4 wrote the closure inline in `prepared`); it saves a
   line there and lets the token-status read be named once. `launchRefusal`'s `tokenDenied` is `tokenDenied?: boolean`, not `= false`:
   ESLint counts a default value in complexity.
4. **Every function the spec names is split where `complexity` (max 4) required**, the same as in §S3.12 item 1: `TokenlessCeilings.admit`
   (`admitted`, `refused`), `doorOfDialog`, `idle`, `walledRefusal`, `admitsEntry`, the file-shape validators of the store,
   `unusableEntity` in `sshUseActions.ts` (which also keeps `run` under 50 lines: it holds the `!entity.host` check of old and the new
   `agentForward` check together, in the same order and before `acquireExecSlot`), and `chainFrom`/`firstChain` in the R2 walker.
5. **`ExecSlots.acquire` is an arrow property**, so `acquireExecSlot = new ExecSlots(MAX_CONCURRENT_EXECS).acquire;` is one line and still
   about its instance when an action takes it off the server as a bare value (tested). A.4 counted the accessor at -12; it is -13, the
   `running` field -1, the import +1.
6. **`TokenlessCeilings`** keeps `reportedAt` per door (the spec did not say; one shared mark would let a flood on one bridge silence the
   journal line of another), releases an admission once only (a second call of the same `release` frees nothing), and has two additions
   the spec did not name: `forget(door, nowMs = Date.now())` also prunes every other door whose windows are idle, and `doorCount()`
   exists so a test can see the prune. `over(windowMs)` is exported for the sentence test.
7. **`entryBarred` fails closed** (not in A.3.2): a `wall.entryRefusal` that throws is a `denied` with the reference sentence, never an
   exception out of `usable`. Tested.
8. **The bridged refusal is journalled** as `"<entry>: <real sentence> (a Remote Bridge was told only that it could not be used)"` through `deps.note`.
   A.3.6 said "the real one goes to the journal" without a form.
9. **Test worlds.** `bridgeWallWorld.ts` gives `e1`, `e-out`, `x` and the colliding `foreign` a config of their own (`isConfig`, so the real
   `visibleConfigDetails` serves a snippet; `codeAccessEnabled` is `false` on those rows instead of absent, the same on every door) and
   builds `listEntriesOf`, `visibleConfigOf` and `entryRefusal` from the real functions over `accountOnlyVault`; its scope is the REAL
   `nodeScopeFs` and a `LeasedQueue` over a `WindowLock` in a `mkdtemp` that `dispose()` removes. The pure tests use `memoryScopeFs`/`memoryScopes`/`put`
   (`bridgeModules.ts`). `S23`'s snippet text does not depend on the config's file name, so its first leg cannot tell a1's snippet from
   a2's by body; the leg that discriminates is the second (only a2 holds a config `e1`: the not-found body), plus the accounts
   `visibleConfigOf` was asked about. `S29`: A.5 says the body contains no `creds://`, but the sentence A.3.3 prescribes says "a creds://
   reference", so the test asserts that the only `creds://` in the body is the sentence's own word and that no part of the stored text
   is in it.
10. **Beyond A.5, tests added** for guards no N-row names: `brokerStopped.test.ts` (`stopped` asked directly: a client that has gone, a
    refusal, an admit), `brokerConsentPrompted.test.ts` (`prompted` is called once, before the dialog, not for a grant that already
    says allowed/denied, not for a joiner), `grantWords.test.ts`, the broker-level cap and bound-accessor tests in `execSlots.test.ts`, a local
    token call that is not throttled, a Trash dialog counted on the local door, the clock-stepped-back prune, the file's deduplicated ids,
    `entryRefusal` first/throws, the three sentences written out, `accountOnlyVault`.

### The consequence on the local alias and MCP doors (A.2 item 9), pinned

`bridgePrompts.test.ts`, "S26 consequence": six calls refused before their dialog by the action's own validation (an empty command)
leave all five dialogs free on the local alias door and on the local MCP door, and the sixth dialog is `too_many_requests`. It watched
RED against the old throttle (`alias: refused call 6 is a validation refusal, not a throttle`). **No existing test had to change because of it.**
The existing tests that count prompts (`S14` "the sixth token call", the MCP "sixty quiet calls ... still gets its five", "an entry that
prompts is still refused at the sixth", every route test of the alias door) went red for a while mid-build, between the throttle's change
and the stamp's wiring, and were green again with no edit once the gate called `prompted`. The tests that DID change in this commit changed
for the other reasons here: `REFERENCE_REFUSED` takes no reference (`bridgeReferences`, `bridgeTransitive`), the scope is a file and `set`
takes a revision (every helper that called `set`), the wall has three more members (`emptyWall`, `wallOf`, `wallWith`), the two
`sources.*` unit tests read the wall's suppliers, `aliasThrottle.test.ts` is over three classes, and R2 is transitive.

### The RED record (each watched failing, for the reason named, before the code)

- **R2**, original tree plus a `grantWords.ts` that re-exports from `grantLimits`: `bridgeScope must not reach vscode ... + 'bridgeScope ->
  brokerRequests -> grantLimits -> vscode'` (the walk's own teeth test: `the walk from bridgeScope reaches grantWords (24 modules)`).
- **`execSlots.test.ts`**: `Error: Cannot find module '../execSlots'`. **`accountOnlyVault`**: not a function.
- **`aliasThrottle.test.ts`** against the old class (21 of 32 failed, 11 pass because the old code satisfied them): `call 6, refused before its
  dialog was refused: Too many requests: a caller without a token may prompt at most 5 times a minute.`
- **S17/S25**: `TypeError: this.store.get is not a function` (the class took a `Memento`), 37 of 42 failing.
- **S22**: `e1 once, named prod` with `[ 'e1', 'foreign' ]` also listed. **S23** (leg 2): the snippet was served from a2's `e1`. **S24**, with the
  scope read before the await: `the scope was read after the listing came back: nothing of e1 is shown` (the full e1 row was returned).
  **S29**: `"prod" uses creds://nobody@x.test/Agents/second/password, which this Remote Bridge ...` against the one sentence.
- **S27** (S10 extended): `mcp: S27 — a waiting rotation was not promoted onto an entry the scope no longer admits ... + [ 'a1/e1' ]`.
  **S28**: `a token the person denied while the call waited ran anyway: {"exitCode":0,"stdout":"ok\n","stderr":""}` and `200 !== 403`.
- **S26** against the old throttle: `asked call 1` (a window spent by refusals), `alias: refused call 6 is a validation refusal, not a throttle`,
  `a bridge has its own five`, the sixth through B refused with the local sentence, `ceilingsOf(...).forget is not a function`.
- **L2**: the body was `"deploy-key" is protected with its own PIN, so it cannot be used automatically ...`; **L2 (write)**: `Could not write the
  stored key to disk: EACCES: permission denied, open '/tmp/creds-links-.../k1-....key'`; **L3**: `The jump host "jump" cannot be used: its address is
  not a valid host.`; **L3 (runner)**: `Could not run ssh: spawn ssh ENOENT at /tmp/creds-links-...`; **L4 (action)**: `the action went ahead with
  the laptop's agent forwarded: {"exitCode":0,...}`. L1, L3 (valid) and L5 were green on first run, as A.5 says they compile-fail only at HEAD.

### Totals

`npm run typecheck`, `lint` (0 problems) and `ratchet` clean; `npm test` 6204 tests, 6200 pass, 0 fail, 4 skipped, after the one repair in item 2
(the first full run had that one failure, `pinReaderBoundary`, 6199 pass); `npm run itest:cli` all checks passed; `dotnet build dew_flow_creds_for_devs.slnx` 0
warnings, 0 errors; `CredsBroker.Tests` (built from `src_broker_client/tests/BrokerClient.Tests.csproj`, not in the solution) 159 of 159.
`node plan-lifecycle.mjs` clean.

### Break-its run (all caught; each mutation applied to one file, that file re-emitted, 733+ tests run, restored and its sha256 compared with the one taken before)

80 mutations: N1-N20, and 60 more guards. **Four guards no test caught** on the first pass, each now has one: G5b (a Trash dialog raised by the
MCP door's own verbs stamped under the wrong door) by "a dialog the MCP door raises for its own verbs ... is counted on the local door";
G6 (the prune may remove the file just written) by "the file just written survives even when it is the oldest of all"; G8 (`set` keeps
duplicate ids: the Set was only hidden by `read`) by "an entry given twice is written once"; G27 (`stopped` ignores a client that has gone)
by `brokerStopped.test.ts`. G53 and G55 were run against `grantWords.test.ts`, which the default set did not include. G29/G30 were re-run
after `accountOnlyVault` moved to `mcpAccountVault.ts`.

| # | Mutation | Test that caught it (first) | Failing |
|---|---|---|---|
| N1 | `set` writes outside `writes.run` | S25: two sets racing for one server from two windows — exactly one lands, the other is stale | 1 |
| N2 | `set` ignores `expectedRevision` | S17: set answers the revision it wrote: 0 -> 1 -> 2, and a copy at the wrong revision is refused with the o... | 4 |
| N3 | `read` caches the parsed file | L1: a linked key out of scope is part of using e1 — it works through the bridge, the file is gone after, an... | 76 |
| N4 | `read` skips the account/server check | S17: a malformed file, in any of its parts, is an empty scope at revision 0 with quiet off | 2 |
| N5 | `sources.mcpEntries` reads `real.mcpEntries` | sources.mcpEntries: kept rows are those in scope, can is narrowed to use, dependsOn names only kept rows | 3 |
| N6 | `sources.visibleConfig` reads `real.visibleConfig` | sources.visibleConfig: a config only in scope, from the per-account supplier, and it is not asked about the... | 2 |
| N7 | the scope read before the listing's await | S24: a scope narrowed while the listing is being read is the scope the listing is cut by | 1 |
| N8 | `prepared` asks nothing before `releaseWaiting` | S10: scope narrowed while the modal is open — the call is refused with the route's own sentence, byte for b... | 2 |
| N9 | `launchRefusal` ignores `tokenDenied` | S28: a token denied while its bridged call waits is refused at the gate — nothing runs, nothing is spent | 1 |
| N10 | `admit` keys every door as `LOCAL_DOOR` | each door has its own windows: five dialogs on bridge A leave bridge B and the local door untouched | 11 |
| N11 | the modal window stamped at `admit` | the local door is today's modal budget to the byte: five dialogs, one in flight, those sentences | 20 |
| N12 | `OneInFlight` per door | one dialog in flight is global: a dialog held open on A makes B and the local door busy | 2 |
| N13 | the local sentence on a bridge | on a bridge the sentences name the bridge, never a caller without a token | 3 |
| N14 | `REFERENCE_REFUSED` carries the stored text | S9 and S29: every way a reference can fail reads alike — one sentence, and it echoes nothing of the stored ... | 10 |
| N15a | `bridgedRefusal` dropped at the credential refusal | L2: a key sealed with its own PIN refuses generically on a bridge — the body names no key, the journal has ... | 2 |
| N15b | `bridgedRefusal` dropped at the jump chain | L3: a jump host whose address is not valid refuses generically on a bridge, and by name on the main port | 1 |
| N15c | `bridgedRefusal` dropped at the `ssh` failure | L3: an ssh that cannot be started refuses generically on a bridge — the error may carry argv and a path | 1 |
| N16 | the action's `agentForward` check dropped | L4: the action refuses on its own when the wall does not — a dialog, then the same sentence, and ssh is nev... | 1 |
| N17 | `referenceRefusal` skips `entryRefusal` | L4: an entry that forwards the agent is refused before anybody is asked, and ssh is never started | 3 |
| N18 | `grantWords.ts` imports `grantLimits.ts` | R2: the bridge modules are pure, and so is everything they load | 1 |
| N19 | R2 reads only the listed files | R2 has teeth: the walk follows real imports through real files, and names the chain of a planted one | 1 |
| N20 | `ExecSlots.acquire` ignores the cap | ExecSlots hands out exactly its cap and then refuses with undefined | 3 |
| G1 | `prompted` counts a local token call | a local token call is not throttled: its dialog stamps nothing; a bridged token call is counted on its bridge | 2 |
| G2 | `prompted` ignores the bridge of the dialog | each door has its own windows: five dialogs on bridge A leave bridge B and the local door untouched | 10 |
| G3a | the token/MCP door admits without its bridge | S26: five calls refused before any dialog spend nothing — the next five dialogs are all asked | 3 |
| G3b | the alias route admits without its bridge | S26: each bridge has its own five — the sixth through A is refused, a sixth through B is asked, and so is a... | 3 |
| G3c | `admitAliasCall` forgets the bridge it was given | S26: each bridge has its own five — the sixth through A is refused, a sixth through B is asked, and so is a... | 6 |
| G4 | the gate never says a dialog is being shown | S26: each bridge has its own five — the sixth through A is refused, a sixth through B is asked, and so is a... | 10 |
| G5a | the dialog of a perform is stamped under the wrong door | S26: the local alias door is as it was — five, then the sixth refused with the local sentence, and a bridge... | 5 |
| G5b | the dialog of a door is stamped under the wrong door | S26: a dialog the MCP door raises for its own verbs (a move to the Trash) is counted on the local door like... | 1 |
| G5c | the gate is wired without `prompted` | S26: each bridge has its own five — the sixth through A is refused, a sixth through B is asked, and so is a... | 10 |
| G6 | the prune may remove the file just written | S17: the file just written survives even when it is the oldest of all (a clock that stepped back) | 1 |
| G7 | the prune never removes | S17: at most 64 files; the oldest `at` is pruned, never the one just written | 2 |
| G8 | `set` keeps duplicate entries | S17: an entry given twice is written once, and reads as a set | 1 |
| G9 | a v2 file reads as a scope | S17: a malformed file, in any of its parts, is an empty scope at revision 0 with quiet off | 1 |
| G10 | a file with no revision reads as a scope | S17: a malformed file, in any of its parts, is an empty scope at revision 0 with quiet off | 1 |
| G11 | a file with a non-boolean quiet reads as a scope | S17: a malformed file, in any of its parts, is an empty scope at revision 0 with quiet off | 1 |
| G12 | a file naming an entry list that is not ids reads | S17: a malformed file, in any of its parts, is an empty scope at revision 0 with quiet off | 1 |
| G13 | the stale sentence changed | S17: set answers the revision it wrote: 0 -> 1 -> 2, and a copy at the wrong revision is refused with the o... | 1 |
| G14 | a failed rename leaves its temp file | S25: a write that cannot rename leaves no temp file, and says why | 2 |
| G15 | a held rename (EPERM/EBUSY) is not retried | S25: a rename a reader is holding (EPERM/EBUSY, as on Windows) is retried, and gives up after three tries | 1 |
| G16 | a held rename is retried for ever | S25: a rename a reader is holding (EPERM/EBUSY, as on Windows) is retried, and gives up after three tries | 1 |
| G17 | `list` returns files that are not .json | S25: nodeScopeFs lists only .json files, an absent directory as empty, and never a temp file left by a crash | 1 |
| G18 | `list` of an absent directory throws | S25: nodeScopeFs lists only .json files, an absent directory as empty, and never a temp file left by a crash | 1 |
| G19 | `forget` keeps the file | S17: forget removes one file and leaves the others | 2 |
| G20 | the file name is not a hash | S17: scopeKey is injective across the colon, as stampKey is, and the file name is its hash | 1 |
| G21 | `entryBarred` does not fail closed | A.3.2: an entry the wall does not bar is checked for references as before, and a wall whose answer throws f... | 1 |
| G22 | `unservedReference` lets a throw through as served | S9: a storedTexts or a vault that THROWS is the same refusal, never an exception | 2 |
| G23 | the launch gate reads the wrong grant for the token | S28: a token denied while its bridged call waits is refused at the gate — nothing runs, nothing is spent | 1 |
| G24 | `launchRefusal` skips the scope check | S9: a bridged grant with no wall at all fails closed | 6 |
| G25 | `launchRefusal` skips the references | launchRefusal: the grant's account and entry against a fresh scope, then its references | 3 |
| G26 | `runAndDeliver` hands the action boundary no gate | S12: a one-use entry queued in the lane behind a call of another door, narrowed meanwhile — it refuses at i... | 1 |
| G27 | `stopped` ignores a client that has gone | stopped: a client that has gone stops the call with ONE line in the journal, and the wall is not even asked | 1 |
| G28 | `stopped` does not answer the refusal | S10: scope narrowed while the modal is open — the call is refused with the route's own sentence, byte for b... | 4 |
| G29 | `accountOnlyVault` lists every account | accountOnlyVault: the whole source with one account listed, every other method delegated by name and bound ... | 3 |
| G30 | `accountOnlyVault` loses `this` of the source | accountOnlyVault: the whole source with one account listed, every other method delegated by name and bound ... | 1 |
| G31 | the snippet is served for an id out of scope | sources.visibleConfig: a config only in scope, from the per-account supplier, and it is not asked about the... | 4 |
| G32 | the listing is not cut by the scope | sources.mcpEntries: kept rows are those in scope, can is narrowed to use, dependsOn names only kept rows | 8 |
| G33 | the generic refusal changes the code | L2: a key sealed with its own PIN refuses generically on a bridge — the body names no key, the journal has ... | 2 |
| G34 | the generic refusal is not journalled | L2: a key sealed with its own PIN refuses generically on a bridge — the body names no key, the journal has ... | 4 |
| G35 | the generic refusal applies off a bridge too | L2: a key sealed with its own PIN refuses generically on a bridge — the body names no key, the journal has ... | 4 |
| G36 | the action's agent-forwarding check applies off a bridge too | L4: control — on the main port the same entry runs with -A | 3 |
| G37 | `forget` leaves the door's counts | forget(door) starts that door over, and leaves the others as they were | 2 |
| G38 | idle doors are never pruned | a door whose windows are idle is forgotten when another is, and the local door never is | 1 |
| G39 | the local door can be pruned | a door whose windows are idle is forgotten when another is, and the local door never is | 1 |
| G40 | a slot released twice frees the next call's place | a slot released twice frees the place once: the second release cannot free the next call's | 1 |
| G41 | `OneInFlight` lets a second dialog in | one in flight: the second hold is refused until the first is released | 9 |
| G42 | the window is full one too late | a sliding window admits up to its cap, refuses the next, and counts only what it admitted | 32 |
| G43 | a refusal behind the one in flight frees the place it never took | a refusal gives back nothing: a call refused behind the one in flight does not free the one in flight | 1 |
| G44 | the silent ceiling stamps nothing | it refuses the (max+1)th inside the window, and admits again once the window has passed | 10 |
| G45 | a refused silent call is journalled every time | a runaway loop leaves ONE line a window, not one line a call | 1 |
| G46 | the `ExecSlots` double release frees two | releasing a slot twice frees it once: the second call is a no-op and cannot open a ninth slot | 1 |
| G47 | the bridge sentence has the wrong number | the local door is today's modal budget to the byte: five dialogs, one in flight, those sentences | 10 |
| G48 | `AGENT_FORWARD_REFUSED` names the wrong entry | A.3.3: the three sentences are written out, each takes the entry's name and nothing else | 1 |
| G50 | the broker's exec cap is far above | the broker hands the actions this cap: MAX_CONCURRENT_EXECS slots and then undefined, and a release makes r... | 1 |
| G51 | the broker hands the actions a slot function that never grants | the broker hands the actions this cap: MAX_CONCURRENT_EXECS slots and then undefined, and a release makes r... | 2 |
| G52 | the dialog is counted after it is answered, not when it is shown | prompted is called once, with the question and its door, BEFORE the dialog is shown | 3 |
| G53 | `grantLimits.ts` carries `expiredMessage` again | grantWords loads with no editor at all, and grantLimits no longer carries the sentence | 1 |
| G54 | `stopped` is not asked of a live client (the wall never speaks before an Allow) | S10: scope narrowed while the modal is open — the call is refused with the route's own sentence, byte for b... | 3 |
| G55 | the expiry sentence for a call cap says idle | S14: with a limit of one call, the first bridged call runs and the second says the token ran out — the toke... | 3 |

### Not verified, and a note for the next epoch

- The cap of 64 files prunes by `at`, which a clock stepped back makes unreliable for ordering; the file just written is never pruned.
- **Revision numbers repeat after a `forget`.** A.2 item 1 says an absent file is revision 0, so a scope that is forgotten (Close) and opened again
  (a new pick: `set` expecting 0) is at revision 1 once more, and a window that still holds a copy at revision 1 from before the Close would
  be accepted by `set`. S25 pins what the spec asks (a stale copy is refused while the file is GONE); the ABA after the file is back is not
  covered and is not covered by the design. It needs that window's picker to stay open across a Close and an Open made in another window.
  A generation (a random id written at the first `set`, handed back with the revision) would close it; left for the owner, since it changes
  the shape of `Scope` that E2's picker reads.
- `fs.rename` over a `.json` another window is reading: as A.9. The retry is covered by a patched `fs.promises.rename`, not by Windows.
- E2.2 must build `writes` as `new LeasedQueue(new WindowLock(path.join(globalStorageUri, SCOPES_LOCK_DIR), nodeLockFs()))`, call
  `scopes.forget` and the broker's `ceilings.forget(bridgeId)` (private today; E2 needs a method or the tests' cast) on Close, and wire
  `listEntriesOf`, `visibleConfigOf` and `entryRefusal` from `accountOnlyVault(storage, accountId)` and `details.agentForward`.


## S3.14 — As built, Amendment 2 (Sonnet, 2026-11-05)

B.1-B.6 and B.8, built in the order of B.12. B.7 is E1.4's and was not built. `credsAgentServer.ts` is **789** lines (B.9's count, to the
line), `extension.ts` 1003 and unchanged, `.claude/rules/shared` not bumped, R3 of the first epoch (`bridgeBoundary.r3.json`) untouched and green.
Nothing in the spec changes what an agent on a bridge can reach. Where it was wrong or silent, below.

### Differences from B.1-B.12

1. **R7 cannot be caught through the broker; the unit tests catch it.** B.11 names P3 (second half) and P2 for "`released(held)` without the
   holding id". Neither can: between an admission and its dialog there is no `await` (mint, `usable`, `summarize` and `consent` are one synchronous
   run), so a stale release cannot arrive while the new holder has no dialog on screen, and once it has, the `dialog` flag keeps the place whatever
   the id. The catcher is `aliasThrottle.test.ts` ("the holdings of one place are distinct, and a stale release cannot free a later holder", "a slot
   released twice frees the place once"). P2 and P3 pin what they can (a long action frees nothing of another call's open dialog; a late click frees
   nothing of the next dialog's place).
2. **P3's "late click on the first -> `ignored`" does not happen.** `withTimeout` has already settled with `undefined` at the timeout, so the click
   is read by nobody and writes no line. P3 asserts what matters: the click decides nothing (no `ALLOWED` line) and frees nothing of the second
   dialog's place.
3. **`-A` wins over `-o ForwardAgent=no`, in either order** (OpenSSH 10.2, `ssh -F <Host * / ForwardAgent yes> -G`: `-A -o ForwardAgent=no` and `-o
   ForwardAgent=no -A` both report `forwardagent yes`; `-A` assigns the option unconditionally). B.3's "the option wins over the composer too" is
   therefore false. It moves nothing on a bridge (an entry with `agentForward` is refused by the wall and again by the action, so no bridged argv
   has `-A`), but a flag named `noAgentForward` that forwards when the entry says so is a trap, so `buildSshExecArgv` hands the composer the entry
   with `agentForward` off when it is set (pinned: "with noAgentForward an entry that forwards the agent gets no -A either"). Position: the option
   is pushed right after the composer's block, as specified.
4. **The live check of B.3 could not be observed here.** There is no `sshd` on this machine. It is section 8 of `scripts/ssh-agent-itest.cjs`
   (in `scripts/itestForwardAgent.cjs`, so that script stays at 767 lines): a real `ssh-agent`, `Host * / ForwardAgent yes` through `-F`, the
   production `buildSshExecArgv`, `printenv SSH_AUTH_SOCK` on a real `sshd -d`, once without the option (must be non-empty: the control) and once with
   it (must be empty). It skips without sshd and **fails under `CI=true` without it**. What was observed: the config-level precedence
   (`ssh -G`, above) and the pieces (the agent starts, the argv is the production one). The run on a runner with sshd is unobserved, and so is M8.
5. **`OneInFlight` has a `holder()`, and `TokenlessCeilings` closes the holding `prompted` marked** (a field `open`), not "the current one": a
   second or late `dialogClosed` then names a holding that no longer has the place and frees nothing of the next holder. The id check inside
   `OneInFlight` is what protects; the `open` field only says which holding a close is for. `Holding` is exported.
6. **The asking window is stamped on every refusal for a count, both the asking ceiling and the dialog budget**, and not on `busy` (which did
   nothing and writes no line). The journal line is written for the asking and silent ceilings only; the dialog budget's refusal stays unwritten
   ("a refused PROMPT is answered but never written down" is unchanged).
7. **`SlidingWindow` keeps its newest `max` stamps only** (not in B.1). With refusals stamped, a flood would otherwise grow the array, and
   the cost of pruning it, with the request rate. A window is full exactly when its `max`-th newest stamp is inside it, so nothing it decides
   changes ("a refusal flood keeps the window's memory bounded", `stored()`).
8. **The journal line's door is the refusal's** (`Admission.refusal.via`: `mcp` for the silent ceiling, none for an asking call), not
   `prompts ? undefined : 'mcp'` at `admitAliasCall`, which lifted that method over the complexity rule. The server line is still the same
   line, with 0 added.
9. **`drop` is in both branches of `usable`** (`not_supported` and the validation/reference refusal), as B.9 counts (+2). A1 has a test for each.
10. **`collideVault` is exported from `bridgeWallWorld.ts`** for W1. `ww.texts.current` still edits the stored line, now by writing `e1`'s
    `command` and `commandArgs` in the vault, which the production `storedTexts` reads back. The `entryRefusal: 'none'` option remains as a
    wrapper that answers nothing (L4's second leg); the other three suppliers are only spied. W1 has more tests than B.10 names: the world's
    four answer what `wallSuppliersOf` answers, a difference planted in `wallSuppliersOf` reaches the world's wall for each of the four
    (R11), and `storedTexts` per account.
11. **Existing tests that changed, and why.** `OneInFlight` takes `Holding`s (`hold`/`released`), so its two unit tests and the `dialog`/
    `bridgeDialog` helpers of `aliasThrottle.test.ts` now close the dialog; revisions are strings, so every numeric revision in `bridgeScope.test.ts`/
    `bridgeStore.test.ts` is `NO_SCOPE` or what `set` answered (and malformed-file cases for `NO_SCOPE`, an empty string and a number were added);
    `put` in `bridgeModules.ts` returns a string. No test was weakened.
12. **R2 through the broker** needed the clock: `A1: a refusal is a call` uses `mock.timers` for `Date` (60 refused at the start, 60 at the middle,
    a call 61 s after the first sixty is still refused). The unit test also catches it.
13. **Three equivalent mutants were found and the code removed**: `this.dialog = false` in `OneInFlight.hold`, `this.open = undefined` in
    `dialogClosed` and the `given` flag in `holding()`. Each was redundant with the holding ids, so no test could fail for it.

### The RED record (each watched failing, for the reason named, before the fix)

- **A4**, `drop` as a no-op stub and the old eviction: `a token whose first dialog is open is not evicted while a call grant exists`
  (`undefined !== 'pending'`); `allowed calls are tier two: an open token is not reached`; `a pending call grant is gone`.
- **`aliasThrottle.test.ts`**, the new API with the old behaviour (14 failed, 35 passed): `the call at 60ms was admitted, not refused`
  (the asking ceiling), `the first holder released late and freed nothing of the second`, `the call is over but its dialog is still up`,
  `another call while the first still runs was refused: Another request is already waiting ...`, `only the newest max stamps can decide ...`.
- **Through the broker, against the old throttle and registry** (10 failed): A1 `{ '400 invalid_request': 300 }` against 60/240 (the alias route the
  same); **A1 (token) `{ '400 invalid_request': 256, '401 unauthorized': 44 }`: the shared token itself was evicted by the 256th mint, which
  is B.1's HIGH**; A2 `the open dialog still decides its call`; A3 `mcp` and `the alias door spends the same sixty as the MCP door`;
  P1 `the second call was not answered busy: it was let in behind the open dialog`; P2 `timed out waiting for the call through the other bridge
  to run (it was told busy while the first action ran)` and `... the second dialog, raised while the first action runs`; T1 `[504, 'consent_timeout',
  'The human did not allow this grant.']` against `[403, 'denied', ...]`. **P3 passed against the old code**, as B.10 says of its first half.
- **V1** (numeric stub `NO_SCOPE = 0`): `the new file does not carry the old copy's revision`.
- **W1**, a `wallSuppliersOf` that answers nothing (5 failed, deep-equal on every supplier).
- **F1**: `a bridged call forwards nothing, whatever ~/.ssh/config says: -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10
  -J hop@jump.example.com -i ... -- deploy@prod.example.com id`; the two `buildSshExecArgv` unit tests likewise.
- **X1**: `the slot came back`.

### Totals

`npm run typecheck`, `lint` (0 problems) and `ratchet` clean; `npm test` 6258 tests, 6254 pass, 0 fail, 4 skipped; `itest:cli` all checks passed;
`itest:ssh-agent` all checks passed (the live-sshd sections, 5, 7 and 8, skip: no sshd here); the .NET build of the solution 0 warnings,
0 errors; `CredsBroker.Tests` 159 of 159; `plan-lifecycle` clean. Line counts: `credsAgentServer.ts` 789, `extension.ts` 1003, `aliasThrottle.ts` 449,
`grantRegistry.ts` 341, `bridgeWallSource.ts` 31, `ssh-agent-itest.cjs` 767.

### Break-its run (each mutation applied to one file, the suite file(s) named run, the file restored and its sha256 compared with the one taken before: all equal)

Every mutation below was caught. A mutant's own type error (an unused variable, say) does not stop `tsc` emitting; the emitted file is what ran. B.11's
R1-R12 are the rows named R*; the G rows are guards of this commit that no R names. Three guards no test caught on the first pass are the equivalent
mutants of item 13 (code removed), and one (`storedTexts` reading account a1 whoever asks) got its test (W1, per account).

| # | Mutation | Test that caught it (first) | Failing |
|---|---|---|---|
| R1 | `askingRefusal` without the asking window | B.1: sixty asking calls a minute per door, calls refused before any dialog included; the sixty-first is refused with its own sentence | 14 |
| R2 | an asking refusal not stamped (stamp only on admission) | B.1: a refusal is a call: refusals stamp the asking window, so a loop does not get a fresh sixty each time the first sixty age out | 2 |
| R5 | `released` frees while a dialog is open | B.2: while a dialog of the holding is on screen the place is the dialog's: the call ending frees nothing | 3 |
| R7 | `released(held)` without the holding id | a slot released twice frees the place once: the second release cannot free the next call's | 4 |
| R7b | `dialogClosed(held)` without the holding id | B.2: a dialog closing frees the place whatever the call does next, and the call ending later frees nothing more | 1 |
| G-dialog-id-prompted | `prompted(held)` marks a dialog for any holding | B.2: a dialog closing frees the place whatever the call does next, and the call ending later frees nothing more | 1 |
| G-ceil-open | `dialogClosed` closes whoever holds, not the holding `prompted` marked | B.2: a local token call holds, stamps and closes nothing | 2 |
| G-door-cond | a local token dialog closing frees a throttled dialog's place | B.2: a local token dialog closing frees nothing of the place a throttled dialog holds | 1 |
| G-prompted-nomark | `prompted` does not make the place the dialog's | B.2: through the coordinator, a call that ends during its dialog frees the place only when the dialog closes | 2 |
| G-holder-undef | `holder()` answers nothing | B.2: holder() names the holding that has the place now, and nothing while it is free | 6 |
| G-stamp-cap | the window keeps every stamp, not its newest `max` | B.1: a refusal flood keeps the window's memory bounded: it stores no more than its cap | 1 |
| G-refusal-keeps-place | an asking refusal leaves the place held | the local door is today's modal budget to the byte: five dialogs, one in flight, those sentences | 17 |
| G-busy-stamps | a `busy` answer is stamped in the asking window | B.1: a refusal for the dialog budget counts too; a busy answer, which did nothing, does not | 1 |
| G-report-asking-off | an asking refusal is not written to the journal | B.1: one journal line per door per window for an asking refusal, as for a silent one; none for busy or the dialog budget | 2 |
| G-report-modal-on | the dialog budget's refusal is written to the journal | a refused PROMPT is answered but never written down, which is unchanged and deliberate | 2 |
| G-asking-sentence | the asking sentence says "prompt" | B.1: sixty asking calls a minute per door, calls refused before any dialog included; the sixty-first is refused with its own sentence | 9 |
| G-asking-who | the asking sentence names the local caller on a bridge | on a bridge the sentences name the bridge, never a caller without a token | 7 |
| G-asking-door | every door shares the local asking window | each door has its own windows: five dialogs on bridge A leave bridge B and the local door untouched | 12 |
| G-ceiling-61 | `ASKING_CEILING` is 61 | B.1: the asking ceiling is the silent ceiling's number | 10 |
| G-idle-asking | a door with only asking stamps is "idle" and forgotten | B.1: a door whose only stamps are asking calls refused before their dialog is not forgotten while they count | 1 |
| G-silent-asking | the silent path is counted in the asking window | release on a silent admission is a no-op: it frees nothing and banks nothing | 2 |
| G-modal-stamp-in-admit | the dialog window is stamped at admission again | the local door is today's modal budget to the byte: five dialogs, one in flight, those sentences | 32 |
| R3 | `drop` deletes any grant | A4: drop deletes a call grant that is still pending, and nothing else | 1 |
| R3-call-any | `drop` deletes any call grant, settled ones too | A4: drop deletes a call grant that is still pending, and nothing else | 1 |
| R4 | `EVICTION_ORDER` as the old three tiers | A4: 300 pending calls evict only calls — every token and tombstone is still there | 3 |
| R4-tombstone-after-open-token | tiers 3 and 4 swapped | A4: each tier of the eviction list is reached only when the ones before it are empty, whatever the insertion order | 1 |
| R4-allowed-call-before-pending | tiers 1 and 2 swapped | A4: each tier of the eviction list is reached only when the ones before it are empty, whatever the insertion order | 1 |
| R4-find-first-defined | `oldestEvictable` picks no victim that exists | and the window still bounds itself — the call grants are what went | 2 |
| G-drop-validation | no `drop` at the validation refusal | A1: 300 refused-before-the-dialog calls through a bridge — 60 are refused for their command, 240 for the count; no grant is left and the jou | 4 |
| G-drop-notsupported | no `drop` at the `not_supported` refusal | A1: an action the entry's kind does not have is refused without leaving a grant either | 1 |
| G-via-always-mcp | every journalled refusal names `via mcp` | B.1: the journal line of a refusal names the MCP door for the silent ceiling and no door for an asking call | 2 |
| G-via-never | the silent ceiling's line names no door | B.1: the journal line of a refusal names the MCP door for the silent ceiling and no door for an asking call | 1 |
| G-via-wiring | the server forces `via: mcp` on the line | A1: 300 refused-before-the-dialog calls through a bridge — 60 are refused for their command, 240 for the count; no grant is left and the jou | 1 |
| R6-wiring | `dialogClosed` not wired in `credsAgentServer` | S26: each bridge has its own five — the sixth through A is refused, a sixth through B is asked, and so is a local call | 12 |
| R9-wiring | the server hands it `() => grant.status` (the snapshot) | T1: a token denied after the bridge looked it up and before its body arrived is refused — no dialog, no minted grant | 1 |
| R9 | `bridgedTokenCall` tests the snapshot | T1: a token denied after the bridge looked it up and before its body arrived is refused — no dialog, no minted grant | 1 |
| R6 | `dialogClosed` not called on the timeout | P3: an unanswered dialog times out, frees the place, and a late click frees nothing of the next dialog's | 1 |
| G-closed-on-click-only-noanswer | `dialogClosed` never called | S26: each bridge has its own five — the sixth through A is refused, a sixth through B is asked, and so is a local call | 12 |
| G-prompted-removed | `prompted` never called | S26: each bridge has its own five — the sixth through A is refused, a sixth through B is asked, and so is a local call | 14 |
| R10 | revision a counter again | V1: forget, set again, and a copy from before the Close is stale — the revision is never reused | 1 |
| G-isRevision-noscope | a file whose revision is `NO_SCOPE` reads as a scope | S17: a malformed file, in any of its parts, is an empty scope at NO_SCOPE with quiet off | 1 |
| G-isRevision-empty | a file with an empty revision reads as a scope | S17: a malformed file, in any of its parts, is an empty scope at NO_SCOPE with quiet off | 1 |
| G-stale-compare | `set` ignores the expected revision | S17: set answers the revision it wrote, a fresh id every time, and a copy at the wrong revision is refused with the one sentence and changes | 6 |
| G-empty-revision | the absent scope's revision is not `NO_SCOPE` | S17: a server with no file has an empty scope at NO_SCOPE that admits nothing and is not quiet | 10 |
| G-W-list-all-accounts | `listEntriesOf` lists every account | W1: listEntriesOf is one account's listing — a1 lists prod and not foreign, which holds the same id in the account searched first | 1 |
| G-W-config-all-accounts | `visibleConfigOf` searches every account | W1: visibleConfigOf is asked of one account: a1's e1 is a1's and a2's is a2's, whichever is searched first | 1 |
| G-W-forward-never | `entryRefusal` never refuses | W1: entryRefusal refuses an entry that forwards the agent with the sentence, and nothing else | 2 |
| G-W-texts-wrong-account | `storedTexts` reads account a1 whoever asks | W1: storedTexts reads the entity of the account it is asked about, not another account's of the same id | 1 |
| R11-texts | the wall world defines `storedTexts` itself | W1: the wall world's four suppliers answer what wallSuppliersOf answers over the world's own vault | 2 |
| R11-list | ... `listEntriesOf` | W1: the wall world's four suppliers answer what wallSuppliersOf answers over the world's own vault | 1 |
| R11-config | ... `visibleConfigOf` | W1: the wall world's four suppliers answer what wallSuppliersOf answers over the world's own vault | 1 |
| R11-refusal | ... `entryRefusal` | W1: the wall world's four suppliers answer what wallSuppliersOf answers over the world's own vault | 2 |
| R8-not-pushed | `-o ForwardAgent=no` not pushed | F1: through a bridge the argv says -o ForwardAgent=no, after the composer's jump; off a bridge it does not | 3 |
| R8-before-composer | pushed before `sshOptionArgv` | F1: through a bridge the argv says -o ForwardAgent=no, after the composer's jump; off a bridge it does not | 2 |
| G-A-kept | `-A` kept beside `-o ForwardAgent=no` | B.3: with noAgentForward an entry that forwards the agent gets no -A either — ssh lets -A win over -o ForwardAgent=no, in either order | 1 |
| G-noagent-always | `ForwardAgent=no` sent whenever the option is present, even false | F1: through a bridge the argv says -o ForwardAgent=no, after the composer's jump; off a bridge it does not | 3 |
| G-bridged-flag-false | the action never asks for `noAgentForward` | F1: through a bridge the argv says -o ForwardAgent=no, after the composer's jump; off a bridge it does not | 1 |
| G-bridged-flag-always | the action always asks for it, bridged or not | L4: control — on the main port the same entry runs with -A | 3 |
| G-callsite-bridge | the call site passes `false` | F1: through a bridge the argv says -o ForwardAgent=no, after the composer's jump; off a bridge it does not | 1 |
| R12 | `.catch` dropped at `prepareAuth` | X1: a credential read that THROWS gives the slot back and fails the call — it neither leaks nor hangs | 1 |
| R1/integration | R1/integration | A1: 300 refused-before-the-dialog calls through a bridge — 60 are refused for their command, 240 for the count; ... | 5 |
| R2/integration | the same, through the broker with the clock moved | A1: a refusal is a call — sixty refused at the start of a minute and sixty at its middle keep the door closed ... | 1 |
| R5/integration | the same, through the broker | P1: a client that posts and goes away does not free the place its dialog holds — ... | 1 |
| G-refusal-keeps-place/integration | G-refusal-keeps-place/integration | S26: each bridge has its own five — ... | 8 |

### Not verified

- Section 8 of `ssh-agent-itest.cjs` on a runner with `sshd`, and M8 (the Windows OpenSSH 9.5 with `ForwardAgent yes` in the Windows ssh_config).
- That a `Date`-mocked clock in `mock.timers` does not disturb other tests in the same file: the file's other tests passed in the full run, and
  `mock.timers.reset()` is in a `finally`.

### Amendment 3 (Fable, 2026-11-05) — after `5bfedf8` and its review

Ten review items, each checked against the code at `5bfedf8`; every `file:line` below is at that commit. `credsAgentServer.ts` is 789 of 800 and
**stays 789** (every edit to it moves lines, none adds one); `extension.ts` stays at 1003. **Item 2 is a plan change** — the parent plan's
ledger carries it as `3.1` and §4.2's *never the laptop's whole agent* bullet gains its sentence; it is the first change of epoch 3, so the plan goes
on. Items 1, 3–10 bring the code to the plan as written (one fresh connection for a bridged exec, one dialog at a time for one person, a bounded
journal, a registry that never loses a live dialog's grant, a slot that always comes back). Where this amendment differs from B.1–B.12 and from
§S3.14, this amendment wins; nothing above is deleted. Two residual risks are judged at the end (one goes to a todo of its own, named there).
A Sonnet coder builds from this section alone; the order is in C.12.

**What the review had wrong, so it is not built.** Item 7 named a gap at `brokerMcpDoor.ts:370`: there is none — `handleMcpCreate` (`:370-378`) and
`handleMcpDelete` (`:282-291`) open their `try` directly after `admit`, and `minted` runs inside `confirmAndCreate`/`confirmAndDelete`. The gaps are
`handleMcpUse` (`:213-215`), `handleAlias` (`credsAgentServer.ts:338-346`) and `bridgedTokenCall` (`brokerBridgeToken.ts:40-42`). Item 3 named the
VPN and terminal actions as paths a door reaches: a bridge door serves `exec` and `query` only (`bridgeAllowList.ts`, `SERVED_ACTIONS`), so those
two are the LOCAL doors' follow-up prompts; they are covered because the fix is one flag per action, not per door. Item 2's sentence "`sshExecCommand.test.ts`
pins `-L` in a bridged argv" is true (`:122-130`, "and after the port forwards") and that assertion inverts under C.2.

#### C.1 A bridged exec is one fresh connection: no multiplexing (HIGH)

What is true today. `buildSshExecArgv` (`sshExecCommand.ts:100-107`) pushes `-o ForwardAgent=no` on a bridged call and its comment says the agent
"is forwarded only when ForwardAgent is yes". That is false on a multiplexed connection. With `Host *` / `ForwardAgent yes` / `ControlMaster auto` /
`ControlPath …` / `ControlPersist` in the laptop's `~/.ssh/config` — a common stanza — the person's own Connect becomes the master and asks for agent
forwarding on its session; a bridged exec to the same `user@host:port` joins that master as a second session. In OpenSSH's `session.c`,
`auth_sock_name` is a file-level static set once any session of the CONNECTION asks for forwarding, and `do_setup_env` exports `SSH_AUTH_SOCK` to every
later session of that connection whether or not it asked. So the exec's shell has `SSH_AUTH_SOCK`, `ssh-add -l` lists every key the laptop's agent
holds, and the agent signs with them. The mux client also authenticates nothing itself: the pinned key (`-i`), `StrictHostKeyChecking=yes` and the
pinned `UserKnownHostsFile` of `:94-99` are not applied, and even the port it was given is not the one it reaches. Verified by reading the mux code
path (`mux.c`: the new session asks for forwarding only if the mux client wanted it, which with `ForwardAgent=no` it does not — and that is beside the
point, because `session.c` exports the connection's socket to every session once any one of them has asked) and the session code above; measured live in
C.1's itest leg below, not here (no `sshd` on this machine).

The change. One constant, pushed on a bridged call right after the composer's block (where `-o ForwardAgent=no` sits today), carrying C.2's options too:

```ts
// sshExecCommand.ts
/** A bridged call: ONE fresh connection that carries the command and nothing else, whatever the entry or a config file says (Amendment 3, C.1–C.2). */
export interface SshExecOptions { jump?: string; knownHostsFile?: string; bridged?: boolean; }     // `noAgentForward` is renamed: it stops more than the agent
/**
 * The options of a bridged call, in this order. `ForwardAgent=no` alone is not enough: a multiplexed session inherits the master's
 * forwarded agent and authenticates nothing itself, so connection sharing is off (`ControlPath=none` disables it; `ControlMaster=no` is
 * belt and braces). `ClearAllForwardings=yes` drops every port forwarding a config file names; `ForwardX11=no` and `Tunnel=no` the two
 * other channels a config can open. Checked with `ssh -G -F none` on OpenSSH 10.2: controlmaster false, clearallforwardings yes, forwardx11 no,
 * tunnel false, forwardagent no, and no localforward/remoteforward line even with -L and -R on the command line.
 */
export const BRIDGED_SSH_OPTIONS: readonly string[] = ['-o', 'ForwardAgent=no', '-o', 'ControlPath=none', '-o', 'ControlMaster=no', '-o', 'ClearAllForwardings=yes', '-o', 'ForwardX11=no', '-o', 'Tunnel=no'];
// :102  argv.push(...sshOptionArgv(options.bridged === true ? { ...entity, agentForward: false, portForwards: [] } : entity, options.jump));
// :105-107  if (options.bridged === true) { argv.push(...BRIDGED_SSH_OPTIONS); }
// The comment at :100-104 is rewritten: "a bridged call is one fresh connection: the composer gets the entry with its forwards and -A off, and
// BRIDGED_SSH_OPTIONS tells ssh to share no connection and clear what a config file adds; -A would win over ForwardAgent=no in either order (S3.14 item 3)".
// sshUseActions.ts:182-189  connectionArgvOptions(...) → { jump, knownHostsFile, bridged }; :243 unchanged (passes ctx.bridge !== undefined).
```

The first `-o` of an option on the command line wins (ssh_config(5): "the first obtained value will be used"); the composer pushes no `-o`, so the
position after it changes nothing and is kept for F1's sake. `-J` (ProxyJump) is not a forwarding and survives `ClearAllForwardings`; the jump chain
stays as the wall decided (§4.2 *What an entry links to*). `SSH_AUTH_SOCK` in the child's environment is still **not** cleared (B.3's reason: it is how
the in-scope entry may authenticate); what C.1 removes is the server's view of it. The §8 row "`ControlMaster` reuse — per-call until then" is now
enforced rather than assumed.

Itest, `scripts/itestForwardAgent.cjs` (101 lines today; stays under 800). Section 8 keeps legs 1–2 and gains **the mux pair**: two `startSshd` rigs,
A and B (`sshd -d` serves one connection each, which is exactly what the pair needs); the config file reads `Host *\n  ForwardAgent yes\n
ControlMaster auto\n  ControlPath <dir>/mux.sock\n` (a FIXED path, so the mux client joins whatever master holds it, whichever port the argv names —
the sharpest form of the finding); a master `ssh -F cfg -o StrictHostKeyChecking=yes -o UserKnownHostsFile=<A.knownHosts> -i <userKey> -p <A.port>
<user>@127.0.0.1 sleep 30` with the agent in its environment, awaited until `mux.sock` appears (its session asked for forwarding, so `auth_sock_name`
is set on connection A). Leg 3, the control, a hand-written argv — NOT the production one, which after this fix cannot join — `-F cfg -o ForwardAgent=no
-o StrictHostKeyChecking=yes -o UserKnownHostsFile=<B.knownHosts> -i <userKey> -p <B.port> <user>@127.0.0.1 'printenv SSH_AUTH_SOCK SSH_CONNECTION'`:
code 0, a non-empty first line, and a second line ending in A's port — it joined the master, got the socket, and never reached the server it named.
Leg 4, the production argv for an entity on B's port with `bridged: true` under the same `-F cfg`: `code === 1` (printenv's answer for an unset
variable, C.8), `stdout === ''`, and B's `sshd -d` stderr shows the connection (`Accepted publickey`), so the socket was not merely refused. Teardown:
the master by `endChild` (or `ssh -O exit -S mux.sock`), both sshds, the agent, the folder. The file's header comment loses "`-o ForwardAgent=no`
(`buildSshExecArgv`, `noAgentForward`)" and says what the pair shows.

#### C.2 An in-scope entry's forwards are stripped on a bridge (MEDIUM; plan change 3.1)

What is true today. `sshOptionArgv` (`sshOptions.ts:195-200`) renders the entry's `portForwards` as `-L`/`-R` for the exec as for the human terminal,
`buildSshExecArgv` sends them on a bridge, and `entryRefusal` (`bridgeWallSource.ts:24,29-31`) refuses `agentForward` only. An in-scope entry with
`portForwards: [{ kind: 'remote', bindPort: 9000, host: 'intranet.example', hostPort: 443 }]` opens, for the life of the exec, a listener on the server
that the laptop relays to something out of every scope; a `local` one opens the laptop's port to the server's network. `ssh -G` confirms a config
file's `RemoteForward`/`LocalForward`/`DynamicForward` and `ForwardX11 yes` would ride the same call. The strings come from the entry, which a writer of
a shared vault chooses (`sshOptions.ts:13-18`).

The decision, the caller's and judged safe here: **strip, do not refuse.** An exec needs no forward (a forward is a tunnel for a session a person
sits in; the exec runs one command and exits), so nothing a person can do is lost, and the owner has said twice not to refuse what can be made safe.
The composer is handed the entry with `portForwards: []` (C.1's line), and `ClearAllForwardings=yes` in `BRIDGED_SSH_OPTIONS` covers what a config
file adds — both, so the argv stays honest and the config is covered. Off a bridge the argv is byte for byte today's.

**What the agent is told: nothing per call.** The strip is unconditional on a bridge, so there is nothing to decide and nothing to report per request,
and a sentence would disclose the shape of the entry (that it has forwards, to where) to the server. No journal line either. The sentence a person reads
belongs in the help and the README at E4 (the bridge's section: "a bridged command runs on one fresh connection that forwards nothing — not the agent,
not the entry's port forwards"). E2's picker inherits a note for its ssh rows: the entry's forwards do not apply through a bridge.

**Every other road from the entry or a config file, checked.** The entry reaches ssh through `host`/`user`/`port` (validated by `isSafeSshTarget`,
behind `--`), the typed jump chain (`-J`, each hop validated), `portForwards` (now empty) and `agentForward` (now off); `EntityMetadata` holds no
other ssh option string (`types.ts:84-88`), so a vault writer has no field left that reaches ssh's parser. From a config file: dynamic forwards are
cleared with the rest; `Tunnel` is set `no`; `RemoteCommand` with a command-line command makes ssh refuse ("Cannot execute command-line and remote
command") — a failed call, not a road; `ProxyCommand`, `LocalCommand`/`PermitLocalCommand` and `SendEnv` run on the laptop and are the laptop owner's
own words in their own file — the person's choice for every connection they make, not the server's or a vault writer's, and `ProxyCommand=none` would
break the person who needs a bastion to reach the host at all. They stay. `PermitRemoteOpen` only qualifies a `-R` SOCKS forward, which no longer
exists.

Plan edits (this commit): the ledger line `3.1` under epoch 3; §4.2's sentence under *never the laptop's whole agent*; M8 in §7 extended to the whole
option set on Windows, where Win32-OpenSSH is believed to have no `ControlMaster` at all (unverified here; `ssh -G` on the owner's host says whether the
option is known — if it is, the mux leg's finding applies there too).

#### C.3 An Allow keeps the place while the call's own follow-up prompt may be on screen (MEDIUM; a regression of B.2)

What is true today. B.2 moved the one place from the call's `finally` to the dialog's close: `ConsentGate.shown` (`brokerConsent.ts:111-122`) calls
`dialogClosed` in its `finally`, and `OneInFlight.dialogClosed` (`aliasThrottle.ts:181-186`) frees the place. For `exec` that is right (P2). But three
calls raise a prompt of their own AFTER the Allow, and before `5bfedf8` the place was still held then:

| Call (door) | The follow-up prompt | Where |
|---|---|---|
| `create` (local MCP door only; a bridge refuses the route) | the folder's PIN box, `ignoreFocusOut: true`, and the "count taken" modal | `brokerMcpDoor.ts:483` `create.settle` → `pinOnCreate.ts:243-250`, `:259-260` |
| `terminal` (local alias and MCP doors) | a remote window's refusal modal with remedy buttons | `sshUseActions.ts:285-293` `connectEntity` → `sshConnect.ts:426-433` `askAndPick` |
| `up` (local doors) | the launcher's trust modal (`trustPrompt.ts:23`, `{ modal: true }`, 'Run'), the config read's PIN, OpenVPN Connect's question, an install offer | `agentUseActions.ts:396` `vpnAction('up')` → `vpnLauncherRun.ts:51-52`, `vpnRun.ts:61` |

`down` shows an information message and returns (`vpnLauncherRun.ts:47-50`); `run` and `query` refuse an untrusted line rather than ask
(`agentUseActions.ts:139,211`); `exec`'s `prepareAuth` never prompts (`sshExecAuth.ts:71,108`); `delete` has no prompt. On a bridge, `exec` and
`query` are the only served actions, so no bridged call has a follow-up — the attack is a bridge's call landing on top of a LOCAL call's follow-up:
the person clicks Allow on a local `create`, the place frees, the PIN box opens, a bridge's call (or any door's) is admitted and its modal opens over
the box; the person, mid-PIN, presses Enter, and the modal's default button is the first one, Allow. The invariant E1.4 relies on is untouched: every
`consent` caller on a throttled door admits first and reaches its dialog with no `await`; a silent admission is pre-allowed and raises no dialog;
`prompted` trusts whoever holds the place.

The boundary, weighed against P2. Holding the place to the call's `release` for EVERY Allow would make one 120-second `exec` answer `busy` to every
other door — P2's finding. Holding it for nothing is today's gap. The right boundary is the one the table shows: **the place is kept past the dialog's
close only when THIS call declares that it may put a prompt of its own on screen after the Allow, and then until the call's own `release`**, which for
the three is bounded by the person's own clicks, the step deadline (`create`: 5 minutes from before the modal), and the request's signal (a client that
leaves closes the PIN box and ends the call). A Deny, a timeout and an abandoned dialog free the place at the dialog's close as B.2 built it, because
no follow-up follows them.

```ts
// aliasThrottle.ts — OneInFlight
/** The holding whose call has already ended (`released` while its dialog was up), so a kept place must not outlive it. */
private endedId: number | undefined;
/** The dialog closed. `keep`: the call may show a prompt of its own next, so the place stays its own until `released` — unless the call has already ended. */
dialogClosed(held: Holding, keep: boolean = false): void {
  if (this.owner === held.id) { this.dialog = false; if (!keep || this.endedId === held.id) { this.owner = undefined; } }
}
released(held: Holding): void {                          // as today, plus `this.endedId = held.id` when `this.owner === held.id`
  if (this.owner === held.id) { this.endedId = held.id; if (!this.dialog) { this.owner = undefined; } }
}
// TokenlessCeilings.dialogClosed(grant, via, keep: boolean = false): void   → this.flight.dialogClosed(held, keep) under the same condition as today (:374-379)

// brokerConsent.ts
export interface ConsentQuestion { …; /** The call may show a prompt of its own after an Allow (a PIN box, a trust modal): the place is kept until the call ends. */ readonly followUp?: boolean; }
export interface ConsentGateDeps { …; dialogClosed?(question: ConsentQuestion, keep: boolean): void; }
private async shown(question: ConsentQuestion): Promise<string | undefined> {
  let choice: string | undefined;
  try { choice = await withTimeout(…); return choice; }
  finally { this.deps.dialogClosed?.(question, choice === 'Allow' && question.followUp === true); }   // timeout: choice undefined → freed
}

// useActions.ts — UseAction
/** This action may put a prompt of its own on screen after the person's Allow (a PIN box, a trust modal, a remedy picker). Absent = no. */
readonly asksAfterConsent?: boolean;
// sshUseActions.ts sshTerminalAction: `asksAfterConsent: true`;  agentUseActions.ts vpnAction: `asksAfterConsent: action === 'up'`;  exec, query, run, down, exportEnv: absent.

// brokerMcpDoor.ts:90-96  consent(grant, action, verb, summary, caller, followUp?: boolean): Promise<ConsentOutcome>;
// :478  door.consent(grant, 'create', 'create an entry in', decision.summary, caller, true)     — create always declares it: `settle` may ask
// credsAgentServer.ts:118   dialogClosed: (q, keep) => this.ceilings.dialogClosed(q.grant, q.via, keep)                 (same line, 0)
// credsAgentServer.ts:284-285  consent: (grant, action, verb, summary, caller, followUp) => this.gate.consent({ …, via, followUp }, signal)   (0)
// credsAgentServer.ts:531   …this.gate.consent({ grant, action, verb: useAction.verb, summary, caller: who.caller, via: who.via, followUp: useAction.asksAfterConsent === true }, who.signal)   (0)
```

A click on a defused modal (its requests left): `released` already ran, `endedId` names the holding, and the Allow frees the place at that click as
today. `settle` throwing: `handleMcpCreate`'s `finally` releases; the dialog flag is already down, so the place frees. The `busy` sentence stays true
for a kept place: a request is waiting for the person's answer — to their own PIN box.

#### C.4 The registry never evicts a live dialog's call grant (LOW-MEDIUM)

What is true today. `EVICTION_ORDER`'s first tier (`grantRegistry.ts:60`) is `scope === 'call' && status !== 'allowed'`, which is a pending call —
and after B.1's `drop` the pending calls left in the map are exactly those whose dialog is open (or whose client left/timed out during it). One pending
call then 300 allowed call grants: the pending call is evicted at the 256th mint (`:281-287`) with 256 finished grants kept. A quiet-policy MCP loop at
the silent ceiling (60 a minute) gets there in about 4.3 minutes, inside the dialog's 5. On Allow, `grants.allow` finds nothing, `line(…, 'ALLOWED')`
is written anyway (`brokerConsent.ts:135-139`), `after` reads `unsettled(true)` = allowed, `remember` runs, and `reservedNow` (`brokerCall.ts:171-178`)
refuses `unauthorized`. On Deny the line says DENIED and the caller gets 504. Fails closed, but a person's answer is lost and the journal lies; with
E1.4's quiet bridges one server's loop can do this to another server's dialog.

```ts
const EVICTION_ORDER: ReadonlyArray<(grant: Grant) => boolean> = [
  (g) => g.scope === 'call' && g.status === 'denied',         // a call the person refused: its secret is in no response, it answers nobody
  (g) => g.scope === 'call' && g.status === 'allowed' && g.uses > 0,   // a call that ran (silent MCP use at sixty a minute lands here)
  (g) => g.scope === 'call',                                  // the rest: a dialog open now, an Allow not yet reserved, a call whose client left — oldest first
  (g) => g.status === 'denied',                               // tombstones (already capped at 64)
  (g) => g.scope === 'token' && g.status === 'pending',       // a token whose first dialog is open
  (g) => g.scope === 'token',                                 // the last resort, as before
];
```

Within tier three the oldest goes first, and a dialog lives five minutes, so a call whose client left an hour ago goes before the one on screen. The
doc comment at `:290-298` says why the first two tiers are what they are. A4 changes with it (C.10) and gains a broker scenario (C.9, Q1).

#### C.5 The denied-token check runs inside the slot (LOW-MEDIUM), and an unknown token is answered as one (C.10, LOW)

What is true today. `bridgedTokenCall` (`brokerBridgeToken.ts:31-34`) answers `denied` BEFORE `door.admit` (`:36`): `door.refuse` with a grant writes a
journal line per call, so an agent holding a denied token looping `POST /v1/use/exec` writes one line and queues one append per request with nothing
counting them — B.1's bound of 121 lines a minute is false on this path. And `status()` is `undefined` for a token evicted or expired while its body
arrived (B.4 reads only `denied`): the call goes to a dialog and the person's Allow is then refused at `spentToken` — fails closed, but asks for nothing.

```ts
// brokerBridgeToken.ts
/** A token that cannot be used now: the person said no, or it is gone (evicted, expired) — answered as the main port would, `unknown`. */
function tokenRefusal(status: GrantStatus | undefined): { code: ErrorCode; message: string; logged: boolean } | undefined {
  if (status === 'denied') { return { code: 'denied', message: GRANT_NOT_ALLOWED, logged: true }; }
  return status === undefined ? { code: 'unauthorized', message: UNKNOWN_TOKEN, logged: false } : undefined;
}
export async function bridgedTokenCall(door, res, token, action, body, caller, status): Promise<void> {
  const slot = door.admit(res, true);
  if (slot === undefined) { return; }
  try {
    const refusal = tokenRefusal(status());
    if (refusal !== undefined) { door.refuse(res, refusal.code, refusal.message, refusal.logged ? token : undefined, action, undefined, caller); return; }
    const grant = door.mint(…); door.note(…);          // inside the try: C.7
    await door.perform(res, grant, action, body, caller, undefined);
  } finally { slot.release(); }
}
```

Consequences, said plainly. A denied token's loop is now an asking call like any other (B.1: "a refusal is a call"): sixty a minute answer `denied`
with a line each, the rest `too_many_requests` with one line per window — at most 61 lines a minute on this path. While another dialog is open a denied
token is answered `busy`, not `denied`; it learns `denied` on its next try, and no person is involved either way. An unknown token writes no line
(`respondError` logs nothing without a grant: a probe is legitimate), as on the main port. T1 still holds: no dialog, no `minted` line, 403 `denied`.
No mint on either refusal. Complexity: `tokenRefusal` 3, `bridgedTokenCall` 3.

#### C.6 The key file's removal cannot leak the exec slot (LOW)

What is true today. `sshUseActions.ts:256-261`: `fs.rmSync(prepared.materialized, { force: true })` precedes `release()` in one `finally`; `force`
swallows `ENOENT` only, so an `EPERM`/`EBUSY` (a Windows lock on the key file while `ssh.exe` is still letting go of it) throws out of the `finally`,
leaks one of the eight exec slots (`MAX_CONCURRENT_EXECS`), leaves the key on disk and replaces a finished result with a rejection. `agentUseActions.ts:167-174`
wraps the same call in `try/catch`.

```ts
} finally {
  try { if (prepared.materialized !== undefined) { fs.rmSync(prepared.materialized, { force: true }); } }
  catch (error) { deps.note(`ssh:exec — the key file could not be removed: ${describeError(error)}`); }   // the result stands; the slot comes back below
  finally { release(); }
}
```

What a key left on disk means: `materializePrivateKey` (`keyInstaller.ts:146-158`, called at `sshExecAuth.ts:154`) writes it to the materialised-keys
folder under the person's storage dir, folder 0700, file 0600, locked to the owner, under `<keyEntityId>-<uuid>.key` — per call, so the next call
does not overwrite it, and this spec found no sweep of that folder. The private key of the in-scope entry's linked key stays readable to the person's
own account until they delete it; nothing else gains a read. The note names the path's failure, not the key. The leftover is recorded in the todo of
C.11 so E4 can decide whether a sweep at activation is wanted; it is not built here.

#### C.7 Nothing sits between `admit` and its `try` (LOW)

What is true today. `handleMcpUse` (`brokerMcpDoor.ts:213-215`) runs `callerFrom`, `minted` and `quietly` between `admit` and `try`; `handleAlias`
(`credsAgentServer.ts:338-346`) runs `mint` and `log` there; `bridgedTokenCall` (`brokerBridgeToken.ts:40-42`) `mint` and `note`. A throw from any of them
(a journal append failing is the one that could) leaves the place held with no dialog and no `dialogClosed` to come, so every asking door answers
`busy` until a reload. The fix is to move those lines inside the `try`: 0 lines in each file (the token door's is in C.5's shape). `create` and `delete`
have no gap (see the correction above).

#### C.8 The live check requires printenv's own exit code (LOW, test)

`itestForwardAgent.cjs:88` accepts `bridged.failure === undefined && bridged.stdout === ''`, which an `ssh` that never connected (a misspelt option, a
refused connection, a timeout) also satisfies. Legs 2 and 4 require `bridged.code === 1` — `printenv`'s answer for an unset variable — and leg 4 also
that B's `sshd -d` saw the connection (C.1).

#### C.9 A broker scenario reaches eviction (LOW, test)

B.11's row "R4 → A2, A4" is wrong for A2: with `drop` in place, refused calls leave no grant, so A2 never fills the map and A4 alone catches R4
(§S3.14's table shows exactly that). The row reads `R4 → A4, Q1`, and Q1 (C.10) fills the map through the broker with silent calls, which also pins C.4.

#### C.10 Scenarios (each RED today, and why)

Files: `test/sshExecCommand.test.ts` (F1 revised, F2), `test/bridgeLinks.test.ts` (F1 through the action), `test/aliasThrottle.test.ts` (K7),
`test/bridgePrompts.test.ts` (K1–K6, K8, Q1, D1), `test/grantRegistry.test.ts` (A4 revised), `test/sshUseActions.test.ts` (X2),
`test/bridgeTransitive.test.ts` (T1 kept, T2). `brokerWorld.ts` already has `holdDialogs`, `openDialogs`, `holdSettle`, `hold`, `consentTimeoutMs`; it gains
a way to register an action stub with `asksAfterConsent: true` (K8) and a `never`-policy entry whose calls are silent (Q1; A3's loop may already have one).

| # | Scenario | Expected | RED today, because |
|---|---|---|---|
| F1 | The bridged argv | Through the bridge (`bridgeLinks`) and in the unit test, for an entry with a jump, a `local` and a `remote` forward and `agentForward: true`: the argv has `-J`, no `-A`, no `-L`, no `-R`, then `BRIDGED_SSH_OPTIONS` in order, then `-i`, `--`, the destination; off a bridge the same entry gives `-J -A -L … -R …` and none of the six options (byte for byte today's) | the forwards are sent; only `ForwardAgent=no` is pushed; the B.3 test asserts `-L` present |
| F2 | The flag's name | `{ bridged: false }` and `{}` send nothing of the six; `noAgentForward` no longer compiles | the field is `noAgentForward` |
| K1 | The kept place | Local MCP `create` into a PIN folder with `holdSettle`; Allow; while `settle` waits: a call through a bridge and a local alias call both answer `busy`, `w.dialogs.length === 1`; release `settle`: 200 `created`; the bridge's next call is asked | the place frees at the dialog's close and the second modal opens over the PIN box |
| K2 | Deny frees at once | The same `create`, Deny: the next asking call is admitted before `settle` could have run (`w.settleSignals` stays empty) | green today, pinned |
| K3 | A timeout frees | `consentTimeoutMs: 100`, `create` unanswered: 504, the next call asked | green today, pinned |
| K4 | A client leaving during the PIN step frees | `holdSettle`, Allow, abort the client: an `abandoned` line ("during the folder PIN step"), the next call asked, `w.created` empty | green today (the place was already free); pinned so C.3 does not make it `busy` |
| K5 | P2 unchanged | An Allowed bridged `exec` under `w.hold`: a call through another bridge and a local alias call are both asked | green, pinned (the guard against holding every Allow) |
| K6 | A late Allow on an abandoned `create` frees | `holdDialogs`, `create`, abort the client, then answer Allow: no `ALLOWED` line, the next call asked (the kept place did not outlive the ended call) | would hang the door under a naive "keep on Allow" |
| K7 | `OneInFlight`, unit | `dialogClosed(h, true)` keeps the place and `released(h)` then frees it; `released(h)` then `dialogClosed(h, true)` frees; `dialogClosed(h2, true)` for a holding that lost the place frees nothing; `dialogClosed(h)` (no keep) frees as today | no `keep` |
| K8 | The action's flag | An action stub with `asksAfterConsent: true` held by `w.hold`: a second door's call is `busy` until the action ends; the same stub without the flag: asked (P2) | the flag does not exist |
| Q1 | Eviction through the broker | `holdDialogs`; a bridged `exec` whose dialog is open; then 300 quiet local MCP calls (`never` policy; `mock.timers` on `Date` moves a minute every sixty, as A1 does); answer the dialog Allow: the exec runs (200), one `ALLOWED` line for a grant that exists, no `unauthorized` | the pending call is evicted at the 256th mint: 401 and a false `ALLOWED` line |
| A4 | Tiers, revised | 1 pending call (its dialog open) + 300 allowed calls with `uses: 1` + 2 denied calls + 1 pending token + 1 allowed token + 3 denied tokens: after the mints, the denied calls go first, then used allowed calls, and every token, tombstone and the pending call remain; an allowed call with `uses: 0` outlives a used one | tier one is `status !== 'allowed'` |
| D1 | The denied token's loop | 300 posts with a token the person denied on the main port, through a bridge inside a minute: 60 answer `denied`, 240 `too_many_requests`; the journal grew by ≤ 61 lines; no dialog, no `minted` line; while a dialog of another call is open the same token answers `busy` | 300 `denied`, 300 lines |
| T2 | A token gone between lookup and body | `sendSlow`; evict or expire the token before the body (a `lookup` past `idleMs`, or the registry filled): 401 `unauthorized` with `UNKNOWN_TOKEN`, no dialog, no line | the call is asked and the Allow refused at `spentToken` |
| X2 | The locked key file | `fs.rmSync` mocked to throw `EPERM` for the materialised path: the result is the finished exec's 200, `tally.slotsHeld` is 0, the note names the removal failure, X1 still passes | the finally throws: a rejection, a held slot |

#### C.11 Residual risks, judged

- **A door with nobody at the screen.** One unanswered dialog every five minutes, about a hundred overnight — an agent on a server runs unattended and a
  bridge survives a reboot (§4.7). A click on a dead one writes nothing, and clearing a hundred trains the Allow reflex the modal exists to defeat. The
  remedy is new behaviour (a door refused after N consecutive timeouts, with a backoff that doubles and is reset by any dialog a person answers on any
  door; a recovery with no click when the backoff expires and one probe dialog is admitted; a sentence to the agent naming when the door asks again) and
  so an approach change — the second of epoch 3, which would stop the plan. **It goes to a todo of its own: `todo/PLAN_bridge_dialogs_nobody_answers.md`**,
  written in this commit with the sketch, the recovery and the sentence, to be reviewed as a plan when E1 is merged or when the owner sees the stack.
- **The `busy` sentence tells server A that a person is being asked by another door.** The status itself tells the same bit (admitted or `busy`), and the
  timing is what an attacker would use, so a vaguer sentence changes nothing an agent can do and takes words from an honest agent's operator. **No code
  change**; the reasoning is recorded in the same todo so it is not re-asked.
- The materialised key left by C.6's failure path (no sweep found) is noted in that todo for E4.

#### C.12 Order, line counts, Opus additions, unverified

Order: C.4 (`EVICTION_ORDER`, A4) → C.3 (`aliasThrottle.ts` and `brokerConsent.ts` together, K7, then the doors and `useActions.ts`, K1–K6, K8) → Q1 →
C.5 + C.7 (`brokerBridgeToken.ts`, D1, T2; `brokerMcpDoor.ts`, `credsAgentServer.ts` moves) → C.1 + C.2 (`sshExecCommand.ts`, `sshUseActions.ts`,
F1, F2, then the itest's mux pair, C.8) → C.6 (X2) → lint, `wc -l`, ratchet, the pre-PR block; then E1.4.

| File | Today | After |
|---|---|---|
| `credsAgentServer.ts` | 789 | **789** (`:118`, `:284-285`, `:531` edited in place; `:338-346` moved into the `try`) — E1.4's two bring it to 791 |
| `extension.ts` | 1003 | 1003 |
| `aliasThrottle.ts` | 449 | ≈ 456 |
| `brokerConsent.ts` | 190 | ≈ 196 |
| `brokerBridgeToken.ts` | 48 | ≈ 60 |
| `grantRegistry.ts` | 341 | ≈ 343 |
| `sshExecCommand.ts` | 123 | ≈ 130 |
| `sshUseActions.ts` | 366 | ≈ 372 |
| `itestForwardAgent.cjs` | 101 | ≈ 170 |

Every function stays under the complexity limit of 4 without a new disable comment: `OneInFlight.dialogClosed` 3, `tokenRefusal` 3, `bridgedTokenCall`
3; `buildSshExecArgv` is already exempt. No file nears 800.

Opus checklist, added to §S3.9: `BRIDGED_SSH_OPTIONS` is the one place the six options are spelled and is pushed after the composer, before `-i`; the
composer never sees a bridged entry's forwards or `-A`; off a bridge the argv is byte for byte today's; `keep` is true only for Allow AND `followUp`;
`endedId` makes a kept place die with its call; `asksAfterConsent` is set on `terminal` and `up` and nowhere else, and `create` passes `true` at the
door; `exec`'s question has `followUp: false` (P2); the denied/unknown check is inside the slot and before `mint`; an unknown token logs no line; tier
one of `EVICTION_ORDER` is denied CALLS, and no tier reaches a token while any call grant exists; `release()` is in the innermost `finally`; the mux
control leg is hand-written and the bridged leg is the production argv; `bridged.code === 1` is asserted.

Unverified by this spec: the mux behaviour is read from OpenSSH's `session.c`/`mux.c` and `ssh -G`, and is measured only by the itest's pair on a
runner with `sshd` (and M8 on Windows); that VS Code's modal makes its first button the default on every platform (the attack of C.3 needs it; the fix
is right either way); whether `sshd -d`'s debug stderr says `Accepted publickey` in the runner's OpenSSH (if not, any line proving a connection to B
serves); whether an ssh config's `ControlPath` is honoured by Win32-OpenSSH (M8).

## S3.15 — As built, Amendment 3 (Sonnet, 2026-11-05)

C.1–C.9 built in the order of C.12 (C.4, C.3, Q1, C.5 + C.7, C.1 + C.2, C.6). `credsAgentServer.ts` is **789** lines (C.12's count, to the line:
`:118`, `:284-285` and `:531` edited in place, `handleAlias`'s mint and journal moved into its `try`), `extension.ts` 1003 and unchanged,
`.claude/rules/shared` not bumped, R3 of the first epoch (`bridgeBoundary.r3.json`) untouched and green. The plan's change 3.1, §4.2 and M8 were
already in `d21f911`; this commit changes `research/module_extension.md` for what the code now does. Nothing in the spec changes what an agent on
a bridge can reach beyond what C.1–C.5 say; where it was silent or wrong, below.

### Differences from C.1–C.12

1. **Complexity: `keep` has no default value.** C.3 writes `dialogClosed(held, keep: boolean = false)` and counts the method at 3; ESLint counts a
   default parameter as a branch, so both `OneInFlight.dialogClosed` and `TokenlessCeilings.dialogClosed` came out at 5 against the limit of 4. They
   take `keep?: boolean` and test `keep !== true`; nothing else about them differs.
2. **`removeKeyFile(deps, file)` is a function, not an inline `try/catch/finally`.** `sshExecAction.run` was at 54 lines after C.6's block against a
   limit of 50 (and the function carries a `max-lines-per-function` disable already, which was not widened). The helper catches everything, so the
   `finally` is `removeKeyFile(...); release();` and `release()` still runs last. Same behaviour, same note sentence.
3. **The new broker scenarios are in `bridgeKeptPlace.test.ts`, not `bridgePrompts.test.ts`** (K1–K6, K8, Q1, D1, and a C.7 test). `bridgePrompts.test.ts`
   reached 808 lines with them against the limit of 800. `settleAll` and `answeredAtOnce` moved to `bridgeWallWorld.ts` (exported) so the two files
   share them. `bridgeWallWorld.ts` also gained two options, `asksAfterConsent` (K8: the scripted actions declare the flag) and `quietLocal` (Q1: the
   local MCP door's calls are pre-consented), and `brokerWorld.ts` the first. C.10 says `brokerWorld.ts` gains "a `never`-policy entry whose calls are
   silent": the wall world's real lookup passes no consent stamps, so it never says `preConsented`; `quietLocal` wraps the lookup's answer instead of
   building a policy that the stamp store would have to honour.
4. **T2 evicts the token by filling the registry** (256 more tokens: the real eviction, the oldest pending token is the last resort), not by deleting
   it. Against the old code the call was not "asked and its Allow refused at `spentToken`" but asked and timed out, because the world answers no dialog
   (`allows: 0`): `[504, 'consent_timeout', ...]`. Same cause (the call is asked), a different symptom.
5. **`status()` is `undefined` for an evicted token, not for an expired one.** C.5 says "evicted or expired". The server hands `() => this.grants.get(secret)?.status`;
   `get` does not apply expiry (only `lookup` does, and prunes), so a token that has merely run out of idle time or calls still reads its stored status here,
   goes to the dialog and is refused at the launch gate (`spentToken`) as before. That fails closed and is not new; making it 401 earlier would need `lookup` in the
   status closure, i.e. a decision about spending the idle clock, and is left to the spec. Only the evicted case is built and tested (T2).
6. **C.7 needed a test the spec does not list, and it showed what the gap costs.** A throw from the journal between `admit` and the `try` escapes `handle`,
   which the listener calls as `void this.handle(...)`: the request is never answered (the client hangs until it gives up) and Node sees an unhandled
   rejection, besides the held place. Moving the lines into the `try` gives the place back; it does not answer the request (the `finally` runs and the throw
   continues). The test hangs up on the failed request, sets the runner's `unhandledRejection` handler aside for its length, counts the three throws and asserts the
   next call is asked. A catch at the listener (answer 500, log) is a separate change and is not made here.
7. **Tests beyond C.10's list, each for a guard no listed scenario could reach:** the gate's `keep` argument in `brokerConsentPrompted.test.ts` (Allow with a
   follow-up keeps; Allow without, Deny, dismissal and the timeout free) — the broker cannot tell `keep` on a Deny from `keep` off, because the call ends in the
   same microtask turns as its dialog closes, so only a test of the gate sees it; `asksAfterConsent` on each action (`terminal` and `up` true, `down`, `exec` and the
   other four absent) in `sshUseActions.test.ts` and `agentUseActions.test.ts`; a tier-by-tier case for each new boundary in A4 (a denied call before a call that ran, a call that ran
   before a pending call, before an unreserved Allow, a pending or unreserved call before a tombstone); the denied-token lines counted (60 lines, one per refusal) in D1.
8. **F1 through the action cannot carry `-A` on a bridge** (the wall refuses an entry that forwards the agent, twice, before the argv is built), so the through-the-bridge
   assertion has the jump and both forwards, and the `-A` assertion is the unit test's (`bridged: true` with `agentForward: true`). The off-bridge half of the same
   scenario goes through the main port with an entry that has `agentForward` and both forwards: `-J -A -L … -R …` and none of the six.
9. **K2, K3, K4, K5, K6 pass against the old code, as C.10 says** (pinned). K4's stub for the PIN step (`holdPinStep`) resolves when the request's signal fires, as the
   real `settle` closes its PIN box on it, so the call ends and its place comes back through `release`, not through the abort itself.
10. **The itest.** `sshdIn(rig, name)` gives each sshd a folder of its own (`startSshd` writes `sshd_config`, `known_hosts` and `sshd.pid` there under fixed names, so
    two rigs cannot share one). Leg 2 and leg 4 assert `code === 1` and `stdout === ''` (C.8); the "B saw the connection" test accepts `Accepted publickey` **or**
    `Connection from 127.0.0.1` in B's `sshd -d` stderr, since C.12 leaves the exact line unverified and either proves a connection reached B. The `ssh -G` view of the
    production argv under the mux config was checked on this machine (OpenSSH 10.2): `controlmaster false`, `clearallforwardings yes`, `forwardx11 no`, `tunnel false`,
    `forwardagent no`, no `controlpath` line, no forward lines, with `-A`, a remote forward and the config's `ControlMaster auto` all present.

### The RED record (each watched failing, for the reason named, before the code)

- **A4 (C.4)**, the old three-tier list: `a call that ran before a call whose dialog may be open (pending)` (the id evicted was the pending call's, not the call
  that ran) and `a dialog is open on this call: it is not reached while a call that ran exists` (`undefined` against `'pending'`).
- **K7**, `aliasThrottle.test.ts` with no `keep` (3 of 5 failed; the other two are pinned and passed): `the Allow closed the dialog and the call may ask again: the place is
  still its own`, `the second holder keeps its place on its own Allow`, and through the coordinator `the call at 0ms was admitted, not refused`. Four `TS2554` errors
  (`Expected 1 arguments, but got 2`) came with them; `tsc` emits regardless.
- **K1**, a local `create` Allowed and held at its PIN step: `a call through the bridge was let in over the PIN box: it raised a second modal`.
- **K8**, the flagged action held in `w.hold`: `the second door's call did not answer while the action was running`.
- **Q1**, against the registry of `5bfedf8` (C.4 was built first, as C.12 orders, so `grantRegistry.ts` was put back for this one run): `{"error":{"code":"unauthorized",
  "message":"Unknown or missing grant token."}}`, `[401, 'unauthorized']` against `[200, '']` — the pending call was evicted at the 256th mint.
- **D1**: `{ '403 denied': 300 }` against `{ '403 denied': 60, '429 too_many_requests': 240 }`.
- **T2**: `[504, 'consent_timeout', 'The human did not allow this grant.']` against `[401, 'unauthorized', 'Unknown or missing grant token.']` (the call was asked; see difference 4).
- **F1** through the action: `-L is not sent on a bridge: -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -J hop@jump.example.com -L 8080:db:5432 -R 9000:intranet.example:443 -o ForwardAgent=no -i … -- deploy@prod.example.com id`;
  the unit F1: `-A is not sent on a bridge: -o BatchMode=yes … -J hop@jump.example.com -A -L 8080:db:5432 -R 9000:intranet.example:443 -i /tmp/k.key -- deploy@example.com id`;
  C.1: `sshExecCommand_1.BRIDGED_SSH_OPTIONS is not iterable`; the two-authentication-branch case failed on `key` (nothing of the six was sent).
- **X2**: the action rejected with `Error: EPERM: operation not permitted, unlink '/tmp/creds-use-…/k1-….key'` instead of answering the finished exec's 200.
- **F2** can only fail by not compiling (`noAgentForward` was the field); at runtime it passes against the old code. **Passed against the old code, as C.10 says:** K2, K3, K4, K5, K6 (pinned), and K7's "a call that ended during its dialog frees the place" and "`dialogClosed(held)` frees as before".
- **C.7** has no scenario in C.10; its test is shown by the three `C7-*` mutations below (moving the lines back out of the `try`).

### Totals

`npm run typecheck`, `lint` (0 problems) and `ratchet` clean; `npm test` 6283 tests, 6279 pass, 0 fail, 4 skipped; `itest:cli` all checks passed; `itest:ssh-agent` all checks passed (the live-sshd
sections, 5, 7 and 8, skip: no sshd here); the .NET build of the solution 0 warnings, 0 errors; `CredsBroker.Tests` 159 of 159; `plan-lifecycle` clean. Line counts: `credsAgentServer.ts` 789,
`extension.ts` 1003, `aliasThrottle.ts` 460, `brokerConsent.ts` 196, `brokerBridgeToken.ts` 63, `grantRegistry.ts` 344, `sshExecCommand.ts` 140, `sshUseActions.ts` 380, `brokerMcpDoor.ts` 519,
`itestForwardAgent.cjs` 194, `ssh-agent-itest.cjs` 768, `bridgeKeptPlace.test.ts` 356, `bridgePrompts.test.ts` 457.

### Break-its run (each mutation applied to one source file, the suite files named run in order with `--test-concurrency=1`, the file restored and its sha256 compared with the one taken before: all 44 equal)

Every mutation was caught. "First" is the first failure the runner printed. The mux pair and the other itest legs cannot be mutated here (no `sshd`).

| # | Mutation | First catching test | Failing |
|---|---|---|---|
| C4-tier1-old | EVICTION tier 1 is `status !== allowed` again (a pending call goes first) | Q1: 300 quiet local MCP calls while a bridged exec's dialog is open do not evict its grant — the Allow runs the exec, with one ALLOWED line | 3 |
| C4-tier2-no-uses | tier 2 without `uses > 0` (an Allow not yet reserved goes with the calls that ran) | A4: each tier of the eviction list is reached only when the ones before it are empty, whatever the insertion order | 2 |
| C4-tier2-uses-gt1 | tier 2 requires `uses > 1` | Q1: 300 quiet local MCP calls while a bridged exec's dialog is open do not evict its grant — the Allow runs the exec, with one ALLOWED line | 3 |
| C4-tier3-removed | tier 3 (any other call) removed: a pending call outlives nothing but tokens | a shared token survives sustained SILENT mcp use, which mints allowed grants | 5 |
| C3-keep-ignored | `OneInFlight.dialogClosed` ignores `keep` (frees at the close) | K7: dialogClosed(held, true) keeps the place until the call ends; released then frees it | 5 |
| C3-no-ended | a kept place is not ended with its call (`endedId` not consulted) | K7: a call that ended during its dialog frees the place when the dialog closes, keep or not | 2 |
| C3-ended-not-set | `released` does not record that the call ended | K7: a call that ended during its dialog frees the place when the dialog closes, keep or not | 2 |
| C3-keep-always | `dialogClosed` keeps whatever `keep` says | B.2: a dialog closing frees the place whatever the call does next, and the call ending later frees nothing more | 6 |
| C3-coordinator-drops-keep | `TokenlessCeilings.dialogClosed` does not hand `keep` on | K7: through the coordinator, keep holds the place across the close until the slot is released | 3 |
| C3-keep-any-choice | the gate keeps the place for any close of a question with a follow-up (Deny and timeout too) | K7: dialogClosed is told to keep the place for an Allow of a call that declares a follow-up, and for nothing else | 2 |
| C3-keep-without-followup | the gate keeps the place for every Allow | K5: an Allowed exec does not keep the place (P2 is untouched) — while it runs, a call through another bridge and a local MCP call are both asked | 3 |
| C3-keep-never | the gate never keeps | K1: a local create that is Allowed keeps the place while its PIN box may be up — a bridge and a local alias call are busy until it ends | 3 |
| C3-wire-keep | the server drops `keep` between the gate and the ceilings | K1: a local create that is Allowed keeps the place while its PIN box may be up — a bridge and a local alias call are busy until it ends | 2 |
| C3-wire-door-followup | the MCP door's `consent` drops `followUp` | K1: a local create that is Allowed keeps the place while its PIN box may be up — a bridge and a local alias call are busy until it ends | 1 |
| C3-wire-perform-false | `perform` never declares a follow-up | K8: an action that declares asksAfterConsent keeps the place until it ends — a second door is busy, and asked once the action is over | 1 |
| C3-wire-perform-true | `perform` always declares a follow-up | K5: an Allowed exec does not keep the place (P2 is untouched) — while it runs, a call through another bridge and a local MCP call are both asked | 4 |
| C3-create-no-followup | `create` does not declare a follow-up at the door | K1: a local create that is Allowed keeps the place while its PIN box may be up — a bridge and a local alias call are busy until it ends | 1 |
| C7-mcp-use-out-of-try | `handleMcpUse` mints and journals between `admit` and `try` again | C.7: a journal append that throws right after admission gives the place back — on the alias, MCP and token doors | 1 |
| C7-alias-out-of-try | `handleAlias` mints and journals between `admit` and `try` again | C.7: a journal append that throws right after admission gives the place back — on the alias, MCP and token doors | 1 |
| C5-denied-before-admit | the token's denied/unknown check back before `admit` (outside the slot) | D1: 300 posts with a token the person denied, through a bridge — 60 answer denied, 240 too many; a bounded journal, no dialog, no minted line; busy while another dialog is open | 1 |
| C5-unknown-passes | a token that is gone is not refused (only `denied` is) | T2: a token evicted after the bridge looked it up and before its body arrived is answered 401 unknown — no dialog, no line, nothing ran | 1 |
| C5-unknown-logged | an unknown token writes a journal line | T2: a token evicted after the bridge looked it up and before its body arrived is answered 401 unknown — no dialog, no line, nothing ran | 1 |
| C5-denied-not-logged | a denied token writes no line | D1: 300 posts with a token the person denied, through a bridge — 60 answer denied, 240 too many; a bounded journal, no dialog, no minted line; busy while another dialog is open | 1 |
| C5-unknown-as-denied | a gone token is answered `denied` (403) as a tombstone | T2: a token evicted after the bridge looked it up and before its body arrived is answered 401 unknown — no dialog, no line, nothing ran | 1 |
| C7-token-mint-out-of-try | `bridgedTokenCall` mints and journals outside the `try` (before it, after the check) | C.7: a journal append that throws right after admission gives the place back — on the alias, MCP and token doors | 1 |
| C1-drop-ForwardAgent | `ForwardAgent=no` missing from BRIDGED_SSH_OPTIONS | F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards and none of the six | 4 |
| C1-drop-ControlPath | `ControlPath=none` missing from BRIDGED_SSH_OPTIONS | F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards and none of the six | 4 |
| C1-drop-ControlMaster | `ControlMaster=no` missing from BRIDGED_SSH_OPTIONS | F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards and none of the six | 4 |
| C1-drop-ClearAllForwardings | `ClearAllForwardings=yes` missing from BRIDGED_SSH_OPTIONS | F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards and none of the six | 4 |
| C1-drop-ForwardX11 | `ForwardX11=no` missing from BRIDGED_SSH_OPTIONS | F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards and none of the six | 4 |
| C1-drop-Tunnel | `Tunnel=no` missing from BRIDGED_SSH_OPTIONS | F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards and none of the six | 4 |
| C2-forwards-kept | the entry's port forwards are not stripped on a bridge | F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards and none of the six | 2 |
| C2-agent-kept | the entry's `-A` is not removed on a bridge | F1: a bridged argv keeps the jump, forwards nothing, then the six options, then the key and the destination | 1 |
| C1-before-composer | BRIDGED_SSH_OPTIONS pushed before the composer's options | F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards and none of the six | 2 |
| C1-after-key | BRIDGED_SSH_OPTIONS pushed after the key, not before it | F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards and none of the six | 2 |
| C1-flag-always | every call is treated as bridged | L4: control — on the main port the same entry runs with -A | 5 |
| C1-action-never-bridged | the action never asks for the bridged argv | F1: through a bridge the argv has the jump, no -A -L -R, then the six options in order; off a bridge it has the forwards and none of the six | 1 |
| C1-action-always-bridged | the action always asks for the bridged argv | L4: control — on the main port the same entry runs with -A | 3 |
| C6-no-catch | `removeKeyFile` lets the failure out | X2: a key file that cannot be removed (a Windows lock) still gives the slot back, keeps the finished result and says so in the journal | 1 |
| C6-no-note | the removal failure is swallowed without a note | X2: a key file that cannot be removed (a Windows lock) still gives the slot back, keeps the finished result and says so in the journal | 1 |
| C6-no-release | the slot is not released in the `finally` | X2: a key file that cannot be removed (a Windows lock) still gives the slot back, keeps the finished result and says so in the journal | 2 |
| C3-terminal-flag-off | `terminal` does not declare `asksAfterConsent` | C.3: asksAfterConsent is set on the terminal action (a remote window's refusal modal can follow the Allow) and not on exec | 1 |
| C3-vpn-flag-always | `vpnAction` declares the follow-up for `down` too | C.3: asksAfterConsent is set on the VPN start and on no other action of this module — the launcher's trust modal, a PIN and an install offer can follow the Allow | 1 |
| C3-vpn-flag-never | `vpnAction` never declares it | C.3: asksAfterConsent is set on the VPN start and on no other action of this module — the launcher's trust modal, a PIN and an install offer can follow the Allow | 1 |

### Not verified

- **Section 8 of `ssh-agent-itest.cjs`, in full, on a runner with `sshd`.** There is no `sshd` on this machine (`/usr/sbin/sshd` is missing), so legs 1–4 and the mux pair were not run; the script's
  syntax was checked (`node --check`) and its skip path ran. What was observed is the client side: `ssh -G -F <Host * / ForwardAgent yes / ControlMaster auto / ControlPath …>` on the production
  bridged argv (OpenSSH 10.2) reports no multiplexing, `clearallforwardings yes`, `forwardx11 no`, `tunnel false`, `forwardagent no`, and no forward lines for an entry with `-A` and a remote forward.
  The join itself (`session.c` exporting the master's socket to a second session; `printenv SSH_CONNECTION` ending in A's port), the exit code 1 of `printenv` through `ssh`, and `Accepted publickey` /
  `Connection from 127.0.0.1` in `sshd -d`'s stderr are C.12's unverified list and stay unverified. M8 (Windows) likewise.
- **That VS Code's modal makes its first button the default on every platform** (the attack of C.3 needs it; the fix is right either way).
- **Whether the escaped throw of difference 6 is worth a catch at the listener** — not decided here.
- **The `ControlPath` semantics of Win32-OpenSSH**, as C.12 says.

### Amendment 4 (Fable, 2026-11-05) — after `235a5e4` and its review

Ten review items, each checked against the code at `235a5e4`; every `file:line` below is at that commit. E1.4 (the S4 spec, §S4.10 item 5) is
coded before this amendment, on the tree `235a5e4` leaves: this amendment is coded on the tree E1.4 leaves, so `credsAgentServer.ts` is read as
**791** here and comes out at **792** (one added line, D.3; every other edit to it is in place). `extension.ts` stays at 1003. Where this
amendment differs from C.1–C.12 and from §S3.15, this amendment wins; nothing above is deleted. **Items 1 and 4 are judged here as bringing the
code to the plan as written** (owner decision 2, "No plaintext secret reaches the server. A password is used without being seen", and §4.2's
change-3.1 sentence, "one fresh connection that carries the command and nothing else, so an exec cannot join the person's own multiplexed
session"); the ledger decision is the plan's, not this section's, and is not written here. A Sonnet coder builds from this section alone; the
order is in D.12.

**What the review had wrong or over-built, so it is not built that way.** (a) Item 4's fix as a file *created and removed per call*: the
file's content does not depend on the entry or the call, so it is ONE static file in the materialised-keys folder, written like the askpass
script (`keyInstaller.ts:193-200`), never removed per call, and nothing is added to the "start of `run` to the spawn" gap §4.2 accepts. (b) Item
1's alternative, filtering in the askpass script by prompt text: agreed that it is spoofable (a keyboard-interactive prompt is the server's
text), so it is not built; the hop is denied password and keyboard-interactive authentication at the client, which no server text can undo.
(c) Item 10's runtime guard `followUp && grant.bridge === undefined`: not built. If a later story served, on a bridge, an action that really
asks after the Allow, the guard would silently reopen the C.3 gap for it; what E3 needs is to be *made to decide*, so a static test pins the
fact instead (D.10). (d) Item 3's token door: named as a residual, not built (D.3 says why). (e) Item 2's bound: confirmed, built as the
reviewer proposed, with the bound also covering D.3's new holder. Items 5–9 are confirmed as reported.

#### D.1 The jump hop never sees the entry's password, and D.4 the hop leg shares no connection (MEDIUM, pre-existing; one fix)

What is true today, measured on OpenSSH 10.2 here with `ssh -v` and `ssh -G` against loopback addresses that refuse the connection (no
sshd on this machine; nothing was run against any real host). `-J` makes ssh spawn a *nested* ssh for the hop, and that nested process is
given `-l <user> -p <port> [-F <file>] -v -W '[%h]:%p' <hop>` and **nothing else** (`ssh -v` prints the exact line as "Setting implicit
ProxyCommand from ProxyJump"). So none of the outer's `-o` options reach it: not `NumberOfPasswordPrompts=1`, not
`StrictHostKeyChecking=accept-new`, not `BatchMode=yes`, not one of `BRIDGED_SSH_OPTIONS`. What the hop leg DOES get is the environment,
because it is a child process: `SSH_ASKPASS`, `SSH_ASKPASS_REQUIRE=force` and `CREDS_SSH_PASSWORD` (`sshAskpass.ts:30-46`, set by
`byPassword`, `sshExecAuth.ts:88-97`), and the askpass script prints that variable for *any* prompt (`sshAskpass.ts:22-27`). `ssh -G` of the
nested command under a config with `ControlMaster auto` / `ControlPath` / `ControlPersist 600` / `ForwardAgent yes` reports exactly those,
with `batchmode no`, `passwordauthentication yes`, `kbdinteractiveauthentication yes`, `numberofpasswordprompts 3`. Two consequences:

1. **Item 1.** Entry D authenticates by password and has `jumpHostEntityId` J; bridged `exec` on D is Allowed. If J refuses the laptop
   agent's keys and offers password or keyboard-interactive authentication, the nested ssh answers with D's password: J receives D's plaintext.
   J is whatever the entry's chain names — possibly a host an agent on the server controls, possibly S itself. Decision 2 is broken, and
   §4.2 ("the jump chain is part of using the entry") says nothing about askpass. Pre-existing: the same happens off a bridge, on the local
   exec path and on the person's own Connect (`sshConnect.ts` composes the same env and `-J`); that part is **out of this plan's scope**
   (§8's "found on the way" row) and is recorded in `todo/PLAN_askpass_answers_the_hop.md` (this commit), not built here.
2. **Item 4.** "One fresh connection" (C.1) is true for the outer leg only. With a fixed `ControlPath` in the person's config the hop leg joins
   whatever master holds that path, whichever host or port it was given, so the destination's TCP arrives from a host the entry does not
   name; with `ControlPersist` the hop leg can itself become a master that outlives the exec. A `ProxyJump` the person's config supplies
   behaves the same (measured: that nested ssh is spawned with the same shape). `ForwardAgent yes` on the hop leg forwards nothing — `-W`
   opens no session (`sessiontype none`, `clearallforwardings yes` are implied by `-W`, measured) — so the agent is not the exposure here;
   the join, the route and the master are.

The decision, weighed. *Refuse bridged + password + jump:* cheap and honest, but it refuses what can be made safe (the owner, twice), and it
leaves item 4 untouched for key-authenticated entries. *An explicit `ProxyCommand` built here:* the roadmap keeps `ProxyCommand` out
(`sshOptions.ts:156-162`, "A typed reference, never a `ProxyCommand`"), it runs through a shell, and it does not reach a config-supplied
`ProxyJump`. *A generated `-F` file:* ssh hands `-F` to every nested ssh it spawns (measured, for `-J` and for a config `ProxyJump`), "the
first obtained value will be used" (ssh_config(5)) so a `Host *` block at the top of the file binds the hop leg, and the outer's command-line
`-o` options are read before any file so they bind the outer. **The file it is.** Measured with `ssh -G` (OpenSSH 10.2):

- the nested command under the file: `batchmode yes`, `passwordauthentication no`, `kbdinteractiveauthentication no`, `controlmaster
  false`, no `controlpath` line, `forwardagent no`, `clearallforwardings yes`, `forwardx11 no`, `tunnel false` — while the person's own
  `ControlPersist`, `IdentityFile` and `SendEnv` lines, reached through `Include`, are still reported, so their config still applies where it
  does not contradict the block;
- the outer askpass call under the file plus `BRIDGED_ASKPASS_OPTIONS` (below): `batchmode no`, `passwordauthentication yes`,
  `kbdinteractiveauthentication yes`, `numberofpasswordprompts 1`, `stricthostkeychecking accept-new`, `controlmaster false`;
- the outer key call under the file: `batchmode yes`, `passwordauthentication no`, `kbdinteractiveauthentication no`, `stricthostkeychecking
  true` with the pinned file, `controlmaster false`;
- an `Include` of a file that does not exist is silently nothing; the layout with and without a `Match all` line before the `Include`s gives
  identical `-G` output (the `Match all` is kept: it says in the file that the includes are unconditional).

```ts
// sshExecCommand.ts (pure)
export interface SshExecOptions { jump?: string; knownHostsFile?: string; bridged?: boolean; /** The `-F` file of a bridged call (D.1); a bridged call without one is refused (`undefined`). */ configFile?: string; }
/**
 * The ssh_config a bridged call is run under (`-F`), so the options reach the HOP legs too: `-J` spawns a nested ssh with `-l`, `-p`, `-F`
 * and `-W` only, never the outer's `-o`, but it inherits `-F` and the environment (Amendment 4, D.1). The `Host *` block comes first because
 * the first obtained value wins; the person's own files are then included by absolute path, so what they say still applies where it does
 * not contradict the block. The outer overrides what it must on its command line (`BRIDGED_ASKPASS_OPTIONS`). Not a secret: it names no
 * host, user or value.
 */
export function bridgedSshConfig(home: string, platform: NodeJS.Platform, programData: string | undefined): string;
//   lines: 'Host *', then one '  <Keyword> <value>' per entry of BRIDGED_CONFIG_BLOCK, 'Match all',
//   `Include ${join(home, '.ssh', 'config')}`, then on win32 `Include ${join(programData ?? 'C:\\ProgramData', 'ssh', 'ssh_config')}`, else 'Include /etc/ssh/ssh_config'; '\n'-terminated.
export const BRIDGED_CONFIG_BLOCK: ReadonlyArray<readonly [string, string]> = [['BatchMode', 'yes'], ['PasswordAuthentication', 'no'], ['KbdInteractiveAuthentication', 'no'], ['ForwardAgent', 'no'], ['ControlMaster', 'no'], ['ControlPath', 'none'], ['ClearAllForwardings', 'yes'], ['ForwardX11', 'no'], ['Tunnel', 'no']];
/** What the OUTER askpass call says on its command line to win over the file: the destination may take the password, the hop may not. */
export const BRIDGED_ASKPASS_OPTIONS: readonly string[] = ['-o', 'BatchMode=no', '-o', 'PasswordAuthentication=yes', '-o', 'KbdInteractiveAuthentication=yes'];
// buildSshExecArgv: after `argv.push(...BRIDGED_SSH_OPTIONS)` (:122-124) and only when bridged:
//   if (options.configFile === undefined) { return undefined; }           // a bridged call without its file is refused, like an unsafe host
//   if (auth === 'askpass') { argv.push(...BRIDGED_ASKPASS_OPTIONS); }
//   argv.push('-F', options.configFile);
// Order on a bridge: auth block, host-key block, ConnectTimeout, composer (-J), BRIDGED_SSH_OPTIONS, [BRIDGED_ASKPASS_OPTIONS], -F <file>, [-i], [-p], --, destination, command.
// Off a bridge: byte for byte today's (F1's off-bridge half stays as it is).

// keyInstaller.ts
/** The static `-F` file of a bridged call, in the materialised-keys folder (0700) beside the askpass script, mode 0600, rewritten on every call: cheap, and a stale copy cannot survive an upgrade. */
export function writeBridgedSshConfigFile(storageDir: string, platform: NodeJS.Platform, home: string = os.homedir(), programData: string | undefined = process.env.ProgramData): string;   // → <keysDir>/bridged_ssh_config

// sshUseActions.ts connectionArgvOptions(deps, entity, jump, bridged)  (:182-189)
//   return { jump, knownHostsFile: materializeKnownHosts(deps.storageDir, entity), bridged, ...(bridged ? { configFile: writeBridgedSshConfigFile(deps.storageDir, process.platform) } : {}) };
//   A throw from the write lands in run's `try` and is answered by `refuse('internal', …)` — on a bridge the generic sentence, the path in the journal (as `Could not run ssh` is today).
```

What the hop leg can now do: authenticate with the person's agent (`SSH_AUTH_SOCK` is kept, B.3) or with the identity files the person's
own config names, against a host key already in the person's known_hosts (an unknown hop fails: `BatchMode yes` refuses the question, as
today's missing TTY did). What it can no longer do: offer a password or a keyboard-interactive answer (so the askpass script is never asked
on that leg), join or become a control master, or open a forwarding. A hop that only accepts passwords now fails with ssh's own stderr
("Permission denied (password…)" or the like, which may name the hop — the plan's standing decision on stderr) instead of "working" by
sending it the wrong entry's password; nothing a person could do safely is lost. The person's `ProxyCommand`, `LocalCommand`, `SendEnv`,
`IdentityFile` lines keep applying (C.2's reasoning stands: their own words in their own file), now through the `Include`.

**Windows.** Win32-OpenSSH takes `-F`, and `Include` and `Match` exist in the 8.x/9.x base it ships; what is unverified without the owner's
host is whether its `Include` resolves an absolute Windows path written with the OS separator, and whether the system file is read from
`%ProgramData%\ssh\ssh_config` through it. The code does the same on every platform. If the `Include` finds nothing there, the bridged call
runs *without* the person's config — a bastion they rely on is missed and the call fails — which is the safe direction and is said in the
journal by ssh's own stderr. **M8 gains this** (plan §7, this commit): on the owner's Windows host, `ssh -G -F <the written file> -l hop -p 1
-W "[x]:22" 127.0.0.1` reports the nine keywords of the block, and `-G` of the outer with the person's config shows their `IdentityFile`
through the `Include`. Nothing reaches anyone before M8: the switch stays off until E4.

Itest, `scripts/itestForwardAgent.cjs` (194 today; ≈ 265 after, under 800), on a runner with `sshd` (CI). Section 8 gains **the hop pair**,
with `HOME` pointed at a folder of the rig for every client process (so `~/.ssh/known_hosts` and `~/.ssh/config` are the rig's, and the
runner's home is not written: the leftovers rule) and `writeBridgedSshConfigFile(rig.storage, process.platform, rig.home)` writing the
production file:

- **Leg 0, the hop's view (no sshd needed; runs here too):** `ssh -G -F <the written file> -l hop -p 1 -W '[127.0.0.2]:22' 127.0.0.1` reports
  `passwordauthentication no`, `kbdinteractiveauthentication no`, `batchmode yes`, `controlmaster false`, `clearallforwardings yes`; and the
  outer production askpass argv under it reports `passwordauthentication yes`, `batchmode no`, `numberofpasswordprompts 1`.
- **sshd J**, the hop, started with `PubkeyAuthentication no` and `PasswordAuthentication yes` as its FIRST config lines (`startSshd`'s
  `extraConfig` moves ahead of the defaults — sshd keeps the first value too, so appended lines could never have overridden
  `PasswordAuthentication no` at `itestSshd.cjs:84`; section 7's RSA leg, a `+` append, is unaffected by the move); **sshd B**, the
  destination, as today. J's and B's host keys in the rig home's `~/.ssh/known_hosts`. An askpass stub in the rig: `#!/bin/sh`, appends one
  line to `<rig>/askpass.log`, prints `$CREDS_SSH_PASSWORD`; the env of both legs carries `SSH_ASKPASS=<stub>`, `SSH_ASKPASS_REQUIRE=force`,
  `CREDS_SSH_PASSWORD=not-a-real-password`, no agent socket.
- **Leg 5, the control (hand-written, today's shape, NOT the production argv):** `-o NumberOfPasswordPrompts=1 -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile=<B.knownHosts> -o ConnectTimeout=10 -J <user>@127.0.0.1:<J.port> -p <B.port> <user>@127.0.0.1 true`, no `-F`:
  `askpass.log` has at least one line (the hop leg asked our script for the password), and J's `sshd -d` stderr matches `REACHED` (the
  connection arrived). The exit code is not asserted (J cannot check a password as a user-mode sshd; the point is that the script was asked).
- **Leg 6, the production argv** for the same entity with `jumpHostEntityId` resolved to `<user>@127.0.0.1:<J.port>`, `auth: 'askpass'`,
  `bridged: true`, `configFile: <the written file>`: `askpass.log` is empty (nothing on either leg asked for the password: the hop refused
  password and keyboard-interactive at the client, and B's leg never got that far), J's stderr matches `REACHED`, and the exit code is 255.
- Not added: a mux leg for the hop (`sshd -d` serves one connection, so J cannot both hold a master and take the fresh connection the proof
  needs); the hop's `controlmaster false` rests on leg 0's `-G` and on the same mechanism the mux pair measures for the outer.

#### D.2 A kept place is bounded (MEDIUM; a regression of C.3)

What is true today. C.3 keeps the place past the dialog's close for `create`, `terminal` and `up` "until the call's own `release`", and its
bound claim (the step deadline, the client leaving ends the call) is true for `create` only. `up` → `vpnAction` (`agentUseActions.ts:395-418`)
→ `runVpn` → a dependency step whose `executed` (`dependencyRunHost.ts:309-333`) resolves only at the shell execution's end or the terminal's
close (an `ssh -N`, an installer: never, until the person closes the terminal), or `askToContinue` (`:336-339`, a non-modal notification that
resolves at a click), or OpenVPN Connect's import question (`vpnRun.ts:205-208`, the same); `terminal` → `askAndPick` (`sshConnect.ts:426-433`,
modal). A client that leaves does not end these promises (`startGate` is read between steps, not inside one). The notifications slide into
the bell (VS Code's behaviour, not measured here), and every asking door then answers `busy` ("waiting for the person") with nothing on
screen, until a click or a reload. The dialog's own place is bounded by `CONSENT_TIMEOUT_MS` (`brokerConsent.ts:114-128`); the kept place is
bounded by nothing.

```ts
// aliasThrottle.ts — OneInFlight
import { CONSENT_TIMEOUT_MS } from './agentConsent';            // pure; brokerMcpDoor.ts already imports it
/** A place that is nobody's dialog (held and not yet prompted, or kept past an Allow for a follow-up) is given up after this long: the dialog's own bound, so one number. */
export const KEPT_PLACE_MS = CONSENT_TIMEOUT_MS;
private since = 0;                                               // when the place last became a non-dialog holding (hold, or a keeping dialogClosed)
hold(nowMs: number): Holding | undefined {
  if (this.owner !== undefined && (this.dialog || nowMs - this.since < KEPT_PLACE_MS)) { return undefined; }
  … as today, plus this.since = nowMs;                           // a stale owner's later released/dialogClosed names an id that no longer owns: freed nothing (as today)
}
dialogClosed(held: Holding, keep?: boolean, nowMs: number = Date.now()): void {   // when the place is kept: this.since = nowMs
// TokenlessCeilings: admitAsking passes nowMs to hold; dialogClosed(grant, via, keep?, nowMs = Date.now()) hands it on. Complexity: hold 4 (one condition with ||), dialogClosed 4.
```

The `busy` sentence stays true for the five minutes ("waiting for the person to answer" — their own trust modal or notification); after
them the door asks again and the earlier call's prompt, if still up, is one the person can see is older. Scenario K9.

#### D.3 A quiet call that will ask after its Allow takes the place (MEDIUM; the C.3 overlap through a policy)

What is true today. `handleMcpUse` (`brokerMcpDoor.ts:207,211`) admits with `prompts = !read.preConsented`, and a silent admission holds no
place (`aliasThrottle.ts:334-336`). `up` and `terminal` are use-rung verbs (`mcpEntries.ts:404-420`), so a `never` or `every12h` policy
pre-consents them: a quiet local `creds_vpn_up` on an entry with a PIN-protected config or an untrusted launcher opens the PIN box or the trust
modal (`vpnLauncherRun.ts:52,154`; `trustPrompt.ts:23`) with the place free; a bridge's asking call is admitted, its modal lands on top, and
Enter lands on Allow — C.3's attack, reached by a policy instead of a click. Same for a quiet local `terminal`.

```ts
// aliasThrottle.ts — TokenlessCeilings
/** `followUp`: the action may put a prompt of its own on screen (a PIN box, a trust modal). A quiet call with it takes the one place for the call's length, on its silent window; without it, as today. */
admit(prompts: boolean, nowMs: number, door: string = LOCAL_DOOR, followUp: boolean = false): Admission {
  const counts = this.countsOf(door, nowMs);
  if (prompts) { return this.admitAsking(counts, door, nowMs); }
  return followUp ? this.admitSilentPlace(counts, door, nowMs) : this.admitSilent(counts, door, nowMs);
}
/** The place first (busy if held), then the silent window (released again if full): the mirror of admitAsking on the quiet path. */
private admitSilentPlace(counts: DoorCounts, door: string, nowMs: number): Admission {
  const held = this.flight.hold(nowMs);
  if (held === undefined) { return this.refused('busy', door, counts, nowMs); }
  if (counts.silent.admit(nowMs) !== 'allow') { this.flight.released(held); return this.refused('silent', door, counts, nowMs); }
  return this.holding(held);
}
// brokerMcpDoor.ts — BrokerDoor
admit(res: http.ServerResponse, prompts: boolean, followUp?: boolean): Slot | undefined;
/** Whether this action may ask after the Allow (`UseAction.asksAfterConsent`), read before admission so a quiet call can take the place. */
asksAfter(kind: string, action: string): boolean;
// handleMcpUse :211   const slot = door.admit(res, prompts, door.asksAfter(read.target.kind, action));
// credsAgentServer.ts doorFor (:268-290): admit: (res, prompts, followUp) => this.admitAliasCall(res, prompts, view.bridge, followUp),   (in place)
//                                          asksAfter: (kind, action) => this.actions.resolve(kind, action)?.asksAfterConsent === true,     (+1: 791 → 792)
// admitAliasCall(res, prompts, bridge?: BridgeContext, followUp?: boolean) → this.ceilings.admit(prompts, Date.now(), bridge?.bridgeId, followUp)   (in place)
```

What this does to E1.4's invariant ("admit first, no `await` before the dialog, a silent admission is pre-allowed and raises no dialog;
`prompted` trusts whoever holds the place"): a quiet call still raises no dialog, so `prompted` and `dialogClosed` are never called for it,
and the place it took comes back through `slot.release()` → `released(held)` with no dialog up — freed at once, or by D.2's bound. The
invariant is unchanged; what changes is that a silent admission *may hold the place* while its action runs, exactly when the action declares
`asksAfterConsent`. On a bridge nothing changes: the served actions (`exec`, `query`) declare no follow-up, so a quiet bridged call takes no
place and C21's sixty-one quiet calls are untouched. `quietly(door, grant, …, prompts)` keeps reading `prompts`: the grant is pre-consented
and the `allowed without a prompt` line is written as before.

**The local token door, a residual.** A local token call is not throttled at all (`credsAgentServer.ts:495` runs `perform` directly), by a
decision older than this plan ("a caller holding a real token has already been consented once by a human who chose to"). A token `up` or
`terminal` opens its trust modal or remedy picker with the place free, and an asking call timed to it lands on top. Taking the place there
means a token call can be answered `busy`, a new behaviour on the path people actually use, for a window an attacker on a server can only hit
by timing a call to the person's own local agent starting a VPN — the same coincidence the C.3 attack needed before a policy made it
reachable, which D.3 closes. Named here and in `todo/PLAN_bridge_dialogs_nobody_answers.md`'s decided list (this commit); not built.

#### D.4 — in D.1.

#### D.5 Pending calls are the last call tier (LOW-MEDIUM; C.4 was half true)

What is true today. Tier three (`grantRegistry.ts:62`) holds pending calls (a dialog open) together with `allowed && uses === 0` calls, oldest
first. A pre-consented call is `allowed` at mint (`quietly` → `preConsent`, `brokerMcpDoor.ts:244`) and if it is then refused in `usable` —
an invalid body, a reference out of scope — `drop` (`:321-327`) does nothing, because `drop` deletes pending grants only; a client that leaves
before `reservedNow` (`brokerCall.ts:171-181`) leaves the same record. Both are dead and stay `allowed, uses 0` for good. A bridged dialog
opens; a loop of sixty quiet local posts a minute with an empty `command` follows; at the 256th mint tier three's oldest is the dialog's
grant, and C.4's false `ALLOWED` then 401 is back.

```ts
const EVICTION_ORDER: ReadonlyArray<(grant: Grant) => boolean> = [
  (g) => g.scope === 'call' && g.status === 'denied',
  (g) => g.scope === 'call' && g.status === 'allowed' && g.uses > 0,
  (g) => g.scope === 'call' && g.status === 'allowed',   // an Allow not yet reserved: a live one for microseconds, a dead one (refused or abandoned after a pre-consent) for good — oldest first
  (g) => g.scope === 'call',                             // pending: a dialog open now, or a client that left during it — the last call to go
  (g) => g.status === 'denied',
  (g) => g.scope === 'token' && g.status === 'pending',
  (g) => g.scope === 'token',
];
```

The live `allowed, uses 0` window (between the gate's `allow` and `reserve`) is a handful of awaits with no dialog in it; 256 mints cannot
happen inside it. The doc comment at `:291-302` says the fourth tier is pending alone and why. Scenarios Q2 and A4 (revised).

#### D.6 The key file's note cannot cost the slot (LOW)

`removeKeyFile` (`sshUseActions.ts:196-204`) catches the removal and calls `deps.note` in its `catch`; a `note` that throws (a journal append
failing, C.7's own case) escapes before `release()` (`:272-273`). The `finally` becomes `try { removeKeyFile(deps, prepared.materialized); }
finally { release(); }` (+2 in `run`, which carries its `max-lines-per-function` disable already; nothing else moves). Scenario X3.

#### D.7 An expired token is refused before the dialog (LOW; §S3.15 difference 5, decided)

`() => this.grants.get(grant.secret)?.status` (`credsAgentServer.ts:495`) reads the stored status, expiry not applied (`get`, `:179-181`), so
a token whose idle time or call count ran out between the header's `lookup` (`:474`) and the end of the body is asked about and refused at
`spentToken`. `grantExpiry` (`:118-123`) is exported and pure — it prunes nothing and spends nothing, and a denied grant outranks every clock in
it — so no decision about the idle clock is involved:

```ts
// brokerBridgeToken.ts
/** The token's status as a dialog may rely on it: `undefined` once it is gone or has run out (`grantExpiry`, pure: nothing pruned, nothing spent), its stored status otherwise — `denied` before any clock. */
export function tokenStatusNow(registry: Pick<GrantRegistry, 'get'>, secret: string, now: number, limits: GrantLimits): GrantStatus | undefined {
  const grant = registry.get(secret);
  return grant === undefined || grantExpiry(grant, now, limits) !== undefined ? undefined : grant.status;
}
// credsAgentServer.ts:495, in place:  () => tokenStatusNow(this.grants, grant.secret, Date.now(), grantLimits())
```

Answered 401 `unauthorized` with `UNKNOWN_TOKEN`, no line, no dialog — as the main port answers an expired token (`reservationRefused` says
which expiry there; here the bridge says `unknown`, the sentence S3.1 chose for a token that cannot be used). Scenario T3.

#### D.8 A throw inside `handle` answers 500 (LOW; §S3.15 difference 6, decided)

`doors` calls `void this.handle(req, res, bridge)` (`credsAgentServer.ts:697`): a throw anywhere in a handler (`create.make`, `settle`, a
folder `route.run`, a scope read) leaves the request unanswered until the client gives up and raises an unhandled rejection. One line, in place:

```ts
// credsAgentServer.ts:697
(req, res, bridge) => void this.handle(req, res, bridge).catch((error: unknown) => unanswered(res, error, (code, message) => this.respondError(res, code, message), (line) => this.log(line))),
// brokerRequests.ts (pure)
/** A handler threw: answer 500 with the generic sentence if nothing has been sent, and put the reason in the journal — never in the body (a bridge may be the reader). */
export function unanswered(res: http.ServerResponse, error: unknown, respondError: (code: ErrorCode, message: string) => void, log: (line: { grant: string; entityName: string; action: string; outcome: string; detail: string }) => void): void {
  log({ grant: '—', entityName: '', action: 'request', outcome: 'failed', detail: `a handler threw: ${describeError(error)}` });
  if (!res.headersSent) { respondError('internal', INTERNAL_FAILURE); }
}
```

The C.7 test in `bridgeKeptPlace.test.ts:337-349` pinned the defect (`escaped.length === 3`); it changes with the fix: `escaped.length === 0`,
each of the three requests answered 500 `internal` with `INTERNAL_FAILURE` as its message, and the place still given back (the next call
asked). The `unhandledRejection` handler the test sets aside is no longer needed.

#### D.9 The itest reads a client's output after `close` (LOW, test)

`launch` (`itestSshd.cjs:15-36`) resolves `done` at `exit`; `runClient` (`itestForwardAgent.cjs:56-69`) reads `stdout` right after it, and a
chunk can arrive between `exit` and `close`. `launch` gains `closed`, a promise of the `close` event; `runClient` awaits `closed` raced with
2 s after `done` settles (bounded: a grandchild holding the pipe must not hang the leg). Leg 4's command becomes `printenv SSH_AUTH_SOCK
SSH_CONNECTION`: `code === 1` (one variable unset), `stdout` is exactly one line and it ends in B's port — the connection to B is then proven by
B itself, with the `REACHED_B` stderr check kept as it is.

#### D.10 No served bridge action asks after its Allow (LOW, a static test instead of a guard)

A test in `bridgeAllowList.test.ts`: for every action in `SERVED_ACTIONS` and every kind the registry serves it for (`brokerWorld`'s real
registry), `asksAfterConsent` is not `true`, with the sentence "a bridged action that asks after the Allow needs a decision about the kept
place on a bridge (Amendment 4, D.10) — this test is where E3 takes it". No runtime guard, for the reason in the preamble.

#### D.11 Scenarios (each RED today, and why)

Files: `test/sshExecCommand.test.ts` (F3, F4), `test/bridgeLinks.test.ts` (F3 through the action), `test/aliasThrottle.test.ts` (K9 unit, K10
unit), `test/bridgeKeptPlace.test.ts` (K9, K10, Q2, C.7 revised), `test/grantRegistry.test.ts` (A4 revised), `test/sshUseActions.test.ts` (X3),
`test/bridgeTransitive.test.ts` (T3), `test/bridgeAllowList.test.ts` (S1), `test/keyInstaller.test.ts` (F5). `brokerWorld.ts`/`bridgeWallWorld.ts`
gain `quietLocal` with a follow-up action (K10) and a quiet local call whose body is invalid (Q2).

| # | Scenario | Expected | RED today, because |
|---|---|---|---|
| F3 | The bridged argv carries the file | `bridged: true, configFile: '/s/bridged_ssh_config'`, key auth: `…BRIDGED_SSH_OPTIONS, '-F', '/s/bridged_ssh_config', '-i', …` and none of `BRIDGED_ASKPASS_OPTIONS`; askpass auth: `BRIDGED_ASKPASS_OPTIONS` between the six and `-F`; `bridged: true` without `configFile` → `undefined`; off a bridge with `configFile` set → byte for byte today's, no `-F`; through the action (`bridgeLinks`) the argv has `-F <storageDir>/…/bridged_ssh_config` and the file exists with mode 0600 | no `-F`, no refusal, no askpass options |
| F4 | The file's text | `bridgedSshConfig('/home/u', 'linux', undefined)` is `Host *` + the nine lines in `BRIDGED_CONFIG_BLOCK` order + `Match all` + `Include /home/u/.ssh/config` + `Include /etc/ssh/ssh_config`; `('C:\\Users\\u', 'win32', 'D:\\PD')` ends with the two Windows includes; no line names a host, user or value | the function does not exist |
| F5 | The file on disk | `writeBridgedSshConfigFile(dir, 'linux', '/home/u', undefined)` writes `<keysDir>/bridged_ssh_config`, mode 0600, content F4's; a second call rewrites it | the function does not exist |
| K9 | The kept place expires | `holdDialogs`; a local `up` Allowed and held in the action (`w.hold`): a bridge's call is `busy`; `mock.timers` moves `KEPT_PLACE_MS`; the same call is asked (admitted, a dialog); the `up` ending afterwards frees nothing of the new holder (its dialog is still the open one). Unit: `hold(t)` after `dialogClosed(h, true, t0)` is `undefined` at `t0 + KEPT_PLACE_MS − 1` and a holding at `t0 + KEPT_PLACE_MS`; a holding with a dialog up (`prompted`) is never taken over | the kept place has no bound |
| K10 | A quiet follow-up takes the place | `quietLocal` (a `never` policy) on an action stub with `asksAfterConsent: true`, held by `w.hold`: a bridge's asking call and a local alias call are `busy` until the action ends, no dialog was raised for the quiet call, its `allowed without a prompt` line is written; the same stub without the flag: both asked (silent calls take no place). Unit: `admit(false, t, door, true)` holds and stamps the silent window; a second one is `busy`; with the silent window full it is `too-many` and the place is free again | a silent admission never holds |
| Q2 | Eviction by dead pre-consented calls | `holdDialogs`; a bridged `exec`'s dialog open; 300 quiet local MCP calls with an EMPTY `command` (refused in `usable`, each leaving `allowed, uses 0`); Allow: the exec runs (200), one `ALLOWED` line, no `unauthorized` | tier three evicts the pending call first |
| A4 | Tiers, revised | one pending call + 300 allowed calls `uses 0` + 300 allowed calls `uses 1` + 2 denied calls + the token set of C.10's A4: after the mints the denied calls go first, then used calls, then unreserved calls, and the pending call and every token remain | no tier separates pending from unreserved |
| X3 | The note throws | `fs.rmSync` throws `EPERM` and `deps.note` throws on that line: the result is the finished exec's 200, `tally.slotsHeld` is 0; X2 still passes | the throw skips `release()` |
| T3 | A token run out between header and body | `sendSlow` with `idleMs` elapsed after the header was read: 401 `unauthorized` with `UNKNOWN_TOKEN`, no dialog, no line; the same with `maxUses` reached; a token the person DENIED still answers 403 `denied` with its line (`grantExpiry` ignores clocks for it) | the status closure reads the stored status |
| C.7 (rev.) | A throw after admission is answered | the three throwing requests each answer 500 `internal`, `escaped.length === 0`, the next call is asked | the throw escapes `handle` |
| S1 | Served actions ask nothing after the Allow | for `exec` and `query` on every kind serving them, `asksAfterConsent !== true` | green today, pinned (D.10) |

Itest legs 0, 5 and 6 (D.1) and the `close` wait (D.9) are the CI's; leg 0 runs on this machine. The spec cannot watch legs 5–6 RED here.

#### D.12 Order, line counts, Opus additions, unverified

Order: D.5 (`EVICTION_ORDER`, A4, Q2) → D.2 + D.3 (`aliasThrottle.ts`: K9 and K10 unit; then `brokerMcpDoor.ts`, `credsAgentServer.ts`; K9,
K10) → D.7 (T3) → D.8 (C.7 revised) → D.6 (X3) → D.1 (`sshExecCommand.ts`: F4, F3; `keyInstaller.ts`: F5; `sshUseActions.ts`: F3 through the
action; then the itest: leg 0, the hop pair, D.9) → D.10 (S1) → lint, `wc -l`, ratchet, the pre-PR block.

| File | After E1.4 | After |
|---|---|---|
| `credsAgentServer.ts` | 791 | **792** (`asksAfter`; `:272`, `:216-217`, `:495`, `:697` in place) |
| `extension.ts` | 1003 | 1003 |
| `aliasThrottle.ts` | 460 | ≈ 485 |
| `brokerMcpDoor.ts` | 519 | ≈ 526 |
| `brokerRequests.ts` | 285 | ≈ 295 |
| `brokerBridgeToken.ts` | 63 | ≈ 72 |
| `grantRegistry.ts` | 344 | ≈ 346 |
| `sshExecCommand.ts` | 140 | ≈ 170 |
| `keyInstaller.ts` | 285 | ≈ 300 |
| `sshUseActions.ts` | 380 | ≈ 384 |
| `itestForwardAgent.cjs` | 194 | ≈ 265 |
| `itestSshd.cjs` | 184 | ≈ 190 |

Every function stays under the complexity limit of 4 without a new disable comment: `OneInFlight.hold` 4, `OneInFlight.dialogClosed` 4,
`TokenlessCeilings.admit` 3, `admitSilentPlace` 3, `tokenStatusNow` 3, `unanswered` 2, `bridgedSshConfig` 2; `buildSshExecArgv` is already
exempt. No file nears 800.

Opus checklist, added to §S3.9: the `-F` file is written by `keyInstaller.ts` in the materialised-keys folder, 0600, and the argv names that
path and no other; `BRIDGED_CONFIG_BLOCK` is the one place the nine keywords are spelled and `Host *` is the file's first line, the includes
after `Match all`, by absolute path, no tilde; `BRIDGED_ASKPASS_OPTIONS` is pushed only on a bridged askpass call and before `-F`; a bridged
call without `configFile` returns `undefined`; off a bridge the argv is byte for byte today's; `hold` takes `nowMs` and never takes over a
holding whose dialog is up; `admit`'s fourth parameter is read only on the quiet path; `asksAfter` reads the real registry, not the body;
the pending-call tier is the last call tier; `tokenStatusNow` calls `get`, never `lookup` or `reserve`; `unanswered` puts nothing of the error
in the body; `release()` is in the innermost `finally`; S1 names every served action.

Unverified by this spec: legs 5–6 against a live `sshd` (none here; they run in CI); that Win32-OpenSSH's `Include` resolves the written
absolute paths and reads `%ProgramData%\ssh\ssh_config` through it (M8, which the plan's §7 row now names; the code is the same on every
platform and fails toward "no config", said by ssh's stderr); that VS Code's non-modal notifications leave their promise pending in the bell
(D.2's bound is right either way); whether `sshd -d` as a user prints a password-attempt line for leg 5 (not asserted: the askpass log is the
proof).

### Amendment 5 (Fable, 2026-11-05) — the dispositions of Amendment 4 after the parent's revision for epoch 4

The parent stopped a second time at change 3.2 and was revised whole (its §4.9, the SSH contract, and §4.10, the consent contract). Nothing of
Amendment 4 is built. This amendment says, item by item, what stands and what is superseded, and where the replacement is specified. It is not
itself a buildable spec for the replacements: the containment of the hop legs depends on M8 (Win32-OpenSSH under `-F`, `-J`, `IdentityAgent none`),
which the owner records before E1.6's spec is written, and the consent lifecycle is a story of its own (E1.5) whose spec is written from §4.10 when
it starts. Both specs are Fable's (security judgement), named in the E1 document's epoch 4 amendment.

| Item | Disposition | Why, and where the replacement lives |
|---|---|---|
| D.1 (the `-F` file that `Include`s the person's files; "a hop authenticates with the person's agent or the identity files the person's own config names") | **Superseded in its containment claim and its credential policy; its mechanics stand** | Measured false on 2026-11-05 (parent D9): a `ProxyCommand` child inherits no `-F` and the whole environment, and `SendEnv`, `LocalCommand`, `PermitLocalCommand`, `accept-new` survive the `Include`. What stands: `-F` reaches `-J`'s child; the hop leg under the file has `BatchMode yes`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`; the itest hop pair (legs 0, 5, 6) and the `startSshd` `extraConfig` move; `BRIDGED_ASKPASS_OPTIONS` on the outer. What replaces the rest: parent §4.9 — no `Include`; a per-call file with one `Host <hop>` block per hop **before** `Host *` (the first obtained value wins for scalars; a block after `Host *` lost its `UserKnownHostsFile`, measured), each block carrying the hop entry's own materialised key and host-key keywords only; `Host *` carrying the lock-down (`IdentityAgent none`, `IdentitiesOnly yes`, an `IdentityFile` naming a non-existent path so no default identity is added, `ProxyCommand none`, `PermitLocalCommand no`, `StrictHostKeyChecking yes`, `UserKnownHostsFile <bridge file> <~/.ssh/known_hosts>`, and the nine of `BRIDGED_CONFIG_BLOCK`); a hop entry with a password, no key or a sealed key refused before the spawn; an environment allow-list in place of `{ ...process.env }` (`sshExecAuth.ts:95,139,155` are the three spreads); `SSH_AUTH_SOCK` not kept. E1.6's spec |
| D.2 (`KEPT_PLACE_MS`: a kept place given up after five minutes) | **Superseded; not built** | A timer proves nothing about a prompt (parent D11, §4.10). The kept place lives until the call's `release`; an `up` left in the bell holds it, said in the `busy` sentence. E1.5's spec |
| D.3 (a quiet call that will ask after its Allow takes the place) | **Stands** | Consistent with §4.10: a prompt on screen holds the place. Built in the partial-E1 closing commit with D.5-D.10, or in E1.5 if its tests are better placed there — E1.5's spec decides, and says |
| D.4 | In D.1 | — |
| D.5 (pending calls are the last call tier) | **Stands**; the partial-E1 closing commit | Independent of both contracts |
| D.6 (the key file's note cannot cost the slot) | **Stands**; the closing commit | — |
| D.7 (an expired token is refused before the dialog) | **Stands**; the closing commit | — |
| D.8 (a throw inside `handle` answers 500) | **Stands**; the closing commit | — |
| D.9 (the itest reads a client's output after `close`) | **Stands**; the closing commit | — |
| D.10 (no served bridge action asks after its Allow: a static test) | **Stands**; the closing commit | §4.10 relies on it |
| D.11 scenarios F3, F4, F5 (the file's argv, text and disk form) | Rewritten by E1.6's spec | The text changes shape (per-call, per-hop blocks, no `Include`); the assertions "a bridged call without the file is `undefined`" and "off a bridge byte for byte today's" stand |
| D.11 scenarios K9, K10 | K9 **dropped** (no bound to test; replaced by §7's "held longer than any former timer" case); K10 **stands** with D.3 | — |
| D.11 scenarios Q2, A4, X3, T3, C.7 (rev.), S1 | **Stand** | With their items |
| D.12's order and counts | **Superseded** | The closing commit builds D.5, D.3 (if here), D.7, D.8, D.6, D.9, D.10 in Amendment 4's order without D.1 and D.2; its counts are re-taken by the coder |
| The parent's M8 row as Amendment 4 extended it | **Superseded** by the parent's revised M8 (moved forward, the `-F`/`-J`/lock-down experiment, no `Include`) | — |

**The order.** Amendment 4's preamble ("this amendment is coded on the tree E1.4 leaves") is superseded: D.3 (if built here) and D.5-D.10 are
built in the partial-E1 closing commit, before E1.4, and E1.4 is finished on the tree that commit leaves (the E1 document's epoch 4 amendment,
items 2, 3 and 12); the line counts of the preamble are re-taken by the coder.

What the E1.6 spec must still establish, beyond M8: that `IdentityAgent none` is honoured at authentication time (ssh_config(5) says so; the
agent leg (d) of the parent's §7 measures it); the Windows environment list (M9); whether two files in `UserKnownHostsFile` behave on Win32-OpenSSH
as on OpenSSH 10.2 (two are accepted, new keys go to the first — measured here); the exact journal sentences for the hop refusals (one shape, no
hop name in the body: `BRIDGE_USE_REFUSED` to the agent, as `bridgedRefusal` does today, `sshUseActions.ts:113-121`).

`todo/PLAN_bridge_dialogs_nobody_answers.md`, which C.11 and D.3 name, is retired by the same revision (parent §8, §2.1 Q6): no backoff and no probe,
because §4.10 raises no new prompt while one stands; its two recorded decisions (the `busy` sentence stays; the key-file leftover waits for E4) are in
the parent's §4.10 and §8.

**Carried from the parent's third and fourth passes (2026-11-06), because the closing commit builds from this spec.** Two items the parent
names for the partial-E1 closing commit that this amendment had not: (a) **the read shape** (parent §4.2, D12): `narrowed()` builds the
bridge's row field by field from the parent's named list instead of spreading the stored row, `folder` is served as `''`, `connectionString`
and `command` are dropped for `hasConnectionString` and `hasCommand`, `can` keeps its four keys, `KindHelp` and `KindRefusal` are asserted
byte-equal between an empty and a full vault, in `src/test/bridgeReadShape.test.ts` with the parent's §7 *Read shape* cases; §S3.3 row 4 and
scenario S3 read "the named fields of the parent's §4.2" where they say "the row"; (b) **the guard** (parent §4.9): `SshUseDeps.bridgedSshConfig?`
(`sshUseActions.ts:42`), absent on the closing commit, refuses every bridged `exec` with `BRIDGE_USE_REFUSED` and the journal line *no per-call
ssh_config yet: E1.6* before any spawn; `bridgeLinks.test.ts` L1 injects a stub writer and asserts the file's shape; E1.6 wires the real writer
and removes the guard. The E1 document's epoch 4 amendment, item 14, is the same text.

The ledger decision is the parent's, not this section's; the parent is stopped and this amendment is part of the re-review's revision, which is
not counted.

### Amendment 6 (Fable, 2026-11-06) — the partial-E1 closing commit

One commit, the last of E1.3. Every `file:line` below is at `a68b47e`, re-read for this amendment; the coder starts from **the tree that
commit leaves after `main` with PR #303 (`fix/query-refuses-client-commands`) has been merged into the branch**, which the reviewer does when
the PR lands. That merge touches `dbCliLauncher.ts`, its test, `research/module_extension.md`, `todo/README.md` and `CHANGELOG.md`
(a `### Fixed — security` entry under `## [Unreleased]`, beside E1.1's `### Changed`), none of which this commit edits except `CHANGELOG.md`,
where this commit's entry goes under the same heading; nothing below moves with that merge. Amendment 4's preamble counted
`credsAgentServer.ts` as 791 because it was to be coded on E1.4's tree; E1.4 is not on this tree, the file is **789** and **stays 789**
(every edit to it is in place); `extension.ts` is 1003, its ratchet baseline, and gains nothing. Where this amendment differs from Amendments
4 and 5, this amendment wins; nothing above is deleted. A Sonnet coder builds from this section alone; the order is in F.9.

**What this commit closes, said once.** E1.3 has four amendments behind it: `a91e981` built the allow-list, the note schema and the wall;
`c58842e` (Amendment 1, A.1-A.9) moved the store to a file, made the refusals generic, put the gate before `releaseWaiting`; `5bfedf8`
(Amendment 2, B.1-B.12) bounded the journal and gave the place to the dialog; `235a5e4` (Amendment 3, C.1-C.12) made a bridged exec one
fresh connection and kept the place through a follow-up prompt. This commit builds what Amendment 5 left standing of Amendment 4 (D.5-D.10),
the read shape the parent's D12 named (§4.2), the lock between partial E1 and E2 (§4.9's guard), the one agent path to `noteUserActivity()`
(§2.1 Q9), and the CHANGELOG entry §4.10 requires. **After it, E1.3 is finished**: nothing of the story is owed, and what the parent's sort cut
from `5bfedf8` (the timeout freeing the place, the timeout's sentence) is E1.5's fix forward, not E1.3's. D.3 is E1.5's (F.1). E1.4 is then
finished on this tree; E1.5 and E1.6 follow as their own PRs.

#### F.1 D.3 goes to E1.5, not here

Amendment 5 left the placement to "E1.5's spec … or the closing commit"; this amendment decides **E1.5**, for three reasons that stand alone.
(1) The partial-E1 merge's claim, in the parent's `## Epics` E1 and §4.10, is that it *changes the doors' admission by nothing*; D.3 changes
`TokenlessCeilings.admit` (`aliasThrottle.ts:329-332`) so that a quiet local `up` or `terminal` takes the place and a later asking call on any
local door hears `busy` where today it is asked — an admission change on the local doors, which the merge must not carry. (2) D.3 is a row of
§4.10's table ("a quiet call that may prompt again … the call, for its length") and its test (K10) belongs in `src/test/consentContract.test.ts`,
the suite E2.2 asserts exists before R1 goes; writing K10 elsewhere now and moving it later is two commits for one fact. (3) At partial E1 no
bridge door exists in production (R1), so the attack D.3 closes, a bridge's modal landing on a quiet local follow-up prompt with Enter on Allow,
has no bridge to come from; the local-only variant (a local alias call's modal over a quiet local `up`'s trust modal) is `main`'s today and is
not made worse. So `brokerMcpDoor.ts` and `credsAgentServer.ts` are not touched for it, and `credsAgentServer.ts` stays 789.

#### F.2 D.5-D.10, as they stand on this tree

Each item is Amendment 4's, restated where a line moved or a shape had to change, referenced where it did not.

**D.5 Pending calls are the last call tier — as written.** `EVICTION_ORDER` is `grantRegistry.ts:59-66`; the third tier (`:62`) is still
`g.scope === 'call'` and holds an Allow not yet reserved together with a pending call. It becomes the four call tiers of Amendment 4's
block (denied; allowed with uses; allowed; pending), then the three that were there. The doc comment at `:291-302` says that the fourth tier is
pending alone and why (a dead pre-consented call, refused in `usable` or abandoned before `reservedNow`, `brokerCall.ts:171`, stays
`allowed, uses 0` for good, because `drop` at `:321-327` deletes pending grants only). Scenarios A4 (revised) and Q2.

**D.6 The key file's note cannot cost the slot — the shape changes, the intent does not.** `removeKeyFile` (`sshUseActions.ts:196-204`)
calls `deps.note` in its `catch`; a `note` that throws escapes `run`'s `finally` (`:271-274`) before `release()`. Amendment 4's shape,
`try { removeKeyFile } finally { release() }`, gives the slot back and **still replaces the finished 200 with a rejection** (a throw from a
`finally` propagates after it), which contradicts X3's expected "the result is the finished exec's 200". So the second `try` wraps the note
instead, inside `removeKeyFile`, and `run`'s `finally` is unchanged:

```ts
// sshUseActions.ts:196-204, in place
function removeKeyFile(deps: SshUseDeps, file: string | undefined): void {
  try {
    if (file !== undefined) { fs.rmSync(file, { force: true }); }
  } catch (error) {
    try { deps.note(`ssh:exec — the key file could not be removed: ${describeError(error)}`); } catch { /* a journal that will not take the line costs neither the slot nor the result */ }
  }
}
```

Complexity 4 (`if`, `catch`, `catch`). The finished result stands, `release()` runs at `:273` as today, and a key left on disk is still
the person's own file in a folder only they can read (Amendment 3, C.6). Scenario X3.

**D.7 An expired token is refused before the dialog — as written.** `credsAgentServer.ts:495` still reads
`() => this.grants.get(grant.secret)?.status`; `GrantRegistry.get` (`grantRegistry.ts:179`) applies no expiry; `grantExpiry`
(`grantRegistry.ts:118-123`) is exported and pure; `grantLimits()` is already imported at `:474`. `tokenStatusNow` goes into
`brokerBridgeToken.ts` (63 → ≈73) with Amendment 4's body, and `:495` becomes
`() => tokenStatusNow(this.grants, grant.secret, Date.now(), grantLimits())` in place. `tokenRefusal` (`brokerBridgeToken.ts:9-14`) then
answers `unauthorized` / `UNKNOWN_TOKEN` with no line for a token that ran out, as it does for an evicted one. Scenario T3.

*Added 2026-11-06 (the review of `88befcd`):* `tokenStatusNow` runs only on the bridged branch (`view.bridge === undefined ? this.perform(…) : bridgedTokenCall(…)`),
which no production door reaches before E2. So the CHANGELOG bullet about a token that ran out between header and body is **not** shipped with partial E1
(it is also not "as the main port has always answered it": the main port says which expiry it was). That bullet returns when a bridge door exists (E2).

**D.8 A throw inside `handle` answers 500 — as written.** `credsAgentServer.ts:697` is `(req, res, bridge) => void this.handle(req, res, bridge),`;
it gains the `.catch` of Amendment 4, in place. `unanswered` goes into `brokerRequests.ts` (285 → ≈297) with Amendment 4's body;
`INTERNAL_FAILURE` is exported from `brokerProtocol.ts:95`, `describeError` from `./describeError`. `respondError` (`:712-731`) writes a
journal line only when it is given a grant, so `unanswered` writes its own line through `log` and passes none; `log`'s parameter
(`:748`) takes `{ grant, entityName, action, outcome, detail }` with `via` and `caller` optional, which is the shape the amendment gives.
`res.headersSent` guards a handler that threw after answering. The C.7 test (`bridgeKeptPlace.test.ts:333-355`, moved from `:337-349`)
changes as Amendment 4 says: `escaped.length === 0`, each of the three requests answered 500 `internal` with `INTERNAL_FAILURE`, the place
still given back, and the `unhandledRejection` swap removed.

**D.9 The itest reads a client's output after `close` — as written.** `launch` is `itestSshd.cjs:15-36` and resolves `done` at `exit`;
`runClient` is `itestForwardAgent.cjs:56-69` and reads `stdout` right after. `launch` gains `closed` (a promise of `close`); `runClient`
awaits it raced with 2 s after `done`. Leg 4 (`:115-118`) runs `printenv SSH_AUTH_SOCK` today; it becomes
`printenv SSH_AUTH_SOCK SSH_CONNECTION` with `code === 1`, exactly one line of stdout ending in B's port, and `REACHED_B` (`:26`) kept.
CI's, with the harness `sshd`; not watchable RED here.

**D.10 No served bridge action asks after its Allow — as written, with the actions real.** The test goes in `bridgeAllowList.test.ts`:
the served actions are **derived from the table**, `BRIDGE_ROUTES` (`bridgeAllowList.ts:82-87`) filtered to `method === 'POST'` and
`decision.served`, the last path segment of each (today `exec` and `query`), so the test cannot drift from the allow-list; the actions are the
**real factories**, `sshExecAction` (`sshUseActions.ts:207`, loaded through `loadWithVscode` as `bridgeLinksWorld.ts` loads it) and
`dbQueryAction` (`agentUseActions.ts:296`, as `agentUseActions.test.ts` loads it), with stub deps; for each served action and each real action
that carries it, `asksAfterConsent !== true`, with Amendment 4's sentence. Teeth: the test asserts it found at least one real action per
served word (an empty match would pass for ever). `brokerWorld.ts`'s registry (`:261-265`) is a stub and is not used for this.

#### F.3 The read shape (parent §4.2, D12)

**The walk of every served read, from the route to its builder.** A GET on a bridge door passes `refusedOnBridge`
(`credsAgentServer.ts:441`), then `readRouteBody(url.pathname, view.sources(this.readSources(), this.hooks.resolveAlias), …)` at `:449`.
`readRouteBody` (`brokerReadRoutes.ts:55-78`) is the only consumer of `ReadRouteSources`; the served GET routes of the table
(`bridgeAllowList.ts:64-72`) and where each body is built:

| Route | Body built at | Through the wall | Fields the bridge serves |
|---|---|---|---|
| `/v1/health` | `brokerReadRoutes.ts:61` | no (`walled: false`) | `ok`, `service`: the product's own; byte-equal, below |
| `/v1/mcp/kinds` | `:73`, `agentKinds()` | no | the catalogue; byte-equal |
| `/v1/mcp/kind-help` | `:74`, `kindHelpBody` `:95-103` | no | `KindHelp` or `KindRefusal`; byte-equal |
| `/v1/aliases` | `:62`, `aliasesFrom` `:124-126` over `bridgedView.sources.aliases` (`bridgeScope.ts:159`, a filter over the real rows) | yes | per row `name`, `kind` (`AliasListEntry`, `brokerProtocol.ts:270-273`) |
| `/v1/mcp/entries` | `:64`, `entriesFrom` `:128-130` over `bridgedView.sources.mcpEntries` (`bridgeScope.ts:161-164`) → `entriesIn` (`:129-133`) → **`narrowed` (`:121-127`)** | yes | the named list below |
| `/v1/mcp/config-snippet` | `:63`, `snippetBody` `:109-116` → `configSnippetResult` (`mcpSnippetRoute.ts:77-86`), field by field, never a spread of `details` | yes (`bridgeScope.ts:165`) | `envVar`, `languages`, `snippet`, `error` (`ConfigSnippetBody`, `mcpSnippetRoute.ts:41-59`); inside: `languages[]` `id`, `label`, `variants[]` `id`, `label`; `snippet` `language`, `variant`, `code`, `where`, `does` |
| `/v1/mcp/folders` | `:70`, `foldersFrom` over `bridgedView.sources.folders` (`bridgeScope.ts:166`, `() => []`) | yes | an empty list |

**The single choke point is `narrowed`.** It is the one function every bridged listing row passes (reached only from `entriesIn`, reached
only from `bridgedView.sources.mcpEntries`), and today it spreads the stored row (`...row`, `bridgeScope.ts:123`), so `connectionString` and
`command` cross as `mcpEntryFor` built them (`mcpEntries.ts:139-158`: `connectionString: shownConnection(…)` at `:150`, `command` through
`visibleFields` at `:180`). The other served reads already name their fields (the table). So the change is one function and one type:

```ts
// bridgeScope.ts (pure)
import type { McpCapabilities, McpEntry } from './mcpEntries';

/**
 * A row as a bridge lists it (parent §4.2, D12): every field NAMED, none spread, so a field added to `McpEntry` later is not served
 * here until somebody writes it into this type, this builder and `BRIDGE_ENTRY_FIELDS` — and the read-shape test fails until all three agree.
 * `folder` is `''`: a folder is in no scope, and the inherited folder's name would be the one out-of-scope word still served (the
 * client's `Folder` is non-null, `McpJsonContext.cs:54`). `connectionString` and `command` are booleans: the string is the secret
 * (`withoutPassword` strips one dialect of four, parent D12) and a command carries `creds://` references that name an account and an
 * out-of-scope entry; the agent runs a line by id and needs no text.
 */
export interface BridgeEntry {
  readonly id: string; readonly name: string; readonly kind: string; readonly folder: '';
  readonly host?: string; readonly port?: number; readonly user?: string; readonly dbType?: string; readonly vpnType?: string; readonly scriptLanguage?: string;
  readonly hasConnectionString: boolean; readonly hasCommand: boolean;
  readonly hasPassword: boolean; readonly hasPrivateKey: boolean; readonly hasNotes: boolean; readonly hasTotp: boolean;
  readonly codeAccessEnabled?: boolean;
  readonly dependsOn: string[];
  readonly can: McpCapabilities;
}
/** The keys of `BridgeEntry`, written out: the read-shape test asserts a full row's served keys equal this list, and `BRIDGE_READ_SHAPES` names it. */
export const BRIDGE_ENTRY_FIELDS: readonly (keyof BridgeEntry)[] = ['id', 'name', 'kind', 'folder', 'host', 'port', 'user', 'dbType', 'vpnType', 'scriptLanguage', 'hasConnectionString', 'hasCommand', 'hasPassword', 'hasPrivateKey', 'hasNotes', 'hasTotp', 'codeAccessEnabled', 'dependsOn', 'can'];

/** A row a bridge may list, built field by field from the local row: what this door permits (`use` only), no dependency on a row not listed. */
function narrowed(row: McpEntry, kept: ReadonlySet<string>): BridgeEntry {
  return {
    id: row.id, name: row.name, kind: row.kind, folder: '',
    host: row.host, port: row.port, user: row.user, dbType: row.dbType, vpnType: row.vpnType, scriptLanguage: row.scriptLanguage,
    hasConnectionString: row.connectionString !== undefined,   // true exactly when the local row would have carried the stripped string
    hasCommand: row.command !== undefined,                     // `blankToUndefined` (mcpEntries.ts:188-190) has already made a blank absent
    hasPassword: row.hasPassword, hasPrivateKey: row.hasPrivateKey, hasNotes: row.hasNotes, hasTotp: row.hasTotp,
    codeAccessEnabled: row.codeAccessEnabled,
    dependsOn: row.dependsOn.filter((name) => kept.has(name)),
    can: { use: row.can.use, edit: false, create: false, delete: false },
  };
}
// entriesIn (:129-133) returns readonly BridgeEntry[]; `bridgedView.sources.mcpEntries` keeps its `ReadRouteSources` type, because a
// BridgeEntry is assignable to McpEntry (the two dropped fields are optional there; the two added ones are extra properties of a non-literal).

// bridgeAllowList.ts (pure), beside READS: what each served read may carry, at EVERY depth of its body. A served GET with no row here fails
// the read-shape test (default deny, the same rule as the route table). `kinds`, `kind-help` and `health` carry the product's own text and are
// pinned byte-equal instead of by field.
export const BRIDGE_READ_SHAPES: Readonly<Record<string, readonly string[]>> = {
  '/v1/aliases': ['aliases', 'name', 'kind'],
  '/v1/mcp/entries': ['entries', ...BRIDGE_ENTRY_FIELDS, 'use', 'edit', 'create', 'delete'],
  '/v1/mcp/config-snippet': ['envVar', 'languages', 'snippet', 'error', 'id', 'label', 'variants', 'language', 'variant', 'code', 'where', 'does'],
  '/v1/mcp/folders': ['folders'],
};
export const BRIDGE_BYTE_EQUAL_READS: readonly string[] = ['/v1/health', '/v1/mcp/kinds', '/v1/mcp/kind-help'];
```

An optional field set to `undefined` in the literal (`host` of an entry with none) is a key in the object and absent on the wire
(`JSON.stringify` drops it), exactly as `visibleFields` behaves today; the test walks the **served JSON**, not the object.

**How a field added later is refused by construction, not by memory.** Three things have to agree before a new field crosses a bridge:
the `BridgeEntry` type (a literal with an extra key is a compile error; a spread is gone, so a field added to `McpEntry` does not arrive by
itself), the `narrowed` literal, and `BRIDGE_ENTRY_FIELDS`, which `BRIDGE_READ_SHAPES` includes. The read-shape test asserts (i) every key at
every depth of every served body is in its route's row, (ii) a full row's served keys equal `BRIDGE_ENTRY_FIELDS` as a set, and (iii) every
served GET route of `BRIDGE_ROUTES` is either in `BRIDGE_READ_SHAPES` or in `BRIDGE_BYTE_EQUAL_READS`. Adding a field to the type and the
builder without the list fails (ii); adding it to the list without the builder fails (ii) the other way; adding a served read without a row
fails (iii); a route whose builder gains a nested key fails (i). None of it depends on anyone remembering D12.

**The wire, and the clients that read it.** A bridge row drops `connectionString` and `command` and adds `hasConnectionString` and
`hasCommand`. The released `creds-mcp` reads `McpEntry` through a source-generated context that **drops a property it does not know**
(`McpJsonContext.cs:46-49`, the remark; `ConnectionString` and `Command` are nullable, `:58,60`; `Folder` is non-null, `:54`, and gets `''`),
so an old client lists a bridge row with those two null and no error; E2.1 adds the two booleans to the record. No client changes here, which
is what the pre-PR diff line (F.9) pins. **The local door is byte for byte today's**: `OPEN_VIEW.sources` is the identity (`bridgeScope.ts:89`),
`mcpEntryFor` is untouched, and `visibleMcpEntries` (`mcpEntries.ts:219`) is what the main port still serves; R3's recorded answers do not
move, and RS3 compares the main-port listing with `visibleMcpEntries` over the same vault.

**The five strings, through the wall world.** `bridgeWallWorld.ts`'s vault answers `getDbConnection: none` (`:115`) and seeds no terminal
command with a reference; `WallOptions` (`:158-183`) gains `fullVault?: true`, which seeds, in a1 and in the scope of `server1`:
`db-kv` with `Server=db,1433;Database=d;User Id=u;Password=<S1>`, `db-qs` with `postgresql://u@h/d?password=<S2>`, `db-slash` with
`postgresql://u:<S3a>/<S3b>@h/d`, `db-at` with `postgresql://u:<S4a>@<S4b>@h/d` (each through `stored(raw)` of `storedSecret.ts:25`, the form
`plainText` reads), a terminal entry `tm-ref` with `command: 'deploy creds://acct@example.test/outside/db/password'` naming an entry that
is **not** in the scope, and `in-folder` inside a folder named `<F>`. The sentinels are test words, no shape of a real password. Through the
bridge, the raw text of every served body carries none of `<S1>`-`<S4b>`, `creds://`, `Password=`, `?password`, `<F>`; the four db rows
carry `hasConnectionString: true`, `tm-ref` carries `hasCommand: true`, `in-folder` carries `folder: ''`. Through the main port the same
vault lists `withoutPassword`'s answers as the parent's D12 measured them (`dbConnString.ts:148-153`: S1 whole, S2 whole, S3 whole, S4 as
`postgresql://u@<S4b>@h/d`), the `command` whole and `folder: '<F>'`: the control that the test can see what it looks for, and the pin that
the local door did not move.

#### F.4 The bridged-exec guard (parent §4.9): the lock between partial E1 and E2

```ts
// sshUseActions.ts — SshUseDeps (:42-73) gains one optional field
/**
 * E1.6's writer of the per-call ssh_config a bridged `ssh` runs under (parent §4.9). ABSENT on the partial-E1 tree, and that absence is the
 * lock between partial E1 and E2 (`unguardedBridge`): a bridged call is refused before any slot, key or spawn. The parameter is E1.6's to
 * widen (the legs and their keys go in); the result is §4.9's decided shape — `cwd`, a fresh folder per call that holds the file and nothing
 * else, and `configFile`, the relative name `c.conf`. Nothing on this tree calls it: the argv carries no `-F` until E1.6 writes the file.
 */
bridgedSshConfig?: BridgedSshConfigWriter;

export type BridgedSshConfigWriter = (call: { readonly callId: string }) => { readonly cwd: string; readonly configFile: string };
/** The journal's reason while the writer is absent; the agent reads `BRIDGE_USE_REFUSED` and not this. */
export const NO_BRIDGED_SSH_CONFIG = 'no per-call ssh_config yet: E1.6';

/** A bridged call with no writer of the per-call file is refused before any slot, key or spawn: the generic sentence to the agent, this reason in the journal. Off a bridge, nothing. */
function unguardedBridge(deps: SshUseDeps, ctx: UseActionContext, refuse: (code: ErrorCode, message: string) => UseActionResult): UseActionResult | undefined {
  return ctx.bridge !== undefined && deps.bridgedSshConfig === undefined ? refuse('denied', NO_BRIDGED_SSH_CONFIG) : undefined;
}
// run, :235 in place:   const unusable = unusableEntity(ctx, entity) ?? unguardedBridge(deps, ctx, refuse);
```

`refuse` is `bridgedRefusal(deps, ctx)` (`:113-121`, built at `:234`, before this line), so the journal line reads
`<entry>: no per-call ssh_config yet: E1.6 (a Remote Bridge was told only that it could not be used)` and the body is
`BRIDGE_USE_REFUSED(<entry>)` with the code `denied` (403; `not_supported` is a 404 the CLI reads as "this window does not have the entry" and
moves on). The guard sits after `unusableEntity` (`:129-134`: no host, and `agentForward` on a bridge, which keeps its own sentence and
its L4 tests) and **before** `acquireExecSlot` (`:239`) and `prepareAuth` (`:243`): no slot is taken and no key is written for a call that is
refused. Complexity 3; `run` keeps its line count (the edit is in place), `unusableEntity` is untouched. `sshDepsFor` (`:358-380`), the
production wiring, sets no `bridgedSshConfig`, so **every bridged exec in production is refused** until E1.6 adds the writer there and
removes `unguardedBridge` in the commit that writes the file; `extension.ts` is not touched.

**The tests, and what shifts.** `bridgeLinksWorld.ts` builds the real action with `SshUseDeps` at `:103-110`; every bridged scenario of
`bridgeLinks.test.ts` that reaches past `unusableEntity` (L1 at `:44`, L2 both legs, L3 all three, L5, F1 through the bridge) would be
refused by the guard and go red. So `linksWorld` injects a stub writer by default and `LinksOptions` gains `noConfigWriter?: true` for the
guard's own scenario. The stub records its calls (`lw.configWrites`, a counter) and writes nothing: **on this tree nothing calls the writer**,
because the argv has no `-F` to name a file (F1 pins the bridged argv byte for byte, `bridgeLinks.test.ts:185`), and a file nothing reads would
be a leftover. Amendment 5's "a stub that writes a file and asserts its shape" is therefore E1.6's reading of the same stub: E1.6 makes the
call, rewrites F1, and turns G1's `configWrites === 0` into an assertion about the file. No expectation of L1-L5 or F1 changes; L4's two bridged
legs hold with or without the stub, since `agentForward` is refused first. `sshUseActions.test.ts` passes no `bridge` in its context and is
untouched; `brokerWorld.ts` and `bridgeWallWorld.ts` run a stub exec, not the real action, and are untouched. The guard is in the action, so it
answers after the Allow; at partial E1 no production bridge door exists, so no person is asked for a call the guard then refuses.

#### F.5 An agent's `up` or `down` is never a person's act (parent §2.1 Q9, §4.7)

`runVpn` (`vpnRun.ts:66-84`) calls `vaultKeys.noteUserActivity()` at `:75` first, for the person's Start and Stop (`entityCommands.ts:199-200`,
`startGate` undefined) and for the agent's `up` and `down` alike (`agentVpnOpener`, `:37-42`, hands `vpnAction`'s `ctx.signal`, which
`UseActionContext.signal` makes REQUIRED, `useActions.ts:28`). That is the one agent path to the idle clock: every other caller is a
command or a click (`extension.ts:512,705,812`, `agentCommands.ts`, `treeMutationCommands.ts:147`), and the consent gate counts a click
only (`brokerConsent.ts:137-139`). `runVpn` is at complexity 4 (`||`, `if`, the ternary), so the guard is a helper:

```ts
// vpnRun.ts
/** The person's own Start or Stop postpones auto-lock; an agent's `up` or `down` (`startGate` set) is not a person at the keyboard (parent §2.1 Q9). */
function notePersonsAct(vaultKeys: Pick<VaultKeys, 'noteUserActivity'>, startGate: AbortSignal | undefined): void {
  if (startGate === undefined) { vaultKeys.noteUserActivity(); }
}
// :75 in place:  notePersonsAct(vaultKeys, startGate);
```

`vpnWorld.ts:367` passes `{ noteUserActivity: () => undefined }`; it counts instead (`w.activity`). Scenarios V1, V2.

#### F.6 The `CHANGELOG.md` entry (parent §4.10)

Under `## [Unreleased]`, after E1.1's `### Changed` entry (`CHANGELOG.md:9-21`) and beside the fix's `### Fixed — security`, one entry, each
line checked against the diff of `aliasThrottle.ts`, `brokerConsent.ts`, `grantRegistry.ts` and `credsAgentServer.ts` against `origin/main`:

```markdown
### Changed — the broker's one consent dialog: who holds its place, and for how long

- **The place one dialog takes is the dialog's, given back when it closes** (`brokerConsent.ts`, `shown`), not when the call that raised it
  ends: a client that hangs up during its dialog leaves the modal on screen and the place taken until you click it or five minutes pass.
  Before, the place went back at the call's end and the next call could open a second modal over the first.
- **A prompt is counted when it is shown, not when the call is admitted** (`aliasThrottle.ts`, `prompted`): a call refused before any dialog
  no longer spends one of the five prompts a minute.
- **A new ceiling: a caller without a token may ask at most 60 times a minute**, refusals before any dialog included (`ASKING_CEILING`), with
  its own sentence and one journal line per minute.
- **After you Allow a local `create`, `terminal` or `up`, the place stays taken until that call ends**, because those three may show a
  prompt of their own next (a PIN box, a trust modal, OpenVPN Connect's question); another caller hears *busy* until then. `exec`, `query`,
  `run` and `down` keep nothing once the dialog closes.
- **A token that ran out between its header and its body is refused before any dialog**, 401 *Unknown or missing grant token.*, as the main
  port has always answered it.
- **A failure inside a request handler answers 500** with the generic sentence instead of leaving the request unanswered until the client
  gives up; the reason goes to the agent journal.
- The grant registry reclaims in tiers (denied calls, calls that ran, Allows not yet used, then calls whose dialog is open or whose client
  left), and a call refused before anybody was asked leaves no grant behind.
- **Unchanged, said here so nobody reads it as new:** a dialog nobody answers still times out after five minutes, still answers the caller
  *The human did not allow this grant.*, and still gives the place back, so the next call raises a dialog while the old one may be on
  screen. A later release changes this.
```

The claims and the code: the first is `shown`'s `finally` (`brokerConsent.ts:113-128`; on `main` the place was released at the route's
`finally`, `aliasThrottle.ts` `release()` at `main`'s `:111`) and P1 (`bridgePrompts.test.ts:362`); the second is `prompted`
(`aliasThrottle.ts:368-378`) and the S26 consequence (`bridgePrompts.test.ts:144`); the third is `ASKING_CEILING` (`:85`), its sentence
(`:440`) and `firstThisWindow` (`:453-459`), A1 and A3; the fourth is `asksAfterConsent` on `sshTerminalAction` (`sshUseActions.ts:284`),
`vpnAction` (`agentUseActions.ts:405`) and `create`'s `true` at the door (`brokerMcpDoor.ts:481`), K1-K8; the fifth and sixth are D.7 and D.8
of this commit; the seventh is `EVICTION_ORDER` and `drop` (`grantRegistry.ts:59-66,321-327`); the last is `notAllowed`
(`credsAgentServer.ts:636-648`, `GRANT_NOT_ALLOWED` on `consent_timeout`, the same sentence `main` spells inline at its `:625`) and `shown`'s
`finally` on a timeout. E1.1's entry already stands at `:9-21` (the export refusal, the `Set env` warning, the help); its warning is worded for
the case it does reach and M4 is still owed by the person, as the E1 document's §M4 says; nothing of it is rewritten here. The parent's §4.10
says why the list matters: an extension tag may ship between partial E1 and E1.5 for unrelated work, and this entry is what makes that honest.

*Correction, 2026-11-06 (the Opus review and the `coai` gate of `88befcd`; the text above stands as written).* Two bullets of the entry changed in the commit
that followed: (1) the bullet "A token that ran out between its header and its body is refused before any dialog" was **deleted**, because it is false for
what ships: the main port does not answer that way (it names the expiry), and `tokenStatusNow` runs only on the bridged branch, which no production door
reaches until E2 (see F.2's D.7); (2) the registry bullet's "a call refused before anybody was asked leaves no grant behind" now **excepts a call a policy had
already allowed**: a pre-consented call refused before it is reserved still leaves an allowed grant with no use (`call/allowed/uses=0`), which the third tier
reclaims. One bullet was **added**: an agent's `up` or `down` no longer postpones auto-lock (`vpnRun.ts`, `notePersonsAct`), the one change of this commit a local
user can feel.

*Correction, 2026-11-06 (epoch 5, the fix-forward before the partial-E1 PR).* "The one change of this commit a local user can feel" above is an overstatement: D.8's 500 on a throw, the eviction tier order and the unparseable-target answer are felt on the local doors too (the parent's §4.10, second list).

*Correction, 2026-11-07 (epoch 6, the follow-up contract of the parent's §4.10).* The sentence "`exec`, `query`, `run` and `down` keep nothing once the dialog closes" (C.3, and F.6's kept-place bullet above) is overturned: `down` (the install offer), `rotate` (the PIN and copy prompts) and an `exec` on an entry that forwards the agent while the agent socket is up (its signing prompt) keep the place until the call ends, so `query`, `run` and a non-forwarding `exec` are the actions that keep nothing. `asksAfterConsent` is `boolean | ((target) => boolean)`, read by `asksAfter` at the consent gate. F.6's text stands as written; the CHANGELOG entry carries the corrected bullet.

#### F.7 Scenarios (each RED today, and why)

Files: `test/grantRegistry.test.ts` (A4 revised), `test/bridgeKeptPlace.test.ts` (Q2, C.7 revised), `test/sshUseActions.test.ts` (X3),
`test/bridgeTransitive.test.ts` (T3), `test/bridgeAllowList.test.ts` (S1, RS6), **new** `test/bridgeReadShape.test.ts` (RS1-RS5),
`test/bridgeLinks.test.ts` (G1, G2), `test/vpnGoneRequest.test.ts` (V1, V2), `test/sshExecRunner.test.ts` (RS7), `test/bridgeWallWorld.ts`
(`fullVault`), `test/bridgeLinksWorld.ts` (the stub writer, `noConfigWriter`, `configWrites`), `test/vpnWorld.ts` (`activity`).

| # | Scenario | Expected | RED today, because |
|---|---|---|---|
| A4 (rev.) | Tiers | one pending call + 300 allowed calls `uses 0` + 300 allowed calls `uses 1` + 2 denied calls + the token set of C.10's A4: after the mints the denied calls go first, then used calls, then unreserved calls; the pending call and every token remain | tier three holds pending and unreserved together, oldest first |
| Q2 | Eviction by dead pre-consented calls | `holdDialogs`; a bridged `exec`'s dialog open; 300 quiet local MCP calls with an EMPTY `command` (refused in `usable`, each leaving `allowed, uses 0`); Allow: the exec runs (200), one `ALLOWED` line, no `unauthorized` | the pending call is the oldest of tier three |
| X3 | The note throws | `fs.rmSync` throws `EPERM` and `deps.note` throws on that line: the result is the finished exec's 200, `tally.slotsHeld` is 0, X2 still passes | the throw escapes `removeKeyFile` and replaces the result |
| T3 | A token run out between header and body | `sendSlow` with `idleMs` elapsed after the header was read: 401 `unauthorized`, `UNKNOWN_TOKEN`, no dialog, no line; the same with `maxUses` reached; a token the person DENIED still answers 403 `denied` with its line | `:495` reads the stored status |
| C.7 (rev.) | A throw after admission is answered | the three throwing requests each answer 500 `internal` with `INTERNAL_FAILURE`, `escaped.length === 0`, the next call is asked | the throw escapes `handle` |
| S1 | Served actions ask nothing after the Allow | for every served POST word of `BRIDGE_ROUTES` and every real action carrying it (`sshExecAction`, `dbQueryAction`), `asksAfterConsent !== true`; at least one real action per word was found | green today, pinned (D.10) |
| RS1 | The walk | through a bridge over the full vault with every entry in scope, every served GET route of `BRIDGE_ROUTES` (`kind-help` with `kind=ssh`, `kind=db`, `kind=nonsense`): every key at every depth of the parsed body is in `BRIDGE_READ_SHAPES[path]`, or the path is in `BRIDGE_BYTE_EQUAL_READS`; a served GET in neither fails with "a served read with no field list: default deny" | `connectionString` and `command` are keys of the listing's rows |
| RS2 | The row, exactly | a db entry in scope with every optional field set: the served row's key set equals `BRIDGE_ENTRY_FIELDS` as a set; `can` has exactly `use`, `edit`, `create`, `delete` with `use` as resolved and the rest `false`; `dependsOn` names kept rows only | `hasConnectionString` and `hasCommand` are not keys |
| RS3 | The five strings | the `fullVault` of F.3 through the bridge: no served body's raw text contains `<S1>`, `<S2>`, `<S3a>`, `<S3b>`, `<S4a>`, `<S4b>`, `creds://`, `Password=`, `?password` or `<F>`; the four db rows `hasConnectionString: true`, `tm-ref` `hasCommand: true`, `in-folder` `folder: ''`. Control through the main port: the listing body equals `JSON.stringify({ entries: await visibleMcpEntries(vault) })` and contains S1, S2 and S3 whole, `postgresql://u@<S4b>@h/d`, the whole `command` and `folder: '<F>'` | S1-S3 cross whole, S4's tail crosses, `creds://…/outside/…` and `<F>` cross |
| RS4 | Byte-equal | for each path of `BRIDGE_BYTE_EQUAL_READS` (and the three `kind` queries): the body text through a bridge over an empty vault and empty scope equals the body text through a bridge over the full vault, and equals the main port's | green today, pinned (a `KindHelp` has no field list of its own) |
| RS5 | The listing's shape is the wall's | `OPEN_VIEW.sources(real)` is `real` (identity, pinned already at `bridgeScope.test.ts:238`); `bridgedView.sources(...).mcpEntries()` over a row carrying an extra key planted on the stored row (`(row as Record<string, unknown>).leak = '<S5>'`) serves no `leak` and no `<S5>` | `...row` carries the planted key |
| RS6 | Default deny has teeth | `BRIDGE_READ_SHAPES` and `BRIDGE_BYTE_EQUAL_READS` together name exactly the served GET paths of `BRIDGE_ROUTES`, no more and no fewer | the constants do not exist |
| RS7 | `exec`'s body is the type's | in `sshExecRunner.test.ts:63` ("a normal child"): the resolved object's keys are exactly `exitCode`, `stdout`, `stderr`, `stdoutTruncated`, `stderrTruncated`, `timedOut`, `durationMs` (`ExecResponseBody`, `brokerProtocol.ts:147-155`; built at `sshExecRunner.ts:191-201`) | green today, pinned |
| G1 | The guard | `linksWorld({ noConfigWriter: true })`, through the bridge: 403 `denied`, the body is `BRIDGE_USE_REFUSED('prod')` and contains neither `ssh_config` nor `E1.6`; `lw.runs.length === 0`, `lw.materialised.length === 0` (no key written), `lw.notes` has one line containing `no per-call ssh_config yet: E1.6`; `ww.w.dialogs.length === 1`. Control: the same world through the main port is 200 with `-i` in the argv. And in L1 as it stands: `lw.configWrites === 0` (the writer is present and nothing calls it on this tree) | there is no guard: the bridged call runs |
| G2 | Production hands no writer | `sshDepsFor(parts)` with stub parts: `'bridgedSshConfig' in deps` is `false` (E1.6 flips this line when it wires the real writer) | green today, pinned |
| V1 | An agent's `up` is not a person | `vpnWorld` with `startGate` set, `up` through the world: `w.activity === 0`; the same for `down` | `:75` counts every call |
| V2 | The person's Start is | `vpnWorld` with no `startGate`: `w.activity === 1` | green today, pinned |

#### F.8 Break-its (mutate, watch the named case fail, restore; both outputs in the PR)

- `narrowed`: restore `...row` in the literal → RS1, RS3, RS5. Drop `hasCommand` from the literal → RS2. Add `leak: row.name` to the literal
  (and to the type) without the list → RS2; add `'leak'` to `BRIDGE_ENTRY_FIELDS` alone → RS2 the other way. Set `folder: row.folder` → RS3.
- `BRIDGE_READ_SHAPES`: remove the `/v1/aliases` row → RS1 ("default deny") and RS6; add a `'/v1/nothing'` row → RS6.
- `EVICTION_ORDER`: merge the third and fourth call tiers back → A4, Q2.
- `removeKeyFile`: remove the inner `try` → X3.
- `:495`: restore `this.grants.get(grant.secret)?.status` → T3.
- `:697`: remove the `.catch` → C.7 (rev.).
- `unguardedBridge`: return `undefined` always → G1. Move its call to after `prepareAuth` → G1 (`materialised.length === 1`: a key was written
  for a call that was then refused).
- `sshDepsFor`: add `bridgedSshConfig: () => ({ cwd: '', configFile: '' })` → G2.
- `notePersonsAct`: drop the `if` → V1. Invert it → V2.
- S1: set `asksAfterConsent: true` on `dbQueryAction` → S1.

#### F.9 Order, counts, gates, the merge conditions and the PR

Order: D.5 (`EVICTION_ORDER`, A4, Q2) → D.7 (T3) → D.8 (C.7 revised) → D.6 (X3) → D.9 (`itestSshd.cjs`, `itestForwardAgent.cjs`; CI's) →
D.10 (S1) → the read shape (`BridgeEntry`, `BRIDGE_ENTRY_FIELDS`, `narrowed`; `BRIDGE_READ_SHAPES`, `BRIDGE_BYTE_EQUAL_READS`; `fullVault`;
RS1-RS7) → the guard (`SshUseDeps`, `unguardedBridge`; the stub writer and `noConfigWriter`; G1, G2) → `notePersonsAct` (V1, V2) → the
CHANGELOG entry → lint, `wc -l`, ratchet, the pre-PR block. Every RED row is watched failing first, in the order above, and its failure
message kept for the PR.

| File | Today (`a68b47e`) | After |
|---|---|---|
| `credsAgentServer.ts` | 789 | **789** (`:495`, `:697` in place) |
| `extension.ts` | 1003 | 1003 (the ratchet baseline) |
| `bridgeScope.ts` | 345 | ≈ 395 |
| `bridgeAllowList.ts` | 122 | ≈ 140 |
| `sshUseActions.ts` | 380 | ≈ 398 |
| `grantRegistry.ts` | 344 | ≈ 346 |
| `brokerBridgeToken.ts` | 63 | ≈ 73 |
| `brokerRequests.ts` | 285 | ≈ 297 |
| `vpnRun.ts` | 262 | ≈ 268 |
| `itestSshd.cjs` | 184 | ≈ 190 |
| `itestForwardAgent.cjs` | 194 | ≈ 200 |
| `test/bridgeLinksWorld.ts` | 149 | ≈ 160 |
| `test/bridgeWallWorld.ts` | 464 | ≈ 510 |
| `test/bridgeReadShape.test.ts` | — | ≈ 220 (new) |

Every function stays under the complexity limit of 4 without a new disable comment: `narrowed` 1, `removeKeyFile` 4, `unguardedBridge` 3,
`notePersonsAct` 2, `tokenStatusNow` 3, `unanswered` 2; `run` is already exempt and its line count does not grow (both edits are in place).
No file nears 800 (`eslint.config.mjs:30`); test files are under the same ceiling and the largest touched is `bridgeWallWorld.ts` at ≈ 510.

The commands, from the E1 document's §The commands, at lowered priority: `npm run typecheck`, `npm run lint`, `npm run ratchet`, `npm test`,
then the pre-PR block whole:

```bash
cd "$(git rev-parse --show-toplevel)"
LP=$PWD/.claude/rules/shared/tools/low-priority.mjs
node $LP dotnet build dew_flow_creds_for_devs.slnx -c Debug -m:4 --disable-build-servers
node $LP ./src_broker_client/tests/bin/Debug/net10.0/CredsBroker.Tests
cd src_vs_code && npm test && npm run itest:agent && npm run itest:cli && npm run itest:mcp && npm run itest:ssh-agent
cd .. && git fetch https://github.com/oleksandrdubyna88/dew_flow_creds_for_devs.git main:refs/remotes/origin/main
git diff --exit-code origin/main -- src_vs_code/scripts/creds-cli-itest.cjs src_cli src_mcp src_broker_client install.sh && echo "clients pinned"
node .claude/rules/shared/tools/plan-lifecycle.mjs && node .claude/rules/shared/tools/pin-check.mjs
```

The fetch is over HTTPS because `origin` is an SSH remote and SSH to GitHub times out from this machine; `origin/main` is then the merge
base the diff is taken against, not a local `main` branch that may be stale.

**The partial-E1 merge conditions (parent §2.1 Q7, `## Epics` E1):** R1 green (`bridgeBoundary.test.ts:155`: nothing in `extension.ts` or
`commands/*.ts` names `openBridgeListener` or `bridgeWall`, and `package.json` has no bridge command), R4 green (`:234`: a broker with no wall
cannot open a bridge and binds nothing), and the diff line above printing `clients pinned`, so the clients, the CLI itest and `install.sh` are
byte for byte `main`'s. Together they are the reachability proof the parent asks for: no production code opens a bridge door, no released
client changed, and a bridged exec, were a door to exist, is refused by F.4's guard before any spawn.

**The PR body states, in this order:** (1) that this is partial E1 (E1.1-E1.3 with Amendments 2-3 and this closing commit) under Q7, and that
E1.4, E1.5 and E1.6 follow as one PR each; (2) R1 and R4 by test name and the diff line's output; (3) that every bridged `exec` is refused by
the §4.9 guard until E1.6, with G1's body and journal line quoted; (4) the CHANGELOG list of F.6, and that the timeout sentence it carries is
`main`'s own until E1.5; (5) each RED row's failure message and its pass, and the break-its with both outputs; (6) that D.3 went to E1.5 and
why (F.1), that M4 is still owed by the person (E1.1), and that the local MCP door still serves `connectionString` and `command` to a local
agent (the parent's §8 todo, not this PR); (7) the `coai` code round's verdicts and how many reviewers answered, every finding resolved;
(8) that E1.3 is finished with this commit and what remains of E1 is the three stories.

#### F.10 Opus checklist, added to §S3.9

`narrowed` has no spread and returns `BridgeEntry`; `BRIDGE_ENTRY_FIELDS` has nineteen entries and the row test compares sets, not order;
`BRIDGE_READ_SHAPES` names the four walled reads and `BRIDGE_BYTE_EQUAL_READS` the three unwalled ones, and RS6 pins that they cover the
served GET routes exactly; the read-shape test parses the served JSON, never the in-process object; `hasConnectionString` is read from the
local row's stripped string, never from the keychain; the main-port listing is compared with `visibleMcpEntries` over the same vault; `mcpEntries.ts`
is untouched; `unguardedBridge` is called before `acquireExecSlot` and `prepareAuth` and after `unusableEntity`, and goes through `bridgedRefusal`;
the guard's code is `denied`; `sshDepsFor` hands no writer; the stub writer in `linksWorld` is never called on this tree and G1 says so; the
pending-call tier is the last call tier; `tokenStatusNow` calls `get`, never `lookup` or `reserve`; `unanswered` puts nothing of the error in
the body and writes its line through `log`, not `respondError`; the inner `try` of `removeKeyFile` wraps the note only, and `release()` stays
last in `run`'s `finally`; `notePersonsAct` is the only call of `noteUserActivity` in `vpnRun.ts`; S1 derives its words from `BRIDGE_ROUTES` and
loads the real factories; the CHANGELOG entry's last bullet says the timeout sentence is unchanged; `credsAgentServer.ts` is 789 and
`extension.ts` 1003 after the commit; the pre-PR diff line printed `clients pinned`.

#### F.11 Not verified by this spec

That ESLint's `complexity` counts a `catch` clause as this spec does (if it does not, `removeKeyFile` is 3 and nothing changes); that the
released `creds-mcp` drops the two new booleans and reads `Folder: ''` as its remark says (`McpJsonContext.cs:46-49`; read, not run against a
bridge, which no released client can reach before E2); the CHANGELOG merge with `main`'s `### Fixed — security` entry (both go under
`## [Unreleased]`; a textual conflict there is resolved by keeping both); D.9's two legs against a live `sshd` (CI's); whether `stored(raw)` is the
right mint for the wall world's `getDbConnection` or `plainText` wants another form (the coder reads `storedSecret.ts` and
`agentUseActions.test.ts:37`, which seeds one); that `BridgedSshConfigWriter`'s parameter is the one E1.6 wants (it is E1.6's to widen, and
nothing on this tree calls it, so a change there costs one type).
