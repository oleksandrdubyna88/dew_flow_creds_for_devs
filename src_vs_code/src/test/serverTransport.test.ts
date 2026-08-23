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
