import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FOREVER_LIFETIME,
  KEEP_LIFETIME,
  LIFETIME_CHOICES,
  applyLifetime,
  hasLifetime,
  lifetimeId,
} from '../entityExpiry';

/**
 * Turning a chosen preset into the two fields a record carries.
 *
 * <p>The case worth the most care is `keep`: renaming an entry must not move the moment it
 * dies. A form that rebuilt the expiry from a preset on every save would quietly extend a
 * one-hour token every time somebody fixed a typo in its name — which is indistinguishable
 * from the feature not working, and is only visible much later.</p>
 */

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60_000;

test('every preset has a distinct, stable id', () => {
  const ids = LIFETIME_CHOICES.map(lifetimeId);

  assert.equal(new Set(ids).size, ids.length, ids.join(','));
  assert.deepEqual(ids, [FOREVER_LIFETIME, 'ttl:3600000', 'ttl:86400000', 'onClose', 'oneUse']);
});

test('an id is not a position, so inserting a preset cannot re-point an old one', () => {
  // The failure this prevents is silent: somebody's day-long token becoming an hour-long one.
  assert.equal(lifetimeId({ policy: 'ttl', ms: HOUR }), 'ttl:3600000');
  assert.equal(lifetimeId({ policy: 'onClose' }), 'onClose');
  assert.equal(lifetimeId({}), FOREVER_LIFETIME);
});

test('a timed choice becomes a moment in the future', () => {
  assert.deepEqual(applyLifetime('ttl:3600000', NOW, {}), {
    expiresAt: NOW + HOUR,
    burnPolicy: 'ttl',
  });
});

test('the clockless choices carry a policy and no clock', () => {
  assert.deepEqual(applyLifetime('onClose', NOW, {}), {
    expiresAt: undefined,
    burnPolicy: 'onClose',
  });
  assert.deepEqual(applyLifetime('oneUse', NOW, {}), {
    expiresAt: undefined,
    burnPolicy: 'oneUse',
  });
});

test('choosing Forever clears an existing lifetime', () => {
  const current = { expiresAt: NOW + HOUR, burnPolicy: 'ttl' as const };

  assert.deepEqual(applyLifetime(FOREVER_LIFETIME, NOW, current), {
    expiresAt: undefined,
    burnPolicy: undefined,
  });
});

test('keeping leaves the existing lifetime untouched, to the millisecond', () => {
  const current = { expiresAt: NOW + 137, burnPolicy: 'ttl' as const };

  assert.deepEqual(applyLifetime(KEEP_LIFETIME, NOW + 90_000, current), current);
});

test('an unrecognised value keeps rather than clears', () => {
  // A value from a newer build, or a mangled one, must not silently un-expire a secret.
  const current = { expiresAt: NOW + HOUR, burnPolicy: 'ttl' as const };

  assert.deepEqual(applyLifetime('ttl:not-a-number', NOW, current), current);
  assert.deepEqual(applyLifetime('ttl:0', NOW, current), current);
  assert.deepEqual(applyLifetime('ttl:-5', NOW, current), current);
  assert.deepEqual(applyLifetime('something else entirely', NOW, current), current);
});

test('an unrecognised value on an entry with no lifetime still means no lifetime', () => {
  assert.deepEqual(applyLifetime('nonsense', NOW, {}), {
    expiresAt: undefined,
    burnPolicy: undefined,
  });
});

test('hasLifetime sees either half of one', () => {
  assert.equal(hasLifetime({}), false);
  assert.equal(hasLifetime({ burnPolicy: 'onClose' }), true);
  assert.equal(hasLifetime({ expiresAt: NOW }), true);
});
