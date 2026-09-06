import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { CLIENT_CONTRACT_VERSION, CONTRACT_HEADER } from '../contractVersion';
import {
  NO_ORG_POLICY,
  OrgMembersClient,
  isMemberListEntry,
  isMemberSelf,
  isOrgSettings,
} from '../orgMembersClient';
import { StoredAccount } from '../types';

/**
 * The corporate members client against a stubbed `fetch`. What matters is what the client
 * concludes from each answer: a shape it cannot read must become a sentence, never an undefined
 * field three layers later; a refusal must carry the server's own words, because the admin UI
 * has to show WHY; and a 426 must say "update the extension" in the words every other client uses.
 */

const account: StoredAccount = { accountId: 'acct-1', email: 'anna@corp.com', provider: 'microsoft' };

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

function record(seen: Seen[], input: unknown, init: RequestInit): void {
  seen.push({
    url: String(input),
    method: init.method ?? 'GET',
    headers: new Headers(init.headers),
    body: typeof init.body === 'string' ? init.body : undefined,
  });
}

function respondWith(status: number, body: unknown, seen: Seen[] = []): Seen[] {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  globalThis.fetch = ((input: unknown, init: RequestInit = {}) => {
    record(seen, input, init);
    return Promise.resolve(new Response(text, { status }));
  }) as typeof fetch;
  return seen;
}

function client(): OrgMembersClient {
  return new OrgMembersClient('https://vault.corp.com/', async () => 'token', 5_000);
}

const ME = {
  corpMode: true,
  email: 'anna@corp.com',
  role: 'admin',
  active: true,
  isOfficer: false,
  shareDefault: 'project',
  projects: [],
  pendingFolderRemovals: [],
  policy: { export: true, share: 'any', moveOutOfProject: true },
  offlineLeaseHours: 24,
  loginKeyVersion: 0,
  serverContract: 3,
};

const ROW = {
  email: 'boris@corp.com',
  role: 'dev',
  active: true,
  shareDefault: 'none',
  projectIds: ['p1'],
  isOfficer: false,
  updatedAt: 1,
  updatedBy: 'anna@corp.com',
};

const SETTINGS = { offlineLeaseHours: 12, updatedAt: 1, updatedBy: 'anna@corp.com' };

// ------------------------------------------------------------------------- the request

test('every request is authenticated and names the contract this build speaks', async () => {
  // The header is how a corp server refuses a client too old to read the policy — without it
  // the 426 floor cannot be applied and an old client is served a document it will ignore.
  const seen = respondWith(200, ME);

  await client().readMe(account);

  assert.equal(seen[0].url, 'https://vault.corp.com/api/org/me');
  assert.equal(seen[0].headers.get('Authorization'), 'Bearer token');
  assert.equal(seen[0].headers.get(CONTRACT_HEADER), String(CLIENT_CONTRACT_VERSION));
  assert.equal(seen[0].headers.get('Content-Type'), null, 'no body, no content type');
});

test('a write sends JSON and says so', async () => {
  const seen = respondWith(200, ROW);

  await client().setMember(account, 'Boris@corp.com', { role: 'dev', shareDefault: 'none' });

  assert.equal(seen[0].method, 'PUT');
  assert.equal(seen[0].url, 'https://vault.corp.com/api/org/members/Boris%40corp.com');
  assert.equal(seen[0].headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(seen[0].body ?? '{}'), { role: 'dev', shareDefault: 'none' });
});

test('a field the admin did not change is not sent, so the server leaves it alone', async () => {
  // The upsert reads a null field as "keep"; a client that sent `shareDefault: undefined` as a
  // string would be refused, and one that sent the old value would log a change that never was.
  const seen = respondWith(200, ROW);

  await client().setMember(account, 'boris@corp.com', { role: 'member' });

  assert.deepEqual(JSON.parse(seen[0].body ?? '{}'), { role: 'member' });
});

test('an unreachable server names itself in the failure', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch;

  await assert.rejects(() => client().readMe(account), /vault\.corp\.com/);
});

// ------------------------------------------------------------------------- the shapes

test('the policy document comes back parsed', async () => {
  respondWith(200, ME);

  const me = await client().readMe(account);

  assert.equal(me.role, 'admin');
  assert.equal(me.offlineLeaseHours, 24);
  assert.deepEqual(me.policy, ME.policy);
});

test('a document in a shape this build cannot read is a sentence, never a guess', async () => {
  // Half-parsing it would produce a role decision from fields that are not there.
  respondWith(200, { corpMode: true, role: 'admin' });

  await assert.rejects(() => client().readMe(account), /shape this build cannot read/);
});

test('a malformed policy inside an otherwise sound document is NOT a rejection', () => {
  // corpPolicy owns what a bad policy means (the most restrictive shape). Refusing the whole
  // document here would make the fetch "fail", and a failed fetch keeps the PREVIOUS answer —
  // so the restrictive fallback could never be reached.
  assert.equal(isMemberSelf({ ...ME, policy: 'nonsense' }), true);
  assert.equal(isMemberSelf({ ...ME, policy: undefined }), true);
  assert.equal(isMemberSelf({ ...ME, role: 7 }), false, 'but the role must be a string');
  assert.equal(isMemberSelf({ ...ME, isOfficer: 'yes' }), false, 'and isOfficer a boolean');
  assert.equal(isMemberSelf({ ...ME, offlineLeaseHours: '24' }), false);
});

test('a server too old to know the endpoint means "no corporate roles here", not a failure', async () => {
  // Every readiness cycle against a pre-3 server would otherwise report an error about a
  // feature it does not have. The answer mirrors what a corp-off server itself says.
  respondWith(404, '');

  const me = await client().readMe(account);

  assert.equal(me, NO_ORG_POLICY);
  assert.equal(me.corpMode, false);
  assert.deepEqual(me.policy, { export: true, share: 'any', moveOutOfProject: true });
});

test('the roster comes back as rows, and one row this build cannot read fails the whole list', async () => {
  // A roster with a person silently missing is worse than no roster: the admin would read the
  // list as complete and never look for them.
  respondWith(200, [ROW, { ...ROW, email: 'clara@corp.com' }]);
  const rows = await client().listMembers(account);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].email, 'clara@corp.com');

  respondWith(200, [ROW, { email: 'broken' }]);
  await assert.rejects(() => client().listMembers(account), /shape this build cannot read/);

  respondWith(200, { rows: [ROW] });
  await assert.rejects(() => client().listMembers(account), /shape this build cannot read/);
});

test('the row guard checks what an admin UI draws a line from', () => {
  assert.equal(isMemberListEntry(ROW), true);
  assert.equal(isMemberListEntry({ ...ROW, projectIds: 'p1' }), false);
  assert.equal(isMemberListEntry({ ...ROW, isOfficer: undefined }), false);
  assert.equal(isOrgSettings(SETTINGS), true);
  assert.equal(isOrgSettings({ offlineLeaseHours: '12' }), false);
});

test('settings are read and written through the same guard', async () => {
  respondWith(200, SETTINGS);
  assert.equal((await client().readSettings(account)).offlineLeaseHours, 12);

  const seen = respondWith(200, { ...SETTINGS, offlineLeaseHours: 0 });
  const written = await client().writeSettings(account, 0);
  assert.equal(seen[0].method, 'PUT');
  assert.deepEqual(JSON.parse(seen[0].body ?? '{}'), { offlineLeaseHours: 0 }, '0 is the legal strictly-online and must travel');
  assert.equal(written.offlineLeaseHours, 0);
});

// ------------------------------------------------------------------------- the refusals

test('a 426 is surfaced as the shared too-old sentence, quoting the server', async () => {
  // The corp floor: a server with a roster refuses a client below contract 3. The words are the
  // ones every other client uses, so a person sees one message however they hit the floor.
  respondWith(426, { error: 'This server has a corporate roster and needs contract 3.' });

  await assert.rejects(
    () => client().readMe(account),
    (error: Error) =>
      /no longer serves this version of CredsForDevs/.test(error.message) &&
      /Update the extension/.test(error.message) &&
      /corporate roster and needs contract 3/.test(error.message),
  );
});

test('a 409 carries the server’s own sentence — a bare status cannot say "that person is an officer"', async () => {
  respondWith(409, {
    error: 'That address is a recovery officer, which is configuration rather than a role.',
  });

  await assert.rejects(
    () => client().setMember(account, 'cto@example.com', { role: 'member' }),
    { message: 'That address is a recovery officer, which is configuration rather than a role.' },
  );
});

test('a 503 carries the server’s own sentence, so the admin is told to repair the record', async () => {
  respondWith(503, {
    error: 'That membership record cannot be read by this server. An administrator must repair it.',
  });

  await assert.rejects(
    () => client().setMember(account, 'alice@example.com', { role: 'dev' }),
    { message: 'That membership record cannot be read by this server. An administrator must repair it.' },
  );
});

test('a 403 carries the server’s own {error} sentence, not a bare status', async () => {
  respondWith(403, { error: 'Not an administrator of this server.' });

  // The whole message, exactly — nothing prefixed, nothing appended, so the toast shows the sentence.
  await assert.rejects(() => client().listMembers(account), { message: 'Not an administrator of this server.' });
});

test('a 409 on a role change says why in the server’s words — an officer cannot be given a role', async () => {
  respondWith(409, { error: 'cto@corp.com is a recovery officer; the roster is configuration.' });

  await assert.rejects(
    () => client().setMember(account, 'cto@corp.com', { role: 'dev' }),
    /is a recovery officer; the roster is configuration/,
  );
});

test('a 503 — a record the server cannot read — reaches the person as the server said it', async () => {
  respondWith(503, { error: 'Your registry record cannot be read; an administrator must repair it.' });

  await assert.rejects(() => client().readMe(account), /administrator must repair it/);
});

test('a refusal with no JSON body falls back to the status, so nothing is ever silent', async () => {
  respondWith(500, '');

  await assert.rejects(() => client().readSettings(account), /HTTP 500/);
});
