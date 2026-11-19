'use strict';
// Which database clients a runner carries, and which of them each file is (E1.7 spec §S7.4 PA1-a and PA1-h). A client is found by an environment name the
// workflow sets (`BRIDGED_PSQL`, `BRIDGED_MYSQL_ORACLE`, `BRIDGED_MYSQL_MARIADB`, `BRIDGED_SQLCMD_GO`, `BRIDGED_SQLCMD_ODBC`), else by its program word on `PATH`, else, on
// Windows, in the folder the PostgreSQL installer uses (`psql.exe` is outside `PATH` on `windows-latest`, PW1). What a file IS is read from what it answers, never from
// its name: `mysql` is two clients under one program word, and so is `sqlcmd`.
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
 * R1, once more at the end of a job: the build of each client that every leg of the job ran, by the version the client says and the libpq file a `psql` loads. A row of the parent's table
 * names ONE build per client, and the jobs of one run do not always share it (the image's preinstalled `psql` and the one a step installs can differ by a minor version): the line is how a
 * reader checks that the build a row names is the build its legs ran.
 */
function buildsRecord(clients) {
  const parts = clients.map((client) => {
    const { number } = realVersion(client);
    let libpq = '';
    if (client.family === 'psql' && !IS_WINDOWS) {
      const real = (() => {
        try {
          return fs.realpathSync(client.exe);
        } catch {
          return client.exe;
        }
      })();
      const major = /\/postgresql\/(\d+)\/bin\//.exec(real)?.[1];
      const target = major === undefined ? real : `/usr/lib/postgresql/${major}/bin/psql`;
      const line = runSync('ldd', [fs.existsSync(target) ? target : real], process.env).stdout.split('\n').find((text) => text.includes('libpq.so'));
      const library = /=>\s*(\S+)/.exec(line ?? '')?.[1];
      libpq = `, libpq file ${library !== undefined && fs.existsSync(library) ? path.basename(fs.realpathSync(library)) : 'not read'}`;
    }
    return `${client.family} ${number ?? 'no version read'}${libpq}`;
  });
  console.log(`record (R1) the builds every leg of this job ran: ${parts.join('; ') || 'no client'}`);
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
  const add = (family, exe, via) => {
    if (exe !== undefined && fs.existsSync(exe) && !found.some((client) => client.family === family) && !found.some((client) => client.exe === exe)) {
      found.push({ family, exe, via });
    }
  };
  const env = process.env;
  add('psql', env.BRIDGED_PSQL, 'BRIDGED_PSQL');
  add('psql', resolveProgram('psql'), 'PATH');
  add('psql', installerPsql(), 'the PostgreSQL installer folder');
  for (const [name, via] of [[env.BRIDGED_MYSQL_ORACLE, 'BRIDGED_MYSQL_ORACLE'], [env.BRIDGED_MYSQL_MARIADB, 'BRIDGED_MYSQL_MARIADB'], [resolveProgram('mysql'), 'PATH: mysql'], [resolveProgram('mariadb'), 'PATH: mariadb']]) {
    if (name !== undefined && fs.existsSync(name) && !found.some((client) => client.exe === name)) {
      add(mysqlFamily(name), name, via);
    }
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
