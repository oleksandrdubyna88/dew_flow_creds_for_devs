import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
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

test('every filter travels under the name the server reads', () => {
  const path = eventQueryPath({
    actor: 'a@corp.com',
    subject: 'b@corp.com',
    person: 'c@corp.com',
    project: 'ab12',
    kind: 'member.blocked',
    since: 1,
    until: 2,
    text: 'prod database',
    cursor: '2026-03-01:42',
    limit: 50,
  });
  const params = new URLSearchParams(path.slice(path.indexOf('?') + 1));
  assert.deepEqual([...params.keys()].sort(), [
    'actor', 'cursor', 'kind', 'limit', 'person', 'project', 'q', 'since', 'subject', 'until',
  ]);
  assert.equal(params.get('q'), 'prod database', 'the text filter is `q` on the wire');
  assert.equal(params.get('cursor'), '2026-03-01:42');
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

test('the two outcome words are the ones the SERVER is sent in its own contract suite', () => {
  // Two implementations of one contract cannot be proved consistent by two suites that each read
  // their own copy of the names. This reads the server's `.http` file — the requests that run
  // against a real server before a release — and asserts the words this client sends appear there.
  const suite = readFileSync(join(__dirname, '..', '..', '..', 'http', 'shares', 'shares.http'), 'utf8');
  assert.match(suite, /\?outcome=accepted/, 'the server suite sends `accepted`');
  assert.match(suite, /\?outcome=declined|outcome=declined/, 'the server suite sends `declined`');
  assert.match(suite, /outcome=forwarded-to-legal/, 'and one word the server does not know, which it must still accept');
});
