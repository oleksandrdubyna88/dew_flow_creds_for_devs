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
  /**
   * The life of the request this call serves: it fires when the client that asked hung up
   * (`requestLife.ts`). REQUIRED, so every start says which request it is for — a start that could
   * omit it is how an action came to run for a client that was gone (`PLAN_wsl_bridge_outlives_its_client.md`
   * §2.3). An action that launches anything refuses to launch once it has fired, and cancels what it
   * launched when it fires later — see {@link launchGuards}.
   */
  readonly signal: AbortSignal;
  /**
   * Set by a wrapper whose started work must run to its end even if the client leaves: a rotation,
   * whose statement may already have changed the far side, and whose new value the vault stores only
   * after that statement succeeds. Killing it half-way would lose the credential. The start is still
   * refused once the request has gone; only an already-started run is left to finish.
   */
  readonly finishOnceStarted?: boolean;
}

/**
 * The two signals an action that launches a child process hands its launcher (`sshExecRunner.ts`).
 *
 * <p>`startGate` fires when either the window or the request has gone — nothing is launched after it.
 * `signal` is what the launched child is killed by: the same, except for work that must finish once
 * started ({@link UseActionContext.finishOnceStarted}), which only the window's end stops. Shaped as
 * the launcher's own option names, so a call site spreads it and cannot cross the two.</p>
 */
export function launchGuards(window: AbortSignal, ctx: UseActionContext): { signal: AbortSignal; startGate: AbortSignal } {
  const startGate = AbortSignal.any([window, ctx.signal]);
  return { startGate, signal: ctx.finishOnceStarted === true ? window : startGate };
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
   * "<caller> wants to …" — e.g. `run a command on`, where the caller is whoever
   * the request body reports (`brokerCaller.ts`) and "An agent" when it reports
   * nothing. It lives on the action because the broker must not know what
   * actions exist: the first version chose the wording with
   * `action === 'exec' ? … : …`, which would have offered to "open a terminal
   * to" a database the day a second kind arrived.
   */
  readonly verb: string;
  /** Reject a malformed body before any dialog or side effect. */
  /**
   * Whether this action can WRITE a stored secret while it runs.
   *
   * <p>Required, not optional, and declared on the ACTION rather than reported by its result — both
   * on the review gate's insistence, and both for the same reason: a new action that writes a
   * credential must decide this where it is defined, or it does not compile. An optional field
   * reported afterwards is a measure applied at some of its sites, which is this codebase's most
   * repeated defect and exactly what audit finding #1 was.</p>
   *
   * <p>What it decides: a rotation stores its new value DURING the run, so no table read from
   * before the run can contain it. Only such an action is worth re-reading storage for, and only
   * such an action must have its output WITHHELD when that re-read fails — falling back to the
   * pre-run table there would mask the old credential and send the fresh one in the clear.</p>
   *
   * <p>A boolean, never the values: handing the secret back through the result would put it in the
   * same object as the response body, which is the one place this design keeps it out of.</p>
   */
  readonly mutatesSecrets: boolean;

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

  /**
   * Every capability a grant of this kind buys — in registration order.
   *
   * <p>Exists for the consent dialog: consent is per GRANT, so an Allow given for "open a
   * terminal" also authorises every other action of the kind. The dialog must say so in
   * the words of those actions, and only the registry knows what they are.</p>
   */
  actionsFor(kind: string): UseAction[] {
    return [...this.actions.values()].filter((action) => action.kind === kind);
  }
}
