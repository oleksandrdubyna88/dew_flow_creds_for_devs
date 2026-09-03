import { DecoyKind, Random, generateDecoy } from './decoyDigits';
import { ShuffleCode, Slot, isShuffleCode, shuffleLayout } from './shuffle';
import { SHUFFLEABLE_KEYS, ShuffleableKey } from './paymentFields';
import { decoyKindFor } from './paymentWeaving';

/**
 * What a weaving method actually DOES, shown on two samples nobody has to care about.
 *
 * <p>The controls asked somebody to pick one of twelve methods, told them the choice is stored
 * nowhere and that forgetting it loses the value — and showed them nothing whatsoever about what
 * any of the twelve does. That is a decision made blind, about the one thing in this feature that
 * cannot be undone.</p>
 *
 * <h3>Both columns are generated, and that is not a detail</h3>
 *
 * <p>The example never touches the person's own value. Drawing their real number beside the decoy
 * it is woven with, under the method that wove them, would put the answer on the screen next to the
 * question — the exact enumeration hint the whole scheme withholds (see `paymentViewCard`'s note on
 * why the two rebuilt rows are drawn identically).</p>
 *
 * <p>Host-side and pure, by the precedent `brandHint` set: the page is a template string, and
 * nothing computed inside one can be unit tested. The page is handed three lists and paints them.</p>
 */

/**
 * The answer to one `weaveExample` message, or nothing at all.
 *
 * <p>Both arguments are checked rather than trusted: this is where an untrusted message lands, and
 * a field name that is not weavable or a method this build does not have would otherwise reach the
 * shuffler as an index into nothing. The same shape as every other boundary in this feature.</p>
 */
function isShuffleableKey(value: string): value is ShuffleableKey {
  return (SHUFFLEABLE_KEYS as readonly string[]).includes(value);
}

export function exampleAnswer(field: string, code: string, random: Random): Record<string, unknown> | undefined {
  if (!isShuffleableKey(field) || !isShuffleCode(code)) {
    return undefined;
  }
  return { type: 'weaveExampleResult', ...weaveExample(field, code, random) };
}

/** One token of the woven row, and which half it came from — the colour the page paints it. */
export interface ExampleToken {
  readonly text: string;
  readonly side: Slot['side'];
}

export interface WeaveExample {
  /** The field this is an example FOR, so a late answer can be matched to its block. */
  readonly field: string;
  readonly method: ShuffleCode;
  readonly first: readonly string[];
  readonly second: readonly string[];
  readonly woven: readonly ExampleToken[];
}

/**
 * A value of the right SHAPE for each weavable field, used only to seed the sample generator.
 *
 * <p>Shape is the whole point of the example: a CVV is three digits and a card is sixteen, and an
 * example that showed four tokens for both would teach the wrong thing about what the method does
 * to a value of that size. These are the lengths the generator draws against; neither of the two
 * samples shown is ever one of these strings, because `generateDecoy` refuses to return its own
 * input.</p>
 */
const SHAPES: Readonly<Record<ShuffleableKey, string>> = {
  number: '4111111111111111',
  cvv: '000',
  pin: '0000',
  iban: 'NL00BANK0000000000',
  accountNumber: '00000000',
};

/**
 * Two generated samples and the weave of them under `code`.
 *
 * <p>The second sample is drawn against the FIRST rather than against the seed, which is what makes
 * the two columns certainly different: `generateDecoy` guarantees only that it differs from what it
 * was given, so drawing both against the same seed could hand back a matching pair and an example
 * in which the method appears to do nothing.</p>
 */
export function weaveExample(field: ShuffleableKey, code: ShuffleCode, random: Random): WeaveExample {
  const kind: DecoyKind = decoyKindFor(field);
  const first = generateDecoy({ kind, original: SHAPES[field] }, random);
  const second = generateDecoy({ kind, original: first }, random);
  const halves = { first: [...first], second: [...second] };
  return {
    field,
    method: code,
    first: halves.first,
    second: halves.second,
    // The SAME function the real weave reads, so the picture cannot show one thing and the save do
    // another — which is the only way an example like this can quietly become a lie.
    woven: shuffleLayout(halves.first.length, code).map((slot) => ({
      text: halves[slot.side][slot.index],
      side: slot.side,
    })),
  };
}
