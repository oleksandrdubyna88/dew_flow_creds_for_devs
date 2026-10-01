// expect TS2322 at line 8
// The card — the first slot to flip (typed-secrets plan T5) and the one the owner lost: what the keychain
// holds for a payment record is a stored secret, not text, so reading it as text without a door must not compile.
import type { StorageManager } from '../../../storageManager';

export async function card(storage: StorageManager): Promise<number> {
  const raw = await storage.getPaymentRaw('account', 'entry');
  const text: string | undefined = raw;
  return text === undefined ? 0 : text.length;
}
