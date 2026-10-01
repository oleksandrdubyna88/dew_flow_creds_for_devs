// expect TS2322 at line 8
// T5, one slot at a time (typed-secrets plan §4): what the keychain holds for a VPN entry's configuration is a stored
// secret, not text — reading it as text without a door must not compile.
import type { StorageManager } from '../../../storageManager';

export async function vpn(storage: StorageManager): Promise<number> {
  const raw = await storage.getVpnConfig('account', 'entry');
  const text: string | undefined = raw;
  return text === undefined ? 0 : text.length;
}
