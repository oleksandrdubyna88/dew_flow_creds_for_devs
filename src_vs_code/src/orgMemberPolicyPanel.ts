import * as vscode from 'vscode';
import { CorpPolicyState, describeLease, roleLabel } from './corpPolicy';
import { escapeHtml } from './webviewHtml';

/**
 * "My role and policy" — the read-only view of what this server says about one account.
 *
 * <p>It exists for the reason the corporate-recovery page does: a policy nobody can see reads as
 * a broken product. The day a later version refuses an export because the policy forbids it, the
 * person must have had somewhere to read that this is what their server says about them, who
 * administers it, and how long a laptop may stay offline before it locks. A notification is gone
 * in seconds; this is true for as long as the server is configured that way.</p>
 *
 * <p>Read-only by design, built exactly like `orgRecoveryPanel.ts`: `enableScripts: false`, no
 * local resources, every server-supplied string escaped. Every value on it arrives from a SERVER
 * — a role a newer build may spell any way it likes, project ids an admin typed — which is the
 * provenance behind the 2026-08-26 HIGH finding, so the escaping is a test.</p>
 */

export interface MemberPolicyViewOptions {
  readonly accountEmail: string;
  readonly location: string;
  readonly state: CorpPolicyState;
}

export function showMemberPolicyView(options: MemberPolicyViewOptions): void {
  const panel = vscode.window.createWebviewPanel(
    'credSshMemberPolicy',
    `My role and policy — ${options.location}`,
    vscode.ViewColumn.Active,
    { enableScripts: false, localResourceRoots: [] },
  );
  panel.webview.html = renderHtml(options);
}

function when(at: number): string {
  return at > 0 ? new Date(at).toLocaleString() : '—';
}

/** The first sentence: who this account is to its server. */
function roleBlock(state: CorpPolicyState): string {
  if (state.isOfficer) {
    return `<p>You are a <strong>recovery officer</strong> of this server, and you administer it
      unconditionally — the roster is the operator's own list, and no registry role can be given to
      or taken from you.</p>`;
  }
  const admin = state.isAdmin
    ? `<p>You administer this server: you can see the roster and set a colleague's role with
      <em>Set Role…</em> on their row under <em>Team</em>.</p>`
    : '';
  return `<p>You are ${article(state.role)} <strong>${escapeHtml(state.role)}</strong> on this server.</p>${admin}`;
}

/** `an admin`, `a member`, `a dev` — the role is a word the server chose, so the article is computed. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function shareWords(share: string): string {
  switch (share) {
    case 'any':
      return 'with anyone in your domain';
    case 'project':
      return 'inside your projects only';
    case 'none':
      return 'not allowed — you can receive, not send';
    default:
      return escapeHtml(share);
  }
}

function yesNo(allowed: boolean): string {
  return allowed ? 'allowed' : '<strong>not allowed</strong>';
}

/**
 * The one line that separates two states a person would otherwise read as the same thing.
 *
 * <p>A policy this build could not read falls back to the most restrictive one — that is deliberate,
 * because guessing "everything" on a parse error hands a developer an export. But the RESULT looks
 * exactly like a legitimately restricted account, and somebody staring at "no" beside every row has
 * no way to tell "the company decided this" from "this build and this server disagree about a
 * shape". So the page says which, and only when it is the second.</p>
 */
function policyNotice(state: CorpPolicyState): string {
  return !state.policyFromServer
    ? '<p class="warn">This build could not read the policy the server sent, so it is showing the most '
      + 'restrictive one rather than guessing. That is a version mismatch to report, not a decision '
      + 'somebody made about you.</p>'
    : '';
}

function policyRows(state: CorpPolicyState): string {
  const policy = state.policy;
  return `<table>
  <tr><th scope="col">Action</th><th scope="col">Policy</th></tr>
  <tr><td>Export, back up to disk, clone into another account</td><td>${yesNo(policy.export)}</td></tr>
  <tr><td>Share an entry</td><td>${shareWords(policy.share)}</td></tr>
  <tr><td>Move an entry out of a project folder</td><td>${yesNo(policy.moveOutOfProject)}</td></tr>
</table>
${policyNotice(state)}
<p class="quiet">The policy is written by the server and shown here as it arrived.
This version of the extension displays it; applying it — refusing an export the policy forbids —
comes in a later version. What you read here is what will be enforced, not yet what is.</p>`;
}

function projectRows(state: CorpPolicyState): string {
  if (state.projects.length === 0) {
    return '<p class="quiet">You are assigned to no project yet.</p>';
  }
  return `<ul>${state.projects
    .map((p) => `<li><code>${escapeHtml(p.projectId)}</code> — sharing: ${escapeHtml(p.share)}</li>`)
    .join('')}</ul>`;
}

function corpBlock(state: CorpPolicyState): string {
  const inactive = state.active
    ? ''
    : `<p class="warn">This account is marked <strong>inactive</strong> on the server. Ask an administrator.</p>`;
  return `${inactive}
${roleBlock(state)}
<h3>What the policy says</h3>
${policyRows(state)}
<h3>Projects</h3>
${projectRows(state)}
<h3>Offline lease</h3>
<p>${escapeHtml(describeLease(state.leaseHours))}.
Set by the administrators; applied by a later version of the extension.</p>`;
}

function body(state: CorpPolicyState): string {
  if (!state.corpMode) {
    return `<p><strong>This server has no corporate roles.</strong> Every account here behaves as a
      personal one: nothing is forbidden, nobody administers, and this page has nothing to add.</p>`;
  }
  return corpBlock(state);
}

function renderHtml(options: MemberPolicyViewOptions): string {
  const { state } = options;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 20px 28px; max-width: 720px; }
  h2 { margin: 0 0 4px; font-size: 1.25em; }
  h3 { margin: 22px 0 6px; font-size: 1.05em; }
  .who { opacity: .75; margin: 0 0 18px; }
  .warn { color: var(--vscode-charts-orange, #ce9178); font-weight: 600; }
  .quiet { opacity: .7; }
  code { font-family: var(--vscode-editor-font-family, monospace); }
  ul { padding-left: 1.2em; line-height: 1.6; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { text-align: left; padding: 5px 10px 5px 0; border-bottom: 1px solid var(--vscode-widget-border, #3c3c3c); }
  th { opacity: .75; font-weight: 600; }
</style>
</head>
<body>
<h2>My role and policy</h2>
<p class="who">${escapeHtml(options.accountEmail)} · ${escapeHtml(options.location)}
  · ${escapeHtml(roleLabel(state.role, state.isOfficer))} · checked ${escapeHtml(when(state.fetchedAt))}</p>
${body(state)}
</body>
</html>`;
}
