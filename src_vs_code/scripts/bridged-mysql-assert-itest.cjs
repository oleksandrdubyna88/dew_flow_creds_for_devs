// Leg (v) of the E1.7 spec (`todo/PLAN_remote_bridge_scoped_E1_S7_spec.md` §S7.12): the probe cases of PK1 (each plugin leg m1-m7), PP1 and PE1 for each `mysql` client (Oracle's and MariaDB's) as ASSERTIONS,
// through the REAL builder and the REAL database client check.
//
//   npm run compile && node scripts/bridged-mysql-assert-itest.cjs        (`npm run itest:bridged-mysql-assert`)
//
// Until a row is served each leg is handed the production table with the one CANDIDATE row put in (`CANDIDATE mysql ...`, `scripts/lib/dbCandidates.cjs`); once it is served the legs read the production table
// alone and print `PRODUCTION mysql ...`. The legs are the probe legs of PK1 (`lib/pkMysqlLegs.cjs`), PP1 and PE1 (`lib/dbPp1Legs.cjs`, `lib/dbPe1Legs.cjs`), whose printed records `lib/dbAssertRules.cjs` reads:
// for each plugin of the parent's list (Kerberos, LDAP SASL, the cloud key file, a security key, a clear-text request, and PK1-m5b where the plugin may be linked into the client) the control shows the identity on
// offer and the launch as built, for entries A and B, offers none; PK1-m7's four path names open no copy; PP1-1 comes in over TCP; PE1-5 or PE1-6 logs the entry in and refuses a wrong password at both the MySQL and
// the MariaDB server. A plugin the parent's list does not name for a client is not that client's road. A leg whose control is not shown (a build that lacks the plugin, no realm, no device) FAILS a pair that is
// served (R4) and is printed `BLOCKING` for a candidate. With `BRIDGED_DB_JOB` set, the lock of `lib/dbServedJobs.cjs` applies. POSIX only.
const fs = require('node:fs');
const path = require('node:path');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');
const rig = require('./lib/dbProbeRig.cjs');
const { discover, realVersion } = require('./lib/dbProbeClients.cjs');
const { startRealm } = require('./lib/pkKrbRig.cjs');
const { mysqlLegs } = require('./lib/pkMysqlLegs.cjs');
const pe1 = require('./lib/dbPe1Legs.cjs');
const pp1 = require('./lib/dbPp1Legs.cjs');
const { tapped, conclude } = require('./lib/dbAssert.cjs');

async function legs(scope) {
  const product = rig.loadProduct();
  const dir = ownedDir(scope, 'bridged-mysql-assert');
  const home = path.join(dir, 'rig home');
  fs.mkdirSync(home, { recursive: true });
  const shared = { product, dir, home, absentFile: product.materializedKeyPath(dir, 'no-client-file') };
  const clients = discover().filter((client) => client.family === 'oracle' || client.family === 'mariadb');
  for (const client of clients) {
    rig.announce(client.name, `${client.exe} (found by ${client.via})`, realVersion(client).line);
  }
  const oracle = clients.find((client) => client.family === 'oracle');
  if (oracle === undefined) {
    rig.check("Oracle's mysql client is installed", process.env.CI !== 'true', 'no Oracle mysql client was found: install mysql-client — a skipped leg on the runner proves nothing');
    return;
  }
  const realm = await startRealm(scope, path.join(dir, 'k'), home).catch((error) => ({ ok: false, why: error.message }));
  await mysqlLegs({ scope, dir, product, home, realm, canWriteHome: true }, clients);
  await pe1.legMysql(scope, clients, shared, process.env.PE1_MARIADB_IMAGE);
  await pp1.legMysql(scope, oracle, clients.filter((client) => client !== oracle), shared);
}

async function main(scope) {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    console.log(`skip  leg (v) on ${process.platform}: this plan measures the mysql clients on Linux only (a Windows or macOS pair stays refused)`);
    return 0;
  }
  console.log(`(v) mysql assertions: node ${process.version}; ${process.platform}/${process.arch}; CI=${process.env.CI ?? ''}; BRIDGED_DB_JOB=${process.env.BRIDGED_DB_JOB ?? ''}`);
  if (!fs.existsSync(path.join(__dirname, '..', 'out', 'dbCliLauncher.js'))) {
    console.log('FAIL the product is compiled (npm run compile): out/dbCliLauncher.js is missing');
    return 1;
  }
  const { lines } = await tapped(() => legs(scope));
  return conclude('mysql', lines);
}

harnessScope.run(main);
