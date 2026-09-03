import { crc32 } from 'node:zlib';

/**
 * Monero's seed checksum — a different family from BIP-39's, and not a variation on it.
 *
 * <p>BIP-39 reads a phrase as bits: each word is its INDEX, and the trailing bits are a SHA-256 of
 * the entropy. Monero does none of that. It takes the first three characters of each word, CRC-32s
 * the concatenation, and the remainder names which of the words is repeated as the last one. Two
 * unrelated algorithms behind one question, which is why this is its own module rather than a branch
 * inside `wordlists.ts`.</p>
 *
 * <p>Transcribed from the canonical implementation — `create_checksum_index` and `checksum_test` in
 * `src/mnemonics/electrum-words.cpp`, monero-project/monero — rather than from memory of it, and the
 * two details that are easy to get wrong are both kept:</p>
 *
 * <ul>
 *   <li>the modulus is the length of the list PASSED IN (24 for a 25-word seed), not a constant;</li>
 *   <li>a word no longer than the prefix is taken WHOLE. No English word here is that short — the
 *       shortest is four characters — but the rule is the source's, and a later language may need
 *       it.</li>
 * </ul>
 *
 * <p><b>Comparison is by prefix, everywhere.</b> Three characters identify a word in this list
 * uniquely, which is the property the whole scheme rests on, so `abdomen` and `abducts` would be the
 * same word to a checksum and the list is built so that no such pair exists.</p>
 *
 * <p>Pure: no `vscode`. `node:zlib`'s CRC-32 is the same polynomial Boost's is, and it is verified
 * against two published seeds rather than assumed — see `wordlists.test.ts`.</p>
 */

/** Three characters identify a word in the English list. `English(): Base(…, 3)` in `english.h`. */
export const MONERO_PREFIX_LENGTH = 3;

/**
 * A modern Monero seed: twenty-four words and the checksum word.
 *
 * <p>The only length that carries one. `get_is_old_style_seed` in the same source says exactly this —
 * anything that is not `seed_length + 1` is an old-style seed, which this checksum says nothing
 * about.</p>
 */
export const MONERO_SEED_LENGTH = 25;

/** A word as the checksum sees it. */
export function moneroPrefix(word: string): string {
  return word.length > MONERO_PREFIX_LENGTH ? word.slice(0, MONERO_PREFIX_LENGTH) : word;
}

/**
 * Which of these words is repeated as the checksum.
 *
 * <p>Takes the twenty-four, never the twenty-five: the modulus is this list's own length, so passing
 * the whole seed would answer a different question and be wrong by one in twenty-five cases.</p>
 */
export function moneroChecksumIndex(words: readonly string[]): number {
  return crc32(words.map(moneroPrefix).join('')) % words.length;
}

/**
 * Does this seed's checksum hold?
 *
 * <p>False rather than throwing for everything that is not a seed — the wrong length, a word this
 * list does not have — because every caller here wants "this does not check out" and the ones that
 * need the distinction ask `hasChecksum` first.</p>
 */
export function moneroChecksumHolds(words: readonly string[], list: readonly string[]): boolean {
  if (words.length !== MONERO_SEED_LENGTH || !allKnown(words, list)) {
    return false;
  }
  const body = words.slice(0, MONERO_SEED_LENGTH - 1);
  return moneroPrefix(body[moneroChecksumIndex(body)]) === moneroPrefix(words[MONERO_SEED_LENGTH - 1]);
}

/**
 * A seed that converges by construction — twenty-four drawn, and the word the checksum names.
 *
 * <p>Built rather than sampled, for `mnemonicFor`'s reason: one draw in twenty-four would converge by
 * chance, and a decoy generator that spins is a hung window rather than a test failure.</p>
 */
export function moneroMnemonic(list: readonly string[], random: () => number): readonly string[] {
  const body = Array.from({ length: MONERO_SEED_LENGTH - 1 }, () =>
    list[Math.min(list.length - 1, Math.floor(random() * list.length))]);
  return [...body, body[moneroChecksumIndex(body)]];
}

/** Every word must be one this list has — by its prefix, which is how this list identifies one. */
function allKnown(words: readonly string[], list: readonly string[]): boolean {
  const prefixes = new Set(list.map(moneroPrefix));
  return words.every((word) => prefixes.has(moneroPrefix(word)));
}
