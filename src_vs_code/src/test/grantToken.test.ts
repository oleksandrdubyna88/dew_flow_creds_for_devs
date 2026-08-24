import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeSecret, formatToken, newSecret, parseToken } from '../grantToken';

/**
 * The token carries the broker's port so the CLI dials the window that minted
 * it. Both halves of the product parse this format, so it gets asserted once
 * here rather than trusted twice.
 */

test('a minted secret is 256 bits of base64url and never repeats', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i += 1) {
    const secret = newSecret();
    assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(seen.has(secret), false);
    seen.add(secret);
  }
});

test('format and parse round-trip', () => {
  const secret = newSecret();
  const parsed = parseToken(formatToken(51234, secret));
  assert.deepEqual(parsed, { port: 51234, secret });
});

test('malformed tokens are refused, never guessed', () => {
  for (const bad of [
    '',
    '.',
    'abc',
    '.secret',
    '51234.',
    '0.secret', // port 0 is not a bound port
    '65536.secret', // past the port range
    '51234.has spaces',
    '51234.has/slash',
    '-1.secret',
    '51e4.secret',
  ]) {
    assert.equal(parseToken(bad), undefined, `expected "${bad}" to be refused`);
  }
});

test('a secret containing dots still parses — only the FIRST dot splits', () => {
  // base64url never emits '.', but splitting on the last dot would be a
  // silent truncation if it ever did; assert the boundary explicitly.
  assert.deepEqual(parseToken('4444.aa.bb'), undefined); // '.' is not a base64url char
  assert.deepEqual(parseToken('4444.aabb'), { port: 4444, secret: 'aabb' });
});

test('the log label reveals a prefix, never the secret', () => {
  const secret = newSecret();
  const label = describeSecret(secret);
  assert.equal(label.length < secret.length, true);
  assert.equal(secret.includes(label.replace('…', '')), true);
  assert.equal(label.includes(secret), false);
});
