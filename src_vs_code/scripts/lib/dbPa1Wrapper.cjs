'use strict';
// PA1-h and PA1-i (E1.7 spec §S7.4): what each image carries, and which FILE a program word is (N10). On Debian and Ubuntu the `psql` on `PATH` is a link to a script of
// the packaging (`pg_wrapper`) that chooses which installed version to start; the check reads the version of ONE start and the query is ANOTHER start, so the question is
// whether a file under the person's home folder can make the two start different programs. RECORD legs: the client's start is held at a listener and its program is read
// from `/proc/<pid>/exe`, once with no steering file and once with a marker `~/.postgresqlrc` that names a listener of the rig and, when two versions are installed,
// the other version (the positive control: the wrapper starts the other one).
const fs = require('node:fs');
const path = require('node:path');
const { launch, endChild } = require('../itestSshd.cjs');
const { IS_WINDOWS, holdingListener, pause, bridgedEnv, runSync, oneLine, firstLine, resolveProgram, describeFile, noteLeg, stop } = require('./dbProbeRig.cjs');

/** PA1-h: the servers, the tools and the services this runner carries: the list the rigs of §S7.3 are built from. */
function legH() {
  const tools = ['docker', 'openssl', 'sudo', 'mysqld', 'mariadbd', 'odbcinst', 'krb5kdc', 'kinit', 'sqlcmd'];
  const present = tools.map((tool) => `${tool}=${resolveProgram(tool) ?? 'absent'}`);
  console.log(`record (PA1-h) tools on PATH: ${present.join('; ')}`);
  if (IS_WINDOWS) {
    const root = process.env.ProgramFiles ?? 'C:\\Program Files';
    for (const folder of ['PostgreSQL', 'MySQL', 'MariaDB', 'Microsoft SQL Server']) {
      const where = path.join(root, folder);
      console.log(`record (PA1-h) ${where}: ${fs.existsSync(where) ? fs.readdirSync(where).join(' ') : 'absent'}`);
    }
    const services = runSync('powershell', ['-NoProfile', '-Command', "Get-Service | Where-Object { $_.Name -match 'postgres|mysql|maria|mssql|sql' } | ForEach-Object { $_.Name + ':' + $_.Status }"], process.env);
    console.log(`record (PA1-h) services: ${JSON.stringify(oneLine(services.text, 400))}`);
    return;
  }
  const lib = '/usr/lib/postgresql';
  const versions = fs.existsSync(lib) ? fs.readdirSync(lib).filter((name) => /^\d+$/.test(name)) : [];
  const parts = versions.map((version) => `${version}: ${['psql', 'postgres', 'initdb'].map((name) => `${name}=${fs.existsSync(path.join(lib, version, 'bin', name))}`).join(' ')}`);
  console.log(`record (PA1-h) PostgreSQL under ${lib}: ${parts.join(' | ') || 'none'}`);
  const units = runSync('systemctl', ['list-unit-files', '--no-pager'], process.env);
  const lines = units.stdout.split('\n').filter((line) => /postgres|mysql|maria|mssql/i.test(line)).map((line) => line.trim().replaceAll(/\s+/g, ' '));
  console.log(`record (PA1-h) service units: ${lines.join('; ') || 'none listed'}`);
}

/** The installed `psql` versions (their majors), by the folders of the packaging, lowest first. */
const installedMajors = () => (fs.existsSync('/usr/lib/postgresql') ? fs.readdirSync('/usr/lib/postgresql').filter((name) => /^\d+$/.test(name) && fs.existsSync(`/usr/lib/postgresql/${name}/bin/psql`)).sort((a, b) => Number(a) - Number(b)) : []);

/** The major a `psql --version` line names: `psql (PostgreSQL) 16.4 (...)`. */
const majorOfLine = (line) => /(\d+)(?:\.\d+)*/.exec(line.replace('(PostgreSQL)', ''))?.[1];

/** The major of the program a process runs: `/usr/lib/postgresql/<major>/bin/psql`. */
const majorOfExe = (exe) => /\/postgresql\/(\d+)\/bin\//.exec(exe ?? '')?.[1];

/** The database a start-up message names (its first bytes: a length, a protocol code, then NUL-ended names and values); a request for encryption names none. */
function databaseOf(chunk) {
  if (chunk === undefined || chunk.length < 8) {
    return undefined;
  }
  const fields = chunk.subarray(8).toString('utf8').split('\0');
  const at = fields.indexOf('database');
  return at >= 0 ? fields[at + 1] : '(none named)';
}

/** One query start of `exe`, held: which program it is, and which listener it reached. The child is ended. */
async function heldStart(scope, exe, env, port, listeners) {
  const args = ['-X', '-w', '-c', ' select 1', '--', `host='127.0.0.1' ${port === undefined ? '' : `port='${port}' `}user='pa1' sslmode='disable' gssencmode='disable'`];
  const child = launch(scope, exe, args, { env });
  try {
    const reached = () => listeners.some((listener) => listener.state.connections > 0);
    for (let waited = 0; waited < 10_000 && !reached() && !child.exited; waited += 100) {
      await pause(100);
    }
    let program;
    try {
      program = fs.readlinkSync(`/proc/${child.child.pid}/exe`);
    } catch {
      program = undefined;
    }
    return { program, said: oneLine(child.stderr + child.stdout, 200) };
  } finally {
    await endChild(child);
  }
}

/** What a start did, in words: its program, and the listener it reached (the string's or the file's). */
function startWords(start, named, marker) {
  const where = [[named, "the string's port"], [marker, "the marker file's port"]].filter(([listener]) => listener.state.connections > 0).map(([listener, name]) => `${name} (database ${databaseOf(listener.state.first)})`);
  return `the query start is ${start.program ?? 'not readable (it ended first)'} (major ${majorOfExe(start.program) ?? '?'}); it reached ${where.join(' and ') || 'NO listener'}${start.said === '' ? '' : `; it said ${JSON.stringify(start.said)}`}`;
}

/** Resets a listener's counters between two starts. */
function reset(listener) {
  listener.state.connections = 0;
  listener.state.first = undefined;
}

/** PA1-i on Debian and Ubuntu; elsewhere a printed fact. `psqlWord` is the file the bridged `PATH` resolves the program word to. */
async function legI(scope, rig) {
  const word = resolveProgram('psql');
  if (word === undefined) {
    console.log('record (PA1-i) psql: the program word is on no folder of PATH: not measured');
    return;
  }
  const file = describeFile(word);
  const majors = installedMajors();
  console.log(`record (PA1-i) psql resolves to ${word}; its real path is ${file.real}; it ${file.script ? 'IS' : 'is not'} a script; installed psql majors under /usr/lib/postgresql: ${majors.join(' ') || 'none'}`);
  if (process.platform !== 'linux' || !fs.existsSync('/proc/self/exe')) {
    console.log('record (PA1-i) the started program cannot be read from /proc on this system: the version-versus-query comparison is not measured');
    return;
  }
  const named = await holdingListener();
  const marker = await holdingListener();
  try {
    const plainHome = path.join(rig.dir, 'pa1i plain home');
    const steeredHome = path.join(rig.dir, 'pa1i steered home');
    fs.mkdirSync(plainHome, { recursive: true });
    fs.mkdirSync(steeredHome, { recursive: true });
    const plainEnv = bridgedEnv(rig.product, plainHome);
    const versionPlain = firstLine(runSync(word, ['--version'], plainEnv).stdout);
    const plain = await heldStart(scope, word, plainEnv, named.port, [named, marker]);
    console.log(`record (PA1-i) no steering file: \`psql --version\` says ${JSON.stringify(versionPlain)} (major ${majorOfLine(versionPlain) ?? '?'}); ${startWords(plain, named, marker)}`);
    const first = majorOfExe(plain.program) ?? majorOfLine(versionPlain);
    const other = majors.find((major) => major !== first) ?? first;
    const twoVersions = other !== undefined && other !== first;
    reset(named);
    reset(marker);
    fs.writeFileSync(path.join(steeredHome, '.postgresqlrc'), `${other ?? first} 127.0.0.1:${marker.port} pa1imarker\n`);
    const steeredEnv = bridgedEnv(rig.product, steeredHome);
    const versionSteered = runSync(word, ['--version'], steeredEnv);
    const noPort = await heldStart(scope, word, steeredEnv, undefined, [named, marker]);
    console.log(`record (PA1-i) a marker ~/.postgresqlrc "${other ?? first} 127.0.0.1:<marker port> pa1imarker" in the rig home, the string names NO port: \`psql --version\` says ${JSON.stringify(oneLine(versionSteered.text))} (major ${majorOfLine(firstLine(versionSteered.stdout)) ?? '?'}); ${startWords(noPort, named, marker)}`);
    const portSteered = marker.state.connections > 0;
    reset(named);
    reset(marker);
    const withPort = await heldStart(scope, word, steeredEnv, named.port, [named, marker]);
    console.log(`record (PA1-i) the same file, the string names its own port: ${startWords(withPort, named, marker)}`);
    const versionMajor = majorOfLine(firstLine(versionSteered.stdout));
    const queryMajor = majorOfExe(noPort.program);
    const differs = versionMajor !== undefined && queryMajor !== undefined && versionMajor !== queryMajor;
    console.log(`record (PA1-i) control, the wrapper starts the other version: ${twoVersions ? (queryMajor === other ? 'SHOWN (the marker named it and it ran)' : `NOT shown (the marker named ${other} and ${queryMajor ?? 'none'} ran)`) : 'NOT shown (one psql version is installed)'}`);
    noteLeg('PA1-i psql', twoVersions && queryMajor === other, `the version start and the query start ${differs ? 'DIFFER' : 'agree'} under a file in the home folder; the file ${portSteered ? 'STEERS the port of a string that names none' : 'did not steer the port'}`);
    if (differs) {
      stop('PA1-i', 'a file under the home folder makes the version start and the query start differ: the pair is not turned to served on this image, and the row returns to the lead (§S7.4, the decision of PA1-i)');
    }
  } finally {
    await named.close();
    await marker.close();
  }
}

module.exports = { legH, legI };
