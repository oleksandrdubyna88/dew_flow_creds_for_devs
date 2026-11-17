/**
 * The environment ASKED FOR a bridged child (parent §4.9 row 5, the E1.6 spec §S6.3 and §S6.14 Y1): a NEW object built from an allow-list, never
 * the extension host's environment spread into it. Pure and `vscode`-free, so the `ssh` of a bridged `ssh:exec`, the database client of a bridged
 * `query` and E2.2's helper execs all take their environment from this one function.
 *
 * <p>Two facts, not one: what this module ASKS FOR (the `env` object it answers) and what a child RECEIVES. On Windows they differ: libuv writes a
 * list of names of its own into every child whose block lacks them (`BRIDGED_ENV_RUNTIME_ADDED_WINDOWS`), and this module never writes one of
 * those; a comment here says what is asked for and nothing about what a value holds. What a child receives is observed in a child
 * (`bridged-ssh-itest.cjs` (b) 4 and `bridgedEnvWindows.test.ts` WN3), not read off this file.</p>
 *
 * <p>What is NOT asked for matters as much: no `SSH_AUTH_SOCK` (the agent), no `CREDS_REF_*`, no `PGOPTIONS`, `PGSERVICE`, `MYSQL_HOME`, no
 * `LD_PRELOAD`. Anything the person's shell exported would otherwise ride into a process an agent's command shapes. `PGPASSFILE`,
 * `MYSQL_TEST_LOGIN_FILE`, `PGSSLCERT` and `PGSSLKEY` are asked for only as `extra`, and only as paths that never exist (§S6.14 Y6), for a database connection this
 * extension builds (§S6.15 Z2).</p>
 */

export const BRIDGED_ENV_POSIX = ['PATH', 'HOME'] as const;
/** The seven names asked for on Windows, with the source's values. `PROGRAMDATA` is there because Win32-OpenSSH answers 255 and prints nothing without it (M9, 9.2). */
export const BRIDGED_ENV_WINDOWS = ['PATH', 'SYSTEMROOT', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'PROGRAMDATA'] as const;
/** What Node's libuv writes into every Windows child whose block lacks it. This module never writes one: the list is for the tests and the documents. */
export const BRIDGED_ENV_RUNTIME_ADDED_WINDOWS = ['HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'PATH', 'SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP',
  'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'WINDIR'] as const;
/** Asked for as empty strings on Windows, so the runtime does not fill them with the account's identity (Q14, PW3). Never asked for off Windows. */
export const BRIDGED_ENV_BLANKED_WINDOWS = ['USERNAME', 'USERDOMAIN', 'LOGONSERVER'] as const;

/**
 * The only names a caller may add as `extra`: the four of an askpass password (for a password destination only), the four database client
 * variables the launcher sets (`buildDbQueryLaunch`'s `env`), and the four it asks for as paths that never exist (§S6.14 Y6): defences for a connection this
 * extension builds, which then reads none of the person's own files. Not a lock: a stored URI handed whole outranks them (PQ1, PQ2), so a bridged client is never given one.
 */
export const BRIDGED_ENV_EXTRA = ['SSH_ASKPASS', 'SSH_ASKPASS_REQUIRE', 'CREDS_SSH_PASSWORD', 'DISPLAY',
  'PGPASSWORD', 'MYSQL_PWD', 'SQLCMDPASSWORD', 'SQLCMDUSER', 'MYSQL_TEST_LOGIN_FILE', 'PGPASSFILE', 'PGSSLCERT', 'PGSSLKEY'] as const;

/**
 * A NEW object: each listed name that `source` holds, then, on `win32`, the three blanked names as `''` whatever `source` holds, then `extra`. It
 * throws on an `extra` name that is not in `BRIDGED_ENV_EXTRA`, and the message names that key, never a value. On `win32` a listed name is found in
 * `source` in any letter case and written under the list's spelling. A name that `source` does not hold is left out, not written as `undefined`
 * (`SYSTEMDRIVE` and `WINDIR` are the runtime's to add). `source` is never spread and never changed.
 */
export function bridgedSshEnv(
  source: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  extra: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv {
  const allowed: readonly string[] = BRIDGED_ENV_EXTRA;
  const refused = Object.keys(extra).filter((name) => !allowed.includes(name));
  if (refused.length > 0) {
    throw new Error(`the bridged environment does not take: ${refused.join(', ')}`);
  }
  const names: readonly string[] = platform === 'win32' ? BRIDGED_ENV_WINDOWS : BRIDGED_ENV_POSIX;
  const taken = names.flatMap((name): [string, string][] => {
    const value = valueOf(source, platform, name);
    return value === undefined ? [] : [[name, value]];
  });
  return { ...Object.fromEntries(taken), ...blankedFor(platform), ...extra };
}

/** The three names asked for as empty strings: on win32 only. */
function blankedFor(platform: NodeJS.Platform): Record<string, string> {
  return platform === 'win32' ? Object.fromEntries(BRIDGED_ENV_BLANKED_WINDOWS.map((name) => [name, ''])) : {};
}

/** The value of a listed name in `source`: on win32 under any letter case, elsewhere exactly. */
function valueOf(source: NodeJS.ProcessEnv, platform: NodeJS.Platform, name: string): string | undefined {
  const key = platform === 'win32' ? Object.keys(source).find((candidate) => candidate.toUpperCase() === name) : name;
  return key === undefined ? undefined : source[key];
}
