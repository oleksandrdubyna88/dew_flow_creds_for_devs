import { PaymentFieldKey, parsePaymentFields, serializePaymentFields } from './paymentFields';

/**
 * What a payment record loses on its way to somebody else's vault — and nowhere else.
 *
 * <p>One function, in one place, because the parent plan's §2.5 exists for a defect of exactly that
 * shape: the promise "the CVV and the PIN do not leave" stood in three places in the plan and was
 * covered by ONE test, against the agent filter. Six directions carry this record and they do NOT
 * share an answer:</p>
 *
 * <table>
 *   <tr><th>direction</th><th>CVV and PIN</th><th>why</th></tr>
 *   <tr><td>Local backup</td><td>CARRY</td><td>it is your own encrypted vault; scrubbing them loses them at restore</td></tr>
 *   <tr><td>Sync</td><td>CARRY</td><td>the same, between your own machines</td></tr>
 *   <tr><td>Revision history</td><td>CARRY</td><td>or a rollback returns the card without half its fields</td></tr>
 *   <tr><td>External export</td><td>CARRY</td><td>owner's decision: an export is a full copy, and it already carries private keys</td></tr>
 *   <tr><td><b>Share to a person</b></td><td><b>STRIP</b></td><td>the value leaves your vault and lives on in theirs</td></tr>
 *   <tr><td>Agent surface</td><td>absent entirely</td><td>no payment field reaches an agent — `mcpEntries.ts` is a hand-written allowlist and payment is not in it</td></tr>
 * </table>
 *
 * <p><b>The asymmetry between share and export is a decision, recorded here so that in a year it does
 * not read as a bug.</b> A shared copy LIVES ON in someone else's vault and travels to their machines,
 * without a further choice by anyone. An export is a file a person made once, deliberately, with a
 * warning — and `externalBundle.ts` already carries passwords, private SSH keys and VPN configs, so a
 * special case for payment fields would be an inconsistency rather than a defence.</p>
 *
 * <p>Free of `vscode` (repository rule 3).</p>
 */

/**
 * The fields that MAY travel in a share. An allowlist, and that inversion is the point.
 *
 * <p>This was `NOT_SHARED = ['cvv', 'pin']` — an exclusion list — until the code review pointed out
 * that it is the same defect class this very feature was bitten by three times in S1.1, where
 * `keepsPassword`, `canBurnOnAgentUse` and the form's password section were each written as "every
 * kind except these" and silently granted a new kind all three. An exclusion list leaks BY DEFAULT:
 * the next sensitive field added to `PaymentFields` — a one-time token, a full magnetic track, a
 * second phrase — travels to somebody else's vault because nobody remembered to add it here.</p>
 *
 * <p>An allowlist fails the other way: a new field is WITHHELD until somebody decides it is safe to
 * send, and the worst outcome of forgetting is a recipient missing a field they can ask for. That is
 * the asymmetry worth having when the mistake is irreversible in one direction.</p>
 *
 * <p><b>What is on it, and why.</b> Everything a person routinely tells others IN ORDER TO BE PAID:
 * the card number, its expiry, the holder's name, the billing address and phone, the country, the
 * payment system; and every bank-details field, because reciprocity is what bank details are FOR.</p>
 *
 * <p><b>What is deliberately absent.</b> `cvv` and `pin` — the only two fields that are purely proof
 * the holder is present. And every PHRASE field, including `mixed`: a woven phrase in someone else's
 * vault is tokens they cannot unweave, because the method is a code the person remembers and nothing
 * transmits (parent plan §4.4). Sending it is either useless to them or, if the sender's second
 * column held a second real key, a leak of two keys at once. Recorded as an open product question in
 * the plan rather than decided quietly here — the safe behaviour ships in the meantime.</p>
 */
const SHARE_SAFE = [
  // Card — what an invoice or a payment page asks for.
  'number',
  'expiry',
  'holder',
  'address',
  'phone',
  'country',
  'brand',
  // Bank details — every field, because they exist to be told to people.
  'beneficiary',
  'bank',
  'iban',
  'accountNumber',
  'swift',
  'intermediary',
  'bankAddress',
  // Metadata, not a value: which of the surviving fields are stored woven. `pickPaymentFields` prunes
  // any name whose field did not survive, so this cannot describe something that is not there.
  'shuffledFields',
] as const satisfies readonly PaymentFieldKey[];

/**
 * The record as it should be SHARED, or `undefined` when nothing is left to send.
 *
 * <p>Returning `undefined` matters and is not a nicety: it is what stops an all-CVV card from
 * arriving in the recipient's vault as a keychain key holding an empty object, exactly as
 * `serializePaymentFields` refuses to store one anywhere else.</p>
 *
 * <p><b>The `shuffledFields` names are stripped with their values, and for free.</b> That list drives
 * the recipient's card — a name in it means "draw a method picker for this field" — so a name left
 * behind with nothing behind it draws a picker over a field that is not there. Nothing here does that
 * work: `serializePaymentFields` already refuses to keep a mark whose value is absent (a rule the S1.2
 * code review put in), so deleting the value deletes the mark. This function asserts that in its tests
 * rather than re-implementing it, because two implementations of one rule is how they drift.</p>
 */
export function redactPaymentForShare(raw: string | undefined): string | undefined {
  if (isUnreadable(raw)) {
    // A record EXISTS and yields no fields: it is corrupt, not absent. Silently sharing "no card"
    // here would deliver an empty entry that looks deliberate, and a retry would be
    // indistinguishable from a first success. Accepted from the code review — the read-failure half
    // of that finding was already covered, because `secrets.get` REJECTS rather than resolving
    // undefined and nothing on the share path catches it, so a keychain failure already fails the
    // whole build. This is the parse half, which did fall through.
    throw new PaymentRecordUnreadableError();
  }
  return serializePaymentFields(keepOnlyShareSafe(raw));
}

/**
 * The fields a share WITHHELD, by name, so the SENDER can be told what did not go.
 *
 * <p>Accepted from the review as a Minor, and the sender is the side that needed it rather than the
 * recipient: somebody sharing a hidden phrase would otherwise watch a success notification and believe
 * the phrase arrived. It cannot have — the recipient gets tokens they cannot unweave, because the
 * method is a code the person remembers and nothing transmits.</p>
 *
 * <p>Names only, never values: this reaches a notification, and several UI layers log those.</p>
 */
export function withheldFromShare(raw: string | undefined): readonly string[] {
  const stored = parsePaymentFields(raw) as Record<string, unknown>;
  const safe = new Set<string>(SHARE_SAFE);
  return Object.keys(stored).filter((key) => !safe.has(key));
}

/** A record that EXISTS and yields no fields — corrupt, as distinct from simply absent. */
function isUnreadable(raw: string | undefined): boolean {
  return raw !== undefined && raw.length > 0 && Object.keys(parsePaymentFields(raw)).length === 0;
}

/** The allowlist applied: only a named field survives, everything else is dropped by DEFAULT. */
function keepOnlyShareSafe(raw: string | undefined): Record<string, unknown> {
  const stored = parsePaymentFields(raw) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of SHARE_SAFE) {
    if (stored[key] !== undefined) {
      out[key] = stored[key];
    }
  }
  return out;
}

/**
 * The two fields whose presence in an EXPORT is worth warning about.
 *
 * <p>Not the complement of `SHARE_SAFE`, and the difference is deliberate. The complement also holds
 * the phrase fields, and a woven phrase in an export is the ONLY place it is useful — it is the
 * person's own file, and the woven form is what they store anyway. What deserves a sentence is the
 * pair a share removes and an export does not, because that asymmetry is the surprise.</p>
 */
const WITHHELD_FROM_SHARE = ['cvv', 'pin'] as const satisfies readonly PaymentFieldKey[];

/**
 * The two lists cannot contradict each other, and the compiler says so.
 *
 * <p>Raised by my own reviewer, and the point is precedent rather than risk: the neighbouring module
 * ties BOTH of its closed lists to the key space structurally (`satisfies`, plus an exactness
 * assertion that names an unlisted field), because a second hand-maintained list beside a first is the
 * drift shape S1.1 was bitten by three times. `WITHHELD_FROM_SHARE` had no such tie.</p>
 *
 * <p>Exactness is the wrong test for it — the two lists are deliberately NOT complements, since the
 * complement also holds the phrase fields and an export legitimately carries those. What must never be
 * true is that a field is on BOTH: warning that an export includes something a share also sends would
 * be a sentence that misinforms. Disjointness is the invariant, so disjointness is what is checked.</p>
 */
type SharedAndWithheld = Extract<(typeof WITHHELD_FROM_SHARE)[number], (typeof SHARE_SAFE)[number]>;
const LISTS_DO_NOT_CONTRADICT: SharedAndWithheld extends never ? true : SharedAndWithheld = true;
void LISTS_DO_NOT_CONTRADICT;

/**
 * How many of these exported records carry a field a SHARE would have removed.
 *
 * <p>Accepted from the code review, and it closes a gap between the plan and the product: the plan
 * says an export happens "deliberately, once, WITH A WARNING", and the warning that exists names
 * "secrets" generically. The asymmetry is the surprise — a person who has just watched a share leave
 * the CVV behind has every reason to assume an export does the same, and it does not. So the warning
 * says which fields, when there are any.</p>
 *
 * <p>Counting rather than listing the values: the warning must name the RISK without printing a CVV
 * into a notification, which several UI layers log.</p>
 *
 * <p><b>BOTH numbers, because one of them alone misleads — and the two reviewers asked for different
 * ones, which is what made the ambiguity visible.</b> Counting RECORDS and saying "the CVV and PIN of
 * 2 records" implies both values exist in each, when one may hold only a CVV and the other only a PIN.
 * Counting FIELDS and saying "2 fields" hides how many cards are involved. So the caller gets both and
 * says something that is true either way.</p>
 */
export interface ExportedSensitiveFields {
  /** How many payment records carry at least one of them. */
  readonly records: number;
  /** How many such fields in total — a record holding both counts twice. */
  readonly fields: number;
}

export function paymentFieldsInExport(records: Iterable<{ payment?: string }>): ExportedSensitiveFields {
  let recordCount = 0;
  let fieldCount = 0;
  for (const record of records) {
    const stored = parsePaymentFields(record.payment) as Record<string, unknown>;
    const found = WITHHELD_FROM_SHARE.filter((key) => stored[key] !== undefined).length;
    fieldCount += found;
    recordCount += found > 0 ? 1 : 0;
  }
  return { records: recordCount, fields: fieldCount };
}

/** The warning sentence, or '' when there is nothing to warn about. */
export function exportSensitiveNote(counts: ExportedSensitiveFields): string {
  if (counts.fields === 0) {
    return '';
  }
  const fields = counts.fields === 1 ? '1 CVV or PIN' : `${counts.fields} CVV/PIN values`;
  const across = counts.records === 1 ? '1 payment record' : `${counts.records} payment records`;
  return ` Includes ${fields} across ${across} — a share removes those, an export does not.`;
}

/**
 * A stored payment record that exists and cannot be read.
 *
 * <p>Its own type rather than a bare `Error` so the share path can say something true to the person:
 * the card was not sent, nothing was delivered half-done, and retrying is worth doing. A message that
 * said "shared" while omitting the card would be the worse outcome.</p>
 */
export class PaymentRecordUnreadableError extends Error {
  constructor() {
    super('This payment record could not be read, so it was not shared. Nothing was sent for it.');
    this.name = 'PaymentRecordUnreadableError';
  }
}

/**
 * The guard at the RECEIVING boundary — what an accepted share is allowed to have brought.
 *
 * <p>Accepted from the code review, and it overturns a decision I had argued for. My reasoning was
 * that redacting on both sides means two opinions about one rule; the reviewer's is that
 * `importShared` is a TRUST BOUNDARY, and everything arriving there was written by somebody else's
 * process. Both are right, and they reconcile: this calls the SAME function the sender calls, so
 * there is one opinion applied twice rather than two opinions. That is the shape the repository
 * already uses for sender identity — stamped from a verified token, never accepted from the body.</p>
 *
 * <p>What it stops: a crafted or replayed payload, or one from a build whose redaction was removed,
 * putting a CVV into the recipient's vault while the product claims a share cannot carry one. The
 * claim has to be true of what ARRIVES, not merely of what we send.</p>
 *
 * <p><b>A corrupt arrival is REPORTED, not silently dropped.</b> I had made this side silently keep the
 * readable half, on the argument that a share which reached a person is theirs and refusing it would
 * lose more than it protects. Both reviewers rejected that independently, and they were right about
 * the part I had wrong: the argument justifies keeping the entry, and nothing about it justifies being
 * SILENT. A recipient told the entry arrived, whose card was dropped because the payload was malformed
 * or written to a newer schema, acts on an entry they believe is complete — and has no way to ask for
 * a re-send, because nothing says anything happened.</p>
 *
 * <p>So the outcome is a THREE-way answer rather than a string: the entry still lands (the sending side
 * refuses instead, which is where a refusal costs nothing), and the caller is told when a payment
 * record was present and unreadable so it can say so.</p>
 */
export interface ArrivedPayment {
  /** What to store, or `undefined` when there is nothing to store. */
  readonly raw: string | undefined;
  /** A payment record arrived and could not be read. The entry is still imported. */
  readonly unreadable: boolean;
}

export function redactArrivedPayment(raw: string | undefined): ArrivedPayment {
  if (isUnreadable(raw)) {
    return { raw: undefined, unreadable: true };
  }
  return { raw: serializePaymentFields(keepOnlyShareSafe(raw)), unreadable: false };
}
