import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { RevisionHead } from '../revisionHistory';
import { entityKey } from '../entityFlags';
import { TreeElement, TreeNode } from '../types';

/**
 * The "Depended on by" sub-tree, and the one requirement that is easiest to break by accident:
 * it must sit BESIDE the revision history, not in place of it.
 *
 * <p>An entity's children were a single hard-coded list of its kept versions. Two sub-trees now
 * share that list, and nothing about the code makes it obvious that both survive — which is why
 * the first test below builds an entity that has both and asserts it shows both.</p>
 */

class FakeTreeItem {
  id?: string;
  description?: string;
  contextValue?: string;
  iconPath?: { id?: string; color?: { id: string } };
  resourceUri?: unknown;
  tooltip?: unknown;
  command?: { command: string; arguments?: unknown[] };
  constructor(
    readonly label: string,
    readonly collapsibleState?: number,
  ) {}
}

interface Provider {
  historyById: Map<string, RevisionHead[]>;
  getChildren(element?: TreeElement): TreeElement[];
  getTreeItem(element: TreeElement): FakeTreeItem;
  getParent(element: TreeElement): TreeElement | undefined;
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
          fire(): void {}
          dispose(): void {}
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

const ACCOUNT = { accountId: 'a1', email: 'one@example.com', provider: 'microsoft' };

function folder(id: string, name: string): TreeNode {
  return { id, name, type: 'folder', parentId: null };
}

function entity(
  id: string,
  name: string,
  parentId: string | null,
  extra: { dependsOn?: string[]; depColor?: string } = {},
): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    parentId,
    details: { id, name, isSshEnabled: false, ...extra },
  };
}

function build(nodes: TreeNode[]): Provider {
  const storage = {
    getAccounts: () => [ACCOUNT],
    getAccount: () => ACCOUNT,
    getNodes: () => nodes,
    getNode: (_a: string, id: string) => nodes.find((n) => n.id === id),
    getChildren: (_a: string, parentId: string | null) =>
      nodes.filter((n) => (n.parentId ?? null) === parentId),
    getPassword: () => Promise.resolve(undefined),
  };
  return new ProviderCtor(storage, { fsPath: '/ext' });
}

const VPN = entity('v1', 'org meter', 'f-vpn', { depColor: 'depColor7' });
const SSH = entity('s1', 'access-server', 'f-ssh', { dependsOn: ['v1'] });
const OTHER = entity('s2', 'project-tools', 'f-ssh');
const NODES = [folder('f-vpn', 'vpn'), folder('f-ssh', 'ssh connections'), VPN, SSH, OTHER];

test('an entity with BOTH kept versions and dependents shows both, not one instead of the other', () => {
  const tree = build(NODES);
  tree.historyById.set(entityKey('a1', 'v1'), [
    { at: 1, name: 'org meter' },
    { at: 2, name: 'org meter' },
  ] as RevisionHead[]);

  const children = tree.getChildren({ kind: 'node', accountId: 'a1', node: VPN });

  assert.deepEqual(
    children.map((c) => c.kind),
    ['revision', 'revision', 'dependents'],
    'the two sub-trees must be siblings — one replacing the other is the defect this pins',
  );
});

test('an entity nothing depends on grows no sub-tree, and stays a leaf without history', () => {
  const tree = build(NODES);
  assert.deepEqual(tree.getChildren({ kind: 'node', accountId: 'a1', node: OTHER }), []);
  assert.equal(tree.getTreeItem({ kind: 'node', accountId: 'a1', node: OTHER }).collapsibleState, 0);
});

test('being depended on alone is enough to open a twisty', () => {
  const tree = build(NODES);
  assert.equal(tree.getTreeItem({ kind: 'node', accountId: 'a1', node: VPN }).collapsibleState, 1);
});

test('the sub-tree groups dependents by folder and lists ONLY them', () => {
  const tree = build(NODES);
  const groups = tree.getChildren({ kind: 'dependents', accountId: 'a1', node: VPN });
  assert.equal(groups.length, 1);

  const group = groups[0] as Extract<TreeElement, { kind: 'dependentsFolder' }>;
  assert.equal(group.name, 'ssh connections');

  const rows = tree.getChildren(group);
  assert.deepEqual(
    rows.map((r) => (r as Extract<TreeElement, { kind: 'dependentEntity' }>).node.name),
    ['access-server'],
    'project-tools lives in the same folder and depends on nothing — it must not be here',
  );
});

test('a shadow row offers the same menu as the real row, and a DIFFERENT tree identity', () => {
  const tree = build(NODES);
  const real = tree.getTreeItem({ kind: 'node', accountId: 'a1', node: SSH });
  const shadow = tree.getTreeItem({
    kind: 'dependentEntity',
    accountId: 'a1',
    targetId: 'v1',
    node: SSH,
  });

  // Same contextValue: an entry you can act on is one you can act on wherever you found it.
  assert.equal(shadow.contextValue, real.contextValue);
  assert.equal(shadow.label, real.label);
  // Different id: VS Code keys expansion and selection on it, so sharing one would make the
  // entity's two positions move together.
  assert.notEqual(shadow.id, real.id);
  assert.equal(real.id, 'a1:s1');
});

test('a shadow row opens the entity itself, never a second kind of thing', () => {
  const tree = build(NODES);
  const shadow = tree.getTreeItem({
    kind: 'dependentEntity',
    accountId: 'a1',
    targetId: 'v1',
    node: SSH,
  });
  assert.deepEqual(shadow.command?.arguments, [{ kind: 'node', accountId: 'a1', node: SSH }]);
});

test('every entity row carries the address the decorations answer for', () => {
  const tree = build(NODES);
  assert.notEqual(tree.getTreeItem({ kind: 'node', accountId: 'a1', node: OTHER }).resourceUri, undefined);
});

test('the sub-tree root wears its own icon, so it is never mistaken for the history twisty', () => {
  const tree = build(NODES);
  const item = tree.getTreeItem({ kind: 'dependents', accountId: 'a1', node: VPN });
  assert.equal(item.iconPath?.id, 'references');
  assert.equal(item.iconPath?.color?.id, 'credSshManager.depColor7');
  assert.equal(item.contextValue, 'dependents');
  assert.equal(item.description, '1');
});

test('only a real folder offers the go-to button; the account root has nowhere to go', () => {
  const tree = build(NODES);
  const rooted = entity('r1', 'loose', null, { dependsOn: ['v1'] });
  const rootTree = build([...NODES, rooted]);

  const realFolder = tree.getChildren({ kind: 'dependents', accountId: 'a1', node: VPN })[0];
  assert.equal(tree.getTreeItem(realFolder).contextValue, 'dependentsFolder');

  const groups = rootTree.getChildren({ kind: 'dependents', accountId: 'a1', node: VPN });
  const rootGroup = groups.find(
    (g) => (g as Extract<TreeElement, { kind: 'dependentsFolder' }>).folderId === null,
  );
  assert.notEqual(rootGroup, undefined);
  assert.equal(rootTree.getTreeItem(rootGroup as TreeElement).contextValue, 'dependentsRoot');
});

test('the walk a reveal needs resolves from a sub-tree folder back to its target', () => {
  const tree = build(NODES);
  const group = tree.getChildren({ kind: 'dependents', accountId: 'a1', node: VPN })[0];
  assert.deepEqual(tree.getParent(group), { kind: 'dependents', accountId: 'a1', node: VPN });
  assert.deepEqual(tree.getParent({ kind: 'dependents', accountId: 'a1', node: VPN }), {
    kind: 'node',
    accountId: 'a1',
    node: VPN,
  });
});
