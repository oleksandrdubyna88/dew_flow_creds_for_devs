import { describeError } from './describeError';
import { EntityMetadata, PortForward, TreeNode } from './types';
import { parseForward } from './sshOptions';

/**
 * Reading what other tools export, so moving in costs an afternoon rather than a weekend.
 *
 * <p>The audit put it plainly: migration cost is the main obstacle to adopting a tool with
 * sixty commands. Somebody with forty hosts in `~/.ssh/config` and a hundred logins in
 * Bitwarden will not retype them, and a manager they cannot move INTO is one they do not
 * try.</p>
 *
 * <p><b>Every importer answers the same shape</b> — `ImportedEntity[]`, which the caller turns
 * into real nodes with fresh ids. They are pure, they never touch the filesystem, and they
 * never throw on malformed input: a bad row is skipped and counted, because an import that
 * fails wholesale on line 300 of 400 is an import nobody finishes.</p>
 *
 * <p><b>KDBX is deliberately absent, and this is the honest place to say so.</b> A KeePass
 * database is AES/ChaCha20 over an Argon2 or AES-KDF key, with a compressed, optionally
 * inner-encrypted XML payload — a real format, not a file to parse in an afternoon, and Argon2
 * is not in Node. Doing it badly would be worse than not doing it: KeePass exports CSV and XML,
 * both of which land in the generic CSV path below. See `research/PLAN_import.md`.</p>
 */

export interface ImportedEntity {
  name: string;
  /** Folder to file it under; the caller creates it if needed. */
  folder?: string;
  /**
   * The `ProxyJump` host, by NAME.
   *
   * <p>A name rather than an id because ids are minted in `toTreeNodes`, which is also the only
   * place that can see every imported entity at once — so that is where the name becomes the
   * link. An unresolvable or ambiguous name stays unresolved; the note still records it.</p>
   */
  jumpHostName?: string;
  details: Omit<EntityMetadata, 'id'>;
  secrets: {
    password?: string;
    privateKey?: string;
    notes?: string;
    dbConnection?: string;
    totp?: string;
  };
}

export interface ImportResult {
  entities: ImportedEntity[];
  /** Rows that could not be read, with the reason — reported, never silently dropped. */
  skipped: string[];
  /** What the file was recognised as, for the confirmation the user sees before anything lands. */
  source: string;
}

const EMPTY_DETAILS: Omit<EntityMetadata, 'id'> = { name: '', isSshEnabled: false };

// ---- ~/.ssh/config ----------------------------------------------------------

/** Keywords this reader understands. Everything else on a Host block is ignored, not lost. */
interface SshHostBlock {
  host: string;
  hostName?: string;
  user?: string;
  port?: string;
  identityFile?: string;
  proxyJump?: string;
  forwards?: PortForward[];
}

/**
 * `~/.ssh/config` into SSH entities.
 *
 * <p>Wildcard hosts (`Host *`, `Host prod-*`) are skipped: they are settings that APPLY to
 * other hosts, not hosts you can connect to, and importing them would create entities whose
 * Connect button cannot work. They are counted in `skipped` so the number adds up.</p>
 *
 * <p>`ProxyJump` is carried into the notes rather than modelled: a jump host is a reference to
 * another entity, and inventing that link from a name during an import would guess at
 * something the reader can settle in a second. (`D7` is where that field belongs.)</p>
 */
/** One `keyword value` line, or nothing when it is blank, a comment, or malformed. */
function configLine(rawLine: string): { keyword: string; value: string } | undefined {
  const line = rawLine.trim();
  const match = line.startsWith('#') ? null : /^(\S+)\s+(.*)$/.exec(line);
  if (match === null) {
    return undefined;
  }
  return {
    keyword: match[1].toLowerCase(),
    value: match[2].trim().replace(/^["']|["']$/g, ''),
  };
}

export function parseSshConfig(text: string): ImportResult {
  const blocks: SshHostBlock[] = [];
  const skipped: string[] = [];
  let current: SshHostBlock | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const parsed = configLine(rawLine);
    if (parsed === undefined) {
      continue;
    }
    if (parsed.keyword === 'host') {
      current = startHost(parsed.value, blocks, skipped);
      continue;
    }
    applyKeyword(current, parsed.keyword, parsed.value);
  }

  return {
    source: 'OpenSSH config',
    skipped,
    entities: blocks.map(sshEntityFrom),
  };
}

function startHost(value: string, blocks: SshHostBlock[], skipped: string[]): SshHostBlock | undefined {
  // `Host a b` declares one block for several names; the first is the one to file it under.
  const names = value.split(/\s+/).filter((n) => n.length > 0);
  const name = names[0];
  if (name === undefined || name.includes('*') || name.includes('?')) {
    skipped.push(`Host ${value} — a pattern, not a host you can connect to`);
    return undefined;
  }
  const block: SshHostBlock = { host: name };
  blocks.push(block);
  return block;
}

function applyKeyword(block: SshHostBlock | undefined, keyword: string, value: string): void {
  if (block === undefined) {
    return;
  }
  const setters: Record<string, () => void> = {
    hostname: () => {
      block.hostName = value;
    },
    user: () => {
      block.user = value;
    },
    port: () => {
      block.port = value;
    },
    identityfile: () => {
      block.identityFile = value;
    },
    proxyjump: () => {
      block.proxyJump = value;
    },
    localforward: () => {
      addForward(block, 'local', value);
    },
    remoteforward: () => {
      addForward(block, 'remote', value);
    },
  };
  setters[keyword]?.();
}

/**
 * `LocalForward 5432 db.internal:5432` and `LocalForward 5432:db.internal:5432` are the same
 * rule written two ways, and `~/.ssh/config` files in the wild contain both. Anything that does
 * not parse is dropped rather than guessed at — the note still carries the original line.
 */
function addForward(block: SshHostBlock, kind: PortForward['kind'], value: string): void {
  const compact = value.trim().replace(/\s+/, ':');
  const forward = parseForward(kind, compact);
  if (forward !== undefined) {
    block.forwards = [...(block.forwards ?? []), forward];
  }
}

/** A port number, or nothing — a blank, a name or a negative is not one. */
function portOf(raw: string | undefined): number | undefined {
  const port = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(port) && port > 0 ? port : undefined;
}

function jumpNote(block: SshHostBlock): string | undefined {
  return block.proxyJump === undefined ? undefined : `ProxyJump ${block.proxyJump}`;
}

/**
 * The entity name a `ProxyJump` value points at.
 *
 * <p>`ProxyJump user@bastion:2222,second` names a chain; only the FIRST hop is linked, because
 * the rest is that host's own configuration and it will have been imported with it. The user and
 * port are stripped: what is being matched is the `Host` line, which carries neither.</p>
 */
function jumpHostNameOf(proxyJump: string | undefined): string | undefined {
  const first = (proxyJump ?? '').split(',')[0].trim();
  const usable = first.length > 0 && first !== 'none';
  return usable ? first.replace(/^[^@]*@/, '').replace(/:\d+$/, '') : undefined;
}

function sshEntityFrom(block: SshHostBlock): ImportedEntity {
  return {
    name: block.host,
    folder: 'Imported SSH',
    details: {
      ...EMPTY_DETAILS,
      name: block.host,
      isSshEnabled: true,
      // `Host` doubles as the address when there is no `HostName`, which is how short
      // aliases for real hostnames are written.
      host: block.hostName ?? block.host,
      user: block.user,
      port: portOf(block.port),
      sshKeyPath: block.identityFile,
      portForwards: block.forwards,
    },
    jumpHostName: jumpHostNameOf(block.proxyJump),
    secrets: { notes: jumpNote(block) },
  };
}

// ---- generic CSV (Bitwarden, KeePass, LastPass, Termius) ---------------------

/** RFC 4180 enough: quoted fields, doubled quotes inside them, newlines inside quotes. */
interface CsvState {
  rows: string[][];
  row: string[];
  field: string;
  quoted: boolean;
}

function endField(state: CsvState): void {
  state.row.push(state.field);
  state.field = '';
}

/** A row of nothing but empty cells is a blank line, not a record. */
function endRow(state: CsvState): void {
  if (state.row.some((cell) => cell.length > 0)) {
    state.rows.push(state.row);
  }
  state.row = [];
}

function isNewline(ch: string): boolean {
  return ch === '\r' || ch === '\n';
}

function stepNewline(state: CsvState, text: string, i: number): number {
  endField(state);
  endRow(state);
  return text[i] === '\r' && text[i + 1] === '\n' ? i + 2 : i + 1;
}

/** Inside quotes: everything is literal, and `""` is one quote. */
function stepQuoted(state: CsvState, text: string, i: number): number {
  const ch = text[i];
  if (ch !== '"') {
    state.field += ch;
    return i + 1;
  }
  if (text[i + 1] === '"') {
    state.field += '"';
    return i + 2;
  }
  state.quoted = false;
  return i + 1;
}

function stepPlain(state: CsvState, text: string, i: number): number {
  const ch = text[i];
  if (ch === '"') {
    state.quoted = true;
    return i + 1;
  }
  if (ch === ',') {
    endField(state);
    return i + 1;
  }
  if (isNewline(ch)) {
    return stepNewline(state, text, i);
  }
  state.field += ch;
  return i + 1;
}

export function parseCsv(text: string): string[][] {
  const state: CsvState = { rows: [], row: [], field: '', quoted: false };
  let i = 0;
  while (i < text.length) {
    i = state.quoted ? stepQuoted(state, text, i) : stepPlain(state, text, i);
  }
  endField(state);
  endRow(state);
  return state.rows;
}

/** Column names each tool uses for the same thing, lower-cased. */
const COLUMNS = {
  name: ['name', 'title', 'label', 'account', 'item', 'hostname_label'],
  username: ['username', 'user', 'login_username', 'login', 'user name'],
  password: ['password', 'login_password', 'pass'],
  url: ['url', 'login_uri', 'uri', 'website', 'address', 'hostname', 'host'],
  notes: ['notes', 'note', 'comments'],
  totp: ['totp', 'login_totp', 'otpauth', 'otp'],
  port: ['port'],
  folder: ['folder', 'group', 'grouping', 'category'],
};

function indexOfColumn(header: readonly string[], names: readonly string[]): number {
  return header.findIndex((cell) => names.includes(cell.trim().toLowerCase()));
}

/**
 * A CSV export from Bitwarden, KeePass, LastPass, 1Password or Termius.
 *
 * <p>One reader for all of them, because the differences are the column NAMES and nothing
 * else — five near-identical importers would be five places for the same bug. A file whose
 * header names nothing recognisable is refused with that as the reason, rather than importing
 * four hundred entities called `undefined`.</p>
 */
function columnIndex(header: readonly string[]): ColumnIndex {
  return {
    name: indexOfColumn(header, COLUMNS.name),
    username: indexOfColumn(header, COLUMNS.username),
    password: indexOfColumn(header, COLUMNS.password),
    url: indexOfColumn(header, COLUMNS.url),
    notes: indexOfColumn(header, COLUMNS.notes),
    totp: indexOfColumn(header, COLUMNS.totp),
    port: indexOfColumn(header, COLUMNS.port),
    folder: indexOfColumn(header, COLUMNS.folder),
  };
}

/**
 * Whether this header is one we can read at all.
 *
 * <p>A title or a password is the minimum: with neither, every row would import as an entity
 * called `undefined` holding nothing, which is worse than refusing the file.</p>
 */
function recognisableHeader(at: ColumnIndex): boolean {
  return at.name >= 0 || at.password >= 0;
}

export function parseCsvExport(text: string, source = 'CSV export'): ImportResult {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const at = columnIndex(header);
  if (!recognisableHeader(at)) {
    return {
      source,
      entities: [],
      skipped: [`the header names neither a title nor a password column: ${header.join(', ')}`],
    };
  }
  const skipped: string[] = [];
  const entities = rows.slice(1).flatMap((row, index) => csvEntity(row, at, index, skipped));
  return { source, entities, skipped };
}

type ColumnIndex = Record<string, number>;

function cell(row: readonly string[], index: number): string | undefined {
  const value = (index >= 0 ? row[index] : '') ?? '';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function csvDetails(row: readonly string[], at: ColumnIndex, name: string): Omit<EntityMetadata, 'id'> {
  return {
    ...EMPTY_DETAILS,
    name,
    user: cell(row, at.username),
    host: hostFrom(cell(row, at.url)),
    port: portOf(cell(row, at.port)),
    // An entry with a host is an SSH connection only if somebody says so; a URL from a
    // password manager is a website. Left off, and the reader switches the type if they
    // want the Connect button.
    isSshEnabled: false,
    hasTotp: cell(row, at.totp) !== undefined || undefined,
  };
}

function csvEntity(
  row: readonly string[],
  at: ColumnIndex,
  index: number,
  skipped: string[],
): ImportedEntity[] {
  const name = cell(row, at.name) ?? cell(row, at.url);
  if (name === undefined) {
    skipped.push(`row ${index + 2} — no name and no address to call it by`);
    return [];
  }
  return [
    {
      name,
      folder: cell(row, at.folder) ?? 'Imported',
      details: csvDetails(row, at, name),
      secrets: {
        password: cell(row, at.password),
        notes: cell(row, at.notes),
        totp: cell(row, at.totp),
      },
    },
  ];
}

/** A bare host out of whatever the export called an address. */
export function hostFrom(url: string | undefined): string | undefined {
  if (url === undefined) {
    return undefined;
  }
  const withoutScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const host = withoutScheme.split('/')[0].split('@').pop() ?? '';
  const bare = host.split(':')[0];
  return bare.length > 0 ? bare : undefined;
}

// ---- 1Password / Bitwarden JSON ---------------------------------------------

interface JsonItem {
  name?: string;
  title?: string;
  login?: { username?: string; password?: string; totp?: string; uris?: Array<{ uri?: string }> };
  notes?: string;
  folderId?: string;
  type?: number;
}

/**
 * A Bitwarden `.json` export (and 1Password's, which is close enough in the fields that
 * matter).
 *
 * <p>Only login items are taken. A Bitwarden card or identity has no analogue here, and
 * inventing one would produce entities whose every field is blank — they are counted as
 * skipped so the totals are honest.</p>
 */
export function parseJsonExport(text: string, source = 'Bitwarden/1Password JSON'): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { source, entities: [], skipped: [`the file is not valid JSON: ${describeError(error)}`] };
  }
  const items = itemsOf(parsed);
  if (items === undefined) {
    return { source, entities: [], skipped: ['no "items" array — this is not an export this reader knows'] };
  }
  const skipped: string[] = [];
  const entities = items.flatMap((item, index) => jsonEntity(item, index, skipped));
  return { source, entities, skipped };
}

function itemsOf(parsed: unknown): JsonItem[] | undefined {
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const items = (parsed as { items?: unknown }).items;
  return Array.isArray(items) ? (items as JsonItem[]) : undefined;
}

type JsonLogin = NonNullable<JsonItem['login']>;

function jsonName(item: JsonItem): string | undefined {
  const name = item.name ?? item.title;
  return name === undefined || name.length === 0 ? undefined : name;
}

function firstUri(login: JsonLogin): string | undefined {
  return login.uris?.[0]?.uri;
}

function jsonDetails(login: JsonLogin, name: string): Omit<EntityMetadata, 'id'> {
  return {
    ...EMPTY_DETAILS,
    name,
    user: login.username,
    host: hostFrom(firstUri(login)),
    isSshEnabled: false,
    hasTotp: login.totp !== undefined || undefined,
  };
}

function jsonEntity(item: JsonItem, index: number, skipped: string[]): ImportedEntity[] {
  const name = jsonName(item);
  if (name === undefined) {
    skipped.push(`item ${index + 1} — no name`);
    return [];
  }
  const login = item.login;
  if (login === undefined) {
    skipped.push(`"${name}" — not a login item (a card, an identity or a note)`);
    return [];
  }
  return [
    {
      name,
      folder: 'Imported',
      details: jsonDetails(login, name),
      secrets: { password: login.password, notes: item.notes, totp: login.totp },
    },
  ];
}


// ---- picking a reader --------------------------------------------------------

/** What this text looks like, by content rather than by file extension. */
function looksJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

/** A `Host` line and no commas, or a file actually called `config` — the name breaks the tie. */
function looksSshConfig(text: string, fileName: string): boolean {
  const named = /(^|[\\/])(ssh[_-]?)?config$/i.test(fileName);
  return named || (/^host\s+\S+/im.test(text) && !text.includes(','));
}

export function detectFormat(text: string, fileName = ''): 'ssh-config' | 'json' | 'csv' {
  if (looksJson(text)) {
    return 'json';
  }
  return looksSshConfig(text, fileName) ? 'ssh-config' : 'csv';
}

/** Read whatever this is, choosing the reader by what the content looks like. */
export function parseImport(text: string, fileName = ''): ImportResult {
  const format = detectFormat(text, fileName);
  if (format === 'json') {
    return parseJsonExport(text);
  }
  return format === 'ssh-config' ? parseSshConfig(text) : parseCsvExport(text);
}

/** The nodes an import becomes — ids are assigned by the caller, never taken from the file. */
/**
 * Turn each `ProxyJump` NAME into the id of the entity that now carries it.
 *
 * <p>An AMBIGUOUS name — two imported entities called the same thing — is left UNLINKED rather
 * than guessed at, the same rule `creds://` references follow and for the same reason: a wrong
 * guess here routes a connection through a machine nobody chose.</p>
 */
function linkJumpHosts(made: Array<{ jumpHostName?: string; node: { id: string; name: string; details: EntityMetadata } }>): void {
  const byName = uniqueIdsByName(made.map(({ node }) => node));
  for (const entry of made) {
    linkOne(entry, byName.get(entry.jumpHostName ?? ''));
  }
}

/** Link one entity to its jump host, unless the name was ambiguous, absent, or itself. */
function linkOne(
  entry: { node: { id: string; details: EntityMetadata } },
  target: string | undefined,
): void {
  if (target !== undefined && target !== entry.node.id) {
    entry.node.details = { ...entry.node.details, jumpHostEntityId: target };
  }
}

/** Name to id, and nothing for a name more than one entity claims — ambiguity, not a winner. */
function uniqueIdsByName(
  nodes: ReadonlyArray<{ id: string; name: string }>,
): Map<string, string | undefined> {
  const byName = new Map<string, string | undefined>();
  for (const node of nodes) {
    byName.set(node.name, byName.has(node.name) ? undefined : node.id);
  }
  return byName;
}

export function toTreeNodes(
  entities: readonly ImportedEntity[],
  newId: () => string,
  parentFor: (folder: string | undefined) => string | null,
): Array<{ node: TreeNode; secrets: ImportedEntity['secrets'] }> {
  const made = entities.map((entity) => {
    const id = newId();
    return {
      jumpHostName: entity.jumpHostName,
      secrets: entity.secrets,
      node: {
        id,
        name: entity.name,
        type: 'entity' as const,
        parentId: parentFor(entity.folder),
        details: { ...entity.details, id, name: entity.name } as EntityMetadata,
      },
    };
  });

  linkJumpHosts(made);
  return made.map(({ node, secrets }) => ({ node, secrets }));
}
