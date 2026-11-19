// PK1 of the remote bridge's E1.7 (the spec todo/PLAN_remote_bridge_scoped_E1_S7_spec.md §S7.4; parent §7, the probe table row PK1): does a bridged database client offer an identity
// that is not the entry's?
//
//   npm run compile && node scripts/bridged-pk1-itest.cjs        (`npm run itest:bridged-pk1`)
//
// A RECORD, as every probe of E1.7 (§S7.2): each leg prints what the client did, beside its POSITIVE CONTROL, under the bridged environment (rule R2: `PATH` and `HOME` only off Windows;
// a ticket found only through `KRB5CCNAME` does not count). It fails only for the rig's own faults: a missing tool (named), a server that did not start, a client that never reached its
// receiver. `UNMEASURED <leg>` says that the control could not be produced and why (never a pass); `STOP (<leg>)` says that an answer went against the parent's decision for that pair.
//
//   Linux     `psql`: the GSS-encryption road, the GSSAPI-authentication road and the client-certificate road (PK1-p0 to PK1-p6), against a throwaway Kerberos realm BRIDGE.TEST with a ticket in
//             the default cache (rig K), a real PostgreSQL server whose log names the identity and the method (rig G) and fakes that show the request and that a token followed (rig F).
//             Oracle's `mysql` and MariaDB's client: a fake server that switches the client to each plugin of the parent's list and to every other loadable plugin (PK1-m1 to PK1-m8),
//             and to a plugin named by a path (PK1-m7).
//   Windows   `psql.exe`: SSPI with the runner's own logon (PK1-w0, w1), what the build says of GSSAPI (w2), the profile files (w3), the GSSAPI request 7 (w4); Oracle's `mysql.exe`:
//             a clear-text request (m5) and Windows authentication with the receiver reading the account's name (m6).
//
// The Kerberos realm writes `/etc/krb5.conf` and the Windows profile legs write the runner's own `%APPDATA%\postgresql`: both only when `CI=true` and the step sets
// `BRIDGED_DB_SYSTEM_RIG=1` (rule R3), and both put the files back. Anywhere else the leg is a printed skip that says `UNMEASURED`. Nothing real stands in a committed file (R5): the realm,
// the principals, the roles and the words are made at run time.
//
// The clients are named by an absolute path: `BRIDGED_PSQL` (default `/usr/bin/psql`), `BRIDGED_MYSQL_ORACLE` (default `/usr/bin/mysql`), `BRIDGED_MYSQL_ORACLE_OWN` (Oracle's own build, when the step unpacks it:
// then it is the `oracle` client and `BRIDGED_MYSQL_ORACLE` is the `oracle-distro` one), `BRIDGED_MYSQL_MARIADB` (default `/usr/bin/mariadb`); a
// PostgreSQL server by `BRIDGED_PG_BIN` or its usual folder. With `CI=true` a missing client or server FAILS; off CI it is a printed skip.
const fs = require('fs');
const path = require('path');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');
const probe = require('./lib/dbProbe.cjs');
const { startRealm } = require('./lib/pkKrbRig.cjs');
const { startPgServer } = require('./lib/pkPgServer.cjs');
const { psqlLinux } = require('./lib/pkPsqlLegs.cjs');
const { psqlWindows } = require('./lib/pkPsqlWin.cjs');
const { mysqlLegs } = require('./lib/pkMysqlLegs.cjs');

const { check, versionLine, systemRig } = probe;
const { versionOfClient } = require('./lib/dbProbeRig.cjs');

/** The builds this job's legs ran, in the order the clients were named: printed again at the end, so that a row of the parent's table can be checked against the build every leg ran. */
const ran = [];

/** A client's path and version line (rule R1), or `undefined` with the failure of a missing tool on CI. */
function client(name, variable, fallback, package_, family) {
  const exe = process.env[variable] ?? fallback;
  const version = exe !== undefined && fs.existsSync(exe) ? versionLine(exe) : undefined;
  const said = version === undefined || family === undefined ? undefined : versionOfClient(family, version);
  console.log(`${name}: ${exe ?? 'no path'}: ${version ?? 'not found'}${said === undefined ? '' : ` (the version it says: ${said.number})`}`);
  if (version !== undefined) {
    ran.push(`${name} ${said?.number ?? version}`);
  }
  if (version === undefined) {
    check(`${name} is installed`, process.env.CI !== 'true', `${exe} is missing (${package_}; set ${variable}) — a skipped leg on the runner proves nothing`);
    return undefined;
  }
  return { exe, version };
}

async function linux(scope, dir, home, product) {
  const psql = client('psql', 'BRIDGED_PSQL', '/usr/bin/psql', 'the postgresql-client package', 'psql');
  const oracle = client("Oracle's mysql", 'BRIDGED_MYSQL_ORACLE', '/usr/bin/mysql', 'the mysql-client package', 'oracle');
  // Oracle's own build (the generic Linux archive, checked against its SHA-256 and unpacked by the step into the folder the build was made for): it carries the Kerberos, LDAP, key-file and security-key
  // client plugins that the distribution's package leaves out. When the step names it, it IS the `oracle` client and the distribution's package is `oracle-distro`.
  const own = process.env.BRIDGED_MYSQL_ORACLE_OWN === undefined ? undefined : client("Oracle's own mysql build", 'BRIDGED_MYSQL_ORACLE_OWN', undefined, "Oracle's generic archive, unpacked by the step", 'oracle');
  const mariadb = client("MariaDB's client", 'BRIDGED_MYSQL_MARIADB', '/usr/bin/mariadb', "MariaDB's mariadb-client-core, unpacked by the step", 'mariadb');
  const realm = await startRealm(scope, path.join(dir, 'k'), home).catch((error) => {
    check('rig K: the realm was built', false, error.message);
    return { ok: false, why: error.message };
  });
  if (!realm.ok) {
    console.log(`UNMEASURED the realm legs: ${realm.why}`);
  }
  if (psql !== undefined) {
    const pg = realm.ok
      ? await startPgServer(scope, path.join(dir, 'g'), { roles: [realm.user], keytab: realm.serviceKeytab }).catch((error) => {
        check('rig G: the real server was built', false, error.message);
        return { ok: false, why: error.message };
      })
      : { ok: false, why: realm.why };
    await psqlLinux({ scope, dir, product, exe: psql.exe, home, realm, pg });
  }
  const clients = [
    own === undefined ? [] : [{ name: 'oracle', family: 'oracle', exe: own.exe }],
    oracle === undefined ? [] : [{ name: own === undefined ? 'oracle' : 'oracle-distro', family: 'oracle', exe: oracle.exe }],
    mariadb === undefined ? [] : [{ name: 'mariadb', family: 'mariadb', exe: mariadb.exe }],
  ].flat();
  if (clients.length > 0) {
    await mysqlLegs({ scope, dir, product, home, realm, canWriteHome: true }, clients);
  }
}

async function windows(scope, dir, home, product) {
  const psql = client('psql', 'BRIDGED_PSQL', undefined, 'PostgreSQL for Windows, whose bin folder is not on PATH on windows-latest', 'psql');
  const oracle = client("Oracle's mysql", 'BRIDGED_MYSQL_ORACLE', undefined, "Oracle's MySQL for Windows", 'oracle');
  if (psql !== undefined) {
    const pg = await startPgServer(scope, path.join(dir, 'g'), { roles: [] }).catch((error) => {
      check('rig G: the real server was built', false, error.message);
      return { ok: false, why: error.message };
    });
    await psqlWindows({ scope, dir, product, exe: psql.exe, home, pg, systemRig: systemRig() });
  }
  if (oracle !== undefined) {
    await mysqlLegs({ scope, dir, product, home, realm: { ok: false, why: 'a runner outside a domain has no Kerberos ticket' }, canWriteHome: false }, [{ name: 'oracle', exe: oracle.exe }]);
  }
}

async function main(scope) {
  if (process.platform === 'darwin') {
    console.log('skip  PK1 on macOS: this plan\'s CI has no such runner (UNMEASURED, so every macOS pair stays refused)');
    return 0;
  }
  probe.printRun('PK1', [`the compiled product: ${path.join(__dirname, '..', 'out')}`]);
  if (!fs.existsSync(path.join(__dirname, '..', 'out', 'dbCliLauncher.js'))) {
    check('the product is compiled (npm run compile)', false, 'out/dbCliLauncher.js is missing');
    return 1;
  }
  const dir = ownedDir(scope, 'bridged-pk1');
  const home = path.join(dir, 'rig home');
  fs.mkdirSync(home, { recursive: true });
  const product = probe.productOf();
  await (process.platform === 'win32' ? windows : linux)(scope, dir, home, product);
  console.log(`record (R1) the builds every leg of this job ran: ${ran.join('; ') || 'no client'}`);
  probe.printTable('PK1');
  const failures = probe.failureCount();
  console.log(failures === 0 ? '\nall PK1 rig checks passed (the legs above are records, not assertions)' : `\n${failures} rig check(s) failed`);
  return failures === 0 ? 0 : 1;
}

harnessScope.run(main);
