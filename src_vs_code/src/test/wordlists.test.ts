import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moneroPrefix } from '../moneroChecksum';
import {
  WORDLIST_IDS,
  WordlistId,
  checksumHolds,
  hasChecksum,
  indexOf,
  isWordlistId,
  mnemonicFor,
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

/**
 * The BIP-39 half of the registry.
 *
 * <p>Every test below that says "every list" meant "every BIP-39 list" from the day it was written,
 * and said `WORDLIST_IDS` because at the time those were the same set. Monero's list is 1626 words
 * with a CRC-32 checksum over three-letter prefixes — none of the properties here are about it, and
 * asserting them there would be asserting things nobody ever claimed. It has its own four below.</p>
 */
const BIP39_IDS = WORDLIST_IDS.filter((id) => id.startsWith('bip39-'));

test('every registered BIP-39 language checks out on its own vector', () => {
  assert.equal(PER_LANGUAGE.length, BIP39_IDS.length, 'a language with no vector is a language nobody checked');

  for (const [id, phrase] of PER_LANGUAGE) {
    assert.equal(checksumHolds(wordsOf(phrase), id), true, `${id} does not check out`);
  }
});

test('every BIP-39 list is 2048 unique words, in order — the property all ten depend on', () => {
  for (const id of BIP39_IDS) {
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
  const latin = BIP39_IDS.filter((id) => !id.startsWith('bip39-zh') && id !== 'bip39-ja' && id !== 'bip39-ko');

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

/**
 * Monero — the one list the payment plan shipped without, and the reason it did.
 *
 * <p>Its deviation 4 said the list was "not available as plain data from any reachable package, and
 * inventing it for a checksum validator is exactly the failure the verification above exists to
 * prevent". That was true of the packages: `monerojs` carries no list, and `mymonero-core-js` and
 * `monero-ts` carry it only compiled into WebAssembly. It is not true of the canonical SOURCE, which
 * is where this one came from — `src/mnemonics/english.h` in monero-project/monero.</p>
 *
 * <p>The vectors below are the part that makes this more than a transcription: two real 25-word seeds
 * published by two INDEPENDENT projects — monero-project's own functional tests and monero-python —
 * whose checksums hold only if the table is right, in order, and the algorithm agrees with Monero's.</p>
 */
const MONERO_SEEDS: readonly string[] = [
  // monero-project/monero, tests/functional_tests/wallet.py
  'velvet lymph giddy number token physics poetry unquoted nibs useful sabotage limits benches '
  + 'lifestyle eden nitrogen anvil fewest avoid batch vials washing fences goat unquoted',
  // monero-ecosystem/monero-python, tests/test_seed.py — a different project, a different seed
  'wedge going quick racetrack auburn physics lectures light waist axes whipped habitat square '
  + 'awkward together injury niece nugget guarded hive obnoxious waxing faked folding square',
];

test('two real Monero seeds, from two independent projects, check out', () => {
  for (const seed of MONERO_SEEDS) {
    assert.equal(checksumHolds(wordsOf(seed), 'monero-en'), true, `this seed does not check out: ${seed.slice(0, 40)}…`);
  }
});

test('a Monero seed with its checksum word replaced does NOT check out', () => {
  // The half that matters: a checker that accepts everything would pass the test above.
  for (const seed of MONERO_SEEDS) {
    const words = [...wordsOf(seed)];
    const other = wordlistOf('monero-en').find((word) => moneroPrefix(word) !== moneroPrefix(words[24]));
    words[24] = other ?? '';
    assert.equal(checksumHolds(words, 'monero-en'), false, 'a wrong checksum word was accepted');
  }
});

test('the Monero list is 1626 words whose three-letter prefixes are all distinct', () => {
  // The defining property of a Monero wordlist, and the strongest integrity check available on it:
  // three characters identify a word, so a truncation, a duplication or a stray edit breaks this
  // long before it could quietly break somebody's seed.
  const words = wordlistOf('monero-en');

  assert.equal(words.length, 1626);
  assert.equal(new Set(words).size, 1626, 'a duplicate word');
  assert.equal(new Set(words.map(moneroPrefix)).size, 1626, 'two words share their first three letters');
  assert.ok(words.every((word) => /^[a-z]{4,12}$/.test(word)), 'a word is not plain lowercase latin');
});

test('Monero checksums only at 25 words, and BIP-39 never does', () => {
  // `get_is_old_style_seed`: anything that is not seed_length + 1 is an old-style seed, which this
  // checksum says nothing about. Guarding it matters — `hasChecksum` is what stops the decoy
  // generator hunting a constraint no draw can satisfy.
  assert.equal(hasChecksum('monero-en', 25), true);
  for (const length of [12, 13, 24, 26, 50]) {
    assert.equal(hasChecksum('monero-en', length), false, `${length} words must carry no checksum`);
  }
  assert.equal(hasChecksum('bip39-en', 25), false, 'and 25 is not a BIP-39 length');
});

test('a constructed Monero seed converges — which is what a decoy needs', () => {
  // `decoyPhrase` asks for a converging phrase on demand, and one draw in twenty-four converges by
  // chance. Constructed, never sampled.
  const drawn = mnemonicFor(25, 'monero-en', () => 0.4242);

  assert.equal(drawn.length, 25);
  assert.equal(checksumHolds(drawn, 'monero-en'), true, 'a constructed seed must check out by construction');
  assert.equal(checksumHolds(drawn, 'bip39-en'), false, 'and it is not a BIP-39 phrase');
});
