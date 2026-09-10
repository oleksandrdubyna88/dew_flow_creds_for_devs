import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackupError, SealedBlob, openBlob, sealBlob } from '../cryptoUtils';
import { blobFingerprint, derivedKeyFingerprint } from '../keyFingerprint';

/**
 * The two identifiers a failed share is diagnosed with, and the one ordering property that makes
 * them worth having.
 *
 * <p>scrypt at the shipped cost is about a second per derivation, so this file seals ONCE and
 * reuses the blob. Every extra seal here is a second on every CI run for the rest of the project's
 * life, and none of the properties under test needs a second one.</p>
 */

const KEY_ID = 'mark@remsoft.dev';
const PIN = 'able-acid-army-atom-avid-away';

/** One seal, shared by every case below. */
const sent: { blob: SealedBlob; fingerprint: string } = (() => {
  let fingerprint = '';
  const blob = sealBlob({ secret: 'zqxjvkbnm-the-payload' }, KEY_ID + PIN, undefined, undefined, (f) => {
    fingerprint = f;
  });
  return { blob, fingerprint };
})();

test('a seal reports a fingerprint of the key it derived — eight hex characters, and not the secret', () => {
  assert.match(sent.fingerprint, /^[0-9a-f]{8}$/);
  assert.ok(!sent.fingerprint.includes('able'));
  assert.ok(!sent.fingerprint.includes('mark'));
});

test('the recipient who types the SAME pin under the SAME key id reports the SAME fingerprint', () => {
  let received = '';

  const opened = openBlob(sent.blob, KEY_ID + PIN, undefined, undefined, (f) => {
    received = f;
  });

  assert.deepEqual(opened, { secret: 'zqxjvkbnm-the-payload' });
  // This equality IS the diagnosis: matching fingerprints on two machines acquit both the secret
  // and the key id at once, and send the reader to the label instead.
  assert.equal(received, sent.fingerprint);
});

test('a trailing space on the recipient side reports a DIFFERENT fingerprint, and still throws wrong-password', () => {
  let received = '';

  const failure = (): unknown =>
    openBlob(sent.blob, `${KEY_ID}${PIN} `, undefined, undefined, (f) => {
      received = f;
    });

  assert.throws(failure, (error: unknown) => error instanceof BackupError && error.kind === 'wrong-password');
  // The ordering property: the report must happen BEFORE the tag check, or the value would be
  // reported only on the path where nobody needs it.
  assert.match(received, /^[0-9a-f]{8}$/);
  assert.notEqual(received, sent.fingerprint);
});

test('the same pin under a DIFFERENT key id reports a different fingerprint — the alias case', () => {
  let received = '';

  const failure = (): unknown =>
    openBlob(sent.blob, `mark.podlyash@remsoft.dev${PIN}`, undefined, undefined, (f) => {
      received = f;
    });

  // A share whose recipient signed in under an address the roster spells differently: it arrives,
  // the PIN is right, and it never opens. Nothing but this comparison can tell it from a typo.
  assert.throws(failure);
  assert.notEqual(received, sent.fingerprint);
});

test('a reporter that throws cannot change what the open does', () => {
  const exploding = (): never => {
    throw new Error('the diagnostics channel is on fire');
  };

  const opened = openBlob(sent.blob, KEY_ID + PIN, undefined, undefined, exploding);

  assert.deepEqual(opened, { secret: 'zqxjvkbnm-the-payload' });
});

test('a blob fingerprint is the same for the same bytes and different for changed bytes', () => {
  const modified: SealedBlob = { ...sent.blob, data: `${sent.blob.data.slice(0, -4)}AAAA` };

  assert.match(blobFingerprint(sent.blob), /^[0-9a-f]{8}$/);
  assert.equal(blobFingerprint({ ...sent.blob }), blobFingerprint(sent.blob));
  // What separates "your PIN is wrong" from "the file that reached you is not the file that was
  // sent" — two causes that produce one sentence today.
  assert.notEqual(blobFingerprint(modified), blobFingerprint(sent.blob));
});

test('a key fingerprint is a name for a key and never a piece of one', () => {
  const key = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');

  const fingerprint = derivedKeyFingerprint(key);

  assert.equal(fingerprint.length, 8);
  assert.ok(!key.toString('hex').includes(fingerprint));
});
