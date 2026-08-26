import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeElement, TreeNode } from '../types';

/**
 * A short-lived entry says so on its own row.
 *
 * <p>Without this the only place a lifetime appeared was the form that set it, so a vault
 * of ephemeral entries looked exactly like a vault of permanent ones right up until they
 * started vanishing.</p>
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

function build(node: TreeNode): Provider {
  const storage = {
    getAccounts: () => [ACCOUNT],
    getAccount: () => ACCOUNT,
    getNodes: () => [node],
    getChildren: () => [node],
    getPassword: () => Promise.resolve(undefined),
  };
  return new ProviderCtor(storage, { fsPath: '/ext' });
}

function entity(details: Record<string, unknown>): TreeNode {
  return {
    id: 'e1',
    name: 'temp token',
    type: 'entity',
    details: { id: 'e1', name: 'temp token', isSshEnabled: false, ...details },
  } as TreeNode;
}

async function descriptionOf(node: TreeNode): Promise<string> {
  const tree = build(node);
  const item = await tree.getTreeItem({ kind: 'node', accountId: 'a1', node });
  return item.description ?? '';
}

test('an ordinary entry says nothing about time', async () => {
  assert.equal(await descriptionOf(entity({ host: 'srv.example.com' })), 'srv.example.com');
});

test('a timed entry shows how long it has left', async () => {
  const soon = Date.now() + 42 * 60_000;

  const text = await descriptionOf(entity({ expiresAt: soon, burnPolicy: 'ttl' }));

  assert.match(text, /expires in 4[23] min/, text);
});

test('the remaining time sits beside what the entry points at, not instead of it', async () => {
  const text = await descriptionOf(
    entity({ host: 'srv.example.com', expiresAt: Date.now() + 3 * 3600_000, burnPolicy: 'ttl' }),
  );

  assert.match(text, /srv\.example\.com/);
  assert.match(text, /expires in 3 h/);
});

test('a window-scoped entry says what actually ends it', async () => {
  // "Until VS Code closes", not "until this window closes": the lease is renewed by every
  // window on the machine, so the last one to close is the one that matters.
  const text = await descriptionOf(entity({ burnPolicy: 'onClose' }));

  assert.equal(text, 'until VS Code closes');
});

test('a one-use entry names the only thing that spends it', async () => {
  const text = await descriptionOf(entity({ burnPolicy: 'oneUse' }));

  assert.equal(text, 'until an agent uses it');
});

test('an entry already past its moment reads as expired rather than as a negative time', async () => {
  const text = await descriptionOf(entity({ expiresAt: Date.now() - 60_000, burnPolicy: 'ttl' }));

  assert.equal(text, 'expired');
});
