import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { ServerSection } from '../orgPolicyRefresh';
import { ServerMetrics } from '../serverMetricsPage';
import { CorpPolicyState } from '../corpPolicy';
import { StoredAccount, TreeElement, TreeNode } from '../types';

/**
 * The Server section as the tree actually assembles it.
 *
 * <p>`serverItems.test.ts` pins what each row LOOKS like; this pins the two things only the
 * provider can answer — which sections an account row grows, and what expands under the scope
 * row. The first draft of this feature injected the scope row and forgot the second, which is a
 * section that opens onto nothing.</p>
 *
 * <p>The three rows are returned unconditionally, even with empty caches: a row whose cache is
 * empty draws its `checking…` state, so the section's SHAPE is constant and a person learns where
 * to look.</p>
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
  orgPolicy: Map<string, CorpPolicyState>;
  server: ServerSection;
  sharing: unknown;
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

const ACCOUNT: StoredAccount = { accountId: 'a1', email: 'one@example.com', provider: 'microsoft' };

function build(): Provider {
  const nodes: TreeNode[] = [];
  const storage = {
    getAccounts: () => [ACCOUNT],
    getAccount: () => ACCOUNT,
    getNodes: () => nodes,
    getNode: () => undefined,
    getChildren: () => nodes,
    getPassword: () => Promise.resolve(undefined),
  };
  return new ProviderCtor(storage, { fsPath: '/ext' });
}

const policy = (over: Partial<CorpPolicyState>): CorpPolicyState =>
  ({ corpMode: true, role: 'member', isOfficer: false, isAdmin: false, ...over }) as CorpPolicyState;

/** A team of two, as the sharing manager would report it. */
const SHARING = {
  ownShares: [],
  teamFailures: new Map(),
  teamFor: () => [{ account: ACCOUNT, isSelf: true }, { account: ACCOUNT, isSelf: false }],
};

test('an administrator’s account grows a Server section ABOVE Team', () => {
  const tree = build();
  tree.orgPolicy.set('a1', policy({ role: 'admin' }));
  tree.sharing = SHARING;

  const kinds = tree.getChildren({ kind: 'account', account: ACCOUNT }).map((child) => child.kind);

  assert.deepEqual(kinds, ['serverScope', 'teamScope']);
});

test('the section opens onto its three rows, in order, even with every cache empty', () => {
  // The defect this pins: injecting the scope row and forgetting what expands under it is a
  // section that opens onto nothing, and it looks exactly like a broken tree.
  const tree = build();
  tree.orgPolicy.set('a1', policy({ role: 'admin' }));

  const children = tree.getChildren({ kind: 'serverScope', account: ACCOUNT });

  assert.deepEqual(children.map((child) => child.kind), ['serverVersion', 'serverVaults', 'serverBackup']);
  assert.deepEqual(
    children.map((child) => tree.getTreeItem(child).description),
    ['checking…', 'checking…', 'checking…'],
    'a row with nothing cached says so rather than disappearing',
  );
});

test('a developer sees exactly what they saw before this section existed', () => {
  const tree = build();
  tree.orgPolicy.set('a1', policy({ role: 'dev' }));
  tree.sharing = SHARING;

  assert.deepEqual(
    tree.getChildren({ kind: 'account', account: ACCOUNT }).map((child) => child.kind),
    ['teamScope'],
  );
});

test('an officer administers unconditionally, and gets the section with no team at all', () => {
  const tree = build();
  tree.orgPolicy.set('a1', policy({ isOfficer: true }));

  assert.deepEqual(
    tree.getChildren({ kind: 'account', account: ACCOUNT }).map((child) => child.kind),
    ['serverScope'],
  );
});

test('the rows are drawn from the provider’s own caches', () => {
  const tree = build();
  tree.orgPolicy.set('a1', policy({ role: 'admin' }));
  tree.server.metrics.set('a1', {
    value: { version: '0.6.0', vaults: 41, vaultBytesOnDisk: 1_288_490_188 } as ServerMetrics,
    at: 1,
  });
  tree.server.backup.set('a1', {
    value: {
      configured: true, keyState: 'Ready', scheduleHourUtc: 3, retentionDays: 30,
      lastRunAt: 0, lastResult: 'never run', lastError: '', running: false,
      localArchiveBytes: 0, localArchiveName: '', configuredTargetKinds: ['s3'], targets: [],
    },
    at: 1,
  });
  tree.server.release = { version: '0.7.0', at: 1 };

  const [version, vaults, backup] = tree.getChildren({ kind: 'serverScope', account: ACCOUNT })
    .map((child) => tree.getTreeItem(child));

  assert.equal(version.description, '0.6.0 → 0.7.0 available');
  assert.equal(vaults.description, '41 · 1.2 GiB');
  assert.equal(backup.description, 's3 · never');
  assert.equal(tree.getTreeItem({ kind: 'serverScope', account: ACCOUNT }).description, '0.6.0');
});

test('a refused read degrades the scope row while the rows below keep the last answer', () => {
  const tree = build();
  tree.orgPolicy.set('a1', policy({ role: 'admin' }));
  tree.server.metrics.set('a1', {
    value: { version: '0.6.0', vaults: 41, vaultBytesOnDisk: 1024 } as ServerMetrics,
    failure: 'refused',
    at: 2,
  });

  const scope = tree.getTreeItem({ kind: 'serverScope', account: ACCOUNT });

  assert.equal(scope.description, 'refused (403)');
  assert.equal(scope.iconPath?.id, 'warning');
  assert.equal(
    tree.getTreeItem({ kind: 'serverVersion', account: ACCOUNT }).description,
    '0.6.0',
    'the last answer stays readable — a cleared row would be a worse answer than an old one',
  );
});

test('the whole section walks up, so a reveal can reach the backup row', () => {
  const tree = build();

  assert.deepEqual(
    tree.getParent({ kind: 'serverBackup', account: ACCOUNT }),
    { kind: 'serverScope', account: ACCOUNT },
  );
  assert.deepEqual(
    tree.getParent({ kind: 'serverScope', account: ACCOUNT }),
    { kind: 'account', account: ACCOUNT },
  );
});

test('the three rows are leaves and expand onto nothing', () => {
  const tree = build();

  for (const kind of ['serverVersion', 'serverVaults', 'serverBackup'] as const) {
    assert.deepEqual(tree.getChildren({ kind, account: ACCOUNT }), []);
    assert.equal(tree.getTreeItem({ kind, account: ACCOUNT }).collapsibleState, 0);
  }
});
