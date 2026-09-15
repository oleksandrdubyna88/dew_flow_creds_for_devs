import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RowOrderStore, SWAP_THRESHOLD, displayed } from '../rowFlip';

/**
 * The order the two readings are shown in: drawn once per entry, remembered, and told to nobody.
 *
 * <p>The guarantee underneath every test here is that the store is the ONLY thing that knows. If an
 * order can be read off a message, an id or a class, the feature it supports is decoration.</p>
 */

/** A random that hands back the numbers given, in order, then repeats the last one. */
const scripted = (...draws: readonly number[]) => {
  let at = 0;
  return () => draws[Math.min(at++, draws.length - 1)] ?? 0;
};

const below = SWAP_THRESHOLD - 0.4;
const above = SWAP_THRESHOLD + 0.4;

test('an entry’s order is minted ONCE and answered the same on every later ask', () => {
  let draws = 0;
  const store = new RowOrderStore(() => {
    draws += 1;
    return below;
  });

  const answers = [0, 1, 2, 3].map(() => store.orderFor('e1', 'password'));

  assert.equal(draws, 1, 'one draw, however many times it is asked');
  assert.deepEqual(answers, ['as-read', 'as-read', 'as-read', 'as-read'], 'and the same answer each time');
});

test('two fields of one entry, and one field of two entries, are drawn independently', () => {
  const store = new RowOrderStore(scripted(below, above, above));

  assert.equal(store.orderFor('e1', 'cvv'), 'as-read');
  assert.equal(store.orderFor('e1', 'pin'), 'swapped', 'a second field of the same card is its own draw');
  assert.equal(store.orderFor('e2', 'cvv'), 'swapped', 'and so is the same field of another entry');
  assert.equal(store.orderFor('e1', 'cvv'), 'as-read', 'while the first one is unchanged');
});

test('clear() forgets every order, and the next ask draws afresh', () => {
  const store = new RowOrderStore(scripted(below, above));

  assert.equal(store.orderFor('e1', 'password'), 'as-read');
  store.clear();
  assert.equal(
    store.orderFor('e1', 'password'),
    'swapped',
    're-opening an entry is exactly when the order should be drawn again',
  );
});

test('both orders are reachable, and which one is drawn is the random’s business alone', () => {
  assert.equal(new RowOrderStore(() => below).orderFor('e', 'k'), 'as-read');
  assert.equal(new RowOrderStore(() => above).orderFor('e', 'k'), 'swapped');
});

test('displayed() shows the arithmetic’s first reading SECOND under a swapped order, and names neither', () => {
  const pair = { first: ['mine'], second: ['other'] };

  const asRead = displayed(pair, 'as-read');
  const swapped = displayed(pair, 'swapped');

  assert.deepEqual(asRead, { first: ['mine'], second: ['other'] });
  assert.deepEqual(swapped, { first: ['other'], second: ['mine'] });
  // The shape is identical either way: same keys, same lengths. A reader of the RESULT cannot tell
  // which order produced it, which is the property every consumer downstream inherits.
  assert.deepEqual(Object.keys(asRead), Object.keys(swapped));
  assert.ok(!/real|decoy/i.test(JSON.stringify([asRead, swapped])));
});
