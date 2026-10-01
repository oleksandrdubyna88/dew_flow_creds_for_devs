import assert from 'node:assert/strict';
import { stored as mint } from '../storedSecret';
import { test } from 'node:test';
import {
  isCorruptSecret,
  isLockedSecret,
  isSealedText,
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
  assert.deepEqual(readSecret(mint('hunter2')), { kind: 'value', value: 'hunter2', woven: false });
  assert.deepEqual(readSecret(mint('{ not json')), { kind: 'value', value: '{ not json', woven: false });
  // NOT `{"v":99}` — that is an envelope from a NEWER build, and handing a future version back as
  // a password is precisely the defect the review found. It is refused, not read.
  assert.equal(readSecret(mint('{"v":99}')).kind, 'corrupt');
  assert.deepEqual(readSecret(undefined), { kind: 'absent' });
});

test('an ordinary secret is still stored as the bare string, byte for byte', () => {
  // Nothing is gained by wrapping the ordinary case, and everything already written stays as it is.
  assert.equal(plainSecret('hunter2'), 'hunter2');
});

test('a woven mark travels with its value and comes back with it', () => {
  const stored = plainSecret('AaBbCc', true);

  assert.notEqual(stored, 'AaBbCc', 'the mark has to be somewhere, and it is inside');
  assert.deepEqual(readSecret(mint(stored)), { kind: 'value', value: 'AaBbCc', woven: true });
  assert.ok(isWovenSecret(mint(stored)));
});

test('a locked envelope holds the plaintext NOWHERE', async () => {
  // The finding this test exists for: an envelope that stores the value beside `pinWrapped: true`
  // reads as protection and is none. Blunt on purpose, like the card's "no value reaches the page".
  const stored = await lockSecret('hunter2', ACCOUNT, PIN);

  assert.ok(!stored.includes('hunter2'), 'the secret must not appear in what is written');
  assert.ok(isLockedSecret(mint(stored)));
});

test('the value comes back with the PIN, and only with it', async () => {
  const stored = await lockSecret('hunter2', ACCOUNT, PIN);
  const read = readSecret(mint(stored));
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
  const read = readSecret(mint(stored));

  assert.equal(read.kind, 'locked', 'the shape says "protected", and the caller decides what to do');
  assert.ok(!JSON.stringify(read).includes('hunter2'));
});

test('woven and locked are independent — a woven password inside a protected entry stays both', async () => {
  const stored = await lockSecret('AaBbCc', ACCOUNT, PIN, true);
  const read = readSecret(mint(stored));

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

/**
 * The two findings a code round raised against this module, kept as tests because both were the
 * same mistake seen from different sides: it answered "not one of ours" and "one of ours, broken"
 * with the same thing — the raw text, as a value.
 */
test('an envelope carrying BOTH a lock and a value never hands the value back', async () => {
  // `{"v":1,"lock":{},"value":"secret"}` passed a version-only check, and unlocking saw an invalid
  // wrap and returned the value WITHOUT the PIN. A locked envelope holds ciphertext and nothing
  // else, by construction, so one carrying both is not ours however well it parses.
  const forged = JSON.stringify({ v: 1, lock: {}, value: 'hunter2' });

  const read = readSecret(mint(forged));

  assert.equal(read.kind, 'corrupt', 'it is refused, not opened');
  assert.ok(!JSON.stringify(read).includes('hunter2'), 'and the value it was carrying is not handed on');
});

test('a truncated envelope is refused rather than served as somebody old password', async () => {
  // An interrupted keychain write leaves envelope-shaped text that will not parse. Reading it as a
  // plain value hands CIPHERTEXT to whatever asked for a password — and lets the next save
  // overwrite the original with it.
  const whole = await lockSecret('hunter2', ACCOUNT, PIN);
  const truncated = whole.slice(0, Math.floor(whole.length / 2));

  const read = readSecret(mint(truncated));

  assert.equal(read.kind, 'corrupt');
  assert.ok(isCorruptSecret(mint(truncated)));
  assert.equal(readSecret(mint('hunter2')).kind, 'value', 'and a genuine legacy password is still a value');
});

test('isSealedText asks TEXT the same question readSecret asks a stored form: only a sealed envelope is sealed', async () => {
  // The defence-in-depth check of a sink that writes opened text (an askpass password, a key file): an
  // envelope must never be written there, whatever opener produced the text. Plain text, a woven-plain
  // envelope and a damaged one are `value`, `value` and `corrupt` to readSecret — none of them sealed.
  const sealed = await lockSecret('hunter2', ACCOUNT, PIN);
  const damaged = sealed.slice(0, Math.floor(sealed.length / 2));

  assert.equal(isSealedText(sealed), true, 'a sealed envelope is sealed');
  assert.equal(isSealedText(await lockSecret('AaBbCc', ACCOUNT, PIN, true)), true, 'a sealed woven pair is sealed');
  assert.equal(isSealedText('hunter2'), false, 'plain text is not');
  assert.equal(isSealedText(plainSecret('AaBbCc', true)), false, 'a woven-plain envelope is not');
  assert.equal(isSealedText(damaged), false, 'a damaged envelope is not — readSecret calls it corrupt, not locked');
});

test('unlocking a damaged lock throws rather than falling through to anything', async () => {
  const forged = { v: 1 as const, lock: { wrap: {}, sealed: {} } } as never;

  await assert.rejects(unlockSecret(forged, ACCOUNT, PIN), /locked and its wrap is damaged/);
});
