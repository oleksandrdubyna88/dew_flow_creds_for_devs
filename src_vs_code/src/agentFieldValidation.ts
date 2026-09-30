import { AGENT_FIELD_MAX_BYTES, AGENT_KINDS, AgentField, allowedFieldsSentence } from './agentKindFields';
import { normalizeArgs } from './commandLine';
import { EntityFields } from './entityFields';
import { normalizeTags } from './sshOptions';
import { CommandArg, EntityKind, EntityMetadata } from './types';

/**
 * What an agent sent in `fields`, checked against the kind the entry WILL have — and refused whole
 * when any of it is wrong.
 *
 * <p>Whole, because a half-accepted request is the defect this exists to fix: an agent that sent a
 * `host` for a terminal entry was not told, the host was stored, and the viewer drew an SSH command
 * for a PowerShell script. Now an unknown key, a wrong type, a bad enum word, a secret where a field
 * should be, or a missing required field each answer ONE sentence that names the kind's real fields
 * — and nothing is created, because this runs before anybody is asked to approve anything.</p>
 *
 * <p>Every field is also bounded: at most `AGENT_FIELD_MAX_BYTES` (64 KiB) of UTF-8 text, a list of rows
 * counted all together. A script, a note and a command line are copied WHOLE into the consent prompt and
 * the journal (plan gate, finding 3), so without a bound a field was as large as the request could carry
 * (code review of 2026-09-30, finding 2). Checked here, before anything is shown or stored.</p>
 *
 * <p>The kind is decided first, by the folder (`kindFor`), so what is checked is the kind the entry
 * will be rather than the one the agent named. Pure: no `vscode`, no storage.</p>
 */

/** The values a validated request becomes, by where each is stored. */
export interface AgentValues {
  /** What lands on the record, by record key — only keys the kind's table names. */
  details: Partial<EntityMetadata>;
  /** A credential's login and URL, when sent. */
  fields?: EntityFields;
  notes?: string;
}

export type FieldsVerdict = { ok: true; values: AgentValues } | { ok: false; message: string };

/**
 * The words that are a SECRET wherever they appear, and are refused inside `fields` by name.
 *
 * <p>Refused with their own sentence rather than as "not a field", because the agent that writes
 * `fields.password` is one step from the right call and a generic refusal would send it to the help
 * instead of to `secret`.</p>
 */
const SECRET_KEYS: ReadonlySet<string> = new Set([
  'secret',
  'secretKind',
  'password',
  'privateKey',
  'vpnConfig',
  'dbConnection',
  'configBody',
  'totp',
]);

/** What the form defaults when the field is blank — mirrored so an agent's entry opens the same way. */
const KIND_DEFAULTS: Partial<Record<EntityKind, Partial<EntityMetadata>>> = {
  script: { scriptLanguage: 'bash' },
  config: { configFormat: 'json' },
};

export function validateAgentFields(kind: EntityKind, fields: Readonly<Record<string, unknown>>): FieldsVerdict {
  const refusal = AGENT_KINDS[kind].notCreatable;
  if (refusal !== undefined) {
    return { ok: false, message: refusal };
  }
  const read = readEach(kind, fields);
  if (!read.ok) {
    return read;
  }
  const missing = AGENT_KINDS[kind].fields.find((field) => field.required === true && !(field.name in read.accepted));
  return missing === undefined
    ? { ok: true, values: assemble(kind, read.accepted) }
    : { ok: false, message: `A ${kind} entry needs \`${missing.name}\`. ${allowedFieldsSentence(kind)}` };
}

type Accepted = Record<string, unknown>;

/** Every key checked in turn; the first wrong one is the answer. A blank value is simply absent. */
function readEach(kind: EntityKind, fields: Readonly<Record<string, unknown>>): { ok: true; accepted: Accepted } | { ok: false; message: string } {
  const accepted: Accepted = {};
  for (const [key, raw] of Object.entries(fields)) {
    const verdict = readOne(kind, key, raw);
    if (!verdict.ok) {
      return verdict;
    }
    if (verdict.value !== undefined) {
      accepted[key] = verdict.value;
    }
  }
  return { ok: true, accepted };
}

type OneVerdict = { ok: true; value: unknown } | { ok: false; message: string };

function readOne(kind: EntityKind, key: string, raw: unknown): OneVerdict {
  if (SECRET_KEYS.has(key)) {
    return { ok: false, message: `\`${key}\` is a secret: send it as \`secret\`, or prefer \`secretKind\` so the window makes it.` };
  }
  const field = AGENT_KINDS[kind].fields.find((f) => f.name === key);
  if (field === undefined) {
    return { ok: false, message: `\`${key}\` is not a field of a ${kind} entry. ${allowedFieldsSentence(kind)}` };
  }
  const read = READERS[field.type](raw, field);
  return read.ok ? withinLimit(key, read.value) : { ok: false, message: `\`${key}\` ${read.why}. ${allowedFieldsSentence(kind)}` };
}

/** The value as read, or the refusal that names the field and the limit — measured on what would be kept. */
function withinLimit(key: string, value: unknown): OneVerdict {
  const bytes = textBytes(value);
  return bytes <= AGENT_FIELD_MAX_BYTES
    ? { ok: true, value }
    : {
      ok: false,
      message: `\`${key}\` is too large: ${bytes} bytes, and a field may hold at most ${AGENT_FIELD_MAX_BYTES} bytes of UTF-8 text (64 KiB). Nothing was created — send a shorter one.`,
    };
}

/** The UTF-8 size of every string in a value: a text, a tag list, or rows with their names and notes. */
function textBytes(value: unknown): number {
  if (typeof value === 'string') {
    return Buffer.byteLength(value, 'utf8');
  }
  return typeof value === 'object' && value !== null
    ? Object.values(value).reduce((sum: number, item: unknown) => sum + textBytes(item), 0)
    : 0;
}

type Read = { ok: true; value: unknown } | { ok: false; why: string };

const READERS: Readonly<Record<AgentField['type'], (raw: unknown, field: AgentField) => Read>> = {
  string: readString,
  integer: readInteger,
  enum: readEnum,
  args: (raw) => readRows(raw, false),
  vars: (raw) => readRows(raw, true),
};

/** Text, trimmed unless the field is a body; blank is absent. Tags become their word list here. */
function readString(raw: unknown, field: AgentField): Read {
  if (typeof raw !== 'string') {
    return { ok: false, why: 'must be a string' };
  }
  if (raw.trim().length === 0) {
    return { ok: true, value: undefined };
  }
  return field.name === 'tags' ? readTags(raw) : { ok: true, value: keptOrTrimmed(raw, field) };
}

/** A body is kept exactly as sent — a script's leading whitespace is part of the script. */
function keptOrTrimmed(raw: string, field: AgentField): string {
  return field.multiline === true ? raw : raw.trim();
}

/** The one string field whose record is a list: the words, each a safe label, or a refusal. */
function readTags(raw: string): Read {
  const tags = normalizeTags(raw.split(/\s+/));
  return tags.length > 0
    ? { ok: true, value: tags }
    : { ok: false, why: 'must be one or more labels of letters, digits, dot, dash or underscore, at most 24 characters each' };
}

function readInteger(raw: unknown): Read {
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0
    ? { ok: true, value: raw }
    : { ok: false, why: 'must be a positive integer' };
}

function readEnum(raw: unknown, field: AgentField): Read {
  const values = field.values ?? [];
  return typeof raw === 'string' && values.includes(raw)
    ? { ok: true, value: raw }
    : { ok: false, why: `must be one of: ${values.join(', ')}` };
}

/**
 * Rows on the wire are `{ value, note?, enabled? }` — `enabled` rather than the record's `disabled`,
 * because a request that says what it wants reads better than one that says what it does not.
 * A script's rows also carry the `name` its `${NAME}` refers to.
 */
function readRows(raw: unknown, named: boolean): Read {
  const shape = named ? '{ name, value, note?, enabled? }' : '{ value, note?, enabled? }';
  const rows = Array.isArray(raw) ? readAllRows(raw, named) : undefined;
  return rows === undefined ? { ok: false, why: `must be an array of ${shape}` } : { ok: true, value: nonEmpty(rows) };
}

/** Every row, or `undefined` the moment one is malformed — a list is accepted whole or not at all. */
function readAllRows(raw: readonly unknown[], named: boolean): CommandArg[] | undefined {
  const rows: CommandArg[] = [];
  for (const item of raw) {
    const row = readRow(item, named);
    if (row === undefined) {
      return undefined;
    }
    rows.push(row);
  }
  // Terminal args go through the form's own normaliser, which drops blank rows and empty notes.
  return named ? rows : normalizeArgs(rows);
}

/** An empty list is absent, not an empty field — the same rule the form's save applies. */
function nonEmpty(rows: CommandArg[]): CommandArg[] | undefined {
  return rows.length > 0 ? rows : undefined;
}

// eslint-disable-next-line complexity -- one row's four optional shapes, read once
function readRow(item: unknown, named: boolean): CommandArg | undefined {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    return undefined;
  }
  const r = item as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const wellFormed =
    typeof r.value === 'string' &&
    (r.note === undefined || typeof r.note === 'string') &&
    (r.enabled === undefined || typeof r.enabled === 'boolean') &&
    (!named || name.length > 0);
  if (!wellFormed) {
    return undefined;
  }
  return {
    ...(named ? { name } : {}),
    value: r.value as string,
    ...(typeof r.note === 'string' && r.note.trim().length > 0 ? { note: r.note.trim() } : {}),
    ...(r.enabled === false ? { disabled: true } : {}),
  };
}

/** Each accepted value to its store; the record gets the kind's defaults underneath. */
function assemble(kind: EntityKind, accepted: Accepted): AgentValues {
  const values: AgentValues = { details: { ...KIND_DEFAULTS[kind] } };
  for (const field of AGENT_KINDS[kind].fields) {
    if (field.name in accepted) {
      place(values, field, accepted[field.name]);
    }
  }
  return values;
}

function place(values: AgentValues, field: AgentField, value: unknown): void {
  if (field.store === 'notes') {
    values.notes = value as string;
  } else if (field.store === 'fields') {
    values.fields = { ...values.fields, [field.name]: value as string };
  } else {
    (values.details as Record<string, unknown>)[field.key ?? field.name] = value;
  }
}

/**
 * Whether `secretKind` can be honoured for this kind.
 *
 * <p>Only a password can be drawn here. A connection string, a VPN configuration, a private key or a
 * config body is a value with a shape the window cannot invent, so asking for one to be made is
 * refused before anybody is prompted — and the sentence says to send it as `secret` instead.</p>
 */
export function secretKindRefusal(kind: EntityKind, secretKind: string | undefined): string | undefined {
  const secret = AGENT_KINDS[kind].secret;
  if (secretKind === undefined || secret === undefined || secret.drawable) {
    return undefined;
  }
  return `A ${kind} entry's secret is its ${secret.label}, which cannot be generated here — send it as \`secret\`.`;
}
