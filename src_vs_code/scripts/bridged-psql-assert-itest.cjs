// Leg (u) of the E1.7 spec (`todo/PLAN_remote_bridge_scoped_E1_S7_spec.md` §S7.12): the probe cases of PK1, PE1, PP1 and PA1-i for `psql` as ASSERTIONS, through the REAL builder and the REAL database client check.
//
//   npm run compile && node scripts/bridged-psql-assert-itest.cjs        (`npm run itest:bridged-psql-assert`)
//
// Until a row is served the check starts nothing (§S7.6 item 1), so each leg is handed the production table with the one CANDIDATE row put in (`CANDIDATE psql ...`, `scripts/lib/dbCandidates.cjs`); once the
// row is served the same legs read the production table alone and print `PRODUCTION psql ...`, and that run is the one the merge waits for (§S7.7). A leg never builds a verdict by hand.
//
// What it asserts (the direct legs are `lib/dbAssertPsqlLegs.cjs`, the others are the probe legs of PE1 and PP1 whose printed records `lib/dbAssertRules.cjs` reads): the control of each road leaks (the GSS
// encryption road, the GSSAPI authentication road, the client certificate) while production offers nothing, for entries A and B, also against an environment that says the opposite; the certificate road with
// the other defences cut (the leg that fails when `sslcertmode` is dropped, T60); `sslmode=verify-full` with a marker CA connects and offers nothing; `~/.postgresqlrc` steers neither host, port nor database;
// PE1-1 to PE1-4 (PE1-4 beside its control) and PP1-1. A leg whose control is not shown FAILS a pair that is served (R4) and is printed `BLOCKING` for a candidate.
//
// The realm and the real server (rigs K and G) are made by this run, and the realm writes `/etc/krb5.conf` only when `CI=true` and the step sets `BRIDGED_DB_SYSTEM_RIG=1` (R3); without them the road legs are
// printed `UNMEASURED` and the legs that need only the fakes still run. With `BRIDGED_DB_JOB` set, the lock of `lib/dbServedJobs.cjs` applies. POSIX only.
const fs = require('node:fs');
const path = require('node:path');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');
const rig = require('./lib/dbProbeRig.cjs');
const probe = require('./lib/dbProbe.cjs');
const { discover, realVersion } = require('./lib/dbProbeClients.cjs');
const { startRealm, putBackSystemFiles } = require('./lib/pkKrbRig.cjs');
const { startPgServer } = require('./lib/pkPgServer.cjs');
const pe1 = require('./lib/dbPe1Legs.cjs');
const pp1 = require('./lib/dbPp1Legs.cjs');
const { psqlDirectLegs } = require('./lib/dbAssertPsqlLegs.cjs');
const { tapped, conclude } = require('./lib/dbAssert.cjs');

/** The rigs K and G for the road legs, or the reason they are not there. */
async function roads(scope, dir, home) {
  const realm = await startRealm(scope, path.join(dir, 'k'), home).catch((error) => ({ ok: false, why: error.message }));
  if (!realm.ok) {
    return { realm, pg: { ok: false, why: realm.why } };
  }
  const pg = await startPgServer(scope, path.join(dir, 'g'), { roles: [realm.user], keytab: realm.serviceKeytab }).catch((error) => ({ ok: false, why: error.message }));
  return { realm, pg };
}

async function legs(scope) {
  const product = rig.loadProduct();
  const dir = ownedDir(scope, 'bridged-psql-assert');
  const home = path.join(dir, 'rig home');
  fs.mkdirSync(home, { recursive: true });
  const shared = { product, dir, home, absentFile: product.materializedKeyPath(dir, 'no-client-file'), scope, entryWord: probe.throwawayWord() };
  const psql = discover().find((client) => client.family === 'psql');
  if (psql === undefined) {
    rig.check('the psql client is installed', process.env.CI !== 'true', 'no psql client was found: install postgresql-client — a skipped leg on the runner proves nothing');
    return;
  }
  rig.announce(psql.name, `${psql.exe} (found by ${psql.via})`, realVersion(psql).line);
  const { realm, pg } = await roads(scope, dir, home);
  await psqlDirectLegs({ ...shared, exe: psql.exe }, realm, pg);
  await pe1.legPsql(scope, psql, shared);
  await pp1.legPsql(scope, psql, shared);
}

async function main(scope) {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    console.log(`skip  leg (u) on ${process.platform}: this plan measures psql on Linux only (a Windows or macOS pair stays refused)`);
    return 0;
  }
  console.log(`(u) psql assertions: node ${process.version}; ${process.platform}/${process.arch}; CI=${process.env.CI ?? ''}; BRIDGED_DB_JOB=${process.env.BRIDGED_DB_JOB ?? ''}`);
  if (!fs.existsSync(path.join(__dirname, '..', 'out', 'dbCliLauncher.js'))) {
    console.log('FAIL the product is compiled (npm run compile): out/dbCliLauncher.js is missing');
    return 1;
  }
  // The rig's changes outside its folder are put back before the legs are judged, so a failed put-back is a FAIL line of the ledger (a rig failure), not a warning after the verdict.
  const { lines } = await tapped(async () => {
    try {
      return await legs(scope);
    } finally {
      putBackSystemFiles();
    }
  });
  return conclude('psql', lines);
}

harnessScope.run(main);
