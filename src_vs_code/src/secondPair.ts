import { classesUsed } from './decoyDigits';

/**
 * Whether a second value the person TYPED can be woven with the first — and why not, in a sentence.
 *
 * <p>Everywhere a value can be woven, the second half has until now been GENERATED, and the
 * generator guarantees things a typed value cannot: a card decoy passes Luhn and keeps the original's
 * BIN, an IBAN decoy converges under mod-97 and keeps its country, a password decoy uses the
 * original's own character classes, a phrase decoy matches the real phrase's checksum STATE. Each of
 * those exists so that neither half can be told from the other by looking. A pair the person types
 * has none of them by construction, so the save asks this module first.</p>
 *
 * <h3>What is refused, and what is deliberately not</h3>
 *
 * <p>Refused: halves of different LENGTH (weaving pairs token by token and cannot do otherwise), two
 * halves that are the SAME (woven together they would hide nothing — every method would show one
 * value twice), and halves drawing on different character CLASSES (the owner's decision, 2026-09-15:
 * refuse rather than confirm).</p>
 *
 * <p><b>Not</b> refused: a checksum. A second card number that does not add up is the person's
 * business and is confirmed elsewhere — people hold instruments this build has never heard of, which
 * is why `paymentValidation` hints at a bad checksum rather than blocking it, and only escalates to a
 * confirmation when the field is about to be woven and the original will be gone.</p>
 *
 * <h3>The class rule is uniform, and that is not the same as being the password's rule everywhere</h3>
 *
 * <p>A review round worried that a password-shaped class check would refuse every card. It cannot:
 * the comparison is between the two TYPED values, not against a shape this module carries, so for two
 * card numbers — digits on both sides — the sets are equal and nothing is refused. It bites exactly
 * where it should, on a pair where one half reaches for a class the other never uses.</p>
 *
 * <p>Pure: no `vscode`, no randomness, no I/O. Every claim above is a test.</p>
 */

/** Nothing to judge: the person left the second box empty, which the SAVE decides about, not this. */
const NO_SECOND = '';

/**
 * Why this pair cannot be woven, in a sentence a form can print — or `''` when it can.
 *
 * <p>`label` is what the field is called on screen (`PAYMENT_FIELD_LABELS`, or "password"), because a
 * refusal naming a record's key is a refusal about a field nobody has ever seen.</p>
 */
export function pairRefusal(first: string, second: string, label: string): string {
  if (second === NO_SECOND) {
    return '';
  }
  return lengthRefusal(first, second, label)
    || sameRefusal(first, second, label)
    || classRefusal(first, second, label);
}

/**
 * Counted in CODE POINTS, never `.length`.
 *
 * <p>The same trap `weaveRefusal` already carries a note about: one emoji is two UTF-16 units and one
 * character, so `.length` lets a pair through that `shuffleTokens` then throws on, far from here and
 * with a message about decoys that means nothing to whoever typed it. The number in the sentence is
 * the number a person can count on screen.</p>
 */
function lengthRefusal(first: string, second: string, label: string): string {
  const mine = [...first].length;
  const theirs = [...second].length;
  return mine === theirs
    ? ''
    : `The second ${label} has ${theirs} character${theirs === 1 ? '' : 's'} and the ${label} has `
      + `${mine}. Both must be the same length — weaving pairs them one character at a time, so a `
      + 'shorter one cannot be woven into a longer. Nothing has been saved.';
}

/** Two identical halves are one value written twice, and hide nothing under any method. */
function sameRefusal(first: string, second: string, label: string): string {
  return first === second
    ? `The second ${label} is the same as the ${label}. Woven together they would hide nothing — `
      + 'every method would show you the same value twice. Type a different second value, or leave '
      + 'the box empty to have a decoy made for you. Nothing has been saved.'
    : '';
}

/**
 * Halves that draw on different character classes are separable by inspection.
 *
 * <p>This is the property a generated decoy is built to have and the reason it is built that way: if
 * one half uses symbols and the other never does, then under the right method one row is all one kind
 * and the other is not — and no other method produces that. The method stops being the secret.</p>
 */
function classRefusal(first: string, second: string, label: string): string {
  const mine = classesUsed(first);
  const theirs = classesUsed(second);
  return sameClasses(mine, theirs)
    ? ''
    : `The ${label} and the second ${label} use different kinds of character. Anybody looking at the `
      + 'stored value could then tell the two apart without knowing the method: under the right one, '
      + 'one row is all of a kind the other never uses. Make both halves draw on the same kinds of '
      + 'character — letters, digits, symbols — or leave the box empty to have a decoy made. Nothing '
      + 'has been saved.';
}

function sameClasses(mine: ReadonlySet<string>, theirs: ReadonlySet<string>): boolean {
  return mine.size === theirs.size && [...mine].every((one) => theirs.has(one));
}
