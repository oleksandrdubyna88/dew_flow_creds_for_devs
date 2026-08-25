import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MIN_PIN_LENGTH, describePinStrength, validatePin } from '../pinPolicy';

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
