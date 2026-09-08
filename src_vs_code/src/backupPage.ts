import * as crypto from 'node:crypto';
import { BackupStatus, BackupTargetView } from './orgBackupClient';
import { escapeHtml } from './webviewHtml';

/**
 * The **Server backup** page: markup, CSS, and the five things an administrator can do with it.
 *
 * <p>Pure and `vscode`-free, like every other page module here, so what it shows and what it
 * ESCAPES are unit tests rather than something a running editor has to be opened to check. The
 * panel next door owns the webview, the client and the token.</p>
 *
 * <p><b>Nothing on this page is a secret.</b> The status carries no credential in any shape — the
 * server refuses to return one, and `http/org/backup.http` asserts it on the route a page polls.
 * The key's words appear in a modal the panel raises, never in this document, because a webview's
 * DOM outlives the moment and a tab can be reopened.</p>
 */

/** Everything the page draws, decided by the tab. */
export interface BackupPageState {
  readonly status?: BackupStatus;
  /** True while a request is out — every button is disabled and nothing new may be asked for. */
  readonly busy: boolean;
  /** What the last action said, good or bad, in the server's own words where there are any. */
  readonly notice?: string;
  readonly error?: string;
  readonly account: string;
  readonly format?: (at: number) => string;
}

/** What the page may ask for. Nothing here carries a secret — the host holds all of it. */
export interface BackupPageMessage {
  readonly type: 'refresh' | 'mint' | 'run' | 'download' | 'save';
  readonly scheduleHourUtc?: number;
  readonly retentionDays?: number;
}

const MESSAGE_TYPES: readonly string[] = ['refresh', 'mint', 'run', 'download', 'save'];

export function isBackupPageMessage(value: unknown): value is BackupPageMessage {
  const message = value as Record<string, unknown> | null;
  return message !== null
    && typeof message === 'object'
    && MESSAGE_TYPES.includes(message.type as string)
    && NUMBER_FIELDS.every((field) => optionalNumber(message[field]));
}

const NUMBER_FIELDS: readonly string[] = ['scheduleHourUtc', 'retentionDays'];

function optionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number';
}

/** The sentence for a key state — what it means, and what to do about it. */
const KEY_SENTENCES: Readonly<Record<string, string>> = {
  Ready: 'A backup key is in place. Its words were shown once and cannot be produced again — what '
    + 'this server keeps is derived from them.',
  Absent: 'No backup key yet, so no archive can be sealed. Minting one shows its words exactly '
    + 'once: write them down before closing that dialog.',
  AwaitingAcknowledgement: 'A key was minted and nobody confirmed writing its words down, so every '
    + 'scheduled run is refusing. Mint again to replace the unused key and see a fresh set of words.',
  Unreadable: 'The key on disk cannot be opened by this server — its deployment key changed, or '
    + 'these files were restored from elsewhere. No archive can be sealed until it is replaced.',
};

export function keySentence(status: BackupStatus): string {
  return status.configured
    ? KEY_SENTENCES[status.keyState] ?? KEY_SENTENCES.Unreadable
    : 'This server cannot seal an archive: no deployment key is configured. Set Vault:LoginKey:Kek '
      + 'to base64 of 32 random bytes — the same key seals developer login keys.';
}

/** The one line at the top: what the last run did, or that there has not been one. */
export function runSentence(status: BackupStatus, format?: (at: number) => string): string {
  return status.running || status.lastRunAt === 0
    ? nothingToReport(status)
    : `The last backup ${verdictWord(status)} at ${stamp(status.lastRunAt, format)}.`;
}

/** A run in flight, or none ever — the two states with no verdict to report. */
function nothingToReport(status: BackupStatus): string {
  return status.running
    ? 'A backup is running now.'
    : 'No backup has ever run on this server.';
}

function verdictWord(status: BackupStatus): string {
  return VERDICT_WORDS[status.lastResult] ?? status.lastResult;
}

/** The caller's formatter, or ISO — which is at least unambiguous about its timezone. */
function stamp(at: number, format?: (at: number) => string): string {
  return format?.(at) ?? new Date(at).toISOString();
}

/** The two results that have a better word than the wire's. Anything else says its own. */
const VERDICT_WORDS: Readonly<Record<string, string>> = {
  ok: 'succeeded',
  partial: 'partly succeeded',
};

/** Bytes as something a person reads, since an archive is measured in hundreds of megabytes. */
export function humanBytes(bytes: number): string {
  if (bytes <= 0) {
    return '—';
  }
  const unit = Math.min(Math.floor(Math.log2(bytes) / 10), UNITS.length - 1);
  const value = bytes / 1024 ** unit;
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

const UNITS: readonly string[] = ['B', 'KB', 'MB', 'GB'];

/** The page. One template literal, like every other page module here. */
// The template is a long chain of "draw this when that" — the shape `renderOrgEvents` has, and the
// same reason it carries a disable: every branch is one field of one page, and splitting them into
// named functions would scatter the markup across a file nobody could then read as a page.
// eslint-disable-next-line max-lines-per-function, complexity
export function renderBackupPage(state: BackupPageState): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const status = state.status;
  const disabled = state.busy || status === undefined ? ' disabled' : '';
  // Mint is offered only where it can do no harm. A key that is READY may not be minted over — the
  // server refuses it, and offering a button that answers "already minted" is worse than not
  // offering one, because a person who presses it learns nothing about what would have happened.
  const mintable = status !== undefined && status.configured
    && (status.keyState === 'Absent' || status.keyState === 'AwaitingAcknowledgement');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 12px 20px 24px; }
  h2 { margin: 0 0 4px; font-size: 1.2em; }
  h3 { margin: 20px 0 6px; font-size: 1em; }
  .lede, .key, .run { margin: 0 0 10px; max-width: 78ch; }
  .lede, .key { opacity: .85; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 10px; }
  button { padding: 3px 10px; cursor: pointer; border: 1px solid var(--vscode-widget-border);
           background: transparent; color: var(--vscode-foreground); border-radius: 3px; }
  button.primary { background: var(--vscode-button-background);
                   color: var(--vscode-button-foreground); border-color: transparent; }
  button[disabled] { opacity: .5; cursor: default; }
  input { width: 6em; padding: 2px 6px; background: var(--vscode-input-background);
          color: var(--vscode-input-foreground); border: 1px solid var(--vscode-widget-border); }
  label { opacity: .85; }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  th, td { text-align: left; padding: 4px 10px 4px 0; vertical-align: top;
           border-bottom: 1px solid var(--vscode-widget-border); }
  th { opacity: .7; font-weight: 600; }
  td.trouble { opacity: .85; word-break: break-word; }
  .notice { margin: 10px 0; padding: 6px 10px; max-width: 78ch;
            border-left: 3px solid var(--vscode-button-background); }
  .error { margin: 10px 0; padding: 6px 10px; max-width: 78ch;
           border-left: 3px solid var(--vscode-errorForeground);
           color: var(--vscode-errorForeground); }
  .none { opacity: .8; margin: 8px 0; max-width: 78ch; }
</style>
</head>
<body>
<h2>Server backup</h2>
<p class="lede">One encrypted archive of everything ${escapeHtml(state.account)}'s server holds —
vaults, sealed login keys, the registry, projects and the event log — taken on a schedule and, when a
destination is configured, sent off this machine.</p>
${state.error === undefined ? '' : `<p class="error">${escapeHtml(state.error)}</p>`}
${state.notice === undefined ? '' : `<p class="notice">${escapeHtml(state.notice)}</p>`}
${status === undefined ? '<p class="none">Reading…</p>' : `
<p class="run">${escapeHtml(runSentence(status, state.format))}</p>
<p class="key">${escapeHtml(keySentence(status))}</p>
<div class="row">
  <button type="button" id="mint"${mintable && !state.busy ? '' : ' disabled'}>Mint backup key…</button>
  <button type="button" id="run" class="primary"${disabled}>Back up now</button>
  <button type="button" id="download"${status.localArchiveName.length > 0 && !state.busy ? '' : ' disabled'}>Download newest archive</button>
  <button type="button" id="refresh"${state.busy ? ' disabled' : ''}>Refresh</button>
</div>
<h3>Schedule</h3>
<div class="row">
  <label for="hour">Hour (UTC)</label>
  <input type="number" id="hour" min="0" max="23" value="${status.scheduleHourUtc}">
  <label for="days">Keep for (days)</label>
  <input type="number" id="days" min="1" value="${status.retentionDays}">
  <button type="button" id="save"${disabled}>Save</button>
</div>
<h3>Newest archive on this server</h3>
<p class="none">${status.localArchiveName.length === 0
    ? 'None yet.'
    : `${escapeHtml(status.localArchiveName)} — ${escapeHtml(humanBytes(status.localArchiveBytes))}`}</p>
<h3>Destinations</h3>
${targetTable(status.targets, state.format)}`}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const send = (type, extra = {}) => vscode.postMessage({ type, ...extra });
  for (const id of ['mint', 'run', 'download', 'refresh']) {
    document.getElementById(id)?.addEventListener('click', () => send(id));
  }
  document.getElementById('save')?.addEventListener('click', () => send('save', {
    scheduleHourUtc: Number(document.getElementById('hour').value),
    retentionDays: Number(document.getElementById('days').value),
  }));
</script>
</body>
</html>`;
}

/**
 * What each destination did during the last run.
 *
 * <p>The upload and the retention are separate columns because they are separate outcomes: an
 * archive that ARRIVED at a destination whose old archives can no longer be listed is a success and
 * an unbounded directory at once, and one column would draw that row green.</p>
 */
function targetTable(
  targets: readonly BackupTargetView[],
  format?: (at: number) => string,
): string {
  if (targets.length === 0) {
    return '<p class="none">No destination is configured, so every archive stays on this server’s '
      + 'own disk. A backup that lives on the machine it backs up is not a backup.</p>';
  }
  const rows = targets.map((target) => `<tr>
    <td>${escapeHtml(target.where)}</td>
    <td>${escapeHtml(target.result)}</td>
    <td class="trouble">${escapeHtml(target.error)}</td>
    <td class="trouble">${escapeHtml(target.retention)}</td>
    <td>${escapeHtml(target.at === 0 ? '—' : (format?.(target.at) ?? new Date(target.at).toISOString()))}</td>
  </tr>`).join('');
  return `<table><thead><tr><th>Where</th><th>Upload</th><th>Trouble</th><th>Retention</th>`
    + `<th>When</th></tr></thead><tbody>${rows}</tbody></table>`;
}
