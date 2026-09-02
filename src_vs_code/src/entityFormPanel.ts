import { readDependsOnRows, readForwardRows } from './formRowReaders';
import { DEFAULT_PAYMENT_FORM, isPaymentForm } from './paymentForm';
import { PaymentFields } from './paymentFields';
import { brandHint, cardInputsFrom } from './cardFormFields';
import { cardFieldsFrom } from './cardFormFields';
import * as vscode from 'vscode';
import { applyLifetime } from './entityExpiry';
import { normalizeArgs } from './commandLine';
import { flagOf, parseCommandLine } from './commandParse';
import { highlightScript } from './scriptRender';
import { describeFlag, isProbeSafe } from './helpText';
import { readHelpText } from './helpLookup';
import { BINDABLE_FIELDS, isValidEnvName } from './envBinding';
import { parseTotpSecret } from './totp';
import { kindCarriesTotp } from './formSections';
import { readPastedQr } from './qrPaste';
import { withSteamEncoder } from './totpSteam';
import { normalizeTags } from './sshOptions';
import { answerGenerate, formPanelFor, mountForm, runDoorCommand } from './entityFormHost';
import { AgentDoors } from './agentDoors';
import { applyZoomDelta } from './uiScaleHost';
import { isDepColorKey } from './depColors';
import { keepsPassword } from './entityKind';
import {
  ConfigFormat,
  ConfigProblem,
  describeConfigProblem,
  invalidSaveConfirmation,
  isConfigFormat,
} from './configFormat';
import { ConfigField, configFields, fieldsOutcome, withFieldValues } from './configFields';
import { readMcpAccess } from './mcpAccess';
import { DependencyFolderCandidate, normalizeDependsOn } from './depGraph';
import {
  CommandArg,
  DB_TYPES,
  DbType,
  EntityKind,
  EntityMetadata,
  VPN_TYPES,
  VpnType,
} from './types';
import { EntityFields, pickFields } from './entityFields';

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
  /** The text-zoom offset (T28), from `credSshManager.uiScale`. */
  uiScale?: number;
  /** The stored image as a data: URI (T27) — shown as a preview beside its metadata. */
  imageDataUri?: string;
  /** The other ways an agent can reach this entry, for the MCP section's footer (T24b). */
  agentDoors?: AgentDoors;
  /** The tree element the footer's commands act on — the same argument the context menu passes. */
  entityTarget?: unknown;
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
  /** A credential's login and URL, prefilled like the notes. */
  initialFields?: EntityFields;
  /**
   * Prefilled config body — a secret, and one of the two the form deliberately sends INTO the
   * webview.
   *
   * <p>The empty-means-keep rule the password and the private key follow cannot apply here: a
   * config is a document somebody opens Edit to change one line of, and a form that showed it
   * blank would make every edit a retype from memory. The DB connection string is prefilled for
   * exactly this reason and is the precedent. Deleting the text and saving therefore CLEARS the
   * body, which is what an empty document should mean.</p>
   */
  initialConfigBody?: string;
  /**
   * The stored payment record, handed to the WEBVIEW by message — never rendered into the page.
   *
   * <p>Every other kind's stored value is written into the markup (a db connection string, a config
   * body). For a CVV and a PIN that is one place too many: the HTML is a string that gets built,
   * concatenated and — the moment anything goes wrong — logged. The webview asks for these once it is
   * listening, and they go straight into the inputs.</p>
   */
  initialPayment?: PaymentFields;
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
  /**
   * This account's folders with the entities they hold, self excluded — the "pick a folder,
   * then an entity" cascade behind the Depends-on rows.
   *
   * <p>Empty when authoring an entity for somebody else, the same call `jumpCandidates` already
   * makes and for the same reason: an id addressing THIS vault means nothing in theirs.</p>
   */
  dependencyFolders: DependencyFolderCandidate[];
  /**
   * Target entity id -> the colour it already wears, for targets something currently depends
   * on. Two jobs at once: pre-select the swatch when the person picks a target that is already
   * in a relationship, and tell the auto-pick which colours are taken.
   */
  dependencyColors: Record<string, string>;
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
  /** A credential's login/URL; `undefined` for every other kind, which DELETES — the same scrubbing a config gets. */
  newFields?: EntityFields;
  /**
   * The config body as the form last held it — sent whole, not as a delta.
   *
   * <p>Unlike `newPassword`, an empty string here is a REAL value meaning "the document is now
   * empty", because the form was prefilled with whatever was stored. `undefined` is what says
   * this entity is not a config at all.</p>
   */
  newConfigBody?: string;
  /**
   * The whole payment record, or `undefined` for a kind that is not one.
   *
   * <p>One field for all three forms, because storage holds one JSON record under one key — the
   * decision `entityFields.ts` already made for a credential's login and URL, and the reason a
   * payment did not have to go through all nine secret seams a tenth time.</p>
   */
  newPayment?: PaymentFields;
  newAttachment?: string;
  clearAttachment: boolean;
  newImage?: string;
  clearImage: boolean;
  /** The CANONICAL `otpauth://` URI — already parsed and normalised, ready to store. */
  newTotp?: string;
  clearTotp: boolean;
  /** True when the person asked to forget the pinned host key (audit B10). */
  clearHostKey: boolean;
  /**
   * Colour picks for the entities this one now depends ON — a SECOND entity's field in each
   * case, which is why they are a sibling of `details` rather than something inside it.
   *
   * <p>The colour belongs to the target, and that is the whole mechanism behind "change it once
   * and every dependent follows": there is no copy on this record to keep in step. The caller
   * applies these onto those other entities.</p>
   */
  dependsOnColors: { targetId: string; color: string }[];
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

export interface FormMessage {
  type:
    | 'save'
    | 'cancel'
    | 'zoom'
    | 'command'
    | 'splitCommand'
    | 'highlight'
    | 'generate'
    | 'configFields'
    | 'configFieldEdit'
    | 'qrImage'
    | 'cardValues'
    | 'cardTyped';
  /** `cardTyped` only: the number as typed so far, for the mark and the checksum hint. */
  number?: string;
  /** `qrImage` only: the pasted picture as grey pixels, base64, and its size. */
  gray?: string;
  width?: number;
  height?: number;
  /** `configFieldEdit` only: which row was changed, and to what. */
  path?: string;
  value?: string;
  /** `highlight` only (T17): which overlay asked, echoed back with the answer. */
  hlTarget?: string;
  /** `command` only (T24b): a footer link asking the host to run a command on this entry. */
  command?: string;
  /** `zoom` only (T28): which way the press went. */
  zoomDelta?: number;
  /** `generate` only: which kind of secret to draw. */
  kind?: 'password' | 'passphrase' | 'key';
  /** `generate` only: the options the page's controls chose (T14). Absent = the defaults. */
  genLength?: number; genLower?: boolean; genUpper?: boolean; genDigits?: boolean;
  genSymbols?: boolean; genKeyType?: string; genWords?: number;
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


export function showEntityForm(options: EntityFormOptions): Promise<EntityFormValues | undefined> {
  const panel = formPanelFor(options);
  const unregister = mountForm(panel, options);

  return new Promise((resolve) => {
    let settled = false;
    // eslint-disable-next-line complexity
    panel.webview.onDidReceiveMessage(async (message: FormMessage) => {
      if (answerRoundTrip(panel, message)) {
        return;
      }
      if (message.type === 'splitCommand') {
        void splitAndDescribe(panel, message.text ?? '');
        return;
      }
      if (message.type === 'zoom') {
        await applyZoomDelta(message.zoomDelta ?? 0);
        return;
      }
      if (message.type === 'command') {
        // Only the commands the footer itself offers — a page cannot ask the host to run
        // anything else. The form stays open; the command works on the same entry.
        await runDoorCommand(message.command ?? '', options);
        return;
      }
      if (message.type === 'cardValues') {
        // Answered on REQUEST rather than pushed on mount: the page asks once its listener is
        // attached, so there is no window in which the values are posted at nobody.
        void panel.webview.postMessage({
          type: 'paymentValues',
          fields: cardInputsFrom(options.initialPayment ?? {}),
        });
        return;
      }
      if (message.type === 'generate') {
        answerGenerate(panel, message);
        return;
      }
      if (message.type === 'cancel') {
        panel.dispose();
        return;
      }
      if (message.type === 'save' && message.data !== undefined && (await confirmInvalidSave(message.data, options))) {
        settled = true;
        resolve(toValues(message.data, options));
        panel.dispose();
      }
    });
    panel.onDidDispose(() => {
      unregister();
      if (!settled) {
        resolve(undefined);
      }
    });
  });
}

/**
 * The round-trips: the page asks, the host answers, and nothing is stored on either side.
 *
 * <p>Three messages with one shape, so they live in one place. The highlighter's own comment
 * already stated the rule the other two follow — one implementation, host-side, that a unit test
 * can reach, rather than a copy inside a template string where nothing can check it. Gathering
 * them also keeps `showEntityForm` under the fifty-line ceiling it was sitting exactly on.</p>
 *
 * <p>Returns whether the message WAS a round-trip, so the caller's dispatch stays a single line
 * and the list of them stays here.</p>
 */
const ROUND_TRIPS: Record<string, (message: FormMessage) => Record<string, unknown>> = {
  highlight: (message) => highlighted(message),
  // The number never leaves the page for this — only the ANSWER comes back. `brandOf` is pure and
  // could have run in the webview, but the page is a template string where nothing can be unit
  // tested, which is the rule the highlighter's own comment states.
  cardTyped: (message) => ({ type: 'cardBrand', text: brandHint(message.number ?? '') }),
  configFields: (message) => ({ type: 'configFieldsResult', ...fieldsAnswer(message) }),
  configFieldEdit: (message) => ({ type: 'configBody', text: editedConfigBody(message) }),
  // The seed the page gets back is one it is about to hold anyway — the form is where a person
  // types seeds. The picture itself is kept on neither side.
  qrImage: (message) => ({
    type: 'qrResult',
    ...readPastedQr({ gray: message.gray ?? '', width: message.width ?? 0, height: message.height ?? 0 }),
  }),
};

function answerRoundTrip(panel: vscode.WebviewPanel, message: FormMessage): boolean {
  const answer = ROUND_TRIPS[message.type]?.(message);
  if (answer === undefined) {
    return false;
  }
  void panel.webview.postMessage(answer);
  return true;
}

/** Its own function so the two defaults above do not count against the dispatch's complexity. */
function highlighted(message: FormMessage): { type: string; html: string; hlTarget: string } {
  return {
    type: 'highlighted',
    html: highlightScript(message.text ?? '', message.lang ?? 'other'),
    // Echoed verbatim so two overlay editors on one page cannot swap answers (T17).
    hlTarget: message.hlTarget ?? 'scriptHl',
  };
}

/**
 * Ask before saving a config that does not parse — and let Cancel mean Cancel.
 *
 * <p>The first shape of this reported the fact AFTERWARDS, in a toast, once the form had closed:
 * correct, and useless, because by then the only thing to do about it was reopen the entry. Asked
 * here the form is still open and the cursor is still where it was.</p>
 *
 * <p>Returning `false` simply does not settle the promise, so the panel stays exactly as it was.
 * Nothing is written and nothing is lost.</p>
 */
async function confirmInvalidSave(
  data: Record<string, unknown>,
  options: EntityFormOptions,
): Promise<boolean> {
  const found = unsavedConfigProblem(data, options);
  if (found === undefined) {
    return true;
  }
  const answer = await vscode.window.showWarningMessage(
    invalidSaveConfirmation(str(data, 'name').trim(), found.format, found.problem),
    { modal: true },
    'Save anyway',
  );
  return answer === 'Save anyway';
}

function unsavedConfigProblem(
  data: Record<string, unknown>,
  options: EntityFormOptions,
): { format: ConfigFormat; problem: ConfigProblem } | undefined {
  const format = str(data, 'configFormat');
  if (!isConfigForm(data, options) || !isConfigFormat(format)) {
    return undefined;
  }
  const problem = describeConfigProblem(format, str(data, 'configBody'));
  return problem === undefined ? undefined : { format, problem };
}

/** The form's kind, from the locked kind or the selector — the same answer `toValues` reaches. */
function isConfigForm(data: Record<string, unknown>, options: EntityFormOptions): boolean {
  return (options.lockedKind ?? str(data, 'entityType')) === 'config';
}

/**
 * What the page should show: the rows, or WHY there are none.
 *
 * <p>Three answers, not two. Returning a bare "no rows" made a JSON config with one missing brace
 * report "No field view for this format" — false about JSON, and silent about the brace. The
 * problem travels with the answer so the tab can name the line instead of the format.</p>
 *
 * <p>Spans are deliberately NOT sent. The page would then hold offsets into a document it can go
 * on editing in the Raw tab, and a stale offset splices into the wrong place — silently, and in a
 * file of secrets. Recomputing from the text the page just sent is always consistent with it.</p>
 *
 * <p>`null` rather than `undefined` throughout: this crosses a `postMessage` boundary, where
 * `undefined` does not survive JSON and arrives as a missing property.</p>
 */
interface FieldsAnswer {
  kind: string;
  rows: { path: string; value: string }[] | null;
  problem: ConfigProblem | null;
}

/**
 * What the page should show: the rows, or WHY there are none.
 *
 * <p>Three answers, not two. Returning a bare "no rows" made a JSON config with one missing brace
 * report "No field view for this format" — false about JSON, and silent about the brace. The
 * problem travels with the answer so the tab can name the line instead of the format.</p>
 *
 * <p>Spans are deliberately NOT sent. The page would then hold offsets into a document it can go
 * on editing in the Raw tab, and a stale offset splices into the wrong place — silently, and in a
 * file of secrets. Recomputing from the text the page just sent is always consistent with it.</p>
 *
 * <p>`null` rather than `undefined` throughout: this crosses a `postMessage` boundary, where
 * `undefined` does not survive JSON and arrives as a missing property.</p>
 */
interface FieldsAnswer {
  kind: string;
  rows: { path: string; value: string }[] | null;
  problem: ConfigProblem | null;
}

function fieldsAnswer(message: FormMessage): FieldsAnswer {
  const format = message.lang ?? '';
  const body = message.text ?? '';
  return isConfigFormat(format)
    ? answerFor(format, body)
    : { kind: 'noView', rows: null, problem: null };
}

function answerFor(format: ConfigFormat, body: string): FieldsAnswer {
  const outcome = fieldsOutcome(format, body);
  return {
    kind: outcome.kind,
    rows: outcome.kind === 'rows' ? rowsOf(outcome.fields) : null,
    // Sent whatever the outcome, because the page shows it beside the Contents box on BOTH tabs:
    // a body that does not parse must say so while you are looking at the text, not only after
    // you go looking for the rows.
    problem: describeConfigProblem(format, body) ?? null,
  };
}

function rowsOf(fields: readonly ConfigField[]): { path: string; value: string }[] {
  return fields.map(({ path, value }) => ({ path, value }));
}

/** The rows for one message's format and body, or nothing when that format has no field view. */
function fieldsOf(message: FormMessage, body: string): readonly ConfigField[] | undefined {
  const format = message.lang ?? '';
  return isConfigFormat(format) ? configFields(format, body) : undefined;
}

/** The document with one row's value spliced in — or unchanged, if that row is no longer there. */
function editedConfigBody(message: FormMessage): string {
  const body = message.text ?? '';
  const field = fieldNamed(message, body);
  return field === undefined
    ? body
    : withFieldValues(body, [{ field, value: message.value ?? '' }]);
}

function fieldNamed(message: FormMessage, body: string): ConfigField | undefined {
  return (fieldsOf(message, body) ?? []).find((field) => field.path === message.path);
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

/**
 * The webview's posted form into the values the caller stores.
 *
 * <p>Exported for its test: this is where a field is kept or scrubbed by kind, and the one-time
 * code gate lived here untested until 0.92 while a second, disagreeing copy of the same rule sat
 * in `formSections.ts`. The size and complexity below are pre-existing debt the directive has
 * always covered — it stays ADJACENT to the function, because a doc block between the two
 * detaches it and surfaces 108 lines of it at once.</p>
 */
// eslint-disable-next-line complexity, max-lines-per-function
export function toValues(data: Record<string, unknown>, options: EntityFormOptions): EntityFormValues {
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
  const isConfig = kind === 'config';
  const isPayment = kind === 'payment';
  const paymentForm = str(data, 'paymentForm');
  const configFormat = str(data, 'configFormat');

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
  // Not scrubbed by kind, unlike every field around it: anything can depend on anything, so
  // switching an entity from `ssh` to `credential` must not silently drop what it needs.
  const dependsOnRows = readDependsOnRows(data);
  const dependsOn = normalizeDependsOn(
    dependsOnRows.map((row) => row.targetId),
    options.entityId,
  );
  // Both readers refuse rather than escape, exactly as the host and user fields do: what the
  // webview posts is data, and `sshOptions.ts` is where "is this usable" is decided.
  const forwards = readForwardRows(data);
  const tags = normalizeTags(str(data, 'tags').split(/\s+/));
  // Asked of `formSections.ts` rather than decided again here. The two used to be separate
  // rules that agreed by habit and had already stopped agreeing — a `config` passed this one and
  // had no section in the form. Since 0.92 every kind carries a seed, so nothing is scrubbed by a
  // change of kind any more; the explicit "Remove the stored seed" box is the only way out.
  const isTotpKind = kindCarriesTotp(kind);
  const totpParsed = isTotpKind ? parseTotpSecret(withSteamEncoder(str(data, 'totp'), bool(data, 'totpSteam'))) : undefined;
  const clearTotp = isTotpKind ? bool(data, 'clearTotp') : options.hasStoredTotp;
  const hasTotp = totpParsed !== undefined || (isTotpKind && options.hasStoredTotp && !clearTotp);

  return {
    details: {
      id: options.entityId,
      name: str(data, 'name').trim(),
      envBindings,
      hasTotp: hasTotp || undefined,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
      // Absent means "ask the folder"; present-and-empty means "decided here, and the answer is
      // nothing". The page sends `undefined` only while nobody has touched a switch on an entry
      // that had none — so opening a form and pressing Save never converts an inheriting entry
      // into one that has opted out.
      mcp: readMcpAccess(data.mcp),
      // Set by the create path when an agent makes an entry, and carried through every later
      // edit: a delete permission scoped to `own` needs to know which entries those are.
      mcpCreatedByAgent: options.initial?.mcpCreatedByAgent,
      // The entity's OWN colour is never edited here — it is set on whichever record is the
      // target of somebody else's dependency, by `dependsOnColors` above. Carrying it through
      // untouched is what keeps an edit from erasing a colour other rows are painted in.
      depColor: options.initial?.depColor,
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
      isPayment: isPayment || undefined,
      // Defaulted rather than left absent, for `configFormat`'s reason: a payment whose form is
      // unknown cannot be rendered, validated, or cleared on a switch, and every one of those would
      // read as a bug rather than as a field nobody filled in.
      paymentForm: isPayment ? (isPaymentForm(paymentForm) ? paymentForm : DEFAULT_PAYMENT_FORM) : undefined,
      isConfig: isConfig || undefined,
      // Defaulted to JSON rather than left absent: a config whose format is unknown cannot be
      // validated, materialised with the right extension, or parsed by a provider — and every
      // one of those failures would read as a bug rather than as a field nobody filled in.
      configFormat: isConfig ? (isConfigFormat(configFormat) ? configFormat : 'json') : undefined,
      configFileName: isConfig ? str(data, 'configFileName').trim() || undefined : undefined,
      isTerminal: isTerminal || undefined,
      command: isTerminal ? str(data, 'command').trim() || undefined : undefined,
      commandArgs: isTerminal && commandArgs !== undefined && commandArgs.length > 0 ? commandArgs : undefined,
      commandNote: isTerminal ? str(data, 'commandNote').trim() || undefined : undefined,
      notes: undefined, // notes now live in SecretStorage, never in metadata
    },
    newPassword: !isDb && password.length > 0 ? password : undefined,
    // A config has no password slot, so a stored one is invisible and uneditable — and, until this
    // line, enough to make the entry shareable. Scrubbed on write, exactly as a TOTP seed is when
    // an entity moves to a kind that cannot hold one.
    clearPassword: keepsPassword(kind) ? bool(data, 'clearPassword') : options.hasStoredPassword,
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
    newFields: kind === 'credential' ? pickFields({ login: str(data, 'login'), url: str(data, 'url') }) : undefined,
    // Sent whole and unconditionally for a config, so that emptying the box empties the document.
    // Every other secret here treats blank as "keep what is stored"; this one cannot, because the
    // form was prefilled with the stored text and blank is therefore a deliberate edit.
    newConfigBody: isConfig ? str(data, 'configBody') : undefined,
    // Every field guarded by `isPayment`, so a kind that is not one cannot write a payment record —
    // and, just as important, an entity converted AWAY from payment stops writing one. What it does
    // not do is clear the record it already has; that is S2.4's erase-on-switch, which asks first.
    newPayment: isPayment ? cardFieldsFrom(data) : undefined,
    newTotp: totpParsed?.uri,
    clearTotp,
    clearHostKey: bool(data, 'clearHostKey'),
    // Only the rows whose colour is one this build knows. A row posting an unrecognised key
    // still creates the RELATIONSHIP above — it just does not restamp the target's colour,
    // which is the safe half to drop.
    dependsOnColors: dependsOnRows.filter((row) => isDepColorKey(row.color)),
  };
}

/**
 * The dependency rows as the webview posts them: `{ targetId, color }`.
 *
 * <p>Read defensively like every other row list here — the payload crosses a webview boundary,
 * so a malformed row is dropped rather than trusted. The folder each row was picked through is
 * NOT read: it exists only to narrow the second dropdown, and storing it would be a second
 * source of truth for where an entity lives, going stale the first time one is moved.</p>
 */
