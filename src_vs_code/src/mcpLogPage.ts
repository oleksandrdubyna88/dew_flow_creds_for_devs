import * as crypto from 'node:crypto';
import {
  MCP_LOG_FILTERS,
  McpLogRow,
  applyFilter,
  emptyMessage,
  isAgentSecret,
  isRefusal,
  isRotation,
} from './mcpLogRows';
import { escapeHtml } from './webviewHtml';

/**
 * The **MCP logs** page: markup, CSS and its in-page filter.
 *
 * <p>Pure and `vscode`-free, exactly like `entityFormPage.ts` and `folderFormPage.ts` beside it,
 * so what it shows — and what it escapes — is a unit test rather than something a running editor
 * has to be opened to check. The panel next door reads the disk and owns the webview.</p>
 *
 * <p><b>Rendered once, filtered in the page.</b> The rows are in memory by the time this is
 * called, and a filter that went back to the extension host would make three buttons feel like
 * three loads.</p>
 */

/** The page. Pure, so what it shows — and does not show — is a test. */
// One template literal, like the other pages here. No backticks inside it.
// eslint-disable-next-line max-lines-per-function
export function renderMcpLog(rows: readonly McpLogRow[]): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
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
  .lede { opacity: .8; margin: 0 0 12px; max-width: 70ch; }
  .filters { display: flex; gap: 6px; margin: 0 0 6px; flex-wrap: wrap; }
  button { padding: 3px 10px; cursor: pointer; border: 1px solid var(--vscode-widget-border, #4444);
           background: transparent; color: var(--vscode-foreground); border-radius: 3px; }
  button[aria-pressed=true] { background: var(--vscode-button-background);
                              color: var(--vscode-button-foreground); border-color: transparent; }
  .hint { opacity: .75; margin: 0 0 12px; font-size: .9em; min-height: 1.2em; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 4px 10px 4px 0; vertical-align: top;
           border-bottom: 1px solid var(--vscode-widget-border, #3333); }
  th { opacity: .7; font-weight: 600; }
  td.when { white-space: nowrap; opacity: .8; font-family: var(--vscode-editor-font-family); }
  td.detail { opacity: .8; word-break: break-word; }
  .refused { color: var(--vscode-credSshManager-depColor3, #FF8A76); }
  .rotated { color: var(--vscode-credSshManager-depColor2, #E8B02A); }
  .empty { opacity: .8; margin: 16px 0; max-width: 70ch; }
</style>
</head>
<body>
  <h2>MCP logs</h2>
  <p class="lede">Every call an AI agent made to this window, from the same record the broker
    writes to disk. Nothing here is a second copy: it is the audit file, filtered to the calls
    that arrived through MCP.</p>
  <div class="filters">${MCP_LOG_FILTERS.map(
    (f) =>
      `<button type="button" data-filter="${f.id}" data-hint="${escapeHtml(f.hint)}" aria-pressed="${f.id === 'all' ? 'true' : 'false'}">${escapeHtml(f.label)} <span class="count" data-for="${f.id}">${applyFilter(rows, f.id).length}</span></button>`,
  ).join('')}</div>
  <p class="hint" id="hint">${escapeHtml(MCP_LOG_FILTERS[0].hint)}</p>
  ${rows.length === 0 ? `<p class="empty">${escapeHtml(emptyMessage('all', 0))}</p>` : table(rows)}
<script nonce="${nonce}">
  const hints = {};
  document.querySelectorAll('button[data-filter]').forEach((b) => { hints[b.dataset.filter] = b.dataset.hint; });
  function show(which) {
    document.querySelectorAll('button[data-filter]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.filter === which ? 'true' : 'false');
    });
    document.getElementById('hint').textContent = hints[which] || '';
    document.querySelectorAll('tr[data-kind]').forEach((row) => {
      const kinds = row.dataset.kind.split(' ');
      row.style.display = which === 'all' || kinds.indexOf(which) >= 0 ? '' : 'none';
    });
    const shown = document.querySelectorAll('tr[data-kind]:not([style*="none"])').length;
    const empty = document.getElementById('none');
    if (empty) { empty.style.display = shown === 0 ? '' : 'none'; }
  }
  document.querySelectorAll('button[data-filter]').forEach((b) => {
    b.addEventListener('click', () => show(b.dataset.filter));
  });
</script>
</body>
</html>`;
}

function table(rows: readonly McpLogRow[]): string {
  return `<table>
    <thead><tr><th>When</th><th>What</th><th>Entry</th><th>Outcome</th><th>Detail</th></tr></thead>
    <tbody>${rows.map((row) => tableRow(row)).join('')}</tbody>
  </table>
  <p class="empty" id="none" style="display:none">Nothing matches that filter.</p>`;
}

/**
 * One row, with the classes the in-page filter switches on.
 *
 * <p>A row can be both — a refused rotation is a refusal — so the kinds are a list rather than
 * one word. Getting that wrong would hide a refused rotation from the refusals filter, which is
 * the row somebody looking at that filter most wants to see.</p>
 */
function tableRow(row: McpLogRow): string {
  const kinds = kindsOf(row);
  return `<tr data-kind="${kinds.join(' ')}">
    <td class="when">${escapeHtml(row.day)} ${escapeHtml(clockOf(row))}</td>
    <td>${escapeHtml(row.action)}</td>
    <td>${escapeHtml(row.entityName)}</td>
    <td class="${outcomeClass(kinds[0])}">${escapeHtml(row.outcome)}</td>
    <td class="detail">${escapeHtml(row.detail ?? '')}</td>
  </tr>`;
}

/**
 * Which filter this row belongs to, and what colours its outcome.
 *
 * <p>The two are the same word here, and the cases do not overlap: `isRotation` is false for a
 * refused rotation, because nothing was replaced. So a rotation an agent asked for and did not
 * get appears under <b>Refused</b> and not under <b>Secrets replaced</b> — which is the only
 * reading of those two words that leaves the second one worth trusting.</p>
 */
function kindsOf(row: McpLogRow): string[] {
  if (isRefusal(row)) {
    return ['refused'];
  }
  if (isRotation(row)) {
    return ['rotations'];
  }
  return isAgentSecret(row) ? ['agentSecrets'] : [];
}

/** The filter id is a filter id; these are the two that also colour a cell. */
function outcomeClass(kind: string | undefined): string {
  if (kind === 'rotations' || kind === 'agentSecrets') {
    return 'rotated';
  }
  return kind ?? '';
}

function clockOf(row: McpLogRow): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${two(row.at.getUTCHours())}:${two(row.at.getUTCMinutes())}:${two(row.at.getUTCSeconds())}Z`;
}
