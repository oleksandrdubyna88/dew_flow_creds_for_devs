/**
 * Which Remote Bridge a request came in by, and for which server — handed to the router by the door,
 * never read from the request.
 *
 * <p>Pure: imports no `vscode`. The bridge KEY is deliberately not here. The door compares it and nothing
 * behind the door needs it, and a context rides a grant, reaches `describe`, the modal and the audit line,
 * so a key in it would be a key in a log.</p>
 */
export interface BridgeContext {
  /** Random per open (E2 mints it). Non-empty. */
  readonly bridgeId: string;
  /** Non-empty. */
  readonly accountId: string;
  /** The vault entry's id: the only server identity. Non-empty. */
  readonly serverEntityId: string;
  /** For the modal and the audit line; decides nothing. Non-empty. */
  readonly serverName: string;
  /** `user@host:port`, for E2's restore comparison. May be empty. */
  readonly target: string;
  readonly remoteOs: string | undefined;
}

/**
 * What a grant minted on a bridge door carries, and nothing else (E1.3).
 *
 * <p>`quiet` is the scope's switch AT MINT TIME, for E1.4 to read. There is deliberately no token here: a token a
 * bridged token call spends rides the request (`RequestWho` into `CallSubject.spend`), because a second place a
 * token's secret lives would be a map with a cap and an eviction policy, handed to `describe` and copied into
 * `UseActionContext`. Nested, not intersected with the context, so `grant.bridge?.context` is the context and
 * nothing has to be stripped by hand.</p>
 */
export interface BridgeGrant {
  readonly context: BridgeContext;
  readonly quiet: boolean;
}

/** The four fields that identify the bridge. An empty one would be an identity that matches by accident. */
const IDENTITY_FIELDS = ['bridgeId', 'accountId', 'serverEntityId', 'serverName'] as const;

/** The refusal for the first identity field that is not a non-empty string. A missing field is `undefined`, which is not a string. */
function badIdentity(context: BridgeContext): string | undefined {
  const field = IDENTITY_FIELDS.find((name) => {
    const value: unknown = context[name];
    return typeof value !== 'string' || value === '';
  });
  return field === undefined ? undefined : `A BridgeContext needs a non-empty ${field}.`;
}

/** The two fields that may be empty or absent still have a shape: `target` a string, `remoteOs` a string or `undefined`. */
function badShape(context: BridgeContext): string | undefined {
  if (typeof context.target !== 'string') {
    return 'A BridgeContext needs a string target (it may be empty).';
  }
  return context.remoteOs !== undefined && typeof context.remoteOs !== 'string'
    ? 'A BridgeContext needs remoteOs to be a string or undefined.'
    : undefined;
}

/**
 * A frozen copy built from the six named fields and nothing else, or a refusal naming the first identity
 * field that is empty, missing or not a string.
 *
 * <p>E1.3's scope check and E1.4's stamp key compare these strings; `''` equals `''` and a missing field
 * equals another missing one, so a context built with one would admit whatever else lacked it. Copying by
 * name (not spreading) is what keeps a `key`, or any other property that rode in on the input, out of a
 * value that reaches a grant, a modal and an audit line.</p>
 */
export function freezeBridgeContext(context: BridgeContext): Readonly<BridgeContext> {
  const refusal = badIdentity(context) ?? badShape(context);
  if (refusal !== undefined) {
    throw new Error(refusal);
  }
  const { bridgeId, accountId, serverEntityId, serverName, target, remoteOs } = context;
  return Object.freeze({ bridgeId, accountId, serverEntityId, serverName, target, remoteOs });
}

/** Whitespace, `(`, `)`, the field separator `→`, and every control and format character: what a journal line cannot carry inside its grant group. */
const AUDIT_UNSAFE = /[\s()→\p{Cc}\p{Cf}]+/gu;

/** The most code points of a server's name the journal carries. */
const AUDIT_NAME_POINTS = 40;

/**
 * A server's name as it may stand inside the parentheses of an audit line (E1.4).
 *
 * <p>Every run of whitespace, `(`, `)`, `→` and control or format characters becomes one `_`, and at most forty code
 * points are kept. The grant group of a line is read as `\(([^)]*)\)` and the line is cut at its separator, so a name that
 * kept one of them could end its group or its line early, and `formatAuditLine` would not be the place to find out. An
 * empty result is `_`: a mark that reads `bridge=` would be a line with a bridge and no name.</p>
 */
export function bridgeAuditName(serverName: string): string {
  const flat = Array.from(serverName.replace(AUDIT_UNSAFE, '_')).slice(0, AUDIT_NAME_POINTS).join('');
  return flat === '' ? '_' : flat;
}

/**
 * The grant field of the one line written with no grant: `—` off a bridge, `— bridge=<name>` on one.
 *
 * <p>Takes the CONTEXT, the one the door handed the router and the throttle keyed its window by; a request body has no road
 * to it. (It takes the context rather than the name so the caller needs no `?.` of its own, and the line a refusal writes
 * cannot be given a different name from the window it was refused in.)</p>
 */
export function auditGrantMark(bridge: BridgeContext | undefined): string {
  return bridge === undefined ? '—' : `— bridge=${bridgeAuditName(bridge.serverName)}`;
}
