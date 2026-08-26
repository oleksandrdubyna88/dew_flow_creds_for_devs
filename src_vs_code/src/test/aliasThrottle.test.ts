import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AliasThrottle, MAX_PROMPTS, WINDOW_MS } from '../aliasThrottle';

/**
 * The rate at which a caller with no token may make a window ask a human.
 *
 * <p>This is authorization, not comfort: the alias route carries no bearer token, so the
 * consent modal is the whole gate, and a gate you can ring a thousand times is one somebody
 * eventually opens to make the noise stop.</p>
 */

const NOW = 1_700_000_000_000;

test('the first call is admitted', () => {
  assert.equal(new AliasThrottle().admit(NOW), 'allow');
});

test('a second call while the first is still being answered is refused as busy', () => {
  // A stack of modals is unusable long before any count is reached, and the person cannot
  // answer the first one while the second is covering it.
  const t = new AliasThrottle();
  t.admit(NOW);

  assert.equal(t.admit(NOW), 'busy');
});

test('releasing lets the next one through', () => {
  const t = new AliasThrottle();
  t.admit(NOW);
  t.release();

  assert.equal(t.admit(NOW + 1), 'allow');
});

test('a burst past the cap is refused even when each is answered', () => {
  // The slow grind: one prompt at a time, answered and re-asked, wears somebody down just as
  // effectively as a pile-up. `busy` alone would not stop it.
  const t = new AliasThrottle();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    assert.equal(t.admit(NOW + i), 'allow', `prompt ${i}`);
    t.release();
  }

  assert.equal(t.admit(NOW + MAX_PROMPTS), 'too-many');
});

test('the window slides, so a person who genuinely uses it is not locked out', () => {
  const t = new AliasThrottle();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    t.admit(NOW + i);
    t.release();
  }
  assert.equal(t.admit(NOW + MAX_PROMPTS), 'too-many');

  assert.equal(t.admit(NOW + WINDOW_MS + 1), 'allow', 'a minute later it is open again');
});

test('a prompt is spent at the moment it is ASKED, not when it is answered', () => {
  // A caller that opens a dialog and never has it answered has still consumed the window —
  // which is exactly the abuse being prevented, so counting on answer would miss it.
  const t = new AliasThrottle();
  for (let i = 0; i < MAX_PROMPTS; i += 1) {
    t.admit(NOW);
    t.release();
  }

  assert.equal(t.admit(NOW), 'too-many');
});

test('releasing more often than admitting cannot bank free slots', () => {
  // A bug in the caller must not be able to open the door: `release` is clamped at zero.
  const t = new AliasThrottle();
  t.release();
  t.release();
  t.release();

  assert.equal(t.admit(NOW), 'allow');
  assert.equal(t.admit(NOW), 'busy', 'still exactly one in flight');
});

test('the refusal says which limit was hit, and what to do', () => {
  assert.match(AliasThrottle.describe('busy'), /already waiting/i);
  assert.match(AliasThrottle.describe('too-many'), new RegExp(String(MAX_PROMPTS)));
});

test('the cap is low enough to matter and high enough to use', () => {
  // A person running a command in a terminal is nowhere near this; a script grinding at a
  // human is well past it. A per-second limit would still permit three hundred an hour.
  assert.ok(MAX_PROMPTS <= 10, 'a cap that lets a grind through is not a cap');
  assert.ok(MAX_PROMPTS >= 3, 'and one that blocks ordinary use is an outage');
  assert.equal(WINDOW_MS, 60_000);
});
