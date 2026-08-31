import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIGITS_RANGE,
  PHRASE_RANGE,
  SHUFFLE_CODES,
  ShuffleCode,
  isShuffleCode,
  shuffleLayout,
  shuffleRefusal,
  shuffleTokens,
  unshuffleTokens,
} from '../shuffle';

/**
 * The twelve weaves, and the two properties that matter more than any of them.
 *
 * <p><b>Every method must be an exact permutation, and the inverse must be exact.</b> The original
 * is stored NOWHERE — a method that drops a token, or unweaves differently from how it wove,
 * destroys the thing it was asked to protect and says nothing. So the structural checks run over
 * every method at every awkward length rather than over a chosen example: 3 and 4 because a CVV
 * and a PIN are that short, 7 and 17 because they divide by neither two nor three, 50 because it
 * is the ceiling.</p>
 *
 * <p><b>And the documented examples are checked against the code.</b> `todo/ЗАДАЧА_варианты_
 * перемешивания_сид_фразы.md` teaches each method with a worked 12-word pair, and that document
 * feeds the help article. A worked example that has drifted from the method it claims to show is
 * worse than none: it teaches the wrong thing with authority, and the reader has no way to know.
 * These are those examples.</p>
 */

/** Labelled tokens, so a repeat can never hide a collision the way real digits would. */
const first = (n: number): string[] => Array.from({ length: n }, (_u, i) => `a${i}`);
const second = (n: number): string[] => Array.from({ length: n }, (_u, i) => `b${i}`);

/** A CVV, a PIN, the floor, two lengths that divide by neither two nor three, and the ceiling. */
const LENGTHS = [3, 4, PHRASE_RANGE.min, 7, 12, 17, PHRASE_RANGE.max];

test('every method is an exact permutation of the two halves, at every awkward length', () => {
  for (const length of LENGTHS) {
    const a = first(length);
    const b = second(length);
    const expected = [...a, ...b].sort();

    for (const code of SHUFFLE_CODES) {
      const woven = shuffleLayout(length, code).map((slot) =>
        slot.side === 'first' ? a[slot.index] : b[slot.index],
      );

      assert.equal(woven.length, 2 * length, `${code} at ${length}: wrong length`);
      assert.deepEqual([...woven].sort(), expected, `${code} at ${length}: not a permutation`);
    }
  }
});

test('unweaving is the exact inverse — of every method, at every length', () => {
  // The property the whole feature rests on. There is no second copy to fall back to.
  for (const length of LENGTHS) {
    const a = first(length);
    const b = second(length);

    for (const code of SHUFFLE_CODES) {
      const back = unshuffleTokens(shuffleTokens(a, b, code), code);

      assert.deepEqual(back.first, a, `${code} at ${length}: first half came back wrong`);
      assert.deepEqual(back.second, b, `${code} at ${length}: second half came back wrong`);
    }
  }
});

test('no two methods agree — not even on a three-token CVV', () => {
  // Written because the opposite was the obvious worry: twelve permutations of six slots could
  // collapse into fewer. Measured over every length the product allows, they do not. If a
  // thirteenth method is added one day and duplicates an existing one, this is what says so.
  for (const length of LENGTHS) {
    const seen = new Map<string, ShuffleCode>();

    for (const code of SHUFFLE_CODES) {
      const key = shuffleTokens(first(length), second(length), code).join(' ');
      const clash = seen.get(key);

      assert.equal(clash, undefined, `${code} is the same permutation as ${clash} at ${length}`);
      seen.set(key, code);
    }
  }
});

test('repeated tokens are carried, not deduplicated — digits are the ordinary case', () => {
  // A mnemonic rarely repeats a word; a PIN repeats digits constantly. The permutation is
  // positional, so this must simply work — and the assertion is on the multiset, because
  // "every token is distinct" is a property of words that digits do not have.
  const pin = ['1', '1', '1', '2', '2', '2'];
  const decoy = ['9', '9', '9', '9', '9', '9'];

  const woven = shuffleTokens(pin, decoy, 'f5');

  assert.equal(woven.length, 12);
  assert.deepEqual([...woven].sort(), [...pin, ...decoy].sort());
  assert.deepEqual(unshuffleTokens(woven, 'f5').first, pin);
});

test('a mismatched or out-of-range pair is refused in words a form can print', () => {
  // The RANGE belongs to the form, not to the shuffler — which is the whole reason it is an
  // argument. Three digits is a CVV and perfectly ordinary; three words is not a seed phrase.
  assert.match(shuffleRefusal(first(12), second(11), PHRASE_RANGE), /same length/);
  assert.match(shuffleRefusal(first(5), second(5), PHRASE_RANGE), /between/);
  assert.match(shuffleRefusal(first(51), second(51), PHRASE_RANGE), /between/);
  assert.equal(shuffleRefusal(first(12), second(12), PHRASE_RANGE), '');

  assert.equal(shuffleRefusal(first(3), second(3), DIGITS_RANGE), '', 'a CVV is three digits');
  assert.match(shuffleRefusal(first(3), second(3), PHRASE_RANGE), /between/, 'a phrase is not');

  assert.throws(() => shuffleTokens(first(12), second(11), 'f1'), /same length/);
  assert.throws(() => shuffleTokens(first(1), second(1), 'f1'), /at least/);
});

test('an odd woven length is refused rather than half-read', () => {
  // It cannot have come from here — every method produces 2N — and guessing at the halves of
  // something whose original is stored nowhere is the worst answer available.
  assert.throws(() => unshuffleTokens(['a', 'b', 'c'], 'f1'), /even length/);
});

test('a code from somewhere else is not a code', () => {
  assert.equal(isShuffleCode('f7'), true);
  assert.equal(isShuffleCode('f13'), false);
  assert.equal(isShuffleCode('F1'), false);
  assert.equal(isShuffleCode(7), false);
  assert.equal(SHUFFLE_CODES.length, 12);
});

// ---- the worked examples the documentation and the help article teach from ----

const REAL = 'anchor bridge cactus dolphin engine forest garden hammer island jungle kitten lemon';
const DECOY = 'marble napkin ocean puppy rocket silver tunnel umbrella velvet window yellow zebra';

const DOCUMENTED: Readonly<Record<ShuffleCode, string>> = {
  f1: 'anchor marble bridge napkin cactus ocean dolphin puppy engine rocket forest silver garden tunnel hammer umbrella island velvet jungle window kitten yellow lemon zebra',
  f2: 'marble anchor napkin bridge ocean cactus puppy dolphin rocket engine silver forest tunnel garden umbrella hammer velvet island window jungle yellow kitten zebra lemon',
  f3: 'bridge marble anchor napkin cactus ocean dolphin puppy engine rocket forest silver garden tunnel hammer umbrella island velvet jungle window kitten yellow lemon zebra',
  f4: 'marble anchor bridge napkin cactus ocean dolphin puppy engine rocket forest silver garden tunnel hammer umbrella island velvet jungle window kitten yellow zebra lemon',
  f5: 'anchor bridge marble napkin cactus dolphin ocean puppy engine forest rocket silver garden hammer tunnel umbrella island jungle velvet window kitten lemon yellow zebra',
  f6: 'anchor bridge cactus dolphin engine forest garden hammer island jungle kitten lemon marble napkin ocean puppy rocket silver tunnel umbrella velvet window yellow zebra',
  f7: 'anchor bridge cactus dolphin engine forest garden hammer island jungle kitten lemon zebra yellow window velvet umbrella tunnel silver rocket puppy ocean napkin marble',
  f8: 'island jungle kitten lemon marble napkin ocean puppy anchor bridge cactus dolphin engine forest garden hammer rocket silver tunnel umbrella velvet window yellow zebra',
  f9: 'anchor bridge cactus dolphin engine forest garden hammer rocket silver tunnel umbrella velvet window yellow zebra island jungle kitten lemon marble napkin ocean puppy',
  f10: 'lemon marble kitten napkin jungle ocean island puppy hammer rocket garden silver forest tunnel engine umbrella dolphin velvet cactus window bridge yellow anchor zebra',
  f11: 'yellow zebra cactus dolphin engine forest garden hammer island jungle kitten lemon marble napkin ocean puppy rocket silver tunnel umbrella velvet window anchor bridge',
  f12: 'zebra yellow cactus dolphin engine forest garden hammer island jungle kitten lemon marble napkin ocean puppy rocket silver tunnel umbrella velvet window bridge anchor',
};

test('the documented examples are what the code actually produces', () => {
  for (const code of SHUFFLE_CODES) {
    assert.equal(
      shuffleTokens(REAL.split(' '), DECOY.split(' '), code).join(' '),
      DOCUMENTED[code],
      `${code} no longer matches the example the documentation and the help teach from`,
    );
  }
});

test('f11 and f12 land the same four tokens in the same places, in a different order', () => {
  // Which is the whole difference between them, and the easiest pair to get wrong.
  const eleven = shuffleTokens(REAL.split(' '), DECOY.split(' '), 'f11');
  const twelve = shuffleTokens(REAL.split(' '), DECOY.split(' '), 'f12');

  assert.notDeepEqual(eleven, twelve);
  assert.deepEqual(eleven.slice(2, -2), twelve.slice(2, -2), 'only the two end pairs may differ');
  assert.deepEqual([eleven[0], eleven[1]].reverse(), [twelve[0], twelve[1]]);
  assert.deepEqual([eleven.at(-2), eleven.at(-1)].reverse(), [twelve.at(-2), twelve.at(-1)]);
});
