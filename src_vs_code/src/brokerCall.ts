import { AuditDoor } from './agentAuditLog';
import type { CallerLabel } from './brokerCaller';
import { ErrorCode, INTERNAL_FAILURE } from './brokerProtocol';
import { runAndDeliver } from './brokerResponse';
import { reservationRefused } from './brokerRequests';
import { Grant, GrantLimits, GrantLookup, GrantRegistry } from './grantRegistry';
import { grantLimits } from './grantLimits';
import { OneUseLane, laneKeyFor } from './oneUseLane';
import { NOT_LAUNCHED } from './requestLife';
import { MaskTable } from './secretMasker';
import { UseAction, UseActionResult } from './useActions';

/**
 * One call, from the moment consent is in hand to the moment its answer is on the wire.
 *
 * <p>Out of `credsAgentServer.ts` because that file has sat at its 800-line ceiling through four
 * consecutive changes, and because this is a sequence rather than a piece of the server: reserve a
 * use, take this entity's turn if it may only be used once, run, mask, answer, burn. The server
 * binds it to one request and owns the socket; nothing here knows there is one.</p>
 */

/** Everything the sequence needs, bound by the caller to one request. */
export interface CallDeps {
  readonly grants: { reserve(secret: string, now: number, limits: GrantLimits): GrantLookup };
  readonly lane: OneUseLane;
  /** Whether this entry may be used exactly once; absent means this window queues nothing. */
  readonly isOneUse?: (accountId: string, entityId: string) => boolean;
  respond(status: number, body: unknown): void;
  log(line: {
    grant: string;
    entityName: string;
    action: string;
    via: AuditDoor;
    outcome: string;
    detail: string;
    caller: CallerLabel | undefined;
  }): void;
  /** Answer a refusal that happened before the action ran. */
  refuse(code: ErrorCode, message: string): void;
  /** Answer a failure of the action itself, with a reason already masked for the journal. */
  failed(why: string, actionRan: boolean): void;
  refresh(): Promise<MaskTable | undefined>;
  burn(status: number): Promise<void>;
  /**
   * Record that this call was dropped because its client left — nothing reserved or run for it, and
   * nothing answered, because nobody is there. `stage` says where.
   */
  abandon(stage: string): void;
}

export interface CallSubject {
  readonly grant: Grant;
  readonly useAction: UseAction;
  readonly action: string;
  readonly body: Record<string, unknown>;
  readonly via: AuditDoor;
  /** Who the body says is calling — a label for the modal and the line, never a decision. */
  readonly caller: CallerLabel | undefined;
  readonly summary: string;
  readonly table: MaskTable;
  /** The request's life: fires when its client hung up (`requestLife.ts`). Handed to the action it starts. */
  readonly signal: AbortSignal;
}

export async function performCall(deps: CallDeps, call: CallSubject): Promise<void> {
  // The use is counted at the action boundary (`answer`), not here: a one-use call waits in the lane
  // between the two, and a call whose client left while it waited would have spent a use of its grant
  // without running (the review gate's finding on E4.S1).
  await queuedIfOneUse(deps, call);
}

/**
 * Take this entity's turn, if it may only be used once.
 *
 * <p>Everything else goes straight through, unqueued: serialising ordinary entries would trade a
 * real capability — two parallel queries against `prod-db` — for a guarantee only one kind of
 * entry ever asked for. The queue is keyed by the ENTITY rather than by the token, because the
 * MCP door mints a grant per call, so "one token, one use" would be no guarantee at all.</p>
 *
 * <p>The second caller is refused BEFORE anything runs. Letting it through and relying on the
 * action's own "no longer exists" lookup is still an invocation, and a handler that does anything
 * ahead of that lookup would do it twice.</p>
 *
 * <p>And the SPENT check comes before the one-use question, not after. The one-use question reads
 * storage, a burned entry is not in storage, so a call that arrives after the first has finished
 * sees an entry that no longer looks one-use — skips the queue, and runs. The lane knows what this
 * window has spent; storage knows what the entry is; they diverge exactly at the burn.</p>
 *
 * <p>Keyed by ACCOUNT and entity, since storage addresses an entry by both — see `laneKeyFor`.</p>
 */
async function queuedIfOneUse(deps: CallDeps, call: CallSubject): Promise<void> {
  const key = laneKeyFor(call.grant.accountId, call.grant.entityId);
  // The lane first, because it and storage stop agreeing the moment an entry burns.
  if (deps.lane.isSpent(key) || (await takesItsTurn(deps, call, key))) {
    refuseSpent(deps, call);
  }
}

/** Run it — queued if this entry is one-use — and say whether it was already spent. */
async function takesItsTurn(deps: CallDeps, call: CallSubject, key: string): Promise<boolean> {
  if (deps.isOneUse?.(call.grant.accountId, call.grant.entityId) !== true) {
    await answer(deps, call);
    return false;
  }
  return (await deps.lane.run(key, () => answer(deps, call))).spent;
}

function refuseSpent(deps: CallDeps, call: CallSubject): void {
  deps.refuse('not_found', `"${call.grant.entityName}" was one-use and has already been used.`);
}

/**
 * The action boundary: whether the client is still there, and the start, in ONE synchronous step.
 *
 * <p>A check made before an await leaves a window between the check and the start, and a client that
 * leaves inside it would get its action run anyway — the plan gate's finding on this story. So the
 * check sits here, and the action is started on the very next line, before this function yields — the
 * delivery only ever receives a promise of a run already under way. A one-use call arrives here
 * after waiting its turn in the lane, which is the longest wait on the whole path.</p>
 *
 * <p>The action is handed the same signal, so a client that leaves AFTER the start cancels the work
 * itself — the child process, the query — and not only the reply nobody would read.</p>
 */
function answer(deps: CallDeps, call: CallSubject): Promise<void> {
  if (call.signal.aborted) {
    deps.abandon('before the action started');
    return Promise.resolve();
  }
  if (!reservedNow(deps, call)) {
    return Promise.resolve();
  }
  const started = startNow(call);
  return deliver(deps, call, started);
}

/**
 * Count this use and clock it — or refuse, when the grant has run out.
 *
 * <p>Counted and clocked only once consent is in hand: a refused or still-pending call must not extend a
 * token's idle life or spend one of its uses. The check and the count are ONE synchronous step, because
 * the broker shares a consent dialog between concurrent first calls on purpose — see
 * `GrantRegistry.reserve`. And it is made at the boundary, in the same step as the abort check before it
 * and the start after it, so a call whose client left — while it was asked, or while it waited its turn in
 * the one-use lane — spends nothing (`PLAN_wsl_bridge_outlives_its_client.md` §5.7).</p>
 */
function reservedNow(deps: CallDeps, call: CallSubject): boolean {
  const limits = grantLimits();
  const reserved = deps.grants.reserve(call.grant.secret, Date.now(), limits);
  if (reserved.kind !== 'live') {
    deps.refuse('unauthorized', reservationRefused(reserved, limits));
    return false;
  }
  return true;
}

/**
 * Start the action now — a synchronous throw is a failed start like any other, not an escape.
 *
 * <p>The executor of `new Promise` runs synchronously, so the action starts on this line and not a
 * microtask later; a throw inside it becomes the rejection `runAndDeliver` already handles.</p>
 */
function startNow(call: CallSubject): Promise<UseActionResult> {
  const { grant, useAction, body, signal } = call;
  return new Promise<UseActionResult>((resolve) => {
    resolve(useAction.run({ accountId: grant.accountId, entityId: grant.entityId, entityName: grant.entityName, signal }, body));
  });
}

function deliver(deps: CallDeps, call: CallSubject, started: Promise<UseActionResult>): Promise<void> {
  const { grant, useAction, action, via, summary, table, caller } = call;
  return runAndDeliver(
    {
      respond: deps.respond,
      log: deps.log,
      burn: deps.burn,
      fail: (why, ran, ended) => failedOrAbandoned(deps, call, why, ran, ended),
      mutatesSecrets: useAction.mutatesSecrets,
      refresh: deps.refresh,
      table,
      where: { grant: GrantRegistry.describe(grant), entityName: grant.entityName, action, via, summary, caller },
    },
    () => started,
    (result) => (result.status === 200 ? useAction.describeOutcome(result) : String(result.status)),
  );
}

/**
 * An action that threw after its client left — refused at its launch, or killed mid-run by the request's
 * signal — is that request's abandonment, not an internal failure: one `ABANDONED` line, and nothing
 * written to a socket nobody reads. A failure while the client is still there is reported as before.
 *
 * <p>The line says what the action met its request's end at when the action said so (`ended`, from a
 * `requestLife` error — *after a dependency step had been typed*); for any other error it says what the
 * broker knows: a mutating action may have run, anything else was not launched (E4.S4).</p>
 */
function failedOrAbandoned(deps: CallDeps, call: CallSubject, why: string, ran: boolean, ended: string | undefined): void {
  if (call.signal.aborted) {
    deps.abandon(ended ?? (ran ? 'while the action ran — it was cancelled' : NOT_LAUNCHED));
    return;
  }
  deps.failed(why, ran);
}

export { INTERNAL_FAILURE };
