import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_CLAIM_FIELDS, withoutSecretClaims } from '../secretClaims';
import { shareableDetails } from '../shareFormat';
import type { EntityMetadata } from '../types';

/**
 * A node claiming a secret that is not there — the PERMANENT kind.
 *
 * <p>S1.4's invariant forbids exactly this state and the write order handles the version a crash
 * leaves for a moment. An audit of every write path found the version that is never repaired: a
 * claim copied onto a node whose secret is never written. It does not heal, and it syncs.</p>
 */

const FULL: EntityMetadata = {
  id: 'e1',
  name: 'prod',
  isSshEnabled: false,
  hasTotp: true,
  configKeyHash: 'sha256:abcd',
  attachmentFileName: 'key.pem',
  attachmentSize: 2048,
  attachmentChangedAt: 1,
  attachmentChangedBy: 'someone@example.com',
  imageFileName: 'badge.png',
  imageSize: 900,
  imageWidth: 30,
  imageHeight: 30,
  envBindings: { DB_PASSWORD: 'password' },
};

test('every claim about a stored secret is dropped, and nothing else is', () => {
  const stripped = withoutSecretClaims(FULL);

  for (const field of SECRET_CLAIM_FIELDS) {
    assert.equal(stripped[field], undefined, `${field} is a claim and must not survive`);
  }
  assert.equal(stripped.name, 'prod', 'the entry keeps being itself');
  assert.equal(stripped.isSshEnabled, false);
});

test('a claim field that is absent stays absent rather than becoming a present undefined', () => {
  // It travels as JSON. An explicit `"hasTotp": undefined` is dropped by the serializer anyway, but
  // `Object.keys` is used in places that compare shapes, so deleting beats assigning.
  const stripped = withoutSecretClaims({ id: 'e1', name: 'x', isSshEnabled: false });
  assert.deepEqual(Object.keys(stripped), ['id', 'name', 'isSshEnabled']);
});

test('a share strips the attachment and image claims it structurally cannot carry', () => {
  // `SharePayload.secrets` has no attachment or image field at all, so the content CANNOT travel.
  // The metadata used to travel anyway: the recipient got a file name, a size and an attribution
  // for a file that was never sent, matching `has:attachment` in search forever.
  const shared = shared0(shareableDetails(FULL, false));

  assert.equal(shared.attachmentFileName, undefined);
  assert.equal(shared.attachmentSize, undefined);
  assert.equal(shared.attachmentChangedBy, undefined, 'and no attribution for a file nobody sent');
  assert.equal(shared.imageFileName, undefined);
  assert.equal(shared.imageSize, undefined);
});

/** `shareableDetails` answers `undefined` only for `undefined` — every test here passes real metadata. */
function shared0(details: EntityMetadata | undefined): EntityMetadata {
  assert.ok(details !== undefined, 'metadata in, metadata out');
  return details;
}

test('a share still carries the TOTP claim when — and only when — the seed travels with it', () => {
  assert.equal(shared0(shareableDetails(FULL, true)).hasTotp, true, 'the seed is in the payload');
  assert.equal(shared0(shareableDetails(FULL, false)).hasTotp, undefined, 'the seed stayed behind');
});

test('a share keeps stripping what it always stripped', () => {
  const shared = shared0(
    shareableDetails({ ...FULL, notes: 'private', dependsOn: ['x'], mcp: 3 } as EntityMetadata, true),
  );
  assert.equal(shared.notes, undefined);
  assert.equal(shared.dependsOn, undefined);
  assert.equal(shared.mcp, undefined);
  assert.equal(shared.configKeyHash, undefined, 'the config key never travels');
});
