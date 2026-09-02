import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checksumHolds, hasChecksum, wordlistOf, wordsOf } from '../wordlists';
import { DecoyPhraseError, generateDecoyPhrase } from '../decoyPhrase';

/**
 * The decoy phrase's checksum matches the real one BY STATE — not "is always valid".
 *
 * <p>The old rule was "the decoy must have a converging checksum", and it is wrong in a way that
 * defeats the whole feature. If somebody deliberately re-ordered the words of their own phrase — so it
 * does NOT converge — then under the correct method exactly one half would validate. Which points
 * straight at the correct method. So: converges → make a converging decoy; does not converge → make
 * one that does not either.</p>
 *
 * <p>And the constraint applies only where a checksum EXISTS at that length in the decoy's own
 * wordlist. A 12-word phrase whose decoy list defines a checksum only at 25 words is asking for
 * something no draw can satisfy, and a naive loop spins for ever — which in a save path is not a test
 * failure anybody sees, but a hung window.</p>
 */

const VALID = wordsOf(
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
);

/** The same words, two of them swapped: every word is real, and the checksum no longer holds. */
const REORDERED = wordsOf(
  'legal winner thank year wave sausage worth useful legal winner yellow thank',
);

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

test('a converging phrase gets a converging decoy', () => {
  assert.equal(checksumHolds(VALID, 'bip39-en'), true, 'the fixture is what it claims');

  for (let seed = 1; seed <= 20; seed++) {
    const decoy = generateDecoyPhrase({ words: VALID, from: 'bip39-en', to: 'bip39-en' }, seeded(seed));
    assert.equal(checksumHolds(decoy, 'bip39-en'), true, `${decoy.join(' ')} does not converge`);
  }
});

test('a phrase whose words were MOVED gets a decoy that also fails — the finding this rule exists for', () => {
  // Under the correct method, exactly one half validating is a signpost to the correct method.
  assert.equal(checksumHolds(REORDERED, 'bip39-en'), false, 'the fixture is what it claims');

  for (let seed = 1; seed <= 20; seed++) {
    const decoy = generateDecoyPhrase({ words: REORDERED, from: 'bip39-en', to: 'bip39-en' }, seeded(seed));
    assert.equal(checksumHolds(decoy, 'bip39-en'), false, `${decoy.join(' ')} converges, and the real one does not`);
  }
});

test('the decoy is the same length as the phrase it hides', () => {
  const decoy = generateDecoyPhrase({ words: VALID, from: 'bip39-en', to: 'bip39-en' }, seeded(4));
  assert.equal(decoy.length, VALID.length);
});

test('every decoy word comes from the CHOSEN wordlist', () => {
  // A word from another language is spotted instantly, whatever the checksum says.
  const spanish = new Set(wordlistOf('bip39-es'));
  const decoy = generateDecoyPhrase({ words: VALID, from: 'bip39-en', to: 'bip39-es' }, seeded(6));

  for (const word of decoy) {
    assert.ok(spanish.has(word), `${word} is not in the Spanish list`);
  }
});

test('the decoy is never the phrase it hides', () => {
  // The collision guard, at phrase scale. Astronomically unlikely and still checked, because the
  // failure is silent: the record would show the same phrase twice and nobody would find out.
  for (let seed = 1; seed <= 30; seed++) {
    const decoy = generateDecoyPhrase({ words: VALID, from: 'bip39-en', to: 'bip39-en' }, seeded(seed));
    assert.notDeepEqual(decoy, VALID);
  }
});

test('a length the DECOY list checksums nothing at drops the constraint instead of hanging', () => {
  // The review's case, and the reason `hasChecksum` exists. A 13-word phrase has no BIP-39 checksum,
  // so there is nothing to match and nothing to reveal by not matching it. What must NOT happen is a
  // generator hunting for a checksum state no draw can produce.
  const thirteen = wordsOf([...VALID, 'zoo'].join(' '));
  assert.equal(hasChecksum('bip39-en', 13), false, 'the premise of the test');

  const decoy = generateDecoyPhrase({ words: thirteen, from: 'bip39-en', to: 'bip39-en' }, seeded(8));

  assert.equal(decoy.length, 13, 'it terminated, and produced the right length');
});

/**
 * A source that always draws exactly the phrase it is hiding.
 *
 * <p>No test seam in the production code: this drives the real generator into the one state it cannot
 * accept — every candidate equals the original — which is what the bound exists for. Written this way
 * after the first version added a `mustDiffer` flag to the module itself, which is a hatch that would
 * have outlived the test.</p>
 */
function alwaysDraws(words: readonly string[]): () => number {
  const list = wordlistOf('bip39-en');
  const draws = words.map((word) => list.indexOf(word) / list.length + 1e-9);
  let at = 0;
  return () => draws[at++ % draws.length];
}

test('a generator that cannot meet its constraint refuses LOUDLY, inside its bound', () => {
  // An infinite loop in a save path is not a test failure anybody sees — it is a hung window. So the
  // loop is bounded and the failure is named, never a silent fall-through to an unconstrained draw:
  // a quietly relaxed constraint produces exactly the separable half the design forbids.
  assert.throws(
    () => generateDecoyPhrase({ words: REORDERED, from: 'bip39-en', to: 'bip39-en' }, alwaysDraws(REORDERED)),
    DecoyPhraseError,
  );
});

test('the refusal says what could not be done, without quoting the phrase', () => {
  try {
    generateDecoyPhrase({ words: REORDERED, from: 'bip39-en', to: 'bip39-en' }, alwaysDraws(REORDERED));
    assert.fail('it should have refused');
  } catch (error) {
    const message = (error as Error).message;
    assert.match(message, /decoy/i);
    for (const word of REORDERED) {
      assert.ok(!message.includes(word), `the phrase leaked into the refusal: ${word}`);
    }
  }
});

test('a phrase in one language can be hidden behind a decoy in another', () => {
  // Two real phrases may be different lists, so a decoy must be able to be too. The checksum state is
  // read from the REAL phrase's list and matched in the DECOY's.
  const decoy = generateDecoyPhrase({ words: VALID, from: 'bip39-en', to: 'bip39-it' }, seeded(12));

  assert.equal(decoy.length, VALID.length);
  assert.equal(checksumHolds(decoy, 'bip39-it'), true, 'converging, because the real one converges');
});

test('an empty phrase produces no decoy rather than an empty claim', () => {
  assert.deepEqual(generateDecoyPhrase({ words: [], from: 'bip39-en', to: 'bip39-en' }, seeded(1)), []);
});
