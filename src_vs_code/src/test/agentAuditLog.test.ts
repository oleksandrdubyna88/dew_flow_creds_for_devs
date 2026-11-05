import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAuditLine, parseAuditLine } from '../agentAuditLog';
import { GrantRegistry } from '../grantRegistry';

/**
 * The output channel is this feature's audit trail, so the line has to say
 * what happened — and must never be the place the secret finally leaks.
 */

// Explicitly UTC: the formatter renders UTC, so a local-time fixture would make
// these assertions pass in one timezone and fail in another.
const at = new Date('2026-08-24T09:05:03Z');

test('a line names the action, the entity, the grant and the outcome', () => {
  const line = formatAuditLine({
    at,
    grant: 'A1b2C3…',
    entityName: 'prod-db',
    action: 'exec',
    outcome: 'exit 0',
    detail: 'uname -a',
  });

  assert.equal(line, '[09:05:03Z] exec prod-db (A1b2C3…) → exit 0  uname -a');
});

test('the detail is optional', () => {
  const line = formatAuditLine({ at, grant: 'g…', entityName: 'x', action: 'terminal', outcome: 'opened' });
  assert.equal(line, '[09:05:03Z] terminal x (g…) → opened');
});

test('one call is always one line, however the detail is shaped', () => {
  const line = formatAuditLine({
    at,
    grant: 'g…',
    entityName: 'x',
    action: 'exec',
    outcome: 'exit 1',
    detail: 'first\nsecond\r\n\tthird',
  });

  assert.equal(line.includes('\n'), false);
  assert.equal(line.includes('\r'), false);
  assert.match(line, /first second third$/);
});

test('a very long detail is truncated rather than flooding the channel', () => {
  const line = formatAuditLine({
    at,
    grant: 'g…',
    entityName: 'x',
    action: 'exec',
    outcome: 'exit 0',
    detail: 'y'.repeat(5000),
  });

  assert.equal(line.length < 300, true);
  assert.match(line, /…$/);
});

test('the formatter is only ever handed a grant LABEL — a full secret would be visible', () => {
  // The registry hands `describeSecret(...)` in; this asserts the contract at
  // the formatting end: whatever it prints, it prints what it was given and
  // never reconstructs more.
  const secret = 'S3cr3tS3cr3tS3cr3tS3cr3tS3cr3tS3cr3tS3cr3t';
  const line = formatAuditLine({ at, grant: 'S3cr3t…', entityName: 'x', action: 'exec', outcome: 'exit 0' });

  assert.equal(line.includes(secret), false);
});

test('the clock is UTC, so a line lines up with a server log written elsewhere', () => {
  // The file NAME is UTC; a local-time line inside it would put two timezones in
  // one file, and correlating an incident is the only time anyone reads it.
  const line = formatAuditLine({
    at: new Date('2026-08-25T11:40:07Z'),
    grant: 'abc123…',
    entityName: 'prod',
    action: 'exec',
    outcome: 'exit 0',
  });

  assert.match(line, /^\[11:40:07Z\]/);
});

test('a call number renders as a #N prefix; its absence omits it (legacy channel lines)', () => {
  const at = new Date(Date.UTC(2026, 0, 2, 9, 8, 7));
  const base = { at, grant: 'g#ab', entityName: 'prod', action: 'exec', outcome: 'exit 0' };

  const numbered = formatAuditLine({ ...base, seq: 7 });
  assert.match(numbered, /^\[09:08:07Z\] #7 exec prod/);

  const legacy = formatAuditLine(base);
  assert.doesNotMatch(legacy, /#\d/);
  assert.match(legacy, /^\[09:08:07Z\] exec prod/);
});

test('the caller sits between the door and the outcome, as "by <label>"', () => {
  // Who called is the half of the record the journal could not say: nine sessions side by side
  // and every line reading the same. The label is what the caller REPORTED — it authorises
  // nothing, and the line does not pretend otherwise.
  const line = formatAuditLine({
    at,
    grant: 'A1b2C3…',
    entityName: 'prod-db',
    action: 'exec',
    outcome: 'exit 0',
    detail: 'uname -a',
    seq: 3,
    via: 'mcp',
    caller: 'Claude Code 2.1.268 · session coffeebar-d6 (98bf9f23) · in CoffeeBar',
  });

  assert.equal(
    line,
    '[09:05:03Z] #3 exec prod-db (A1b2C3…) via mcp by Claude Code 2.1.268 · session coffeebar-d6 (98bf9f23) · in CoffeeBar → exit 0  uname -a',
  );
});

test('a line with no caller is byte for byte the line written before the field existed', () => {
  const line = formatAuditLine({ at, grant: 'A1b2C3…', entityName: 'prod-db', action: 'exec', outcome: 'exit 0', seq: 3, via: 'token' });

  assert.equal(line, '[09:05:03Z] #3 exec prod-db (A1b2C3…) via token → exit 0');
});

test('a caller label is one line and cannot carry the field separator, whoever built it', () => {
  // The sanitiser on the request side is the guard; this is the formatter refusing to be the
  // place where a bypassed guard breaks the round trip.
  const line = formatAuditLine({ at, grant: 'g…', entityName: 'x', action: 'exec', outcome: 'exit 0', caller: 'a\nb → c' });

  assert.equal(line.includes('\n'), false);
  assert.equal(line.split('→').length, 2, line);
});

/* ---------------------------------------------------------------------------------------------------------------
 * E1.4 — a line about a bridged call reads back (C14)
 * ------------------------------------------------------------------------------------------------------------- */

/** A line read back, or a failure that says which line would not parse. */
function readBack(line: string): NonNullable<ReturnType<typeof parseAuditLine>> {
  const entry = parseAuditLine(line);
  return entry === undefined ? assert.fail(`the line did not parse: ${line}`) : entry;
}

test('C14: a bridged grant\'s line round-trips — name `prod (eu) → db`, the mark inside the grant group, door and caller intact', () => {
  const registry = new GrantRegistry();
  const context = { bridgeId: 'b1', accountId: 'a', serverEntityId: 's', serverName: 'prod (eu) → db', target: '', remoteOs: undefined };
  const grant = registry.mint('a', 'e', 'orders-db', 'ssh', Date.now(), 'call', { context, quiet: true });
  const mark = GrantRegistry.describe(grant);
  const line = formatAuditLine({ at, grant: mark, entityName: 'orders (db)', action: 'exec', outcome: 'exit 0', detail: 'uptime', seq: 3, via: 'mcp', caller: 'Claude Code 2.1.268' });

  assert.ok(line.includes(` bridge=prod_eu_db) via mcp by Claude Code 2.1.268 → exit 0`), line);
  assert.deepEqual({ ...readBack(line), at: undefined }, {
    at: undefined,
    grant: mark,
    entityName: 'orders (db)',
    action: 'exec',
    outcome: 'exit 0',
    seq: 3,
    via: 'mcp',
    caller: 'Claude Code 2.1.268',
    detail: 'uptime',
  });
  assert.match(mark, /^\S+… bridge=prod_eu_db$/, 'the grant field is the secret\'s label, a space and the mark');
});

test('C14: the grant-less line reads back with its mark, and a line written before the mark still parses', () => {
  const grantless = readBack(formatAuditLine({ at, grant: '— bridge=ai-runner1', entityName: '', action: 'request', outcome: 'too_many_requests', detail: 'Too many requests', via: 'mcp' }));
  assert.deepEqual([grantless.grant, grantless.outcome], ['— bridge=ai-runner1', 'too_many_requests']);
  const old = readBack('[09:05:03Z] #3 exec orders-db (tok…f2) via mcp by Claude Code 2.1.268 → exit 0  uptime');
  assert.deepEqual([old.grant, old.caller], ['tok…f2', 'Claude Code 2.1.268']);
});
