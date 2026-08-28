import { TreeElement } from './types';
import { expansionKey } from './treeExpansion';
import { LastClick, isDoubleClick, restoreNeeded } from './treeClicks';

type EntityElement = Extract<TreeElement, { kind: 'node' }>;

/** What the click handler needs from the world — the expansion memory, the tree, the viewer. */
export interface EntityClickDeps {
  readonly isOpen: (key: string | undefined) => boolean;
  readonly setOpen: (key: string | undefined, open: boolean) => void;
  readonly collapsible: (accountId: string, entityId: string) => boolean;
  readonly repaint: (element: TreeElement) => void;
  readonly open: (element: EntityElement) => Promise<void>;
  /** Injected in tests so the post-toggle check does not wait on a real timer. */
  readonly later?: (fn: () => void) => void;
}

/**
 * The entity row's click: select on one, open on two — and after opening, put the twisty back
 * where the workbench's own double-click toggle moved it (tails T11). Pure but for the
 * injected deps, so the whole sequence is a test rather than a mouse.
 */
export class EntityClicks {
  private last: LastClick = { id: '', time: 0, wasOpen: false };

  constructor(private readonly deps: EntityClickDeps) {}

  /** Wired to the real tree: the expansion memory, the provider's twisty rule and repaint. */
  static forTree(
    expansion: { isOpen(key: string | undefined, fallback: boolean): boolean; set(key: string | undefined, open: boolean): Promise<void> },
    provider: {
      hasHistory(accountId: string, entityId: string): boolean;
      dependencies: { hasDependents(accountId: string, entityId: string): boolean };
      refreshElement(element: TreeElement): void;
    },
    open: (element: EntityElement) => Promise<void>,
  ): EntityClicks {
    return new EntityClicks({
      isOpen: (key) => expansion.isOpen(key, false),
      setOpen: (key, isOpen) => void expansion.set(key, isOpen),
      collapsible: (accountId, id) =>
        provider.hasHistory(accountId, id) || provider.dependencies.hasDependents(accountId, id),
      repaint: (element) => provider.refreshElement(element),
      open,
    });
  }

  async click(element: EntityElement, now: number): Promise<void> {
    const key = expansionKey(element);
    const isDouble = isDoubleClick(this.last, element.node.id, now);
    // The FIRST click records whether the row was open; the second one restores it.
    this.last = {
      id: element.node.id,
      time: now,
      wasOpen: isDouble ? this.last.wasOpen : this.deps.isOpen(key),
    };
    if (!isDouble) {
      return;
    }
    await this.deps.open(element);
    const wasOpen = this.last.wasOpen;
    // The workbench's toggle lands around the same tick; check after it did.
    (this.deps.later ?? ((fn) => setTimeout(fn, 50)))(() => {
      const collapsible = this.deps.collapsible(element.accountId, element.node.id);
      if (restoreNeeded(wasOpen, this.deps.isOpen(key), collapsible)) {
        this.deps.setOpen(key, wasOpen);
        this.deps.repaint(element);
      }
    });
  }
}
