import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  ErrorCode,
  HealthBody,
  MAX_CONCURRENT_EXECS,
  MAX_REQUEST_BODY_BYTES,
  SERVICE_NAME,
  errorBody,
  parseBearer,
  parseJsonObject,
  parseUseRoute,
  statusForErrorCode,
} from './brokerProtocol';
import { Grant, GrantExpiry, GrantLimits, GrantLookup, GrantRegistry } from './grantRegistry';
import { UseActionRegistry } from './useActions';
import { formatToken } from './grantToken';
import { formatAuditLine } from './agentAuditLog';
import {
  AUDIT_RETAIN_DAYS,
  auditDayFolder,
  auditFileName,
  auditLogsToPrune,
} from './agentAuditFile';
import { startLoopbackServer } from './loopbackServer';
import { startOnce } from './idempotentStart';

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
  private readonly consenting = new Map<string, Promise<boolean>>();
  private readonly abort = new AbortController();
  private output: vscode.OutputChannel | undefined;
  // Shares one in-flight start, but forgets a FAILED one so a transient bind error does not
  // disable the feature for the window's life. See startOnce.
  private readonly beginStart = startOnce<void>();
  private server: http.Server | undefined;
  private port = 0;
  private running = 0;

  /**
   * Where this window's audit is written, and how many calls it has recorded.
   *
   * <p>The output channel alone was a buffer in the window — and since closing the
   * window is ALSO how a grant is revoked, the record died at the moment it became
   * history. The shared logging rule had already required a file per run for exactly
   * this reason; the broker simply had not followed it.</p>
   */
  private auditPath: string | undefined;
  // Audit appends run off the UI thread but in order — each awaits the previous. See appendToFile.
  private auditQueue: Promise<void> = Promise.resolve();
  private calls = 0;

  constructor(
    private readonly actions: UseActionRegistry,
    private readonly onUserPresent: () => void,
    private readonly storageDir?: string,
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
      this.openAuditFile();
      const { server, port } = await startLoopbackServer();
      this.server = server;
      this.port = port;
      server.on('request', (req, res) => void this.handle(req, res));
    });
  }

  // eslint-disable-next-line complexity, max-lines-per-function
  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    // Health carries no authorization on purpose: it is what lets the CLI
    // confirm this port still belongs to us BEFORE it sends a token to it.
    if (req.method === 'GET' && url.pathname === '/v1/health') {
      const body: HealthBody = { ok: true, service: SERVICE_NAME };
      this.respond(res, 200, body);
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
      this.log({
        grant: GrantRegistry.describe(grant),
        entityName: grant.entityName,
        action,
        outcome:
          result.status === 200 ? useAction.describeOutcome(result) : String(result.status),
        detail: summary,
      });
      this.respond(res, result.status, result.body);
    } catch (error) {
      this.respondError(
        res,
        'internal',
        error instanceof Error ? error.message : String(error),
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
    this.appendToFile(line);
  }

  /**
   * The durable half. Best-effort in every direction: an unwritable storage
   * directory must not stop the broker from serving, because a missing audit line
   * is a smaller harm than a credential feature that refuses to work.
   *
   * <p>Appends are asynchronous and chained: they no longer block the extension-host
   * thread on every broker call (a busy agent loop was a steady drip of synchronous disk
   * I/O on the UI thread), and chaining onto the previous write preserves line order — a
   * fire-and-forget append could interleave two lines.</p>
   */
  private appendToFile(line: string): void {
    const target = this.auditPath;
    if (target === undefined) {
      return;
    }
    this.auditQueue = this.auditQueue.then(() =>
      fs.promises.appendFile(target, `${line}\n`, 'utf8').then(undefined, () => undefined),
    );
  }

  /** Open this run's file and sweep whatever has aged out. */
  private openAuditFile(): void {
    if (this.storageDir === undefined) {
      return;
    }
    const startedAt = new Date();
    const root = path.join(this.storageDir, 'logs');
    const day = auditDayFolder(startedAt);
    try {
      fs.mkdirSync(path.join(root, day), { recursive: true });
      this.auditPath = path.join(root, day, auditFileName(startedAt, process.pid));
      this.sweepOldAudits(root, startedAt);
    } catch {
      this.auditPath = undefined;
    }
  }

  private sweepOldAudits(root: string, now: Date): void {
    try {
      const found = fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((dir) =>
          fs.readdirSync(path.join(root, dir.name)).map((fileName) => ({ day: dir.name, fileName })),
        );
      for (const stale of auditLogsToPrune(found, AUDIT_RETAIN_DAYS, now)) {
        fs.rmSync(path.join(root, stale.day, stale.fileName), { force: true });
      }
    } catch {
      // A folder we cannot read is a folder we do not prune.
    }
  }

  dispose(): void {
    this.abort.abort();
    this.server?.close();
    this.server = undefined;
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
