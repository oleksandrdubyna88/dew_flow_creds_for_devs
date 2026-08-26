import { keyFingerprintOf } from './sshKeyParse';
import { DEFAULT_SSH_PORT, isSafeSshHost } from './sshCommand';

/**
 * Pinning a host's key, so first contact is a decision rather than a silence (audit **B10**).
 *
 * <p><b>What was wrong.</b> Both connect paths passed `StrictHostKeyChecking=accept-new`, which
 * does exactly what it says: the first key a host offers is accepted, written down, and never
 * mentioned. That is the one moment a man in the middle is cheap — before anything is known — and
 * the extension said nothing at all. Every connection manager people compare this to (Termius,
 * Royal TS) shows the fingerprint and asks.</p>
 *
 * <p><b>What replaces it.</b> The key is fetched with `ssh-keyscan` BEFORE connecting, its
 * fingerprint is shown, and a person says yes. From then on the pin is stored on the entity and
 * enforced with `StrictHostKeyChecking=yes` against a known_hosts file built from it alone — so a
 * changed key fails the connection instead of printing a warning into a scrollback nobody reads.</p>
 *
 * <p>Pure and `vscode`-free. The fingerprint is `SHA256:…`, the same string `ssh-keygen -lf` and
 * the server's own logs print, because a fingerprint nobody can compare against anything is
 * decoration.</p>
 */

/** One key a host offers. `base64` is the wire-format public blob. */
export interface HostKey {
  algorithm: string;
  base64: string;
}

/**
 * Which key types to trust from a scan, best first.
 *
 * <p>Ed25519 before the NIST curves before RSA — the order OpenSSH itself prefers. `ssh-dss` is
 * absent deliberately: it is 1024-bit by specification, disabled in OpenSSH for years, and
 * pinning one would be recording something already broken.</p>
 */
export const PREFERRED_HOST_KEY_TYPES: readonly string[] = [
  'ssh-ed25519',
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
  'rsa-sha2-512',
  'rsa-sha2-256',
  'ssh-rsa',
];

/**
 * A key body is base64 AND substantial.
 *
 * <p>The character check alone is not enough, and its own test said so: `not` is valid base64
 * characters, so a malformed line was being accepted as a pin. The smallest real host key blob
 * (Ed25519) is 51 base64 characters; 32 refuses noise without arguing about key sizes.</p>
 */
const MIN_KEY_BODY = 32;

function isKeyBody(body: string): boolean {
  return body.length >= MIN_KEY_BODY && /^[A-Za-z0-9+/]+={0,2}$/.test(body);
}

function isKeyType(algorithm: string): boolean {
  return (PREFERRED_HOST_KEY_TYPES as readonly string[]).includes(algorithm);
}

/**
 * Read `ssh-keyscan` output.
 *
 * <p>Its comment lines begin with `#`, and a line is `host keytype base64`. The host column is
 * ignored on purpose: what is being pinned is the KEY, and the caller knows which host it asked
 * about — trusting the column would let the answer name a different host than the question.</p>
 */
/** One scan line as a key, or nothing — a comment, a blank, or something that is not a key. */
// eslint-disable-next-line complexity -- a flat list of independent field checks (one clause per field of a keyscan line); splitting reads worse
function keyFromScanLine(line: string): HostKey | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) {
    return undefined;
  }
  const parts = trimmed.split(/\s+/);
  const ok = parts.length >= 3 && isKeyType(parts[1]) && isKeyBody(parts[2]);
  return ok ? { algorithm: parts[1], base64: parts[2] } : undefined;
}

export function parseKeyscan(text: string): HostKey[] {
  return text
    .split(/\r?\n/)
    .map((line) => keyFromScanLine(line))
    .filter((key): key is HostKey => key !== undefined);
}

/** The best key from a scan, by the preference order above. */
export function preferredKey(keys: readonly HostKey[]): HostKey | undefined {
  for (const algorithm of PREFERRED_HOST_KEY_TYPES) {
    const found = keys.find((k) => k.algorithm === algorithm);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** `<algorithm> <base64>` — what is stored on the entity. */
export function formatHostKey(key: HostKey): string {
  return `${key.algorithm} ${key.base64}`;
}

/** Read a stored pin back. `undefined` when it is not a key line at all. */
// eslint-disable-next-line complexity -- a flat list of independent field checks (one clause per field of a stored key line); splitting reads worse
export function parseHostKey(stored: string | undefined): HostKey | undefined {
  const parts = (stored ?? '').trim().split(/\s+/);
  const ok = parts.length >= 2 && isKeyType(parts[0]) && isKeyBody(parts[1]);
  return ok ? { algorithm: parts[0], base64: parts[1] } : undefined;
}

/** `SHA256:…`, exactly as `ssh-keygen -lf` and the server's logs print it. */
export function hostKeyFingerprint(key: HostKey): string {
  return keyFingerprintOf(Buffer.from(key.base64, 'base64'));
}

/**
 * The known_hosts line for this host.
 *
 * <p>A non-default port is written `[host]:port` — the bracketed form is not decoration, it is
 * how known_hosts records a port at all, and a line without it silently fails to match.</p>
 */
export function knownHostsLine(host: string, port: number | undefined, key: HostKey): string | undefined {
  if (!isSafeSshHost(host)) {
    return undefined;
  }
  const target = port !== undefined && port !== DEFAULT_SSH_PORT ? `[${host}]:${port}` : host;
  return `${target} ${key.algorithm} ${key.base64}\n`;
}

export type PinVerdict = 'first-contact' | 'match' | 'mismatch' | 'unreachable';

/**
 * What the scan means for what is stored.
 *
 * <p>The three outcomes are deliberately not two. `first-contact` is an ordinary state that
 * deserves a question; `mismatch` is the state that deserves an alarm; and `unreachable` — the
 * scan answered nothing — is neither, because a host that is down is not a host that changed its
 * key, and treating it as one would train people to click through the alarm.</p>
 */
export function pinVerdict(pinned: string | undefined, scanned: HostKey | undefined): PinVerdict {
  if (scanned === undefined) {
    return 'unreachable';
  }
  const current = parseHostKey(pinned);
  if (current === undefined) {
    return 'first-contact';
  }
  return sameKey(current, scanned) ? 'match' : 'mismatch';
}

function sameKey(a: HostKey, b: HostKey): boolean {
  return a.algorithm === b.algorithm && a.base64 === b.base64;
}
