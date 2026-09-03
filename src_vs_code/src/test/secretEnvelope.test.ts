import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isLockedSecret,
  isWovenSecret,
  lockSecret,
  plainSecret,
  readSecret,
  unlockSecret,
} from '../secretEnvelope';

/**
 * The self-describing secret. Two features need it — a woven password and a PIN-protected entry —
 * and both need the same thing: the value and the fact of its protection written in ONE operation,
 * because the keychain and `globalState` are not one transaction and a mark that can exist without
 * its value is unreadable data.
 */

const ACCOUNT = 'account-1';
const PIN = 'correct-horse-battery';

test('a string this build never wrote is a plaintext secret, which is what it is', () => {
  // The whole migration: no pass over existing vaults, and a rolled-back build reads its own writes.
  assert.deepEqual(readSecret('hunter2'), { kind: 'value', value: 'hunter2', woven: false });
  assert.deepEqual(readSecret('{ not json'), { kind: 'value', value: '{ not json', woven: false });
  assert.deepEqual(readSecret('{"v":99}'), { kind: 'value', value: '{"v":99}', woven: false });
  assert.deepEqual(readSecret(undefined), { kind: 'absent' });
});

test('an ordinary secret is still stored as the bare string, byte for byte', () => {
  // Nothing is gained by wrapping the ordinary case, and everything already written stays as it is.
  assert.equal(plainSecret('hunter2'), 'hunter2');
});

test('a woven mark travels with its value and comes back with it', () => {
  const stored = plainSecret('AaBbCc', true);

  assert.notEqual(stored, 'AaBbCc', 'the mark has to be somewhere, and it is inside');
  assert.deepEqual(readSecret(stored), { kind: 'value', value: 'AaBbCc', woven: true });
  assert.ok(isWovenSecret(stored));
});

test('a locked envelope holds the plaintext NOWHERE', async () => {
  // The finding this test exists for: an envelope that stores the value beside `pinWrapped: true`
  // reads as protection and is none. Blunt on purpose, like the card's "no value reaches the page".
  const stored = await lockSecret('hunter2', ACCOUNT, PIN);

  assert.ok(!stored.includes('hunter2'), 'the secret must not appear in what is written');
  assert.ok(isLockedSecret(stored));
});

test('the value comes back with the PIN, and only with it', async () => {
  const stored = await lockSecret('hunter2', ACCOUNT, PIN);
  const read = readSecret(stored);
  assert.equal(read.kind, 'locked');

  if (read.kind === 'locked') {
    assert.equal(await unlockSecret(read.envelope, ACCOUNT, PIN), 'hunter2');
    await assert.rejects(unlockSecret(read.envelope, ACCOUNT, 'the-wrong-pin'));
    await assert.rejects(unlockSecret(read.envelope, 'another-account', PIN), 'the account is bound in too');
  }
});

test('reading a locked secret ANSWERS rather than asking — no caller is ever made to prompt', async () => {
  // storageManager is called by background sync, by the tree renderer and by headless tooling, none
  // of which can show a modal. A decoder that asked there would hang them, or hand them envelope
  // JSON where they expected a password.
  const stored = await lockSecret('hunter2', ACCOUNT, PIN);
  const read = readSecret(stored);

  assert.equal(read.kind, 'locked', 'the shape says "protected", and the caller decides what to do');
  assert.ok(!JSON.stringify(read).includes('hunter2'));
});

test('woven and locked are independent — a woven password inside a protected entry stays both', async () => {
  const stored = await lockSecret('AaBbCc', ACCOUNT, PIN, true);
  const read = readSecret(stored);

  assert.equal(read.kind, 'locked');
  assert.equal(read.kind === 'locked' && read.woven, true, 'both marks survive');
  if (read.kind === 'locked') {
    assert.equal(await unlockSecret(read.envelope, ACCOUNT, PIN), 'AaBbCc');
  }
});

test('two locks of one value differ, so nothing about the plaintext leaks through the envelope', async () => {
  const one = await lockSecret('hunter2', ACCOUNT, PIN);
  const two = await lockSecret('hunter2', ACCOUNT, PIN);

  assert.notEqual(one, two, 'a fresh data key and fresh salts every time');
});
