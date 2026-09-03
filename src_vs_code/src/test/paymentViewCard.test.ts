import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MASK, paymentCardMarkup, paymentCardScript } from '../paymentViewCard';
import {
  copyTextFor,
  paymentCardFor,
  plainValues,
  presentKeysOf,
  readingFor,
  revealValue,
  rowOf,
  wovenKeysOf,
} from '../paymentViewMessages';
import { PaymentFields } from '../paymentFields';
import { SHUFFLE_CODES, shuffleTokens } from '../shuffle';
import { phraseColumns } from '../phraseLayout';

/**
 * The read-only payment card — the surface that had never existed, which is why six modules of this
 * feature had no caller and why the weave boxes had to be switched off.
 *
 * <p>The first test is the one that matters most and it is deliberately blunt: every value in the
 * record is a distinctive token, and NONE of them may appear anywhere in the generated HTML. That is
 * the rule this kind adds, and the reason it is worth a test rather than a comment is that it fails
 * silently — a page that leaks a CVV looks exactly like a page that does not.</p>
 */

/** A card whose every value is unmistakable, so a leak cannot hide behind a plausible string. */
const CARD: PaymentFields = {
  number: 'NUMBER-4111111111111111',
  expiry: 'EXPIRY-12/29',
  holder: 'HOLDER-A-PERSON',
  cvv: 'CVV-737',
  pin: 'PIN-4821',
  address: 'ADDRESS-SOMEWHERE',
  brand: 'BRAND-visa',
};

const random = (): number => 0.5;

test('no value from the record reaches the page — the rule this kind adds, on the read side', () => {
  const view = paymentCardFor('e1', 'card', CARD, random);

  const html = paymentCardMarkup(view);

  for (const value of Object.values(CARD)) {
    assert.ok(
      !html.includes(value as string),
      `the card rendered ${String(value)} into the page; every value must arrive by message`,
    );
  }
  // And the negative half: it did render the row, so the test above is not passing on an empty page.
  assert.ok(html.includes('id="pay_number"'), 'the row itself is there');
  assert.ok(html.includes('data-entity="e1"'), 'and it is stamped with the entry it belongs to');
});

test('a gated field gets a Show button and a masked box; an ordinary one gets neither', () => {
  const html = paymentCardMarkup(paymentCardFor('e1', 'card', CARD, random));

  assert.match(html, /data-field="cvv" data-action="reveal"/, 'the CVV asks');
  assert.match(html, /data-field="pin" data-action="reveal"/, 'the PIN asks');
  assert.ok(!/data-field="number" data-action="reveal"/.test(html), 'a card number does not');
  assert.ok(html.includes('id="pay_cvv" value="••••••••"'), 'and it starts masked');
});

test('a woven field gets a method picker and two rows that start empty', () => {
  const woven: PaymentFields = { ...CARD, shuffledFields: ['pin'] };

  const html = paymentCardMarkup(paymentCardFor('e1', 'card', woven, random));

  assert.match(html, /class="mixPick" data-key="pin"/, 'the methods are offered');
  assert.equal((html.match(/Method \d+<\/option>/g) ?? []).length, SHUFFLE_CODES.length);
  assert.ok(html.includes('id="payReading_pin_a"') && html.includes('id="payReading_pin_b"'));
  // Named by POSITION and never by nature. The row that the arithmetic calls the real one must not
  // be identifiable from the page at all — an id or a label saying so is a hint one inspector away.
  // (The words "with a decoy" do appear, in the field's own caption: that a value is stored woven is
  // the thing the row is telling the reader. Which of the two rows is which is what it must not.)
  assert.ok(!/payReading_[a-z]+_(real|decoy)/.test(html), 'no row id names it');
  assert.ok(!/aria-label="[^"]*(real|decoy)/i.test(html), 'and no row label names it');
  assert.ok(!html.includes('id="pay_pin"'), 'and a woven field has no plain box to fill');
});

test('a kind that is not a payment renders no card at all', () => {
  assert.equal(paymentCardMarkup(undefined), '');
  assert.equal(paymentCardMarkup(paymentCardFor('e1', 'card', {}, random)), '');
});

test('the page script never joins a phrase, and asks for its values on load', () => {
  const script = paymentCardScript();

  assert.match(script, /createElement\('span'\)/, 'words go in one node each');
  assert.match(script, /type: 'payment', field: 'values'/, 'and the card asks on load');
  assert.match(script, /msg\.entityId === payCard\.dataset\.entity/, 'answers are checked');
});

test('plainValues withholds what must be asked for, and nothing else', () => {
  const woven: PaymentFields = { ...CARD, shuffledFields: ['number'] };

  const values = plainValues(woven, 'card');

  assert.equal(values.holder, 'HOLDER-A-PERSON');
  assert.equal(values.cvv, undefined, 'a CVV is asked for');
  assert.equal(values.pin, undefined, 'so is a PIN');
  assert.equal(values.number, undefined, 'and a woven value is never sent as if it were plain');
});

test('revealValue answers for a gated field and refuses anything else', () => {
  assert.equal(revealValue(CARD, 'card', 'cvv'), 'CVV-737');
  assert.equal(revealValue(CARD, 'card', 'holder'), undefined, 'not gated: not this door');
  assert.equal(
    revealValue({ ...CARD, shuffledFields: ['cvv'] }, 'card', 'cvv'),
    undefined,
    'a woven CVV has no plain value to reveal',
  );
});

test('a woven card number is rebuilt under the right method and unreadable under none', () => {
  const original = '4111111111111111';
  const decoy = '4111222233334444';
  const code = SHUFFLE_CODES[3];
  const fields: PaymentFields = {
    number: shuffleTokens([...original], [...decoy], code).join(''),
    shuffledFields: ['number'],
  };

  const right = readingFor(fields, 'card', 'number', code);
  const wrong = readingFor(fields, 'card', 'number', SHUFFLE_CODES[4]);

  assert.equal(copyTextFor(right!, 'a', 'number'), original);
  assert.equal(copyTextFor(right!, 'b', 'number'), decoy);
  // The property, not the value: a wrong method answers in the SAME shape as a right one. Anything
  // that could tell them apart here is the enumeration hint the whole design withholds.
  assert.equal(rowOf(wrong!, 'a').length, rowOf(right!, 'a').length);
  assert.equal(rowOf(wrong!, 'b').length, rowOf(right!, 'b').length);
  assert.notEqual(copyTextFor(wrong!, 'a', 'number'), original);
});

test('a phrase woven under the horizontal layout comes back as the ORIGINAL words', () => {
  // The round trip S4.5 was built for, now through the viewer's own path. A test that only checked
  // the two columns come back is exactly the test that missed this the first time.
  const real = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
  const second = ['zulu', 'yankee', 'xray', 'whiskey', 'victor', 'uniform'];
  const code = SHUFFLE_CODES[7];
  const columns = phraseColumns(real, second, 'horizontal');
  const fields: PaymentFields = {
    mixed: shuffleTokens(columns.first, columns.secondColumn, code),
    layout: 'horizontal',
    shuffledFields: ['mixed'],
  };

  const reading = readingFor(fields, 'phrase', 'mixed', code);

  assert.deepEqual(rowOf(reading!, 'a'), real);
  assert.deepEqual(rowOf(reading!, 'b'), second);
  assert.equal(copyTextFor(reading!, 'a', 'mixed'), real.join(' '), 'the clipboard is the one join');
});

test('a record that is not a whole woven pair answers "cannot be read" instead of throwing', () => {
  // Nothing this build writes — and exactly the shape an interrupted or foreign write leaves.
  // `unshuffleTokens` refuses an odd length, correctly; a message handler must not carry the throw.
  const fields: PaymentFields = { mixed: ['one', 'two', 'three'], shuffledFields: ['mixed'] };

  assert.equal(readingFor(fields, 'phrase', 'mixed', SHUFFLE_CODES[0]), undefined);
  assert.equal(readingFor({ number: '41', shuffledFields: ['number'] }, 'card', 'number', SHUFFLE_CODES[0]), undefined);
  assert.equal(readingFor(CARD, 'card', 'number', 'not-a-code'), undefined, 'and the method is checked');
  assert.equal(readingFor(CARD, 'card', 'number', SHUFFLE_CODES[0]), undefined, 'a field nothing wove is not woven');
});

test('the card knows which keys are present and which are woven, and never invents one', () => {
  const fields: PaymentFields = { ...CARD, shuffledFields: ['pin', 'iban', 'nonsense'] };

  assert.deepEqual(wovenKeysOf(fields, 'card'), ['pin'], 'an absent field is not woven; nor is a name');
  assert.ok(!presentKeysOf(fields, 'card').includes('beneficiary'), 'a bank key is not a card key');
  assert.ok(presentKeysOf({ number: '' }, 'card').length === 0, 'an empty string is not a value');
});

/**
 * A revealed CVV has to be hideable again.
 *
 * <p>There was no hide path at all: the row rendered a static `Show`, and `payFill` wrote the value
 * and dropped the `gated` class with nothing anywhere to reverse it. Somebody who revealed a CVV to
 * read it had no way to put it away again short of closing the card.</p>
 *
 * <p>The flip belongs where the VALUE arrives, not on the click. A click only asks; the host posts
 * nothing at all when the confirmation is declined (`paymentViewHost.reveal`), and a button reading
 * `Hide` over a still-masked box would be stating the opposite of the truth.</p>
 */
test('a gated row can be put back — the button becomes Hide, and hiding re-masks it', () => {
  const html = paymentCardMarkup(paymentCardFor('e1', 'card', CARD, random));
  const script = paymentCardScript();

  assert.match(html, /data-label="CVV"/, 'the label rides on the button, so the script can rename it');
  assert.ok(html.includes(`value="${MASK}"`), 'the row starts masked with the shared constant');
  assert.ok(script.includes(MASK), 'and the script re-masks with the SAME constant, not a copy');

  // The flip is inside payFill — the arrival of a value — and not in the click handler.
  assert.match(
    script,
    /payFill = function[\s\S]*?payToggle\(key, true\)/,
    'an ARRIVING value is what turns the button into Hide — never the click that asked for it',
  );
  assert.match(script, /textContent = shown \? 'Hide' : 'Show'/, 'and the two states are one expression');
  assert.match(script, /action === 'hide'/, 'and the page handles hiding itself');
});

test('hiding is answered by the page alone — the host is never told', () => {
  const script = paymentCardScript();

  // There is nothing host-side to release for a plain gated field: `held` carries woven readings
  // only. A message would be a round trip that changes nothing, and one more thing to get wrong.
  const hideBranch = script.slice(script.indexOf("action === 'hide'"));
  assert.ok(
    !/postMessage/.test(hideBranch.slice(0, 400)),
    'hiding must not post to the host — it is a page-local re-mask',
  );
});
