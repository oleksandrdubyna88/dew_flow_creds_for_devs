import { encodeString, keyTypeOf } from '../sshAgentProtocol';

/**
 * The bytes an SSH client hands an agent to sign for a public-key login (RFC 4252 §7, and OpenSSH
 * `PROTOCOL` §3.1 for the host-bound form) — ONE builder for every test that needs a userauth
 * request, so the protocol suite and the server suite cannot drift into two different ideas of
 * what a well-formed one looks like.
 *
 * <p>The method names are written as literals on purpose: they are the wire contract, and a test
 * that imported the constants under test would stay green if one of them were misspelt.</p>
 */
export const PUBLICKEY_METHOD = 'publickey';
export const HOSTBOUND_METHOD = 'publickey-hostbound-v00@openssh.com';

export interface UserauthParts {
  /** The public key blob the request names — the key the client wants a signature from. */
  blob: Buffer;
  /** The server host key blob, for the host-bound method. Left out, nothing is appended. */
  hostKey?: Buffer;
  method?: string;
  /** The `has_signature` boolean. A request meant to be signed carries TRUE. */
  hasSignature?: boolean;
  user?: string;
  service?: string;
  /** The signature algorithm; defaults to the blob's own type. (RSA says `rsa-sha2-256` here.) */
  algorithm?: string;
  /** The session id's length in bytes (default 32, a SHA-256 exchange hash). */
  sessionIdLength?: number;
  /** The message number after the session id; 50 (SSH_MSG_USERAUTH_REQUEST) unless a test says otherwise. */
  messageType?: number;
  /** Bytes after the last field — a request with a tail is not the request OpenSSH sends. */
  trailing?: Buffer;
  /** Stop after the method field: the short form an earlier, prefix-only parser accepted. */
  upTo?: 'method';
}

type Resolved = Required<Pick<UserauthParts, 'user' | 'service' | 'method' | 'hasSignature' | 'algorithm'>> &
  UserauthParts;

const DEFAULTS = { user: 'git', service: 'ssh-connection', method: PUBLICKEY_METHOD, hasSignature: true };

/** `session-id || 50 || user || service || method` — all the earlier prefix parse ever read. */
function head(p: Resolved): Buffer {
  return Buffer.concat([
    encodeString(Buffer.alloc(p.sessionIdLength ?? 32, 7)), // session id
    Buffer.from([p.messageType ?? 50]), // SSH_MSG_USERAUTH_REQUEST
    encodeString(p.user),
    encodeString(p.service),
    encodeString(p.method),
  ]);
}

/** The host key (host-bound only) and whatever else follows the key blob. */
function afterTheKey(p: Resolved): Buffer[] {
  const hostKey = p.hostKey === undefined ? undefined : encodeString(p.hostKey);
  return [hostKey, p.trailing].filter((part): part is Buffer => part !== undefined);
}

/** The parts that were actually given: an explicit `undefined` means "not given", never "empty". */
function given(parts: UserauthParts): UserauthParts {
  return Object.fromEntries(Object.entries(parts).filter(([, value]) => value !== undefined)) as UserauthParts;
}

export function userauth(parts: UserauthParts): Buffer {
  const p: Resolved = { ...DEFAULTS, algorithm: keyTypeOf(parts.blob) ?? '', ...given(parts) };
  if (p.upTo === 'method') {
    return head(p);
  }
  return Buffer.concat([
    head(p),
    Buffer.from([p.hasSignature ? 1 : 0]),
    encodeString(p.algorithm),
    encodeString(p.blob),
    ...afterTheKey(p),
  ]);
}
