import * as crypto from 'node:crypto';
import { OrgEvent } from './eventQuery';
import { EVENT_GROUPS, EventLine, eventLine, groupById } from './eventRows';
import { escapeHtml } from './webviewHtml';

/**
 * The **Event log** page: markup, CSS, and the three things a person can do with it — narrow it,
 * ask for more, and try again after a failure.
 *
 * <p>Pure and `vscode`-free, like every other page module here, so what it shows and what it
 * ESCAPES are unit tests rather than something a running editor has to be opened to check. The
 * panel next door owns the webview, the client and the token; this function draws what it is
 * handed and decides nothing about who may see what.</p>
 *
 * <p><b>Unlike the MCP log, nothing is filtered in the page.</b> That one holds every row it will
 * ever show before it renders; this one is a window onto a log on a server, which pages and scopes
 * it — so a filter change and a "load more" are round trips, and the page's job is to say which it
 * wants and to draw the answer.</p>
 */

/** Everything the page draws, decided by the panel. */
export interface EventPageState {
  readonly rows: readonly OrgEvent[];
  /** The group whose button is pressed. */
  readonly group: string;
  /** True while a request is out — the buttons are disabled and nothing new may be asked for. */
  readonly loading: boolean;
  /** Present when there is more to ask for; absent means the log has been read to its end. */
  readonly hasMore: boolean;
  /** The server has no such route: too old to keep a log at all. A different sentence from "empty". */
  readonly noLogHere: boolean;
  /** What went wrong, in the server's own words or the transport's. */
  readonly error?: string;
  /** Whose log this is — the account the panel is asking on behalf of. */
  readonly account: string;
  /** How many rows have been dropped off the top to keep the tab bounded. */
  readonly dropped: number;
  readonly format?: (at: number) => string;
}

/** The page. One template literal, like every other page module here. */
// eslint-disable-next-line max-lines-per-function
export function renderOrgEvents(state: EventPageState): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const lines = state.rows.map((row) => eventLine(row, state.format));
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
  .lede { opacity: .8; margin: 0 0 12px; max-width: 74ch; }
  .filters { display: flex; gap: 6px; margin: 0 0 6px; flex-wrap: wrap; }
  button { padding: 3px 10px; cursor: pointer; border: 1px solid var(--vscode-widget-border, #4444);
           background: transparent; color: var(--vscode-foreground); border-radius: 3px; }
  button[aria-pressed=true] { background: var(--vscode-button-background);
                              color: var(--vscode-button-foreground); border-color: transparent; }
  button[disabled] { opacity: .5; cursor: default; }
  .hint { opacity: .75; margin: 0 0 12px; font-size: .9em; min-height: 1.2em; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 4px 10px 4px 0; vertical-align: top;
           border-bottom: 1px solid var(--vscode-widget-border, #3333); }
  th { opacity: .7; font-weight: 600; }
  td.when { white-space: nowrap; opacity: .8; font-family: var(--vscode-editor-font-family); }
  td.detail { opacity: .8; word-break: break-word; }
  .empty { opacity: .8; margin: 16px 0; max-width: 74ch; }
  .error { color: var(--vscode-credSshManager-depColor3, #FF8A76); margin: 12px 0; max-width: 74ch; }
  .more { margin: 14px 0 0; }
</style>
</head>
<body>
  <h2>Event log</h2>
  <p class="lede">What this server recorded about ${escapeHtml(state.account)}'s company: shares with
    what happened to them, roles, projects and assignments. <b>The server decides what you see</b> —
    an administrator reads the whole domain, everybody else reads only the rows naming them. It
    records what happened, never what was in a secret.</p>
  <!-- The group buttons stay ENABLED while a request is out: a different group is a different
       question, and the tab preempts what is in flight rather than making somebody wait for an
       answer they no longer want. Only "load more" and "try again" are disabled, because those two
       would append the same rows twice. -->
  <div class="filters">${EVENT_GROUPS.map((group) =>
    `<button type="button" data-group="${group.id}" data-hint="${escapeHtml(group.hint)}"`
    + ` aria-pressed="${group.id === state.group ? 'true' : 'false'}">`
    + `${escapeHtml(group.label)}</button>`).join('')}</div>
  <p class="hint">${escapeHtml(state.loading ? 'Reading…' : groupById(state.group).hint)}</p>
  ${body(state, lines)}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('button[data-group]').forEach((b) => {
    b.addEventListener('click', () => vscode.postMessage({ type: 'group', group: b.dataset.group }));
  });
  const more = document.getElementById('more');
  if (more) { more.addEventListener('click', () => vscode.postMessage({ type: 'more' })); }
  const retry = document.getElementById('retry');
  if (retry) { retry.addEventListener('click', () => vscode.postMessage({ type: 'retry' })); }
</script>
</body>
</html>`;
}

/**
 * The middle of the page: an explanation, a table, or both.
 *
 * <p>The four states are different sentences on purpose. "This server keeps no log" and "nothing
 * has happened yet" are opposite facts, and showing an empty table for the first tells somebody
 * their company's history is empty when it is merely unreachable.</p>
 */
function body(state: EventPageState, lines: readonly EventLine[]): string {
  // A failure takes precedence over "no log here": the second is a fact about the server's version,
  // and the first is one about this attempt — showing only the version would leave a person with no
  // error and no way to try again.
  if (state.noLogHere && state.error === undefined) {
    return `<p class="empty">This server does not keep an event log. It is older than the version
      that records one — everything below would be a history it never wrote.</p>`;
  }
  return [
    state.error === undefined ? '' : errorBanner(state),
    rowsOrNothing(state, lines),
    droppedNote(state),
    moreButton(state),
  ].join('');
}

/** The table, or the sentence that stands in for it — never an empty table under an error. */
function rowsOrNothing(state: EventPageState, lines: readonly EventLine[]): string {
  if (lines.length > 0) {
    return table(lines);
  }
  return state.error === undefined ? emptyState(state) : '';
}

function errorBanner(state: EventPageState): string {
  return `<p class="error">${escapeHtml(state.error ?? '')}</p>
    <p class="more"><button type="button" id="retry"${state.loading ? ' disabled' : ''}>${
    state.loading ? 'Reading…' : 'Try again'}</button></p>`;
}

function emptyState(state: EventPageState): string {
  return state.group === 'all'
    ? '<p class="empty">Nothing here yet. Rows appear as people share, roles change and projects move.</p>'
    : `<p class="empty">No ${escapeHtml(groupById(state.group).label.toLowerCase())} rows you may see.</p>`;
}

function droppedNote(state: EventPageState): string {
  return state.dropped === 0
    ? ''
    : `<p class="hint">The oldest ${state.dropped} row(s) loaded in this tab were dropped to keep it
       responsive. They are still on the server; narrow the range to read them.</p>`;
}

function moreButton(state: EventPageState): string {
  if (!state.hasMore) {
    return '';
  }
  // The button follows the CURSOR, not the emptiness of a page: the server bounds what one request
  // may scan, so an empty page carrying a cursor means "nothing yet, keep going".
  return `<p class="more"><button type="button" id="more"${state.loading ? ' disabled' : ''}>${
    state.loading ? 'Reading…' : 'Load more'}</button></p>`;
}

function table(lines: readonly EventLine[]): string {
  return `<table>
    <thead><tr><th>When</th><th>What</th><th>Who</th><th>About</th><th>Entry</th><th>Detail</th></tr></thead>
    <tbody>${lines.map((line) => tableRow(line)).join('')}</tbody>
  </table>`;
}

function tableRow(line: EventLine): string {
  return `<tr data-kind="${escapeHtml(line.kind)}">
    <td class="when">${escapeHtml(line.when)}</td>
    <td>${escapeHtml(line.what)}</td>
    <td>${escapeHtml(line.actor)}</td>
    <td>${escapeHtml(line.subject)}</td>
    <td>${escapeHtml(line.entity)}</td>
    <td class="detail">${escapeHtml(line.detail)}</td>
  </tr>`;
}
