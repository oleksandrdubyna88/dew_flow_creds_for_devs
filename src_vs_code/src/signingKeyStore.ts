import { SigningKeypair, generateSigningKeypair } from './shareSignature';
import { SecretChest } from './secretMaps';
import { signingKeySecretKey } from './secretKeys';

/**
 * This account's signing keypair, minted on first use.
 *
 * <p>In `SecretStorage` only, deliberately NOT wrapped into the vault payload as the plan proposed. A
 * signing identity that syncs is one that an attacker who reads a backup can sign as, and the recovery
 * path for a lost key already exists and is the honest one: the peer re-pins after comparing the new
 * fingerprint. A key per machine also matches what a signature actually proves — "this machine", not
 * "this person".</p>
 *
 * <p>Its own module since S1.4, for the reason the `storageManager.ts` header names: a feature that
 * needs room there takes a concern out rather than growing the file. This one leaves cleanly — it is a
 * keychain read and a keychain write, and nothing about a profile's tree.</p>
 */
export async function readSigningKeypair(chest: SecretChest, accountId: string): Promise<SigningKeypair | undefined> {
  const raw = await chest.get(signingKeySecretKey(accountId));
  return raw === undefined ? undefined : parseKeypair(raw);
}

function parseKeypair(raw: string): SigningKeypair | undefined {
  try {
    const parsed = JSON.parse(raw) as SigningKeypair;
    return typeof parsed.publicKey === 'string' && typeof parsed.privateKey === 'string' ? parsed : undefined;
  } catch {
    return undefined; // Unreadable is the same as absent here: the next call mints a fresh pair.
  }
}

/** Mint one if this account has none yet, and return whichever it now has. */
export async function ensureSigningKeypair(chest: SecretChest, accountId: string): Promise<SigningKeypair> {
  const existing = await readSigningKeypair(chest, accountId);
  if (existing !== undefined) {
    return existing;
  }
  const fresh = generateSigningKeypair();
  await chest.store(signingKeySecretKey(accountId), JSON.stringify(fresh));
  return fresh;
}
