import { describeError } from './describeError';
import * as http from 'node:http';
import * as vscode from 'vscode';
import {
  ErrorCode,
  MAX_CONCURRENT_EXECS,
  MAX_REQUEST_BODY_BYTES,
  errorBody,
  parseBearer,
  parseAliasRoute,
  parseJsonObject,
  parseUseRoute,
  statusForErrorCode,
} from './brokerProtocol';
import { ReadRouteSources, readRouteBody } from './brokerReadRoutes';
import { McpEntry } from './mcpEntries';
import { Grant, GrantExpiry, GrantLimits, GrantLookup, GrantRegistry } from './grantRegistry';
import { UseActionRegistry } from './useActions';
import { formatToken } from './grantToken';
import { formatAuditLine } from './agentAuditLog';
import { BrokerAuditWriter } from './brokerAuditWriter';
import { startLoopbackServer } from './loopbackServer';
import { ExtraListener, socketPathFor, startExtraListener } from './brokerListeners';
import { removeEndpoint, writeEndpoint } from './cliEndpoint';
import { AliasThrottle } from './aliasThrottle';
import { startOnce } from './idempotentStart';
import { MaskEntry, buildMaskTable, maskResponseBody } from './secretMasker';

/**
 * The broker: a loopback HTTP surface through which an agent asks this window
 * to USE a credential it will never see.
 *
 * <p>Everything it decides is delegated — the wire contract to
 * `brokerProtocol.ts`, the consent state to `grantRegistry.ts`, the capability
 * to the `UseActionRegistry`. What lives here is what needs an editor: the
 * socket, the Allow/Deny modal, and the output channel that is this feature's
 * audit trail.</p>
 *
 * <p>Started lazily on the first share, so a window that never uses the
 * feature never opens a socket; torn down with the window, which is the whole
 * of the revocation story — a grant cannot outlive the process holding it.</p>
 */

const CONSENT_TIMEOUT_MS = 5 * 60_000;

/**
 * The token lifetime the person configured: idle minutes and a call cap, zero meaning off.
 *
 * <p>Read per request rather than once, so changing the setting takes effect on the next
 * call instead of the next window. Defaults: an hour idle, no cap — a token an agent is
 * using stays live; one it forgot about dies on its own.</p>
 */
function grantLimits(): GrantLimits {
  const config = vscode.workspace.getConfiguration('credSshManager');
  const idleMinutes = Math.max(0, config.get<number>('agentGrantIdleMinutes', 60));
  const maxUses = Math.max(0, Math.floor(config.get<number>('agentGrantMaxCalls', 0)));
  return { idleMs: idleMinutes * 60_000, maxUses };
}

function describeLimits(limits: GrantLimits): string {
  const parts: string[] = [];
  if (limits.idleMs > 0) {
    parts.push(`until it goes unused for ${Math.round(limits.idleMs / 60_000)} minutes`);
  }
  if (limits.maxUses > 0) {
    parts.push(`for at most ${limits.maxUses} calls`);
  }
  parts.push('and never past this window closing');
  return parts.join(', ');
}

function expiredMessage(reason: GrantExpiry, limits: GrantLimits): string {
  return reason === 'idle'
    ? `This grant expired: it went unused for more than ${Math.round(limits.idleMs / 60_000)} minutes. Ask the person for a fresh Share with Claude Code.`
    : `This grant expired: it reached its limit of ${limits.maxUses} calls. Ask the person for a fresh Share with Claude Code.`;
}

export class CredsAgentServer implements vscode.Disposable {
  private readonly grants = new GrantRegistry();
  /** The rate at which a caller with NO token may make this window ask a human. */
  private readonly aliasThrottle = new AliasThrottle();
  private readonly consenting = new Map<string, Promise<boolean>>();
  private readonly abort = new AbortController();
  private output: vscode.OutputChannel | undefined;
  // Shares one in-flight start, but forgets a FAILED one so a transient bind error does not
  // disable the feature for the window's life. See startOnce.
  private readonly beginStart = startOnce<void>();
  private server: http.Server | undefined;
  private extra: ExtraListener | undefined;
  private port = 0;
  /**
   * The SSH agent's address while it is running, for the endpoint file.
   *
   * <p>Kept here rather than read from the agent because the announcement is this class's job
   * and the agent starts and stops on its own schedule — on the first key loaded and the last
   * one unloaded. It tells us; we re-announce.</p>
   */
  private agentSocket: string | undefined;
  private running = 0;

  /**
   * Where this window's audit is written, and how many calls it has recorded.
   *
   * <p>The output channel alone was a buffer in the window — and since closing the
   * window is ALSO how a grant is revoked, the record died at the moment it became
   * history. The shared logging rule had already required a file per run for exactly
   * this reason; the broker simply had not followed it.</p>
   */
  private readonly audit = new BrokerAuditWriter();
  private calls = 0;

  constructor(
    private readonly actions: UseActionRegistry,
    private readonly onUserPresent: () => void,
    private readonly storageDir?: string,
    /**
     * The secrets of the entity a grant points at, for masking that entity's own values out
     * of the output it produces. Optional so the integration test and any future caller can
     * construct a server without one; absent means no masking, never a crash.
     *
     * <p>Scoped to the GRANT's entity on purpose. Building a table from every secret of every
     * unlocked account would put N keychain reads on a per-call path — exactly the cost class
     * 0.57.0 removed from the tree and the sync cycle. For the common case the values are
     * already in memory by the time output exists.</p>
     */
    private readonly maskEntriesFor?: (
      accountId: string,
      entityId: string,
    ) => Promise<readonly MaskEntry[]>,
    /**
     * Destroy the entity if it was marked to live for exactly one agent use; answers whether
     * it did. Optional, like the masker: absent means nothing burns, never a crash.
     *
     * <p>The DECISION lives outside on purpose. The broker knows a grant, not a stored
     * record — it should no more read `burnPolicy` than it reads a password — so the caller
     * that owns storage answers "was this one-use, and is it gone now". That also keeps the
     * single deletion path (`deleteNodeRecursive`, tombstone and history included) on the
     * side of the wall that already has it.</p>
     */
    private readonly burnAfterUse?: (accountId: string, entityId: string) => Promise<boolean>,
    /**
     * Resolve a CLI alias to the entry it names. Optional: absent means this window serves no
     * alias calls at all, which is what a build or a test without the registry should do.
     *
     * <p>Outside again, for the same reason as the other two: the broker holds grants, not
     * stored records. It should not know where a name is kept any more than it knows where a
     * password is.</p>
     */
    private readonly resolveAlias?: (
      name: string,
    ) => { accountId: string; entityId: string; entityName: string; kind: string } | undefined,
    /**
     * The names enabled for the CLI, for `creds ls`. Optional like the rest: absent means this
     * window answers the listing route with an empty list rather than a crash.
     *
     * <p>Separate from {@link resolveAlias} even though both read the same registry, because
     * they disclose different things and a future build might well want one without the other —
     * resolving a name you already know is not the same as being handed every name there is.</p>
     */
    private readonly listAliases?: () => readonly { name: string; kind: string }[],
    /**
     * The entries a person opened to agents, already reduced to their non-secret half.
     *
     * <p>Outside for the third time, and for the third time because the broker holds grants
     * rather than stored records: deciding WHICH entries are visible means resolving a switch
     * against its folder and against the Trash, which is a question about the vault. This side
     * only knows how to answer a GET with whatever it is handed.</p>
     *
     * <p>Asynchronous unlike the other two, because "is there a password" is a keychain read.
     * Absent means this window shows agents nothing, which is what a build or a test without
     * the vault should do.</p>
     */
    private readonly listMcpEntries?: () => Promise<readonly McpEntry[]>,
  ) {}

  /** The signal every spawned child watches, so none outlives this window. */
  get signal(): AbortSignal {
    return this.abort.signal;
  }

  /**
   * Write one line to the audit channel from outside the request loop — an
   * action reporting something the human should see even though the call
   * itself succeeded (a stale key reference, say).
   */
  note = (message: string): void => {
    this.log({ grant: '—', entityName: '', action: 'note', outcome: message });
  };

  /** Bounded concurrency; `undefined` means "at the ceiling, refuse". */
  acquireExecSlot = (): (() => void) | undefined => {
    if (this.running >= MAX_CONCURRENT_EXECS) {
      return undefined;
    }
    this.running += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.running -= 1;
      }
    };
  };

  /**
   * Mint a grant for one entity and return the token the snippet shows.
   * Starts the listener on first use.
   */
  async share(
    accountId: string,
    entityId: string,
    entityName: string,
    kind: string,
  ): Promise<string> {
    await this.ensureStarted();
    const grant = this.grants.mint(accountId, entityId, entityName, kind);
    this.log({
      grant: GrantRegistry.describe(grant),
      entityName,
      action: 'share',
      outcome: 'granted',
      detail: `${kind} · this window only`,
    });
    return formatToken(this.port, grant.secret);
  }

  /**
   * Idempotent, and memoized on the PROMISE rather than the server: two shares
   * clicked in quick succession both await the same start, instead of binding
   * two listeners and leaking the one that loses the assignment — with tokens
   * already handed out naming its port.
   */
  private ensureStarted(): Promise<void> {
    return this.beginStart(async () => {
      this.output ??= vscode.window.createOutputChannel('CredsForDevs: Agent Access');
      this.audit.open(this.storageDir, new Date(), process.pid);
      const { server, port } = await startLoopbackServer();
      this.server = server;
      this.port = port;
      server.on('request', (req, res) => void this.handle(req, res));
      await this.openExtraListener();
      this.announce();
    });
  }

  /**
   * A call that names an entry by alias instead of holding a token.
   *
   * <p><b>What this changes, said plainly.</b> Every other route requires a secret the human
   * copied out of a snippet. This one requires knowing a NAME, and names are not secret — so
   * the consent modal becomes the load-bearing guard, backed on POSIX by the broker socket's
   * `0600` and on Windows by nothing but the modal. That is why an alias is opt-in per entry,
   * why the modal names the entry and the action, and why no token is ever returned: the
   * caller gets the ACTION, never a reusable capability it could pass on.</p>
   *
   * <p>The grant is minted here and then follows exactly the same path as a token call —
   * consent, masking, audit, one-use burn — because a second implementation of that tail is
   * how one of them ends up missing a step.</p>
   */
  /**
   * The body of an alias call, or `undefined` once the refusal has been sent.
   *
   * <p>Takes the raw text as an argument rather than reading it from a field: this server
   * handles calls concurrently, and a field would let two in-flight requests overwrite each
   * other's body — the same class of shared-mutable-state defect the git transport had.</p>
   */
  private async aliasBody(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<Record<string, unknown> | undefined> {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      this.respondError(res, 'payload_too_large', 'Request body too large.');
      return undefined;
    }
    const body = parseJsonObject(raw);
    if (body === undefined || typeof body.alias !== 'string') {
      this.respondError(res, 'invalid_request', 'Body must be a JSON object with an "alias".');
      return undefined;
    }
    return body;
  }

  /**
   * Whether this unauthenticated call may make the window ask a human.
   *
   * <p>Answers the refusal itself, so the caller reads as one guard rather than three lines of
   * verdict handling — and so no path can admit a call and forget to report the refusal.</p>
   */
  /**
   * The entry a name points at, or `undefined` once the refusal has been sent.
   *
   * <p>A window with no alias registry and a name that is not enabled get the **same** answer,
   * deliberately: whether a given name exists is not something an unauthenticated caller
   * should be able to enumerate one guess at a time.</p>
   */
  private aliasTarget(
    res: http.ServerResponse,
    name: string,
  ): { accountId: string; entityId: string; entityName: string; kind: string } | undefined {
    const target = this.resolveAlias?.(name);
    if (target === undefined) {
      this.respondError(res, 'not_found', `No entry is enabled for the CLI under "${name}".`);
    }
    return target;
  }

  private admitAliasCall(res: http.ServerResponse): boolean {
    const verdict = this.aliasThrottle.admit(Date.now());
    if (verdict === 'allow') {
      return true;
    }
    this.respondError(res, 'too_many_requests', AliasThrottle.describe(verdict));
    return false;
  }

  private async handleAlias(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    action: string,
  ): Promise<void> {
    const body = await this.aliasBody(req, res);
    if (body === undefined) {
      return; // already answered
    }
    const name = body.alias as string;

    const target = this.aliasTarget(res, name);
    if (target === undefined) {
      return; // already answered
    }

    // The rate of prompts is this route's authorization, not a nicety — see aliasThrottle.ts.
    // Checked after the name resolves so a refusal still cannot be used to learn what exists,
    // and before minting so a refused call spends nothing.
    if (!this.admitAliasCall(res)) {
      return;
    }

    const grant = this.grants.mint(target.accountId, target.entityId, target.entityName, target.kind);
    this.log({
      grant: GrantRegistry.describe(grant),
      entityName: target.entityName,
      action: 'alias',
      outcome: 'minted',
      detail: `${name} · ${target.kind}`,
    });
    try {
      await this.perform(res, grant, action, body);
    } finally {
      // In a `finally`, because a prompt that timed out or threw has still been shown and the
      // slot must come back — otherwise one failed call closes this route for the session.
      this.aliasThrottle.release();
    }
  }

  /**
   * Leave a note saying where this window listens, so a terminal can find it without a token.
   *
   * <p>It carries a port, a pipe and a pid — nothing secret, and nothing anyone on the machine
   * could not enumerate. That is what makes it safe to write at all, and why a grant token
   * still never appears in it: knowing where the broker is has never been the thing that
   * authorizes anything.</p>
   */
  /**
   * The SSH agent came up, or went away. Re-announce so a relay in WSL can find it.
   *
   * <p>Before the broker has a port there is nothing truthful to write, and the announcement
   * that follows the port will carry this address anyway.</p>
   */
  readonly setAgentAddress = (socketPath: string | undefined): void => {
    this.agentSocket = socketPath;
    if (this.port > 0) {
      this.announce();
    }
  };

  private announce(): void {
    if (this.storageDir === undefined) {
      return;
    }
    writeEndpoint(this.storageDir, {
      pid: process.pid,
      port: this.port,
      socket: this.extra?.address,
      agentSocket: this.agentSocket,
      startedAt: new Date().toISOString(),
    });
  }

  /**
   * The pipe or socket beside the port, when there is somewhere to put it.
   *
   * <p>Never fatal. A window that cannot open a socket — a storage path too long for the OS
   * limit, a read-only directory — still has its loopback port, which is how every existing
   * client reaches it. Failing to start the broker over this would take away a working feature
   * to add a new one.</p>
   */
  private async openExtraListener(): Promise<void> {
    const address =
      this.storageDir === undefined
        ? undefined
        : socketPathFor(this.storageDir, process.pid, process.platform);
    if (address === undefined) {
      return;
    }
    try {
      this.extra = await startExtraListener(
        (req, res) => void this.handle(req, res),
        address,
        process.platform,
      );
    } catch (error) {
      this.note(`the local socket could not be opened (${describeError(error)}); the port still works.`);
    }
  }

  /** The GET routes' suppliers, gathered so `brokerReadRoutes` can answer without this class. */
  private get readSources(): ReadRouteSources {
    return { aliases: this.listAliases, mcpEntries: this.listMcpEntries };
  }

  // eslint-disable-next-line complexity
  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    // Health, the alias listing and the entries an agent may see — one kind of route, described
    // once in `brokerReadRoutes.ts`: none authenticates, none performs anything, none is
    // throttled. Everything below this line needs a token or raises a modal.
    const read = req.method === 'GET' ? await readRouteBody(url.pathname, this.readSources) : undefined;
    if (read !== undefined) {
      this.respond(res, 200, read);
      return;
    }

    if (req.method === 'POST' && parseAliasRoute(url.pathname) !== undefined) {
      await this.handleAlias(req, res, parseAliasRoute(url.pathname) as string);
      return;
    }

    const action = parseUseRoute(url.pathname);
    if (req.method !== 'POST' || action === undefined) {
      this.respondError(res, 'not_found', 'No such endpoint.');
      return;
    }

    const secret = parseBearer(req.headers.authorization);
    const limits = grantLimits();
    const found: GrantLookup =
      secret === undefined ? { kind: 'unknown' } : this.grants.lookup(secret, Date.now(), limits);
    if (found.kind !== 'live') {
      // An expired token says so. "Unknown" would send the agent hunting for a typo in a
      // token that was correct an hour ago.
      this.respondError(
        res,
        'unauthorized',
        found.kind === 'expired' ? expiredMessage(found.reason, limits) : 'Unknown or missing grant token.',
      );
      return;
    }
    const grant = found.grant;

    let raw: string;
    try {
      raw = await readBody(req);
    } catch {
      this.respondError(res, 'payload_too_large', 'Request body too large.');
      return;
    }
    const body = parseJsonObject(raw);
    if (body === undefined) {
      this.respondError(res, 'invalid_request', 'Body must be a JSON object.');
      return;
    }

    await this.perform(res, grant, action, body);
  }

  /**
   * Everything after "we know which entry, and the caller may ask for it": capability check,
   * validation, consent, the call, masking, the audit line, and the one-use burn.
   *
   * <p>Extracted so the alias route reaches it too. Duplicating any of it for a second entry
   * point would be a way for consent, masking or the audit to apply to one caller and not the
   * other — and the one that gets forgotten is always the newer path.</p>
   */
  // eslint-disable-next-line complexity, max-lines-per-function
  private async perform(
    res: http.ServerResponse,
    grant: Grant,
    action: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const useAction = this.actions.resolve(grant.kind, action);
    if (useAction === undefined) {
      this.respondError(res, 'not_supported', `"${grant.kind}" entities cannot ${action}.`);
      return;
    }
    const validated = useAction.validate(body);
    if (!validated.ok) {
      this.respondError(res, 'invalid_request', validated.message, grant, action);
      return;
    }

    const summary = useAction.summarize(body);
    const consent = await this.consent(grant, action, useAction.verb, summary);
    if (consent !== 'allowed') {
      const code: ErrorCode = consent === 'timeout' ? 'consent_timeout' : 'denied';
      this.respondError(res, code, 'The human did not allow this grant.', grant, action, summary);
      return;
    }

    // Counted and clocked only once consent is in hand: a refused or still-pending call must
    // not extend a token's idle life or spend one of its uses.
    this.grants.touch(grant.secret);
    try {
      const result = await useAction.run(
        { accountId: grant.accountId, entityId: grant.entityId, entityName: grant.entityName },
        body,
      );
      // The last thing before the bytes leave the extension. The broker's promise — no
      // response field a secret can travel in — is true of the SHAPES and false of what
      // stdout carries: an agent that composes a command can make it print the very password
      // the broker supplied to run it. One place, so every action is covered and any future
      // one is covered by default.
      const { body: sent, hits } = await this.masked(grant, result.body);
      this.log({
        grant: GrantRegistry.describe(grant),
        entityName: grant.entityName,
        action,
        outcome:
          result.status === 200 ? useAction.describeOutcome(result) : String(result.status),
        detail: hits > 0 ? `${summary} · masked ${hits} secret value(s)` : summary,
      });
      this.respond(res, result.status, sent);
      // After the answer is on the wire, never before: the use has happened by now, and a
      // storage failure while burning must not cost the agent the result it already earned.
      await this.burnIfSpent(grant, result.status);
    } catch (error) {
      this.respondError(
        res,
        'internal',
        describeError(error),
        grant,
        action,
        summary,
      );
    }
  }

  /**
   * The first-use gate. Concurrent first calls share one dialog — two modals
   * for one token is a bug the human experiences as a stuck agent.
   *
   * <p>A dismissed dialog (Escape) is a one-off refusal that is NOT recorded:
   * a mis-click must not lock an agent out for the window's life. Only an
   * explicit Deny is sticky, and a timeout leaves the grant re-promptable —
   * a missed notification is the common case, not a decision.</p>
   */
  // eslint-disable-next-line complexity
  private async consent(
    grant: Grant,
    action: string,
    verb: string,
    summary: string,
  ): Promise<'allowed' | 'denied' | 'timeout'> {
    const current = this.grants.get(grant.secret);
    if (current?.status === 'allowed') {
      return 'allowed';
    }
    if (current?.status === 'denied') {
      return 'denied';
    }

    const pending = this.consenting.get(grant.secret) ?? this.ask(grant, action, verb, summary);
    this.consenting.set(grant.secret, pending);
    let allowed: boolean;
    try {
      allowed = await pending;
    } finally {
      this.consenting.delete(grant.secret);
    }
    const settled = this.grants.get(grant.secret)?.status;
    if (settled === 'allowed') {
      return 'allowed';
    }
    if (settled === 'denied') {
      return 'denied';
    }
    return allowed ? 'allowed' : 'timeout';
  }

  // eslint-disable-next-line max-lines-per-function
  private async ask(
    grant: Grant,
    action: string,
    verb: string,
    summary: string,
  ): Promise<boolean> {
    // Consent is per GRANT, so one Allow authorises every action of this kind — not only the
    // one that triggered the dialog. The dialog has to say so in those actions' own words,
    // or "open a terminal" is what the person reads while "run any command" is what they grant.
    const everything = this.actions
      .actionsFor(grant.kind)
      .map((a) => a.verb)
      .join(', or ');
    const limits = grantLimits();
    const choice = await withTimeout(
      Promise.resolve(
        vscode.window.showWarningMessage(
          `Claude Code wants to ${verb} ` +
            `"${grant.entityName}" using its stored credential.\n\n${summary}\n\n` +
            `Allowing covers every later call on this token, not just this one: with it the agent can ${everything} "${grant.entityName}" ` +
            `${describeLimits(limits)}. ` +
            'Each call is logged in the "CredsForDevs: Agent Access" output panel.',
          { modal: true },
          'Allow',
          'Deny',
        ),
      ),
      CONSENT_TIMEOUT_MS,
    );

    if (choice === 'Allow') {
      // The one moment a person is provably present. Agent traffic after this
      // deliberately does NOT postpone auto-lock: a long unattended run is
      // exactly what the idle window exists to catch.
      this.onUserPresent();
      this.grants.allow(grant.secret);
      this.log({
        grant: GrantRegistry.describe(grant),
        entityName: grant.entityName,
        action,
        outcome: 'ALLOWED',
        detail: 'first use consented',
      });
      return true;
    }
    if (choice === 'Deny') {
      this.onUserPresent();
      this.grants.deny(grant.secret);
      this.log({
        grant: GrantRegistry.describe(grant),
        entityName: grant.entityName,
        action,
        outcome: 'DENIED',
        detail: 'first use refused',
      });
      return false;
    }
    // Dismissed or timed out: refuse this call, leave the grant re-promptable.
    return false;
  }

  /**
   * The response body with this grant's own secrets replaced by placeholders.
   *
   * <p>Fails OPEN by design: if the table cannot be built, the call still answers. Masking is
   * a second line — the first is that no response field carries a secret by construction —
   * and turning a working exec into an error because a keychain read failed would trade a
   * possible leak for a certain outage. The audit line records how many values were masked,
   * never which.</p>
   */
  private async masked(grant: Grant, body: unknown): Promise<{ body: unknown; hits: number }> {
    if (this.maskEntriesFor === undefined) {
      return { body, hits: 0 };
    }
    try {
      const entries = await this.maskEntriesFor(grant.accountId, grant.entityId);
      return maskResponseBody(body, buildMaskTable(entries));
    } catch {
      return { body, hits: 0 };
    }
  }

  /**
   * Destroy a one-use entry now that it has been used — and say so in the audit.
   *
   * <p>Only a successful call spends it. A refused, failed or not-supported call left the
   * credential unused, and burning it there would destroy a working secret because the agent
   * mistyped a command.</p>
   *
   * <p>Failing to burn is logged, never thrown: the response is already sent, and the sweep
   * has no second chance at this — a `oneUse` entry carries no clock — so the audit line is
   * the only record that the entry outlived its promise.</p>
   */
  private spender(status: number): ((a: string, e: string) => Promise<boolean>) | undefined {
    return status === 200 ? this.burnAfterUse : undefined;
  }

  private async burnIfSpent(grant: Grant, status: number): Promise<void> {
    const burn = this.spender(status);
    if (burn === undefined) {
      return;
    }
    try {
      if (await burn(grant.accountId, grant.entityId)) {
        this.note(`"${grant.entityName}" was one-use and has been deleted from the vault.`);
      }
    } catch (error) {
      this.note(`"${grant.entityName}" was one-use but could NOT be deleted: ${describeError(error)}`);
    }
  }

  private respond(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  private respondError(
    res: http.ServerResponse,
    code: ErrorCode,
    message: string,
    grant?: Grant,
    action?: string,
    detail?: string,
  ): void {
    // An unknown token is answered but never logged: the CLI legitimately
    // probes, and a log line per probe would drown the real calls.
    if (grant !== undefined) {
      this.log({
        grant: GrantRegistry.describe(grant),
        entityName: grant.entityName,
        action: action ?? 'request',
        outcome: code,
        detail: detail ?? message,
      });
    }
    this.respond(res, statusForErrorCode(code), errorBody(code, message));
  }

  private log(entry: Omit<Parameters<typeof formatAuditLine>[0], 'at'>): void {
    // Numbered because nothing caps how many calls one grant may make. A ceiling
    // would have to guess a number; a running count costs nothing and shows a
    // runaway agent loop to whoever reads the file afterwards.
    this.calls += 1;
    const line = formatAuditLine({ ...entry, at: new Date(), seq: this.calls });
    this.output?.appendLine(line);
    this.audit.append(line);
  }


  /**
   * Take down the local traces of this window: the socket file and the endpoint note.
   *
   * <p>Fire-and-forget, because `dispose` is synchronous. Both paths carry the pid, so
   * anything left behind by a window that never reached here is always safe for the next one
   * to remove — which is the real guarantee, since a crash never runs this at all.</p>
   */
  private removeLocalTraces(): void {
    void this.extra?.close();
    this.extra = undefined;
    if (this.storageDir !== undefined) {
      removeEndpoint(this.storageDir, process.pid);
    }
  }

  dispose(): void {
    this.abort.abort();
    this.server?.close();
    this.server = undefined;
    this.removeLocalTraces();
    this.output?.dispose();
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    (timer as unknown as { unref?: () => void }).unref?.();
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
