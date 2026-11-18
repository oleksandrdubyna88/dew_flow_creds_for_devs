// PP1 of the E1.7 spec (`todo/PLAN_remote_bridge_scoped_E1_S7_spec.md` §S7.4; parent §7's probe table): the socket class, on Linux.
//
//   npm run compile && node scripts/bridged-db-pp1-itest.cjs        (`npm run itest:bridged-db-pp1`)
//
// A real server that logs in the operating-system user over its socket with no password: a PostgreSQL cluster made by `initdb` in an owned folder, with `local … peer`, and a
// MySQL server made by `mysqld --initialize-insecure` in an owned folder, listening on the clients' DEFAULT socket path, with `auth_socket`. Both are run by this user as
// children of the harness and end with it. PP1-0 is the positive control: each client, pointed at the socket by hand with no password, logs in as the runner's user. PP1-1 is
// the production launch (`buildDbQueryLaunch(..., { bridged: true })` under `bridgedSshEnv`) for an entry that names `localhost` and stores a user and a password: it must come
// in over TCP, as the entry's user, by its password. A RECORD harness: it prints `record (PP1-…)` lines, says `UNMEASURED` when the control shows no login by identity (the
// parent's decision: the socket refusal and `--protocol=TCP` stay, and PP1 never opens a road), and fails only for the rig's own faults (a server that did not come up).
//
// System-wide writes (R3): only the default socket folder of `mysqld`, made writable by `sudo install -d`, and only when `CI=true` and `BRIDGED_DB_SYSTEM_RIG=1`. Without
// them the MySQL half prints `UNMEASURED` and the PostgreSQL half still runs, wherever `initdb` is (`BRIDGED_PG_BIN` names the folder of the PostgreSQL binaries, `BRIDGED_MYSQLD` the
// `mysqld`). The clients are found as PA1 finds them. POSIX only.
const fs = require('node:fs');
const path = require('node:path');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');
const rig = require('./lib/dbProbeRig.cjs');
const { discover, versionOf } = require('./lib/dbProbeClients.cjs');
const legs = require('./lib/dbPp1Legs.cjs');

async function main(scope) {
  if (process.platform === 'win32') {
    console.log('skip  the PP1 socket probe — Linux only (a runner has no socket-peer server on Windows)');
    return 0;
  }
  const product = rig.loadProduct();
  const dir = ownedDir(scope, 'bridged-db-pp1');
  const home = path.join(dir, 'rig home');
  fs.mkdirSync(home, { recursive: true });
  const shared = { product, dir, home, absentFile: product.materializedKeyPath(dir, 'no-client-file') };
  console.log(`PP1: node ${process.version}; ${process.platform}/${process.arch}; CI=${process.env.CI ?? ''}; system rig ${rig.mayWriteSystem() ? 'on' : 'off'}`);
  const found = discover();
  const byFamily = (family) => found.find((client) => client.family === family);
  for (const client of found.filter((one) => ['psql', 'oracle', 'mariadb'].includes(one.family))) {
    rig.announce(client.family, `${client.exe} (found by ${client.via})`, versionOf(client.exe).line);
  }
  const psql = byFamily('psql');
  if (psql === undefined) {
    rig.check('the psql client is installed', process.env.CI !== 'true', 'no psql client was found: install postgresql-client — a skipped leg on the runner proves nothing');
  } else {
    await legs.legPsql(scope, psql, shared);
  }
  const oracle = byFamily('oracle');
  if (oracle === undefined) {
    rig.check("Oracle's mysql client is installed", process.env.CI !== 'true', 'no Oracle mysql client was found: install mysql-client — a skipped leg on the runner proves nothing');
  } else {
    await legs.legMysql(scope, oracle, [byFamily('mariadb')].filter((client) => client !== undefined), shared);
  }
  return rig.finish('bridged db PP1');
}

harnessScope.run(main);
