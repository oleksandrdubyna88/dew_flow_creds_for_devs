import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ServerTransport } from '../serverTransport';
import { StoredAccount } from '../types';

const account: StoredAccount = {
  accountId: 'acct-1',
  email: 'alice@example.com',
  provider: 'microsoft',
};

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * A server that accepts the connection and then never answers.
 *
 * The keep-alive timer is load-bearing, and its absence is a real trap: a genuine `fetch`
 * holds an open socket, which keeps the event loop alive while the request is in flight,
 * whereas `AbortSignal.timeout()`'s own timer is deliberately **unref'd** and does not.
 * Without a ref'd handle here the loop drains before the timeout can fire and node:test
 * reports `Promise resolution is still pending but the event loop has already resolved` —
 * which passed on one machine and failed in CI.
 */
function installSilentServer(): void {
  globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const socketStandIn = setInterval(() => {}, 1_000);
      const signal = init?.signal;
      if (signal === undefined || signal === null) {
        // No ceiling: this hangs forever, which is exactly the bug under test. The
        // interval is left running on purpose so the hang is observable.
        return;
      }
      signal.addEventListener('abort', () => {
        clearInterval(socketStandIn);
        reject(signal.reason);
      });
    })) as typeof fetch;
}

test('a server that never answers fails the request instead of hanging forever', async () => {
  installSilentServer();
  const transport = new ServerTransport('https://vault.example.com', async () => 'token', 40);

  await assert.rejects(
    () => transport.readVault(account),
    /did not answer within/,
    'a request with no ceiling would leave this promise pending and the test would time out',
  );
});

test('the timeout message names the server so the operator knows which one is wedged', async () => {
  installSilentServer();
  const transport = new ServerTransport('https://vault.corp.example', async () => 'token', 40);

  await assert.rejects(() => transport.writeVault(account, 'ciphertext'), (error: Error) => {
    assert.match(error.message, /vault\.corp\.example/);
    return true;
  });
});

test('a connection failure is reported as unreachable, not as a timeout', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;
  const transport = new ServerTransport('https://vault.example.com', async () => 'token', 40);

  await assert.rejects(() => transport.readVault(account), /unreachable/);
});

test('a missing token is refused before any request is attempted', async () => {
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    return Promise.reject(new Error('should not be reached'));
  }) as unknown as typeof fetch;
  const transport = new ServerTransport('https://vault.example.com', async () => undefined);

  await assert.rejects(() => transport.readVault(account), /No usable microsoft token/);
  assert.equal(called, false);
});

// --- conditional writes -----------------------------------------------------
//
// Two of one person's machines syncing at once is ordinary. The server refuses a
// write whose precondition no longer holds; the transport's job is to SEND that
// precondition, and to report a refusal as something the sync cycle can act on
// rather than as a generic HTTP failure.

/** Records what the transport actually put on the wire. */
function recordingServer(responses: Array<{ status: number; body?: string; etag?: string }>) {
  const seen: Array<{ method: string; ifMatch: string | null }> = [];
  let i = 0;
  globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({ method: init?.method ?? 'GET', ifMatch: headers.get('If-Match') });
    const r = responses[Math.min(i++, responses.length - 1)];
    const out = new Headers();
    if (r.etag !== undefined) {
      out.set('ETag', r.etag);
    }
    // 204 and 304 are defined as bodiless; the Response constructor rejects a body
    // with either, even an empty string.
    const bodiless = r.status === 204 || r.status === 304;
    return Promise.resolve(
      new Response(bodiless ? null : (r.body ?? ''), { status: r.status, headers: out }),
    );
  }) as typeof fetch;
  return seen;
}

test('a write after a read carries the version that was read', async () => {
  const seen = recordingServer([
    { status: 200, body: 'ciphertext', etag: '"v1"' },
    { status: 204, etag: '"v2"' },
  ]);
  const transport = new ServerTransport('https://vault.example.com', async () => 'token');

  await transport.readVault(account);
  await transport.writeVault(account, 'new-ciphertext');

  assert.equal(seen[1].method, 'PUT');
  assert.equal(seen[1].ifMatch, '"v1"', 'without this the server cannot detect a stale write');
});

test('a first write, with nothing read, carries no precondition', async () => {
  const seen = recordingServer([{ status: 204 }]);
  const transport = new ServerTransport('https://vault.example.com', async () => 'token');

  await transport.writeVault(account, 'ciphertext');

  assert.equal(seen[0].ifMatch, null, 'a client with no version must not invent one');
});

test('a refused write is reported as a conflict the sync cycle can recognise', async () => {
  recordingServer([
    { status: 200, body: 'ciphertext', etag: '"v1"' },
    { status: 412 },
  ]);
  const transport = new ServerTransport('https://vault.example.com', async () => 'token');

  await transport.readVault(account);
  await assert.rejects(() => transport.writeVault(account, 'new'), (error: Error) => {
    assert.match(error.message, /changed on the server/i);
    return true;
  });
});

test('after a conflict the stale version is dropped, so the retry re-reads', async () => {
  const seen = recordingServer([
    { status: 200, body: 'ciphertext', etag: '"v1"' },
    { status: 412 },
    { status: 204 },
  ]);
  const transport = new ServerTransport('https://vault.example.com', async () => 'token');

  await transport.readVault(account);
  await assert.rejects(() => transport.writeVault(account, 'a'));
  await transport.writeVault(account, 'b');

  assert.equal(seen[2].ifMatch, null, 'holding on to a version the server rejected would deadlock the client');
});

test('a successful write adopts the version the server returned', async () => {
  const seen = recordingServer([
    { status: 200, body: 'ciphertext', etag: '"v1"' },
    { status: 204, etag: '"v2"' },
    { status: 204, etag: '"v3"' },
  ]);
  const transport = new ServerTransport('https://vault.example.com', async () => 'token');

  await transport.readVault(account);
  await transport.writeVault(account, 'a');
  await transport.writeVault(account, 'b');

  assert.equal(seen[2].ifMatch, '"v2"', 'the second write must build on the first, without re-reading');
});
