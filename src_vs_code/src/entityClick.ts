import { TreeElement } from './types';
import { expansionKey } from './treeExpansion';
import { LastClick, isDoubleClick, restoreNeeded } from './treeClicks';

type EntityElement = Extract<TreeElement, { kind: 'node' }>;

/** What the click handler needs from the world — the expansion memory, the tree, the viewer. */
export interface EntityClickDeps {
  readonly isOpen: (key: string | undefined) => boolean;
  readonly setOpen: (key: string | undefined, open: boolean) => void;
  readonly collapsible: (accountId: string, entityId: string) => boolean;
  /** Re-creates the row so its remembered state is read again, and keeps it selected. */
  readonly repaint: (element: TreeElement) => void | Promise<void>;
  readonly open: (element: EntityElement) => Promise<void>;
  /** Injected in tests so the post-toggle check does not wait on a real timer. */
  readonly later?: (fn: () => void) => void;
}

/**
 * The entity row's click: select on one, open on two — and after opening, put the twisty back
 * where the workbench's own double-click toggle moved it (tails T11). The toggle cannot be
 * prevented (`expandOnDoubleClick` is not the extension's to set), only undone — and undoing
 * it means re-creating the row, because a refresh keeps an existing node's expansion. Pure but for the
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
      reincarnate(element: TreeElement): void;
    },
    treeView: { reveal(element: TreeElement, options: { select: boolean; focus: boolean }): Thenable<void> },
    open: (element: EntityElement) => Promise<void>,
  ): EntityClicks {
    return new EntityClicks({
      isOpen: (key) => expansion.isOpen(key, false),
      setOpen: (key, isOpen) => void expansion.set(key, isOpen),
      collapsible: (accountId, id) =>
        provider.hasHistory(accountId, id) || provider.dependencies.hasDependents(accountId, id),
      // A new node is an unselected node; the reveal puts the selection back without taking
      // focus from the viewer that just opened.
      repaint: async (element) => {
        provider.reincarnate(element);
        await treeView.reveal(element, { select: true, focus: false });
      },
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
        void this.deps.repaint(element);
      }
    });
  }
}
