import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  EVENT_QUERY_PARAMS,
  ORG_EVENTS_PATH,
  eventQueryPath,
  isOrgEvent,
  isOrgEventPage,
  pageOf,
} from '../eventQuery';

/**
 * The query string this client sends, the page it will accept back, and — the part neither of
 * those can prove on its own — that the two words it uses for an outcome are the two the SERVER
 * maps to `share.accepted` and `share.declined`.
 */

const ROW = {
  at: 1_725_400_000_000,
  kind: 'share.sent',
  actor: 'alice@corp.com',
  subject: 'bob@corp.com',
  project: null,
  shareId: '11111111-1111-1111-1111-111111111111',
  entityName: 'prod database',
  entityKind: 'db',
  outcome: null,
  detail: null,
};

test('no filters is the bare path, with no question mark', () => {
  assert.equal(eventQueryPath(), ORG_EVENTS_PATH);
  assert.equal(eventQueryPath({}), ORG_EVENTS_PATH);
});

test('a filter nobody set is omitted, never sent empty', () => {
  // `?actor=` is a filter on the empty string, and `?actor=undefined` is a word that matches
  // nothing and reads like a fault in the server.
  const path = eventQueryPath({ actor: undefined, subject: '  ', kind: 'share.' });
  assert.equal(path, `${ORG_EVENTS_PATH}?kind=share.`);
});

test('every filter travels, under the name the table gives it', () => {
  // The set of names is DERIVED from the table the builder itself reads, not retyped here: a
  // parameter added to one and forgotten in the other is exactly what a retyped list cannot catch.
  const numeric = new Set(['since', 'until', 'limit']);
  const query: Record<string, string | number> = {};
  for (const field of Object.keys(EVENT_QUERY_PARAMS)) {
    query[field] = numeric.has(field) ? 7 : `value-of-${field}`;
  }
  const path = eventQueryPath(query as Parameters<typeof eventQueryPath>[0]);

  const params = new URLSearchParams(path.slice(path.indexOf('?') + 1));
  assert.deepEqual([...params.keys()].sort(), Object.values(EVENT_QUERY_PARAMS).sort());
  assert.equal(params.get('q'), 'value-of-text', 'the text filter is `q` on the wire');
  assert.equal(params.get('actor'), 'value-of-actor');
});

test('a cursor round-trips through the query string unchanged', () => {
  const cursor = '2026-03-01:42';
  const params = new URLSearchParams(eventQueryPath({ cursor }).split('?')[1]);
  assert.equal(params.get('cursor'), cursor);
});

test('a row the server sends is a row this build reads, nulls and all', () => {
  assert.ok(isOrgEvent(ROW));
});

test('a kind this build does not know is still a row', () => {
  // An older client must SHOW a newer server's history, never hide it.
  assert.ok(isOrgEvent({ ...ROW, kind: 'backup.run' }));
});

test('a row missing what every kind carries is refused', () => {
  for (const missing of ['at', 'kind', 'actor']) {
    const row: Record<string, unknown> = { ...ROW };
    delete row[missing];
    assert.equal(isOrgEvent(row), false, `${missing} is not optional`);
  }
  assert.equal(isOrgEvent({ ...ROW, at: '1725400000000' }), false, 'an instant is a number');
  assert.equal(isOrgEvent({ ...ROW, entityName: 7 }), false);
  assert.equal(isOrgEvent(null), false);
});

test('a page is checked whole — the array and the cursor, not only the rows', () => {
  assert.ok(isOrgEventPage({ items: [ROW], nextCursor: '2026-03-01:0' }));
  assert.ok(isOrgEventPage({ items: [], nextCursor: null }));
  assert.equal(isOrgEventPage({ items: 'none' }), false);
  assert.equal(isOrgEventPage({ items: [ROW], nextCursor: 7 }), false);
  assert.equal(isOrgEventPage({ items: [ROW, { kind: 'x' }] }), false, 'one bad row fails the page');
  assert.equal(isOrgEventPage(undefined), false);
});

test('a null cursor is the end, and an empty one is too', () => {
  assert.equal(pageOf({ items: [], nextCursor: undefined }).nextCursor, undefined);
  assert.equal(pageOf({ items: [], nextCursor: '' }).nextCursor, undefined);
  assert.equal(pageOf({ items: [], nextCursor: '2026-03-01:1' }).nextCursor, '2026-03-01:1');
});

test('a number no clock can hold is not sent at all', () => {
  // `since=NaN` reaches the server as a word it refuses with a 400, so a caller meets their own bad
  // arithmetic dressed as a server refusal.
  assert.equal(eventQueryPath({ since: Number.NaN }), ORG_EVENTS_PATH);
  assert.equal(eventQueryPath({ until: Number.POSITIVE_INFINITY }), ORG_EVENTS_PATH);
  assert.equal(eventQueryPath({ limit: Number.NaN, kind: 'share.' }), `${ORG_EVENTS_PATH}?kind=share.`);
  assert.match(eventQueryPath({ since: 0 }), /since=0$/, 'but zero is an instant like any other');
});

test('an instant no clock can hold is not a row', () => {
  assert.equal(isOrgEvent({ ...ROW, at: Number.NaN }), false);
  assert.equal(isOrgEvent({ ...ROW, at: Number.POSITIVE_INFINITY }), false);
});

test('the two outcome words are the ones the SERVER is sent in its own contract suite', () => {
  // Two implementations of one contract cannot be proved consistent by two suites that each read
  // their own copy of the names. This reads the server's `.http` file — the requests that run
  // against a real server before a release — and asserts the words this client sends appear there.
  const suite = readFileSync(join(__dirname, '..', '..', '..', 'http', 'shares', 'shares.http'), 'utf8');
  assert.match(suite, /\?outcome=accepted/, 'the server suite sends `accepted`');
  assert.match(suite, /\?outcome=declined/, 'the server suite sends `declined`');
  assert.match(suite, /outcome=forwarded-to-legal/, 'and one word the server does not know, which it must still accept');
});

test('the file check is the auxiliary one — the LIVE check is in the itest harness', () => {
  // Two suites agreeing with the same file is not a contract check (testing.md). The real one sends
  // the word to a running server and reads the row back through this build's own event client:
  // `scripts/server-transport-itest.cjs`, which asserts `share.accepted` for what it reported. This
  // assertion is here so that the pointer cannot rot silently.
  const harness = readFileSync(join(__dirname, '..', '..', 'scripts', 'server-transport-itest.cjs'), 'utf8');
  assert.match(harness, /removeShare\(bob, inbox\[0\], 'accepted'\)/);
  assert.match(harness, /share\.accepted/);
});
