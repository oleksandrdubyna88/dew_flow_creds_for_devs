import { MIN_SHUFFLE_TOKENS, ShuffleCode, shuffleTokens, unshuffleTokens } from './shuffle';
import { Random, generateDecoy } from './decoyDigits';

/**
 * Weaving ONE secret string with a decoy — the password's half of what `paymentWeaving` does for a
 * record's fields.
 *
 * <p>Its own module rather than a branch inside that one: `paymentWeaving` takes a `PaymentFields`
 * and answers with the keys to replace, which is the wrong shape for a value that is not part of a
 * record. What the two share is `shuffleTokens` and `generateDecoy`, and they share them directly.</p>
 *
 * <h3>What weaving a password does NOT do</h3>
 *
 * <p>It is not encryption and must never be described as any. It protects against somebody READING
 * an open vault — a shoulder, a screen share, a backup file on a laptop — and it does nothing at all
 * against somebody who can try every possibility. The method is the only secret, it is stored
 * nowhere, and a forgotten one is a lost password with no recovery by us, from a backup, or from
 * the sync.</p>
 *
 * <p>Pure: the randomness is a parameter and there is no `vscode` here, so the round trip below is
 * a test rather than a hope.</p>
 */

/** Why a password cannot be woven, in a sentence a form can print, or `''` when it can. */
export function weaveRefusal(value: string): string {
  return value.length < MIN_SHUFFLE_TOKENS
    ? `A password of ${value.length} character${value.length === 1 ? '' : 's'} cannot be woven — `
      + `weaving needs at least ${MIN_SHUFFLE_TOKENS}, because the methods move characters between them.`
    : '';
}

/**
 * The value as it will be STORED: the password and a decoy of its own shape, interleaved.
 *
 * <p>The decoy is generated here, once, and is never kept apart from the result — it lives inside
 * the woven string, which is what makes the pair recoverable from the stored value alone. Nothing
 * else about it is written down anywhere.</p>
 */
export function weaveSecret(value: string, code: ShuffleCode, random: Random): string {
  if (weaveRefusal(value) !== '') {
    throw new Error(weaveRefusal(value));
  }
  const decoy = generateDecoy({ kind: 'password', original: value }, random);
  return shuffleTokens([...value], [...decoy], code).join('');
}

/** The two readings a method produces, in the order the arithmetic gives them. */
export interface SecretReading {
  readonly first: string;
  readonly second: string;
}

/**
 * A stored woven secret, read back under one method — or nothing, when it cannot be.
 *
 * <p>Answers `undefined` rather than throwing on a value that cannot have come from here (an odd
 * length; every method produces `2N`). A message handler must not carry a throw, and a record can
 * be half-written by a build that crashed.</p>
 *
 * <p><b>It says nothing about which reading is right.</b> A wrong method answers in exactly the same
 * shape as a right one — same lengths, same order, no marker. Anything that could tell them apart
 * would do the guessing for whoever is reading over the person's shoulder, which is the whole thing
 * this feature is for.</p>
 */
export function unweaveSecret(stored: string, code: ShuffleCode): SecretReading | undefined {
  const tokens = [...stored];
  if (tokens.length % 2 !== 0 || tokens.length < MIN_SHUFFLE_TOKENS * 2) {
    return undefined;
  }
  const halves = unshuffleTokens(tokens, code);
  return { first: halves.first.join(''), second: halves.second.join('') };
}
