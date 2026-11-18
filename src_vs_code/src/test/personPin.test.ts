import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { formatHostKey, knownHostsLine, parseHostKey } from '../hostKeyPin';
import { materializedKeysDir } from '../materializedKeys';
import type { EntityMetadata } from '../types';
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

/** What is in this window's key folder of `dir`; none when the folder was never made. */
function written(dir: string): string[] {
  const keys = materializedKeysDir(dir);
  return fs.existsSync(keys) ? fs.readdirSync(keys).sort() : [];
}

test('P1: no saved host key, an empty one and one of white space are unpinned: the answer holds no file and nothing is written', () => {
  const dir = ownedDir(scope, 'p1');
  const mod = pinModule();

  for (const hostKey of [undefined, '', '   ', ' \n\t ']) {
    assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey }), 'key'), { ok: true });
    assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey }), 'askpass'), { ok: true });
  }
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P1: an unpinned entry wrote into the key folder');
});

test('P2: a saved host key that can be used is written to a file of this call: known_hosts-<id>-<uuid> in the key folder, the line of the entry', () => {
  const dir = ownedDir(scope, 'p2');
  assert.deepEqual(parseHostKey(PIN), HOST_KEY, 'the fixture is not a pin that the real parser reads');

  const answer = pinModule().writePersonPin(dir, entity({ hostKey: PIN, port: 2222 }), 'askpass');

  assert.equal(answer.ok, true);
  const file = answer.ok ? answer.knownHostsFile : undefined;
  assert.ok(file !== undefined, 'P2: a pinned entry got no pin file');
  assert.equal(path.dirname(file), materializedKeysDir(dir));
  assert.match(path.basename(file), CALL_PIN);
  assert.equal(fs.readFileSync(file, 'utf8'), knownHostsLine('box.example', 2222, HOST_KEY));
  assert.deepEqual(written(dir), [path.basename(file)]);
});

test('P2b: on POSIX the pin file is the owner\'s alone, in a folder that is the owner\'s alone', { skip: process.platform === 'win32' }, () => {
  const dir = ownedDir(scope, 'p2b');

  const answer = pinModule().writePersonPin(dir, entity({ hostKey: PIN }), 'key');

  const file = answer.ok ? answer.knownHostsFile : undefined;
  assert.ok(file !== undefined);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
});

test('P3: two calls of one entry write two distinct files, and neither writes or replaces known_hosts-<id>', () => {
  const dir = ownedDir(scope, 'p3');
  const older = path.join(materializedKeysDir(dir), 'known_hosts-e1');
  fs.mkdirSync(path.dirname(older), { recursive: true, mode: 0o700 });
  fs.writeFileSync(older, 'the pin of another road\n');
  const mod = pinModule();

  const first = mod.writePersonPin(dir, entity({ hostKey: PIN }), 'key');
  const second = mod.writePersonPin(dir, entity({ hostKey: PIN }), 'key');

  const files = [first, second].map((answer) => (answer.ok ? answer.knownHostsFile : undefined));
  assert.ok(files[0] !== undefined && files[1] !== undefined);
  assert.notEqual(files[0], files[1], 'P3: two calls share one pin file');
  assert.deepEqual(written(dir), ['known_hosts-e1', path.basename(files[0]), path.basename(files[1])].sort());
  assert.equal(fs.readFileSync(older, 'utf8'), 'the pin of another road\n');
});

test('P4: a saved host key that does not parse is refused with sentence A, the key form for a key login, word for word; nothing is written', () => {
  const dir = ownedDir(scope, 'p4');
  const mod = pinModule();

  for (const hostKey of ['not a host key', 'ssh-ed25519', 'ssh-ed25519 short', 'ssh-dss AAAAC3NzaC1lZDI1NTE5AAAAIKNOWNKEY']) {
    assert.equal(parseHostKey(hostKey), undefined, `the fixture ${hostKey} is a pin that the real parser reads`);
    assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey }), 'key'), { ok: false, message: KEY_FORM });
  }
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P4: a refused pin wrote into the key folder');
});

test('P5: the same pin on a password login is refused with the password form, word for word, which never sends the person to Connect SSH to save it', () => {
  const dir = ownedDir(scope, 'p5');

  const answer = pinModule().writePersonPin(dir, entity({ hostKey: 'not a host key' }), 'askpass');

  assert.deepEqual(answer, { ok: false, message: PASSWORD_FORM });
  assert.equal(PASSWORD_FORM.includes('Trust and connect'), false);
  assert.equal(PASSWORD_FORM.includes('go on only if'), false);
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P5: a refused pin wrote into the key folder');
});

test('P6: a pin that parses on a host that cannot form a known_hosts line, or on no host, is refused with sentence A too; nothing is written', () => {
  const dir = ownedDir(scope, 'p6');
  const mod = pinModule();

  assert.equal(knownHostsLine('-oProxyCommand=evil', undefined, HOST_KEY), undefined, 'the fixture host forms a line');
  assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey: PIN, host: '-oProxyCommand=evil' }), 'key'), { ok: false, message: KEY_FORM });
  assert.deepEqual(mod.writePersonPin(dir, entity({ hostKey: PIN, host: undefined }), 'askpass'), { ok: false, message: PASSWORD_FORM });
  assert.equal(fs.existsSync(path.join(dir, 'keys')), false, 'P6: a refused pin wrote into the key folder');
});

test('P7: a write that throws is refused with sentence B and the text of the error, for an Error and for a thrown string; it does not throw', () => {
  const throwing = (thrown: unknown): PersonPin => pinModule({ './hostKeyTrust': { materializeKnownHosts: (): never => { throw thrown; } } });

  assert.deepEqual(throwing(new Error('ENOSPC: no space left on device')).writePersonPin('/storage', entity({ hostKey: PIN }), 'key'), {
    ok: false,
    message: 'Could not write the saved host key of "box" to disk: ENOSPC: no space left on device',
  });
  assert.deepEqual(throwing('the disk is gone').writePersonPin('/storage', entity({ hostKey: PIN }), 'askpass'), {
    ok: false,
    message: 'Could not write the saved host key of "box" to disk: the disk is gone',
  });
});

test('P8: a REAL folder that cannot be written is refused with sentence B, and the real error is in it', () => {
  const dir = ownedDir(scope, 'p8');
  fs.writeFileSync(path.join(dir, 'keys'), 'a file where the key folder would be');

  const answer = pinModule().writePersonPin(dir, entity({ hostKey: PIN }), 'key');

  assert.equal(answer.ok, false);
  assert.match(answer.ok ? '' : answer.message, /^Could not write the saved host key of "box" to disk: \S/);
});

test('P9: the writer hands materializeKnownHosts the storage folder, the snapshot as it is, and a new uuid per call', () => {
  const calls: unknown[][] = [];
  const recording = { './hostKeyTrust': { materializeKnownHosts: (...args: unknown[]): string => (calls.push(args), `/storage/pin-${calls.length}`) } };
  const mod = pinModule(recording);
  const snapshot = entity({ hostKey: PIN });

  assert.deepEqual(mod.writePersonPin('/storage', snapshot, 'key'), { ok: true, knownHostsFile: '/storage/pin-1' });
  assert.deepEqual(mod.writePersonPin('/storage', snapshot, 'key'), { ok: true, knownHostsFile: '/storage/pin-2' });

  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], '/storage');
  assert.equal(calls[0][1], snapshot);
  assert.match(String(calls[0][2]), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(calls[0][2], calls[1][2], 'P9: two calls got one suffix');
});
