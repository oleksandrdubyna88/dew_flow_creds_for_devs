import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { copySecret } from './secretClipboard';
import { DbConnParts } from './dbConnString';
import { CommandArg, EntityMetadata } from './types';
import { buildCommandLine, normalizeArgs } from './commandLine';
import { highlightScript, resolveScriptEnv } from './scriptRender';
import { Revision, summarizeRevision } from './revisionHistory';
import { BINDABLE_FIELDS, BindableField } from './envBinding';

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
  hasAttachment: boolean;
  /** Creation / last-change times of the node, shown as dates rather than raw numbers. */
  createdAt?: number;
  updatedAt?: number;
  /** Previous versions, newest first. Empty when nothing has been changed yet. */
  history: Revision[];
  /** data: URI for the stored image — the one secret deliberately SENT to the webview,
   * because a preview cannot round-trip through the host. */
  imageDataUri?: string;
  /** Save-As for the stored attachment / image. */
  saveAttachment: (which: 'attachment' | 'image') => Promise<void>;
  /** Write one bindable field into the terminal env collection under `name`. */
  setEnv: (field: BindableField, name: string) => Promise<boolean>;
  /** Open a fresh terminal and echo `name`, so the variable is SEEN rather than trusted. */
  checkEnv: (name: string) => void;
}

interface CopyMessage {
  type: 'copy' | 'download' | 'env' | 'envcheck' | 'close';
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
    const d = options.details;
    if (message.type === 'close') {
      panel.dispose();
      return;
    }
    if (message.type === 'env' || message.type === 'envcheck') {
      const field = message.field as BindableField;
      if (!(BINDABLE_FIELDS as readonly string[]).includes(field)) {
        return;
      }
      const bound = d.envBindings?.[field];
      if (bound === undefined) {
        return;
      }
      if (message.type === 'env') {
        await options.setEnv(field, bound);
      } else {
        options.checkEnv(bound);
      }
      return;
    }
    if (message.type === 'download' && message.field === 'vpnConfig') {
      await options.saveVpnConfig();
      return;
    }
    if (message.type === 'download' && (message.field === 'attachment' || message.field === 'image')) {
      await options.saveAttachment(message.field);
      return;
    }
    if (message.type !== 'copy') {
      return;
    }
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
      case 'createdAt':
        value = options.createdAt === undefined ? undefined : new Date(options.createdAt).toISOString();
        break;
      case 'updatedAt':
        value = options.updatedAt === undefined ? undefined : new Date(options.updatedAt).toISOString();
        break;
      case 'scriptLanguage': value = d.scriptLanguage; break;
      case 'script': value = d.script; break;
      case 'scriptFull':
        value =
          d.script !== undefined
            ? resolveScriptEnv(d.script, d.scriptVars, d.scriptLanguage ?? 'other').body
            : undefined;
        break;
      default: {
        const env = /^envname_(.+)$/.exec(message.field);
        if (env !== null) {
          value = d.envBindings?.[env[1]];
          break;
        }
        const revision = /^rev(\d+)$/.exec(message.field);
        if (revision !== null) {
          // The old secret, on demand and through the host — a previous password is
          // still a password.
          const r = options.history[Number(revision[1])];
          value =
            r === undefined
              ? undefined
              : (r.secrets.password ??
                r.secrets.privateKey ??
                r.secrets.dbConnection ??
                r.secrets.vpnConfig ??
                r.secrets.notes);
          break;
        }
        const svar = /^svar(\d+)$/.exec(message.field);
        if (svar !== null) {
          value = normalizeArgs(d.scriptVars)[Number(svar[1])]?.value;
          break;
        }
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
    // Env-binding UI appears ONLY when the binding is switched on in Edit. When it is:
    // the variable's name (what your scripts reference), a copy button for that name,
    // and the Set button — the manual recovery for a lost collection. Switched off,
    // the row shows nothing about env at all.
    const envName = (BINDABLE_FIELDS as readonly string[]).includes(field)
      ? d.envBindings?.[field]
      : undefined;
    const envLine =
      envName !== undefined
        ? `<div class="line envLine"><span class="envTag">$${escapeHtml(envName)}</span>
        <button data-field="envname_${field}" data-action="copy" class="icon" title="Copy variable name" aria-label="Copy variable name">${COPY_ICON}</button>
        <button data-field="${field}" data-action="env" class="icon env" title="Write the current value into $${escapeHtml(envName)} for new terminals" aria-label="Set ${escapeHtml(envName)}">ENV</button>
        <button data-field="${field}" data-action="envcheck" class="icon env" title="Open a terminal and echo $${escapeHtml(envName)} — see it is really there" aria-label="Check ${escapeHtml(envName)} in a terminal">✓?</button>
      </div>`
        : '';
    return `<div class="row">
      <label>${escapeHtml(label)}</label>
      <div class="line">${control}
        <button data-field="${field}" data-action="${action}" class="icon" title="${verb} ${escapeHtml(label)}" aria-label="${verb} ${escapeHtml(label)}">${icon}</button>
      </div>${envLine}
    </div>`;
  };

  /**
   * One argument, with its note underneath rather than beside it — the same shape as the
   * form, because a value and its explanation read as a pair or not at all. A disabled
   * row is shown and labelled: it is kept deliberately, and hiding it would make the
   * entry look like it lost an argument.
   */
  /**
   * One argument or script variable.
   *
   * <p>A script VARIABLE is masked like every other secret in this viewer: variables are
   * the mechanism for pulling secret values out of a script body, so their values are
   * exactly the thing this panel must not render — the copy button round-trips through
   * the extension host instead, as Password and Connection string already do. A terminal
   * ARGUMENT is not a secret (the whole line is shown in "Full command" anyway) and
   * stays visible.</p>
   */
  const argRow = (arg: CommandArg, index: number, secret = false): string => {
    const note = arg.note !== undefined && arg.note.length > 0 ? arg.note : '';
    const off = arg.disabled === true ? ' (off — not part of the command)' : '';
    const field = secret ? `svar${index}` : `arg${index}`;
    const shown = secret ? '••••••••' : arg.value;
    return `<div class="row">
      <label>${escapeHtml(arg.name !== undefined && arg.name.length > 0 ? `Variable \${${arg.name}}${off}` : `Argument ${index + 1}${off}`)}</label>
      <div class="line"><input readonly value="${escapeHtml(shown)}">
        <button data-field="${field}" data-action="copy" class="icon" title="Copy value" aria-label="Copy value">${COPY_ICON}</button>
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
    ...(d.isTerminal ? normalizeArgs(d.commandArgs).map((a, i) => argRow(a, i)) : []),
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
    row('Script language', 'scriptLanguage', d.isScript ? (d.scriptLanguage ?? 'bash') : undefined),
    ...(d.isScript && d.script !== undefined && d.script.length > 0
      ? [
          `<div class="row"><label>Script</label>
      <div class="line"><pre class="code">${highlightScript(d.script, d.scriptLanguage ?? 'other')}</pre>
        <button data-field="script" data-action="copy" class="icon" title="Copy script (raw)" aria-label="Copy script">${COPY_ICON}</button>
      </div></div>`,
        ]
      : []),
    ...(d.isScript ? normalizeArgs(d.scriptVars).map((v, i) => argRow(v, i, true)) : []),
    // Visible again, and safe to be: the body reads its variables from the environment
    // now, so it carries names rather than values (see resolveScriptEnv).
    row(
      'Script as it runs (variables read from the environment)',
      'scriptFull',
      d.isScript && d.script !== undefined && d.script.length > 0
        ? resolveScriptEnv(d.script, d.scriptVars, d.scriptLanguage ?? 'other').body
        : undefined,
    ),
    row('Notes', 'notes', options.notes),
    row('Created', 'createdAt', options.createdAt === undefined ? undefined : new Date(options.createdAt).toLocaleString()),
    row('Last changed', 'updatedAt', options.updatedAt === undefined ? undefined : new Date(options.updatedAt).toLocaleString()),
    ...(options.history.length > 0
      ? [
          `<div class="row"><label>History (${options.history.length} kept, newest first)</label>${options.history
            .map(
              (r, i) =>
                `<div class="line"><input readonly value="${escapeHtml(summarizeRevision(r))}">
        <button data-field="rev${i}" data-action="copy" class="icon" title="Copy that version's secret" aria-label="Copy previous secret">${COPY_ICON}</button>
      </div>`,
            )
            .join('')}</div>`,
        ]
      : []),
    row(
      `Additional file${d.attachmentFileName ? ` (${d.attachmentFileName})` : ''}`,
      'attachment',
      options.hasAttachment ? '•' : undefined,
      true,
      'download',
    ),
    ...(options.imageDataUri !== undefined
      ? [
          `<div class="row"><label>Additional image${d.imageFileName ? ` (${escapeHtml(d.imageFileName)})` : ''}</label>
      <div class="line">
        <img id="imgPreview" class="preview" src="${options.imageDataUri}"
             title="Click to zoom (×2, twice; a third click resets)" alt="Stored image">
        <button data-field="image" data-action="download" class="icon" title="Save image" aria-label="Save image">${DOWNLOAD_ICON}</button>
      </div></div>`,
        ]
      : []),
  ].join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 16px 24px; max-width: 640px; }
  h2 { margin: 0 0 14px; font-size: 1.2em; }
  .row { margin-bottom: 10px; }
  .note { opacity: .75; font-style: italic; }
  .env { font-size: .72em; letter-spacing: .5px; }
  .envTag { opacity: .8; font-family: var(--vscode-editor-font-family); font-size: .9em; }
  .envLine { margin-top: 3px; align-items: center; }
  .code { flex: 1; margin: 0; padding: 6px 8px; max-height: 320px; overflow: auto;
    font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; line-height: 1.45;
    white-space: pre-wrap; word-break: break-all;
    border: 1px solid var(--vscode-widget-border, #3c3c3c); border-radius: 4px; }
  .tok-comment { color: var(--vscode-descriptionForeground); font-style: italic; }
  .tok-string { color: var(--vscode-charts-orange, #ce9178); }
  .tok-kw { color: var(--vscode-charts-blue, #569cd6); font-weight: 600; }
  .tok-num { color: var(--vscode-charts-green, #b5cea8); }
  .tok-var { color: var(--vscode-charts-purple, #c586c0); font-weight: 600; }
  .preview { width: 200px; height: 200px; object-fit: contain; cursor: zoom-in;
             border: 1px solid var(--vscode-widget-border, #3c3c3c); border-radius: 4px;
             background: var(--vscode-editor-background); }
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
        type: button.dataset.action || 'copy',
        field: button.dataset.field,
      });
    });
  }
  // Esc closes the viewer, as it closes every other read-only surface in the editor.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      vscode.postMessage({ type: 'close', field: '' });
    }
  });
  // The preview starts at 200x200; each click doubles it, twice, then a click resets.
  const preview = document.getElementById('imgPreview');
  if (preview) {
    let zoom = 0;
    preview.addEventListener('click', () => {
      zoom = (zoom + 1) % 3;
      const size = 200 * Math.pow(2, zoom);
      preview.style.width = size + 'px';
      preview.style.height = size + 'px';
      preview.style.cursor = zoom === 2 ? 'zoom-out' : 'zoom-in';
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
