import * as crypto from 'node:crypto';
import { normalizeTags } from './sshOptions';
import { CONFIG_FORMATS, CONFIG_FORMAT_LABELS } from './configFormat';
import { PASSPHRASE_WORD_CHOICES, PASSWORD_LENGTH_CHOICES, SSH_KEY_TYPES } from './secretGenerator';
import { zoomControlHtml } from './zoomControl';
import { formStyleSheet } from './entityFormStyles';
import { AgentDoors, agentDoorRows } from './agentDoors';
import { describeAttachment } from './attachmentMeta';
import { escapeHtml } from './webviewHtml';
import { formPageScript } from './entityFormScript';
import { initialDependencyRows } from './depGraph';
import { accessMask, normalizeMcpAccess } from './mcpAccess';
import { MCP_SWITCHES, mcpBarHtml } from './mcpSwitches';
import { FORM_SECTIONS } from './formSections';

/**
 * The read-only footer under the MCP switches (T24b): every OTHER way an agent can reach this
 * entry that is live right now, each with the command that manages it. Nothing when nothing
 * is live — a footer saying "no other doors" on every entry would be the noise that hides the
 * one that matters.
 */
function agentDoorsHtml(doors: AgentDoors | undefined): string {
  const rows = doors === undefined ? [] : agentDoorRows(doors);
  if (rows.length === 0) {
    return '';
  }
  return `<div class="agentDoors">
      <p class="hint agentDoorsHead">Other ways agents can reach this entry</p>
      ${rows
        .map(
          (row) => `<div class="agentDoor"><b>${escapeHtml(row.label)}</b> — ${escapeHtml(row.detail)}
        <a class="doorLink" data-command="${escapeHtml(row.command)}">manage…</a></div>`,
        )
        .join('')}
    </div>`;
}

/**
 * A fieldset's opening tag, from the catalog.
 *
 * <p>The id, the legend and the border colour all come from one place, so a section cannot be
 * rendered with an id the visibility switch does not know or a colour nobody contributed. An
 * unknown name throws at render time rather than producing a fieldset that silently never
 * shows — the tests render every kind, so it cannot reach a user.</p>
 */
function openSection(id: string): string {
  const section = FORM_SECTIONS.find((candidate) => candidate.id === id);
  if (section === undefined) {
    throw new Error(`No form section named ${id}`);
  }
  return `<fieldset id="${section.id}" class="sec ${section.color}">
    <legend>${escapeHtml(section.legend)}</legend>`;
}

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
function configFormatOptions(current: string | undefined): string {
  return CONFIG_FORMATS.map(
    (format) =>
      `<option value="${format}" ${format === (current ?? 'json') ? 'selected' : ''}>${
        CONFIG_FORMAT_LABELS[format].label
      }</option>`,
  ).join('');
}

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
  config: ' — a file your app reads, kept out of git',
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

  // The same shape as the key source, and deliberately so: both are "point at another entity",
  // and a jump host that could be typed as text would be a place to type a command.
  const jumpOptions = [
    `<option value="">— none —</option>`,
    ...options.jumpCandidates.map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${d?.jumpHostEntityId === c.id ? ' selected' : ''}>${escapeHtml(c.name)}</option>`,
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

  // A stored id whose target is gone comes back as a `missing` row rather than vanishing —
  // dropping it here would delete the relationship the next time Save was pressed on an
  // unrelated field, and the target may be one sync away from returning.
  const dependsOnRows = initialDependencyRows(
    d?.dependsOn ?? [],
    options.dependencyFolders,
    options.dependencyColors,
  );

  const passwordHint = options.hasStoredPassword
    ? 'A value is stored. Leave empty to keep it.'
    : 'No value stored yet.';
  const privateKeyHint = options.hasStoredPrivateKey
    ? 'A private key is stored. Leave empty to keep it.'
    : 'No private key stored yet. Paste the full key (with line breaks).';

  // The Additional group's sections, built here rather than inline below because they no longer
  // sit where their neighbours do: Lifetime was cut out of General and Advanced connection out of
  // Connection, and the rest are moved out of the main flow entirely. Naming them makes the
  // composition at the bottom of the page readable as a list of what is in which group.
  const lifetimeHtml = `${openSection('lifetimeSection')}
    <label for="lifetime">Lifetime</label>
    <select id="lifetime">${lifetimeOptions(d)}</select>
    <p class="hint" id="lifetimeHint">A short-lived entry is really deleted when its time comes — secret, history and all, on every machine that syncs. Only an agent using it through the broker counts as a use; copying it yourself does not.</p>
  </fieldset>`;

  const advancedConnectionHtml = `${openSection('advancedConnectionSection')}
    <label for="jumpHostEntityId">Jump host (bastion)</label>
    <select id="jumpHostEntityId">${jumpOptions}</select>
    <p class="hint">Reached first, as <code>ssh -J</code>. Another entity, never a typed command — a jump host that could be typed could be a command.</p>
    <label for="tags">Tags</label>
    <input id="tags" type="text" placeholder="production eu-west" value="${escapeHtml(normalizeTags(d?.tags).join(' '))}">
    <p class="hint">Space-separated labels, shown on the row and matched by the filter.</p>
    <div class="check"><input id="agentForward" type="checkbox" ${d?.agentForward === true ? 'checked' : ''}>
      <label for="agentForward">Forward the SSH agent (<code>-A</code>)</label></div>
    <p class="hint">Lets the remote host use your keys through the agent — needed to <code>git clone</code> from there. It also means anyone with root on that host can ask your agent to sign while you are connected; with this extension's agent, each such request still asks you.</p>
    ${
      options.hasStoredHostKey
        ? `<label>Pinned host key</label>
           <div class="line"><input readonly value="${escapeHtml(options.hostKeyFingerprint ?? '')}"></div>
           <p class="hint">Checked on every connection. If the host is rebuilt, clear this and the next connection will show you the new fingerprint.</p>
           <div class="check"><input id="clearHostKey" type="checkbox">
             <label for="clearHostKey">Forget the pinned host key</label></div>`
        : '<p class="hint">No host key pinned yet — the first connection shows you its fingerprint and offers to pin it.</p>'
    }
    <label>Port forwarding</label>
    <div id="forwardRows"></div>
    <button type="button" id="addForward">+ Add forward</button>
    <p class="hint">Local (<code>-L</code>) makes a port here reach a service there; remote (<code>-R</code>) is the reverse. Written as <code>port:host:hostport</code>.</p>
  </fieldset>`;

  const totpHtml = `${openSection('totpSection')}
    <label for="totp">Authenticator seed — an <code>otpauth://</code> URI or the base32 secret</label>
    <input id="totp" type="password" autocomplete="off" spellcheck="false"
           placeholder="otpauth://totp/GitHub:me?secret=JBSW…   or   JBSW Y3DP EHPK 3PXP">
    <p class="hint">${
      options.hasStoredTotp
        ? `A seed is stored (${escapeHtml(options.storedTotpDescription ?? 'unreadable')}). Paste a new one to replace it.`
        : 'Most services offer this under "can&#39;t scan the QR code?". Kept in the OS keychain; the codes are computed here, so the second app can close.'
    }</p>
    <button type="button" id="totpPasteQr">Paste a QR image (Ctrl+V)</button>
    <p class="hint" id="totpQrHint" aria-live="polite">Snip the QR with <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> and press <kbd>Ctrl</kbd>+<kbd>V</kbd> here — an enrolment code, or a whole Google Authenticator export (<em>Transfer accounts → Export accounts</em>).</p>
    <div id="totpQrChoices" class="qrChoices"></div>
    <div class="check"><input id="totpSteam" type="checkbox">
      <label for="totpSteam">Steam Guard (5-character code)</label></div>
    ${
      options.hasStoredTotp
        ? `<div class="check"><input id="clearTotp" type="checkbox">
           <label for="clearTotp">Remove the stored seed</label></div>`
        : ''
    }
  </fieldset>`;

  const attachmentsHtml = `${openSection('attachmentsSection')}
    <label for="attachFile">Additional file (pdf, office, text, archives — never executables)</label>
    <input id="attachFile" type="file" accept="${fileAccept}">
    ${
      options.hasStoredAttachment && d !== undefined
        ? `<div class="fileName">${escapeHtml(d.attachmentFileName ?? 'file')}</div>
           <p class="hint">${escapeHtml(describeAttachment(d, 'attachment'))} — pick a new file to replace it.</p>`
        : `<p class="hint">Stored encrypted, synced only inside the vault. Up to 4 MB.</p>`
    }
    ${
      options.hasStoredAttachment
        ? `<div class="check"><input id="clearAttachment" type="checkbox">
           <label for="clearAttachment">Remove the stored file</label></div>`
        : ''
    }
    <label for="attachImage">Additional image</label>
    <input id="attachImage" type="file" accept="${imageAccept}">
    ${
      options.hasStoredImage && d !== undefined
        ? `${
            options.imageDataUri !== undefined
              ? `<img class="formPreview" src="${options.imageDataUri}" alt="Stored image">`
              : ''
          }<div class="fileName">${escapeHtml(d.imageFileName ?? 'image')}</div>
           <p class="hint">${escapeHtml(describeAttachment(d, 'image'))} — pick a new image to replace it.</p>`
        : `<p class="hint">Shown as a preview in the viewer. Stored encrypted, up to 4 MB.</p>`
    }
    ${
      options.hasStoredImage
        ? `<div class="check"><input id="clearImage" type="checkbox">
           <label for="clearImage">Remove the stored image</label></div>`
        : ''
    }
  </fieldset>`;

  // The six switches, in ladder order. Each one paints only its own control — `accent-color`
  // leaves the label and the description at the theme's own foreground, which is what keeps the
  // section from becoming six coloured captions.
  const mcp = normalizeMcpAccess(d?.mcp);
  const mcpSet = d?.mcp !== undefined;
  const mcpHtml = `${openSection('mcpSection')}
    ${mcpBarHtml(accessMask(mcp))}
    <p class="hint">${
      mcpSet
        ? 'Set on this entry.'
        : 'Not set here — this entry follows its folder. Touching any switch decides it here instead.'
    }</p>
    ${MCP_SWITCHES.map(
      (s) => `<div class="check">
      <input id="${s.id}" type="checkbox" class="mcpSwitch ${s.color}" ${s.on(mcp) ? 'checked' : ''}>
      <label for="${s.id}">${escapeHtml(s.label)}</label>
    </div>
    <p class="hint mcpWhy">${escapeHtml(s.why)}</p>`,
    ).join('')}
    ${agentDoorsHtml(options.agentDoors)}
  </fieldset>`;

  const dependsOnHtml = `${openSection('dependsOnSection')}
    <div class="check">
      <input id="dependsOnOn" type="checkbox" ${dependsOnRows.length > 0 ? 'checked' : ''}>
      <label for="dependsOnOn">This entry needs other entries to be usable</label>
    </div>
    <div id="dependsOnBody">
      <div id="dependsOnRows"></div>
      <div class="genRow">
        <button type="button" id="addDependency">+ Add dependency</button>
      </div>
      <p class="hint">Both ends are marked with the same colour in the tree, and the entry you depend on grows a list of everything that needs it. The colour belongs to that entry — change it here and every entry depending on the same thing follows.</p>
    </div>
  </fieldset>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
${formStyleSheet(options.uiScale ?? 0)}
</style>
</head>
<body>
  <div class="topBar">
    <div class="buttons">
      <button id="save">Save</button>
      <button id="cancel" class="secondary">Cancel</button>
      ${zoomControlHtml(options.uiScale ?? 0)}
    </div>
    <!-- The validation message rides with the buttons. Below them it would scroll out of
         sight, and "I pressed Save and nothing happened" is exactly what it exists to
         answer. role=alert: a screen reader is told the save was refused, not left to
         find a red line. -->
    <div class="error" id="error" role="alert" aria-live="assertive"></div>
  </div>
  <!-- Which entity, not merely that it is one: two windows on two entries of the same kind
       were told apart only by the tab title, and the tab title is the first thing a wide
       editor group truncates. The name is escaped like every other value on this page. -->
  <h2>${
    isEdit
      ? `Edit: ${escapeHtml(d?.name?.trim() || 'entity')}<span class="kindChip">${escapeHtml(kind)}</span>`
      : 'New entity'
  }</h2>

  <div class="formGroups">

  <div id="mainGroup" class="fsGroup">
  <h3 class="groupTitle">Main</h3>

  ${openSection('generalSection')}
    <label for="name">Name *</label>
    <input id="name" type="text" autofocus value="${escapeHtml(d?.name ?? '')}">
    <label for="entityType">Type</label>
    <select id="entityType"${options.lockedKind !== undefined ? ' disabled' : ''}>${kindOptions}</select>
    ${
      options.lockedKind !== undefined
        ? `<p class="hint">Type is fixed by the folder's type.</p>`
        : ''
    }
  </fieldset>

  ${openSection('connectionSection')}
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

  ${openSection('keySection')}
    <label for="privateKey">Private key (content)</label>
    <textarea id="privateKey" rows="5" spellcheck="false" autocomplete="off"></textarea>
    <!-- Ed25519 first and default; the weaker options carry their own labels (T14b — the
         recorded no-choice decision was overruled by the owner, its point kept). -->
    <div class="genRow genOptions">
      <label for="genKeyType" class="inline">Type</label>
      <select id="genKeyType">${SSH_KEY_TYPES.map(
        (t) => `<option value="${t.id}" title="${escapeHtml(t.note)}">${escapeHtml(t.label)}</option>`,
      ).join('')}</select>
    </div>
    <button type="button" id="genKey">Generate key pair</button>
    <p class="hint" id="genKeyHint">A key made here is drawn in the editor and saved straight to the keychain — unlike <code>ssh-keygen</code>, which writes it to disk by definition. With <i>Add to SSH Agent</i> it can then be used without ever becoming a file.</p>
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

  ${openSection('vpnSection')}
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

  ${openSection('terminalSection')}

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
    <button type="button" id="addArg">+ Add argument</button>
    <button type="button" id="splitCmd">Split pasted command into rows</button>
    <p class="hint" id="splitHint">Paste a whole command into <b>Command</b> and it is split here automatically. Descriptions are read by running <code>--help</code> on the tool itself, so they are right for your version — and for a private tool that has no help, the rows are still split and the notes are yours to write. Turn the help lookup off with <code>credSshManager.readCliHelp</code>.</p>

    <label for="commandPreview">Full command</label>
    <input id="commandPreview" type="text" readonly tabindex="-1">
    <p class="hint">This is exactly what runs.</p>
  </fieldset>

  ${openSection('dbSection')}
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

  ${openSection('accountSection')}
    <label for="login">Login</label>
    <input id="login" type="text" autocomplete="off" spellcheck="false" value="${escapeHtml(options.initialFields?.login ?? '')}">
    <label for="url">URL</label>
    <input id="url" type="text" autocomplete="off" spellcheck="false" placeholder="https://" value="${escapeHtml(options.initialFields?.url ?? '')}">
    <p class="hint">Stored encrypted, like the password — never in plain metadata, never listed to an agent — and shown in clear on the card.</p>
  </fieldset>

  ${openSection('passwordSection')}
    <label for="password">Password / secret value</label>
    <input id="password" type="password" autocomplete="off">
    <!-- The generator takes orders now (T14a): length and classes used to be baked into a
         default nothing could reach. All four classes on and 32 long by default — the
         owner's numbers. -->
    <div class="genRow genOptions">
      <label for="genLength" class="inline">Length</label>
      <select id="genLength">${PASSWORD_LENGTH_CHOICES.map(
        (len) => `<option value="${len}"${len === 32 ? ' selected' : ''}>${len}</option>`,
      ).join('')}</select>
      <span class="check inline"><input id="genLower" type="checkbox" checked><label for="genLower">a-z</label></span>
      <span class="check inline"><input id="genUpper" type="checkbox" checked><label for="genUpper">A-Z</label></span>
      <span class="check inline"><input id="genDigits" type="checkbox" checked><label for="genDigits">0-9</label></span>
      <span class="check inline"><input id="genSymbols" type="checkbox" checked><label for="genSymbols">!#%</label></span>
      <label for="genWords" class="inline">Words</label>
      <select id="genWords">${PASSPHRASE_WORD_CHOICES.map(
        (words) => `<option value="${words}"${words === 6 ? ' selected' : ''}>${words}</option>`,
      ).join('')}</select>
    </div>
    <div class="genRow">
      <button type="button" id="genPassword">Generate password</button>
      <button type="button" id="genPassphrase">Generate passphrase</button>
      <button type="button" id="revealPassword">Show</button>
    </div>
    <p class="hint" id="genHint">${passwordHint}</p>
    ${envRow('password', d)}
    ${
      options.hasStoredPassword
        ? `<div class="check"><input id="clearPassword" type="checkbox">
           <label for="clearPassword">Clear the stored password</label></div>`
        : ''
    }
  </fieldset>

  ${openSection('scriptSection')}
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
    <button type="button" id="addScriptVar">+ Add variable</button>
  </fieldset>

  ${openSection('configSection')}
    <label for="configFormat">Format</label>
    <select id="configFormat">${configFormatOptions(d?.configFormat)}</select>
    <label for="configFileName">File name</label>
    <input id="configFileName" type="text" spellcheck="false" autocomplete="off"
           placeholder="appsettings.Development.json"
           value="${escapeHtml(d?.configFileName ?? '')}">
    <p class="hint">What "Write config file here…" saves it as. It is not a path — you choose the folder when you write it.</p>
    <p class="hint" id="configStatus" role="status" aria-live="polite"></p>
    <div class="tabs" role="tablist">
      <button type="button" id="configTabRaw" class="tab on" role="tab">Raw</button>
      <button type="button" id="configTabFields" class="tab" role="tab">Fields</button>
    </div>
    <div id="configRawPane">
      <label for="configBody">Contents</label>
      <div class="codeWrap">
        <div class="codeWrap">
          <pre id="configHl" aria-hidden="true"></pre>
          <textarea id="configBody" rows="18" spellcheck="false" autocomplete="off"
                    placeholder='{ "ConnectionStrings": { "Default": "..." } }'>${escapeHtml(options.initialConfigBody ?? '')}</textarea>
        </div>
      </div>
    </div>
    <div id="configFieldsPane" style="display:none">
      <p class="hint" id="configFieldsNote"></p>
      <div id="configFieldRows"></div>
    </div>
    <p class="hint">Stored as a secret, like a password — never in plain metadata, never in a share, never handed to an agent. A body that does not parse is still saved; the row is marked until it does.</p>
  </fieldset>

  ${
    options.createdAt === undefined && options.updatedAt === undefined
      ? ''
      : `${openSection('datesSection')}
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

  ${openSection('notesSection')}
    <textarea id="notes" rows="3">${escapeHtml(options.initialNotes ?? '')}</textarea>
  </fieldset>
  </div>

  <div id="additionalGroup" class="fsGroup">
  <h3 class="groupTitle">Additional</h3>
  ${lifetimeHtml}
  ${advancedConnectionHtml}
  ${dependsOnHtml}
  ${totpHtml}
  ${attachmentsHtml}
  </div>

  <div id="agentGroup" class="fsGroup">
  <h3 class="groupTitle">Agent access</h3>
  ${mcpHtml}
  </div>

  </div>

${formPageScript(nonce, d, {
  rows: dependsOnRows,
  folders: options.dependencyFolders,
  colors: options.dependencyColors,
})}
</body>
</html>`;
}
