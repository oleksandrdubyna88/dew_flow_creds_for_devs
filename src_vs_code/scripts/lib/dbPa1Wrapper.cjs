'use strict';
// PA1-h and PA1-i (E1.7 spec §S7.4): what each image carries, and which FILE a program word is (N10). On Debian and Ubuntu the `psql` on `PATH` is a link to a script of
// the packaging (`pg_wrapper`) that chooses which installed version to start; the check reads the version of ONE start and the query is ANOTHER start, so the question is
// whether a file under the person's home folder can make the two start different programs. RECORD legs: the client's start is held and its program is read from
// `/proc/<pid>/exe`, once with no steering file and then with a marker `~/.postgresqlrc`.
//
// Two markers, because the third run's marker named a REMOTE cluster (`<major> <host>:<port> <db>`) and the wrapper started the newest major whatever it named (it follows a file for the
// cluster of this machine, not for a remote one): the remote marker stays, as the steering matrix needs it (which of host, port and database a file fills in); the control of the wrapper's
// choice is a marker that names a LOCAL cluster of the other installed major (`<major> pa1ilocal postgres`), a real cluster made with that major's own `pg_createcluster` under the system
// rig (`CI=true` and `BRIDGED_DB_SYSTEM_RIG=1`) and dropped by the scope. The program each of the two spawns started (`psql --version`, and the query) is printed with and without the marker. A wrapper
// that does not follow the file for a local cluster either is `UNMEASURED`, with the reason.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launch, endChild } = require('../itestSshd.cjs');
const { IS_WINDOWS, holdingListener, pause, bridgedEnv, runSync, oneLine, firstLine, resolveProgram, describeFile, noteLeg, unmeasured, stop, mayWriteSystem } = require('./dbProbeRig.cjs');

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

/** The name of the local cluster the rig makes: the packaging's `pg_wrapper` finds a cluster by its version and its name under `/etc/postgresql`. */
const CLUSTER_NAME = 'pa1ilocal';

/** The program a process runs, by `/proc/<pid>/exe`, or `undefined` (it ended, or the link cannot be read). */
function exeOfProcess(pid) {
  try {
    return fs.readlinkSync(`/proc/${pid}/exe`);
  } catch {
    return undefined;
  }
}

/**
 * A real LOCAL cluster of `major`, for the wrapper to be pointed at by name (R3: a cluster is made under `/etc/postgresql` and under `/var/run/postgresql`, with `sudo`, only on a CI runner whose step
 * says so). The major's own `pg_createcluster` makes it, owned by the runner's user, its data and socket folders in the owned folder of the harness, the packaging's `peer` login on the socket (the owner is the OS user), on a free port; its own
 * `pg_ctlcluster` starts it. The scope drops it (`pg_dropcluster --stop`) on every way out. `{ ok, why, port, sock, activity }`: `activity()` is how many sessions of the held query the cluster has.
 */
async function makeLocalCluster(scope, rig, major) {
  if (!mayWriteSystem()) {
    return { ok: false, why: 'a cluster of the packaging (under /etc/postgresql) is made only on a CI runner whose step sets BRIDGED_DB_SYSTEM_RIG=1 (rule R3)' };
  }
  const create = resolveProgram('pg_createcluster');
  const control = resolveProgram('pg_ctlcluster');
  const drop = resolveProgram('pg_dropcluster');
  if (create === undefined || control === undefined || drop === undefined) {
    return { ok: false, why: 'pg_createcluster, pg_ctlcluster or pg_dropcluster (the postgresql-common packaging) is not on PATH' };
  }
  const server = `/usr/lib/postgresql/${major}/bin`;
  const data = path.join(rig.dir, 'pa1i-data');
  const sock = path.join(rig.dir, 'pa1i-sock');
  fs.mkdirSync(sock, { recursive: true });
  fs.mkdirSync(path.join(rig.dir, 'pa1i local home'), { recursive: true });
  const taken = await holdingListener();
  const port = taken.port;
  await taken.close();
  scope.after(() => runSync('sudo', ['-n', drop, '--stop', major, CLUSTER_NAME], process.env, 120_000));
  const made = runSync('sudo', ['-n', create, major, CLUSTER_NAME, '-u', os.userInfo().username, '-d', data, '-s', sock, '-p', String(port), '--start-conf', 'manual', '--locale', 'C', '-e', 'UTF8'], process.env, 180_000);
  if (made.code !== 0) {
    return { ok: false, why: `pg_createcluster ${major} ${CLUSTER_NAME} failed (exit ${made.code}): ${oneLine(made.text, 300)}` };
  }
  const started = runSync('sudo', ['-n', control, '--skip-systemctl-redirect', major, CLUSTER_NAME, 'start'], process.env, 120_000);
  const env = bridgedEnv(rig.product, path.join(rig.dir, 'pa1i local home'));
  const own = (query) => runSync(path.join(server, 'psql'), ['-X', '-w', '-h', sock, '-p', String(port), '-d', 'postgres', '-Atc', query], env);
  let up = own('select 1');
  for (let waited = 0; waited < 15_000 && up.stdout.trim() !== '1'; waited += 500) {
    await pause(500);
    up = own('select 1');
  }
  if (up.stdout.trim() !== '1') {
    return { ok: false, why: `the cluster ${major}/${CLUSTER_NAME} did not answer (pg_ctlcluster start: exit ${started.code}, ${oneLine(started.text, 200)}; its own psql said ${oneLine(up.text, 200)})` };
  }
  return { ok: true, port, sock, activity: () => Number(own("select count(*) from pg_stat_activity where query like 'select pg_sleep(30)%' and pid <> pg_backend_pid()").stdout.trim()) };
}

/**
 * One query start through the wrapper, held in a query that sleeps, with no connection string (so what the cluster file names is all that points it): which program it is (read from `/proc` once the wrapper has
 * handed over to a `psql` of a major), and whether the cluster answered it (a session of the held query). The child is ended.
 */
async function heldClusterStart(scope, word, env, cluster) {
  const child = launch(scope, word, ['-X', '-w', '-c', 'select pg_sleep(30)'], { env });
  try {
    let program;
    for (let waited = 0; waited < 10_000 && !child.exited; waited += 100) {
      program = exeOfProcess(child.child.pid);
      if (majorOfExe(program) !== undefined) {
        break;
      }
      await pause(100);
    }
    let sessions = 0;
    for (let waited = 0; waited < 5_000 && sessions === 0 && !child.exited; waited += 250) {
      sessions = cluster.activity();
      if (sessions === 0) {
        await pause(250);
      }
    }
    return { program, sessions, said: oneLine(child.stderr + child.stdout, 200) };
  } finally {
    await endChild(child);
  }
}

/**
 * PA1-i, the control of the wrapper's choice: a `~/.postgresqlrc` that names a LOCAL cluster of the major the wrapper does not start by default. The version spawn and the query spawn each print the
 * program they started. The control is SHOWN when the query spawn started the named major; when it did not, or when the cluster cannot be made, the leg is `UNMEASURED` with the reason.
 * `{ differs }`: the two spawns started different majors under the file.
 */
async function localClusterLeg(scope, rig, word, majors, first, versionPlain) {
  const withServer = majors.filter((major) => major !== first && fs.existsSync(`/usr/lib/postgresql/${major}/bin/initdb`));
  const other = withServer.at(-1);
  if (other === undefined) {
    unmeasured('PA1-i local-cluster marker', `no installed major other than the wrapper's default (${first ?? '?'}) has a server to make a cluster with (majors: ${majors.join(' ') || 'none'}; the ones with initdb: ${majors.filter((major) => fs.existsSync(`/usr/lib/postgresql/${major}/bin/initdb`)).join(' ') || 'none'}): the file cannot name a local cluster of another major, so the wrapper's choice is not shown`);
    return { differs: false };
  }
  const cluster = await makeLocalCluster(scope, rig, other);
  if (!cluster.ok) {
    unmeasured('PA1-i local-cluster marker', `the local cluster of major ${other} was not made: ${cluster.why}; the wrapper's choice is not shown`);
    return { differs: false };
  }
  const home = path.join(rig.dir, 'pa1i local home');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, '.postgresqlrc'), `${other} ${CLUSTER_NAME} postgres\n`);
  const env = bridgedEnv(rig.product, home);
  const version = runSync(word, ['--version'], env);
  const versionMajor = majorOfLine(firstLine(version.stdout));
  const query = await heldClusterStart(scope, word, env, cluster);
  const queryMajor = majorOfExe(query.program);
  console.log(`record (PA1-i) a LOCAL-cluster marker ~/.postgresqlrc "${other} ${CLUSTER_NAME} postgres" (a real cluster of major ${other}, made by its own pg_createcluster, up on port ${cluster.port}): with no file the version spawn started major ${majorOfLine(versionPlain) ?? '?'}; with the file the version spawn \`psql --version\` started major ${versionMajor ?? '?'} (by its own line ${JSON.stringify(oneLine(version.text))}) and the query spawn started ${query.program ?? 'a program that could not be read (it ended first)'} (major ${queryMajor ?? '?'}); the cluster ${query.sessions > 0 ? 'ANSWERED the query spawn (a session of the held query is in it)' : 'had no session of the held query'}${query.said === '' ? '' : `; the query spawn said ${JSON.stringify(query.said)}`}`);
  const differs = versionMajor !== undefined && queryMajor !== undefined && versionMajor !== queryMajor;
  if (queryMajor === other) {
    console.log(`record (PA1-i) control, the wrapper starts the other version for a local cluster: SHOWN (the file named major ${other}; the query spawn ran it${versionMajor === other ? ' and so did the version spawn' : `, and the version spawn ran major ${versionMajor ?? '?'}`})`);
    noteLeg('PA1-i psql local-cluster marker', true, `the version spawn ran major ${versionMajor ?? '?'}, the query spawn major ${queryMajor}; the two ${differs ? 'DIFFER' : 'agree'}`);
  } else {
    unmeasured('PA1-i local-cluster marker', `the wrapper never followed the file for a local cluster either: the file named major ${other} (cluster ${CLUSTER_NAME}, up and answering) and the query spawn started ${query.program ?? 'a program that could not be read'} (major ${queryMajor ?? '?'}), the version spawn major ${versionMajor ?? '?'}; the cluster ${query.sessions > 0 ? 'was reached' : 'was not reached'}`);
  }
  return { differs };
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
    console.log(`record (PA1-i) no steering file: the version spawn \`psql --version\` started major ${majorOfLine(versionPlain) ?? '?'} (by its own line ${JSON.stringify(versionPlain)}); ${startWords(plain, named, marker)}`);
    const first = majorOfExe(plain.program) ?? majorOfLine(versionPlain);
    const other = majors.find((major) => major !== first) ?? first;
    const twoVersions = other !== undefined && other !== first;
    reset(named);
    reset(marker);
    fs.writeFileSync(path.join(steeredHome, '.postgresqlrc'), `${other ?? first} 127.0.0.1:${marker.port} pa1imarker\n`);
    const steeredEnv = bridgedEnv(rig.product, steeredHome);
    const versionSteered = runSync(word, ['--version'], steeredEnv);
    const noPort = await heldStart(scope, word, steeredEnv, stringOf({ host: true }), [named, marker]);
    console.log(`record (PA1-i) a REMOTE-cluster marker ~/.postgresqlrc "${other ?? first} 127.0.0.1:<marker port> pa1imarker" in the rig home, the string names NO port: the version spawn started major ${majorOfLine(firstLine(versionSteered.stdout)) ?? '?'} (by its own line ${JSON.stringify(oneLine(versionSteered.text))}); ${startWords(noPort, named, marker)}`);
    const portSteered = marker.state.connections > 0;
    reset(named);
    reset(marker);
    const withPort = await heldStart(scope, word, steeredEnv, stringOf({ host: true, port: named.port }), [named, marker]);
    console.log(`record (PA1-i) the same remote-cluster file, the string names its own port: ${startWords(withPort, named, marker)}`);
    const versionMajor = majorOfLine(firstLine(versionSteered.stdout));
    const queryMajor = majorOfExe(noPort.program);
    const differs = versionMajor !== undefined && queryMajor !== undefined && versionMajor !== queryMajor;
    console.log(`record (PA1-i) remote-cluster marker, does the wrapper start the major it names: ${twoVersions ? (queryMajor === other ? 'YES (the marker named it and it ran)' : `NO (the marker named ${other} and ${queryMajor ?? 'none'} ran: the wrapper does not follow a file for a remote cluster, so this marker is no control of its choice; the local-cluster marker below is)`) : 'not measured (one psql version is installed)'}`);
    console.log(`record (PA1-i) the wrapper's choice with the remote-cluster marker, by the program each start runs (the majors installed: ${majors.join(' ') || 'none'}): with no file, \`psql --version\` is major ${majorOfLine(versionPlain) ?? '?'} and the query start is major ${majorOfExe(plain.program) ?? '?'}; with a ~/.postgresqlrc that names major ${other ?? first}, \`psql --version\` is major ${versionMajor ?? '?'} and the query start is major ${queryMajor ?? '?'}${twoVersions ? '' : ' (only one major is installed, so the file names the one there is and shows nothing of the wrapper\'s choice)'}`);
    noteLeg('PA1-i psql remote-cluster marker', true, `the version start and the query start ${differs ? 'DIFFER' : 'agree'} under a file in the home folder; the file ${portSteered ? 'STEERS the port of a string that names none' : 'did not steer the port'}`);
    await steeringMatrix(scope, rig, word, other ?? first);
    const local = await localClusterLeg(scope, rig, word, majors, first, versionPlain);
    if (differs || local.differs) {
      stop('PA1-i', 'a file under the home folder makes the version start and the query start differ: the pair is not turned to served on this image, and the row returns to the lead (§S7.4, the decision of PA1-i)');
    }
  } finally {
    await named.close();
    await marker.close();
  }
}

module.exports = { legH, legI };
