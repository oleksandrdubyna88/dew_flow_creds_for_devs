import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { EntityMetadata } from './types';
import { SshCommandOptions } from './sshCommand';
import { resolveJumpChain } from './sshOptions';
import { TrustOutcome, confirmHostKey, materializeKnownHosts, scanHostKey } from './hostKeyTrust';
import { requestGone } from './requestLife';

/**
 * Turning an entity's connection-manager fields into the two things a command builder needs: a
 * resolved `-J` value, and a known_hosts file to enforce (audit items D7 and B10).
 *
 * <p>One function, called by BOTH the human Connect path and the agent's exec, for the reason
 * `sshCredential.ts` gives about credentials: the moment there are two answers to "which bastion,
 * which host key", one surface reaches a host the other refuses, and nobody finds out until it
 * matters.</p>
 *
 * <p>It lives apart from `sshOptions.ts` because it needs the vault and a dialog, and that module
 * is pure on purpose.</p>
 */

export interface ConnectionOptions extends SshCommandOptions {
  /** A key the caller should persist on the entity — the person accepted it just now. */
  pin?: string;
}

/** The entity a jump reference points at, within the same account. */
function lookup(storage: StorageManager, accountId: string): (id: string) => EntityMetadata | undefined {
  return (id) => storage.getNode(accountId, id)?.details;
}

/**
 * Resolve everything, asking the person about a host key when there is something to ask.
 *
 * <p>Returns `undefined` when the connection must NOT go ahead — a refused host key, or a jump
 * chain that cannot be built. Both are reported here rather than by the caller, because both are
 * about this entity's configuration and the caller has nothing to add.</p>
 *
 * <p>`startGate` is the agent request this connection is for — REQUIRED, `undefined` for the person's own
 * click, so no caller can forget it (`PLAN_wsl_bridge_outlives_its_client.md` §5.7, E4.S4). It cancels the
 * host-key scan, and once it has fired the question is not raised and nothing is written: a trust answer
 * given to a dialog nobody waits for decides nothing, and the next live connect asks again.</p>
 */
export async function connectionOptions(
  accountId: string,
  entity: EntityMetadata,
  storage: StorageManager,
  storageDir: string,
  startGate: AbortSignal | undefined,
): Promise<ConnectionOptions | undefined> {
  const chain = resolveJumpChain(entity, lookup(storage, accountId));
  if (!chain.ok) {
    void vscode.window.showWarningMessage(chain.reason);
    return undefined;
  }

  const pin = await settleHostKey(entity, storage, accountId, startGate);
  // The pin write is the person's answer to a request that was live when they gave it, and a write already
  // started is finished (E4.S1's rule for a consent remembered, the rotation's for its statement). The file
  // after it is not: a client gone during that write gets no known_hosts written for it (code round 3).
  if (pin === undefined || requestGone(startGate)) {
    return undefined;
  }
  const settled = pin.entity;
  return {
    jump: chain.value,
    knownHostsFile: materializeKnownHosts(storageDir, settled),
    pin: pin.stored,
  };
}

/**
 * The host-key conversation, and the write that follows it.
 *
 * <p>A scan runs when there is a reason to: no pin yet (so the fingerprint can be shown), or a
 * pin that a scan can contradict. `undefined` means the person said no.</p>
 */
/**
 * Write an accepted key onto the entity.
 *
 * <p>Plaintext metadata, so it syncs: a host trusted here is trusted on every machine, which is
 * the point — a pin that lived on one laptop would leave the others on first-contact forever.</p>
 */
async function persistPin(
  entity: EntityMetadata,
  pin: string,
  storage: StorageManager,
  accountId: string,
): Promise<EntityMetadata> {
  const node = storage.getNode(accountId, entity.id);
  const updated: EntityMetadata = { ...entity, hostKey: pin };
  if (node !== undefined) {
    await storage.updateDetailsFields(accountId, node.id, updated);
  }
  return updated;
}

/** Nothing was accepted, or something was — and then it is written down before connecting. */
async function acceptedPin(
  entity: EntityMetadata,
  pin: string | undefined,
  storage: StorageManager,
  accountId: string,
): Promise<{ entity: EntityMetadata; stored?: string }> {
  return pin === undefined
    ? { entity }
    : { entity: await persistPin(entity, pin, storage, accountId), stored: pin };
}

async function settleHostKey(
  entity: EntityMetadata,
  storage: StorageManager,
  accountId: string,
  startGate: AbortSignal | undefined,
): Promise<{ entity: EntityMetadata; stored?: string } | undefined> {
  const host = entity.host ?? '';
  if (host.length === 0) {
    return { entity };
  }
  // A request already gone is scanned for nothing and asked nothing (E4.S4).
  return requestGone(startGate) ? undefined : conversation(host, entity, storage, accountId, startGate);
}

/** The scan, the question, and — for a request still there — the pin written down. */
async function conversation(
  host: string,
  entity: EntityMetadata,
  storage: StorageManager,
  accountId: string,
  startGate: AbortSignal | undefined,
): Promise<{ entity: EntityMetadata; stored?: string } | undefined> {
  const scanned = await scanHostKey(host, entity.port, startGate);
  // The request's end kills the scan, but a key it had already printed still comes back — so the request
  // is read again here, before the question, or a gone request could still be shown it (own review).
  if (requestGone(startGate)) {
    return undefined;
  }
  const outcome = await confirmHostKey(entity, scanned);
  return trusted(outcome, startGate) ? acceptedPin(entity, outcome.pin, storage, accountId) : undefined;
}

/**
 * Whether the conversation ended in a connection to make: the person said yes, AND somebody still waits for
 * it. The request is read again after the question, because the question can sit open for minutes: a
 * *Trust and connect* clicked after the client left writes no pin and goes nowhere (E4.S4).
 */
function trusted(outcome: TrustOutcome, startGate: AbortSignal | undefined): boolean {
  return outcome.proceed && !requestGone(startGate);
}
