import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { NO_ORG_RECOVERY, OrgRecoveryClient } from '../orgRecoveryClient';
import { StoredAccount } from '../types';

/**
 * The corporate-recovery half of the server API, against a stubbed `fetch`. What matters here
 * is not the happy path — it is what the client concludes from each refusal, because those
 * conclusions are what decide whether a vault enrols.
 */

const account: StoredAccount = {
  accountId: 'acct-1',
  email: 'alice@example.com',
  provider: 'microsoft',
};

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Seen {
  url: string;
  method: string;
  headers: Headers;
  body?: string;
}

/**
 * 204/205/304 forbid a body — the Response constructor throws rather than ignoring one, which
 * is a detail a stub has to honour or it tests a request that never happened.
 */
const BODYLESS = new Set([204, 205, 304]);

function bodyFor(status: number, body: unknown): string | null {
  if (BODYLESS.has(status)) {
    return null;
  }
  return typeof body === 'string' ? body : JSON.stringify(body);
}

function record(seen: Seen[], input: unknown, init: RequestInit): void {
  const body = init.body;
  seen.push({
    url: String(input),
    method: init.method === undefined ? 'GET' : init.method,
    headers: new Headers(init.headers),
    body: typeof body === 'string' ? body : undefined,
  });
}

function respondWith(status: number, body: unknown, seen: Seen[] = []): Seen[] {
  globalThis.fetch = ((input: unknown, init: RequestInit = {}) => {
    record(seen, input, init);
    return Promise.resolve(new Response(bodyFor(status, body), { status }));
  }) as typeof fetch;
  return seen;
}

function client(): OrgRecoveryClient {
  return new OrgRecoveryClient('https://vault.example.com/', async () => 'token', 5_000);
}

const CONFIG = {
  enabled: true,
  officerEmails: ['cto@example.com', 'lead@example.com', 'devops@example.com'],
  threshold: 2,
  setupComplete: true,
  orgPublicKey: 'AAAA',
  orgPublicKeyFingerprint: 'FFFF',
  rosterFingerprint: 'ros',
  publishedAt: 1,
};

test('the config comes back parsed, and the request is authenticated', async () => {
  const seen = respondWith(200, CONFIG);

  const config = await client().readConfig(account);

  assert.equal(config.enabled, true);
  assert.equal(config.threshold, 2);
  assert.equal(seen[0].url, 'https://vault.example.com/api/org-recovery/config');
  assert.equal(seen[0].headers.get('Authorization'), 'Bearer token');
});

test('a server too old to know the endpoint means "no corporate recovery here", not a failure', async () => {
  // Every sync against an older server would otherwise report an error about a feature
  // nobody asked for — and a 404 says exactly what an unconfigured roster says.
  respondWith(404, '');

  assert.deepEqual(await client().readConfig(account), NO_ORG_RECOVERY);
});

test('a config in a shape this build cannot read is an error, never a guess', async () => {
  // Half-parsing it would produce an enrolment decision from fields that are not there.
  respondWith(200, { enabled: true });

  await assert.rejects(() => client().readConfig(account), /shape this build cannot read/);
});

test('an unreachable server names itself in the failure', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch;

  await assert.rejects(() => client().readConfig(account), /vault\.example\.com/);
});

test('a non-officer listing invites gets an empty inbox rather than an error', async () => {
  // 403 here is the correct answer for somebody not on the roster, and an empty inbox is
  // exactly what a non-officer's inbox looks like. Reporting it would put a red message in
  // front of every ordinary user on a server with corporate recovery on.
  respondWith(403, 'not an officer');

  assert.deepEqual(await client().listInvites(account), []);
});

test('invites that do not parse are dropped, and the rest survive', async () => {
  const good = {
    id: 'i1',
    setupId: 's1',
    fromEmail: 'cto@example.com',
    toEmail: 'lead@example.com',
    shareIndex: 2,
    threshold: 2,
    totalShares: 3,
    createdAt: 1,
    salt: 'a',
    iv: 'b',
    tag: 'c',
    data: 'd',
  };
  respondWith(200, [good, { id: 'broken' }]);

  const invites = await client().listInvites(account);

  assert.equal(invites.length, 1);
  assert.equal(invites[0].id, 'i1');
});

test('sending an invite POSTs JSON and reports the server’s own words on refusal', async () => {
  const seen = respondWith(201, '');
  await client().sendInvite(account, { setupId: 's1', toEmail: 'lead@example.com' });
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].headers.get('Content-Type'), 'application/json');
  assert.match(seen[0].body ?? '', /lead@example\.com/);

  respondWith(403, 'That recipient is not a recovery officer.');
  await assert.rejects(
    () => client().sendInvite(account, { setupId: 's1', toEmail: 'stranger@example.com' }),
    /not a recovery officer/,
  );
});

test('acknowledging is true only on 204 — anything else must not look stored', async () => {
  // The ack means "the share is durably in my vault". A client that reported success on a
  // 404 would let the initiator publish a key whose quorum cannot be assembled.
  respondWith(204, '');
  assert.equal(await client().acknowledgeInvite(account, 'i1'), true);
  respondWith(404, '');
  assert.equal(await client().acknowledgeInvite(account, 'i1'), false);
});

test('publishing returns the refusal text rather than throwing it away', async () => {
  // The two refusals mean different things to the person running the ceremony, and only the
  // server knows which one happened.
  respondWith(200, '');
  assert.deepEqual(
    await client().publishSetup(account, 's1', 'AAAA', 'ros'),
    { ok: true },
  );

  respondWith(409, '2 officer(s) have not acknowledged their share yet.');
  const refused = await client().publishSetup(account, 's1', 'AAAA', 'ros');

  assert.equal(refused.ok, false);
  assert.match((refused as { reason: string }).reason, /have not acknowledged/);
});
