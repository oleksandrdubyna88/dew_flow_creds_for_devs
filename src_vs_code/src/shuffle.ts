/**
 * Two sequences woven into one, by a method a person remembers and the vault does not.
 *
 * <p><b>What this is for.</b> A seed phrase, a PIN, a CVV — things whose whole value is that
 * nobody reads them over your shoulder. The entry stores one sequence of `2N` tokens made of two
 * sequences of `N`; only the person knows which of the twelve methods put them together, and that
 * choice is stored NOWHERE. `todo/PLAN_payment_instruments.md` and the decisions document beside
 * it carry the reasoning, including an honest measurement of what the scheme is worth: about one
 * bit against a BIP-39 phrase, where a checksum lets an attacker discard wrong de-interleavings
 * instantly, and four to five where there is no checksum to filter with.</p>
 *
 * <p><b>Tokens, not words.</b> Nothing here knows whether it is holding a mnemonic or the digits
 * of a card number: every method is a permutation of POSITIONS. That is what keeps one module
 * where two would otherwise grow — the only code that has to know the difference is the one that
 * generates a decoy, which alone must decide whether it is faking a BIP-39 list or a Luhn-valid
 * card number.</p>
 *
 * <p><b>The inverse is free, and that is deliberate.</b> Both directions are built from one
 * `layout` — a list saying, for each slot of the result, which side and which index it came from.
 * Shuffling reads tokens through it; unshuffling writes them back through it. A method cannot
 * therefore weave one way and unweave another, which is the defect this shape exists to make
 * impossible: it would destroy the value silently, and the original is stored nowhere.</p>
 *
 * <p>Pure — no `vscode`, no storage — so all of it is a unit test.</p>
 */

/** The methods, in their permanent order. The UI shows them SHUFFLED; the code never moves. */
export const SHUFFLE_CODES = [
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
] as const;

export type ShuffleCode = (typeof SHUFFLE_CODES)[number];

export function isShuffleCode(value: unknown): value is ShuffleCode {
  return typeof value === 'string' && (SHUFFLE_CODES as readonly string[]).includes(value);
}

/** Which half a slot of the result came from, and where in that half. */
export interface Slot {
  readonly side: 'first' | 'second';
  readonly index: number;
}

/** The two halves, as they went in. */
export interface Halves {
  readonly first: string[];
  readonly second: string[];
}

/**
 * The three parts `f8` and `f9` swap.
 *
 * <p>The first two are equal and the remainder falls to the last, so `f8`'s exchange is a swap of
 * EQUAL blocks — which is what makes it something a person can do on paper without counting twice.
 * It has to be defined for every length, not only the ones that divide: a phrase may be 7 words,
 * and 14 does not divide by three. 24 → 8/8/8, 14 → 5/5/4, 100 → 34/34/32.</p>
 */
function thirds<T>(all: readonly T[]): [T[], T[], T[]] {
  const size = Math.ceil(all.length / 3);
  return [all.slice(0, size), all.slice(size, 2 * size), all.slice(2 * size)];
}

function interleave<T>(first: readonly T[], second: readonly T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < first.length; i++) {
    out.push(first[i], second[i]);
  }
  return out;
}

function swapAt<T>(all: readonly T[], left: number, right: number): T[] {
  const out = [...all];
  [out[left], out[right]] = [out[right], out[left]];
  return out;
}

/** In pairs, alternating. An odd length simply makes the last group shorter. */
function byTwos<T>(first: readonly T[], second: readonly T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < first.length; i += 2) {
    out.push(...first.slice(i, i + 2), ...second.slice(i, i + 2));
  }
  return out;
}

/**
 * The first two tokens trade places with the last two, as whole PAIRS.
 *
 * <p>Not the same as `f4`, which swaps the tokens inside each pair. `mirror` reverses each pair on
 * the way, so the four land in the same places in a different order — which is the entire
 * difference between `f11` and `f12`.</p>
 */
function swapEnds<T>(all: readonly T[], mirror: boolean): T[] {
  const head = all.slice(0, 2);
  const tail = all.slice(-2);
  return [
    ...(mirror ? [...tail].reverse() : tail),
    ...all.slice(2, -2),
    ...(mirror ? [...head].reverse() : head),
  ];
}

/**
 * A table rather than a switch, for the reason the broker's route table gives: every entry is one
 * expression, and a thirteenth method is a row instead of a branch.
 */
const ARRANGEMENTS: Readonly<Record<ShuffleCode, (first: Slot[], second: Slot[]) => Slot[]>> = {
  f1: (a, b) => interleave(a, b),
  f2: (a, b) => interleave(b, a),
  f3: (a, b) => swapAt(interleave(a, b), 0, 2),
  f4: (a, b) => {
    const one = interleave(a, b);
    return swapAt(swapAt(one, 0, 1), one.length - 2, one.length - 1);
  },
  f5: (a, b) => byTwos(a, b),
  f6: (a, b) => [...a, ...b],
  f7: (a, b) => [...a, ...[...b].reverse()],
  f8: (a, b) => {
    const [one, two, three] = thirds([...a, ...b]);
    return [...two, ...one, ...three];
  },
  f9: (a, b) => {
    const [one, two, three] = thirds([...a, ...b]);
    return [...one, ...three, ...two];
  },
  f10: (a, b) => interleave([...a].reverse(), b),
  f11: (a, b) => swapEnds([...a, ...b], false),
  f12: (a, b) => swapEnds([...a, ...b], true),
};

/**
 * Where every slot of the result comes from — the single source both directions read.
 *
 * <p>Exported because the viewer paints each token by the side it came from, and asking for the
 * layout is how it knows without being handed the halves separately.</p>
 */
export function shuffleLayout(length: number, code: ShuffleCode): Slot[] {
  const side = (name: Slot['side']): Slot[] =>
    Array.from({ length }, (_unused, index) => ({ side: name, index }));
  return ARRANGEMENTS[code](side('first'), side('second'));
}

/**
 * The shortest a sequence can be woven at all: two, because `f3` moves a token to the third slot
 * and `f11` trades whole pairs at both ends.
 *
 * <p>This is the only length rule that belongs HERE. How short a real one may be is a property of
 * what it holds, and this module is deliberately ignorant of that — a CVV is three digits and a
 * seed phrase is at least six words, and neither fact is the shuffler's business. The forms carry
 * their own range and pass it to {@link shuffleRefusal}.</p>
 */
export const MIN_SHUFFLE_TOKENS = 2;

/** How long a sequence a form accepts. */
export interface TokenRange {
  readonly min: number;
  readonly max: number;
}

/** A phrase: the owner's range, and not only crypto seeds — see the plan. */
export const PHRASE_RANGE: TokenRange = { min: 6, max: 50 };

/** Digits: a CVV is three, a PIN four to six, a card up to nineteen, an account longer still. */
export const DIGITS_RANGE: TokenRange = { min: 3, max: 50 };

/** Why a pair cannot be woven, in a sentence a form can print, or nothing when it can. */
export function shuffleRefusal(
  first: readonly string[],
  second: readonly string[],
  range: TokenRange,
): string {
  if (first.length !== second.length) {
    return 'Both sequences must be the same length — a shorter one cannot be woven into a longer.';
  }
  return first.length < range.min || first.length > range.max
    ? `This must be between ${range.min} and ${range.max} entries long.`
    : '';
}

/**
 * Weave two equal-length sequences by `code`.
 *
 * <p>Enforces only what the weaving itself requires — equal halves, at least two each. A form's
 * own limits are checked by {@link shuffleRefusal} before anything reaches here.</p>
 */
export function shuffleTokens(
  first: readonly string[],
  second: readonly string[],
  code: ShuffleCode,
): string[] {
  if (first.length !== second.length) {
    throw new Error('Both sequences must be the same length.');
  }
  if (first.length < MIN_SHUFFLE_TOKENS) {
    throw new Error(`A sequence needs at least ${MIN_SHUFFLE_TOKENS} entries to be woven.`);
  }
  const halves = { first, second };
  return shuffleLayout(first.length, code).map((slot) => halves[slot.side][slot.index]);
}

/**
 * The inverse. Reads the same layout backwards, so it cannot disagree with `shuffleTokens`.
 *
 * <p>An odd-length `mixed` cannot have come from here — every method produces `2N` — and is
 * refused rather than half-read, because a silently truncated recovery of something whose original
 * is stored nowhere is the worst answer available.</p>
 */
export function unshuffleTokens(mixed: readonly string[], code: ShuffleCode): Halves {
  if (mixed.length % 2 !== 0) {
    throw new Error('A woven sequence always has an even length; this one does not.');
  }
  const length = mixed.length / 2;
  const halves: Halves = { first: new Array<string>(length), second: new Array<string>(length) };
  shuffleLayout(length, code).forEach((slot, position) => {
    halves[slot.side][slot.index] = mixed[position];
  });
  return halves;
}
