import { folderPath } from './quickOpen';
import { type RefSource, addressKey, segmentKey } from './secretRef';
import type { TreeNode } from './types';

/**
 * The part of the reference resolver's source that holds no secret: the accounts by e-mail address, and every entity of an account with its
 * folder path. The window builds its `RefSource` from this, and the list of agent-visible entries asks it which entry a `creds://` token
 * names, so the run and the list find the same entry by one function and the same case rules (`research/PLAN_agent_list_fields_hidden_n1_n4_n6.md`, D8).
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

/** The candidates of a token as ONE list for the locator: each has an id of its own in the list (two accounts can hold one id), and `origin` gives the account and the id that it came from. */
export interface Candidates {
  readonly entities: Entities;
  readonly origin: ReadonlyMap<string, { readonly accountId: string; readonly entityId: string }>;
}

/** What the list of entries asks of the vault to decide a `creds://` token: the accounts, and the entries that the agent may view by their last path name. */
export interface ListingLocator {
  accounts(): ReturnType<RefSource['accounts']>;
  /** The entries of the account that the agent may view and whose own name is `lastName` (the letter case ignored): the bucket of a name, before the folders are asked. */
  candidates(accountId: string, lastName: string): Entities;
  /**
   * THE candidates of a token (`research/PLAN_agent_list_fields_hidden_n1_n4_n6.md`, §2.4): from EACH account that has the address, the entries that the agent may view, whose
   * own name is `lastName`, and whose `namedFolders` folders directly above exist and are each open to the agent. Held for the listing by the address, the name and the number
   * of folders (D9), so a token that is asked again costs no node read.
   */
  qualified(address: string, lastName: string, namedFolders: number): Candidates;
}

/**
 * The locator for ONE listing, over the entries that the agent may view and the folders that the agent may view (change 1.1, and epoch 2 of the plan).
 *
 * <p>A node that the agent may not view must decide nothing: not an entry with the name of a viewable one (a hidden twin), and not a folder that a token
 * names (a viewable entry under it is no candidate of that token, whatever the folder is called). So the locator that decides a token is given the
 * candidates only, and the folders are asked BEFORE it, as a part of what a candidate is. `samePath` needs the last segment of the path to be the entry's own
 * name, so each account's viewable entries are indexed once, by that name under the locator's own key (`segmentKey`); each filtered list of candidates is held for
 * the listing. The accounts are read once. Built lazily: a listing with no reference costs nothing. `foldersOpen` answers whether the `count` folders above an entry
 * exist and are open; without it a token that names a folder has no candidate (fail closed).</p>
 */
export function viewableLocatorForOneListing(
  locator: Pick<RefSource, 'accounts' | 'entities'>,
  mayView: (accountId: string, entityId: string) => boolean,
  foldersOpen: (accountId: string, entityId: string, count: number) => boolean = () => false,
): ListingLocator {
  const accountsHeld: { value?: ReturnType<RefSource['accounts']> } = {};
  const indexes = new Map<string, ReadonlyMap<string, Entities>>();
  const qualifiedHeld = new Map<string, Candidates>();
  const accounts = (): ReturnType<RefSource['accounts']> => (accountsHeld.value ??= locator.accounts());
  const indexOf = (accountId: string): ReadonlyMap<string, Entities> => {
    const held = indexes.get(accountId) ?? indexByName(locator.entities(accountId).filter((e) => mayView(accountId, e.id)));
    indexes.set(accountId, held);
    return held;
  };
  const candidates = (accountId: string, lastName: string): Entities => indexOf(accountId).get(segmentKey(lastName)) ?? [];
  const qualified = (address: string, lastName: string, namedFolders: number): Candidates => {
    const key = JSON.stringify([addressKey(address), segmentKey(lastName), namedFolders]);
    const held = qualifiedHeld.get(key) ?? candidatesOfAddress(accounts(), address, (accountId) => candidates(accountId, lastName).filter((e) => namedFolders === 0 || foldersOpen(accountId, e.id, namedFolders)));
    qualifiedHeld.set(key, held);
    return held;
  };
  return { accounts, candidates, qualified };
}

/** The candidates of each account with the address, as one list with an id of its own for each. */
function candidatesOfAddress(accounts: ReturnType<RefSource['accounts']>, address: string, ofAccount: (accountId: string) => Entities): Candidates {
  const origin = new Map<string, { accountId: string; entityId: string }>();
  const entities: Entities = accounts
    .filter((account) => addressKey(account.email) === addressKey(address))
    .flatMap((account) => ofAccount(account.accountId).map((e) => ({ account: account.accountId, e })))
    .map(({ account, e }, index) => {
      origin.set(String(index), { accountId: account, entityId: e.id });
      return { id: String(index), name: e.name, path: e.path };
    });
  return { entities, origin };
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
