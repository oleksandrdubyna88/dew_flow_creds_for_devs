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
  // The separator (T29) sits BETWEEN accounts — never before the first, never after the last.
  assert.deepEqual(
    roots.slice(1).map((r) => (r.kind === 'account' ? r.account.email : r.kind)),
    ['one@example.com', 'separator', 'two@example.com'],
  );
  assert.notEqual(roots[1]?.kind, 'separator', 'a separator before the first account separates nothing');
  assert.notEqual(roots.at(-1)?.kind, 'separator', 'a separator after the last account separates nothing');
});

test('a lone account gets no separator, and the separator row is inert', async () => {
  const storage = fakeStorage({ 'a1:root': [entity('e1', 'GitHub token')] });
  // One signed-in account: the fixture's list is cut down, not just its nodes.
  storage.getAccounts = () => [{ accountId: 'a1', email: 'one@example.com', provider: 'microsoft' }];
  const tree = new provider(storage, { fsPath: '/ext' });
  const roots = tree.getChildren();
  assert.ok(!roots.some((r) => r.kind === 'separator'), 'one account needs nothing separated');

  const two = build();
  const separator = two.getChildren().find((r) => r.kind === 'separator');
  assert.ok(separator !== undefined);
  const item = await two.getTreeItem(separator);
  assert.equal(item.command, undefined, 'a separator with a command is a button in disguise');
  assert.equal(item.contextValue, 'separator');
  assert.equal(two.getChildren(separator).length, 0);
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

/**
 * Shared-with-me at the TOP, and separated like an account.
 *
 * <p>The row was built last, after every account, which is where a person with three accounts
 * and forty entries never scrolls to — the owner's words were that you simply cannot see it.
 * It is also the one root whose contents somebody else decides, so a share arriving is exactly
 * the event that should be visible without looking for it.</p>
 */

/** The shape the provider reads off `sharing`, and nothing more. */
function fakeShare(fromEmail: string, entityName: string): unknown {
  return { accountId: 'a1', shareKeyId: 'k1', item: { fromEmail, entityName, entityKind: 'credential' } };
}

function withShares(...shares: unknown[]): ReturnType<typeof build> {
  const tree = build();
  (tree as unknown as { sharing: unknown }).sharing = { ownShares: shares };
  return tree;
}

test('what somebody shared with you is the first thing under the filter, not the last', () => {
  const roots = withShares(fakeShare('lead@example.com', 'Prod DB')).getChildren();

  assert.deepEqual(
    roots.map((r) => (r.kind === 'account' ? r.account.email : r.kind)),
    ['search', 'sharedRoot', 'separator', 'one@example.com', 'separator', 'two@example.com'],
  );
});

test('the shared root is separated from the accounts by the same row that separates accounts', async () => {
  const tree = withShares(fakeShare('lead@example.com', 'Prod DB'));
  const roots = tree.getChildren();

  // Anchored to the shared row, not to a position: an earlier draft of this test read
  // roots[2] and passed against the OLD order by landing on the separator between the two
  // accounts — green while the feature did not exist.
  const boundary = roots[roots.findIndex((r) => r.kind === 'sharedRoot') + 1];
  assert.equal(boundary?.kind, 'separator', 'shared and owned are different things and read as one list without it');
  const item = await tree.getTreeItem(boundary);
  assert.equal(item.contextValue, 'separator');
  assert.equal(item.command, undefined, 'a separator with a command is a button in disguise');
  assert.equal(item.label, '');
  const betweenAccounts = roots.filter((r) => r.kind === 'separator');
  assert.equal(betweenAccounts.length, 2, 'one boundary above the accounts, one between them');
  const ids = await Promise.all(betweenAccounts.map(async (r) => (await tree.getTreeItem(r)).id));
  assert.equal(new Set(ids).size, 2, 'VS Code keys a row on its id: two separators sharing one collapse into one row');
});

test('no shares, no separator — the edge rule holds at the top as it does at the bottom', () => {
  const roots = build().getChildren();
  assert.equal(roots[1]?.kind, 'account', 'nothing above the accounts means nothing to separate them from');
  assert.equal(roots.filter((r) => r.kind === 'separator').length, 1, 'only the one between the two accounts');
});

test('a filter that hides every account leaves the shared root with no separator under it', () => {
  const tree = withShares(fakeShare('lead@example.com', 'Prod DB'));
  tree.setSearchQuery('nothing-matches-this');
  const roots = tree.getChildren();

  assert.deepEqual(
    roots.map((r) => r.kind),
    ['search'],
    'the filter matches neither the accounts nor the share, so only the filter row stays',
  );

  tree.setSearchQuery('prod db');
  assert.deepEqual(
    tree.getChildren().map((r) => r.kind),
    ['search', 'sharedRoot'],
    'a separator below the last row separates nothing',
  );
});
