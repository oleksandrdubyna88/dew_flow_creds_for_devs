import { AuditDoor } from './agentAuditLog';
import { ErrorCode, INTERNAL_FAILURE } from './brokerProtocol';
import { runAndDeliver } from './brokerResponse';
import { reservationRefused } from './brokerRequests';
import { Grant, GrantLimits, GrantLookup, GrantRegistry } from './grantRegistry';
import { grantLimits } from './grantLimits';
import { OneUseLane } from './oneUseLane';
import { MaskTable } from './secretMasker';
import { UseAction } from './useActions';

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
  log(line: { grant: string; entityName: string; action: string; via: AuditDoor; outcome: string; detail: string }): void;
  /** Answer a refusal that happened before the action ran. */
  refuse(code: ErrorCode, message: string): void;
  /** Answer a failure of the action itself, with a reason already masked for the journal. */
  failed(why: string, actionRan: boolean): void;
  refresh(): Promise<MaskTable | undefined>;
  burn(status: number): Promise<void>;
}

export interface CallSubject {
  readonly grant: Grant;
  readonly useAction: UseAction;
  readonly action: string;
  readonly body: Record<string, unknown>;
  readonly via: AuditDoor;
  readonly summary: string;
  readonly table: MaskTable;
}

export async function performCall(deps: CallDeps, call: CallSubject): Promise<void> {
  // Counted and clocked only once consent is in hand: a refused or still-pending call must not
  // extend a token's idle life or spend one of its uses. The check and the count are ONE
  // synchronous step, because two awaits sit between them and the broker shares a consent dialog
  // between concurrent first calls on purpose — see `GrantRegistry.reserve`.
  const limits = grantLimits();
  const reserved = deps.grants.reserve(call.grant.secret, Date.now(), limits);
  if (reserved.kind !== 'live') {
    deps.refuse('unauthorized', reservationRefused(reserved, limits));
    return;
  }
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
 */
async function queuedIfOneUse(deps: CallDeps, call: CallSubject): Promise<void> {
  if (deps.isOneUse?.(call.grant.accountId, call.grant.entityId) !== true) {
    await answer(deps, call);
    return;
  }
  const outcome = await deps.lane.run(call.grant.entityId, () => answer(deps, call));
  if (outcome.spent) {
    deps.refuse('not_found', `"${call.grant.entityName}" was one-use and has already been used.`);
  }
}

function answer(deps: CallDeps, call: CallSubject): Promise<void> {
  const { grant, useAction, action, via, summary, table } = call;
  return runAndDeliver(
    {
      respond: deps.respond,
      log: deps.log,
      burn: deps.burn,
      fail: deps.failed,
      mutatesSecrets: useAction.mutatesSecrets,
      refresh: deps.refresh,
      table,
      where: { grant: GrantRegistry.describe(grant), entityName: grant.entityName, action, via, summary },
    },
    () => useAction.run({ accountId: grant.accountId, entityId: grant.entityId, entityName: grant.entityName }, call.body),
    (result) => (result.status === 200 ? useAction.describeOutcome(result) : String(result.status)),
  );
}

export { INTERNAL_FAILURE };
