import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCOUNT, PIN, keysHolding, vaultWithTwoWraps } from './vaultKeysWorld';

/**
 * A tampered vault is refused BEFORE its key and its wrap list are cached (audit 2026-09-09, #2).
 *
 * <p>This is the half of the fix that `verifyEnvelopeMac` alone does not give, and the half that was
 * missing for longest. The check already existed — `syncManager` ran it — and it ran <b>after</b>
 * `VaultKeys.unlock` had cached the key together with whatever wraps the file carried. By the time
 * the tamper was detected it was already trusted, and the next save re-signed the shortened list
 * into a file that verifies. So the order is the property, and it needs its own test: written
 * against the code with the verification removed from `remember`, the whole envelope-MAC suite and
 * the whole sync suite stayed green.</p>
 *
 * <p>`VaultKeys` imports `vscode`, so it is loaded through the stub. Only `secrets` is needed: the
 * silent-PIN route reads the stored PIN and unwraps without asking anybody anything, which is also
 * the route background sync takes.</p>
 */

test('an intact vault unlocks and IS cached', async () => {
  const { keys, cache } = await keysHolding(PIN);
  const { content } = vaultWithTwoWraps();

  const key = await keys.unlock(ACCOUNT, content, { interactive: false });

  assert.notEqual(key, undefined, 'the ordinary case still works');
  assert.equal(cache.size, 1, 'and the key is remembered');
});

test('a vault whose MAC was stripped along with a wrap is refused, and NOTHING is cached', async () => {
  // The audit's downgrade, arriving by the route background sync uses. Before the fix this
  // returned a key and left the shortened wrap list in the cache, where the next save would have
  // re-signed it into a file that verifies — which is how a detected tamper heals itself.
  const { keys, cache } = await keysHolding(PIN);
  const { content } = vaultWithTwoWraps();
  const env = JSON.parse(content) as Record<string, unknown>;
  const wraps = env.wraps as unknown[];
  delete env.mac;
  env.wraps = [wraps[0]]; // the recovery wrap removed

  await assert.rejects(
    keys.unlock(ACCOUNT, JSON.stringify(env), { interactive: false }),
    (e: unknown) => (e as { kind?: string }).kind === 'tampered',
  );
  assert.equal(cache.size, 0, 'a refused vault leaves no key and no wrap list behind');
});

test('a TYPED PIN on a tampered vault is refused, and the PIN is not stored', async () => {
  // Raised by the review gate against the first version of this fix, which called `savePin` and
  // THEN verified — so a refused envelope still wrote to SecretStorage. "The refusal writes
  // nothing" has to include what is written on the way to it.
  //
  // This machine has NO stored PIN, so the silent route cannot run and `unlock` reaches the
  // interactive prompt — which is the route that persists. The first version of this test asserted
  // only that the cache was empty while calling itself a test about the PIN; it would have passed
  // against the defect it names.
  const { keys, cache, stored } = await keysHolding(undefined, PIN);
  const { content } = vaultWithTwoWraps();
  const env = JSON.parse(content) as Record<string, unknown>;
  delete env.mac;

  await assert.rejects(
    keys.unlock(ACCOUNT, JSON.stringify(env), { interactive: true }),
    (e: unknown) => (e as { kind?: string }).kind === 'tampered',
  );
  assert.equal(cache.size, 0, 'nothing cached');
  assert.deepEqual([...stored.values()], [], 'and nothing written to SecretStorage');
});

test('a WARM CACHE does not excuse a file that changed underneath it', async () => {
  // The cache holds a key, not a verdict about the file — and the file can change under it. One
  // legitimate unlock, a tamper at the sync location, and every later caller was being handed the
  // cached key for a file nobody re-checked. Raised by the review gate: the same order defect as
  // the original finding, one level up.
  const { keys, cache } = await keysHolding(PIN);
  const { content } = vaultWithTwoWraps();

  assert.notEqual(await keys.unlock(ACCOUNT, content, { interactive: false }), undefined);
  assert.equal(cache.size, 1, 'warm');

  const env = JSON.parse(content) as Record<string, unknown>;
  env.wraps = [(env.wraps as unknown[])[0]];
  delete env.mac;

  await assert.rejects(
    keys.unlock(ACCOUNT, JSON.stringify(env), { interactive: false }),
    (e: unknown) => (e as { kind?: string }).kind === 'tampered',
    'a cache hit is still a file that has to verify',
  );
});

test('a wrap removed with the MAC left in place is refused too — and still caches nothing', async () => {
  const { keys, cache } = await keysHolding(PIN);
  const { content } = vaultWithTwoWraps();
  const env = JSON.parse(content) as Record<string, unknown>;
  env.wraps = [(env.wraps as unknown[])[0]];

  await assert.rejects(
    keys.unlock(ACCOUNT, JSON.stringify(env), { interactive: false }),
    (e: unknown) => (e as { kind?: string }).kind === 'tampered',
  );
  assert.equal(cache.size, 0);
});
