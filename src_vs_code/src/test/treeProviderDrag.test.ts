import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { TreeElement, TreeNode } from '../types';

/**
 * A drag across two profiles says what it left behind.
 *
 * <p>The bulk actions (Delete, Share, Export) report their skips through `describeSkips`. A
 * drag that started on a two-profile selection silently kept the first profile's rows and
 * dropped the rest — the one path where a narrowed selection gave no feedback at all.</p>
 */

const warnings: string[] = [];

class FakeTreeItem {
  constructor(
    readonly label: string,
    readonly collapsibleState?: number,
  ) {}
}

interface Provider {
  handleDrag(source: readonly TreeElement[], dataTransfer: { set(mime: string, item: unknown): void }): void;
}

const ProviderCtor = ((): new (storage: unknown, uri: unknown) => Provider => {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request === 'vscode') {
      return {
        TreeItem: FakeTreeItem,
        ThemeIcon: class {
          constructor(readonly id: string) {}
        },
        ThemeColor: class {
          constructor(readonly id: string) {}
        },
        MarkdownString: class {
          appendText(): void {}
        },
        EventEmitter: class {
          event = (): void => {};
          fire(): void {}
        },
        DataTransferItem: class {
          constructor(readonly value: unknown) {}
        },
        TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
        Uri: { joinPath: (): object => ({}) },
        window: {
          showWarningMessage: (text: string): Promise<undefined> => {
            warnings.push(text);
            return Promise.resolve(undefined);
          },
        },
      };
    }
    return original.call(this, request, ...rest);
  };
  try {
    return (require('../treeDataProvider') as { CredTreeDataProvider: never }).CredTreeDataProvider as never;
  } finally {
    loader._load = original;
  }
})();

const ACCOUNTS = [
  { accountId: 'a1', email: 'one@example.com', provider: 'microsoft' },
  { accountId: 'a2', email: 'two@example.com', provider: 'google' },
];

function entity(id: string): TreeNode {
  return { id, name: id, type: 'entity', details: { id, name: id, isSshEnabled: false } };
}

function build(): Provider {
  return new ProviderCtor(
    {
      getAccounts: () => ACCOUNTS,
      getAccount: (id: string) => ACCOUNTS.find((a) => a.accountId === id),
      getChildren: () => [],
      getPassword: () => Promise.resolve(undefined),
    },
    { fsPath: '/ext' },
  );
}

function drag(tree: Provider, elements: TreeElement[]): { accountId: string; ids: string[] } | undefined {
  let payload: { accountId: string; ids: string[] } | undefined;
  tree.handleDrag(elements, {
    set: (_mime, item) => {
      payload = (item as { value: { accountId: string; ids: string[] } }).value;
    },
  });
  return payload;
}

test('a single-profile drag carries every row and says nothing', () => {
  warnings.length = 0;
  const payload = drag(build(), [
    { kind: 'node', accountId: 'a1', node: entity('x') },
    { kind: 'node', accountId: 'a1', node: entity('y') },
  ]);
  assert.deepEqual(payload, { accountId: 'a1', ids: ['x', 'y'] });
  assert.deepEqual(warnings, []);
});

test('a two-profile drag keeps the first profile and says how many it left out', () => {
  warnings.length = 0;
  const payload = drag(build(), [
    { kind: 'node', accountId: 'a1', node: entity('x') },
    { kind: 'node', accountId: 'a2', node: entity('p') },
    { kind: 'node', accountId: 'a2', node: entity('q') },
  ]);
  assert.deepEqual(payload, { accountId: 'a1', ids: ['x'] });
  assert.equal(warnings.length, 1, 'one message, not one per skipped row');
  assert.ok(warnings[0].includes('one@example.com'), warnings[0]);
  assert.ok(warnings[0].includes('2 belong to another profile'), warnings[0]);
});
