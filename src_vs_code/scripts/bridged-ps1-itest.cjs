// PS1 of the remote bridge's E1.7 (the spec todo/PLAN_remote_bridge_scoped_E1_S7_spec.md §S7.4; parent §7, the probe table row PS1): what a bridged `sqlcmd` signs in with.
//
//   npm run compile && node scripts/bridged-ps1-itest.cjs        (`npm run itest:bridged-ps1`)
//
// A RECORD, as every probe of E1.7 (§S7.2): go-sqlcmd and the ODBC client, each named by its own version answers (rule R1), against a REAL SQL Server that says how each login was made
// (`auth_scheme` of the session, the name it was logged in as, its own error log); each leg beside its positive control, a launch with NO user, as the builder wrote it until §S6.15.
// The same run measures PE1-7 (the entry's own SQL login: logged in with `auth_scheme` SQL, and a wrong password refused) for each client, since rig Q is here.
// A leg whose run says the RIG failed (the reading login lacked a permission, the client refused the receiver's certificate) is `UNMEASURED`, never a `STOP`.
// It fails only for the rig's own faults: a missing tool (named), a server that did not come up, a client that never ended. `UNMEASURED <leg>` says the control could not be produced.
//
//   Linux     Microsoft's container image on the runner's docker (`BRIDGED_MSSQL_IMAGE`, pinned by tag and digest in the workflow), a throwaway CA put in the trust store with `sudo` and taken out
//             again (rule R3), and the throwaway Kerberos realm of PK1 (rig K) so that the control can be an integrated attempt that the server records.
//   Windows   SQL Server Express installed by the workflow step with TCP on a fixed loopback port (`BRIDGED_MSSQL_PORT`, `BRIDGED_MSSQL_ERRORLOG`); the control is the runner's own logon.
//
// PA1 runs in the same job before this probe (`PA1_FAMILIES=go-sqlcmd,odbc-sqlcmd`), so that the build PA1 records for each `sqlcmd` is the build these legs ran.
//
// The clients are named by path: `BRIDGED_SQLCMD_GO` (go-sqlcmd; the rig's own administrator too) and `BRIDGED_SQLCMD_ODBC` (the ODBC client, default `/opt/mssql-tools18/bin/sqlcmd`). With `CI=true`
// a missing one FAILS; off CI it is a printed skip. macOS: this plan's CI has no runner, so every macOS pair stays refused.
const fs = require('fs');
const path = require('path');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');
const probe = require('./lib/dbProbe.cjs');
const { startRealm } = require('./lib/pkKrbRig.cjs');
const { startSqlServer } = require('./lib/psSqlServer.cjs');
const { ps1Legs } = require('./lib/psLegs.cjs');

const { realVersion, buildsRecord } = require('./lib/dbProbeClients.cjs');

const { check, versionLine, systemRig } = probe;

/** A client's path, with the answers to `--version` and to `-?` (rule R1; they tell go-sqlcmd from the ODBC client), or `undefined` with the failure of a missing tool on CI. */
function client(name, variable, fallback, package_) {
  const exe = process.env[variable] ?? fallback;
  const present = exe !== undefined && fs.existsSync(exe);
  console.log(`${name}: ${exe ?? 'no path'}: ${present ? 'found' : 'not found'}`);
  if (!present) {
    check(`${name} is installed`, process.env.CI !== 'true', `${exe} is missing (${package_}; set ${variable}) — a skipped leg on the runner proves nothing`);
    return undefined;
  }
  console.log(`  --version: ${versionLine(exe, ['--version']) ?? 'no answer'}`);
  console.log(`  -?: ${versionLine(exe, ['-?']) ?? 'no answer'}`);
  // Neither answer's first line names a version (the tool's name), so the version is read where the client puts it: `Version: v1.10.0`, `Version 18.6.1.1 Linux`.
  const version = realVersion({ family: name, exe });
  console.log(`  the version it says: ${version.number ?? 'none read'} (${version.line})`);
  return { name, exe };
}

async function main(scope) {
  if (process.platform === 'darwin') {
    console.log('skip  PS1 on macOS: this plan\'s CI has no such runner (UNMEASURED, so every macOS pair stays refused)');
    return 0;
  }
  probe.printRun('PS1', [`the compiled product: ${path.join(__dirname, '..', 'out')}`]);
  if (!fs.existsSync(path.join(__dirname, '..', 'out', 'dbCliLauncher.js'))) {
    check('the product is compiled (npm run compile)', false, 'out/dbCliLauncher.js is missing');
    return 1;
  }
  const go = client('go-sqlcmd', 'BRIDGED_SQLCMD_GO', undefined, 'the release asset the workflow downloads and checks');
  const odbc = client('odbc-sqlcmd', 'BRIDGED_SQLCMD_ODBC', process.platform === 'win32' ? undefined : '/opt/mssql-tools18/bin/sqlcmd', 'the mssql-tools18 package');
  const linux = process.platform !== 'win32';
  if (go === undefined) {
    console.log('UNMEASURED PS1: go-sqlcmd is also the rig\'s own administrator, and it is missing');
  } else if (linux && !systemRig()) {
    console.log('UNMEASURED PS1: the receiver is a container and the CA goes in the runner\'s trust store: a CI runner whose step sets BRIDGED_DB_SYSTEM_RIG=1 (rule R3)');
  } else {
    const dir = ownedDir(scope, 'bridged-ps1');
    const home = path.join(dir, 'rig home');
    fs.mkdirSync(home, { recursive: true });
    const product = probe.productOf();
    const q = await startSqlServer(scope, path.join(dir, 'q'), go.exe).catch((error) => {
      check('rig Q: the receiver was built', false, error.message);
      return { ok: false, why: error.message };
    });
    if (q.ok) {
      const realm = linux ? await startRealm(scope, path.join(dir, 'k'), home).catch((error) => ({ ok: false, why: error.message })) : { ok: false, why: 'a runner outside a domain has no Kerberos ticket' };
      if (realm.ok) {
        realm.addPrincipal(`MSSQLSvc/127.0.0.1:${q.port}`);
      }
      await ps1Legs({ scope, dir, product, home, q, realm }, [go, odbc].filter((entry) => entry !== undefined));
    } else {
      console.log(`UNMEASURED PS1: no receiver (${q.why})`);
    }
  }
  buildsRecord([go, odbc].filter((entry) => entry !== undefined).map((entry) => ({ ...entry, family: entry.name })));
  probe.printTable('PS1');
  const failures = probe.failureCount();
  console.log(failures === 0 ? '\nall PS1 rig checks passed (the legs above are records, not assertions)' : `\n${failures} rig check(s) failed`);
  return failures === 0 ? 0 : 1;
}

harnessScope.run(main);
