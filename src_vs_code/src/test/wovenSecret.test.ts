import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unweaveSecret, weaveRefusal, weaveSecret } from '../wovenSecret';
import { SHUFFLE_CODES } from '../shuffle';

/**
 * Weaving one secret string — the password's half of what `paymentWeaving` does for a record.
 *
 * <p>The round trip is the test that matters: a value that cannot be read back under the method it
 * was written with is a password nobody can recover, and there is no second copy anywhere.</p>
 */

function pinnedRandom(): () => number {
  let seed = 20260903;
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

test('a password comes back under the method it was woven with — every method, every time', () => {
  const random = pinnedRandom();
  const password = 'aB3$xY9!qW';

  for (const code of SHUFFLE_CODES) {
    const stored = weaveSecret(password, code, random);
    const reading = unweaveSecret(stored, code);

    assert.ok(reading !== undefined, `${code} produced something unreadable`);
    assert.ok(
      reading.first === password || reading.second === password,
      `${code} lost the password: got "${reading.first}" and "${reading.second}"`,
    );
  }
});

test('the stored value is twice the length, and is not the password', () => {
  const stored = weaveSecret('hunter2', SHUFFLE_CODES[0], pinnedRandom());

  assert.equal(stored.length, 14);
  assert.ok(!stored.includes('hunter2'), 'interleaved, not appended');
});

test('a WRONG method answers in the same shape as a right one', () => {
  // The property, not an omission. Anything that could tell a right reading from a wrong one would
  // do the guessing for whoever is reading over the person's shoulder.
  const random = pinnedRandom();
  const stored = weaveSecret('correct-horse', SHUFFLE_CODES[2], random);

  const right = unweaveSecret(stored, SHUFFLE_CODES[2]);
  const wrong = unweaveSecret(stored, SHUFFLE_CODES[7]);

  assert.ok(right !== undefined && wrong !== undefined);
  assert.equal(wrong.first.length, right.first.length);
  assert.equal(wrong.second.length, right.second.length);
  assert.notEqual(wrong.first, right.first, 'and it is genuinely a different reading');
});

test('the decoy is never handed back separately — it lives inside the stored value', () => {
  // What makes the pair recoverable from the stored string ALONE, with nothing else written down.
  const stored = weaveSecret('hunter2', SHUFFLE_CODES[0], pinnedRandom());
  const reading = unweaveSecret(stored, SHUFFLE_CODES[0]);

  assert.ok(reading !== undefined);
  assert.equal([...reading.first].length + [...reading.second].length, [...stored].length);
});

test('a password too short to weave is refused with a sentence, before anything is stored', () => {
  assert.match(weaveRefusal('x'), /cannot be woven/);
  assert.equal(weaveRefusal('ab'), '', 'two characters is the floor the methods need');
  assert.throws(() => weaveSecret('x', SHUFFLE_CODES[0], pinnedRandom()));
});

test('a stored value that cannot have come from here is refused rather than half-read', () => {
  // Every method produces 2N. An odd length is a record half-written by a build that crashed, and a
  // silently truncated recovery of something whose original is stored nowhere is the worst answer
  // available.
  assert.equal(unweaveSecret('abc', SHUFFLE_CODES[0]), undefined);
  assert.equal(unweaveSecret('', SHUFFLE_CODES[0]), undefined);
  assert.equal(unweaveSecret('ab', SHUFFLE_CODES[0]), undefined, 'one character a side is not a pair');
});
