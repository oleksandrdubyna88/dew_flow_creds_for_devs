import * as vscode from 'vscode';
import { AuditEntry, OrgRecoveryConfigResponse } from './orgRecoveryClient';
import { escapeHtml } from './webviewHtml';

/**
 * The read-only view of what corporate recovery is doing to this server's vaults.
 *
 * <p>Its reason for existing is the transparency requirement rather than convenience: every
 * account here is enrolled without being asked, so the roster, the fingerprint and the record
 * of every recovery that has happened must be somewhere a person can look. It is deliberately
 * a page rather than a notification — a notification is gone in seconds, and the thing it says
 * is true for as long as the server is configured that way.</p>
 *
 * <p>Read-only by design: every action lives behind a command with its own confirmation, so
 * nothing destructive is one stray click inside a page somebody opened to read.</p>
 */

export interface OrgRecoveryViewOptions {
  accountEmail: string;
  location: string;
  config: OrgRecoveryConfigResponse;
  /** What trust-on-first-use says about the published key, in words. Empty when it verifies. */
  notice: string;
  /** Whether the person looking is on the roster. */
  isOfficer: boolean;
  /** Whether this machine holds a share for the current ceremony. */
  holdsShare: boolean;
  /** Pending setup invites addressed to this officer. */
  pendingInvites: number;
  audit: AuditEntry[];
}

export function showOrgRecoveryView(options: OrgRecoveryViewOptions): void {
  const panel = vscode.window.createWebviewPanel(
    'credSshOrgRecovery',
    `Corporate recovery — ${options.location}`,
    vscode.ViewColumn.Active,
    { enableScripts: false, localResourceRoots: [] },
  );
  panel.webview.html = renderHtml(options);
}

function when(at: number): string {
  return at > 0 ? new Date(at).toLocaleString() : '—';
}

function officerRows(config: OrgRecoveryConfigResponse): string {
  return config.officerEmails
    .map((email) => `<li>${escapeHtml(email)}</li>`)
    .join('');
}

function auditRows(audit: readonly AuditEntry[]): string {
  if (audit.length === 0) {
    return '<p class="quiet">No vault on this server has been recovered this way.</p>';
  }
  return `<table>
  <tr><th scope="col">When</th><th scope="col">Whose vault</th><th scope="col">Started by</th><th scope="col">With</th></tr>
  ${audit
    .map(
      (entry) => `<tr>
    <td><time datetime="${new Date(entry.completedAt).toISOString()}">${escapeHtml(when(entry.completedAt))}</time></td>
    <td>${escapeHtml(entry.targetEmail)}</td>
    <td>${escapeHtml(entry.initiatorEmail)}</td>
    <td>${escapeHtml(entry.contributingOfficers.join(', '))}</td>
  </tr>`,
    )
    .join('')}
</table>`;
}

/** The one paragraph everybody on this server is entitled to read. */
function statusBlock(options: OrgRecoveryViewOptions): string {
  const { config } = options;
  if (!config.enabled) {
    return `<p><strong>Corporate recovery is off</strong> on ${escapeHtml(options.location)}.
      Nobody but you can open this vault — which also means that if you lose your PIN, your
      security keys and your printed recovery code, nobody can.</p>`;
  }
  if (!config.setupComplete) {
    return `<p><strong>Corporate recovery is configured but not finished.</strong> The operator has
      named officers; until they complete the setup ceremony no key is published and no vault is
      sealed to anything.</p>`;
  }
  return `<p><strong>Corporate recovery is on.</strong> Any
    ${config.threshold} of the ${config.officerEmails.length} officers below can, acting together,
    open this vault without you. It is sealed to their key automatically on every sync — this is
    not something you switched on, and it is why the page exists.</p>
    <p class="fp">Recovery key fingerprint: <code>${escapeHtml(config.orgPublicKeyFingerprint)}</code><br>
    Published ${escapeHtml(when(config.publishedAt))}</p>`;
}

function officerBlock(options: OrgRecoveryViewOptions): string {
  if (!options.isOfficer) {
    return '';
  }
  const share = options.holdsShare
    ? 'This machine holds your share of the recovery key.'
    : '<strong>This machine does not hold your share.</strong> Accept your setup invite, or ask for a new ceremony — a quorum that is one person short is not a quorum.';
  const invites =
    options.pendingInvites > 0
      ? `<p><strong>${options.pendingInvites} setup invite(s) are waiting for you.</strong> Run
         <em>CredsForDevs: Accept Recovery Share…</em>.</p>`
      : '';
  return `<h3>You are a recovery officer</h3><p>${share}</p>${invites}`;
}

function renderHtml(options: OrgRecoveryViewOptions): string {
  const notice =
    options.notice.length > 0 ? `<p class="warn">${escapeHtml(options.notice)}</p>` : '';
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
  .fp code { font-family: var(--vscode-editor-font-family, monospace); }
  ul { padding-left: 1.2em; line-height: 1.6; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { text-align: left; padding: 5px 10px 5px 0; border-bottom: 1px solid var(--vscode-widget-border, #3c3c3c); }
  th { opacity: .75; font-weight: 600; }
</style>
</head>
<body>
<h2>Corporate recovery</h2>
<p class="who">${escapeHtml(options.accountEmail)} · ${escapeHtml(options.location)}</p>
${notice}
${statusBlock(options)}
${options.config.enabled ? `<h3>Officers (${options.config.threshold} of ${options.config.officerEmails.length} required)</h3><ul>${officerRows(options.config)}</ul>` : ''}
${officerBlock(options)}
<h3>Recoveries on this server</h3>
${auditRows(options.audit)}
</body>
</html>`;
}
