import {
  KeyWrap,
  isKeyWrap,
  newMasterKey,
  removeWrap,
  upsertWrap,
  webauthnWraps,
  wrapWithPinAsync,
  wrapWithPrf,
} from './keyWrap';
import { encryptJsonWrapped, readVaultWraps, resignEnvelopeWraps } from './cryptoUtils';
import type { VaultKey } from './vaultKeys';
import { StoredAccount } from './types';

/**
 * The re-wrap / re-key arithmetic behind Add/Remove Security Key (audit 2026-08-25, A1).
 *
 * <p>Extracted from the two `activate()` handlers, which now only hold the conversation
 * (transport lookup, WebAuthn ceremony, prompts, toasts) — everything that DECIDES what the
 * next envelope contains lives here, free of `vscode`, so the four regimes are unit tests:
 * add-to-wrapped (one more slot around the same master), add-to-legacy (upgrade to a fresh
 * master under PIN + key), remove-last-key (full re-key under the PIN, so the removed key —
 * and every stale backup holding its wrap — stops opening future versions), and
 * remove-one-of-many (drop the slot and re-sign; copies already made stay openable until a
 * re-key, and the caller says so out loud).</p>
 */

/** What a WebAuthn registration ceremony produced, as the wrap needs it. */
export interface RegisteredPrf {
  credentialId: string;
  prfSalt: string;
  secret: Buffer;
}

/** Why an envelope could not be produced; the caller turns these into its own messages. */
export type SecurityKeyRefusal = 'pin-required' | 'not-wrapped';

export interface NextEnvelope {
  content: string;
  /** True when the payload was re-encrypted under a FRESH master key. */
  rekeyed: boolean;
}

export function isSecurityKeyRefusal(value: NextEnvelope | SecurityKeyRefusal): value is SecurityKeyRefusal {
  return value === 'pin-required' || value === 'not-wrapped';
}

export interface EnvelopeArgs {
  /** The vault file as read from the transport. */
  raw: string;
  /** The unlocked key that proved we may rewrite this vault. */
  key: VaultKey;
  account: StoredAccount;
  /** The account's stored sync PIN, when there is one. */
  storedPin: string | undefined;
  now: number;
  /** Plaintext shares riding the envelope on the folder transport; undefined on the server. */
  pendingShares: unknown[] | undefined;
  /** `vaultKeys.decrypt` — needed only when the payload must be re-encrypted. */
  decrypt: (raw: string, key: VaultKey) => Promise<unknown>;
}

/**
 * The next envelope after ADDING one security-key wrap.
 *
 * <p>A wrapped vault gains a slot around the SAME master key and is re-signed; a legacy
 * (v1) key forces the upgrade path — new master, payload re-encrypted, PIN wrap plus the
 * new key wrap — and that path needs the PIN, because without it the vault would open by
 * security key alone and a lost key would lock the vault forever.</p>
 */
export async function envelopeWithAddedKey(
  args: EnvelopeArgs,
  prf: RegisteredPrf,
  label: string,
): Promise<NextEnvelope | SecurityKeyRefusal> {
  const { raw, key, account, storedPin, now } = args;
  if (key.version === 2) {
    // Already wrapped: add one more wrap around the SAME master key.
    const wraps = upsertWrap(
      readVaultWraps(raw).filter(isKeyWrap),
      wrapWithPrf(key.masterKey, prf.credentialId, prf.prfSalt, prf.secret, label.trim(), now),
    );
    return { content: resignEnvelopeWraps(raw, wraps, key.masterKey), rekeyed: false };
  }
  // Upgrade v1 → wrapped: new master key, payload re-encrypted, two wraps.
  if (storedPin === undefined) {
    return 'pin-required';
  }
  const payload = await args.decrypt(raw, key);
  const master = newMasterKey();
  const wraps = [
    await wrapWithPinAsync(master, account.accountId, storedPin, now),
    wrapWithPrf(master, prf.credentialId, prf.prfSalt, prf.secret, label.trim(), now),
  ];
  return {
    content: encryptJsonWrapped(payload, master.toString('base64'), wraps, account, args.pendingShares),
    rekeyed: true,
  };
}

/** The wraps currently on a vault file, typed. */
export function vaultKeyWraps(raw: string): KeyWrap[] {
  return readVaultWraps(raw).filter(isKeyWrap);
}

/**
 * Whether removing this wrap will re-key the whole vault (last security key gone, PIN
 * present) — the caller words its unlock prompt and failure message by this.
 */
export function removalWouldRekey(
  wraps: readonly KeyWrap[],
  wrapId: string,
  storedPin: string | undefined,
): boolean {
  return webauthnWraps(removeWrap(wraps, 'webauthn', wrapId)).length === 0 && storedPin !== undefined;
}

/**
 * The next envelope after REMOVING one security-key wrap.
 *
 * <p>Last key + a stored PIN → full re-key: fresh master, payload re-encrypted, single PIN
 * wrap — the removed key (and any stale backup still holding its wrap) can no longer decrypt
 * future versions. Otherwise the slot is dropped and the envelope re-signed around the SAME
 * master — which requires the unlocked key to be a wrapped one.</p>
 */
export async function envelopeWithRemovedKey(
  args: EnvelopeArgs,
  wrapId: string,
): Promise<NextEnvelope | SecurityKeyRefusal> {
  const { raw, key, account, storedPin, now } = args;
  const remaining = removeWrap(vaultKeyWraps(raw), 'webauthn', wrapId);

  if (removalWouldRekey(vaultKeyWraps(raw), wrapId, storedPin) && storedPin !== undefined) {
    const payload = await args.decrypt(raw, key);
    const master = newMasterKey();
    return {
      content: encryptJsonWrapped(
        payload,
        master.toString('base64'),
        [await wrapWithPinAsync(master, account.accountId, storedPin, now)],
        account,
        args.pendingShares,
      ),
      rekeyed: true,
    };
  }

  // Other keys remain (re-keying would need each of them present to re-wrap): drop this
  // wrap and re-sign. Copies already made stay openable by the removed key until a re-key.
  if (key.version !== 2) {
    return 'not-wrapped';
  }
  return { content: resignEnvelopeWraps(raw, remaining, key.masterKey), rekeyed: false };
}
