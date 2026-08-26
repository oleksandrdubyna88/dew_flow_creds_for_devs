import * as crypto from 'node:crypto';
import { ParsedSshKey } from './sshKeyParse';
import { SSH_AGENT_RSA_SHA2_256, SSH_AGENT_RSA_SHA2_512, encodeString } from './sshAgentProtocol';

/**
 * Producing an SSH signature blob for data an agent client asked to have signed.
 *
 * <p>The blob is `string algorithm || string signature`, and what goes in the second half
 * differs per family — which is the whole reason this is its own module with its own tests:</p>
 *
 * <ul>
 *   <li><b>Ed25519</b> — the raw 64 bytes.</li>
 *   <li><b>RSA</b> — PKCS#1 v1.5 over the digest the client's FLAGS asked for. `ssh-rsa` means
 *       SHA-1 and modern OpenSSH refuses it, so a client sets `rsa-sha2-256`/`512`; the
 *       advertised algorithm name must match the digest actually used or verification fails
 *       with no useful error.</li>
 *   <li><b>ECDSA</b> — NOT the DER sequence Node produces. SSH wants `mpint r || mpint s`
 *       inside a string, so the DER is unpacked and re-encoded.</li>
 * </ul>
 *
 * <p>Pure and `vscode`-free: `crypto` only, so every branch is verified in a unit test against
 * `crypto.verify` rather than hoped about.</p>
 */

/** Two's-complement mpint, as `sshKeyParse` writes for the public half. */
function encodeMpint(value: Buffer): Buffer {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) {
    start += 1;
  }
  const trimmed = value.subarray(start);
  return encodeString(trimmed[0] & 0x80 ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed);
}

/** The algorithm name to advertise, and the digest to sign with, for the client's flags. */
export function rsaVariant(flags: number): { algorithm: string; digest: string } {
  if ((flags & SSH_AGENT_RSA_SHA2_512) !== 0) {
    return { algorithm: 'rsa-sha2-512', digest: 'sha512' };
  }
  if ((flags & SSH_AGENT_RSA_SHA2_256) !== 0) {
    return { algorithm: 'rsa-sha2-256', digest: 'sha256' };
  }
  // No flag: the legacy SHA-1 signature. Still produced, because refusing would break the
  // client that asked for it; every current OpenSSH sets a flag.
  return { algorithm: 'ssh-rsa', digest: 'sha1' };
}

const ECDSA_DIGESTS: Record<string, string> = {
  'ecdsa-sha2-nistp256': 'sha256',
  'ecdsa-sha2-nistp384': 'sha384',
  'ecdsa-sha2-nistp521': 'sha512',
};

/** Split a DER `SEQUENCE { INTEGER r, INTEGER s }` into its two integers. */
function unpackDerSignature(der: Buffer): { r: Buffer; s: Buffer } | undefined {
  if (der[0] !== 0x30) {
    return undefined;
  }
  // A short-form length is one byte; a long form announces its own byte count.
  const cursor = { at: (der[1] & 0x80) === 0 ? 2 : 2 + (der[1] & 0x7f) };
  const parts = [readDerInteger(der, cursor), readDerInteger(der, cursor)];
  if (parts.some((part) => part === undefined)) {
    return undefined;
  }
  return { r: parts[0] as Buffer, s: parts[1] as Buffer };
}

/** Read one `INTEGER` at `cursor.at`, advancing the cursor past it. */
function readDerInteger(der: Buffer, cursor: { at: number }): Buffer | undefined {
  if (der[cursor.at] !== 0x02) {
    return undefined;
  }
  const length = der[cursor.at + 1];
  const value = der.subarray(cursor.at + 2, cursor.at + 2 + length);
  cursor.at += 2 + length;
  return value;
}

/** ECDSA: sign, then re-encode Node's DER as the `mpint r || mpint s` SSH expects. */
function signEcdsa(parsed: ParsedSshKey, data: Buffer): Buffer | undefined {
  const digest = ECDSA_DIGESTS[parsed.algorithm];
  if (digest === undefined) {
    return undefined;
  }
  const parts = unpackDerSignature(crypto.sign(digest, data, parsed.key));
  if (parts === undefined) {
    return undefined;
  }
  return Buffer.concat([
    encodeString(parsed.algorithm),
    encodeString(Buffer.concat([encodeMpint(parts.r), encodeMpint(parts.s)])),
  ]);
}

/** The signature blob for `data`, or undefined when this key/flags pair cannot be signed. */
export function signForAgent(parsed: ParsedSshKey, data: Buffer, flags: number): Buffer | undefined {
  if (parsed.algorithm === 'ssh-ed25519') {
    // Ed25519 hashes internally: `null` is the digest argument, not an omission.
    return Buffer.concat([encodeString('ssh-ed25519'), encodeString(crypto.sign(null, data, parsed.key))]);
  }
  if (parsed.algorithm === 'ssh-rsa') {
    const { algorithm, digest } = rsaVariant(flags);
    return Buffer.concat([encodeString(algorithm), encodeString(crypto.sign(digest, data, parsed.key))]);
  }
  return signEcdsa(parsed, data);
}

const RSA_DIGESTS: Record<string, string> = {
  'rsa-sha2-512': 'sha512',
  'rsa-sha2-256': 'sha256',
  'ssh-rsa': 'sha1',
};

/** The digest a verifier must use for a blob this module produced; `null` for Ed25519. */
export function digestForAlgorithm(algorithm: string): string | null {
  if (algorithm === 'ssh-ed25519') {
    return null;
  }
  return RSA_DIGESTS[algorithm] ?? ECDSA_DIGESTS[algorithm] ?? null;
}
