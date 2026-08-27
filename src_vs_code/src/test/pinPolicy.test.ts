import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIN_PIN_LENGTH, describePinStrength, pinFeedback, validatePin } from '../pinPolicy';

/**
 * PIN strength. This PIN is not an online password: it wraps ciphertext that
 * deliberately sits where other people can read it — a NAS folder, a vault
 * server, a colleague's share inbox. The attacker who matters already holds the
 * file and guesses offline, unthrottled, so NIST 800-63B's rate-limited-login
 * floor is the wrong yardstick.
 *
 * Measured cost at the shipped scrypt parameters (N=2^17, r=8, p=1): an
 * all-digit eight-character PIN is 10^8 guesses, which a single modern GPU
 * works through in tens of hours. A share PIN is worse than the vault's,
 * because on the server transport the other half of the passphrase is the
 * recipient's EMAIL — public, and often guessable from a name.
 *
 * So the floor rejects only what is demonstrably weak and leaves everything
 * else to the advisory estimate, per the decision recorded in the plan: a floor
 * high enough to matter is high enough that people write PINs on monitors.
 */

test('empty and short PINs are rejected, long ones accepted', () => {
  assert.match(validatePin('') ?? '', /must not be empty/);
  assert.match(validatePin('123') ?? '', /at least/);
  assert.equal(validatePin('correct horse battery'), undefined);
});

test('an all-digit PIN is rejected below twelve characters', () => {
  // 10^8 offline guesses. The length floor alone accepted this.
  assert.match(validatePin('12345678') ?? '', /digits/);
  assert.match(validatePin('19850214') ?? '', /digits/);
  assert.equal(validatePin('123456789012'), undefined, 'twelve digits is 10^12 — allowed');
});

test('one character repeated is rejected however long it is', () => {
  assert.match(validatePin('xxxxxxxx') ?? '', /more than one/);
  assert.match(validatePin('aaaaaaaaaaaaaaaa') ?? '', /more than one/);
});

// eslint-disable-next-line complexity
test('the obvious passwords are rejected by name, case and leetspeak included', () => {
  assert.match(validatePin('password') ?? '', /too common/);
  assert.match(validatePin('PASSWORD') ?? '', /too common/);
  assert.match(validatePin('qwertyuiop') ?? '', /too common/);
  assert.match(validatePin('letmein!') ?? '', /too common/);
});

test('the eight-character floor still holds for mixed-class input', () => {
  assert.equal(validatePin('hunter2!'), undefined);
  assert.equal('hunter2!'.length, MIN_PIN_LENGTH);
});

test('the estimate is advisory and rises with real entropy', () => {
  // Shown live in the input box; it never blocks, it informs.
  const weak = describePinStrength('hunter2!');
  const strong = describePinStrength('correct horse battery staple');

  assert.equal(typeof weak, 'string');
  assert.notEqual(weak, strong);
  assert.match(strong, /centuries|years/);
});

// ---------------------------------------------------------------------------
// T1 (PLAN_tails) — the advisory that reached nobody. `describePinStrength` was
// exported, documented as "shown live in the input box", and called by nothing
// but this file. `pinFeedback` is what the input boxes actually consume.
// ---------------------------------------------------------------------------

test('choosing a weak-but-legal PIN gets advice naming a duration', () => {
  const feedback = pinFeedback('hunter2!', 'choosing');
  assert.ok(feedback !== undefined, 'a legal-but-weak PIN deserves advice while choosing');
  assert.equal(feedback.kind, 'advice');
  assert.match(feedback.message, /Offline guessing/);
});

test('entering an existing PIN gets no advice — there is nothing the typist can do about it', () => {
  assert.equal(pinFeedback('hunter2!', 'entering'), undefined);
});

test('a refusal is a refusal in BOTH modes — a mode must never soften it', () => {
  for (const mode of ['choosing', 'entering'] as const) {
    const feedback = pinFeedback('12345678', mode);
    assert.ok(feedback !== undefined, `mode ${mode} let a refused PIN through`);
    assert.equal(feedback.kind, 'error');
  }
});

test('the refusal text is byte-identical to validatePin, so the two paths cannot drift', () => {
  for (const pin of ['', 'short', '12345678', 'password', 'aaaaaaaa']) {
    const direct = validatePin(pin);
    const routed = pinFeedback(pin, 'choosing');
    assert.equal(routed?.kind === 'error' ? routed.message : undefined, direct);
  }
});

test('a strong PIN while choosing still gets its estimate, not silence', () => {
  const feedback = pinFeedback('correct horse battery staple', 'choosing');
  assert.equal(feedback?.kind, 'advice');
  assert.match(feedback?.message ?? '', /centuries|years/);
});
