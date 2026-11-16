import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test, TestContext } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { Parts, TIMED_OUT, World, click, ownKeyFile, ran, settled, world, writtenKey } from './personRoadsWorld';

/**
 * N16, the two bounded roads: the bridge socket check and *Install creds on host* delete the key file that `resolveExecAuth` wrote
 * for them, on every way out, and only a file that was written for them.
 */

const scope = cleanupScope();
after(() => scope.close());

const CHECK = '/storage/keys/1/call-check.key';
const INSTALL = '/storage/keys/1/call-install.key';
const PROBE_OK = 'creds=-\narch=x86_64\nos=Linux\nget=/usr/bin/curl\n';
const INSTALLED = 'creds-install: installed /home/dev/.local/bin/creds\n';

/** Open a bridge and let its socket check run to its end: the check waits 1.5 s on a timer between its two runs. */
async function checked(t: TestContext, parts: Parts): Promise<World> {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = world({ clicks: [ownKeyFile('/home/me/.ssh/id_ed25519')], ...parts });
  await click(w, 'openRemoteBridge');
  await settled();
  t.mock.timers.tick(1500);
  await settled();
  return w;
}

const yes = (_message: string, rest: readonly unknown[]): string | undefined => rest.find((one): one is string => typeof one === 'string');

test('C1: the socket check deletes its key file after a normal check, and not before its second run', async (t) => {
  const w = await checked(t, { checks: [writtenKey(CHECK)] });

  assert.equal(w.runs.length, 2, `the check did not run twice (the sweep, the mode check): ${w.runs.length}`);
  assert.deepEqual(w.runs.map((run) => run.forgottenBefore), [0, 0], 'C1: the key file was deleted before a run that reads it');
  assert.deepEqual(w.forgotten, [CHECK], 'C1: the socket check left its key file');
});

test('C2: the socket check deletes its key file when the socket is missing', async (t) => {
  const w = await checked(t, { checks: [writtenKey(CHECK)], run: () => ran('missing') });

  assert.equal(w.errors.length, 1, 'the missing socket was not reported');
  assert.deepEqual(w.forgotten, [CHECK], 'C2: the socket check left its key file');
});

test('C3: the socket check deletes its key file when the mode cannot be read', async (t) => {
  const w = await checked(t, { checks: [writtenKey(CHECK)], run: () => ran('') });

  assert.deepEqual(w.forgotten, [CHECK], 'C3: the socket check left its key file');
});

test('C4: the socket check deletes its key file when the host gives no argv', async (t) => {
  const w = await checked(t, { checks: [writtenKey(CHECK)], noExecArgv: true });

  assert.equal(w.runs.length, 0, 'a run started with no argv');
  assert.deepEqual(w.forgotten, [CHECK], 'C4: the socket check left its key file');
});

test('C5: the socket check deletes its key file when its run throws', async (t) => {
  const boom = (index: number): never => {
    throw new Error(`spawn ssh ENOENT (run ${index})`);
  };
  const w = await checked(t, { checks: [writtenKey(CHECK)], run: boom });

  assert.ok(w.logs.some((line) => line.includes('socket check did not complete')), `the throw was not logged: ${w.logs.join(' | ')}`);
  assert.deepEqual(w.forgotten, [CHECK], 'C5: the socket check left its key file');
});

test('C6: the socket check deletes nothing when no key file was written for it', async (t) => {
  const w = await checked(t, { checks: [ownKeyFile('/home/me/.ssh/id_ed25519')] });

  assert.equal(w.runs.length, 2, 'the check did not run');
  assert.deepEqual(w.forgotten, [], 'C6: a file that was not written for the call was deleted');
});

async function installed(parts: Parts): Promise<World> {
  const w = world({ clicks: [writtenKey(INSTALL)], ...parts });
  await click(w, 'installRemoteCli');
  return w;
}

test('I1: the install deletes its key file after a success, and the install run still had it', async () => {
  const w = await installed({ answer: yes, run: (index) => ran(index === 0 ? PROBE_OK : INSTALLED) });

  assert.equal(w.runs.length, 2, 'the probe and the install did not both run');
  assert.ok(w.runs[1].argv.includes(INSTALL), 'the install run was not given the key file of the call');
  assert.deepEqual(w.runs.map((run) => run.forgottenBefore), [0, 0], 'I1: the key file was deleted before a run that reads it');
  assert.deepEqual(w.asked.map((one) => one.forgottenBefore), [0], 'I1: the key file was deleted while the question was open');
  assert.match(w.infos.at(-1) ?? '', /is installed on "box"/);
  assert.deepEqual(w.forgotten, [INSTALL], 'I1: the install left its key file');
});

test('I2: the install deletes its key file after a failed install', async () => {
  const w = await installed({ answer: yes, run: (index) => (index === 0 ? ran(PROBE_OK) : ran('', 22, 'curl: (22) The requested URL returned error: 404')) });

  assert.match(w.errors.at(-1) ?? '', /Could not install on "box"/);
  assert.deepEqual(w.forgotten, [INSTALL], 'I2: the install left its key file');
});

test('I3: the install deletes its key file when the probe times out', async () => {
  const w = await installed({ run: () => TIMED_OUT });

  assert.equal(w.runs.length, 1);
  assert.match(w.warnings.at(-1) ?? '', /did not answer within 20 seconds/);
  assert.deepEqual(w.forgotten, [INSTALL], 'I3: the install left its key file');
});

test('I4: the install deletes its key file when the host cannot be installed to', async () => {
  const w = await installed({ run: () => ran('creds=-\narch=x86_64\nos=Darwin\nget=/usr/bin/curl\n') });

  assert.match(w.warnings.at(-1) ?? '', /Cannot install on "box"/);
  assert.deepEqual(w.forgotten, [INSTALL], 'I4: the install left its key file');
});

test('I5: the install deletes its key file when the person says no', async () => {
  const w = await installed({ run: () => ran(PROBE_OK) });

  assert.equal(w.asked.length, 1, 'the question was not asked');
  assert.equal(w.runs.length, 1, 'something ran after a no');
  assert.deepEqual(w.forgotten, [INSTALL], 'I5: the install left its key file');
});

test('I6: the install deletes its key file when the question itself fails, and the same error reaches the caller', async () => {
  const failure = new Error('the window is closing');
  const w = world({ clicks: [writtenKey(INSTALL)], run: () => ran(PROBE_OK), answer: () => { throw failure; } });

  await assert.rejects(click(w, 'installRemoteCli'), (error) => error === failure);
  assert.deepEqual(w.forgotten, [INSTALL], 'I6: the install left its key file');
});

test('I7: the install deletes nothing when no key file was written for it', async () => {
  const w = await installed({ clicks: [ownKeyFile('/home/me/.ssh/id_ed25519')], answer: yes, run: (index) => ran(index === 0 ? PROBE_OK : INSTALLED) });

  assert.equal(w.runs.length, 2);
  assert.deepEqual(w.forgotten, [], 'I7: a file that was not written for the call was deleted');
});

test('R1: a real key file of the socket check is gone from the disk when the check ends', async (t) => {
  const keyFile = path.join(ownedDir(scope, 'keys'), 'call-check.key');
  fs.writeFileSync(keyFile, 'not a key', { mode: 0o600 });
  const present: boolean[] = [];
  const w = await checked(t, { checks: [writtenKey(keyFile)], realForget: true, run: () => (present.push(fs.existsSync(keyFile)), ran('600')) });

  assert.deepEqual(present, [true, true], 'the file was not there for a run that reads it');
  assert.equal(w.runs.length, 2);
  assert.equal(fs.existsSync(keyFile), false, 'R1: the key file of the socket check is still on the disk');
});
