'use strict';
// The `sshd` of a real run, and the text of every sshd config of the real runs (G1, E3.S2; decision 16 of
// `todo/PLAN_person_roads_pin_host_key.md`): the instrument's ONE place. `scripts/itestSshd.cjs` reads the run once, with
// `sshdRunOf(process.env)`; its `startSshd` (`sshd -d`) and the serving launcher of `scripts/itestServing.cjs` (`sshd -D -e`) write
// their config with `oneConnectionConfig` and `servingConfig`, so the lines of the run reach both from here. `test/itestInstrument.test.ts`
// (test 33) holds that no other script names an sshd by a path or writes an sshd config.
//
// Two parameters of the run, as environment variables, so that no tracked file is edited to hand them:
//   CREDS_ITEST_SSHD         the absolute path of the executable: an sshd, or a wrapper that sets its library path and `exec`s it.
//   CREDS_ITEST_SSHD_CONFIG  the absolute path of a text file; each of its lines (blank lines and `#` lines left out) is added to every
//                            sshd config the run writes: an unpacked sshd needs `SshdSessionPath` and `SshdAuthPath`.
// With neither: `SSHD_DEFAULT` and no extra line, as CI runs it (`ci-extension.yml` installs that `sshd`). A variable set to an empty
// text counts as not set. A value that cannot be used is refused, naming its variable, and is never replaced by the default.
//
// The lines of the run come after a starter's own lines and before its caller's. `sshd` keeps the FIRST value of a keyword (the manual,
// `sshd_config(5)`; read, not measured here), so a line of the run cannot change a line a starter wrote. A `Match` line is refused: it would
// take in every line the caller writes after it. Nothing is read when this module is loaded.
const fs = require('node:fs');
const path = require('node:path');

/** The executable of a run that names none. */
const SSHD_DEFAULT = '/usr/sbin/sshd';
const EXECUTABLE_VARIABLE = 'CREDS_ITEST_SSHD';
const CONFIG_VARIABLE = 'CREDS_ITEST_SSHD_CONFIG';

/** `env[name]`, or `undefined` when it is not set or empty. */
const given = (env, name) => (env[name] === undefined || env[name] === '' ? undefined : env[name]);

/** The absolute path `value` of `name`, or a refusal that names the variable. */
function absolute(name, value) {
  if (!path.isAbsolute(value)) {
    throw new TypeError(`${name} must be an absolute path; got ${JSON.stringify(value)}`);
  }
  return value;
}

/** The executable of the run: the default, or the file the variable names, which must be an executable regular file. */
function executableOf(env) {
  const named = given(env, EXECUTABLE_VARIABLE);
  if (named === undefined) {
    return SSHD_DEFAULT;
  }
  const file = absolute(EXECUTABLE_VARIABLE, named);
  try {
    fs.accessSync(file, fs.constants.X_OK);
    if (!fs.statSync(file).isFile()) {
      throw new Error('not a file');
    }
  } catch {
    throw new TypeError(`${EXECUTABLE_VARIABLE} names ${file}, which is not an executable file`);
  }
  return file;
}

/** The lines of the run's config file, or none: blank lines and `#` lines are left out; a `Match` line is refused. */
function linesOf(env) {
  const named = given(env, CONFIG_VARIABLE);
  if (named === undefined) {
    return { configFile: undefined, lines: [] };
  }
  const file = absolute(CONFIG_VARIABLE, named);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new TypeError(`${CONFIG_VARIABLE} names ${file}, which cannot be read (${error.code ?? error.message})`);
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
  const match = lines.find((line) => /^match(\s|=|$)/i.test(line));
  if (match !== undefined) {
    throw new TypeError(`${CONFIG_VARIABLE}: a Match line would take in the lines a starter's caller writes after it; got ${JSON.stringify(match)}`);
  }
  return { configFile: file, lines };
}

/** The run, read from `env`: `{ executable, configFile, lines }`, frozen. Throws a `TypeError` naming the variable that cannot be used. */
function sshdRunOf(env) {
  const { configFile, lines } = linesOf(env);
  return Object.freeze({ executable: executableOf(env), configFile, lines: Object.freeze([...lines]) });
}

/**
 * The config of a one-connection `sshd -d` (`startSshd`): `first` before the defaults (sshd keeps the first value of a keyword), then the
 * defaults, the lines of the run, and the caller's `extra`. With a run of no lines it is, byte for byte, what `startSshd` wrote before E3.S2.
 */
function oneConnectionConfig(run, { address, port, first = [], hostKeyPath, authorizedKeys, pidFile, extra = [] }) {
  return [
    `ListenAddress ${address}:${port}`,
    ...first,
    `HostKey ${hostKeyPath}`,
    `AuthorizedKeysFile ${authorizedKeys}`,
    `PidFile ${pidFile}`,
    'UsePAM no',
    'StrictModes no',
    'PasswordAuthentication no',
    'KbdInteractiveAuthentication no',
    ...run.lines,
    ...extra,
    '',
  ].join('\n');
}

/**
 * The config of a serving `sshd -D -e` (the serving launcher). `penalties` false leaves `PerSourcePenalties no` out, for an sshd older than
 * 9.8, which has no penalties. With a run of no lines and no `extra` it is, byte for byte, what `servingConfig` of
 * `itestPinnedRoads.cjs` wrote before E3.S2.
 */
function servingConfig(run, { port, hostKey, authorizedKeys, pidFile, penalties, extra = [] }) {
  return [
    `ListenAddress 127.0.0.1:${port}`,
    `HostKey ${hostKey}`,
    `AuthorizedKeysFile ${authorizedKeys}`,
    `PidFile ${pidFile}`,
    'UsePAM no',
    'StrictModes no',
    'PasswordAuthentication no',
    'KbdInteractiveAuthentication no',
    // `Connection from …` is a VERBOSE line: it is how K2's log shows that leg 2 reached it (T37). `Accepted publickey` is there at any level.
    'LogLevel VERBOSE',
    // Measured on sshd 10.2 (2026-11-17): with the default, a run of refused host keys makes the listener refuse every next connection.
    ...(penalties ? ['PerSourcePenalties no'] : []),
    ...run.lines,
    ...extra,
    '',
  ].join('\n');
}

module.exports = { SSHD_DEFAULT, EXECUTABLE_VARIABLE, CONFIG_VARIABLE, sshdRunOf, oneConnectionConfig, servingConfig };
