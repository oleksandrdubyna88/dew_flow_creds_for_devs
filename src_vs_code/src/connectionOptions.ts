import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import { EntityMetadata } from './types';
import { SshCommandOptions } from './sshCommand';
import { resolveJumpChain } from './sshOptions';
import { confirmHostKey, materializeKnownHosts, scanHostKey } from './hostKeyTrust';

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
 */
export async function connectionOptions(
  accountId: string,
  entity: EntityMetadata,
  storage: StorageManager,
  storageDir: string,
  signal?: AbortSignal,
): Promise<ConnectionOptions | undefined> {
  const chain = resolveJumpChain(entity, lookup(storage, accountId));
  if (!chain.ok) {
    void vscode.window.showWarningMessage(chain.reason);
    return undefined;
  }

  const pin = await settleHostKey(entity, storage, accountId, signal);
  if (pin === undefined) {
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
    await storage.updateNode(accountId, { ...node, details: updated });
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
  signal?: AbortSignal,
): Promise<{ entity: EntityMetadata; stored?: string } | undefined> {
  const host = entity.host ?? '';
  if (host.length === 0) {
    return { entity };
  }
  const outcome = await confirmHostKey(entity, await scanHostKey(host, entity.port, signal));
  if (!outcome.proceed) {
    return undefined;
  }
  return acceptedPin(entity, outcome.pin, storage, accountId);
}
