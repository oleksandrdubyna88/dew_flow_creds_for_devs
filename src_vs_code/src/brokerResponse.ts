import { describeError } from './describeError';
import { MaskEntry, buildMaskTable, maskResponseBody } from './secretMasker';

/**
 * The last two things that happen to a call: the secrets come out of the answer, and a one-use
 * entry is spent.
 *
 * <p>Out of `credsAgentServer.ts` because that file lives at its 800-line ceiling and neither of
 * these needs anything on it — each takes the one callback it uses. They belong together because
 * they are the same moment in a call's life, and because they share the property that makes both
 * of them safe: <b>neither may take the call down with it</b>.</p>
 */

/**
 * The response body with this entity's own secrets replaced by placeholders.
 *
 * <p>Fails OPEN by design: if the table cannot be built, the call still answers. Masking is a
 * second line — the first is that no response field carries a secret by construction — and
 * turning a working exec into an error because a keychain read failed would trade a possible
 * leak for a certain outage. The count is for the audit line; which values were masked is never
 * recorded.</p>
 */
export async function maskedBody(
  entriesFor: ((accountId: string, entityId: string) => Promise<readonly MaskEntry[]>) | undefined,
  where: { accountId: string; entityId: string },
  body: unknown,
): Promise<{ body: unknown; hits: number }> {
  if (entriesFor === undefined) {
    return { body, hits: 0 };
  }
  try {
    return maskResponseBody(body, buildMaskTable(await entriesFor(where.accountId, where.entityId)));
  } catch {
    return { body, hits: 0 };
  }
}

/**
 * The reason an action failed, as the JOURNAL may hold it.
 *
 * <p>A reviewer's finding, and the best of its round: moving the caught error out of the response
 * and into the journal put it somewhere it had never been. A driver's message is exactly the place a
 * credential turns up — `authentication failed for token sk-live-…`, a connection string with its
 * password in it — and the journal is a local file that gets read, copied and backed up. So the same
 * masker that strips secrets out of command output strips them out of this, and for the same
 * reason.</p>
 *
 * <p><b>Not capped here</b>, and a reviewer asked for that too — checked and rejected: `formatAuditLine`
 * already flattens and truncates the detail to 200 characters through `oneLine`, so a second cap at
 * any larger number could never fire and a second cap at a smaller one would silently shorten every
 * other detail this journal carries. What truncation does NOT do is redact, which is why the masking
 * above is the part that had to be added.</p>
 */
export async function maskedReason(
  entriesFor: ((accountId: string, entityId: string) => Promise<readonly MaskEntry[]>) | undefined,
  where: { accountId: string; entityId: string },
  reason: string,
): Promise<string> {
  const masked = (await maskedBody(entriesFor, where, { reason })) as { body: { reason?: unknown } };
  return typeof masked.body.reason === 'string' ? masked.body.reason : reason;
}

/**
 * Destroy a one-use entry now that it has been used — and say so.
 *
 * <p>Only a successful call spends it. A refused, failed or not-supported call left the
 * credential unused, and burning it there would destroy a working secret because the agent
 * mistyped a command.</p>
 *
 * <p>Failing to burn is reported, never thrown: the response is already sent, and the sweep has
 * no second chance at this — a `oneUse` entry carries no clock — so the note is the only record
 * that the entry outlived its promise.</p>
 */
export async function burnIfSpent(
  burn: ((accountId: string, entityId: string) => Promise<boolean>) | undefined,
  where: { accountId: string; entityId: string; entityName: string },
  status: number,
  note: (message: string) => void,
): Promise<void> {
  if (!spent(burn, status)) {
    return;
  }
  try {
    if (await (burn as (a: string, e: string) => Promise<boolean>)(where.accountId, where.entityId)) {
      note(`"${where.entityName}" was one-use and has been deleted from the vault.`);
    }
  } catch (error) {
    note(`"${where.entityName}" was one-use but could NOT be deleted: ${describeError(error)}`);
  }
}

/** Only a successful call spends a one-use entry, and only a window that can burn burns. */
function spent(burn: unknown, status: number): boolean {
  return burn !== undefined && status === 200;
}
