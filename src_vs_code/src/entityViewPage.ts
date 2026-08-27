import {
  COPY_ICON as SHARED_COPY_ICON,
  PAGE_MAX_WIDTH_PX,
  TWO_COLUMN_AT,
  escapeHtml,
  jsonForScript,
} from './webviewHtml';
import * as crypto from 'node:crypto';
import { describeMcpSource } from './viewerOptions';
import { mcpBarHtml, mcpSwitchStyles } from './mcpSwitches';
import { DbConnParts } from './dbConnString';
import { CommandArg, EntityMetadata } from './types';
import { buildCommandLine, normalizeArgs } from './commandLine';
import { highlightScript, resolveScriptEnv } from './scriptRender';
import { configCodePanel, highlightSnippet } from './configCodePanel';
import {
  DEFAULT_SNIPPET_LANGUAGE,
  SnippetContext,
  SnippetVariant,
  snippetFor,
  snippetLanguage,
} from './configSnippet';
import { CONFIG_KEY_ENV } from './configKey';
import { configFileNameFor } from './configFile';
import { FORM_SECTIONS } from './formSections';
import { WINDOWS_OPENSSH_DIR } from './sshProgram';
import { Revision, summarizeRevision } from './revisionHistory';
import { BINDABLE_FIELDS, BindableField } from './envBinding';
import { TotpSnapshot } from './totp';
import { normalizeForwards, normalizeTags, renderForward } from './sshOptions';

/**
 * The read-only entity viewer as PURE markup: options in, one HTML string out.
 *
 * <p>Split from `entityViewPanel.ts` the way `entityFormPage.ts` is split from
 * `entityFormPanel.ts`, and for the same reason — repo rule 3. Everything here is `vscode`-free,
 * so the page it builds can be asserted on directly instead of through a webview nobody can open
 * in a test. The `vscode.postMessage` calls below are the BROWSER-side api from
 * `acquireVsCodeApi()`, inside a script string; they are not this module importing anything.</p>
 *
 * <p>What made the split worth doing rather than merely tidy: the viewer grew a second column in
 * 0.77.0 and kept the one-column body width, so every column rendered at half width and no test
 * could see it. A layout that only a person can check is a layout that regresses between the
 * times a person looks.</p>
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
  /**
   * The config file's contents (from SecretStorage), shown read-only with copy.
   *
   * <p>A secret, and it reaches the viewer the same way `notes` does. That is a deliberate
   * exception to "the read-only viewer never receives a secret value", and it is the same
   * exception notes already are: this entry's whole content IS the thing somebody opened it to
   * look at, and a viewer that showed a config entry as a name and two dates — which is what it
   * did — is a viewer that cannot view the one kind it was opened for.</p>
   */
  config?: string;
  /** Parsed parts of the stored connection string (password not included). */
  dbParts?: DbConnParts;
  /** The shown port is the type's default, not explicit in the string. */
  dbPortIsDefault: boolean;
  dbHasPassword: boolean;
  sshCommand?: string;
  /** The NAME of the jump-host entity, resolved by the caller — the id means nothing to a reader. */
  jumpHostName?: string;
  /** `SHA256:…` of the pinned host key, the string a server prints about itself (audit B10). */
  hostKeyFingerprint?: string;
  /**
   * What an agent may do with this entry, already resolved — and WHERE that answer came from.
   *
   * <p>The source is the half the form does not need. There you can see whether the switches
   * were touched; here there are no switches, so "visible · usable" reads identically whether
   * somebody chose it on this entry or its folder decided it. Said in words, or the card lies
   * the same way in both cases.</p>
   */
  mcp?: { summary: string; source: 'entity' | 'folder' | 'none'; folderName?: string; mask: boolean[] };
  resolveSecret: (
    field: 'password' | 'privateKey' | 'vpnConfig' | 'dbConnection' | 'dbPassword' | 'totp',
  ) => Thenable<string | undefined>;
  /**
   * The live one-time code — the SECOND deliberate exception to "the viewer never receives a
   * secret", for the same reason as the image preview: a code that has to be READ cannot
   * round-trip through the host. What travels is the derived code, which expires within the
   * period; the seed it was derived from never does. Undefined when there is no seed.
   */
  totp?: () => Thenable<TotpSnapshot | undefined>;
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

export interface CopyMessage {
  type: 'copy' | 'download' | 'env' | 'envcheck' | 'close' | 'totp' | 'snippet';
  field: string;
}

/**
 * A language change, answered.
 *
 * <p>`field` carries `language|variant`, which is the shape the viewer's one message already has
 * — adding a second payload field would have meant a wider message for every other button too.
 * Both halves are untrusted input from a `<select>`; `snippetFor` falls back rather than
 * throwing, which is why nothing here validates them first.</p>
 */
export function snippetAnswer(options: EntityViewOptions, field: string): Record<string, unknown> {
  const parts = field.split('|');
  const snippet = snippetFor(parts[0], parts[1], snippetContextFor(options.details));
  return {
    type: 'snippet',
    html: highlightSnippet(snippet),
    where: snippet.where,
    does: snippet.does,
    variants: variantsOf(parts[0]),
  };
}

/** Shared by the first render and every later change, so the two cannot describe different files. */
function snippetContextFor(details: EntityMetadata): SnippetContext {
  return {
    envVar: CONFIG_KEY_ENV,
    fileName: configFileNameFor(details.configFileName, details.configFormat ?? 'json', details.name),
  };
}

function variantsOf(languageId: string): readonly SnippetVariant[] {
  return snippetLanguage(languageId)?.variants ?? [];
}

/**
 * The second column, for a config entry and nothing else.
 *
 * <p>Other kinds have no code story worth a column: an SSH host is used through the broker, a
 * password is copied. A config is the one thing an application READS, so it is the one that needs
 * to say how.</p>
 */
function codePanelFor(options: EntityViewOptions): string {
  const details = options.details;
  if (details.isConfig !== true) {
    return '';
  }
  const language = DEFAULT_SNIPPET_LANGUAGE;
  const variant = variantsOf(language)[0].id;
  return configCodePanel({
    snippet: snippetFor(language, variant, snippetContextFor(details)),
    languageId: language,
    variantId: variant,
    hasKey: details.configKeyHash !== undefined,
    envVar: CONFIG_KEY_ENV,
  });
}


/**
 * What a copy button's `field` resolves to — the whole mapping, host-side and `vscode`-free.
 *
 * <p>Extracted from the panel's message handler for the oldest reason in this repo: the switch
 * could not be tested where it lived, and an untested switch is where the snippet button spent
 * its first release copying nothing. The button posted `field: "snippet"` like every other copy
 * button, no case answered to that name, and the fall-through produced "Nothing to copy — the
 * field is empty" on a field that was plainly not.</p>
 *
 * <p>The snippet case re-derives the text from the language and variant the page sends
 * (`snippet|<language>|<variant>`), exactly as `snippetAnswer` does for rendering — copying the
 * DEFAULT while the reader looks at another language would be a worse defect than the dead
 * button, because it would look fixed.</p>
 */
// eslint-disable-next-line complexity, max-lines-per-function
export async function copyValueFor(
  options: EntityViewOptions,
  field: string,
): Promise<string | undefined> {
  const d = options.details;
  if (field === 'snippet' || field.startsWith('snippet|')) {
    const parts = field.split('|');
    return snippetFor(
      parts[1] ?? DEFAULT_SNIPPET_LANGUAGE,
      parts[2] ?? '',
      snippetContextFor(d),
    ).code;
  }
  let value: string | undefined;
  switch (field) {
    case 'password':
    case 'privateKey':
    case 'vpnConfig':
    case 'dbConnection':
    case 'dbPassword':
    case 'totp':
      value = await options.resolveSecret(field);
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
    case 'config': value = options.config; break;
    case 'vpnType': value = d.vpnType; break;
    case 'dbType': value = d.dbType; break;
    case 'dbHost': value = options.dbParts?.host; break;
    case 'dbPort': value = options.dbParts?.port; break;
    case 'dbName': value = options.dbParts?.database; break;
    case 'dbUser': value = options.dbParts?.user; break;
    case 'ssh': value = options.sshCommand; break;
    case 'sshPortable': value = portableSshCommand(options.sshCommand); break;
    case 'agentForward': value = d.agentForward === true ? '-A' : undefined; break;
    case 'hostKey': value = options.hostKeyFingerprint; break;
    case 'tags': value = normalizeTags(d.tags).join(' '); break;
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
      const env = /^envname_(.+)$/.exec(field);
      if (env !== null) {
        value = d.envBindings?.[env[1]];
        break;
      }
      const revision = /^rev(\d+)$/.exec(field);
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
      const forward = /^forward(\d+)$/.exec(field);
      if (forward !== null) {
        const rule = normalizeForwards(d.portForwards)[Number(forward[1])];
        value = rule === undefined ? undefined : renderForward(rule).join(' ');
        break;
      }
      const svar = /^svar(\d+)$/.exec(field);
      if (svar !== null) {
        value = normalizeArgs(d.scriptVars)[Number(svar[1])]?.value;
        break;
      }
      // Argument rows are numbered rather than named — there can be any number of them.
      const arg = /^arg(\d+)$/.exec(field);
      if (arg === null) {
        return;
      }
      value = normalizeArgs(d.commandArgs)[Number(arg[1])]?.value;
      break;
    }
  }
  return value;
}


/**
 * A viewer group frame, coloured from the FORM's section catalog (T19).
 *
 * <p>The owner asked for the viewer's flat run of rows to wear the same framed groups the edit
 * form has — three of them: the main fields, dates-and-history, and the code panel column. The
 * colours are looked up by section id rather than spelled here, so the viewer's "main" frame is
 * the same colour as the form's General section on every kind, and a colour renamed in
 * `formSections.ts` fails this file's tests instead of silently unframing the page.</p>
 */
function viewFrame(sectionId: string, legend: string, body: string): string {
  if (body.trim().length === 0) {
    return '';
  }
  const section = FORM_SECTIONS.find((candidate) => candidate.id === sectionId);
  if (section === undefined) {
    throw new Error(`viewFrame: unknown section id "${sectionId}"`);
  }
  return `<fieldset class="sec ${section.color}"><legend>${escapeHtml(legend)}</legend>
${body}
</fieldset>`;
}


/**
 * The same ssh command with the bare word, for pasting on another machine (T20).
 *
 * <p>Returns undefined when the shown command already IS the bare word — which, after the PATH
 * probe, is the common case — so the second row appears only when the two genuinely differ:
 * when an MSYS ssh shadows the built-in and the full path had to be used. Same flags, same
 * order; only the program word changes, because the flags are the part worth carrying.</p>
 */
export function portableSshCommand(sshCommand: string | undefined): string | undefined {
  if (sshCommand === undefined) {
    return undefined;
  }
  const prefix = `${WINDOWS_OPENSSH_DIR}/ssh.exe `;
  return sshCommand.startsWith(prefix) ? `ssh ${sshCommand.slice(prefix.length)}` : undefined;
}

const COPY_ICON = SHARED_COPY_ICON;

const DOWNLOAD_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">' +
  '<path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10"/></svg>';

const CHECK_ICON =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">' +
  '<path d="M3 8.5 6.5 12 13 4.5"/></svg>';

// eslint-disable-next-line complexity, max-lines-per-function
export function renderEntityViewHtml(options: EntityViewOptions): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const d = options.details;

  // Render ONLY fields that actually hold a value — the viewer must never
  // show empty rows or capabilities the entity does not have.
  /**
   * A read-only block of CODE: highlighted, with the same Copy the plain rows carry.
   *
   * <p>It existed once, hand-written, for the stored script — while the same script "as it runs"
   * and the whole config body went through `row` and came out as flat text. Two blocks of the
   * same JSON, one coloured and one grey, is a difference that means nothing; a config is read
   * here far more often than it is edited, and a wall of one-coloured JSON is the version nobody
   * can scan.</p>
   */
  const codeRow = (label: string, field: string, text: string | undefined, language: string): string =>
    text === undefined || text.length === 0
      ? ''
      : `<div class="row"><label>${escapeHtml(label)}</label>
      <div class="line"><pre class="code">${highlightScript(text, language)}</pre>
        <button data-field="${field}" data-action="copy" class="icon" title="Copy ${escapeHtml(label)} (raw)" aria-label="Copy ${escapeHtml(label)}">${COPY_ICON}</button>
      </div></div>`;

  const row = (
    label: string,
    field: string,
    value: string | undefined,
    masked = false,
    action: 'copy' | 'download' = 'copy',
  // eslint-disable-next-line complexity
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
  // eslint-disable-next-line complexity
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

  const mcpRow = options.mcp === undefined ? '' : `<div class="row">
      <label>Agent access</label>
      ${mcpBarHtml(options.mcp.mask)}
      <div class="value">${escapeHtml(options.mcp.summary)}</div>
      <div class="note">${escapeHtml(describeMcpSource(options.mcp))}</div>
    </div>`;

  const mainRows = [
    mcpRow,
    row('Name', 'name', d.name),
    row('Host', 'host', d.host),
    row('User', 'user', d.user),
    row('Port', 'port', d.port !== undefined ? String(d.port) : undefined),
    row('Password', 'password', options.hasPassword ? '•' : undefined, true),
    // The code is filled in by the host after load (see the `totp` message) and redrawn as
    // it expires; the seed is not in this HTML and never will be.
    ...(options.totp !== undefined
      ? [
          `<div class="row"><label>One-time code <span id="totpMeta" class="note"></span></label>
      <div class="line"><input readonly id="totpCode" class="totp" value="······" aria-live="polite">
        <span id="totpLeft" class="totpLeft" aria-label="seconds until the code changes"></span>
        <button data-field="totp" data-action="copy" class="icon" title="Copy one-time code" aria-label="Copy one-time code">${COPY_ICON}</button>
      </div></div>`,
        ]
      : []),
    row('Private key', 'privateKey', options.hasPrivateKey ? '•' : undefined, true),
    row('Public key', 'publicKey', d.publicKey),
    row('SSH key path', 'sshKeyPath', d.sshKeyPath),
    ...(options.keySourceName !== undefined
      ? [`<div class="row"><label>Key source</label>
          <div class="line"><input readonly value="entity: ${escapeHtml(options.keySourceName)}"></div></div>`]
      : []),
    row('SSH command', 'ssh', options.sshCommand),
    row('SSH command (any machine)', 'sshPortable', portableSshCommand(options.sshCommand)),
    // The connection-manager fields (audit D7). Each renders only when the entity has it, so an
    // entry that uses none of them looks exactly as it did before.
    ...(options.jumpHostName !== undefined
      ? [`<div class="row"><label>Jump host</label>
          <div class="line"><input readonly value="entity: ${escapeHtml(options.jumpHostName)}"></div></div>`]
      : []),
    ...normalizeForwards(d.portForwards).map(
      (forward, index) =>
        `<div class="row">
      <label>${forward.kind === 'local' ? 'Local forward (-L)' : 'Remote forward (-R)'}</label>
      <div class="line"><input readonly value="${escapeHtml(renderForward(forward)[1])}">
        <button data-field="forward${index}" data-action="copy" class="icon" title="Copy forward" aria-label="Copy forward">${COPY_ICON}</button>
      </div>
    </div>`,
    ),
    row('Agent forwarding', 'agentForward', d.agentForward === true ? 'on (-A)' : undefined),
    // The fingerprint, never the key: a fingerprint is what a person can compare against what
    // their server printed, and the key itself says nothing to anybody reading this panel.
    row('Host key (pinned)', 'hostKey', options.hostKeyFingerprint),
    row('Tags', 'tags', normalizeTags(d.tags).join(' ')),
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
    codeRow('Script', 'script', d.isScript ? d.script : undefined, d.scriptLanguage ?? 'other'),
    ...(d.isScript ? normalizeArgs(d.scriptVars).map((v, i) => argRow(v, i, true)) : []),
    // Visible again, and safe to be: the body reads its variables from the environment
    // now, so it carries names rather than values (see resolveScriptEnv).
    codeRow(
      'Script as it runs (variables read from the environment)',
      'scriptFull',
      d.isScript && d.script !== undefined && d.script.length > 0
        ? resolveScriptEnv(d.script, d.scriptVars, d.scriptLanguage ?? 'other').body
        : undefined,
      d.scriptLanguage ?? 'other',
    ),
    // Its FORMAT is the language: `json` and `yaml` are spelled the same in both tables, and
    // `env`, `toml` and `ini` were taught to the highlighter for exactly this row.
    codeRow('Config file', 'config', options.config, d.configFormat ?? 'json'),
    row('Notes', 'notes', options.notes),
  ].join('\n');

  // The right column's frame (T19 amendment): attachments and the stored image belong in
  // Additional, beside the code panel — the same side and colour the FORM keeps them on.
  const additionalRows = [
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

  // The owner's second frame: when it happened, and what it was before — one colour on every
  // kind, the same one the form's Dates section wears.
  const datesRows = [
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
  ].join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  /* Both numbers come from webviewHtml.ts, and that is the fix rather than a tidy-up: this page
     used to cap itself at 640px while splitting into two columns at a 1000px window, so it split
     exactly where it had no room. Sharing them makes the two pages unable to disagree. */
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); padding: 16px 24px;
         max-width: ${PAGE_MAX_WIDTH_PX}px; }
  h2 { font-size: 1.2em; }
  .row { margin-bottom: 10px; }
  .note { opacity: .75; font-style: italic; }
  /* The same five segments the form shows, in the same colours — a card and its editor must not
     describe one permission set two different ways. Both the markup and the colours come from
     the switch catalog; this file used to keep its own copy of the five hex values, which is a
     palette that agrees with the form only until somebody edits one of them. */
  .mcpBar { display: flex; gap: 3px; margin: 2px 0 4px; }
  .mcpSeg { width: 26px; height: 4px; border-radius: 2px; opacity: .18; }
  .mcpSegOn { opacity: 1; }
  ${mcpSwitchStyles()}
  .env { font-size: .72em; letter-spacing: .5px; }
  .envTag { opacity: .8; font-family: var(--vscode-editor-font-family); font-size: .9em; }
  .envLine { margin-top: 3px; align-items: center; }
  /* The form's own rule, deliberately: two columns when there is room, stacked when there is
     not, and the two pages then narrow the same way instead of nearly the same way. */
  .viewGroups { display: grid; grid-template-columns: 1fr; gap: 0 24px; align-items: start; }
  @media (min-width: ${TWO_COLUMN_AT}px) { .viewGroups { grid-template-columns: 1fr 1fr; } }
  .hint.bad { color: var(--vscode-editorWarning-foreground, #cca700); opacity: 1; }
  .code { flex: 1; margin: 0; padding: 6px 8px; max-height: 320px; overflow: auto;
    font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; line-height: 1.45;
    white-space: pre-wrap; word-break: break-all;
    border: 1px solid var(--vscode-widget-border, #3c3c3c); border-radius: 4px; }
  .tok-comment { color: var(--vscode-descriptionForeground); font-style: italic; }
  .tok-string { color: var(--vscode-charts-orange, #ce9178); }
  .tok-kw { color: var(--vscode-charts-blue, #569cd6); font-weight: 600; }
  .tok-num { color: var(--vscode-charts-green, #b5cea8); }
  .tok-var { color: var(--vscode-charts-purple, #c586c0); font-weight: 600; }
  .totp { font-size: 1.25em; letter-spacing: .18em; max-width: 11em; flex: 0 1 11em; }
  /* The form's frame rules, verbatim in shape: only the border carries the colour. */
  fieldset { border: 1px solid var(--vscode-widget-border, #4444); border-radius: 4px;
             margin: 0 0 14px; padding: 10px 12px; }
  legend { padding: 0 6px; opacity: .85; }
  .sec { border-color: currentColor; }
  ${FORM_SECTIONS.map(
    (section) =>
      `.sec.${section.color} { border-color: var(--vscode-credSshManager-${section.color}, var(--vscode-widget-border, #4444)); }`,
  ).join('\n  ')}
  .totpLeft { align-self: center; min-width: 3em; opacity: .8; font-variant-numeric: tabular-nums; }
  /* Width only, height auto (T26): the zoom used to set BOTH to a square, the column clamped
     the width, and the un-clamped height turned into empty letterbox bands that read as a
     distorted zoom. max-width keeps the box inside the column at every zoom step. */
  .preview { width: 200px; max-width: 100%; height: auto; cursor: zoom-in;
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
  /* The title and Copy All on one line, the button hugging the title rather than the far edge —
     a button flung to the right of a 1280px page is as lost as one at the bottom was. */
  .pageHead { display: flex; align-items: center; gap: 16px; margin: 0 0 14px; flex-wrap: wrap; }
  .pageHead h2 { margin: 0; }
</style>
</head>
<body>
  <!-- Copy All rides with the title. It used to be a footer, which put the page's one
       whole-entity action underneath everything — and once the code panel arrived, underneath up
       to 320px of scrolling snippet as well, off the screen of somebody reading the top of the
       entry. The name and the action that takes the whole entry belong on one line. -->
  <div class="pageHead">
    <h2>${escapeHtml(d.name)}</h2>
    <button class="primary" data-field="all">${COPY_ICON} Copy All</button>
  </div>
  <div class="viewGroups">
    <div>
      ${viewFrame('generalSection', 'Main', mainRows)}
      ${viewFrame('datesSection', 'Dates & history', datesRows)}
    </div>
    <div>
      ${viewFrame('attachmentsSection', 'Additional', additionalRows)}
      ${viewFrame('configSection', 'Read this from code', codePanelFor(options))}
    </div>
  </div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  // ---- the code panel: language and version, answered by the host ----
  var languageSelect = document.getElementById('snippetLanguage');
  function askForSnippet() {
    var variant = document.getElementById('snippetVariant');
    vscode.postMessage({
      type: 'snippet',
      field: languageSelect.value + '|' + (variant ? variant.value : ''),
    });
  }
  if (languageSelect) {
    languageSelect.addEventListener('change', askForSnippet);
    document.addEventListener('change', function (event) {
      if (event.target && event.target.id === 'snippetVariant') { askForSnippet(); }
    });
    window.addEventListener('message', function (event) {
      var msg = event.data;
      if (!msg || msg.type !== 'snippet') { return; }
      document.getElementById('snippetCode').innerHTML = msg.html;
      document.getElementById('snippetWhere').textContent = msg.where;
      document.getElementById('snippetDoes').textContent = msg.does;
      renderVariants(msg.variants);
    });
  }

  // The Version picker exists only while the chosen language has more than one, so it is built
  // and removed rather than merely refilled — a picker left behind with one entry is furniture
  // that looks like a choice.
  function renderVariants(variants) {
    var existing = document.getElementById('snippetVariantRow');
    if (existing) { existing.remove(); }
    if (!variants || variants.length < 2) { return; }
    var row = document.createElement('div');
    row.className = 'row';
    row.id = 'snippetVariantRow';
    var label = document.createElement('label');
    label.textContent = 'Version';
    label.setAttribute('for', 'snippetVariant');
    var select = document.createElement('select');
    select.id = 'snippetVariant';
    for (var i = 0; i < variants.length; i++) {
      var option = document.createElement('option');
      option.value = variants[i].id;
      option.textContent = variants[i].label;
      select.appendChild(option);
    }
    row.appendChild(label);
    row.appendChild(select);
    languageSelect.parentElement.insertAdjacentElement('afterend', row);
  }

  for (const button of document.querySelectorAll('button[data-field]')) {
    button.addEventListener('click', () => {
      var field = button.dataset.field;
      // The snippet button must copy what is SHOWN — the language and variant live in the
      // page's selects, so they ride along and the host re-derives the same text it rendered.
      if (field === 'snippet') {
        var lang = document.getElementById('snippetLanguage');
        var vart = document.getElementById('snippetVariant');
        field = 'snippet|' + (lang ? lang.value : '') + '|' + (vart ? vart.value : '');
      }
      vscode.postMessage({
        type: button.dataset.action || 'copy',
        field: field,
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
      // Width only — height follows the aspect ratio, and max-width lets the column cap it.
      preview.style.width = size + 'px';
      preview.style.cursor = zoom === 2 ? 'zoom-out' : 'zoom-in';
    });
  }
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'copied') { return; }
    const button = document.querySelector('button[data-field="' + event.data.field + '"]');
    if (!button) { return; }
    const original = button.innerHTML;
    button.innerHTML = ${jsonForScript(CHECK_ICON)};
    setTimeout(() => { button.innerHTML = original; }, 1200);
  });
  // The one-time code: asked for on load, counted down every quarter second, asked for
  // again the moment it expires. The host computes it; this page only displays it.
  const totpCode = document.getElementById('totpCode');
  if (totpCode) {
    const totpLeft = document.getElementById('totpLeft');
    const totpMeta = document.getElementById('totpMeta');
    let validUntil = 0;
    const askForCode = () => vscode.postMessage({ type: 'totp', field: 'totp' });
    window.addEventListener('message', (event) => {
      if (event.data?.type !== 'totp') { return; }
      totpCode.value = event.data.code;
      validUntil = event.data.validUntil;
      totpMeta.textContent = '— ' + event.data.description;
    });
    setInterval(() => {
      if (!validUntil) { return; }
      const remaining = Math.ceil((validUntil - Date.now()) / 1000);
      if (remaining <= 0) { validUntil = 0; askForCode(); return; }
      totpLeft.textContent = remaining + ' s';
    }, 250);
    askForCode();
  }
</script>
</body>
</html>`;
}
