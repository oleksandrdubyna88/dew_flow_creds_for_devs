import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TreeElement, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * Rows in the Trash say so in their context value (the owner, 2026-08-28): Restore leads their
 * menu, and a trashed folder loses the items that only make sense for a live one.
 */

class FakeTreeItem {
  id?: string;
  description?: string;
  contextValue?: string;
  iconPath?: unknown;
  resourceUri?: unknown;
  tooltip?: unknown;
  command?: unknown;
  constructor(
    readonly label: string,
    readonly collapsibleState?: number,
  ) {}
}

interface Provider {
  getTreeItem(element: TreeElement): FakeTreeItem;
}

const stub = {
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
    dispose(): void {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  Uri: {
    joinPath: (...parts: unknown[]): object => ({ parts }),
    from: (parts: unknown): object => ({ parts }),
  },
};

const ACCOUNT = { accountId: 'a1', email: 'one@example.com', provider: 'microsoft' };
const TRASH: TreeNode = { id: 't', name: 'Trash', type: 'folder', parentId: null, isTrash: true };
const LIVE: TreeNode = { id: 'f', name: 'ssh', type: 'folder', parentId: null };
const GONE_FOLDER: TreeNode = { id: 'g', name: 'vpn', type: 'folder', parentId: 't', trashedFrom: null };
const GONE_ENTRY: TreeNode = {
  id: 'e',
  name: 'www',
  type: 'entity',
  parentId: 'g',
  details: { id: 'e', name: 'www', isSshEnabled: false },
};
const NODES = [TRASH, LIVE, GONE_FOLDER, GONE_ENTRY];

function build(): Provider {
  const { CredTreeDataProvider } = loadWithVscode<{ CredTreeDataProvider: new (storage: unknown, uri: unknown) => Provider }>(
    '../treeDataProvider',
    stub,
  );
  const storage = {
    getAccounts: () => [ACCOUNT],
    getAccount: () => ACCOUNT,
    getNodes: () => NODES,
    getNode: (_a: string, id: string) => NODES.find((n) => n.id === id),
    getChildren: (_a: string, parentId: string | null) => NODES.filter((n) => (n.parentId ?? null) === parentId),
    getPassword: () => Promise.resolve(undefined),
  };
  return new CredTreeDataProvider(storage, { fsPath: '/ext' });
}

const element = (node: TreeNode): TreeElement => ({ kind: 'node', accountId: 'a1', node }) as TreeElement;

test('a folder in the Trash is folder:trashed; the Trash itself and a live folder are not', () => {
  const tree = build();
  assert.equal(tree.getTreeItem(element(GONE_FOLDER)).contextValue, 'folder:trashed');
  assert.equal(tree.getTreeItem(element(TRASH)).contextValue, 'trashFolder');
  assert.equal(tree.getTreeItem(element(LIVE)).contextValue, 'folder');
});

test('an entry under a trashed folder is in the Trash too — its value leads with entity:trashed', () => {
  const tree = build();
  assert.ok((tree.getTreeItem(element(GONE_ENTRY)).contextValue ?? '').startsWith('entity:trashed'));
});
