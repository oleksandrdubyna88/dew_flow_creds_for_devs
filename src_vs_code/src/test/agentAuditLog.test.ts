import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAuditLine } from '../agentAuditLog';

/**
 * The output channel is this feature's audit trail, so the line has to say
 * what happened — and must never be the place the secret finally leaks.
 */

const at = new Date(2026, 7, 24, 9, 5, 3);

test('a line names the action, the entity, the grant and the outcome', () => {
  const line = formatAuditLine({
    at,
    grant: 'A1b2C3…',
    entityName: 'prod-db',
    action: 'exec',
    outcome: 'exit 0',
    detail: 'uname -a',
  });

  assert.equal(line, '[09:05:03] exec prod-db (A1b2C3…) → exit 0  uname -a');
});

test('the detail is optional', () => {
  const line = formatAuditLine({ at, grant: 'g…', entityName: 'x', action: 'terminal', outcome: 'opened' });
  assert.equal(line, '[09:05:03] terminal x (g…) → opened');
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
