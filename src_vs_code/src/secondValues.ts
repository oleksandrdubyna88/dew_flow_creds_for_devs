import { SHUFFLEABLE_KEYS } from './paymentFields';

/**
 * The second values an entry holds for fields that are NOT woven — `password2`, `cvv2` and the rest.
 *
 * <p>One secret kind rather than six, for the reason `entityFields.ts` states about its own record:
 * it travels as one JSON string under one key, so a seventh second value one day is a key in this
 * object rather than another pass through every seam a secret kind touches. That pass is not cheap —
 * counting the files one existing kind (`notes`) reaches gives fifteen — and it is paid once here.</p>
 *
 * <h3>What is NOT in this record, and why it is the sharpest rule in the feature</h3>
 *
 * <p>A second value that was WOVEN is not here. When somebody ticks the box and types their own
 * second value, that value becomes one half of the woven string and is stored nowhere else. Writing
 * it here as well would hand any reader of the vault the half to subtract from the pair, and the
 * twelve methods would stop being twelve — they would stop being anything. So this record holds the
 * second values of fields stored in the CLEAR, and the save is what enforces that
 * (`secondRecordFor` drops every value a weave consumed).</p>
 *
 * <p>Pure: no `vscode`, no I/O.</p>
 */

/** Every field that can be woven, and therefore can carry a second value of its own. */
export const WEAVE_POINTS = [...SHUFFLEABLE_KEYS, 'password'] as const satisfies readonly string[];
export type WeavePoint = (typeof WEAVE_POINTS)[number];

/**
 * The record's keys, DERIVED from the weave points rather than listed beside them.
 *
 * <p>A hand-written second list is a list that drifts — which is exactly how `SECRET_KINDS` and
 * `ProfileSnapshot` came to disagree once, and that disagreement DELETED payment records. Here the
 * compiler derives one from the other, so a seventh weave point cannot arrive without its key.</p>
 */
export type SecondKey = `${WeavePoint}2`;
export const SECOND_KEYS: readonly SecondKey[] = WEAVE_POINTS.map((point) => `${point}2` as SecondKey);

export function secondKeyOf(point: WeavePoint): SecondKey {
  return `${point}2`;
}

/**
 * The way back, as a total table rather than by trimming a character.
 *
 * <p>`key.slice(0, -1)` would work until the day a weave point ends in a digit, and would then be
 * wrong silently. A `Record` over the key union is checked by the compiler: a key with no field, or
 * a field with no key, does not build.</p>
 */
const FIRST_OF: Readonly<Record<SecondKey, WeavePoint>> = {
  number2: 'number',
  cvv2: 'cvv',
  pin2: 'pin',
  iban2: 'iban',
  accountNumber2: 'accountNumber',
  password2: 'password',
};

export function firstKeyOf(key: SecondKey): WeavePoint {
  return FIRST_OF[key];
}

export function isSecondKey(value: string): value is SecondKey {
  return (SECOND_KEYS as readonly string[]).includes(value);
}

/** What a person calls each one. Never a record key, which is a name nobody has seen. */
export const SECOND_LABELS: Readonly<Record<SecondKey, string>> = {
  number2: 'Second card number',
  cvv2: 'Second CVV',
  pin2: 'Second PIN',
  iban2: 'Second IBAN',
  accountNumber2: 'Second account number',
  password2: 'Second password',
};

/** An entry's second values. Partial: an entry holds only the ones that were typed. */
export type SecondValues = Partial<Readonly<Record<SecondKey, string>>>;

/** The stored JSON, or anything else, into a record — a string that does not parse is no values. */
export function parseSecondValues(raw: string | undefined): SecondValues {
  if (raw === undefined || raw.length === 0) {
    return {};
  }
  try {
    return pickSecondValues(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

/**
 * Only the known keys, only non-empty strings.
 *
 * <p>Walks the KEY LIST rather than the incoming object, which is what keeps a key from a newer
 * build — or a crafted one — out of the record, and makes a prototype-polluting name impossible.
 * The same shape `pickPaymentFields` and `pickFields` use, for the same reasons.</p>
 */
export function pickSecondValues(value: unknown): SecondValues {
  const source = isRecord(value) ? value : {};
  const out: Record<string, string> = {};
  for (const key of SECOND_KEYS) {
    const clean = cleanString(source[key]);
    if (clean !== undefined) {
      out[key] = clean;
    }
  }
  return out as SecondValues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * A blank box is nothing; a value with spaces in it is that value, kept exactly as typed.
 *
 * <p>From a review round, and it mattered: this used to store what it had trimmed, so a second
 * password typed as `" pass "` came back `"pass"` — while the WOVEN path weaves the value exactly as
 * typed. The same keystrokes would then make two different secrets depending on a box the person
 * ticked elsewhere, and the altered one would simply not work wherever it was used. Whitespace
 * decides only whether there is a value at all.</p>
 */
function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** The JSON to store — `undefined` when there is nothing, so an empty record DELETES the key. */
export function serializeSecondValues(values: SecondValues | undefined): string | undefined {
  const picked = pickSecondValues(values);
  return Object.keys(picked).length === 0 ? undefined : JSON.stringify(picked);
}

/**
 * Only the keys `keep` names survive — this record's `clearForForm`.
 *
 * <p>A card retyped as bank details must not go on holding a second CVV: the field it belongs to is
 * gone, so the value describes nothing and is one more secret sitting in a vault for no reason.</p>
 */
export function keepSecondKeys(values: SecondValues, keep: readonly SecondKey[]): SecondValues {
  const allowed = new Set<string>(keep);
  return Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key))) as SecondValues;
}
