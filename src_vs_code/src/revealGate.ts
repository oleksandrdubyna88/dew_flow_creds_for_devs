import { PaymentFieldKey } from './paymentFields';

/**
 * The three things that ask for more than an open vault — a new rung, added on purpose.
 *
 * <p><b>This is an exception to how the whole product works today</b>, and saying so is part of the
 * design. Everywhere else, unlocked means the value copies: no secret asks a second question once the
 * vault is open. These three do, and the help says it plainly so the inconsistency reads as a decision
 * rather than as an oversight somebody forgot to fix.</p>
 *
 * <p>Why these three. A CVV and a PIN are the two values that turn a number somebody saw into a
 * payment somebody made — they are useless alone and decisive together with a number that is on
 * screen beside them. An assembled phrase is a key: seeing it once is having it for ever.</p>
 *
 * <p>What the rung is NOT: protection against somebody who already has the machine and the vault open.
 * It is a pause — against a shoulder, a screen share, a recording, a colleague walking past — and
 * against the person's own hand, which is how most of these get seen. Promising more would be the kind
 * of overclaim this feature has already had to correct twice.</p>
 *
 * <p>Pure: no `vscode`. The dialog belongs to the caller.</p>
 */
export const GATED_FIELDS: readonly PaymentFieldKey[] = ['cvv', 'pin'];

export function needsReveal(field: string): boolean {
  return (GATED_FIELDS as readonly string[]).includes(field);
}

/**
 * What the person is asked before a gated value appears.
 *
 * <p>Names the field and never the value, like every other message in this feature. It says what is
 * about to be on screen rather than asking an abstract "are you sure" — somebody who cannot see what
 * they are agreeing to cannot meaningfully agree to it.</p>
 */
export function revealPrompt(label: string): string {
  return (
    `Show the ${label}? It will be on screen until you close this view, and it is one of the two `
    + 'values that turn a card number into a payment. This is the only kind of field in this vault '
    + 'that asks a second time — everything else is yours the moment the vault is open.'
  );
}

/** The same question for an assembled phrase, which is a key rather than a field. */
export function phraseRevealPrompt(wordCount: number): string {
  return (
    `Assemble and show all ${wordCount} words? Seeing a seed phrase once is having it — this view is `
    + 'the only place the whole phrase exists, and it closes itself shortly after it opens.'
  );
}

/**
 * How long an assembled phrase stays on screen (measure 5.2).
 *
 * <p>Long enough to write down twelve words at a human pace, short enough that a window left open on
 * a desk does not stay open. Not configurable: a setting here is one somebody would raise to "never",
 * which is the state the measure exists to prevent.</p>
 */
export const PHRASE_VISIBLE_MS = 90_000;
