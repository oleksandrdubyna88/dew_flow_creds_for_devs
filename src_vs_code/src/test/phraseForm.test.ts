import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PhraseInput, phraseInputFrom, phraseRecordFor, phraseRefusalFor } from '../phraseSaveGate';
import { FORM_SECTIONS, colorCollisionsForKind } from '../formSections';
import { phraseMarkup } from '../phraseFormMarkup';
import { phraseFormScript } from '../phraseFormScript';
import { horizontalCounts, layoutsFor } from '../phraseLayout';
import { PHRASE_RANGE, SHUFFLE_CODES } from '../shuffle';
import { readingFor, rowOf } from '../paymentViewMessages';
import { hasMixedField } from '../mixedFieldGuard';
import { wovenKeys } from '../paymentFields';
import { loadWithVscode } from './vscodeStub';

/**
 * The phrase form — the third option the selector has been offering since the kind shipped, with
 * nothing behind it. Choosing it left the selector alone on screen and saved an empty record.
 *
 * <p>The round-trip tests matter most: a phrase is stored ONLY as its woven form, so if the form and
 * the viewer ever disagreed about the layout or the order, the phrase would be gone — with no error
 * at any step, because there is no original left anywhere to compare against.</p>
 */

const REAL = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
const OWN = ['zulu', 'yankee', 'xray', 'whiskey', 'victor', 'uniform'];

function input(overrides: Partial<PhraseInput> = {}): PhraseInput {
  return {
    words: REAL,
    second: [],
    ownWords: false,
    listFirst: 'bip39-en',
    listSecond: 'bip39-en',
    layout: 'vertical',
    code: SHUFFLE_CODES[0],
    ...overrides,
  };
}

const random = (): number => 0.42;

test('a saved phrase is stored woven, and the record says which fields are', () => {
  const record = phraseRecordFor(input({ code: SHUFFLE_CODES[4] }), random);

  assert.equal(record.mixed?.length, REAL.length * 2, 'both columns, as one array of 2N tokens');
  assert.equal(record.layout, 'vertical');
  assert.equal(record.wordlistFirst, 'bip39-en');
  // A phrase is NOT named in `shuffledFields` — `mixed` is not a field that got woven, it IS the
  // woven phrase, and `SHUFFLEABLE_KEYS` excludes it by compiler-checked design. The first version
  // of this form wrote the name anyway; `pickPaymentFields` pruned it, correctly, and the record
  // came back holding a woven phrase that nothing recognised as woven — editable, and destroyed on
  // the next save. `wovenKeys` is where the two ways of marking one thing became one question.
  assert.equal(record.shuffledFields, undefined, 'the presence of `mixed` IS the mark');
  assert.deepEqual(wovenKeys(record), ['mixed']);
  assert.ok(hasMixedField(record), 'so the entry refuses to be opened for editing');
});

test('the record holds the phrase in NO other form — not as a string, not in order', () => {
  const record = phraseRecordFor(input({ code: SHUFFLE_CODES[6] }), random);

  const stored = JSON.stringify(record);
  assert.ok(!stored.includes(REAL.join(' ')), 'not joined');
  assert.ok(!stored.includes(REAL.join(',')), 'and not as a second array beside the woven one');
  // What IS in there is every word — woven with a decoy, which is the whole design. The property
  // that matters is that reading it back needs the method, and the method is stored nowhere:
  assert.ok(!stored.includes(SHUFFLE_CODES[6]), 'the method is kept NOWHERE, this record included');
});

test('a phrase saved through the form round-trips to the original words — both layouts', () => {
  for (const layout of ['vertical', 'horizontal'] as const) {
    const code = SHUFFLE_CODES[9];
    const record = phraseRecordFor(input({ layout, code }), random);

    const reading = readingFor(record, 'phrase', 'mixed', code);

    assert.deepEqual(rowOf(reading!, 'a'), REAL, `${layout}: the phrase comes back`);
    assert.equal(rowOf(reading!, 'b').length, REAL.length, `${layout}: and so does the other column`);
  }
});

test('a wrong method gives back something of the same shape, and never the phrase', () => {
  const record = phraseRecordFor(input({ code: SHUFFLE_CODES[2] }), random);

  const wrong = readingFor(record, 'phrase', 'mixed', SHUFFLE_CODES[3]);

  assert.equal(rowOf(wrong!, 'a').length, REAL.length, 'identical in form — that is the requirement');
  assert.notDeepEqual(rowOf(wrong!, 'a'), REAL);
});

test('own words are used as they are, and no decoy is drawn at all', () => {
  // Asserted with a random that would THROW: `generateDecoyPhrase` must not be reached when the
  // second column is the person's own, because there is nothing to fake — both halves are real.
  const explode = (): number => {
    throw new Error('a decoy was drawn for a second column that was typed');
  };

  const record = phraseRecordFor(input({ ownWords: true, second: OWN }), explode);

  const reading = readingFor(record, 'phrase', 'mixed', SHUFFLE_CODES[0]);
  assert.deepEqual(rowOf(reading!, 'a'), REAL);
  assert.deepEqual(rowOf(reading!, 'b'), OWN, 'the second column is the one that was typed');
  assert.equal(record.ownWords, true, 'and the record says so, because it changes what a leak costs');
});

test('an unequal own-words column is refused BEFORE anything is woven', () => {
  const refusal = phraseRefusalFor(input({ ownWords: true, second: OWN.slice(0, 4) }));

  assert.match(refusal, /same length/, 'and it says what is wrong in one sentence');
});

test('a phrase outside 6-50 words is refused, and an empty form is not a refusal at all', () => {
  assert.match(phraseRefusalFor(input({ words: ['one', 'two'] })), /between 6 and 50/);
  assert.equal(phraseRefusalFor(input({ words: [] })), '', 'nothing typed is nothing to refuse');
  assert.deepEqual(phraseRecordFor(input({ words: [] }), random), {}, 'and it stores nothing');
});

test('a 25-word phrase is never offered the side-by-side layout — the S4.4 arithmetic', () => {
  // 13 and 12: one column of 26 tokens against one of 24, and the save would die at the last step
  // with the whole form already filled in. So it is not offered rather than offered and refused.
  const twentyFive = Array.from({ length: 25 }, (_, i) => `word${i}`);

  assert.deepEqual(layoutsFor(25), ['vertical']);
  assert.ok(!horizontalCounts().includes(25), 'the table the FORM is given agrees');
  assert.match(phraseRefusalFor(input({ words: twentyFive, layout: 'horizontal' })), /even number/);
  assert.equal(phraseRefusalFor(input({ words: twentyFive })), '', 'and vertical saves');
});

test('the table the page is handed is DERIVED from layoutsFor, at every count in range', () => {
  // The page cannot call `layoutsFor`, so it is given that function's answers. This is what keeps
  // "derived" true rather than merely intended — a parity rule written into the script would be a
  // second copy of the rule that decides whether a phrase can be saved at all.
  const table = new Set(horizontalCounts());

  for (let count = PHRASE_RANGE.min; count <= PHRASE_RANGE.max; count++) {
    assert.equal(
      table.has(count),
      layoutsFor(count).includes('horizontal'),
      `the table and the rule disagree at ${count} words`,
    );
  }
});

test('the payload is read defensively — a webview can post anything', () => {
  const read = phraseInputFrom({
    phraseWords: 'alpha bravo\ncharlie   delta',
    phraseListFirst: 'not-a-list',
    phraseMethod: 'not-a-method',
    phraseLayout: 'sideways',
    phraseSecondMode: 'own',
  });

  assert.deepEqual(read.words, ['alpha', 'bravo', 'charlie', 'delta'], 'any run of whitespace');
  assert.equal(read.listFirst, 'bip39-en', 'an unknown list falls back rather than throwing later');
  assert.equal(read.code, SHUFFLE_CODES[0]);
  assert.equal(read.layout, 'vertical', 'and an unknown layout is the one that always works');
  assert.equal(read.ownWords, true);
});

test('the payment save routes a phrase to the phrase builder and leaves the card path alone', () => {
  // `paymentSaveGate` reaches `vscode` through `dialogs`, so it is loaded under the shared stub —
  // the routing is the thing being asserted, not any dialog.
  const { paymentRecordFor } = loadWithVscode<typeof import('../paymentSaveGate')>(
    '../paymentSaveGate',
    { window: {} },
  );
  const woven = paymentRecordFor(
    { paymentForm: 'phrase', phraseWords: REAL.join(' '), phraseMethod: SHUFFLE_CODES[1] },
    'phrase',
  );
  const card = paymentRecordFor({ paymentForm: 'card', cardNumber: '4111111111111111' }, 'card');

  assert.equal(woven.mixed?.length, 12, 'the phrase went through the phrase builder');
  assert.equal(card.number, '4111111111111111', 'and a card is untouched by any of this');
  assert.equal(card.mixed, undefined);
});

test('the phrase section exists, is gated on the FORM, and wears a colour of its own', () => {
  const section = FORM_SECTIONS.find((candidate) => candidate.id === 'phraseSection');

  assert.ok(section !== undefined, 'the option in the selector now has fields behind it');
  assert.deepEqual(section.kinds, ['payment']);
  assert.equal(section.condition, "val('paymentForm') === 'phrase'");
  assert.deepEqual(colorCollisionsForKind('payment'), [], 'three forms, three colours');
});

test('the form asks for both columns, the layout and the method — and stores no value in the page', () => {
  const markup = phraseMarkup((id) => `<fieldset id="${id}">`);

  for (const id of ['phraseWords', 'phraseSecond', 'phraseListFirst', 'phraseLayout', 'phraseMethod']) {
    assert.ok(markup.includes(`id="${id}"`), `${id} is on the form`);
  }
  assert.equal((markup.match(/Method \d+<\/option>/g) ?? []).length, SHUFFLE_CODES.length);
  assert.match(markup, /never stored/, 'the bargain is on screen where it is being made');
  assert.match(phraseFormScript(), /refreshLayout/, 'and the layout follows the word count');
});
