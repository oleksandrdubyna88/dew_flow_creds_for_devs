import { MIN_SHUFFLE_TOKENS, ShuffleCode, shuffleTokens } from './shuffle';
import { PaymentFields, SHUFFLEABLE_KEYS, ShuffleableKey, pickPaymentFields } from './paymentFields';
import { DecoyKind, Random, generateDecoy } from './decoyDigits';

/**
 * Where the marks become woven values — and the code is stored NOWHERE.
 *
 * <p>That last part is the invariant the whole feature rests on, and it is what makes every other
 * rule matter. Nothing can unweave a field except the person, from memory: so the value has to be
 * right the first time (`paymentValidation.ts` checks it before the save), the decoy has to be
 * indistinguishable from the real half (`decoyDigits.ts` makes it), and the entry must never be
 * opened in the edit form again (`mixedFieldGuard.ts` refuses it).</p>
 *
 * <p><b>What this buys, stated plainly, because the interface says it too:</b> against somebody who
 * can ENUMERATE, a CVV is a thousand values and weaving costs them nothing. It works against somebody
 * READING an already-open vault — a shoulder, a screen share, a backup file opened on a laptop.
 * Promising more than that would be a lie, and a lie about protection is worse than none.</p>
 *
 * <p>Pure: no `vscode`, and the randomness is a parameter.</p>
 */

/** Which kind of decoy suits each weavable field — the mapping that keeps a decoy plausible. */
const DECOY_KINDS: Readonly<Record<ShuffleableKey, DecoyKind>> = {
  number: 'card',
  iban: 'iban',
  accountNumber: 'account',
  cvv: 'digits',
  pin: 'digits',
};

export function decoyKindFor(field: ShuffleableKey): DecoyKind {
  return DECOY_KINDS[field];
}

/**
 * The record as it will be STORED: marked fields woven with a decoy, everything else as typed.
 *
 * <p>`codes` is per field — the form offers one method for all of them by default and lets whoever
 * wants to give each its own. The argument against per-field codes stays on the record: four codes on
 * one card is four chances to forget, and a forgotten code is lost data. It is answered by the
 * interface rather than by removing the choice — the careful person remembers one, the paranoid four,
 * and neither pays for the other's decision.</p>
 */
export function weavePaymentFields(
  fields: PaymentFields,
  marked: readonly string[],
  codes: Readonly<Record<string, ShuffleCode>>,
  random: Random,
  seconds: Readonly<Record<string, string>> = {},
): PaymentFields {
  const already = new Set(fields.shuffledFields ?? []);
  const woven = SHUFFLEABLE_KEYS.filter((key) => marked.includes(key) && !already.has(key)).flatMap((key) =>
    weaveOne(fields, key, codes[key], random, seconds[key] ?? ''),
  );
  if (woven.length === 0) {
    return fields;
  }
  return pickPaymentFields({
    ...fields,
    ...Object.fromEntries(woven.map(({ key, value }) => [key, value])),
    shuffledFields: [...already, ...woven.map(({ key }) => key)],
    ...ownMark(fields, woven),
  });
}

/**
 * Which fields were woven with the person's OWN second value rather than a made-up one.
 *
 * <p>Its own function so the one above stays inside the complexity ceiling, and because the absent
 * case has to be an absent KEY rather than an empty array: a record carrying `ownSecond: []` would
 * serialise a mark that describes nothing, and `hasAnyValue` counts it as meta either way.</p>
 */
function ownMark(
  fields: PaymentFields,
  woven: ReadonlyArray<{ key: ShuffleableKey; own: boolean }>,
): { ownSecond?: readonly string[] } {
  const own = [...(fields.ownSecond ?? []), ...woven.filter((one) => one.own).map(({ key }) => key)];
  return own.length === 0 ? {} : { ownSecond: own };
}

/**
 * One field, or nothing at all.
 *
 * <p>Nothing when there is no value (a mark on an empty box would claim a woven field the record does
 * not hold, and the entry would then refuse to be edited for a reason that is not true), and nothing
 * when the value is too short to weave — `shuffleTokens` needs two tokens a side, and storing a
 * one-digit "woven" value would be a claim the viewer could not honour.</p>
 */
function weaveOne(
  fields: PaymentFields,
  key: ShuffleableKey,
  code: ShuffleCode | undefined,
  random: Random,
  typed: string,
): ReadonlyArray<{ key: ShuffleableKey; own: boolean; value: string }> {
  const original = fields[key] ?? '';
  if (code === undefined || tooShort(original)) {
    return [];
  }
  const partner = partnerFor(key, original, random, typed);
  return [{ key, own: typed !== '', value: shuffleTokens([...original], [...partner], code).join('') }];
}

/**
 * The other half: the person's OWN second value when they typed one, a generated decoy when not.
 *
 * <p>The pair was judged by `pairRefusal` at the save gate, before anything here ran, and that order
 * is the point: by the time a value reaches this function the original is about to stop existing, so
 * this is far too late to be the first place a mismatched pair is met.</p>
 */
function partnerFor(key: ShuffleableKey, original: string, random: Random, typed: string): string {
  return typed === '' ? generateDecoy({ kind: decoyKindFor(key), original }, random) : typed;
}

/**
 * Too short to weave at all: `shuffleTokens` needs two tokens a side.
 *
 * <p>Counted in CODE POINTS, because that is what `weaveOne` hands the weave. It asked `.length`
 * until the automated reviewer on the pull request pointed out what that guards: one emoji is TWO by
 * `.length` and ONE token to the weave, so the guard let it through and `shuffleTokens` threw for
 * needing two — an uncaught throw on save, from a field holding a single character. The same trap
 * `lengthRefusal` carries a note about one module away, and the rule is the same in both places:
 * count what the weave counts.</p>
 */
function tooShort(original: string): boolean {
  return [...original].length < MIN_SHUFFLE_TOKENS;
}
