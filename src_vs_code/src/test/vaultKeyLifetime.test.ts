import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detachVaultKey, wipeVaultKey } from '../vaultKeyLifetime';

/**
 * The field failure this guards against: with auto-sync on, the 60-second auto-lock tick
 * fired while a sync cycle was between its `unlock()` and its `encrypt()`, wiped the cached
 * master key in place, and — because AES-GCM/HKDF never reject an all-zero key — the cycle
 * sealed a vault nobody could ever open and pushed it to the shared location, silently.
 */

test('a detached key survives the cached key being wiped mid-use', () => {
  const cached = {
    version: 2 as const,
    masterKey: Buffer.from('0123456789abcdef0123456789abcdef'),
    wraps: [],
  };
  const inUse = detachVaultKey(cached); // what unlock() hands a sync cycle

  wipeVaultKey(cached); // what the auto-lock tick does to the cache, mid-cycle

  assert.equal(
    cached.masterKey.every((b) => b === 0),
    true,
    'the cached key IS wiped — locking must still forget it',
  );
  assert.equal(
    inUse.version === 2 && inUse.masterKey.toString(),
    '0123456789abcdef0123456789abcdef',
    'the in-flight copy is intact — the cycle encrypts with real bytes, not zeros',
  );
});

test('detaching a v2 key does not alias the cached buffer', () => {
  const cached = { version: 2 as const, masterKey: Buffer.from('k'.repeat(32)), wraps: [] };
  const copy = detachVaultKey(cached);
  assert.equal(copy.version === 2 && copy.masterKey === cached.masterKey, false);
});

test('a v1 key has no wipeable bytes and is passed through unchanged', () => {
  const k = { version: 1 as const, passphrase: 'acct-pin', pin: 'pin' };
  assert.equal(detachVaultKey(k), k);
  wipeVaultKey(k); // must not throw; there is nothing to zero
  assert.equal(k.passphrase, 'acct-pin');
});
