import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClientConfigCache, resolveMicrosoftScope } from '../clientConfig';

/**
 * The goal this serves, in the operator's words: a developer signs in, points at
 * the server, and is done. No settings.json, no pasted scope, nothing to run.
 *
 * So the discovery step has to be invisible when it works and harmless when it
 * does not — a server that never answers must leave sign-in exactly where it was,
 * not break it.
 */

function fetcher(responses: Record<string, { ok: boolean; body?: unknown }>) {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url: string) => {
      calls.push(url);
      const hit = responses[url];
      if (hit === undefined) {
        throw new Error('unreachable');
      }
      return { ok: hit.ok, json: async () => hit.body };
    },
  };
}

test('the scope the server advertises is used, so nobody configures anything', async () => {
  const f = fetcher({
    'https://vault.corp.com/api/client-config': {
      ok: true,
      body: { microsoftScope: 'api://abc/vault.access' },
    },
  });
  const cache = new ClientConfigCache(f.fetch);

  const config = await cache.forLocation('https://vault.corp.com');

  assert.equal(config?.microsoftScope, 'api://abc/vault.access');
});

test('a trailing slash on the location does not produce a double slash', async () => {
  const f = fetcher({
    'https://vault.corp.com/api/client-config': { ok: true, body: { microsoftScope: 's' } },
  });

  await new ClientConfigCache(f.fetch).forLocation('https://vault.corp.com/');

  assert.deepEqual(f.calls, ['https://vault.corp.com/api/client-config']);
});

test('a server that cannot answer leaves the caller exactly where it was', async () => {
  // An older server has no such endpoint. Breaking sign-in over a discovery step
  // would be a worse failure than the one this feature exists to fix.
  const f = fetcher({});
  const cache = new ClientConfigCache(f.fetch);

  assert.equal(await cache.forLocation('https://old.corp.com'), undefined);
});

test('a 404 and an empty scope are both "nothing to offer", not an error', async () => {
  const f = fetcher({
    'https://a/api/client-config': { ok: false },
    'https://b/api/client-config': { ok: true, body: { microsoftScope: '   ' } },
  });
  const cache = new ClientConfigCache(f.fetch);

  assert.equal(await cache.forLocation('https://a'), undefined);
  assert.equal(await cache.forLocation('https://b'), undefined);
});

test('the answer is cached, including the negative one', async () => {
  // A server that does not publish this will not start mid-session, and a round
  // trip on every sync is added to the path that is already the slow one.
  const f = fetcher({});
  const cache = new ClientConfigCache(f.fetch);

  await cache.forLocation('https://old.corp.com');
  await cache.forLocation('https://old.corp.com');

  assert.equal(f.calls.length, 1);
});

test('forgetting a location makes it ask again — for when the server is reconfigured', async () => {
  const f = fetcher({ 'https://v/api/client-config': { ok: true, body: { microsoftScope: 's' } } });
  const cache = new ClientConfigCache(f.fetch);

  await cache.forLocation('https://v');
  cache.forget('https://v');
  await cache.forLocation('https://v');

  assert.equal(f.calls.length, 2);
});

test('an explicit setting beats what the server advertises', () => {
  // The escape hatch for a server advertising the wrong value — and a person who
  // typed something should never be silently overridden by a machine.
  assert.equal(resolveMicrosoftScope('api://mine/x', 'api://theirs/y'), 'api://mine/x');
  assert.equal(resolveMicrosoftScope('  ', 'api://theirs/y'), 'api://theirs/y');
  assert.equal(resolveMicrosoftScope(undefined, 'api://theirs/y'), 'api://theirs/y');
  assert.equal(resolveMicrosoftScope(undefined, undefined), '');
});
