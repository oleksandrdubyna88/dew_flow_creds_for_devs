import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_BRANDS, CardBrand, binOf, brandOf, luhn } from '../cardBrand';

/**
 * Which payment system a number belongs to — decided by its opening digits, never by a checksum.
 *
 * <p>Two things this deliberately does NOT do. It does not guess: a prefix that belongs to no listed
 * system returns `''`, because a card labelled with the wrong network is worse than one labelled with
 * none. And it does not refuse: `luhn` is exported separately and used as a <b>typo hint</b>, so a
 * number the algorithm rejects still saves (parent plan §2.2). People hold cards this repository has
 * never heard of, and a vault that will not store one is a vault they keep a photo of instead.</p>
 *
 * <p>Every number below is a PUBLISHED test number — the sequences card networks and payment
 * processors put in their own documentation precisely so nobody has to invent one. None of them
 * belongs to anybody.</p>
 */

/** Published test numbers, one per system, with the length each system actually issues. */
const PUBLISHED: ReadonlyArray<{ brand: CardBrand; number: string; why: string }> = [
  { brand: 'visa', number: '4111111111111111', why: 'the most published number there is, 16 digits' },
  { brand: 'visa', number: '4012888888881881', why: 'a second Visa, so the test is not one prefix' },
  { brand: 'mastercard', number: '5555555555554444', why: 'the classic 51–55 range' },
  { brand: 'mastercard', number: '2223003122003222', why: 'the 2221–2720 range added in 2017' },
  { brand: 'amex', number: '378282246310005', why: '15 digits, and 34/37 — a length nobody else uses' },
  { brand: 'amex', number: '371449635398431', why: 'the other Amex prefix' },
  { brand: 'discover', number: '6011111111111117', why: '6011' },
  { brand: 'jcb', number: '3530111333300000', why: '3528–3589' },
  { brand: 'diners', number: '30569309025904', why: '14 digits' },
  { brand: 'unionpay', number: '6200000000000005', why: '62, and a 19-digit sibling below' },
  { brand: 'mir', number: '2200000000000004', why: '2200–2204' },
  { brand: 'maestro', number: '6759649826438453', why: 'the one whose lengths run 12 to 19' },
];

test('every published test number is recognised as its own system', () => {
  for (const { brand, number, why } of PUBLISHED) {
    assert.equal(brandOf(number), brand, `${number} is a ${brand} (${why})`);
  }
});

test('a number that belongs to no listed system returns nothing, rather than a guess', () => {
  // A card labelled with the wrong network is worse than one labelled with none: the person reads the
  // label, believes it, and the mistake is invisible because the digits are masked.
  assert.equal(brandOf('9999999999999999'), '');
  assert.equal(brandOf('1234567812345678'), '');
});

test('an unfinished number is answered as soon as the prefix decides it', () => {
  // A person types left to right, and the glyph should appear while they do — but only once the
  // digits can actually pick a system.
  assert.equal(brandOf('4'), 'visa', 'one digit is enough for Visa');
  assert.equal(brandOf('41111'), 'visa');
  assert.equal(brandOf(''), '', 'and nothing decides nothing');
});

test('spaces and dashes are how people type a card, and change nothing', () => {
  assert.equal(brandOf('4111 1111 1111 1111'), 'visa');
  assert.equal(brandOf('3782-822463-10005'), 'amex');
  assert.equal(luhn('4111 1111 1111 1111'), true, 'the checksum reads the digits, not the spacing');
});

test('length is part of the answer, and the mark does not flicker on the way to one', () => {
  // Amex is the case that makes the upper bound matter: 15 digits, where everyone else is 16. A
  // 16-digit number starting 37 is past every length Amex issues, so it is a number this table does
  // not know.
  assert.equal(brandOf('3782822463100051'), '', 'a 16-digit 37 is not an Amex');

  // The lower half was asserted WRONGLY here at first — as "a 15-digit Visa is not a Visa" — and a
  // code review caught what that implied: `fits` allowed "still typing" only BELOW the shortest
  // issued length, so a Visa lost its mark at 14 and 15 digits and got it back at 16. Visa issues 13,
  // 16 and 19, and a number between two of those is being typed, not wrong.
  for (const partial of ['4111111111111', '41111111111111', '411111111111111', '4111111111111111']) {
    assert.equal(brandOf(partial), 'visa', `${partial.length} digits lost the mark`);
  }
  assert.equal(brandOf('41111111111111111111'), '', 'past 19 digits it is no longer a Visa');
});

test('Luhn is a hint, and hints do not refuse', () => {
  // The whole point of exporting it separately. `brandOf` never consults it: a mistyped digit still
  // names its system, and the form says "this looks mistyped" rather than "this is not a card".
  const mistyped = '4111111111111112';
  assert.equal(luhn(mistyped), false, 'the checksum notices');
  assert.equal(brandOf(mistyped), 'visa', 'and the card is still a Visa');
});

test('Luhn accepts every published number, which is what makes it worth showing', () => {
  for (const { number } of PUBLISHED) {
    assert.equal(luhn(number), true, `${number} passes the checksum`);
  }
});

test('Luhn says nothing about a number with no digits in it', () => {
  assert.equal(luhn(''), false);
  assert.equal(luhn('   '), false);
  assert.equal(luhn('not a card'), false);
});

test('the BIN is the first six digits, and it is what a decoy has to preserve', () => {
  // Exported for S3.1: a decoy card that changes the opening digits announces itself as a decoy, so
  // `decoyDigits` needs to know exactly how much of the front is load-bearing.
  assert.equal(binOf('4111 1111 1111 1111'), '411111');
  assert.equal(binOf('378282246310005'), '378282');
  assert.equal(binOf('4111'), '4111', 'a short number gives what it has, never padding');
  assert.equal(binOf(''), '');
});

test('the BIN and the brand always agree', () => {
  // They are two readings of the same digits; a disagreement would mean the table has drifted from
  // itself, which is exactly what a table is meant to prevent.
  for (const { brand, number } of PUBLISHED) {
    assert.equal(brandOf(binOf(number) + number.slice(6)), brand, 'the BIN carries the decision');
  }
});

test('every brand in the catalog is reachable, and nothing else is', () => {
  // The list and the table are one thing or they are two things that will drift. A brand nobody can
  // produce is dead code; a brand `brandOf` returns that is not in the list breaks the glyph lookup.
  const produced = new Set(PUBLISHED.map((one) => one.brand));
  for (const brand of CARD_BRANDS) {
    assert.ok(produced.has(brand), `${brand} has no test number here — add one, or drop the brand`);
  }
});
