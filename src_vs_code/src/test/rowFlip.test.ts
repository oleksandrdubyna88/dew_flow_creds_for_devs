import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

/**
 * The separator that is not there.
 *
 * <p>The store first keyed one map on the entity id joined to the field name by a NUL, and the NUL
 * landed in the source as a real byte — git committed the module as BINARY. It is two nested maps
 * now, so there is no separator to collide on and no control character to encode. Both halves are
 * asserted: keys that WOULD collide under a concatenation stay apart, and the source carries none.</p>
 */
test('entity and field cannot be confused for one another, whatever they contain', () => {
  // Under `entityId + SEP + key` these two pairs make the same string for SEP of '' or '|'.
  const store = new RowOrderStore(scripted(below, above));

  const left = store.orderFor('a|b', 'c');
  const right = store.orderFor('a', 'b|c');

  assert.equal(left, 'as-read');
  assert.equal(right, 'swapped', 'the second draw happened, so the two keys did not collide');
});

test('the module’s source holds no control byte — the defect that once made it a binary file', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'rowFlip.ts'), 'utf8');

  assert.ok(!source.includes(String.fromCharCode(0)), 'a NUL in source is how this went binary once');
  assert.ok(source.includes('orderFor'), 'and the scan is reading the right file');
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
