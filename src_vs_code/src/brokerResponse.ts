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
