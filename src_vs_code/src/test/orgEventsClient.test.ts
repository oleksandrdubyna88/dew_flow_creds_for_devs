import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { CLIENT_CONTRACT_VERSION, CONTRACT_HEADER } from '../contractVersion';
import { OrgEventsClient } from '../orgEventsClient';
import { StoredAccount } from '../types';

/**
 * The event-log client against a stubbed `fetch`: what it sends, and what it concludes from each
 * answer. A page it cannot read must become a sentence here, never an undefined field in whatever
 * renders it; a server with no such route must read as an empty log rather than a failure.
 */

const account: StoredAccount = { accountId: 'acct-1', email: 'anna@corp.com', provider: 'microsoft' };

const ROW = {
  at: 1_725_400_000_000,
  kind: 'share.sent',
  actor: 'alice@corp.com',
  subject: 'anna@corp.com',
  project: null,
  shareId: '11111111-1111-1111-1111-111111111111',
  entityName: 'prod database',
  entityKind: 'db',
  outcome: null,
  detail: null,
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Seen {
  url: string;
  method: string;
  headers: Headers;
}

function respondWith(status: number, body: unknown): Seen[] {
  const seen: Seen[] = [];
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  globalThis.fetch = ((input: unknown, init: RequestInit = {}) => {
    seen.push({ url: String(input), method: init.method ?? 'GET', headers: new Headers(init.headers) });
    return Promise.resolve(new Response(text, { status }));
  }) as typeof fetch;
  return seen;
}

function client(): OrgEventsClient {
  return new OrgEventsClient('https://vault.corp.com/', async () => 'token', 5_000);
}

test('it asks the events route, with the bearer and the contract it speaks', async () => {
  const seen = respondWith(200, { items: [ROW], nextCursor: '2026-03-01:0' });

  const page = await client().readEvents(account, { kind: 'share.', limit: 2 });

  assert.equal(seen[0].url, 'https://vault.corp.com/api/org/events?kind=share.&limit=2');
  assert.equal(seen[0].method, 'GET');
  assert.equal(seen[0].headers.get('Authorization'), 'Bearer token');
  assert.equal(seen[0].headers.get(CONTRACT_HEADER), String(CLIENT_CONTRACT_VERSION));
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].entityName, 'prod database');
  assert.equal(page.nextCursor, '2026-03-01:0');
});

test('a page with no cursor is the end of the log', async () => {
  respondWith(200, { items: [ROW], nextCursor: null });

  assert.equal((await client().readEvents(account)).nextCursor, undefined);
});

test('an empty page WITH a cursor is not the end — the server bounds what one request scans', async () => {
  respondWith(200, { items: [], nextCursor: '2026-03-01:12' });

  const page = await client().readEvents(account);

  assert.deepEqual(page.items, []);
  assert.equal(page.nextCursor, '2026-03-01:12', 'a caller pages while the cursor is there, not while rows are');
});

test('a server too old to have the route reads as no log, not as a failure — and SAYS which', async () => {
  // The shape `readMe` and `listProjects` already use: a readiness cycle against an older server
  // must not report a failure about a feature that server does not have. But an empty history and
  // "this server keeps none" are different facts, and a viewer showing the first for the second
  // tells somebody their company's history is empty when it is merely unreachable.
  respondWith(404, 'Not Found');

  const page = await client().readEvents(account);

  assert.deepEqual(page.items, []);
  assert.equal(page.nextCursor, undefined);
  assert.equal(page.noLogHere, true);
});

test('a server that HAS the route and no rows is an ordinary empty page', async () => {
  respondWith(200, { items: [] });

  const page = await client().readEvents(account);

  assert.deepEqual(page.items, []);
  assert.equal(page.noLogHere, undefined, 'nothing happened yet is not the same as no log here');
});

test('a refusal carries the server\'s own sentence', async () => {
  respondWith(403, { error: 'This deployment does not let you administer its people.' });

  await assert.rejects(
    client().readEvents(account),
    /does not let you administer/,
  );
});

test('a page in a shape this build cannot read is a sentence at the edge', async () => {
  respondWith(200, { items: 'none' });

  await assert.rejects(client().readEvents(account), /shape this build cannot read/);
});

test('one unreadable row fails the page rather than being dropped from a history', async () => {
  respondWith(200, { items: [ROW, { kind: 'share.sent' }] });

  await assert.rejects(client().readEvents(account), /shape this build cannot read/);
});

test('a body that is not JSON at all is the same sentence, never a crash', async () => {
  respondWith(200, '<html>a proxy said something</html>');

  await assert.rejects(client().readEvents(account), /shape this build cannot read/);
});
