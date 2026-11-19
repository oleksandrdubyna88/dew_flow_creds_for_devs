import * as fs from 'node:fs';
import * as path from 'node:path';
import { describeError } from './describeError';
import { DR1, DR7, DR8, vendorWords } from './bridgedDbSentences';
import { BRIDGED_DB_PROFILES, DbClient, DbProfileRow } from './bridgedDbProfile';
import { bridgedSshEnv } from './bridgedSshEnv';
import { CLIENT_CHECK_TIMEOUT_MS, ClientRunner } from './bridgedSshClient';
import { bridgedCallFolder, callKeyName } from './materializedKeys';
import { endedStage, notStarted } from './requestLife';
import { runSshExec } from './sshExecRunner';
import type { DbType } from './types';

/**
 * The database client check of a bridged `query` and the verdict it hands the launch builder (the E1.7 spec §S7.6, parent §4.11). Pure of `vscode`; the spawn that asks takes
 * its runner and its file system as parts.
 *
 * <p>The check asks one thing of one file: the client's version flag, under the environment of a bridged child, in a folder that holds nothing. What it answers is read against
 * the builds a served row lists, and the verdict is bound to the file that answered (§S7.6 items 3-5), so the query of the same call starts the same file by the same path.</p>
 */

/** `mysql` is two clients under one program name (Oracle's and MariaDB's), and so is `sqlcmd` (go-sqlcmd and the ODBC client). */
export type DbVendor = 'postgresql' | 'oracle' | 'mariadb' | 'go-sqlcmd' | 'odbc-sqlcmd';

/** The file a program word is on the bridged `PATH`: what is started, and what a kept verdict is bound to (§S7.6 items 3-5). */
export interface DbProgramFile {
  /** The bare word the walk looked for (`psql`). */
  readonly program: string;
  /** The path the walk found, and the path every spawn of the call starts: never its real path (N10). */
  readonly path: string;
  readonly realPath: string;
  readonly size: number;
  readonly mtimeMs: number;
  /** The file begins with `#!`: it starts another program, which the identity does not cover. */
  readonly launcher: boolean;
}

/** A client that answered its version with a build the table serves. */
export interface DbClientOk {
  readonly ok: true;
  readonly vendor: DbVendor;
  readonly version: string;
  /** What the version line holds after the version itself, as PA1-a recorded it. */
  readonly tag: string;
  readonly file: DbProgramFile;
}

export type DbClientVerdict = DbClientOk | { readonly ok: false; readonly sentence: string };

/** The vendors whose clients a database type is launched by; a type with none is never launched. */
export const VENDORS_OF: Readonly<Partial<Record<DbType, readonly DbVendor[]>>> = {
  postgres: ['postgresql'],
  mysql: ['oracle', 'mariadb'],
  mssql: ['go-sqlcmd', 'odbc-sqlcmd'],
};

/** The verdict as the builder takes it: a good one, or nothing. */
export const goodVerdict = (verdict: DbClientVerdict | undefined): DbClientOk | undefined => (verdict?.ok === true ? verdict : undefined);

/* ---------------------------------------------------------------------------------------------------------------
 * The reading: what a version answer says, against the builds a served row lists
 * ------------------------------------------------------------------------------------------------------------- */

/** A leading path, as Windows prints the program's own (`C:\Program Files\...\mysql.exe  Ver ...`): a drive or a root, then folders. Anything else before the program's name is no path. */
const LEAD = String.raw`(?:(?:[A-Za-z]:)?[\\/].*[\\/])?`;
const VERSION = String.raw`(?<version>\d+(?:\.\d+)+)`;

interface Reader {
  readonly vendor: DbVendor;
  /** Named groups: `token` (the vendor's words, the version and the build tag: all a sentence may quote), `version` and `tag`. */
  readonly pattern: RegExp;
}

/**
 * Where each client's own words put its version (the rig's readers of PA1-a, `scripts/lib/dbProbeRig.cjs`). The patterns are anchored at the start of the answer or, for
 * `sqlcmd`, of a line: a version word later in a line is no version. `mysql`'s two vendors print different lines, and Oracle's pattern refuses a tag that says MariaDB.
 */
const READERS: Readonly<Record<DbClient, readonly Reader[]>> = {
  psql: [{ vendor: 'postgresql', pattern: /^(?<token>psql \(PostgreSQL\) (?<version>\d+(?:\.\d+)*)(?<tag>[^\r\n]*))/ }],
  mysql: [
    { vendor: 'mariadb', pattern: new RegExp(String.raw`^${LEAD}(?<token>(?:mysql|mariadb)(?:\.exe)?\s+Ver\s+\d+(?:\.\d+)*\s+Distrib\s+${VERSION}(?<tag>[^\r\n]*))`) },
    { vendor: 'mariadb', pattern: new RegExp(String.raw`^${LEAD}(?<token>(?:mysql|mariadb)(?:\.exe)?\s+from\s+${VERSION}(?<tag>-MariaDB[^\r\n]*))`) },
    { vendor: 'oracle', pattern: new RegExp(String.raw`^${LEAD}(?<token>mysql(?:\.exe)?\s+Ver\s+${VERSION}(?<tag>(?![^\r\n]*MariaDB)[^\r\n]*))`) },
  ],
  sqlcmd: [
    { vendor: 'go-sqlcmd', pattern: new RegExp(String.raw`^[ \t]*(?<token>Version:[ \t]*v?${VERSION}(?<tag>[^\r\n]*))`, 'm') },
    { vendor: 'odbc-sqlcmd', pattern: new RegExp(String.raw`^[ \t]*(?<token>Version[ \t]+v?${VERSION}(?<tag>[^\r\n]*))`, 'm') },
  ],
};

/** The longest token a sentence quotes: a version line is one line, and this keeps a hostile one short. */
const TOKEN_LIMIT = 200;

interface Reading {
  readonly vendor: DbVendor;
  readonly version: string;
  readonly tag: string;
  readonly token: string;
}

function read(reader: Reader, stdout: string): Reading | undefined {
  const groups = reader.pattern.exec(stdout)?.groups;
  return groups === undefined ? undefined : { vendor: reader.vendor, version: groups.version, tag: groups.tag.trim(), token: groups.token.trimEnd().slice(0, TOKEN_LIMIT) };
}

/** The first reader of the client's own that reads the answer. */
function readVersion(client: DbClient, stdout: string): Reading | undefined {
  return READERS[client].map((reader) => read(reader, stdout)).find((found) => found !== undefined);
}

const rowFor = (rows: readonly DbProfileRow[], client: DbClient, platform: NodeJS.Platform): DbProfileRow | undefined =>
  rows.find((row) => row.client === client && row.platform === platform && row.served);

/** Numbers, not text: 10.6 is above 9.9. */
function byVersion(left: string, right: string): number {
  const [a, b] = [left, right].map((text) => text.split('.').map(Number));
  const at = a.findIndex((part, index) => part !== (b[index] ?? 0));
  return at < 0 ? a.length - b.length : a[at] - (b[at] ?? 0);
}

/** The recorded builds of a row as DR8 lists them: the vendor's words, the version and the tag, in the row's vendor order and each vendor's version order; `none` when it lists nothing. */
function buildsWords(row: DbProfileRow | undefined): string {
  const words = (row?.clients ?? []).flatMap((served) =>
    [...served.builds].sort((a, b) => byVersion(a.version, b.version)).map((build) => `${vendorWords(served.vendor)} ${build.version}${build.tag === '' ? '' : ` ${build.tag}`}`),
  );
  return words.length === 0 ? 'none' : words.join('; ');
}

const isRecorded = (row: DbProfileRow | undefined, reading: Reading): boolean =>
  (row?.clients ?? []).some((served) => served.vendor === reading.vendor && served.builds.some((build) => build.version === reading.version && build.tag === reading.tag));

/** What a version answer says: the client's vendor, version and build tag when it names a recorded build of a served row (DR8 otherwise), DR7 when the exit is not 0 or no reader reads the answer. Only stdout is read. */
export function dbClientVerdict(
  rows: readonly DbProfileRow[],
  client: DbClient,
  platform: NodeJS.Platform,
  exit: number | null,
  stdout: string,
): Omit<DbClientOk, 'file'> | { readonly ok: false; readonly sentence: string } {
  const reading = exit === 0 ? readVersion(client, stdout) : undefined;
  if (reading === undefined) {
    return { ok: false, sentence: DR7(client, exit) };
  }
  const row = rowFor(rows, client, platform);
  return isRecorded(row, reading)
    ? { ok: true, vendor: reading.vendor, version: reading.version, tag: reading.tag }
    : { ok: false, sentence: DR8(client, reading.token, platform, buildsWords(row)) };
}

/* ---------------------------------------------------------------------------------------------------------------
 * The walk: which file a program word is
 * ------------------------------------------------------------------------------------------------------------- */

/** What the walk reads of a file: the identity of the file behind it, or `undefined` when there is no regular file. */
export interface DbFiles {
  identityOf(file: string): Pick<DbProgramFile, 'realPath' | 'size' | 'mtimeMs' | 'launcher'> | undefined;
}

const WALKS = {
  win32: { delimiter: ';', flavour: path.win32, suffix: '.exe' },
  other: { delimiter: ':', flavour: path.posix, suffix: '' },
} as const;

/** The file each absolute folder of `pathValue` would hold for `word`, in order: a relative folder and an empty entry are skipped, on Windows the word is `<word>.exe`. */
function candidatesOf(word: string, pathValue: string | undefined, platform: NodeJS.Platform): string[] {
  const walk = platform === 'win32' ? WALKS.win32 : WALKS.other;
  return (pathValue ?? '')
    .split(walk.delimiter)
    .filter((folder) => walk.flavour.isAbsolute(folder))
    .map((folder) => walk.flavour.join(folder, `${word}${walk.suffix}`));
}

/** The first file for `word` in an absolute folder of `pathValue`, with its identity: the file a bare program word would be, which every spawn of the call then starts by its path. */
export function resolveDbProgram(word: string, pathValue: string | undefined, platform: NodeJS.Platform, files: DbFiles): DbProgramFile | undefined {
  for (const candidate of candidatesOf(word, pathValue, platform)) {
    const identity = files.identityOf(candidate);
    if (identity !== undefined) {
      return { program: word, path: candidate, ...identity };
    }
  }
  return undefined;
}

/** Whether the file begins with `#!`. */
function beginsWithShebang(file: string): boolean {
  const handle = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(2);
    fs.readSync(handle, head, 0, 2, 0);
    return head.toString('latin1') === '#!';
  } finally {
    fs.closeSync(handle);
  }
}

/** The real file system: a stat that follows links, the real path, and the first two bytes. A file that cannot be read is no file here. */
export const nodeDbFiles: DbFiles = {
  identityOf(file) {
    try {
      const stat = fs.statSync(file);
      return stat.isFile() ? { realPath: fs.realpathSync(file), size: stat.size, mtimeMs: stat.mtimeMs, launcher: beginsWithShebang(file) } : undefined;
    } catch {
      return undefined;
    }
  },
};

/* ---------------------------------------------------------------------------------------------------------------
 * The spawn that asks, and what is kept
 * ------------------------------------------------------------------------------------------------------------- */

/** The program word of each client and what makes it answer its version: `sqlcmd` answers in its help (`-?`), which both of its clients take. */
const CLIENT_WORDS: Readonly<Record<DbClient, string>> = { psql: 'psql', mysql: 'mysql', sqlcmd: 'sqlcmd' };
const VERSION_ARGS: Readonly<Record<DbClient, readonly string[]>> = { psql: ['--version'], mysql: ['--version'], sqlcmd: ['-?'] };

/** One ask of the check: which client the call is for, the window's end (which ends the version spawn) and the request's (which ends only this caller's wait). */
export interface DbClientCall {
  readonly client: DbClient;
  readonly window?: AbortSignal;
  readonly request?: AbortSignal;
}

/** The check a window holds: the verdict on the client a call would start. */
export type DbClientCheck = (call: DbClientCall) => Promise<DbClientVerdict>;

/** What the check is built from; everything but `storageDir` is for a test to say. */
export interface DbClientCheckParts {
  readonly storageDir: string;
  /** The table the check reads (default: the production table). */
  readonly rows?: readonly DbProfileRow[];
  readonly run?: ClientRunner;
  readonly platform?: NodeJS.Platform;
  readonly source?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly files?: DbFiles;
  /** The journal's line writer, for what the check cannot say any other way: the cause of a DR7, or a folder that could not be removed. */
  readonly note?: (message: string) => void;
}

type Resolved = Required<Omit<DbClientCheckParts, 'note'>> & Pick<DbClientCheckParts, 'note'>;

/** The identity a kept verdict is bound to: the path found, the real path behind it, the size and the modification time. */
const sameFile = (kept: DbProgramFile, found: DbProgramFile): boolean =>
  kept.path === found.path && kept.realPath === found.realPath && kept.size === found.size && kept.mtimeMs === found.mtimeMs;

/** Removes the folder; a failure is one journal note and never a throw that would hide the answer. */
function removeFolder(parts: Pick<Resolved, 'note'>, what: string, dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    parts.note?.(`the folder of the ${what} could not be removed: ${describeError(error)}`);
  }
}

/**
 * Runs `use` in a folder of its own that holds nothing, made for this one use under the window's keys folder with a fresh random name, and removes it in a `finally`: after the
 * child's exit, after a spawn that threw, and after a request or a window that ended (§S7.6 item 6). Why a folder at all, now that the program is a path: on Windows the current
 * folder is still among the places a program's libraries are looked for (N18), and a `.` in `PATH` is closed the same way.
 */
export async function inEmptyFolder<T>(parts: { readonly storageDir: string; readonly note?: (message: string) => void }, what: string, use: (dir: string) => Promise<T>): Promise<T> {
  const folder = bridgedCallFolder(parts.storageDir, callKeyName());
  try {
    fs.mkdirSync(folder.dir, { recursive: true, mode: 0o700 });
    return await use(folder.dir);
  } finally {
    removeFolder(parts, what, folder.dir);
  }
}

/** A runner that threw: a request or a window that ended goes on as itself; anything else is a client that did not answer (DR7), with its cause in the journal. */
function notStartedVerdict(parts: Resolved, client: DbClient, error: unknown): DbClientVerdict {
  if (endedStage(error) !== undefined) {
    throw error;
  }
  parts.note?.(`${client}: the client check could not start the client: ${describeError(error)}`);
  return { ok: false, sentence: DR7(client, null) };
}

const killedBy = (window: AbortSignal | undefined): { signal?: AbortSignal } => (window === undefined ? {} : { signal: window });

/** The version spawn: the file's path, the version flag, the bridged environment and no name of its own, in a folder that holds nothing. Only the window's end kills it (§S7.6 item 7). */
async function spawnVersion(parts: Resolved, file: DbProgramFile, client: DbClient, window: AbortSignal | undefined): ReturnType<ClientRunner> {
  const outcome = await inEmptyFolder(parts, 'client check', (dir) =>
    parts.run([...VERSION_ARGS[client]], { program: file.path, env: bridgedSshEnv(parts.source, parts.platform), cwd: dir, timeoutMs: parts.timeoutMs, ...killedBy(window) }),
  );
  if (window?.aborted === true) {
    throw notStarted();
  }
  return outcome;
}

/** The child, asked for its version and read against the table; a verdict that is good carries the file that answered. */
async function askClient(parts: Resolved, file: DbProgramFile, client: DbClient, window: AbortSignal | undefined): Promise<DbClientVerdict> {
  try {
    const outcome = await spawnVersion(parts, file, client, window);
    const verdict = dbClientVerdict(parts.rows, client, parts.platform, outcome.exitCode, outcome.stdout);
    return verdict.ok ? { ...verdict, file } : verdict;
  } catch (error) {
    return notStartedVerdict(parts, client, error);
  }
}

interface State {
  readonly parts: Resolved;
  /** Good verdicts bound to the file that answered, by the path found. */
  readonly kept: Map<string, DbClientOk>;
  /** The version spawn in flight for each path: a second call for the same file waits for it and starts nothing. */
  readonly inflight: Map<string, Promise<DbClientVerdict>>;
}

/** Keeps a good verdict, and never a launcher's: the file starts another program, which the identity does not cover (N10). */
function keep(state: State, verdict: DbClientVerdict): void {
  if (verdict.ok && !verdict.file.launcher) {
    state.kept.set(verdict.file.path, verdict);
  }
}

/** The one version spawn for this file, tracked until it ends; what it answers is kept when good. */
function start(state: State, file: DbProgramFile, call: DbClientCall): Promise<DbClientVerdict> {
  const tracked = askClient(state.parts, file, call.client, call.window).then(
    (verdict) => {
      state.inflight.delete(file.path);
      keep(state, verdict);
      return verdict;
    },
    (error: unknown) => {
      state.inflight.delete(file.path);
      throw error;
    },
  );
  state.inflight.set(file.path, tracked);
  return tracked;
}

/** The answer of `promise` for a caller whose request may end first: the caller goes on as ended, and the others still get the answer. */
function untilEnded(promise: Promise<DbClientVerdict>, request: AbortSignal | undefined): Promise<DbClientVerdict> {
  if (request === undefined) {
    return promise;
  }
  return new Promise((resolve, reject) => {
    const onEnd = (): void => reject(notStarted());
    request.addEventListener('abort', onEnd, { once: true });
    promise.then(resolve, reject).finally(() => request.removeEventListener('abort', onEnd));
  });
}

const ended = (call: DbClientCall): boolean => call.request?.aborted === true || call.window?.aborted === true;

/** The kept verdict of this very file, or nothing: a verdict kept for a file whose identity changed is dropped. */
function keptFor(state: State, file: DbProgramFile): DbClientOk | undefined {
  const kept = state.kept.get(file.path);
  if (kept !== undefined && sameFile(kept.file, file)) {
    return kept;
  }
  state.kept.delete(file.path);
  return undefined;
}

/** The kept verdict, or the version spawn already in flight for the file, or a new one. */
const verdictOf = (state: State, file: DbProgramFile, call: DbClientCall): Promise<DbClientVerdict> | DbClientOk =>
  keptFor(state, file) ?? untilEnded(state.inflight.get(file.path) ?? start(state, file, call), call.request);

async function ask(state: State, call: DbClientCall): Promise<DbClientVerdict> {
  const { parts } = state;
  if (ended(call)) {
    throw notStarted();
  }
  const file = resolveDbProgram(CLIENT_WORDS[call.client], bridgedSshEnv(parts.source, parts.platform).PATH, parts.platform, parts.files);
  if (file === undefined) {
    parts.note?.(`${call.client}: the client check found no file for ${CLIENT_WORDS[call.client]} in an absolute folder of the PATH a Remote Bridge gives it`);
    return { ok: false, sentence: DR7(call.client, null) };
  }
  return verdictOf(state, file, call);
}

/**
 * The check a bridged call makes after the Allow and before it builds a launch (§S7.6): when the table serves the client on this system, the walk turns the program word into a
 * file, a kept verdict of that very file stands, and otherwise one version spawn asks it, shared by every call that arrives before it answers. A good verdict is kept per file
 * with the file's identity and never for a launcher; a bad one is handed to those who waited and kept for nobody. The spawn takes no exec slot: it is one per client program at a time.
 * A table that serves nothing for the client starts nothing, and the verdict says DR1.
 */
export function bridgedDbClientCheck(given: DbClientCheckParts): DbClientCheck {
  const parts: Resolved = { rows: BRIDGED_DB_PROFILES, run: runSshExec, platform: process.platform, source: process.env, timeoutMs: CLIENT_CHECK_TIMEOUT_MS, files: nodeDbFiles, ...given };
  const state: State = { parts, kept: new Map(), inflight: new Map() };
  return (call) => (rowFor(parts.rows, call.client, parts.platform) === undefined ? Promise.resolve({ ok: false, sentence: DR1(call.client, parts.platform) }) : ask(state, call));
}

