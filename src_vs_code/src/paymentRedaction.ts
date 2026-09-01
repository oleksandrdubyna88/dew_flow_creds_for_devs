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
  const fields: Record<string, unknown> = { ...parsePaymentFields(raw) };
  for (const key of NOT_SHARED) {
    delete fields[key];
  }
  return serializePaymentFields(fields);
}
