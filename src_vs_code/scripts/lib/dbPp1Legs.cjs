'use strict';
// PP1 (E1.7 spec §S7.4, parent §7's probe table): the socket class. A real server logs in the operating-system user over its socket with no password (PostgreSQL `peer`,
// MySQL `auth_socket`); PP1-0 is the positive control (the client pointed at the socket by hand logs in as the runner's user), PP1-1 is the launch the builder writes for
// an entry that names `localhost` and stores a user and a password (it must come in over TCP, as the entry's user, by its password). RECORD legs: they print what the
// client did and fail only for the rig's own faults. A control that shows no login by identity is `UNMEASURED` (the parent's decision): the socket refusal and
// `--protocol=TCP` stay, since they cost only local sockets.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { check, bridgedEnv, runSync, oneLine, noteLeg, unmeasured, stop } = require('./dbProbeRig.cjs');
const servers = require('./dbServers.cjs');
const candidates = require('./dbCandidates.cjs');

const ENTRY_USER = 'pp1entry';

/** The environment a bridged client gets under the rig home, and what the launch adds. */
const envOf = (rig, extra = {}) => bridgedEnv(rig.product, rig.home, extra);

/** One value of a one-row result: `psql -t -A` prints it bare, `mysql -e` prints a header and the row; both are read by the row's own words. */
const wordsOf = (text) => oneLine(text, 160);

/** PP1 for `psql`: a PostgreSQL cluster with `local … peer` and a password login over TCP. */
async function legPsql(scope, client, shared) {
  const under = await candidates.verdictFor(client, shared);
  if (!under.ok) {
    unmeasured('PP1 psql', 'the real check refused this psql under the candidate table (the finding is printed above), so the builder launches nothing');
    return false;
  }
  candidates.say('PP1-1 psql', under);
  const rig = { ...shared, verdict: under.verdict };
  const hba = ['local all all peer', 'host all all 127.0.0.1/32 scram-sha-256', 'host all all ::1/128 scram-sha-256'];
  const pg = await servers.startPostgres(scope, 'pp1-pg', hba);
  if (pg.missing !== undefined) {
    unmeasured('PP1 psql', pg.missing);
    return false;
  }
  const entryValue = servers.throwaway();
  check('(PP1) the rig made the entry role', pg.admin(`create role ${ENTRY_USER} login password '${entryValue}'`).code === 0, 'create role failed');
  const control = runSync(client.exe, ['-X', '-w', '-q', '-t', '-A', '-h', pg.socketDir, '-p', String(pg.port), '-d', 'postgres', '-c', 'select current_user'], envOf(rig));
  const asRunner = control.stdout.trim() === os.userInfo().username;
  console.log(`record (PP1-0) psql, pointed at the socket by hand, no user, no password: exit ${control.code}; ${asRunner ? "LOGGED IN as the runner's user" : 'did not log in as the runner\'s user'}; it said ${wordsOf(control.text)}`);
  const entry = `postgresql://${ENTRY_USER}:${entryValue}@localhost:${pg.port}/postgres`;
  const built = rig.product.buildDbQueryLaunch('postgres', entry, 'select current_user as who, inet_client_addr() is not null as over_tcp', { bridged: true, absentFile: rig.absentFile, verdict: rig.verdict });
  check('(PP1-1) the builder launched an entry that names localhost and stores a user and a password', built !== undefined, 'buildDbQueryLaunch answered undefined');
  const production = runSync(client.exe, built.args, envOf(rig, built.env));
  const row = new RegExp(String.raw`${ENTRY_USER}\s*\|\s*([tf])`).exec(production.stdout);
  const overTcp = row?.[1] === 't';
  console.log(`record (PP1-1) psql, the production launch for an entry on localhost: exit ${production.code}; ${row === null ? 'NO row came back' : `the login is ${ENTRY_USER}, over ${overTcp ? 'TCP' : 'the SOCKET'}`}; it said ${wordsOf(production.stderr)}`);
  const authenticated = (await pg.log()).split('\n').filter((line) => line.includes('authenticated') && line.includes(ENTRY_USER)).map((line) => oneLine(line.replace(/^.*?(connection authenticated)/, '$1'), 120));
  console.log(`record (PP1-1) the server's log names: ${authenticated.join(' ; ') || 'no "connection authenticated" line (this server version does not write one)'}`);
  if (!asRunner) {
    unmeasured('PP1-0 psql', 'the socket login by identity was not shown: the socket refusal and --protocol=TCP stay, and PP1 opens no road (the parent\'s decision)');
  }
  if (row !== null && !overTcp) {
    stop('PP1-1 psql', 'the production launch logged in over the socket (parent §7, row PP1: back to the lead)');
  }
  noteLeg('PP1 psql', asRunner, `production: ${row === null ? 'no login' : `${ENTRY_USER} over ${overTcp ? 'TCP' : 'the SOCKET'}`}`);
  return true;
}

/** The first result row of a `mysql -e` answer (a header line, then the row), as the words of that row. */
const rowOf = (text) => text.trim().split('\n')[1]?.trim();

/** A socket path by the folder's real name: `/run` and `/var/run` are one folder on the images, and two servers cannot share a socket. */
function canonicalSocket(socket) {
  // The deepest folder that exists is resolved, the rest kept as written: before the rig makes `/run/mysqld`, the clients' `/var/run/mysqld/…`
  // and `/run/mysqld/…` must already be one path (`/var/run` links to `/run` on Ubuntu), or two servers are started on one socket.
  let folder = path.dirname(socket);
  const rest = [path.basename(socket)];
  while (!fs.existsSync(folder) && path.dirname(folder) !== folder) {
    rest.unshift(path.basename(folder));
    folder = path.dirname(folder);
  }
  try {
    return path.join(fs.realpathSync(folder), ...rest);
  } catch {
    return socket;
  }
}

/**
 * PP1 for the `mysql` clients: one MySQL server on each default socket path the clients name (the distribution's client and MariaDB's share one; Oracle's own build was made for another,
 * `/tmp/mysql.sock`), `auth_socket` for the runner's user, a password login over TCP. `oracle` is the client the rig administers with (the distribution's, which answers in every image).
 */
async function legMysql(scope, oracle, others, rig) {
  const clients = [oracle, ...others];
  const ran = [];
  const groups = [];
  for (const client of clients) {
    const socket = servers.defaultSocketOf(client.exe, envOf(rig));
    const key = socket === undefined ? undefined : canonicalSocket(socket);
    const group = groups.find((entry) => entry.key === key);
    if (group === undefined) {
      groups.push({ key, socket, clients: [client] });
    } else {
      group.clients.push(client);
    }
  }
  for (const [index, group] of groups.entries()) {
    if (group.socket === undefined) {
      unmeasured(`PP1 mysql ${group.clients.map((client) => client.name).join(' ')}`, "the client names no default socket path in its own words");
      continue;
    }
    ran.push(...(await mysqlGroup(scope, oracle, group, index, rig)));
  }
  return ran;
}

/** One server on one default socket path, and the clients that name that path. */
async function mysqlGroup(scope, oracle, group, index, rig) {
  const { socket } = group;
  const names = group.clients.map((client) => client.name).join(' ');
  if (!servers.ensureSocketFolder(socket)) {
    unmeasured(`PP1 mysql ${names}`, `the default socket folder ${path.dirname(socket)} is not writable by this user, and the system rig is off (CI=true and BRIDGED_DB_SYSTEM_RIG=1 make it)`);
    return [];
  }
  const my = await servers.startMysqld(scope, index === 0 ? 'pp1-my' : `pp1-my${index + 1}`, socket, oracle.exe);
  if (my.missing !== undefined) {
    unmeasured(`PP1 mysql ${names}`, my.missing);
    return [];
  }
  const entryValue = servers.throwaway();
  const runner = os.userInfo().username;
  check(`(PP1) the rig made the socket account on ${socket}`, my.admin(`create user '${runner}'@'localhost' identified with auth_socket; grant select on *.* to '${runner}'@'localhost'`).code === 0, 'create user failed');
  check(`(PP1) the rig made the database on ${socket}`, my.admin('create database pp1db').code === 0, 'create database failed');
  const plugin = my.admin(`create user '${ENTRY_USER}'@'127.0.0.1' identified with mysql_native_password by '${entryValue}'`).code === 0 ? 'mysql_native_password' : undefined;
  if (plugin === undefined) {
    check(`(PP1) the rig made the entry account with the default plugin on ${socket}`, my.admin(`create user '${ENTRY_USER}'@'127.0.0.1' identified by '${entryValue}'`).code === 0, 'create user failed');
  }
  check(`(PP1) the rig granted the entry account its database on ${socket}`, my.admin(`grant all on pp1db.* to '${ENTRY_USER}'@'127.0.0.1'`).code === 0, 'grant failed');
  const ran = [];
  for (const client of group.clients) {
    const under = await candidates.verdictFor(client, rig);
    if (under.ok) {
      candidates.say(`PP1-1 ${client.name}`, under);
      await mysqlClient(client, { ...rig, verdict: under.verdict }, my, entryValue, plugin ?? 'the default plugin');
      ran.push(client);
    } else {
      unmeasured(`PP1-1 ${client.name}`, 'the real check refused this client under the candidate table (the finding is printed above), so the builder launches nothing');
    }
  }
  return ran;
}

/** PP1-0 and PP1-1 for one `mysql` client against the server of `legMysql`. */
async function mysqlClient(client, rig, my, entryValue, plugin) {
  const runner = os.userInfo().username;
  const own = servers.defaultSocketOf(client.exe, envOf(rig));
  if (own !== undefined && canonicalSocket(own) !== canonicalSocket(my.socket)) {
    console.log(`record (PP1-0) ${client.name}: its default socket path is ${own}, not the server's ${my.socket}: the control is not shown for this client`);
    unmeasured(`PP1-0 ${client.name}`, `its default socket path differs from the server's (${own})`);
    return;
  }
  const control = runSync(client.exe, ['--no-defaults', '-u', runner, '-e', 'select current_user() as who'], envOf(rig));
  const asRunner = rowOf(control.stdout)?.startsWith(`${runner}@`) === true;
  console.log(`record (PP1-0) ${client.name}, the default socket, the runner's name, no password: exit ${control.code}; ${asRunner ? `LOGGED IN as ${rowOf(control.stdout)}` : 'did not log in by identity'}; it said ${wordsOf(control.text)}`);
  const entry = `mysql://${ENTRY_USER}:${entryValue}@localhost:${my.port}/pp1db`;
  const built = rig.product.buildDbQueryLaunch('mysql', entry, 'select current_user() as who, user() as asked', { bridged: true, absentFile: rig.absentFile, verdict: rig.verdict });
  check(`(PP1-1) ${client.name}: the builder launched an entry that names localhost and stores a user and a password`, built !== undefined, 'buildDbQueryLaunch answered undefined');
  const production = runSync(client.exe, built.args, envOf(rig, built.env));
  const row = rowOf(production.stdout);
  const overTcp = row !== undefined && row.includes('@127.0.0.1');
  console.log(`record (PP1-1) ${client.name}, the production launch for an entry on localhost (the account's plugin: ${plugin}): exit ${production.code}; ${row === undefined ? 'NO row came back' : `the login is ${JSON.stringify(row)} (${overTcp ? 'TCP' : 'not by TCP'})`}; it said ${wordsOf(production.stderr)}`);
  if (!asRunner) {
    unmeasured(`PP1-0 ${client.name}`, 'the socket login by identity was not shown: the socket refusal and --protocol=TCP stay (the parent\'s decision)');
  }
  if (row !== undefined && !overTcp) {
    stop(`PP1-1 ${client.name}`, 'the production launch did not log in over TCP as the entry (parent §7, row PP1: back to the lead if it used the socket)');
  }
  noteLeg(`PP1 ${client.name}`, asRunner, `production: ${row === undefined ? 'no login' : `${row} (${overTcp ? 'TCP' : 'not TCP'})`}`);
}

module.exports = { legPsql, legMysql };
