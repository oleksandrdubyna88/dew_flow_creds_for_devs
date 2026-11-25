import { entityFieldReading } from './entityFieldReading';
import { folderPath } from './quickOpen';
import type { RefSource } from './secretRef';
import type { StorageManager } from './storageManager';

/**
 * Everything the reference resolver needs, built over this window's storage. Entities carry their folder path so an ambiguous name can be
 * disambiguated by writing `Folder/Name`. Moved out of `extension.ts` as it was (change 11.1, S1), so the Remote Bridge's wall can take it.
 */
export function vaultRefSource(storage: StorageManager): RefSource {
  return {
    accounts: () => storage.getAccounts().map((a) => ({ accountId: a.accountId, email: a.email })),
    entities: (accountId) => {
      const nodes = storage.getNodes(accountId);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      // `folderPath` is the quick-open walk, reused: two implementations of "where does this
      // node sit" would disagree the first time a malformed parent chain arrived by sync.
      return nodes
        .filter((n) => n.type === 'entity')
        .map((n) => ({ id: n.id, name: n.name, path: [...folderPath(n, byId), n.name] }));
    },
    // Three answers rather than two — a withheld field carries the reason it was withheld, so a
    // reference to a woven password reports THAT instead of inventing an absence.
    fieldReading: (accountId, entityId, field) => entityFieldReading(storage, accountId, entityId, field),
  };
}
