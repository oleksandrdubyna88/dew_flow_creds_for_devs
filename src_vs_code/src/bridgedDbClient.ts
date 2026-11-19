/**
 * The database client check of a bridged `query` and the verdict it hands the launch builder (the E1.7 spec §S7.6, parent §4.11). Pure, no `vscode`.
 *
 * <p>This part holds what the builder and the gate read: which vendors each database type may be launched by, and the shape of a verdict. The reading of a version
 * answer and the spawn that asks come with the check itself.</p>
 */

import type { DbClient } from './bridgedDbProfile';
import type { DbType } from './types';

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

/** One ask of the check: which client the call is for. */
export interface DbClientCall {
  readonly client: DbClient;
}

/** The check a window holds: the verdict on the client a call would start. */
export type DbClientCheck = (call: DbClientCall) => Promise<DbClientVerdict>;

/** The verdict as the builder takes it: a good one, or nothing. */
export const goodVerdict = (verdict: DbClientVerdict | undefined): DbClientOk | undefined => (verdict?.ok === true ? verdict : undefined);
