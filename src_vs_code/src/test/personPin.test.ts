import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { formatHostKey, knownHostsLine, parseHostKey } from '../hostKeyPin';
import { materializedKeysDir } from '../materializedKeys';
import type { PinClient, PinClientAsk, PinClientCall } from '../pinClient';
import type { EntityMetadata } from '../types';
import type { PinOfCall } from '../writtenKey';
import { loadWithVscode } from './vscodeStub';

/**
 * The pin of one call on the three roads of the person (G1, `personPin.ts`), alone: its three answers, the two forms of sentence A
 * word for word, sentence B, and that it never throws. `materializeKnownHosts` is the REAL one, in a real folder that this file
 * owns, except in P7. The guards that call it are `writtenKey.test.ts`; the roads are `personRoadsPin.test.ts`.
 */

type PersonPin = typeof import('../personPin');

const scope = cleanupScope();
after(() => scope.close());

const HOST_KEY = { algorithm: 'ssh-ed25519', base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY' };
const PIN = formatHostKey(HOST_KEY);
const CALL_PIN = /^known_hosts-e1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const KEY_FORM =
  'The saved host key of "box" cannot be used, so nothing was sent to that host. Get the host\'s key fingerprint from the person who runs the server. Then use Connect SSH on this entry, and go on only if it shows that fingerprint: Trust and connect saves the key.';
const PASSWORD_FORM =
  'The saved host key of "box" cannot be used, so nothing was sent to that host. Do not use Connect SSH to save it again: this entry signs in with a password, and when Connect SSH cannot read the host\'s key first, it sends the password without checking the host. There is no safe repair for such an entry yet; the bridge and the install stay refused for it.';

function entity(over: Partial<EntityMetadata> = {}): EntityMetadata {
  return { id: 'e1', name: 'box', isSshEnabled: true, host: 'box.example', user: 'dev', ...over };
}

/** `personPin.ts` over the real `hostKeyTrust.ts`, or over the stand-ins the test names. */
const pinModule = (mocks: Record<string, unknown> = {}): PersonPin => loadWithVscode<PersonPin>('../personPin', {}, mocks);

const ENV: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: '/home/someone' };
const KNOWS: PinClient = { kind: 'knows', token: 'OpenSSH_10.2' };

/** An asker that records each question and answers what the test says. */
function asker(answer: PinClient = KNOWS): { ask: PinClientAsk; asked: PinClientCall[] } {
  const asked: PinClientCall[] = [];
  return { ask: (call) => (asked.push(call), Promise.resolve(answer)), asked };
}

/** One call of the writer, with a client that knows the option unless the test names another asker. */
const write = (mod: PersonPin, dir: string, snapshot: EntityMetadata, auth: 'key' | 'askpass', ask: PinClientAsk = asker().ask): Promise<PinOfCall> =>
  mod.writePersonPin({ storageDir: dir, entity: snapshot, ask }, auth, ENV);

/** The path of the pin file that an answer holds. */
const fileOf = (answer: PinOfCall): string | undefined => (answer.ok ? answer.knownHostsFile?.file : undefined);

/** The stand-in of `knownHostsPath` beside a stand-in of the write: a path that the rule takes. */
const PLANNED = (dir: string, id: string, suffix?: string): string => `${dir}/keys/1/known_hosts-${id}-${String(suffix)}`;

/** What is in this window's key folder of `dir`; none when the folder was never made. */
function written(dir: string): string[] {
  const keys = materializedKeysDir(dir);
  return fs.existsSync(keys) ? fs.readdirSync(keys).sort() : [];
}

test('P1: no saved host key, an empty one and one of white space are unpinned: the answer holds no file and nothing is written', async () => {
  const dir = ownedDir(scope, 'p1');
  const mod = pinModule();

  for (const hostKey of [undefined, '', '   ', ' \n\t ']) {
    assert.deepEqual(await write(mod, dir, entity({ hostKey }), 'key'), { ok: true });
    assert.deepEqual(await write(mod, dir, entity({ hostKey }), 'askpass'), { ok: true });
  }
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P1: an unpinned entry wrote into the key folder');
});

test('P2: a saved host key that can be used is written to a file of this call: known_hosts-<id>-<uuid> in the key folder, the line of the entry', async () => {
  const dir = ownedDir(scope, 'p2');
  assert.deepEqual(parseHostKey(PIN), HOST_KEY, 'the fixture is not a pin that the real parser reads');

  const answer = await write(pinModule(), dir, entity({ hostKey: PIN, port: 2222 }), 'askpass');

  assert.equal(answer.ok, true);
  const file = fileOf(answer);
  assert.ok(file !== undefined, 'P2: a pinned entry got no pin file');
  assert.equal(path.dirname(file), materializedKeysDir(dir));
  assert.match(path.basename(file), CALL_PIN);
  assert.equal(fs.readFileSync(file, 'utf8'), knownHostsLine('box.example', 2222, HOST_KEY));
  assert.deepEqual(written(dir), [path.basename(file)]);
});

test('P2b: on POSIX the pin file is the owner\'s alone, in a folder that is the owner\'s alone', { skip: process.platform === 'win32' }, async () => {
  const dir = ownedDir(scope, 'p2b');

  const answer = await write(pinModule(), dir, entity({ hostKey: PIN }), 'key');

  const file = fileOf(answer);
  assert.ok(file !== undefined);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
});

test('P3: two calls of one entry write two distinct files, and neither writes or replaces known_hosts-<id>', async () => {
  const dir = ownedDir(scope, 'p3');
  const older = path.join(materializedKeysDir(dir), 'known_hosts-e1');
  fs.mkdirSync(path.dirname(older), { recursive: true, mode: 0o700 });
  fs.writeFileSync(older, 'the pin of another road\n');
  const mod = pinModule();

  const first = await write(mod, dir, entity({ hostKey: PIN }), 'key');
  const second = await write(mod, dir, entity({ hostKey: PIN }), 'key');

  const files = [first, second].map((answer) => (fileOf(answer)));
  assert.ok(files[0] !== undefined && files[1] !== undefined);
  assert.notEqual(files[0], files[1], 'P3: two calls share one pin file');
  assert.deepEqual(written(dir), ['known_hosts-e1', path.basename(files[0]), path.basename(files[1])].sort());
  assert.equal(fs.readFileSync(older, 'utf8'), 'the pin of another road\n');
});

test('P4: a saved host key that does not parse is refused with sentence A, the key form for a key login, word for word; nothing is written', async () => {
  const dir = ownedDir(scope, 'p4');
  const mod = pinModule();

  for (const hostKey of ['not a host key', 'ssh-ed25519', 'ssh-ed25519 short', 'ssh-dss AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY']) {
    assert.equal(parseHostKey(hostKey), undefined, `the fixture ${hostKey} is a pin that the real parser reads`);
    assert.deepEqual(await write(mod, dir, entity({ hostKey }), 'key'), { ok: false, message: KEY_FORM });
  }
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P4: a refused pin wrote into the key folder');
});

test('P5: the same pin on a password login is refused with the password form, word for word, which never sends the person to Connect SSH to save it', async () => {
  const dir = ownedDir(scope, 'p5');

  const answer = await write(pinModule(), dir, entity({ hostKey: 'not a host key' }), 'askpass');

  assert.deepEqual(answer, { ok: false, message: PASSWORD_FORM });
  assert.equal(PASSWORD_FORM.includes('Trust and connect'), false);
  assert.equal(PASSWORD_FORM.includes('go on only if'), false);
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P5: a refused pin wrote into the key folder');
});

test('P6: a pin that parses on a host that cannot form a known_hosts line, or on no host, is refused with sentence A too; nothing is written', async () => {
  const dir = ownedDir(scope, 'p6');
  const mod = pinModule();

  assert.equal(knownHostsLine('-oProxyCommand=evil', undefined, HOST_KEY), undefined, 'the fixture host forms a line');
  assert.deepEqual(await write(mod, dir, entity({ hostKey: PIN, host: '-oProxyCommand=evil' }), 'key'), { ok: false, message: KEY_FORM });
  assert.deepEqual(await write(mod, dir, entity({ hostKey: PIN, host: undefined }), 'askpass'), { ok: false, message: PASSWORD_FORM });
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P6: a refused pin wrote into the key folder');
});

test('P7: a write that throws is refused with sentence B and the text of the error, for an Error and for a thrown string; it does not throw', async () => {
  const throwing = (thrown: unknown): PersonPin => pinModule({ './hostKeyTrust': { knownHostsPath: PLANNED, materializeKnownHosts: (): never => { throw thrown; } } });

  assert.deepEqual(await write(throwing(new Error('ENOSPC: no space left on device')), '/storage', entity({ hostKey: PIN }), 'key'), {
    ok: false,
    message: 'Could not write the saved host key of "box" to disk: ENOSPC: no space left on device',
  });
  assert.deepEqual(await write(throwing('the disk is gone'), '/storage', entity({ hostKey: PIN }), 'askpass'), {
    ok: false,
    message: 'Could not write the saved host key of "box" to disk: the disk is gone',
  });
});

test('P8: a REAL folder that cannot be written is refused with sentence B, and the real error is in it', async () => {
  const dir = ownedDir(scope, 'p8');
  fs.writeFileSync(path.join(dir, 'keys'), 'a file where the key folder would be');

  const answer = await write(pinModule(), dir, entity({ hostKey: PIN }), 'key');

  assert.equal(answer.ok, false);
  assert.match(answer.ok ? '' : answer.message, /^Could not write the saved host key of "box" to disk: \S/);
});

test('P9: the writer hands materializeKnownHosts the storage folder, the snapshot as it is, and a new uuid per call', async () => {
  const calls: unknown[][] = [];
  const recording = { './hostKeyTrust': { knownHostsPath: PLANNED, materializeKnownHosts: (...args: unknown[]): string => (calls.push(args), `/storage/pin-${calls.length}`) } };
  const mod = pinModule(recording);
  const snapshot = entity({ hostKey: PIN });

  assert.equal(fileOf(await write(mod, '/storage', snapshot, 'key')), '/storage/pin-1');
  assert.equal(fileOf(await write(mod, '/storage', snapshot, 'key')), '/storage/pin-2');

  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], '/storage');
  assert.equal(calls[0][1], snapshot);
  assert.match(String(calls[0][2]), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(calls[0][2], calls[1][2], 'P9: two calls got one suffix');
});

/* --- E2.S2: the two refusals that stand before the write (the plan's §3.10, §3.11), and the checked value --- */

const SENTENCE_E = 'The saved host key of "box" cannot be handed to ssh, so nothing was sent to that host. The folder where this editor keeps the files of CredsForDevs has a path with a percent sign, and ssh does not read a file under such a path as the one file it is. This is about this computer, not about the host or the saved key. To go on, move the storage (user data) folder of the editor to a path without it, or point the editor at another user-data folder.';
const SENTENCE_F = 'CredsForDevs could not read the version of the ssh program on this computer (exit code 255), so it did not start a connection that has to check the saved host key of "box". Nothing was sent to that host. The reason is the ssh program here, not the host. Check which ssh program is first on your PATH and that it prints its version when run with -V.';

test('P10: a path that ssh would not read as one file is refused with sentence E before the client is asked and before anything is written', async () => {
  const dir = path.join(ownedDir(scope, 'p10'), '100%');
  const { ask, asked } = asker();

  const answer = await write(pinModule(), dir, entity({ hostKey: PIN }), 'key', ask);

  assert.deepEqual(answer, { ok: false, message: SENTENCE_E });
  assert.deepEqual(asked, []);
  assert.equal(fs.existsSync(dir), false, 'P10: a refused path wrote into the storage folder');
});

test('P11: a client that cannot be read is refused with sentence F and nothing is written; it was asked once, of the bare word ssh, in no folder, with the call\'s environment', async () => {
  const dir = ownedDir(scope, 'p11');
  const { ask, asked } = asker({ kind: 'unreadable', exitCode: 255 });

  const answer = await write(pinModule(), dir, entity({ hostKey: PIN }), 'askpass', ask);

  assert.deepEqual(answer, { ok: false, message: SENTENCE_F });
  assert.deepEqual(asked, [{ program: 'ssh', env: ENV }]);
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P11: a refused client wrote into the key folder');
});

test('P12: the client is asked BEFORE the pin file is written, and an entry with no saved host key is not asked at all', async () => {
  const dir = ownedDir(scope, 'p12');
  const seen: string[][] = [];
  const ask: PinClientAsk = () => (seen.push(written(dir)), Promise.resolve(KNOWS));
  const mod = pinModule();

  const answer = await write(mod, dir, entity({ hostKey: PIN }), 'key', ask);
  await write(mod, dir, entity({ hostKey: '  ' }), 'key', ask);
  await write(mod, dir, entity(), 'key', ask);

  assert.deepEqual(seen, [[]], 'asked once, with nothing on the disk');
  assert.equal(written(dir).length, 1);
  assert.equal(answer.ok, true);
});

test('P13: the answer holds the CHECKED pin: the path as it was written, its word (in double quotes for a folder with a space and an apostrophe), and the client\'s answer', async () => {
  const dir = path.join(ownedDir(scope, 'p13'), "it's here");
  fs.mkdirSync(dir);
  const mod = pinModule();

  const knows = await write(mod, dir, entity({ hostKey: PIN }), 'key');
  const older = await write(mod, dir, entity({ hostKey: PIN }), 'key', asker({ kind: 'older', token: 'OpenSSH_8.4' }).ask);

  assert.ok(knows.ok && knows.knownHostsFile !== undefined && older.ok && older.knownHostsFile !== undefined);
  assert.equal(path.dirname(knows.knownHostsFile.file), materializedKeysDir(dir));
  assert.equal(knows.knownHostsFile.word, `"${knows.knownHostsFile.file}"`);
  assert.equal(knows.knownHostsFile.knowsKnownHostsCommand, true);
  assert.equal(older.knownHostsFile.knowsKnownHostsCommand, false);
  assert.equal(fs.readFileSync(knows.knownHostsFile.file, 'utf8'), knownHostsLine('box.example', undefined, HOST_KEY));
});

test('P14: the value is made from the path that was WRITTEN: a write that answers another path than the planned one, of a refused kind, is deleted and refused with sentence E', async () => {
  const forgotten: string[] = [];
  const mod = pinModule({
    './hostKeyTrust': { knownHostsPath: PLANNED, materializeKnownHosts: (): string => '/storage/100%/pin-1' },
    './keyInstaller': { forgetMaterializedKey: (file: string): void => void forgotten.push(file) },
  });

  assert.deepEqual(await write(mod, '/storage', entity({ hostKey: PIN }), 'key'), { ok: false, message: SENTENCE_E });
  assert.deepEqual(forgotten, ['/storage/100%/pin-1']);
});

test('P15: a saved host key that cannot be used is told with sentence A after the client answered; with a client that cannot be read the person reads sentence F first', async () => {
  const dir = ownedDir(scope, 'p15');
  const read = asker();
  const unread = asker({ kind: 'unreadable', exitCode: 255 });
  const mod = pinModule();

  assert.deepEqual(await write(mod, dir, entity({ hostKey: 'not a host key' }), 'key', read.ask), { ok: false, message: KEY_FORM });
  assert.deepEqual(await write(mod, dir, entity({ hostKey: 'not a host key' }), 'key', unread.ask), { ok: false, message: SENTENCE_F });
  assert.equal(read.asked.length, 1);
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false);
});

test('P16: personPinWriter binds the storage folder, the snapshot and this window\'s asker, and hands on the login and the environment of the credential', async () => {
  const asked: PinClientCall[] = [];
  const mod = pinModule({ './pinClient': { windowPinClient: (call: PinClientCall): Promise<PinClient> => (asked.push(call), Promise.resolve({ kind: 'unreadable', exitCode: 255 })) } });
  const env = { PATH: '/opt/bin' };

  const answer = await mod.personPinWriter(ownedDir(scope, 'p16'), entity({ hostKey: PIN }))('key', env);

  assert.deepEqual(answer, { ok: false, message: SENTENCE_F });
  assert.deepEqual(asked, [{ program: mod.PERSON_SSH_PROGRAM, env }]);
  assert.equal(asked[0].env, env);
  assert.equal(mod.PERSON_SSH_PROGRAM, 'ssh');
});
