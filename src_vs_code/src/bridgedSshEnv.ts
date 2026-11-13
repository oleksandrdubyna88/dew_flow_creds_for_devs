/**
 * The environment of a bridged child (parent §4.9 row 5, the E1.6 spec §S6.3): a NEW object built from an allow-list, never the extension
 * host's environment spread into it. Pure and `vscode`-free, so the `ssh` of a bridged `ssh:exec`, the database client of a bridged `query`
 * and E2.2's helper execs all take their environment from this one function.
 *
 * <p>What is NOT here matters as much: no `SSH_AUTH_SOCK` (the agent), no `CREDS_REF_*`, no `PGOPTIONS`, `PGSERVICE`, `PGPASSFILE`,
 * `MYSQL_HOME`, no `LD_PRELOAD`. Anything the person's shell exported would otherwise ride into a process an agent's command shapes.</p>
 */

export const BRIDGED_ENV_POSIX = ['PATH', 'HOME'] as const;
export const BRIDGED_ENV_WINDOWS = ['PATH', 'SYSTEMROOT', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'COMSPEC'] as const;

/**
 * The only names a caller may add as `extra`: the four of an askpass password (for a password destination only) and the four database
 * client variables the launcher sets (`buildDbQueryLaunch`'s `env`).
 */
export const BRIDGED_ENV_EXTRA = ['SSH_ASKPASS', 'SSH_ASKPASS_REQUIRE', 'CREDS_SSH_PASSWORD', 'DISPLAY',
  'PGPASSWORD', 'MYSQL_PWD', 'SQLCMDPASSWORD', 'SQLCMDUSER'] as const;

/**
 * A NEW object: each listed name that `source` holds, then `extra`. It throws on an `extra` name that is not in `BRIDGED_ENV_EXTRA`, and the
 * message names that key, never a value. On `win32` a listed name is found in `source` in any letter case and written under the list's
 * spelling. A name that `source` does not hold is left out, not written as `undefined`. `source` is never spread and never changed.
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
  return { ...Object.fromEntries(taken), ...extra };
}

/** The value of a listed name in `source`: on win32 under any letter case, elsewhere exactly. */
function valueOf(source: NodeJS.ProcessEnv, platform: NodeJS.Platform, name: string): string | undefined {
  const key = platform === 'win32' ? Object.keys(source).find((candidate) => candidate.toUpperCase() === name) : name;
  return key === undefined ? undefined : source[key];
}
