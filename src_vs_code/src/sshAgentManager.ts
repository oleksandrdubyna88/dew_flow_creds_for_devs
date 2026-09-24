import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SignPurpose, describePurpose, describeUnknownShape } from './sshAgentProtocol';
import { localRequestTimeLine } from './requestTime';
import { withTimeout } from './withTimeout';
import { AgentKey, SshAgentServer, agentSocketPath } from './sshAgentServer';
import { parseSshPrivateKey } from './sshKeyParse';
import {
  ALLOW_ONCE,
  ALLOW_WINDOW,
  CONSENT_TIMEOUT_MS,
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
    /**
     * Called on both edges of the agent's life with its address, or `undefined` once it stops.
     *
     * <p>The window announces itself in a file a terminal — including one inside WSL, which
     * cannot open a Windows pipe and needs a relay pointed at it — reads to find this agent
     * without being told a pid. An address published once at startup would be a lie for most of
     * the session, because the agent runs only while a key is loaded.</p>
     */
    private readonly onAddressChanged: (socketPath: string | undefined) => void = () => undefined,
    /** What time it is — an argument so a test about the prompt's time can stop the clock (#131). */
    private readonly clock: () => Date = () => new Date(),
    /** How long the signing prompt waits before it refuses — the broker's bound; tests shorten it. */
    private readonly consentTimeoutMs: number = CONSENT_TIMEOUT_MS,
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
      confirm: (key, purpose, data) => this.confirm(key, purpose, data),
      log: (message) => this.log(message),
    });
    await server.listen();
    this.server = server;
    // Every terminal opened afterwards finds the agent with no configuration at all.
    this.envCollection.replace('SSH_AUTH_SOCK', socketPath);
    this.envCollection.description = 'CredsForDevs: secrets exposed as terminal variables';
    this.onAddressChanged(socketPath);
    this.log(`agent listening on ${socketPath}`);
  }

  private stop(): void {
    this.server?.dispose();
    this.server = undefined;
    this.envCollection.delete('SSH_AUTH_SOCK');
    this.onAddressChanged(undefined);
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
  /**
   * The one case the dialog cannot describe, written down so it can be answered afterwards.
   *
   * <p>Its own method rather than a branch inside `confirm`, which is at the complexity the
   * linter allows — and because "what we could not describe" is a separate thing to read from
   * "how consent is asked".</p>
   */
  private noteUnknown(purpose: SignPurpose, data: Buffer): void {
    if (purpose.kind === 'unknown') {
      this.log(`unrecognised signing request: ${describeUnknownShape(data)}`);
    }
  }

  private async confirm(key: AgentKey, purpose: SignPurpose, data: Buffer): Promise<boolean> {
    // When the signature was asked for, taken as it enters: the prompt has no timeout, so one found
    // an hour later still signs — and the time on it is what says how old the request is (#131).
    const asked = this.clock();
    // The grant's ten minutes still start at the CLICK (`this.clock()` below), as agentConsent.ts
    // documents — the time on the prompt and the start of the window are two facts on purpose.
    this.noteUnknown(purpose, data);
    if (withinAllowWindow(this.allowedUntil.get(key.entityId), asked.getTime())) {
      this.log(`allowed (within the 10-minute window) for ${describePurpose(purpose)}`);
      return true;
    }
    const choice = await this.askToSign(key, purpose, asked);
    // What the answer MEANS is `agentConsent.ts` — pure, and therefore tested. What is left
    // here is applying it: the presence signal and the remembered window.
    const decision = consentFromChoice(choice, this.clock().getTime());
    if (decision.present) {
      this.onUserPresent();
    }
    if (decision.allowedUntil !== undefined) {
      this.allowedUntil.set(key.entityId, decision.allowedUntil);
    }
    return decision.allow;
  }

  /**
   * The prompt itself, bounded by the broker's consent timeout: unanswered, it refuses — before
   * #131's tail it waited forever, so a prompt found an hour later still signed and the `ssh` or
   * `git` that asked hung. A click after the bound changes nothing (VS Code cannot close a modal, so
   * it can still be clicked): `withTimeout` has already answered `undefined`, which is a dismissal.
   *
   * <p>The answer is wrapped so a timeout (no wrapper) can be told from Escape (a wrapper around
   * `undefined`) — only the timeout gets a line in the log. The timer is NOT unref'd: the extension
   * host outlives it anyway, and an unref'd timer ends a test run that has nothing else alive
   * (see `withTimeout.ts`).</p>
   */
  private async askToSign(key: AgentKey, purpose: SignPurpose, asked: Date): Promise<string | undefined> {
    const minutes = Math.round(this.consentTimeoutMs / 60_000);
    const modal = vscode.window.showWarningMessage(
      `Use the SSH key "${key.name}" to sign ${describePurpose(purpose)}?\n${localRequestTimeLine(asked)}\n\n` +
        `${key.fingerprint}\n\n` +
        'The key itself never leaves this window. Allow once, or allow every use of this key for ' +
        'ten minutes — long enough for a push that signs and authenticates in one go. ' +
        `Unanswered, it is refused after ${minutes} minutes.`,
      { modal: true },
      ALLOW_ONCE,
      ALLOW_WINDOW,
      DENY,
    );
    const answered = await withTimeout(Promise.resolve(modal).then((choice) => ({ choice })), this.consentTimeoutMs);
    if (answered === undefined) {
      this.log(`no answer in ${minutes} minutes — refused ${describePurpose(purpose)}`);
    }
    return answered?.choice;
  }

  private log(message: string): void {
    this.output ??= vscode.window.createOutputChannel('CredsForDevs: SSH Agent');
    this.output.appendLine(`${new Date().toISOString()} ${message}`);
  }

  /** Whether this entity's key would be served by the agent rather than written to disk. */
  servesKeyFor(node: TreeNode): boolean {
    return node.details !== undefined && this.servesKeyForEntity(node.details);
  }

  /**
   * The same question asked of the entity alone.
   *
   * <p>The broker's terminal action holds an `EntityMetadata` and no tree node, and it reaches the
   * same connect path as the tree's button — so it needs this answer too, or in a WSL window its
   * route refuses as `agent-has-no-key` while the agent is in fact serving the key. Widened rather
   * than copied: the node variant was already only reading `details`.</p>
   */
  servesKeyForEntity(details: EntityMetadata): boolean {
    return this.keys.has(details.sshKeyEntityId ?? details.id);
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
