import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WOVEN_ROW_NOTE, wovenRowMarkup } from '../wovenRow';
import { SHUFFLE_CODES } from '../shuffle';

/**
 * The row a woven value is read back through, now that it has two consumers.
 *
 * <p>It was covered only through the payment card, which is what a reviewer objected to: the shared
 * renderer could regress in the picker, the symmetry of the two rows or the escaping, and the card's
 * own tests would go on passing. What is asserted here is what BOTH consumers depend on.</p>
 */

const options = (over: Partial<Parameters<typeof wovenRowMarkup>[0]> = {}) => ({
  key: 'password',
  label: 'Password',
  methods: SHUFFLE_CODES,
  note: WOVEN_ROW_NOTE,
  ...over,
});

test('the same row renders for a card field and for a password — one shape, two callers', () => {
  const card = wovenRowMarkup(options({ key: 'number', label: 'Card number' }));
  const credential = wovenRowMarkup(options());

  // Everything but the key and the label is identical; that is what "one row" means.
  assert.equal(
    card.replace(/number/g, 'X').replace(/Card X/g, 'L'),
    credential.replace(/password/g, 'X').replace(/Password/g, 'L'),
  );
});

test('the two readings are indistinguishable in every respect a reader could use', () => {
  const html = wovenRowMarkup(options());

  // Numbered, never named. Which column the arithmetic calls which is the host's business: a DOM
  // that says `decoy` out loud is a hint one inspector away from the person this defends against.
  // The caption DOES say "stored woven with a decoy" — that a value is woven is the thing the row
  // is telling the reader. What must never be named is which of the two ROWS is which.
  assert.ok(!/payReading_[a-z]+_(real|decoy)/i.test(html), 'no row id names it');
  assert.ok(!/aria-label="[^"]*(real|decoy)/i.test(html), 'and no row label names it');
  assert.match(html, /id="payReading_password_a"/);
  assert.match(html, /id="payReading_password_b"/);
  // The two rows differ only in their ordinal.
  const rows = html.match(/class="line readingLine"/g) ?? [];
  assert.equal(rows.length, 2, 'exactly two, always');
});

test('every method is offered, named by its code and not by its position', () => {
  const html = wovenRowMarkup(options());

  assert.equal((html.match(/<option value="f\d+">/g) ?? []).length, SHUFFLE_CODES.length);
  // The name belongs to the code: `f1` is Method 1 wherever it is drawn in the list.
  assert.match(html, /<option value="f1">Method 1<\/option>/);
  assert.match(html, /<option value="f12">Method 12<\/option>/);
});

test('a drawn ORDER is preserved, so the list can be shuffled without renaming anything', () => {
  const reversed = [...SHUFFLE_CODES].reverse();
  const html = wovenRowMarkup(options({ methods: reversed }));

  const order = [...html.matchAll(/<option value="(f\d+)">/g)].map(([, code]) => code);
  assert.deepEqual(order, reversed, 'the row renders the order it was handed');
  assert.match(html, /<option value="f12">Method 12<\/option>/, 'and f12 is still Method 12');
});

test('a label and a key are ESCAPED — they reach the page as text, never as markup', () => {
  const html = wovenRowMarkup(options({ key: 'a"b', label: '<script>x</script>' }));

  assert.ok(!html.includes('<script>'), 'a label cannot open a tag');
  assert.ok(!/data-key="a"b"/.test(html), 'and a key cannot close an attribute');
});

test('the note is the row own sentence, and it says the rows tell you nothing', () => {
  const html = wovenRowMarkup(options());

  assert.match(html, /id="payNote_password"/);
  assert.match(WOVEN_ROW_NOTE, /nothing here can tell you which one is yours/);
  assert.ok(html.includes(WOVEN_ROW_NOTE.slice(0, 40)), 'and it is what the row renders');
});

test('the readings start hidden — nothing is on screen until somebody asks', () => {
  const html = wovenRowMarkup(options());

  assert.match(html, /<div class="readingRows" id="payRows_password" hidden>/);
});
