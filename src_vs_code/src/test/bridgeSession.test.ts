import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BridgeSession, type BridgeConnection, type SessionDeps } from '../bridgeSession';

/**
 * Change 11.1, the 72-hour slice, S2: the bridge's session. A drop reconnects with backoff and a fresh connection; Lock and Close win
 * over a reconnect that is held just before it publishes (no note, no access); a locked vault waits for the unlock; another window's
 * ownership ends it.
 */

interface FakeConnection extends BridgeConnection {
  readonly n: number;
  stopped: boolean;
  published: boolean;
  drop(): void;
}

/** A world of fake connections, a manual clock and switches for the vault and the ownership. */
function rig(options: { publishOk?: (n: number) => boolean; failConnect?: (n: number) => boolean } = {}) {
  const connections: FakeConnection[] = [];
  let attempts = 0;
  const timers: { run: () => void; ms: number; cleared: boolean }[] = [];
  const states: string[] = [];
  const flags = { unlocked: true, owns: true };
  let hold: { reached: () => void; release: () => void; promise: Promise<void> } | undefined;
  const deps: SessionDeps = {
    connect: async () => {
      attempts += 1;
      const n = connections.length + 1;
      if (options.failConnect?.(attempts) === true) {
        return undefined;
      }
      let end: () => void = () => undefined;
      const exited = new Promise<void>((resolve) => {
        end = resolve;
      });
      const connection: FakeConnection = {
        n, stopped: false, published: false, remotePath: `/tmp/creds-dev-${n}.sock`, exited,
        stop() {
          this.stopped = true;
          end();
        },
        async publish() {
          this.published = options.publishOk?.(n) ?? true;
          return this.published ? { ok: true } : { ok: false, reason: 'ssh ended with 255' };
        },
        drop: () => end(),
      };
      connections.push(connection);
      return connection;
    },
    unlocked: () => flags.unlocked,
    owns: () => flags.owns,
    beforePublish: () => (hold === undefined ? Promise.resolve() : (hold.reached(), hold.promise)),
    delays: [10, 20, 50],
    setTimer: (run, ms) => {
      const timer = { run, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      (timer as { cleared: boolean }).cleared = true;
    },
    onState: (state) => states.push(state),
  };
  /** The next attempt stops just before it publishes; `reached` resolves once it is there. */
  const holdNext = () => {
    let release: () => void = () => undefined;
    let reached: () => void = () => undefined;
    const at = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    hold = { reached, release, promise };
    return { at, release: () => { hold = undefined; release(); } };
  };
  const fire = async () => {
    const timer = timers.find((t) => !t.cleared && t.run !== undefined);
    assert.ok(timer !== undefined, 'a retry is scheduled');
    timer.cleared = true;
    timer.run();
    await settle();
  };
  return { deps, connections, timers, states, flags, holdNext, fire };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('S2: the first open publishes; a drop reconnects after the first delay with a NEW connection and a new note', async () => {
  const r = rig();
  const session = new BridgeSession(r.deps);
  assert.deepEqual(await session.begin(), { remotePath: '/tmp/creds-dev-1.sock' });
  assert.equal(r.connections[0].published, true);
  assert.equal(session.state, 'open');

  r.connections[0].drop();
  await settle();
  assert.equal(session.state, 'waiting');
  assert.equal(r.timers.at(-1)?.ms, 10, 'the first delay');
  assert.equal(r.connections[0].stopped, true, 'the dropped connection\'s listener is closed');
  await r.fire();
  assert.equal(r.connections.length, 2, 'a second connection');
  assert.equal(r.connections[1].published, true, 'its note is published');
  assert.equal(session.state, 'open');
  assert.equal(session.remotePath, '/tmp/creds-dev-2.sock', 'a fresh socket path');
});

test('S2: Lock while a reconnect is held just before it publishes: no note, the connection ended, and it waits for the unlock', async () => {
  const r = rig();
  const session = new BridgeSession(r.deps);
  await session.begin();
  r.connections[0].drop();
  await settle();
  const held = r.holdNext();
  const firing = r.fire();
  await held.at;
  r.flags.unlocked = false;
  session.lock();
  held.release();
  await firing;
  await settle();
  assert.equal(r.connections[1].published, false, 'no note');
  assert.equal(r.connections[1].stopped, true, 'no access: its listener is closed');
  assert.equal(session.state, 'locked');
  assert.equal(r.timers.filter((t) => !t.cleared).length, 0, 'nothing is retried while locked');

  r.flags.unlocked = true;
  session.unlock();
  await settle();
  assert.equal(r.connections.length, 3);
  assert.equal(r.connections[2].published, true, 'after the unlock it connects again');
  assert.equal(session.state, 'open');
});

test('S2: Close while a reconnect is held just before it publishes: no note, no access, and nothing ever again', async () => {
  const r = rig();
  const session = new BridgeSession(r.deps);
  await session.begin();
  r.connections[0].drop();
  await settle();
  const held = r.holdNext();
  const firing = r.fire();
  await held.at;
  session.close();
  held.release();
  await firing;
  await settle();
  assert.equal(r.connections[1].published, false, 'no note');
  assert.equal(r.connections[1].stopped, true, 'no access');
  assert.equal(session.state, 'closed');
  assert.equal(r.timers.filter((t) => !t.cleared).length, 0, 'nothing scheduled');
  session.unlock();
  await settle();
  assert.equal(r.connections.length, 2, 'an unlock does not reopen a closed bridge');
});

test('S2: Lock on an open bridge ends it at once; a drop that follows schedules nothing', async () => {
  const r = rig();
  const session = new BridgeSession(r.deps);
  await session.begin();
  session.lock();
  await settle();
  assert.equal(r.connections[0].stopped, true);
  assert.equal(session.state, 'locked');
  assert.equal(r.timers.length, 0);
});

test('S2: a retry that finds the vault locked waits for the unlock instead of connecting', async () => {
  const r = rig();
  const session = new BridgeSession(r.deps);
  await session.begin();
  r.connections[0].drop();
  await settle();
  r.flags.unlocked = false;
  await r.fire();
  assert.equal(r.connections.length, 1, 'no connect while locked');
  assert.equal(session.state, 'locked');
  r.flags.unlocked = true;
  session.unlock();
  await settle();
  assert.equal(r.connections.length, 2);
  assert.equal(session.state, 'open');
});

test('S2: failed attempts back off 10, 20, 50, 50 ms; a success starts the count again', async () => {
  const r = rig({ failConnect: (n) => n >= 2 && n <= 4 });
  const session = new BridgeSession(r.deps);
  await session.begin();
  r.connections[0].drop();
  await settle();
  // connect calls 2, 3, 4 fail (no connection is pushed for them), the 5th succeeds
  for (let i = 0; i < 4; i += 1) {
    await r.fire();
  }
  assert.deepEqual(r.timers.map((t) => t.ms), [10, 20, 50, 50]);
  assert.equal(session.state, 'open');
  r.connections.at(-1)?.drop();
  await settle();
  assert.equal(r.timers.at(-1)?.ms, 10, 'back to the first delay after a success');
});

test('S2: a note that cannot be written ends that connection and retries', async () => {
  const r = rig({ publishOk: (n) => n !== 2 });
  const session = new BridgeSession(r.deps);
  await session.begin();
  r.connections[0].drop();
  await settle();
  await r.fire();
  assert.equal(r.connections[1].stopped, true, 'the connection whose note failed is ended');
  assert.equal(session.state, 'waiting');
  await r.fire();
  assert.equal(r.connections[2].published, true);
  assert.equal(session.state, 'open');
});

test('S2: a first open that fails ends the session; nothing is retried in the background', async () => {
  const r = rig({ failConnect: () => true });
  const session = new BridgeSession(r.deps);
  assert.equal(await session.begin(), undefined);
  assert.equal(session.state, 'closed');
  assert.equal(r.timers.length, 0);
});

test('S2: another window owns the bridge now: the retry closes the session instead of connecting', async () => {
  const r = rig();
  const session = new BridgeSession(r.deps);
  await session.begin();
  r.connections[0].drop();
  await settle();
  r.flags.owns = false;
  await r.fire();
  assert.equal(r.connections.length, 1);
  assert.equal(session.state, 'closed');
});

test('S2 (D8): a restored session connects in the background; a failed attempt is retried, not given up', async () => {
  const r = rig({ failConnect: (attempt) => attempt === 1 });
  const session = new BridgeSession(r.deps);
  session.resume();
  await settle();
  assert.equal(session.state, 'waiting', 'the first attempt failed: it waits, it does not close');
  assert.equal(r.timers.at(-1)?.ms, 10);
  await r.fire();
  assert.equal(session.state, 'open');
  assert.equal(r.connections[0].published, true);
});

test('S2 (D8): an unlock hurries a session that waits for its next retry', async () => {
  const r = rig({ failConnect: (attempt) => attempt === 1 });
  const session = new BridgeSession(r.deps);
  session.resume();
  await settle();
  assert.equal(session.state, 'waiting');
  session.unlock();
  await settle();
  assert.equal(r.timers[0].cleared, true, 'the pending retry is cancelled');
  assert.equal(session.state, 'open', 'and the unlock tried at once');
});
