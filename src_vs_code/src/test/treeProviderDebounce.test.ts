import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeElement, TreeNode } from '../types';

/**
 * Typing into the filter (audit 2026-08-25, C2).
 *
 * <p>Every keystroke used to fire `onDidChangeTreeData` at once, and every fire made VS Code
 * re-ask for the whole tree — the root twice, every kept folder once more, each walk
 * re-filtering the account underneath. Two things are asserted here. The refresh is
 * <b>coalesced</b>: keystrokes inside the debounce window fire once. And the term is
 * <b>live before the fire</b>: `getChildren` answers with the new term immediately, which is what
 * lets Escape restore the previous term without a late keystroke overtaking it — the value is
 * never queued, only the repaint is.</p>
 *
 * <p>The third assertion is the memo: within one render, the account's filtered children are
 * asked for by the root (to decide whether to show the account) and again when the account row
 * opens; the second answer must come from the first, not from another walk of the storage.</p>
 */

class FakeTreeItem {
  id?: string;
  description?: string;
  contextValue?: string;
  iconPath?: unknown;
  tooltip?: unknown;
  command?: unknown;
  constructor(
    readonly label: string,
    readonly collapsibleState?: number,
  ) {}
}

const fires = { count: 0 };

interface Provider {
  getChildren(element?: TreeElement): TreeElement[];
  getTreeItem(element: TreeElement): FakeTreeItem | Promise<FakeTreeItem>;
  setSearchQuery(value: string): void;
  refresh(): void;
}

const ProviderCtor = ((): new (storage: unknown, uri: unknown) => Provider => {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request === 'vscode') {
      return {
        TreeItem: FakeTreeItem,
        ThemeIcon: class {
          constructor(
            readonly id: string,
            readonly color?: unknown,
          ) {}
        },
        ThemeColor: class {
          constructor(readonly id: string) {}
        },
        MarkdownString: class {
          supportThemeIcons = false;
          value = '';
          appendText(text: string): void {
            this.value += text;
          }
        },
        EventEmitter: class {
          event = (): void => {};
          fire(): void {
            fires.count += 1;
          }
        },
        TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
        Uri: {
          joinPath: (...parts: unknown[]): object => ({ parts }),
          from: (parts: unknown): object => ({ parts }),
        },
      };
    }
    return original.call(this, request, ...rest);
  };
  try {
    return (require('../treeDataProvider') as { CredTreeDataProvider: never })
      .CredTreeDataProvider as never;
  } finally {
    loader._load = original;
  }
})();

const ACCOUNT = { accountId: 'a1', email: 'one@example.com', provider: 'microsoft' as const };

function folder(id: string, name: string, parentId: string | null = null): TreeNode {
  return { id, name, type: 'folder', parentId };
}

function entity(id: string, name: string, parentId: string | null): TreeNode {
  return { id, name, type: 'entity', parentId, details: { id, name, isSshEnabled: false } };
}

const NODES: TreeNode[] = [
  folder('f1', 'Servers'),
  folder('f2', 'Databases'),
  entity('e1', 'prod api', 'f1'),
  entity('e2', 'stage api', 'f1'),
  entity('e3', 'warehouse', 'f2'),
];

function build(): { tree: Provider; storageWalks: () => number } {
  let walks = 0;
  const storage = {
    getAccounts: () => [ACCOUNT],
    getAccount: () => ACCOUNT,
    // Deliberately outside the `walks` tally: this test counts REPAINTS, and the dependency
    // index reads nodes once per repaint. Counting it here would make the debounce assertion
    // measure two different things at once.
    getNodes: () => NODES,
    getChildren: (_a: string, parentId: string | null) => {
      walks += 1;
      return NODES.filter((n) => (n.parentId ?? null) === parentId);
    },
    getPassword: () => Promise.resolve(undefined),
  };
  return { tree: new ProviderCtor(storage, { fsPath: '/ext' }), storageWalks: () => walks };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 120));

test('five keystrokes inside the debounce window fire one tree refresh', async () => {
  const { tree } = build();
  fires.count = 0;

  for (const typed of ['a', 'ap', 'api', 'api ', 'api p']) {
    tree.setSearchQuery(typed);
  }
  await settle();

  assert.equal(fires.count, 1, 'one onDidChangeTreeData for the whole burst');
});

test('the term is live before the refresh fires — Escape cannot be overtaken by a late keystroke', async () => {
  const { tree } = build();
  fires.count = 0;

  tree.setSearchQuery('warehouse');
  const shownAtOnce = tree.getChildren({ kind: 'account', account: ACCOUNT }).map((c) =>
    c.kind === 'node' ? c.node.name : c.kind,
  );
  assert.deepEqual(shownAtOnce, ['Databases'], 'getChildren already answers with the new term');
  assert.equal(fires.count, 0, 'but the repaint has not fired yet');

  tree.setSearchQuery(''); // Escape: put back what was there
  await settle();
  assert.equal(fires.count, 1);
  assert.deepEqual(
    tree.getChildren({ kind: 'account', account: ACCOUNT }).map((c) => (c.kind === 'node' ? c.node.name : c.kind)),
    ['Servers', 'Databases'],
    'the restored term is what the fire repaints — not the typed one',
  );
});

test('an immediate refresh (a mutation) absorbs a pending debounced one', async () => {
  const { tree } = build();
  fires.count = 0;

  tree.setSearchQuery('api');
  tree.refresh();
  await settle();

  assert.equal(fires.count, 1, 'the mutation\'s fire already carried the new term');
});

test('within one render the account\'s filtered children are walked once, not once per asker', async () => {
  const { tree, storageWalks } = build();
  tree.setSearchQuery('api');
  await settle();

  tree.getChildren(); // the root decides which accounts to show: walks the account
  const afterRoot = storageWalks();
  tree.getChildren({ kind: 'account', account: ACCOUNT }); // the account row opens: same question

  assert.equal(storageWalks(), afterRoot, 'the second asker is answered from the memo');
});

test('a mutation invalidates the memo, so a new entity appears under the same term', async () => {
  const { tree } = build();
  tree.setSearchQuery('api');
  await settle();
  tree.getChildren({ kind: 'account', account: ACCOUNT });

  NODES.push(entity('e9', 'new api', 'f2'));
  try {
    tree.refresh();
    const shown = tree.getChildren({ kind: 'account', account: ACCOUNT }).map((c) =>
      c.kind === 'node' ? c.node.name : c.kind,
    );
    assert.deepEqual(shown, ['Servers', 'Databases'], 'Databases is now kept because of the new hit');
  } finally {
    NODES.pop();
  }
});
