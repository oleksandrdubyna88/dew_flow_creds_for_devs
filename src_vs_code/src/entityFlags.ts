import { RevisionHead, revisionHead } from './revisionHistory';
import { ConfigFormat, describeConfigProblem } from './configFormat';
import { resolveKind } from './entityKind';
import type { EntityMetadata } from './types';
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
  /** Config entries whose stored body does not parse as what it claims to be. */
  readonly invalidConfigIds: Set<string>;
  refresh(): void;
}

/** Just enough of the storage to walk every account's entities. */
export interface EntityFlagSource {
  getAccounts(): readonly { accountId: string }[];
  getNodes(
    accountId: string,
  ): readonly { id: string; type: 'folder' | 'entity'; details?: EntityMetadata }[];
  getHistory(accountId: string, entityId: string): Promise<{ secrets: unknown }[]>;
  getPassword(accountId: string, entityId: string): Thenable<string | undefined>;
  getConfigBody(accountId: string, entityId: string): Thenable<string | undefined>;
}

/**
 * The format an entry declares, or JSON.
 *
 * <p>Its own function only because the complexity ceiling is four and a `?.` plus a `??` is half
 * of it. The default matters: a config with no format cannot be checked at all, and silently not
 * checking is the one outcome worse than checking against the wrong grammar.</p>
 */
function formatOf(details: EntityMetadata | undefined): ConfigFormat {
  return details?.configFormat ?? 'json';
}

/** One entity as the walk sees it — its id and whatever the tree stored about it. */
type FlagNode = { id: string; type: 'folder' | 'entity'; details?: EntityMetadata };

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
    const invalidConfigs = new Set<string>();
    for (const [accountId, node] of this.entities()) {
      await this.read(accountId, node, history, withPassword);
      await this.readConfigVerdict(accountId, node, invalidConfigs);
    }
    this.swapIn(history, withPassword, invalidConfigs);
  }

  /**
   * Is this config's stored body still what it claims to be?
   *
   * <p><b>Recomputed here, never stored.</b> A body can change without this window editing it —
   * a colleague's sync, an accepted share, a restore — and a verdict written down at save time
   * would then describe a document that is no longer there. The walk already runs at exactly
   * those moments.</p>
   *
   * <p>The keychain read happens ONLY for a config entry. Doing it for every entity would add a
   * cross-process read per row to a vault where almost nothing is a config, and the tree's whole
   * reason for having this cache is that it could not afford those.</p>
   */
  private async readConfigVerdict(
    accountId: string,
    node: FlagNode,
    invalid: Set<string>,
  ): Promise<void> {
    if (resolveKind(node.details) !== 'config') {
      return;
    }
    const body = await this.storage.getConfigBody(accountId, node.id);
    if (describeConfigProblem(formatOf(node.details), body ?? '') !== undefined) {
      invalid.add(entityKey(accountId, node.id));
    }
  }

  /** Every entity of every account, with what the tree knows about it. */
  private *entities(): Generator<[string, FlagNode]> {
    for (const account of this.storage.getAccounts()) {
      for (const node of this.storage.getNodes(account.accountId)) {
        if (node.type === 'entity') {
          yield [account.accountId, node];
        }
      }
    }
  }

  private async read(
    accountId: string,
    { id: entityId }: FlagNode,
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
  private swapIn(
    history: Map<string, RevisionHead[]>,
    withPassword: Set<string>,
    invalidConfigs: Set<string>,
  ): void {
    this.target.historyById.clear();
    for (const [key, heads] of history) {
      this.target.historyById.set(key, heads);
    }
    this.target.passwordIds.clear();
    for (const key of withPassword) {
      this.target.passwordIds.add(key);
    }
    this.target.invalidConfigIds.clear();
    for (const key of invalidConfigs) {
      this.target.invalidConfigIds.add(key);
    }
    this.target.refresh();
  }
}

/** Narrowing helper so `activate()` can hand the real storage to the refresher. */
export function entityFlagSource(storage: StorageManager): EntityFlagSource {
  return storage as unknown as EntityFlagSource;
}
