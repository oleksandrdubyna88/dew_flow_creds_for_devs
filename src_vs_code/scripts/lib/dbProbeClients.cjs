'use strict';
// Which database clients a runner carries, and which of them each file is (E1.7 spec §S7.4 PA1-a and PA1-h). A client is found by an environment name the
// workflow sets (`BRIDGED_PSQL`, `BRIDGED_MYSQL_ORACLE`, `BRIDGED_MYSQL_MARIADB`, `BRIDGED_SQLCMD_GO`, `BRIDGED_SQLCMD_ODBC`), else by its program word on `PATH`, else, on
// Windows, in the folder the PostgreSQL installer uses (`psql.exe` is outside `PATH` on `windows-latest`, PW1). What a file IS is read from what it answers, never from
// its name: `mysql` is two clients under one program word, and so is `sqlcmd`. Oracle's own build (`BRIDGED_MYSQL_ORACLE_OWN`: the generic Linux archive, which carries the Kerberos, LDAP, key-file and
// security-key client plugins that the distribution's package leaves out) is a second `oracle` client: when it is named, `name` says which is which (`oracle` is the own build and `oracle-distro`
// the distribution's, as PK1 has always called them); with only one, the `name` is the family. A leg's words use the name, and its logic the family.
const fs = require('node:fs');
const path = require('node:path');
const { IS_WINDOWS, runSync, resolveProgram, firstLine, versionOfClient, buildTagOf, runnerImage } = require('./dbProbeRig.cjs');

/** The newest `psql.exe` the PostgreSQL installer left under `Program Files`, or `undefined`. */
function installerPsql() {
  if (!IS_WINDOWS) {
    return undefined;
  }
  const root = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PostgreSQL');
  if (!fs.existsSync(root)) {
    return undefined;
  }
  const versions = fs.readdirSync(root).filter((name) => /^\d+$/.test(name)).sort((a, b) => Number(b) - Number(a));
  return versions.map((version) => path.join(root, version, 'bin', 'psql.exe')).find((file) => fs.existsSync(file));
}

/** The answer of `exe` to one flag, bare: the version line and where it came from. */
function versionOf(exe, flag = '--version') {
  const answer = runSync(exe, [flag], { PATH: process.env.PATH, HOME: process.env.HOME, SYSTEMROOT: process.env.SYSTEMROOT });
  return { code: answer.code, line: firstLine(answer.stdout !== '' ? answer.stdout : answer.stderr), stream: answer.stdout !== '' ? 'stdout' : 'stderr', stdout: answer.stdout, stderr: answer.stderr };
}

/**
 * The version a client says (rule R1), read where its family puts it: both `sqlcmd` clients print no version on their first line (the tool's name), so theirs is read from the answer to
 * `-?`. `{ line, number }`; with no version in any answer, the first line of `--version` and no number.
 */
function realVersion(client) {
  const flags = client.family.endsWith('sqlcmd') ? ['-?', '--version'] : ['--version'];
  for (const flag of flags) {
    const answer = versionOf(client.exe, flag);
    const read = versionOfClient(client.family, `${answer.stdout}\n${answer.stderr}`);
    if (read !== undefined) {
      return { line: read.line, number: read.number };
    }
  }
  return { line: versionOf(client.exe).line, number: undefined };
}

/**
 * The libpq file a `psql` loads, by the real name of the library (it carries the version): `ldd` of the binary the program word ends in. The program word of Debian and Ubuntu is a link to the packaging's
 * wrapper (a script), which `ldd` cannot read, so the binary is named by the major the client says it is (`/usr/lib/postgresql/<major>/bin/psql`); the second CI run printed "libpq file not read" for every
 * image beside PA1-a's own line, because the real path of the link is the script's. `undefined` when no file can be named.
 */
function libpqFileOf(exe, number) {
  const real = (() => {
    try {
      return fs.realpathSync(exe);
    } catch {
      return exe;
    }
  })();
  const major = /\/postgresql\/(\d+)\/bin\//.exec(real)?.[1] ?? /^(\d+)/.exec(number ?? '')?.[1];
  // The file the word really is comes first; the major's binary only when that file is the packaging's wrapper (a script that `ldd` cannot read), so a separate psql of the same major is never
  // named by the system's library.
  const candidates = [real, major === undefined ? undefined : `/usr/lib/postgresql/${major}/bin/psql`].filter((file) => file !== undefined && fs.existsSync(file));
  for (const target of candidates) {
    const line = runSync('ldd', [target], process.env).stdout.split('\n').find((text) => text.includes('libpq.so'));
    const library = /=>\s*(\S+)/.exec(line ?? '')?.[1];
    if (library !== undefined && fs.existsSync(library)) {
      return path.basename(fs.realpathSync(library));
    }
  }
  return undefined;
}

/**
 * The installed versions of the packages that carry the libraries of the clients that RAN (Debian and Ubuntu), one line: what a build line cannot say, the library package that a second install may
 * move. Only the packages of the families a leg of the job ran: a package of a client no leg ran (the second `psql` major that PA1-i installs, `mssql-tools` of an image that was not measured) is not named.
 */
function packageVersions(clients) {
  if (IS_WINDOWS || !fs.existsSync('/usr/bin/dpkg-query')) {
    return '';
  }
  const families = new Set(clients.map((client) => client.family));
  const patterns = [
    ...(families.has('psql') ? ['libpq5', ...clients.filter((client) => client.family === 'psql').map((client) => `postgresql-client-${/(\d+)/.exec(realVersion(client).number ?? '')?.[1] ?? '*'}`)] : []),
    ...(families.has('mariadb') ? ['libmariadb3'] : []),
    ...(clients.some((client) => client.family === 'oracle' && client.exe.startsWith('/usr/bin/')) ? ['mysql-client-core-*'] : []),
    ...(families.has('odbc-sqlcmd') ? ['msodbcsql17', 'msodbcsql18', 'mssql-tools', 'mssql-tools18'] : []),
  ];
  if (patterns.length === 0) {
    return '';
  }
  const answer = runSync('dpkg-query', ['-W', '-f', '${Package} ${Version}\\n', ...patterns], process.env);
  const rows = answer.stdout.split('\n').map((row) => row.trim()).filter((row) => row !== '');
  return rows.length === 0 ? '' : `; packages: ${rows.join(', ')}`;
}

/**
 * The file that names the clients which the legs of THIS JOB ran (`BRIDGED_BUILDS_FILE`, one JSON object per line, written by the workflow step that begins the job's probes): each harness adds the clients
 * its legs ran when it prints its own builds line, so the job's last line lists those and no other (the third run listed every client the runner HAS, among them ones no leg of the job ran, and a build
 * tag was missing where two builds shared a version number: Oracle's two 8.4.13).
 */
const BUILDS_FILE = 'BRIDGED_BUILDS_FILE';

/** Adds `clients` (`{ name, family, exe, via, driver }`) to the job's file; nothing when the step did not name one. */
function registerRan(clients) {
  const file = process.env[BUILDS_FILE];
  if (file === undefined || file === '' || clients.length === 0) {
    return;
  }
  const rows = clients.map((client) => JSON.stringify({ name: client.name ?? client.family, family: client.family, exe: client.exe, via: client.via, driver: client.driver }));
  fs.appendFileSync(file, `${rows.join('\n')}\n`);
}

/** The clients the job's legs ran, by what the harnesses wrote (once each, a driver kept once any harness read it), or `undefined` when no file was named or it holds none. */
function ranClients() {
  const file = process.env[BUILDS_FILE];
  if (file === undefined || file === '' || !fs.existsSync(file)) {
    return undefined;
  }
  const byKey = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter((row) => row.trim() !== '')) {
    const client = JSON.parse(line);
    const key = `${client.name}\0${client.exe}`;
    byKey.set(key, { ...byKey.get(key), ...Object.fromEntries(Object.entries(client).filter(([, value]) => value !== undefined && value !== null)) });
  }
  return byKey.size === 0 ? undefined : [...byKey.values()];
}

/**
 * R1, once more at the end of a job: the build of each client that a leg of the job ran, each by the version the client says AND its build tag (everything its version line holds after the number: two
 * clients can say the same number, the distribution's and Oracle's own `mysql` both `8.4.13`, the image's `psql` and a second install), the libpq file a `psql` loads, the ODBC driver library an ODBC client
 * loaded, and the image the job ran on. A row of the parent's table names ONE build per client, and the jobs of one run do not always share it (an image label moves while it is rolled out): the line is
 * how a reader checks that the build a row names is the build its legs ran. `register` is false for the job's last line, which names what the harnesses wrote and adds nothing.
 */
function buildsRecord(clients, { register = true, inventory = false } = {}) {
  if (register) {
    registerRan(clients);
  }
  const parts = clients.map((client) => {
    const read = realVersion(client);
    const tag = buildTagOf(read.line, client.family);
    const details = [`build tag ${JSON.stringify(tag)}`];
    if (client.family === 'psql' && !IS_WINDOWS) {
      details.push(`libpq file ${libpqFileOf(client.exe, read.number) ?? 'not read (no binary of that major to read)'}`);
    }
    if (client.family === 'odbc-sqlcmd') {
      details.push(`ODBC driver library ${client.driver ?? 'not read'}`);
    }
    return `${client.name ?? client.family} ${read.number ?? 'no version read'} [${details.join('; ')}]`;
  });
  console.log(`record (R1) the runner image of this job: ${runnerImage()}`);
  // An inventory (no harness named what ran) is said to be one: its heading never claims that a leg ran.
  const heading = inventory ? 'the clients this runner has (an inventory: NOT the builds the legs of this job ran)' : 'the builds every leg of this job ran';
  console.log(`record (R1) ${heading}: ${parts.join('; ') || 'no client'}${packageVersions(clients)}`);
}

/** `mysql` and `sqlcmd` are two clients each: the family of a file is what its own words say. */
function mysqlFamily(exe) {
  return /MariaDB/i.test(versionOf(exe).line) ? 'mariadb' : 'oracle';
}
function sqlcmdFamily(exe) {
  const help = runSync(exe, ['-?'], { PATH: process.env.PATH, HOME: process.env.HOME, SYSTEMROOT: process.env.SYSTEMROOT });
  return /authentication-method/i.test(help.text) ? 'go-sqlcmd' : 'odbc-sqlcmd';
}

/**
 * Every client the runner has, by family: `{ family, exe, via }`. A family with no file is not in the list: the caller says which are missing.
 * One file is listed once, whichever name found it.
 */
function discover() {
  const found = [];
  const add = (family, exe, via, name = family) => {
    if (exe !== undefined && fs.existsSync(exe) && !found.some((client) => client.name === name) && !found.some((client) => client.exe === exe)) {
      found.push({ family, exe, via, name });
    }
  };
  const env = process.env;
  add('psql', env.BRIDGED_PSQL, 'BRIDGED_PSQL');
  add('psql', resolveProgram('psql'), 'PATH');
  add('psql', installerPsql(), 'the PostgreSQL installer folder');
  for (const [name, via] of [[env.BRIDGED_MYSQL_ORACLE, 'BRIDGED_MYSQL_ORACLE'], [env.BRIDGED_MYSQL_MARIADB, 'BRIDGED_MYSQL_MARIADB'], [resolveProgram('mysql'), 'PATH: mysql'], [resolveProgram('mariadb'), 'PATH: mariadb']]) {
    if (name !== undefined && fs.existsSync(name) && !found.some((client) => client.exe === name)) {
      add(mysqlFamily(name), name, via, mysqlFamily(name) === 'oracle' && env.BRIDGED_MYSQL_ORACLE_OWN !== undefined ? 'oracle-distro' : undefined);
    }
  }
  const own = env.BRIDGED_MYSQL_ORACLE_OWN;
  if (own !== undefined && fs.existsSync(own) && !found.some((client) => client.exe === own)) {
    add('oracle', own, 'BRIDGED_MYSQL_ORACLE_OWN', 'oracle');
  }
  const sqlcmds = [[env.BRIDGED_SQLCMD_GO, 'BRIDGED_SQLCMD_GO'], [env.BRIDGED_SQLCMD_ODBC, 'BRIDGED_SQLCMD_ODBC'], [resolveProgram('sqlcmd'), 'PATH'],
    ['/opt/mssql-tools18/bin/sqlcmd', 'the mssql-tools18 folder'], ['/opt/mssql-tools/bin/sqlcmd', 'the mssql-tools folder']];
  for (const [name, via] of sqlcmds) {
    if (name !== undefined && fs.existsSync(name) && !found.some((client) => client.exe === name)) {
      add(sqlcmdFamily(name), name, via);
    }
  }
  return found;
}

/** The families a Linux CI run must have: a missing one is the rig's fault, named by the package that carries it. */
const REQUIRED_ON_CI_LINUX = [
  ['psql', 'postgresql-client'],
  ['oracle', 'mysql-client'],
  ['mariadb', "MariaDB's client, unpacked by the step that installs it (BRIDGED_MYSQL_MARIADB)"],
];

module.exports = { discover, versionOf, realVersion, buildsRecord, registerRan, ranClients, installerPsql, REQUIRED_ON_CI_LINUX };
