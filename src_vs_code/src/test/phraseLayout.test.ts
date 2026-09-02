import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHUFFLE_CODES, shuffleTokens, unshuffleTokens } from '../shuffle';
import {
  dehorizontalize,
  layoutRefusal,
  layoutsFor,
  methodCount,
  methodOrder,
  phraseColumns,
  phraseRefusal,
  phraseSaveWarning,
} from '../phraseLayout';

/**
 * Two columns, two layouts — and the arithmetic that decides which layouts exist.
 *
 * <p>The finding this file is built around: horizontal splits each phrase in half and pairs the
 * halves, so it needs an EVEN number of words. At 25 — standard Monero, and squarely inside the 6–50
 * range — that gives 13 and 12, one column of 26 tokens against one of 24, and the weave refuses. The
 * save then dies at the last step with the whole form already filled in.</p>
 *
 * <p>So these tests assert the OFFER, not only the refusal. A refusal after a form is filled is the
 * failure being prevented; a test that only checks the refusal would pass on the broken design.</p>
 */

const words = (n: number): readonly string[] => Array.from({ length: n }, (_, i) => `w${i}`);

test('a 25-word phrase is never OFFERED the layout that cannot save it', () => {
  assert.deepEqual(layoutsFor(25), ['vertical'], 'the Monero length, and the one that used to break');
  assert.deepEqual(layoutsFor(13), ['vertical']);
  assert.deepEqual(layoutsFor(7), ['vertical']);
});

test('an even-length phrase gets both', () => {
  assert.deepEqual(layoutsFor(24), ['vertical', 'horizontal']);
  assert.deepEqual(layoutsFor(12), ['vertical', 'horizontal']);
  assert.deepEqual(layoutsFor(6), ['vertical', 'horizontal']);
});

test('and a 25-word phrase SAVES under the layout it is offered', () => {
  // The other half of the same requirement: refusing the impossible layout is only right if the
  // possible one works. `phraseColumns` must produce two equal columns for vertical at any length.
  const real = words(25);
  const second = words(25).map((w) => `${w}b`);

  const columns = phraseColumns(real, second, 'vertical');

  assert.equal(columns.first.length, columns.secondColumn.length, 'equal columns, so it can be woven');
  assert.equal(phraseRefusal(columns.first, columns.secondColumn), '', 'and the weave does not refuse');
});

test('the horizontal layout pairs the halves, and both columns come out equal', () => {
  const real = words(12);
  const second = words(12).map((w) => `${w}b`);

  const columns = phraseColumns(real, second, 'horizontal');

  assert.equal(columns.first.length, 12, 'first halves of both');
  assert.equal(columns.secondColumn.length, 12, 'second halves of both');
  assert.deepEqual(columns.first.slice(0, 6), real.slice(0, 6));
  assert.deepEqual(columns.first.slice(6), second.slice(0, 6));
});

test('either layout round-trips through the weave, for every method', () => {
  // The property that makes a layout usable at all: what goes in comes back out.
  const real = words(12);
  const second = words(12).map((w) => `${w}b`);

  for (const layout of ['vertical', 'horizontal'] as const) {
    const columns = phraseColumns(real, second, layout);
    for (const code of SHUFFLE_CODES) {
      const back = unshuffleTokens(shuffleTokens(columns.first, columns.secondColumn, code), code);
      assert.deepEqual(back.first, columns.first, `${layout}/${code} lost the first column`);
      assert.deepEqual(back.second, columns.secondColumn);
    }
  }
});

test('the missing layout is EXPLAINED, and the explanation names the number', () => {
  // A control that silently has fewer options than somebody remembers is one they think is broken.
  const text = layoutRefusal(25);

  assert.match(text, /even/i);
  assert.match(text, /25/);
  assert.equal(layoutRefusal(24), '', 'nothing to explain when nothing is missing');
});

test('an odd-length phrase has twelve methods and an even one twenty-four', () => {
  // Stated on screen because the arithmetic must not surprise anybody at save time. It is NOT a
  // defence either way — enumerating 24 is no dearer than 12.
  assert.equal(methodCount(25), 12);
  assert.equal(methodCount(24), 24);
});

test('the method list is in a different order each time the form opens', () => {
  // So "the third one" never becomes a habit worth forming: a method remembered by POSITION is one a
  // later release could silently move, and a phrase woven under a method nobody can name is gone.
  const seeded = (seed: number) => {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  };

  const first = methodOrder(seeded(1)).join(',');
  const second = methodOrder(seeded(2)).join(',');

  assert.notEqual(first, second, 'two opens gave the same order');
});

test('shuffling the method list never loses or invents a method', () => {
  const seeded = (seed: number) => {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  };

  for (let seed = 1; seed <= 20; seed++) {
    assert.deepEqual([...methodOrder(seeded(seed))].sort(), [...SHUFFLE_CODES].sort(), `seed ${seed}`);
  }
});

test('unequal columns refuse in WORDS, not silently', () => {
  // A second real key must be the same length as the first — a requirement of weaving, not ours — and
  // the form has to say so rather than failing at the last step.
  const refusal = phraseRefusal(words(12), words(11));

  assert.notEqual(refusal, '');
  assert.match(refusal, /same length/i);
});

test('a phrase outside the accepted range refuses, and says the range', () => {
  assert.match(phraseRefusal(words(3), words(3)), /between 6 and 50/);
  assert.equal(phraseRefusal(words(12), words(12)), '', 'and an ordinary phrase does not');
});

test('the save confirmation says the thing nobody can be allowed to miss', () => {
  const text = phraseSaveWarning(12, 'vertical');

  assert.match(text, /nowhere/i, 'the method is kept nowhere');
  assert.match(text, /backup/i, 'and not in a backup either');
  assert.match(text, /gone|recover/i, 'and what that means');
  assert.match(text, /24/, 'and how many methods there are to remember one of');
});

test('the confirmation never contains the phrase', () => {
  const text = phraseSaveWarning(25, 'vertical');
  for (const word of ['abandon', 'legal', 'w0']) {
    assert.ok(!text.includes(word), `${word} reached the confirmation`);
  }
});

test('a horizontal phrase round-trips to THE ORIGINAL PHRASE, not just to two columns', () => {
  // The test whose absence a review caught, and the distinction is the whole point: the round-trip
  // test above proves `shuffleTokens`/`unshuffleTokens` invert at the COLUMN level, which stays green
  // even if the layout is never undone. Under horizontal, each recovered column is half real and half
  // decoy — two rows that are neither phrase.
  //
  // Asserted on the real phrase, because a test that only checks the columns come back is exactly the
  // test that would have missed this.
  const real = ['w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7'];
  const decoy = real.map((w) => `${w}-decoy`);

  for (const code of SHUFFLE_CODES) {
    const columns = phraseColumns(real, decoy, 'horizontal');
    const back = unshuffleTokens(shuffleTokens(columns.first, columns.secondColumn, code), code);
    const undone = dehorizontalize(back.first, back.second, 'horizontal');

    assert.deepEqual(undone.real, real, `${code}: the phrase did not come back`);
    assert.deepEqual(undone.decoy, decoy, `${code}: the decoy did not come back`);
  }
});

test('the vertical layout needs no undoing, and undoing it changes nothing', () => {
  const real = ['a', 'b', 'c', 'd'];
  const decoy = ['x', 'y', 'z', 'w'];

  const columns = phraseColumns(real, decoy, 'vertical');
  const undone = dehorizontalize(columns.first, columns.secondColumn, 'vertical');

  assert.deepEqual(undone.real, real);
  assert.deepEqual(undone.decoy, decoy);
});

test('the split and its inverse read the SAME halving, at every even length', () => {
  // A split that disagrees with its own inverse destroys the value silently: the original is nowhere,
  // so nobody could ever notice. Checked across lengths rather than at one.
  for (const length of [2, 4, 6, 8, 12, 24, 50]) {
    const real = Array.from({ length }, (_, i) => `r${i}`);
    const decoy = Array.from({ length }, (_, i) => `d${i}`);

    const columns = phraseColumns(real, decoy, 'horizontal');
    const undone = dehorizontalize(columns.first, columns.secondColumn, 'horizontal');

    assert.deepEqual(undone.real, real, `length ${length}`);
    assert.deepEqual(undone.decoy, decoy, `length ${length}`);
  }
});
