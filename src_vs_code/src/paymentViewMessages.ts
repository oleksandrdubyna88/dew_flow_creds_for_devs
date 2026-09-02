import { PaymentFieldKey, PaymentFields, keysForForm } from './paymentFields';
import { PaymentForm } from './paymentForm';
import { MIN_SHUFFLE_TOKENS, ShuffleCode, isShuffleCode } from './shuffle';
import { PhraseLayout, methodOrder } from './phraseLayout';
import { Reassembled, reassemble } from './phraseReassembly';
import { Random } from './decoyDigits';
import { needsReveal } from './revealGate';

/**
 * What the viewer's host answers when the card asks — decided here, where it can be tested.
 *
 * <p>The mechanism is the one-time code's, and it is copied deliberately rather than invented: the
 * host recomputes per request and the page never receives what is stored
 * (`entityViewPanel.ts`, `viewerOptions.ts`). For a payment that matters more than it does for a
 * seed, because the stored thing here is a card number and a CVV.</p>
 *
 * <p><b>The rule this kind adds, restated precisely after a review round said the loose version was
 * false:</b> no stored payment value is ever built into the page's HTML <i>string</i> — the thing
 * that gets concatenated and, the moment anything goes wrong, logged. A value that arrives by
 * message is in the live DOM, which is unavoidable and is not what the rule was about; it is set as
 * a DOM <i>property</i>, so it is not in a serialisation of the page either.</p>
 *
 * <p><b>Every function here is total.</b> A record can be empty, half-written by a build that
 * crashed, or carry a woven value of an odd length that `unshuffleTokens` correctly refuses. None of
 * that may throw out of a message handler, so an unreadable record answers "cannot be read".</p>
 *
 * <p>Pure: no `vscode`.</p>
 */

/** What the card is DRAWN from: names and shapes, never a value. */
export interface PaymentCardView {
  /** Which entry this card is for — stamped on every answer so a reused panel cannot mix them up. */
  readonly entityId: string;
  readonly form: PaymentForm;
  /** The keys this record actually holds, in the form's own order. */
  readonly present: readonly PaymentFieldKey[];
  /** Which of them are stored woven with a decoy. A subset of `present`. */
  readonly woven: readonly PaymentFieldKey[];
  /** The twelve methods, in a different order every time the card opens. */
  readonly methods: readonly ShuffleCode[];
  /** How many words a woven phrase holds — for the question asked before it is assembled. */
  readonly wordCount: number;
}

/** The keys a record holds, restricted to the ones its form owns. Order is the form's. */
export function presentKeysOf(fields: PaymentFields, form: PaymentForm): readonly PaymentFieldKey[] {
  return keysForForm(form).filter((key) => held(fields, key));
}

/** Which keys are stored woven — the record's own list, never a name it does not also hold. */
export function wovenKeysOf(fields: PaymentFields, form: PaymentForm): readonly PaymentFieldKey[] {
  const present = new Set<string>(presentKeysOf(fields, form));
  return (fields.shuffledFields ?? []).filter((name): name is PaymentFieldKey =>
    present.has(name),
  );
}

/**
 * The card, from a record and the entry it belongs to.
 *
 * <p>`random` is a parameter for the reason `methodOrder` takes one: the order must differ per open
 * so that "the third one" never becomes a habit worth forming, and a test must be able to pin it.</p>
 */
export function paymentCardFor(
  entityId: string,
  form: PaymentForm,
  fields: PaymentFields,
  random: Random,
): PaymentCardView {
  return {
    entityId,
    form,
    present: presentKeysOf(fields, form),
    woven: wovenKeysOf(fields, form),
    methods: methodOrder(random),
    wordCount: (fields.mixed ?? []).length / 2,
  };
}

/**
 * What the card is filled with on load: everything it holds, minus what must be asked for.
 *
 * <p>A gated field (a CVV, a PIN) is not here — it arrives only after the question in `revealGate`.
 * A woven field is not here either, and for a different reason: what is stored under that key is the
 * value woven with its decoy, and sending it would put on screen the one thing nobody asked for.</p>
 */
export function plainValues(fields: PaymentFields, form: PaymentForm): Record<string, string> {
  const woven = new Set<string>(wovenKeysOf(fields, form));
  const shown = presentKeysOf(fields, form).filter((key) => !needsReveal(key) && !woven.has(key));
  return Object.fromEntries(shown.flatMap((key) => textOf(fields, key).map((value) => [key, value])));
}

/**
 * One gated value, once the person has been asked.
 *
 * <p>Refuses anything that is not gated — not because a caller would ask wrongly, but because this
 * is the boundary an untrusted message reaches, and a boundary that trusts its input is not one.</p>
 */
export function revealValue(
  fields: PaymentFields,
  form: PaymentForm,
  key: string,
): string | undefined {
  if (!needsReveal(key) || wovenKeysOf(fields, form).includes(key as PaymentFieldKey)) {
    return undefined;
  }
  return textOf(fields, key as PaymentFieldKey)[0];
}

/**
 * What a per-field Copy hands over — and never a woven value.
 *
 * <p>A gated field IS copyable here: the gate is asked by the panel before this is reached, because
 * copying is showing, to the clipboard. A WOVEN field is not, at any point: what is stored under that
 * key is the value shuffled with its decoy, and copying it from a card showing rebuilt digits would
 * hand somebody the one thing on screen they did not ask for. The rebuilt rows have their own button
 * and their own message.</p>
 */
export function copyableValue(
  fields: PaymentFields,
  form: PaymentForm,
  key: string,
): string | undefined {
  if (wovenKeysOf(fields, form).includes(key as PaymentFieldKey)) {
    return undefined;
  }
  return presentKeysOf(fields, form).includes(key as PaymentFieldKey)
    ? textOf(fields, key as PaymentFieldKey)[0]
    : undefined;
}

/**
 * A woven field rebuilt under one method — and NOTHING about whether it worked.
 *
 * <p>No checksum, no "looks real" mark, no ordering that puts a likelier answer first. A wrong method
 * and a right one answer in the same shape, which is the requirement rather than an omission: a
 * validity tick turns twelve methods into one second of enumeration for exactly the person the
 * scheme defends against.</p>
 *
 * <p><b>The layout is not asked for.</b> It is a STORED field of the phrase record (`layout`), so a
 * layout picker would offer twenty-four readings while the record already names which twelve are
 * meaningful — furniture suggesting a choice that has already been made. A woven digit field has no
 * layout at all: its two columns are the value and its decoy.</p>
 */
export function readingFor(
  fields: PaymentFields,
  form: PaymentForm,
  key: string,
  code: string,
): Reassembled | undefined {
  const tokens = wovenTokensOf(fields, form, key, code);
  return tokens === undefined
    ? undefined
    : reassemble(tokens, code as ShuffleCode, layoutFor(fields, key));
}

/**
 * The tokens to rebuild, or nothing — every refusal this reading can meet, in one place.
 *
 * <p>Three of them, and each is a real state rather than defensive furniture: a method the page
 * could have made up, a field the record does not hold woven, and a stored value that is not a whole
 * pair (an odd count is what `unshuffleTokens` refuses, and what an interrupted or foreign write
 * leaves behind).</p>
 */
function wovenTokensOf(
  fields: PaymentFields,
  form: PaymentForm,
  key: string,
  code: string,
): readonly string[] | undefined {
  if (!isShuffleCode(code) || !wovenKeysOf(fields, form).includes(key as PaymentFieldKey)) {
    return undefined;
  }
  const tokens = tokensOf(fields, key as PaymentFieldKey);
  return wholePair(tokens) ? tokens : undefined;
}

/**
 * Whether this is something a method could have produced at all.
 *
 * <p>Every weave writes `2N` tokens with at least two a side, so an odd count or a short one did not
 * come from here — and `unshuffleTokens` refuses it rather than half-reading it, which is right: a
 * silently truncated recovery of something whose original is stored nowhere is the worst answer
 * available. This is where that refusal becomes a sentence instead of an exception.</p>
 */
function wholePair(tokens: readonly string[]): boolean {
  return tokens.length >= 2 * MIN_SHUFFLE_TOKENS && tokens.length % 2 === 0;
}

/** A phrase carries its layout; a woven digit field has none, and its two columns are the pair. */
function layoutFor(fields: PaymentFields, key: string): PhraseLayout {
  return key === 'mixed' ? layoutOf(fields.layout) : 'vertical';
}

/**
 * One of the two rows, by the name the card's button carries.
 *
 * <p>The page says `a` and `b`; which column the arithmetic calls the real one stays on this side.
 * Anything else would write the answer into the DOM of a card whose entire design is not to have
 * one.</p>
 */
export function rowOf(reading: Reassembled, which: string): readonly string[] {
  return which === 'b' ? reading.decoy : reading.real;
}

/**
 * A row as one string, for the clipboard and for nothing else.
 *
 * <p>The one honest exception to "a phrase is never joined": `clipboard.writeText` takes a string and
 * only a string. Digits join with nothing — they were woven as characters — and a phrase with single
 * spaces, which is how every wordlist standard writes one.</p>
 */
export function copyTextFor(reading: Reassembled, which: string, key: string): string {
  return rowOf(reading, which).join(key === 'mixed' ? ' ' : '');
}

/** The stored layout, defaulted the way every other unknown value in this record is: to the safe one. */
export function layoutOf(raw: string | undefined): PhraseLayout {
  return raw === 'horizontal' ? 'horizontal' : 'vertical';
}

/** The tokens a woven value is made of: words for a phrase, characters for everything else. */
function tokensOf(fields: PaymentFields, key: PaymentFieldKey): readonly string[] {
  if (key === 'mixed') {
    return fields.mixed ?? [];
  }
  return [...(textOf(fields, key)[0] ?? '')];
}

/** Whether the record holds this key at all — an empty string is not held. */
function held(fields: PaymentFields, key: PaymentFieldKey): boolean {
  return key === 'mixed' ? (fields.mixed ?? []).length > 0 : textOf(fields, key).length > 0;
}

/**
 * The key's value as a string, or nothing — as a LIST so callers can `flatMap` rather than test.
 *
 * <p>`PaymentFields` holds strings, one boolean and two token arrays; the compiler cannot narrow a
 * dynamic key, and a cast would be a promise to maintain the shape by hand. So the type is checked at
 * run time and anything else is simply not a string value.</p>
 */
function textOf(fields: PaymentFields, key: PaymentFieldKey): readonly string[] {
  const value: unknown = fields[key];
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}
