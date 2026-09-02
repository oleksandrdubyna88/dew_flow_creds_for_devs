import { WordlistId, checksumHolds, hasChecksum, mnemonicFor, wordlistOf } from './wordlists';
import { Random } from './decoyDigits';

/**
 * A decoy phrase whose checksum matches the real one BY STATE — not one that is always valid.
 *
 * <p>The rule this replaced was "the decoy must have a converging checksum", and it defeats the
 * feature it belongs to. Somebody who deliberately re-ordered the words of their own phrase has a
 * phrase that does NOT converge — so under the correct method exactly one half would validate, which
 * points straight at the correct method. Matching the state costs nothing: the entered phrase's
 * checksum has already been computed by the time this is called.</p>
 *
 * <p><b>It is not called at all when the second column holds the person's own words or a second real
 * key</b> (§4.4). There is nothing to fake: both halves are real, and their checksum states match by
 * construction.</p>
 *
 * <p>Pure: no `vscode`, randomness by parameter.</p>
 */
export interface PhraseDecoySpec {
  /** The phrase being hidden. Its checksum state is what the decoy has to match. */
  readonly words: readonly string[];
  /** The list the REAL phrase is written in — where its checksum state is read from. */
  readonly from: WordlistId;
  /** The list the DECOY is drawn from. May differ: two real phrases may be different languages. */
  readonly to: WordlistId;
}

/** A refusal with a name, so a caller can tell "could not" from "crashed". */
export class DecoyPhraseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecoyPhraseError';
  }
}

/**
 * How many draws before giving up.
 *
 * <p>Only the NON-converging case samples at all, and it succeeds about fifteen times in sixteen, so
 * this bound is never approached in practice. It exists because an unbounded loop in a save path is
 * not a test failure anybody sees — it is a hung window.</p>
 */
const MAX_ATTEMPTS = 64;

export function generateDecoyPhrase(spec: PhraseDecoySpec, random: Random): readonly string[] {
  if (spec.words.length === 0) {
    return [];
  }
  const target = targetState(spec);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = draw(spec, target, random);
    if (acceptable(candidate, spec, target)) {
      return candidate;
    }
  }
  throw new DecoyPhraseError(
    `Could not produce a decoy phrase of ${spec.words.length} words with the required checksum state `
    + `after ${MAX_ATTEMPTS} attempts. Nothing was saved.`,
  );
}

/**
 * Which checksum state the decoy must have, or `undefined` for "no constraint".
 *
 * <p>`undefined` in two cases, and both are the point of the review finding that produced this: the
 * REAL list defines no checksum at this length (so the real phrase's state says nothing), or the DECOY
 * list defines none (so no draw could ever satisfy the constraint). §4.3's rule is about not REVEALING
 * the method through a mismatch; where there is no checksum, there is nothing to reveal.</p>
 */
function targetState(spec: PhraseDecoySpec): boolean | undefined {
  if (!hasChecksum(spec.from, spec.words.length) || !hasChecksum(spec.to, spec.words.length)) {
    return undefined;
  }
  return checksumHolds(spec.words, spec.from);
}

/**
 * One candidate.
 *
 * <p>A converging phrase is CONSTRUCTED rather than sampled — random entropy, then the checksum word
 * the standard computes from it. Sampling for convergence would be one draw in sixteen at twelve words
 * and one in two hundred and fifty-six at twenty-four, which is a bound nobody should have to reason
 * about. Every other case is a free draw, and the checksum is checked afterwards.</p>
 */
function draw(spec: PhraseDecoySpec, target: boolean | undefined, random: Random): readonly string[] {
  return target === true ? mnemonicFor(spec.words.length, spec.to, random) : freeDraw(spec, random);
}

/** Words picked at random from the decoy's own list, of the right length. */
function freeDraw(spec: PhraseDecoySpec, random: Random): readonly string[] {
  const list = wordlistOf(spec.to);
  return Array.from({ length: spec.words.length }, () => list[Math.min(list.length - 1, Math.floor(random() * list.length))]);
}

/** Never the phrase it hides, and in the required checksum state where one is required. */
function acceptable(candidate: readonly string[], spec: PhraseDecoySpec, target: boolean | undefined): boolean {
  if (candidate.join(' ') === spec.words.join(' ')) {
    return false;
  }
  return target === undefined || checksumHolds(candidate, spec.to) === target;
}
