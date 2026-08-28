import * as crypto from 'node:crypto';
import { CURRENT_RP_ID, LEGACY_RP_ID, wrapRpId } from './webauthnRp';
import type { StoredAccount } from './types';
import {
  BackupError,
  SealedBlob,
  encryptJsonWrapped,
  openBlob,
  openBlobAsync,
  sealBlob,
  sealBlobAsync,
} from './cryptoUtils';
import { ESCROW_WRAP_INFO, openWithPrivateKey, sealToPublicKey } from './orgEscrowCrypto';

/**
 * Multi-unlock key wrapping.
 *
 * A v2 vault payload is encrypted with a random 32-byte **master key**, and
 * that master key is stored several times over — once per unlock method:
 *
 *   - `pin`      : AES-256-GCM(masterKey) under scrypt(accountId + PIN)
 *   - `webauthn` : AES-256-GCM(masterKey) under HKDF(PRF secret of one
 *                  security key) — one wrap per registered YubiKey
 *   - `recovery` : AES-256-GCM(masterKey) under HKDF(printed recovery code) —
 *                  at most one, replaced wholesale on regenerate
 *   - `org-escrow`: AES-256-GCM(masterKey) under X25519-ECDH to the organisation's
 *                  recovery public key — at most one, and the ONLY kind nobody can
 *                  open at the moment it is written
 *
 * Any single wrap yields the master key, so several YubiKeys and the PIN all
 * open the same vault, and adding/removing a key never re-encrypts the data.
 * All of this is pure — no `vscode`, no I/O — so it is unit-testable.
 */

export const MASTER_KEY_BYTES = 32;

/** The kinds this build can WRITE. Reading is deliberately not limited to these — see below. */
export type KeyWrapKind = 'pin' | 'webauthn' | 'recovery' | 'org-escrow';

const KNOWN_KINDS: readonly string[] = ['pin', 'webauthn', 'recovery', 'org-escrow'];

export function isKnownWrapKind(kind: string): kind is KeyWrapKind {
  return KNOWN_KINDS.includes(kind);
}

export interface KeyWrap extends SealedBlob {
  /**
   * The unlock method this wrap belongs to — a plain `string`, not the union above, and that
   * is the forward-compatibility rule rather than sloppiness.
   *
   * <p>A vault is written by whichever build touched it last, and the kinds only ever grow.
   * Typing this as the union would push every reader into treating an unrecognised kind as
   * malformed — which is exactly what {@link isKeyWrap} used to do, and every site that
   * rewrites the array filters through it. The result was a build silently DELETING an opener
   * it merely did not understand, then re-signing the envelope so the file looked healthy.</p>
   *
   * <p>A wrap this build cannot USE is still a wrap it must CARRY. Route on the kind with
   * {@link isKnownWrapKind} or an explicit comparison; never on the type.</p>
   */
  kind: string;
  /** Stable id: 'pin' for the PIN wrap, the credential id for a key. */
  id: string;
  /** Human label shown in the UI (e.g. "YubiKey 5C — work"). */
  label?: string;
  /** WebAuthn only: the PRF input this credential was wrapped with. */
  prfSalt?: string;
  /**
   * WebAuthn only: the RP ID the credential was created under. Absent on wraps written before
   * 0.81 — the bare `localhost` — which still open the vault and are offered a re-registration.
   */
  rpId?: string;
  /** Org-escrow only: the per-seal ephemeral X25519 public key, base64. */
  ephemeralPublicKey?: string;
  /** Org-escrow only: which generation of the org recovery key this wrap is sealed to. */
  orgPublicKeyFingerprint?: string;
  createdAt: number;
}

/**
 * Whether this is a well-formed wrap — **structurally**, whatever its kind claims to be.
 *
 * <p>Not an allowlist of kinds: see the note on {@link KeyWrap.kind}. Carrying the unknown is
 * not the same as carrying the broken, though — a value missing the sealed-blob fields, or
 * with an empty kind, is still rejected, because that is a damaged file rather than a newer
 * one.</p>
 */
// eslint-disable-next-line complexity
export function isKeyWrap(value: unknown): value is KeyWrap {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.kind === 'string' &&
    v.kind.length > 0 &&
    typeof v.id === 'string' &&
    typeof v.salt === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.tag === 'string' &&
    typeof v.data === 'string' &&
    (v.label === undefined || typeof v.label === 'string') &&
    (v.prfSalt === undefined || typeof v.prfSalt === 'string') &&
    (v.rpId === undefined || typeof v.rpId === 'string') &&
    (v.createdAt === undefined || typeof v.createdAt === 'number')
  );
}

export function newMasterKey(): Buffer {
  return crypto.randomBytes(MASTER_KEY_BYTES);
}

/** Fresh random PRF input for a newly registered security key. */
export function newPrfSalt(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Derive the wrapping key from a high-entropy PRF secret. HKDF (not scrypt)
 * because the input is already 32 random bytes from the security key.
 */
function prfWrappingKey(prfSecret: Buffer, salt: Buffer): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', prfSecret, salt, Buffer.from('cred-ssh-manager/webauthn'), 32),
  );
}

/** Wrap the master key under a PIN (scrypt via the shared sealed-blob layer). */
export function wrapWithPin(
  masterKey: Buffer,
  accountId: string,
  pin: string,
  createdAt: number,
): KeyWrap {
  return {
    kind: 'pin',
    id: 'pin',
    createdAt,
    ...sealBlob(masterKey.toString('base64'), accountId + pin),
  };
}

export interface WrappedVaultInit {
  /** The v3 (wrapped/HKDF) envelope, ready to write. */
  content: string;
  /** The fresh master key it was sealed under — cache it so unlock stays cheap. */
  masterKey: Buffer;
  /** The wraps embedded in `content` — for now just the pin-wrap. */
  wraps: KeyWrap[];
}

/**
 * Build a v3 envelope for a vault that has only a PIN.
 *
 * <p>This is what replaces the v1 (scrypt-per-operation) envelope, for a migrating vault and
 * for a brand-new one: a fresh random master key, sealed ONCE in a pin-wrap, with the payload
 * encrypted under it by HKDF. After this, unlock unwraps the master with one scrypt and every
 * read and write is cheap — where v1 ran a full scrypt on each. Composes the existing pieces
 * (`wrapWithPin` + `encryptJsonWrapped`) rather than inventing a second wrapping path.</p>
 */
export function wrapPinVault(
  payload: unknown,
  accountId: string,
  pin: string,
  createdAt: number,
  account?: StoredAccount,
  shares?: unknown[],
): WrappedVaultInit {
  const masterKey = crypto.randomBytes(32);
  const wraps = [wrapWithPin(masterKey, accountId, pin, createdAt)];
  const content = encryptJsonWrapped(payload, masterKey, wraps, account, shares);
  return { content, masterKey, wraps };
}

/** Wrap the master key under one security key's PRF secret. */
export function wrapWithPrf(
  masterKey: Buffer,
  credentialId: string,
  prfSalt: string,
  prfSecret: Buffer,
  label: string | undefined,
  createdAt: number,
  /** The RP ID the credential was created under — every new registration is the current one. */
  rpId: string = CURRENT_RP_ID,
): KeyWrap {
  const salt = crypto.randomBytes(16);
  const key = prfWrappingKey(prfSecret, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(masterKey), cipher.final()]);
  return {
    kind: 'webauthn',
    id: credentialId,
    label,
    prfSalt,
    rpId,
    createdAt,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

/**
 * Derive the wrapping key from the printed recovery code's core. HKDF for the same
 * reason as the PRF secret: 150 bits drawn uniformly need no slow KDF — scrypt here
 * would only protect a low-entropy human choice, which this is not.
 */
function recoveryWrappingKey(secret: Buffer, salt: Buffer): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', secret, salt, Buffer.from('cred-ssh-manager/recovery-code'), 32),
  );
}

/**
 * Wrap the master key under the printed recovery code. Constant `id` — like the PIN
 * wrap — so `upsertWrap` keeps exactly one slot and regenerating replaces it.
 */
export function wrapWithRecoveryCode(masterKey: Buffer, secret: Buffer, createdAt: number): KeyWrap {
  const salt = crypto.randomBytes(16);
  const key = recoveryWrappingKey(secret, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(masterKey), cipher.final()]);
  return {
    kind: 'recovery',
    id: 'recovery',
    createdAt,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

/** The master key a pin-wrap's decrypted payload carries — or a 'corrupted' error, never a guess. */
function masterFromPinPayload(payload: unknown): Buffer {
  if (typeof payload !== 'string') {
    throw new BackupError('corrupted', 'PIN wrap does not hold a master key.');
  }
  const key = Buffer.from(payload, 'base64');
  if (key.length !== MASTER_KEY_BYTES) {
    throw new BackupError('corrupted', 'PIN wrap holds a malformed master key.');
  }
  return key;
}

/** Recover the master key from a PIN wrap. Throws BackupError on a bad PIN. */
export function unwrapWithPin(wrap: KeyWrap, accountId: string, pin: string): Buffer {
  return masterFromPinPayload(openBlob(wrap, accountId + pin));
}

/**
 * The async twins of the three PIN-wrap operations.
 *
 * <p>Same format, same errors, one difference: scrypt runs off the extension-host thread.
 * These are what the unlock and set-PIN paths call, because a person is waiting on them and
 * a frozen editor is what they would otherwise see. The sync forms stay for the pure callers
 * and the tests, which have no event loop to protect.</p>
 */
export async function unwrapWithPinAsync(wrap: KeyWrap, accountId: string, pin: string): Promise<Buffer> {
  return masterFromPinPayload(await openBlobAsync(wrap, accountId + pin));
}

export async function wrapWithPinAsync(
  masterKey: Buffer,
  accountId: string,
  pin: string,
  createdAt: number,
): Promise<KeyWrap> {
  return {
    kind: 'pin',
    id: 'pin',
    createdAt,
    ...(await sealBlobAsync(masterKey.toString('base64'), accountId + pin)),
  };
}

export async function wrapPinVaultAsync(
  payload: unknown,
  accountId: string,
  pin: string,
  createdAt: number,
  account?: StoredAccount,
  shares?: unknown[],
): Promise<WrappedVaultInit> {
  const masterKey = crypto.randomBytes(32);
  const wraps = [await wrapWithPinAsync(masterKey, accountId, pin, createdAt)];
  const content = encryptJsonWrapped(payload, masterKey, wraps, account, shares);
  return { content, masterKey, wraps };
}

/**
 * The AES-GCM unwrap body the two high-entropy wraps (PRF, recovery code) share —
 * extracted when the recovery wrap arrived, so a hardening lands in both at once.
 */
// eslint-disable-next-line complexity
function unwrapMasterKey(
  wrap: KeyWrap,
  deriveKey: (salt: Buffer) => Buffer,
  what: string,
  wrongMessage: string,
): Buffer {
  const salt = Buffer.from(wrap.salt, 'base64');
  const iv = Buffer.from(wrap.iv, 'base64');
  const tag = Buffer.from(wrap.tag, 'base64');
  const data = Buffer.from(wrap.data, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) {
    throw new BackupError('corrupted', `${what} has malformed parameters.`);
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(salt), iv);
    decipher.setAuthTag(tag);
    const key = Buffer.concat([decipher.update(data), decipher.final()]);
    if (key.length !== MASTER_KEY_BYTES) {
      throw new BackupError('corrupted', `${what} holds a malformed master key.`);
    }
    return key;
  } catch (error) {
    if (error instanceof BackupError) {
      throw error;
    }
    throw new BackupError('wrong-password', wrongMessage);
  }
}

/** Recover the master key from a security-key wrap. */
export function unwrapWithPrf(wrap: KeyWrap, prfSecret: Buffer): Buffer {
  return unwrapMasterKey(
    wrap,
    (salt) => prfWrappingKey(prfSecret, salt),
    'Security-key wrap',
    'This security key does not open the vault (wrong key, or the wrap was replaced).',
  );
}

/** Recover the master key from the recovery-code wrap. */
export function unwrapWithRecoveryCode(wrap: KeyWrap, secret: Buffer): Buffer {
  return unwrapMasterKey(
    wrap,
    (salt) => recoveryWrappingKey(secret, salt),
    'Recovery-code wrap',
    'This recovery code does not open the vault (wrong code, or a newer code replaced it).',
  );
}

/** Replace/add a wrap by id, keeping the rest untouched. */
export function upsertWrap(wraps: readonly KeyWrap[], wrap: KeyWrap): KeyWrap[] {
  const others = wraps.filter((w) => !(w.kind === wrap.kind && w.id === wrap.id));
  return [...others, wrap];
}

export function removeWrap(wraps: readonly KeyWrap[], kind: KeyWrapKind, id: string): KeyWrap[] {
  return wraps.filter((w) => !(w.kind === kind && w.id === id));
}

/** The security keys registered for a vault, in registration order. */
export function webauthnWraps(wraps: readonly KeyWrap[]): KeyWrap[] {
  return wraps.filter((w) => w.kind === 'webauthn').sort((a, b) => a.createdAt - b.createdAt);
}

/** The vault's one recovery-code wrap, when a code has been set up. */
export function recoveryWrap(wraps: readonly KeyWrap[]): KeyWrap | undefined {
  return wraps.find((w) => w.kind === 'recovery');
}

/** The vault's one corporate-escrow wrap, when the server has recovery configured. */
export function orgEscrowWrap(wraps: readonly KeyWrap[]): KeyWrap | undefined {
  return wraps.find((w) => w.kind === 'org-escrow');
}

/**
 * Wrap the master key to the organisation's recovery PUBLIC key.
 *
 * <p>The one wrap nobody can open at the moment it is written — the private half exists only
 * as Shamir shares in the officers' own vaults. It is therefore never an unlock OPTION:
 * `unlockPlan` must not learn about it, or a picker would offer a way in that needs two other
 * people and a ceremony.</p>
 *
 * <p>The fingerprint rides along so a client can tell "sealed to the key currently published"
 * from "sealed to the one before it" without holding either — which is what makes refreshing
 * the wrap after an org key rotation a comparison rather than a guess.</p>
 */
export function wrapWithOrgEscrow(
  masterKey: Buffer,
  orgPublicKey: Buffer,
  orgPublicKeyFingerprint: string,
  createdAt: number,
): KeyWrap {
  const sealed = sealToPublicKey(masterKey, orgPublicKey, ESCROW_WRAP_INFO);
  return {
    kind: 'org-escrow',
    id: 'org-escrow',
    createdAt,
    orgPublicKeyFingerprint,
    ephemeralPublicKey: sealed.ephemeralPublicKey,
    salt: sealed.salt,
    iv: sealed.iv,
    tag: sealed.tag,
    data: sealed.data,
  };
}

/**
 * Recover the master key from the escrow wrap — the break-glass step, and the only caller is
 * an officer's client holding a private key just reconstructed from a quorum of shares.
 */
function openedEscrow(wrap: KeyWrap, ephemeralPublicKey: string, orgPrivateKey: Buffer): Buffer {
  const master = openWithPrivateKey({ ...wrap, ephemeralPublicKey }, orgPrivateKey, ESCROW_WRAP_INFO);
  if (master.length !== MASTER_KEY_BYTES) {
    throw new BackupError('corrupted', 'Escrow wrap holds a malformed master key.');
  }
  return master;
}

export function unwrapWithOrgEscrow(wrap: KeyWrap, orgPrivateKey: Buffer): Buffer {
  const ephemeral = wrap.ephemeralPublicKey;
  if (ephemeral === undefined) {
    throw new BackupError('corrupted', 'Escrow wrap carries no ephemeral key.');
  }
  try {
    return openedEscrow(wrap, ephemeral, orgPrivateKey);
  } catch (error) {
    if (error instanceof BackupError) {
      throw error;
    }
    throw new BackupError(
      'wrong-password',
      'This organisation key does not open the vault (a different key, or the wrap was refreshed since).',
    );
  }
}

/**
 * Whether any wrap here ties this file to the VAULT's own master key — a security
 * key, a recovery code, anything that is not the self-contained pin-wrap.
 *
 * <p>Deliberately "any non-pin kind" rather than a list of the current kinds:
 * `backupWriteMode` routed by "has a webauthn wrap" and the day the recovery kind
 * arrived, a pin+recovery vault read as a standalone PIN backup — whose write path
 * would have silently stripped the recovery wrap. A kind added later must fail
 * SAFE here without anyone remembering this function exists.</p>
 */
export function hasVaultKeyedWrap(wraps: readonly KeyWrap[]): boolean {
  return wraps.some((w) => w.kind !== 'pin');
}

/**
 * Each credential's OWN prf salt, keyed by credential id — the input WebAuthn's
 * `evalByCredential` wants.
 *
 * <p>Exists because the unlock ceremony used to send wrap[0]'s salt for every
 * credential. Salts are minted per registration, so whichever key the authenticator
 * picked, unless it was wrap[0]'s, the PRF came back computed over a foreign salt and
 * the unwrap failed as "try again" — forever, on any vault holding more than one wrap.</p>
 */
export function prfSaltsByCredential(wraps: readonly KeyWrap[], rpId?: string): Record<string, string> {
  const salts: Record<string, string> = {};
  const underRp = (wrap: KeyWrap): boolean => rpId === undefined || wrapRpId(wrap) === rpId;
  for (const wrap of webauthnWraps(wraps).filter(underRp)) {
    if (wrap.prfSalt !== undefined) {
      salts[wrap.id] = wrap.prfSalt;
    }
  }
  return salts;
}

/** One `get` under one RP ID, with the credentials that RP can answer for. */
export interface AssertionStep {
  readonly rpId: string;
  readonly salts: Record<string, string>;
}

/**
 * How to ask the key: the current RP ID first, the legacy one as a fallback — each step only
 * with its own credentials, because an authenticator refuses a credential under the wrong RP.
 * A vault with no legacy wraps never opens the legacy page.
 */
export function keyAssertionPlan(wraps: readonly KeyWrap[]): AssertionStep[] {
  return [CURRENT_RP_ID, LEGACY_RP_ID]
    .map((rpId) => ({ rpId, salts: prfSaltsByCredential(wraps, rpId) }))
    .filter((step) => Object.keys(step.salts).length > 0);
}

/**
 * The wrap belonging to the credential the assertion actually used — or `undefined`,
 * never a guess. The old `?? wraps[0]` fallback unwrapped the WRONG wrap when the id
 * was unknown, and a wrong wrap can never decrypt.
 */
export function wrapForCredential(
  wraps: readonly KeyWrap[],
  credentialId: string,
): KeyWrap | undefined {
  return webauthnWraps(wraps).find((w) => w.id === credentialId);
}
