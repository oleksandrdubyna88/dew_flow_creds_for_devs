import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GATED_FIELDS, PHRASE_VISIBLE_MS, needsReveal, phraseRevealPrompt, revealPrompt } from '../revealGate';
import { PhraseBuffer } from '../phraseBuffer';

/**
 * The rung that did not exist in this product before, and the buffer that is honest about its limits.
 *
 * <p>Everywhere else here, unlocked means the value copies. These three fields ask again — and the
 * tests assert both halves of that: that they DO ask, and that nothing else does. A gate that spread
 * quietly to every field would be a different product.</p>
 */

test('the CVV and the PIN ask again, and nothing else does', () => {
  assert.equal(needsReveal('cvv'), true);
  assert.equal(needsReveal('pin'), true);

  for (const ungated of ['number', 'expiry', 'holder', 'iban', 'accountNumber', 'address', 'swift']) {
    assert.equal(needsReveal(ungated), false, `${ungated} must not have grown a gate`);
  }
});

test('the gated list is exactly the two fields the design names', () => {
  assert.deepEqual([...GATED_FIELDS].sort(), ['cvv', 'pin']);
});

test('the prompt says what will be on screen, and never the value', () => {
  // Somebody who cannot see what they are agreeing to cannot meaningfully agree to it — so the
  // question names the field. It must not name the value, for the reason every message here does not.
  const text = revealPrompt('CVV');

  assert.match(text, /CVV/);
  assert.match(text, /only kind of field/i, 'and it admits this is an exception to how the vault works');
  assert.ok(!text.includes('123'), 'no value in a prompt');
});

test('the phrase prompt says seeing it once is having it', () => {
  const text = phraseRevealPrompt(12);

  assert.match(text, /12 words/);
  assert.match(text, /closes itself/i, 'and that the view does not stay open');
});

test('the visible window is long enough to write down a phrase, and is not configurable', () => {
  // A setting here is one somebody would raise to "never", which is the state the measure prevents.
  assert.ok(PHRASE_VISIBLE_MS >= 60_000, 'twelve words at a human pace');
  assert.ok(PHRASE_VISIBLE_MS <= 300_000, 'and not a window left open on a desk');
});

test('a phrase buffer gives back exactly the words it was given', () => {
  const words = ['abandon', 'ability', 'able', 'about'];
  assert.deepEqual(PhraseBuffer.of(words).words(), words);
});

test('the buffer never hands back a joined string — measure 5.1', () => {
  // The whole point: every reader takes an ARRAY and puts the words in separate nodes. A method that
  // returned one string would put the assembled phrase into the heap as a string nobody can zero.
  const buffer = PhraseBuffer.of(['abandon', 'ability']);
  const value: unknown = buffer.words();

  assert.ok(Array.isArray(value), 'words() must not be a string');
});

test('closing zeroes what we allocated, and the buffer then holds nothing', () => {
  // Asserted by reading it back, because "we zeroed it" is a claim and this is the evidence.
  const buffer = PhraseBuffer.of(['abandon', 'ability', 'able']);
  assert.equal(buffer.cleared, false);

  buffer.clear();

  assert.equal(buffer.cleared, true);
  assert.deepEqual(buffer.words(), [], 'and it decodes to nothing');
});

test('closing twice is not a crash at the moment the value is going away', () => {
  // A view can be closed by its own timer and by the person, in either order.
  const buffer = PhraseBuffer.of(['abandon']);
  buffer.clear();
  buffer.clear();
  assert.equal(buffer.cleared, true);
});

test('an empty phrase makes an empty buffer rather than one holding a space', () => {
  const buffer = PhraseBuffer.of([]);
  assert.equal(buffer.length, 0);
  assert.deepEqual(buffer.words(), []);
});

test('a phrase with non-ASCII words survives the round trip', () => {
  // Japanese and Chinese lists are the ordinary case here, not an edge one.
  const words = ['あいこくしん', 'あおぞら', '的', 'ábaco'];
  assert.deepEqual(PhraseBuffer.of(words).words(), words);
});

test('the buffer knows its length without anybody joining it', () => {
  assert.equal(PhraseBuffer.of(['a', 'b', 'c']).length, 3);
});
