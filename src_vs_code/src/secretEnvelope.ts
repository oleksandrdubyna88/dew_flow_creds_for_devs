import { SealedBlob, openBlobAsync, sealBlobAsync } from './cryptoUtils';
import { KeyWrap, isKeyWrap, newMasterKey, unwrapWithPinAsync, wrapWithPinAsync } from './keyWrap';

/**
 * A secret that describes itself — the value, and the facts about how it is protected, written in
 * ONE operation.
 *
 * <h3>Why a self-describing payload and not a flag beside it</h3>
 *
 * <p>A password is stored as a bare string under its own SecretStorage key. The obvious place for
 * "this one is woven" or "this one needs a PIN" is the tree node — where \`folderType\` and
 * \`mcpCreatedByAgent\` already live, and where it would sync for free. It is also the one place it
 * must not go: the keychain and \`globalState\` cannot be one transaction, so a mark kept beside a
 * value can exist without it, or the reverse. For an ordinary field that is a cosmetic glitch. For a
 * WOVEN or PIN-WRAPPED value it is unreadable data — the payment record carries \`shuffledFields\`
 * inside itself for exactly this reason (parent plan §3d rule 1), and the same argument gives the
 * same answer here.</p>
 *
 * <h3>The layout, and the review finding that fixed it</h3>
 *
 * <p>The first draft of this said "the value plus the marks that describe it", which can be
 * implemented literally: the plaintext stored beside \`pinWrapped: true\`. That reads as protection
 * and is none — anything that can reach the keychain reads the secret without the PIN. So the
 * layout is specified rather than described:</p>
 *
 * <ul>
 *   <li>a fresh random DATA KEY seals the value (AES-256-GCM, authenticated);</li>
 *   <li>the data key is wrapped under the PIN (scrypt, via the vault's own pin-wrap);</li>
 *   <li>the envelope holds the ciphertext and the wrapped key, and the plaintext NOWHERE.</li>
 * </ul>
 *
 * <p>Both halves are the vault's existing primitives — \`sealBlob\` and \`wrapWithPin\`, the same pair
 * the master key itself is protected by. This introduces no new cryptography, which is the only
 * defensible way to add a second place secrets are wrapped.</p>
 *
 * <h3>Reading is total, and never prompts</h3>
 *
 * <p>A string that does not parse as an envelope IS a legacy plaintext secret. That is the whole
 * migration: no pass over existing vaults, no flag day, and a build that is rolled back reads
 * everything it wrote before. And a locked secret is answered with a typed LOCKED result rather
 * than a prompt — \`storageManager\` is called by background sync, by the tree renderer and by
 * headless tooling, none of which can show a modal, and a decoder that asked for a PIN there would
 * hang them or hand them envelope JSON where they expected a password. (Review finding, accepted.)</p>
 *
 * <p>Pure apart from the crypto: no \`vscode\`, so every path here is a unit test.</p>
 */

/** What the marks mean, and what a caller can act on. */
export type SecretRead =
  | { readonly kind: 'value'; readonly value: string; readonly woven: boolean }
  | { readonly kind: 'locked'; readonly envelope: SecretEnvelope; readonly woven: boolean }
  | { readonly kind: 'absent' };

export interface SecretLock {
  /** The data key, wrapped under the PIN. */
  readonly wrap: KeyWrap;
  /** The value, sealed under the data key. */
  readonly sealed: SealedBlob;
}

export interface SecretEnvelope {
  readonly v: 1;
  /** The value is a woven pair; the method that separates it is in one person's memory. */
  readonly woven?: true;
  /** Present when the value is locked — and then `value` is absent, never both. */
  readonly lock?: SecretLock;
  /** The value in the clear. Absent exactly when `lock` is present. */
  readonly value?: string;
}

const VERSION = 1;

/** Whether this is one of ours. Anything else — including any legacy string — is plaintext. */
export function isSecretEnvelope(value: unknown): value is SecretEnvelope {
  const shape = value as Partial<SecretEnvelope> | null;
  return shape !== null && typeof shape === 'object' && shape.v === VERSION;
}

/**
 * What is stored, read.
 *
 * <p>Total by construction: a string this build never wrote — a password from any earlier version,
 * or something a hand-edited keychain holds — is a plain value, which is what it is.</p>
 */
export function readSecret(raw: string | undefined): SecretRead {
  if (raw === undefined) {
    return { kind: 'absent' };
  }
  const envelope = parsed(raw);
  return envelope === undefined ? { kind: 'value', value: raw, woven: false } : opened(envelope);
}

/** One of ours, read: locked or in the clear, and woven either way or not. */
function opened(envelope: SecretEnvelope): SecretRead {
  const woven = envelope.woven === true;
  return envelope.lock === undefined
    ? { kind: 'value', value: envelope.value ?? '', woven }
    : { kind: 'locked', envelope, woven };
}

/** The envelope this string holds, or nothing at all — a legacy secret parses as nothing. */
function parsed(raw: string): SecretEnvelope | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    return isSecretEnvelope(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A secret to store in the clear, marked or not.
 *
 * <p>An unmarked value is written as the BARE STRING rather than an envelope around it. Nothing is
 * gained by wrapping the ordinary case, and everything already written stays byte-identical — which
 * is what makes this change invisible to every vault that does not use it.</p>
 */
export function plainSecret(value: string, woven = false): string {
  return woven ? JSON.stringify({ v: VERSION, woven: true, value } satisfies SecretEnvelope) : value;
}

/**
 * Lock a secret under a PIN.
 *
 * <p>Async because scrypt is: at the shipped cost it holds a thread for about a second, and the
 * extension host is the thread a person is watching.</p>
 */
export async function lockSecret(
  value: string,
  accountId: string,
  pin: string,
  woven = false,
  now: number = Date.now(),
): Promise<string> {
  const dataKey = newMasterKey();
  const lock: SecretLock = {
    wrap: await wrapWithPinAsync(dataKey, accountId, pin, now),
    sealed: await sealBlobAsync(value, dataKey.toString('base64')),
  };
  const envelope: SecretEnvelope = woven ? { v: VERSION, woven: true, lock } : { v: VERSION, lock };
  // The data key does not outlive this function in anything we control. Not a guarantee about the
  // whole process — a Buffer we zero is one copy, and Node made others — but it is the copy we own.
  dataKey.fill(0);
  return JSON.stringify(envelope);
}

/**
 * The value back, given the PIN.
 *
 * <p>Throws what the vault's own wrap layer throws on a wrong PIN, so a caller distinguishes "wrong
 * PIN" from "corrupt" exactly as it does everywhere else in this build.</p>
 */
export async function unlockSecret(
  envelope: SecretEnvelope,
  accountId: string,
  pin: string,
): Promise<string> {
  const lock = envelope.lock;
  if (lock === undefined || !isKeyWrap(lock.wrap)) {
    return envelope.value ?? '';
  }
  return unsealed(lock, accountId, pin);
}

/** The two steps in order: the PIN opens the data key, the data key opens the value. */
async function unsealed(lock: SecretLock, accountId: string, pin: string): Promise<string> {
  const dataKey = await unwrapWithPinAsync(lock.wrap, accountId, pin);
  const value = await openBlobAsync(lock.sealed, dataKey.toString('base64'));
  dataKey.fill(0);
  return typeof value === 'string' ? value : '';
}

/** Whether what is stored needs a PIN before anything can be done with it. */
export function isLockedSecret(raw: string | undefined): boolean {
  return readSecret(raw).kind === 'locked';
}

/** Whether what is stored is a woven pair — true whether or not it is also locked. */
export function isWovenSecret(raw: string | undefined): boolean {
  const read = readSecret(raw);
  return read.kind !== 'absent' && read.woven;
}
