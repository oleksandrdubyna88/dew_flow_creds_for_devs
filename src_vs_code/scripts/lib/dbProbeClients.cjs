'use strict';
// Which database clients a runner carries, and which of them each file is (E1.7 spec §S7.4 PA1-a and PA1-h). A client is found by an environment name the
// workflow sets (`BRIDGED_PSQL`, `BRIDGED_MYSQL_ORACLE`, `BRIDGED_MYSQL_MARIADB`, `BRIDGED_SQLCMD_GO`, `BRIDGED_SQLCMD_ODBC`), else by its program word on `PATH`, else, on
// Windows, in the folder the PostgreSQL installer uses (`psql.exe` is outside `PATH` on `windows-latest`, PW1). What a file IS is read from what it answers, never from
// its name: `mysql` is two clients under one program word, and so is `sqlcmd`. Oracle's own build (`BRIDGED_MYSQL_ORACLE_OWN`: the generic Linux archive, which carries the Kerberos, LDAP, key-file and
// security-key client plugins that the distribution's package leaves out) is a second `oracle` client: when it is named, `name` says which is which (`oracle` is the own build and `oracle-distro`
// the distribution's, as PK1 has always called them); with only one, the `name` is the family. A leg's words use the name, and its logic the family.
const fs = require('node:fs');
const path = require('node:path');
const { IS_WINDOWS, runSync, resolveProgram, firstLine, versionOfClient } = require('./dbProbeRig.cjs');

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
  const candidates = [major === undefined ? undefined : `/usr/lib/postgresql/${major}/bin/psql`, real].filter((file) => file !== undefined && fs.existsSync(file));
  for (const target of candidates) {
    const line = runSync('ldd', [target], process.env).stdout.split('\n').find((text) => text.includes('libpq.so'));
    const library = /=>\s*(\S+)/.exec(line ?? '')?.[1];
    if (library !== undefined && fs.existsSync(library)) {
      return path.basename(fs.realpathSync(library));
    }
  }
  return undefined;
}

/** The installed versions of the packages that carry the clients' libraries (Debian and Ubuntu), one line: what a build line cannot say, the library package that a second install may move. */
function packageVersions() {
  if (IS_WINDOWS || !fs.existsSync('/usr/bin/dpkg-query')) {
    return '';
  }
  const answer = runSync('dpkg-query', ['-W', '-f', '${Package} ${Version}\\n', 'libpq5', 'postgresql-client-*', 'libmariadb3', 'mysql-client-core-*'], process.env);
  const rows = answer.stdout.split('\n').map((row) => row.trim()).filter((row) => row !== '');
  return rows.length === 0 ? '' : `; packages: ${rows.join(', ')}`;
}

/**
 * R1, once more at the end of a job: the build of each client that every leg of the job ran, by the version the client says and the libpq file a `psql` loads. A row of the parent's table
 * names ONE build per client, and the jobs of one run do not always share it (the image's preinstalled `psql` and the one a step installs can differ by a minor version): the line is how a
 * reader checks that the build a row names is the build its legs ran. The jobs of the third run hold every probe of one image in ONE job, so that the line covers them all.
 */
function buildsRecord(clients) {
  const parts = clients.map((client) => {
    const { number } = realVersion(client);
    let libpq = '';
    if (client.family === 'psql' && !IS_WINDOWS) {
      libpq = `, libpq file ${libpqFileOf(client.exe, number) ?? 'not read (no binary of that major to read)'}`;
    }
    return `${client.name ?? client.family} ${number ?? 'no version read'}${libpq}`;
  });
  console.log(`record (R1) the builds every leg of this job ran: ${parts.join('; ') || 'no client'}${packageVersions()}`);
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

module.exports = { discover, versionOf, realVersion, buildsRecord, installerPsql, REQUIRED_ON_CI_LINUX };
