import { EscrowShareWrap, isEscrowShareWrap } from './orgEscrowShareWrap';
import { SecretChest } from './secretMaps';
import { orgEscrowShareSecretKey } from './secretKeys';

/**
 * The corporate-recovery share this officer holds, on this machine.
 *
 * <p>Its own module since S1.4, for the reason `storageManager.ts`'s header names: a feature that
 * needs room there takes a concern out rather than growing the file. Three keychain calls and a parse,
 * with no view of a profile's tree.</p>
 */
export async function readOrgEscrowShare(chest: SecretChest, accountId: string): Promise<EscrowShareWrap | undefined> {
  const raw = await chest.get(orgEscrowShareSecretKey(accountId));
  return raw === undefined ? undefined : parseWrap(raw);
}

function parseWrap(raw: string): EscrowShareWrap | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isEscrowShareWrap(parsed) ? parsed : undefined;
  } catch {
    // A share this build cannot read is one the officer must accept again — saying nothing and
    // returning undefined is what makes the panel report "this machine holds no share".
    return undefined;
  }
}

export function writeOrgEscrowShare(chest: SecretChest, accountId: string, wrap: EscrowShareWrap): Promise<void> {
  return Promise.resolve(chest.store(orgEscrowShareSecretKey(accountId), JSON.stringify(wrap)));
}

export function eraseOrgEscrowShare(chest: SecretChest, accountId: string): Promise<void> {
  return Promise.resolve(chest.delete(orgEscrowShareSecretKey(accountId)));
}
