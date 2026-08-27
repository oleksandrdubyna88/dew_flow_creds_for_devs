import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAuditLine, parseAuditLine } from '../agentAuditLog';
import { applyFilter, emptyMessage, isAgentSecret, isRefusal, isRotation, mcpRowsIn } from '../mcpLogRows';
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
