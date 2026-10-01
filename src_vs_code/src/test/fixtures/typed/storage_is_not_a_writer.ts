// expect TS2345 at line 10
// The storage itself is not a writer (typed-secrets plan T5, the eleventh commit): its raw setters take a
// StoredSecret, so handing it to the additions pass — plaintext straight into the keychain, no proof, no
// lease — does not compile. A writer comes only from entryWriter.writerFor, over a Sealing.
import { applyAdditions } from '../../../applyFormSecrets';
import type { EntityFormValues } from '../../../entityFormShape';
import type { StorageManager } from '../../../storageManager';

export async function plaintextIntoTheKeychain(storage: StorageManager, form: EntityFormValues): Promise<void> {
  await applyAdditions(storage, 'account', 'entry', form);
}
