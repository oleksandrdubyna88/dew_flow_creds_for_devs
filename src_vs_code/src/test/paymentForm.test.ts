import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FORM_SECTIONS, colorCollisionsForKind, sectionsForKind } from '../formSections';
import { PAYMENT_FORMS } from '../paymentForm';
import { paymentMarkup } from '../paymentFormMarkup';
import { paymentCardMarkup } from '../paymentViewCard';
import { paymentCardFor } from '../paymentViewMessages';
import { PaymentFields } from '../paymentFields';
import { SHUFFLE_CODES } from '../shuffle';
import { CARD_BRANDS } from '../cardBrand';
import { brandFor } from '../cardFormFields';
import { cardFormScript } from '../cardFormScript';
import { formWeaveScripts } from '../formWeaveScripts';
import { weaveExamplePainterScript } from '../weaveExampleScript';
import { MiniDocument, MiniElement, MiniWindow, runFragment } from './miniDom';
import { BRAND_MARK_STYLES, brandMarkSvg } from '../cardBrandIcons';
import { formStyleSheet } from '../entityFormStyles';
import { formPageScript } from '../entityFormScript';

/**
 * The card form: a section that appears for `payment`, and a card fieldset inside it that appears
 * only for the card FORM.
 *
 * <p>Two levels of visibility, and the mechanism for the second already exists — `keySection` is the
 * precedent, hidden by `condition` when an SSH connection borrows another entry's key. The plan says
 * to use it rather than invent a second ladder, and the show/hide script is generated from
 * `FORM_SECTIONS`, so a correct entry here needs no change to `formVisibilityScript.ts` at all.</p>
 */

function sectionById(id: string) {
  const found = FORM_SECTIONS.find((section) => section.id === id);
  assert.ok(found !== undefined, `${id} is not in the catalog`);
  return found;
}

test('a payment entry gets the form selector, and only a payment entry does', () => {
  const forPayment = sectionsForKind('payment').map((s) => s.id);
  assert.ok(forPayment.includes('paymentSection'), 'the selector is there for a payment');

  for (const kind of ['credential', 'ssh', 'db', 'config'] as const) {
    assert.ok(
      !sectionsForKind(kind).includes(sectionById('paymentSection')),
      `${kind} must not be offered a payment form`,
    );
  }
});

test('the card fieldset is gated on the FORM, not on the kind', () => {
  // The distinction that makes this two sections instead of one: every payment has a form selector,
  // and only a card has card fields. Bank details and a phrase are the same kind and must not see
  // a CVV box.
  const card = sectionById('cardSection');
  assert.deepEqual(card.kinds, ['payment'], 'the kind narrows it first');
  assert.equal(card.condition, "val('paymentForm') === 'card'", 'and the form narrows it second');
});

test('the selector itself has no condition, or a payment could not choose its form', () => {
  assert.equal(sectionById('paymentSection').condition, undefined);
});

test('no two sections a payment entry can show at once wear the same colour', () => {
  // The property the whole scheme rests on, and the one thing adding a section most easily breaks.
  assert.deepEqual(colorCollisionsForKind('payment'), []);
});

test('adding the payment sections broke no other kind’s colours', () => {
  const broken = (['credential', 'ssh', 'sshkey', 'vpn', 'db', 'terminal', 'script', 'config'] as const).flatMap(
    (kind) => colorCollisionsForKind(kind),
  );
  assert.deepEqual(broken, []);
});

test('every payment form the model knows can actually be chosen', () => {
  // The selector and the model are one thing or they are two things that will drift: a form with no
  // option is a form nobody can pick, and an option with no form is one nothing can store.
  assert.deepEqual([...PAYMENT_FORMS].sort(), ['bank', 'card', 'phrase']);
});

test('the weave checkboxes are LIVE, now that a woven value can be read back', () => {
  // The inverse of the test that stood here, and the reason it stood here is worth keeping: while
  // there was no payment card in the viewer, ticking one of these boxes would have stored a value the
  // product could never show again, under a method kept nowhere — so nobody would have found out
  // until they needed it. The boxes were disabled and the form said why.
  //
  // `paymentViewCard.ts` is that missing half, and `paymentViewHost.readingFor` is its inverse, so
  // the boxes come on. What must NOT come back is a disabled attribute without the viewer: this
  // assertion is the pin holding the two together.
  const markup = paymentMarkup((id) => `<fieldset id="${id}">`, 'card');

  const boxes = markup.match(/class="mixMark"[^>]*/g) ?? [];
  assert.equal(boxes.length, 5, 'all five weavable fields are represented');
  for (const box of boxes) {
    assert.ok(!/disabled/.test(box), `a weave box is still switched off: ${box}`);
  }
  assert.ok(!/switched off/i.test(markup), 'and the paragraph explaining why they were off is gone');
  // The bargain itself stays on screen, exactly where somebody is about to make it.
  assert.match(markup, /never stored/, 'the form still says the method is kept nowhere');
});

/**
 * The one thing a person MUST remember, named the same way on both surfaces.
 *
 * <p>`shuffle.ts:27` states the intent — *"The methods, in their permanent order. The UI shows them
 * SHUFFLED; the code never moves."* Neither half was true: the form listed the codes in fixed order
 * and labelled them by POSITION, and the card shuffled the list and labelled THAT by position. So
 * the card's "Method 5" was a different algorithm on every open, and never the `f5` the form had
 * called "Method 5" when the value was woven.</p>
 *
 * <p>That is not a cosmetic disagreement. The method is stored NOWHERE — it lives only in the
 * person's memory — so a label that names a different algorithm on the surface where the value has
 * to be read back is the value becoming unreadable.</p>
 */
function methodsOf(markup: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const [, code, label] of markup.matchAll(/<option value="(f\d+)">([^<]+)<\/option>/g)) {
    pairs.set(label, code);
  }
  return pairs;
}

test('Method 5 names the same algorithm in the form and in the card, whatever the order', () => {
  const woven: PaymentFields = { number: '4111111111111111', shuffledFields: ['number'] };
  const form = methodsOf(paymentMarkup((id) => `<fieldset id="${id}">`, 'card'));
  const card = methodsOf(paymentCardMarkup(paymentCardFor('e1', 'card', woven, pinned(0.11))));

  assert.equal(form.size, SHUFFLE_CODES.length, 'the form offers every method');
  assert.equal(card.size, SHUFFLE_CODES.length, 'so does the card');
  for (const [label, code] of form) {
    assert.equal(card.get(label), code, `${label} means ${code} in the form and ${card.get(label)} in the card`);
  }
});

test('the labels are bound to the code, so a different draw renames nothing', () => {
  const woven: PaymentFields = { number: '4111111111111111', shuffledFields: ['number'] };
  const one = methodsOf(paymentCardMarkup(paymentCardFor('e1', 'card', woven, pinned(0.11))));
  const two = methodsOf(paymentCardMarkup(paymentCardFor('e1', 'card', woven, pinned(0.83))));

  for (const [label, code] of one) {
    assert.equal(two.get(label), code, `${label} moved between two opens of the same card`);
  }
});

/** A draw that is the same every call, so an order is a fact rather than a coin toss. */
function pinned(value: number): () => number {
  return () => value;
}

/**
 * The payment system is a field the person CONFIRMS — which is what `paymentFields.ts` has always
 * said it is, and what nothing could actually do.
 *
 * <p>Its only writer derived it from the typed number on every save, so a card whose prefix this
 * build does not recognise stored no system at all and there was no way to correct that from the
 * interface. That is exactly the case the stored field exists for: a number woven with a decoy has
 * no first digits left to read a system from, so after the save nothing can ever work it out.</p>
 */
test('the form offers the payment system, detected by default and correctable by hand', () => {
  const markup = paymentMarkup((id) => `<fieldset id="${id}">`, 'card');

  assert.match(markup, /<select id="cardBrand">/, 'there is a control at all');
  assert.match(markup, /<option value="">Detected automatically<\/option>/, 'and it defaults to reading it');
  for (const brand of CARD_BRANDS) {
    assert.ok(markup.includes(`<option value="${brand}">`), `${brand} can be chosen`);
  }
});

test('all nine marks are drawn, hidden — so a glyph never needs a stored value in the HTML', () => {
  const markup = paymentMarkup((id) => `<fieldset id="${id}">`, 'card');

  const marks = markup.match(/class="brandMark" data-brand="[a-z]+" hidden/g) ?? [];
  assert.equal(marks.length, CARD_BRANDS.length, 'every system has its mark in the page');
  assert.match(markup, /currentColor/, 'and it takes the colour of the text beside it, in either theme');
});

test('a chosen system is kept; an unchosen one is read from the number', () => {
  assert.equal(brandFor({ cardBrand: 'maestro', cardNumber: '4111111111111111' }), 'maestro',
    'what the person confirmed beats what the prefix says');
  assert.equal(brandFor({ cardBrand: '', cardNumber: '4111111111111111' }), 'visa',
    'and with no choice, the number still answers');
  assert.equal(brandFor({ cardBrand: 'not-a-system', cardNumber: '4111111111111111' }), 'visa',
    'a value this build does not know is not a choice');
  assert.equal(brandFor({ cardBrand: '', cardNumber: '9999999999999999' }), '',
    'an unrecognised number with no choice stores nothing, as before');
});

test('the per-field method rows are labelled the way a person reads them, not by record key', () => {
  const script = cardFormScript();

  assert.match(script, /FIELD_LABELS\[field\]/, 'the label comes from the shared table');
  assert.match(script, /"number":"Card number"/, 'and the table is handed to the page, not re-spelled in it');
  assert.ok(!script.includes('data-chosen'), 'the span nothing ever read is gone');
});

test('choosing a second field opens the per-field methods, instead of hiding them behind a button', () => {
  const script = cardFormScript();

  // With three fields ticked it was still behind "Give each field its own method…", which is why it
  // read as a feature that did not exist.
  assert.match(script, /picked\.length > 1[\s\S]{0,120}display = ''/, 'two marks open it');
});

test('the weaving controls show what a method DOES, on values nobody has to care about', () => {
  const markup = paymentMarkup((id) => `<fieldset id="${id}">`, 'card');
  const script = cardFormScript();

  assert.match(markup, /id="mixExample"/, 'there is somewhere for the picture to go');
  assert.match(markup, /never drawn here/, 'and it says out loud that the value shown is made up');
  assert.match(script, /type: 'weaveExample'/, 'the page asks the host, which is where it can be tested');
  assert.match(script, /weaveExampleResult/, 'and hands the answer on');
  // The painting itself is the SHARED painter now — one copy for the card, the password and the
  // phrase, because two copies is how the password picture lost the class its colours hang on.
  const painter = weaveExamplePainterScript();
  // Three columns: the value, the decoy, and where each token went.
  assert.match(painter, /What gets stored/);
  assert.ok(!/innerHTML/.test(painter), 'painted with DOM APIs');
});

test('an example is asked for per FIELD, so a CVV and a card number are not shown the same shape', () => {
  const script = cardFormScript();

  assert.match(script, /field: picked\[j\]/, 'one request per marked field');
  assert.match(weaveExamplePainterScript(), /\.weaveEx\[data-field="/, 'and each answer lands in its own block');
});

/**
 * The nine marks were all on screen at once, and the one that was not was under its field.
 *
 * <p>Two separate causes for what looked like one bug. On the read-only card `BRAND_MARK_STYLES`
 * sets `display: inline-flex` on `.brandMark`, and an AUTHOR rule with `display` beats the
 * browser's own `[hidden] { display: none }` — so every mark rendered however carefully the page
 * script set `.hidden`. On the form the styles were absent, so hiding worked and layout did not:
 * the select is `width: 100%`, nothing made the row a flex line, and the surviving mark wrapped
 * onto the line below.</p>
 *
 * <p>Both surfaces read the same constant, which is the point of it — the fix belongs there and
 * not in two stylesheets that would drift.</p>
 */
test('a hidden mark stays hidden, whatever display the class asks for', () => {
  assert.match(
    BRAND_MARK_STYLES,
    /\.brandMark\[hidden\]\s*\{[^}]*display:\s*none/,
    'the attribute needs an author rule of its own to beat an author rule',
  );
});

test('the mark is drawn four times the size the tree glyph is', () => {
  assert.match(BRAND_MARK_STYLES, /\.brandMark svg\s*\{[^}]*width:\s*64px/, 'four times 16');
  assert.match(BRAND_MARK_STYLES, /\.brandMark svg\s*\{[^}]*height:\s*64px/, 'square, as the viewBox is');
  assert.match(
    brandMarkSvg('visa'),
    /viewBox="0 0 16 16"/,
    'and scaled by CSS over the viewBox, so the generated 16px files are untouched',
  );
});

test('the form puts the mark beside the payment system, not under it', () => {
  const markup = paymentMarkup((id) => `<fieldset id="${id}">`, 'card');
  const styles = formStyleSheet(0);

  assert.match(markup, /class="line brandLine"/, 'the row says it is the brand row');
  assert.match(styles, /\.brandLine\s*\{[^}]*display:\s*flex/, 'and the form lays that row out as a line');
  assert.ok(styles.includes(BRAND_MARK_STYLES), 'the form draws the marks the same way the card does');
});

/**
 * The bank form's weaving controls were unreachable, and the save wove anyway.
 *
 * <p>`#mixControls` — the method picker, the warning, the per-field rows and the example — was
 * emitted inside `cardMarkup`, which `formSections.ts` hides whenever the form is not `card`. The
 * bank weave boxes live in `bankSection`, so ticking *Store the IBAN woven with a decoy* showed
 * nothing at all: no picker, no warning, no picture. The save still wove it, because
 * `entityFormScript.ts` reads `#mixMethod` off the hidden select and the gate accepts it. The IBAN
 * went into the vault under a method the person never saw — and the method is stored nowhere, so
 * that value was unreadable from the moment it was written.</p>
 */
test('the weaving controls are reachable from the bank form, not buried in the card section', () => {
  const bank = paymentMarkup((id) => `<fieldset id="${id}">`, 'bank');

  const cardOpens = bank.indexOf('<fieldset id="cardSection">');
  const bankOpens = bank.indexOf('<fieldset id="bankSection">');
  const method = bank.indexOf('id="mixMethod"');

  assert.ok(cardOpens >= 0 && bankOpens >= 0 && method >= 0, 'all three are on the page');
  assert.ok(method > bankOpens, 'the controls come after the bank fieldset, not inside the card one');
  assert.ok(
    !bank.slice(cardOpens, bankOpens).includes('id="mixMethod"'),
    'and nothing between the card fieldset and the bank one holds the picker',
  );
});

test('a ticked bank box counts as a marked field, exactly as a card box does', () => {
  const markup = paymentMarkup((id) => `<fieldset id="${id}">`, 'bank');
  const script = cardFormScript();

  // The collector reads the CLASS, so a box in either fieldset is one of the picked fields — which
  // is what makes one shared method picker the right answer for both forms.
  assert.match(script, /querySelectorAll\('\.mixMark'\)/);
  for (const id of ['mixBankIban', 'mixBankAccount']) {
    assert.match(markup, new RegExp(`id="${id}"[^>]*class="mixMark"`), `${id} is collected`);
  }
  for (const id of ['mixCardNumber', 'mixCardCvv', 'mixCardPin']) {
    assert.match(markup, new RegExp(`id="${id}"[^>]*class="mixMark"`), `${id} still is`);
  }
});

test('the card weave boxes stay with the card fields — only the shared controls moved', () => {
  const card = paymentMarkup((id) => `<fieldset id="${id}">`, 'card');

  const cardOpens = card.indexOf('<fieldset id="cardSection">');
  const bankOpens = card.indexOf('<fieldset id="bankSection">');

  assert.ok(card.slice(cardOpens, bankOpens).includes('id="mixCardCvv"'), 'the CVV box is a card field');
  assert.ok(!card.slice(cardOpens, bankOpens).includes('id="mixBankIban"'), 'and the IBAN box is not');
});

/**
 * The weaving controls, RUN rather than read — the gate's finding, and it is right.
 *
 * <p>Markup can put `#mixMethod` after the bank fieldset and give every checkbox `mixMark` while the
 * controls still never appear at runtime: an unbound listener, a wrapper left at `display:none`, a
 * collector that skips the bank boxes. The index assertions above would all pass. So this executes
 * the fragment against `miniDom`: tick a bank box, call `refreshMix`, and read what the page would
 * actually show.</p>
 */
function mixPage(): {
  document: MiniDocument;
  posted: unknown[];
  window: MiniWindow;
  api: Record<string, (...a: never[]) => unknown>;
} {
  const document = new MiniDocument();
  const cardSection = document.place('cardSection', 'fieldset');
  const bankSection = document.place('bankSection', 'fieldset');
  const mark = (id: string, field: string, into: MiniElement): MiniElement => {
    const box = document.place(id, 'input', into);
    box.className = 'mixMark';
    box.dataset.field = field;
    return box;
  };
  mark('mixCardNumber', 'number', cardSection);
  mark('mixBankIban', 'iban', bankSection);
  const controls = document.place('mixControls');
  controls.style.display = 'none';
  document.place('mixWarning');
  document.place('mixExample', 'div', controls);
  const method = document.place('mixMethod', 'select', controls);
  method.value = 'f3';
  const posted: unknown[] = [];
  const window = new MiniWindow();
  // The REAL assembly, not the card fragment alone: `paintExample` is defined by the painter ahead
  // of it, which is the whole ordering rule `formWeaveScripts` exists to hold.
  const api = runFragment(
    formWeaveScripts(),
    document,
    ['refreshMix', 'markedFields', 'collectMixFields'],
    posted,
    window,
  );
  return { document, posted, window, api };
}

test('ticking the IBAN box on a bank form shows the method, the warning and the picture', () => {
  const page = mixPage();
  page.document.getElementById('cardSection')!.style.display = 'none';
  page.document.getElementById('mixBankIban')!.checked = true;

  page.api.refreshMix();

  assert.notEqual(page.document.getElementById('mixControls')?.style.display, 'none', 'the controls are on screen');
  assert.match(page.document.getElementById('mixWarning')?.textContent ?? '', /stored nowhere/, 'and say what it costs');
  assert.deepEqual(page.api.markedFields(), ['iban'], 'the bank box is a marked field');
  assert.ok(
    page.posted.some((m) => (m as { type?: string; field?: string }).field === 'iban'),
    'and an example is asked for, for the IBAN',
  );
});

test('a box ticked in a fieldset this form hides is not a choice anybody is making', () => {
  // Tick "store the number woven" on a card, then switch the entry to bank details. The card box
  // stays ticked in a hidden fieldset. Counting it put the method picker on a bank form with no bank
  // box ticked, offering a method for a field the record is about to drop.
  const page = mixPage();
  page.document.getElementById('mixCardNumber')!.checked = true;
  page.document.getElementById('cardSection')!.style.display = 'none';

  page.api.refreshMix();

  assert.deepEqual(page.api.markedFields(), [], 'a hidden mark counts for nothing');
  assert.equal(page.document.getElementById('mixControls')?.style.display, 'none', 'so the controls stay away');
});

test('a visible card box still counts, which is the half that must not break', () => {
  const page = mixPage();
  page.document.getElementById('bankSection')!.style.display = 'none';
  page.document.getElementById('mixCardNumber')!.checked = true;

  page.api.refreshMix();

  assert.deepEqual(page.api.markedFields(), ['number']);
  assert.notEqual(page.document.getElementById('mixControls')?.style.display, 'none');
});

/**
 * Three findings from the code round, each asserted by running the fragment.
 */
test('the card listener takes the fields this form OWNS, and asks positively', () => {
  // The round's finding: skipping `password` and `mixed` by name is a list somebody must remember to
  // extend. A fourth weaving form's answer would be painted into #mixExample as well as into its own
  // host. A field belongs to this form iff this form has a weave box for it.
  const page = mixPage();
  const window = page.window;

  window.deliver({ type: 'weaveExampleResult', field: 'recovery', method: 'f3', first: ['a'], second: ['b'], woven: [{ text: 'a', side: 'first' }] });

  assert.equal(page.document.querySelectorAll('.weaveEx').length, 0, 'a field with no box here is not this form business');

  window.deliver({ type: 'weaveExampleResult', field: 'iban', method: 'f3', first: ['a'], second: ['b'], woven: [{ text: 'a', side: 'first' }] });

  assert.equal(page.document.querySelectorAll('.weaveEx').length, 1, 'and a field with a box here is');
  assert.equal(page.document.querySelector('.weaveEx')?.dataset.field, 'iban');
});

test('neither the password nor the phrase answer is painted into the payment host', () => {
  const page = mixPage();

  for (const field of ['password', 'mixed']) {
    page.window.deliver({ type: 'weaveExampleResult', field, method: 'f3', first: ['a'], second: ['b'], woven: [{ text: 'a', side: 'first' }] });
  }

  assert.equal(page.document.querySelectorAll('.weaveEx').length, 0, 'each form paints its own picture only');
});

test('a section is hidden by an INLINE display, which is what the visibility checks read', () => {
  // `visibleMark` and the phrase form's `phraseShowing` both read `style.display`. That is correct
  // here because the page's own `show` helper hides a section by writing exactly that — and this
  // assertion is the pin, so a later switch to a CSS class is a red test rather than two silent
  // checks that answer "visible" forever after.
  const page = formPageScript('n', undefined);
  const showHelper = page.slice(page.indexOf('const show = '), page.indexOf('const show = ') + 200);
  assert.match(showHelper, /el\.style\.display = visible/, 'sections are hidden by an inline display');
  assert.ok(
    !/classList/.test(showHelper),
    'and not by a class, which neither visibility check would see',
  );
});
