import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  SignPurpose,
  describePurpose,
  describePurposeForLog,
  describeServerLine,
  describeUnknownShape,
  MAX_DISPLAY,
  displayText,
  withoutControlChars,
} from './sshAgentProtocol';
import { localRequestTimeLine, localWallTime } from './requestTime';
import { unrefTimer } from './withTimeout';
import { ConsentTurns, RefusalKind, TurnOutcome } from './consentTurns';
import { CROSSING_NOTICE, durationText, refusalLine } from './sshAgentTexts';
import { describeError } from './describeError';
import { AgentKey, SshAgentServer, agentSocketPath } from './sshAgentServer';
import { ParsedSshKey, parseSshPrivateKey } from './sshKeyParse';
import { SecretOpener } from './secretOpener';
import { automaticOpenerFor } from './automaticRead';
import { ALLOW_WINDOW, CONSENT_TIMEOUT_MS, SIGNING_BUTTONS, consentFromChoice } from './agentConsent';
import {
  ALL_ONLY,
  AllowWindows,
  AskTicket,
  NO_WINDOWS,
  OpenWindow,
  ScopeWindows,
  askTicket,
  GrantOutcome,
  KeyRef,
  endAllWindows,
  endWindows,
  forgetKey,
  grantWindow,
  nextExpiry,
  windowCovers,
  windowsFor as windowsInBook,
  withEndOnBothClocks,
  withoutExpired,
} from './allowWindows';
import { signForAgent } from './sshAgentSign';
import { StorageManager } from './storageManager';
import { materializedKeyPath } from './materializedKeys';
import { EntityMetadata, TreeNode } from './types';

/**
 * How long the expiry timer may sleep (#197, E2.2). The row repaints when a window ends; a timer armed for the
 * full ten minutes would sleep through a wall clock that jumped (a laptop waking), so it looks every five at most.
 */
const EXPIRY_LOOK_MS = 5 * 60_000;

/**
 * What the agent log says when a timed answer crossed something (#197, E2.1/E2.2): the key was removed or replaced
 * while the prompt was open, or the vault was locked, or *Ask for Every Use Again* was used. The last two still
 * allow the ONE signature; none opens a window. The record must say which, because the outcome differs from the
 * click the person made. The information message that tells the person is E2.3's.
 */
const CROSSED_LINE: Readonly<Partial<Record<GrantOutcome, string>>> = {
  'stale-key': 'answered after the key was removed or replaced — no window was opened',
  'fenced-key': `answered "${ALLOW_WINDOW}" after Ask for Every Use Again — signed once, no window was opened`,
  'fenced-lock': `answered "${ALLOW_WINDOW}" after the vaults were locked — signed once, no window was opened`,
};

/** Both of the window book's clocks at one instant: the wall clock and the monotonic one. */
interface Moment {
  readonly wall: number;
  readonly mono: number;
}

/**
 * The editor's half of the SSH agent: which keys are loaded, the modal in front of every
 * signature no open window covers, and the `SSH_AUTH_SOCK` that makes `ssh` and `git` find it.
 *
 * <p>Key material lives in this object's memory for as long as a key is loaded, and NOWHERE
 * else — the point of the feature is that no file with mode 0600 exists to be read, copied or
 * left behind by a crash. `dispose()` drops it with the window, as it does for the agent
 * broker's grants. Revocation is also `revoke()` on the key object, called by `unload()`, by a
 * later `load` of the same entity and by `dispose()`, so a holder that kept the object cannot
 * sign with it (#197).</p>
 *
 * <p><b>The confirmation is per use, unless the person opens a window — and a window cannot be opened by
 * accident.</b> "Allow for 10
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

/** The opened key, parsed — or the reason it cannot be served, in the words the person is told. */
function parsedKey(content: string | undefined, name: string): { ok: true; key: ParsedSshKey } | { ok: false; reason: string } {
  if (content === undefined || content.trim().length === 0) {
    return {
      ok: false,
      reason: `"${name}" has no private key stored in the vault. Open Edit and paste it, or point the entity at a key file (which the agent cannot serve).`,
    };
  }
  const parsed = parseSshPrivateKey(content, name);
  return parsed.ok ? { ok: true, key: parsed.key } : { ok: false, reason: `"${name}" cannot be served: ${parsed.reason}` };
}

interface LoadedKey extends AgentKey {
  accountId: string;
  publicLine: string;
  /**
   * Which load of this entity this object is (#197, I2): a number from `serve`, never reused. A window is
   * granted to one generation and covers no other, so a key re-loaded under the same id inherits nothing.
   */
  generation: number;
  /**
   * End this object's right to sign, for good (#197, I1). Called when the key is unloaded, replaced by a
   * later `load` of the same entity, or the manager is disposed — so a holder that kept the object (a
   * prompt that was open meanwhile) cannot sign with it, whatever it was answered. By object, never by
   * public bytes: a replacement with identical bytes is a different object and revokes the old one.
   */
  revoke(): void;
}

export class SshAgentManager implements vscode.Disposable {
  private server: SshAgentServer | undefined;
  private readonly keys = new Map<string, LoadedKey>();
  /**
   * The open "allow without asking" windows — `allowWindows.ts` holds the rules. In memory only, by design.
   * Replaced, never mutated: the book is an immutable value.
   */
  private windows: AllowWindows = NO_WINDOWS;
  /** The timer that repaints the row when the nearest window ends; re-armed by every change of the book. */
  private expiry: ReturnType<typeof setTimeout> | undefined;
  /** The last generation `serve` handed out. */
  private generations = 0;
  /** Monotonic time for the window book's second clock (see `monotonicSource`). */
  private readonly monotonic: () => number;
  /** One prompt per key at a time: the queue, the cap, the floor, the orphaned-modal slot (`consentTurns.ts`). */
  private readonly turns: ConsentTurns;
  private output: vscode.OutputChannel | undefined;
  /** Set by `dispose()` for good: the log is closed with the window. */
  private disposed = false;
  /**
   * Told whenever the book of windows changes — a grant, an expiry, a lock, the row button, an unload — so the
   * key's row can repaint (#197, E2.2). A FIELD with a no-op default, not a constructor parameter: the
   * constructor is at the complexity limit, and `sshAgentWiring.ts` sets it to the tree's refresh.
   */
  onWindowsChanged: () => void = () => undefined;

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
    /**
     * Monotonic milliseconds — the window book's second clock, so a wall clock set back after a grant cannot
     * stretch it. Optional with NO default: a defaulted parameter is a branch for the complexity rule, and the
     * constructor is at the limit. A test hands one in; production reads `performance.now()`.
     */
    monotonic?: () => number,
  ) {
    this.monotonic = monotonicSource(monotonic);
    this.turns = new ConsentTurns(this.consentTimeoutMs, this.monotonic);
  }

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
   *
   * <p>`open` is how the stored key is opened (entry-PIN plan, D6/D7): the startup sweep takes the
   * default, `automaticOpenerFor`, which refuses a protected key with the PIN sentence and never
   * prompts; the *Add Key to Agent* click passes a click opener, which asks that entry's PIN. A
   * click's stop comes back with `reason: ''` — it has been said already, or the person declined.
   * Until 1.12 both parsed the envelope and said the key "could not be read".</p>
   */
  async load(
    accountId: string,
    details: EntityMetadata,
    open: SecretOpener = automaticOpenerFor(this.storage, accountId),
  ): Promise<{ ok: true; fingerprint: string } | { ok: false; reason: string }> {
    const opened = await open(details, await this.storage.getPrivateKey(accountId, details.id), undefined);
    if (opened.kind === 'stopped') {
      return { ok: false, reason: opened.reason };
    }
    const parsed = parsedKey(opened.value, details.name);
    if (!parsed.ok) {
      return parsed;
    }
    this.serve(accountId, details, parsed.key);
    await this.ensureStarted();
    this.log(`loaded "${details.name}" (${parsed.key.fingerprint})`);
    return { ok: true, fingerprint: parsed.key.fingerprint };
  }

  private serve(accountId: string, details: EntityMetadata, key: ParsedSshKey): void {
    // A key loaded again under the same id replaces the old object, which must stop signing at once.
    this.keys.get(details.id)?.revoke();
    // And it is a new generation: it inherits no window, however it got here (first load, re-load, restart).
    this.setWindows(forgetKey(this.windows, details.id));
    this.keys.set(details.id, {
      generation: ++this.generations,
      accountId,
      entityId: details.id,
      name: details.name,
      fingerprint: key.fingerprint,
      publicLine: key.publicLine,
      identity: { publicBlob: key.publicBlob, comment: details.name },
      ...this.signing(key, details.name),
    });
  }

  /**
   * The signing half of one served key: `sign` until `revoke`, and a logged refusal after it. The revoked
   * handle lets go of the parsed key too, so an object kept past its life holds no material to misuse.
   * The server's own "could not sign (unsupported request)" cannot say this — `signForAgent` also returns
   * `undefined` for a key or a flag it cannot sign.
   *
   * <p><b>What this does NOT do — a memory limit, stated.</b> After unload, replace or dispose the key
   * object cannot sign and drops its reference to the parsed key. But the parsed key (a Node `KeyObject`)
   * and the PEM text read from SecretStorage stay in the heap until the garbage collector runs: a
   * `KeyObject` cannot be zeroed and a JS string cannot be overwritten. That is weaker than
   * `vaultKeys.lock()`, which wipes a Buffer the extension owns, and it is so by construction.</p>
   */
  private signing(key: ParsedSshKey, name: string): Pick<LoadedKey, 'sign' | 'revoke'> {
    let material: ParsedSshKey | undefined = key;
    return {
      sign: (data, flags) => {
        if (material === undefined) {
          this.log(`refused to sign with "${name}": the key was removed or replaced`);
          return undefined;
        }
        return signForAgent(material, data, flags);
      },
      revoke: () => {
        material = undefined;
      },
    };
  }

  /** Stop serving one key. Its material goes with it. */
  unload(entityId: string): boolean {
    const key = this.keys.get(entityId);
    if (key === undefined) {
      return false;
    }
    key.revoke();
    this.keys.delete(entityId);
    this.setWindows(forgetKey(this.windows, entityId));
    this.log(`unloaded "${key.name}"`);
    if (this.keys.size === 0) {
      this.stop();
    }
    return true;
  }

  /**
   * Any lock of the vault: every window ends, and an answer given across the lock opens none (`fenced-lock`).
   * One method per meaning (E1.2's judgement): this never calls `revoke` and never touches `keys` — the keys stay
   * loaded and the next signature asks again; only `serve`, `unload` and `dispose` end a key's right to sign.
   */
  endAllWindows(reason: string): void {
    this.setWindows(endAllWindows(this.windows));
    // Every lock reaches here, so a person who never loaded a key must not get a log channel of their own on
    // their first lock: the epoch always moves, the line is for the agent that has keys to answer for.
    if (this.keys.size > 0) {
      this.log(`every signing window ended: ${reason}`);
    }
  }

  /**
   * *Ask for Every Use Again* on the key's row: this key's windows end, and an answer being given right now
   * opens none (`fenced-key`). Answers whether a window was really open — the fence moves either way (I3) and
   * is not a window: `had` reads what the gate would honour, never the book's raw entries. Like `endAllWindows`
   * this never revokes and never unloads: the key stays loaded and the next signature asks.
   */
  endWindows(entityId: string): boolean {
    const had = Object.keys(this.liveWindows(entityId, this.moment())).length > 0;
    this.setWindows(endWindows(this.windows, entityId));
    this.log(`Ask for Every Use Again: ${had ? 'ended the window of' : 'no open window on'} "${this.nameOf(entityId)}"`);
    return had;
  }

  /**
   * The windows the gate would honour for the key on this tree row — what the row shows. Scoped by account: the
   * tree asks per (account, node) and the manager keys by the bare entity id, so a key loaded under another
   * account answers `{}`. Never the book's raw `open` map, which holds windows a clock has already ended.
   *
   * <p>Each window's `until` is where it ends on BOTH clocks — the earlier of its wall deadline and where the
   * monotonic clock puts it (`withEndOnBothClocks`) — so a row never promises more than the gate will honour
   * after a wall clock set back (E2.2 review L1).</p>
   */
  windowsFor(accountId: string, entityId: string): ScopeWindows {
    if (this.keys.get(entityId)?.accountId !== accountId) {
      return {};
    }
    const at = this.moment();
    return withEndOnBothClocks(this.liveWindows(entityId, at), at.wall, at.mono);
  }

  /** The windows of this key that cover a request at `at`, on BOTH clocks (the gate's own rule). */
  private liveWindows(entityId: string, at: Moment): ScopeWindows {
    const generation = this.generationOf(entityId);
    return generation === undefined ? {} : windowsInBook(this.windows, { entityId, generation }, ALL_ONLY, at.wall, at.mono);
  }

  private nameOf(entityId: string): string {
    return this.keys.get(entityId)?.name ?? entityId;
  }

  /**
   * THE one place the book is replaced. A new book is a change: the row is told to repaint (`onWindowsChanged`,
   * unless the manager is gone), and the expiry timer is armed again for whatever is nearest to ending.
   */
  private setWindows(next: AllowWindows, at?: Moment): void {
    const changed = next !== this.windows;
    this.windows = next;
    if (changed && !this.disposed) {
      this.onWindowsChanged();
    }
    this.arm(at);
  }

  /** Both clocks, read side by side — what the book's rules are asked with. */
  private moment(): Moment {
    return { wall: this.clock().getTime(), mono: this.monotonic() };
  }

  /**
   * Clear the old timer, then sleep until the nearest window ends — never longer than `EXPIRY_LOOK_MS`. With no
   * window open it reads NO clock: the gate's "one reading of the clock at the click" counts reads, and a load
   * or an unload with nothing open has nothing to time. `at` is the caller's own reading when it has one.
   */
  private arm(at?: Moment): void {
    clearTimeout(this.expiry);
    this.expiry = this.windows.open.size === 0 ? undefined : this.timerFor(at ?? this.moment());
  }

  /**
   * A book that holds something always gets a look. When nothing is left to wait for (`nextExpiry` finds no end
   * ahead) yet the book still holds a window — a clock jump ended it between two looks — the look is at once, so
   * the entry is dropped and the row repainted instead of both lingering until some unrelated change (E2.2 L2).
   * It cannot loop: `expired` drops every window `nextExpiry` ignores, and an empty book arms nothing.
   */
  private timerFor(at: Moment): ReturnType<typeof setTimeout> {
    const next = nextExpiry(this.windows, at.wall, at.mono);
    const delay = next === undefined ? 0 : Math.min(next - at.wall, EXPIRY_LOOK_MS);
    return unrefTimer(setTimeout(() => this.expired(), delay));
  }

  /** The timer fired: drop what ended (the same book, silently, when nothing did) and look again. */
  private expired(): void {
    const at = this.moment();
    this.setWindows(withoutExpired(this.windows, at.wall, at.mono), at);
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
      confirm: (key, purpose, data, signal) => this.confirm(key, purpose, data, signal),
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

  private generationOf(entityId: string): number | undefined {
    return this.keys.get(entityId)?.generation;
  }

  /**
   * The gate: is this signature allowed without asking, and if not, ask.
   *
   * <p><b>Arrival is read before the first `await`</b> — the time of the request, the key's generation and
   * the monotonic clock. The server hands the request over synchronously, so these are the facts of the
   * moment it came in; a generation read after the prompt would be the CURRENT one, and a key re-loaded
   * during the prompt would then look like the key that was asked about. It is read from the manager's own
   * map, not from the `AgentKey` handed in.</p>
   */
  private async confirm(key: AgentKey, purpose: SignPurpose, data: Buffer, signal: AbortSignal): Promise<boolean> {
    // When the signature was asked for, taken as it enters — the time on the prompt is what says how
    // old the request is (#131), and the prompt refuses after CONSENT_TIMEOUT_MS unanswered.
    const asked = this.clock();
    const generation = this.generationOf(key.entityId);
    const nowMono = this.monotonic();
    // The grant's ten minutes still start at the CLICK (`settle`), as agentConsent.ts documents — the
    // time on the prompt and the start of the window are two facts on purpose.
    this.noteUnknown(purpose, data);
    if (generation === undefined) {
      this.log(`"${key.name}": the key is not loaded`);
      return false;
    }
    const arrived = { entityId: key.entityId, generation };
    const covered = windowCovers(this.windows, arrived, ALL_ONLY, asked.getTime(), nowMono);
    if (covered !== undefined) {
      this.logCovered(key, purpose, covered);
      return true;
    }
    const outcome = await this.turns.take(key.entityId, signal, (turn, leftMs) =>
      this.turnStarted(key, purpose, asked, arrived, turn, leftMs),
    );
    return this.outcomeOf(key, purpose, outcome);
  }

  /**
   * The whole turn at the prompt, run when every earlier turn for this key has SETTLED. Everything the request
   * learned at arrival can have changed while it waited, so it is checked again, in this order: the key is still the
   * one asked about (E1.2's judgement — a removed key is refused without a prompt); a window an earlier turn opened
   * covers it (no second prompt); THEN the ticket (a fence that moved while it waited must not fence an answer
   * given after it is shown — the fence guards the time the prompt is on screen); then the modal.
   *
   * <p><b>After the modal, with no `await` in between:</b> a turn that ended meanwhile (`turn.aborted`) signs
   * nothing; a live one applies its answer here, inside the turn. The slot frees only when this settles, so the
   * next turn's re-check always sees the window this one opened — by construction, not by counting promise hops.
   * No timer or socket `close` can run between the check and the apply.</p>
   */
  private async turnStarted(
    key: AgentKey,
    purpose: SignPurpose,
    asked: Date,
    arrived: KeyRef,
    turn: AbortSignal,
    leftMs: number,
  ): Promise<boolean> {
    const early = this.beforePrompt(key, purpose, arrived, leftMs);
    if (early !== undefined) {
      return early;
    }
    const ticket = askTicket(this.windows, arrived);
    const choice = await this.askToSign(key, purpose, asked, leftMs);
    return turn.aborted ? this.stale(choice) : this.settle(key, ticket, choice);
  }

  /**
   * The turn's start checks: `false` (refused), `true` (a window covers it) or `undefined` (go on to the prompt).
   * The key must still be the one asked about; then a window an earlier turn opened may cover the request.
   */
  private beforePrompt(key: AgentKey, purpose: SignPurpose, arrived: KeyRef, leftMs: number): boolean | undefined {
    if (this.generationOf(key.entityId) !== arrived.generation) {
      this.log(`"${key.name}": the key was removed or re-added while the request waited — refused`);
      return false;
    }
    const covered = this.coveredAfterWaiting(arrived, leftMs);
    if (covered === undefined) {
      return undefined;
    }
    this.logCovered(key, purpose, covered);
    return true;
  }

  /**
   * The window book asked again with fresh readings of both clocks — but only for a request that WAITED (it has less
   * than the whole bound left). One that did not wait was checked at arrival, in this same synchronous breath;
   * reading the clocks twice for it would only move the gate's "one reading at the click" accounting.
   */
  private coveredAfterWaiting(arrived: KeyRef, leftMs: number): OpenWindow | undefined {
    const waited = leftMs < this.consentTimeoutMs;
    return waited ? windowCovers(this.windows, arrived, ALL_ONLY, this.clock().getTime(), this.monotonic()) : undefined;
  }

  /** What became of a request that was not answered: the log line (once per burst) and, for an orphan, a notice. */
  private outcomeOf(key: AgentKey, purpose: SignPurpose, outcome: TurnOutcome<boolean>): boolean {
    if (outcome.kind === 'answered') {
      return outcome.value;
    }
    if (outcome.first) {
      this.refused(key, purpose, outcome.kind);
    }
    return false;
  }

  private refused(key: AgentKey, purpose: SignPurpose, kind: RefusalKind): void {
    this.log(refusalLine(kind, key, purpose, durationText(this.consentTimeoutMs)));
    if (kind === 'orphaned') {
      this.tell(`A signing prompt for "${displayText(key.name, MAX_DISPLAY)}" is still open from an earlier request — answer or close it.`);
    }
  }

  /**
   * A label came back after the turn ended: nothing is signed, no presence is counted, no window opens — and the
   * person is told, because VS Code cannot close a modal and they clicked something that no longer meant anything.
   * Escape or a closed window (`undefined`) is not a click and says nothing.
   */
  private stale(choice: string | undefined): false {
    if (choice !== undefined) {
      this.tell(
        `That signing request had already been refused — it waited longer than ${durationText(this.consentTimeoutMs)}, ` +
          'or its program had gone. Nothing was signed.',
      );
    }
    return false;
  }

  /** The one door for every information message — silent once the window is gone. */
  private tell(text: string): void {
    if (!this.disposed) {
      void vscode.window.showInformationMessage(text);
    }
  }

  /** I10: a silent signature says which window allowed it, and until when. */
  private logCovered(key: AgentKey, purpose: SignPurpose, window: OpenWindow): void {
    this.log(
      `allowed without asking: 10-minute window of "${key.name}" until ${localWallTime(new Date(window.until))} ` +
        `(granted ${localWallTime(new Date(window.grantedAt))}) for ${describePurposeForLog(purpose)}`,
    );
  }

  /**
   * Apply the answer. What it MEANS is `agentConsent.ts` — pure, and therefore tested; what is left here is
   * the presence signal and the remembered window. Both clocks are read once, side by side, at the click.
   */
  private settle(key: AgentKey, ticket: AskTicket, choice: string | undefined): boolean {
    const grantedAt = this.clock().getTime();
    const grantedAtMono = this.monotonic();
    const decision = consentFromChoice(choice, grantedAt);
    if (decision.present) {
      this.onUserPresent();
    }
    if (decision.allowedUntil === undefined) {
      return decision.allow;
    }
    return this.openWindow(key, ticket, { grantedAt, grantedAtMono, until: decision.allowedUntil });
  }

  /**
   * Record a timed answer. THE one place the manager decides on a moved generation. (The book checks the
   * generation in three places — crossing, covers, liveAndLater — but only here is the outcome acted on.) It
   * says `stale-key` when the key was unloaded or re-loaded while the prompt was open, and then nothing is
   * allowed and no window opens. (An *Allow once* across the same event is refused by the server, which
   * compares the key OBJECT it asked about with the one now served.) The other two crossings, `fenced-key` (the row
   * button) and `fenced-lock` (any lock), allow this one signature and open no window.
   *
   * <p>All three are written to the agent log (`CROSSED_LINE`): each makes the outcome differ from the click the
   * person made, and a record that stayed silent about two of them could not answer "why did that window not
   * open?" afterwards.</p>
   */
  private openWindow(key: AgentKey, ticket: AskTicket, at: { grantedAt: number; grantedAtMono: number; until: number }): boolean {
    const { book, outcome } = grantWindow(this.windows, ticket, 'all', this.generationOf(key.entityId), at.grantedAt, at.grantedAtMono, at.until);
    this.setWindows(book, { wall: at.grantedAt, mono: at.grantedAtMono });
    const crossed = CROSSED_LINE[outcome];
    if (crossed !== undefined) {
      this.log(`"${key.name}": ${crossed}`);
    }
    const notice = CROSSING_NOTICE.get(outcome);
    if (notice !== undefined) {
      this.tell(notice);
    }
    return outcome !== 'stale-key';
  }

  /**
   * The dialog in front of a signature no open window covers.
   *
   * <p>It names the key, its fingerprint and what is being signed, because "a key is being
   * used" is not a decision anybody can make. A dismissed dialog refuses this one signature
   * and remembers nothing — the same rule the broker's consent follows, for the same reason: a
   * mis-click must not lock a key out for the window's life.</p>
   *
   * The prompt itself. The bound is not here any more: `ConsentTurns` times the TURN and refuses a request that
   * waits too long (before #131's tail it waited forever, so a prompt found an hour later still signed and the `ssh`
   * or `git` that asked hung). This awaits the modal to its END — a click after the turn ended still comes back
   * here, which is what lets `turnStarted` say so (VS Code cannot close a modal, so it can still be clicked).
   *
   * <p>The text says the time this request really has left (`leftMs`): the full bound for a request that did not
   * wait, less for one that waited behind another prompt.</p>
   */
  private askToSign(key: AgentKey, purpose: SignPurpose, asked: Date, leftMs: number): Promise<string | undefined> {
    const modal = vscode.window.showWarningMessage(
      `Use the SSH key "${displayText(key.name, MAX_DISPLAY)}" to sign ${describePurpose(purpose)}?\n${localRequestTimeLine(asked)}\n\n` +
        `${key.fingerprint}\n\n` +
        serverParagraph(purpose) +
        'The key itself never leaves this window. Allow once, or allow every use of this key for ' +
        'ten minutes — long enough for a push that signs and authenticates in one go. ' +
        `Locking the vault ends the window, and so does "Ask for Every Use Again" on the key's row. ` +
        `Unanswered, it is refused after ${durationText(leftMs)}.`,
      { modal: true },
      ...SIGNING_BUTTONS,
    );
    // A modal that REJECTS (the window closing under it) is a dismissal — said in the log, never swallowed.
    return Promise.resolve(modal).catch((error: unknown) => this.modalFailed(error));
  }

  private modalFailed(error: unknown): undefined {
    this.log(`the signing prompt failed: ${describeError(error)} — refused`);
    return undefined;
  }

  /**
   * One call is one line: a key's name is free text (an import, a share sets it), so line breaks and
   * control characters in the message become `?` here, for every line that carries a name. After
   * `dispose()` this writes nothing and does not make a channel again — a late answer or timeout of a
   * prompt that outlived the window must not reach a channel that is gone.
   */
  private log(message: string): void {
    if (this.disposed) {
      return;
    }
    this.output ??= vscode.window.createOutputChannel('CredsForDevs: SSH Agent');
    this.output.appendLine(`${new Date().toISOString()} ${withoutControlChars(message)}`);
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

  /** Every served key object stops signing — before the map forgets them. */
  private revokeAll(): void {
    for (const key of this.keys.values()) {
      key.revoke();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.turns.clear();
    this.revokeAll();
    this.keys.clear();
    this.setWindows(NO_WINDOWS);
    this.server?.dispose();
    this.server = undefined;
    this.output?.dispose();
    this.output = undefined;
    removeSocketFile(this.storageDir);
  }
}

/**
 * The window book's second clock. `performance.now()` is libuv's `uv_hrtime`, which on Windows is
 * `QueryPerformanceCounter` — documented as counting through standby and hibernation (Microsoft Learn,
 * "Acquiring high-resolution time stamps"). Where a platform's counter pauses in sleep the wall clock still
 * ends the window: both must permit.
 */
function monotonicSource(source: (() => number) | undefined): () => number {
  return source ?? (() => performance.now());
}

/** The server line of a login prompt as a paragraph of its own — nothing for a request that names no server. */
function serverParagraph(purpose: SignPurpose): string {
  const line = describeServerLine(purpose);
  return line === '' ? '' : `${line}\n\n`;
}
