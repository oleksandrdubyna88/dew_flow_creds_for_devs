import * as vscode from 'vscode';
import { SignPurpose, describePurpose, describeServerLine, MAX_DISPLAY, displayText } from './sshAgentProtocol';
import { localRequestTimeLine } from './requestTime';
import { timeLeftText } from './sshAgentTexts';
import { describeError } from './describeError';
import { AgentKey } from './sshAgentServer';
import { SIGNING_BUTTONS } from './agentConsent';

/**
 * The dialog in front of a signature no open window covers (#197, E3.1: moved out of `sshAgentManager.ts`, where it
 * was `askToSign`, so the prompt has a home of its own and the manager stays under its size limit).
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
 */
export function askSigning(
  key: AgentKey,
  purpose: SignPurpose,
  asked: Date,
  leftMs: number,
  log: (message: string) => void,
): Promise<string | undefined> {
  const modal = vscode.window.showWarningMessage(signingText(key, purpose, asked, leftMs), { modal: true }, ...SIGNING_BUTTONS);
  // A modal that REJECTS (the window closing under it) is a dismissal — said in the log, never swallowed.
  return Promise.resolve(modal).catch((error: unknown) => modalFailed(error, log));
}

/** What the modal says: the key, the request, who asked and when, what each answer does, and the time left. */
function signingText(key: AgentKey, purpose: SignPurpose, asked: Date, leftMs: number): string {
  return (
    `Use the SSH key "${displayText(key.name, MAX_DISPLAY)}" to sign ${describePurpose(purpose)}?\n${localRequestTimeLine(asked)}\n\n` +
    `${key.fingerprint}\n\n` +
    serverParagraph(purpose) +
    'The key itself never leaves this window. Allow once, or allow every use of this key for ' +
    'ten minutes — long enough for a push that signs and authenticates in one go. ' +
    `Locking the vault ends the window, and so does "Ask for Every Use Again" on the key's row. ` +
    `Unanswered, it is refused after ${timeLeftText(leftMs)}.`
  );
}

function modalFailed(error: unknown, log: (message: string) => void): undefined {
  log(`the signing prompt failed: ${describeError(error)} — refused`);
  return undefined;
}

/** The server line of a login prompt as a paragraph of its own — nothing for a request that names no server. */
function serverParagraph(purpose: SignPurpose): string {
  const line = describeServerLine(purpose);
  return line === '' ? '' : `${line}\n\n`;
}
