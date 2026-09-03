import { StorageManager } from './storageManager';
import { TreeElement } from './types';

/**
 * Finding an entry by its id alone.
 *
 * <p>Its own module because `extension.ts` is at its size-ratchet baseline and may only shrink —
 * and because this is the one function in that file with no view of activation at all: it takes a
 * store and an id and answers, which is exactly the shape that leaves cleanly.</p>
 */

/**
 * The tree element for one id, across every unlocked account.
 *
 * <p>Every account, because an agent's list already merged them and the id it quotes carries no
 * account with it. Folders are findable too: an agent naming the folder an entry lives in is a
 * reasonable thing to want to look at.</p>
 */
export function findById(storage: StorageManager, id: string): TreeElement | undefined {
  for (const account of storage.getAccounts()) {
    const node = storage.getNode(account.accountId, id);
    if (node !== undefined) {
      return { kind: 'node', accountId: account.accountId, node };
    }
  }
  return undefined;
}
