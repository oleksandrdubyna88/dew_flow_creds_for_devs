// expect TS2345 at line 9
// A writer comes only from a Sealing that sealingAtWrite.ts made (typed-secrets plan §2.4, T4): a hand-built
// `{ kind: 'plain' }` has no brand, so writerFor refuses it — the storage cannot be written plain by saying so.
import { NOTHING_OPENED } from '../../../editPrefill';
import { writerFor } from '../../../entryWriter';
import type { StorageManager } from '../../../storageManager';

export function forged(storage: StorageManager): unknown {
  return writerFor(storage, 'account', 'entry', { kind: 'plain', marked: false, fresh: true }, NOTHING_OPENED);
}
