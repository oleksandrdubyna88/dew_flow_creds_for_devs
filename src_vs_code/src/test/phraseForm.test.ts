import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PhraseInput, phraseInputFrom, phraseRecordFor, phraseRefusalFor } from '../phraseSaveGate';
import { FORM_SECTIONS, colorCollisionsForKind } from '../formSections';
import { phraseMarkup } from '../phraseFormMarkup';
import { phraseFormScript } from '../phraseFormScript';
import { horizontalCounts, layoutsFor } from '../phraseLayout';
import { PHRASE_RANGE, SHUFFLE_CODES, methodLabel } from '../shuffle';
import { weaveExample } from '../weaveExample';
import { formWeaveScripts } from '../formWeaveScripts';
import { formVisibilityScript } from '../formVisibilityScript';
import { MiniDocument, MiniWindow, runFragment } from './miniDom';
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

/**
 * The phrase picker was the one that still numbered by POSITION, and it had no picture at all.
 *
 * <p>`shuffle.ts` records why that matters: the method is stored NOWHERE, so a label naming a
 * different algorithm on the surface where the value must be read back is not cosmetic — it is the
 * phrase becoming unreadable by the only route there is. The card and password pickers draw a fresh
 * ORDER and keep the NAME bound to the code (`methodOrder` + `methodLabel`); this one built its
 * options straight from `SHUFFLE_CODES` and labelled them by index, so its "Method 5" was the fifth
 * code rather than the fifth-named one. That happened to agree, which is worse than disagreeing:
 * the two surfaces were the same by luck and nothing was watching.</p>
 */
test('the phrase picker draws its ORDER and keeps the NAME on the code, like the other two', () => {
  // A fixed draw, so the assertion is about the order being the drawn one rather than about luck.
  const codes = [...SHUFFLE_CODES];
  const reversed = [...codes].reverse();
  let call = 0;
  // `methodOrder` consumes the source; a descending stream reverses a Fisher-Yates shuffle's input
  // deterministically. What is asserted is not the exact permutation but that it is NOT source order
  // and that each option's label is the one `methodLabel` gives its own code.
  const markup = phraseMarkup((id) => `<fieldset id="${id}">`, () => {
    call += 1;
    return (call % 7) / 7;
  });

  const picker = markup.slice(markup.indexOf('id="phraseMethod"'));
  const own = picker.slice(0, picker.indexOf('</select>'));
  const options = [...own.matchAll(/<option value="(f\d+)">([^<]+)<\/option>/g)];

  assert.equal(options.length, SHUFFLE_CODES.length, 'every method is offered');
  for (const [, code, label] of options) {
    assert.equal(label, methodLabel(code as (typeof SHUFFLE_CODES)[number]), `${code} is labelled by its own name`);
  }
  assert.notDeepEqual(options.map(([, code]) => code), codes, 'the order is drawn, not the source order');
  assert.notDeepEqual(options.map(([, code]) => code), reversed, 'and it is a draw, not a reverse');
});

test('the phrase form shows what the method does, before it is irreversible', () => {
  const markup = phraseMarkup((id) => `<fieldset id="${id}">`);

  assert.match(markup, /id="phraseExample"/, 'a host for the picture, under the method');
  assert.match(phraseFormScript(), /type: 'weaveExample', field: 'mixed'/, 'asked per method');
  assert.match(phraseFormScript(), /paintExample\(\s*'phraseExample',\s*'mixed'/, 'painted by the shared painter');
});

test('the phrase example is drawn from made-up WORDS, never from the person own phrase', () => {
  const drawn = weaveExample('mixed', SHUFFLE_CODES[0], Math.random);

  assert.equal(drawn.first.length, drawn.second.length, 'two columns of the same length');
  assert.ok(drawn.first.every((word) => /^[a-z]+$/.test(word)), 'words, not characters');
  assert.ok(drawn.first.length >= 4, 'enough of them that the method visibly moves something');
  assert.deepEqual(
    drawn.woven.map((slot) => slot.text).slice().sort(),
    [...drawn.first, ...drawn.second].sort(),
    'the weave is those two columns and nothing else',
  );
});

test('the phrase example halves are FIXED — no path feeds a real phrase into the picture', () => {
  // The gate's finding, and it is right: "lowercase words of equal length" is satisfied by the
  // person's own phrase lowercased. So the halves are asserted exactly, and a sentinel phrase is
  // driven through every argument the example takes to prove none of it can reach the output.
  const drawn = weaveExample('mixed', SHUFFLE_CODES[0], Math.random);

  assert.deepEqual([...drawn.first], ['apple', 'river', 'stone', 'cloud', 'maple', 'frost']);
  assert.deepEqual([...drawn.second], ['tiger', 'candle', 'orbit', 'meadow', 'silver', 'pine']);

  const sentinel = ['correct', 'horse', 'battery', 'staple', 'abandon', 'zoo'];
  for (const code of SHUFFLE_CODES) {
    // The random source is the only thing an example takes from outside, and a phrase is not it.
    const again = weaveExample('mixed', code, () => 0.5);
    const shown = [...again.first, ...again.second, ...again.woven.map((slot) => slot.text)];
    for (const word of sentinel) {
      assert.ok(!shown.includes(word), `${word} reached the ${code} example`);
    }
  }
});

/**
 * The phrase example is asked for only while the phrase form is the one on screen.
 *
 * <p>The code round's finding: every payment entity carries all three fieldsets and hides the two it
 * is not, so an unconditional request on mount asked the host a question on every card and bank form
 * ever opened, and painted a tree nobody could see.</p>
 */
function phrasePage(showing: boolean): { posted: unknown[]; document: MiniDocument } {
  const document = new MiniDocument();
  const section = document.place('phraseSection', 'fieldset');
  section.style.display = showing ? '' : 'none';
  document.place('phraseExample', 'div', section);
  document.place('phraseMethod', 'select', section).value = 'f2';
  document.place('paymentForm', 'select').value = showing ? 'phrase' : 'card';
  const posted: unknown[] = [];
  runFragment(formWeaveScripts(), document, [], posted, new MiniWindow());
  return { posted, document };
}

const exampleAsks = (posted: unknown[]): unknown[] =>
  posted.filter((one) => (one as { type?: string; field?: string }).field === 'mixed');

test('a card form does not ask the host for a phrase example it cannot show', () => {
  assert.deepEqual(exampleAsks(phrasePage(false).posted), []);
});

test('a phrase form asks for one on mount, and again when the form becomes the chosen one', () => {
  const shown = phrasePage(true);
  assert.equal(exampleAsks(shown.posted).length, 1, 'asked once on mount');
  assert.equal((exampleAsks(shown.posted)[0] as { code?: string }).code, 'f2', 'for the method on screen');

  // The other half of that transition belongs to the page's own show/hide script, which needs the
  // whole form's DOM to run — more than this harness may grow into. So it is PINNED rather than
  // quietly assumed: the generated fragment is asserted to show `phraseSection` from the selector's
  // value, and THAT is what justifies setting the display by hand on the next line. Without it the
  // test would pass even if choosing Phrase never revealed the section at all (found by the
  // automated reviewer on the pull request).
  const visibility = formVisibilityScript();
  assert.match(visibility, /show\('phraseSection'/, 'the page shows this section by id');
  assert.match(visibility, /val\('paymentForm'\) === 'phrase'/, 'and it is the selector that decides');

  const hidden = phrasePage(false);
  hidden.document.getElementById('phraseSection')!.style.display = '';
  hidden.document.getElementById('paymentForm')!.fire('change');

  assert.equal(exampleAsks(hidden.posted).length, 1, 'and once the form becomes visible, asked then');
});
