import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrgEvent } from '../eventQuery';
import { EVENT_GROUPS, eventLine, groupById, kindLabel } from '../eventRows';
import { EventPageState, renderOrgEvents } from '../orgEventsPage';

/**
 * The Event log page: what it shows for each state, and what it escapes.
 *
 * <p>The states are different sentences on purpose — "this server keeps no log" and "nothing has
 * happened yet" are opposite facts, and one shown for the other tells somebody their company's
 * history is empty when it is merely unreachable.</p>
 */

const AT = Date.UTC(2026, 2, 1, 12, 0, 0);

function row(over: Partial<OrgEvent> = {}): OrgEvent {
  return {
    at: AT,
    kind: 'share.sent',
    actor: 'alice@corp.com',
    subject: 'bob@corp.com',
    shareId: '11111111-1111-1111-1111-111111111111',
    entityName: 'prod database',
    entityKind: 'db',
    ...over,
  };
}

function state(over: Partial<EventPageState> = {}): EventPageState {
  return {
    rows: [row()],
    group: 'all',
    loading: false,
    hasMore: false,
    noLogHere: false,
    account: 'anna@corp.com',
    dropped: 0,
    // A frozen clock: a page whose rendering depends on where it is read is a page whose test
    // passes in one office.
    format: (at: number) => new Date(at).toISOString(),
    ...over,
  };
}

test('a row is drawn with both people, the entity and what happened', () => {
  const html = renderOrgEvents(state());

  assert.match(html, /alice@corp\.com/);
  assert.match(html, /bob@corp\.com/);
  assert.match(html, /prod database \(db\)/);
  assert.match(html, />sent</, 'the kind is rendered in words');
  assert.match(html, /2026-03-01T12:00:00/, 'the instant is rendered by the clock it was given');
});

test('a kind this build does not know is shown as itself, never dropped', () => {
  // An older extension must SHOW a newer server's history.
  const html = renderOrgEvents(state({ rows: [row({ kind: 'backup.run', entityName: undefined })] }));

  assert.match(html, />backup\.run</);
  assert.equal(kindLabel('backup.run'), 'backup.run');
});

test('every value a server sent is escaped, in every cell it reaches', () => {
  const nasty = '<script>alert(1)</script>';
  const html = renderOrgEvents(state({
    rows: [row({ entityName: nasty, actor: nasty, subject: nasty, detail: nasty, kind: nasty })],
    account: nasty,
  }));

  assert.equal(html.includes('<script>alert(1)</script>'), false, 'not once, in any cell');
  assert.match(html, /&lt;script&gt;/);
});

test('the page carries a CSP with a nonce, and the only script carries the same one', () => {
  const html = renderOrgEvents(state());

  const csp = /script-src 'nonce-([A-Za-z0-9_-]+)'/.exec(html);
  assert.ok(csp, 'the page declares a script nonce');
  const scripts = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], new RegExp(`nonce="${csp[1]}"`), 'the script is the one the CSP allows');
});

test('two renders do not share a nonce', () => {
  const first = /nonce-([A-Za-z0-9_-]+)/.exec(renderOrgEvents(state()))?.[1];
  const second = /nonce-([A-Za-z0-9_-]+)/.exec(renderOrgEvents(state()))?.[1];

  assert.notEqual(first, second);
});

test('load more is there exactly when there is more to ask for', () => {
  assert.equal(renderOrgEvents(state({ hasMore: false })).includes('id="more"'), false);
  assert.match(renderOrgEvents(state({ hasMore: true })), /id="more"/);
});

test('an empty page WITH more to ask for still offers the button', () => {
  // The server bounds what one request scans, so an empty page carrying a cursor means keep going.
  const html = renderOrgEvents(state({ rows: [], hasMore: true }));

  assert.match(html, /id="more"/);
});

test('while a request is out, nothing can be asked for twice', () => {
  const html = renderOrgEvents(state({ loading: true, hasMore: true }));

  assert.match(html, /id="more" disabled/);
  assert.match(html, /data-group="all"[^>]*disabled/);
  assert.match(html, /Reading…/);
});

test('a server that keeps no log says so, and does not show an empty table', () => {
  const html = renderOrgEvents(state({ rows: [], noLogHere: true, hasMore: true }));

  assert.match(html, /does not keep an event log/);
  assert.equal(html.includes('<table'), false);
  assert.equal(html.includes('id="more"'), false, 'there is nothing to load more OF');
});

test('an empty log and an empty filter are different sentences', () => {
  assert.match(renderOrgEvents(state({ rows: [], group: 'all' })), /Nothing here yet/);
  assert.match(renderOrgEvents(state({ rows: [], group: 'shares' })), /No shares rows you may see/);
});

test('a failure is shown in words, with a way to try again', () => {
  const html = renderOrgEvents(state({ rows: [], error: 'Vault server unreachable (https://v): ECONNREFUSED' }));

  assert.match(html, /ECONNREFUSED/);
  assert.match(html, /id="retry"/);
  assert.equal(html.includes('Nothing here yet'), false, 'a failure is not an empty log');
});

test('rows dropped to keep the tab responsive are counted on screen', () => {
  const html = renderOrgEvents(state({ dropped: 40 }));

  assert.match(html, /oldest 40 row\(s\)/);
  assert.match(html, /still on the server/);
});

test('the groups a person can pick are the server\'s own prefixes, and nothing it cannot express', () => {
  // "Everything else" is the COMPLEMENT of three prefixes, which the server's filter cannot say —
  // offering it would mean filtering the rows this page happens to hold and calling that the log.
  assert.deepEqual(EVENT_GROUPS.map((g) => g.kind), [undefined, 'share.', 'member.', 'project.']);
  assert.equal(groupById('nonsense').id, 'all', 'an id nobody offers falls back to everything');
});

test('a row with no entity says what project it was about', () => {
  const line = eventLine(row({ entityName: undefined, entityKind: undefined, project: 'a1b2' }), () => 'when');

  assert.equal(line.entity, 'project a1b2');
});
