import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unlockPlan } from '../unlockPlan';

/**
 * WHO decides how a wrapped vault opens. The cascade lived inline in vaultKeys and broke
 * three times (silent reopen after Lock, one salt for all credentials, version-number
 * routing); this is it, extracted, with the one thing it never had: when a human is
 * about to be prompted anyway and both ways in exist, the human chooses.
 */

const base = {
  interactive: true,
  needsGesture: false,
  hasStoredPin: false,
  hasPinWrap: true,
  hasKeyWrap: true,
};

test('a stored PIN opens silently — no prompt, no picker, nothing changed for sync', () => {
  assert.deepEqual(unlockPlan({ ...base, hasStoredPin: true }), { kind: 'silentPin' });
  // Background callers keep the same silent path.
  assert.deepEqual(
    unlockPlan({ ...base, hasStoredPin: true, interactive: false }),
    { kind: 'silentPin' },
  );
});

test('a gesture with BOTH ways in asks the person which one', () => {
  // The reported gap: restore went straight to one path. If you are being interrupted
  // anyway, the interruption may as well be the question.
  assert.deepEqual(unlockPlan(base), { kind: 'choose' });
  // Locked vault: the stored PIN is refused, so even with one stored this is a choice.
  assert.deepEqual(
    unlockPlan({ ...base, hasStoredPin: true, needsGesture: true }),
    { kind: 'choose' },
  );
});

test('one way in goes straight there — a picker with one option is noise', () => {
  assert.deepEqual(unlockPlan({ ...base, hasPinWrap: false }), { kind: 'key' });
  assert.deepEqual(unlockPlan({ ...base, hasKeyWrap: false }), { kind: 'promptPin' });
});

test('a background caller with no silent path is refused, never prompted', () => {
  assert.deepEqual(unlockPlan({ ...base, interactive: false }), { kind: 'refuse' });
  assert.deepEqual(
    unlockPlan({ ...base, interactive: false, hasStoredPin: true, needsGesture: true }),
    { kind: 'refuse' },
  );
});

test('no way in at all is refused, not an invented prompt', () => {
  assert.deepEqual(
    unlockPlan({ ...base, hasPinWrap: false, hasKeyWrap: false }),
    { kind: 'refuse' },
  );
});
