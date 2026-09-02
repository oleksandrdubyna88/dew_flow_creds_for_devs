import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  WORDLIST_IDS,
  WordlistId,
  checksumHolds,
  hasChecksum,
  indexOf,
  isWordlistId,
  normalize,
  wordlistLabel,
  wordlistOf,
  wordsOf,
} from '../wordlists';

/**
 * The arithmetic a seed phrase's checksum depends on, and the data it reads.
 *
 * <p>A single wrong word in a list does not fail to compile and does not fail to save. It silently
 * makes a correct phrase read as invalid, or an invalid one read as correct — the worst outcome this
 * feature has, because a phrase marked to be woven has no original left to compare against and the
 * checksum is the last moment anybody can catch a typo.</p>
 *
 * <p>So the lists are not trusted because they were copied carefully. They are checked against the
 * standard's own published vectors: four real mnemonics whose checksums hold only if every one of the
 * 2048 words is right AND in the right order.</p>
 */

/**
 * Published BIP-39 English vectors, from the specification's own `vectors.json`.
 *
 * <p>Each is the mnemonic for a known entropy: all-zero, `0x7f…`, `0x80…` and all-`0xff`. They are
 * chosen to exercise the ends of the list — `abandon` is index 0 and `zoo` is index 2047 — so a list
 * truncated, reordered or off by one at either end cannot pass them.</p>
 */
const VECTORS: readonly string[] = [
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  'legal winner thank year wave sausage worth useful legal winner thank yellow',
  'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
  'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon '
    + 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art',
];

test('every registered list has data, and every list is registered', () => {
  for (const id of WORDLIST_IDS) {
    assert.ok(wordlistOf(id).length > 0, `${id} is registered with no words`);
    assert.ok(wordlistLabel(id).length > 0, `${id} has no label to show anybody`);
  }
});

test('BIP-39 English is exactly 2048 unique words — the arithmetic the checksum rests on', () => {
  // 2048 = 2^11, and eleven bits per word is what makes the entropy split work at all. A list of any
  // other length is not a slightly wrong BIP-39 list; it is one the maths does not apply to.
  const words = wordlistOf('bip39-en');

  assert.equal(words.length, 2048);
  assert.equal(new Set(words).size, 2048, 'a duplicate would make one index unreachable');
});

test('the list is in the standard’s order, at both ends', () => {
  const words = wordlistOf('bip39-en');
  assert.equal(words[0], 'abandon', 'index 0');
  assert.equal(words[2047], 'zoo', 'index 2047');
  assert.deepEqual([...words], [...words].sort(), 'BIP-39 lists are sorted, and the order IS the value');
});

test('every published vector checks out', () => {
  for (const phrase of VECTORS) {
    assert.equal(checksumHolds(wordsOf(phrase), 'bip39-en'), true, `${phrase.slice(0, 40)}… should check out`);
  }
});

test('one swapped word breaks the checksum — which is the entire point', () => {
  // BIP-39's checksum catches roughly 15 mistakes in 16. This asserts the one that matters most: a
  // person who mistypes a single word is told, rather than storing something they cannot recover.
  const [first] = VECTORS;
  const swapped = first.replace('about', 'abuse');

  assert.notEqual(swapped, first, 'the fixture actually changed');
  assert.equal(checksumHolds(wordsOf(swapped), 'bip39-en'), false);
});

test('two words TRANSPOSED break it too, which a naive "are all words in the list" check would miss', () => {
  const reordered = 'legal winner thank year wave sausage worth useful legal winner yellow thank';
  assert.equal(checksumHolds(wordsOf(reordered), 'bip39-en'), false);
});

test('a word that is not in the list is not a checksum failure to reason about — it is just false', () => {
  assert.equal(checksumHolds(wordsOf('abandon abandon notaword'), 'bip39-en'), false);
});

test('a length the list checksums nothing at answers false, and says so through hasChecksum', () => {
  // The distinction the decoy generator depends on (§4.3): "does not check out" and "there is nothing
  // to check" are different answers, and conflating them sends the generator hunting for a constraint
  // no draw can satisfy.
  assert.equal(hasChecksum('bip39-en', 12), true);
  assert.equal(hasChecksum('bip39-en', 24), true);
  assert.equal(hasChecksum('bip39-en', 13), false, 'BIP-39 defines nothing at 13 words');
  assert.equal(hasChecksum('bip39-en', 0), false);
  assert.equal(checksumHolds(wordsOf('abandon abandon abandon'), 'bip39-en'), false);
});

test('every checksummed length actually works, not only twelve', () => {
  assert.equal(checksumHolds(wordsOf(VECTORS[4]), 'bip39-en'), true, '24 words');
  assert.deepEqual(
    [12, 15, 18, 21, 24].map((n) => hasChecksum('bip39-en', n)),
    [true, true, true, true, true],
  );
});

test('a word is read by its index, and an unknown one is -1 rather than 0', () => {
  // `0` is `abandon`, a real word — returning it for something unknown would put a valid phrase
  // together out of a typo.
  assert.equal(indexOf('abandon', 'bip39-en'), 0);
  assert.equal(indexOf('zoo', 'bip39-en'), 2047);
  assert.equal(indexOf('notaword', 'bip39-en'), -1);
});

test('case and stray spacing are the person’s typing, not a different phrase', () => {
  assert.equal(indexOf('  ABANDON ', 'bip39-en'), 0);
  assert.equal(checksumHolds(wordsOf(`  ${VECTORS[0].toUpperCase()}  `), 'bip39-en'), true);
});

test('NFKD, because the same phrase typed on two machines is the same phrase', () => {
  // Not academic: a composed and a decomposed accent are different code points and the same letters.
  // Without normalisation one of them fails its checksum for a reason nobody can see on screen.
  assert.equal(normalize('é'), normalize('é'), 'combining and precomposed agree');
});

test('a phrase splits on any whitespace, because people paste from anywhere', () => {
  assert.deepEqual(wordsOf(' abandon\tabandon\n abandon '), ['abandon', 'abandon', 'abandon']);
  assert.deepEqual(wordsOf('   '), [], 'and nothing is no words, never one empty one');
});

test('an unknown wordlist id is refused rather than defaulted', () => {
  assert.equal(isWordlistId('bip39-en'), true);
  assert.equal(isWordlistId('bip39-xx'), false);
  assert.equal(isWordlistId(undefined), false);
});

test('every id in the union is usable, so the type and the registry cannot drift', () => {
  for (const id of WORDLIST_IDS) {
    assert.equal(isWordlistId(id as WordlistId), true);
  }
});

/**
 * One real 12-word mnemonic per registered language, for all-zero entropy.
 *
 * <p>DERIVED from the standard's own definition rather than copied from anywhere: eleven words of
 * index 0 followed by the word the checksum picks. That is what makes them worth having — a language
 * whose data is wrong produces a vector its OWN checksum rejects, so the assertion below fails for the
 * language that is broken rather than for all of them at once.</p>
 */
const PER_LANGUAGE: ReadonlyArray<readonly [WordlistId, string]> = [
  ['bip39-en', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'],
  ['bip39-ja', 'あいこくしん あいこくしん あいこくしん あいこくしん あいこくしん あいこくしん あいこくしん あいこくしん あいこくしん あいこくしん あいこくしん あおぞら'],
  ['bip39-ko', '가격 가격 가격 가격 가격 가격 가격 가격 가격 가격 가격 가능'],
  ['bip39-es', 'ábaco ábaco ábaco ábaco ábaco ábaco ábaco ábaco ábaco ábaco ábaco abierto'],
  ['bip39-zh-hans', '的 的 的 的 的 的 的 的 的 的 的 在'],
  ['bip39-zh-hant', '的 的 的 的 的 的 的 的 的 的 的 在'],
  ['bip39-fr', 'abaisser abaisser abaisser abaisser abaisser abaisser abaisser abaisser abaisser abaisser abaisser abeille'],
  ['bip39-it', 'abaco abaco abaco abaco abaco abaco abaco abaco abaco abaco abaco abete'],
  ['bip39-cs', 'abdikace abdikace abdikace abdikace abdikace abdikace abdikace abdikace abdikace abdikace abdikace agrese'],
  ['bip39-pt', 'abacate abacate abacate abacate abacate abacate abacate abacate abacate abacate abacate abater'],];

test('every registered language checks out on its own vector', () => {
  assert.equal(PER_LANGUAGE.length, WORDLIST_IDS.length, 'a language with no vector is a language nobody checked');

  for (const [id, phrase] of PER_LANGUAGE) {
    assert.equal(checksumHolds(wordsOf(phrase), id), true, `${id} does not check out`);
  }
});

test('every list is 2048 unique words, in order — the property all ten depend on', () => {
  for (const id of WORDLIST_IDS) {
    const words = wordlistOf(id);
    assert.equal(words.length, 2048, `${id} is not 2048 words`);
    assert.equal(new Set(words).size, 2048, `${id} has a duplicate, so one index is unreachable`);
  }
});

test('a vector from ONE language never checks out in another', () => {
  // The mistake this catches is a copy-paste in the registry: two ids pointing at the same data. Both
  // would pass every test above and the wrong one would silently read the wrong phrases.
  const [firstId, firstPhrase] = PER_LANGUAGE[0];

  for (const [id] of PER_LANGUAGE.filter(([other]) => other !== firstId)) {
    assert.equal(checksumHolds(wordsOf(firstPhrase), id), false, `${id} accepted a ${firstId} phrase`);
  }
});

test('the four-letter prefix is unique on every Latin-script list — with accents REMOVED', () => {
  // BIP-39 guarantees this for the Latin-script lists, and it is what makes a typo findable: four
  // letters identify a word.
  //
  // Written first against `normalize` (NFKD) and it FAILED on Spanish — correctly. NFKD splits a
  // letter like a-acute into the letter plus a combining mark, so the accent eats one of the four
  // slots and two words collide. The standard's property is on the accent-stripped form, which is
  // also what makes it useful to a person: somebody typing on a keyboard without accents has still
  // identified one word. Fifteen Spanish pairs turn on the distinction.
  //
  // It does NOT hold for the CJK lists, whose words are one or two characters — asserting it there
  // would be asserting something the standard never claimed.
  const latin = WORDLIST_IDS.filter((id) => !id.startsWith('bip39-zh') && id !== 'bip39-ja' && id !== 'bip39-ko');

  for (const id of latin) {
    const prefixes = new Set(wordlistOf(id).map((word) => withoutAccents(word).slice(0, 4)));
    assert.equal(prefixes.size, 2048, `${id}: two words share their first four letters`);
  }
});

/** NFKD, then drop the combining marks it separated out. */
function withoutAccents(word: string): string {
  return normalize(word).replace(/[̀-ͯ]/g, '');
}

test('every list is already NFKD, so a stored phrase and a typed one compare equal', () => {
  for (const id of WORDLIST_IDS) {
    const unnormalised = wordlistOf(id).filter((word) => word !== normalize(word));
    assert.deepEqual(unnormalised, [], `${id} carries words that are not in normal form`);
  }
});
