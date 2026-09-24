import * as crypto from 'node:crypto';
import { TARGET_KINDS, describeTarget } from './backupTargets';
import { BackupStatus, BackupTargetSummary, BackupTargetView, targetKindsOf } from './orgBackupClient';
import { escapeHtml } from './webviewHtml';

/**
 * The **Server backup** page: markup, CSS, and everything an administrator can do with it.
 *
 * <p>Pure and `vscode`-free, like every other page module here, so what it shows and what it
 * ESCAPES are unit tests rather than something a running editor has to be opened to check. The
 * panel next door owns the webview, the client and the token.</p>
 *
 * <p><b>Nothing on this page is a secret.</b> The status carries no credential in any shape — the
 * server refuses to return one, and `http/org/backup.http` asserts it on the route a page polls —
 * and neither does the destinations list. The key's words appear in a modal the panel raises, never
 * in this document, because a webview's DOM outlives the moment and a tab can be reopened. The
 * destination form's credential inputs carry NO `value`, ever: what is typed there travels to the
 * server in one message and is drawn back nowhere, not even after a failed save.</p>
 */

/** The non-secret half of a destination being added or edited. Never a credential. */
export interface TargetDraft {
  /** The row being edited, or absent for a new destination. */
  readonly index?: number;
  readonly kind: string;
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly prefix: string;
}

/** Everything the page draws, decided by the tab. */
export interface BackupPageState {
  readonly status?: BackupStatus;
  /**
   * The configured destinations, or nothing while they are being read.
   *
   * <p>`olderServer` is the third answer: the server has no destinations route, and the form is not
   * offered — a save without the list would silently erase the destinations this build cannot see.</p>
   */
  readonly targets?: readonly BackupTargetSummary[];
  readonly olderServer?: boolean;
  readonly draft?: TargetDraft;
  /** True while a request is out — every button is disabled and nothing new may be asked for. */
  readonly busy: boolean;
  /** What the last action said, good or bad, in the server's own words where there are any. */
  readonly notice?: string;
  readonly error?: string;
  readonly account: string;
  readonly format?: (at: number) => string;
}

/** What the page may ask for. The credential fields travel in ONE message and are held nowhere. */
export interface BackupPageMessage {
  readonly type: BackupPageMessageType;
  readonly scheduleHourUtc?: number;
  readonly retentionDays?: number;
  /** The row an edit or a removal is about. */
  readonly index?: number;
  readonly kind?: string;
  readonly endpoint?: string;
  readonly region?: string;
  readonly bucket?: string;
  readonly prefix?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly accountName?: string;
  readonly accountKey?: string;
}

export type BackupPageMessageType =
  | 'refresh' | 'mint' | 'run' | 'download' | 'save'
  | 'addTarget' | 'editTarget' | 'cancelTarget' | 'saveTarget' | 'removeTarget';

const MESSAGE_TYPES: readonly string[] = [
  'refresh', 'mint', 'run', 'download', 'save',
  'addTarget', 'editTarget', 'cancelTarget', 'saveTarget', 'removeTarget',
];

/** A page is untrusted input: every field it may carry is checked for its kind, not only the type. */
export function isBackupPageMessage(value: unknown): value is BackupPageMessage {
  const message = value as Record<string, unknown> | null;
  return isRecord(message)
    && MESSAGE_TYPES.includes(message.type as string)
    && NUMBER_FIELDS.every((field) => optionalNumber(message[field]))
    && STRING_FIELDS.every((field) => optionalString(message[field]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

const NUMBER_FIELDS: readonly string[] = ['scheduleHourUtc', 'retentionDays', 'index'];

const STRING_FIELDS: readonly string[] = [
  'kind', 'endpoint', 'region', 'bucket', 'prefix',
  'accessKeyId', 'secretAccessKey', 'accountName', 'accountKey',
];

function optionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number';
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
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

/**
 * The last SUCCESS, when it is a different fact from the last run — or nothing.
 *
 * <p>Said only when the last run did not succeed: a run that succeeded IS the last success, and
 * saying it twice would teach people to skip the line. An older server sends no instant, and then
 * nothing is said rather than something guessed (#134).</p>
 */
export function successSentence(status: BackupStatus, format?: (at: number) => string): string {
  if (!successIsASeparateFact(status)) {
    return '';
  }
  return status.lastSuccessAt === 0
    ? 'No backup has ever succeeded on this server.'
    : `The last successful backup was at ${stamp(status.lastSuccessAt ?? 0, format)}.`;
}

/** A newer server, a run that has happened, and a last run that was NOT the success. */
function successIsASeparateFact(status: BackupStatus): boolean {
  return status.lastSuccessAt !== undefined && status.lastRunAt !== 0 && status.lastResult !== 'ok';
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
  select { padding: 2px 6px; background: var(--vscode-input-background);
           color: var(--vscode-input-foreground); border: 1px solid var(--vscode-widget-border); }
  .form { display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; align-items: center;
          max-width: 78ch; margin: 6px 0 10px; }
  .form input { width: 100%; box-sizing: border-box; }
  .form .span { grid-column: 1 / -1; }
  label { opacity: .85; }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  th, td { text-align: left; padding: 4px 10px 4px 0; vertical-align: top;
           border-bottom: 1px solid var(--vscode-widget-border); }
  th { opacity: .7; font-weight: 600; }
  td.trouble { opacity: .85; word-break: break-word; }
  td.actions { white-space: nowrap; }
  .notice { margin: 10px 0; padding: 6px 10px; max-width: 78ch;
            border-left: 3px solid var(--vscode-button-background); }
  .error { margin: 10px 0; padding: 6px 10px; max-width: 78ch;
           border-left: 3px solid var(--vscode-errorForeground);
           color: var(--vscode-errorForeground); }
  .none, .hint { opacity: .8; margin: 8px 0; max-width: 78ch; }
  .hint { font-size: .92em; }
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
<p class="run">${escapeHtml(runSentence(status, state.format))}
${escapeHtml(successSentence(status, state.format))}</p>
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
${destinationsSection(state)}
<h3>Last run, per destination</h3>
${targetTable(status, state.format)}`}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
${backupPageScript()}
</script>
</body>
</html>`;
}

/**
 * The page's own script — everything after `acquireVsCodeApi()`, which the test harness stands in for.
 *
 * <p>Exported on its own so `runFragment` can drive it: what the destination form POSTS, and that
 * the region row follows the kind. Nothing here reads a value into `vscode.setState` — a form value
 * that outlived the message would be a credential in a place that outlives the moment.</p>
 */
export function backupPageScript(): string {
  return `  const send = (type, extra = {}) => vscode.postMessage({ type, ...extra });
  for (const id of ['mint', 'run', 'download', 'refresh', 'addTarget', 'cancelTarget']) {
    document.getElementById(id)?.addEventListener('click', () => send(id));
  }
  document.getElementById('save')?.addEventListener('click', () => send('save', {
    scheduleHourUtc: Number(document.getElementById('hour').value),
    retentionDays: Number(document.getElementById('days').value),
  }));
  for (const button of document.querySelectorAll('button[data-edit]')) {
    button.addEventListener('click', () => send('editTarget', { index: Number(button.dataset.edit) }));
  }
  for (const button of document.querySelectorAll('button[data-remove]')) {
    button.addEventListener('click', () => send('removeTarget', { index: Number(button.dataset.remove) }));
  }
  const field = (id) => document.getElementById(id)?.value ?? '';
  function readTargetForm() {
    const kind = field('tkind');
    const halves = kind === 's3'
      ? { accessKeyId: field('tid'), secretAccessKey: field('tsecret') }
      : { accountName: field('tid'), accountKey: field('tsecret') };
    return {
      kind,
      endpoint: field('tendpoint'),
      region: field('tregion'),
      bucket: field('tbucket'),
      prefix: field('tprefix'),
      ...halves,
    };
  }
  function syncKind() {
    const s3 = field('tkind') === 's3';
    const regionRow = document.getElementById('regionRow');
    if (regionRow) { regionRow.hidden = !s3; }
    const bucketLabel = document.getElementById('tbucketLabel');
    if (bucketLabel) { bucketLabel.textContent = s3 ? 'Bucket' : 'Container'; }
    const idLabel = document.getElementById('tidLabel');
    if (idLabel) { idLabel.textContent = s3 ? 'Access key ID' : 'Account name'; }
    const secretLabel = document.getElementById('tsecretLabel');
    if (secretLabel) { secretLabel.textContent = s3 ? 'Secret access key' : 'Account key'; }
  }
  document.getElementById('tkind')?.addEventListener('change', syncKind);
  document.getElementById('saveTarget')?.addEventListener('click', () => send('saveTarget', readTargetForm()));
  syncKind();`;
}

/**
 * The configured destinations, the form when one is being added or edited, and the one sentence
 * for a server too old to have the route.
 */
function destinationsSection(state: BackupPageState): string {
  if (state.olderServer === true) {
    return '<p class="none">This server is older than destination editing: it has no '
      + '<code>GET /api/org/backup/targets</code>, and without that list a save here would silently '
      + 'erase the destinations it cannot see. Update the server to add or change destinations from '
      + 'this tab; the schedule above can still be saved.</p>';
  }
  if (state.targets === undefined) {
    return '<p class="none">Reading the destinations…</p>';
  }
  return `${configuredTable(state.targets, state.busy)}
${state.draft === undefined ? addButton(state.busy) : targetForm(state.draft, state.busy)}`;
}

function addButton(busy: boolean): string {
  return `<div class="row"><button type="button" id="addTarget"${busy ? ' disabled' : ''}>Add destination…</button></div>`;
}

/** One row per configured destination, with what the form needs to know about its credentials. */
function configuredTable(targets: readonly BackupTargetSummary[], busy: boolean): string {
  if (targets.length === 0) {
    return '<p class="none">No destination is configured, so every archive stays on this server’s '
      + 'own disk. A backup that lives on the machine it backs up is not a backup.</p>';
  }
  const rows = targets.map((target, index) => `<tr>
    <td>${escapeHtml(describeTarget(target))}</td>
    <td>${escapeHtml(target.endpoint)}</td>
    <td>${escapeHtml(target.region)}</td>
    <td class="trouble">${target.credentials === 'sealed'
    ? 'sealed'
    : 'cannot be opened by this server — re-enter them'}</td>
    <td class="actions"><button type="button" data-edit="${index}"${busy ? ' disabled' : ''}>Edit</button>
    <button type="button" data-remove="${index}"${busy ? ' disabled' : ''}>Remove</button></td>
  </tr>`).join('');
  return `<table><thead><tr><th>Where</th><th>Endpoint</th><th>Region</th><th>Credentials</th>`
    + `<th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * The form. The credential inputs carry NO value, ever — see the module header.
 */
function targetForm(draft: TargetDraft, busy: boolean): string {
  const words = draft.index === undefined ? NEW_WORDS : EDIT_WORDS;
  const labels = draft.kind === 's3' ? S3_LABELS : AZURE_LABELS;
  const disabled = busy ? ' disabled' : '';
  return `<h4>${words.title}</h4>
<div class="form">
  <label for="tkind">Kind</label>
  ${kindSelect(draft)}
  <label for="tendpoint">Endpoint</label>
  <input type="text" id="tendpoint" autocomplete="off" spellcheck="false" placeholder="https://" value="${escapeHtml(draft.endpoint)}">
  <label for="tregion" id="tregionLabel"${labels.regionHidden}>Region</label>
  <span id="regionRow"${labels.regionHidden}><input type="text" id="tregion" autocomplete="off" spellcheck="false" placeholder="eu-central-1" value="${escapeHtml(draft.region)}"></span>
  <label for="tbucket" id="tbucketLabel">${labels.bucket}</label>
  <input type="text" id="tbucket" autocomplete="off" spellcheck="false" value="${escapeHtml(draft.bucket)}">
  <label for="tprefix">Prefix</label>
  <input type="text" id="tprefix" autocomplete="off" spellcheck="false" value="${escapeHtml(draft.prefix)}">
  <label for="tid" id="tidLabel">${labels.id}</label>
  <input type="text" id="tid" autocomplete="off" spellcheck="false">
  <label for="tsecret" id="tsecretLabel">${labels.secret}</label>
  <input type="password" id="tsecret" autocomplete="off">
  <p class="hint span">${words.hint}</p>
  <div class="row span">
    <button type="button" id="saveTarget" class="primary"${disabled}>${words.save}</button>
    <button type="button" id="cancelTarget"${disabled}>Cancel</button>
  </div>
</div>`;
}

/** The kind is chosen once: an edit keeps its kind, because the identity the server keys on has it. */
function kindSelect(draft: TargetDraft): string {
  const options = TARGET_KINDS.map((known) =>
    `<option value="${known.kind}"${known.kind === draft.kind ? ' selected' : ''}>${escapeHtml(known.label)}</option>`);
  return `<select id="tkind"${draft.index === undefined ? '' : ' disabled'}>${options.join('')}</select>`;
}

interface FormWords {
  readonly title: string;
  readonly hint: string;
  readonly save: string;
}

const NEW_WORDS: FormWords = {
  title: 'New destination',
  hint: 'Both credential fields are required the first time. They are sealed on the server and never shown again.',
  save: 'Add destination',
};

const EDIT_WORDS: FormWords = {
  title: 'Edit destination',
  hint: 'Leave both credential fields empty to keep the ones already sealed on the server. They are never shown again.',
  save: 'Save destination',
};

interface KindLabels {
  readonly regionHidden: string;
  readonly bucket: string;
  readonly id: string;
  readonly secret: string;
}

const S3_LABELS: KindLabels = { regionHidden: '', bucket: 'Bucket', id: 'Access key ID', secret: 'Secret access key' };

const AZURE_LABELS: KindLabels = { regionHidden: ' hidden', bucket: 'Container', id: 'Account name', secret: 'Account key' };

/**
 * What each destination did during the last run.
 *
 * <p>The upload and the retention are separate columns because they are separate outcomes: an
 * archive that ARRIVED at a destination whose old archives can no longer be listed is a success and
 * an unbounded directory at once, and one column would draw that row green.</p>
 */
function targetTable(status: BackupStatus, format?: (at: number) => string): string {
  const targets: readonly BackupTargetView[] = status.targets;
  if (targets.length === 0) {
    // Two different absences: no destination at all, and destinations that no run has reported on
    // yet. The old sentence said "not configured" for both, which was wrong from the moment a
    // destination was saved until the first run (#134).
    return targetKindsOf(status).length === 0
      ? '<p class="none">No destination is configured, so nothing has left this server.</p>'
      : '<p class="none">No run has reported on these destinations yet.</p>';
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
