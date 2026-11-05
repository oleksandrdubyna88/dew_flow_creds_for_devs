# PLAN — E1.2 spec: the per-bridge listener, the third door, the key, `BridgeContext`

> Status: **plan only, nothing implemented yet, 2026-11-04 — security spec by Fable (authentication: the key), written before its code.**
> Story E1.2 of [PLAN_remote_bridge_scoped_E1.md](PLAN_remote_bridge_scoped_E1.md) (parent [PLAN_remote_bridge_scoped.md](PLAN_remote_bridge_scoped.md) §4.1).
> Shorter than the E1.3 spec on purpose: the E1 document settles E1.2's door order, sentences, door table and scenarios D1–D11, and
> this file repeats none of it. It carries what E1 left open, what it overturns, and the exact shapes a Sonnet coder needs.
> Where this spec differs from the E1 document, this spec wins and says why. **E1.2 lands before E1.3**; the E1.3 spec
> ([PLAN_remote_bridge_scoped_E1_S3_spec.md](PLAN_remote_bridge_scoped_E1_S3_spec.md)) builds on the shapes here.
>
> Scope: `src_vs_code/src` — new `bridgeContext.ts`, `bridgeNote.ts` (one constant), `brokerBridgeListeners.ts`, `bridgeAllowList.ts`
> (one route and `refusedOnBridge`); `brokerOrigin.ts`; `brokerRequests.ts` (receives `readBody`); `credsAgentServer.ts` (+14 against the
> 17 the move frees). No `extension.ts` line, no hook, no UI. E1.1 is on branch `feat/remote-bridge-e1-s1`; nothing here touches
> `agentUseActions.ts`, `envApplyNotice.ts`, `envCollectionRef.ts`, `useActions.ts:90`, `credsAgentServer.ts:535-554` or `brokerProtocol.ts:95`.

Every path is relative to `src_vs_code/src/`; every `file:line` was opened on commit `fe86db8`.

## S2.0 — Facts this spec rests on

| # | Fact (verified) | Consequence |
|---|---|---|
| G1 | `behindTheDoor` (`brokerOrigin.ts:44-57`) and `turnAwayAtTheDoor` (`:108-121`) call `admitsRequest(headers, at)` and respond through the broker's `respond` with `errorBody('forbidden', …)` and `Connection: close`; `doorsFor` (`:75-92`) owns the one `said` flag; neither is exported. `brokerOrigin.test.ts:19,84,105` read `admitsRequest(...)` as `=== undefined` or `?.message`, never by deep equality. | The decision becomes a function parameter; `DoorRefusal` may gain an optional field without breaking a test; the two notes keep one closure. |
| G2 | `startLoopbackServer` (`loopbackServer.ts:13-22`) binds `127.0.0.1` on an OS port and resolves `{ server, port }`; the broker attaches the door with `server.on('request', …)` (`credsAgentServer.ts:196`); `startExtraListener.close` only calls `server.close()` (`brokerListeners.ts:92-99`). | A bridge listener is the same eight lines plus `closeAllConnections()`, which the socket listener never needed. |
| G3 | `handle` is 43 code lines (`credsAgentServer.ts:435-489`) against a 50-line ceiling; `dispose` (`:747-753`) is synchronous; `readBody` (`:756-772`) is 17 lines and is imported nowhere else. | The route guard in `handle` is one three-line `if`; `closeAll()` is synchronous; the move frees 17 lines. |
| G4 | Node lower-cases header names and joins a repeated custom header with `, `; `IncomingHttpHeaders` types a value as `string | string[] | undefined`. | A repeated or array-valued `X-Creds-Bridge` compares unequal and never throws. |
| G5 | `timingSafeEqual` throws on buffers of different length. | Both sides are hashed first; the compare is over two 32-byte digests. |
| G6 | `bridgeRouteRefusal` is read by `handle` before any body is read (E1 §E1.2 item 6); the body stays unread, as at `brokerOrigin.ts:105-106`. | `Connection: close` on every allow-list refusal. |

## S2.1 — The E1 document's choices, judged

1. **The key is not in `BridgeContext` — upheld.** The door compares it; nothing behind the door needs it; a context now rides a grant
   (E1.3) and reaches `describe`, the modal and `UseActionContext`. §S2.2 adds the validation E1 left unsaid: `freezeBridgeContext`
   refuses an empty `bridgeId`, `accountId`, `serverEntityId` or `serverName`, because E1.3's `Scope.admits` and E1.4's `stampKey`
   compare these strings and an empty one would be a key that matches by accident.
2. **Browser marks → no key → wrong key → `Host` — upheld.** All four answers are 403 with a fixed sentence and nothing routed; a
   rebound page is caught by `Sec-Fetch-Site` before the key is looked at; an old `creds` (no key, `Host: 127.0.0.1:1`) hears "update".
3. **A key per open, dying with the listener; `closeAllConnections()` on close — upheld.** Added: a listener opened after `closeAll()`
   must not survive it (§S2.3), which E1 did not say and which a reconnect racing `dispose` would otherwise produce.
4. **Serialized opens per `bridgeId` — upheld, made exact (§S2.3).** E1 says "reserved before the first await"; the mechanism is a
   per-id promise chain, and the superseded listener is closed *before* the new one is returned, so no moment exists in which two
   listeners for one id both serve.
5. **The six-line route guard inline in `handle` — overturned.** `handle` would reach 49 code lines before E1.3 adds its three, and the
   ceiling is 50 (G3). The guard is a pure `refusedOnBridge` in `bridgeAllowList.ts` and one three-line `if` in `handle` (§S2.2, §S2.5).
6. **`refusedOnBridge` refuses without a journal line — upheld**, as every refusal without a grant (`credsAgentServer.ts:702-704`).
7. **The key refusal's own once-per-window note — upheld.** How the two notes are told apart was unsaid: `DoorRefusal` gains an
   optional `kind: 'key'` (§S2.2). `admitsRequest` keeps answering `{ message: REFUSED }` with no `kind`, so the existing doors are
   byte-for-byte unchanged (R3, D3).

## S2.2 — Types and signatures

```ts
// bridgeContext.ts (pure)
export interface BridgeContext {
  readonly bridgeId: string;        // random per open (E2 mints it); non-empty
  readonly accountId: string;       // non-empty
  readonly serverEntityId: string;  // the vault entry's id: the only server identity; non-empty
  readonly serverName: string;      // for the modal and the audit line; decides nothing; non-empty
  readonly target: string;          // user@host:port, for E2's restore comparison; may be ''
  readonly remoteOs: string | undefined;
}
/** A frozen copy. Throws `Error('A BridgeContext needs a non-empty <field>.')` for the first empty one of the four named fields. */
export function freezeBridgeContext(context: BridgeContext): Readonly<BridgeContext>;

// bridgeNote.ts (pure) — this story: the one constant; E1.3 adds the rest
export const BRIDGE_KEY_HEADER = 'X-Creds-Bridge';

// brokerOrigin.ts
export type Handle = (req: IncomingMessage, res: ServerResponse, bridge: BridgeContext | undefined) => void;
export interface DoorRefusal { readonly message: string; readonly kind?: 'key'; }   // absent = the browser/Host refusal, as today
export interface Doors {
  readonly onThePort: Served;
  readonly onTheSocket: Served;
  forBridge(port: number, key: string, context: BridgeContext): Served;
}
export function doorsFor(handle: Handle, port: () => number, respond: (res, status, body) => void, note: (message: string) => void): Doors;
/** The bridge door's decision, in this order: browser marks → REFUSED; no header → BRIDGE_NO_KEY; key differs → BRIDGE_WRONG_KEY; Host → REFUSED. */
export function admitsBridgeRequest(headers: IncomingHttpHeaders, at: { readonly port: number; readonly key: string }): DoorRefusal | undefined;
export const BRIDGE_NO_KEY: string;      // E1 §E1.2 item 3, verbatim
export const BRIDGE_WRONG_KEY: string;   // E1 §E1.2 item 3, verbatim

// brokerBridgeListeners.ts (pure: node:http, node:crypto, startLoopbackServer)
export interface BridgeListener {
  readonly port: number;
  readonly key: string;             // randomBytes(32).toString('base64url'), 43 characters
  /** `server.close()` and `server.closeAllConnections()`; resolves when closed; a second call resolves to the same promise. */
  close(): Promise<void>;
}
export class BridgeListeners {
  constructor(
    doorFor: (port: number, key: string, context: BridgeContext) => Served,
    start: () => Promise<{ server: http.Server; port: number }> = startLoopbackServer,   // injected for the overlap test
  );
  /** One listener per open; opens for one `bridgeId` run one after another (§S2.3). Rejects after `closeAll()`. */
  open(context: BridgeContext): Promise<BridgeListener>;
  /** Synchronous: every live listener is closed (G3's `dispose`); later opens reject with `Error('The broker is disposed; no Remote Bridge can open.')`. */
  closeAll(): void;
  /** The live listeners' ports, for tests. */
  ports(): readonly number[];
}

// bridgeAllowList.ts (pure) — this story's part; E1.3 fills the table
export const BRIDGE_NOT_SERVED: string;  // E1 §E1.2 item 5, verbatim
/** `undefined` admits. This story knows exactly `GET /v1/health`; everything else answers `{ code: 'not_supported', message: BRIDGE_NOT_SERVED }`. */
export function bridgeRouteRefusal(method: string | undefined, pathname: string): { code: ErrorCode; message: string } | undefined;
/**
 * The guard `handle` calls first. Off a bridge: `false`, nothing called. On a bridge: `false` when served; else `Connection: close`,
 * `respond(code, message)`, `true`. The body is never read.
 */
export function refusedOnBridge(
  bridge: BridgeContext | undefined, method: string | undefined, pathname: string,
  res: { setHeader(name: string, value: string): void }, respond: (code: ErrorCode, message: string) => void,
): boolean;
```

**`brokerOrigin.ts` internals.** `behindTheDoor(handle, decide: (headers) => DoorRefusal | undefined, respond, note: (refusal: DoorRefusal) => void, bridge: BridgeContext | undefined)`;
`turnAwayAtTheDoor(refusal, respond, res)` takes the decision instead of making it. `doorsFor` keeps two flags: `once()` for the
browser note (`REFUSAL_NOTE`) and `onceKey()` for the key note (E1 §E1.2 item 3's sentence), chosen by `refusal.kind === 'key'`.
`onThePort` → `behindTheDoor(handle, (h) => admitsRequest(h, { port: port() }), respond, once, undefined)`; `onTheSocket` the same with
`NOT_ON_THE_NETWORK`; `forBridge(port, key, context)` → `behindTheDoor(handle, (h) => admitsBridgeRequest(h, { port, key }), respond, noteFor, context)`.
`admitsRequest`, `browserMarked`, `loopbackHost`, `REFUSED`, `REFUSAL_NOTE` are unchanged.

**`admitsBridgeRequest`**: `browserMarked(headers)` → `{ message: REFUSED }`; `given = headers['x-creds-bridge']`; `given === undefined` →
`{ message: BRIDGE_NO_KEY, kind: 'key' }`; `typeof given !== 'string' || !sameKey(given, at.key)` → `{ message: BRIDGE_WRONG_KEY, kind: 'key' }`;
`!loopbackHost(headers.host, at)` → `{ message: REFUSED }`; else `undefined`. `sameKey(a, b)` = `timingSafeEqual(sha256(a), sha256(b))`
over `createHash('sha256').update(x, 'utf8').digest()` — no early return on length (G5), an empty string is a wrong key.

## S2.3 — The serialized-open rule, exactly

`BridgeListeners` holds `turns: Map<bridgeId, Promise<unknown>>`, `live: Map<bridgeId, Live>` (`Live = { listener, server }`), `disposed = false`.

`open(context)`:
1. `const id = context.bridgeId; const prior = this.turns.get(id) ?? Promise.resolve();`
2. `const turn = prior.then(() => this.openNow(context), () => this.openNow(context));` — the chain is **set before any await**:
   `this.turns.set(id, turn.then(() => undefined, () => undefined));` so a third open waits for the second whatever became of it.
3. `return turn;`

`openNow(context)`:
1. `if (this.disposed) throw new Error('The broker is disposed; no Remote Bridge can open.')`.
2. `const { server, port } = await this.start();` then, if `this.disposed` became true meanwhile: `server.close(); server.closeAllConnections(); throw` the same error.
3. `const key = randomBytes(32).toString('base64url'); server.on('request', this.doorFor(port, key, context));`
4. `const previous = this.live.get(id); const next = { listener, server }; this.live.set(id, next);`
5. `if (previous !== undefined) { await previous.listener.close(); }` — the superseded listener is dead before the new one is handed out.
6. `return next.listener;`

`listener.close()`: memoised; `server.close()` and `server.closeAllConnections()`; removes `live.get(id)` only when it is this very entry
(a later open's entry stays). `closeAll()`: `disposed = true`; for every live entry `server.close(); server.closeAllConnections();`
synchronously; `live.clear()`.

Why the chain and not a lock: two opens for one id can overlap when a reconnect (E2.2) starts before the previous attempt's `start()`
resolved; without the chain a map write drops the earlier server without closing it, leaving its port and key usable.

## S2.4 — Door refusals: statuses, sentences, notes

All door refusals: 403, code `forbidden`, `Connection: close`, nothing routed, no journal line except the once-per-window notes.
`REFUSED`, `BRIDGE_NO_KEY`, `BRIDGE_WRONG_KEY` and the key note are the E1 document's texts, verbatim. The allow-list refusal in this
story: 404 `not_supported` `BRIDGE_NOT_SERVED`, `Connection: close`, for every method and path but `GET /v1/health`.

## S2.5 — `credsAgentServer.ts`, every edit, counted

| Where | Edit | Lines |
|---|---|---|
| `:756-772` | `readBody` moves, as it is, to `brokerRequests.ts` and is exported; `:28` imports it on the existing line | −17 |
| imports | `import type { BridgeContext } from './bridgeContext';` `import { BridgeListener, BridgeListeners } from './brokerBridgeListeners';` `import { refusedOnBridge } from './bridgeAllowList';` | +3 |
| `:435` | `private async handle(req, res, bridge: BridgeContext \| undefined): Promise<void>` | 0 |
| after `:438` | `if (refusedOnBridge(bridge, req.method, url.pathname, res, (code, message) => this.respondError(res, code, message))) {` `return;` `}` | +3 |
| `:670-675` | `(req, res, bridge) => void this.handle(req, res, bridge),` | 0 |
| before `doors` | `/** One listener per open bridge, each behind its own door (brokerBridgeListeners.ts). */` `private readonly bridgeListeners = new BridgeListeners((port, key, context) => this.doors.forBridge(port, key, context));` | +2 |
| after `openExtraListener` | `/** A listener for one bridge. E2.2 is its first caller; nothing in this build calls it (R1). */` `readonly openBridgeListener = async (context: BridgeContext): Promise<BridgeListener> => {` `await this.ensureStarted();` `return this.bridgeListeners.open(context);` `};` | +5 |
| `:747-753` `dispose` | `this.bridgeListeners.closeAll();` after `this.abort.abort();` | +1 |
| | **Total** | **+14, net −3** |

`handle` ends at 43 + 3 = 46 code lines; E1.3 adds 3 more (its spec §S3.6). The file ends at 776 after this story. E1.3's R4 guard
(three lines at the top of `openBridgeListener`) is counted in E1.3's budget, because the hook it tests is E1.3's.

## S2.6 — Scenarios

D1–D11 of the E1 document, as written, in `test/brokerBridgeDoor.test.ts` (decisions on headers) and `test/brokerBridgeListeners.test.ts`
(real HTTP through `raw` of `test/brokerOriginDoor.test.ts:15-27` for the `Host` cells, `call` of `brokerWorld` for the rest). R1–R3 in
`test/bridgeBoundary.test.ts`, R3 written first and watched GREEN on untouched code. Added here:

| # | Scenario | Expected | RED first, because |
|---|---|---|---|
| D12 | Two overlapping opens for one `bridgeId` | `start` injected to resolve the first `listen` only after the second `open` was called. Both resolve; the second's port and key serve `GET /v1/health`; the first's port refuses connections and its key on the second's port is `BRIDGE_WRONG_KEY`; `ports()` has one entry | without the chain both ports serve |
| D13 | `open` after `closeAll` | Rejects with the disposed sentence; `ports()` is empty; an `open` whose `start` resolves after `closeAll` leaves no listening port | without step 2 of `openNow` a port survives dispose |
| D14 | `refusedOnBridge` off a bridge | `bridge: undefined` with `POST /v1/config/read`: `false`, `respond` never called, `setHeader` never called. On a bridge with `GET /v1/health`: `false`; with `POST /v1/use/exec`: `true`, `Connection: close`, `respond('not_supported', BRIDGE_NOT_SERVED)` | pure, new |
| D15 | `freezeBridgeContext` | An empty `bridgeId`, `accountId`, `serverEntityId` or `serverName` throws naming the field; `target: ''` is accepted; the result is frozen and has no `key` | pure, new |
| D16 | The second door is a repeated header | `X-Creds-Bridge` sent twice with the right value: `BRIDGE_WRONG_KEY` (G4) | written before the compare exists |

Commands: E1's common block with `<name>` = `bridgeBoundary`, `brokerBridgeDoor`, `brokerBridgeListeners`, `brokerOrigin`, `brokerOriginDoor`,
`credsAgentServer`, `brokerRequests`; `wc -l src/credsAgentServer.ts` (776).

## S2.7 — Break-its on the key (mutate, watch the named case fail, restore; both outputs in the PR)

| # | Attack | Mutation | Red case | Symptom |
|---|---|---|---|---|
| K1 | Any local process reaches the port | `admitsBridgeRequest` skips the key steps | D1 (no-key and wrong-key columns) | admitted with `Host: 127.0.0.1:<bp>` and no key |
| K2 | A length oracle or a crash | compare raw strings with `timingSafeEqual` (no hash), or with `===` | D2 (another length): 500 instead of 403; D2 stays green under `===`, so the checklist pins the digest compare | a throw out of the door |
| K3 | A reused key | `key` a module constant or derived from `bridgeId` | D4 | A's key admitted on B's port; the old key admitted after a re-open |
| K4 | A key that outlives its listener | `close()` without `closeAllConnections()` | D5 | the kept-alive connection still gets a 200 |
| K5 | A claimed identity | `handle` reads `X-Creds-Server` / a query string into the context, or `behindTheDoor` passes `undefined` for `forBridge` | D7, D8 | the spy sees a header's value |
| K6 | The existing doors acquire a context | `onThePort` passes a context; or `handle`'s third parameter gets a default | D7 (port and socket see `undefined`), R3 | a context off a bridge |
| K7 | `Host` before the key | swap steps 2–3 with step 4 | D1 row `127.0.0.1:1`, no-key column: `REFUSED` instead of `BRIDGE_NO_KEY` | an old `creds` is told it looks like a browser |
| K8 | Two listeners for one id | drop the `turns` chain | D12 | both ports serve |
| K9 | A listener born after dispose | drop step 2's re-check in `openNow` | D13 | a listening port after `closeAll` |
| K10 | The body read before refusal | `refusedOnBridge` after `readBody`, or without `Connection: close` | D9, D14 | a keep-alive socket holding an unread body |
| K11 | The wider surface before E1.3 | `bridgeRouteRefusal` admits every GET | D9 | `GET /v1/aliases` answers 200 through the bridge |
| K12 | A browser through the bridge | drop `browserMarked` from `admitsBridgeRequest` | D1 (`Origin`, `Sec-Fetch-Site` rows) | a page with the key (it cannot have it, but the door must not depend on that) admitted |

## S2.8 — Opus review checklist for the code

- `bridgeContext.ts`, `bridgeNote.ts`, `brokerBridgeListeners.ts`, `bridgeAllowList.ts` import no `vscode` (R2); `BridgeContext` has no
  `key`; `freezeBridgeContext` refuses the four empty fields.
- `brokerOrigin.ts`: `behindTheDoor` and `turnAwayAtTheDoor` still unexported; `doorsFor` the only way to a door; `admitsRequest`,
  `browserMarked`, `loopbackHost`, `REFUSED` untouched; `admitsBridgeRequest` in the order of §S2.2; the compare is `timingSafeEqual`
  over two SHA-256 digests; a non-string header value is a wrong key; two `said` flags, one closure.
- `brokerBridgeListeners.ts`: §S2.3 step by step — the `turns` entry set before the first `await`; `openNow` re-checks `disposed` after
  `start()`; the previous listener is closed before the new one is returned; `close()` memoised, calls both `close` and
  `closeAllConnections`; `closeAll()` synchronous.
- `credsAgentServer.ts`: exactly the edits of §S2.5; `handle` ≤ 46 code lines; `onThePort` and `onTheSocket` reach `handle` with an
  explicit `undefined`; `dispose` closes the bridge listeners; the file is 776 lines; `readBody` exists once, in `brokerRequests.ts`.
- `refusedOnBridge` is called before `readRouteBody` and before any `readBody`; off a bridge it returns `false` without touching `res`.
- R3's expected literals were recorded on untouched code and no expected value changed; D3 passes; `scripts/creds-cli-itest.cjs` untouched;
  `git diff --exit-code main -- src_cli src_mcp src_broker_client install.sh` empty.
- Nothing calls `openBridgeListener` in production (R1); `extension.ts` unchanged; `npm run ratchet` green.
- No edit in the hunks E1.1 owns (`credsAgentServer.ts:535-554`, `useActions.ts:90`, `brokerProtocol.ts:95`, `extension.ts`).

## S2.9 — Decisions closed

1. The key is 32 random bytes, base64url, minted per open inside `openNow`; it is compared by digest and never logged or returned.
2. A `BridgeContext` with an empty identity field cannot be built.
3. Opens for one `bridgeId` are chained; a superseded listener is closed before its successor is returned; nothing opens after `closeAll`.
4. The route guard is pure and three lines in `handle`; the body is never read for a refused route.
5. E1.3 owns the R4 guard and its three lines; this story's `openBridgeListener` has none.

## S2.10 — Not verified by this spec

- `handle`'s code-line count (43 today) is a hand count under ESLint's skip rules; `npm run lint` decides.
- Node's `, ` join for a repeated custom header is from its documentation; D16 is the check.
- `server.closeAllConnections()` ending a kept-alive connection mid-wait is Node ≥ 18.2 behaviour, not run here; D5 is the check.

## S2.11 — As built (Sonnet, 2026-11-05)

Built as specified, with these differences. None changes what the door decides.

1. **`admitsBridgeRequest` is two functions.** Written inline it has complexity 6 against the limit of 4. The key steps are
   `keyRefusal(given, key)`, and `admitsBridgeRequest` is the browser mark, then `keyRefusal(...) ?? Host`. Same order, same answers.
   The header name is `BRIDGE_KEY_HEADER.toLowerCase()`, not a second literal.
2. **`credsAgentServer.ts` is 776 lines, `handle` 46 code lines**, as counted. The move also drops the now-unused
   `MAX_REQUEST_BODY_BYTES` import (`noUnusedLocals`), which the §S2.5 table does not list; the total still lands on 776.
3. **D5 cannot be written with an idle keep-alive agent alone.** On this runtime (Node 26) `server.close()` already ends *idle*
   connections, so K4 would survive such a test. D5 holds a socket that has been answered once and is part-way into its next
   request; `close()` alone leaves it open, `closeAllConnections()` ends it. A second case does the same for `closeAll()`
   (the dispose path), which the table had no break-it for: K4b.
4. **K2 under `===` stays green on behaviour**, as §S2.7 says. It is held by one source-pin test (`timingSafeEqual(sha256(` and
   `createHash('sha256')` in `brokerOrigin.ts`), which proves the digest compare is written, not that it runs in constant time.
5. **`open` validates before it binds**: `freezeBridgeContext` runs first in `openNow`, so an empty identity rejects with no port bound.
6. **R3's expected answers** (every contract route over the port and the socket, a browser-shaped request, a wrong `Host`) are the
   fixture `src/test/fixtures/bridgeBoundary.r3.json`, recorded from untouched code and green before and after the refactor.
   R1 and R2 are in the same file; R2 also covers `brokerOrigin.ts`.
7. Extra mutations run beyond K1-K12: the context not frozen, the empty-field check removed, `dispose` not closing bridge listeners,
   a superseded close deleting its successor's entry, the key note sharing the browser note's flag, the guard inverted, and a
   non-string key stringified. All are caught.

### Review fixes (Sonnet, 2026-11-05, after the Opus review of 547d9e9)

8. **`freezeBridgeContext` builds the object from the six named fields, not by spreading**, and refuses an identity field
   that is not a non-empty string. A missing `serverEntityId` used to pass as `undefined`, and an `undefined` equals another
   `undefined` in E1.3's scope check; it now throws the same sentence as an empty one. `target` must be a string (empty stays
   allowed) and `remoteOs` a string or `undefined` (an absent one stays allowed); both have their own sentence. The earlier
   `'key' in frozen` assertions passed for any input because no input carried a key; the tests now pass one, and a `token` and a
   nested object, and show none arrive.
9. **`openBridgeListener` refuses after dispose before it starts anything.** `BridgeListeners.open(context, prepare)` takes the
   broker's `ensureStarted` as `prepare` and runs it only after the disposed check and after the identity is validated, so a
   late or malformed call no longer binds the main port, writes the endpoint note, opens the journal or creates the output
   channel. `credsAgentServer.ts` is **775 lines** (the table's 776, one fewer: the method body is one `return`), `handle` still 46 code lines.
10. **`openNow` re-checks `disposed` after `await previous.listener.close()`** and rejects with the disposed sentence, so an open
    in flight when `closeAll` lands never resolves with a listener `closeAll` already closed. Three checks now share
    `refuseIfDisposed`. Pinned by holding the first server's `close` callback until `closeAll` has run.
11. **Tests that could not fail now can.** K10 sends `Content-Length: 1000` with five bytes to `POST /v1/use/exec` and needs the
    404 and `Connection: close` before the body completes; with `await readBody(req)` inserted before the guard it times out
    after 2 s. K5 runs the real `handle` (wrapped only to record its third argument) and shows a `X-Creds-Server`, a query and a
    body change nothing; honest limit: `handle` uses the bridge only as "is there one" until E1.3, so what K5 can see is what
    the door hands `handle`, that it is one frozen object for the listener's life, and that the answer is the same. E1.3's
    scenarios must carry K5 on to what the router does with it. D12 now runs three overlapping opens with each `start` released
    in turn, so "the third waits for the second" is asserted by the number of servers started (turns set for the first open
    only: red). D3 repeats on the socket door. R1 walks every non-test source (533 files), excluding only `credsAgentServer.ts`,
    which defines the method and has its own companion. R2's two patterns are named, and a companion shows each spelling of a
    vscode import matches, a lookalike does not, and the broker's own source is seen to import it.
12. **Test harness:** `brokerWorld.ts` counts `createOutputChannel` calls (`outputChannels`), because "the output channel was not
    created" had no way to be seen.
    `brokerBridgeListeners.test.ts` passed the 800-line ceiling with the new cases, so the tests that run the real broker moved to
    `brokerBridgeRealDoor.test.ts` and what both share (`CONTEXT`, `OTHER`, `raw`, `refuses`, `keyed`) to `bridgeDoorHarness.ts`.
