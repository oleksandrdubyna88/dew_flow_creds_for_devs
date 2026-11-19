'use strict';
// PA1, the legs of the `mysql` and `sqlcmd` clients (E1.7 spec §S7.4: PA1-a, PA1-d, PA1-e, PA1-f). RECORD legs: each prints what the client did beside its
// positive control (the same run with no candidate) and its negative control (a flag that does not exist), and fails only for the rig's own faults.
// The legs of `psql` are in `dbPa1Psql.cjs`.
const fs = require('node:fs');
const path = require('node:path');
const { launch, endChild } = require('../itestSshd.cjs');
const crypto = require('node:crypto');
const { fakeServer, within } = require('./mysqlFake.cjs');
const { check, bridgedEnv, runSync, oneLine, firstLine, buildTagOf, versionOfClient, reachedRun, noteLeg, unmeasured, IS_WINDOWS } = require('./dbProbeRig.cjs');

const INVENTED_FLAG = '--pa1-not-a-flag';
const ABSENT_PLUGIN = 'pa1_absent_plugin';

/**
 * PA1-a: the version flag, under the bridged environment: the whole line, its stream, the exit code, the build tag. The version itself is read where the client's own family puts it
 * (`mysql  Ver 8.4.13`, `Distrib 10.6.23-MariaDB`, `Version: v1.10.0`), never as the first dotted number of the line: a path (Oracle's client on Windows) or the client protocol number
 * (MariaDB 10.x) has one, and neither `sqlcmd` has a version on its first line. The line goes to R1.
 */
function legA(client, rig) {
  const env = bridgedEnv(rig.product, rig.home);
  const flags = client.family.endsWith('sqlcmd') ? ['--version', '-?'] : ['--version'];
  let versionLine;
  for (const flag of flags) {
    const answer = runSync(client.exe, [flag], env);
    const line = firstLine(answer.stdout !== '' ? answer.stdout : answer.stderr);
    if (flag === '--version') {
      versionLine = line;
    }
    const read = versionOfClient(client.family, answer.text);
    const said = read === undefined ? 'the answer holds no version of this family\'s kind' : `the version it says: ${read.number}, from the line ${JSON.stringify(read.line)}`;
    console.log(`record (PA1-a) ${client.family} ${flag}: exit ${answer.code}; the first line came on ${answer.stdout !== '' ? 'stdout' : 'stderr'}: ${JSON.stringify(line)}; ${said}; the build tag (everything after the version): ${JSON.stringify(buildTagOf(read === undefined ? line : read.line, client.family))}`);
  }
  return versionLine;
}

/** The ODBC client's driver, read from the rig and not from the client (N16): Linux `odbcinst`, Windows the driver list. */
function odbcDrivers() {
  const answer = IS_WINDOWS
    ? runSync('powershell', ['-NoProfile', '-Command', 'Get-OdbcDriver | ForEach-Object { $_.Name }'], process.env)
    : runSync('odbcinst', ['-q', '-d'], process.env);
  console.log(`record (PA1-a) odbc-sqlcmd, the driver the rig lists: exit ${answer.code}; ${JSON.stringify(oneLine(answer.text, 300))}`);
}

/** The arguments that connect a client to the listener at `port`, with one candidate among them: `mysql` by TCP, `sqlcmd` with a SQL login named. */
const connectArgs = (client, port, candidate) => (client.family === 'oracle' || client.family === 'mariadb'
  ? ['--no-defaults', '--protocol=TCP', '-h', '127.0.0.1', '-P', String(port), '-u', 'pa1', ...candidate, '-e', 'select 1']
  : ['-S', `127.0.0.1,${port}`, '-U', 'pa1', '-Q', 'select 1', ...candidate]);

/**
 * The shared shape of PA1-d and PA1-f. A flag is KNOWN when the client read every flag and went on to connect: the run's listener holds the connection, and the
 * client is ended. (A version flag is no test: both `mysql` clients print their version at `--version` and read no flag after it.) The positive control is the run
 * with no candidate, which must connect; the negative control is a flag that does not exist, which the client refuses in its own words.
 */
async function flagLegs(scope, leg, client, rig, candidates) {
  const sealed = `probe-${crypto.randomBytes(6).toString('hex')}`; // a throwaway for the SQL login the `sqlcmd` run names; the listener never reads it
  const env = bridgedEnv(rig.product, rig.home, client.family.endsWith('sqlcmd') ? { SQLCMDPASSWORD: sealed } : {});
  const run = (candidate) => reachedRun(scope, client.exe, (port) => connectArgs(client, port, candidate), env);
  const control = await run([]);
  console.log(`record (${leg}) ${client.family} control, no candidate: ${control.reached ? 'the client connected' : 'the client did NOT connect'}; exit ${control.code}; it said ${JSON.stringify(control.said)}`);
  check(`(${leg}) ${client.family} control: the run with no candidate connects to the listener (without it a refusal below proves nothing)`, control.reached, JSON.stringify(control));
  const invented = await run([INVENTED_FLAG]);
  console.log(`record (${leg}) ${client.family} a flag that does not exist (${INVENTED_FLAG}): ${invented.reached ? 'it went ON and connected (the client ignores an unknown flag)' : 'refused, no connection'}; exit ${invented.code}; it said ${JSON.stringify(invented.said)}`);
  noteLeg(`${leg} ${client.family} control`, control.reached, `an unknown flag: ${invented.reached ? 'IGNORED' : 'refused'}`);
  if (control.reached && invented.reached) {
    console.log(`STOP (${leg}, ${client.family}): the client ignores a flag it does not know and goes on — the database client check is then its only lock (parent §7, row PA1)`);
  }
  for (const candidate of candidates) {
    const answer = await run(candidate);
    console.log(`record (${leg}) ${client.family} ${candidate.join(' ')}: ${answer.reached ? 'KNOWN (the client read it and connected)' : 'not known, or refused before connecting'}; exit ${answer.code}; it said ${JSON.stringify(answer.said)}`);
    noteLeg(`${leg} ${client.family} ${candidate.join(' ')}`, control.reached, answer.reached ? 'known' : 'not known or refused');
  }
}

/** PA1-d: `--plugin-dir` at a path nothing writes, `--skip-enable-cleartext-plugin`, and (MariaDB's client) `--restricted-auth` with a list. */
function legD(scope, client, rig) {
  const candidates = [[`--plugin-dir=${rig.absentFile}`], ['--skip-enable-cleartext-plugin']];
  if (client.family === 'mariadb') {
    candidates.push(['--restricted-auth=mysql_native_password,caching_sha2_password']);
  }
  return flagLegs(scope, 'PA1-d', client, rig, candidates);
}

/** PA1-f: each candidate flag of the spec's §S7.5 and §S7.9 on a `sqlcmd`. */
function legF(scope, client, rig) {
  const candidates = [['--authentication-method=SqlPassword'], ['-N'], ['-N', 'true'], ['-N', 'strict'], ['-C'], ['-l', '5'], ['-b'], ['-x']];
  return flagLegs(scope, 'PA1-f', client, rig, candidates);
}

/** The folder the client names when the server switches its login to a plugin that is not there (Oracle's client); `undefined` when the client says nothing of the kind. */
async function folderByWords(scope, client, rig) {
  const { server } = fakeServer(undefined, { switchTo: ABSENT_PLUGIN });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const args = ['--no-defaults', '--protocol=TCP', '-h', '127.0.0.1', '-P', String(server.address().port), '-u', 'pa1', '-e', 'select 1'];
  const child = launch(scope, client.exe, args, { env: bridgedEnv(rig.product, rig.home) });
  try {
    await within(child.closed.then(() => true), 8_000, false);
    const found = new RegExp(String.raw`((?:[A-Za-z]:)?[\\/][^'":\r\n]*?)[\\/]+${ABSENT_PLUGIN}`).exec(child.stderr + child.stdout);
    return { folder: found?.[1], said: oneLine(child.stderr + child.stdout, 300) };
  } finally {
    await endChild(child);
    await new Promise((resolve) => server.close(resolve));
  }
}

/** The folder compiled into the client or into the client library it loads (MariaDB's client waits for the server after a switch to a missing plugin and says nothing): the program's own strings, then `ldd`'s library. Linux only. */
function folderByLibrary(client) {
  if (IS_WINDOWS) {
    return undefined;
  }
  const line = runSync('ldd', [client.exe], process.env).stdout.split('\n').find((text) => /libmariadb\.so|libmysqlclient\.so/.test(text));
  const library = /=>\s*(\S+)/.exec(line ?? '')?.[1];
  const files = [client.exe, ...(library !== undefined && fs.existsSync(library) ? [library] : [])];
  const strings = files.flatMap((file) => fs.readFileSync(file).toString('latin1').match(/\/[A-Za-z0-9_./-]*\/plugin(?=\0)/g) ?? []); // NOSONAR: a bounded read of a client's own binary, for a path string
  return strings.find((text) => fs.existsSync(text));
}

/** PA1-e: the files of the client's own plugin folder are the loadable authentication plugins of that build (a plugin linked into the client is no file, N11). */
async function legE(scope, client, rig) {
  const byWords = await folderByWords(scope, client, rig);
  const folder = byWords.folder !== undefined && fs.existsSync(byWords.folder) ? byWords.folder : folderByLibrary(client);
  const how = folder === byWords.folder ? "the client's own words when the server switched the login to a plugin that is not there" : 'the folder string compiled into the client library';
  if (folder === undefined && byWords.folder !== undefined) {
    console.log(`record (PA1-e) ${client.family}: the client looked for a plugin in ${byWords.folder}, which does not exist on this runner: it has no loadable authentication plugin file there`);
    noteLeg(`PA1-e ${client.family}`, true, 'the plugin folder the client named does not exist');
    return;
  }
  if (folder === undefined) {
    unmeasured(`PA1-e ${client.family}`, `neither the client's words nor its library named a plugin folder that exists (it said ${JSON.stringify(byWords.said)})`);
    return;
  }
  const names = fs.readdirSync(folder).sort((a, b) => a.localeCompare(b));
  console.log(`record (PA1-e) ${client.family}: the plugin folder, found by ${how}: ${folder}; ${names.length} file(s): ${names.join(' ') || '(none)'}`);
  noteLeg(`PA1-e ${client.family}`, true, `${names.length} file(s) in ${path.basename(path.dirname(folder))}/${path.basename(folder)}`);
}

module.exports = { legA, odbcDrivers, legD, legE, legF };
