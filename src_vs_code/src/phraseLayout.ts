import { PHRASE_RANGE, SHUFFLE_CODES, ShuffleCode, shuffleRefusal } from './shuffle';
import { Random } from './decoyDigits';

/**
 * How a phrase and its second column are laid out, and which layouts a given phrase can use at all.
 *
 * <p>Pure: no `vscode`. The form reads these; it does not decide them.</p>
 */
export type PhraseLayout = 'vertical' | 'horizontal';

/**
 * Which layouts this many words can actually be saved under.
 *
 * <p><b>Horizontal needs an EVEN number of words, and that is arithmetic rather than taste.</b>
 * Weaving requires two columns of equal length. Horizontal splits each phrase in half and pairs the
 * halves — at 25 words (standard Monero, and squarely inside the 6–50 range) that gives 13 and 12, so
 * one column holds 26 tokens and the other 24, `shuffleRefusal` refuses, and the save dies at the last
 * step with the whole form already filled in.</p>
 *
 * <p>So the layout is not offered rather than offered and then refused. A refusal after a form is
 * filled is precisely the failure being prevented, which is why the test asserts the OFFER and not
 * only the refusal.</p>
 */
export function layoutsFor(wordCount: number): readonly PhraseLayout[] {
  return wordCount % 2 === 0 ? ['vertical', 'horizontal'] : ['vertical'];
}

/**
 * Why horizontal is missing, in one line, or `''` when it is not missing.
 *
 * <p>Shown next to the switch rather than only in the help: a control that silently has fewer options
 * than somebody remembers is a control they think is broken.</p>
 */
export function layoutRefusal(wordCount: number): string {
  if (layoutsFor(wordCount).includes('horizontal')) {
    return '';
  }
  return (
    `The side-by-side layout needs an even number of words, and this phrase has ${wordCount}. `
    + 'Weaving pairs two columns of equal length, and half of an odd number cannot make two equal '
    + 'halves.'
  );
}

/**
 * How many methods this phrase can be woven by.
 *
 * <p>Twelve for an odd-length phrase, twenty-four for an even one — because an even one can be woven
 * under either layout. Stated on screen because the arithmetic must not surprise anybody at save time;
 * it is <b>not</b> a defence either way, since enumerating twenty-four is no dearer than twelve.</p>
 */
export function methodCount(wordCount: number): number {
  return SHUFFLE_CODES.length * layoutsFor(wordCount).length;
}

/**
 * The methods, in a different order every time the form opens.
 *
 * <p>So that "the third one" is never a habit worth forming — a method remembered by its POSITION is
 * one the next release could silently change out from under somebody, and a phrase woven under a
 * method nobody can name again is a phrase that is gone.</p>
 */
export function methodOrder(random: Random): readonly ShuffleCode[] {
  const codes = [...SHUFFLE_CODES];
  for (let i = codes.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [codes[i], codes[j]] = [codes[j], codes[i]];
  }
  return codes;
}

/**
 * The two columns to weave, for this layout.
 *
 * <p>Vertical is the whole real phrase against the whole second column. Horizontal pairs the halves:
 * the first half of each, then the second half of each — which is what makes it a different set of
 * methods rather than a different picture of the same one.</p>
 */
export function phraseColumns(
  real: readonly string[],
  second: readonly string[],
  layout: PhraseLayout,
): { first: readonly string[]; secondColumn: readonly string[] } {
  if (layout === 'vertical') {
    return { first: real, secondColumn: second };
  }
  const half = Math.floor(real.length / 2);
  return {
    first: [...real.slice(0, half), ...second.slice(0, half)],
    secondColumn: [...real.slice(half), ...second.slice(half)],
  };
}

/** Why this pair cannot be woven, in a sentence — or `''` when it can. `shuffleRefusal`'s words. */
export function phraseRefusal(real: readonly string[], second: readonly string[]): string {
  return shuffleRefusal(real, second, PHRASE_RANGE);
}

/**
 * The one thing somebody must agree to before a phrase is woven.
 *
 * <p>Unambiguous on purpose, and never softened: a forgotten method is a lost phrase. Not recoverable
 * by us, not by a backup, not by a sync — because the original is in none of them. That is the whole
 * bargain, and somebody making it should read it in those words.</p>
 */
export function phraseSaveWarning(wordCount: number, layout: PhraseLayout): string {
  return (
    `This phrase will be stored woven with its second column under one of ${methodCount(wordCount)} `
    + `methods (${layout} layout). The method is kept NOWHERE — not in this vault, not in a backup, not `
    + 'in the sync. If you forget it, the phrase is gone: nobody can recover it, including us.'
  );
}
