import * as fs from 'node:fs';
import * as path from 'node:path';
import { describeError } from './describeError';
import { DR1, DR7, DR8, vendorWords } from './bridgedDbSentences';
import { BRIDGED_DB_PROFILES, DbClient, DbProfileRow, DbRecordedBuild } from './bridgedDbProfile';
import { bridgedSshEnv } from './bridgedSshEnv';
import { CLIENT_CHECK_TIMEOUT_MS } from './bridgedSshClient';
import { bridgedCallFolder, callKeyName } from './materializedKeys';
import { endedStage, notStarted } from './requestLife';
import { SshExecOptions, SshExecOutcome, runBounded } from './sshExecRunner';
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

/**
 * The ODBC driver file the ODBC `sqlcmd` loads (E1.7 spec §S7.16 L11): what the ODBC configuration lists for the client's own driver, with the identity of the file behind it and the version its
 * file name gives (`libmsodbcsql-18.6.so.1.1` is `18.6.1.1`). A verdict of that client is bound to it as a verdict of any client is bound to its executable.
 */
export interface DbDriverFile {
  /** The path the configuration lists. */
  readonly path: string;
  readonly realPath: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly version: string;
}

/** A client that answered its version with a build the table serves. */
export interface DbClientOk {
  readonly ok: true;
  readonly vendor: DbVendor;
  readonly version: string;
  /** What the version line holds after the version itself, as PA1-a recorded it. */
  readonly tag: string;
  readonly file: DbProgramFile;
  /** The ODBC `sqlcmd` only: the driver file it loads, which the verdict is bound to as well. */
  readonly driver?: DbDriverFile;
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
 * `sqlcmd`, of a line: a version word later in a line is no version. `mysql`'s two vendors print different lines: MariaDB's `Distrib` pattern requires the word MariaDB right after the version (Oracle 5.7 prints `Distrib 5.7.44` too), and Oracle's patterns refuse a tag that says MariaDB.
 */
const READERS: Readonly<Record<DbClient, readonly Reader[]>> = {
  psql: [{ vendor: 'postgresql', pattern: /^(?<token>psql \(PostgreSQL\) (?<version>\d+(?:\.\d+)*)(?<tag>[^\r\n]*))/ }],
  mysql: [
    { vendor: 'mariadb', pattern: new RegExp(String.raw`^${LEAD}(?<token>(?:mysql|mariadb)(?:\.exe)?\s+Ver\s+\d+(?:\.\d+)*\s+Distrib\s+${VERSION}(?<tag>-MariaDB[^\r\n]*))`) },
    { vendor: 'mariadb', pattern: new RegExp(String.raw`^${LEAD}(?<token>(?:mysql|mariadb)(?:\.exe)?\s+from\s+${VERSION}-MariaDB(?<tag>[^\r\n]*))`) },
    // Before Oracle 8 the client printed its own number first (`Ver 14.14 Distrib 5.7.44, for Linux`): the version is the one after `Distrib`, and MariaDB is the word that tells the other vendor.
    { vendor: 'oracle', pattern: new RegExp(String.raw`^${LEAD}(?<token>mysql(?:\.exe)?\s+Ver\s+\d+(?:\.\d+)*\s+Distrib\s+${VERSION}(?<tag>(?![^\r\n]*MariaDB)[^\r\n]*))`) },
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

/** One recorded build as DR8 lists it: the vendor's words, the version, the tag, and for the ODBC client the driver. */
const buildWords = (vendor: DbVendor, build: DbRecordedBuild): string =>
  `${vendorWords(vendor)} ${build.version}${build.tag === '' ? '' : ` ${build.tag}`}${build.driver === undefined ? '' : ` with the driver ${build.driver}`}`;

/** The recorded builds of a row as DR8 lists them: the vendor's words, the version and the tag, in the row's vendor order and each vendor's version order; `none` when it lists nothing. */
function buildsWords(row: DbProfileRow | undefined): string {
  const words = (row?.clients ?? []).flatMap((served) =>
    [...served.builds].sort((a, b) => byVersion(a.version, b.version)).map((build) => buildWords(served.vendor, build)),
  );
  return words.length === 0 ? 'none' : words.join('; ');
}

/** The ODBC client's build lists the driver that ran (L11): a build with no driver listed serves no driver. Every other vendor has no driver to ask. */
const driverMatches = (vendor: DbVendor, build: DbRecordedBuild, driver: DbDriverFile | undefined): boolean => vendor !== 'odbc-sqlcmd' || (driver !== undefined && build.driver === driver.version);

const buildMatches = (build: DbRecordedBuild, reading: Reading, driver: DbDriverFile | undefined): boolean =>
  build.version === reading.version && build.tag === reading.tag && driverMatches(reading.vendor, build, driver);

/** A build is recorded when its vendor, version and tag are, and for the ODBC client its driver too. */
const isRecorded = (row: DbProfileRow | undefined, reading: Reading, driver: DbDriverFile | undefined): boolean =>
  (row?.clients ?? []).some((served) => served.vendor === reading.vendor && served.builds.some((build) => buildMatches(build, reading, driver)));

/** The ODBC client is read only with the driver it loads. */
const lacksDriver = (reading: Reading | undefined, driver: DbDriverFile | undefined): boolean => reading?.vendor === 'odbc-sqlcmd' && driver === undefined;

/** The reading of an answer, or nothing when it is no good answer: an exit that is not 0, a line no reader reads, or the ODBC client with no driver (L11). */
function usableReading(client: DbClient, exit: number | null, stdout: string, driver: DbDriverFile | undefined): Reading | undefined {
  const reading = exit === 0 ? readVersion(client, stdout) : undefined;
  return lacksDriver(reading, driver) ? undefined : reading;
}

const withDriver = (driver: DbDriverFile | undefined): { driver?: DbDriverFile } => (driver === undefined ? {} : { driver });

/** What a version answer says: the client's vendor, version and build tag when it names a recorded build of a served row (DR8 otherwise), DR7 when the exit is not 0 or no reader reads the answer. Only stdout is read. */
export function dbClientVerdict(
  rows: readonly DbProfileRow[],
  client: DbClient,
  platform: NodeJS.Platform,
  exit: number | null,
  stdout: string,
  driver?: DbDriverFile,
): Omit<DbClientOk, 'file'> | { readonly ok: false; readonly sentence: string } {
  const reading = usableReading(client, exit, stdout, driver);
  if (reading === undefined) {
    return { ok: false, sentence: DR7(client, exit) };
  }
  const row = rowFor(rows, client, platform);
  const token = driver === undefined ? reading.token : `${reading.token} with the driver ${driver.version}`;
  return isRecorded(row, reading, driver)
    ? { ok: true, vendor: reading.vendor, version: reading.version, tag: reading.tag, ...withDriver(driver) }
    : { ok: false, sentence: DR8(client, token, platform, buildsWords(row)) };
}

/* ---------------------------------------------------------------------------------------------------------------
 * The walk: which file a program word is
 * ------------------------------------------------------------------------------------------------------------- */

/** What the walk reads of a file: the identity of the file behind it, or `undefined` when there is no regular file. */
export interface DbFiles {
  identityOf(file: string): Pick<DbProgramFile, 'realPath' | 'size' | 'mtimeMs' | 'launcher'> | undefined;
  /** The text of a small configuration file (the ODBC configuration), or `undefined` when it is not there, not a regular file, or larger than a configuration file is. */
  readText?(file: string): string | undefined;
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
/** The largest configuration file `readText` reads: an ODBC configuration is a few lines. */
const CONFIG_LIMIT = 256 * 1024;

export const nodeDbFiles: DbFiles = {
  readText(file) {
    try {
      return fs.statSync(file).size <= CONFIG_LIMIT ? fs.readFileSync(file, 'utf8') : undefined;
    } catch {
      return undefined;
    }
  },
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
 * The driver: the ODBC client's authentication lives in a library its version line does not name (§S7.16 L11)
 * ------------------------------------------------------------------------------------------------------------- */

/** The ODBC configuration a bridged child reaches: it gets `PATH` and `HOME` only (G5), so the driver manager reads the system's `odbcinst.ini` and nothing a variable names. */
const ODBCINST_FILES: Readonly<Partial<Record<NodeJS.Platform, string>>> = { linux: '/etc/odbcinst.ini' };

/** What a driver lookup says when it fails: the cause for the journal (the sentence is DR7, which names no path). */
export interface DbDriverFailure {
  readonly ok: false;
  readonly cause: string;
}

export type DbDriverAnswer = { readonly ok: true; readonly driver: DbDriverFile } | DbDriverFailure;

const failure = (cause: string): DbDriverFailure => ({ ok: false, cause });
const isFailure = (value: unknown): value is DbDriverFailure => typeof value === 'object' && value !== null && 'cause' in value;

const WINDOWS_CAUSE = 'the ODBC drivers of Windows are registered in the registry and no file lists them: the driver of this client cannot be bound';

/** The text of the ODBC configuration of this system, or why there is none. */
function configurationOf(platform: NodeJS.Platform, files: DbFiles): string | DbDriverFailure {
  const file = ODBCINST_FILES[platform];
  if (file === undefined) {
    return failure(platform === 'win32' ? WINDOWS_CAUSE : `no ODBC configuration is read on ${platform}`);
  }
  return readConfiguration(files, file);
}

const readConfiguration = (files: DbFiles, file: string): string | DbDriverFailure => files.readText?.(file) ?? failure('no ODBC configuration (odbcinst.ini) could be read');

/** The section of the driver the client of this version loads: Microsoft's tools of major version 17 and 18 name `ODBC Driver <major> for SQL Server`. */
function sectionOf(clientVersion: string): string | DbDriverFailure {
  const major = clientVersion.split('.')[0];
  return major === '17' || major === '18' ? `ODBC Driver ${major} for SQL Server` : failure('the version of this client names no ODBC driver section');
}

/** The lines of a section of an INI text, up to the next section. */
function sectionLines(text: string, name: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `[${name.toLowerCase()}]`);
  const rest = start < 0 ? [] : lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim().startsWith('['));
  return end < 0 ? rest : rest.slice(0, end);
}

/** The `Driver=` path of a section. */
function listedDriver(text: string, section: string): string | DbDriverFailure {
  const lines = sectionLines(text, section);
  const listed = lines.map((line) => /^\s*Driver\s*=\s*(.+?)\s*$/i.exec(line)?.[1]).find((value) => value !== undefined);
  if (listed !== undefined) {
    return listed;
  }
  return failure(lines.length === 0 ? `the ODBC configuration has no section "${section}"` : `the section "${section}" has no Driver line`);
}

/** `libmsodbcsql-18.6.so.1.1` is the driver version `18.6.1.1`. */
const DRIVER_NAME = /^libmsodbcsql-(\d+(?:\.\d+)*)\.so\.(\d+(?:\.\d+)*)$/;

function driverVersionOf(realPath: string): string | undefined {
  const found = DRIVER_NAME.exec(path.posix.basename(realPath));
  return found === null ? undefined : `${found[1]}.${found[2]}`;
}

/** The driver file the configuration lists, with its identity and the version its real file's name gives. */
function driverFileOf(files: DbFiles, listed: string): DbDriverFile | DbDriverFailure {
  const identity = files.identityOf(listed);
  if (identity === undefined) {
    return failure('the driver file the ODBC configuration lists is not a file');
  }
  const version = driverVersionOf(identity.realPath);
  return version === undefined
    ? failure("the driver file's name holds no version (libmsodbcsql-<version>.so.<version> is the form read)")
    : { path: listed, realPath: identity.realPath, size: identity.size, mtimeMs: identity.mtimeMs, version };
}

/** The next step of a lookup, or the failure that ended it: a failure travels through the steps unchanged. */
const then = <A, B>(value: A | DbDriverFailure, next: (found: A) => B | DbDriverFailure): B | DbDriverFailure => (isFailure(value) ? value : next(value));

/**
 * The driver the ODBC `sqlcmd` of this version loads, as the ODBC configuration the bridged environment gives it lists it (L11): the `Driver=` path of the client's own section, the identity of
 * the file behind it, and the version from its file name. A driver that cannot be found or read is a failure with its cause, which the check answers as DR7.
 */
export function odbcDriverOf(platform: NodeJS.Platform, files: DbFiles, clientVersion: string): DbDriverAnswer {
  const config = configurationOf(platform, files);
  const section = then(config, () => sectionOf(clientVersion));
  const listed = then(config, (text) => then(section, (name) => listedDriver(text, name)));
  const file = then(listed, (listing) => driverFileOf(files, listing));
  return isFailure(file) ? file : { ok: true, driver: file };
}

/** The identity a kept verdict's driver is bound to. */
const sameDriver = (kept: DbDriverFile, found: DbDriverFile): boolean =>
  kept.path === found.path && kept.realPath === found.realPath && kept.size === found.size && kept.mtimeMs === found.mtimeMs;

/* ---------------------------------------------------------------------------------------------------------------
 * The spawn that asks, and what is kept
 * ------------------------------------------------------------------------------------------------------------- */

/** The program word of each client and what makes it answer its version: `sqlcmd` answers in its help (`-?`), which both of its clients take. */
const CLIENT_WORDS: Readonly<Record<DbClient, string>> = { psql: 'psql', mysql: 'mysql', sqlcmd: 'sqlcmd' };
const VERSION_ARGS: Readonly<Record<DbClient, readonly string[]>> = { psql: ['--version'], mysql: ['--version'], sqlcmd: ['-?'] };

/** What starts the version spawn: the file's path and the version flag, under the options of the bounded runner. The default is the generic bounded runner, `runBounded`: the client is a database client and never `ssh`. */
export type DbRunner = (argv: string[], options: SshExecOptions & { readonly program: string }) => Promise<Pick<SshExecOutcome, 'exitCode' | 'stdout' | 'stderr'>>;

const boundedRun: DbRunner = (argv, options) => runBounded(options.program, argv, false, options);

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
  readonly run?: DbRunner;
  readonly platform?: NodeJS.Platform;
  readonly source?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly files?: DbFiles;
  /** Where the ODBC client's driver is read from: by default the ODBC configuration of this system through `files`. A test says it; production never does. */
  readonly driver?: (clientVersion: string) => DbDriverAnswer;
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
async function spawnVersion(parts: Resolved, file: DbProgramFile, client: DbClient, window: AbortSignal | undefined): ReturnType<DbRunner> {
  const outcome = await inEmptyFolder(parts, 'client check', (dir) =>
    parts.run([...VERSION_ARGS[client]], { program: file.path, env: bridgedSshEnv(parts.source, parts.platform), cwd: dir, timeoutMs: parts.timeoutMs, ...killedBy(window) }),
  );
  if (window?.aborted === true) {
    throw notStarted();
  }
  return outcome;
}

/** The driver of an answer that is the ODBC client's own (the one client whose authentication lives in a library its line does not name); nothing for any other client. */
function driverOfAnswer(parts: Resolved, client: DbClient, outcome: Pick<SshExecOutcome, 'exitCode' | 'stdout'>): DbDriverAnswer | undefined {
  const reading = readingOfOdbc(client, outcome);
  return reading === undefined ? undefined : parts.driver(reading.version);
}

/** The reading of an answer of the ODBC client, or nothing for any other. */
function readingOfOdbc(client: DbClient, outcome: Pick<SshExecOutcome, 'exitCode' | 'stdout'>): Reading | undefined {
  const reading = outcome.exitCode === 0 ? readVersion(client, outcome.stdout) : undefined;
  return reading?.vendor === 'odbc-sqlcmd' ? reading : undefined;
}

/** What a version answer makes of a file: the answer read against the table, with the driver of the ODBC client; a good verdict carries the file (and the driver) that answered. */
function verdictFrom(parts: Resolved, file: DbProgramFile, client: DbClient, outcome: Awaited<ReturnType<DbRunner>>): DbClientVerdict {
  const driver = driverOfAnswer(parts, client, outcome);
  noteDriver(parts, client, driver);
  const verdict = dbClientVerdict(parts.rows, client, parts.platform, outcome.exitCode, outcome.stdout, goodDriver(driver));
  return verdict.ok ? { ...verdict, file } : verdict;
}

/** The cause a driver could not be bound, for the journal. */
function noteDriver(parts: Resolved, client: DbClient, answer: DbDriverAnswer | undefined): void {
  if (answer?.ok === false) {
    parts.note?.(`${client}: the ODBC driver could not be bound: ${answer.cause}`);
  }
}

const goodDriver = (answer: DbDriverAnswer | undefined): DbDriverFile | undefined => (answer?.ok === true ? answer.driver : undefined);

/** The child, asked for its version and read against the table; a verdict that is good carries the file that answered. */
async function askClient(parts: Resolved, file: DbProgramFile, client: DbClient, window: AbortSignal | undefined): Promise<DbClientVerdict> {
  try {
    return verdictFrom(parts, file, client, await spawnVersion(parts, file, client, window));
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

/** Whether the driver a kept verdict is bound to is still the one the ODBC configuration lists: a lookup of a few files, no spawn. */
function driverStands(state: State, kept: DbClientOk): boolean {
  if (kept.driver === undefined) {
    return true;
  }
  const found = state.parts.driver(kept.version);
  return found.ok && sameDriver(kept.driver, found.driver);
}

/** The kept verdict of this very file (and, for the ODBC client, this very driver), or nothing: a verdict kept for a file whose identity changed is dropped. */
function keptFor(state: State, file: DbProgramFile): DbClientOk | undefined {
  const kept = state.kept.get(file.path);
  if (kept !== undefined && sameFile(kept.file, file) && driverStands(state, kept)) {
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
  const base = { rows: BRIDGED_DB_PROFILES, run: boundedRun, platform: process.platform, source: process.env, timeoutMs: CLIENT_CHECK_TIMEOUT_MS, files: nodeDbFiles, ...given };
  const parts: Resolved = { ...base, driver: given.driver ?? ((version) => odbcDriverOf(base.platform, base.files, version)) };
  const state: State = { parts, kept: new Map(), inflight: new Map() };
  return (call) => (rowFor(parts.rows, call.client, parts.platform) === undefined ? Promise.resolve({ ok: false, sentence: DR1(call.client, parts.platform) }) : ask(state, call));
}

