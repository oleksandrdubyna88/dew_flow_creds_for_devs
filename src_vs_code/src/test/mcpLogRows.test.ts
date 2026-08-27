import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAuditLine, parseAuditLine } from '../agentAuditLog';
import {
  MCP_LOG_FILTERS,
  applyFilter,
  emptyMessage,
  isAgentSecret,
  isNoGenerator,
  isRefusal,
  isRotation,
  MAX_ROWS_SHOWN,
  mcpRowsIn,
  rowsToShow,
} from '../mcpLogRows';
import { renderMcpLog } from '../mcpLogPage';

/**
 * The MCP journal — a view over the audit file, not a second store.
 *
 * <p>The whole feature rests on one line surviving a round trip: the broker formats it, the disk
 * keeps it for a fortnight, and this reads it back. So the round trip is what is asserted, rather
 * than a formatter test and a parser test written apart from each other and each right about its
 * own half.</p>
 *
 * <p>The second thing worth pinning is which rows count as refusals. A refusal reads `denied`,
 * `consent_timeout`, `not_supported`, `invalid_request` and half a dozen more; a filter that only
 * caught the obvious one would quietly under-report the exact thing somebody opened the view to
 * count.</p>
 */

const AT = new Date('2026-08-27T14:05:09Z');

function line(overrides: Partial<Parameters<typeof formatAuditLine>[0]> = {}): string {
  return formatAuditLine({
    at: AT,
    grant: 'tok…f2',
    entityName: 'orders-db',
    action: 'query',
    outcome: 'exit 0',
    seq: 3,
    via: 'mcp',
    ...overrides,
  });
}

test('a formatted line parses back into what went in', () => {
  const entry = parseAuditLine(line({ detail: 'SELECT count(*) FROM orders' }));

  assert.ok(entry !== undefined);
  assert.equal(entry.action, 'query');
  assert.equal(entry.entityName, 'orders-db');
  assert.equal(entry.grant, 'tok…f2');
  assert.equal(entry.outcome, 'exit 0');
  assert.equal(entry.seq, 3);
  assert.equal(entry.via, 'mcp');
  assert.equal(entry.detail, 'SELECT count(*) FROM orders');
});

test('an entity name with spaces and brackets still round-trips', () => {
  // Names are whatever a person typed, and the format uses both spaces and parentheses.
  const entry = parseAuditLine(line({ entityName: 'prod (eu-west) db' }));

  assert.equal(entry?.entityName, 'prod (eu-west) db');
});

test('a line with no detail and no sequence parses too', () => {
  const entry = parseAuditLine(line({ seq: undefined, detail: undefined }));

  assert.equal(entry?.seq, undefined);
  assert.equal(entry?.detail, undefined);
  assert.equal(entry?.outcome, 'exit 0');
});

test('a line from before the door was recorded reads as having no door', () => {
  // The folder is swept but not versioned, so a fortnight after this change it holds both
  // shapes. An old line must read as "unknown door", never as an MCP one.
  const older = parseAuditLine(line({ via: undefined }));

  assert.equal(older?.via, undefined);
  assert.deepEqual(mcpRowsIn(line({ via: undefined }), '2026-08-27'), []);
});

test('a line that is not one of ours is skipped, not half-parsed', () => {
  assert.equal(parseAuditLine('something else entirely'), undefined);
  assert.equal(parseAuditLine(''), undefined);
});

test('only the MCP door reaches the journal', () => {
  const text = [line({ via: 'mcp' }), line({ via: 'alias' }), line({ via: 'token' })].join('\n');

  const rows = mcpRowsIn(text, '2026-08-27');

  assert.equal(rows.length, 1);
  assert.equal(rows[0].via, 'mcp');
  assert.equal(rows[0].day, '2026-08-27');
});

test('every refusal counts as one, not only the one that says denied', () => {
  // The under-reporting trap. Someone opening the Refused filter is counting what they said no
  // to — and "the prompt timed out" and "that switch is off" are both that.
  for (const outcome of ['denied', 'consent_timeout', 'not_supported', 'invalid_request', 'too_many_requests']) {
    assert.equal(isRefusal({ at: AT, grant: '', entityName: '', action: 'query', outcome }), true, outcome);
  }
  assert.equal(isRefusal({ at: AT, grant: '', entityName: '', action: 'query', outcome: 'exit 0' }), false);
});

test('a REFUSED rotation is a refusal and not a rotation', () => {
  // It would otherwise be counted as a secret that was replaced, which is the one number in
  // this view nobody should have to double-check.
  const refused = { at: AT, grant: '', entityName: 'x', action: 'rotate', outcome: 'denied' };
  const done = { at: AT, grant: '', entityName: 'x', action: 'rotate', outcome: 'rotated' };

  assert.equal(isRotation(refused), false);
  assert.equal(isRefusal(refused), true);
  assert.equal(isRotation(done), true);
});

test('the filters select what they say they do', () => {
  const rows = mcpRowsIn(
    [
      line({ outcome: 'exit 0' }),
      line({ action: 'rotate', outcome: 'rotated' }),
      line({ action: 'rotate', outcome: 'denied' }),
    ].join('\n'),
    '2026-08-27',
  );

  assert.equal(applyFilter(rows, 'all').length, 3);
  assert.equal(applyFilter(rows, 'rotations').length, 1);
  assert.equal(applyFilter(rows, 'refused').length, 1);
});

test('the page shows a row per call and says so when there are none', () => {
  const html = renderMcpLog(mcpRowsIn(line({ detail: 'SELECT 1' }), '2026-08-27'));

  assert.ok(html.includes('orders-db'));
  assert.ok(html.includes('SELECT 1'));
  assert.ok(html.includes('2026-08-27'));
  assert.ok(renderMcpLog([]).includes('No agent has called this window yet'));
});

test('a refused rotation appears under Refused and NOT under Secrets replaced', () => {
  // The only reading that leaves the second filter worth trusting: nothing was replaced, so it
  // is not a replacement — it is a refusal, and that is where somebody counting them will look.
  const refused = renderMcpLog(mcpRowsIn(line({ action: 'rotate', outcome: 'denied' }), '2026-08-27'));
  const done = renderMcpLog(mcpRowsIn(line({ action: 'rotate', outcome: 'rotated' }), '2026-08-27'));

  assert.match(refused, /data-kind="refused"/);
  assert.equal(refused.includes('data-kind="rotations"'), false);
  assert.match(done, /data-kind="rotations"/);
});

test('a detail from a synced vault cannot break out of the page', () => {
  // Entity names and command text arrive from whoever shared the vault. This extension has
  // shipped one interpolation of such a value into a page before (fixed in 0.62.1).
  const html = renderMcpLog(
    mcpRowsIn(line({ entityName: '</script><img src=x onerror=alert(1)>' }), '2026-08-27'),
  );

  assert.equal(html.includes('<img src=x'), false);
  assert.match(html, /&lt;\/script&gt;/);
});

test('a secret that came from the agent is counted, and only that one is', () => {
  // The one number in this view that is a cost rather than an activity: every level of this
  // product is built so no secret passes through an agent, and creation is the exception.
  const rows = mcpRowsIn(
    [
      line({ action: 'create', outcome: 'created with agent secret' }),
      line({ action: 'create', outcome: 'created' }),
      line({ action: 'rotate', outcome: 'rotated' }),
    ].join('\n'),
    '2026-08-27',
  );

  assert.equal(applyFilter(rows, 'agentSecrets').length, 1);
  assert.equal(isAgentSecret(rows[0]), true);
  assert.equal(isAgentSecret(rows[1]), false, 'an entry created without a secret is not one');
  assert.equal(isAgentSecret(rows[2]), false, 'a rotation never passes the value through the agent');
});

test('the empty message tells the two silences apart', () => {
  // "Nothing was replaced" and "no secret ever reached the vault from an agent" are different
  // facts, and the second is the reassuring one somebody opened this filter to check.
  assert.match(emptyMessage('agentSecrets', 3), /No secret has reached the vault from an agent/);
  assert.match(emptyMessage('rotations', 3), /No secrets have been replaced/);
  assert.match(emptyMessage('all', 0), /No agent has called this window yet/);
});

test('what could not be generated is counted, and is not lumped in with refusals', () => {
  // The more useful of the two costs: every one of these is a place where an agent's next move
  // is to make the value itself. A run of them followed by agent-supplied secrets is the leak
  // this product exists to avoid, visible before it happens.
  const rows = mcpRowsIn(
    [
      line({ action: 'create', outcome: 'no generator' }),
      line({ action: 'rotate', outcome: 'no generator' }),
      line({ action: 'query', outcome: 'denied' }),
      line({ action: 'query', outcome: 'exit 0' }),
    ].join('\n'),
    '2026-08-27',
  );

  assert.equal(applyFilter(rows, 'noGenerator').length, 2);
  assert.equal(applyFilter(rows, 'refused').length, 1, 'a missing generator is not a refusal');
  assert.equal(isNoGenerator(rows[0]), true);
  assert.equal(isNoGenerator(rows[3]), false);
});

test('a row that could not be generated is shown under its own filter, not under Refused', () => {
  const html = renderMcpLog(mcpRowsIn(line({ action: 'create', outcome: 'no generator' }), '2026-08-27'));

  assert.match(html, /data-kind="noGenerator"/);
  assert.equal(html.includes('data-kind="refused"'), false);
});

test('every filter has a sentence for having nothing in it', () => {
  // "Nothing here" means a different thing in each, and the reassuring ones are the point.
  for (const filter of MCP_LOG_FILTERS) {
    assert.ok(emptyMessage(filter.id, 3).length > 20, filter.id);
  }
  assert.match(emptyMessage('noGenerator', 3), /could not make/);
});

/**
 * The journal is bounded, found by measurement in the security pass on 2026-08-27.
 *
 * <p>A fortnight of a busy agent is a real quantity: fourteen days × six windows × five hundred
 * calls measured out at 42,000 rows and 10.2 MB of HTML, handed to a webview in one string — with
 * an in-page filter that then walks every row on each of five buttons.</p>
 *
 * <p>Capped newest-first, and <b>the cap says so</b>. A truncated view that looks complete is
 * worse than one honest about its horizon: somebody counting secrets that came from an agent
 * would otherwise be counting the ones that fit on a page.</p>
 */
test('a very long history is capped, newest first', () => {
  const many = Array.from({ length: MAX_ROWS_SHOWN + 500 }, (_, i) =>
    line({ seq: i, entityName: `entry-${i}` }),
  ).join('\n');

  const shown = rowsToShow(mcpRowsIn(many, '2026-08-27'));

  assert.equal(shown.rows.length, MAX_ROWS_SHOWN);
  assert.equal(shown.hidden, 500);
  assert.equal(shown.rows[0].entityName, 'entry-0', 'the caller hands them newest-first already');
});

test('a history that fits is not capped, and says nothing about it', () => {
  const shown = rowsToShow(mcpRowsIn([line(), line()].join('\n'), '2026-08-27'));

  assert.equal(shown.rows.length, 2);
  assert.equal(shown.hidden, 0);
});

test('the page says how many it left out, rather than looking complete', () => {
  // The rule this product keeps elsewhere: a silent truncation reads as "everything", and the one
  // number in this view that must not be quietly wrong is a count of secrets.
  const many = Array.from({ length: MAX_ROWS_SHOWN + 3 }, (_, i) => line({ seq: i })).join('\n');

  const html = renderMcpLog(mcpRowsIn(many, '2026-08-27'));

  assert.match(html, /3 older/);
  assert.match(html, /still on disk/);
});
