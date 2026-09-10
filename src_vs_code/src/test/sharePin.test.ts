import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PASSPHRASE } from '../secretGenerator';
import { SECRET_CLIPBOARD_TTL_MS } from '../secretClipboard';
import { validatePin } from '../pinPolicy';
import { generateSharePin, sharePinNotice, typedPin } from '../sharePin';

/**
 * The generator and the PIN policy are two modules that have never met, and a button that offers a
 * value the box beside it refuses is not a bug anyone would find by reading either one.
 */
test('a generated share PIN is never one the PIN policy would refuse', () => {
  for (let i = 0; i < 200; i += 1) {
    const pin = generateSharePin();
    assert.equal(
      validatePin(pin.value),
      undefined,
      `the box would refuse a PIN it generated itself: ${pin.value}`,
    );
  }
});

test('a generated share PIN is six words, joined the way the passphrase default joins them', () => {
  const pin = generateSharePin();
  const words = pin.value.split(DEFAULT_PASSPHRASE.separator);
  assert.equal(words.length, DEFAULT_PASSPHRASE.words, pin.value);
  assert.ok(
    words.every((w) => /^[a-z]{4}$/.test(w)),
    `every word must survive a chat and being read aloud: ${pin.value}`,
  );
});

test('two draws differ — the value is actually drawn, not a constant', () => {
  const drawn = new Set(Array.from({ length: 20 }, () => generateSharePin().value));
  assert.ok(drawn.size > 1, 'twenty draws produced one value');
});

test('the passphrase options are copied, so a share PIN cannot be reshaped from elsewhere', () => {
  const before = DEFAULT_PASSPHRASE.words;
  generateSharePin();
  assert.equal(DEFAULT_PASSPHRASE.words, before, 'generating must not write into the shared object');
});

test('a generated PIN is marked generated, a typed one is not', () => {
  assert.equal(generateSharePin().generated, true);
  assert.equal(typedPin('a-good-share-pin').generated, false);
  assert.equal(typedPin('a-good-share-pin').value, 'a-good-share-pin');
});

test('a typed PIN adds nothing to the delivery message', () => {
  assert.equal(sharePinNotice(typedPin('a-good-share-pin'), SECRET_CLIPBOARD_TTL_MS), '');
});

/**
 * The assertion that pins the decision, so a later edit cannot quietly put a live transit secret
 * into a surface this repository has already classified as retained and logged.
 */
test('the notice names the clipboard window and never contains the PIN', () => {
  const pin = generateSharePin();
  const notice = sharePinNotice(pin, SECRET_CLIPBOARD_TTL_MS);

  assert.ok(notice.includes('45s'), notice);
  assert.ok(!notice.includes(pin.value), 'the PIN must not travel in a notification');
  for (const word of pin.value.split(DEFAULT_PASSPHRASE.separator)) {
    // As a WORD, not as a substring. The draw pool is 256 four-letter words and exactly one of
    // them — `clip` — is a substring of this notice, inside "the clipboard": six draws made this
    // assertion fail 2.3% of the time, on a notice that never contained the PIN at all. Measured
    // after CI drew it on 2026-09-10. A boundary is what the property actually says.
    assert.doesNotMatch(notice, new RegExp(`\b${word}\b`), `a word of the PIN reached the notice: ${word}`);
  }
});

test('the notice reports whatever TTL it is given, not the built-in default', () => {
  assert.ok(sharePinNotice(generateSharePin(), 10_000).includes('10s'));
});
