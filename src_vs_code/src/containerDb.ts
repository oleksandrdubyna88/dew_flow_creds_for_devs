import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type DbClientVerdict, type DbDriverFile, dbClientVerdict, driverVersionOf } from './bridgedDbClient';
import type { DbClient, DbProfileRow } from './bridgedDbProfile';

/**
 * A bridged database query's client in a Linux container on the laptop (change 11.1, the 72-hour slice, S3). Pure of `vscode`.
 *
 * <p>On Windows no (client, system) pair is served, so the client runs in an image built from `containers/db-sqlcmd.Containerfile` (the build the
 * CI legs ran: `sqlcmd` 18.7.0001.1 with the ODBC driver 18.7.1.1) and started with the laptop's container tool (`wslc`). The profile table
 * names the container as a platform of its own; its row serves only that build, and the image is asked, before it serves a query, which
 * client and driver it carries ({@link containerVerdict}).</p>
 *
 * <p><b>The password never stands on a command line.</b> It goes in an env file ({@link writeEnvFile}): owner-only, in the extension's own
 * storage folder, named at random, removed when the run ends, and swept at activation for a run a crash interrupted. The tool's `--env-file`
 * keeps spaces and `=` (measured 2026-11-25); a value with a line break cannot be said in that file and is refused.</p>
 *
 * <p><b>The run is held short.</b> `--rm`, `--pull never` (only the image the registration built), `--cap-drop ALL`, the user nobody (65534);
 * the probe also has no network. Measured on `wslc` 3.0.5: it has no `--read-only` and no `--security-opt`, and `--memory` makes it print a
 * swap warning on the run's stderr (which would reach the agent), so no memory limit is set.</p>
 *
 * <p><b>Measured on the owner's laptop, 2026-11-26</b> (wslc 3.0.5, this module's code driven from a script, a throwaway SQL Server 2022 container
 * with a certificate of a throwaway CA that a test copy of the image trusted): the probe served `odbc-sqlcmd` 18.7.0001.1 with the driver
 * 18.7.1.1; the right password logged in (exit 0, `SUSER_NAME()` answered); a wrong one ended "Login failed"; no argument held the password and
 * no env file was left. An argument with quotes, backslashes, `;&|`, `%PATH%`, `$HOME`, backticks and non-ASCII text reached the container
 * unchanged (Node → wslc.exe through WSL's interop; the extension's own Windows spawn is checked in S5). The server's certificate is checked:
 * a certificate the image's trust store does not know (self-signed, or a company CA) ends the run "certificate verify failed", and the profile
 * refuses `TrustServerCertificate`, so such a server is not reachable this way.</p>
 */

/** Where the client stands in the image. */
export const SQLCMD_IN_IMAGE = '/opt/mssql-tools18/bin/sqlcmd';

/** The user the client runs as: nobody. */
export const CONTAINER_USER = '65534:65534';

/** The image recipe, shipped with the extension. */
export const SQLCMD_CONTAINERFILE = 'db-sqlcmd.Containerfile';

/** The folder of the env files, under the extension's storage folder. */
export const ENV_FILES_DIR = 'db-env';

/** The container tool and the image this window runs a bridged client in. */
export interface ContainerRuntime {
  /** The tool's absolute path (`wslc.exe`); a test names another tool with the same `run` words. */
  readonly tool: string;
  /** The image's reference: the tag {@link imageTagOf} gives the recipe. */
  readonly image: string;
}

/** The image's tag: named after the recipe's own bytes, so a changed recipe is a new image and never the old one under its name. */
export function imageTagOf(containerfile: string): string {
  return `creds-db-sqlcmd:${crypto.createHash('sha256').update(containerfile).digest('hex').slice(0, 16)}`;
}

/** The tool on Windows: `%ProgramFiles%\WSL\wslc.exe`, when it is there. */
export function wslcPath(env: NodeJS.ProcessEnv, exists: (file: string) => boolean = fs.existsSync): string | undefined {
  const tool = wslcUnder(programFilesOf(env));
  return tool !== undefined && exists(tool) ? tool : undefined;
}

const programFilesOf = (env: NodeJS.ProcessEnv): string | undefined => env.ProgramFiles ?? env.PROGRAMFILES;

const wslcUnder = (programFiles: string | undefined): string | undefined => (programFiles === undefined ? undefined : path.win32.join(programFiles, 'WSL', 'wslc.exe'));

/** What every run says first: removed after it ends, only the local image, no capability, as nobody. */
const HELD = ['run', '--rm', '--pull', 'never', '--cap-drop', 'ALL', '--user', CONTAINER_USER];

/**
 * The probe: the client's version lines, the driver file the ODBC configuration names, and how many of that driver's libraries cannot be found
 * (`missing <n>`). The last is measured, not assumed: an image whose `apt-get autoremove` took `libgssapi_krb5.so.2` (msodbcsql18 does not
 * declare it) printed the right version and driver, and every query then ended "Can't open lib" (laptop, 2026-11-26). Read with no network.
 */
export const PROBE_SCRIPT = `${SQLCMD_IN_IMAGE} -? 2>&1 | head -3; d=$(sed -n 's/^Driver=//p' /etc/odbcinst.ini); echo "$d"; echo "missing $(ldd "$d" 2>&1 | grep -c 'not found')"`;

/** The arguments of the probe. */
export function probeArgv(runtime: ContainerRuntime): string[] {
  return [...HELD, '--network', 'none', runtime.image, '/bin/sh', '-c', PROBE_SCRIPT];
}

/** The arguments of a query: the env file holds the password and the user; the client and its arguments come after the image. */
export function queryArgv(runtime: ContainerRuntime, envFile: string, launch: { readonly exe: string; readonly args: readonly string[] }): string[] {
  return [...HELD, '--env-file', envFile, runtime.image, launch.exe, ...launch.args];
}

/** The arguments that build the image from the shipped recipe (the registration command). */
export function buildArgv(runtime: ContainerRuntime, containerfile: string): string[] {
  return ['build', '-t', runtime.image, '-f', containerfile, path.dirname(containerfile)];
}

/**
 * The image's answer to the probe, read against the `container` row: a verdict whose file is the client's path IN the image. The image is
 * named by a tag of the recipe and run with `--pull never`, so what answered is what a query of the same window starts.
 */
export function containerVerdict(rows: readonly DbProfileRow[], client: DbClient, exit: number | null, stdout: string): DbClientVerdict {
  const lines = stdout.split(/\r?\n/);
  return lines.includes('missing 0') ? readVerdict(rows, client, exit, lines) : { ok: false, sentence: DRIVER_UNLOADABLE };
}

/** The version lines read against the row, with the driver the probe named; a good verdict's file is the client's path in the image. */
function readVerdict(rows: readonly DbProfileRow[], client: DbClient, exit: number | null, lines: readonly string[]): DbClientVerdict {
  const verdict = dbClientVerdict(rows, client, 'container', exit, lines.filter((line) => !line.startsWith('/')).join('\n'), driverOfProbe(lines));
  return verdict.ok
    ? { ...verdict, file: { program: client, path: SQLCMD_IN_IMAGE, realPath: SQLCMD_IN_IMAGE, size: 0, mtimeMs: 0, launcher: false } }
    : verdict;
}

/** The driver file the probe printed (the one line that is a path), with the version its name gives; `undefined` when there is none. */
function driverOfProbe(lines: readonly string[]): DbDriverFile | undefined {
  const driverPath = lines.find((line) => line.startsWith('/')) ?? '';
  const version = driverVersionOf(driverPath);
  return version === undefined ? undefined : { path: driverPath, realPath: driverPath, size: 0, mtimeMs: 0, version };
}

/** What the person is told when the image's driver cannot be loaded, or the probe could not say. */
export const DRIVER_UNLOADABLE =
  'The database container\'s ODBC driver cannot be loaded (a library it needs is missing from the image), so no query can run there. Run "CredsForDevs: Prepare Database Container" again with the current extension.';

/** An env file written for one run, and its removal. */
export interface EnvFile {
  readonly path: string;
  remove(): void;
}

/**
 * Writes `env` as `NAME=value` lines into a new owner-only file in `<storageDir>/db-env`, or answers why it cannot: a value with a line break
 * (or a NUL) cannot be said in an env file, and a name must be a plain variable name.
 */
export function writeEnvFile(storageDir: string, env: Readonly<Record<string, string>>): EnvFile | { readonly refused: string } {
  const refused = envRefusal(env);
  if (refused !== undefined) {
    return { refused };
  }
  const dir = path.join(storageDir, ENV_FILES_DIR);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${crypto.randomBytes(12).toString('hex')}.env`);
  fs.writeFileSync(file, Object.entries(env).map(([name, value]) => `${name}=${value}\n`).join(''), { mode: 0o600, flag: 'wx' });
  return { path: file, remove: () => fs.rmSync(file, { force: true }) };
}

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

/** Why `env` cannot be written as an env file: a name that is not a plain variable name, or a value with a line break or a NUL. */
function envRefusal(env: Readonly<Record<string, string>>): string | undefined {
  const bad = Object.entries(env).find(([name, value]) => !ENV_NAME.test(name) || /[\r\n\0]/.test(value));
  return bad === undefined ? undefined : `the value of ${ENV_NAME.test(bad[0]) ? bad[0] : 'a variable'} cannot be handed to the container (a line break)`;
}

/** Removes every env file a run left behind (a crash, a killed host): at activation, before any bridged query can run. The count removed. */
export function sweepEnvFiles(storageDir: string): number {
  const dir = path.join(storageDir, ENV_FILES_DIR);
  let removed = 0;
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (name.endsWith('.env')) {
      fs.rmSync(path.join(dir, name), { force: true });
      removed += 1;
    }
  }
  return removed;
}
