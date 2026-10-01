// expect TS2322 at line 8
// T5, one slot at a time (typed-secrets plan §4): what the keychain holds for an entry's notes is a stored
// secret, not text — reading it as text without a door must not compile.
import type { StorageManager } from '../../../storageManager';

export async function notes(storage: StorageManager): Promise<number> {
  const raw = await storage.getNotes('account', 'entry');
  const text: string | undefined = raw;
  return text === undefined ? 0 : text.length;
}
