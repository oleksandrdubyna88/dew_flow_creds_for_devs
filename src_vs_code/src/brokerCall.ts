import { AuditDoor } from './agentAuditLog';
import type { CallerLabel } from './brokerCaller';
import { ErrorCode, INTERNAL_FAILURE } from './brokerProtocol';
import { runAndDeliver } from './brokerResponse';
import { Refusal, reservationRefused } from './brokerRequests';
import { Grant, GrantLimits, GrantLookup, GrantRegistry } from './grantRegistry';
import { grantLimits } from './grantLimits';
import { OneUseLane, laneKeyFor } from './oneUseLane';
import { NOT_LAUNCHED } from './requestLife';
import { MaskTable } from './secretMasker';
import { CallTarget, UseAction, UseActionResult, UsedEntry } from './useActions';

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
  refuse(code: ErrorCode, message: string, why?: string): void;
  /** Answer a failure of the action itself, with a reason already masked for the journal. */
  failed(why: string, actionRan: boolean): void;
  refresh(): Promise<MaskTable | undefined>;
  burn(status: number, of?: UsedEntry): Promise<void>;
  /**
   * Record that this call was dropped because its client left — nothing reserved or run for it, and
   * nothing answered, because nobody is there. `stage` says where.
   */
  abandon(stage: string): void;
  /**
   * The scope wall's gate at the action boundary (E1.3): `undefined` admits, a refusal is answered and spends
   * nothing. Asked after the abort check and before anything is reserved, in the same synchronous step as the
   * start, so a scope narrowed or a line edited while a person was being asked is read at the last moment there
   * is to read it. Absent on a build with no bridge.
   */
  atLaunch?(): Refusal | undefined;
  /** A follow-up prompt of the action's own is on screen: the one dialog place is that prompt's until it settles (F1). */
  standing?(prompt: PromiseLike<unknown>): void;
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
  /** What `UseAction.uses` answered for this call: the entry it also uses (the SSH entry of a linked run), or `undefined`. The key is REQUIRED, as `caller` is. */
  readonly uses: UsedEntry | undefined;
  readonly table: MaskTable;
  /** The request's life: fires when its client hung up (`requestLife.ts`). Handed to the action it starts. */
  readonly signal: AbortSignal;
  /**
   * The token a bridged token call spends: reserved first, in the same step as the call grant.
   *
   * <p>On a bridge a token only authenticates (the call rides a grant of its own), but it is still a token with
   * a use count and an idle clock, and a call through it must count against both. Here and not on the grant, so
   * a token's secret is never stored in another grant's record.</p>
   */
  readonly spend?: string;
}

export async function performCall(deps: CallDeps, call: CallSubject): Promise<void> {
  // The use is counted at the action boundary (`answer`), not here: a one-use call waits in the lane
  // between the two, and a call whose client left while it waited would have spent a use of its grant
  // without running (the review gate's finding on E4.S1).
  await queuedIfOneUse(deps, call);
}

/**
 * The entry this call ALSO uses, asked once per call in the same synchronous step as `summarize` (spec §2.2): the action's own answer, or nothing for an
 * action that declares none. A function here, and not an optional call in the server's `perform`, which has no complexity left.
 */
export function usedByCall(action: UseAction, target: CallTarget): UsedEntry | undefined {
  return action.uses?.(target);
}

/**
 * One entry whose turn a call takes: the grant's, or the entry the call ALSO uses (`CallSubject.uses`, the SSH entry of a linked run).
 * `used` says which, because a refusal for the grant's own entry and one for the used entry read differently (spec §2.5).
 */
interface Turn {
  readonly key: string;
  readonly accountId: string;
  readonly entityId: string;
  readonly entityName: string;
  readonly used: boolean;
}

const turnOf = (entry: UsedEntry, used: boolean): Turn => ({ key: laneKeyFor(entry.accountId, entry.entityId), ...entry, used });

/** The grant's entry first, then the used entry when its key differs: one key is never queued twice (a job of `KeyedQueue` must not wait for a run on its own key). */
function turnsOf(call: CallSubject): Turn[] {
  const own = turnOf(call.grant, false);
  const used = call.uses === undefined ? undefined : turnOf(call.uses, true);
  return used === undefined || used.key === own.key ? [own] : [own, used];
}

/** A plain compare, no locale: every call sorts the same two keys the same way, which is what keeps two calls from waiting for each other. */
const byKey = (a: Turn, b: Turn): number => (a.key < b.key ? -1 : 1);

/**
 * Take the turns of every entry this call uses that may only be used once — and say which turn was already spent.
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
 * window has spent; storage knows what the entry is; they diverge exactly at the burn. It holds for
 * an entry whose delete FAILED too: the marker is set whether or not the delete worked.</p>
 *
 * <p>A linked run uses TWO entries (the grant's Terminal entry and its SSH entry), and the SSH entry's one-use
 * promise is the same promise (spec §2.5): its spent marker is asked first, its turn is taken in the same lane
 * a `creds_exec` on it queues in, and it is burned after a 200 (`burnInTurn`). The turns are taken in ONE fixed
 * order, ascending lane key, nested: every wait then goes from a smaller key to a greater one, so no circle of
 * waits can form and two calls that use each other's entry both end. An action takes no turn itself. A queue
 * moves on when its job settles, on failure as on success (`keyedQueue.ts`), so a held turn always ends.</p>
 *
 * <p>Keyed by ACCOUNT and entity, since storage addresses an entry by both — see `laneKeyFor`. The spent marker is a
 * member of the lane's existing per-window set (at most 512 keys, the oldest dropped first), as for `creds_exec`.</p>
 */
async function queuedIfOneUse(deps: CallDeps, call: CallSubject): Promise<void> {
  const turns = turnsOf(call);
  // The lane first, because it and storage stop agreeing the moment an entry burns; and the one-use question in the SAME step, with no await between.
  const spent = turns.find((turn) => deps.lane.isSpent(turn.key));
  if (spent !== undefined) {
    refuseSpent(deps, call, spent);
    return;
  }
  const lost = await inTurns(deps, call, turns.filter((turn) => deps.isOneUse?.(turn.accountId, turn.entityId) === true).sort(byKey));
  if (lost !== undefined) {
    refuseSpent(deps, call, lost);
  }
}

/** Run the call inside each queued turn, nested in order; the turn that found its entry already spent, or nothing when the call ran (or ran unqueued). */
async function inTurns(deps: CallDeps, call: CallSubject, queued: readonly Turn[]): Promise<Turn | undefined> {
  if (queued.length === 0) {
    await answer(deps, call);
    return undefined;
  }
  const [first, ...rest] = queued;
  const outcome = await deps.lane.run(first.key, () => inTurns(deps, call, rest));
  return outcome.spent ? first : outcome.value;
}

/** What the agent reads when the entry its call also uses was one-use and is spent: ONE entry named, the grant's (spec §2.5). */
export function usedEntrySpent(name: string): string {
  return `"${name}" uses another entry that was one-use, and an agent has already used it, so nothing ran.`;
}

/** The grant's own entry: `not_found`, today's words. The used entry: `denied` (not a 404, which the CLI reads as "this window does not have the entry"), with the entry named in the journal only. */
function refuseSpent(deps: CallDeps, call: CallSubject, turn: Turn): void {
  if (!turn.used) {
    deps.refuse('not_found', `"${call.grant.entityName}" was one-use and has already been used.`);
    return;
  }
  deps.refuse('denied', usedEntrySpent(call.grant.entityName), `the entry it also uses, "${turn.entityName}", was one-use and has already been used`);
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
  if (launchRefused(deps) || !reservedNow(deps, call)) {
    return Promise.resolve();
  }
  const started = startNow(deps, call);
  return deliver(deps, call, started);
}

/** Whether the scope wall's gate refused this call at launch — already answered, with nothing reserved or started. */
function launchRefused(deps: CallDeps): boolean {
  const refused = deps.atLaunch?.();
  if (refused === undefined) {
    return false;
  }
  deps.refuse(refused.code, refused.message);
  return true;
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
  const now = Date.now();
  // The token first, so one that has run out costs the call grant nothing.
  const reserved = spentToken(deps, call, now, limits) ?? deps.grants.reserve(call.grant.secret, now, limits);
  if (reserved.kind !== 'live') {
    deps.refuse('unauthorized', reservationRefused(reserved, limits));
    return false;
  }
  return true;
}

/** The token behind a bridged call, reserved — or the non-live answer that refuses the call. `undefined` when there is none or it is live. */
function spentToken(deps: CallDeps, call: CallSubject, now: number, limits: GrantLimits): GrantLookup | undefined {
  if (call.spend === undefined) {
    return undefined;
  }
  const reserved = deps.grants.reserve(call.spend, now, limits);
  return reserved.kind === 'live' ? undefined : reserved;
}

/**
 * Start the action now — a synchronous throw is a failed start like any other, not an escape.
 *
 * <p>The executor of `new Promise` runs synchronously, so the action starts on this line and not a
 * microtask later; a throw inside it becomes the rejection `runAndDeliver` already handles.</p>
 */
function startNow(deps: CallDeps, call: CallSubject): Promise<UseActionResult> {
  const { grant, useAction, body, signal } = call;
  return new Promise<UseActionResult>((resolve) => {
    resolve(useAction.run({ accountId: grant.accountId, entityId: grant.entityId, entityName: grant.entityName, signal, bridge: grant.bridge?.context, lateAnswer: lateAnswerOf(deps, call), standingPrompt: deps.standing, summary: call.summary, uses: call.uses }, body));
  });
}

/** The seam for a late click on a prompt an action raised itself (E1.5): the journal says so, with the grant, action and door only `log` knows. */
function lateAnswerOf(deps: CallDeps, call: CallSubject): (what: string) => void {
  const { grant, action, via, caller } = call;
  const detail = (what: string): string => `"${what}" answered after its call had ended; the answer changed nothing`;
  return (what) => deps.log({ grant: GrantRegistry.describe(grant), entityName: grant.entityName, action, via, outcome: 'ignored', detail: detail(what), caller });
}

/**
 * After a call that answered, burn what it spent: the grant's entry as always, then the entry it also used. In a `finally`, because
 * `burnAndMark` catches a delete that fails but its one-use question reads storage first and can throw, and a throw for the grant's entry must
 * not leave a USED entry unburned and unmarked (spec §2.5; the reviewer's m7). Both burns end inside `answer`, so before either turn is released.
 */
async function burnInTurn(deps: CallDeps, call: CallSubject, status: number): Promise<void> {
  try {
    await deps.burn(status);
  } finally {
    if (call.uses !== undefined) {
      await deps.burn(status, call.uses);
    }
  }
}

function deliver(deps: CallDeps, call: CallSubject, started: Promise<UseActionResult>): Promise<void> {
  const { grant, useAction, action, via, summary, table, caller } = call;
  return runAndDeliver(
    {
      respond: deps.respond,
      log: deps.log,
      burn: (status) => burnInTurn(deps, call, status),
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
