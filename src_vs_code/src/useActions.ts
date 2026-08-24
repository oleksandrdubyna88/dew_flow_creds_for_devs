/**
 * The seam that lets the broker serve more than SSH later. Every capability an
 * agent can invoke is a `UseAction` registered under a `(kind, action)` pair —
 * `(ssh, exec)`, `(ssh, terminal)` today; `(db, query)`, `(vpn, up)` the day a
 * second entity kind wants in, with no change to the broker's HTTP layer.
 *
 * The registry is pure and `vscode`-free: `register`/`resolve` and the
 * duplicate-registration guard are a unit test. The action objects it holds
 * may close over impure dependencies (storage, a process spawner) — the
 * registry neither knows nor cares.
 */

/** Where in the vault the grant points; the live entity is re-read per call. */
export interface UseActionContext {
  readonly accountId: string;
  readonly entityId: string;
  readonly entityName: string;
}

/** A validated action outcome, shaped as the broker's HTTP response. */
export interface UseActionResult {
  readonly status: number;
  readonly body: unknown;
}

export interface UseAction {
  readonly kind: string;
  readonly action: string;
  /**
   * How the consent dialog names this capability, as a verb phrase completing
   * "Claude Code wants to …" — e.g. `run a command on`. It lives on the action
   * because the broker must not know what actions exist: the first version
   * chose the wording with `action === 'exec' ? … : …`, which would have
   * offered to "open a terminal to" a database the day a second kind arrived.
   */
  readonly verb: string;
  /** Reject a malformed body before any dialog or side effect. */
  validate(body: unknown): { ok: true } | { ok: false; message: string };
  /** One line for the first-use consent dialog (e.g. the command about to run). */
  summarize(body: unknown): string;
  /** Describe a finished call for the audit line (e.g. `exit 0`, `opened`). */
  describeOutcome(result: UseActionResult): string;
  /** Perform the action. Called only after validation and consent. */
  run(ctx: UseActionContext, body: unknown): Promise<UseActionResult>;
}

function key(kind: string, action: string): string {
  return `${kind}:${action}`;
}

export class UseActionRegistry {
  private readonly actions = new Map<string, UseAction>();

  /** Register one action. Throws on a duplicate `(kind, action)` — a wiring bug caught at startup, not silently shadowed. */
  register(action: UseAction): void {
    const k = key(action.kind, action.action);
    if (this.actions.has(k)) {
      throw new Error(`Duplicate use-action registration: ${k}`);
    }
    this.actions.set(k, action);
  }

  resolve(kind: string, action: string): UseAction | undefined {
    return this.actions.get(key(kind, action));
  }
}
