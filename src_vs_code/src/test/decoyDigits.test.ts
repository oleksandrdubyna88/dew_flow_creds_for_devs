import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DecoySpec, generateDecoy, ibanConverges } from '../decoyDigits';
import { binOf, brandOf, luhn } from '../cardBrand';
import { SHUFFLE_CODES, shuffleTokens, unshuffleTokens } from '../shuffle';

/**
 * A decoy that does not look like the thing it hides is not a decoy.
 *
 * <p>The hardest correctness story in the plan, and the one whose failure is <b>silent</b>. Weaving a
 * card number with a decoy half only helps if a reader cannot tell which half is which — so a decoy
 * card number has to pass Luhn and carry a BIN of the same system, and a decoy IBAN has to converge
 * mod-97 with the same country code. A decoy that is "just digits" separates the two halves at a
 * glance, and the person is left believing they have protection they do not have.</p>
 *
 * <p>The inverse matters just as much. An <b>internal account number</b> gets a decoy of the same
 * length and alphabet and <b>nothing more</b> — no country code, no checksum. Giving it standard
 * structure beside a non-standard real value separates the halves just as surely, in the other
 * direction.</p>
 */

/** A deterministic source: hands back the numbers it was given, then repeats the last one. */
function scripted(...draws: number[]): () => number {
  let at = 0;
  return () => draws[Math.min(at++, draws.length - 1)];
}

/** A plain deterministic generator, good enough to exercise structure rather than randomness. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const CARD: DecoySpec = { kind: 'card', original: '4111111111111111' };
const IBAN: DecoySpec = { kind: 'iban', original: 'NL91ABNA0417164300' };
const ACCOUNT: DecoySpec = { kind: 'account', original: 'ACC-0099-XZ' };
const CVV: DecoySpec = { kind: 'digits', original: '123' };

test('a decoy card passes Luhn, so neither half is the one that fails', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const decoy = generateDecoy(CARD, seeded(seed));
    assert.equal(luhn(decoy), true, `${decoy} fails the checksum and gives itself away`);
  }
});

test('a decoy card carries a BIN of the SAME system', () => {
  // Not merely "a valid BIN": a Visa woven with a Mastercard decoy is two halves anybody can sort.
  for (let seed = 1; seed <= 40; seed++) {
    const decoy = generateDecoy(CARD, seeded(seed));
    assert.equal(brandOf(decoy), 'visa', `${decoy} is not a Visa`);
    assert.equal(binOf(decoy), binOf(CARD.original), 'the issuer digits must match too');
  }
});

test('a decoy card is the same length as the original', () => {
  const decoy = generateDecoy({ kind: 'card', original: '378282246310005' }, seeded(7));
  assert.equal(decoy.length, 15, 'an Amex decoy is 15 digits, or the two halves are different lengths');
  assert.equal(luhn(decoy), true);
});

test('a decoy IBAN converges mod-97 and keeps the country', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const decoy = generateDecoy(IBAN, seeded(seed));
    assert.equal(ibanConverges(decoy), true, `${decoy} does not check out`);
    assert.equal(decoy.slice(0, 2), 'NL', 'a Dutch IBAN woven with a German one sorts itself');
    assert.equal(decoy.length, IBAN.original.length);
  }
});

test('an internal account decoy matches length and alphabet, and carries NO country code', () => {
  // The case the plan spells out. Standard structure beside a non-standard real value separates the
  // halves exactly as reliably as the reverse.
  for (let seed = 1; seed <= 30; seed++) {
    const decoy = generateDecoy(ACCOUNT, seeded(seed));

    assert.equal(decoy.length, ACCOUNT.original.length, 'length is the one thing it must share');
    assert.equal(ibanConverges(decoy), false, 'an internal account must NOT look like an IBAN');
    assert.match(decoy, /^[A-Z0-9-]+$/, 'and stays in the alphabet it was given');
  }
});

test('an account decoy keeps the shape of the original, position by position', () => {
  // `ACC-0099-XZ` is letters, digits and separators in fixed places. A decoy that puts a digit where
  // a letter was is a decoy anybody can point at.
  const decoy = generateDecoy(ACCOUNT, seeded(3));

  for (let i = 0; i < ACCOUNT.original.length; i++) {
    const real = ACCOUNT.original[i];
    const fake = decoy[i];
    assert.equal(/\d/.test(fake), /\d/.test(real), `position ${i} changed class`);
    assert.equal(/[A-Z]/.test(fake), /[A-Z]/.test(real), `position ${i} changed class`);
    assert.equal(/[^A-Z0-9]/.test(real) ? fake : '=', /[^A-Z0-9]/.test(real) ? real : '=', 'separators are kept');
  }
});

test('a CVV decoy is just digits of the same length — there is no structure to imitate', () => {
  const decoy = generateDecoy(CVV, seeded(11));
  assert.match(decoy, /^\d{3}$/);
});

test('THE COLLISION GUARD: a draw equal to the original is discarded and redrawn', () => {
  // One in a thousand at a CVV, and not theoretical. In that state the "decoy" IS the real CVV, the
  // record shows it twice, and the person never finds out. The guard lives next to the generator so
  // one implementation covers every field kind, rather than being remembered once per kind.
  //
  // The scripted source yields the original first and something else second.
  const draws = drawsProducing('123', '456');
  const decoy = generateDecoy(CVV, scripted(...draws));

  assert.notEqual(decoy, '123', 'the generator handed back the original');
  assert.equal(decoy, '456');
});

/** The unit-interval draws that make the digit generator produce these two values, in order. */
function drawsProducing(first: string, second: string): number[] {
  return [...first, ...second].map((digit) => Number(digit) / 10 + 0.001);
}

test('the guard holds for a card too, where a repeat is astronomically unlikely but not impossible', () => {
  let calls = 0;
  const always = (): number => {
    calls++;
    return 0.5;
  };
  // A source that never varies would loop for ever without a bound; the generator must give up rather
  // than hang, and what it gives up with is the honest answer: an error, not the original.
  assert.throws(() => generateDecoy({ kind: 'digits', original: '5' }, always), /decoy/i);
  assert.ok(calls > 1, 'it tried more than once before giving up');
});

test('a decoy woven with its original comes back unchanged, for every method and length', () => {
  // The round trip `shuffle.ts` owns, asserted HERE over digits — because digits repeat, and a
  // "no token appears twice" assertion would be wrong for them. Multisets, not sets.
  for (const code of SHUFFLE_CODES) {
    for (const length of [2, 3, 4, 6, 12, 16]) {
      const real = Array.from({ length }, (_, i) => String(i % 10));
      const fake = Array.from({ length }, (_, i) => String((i + 7) % 10));

      const woven = shuffleTokens(real, fake, code);
      const back = unshuffleTokens(woven, code);

      assert.deepEqual(back.first, real, `${code} at length ${length} lost the original`);
      assert.deepEqual(back.second, fake);
      assert.deepEqual(
        [...woven].sort(),
        [...real, ...fake].sort(),
        'the woven sequence is exactly both halves, as a multiset',
      );
    }
  }
});

test('ibanConverges agrees with the published examples, both ways', () => {
  assert.equal(ibanConverges('NL91ABNA0417164300'), true);
  assert.equal(ibanConverges('GB82WEST12345698765432'), true);
  assert.equal(ibanConverges('DE89370400440532013000'), true);
  assert.equal(ibanConverges('NL92ABNA0417164300'), false, 'one digit changed must not converge');
  assert.equal(ibanConverges('nonsense'), false);
  assert.equal(ibanConverges(''), false);
});
