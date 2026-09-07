import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrgEventPage, OrgEventQuery } from '../eventQuery';
import { EventTab, EventsReader, MAX_ROWS_IN_TAB, isEventPageMessage } from '../eventTab';

import { StoredAccount } from '../types';

/**
 * The tab's state machine: what it asks the server, what it does with an answer that arrives late,
 * and what it draws when the answer is a failure.
 *
 * <p>`EventTab` takes its client and its `draw` as arguments, so all of this is a unit test — the
 * `vscode` half is `showOrgEventLog`, which only wires a panel to it.</p>
 */

const account: StoredAccount = { accountId: 'a-1', email: 'anna@corp.com', provider: 'microsoft' };

function rowAt(at: number): OrgEventPage['items'][number] {
  return { at, kind: 'share.sent', actor: 'alice@corp.com', subject: 'anna@corp.com' };
}

/**
 * A client that answers whatever the test queued, and records what it was asked.
 *
 * <p>Typed as the interface `EventTab` actually needs rather than cast to the class: a fixture
 * written `as unknown as OrgEventsClient` tells the compiler to stop checking, and the day the
 * client grows a method this tab calls, the cast would keep the test green against a fake that
 * cannot answer it.</p>
 */
function fakeClient(answers: readonly (OrgEventPage | Error)[]): { client: EventsReader; asked: OrgEventQuery[] } {
  const asked: OrgEventQuery[] = [];
  // The caller's array is not consumed: an index, so a fixture is a fixture rather than state.
  let next = 0;
  const client: EventsReader = {
    readEvents: (_account: StoredAccount, query: OrgEventQuery = {}) => {
      asked.push(query);
      const answer = answers[next++] ?? { items: [] };
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
  return { client, asked };
}

function tabWith(answers: readonly (OrgEventPage | Error)[]): {
  tab: EventTab;
  asked: OrgEventQuery[];
  html: () => string;
} {
  const { client, asked } = fakeClient(answers);
  let last = '';
  const tab = new EventTab(client, account, (drawn) => {
    last = drawn;
  });
  return { tab, asked, html: () => last };
}

test('opening asks for everything, newest first, with no cursor', async () => {
  const { tab, asked } = tabWith([{ items: [rowAt(2)] }]);

  await tab.start();

  assert.equal(asked.length, 1);
  assert.equal(asked[0].kind, undefined, 'everything is no kind filter at all');
  assert.equal(asked[0].cursor, undefined);
});

test('a group is asked for as the server\'s own prefix', async () => {
  const { tab, asked } = tabWith([{ items: [] }, { items: [] }]);
  await tab.start();

  await tab.handle({ type: 'group', group: 'shares' });

  assert.equal(asked[1].kind, 'share.');
  assert.equal(asked[1].cursor, undefined, 'a different question starts from the newest row again');
});

test('load more carries the cursor and APPENDS', async () => {
  const { tab, asked, html } = tabWith([
    { items: [rowAt(3)], nextCursor: '2026-03-01:5' },
    { items: [rowAt(2)] },
  ]);
  await tab.start();

  await tab.handle({ type: 'more' });

  assert.equal(asked[1].cursor, '2026-03-01:5');
  assert.equal((html().match(/<tr /g) ?? []).length, 2, 'both pages are on screen');
});

test('a cursor the server repeats is treated as the end, not as a loop', async () => {
  const { tab, html } = tabWith([
    { items: [rowAt(3)], nextCursor: 'same' },
    { items: [rowAt(2)], nextCursor: 'same' },
  ]);
  await tab.start();

  await tab.handle({ type: 'more' });

  assert.equal(html().includes('id="more"'), false, 'a cursor that does not move cannot page');
});

test('an answer to a question nobody is asking any more is dropped', async () => {
  // A filter change while a page is out: the late answer must not appear under the new filter.
  let release: ((page: OrgEventPage) => void) | undefined;
  const slow = new Promise<OrgEventPage>((resolve) => {
    release = resolve;
  });
  const asked: OrgEventQuery[] = [];
  let last = '';
  const client: EventsReader = {
    readEvents: (_a: StoredAccount, query: OrgEventQuery = {}) => {
      asked.push(query);
      return asked.length === 1 ? slow : Promise.resolve({ items: [rowAt(9)] });
    },
  };
  const tab = new EventTab(client, account, (drawn) => {
    last = drawn;
  });

  const first = tab.start();
  await tab.handle({ type: 'group', group: 'shares' });
  release?.({ items: [rowAt(1), rowAt(2), rowAt(3)] });
  await first;

  assert.equal((last.match(/<tr /g) ?? []).length, 1, 'only the answer to the question being asked');
});

test('a second click while a request is out is ignored, not queued', async () => {
  const { tab, asked } = tabWith([{ items: [rowAt(1)], nextCursor: 'c1' }]);
  await tab.start();
  // The page disables the buttons while loading; a message that arrives anyway is dropped.
  const pending = tab.handle({ type: 'more' });
  await tab.handle({ type: 'more' });
  await pending;

  assert.equal(asked.length, 2, 'one open, one more — never three');
});

test('a failure is drawn in the server\'s own words, and can be retried', async () => {
  const { tab, asked, html } = tabWith([
    new Error('Vault server unreachable (https://v): ECONNREFUSED'),
    { items: [rowAt(1)] },
  ]);

  await tab.start();
  assert.match(html(), /ECONNREFUSED/);
  assert.match(html(), /id="retry"/);

  await tab.handle({ type: 'retry' });

  assert.equal(asked.length, 2);
  assert.equal(html().includes('ECONNREFUSED'), false, 'the retry cleared it');
  assert.match(html(), /<tr /);
});

test('a server with no log says so rather than showing an empty table', async () => {
  const { tab, html } = tabWith([{ items: [], noLogHere: true }]);

  await tab.start();

  assert.match(html(), /does not keep an event log/);
});

test('the tab keeps at most its cap, and what it drops is the OLDEST', async () => {
  // The rows are newest-first and "load more" appends older pages, so trimming the tail would keep
  // the oldest events and throw away the newest — the wrong half for an audit log, and the opposite
  // of what the page says it did.
  // Named rather than numbered: the instant is rendered as a local date, so a test that looked for
  // the number would be asserting against a format instead of against a row.
  const many = Array.from(
    { length: MAX_ROWS_IN_TAB + 25 },
    (_, i) => ({ ...rowAt(1_000_000 - i), entityName: `row-${i}` }),
  );
  const { tab, html } = tabWith([{ items: many }]);

  await tab.start();

  assert.equal((html().match(/<tr /g) ?? []).length, MAX_ROWS_IN_TAB);
  assert.match(html(), /oldest 25 row\(s\)/);
  assert.match(html(), />row-0</, 'the NEWEST row is still on screen');
  assert.equal(html().includes('>row-' + String(MAX_ROWS_IN_TAB) + '<'), false, 'and the oldest is not');
});

test('a "more" that arrives at the end of the log does not restart it', async () => {
  // The page hides the button when there is no cursor; this is the message that arrives anyway, and
  // asking with no cursor would fetch the FIRST page again and append it under itself.
  const { tab, asked, html } = tabWith([{ items: [rowAt(2)] }]);
  await tab.start();

  await tab.handle({ type: 'more' });

  assert.equal(asked.length, 1, 'nothing was asked');
  assert.equal((html().match(/<tr /g) ?? []).length, 1, 'and nothing was duplicated');
});

test('a no-log answer does not outlive the question that got it', async () => {
  // Try again against a server that is merely unreachable must show the failure, not go on saying
  // "this server keeps no event log".
  const { tab, html } = tabWith([
    { items: [], noLogHere: true },
    new Error('Vault server unreachable (https://v): ECONNREFUSED'),
  ]);
  await tab.start();
  assert.match(html(), /does not keep an event log/);

  await tab.handle({ type: 'retry' });

  assert.match(html(), /ECONNREFUSED/);
  assert.match(html(), /id="retry"/);
  assert.equal(html().includes('does not keep an event log'), false);
});

test('the message guard takes what the page sends and refuses the rest', () => {
  assert.ok(isEventPageMessage({ type: 'more' }));
  assert.ok(isEventPageMessage({ type: 'group', group: 'shares' }));
  assert.ok(isEventPageMessage({ type: 'retry' }));
  assert.equal(isEventPageMessage({ type: 'delete-everything' }), false);
  assert.equal(isEventPageMessage({ type: 'group', group: 7 }), false);
  assert.equal(isEventPageMessage(null), false);
  assert.equal(isEventPageMessage('more'), false);
});
