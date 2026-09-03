import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weaveExample } from '../weaveExample';
import { SHUFFLE_CODES, shuffleTokens } from '../shuffle';

/**
 * The example the weaving controls never had. Somebody was asked to pick one of twelve methods,
 * told the choice is stored nowhere and that forgetting it loses the value — and shown nothing at
 * all about what any of the twelve does.
 */

/**
 * Deterministic, but not CONSTANT.
 *
 * <p>A source that always answers the same number is one `generateDecoy` correctly refuses to work
 * with: every draw collides and it gives up rather than handing back the value it was hiding. So the
 * test needs a pinned SEQUENCE, which is what makes these assertions repeatable without being a
 * broken source.</p>
 */
function pinnedRandom(): () => number {
  let seed = 20260903;
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

const random = pinnedRandom();

test('the example has the SHAPE of the field it is about', () => {
  assert.equal(weaveExample('cvv', SHUFFLE_CODES[0], random).first.length, 3, 'a CVV is three digits');
  assert.equal(weaveExample('pin', SHUFFLE_CODES[0], random).first.length, 4);
  assert.equal(weaveExample('number', SHUFFLE_CODES[0], random).first.length, 16);
});

test('the two columns are different, so the method is visibly doing something', () => {
  // `generateDecoy` guarantees only that it differs from what it was GIVEN, so the second sample is
  // drawn against the first. Both against one seed could hand back a matching pair.
  const example = weaveExample('number', SHUFFLE_CODES[3], random);

  assert.notDeepEqual(example.first, example.second);
});

test('the third column is exactly what the real weave would produce', () => {
  // The point of the picture: if it were computed any other way it could show one thing while the
  // save did another, and nobody would find out until the value could not be rebuilt.
  const example = weaveExample('pin', SHUFFLE_CODES[7], random);

  assert.deepEqual(
    example.woven.map((token) => token.text),
    shuffleTokens(example.first, example.second, SHUFFLE_CODES[7]),
  );
});

test('every token says which half it came from, and both halves are represented', () => {
  const example = weaveExample('cvv', SHUFFLE_CODES[0], random);
  const sides = new Set(example.woven.map((token) => token.side));

  assert.deepEqual([...sides].sort(), ['first', 'second']);
  assert.equal(example.woven.length, example.first.length + example.second.length);
});

test('the example is generated and never a real value — nothing is passed in but a field name', () => {
  // The signature IS the guarantee: there is no parameter through which a stored value could reach
  // this. Drawing somebody's real number beside the decoy it is woven with, under the method that
  // wove them, would put the answer on screen next to the question.
  const example = weaveExample('number', SHUFFLE_CODES[1], random);

  assert.equal(weaveExample.length, 3, 'field, method, randomness — and nothing else');
  assert.notEqual(example.first.join(''), '4111111111111111', 'not even the shape it was seeded from');
});

test('every method produces a full weave for every weavable field', () => {
  for (const field of ['number', 'cvv', 'pin', 'iban', 'accountNumber'] as const) {
    for (const code of SHUFFLE_CODES) {
      const example = weaveExample(field, code, random);
      assert.equal(
        example.woven.length,
        example.first.length * 2,
        `${field} under ${code} lost tokens`,
      );
    }
  }
});
