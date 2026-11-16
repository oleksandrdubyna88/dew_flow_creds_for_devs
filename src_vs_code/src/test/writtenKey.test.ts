import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExecAuth } from '../sshExecAuth';
import { loadWithVscode } from './vscodeStub';

/**
 * The guards of a written key file (N16), alone: `withWrittenKey` for a road that ends, `withWrittenKeyUntilExit` for a road that
 * hands the file to a process. The roads themselves are `personRoadsForgetKey.test.ts` and `bridgeKeyHandoff.test.ts`.
 */

type Guards = typeof import('../writtenKey');

const KEY_FILE = '/storage/keys/1/call-unit.key';
const WRITTEN: ExecAuth = { ok: true, keyPath: KEY_FILE, env: {}, auth: 'key', materialized: KEY_FILE };
const OWN_FILE: ExecAuth = { ok: true, keyPath: '/home/me/.ssh/id_ed25519', env: {}, auth: 'key' };
const REFUSED: ExecAuth = { ok: false, reason: 'no_credential', message: 'nothing stored' };

function guards(): { mod: Guards; forgotten: string[] } {
  const forgotten: string[] = [];
  const mod = loadWithVscode<Guards>('../writtenKey', {}, { './keyInstaller': { forgetMaterializedKey: (keyPath: string): void => void forgotten.push(keyPath) } });
  return { mod, forgotten };
}

const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** A promise the test settles. */
function held<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: Error): void } {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('U1: withWrittenKey hands back the value and deletes the key file only after the run has ended', async () => {
  const { mod, forgotten } = guards();
  const run = held<string>();

  const result = mod.withWrittenKey(WRITTEN, () => run.promise);
  await turn();
  assert.deepEqual(forgotten, [], 'the key file was deleted while the run was going');

  run.resolve('done');
  assert.equal(await result, 'done');
  assert.deepEqual(forgotten, [KEY_FILE]);
});

test('U2: withWrittenKey deletes the key file after a rejection and after a synchronous throw, and hands on the same error', async () => {
  const { mod, forgotten } = guards();
  const failure = new Error('the run failed');

  await assert.rejects(mod.withWrittenKey(WRITTEN, () => Promise.reject(failure)), (error) => error === failure);
  await assert.rejects(mod.withWrittenKey(WRITTEN, () => { throw failure; }), (error) => error === failure);

  assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
});

test('U3: withWrittenKey deletes nothing for a key file of the person or for a refusal', async () => {
  const { mod, forgotten } = guards();

  await mod.withWrittenKey(OWN_FILE, () => Promise.resolve());
  await mod.withWrittenKey(REFUSED, () => Promise.resolve());
  await assert.rejects(mod.withWrittenKey(OWN_FILE, () => Promise.reject(new Error('the run failed'))));

  assert.deepEqual(forgotten, []);
});

test('U4: withWrittenKeyUntilExit deletes nothing while the process runs, and once when it has ended', async () => {
  const { mod, forgotten } = guards();
  const exited = held<number | null>();
  const started = { process: { exited: exited.promise } };

  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, () => started), started, 'the started thing was not handed back');
  await turn();
  assert.deepEqual(forgotten, [], 'the key file was deleted while its process runs');

  exited.resolve(null);
  await turn();
  assert.deepEqual(forgotten, [KEY_FILE]);
});

test('U5: withWrittenKeyUntilExit deletes at once when nothing was started, and when the start throws (the same error)', () => {
  const { mod, forgotten } = guards();
  const failure = new Error('spawn EACCES');

  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, () => undefined), undefined);
  assert.deepEqual(forgotten, [KEY_FILE]);

  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, () => { throw failure; }), (error) => error === failure);
  assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
});

test('U6: a continuation that cannot be attached deletes the key file once, at once, and the error goes on', () => {
  const { mod, forgotten } = guards();
  // What a broken spawner could hand back: a process with no `exited`. The attach throws; the finally is then the one delete.
  const broken = { process: { get exited(): Promise<unknown> { throw new TypeError('no exited'); } } };

  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, () => broken), TypeError);
  assert.deepEqual(forgotten, [KEY_FILE]);
});

test('U7: an exited that REJECTS deletes the key file too, and leaves no unhandled rejection', async () => {
  const { mod, forgotten } = guards();
  const exited = held<number | null>();
  const unhandled: unknown[] = [];
  const note = (reason: unknown): void => void unhandled.push(reason);
  process.on('unhandledRejection', note);
  try {
    mod.withWrittenKeyUntilExit(WRITTEN, () => ({ process: { exited: exited.promise } }));
    exited.reject(new Error('the wait failed'));
    await turn();
    await turn();
  } finally {
    process.off('unhandledRejection', note);
  }

  assert.deepEqual(forgotten, [KEY_FILE]);
  assert.deepEqual(unhandled, []);
});

test('U8: withWrittenKeyUntilExit deletes nothing for a key file of the person or for a refusal, at the start and at the end', async () => {
  const { mod, forgotten } = guards();

  mod.withWrittenKeyUntilExit(OWN_FILE, () => ({ process: { exited: Promise.resolve(0) } }));
  mod.withWrittenKeyUntilExit(OWN_FILE, () => undefined);
  mod.withWrittenKeyUntilExit(REFUSED, () => undefined);
  await turn();

  assert.deepEqual(forgotten, []);
});
