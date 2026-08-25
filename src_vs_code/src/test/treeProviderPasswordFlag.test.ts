import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeElement, TreeNode } from '../types';

/**
 * Whether "Copy Password" belongs in an entity's menu (audit 2026-08-25, C1).
 *
 * <p>`getTreeItem` used to answer by reading the keychain — one cross-process read per row, so
 * opening a folder of 300 entries made 300 of them, to decide the contents of context menus
 * nobody had opened. The answer is now cached on the provider, filled at the moments it can
 * change (an edit, an accepted share, a restore, a pulled sync), exactly as `readiness` and
 * `historyById` are. What is asserted: rendering reads the keychain ZERO times, and the flag
 * still drives `:pwd` and `:shareable` the way it did.</p>
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

interface Provider {
  passwordIds?: Set<string>;
  getChildren(element?: TreeElement): TreeElement[];
  getTreeItem(element: TreeElement): FakeTreeItem | Promise<FakeTreeItem>;
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
        Uri: { joinPath: (...parts: unknown[]): object => ({ parts }) },
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

function entity(id: string, name: string): TreeNode {
  return {
    id,
    name,
    type: 'entity',
    parentId: 'f1',
    details: { id, name, isSshEnabled: false },
  };
}

const FOLDER: TreeNode = { id: 'f1', name: 'Many', type: 'folder', parentId: null };

function build(nodes: TreeNode[]): { tree: Provider; keychainReads: () => number } {
  let reads = 0;
  const storage = {
    getAccounts: () => [ACCOUNT],
    getAccount: () => ACCOUNT,
    getChildren: (_a: string, parentId: string | null) =>
      [FOLDER, ...nodes].filter((n) => (n.parentId ?? null) === parentId),
    getPassword: () => {
      reads += 1;
      return Promise.resolve('secret');
    },
  };
  return { tree: new ProviderCtor(storage, { fsPath: '/ext' }), keychainReads: () => reads };
}

const THREE_HUNDRED = Array.from({ length: 300 }, (_, i) => entity(`e${i}`, `entry ${i}`));

test('expanding a folder of 300 entities reads the keychain zero times', async () => {
  const { tree, keychainReads } = build(THREE_HUNDRED);
  const folderElement: TreeElement = { kind: 'node', accountId: 'a1', node: FOLDER };

  for (const child of tree.getChildren(folderElement)) {
    await tree.getTreeItem(child);
  }

  assert.equal(keychainReads(), 0, 'getTreeItem must not call storage.getPassword');
});

test('the cached flag is what puts Copy Password (:pwd) and Share (:shareable) in the menu', async () => {
  const { tree } = build([entity('e1', 'with'), entity('e2', 'without')]);
  assert.ok(tree.passwordIds, 'the provider carries the hasPassword cache');
  tree.passwordIds.add('a1:e1');

  const withPassword = await tree.getTreeItem({ kind: 'node', accountId: 'a1', node: entity('e1', 'with') });
  const without = await tree.getTreeItem({ kind: 'node', accountId: 'a1', node: entity('e2', 'without') });

  assert.equal(withPassword.contextValue, 'entity:pwd:shareable');
  assert.equal(without.contextValue, 'entity', 'no password, no host: nothing to copy or share');
});

test('the flag is scoped to the account, because a restore can put one id into two profiles', async () => {
  const { tree } = build([entity('e1', 'with')]);
  tree.passwordIds?.add('other-account:e1');

  const item = await tree.getTreeItem({ kind: 'node', accountId: 'a1', node: entity('e1', 'with') });

  assert.equal(item.contextValue, 'entity', 'another profile\'s password is not this row\'s');
});
