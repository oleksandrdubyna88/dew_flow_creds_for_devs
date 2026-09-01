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
 * The fields that do not travel in a share.
 *
 * <p>A CVV and a PIN are the two things on a card that are ONLY ever proof that the holder is
 * present. Everything else — the number, the expiry, the holder's name, the billing address — is
 * something the holder routinely tells other people in order to be paid.</p>
 */
const NOT_SHARED: readonly PaymentFieldKey[] = ['cvv', 'pin'];

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
  const fields: Record<string, unknown> = { ...parsePaymentFields(raw) };
  for (const key of NOT_SHARED) {
    delete fields[key];
  }
  return serializePaymentFields(fields);
}

/** A record that EXISTS and yields no fields — corrupt, as distinct from simply absent. */
function isUnreadable(raw: string | undefined): boolean {
  return raw !== undefined && raw.length > 0 && Object.keys(parsePaymentFields(raw)).length === 0;
}

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
 */
export function paymentFieldsInExport(records: Iterable<{ payment?: string }>): number {
  let count = 0;
  for (const record of records) {
    const fields = parsePaymentFields(record.payment) as Record<string, unknown>;
    if (NOT_SHARED.some((key) => fields[key] !== undefined)) {
      count++;
    }
  }
  return count;
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
 * <p>It cannot throw on a corrupt arriving record the way the sending side does: a share that reached
 * a person is theirs, and refusing to store the readable half of it would lose more than it protects.
 * An unreadable arrival yields nothing, and the entry lands without a payment record.</p>
 */
export function redactArrivedPayment(raw: string | undefined): string | undefined {
  const fields: Record<string, unknown> = { ...parsePaymentFields(raw) };
  for (const key of NOT_SHARED) {
    delete fields[key];
  }
  return serializePaymentFields(fields);
}
