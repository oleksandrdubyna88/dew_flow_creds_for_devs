import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrgEventPage, OrgEventQuery } from '../eventQuery';
import { EventTab, MAX_ROWS_IN_TAB, isEventPageMessage } from '../eventTab';
import { OrgEventsClient } from '../orgEventsClient';
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

/** A client that answers whatever the test queues, and records what it was asked. */
function fakeClient(answers: (OrgEventPage | Error)[]): { client: OrgEventsClient; asked: OrgEventQuery[] } {
  const asked: OrgEventQuery[] = [];
  const client = {
    readEvents: (_account: StoredAccount, query: OrgEventQuery = {}) => {
      asked.push(query);
      const next = answers.shift() ?? { items: [] };
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  } as unknown as OrgEventsClient;
  return { client, asked };
}

function tabWith(answers: (OrgEventPage | Error)[]): {
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
  const client = {
    readEvents: (_a: StoredAccount, query: OrgEventQuery = {}) => {
      asked.push(query);
      return asked.length === 1 ? slow : Promise.resolve({ items: [rowAt(9)] });
    },
  } as unknown as OrgEventsClient;
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

test('the tab keeps at most its cap and says how many it dropped', async () => {
  const many = Array.from({ length: MAX_ROWS_IN_TAB + 25 }, (_, i) => rowAt(i));
  const { tab, html } = tabWith([{ items: many }]);

  await tab.start();

  assert.equal((html().match(/<tr /g) ?? []).length, MAX_ROWS_IN_TAB);
  assert.match(html(), /oldest 25 row\(s\)/);
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
