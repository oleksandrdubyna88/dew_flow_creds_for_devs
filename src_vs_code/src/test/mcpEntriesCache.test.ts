import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { CACHE_TTL_MS, McpEntriesCache } from '../mcpEntriesCache';
import type { McpEntry } from '../mcpEntries';

/**
 * The cache in front of the one route an agent can call in a loop.
 *
 * <p>Measured in the security pass on 2026-08-27: building the agent-visible list costs five
 * keychain reads per visible entry, so a vault with 200 opened is 1000 cross-process reads — most
 * of a second on the extension host thread. That route raises no prompt and is therefore not
 * throttled, which was the right call when the alias listing was the only unthrottled route and
 * cost nothing. It stopped being free when this one appeared.</p>
 *
 * <p>Two properties carry it, and only one of them is the obvious one. Reuse is the point; but
 * <b>forgetting must beat an in-flight build</b>, or a rebuild started before a write is stored as
 * current after it — the one way an event-invalidated cache still serves something that was never
 * true.</p>
 */

function entry(id: string): McpEntry {
  return {
    id,
    name: id,
    kind: 'ssh',
    folder: 'F',
    hasPassword: false,
    hasPrivateKey: false,
    hasNotes: false,
    hasTotp: false,
    dependsOn: [],
    can: { use: false, edit: false, create: false, delete: false },
  };
}

test('a second call inside the window costs no build at all', async () => {
  let builds = 0;
  const cache = new McpEntriesCache(() => {
    builds += 1;
    return Promise.resolve([entry('a')]);
  });

  await cache.entries();
  await cache.entries();
  await cache.entries();

  assert.equal(builds, 1);
});

test('two callers at the same moment share ONE build', async () => {
  // Two agents asking together used to mean two thousand keychain reads and two identical
  // answers.
  let builds = 0;
  let release = (): void => {};
  const cache = new McpEntriesCache(() => {
    builds += 1;
    return new Promise<readonly McpEntry[]>((resolve) => {
      release = () => resolve([entry('a')]);
    });
  });

  const both = Promise.all([cache.entries(), cache.entries()]);
  release();
  const [first, second] = await both;

  assert.equal(builds, 1);
  assert.deepEqual(first, second);
});

test('a change to the vault is felt on the very next call', async () => {
  let value = 'before';
  const cache = new McpEntriesCache(() => Promise.resolve([entry(value)]));

  await cache.entries();
  value = 'after';
  cache.forget();

  assert.equal((await cache.entries())[0].id, 'after');
});

test('forgetting beats a build that was already running', async () => {
  // The one way an event-invalidated cache can still serve something that was never true: a
  // rebuild that started before the write finishes after it and is stored as current.
  let builds = 0;
  let release = (): void => {};
  const cache = new McpEntriesCache(() => {
    builds += 1;
    const answer = builds === 1 ? 'stale' : 'fresh';
    return new Promise<readonly McpEntry[]>((resolve) => {
      const settle = (): void => resolve([entry(answer)]);
      if (builds === 1) {
        release = settle;
      } else {
        settle();
      }
    });
  });

  const inFlight = cache.entries();
  cache.forget();
  release();
  await inFlight;

  assert.equal((await cache.entries())[0].id, 'fresh', 'the pre-write build must not be kept');
});

test('the backstop is a bound on a mistake, not the mechanism', async () => {
  // Invalidation is by event. This only limits how long a write path that forgot to announce
  // itself can serve a stale answer.
  let builds = 0;
  let clock = 0;
  const cache = new McpEntriesCache(
    () => {
      builds += 1;
      return Promise.resolve([entry('a')]);
    },
    () => clock,
  );

  await cache.entries();
  clock += CACHE_TTL_MS - 1;
  await cache.entries();
  assert.equal(builds, 1, 'still inside the window');

  clock += 2;
  await cache.entries();
  assert.equal(builds, 2);
});

test('a build that throws is not remembered as an empty answer', async () => {
  // An empty list means "nothing is open to agents", which is a real state and a reassuring one.
  // Caching a failure as that would be a lie in the direction nobody checks.
  let attempt = 0;
  const cache = new McpEntriesCache(() => {
    attempt += 1;
    return attempt === 1 ? Promise.reject(new Error('keychain locked')) : Promise.resolve([entry('a')]);
  });

  await assert.rejects(() => cache.entries());
  assert.deepEqual((await cache.entries()).map((e) => e.id), ['a']);
});
