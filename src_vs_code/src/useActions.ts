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

import type { BridgeContext } from './bridgeContext';
import type { ErrorCode } from './brokerProtocol';
import type { JumpChain } from './sshOptions';
import type { EntityMetadata } from './types';

/** What a call is aimed at, as a grant names it: enough to read the live entity. */
export type CallTarget = Pick<UseActionContext, 'accountId' | 'entityId' | 'entityName'>;

/** Whether an action may prompt after the Allow: always, never, or by the call's target. */
export type FollowUp = boolean | ((target: CallTarget) => boolean);

/** The flag read for one call: a boolean as it is, a function asked with the target. */
export function asksAfter(action: Pick<UseAction, 'asksAfterConsent'>, target: CallTarget): boolean {
  const flag = action.asksAfterConsent;
  return typeof flag === 'function' ? flag(target) : flag === true;
}

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
  /**
   * Set when the call came in through a Remote Bridge: which one, and for which server. Never the key, and
   * never `quiet` or a spent token, which the grant's nested `BridgeGrant` keeps out of it. An action that
   * resolves a `creds://` reference reads values through `scopedRefSource` whenever this is set (E3.3).
   */
  readonly bridge?: BridgeContext;
  /**
   * Set by the broker: a prompt of this action's own was answered after the call had ended (the client left while it stood). Writes the late-answer
   * line with the grant, and decides nothing. Absent for a start that serves no request (the person's own click). Read by nothing but the late road of
   * a question the action raced against its request's life (`untilGone`'s `onLate`).
   */
  readonly lateAnswer?: (what: string) => void;
  /**
   * Set by the broker: a prompt of this action's own is on screen; the one dialog place is that prompt's until it settles. Absent for a start that serves no request.
   */
  readonly standingPrompt?: (prompt: PromiseLike<unknown>) => void;
}

/**
 * The signals an action that launches a child process hands its launcher (`sshExecRunner.ts`).
 *
 * <p>`signal` lists what the launched child is killed by — the window's end and the request's end —
 * except for work that must finish once started ({@link UseActionContext.finishOnceStarted}), which only
 * the window's end stops. `startGate` is the request: once it has fired nothing is launched, whichever
 * kind of work it is (the launcher also refuses for a fired kill signal). Shaped as the launcher's own
 * option names, so a call site spreads it and cannot cross them.</p>
 *
 * <p>A list, never an `AbortSignal.any` composite: on Node 20 a composite stays referenced from the
 * window's long-lived signal after it is done, one per call, for the window's life.</p>
 */
export function launchGuards(window: AbortSignal, ctx: UseActionContext): { signal: readonly AbortSignal[]; startGate: AbortSignal } {
  return { startGate: ctx.signal, signal: ctx.finishOnceStarted === true ? [window] : [window, ctx.signal] };
}

/** A validated action outcome, shaped as the broker's HTTP response. */
export interface UseActionResult {
  readonly status: number;
  readonly body: unknown;
}

/**
 * One command run over SSH, as the caller decided it (E3.S2, E3-D9): the SSH entry AS THE CALLER READ IT (one snapshot), the chain of
 * its jump hosts as a thunk (so `ssh:exec` keeps resolving it AFTER the credential, as it always did), the ONE remote argument,
 * and the bound on the run.
 */
export interface OverSshCall {
  readonly ssh: EntityMetadata;
  readonly jump: () => JumpChain;
  readonly remoteCommand: string;
  readonly timeoutMs: number;
}

/**
 * `execOverSsh`'s shape (`sshUseActions.ts`): credential, argv, spawn, answer, key file removed. Injected into the actions that
 * run over SSH, so a module that imports no `vscode` can start an ssh without importing the one that does.
 */
export type OverSsh = (ctx: UseActionContext, call: OverSshCall) => Promise<UseActionResult>;

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
  /**
   * This action may put a prompt of its own on screen after the person's Allow (a PIN box, a trust modal, an install offer, a
   * signing modal). Absent = no. The broker then keeps the one dialog place until the call ends, so no second modal opens over that
   * prompt (Amendment 3, C.3; the parent's §4.10, the follow-up contract). A boolean for an action that always may
   * (`create`, `terminal`, `up`, `down`, `rotate`); a function of the call's target for one that may on some entries only: `exec`,
   * on an entry that forwards the agent while the agent socket is up (the signing prompt arrives through the socket), read when the dialog
   * closes on an Allow (`ConsentQuestion.followUp`), not before it opens: the socket may come up or go down while the dialog is on screen.
   * `query`, `run` and a non-forwarding `exec` keep nothing once the dialog closes.
   */
  readonly asksAfterConsent?: FollowUp;

  /**
   * `code` is the error code the refusal answers with; absent, it is `invalid_request` — a malformed
   * body. A well-formed request this window refuses on purpose (an export into another computer's
   * terminals) names `denied`: a client does not read it as its own mistake, and, unlike a 404, does
   * not read it as "this window does not have the entry" and go looking in the next one.
   */
  validate(body: unknown): { ok: true } | { ok: false; message: string; code?: ErrorCode };
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
