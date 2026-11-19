// Leg (w) of the E1.7 spec (`todo/PLAN_remote_bridge_scoped_E1_S7_spec.md` §S7.12): the probe cases of PS1 and PE1-7 for each `sqlcmd` client (go-sqlcmd and the ODBC client) as ASSERTIONS, through the REAL
// builder and the REAL database client check.
//
//   npm run compile && node scripts/bridged-sqlcmd-itest.cjs        (`npm run itest:bridged-sqlcmd`)
//
// Until a row is served each leg is handed the production table with the one CANDIDATE row put in (`CANDIDATE sqlcmd ...`, with the ODBC client's driver, `scripts/lib/dbCandidates.cjs`); once it is served the
// legs read the production table alone and print `PRODUCTION sqlcmd ...`. The legs are those of `lib/psLegs.cjs`, whose printed records `lib/dbAssertRules.cjs` reads: PS1-0 (the control: an identity on offer,
// shown against a real SQL Server), PS1-1 and PS1-5 (the launch as built makes a plain SQL login, also with the identity in reach), PS1-3 (go-sqlcmd's configuration file is not read when -S is given), PS1-8 (a user
// written as a Windows account, and the flag that stops it), PS1-4 shown (the ODBC driver manager's files, beside its control), and PE1-7 (the entry's own SQL login, and a wrong password refused). A leg whose
// control is not shown FAILS a pair that is served (R4) and is printed `BLOCKING` for a candidate. With `BRIDGED_DB_JOB` set, the lock of `lib/dbServedJobs.cjs` applies.
//
// The receiver is a real SQL Server (rig Q): Microsoft's container image on Linux and, on Windows, SQL Server Express the workflow step installs with TCP on (`bridged-ps1-itest.cjs` makes both); the realm of PK1
// stands beside it on Linux for the control. The system-wide writes of rule R3 happen only when `CI=true` and the step sets `BRIDGED_DB_SYSTEM_RIG=1`.
const fs = require('node:fs');
const path = require('node:path');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');
const probe = require('./lib/dbProbe.cjs');
const { realVersion } = require('./lib/dbProbeClients.cjs');
const { startRealm } = require('./lib/pkKrbRig.cjs');
const { startSqlServer } = require('./lib/psSqlServer.cjs');
const { ps1Legs } = require('./lib/psLegs.cjs');
const { tapped, conclude } = require('./lib/dbAssert.cjs');

/** A client by path, or `undefined` (with the failure of a missing tool on CI). */
function client(name, variable, fallback) {
  const exe = process.env[variable] ?? fallback;
  const present = exe !== undefined && fs.existsSync(exe);
  console.log(`${name}: ${exe ?? 'no path'}: ${present ? 'found' : 'not found'}${present ? ` (${realVersion({ family: name, exe }).line})` : ''}`);
  if (!present) {
    probe.check(`${name} is installed`, process.env.CI !== 'true', `${exe} is missing (set ${variable}) — a skipped leg on the runner proves nothing`);
    return undefined;
  }
  return { name, exe };
}

async function legs(scope) {
  const go = client('go-sqlcmd', 'BRIDGED_SQLCMD_GO', undefined);
  const odbc = client('odbc-sqlcmd', 'BRIDGED_SQLCMD_ODBC', process.platform === 'win32' ? undefined : '/opt/mssql-tools18/bin/sqlcmd');
  const linux = process.platform !== 'win32';
  if (go === undefined) {
    console.log("UNMEASURED PS1: go-sqlcmd is also the rig's own administrator, and it is missing");
    return;
  }
  if (linux && !probe.systemRig()) {
    console.log('UNMEASURED PS1: the receiver is a container and the CA goes in the runner\'s trust store: a CI runner whose step sets BRIDGED_DB_SYSTEM_RIG=1 (rule R3)');
    return;
  }
  const dir = ownedDir(scope, 'bridged-sqlcmd-assert');
  const home = path.join(dir, 'rig home');
  fs.mkdirSync(home, { recursive: true });
  const q = await startSqlServer(scope, path.join(dir, 'q'), go.exe).catch((error) => ({ ok: false, why: error.message }));
  if (!q.ok) {
    console.log(`UNMEASURED PS1: no receiver (${q.why})`);
    return;
  }
  const realm = linux ? await startRealm(scope, path.join(dir, 'k'), home).catch((error) => ({ ok: false, why: error.message })) : { ok: false, why: 'a runner outside a domain has no Kerberos ticket' };
  if (realm.ok) {
    realm.addPrincipal(`MSSQLSvc/127.0.0.1:${q.port}`);
  }
  await ps1Legs({ scope, dir, product: probe.productOf(), home, q, realm }, [go, odbc].filter((entry) => entry !== undefined));
}

async function main(scope) {
  if (process.platform === 'darwin') {
    console.log('skip  leg (w) on macOS: this plan\'s CI has no such runner (every macOS pair stays refused)');
    return 0;
  }
  console.log(`(w) sqlcmd assertions: node ${process.version}; ${process.platform}/${process.arch}; CI=${process.env.CI ?? ''}; BRIDGED_DB_JOB=${process.env.BRIDGED_DB_JOB ?? ''}`);
  if (!fs.existsSync(path.join(__dirname, '..', 'out', 'dbCliLauncher.js'))) {
    console.log('FAIL the product is compiled (npm run compile): out/dbCliLauncher.js is missing');
    return 1;
  }
  const { lines } = await tapped(() => legs(scope));
  return conclude('sqlcmd', lines);
}

harnessScope.run(main);
