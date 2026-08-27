import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { test } from 'node:test';
import { SharePayload, openSharePayload, sealSharePayload } from '../orgShareEnvelope';

/**
 * The envelope one officer's Shamir share travels in: sealed under a one-time PIN told out of
 * band, because two people who have never shared anything have no key to exchange.
 */

const RECIPIENT = 'lead@corp.com';
const PIN = 'told-out-of-band-8421';

function payload(overrides: Partial<SharePayload> = {}): SharePayload {
  return {
    shareIndex: 2,
    share: crypto.randomBytes(32).toString('base64'),
    threshold: 2,
    totalShares: 3,
    integrityTag: 'dGFn',
    ...overrides,
  };
}

test('a sealed payload round-trips with the right PIN', () => {
  const original = payload();
  const opened = openSharePayload(sealSharePayload(original, RECIPIENT, PIN), RECIPIENT, PIN);
  assert.deepEqual(opened, original);
});

test('a wrong PIN answers undefined rather than throwing', () => {
  // The caller has to SAY "that PIN does not open the share". An exception here would reach a
  // person as a stack trace about a KDF, which is not something anybody can act on.
  const blob = sealSharePayload(payload(), RECIPIENT, PIN);
  assert.equal(openSharePayload(blob, RECIPIENT, 'not-the-pin'), undefined);
});

test('the RECIPIENT is bound in, so the same PIN does not open somebody else’s share', () => {
  // The seal is scrypt(recipient + PIN). One ceremony tells every officer the SAME one-time PIN,
  // so without the address in the derivation each officer's blob would open with any other's —
  // and a quorum could then be assembled from one person's inbox.
  const blob = sealSharePayload(payload(), RECIPIENT, PIN);
  assert.equal(openSharePayload(blob, 'devops@corp.com', PIN), undefined);
});

test('the recipient address is matched case- and whitespace-insensitively', () => {
  // It arrives from a server that lowercases, and is typed by a person who may not.
  const blob = sealSharePayload(payload(), '  Lead@Corp.com ', PIN);
  assert.notEqual(openSharePayload(blob, 'lead@corp.com', PIN), undefined);
});

test('a payload of the wrong SHAPE is undefined, not half-accepted', () => {
  // A blob from a build that shaped its payload differently decrypts perfectly well and then
  // yields fields this one cannot use. Returning it partially would seat a share with no index.
  const blob = sealSharePayload(
    { notAShare: true } as unknown as SharePayload, RECIPIENT, PIN);
  assert.equal(openSharePayload(blob, RECIPIENT, PIN), undefined);
});

test('a corrupted blob is undefined rather than an exception', () => {
  const blob = sealSharePayload(payload(), RECIPIENT, PIN);
  const flipped = Buffer.from(blob.data, 'base64');
  flipped[0] ^= 0x01;
  assert.equal(
    openSharePayload({ ...blob, data: flipped.toString('base64') }, RECIPIENT, PIN),
    undefined,
  );
});

test('the sealed blob carries no plaintext of the share', () => {
  // The server relays this. A field that leaked the bytes would put a share in a place the
  // server can read, which is the one thing this whole design forbids.
  const original = payload();
  const blob = sealSharePayload(original, RECIPIENT, PIN);
  const wire = JSON.stringify(blob);
  assert.equal(wire.includes(original.share), false);
  assert.equal(wire.includes(String(original.shareIndex)) && wire.includes('shareIndex'), false);
});

test('the sealed payload is the authority on the split’s shape, not the server', () => {
  // `shareIndex`, `threshold` and `totalShares` live INSIDE the GCM-authenticated blob, and the
  // server relays an unauthenticated plaintext copy of each beside it. Trusting the copy lets
  // the server label an officer's share with a wrong x or a wrong shape — sealed permanently
  // into that officer's own vault under their own PIN, and surfacing years later at the
  // break-glass as "the contributions do not rebuild this key". No confidentiality break;
  // recoverability destroyed silently, which is worse to discover.
  const original = payload({ shareIndex: 2, threshold: 2, totalShares: 3 });
  const blob = sealSharePayload(original, RECIPIENT, PIN);

  const opened = openSharePayload(blob, RECIPIENT, PIN);

  assert.ok(opened !== undefined);
  assert.equal(opened.shareIndex, 2, 'the x that reconstruction depends on');
  assert.equal(opened.threshold, 2);
  assert.equal(opened.totalShares, 3);
});
