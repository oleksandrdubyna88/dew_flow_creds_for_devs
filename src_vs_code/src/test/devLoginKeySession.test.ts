import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LoginKeySession } from '../devLoginKeySession';
import { LoginKeyOutcome, OrgLoginKeyClient } from '../orgLoginKeyClient';
import { StoredAccount } from '../types';

const account: StoredAccount = { accountId: 'acct-1', email: 'alice@example.com', provider: 'microsoft' };

/** A client that answers what a test wants and counts how often it was asked. */
function clientAnswering(...outcomes: LoginKeyOutcome[]): { client: OrgLoginKeyClient; asked: () => number } {
  let asked = 0;
  const client = {
    location: 'https://vault.example.com',
    fetchLoginKey: () => {
      asked += 1;
      return Promise.resolve(outcomes[Math.min(asked - 1, outcomes.length - 1)]);
    },
  } as unknown as OrgLoginKeyClient;
  return { client, asked: () => asked };
}

const issued = (fingerprint = 'abc'): LoginKeyOutcome => ({
  kind: 'issued',
  key: Buffer.alloc(32, 3),
  fingerprint,
});

test('the key is fetched once and then held', async () => {
  const { client, asked } = clientAnswering(issued());
  const session = new LoginKeySession(() => client, () => undefined);

  const first = await session.resolve(account);
  const second = await session.resolve(account);

  assert.equal(first?.fingerprint, 'abc');
  assert.equal(second?.key.length, 32);
  assert.equal(asked(), 1, 'a held key is not re-fetched');
});

test('a held key is revalidated, so blocking reaches a window that is already open', async () => {
  // The code round's finding, and the one that decided whether this feature works at all: without a
  // bound on how long a cached key is trusted, an administrator blocking somebody has no effect
  // until they close VS Code — every later call is served from memory and the server is never asked.
  const { client, asked } = clientAnswering(issued(), { kind: 'blocked' });
  const locked: string[] = [];
  let now = 1_000;
  const session = new LoginKeySession(() => client, (a) => locked.push(a.email), undefined, () => now, 60_000);
  assert.notEqual(await session.resolve(account), undefined);

  now += 30_000;
  assert.notEqual(await session.resolve(account), undefined, 'still fresh: no second request');
  assert.equal(asked(), 1);

  now += 40_000;
  const after = await session.resolve(account);

  assert.equal(asked(), 2, 'past the horizon the server is asked again');
  assert.equal(after, undefined);
  assert.deepEqual(locked, ['alice@example.com'], 'and the blocked answer evicts and locks');
});

test('a server that cannot answer keeps the key it already had', async () => {
  // The other direction of the same knob: dropping a key over one flaky request would lock somebody
  // out of their own vault on a train.
  const { client } = clientAnswering(issued(), { kind: 'unavailable', why: 'ECONNREFUSED' });
  let now = 1_000;
  const session = new LoginKeySession(() => client, () => assert.fail('not blocked'), undefined, () => now, 10);
  const first = await session.resolve(account);

  now += 1_000;
  const second = await session.resolve(account);

  assert.deepEqual(second, first);
});

test('a blocked account drops the key AND tells the caller to lock', async () => {
  // Forgetting S alone would leave an already-unlocked session reading everything until the window
  // closed. The eviction is the point.
  const { client } = clientAnswering(issued(), { kind: 'blocked' });
  const locked: string[] = [];
  const session = new LoginKeySession(() => client, (a) => locked.push(a.email));
  await session.resolve(account);
  session.forget(account.accountId);

  const after = await session.resolve(account);

  assert.equal(after, undefined);
  assert.deepEqual(locked, ['alice@example.com']);
  assert.equal(session.current(account.accountId), undefined);
});

test('no key and an unreachable server both change nothing', async () => {
  const nothing = new LoginKeySession(() => clientAnswering({ kind: 'none' }).client, () => assert.fail('not blocked'));
  const down = new LoginKeySession(
    () => clientAnswering({ kind: 'unavailable', why: 'ECONNREFUSED' }).client,
    () => assert.fail('an unreachable server must never read as blocked'),
  );

  assert.equal(await nothing.resolve(account), undefined);
  assert.equal(await down.resolve(account), undefined);
});

test('an account with no corporate server is simply not asked', async () => {
  const session = new LoginKeySession(() => undefined, () => assert.fail('nothing to block'));

  assert.equal(await session.resolve(account), undefined);
});

test('forgetting zeroes the bytes it held', async () => {
  const { client } = clientAnswering(issued());
  const session = new LoginKeySession(() => client, () => undefined);
  const held = await session.resolve(account);

  session.forget(account.accountId);

  assert.ok(held !== undefined);
  assert.ok(held.key.every((b) => b === 0), 'the buffer this window handed out is wiped, not just dropped');
});
