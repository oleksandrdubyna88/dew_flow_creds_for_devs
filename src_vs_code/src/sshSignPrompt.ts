import * as vscode from 'vscode';
import { SignPurpose, describePurpose, describeServerLine, MAX_DISPLAY, displayText } from './sshAgentProtocol';
import { localRequestTimeLine } from './requestTime';
import { LongerItem, listPlaceholder, listTitle, timeLeftText } from './sshAgentTexts';
import { describeError } from './describeError';
import { AgentKey } from './sshAgentServer';
import { ALLOW_LONGER, ListPick, LongerOffer, SIGNING_BUTTONS } from './agentConsent';

/**
 * The dialogs in front of a signature no open window covers (#197, E3.1: moved out of `sshAgentManager.ts`, where it
 * was `askToSign`, so the prompt has a home of its own and the manager stays under its size limit; E3.3: the list).
 *
 * <p>It names the key, its fingerprint and what is being signed, because "a key is being
 * used" is not a decision anybody can make. A dismissed dialog refuses this one signature
 * and remembers nothing — the same rule the broker's consent follows, for the same reason: a
 * mis-click must not lock a key out for the window's life.</p>
 *
 * The prompt itself. The bound is not here any more: `ConsentTurns` times the TURN and refuses a request that
 * waits too long (before #131's tail it waited forever, so a prompt found an hour later still signed and the `ssh`
 * or `git` that asked hung). This awaits the modal to its END — a click after the turn ended still comes back
 * here, which is what lets the manager's `turnStarted` say so (VS Code cannot close a modal, so it can still be
 * clicked).
 *
 * <p>The text says the time this request really has left (`leftMs`): the full bound for a request that did not
 * wait, less for one that waited behind another prompt.</p>
 *
 * <p><b>Two dialogs, one turn.</b> *Allow longer…* authorises nothing by itself: the manager decides whether it may be
 * honoured (`longerOffer`, asked again before the list and again at the pick) and only then calls {@link pickLength}.
 * Nothing here knows the vault's state or the auto-lock setting — it shows what it is handed.</p>
 */

/** What the modal needs: the request, the time it has left and whether the longer window may be offered. */
export interface SigningPrompt {
  readonly key: AgentKey;
  readonly purpose: SignPurpose;
  readonly asked: Date;
  readonly leftMs: number;
  readonly offer: LongerOffer;
}

export function askSigning(prompt: SigningPrompt, log: (message: string) => void): Promise<string | undefined> {
  const buttons = prompt.offer.offer ? SIGNING_BUTTONS : SIGNING_BUTTONS.filter((button) => button !== ALLOW_LONGER);
  const modal = vscode.window.showWarningMessage(signingText(prompt), { modal: true }, ...buttons);
  // A modal that REJECTS (the window closing under it) is a dismissal — said in the log, never swallowed.
  return Promise.resolve(modal).catch((error: unknown) => dialogFailed('prompt', error, log));
}

/** What the modal says: the key, the request, who asked and when, what each answer does, and the time left. */
function signingText({ key, purpose, asked, leftMs, offer }: SigningPrompt): string {
  return (
    `Use the SSH key "${displayText(key.name, MAX_DISPLAY)}" to sign ${describePurpose(purpose)}?\n${localRequestTimeLine(asked)}\n\n` +
    `${key.fingerprint}\n\n` +
    serverParagraph(purpose) +
    `The key itself never leaves this window. ${offerSentence(offer)}\n\n` +
    `${WINDOW_RISK}\n\nUnanswered, it is refused after ${timeLeftText(leftMs)}.`
  );
}

/**
 * Who a window lets through, and what ends every one — said in the prompt that opens it. Any process of the person's
 * that reaches the agent signs without asking while a window is open; the lock ends windows of THIS VS Code window
 * only (the owner's decision, #197 Q-B).
 */
const WINDOW_RISK =
  'While a window is open, any process running as you that reaches this agent — an AI agent in a terminal, a script, ' +
  'WSL, a host you forwarded the agent to — uses this key without asking. Locking the vault in this VS Code window ' +
  'ends every window, and so does "Ask for Every Use Again" on the key\'s row.';

const TEN_MINUTES = 'allow every use of this key for 10 minutes — long enough for a push that signs and authenticates in one go';

/** The answers on offer; when the longer window may not be offered, the reason takes its place (no trailing period in `why`). */
function offerSentence(offer: LongerOffer): string {
  return offer.offer
    ? `Allow once; ${TEN_MINUTES}; or allow SSH logins with this key for longer, up to 12 hours — logins include git push and fetch over SSH.`
    : `Allow once, or ${TEN_MINUTES}. ${offer.why}.`;
}

/** The server line of a login prompt as a paragraph of its own — nothing for a request that names no server. */
function serverParagraph(purpose: SignPurpose): string {
  const line = describeServerLine(purpose);
  return line === '' ? '' : `${line}\n\n`;
}

/** A dialog dismissed by a failure, not by a person: logged, refused, and never counted as presence. */
function dialogFailed(which: string, error: unknown, log: (message: string) => void): undefined {
  log(`the signing ${which} failed: ${describeError(error)} — refused`);
  return undefined;
}

/** The list's end: Escape, or VS Code closing it for another list or Ctrl+P, is `escaped`. */
const ESCAPED: ListPick = Object.freeze({ kind: 'escaped' as const });

/**
 * The list *Allow longer…* opens: `showQuickPick` over the items, closed by a token that THIS turn's signal — and
 * nothing else — cancels (`turn` aborts when the bound runs out or the client goes away). The token source is made
 * for this list, its abort listener is removed and the source disposed in `finally` whatever the list answered, and an
 * already-aborted turn opens no list at all. `ms` is read from the item the list RETURNED, never from its label. A
 * rejected list is `failed` — a dismissal that counts no presence, unlike Escape.
 */
export async function pickLength(
  key: Pick<AgentKey, 'name'>,
  items: readonly LongerItem[],
  leftMs: number,
  turn: AbortSignal,
  log: (message: string) => void,
): Promise<ListPick> {
  if (turn.aborted) {
    return ESCAPED;
  }
  const source = new vscode.CancellationTokenSource();
  const cancel = (): void => source.cancel();
  turn.addEventListener('abort', cancel, { once: true });
  try {
    const options = { title: listTitle(key.name), placeHolder: listPlaceholder(leftMs), ignoreFocusOut: true };
    const item = await vscode.window.showQuickPick([...items], options, source.token);
    return item === undefined ? ESCAPED : { kind: 'picked', ms: item.ms };
  } catch (error) {
    dialogFailed('list', error, log);
    return { kind: 'failed' };
  } finally {
    turn.removeEventListener('abort', cancel);
    source.dispose();
  }
}
