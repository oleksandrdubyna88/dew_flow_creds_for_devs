import * as http from 'node:http';
import * as vscode from 'vscode';
import {
  ErrorCode,
  INTERNAL_FAILURE,
  MASKING_UNAVAILABLE,
  MAX_CONCURRENT_EXECS,
  MAX_REQUEST_BODY_BYTES,
  errorBody,
  isConfigReadRoute,
  parseAliasRoute,
  parseJsonObject,
  parseUseRoute,
  statusForErrorCode,
} from './brokerProtocol';
import { BrokerHooks, checkedHooks } from './brokerHooks';
import { doorsFor } from './brokerOrigin';
import { CallSubject, performCall } from './brokerCall';
import { OneUseLane, burnAndMark } from './oneUseLane';
import { ReadRouteSources, readRouteBody } from './brokerReadRoutes';
import { describeError } from './describeError';
import { BrokerDoor, ConsentOutcome, DURING_CONSENT, mcpDoor } from './brokerMcpDoor';
import { ConsentGate } from './brokerConsent';
import { abandonedWhenClosed } from './requestLife';
import { recordConsent } from './brokerConsentMemory';
import { McpFolderHooks } from './brokerFolderDoor';
import { answerMcpRoute } from './brokerMcpRoutes';
import { aliasTarget, grantForToken, readNamedBody } from './brokerRequests';
import { CallerLabel, callerForAudit, callerFrom } from './brokerCaller';
import { grantLimits } from './grantLimits';
import { answerConfigRead } from './brokerConfigRoute';
import { Grant, GrantRegistry } from './grantRegistry';
import { UseAction, UseActionRegistry } from './useActions';
import { formatToken } from './grantToken';
import { AuditDoor, AuditEntry, formatAuditLine } from './agentAuditLog';
import { BrokerAuditWriter } from './brokerAuditWriter';
import { startLoopbackServer } from './loopbackServer';
import { ExtraListener, socketPathFor, startExtraListener } from './brokerListeners';
import { removeEndpoint, writeEndpoint } from './cliEndpoint';
import { type Slot, TokenlessCeilings } from './aliasThrottle';
import { startOnce } from './idempotentStart';
import { refreshFrom, tableOrFail } from './brokerResponse';

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

export class CredsAgentServer implements vscode.Disposable {
  private readonly grants = new GrantRegistry();
  /** The two ceilings a caller with NO token answers to — the modal budget, and the silent one (#95). */
  private readonly ceilings = new TokenlessCeilings();
  /** One call at a time for an entry that may only be used once — see `oneUseLane.ts`. */
  private readonly oneUse = new OneUseLane();
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

  /**
   * Two things this class cannot work without, and everything else BY NAME.
   *
   * <p>The named half used to be eleven positional parameters, which is a shape where inserting one
   * in the middle hands every argument after it to the wrong slot — twice, silently, both times
   * found by an integration script rather than by a type. `brokerHooks.ts` carries that record and
   * the reason each hook is answered outside this class.</p>
   *
   * <p>`storageDir` is IN the object rather than a third positional, which is where it started: an
   * optional positional in front of an options object rebuilds the same trap, since
   * `new CredsAgentServer(actions, present, { listAliases })` binds the object to the string.</p>
   */
  constructor(
    private readonly actions: UseActionRegistry,
    onUserPresent: () => void,
    hooks?: BrokerHooks,
  ) {
    // Checked, not trusted: five of the seven callers are `.cjs`, where a misspelled key is silent
    // by construction — every hook is optional, so `resolveAlais` reads as "switched off".
    this.hooks = checkedHooks(hooks);
    this.gate = new ConsentGate({ grants: this.grants, actions, onUserPresent, log: (entry) => this.log(entry) });
  }

  /** The Allow/Deny modal, and what an answer does — `brokerConsent.ts`. */
  private readonly gate: ConsentGate;

  private readonly hooks: BrokerHooks;

  /** Where this window keeps its journal, its endpoint note and its socket. */
  private get storageDir(): string | undefined {
    return this.hooks.storageDir;
  }

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
  ensureStarted(): Promise<void> {
    return this.beginStart(async () => {
      this.output ??= vscode.window.createOutputChannel('CredsForDevs: Agent Access');
      this.audit.open(this.storageDir, new Date(), process.pid);
      const { server, port } = await startLoopbackServer();
      this.server = server;
      this.port = port;
      server.on('request', this.doors.onThePort);
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
   * Whether this unauthenticated call may proceed — to ask a human, or to act without one.
   *
   * <p>Answers the refusal itself, so the caller reads as one guard rather than three lines of
   * verdict handling — and so no path can admit a call and forget to report the refusal. Both
   * routes that carry no token pass through here; see `brokerRequests.ts` for what each of them
   * has to satisfy before reaching it.</p>
   */
  private admitAliasCall(res: http.ServerResponse, prompts: boolean): Slot | undefined {
    const admission = this.ceilings.admit(prompts, Date.now());
    const refused = admission.refusal;
    if (refused === undefined) {
      return admission;
    }
    if (refused.report) {
      // `respondError` logs nothing without a grant — an unknown token is probed legitimately, and a
      // line per probe would drown the real calls — but this is no probe: it is the one sign that a
      // runaway loop, or a process working through the entries a policy opened, exists, and a rate
      // limit nobody can see having fired is one nobody can diagnose. `via: 'mcp'` is a fact, not a
      // guess: the alias route always prompts; only the MCP door has a policy to answer for a person.
      this.log({ grant: '—', entityName: '', action: 'request', outcome: 'too_many_requests', detail: refused.message, via: 'mcp' });
    }
    this.respondError(res, 'too_many_requests', refused.message);
    return undefined;
  }

  /** The routes an MCP client posts to — the dispatch lives in `brokerMcpRoutes.ts`. */
  private answerMcp(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    return answerMcpRoute(
      {
        door: this.doorFor(signal),
        readBody,
        resolveUse: this.hooks.resolveMcpUse,
        moveToTrash: this.hooks.moveToTrash,
        create: this.hooks.mcpCreate,
        folders: this.folderHooks,
      },
      req,
      res,
      pathname,
    );
  }

  /** The folder verbs, supplied after construction; absent = this window serves no folder route. */
  setFolderHooks(hooks: McpFolderHooks): void {
    this.folderHooks = hooks;
  }

  private folderHooks: McpFolderHooks | undefined;

  /**
   * The pieces the MCP door needs, and nothing else — see `brokerMcpDoor.ts`. Built per request, because
   * it carries that request's life: `consent` and `perform` hand `signal` to the broker.
   */
  private doorFor(signal: AbortSignal): BrokerDoor {
    return mcpDoor({
      refuse: (res, code, message, grant, action, detail, caller) =>
        this.respondError(res, code, message, grant as Grant | undefined, action, detail, 'mcp', caller),
      admit: (res, prompts) => this.admitAliasCall(res, prompts),
      // The grant a policy already answered for. `consent` short-circuits on an allowed grant, so
      // the modal is skipped by machinery that was already there rather than by a second path —
      // and everything after it, the mask, the audit line and the one-use burn, is unchanged.
      preConsent: (grant) => this.grants.allow((grant as Grant).secret),
      // `'call'`: this door mints per REQUEST and the secret is in no response body, so the cap
      // must reclaim these before any token somebody is holding — see `Grant.scope`.
      mint: (t) => this.grants.mint(t.accountId, t.entityId, t.entityName, t.kind, Date.now(), 'call'),
      describe: (grant) => GrantRegistry.describe(grant as Grant),
      note: (entry) => this.log(entry),
      perform: (res, grant, action, body, caller, rungs) =>
        this.perform(res, grant as Grant, action, body, { via: 'mcp', caller, signal }, rungs),
      consent: (grant, action, verb, summary, caller) =>
        this.gate.consent({ grant: grant as Grant, action, verb, summary, caller }, signal),
      respond: (res, status, body) => this.respond(res, status, body),
      signal,
      abandon: (grant, action, stage, caller) => this.abandoned(grant as Grant, action, stage, { via: 'mcp', caller }),
    });
  }

  /** The decision is `brokerConfigRoute.ts`; the audit sink is ours, so no door bypasses `log`. */
  private async handleConfigRead(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const answer = await answerConfigRead(req.method, req.headers.authorization, {
      ...(this.hooks.configRoute ?? {}),
      audit: (line) => this.log({ grant: line.key, entityName: line.entityName, action: 'config', outcome: line.outcome, via: 'config' }),
    });
    if (answer.status !== 200) {
      this.respondError(res, answer.status === 404 ? 'not_found' : 'unauthorized', answer.error);
      return;
    }
    this.respond(res, 200, answer.body);
  }

  private async handleAlias(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    action: string,
    signal: AbortSignal,
  ): Promise<void> {
    const read = await readNamedBody(readBody, req, 'alias', 'an "alias"');
    if (!read.ok) {
      this.respondError(res, read.code, read.message);
      return;
    }
    const body = read.body;
    const name = body.alias as string;
    const caller = callerFrom(body);

    const found = aliasTarget(this.hooks.resolveAlias, name);
    if (!found.ok) {
      this.respondError(res, found.code, found.message);
      return;
    }
    const target = found.target;

    // The rate of prompts is this route's authorization, not a nicety — see aliasThrottle.ts.
    // Checked after the name resolves so a refusal still cannot be used to learn what exists,
    // and before minting so a refused call spends nothing.
    // `true`: the alias route's authorisation IS the modal, so it always raises one.
    const slot = this.admitAliasCall(res, true);
    if (slot === undefined) {
      return;
    }

    // `'call'` for the same reason as the MCP door: one request's capability, never handed out.
    const grant = this.grants.mint(target.accountId, target.entityId, target.entityName, target.kind, Date.now(), 'call');
    this.log({
      grant: GrantRegistry.describe(grant),
      entityName: target.entityName,
      action: 'alias',
      outcome: 'minted',
      detail: `${name} · ${target.kind}`,
      caller,
    });
    try {
      await this.perform(res, grant, action, body, { via: 'alias', caller, signal });
    } finally {
      // In a `finally`, because a prompt that timed out or threw has still been shown and the
      // slot must come back — otherwise one failed call closes this route for the session.
      slot.release();
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
        this.doors.onTheSocket,
        address,
        process.platform,
      );
    } catch (error) {
      this.note(`the local socket could not be opened (${describeError(error)}); the port still works.`);
    }
  }

  /** The GET routes' suppliers — every read route answers from these three. */
  private readSources(): ReadRouteSources {
    return {
      aliases: this.hooks.listAliases,
      mcpEntries: this.hooks.listMcpEntries,
      visibleConfig: this.hooks.visibleConfig,
      // A closure, because the hooks arrive after construction and `list` needs its receiver.
      folders: () => this.folderHooks?.list() ?? [],
    };
  }

  // eslint-disable-next-line complexity
  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    // First, before anything awaits: a listener attached later could miss the client leaving.
    const signal = abandonedWhenClosed(res);

    // Health, aliases, the entries an agent may see and the folders opened to it — one kind of
    // route, described once in `brokerReadRoutes.ts`: none authenticates, none performs
    // anything, none is throttled. Everything below needs a token or raises a modal.
    const read = req.method === 'GET' ? await readRouteBody(url.pathname, this.readSources(), url.searchParams) : undefined;
    if (read !== undefined) {
      this.respond(res, 200, read);
      return;
    }

    if (req.method === 'POST' && (await this.answerMcp(req, res, url.pathname, signal))) {
      return;
    }

    if (req.method === 'POST' && parseAliasRoute(url.pathname) !== undefined) {
      await this.handleAlias(req, res, parseAliasRoute(url.pathname) as string, signal);
      return;
    }

    if (isConfigReadRoute(url.pathname)) {
      return this.handleConfigRead(req, res);
    }

    const action = parseUseRoute(url.pathname);
    if (req.method !== 'POST' || action === undefined) {
      this.respondError(res, 'not_found', 'No such endpoint.');
      return;
    }

    const authorised = grantForToken(req.headers.authorization, this.grants, grantLimits());
    if (!authorised.ok) {
      this.respondError(res, 'unauthorized', authorised.message);
      return;
    }
    const grant = authorised.grant;

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

    await this.perform(res, grant, action, body, { via: 'token', caller: callerFrom(body), signal });
  }

  /**
   * Everything after "we know which entry, and the caller may ask for it": capability check,
   * validation, consent, the call, masking, the audit line, and the one-use burn.
   *
   * <p>Extracted so the alias route reaches it too. Duplicating any of it for a second entry
   * point would be a way for consent, masking or the audit to apply to one caller and not the
   * other — and the one that gets forgotten is always the newer path.</p>
   */
  private async perform(
    res: http.ServerResponse,
    grant: Grant,
    action: string,
    body: Record<string, unknown>,
    // Which door, who the body says is calling, and this request's life. `caller` is REQUIRED —
    // `undefined` must be written, never omitted — so every door that reaches this funnel says who is
    // asking, or does not compile. It is a label for the modal and the audit line; nothing below
    // decides anything with it. `signal` fires when the client hangs up (`requestLife.ts`).
    who: RequestWho,
    /**
     * The ladder this call's entry resolved to, from the MCP lookup — the fingerprint a remembered
     * consent is recorded under. Absent on every other door, which remembers nothing.
     */
    rungs?: string,
  ): Promise<void> {
    const useAction = this.usable(res, grant, action, body, who);
    if (useAction === undefined) {
      return;
    }
    const summary = useAction.summarize(body);
    // Read BEFORE the await. A grant a policy settled at the door is already `allowed`, and a call
    // that raised no modal must not slide this entry's quiet window forward — that is how "once
    // every twelve hours" quietly becomes "once, ever".
    const asked = this.grants.get(grant.secret)?.status !== 'allowed';
    const consent = await this.gate.consent({ grant, action, verb: useAction.verb, summary, caller: who.caller }, who.signal);
    if (consent !== 'allowed') {
      this.notAllowed(res, consent, { grant, action, summary }, who);
      return;
    }
    // Only an `allowed` from a request still there reaches this line — the gate checked after its own
    // wait — so a consent nobody is waiting for is never remembered.
    await this.remember(who.via, grant, asked, rungs);
    await this.prepared(res, { grant, useAction, action, body, via: who.via, caller: who.caller, summary, signal: who.signal });
  }

  /** The capability check and the body's validation — both before anybody is asked anything. */
  private usable(
    res: http.ServerResponse,
    grant: Grant,
    action: string,
    body: Record<string, unknown>,
    who: RequestWho,
  ): UseAction | undefined {
    const useAction = this.actions.resolve(grant.kind, action);
    if (useAction === undefined) {
      this.respondError(res, 'not_supported', `"${grant.kind}" entities cannot ${action}.`, grant, action, undefined, who.via, who.caller);
      return undefined;
    }
    const validated = useAction.validate(body);
    if (!validated.ok) {
      this.respondError(res, 'invalid_request', validated.message, grant, action, undefined, who.via, who.caller);
      return undefined;
    }
    return useAction;
  }

  /**
   * After consent: the waiting rotation released and the mask table read — each only for a client still
   * there to be answered — and then the call. Every await on this path is followed by a check.
   */
  private async prepared(res: http.ServerResponse, call: Omit<CallSubject, 'table'>): Promise<void> {
    const { grant, action, summary, via, caller } = call;
    if (this.gone(call, 'after consent')) {
      return;
    }
    await this.releaseWaiting(grant);
    if (this.gone(call, 'before its values were read')) {
      return;
    }
    // Read BEFORE anything runs, and a read that will not answer refuses the call — see `tableOrFail`.
    const table = await tableOrFail(this.hooks.maskEntriesFor, grant, (why) =>
      this.respondError(res, 'internal', MASKING_UNAVAILABLE, grant, action, `${summary} · ${why}`, via, caller),
    );
    if (table === undefined) {
      return;
    }
    // The check after THIS await is `brokerCall.ts`'s, made in the same step that starts the action.
    await this.runAndDeliver(res, { ...call, table });
  }

  /** A waiting rotated value goes in FIRST, so the mask table holds the value the action will use (`brokerHooks.ts`). */
  private releaseWaiting(grant: Grant): Promise<void> {
    return Promise.resolve(this.hooks.releaseWaiting?.(grant.accountId, grant.entityId)).then(
      () => undefined,
      () => undefined,
    );
  }

  /** Whether this request's client has gone — and, when it has, its one line in the journal. */
  private gone(call: { grant: Grant; action: string; via: AuditDoor; caller: CallerLabel | undefined; signal: AbortSignal }, stage: string): boolean {
    if (!call.signal.aborted) {
      return false;
    }
    this.abandoned(call.grant, call.action, stage, call);
    return true;
  }

  /**
   * One `ABANDONED` line: the client hung up before this request was answered, so nothing was decided,
   * remembered or run for it — and nothing is written back, because nobody is there to read it.
   */
  private abandoned(grant: Grant, action: string, stage: string, who: { via: AuditDoor; caller: CallerLabel | undefined }): void {
    this.log({
      grant: GrantRegistry.describe(grant),
      entityName: grant.entityName,
      action,
      outcome: 'ABANDONED',
      detail: `the client left ${stage}`,
      via: who.via,
      caller: who.caller,
    });
  }

  /** A consent that was not given: refused on the wire — or, when the client left, abandoned. */
  private notAllowed(
    res: http.ServerResponse,
    consent: Exclude<ConsentOutcome, 'allowed'>,
    where: { grant: Grant; action: string; summary: string },
    who: RequestWho,
  ): void {
    if (consent === 'abandoned') {
      this.abandoned(where.grant, where.action, DURING_CONSENT, who);
      return;
    }
    const code: ErrorCode = consent === 'timeout' ? 'consent_timeout' : 'denied';
    this.respondError(res, code, 'The human did not allow this grant.', where.grant, where.action, where.summary, who.via, who.caller);
  }

  /**
   * A person answered a dialog for an MCP use call: let the vault remember it.
   *
   * <p>Which answers count, what a failed or slow write costs, and why neither may cost somebody
   * their call are all in `brokerConsentMemory.ts`. This hands it the four facts only the broker
   * holds.</p>
   */
  private remember(via: AuditDoor, grant: Grant, asked: boolean, rungs: string | undefined): Promise<void> {
    return recordConsent({
      remember: this.hooks.rememberMcpConsent,
      accountId: grant.accountId,
      entityId: grant.entityId,
      entityName: grant.entityName,
      via,
      asked,
      rungs,
      note: (entry) => this.log({ ...entry, grant: GrantRegistry.describe(grant) }),
    });
  }

  /** The sequence is `brokerCall.performCall`; this binds it to one request. */
  private async runAndDeliver(res: http.ServerResponse, call: CallSubject): Promise<void> {
    const { grant, action, summary, via, caller } = call;
    await performCall(
      {
        grants: this.grants,
        lane: this.oneUse,
        isOneUse: this.hooks.isOneUse,
        respond: (status, sent) => this.respond(res, status, sent),
        log: (line) => this.log(line),
        refuse: (code, message) => this.respondError(res, code, message, grant, action, summary, via, caller),
        failed: (why, ran) =>
          this.respondError(res, 'internal', INTERNAL_FAILURE, grant, action, `${summary} - ${why}`, via, caller, ran),
        refresh: refreshFrom(this.hooks.maskEntriesFor, grant),
        burn: (status) => burnAndMark(this.oneUse, this.hooks.burnAfterUse, this.hooks.isOneUse, grant, status, this.note),
        abandon: (stage) => this.abandoned(grant, action, stage, call),
      },
      call,
    );
  }

  /** The router, behind one door per listener — see `brokerOrigin.ts` for why, and why two. */
  private readonly doors = doorsFor(
    (req, res) => void this.handle(req, res),
    () => this.port,
    (res, status, body) => this.respond(res, status, body),
    (message) => this.note(message),
  );

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
    // Which door the refusal came in by. A refused call is the interesting half of an agent's
    // record — what it asked for and was told no — so a line that could not say which door it
    // arrived at would be missing from exactly the view that wants it most.
    via?: AuditDoor,
    /** Who the body said was calling — on the line, so a refusal can be matched to a session. */
    caller?: CallerLabel,
    /** The side effect may have happened anyway — see `errorBody`. */
    actionRan?: boolean,
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
        via,
        caller,
      });
    }
    this.respond(res, statusForErrorCode(code), errorBody(code, message, actionRan));
  }

  /**
   * The one funnel every line goes through — with the caller still a LABEL, composed into its
   * audit form here and nowhere else, so no door can render it differently from the modal.
   */
  private log(entry: Omit<AuditEntry, 'at' | 'caller'> & { caller?: CallerLabel }): void {
    // Numbered because nothing caps how many calls one grant may make. A ceiling
    // would have to guess a number; a running count costs nothing and shows a
    // runaway agent loop to whoever reads the file afterwards.
    this.calls += 1;
    const line = formatAuditLine({ ...entry, caller: callerForAudit(entry.caller), at: new Date(), seq: this.calls });
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

/** Which door a request came in by, who its body says is calling, and its life (`requestLife.ts`). */
interface RequestWho {
  readonly via: AuditDoor;
  readonly caller: CallerLabel | undefined;
  readonly signal: AbortSignal;
}
