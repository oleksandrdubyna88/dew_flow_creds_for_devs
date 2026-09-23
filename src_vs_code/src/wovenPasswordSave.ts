import { Random } from './decoyDigits';
import { isShuffleCode } from './shuffle';
import { weaveRefusal, weaveSecret } from './wovenSecret';
import { pairRefusal } from './secondPair';
import { ownHalfRefusal } from './secondSave';

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
  second: SecondHalf = NO_SECOND,
): WovenSave {
  if (typed.length === 0) {
    return { value: '', woven: wasWoven, refusal: '' };
  }
  return weave ? marked(typed, method, random, second) : { value: typed, woven: false, refusal: '' };
}

/**
 * Whose the other half is, and what they typed for it.
 *
 * <p>Carried as a pair rather than as a bare string, because "" has to mean two different things
 * depending on the mode — nothing typed under `own` is a refusal, and nothing typed under `decoy` is
 * the ordinary case. A bare string cannot say which, which is the ambiguity the plan round found in
 * the form and settled with a mode control.</p>
 */
export interface SecondHalf {
  readonly own: boolean;
  readonly typed: string;
}

const NO_SECOND: SecondHalf = { own: false, typed: '' };

/** A password the person asked to weave: woven, or stored as typed with the reason it was not. */
function marked(typed: string, method: string, random: Random, second: SecondHalf): WovenSave {
  const refusal = weaveProblem(typed, method, second);
  return refusal === ''
    ? { value: weaveSecret(typed, method as never, random, second.own ? second.typed : ''), woven: true, refusal: '' }
    : { value: typed, woven: false, refusal };
}

/**
 * Too short to weave, a method this build does not have, or a second half that cannot pair.
 *
 * <p>The order matters and is the plan's: the PAIR is judged before anything is woven, so a refused
 * pair means nothing was woven rather than a password woven with a partner that was then rejected.
 * All three answers come back the same way — stored as typed, with the reason said out loud — which
 * is the rule four reviewers found missing the first time: a refused weave that says nothing leaves
 * a ticked box, a saved entry, and a secret in the clear that looks woven.</p>
 */
function weaveProblem(typed: string, method: string, second: SecondHalf): string {
  return methodProblem(typed, method) || secondProblem(typed, second);
}

/** The two reasons a weave cannot happen that have nothing to do with the other half. */
function methodProblem(typed: string, method: string): string {
  const tooShort = weaveRefusal(typed);
  if (tooShort !== '') {
    return tooShort;
  }
  return isShuffleCode(method) ? '' : NO_METHOD;
}

/**
 * Why this save must NOT happen because of the other half, in the sentence a payment field refuses
 * with — or `''`.
 *
 * <p>Owner decision 4 of `research/PLAN_second_values.md`: a mismatched pair is REFUSED, not
 * confirmed. The payment fields have done that since #52 shipped (`paymentSaveGate.confirmSecondPairs`);
 * the password put the same problem to the person as "Save the password in the clear?", which is a
 * way through a refusal — under a sentence that already ended "Nothing has been saved".</p>
 *
 * <p>Judged only where a weave would otherwise HAPPEN, in `weaveProblem`'s order: a password too short
 * to weave, or a method this build does not know, is not woven at all, so there is no pair to refuse
 * and those stay a question (`unwovenWarning`). Nothing typed is nothing to weave — an edit that did
 * not retype a woven password never reaches here, because the password box is never prefilled.</p>
 */
export function passwordPairRefusal(typed: string, weave: boolean, method: string, second: SecondHalf): string {
  return second.own && weavesNow(typed, weave, method) ? ownHalfRefusal(typed, second.typed, 'password') : '';
}

/** Ticked, typed, and nothing about the password or the method stopping the weave. */
function weavesNow(typed: string, weave: boolean, method: string): boolean {
  return weave && typed.length > 0 && methodProblem(typed, method) === '';
}

/** A decoy has nothing to judge. An own half has to be there, and has to pair. */
function secondProblem(typed: string, second: SecondHalf): string {
  if (!second.own) {
    return '';
  }
  return second.typed.length === 0 ? NO_SECOND_TYPED : pairRefusal(typed, second.typed, 'password');
}

const NO_SECOND_TYPED =
  'You chose to supply the second password yourself and the box is empty. Type it, or choose a '
  + 'decoy and one will be made for you. The password was stored as you typed it, unwoven.';

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
 *
 * <p>It takes no second half, on purpose. A second half that cannot pair is not a question with a
 * "Save anyway" behind it — it is refused, by `passwordPairRefusal`, before this is ever asked. With
 * no parameter for it, this cannot start offering a way through that refusal again.</p>
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
  const problem = typed.length === 0 ? '' : methodProblem(typed, method);
  return problem === '' ? undefined : `${problem}\n\nSave the password in the clear?`;
}

function untickedButWoven(typed: string, wasWoven: boolean): string | undefined {
  return wasWoven && typed.length === 0 ? STILL_WOVEN : undefined;
}

const STILL_WOVEN =
  'This password is still woven, and unticking the box on its own does not change that: the stored '
  + 'value cannot be unwoven without the method, and nothing here has it.\n\nTo store a password in '
  + 'the clear, type the new one in the password box with the box unticked. Save anyway?';
