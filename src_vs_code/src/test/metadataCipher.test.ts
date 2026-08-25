import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MetadataError,
  isSealedMetadata,
  newMetadataKey,
  openMetadata,
  sealMetadata,
} from '../metadataCipher';

/**
 * The node tree used to sit in `globalState` in the clear — hosts, users, CLI arguments, the
 * names of bound env variables — a topology map for anyone who could read the profile folder.
 * These pin what sealing it has to guarantee: round-trip, refusal under the wrong key, refusal
 * when a blob is moved between accounts' slots (AAD), and detection of tampering.
 */

const SLOT = 'credSshManager.nodes.acct-1';

test('what goes in comes out, under the same key and slot', () => {
  const key = newMetadataKey();
  const tree = [{ id: 'n1', name: 'prod api', host: 'api.example.com', user: 'deploy' }];
  const sealed = sealMetadata(tree, key, SLOT);

  assert.deepEqual(openMetadata(sealed, key, SLOT), tree);
  assert.ok(isSealedMetadata(sealed));
});

test('the sealed form carries none of the plaintext', () => {
  const sealed = sealMetadata({ host: 'api.example.com', user: 'deploy' }, newMetadataKey(), SLOT);
  const onDisk = JSON.stringify(sealed);
  assert.equal(onDisk.includes('api.example.com'), false);
  assert.equal(onDisk.includes('deploy'), false);
});

test('a different device key does not open it', () => {
  const sealed = sealMetadata(['x'], newMetadataKey(), SLOT);
  assert.throws(() => openMetadata(sealed, newMetadataKey(), SLOT), (e: unknown) => (e as MetadataError).kind === 'wrong-key');
});

test('a blob moved to another account slot does not open there', () => {
  // AAD is the slot name: the same key, the same bytes, a different slot — refused, so one
  // account's tree can never be presented as another's.
  const key = newMetadataKey();
  const sealed = sealMetadata(['x'], key, SLOT);
  assert.throws(
    () => openMetadata(sealed, key, 'credSshManager.nodes.acct-2'),
    (e: unknown) => (e as MetadataError).kind === 'wrong-key',
  );
});

test('a flipped byte in the ciphertext is refused, not decoded into garbage', () => {
  const key = newMetadataKey();
  const sealed = sealMetadata({ n: 1 }, key, SLOT);
  const bytes = Buffer.from(sealed.data, 'base64');
  bytes[0] ^= 0xff;
  assert.throws(
    () => openMetadata({ ...sealed, data: bytes.toString('base64') }, key, SLOT),
    (e: unknown) => (e as MetadataError).kind === 'wrong-key',
  );
});

test('each seal uses a fresh IV, so equal trees never produce equal ciphertext', () => {
  const key = newMetadataKey();
  const a = sealMetadata(['same'], key, SLOT);
  const b = sealMetadata(['same'], key, SLOT);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
});

test('isSealedMetadata tells a sealed blob from the legacy plaintext array', () => {
  assert.equal(isSealedMetadata([{ id: 'n1' }]), false, 'a plain array is the pre-0.57 format');
  assert.equal(isSealedMetadata({ v: 1, iv: 'a', tag: 'b', data: 'c' }), true);
  assert.equal(isSealedMetadata({ v: 2, iv: 'a', tag: 'b', data: 'c' }), false, 'an unknown version is not this format');
  assert.equal(isSealedMetadata(undefined), false);
});

test('a malformed key or IV is corrupted, never silently accepted', () => {
  const sealed = sealMetadata(['x'], newMetadataKey(), SLOT);
  assert.throws(() => openMetadata(sealed, Buffer.alloc(16), SLOT), (e: unknown) => (e as MetadataError).kind === 'corrupted');
  assert.throws(() => openMetadata({ ...sealed, iv: 'AAAA' }, newMetadataKey(), SLOT), (e: unknown) => (e as MetadataError).kind === 'corrupted');
  assert.throws(() => sealMetadata(['x'], Buffer.alloc(8), SLOT), (e: unknown) => (e as MetadataError).kind === 'corrupted');
});
