import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BridgeProcess, SshBridgeManager } from '../sshBridgeManager';

/**
 * The lifetime of a live bridge.
 *
 * <p>Every assertion here is really the same one: a forwarded socket is an opening into this
 * machine's broker, so a bridge that outlives the window authorizing it means a remote host can
 * still reach a broker nobody is watching. The rest is bookkeeping that keeps the map from
 * lying about what is actually open.</p>
 */

interface Fake extends BridgeProcess {
  killed: number;
  end(code: number | null): void;
}

function fakeProcess(): Fake {
  let settle: (code: number | null) => void = () => {};
  const exited = new Promise<number | null>((resolve) => {
    settle = resolve;
  });
  return {
    killed: 0,
    exited,
    kill(): void {
      this.killed += 1;
      settle(null);
    },
    end: (code) => settle(code),
  };
}

function manager(onEnded: (key: string, code: number | null) => void = () => {}): {
  m: SshBridgeManager;
  spawned: Fake[];
  argv: string[][];
} {
  const spawned: Fake[] = [];
  const argv: string[][] = [];
  const m = new SshBridgeManager((_cmd, args) => {
    argv.push([...args]);
    const p = fakeProcess();
    spawned.push(p);
    return p;
  }, onEnded);
  return { m, spawned, argv };
}

const start = (m: SshBridgeManager, key = 'a1:e1'): void => {
  m.start(key, `/tmp/creds-dev-${key}.sock`, 'ssh', ['-N', '-R', 'x'], {});
};

test('a started bridge is open and knows its remote path', () => {
  const { m } = manager();
  start(m);

  assert.equal(m.isOpen('a1:e1'), true);
  assert.match(m.remotePathFor('a1:e1') ?? '', /^\/tmp\/creds-dev-/);
});

test('stopping kills the child and forgets it', () => {
  const { m, spawned } = manager();
  start(m);

  assert.equal(m.stop('a1:e1'), true);
  assert.equal(spawned[0].killed, 1);
  assert.equal(m.isOpen('a1:e1'), false);
});

test('stopping something that is not open is not an error', () => {
  assert.equal(manager().m.stop('nothing'), false);
});

test('disposing takes every bridge with it — a socket must not outlive the window', () => {
  const { m, spawned } = manager();
  start(m, 'a1:e1');
  start(m, 'a1:e2');

  m.dispose();

  assert.deepEqual(m.keys(), []);
  assert.deepEqual(spawned.map((p) => p.killed), [1, 1]);
});

test('starting twice replaces rather than leaking the first handle', () => {
  // The usual reason to ask twice is that the first one died invisibly. Refusing would leave
  // a bridge that looks open and is not, which is worse than a moment of churn.
  const { m, spawned } = manager();
  start(m);
  start(m);

  assert.equal(spawned.length, 2);
  assert.equal(spawned[0].killed, 1, 'the first was killed, not abandoned');
  assert.equal(m.isOpen('a1:e1'), true);
});

test('a bridge that dies by itself is forgotten, and the caller is told', async () => {
  // A dropped network or a refused forward ends the child. If the map kept it, the UI would
  // offer to close a tunnel that is already gone and never offer to reopen it.
  const ended: [string, number | null][] = [];
  const { m, spawned } = manager((key, code) => ended.push([key, code]));
  start(m);

  spawned[0].end(255);
  await new Promise((r) => setImmediate(r));

  assert.equal(m.isOpen('a1:e1'), false);
  assert.deepEqual(ended, [['a1:e1', 255]]);
});

test('an old process ending does not close the bridge that replaced it', async () => {
  // The trap in "replace on restart": the first child's exit handler fires AFTER the second is
  // in the map, and a naive delete would close a live tunnel and leave the map claiming it is
  // shut.
  const ended: string[] = [];
  const { m, spawned } = manager((key) => ended.push(key));
  start(m);
  start(m); // replaces; kills the first, whose exited promise settles

  await new Promise((r) => setImmediate(r));

  assert.equal(m.isOpen('a1:e1'), true, 'the replacement is still open');
  assert.deepEqual(ended, [], 'and nothing was reported as ended');
  assert.equal(spawned[1].killed, 0);
});

test('two entities keep independent bridges', () => {
  const { m } = manager();
  start(m, 'a1:e1');
  start(m, 'a1:e2');

  m.stop('a1:e1');

  assert.equal(m.isOpen('a1:e1'), false);
  assert.equal(m.isOpen('a1:e2'), true);
});

test('the argv reaches the spawner untouched', () => {
  const { m, argv } = manager();
  m.start('k', '/tmp/s.sock', 'ssh', ['-N', '-R', '/tmp/s.sock:127.0.0.1:5', '--', 'dev@host'], {});

  assert.deepEqual(argv[0], ['-N', '-R', '/tmp/s.sock:127.0.0.1:5', '--', 'dev@host']);
});
