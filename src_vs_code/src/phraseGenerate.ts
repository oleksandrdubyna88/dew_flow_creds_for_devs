import * as crypto from 'node:crypto';
import { Random } from './decoyDigits';
import { WordlistId, hasChecksum, isWordlistId, mnemonicFor, wordlistLabel } from './wordlists';

/**
 * Drawing a phrase, with the list and the length chosen.
 *
 * <p>Everything this needs already existed and was reachable from one caller only: `mnemonicFor`
 * has produced checksum-valid phrases since the decoy work, and the phrase form had no way to ask
 * for one — the words had to be pasted or typed. So this is a wire, not a new mechanism.</p>
 *
 * <p><b>Drawn HERE, never in the page.</b> `crypto.randomInt` is a Node API and a webview reaching
 * for `Math.random()` would produce something that merely looks random — the rule the password
 * generator already states, and it matters more for a seed than for anything else this build
 * makes.</p>
 */

/** The house source, shaped as the [0, 1) draw `mnemonicFor` takes. */
const DRAW_RANGE = 2 ** 32;

export const cryptoRandom: Random = () => crypto.randomInt(DRAW_RANGE) / DRAW_RANGE;

/**
 * The lengths worth offering. Which of them a given list actually CHECKSUMS is a property of that
 * list — BIP-39 checksums the first five, Monero only 25 — so the answer filters this by the list.
 */
export const PHRASE_WORD_CHOICES: readonly number[] = [12, 15, 18, 21, 24, 25];

/** Which lengths this list can produce a converging phrase at. Empty for a list with no checksum. */
export function lengthsFor(id: WordlistId): readonly number[] {
  return PHRASE_WORD_CHOICES.filter((length) => hasChecksum(id, length));
}

/**
 * A generated phrase, or an honest refusal.
 *
 * <p>Both arguments come off a page message and are checked rather than trusted. A length this list
 * does not checksum is CLAMPED to one it does, and the note says which — `mnemonicFor` throws on
 * such a length, correctly, and a form that swallowed that would be a Generate button that
 * sometimes does nothing.</p>
 */
export function generatePhraseAnswer(
  words: unknown,
  wordlist: unknown,
  random: Random = cryptoRandom,
): Record<string, unknown> {
  const id = listOf(wordlist);
  const asked = askedLength(words);
  const length = lengthFor(lengthsFor(id), asked);
  return length === 0 ? refusal(id) : drawnAnswer(id, length, asked, random);
}

/** A list name off a page message, or the one almost every seed in the world is written in. */
function listOf(wordlist: unknown): WordlistId {
  return isWordlistId(wordlist) ? wordlist : 'bip39-en';
}

/** A count off a page message. Zero means "nothing was asked", which the note reads differently. */
function askedLength(words: unknown): number {
  return typeof words === 'number' ? words : 0;
}

/** The asked-for length when the list can checksum it, its first workable one otherwise, or 0. */
function lengthFor(offered: readonly number[], asked: number): number {
  return offered.includes(asked) ? asked : (offered[0] ?? 0);
}

/** A list with no checksum at any length can produce nothing that converges, and says so. */
function refusal(id: WordlistId): Record<string, unknown> {
  return {
    type: 'phraseGenerated',
    ok: false,
    why: `${wordlistLabel(id)} has no checksum, so nothing can be drawn to converge.`,
  };
}

function drawnAnswer(id: WordlistId, length: number, asked: number, random: Random): Record<string, unknown> {
  return {
    type: 'phraseGenerated',
    ok: true,
    words: mnemonicFor(length, id, random).join(' '),
    note: noteFor(id, length, asked),
  };
}

/** What the form says under the box — including, when it happened, that the length was moved. */
function noteFor(id: WordlistId, length: number, asked: number): string {
  const drawn = `${length} words from ${wordlistLabel(id)}, checksum valid. It has never been written to disk.`;
  const moved = asked !== length && asked !== 0;
  return moved
    ? `${drawn} ${wordlistLabel(id)} defines no checksum at ${asked} words, so ${length} was drawn instead.`
    : drawn;
}
