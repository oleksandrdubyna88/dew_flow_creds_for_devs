import { AuditDoor } from './agentAuditLog';
import type { CallerLabel } from './brokerCaller';
import { statusForErrorCode, withheldBody } from './brokerProtocol';
import { describeError } from './describeError';
import { EMPTY_MASK_TABLE, MaskEntry, MaskTable, buildMaskTable, maskResponseBody } from './secretMasker';

/**
 * The last two things that happen to a call: the secrets come out of the answer, and a one-use
 * entry is spent.
 *
 * <p>Out of `credsAgentServer.ts` because that file lives at its 800-line ceiling and neither of
 * these needs anything on it — each takes the one callback it uses. They belong together because
 * they are the same moment in a call's life.</p>
 *
 * <p>They used to share one more property — <i>neither may take the call down with it</i> — and
 * that is the half audit finding #1 removed. Burning a one-use entry still may not: the answer is
 * already on the wire by then. Reading the mask table now MUST, because it happens before the
 * action, where taking the call down costs nothing but a retry.</p>
 */

/**
 * This entity's own secret values, as a table the masker can use — or a throw.
 *
 * <p><b>It used to fail OPEN</b>, and that was audit finding #1: any error building the table was
 * caught and the ORIGINAL body went out with `hits: 0`, which in the audit line is
 * indistinguishable from "there was nothing to mask". The comment defending it argued that failing
 * closed would trade a possible leak for a certain outage — true of a COMPLETED action, which is
 * exactly why this is now read BEFORE the action runs. A read that fails then costs a refused call,
 * not a result somebody already earned.</p>
 *
 * <p>No masker configured at all is a real build (the integration test constructs one, and so does
 * any window without storage): that answers an empty table, which masks nothing and refuses
 * nothing. Different from a read that FAILED, which throws.</p>
 */
export async function tableFor(
  entriesFor: ((accountId: string, entityId: string) => Promise<readonly MaskEntry[]>) | undefined,
  where: { accountId: string; entityId: string },
): Promise<MaskTable> {
  if (entriesFor === undefined) {
    return EMPTY_MASK_TABLE;
  }
  return buildMaskTable(await entriesFor(where.accountId, where.entityId));
}

/**
 * The pre-run table, or a refusal — the gate that makes everything after it affordable.
 *
 * <p>Answers `undefined` having ALREADY refused the call through `fail`. A storage read that will
 * not answer is a reason not to START: refusing here costs an agent a retry, while the old order —
 * consult the masker after the action, and catch — cost it a plaintext credential.</p>
 */
export async function tableOrFail(
  entriesFor: ((accountId: string, entityId: string) => Promise<readonly MaskEntry[]>) | undefined,
  where: { accountId: string; entityId: string },
  fail: (reason: string) => void,
): Promise<MaskTable | undefined> {
  try {
    return await tableFor(entriesFor, where);
  } catch (error) {
    fail(describeError(error));
    return undefined;
  }
}

/** The post-run read, which may fail without failing the call. See {@link Delivery.refresh}. */
export function refreshFrom(
  entriesFor: ((accountId: string, entityId: string) => Promise<readonly MaskEntry[]>) | undefined,
  where: { accountId: string; entityId: string },
): () => Promise<MaskTable | undefined> {
  return () => tableFor(entriesFor, where).catch(() => undefined);
}

/**
 * One table holding everything either of two tables holds.
 *
 * <p>For the pair a call now reads: the values as they were BEFORE the action, and as they are
 * after. A rotation changes one of them mid-run, and an entry deleted mid-run leaves the later read
 * shorter — so the union is the only form that covers both directions.</p>
 */
export function unionTables(a: MaskTable, b: MaskTable): MaskTable {
  // Merged on the PREPARED entries, not rebuilt from values: `buildMaskTable` has already expanded
  // each value into its forms and sorted longest-first, and that order is the property that stops a
  // short secret cutting a longer one in half. Re-sorting the union keeps it.
  const seen = new Map<string, string>();
  for (const entry of [...a.entries, ...b.entries]) {
    if (!seen.has(entry.needle)) {
      seen.set(entry.needle, entry.label);
    }
  }
  const entries = [...seen]
    .map(([needle, label]) => ({ needle, label }))
    .sort((x, y) => y.needle.length - x.needle.length);
  return { entries };
}

/** What the journal records instead of a reason it cannot redact. */
export const REASON_WITHHELD = '[reason withheld: the values to redact could not be read]';

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
 * <p>It takes the table the call already holds rather than reading storage again: the read that
 * would have failed is the reason this path is being taken at all.</p>
 *
 * <p><b>Not capped here</b>, and a reviewer asked for that too — checked and rejected: `formatAuditLine`
 * already flattens and truncates the detail to 200 characters through `oneLine`, so a second cap at
 * any larger number could never fire and a second cap at a smaller one would silently shorten every
 * other detail this journal carries. What truncation does NOT do is redact, which is why the masking
 * above is the part that had to be added.</p>
 */
export function maskedReason(table: MaskTable, reason: string): string {
  const masked = maskResponseBody({ reason }, table) as { body: { reason?: unknown } };
  return typeof masked.body.reason === 'string' ? masked.body.reason : reason;
}

/** Everything `deliver` needs, and nothing about the server it came from. */
export interface Delivery {
  respond(status: number, body: unknown): void;
  log(line: AuditLine): void;
  /** The one-use burn, already bound to its grant. Runs after the answer, never before. */
  burn(status: number): Promise<void>;
  /** The values read BEFORE the action — complete unless the action wrote one. */
  table: MaskTable;
  /** Where the line is written from — `caller` required-or-undefined, so no door can forget it. */
  where: { grant: string; entityName: string; action: string; via: AuditDoor; summary: string; caller: CallerLabel | undefined };
  /**
   * The values as they are once the action has finished; `undefined` when that read failed.
   *
   * <p>`refreshFrom` builds this. Called ONLY for an action that can write a secret: a rotation
   * stores its new value while it runs, so `table` cannot contain it. Every other action keeps a
   * single keychain read, because its pre-run table is complete by construction.</p>
   */
  refresh(): Promise<MaskTable | undefined>;
  /**
   * Answer an internal failure, with a reason for the journal that has already been masked.
   *
   * <p>`actionRan` says the side effect may have happened anyway — true whenever the action could
   * write a secret, because "it threw" does not mean "it did nothing".</p>
   */
  fail(reason: string, actionRan: boolean): void;
  /** Whether this call's action can write a stored secret — see `UseAction.mutatesSecrets`. */
  mutatesSecrets: boolean;
}

interface AuditLine {
  grant: string;
  entityName: string;
  action: string;
  via: AuditDoor;
  outcome: string;
  detail: string;
  /** Who the body said was calling — a label for the line, never a decision. */
  caller: CallerLabel | undefined;
}

/**
 * Mask a finished action's answer, record it, send it, and spend a one-use entry — or withhold it.
 *
 * <p>The whole tail of a call, in one place, because the decisions in it are one decision. The
 * masking is the last thing that happens before the bytes leave the extension: the broker's promise
 * — that no response field is a place a secret can travel — is true of the SHAPES and false of what
 * stdout carries, since an agent that composes a command can make it print the very password the
 * broker supplied to run it.</p>
 *
 * <p>Withholding is the case audit finding #1's plan got wrong until the review gate found it. A
 * rotation writes its new secret DURING the run, so `table` cannot hold that value; if `after` also
 * failed, no table we have can redact it, and falling back to `table` would mask the OLD credential
 * while sending the new one in the clear. When nothing was written, `table` is complete by
 * construction and using it costs the agent nothing.</p>
 */
export async function runAndDeliver(
  d: Delivery,
  run: () => Promise<{ status: number; body: unknown }>,
  describeOutcome: (result: { status: number; body: unknown }) => string,
): Promise<void> {
  let result: { status: number; body: unknown };
  try {
    result = await run();
  } catch (error) {
    await failed(d, error);
    return;
  }
  await answered(d, result, describeOutcome(result));
}

/**
 * An action that threw — and it may have thrown AFTER writing.
 *
 * <p>The review gate found this path leaking what the success path no longer does: a rotation that
 * stores its new credential and then fails can put that value in the error it throws, and masking
 * with the pre-run table would redact the OLD one and write the new one to the journal in the clear.
 * A mutating action therefore re-reads storage here too, and when that read fails the reason is not
 * written at all — the rule the plan stated and this path had not been holding.</p>
 *
 * <p>`actionRan` rides along for a mutating action, because "it threw" does not mean "it did
 * nothing": the write may already have happened, and a blind retry would rotate twice.</p>
 */
async function failed(d: Delivery, error: unknown): Promise<void> {
  const table = d.mutatesSecrets ? await safeRefresh(d) : d.table;
  if (table === undefined) {
    d.fail(REASON_WITHHELD, true);
    return;
  }
  // THAT it failed, never HOW. The reason is not lost, it MOVES to the journal — which is local,
  // and is where a person looks when an agent reports a failure — through the SAME masker the
  // response body goes through, because a driver's message is exactly where a credential turns up.
  d.fail(maskedReason(table, describeError(error)), d.mutatesSecrets);
}

/**
 * An action that answered: mask it, record it, send it, and spend a one-use entry — or withhold it.
 *
 * <p>Storage is re-read ONLY for an action that can write one, which is both the correct rule and
 * the one that keeps an ordinary call at a single keychain read rather than two (the review gate
 * measured the regression: every exec paying for a second full read of five fields). For every
 * other action the pre-run table is complete by construction.</p>
 */
async function answered(
  d: Delivery,
  result: { status: number; body: unknown },
  outcome: string,
): Promise<void> {
  const masking = d.mutatesSecrets ? await safeRefresh(d, d.table) : d.table;
  if (masking === undefined) {
    d.log({ ...d.where, outcome: 'withheld', detail: `${d.where.summary} · output withheld: the values to redact could not be re-read` });
    // `actionRan` is the load-bearing half: an agent that cannot tell "it did not happen" from "it
    // happened and you cannot see it" retries, and the only action that reaches here rotates a
    // credential — so a blind retry rotates twice and strands what the first one wrote.
    d.respond(statusForErrorCode('internal'), withheldBody());
    await d.burn(result.status);
    return;
  }
  const { body: sent, hits } = maskResponseBody(result.body, masking);
  // The COUNT, never which values: a journal that named them would be the thing it protects against.
  d.log({ ...d.where, outcome, detail: hits > 0 ? `${d.where.summary} · masked ${hits} secret value(s)` : d.where.summary });
  d.respond(result.status, sent);
  // After the answer is on the wire, never before: the use has happened by now, and a storage
  // failure while burning must not cost the agent the result it already earned.
  await d.burn(result.status);
}

/**
 * The post-run read, unioned with what came before — or `undefined` when it could not be made.
 *
 * <p>Caught here rather than trusted to the caller's `refresh`: the interface allows any
 * implementation, and a gate that depends on an unrelated function remembering to catch is not a
 * gate. `undefined` means withhold.</p>
 */
async function safeRefresh(d: Delivery, before?: MaskTable): Promise<MaskTable | undefined> {
  const after = await d.refresh().catch(() => undefined);
  if (after === undefined) {
    return undefined;
  }
  return before === undefined ? after : unionTables(before, after);
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
