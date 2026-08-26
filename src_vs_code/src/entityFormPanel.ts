import * as vscode from 'vscode';
import { applyLifetime } from './entityExpiry';
import { normalizeArgs } from './commandLine';
import { renderHtml } from './entityFormPage';
import { flagOf, parseCommandLine } from './commandParse';
import { highlightScript } from './scriptRender';
import { describeFlag, isProbeSafe } from './helpText';
import { readHelpText } from './helpLookup';
import { BINDABLE_FIELDS, isValidEnvName } from './envBinding';
import { parseTotpSecret } from './totp';
import { normalizeTags, parseForward } from './sshOptions';
import {
  DEFAULT_PASSPHRASE,
  DEFAULT_PASSWORD,
  generateEd25519,
  generatePassphrase,
  generatePassword,
} from './secretGenerator';
import { parseSshPrivateKey } from './sshKeyParse';
import {
  CommandArg,
  DB_TYPES,
  DbType,
  EntityKind,
  EntityMetadata,
  PortForward,
  VPN_TYPES,
  VpnType,
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
  hasStoredAttachment: boolean;
  hasStoredImage: boolean;
  /** Shown read-only, so an editor can see how old the thing they are changing is. */
  createdAt?: number;
  updatedAt?: number;
  hasStoredVpnConfig: boolean;
  hasStoredDbConnection: boolean;
  initialDbConnection?: string;
  /** Prefilled note (its own secret now, not plaintext metadata). */
  initialNotes?: string;
  /** A TOTP seed is stored. The seed is never sent to the form — only this fact and… */
  hasStoredTotp: boolean;
  /** …how it is configured (`GitHub · 6 digits · SHA1 · every 30 s`), so it can be compared with the app. */
  storedTotpDescription?: string;
  /** Set when the parent folder dictates the entity kind (selector locked). */
  lockedKind?: EntityKind;
  /** Other entities of the same account usable as a key source. */
  keyCandidates: KeyCandidate[];
  /** Other SSH entities of the same account usable as a jump host (audit D7). */
  jumpCandidates: KeyCandidate[];
  /** A host key is pinned for this entity, and this is its fingerprint (audit B10). */
  hasStoredHostKey: boolean;
  hostKeyFingerprint?: string;
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
  newAttachment?: string;
  clearAttachment: boolean;
  newImage?: string;
  clearImage: boolean;
  /** The CANONICAL `otpauth://` URI — already parsed and normalised, ready to store. */
  newTotp?: string;
  clearTotp: boolean;
  /** True when the person asked to forget the pinned host key (audit B10). */
  clearHostKey: boolean;
}

/**
 * The argument rows, as the webview posts them.
 *
 * Read defensively: the payload crosses a webview boundary, so a malformed row is
 * dropped rather than trusted — the same reason every other value here goes through a
 * typed reader instead of being cast.
 */
// eslint-disable-next-line complexity
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
  type: 'save' | 'cancel' | 'splitCommand' | 'highlight' | 'generate';
  /** `generate` only: which kind of secret to draw. */
  kind?: 'password' | 'passphrase' | 'key';
  data?: Record<string, unknown>;
  text?: string;
  lang?: string;
}


/**
 * Split a pasted command into rows, then fill in what each flag means.
 *
 * <p>Two replies rather than one, deliberately: the rows appear immediately, because
 * splitting is arithmetic, and the notes arrive a moment later, because reading them
 * means running `<tool> --help` and that can take a second. A form that froze while a
 * subprocess started would be a worse form than one that never offered this.</p>
 *
 * <p>Only EMPTY notes are ever filled. Something the user wrote is never overwritten by
 * a guess.</p>
 */
// eslint-disable-next-line complexity
async function splitAndDescribe(panel: vscode.WebviewPanel, text: string): Promise<void> {
  const parsed = parseCommandLine(text);
  if (parsed.command.length === 0) {
    return;
  }
  void panel.webview.postMessage({ type: 'splitResult', command: parsed.command, args: parsed.args });

  const enabled = vscode.workspace
    .getConfiguration('credSshManager')
    .get<boolean>('readCliHelp', true);
  if (parsed.args.length === 0) {
    return;
  }

  // Say WHY when nothing arrives. Empty notes and no explanation read as a broken
  // feature; "aws is not on PATH" reads as a fact about this machine, which it is.
  const say = (status: string, notes: string[] = []): void => {
    void panel.webview.postMessage({ type: 'argNotes', notes, status });
  };

  if (!enabled) {
    say('Help lookup is off (credSshManager.readCliHelp) — write the notes yourself.');
    return;
  }
  if (!isProbeSafe(parsed.command)) {
    say(
      `Nothing was run: "${parsed.command}" is not a plain tool name, and anything that could mean something to a shell is never executed. Write the notes yourself.`,
    );
    return;
  }

  const help = await readHelpText(parsed.command);
  if (help.length === 0) {
    say(`Could not read help from ${parsed.command} — is it installed and on PATH? Write the notes yourself.`);
    return;
  }
  const notes = parsed.args.map((arg) => describeFlag(help, flagOf(arg.value)) ?? '');
  if (notes.every((n) => n.length === 0)) {
    say(`Read ${parsed.command} --help, but it documents none of these arguments.`);
    return;
  }
  say(`Descriptions came from ${parsed.command} --help. Edit anything that is not what you meant.`, notes);
}

/**
 * One generated secret, addressed at the field it belongs in.
 *
 * <p>This is the one direction a secret legitimately travels INTO a webview, and it is worth
 * saying why it does not break the rule the viewer keeps: the form is where a person types a
 * password, so its inputs already hold secret values by design. The read-only viewer is the
 * panel that must never receive one. A generated value goes into the same input the user would
 * otherwise have typed into, and leaves by the same Save.</p>
 */
function draw(kind: FormMessage['kind']): { target: string; value: string; note: string } {
  if (kind === 'passphrase') {
    const made = generatePassphrase(DEFAULT_PASSPHRASE);
    return { target: 'password', value: made.value, note: made.description };
  }
  if (kind === 'key') {
    const pair = generateEd25519();
    const parsed = parseSshPrivateKey(pair.privateKey);
    return {
      target: 'privateKey',
      value: pair.privateKey,
      note: parsed.ok
        ? `New Ed25519 key — ${parsed.key.fingerprint}. It has never been written to disk.`
        : 'New Ed25519 key.',
    };
  }
  const made = generatePassword(DEFAULT_PASSWORD);
  return { target: 'password', value: made.value, note: made.description };
}

/** The public half of a freshly generated private key, for the form's Public key field. */
function publicLineFor(privateKey: string): string {
  const parsed = parseSshPrivateKey(privateKey);
  return parsed.ok ? parsed.key.publicLine : '';
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
    // eslint-disable-next-line complexity
    panel.webview.onDidReceiveMessage((message: FormMessage) => {
      if (message.type === 'highlight') {
        // One highlighter, host-side; the page round-trips instead of duplicating it.
        void panel.webview.postMessage({
          type: 'highlighted',
          html: highlightScript(message.text ?? '', message.lang ?? 'other'),
        });
        return;
      }
      if (message.type === 'splitCommand') {
        void splitAndDescribe(panel, message.text ?? '');
        return;
      }
      if (message.type === 'generate') {
        // Drawn HERE, not in the page: `crypto.randomInt` is a Node API, and a webview
        // reaching for `Math.random()` would produce something that merely looks random.
        const made = draw(message.kind);
        void panel.webview.postMessage({
          type: 'generated',
          ...made,
          publicLine: made.target === 'privateKey' ? publicLineFor(made.value) : '',
        });
        return;
      }
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

/** Bindings as posted by the webview — unknown fields and invalid names are dropped. */
/** Variable rows as posted — same defensive read as the terminal args. */
// eslint-disable-next-line complexity
function readScriptVars(data: Record<string, unknown>): CommandArg[] | undefined {
  const raw = data.scriptVars;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const rows: CommandArg[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const r = item as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const value = typeof r.value === 'string' ? r.value : '';
    if (name.length === 0) {
      continue;
    }
    const row: CommandArg = { name, value };
    if (typeof r.note === 'string' && r.note.trim().length > 0) {
      row.note = r.note.trim();
    }
    if (r.disabled === true) {
      row.disabled = true;
    }
    rows.push(row);
  }
  return rows.length > 0 ? rows : undefined;
}

// eslint-disable-next-line complexity
function readEnvBindings(data: Record<string, unknown>): Record<string, string> | undefined {
  const raw = data.envBindings;
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const field of BINDABLE_FIELDS) {
    const name = (raw as Record<string, unknown>)[field];
    if (typeof name === 'string' && isValidEnvName(name.trim())) {
      out[field] = name.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// eslint-disable-next-line complexity, max-lines-per-function
function toValues(data: Record<string, unknown>, options: EntityFormOptions): EntityFormValues {
  const kind = (options.lockedKind ?? str(data, 'entityType')) as EntityKind;
  const envBindings = readEnvBindings(data);
  // `keep` and anything unrecognised leave the existing lifetime exactly as it was: renaming
  // an entry must never move the moment it dies.
  const lifetime = applyLifetime(str(data, 'lifetime'), Date.now(), options.initial ?? {});
  const isScript = kind === 'script';
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
  const jumpEntity = str(data, 'jumpHostEntityId');
  // Both readers refuse rather than escape, exactly as the host and user fields do: what the
  // webview posts is data, and `sshOptions.ts` is where "is this usable" is decided.
  const forwards = readForwardRows(data);
  const tags = normalizeTags(str(data, 'tags').split(/\s+/));
  // A second factor belongs to a login: keys, commands and scripts have none. Switching an
  // entity to one of those kinds scrubs a stored seed, as every other kind's fields are.
  const isTotpKind = !isKey && !isTerminal && !isScript;
  const totpParsed = isTotpKind ? parseTotpSecret(withSteamEncoder(str(data, 'totp'), bool(data, 'totpSteam'))) : undefined;
  const clearTotp = isTotpKind ? bool(data, 'clearTotp') : options.hasStoredTotp;
  const hasTotp = totpParsed !== undefined || (isTotpKind && options.hasStoredTotp && !clearTotp);

  return {
    details: {
      id: options.entityId,
      name: str(data, 'name').trim(),
      envBindings,
      hasTotp: hasTotp || undefined,
      expiresAt: lifetime.expiresAt,
      burnPolicy: lifetime.burnPolicy,
      isScript: isScript || undefined,
      scriptLanguage: isScript ? str(data, 'scriptLanguage').trim() || 'bash' : undefined,
      script: isScript ? str(data, 'scriptBody') || undefined : undefined,
      scriptVars: isScript ? readScriptVars(data) : undefined,
      attachmentFileName: bool(data, 'clearAttachment')
        ? undefined
        : str(data, 'attachmentName').trim() || options.initial?.attachmentFileName,
      imageFileName: bool(data, 'clearImage')
        ? undefined
        : str(data, 'imageName').trim() || options.initial?.imageFileName,
      host: isSsh || isVpn ? str(data, 'host').trim() || undefined : undefined,
      user: isSsh || isVpn ? str(data, 'user').trim() || undefined : undefined,
      port: (isSsh || isVpn) && portText !== '' ? Number(portText) : undefined,
      sshKeyPath: isSsh || isKey ? str(data, 'sshKeyPath').trim() || undefined : undefined,
      publicKey: isSsh || isKey ? str(data, 'publicKey').trim() || undefined : undefined,
      sshKeyEntityId: isSsh && keyEntity !== '' ? keyEntity : undefined,
      // The connection-manager fields belong to an SSH connection and to nothing else, so
      // switching an entity to another kind scrubs them exactly as it scrubs every other kind's
      // fields. A pinned host key is kept unless the person asked to forget it.
      jumpHostEntityId: isSsh && jumpEntity !== '' && jumpEntity !== options.entityId ? jumpEntity : undefined,
      portForwards: isSsh && forwards.length > 0 ? forwards : undefined,
      agentForward: isSsh && bool(data, 'agentForward') ? true : undefined,
      hostKey: isSsh && !bool(data, 'clearHostKey') ? options.initial?.hostKey : undefined,
      tags: isSsh && tags.length > 0 ? tags : undefined,
      isSshEnabled: isSsh,
      isSshKey: isKey || undefined,
      // A key-only preference; kept as it was, because it is set from the tree menu rather
      // than in the form and an edit must not silently unload a served key.
      sshAgent: isKey ? options.initial?.sshAgent : undefined,
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
    newPrivateKey: (isSsh || isKey || isVpn) && privateKey.length > 0 ? privateKey : undefined,
    clearPrivateKey: bool(data, 'clearPrivateKey') || bool(data, 'clearVpnKey'),
    newVpnConfig: isVpn && vpnConfig.length > 0 ? vpnConfig : undefined,
    clearVpnConfig,
    newDbConnection: isDb && dbConnection.length > 0 ? dbConnection : undefined,
    clearDbConnection:
      isDb && options.initialDbConnection !== undefined && dbConnection.length === 0,
    newAttachment: str(data, 'attachmentContent') || undefined,
    clearAttachment: bool(data, 'clearAttachment'),
    newImage: str(data, 'imageContent') || undefined,
    clearImage: bool(data, 'clearImage'),
    newNotes: str(data, 'notes'),
    newTotp: totpParsed?.uri,
    clearTotp,
    clearHostKey: bool(data, 'clearHostKey'),
  };
}

/**
 * The forwarding rows as the webview posts them.
 *
 * <p>Read defensively and validated by the same function the command builders use: a row that
 * does not parse is DROPPED rather than stored, because a stored rule that cannot be rendered is
 * a rule that silently does nothing on every future connection.</p>
 */
function readForwardRows(data: Record<string, unknown>): PortForward[] {
  const raw = data.portForwards;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((row) => forwardFromRow(row))
    .filter((forward): forward is PortForward => forward !== undefined);
}

/** One posted row, validated by the same parser the command builders use. */
// eslint-disable-next-line complexity -- a flat list of independent field checks (a webview payload is read defensively, field by field); splitting reads worse
function forwardFromRow(row: unknown): PortForward | undefined {
  if (typeof row !== 'object' || row === null) {
    return undefined;
  }
  const r = row as Record<string, unknown>;
  const kind = r.kind === 'remote' ? 'remote' : 'local';
  const parsed = typeof r.rule === 'string' ? parseForward(kind, r.rule) : undefined;
  return parsed === undefined
    ? undefined
    : { ...parsed, disabled: r.disabled === true ? true : undefined };
}

/**
 * Steam Guard seeds are exported as plain base32 with nothing marking them as Steam's; the
 * checkbox supplies that marker as the `encoder=steam` parameter the URI form already knows.
 */
function needsSteamMarker(trimmed: string, steam: boolean): boolean {
  return steam && trimmed.length > 0 && !/encoder=steam/i.test(trimmed);
}

function withSteamEncoder(text: string, steam: boolean): string {
  const trimmed = text.trim();
  if (!needsSteamMarker(trimmed, steam)) {
    return trimmed;
  }
  return /^otpauth:/i.test(trimmed) ? appendSteam(trimmed) : steamUriFor(trimmed);
}

function appendSteam(uri: string): string {
  return `${uri}${uri.includes('?') ? '&' : '?'}encoder=steam`;
}

function steamUriFor(secret: string): string {
  return `otpauth://totp/Steam?secret=${encodeURIComponent(secret.replace(/[\s-]+/g, ''))}&encoder=steam`;
}
