import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairRefusal } from '../secondPair';
import { classesUsed } from '../decoyDigits';
import { weaveSecret, unweaveSecret } from '../wovenSecret';
import { weavePaymentFields } from '../paymentWeaving';
import { pickPaymentFields } from '../paymentFields';
import { SHUFFLE_CODES } from '../shuffle';

/**
 * The rule that decides whether two values a person TYPED can be woven together.
 *
 * <p>Each test is named for the guarantee rather than the function, and every refusal is checked for
 * being a sentence somebody can act on — a refusal that only says no is a support ticket.</p>
 */

test('an empty second box is not a refusal — the save decides what blank means, not this', () => {
  assert.equal(pairRefusal('hunter2!', '', 'password'), '');
});

test('halves of different length are refused, and the sentence counts what a person can count', () => {
  const refusal = pairRefusal('hunter2!', 'short', 'password');

  assert.match(refusal, /second password has 5 characters and the password has 8/);
  assert.match(refusal, /same length/, 'it says what is wrong');
  assert.match(refusal, /Nothing has been saved/, 'and that nothing was lost by it');
});

/**
 * The trap `weaveRefusal` already carries a note about, now on the pair.
 *
 * <p>One emoji is two UTF-16 units and ONE character. A rule counting `.length` lets this pair
 * through and `shuffleTokens` throws on it much later, with a message about decoys.</p>
 */
test('length is counted in CODE POINTS, so an emoji is one character and not two', () => {
  const withEmoji = 'ab😀';
  const four = 'abcd';
  assert.equal(withEmoji.length, 4, 'the trap: .length says four');
  assert.equal([...withEmoji].length, 3, 'and a person counts three');

  assert.notEqual(pairRefusal(withEmoji, four, 'password'), '', 'four .length units are not four characters');
  assert.equal(pairRefusal(withEmoji, 'xy😀', 'password'), '', 'and three against three is a pair');
});

test('two identical halves are refused — they would hide nothing under any method', () => {
  const refusal = pairRefusal('hunter2!', 'hunter2!', 'password');

  assert.match(refusal, /same as the password/);
  assert.match(refusal, /same value twice/, 'it says why that is useless');
  assert.match(refusal, /leave the box empty/, 'and offers the way out');
});

test('halves drawing on different character classes are refused', () => {
  // One uses symbols, the other never does — under the right method one row is all of a kind the
  // other lacks, and no other method produces that. The method stops being the secret.
  const refusal = pairRefusal('hunter2!', 'hunter2x', 'password');

  assert.match(refusal, /different kinds of character/);
  assert.match(refusal, /without knowing the method/, 'it says what it costs');
});

/**
 * The companion that stops the class rule from quietly refusing every card.
 *
 * <p>A review round predicted that a password-shaped check would break payment pairs. It cannot: the
 * comparison is between the two TYPED values, so two card numbers are digits on both sides and the
 * sets are equal. Without this test that prediction would be untested either way.</p>
 */
test('two numbers of the same length are a PAIR — the class rule refuses nothing there', () => {
  assert.equal(pairRefusal('4111111111111111', '4222222222222222', 'card number'), '');
  assert.equal(pairRefusal('737', '481', 'CVV'), '');
  assert.equal(pairRefusal('4821', '9137', 'PIN'), '');
});

test('two IBANs of the same length are a pair, whatever their countries', () => {
  // Both draw on upper-case letters and digits, so the class rule is satisfied across countries.
  assert.equal(pairRefusal('NL91ABNA0417164300', 'NL02RABO0123456789', 'IBAN'), '');
  assert.equal(pairRefusal('NL91ABNA0417164300', 'BE68539007547034AB', 'IBAN'), '', 'a different country too');
  // And an IBAN of another LENGTH is refused for the ordinary reason, not a country one.
  assert.match(
    pairRefusal('NL91ABNA0417164300', 'DE89370400440532013000', 'IBAN'),
    /same length/,
    'length is the rule that bites, and it says so',
  );
});

test('a bad checksum is NOT this rule’s business', () => {
  // People hold instruments this build has never heard of. A second card number that does not add up
  // is confirmed where checksums are confirmed, not refused here.
  assert.equal(pairRefusal('4111111111111111', '1234567890123456', 'card number'), '');
});

test('the refusal names the FIELD a person sees, not a record key', () => {
  const refusal = pairRefusal('4821', '48210', 'PIN');

  assert.match(refusal, /second PIN/, 'the label the caller gave');
  assert.ok(!/\bpin2\b|shuffledFields/.test(refusal), 'never the record’s own spelling');
});

/**
 * The generator and the refusal must agree about what a class IS, which is why they share one
 * function. If `classesUsed` stopped naming a class, the refusal would stop seeing a mismatch and
 * the decoy would stop imitating one — together, silently.
 */
test('the class question has ONE answer, shared with the decoy generator', () => {
  assert.deepEqual([...classesUsed('abc')], ['lower']);
  assert.deepEqual([...classesUsed('abc123')].sort(), ['digits', 'lower']);
  assert.deepEqual([...classesUsed('aB1!')].sort(), ['digits', 'lower', 'symbols', 'upper']);
  // A stranger is its own class: present in one half and not the other, it marks that half.
  assert.ok(classesUsed('abcλ').has('λ'), 'a character no set of ours names stands for itself');
  assert.notEqual(pairRefusal('abcλ', 'abcd', 'password'), '', 'so a pair split by one is refused');
});

/**
 * The two choke points, where a typed second value replaces the decoy.
 *
 * <p>The assertion that matters is not that the pair round-trips — it is that the decoy generator is
 * NEVER REACHED. `phraseForm.test.ts` already proves it for the phrase with a random source that
 * throws; these do the same for the other two, because "we did not call it" is a claim only a
 * throwing random can settle.</p>
 */
test('a typed second password is woven as it is, and no decoy is drawn at all', () => {
  const explode = (): number => {
    throw new Error('a decoy was drawn for a second value that was typed');
  };

  const stored = weaveSecret('hunter2!', SHUFFLE_CODES[3], explode, 'Passw0rd');

  const back = unweaveSecret(stored, SHUFFLE_CODES[3]);
  assert.equal(back?.first, 'hunter2!', 'the password comes back');
  assert.equal(back?.second, 'Passw0rd', 'and so does the value the person typed');
});

test('without a typed second the generator is still what supplies the other half', () => {
  const stored = weaveSecret('hunter2!', SHUFFLE_CODES[3], () => 0.42);

  const back = unweaveSecret(stored, SHUFFLE_CODES[3]);
  assert.equal(back?.first, 'hunter2!');
  assert.notEqual(back?.second, 'hunter2!', 'a decoy, and never the value itself');
});

test('a typed second payment field is woven as it is, and marks itself as the person’s own', () => {
  const explode = (): number => {
    throw new Error('a decoy was drawn for a second value that was typed');
  };

  const woven = weavePaymentFields(
    { pin: '4821', cvv: '737' },
    ['pin'],
    { pin: SHUFFLE_CODES[2] },
    explode,
    { pin: '9137' },
  );

  assert.deepEqual(woven.shuffledFields, ['pin'], 'it is woven');
  assert.deepEqual(woven.ownSecond, ['pin'], 'and the record says the partner half is real');
  assert.equal(woven.cvv, '737', 'an unmarked field is untouched');
});

test('a field woven with a DECOY is not marked as own — the two are different facts', () => {
  const woven = weavePaymentFields({ pin: '4821' }, ['pin'], { pin: SHUFFLE_CODES[2] }, () => 0.42);

  assert.deepEqual(woven.shuffledFields, ['pin']);
  assert.equal(woven.ownSecond, undefined, 'no claim that anything real was woven in');
});

test('ownSecond is a SUBSET of shuffledFields, and never outlives it', () => {
  // A mark for a field that is not woven describes nothing — and describes it expensively, because
  // this mark is what a share reads to know a leak costs two real secrets rather than one.
  const pruned = pickPaymentFields({ pin: '48219137', shuffledFields: ['pin'], ownSecond: ['pin', 'cvv'] });
  assert.deepEqual(pruned.ownSecond, ['pin'], 'the name with no woven field is dropped');

  const gone = pickPaymentFields({ shuffledFields: ['pin'], ownSecond: ['pin'] });
  assert.equal(gone.ownSecond, undefined, 'and when the value goes, both marks go');
  assert.equal(gone.shuffledFields, undefined);

  const orphan = pickPaymentFields({ pin: '4821', ownSecond: ['pin'] });
  assert.equal(orphan.ownSecond, undefined, 'an own mark without a weave is not a thing');
});
