import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeElement, TreeNode } from '../types';

/**
 * The filter row's place in the tree.
 *
 * <p>Two things here are not obvious enough to leave to a screenshot: the row is the FIRST
 * root, above the first account, and it survives a filter that matches nothing. The second
 * one is the reason the first matters — a clear button that disappears along with the rows it
 * filtered out leaves no way back except reloading the window.</p>
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

const provider = ((): new (storage: unknown, uri: unknown) => {
  getChildren(element?: TreeElement): TreeElement[];
  getTreeItem(element: TreeElement): Promise<FakeTreeItem>;
  setSearchQuery(value: string): void;
} => {
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
          fire(): void {}
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

function entity(id: string, name: string): TreeNode {
  return { id, name, type: 'entity', details: { id, name, isSshEnabled: false } };
}

/** Just the parts of StorageManager the tree reads. */
function fakeStorage(tree: Record<string, TreeNode[]>) {
  const accounts = [
    { accountId: 'a1', email: 'one@example.com', provider: 'microsoft' },
    { accountId: 'a2', email: 'two@example.com', provider: 'google' },
  ];
  return {
    getAccounts: () => accounts,
    getAccount: (id: string) => accounts.find((a) => a.accountId === id),
    getNodes: (accountId: string) =>
      Object.entries(tree)
        .filter(([key]) => key.startsWith(`${accountId}:`))
        .flatMap(([, nodes]) => nodes),
    getChildren: (accountId: string, parentId: string | null) =>
      tree[`${accountId}:${parentId ?? 'root'}`] ?? [],
    getPassword: () => Promise.resolve(undefined),
  };
}

function build(): { getChildren(element?: TreeElement): TreeElement[]; getTreeItem(element: TreeElement): Promise<FakeTreeItem>; setSearchQuery(v: string): void } {
  const storage = fakeStorage({
    'a1:root': [entity('e1', 'GitHub token')],
    'a2:root': [entity('e2', 'Jira')],
  });
  return new provider(storage, { fsPath: '/ext' });
}

test('the filter row is the first root, above the first account', () => {
  const tree = build();
  const roots = tree.getChildren();

  assert.equal(roots[0]?.kind, 'search', 'the search row must come first');
  assert.deepEqual(
    roots.slice(1).map((r) => (r.kind === 'account' ? r.account.email : r.kind)),
    ['one@example.com', 'two@example.com'],
  );
});

test('a filter hides the accounts that hold no match', () => {
  const tree = build();
  tree.setSearchQuery('github');
  const roots = tree.getChildren();

  assert.deepEqual(
    roots.map((r) => (r.kind === 'account' ? r.account.email : r.kind)),
    ['search', 'one@example.com'],
  );
});

test('the filter row stays when nothing matches — otherwise there is no way to clear it', () => {
  const tree = build();
  tree.setSearchQuery('nothing-matches-this');

  assert.deepEqual(
    tree.getChildren().map((r) => r.kind),
    ['search'],
  );
});

test('the row shows the term, the count, and the context value the × hangs off', async () => {
  const tree = build();

  const idle = await tree.getTreeItem({ kind: 'search' });
  assert.equal(idle.label, 'Search');
  assert.equal(idle.contextValue, 'credSearch', 'no × while there is nothing to clear');

  tree.setSearchQuery('github');
  const active = await tree.getTreeItem({ kind: 'search' });
  assert.equal(active.label, 'Search: github');
  assert.equal(active.description, '1 found');
  assert.equal(active.contextValue, 'credSearchActive', 'this is what the inline × is keyed on');

  tree.setSearchQuery('nothing-matches-this');
  const empty = await tree.getTreeItem({ kind: 'search' });
  assert.equal(empty.description, 'nothing matches', 'an empty tree must say why it is empty');
});
