/**
 * Which payment system a card number belongs to — from its opening digits, and nothing else.
 *
 * <p>Pure: no network, no `vscode`, no lookup service. A BIN database would be more precise and would
 * also mean sending the first digits of somebody's card somewhere, which is the opposite of what this
 * extension is for. The prefix ranges below are public, stable, and enough to put the right mark next
 * to a number.</p>
 *
 * <p><b>A table, not a switch</b> — the pattern `shuffle.ts` states for its twelve arrangements: a
 * tenth system is a row. A switch would be a tenth branch, and branches are where a list stops being
 * checkable against itself.</p>
 *
 * <p>Two things this deliberately does not do:</p>
 *
 * <ul>
 *   <li><b>It does not guess.</b> A prefix belonging to no listed system answers `''`. A card labelled
 *       with the wrong network is worse than one labelled with none — the person reads the label,
 *       believes it, and the mistake is invisible because the digits are masked.</li>
 *   <li><b>It does not refuse.</b> `luhn` is separate and is a typo HINT: a number the checksum
 *       rejects still saves (parent plan §2.2). People hold cards this table has never heard of, and a
 *       vault that will not store one is a vault they keep a photo of instead.</li>
 * </ul>
 */
export const CARD_BRANDS = [
  'visa',
  'mastercard',
  'amex',
  'discover',
  'jcb',
  'diners',
  'unionpay',
  'mir',
  'maestro',
] as const;

export type CardBrand = (typeof CARD_BRANDS)[number];

/**
 * One system: the digit ranges that open its numbers, and the lengths it issues.
 *
 * <p>Ranges rather than string prefixes because that is how the networks publish them (Mastercard's
 * second block is 2221–2720, JCB is 3528–3589), and because a range compares in one line where a list
 * of ninety-two prefixes does not.</p>
 */
interface BrandRule {
  readonly brand: CardBrand;
  /** `[from, to]` over the first `digits` digits, inclusive. */
  readonly ranges: ReadonlyArray<readonly [number, number, number]>;
  readonly lengths: readonly number[];
}

const RULES: readonly BrandRule[] = [
  { brand: 'visa', ranges: [[4, 4, 1]], lengths: [13, 16, 19] },
  {
    brand: 'mastercard',
    // The 2017 range sits beside the classic one; Mir's 2200–2204 is carved out of its front, so Mir
    // is listed FIRST below and wins — the one place in this table where order carries meaning.
    ranges: [
      [51, 55, 2],
      [2221, 2720, 4],
    ],
    lengths: [16],
  },
  { brand: 'amex', ranges: [[34, 34, 2], [37, 37, 2]], lengths: [15] },
  {
    brand: 'discover',
    ranges: [
      [6011, 6011, 4],
      [644, 649, 3],
      [65, 65, 2],
    ],
    lengths: [16, 19],
  },
  { brand: 'jcb', ranges: [[3528, 3589, 4]], lengths: [16, 17, 18, 19] },
  { brand: 'diners', ranges: [[300, 305, 3], [36, 36, 2], [38, 39, 2]], lengths: [14, 16, 19] },
  { brand: 'unionpay', ranges: [[62, 62, 2], [81, 81, 2]], lengths: [16, 17, 18, 19] },
  { brand: 'mir', ranges: [[2200, 2204, 4]], lengths: [16, 19] },
  { brand: 'maestro', ranges: [[50, 50, 2], [56, 58, 2], [6, 6, 1]], lengths: [12, 13, 14, 15, 16, 17, 18, 19] },
];

/**
 * Mir before Mastercard, and Discover/UnionPay before Maestro.
 *
 * <p>Two ranges genuinely overlap in the published allocations — Mir's 2200–2204 sits inside
 * Mastercard's 2221–2720 neighbourhood, and Maestro's bare `6` covers Discover's 6011 and UnionPay's
 * 62. The narrower rule has to be asked first, and stating that here is cheaper than a comment on each
 * row explaining why it is where it is.</p>
 */
const ORDERED: readonly BrandRule[] = [
  ...RULES.filter((rule) => rule.brand === 'mir'),
  ...RULES.filter((rule) => rule.brand !== 'mir' && rule.brand !== 'maestro'),
  ...RULES.filter((rule) => rule.brand === 'maestro'),
];

/**
 * Just the digits — people type cards with spaces and dashes, and so do their banks' statements.
 *
 * <p>Exported for `cardNumberFormat`, which needs the same answer and must not have a second one:
 * what the record stores and what the checksum reads have to be the same string.</p>
 */
export function digitsOf(number: string): string {
  return number.replace(/\D/g, '');
}

/**
 * The system this number belongs to, or `''` when no listed one claims it.
 *
 * <p>A number still being typed is answered as soon as its prefix decides — the glyph should appear
 * while the person types, not after the last digit. Length is only checked once there is a full-length
 * candidate, which is what stops a 16-digit `37…` from reading as a (15-digit) Amex.</p>
 */
export function brandOf(number: string): CardBrand | '' {
  const digits = digitsOf(number);
  if (digits.length === 0) {
    return '';
  }
  const match = ORDERED.find((rule) => opens(rule, digits) && fits(rule, digits));
  return match?.brand ?? '';
}

/** Does this number start inside one of the rule's ranges? */
function opens(rule: BrandRule, digits: string): boolean {
  return rule.ranges.some(([from, to, width]) => {
    const head = Number(digits.slice(0, width));
    return digits.length >= width && head >= from && head <= to;
  });
}

/**
 * An exact issued length, or a number still on its way to one.
 *
 * <p>"Still being typed" is anything BELOW the longest length this system issues — not below the
 * shortest, which is what this said at first and which had a visible bug in it. Visa issues 13, 16 and
 * 19: at 13 digits the mark appeared, at 14 it VANISHED (14 is not a listed length and not below 13),
 * and at 16 it came back. The same flicker hit Discover and Mir at 17–18, and Diners at 15, 17 and 18.
 * Found by a code review, not by a test — the tests covered 1 digit, 5 digits and complete numbers,
 * and never an intermediate length between two valid ones.</p>
 */
function fits(rule: BrandRule, digits: string): boolean {
  return rule.lengths.includes(digits.length) || digits.length < Math.max(...rule.lengths);
}

/**
 * The Luhn checksum — a HINT, never a gate.
 *
 * <p>It catches the single mistyped digit and the transposed pair, which is most of what goes wrong
 * when somebody copies a card by hand. It says nothing about whether a card exists, and a number that
 * fails it is still stored: see the module header.</p>
 */
export function luhn(number: string): boolean {
  const digits = digitsOf(number);
  if (digits.length === 0) {
    return false;
  }
  const sum = [...digits].reverse().reduce((total, digit, index) => total + weigh(Number(digit), index), 0);
  return sum % 10 === 0;
}

/** Every second digit from the right is doubled, and a result over nine has its digits added. */
function weigh(digit: number, index: number): number {
  if (index % 2 === 0) {
    return digit;
  }
  const doubled = digit * 2;
  return doubled > 9 ? doubled - 9 : doubled;
}

/**
 * The Bank Identification Number — the first six digits, which say who issued the card.
 *
 * <p>Exported because a decoy card has to preserve it (S3.1): a decoy whose opening digits differ from
 * the real one announces itself as the decoy, which is the one thing a decoy must not do.</p>
 */
export function binOf(number: string): string {
  return digitsOf(number).slice(0, 6);
}
