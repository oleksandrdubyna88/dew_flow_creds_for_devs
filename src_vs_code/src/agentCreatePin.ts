import type { CreateAccepted, CreateReady, CreateSettled } from './brokerMcpDoor';
import { AGENT_PIN_TRIES, CreatePin, asksForPinOnCreate, pinForAgentEntry, typedButDeclined } from './pinOnCreate';
import type { StorageManager } from './storageManager';
import { withTimeout } from './withTimeout';
import * as vscode from 'vscode';

/**
 * An agent's entry in a folder that asks for a PIN on new entries — the owner's decision D-B of
 * `PLAN_agent_creates_what_the_folder_holds.md` (§4.7).
 *
 * <p>The person's Add honours the folder: the PIN is asked before the form opens, checked against the
 * folder's protected entries (`pinOnCreate`). The agent's create did not, and wrote its values in the
 * clear into a folder whose whole point is that nothing in it is. An agent cannot type a PIN, so after
 * the person ALLOWS the creation the window asks them for it — the same question Add asks, by the same
 * code — inside the same consent step, and the step's deadline bounds it (plan gate, finding 0: a PIN
 * prompt must not hang the agent's call). Only boxes are raised there, never a modal: a box closes with
 * the step's token, a modal cannot be closed from code at all, so the count a typed PIN opens is said
 * rather than agreed to (`PinAsk.confirm`, code review of 2026-09-30). The answer is settled BEFORE anything is written: a PIN seals
 * every value in memory first (rule R3 of the entry-PIN plan, `mcpHooks.makeAgentEntry`); anything else
 * is a sentence for the agent and nothing is made, not even half.</p>
 */
export async function settleAgentCreate(
  storage: StorageManager,
  decision: CreateAccepted,
  deadline: number,
  now: () => number = Date.now,
): Promise<CreateSettled> {
  const { accountId, entityId: folderId, entityName: folder } = decision.target;
  if (!(await asksForPinOnCreate(storage, accountId, folderId))) {
    return READY;
  }
  const settled = await within(deadline - now(), (token) => pinForAgentEntry(storage, accountId, folderId, AGENT_PIN_TRIES, token));
  return settled === undefined ? refused('consent_timeout', TIMED_OUT(folder)) : answerFor(settled, folder);
}

/**
 * The question, bounded by what is left of the step — `undefined` when that ran out, or already had.
 *
 * <p>Every box the question raises carries one token, cancelled when the step runs out: the agent is
 * answered then and nothing is written, so a box still on screen after it would only take a PIN nobody
 * uses (plan §11). VS Code closes a box whose token is cancelled, and one raised after it at once.</p>
 */
async function within(left: number, ask: (token: vscode.CancellationToken) => Promise<CreatePin>): Promise<CreatePin | undefined> {
  if (left <= 0) {
    return undefined;
  }
  const source = new vscode.CancellationTokenSource();
  // A rejection would escape `withTimeout` unhandled; a read that fails is a PIN not given.
  const settled = await withTimeout(ask(source.token).catch((): CreatePin => ({ kind: 'cancelled' })), left);
  if (settled === undefined) {
    source.cancel();
  }
  source.dispose();
  return settled;
}

const READY: CreateReady = { ok: true };

function answerFor(settled: CreatePin, folder: string): CreateSettled {
  switch (settled.kind) {
    case 'none':
      return READY;
    case 'pin':
      return { ok: true, sealWith: settled.pin };
    default:
      return refused('denied', typedButDeclined(settled) ? NOT_AGREED(folder) : NOT_GIVEN(folder));
  }
}

function refused(code: 'denied' | 'consent_timeout', message: string): CreateSettled {
  return { ok: false, code, message };
}

const ASKS = (folder: string): string => `The folder "${folder}" asks for a PIN on every new entry`;

const NOT_GIVEN = (folder: string): string =>
  `${ASKS(folder)}, and the person did not give it — the box was dismissed, or the folder's protected entries ` +
  'are refusing PINs for a while after wrong ones. Nothing was created. Ask them to try again when they are ready.';

const NOT_AGREED = (folder: string): string =>
  `${ASKS(folder)}, and none of the ${AGENT_PIN_TRIES} PINs typed opens its protected entries. ` +
  "Nothing was created. Ask the person to create it again with the PIN the folder's entries use.";

const TIMED_OUT = (folder: string): string =>
  `${ASKS(folder)}, and it was not given in time. Nothing was created. Ask the person to try again when they are at their editor.`;
