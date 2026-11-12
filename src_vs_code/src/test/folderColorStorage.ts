import { FolderColorStorage } from '../folderColors';
import { SerialQueue } from '../serialQueue';
import { TreeNode } from '../types';

/**
 * A fake of the three storage methods the folder-colour allocator uses, and the controls a race test needs.
 *
 * <p>A SECOND implementation of the storage contract: the allocator tests run over it and over the real
 * `StorageManager`. One `updateNodeFields` call is one TURN: wait a macrotask, run the one-shot hook, read the
 * list as it is NOW, evaluate the patch on that node (a missing id does not call it), record the change, wait a
 * macrotask, fail if told to, then store. Both waits matter: without the first a tally taken outside the lease
 * would look correct. Turns run one at a time through the real `SerialQueue`; `serial: false` lets them overlap.
 * It does NOT stamp `v` or `updatedAt`, so "nothing was written" is `written.length`, never node equality.</p>
 */
export interface WrittenChange {
  readonly accountId: string; readonly id: string; readonly byFunction: boolean; readonly change: Partial<TreeNode> | undefined;
}

type Patch = Partial<TreeNode> | ((node: TreeNode) => Partial<TreeNode>);

export interface FolderColorFake extends FolderColorStorage {
  updateNodeFields(accountId: string, id: string, patch: Patch): Promise<void>;
  readonly written: WrittenChange[];
  /** The account id of every `getNode`, `getNodes` and `updateNodeFields` call. */
  readonly touched: string[];
  /** Runs once, inside the next turn, before the patch reads the list. */
  beforePatch(run: () => void): void;
  /** The next turn rejects with this error after recording its change, and stores nothing. */
  failNextWrite(error: Error): void;
  /** Direct fixture edits, not recorded: replace the node with that id (or append it), and remove one. */
  put(accountId: string, node: TreeNode): void;
  remove(accountId: string, id: string): void;
}

const nextMacrotask = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export function folderColorStorage(
  seed: Readonly<Record<string, readonly TreeNode[]>>,
  options: { readonly serial?: boolean } = {},
): FolderColorFake {
  const lists = new Map<string, readonly TreeNode[]>(Object.entries(seed).map(([id, nodes]) => [id, Object.freeze([...nodes])]));
  const queue = new SerialQueue();
  const written: WrittenChange[] = [];
  const touched: string[] = [];
  let hook: (() => void) | undefined;
  let failure: Error | undefined;
  const listOf = (accountId: string): readonly TreeNode[] => lists.get(accountId) ?? [];
  const store = (accountId: string, nodes: readonly TreeNode[]): void => {
    lists.set(accountId, Object.freeze(nodes));
  };

  /** The patch's result for the node as it is now; `undefined` when the id is not there (no patch call). */
  function evaluate(accountId: string, id: string, patch: Patch): Partial<TreeNode> | undefined {
    const node = listOf(accountId).find((n) => n.id === id);
    return node === undefined ? undefined : typeof patch === 'function' ? patch(node) : patch;
  }

  /** Step 6 and 7: fail if told to, else store the list with the change applied to the list as it is now. */
  function settle(accountId: string, id: string, change: Partial<TreeNode> | undefined): void {
    const error = failure;
    failure = undefined;
    if (error !== undefined) {
      throw error;
    }
    if (change !== undefined) {
      store(accountId, listOf(accountId).map((n) => (n.id === id ? { ...n, ...change } : n)));
    }
  }

  async function turn(accountId: string, id: string, patch: Patch): Promise<void> {
    await nextMacrotask();
    const run = hook;
    hook = undefined;
    run?.();
    const change = evaluate(accountId, id, patch);
    written.push({ accountId, id, byFunction: typeof patch === 'function', change });
    await nextMacrotask();
    settle(accountId, id, change);
  }

  return {
    written,
    touched,
    getNode: (accountId, id) => {
      touched.push(accountId);
      return listOf(accountId).find((n) => n.id === id);
    },
    getNodes: (accountId) => {
      touched.push(accountId);
      return listOf(accountId);
    },
    updateNodeFields: (accountId, id, patch) => {
      touched.push(accountId);
      return options.serial === false ? turn(accountId, id, patch) : queue.run(() => turn(accountId, id, patch));
    },
    beforePatch: (run) => {
      hook = run;
    },
    failNextWrite: (error) => {
      failure = error;
    },
    put: (accountId, node) => {
      const rest = listOf(accountId);
      store(accountId, rest.some((n) => n.id === node.id) ? rest.map((n) => (n.id === node.id ? node : n)) : [...rest, node]);
    },
    remove: (accountId, id) => store(accountId, listOf(accountId).filter((n) => n.id !== id)),
  };
}
