import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TreeElement, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * T11 — re-creating a row: VS Code reads a node's `collapsibleState` only when the node is NEW,
 * so putting a twisty back means giving the row a new id. `reincarnate` does exactly that and
 * nothing else — the shadow row under a dependency keeps its own id, a folder is left alone.
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
  getChildren(element?: TreeElement): TreeElement[];
  getTreeItem(element: TreeElement): FakeTreeItem;
  reincarnate(element: TreeElement): void;
}

const fired: unknown[] = [];

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
    fire(element: unknown): void {
      fired.push(element);
    }
    dispose(): void {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  Uri: {
    joinPath: (...parts: unknown[]): object => ({ parts }),
    from: (parts: unknown): object => ({ parts }),
  },
};

const ACCOUNT = { accountId: 'a1', email: 'one@example.com', provider: 'microsoft' };
const FOLDER: TreeNode = { id: 'f-vpn', name: 'vpn', type: 'folder', parentId: null };
const VPN: TreeNode = {
  id: 'v1',
  name: 'org meter',
  type: 'entity',
  parentId: 'f-vpn',
  details: { id: 'v1', name: 'org meter', isSshEnabled: false },
};
const SSH: TreeNode = {
  id: 's1',
  name: 'access-server',
  type: 'entity',
  parentId: 'f-vpn',
  details: { id: 's1', name: 'access-server', isSshEnabled: false, dependsOn: ['v1'] } as never,
};
const NODES = [FOLDER, VPN, SSH];

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

test('a re-created row carries a new id, and the next one another — the workbench sees a NEW node each time', () => {
  const tree = build();
  fired.length = 0;
  assert.equal(tree.getTreeItem(element(VPN)).id, 'a1:v1');
  tree.reincarnate(element(VPN));
  assert.equal(tree.getTreeItem(element(VPN)).id, 'a1:v1#1');
  tree.reincarnate(element(VPN));
  assert.equal(tree.getTreeItem(element(VPN)).id, 'a1:v1#2');
  assert.equal(fired.length, 2, 'each re-creation fires one change for the row itself');
  assert.equal((fired[0] as { node: TreeNode }).node.id, 'v1');
});

test('the row under a dependency keeps its own id, and a sibling is untouched', () => {
  const tree = build();
  tree.reincarnate(element(VPN));
  // The shadow row lives under the ssh entry's "Depended on by" sub-tree.
  const shadow = tree.getChildren(element(SSH)).flatMap((group) => tree.getChildren(group));
  const shadowIds = shadow.map((child) => tree.getTreeItem(child).id);
  assert.ok(shadowIds.every((id) => id !== undefined && !id.endsWith('#1')), `shadow ids: ${shadowIds.join(', ')}`);
  assert.equal(tree.getTreeItem(element(SSH)).id, 'a1:s1');
});

test('a folder is never re-created — only entity rows carry the workbench toggle this undoes', () => {
  const tree = build();
  fired.length = 0;
  tree.reincarnate(element(FOLDER));
  assert.equal(tree.getTreeItem(element(FOLDER)).id, 'a1:f-vpn');
  assert.equal(fired.length, 0);
});
