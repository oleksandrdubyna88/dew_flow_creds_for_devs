import { TreeElement } from './types';

/**
 * Which rows the person had open, remembered across a reload and a reboot.
 *
 * <p>It was not remembered at all, and in two different ways. An account row was rendered
 * `Expanded` unconditionally, so collapsing one re-opened it on the next repaint — and a repaint
 * happens on every edit, every sync pull and every keystroke in the filter. A folder was rendered
 * `Collapsed` unconditionally, so opening one closed it again just as often. Between them the
 * tree had no memory in either direction.</p>
 *
 * <p><b>The key is deliberately not the row's `TreeItem.id`.</b> A folder's id carries the live
 * filter term while filtering — it has to, because VS Code remembers expansion per id and a
 * stable id would make it honour the collapsed state you left behind and refuse to open on a
 * hit. Keying the memory on that id would file one folder under a different name for every
 * search term ever typed.</p>
 *
 * <p>`vscode`-free: the keying and the defaults are the part worth testing, and neither needs an
 * editor to be true.</p>
 */

/** What a store must offer — `context.globalState` satisfies it, and so does a fake. */
export interface ExpansionStore {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

export const EXPANSION_KEY = 'credSshManager.expandedRows';

/**
 * A bound on how much of this can accumulate.
 *
 * <p>A key for a deleted entry is inert — ids are UUIDs and the key carries the account, so
 * nothing new ever lands on an old key — but "inert" is not "free", and a memento that only ever
 * grows is a slow leak nobody looks at. The oldest entries go first.</p>
 */
export const MAX_REMEMBERED = 5000;

/**
 * The stable identity of an expandable row, or nothing for a row that cannot expand.
 *
 * <p>Leaf kinds answer `undefined` rather than a key nobody would ever store, so a caller cannot
 * accidentally remember a row that has no twisty.</p>
 */
// eslint-disable-next-line complexity -- one arm per element kind; a switch reads worse here
export function expansionKey(element: TreeElement): string | undefined {
  if (element.kind === 'account') {
    return `account:${element.account.accountId}`;
  }
  if (element.kind === 'node') {
    return `node:${element.accountId}:${element.node.id}`;
  }
  if (element.kind === 'dependents') {
    return `dependents:${element.accountId}:${element.node.id}`;
  }
  if (element.kind === 'dependentsFolder') {
    return `depfolder:${element.accountId}:${element.targetId}:${element.folderId ?? 'root'}`;
  }
  return sharingKey(element);
}

function sharingKey(element: TreeElement): string | undefined {
  if (element.kind === 'teamScope') {
    return `teamScope:${element.account.accountId}`;
  }
  if (element.kind === 'sharedRoot') {
    return 'sharedRoot';
  }
  if (element.kind === 'sharedSender') {
    return `sharedSender:${element.email}`;
  }
  return undefined;
}

/**
 * The remembered set, and the defaults for a row nobody has touched yet.
 *
 * <p>Held in memory and written through, because `getTreeItem` is synchronous and a memento read
 * per row would be a cross-process call per row — the same reason the password and history flags
 * are cached rather than asked for.</p>
 */
export class ExpansionMemory {
  /**
   * Key -> open. A MAP rather than a set of open keys, and that is the whole design: an account
   * row defaults to OPEN, so "not in the set" cannot mean closed for it and open for a folder.
   * Recording both answers explicitly is what lets a deliberately collapsed account stay
   * collapsed, which a set of open rows could only express by inverting itself per kind.
   */
  private state: Record<string, boolean>;

  constructor(private readonly store: ExpansionStore) {
    this.state = { ...store.get<Record<string, boolean>>(EXPANSION_KEY, {}) };
  }

  /**
   * Should this row be drawn open?
   *
   * <p>`defaultOpen` applies only to a row nobody has touched. An account starts open, which is
   * what the tree did before and what somebody signing in for the first time wants; everything
   * else starts closed, because a vault of three hundred entries that opened every folder on
   * first sight would be worse than one that forgot.</p>
   */
  isOpen(key: string | undefined, defaultOpen: boolean): boolean {
    if (key === undefined) {
      return defaultOpen;
    }
    return this.state[key] ?? defaultOpen;
  }

  /** Write down what the person just did. A no-op when it is already what we hold. */
  async set(key: string | undefined, open: boolean): Promise<void> {
    if (key === undefined || this.state[key] === open) {
      return;
    }
    this.state = { ...this.state, [key]: open };
    await this.persist();
  }

  private async persist(): Promise<void> {
    const entries = Object.entries(this.state);
    // Insertion order is the order these were touched, so the oldest go first.
    const kept = entries.length > MAX_REMEMBERED ? entries.slice(-MAX_REMEMBERED) : entries;
    this.state = Object.fromEntries(kept);
    await this.store.update(EXPANSION_KEY, this.state);
  }
}
