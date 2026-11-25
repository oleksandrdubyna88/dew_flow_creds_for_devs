// PE1 of the E1.7 spec (`todo/PLAN_remote_bridge_scoped_E1_S7_spec.md` §S7.4; parent §7's probe table): the entry's own login still works under the pair's whole profile, and
// nothing else decided it. Linux.
//
//   npm run compile && node scripts/bridged-db-pe1-itest.cjs        (`npm run itest:bridged-db-pe1`)
//
// Real servers that check a password, made by this user in owned folders: a PostgreSQL cluster whose `pg_hba.conf` names one method per database (`scram-sha-256`, `md5`, `password`,
// `trust`), a MySQL server at its default authentication plugin, and (a pinned image, `PE1_MARIADB_IMAGE`) a MariaDB container at its default plugin. The launch is the builder's own for
// the entry (`buildDbQueryLaunch(..., { bridged: true })` under `bridgedSshEnv`), with the controls V3 will write added by hand in the shape V3 will write them. Each login is asked with
// the entry's credential and with a wrong one; PE1-4 sets beside the `trust` leg the same launch with `require_auth` cut by hand, which must log in with the wrong password (the control
// that shows `trust` would have let it in). A RECORD harness: it prints `record (PE1-…)` lines, says `UNMEASURED` where a control or a server was not there, says `STOP (PE1-…)` when
// the entry's own login fails under the profile and succeeds without its controls, and fails only for the rig's own faults. PE1-7 (SQL Server) is measured by the PS1 jobs, which hold rig Q (`psLegs.cjs`, `legEntry`). POSIX only.
const fs = require('node:fs');
const path = require('node:path');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');
const rig = require('./lib/dbProbeRig.cjs');
const { discover, realVersion, buildsRecord } = require('./lib/dbProbeClients.cjs');
const legs = require('./lib/dbPe1Legs.cjs');

async function main(scope) {
  if (process.platform === 'win32') {
    console.log('skip  the PE1 login probe — Linux only');
    return 0;
  }
  const product = rig.loadProduct();
  const dir = ownedDir(scope, 'bridged-db-pe1');
  const home = path.join(dir, 'rig home');
  fs.mkdirSync(home, { recursive: true });
  const shared = { product, dir, home, absentFile: product.materializedKeyPath(dir, 'no-client-file') };
  console.log(`PE1: node ${process.version}; ${process.platform}/${process.arch}; CI=${process.env.CI ?? ''}`);
  const found = discover().filter((client) => ['psql', 'oracle', 'mariadb'].includes(client.family));
  for (const client of found) {
    rig.announce(client.name, `${client.exe} (found by ${client.via})`, realVersion(client).line);
  }
  const psql = found.find((client) => client.family === 'psql');
  if (psql === undefined) {
    rig.check('the psql client is installed', process.env.CI !== 'true', 'no psql client was found: install postgresql-client — a skipped leg on the runner proves nothing');
  }
  const psqlRan = psql !== undefined && (await legs.legPsql(scope, psql, shared));
  const mysqlRan = await legs.legMysql(scope, found.filter((client) => client.family !== 'psql'), shared, process.env.PE1_MARIADB_IMAGE);
  console.log('record (PE1-7) SQL Server is measured where rig Q is: the PS1 jobs (bridged-ps1-linux and bridged-ps1-windows) print PE1-7-go-sqlcmd and PE1-7-odbc-sqlcmd; this harness has no SQL Server');
  // Only the clients a leg launched: the job's file of builds lists what ran, never what the runner merely has.
  buildsRecord([...(psqlRan ? [psql] : []), ...mysqlRan]);
  return rig.finish('bridged db PE1');
}

harnessScope.run(main);
