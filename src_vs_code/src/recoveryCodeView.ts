import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { escapeHtml } from './webviewHtml';

/**
 * The one-time display of a freshly generated recovery code.
 *
 * <p>A panel rather than a notification, because this has to be READ and then physically
 * written down or printed — the same reason the entity viewer renders a TOTP code instead of
 * round-tripping it. It is the only place the code is ever shown; nothing stores it, and no
 * command can bring it back. Regenerating produces a different one and kills this.</p>
 *
 * <p><b>There is deliberately no Copy button.</b> Every other secret surface in this extension
 * leads with one, and this is the exception with a reason: a clipboard on a normal machine is
 * read by a clipboard manager, a sync tool, or a screenshot pipeline, and a factor that exists
 * for the day the laptop is gone must not take that route. Print is the affordance.</p>
 */

export interface RecoveryCodeViewOptions {
  email: string;
  /** The grouped display form. Shown once, then forgotten by everything. */
  code: string;
  createdAt: number;
  /** True when this replaced an earlier code, which the page must say out loud. */
  regenerated: boolean;
}

export function showRecoveryCodeView(options: RecoveryCodeViewOptions): void {
  const panel = vscode.window.createWebviewPanel(
    'credSshRecoveryCode',
    `Recovery code — ${options.email}`,
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] },
  );
  panel.webview.html = renderHtml(options);
  panel.webview.onDidReceiveMessage((message: { type?: string }) => {
    if (message?.type === 'close') {
      panel.dispose();
    }
  });
}

/** The code broken into its printed groups, so a long line never wraps mid-group. */
function groupsOf(code: string): string {
  return code
    .split('-')
    .map((group) => `<span class="grp">${escapeHtml(group)}</span>`)
    .join('<span class="sep">-</span>');
}

/** Printing keeps the code, who it belongs to and when — and nothing else. */
const STYLES = `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 20px 28px; max-width: 640px; }
  h2 { margin: 0 0 4px; font-size: 1.25em; }
  .who { opacity: .75; margin: 0 0 18px; }
  .code { font-family: var(--vscode-editor-font-family, monospace); font-size: 1.5em;
          letter-spacing: .06em; padding: 16px 18px; border-radius: 6px;
          border: 1px solid var(--vscode-widget-border, #3c3c3c);
          background: var(--vscode-textCodeBlock-background, rgba(127,127,127,.1));
          word-break: break-word; line-height: 1.7; }
  .grp { white-space: nowrap; }
  .sep { opacity: .4; padding: 0 .1em; }
  .warn { color: var(--vscode-charts-orange, #ce9178); font-weight: 600; }
  ul { padding-left: 1.2em; line-height: 1.6; }
  .meta { opacity: .7; font-size: .9em; }
  button { font-family: inherit; font-size: 1em; padding: 6px 16px; cursor: pointer;
           border: none; border-radius: 3px;
           background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.secondary { background: var(--vscode-button-secondaryBackground);
                     color: var(--vscode-button-secondaryForeground); }
  .actions { display: flex; gap: 8px; margin-top: 20px; }
  @media print {
    body { background: #fff; color: #000; max-width: none; }
    .noPrint { display: none; }
    .code { border: 1px solid #000; background: #fff; }
    .warn { color: #000; }
  }`;

/** Everything the paper does not need: what this is, how to keep it, and the two buttons. */
const GUIDANCE = `
<div class="noPrint">
  <p><strong>This is shown once.</strong> It is not stored anywhere and cannot be displayed
  again — only replaced by a new one.</p>
  <ul>
    <li><strong>Print this page, or write the code out by hand</strong>, and keep the paper
        where you keep documents — not beside the laptop.</li>
    <li><strong>Do not photograph it and do not paste it into a note app.</strong> A phone
        gallery and a note sync are both somebody else's server; this code opens the vault
        without your PIN and without your security key.</li>
    <li>It does not expire. Generating a new one is what retires this.</li>
  </ul>
  <p class="meta">There is no button to copy this on purpose — a clipboard is read by more
  programs than you think, and this is the factor for the day everything else is gone.</p>
  <div class="actions">
    <button id="print" type="button">Print…</button>
    <button id="done" type="button" class="secondary">I have written it down</button>
  </div>
</div>`;

function renderHtml(options: RecoveryCodeViewOptions): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const when = new Date(options.createdAt).toLocaleString();
  const replaced = options.regenerated
    ? '<p class="warn">This replaces the code you had before. That older printout no longer opens anything — destroy it.</p>'
    : '';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>${STYLES}
</style>
</head>
<body>
<h2>Recovery code</h2>
<p class="who">${escapeHtml(options.email)} · created ${escapeHtml(when)}</p>
${replaced}
<div class="code">${groupsOf(options.code)}</div>
${GUIDANCE}
<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();
  document.getElementById('print').addEventListener('click', () => window.print());
  document.getElementById('done').addEventListener('click', () => vscodeApi.postMessage({ type: 'close' }));
</script>
</body>
</html>`;
}
