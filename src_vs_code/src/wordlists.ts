import * as crypto from 'node:crypto';
import { BIP39_EN } from './wordlistBip39En';
import { BIP39_JA } from './wordlistBip39Ja';
import { BIP39_KO } from './wordlistBip39Ko';
import { BIP39_ES } from './wordlistBip39Es';
import { BIP39_ZH_HANS } from './wordlistBip39ZhHans';
import { BIP39_ZH_HANT } from './wordlistBip39ZhHant';
import { BIP39_FR } from './wordlistBip39Fr';
import { BIP39_IT } from './wordlistBip39It';
import { BIP39_CS } from './wordlistBip39Cs';
import { BIP39_PT } from './wordlistBip39Pt';
import { MONERO_EN } from './wordlistMoneroEn';
import { MONERO_SEED_LENGTH, moneroChecksumHolds, moneroMnemonic } from './moneroChecksum';

/**
 * Which wordlists a phrase can be written in, and what can be CHECKED about one.
 *
 * <p>The mechanism; the lists themselves are data modules beside it (2048 words per language against
 * an 800-line ceiling means one module each, never one file with ten). Registering a language is a row
 * here plus its own file — and `wordlists.test.ts` reddens if a row has no data or data has no row.</p>
 *
 * <p><b>Why a checksum matters here at all.</b> A phrase can be marked to be woven with a decoy, and a
 * woven phrase has no original left to compare against: a typo can never be noticed afterwards. The
 * checksum is the last moment anybody can catch one, which is why `paymentValidation.ts` turns it from
 * a hint into a confirmation for a field about to be woven.</p>
 *
 * <p>And it is why `hasChecksum` exists rather than being assumed: a wordlist that defines no checksum
 * at a given length has nothing to validate, and pretending otherwise would either reject good phrases
 * or send the decoy generator hunting for a constraint no draw can satisfy (§4.3).</p>
 */
export const WORDLIST_IDS = [
  'bip39-en',
  'bip39-ja',
  'bip39-ko',
  'bip39-es',
  'bip39-zh-hans',
  'bip39-zh-hant',
  'bip39-fr',
  'bip39-it',
  'bip39-cs',
  'bip39-pt',
  'monero-en',
] as const;

export type WordlistId = (typeof WORDLIST_IDS)[number];

export function isWordlistId(value: unknown): value is WordlistId {
  return typeof value === 'string' && (WORDLIST_IDS as readonly string[]).includes(value);
}

interface Wordlist {
  readonly id: WordlistId;
  readonly label: string;
  readonly words: readonly string[];
  /**
   * Word counts at which this list defines a checksum.
   *
   * <p>BIP-39: 12, 15, 18, 21 and 24. Nothing else — an 11-word phrase is not a short BIP-39 phrase
   * with a weak checksum, it is a phrase BIP-39 says nothing about, and the honest answer is to check
   * nothing rather than to invent a rule.</p>
   */
  readonly checksumLengths: readonly number[];
  /**
   * Which checksum FAMILY this list belongs to.
   *
   * <p>Not a detail of the same rule: BIP-39 reads a phrase as bits and hashes the entropy, Monero
   * CRC-32s the three-character prefixes and repeats one of the words. A list has one or the other,
   * and the two live in different modules because they share nothing but the question they answer.</p>
   */
  readonly checksum: 'bip39' | 'monero';
}

/**
 * The five lengths BIP-39 defines, shared by every one of its ten languages.
 *
 * <p>One constant rather than ten copies: the languages differ in their words and in nothing else, and
 * ten hand-written copies of the same five numbers is ten chances for one of them to be wrong in a way
 * that only shows up as a valid phrase being rejected.</p>
 */
const BIP39_LENGTHS: readonly number[] = [12, 15, 18, 21, 24];

const REGISTRY: Readonly<Record<WordlistId, Wordlist>> = {
  'bip39-en': {
    id: 'bip39-en',
    label: 'BIP-39 (English)',
    words: BIP39_EN,
    checksumLengths: BIP39_LENGTHS,
    checksum: 'bip39',
  },
  'bip39-ja': {
    id: 'bip39-ja',
    label: 'BIP-39 (Japanese)',
    words: BIP39_JA,
    checksumLengths: BIP39_LENGTHS,
    checksum: 'bip39',
  },
  'bip39-ko': {
    id: 'bip39-ko',
    label: 'BIP-39 (Korean)',
    words: BIP39_KO,
    checksumLengths: BIP39_LENGTHS,
    checksum: 'bip39',
  },
  'bip39-es': {
    id: 'bip39-es',
    label: 'BIP-39 (Spanish)',
    words: BIP39_ES,
    checksumLengths: BIP39_LENGTHS,
    checksum: 'bip39',
  },
  'bip39-zh-hans': {
    id: 'bip39-zh-hans',
    label: 'BIP-39 (Chinese, Simplified)',
    words: BIP39_ZH_HANS,
    checksumLengths: BIP39_LENGTHS,
    checksum: 'bip39',
  },
  'bip39-zh-hant': {
    id: 'bip39-zh-hant',
    label: 'BIP-39 (Chinese, Traditional)',
    words: BIP39_ZH_HANT,
    checksumLengths: BIP39_LENGTHS,
    checksum: 'bip39',
  },
  'bip39-fr': {
    id: 'bip39-fr',
    label: 'BIP-39 (French)',
    words: BIP39_FR,
    checksumLengths: BIP39_LENGTHS,
    checksum: 'bip39',
  },
  'bip39-it': {
    id: 'bip39-it',
    label: 'BIP-39 (Italian)',
    words: BIP39_IT,
    checksumLengths: BIP39_LENGTHS,
    checksum: 'bip39',
  },
  'bip39-cs': {
    id: 'bip39-cs',
    label: 'BIP-39 (Czech)',
    words: BIP39_CS,
    checksumLengths: BIP39_LENGTHS,
    checksum: 'bip39',
  },
  'bip39-pt': {
    id: 'bip39-pt',
    label: 'BIP-39 (Portuguese)',
    words: BIP39_PT,
    checksumLengths: BIP39_LENGTHS,
    checksum: 'bip39',
  },
  'monero-en': {
    id: 'monero-en',
    label: 'Monero (English)',
    words: MONERO_EN,
    // ONE length, and the source says so in as many words: anything that is not `seed_length + 1`
    // is an old-style seed, which this checksum says nothing about.
    checksumLengths: [MONERO_SEED_LENGTH],
    checksum: 'monero',
  },
};

export function wordlistOf(id: WordlistId): readonly string[] {
  return REGISTRY[id].words;
}

export function wordlistLabel(id: WordlistId): string {
  return REGISTRY[id].label;
}

/**
 * Does this list define a checksum at this length?
 *
 * <p>The guard that stops the decoy generator chasing an impossible constraint (§4.3): asking for a
 * 12-word phrase with a converging checksum from a list that defines one only at 25 words is asking
 * for something no draw can produce, and a naive loop spins for ever. Where there is no checksum there
 * is nothing to reveal by mismatching one, so the constraint simply does not apply.</p>
 */
export function hasChecksum(id: WordlistId, length: number): boolean {
  return REGISTRY[id].checksumLengths.includes(length);
}

/** A word's value is its INDEX, so this is the whole of "reading" a phrase. `-1` when unknown. */
export function indexOf(word: string, id: WordlistId): number {
  return wordlistOf(id).indexOf(normalize(word));
}

/**
 * Does this phrase's checksum hold?
 *
 * <p>`false` for a phrase with a word the list does not contain, or a length the list checksums
 * nothing at — both are "this does not check out", which is what a caller wants to hear. Ask
 * `hasChecksum` first when the distinction matters.</p>
 */
export function checksumHolds(words: readonly string[], id: WordlistId): boolean {
  if (!hasChecksum(id, words.length)) {
    return false;
  }
  return REGISTRY[id].checksum === 'monero'
    ? moneroChecksumHolds(words, wordlistOf(id))
    : bip39ChecksumHolds(words, id);
}

/** BIP-39's own: the phrase as bits, and the trailing bits are a SHA-256 of the entropy. */
function bip39ChecksumHolds(words: readonly string[], id: WordlistId): boolean {
  const bits = bitsOf(words, id);
  if (bits === '') {
    return false;
  }
  const entropyBits = (words.length * 11 * 32) / 33;
  const entropy = bytesOf(bits.slice(0, entropyBits));
  return checksumBits(entropy, bits.length - entropyBits) === bits.slice(entropyBits);
}

/** Each word as eleven bits, in order — or `''` if any word is not in the list. */
function bitsOf(words: readonly string[], id: WordlistId): string {
  const list = wordlistOf(id);
  const indexes = words.map((word) => list.indexOf(normalize(word)));
  return indexes.includes(-1) ? '' : indexes.map((index) => index.toString(2).padStart(11, '0')).join('');
}

function bytesOf(bits: string): Buffer {
  const bytes = (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2));
  return Buffer.from(bytes);
}

/** The leading bits of SHA-256 over the entropy — BIP-39's whole checksum. */
function checksumBits(entropy: Buffer, count: number): string {
  const digest = crypto.createHash('sha256').update(entropy).digest();
  return [...digest]
    .map((byte) => byte.toString(2).padStart(8, '0'))
    .join('')
    .slice(0, count);
}

/**
 * NFKD, lower case, and the spacing normalised.
 *
 * <p>BIP-39 specifies NFKD, and it is not academic: a phrase typed on a Mac and a phrase typed on
 * Windows can be the same letters in different code points, and without this one of them would fail
 * its checksum for a reason nobody could see on screen.</p>
 */
export function normalize(word: string): string {
  return word.normalize('NFKD').trim().toLowerCase();
}

/** A phrase as its words — any run of whitespace, because people paste from anywhere. */
export function wordsOf(phrase: string): readonly string[] {
  return phrase.trim().length === 0 ? [] : phrase.trim().split(/\s+/);
}

/**
 * A mnemonic of this many words, from random entropy — one that CONVERGES by construction.
 *
 * <p>Built rather than sampled, because sampling for a converging phrase is one draw in sixteen at
 * twelve words and one in two hundred and fifty-six at twenty-four. `decoyPhrase.ts` needs a
 * converging decoy on demand, and a bound nobody has to reason about is worth more than a clever
 * loop.</p>
 *
 * <p>Refuses a length this list defines no checksum for: there is no such thing as a converging
 * 13-word BIP-39 phrase, and returning something that merely looks like one would be a lie the
 * checker would then contradict.</p>
 */
export function mnemonicFor(length: number, id: WordlistId, random: () => number): readonly string[] {
  if (!hasChecksum(id, length)) {
    throw new Error(`${id} defines no checksum at ${length} words, so no phrase of that length converges.`);
  }
  return REGISTRY[id].checksum === 'monero'
    ? moneroMnemonic(wordlistOf(id), random)
    : bip39Mnemonic(length, id, random);
}

/** BIP-39's construction: random entropy, then the checksum bits the standard computes from it. */
function bip39Mnemonic(length: number, id: WordlistId, random: () => number): readonly string[] {
  const entropyBits = (length * 11 * 32) / 33;
  const entropy = Buffer.from(
    Array.from({ length: entropyBits / 8 }, () => Math.min(255, Math.floor(random() * 256))),
  );
  const bits = [...entropy].map((byte) => byte.toString(2).padStart(8, '0')).join('');
  const all = bits + checksumBits(entropy, length * 11 - entropyBits);
  const list = wordlistOf(id);
  return (all.match(/.{11}/g) ?? []).map((chunk) => list[parseInt(chunk, 2)]);
}
