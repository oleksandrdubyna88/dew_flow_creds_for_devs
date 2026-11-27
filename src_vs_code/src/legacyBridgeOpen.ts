import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { CredsAgentServer } from './credsAgentServer';
import { entityKey } from './entityFlags';
import { parseToken } from './grantToken';
import { personPinWriter } from './personPin';
import { clickOpener } from './pinClick';
import type { resolveExecAuth } from './sshExecAuth';
import { bridgeId, buildBridgeArgv, remoteInstructions, remoteSocketPath } from './sshBridge';
import type { OpenBridge, SshBridgeManager } from './sshBridgeManager';
import { isSafeSshTarget } from './sshCommand';
import type { StorageManager } from './storageManager';
import type { EntityMetadata } from './types';
import { type CallAuth, withWrittenKeyUntilExit } from './writtenKey';

/**
 * *Open Remote Bridge* while the switch of the new flow is off (`bridgeFlowSwitch.ts`; the plan's §4.5): the road of the released
 * extension, as it was on `main` before change 11.1. A token is minted (which also starts the broker), `ssh -R` forwards a fresh socket
 * path on the server to the MAIN broker port, and the person is offered the setup block to paste there. It hands the server's login the
 * whole broker (cause D5 of the plan), which is why the new flow replaces it; until E4.1 turns the switch on it stays what ships.
 */
export interface LegacyBridgeHost {
  readonly agentServer: Pick<CredsAgentServer, 'share'>;
  readonly bridges: SshBridgeManager;
  readonly storage: StorageManager;
  readonly storageDir: string | undefined;
  readonly refresh: () => void;
  /** The credential resolver, handed in by the command module so its stand-in in a test stands in here too. */
  readonly resolve: typeof resolveExecAuth;
}

/** A fresh socket path on the server, under the entry's login. */
const freshRemote = (details: EntityMetadata): { path: string } => ({ path: remoteSocketPath(details.user ?? '', bridgeId(() => crypto.randomUUID())) });

/** Starts the bridge's ssh with a ready credential; `undefined` (and the reason shown) when it cannot. */
function startLegacy(host: LegacyBridgeHost, key: string, node: { name: string }, details: EntityMetadata, port: number, credential: CallAuth): OpenBridge | undefined {
  if (credential.warning !== undefined) {
    void vscode.window.showWarningMessage(credential.warning);
  }
  if (!credential.ok) {
    void vscode.window.showErrorMessage(`Cannot bridge to "${node.name}": ${credential.message}`);
    return undefined;
  }
  const remote = freshRemote(details);
  // Each call names the pin file of its call in place (the guard T11 reads the argument).
  const argv = buildBridgeArgv(details, { port, remote, keyPath: credential.keyPath, auth: credential.auth, knownHostsFile: credential.knownHostsFile }, isSafeSshTarget);
  if (argv === undefined) {
    void vscode.window.showWarningMessage(`"${node.name}" cannot be bridged: its host is not a shape ssh can be given safely.`);
    return undefined;
  }
  // The RESOLVED environment, not the parent's: a password entity carries its answer in SSH_ASKPASS.
  return host.bridges.start(key, remote.path, 'ssh', argv, credential.env);
}

/**
 * Opens the old road's bridge and offers the setup block. `verify` is the socket check of the command module, run once the bridge is
 * started (the server's `StreamLocalBindMask` sets the socket's mode, not us: look instead of assuming).
 */
export async function openLegacyBridge(host: LegacyBridgeHost, accountId: string, node: { id: string; name: string }, details: EntityMetadata, verify: (remote: { path: string }) => void): Promise<void> {
  // Minting also starts the broker, which is what gives the port the forward needs.
  const token = await host.agentServer.share(accountId, node.id, node.name, 'ssh');
  const parsed = parseToken(token);
  if (parsed === undefined || host.storageDir === undefined) {
    return;
  }
  const { storage, storageDir } = host;
  // N16, G1: the key file and the pin file of this call are this command's to delete until the bridge's ssh holds them; then that ssh's end deletes them.
  const bridge = await withWrittenKeyUntilExit(
    await host.resolve(storage, accountId, details, storageDir, clickOpener(storage, accountId, 'connect')),
    personPinWriter(storageDir, details),
    (credential) => startLegacy(host, entityKey(accountId, node.id), node, details, parsed.port, credential),
  );
  if (bridge === undefined) {
    return;
  }
  const remote = { path: bridge.remotePath };
  host.refresh();
  verify(remote);
  await offerSetupBlock(remote, token, node.name);
}

/** The setup block on the clipboard if the person asks. The token goes THROUGH `remoteInstructions`, never appended after it: the block is pasted into a shell. */
async function offerSetupBlock(remote: { path: string }, token: string, name: string): Promise<void> {
  const answer = await vscode.window.showInformationMessage(
    `Bridge open to "${name}". Open an SSH session there, paste the setup block, and \`creds\` works there.`,
    'Copy the setup block',
  );
  if (answer !== undefined) {
    await vscode.env.clipboard.writeText(remoteInstructions(remote, token, name));
  }
}
