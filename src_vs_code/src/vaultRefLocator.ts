import { folderPath } from './quickOpen';
import { type RefSource, segmentKey } from './secretRef';
import type { TreeNode } from './types';

/**
 * The part of the reference resolver's source that holds no secret: the accounts by e-mail address, and every entity of an account with its
 * folder path. The window builds its `RefSource` from this, and the list of agent-visible entries asks it which entry a `creds://` token
 * names, so the run and the list find the same entry by one function and the same case rules (`todo/PLAN_agent_list_fields_hidden_n1_n4_n6.md`, D8).
 *
 * <p>Pure and `vscode`-free. The bodies are the ones that `extension.ts` had; a source with no address for an account gives no account, so a
 * reference to it is found by nobody.</p>
 */
export interface LocatorSource {
  getAccounts(): readonly { accountId: string; email?: string }[];
  getNodes(accountId: string): readonly TreeNode[];
}

export function vaultRefLocator(source: LocatorSource): Pick<RefSource, 'accounts' | 'entities'> {
  return {
    accounts: () => source.getAccounts().flatMap((a) => (a.email === undefined ? [] : [{ accountId: a.accountId, email: a.email }])),
    entities: (accountId) => {
      const nodes = source.getNodes(accountId);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      // `folderPath` is the quick-open walk, reused: two implementations of "where does this
      // node sit" would disagree the first time a malformed parent chain arrived by sync.
      return nodes
        .filter((n) => n.type === 'entity')
        .map((n) => ({ id: n.id, name: n.name, path: [...folderPath(n, byId), n.name] }));
    },
  };
}

type Entities = ReturnType<RefSource['entities']>;

/** What the list of entries asks of the vault to decide a `creds://` token: the accounts, and the entries that the agent may view by their last path name. */
export interface ListingLocator {
  accounts(): ReturnType<RefSource['accounts']>;
  /** The entries of the account that the agent may view and whose own name is `lastName` (the letter case ignored): the only ones that a reference ending in that name can find. */
  candidates(accountId: string, lastName: string): Entities;
}

/**
 * The locator for ONE listing, over the entries that the agent may view only (change 1.1 of `todo/PLAN_agent_list_fields_hidden_n1_n4_n6.md`).
 *
 * <p>A hidden entry with the name of a viewable one must not make a reference to the viewable one ambiguous: without the hidden twin the token is
 * kept, so the placeholder would tell that a hidden twin exists (rule A). The window's own run keeps its locator over ALL entries; only the list
 * narrows. `samePath` needs the last segment of the path to be the entry's own name, so each account's viewable entries are indexed once, by that
 * name under the locator's own key (`segmentKey`), and a token is given only the entries that can match it: the answer is the one of the whole list, at the cost of one walk
 * of the account for the listing and not for each token. The accounts are read once. Built lazily: a listing with no reference costs nothing.</p>
 */
export function viewableLocatorForOneListing(locator: Pick<RefSource, 'accounts' | 'entities'>, mayView: (accountId: string, entityId: string) => boolean): ListingLocator {
  const accountsHeld: { value?: ReturnType<RefSource['accounts']> } = {};
  const indexes = new Map<string, ReadonlyMap<string, Entities>>();
  const indexOf = (accountId: string): ReadonlyMap<string, Entities> => {
    const held = indexes.get(accountId) ?? indexByName(locator.entities(accountId).filter((e) => mayView(accountId, e.id)));
    indexes.set(accountId, held);
    return held;
  };
  return {
    accounts: () => (accountsHeld.value ??= locator.accounts()),
    candidates: (accountId, lastName) => indexOf(accountId).get(segmentKey(lastName)) ?? [],
  };
}

/** The entries by the key of their own name: one pass, a bucket per name that is appended to while it is built and read-only once it is returned. */
function indexByName(entities: Entities): ReadonlyMap<string, Entities> {
  const index = new Map<string, Entities[number][]>();
  for (const entity of entities) {
    const key = segmentKey(entity.name);
    const bucket = index.get(key) ?? [];
    bucket.push(entity);
    index.set(key, bucket);
  }
  return index;
}
