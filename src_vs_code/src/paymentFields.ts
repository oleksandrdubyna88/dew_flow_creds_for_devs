import { PaymentForm } from './paymentForm';

/**
 * A payment instrument's values — ONE JSON record under one keychain key.
 *
 * <p>The model is `entityFields.ts`, and so is the reason: the record travels as one JSON string
 * under one key, so a field added later is a key in this object rather than another pass through
 * every seam a secret kind touches (storage, bundle, snapshot, merge, share, revision — nine files
 * today). A card has nine fields and bank details have seven; as separate secret kinds that would
 * be sixteen passes through all nine.</p>
 *
 * <p><b>One record even though the fields differ wildly in sensitivity.</b> A CVV and a bank name
 * are not remotely the same thing, and they still live here together, because every seam that
 * carries this — the keychain, the merge, the backup — sees one opaque secret, which is exactly
 * what `entityFields` exists to buy. The difference between a number and a CVV is enforced where it
 * has to be observed: in the form, on the card, in the share redaction (`paymentRedaction.ts`, S1.3)
 * and in the agent filter. Not in the storage layout.</p>
 *
 * <p><b>Free of `vscode`</b> (repository rule 3), which is what makes these edge cases real tests
 * rather than hopeful comments.</p>
 */

/** The card fields. `brand` is STORED rather than derived — a woven number has no first digits to
 *  read, so the payment system becomes a field the person confirms (plan §3a). */
const CARD_KEYS = ['number', 'expiry', 'holder', 'cvv', 'pin', 'address', 'phone', 'country', 'brand'] as const;

/** What a wire transfer asks for. `accountNumber` is deliberately NOT `iban`: a decoy for a plain
 *  `123456789` that carried a country code and a converging mod-97 would be separable at a glance,
 *  so the two are validated and faked by different rules (plan §3a). */
const BANK_KEYS = ['beneficiary', 'bank', 'iban', 'accountNumber', 'swift', 'intermediary', 'bankAddress'] as const;

/** The phrase's own fields. The wordlist is per COLUMN, because two real phrases may come from
 *  different lists or languages (plan §4.4). */
const PHRASE_KEYS = ['wordlistFirst', 'wordlistSecond', 'layout'] as const;

/** Keys holding a list of tokens rather than one value. `mixed` is the woven phrase, kept as an
 *  ARRAY and never as a joined string — plan §5.1 keeps it out of every layer that can hold one. */
const TOKEN_LIST_KEYS = ['mixed', 'shuffledFields'] as const;

const FLAG_KEYS = ['ownWords'] as const;

const STRING_KEYS = [...CARD_KEYS, ...BANK_KEYS, ...PHRASE_KEYS] as const;

export const PAYMENT_FIELD_KEYS = [...STRING_KEYS, ...FLAG_KEYS, ...TOKEN_LIST_KEYS] as const;

export type PaymentFieldKey = (typeof PAYMENT_FIELD_KEYS)[number];

/**
 * The only fields that may be stored woven with a decoy half — plan §3a names exactly these.
 *
 * <p>Accepted from the code review of S1.2. `shuffledFields` was filtered against the full key list,
 * which admitted two nonsense entries: `shuffledFields: ['shuffledFields']` (a method picker drawn
 * over the metadata property itself) and any label or wordlist name. Filtering against the fields
 * that can ACTUALLY be woven is both tighter and the honest rule — §3a is a closed list, not a
 * suggestion, because each of these five has a decoy generator written for its structure and nothing
 * else does.</p>
 *
 * <p>`mixed` is deliberately absent: it is not a field that gets woven, it IS the woven phrase, and
 * its presence is the mark for a phrase record.</p>
 */
export const SHUFFLEABLE_KEYS = ['number', 'cvv', 'pin', 'iban', 'accountNumber'] as const;

export type ShuffleableKey = (typeof SHUFFLEABLE_KEYS)[number];

export interface PaymentFields {
  // Card
  number?: string;
  expiry?: string;
  holder?: string;
  cvv?: string;
  pin?: string;
  address?: string;
  phone?: string;
  country?: string;
  brand?: string;
  // Bank details
  beneficiary?: string;
  bank?: string;
  iban?: string;
  accountNumber?: string;
  swift?: string;
  intermediary?: string;
  bankAddress?: string;
  // Phrase
  wordlistFirst?: string;
  wordlistSecond?: string;
  layout?: string;
  /** The second column holds the person's own words, or a second real key — so no decoy was made. */
  ownWords?: boolean;
  /** The woven tokens, as an array. Never a joined string — see `TOKEN_LIST_KEYS`. */
  mixed?: readonly string[];
  /**
   * Which fields are stored woven with a decoy half.
   *
   * <p>Inside this record rather than on the node, and that is plan §3d rule 1 doing real work: the
   * keychain and `globalState` cannot be one transaction, so a mark kept beside the node could exist
   * without its values or the reverse. Here it is written by the same single call, and the state
   * "payload present, mark absent" does not physically exist.</p>
   *
   * <p>It drives the card: a name here means "draw a method picker for this field". So a name that
   * is not a real field would draw a picker over nothing, which is why `pickPaymentFields` filters
   * it against `PAYMENT_FIELD_KEYS`.</p>
   */
  shuffledFields?: readonly string[];
}

/** How each field is named on screen. */
export const PAYMENT_FIELD_LABELS: Record<PaymentFieldKey, string> = {
  number: 'Card number',
  expiry: 'Expires',
  holder: 'Card holder',
  cvv: 'CVV',
  pin: 'PIN',
  address: 'Billing address',
  phone: 'Phone',
  country: 'Country',
  brand: 'Payment system',
  beneficiary: 'Beneficiary',
  bank: 'Bank',
  iban: 'IBAN',
  accountNumber: 'Account number',
  swift: 'SWIFT / BIC',
  intermediary: 'Intermediary bank',
  bankAddress: 'Bank address',
  wordlistFirst: 'Wordlist, first column',
  wordlistSecond: 'Wordlist, second column',
  layout: 'Layout',
  ownWords: 'Second column is my own words',
  mixed: 'Woven phrase',
  shuffledFields: 'Mixed fields',
};

const FORM_KEYS: Readonly<Record<PaymentForm, readonly PaymentFieldKey[]>> = {
  card: CARD_KEYS,
  bank: BANK_KEYS,
  // `mixed` and `ownWords` belong to the phrase; `shuffledFields` belongs to no form, because it
  // describes the RECORD — a card with a woven PIN needs it, so a form switch must not drop it.
  phrase: [...PHRASE_KEYS, 'ownWords', 'mixed'],
};

/**
 * The keys this form owns — what a switch away from it erases (plan §3e, built in S2.4).
 *
 * <p>Every key belongs to at most ONE form. A key owned by none would survive every switch
 * invisibly and reappear on switching back; a key owned by two would be erased by the wrong one.
 * `paymentFields.test.ts` asserts both, so the next key added cannot quietly be either.</p>
 */
export function keysForForm(form: PaymentForm): readonly PaymentFieldKey[] {
  return FORM_KEYS[form];
}

/** The stored JSON into a record — a string that does not parse is no fields, never a throw. */
export function parsePaymentFields(raw: string | undefined): PaymentFields {
  if (raw === undefined || raw.length === 0) {
    return {};
  }
  try {
    return pickPaymentFields(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

/**
 * Only the known keys, only values of the right type, nothing coerced.
 *
 * <p>A record can arrive from an import, a sync, or a share written by another build. Coercing
 * `4111` into `"4111"` would INVENT a card number; dropping it loses a field that was already
 * unusable. So every value is dropped unless it is already what it claims to be.</p>
 */
export function pickPaymentFields(value: unknown): PaymentFields {
  const source = isRecord(value) ? value : {};
  const out: Record<string, unknown> = {};
  takeStrings(source, out);
  takeFlags(source, out);
  takeTokenLists(source, out);
  return out as PaymentFields;
}

function takeStrings(source: Record<string, unknown>, out: Record<string, unknown>): void {
  for (const key of STRING_KEYS) {
    const clean = cleanString(source[key]);
    if (clean !== undefined) {
      out[key] = clean;
    }
  }
}

function takeFlags(source: Record<string, unknown>, out: Record<string, unknown>): void {
  for (const key of FLAG_KEYS) {
    if (typeof source[key] === 'boolean') {
      out[key] = source[key];
    }
  }
}

function takeTokenLists(source: Record<string, unknown>, out: Record<string, unknown>): void {
  for (const key of TOKEN_LIST_KEYS) {
    const tokens = cleanTokens(source[key], key === 'shuffledFields');
    if (tokens.length > 0) {
      out[key] = tokens;
    }
  }
}

/** Member by member, so one bad token does not discard a whole woven phrase. */
function cleanTokens(value: unknown, fieldNamesOnly: boolean): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const cleaned = value.flatMap((item) => {
    const clean = cleanString(item);
    return clean === undefined ? [] : [clean];
  });
  return fieldNamesOnly ? cleaned.filter(isShuffleableKey) : cleaned;
}

function isShuffleableKey(value: string): value is ShuffleableKey {
  return (SHUFFLEABLE_KEYS as readonly string[]).includes(value);
}

// Nothing is copied by iterating the SOURCE — the loops walk the known key lists instead — so an
// inherited or injected property cannot become a field, whatever the incoming JSON says.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * The JSON to store — `undefined` when there is nothing to store, so an empty record DELETES.
 *
 * <p><b>"Nothing" means no VALUE, not no key.</b> Accepted from the code review of S1.2: a record left
 * holding only `shuffledFields` — a card whose fields were all cleared, or one switched to another
 * form — is not an empty object, so it used to serialize and leave a keychain entry behind holding
 * nothing but the names of fields that no longer exist. Nobody would ever look for it again, which is
 * the same species of orphan the write-order invariant (S1.4) exists to avoid, arriving by a much
 * duller route.</p>
 *
 * <p>So the emptiness test reads the value fields only. `shuffledFields` describes a record; it cannot
 * BE one.</p>
 */
export function serializePaymentFields(fields: PaymentFields | undefined): string | undefined {
  const picked = pickPaymentFields(fields);
  return hasAnyValue(picked) ? JSON.stringify(picked) : undefined;
}

const META_KEYS: readonly string[] = ['shuffledFields'];

function hasAnyValue(picked: PaymentFields): boolean {
  return Object.keys(picked).some((key) => !META_KEYS.includes(key));
}

/**
 * The record as it should be after a switch to `form` — every key the OLD form owned is gone, and
 * `shuffledFields` keeps only names that still exist (plan §3e, applied by S2.4).
 *
 * <p>Accepted from the code review of S1.2, which found the gap by walking a real sequence: a card
 * with `shuffledFields: ['number', 'cvv']` switched to bank details kept both names, because
 * `shuffledFields` belongs to no form and so no switch cleared it. The card's viewer would then draw
 * a method picker over two fields the bank form does not have. Filtering it here rather than in the
 * switch means the rule cannot be forgotten by the story that performs the switch.</p>
 */
export function clearForForm(fields: PaymentFields, form: PaymentForm): PaymentFields {
  const keep = new Set<string>(keysForForm(form));
  const kept = Object.entries(pickPaymentFields(fields)).filter(([key]) => keep.has(key));
  const survivors = (fields.shuffledFields ?? []).filter((name) => keep.has(name));
  return pickPaymentFields({ ...Object.fromEntries(kept), shuffledFields: survivors });
}
