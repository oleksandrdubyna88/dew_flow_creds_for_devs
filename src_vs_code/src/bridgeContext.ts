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

/** The four fields that identify the bridge. An empty one would be an identity that matches by accident. */
const IDENTITY_FIELDS = ['bridgeId', 'accountId', 'serverEntityId', 'serverName'] as const;

/**
 * A frozen copy, or a refusal naming the first identity field that is empty.
 *
 * <p>E1.3's scope check and E1.4's stamp key compare these strings; `''` equals `''`, so a context built
 * with one empty would admit whatever else was empty.</p>
 */
export function freezeBridgeContext(context: BridgeContext): Readonly<BridgeContext> {
  const empty = IDENTITY_FIELDS.find((field) => context[field] === '');
  if (empty !== undefined) {
    throw new Error(`A BridgeContext needs a non-empty ${empty}.`);
  }
  return Object.freeze({ ...context });
}
