import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAuditLine } from '../agentAuditLog';

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
