import * as crypto from 'node:crypto';
import { escapeHtml } from './webviewHtml';
import { formPageScript } from './entityFormScript';
import { resolveKind } from './entityKind';
import {
  FOREVER_LIFETIME,
  KEEP_LIFETIME,
  LIFETIME_CHOICES,
  describeRemaining,
  hasLifetime,
  lifetimeId,
} from './entityExpiry';
import { SCRIPT_LANGUAGES } from './scriptRender';
import { BindableField } from './envBinding';
import { fileAccept, imageAccept } from './attachment';
import {
  DB_TYPES,
  ENTITY_KINDS,
  ENTITY_KIND_LABELS,
  EntityKind,
  EntityMetadata,
  VPN_TYPES,
} from './types';
import type { EntityFormOptions } from './entityFormPanel';

/**
 * The entity form's PAGE: its markup, its CSS and its inline script, as template strings.
 *
 * <p>Split out of `entityFormPanel.ts` (audit A1's tail). That file sat over the 800-line
 * limit for exactly one reason — the page lived beside the message plumbing that serves it —
 * and the two have genuinely different jobs: this module turns options into HTML and never
 * learns what a message MEANS, while the panel owns the webview lifecycle and never builds
 * markup. Apart, the panel's `eslint-disable max-lines` header could go, which is the marker
 * lifecycle the lint setup promised rather than a disable that outlives its reason.</p>
 *
 * <p>The secrets discipline is unchanged and belongs here, because here is where a value
 * would have to be interpolated to leak: the stored password, private key and VPN config are
 * NEVER sent into the page (an empty field means "keep", a "clear" checkbox removes). The DB
 * connection string is the one deliberate exception, so that it stays genuinely editable.</p>
 */

/**
 * The export-to-terminal row under a secret input: a toggle (off by default), and the
 * variable name, pre-filled from the entity name the way the operator asked for it —
 * `git key` -> `ENV_GITKEY_PRIVATEKEY` — and editable after.
 */
function scriptLanguageOptions(current: string | undefined): string {
  return SCRIPT_LANGUAGES.map(
    (l) => `<option value="${l.id}" ${l.id === (current ?? 'bash') ? 'selected' : ''}>${l.label}</option>`,
  ).join('');
}

/**
 * The extra words the Type selector adds to a kind's own label.
 *
 * <p>"Credential" alone does not say what a credential is here, and the selector is where
 * that has to be answered. Everything else is self-describing.</p>
 */
const KIND_HINT: Record<EntityKind, string> = {
  credential: ' — name + secret value',
  ssh: '',
  sshkey: '',
  vpn: '',
  db: '',
  terminal: '',
  script: '',
};

/**
 * What each binding row calls the thing it exports.
 *
 * <p>Named per field rather than once, because a database entity offers two of these rows
 * and the generic wording made them read as the same control printed twice — the row for
 * the connection string and the row for the password were indistinguishable.</p>
 */
const ENV_ROW_LABEL: Record<BindableField, string> = {
  password: 'Expose this secret in terminals as env variable',
  privateKey: 'Expose the private key in terminals as env variable',
  publicKey: 'Expose the public key in terminals as env variable',
  dbConnection: 'Expose the connection string in terminals as env variable',
  dbPassword: 'Expose the database password in terminals as env variable',
};

// eslint-disable-next-line complexity
function envRow(field: BindableField, d: EntityMetadata | undefined): string {
  const bound = d?.envBindings?.[field];
  const checked = bound !== undefined ? 'checked' : '';
  const value = bound ?? '';
  return `<div class="check envRow" data-env-field="${field}">
    <input id="envOn_${field}" type="checkbox" ${checked}>
    <label for="envOn_${field}">${ENV_ROW_LABEL[field]}</label>
    <input id="envName_${field}" type="text" spellcheck="false" autocomplete="off"
           style="margin-left:8px; ${bound === undefined ? 'display:none;' : ''}"
           value="${escapeHtml(value)}" placeholder="ENV_NAME">
  </div>
  <hr class="fieldDivider">`;
}

// eslint-disable-next-line complexity, max-lines-per-function
export function renderHtml(options: EntityFormOptions): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const d = options.initial;
  const isEdit = options.mode === 'edit';
  const kind = options.lockedKind ?? resolveKind(d);

  // Built from the kind table, never a copy of it. The copy is exactly how `script` came
  // to be missing from this selector: the seventh kind was added to ENTITY_KINDS and the
  // hand-written list here kept offering six. With no option matching, a browser shows the
  // FIRST one — so creating an entity inside a script folder announced itself as a
  // Credential, and no `satisfies` on the neighbouring line noticed. Driving the loop from
  // ENTITY_KINDS makes an absent kind impossible; the Record makes an absent hint a
  // compile error.
  const lifetimeOptions = (current: EntityMetadata | undefined): string => {
    const keep = hasLifetime(current ?? {})
      ? `<option value="${KEEP_LIFETIME}" selected>Keep as is (${escapeHtml(
          describeRemaining({ details: current } as never, Date.now()) || 'unchanged',
        )})</option>`
      : '';
    // `oneUse` is offered for every kind here and hidden for sshkey by the page script, so
    // that switching Type re-evaluates it without a round trip. The write path refuses the
    // combination regardless — this only keeps the person from being shown a choice that
    // would be silently dropped.
    const presets = LIFETIME_CHOICES.map((choice) => {
      const id = lifetimeId(choice);
      const selected = keep === '' && id === FOREVER_LIFETIME ? ' selected' : '';
      return `<option value="${id}"${selected} data-policy="${choice.policy ?? ''}">${escapeHtml(
        choice.label,
      )}</option>`;
    }).join('');
    return keep + presets;
  };

  const kindOptions = ENTITY_KINDS.map(
    (value) =>
      `<option value="${value}"${kind === value ? ' selected' : ''}>${
        ENTITY_KIND_LABELS[value].label
      }${KIND_HINT[value]}</option>`,
  ).join('');

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
  .envRow { margin: 4px 0 0 2px; padding: 4px 8px;
            border-left: 2px solid var(--vscode-focusBorder, #007fd4); opacity: .95; }
  .envRow label { opacity: .85; }
  .codeWrap { position: relative; }
  .codeWrap pre { position: absolute; inset: 0; margin: 0; padding: 5px 7px; overflow: auto;
    font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; line-height: 1.45;
    white-space: pre-wrap; word-break: break-all; pointer-events: none;
    color: var(--vscode-editor-foreground); }
  .codeWrap textarea { position: relative; background: transparent;
    color: var(--vscode-editor-foreground);
    caret-color: var(--vscode-editor-foreground);
    font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; line-height: 1.45;
    white-space: pre-wrap; word-break: break-all; }
  /* The textarea's own glyphs disappear ONLY once the overlay has actually painted the
     same text underneath — the class is added by the page script when a highlight
     response arrives. Unconditional transparency is how a dead or slow highlighter turns
     into an editor whose contents are invisible except where they are selected. */
  .codeWrap.lit textarea { color: transparent; }
  .tok-comment { color: var(--vscode-descriptionForeground); font-style: italic; }
  .tok-string { color: var(--vscode-charts-orange, #ce9178); }
  .tok-kw { color: var(--vscode-charts-blue, #569cd6); font-weight: 600; }
  .tok-num { color: var(--vscode-charts-green, #b5cea8); }
  .tok-var { color: var(--vscode-charts-purple, #c586c0); font-weight: 600; }
  .fieldDivider { border: 0; border-top: 1px solid var(--vscode-widget-border, #4444);
                  margin: 12px 0; }
  /* input:not(...) rather than a list of input[type=…]: an attribute selector does not
     match an input with no type attribute at all, and the browser default for one of those is a
     WHITE box in a dark theme. That is how the read-only Dates fields shipped looking like
     they belonged to a different application. Named exclusions instead, so the next input
     someone adds is themed whether or not they remember the attribute. */
  input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select {
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
  /* Inside the sticky bar the message must not reserve an empty line forever. */
  .topBar .error { margin: 6px 0 0; min-height: 0; }
  /* A field you cannot type in should look like it: same box, dimmer text, no caret. */
  .readonly { opacity: .75; cursor: default; }
  /* Save and Cancel sit ABOVE the heading, and stay there: a long form (a terminal command
     with a dozen argument rows, a script with its variables) put them below the fold, so
     saving meant scrolling to the bottom to find out where they had gone. Sticky, because
     moving them to the top of the document alone would only relocate the same problem. */
  .topBar { position: sticky; top: 0; z-index: 2; padding: 4px 0 8px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-widget-border, #4444); margin-bottom: 14px; }
  .buttons { display: flex; gap: 10px; }
  button { padding: 6px 18px; border: none; border-radius: 3px; cursor: pointer;
           background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.secondary { background: var(--vscode-button-secondaryBackground);
                     color: var(--vscode-button-secondaryForeground); }
  .row { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; }
</style>
</head>
<body>
  <div class="topBar">
    <div class="buttons">
      <button id="save">Save</button>
      <button id="cancel" class="secondary">Cancel</button>
    </div>
    <!-- The validation message rides with the buttons. Below them it would scroll out of
         sight, and "I pressed Save and nothing happened" is exactly what it exists to
         answer. role=alert: a screen reader is told the save was refused, not left to
         find a red line. -->
    <div class="error" id="error" role="alert" aria-live="assertive"></div>
  </div>
  <h2>${isEdit ? 'Edit entity' : 'New entity'}</h2>

  <fieldset>
    <legend>General</legend>
    <label for="name">Name *</label>
    <input id="name" type="text" autofocus value="${escapeHtml(d?.name ?? '')}">
    <label for="entityType">Type</label>
    <select id="entityType"${options.lockedKind !== undefined ? ' disabled' : ''}>${kindOptions}</select>
    ${
      options.lockedKind !== undefined
        ? `<p class="hint">Type is fixed by the folder's type.</p>`
        : ''
    }
    <label for="lifetime">Lifetime</label>
    <select id="lifetime">${lifetimeOptions(d)}</select>
    <p class="hint" id="lifetimeHint">A short-lived entry is really deleted when its time comes — secret, history and all, on every machine that syncs. Only an agent using it through the broker counts as a use; copying it yourself does not.</p>
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
    ${envRow('privateKey', d)}
    <label for="publicKey">Public key (content)</label>
    <textarea id="publicKey" rows="3" spellcheck="false">${escapeHtml(d?.publicKey ?? '')}</textarea>
    ${envRow('publicKey', d)}
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
    <div class="row">
      <div>
        <label for="vpnHost">Host / gateway</label>
        <input id="vpnHost" type="text" placeholder="vpn.company.com"
               value="${escapeHtml(d?.host ?? '')}">
      </div>
      <div>
        <label for="vpnPort">Port</label>
        <input id="vpnPort" type="number" min="1" max="65535" placeholder="1194"
               value="${d?.port !== undefined ? String(d.port) : ''}">
      </div>
    </div>
    <label for="vpnUser">Login</label>
    <input id="vpnUser" type="text" autocomplete="off" value="${escapeHtml(d?.user ?? '')}">
    <label for="vpnKey">Key / certificate (content)</label>
    <textarea id="vpnKey" rows="4" spellcheck="false" autocomplete="off"></textarea>
    <p class="hint">${
      options.hasStoredPrivateKey
        ? 'A key is stored. Leave empty to keep it.'
        : 'Private key or certificate for this VPN. Stored in the OS keychain, synced only inside the encrypted vault.'
    }</p>
    ${
      options.hasStoredPrivateKey
        ? `<div class="check"><input id="clearVpnKey" type="checkbox">
           <label for="clearVpnKey">Clear the stored key</label></div>`
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
    <button type="button" id="splitCmd" class="secondary">Split pasted command into rows</button>
    <p class="hint" id="splitHint">Paste a whole command into <b>Command</b> and it is split here automatically. Descriptions are read by running <code>--help</code> on the tool itself, so they are right for your version — and for a private tool that has no help, the rows are still split and the notes are yours to write. Turn the help lookup off with <code>credSshManager.readCliHelp</code>.</p>

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
    ${envRow('dbConnection', d)}
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
    ${envRow('dbPassword', d)}
  </fieldset>

  <fieldset id="passwordSection">
    <legend>Secret</legend>
    <label for="password">Password / secret value</label>
    <input id="password" type="password" autocomplete="off">
    <p class="hint">${passwordHint}</p>
    ${envRow('password', d)}
    ${
      options.hasStoredPassword
        ? `<div class="check"><input id="clearPassword" type="checkbox">
           <label for="clearPassword">Clear the stored password</label></div>`
        : ''
    }
  </fieldset>

  <fieldset id="scriptSection">
    <legend>Script</legend>
    <label for="scriptLanguage">Language</label>
    <select id="scriptLanguage">${scriptLanguageOptions(d?.scriptLanguage)}</select>
    <label for="scriptBody">Script</label>
    <div class="codeWrap">
      <pre id="scriptHl" aria-hidden="true"></pre>
      <textarea id="scriptBody" rows="16" spellcheck="false" autocomplete="off"
                placeholder="aws s3 sync ${'${SRC}'} s3://${'${BUCKET}'}/">${escapeHtml(d?.script ?? '')}</textarea>
    </div>
    <p class="hint">Pull the changeable parts out as <code>${'${NAME}'}</code> and define them below — the body stays generic, the values live in rows you can edit one by one.</p>
    <label>Variables</label>
    <div id="scriptVarRows"></div>
    <button type="button" id="addScriptVar" class="secondary">+ Add variable</button>
  </fieldset>

  <fieldset>
    <legend>Attachments</legend>
    <label for="attachFile">Additional file (pdf, office, text, archives — never executables)</label>
    <input id="attachFile" type="file" accept="${fileAccept}">
    <p class="hint">${
      options.hasStoredAttachment
        ? `A file is stored${d?.attachmentFileName ? ` (${escapeHtml(d.attachmentFileName)})` : ''}. Pick a new one to replace it.`
        : 'Stored encrypted, synced only inside the vault. Up to 4 MB.'
    }</p>
    ${
      options.hasStoredAttachment
        ? `<div class="check"><input id="clearAttachment" type="checkbox">
           <label for="clearAttachment">Remove the stored file</label></div>`
        : ''
    }
    <label for="attachImage">Additional image</label>
    <input id="attachImage" type="file" accept="${imageAccept}">
    <p class="hint">${
      options.hasStoredImage
        ? `An image is stored${d?.imageFileName ? ` (${escapeHtml(d.imageFileName)})` : ''}. Pick a new one to replace it.`
        : 'Shown as a preview in the viewer. Stored encrypted, up to 4 MB.'
    }</p>
    ${
      options.hasStoredImage
        ? `<div class="check"><input id="clearImage" type="checkbox">
           <label for="clearImage">Remove the stored image</label></div>`
        : ''
    }
  </fieldset>

  ${
    options.createdAt === undefined && options.updatedAt === undefined
      ? ''
      : `<fieldset>
    <legend>Dates</legend>
    <div class="row">
      <div>
        <label>Created</label>
        <input type="text" class="readonly" readonly tabindex="-1" value="${options.createdAt === undefined ? 'unknown (created before this was recorded)' : new Date(options.createdAt).toLocaleString()}">
      </div>
      <div>
        <label>Last changed</label>
        <input type="text" class="readonly" readonly tabindex="-1" value="${options.updatedAt === undefined ? '—' : new Date(options.updatedAt).toLocaleString()}">
      </div>
    </div>
  </fieldset>`
  }

  <fieldset>
    <legend>Notes</legend>
    <textarea id="notes" rows="3">${escapeHtml(options.initialNotes ?? '')}</textarea>
  </fieldset>


${formPageScript(nonce, d)}
</body>
</html>`;
}
