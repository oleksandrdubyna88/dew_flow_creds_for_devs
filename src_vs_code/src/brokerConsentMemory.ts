import { withTimeout } from './withTimeout';
import type { AuditDoor } from './agentAuditLog';
import { describeError } from './describeError';

/**
 * What happens to a person's answer after they give it — and what must not happen to their call.
 *
 * <p>Its own module because `credsAgentServer.ts` sits at its 800-line ceiling and this is a real
 * seam rather than a place to put spare lines: everything here is about the RECORD of a consent,
 * and nothing here touches the socket, the modal or the action.</p>
 */

/**
 * How long a machine-local write may take before the call stops waiting for it.
 *
 * <p>Two seconds is far more than a `Memento` write needs and far less than an agent will wait.
 * The bound exists because the alternative is unbounded: a store that never answers would hold a
 * call the person already allowed, and a throttle slot with it, for as long as it liked. A write
 * that misses the bound is not an error — it is simply not remembered, which costs one more
 * dialog.</p>
 */
export const REMEMBER_TIMEOUT_MS = 2_000;

/**
 * Is this a dialog a person actually answered, on the one door that remembers?
 *
 * <p>All four conditions, named together because each is a different guarantee. <b>`via === 'mcp'`
 * means a USE call</b>, since `perform` is reached from exactly one door — delete and create call
 * `consent` directly — so somebody who allowed a token or alias call cannot silence the MCP door on
 * the same entry, and those dialogs say different things. <b>`asked`</b> is false for a call a
 * policy settled, so a quiet call cannot slide the twelve-hour window forward, which is how "once
 * every twelve hours" would become "once, ever". And <b>the fingerprint</b> must be present AND
 * non-empty: the empty string is what a lookup that does not know about this field reads as, and it
 * matches no resolved ladder — recording it would write a stamp nothing can ever match, so the
 * person would answer once and be asked forever.</p>
 */
export function answeredHere(via: AuditDoor, asked: boolean, rungs: string | undefined): rungs is string {
  return via === 'mcp' && asked && rungs !== undefined && rungs.length > 0;
}

/** What `recordConsent` needs: the hook, who it is about, and somewhere to say it did not work. */
export interface ConsentRecord {
  remember?: (accountId: string, entityId: string, rungs: string) => Promise<void>;
  accountId: string;
  entityId: string;
  entityName: string;
  via: AuditDoor;
  /** Whether a modal was actually shown for this call. */
  asked: boolean;
  rungs: string | undefined;
  note: (entry: { entityName: string; action: string; outcome: string; detail: string; via: AuditDoor }) => void;
  /**
   * How long to wait for the write. An argument rather than a constant read inside, so the test
   * for the never-answers case takes milliseconds instead of two seconds — a suite that waits is a
   * suite somebody eventually stops running.
   */
  timeoutMs?: number;
}

/**
 * Remember an answered dialog — and never let that failing cost somebody their call.
 *
 * <p>What the person answered was about the CALL, not about whether this machine managed to write
 * it down. A rejected write, and a write that does not answer inside {@link REMEMBER_TIMEOUT_MS},
 * both cost exactly one more dialog next time; failing the call would cost them the work. Both are
 * said out loud on the MCP door's own channel rather than swallowed, with the fingerprint on the
 * line — "consent not remembered" with no grant named is a report nobody can act on.</p>
 */
export async function recordConsent(record: ConsentRecord): Promise<void> {
  if (!answeredHere(record.via, record.asked, record.rungs)) {
    return;
  }
  const bound = record.timeoutMs ?? REMEMBER_TIMEOUT_MS;
  // NOT unrefd, and `withTimeout`'s own docblock is why: an unrefd timer does not hold the loop, so
  // a caller awaiting it with nothing else running gets no answer at all rather than a late
  // `undefined`. That is invisible under the broker, where a listening socket always holds the
  // process — and it ended a CI run here, cancelling this module's never-answers test and the two
  // after it with `Promise resolution is still pending but the event loop has already resolved`.
  // The bound IS the guarantee this function exists for; a timer that may never fire is not one.
  // At most two seconds of held loop, only while a write is actually outstanding.
  const outcome = await withTimeout(attempt(record, record.rungs), bound);
  reportUnlessWritten(record, outcome, bound);
}

/** `undefined` is the bound running out; anything else that is not `'written'` is the failure. */
function reportUnlessWritten(record: ConsentRecord, outcome: string | undefined, bound: number): void {
  if (outcome === 'written') {
    return;
  }
  said(record, outcome ?? `the store did not answer within ${bound}ms`);
}

/**
 * The write, resolving its OWN failure.
 *
 * <p>`withTimeout` catches nothing and says so: a promise that rejects inside it escapes as an
 * unhandled rejection. So the failure comes back as a sentence rather than as a throw.</p>
 */
async function attempt(record: ConsentRecord, rungs: string): Promise<string> {
  try {
    await record.remember?.(record.accountId, record.entityId, rungs);
    return 'written';
  } catch (error) {
    return describeError(error);
  }
}

function said(record: ConsentRecord, why: string): void {
  record.note({
    entityName: record.entityName,
    action: 'consent',
    outcome: 'not remembered',
    detail: `${why} · ${record.rungs ?? ''}`,
    via: record.via,
  });
}
