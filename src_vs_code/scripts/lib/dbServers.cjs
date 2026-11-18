'use strict';
// The real database servers of the E1.7 probes (the spec §S7.3, rigs G and M): a PostgreSQL cluster and a MySQL server made by the runner's own user in an owned folder, and
// a MariaDB server in a container. Each is started by the harness, held by the scope, and ended by it: a server's process is a child of the harness (`launch`), its folder is
// owned (`ownedDir`), and a container carries the token in its name and is removed. Nothing here is system-wide but the default socket folder of `mysqld` (`ensureSocketFolder`), which
// is made only under R3 (`CI=true` and `BRIDGED_DB_SYSTEM_RIG=1`).
//
// A credential of a rig is made at run time (`throwaway`) and is handed to a child by its environment or, where the server's own SQL needs it, inside a statement the rig
// sends. No log line holds one, and no variable here is named for what it holds.
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { launch } = require('../itestSshd.cjs');
const { ownedDir, ownedName } = require('./leftovers.cjs');
const { runSync, pause, resolveProgram, mayWriteSystem } = require('./dbProbeRig.cjs');

/** A value made at run time for a rig account: hex, so it needs no quoting in SQL or in a connection string. */
const throwaway = () => crypto.randomBytes(12).toString('hex');

/** A free loopback port: bind 0, read it, let go. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Polls `ready()` every 200 ms for `ms`; resolves with whether it held. */
async function until(ready, ms) {
  for (let waited = 0; waited < ms; waited += 200) {
    if (ready()) {
      return true;
    }
    await pause(200);
  }
  return ready();
}

/** The folder of the PostgreSQL binaries (`initdb`, `postgres`, `psql`): `BRIDGED_PG_BIN`, else the newest `/usr/lib/postgresql/<n>/bin` that has `initdb`. */
function postgresBin() {
  if (process.env.BRIDGED_PG_BIN !== undefined) {
    return process.env.BRIDGED_PG_BIN;
  }
  const root = '/usr/lib/postgresql';
  const majors = fs.existsSync(root) ? fs.readdirSync(root).filter((name) => /^\d+$/.test(name)).sort((a, b) => Number(b) - Number(a)) : [];
  return majors.map((major) => path.join(root, major, 'bin')).find((folder) => fs.existsSync(path.join(folder, 'initdb')));
}

/** The environment of a server's own tools: the harness's, so that a library path of the rig reaches them. A server is not a bridged client (R2 is for clients). */
const serverEnv = () => ({ ...process.env });

/**
 * A PostgreSQL cluster in an owned folder, run by this user: `initdb`, then `postgres` as a child of the harness on a free loopback port and a socket folder of its own,
 * with `log_connections` on. `hba` is the whole `pg_hba.conf`. `admin(sql)` runs a statement as the superuser (the OS user's name) over the socket. `log()` (a promise) is what the
 * server wrote to its error stream. `undefined` with a reason when the binaries are not there.
 */
async function startPostgres(scope, label, hba) {
  const bin = postgresBin();
  if (bin === undefined) {
    return { missing: 'no PostgreSQL server binaries (initdb) under /usr/lib/postgresql, and BRIDGED_PG_BIN is not set' };
  }
  const data = ownedDir(scope, `${label}-data`);
  const socketDir = ownedDir(scope, `${label}-sock`);
  fs.chmodSync(data, 0o700);
  const initialised = runSync(path.join(bin, 'initdb'), ['-D', data, '-A', 'trust', '--no-sync', '-E', 'UTF8', '--locale=C'], serverEnv(), 120_000);
  if (initialised.code !== 0) {
    throw new Error(`initdb failed (${initialised.code}): ${initialised.text.slice(0, 300)}`);
  }
  fs.writeFileSync(path.join(data, 'pg_hba.conf'), `${hba.join('\n')}\n`);
  const port = await freePort();
  const server = launch(scope, path.join(bin, 'postgres'), [
    '-D', data, '-c', 'listen_addresses=localhost', '-c', `port=${port}`, '-c', `unix_socket_directories=${socketDir}`,
    '-c', 'log_connections=on', '-c', 'fsync=off', '-c', 'password_encryption=scram-sha-256',
  ], { env: serverEnv() });
  const up = await until(() => /ready to accept connections/.test(server.stderr) || server.exited, 60_000);
  if (!up || server.exited) {
    throw new Error(`postgres did not come up: ${server.stderr.slice(-400)}`);
  }
  const superuser = os.userInfo().username;
  const admin = (sql) => runSync(path.join(bin, 'psql'), ['-X', '-q', '-h', socketDir, '-p', String(port), '-U', superuser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], serverEnv(), 60_000);
  return { bin, port, socketDir, superuser, admin, log: async () => {
    await pause(300); // a blocking run of a client leaves the server's pipe unread until the loop turns
    return server.stderr;
  } };
}

/** The `mysqld` the rig runs: `BRIDGED_MYSQLD`, else the first of the usual places. */
const mysqldFile = () => process.env.BRIDGED_MYSQLD ?? ['/usr/sbin/mysqld', '/usr/bin/mysqld'].find((file) => fs.existsSync(file)) ?? resolveProgram('mysqld');

/**
 * A MySQL server in an owned folder, run by this user: `mysqld --initialize-insecure`, then `mysqld` as a child of the harness on a free loopback port and the unix socket at
 * `socket`, with the `auth_socket` plugin loaded. `admin(sql)` runs a statement as `root` over the socket, through `client` (Oracle's `mysql`). `{ missing }` with a reason when
 * the server is not there.
 */
async function startMysqld(scope, label, socket, client) {
  const system = mysqldFile();
  if (system === undefined) {
    return { missing: 'no mysqld (the image carries the server; BRIDGED_MYSQLD names another)' };
  }
  const data = ownedDir(scope, `${label}-data`);
  const folder = ownedDir(scope, `${label}-run`);
  // The server runs from a COPY in the owned folder, with the base folder of the original named: a profile of the distribution (AppArmor) that confines /usr/sbin/mysqld by its
  // path would otherwise forbid the owned data folder, and a rig that the system's policy stops measures nothing.
  const real = fs.realpathSync(system);
  const mysqld = path.join(ownedDir(scope, `${label}-bin`), 'mysqld');
  fs.copyFileSync(real, mysqld);
  fs.chmodSync(mysqld, 0o755);
  const baseOfSystem = /\/s?bin\/mysqld$/.test(real) ? [`--basedir=${path.resolve(path.dirname(real), '..')}`] : [];
  const common = ['--no-defaults', ...baseOfSystem, `--datadir=${data}`, `--log-error=${path.join(folder, 'error.log')}`, '--secure-file-priv=NULL'];
  const initialised = runSync(mysqld, [...common, '--initialize-insecure'], serverEnv(), 180_000);
  if (initialised.code !== 0) {
    throw new Error(`mysqld --initialize-insecure failed (${initialised.code}): ${initialised.text.slice(0, 300)} ${readTail(path.join(folder, 'error.log'))}`);
  }
  const port = await freePort();
  const server = launch(scope, mysqld, [
    ...common, `--socket=${socket}`, `--port=${port}`, '--bind-address=127.0.0.1', '--mysqlx=OFF', '--skip-name-resolve', `--pid-file=${path.join(folder, 'mysqld.pid')}`,
    '--plugin-load-add=auth_socket.so', ...(process.env.BRIDGED_MYSQL_PLUGIN_DIR === undefined ? [] : [`--plugin-dir=${process.env.BRIDGED_MYSQL_PLUGIN_DIR}`]),
  ], { env: serverEnv() });
  const admin = (sql) => runSync(client, ['--no-defaults', '-S', socket, '-u', 'root', '-e', sql], serverEnv(), 60_000);
  const up = await until(() => server.exited || (fs.existsSync(socket) && admin('select 1').code === 0), 90_000);
  if (!up || server.exited) {
    throw new Error(`mysqld did not come up: ${server.stderr.slice(-300)} ${readTail(path.join(folder, 'error.log'))}`);
  }
  return { mysqld, port, socket, admin, log: () => readTail(path.join(folder, 'error.log'), 4000) };
}

/** The last `count` characters of a file, or nothing. */
const readTail = (file, count = 600) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').slice(-count) : '');

/**
 * The socket path a client tries with no host: what its own error says when nothing listens there (both `mysql` clients name it). `undefined` when the words do not name one.
 */
function defaultSocketOf(client, env) {
  const answer = runSync(client, ['--no-defaults', '-u', 'pp1-probe', '-e', 'select 1'], env, 20_000);
  return /socket '([^']+)'/.exec(answer.text)?.[1];
}

/**
 * Makes the folder of a socket path writable by this user: nothing when it already is, else `sudo install -d` under R3 only. Answers whether the folder is usable.
 */
function ensureSocketFolder(socket) {
  const folder = path.dirname(socket);
  const writable = () => {
    try {
      fs.accessSync(folder, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  };
  if (fs.existsSync(folder) && writable()) {
    return true;
  }
  if (!mayWriteSystem()) {
    return false;
  }
  const made = spawnSync('sudo', ['install', '-d', '-o', os.userInfo().username, folder], { stdio: 'ignore' }); // NOSONAR: a rig command on a CI runner, an argument list
  return made.status === 0 && writable();
}

/**
 * A MariaDB server in a container on the host's network (the image is named by digest, R7): `docker run -d`, a root account whose credential is given to the container by
 * the environment and never by an argument, and a free loopback port. The container is named with the token and removed by the scope. `admin(sql)` runs a statement as root
 * through `client` (MariaDB's), over TCP.
 */
async function startMariadbContainer(scope, label, image, client) {
  const docker = resolveProgram('docker');
  if (docker === undefined) {
    return { missing: 'docker is not on PATH' };
  }
  if (spawnSync(docker, ['image', 'inspect', image], { stdio: 'ignore' }).status !== 0) { // NOSONAR: the rig's own docker, an argument list
    return { missing: `the image ${image} is not on this runner (the step pulls it first)` };
  }
  const name = ownedName(label);
  scope.after(() => spawnSync(docker, ['rm', '-f', '-v', name], { stdio: 'ignore' })); // NOSONAR: the rig's own docker, an argument list
  const port = await freePort();
  const rootValue = throwaway();
  const started = spawnSync(docker, ['run', '-d', '--name', name, '--network', 'host', '-e', 'MARIADB_ROOT_PASSWORD', '-e', 'MARIADB_ROOT_HOST=%', image, `--port=${port}`, '--bind-address=127.0.0.1', '--skip-name-resolve'], // NOSONAR: the rig's own docker, an argument list
    { env: { ...process.env, MARIADB_ROOT_PASSWORD: rootValue }, encoding: 'utf8' });
  if (started.status !== 0) {
    throw new Error(`docker run of the MariaDB image failed: ${String(started.stderr).slice(0, 300)}`);
  }
  const admin = (sql) => runSync(client, ['--no-defaults', '--protocol=TCP', '-h', '127.0.0.1', '-P', String(port), '-u', 'root', '-e', sql], { PATH: process.env.PATH, HOME: process.env.HOME, MYSQL_PWD: rootValue }, 60_000);
  const up = await until(() => admin('select 1').code === 0, 120_000);
  if (!up) {
    throw new Error(`the MariaDB container did not answer: ${spawnSync(docker, ['logs', '--tail', '20', name], { encoding: 'utf8' }).stderr?.slice(-400)}`); // NOSONAR: the rig's own docker, an argument list
  }
  return { port, admin, name };
}

module.exports = { throwaway, freePort, until, postgresBin, startPostgres, startMysqld, startMariadbContainer, defaultSocketOf, ensureSocketFolder, mysqldFile };
