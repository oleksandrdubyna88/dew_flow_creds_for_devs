import * as fs from 'node:fs';
import * as path from 'node:path';
import { after } from 'node:test';
import type { AgentUseDeps, dbQueryAction as DbQueryAction } from '../agentUseActions';
import { type DbClientCheck, type DbFiles, type DbVendor, bridgedDbClientCheck } from '../bridgedDbClient';
import type { DbClient, DbProfileRow } from '../bridgedDbProfile';
import { materializedKeysDir } from '../materializedKeys';
import type { DbType, EntityMetadata } from '../types';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { memoryStorage, seedEntry } from './pinWorld';
import { loadWithVscode } from './vscodeStub';
import { verdictOf } from './bridgedDbVerdicts';

/**
 * The real `dbQueryAction` over the REAL `StorageManager` holding one stored connection, with only the two spawners replaced by a recorder: `runBounded` (the query) and, for
 * the real client check, the check's own runner (the version spawn). Shared by the door tests of E1.6 (`bridgeRunSites.test.ts`) and of E1.7 (`bridgedDbDoors.test.ts`).
 *
 * <p>The folders the action makes live under an owned folder that is removed when the test file ends; what a spawn finds in its folder is recorded while it runs.</p>
 */

export const OUTPUT = { exitCode: 0, stdout: '1\n', stderr: '', stdoutTruncated: false, stderrTruncated: false, timedOut: false, durationMs: 1 };

export interface Spawn {
  /** The version spawn of the client check, or the query. */
  readonly kind: 'version' | 'query';
  readonly command: string;
  readonly args: string[];
  readonly shell: boolean;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string | undefined;
  /** What the spawn's folder was while it ran: made, and what it held. */
  readonly folder: { readonly existed: boolean; readonly files: string[] };
}

export interface QueryWorld {
  readonly action: unknown;
  /** The query spawns only. */
  readonly spawns: Spawn[];
  /** Every spawn, version spawns included, in order. */
  readonly runs: Spawn[];
  /** The lines the action wrote to the agent journal (`deps.note`). */
  readonly journal: string[];
  /** How many times the stored connection was read. */
  readonly reads: { count: number };
  /** The exec slots handed out and given back. */
  readonly slots: { taken: number; released: number };
  readonly storageDir: string;
  /** The folders the window's keys folder holds now. */
  keysFolders(): string[];
}

export interface QueryOptions {
  /** The window's client check: `stub` (default) always passes with the vendor of the client; `real` is the real check over a fake file system; `wrong` passes with the vendor of another client, so the builder is handed no verdict that fits. */
  readonly check?: 'stub' | 'real' | 'wrong';
  /** What the real check's version spawn prints on stdout (default: the recorded line of the client's vendor). */
  readonly versionLine?: string;
  /** Every exec slot is taken. */
  readonly noSlot?: boolean;
  /** What the query spawn does in place of answering `OUTPUT`: it gets the options the runner was given. */
  readonly onQuery?: (options: { readonly signal?: AbortSignal | readonly AbortSignal[]; readonly startGate?: AbortSignal }) => Promise<unknown>;
  /** Which programs are on `PATH` for the action's own `tool_missing` question (default: all). */
  readonly onPath?: (exe: string) => boolean;
}

/** The vendor a passing check reads for each client. */
export const VENDOR_OF: Readonly<Record<DbClient, DbVendor>> = { psql: 'postgresql', mysql: 'oracle', sqlcmd: 'odbc-sqlcmd' };

/** A vendor of another client's family: a verdict the builder cannot use for this client. */
const OTHER_VENDOR: Readonly<Record<DbClient, DbVendor>> = { psql: 'mariadb', mysql: 'postgresql', sqlcmd: 'oracle' };

/** The line each client's recorded build prints, and the build a served row lists for it (the forms of `bridgedDbClient.test.ts`). */
export const RECORDED: Readonly<Record<DbClient, { readonly line: string; readonly version: string; readonly tag: string }>> = {
  psql: { line: 'psql (PostgreSQL) 18.7 (Debian 18.7-1.pgdg120+1)\n', version: '18.7', tag: '(Debian 18.7-1.pgdg120+1)' },
  mysql: { line: 'mysql  Ver 8.4.13 for Linux on x86_64 (MySQL Community Server - GPL)\n', version: '8.4.13', tag: 'for Linux on x86_64 (MySQL Community Server - GPL)' },
  sqlcmd: { line: 'Microsoft (R) SQL Server Command Line Tool\nVersion 18.6.1.1 Linux\nCopyright (C) 2022\n', version: '18.6.1.1', tag: 'Linux' },
};

/** A table that serves the three clients on this platform, each with its one recorded build: what the real check admits. */
export const SERVED_BUILDS: readonly DbProfileRow[] = (['psql', 'mysql', 'sqlcmd'] as const).map((client) => ({
  client,
  platform: process.platform,
  served: true,
  clients: [{ vendor: VENDOR_OF[client], builds: [{ version: RECORDED[client].version, tag: RECORDED[client].tag, record: 'run 1 at 0123abc' }] }],
}));

const FOUND_DIR = process.platform === 'win32' ? 'C:\\found\\bin' : '/found/bin';
const WORD: Readonly<Record<DbClient, string>> = { psql: 'psql', mysql: 'mysql', sqlcmd: 'sqlcmd' };

/** Where the fake file system holds each client: the one folder of the bridged `PATH`. */
export const foundPath = (client: DbClient): string => path.join(FOUND_DIR, WORD[client] + (process.platform === 'win32' ? '.exe' : ''));

const scopes: ReturnType<typeof cleanupScope>[] = [];
after(async () => {
  for (const scope of scopes) {
    await scope.close();
  }
});

const CLIENT_OF: Readonly<Partial<Record<DbType, DbClient>>> = { postgres: 'psql', mysql: 'mysql', mssql: 'sqlcmd' };

/** One file per client in the one folder of the bridged `PATH`. */
function fakeFiles(): DbFiles {
  return { identityOf: (file) => (Object.values(WORD).some((word) => file === foundPath(word as DbClient)) ? { realPath: file, size: 10, mtimeMs: 100, launcher: false } : undefined) };
}

/** What a spawn's folder holds while it runs. */
function folderOf(cwd: string | undefined): Spawn['folder'] {
  const existed = cwd !== undefined && fs.existsSync(cwd);
  return { existed, files: existed ? fs.readdirSync(cwd) : [] };
}

/** What the recorder collects while the action runs. */
interface Recorded {
  readonly runs: Spawn[];
  readonly spawns: Spawn[];
  readonly journal: string[];
  readonly reads: { count: number };
  readonly slots: { taken: number; released: number };
}

type RunOptions = { env: NodeJS.ProcessEnv; cwd?: string; signal?: AbortSignal | readonly AbortSignal[]; startGate?: AbortSignal };

/** The action's module graph, with `runBounded` replaced by a recorder that answers `OUTPUT` (or what `onQuery` says). */
function loadAction(record: Recorded, options: QueryOptions, stub: Record<string, unknown>): typeof DbQueryAction {
  const real = require('../sshExecRunner') as Record<string, unknown>;
  const mocks = {
    './sshExecRunner': {
      ...real,
      runBounded: (command: string, args: string[], shell: boolean, run: RunOptions): Promise<unknown> => {
        const spawn: Spawn = { kind: 'query', command, args, shell, env: run.env, cwd: run.cwd, folder: folderOf(run.cwd) };
        record.runs.push(spawn);
        record.spawns.push(spawn);
        return options.onQuery === undefined ? Promise.resolve(OUTPUT) : options.onQuery(run);
      },
    },
  };
  return loadWithVscode<{ dbQueryAction: typeof DbQueryAction }>('../agentUseActions', stub, mocks).dbQueryAction;
}

/** A real storage holding the one stored connection, which counts its reads. */
async function storageWith(dbType: DbType, connection: string, stub: Record<string, unknown>, reads: { count: number }): Promise<AgentUseDeps['storage']> {
  const storage = memoryStorage(stub);
  await seedEntry(storage, { id: 'e1', name: 'prod', kind: 'db', dbType } as EntityMetadata, { 'database connection': connection });
  const read = storage.getDbConnection.bind(storage);
  storage.getDbConnection = (accountId, entityId) => {
    reads.count += 1;
    return read(accountId, entityId);
  };
  return storage;
}

/** The exec slots: handed out and given back, or none at all. */
function slotsOf(options: QueryOptions, slots: { taken: number; released: number }): AgentUseDeps['acquireExecSlot'] {
  return () => {
    if (options.noSlot === true) {
      return undefined;
    }
    slots.taken += 1;
    return () => void (slots.released += 1);
  };
}

export async function queryWorld(dbType: DbType, connection: string, profiles?: readonly DbProfileRow[], options: QueryOptions = {}): Promise<QueryWorld> {
  const record: Recorded = { runs: [], spawns: [], journal: [], reads: { count: 0 }, slots: { taken: 0, released: 0 } };
  const scope = cleanupScope();
  scopes.push(scope);
  const storageDir = ownedDir(scope, 'qw');
  const stub = { window: {} };
  const dbQueryAction = loadAction(record, options, stub);
  const deps: AgentUseDeps & { onPath: (exe: string) => boolean; profiles?: readonly DbProfileRow[]; dbClient?: DbClientCheck } = {
    storage: await storageWith(dbType, connection, stub, record.reads),
    storageDir,
    signal: new AbortController().signal,
    acquireExecSlot: slotsOf(options, record.slots),
    note: (line) => {
      record.journal.push(line);
    },
    trustStore: { get: () => [], update: () => Promise.resolve() },
    applyEnv: () => Promise.resolve({ written: [], withheld: [] }),
    onPath: options.onPath ?? (() => true),
    ...(profiles === undefined ? {} : { profiles }),
    ...checkPart(options, { client: CLIENT_OF[dbType] as DbClient, profiles, storageDir, runs: record.runs, journal: record.journal }),
  };
  return {
    action: dbQueryAction(deps),
    ...record,
    storageDir,
    keysFolders: () => (fs.existsSync(materializedKeysDir(storageDir)) ? fs.readdirSync(materializedKeysDir(storageDir)) : []),
  };
}

type World = { client: DbClient; profiles?: readonly DbProfileRow[]; storageDir: string; runs: Spawn[]; journal: string[] };

/** The real check, over a fake file system and a runner that records the version spawn and prints `line`. */
function realCheck(world: World, line: string): DbClientCheck {
  return bridgedDbClientCheck({
    storageDir: world.storageDir,
    rows: world.profiles ?? [],
    platform: process.platform,
    source: { PATH: FOUND_DIR, HOME: '/home/someone', PGPASSWORD: 'leaked', BRIDGE_TEST_SECRET: 'a-secret' },
    files: fakeFiles(),
    note: (message) => world.journal.push(message),
    run: (argv, run) => {
      world.runs.push({ kind: 'version', command: run.program as string, args: argv, shell: false, env: run.env, cwd: run.cwd, folder: folderOf(run.cwd) });
      return Promise.resolve({ exitCode: 0, stdout: line, stderr: '' });
    },
  });
}

function checkPart(options: QueryOptions, world: World): { dbClient?: DbClientCheck } {
  if (options.check === 'wrong') {
    return { dbClient: (call) => Promise.resolve(verdictOf(OTHER_VENDOR[call.client])) };
  }
  if (options.check === 'real') {
    return { dbClient: realCheck(world, options.versionLine ?? RECORDED[world.client].line) };
  }
  return { dbClient: (call) => Promise.resolve(verdictOf(VENDOR_OF[call.client])) };
}
