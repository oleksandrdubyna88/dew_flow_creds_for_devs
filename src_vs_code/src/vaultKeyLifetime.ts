import type { VaultKey } from './vaultKeys';

/**
 * The lifetime of a cached vault key — wiping it, and handing it out without aliasing.
 *
 * <p>Pure and `vscode`-free (it takes the key, it does not reach for storage), so the one
 * rule that matters here is a unit test rather than a hopeful comment.</p>
 */

/**
 * Overwrite a key's secret bytes.
 *
 * <p>A v1 key carries the PIN as an immutable string and cannot be wiped — that is the
 * whole reason a v2 key is a `Buffer` of the raw 32 bytes rather than its base64 text: a
 * Buffer can be zeroed, a string can only be abandoned to the collector.</p>
 */
export function wipeVaultKey(key: VaultKey): void {
  if (key.version === 2) {
    key.masterKey.fill(0);
  }
}

/**
 * A copy of the key a caller can hold across `await`s without the cache pulling the bytes
 * out from under it.
 *
 * <p><b>The bug this removes.</b> `unlock()` used to return the very `Buffer` the cache
 * holds, and `lock()`/`clearCache()` wipe that Buffer <i>in place</i>. So an auto-lock
 * firing while a sync cycle was mid-flight zeroed the master key that cycle was still
 * encrypting with — and AES-256-GCM / HKDF accept an all-zero key without complaint and
 * seal a syntactically valid, permanently undecryptable vault, which then gets pushed to
 * the shared sync location with no error at write time. Detaching the master key into the
 * caller's own copy breaks the aliasing; the copy is short-lived and is collected with the
 * operation, while the cached original is still what `lock()` zeroes.</p>
 */
export function detachVaultKey(key: VaultKey): VaultKey {
  return key.version === 1
    ? key
    : { version: 2, masterKey: Buffer.from(key.masterKey), wraps: key.wraps };
}
