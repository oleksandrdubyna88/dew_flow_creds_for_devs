import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, mock, test } from 'node:test';
import type { BridgedCallFiles, BridgedCallInput, BridgedLeg, bridgedSpawn as BridgedSpawn, writeBridgedCall as WriteBridgedCall } from '../bridgedSshCall';
import { bridgedConfigText } from '../bridgedSshConfig';
import type { fieldRefusal as FieldRefusal, refusalOf as RefusalOf } from '../bridgedSshRefusals';
import { pinRefusalFor } from '../pinGate';
import { materializedKeysDir } from '../materializedKeys';
import { resolveJumpChain } from '../sshOptions';
import type { EntityMetadata } from '../types';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { loadWithVscode } from './vscodeStub';
import { locked } from './pinWorld';

/**
 * The files of one bridged `ssh:exec` call (E1.6 spec B5, scenarios W1-W16): real files in an owned folder, the real `keyInstaller` under a
 * `vscode` stub, and a journal that is a list. What is asserted is what is on disk and what the journal got, never a flag.
 */

const scope = cleanupScope();
after(() => scope.close());

const KEY_A = 'AAAAC3NzaC1lZDI1NTE5AAAAIH87I+9WwO/5xAFxGCubfsyPx4wDNKN+ark5SZ/fA6J7';
const KEY_B = 'AAAAC3NzaC1lZDI1NTE5AAAAIMdHRIAcg5/4YUPpnXHk6Jokvd3AYVjUTeWon2kAGnik';
const FINGERPRINT_A = 'SHA256:jbZfs+18yOG6diYihdAteOvV4Efzpz0C+3WJVdNSDOU';
const PIN_A = `ssh-ed25519 ${KEY_A}`;
const PIN_B = `ssh-ed25519 ${KEY_B}`;

const stub = { window: { showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined) } };
const { fieldRefusal, refusalOf } = loadWithVscode<{ fieldRefusal: typeof FieldRefusal; refusalOf: typeof RefusalOf }>('../bridgedSshRefusals', stub);
const realInstaller = loadWithVscode<{ materializeCallKey(dir: string, content: string): string }>('../keyInstaller', stub);

interface World {
  readonly write: (input: BridgedCallInput) => BridgedCallFiles;
  readonly spawn: typeof BridgedSpawn;
  readonly notes: string[];
  readonly storageDir: string;
  readonly home: string;
  readonly keysDir: string;
  /** The second `materializeCallKey` call throws. */
  failSecondKey(): void;
  /** How many key files the call asked the installer to write: a refusal of pass 1 is a call that wrote none. */
  keyWrites(): number;
}

function world(storageName = 'bridged-call storage'): World {
  const storageDir = ownedDir(scope, storageName);
  const home = ownedDir(scope, 'bridged-call home');
  const notes: string[] = [];
  let writes = 0;
  let failAt = Infinity;
  const mocks = {
    './keyInstaller': {
      materializeCallKey: (dir: string, content: string): string => {
        writes += 1;
        if (writes === failAt) {
          throw new Error('EACCES: the second key could not be written');
        }
        return realInstaller.materializeCallKey(dir, content);
      },
      writeAskpassScriptFile: (): string => path.join(storageDir, 'askpass.sh'),
    },
  };
  const mod = loadWithVscode<{ writeBridgedCall: typeof WriteBridgedCall; bridgedSpawn: typeof BridgedSpawn }>('../bridgedSshCall', stub, mocks);
  const base = { storageDir, home, platform: process.platform, note: (message: string): void => void notes.push(message) };
  return {
    write: (input) => mod.writeBridgedCall(base, input),
    spawn: mod.bridgedSpawn,
    notes,
    storageDir,
    home,
    keysDir: materializedKeysDir(storageDir),
    failSecondKey: () => {
      failAt = writes + 2;
    },
    keyWrites: () => writes,
  };
}

const entry = (id: string, extra: Partial<EntityMetadata> = {}): EntityMetadata => ({ id, name: id, kind: 'ssh', isSshEnabled: true, host: `${id}.example.com`, user: 'u', ...extra }) as EntityMetadata;
const storedKey = (content = 'PRIVATE KEY BODY'): BridgedLeg['credential'] => ({ kind: 'storedKey', keyEntityId: 'keyent', content });
const typedKey = (value: string): BridgedLeg['credential'] => ({ kind: 'keyPath', path: value });
const leg = (entity: EntityMetadata, credential: BridgedLeg['credential'] = storedKey()): BridgedLeg => ({ entity, credential });
const call = (destination: EntityMetadata, hops: BridgedLeg[] = [], extra: Partial<BridgedCallInput> = {}): BridgedCallInput => ({ destination, auth: 'key', keyPath: undefined, hops, ...extra });

function okFiles(files: BridgedCallFiles): Extract<BridgedCallFiles, { ok: true }> {
  assert.ok(files.ok, `refused: ${JSON.stringify(files)}`);
  return files;
}

function refused(files: BridgedCallFiles): { code: string; reason: string } {
  assert.equal(files.ok, false, 'the call was not refused');
  return files as { code: string; reason: string };
}

/** Everything under a folder, as relative names: files and folders. */
function tree(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, encoding: 'utf8' }).sort() : [];
}

const posix = process.platform !== 'win32';

test('W1: a hop with a stored key — one random key file 0600, c.conf alone in a folder, no id or name in a path or in the text, -J as resolveJumpChain gives it', () => {
  const w = world();
  const hop = entry('jumpid', { name: 'Jump Name', host: 'jump.example.com', user: 'hop' });
  const dest = entry('destid', { name: 'prod', host: 'prod.corp.com', user: 'deploy', jumpHostEntityId: 'jumpid', hostKey: PIN_A });

  const files = okFiles(w.write(call(dest, [leg(hop)])));

  const names = fs.readdirSync(w.keysDir);
  const keyFile = names.filter((name) => name.endsWith('.key'));
  assert.equal(keyFile.length, 1);
  assert.match(keyFile[0], /^call-[0-9a-f-]{36}\.key$/);
  if (posix) {
    assert.equal(fs.statSync(path.join(w.keysDir, keyFile[0])).mode & 0o777, 0o600);
    assert.equal(fs.statSync(files.cwd).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(files.cwd, 'c.conf')).mode & 0o777, 0o600);
  }
  assert.equal(fs.readFileSync(path.join(w.keysDir, keyFile[0]), 'utf8').trim(), 'PRIVATE KEY BODY');
  assert.deepEqual(fs.readdirSync(files.cwd), ['c.conf'], 'the folder holds the file and nothing else');
  assert.equal(path.dirname(files.cwd), w.keysDir);
  const conf = fs.readFileSync(path.join(files.cwd, 'c.conf'), 'utf8');
  assert.ok(conf.includes(path.join(w.keysDir, keyFile[0])), 'the hop block names the key file');
  const everything = [...tree(w.storageDir), conf, JSON.stringify(files, (_, v: unknown) => (typeof v === 'function' ? undefined : v))].join('\n');
  for (const word of ['jumpid', 'keyent', 'Jump Name', 'destid']) {
    assert.ok(!everything.includes(word), `${word} is in no path and no text`);
  }
  const chain = resolveJumpChain(dest, (id) => (id === 'jumpid' ? hop : undefined));
  assert.ok(chain.ok);
  assert.equal(files.jump, chain.value);
  assert.equal(files.configFile, 'c.conf');
  assert.equal(files.pinned, true);
  files.remove();
  assert.deepEqual(fs.readdirSync(w.keysDir), []);
});

test('W2: a hop with a typed key path — the block names the path as typed, no key file is written, and the file at that path outlives remove()', () => {
  const w = world();
  const typedFile = path.join(ownedDir(scope, 'bridged-call typed'), 'hop-key');
  fs.writeFileSync(typedFile, 'KEY', { mode: 0o600 });
  const files = okFiles(w.write(call(entry('dest'), [leg(entry('hop'), typedKey(typedFile))])));

  assert.ok(fs.readFileSync(path.join(files.cwd, 'c.conf'), 'utf8').includes(`IdentityFile "${typedFile}"`));
  assert.deepEqual(fs.readdirSync(w.keysDir).filter((name) => name.endsWith('.key')), []);
  files.remove();
  assert.ok(fs.existsSync(typedFile), 'the person\'s own file is never touched');
});

test('W3: a hop with a password, with none, with a PIN-sealed key, with a sealed stored content and with an empty key path is refused with the sentence of R1, R2 or R3 and leaves no file', async () => {
  const sealed = await locked('SEALED KEY');
  const cases: ReadonlyArray<readonly [BridgedLeg['credential'], string]> = [
    [{ kind: 'password', password: 'pw' }, 'The jump host "hop" logs in by password. Through a Remote Bridge a jump host needs a key of its own.'],
    [{ kind: 'none' }, 'The jump host "hop" has no key. Through a Remote Bridge a jump host needs a key of its own.'],
    [{ kind: 'stopped', reason: '', ownerName: 'k', ownerId: 'k1' }, '"k" is protected with its own PIN, and it was not opened.'],
    [{ kind: 'stopped', reason: 'a sentence of the opener', ownerName: 'k', ownerId: 'k1' }, 'a sentence of the opener'],
    [storedKey(sealed), pinRefusalFor('hop')],
    [typedKey(''), 'The jump host "hop" has no key. Through a Remote Bridge a jump host needs a key of its own.'],
  ];
  for (const [credential, sentence] of cases) {
    const w = world();
    const result = refused(w.write(call(entry('dest'), [leg(entry('hop'), credential)])));
    assert.deepEqual([result.code, result.reason], ['no_credential', sentence]);
    assert.deepEqual(tree(w.keysDir), [], 'no new file and no folder');
  }
});

test('W4: equal hosts among the legs are refused (R4): the destination and a hop, two hops, another letter case, and a hop [::1] with the destination ::1', () => {
  const cases: ReadonlyArray<readonly [BridgedCallInput, string]> = [
    [call(entry('d', { host: 'same.example' }), [leg(entry('h', { host: 'same.example' }))]), 'same.example'],
    [call(entry('d'), [leg(entry('h1', { host: 'a.example' })), leg(entry('h2', { host: 'a.example' }))]), 'a.example'],
    [call(entry('d', { host: 'Same.Example' }), [leg(entry('h', { host: 'sAME.eXAMPLE' }))]), 'sAME.eXAMPLE'],
    [call(entry('d', { host: '::1' }), [leg(entry('h', { host: '[::1]' }))]), '::1'],
  ];
  for (const [input, word] of cases) {
    const w = world();
    const result = refused(w.write(input));
    assert.deepEqual([result.code, result.reason], ['no_credential', `Two connections of this call go to the host "${word}". Through a Remote Bridge the destination and each jump host need a different host.`]);
    assert.deepEqual(tree(w.keysDir), []);
    assert.equal(w.keyWrites(), 0, 'it was refused in pass 1: no key file was even asked for (the text function refuses again, but later, and after a write)');
  }
});

test('W5: a password destination with no pin is refused (R5) and nothing is written; with a pin it is pinned and has a destination block', () => {
  const w = world();
  const result = refused(w.write(call(entry('prod'), [], { auth: 'askpass' })));
  assert.deepEqual([result.code, result.reason], ['no_credential', '"prod" logs in by password and pins no host key. Through a Remote Bridge a password goes only to a host whose key is pinned.']);
  assert.deepEqual(tree(w.keysDir), []);

  const files = okFiles(w.write(call(entry('prod', { hostKey: PIN_A }), [], { auth: 'askpass' })));
  assert.equal(files.pinned, true);
  const conf = fs.readFileSync(path.join(files.cwd, 'c.conf'), 'utf8');
  assert.match(conf, /Host prod\.example\.com\n  StrictHostKeyChecking yes\n  UserKnownHostsFile "[^"]+\.known_hosts"\n/);
  files.remove();
});

test('W6: pin lines are written for the lower-case Host word with the port: HOP.Example:2222, [::1], and an unpinned hop gets accept-new with the two files', () => {
  const w = world();
  const hops = [
    leg(entry('h1', { host: 'HOP.Example', port: 2222, hostKey: PIN_A })),
    leg(entry('h2', { host: '[::1]', hostKey: PIN_B })),
    leg(entry('h3', { host: 'third.example' })),
  ];

  const files = okFiles(w.write(call(entry('dest'), hops)));

  const conf = fs.readFileSync(path.join(files.cwd, 'c.conf'), 'utf8');
  const pinOf = (host: string): string => {
    const block = conf.split('\n').slice(conf.split('\n').indexOf(`Host ${host}`));
    return /UserKnownHostsFile "([^"]+)"/.exec(block.join('\n'))?.[1] ?? assert.fail(`no pin for ${host}`);
  };
  assert.equal(fs.readFileSync(pinOf('HOP.Example'), 'utf8'), `[hop.example]:2222 ${PIN_A}\n`);
  assert.equal(fs.readFileSync(pinOf('::1'), 'utf8'), `::1 ${PIN_B}\n`);
  assert.match(path.basename(pinOf('::1')), /^call-[0-9a-f-]{36}\.known_hosts$/);
  assert.ok(conf.includes('Host third.example\n  IdentityFile'));
  assert.match(conf, /Host third\.example\n  IdentityFile ".*"\n  StrictHostKeyChecking accept-new\n  UserKnownHostsFile ".*bridges[\\/]known_hosts" ".*known_hosts"\n/);
  files.remove();
});

test('W7: remove() takes every file and the folder, and not bridges/known_hosts; a removal that fails throws nothing and leaves one note', () => {
  const w = world();
  const files = okFiles(w.write(call(entry('dest'), [leg(entry('hop'))])));
  assert.ok(fs.existsSync(path.join(w.storageDir, 'bridges', 'known_hosts')), 'a first-contact leg opened it');
  files.remove();
  assert.deepEqual(fs.readdirSync(w.keysDir), []);
  assert.ok(fs.existsSync(path.join(w.storageDir, 'bridges', 'known_hosts')));
  assert.deepEqual(w.notes, []);

  const second = okFiles(w.write(call(entry('dest'), [leg(entry('hop'))])));
  const nodeFs = require('node:fs') as typeof fs;
  const real = nodeFs.rmSync;
  const failing = mock.method(nodeFs, 'rmSync', (): void => {
    throw new Error('EPERM: operation not permitted');
  });
  try {
    assert.doesNotThrow(() => second.remove());
  } finally {
    failing.mock.restore();
  }
  assert.ok(failing.mock.callCount() > 0);
  assert.deepEqual(w.notes, ['ssh:exec — a file of the call could not be removed: EPERM: operation not permitted']);
  real(w.keysDir, { recursive: true, force: true });
});

test('W8: when the second key write fails the answer is internal (R7) and the first key file is gone', () => {
  const w = world();
  w.failSecondKey();

  const result = refused(w.write(call(entry('dest'), [leg(entry('h1')), leg(entry('h2'))])));

  assert.deepEqual([result.code, result.reason], ['internal', 'Could not write the files of this call: EACCES: the second key could not be written']);
  assert.deepEqual(tree(w.keysDir), []);
});

test('W9: the person\'s known_hosts in the text is under the injected home, as an absolute path', () => {
  const w = world();
  const files = okFiles(w.write(call(entry('dest'))));

  const conf = fs.readFileSync(path.join(files.cwd, 'c.conf'), 'utf8');
  assert.ok(conf.includes(`"${path.join(w.home, '.ssh', 'known_hosts')}"`), conf);
  assert.ok(path.isAbsolute(w.home));
  files.remove();
});

test('W10: a line added to bridges/known_hosts after the write is one sentence J1 with its fingerprint; the next call, with no new line, has none', () => {
  const w = world();
  const input = call(entry('dest', { name: 'prod', host: 'prod.corp.com' }));
  const files = okFiles(w.write(input));
  fs.appendFileSync(path.join(w.storageDir, 'bridges', 'known_hosts'), `prod.corp.com ${PIN_A}\n`);

  assert.deepEqual(files.afterRun(), [`prod: first contact through a Remote Bridge: prod.corp.com ssh-ed25519 ${FINGERPRINT_A} was added to bridges/known_hosts`]);
  files.remove();
  const next = okFiles(w.write(input));
  assert.deepEqual(next.afterRun(), [], 'the line is there, and it is not new');
  next.remove();
});

const USER_REFUSAL = (field: string): string => `A value of this call cannot be given to ssh through a Remote Bridge: ${field} is not a valid user name, or holds "$" or a backslash.`;

test('W11: a hop user with $ or a backslash, and the same two as the destination\'s user, are refused (R6); alice and alice-name are written', () => {
  for (const user of ['$BRIDGE_PROBE', 'CORP\\alice']) {
    const asHop = world();
    assert.equal(refused(asHop.write(call(entry('dest'), [leg(entry('hop1', { user }))]))).reason, USER_REFUSAL('the user of the jump host "hop1"'));
    assert.deepEqual(tree(asHop.keysDir), []);
    const asDest = world();
    assert.equal(refused(asDest.write(call(entry('dest', { user })))).reason, USER_REFUSAL('the user of "dest"'));
    assert.deepEqual(tree(asDest.keysDir), []);
  }
  for (const user of ['alice', 'alice-name']) {
    const w = world();
    okFiles(w.write(call(entry('dest', { user }), [leg(entry('hop', { user }))]))).remove();
  }
});

const HOST_REFUSAL = (field: string): string => `A value of this call cannot be given to ssh through a Remote Bridge: ${field} is not a valid host, is the word "none", or holds ":" or a square bracket and is not an IPv6 address in the form a bridge takes.`;

test('W12: a hop gw:2201, a bare ::1 as a hop and the destination gw:2201 are refused (R6, the host field); the destination ::1 is written', () => {
  const w = world();
  assert.equal(refused(w.write(call(entry('dest'), [leg(entry('hop', { host: 'gw:2201' }))]))).reason, HOST_REFUSAL('the host of the jump host "hop"'));
  assert.equal(refused(w.write(call(entry('dest'), [leg(entry('hop', { host: '::1' }))]))).reason, HOST_REFUSAL('the host of the jump host "hop"'));
  assert.equal(refused(w.write(call(entry('dest', { host: 'gw:2201' })))).reason, HOST_REFUSAL('the host of "dest"'));
  assert.deepEqual(tree(w.keysDir), []);
  okFiles(w.write(call(entry('dest', { host: '::1' })))).remove();
});

test('W13: a key path with % is R10, with ${ is R6; the sentences hold no part of the path', () => {
  const w = world();
  const percent = refused(w.write(call(entry('prod'), [], { keyPath: '/k/%u/id' })));
  assert.deepEqual([percent.code, percent.reason], ['no_credential', 'A Remote Bridge does not support "%" in a key path: the key path of "prod". Choose a key file whose absolute path has no "%".']);
  const dollar = refused(w.write(call(entry('prod'), [], { keyPath: '/k/${X}/id' })));
  assert.equal(dollar.reason, 'A value of this call cannot be given to ssh through a Remote Bridge: the key path of "prod" is empty, or holds a quote, a control character, "${", two backslashes in a row or a backslash before an apostrophe, or ends with a backslash.');
  const hop = refused(w.write(call(entry('prod'), [leg(entry('hop1'), typedKey('/k/%d/id'))])));
  assert.equal(hop.reason, 'A Remote Bridge does not support "%" in a key path: the key path of the jump host "hop1". Choose a key file whose absolute path has no "%".');
  for (const result of [percent, dollar, hop]) {
    assert.ok(!result.reason.includes('/k/'), 'no part of the path');
  }
  assert.deepEqual(tree(w.keysDir), []);
});

test('W14: a first-contact leg whose bridges/known_hosts cannot be opened for append is internal (R7) and leaves no file; all legs pinned never make that file', () => {
  const w = world();
  fs.mkdirSync(path.join(w.storageDir, 'bridges', 'known_hosts'), { recursive: true });
  const hop = leg(entry('hop', { hostKey: PIN_A }));

  const result = refused(w.write(call(entry('dest'), [hop])));

  assert.equal(result.code, 'internal');
  assert.match(result.reason, /^Could not write the files of this call: /);
  assert.deepEqual(tree(w.keysDir), [], 'no file and no folder');

  const pinned = world();
  const files = okFiles(pinned.write(call(entry('dest', { hostKey: PIN_B }), [hop])));
  assert.equal(fs.existsSync(path.join(pinned.storageDir, 'bridges', 'known_hosts')), false, 'the file is not made');
  files.remove();
});

test('W15: a first-contact leg with no new line: J2 with both files empty; none for a plain line, a hashed line or a line in bridges/known_hosts', () => {
  const name = 'prod.corp.com';
  const sentence = `prod: after this call no host key line for ${name} is in bridges/known_hosts, and none that this check can read is in your own known_hosts. If ssh reached that host in this call, it accepted the key and kept no record, and the next call accepts any key.`;
  const input = call(entry('dest', { name: 'prod', host: name }));

  const empty = world();
  const none = okFiles(empty.write(input));
  assert.deepEqual(none.afterRun(), [sentence]);
  none.remove();

  const salt = crypto.randomBytes(20);
  const hashed = `|1|${salt.toString('base64')}|${crypto.createHmac('sha1', salt).update(name).digest('base64')}`;
  for (const line of [`${name} ${PIN_A}\n`, `other.example,${name} ${PIN_A}\n`, `${hashed} ${PIN_A}\n`]) {
    const w = world();
    fs.mkdirSync(path.join(w.home, '.ssh'), { recursive: true });
    fs.writeFileSync(path.join(w.home, '.ssh', 'known_hosts'), line);
    const files = okFiles(w.write(input));
    assert.deepEqual(files.afterRun(), [], line);
    files.remove();
  }
  const own = world();
  const files = okFiles(own.write(input));
  fs.appendFileSync(path.join(own.storageDir, 'bridges', 'known_hosts'), `${name} ${PIN_A}\n`);
  assert.ok(!files.afterRun().some((line) => line.includes('no host key line')), 'a line in bridges/known_hosts counts');
  files.remove();
});

test('W16: a hop credential\'s warning goes to the journal as "<entry of the call>: <warning>", and the call goes on', () => {
  const w = world();
  const warned: BridgedLeg['credential'] = { kind: 'storedKey', keyEntityId: 'k', content: 'PRIVATE', warning: 'the key it names is gone; using its own' };

  const files = okFiles(w.write(call(entry('prod'), [leg(entry('hop'), warned)])));

  assert.deepEqual(w.notes, ['prod: the key it names is gone; using its own']);
  files.remove();
});

/* ---------------------------------------------------------------------------------------------------------------
 * The review items of E1.6: DISPLAY, the second line's sentences, the errors that were swallowed, and a storage folder with a "%"
 * ------------------------------------------------------------------------------------------------------------- */

const HOST_ENV = { PATH: '/usr/bin', HOME: '/home/me', DISPLAY: ':0', SSH_AUTH_SOCK: '/run/agent.sock' };
/** R14, said for a path this extension made (the storage folder and what is under it). */
const R14 = 'The folder VS Code gives this extension for its files has a path that cannot be given to ssh through a Remote Bridge: it holds "%", two backslashes in a row, or another character a bridge refuses. Stored keys cannot be used through a Remote Bridge from this computer.';

const ASKPASS_ENV = { SSH_ASKPASS: '/s/askpass.sh', SSH_ASKPASS_REQUIRE: 'force', CREDS_SSH_PASSWORD: 'pw', DISPLAY: ':0' };

test('S6.3: DISPLAY reaches the outer ssh of a password destination off Windows only, even when the host environment holds one', () => {
  const w = world();
  const destination = entry('prod', { hostKey: PIN_A });
  const files = okFiles(w.write(call(destination, [], { auth: 'askpass' })));
  const spawnOn = (platform: NodeJS.Platform, askpassEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv | undefined =>
    w.spawn({ destination, keyPath: undefined, auth: 'askpass', askpassEnv, remoteCommand: 'id', files, sourceEnv: HOST_ENV, platform })?.env;

  assert.deepEqual(spawnOn('linux', ASKPASS_ENV), { PATH: '/usr/bin', HOME: '/home/me', ...ASKPASS_ENV }, 'control: off Windows the four names are there');
  const windows = spawnOn('win32', { ...ASKPASS_ENV, DISPLAY: ':0' }) ?? {};
  assert.ok(!('DISPLAY' in windows), `on win32 no DISPLAY: ${JSON.stringify(windows)}`);
  assert.deepEqual(['SSH_ASKPASS', 'SSH_ASKPASS_REQUIRE', 'CREDS_SSH_PASSWORD'].map((name) => name in windows), [true, true, true]);
  files.remove();
});

test('the second line: each field bridgedConfigText names becomes the sentence of that entry or that Host word', () => {
  const hop = entry('hop1', { host: 'gw:2201' });
  const input = call(entry('prod'), [leg(hop, typedKey('/k/%d/id'))]);
  const configOf = (host: string, key: string, destinationHost = 'prod.example.com'): { field: string } => {
    const made = bridgedConfigText({
      hops: [{ host, identityFile: key, typedKeyPath: true, check: { firstContact: true } }],
      destination: { host: destinationHost },
      noDefaultIdentity: '/s/keys/no-default-identity', firstContactFile: '/s/bridges/known_hosts', personKnownHosts: '/h/.ssh/known_hosts',
    });
    assert.equal(made.ok, false);
    return made as { field: string };
  };
  const reasonOf = (field: string, given = input): string => fieldRefusal(field, given).reason;
  assert.equal(reasonOf(configOf('gw:2201', '/k/id').field), 'A value of this call cannot be given to ssh through a Remote Bridge: the host of the jump host "hop1" is not a valid host, is the word "none", or holds ":" or a square bracket and is not an IPv6 address in the form a bridge takes.');
  assert.equal(reasonOf(configOf('hop1.example.com', 'k/%d/id').field), 'A Remote Bridge does not support "%" in a key path: the key path of the jump host "hop1". Choose a key file whose absolute path has no "%".');
  const dollar = call(entry('prod'), [leg(entry('hop1'), typedKey('/k/${X}/id'))]);
  assert.equal(reasonOf(configOf('hop1.example.com', '/k/${X}/id').field, dollar), 'A value of this call cannot be given to ssh through a Remote Bridge: the key path of the jump host "hop1" is empty, or holds a quote, a control character, "${", two backslashes in a row or a backslash before an apostrophe, or ends with a backslash.');
  assert.equal(reasonOf(configOf('hop1.example.com', '/k/id', 'gw:1').field, call(entry('prod', { host: 'gw:1' }), [])), 'A value of this call cannot be given to ssh through a Remote Bridge: the host of "prod" is not a valid host, is the word "none", or holds ":" or a square bracket and is not an IPv6 address in the form a bridge takes.');
  const same = call(entry('prod', { host: 'Same.example' }), [leg(entry('hop1', { host: 'same.EXAMPLE' }))]);
  assert.equal(configOf('same.EXAMPLE', '/k/id', 'Same.example').field, 'hosts');
  assert.equal(reasonOf('hosts', same), 'Two connections of this call go to the host "same.EXAMPLE". Through a Remote Bridge the destination and each jump host need a different host.');
  assert.match(reasonOf('known-hosts'), /the known-hosts path is empty/, 'the person\'s own known_hosts: R6');
  for (const field of ['keys', 'hop:0:pin', 'destination:pin', 'first-contact']) {
    assert.equal(reasonOf(field), R14, `${field}: a path this extension made is R14`);
  }
  assert.equal(reasonOf('hop:0:key', call(entry('prod'), [leg(entry('hop1'))])), R14, 'a stored hop key is a file this extension made');
  const doubled = call(entry('prod'), [leg(entry('hop1'), typedKey('C:\\keys\\\\id'))]);
  assert.equal(reasonOf('hop:0:key', doubled), 'A value of this call cannot be given to ssh through a Remote Bridge: the key path of the jump host "hop1" is empty, or holds a quote, a control character, "${", two backslashes in a row or a backslash before an apostrophe, or ends with a backslash.', 'a typed hop path is the person\'s: R6');
});

test('a read of a known-hosts file that fails for another reason than a missing file is not an empty file: the call is refused (R7) before the pass writes, and afterRun leaves one note', () => {
  const w = world();
  fs.mkdirSync(path.join(w.storageDir, 'bridges', 'known_hosts'), { recursive: true });
  const pinned = refused(w.write(call(entry('dest', { hostKey: PIN_A }))));
  assert.equal(pinned.code, 'internal');
  assert.match(pinned.reason, /^Could not write the files of this call: EISDIR/);
  assert.deepEqual(tree(w.keysDir), []);

  const later = world();
  const files = okFiles(later.write(call(entry('dest', { name: 'prod' }))));
  fs.rmSync(path.join(later.storageDir, 'bridges', 'known_hosts'));
  fs.mkdirSync(path.join(later.storageDir, 'bridges', 'known_hosts'));
  assert.deepEqual(files.afterRun(), []);
  assert.equal(later.notes.length, 1);
  assert.match(later.notes[0], /^ssh:exec — first contact of the call could not be reported: EISDIR/);
  files.remove();
});

test('E1.6 regression: a storage folder whose path holds % makes a bridged stored-key call refuse with R14, the sentence of the folder (kept on purpose: -i with %% fails "not accessible", X1a)', () => {
  const w = world('bridged-call 100% storage');
  assert.ok(w.storageDir.includes('%'));
  const keyFile = path.join(w.keysDir, 'call-0.key');

  const result = refused(w.write(call(entry('prod'), [], { keyPath: keyFile })));

  assert.deepEqual([result.code, result.reason], ['no_credential', R14]);
  assert.ok(!result.reason.includes(w.storageDir), 'no part of the path');
  assert.deepEqual(tree(w.keysDir), []);
});

const R6_HOST_NONE = (field: string): string => `A value of this call cannot be given to ssh through a Remote Bridge: ${field} is not a valid host, is the word "none", or holds ":" or a square bracket and is not an IPv6 address in the form a bridge takes.`;

test('Y5: a hop named none or NONE is refused with the host sentence of R6 and nothing is written; a destination named none and a hop named none.example are written', () => {
  for (const host of ['none', 'NONE', 'None']) {
    const w = world();
    const result = refused(w.write(call(entry('dest'), [leg(entry('hop', { host }))])));
    assert.deepEqual([result.code, result.reason], ['no_credential', R6_HOST_NONE('the host of the jump host "hop"')], host);
    assert.deepEqual(tree(w.keysDir), [], 'no file and no folder');
    assert.equal(w.keyWrites(), 0, 'refused in pass 1: no key file was asked for');
  }
  const asDestination = world();
  okFiles(asDestination.write(call(entry('dest', { host: 'none' })))).remove();
  const near = world();
  okFiles(near.write(call(entry('dest'), [leg(entry('hop', { host: 'none.example' }))]))).remove();
});

const R11_LINE = (who: string): string => `The host key stored for ${who} cannot be read as a host key. Through a Remote Bridge a host key that an entry holds must be one ssh can check.`;

test('Y5: a hostKey that does not parse — "garbage", or a whole known_hosts line — is R11 for a key destination and for a hop, writes no file, and leaves bridges/known_hosts byte for byte', () => {
  const knownHostsLine = `prod.example.com ssh-ed25519 ${KEY_A}`;
  const before = 'earlier.example ssh-ed25519 AAAA\n';
  const cases: ReadonlyArray<readonly [string, (hostKey: string) => BridgedCallInput, string]> = [
    ['the key destination', (hostKey) => call(entry('prod', { hostKey })), 'the host key of "prod"'],
    ['a hop', (hostKey) => call(entry('prod'), [leg(entry('hop', { hostKey }))]), 'the host key of the jump host "hop"'],
  ];
  for (const [what, build, who] of cases) {
    for (const hostKey of ['garbage', knownHostsLine, 'ssh-ed25519', `ssh-ed25519 ${KEY_A.slice(0, 20)}`]) {
      const w = world();
      fs.mkdirSync(path.join(w.storageDir, 'bridges'), { recursive: true });
      fs.writeFileSync(path.join(w.storageDir, 'bridges', 'known_hosts'), before);
      const result = refused(w.write(build(hostKey)));
      assert.deepEqual([result.code, result.reason], ['no_credential', R11_LINE(who)], `${what}: ${hostKey}`);
      assert.equal(fs.readFileSync(path.join(w.storageDir, 'bridges', 'known_hosts'), 'utf8'), before, `${what}: bridges/known_hosts is as it was`);
      assert.deepEqual(tree(w.keysDir), [], `${what}: no pin file, no key file, no folder`);
      assert.equal(w.keyWrites(), 0);
    }
    const control = world();
    okFiles(control.write(build(PIN_A))).remove();
  }
});

test('Y5: R11 is said in its place — after users, hosts and equal hosts, before a hop credential, R5 and paths; an empty or blank hostKey is no pin as before', () => {
  const asRefusal = (input: BridgedCallInput): string => refused(world().write(input)).reason;
  assert.equal(asRefusal(call(entry('prod', { hostKey: 'garbage' }), [], { auth: 'askpass' })), R11_LINE('the host key of "prod"'), 'a password destination with a pin that does not parse hears R11, not R5');
  assert.match(asRefusal(call(entry('prod', { hostKey: 'garbage', user: 'a b' }))), /the user of "prod"/, 'a user is said first');
  assert.match(asRefusal(call(entry('prod', { hostKey: 'garbage', host: 'gw:2201' }))), /the host of "prod" is not a valid host/, 'a host is said before it');
  assert.match(asRefusal(call(entry('prod', { hostKey: 'garbage', host: 'same.example' }), [leg(entry('hop', { host: 'same.example' }))])), /^Two connections of this call go to the host/, 'equal hosts too');
  assert.equal(asRefusal(call(entry('prod', { hostKey: 'garbage' }), [leg(entry('hop'), { kind: 'password', password: 'pw' })])), R11_LINE('the host key of "prod"'), 'before a hop credential (R1)');
  assert.equal(asRefusal(call(entry('prod'), [leg(entry('hop', { hostKey: 'garbage' }), { kind: 'password', password: 'pw' })])), R11_LINE('the host key of the jump host "hop"'), 'a hop with both faults: its pin first');
  assert.match(asRefusal(call(entry('prod', { hostKey: 'garbage' }), [], { keyPath: '/k/%u/id' })), /^The host key stored for /, 'before the paths (R10)');
  for (const hostKey of ['', '   ', undefined]) {
    const w = world();
    okFiles(w.write(call(entry('prod', { hostKey }), [leg(entry('hop', { hostKey }))]))).remove();
    assert.match(refused(world().write(call(entry('prod', { hostKey }), [], { auth: 'askpass' }))).reason, /logs in by password and pins no host key/, 'an empty pin is no pin: R5 for a password');
  }
});

test('Y5: a hop key path that holds two backslashes in a row or a backslash before an apostrophe is R6 and nothing is written; the destination\'s typed -i path of that form is written and carried unchanged', () => {
  for (const value of ['C:\\keys\\\\id', "C:\\'k\\id", '\\\\fs\\keys\\id']) {
    const w = world();
    const result = refused(w.write(call(entry('prod'), [leg(entry('hop1'), typedKey(value))])));
    assert.equal(result.reason, 'A value of this call cannot be given to ssh through a Remote Bridge: the key path of the jump host "hop1" is empty, or holds a quote, a control character, "${", two backslashes in a row or a backslash before an apostrophe, or ends with a backslash.', value);
    assert.ok(!result.reason.includes('keys') && !result.reason.includes("'k"), 'the sentence holds no part of the path');
    assert.deepEqual(tree(w.keysDir), []);
    assert.equal(w.keyWrites(), 0);
  }
  const w = world();
  const destination = entry('prod');
  const typedPath = '\\\\fs\\keys\\id';
  const files = okFiles(w.write(call(destination, [], { keyPath: typedPath })));
  const spawned = w.spawn({ destination, keyPath: typedPath, auth: 'key', askpassEnv: {}, remoteCommand: 'id', files, sourceEnv: HOST_ENV, platform: 'win32' });
  assert.ok(spawned !== undefined, 'the argv is built');
  assert.equal(spawned.argv[spawned.argv.indexOf('-i') + 1], typedPath, '-i carries the typed path unchanged');
  assert.ok(!fs.readFileSync(path.join(files.cwd, 'c.conf'), 'utf8').includes(typedPath), 'and the file does not hold it: it goes to the argv alone');
  files.remove();
});

type Pass1Base = Parameters<typeof RefusalOf>[0];
const NOT_REFUSED = '(not refused)';

/** What pass 1 says for a call, as a sentence; the call it lets through says NOT_REFUSED. */
const said = (base: Pass1Base, input: BridgedCallInput): string => refusalOf(base, input)?.reason ?? NOT_REFUSED;
const saidCode = (base: Pass1Base, input: BridgedCallInput): string => refusalOf(base, input)?.code ?? NOT_REFUSED;

test('Y5: a storage folder on a UNC path is R14, whatever the call; a stored key and a % in the folder are R14 too, and a typed path with % stays R10', () => {
  const base = { storageDir: '\\\\fs\\share\\x', home: '/home/me', platform: 'win32' as const, note: (): void => undefined };
  const keyFile = path.join(materializedKeysDir(base.storageDir), 'call-0.key');
  for (const input of [call(entry('prod')), call(entry('prod'), [leg(entry('hop'))]), call(entry('prod'), [], { keyPath: keyFile }), call(entry('prod', { hostKey: PIN_A }), [], { auth: 'askpass' })]) {
    assert.equal(said(base, input), R14);
    assert.equal(saidCode(base, input), 'no_credential');
  }
  const percent = { ...base, storageDir: '/s/100%/x' };
  assert.equal(said(percent, call(entry('prod'), [], { keyPath: path.join(materializedKeysDir(percent.storageDir), 'call-0.key') })), R14, 'the call\'s own key file');
  assert.match(said(percent, call(entry('prod'), [], { keyPath: '/k/%u/id' })), /^A Remote Bridge does not support "%" in a key path: the key path of "prod"\. Choose a key file/, 'a typed path with %: R10');
  const fine = { ...base, storageDir: '/s/plain' };
  assert.equal(said(fine, call(entry('prod'))), NOT_REFUSED, 'control: an ordinary storage folder is not refused');
  assert.match(said({ ...fine, home: '\\\\fs\\profile' }, call(entry('prod'))), /the known-hosts path is empty, or holds/, 'the person\'s own known_hosts keeps R6, its own sentence');
});
