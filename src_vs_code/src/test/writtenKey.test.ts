import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExecAuth } from '../sshExecAuth';
import type { CallAuth, PinWriter } from '../writtenKey';
import { loadWithVscode } from './vscodeStub';

/**
 * The guards of the two files of one call (N16, G1), alone: `withWrittenKey` for a road that ends, `withWrittenKeyUntilExit` for a
 * road that hands the files to a process. U1 to U8 are N16's, about the key file, with the pin writer of an unpinned entry. U9 to
 * U17 are about the pin: when the writer is called, the ONE value that `run` and `start` get, and the delete of the pin file.
 * The roads themselves are `personRoadsForgetKey.test.ts`, `bridgeKeyHandoff.test.ts` and `personRoadsPin.test.ts`.
 */

type Guards = typeof import('../writtenKey');

const KEY_FILE = '/storage/keys/1/call-unit.key';
const WRITTEN: ExecAuth = { ok: true, keyPath: KEY_FILE, env: {}, auth: 'key', materialized: KEY_FILE };
const OWN_FILE: ExecAuth = { ok: true, keyPath: '/home/me/.ssh/id_ed25519', env: {}, auth: 'key' };
const PASSWORD: ExecAuth = { ok: true, env: {}, auth: 'askpass' };
const REFUSED: ExecAuth = { ok: false, reason: 'no_credential', message: 'nothing stored' };

const PIN_FILE = '/storage/keys/1/known_hosts-e1-unit';
/** The pin writer of an unpinned entry: nothing is written. */
const NO_PIN: PinWriter = () => ({ ok: true });
/** The pin writer of a pinned entry: the path of the file it wrote. */
const PINNED: PinWriter = () => ({ ok: true, knownHostsFile: PIN_FILE });
/** The pin writer of an entry whose saved host key cannot be used. */
const BAD_PIN: PinWriter = () => ({ ok: false, message: 'the saved host key cannot be used' });

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

  const result = mod.withWrittenKey(WRITTEN, NO_PIN, () => run.promise);
  await turn();
  assert.deepEqual(forgotten, [], 'the key file was deleted while the run was going');

  run.resolve('done');
  assert.equal(await result, 'done');
  assert.deepEqual(forgotten, [KEY_FILE]);
});

test('U2: withWrittenKey deletes the key file after a rejection and after a synchronous throw, and hands on the same error', async () => {
  const { mod, forgotten } = guards();
  const failure = new Error('the run failed');

  await assert.rejects(mod.withWrittenKey(WRITTEN, NO_PIN, () => Promise.reject(failure)), (error) => error === failure);
  await assert.rejects(mod.withWrittenKey(WRITTEN, NO_PIN, () => { throw failure; }), (error) => error === failure);

  assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
});

test('U3: withWrittenKey deletes nothing for a key file of the person or for a refusal', async () => {
  const { mod, forgotten } = guards();

  await mod.withWrittenKey(OWN_FILE, NO_PIN, () => Promise.resolve());
  await mod.withWrittenKey(REFUSED, NO_PIN, () => Promise.resolve());
  await assert.rejects(mod.withWrittenKey(OWN_FILE, NO_PIN, () => Promise.reject(new Error('the run failed'))));

  assert.deepEqual(forgotten, []);
});

test('U3b: withWrittenKey deletes nothing for a password credential, which writes no key file', async () => {
  const { mod, forgotten } = guards();

  await mod.withWrittenKey(PASSWORD, NO_PIN, () => Promise.resolve());
  await assert.rejects(mod.withWrittenKey(PASSWORD, NO_PIN, () => Promise.reject(new Error('the run failed'))));

  assert.deepEqual(forgotten, []);
});

test('U4: withWrittenKeyUntilExit deletes nothing while the process runs, and once when it has ended', async () => {
  const { mod, forgotten } = guards();
  const exited = held<number | null>();
  const started = { process: { exited: exited.promise } };

  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => started), started, 'the started thing was not handed back');
  await turn();
  assert.deepEqual(forgotten, [], 'the key file was deleted while its process runs');

  exited.resolve(null);
  await turn();
  assert.deepEqual(forgotten, [KEY_FILE]);
});

test('U5: withWrittenKeyUntilExit deletes at once when nothing was started, and when the start throws (the same error)', () => {
  const { mod, forgotten } = guards();
  const failure = new Error('spawn EACCES');

  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => undefined), undefined);
  assert.deepEqual(forgotten, [KEY_FILE]);

  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => { throw failure; }), (error) => error === failure);
  assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
});

test('U6: a continuation that cannot be attached deletes the key file once, at once, and the error goes on', () => {
  const { mod, forgotten } = guards();
  // What a broken spawner could hand back: a process with no `exited`. The attach throws; the finally is then the one delete.
  const broken = { process: { get exited(): Promise<unknown> { throw new TypeError('no exited'); } } };

  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => broken), TypeError);
  assert.deepEqual(forgotten, [KEY_FILE]);
});

test('U7: an exited that REJECTS deletes the key file too, and leaves no unhandled rejection', async () => {
  const { mod, forgotten } = guards();
  const exited = held<number | null>();
  const unhandled: unknown[] = [];
  const note = (reason: unknown): void => void unhandled.push(reason);
  process.on('unhandledRejection', note);
  try {
    mod.withWrittenKeyUntilExit(WRITTEN, NO_PIN, () => ({ process: { exited: exited.promise } }));
    exited.reject(new Error('the wait failed'));
    await turn();
    await turn();
  } finally {
    process.off('unhandledRejection', note);
  }

  assert.deepEqual(forgotten, [KEY_FILE]);
  assert.deepEqual(unhandled, []);
});

test('U8: withWrittenKeyUntilExit deletes nothing for a key file of the person, a password credential or a refusal, at the start and at the end', async () => {
  const { mod, forgotten } = guards();

  mod.withWrittenKeyUntilExit(OWN_FILE, NO_PIN, () => ({ process: { exited: Promise.resolve(0) } }));
  mod.withWrittenKeyUntilExit(OWN_FILE, NO_PIN, () => undefined);
  mod.withWrittenKeyUntilExit(REFUSED, NO_PIN, () => undefined);
  mod.withWrittenKeyUntilExit(PASSWORD, NO_PIN, () => ({ process: { exited: Promise.resolve(0) } }));
  await turn();

  assert.deepEqual(forgotten, []);
});

test('U9: withWrittenKey calls the pin writer once, with the login of the credential, before the run; the run gets the pin file; both files go after the run', async () => {
  const { mod, forgotten } = guards();
  const order: string[] = [];
  const run = held<string>();
  const writer: PinWriter = (auth) => (order.push(`pin:${auth}`), { ok: true, knownHostsFile: PIN_FILE });
  let got: CallAuth | undefined;

  const result = mod.withWrittenKey(WRITTEN, writer, (call) => (order.push('run'), (got = call), run.promise));
  await turn();
  assert.deepEqual(order, ['pin:key', 'run']);
  assert.deepEqual(got, { ...WRITTEN, knownHostsFile: PIN_FILE });
  assert.deepEqual(forgotten, [], 'a file of the call was deleted while the run was going');

  run.resolve('done');
  assert.equal(await result, 'done');
  assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE]);
});

test('U10: an unpinned call hands the run the credential as it is; a refused credential goes on as it is and the pin writer is not called', async () => {
  const { mod, forgotten } = guards();
  const got: CallAuth[] = [];
  let written = 0;
  const counting: PinWriter = () => ((written += 1), { ok: true, knownHostsFile: PIN_FILE });

  await mod.withWrittenKey(PASSWORD, NO_PIN, (call) => (got.push(call), Promise.resolve()));
  await mod.withWrittenKey(REFUSED, counting, (call) => (got.push(call), Promise.resolve()));
  mod.withWrittenKeyUntilExit(REFUSED, counting, (call) => (got.push(call), undefined));

  assert.equal(got[0], PASSWORD, 'the run of an unpinned call did not get the credential itself');
  assert.equal(got[1], REFUSED, 'the run did not get the refusal of the credential itself');
  assert.equal(got[2], REFUSED, 'the start did not get the refusal of the credential itself');
  assert.equal(written, 0, 'a pin was written for a credential that is not ok');
  assert.deepEqual(forgotten, []);
});

test('U11: a refused pin reaches the run as a refusal with the sentence of the pin and the warning of the credential; the run is still called', async () => {
  const { mod, forgotten } = guards();
  const warned: ExecAuth = { ...WRITTEN, warning: 'this key is old' };
  const got: CallAuth[] = [];

  await mod.withWrittenKey(warned, BAD_PIN, (call) => (got.push(call), Promise.resolve()));
  mod.withWrittenKeyUntilExit(warned, BAD_PIN, (call) => (got.push(call), undefined));

  const refusal = { ok: false, message: 'the saved host key cannot be used', warning: 'this key is old' };
  assert.deepEqual(got, [refusal, refusal]);
  assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE], 'the key file of a call with a refused pin was not deleted once per call');
});

test('U12: the pin file is deleted whether or not a key file was written: a password, a key file of the person', async () => {
  const { mod, forgotten } = guards();

  await mod.withWrittenKey(PASSWORD, PINNED, () => Promise.resolve());
  await mod.withWrittenKey(OWN_FILE, PINNED, () => Promise.resolve());
  await assert.rejects(mod.withWrittenKey(PASSWORD, PINNED, () => Promise.reject(new Error('the run failed'))));
  await assert.rejects(mod.withWrittenKey(OWN_FILE, PINNED, () => { throw new Error('the run failed'); }));

  assert.deepEqual(forgotten, [PIN_FILE, PIN_FILE, PIN_FILE, PIN_FILE]);
});

test('U13: a pin writer that throws (it must not) is inside the guarded span: the key file is deleted, the same error goes on, nothing is run', async () => {
  const { mod, forgotten } = guards();
  const failure = new Error('the writer threw');
  const throwing: PinWriter = () => { throw failure; };
  let ran = 0;

  await assert.rejects(mod.withWrittenKey(WRITTEN, throwing, () => ((ran += 1), Promise.resolve())), (error) => error === failure);
  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, throwing, () => ((ran += 1), undefined)), (error) => error === failure);

  assert.equal(ran, 0, 'the run or the start was called after the pin writer threw');
  assert.deepEqual(forgotten, [KEY_FILE, KEY_FILE]);
});

test('U14: withWrittenKeyUntilExit hands both files to the process: nothing is deleted while it runs, both once when it has ended', async () => {
  const { mod, forgotten } = guards();
  const exited = held<number | null>();
  const started = { process: { exited: exited.promise } };
  const order: string[] = [];
  const writer: PinWriter = (auth) => (order.push(`pin:${auth}`), { ok: true, knownHostsFile: PIN_FILE });
  let got: CallAuth | undefined;

  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, writer, (call) => (order.push('start'), (got = call), started)), started);
  await turn();
  assert.deepEqual(order, ['pin:key', 'start']);
  assert.deepEqual(got, { ...WRITTEN, knownHostsFile: PIN_FILE });
  assert.deepEqual(forgotten, [], 'a file of the call was deleted while its process runs');

  exited.resolve(null);
  await turn();
  assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE]);
});

test('U15: withWrittenKeyUntilExit deletes both files at once when nothing was started, when the start throws, and when the continuation cannot be attached', () => {
  const { mod, forgotten } = guards();
  const failure = new Error('spawn EACCES');
  const broken = { process: { get exited(): Promise<unknown> { throw new TypeError('no exited'); } } };

  assert.equal(mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => undefined), undefined);
  assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE]);

  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => { throw failure; }), (error) => error === failure);
  assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE, KEY_FILE, PIN_FILE]);

  assert.throws(() => mod.withWrittenKeyUntilExit(WRITTEN, PINNED, () => broken), TypeError);
  assert.deepEqual(forgotten, [KEY_FILE, PIN_FILE, KEY_FILE, PIN_FILE, KEY_FILE, PIN_FILE]);
});

test('U16: an exited that REJECTS deletes both files too, once, and leaves no unhandled rejection', async () => {
  const { mod, forgotten } = guards();
  const exited = held<number | null>();
  const unhandled: unknown[] = [];
  const note = (reason: unknown): void => void unhandled.push(reason);
  process.on('unhandledRejection', note);
  try {
    mod.withWrittenKeyUntilExit(PASSWORD, PINNED, () => ({ process: { exited: exited.promise } }));
    exited.reject(new Error('the wait failed'));
    await turn();
    await turn();
  } finally {
    process.off('unhandledRejection', note);
  }

  assert.deepEqual(forgotten, [PIN_FILE]);
  assert.deepEqual(unhandled, []);
});

test('U17: two calls keep their own pin files: the end of one process deletes the file of its call and not the other', async () => {
  const { mod, forgotten } = guards();
  const first = held<number | null>();
  const second = held<number | null>();
  const other = '/storage/keys/1/known_hosts-e1-other';

  mod.withWrittenKeyUntilExit(PASSWORD, PINNED, () => ({ process: { exited: first.promise } }));
  mod.withWrittenKeyUntilExit(PASSWORD, () => ({ ok: true, knownHostsFile: other }), () => ({ process: { exited: second.promise } }));

  second.resolve(0);
  await turn();
  assert.deepEqual(forgotten, [other]);

  first.resolve(0);
  await turn();
  assert.deepEqual(forgotten, [other, PIN_FILE]);
});
