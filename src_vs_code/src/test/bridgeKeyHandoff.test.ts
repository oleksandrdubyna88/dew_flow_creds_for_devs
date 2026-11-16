import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import * as realBridge from '../sshBridge';
import { KEY, Parts, World, click, ownKeyFile, settled, world, writtenKey } from './personRoadsWorld';

/**
 * N16, the bridge: the key file that *Open Remote Bridge…* wrote belongs to the command until the bridge's `ssh` holds it, and is
 * deleted when THAT `ssh` ends: not when the command returns, not when *Close* is pressed, and not when another bridge ends.
 */

const scope = cleanupScope();
after(() => scope.close());

const FIRST = '/storage/keys/1/call-first.key';
const SECOND = '/storage/keys/1/call-second.key';

async function opened(parts: Parts = {}): Promise<World> {
  const w = world({ clicks: [writtenKey(FIRST), writtenKey(SECOND)], ...parts });
  await click(w, 'openRemoteBridge');
  await settled();
  return w;
}

test('B1: an open bridge keeps its key file; the file is deleted once, when its ssh ends by itself', async () => {
  const w = await opened();

  assert.equal(w.children.length, 1, 'no bridge was started');
  assert.equal(w.bridges.isOpen(KEY), true);
  assert.deepEqual(w.forgotten, [], 'B1: the key file was deleted while the ssh that reads it runs');

  w.children[0].end(255);
  await settled();

  assert.deepEqual(w.ended, [KEY], 'the manager was not told the bridge ended');
  assert.deepEqual(w.forgotten, [FIRST], 'B1: the bridge ended and its key file stays');
});

test('B2: Close kills the ssh and deletes nothing; the key file is deleted when the ssh has ended', async () => {
  const w = await opened();

  await click(w, 'closeRemoteBridge');
  await settled();

  assert.equal(w.children[0].killed, 1, 'Close did not kill the ssh');
  assert.equal(w.bridges.isOpen(KEY), false);
  assert.deepEqual(w.forgotten, [], 'B2: Close deleted the key file of an ssh that has not ended');

  w.children[0].end(null);
  await settled();

  assert.deepEqual(w.ended, [], 'B2 stands on this: the manager reports no end for a bridge that was closed');
  assert.deepEqual(w.forgotten, [FIRST], 'B2: the closed bridge ended and its key file stays');
});

test('B3: a second Open of an open bridge asks Keep or Close and starts nothing; Keep deletes nothing, Close there works as Close', async () => {
  let pick = 'Keep it open';
  const w = await opened({ answer: (message) => (/is bridged at/.test(message) ? pick : undefined) });
  const asked = (): number => w.asked.filter((one) => /is bridged at/.test(one.message)).length;

  await click(w, 'openRemoteBridge');
  await settled();

  assert.equal(asked(), 1, 'the second Open did not ask');
  assert.equal(w.children.length, 1, 'the second Open started a bridge');
  assert.equal(w.children[0].killed, 0, 'Keep closed the bridge');
  assert.deepEqual(w.forgotten, [], 'B3: Keep deleted the key file of a live bridge');

  pick = 'Close the bridge';
  await click(w, 'openRemoteBridge');
  await settled();

  assert.equal(w.children.length, 1, 'the third Open started a bridge');
  assert.equal(w.children[0].killed, 1, 'Close did not kill the ssh');
  assert.deepEqual(w.forgotten, [], 'B3: Close deleted the key file of an ssh that has not ended');

  w.children[0].end(null);
  await settled();

  assert.deepEqual(w.forgotten, [FIRST], 'B3: the closed bridge ended and its key file stays');
});

test('B4: a bridge that REPLACES another: the first key file goes when the first ssh ends, the second stays with its bridge', async () => {
  // Two Opens of one entry that overlap: both pass the open check before either has started, so the second start replaces the first.
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const w = world({ clicks: [writtenKey(FIRST), writtenKey(SECOND)], resolveGate: gate });
  const both = [click(w, 'openRemoteBridge'), click(w, 'openRemoteBridge')];
  await settled();
  assert.equal(w.children.length, 0, 'a bridge started before its credential was resolved');

  release();
  await Promise.all(both);
  await settled();

  assert.equal(w.children.length, 2, 'the two Opens did not start two bridges');
  assert.equal(w.children[0].killed, 1, 'the second start did not replace the first');
  assert.deepEqual(w.forgotten, [], 'B4: a key file was deleted while its ssh has not ended');

  w.children[0].end(null);
  await settled();

  assert.deepEqual(w.ended, [], 'B4 stands on this: the manager reports no end for a bridge that was replaced');
  assert.deepEqual(w.forgotten, [FIRST], 'B4: the replaced bridge ended and its key file stays, or the live bridge lost its file');
  assert.equal(w.bridges.isOpen(KEY), true, 'the replacement is not open');

  w.bridges.dispose();
  w.children[1].end(null);
  await settled();

  assert.deepEqual(w.forgotten, [FIRST, SECOND], 'B4: the window ended and the second key file stays');
});

test('B5: a host that gives no argv starts nothing, and the key file is deleted at once', async () => {
  const w = await opened({ host: '-oProxyCommand=evil' });

  assert.equal(w.children.length, 0);
  assert.match(w.warnings.at(-1) ?? '', /cannot be bridged/);
  assert.deepEqual(w.forgotten, [FIRST], 'B5: no bridge was started and the key file stays');
});

test('B6: a throw while the argv is built deletes the key file, and the same error reaches the caller', async () => {
  const failure = new Error('the argv could not be built');
  const throwing = { ...realBridge, buildBridgeArgv: (): never => { throw failure; } };
  const w = world({ clicks: [writtenKey(FIRST)], mocks: { '../sshBridge': throwing } });

  await assert.rejects(click(w, 'openRemoteBridge'), (error) => error === failure);
  assert.equal(w.children.length, 0);
  assert.deepEqual(w.forgotten, [FIRST], 'B6: the command failed and the key file stays');
});

test('B7: a start that throws deletes the key file, and the same error reaches the caller', async () => {
  const failure = new Error('spawn EACCES');
  const w = world({ clicks: [writtenKey(FIRST)], spawn: () => { throw failure; } });

  await assert.rejects(click(w, 'openRemoteBridge'), (error) => error === failure);
  assert.equal(w.bridges.isOpen(KEY), false);
  assert.deepEqual(w.forgotten, [FIRST], 'B7: the start failed and the key file stays');
});

test('B8: a bridge whose key is the person\'s own file deletes nothing, at its start and at its end', async () => {
  const w = await opened({ clicks: [ownKeyFile('/home/me/.ssh/id_ed25519')] });

  w.children[0].end(0);
  await settled();

  assert.deepEqual(w.ended, [KEY]);
  assert.deepEqual(w.forgotten, [], 'B8: a file that was not written for the call was deleted');
});

test('B9: a REAL key file of a bridge is on the disk while its ssh runs and gone when it has ended', async () => {
  const keyFile = path.join(ownedDir(scope, 'keys'), 'call-bridge.key');
  fs.writeFileSync(keyFile, 'not a key', { mode: 0o600 });
  const w = await opened({ clicks: [writtenKey(keyFile)], realForget: true });

  await click(w, 'closeRemoteBridge');
  await settled();
  assert.equal(fs.existsSync(keyFile), true, 'B9: the key file left the disk before its ssh ended');

  w.children[0].end(null);
  await settled();

  assert.equal(fs.existsSync(keyFile), false, 'B9: the key file of the ended bridge is still on the disk');
});
