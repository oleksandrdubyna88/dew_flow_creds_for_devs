import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHUFFLE_CODES, shuffleTokens } from '../shuffle';
import { phraseColumns } from '../phraseLayout';
import { everyReading, reassemble } from '../phraseReassembly';
import { checksumHolds, wordsOf } from '../wordlists';

/**
 * Reassembly that hints at nothing.
 *
 * <p>The trap the parent plan names: a "valid BIP-39" tick beside the result turns twelve methods into
 * one second of enumeration, for exactly the person this scheme defends against. So the property being
 * tested here is a NEGATIVE one — a correct method and a wrong one must produce answers identical in
 * FORM — and it is the requirement, not a nicety.</p>
 */

const REAL = wordsOf(
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
);
const DECOY = wordsOf(
  'legal winner thank year wave sausage worth useful legal winner thank yellow',
);

function wovenUnder(code: (typeof SHUFFLE_CODES)[number], layout: 'vertical' | 'horizontal') {
  const columns = phraseColumns(REAL, DECOY, layout);
  return shuffleTokens(columns.first, columns.secondColumn, code);
}

test('the right method gives the phrase back, under either layout', () => {
  for (const layout of ['vertical', 'horizontal'] as const) {
    for (const code of SHUFFLE_CODES) {
      const reading = reassemble(wovenUnder(code, layout), code, layout);
      assert.deepEqual(reading.real, REAL, `${layout}/${code} did not give the phrase back`);
      assert.deepEqual(reading.decoy, DECOY);
    }
  }
});

test('a WRONG method answers in exactly the same form — no tick, no refusal, no clue', () => {
  // The whole requirement. Anything that distinguished the two here would do the enumeration for
  // whoever is reading over somebody's shoulder.
  const woven = wovenUnder('f1', 'vertical');

  const right = reassemble(woven, 'f1', 'vertical');
  const wrong = reassemble(woven, 'f7', 'vertical');

  assert.equal(wrong.real.length, right.real.length, 'same shape');
  assert.equal(wrong.decoy.length, right.decoy.length);
  assert.equal(typeof wrong.real[0], 'string', 'and words, not a marker of failure');
  assert.notDeepEqual(wrong.real, right.real, 'a different reading, which is all it is');
});

test('nothing in the answer says whether a reading checks out', () => {
  // Asserted structurally: the result carries two word arrays and NOTHING else. A `valid` flag, a
  // score, or a sorted order would each be the hint this module exists to withhold.
  const reading = reassemble(wovenUnder('f3', 'vertical'), 'f3', 'vertical');

  assert.deepEqual(Object.keys(reading).sort(), ['decoy', 'real']);
});

test('the CALLER could check a checksum, and this module never does', () => {
  // The distinction that keeps the design honest: the information is not hidden from the person, it
  // is simply not computed FOR them and put on screen where a shoulder can read it.
  const reading = reassemble(wovenUnder('f2', 'vertical'), 'f2', 'vertical');

  assert.equal(checksumHolds(reading.real, 'bip39-en'), true, 'the caller can ask');
  assert.ok(!('valid' in reading), 'and the answer does not carry it');
});

test('every reading is offered unranked, and the right one is somewhere in it', () => {
  // Not sorted, not scored: any ordering that put a likelier answer first would be doing the
  // enumeration for the wrong person.
  const woven = wovenUnder('f5', 'horizontal');

  const all = everyReading(woven, SHUFFLE_CODES, ['vertical', 'horizontal']);

  assert.equal(all.length, SHUFFLE_CODES.length * 2, 'every method against every layout');
  assert.ok(
    all.some((one) => one.code === 'f5' && one.layout === 'horizontal'
      && one.reading.real.join(' ') === REAL.join(' ')),
    'the correct reading is among them',
  );
  // The order is the one it was GIVEN — each code paired with each layout, in sequence — and not one
  // this module chose. Asserted as the actual pairing rather than as a list of codes, which is what
  // the first version of this line got wrong.
  assert.deepEqual(
    all.map((one) => `${one.code}/${one.layout}`),
    SHUFFLE_CODES.flatMap((code) => [`${code}/vertical`, `${code}/horizontal`]),
    'a ranked or sorted order would do the enumeration for the wrong person',
  );
});

test('a reading under the wrong LAYOUT is nonsense of the same shape, not an error', () => {
  // The case `dehorizontalize` exists for. Under the wrong layout the words come back in the wrong
  // places — and that must look like every other wrong answer, not like a failure.
  const woven = wovenUnder('f1', 'horizontal');

  const wrongLayout = reassemble(woven, 'f1', 'vertical');

  assert.equal(wrongLayout.real.length, REAL.length);
  assert.notDeepEqual(wrongLayout.real, REAL, 'the phrase does not come back under the wrong layout');
});

test('both halves come back as ARRAYS, never a joined string — measure 5.1', () => {
  const reading = reassemble(wovenUnder('f4', 'vertical'), 'f4', 'vertical');

  assert.ok(Array.isArray(reading.real));
  assert.ok(Array.isArray(reading.decoy));
});
