import type * as http from 'node:http';
import type { CallerLabel } from './brokerCaller';
import type { BrokerDoor } from './brokerMcpDoor';
import type { ErrorCode } from './brokerProtocol';
import { GRANT_NOT_ALLOWED, UNKNOWN_TOKEN } from './brokerRequests';
import type { Grant, GrantStatus } from './grantRegistry';

/** A token that cannot be used now: the person said no, or it is gone (evicted, expired) — answered as the main port would, `unknown`. */
function tokenRefusal(status: GrantStatus | undefined): { code: ErrorCode; message: string; logged: boolean } | undefined {
  if (status === 'denied') {
    return { code: 'denied', message: GRANT_NOT_ALLOWED, logged: true };
  }
  return status === undefined ? { code: 'unauthorized', message: UNKNOWN_TOKEN, logged: false } : undefined;
}

/**
 * A token on a bridge door authenticates only (E1.3, §S3.1 item 4).
 *
 * <p>Pure: imports no `vscode`. A token's own grant is allowed once for its whole life, anywhere it is used, and
 * the gate short-circuits on an allowed grant. So a token the person allowed on the laptop would run silently
 * through a bridge, and one allowed through server A would be allowed for local use and for server B. On a bridge
 * the token proves WHO is asking and nothing more: the call is minted and asked like an alias call, a grant of its
 * own for this one call, throttled by the modal budget, and a Deny refuses that call and does not tombstone the
 * token. A token the person denied on the laptop stays denied here, with no dialog.</p>
 *
 * <p>`door` is the broker's `BrokerDoor` built with `via: 'token'` and the token's secret as what the call spends:
 * the use count and the idle clock of the token move at the action boundary (`brokerCall.ts`), before the call
 * grant's, so a token that has run out spends nothing.</p>
 *
 * <p>The check for a token that cannot be used now runs INSIDE the slot, after `admit` (Amendment 3, C.5): a refusal with a
 * grant writes a journal line, and a loop of calls with a denied token must be counted and bounded like any asking call. A
 * token the person denied is answered `denied`, one that is gone (evicted, or expired while the body arrived) `unauthorized`
 * as the main port does, with no line. Neither mints a grant.</p>
 */
export async function bridgedTokenCall(
  door: BrokerDoor,
  res: http.ServerResponse,
  token: Pick<Grant, 'secret' | 'accountId' | 'entityId' | 'entityName' | 'kind'>,
  action: string,
  body: Record<string, unknown>,
  caller: CallerLabel | undefined,
  /** The token's status NOW, read after the body arrived: a Deny landing while the body was read is seen here, not at the lookup. */
  status: () => GrantStatus | undefined,
): Promise<void> {
  // `true`: this path raises a modal for every call, and a token path has no throttle of its own.
  const slot = door.admit(res, true);
  if (slot === undefined) {
    return;
  }
  try {
    const refusal = tokenRefusal(status());
    if (refusal !== undefined) {
      door.refuse(res, refusal.code, refusal.message, refusal.logged ? token : undefined, action, undefined, caller);
      return;
    }
    const { accountId, entityId, entityName, kind } = token;
    const grant = door.mint({ accountId, entityId, entityName, kind });
    door.note({ grant: door.describe(grant), entityName, action: 'token', outcome: 'minted', detail: `${entityName} · ${kind} · through a bridge`, caller });
    await door.perform(res, grant, action, body, caller, undefined);
  } finally {
    slot.release();
  }
}
