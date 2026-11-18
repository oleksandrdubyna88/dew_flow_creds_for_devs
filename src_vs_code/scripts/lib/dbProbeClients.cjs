'use strict';
// Which database clients a runner carries, and which of them each file is (E1.7 spec §S7.4 PA1-a and PA1-h). A client is found by an environment name the
// workflow sets (`BRIDGED_PSQL`, `BRIDGED_MYSQL_ORACLE`, `BRIDGED_MYSQL_MARIADB`, `BRIDGED_SQLCMD_GO`, `BRIDGED_SQLCMD_ODBC`), else by its program word on `PATH`, else, on
// Windows, in the folder the PostgreSQL installer uses (`psql.exe` is outside `PATH` on `windows-latest`, PW1). What a file IS is read from what it answers, never from
// its name: `mysql` is two clients under one program word, and so is `sqlcmd`.
const fs = require('node:fs');
const path = require('node:path');
const { IS_WINDOWS, runSync, resolveProgram, firstLine } = require('./dbProbeRig.cjs');

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

module.exports = { discover, versionOf, installerPsql, REQUIRED_ON_CI_LINUX };
