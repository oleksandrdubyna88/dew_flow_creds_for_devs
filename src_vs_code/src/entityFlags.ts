import { RevisionHead, revisionHead } from './revisionHistory';
import type { StorageManager } from './storageManager';

/**
 * The two per-entity answers the tree cannot await while it renders: does this entry keep
 * previous versions, and does it have a stored password.
 *
 * <p>Both live in SecretStorage, which `getTreeItem` cannot read synchronously — so they are
 * cached on the provider and refreshed at the moments they can change (startup, an edit, an
 * accepted share, a restore, a pulled sync, another window's keychain write). Extracted from
 * `activate()` (audit 2026-08-25, A1) so the two rules that make the cache trustworthy are
 * tests rather than hopes.</p>
 */

/**
 * Key of BOTH per-entity caches — account AND entity, like the keychain key they mirror.
 * A restore can put the same entity ids into two profiles, so an id-only key would let one
 * profile's password flag or revision rows render under the other's entry.
 */
export function entityKey(accountId: string, entityId: string): string {
  return `${accountId}:${entityId}`;
}

/** Where a refresh writes its answers — the tree provider, or a fake in a test. */
export interface EntityFlagTarget {
  readonly historyById: Map<string, RevisionHead[]>;
  readonly passwordIds: Set<string>;
  refresh(): void;
}

/** Just enough of the storage to walk every account's entities. */
export interface EntityFlagSource {
  getAccounts(): readonly { accountId: string }[];
  getNodes(accountId: string): readonly { id: string; type: 'folder' | 'entity' }[];
  getHistory(accountId: string, entityId: string): Promise<{ secrets: unknown }[]>;
  getPassword(accountId: string, entityId: string): Thenable<string | undefined>;
}

export class EntityFlagsRefresher {
  private running = false;
  private rerunWanted = false;

  constructor(
    private readonly storage: EntityFlagSource,
    private readonly target: EntityFlagTarget,
  ) {}

  /**
   * Rebuild both caches from the keychain, then repaint.
   *
   * <p>Runs are SERIALIZED: a request that arrives while a walk is in flight sets a rerun flag
   * instead of starting a second walk. Two concurrent walks would race to swap their results,
   * and the loser of that race is whichever finishes last — so a slow walk started BEFORE an
   * edit could overwrite a fast one started after it, and the tree would show pre-edit flags
   * until something else happened to refresh. Coalescing also keeps a burst of mutations from
   * launching a full keychain walk each.</p>
   */
  async refresh(): Promise<void> {
    if (this.running) {
      this.rerunWanted = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.rerunWanted = false;
        await this.walk();
      } while (this.rerunWanted);
    } finally {
      this.running = false;
    }
  }

  private async walk(): Promise<void> {
    const history = new Map<string, RevisionHead[]>();
    const withPassword = new Set<string>();
    for (const [accountId, entityId] of this.entities()) {
      await this.read(accountId, entityId, history, withPassword);
    }
    this.swapIn(history, withPassword);
  }

  /** Every entity of every account, as (account, entity) pairs. */
  private *entities(): Generator<[string, string]> {
    for (const account of this.storage.getAccounts()) {
      for (const node of this.storage.getNodes(account.accountId)) {
        if (node.type === 'entity') {
          yield [account.accountId, node.id];
        }
      }
    }
  }

  private async read(
    accountId: string,
    entityId: string,
    history: Map<string, RevisionHead[]>,
    withPassword: Set<string>,
  ): Promise<void> {
    const [revisions, password] = await Promise.all([
      this.storage.getHistory(accountId, entityId),
      this.storage.getPassword(accountId, entityId),
    ]);
    if (revisions.length > 0) {
      // Heads only: the tree needs dates and names, never the old secrets.
      history.set(
        entityKey(accountId, entityId),
        revisions.map((r) => revisionHead(r as never)),
      );
    }
    if (password !== undefined) {
      withPassword.add(entityKey(accountId, entityId));
    }
  }

  /**
   * Publish both answers at once. Swapped at the end rather than cleared at the start, so a
   * repaint landing mid-walk never shows a tree with every flag briefly off.
   */
  private swapIn(history: Map<string, RevisionHead[]>, withPassword: Set<string>): void {
    this.target.historyById.clear();
    for (const [key, heads] of history) {
      this.target.historyById.set(key, heads);
    }
    this.target.passwordIds.clear();
    for (const key of withPassword) {
      this.target.passwordIds.add(key);
    }
    this.target.refresh();
  }
}

/** Narrowing helper so `activate()` can hand the real storage to the refresher. */
export function entityFlagSource(storage: StorageManager): EntityFlagSource {
  return storage as unknown as EntityFlagSource;
}
