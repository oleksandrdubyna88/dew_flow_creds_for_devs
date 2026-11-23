import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { BridgeChild, ChildSpawn, bridgeProcessOf, bridgeSpawner } from '../bridgeSpawner';
import { describeBridgeError } from '../bridgeSpawner';
import { BridgeProcess, BridgeSpawner, SshBridgeManager } from '../sshBridgeManager';

/**
 * The real spawner of a bridge (N16): `exited` always settles, and every `'error'` of the child is reported. A bridge's key file is
 * deleted when `exited` settles, and the row of a bridge leaves the tree when it does, so a start that fails must settle it too.
 */

const scope = cleanupScope();
after(() => scope.close());

type Report = (error: Error) => void;

/**
 * The two functions under test, typed as they are AFTER the fix. On the moved text (step 1) neither knows a reporter; a function
 * that takes less is still one of these, so this file compiles there too and its tests fail by their assertions.
 */
const processOf: (child: BridgeChild, report: Report) => BridgeProcess = bridgeProcessOf;
const spawnerOf: (parts: { report: Report; spawn?: ChildSpawn }) => BridgeSpawner = bridgeSpawner;

/** A child the test drives: an `EventEmitter` with a `pid` (absent when it never started). */
class FakeChild extends EventEmitter implements BridgeChild {
  kills = 0;
  constructor(readonly pid?: number) {
    super();
  }
  kill(): boolean {
    this.kills += 1;
    return true;
  }
}

/** A child with a listener of the TEST on `'error'`, so that an emit never throws: for the tests that ask what was reported. */
function heardChild(pid?: number): FakeChild {
  const child = new FakeChild(pid);
  child.on('error', () => undefined);
  return child;
}

const quiet: Report = () => undefined;
const PENDING = 'pending';

/** What `exited` settled with, or `pending` when it has not settled after every ready callback ran. */
async function stateOf(exited: Promise<number | null>): Promise<number | null | typeof PENDING> {
  const turns = async (): Promise<typeof PENDING> => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    return PENDING;
  };
  return Promise.race([exited, turns()]);
}

const enoent = (): Error => Object.assign(new Error('spawn ssh ENOENT'), { code: 'ENOENT' });

test('P1: a child that never started settles exited with null on its error event', async () => {
  const child = new FakeChild();
  const bridge = processOf(child, quiet);

  assert.doesNotThrow(() => child.emit('error', enoent()), 'P1: the error event of a child that never started has no listener');
  assert.equal(await stateOf(bridge.exited), null, 'P1: exited did not settle after a failed start');
});

test('P2: a child that exits settles exited with its code', async () => {
  const child = new FakeChild(4321);
  const bridge = processOf(child, quiet);

  child.emit('exit', 255, null);

  assert.equal(await stateOf(bridge.exited), 255);
});

test('P3: a child that emits both settles once, with the first', async () => {
  const failedFirst = new FakeChild();
  const a = processOf(failedFirst, quiet);
  assert.doesNotThrow(() => failedFirst.emit('error', enoent()), 'P3: the error event has no listener');
  failedFirst.emit('exit', 7, null);
  assert.equal(await stateOf(a.exited), null, 'P3: the later exit replaced the first settlement');

  const exitedFirst = new FakeChild();
  const b = processOf(exitedFirst, quiet);
  exitedFirst.emit('exit', 7, null);
  assert.doesNotThrow(() => exitedFirst.emit('error', enoent()), 'P3: an error after the exit has no listener');
  assert.equal(await stateOf(b.exited), 7);
});

test('P4: the error of a STARTED child settles nothing, and its later exit settles exited with its code', async () => {
  const child = new FakeChild(4321);
  const bridge = processOf(child, quiet);

  assert.doesNotThrow(() => child.emit('error', new Error('kill EPERM')), 'P4: the error event of a started child has no listener');
  assert.doesNotThrow(() => child.emit('error', new Error('kill EPERM')), 'P4: a second error event has no listener');
  assert.equal(await stateOf(bridge.exited), PENDING, 'P4: the error of a started child settled exited, and its ssh may still run');

  child.emit('exit', 0, null);
  assert.equal(await stateOf(bridge.exited), 0);
});

test('P5: the spawner starts the child as before: the argv copied, the given environment, hidden, no stdio', () => {
  const calls: { command: string; args: string[]; options: unknown }[] = [];
  const child = new FakeChild(1);
  const env = { PATH: '/usr/bin', SSH_ASKPASS: '/storage/askpass.sh' };
  const argv = ['-N', '-R', '/tmp/s.sock:127.0.0.1:5', '--', 'dev@host'];
  const spawn = spawnerOf({ report: quiet, spawn: (command, args, options) => (calls.push({ command, args, options }), child) });

  const bridge = spawn('ssh', argv, env);
  bridge.kill();

  assert.deepEqual(calls, [{ command: 'ssh', args: argv, options: { env, windowsHide: true, stdio: 'ignore' } }]);
  assert.notEqual(calls[0].args, argv, 'the argv was handed over, not copied');
  assert.equal(child.kills, 1);
});

test('P6: a REAL program that does not exist ends its bridge: exited settles with null, the row goes, and the cause is reported', { timeout: 20_000 }, async () => {
  const missing = path.join(ownedDir(scope, 'nossh'), 'no-such-ssh');
  const ended: [string, number | null][] = [];
  const reported: Error[] = [];
  const manager = new SshBridgeManager(spawnerOf({ report: (error) => void reported.push(error) }), (key, code) => void ended.push([key, code]));

  const bridge = manager.start('a1:e1', '/tmp/s.sock', missing, ['-N', '-i', '/storage/keys/1/call-real.key'], { ...process.env });

  assert.ok(bridge !== undefined, 'P6: the manager of a live window started nothing');
  assert.equal(await bridge.process.exited, null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.isOpen('a1:e1'), false, 'P6: the row of a bridge whose ssh never started is still open');
  assert.deepEqual(ended, [['a1:e1', null]]);
  assert.equal(reported.length, 1, 'P6: the cause of the failed start was not reported once');
  assert.match(reported[0].message, /ENOENT/);
  assert.doesNotMatch(reported[0].message, /call-real\.key/, 'P6: the text of a real spawn error names the key file');
});

test('P7: a REAL program that runs and ends settles exited with its code, and reports nothing', { timeout: 20_000 }, async () => {
  const reported: Error[] = [];
  const bridge = spawnerOf({ report: (error) => void reported.push(error) })(process.execPath, ['-e', 'process.exit(3)'], { ...process.env });

  assert.equal(await bridge.exited, 3);
  assert.deepEqual(reported, []);
});

test('P8: the window starts its bridges with this spawner and sends their errors to the log, and extension.ts spawns nothing by itself', () => {
  // The tests above prove the spawner; this one proves that the window USES it. Read from the source, as the other wiring scans do.
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');
  const managers = source.match(/new SshBridgeManager\(/g) ?? [];

  assert.equal(managers.length, 1, 'the scan no longer finds the one place where the bridges are made');
  assert.match(
    source,
    /new SshBridgeManager\(\s*bridgeSpawner\(\{ report: \(error\) => log\.warn\('bridge', describeBridgeError\(error\)\) \}\),/,
    'P8: the bridges of the window are not started by bridgeSpawner with a reporter that writes describeBridgeError(error) to the bridge log',
  );
  assert.doesNotMatch(source, /node:child_process/, 'P8: extension.ts starts a process by itself again');
});

test('P9: the error of a child that never started is reported, the same object, and exited settles with null', async () => {
  const reported: Error[] = [];
  const child = heardChild();
  const bridge = processOf(child, (error) => void reported.push(error));
  const failure = enoent();

  child.emit('error', failure);

  assert.deepEqual(reported, [failure], 'P9: the error of a child that never started was not reported');
  assert.equal(reported[0], failure);
  assert.equal(await stateOf(bridge.exited), null, 'P9: exited did not settle after a failed start');
});

test('P10: every error of a STARTED child is reported, and none of them settles exited', async () => {
  const reported: Error[] = [];
  const child = heardChild(4321);
  const bridge = processOf(child, (error) => void reported.push(error));
  const first = new Error('kill EPERM');
  const second = new Error('kill ESRCH');

  child.emit('error', first);
  child.emit('error', second);

  assert.deepEqual(reported, [first, second], 'P10: an error of a started child was not reported');
  assert.equal(await stateOf(bridge.exited), PENDING, 'P10: the error of a started child settled exited, and its ssh may still run');
});

test('P11: a reporter that throws does not keep exited from settling', async () => {
  const child = heardChild();
  const bridge = processOf(child, () => {
    throw new Error('the log is closed');
  });

  try {
    child.emit('error', enoent());
  } catch {
    // The reporter's own failure comes out of the emit; what this test asks is below.
  }

  assert.equal(await stateOf(bridge.exited), null, 'P11: exited did not settle after a failed start whose reporter throws');
});

test('P12: the log line of a bridge error is the text of the error behind one sentence, and never the argv', () => {
  // As Node makes the error of a spawn that failed: the argv rides on the object, and the argv of a bridge names its key file.
  const failure = Object.assign(new Error('spawn ssh ENOENT'), { code: 'ENOENT', path: 'ssh', spawnargs: ['-N', '-i', '/storage/keys/1/call-real.key', 'dev@host'] });

  const line = describeBridgeError(failure);

  assert.equal(line, 'the ssh of a bridge did not start, or could not be stopped: spawn ssh ENOENT');
  assert.doesNotMatch(line, /call-real\.key/);
});
