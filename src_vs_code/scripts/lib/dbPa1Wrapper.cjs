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

/** The keyword string of one held start: `host`, `port` and `dbname` only when named (`port` is the number, `host` and `dbname` are booleans), then the user and the two controls that keep the start short. */
function stringOf({ host = false, port, dbname = false }) {
  return [host ? "host='127.0.0.1'" : '', port === undefined ? '' : `port='${port}'`, dbname ? "dbname='pa1named'" : '', "user='pa1' sslmode='disable' gssencmode='disable'"].filter((part) => part !== '').join(' ');
}

/** One query start of `exe` with the keyword string `connection`, held: which program it is, and which listener it reached. The child is ended. */
async function heldStart(scope, exe, env, connection, listeners) {
  const args = ['-X', '-w', '-c', ' select 1', '--', connection];
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
  listener.state.addresses = [];
}

/** What one start of the matrix reached: the listener (`named`: the string's own, `marker`: the file's, `none`), the local address it connected to, and the database its start-up message named. */
function reachedBy(started, named, marker) {
  const listener = [[named, 'named'], [marker, 'marker']].find(([entry]) => entry.state.connections > 0);
  return listener === undefined ? { reached: 'none', address: undefined, database: undefined, program: started.program } : { reached: listener[1], address: listener[0].state.addresses[0], database: databaseOf(listener[0].state.first), program: started.program };
}

/**
 * The finding of PA1-i, stated for each field: which of `host`, `port` and `dbname` a `~/.postgresqlrc` steers, for a string that names the field and for a string that does not.
 * The listeners hold `0.0.0.0`, so a start reaches them on any `127.x.y.z`: the string names `127.0.0.1`, the file names `127.0.0.2`, and the address a start connected TO says which host
 * was used; the port says which listener; the start-up message says which database. Eight strings (every subset of the three fields), one start each, in a home folder that holds the file.
 */
async function steeringMatrix(scope, rig, word, major) {
  const named = await holdingListener('0.0.0.0');
  const marker = await holdingListener('0.0.0.0');
  try {
    const home = path.join(rig.dir, 'pa1i matrix home');
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, '.postgresqlrc'), `${major} 127.0.0.2:${marker.port} pa1imarker\n`);
    const env = bridgedEnv(rig.product, home);
    const rows = [];
    for (let mask = 0; mask < 8; mask += 1) {
      const names = { host: (mask & 1) !== 0, port: (mask & 2) !== 0, dbname: (mask & 4) !== 0 };
      reset(named);
      reset(marker);
      const started = await heldStart(scope, word, env, stringOf({ host: names.host, port: names.port ? named.port : undefined, dbname: names.dbname }), [named, marker]);
      const row = { names, ...reachedBy(started, named, marker), said: started.said };
      rows.push(row);
      console.log(`record (PA1-i) steering run ${mask + 1} of 8: the string names ${Object.entries(names).filter(([, on]) => on).map(([key]) => key).join(', ') || 'none of host, port, dbname'}: the start ${row.reached === 'none' ? `reached NO listener (it said ${JSON.stringify(row.said)})` : `reached the ${row.reached === 'named' ? "string's" : "marker file's"} listener, on address ${row.address} (the string says 127.0.0.1, the file 127.0.0.2), database ${row.database}`}`);
    }
    const steered = { host: (row) => row.address === '127.0.0.2', port: (row) => row.reached === 'marker', dbname: (row) => row.database === 'pa1imarker' };
    const words = Object.keys(steered).map((field) => {
      const verdict = (named_) => {
        const group = rows.filter((row) => row.names[field] === named_);
        const hits = group.filter((row) => row.reached !== 'none' && steered[field](row)).length;
        return hits === 0 ? `NOT steered (0 of ${group.length} starts took the file's value)` : `STEERED (${hits} of ${group.length} starts took the file's value)`;
      };
      return `${field}: when the string omits it, ${verdict(false)}; when the string names it, ${verdict(true)}`;
    });
    console.log(`record (PA1-i) the file \`${major} 127.0.0.2:<port> pa1imarker\` in the home folder steers: ${words.join(' | ')}`);
    noteLeg('PA1-i steering', true, words.join(' | '));
  } finally {
    await named.close();
    await marker.close();
  }
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
    const plain = await heldStart(scope, word, plainEnv, stringOf({ host: true, port: named.port }), [named, marker]);
    console.log(`record (PA1-i) no steering file: \`psql --version\` says ${JSON.stringify(versionPlain)} (major ${majorOfLine(versionPlain) ?? '?'}); ${startWords(plain, named, marker)}`);
    const first = majorOfExe(plain.program) ?? majorOfLine(versionPlain);
    const other = majors.find((major) => major !== first) ?? first;
    const twoVersions = other !== undefined && other !== first;
    reset(named);
    reset(marker);
    fs.writeFileSync(path.join(steeredHome, '.postgresqlrc'), `${other ?? first} 127.0.0.1:${marker.port} pa1imarker\n`);
    const steeredEnv = bridgedEnv(rig.product, steeredHome);
    const versionSteered = runSync(word, ['--version'], steeredEnv);
    const noPort = await heldStart(scope, word, steeredEnv, stringOf({ host: true }), [named, marker]);
    console.log(`record (PA1-i) a marker ~/.postgresqlrc "${other ?? first} 127.0.0.1:<marker port> pa1imarker" in the rig home, the string names NO port: \`psql --version\` says ${JSON.stringify(oneLine(versionSteered.text))} (major ${majorOfLine(firstLine(versionSteered.stdout)) ?? '?'}); ${startWords(noPort, named, marker)}`);
    const portSteered = marker.state.connections > 0;
    reset(named);
    reset(marker);
    const withPort = await heldStart(scope, word, steeredEnv, stringOf({ host: true, port: named.port }), [named, marker]);
    console.log(`record (PA1-i) the same file, the string names its own port: ${startWords(withPort, named, marker)}`);
    const versionMajor = majorOfLine(firstLine(versionSteered.stdout));
    const queryMajor = majorOfExe(noPort.program);
    const differs = versionMajor !== undefined && queryMajor !== undefined && versionMajor !== queryMajor;
    console.log(`record (PA1-i) control, the wrapper starts the other version: ${twoVersions ? (queryMajor === other ? 'SHOWN (the marker named it and it ran)' : `NOT shown (the marker named ${other} and ${queryMajor ?? 'none'} ran)`) : 'NOT shown (one psql version is installed)'}`);
    console.log(`record (PA1-i) the wrapper's choice, by the program each start runs (the majors installed: ${majors.join(' ') || 'none'}): with no file, \`psql --version\` is major ${majorOfLine(versionPlain) ?? '?'} and the query start is major ${majorOfExe(plain.program) ?? '?'}; with a ~/.postgresqlrc that names major ${other ?? first}, \`psql --version\` is major ${versionMajor ?? '?'} and the query start is major ${queryMajor ?? '?'}${twoVersions ? '' : ' (only one major is installed, so the file names the one there is and shows nothing of the wrapper\'s choice)'}`);
    noteLeg('PA1-i psql', twoVersions && queryMajor === other, `the version start and the query start ${differs ? 'DIFFER' : 'agree'} under a file in the home folder; the file ${portSteered ? 'STEERS the port of a string that names none' : 'did not steer the port'}`);
    await steeringMatrix(scope, rig, word, other ?? first);
    if (differs) {
      stop('PA1-i', 'a file under the home folder makes the version start and the query start differ: the pair is not turned to served on this image, and the row returns to the lead (§S7.4, the decision of PA1-i)');
    }
  } finally {
    await named.close();
    await marker.close();
  }
}

module.exports = { legH, legI };
