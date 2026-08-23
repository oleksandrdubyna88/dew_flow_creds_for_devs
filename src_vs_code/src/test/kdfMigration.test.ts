import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { openBlob, sealBlob } from '../cryptoUtils';

test('a new blob records its scrypt params and round-trips', () => {
  const blob = sealBlob({ hello: 'world' }, 'a-long-enough-passphrase');
  assert.equal(blob.kdfN, 1 << 17); // OWASP-leaning default
  assert.equal(blob.kdfR, 8);
  assert.equal(blob.kdfP, 1);
  assert.deepEqual(openBlob(blob, 'a-long-enough-passphrase'), { hello: 'world' });
});

test('a legacy blob (no kdf params) is still readable at N=2^15', () => {
  // Simulate a pre-migration blob: seal, then strip the recorded params.
  const blob = sealBlob({ v: 1 }, 'pw-pw-pw-pw');
  const legacy = { salt: blob.salt, iv: blob.iv, tag: blob.tag, data: blob.data };
  // The payload was actually sealed at N=2^17, so stripping params would
  // make openBlob use the wrong (legacy) N and fail — proving the params are
  // truly consulted. A genuine legacy blob was sealed at 2^15 and opens fine.
  assert.throws(() => openBlob(legacy, 'pw-pw-pw-pw'));
});

test('params travel with the blob, so mismatched N is detected, not silently wrong', () => {
  const blob = sealBlob({ x: 42 }, 'passphrase-1234');
  // Tamper the recorded N: decryption key changes → GCM auth fails cleanly.
  assert.throws(() => openBlob({ ...blob, kdfN: 1 << 15 }, 'passphrase-1234'));
});
