import assert from 'node:assert/strict';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { BridgeSessions, windowOwnership, type Ownership } from '../bridgeSessions';
import type { BridgeConnection } from '../bridgeSession';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';

/**
 * Change 11.1, the 72-hour slice, S2: the bridges of a window. One window owns a bridge (a second is refused, it does not take over);
 * Close lets the ownership go; Lock ends every connection and the unlock brings them back.
 */

const scope = cleanupScope();
after(() => scope.close());

function connections() {
  const made: { stopped: boolean; end: () => void }[] = [];
  const connect = async (): Promise<BridgeConnection> => {
    let end: () => void = () => undefined;
    const exited = new Promise<void>((resolve) => {
      end = resolve;
    });
    const record = { stopped: false, end };
    made.push(record);
    return {
      remotePath: `/tmp/s-${made.length}.sock`,
      exited,
      stop: () => {
        record.stopped = true;
        end();
      },
      publish: () => Promise.resolve({ ok: true }),
    };
  };
  return { made, connect };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('S2: a second window is refused the bridge another window owns, and gets it once the first lets go (the real WindowLock on disk)', async () => {
  const owners = path.join(ownedDir(scope, 'owners'), 'bridge-owners');
  const first = new BridgeSessions({ takeOwnership: windowOwnership(owners), unlocked: () => true, onState: () => undefined });
  const second = new BridgeSessions({ takeOwnership: windowOwnership(owners), unlocked: () => true, onState: () => undefined });
  const a = connections();
  const b = connections();
  assert.deepEqual(await first.open('acct:srv', a.connect), { remotePath: '/tmp/s-1.sock' });
  assert.equal(await second.open('acct:srv', b.connect), 'owned-elsewhere', 'the second window does not take it over');
  assert.equal(b.made.length, 0, 'and connects nothing');
  assert.equal(await first.close('acct:srv'), true);
  assert.equal(a.made[0].stopped, true);
  assert.deepEqual(await second.open('acct:srv', b.connect), { remotePath: '/tmp/s-1.sock' }, 'after the Close the second window may own it');
  await second.close('acct:srv');
});

test('S2: Lock ends every bridge of the window; the unlock connects each again; Close forgets it', async () => {
  let unlocked = true;
  const released: string[] = [];
  const ownership = (key: string): Promise<Ownership> => Promise.resolve({ owns: () => true, release: () => (released.push(key), Promise.resolve()) });
  const sessions = new BridgeSessions({ takeOwnership: ownership, unlocked: () => unlocked, onState: () => undefined });
  const c = connections();
  await sessions.open('a:1', c.connect);
  await sessions.open('a:2', c.connect);
  unlocked = false;
  sessions.lockAll();
  assert.deepEqual(c.made.map((m) => m.stopped), [true, true], 'Lock ended both');
  assert.equal(sessions.has('a:1'), true, 'a locked bridge is still this window\'s: the unlock brings it back');
  unlocked = true;
  sessions.unlockAll();
  await settle();
  assert.equal(c.made.length, 4, 'each connected again');
  assert.equal(sessions.remotePathFor('a:1'), '/tmp/s-3.sock');
  await sessions.close('a:1');
  assert.equal(sessions.has('a:1'), false);
  assert.deepEqual(released, ['a:1'], 'Close let the ownership go');
  sessions.dispose();
  await settle();
  assert.deepEqual(released, ['a:1', 'a:2'], 'the window going lets every ownership go');
});

test('S2: a first open that fails leaves no bridge and lets the ownership go', async () => {
  const released: string[] = [];
  const sessions = new BridgeSessions({
    takeOwnership: (key) => Promise.resolve({ owns: () => true, release: () => (released.push(key), Promise.resolve()) }),
    unlocked: () => true,
    onState: () => undefined,
  });
  assert.equal(await sessions.open('a:1', () => Promise.resolve(undefined)), undefined);
  await settle();
  assert.equal(sessions.has('a:1'), false);
  assert.deepEqual(released, ['a:1']);
});
