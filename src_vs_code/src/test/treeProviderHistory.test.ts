import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeElement, TreeNode } from '../types';
import { RevisionHead } from '../revisionHistory';
import { entityKey } from '../entityFlags';

/**
 * History as rows under the entity.
 *
 * <p>The tint on an entity's icon said "this has previous versions"; what it did not do was
 * show them anywhere but a list inside the viewer. The versions are now the entity's
 * children in the tree — one twisty away, where the tint promised they were.</p>
 */

class FakeTreeItem {
  id?: string;
  description?: string;
  contextValue?: string;
  iconPath?: unknown;
  tooltip?: unknown;
  command?: { command: string; arguments?: unknown[] };
  constructor(
    readonly label: string,
    readonly collapsibleState?: number,
  ) {}
}

interface Provider {
  historyById: Map<string, RevisionHead[]>;
  hasHistory(accountId: string, entityId: string): boolean;
  getChildren(element?: TreeElement): TreeElement[];
  getTreeItem(element: TreeElement): Promise<FakeTreeItem>;
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

function entity(id: string, name: string, details: Partial<TreeNode['details']> = {}): TreeNode {
  return { id, name, type: 'entity', details: { id, name, isSshEnabled: false, ...details } };
}

function build(nodes: TreeNode[]): Provider {
  const storage = {
    getAccounts: () => [ACCOUNT],
    getAccount: () => ACCOUNT,
    getNodes: () => nodes,
    getChildren: (_a: string, parentId: string | null) =>
      nodes.filter((n) => (n.parentId ?? null) === parentId),
    getPassword: () => Promise.resolve(undefined),
  };
  return new ProviderCtor(storage, { fsPath: '/ext' });
}

const HEADS: RevisionHead[] = [
  { at: 1_700_000_900_000, name: 'newer name', details: { id: 'e1', name: 'newer name', isSshEnabled: false, isTerminal: true, command: 'aws sso login' } },
  { at: 1_700_000_000_000, name: 'first name', details: { id: 'e1', name: 'first name', isSshEnabled: false, isTerminal: true, command: 'aws login' } },
];

test('an entity without history is a leaf, and has no children', async () => {
  const tree = build([entity('e1', 'plain')]);
  const element: TreeElement = { kind: 'node', accountId: 'a1', node: entity('e1', 'plain') };

  const item = await tree.getTreeItem(element);
  assert.equal(item.collapsibleState, 0, 'TreeItemCollapsibleState.None');
  assert.deepEqual(tree.getChildren(element), []);
});

test('an entity with history opens, and its children are its versions newest first', async () => {
  const node = entity('e1', 'cmd', { isTerminal: true, command: 'aws sso login --profile x' });
  const tree = build([node]);
  tree.historyById.set(entityKey('a1', 'e1'), HEADS);
  const element: TreeElement = { kind: 'node', accountId: 'a1', node };

  const item = await tree.getTreeItem(element);
  assert.equal(item.collapsibleState, 1, 'TreeItemCollapsibleState.Collapsed — the twisty is the affordance');

  const children = tree.getChildren(element);
  assert.deepEqual(
    children.map((c) => (c.kind === 'revision' ? c.index : c.kind)),
    [0, 1],
  );
  for (const child of children) {
    assert.equal(child.kind, 'revision');
    if (child.kind === 'revision') {
      assert.equal(child.node.id, 'e1', 'a revision row knows which entity it belongs to');
    }
  }
});

test('a version row is labelled by when and what, and opens on a single click', async () => {
  const node = entity('e1', 'cmd', { isTerminal: true });
  const tree = build([node]);
  tree.historyById.set(entityKey('a1', 'e1'), HEADS);

  const first = await tree.getTreeItem({ kind: 'revision', accountId: 'a1', node, index: 0 });
  assert.ok(first.label.includes('"newer name"'), `label names the version: ${first.label}`);
  assert.equal(first.description, 'previous version');
  assert.equal(first.command?.command, 'credSshManager.revisionClicked');
  assert.equal(first.id, 'a1:e1:rev0');

  const second = await tree.getTreeItem({ kind: 'revision', accountId: 'a1', node, index: 1 });
  assert.equal(second.description, '2 versions ago');
});

test('a version row carries the Run/Copy suffixes of its OWN kind — and nothing else', async () => {
  // Run in Terminal and Copy Command are keyed on `:cmd`; Edit on `^entity`; Share on
  // `:shareable`; Copy Password on `:pwd`. A version must reach the first pair and none of
  // the rest: it is something to look at, run, or clone from, never something to change.
  const node = entity('e1', 'cmd', { isTerminal: true });
  const tree = build([node]);
  tree.historyById.set(entityKey('a1', 'e1'), HEADS);

  const item = await tree.getTreeItem({ kind: 'revision', accountId: 'a1', node, index: 0 });
  assert.equal(item.contextValue, 'revision:cmd');
  assert.equal(/^entity/.test(item.contextValue ?? ''), false, 'no Edit');
  assert.equal(/:shareable/.test(item.contextValue ?? ''), false, 'no Share');
  assert.equal(/:pwd/.test(item.contextValue ?? ''), false, 'no Copy Password');
});

test('a version that is no longer kept renders as such instead of throwing', async () => {
  // History is capped at three and rewritten in place, so an index from a stale tree can
  // point past the end after the next edit.
  const node = entity('e1', 'cmd');
  const tree = build([node]);
  tree.historyById.set(entityKey('a1', 'e1'), HEADS);

  const item = await tree.getTreeItem({ kind: 'revision', accountId: 'a1', node, index: 7 });
  assert.equal(item.label, 'version no longer kept');
  assert.equal(item.contextValue, 'revision');
});

test('the cache holds heads: no secret field can be reached through the tree', () => {
  // What `refreshHistoryFlags` stores is `history.map(revisionHead)`; this pins the type
  // of the cache so a future "just cache the whole revision" cannot compile.
  const tree = build([]);
  const head: RevisionHead = HEADS[0];
  tree.historyById.set(entityKey('a1', 'x'), [head]);
  const stored = tree.historyById.get(entityKey('a1', 'x'))?.[0] as unknown as Record<string, unknown>;
  assert.equal('secrets' in stored, false);
});
