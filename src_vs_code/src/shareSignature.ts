import * as crypto from 'node:crypto';
import { canonicalBytes } from './cryptoUtils';

/**
 * Ed25519 signatures over a share, for the folder transport.
 *
 * <p><b>What this is for.</b> On a shared folder there is no server to stamp who
 * sent a share: `appendShares` writes whatever it was handed, so anyone who can
 * write to the folder can label an item as coming from a colleague. The server
 * transport has no such problem and remains the recommendation for teams — this
 * exists for the deployment that is not allowed to run one.</p>
 *
 * <p><b>The honest ceiling, stated here so no caller has to infer it.</b> A
 * signature proves "signed by the holder of key K". Binding K to a person is a
 * separate problem, and if public keys live on the same folder the attacker can
 * write, they can replace a peer's key with their own and sign with it. So this
 * is <b>trust-on-first-use plus key continuity</b>:</p>
 * <ul>
 *   <li>strong against a tamperer who arrives AFTER the first contact — the key
 *       is pinned and a change is loud;</li>
 *   <li>weak against one already in place BEFORE it — only comparing the
 *       fingerprint out of band closes that, which is why the fingerprint is part
 *       of the feature rather than a decoration.</li>
 * </ul>
 * <p>It must never be described as eliminating spoofing.</p>
 *
 * <p>Ed25519 comes from Node's own `crypto` — no new dependency, matching how
 * everything else here is built.</p>
 */

/** A signing identity for one account. The private half never leaves this machine. */
export interface SigningKeypair {
  /** SPKI DER, base64 — what peers pin and what travels in the share. */
  publicKey: string;
  /** PKCS8 DER, base64 — SecretStorage only. */
  privateKey: string;
}

export function generateSigningKeypair(): SigningKeypair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}

/**
 * Everything a signature has to cover.
 *
 * <p>Signing the ciphertext alone would be replayable and unbound: the same
 * sealed bytes could be re-labelled, re-addressed to someone else, or appended a
 * second time. Each field here closes one of those.</p>
 */
export interface ShareTranscript {
  /** Unique per share — the recipient remembers it, so a re-append is caught. */
  shareId: string;
  fromEmail: string;
  /** Binds the share to ONE recipient: a captured item cannot be re-targeted. */
  toEmail: string;
  createdAt: number;
  /** Inside the signed data, so a swapped key cannot claim an old signature. */
  senderPublicKey: string;
  kdfN?: number;
  kdfR?: number;
  kdfP?: number;
  /** The sealed payload and its GCM tag — the secret this is all about. */
  data: string;
  tag: string;
}

function transcriptBytes(transcript: ShareTranscript): Buffer {
  return canonicalBytes([
    'cred-ssh-manager/share-v1',
    transcript.shareId,
    transcript.fromEmail,
    transcript.toEmail,
    transcript.createdAt,
    transcript.senderPublicKey,
    transcript.kdfN,
    transcript.kdfR,
    transcript.kdfP,
    transcript.data,
    transcript.tag,
  ]);
}

export function signShare(privateKeyBase64: string, transcript: ShareTranscript): string {
  const key = crypto.createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  return crypto.sign(null, transcriptBytes(transcript), key).toString('base64');
}

/**
 * Whether this transcript was signed by the holder of `publicKey`.
 *
 * <p>Never throws for bad input: a malformed key or signature is an unverified
 * share, not a crash — the caller is showing a badge, not asserting an invariant.</p>
 */
export function verifyShare(
  publicKeyBase64: string,
  transcript: ShareTranscript,
  signatureBase64: string,
): boolean {
  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(
      null,
      transcriptBytes(transcript),
      key,
      Buffer.from(signatureBase64, 'base64'),
    );
  } catch {
    return false;
  }
}

/**
 * The fingerprint two people read to each other.
 *
 * <p>Grouped hex rather than one long run: a human comparing 64 unbroken
 * characters over a phone call skips the middle, and the middle is where an
 * attacker with a vanity key would put the difference.</p>
 */
export function keyFingerprint(publicKeyBase64: string): string {
  const digest = crypto.createHash('sha256').update(Buffer.from(publicKeyBase64, 'base64')).digest('hex');
  return (digest.slice(0, 32).match(/.{4}/g) ?? []).join(' ').toUpperCase();
}
