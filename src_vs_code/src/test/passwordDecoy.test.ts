import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateDecoy } from '../decoyDigits';
import { DIGITS, LOWER, SYMBOLS, UPPER } from '../secretGenerator';

/**
 * A decoy for a PASSWORD — the fifth shape, and the one whose rule was argued over.
 *
 * <p>A review round proposed drawing it from the full alphabet, so that the decoy tells nobody which
 * classes the real password uses. That was rejected, and these tests are the reason: a woven value
 * is the two halves INTERLEAVED, so a character from a class the real password does not use is
 * provably decoy. The halves would separate by inspection, with no method and no guessing.</p>
 */

function pinnedRandom(): () => number {
  let seed = 20260903;
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

const classesIn = (value: string): string[] =>
  [
    ['lower', LOWER],
    ['upper', UPPER],
    ['digits', DIGITS],
    ['symbols', SYMBOLS],
  ]
    .filter(([, set]) => [...value].some((one) => set.includes(one)))
    .map(([name]) => name as string);

test('a decoy is the same LENGTH as the password it hides', () => {
  const random = pinnedRandom();

  for (const password of ['hunter2', 'aB3$xY9!qW', 'x', 'correct-horse-battery-staple']) {
    assert.equal(generateDecoy({ kind: 'password', original: password }, random).length, password.length);
  }
});

test('a decoy uses NO class the real password does not — otherwise the halves separate by eye', () => {
  const random = pinnedRandom();

  for (const password of ['alllowercase', 'ALLUPPER', '12345678', 'lower123', 'aB3$xY9!']) {
    const decoy = generateDecoy({ kind: 'password', original: password }, random);

    assert.deepEqual(
      classesIn(decoy),
      classesIn(password),
      `"${decoy}" uses classes "${password}" does not, which marks every one of those characters as decoy`,
    );
  }
});

test('a decoy is never the value it hides', () => {
  const random = pinnedRandom();

  for (let attempt = 0; attempt < 50; attempt += 1) {
    assert.notEqual(generateDecoy({ kind: 'password', original: 'hunter2' }, random), 'hunter2');
  }
});

test('two decoys for one password differ, so the pair is not a constant', () => {
  const random = pinnedRandom();
  const one = generateDecoy({ kind: 'password', original: 'aB3$xY9!qW' }, random);
  const two = generateDecoy({ kind: 'password', original: 'aB3$xY9!qW' }, random);

  assert.notEqual(one, two);
});

test('a character no class of ours names is still drawable, so it cannot mark its own half', () => {
  // A password with a letter outside LOWER/UPPER/DIGITS/SYMBOLS — an accented one, say. If the
  // decoy could never contain such a character, its position in the woven value would name the
  // real half at a glance.
  const random = pinnedRandom();
  const password = 'naïve';

  const decoy = generateDecoy({ kind: 'password', original: password }, random);

  assert.equal(decoy.length, password.length);
  const drawnFrom = new Set([...decoy]);
  assert.ok(
    [...drawnFrom].every((one) => 'naïve'.includes(one) || LOWER.includes(one)),
    `"${decoy}" drew from outside the classes the password uses`,
  );
});

test('an empty password is REFUSED, like every other shape refuses one', () => {
  // `generateDecoy`'s contract is that it throws rather than handing back the value it was hiding,
  // and there is no decoy for an empty string. Every other kind does the same. Nothing can reach
  // here anyway — weaving needs at least two tokens (`MIN_SHUFFLE_TOKENS`) — and a generator that
  // quietly answered "" for a value it could not hide would be worse than one that says so.
  assert.throws(() => generateDecoy({ kind: 'password', original: '' }, pinnedRandom()));
});
