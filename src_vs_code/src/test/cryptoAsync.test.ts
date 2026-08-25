import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decryptJson,
  decryptJsonAsync,
  decryptJsonWithMasterKey,
  encryptJson,
  openBlob,
  openBlobAsync,
  sealBlob,
  sealBlobAsync,
} from '../cryptoUtils';
import {
  unwrapWithPin,
  unwrapWithPinAsync,
  wrapPinVaultAsync,
  wrapWithPin,
  wrapWithPinAsync,
} from '../keyWrap';

/**
 * The async KDF path is the same format, not a second one.
 *
 * <p>`scryptSync` at N=2^17 held the extension host for about a second at every unlock and
 * every PIN change. The async twins move that onto the libuv pool. What these tests pin is the
 * only thing that could go wrong: that a blob sealed one way opens the other way, byte for
 * byte, with the same errors — because a vault written by the async path has to open on a
 * machine still running the sync one, and the other way round.</p>
 */

const PIN = 'correct horse battery staple';

test('a blob sealed async opens sync, and one sealed sync opens async', async () => {
  const payload = { hello: 'world', n: 42 };

  const viaAsync = await sealBlobAsync(payload, PIN);
  assert.deepEqual(openBlob(viaAsync, PIN), payload, 'async-sealed, sync-opened');

  const viaSync = sealBlob(payload, PIN);
  assert.deepEqual(await openBlobAsync(viaSync, PIN), payload, 'sync-sealed, async-opened');
});

test('both paths record the same KDF parameters', async () => {
  const a = sealBlob('x', PIN);
  const b = await sealBlobAsync('x', PIN);
  assert.equal(a.kdfN, b.kdfN);
  assert.equal(a.kdfR, b.kdfR);
  assert.equal(a.kdfP, b.kdfP);
});

test('the async open fails the same way on a wrong PIN', async () => {
  const blob = await sealBlobAsync('secret', PIN);
  await assert.rejects(openBlobAsync(blob, 'wrong'), (e: unknown) =>
    (e as { kind?: string }).kind === 'wrong-password',
  );
  assert.throws(() => openBlob(blob, 'wrong'), (e: unknown) => (e as { kind?: string }).kind === 'wrong-password');
});

test('the async open refuses a malformed blob before deriving anything', async () => {
  const blob = { ...(await sealBlobAsync('secret', PIN)), iv: 'AAAA' };
  await assert.rejects(openBlobAsync(blob, PIN), (e: unknown) => (e as { kind?: string }).kind === 'corrupted');
});

test('a PIN wrap made async unwraps sync, and the reverse', async () => {
  const master = Buffer.alloc(32, 7);

  const asyncWrap = await wrapWithPinAsync(master, 'acct', PIN, 1);
  assert.deepEqual(unwrapWithPin(asyncWrap, 'acct', PIN), master);

  const syncWrap = wrapWithPin(master, 'acct', PIN, 1);
  assert.deepEqual(await unwrapWithPinAsync(syncWrap, 'acct', PIN), master);
});

test('a v3 vault built async is a normal v3 vault', async () => {
  const payload = { nodes: [{ id: 'n1' }] };
  const init = await wrapPinVaultAsync(payload, 'acct', PIN, 1);

  assert.equal(init.wraps.length, 1);
  assert.equal(init.wraps[0].kind, 'pin');
  const master = await unwrapWithPinAsync(init.wraps[0], 'acct', PIN);
  assert.deepEqual(master, init.masterKey);
  assert.deepEqual(decryptJsonWithMasterKey(init.content, master), payload);
});

test('a legacy v1 envelope opens through the async reader too', async () => {
  const content = encryptJson({ legacy: true }, 'acct' + PIN);
  assert.deepEqual(await decryptJsonAsync(content, 'acct' + PIN), { legacy: true });
  assert.deepEqual(decryptJson(content, 'acct' + PIN), { legacy: true });
});
