import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALLOW_ONCE,
  ALLOW_WINDOW,
  ALLOW_WINDOW_MS,
  DENY,
  consentFromChoice,
  withinAllowWindow,
} from '../agentConsent';

const NOW = 1_800_000_000_000;

test('Allow once signs this request and remembers nothing', () => {
  assert.deepEqual(consentFromChoice(ALLOW_ONCE, NOW), { allow: true, present: true });
});

test('Allow for 10 minutes is the ONLY answer that arms a window', () => {
  assert.deepEqual(consentFromChoice(ALLOW_WINDOW, NOW), {
    allow: true,
    present: true,
    allowedUntil: NOW + ALLOW_WINDOW_MS,
  });
  assert.equal(consentFromChoice(ALLOW_ONCE, NOW).allowedUntil, undefined);
  assert.equal(consentFromChoice(DENY, NOW).allowedUntil, undefined);
});

test('Deny refuses this signature but is NOT remembered — the next request asks again', () => {
  // A key that could not be used once is not a key that should become unusable.
  const denied = consentFromChoice(DENY, NOW);
  assert.equal(denied.allow, false);
  assert.equal(denied.allowedUntil, undefined);
  assert.equal(denied.present, true, 'saying no is a person being there');
});

test('a DISMISSED dialog refuses, and counts as nobody being present', () => {
  // The asymmetry that matters: Escape or a missed notification must not be recorded as a
  // decision, and must not postpone the idle auto-lock the way a real answer does.
  assert.deepEqual(consentFromChoice(undefined, NOW), { allow: false, present: false });
});

test('an unrecognised label allows once rather than arming anything', () => {
  // If a label is ever renamed and this file is not updated, the failure should be "asks every
  // time" — annoying — rather than "signs silently for ten minutes".
  const odd = consentFromChoice('Allow, I suppose', NOW);
  assert.equal(odd.allow, true);
  assert.equal(odd.allowedUntil, undefined);
});

test('the window covers requests until it expires, and not one after', () => {
  const until = NOW + ALLOW_WINDOW_MS;
  assert.equal(withinAllowWindow(until, NOW), true);
  assert.equal(withinAllowWindow(until, until - 1), true);
  assert.equal(withinAllowWindow(until, until), false, 'the boundary expires, it does not linger');
  assert.equal(withinAllowWindow(until, until + 1), false);
});

test('no window at all means ask, which is the default state of every key', () => {
  assert.equal(withinAllowWindow(undefined, NOW), false);
});

test('ten minutes is the stated number, not an accident of arithmetic', () => {
  assert.equal(ALLOW_WINDOW_MS, 600_000);
  assert.match(ALLOW_WINDOW, /10 minutes/);
});
