import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MIN_ENTRY_PIN_LENGTH,
  MIN_PIN_LENGTH,
  describePinStrength,
  pinFeedback,
  typedLength,
  validateEntryPin,
  validatePin,
} from '../pinPolicy';

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

// ---------------------------------------------------------------------------
// Issue #55 — the entry PIN has its own floor. It is the SECOND lock, asked after the vault is
// open, and it was being judged by the rules written for the first: `1234` refused with a
// sentence about data stored off the machine, shown for an entry. The scope is a parameter,
// and a caller that passes none gets the STRICTER vault default — the safe direction.
// ---------------------------------------------------------------------------

test('an entry PIN of four characters is accepted, whatever they are', () => {
  assert.equal(validateEntryPin('1234'), undefined, 'four digits is the owner\'s own example');
  assert.equal(validateEntryPin('aaaa'), undefined, 'a repeated character is not refused for an entry');
  assert.equal(validateEntryPin('password'), undefined, 'the blocklist is the vault\'s, not this lock\'s');
  assert.equal(MIN_ENTRY_PIN_LENGTH, 4);
});

test('an entry PIN shorter than four characters is refused, and an empty one by the same sentence', () => {
  assert.match(validateEntryPin('123') ?? '', /at least 4/);
  assert.match(validateEntryPin('') ?? '', /must not be empty/);
});

test('the entry scope gives no crack-time estimate — that number is about an attacker this lock does not face', () => {
  assert.equal(pinFeedback('1234', 'choosing', 'entry'), undefined);
  assert.equal(pinFeedback('correct horse battery staple', 'choosing', 'entry'), undefined);
});

test('the vault scope is the default: a caller that names no scope still refuses 1234', () => {
  const feedback = pinFeedback('1234', 'choosing');
  assert.equal(feedback?.kind, 'error');
  assert.match(feedback?.message ?? '', /at least 8/);
  assert.deepEqual(pinFeedback('1234', 'choosing', 'vault'), feedback, 'and naming it changes nothing');
});

test('an entry-scope refusal is a refusal in BOTH modes, exactly as the vault\'s is', () => {
  for (const mode of ['choosing', 'entering'] as const) {
    const feedback = pinFeedback('123', mode, 'entry');
    assert.ok(feedback !== undefined, `mode ${mode} let a three-character entry PIN through`);
    assert.equal(feedback.kind, 'error');
    assert.equal(feedback.message, validateEntryPin('123'), 'the same sentence, byte for byte');
  }
});

test('the entry scope does not touch the vault floor — the two scopes answer differently about the same PIN', () => {
  // The M-1 finding of the 2026-08-24 security review is why the vault floor is eight; this scope
  // must never be a way around it. `12345678` is the PIN that finding was about.
  assert.equal(pinFeedback('12345678', 'choosing', 'vault')?.kind, 'error');
  assert.equal(pinFeedback('12345678', 'choosing', 'entry'), undefined);
});

// ---------------------------------------------------------------------------
// The floor counts what a PERSON typed. `value.length` is UTF-16 code units, so one flag emoji
// is four of them and cleared the entry floor by itself; a woman-technologist is seven and
// cleared the VAULT's floor of eight with one keypress. The automated reviewer on PR #78 found
// the entry half (CWE-521); the vault half is the same defect against the stricter floor.
//
// It applies when a PIN is being CHOSEN and never when one is being TYPED BACK. An entry PIN is
// stored nowhere and has no recovery, so refusing a PIN somebody already set is not a stricter
// policy — it is a shredder.
// ---------------------------------------------------------------------------

/** One character each: a regional-indicator pair, and a ZWJ sequence of two emoji plus a joiner. */
const FLAG = '\u{1F1FA}\u{1F1F8}';
const CODER = '\u{1F469}‍\u{1F4BB}';

test('one emoji is one character, not four: choosing an entry PIN of a single flag is refused', () => {
  assert.match(validateEntryPin(FLAG) ?? '', /at least 4/, 'a flag is four code units and one character');
  assert.match(validateEntryPin(CODER) ?? '', /at least 4/, 'a ZWJ sequence is one character');
  assert.match(validateEntryPin(`ab${FLAG}`) ?? '', /at least 4/, 'three characters is three');
  assert.equal(validateEntryPin(`ab${FLAG}c`), undefined, 'four characters is four, emoji included');
});

test('choosing a vault PIN of two emoji is refused — the eight-character floor is eight characters', () => {
  const feedback = pinFeedback(FLAG + FLAG, 'choosing');
  assert.equal(feedback?.kind, 'error', 'eight code units, two characters');
  assert.match(feedback?.message ?? '', /at least 8/);
});

test('a PIN already set is never refused at the box that unlocks it', () => {
  // `entryPinGate` blocks Enter on a refusal, and the value it guards has no recovery at all.
  // Someone who set a one-emoji PIN before this rule existed must still be able to type it back.
  assert.equal(pinFeedback(FLAG, 'entering', 'entry'), undefined);
  assert.equal(pinFeedback(FLAG + FLAG, 'entering'), undefined, 'the vault box too');
  assert.match(pinFeedback('ab', 'entering', 'entry')?.message ?? '', /at least 4/, 'and a typo is still caught');
});

test('the mode a caller does not name is the strict one', () => {
  assert.equal(validateEntryPin(FLAG), validateEntryPin(FLAG, 'choosing'));
  assert.equal(validatePin(FLAG + FLAG), validatePin(FLAG + FLAG, 'choosing'));
  assert.equal(validateEntryPin(FLAG, 'entering'), undefined, 'and naming the other one is how it loosens');
});

test('typedLength counts characters, and a fallback would only ever count more', () => {
  assert.equal(typedLength(FLAG), 1);
  assert.equal(typedLength(CODER), 1);
  assert.equal(typedLength('1234'), 4);
  assert.equal(typedLength(''), 0);
  assert.ok(typedLength(CODER) <= [...CODER].length, 'the code-point fallback under-refuses, never over-refuses');
});
