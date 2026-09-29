import { CONFIG_FORMATS } from './configFormat';
import { OS_NAMES } from './hostShell';
import { DB_TYPES, ENTITY_KINDS, ENTITY_KIND_LABELS, EntityKind, EntityMetadata, VPN_TYPES } from './types';

/**
 * What an agent may SET on an entry, kind by kind — the one table every agent-facing answer reads.
 *
 * <p>The case that produced it (2026-09-29): an agent was asked to store two PowerShell commands in
 * a Terminal folder, and the tool it had took a `name`, a `kind`, a `secret` and a `host`. It put
 * the only thing it held — the API endpoint — into `host`, the window stored a host on a kind that
 * has none, and the viewer drew an <i>SSH command</i> for it. Nothing had told the agent what a
 * Terminal entry IS, and nothing had refused what it sent.</p>
 *
 * <p><b>The rule is derived, not decided here.</b> A kind's list is the set of fields the FORM keeps
 * for that kind in `toValues` (`entityFormPanel.ts`), intersected with what an agent may set at all.
 * `agentKindFields.test.ts` drives the real `toValues` with every field here and asserts the two
 * agree in both directions — a field listed that the form would scrub, or a field the form keeps
 * that is not listed, is a red test. That is what stops this table and the form drifting the way the
 * two kind lists in the relay's descriptions already had.</p>
 *
 * <p><b>What is absent is absent on purpose (O4).</b> The agent-access switches, the consent
 * cadence, the agent-created mark, the PIN marks, the export mark, lifetimes, dependencies and
 * their colours, the jump host, port forwards, agent forwarding, the pinned host key, the linked
 * key and launcher entries, attachments, images, dates and version vectors are not fields an agent
 * may set. They are not listed as forbidden; they are simply not here, so no answer built from this
 * table can name them. The test pins that with a deny-list.</p>
 *
 * <p>`Record<EntityKind, …>` makes a tenth kind without an entry a compile error rather than a
 * kind an agent is silently told nothing about. Pure — no `vscode`, no storage.</p>
 */

/** The JSON shape a field's value takes on the wire. */
export type AgentFieldType = 'string' | 'integer' | 'enum' | 'args' | 'vars';

export interface AgentField {
  /** The request key inside `fields`, e.g. `command`. */
  readonly name: string;
  readonly type: AgentFieldType;
  /** The permitted words, for an `enum`. */
  readonly values?: readonly string[];
  readonly required?: true;
  /** One line, for the folder answer. */
  readonly summary: string;
  /** The paragraph for the kind help. */
  readonly help: string;
  /** A value that passes, used in the example request and by the table test. */
  readonly example: unknown;
  /** The record key it lands on, when that differs from `name` (`args` → `commandArgs`). */
  readonly key?: keyof EntityMetadata;
  /** Where it is stored when not on the record: the login/URL fields, or the notes. */
  readonly store?: 'fields' | 'notes';
}

/** The one secret a kind holds, and the slot it goes to. Never inside `fields`. */
export interface AgentSecret {
  readonly slot: 'password' | 'privateKey' | 'vpnConfig' | 'dbConnection' | 'configBody';
  /** What a person calls it: "password", "private key", "connection string" … */
  readonly label: string;
  readonly help: string;
  /** Only a password can be MADE here (`secretKind`); every other slot arrives as `secret`. */
  readonly drawable: boolean;
}

export interface AgentKind {
  readonly label: string;
  readonly summary: string;
  readonly fields: readonly AgentField[];
  /** Absent for a kind an agent cannot create at all. */
  readonly secret?: AgentSecret;
  /** Why an agent cannot create this kind, when it cannot (owner's decision D-A for payment). */
  readonly notCreatable?: string;
}

const HOST: AgentField = {
  name: 'host',
  type: 'string',
  required: true,
  summary: 'the address to connect to',
  help: 'The host name or IP address the connection goes to, e.g. `app-03.internal`.',
  example: 'app-03.internal',
};

const VPN_HOST: AgentField = { ...HOST, required: undefined, summary: 'the VPN endpoint, if the config does not carry it' };

const USER: AgentField = {
  name: 'user',
  type: 'string',
  summary: 'the login name',
  help: 'The user name to log in as. Left out, the person\'s own is used.',
  example: 'deploy',
};

const PORT: AgentField = {
  name: 'port',
  type: 'integer',
  summary: 'the port, when not the default',
  help: 'The TCP port, as a number. Left out, the protocol\'s default is used.',
  example: 22,
};

const PUBLIC_KEY: AgentField = {
  name: 'publicKey',
  type: 'string',
  summary: 'the public half of the key',
  help: 'The public key, one line as `ssh-ed25519 AAAA… comment`. Not a secret; it is what goes into `authorized_keys`.',
  example: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample deploy@ci',
};

const SSH_KEY_PATH: AgentField = {
  name: 'sshKeyPath',
  type: 'string',
  summary: 'the path of a key file on this machine',
  help: 'The path of a private key file already on this machine, e.g. `~/.ssh/id_ed25519`, when the key is not stored in the vault.',
  example: '~/.ssh/id_ed25519',
};

const TAGS: AgentField = {
  name: 'tags',
  type: 'string',
  summary: 'free labels, space-separated',
  help: 'Labels shown on the row and matched by the filter, separated by spaces: `production eu-west`. Letters, digits, dot, dash and underscore only.',
  example: 'production eu-west',
};

const NOTES: AgentField = {
  name: 'notes',
  type: 'string',
  store: 'notes',
  summary: 'free-text notes',
  help: 'Free text the person sees on the entry. Stored sealed like a secret, so it is never listed back to you.',
  example: 'Provisioned by the deploy agent on 2026-09-29.',
};

const LOGIN: AgentField = {
  name: 'login',
  type: 'string',
  store: 'fields',
  summary: 'the login name',
  help: 'The user name, email or account id the password belongs to.',
  example: 'svc-billing@example.com',
};

const URL: AgentField = {
  name: 'url',
  type: 'string',
  store: 'fields',
  summary: 'where the login is used',
  help: 'The address the credential is for, e.g. `https://console.example.com`.',
  example: 'https://console.example.com',
};

const VPN_TYPE: AgentField = {
  name: 'vpnType',
  type: 'enum',
  values: VPN_TYPES,
  summary: `the VPN protocol (${VPN_TYPES.join(', ')})`,
  help: 'Which VPN this is, so the window knows how to start it from the config.',
  example: 'wireguard',
};

const VPN_CONFIG_FILE_NAME: AgentField = {
  name: 'vpnConfigFileName',
  type: 'string',
  summary: 'the config file\'s name, e.g. wg0.conf',
  help: 'The file name the configuration is written to when the VPN is started, e.g. `wg0.conf`. The configuration itself is the `secret`.',
  example: 'wg0.conf',
};

const DB_TYPE: AgentField = {
  name: 'dbType',
  type: 'enum',
  values: DB_TYPES,
  summary: `the engine (${DB_TYPES.join(', ')})`,
  help: 'Which database engine, so the right client is started for it.',
  example: 'postgres',
};

const COMMAND: AgentField = {
  name: 'command',
  type: 'string',
  required: true,
  summary: 'the base command',
  help: 'The command itself, e.g. `aws sso login` or `pwsh -File check-quota.ps1`. Its arguments go in `args`, one per row; the line the person runs is `command` followed by every enabled arg.',
  example: 'aws sso login',
};

const ARGS: AgentField = {
  name: 'args',
  type: 'args',
  key: 'commandArgs',
  summary: 'arguments, one per row: { value, note?, enabled? }',
  help: 'The arguments, one object per row: `value` is the word as typed, `note` says what it is for, and `enabled: false` keeps a flag in the entry but out of the line. Rows rather than one string, because what nobody remembers a week later is which value belongs to which environment.',
  example: [
    { value: '--sso-session', note: 'the session name from the org\'s SSO setup' },
    { value: 'OD-org' },
  ],
};

const COMMAND_NOTE: AgentField = {
  name: 'commandNote',
  type: 'string',
  summary: 'what the command is for',
  help: 'One or two lines saying what the command does and when to run it, shown under it.',
  example: 'Signs in to the org\'s AWS accounts for the day.',
};

const TERMINAL_OS: AgentField = {
  name: 'terminalOs',
  type: 'enum',
  values: OS_NAMES,
  summary: `the OS it is written for (${OS_NAMES.join(', ')})`,
  help: 'The operating system the command is written for. Set, it runs in that system\'s own shell — PowerShell on Windows, bash on macOS and Linux — and is refused elsewhere. Left out, it runs in the person\'s default terminal.',
  example: 'linux',
};

const SCRIPT_LANGUAGE: AgentField = {
  name: 'scriptLanguage',
  type: 'string',
  summary: 'the language, e.g. bash, powershell, python',
  help: 'What the body is written in, for highlighting and for the interpreter that runs it: `bash`, `powershell`, `python`, `sql` … Left out, `bash`.',
  example: 'bash',
};

const SCRIPT: AgentField = {
  name: 'script',
  type: 'string',
  required: true,
  summary: 'the complete body',
  help: 'The whole script, exactly as it should run. Write `${NAME}` where a value from `vars` goes. The person sees every line of it before it is stored.',
  example: '#!/usr/bin/env bash\nset -euo pipefail\ncurl -fsS "https://api.example.com/quota?plan=${PLAN}"\n',
};

const VARS: AgentField = {
  name: 'vars',
  type: 'vars',
  key: 'scriptVars',
  summary: 'the ${NAME} values, one per row: { name, value, note?, enabled? }',
  help: 'The changeable parts of the body, one object per row: `name` is what `${NAME}` in the body refers to, `value` is what it becomes, `note` says what it is for, and `enabled: false` keeps a row without using it.',
  example: [{ name: 'PLAN', value: 'token-plan', note: 'which plan to ask about' }],
};

const CONFIG_FORMAT: AgentField = {
  name: 'configFormat',
  type: 'enum',
  values: CONFIG_FORMATS,
  summary: `the format (${CONFIG_FORMATS.join(', ')})`,
  help: 'What the body is validated and materialised as. Left out, `json`.',
  example: 'env',
};

const CONFIG_FILE_NAME: AgentField = {
  name: 'configFileName',
  type: 'string',
  summary: 'the file it is written as, e.g. appsettings.Development.json',
  help: 'The file name the config is materialised under, e.g. `appsettings.Development.json` or `.env`. The contents are the `secret`.',
  example: '.env',
};

const PASSWORD: AgentSecret = {
  slot: 'password',
  label: 'password',
  help: 'The password, sent as `secret` — or better, `secretKind: "password"` (or `"passphrase"`) so the window makes it and it never enters your context.',
  drawable: true,
};

const PRIVATE_KEY: AgentSecret = {
  slot: 'privateKey',
  label: 'private key',
  help: 'The private key, PEM text, sent as `secret`. Key pairs are not made here — it must already exist.',
  drawable: false,
};

const VPN_CONFIG: AgentSecret = {
  slot: 'vpnConfig',
  label: 'VPN configuration',
  help: 'The whole configuration file (the `.conf` or `.ovpn` text), sent as `secret`. It cannot be generated here.',
  drawable: false,
};

const DB_CONNECTION: AgentSecret = {
  slot: 'dbConnection',
  label: 'connection string',
  help: 'The full connection string, password included, sent as `secret`. It cannot be generated here — the listing later shows it with the password removed.',
  drawable: false,
};

const CONFIG_BODY: AgentSecret = {
  slot: 'configBody',
  label: 'config body',
  help: 'The whole file\'s text, sent as `secret`. It cannot be generated here, and it is never listed back to you.',
  drawable: false,
};

/** The owner's decision D-A (2026-09-29): a card number is not something an agent stores. */
export const PAYMENT_NOT_CREATABLE =
  'A payment entry cannot be created by an agent. Ask the person to add the card or account themselves in VS Code.';

export const AGENT_KINDS: Readonly<Record<EntityKind, AgentKind>> = {
  credential: {
    label: ENTITY_KIND_LABELS.credential.label,
    summary: 'A login: a password, with the login name and the address it is used at.',
    fields: [LOGIN, URL, NOTES],
    secret: PASSWORD,
  },
  ssh: {
    label: ENTITY_KIND_LABELS.ssh.label,
    summary: 'An SSH host: address, user and port, with the password as the secret. A key pair is its own sshkey entry.',
    fields: [HOST, USER, PORT, PUBLIC_KEY, SSH_KEY_PATH, TAGS, NOTES],
    secret: PASSWORD,
  },
  sshkey: {
    label: ENTITY_KIND_LABELS.sshkey.label,
    summary: 'An SSH key pair: the private key as the secret, the public half and its file path as fields.',
    fields: [PUBLIC_KEY, SSH_KEY_PATH, NOTES],
    secret: PRIVATE_KEY,
  },
  vpn: {
    label: ENTITY_KIND_LABELS.vpn.label,
    summary: 'A VPN: its protocol and endpoint, with the configuration file as the secret.',
    fields: [VPN_TYPE, VPN_HOST, USER, PORT, VPN_CONFIG_FILE_NAME, NOTES],
    secret: VPN_CONFIG,
  },
  db: {
    label: ENTITY_KIND_LABELS.db.label,
    summary: 'A database: its engine, with the connection string as the secret.',
    fields: [DB_TYPE, NOTES],
    secret: DB_CONNECTION,
  },
  terminal: {
    label: ENTITY_KIND_LABELS.terminal.label,
    summary: 'A saved command line: the command, its arguments one per row, a note, and the OS it runs on.',
    fields: [COMMAND, ARGS, COMMAND_NOTE, TERMINAL_OS, NOTES],
    secret: PASSWORD,
  },
  script: {
    label: ENTITY_KIND_LABELS.script.label,
    summary: 'A stored script: the language, the complete body, and the values its ${NAME} placeholders take.',
    fields: [SCRIPT_LANGUAGE, SCRIPT, VARS, NOTES],
    secret: PASSWORD,
  },
  config: {
    label: ENTITY_KIND_LABELS.config.label,
    summary: 'A whole config file kept out of git: its format and file name, with the body as the secret.',
    fields: [CONFIG_FORMAT, CONFIG_FILE_NAME, NOTES],
    secret: CONFIG_BODY,
  },
  payment: {
    label: ENTITY_KIND_LABELS.payment.label,
    summary: 'A payment instrument — a card or a bank account. Not creatable by an agent.',
    fields: [],
    notCreatable: PAYMENT_NOT_CREATABLE,
  },
};

/** The field lists alone — the shape the plan names, derived from the table above. */
export const AGENT_KIND_FIELDS: Readonly<Record<EntityKind, readonly AgentField[]>> = Object.fromEntries(
  ENTITY_KINDS.map((kind) => [kind, AGENT_KINDS[kind].fields]),
) as Record<EntityKind, readonly AgentField[]>;

/** One line per kind, for `creds_kinds`. */
export interface AgentKindSummary {
  kind: EntityKind;
  label: string;
  summary: string;
  /** False for a kind `creds_create` refuses outright. */
  creatable: boolean;
}

export function agentKinds(): readonly AgentKindSummary[] {
  return ENTITY_KINDS.map((kind) => ({
    kind,
    label: AGENT_KINDS[kind].label,
    summary: AGENT_KINDS[kind].summary,
    creatable: isAgentCreatable(kind),
  }));
}

export function isAgentCreatable(kind: EntityKind): boolean {
  return AGENT_KINDS[kind].notCreatable === undefined;
}

/** A field as the folder answer names it: enough to know what to send, not the whole paragraph. */
export interface FolderField {
  name: string;
  required: boolean;
  summary: string;
}

/**
 * What a typed folder tells an agent it may set.
 *
 * <p>The secret is listed here too, as `secret`, because it is the one thing every creation is
 * about — and it is the one field that must NOT go inside `fields`, which the summary says.</p>
 */
export function folderFieldsFor(kind: EntityKind): readonly FolderField[] {
  const own = AGENT_KINDS[kind].fields.map((field) => ({
    name: field.name,
    required: field.required === true,
    summary: field.summary,
  }));
  const secret = AGENT_KINDS[kind].secret;
  return secret === undefined
    ? own
    : [...own, { name: 'secret', required: false, summary: `the ${secret.label} — top level, never inside fields` }];
}

/** One field as `creds_kind_help` describes it. */
export interface HelpField {
  name: string;
  type: AgentFieldType;
  values?: readonly string[];
  required: boolean;
  /** True for the kind's secret: it travels as `secret` / `secretKind`, never inside `fields`. */
  secret: boolean;
  help: string;
}

/** Everything an agent may set on one kind — the answer to `creds_kind_help`. */
export interface KindHelp {
  kind: EntityKind;
  label: string;
  summary: string;
  creatable: boolean;
  /** Why not, when `creatable` is false. */
  refusal?: string;
  fields: HelpField[];
  /** A complete `creds_create` body that would be accepted, or absent when nothing would. */
  example?: Record<string, unknown>;
}

export function agentKindHelp(kind: EntityKind): KindHelp {
  const entry = AGENT_KINDS[kind];
  const refusal = entry.notCreatable;
  return {
    kind,
    label: entry.label,
    summary: entry.summary,
    creatable: refusal === undefined,
    ...(refusal === undefined ? {} : { refusal }),
    fields: [...entry.fields.map(helpField), ...secretHelpField(entry.secret)],
    ...(refusal === undefined ? { example: exampleRequest(kind, entry) } : {}),
  };
}

function helpField(field: AgentField): HelpField {
  return {
    name: field.name,
    type: field.type,
    ...(field.values === undefined ? {} : { values: field.values }),
    required: field.required === true,
    secret: false,
    help: field.help,
  };
}

function secretHelpField(secret: AgentSecret | undefined): HelpField[] {
  return secret === undefined
    ? []
    : [{ name: 'secret', type: 'string', required: false, secret: true, help: secret.help }];
}

/** A whole body an agent could send as it stands — every field's example, in the shape the wire takes. */
function exampleRequest(kind: EntityKind, entry: AgentKind): Record<string, unknown> {
  const fields = Object.fromEntries(entry.fields.map((field) => [field.name, field.example]));
  const secret = entry.secret?.drawable === true ? { secretKind: 'password' } : { secret: `<the ${entry.secret?.label ?? 'secret'}>` };
  return { name: `example ${kind}`, kind, ...secret, fields };
}

/**
 * The sentence every refusal about a field ends with: what this kind DOES take.
 *
 * <p>Said in full each time, because the agent reading it has just been told one thing is wrong and
 * needs the whole list to send the right thing next — not a second call to find out.</p>
 */
export function allowedFieldsSentence(kind: EntityKind): string {
  const fields = AGENT_KINDS[kind].fields;
  const named = fields.map((field) => (field.required === true ? `${field.name} (required)` : field.name)).join(', ');
  return fields.length === 0
    ? `A ${kind} entry takes no fields.`
    : `A ${kind} entry takes: ${named} — see creds_kind_help.`;
}
