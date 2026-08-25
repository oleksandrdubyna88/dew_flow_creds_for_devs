import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startOnce } from '../idempotentStart';

/**
 * The failure this guards: the agent broker started its loopback server with `??=`, so a
 * single transient bind failure pinned a rejected promise and every later "Share with
 * Agent" re-awaited that same rejection — the feature stayed dead until a window reload.
 */

test('a successful start is shared by concurrent callers and not repeated', async () => {
  let calls = 0;
  const begin = startOnce<string>();
  const factory = async () => {
    calls += 1;
    return 'server';
  };

  const [a, b] = await Promise.all([begin(factory), begin(factory)]);

  assert.equal(a, 'server');
  assert.equal(b, 'server');
  assert.equal(calls, 1); // one bind, shared

  assert.equal(await begin(factory), 'server');
  assert.equal(calls, 1); // still cached after it resolved
});

test('a failed start is forgotten, so the next call retries instead of replaying it', async () => {
  let calls = 0;
  const begin = startOnce<string>();
  const factory = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error('EADDRINUSE: bind lost a race');
    }
    return 'server';
  };

  await assert.rejects(begin(factory), /EADDRINUSE/);

  // The bug was that this second call replayed the first rejection forever.
  assert.equal(await begin(factory), 'server');
  assert.equal(calls, 2);
});
