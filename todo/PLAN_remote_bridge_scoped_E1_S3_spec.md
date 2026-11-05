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
`pinProtected: true` with a sealed value) and `j1` (ssh, `host: 'jump.corp.com'`, `user: 'hop'`, or the invalid host `'bad host!'`), all in
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
| L3 | A jump host out of scope | `j1` valid: bridge → 200, argv has `-J hop@jump.corp.com`, the body does not carry `jump.corp.com`'s entry name. `j1` with `'bad host!'`: bridge → generic body; main → `The jump host "jump" cannot be used…` (control) | the body names the jump host |
| L4 | `agentForward` refused twice | `e1.agentForward: true`: bridge → 403 `denied`, `AGENT_FORWARD_REFUSED('prod')`, `w.dialogs` empty (the wall refused first), `runSshExec` never called. The same with `entryRefusal` stubbed to answer `undefined`: a dialog, then the action refuses with the same sentence. Main port: runs with `-A` (control) | runs with `-A` through the bridge |
| L5 | `ssh`'s stderr stays | The runner stub answers `stderr: 'kex_exchange_identification: jump.corp.com'`: the body carries it, through the bridge too (the decision, pinned) | compiles with L1 |
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
