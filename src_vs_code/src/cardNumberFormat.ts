import { CardBrand, brandOf, digitsOf } from './cardBrand';

/**
 * A card number as it is READ, and a card number as it is STORED.
 *
 * <p>People read a card in groups of four because that is how it is printed on the card, and the
 * form's own placeholder has always said so — `4111 1111 1111 1111` — while what it accepted was an
 * undivided run of sixteen digits nobody can check against the plastic in their hand.</p>
 *
 * <h3>The constraint that decides the whole design</h3>
 *
 * <p><b>Grouping is presentation. The record keeps digits and nothing else.</b> A woven number is
 * permuted per CHARACTER (`paymentWeaving` → `shuffleTokens([...original], …)`), so a stored space
 * would be woven in among the digits and the value could not be rebuilt — a stored space is not a
 * cosmetic defect here, it is a lost card number. Hence: format on the way to the screen, strip on
 * the way to the record, and never the reverse.</p>
 *
 * <p>Pure and free of `vscode`, so the caret arithmetic below — the part that is fiddly and that
 * nobody notices until it eats a keystroke — is a unit test rather than something checked by typing
 * into a form.</p>
 */

/** American Express prints 4-6-5, and is the only listed system that is not fours. */
const AMEX_GROUPS: readonly number[] = [4, 6, 5];

const GROUP_OF_FOUR = 4;

/**
 * The digits of `value`, in the groups the card itself is printed in.
 *
 * <p>Non-digits are dropped rather than preserved: this is called on every keystroke, so what it is
 * given is whatever the box holds mid-edit — half-typed, pasted with dashes, pasted out of a bank
 * statement with a line break in it.</p>
 */
export function groupDigits(value: string, brand: CardBrand | '' = brandOf(value)): string {
  const digits = digitsOf(value);
  let at = 0;
  return sizesFor(brand, digits.length)
    .map((size) => {
      const part = digits.slice(at, at + size);
      at += size;
      return part;
    })
    .filter((part) => part.length > 0)
    .join(' ');
}

/**
 * The group sizes this many digits fall into, for this system.
 *
 * <p>Whatever the table does not claim falls to fours — every brand but Amex from the first digit,
 * and an Amex number somebody kept typing past fifteen. A number longer than its system allows is
 * still shown grouped rather than refused: the form stores what it is given (see `brandHint`), so
 * the display must not be the thing that rejects a card this table has never heard of.</p>
 */
function sizesFor(brand: CardBrand | '', length: number): readonly number[] {
  const head = brand === 'amex' ? AMEX_GROUPS : [];
  const claimed = head.reduce((total, size) => total + size, 0);
  const rest = Math.ceil(Math.max(0, length - claimed) / GROUP_OF_FOUR);
  return [...head, ...Array.from({ length: rest }, () => GROUP_OF_FOUR)];
}

/** What the record stores. The one function that decides it, so no caller can decide differently. */
export function digitsOnly(value: string): string {
  return digitsOf(value);
}

/**
 * Where the caret belongs after the box is reformatted.
 *
 * <p>The trap this exists for: reformatting an input resets the caret to the end, so typing a digit
 * into the middle of a saved number throws the cursor to the far right and the next keystroke lands
 * somewhere nobody meant. Counting in DIGITS rather than characters is what survives the spaces
 * moving — the caret keeps its place in the number, not its place in the string.</p>
 *
 * <p>Deleting has to be counted the same way, which is why this takes the digit count rather than
 * the raw offset: a backspace over a space removes nothing, and a caret that did not move tells the
 * caller so.</p>
 */
export function caretAfterFormat(formatted: string, digitsBefore: number): number {
  // Where each DIGIT ends, in order. The caret after the n-th digit is the n-th of these, and the
  // spaces simply do not appear in the list — which is the whole trick.
  const ends = [...formatted].flatMap((character, at) => (character === ' ' ? [] : [at + 1]));
  return digitsBefore <= 0 ? 0 : (ends[digitsBefore - 1] ?? formatted.length);
}

/** How many digits stand before `caret` in `value` — the position that survives a reformat. */
export function digitsBefore(value: string, caret: number): number {
  return digitsOf(value.slice(0, caret)).length;
}
