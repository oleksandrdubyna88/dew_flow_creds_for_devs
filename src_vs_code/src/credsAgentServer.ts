import * as http from 'node:http';
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
import { Grant, GrantRegistry } from './grantRegistry';
import { UseActionRegistry } from './useActions';
import { formatToken } from './grantToken';
import { formatAuditLine } from './agentAuditLog';
import { startLoopbackServer } from './loopbackServer';

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

export class CredsAgentServer implements vscode.Disposable {
  private readonly grants = new GrantRegistry();
  private readonly consenting = new Map<string, Promise<boolean>>();
  private readonly abort = new AbortController();
  private output: vscode.OutputChannel | undefined;
  private starting: Promise<void> | undefined;
  private server: http.Server | undefined;
  private port = 0;
  private running = 0;

  constructor(
    private readonly actions: UseActionRegistry,
    private readonly onUserPresent: () => void,
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
    this.output?.appendLine(
      formatAuditLine({ at: new Date(), grant: '—', entityName: '', action: 'note', outcome: message }),
    );
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
    this.starting ??= (async () => {
      this.output ??= vscode.window.createOutputChannel('CredsForDevs: Agent Access');
      const { server, port } = await startLoopbackServer();
      this.server = server;
      this.port = port;
      server.on('request', (req, res) => void this.handle(req, res));
    })();
    return this.starting;
  }

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
    const grant = secret === undefined ? undefined : this.grants.get(secret);
    if (grant === undefined) {
      this.respondError(res, 'unauthorized', 'Unknown or missing grant token.');
      return;
    }

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

  private async ask(
    grant: Grant,
    action: string,
    verb: string,
    summary: string,
  ): Promise<boolean> {
    const choice = await withTimeout(
      Promise.resolve(
        vscode.window.showWarningMessage(
          `Claude Code wants to ${verb} ` +
            `"${grant.entityName}" using its stored credential.\n\n${summary}\n\n` +
            'Allowing covers every later call on this token, for as long as this window stays open. ' +
            'Each one is logged in the "CredsForDevs: Agent Access" output panel.',
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
    this.output?.appendLine(formatAuditLine({ ...entry, at: new Date() }));
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
