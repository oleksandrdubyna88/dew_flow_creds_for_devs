import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { BridgeNote } from './bridgeNote';
import type { BridgeOptIns, OptIn } from './bridgeOptIns';
import type { writeBridgeNote } from './bridgeNoteWriter';
import type { BridgeScopes } from './bridgeScopeStore';
import type { BridgeListener } from './brokerBridgeListeners';
import type { BridgeConnection } from './bridgeSession';
import type { BridgeSessions } from './bridgeSessions';
import type { CredsAgentServer } from './credsAgentServer';
import { entityKey } from './entityFlags';
import type { McpEntry } from './mcpEntries';
import { personPinWriter } from './personPin';
import { clickOpener, grantedOpener } from './pinClick';
import type { resolveExecAuth } from './sshExecAuth';
import { bridgeId, buildBridgeArgv, buildNoteArgv, remoteSocketPath } from './sshBridge';
import type { OpenBridge, SshBridgeManager } from './sshBridgeManager';
import { isSafeSshTarget } from './sshCommand';
import type { StorageManager } from './storageManager';
import type { EntityMetadata } from './types';
import { type CallAuth, type ReadyCall, withWrittenKeyUntilExit } from './writtenKey';

/**
 * Open a Remote Bridge the scoped way (change 11.1, the 72-hour slice, S1 and S2): the person picks what the server's agent may reach,
 * and a session keeps the bridge (`bridgeSession.ts`). Each connection of that session is {@link connectScoped}: a listener of its own
 * behind E1's wall, `ssh -R` from a fresh socket path to THAT listener (never the main port), and a note on the server naming it, so
 * `creds` and `creds-mcp` there find it by themselves: nothing is pasted.
 */
export interface ScopedBridgeHost {
  readonly agentServer: CredsAgentServer;
  readonly bridges: SshBridgeManager;
  readonly sessions: BridgeSessions;
  readonly scopes: BridgeScopes;
  /** The entries of ONE account that are opened to agents: what a scope may hold (E1's `listEntriesOf`). */
  readonly listBridgeable: (accountId: string) => Promise<readonly McpEntry[]>;
  readonly storage: StorageManager;
  readonly storageDir: string;
  readonly refresh: () => void;
  /** The credential resolver and the note writer, handed in by the command module so its stand-ins in a test stand in here too. */
  readonly resolve: typeof resolveExecAuth;
  readonly writeNote: typeof writeBridgeNote;
  /** Where a reconnect's reasons go: the person is not interrupted by a background attempt. */
  readonly log: (message: string) => void;
}

/** The words the person sees once a bridge is open: what works on the server, and the one thing that does not. */
export const SCOPED_BRIDGE_OPEN = (serverName: string, count: number): string =>
  `Remote Bridge open to "${serverName}": ${count} ${count === 1 ? 'entry' : 'entries'} in its scope. On the server, creds and creds-mcp find it by themselves; nothing to paste.`;

/** Where a connection's reasons go: to the person on the first open, to the log on a reconnect. */
interface Tell {
  warn(message: string): void;
  error(message: string): void;
}

const toPerson: Tell = {
  warn: (message) => void vscode.window.showWarningMessage(message),
  error: (message) => void vscode.window.showErrorMessage(message),
};

const toLog = (log: (message: string) => void): Tell => ({ warn: (message) => log(message), error: (message) => log(message) });

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

/** What one connection's start needs to know, besides the credential. */
interface StartPlan {
  readonly accountId: string;
  readonly node: { id: string; name: string };
  readonly details: EntityMetadata;
  readonly id: string;
  readonly port: number;
  readonly remotePath: string;
  readonly tell: Tell;
  /** The person's own open may ask them (a click, a PIN); a reconnect in the background never does: it opens only what the vault already grants. */
  readonly interactive: boolean;
}

/** Starts the connection's ssh with a ready credential and hands back the note's one-shot ssh; `undefined` (and the reason told) when it cannot. */
function startOn(host: ScopedBridgeHost, plan: StartPlan, credential: CallAuth, keepNote: (call: { argv: string[]; env: NodeJS.ProcessEnv }) => void): OpenBridge | undefined {
  if (credential.warning !== undefined) {
    plan.tell.warn(credential.warning);
  }
  return credential.ok ? startReady(host, plan, credential, keepNote) : refused(plan, credential.message);
}

function refused(plan: StartPlan, message: string): undefined {
  plan.tell.error(`Cannot bridge to "${plan.node.name}": ${message}`);
  return undefined;
}

function startReady(host: ScopedBridgeHost, plan: StartPlan, credential: ReadyCall, keepNote: (call: { argv: string[]; env: NodeJS.ProcessEnv }) => void): OpenBridge | undefined {
  // Each call names the pin file of its call in place (the guard T11 reads the argument): both ssh read the entry's pinned host key.
  const base = { port: plan.port, remote: { path: plan.remotePath }, keyPath: credential.keyPath, auth: credential.auth };
  const argv = buildBridgeArgv(plan.details, { ...base, knownHostsFile: credential.knownHostsFile }, isSafeSshTarget);
  const noteArgv = buildNoteArgv(plan.details, { ...base, knownHostsFile: credential.knownHostsFile }, isSafeSshTarget, plan.id);
  if (argv === undefined || noteArgv === undefined) {
    plan.tell.warn(`"${plan.node.name}" cannot be bridged: its host is not a shape ssh can be given safely.`);
    return undefined;
  }
  keepNote({ argv: noteArgv, env: credential.env });
  return host.bridges.start(entityKey(plan.accountId, plan.node.id), plan.remotePath, 'ssh', argv, credential.env);
}

/**
 * One connection of a bridge: a fresh id, so a fresh socket path and a fresh listener with a fresh key; the forward started; the note
 * NOT yet written (the session publishes it, after its own checks). The listener closes when the forward's ssh ends, whatever ends it.
 * `undefined`, with the reason told, when any step fails; nothing is left half open.
 */
export async function connectScoped(host: ScopedBridgeHost, accountId: string, node: { id: string; name: string }, details: EntityMetadata, first: boolean): Promise<BridgeConnection | undefined> {
  const tell = first ? toPerson : toLog(host.log);
  const id = bridgeId(() => crypto.randomUUID());
  const listener = await host.agentServer.openBridgeListener({ bridgeId: id, accountId, serverEntityId: node.id, serverName: node.name, target: targetOf(details), remoteOs: details.terminalOs });
  const remotePath = remoteSocketPath(details.user ?? '', id);
  const started = await startConnection(host, { accountId, node, details, id, port: listener.port, remotePath, tell, interactive: first });
  if (started === undefined) {
    await listener.close();
    return undefined;
  }
  return connectionOf(host, started, { listener, remotePath, node, tell, brokerPort: host.agentServer.listeningPort });
}

/** `user@host:port`, as the bridge's context names its target. */
function targetOf(details: EntityMetadata): string {
  return `${details.user ?? ''}@${details.host ?? ''}:${details.port ?? 22}`;
}

/** The forward's ssh started with the entry's credential, and the note's one-shot ssh that goes with it; `undefined` when either is missing. */
async function startConnection(host: ScopedBridgeHost, plan: StartPlan): Promise<{ readonly bridge: OpenBridge; readonly note: { argv: string[]; env: NodeJS.ProcessEnv } } | undefined> {
  const { details } = plan; // by this name: the guard QS (`personRoadsPin.test.ts`) reads the pin writer's argument
  let note: { argv: string[]; env: NodeJS.ProcessEnv } | undefined;
  const bridge = await withWrittenKeyUntilExit(
    await host.resolve(host.storage, plan.accountId, details, host.storageDir, plan.interactive ? clickOpener(host.storage, plan.accountId, 'connect') : grantedOpener(plan.accountId)),
    personPinWriter(host.storageDir, details),
    (credential) => startOn(host, plan, credential, (call) => {
      note = call;
    }),
  );
  return bridge === undefined || note === undefined ? undefined : { bridge, note };
}

/** What the session holds of one connection. The listener closes when the forward's ssh ends, whatever ends it. */
function connectionOf(
  host: ScopedBridgeHost,
  started: { readonly bridge: OpenBridge; readonly note: { argv: string[]; env: NodeJS.ProcessEnv } },
  at: { readonly listener: BridgeListener; readonly remotePath: string; readonly node: { name: string }; readonly tell: Tell; readonly brokerPort: number },
): BridgeConnection {
  const { listener, remotePath, node, tell, brokerPort } = at;
  const exited = started.bridge.process.exited.then(() => listener.close(), () => listener.close());
  host.refresh();
  return {
    remotePath,
    exited,
    stop: () => {
      host.bridges.stopBridge(started.bridge);
      void listener.close();
    },
    publish: async () => {
      const written = await host.writeNote(noteOf(remotePath, listener, brokerPort, node.name), started.note.argv, started.note.env);
      if (!written.ok) {
        tell.error(`The bridge to "${node.name}" was closed again: its note could not be written on the server (${written.reason}).`);
      }
      return written;
    },
  };
}

/**
 * The person's open: the scope pick, then a session of its own whose first connection must succeed. The socket's path when the bridge
 * is open, for the caller's check of its real permissions on the server; `undefined` when it is not (the reason was shown).
 */
export async function openScopedBridge(host: ScopedBridgeHost, accountId: string, node: { id: string; name: string }, details: EntityMetadata): Promise<{ readonly remotePath: string } | undefined> {
  const picked = await pickScope(host, accountId, node);
  if (picked === undefined) {
    return undefined;
  }
  await host.scopes.set(accountId, node.id, picked.ids, false, picked.revision);
  const opened = await host.sessions.open(entityKey(accountId, node.id), (first) => connectScoped(host, accountId, node, details, first));
  if (opened === 'owned-elsewhere') {
    void vscode.window.showWarningMessage(`Another VS Code window holds the bridge to "${node.name}". Close it there first; this window does not take it over.`);
    return undefined;
  }
  host.refresh();
  if (opened !== undefined) {
    void vscode.window.showInformationMessage(SCOPED_BRIDGE_OPEN(node.name, picked.ids.length));
  }
  return opened;
}

/**
 * Bring back the bridges the person opened and did not Close (D8): after a reload or a reboot, at activation and again at every unlock.
 * Each comes back in the background (no person is asked; a failed attempt is retried with backoff). A bridge this window already keeps is
 * left alone; one whose entry is not readable yet (the vault not open) is skipped, not forgotten: the next unlock tries again.
 */
export async function restoreScopedBridges(host: ScopedBridgeHost, optIns: Pick<BridgeOptIns, 'list'>): Promise<void> {
  for (const optIn of optIns.list()) {
    await restoreOne(host, optIn);
  }
}

async function restoreOne(host: ScopedBridgeHost, optIn: OptIn): Promise<void> {
  const key = entityKey(optIn.accountId, optIn.serverId);
  const node = host.storage.getNode(optIn.accountId, optIn.serverId);
  if (host.sessions.has(key) || node?.details === undefined) {
    return;
  }
  const details = node.details;
  const restored = await host.sessions.restore(key, () => connectScoped(host, optIn.accountId, { id: node.id, name: node.name }, details, false));
  host.log(restoredWords(restored, node.name));
}

function restoredWords(restored: boolean, name: string): string {
  return restored ? `restoring the bridge to "${name}"` : `the bridge to "${name}" is kept by another window`;
}
