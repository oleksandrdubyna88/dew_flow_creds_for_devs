/**
 * The words a Remote Bridge shares between the door, the router and the notes it writes.
 *
 * <p>Pure: imports no `vscode`. Constants and one type, because the publisher (E2.2) and the reader (E2.1) are
 * other stories; what this fixes is the SCHEMA, and `scripts/emit-contract.mjs` carries it into
 * `contract/broker-v1.json` so a second implementation reads it instead of guessing.</p>
 */

/** The header a Remote Bridge client sends its per-listener key in. Node lower-cases it on arrival. */
export const BRIDGE_KEY_HEADER = 'X-Creds-Bridge';
/** Under the login user's home on the server, mode 0700 (parent plan §4.3). */
export const BRIDGE_NOTE_DIR = '.creds-for-devs/bridge';
/** The note is `<bridgeId>.json`. */
export const BRIDGE_NOTE_SUFFIX = '.json';

/** Every field of a note and the kind of its value. Frozen: the contract and a reader enumerate it. */
export const BRIDGE_NOTE_FIELDS = Object.freeze({
  socket: 'string',
  port: 'number',
  brokerPort: 'number',
  key: 'string',
  serverName: 'string',
  openedAt: 'string',
} as const);

export interface BridgeNote {
  /** The forwarded unix socket path, this connection's. */
  readonly socket: string;
  /** The bridge listener's port: what a client puts in `Host`. */
  readonly port: number;
  /** The main broker's port: how a token call finds its window (parent plan §4.5). */
  readonly brokerPort: number;
  /** The value of `X-Creds-Bridge`, base64url, 43 characters. */
  readonly key: string;
  /** The server entry's name, for the client's messages; it decides nothing. */
  readonly serverName: string;
  /** ISO 8601, UTC. */
  readonly openedAt: string;
}

type SameSet<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/** A compile-time assertion: a field added to the type and not to the table (or the other way) stops the build here. */
const FIELDS_MATCH_THE_TYPE: SameSet<keyof BridgeNote, keyof typeof BRIDGE_NOTE_FIELDS> = true;
void FIELDS_MATCH_THE_TYPE;
