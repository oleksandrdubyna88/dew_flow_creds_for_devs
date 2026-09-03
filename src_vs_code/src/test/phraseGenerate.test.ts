import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generatePhraseAnswer, lengthsFor } from '../phraseGenerate';
import { checksumHolds, wordsOf } from '../wordlists';
import { DEFAULT_PASSPHRASE, generatePassphrase } from '../secretGenerator';

/**
 * The phrase form had no Generate at all — the words had to be pasted or typed, though
 * `mnemonicFor` has been producing checksum-valid phrases since the decoy work and was reachable
 * from exactly one caller. This is the wire, and these are the two things a wire can get wrong:
 * drawing something that does not converge, and refusing a length by throwing.
 */

test('a drawn phrase converges, for every list and every length that list checksums', () => {
  for (const id of ['bip39-en', 'bip39-es', 'bip39-ja', 'monero-en'] as const) {
    for (const length of lengthsFor(id)) {
      const answer = generatePhraseAnswer(length, id);

      assert.equal(answer.ok, true, `${id} at ${length} refused`);
      const words = wordsOf(String(answer.words));
      assert.equal(words.length, length, `${id} at ${length} drew ${words.length} words`);
      assert.ok(checksumHolds(words, id), `${id} at ${length} does not check out`);
    }
  }
});

test('a length the list cannot checksum is moved to one it can, and the note says so', () => {
  // Monero checksums at 25 and nothing else. `mnemonicFor` throws on anything else — correctly —
  // and a form that swallowed the throw would be a Generate button that sometimes does nothing.
  const answer = generatePhraseAnswer(12, 'monero-en');

  assert.equal(answer.ok, true);
  assert.equal(wordsOf(String(answer.words)).length, 25);
  assert.match(String(answer.note), /no checksum at 12 words/);
});

test('what comes off a page message is checked, not trusted', () => {
  const nonsense = generatePhraseAnswer('twelve', 'not-a-wordlist');

  assert.equal(nonsense.ok, true, 'it still answers rather than throwing at a boundary');
  assert.match(String(answerNote(nonsense)), /BIP-39 \(English\)/, 'and falls back to the obvious list');
  assert.equal(wordsOf(String(nonsense.words)).length, 12, 'at its first offered length');
});

test('two draws differ — the source is the real one, not a page pretending', () => {
  const one = generatePhraseAnswer(12, 'bip39-en');
  const two = generatePhraseAnswer(12, 'bip39-en');

  assert.notEqual(one.words, two.words);
});

test('the note says where the phrase came from and that it never touched the disk', () => {
  const answer = generatePhraseAnswer(24, 'bip39-en');

  assert.match(String(answer.note), /24 words from BIP-39 \(English\), checksum valid/);
  assert.match(String(answer.note), /never been written to disk/);
});

function answerNote(answer: Record<string, unknown>): string {
  return String(answer.note ?? '');
}

/**
 * The password's passphrase, where a word LENGTH can honestly be asked for — nothing there depends
 * on a checksum, unlike a stored phrase.
 */
test('a length filter draws from the longer list and reports the strength it ACTUALLY has', () => {
  const plain = generatePassphrase({ ...DEFAULT_PASSPHRASE, words: 6 });
  const short = generatePassphrase({ ...DEFAULT_PASSPHRASE, words: 6, maxWordLength: 4 });

  assert.equal(Math.round(plain.entropyBits), 48, 'the shipped list is exactly eight bits a word');
  assert.ok(
    short.entropyBits !== plain.entropyBits,
    'a different pool has a different strength, and saying otherwise would be a lie about a password',
  );
  for (const word of short.value.split('-')) {
    assert.ok(word.length <= 4, `"${word}" is longer than the filter asked for`);
  }
  assert.match(short.description, /\d+ words from a \d+-word list/, 'the note names the real pool');
});

test('a filter that would leave too few words falls back rather than pretending', () => {
  // Under sixteen words is under four bits each, which is not a passphrase whatever it is called.
  const absurd = generatePassphrase({ ...DEFAULT_PASSPHRASE, words: 4, maxWordLength: 1 });

  assert.equal(Math.round(absurd.entropyBits), 32, 'it went back to the shipped list');
});
