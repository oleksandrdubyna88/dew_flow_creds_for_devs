import { Random } from './decoyDigits';
import { isShuffleCode } from './shuffle';
import { weaveRefusal, weaveSecret } from './wovenSecret';

/**
 * What a save writes for the password, and what the entry then says about it.
 *
 * <p>Pure, and separate from the panel for the reason every decision in this feature is: the form
 * is a place where four states meet — typed or not, marked or not, already woven or not, and a
 * method that may be nonsense off a page message — and a table of four is a test, while four
 * branches inside `toValues` are a comment nobody re-reads.</p>
 */

export interface WovenSave {
  /** What to store. `''` means "keep whatever is there" — the one setter that works that way. */
  readonly value: string;
  /** What the entry says about itself afterwards. */
  readonly woven: boolean;
  /** Why nothing was woven, when something was asked for and refused. */
  readonly refusal: string;
}

/**
 * The four states, decided in one place.
 *
 * <p><b>Typing nothing keeps everything</b>, the flag included: an edit that changes a URL must not
 * quietly unmark a woven password.</p>
 *
 * <p><b>Typing a new password WITHOUT the mark turns the flag off</b>, and that is the "replace"
 * path rather than an "unweave" one. Nothing is unwoven — the old value is overwritten by a new one
 * the person just typed, and the entry stops claiming a property it no longer has.</p>
 *
 * <p><b>A method this build does not know is not a method.</b> It arrives from a page message, so
 * it is checked rather than trusted, and a refusal says so instead of storing something plain under
 * a form that said it would weave.</p>
 */
export function wovenSave(
  typed: string,
  weave: boolean,
  method: string,
  wasWoven: boolean,
  random: Random,
): WovenSave {
  if (typed.length === 0) {
    return { value: '', woven: wasWoven, refusal: '' };
  }
  return weave ? marked(typed, method, random) : { value: typed, woven: false, refusal: '' };
}

/** A password the person asked to weave: woven, or stored as typed with the reason it was not. */
function marked(typed: string, method: string, random: Random): WovenSave {
  const refusal = weaveProblem(typed, method);
  return refusal === ''
    ? { value: weaveSecret(typed, method as never, random), woven: true, refusal: '' }
    : { value: typed, woven: false, refusal };
}

/** Too short to weave, or a method this build does not have. Either way, said rather than silent. */
function weaveProblem(typed: string, method: string): string {
  const tooShort = weaveRefusal(typed);
  if (tooShort !== '') {
    return tooShort;
  }
  return isShuffleCode(method) ? '' : NO_METHOD;
}

const NO_METHOD =
  'No weaving method was chosen, so the password was stored as you typed it. Pick one of the twelve '
  + 'and save again if you want it woven.';

/**
 * What a save is about to do to the password that the form does not appear to promise, or nothing.
 *
 * <p>Two cases, and four reviewers found the first one. A weave the form REFUSED — too short, or a
 * method code this build has no name for — stored the password exactly as typed and said so
 * nowhere: a ticked box, a saved entry, and a secret in the clear that looks woven. The second is
 * the mirror: the box arrives ticked for an entry that is already woven, so unticking it is a
 * deliberate act, and on its own it does nothing at all. Neither is an error; both are a gap
 * between what somebody did and what happened, which is the thing worth a sentence.</p>
 *
 * <p>The same four arguments `wovenSave` takes, in the same order, and beside it: one says what
 * gets STORED, the other says what to SAY about it, and the two must never disagree about which of
 * the four states a save is in.</p>
 */
export function unwovenWarning(
  typed: string,
  weave: boolean,
  method: string,
  wasWoven: boolean,
): string | undefined {
  return weave ? refusedWeave(typed, method) : untickedButWoven(typed, wasWoven);
}

function refusedWeave(typed: string, method: string): string | undefined {
  const problem = typed.length === 0 ? '' : weaveProblem(typed, method);
  return problem === '' ? undefined : `${problem}\n\nSave the password in the clear?`;
}

function untickedButWoven(typed: string, wasWoven: boolean): string | undefined {
  return wasWoven && typed.length === 0 ? STILL_WOVEN : undefined;
}

const STILL_WOVEN =
  'This password is still woven, and unticking the box on its own does not change that: the stored '
  + 'value cannot be unwoven without the method, and nothing here has it.\n\nTo store a password in '
  + 'the clear, type the new one in the password box with the box unticked. Save anyway?';
