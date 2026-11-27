import { folderPath } from './quickOpen';
import type { RefSource } from './secretRef';
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

/**
 * The same locator for ONE listing: the entities of an account are read once, however many tokens ask. The vault does not change between the
 * tokens of one listing that matter here (each answer is read again by the next listing), and a locator that walks the account for each token
 * would make a listing cost the size of the vault for each reference.
 */
export function locatorForOneListing(locator: Pick<RefSource, 'accounts' | 'entities'>): Pick<RefSource, 'accounts' | 'entities'> {
  const entities = new Map<string, ReturnType<RefSource['entities']>>();
  return {
    accounts: () => locator.accounts(),
    entities: (accountId) => {
      const held = entities.get(accountId) ?? locator.entities(accountId);
      entities.set(accountId, held);
      return held;
    },
  };
}
