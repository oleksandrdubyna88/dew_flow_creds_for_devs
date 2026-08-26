import { DepColorKey } from './depColors';
import {
  DependencyIndex,
  RelationLabel,
  buildDependencyIndex,
  describeRelation,
  resolveTintColorKey,
} from './depGraph';
import { TreeNode } from './types';

/**
 * "Who depends on this", per account, for the length of one repaint — and the single copy of
 * that answer in the extension.
 *
 * <p>Two things read it: the tree, to decide whether an entity has a twisty and what goes under
 * it, and the decoration provider, to decide what colour a row's label is. They must never
 * disagree, and the cheapest way to guarantee that is not to have two indexes. This class is the
 * one; both hold the same instance.</p>
 *
 * <p><b>Deliberately not the `EntityFlagsRefresher` shape.</b> The history and password caches
 * are filled by a serialized background walk because answering them needs `SecretStorage`, which
 * `getTreeItem` cannot await. This answer needs none — `dependsOn` and `depColor` are plaintext
 * fields already resident in the node array — so it is built synchronously, on demand, and
 * discarded on the next refresh. That is `FilterMemo`'s lifecycle, and it avoids the hazard the
 * refresher exists to manage: a window after an edit in which the tree still paints the answers
 * from before it.</p>
 */

export interface DependencySource {
  getNodes(accountId: string): readonly TreeNode[];
  getNode(accountId: string, id: string): TreeNode | undefined;
}

export class DepIndexCache {
  private readonly indexes = new Map<string, DependencyIndex>();

  constructor(private readonly source: DependencySource) {}

  /** Thrown away wholesale — every mutation reaches `refresh()`, so nothing is invalidated by hand. */
  clear(): void {
    this.indexes.clear();
  }

  indexFor(accountId: string): DependencyIndex {
    const existing = this.indexes.get(accountId);
    if (existing !== undefined) {
      return existing;
    }
    const built = buildDependencyIndex(this.source.getNodes(accountId));
    this.indexes.set(accountId, built);
    return built;
  }

  /** The colour this row paints in, if it is in a relationship at all. */
  tintColorKey(accountId: string, entityId: string): DepColorKey | undefined {
    const node = this.source.getNode(accountId, entityId);
    return node === undefined ? undefined : resolveTintColorKey(node, this.indexFor(accountId));
  }

  /** The badge and tooltip for this row, or nothing when it is in no relationship at all. */
  relationLabel(accountId: string, entityId: string): RelationLabel | undefined {
    const node = this.source.getNode(accountId, entityId);
    return node === undefined ? undefined : describeRelation(node, this.indexFor(accountId));
  }

  hasDependents(accountId: string, entityId: string): boolean {
    return this.indexFor(accountId).hasDependents(entityId);
  }
}
