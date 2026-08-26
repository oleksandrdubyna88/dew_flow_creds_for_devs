import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  formatHostKey,
  hostKeyFingerprint,
  knownHostsLine,
  parseHostKey,
  parseKeyscan,
  pinVerdict,
  preferredKey,
} from '../hostKeyPin';

const ED = 'AAAAC3NzaC1lZDI1NTE5AAAAIExampleExampleExampleExampleExampleEx';
const RSA = 'AAAAB3NzaC1yc2EAAAADAQABAAABgQDExampleExampleExample';

test('keyscan output is read into keys, comments and noise ignored', () => {
  const text = [
    '# host.example.com:22 SSH-2.0-OpenSSH_9.6',
    `host.example.com ssh-ed25519 ${ED}`,
    '# another comment',
    `host.example.com ssh-rsa ${RSA}`,
    '',
    'garbage line',
  ].join('\n');

  assert.deepEqual(parseKeyscan(text), [
    { algorithm: 'ssh-ed25519', base64: ED },
    { algorithm: 'ssh-rsa', base64: RSA },
  ]);
});

test('an unknown key type is not pinned — including ssh-dss, which is broken by specification', () => {
  const text = ['h ssh-dss AAAAB3NzaC1kc3MAAACB', 'h not-a-type AAAA', `h ssh-ed25519 ${ED}`].join('\n');

  assert.deepEqual(parseKeyscan(text), [{ algorithm: 'ssh-ed25519', base64: ED }]);
});

test('a body that is not base64 is refused rather than stored as a pin', () => {
  assert.deepEqual(parseKeyscan('h ssh-ed25519 not base64!'), []);
});

test('ed25519 is preferred over RSA when a host offers both', () => {
  const keys = parseKeyscan([`h ssh-rsa ${RSA}`, `h ssh-ed25519 ${ED}`].join('\n'));
  assert.equal(preferredKey(keys)?.algorithm, 'ssh-ed25519');
});

test('the stored form round-trips', () => {
  const key = { algorithm: 'ssh-ed25519', base64: ED };
  assert.equal(formatHostKey(key), `ssh-ed25519 ${ED}`);
  assert.deepEqual(parseHostKey(formatHostKey(key)), key);
  assert.equal(parseHostKey('nonsense'), undefined);
  assert.equal(parseHostKey(undefined), undefined);
});

test('the fingerprint is the SHA256: string ssh-keygen prints for the same key', () => {
  // Generated here and compared against the real tool, so this is not our own arithmetic
  // agreeing with itself. Skipped where ssh-keygen is absent rather than failing.
  const { publicKey } = crypto.generateKeyPairSync('ed25519');
  const der = publicKey.export({ type: 'spki', format: 'der' });
  const raw = der.subarray(der.length - 32);
  const blob = Buffer.concat([
    Buffer.from([0, 0, 0, 11]),
    Buffer.from('ssh-ed25519'),
    Buffer.from([0, 0, 0, 32]),
    raw,
  ]);
  const key = { algorithm: 'ssh-ed25519', base64: blob.toString('base64') };

  const file = path.join(os.tmpdir(), `creds-hostkey-${process.pid}.pub`);
  fs.writeFileSync(file, `${formatHostKey(key)} probe\n`);
  let printed: string;
  try {
    printed = execFileSync('ssh-keygen', ['-lf', file], { encoding: 'utf8' });
  } catch {
    return; // no ssh-keygen on this machine
  } finally {
    fs.rmSync(file, { force: true });
  }

  const expected = /(SHA256:[A-Za-z0-9+/]+)/.exec(printed)?.[1];
  assert.equal(hostKeyFingerprint(key), expected);
});

test('a non-default port is written in the bracketed form known_hosts requires', () => {
  const key = { algorithm: 'ssh-ed25519', base64: ED };

  assert.equal(knownHostsLine('h.example.com', 22, key), `h.example.com ssh-ed25519 ${ED}\n`);
  assert.equal(knownHostsLine('h.example.com', undefined, key), `h.example.com ssh-ed25519 ${ED}\n`);
  // Without the brackets this line silently fails to match and every connection re-asks.
  assert.equal(knownHostsLine('h.example.com', 2222, key), `[h.example.com]:2222 ssh-ed25519 ${ED}\n`);
});

test('a host that could be read as a flag produces no known_hosts line at all', () => {
  assert.equal(knownHostsLine('-oProxyCommand=x', 22, { algorithm: 'ssh-ed25519', base64: ED }), undefined);
});

test('the three verdicts are distinguished, and a dead host is none of them', () => {
  const key = { algorithm: 'ssh-ed25519', base64: ED };
  const other = { algorithm: 'ssh-ed25519', base64: ED.replace('Ex', 'Zz') };

  assert.equal(pinVerdict(undefined, key), 'first-contact');
  assert.equal(pinVerdict(formatHostKey(key), key), 'match');
  assert.equal(pinVerdict(formatHostKey(key), other), 'mismatch');
  // A host that is down is not a host that changed its key. Reporting one as the other is how
  // people learn to click through the alarm that matters.
  assert.equal(pinVerdict(formatHostKey(key), undefined), 'unreachable');
  assert.equal(pinVerdict(undefined, undefined), 'unreachable');
});

test('a key of a DIFFERENT type than the pin is a mismatch, not a second opinion', () => {
  const pinned = formatHostKey({ algorithm: 'ssh-ed25519', base64: ED });
  assert.equal(pinVerdict(pinned, { algorithm: 'ssh-rsa', base64: RSA }), 'mismatch');
});
