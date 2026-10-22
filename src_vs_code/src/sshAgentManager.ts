import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  SignPurpose,
  describePurposeForLog,
  describeUnknownShape,
  keyTypeOf,
  withoutControlChars,
} from './sshAgentProtocol';
import { ConsentTurns, RefusalKind, TurnOutcome } from './consentTurns';
import {
  CROSSING_NOTICE,
  coveredLine,
  crossedLine,
  durationText,
  longerItems,
  loginWindowsEndedNotice,
  noListLine,
  orphanNotice,
  pickRefusedLine,
  pickRefusedNotice,
  queuedLine,
  refusalLine,
  staleNotice,
} from './sshAgentTexts';
import { AgentKey, SshAgentServer, agentSocketPath } from './sshAgentServer';
import { ParsedSshKey } from './sshKeyParse';
import { SecretOpener } from './secretOpener';
import { automaticOpenerFor } from './automaticRead';
import {
  ALLOW_LONGER,
  ALLOW_WINDOW,
  CONSENT_TIMEOUT_MS,
  ListPick,
  LongWindowClaim,
  LongerOffer,
  ONCE,
  SigningAnswer,
  SigningDecision,
  answerFromList,
  answerFromModal,
  decideSigning,
  longWindowClaim,
  longerOffer,
} from './agentConsent';
import {
  AskTicket,
  NO_WINDOWS,
  OpenWindow,
  ScopeWindows,
  WindowScope,
  askTicket,
  KeyRef,
  coveringWindow,
  endAllWindows,
  endLoginWindows,
  endWindows,
  forgetKey,
  grantWindow,
  scopesFor,
  withEndOnBothClocks,
} from './allowWindows';
import { Moment, SigningWindows, monotonicSource } from './sshAgentWindows';
import { askSigning, pickLength } from './sshSignPrompt';
import { signForAgent, signsWithSha1 } from './sshAgentSign';
import { LoadedKey, parsedKey, removeSocketFile } from './sshAgentKeys';
import { StorageManager } from './storageManager';
import { EntityMetadata, TreeNode } from './types';

/**
 * One request as it ARRIVED (#197, E3.1): the key, what is being signed, the time of the request (what the prompt
 * shows), the key's generation (what a window is granted to) and, since E3.3, the `claim` — whether a long window may
 * cover it, decided ONCE here from the manager's own loaded key and the request's flags. Built before the first `await`.
 */
interface Arrival {
  readonly key: AgentKey;
  readonly purpose: SignPurpose;
  readonly asked: Date;
  readonly arrived: KeyRef;
  readonly claim: LongWindowClaim;
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

export class SshAgentManager implements vscode.Disposable {
  private server: SshAgentServer | undefined;
  private readonly keys = new Map<string, LoadedKey>();
  /**
   * The holder of the open "allow without asking" windows (`sshAgentWindows.ts`; `allowWindows.ts` holds the rules).
   * In memory only, by design. Built in the constructor body, after `monotonic` is set.
   */
  private readonly windows: SigningWindows;
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
  /**
   * Whether the vault is locked, whether idle auto-lock is overdue and what it is set to (#197, E3.3). FIELDS the
   * wiring assigns (`connectAgentToSettings`), like `onWindowsChanged`, and they FAIL CLOSED: a manager nobody wired
   * offers no longer window and honours none — these are authorisation inputs, so the safe default is the refusing one.
   */
  lockedNow: () => boolean = () => true;
  autoLockOverdue: () => boolean = () => true;
  autoLockMinutes: () => number = () => 0;

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
    this.windows = new SigningWindows(this.clock, this.monotonic, () => this.windowsChanged());
  }

  /** The book changed: the row repaints — unless the manager is gone (`onWindowsChanged` is the wiring's field). */
  private windowsChanged(): void {
    if (!this.disposed) {
      this.onWindowsChanged();
    }
  }

  /**
   * Whether a login window may be honoured now: unlocked and auto-lock not overdue. The idle timer ticks only every
   * 60 s, so a laptop waking with auto-lock overdue would otherwise sign silently for up to a minute (review M1).
   * Read at EVERY check — arrival, after a wait, the row — never cached.
   */
  private loginLive(): boolean {
    return !this.lockedNow() && !this.autoLockOverdue();
  }

  /** Which windows count: the ONE rule the gate and the row both ask. `login` counts only while auto-lock is on. */
  private scopes(login: boolean): readonly WindowScope[] {
    return scopesFor(login, this.autoLockMinutes());
  }

  /**
   * Idle auto-lock was turned off: every `login` window ends (the 10-minute ones and every fence stay) — a long window
   * needs a lock to end it. Says so once when a live one was ended. Never revokes, never unloads; answers how many keys.
   */
  endLoginWindows(reason: string): number {
    const ended = this.windows.loginHolders(this.keys.values());
    this.windows.set(endLoginWindows(this.windows.current));
    if (this.keys.size > 0) {
      this.log(`every login window ended: ${reason}`);
    }
    if (ended > 0) {
      this.tell(loginWindowsEndedNotice(ended));
    }
    return ended;
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
    this.windows.set(forgetKey(this.windows.current, details.id));
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
    this.windows.set(forgetKey(this.windows.current, entityId));
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
    this.windows.set(endAllWindows(this.windows.current));
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
    const had = Object.keys(this.liveWindows(entityId, this.windows.moment())).length > 0;
    this.windows.set(endWindows(this.windows.current, entityId));
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
    const at = this.windows.moment();
    return withEndOnBothClocks(this.liveWindows(entityId, at), at.wall, at.mono);
  }

  /**
   * The windows of this key that cover a request at `at`, on BOTH clocks (the gate's own rule). What the row and
   * `endWindows`' `had` ask is the WIDEST set the gate would honour for any request now: `scopesFor(loginLive(), …)`.
   * Never `scopesFor(false, …)` or `ALL_ONLY` here — both are `['all']`, and the row would never show a login window.
   */
  private liveWindows(entityId: string, at: Moment): ScopeWindows {
    const generation = this.generationOf(entityId);
    return generation === undefined ? {} : this.windows.live({ entityId, generation }, this.scopes(this.loginLive()), at);
  }

  private nameOf(entityId: string): string {
    return this.keys.get(entityId)?.name ?? entityId;
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
      // The flags travel with the request: they decide which digest an RSA key signs with (`signsWithSha1`).
      confirm: (key, purpose, data, signal, flags) => this.confirm(key, purpose, data, signal, flags),
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
   * The request as it arrived — `undefined` when the key is not loaded. The generation AND the key type come from the
   * manager's own map (the `AgentKey` argument is whatever the caller built; the manager tests pass plain objects),
   * and the claim is made here, once, before any `await`: `longWindowClaim` turns the purpose and `signsWithSha1` into
   * `login`, `sha1-login` or `not-login`. A type that cannot be read is treated as SHA-1 (fail closed).
   */
  private arrivalOf(key: AgentKey, purpose: SignPurpose, asked: Date, flags: number): Arrival | undefined {
    const loaded = this.keys.get(key.entityId);
    if (loaded === undefined) {
      return undefined;
    }
    const sha1 = signsWithSha1(keyTypeOf(loaded.identity.publicBlob), flags);
    return { key, purpose, asked, arrived: { entityId: key.entityId, generation: loaded.generation }, claim: longWindowClaim(purpose, sha1) };
  }

  /**
   * The window that covers this request at `now`, if any. The scopes are asked at EVERY check — arrival and after a
   * wait: a login window counts only for a `login` claim, and only while `loginLive()` and auto-lock is on.
   */
  private coveringAt(arrival: Arrival, now: number, nowMono: number): { scope: WindowScope; window: OpenWindow } | undefined {
    const scopes = this.scopes(arrival.claim === 'login' && this.loginLive());
    return coveringWindow(this.windows.current, arrival.arrived, scopes, now, nowMono);
  }

  /**
   * The gate: is this signature allowed without asking, and if not, ask.
   *
   * <p><b>Arrival is read before the first `await`</b> — the time of the request, the key's generation and
   * the monotonic clock. The server hands the request over synchronously, so these are the facts of the
   * moment it came in; a generation read after the prompt would be the CURRENT one, and a key re-loaded
   * during the prompt would then look like the key that was asked about. It is read from the manager's own
   * map, not from the `AgentKey` handed in. So is the key's TYPE, which with the request's `flags` decides whether the
   * signature would be SHA-1 RSA (`signsWithSha1`) and therefore whether any long window may ever cover it.</p>
   */
  private async confirm(key: AgentKey, purpose: SignPurpose, data: Buffer, signal: AbortSignal, flags: number): Promise<boolean> {
    // When the signature was asked for, taken as it enters — the time on the prompt is what says how
    // old the request is (#131), and the prompt refuses after CONSENT_TIMEOUT_MS unanswered.
    const asked = this.clock();
    const arrival = this.arrivalOf(key, purpose, asked, flags);
    const nowMono = this.monotonic();
    // The grant's ten minutes still start at the CLICK (`settle`), as agentConsent.ts documents — the
    // time on the prompt and the start of the window are two facts on purpose.
    this.noteUnknown(purpose, data);
    if (arrival === undefined) {
      this.log(`"${key.name}": the key is not loaded`);
      return false;
    }
    const covered = this.coveringAt(arrival, asked.getTime(), nowMono);
    if (covered !== undefined) {
      this.logCovered(key, purpose, covered);
      return true;
    }
    const outcome = await this.turns.take(
      key.entityId,
      signal,
      (turn, leftMs) => this.turnStarted(arrival, turn, leftMs),
      (waited) => this.beforePrompt(arrival, waited),
      () => this.log(queuedLine(key, durationText(this.consentTimeoutMs))),
    );
    return this.outcomeOf(key, purpose, outcome);
  }

  /**
   * The turn at the prompt, run when every earlier turn for this key has SETTLED and `beforePrompt` had nothing to
   * say. The ticket is taken NOW, after any wait (a fence that moved while the request waited must not fence an
   * answer given after the prompt is shown — the fence guards the time the prompt is on screen); then the modal.
   *
   * <p><b>After the modal, with no `await` in between:</b> a turn that ended meanwhile (`turn.aborted`) signs
   * nothing; a live one applies its answer here, inside the turn. The slot frees only when this settles, so the
   * next turn's re-check always sees the window this one opened — by construction, not by counting promise hops.
   * No timer or socket `close` can run between the check and the apply. *Allow longer…* is the SAME turn's second
   * step (`longer`): the list, the bound and the slot are the modal's, so this rule holds after the list too.</p>
   */
  private async turnStarted(arrival: Arrival, turn: AbortSignal, leftMs: number): Promise<boolean> {
    const ticket = askTicket(this.windows.current, arrival.arrived);
    const deadline = this.monotonic() + leftMs;
    const { key, purpose, asked } = arrival;
    const choice = await askSigning({ key, purpose, asked, leftMs, offer: this.offerFor(arrival) }, (message) => this.log(message));
    const answer = answerFromModal(choice);
    if (answer === 'pick-longer') {
      return this.longer(arrival, ticket, turn, deadline);
    }
    return turn.aborted ? this.stale(choice !== undefined) : this.settle(arrival, ticket, answer);
  }

  /** May *Allow longer…* be honoured now? Asked three times: for the button, before the list, and at the pick. */
  private offerFor(arrival: Arrival): LongerOffer {
    return longerOffer(arrival.claim, this.lockedNow(), this.autoLockMinutes());
  }

  /**
   * *Allow longer…* came back. A turn that ended meanwhile opens no list (a late click is told). Otherwise eligibility
   * is asked AGAIN (the button may not have been there, or the vault locked meanwhile): a "no" allows this one
   * signature, opens no list and says why. Only then the list, whose bound is the turn's own.
   */
  private async longer(arrival: Arrival, ticket: AskTicket, turn: AbortSignal, deadline: number): Promise<boolean> {
    if (turn.aborted) {
      return this.stale(true);
    }
    const offer = this.offerFor(arrival);
    if (!offer.offer) {
      return this.allowedOnce(arrival, ticket, offer.why, noListLine(arrival.key, offer.why));
    }
    const now = this.clock();
    const items = longerItems(now.getTime(), -now.getTimezoneOffset(), this.autoLockMinutes());
    const pick = await pickLength(arrival.key, items, deadline - this.monotonic(), turn, (message) => this.log(message));
    return this.afterPick(arrival, ticket, turn, pick);
  }

  /**
   * After the list, in the same synchronous continuation and with NO `await` before the grant (R4, C17), in this
   * order: (1) the turn ended → stale, nothing signed, no presence; (2) what the list ended with — Escape declines
   * (presence), a failed list is nobody; (3) only a length reaches the eligibility re-check, which allows once and
   * says why when the world changed during the list; (4) `settle`, which reads the clock ONCE, at the pick.
   */
  private afterPick(arrival: Arrival, ticket: AskTicket, turn: AbortSignal, pick: ListPick): boolean {
    if (turn.aborted) {
      return this.stale(pick.kind === 'picked');
    }
    const answer = answerFromList(pick);
    const offer = this.offerFor(arrival);
    if (answer.kind === 'window' && !offer.offer) {
      return this.allowedOnce(arrival, ticket, offer.why, pickRefusedLine(arrival.key, answer.ms, offer.why));
    }
    return this.settle(arrival, ticket, answer);
  }

  /** A long window that can no longer be granted: this one signature goes ahead, nothing opens, and the person is told why. */
  private allowedOnce(arrival: Arrival, ticket: AskTicket, why: string, logLine: string): boolean {
    this.log(logLine);
    this.tell(pickRefusedNotice(why));
    return this.settle(arrival, ticket, ONCE);
  }

  /**
   * What the turn's start settles without a prompt, asked BEFORE the time floor is applied: `false` (refused), `true`
   * (a window covers it) or `undefined` (go on). Everything the request learned at arrival can have changed while it
   * waited, so it is checked again, in this order: the key is still the one asked about (E1.2's judgement — a removed
   * key is refused without a prompt); a window an earlier turn opened covers it (no second prompt, and not refused
   * for want of time either — a covered request needs neither).
   */
  private beforePrompt(arrival: Arrival, waited: boolean): boolean | undefined {
    const { key, purpose, arrived } = arrival;
    if (this.generationOf(key.entityId) !== arrived.generation) {
      this.log(`"${key.name}": the key was removed or re-added while the request waited — refused`);
      return false;
    }
    const covered = this.coveredAfterWaiting(arrival, waited);
    if (covered === undefined) {
      return undefined;
    }
    this.logCovered(key, purpose, covered);
    return true;
  }

  /**
   * The window book asked again with fresh readings of both clocks — but only for a request that WAITED, which the
   * queue says (never inferred from the time left: a frozen clock leaves a waiter the whole bound). One that did not
   * wait was checked at arrival, in this same synchronous breath; reading the clocks twice for it would only move the
   * gate's "one reading at the click" accounting.
   */
  private coveredAfterWaiting(arrival: Arrival, waited: boolean): { scope: WindowScope; window: OpenWindow } | undefined {
    return waited ? this.coveringAt(arrival, this.clock().getTime(), this.monotonic()) : undefined;
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
      this.tell(orphanNotice(key.name));
    }
  }

  /**
   * An answer came back after the turn ended: nothing is signed, no presence is counted, no window opens — and a click
   * (`clicked`: a label from the modal, an item from the list) is told, because VS Code cannot close a modal. Escape,
   * a closed window or a failed list is not a click and says nothing.
   */
  private stale(clicked: boolean): false {
    if (clicked) {
      this.tell(staleNotice(durationText(this.consentTimeoutMs)));
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
  private logCovered(key: AgentKey, purpose: SignPurpose, covering: { scope: WindowScope; window: OpenWindow }): void {
    this.log(coveredLine(key.name, covering.scope, covering.window, describePurposeForLog(purpose)));
  }

  /**
   * Apply the answer. What it MEANS is `agentConsent.ts` — pure, and therefore tested; what is left here is
   * the presence signal and the remembered window. Both clocks are read once, side by side, at the click or the
   * pick: the window starts THERE, not when the prompt appeared.
   */
  private settle(arrival: Arrival, ticket: AskTicket, answer: SigningAnswer): boolean {
    const grantedAt = this.clock().getTime();
    const grantedAtMono = this.monotonic();
    const decision = decideSigning(answer, grantedAt);
    if (decision.present) {
      this.onUserPresent();
    }
    if (decision.window === undefined) {
      return decision.allow;
    }
    return this.openWindow(arrival.key, ticket, decision.window, { grantedAt, grantedAtMono });
  }

  /**
   * Record a timed answer. THE one place the manager decides on a moved generation. (The book checks the
   * generation in three places — crossing, covers, liveAndLater — but only here is the outcome acted on.) It
   * says `stale-key` when the key was unloaded or re-loaded while the prompt was open, and then nothing is
   * allowed and no window opens. (An *Allow once* across the same event is refused by the server, which
   * compares the key OBJECT it asked about with the one now served.) The other two crossings, `fenced-key` (the row
   * button) and `fenced-lock` (any lock), allow this one signature and open no window.
   *
   * <p>All three are written to the agent log (`crossedLine`): each makes the outcome differ from the click the
   * person made, and a record that stayed silent about two of them could not answer "why did that window not
   * open?" afterwards.</p>
   */
  private openWindow(
    key: AgentKey,
    ticket: AskTicket,
    window: NonNullable<SigningDecision['window']>,
    at: { grantedAt: number; grantedAtMono: number },
  ): boolean {
    const { book, outcome } = grantWindow(this.windows.current, ticket, window.scope, this.generationOf(key.entityId), at.grantedAt, at.grantedAtMono, window.until);
    this.windows.set(book, { wall: at.grantedAt, mono: at.grantedAtMono });
    const crossed = window.scope === 'login' ? crossedLine(outcome, ALLOW_LONGER, window.until - at.grantedAt) : crossedLine(outcome, ALLOW_WINDOW);
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
    this.windows.set(NO_WINDOWS);
    this.windows.dispose();
    this.server?.dispose();
    this.server = undefined;
    this.output?.dispose();
    this.output = undefined;
    removeSocketFile(this.storageDir);
  }
}
