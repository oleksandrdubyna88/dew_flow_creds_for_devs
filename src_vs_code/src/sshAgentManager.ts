import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SignPurpose, describePurpose } from './sshAgentProtocol';
import { AgentKey, SshAgentServer, agentSocketPath } from './sshAgentServer';
import { parseSshPrivateKey } from './sshKeyParse';
import {
  ALLOW_ONCE,
  ALLOW_WINDOW,
  DENY,
  consentFromChoice,
  withinAllowWindow,
} from './agentConsent';
import { signForAgent } from './sshAgentSign';
import { StorageManager } from './storageManager';
import { materializedKeyPath } from './materializedKeys';
import { EntityMetadata, TreeNode } from './types';

/**
 * The editor's half of the SSH agent: which keys are loaded, the modal in front of every
 * signature, and the `SSH_AUTH_SOCK` that makes `ssh` and `git` find it.
 *
 * <p>Key material lives in this object's memory for as long as a key is loaded, and NOWHERE
 * else — the point of the feature is that no file with mode 0600 exists to be read, copied or
 * left behind by a crash. `dispose()` drops it with the window, which is also the whole
 * revocation story, exactly as it is for the agent broker's grants.</p>
 *
 * <p><b>The confirmation is per use and cannot be made sticky by accident.</b> "Allow for 10
 * minutes" exists because `git push` signs and authenticates in one breath and two modals per
 * push would teach people to click without reading; it is per KEY, it is remembered in memory
 * only, and it is stated in the dialog rather than implied.</p>
 */

/**
 * Best-effort removal of the POSIX socket file. Windows named pipes have no file to remove,
 * and on POSIX the directory `purgeMaterializedKeys` sweeps covers it anyway — this just makes
 * the common case tidy rather than waiting for the next activate.
 */
function removeSocketFile(storageDir: string): void {
  if (process.platform === 'win32') {
    return;
  }
  try {
    fs.rmSync(materializedKeyPath(storageDir, 'agent.sock'), { force: true });
  } catch {
    // best effort — the purge covers it
  }
}

interface LoadedKey extends AgentKey {
  accountId: string;
  publicLine: string;
}

export class SshAgentManager implements vscode.Disposable {
  private server: SshAgentServer | undefined;
  private readonly keys = new Map<string, LoadedKey>();
  /** entityId -> the moment a blanket allow expires. In memory only, by design. */
  private readonly allowedUntil = new Map<string, number>();
  private output: vscode.OutputChannel | undefined;

  constructor(
    private readonly storage: StorageManager,
    private readonly storageDir: string,
    private readonly envCollection: vscode.GlobalEnvironmentVariableCollection,
    /** Called when a human answers a dialog — the one moment presence is provable. */
    private readonly onUserPresent: () => void,
  ) {}

  get socketPath(): string | undefined {
    return this.server?.socketPath;
  }

  /** The keys currently served, for a status line or a picker. */
  loadedKeys(): Array<{ entityId: string; name: string; fingerprint: string; publicLine: string }> {
    return [...this.keys.values()].map((k) => ({
      entityId: k.entityId,
      name: k.name,
      fingerprint: k.fingerprint,
      publicLine: k.publicLine,
    }));
  }

  isLoaded(entityId: string): boolean {
    return this.keys.has(entityId);
  }

  /**
   * Read a key out of the vault and serve it. Returns what to tell the user — the fingerprint
   * on success, the reason on failure, because "could not load the key" is not actionable and
   * every reason `parseSshPrivateKey` gives is.
   */
  async load(accountId: string, details: EntityMetadata): Promise<{ ok: true; fingerprint: string } | { ok: false; reason: string }> {
    const content = await this.storage.getPrivateKey(accountId, details.id);
    if (content === undefined || content.trim().length === 0) {
      return {
        ok: false,
        reason: `"${details.name}" has no private key stored in the vault. Open Edit and paste it, or point the entity at a key file (which the agent cannot serve).`,
      };
    }
    const parsed = parseSshPrivateKey(content, details.name);
    if (!parsed.ok) {
      return { ok: false, reason: `"${details.name}" cannot be served: ${parsed.reason}` };
    }
    const key = parsed.key;
    this.keys.set(details.id, {
      accountId,
      entityId: details.id,
      name: details.name,
      fingerprint: key.fingerprint,
      publicLine: key.publicLine,
      identity: { publicBlob: key.publicBlob, comment: details.name },
      sign: (data, flags) => signForAgent(key, data, flags),
    });
    await this.ensureStarted();
    this.log(`loaded "${details.name}" (${key.fingerprint})`);
    return { ok: true, fingerprint: key.fingerprint };
  }

  /** Stop serving one key. Its material goes with it. */
  unload(entityId: string): boolean {
    const key = this.keys.get(entityId);
    if (key === undefined) {
      return false;
    }
    this.keys.delete(entityId);
    this.allowedUntil.delete(entityId);
    this.log(`unloaded "${key.name}"`);
    if (this.keys.size === 0) {
      this.stop();
    }
    return true;
  }

  /** Whether this node is a key entity that asks to be served and is not loaded yet. */
  private wants(node: TreeNode): boolean {
    const details = node.details;
    return node.type === 'entity' && details?.sshAgent === true && !this.keys.has(details.id);
  }

  /** Every entity across all accounts that asks to be served but is not yet loaded. */
  private markedButUnloaded(): Array<{ accountId: string; details: EntityMetadata }> {
    return this.storage.getAccounts().flatMap((account) =>
      this.storage
        .getNodes(account.accountId)
        .filter((node) => this.wants(node))
        .map((node) => ({ accountId: account.accountId, details: node.details as EntityMetadata })),
    );
  }

  /** Re-load every key an account marks `sshAgent`, at startup and after a sync. */
  async loadMarked(): Promise<number> {
    let loaded = 0;
    for (const { accountId, details } of this.markedButUnloaded()) {
      const result = await this.load(accountId, details);
      if (result.ok) {
        loaded += 1;
      } else {
        // Said once, in the channel: a key that stopped being loadable must not open a modal
        // at every window start.
        this.log(`could not load "${details.name}": ${result.reason}`);
      }
    }
    return loaded;
  }

  private async ensureStarted(): Promise<void> {
    if (this.server?.listening === true) {
      return;
    }
    const socketPath = agentSocketPath(this.storageDir, process.platform, process.pid);
    if (process.platform !== 'win32') {
      // The socket lives in the per-window key directory, which activate/deactivate purges —
      // so a crashed window leaves no live socket, only a dead file its own purge removes.
      fs.mkdirSync(path.dirname(socketPath), { recursive: true, mode: 0o700 });
      fs.rmSync(socketPath, { force: true });
    }
    const server = new SshAgentServer({
      socketPath,
      keys: () => [...this.keys.values()],
      confirm: (key, purpose) => this.confirm(key, purpose),
      log: (message) => this.log(message),
    });
    await server.listen();
    this.server = server;
    // Every terminal opened afterwards finds the agent with no configuration at all.
    this.envCollection.replace('SSH_AUTH_SOCK', socketPath);
    this.envCollection.description = 'CredsForDevs: secrets exposed as terminal variables';
    this.log(`agent listening on ${socketPath}`);
  }

  private stop(): void {
    this.server?.dispose();
    this.server = undefined;
    this.envCollection.delete('SSH_AUTH_SOCK');
    this.log('agent stopped — no keys are loaded');
  }

  /**
   * The dialog in front of every signature.
   *
   * <p>It names the key, its fingerprint and what is being signed, because "a key is being
   * used" is not a decision anybody can make. A dismissed dialog refuses this one signature
   * and remembers nothing — the same rule the broker's consent follows, for the same reason: a
   * mis-click must not lock a key out for the window's life.</p>
   */
  private async confirm(key: AgentKey, purpose: SignPurpose): Promise<boolean> {
    if (withinAllowWindow(this.allowedUntil.get(key.entityId), Date.now())) {
      this.log(`allowed (within the 10-minute window) for ${describePurpose(purpose)}`);
      return true;
    }
    const choice = await vscode.window.showWarningMessage(
      `Use the SSH key "${key.name}" to sign ${describePurpose(purpose)}?\n\n` +
        `${key.fingerprint}\n\n` +
        'The key itself never leaves this window. Allow once, or allow every use of this key for ' +
        'ten minutes — long enough for a push that signs and authenticates in one go.',
      { modal: true },
      ALLOW_ONCE,
      ALLOW_WINDOW,
      DENY,
    );
    // What the answer MEANS is `agentConsent.ts` — pure, and therefore tested. What is left
    // here is applying it: the presence signal and the remembered window.
    const decision = consentFromChoice(choice, Date.now());
    if (decision.present) {
      this.onUserPresent();
    }
    if (decision.allowedUntil !== undefined) {
      this.allowedUntil.set(key.entityId, decision.allowedUntil);
    }
    return decision.allow;
  }

  private log(message: string): void {
    this.output ??= vscode.window.createOutputChannel('CredsForDevs: SSH Agent');
    this.output.appendLine(`${new Date().toISOString()} ${message}`);
  }

  /** Whether this entity's key would be served by the agent rather than written to disk. */
  servesKeyFor(node: TreeNode): boolean {
    const details = node.details;
    if (details === undefined) {
      return false;
    }
    const keyEntityId = details.sshKeyEntityId ?? details.id;
    return this.keys.has(keyEntityId);
  }

  dispose(): void {
    this.keys.clear();
    this.allowedUntil.clear();
    this.server?.dispose();
    this.server = undefined;
    this.output?.dispose();
    removeSocketFile(this.storageDir);
  }
}
