import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';
import { loadWithVscode } from './vscodeStub';
import { encryptJsonWrapped } from '../cryptoUtils';
import { wrapWithPin } from '../keyWrap';
import type { StoredAccount } from '../types';

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

const ACCOUNT: StoredAccount = { accountId: 'acct-1', email: 'me@corp.com', provider: 'google' };
const PIN = 'correct horse battery staple';

/**
 * A `vscode.SecretStorage` backed by a Map.
 *
 * <p>Typed as the real interface rather than cast in at the call site: a cast there would let a
 * change to `SecretStorage` pass compilation and fail at runtime, which is the trap the TypeScript
 * rule names. The one `as never` that remains is on the event, which no test subscribes to.</p>
 */
function secretStorage(): vscode.SecretStorage {
  const stored = new Map<string, string>();
  return {
    get: (key: string): Thenable<string | undefined> => Promise.resolve(stored.get(key)),
    store: (key: string, value: string): Thenable<void> => {
      stored.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string): Thenable<void> => {
      stored.delete(key);
      return Promise.resolve();
    },
    onDidChange: (() => ({ dispose: (): void => undefined })) as never,
    keys: () => Promise.resolve([...stored.keys()]),
  } as vscode.SecretStorage;
}

/** `VaultKeys` holding one stored PIN, and a window onto the cache the refusal must leave empty. */
async function keysHolding(pin: string): Promise<{
  keys: InstanceType<typeof import('../vaultKeys').VaultKeys>;
  cache: Map<string, unknown>;
}> {
  const mod = loadWithVscode<typeof import('../vaultKeys')>('../vaultKeys', {
    window: { showWarningMessage: (): undefined => undefined, showErrorMessage: (): undefined => undefined },
    workspace: { getConfiguration: () => ({ get: <T>(_k: string, d: T): T => d }) },
  });
  const keys = new mod.VaultKeys(secretStorage());
  // Stored through the instance, because the key it files a PIN under is its own business.
  await (keys as unknown as { savePin(a: StoredAccount, p: string): Promise<void> }).savePin(ACCOUNT, pin);
  // The cache is private, and what this file asserts about is precisely that it stays empty. One
  // reach-in, named, rather than an exported accessor that exists only for a test.
  const cache = (keys as unknown as { cache: Map<string, unknown> }).cache;
  return { keys, cache };
}

/** A v4 vault openable by `PIN`, carrying a PIN wrap and a second wrap worth stripping. */
function vaultWithTwoWraps(): { content: string; master: Buffer } {
  const master = randomBytes(32);
  const pinWrap = wrapWithPin(master, ACCOUNT.accountId, PIN, Date.now());
  const decoy = { ...pinWrap, kind: 'recovery' as const, id: 'recovery' };
  return { content: encryptJsonWrapped({ nodes: [] }, master, [pinWrap, decoy]), master };
}

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

test('a security-key unlock refused as tampered does not leave a PIN behind either', async () => {
  // Raised by the review gate against the first version of this fix, which called `savePin` and
  // THEN verified — so a refused envelope still wrote to SecretStorage. "The refusal writes
  // nothing" has to include the things written on the way to it.
  const { keys, cache } = await keysHolding(PIN);
  const { content } = vaultWithTwoWraps();
  const env = JSON.parse(content) as Record<string, unknown>;
  delete env.mac;

  await assert.rejects(
    keys.unlock(ACCOUNT, JSON.stringify(env), { interactive: false }),
    (e: unknown) => (e as { kind?: string }).kind === 'tampered',
  );
  assert.equal(cache.size, 0, 'nothing cached');
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
