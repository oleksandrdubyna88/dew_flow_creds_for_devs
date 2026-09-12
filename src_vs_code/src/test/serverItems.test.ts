import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { BackupStatus, NO_BACKUP_HERE } from '../orgBackupClient';
import { ServerMetrics } from '../serverMetricsPage';
import { CorpPolicyState } from '../corpPolicy';
import { StoredAccount, TreeElement } from '../types';

/**
 * The Server section's four rows — what an administrator learns about the deployment without
 * opening a tab.
 *
 * <p>Pure, and tested through `loadWithVscode` the way `depTreeItems.test.ts` is: the module
 * imports `vscode` for `TreeItem`/`ThemeIcon`/`ThemeColor` and for nothing else, so every decision
 * below is a plain function of its arguments.</p>
 *
 * <p>The distinctions that are invisible until somebody uses the tree, and are therefore the point
 * of this file:</p>
 * <ul>
 *   <li>A section that could not be READ must not look like a healthy one. The scope row degrades
 *       with a warning icon and a reason, exactly as `teamScopeItem` does.</li>
 *   <li>A failed read KEEPS the last value, so version and footprint stay readable while the scope
 *       row says the answer is old. A cache of bare values could not express both.</li>
 *   <li>`Version: "unknown"` is a locally built server. Compared numerically it parses as `[0]` and
 *       every dev server would be announced as out of date.</li>
 *   <li>Backup has FIVE states, not two: a deployment with destinations saved and no key is not the
 *       same as one with neither, and neither is a server too old to have the feature.</li>
 * </ul>
 */

type Items = typeof import('../serverItems');

interface Item {
  label: string;
  collapsibleState: number;
  id?: string;
  contextValue?: string;
  iconPath?: { id: string; color?: { id: string } };
  description?: string;
  tooltip?: string;
  command?: { command: string; title: string; arguments?: unknown[] };
}

function world(): Items {
  return loadWithVscode<Items>('../serverItems', {
    TreeItem: class {
      id?: string;
      contextValue?: string;
      iconPath?: unknown;
      description?: string;
      tooltip?: unknown;
      command?: unknown;
      constructor(
        readonly label: string,
        readonly collapsibleState: number,
      ) {}
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
    ThemeIcon: class {
      constructor(
        readonly id: string,
        readonly color?: { id: string },
      ) {}
    },
  });
}

const ACCOUNT: StoredAccount = { accountId: 'a1', email: 'one@example.com', provider: 'microsoft' };

const METRICS = { version: '0.6.0', vaults: 41, vaultBytesOnDisk: 1_288_490_188 } as ServerMetrics;

/** A fixed formatter, so the assertion is about the row and not about the runner's locale. */
const AT = (at: number): string => `stamped(${at})`;

function status(over: Partial<BackupStatus> = {}): BackupStatus {
  return {
    configured: true,
    keyState: 'Ready',
    scheduleHourUtc: 3,
    retentionDays: 30,
    lastRunAt: 1_757_000_000_000,
    lastResult: 'ok',
    lastError: '',
    running: false,
    localArchiveBytes: 10,
    localArchiveName: 'vault-2026-09-11.tar.gz.enc',
    configuredTargetKinds: ['s3', 'azure-blob'],
    targets: [],
    ...over,
  };
}

const policy = (over: Partial<CorpPolicyState>): CorpPolicyState =>
  ({ role: 'member', isOfficer: false, ...over }) as CorpPolicyState;

// --- the scope row ---------------------------------------------------------------------------

test('a healthy scope row names the deployed version and carries the section colour', () => {
  const { serverScopeItem } = world();

  const item = serverScopeItem({ account: ACCOUNT, collapsibleState: 1, version: '0.6.0' }) as Item;

  assert.equal(item.label, 'Server');
  assert.equal(item.id, 'serverScope:a1');
  assert.equal(item.contextValue, 'serverScope');
  assert.equal(item.description, '0.6.0');
  assert.equal(item.iconPath?.id, 'server');
  assert.equal(
    item.iconPath?.color?.id,
    'credSshManager.serverIcon',
    'its own colour: a section that borrowed the people colour would read as people',
  );
});

test('a section that could not be read says WHY, rather than looking like a healthy empty one', () => {
  // The lesson `teamItems.ts` records: an empty team and a refused one used to look identical, and
  // only one of them is somebody's fault — the one nobody could see.
  const { serverScopeItem } = world();

  const unreachable = serverScopeItem({ account: ACCOUNT, collapsibleState: 1, version: '0.6.0', failure: 'unreachable' }) as Item;
  assert.equal(unreachable.description, 'unreachable');
  assert.equal(unreachable.iconPath?.id, 'warning');
  assert.equal(unreachable.iconPath?.color?.id, 'problemsWarningIcon.foreground');
  assert.match(String(unreachable.tooltip), /could not be reached/i);

  const refused = serverScopeItem({ account: ACCOUNT, collapsibleState: 1, version: '', failure: 'refused' }) as Item;
  assert.equal(refused.description, 'refused (403)');
  assert.match(
    String(refused.tooltip),
    /older than the change that opened metrics to administrators/,
    'the tooltip names the cause, because a 403 here is a SPLIT RELEASE far more often than a mistake',
  );
  assert.match(String(refused.tooltip), /recovery roster/, 'and the other cause, which is the surprising one');

  const older = serverScopeItem({ account: ACCOUNT, collapsibleState: 1, version: '', failure: 'older' }) as Item;
  assert.equal(older.description, 'older than this section');
});

// --- the version row -------------------------------------------------------------------------

test('a newer published release turns the row into a hint, and only a hint', () => {
  const { serverVersionItem } = world();

  const item = serverVersionItem({ account: ACCOUNT, deployed: '0.6.0', latest: '0.7.0' }) as Item;

  assert.equal(item.label, 'Version');
  assert.equal(item.description, '0.6.0 → 0.7.0 available');
  assert.equal(item.iconPath?.id, 'arrow-circle-up');
  assert.equal(item.command, undefined, 'the upgrade is a workflow_dispatch on a host this extension cannot reach');
  assert.equal(item.contextValue, undefined, 'and nothing may be hung off it later by accident');
});

test('up to date, unknown, and older-published all draw no icon at all', () => {
  const { serverVersionItem } = world();

  const same = serverVersionItem({ account: ACCOUNT, deployed: '0.6.0', latest: '0.6.0' }) as Item;
  assert.equal(same.description, '0.6.0');
  assert.equal(same.iconPath, undefined);

  const offline = serverVersionItem({ account: ACCOUNT, deployed: '0.6.0', latest: '' }) as Item;
  assert.equal(offline.description, '0.6.0');
  assert.equal(offline.iconPath, undefined, 'GitHub unreachable is not news about the server');

  const ahead = serverVersionItem({ account: ACCOUNT, deployed: '0.7.0', latest: '0.6.0' }) as Item;
  assert.equal(ahead.iconPath, undefined);
});

test('0.10.0 is newer than 0.9.0 here too, because the comparison is the one that knows', () => {
  const { serverVersionItem } = world();

  const item = serverVersionItem({ account: ACCOUNT, deployed: '0.9.0', latest: '0.10.0' }) as Item;

  assert.equal(item.description, '0.9.0 → 0.10.0 available');
});

test('a version that is not a version is rendered verbatim and never compared', () => {
  // `MetricsDto.Version` falls back to "unknown" when the assembly carries no informational
  // version — a locally built or docker-compose-from-source server. It parses through the numeric
  // comparison as [0], so a naive compare would announce that EVERY dev server is out of date.
  const { serverVersionItem } = world();

  const item = serverVersionItem({ account: ACCOUNT, deployed: 'unknown', latest: '0.7.0' }) as Item;

  assert.equal(item.description, 'unknown');
  assert.equal(item.iconPath, undefined);
});

test('a row with nothing cached yet says so rather than disappearing', () => {
  const { serverVersionItem, serverVaultsItem } = world();

  assert.equal((serverVersionItem({ account: ACCOUNT, deployed: '', latest: '' }) as Item).description, 'checking…');
  assert.equal((serverVaultsItem({ account: ACCOUNT, metrics: undefined }) as Item).description, 'checking…');
});

// --- the vaults row --------------------------------------------------------------------------

test('the footprint reuses the byte formatter the metrics page already has', () => {
  const { serverVaultsItem } = world();

  const item = serverVaultsItem({ account: ACCOUNT, metrics: METRICS }) as Item;

  assert.equal(item.label, 'Vaults');
  assert.equal(item.description, '41 · 1.2 GiB');
});

// --- the backup row --------------------------------------------------------------------------

test('nothing cached yet is "checking…", not "not configured"', () => {
  // They are opposite statements about somebody's deployment, and only one of them is a problem.
  const { serverBackupItem } = world();

  const item = serverBackupItem({ account: ACCOUNT, status: undefined, at: AT }) as Item;

  assert.equal(item.label, 'Backup');
  assert.equal(item.contextValue, 'serverBackup');
  assert.equal(item.description, 'checking…');
  assert.equal(item.iconPath?.id, 'question');
});

test('a server too old for the feature is told apart from one that is simply not set up', () => {
  const { serverBackupItem } = world();

  const old = serverBackupItem({ account: ACCOUNT, status: NO_BACKUP_HERE, at: AT }) as Item;
  assert.equal(old.description, 'not available on this server');
  assert.equal(old.iconPath?.id, 'circle-slash');

  const unset = serverBackupItem({
    account: ACCOUNT,
    status: status({ configured: false, configuredTargetKinds: [] }),
    at: AT,
  }) as Item;
  assert.equal(unset.description, 'not configured');
  assert.equal(unset.iconPath?.id, 'warning');
});

test('destinations saved with no key are a THIRD state, and the row must not hide it', () => {
  // `configured` is about the KEK — can this server seal an archive at all — not about
  // destinations. A deployment can have S3 saved and no key, and nothing would ever run.
  const { serverBackupItem } = world();

  const item = serverBackupItem({
    account: ACCOUNT,
    status: status({ configured: false, configuredTargetKinds: ['s3'] }),
    at: AT,
  }) as Item;

  assert.equal(item.description, 'not configured · s3');
  assert.equal(item.iconPath?.id, 'warning');
});

test('a configured deployment names its kinds and when it last ran', () => {
  const { serverBackupItem } = world();

  const item = serverBackupItem({ account: ACCOUNT, status: status(), at: AT }) as Item;

  assert.equal(item.description, 's3, azure-blob · stamped(1757000000000)');
  assert.equal(item.iconPath?.id, 'check');
});

test('never run says "never", and local-only says what it is', () => {
  const { serverBackupItem } = world();

  const never = serverBackupItem({
    account: ACCOUNT,
    status: status({ lastRunAt: 0, lastResult: 'never run', configuredTargetKinds: [] }),
    at: AT,
  }) as Item;

  assert.equal(never.description, 'local archive only · never');
});

test('a run that failed or only half-ran is not drawn green', () => {
  const { serverBackupItem } = world();

  for (const lastResult of ['failed', 'partial']) {
    const item = serverBackupItem({ account: ACCOUNT, status: status({ lastResult }), at: AT }) as Item;
    assert.equal(item.iconPath?.id, 'warning', `${lastResult} is not a success`);
  }
});

test('a server that predates configuredTargetKinds falls back to the kinds of the last RUN', () => {
  // Forward compatibility in the other direction: the field is optional on this side, and
  // `isBackupStatus` does not require it — a new extension must not reject an older server's
  // perfectly good status document.
  const { serverBackupItem } = world();
  const legacy = status({ configuredTargetKinds: undefined });
  const withRuns = {
    ...legacy,
    targets: [
      { kind: 's3', where: 'a', result: 'ok', error: '', retention: '', at: 1 },
      { kind: 's3', where: 'b', result: 'ok', error: '', retention: '', at: 1 },
    ],
  } as BackupStatus;

  const item = serverBackupItem({ account: ACCOUNT, status: withRuns, at: AT }) as Item;

  assert.equal(item.description, 's3 · stamped(1757000000000)', 'distinct: two buckets are one kind');
});

test('the row answers a left click with the tab its context menu offers', () => {
  // A person who selects the row or presses Enter should land on the backup tab, not on nothing —
  // and it is the EXISTING command, so nothing new was registered.
  const { serverBackupItem } = world();

  const item = serverBackupItem({ account: ACCOUNT, status: status(), at: AT }) as Item;

  assert.equal(item.command?.command, 'credSshManager.orgBackup');
  assert.deepEqual(item.command?.arguments, [{ kind: 'serverBackup', account: ACCOUNT }]);
});

// --- which sections an account has ------------------------------------------------------------

test('the Server section is above Team, and only an administrator has one', () => {
  const { corpSections } = world();

  const admin = corpSections(ACCOUNT, { policy: policy({ role: 'admin' }), teamCount: 4 });
  assert.deepEqual(
    admin.map((section: TreeElement) => section.kind),
    ['serverScope', 'teamScope'],
    'a single row above a list is a header; below it, it reads as the list’s last member',
  );

  const officer = corpSections(ACCOUNT, { policy: policy({ isOfficer: true }), teamCount: 0 });
  assert.deepEqual(officer.map((section: TreeElement) => section.kind), ['serverScope']);
});

test('a developer’s row is byte-identical to what it was before this section existed', () => {
  const { corpSections } = world();

  assert.deepEqual(
    corpSections(ACCOUNT, { policy: policy({ role: 'dev' }), teamCount: 4 }).map((s: TreeElement) => s.kind),
    ['teamScope'],
  );
  assert.deepEqual(corpSections(ACCOUNT, { policy: undefined, teamCount: 0 }), []);
});
