import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { BridgeNote } from './bridgeNote';
import type { writeBridgeNote } from './bridgeNoteWriter';
import type { BridgeScopes } from './bridgeScopeStore';
import type { CredsAgentServer } from './credsAgentServer';
import { entityKey } from './entityFlags';
import type { McpEntry } from './mcpEntries';
import { personPinWriter } from './personPin';
import { clickOpener } from './pinClick';
import type { resolveExecAuth } from './sshExecAuth';
import { bridgeId, buildBridgeArgv, buildNoteArgv, remoteSocketPath } from './sshBridge';
import type { OpenBridge, SshBridgeManager } from './sshBridgeManager';
import { isSafeSshTarget } from './sshCommand';
import type { StorageManager } from './storageManager';
import type { EntityMetadata } from './types';
import { type CallAuth, type ReadyCall, withWrittenKeyUntilExit } from './writtenKey';

/**
 * Open a Remote Bridge the scoped way (change 11.1, the 72-hour slice, S1): the person picks what the server's agent may reach, the broker
 * opens a listener of this bridge's own behind E1's wall, `ssh -R` forwards the server's socket to THAT listener (never the main port),
 * and the bridge's note is written on the server, so `creds` and `creds-mcp` there find it by themselves: nothing is pasted.
 */
export interface ScopedBridgeHost {
  readonly agentServer: CredsAgentServer;
  readonly bridges: SshBridgeManager;
  readonly scopes: BridgeScopes;
  /** The entries of ONE account that are opened to agents: what a scope may hold (E1's `listEntriesOf`). */
  readonly listBridgeable: (accountId: string) => Promise<readonly McpEntry[]>;
  readonly storage: StorageManager;
  readonly storageDir: string;
  readonly refresh: () => void;
  /** The credential resolver and the note writer, handed in by the command module so its stand-ins in a test stand in here too. */
  readonly resolve: typeof resolveExecAuth;
  readonly writeNote: typeof writeBridgeNote;
}

/** The words the person sees once a bridge is open: what works on the server, and the one thing that does not. */
export const SCOPED_BRIDGE_OPEN = (serverName: string, count: number): string =>
  `Remote Bridge open to "${serverName}": ${count} ${count === 1 ? 'entry' : 'entries'} in its scope. On the server, creds and creds-mcp find it by themselves; nothing to paste.`;

/** The scope pick: every bridgeable entry of the account, the current scope ticked. `undefined` when the person dismissed it. */
async function pickScope(host: ScopedBridgeHost, accountId: string, server: { id: string; name: string }): Promise<{ ids: string[]; revision: string } | undefined> {
  const entries = (await host.listBridgeable(accountId)).filter((entry) => entry.id !== server.id);
  if (entries.length === 0) {
    void vscode.window.showWarningMessage(`No entry of this account is opened to agents, so the bridge to "${server.name}" would serve nothing. Open an entry to agents first (Edit, Agent access).`);
    return undefined;
  }
  const scope = host.scopes.read(accountId, server.id);
  const items = entries.map((entry) => ({ label: entry.name, description: `${entry.kind}${entry.folder === '' ? '' : ` · ${entry.folder}`}`, picked: scope.entries.has(entry.id), id: entry.id }));
  const chosen = await vscode.window.showQuickPick(items, { canPickMany: true, title: `What may the agent on "${server.name}" use?`, placeHolder: 'Only these entries are reachable through this bridge' });
  if (chosen === undefined || chosen.length === 0) {
    return undefined;
  }
  return { ids: chosen.map((item) => item.id), revision: scope.revision };
}

/** The note a client on the server reads: this connection's socket, the listener's port and key, the main broker's port. */
function noteOf(remotePath: string, listener: { port: number; key: string }, brokerPort: number, serverName: string): BridgeNote {
  return { socket: remotePath, port: listener.port, brokerPort, key: listener.key, serverName, openedAt: new Date().toISOString() };
}

/** What one bridge's start needs to know, besides the credential. */
interface StartPlan {
  readonly accountId: string;
  readonly node: { id: string; name: string };
  readonly details: EntityMetadata;
  readonly id: string;
  readonly port: number;
  readonly remotePath: string;
}

/** Starts the bridge's ssh with a ready credential and hands back the note's one-shot ssh; `undefined` (and the reason shown) when it cannot. */
function startOn(host: ScopedBridgeHost, plan: StartPlan, credential: CallAuth, keepNote: (call: { argv: string[]; env: NodeJS.ProcessEnv }) => void): OpenBridge | undefined {
  if (credential.warning !== undefined) {
    void vscode.window.showWarningMessage(credential.warning);
  }
  return credential.ok ? startReady(host, plan, credential, keepNote) : refused(plan, credential.message);
}

function refused(plan: StartPlan, message: string): undefined {
  void vscode.window.showErrorMessage(`Cannot bridge to "${plan.node.name}": ${message}`);
  return undefined;
}

function startReady(host: ScopedBridgeHost, plan: StartPlan, credential: ReadyCall, keepNote: (call: { argv: string[]; env: NodeJS.ProcessEnv }) => void): OpenBridge | undefined {
  // Each call names the pin file of its call in place (the guard T11 reads the argument): both ssh read the entry's pinned host key.
  const base = { port: plan.port, remote: { path: plan.remotePath }, keyPath: credential.keyPath, auth: credential.auth };
  const argv = buildBridgeArgv(plan.details, { ...base, knownHostsFile: credential.knownHostsFile }, isSafeSshTarget);
  const noteArgv = buildNoteArgv(plan.details, { ...base, knownHostsFile: credential.knownHostsFile }, isSafeSshTarget, plan.id);
  if (argv === undefined || noteArgv === undefined) {
    void vscode.window.showWarningMessage(`"${plan.node.name}" cannot be bridged: its host is not a shape ssh can be given safely.`);
    return undefined;
  }
  keepNote({ argv: noteArgv, env: credential.env });
  return host.bridges.start(entityKey(plan.accountId, plan.node.id), plan.remotePath, 'ssh', argv, credential.env);
}

/**
 * The whole open. A failure at any step undoes the steps before it (the listener closed, the ssh ended) and says why; nothing is left
 * half open. The listener closes when the bridge's ssh ends, whatever ends it. The socket's path when the bridge is open, for the caller's
 * check of its real permissions on the server.
 */
// eslint-disable-next-line complexity
export async function openScopedBridge(host: ScopedBridgeHost, accountId: string, node: { id: string; name: string }, details: EntityMetadata): Promise<{ readonly remotePath: string } | undefined> {
  const picked = await pickScope(host, accountId, node);
  if (picked === undefined) {
    return undefined;
  }
  await host.scopes.set(accountId, node.id, picked.ids, false, picked.revision);
  const id = bridgeId(() => crypto.randomUUID());
  const target = `${details.user ?? ''}@${details.host ?? ''}:${details.port ?? 22}`;
  const listener = await host.agentServer.openBridgeListener({ bridgeId: id, accountId, serverEntityId: node.id, serverName: node.name, target, remoteOs: details.terminalOs });
  const brokerPort = host.agentServer.listeningPort;
  const remote = { path: remoteSocketPath(details.user ?? '', id) };
  let noteCall: { argv: string[]; env: NodeJS.ProcessEnv } | undefined;
  const bridge = await withWrittenKeyUntilExit(
    await host.resolve(host.storage, accountId, details, host.storageDir, clickOpener(host.storage, accountId, 'connect')),
    personPinWriter(host.storageDir, details),
    (credential) => startOn(host, { accountId, node, details, id, port: listener.port, remotePath: remote.path }, credential, (call) => {
      noteCall = call;
    }),
  );
  if (bridge === undefined || noteCall === undefined) {
    await listener.close();
    return undefined;
  }
  void bridge.process.exited.then(() => listener.close(), () => listener.close());
  host.refresh();
  const written = await host.writeNote(noteOf(remote.path, listener, brokerPort, node.name), noteCall.argv, noteCall.env);
  if (!written.ok) {
    host.bridges.stop(entityKey(accountId, node.id));
    host.refresh();
    void vscode.window.showErrorMessage(`The bridge to "${node.name}" was closed again: its note could not be written on the server (${written.reason}).`);
    return undefined;
  }
  void vscode.window.showInformationMessage(SCOPED_BRIDGE_OPEN(node.name, picked.ids.length));
  return { remotePath: remote.path };
}
