import type { DbClientOk, DbVendor } from '../bridgedDbClient';

/**
 * Verdicts the client check would hand a launch, written out for the tests of the launch builder and of the doors (E1.7 spec §S7.11). Not a test file: `node:test`
 * is pointed at `*.test.js` only.
 */

/** The file of a verdict: a path of its own, so a test can tell "the verdict's file" from the bare program word. */
export const FOUND: Readonly<Record<DbVendor, string>> = {
  postgresql: '/opt/found/bin/psql',
  oracle: '/opt/found/bin/mysql',
  mariadb: '/opt/found/bin/mysql',
  'go-sqlcmd': '/opt/found/bin/sqlcmd',
  'odbc-sqlcmd': '/opt/found/bin/sqlcmd',
};

const WORD: Readonly<Record<DbVendor, string>> = { postgresql: 'psql', oracle: 'mysql', mariadb: 'mysql', 'go-sqlcmd': 'sqlcmd', 'odbc-sqlcmd': 'sqlcmd' };

/** A good verdict for `vendor`, from the file `FOUND` names for it. */
export function verdictOf(vendor: DbVendor, over: { readonly path?: string; readonly launcher?: boolean } = {}): DbClientOk {
  const path = over.path ?? FOUND[vendor];
  return { ok: true, vendor, version: '1.0', tag: 'test build', file: { program: WORD[vendor], path, realPath: path, size: 1, mtimeMs: 1, launcher: over.launcher ?? false } };
}
