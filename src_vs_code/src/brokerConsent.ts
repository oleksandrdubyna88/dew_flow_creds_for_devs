import * as vscode from 'vscode';
import { CONSENT_TIMEOUT_MS } from './agentConsent';
import type { AuditDoor, AuditEntry } from './agentAuditLog';
import { bridgeCoverageLine, bridgeModalLine, bridgeQuotedName, bridgeRunSite, consentButtons } from './bridgeConsentText';
import { CALLER_DISCLAIMER, CallerLabel, callerLine } from './brokerCaller';
import type { ConsentOutcome } from './brokerMcpDoor';
import { describeLimits, grantLimits } from './grantLimits';
import { Grant, GrantRegistry, GrantScope } from './grantRegistry';
import { ASK_WINDOW_MS } from './mcpConsentPolicy';
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
 * every request has gone, or whose call timed out, is neither: it decides nothing and says so in the
 * journal, and tells the person in a notice (E1.5).</p>
 *
 * <p><b>The place is the dialog's until a person acts on it, never a timer's</b> (parent §4.10). The call's wait ends
 * at `CONSENT_TIMEOUT_MS` and the call is answered `timeout`; the dialog stays on screen (VS Code cannot take a modal
 * down) and keeps the one dialog place. Whatever ends the dialog afterwards (a click, an Escape, a failure) frees the
 * place and decides nothing ({@link ConsentGate.lateAnswer}).</p>
 */

/** What the gate needs from the broker. */
export interface ConsentGateDeps {
  readonly grants: GrantRegistry;
  readonly actions: UseActionRegistry;
  /** The one moment a person is provably present. */
  onUserPresent(): void;
  log(entry: Omit<AuditEntry, 'at' | 'caller'> & { caller?: CallerLabel }): void;
  /**
   * A dialog is about to be shown for this question: the one moment a prompt is SPENT (`aliasThrottle.ts`). A call refused
   * before it got here showed nobody anything and costs nothing; one that joins a dialog already open shows nothing new.
   */
  prompted?(question: ConsentQuestion): void;
  /**
   * The dialog raised for this question is gone: answered or dismissed by a person (a modal that failed is read the same way).
   * The one place a dialog holds is given back here (`aliasThrottle.ts`), not when the call that raised it ends and never at
   * the call's timeout — a client that leaves, or a wait that runs out, does not take the modal off the screen. `keep`: the person Allowed and the call may put a prompt of its own on screen next
   * (`ConsentQuestion.followUp`), so the place stays the call's until the call ends (Amendment 3, C.3).
   */
  dialogClosed?(question: ConsentQuestion, keep: boolean): void;
}

/**
 * What an Allow on this question covers — which of the dialog's three last paragraphs is true.
 *
 * <p>`token`: every later call on the token. `call`: this call only. `every12h`: this call, and the
 * entry's policy opens a bounded window on this machine. Decided by the door that asks, from facts it
 * holds, and never by the wording: see {@link coverageOf}.</p>
 */
export type ConsentCoverage = 'token' | 'call' | 'every12h';

/**
 * The coverage of an Allow, from the grant's scope and whether the entry's policy remembers answers.
 *
 * <p>A token grant never remembers — it already covers the token's life, and the flag cannot widen it.
 * A call grant covers one request, unless the MCP door's policy writes a stamp for it.</p>
 */
export function coverageOf(scope: GrantScope, remembers: boolean): ConsentCoverage {
  if (scope === 'token') {
    return 'token';
  }
  return remembers ? 'every12h' : 'call';
}

/**
 * Whether an answered dialog may write the remembered window: only one that was ASKED and that said so.
 *
 * <p>The stamp must never be wider than the sentence the person read. A dialog that said *this call
 * only* writes nothing whatever the entry's policy says at the click — the policy can turn to
 * `every12h` while the modal is open, and the write re-reads it. A call that raised no dialog
 * (`asked` false) writes nothing either, so a quiet call cannot slide the window forward.</p>
 */
export function opensWindow(question: ConsentQuestion, asked: boolean): boolean {
  return asked && question.coverage === 'every12h';
}

/** One consent question, as the broker asks it. */
export interface ConsentQuestion {
  readonly grant: Grant;
  readonly action: string;
  readonly verb: string;
  readonly summary: string;
  readonly caller: CallerLabel | undefined;
  /** The door the call came in by: a local token call raises dialogs that are not throttled, a bridged one is counted on its bridge. */
  readonly via: AuditDoor;
  /**
   * The call may show a prompt of its own after an Allow (a PIN box, a trust modal): the place is kept until the call ends. A function is
   * asked WHEN THE DIALOG CLOSES on an Allow, not before it opens (change 6.1): what decides it may change while the dialog is open
   * (the agent's socket coming up).
   */
  readonly followUp?: boolean | (() => boolean);
  /** REQUIRED, like `caller`: a door added later does not compile until it says what its Allow covers. */
  readonly coverage: ConsentCoverage;
}

/** Whether the question's call may prompt again, read now. A flag that cannot be read keeps nothing: the place is not held on a guess. */
function followsUp(question: ConsentQuestion): boolean {
  try {
    return typeof question.followUp === 'function' ? question.followUp() : question.followUp === true;
  } catch {
    return false;
  }
}

/** Hours in the remembered window — derived from the policy's own constant, never typed twice. */
const WINDOW_HOURS = ASK_WINDOW_MS / 3_600_000;

/** One request's grant: nothing is written, nothing later is covered. */
const CALL_TAIL = 'Allowing covers this call only, not any later one. ';

/**
 * The `every12h` sentence, with the verbs it can quiet. Written to be true of what the code does:
 *
 * <p>*Later MCP calls* because only that door reads a stamp; *from any agent* because the stamp is per
 * entry and per store, not per caller; the verb list because the stamp is per ENTRY, not per action, so
 * an Allow on one verb quiets every verb the switches allow (rotating the stored secret among them);
 * *may … because of this Allow* because the write can still refuse at the click, and under `never` a
 * call is quiet by policy rather than by this answer; *only while* because a policy or switch change
 * suspends a stamp and changing back resumes it, it does not end it.</p>
 */
function windowTail(entityName: string, everything: string): string {
  return (
    `Allowing covers this call. For up to ${WINDOW_HOURS} hours on this machine, later MCP calls from any agent to ${everything} "${entityName}" ` +
    `may also skip asking because of this Allow — only while this entry is set to "Ask once every ${WINDOW_HOURS} hours" ` +
    'and its agent switches are as they are now. Deleting still asks. '
  );
}

/**
 * How the modal ended. NEVER `undefined` and NEVER a rejection: `undefined` is reserved for the timer (see {@link ConsentGate.ask}), and a
 * rejected modal (the window going down under it) is an end like any other.
 */
type DialogEnd = { kind: 'answered'; choice: string | undefined } | { kind: 'failed'; error: unknown };

/** The button a person clicked, or `undefined` for an Escape and for a modal that failed. */
function choiceOf(end: DialogEnd): string | undefined {
  return end.kind === 'answered' ? end.choice : undefined;
}

/** Whether an Allow keeps the place: the person Allowed, and the call may put a prompt of its own on screen next. */
function keepsPlace(question: ConsentQuestion, end: DialogEnd): boolean {
  return choiceOf(end) === 'Allow' && followsUp(question);
}

/** The notice a person sees when they click a dialog whose call had already ended: said once, in words, because the click did nothing. */
export const LATE_ANSWER_NOTICE = 'That request had already ended, so this answer changed nothing.';

export class ConsentGate {
  private readonly prompts = new SharedPrompts<ConsentOutcome>();

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
  private after(grant: Grant, answered: ConsentOutcome | typeof ABANDONED, signal: AbortSignal): ConsentOutcome {
    if (answered === ABANDONED || signal.aborted) {
      return 'abandoned';
    }
    return this.known(grant) ?? answered;
  }

  /** What this grant already says — `undefined` while nobody has answered for it. */
  private known(grant: Grant): 'allowed' | 'denied' | undefined {
    const status = this.deps.grants.get(grant.secret)?.status;
    return status === 'allowed' || status === 'denied' ? status : undefined;
  }

  /**
   * Show the dialog and read how it ended.
   *
   * <p>ARBITRATION, stated once: `withTimeout` settles exactly once. `end === undefined` is the one fact that says the timer settled the call
   * (a {@link DialogEnd} is never `undefined`), so there is no third reading. Whatever the dialog does after the timer settled the call (a click,
   * a dismissal, a rejection) is read by {@link lateAnswer} and by nothing else: {@link apply} is unreachable from there.</p>
   */
  private async ask(question: ConsentQuestion, stillWanted: () => boolean): Promise<ConsentOutcome> {
    this.deps.prompted?.(question);
    const dialog = this.shown(question);
    const end = await withTimeout(dialog, CONSENT_TIMEOUT_MS, { unref: true });
    return end === undefined ? this.timedOut(question, dialog) : this.answered(question, end, stillWanted);
  }

  /** The timer won: the call is answered, the dialog stands. The continuation is attached HERE, after the timer, so an answer landing in the same tick still takes the late road. */
  private timedOut(question: ConsentQuestion, dialog: Promise<DialogEnd>): ConsentOutcome {
    // The late road decides nothing, so a throw from it (a journal that cannot be written) must not become an unhandled rejection.
    void dialog.then((late) => this.lateAnswer(question, late)).catch(() => undefined);
    return 'timeout';
  }

  /**
   * The dialog ended before the timer. The waiter FIRST, the flag after: an Allow nobody waits for never keeps the place. The defused modal (§3.3)
   * could not be closed when its requests left, so the answer it gives after that is read here and applied to nothing.
   */
  private answered(question: ConsentQuestion, end: DialogEnd, stillWanted: () => boolean): ConsentOutcome {
    if (!stillWanted()) {
      this.deps.dialogClosed?.(question, false);
      this.ignored(question, end);
      return 'timeout';
    }
    // The flag is read HERE, on an Allow, with the dialog's own answer, as change 6.1 built it.
    this.deps.dialogClosed?.(question, keepsPlace(question, end));
    return this.apply(question, end);
  }

  /**
   * The one dialog promise: the modal with the door's buttons, wrapped once so it settles with a {@link DialogEnd} on every road. The method keeps
   * its name so the prompt-site ledger row keeps its id.
   */
  private shown(question: ConsentQuestion): Promise<DialogEnd> {
    // The executor runs synchronously, so a modal that throws before it opens becomes the rejection the handler below reads as a failed end.
    return new Promise<string | undefined>((resolve) => resolve(vscode.window.showWarningMessage(this.wording(question), { modal: true }, ...consentButtons(question.grant.bridge !== undefined)))).then(
      (choice): DialogEnd => ({ kind: 'answered', choice }),
      (error: unknown): DialogEnd => ({ kind: 'failed', error }),
    );
  }

  /**
   * The standing dialog of a call that was answered `timeout`: whatever ends it frees the place (`keep` false) and decides nothing. Never {@link apply}:
   * no `allow`, `deny`, `onUserPresent` or `remember` is reachable from here.
   */
  private lateAnswer(question: ConsentQuestion, end: DialogEnd): void {
    this.deps.dialogClosed?.(question, false);
    this.ignored(question, end);
  }

  /**
   * Allow or Deny, applied to the grant. Anything else — Escape, or a modal that failed before the timer — is a DISMISSAL: a one-off refusal that is
   * not recorded (change 7.1), and a person's act, so the place was freed at the close. A failure's error is not read here and appears in no line.
   */
  private apply(question: ConsentQuestion, end: DialogEnd): ConsentOutcome {
    const choice = choiceOf(end);
    if (choice !== 'Allow' && choice !== 'Deny') {
      return 'dismissed';
    }
    // Agent traffic after this deliberately does NOT postpone auto-lock: a long unattended run is
    // exactly what the idle window exists to catch.
    this.deps.onUserPresent();
    return choice === 'Allow' ? this.allow(question) : this.deny(question);
  }

  private allow(question: ConsentQuestion): 'allowed' {
    this.deps.grants.allow(question.grant.secret);
    this.line(question, 'ALLOWED', 'first use consented');
    return 'allowed';
  }

  private deny(question: ConsentQuestion): 'denied' {
    this.deps.grants.deny(question.grant.secret);
    this.line(question, 'DENIED', 'first use refused');
    return 'denied';
  }

  /**
   * Allow or Deny on a dialog whose call had ended (it timed out, or every waiter left): one line, the notice, nothing decided. A dismissal, or a
   * modal that failed, says nothing. The notice has ONE argument, so it is a notice and not a prompt site (`promptSiteLedger.ts`).
   */
  private ignored(question: ConsentQuestion, end: DialogEnd): void {
    const choice = choiceOf(end);
    if (choice === 'Allow' || choice === 'Deny') {
      this.line(question, 'ignored', `"${choice}" answered after its call had ended; the answer changed nothing`);
      void vscode.window.showInformationMessage(LATE_ANSWER_NOTICE);
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
   *
   * <p>How far an Allow reaches is not the same on every door: a token grant lives for the token's
   * life, a call grant for one request, and on the MCP door the entry's policy may remember the
   * answer. So the last paragraph is chosen per door by `coverage`, and each of the three is tested
   * beside the fact it states, not as a string alone (`consentCoverage.test.ts`).</p>
   *
   * <p>The write is gated on `coverage` too ({@link opensWindow}), so a stamp can never be wider than
   * the sentence shown. The window sentence says *may* and *only while* because a policy or switch
   * change suspends a stamp rather than ending it.</p>
   */
  private wording(question: ConsentQuestion): string {
    const { grant, verb, summary, caller } = question;
    return (
      `${callerLine(caller)} wants to ${verb} ` +
      // WHEN (#131): fixed as the dialog is raised, so one left waiting keeps the time it was asked.
      `"${shownName(grant)}" using its stored credential.\n${localRequestTimeLine(new Date())}${bridgeLine(question)}\n\n${summary}\n\n` +
      `${CALLER_DISCLAIMER}\n\n` +
      this.coverageTail(question) +
      'Each call is logged in the "CredsForDevs: Agent Access" output panel.'
    );
  }

  /**
   * The sentence for this door: a record lookup, so adding a coverage is a compile error here.
   *
   * <p>Through a Remote Bridge it is the bridge's coverage line instead, whatever `coverage` says (E1.4): a bridged call is one request's
   * capability, never a token, and the window sentence is `main`'s words about a local stamp and says *any agent* and *this machine*, which a
   * server-keyed stamp is neither. The bridge's line follows the entry's own setting ("quiet") only on the MCP door, the one door a consent
   * policy speaks for. `coverage` still gates the WRITE ({@link opensWindow}), bridged or not.</p>
   */
  private coverageTail(question: ConsentQuestion): string {
    const { grant, via } = question;
    if (grant.bridge !== undefined) {
      return `${bridgeCoverageLine({ ...grant.bridge, quiet: grant.bridge.quiet && via === 'mcp' })} `;
    }
    return {
      token: () => this.tokenTail(grant),
      call: () => CALL_TAIL,
      every12h: () => windowTail(grant.entityName, this.verbsOf(grant)),
    }[question.coverage]();
  }

  /** A token grant: today's words, byte for byte. */
  private tokenTail(grant: Grant): string {
    return (
      `Allowing covers every later call on this token, not just this one: with it the agent can ${this.verbsOf(grant)} "${grant.entityName}" ` +
      `${describeLimits(grantLimits())}. `
    );
  }

  /** What this kind of entry can be asked to do, in the actions' own words — one list for both wide tails. */
  private verbsOf(grant: Grant): string {
    return this.deps.actions
      .actionsFor(grant.kind)
      .map((a) => a.verb)
      .join(', or ');
  }
}

/** The entry's name in the dialog's first line: as it always was off a bridge, one cleaned line without quotes of its own through one. */
function shownName(grant: Grant): string {
  return grant.bridge === undefined ? grant.entityName : bridgeQuotedName(grant.entityName);
}

/** Through a Remote Bridge, the line after the request time says which server, where THIS action runs and what goes back; the context's words and the call's own action, never the caller's. */
function bridgeLine({ grant, action }: ConsentQuestion): string {
  return grant.bridge === undefined ? '' : `\n${bridgeModalLine(grant.bridge.context, action, bridgeRunSite(action), grant.entityName)}`;
}
