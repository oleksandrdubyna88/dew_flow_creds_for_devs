import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { normalizeArgs } from './commandLine';
import {
  CommandArg,
  DB_TYPES,
  DbType,
  EntityKind,
  EntityMetadata,
  VPN_TYPES,
  VpnType,
  kindOf,
} from './types';

/**
 * A single-window entity form (Webview panel). The entity KIND is chosen
 * with one selector — credential / ssh / sshkey / vpn / db — and only the
 * fields of that kind are shown. Saving with a kind scrubs the other
 * kinds' fields, so switching type leaves no stale data behind.
 *
 * Secrets discipline: the stored password / private key / VPN config are
 * NEVER sent into the webview (empty = keep, "clear" checkbox removes).
 * The DB connection string is the one deliberate exception — it is
 * prefilled in edit mode so it stays a genuinely editable field.
 */

export interface KeyCandidate {
  id: string;
  name: string;
}

export interface EntityFormOptions {
  mode: 'create' | 'edit';
  entityId: string;
  initial?: EntityMetadata;
  hasStoredPassword: boolean;
  hasStoredPrivateKey: boolean;
  hasStoredVpnConfig: boolean;
  hasStoredDbConnection: boolean;
  initialDbConnection?: string;
  /** Prefilled note (its own secret now, not plaintext metadata). */
  initialNotes?: string;
  /** Set when the parent folder dictates the entity kind (selector locked). */
  lockedKind?: EntityKind;
  /** Other entities of the same account usable as a key source. */
  keyCandidates: KeyCandidate[];
}

export interface EntityFormValues {
  details: EntityMetadata;
  newPassword?: string;
  clearPassword: boolean;
  newPrivateKey?: string;
  clearPrivateKey: boolean;
  newVpnConfig?: string;
  clearVpnConfig: boolean;
  newDbConnection?: string;
  clearDbConnection: boolean;
  newNotes?: string;
}

/**
 * The argument rows, as the webview posts them.
 *
 * Read defensively: the payload crosses a webview boundary, so a malformed row is
 * dropped rather than trusted — the same reason every other value here goes through a
 * typed reader instead of being cast.
 */
function readArgRows(data: Record<string, unknown>): CommandArg[] {
  const raw = data.commandArgs;
  if (!Array.isArray(raw)) {
    return [];
  }
  const rows: CommandArg[] = [];
  for (const row of raw) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }
    const r = row as Record<string, unknown>;
    if (typeof r.value !== 'string') {
      continue;
    }
    rows.push({
      value: r.value,
      note: typeof r.note === 'string' ? r.note : undefined,
      disabled: r.disabled === true,
    });
  }
  return rows;
}

interface FormMessage {
  type: 'save' | 'cancel';
  data?: Record<string, unknown>;
}

export function showEntityForm(options: EntityFormOptions): Promise<EntityFormValues | undefined> {
  const panel = vscode.window.createWebviewPanel(
    'credSshEntityForm',
    options.mode === 'create' ? 'New Entity' : `Edit: ${options.initial?.name ?? ''}`,
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] },
  );
  panel.webview.html = renderHtml(options);

  return new Promise((resolve) => {
    let settled = false;
    panel.webview.onDidReceiveMessage((message: FormMessage) => {
      if (message.type === 'cancel') {
        panel.dispose();
        return;
      }
      if (message.type === 'save' && message.data !== undefined) {
        settled = true;
        resolve(toValues(message.data, options));
        panel.dispose();
      }
    });
    panel.onDidDispose(() => {
      if (!settled) {
        resolve(undefined);
      }
    });
  });
}

// ---------- form data → typed result ----------

function str(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' ? v : '';
}

function bool(data: Record<string, unknown>, key: string): boolean {
  return data[key] === true;
}

function isVpnType(value: string): value is VpnType {
  return (VPN_TYPES as readonly string[]).includes(value);
}

function isDbType(value: string): value is DbType {
  return (DB_TYPES as readonly string[]).includes(value);
}

function toValues(data: Record<string, unknown>, options: EntityFormOptions): EntityFormValues {
  const kind = (options.lockedKind ?? str(data, 'entityType')) as EntityKind;
  const isSsh = kind === 'ssh';
  const isKey = kind === 'sshkey';
  const isVpn = kind === 'vpn';
  const isDb = kind === 'db';
  const isTerminal = kind === 'terminal';

  const portText = str(data, 'port').trim();
  const password = str(data, 'password');
  const privateKey = str(data, 'privateKey');
  const keyEntity = str(data, 'sshKeyEntityId');
  const vpnConfig = str(data, 'vpnConfigContent');
  const vpnType = str(data, 'vpnType');
  const clearVpnConfig = isVpn && bool(data, 'clearVpnConfig');
  const vpnFileName = str(data, 'vpnConfigFileName').trim();
  const dbType = str(data, 'dbType');
  const dbConnection = str(data, 'dbConnection');
  const commandArgs = isTerminal ? normalizeArgs(readArgRows(data)) : undefined;

  return {
    details: {
      id: options.entityId,
      name: str(data, 'name').trim(),
      host: isSsh ? str(data, 'host').trim() || undefined : undefined,
      user: isSsh ? str(data, 'user').trim() || undefined : undefined,
      port: isSsh && portText !== '' ? Number(portText) : undefined,
      sshKeyPath: isSsh || isKey ? str(data, 'sshKeyPath').trim() || undefined : undefined,
      publicKey: isSsh || isKey ? str(data, 'publicKey').trim() || undefined : undefined,
      sshKeyEntityId: isSsh && keyEntity !== '' ? keyEntity : undefined,
      isSshEnabled: isSsh,
      isSshKey: isKey || undefined,
      isVpn: isVpn || undefined,
      vpnType: isVpn && isVpnType(vpnType) ? vpnType : undefined,
      vpnConfigFileName:
        isVpn && !clearVpnConfig && vpnFileName.length > 0 ? vpnFileName : undefined,
      isDb: isDb || undefined,
      dbType: isDb && isDbType(dbType) ? dbType : undefined,
      isTerminal: isTerminal || undefined,
      command: isTerminal ? str(data, 'command').trim() || undefined : undefined,
      commandArgs: isTerminal && commandArgs !== undefined && commandArgs.length > 0 ? commandArgs : undefined,
      commandNote: isTerminal ? str(data, 'commandNote').trim() || undefined : undefined,
      notes: undefined, // notes now live in SecretStorage, never in metadata
    },
    newPassword: !isDb && password.length > 0 ? password : undefined,
    clearPassword: bool(data, 'clearPassword'),
    newPrivateKey: (isSsh || isKey) && privateKey.length > 0 ? privateKey : undefined,
    clearPrivateKey: bool(data, 'clearPrivateKey'),
    newVpnConfig: isVpn && vpnConfig.length > 0 ? vpnConfig : undefined,
    clearVpnConfig,
    newDbConnection: isDb && dbConnection.length > 0 ? dbConnection : undefined,
    clearDbConnection:
      isDb && options.initialDbConnection !== undefined && dbConnection.length === 0,
    newNotes: str(data, 'notes'),
  };
}

// ---------- HTML ----------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(options: EntityFormOptions): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const d = options.initial;
  const isEdit = options.mode === 'edit';
  const kind = options.lockedKind ?? kindOf(d);

  const kindOptions = (
    [
      ['credential', 'Credential — name + secret value'],
      ['ssh', 'SSH connection'],
      ['sshkey', 'SSH key'],
      ['vpn', 'VPN'],
      ['db', 'Database'],
      ['terminal', 'Terminal command'],
    ] as const
  )
    .map(
      ([value, label]) =>
        `<option value="${value}"${kind === value ? ' selected' : ''}>${label}</option>`,
    )
    .join('');

  const keyOptions = [
    `<option value="">— own key (below) —</option>`,
    ...options.keyCandidates.map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${d?.sshKeyEntityId === c.id ? ' selected' : ''}>${escapeHtml(c.name)}</option>`,
    ),
  ].join('');

  const vpnTypeOptions = VPN_TYPES.map(
    (t) =>
      `<option value="${t}"${(d?.vpnType ?? 'openvpn') === t ? ' selected' : ''}>${t}</option>`,
  ).join('');
  const vpnConfigHint = options.hasStoredVpnConfig
    ? `A config is stored${d?.vpnConfigFileName ? ` (${escapeHtml(d.vpnConfigFileName)})` : ''}. Pick a file to replace it.`
    : 'No config stored yet. The file is read locally and kept encrypted in SecretStorage.';

  const dbTypeOptions = DB_TYPES.map(
    (t) =>
      `<option value="${t}"${(d?.dbType ?? 'postgres') === t ? ' selected' : ''}>${t}</option>`,
  ).join('');
  const dbConnHint = options.hasStoredDbConnection
    ? 'The stored value is shown — edit freely; emptying it clears it.'
    : 'e.g. postgresql://user:pass@host:5432/db — kept encrypted in SecretStorage.';

  const passwordHint = options.hasStoredPassword
    ? 'A value is stored. Leave empty to keep it.'
    : 'No value stored yet.';
  const privateKeyHint = options.hasStoredPrivateKey
    ? 'A private key is stored. Leave empty to keep it.'
    : 'No private key stored yet. Paste the full key (with line breaks).';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 16px 24px; max-width: 640px; }
  h2 { margin: 0 0 12px; font-size: 1.2em; }
  fieldset { border: 1px solid var(--vscode-widget-border, #4444); border-radius: 4px;
             margin: 0 0 14px; padding: 10px 12px; }
  legend { padding: 0 6px; opacity: .85; }
  label { display: block; margin: 8px 0 3px; }
  .check { display: flex; align-items: center; gap: 6px; margin: 6px 0; }
  .check label { margin: 0; }
  input[type=text], input[type=password], input[type=number], textarea, select {
    width: 100%; box-sizing: border-box; padding: 5px 7px;
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace); }
  textarea { resize: vertical; }
  .argRow { border: 1px solid var(--vscode-widget-border, #3c3c3c); border-radius: 4px; padding: 6px; margin-bottom: 6px; }
.argTop { display: flex; gap: 6px; align-items: center; }
.argTop input[type=text] { flex: 1; }
.argTop button { flex: 0 0 auto; min-width: 28px; }
.argNote { width: 100%; margin-top: 4px; font-size: 0.9em; opacity: 0.85; }
#commandPreview { font-family: var(--vscode-editor-font-family, monospace); opacity: 0.9; }
.hint { font-size: .85em; opacity: .7; margin: 3px 0 0; }
  .error { color: var(--vscode-errorForeground); margin: 10px 0; min-height: 1.2em; white-space: pre-wrap; }
  .buttons { display: flex; gap: 10px; margin-top: 8px; }
  button { padding: 6px 18px; border: none; border-radius: 3px; cursor: pointer;
           background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.secondary { background: var(--vscode-button-secondaryBackground);
                     color: var(--vscode-button-secondaryForeground); }
  .row { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; }
</style>
</head>
<body>
  <h2>${isEdit ? 'Edit entity' : 'New entity'}</h2>

  <fieldset>
    <legend>General</legend>
    <label for="name">Name *</label>
    <input id="name" type="text" value="${escapeHtml(d?.name ?? '')}">
    <label for="entityType">Type</label>
    <select id="entityType"${options.lockedKind !== undefined ? ' disabled' : ''}>${kindOptions}</select>
    ${
      options.lockedKind !== undefined
        ? `<p class="hint">Type is fixed by the folder's type.</p>`
        : ''
    }
  </fieldset>

  <fieldset id="connectionSection">
    <legend>Connection</legend>
    <div class="row">
      <div>
        <label for="host">Host *</label>
        <input id="host" type="text" value="${escapeHtml(d?.host ?? '')}">
      </div>
      <div>
        <label for="port">Port</label>
        <input id="port" type="number" min="1" max="65535" placeholder="22"
               value="${d?.port !== undefined ? String(d.port) : ''}">
      </div>
    </div>
    <label for="user">User</label>
    <input id="user" type="text" value="${escapeHtml(d?.user ?? '')}">
    <label for="sshKeyEntityId">SSH key source</label>
    <select id="sshKeyEntityId">${keyOptions}</select>
    <p class="hint">Pick another entity to use its key for this connection.</p>
  </fieldset>

  <fieldset id="keySection">
    <legend>SSH key</legend>
    <label for="privateKey">Private key (content)</label>
    <textarea id="privateKey" rows="5" spellcheck="false" autocomplete="off"></textarea>
    <p class="hint">${privateKeyHint}</p>
    ${
      options.hasStoredPrivateKey
        ? `<div class="check"><input id="clearPrivateKey" type="checkbox">
           <label for="clearPrivateKey">Clear the stored private key</label></div>`
        : ''
    }
    <label for="publicKey">Public key (content)</label>
    <textarea id="publicKey" rows="3" spellcheck="false">${escapeHtml(d?.publicKey ?? '')}</textarea>
    <label for="sshKeyPath">Key path (alternative to key content)</label>
    <input id="sshKeyPath" type="text" placeholder="~/.ssh/id_ed25519"
           value="${escapeHtml(d?.sshKeyPath ?? '')}">
  </fieldset>

  <fieldset id="vpnSection">
    <legend>VPN</legend>
    <label for="vpnType">VPN type</label>
    <select id="vpnType">${vpnTypeOptions}</select>
    <label for="vpnConfigFile">Config file (.ovpn / .conf / …)</label>
    <input id="vpnConfigFile" type="file">
    <p class="hint">${vpnConfigHint}</p>
    <input id="vpnConfigFileName" type="hidden" value="${escapeHtml(d?.vpnConfigFileName ?? '')}">
    ${
      options.hasStoredVpnConfig
        ? `<div class="check"><input id="clearVpnConfig" type="checkbox">
           <label for="clearVpnConfig">Clear the stored config</label></div>`
        : ''
    }
  </fieldset>

  <fieldset id="terminalSection">
    <legend>Terminal command</legend>

    <label for="command">Command</label>
    <input id="command" type="text" autocomplete="off" spellcheck="false"
           placeholder="aws sso login" value="${escapeHtml(d?.command ?? '')}">
    <p class="hint">The verb only. Arguments go in their own rows below, so each one can carry its own explanation.</p>

    <label for="commandNote">What this command is for</label>
    <textarea id="commandNote" rows="2" spellcheck="false"
              placeholder="Refresh the AWS session before running terraform.">${escapeHtml(d?.commandNote ?? '')}</textarea>

    <label>Arguments</label>
    <p class="hint">One per row. The note is what you will actually have forgotten in a week — which value belongs to which environment, and why. Untick a row to keep an argument without using it.</p>
    <div id="argRows"></div>
    <button type="button" id="addArg" class="secondary">+ Add argument</button>

    <label for="commandPreview">Full command</label>
    <input id="commandPreview" type="text" readonly tabindex="-1">
    <p class="hint">This is exactly what runs.</p>
  </fieldset>

  <fieldset id="dbSection">
    <legend>Database</legend>
    <label for="dbType">Database type</label>
    <select id="dbType">${dbTypeOptions}</select>
    <label for="dbConnection">Connection string</label>
    <input id="dbConnection" type="text" autocomplete="off" spellcheck="false"
           placeholder="postgresql://user:pass@host:5432/db"
           value="${escapeHtml(options.initialDbConnection ?? '')}">
    <p class="hint">${dbConnHint}</p>
    <div class="row">
      <div>
        <label for="dbHost">Host</label>
        <input id="dbHost" type="text">
      </div>
      <div>
        <label for="dbPort">Port</label>
        <input id="dbPort" type="number" min="1" max="65535">
      </div>
    </div>
    <label for="dbName">Database</label>
    <input id="dbName" type="text">
    <label for="dbUser">User</label>
    <input id="dbUser" type="text">
    <label for="dbPassword">Password</label>
    <input id="dbPassword" type="password" autocomplete="off">
    <p class="hint">The string and the fields are two-way linked — fill either.</p>
  </fieldset>

  <fieldset id="passwordSection">
    <legend>Secret</legend>
    <label for="password">Password / secret value</label>
    <input id="password" type="password" autocomplete="off">
    <p class="hint">${passwordHint}</p>
    ${
      options.hasStoredPassword
        ? `<div class="check"><input id="clearPassword" type="checkbox">
           <label for="clearPassword">Clear the stored password</label></div>`
        : ''
    }
  </fieldset>

  <fieldset>
    <legend>Notes</legend>
    <textarea id="notes" rows="3">${escapeHtml(options.initialNotes ?? '')}</textarea>
  </fieldset>

  <div class="error" id="error"></div>
  <div class="buttons">
    <button id="save">Save</button>
    <button id="cancel" class="secondary">Cancel</button>
  </div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const INITIAL_ARGS = ${JSON.stringify(d?.commandArgs ?? [])};
  const val = (id) => document.getElementById(id)?.value ?? '';
  const chk = (id) => document.getElementById(id)?.checked === true;
  const setError = (text) => { document.getElementById('error').textContent = text; };

  // Any script failure must be VISIBLE, never a silently dead form.
  window.addEventListener('error', (e) => setError('Form script error: ' + e.message));

  // ---- one type, one visible section ----
  const show = (id, visible) => {
    const el = document.getElementById(id);
    if (el) { el.style.display = visible ? '' : 'none'; }
  };
  function currentKind() { return val('entityType'); }
  function updateVisibility() {
    const kind = currentKind();
    show('connectionSection', kind === 'ssh');
    show('keySection', kind === 'sshkey' || (kind === 'ssh' && val('sshKeyEntityId') === ''));
    show('vpnSection', kind === 'vpn');
    show('dbSection', kind === 'db');
    show('terminalSection', kind === 'terminal');
    show('passwordSection', kind !== 'db' && kind !== 'terminal');
  }

  // ---- argument rows -------------------------------------------------------
  // Built from data rather than from markup: add, remove and reorder then have ONE
  // implementation, and the saved payload is read from the same array the UI edits
  // instead of from a DOM scrape that drifts the first time the markup changes.
  var argRows = INITIAL_ARGS.slice();

  function renderArgs() {
    var host = document.getElementById('argRows');
    host.textContent = '';
    argRows.forEach(function (row, index) {
      var wrap = document.createElement('div');
      wrap.className = 'argRow';

      var top = document.createElement('div');
      top.className = 'argTop';

      var on = document.createElement('input');
      on.type = 'checkbox';
      on.checked = row.disabled !== true;
      on.title = 'Include this argument in the command';
      on.addEventListener('change', function () {
        argRows[index].disabled = !on.checked;
        renderArgs();
      });

      var value = document.createElement('input');
      value.type = 'text';
      value.value = row.value;
      value.placeholder = '--sso-session OD-org';
      value.spellcheck = false;
      value.addEventListener('input', function () {
        argRows[index].value = value.value;
        updatePreview();
      });

      var up = document.createElement('button');
      up.type = 'button';
      up.className = 'secondary';
      up.textContent = '↑';
      up.title = 'Move up';
      up.disabled = index === 0;
      up.addEventListener('click', function () {
        var moved = argRows.splice(index, 1)[0];
        argRows.splice(index - 1, 0, moved);
        renderArgs();
      });

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = '✕';
      remove.title = 'Remove this argument';
      remove.addEventListener('click', function () {
        argRows.splice(index, 1);
        renderArgs();
      });

      top.appendChild(on);
      top.appendChild(value);
      top.appendChild(up);
      top.appendChild(remove);

      // The explanation sits UNDER its own argument, which is the whole point: the
      // thing worth writing down is what this value means, not what the command does.
      var note = document.createElement('input');
      note.type = 'text';
      note.className = 'argNote';
      note.value = row.note || '';
      note.placeholder = 'what it means — e.g. the SSO profile in ~/.aws/config';
      note.spellcheck = false;
      note.addEventListener('input', function () {
        argRows[index].note = note.value;
      });

      wrap.appendChild(top);
      wrap.appendChild(note);
      host.appendChild(wrap);
    });
    updatePreview();
  }

  function updatePreview() {
    var base = (val('command') || '').trim();
    var parts = argRows
      .filter(function (r) { return r.disabled !== true; })
      .map(function (r) { return (r.value || '').trim(); })
      .filter(function (r) { return r.length > 0; });
    var preview = document.getElementById('commandPreview');
    if (preview) {
      preview.value = base.length > 0 ? [base].concat(parts).join(' ') : '';
    }
  }

  (function wireArgs() {
    var add = document.getElementById('addArg');
    if (add) {
      add.addEventListener('click', function () {
        argRows.push({ value: '', note: '', disabled: false });
        renderArgs();
        var inputs = document.querySelectorAll('#argRows .argTop input[type=text]');
        if (inputs.length > 0) { inputs[inputs.length - 1].focus(); }
      });
    }
    var command = document.getElementById('command');
    if (command) { command.addEventListener('input', updatePreview); }
    renderArgs();
  })();

  document.getElementById('entityType').addEventListener('change', updateVisibility);
  document.getElementById('sshKeyEntityId').addEventListener('change', updateVisibility);
  updateVisibility();

  // ---- DB: connection string <-> parts, default port per type ----
  const DB_DEFAULT_PORTS = { postgres: '5432', mysql: '3306', mssql: '1433', mongodb: '27017' };
  const dbPartIds = { host: 'dbHost', port: 'dbPort', database: 'dbName', user: 'dbUser', password: 'dbPassword' };
  let dbSyncing = false;

  function updateDbPortPlaceholder() {
    document.getElementById('dbPort').placeholder = DB_DEFAULT_PORTS[val('dbType')] || '';
  }

  function cleanHostValue(h) {
    h = h.trim();
    const s = h.indexOf('://');
    if (s > 0) { h = h.slice(s + 3); }
    return h.split('/')[0];
  }
  function collapseDoubleScheme(str) {
    const first = str.indexOf('://');
    if (first < 0) { return str; }
    const second = str.indexOf('://', first + 3);
    if (second < 0) { return str; }
    const between = str.slice(first + 3, second);
    // only collapse when the middle chunk looks like a bare scheme (http, https, …)
    if (new RegExp('^[a-zA-Z][a-zA-Z0-9+.-]*$').test(between)) {
      return str.slice(0, first + 3) + str.slice(second + 3);
    }
    return str;
  }
  function parseConn(str) {
    str = collapseDoubleScheme(str.trim());
    const empty = { host: '', port: '', database: '', user: '', password: '' };
    if (!str) { return empty; }
    if (str.indexOf('://') > 0) {
      try {
        const u = new URL(str);
        const dec = (x) => { try { return decodeURIComponent(x); } catch { return x; } };
        let db = u.pathname;
        if (db.startsWith('/')) { db = db.slice(1); }
        return { host: u.hostname, port: u.port, database: db.split('?')[0],
                 user: dec(u.username), password: dec(u.password) };
      } catch { return null; }
    }
    const kv = {};
    for (const part of str.split(';')) {
      const i = part.indexOf('=');
      if (i > 0) { kv[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim(); }
    }
    const server = kv['server'] || kv['host'] || kv['data source'] || '';
    let host = server, port = kv['port'] || '';
    const m = server.match(new RegExp('^(.*?)[,:]([0-9]+)$'));
    if (m) { host = m[1]; port = port || m[2]; }
    return { host, port, database: kv['database'] || kv['initial catalog'] || '',
             user: kv['user id'] || kv['uid'] || kv['user'] || kv['username'] || '',
             password: kv['password'] || kv['pwd'] || '' };
  }

  function buildConn(type, p) {
    p = { ...p, host: cleanHostValue(p.host || '') };
    if (!p.host && !p.database && !p.user && !p.password) { return ''; }
    if (type === 'mssql') {
      const out = [];
      if (p.host) { out.push('Server=' + p.host + (p.port ? ',' + p.port : '')); }
      if (p.database) { out.push('Database=' + p.database); }
      if (p.user) { out.push('User Id=' + p.user); }
      if (p.password) { out.push('Password=' + p.password); }
      return out.join(';');
    }
    const scheme = type === 'postgres' ? 'postgresql' : type === 'mongodb' ? 'mongodb' : 'mysql';
    let s = scheme + '://';
    if (p.user) {
      s += encodeURIComponent(p.user);
      if (p.password) { s += ':' + encodeURIComponent(p.password); }
      s += '@';
    }
    s += p.host || '';
    if (p.port) { s += ':' + p.port; }
    if (p.database) { s += '/' + p.database; }
    return s;
  }

  function dbPartValues() {
    const out = {};
    for (const [part, id] of Object.entries(dbPartIds)) { out[part] = val(id).trim(); }
    return out;
  }
  function syncPartsFromString() {
    const parsed = parseConn(val('dbConnection'));
    if (!parsed) { return; }
    dbSyncing = true;
    for (const [part, id] of Object.entries(dbPartIds)) {
      const el = document.getElementById(id);
      if (el) { el.value = parsed[part] || ''; }
    }
    dbSyncing = false;
  }
  document.getElementById('dbConnection').addEventListener('input', () => {
    if (!dbSyncing) { syncPartsFromString(); }
  });
  document.getElementById('dbHost').addEventListener('change', () => {
    // Users paste RDS endpoints as URLs — strip scheme/path, keep the port.
    const raw = val('dbHost').trim();
    let cleaned = cleanHostValue(raw);
    const colon = cleaned.lastIndexOf(':');
    if (colon > 0 && new RegExp('^[0-9]+$').test(cleaned.slice(colon + 1))) {
      if (val('dbPort').trim() === '') {
        document.getElementById('dbPort').value = cleaned.slice(colon + 1);
      }
      cleaned = cleaned.slice(0, colon);
    }
    if (cleaned !== raw) {
      document.getElementById('dbHost').value = cleaned;
      dbSyncing = true;
      document.getElementById('dbConnection').value = buildConn(val('dbType'), dbPartValues());
      dbSyncing = false;
    }
  });
  for (const id of Object.values(dbPartIds)) {
    document.getElementById(id).addEventListener('input', () => {
      if (dbSyncing) { return; }
      dbSyncing = true;
      document.getElementById('dbConnection').value = buildConn(val('dbType'), dbPartValues());
      dbSyncing = false;
    });
  }
  document.getElementById('dbType').addEventListener('change', () => {
    updateDbPortPlaceholder();
    const parts = dbPartValues();
    if (Object.values(parts).some((v) => v !== '')) {
      document.getElementById('dbConnection').value = buildConn(val('dbType'), parts);
    }
  });
  updateDbPortPlaceholder();
  if (val('dbConnection').trim() !== '') { syncPartsFromString(); }

  // ---- VPN config file: read locally, carried with the form ----
  let vpnConfigContent = '';
  document.getElementById('vpnConfigFile').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) { return; }
    const reader = new FileReader();
    reader.onload = () => {
      vpnConfigContent = String(reader.result || '');
      document.getElementById('vpnConfigFileName').value = file.name;
    };
    reader.readAsText(file);
  });

  // ---- save / cancel ----
  document.getElementById('save').addEventListener('click', () => {
    setError('');
    const kind = currentKind();
    if (val('name').trim() === '') {
      setError('Name is required.');
      return;
    }
    if (kind === 'ssh' && val('host').trim() === '') {
      setError('Host is required for an SSH connection.');
      return;
    }
    const port = val('port').trim();
    if (kind === 'ssh' && port !== '' && (!new RegExp('^[0-9]+$').test(port) || Number(port) < 1 || Number(port) > 65535)) {
      setError('Port must be an integer between 1 and 65535.');
      return;
    }
    vscode.postMessage({ type: 'save', data: {
      entityType: kind,
      name: val('name'), host: val('host'), user: val('user'), port: val('port'),
      sshKeyPath: val('sshKeyPath'), publicKey: val('publicKey'),
      sshKeyEntityId: val('sshKeyEntityId'), notes: val('notes'),
      password: val('password'), privateKey: val('privateKey'),
      vpnType: val('vpnType'), vpnConfigContent, vpnConfigFileName: val('vpnConfigFileName'),
      clearVpnConfig: chk('clearVpnConfig'),
      dbType: val('dbType'), dbConnection: val('dbConnection'),
      command: val('command'), commandNote: val('commandNote'), commandArgs: argRows,
      clearPassword: chk('clearPassword'), clearPrivateKey: chk('clearPrivateKey'),
    }});
  });
  document.getElementById('cancel').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });
</script>
</body>
</html>`;
}
