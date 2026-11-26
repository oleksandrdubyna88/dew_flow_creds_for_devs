import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { BridgeOptIns, OPT_INS_FILE } from '../bridgeOptIns';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import type { ScopedBridgeHost } from '../scopedBridgeOpen';
import { loadWithVscode } from './vscodeStub';

const { restoreScopedBridges } = loadWithVscode<typeof import('../scopedBridgeOpen')>('../scopedBridgeOpen', { window: {} });

/** Change 11.1, the 72-hour slice, S2 (D8): the bridges opened and not Closed, kept across a reboot, and their restore. */

const scope = cleanupScope();
after(() => scope.close());

test('D8: an opened bridge is kept once, owner-only; a Close takes it off; a file that does not parse is an empty list', () => {
  const dir = ownedDir(scope, 'optins');
  const optIns = new BridgeOptIns(dir);
  optIns.add({ accountId: 'a', serverId: 's1' });
  optIns.add({ accountId: 'a', serverId: 's1' });
  optIns.add({ accountId: 'a', serverId: 's2' });
  assert.deepEqual(optIns.list(), [{ accountId: 'a', serverId: 's1' }, { accountId: 'a', serverId: 's2' }]);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(path.join(dir, OPT_INS_FILE)).mode & 0o777, 0o600);
  }
  optIns.remove({ accountId: 'a', serverId: 's1' });
  assert.deepEqual(optIns.list(), [{ accountId: 'a', serverId: 's2' }]);
  fs.writeFileSync(path.join(dir, OPT_INS_FILE), '{not json');
  assert.deepEqual(optIns.list(), []);
});

test('D8: a write that fails is told and stops nothing', () => {
  const warned: string[] = [];
  const optIns = new BridgeOptIns(path.join(ownedDir(scope, 'optins-missing'), 'no', 'such', 'folder'), (message) => warned.push(message));
  optIns.add({ accountId: 'a', serverId: 's1' });
  assert.equal(warned.length, 1);
  assert.deepEqual(optIns.list(), []);
});

test('D8: the restore brings back each kept bridge in the background, leaves one this window keeps, and skips one whose entry is not readable yet', async () => {
  const restored: string[] = [];
  const logs: string[] = [];
  const nodes: Record<string, { id: string; name: string; details: unknown } | undefined> = {
    s1: { id: 's1', name: 'box one', details: { id: 's1', host: 'h', user: 'u' } },
    s2: { id: 's2', name: 'box two', details: { id: 's2', host: 'h', user: 'u' } },
    s3: undefined,
  };
  const host = {
    storage: { getNode: (_account: string, id: string) => nodes[id] },
    sessions: {
      has: (key: string) => key.endsWith('s2'),
      restore: (key: string) => (restored.push(key), Promise.resolve(true)),
    },
    log: (message: string) => logs.push(message),
  } as unknown as ScopedBridgeHost;
  await restoreScopedBridges(host, { list: () => ['s1', 's2', 's3'].map((serverId) => ({ accountId: 'a', serverId })) });
  assert.equal(restored.length, 1, 's2 is kept already; s3 is not readable yet');
  assert.match(restored[0], /s1/);
  assert.deepEqual(logs, ['restoring the bridge to "box one"']);
});
