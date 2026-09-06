import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { OrgLoginKeyClient } from '../orgLoginKeyClient';
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

function answering(status: number, body: unknown, headers: Record<string, string> = {}): void {
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(body === undefined ? '' : JSON.stringify(body), { status, headers }),
    )) as typeof fetch;
}

const client = (): OrgLoginKeyClient =>
  new OrgLoginKeyClient('https://vault.example.com', () => Promise.resolve('a-token'), 5_000);

const key32 = Buffer.alloc(32, 7).toString('base64');

test('a key comes back with its fingerprint', async () => {
  answering(200, { loginKey: key32, fingerprint: '0123456789abcdef' });

  const outcome = await client().fetchLoginKey(account);

  assert.equal(outcome.kind, 'issued');
  assert.equal(outcome.kind === 'issued' && outcome.key.length, 32);
  assert.equal(outcome.kind === 'issued' && outcome.fingerprint, '0123456789abcdef');
});

test('no key for this account is NOT an error', async () => {
  // A member, or a developer whose server does not run the feature. Treating it as a failure would
  // make every sync cycle on an ordinary server report one.
  answering(404, { error: 'No login key has been issued for this account.' });

  assert.deepEqual(await client().fetchLoginKey(account), { kind: 'none' });
});

test('a deactivated account is its own outcome, not a network failure', async () => {
  // This is the moment the epic exists for: the caller must purge what it holds and lock, which it
  // can only do if this answer is distinguishable from "the server is down".
  answering(403, '', { 'X-Creds-Reason': 'account-deactivated' });

  assert.deepEqual(await client().fetchLoginKey(account), { kind: 'blocked' });
});

test('a 403 that is NOT about this account is unavailable, never blocked', async () => {
  // A domain refusal, or a proxy. Reading it as "blocked" would lock somebody out of their own
  // vault over a misconfigured gateway.
  answering(403, { error: 'Recipient is outside your domain.' });

  assert.equal((await client().fetchLoginKey(account)).kind, 'unavailable');
});

test('a 503 leaves everything as it was', async () => {
  answering(503, { error: 'no KEK configured' });

  const outcome = await client().fetchLoginKey(account);

  assert.equal(outcome.kind, 'unavailable');
  assert.match(outcome.kind === 'unavailable' ? outcome.why : '', /KEK|unavailable|503/i);
});

test('a shape this build cannot read is unavailable, never "no key"', async () => {
  // The distinction matters: "no key" tells the caller to leave the wraps alone AND lets a
  // developer's vault be written unbound. A client that cannot understand today's answer must not
  // act on a guess about it.
  answering(200, { loginKey: 42 });

  assert.equal((await client().fetchLoginKey(account)).kind, 'unavailable');
});

test('a key of the wrong size is refused on this side too', async () => {
  answering(200, { loginKey: Buffer.alloc(16, 1).toString('base64'), fingerprint: 'abc' });

  const outcome = await client().fetchLoginKey(account);

  assert.equal(outcome.kind, 'unavailable');
  assert.match(outcome.kind === 'unavailable' ? outcome.why : '', /size/);
});

test('an unreachable server is unavailable, with the reason kept', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;

  const outcome = await client().fetchLoginKey(account);

  assert.equal(outcome.kind, 'unavailable');
  assert.match(outcome.kind === 'unavailable' ? outcome.why : '', /unreachable|ECONNREFUSED/);
});
