import * as vscode from 'vscode';
import { CONSENT_TIMEOUT_MS } from './agentConsent';
import type { AuditEntry } from './agentAuditLog';
import { CALLER_DISCLAIMER, CallerLabel, callerLine } from './brokerCaller';
import type { ConsentOutcome } from './brokerMcpDoor';
import { describeLimits, grantLimits } from './grantLimits';
import { Grant, GrantRegistry } from './grantRegistry';
import { localRequestTimeLine } from './requestTime';
import { ABANDONED, SharedPrompts } from './sharedPrompt';
import type { UseActionRegistry } from './useActions';
import { withTimeout } from './withTimeout';

/**
 * The first-use gate: the Allow/Deny modal a grant's first call raises, and what an answer does.
 *
 * <p>Out of `credsAgentServer.ts`, which sits at its 800-line ceiling, when this gate learned the one
 * thing it was missing: that the request asking may be gone by the time somebody answers
 * (`PLAN_wsl_bridge_outlives_its_client.md` §2.3, §5.7). Concurrent first calls on one grant share one
 * modal — two modals for one token is a bug the person experiences as a stuck agent — and that sharing
 * now lives in `sharedPrompt.ts`, which is where a request that has gone detaches from it.</p>
 *
 * <p>A dismissed dialog (Escape) is a one-off refusal that is NOT recorded: a mis-click must not lock an
 * agent out for the window's life. Only an explicit Deny is sticky, and a timeout leaves the grant
 * re-promptable — a missed notification is the common case, not a decision. A click on a prompt whose
 * every request has gone is neither: it decides nothing and says so in the journal.</p>
 */

/** What the gate needs from the broker. */
export interface ConsentGateDeps {
  readonly grants: GrantRegistry;
  readonly actions: UseActionRegistry;
  /** The one moment a person is provably present. */
  onUserPresent(): void;
  log(entry: Omit<AuditEntry, 'at' | 'caller'> & { caller?: CallerLabel }): void;
}

/** One consent question, as the broker asks it. */
export interface ConsentQuestion {
  readonly grant: Grant;
  readonly action: string;
  readonly verb: string;
  readonly summary: string;
  readonly caller: CallerLabel | undefined;
}

export class ConsentGate {
  private readonly prompts = new SharedPrompts<boolean>();

  constructor(private readonly deps: ConsentGateDeps) {}

  /**
   * Whether this grant may be used, asked of the person when nobody has answered for it yet.
   *
   * <p>`abandoned` when `signal` — the request's own life — fired first, before or while the person was
   * being asked. Checked again after the wait, because the answer and the hang-up can arrive in either
   * order, and a request that has gone is owed nothing but its line in the journal.</p>
   */
  async consent(question: ConsentQuestion, signal: AbortSignal): Promise<ConsentOutcome> {
    const before = signal.aborted ? 'abandoned' : this.known(question.grant);
    if (before !== undefined) {
      return before;
    }
    const answered = await this.prompts.join(question.grant.secret, signal, (stillWanted) => this.ask(question, stillWanted));
    return this.after(question.grant, answered, signal);
  }

  /** The wait is over: abandoned if this request left first or meanwhile, else what the grant now says. */
  private after(grant: Grant, answered: boolean | typeof ABANDONED, signal: AbortSignal): ConsentOutcome {
    if (answered === ABANDONED || signal.aborted) {
      return 'abandoned';
    }
    return this.known(grant) ?? unsettled(answered);
  }

  /** What this grant already says — `undefined` while nobody has answered for it. */
  private known(grant: Grant): 'allowed' | 'denied' | undefined {
    const status = this.deps.grants.get(grant.secret)?.status;
    return status === 'allowed' || status === 'denied' ? status : undefined;
  }

  private async ask(question: ConsentQuestion, stillWanted: () => boolean): Promise<boolean> {
    const choice = await withTimeout(
      Promise.resolve(vscode.window.showWarningMessage(this.wording(question), { modal: true }, 'Allow', 'Deny')),
      CONSENT_TIMEOUT_MS,
      // The HTTP server keeps this process alive; the timer need not.
      { unref: true },
    );
    // The defused modal (§3.3): it could not be closed when its requests left, so the answer it gives
    // after that is read here and applied to nothing.
    if (!stillWanted()) {
      this.ignored(question, choice);
      return false;
    }
    return this.apply(question, choice);
  }

  /** Allow or Deny, applied to the grant; anything else refuses this call and leaves it re-promptable. */
  private apply(question: ConsentQuestion, choice: string | undefined): boolean {
    if (choice !== 'Allow' && choice !== 'Deny') {
      return false;
    }
    // Agent traffic after this deliberately does NOT postpone auto-lock: a long unattended run is
    // exactly what the idle window exists to catch.
    this.deps.onUserPresent();
    return choice === 'Allow' ? this.allow(question) : this.deny(question);
  }

  private allow(question: ConsentQuestion): true {
    this.deps.grants.allow(question.grant.secret);
    this.line(question, 'ALLOWED', 'first use consented');
    return true;
  }

  private deny(question: ConsentQuestion): false {
    this.deps.grants.deny(question.grant.secret);
    this.line(question, 'DENIED', 'first use refused');
    return false;
  }

  /** A click on a prompt nobody waits for any more: one line, nothing decided. A timeout says nothing. */
  private ignored(question: ConsentQuestion, choice: string | undefined): void {
    if (choice === 'Allow' || choice === 'Deny') {
      this.line(question, 'ignored', `"${choice}" answered after the request had gone — nothing decided`);
    }
  }

  private line(question: ConsentQuestion, outcome: string, detail: string): void {
    const { grant, action, caller } = question;
    this.deps.log({ grant: GrantRegistry.describe(grant), entityName: grant.entityName, action, outcome, detail, caller });
  }

  /**
   * The modal's text.
   *
   * <p>Consent is per GRANT, so one Allow authorises every action of this kind — not only the one that
   * triggered the dialog. The dialog has to say so in those actions' own words, or "open a terminal" is
   * what the person reads while "run any command" is what they grant. WHO is asking comes from the body
   * — "An agent" when it says nothing, never a product name by default — and is a label, not a check;
   * the next sentence tells the person so, because a name mistaken for a verification is worse than no
   * name.</p>
   */
  private wording(question: ConsentQuestion): string {
    const { grant, verb, summary, caller } = question;
    const everything = this.deps.actions
      .actionsFor(grant.kind)
      .map((a) => a.verb)
      .join(', or ');
    return (
      `${callerLine(caller)} wants to ${verb} ` +
      // WHEN (#131): fixed as the dialog is raised, so one left waiting keeps the time it was asked.
      `"${grant.entityName}" using its stored credential.\n${localRequestTimeLine(new Date())}\n\n${summary}\n\n` +
      `${CALLER_DISCLAIMER}\n\n` +
      `Allowing covers every later call on this token, not just this one: with it the agent can ${everything} "${grant.entityName}" ` +
      `${describeLimits(grantLimits())}. ` +
      'Each call is logged in the "CredsForDevs: Agent Access" output panel.'
    );
  }
}

/** An answer that settled nothing on the grant: Allow that was not recorded reads as allowed, the rest as a timeout. */
function unsettled(allowed: boolean): ConsentOutcome {
  return allowed ? 'allowed' : 'timeout';
}
