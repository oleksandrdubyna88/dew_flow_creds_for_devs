import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { copySecret } from './secretClipboard';
import { DbConnParts } from './dbConnString';
import { CommandArg, EntityMetadata } from './types';
import { buildCommandLine, normalizeArgs } from './commandLine';

/**
 * Read-only entity viewer (opened by double-click): the edit form's layout
 * with nothing editable and no Save — just values and a Copy button per
 * field. Secrets are shown masked and are NEVER sent into the webview;
 * their Copy buttons round-trip through the extension host, which reads
 * SecretStorage and writes the clipboard directly.
 */

export interface EntityViewOptions {
  details: EntityMetadata;
  keySourceName?: string;
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasVpnConfig: boolean;
  hasDbConnection: boolean;
  /** Resolved note (from SecretStorage), shown read-only with copy. */
  notes?: string;
  /** Parsed parts of the stored connection string (password not included). */
  dbParts?: DbConnParts;
  /** The shown port is the type's default, not explicit in the string. */
  dbPortIsDefault: boolean;
  dbHasPassword: boolean;
  sshCommand?: string;
  resolveSecret: (
    field: 'password' | 'privateKey' | 'vpnConfig' | 'dbConnection' | 'dbPassword',
  ) => Thenable<string | undefined>;
  copyAllText: () => Promise<string>;
  /** Save-As flow for the VPN config (the row's button is a download). */
  saveVpnConfig: () => Promise<void>;
}

interface CopyMessage {
  type: 'copy' | 'download';
  field: string;
}

export function showEntityView(options: EntityViewOptions): void {
  const panel = vscode.window.createWebviewPanel(
    'credSshEntityView',
    options.details.name,
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] },
  );
  panel.webview.html = renderHtml(options);

  panel.webview.onDidReceiveMessage(async (message: CopyMessage) => {
    if (message.type === 'download' && message.field === 'vpnConfig') {
      await options.saveVpnConfig();
      return;
    }
    if (message.type !== 'copy') {
      return;
    }
    const d = options.details;
    let value: string | undefined;
    switch (message.field) {
      case 'password':
      case 'privateKey':
      case 'vpnConfig':
      case 'dbConnection':
      case 'dbPassword':
        value = await options.resolveSecret(message.field);
        break;
      case 'all':
        value = await options.copyAllText();
        break;
      case 'name': value = d.name; break;
      case 'host': value = d.host; break;
      case 'user': value = d.user; break;
      case 'port': value = d.port !== undefined ? String(d.port) : undefined; break;
      case 'sshKeyPath': value = d.sshKeyPath; break;
      case 'publicKey': value = d.publicKey; break;
      case 'notes': value = options.notes ?? d.notes; break;
      case 'vpnType': value = d.vpnType; break;
      case 'dbType': value = d.dbType; break;
      case 'dbHost': value = options.dbParts?.host; break;
      case 'dbPort': value = options.dbParts?.port; break;
      case 'dbName': value = options.dbParts?.database; break;
      case 'dbUser': value = options.dbParts?.user; break;
      case 'ssh': value = options.sshCommand; break;
      case 'command': value = d.command; break;
      case 'commandNote': value = d.commandNote; break;
      case 'fullCommand': value = buildCommandLine(d.command ?? '', d.commandArgs); break;
      default: {
        // Argument rows are numbered rather than named — there can be any number of them.
        const arg = /^arg(\d+)$/.exec(message.field);
        if (arg === null) {
          return;
        }
        value = normalizeArgs(d.commandArgs)[Number(arg[1])]?.value;
        break;
      }
    }
    if (value === undefined || value.length === 0) {
      void vscode.window.showWarningMessage('Nothing to copy — the field is empty.');
      return;
    }
    await copySecret(vscode.env.clipboard, value);
    void panel.webview.postMessage({ type: 'copied', field: message.field });
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline "two pages" copy icon; follows the theme via currentColor. */
const COPY_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">' +
  '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/>' +
  '<path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>';

const DOWNLOAD_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">' +
  '<path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10"/></svg>';

const CHECK_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">' +
  '<path d="M3 8.5 6.5 12 13 4.5"/></svg>';

function renderHtml(options: EntityViewOptions): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const d = options.details;

  // Render ONLY fields that actually hold a value — the viewer must never
  // show empty rows or capabilities the entity does not have.
  const row = (
    label: string,
    field: string,
    value: string | undefined,
    masked = false,
    action: 'copy' | 'download' = 'copy',
  ) => {
    if (value === undefined || value.length === 0) {
      return '';
    }
    const shown = masked ? '••••••••' : value;
    const isLong = !masked && (value.includes('\n') || value.length > 60);
    const control = isLong
      ? `<textarea readonly rows="${Math.min(6, value.split('\n').length + 1)}">${escapeHtml(value)}</textarea>`
      : `<input readonly value="${escapeHtml(shown)}">`;
    const verb = action === 'download' ? 'Save' : 'Copy';
    const icon = action === 'download' ? DOWNLOAD_ICON : COPY_ICON;
    return `<div class="row">
      <label>${escapeHtml(label)}</label>
      <div class="line">${control}
        <button data-field="${field}" data-action="${action}" class="icon" title="${verb} ${escapeHtml(label)}" aria-label="${verb} ${escapeHtml(label)}">${icon}</button>
      </div>
    </div>`;
  };

  /**
   * One argument, with its note underneath rather than beside it — the same shape as the
   * form, because a value and its explanation read as a pair or not at all. A disabled
   * row is shown and labelled: it is kept deliberately, and hiding it would make the
   * entry look like it lost an argument.
   */
  const argRow = (arg: CommandArg, index: number): string => {
    const note = arg.note !== undefined && arg.note.length > 0 ? arg.note : '';
    const off = arg.disabled === true ? ' (off — not part of the command)' : '';
    return `<div class="row">
      <label>${escapeHtml(`Argument ${index + 1}${off}`)}</label>
      <div class="line"><input readonly value="${escapeHtml(arg.value)}">
        <button data-field="arg${index}" data-action="copy" class="icon" title="Copy argument" aria-label="Copy argument">${COPY_ICON}</button>
      </div>
      ${note.length > 0 ? `<div class="line"><input readonly class="note" value="${escapeHtml(note)}"></div>` : ''}
    </div>`;
  };

  const rows = [
    row('Name', 'name', d.name),
    row('Host', 'host', d.host),
    row('User', 'user', d.user),
    row('Port', 'port', d.port !== undefined ? String(d.port) : undefined),
    row('Password', 'password', options.hasPassword ? '•' : undefined, true),
    row('Private key', 'privateKey', options.hasPrivateKey ? '•' : undefined, true),
    row('Public key', 'publicKey', d.publicKey),
    row('SSH key path', 'sshKeyPath', d.sshKeyPath),
    ...(options.keySourceName !== undefined
      ? [`<div class="row"><label>Key source</label>
          <div class="line"><input readonly value="entity: ${escapeHtml(options.keySourceName)}"></div></div>`]
      : []),
    row('SSH command', 'ssh', options.sshCommand),
    // A command entry: the verb, what it is for, every argument with its own note, and
    // the line that actually runs. The viewer previously knew nothing about this kind,
    // so it rendered a Name and stopped.
    row('Command', 'command', d.isTerminal ? d.command : undefined),
    row('What it is for', 'commandNote', d.isTerminal ? d.commandNote : undefined),
    ...(d.isTerminal ? normalizeArgs(d.commandArgs).map(argRow) : []),
    row(
      'Full command',
      'fullCommand',
      d.isTerminal ? buildCommandLine(d.command ?? '', d.commandArgs) : undefined,
    ),
    row('VPN type', 'vpnType', d.isVpn ? (d.vpnType ?? 'other') : undefined),
    row(
      `VPN config${d.vpnConfigFileName ? ` (${d.vpnConfigFileName})` : ''}`,
      'vpnConfig',
      options.hasVpnConfig ? '•' : undefined,
      true,
      'download',
    ),
    row('DB type', 'dbType', d.isDb ? (d.dbType ?? 'other') : undefined),
    row('Connection string', 'dbConnection', options.hasDbConnection ? '•' : undefined, true),
    row('DB host', 'dbHost', options.dbParts?.host),
    row(
      options.dbPortIsDefault ? 'DB port (default)' : 'DB port',
      'dbPort',
      options.dbParts?.port,
    ),
    row('DB name', 'dbName', options.dbParts?.database),
    row('DB user', 'dbUser', options.dbParts?.user),
    row('DB password', 'dbPassword', options.dbHasPassword ? '•' : undefined, true),
    row('Notes', 'notes', options.notes),
  ].join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 16px 24px; max-width: 640px; }
  h2 { margin: 0 0 14px; font-size: 1.2em; }
  .row { margin-bottom: 10px; }
  .note { opacity: .75; font-style: italic; }
  label { display: block; margin-bottom: 3px; opacity: .8; }
  .line { display: flex; gap: 8px; align-items: flex-start; }
  input, textarea { flex: 1; box-sizing: border-box; padding: 5px 7px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace); }
  textarea { resize: vertical; white-space: pre; }
  button { padding: 5px 14px; border: none; border-radius: 3px; cursor: pointer;
           background: var(--vscode-button-secondaryBackground);
           color: var(--vscode-button-secondaryForeground); }
  button.icon { padding: 5px 8px; min-width: 32px; display: inline-flex;
                align-items: center; justify-content: center; }
  button.primary { background: var(--vscode-button-background);
                   color: var(--vscode-button-foreground);
                   display: inline-flex; align-items: center; gap: 6px; }
  .footer { margin-top: 16px; }
</style>
</head>
<body>
  <h2>${escapeHtml(d.name)}</h2>
  ${rows}
  <div class="footer">
    <button class="primary" data-field="all">${COPY_ICON} Copy All</button>
  </div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  for (const button of document.querySelectorAll('button[data-field]')) {
    button.addEventListener('click', () => {
      vscode.postMessage({
        type: button.dataset.action === 'download' ? 'download' : 'copy',
        field: button.dataset.field,
      });
    });
  }
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'copied') { return; }
    const button = document.querySelector('button[data-field="' + event.data.field + '"]');
    if (!button) { return; }
    const original = button.innerHTML;
    button.innerHTML = ${JSON.stringify(CHECK_ICON)};
    setTimeout(() => { button.innerHTML = original; }, 1200);
  });
</script>
</body>
</html>`;
}
