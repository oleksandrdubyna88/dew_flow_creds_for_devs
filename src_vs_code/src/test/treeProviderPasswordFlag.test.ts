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
    // Plaintext metadata, in memory, and NOT a keychain read — which is the whole reason the
    // dependency index is allowed to be built inside `getTreeItem`. `reads` deliberately does
    // not move here, so the 300-entity guarantee below still measures what it says it does.
    getNodes: () => [FOLDER, ...nodes],
    // The row's icon asks for the parent folder and walks up from it, to know whether an agent
    // may reach this entry and whether it is in the Trash. Also not a keychain read.
    getNode: (_a: string, id: string) => [FOLDER, ...nodes].find((n) => n.id === id),
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

  // ':pinoff' is the half of the PIN pair an unprotected entry carries: the menu offers *Protect
  // with a PIN...* on this row and *Remove PIN Protection...* on the other, never both.
  assert.equal(withPassword.contextValue, 'entity:pwd:pinoff:shareable');
  assert.equal(without.contextValue, 'entity:pinoff', 'no password, no host: nothing to copy or share');
});

test('the flag is scoped to the account, because a restore can put one id into two profiles', async () => {
  const { tree } = build([entity('e1', 'with')]);
  tree.passwordIds?.add('other-account:e1');

  const item = await tree.getTreeItem({ kind: 'node', accountId: 'a1', node: entity('e1', 'with') });

  assert.equal(item.contextValue, 'entity:pinoff', 'another profile\'s password is not this row\'s');
});

// ---- the tokens the SSH-agent and TOTP menus hang off -------------------------
//
// Same shape as the `:pwd` cases above, and here for the same reason: which of "Add to SSH
// Agent" / "Remove from SSH Agent" a person sees, and whether "Copy One-Time Code" appears at
// all, is decided by these suffixes. A regression strands a shipped command behind a menu
// state nobody can reach, which is exactly how `terminal` shipped unselectable in 0.26.0.

function keyEntity(id: string, extra: Partial<TreeNode['details']> = {}): TreeNode {
  return {
    id,
    name: id,
    type: 'entity',
    parentId: null,
    details: { id, name: id, isSshEnabled: false, isSshKey: true, ...extra },
  } as TreeNode;
}

test('a key NOT served by the agent offers Add (:agentoff)', async () => {
  const { tree } = build([]);
  const off = await tree.getTreeItem({ kind: 'node', accountId: 'a1', node: keyEntity('k1') });

  assert.match(off.contextValue ?? '', /:key/);
  assert.match(off.contextValue ?? '', /:agentoff/);
});

test('a key that IS served offers Remove (:agenton), and not Add', async () => {
  const { tree } = build([]);
  const on = await tree.getTreeItem({
    kind: 'node',
    accountId: 'a1',
    node: keyEntity('k2', { sshAgent: true }),
  });

  assert.match(on.contextValue ?? '', /:agenton/);
  assert.equal((on.contextValue ?? '').includes(':agentoff'), false, on.contextValue);
});

test('the agent tokens appear only on a KEY entity — nothing else can be served', async () => {
  const { tree } = build([]);
  const plain = await tree.getTreeItem({ kind: 'node', accountId: 'a1', node: entity('e1', 'plain') });

  assert.equal((plain.contextValue ?? '').includes(':agent'), false, plain.contextValue);
});

test(':totp appears only when a seed is stored, and comes from the flag — not the keychain', async () => {
  const { tree, keychainReads } = build([]);
  const withSeed = { ...entity('e1', 'has'), details: { id: 'e1', name: 'has', isSshEnabled: false, hasTotp: true } } as TreeNode;

  const has = await tree.getTreeItem({ kind: 'node', accountId: 'a1', node: withSeed });
  const hasnt = await tree.getTreeItem({ kind: 'node', accountId: 'a1', node: entity('e2', 'none') });

  assert.match(has.contextValue ?? '', /:totp/);
  assert.equal((hasnt.contextValue ?? '').includes(':totp'), false, hasnt.contextValue);
  assert.equal(keychainReads(), 0, 'the seed is never read to decide a menu');
});

test('clearing the seed clears the token, so Copy One-Time Code stops being offered', async () => {
  // The regression this guards: a flag that only ever turns on leaves a command in the menu
  // that can no longer do anything.
  const { tree } = build([]);
  const cleared = { ...entity('e1', 'was'), details: { id: 'e1', name: 'was', isSshEnabled: false, hasTotp: undefined } } as TreeNode;

  const item = await tree.getTreeItem({ kind: 'node', accountId: 'a1', node: cleared });

  assert.equal((item.contextValue ?? '').includes(':totp'), false, item.contextValue);
});
