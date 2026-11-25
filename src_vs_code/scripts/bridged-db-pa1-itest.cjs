// PA1 of the E1.7 spec (`research/PLAN_remote_bridge_scoped_E1_S7_spec.md` §S7.4; parent §7's probe table): versions, known controls and the floor of each database client.
//
//   npm run compile && node scripts/bridged-db-pa1-itest.cjs        (`npm run itest:bridged-db-pa1`)
//
// A RECORD harness: it asserts nothing about the build. It prints, for each client the runner carries, what that client answered, each beside its positive control, in
// lines that start `record (PA1-x)`; a line that starts `UNMEASURED <leg>` says that a positive control could not be produced (it is no pass), and a line that starts
// `STOP (PA1-x)` says that an answer went against the spec's decision for the probe. It FAILS only for the rig's own faults: a client the runner must carry and does not
// (named by its package), a fake server the client never reached, a control that did not answer. Every client is run under the bridged environment (`bridgedSshEnv` with
// `PATH` and `HOME` of a rig home); an older `psql` in a container cannot take it and runs under its image's own.
//
//   PA1-a  each client's version flag: the whole line, its stream, the exit code and the build tag; for `sqlcmd` the answers to `--version` and `-?` too; the libpq file each
//          installed `psql` loads (N3)
//   PA1-b  `psql` against a fake server with each candidate keyword (`require_auth`, `sslcertmode`, `gssencmode`) alone and as V3 will write them: known when the server is reached
//   PA1-c  `gssencmode='require'`: whether the build can do GSSAPI at all
//   PA1-d  each `mysql` client with `--plugin-dir`, `--skip-enable-cleartext-plugin` and (MariaDB's) `--restricted-auth`
//   PA1-e  the files of each `mysql` client's own plugin folder, found by what the client says when it looks for a plugin that is not there
//   PA1-f  each `sqlcmd` with each candidate flag
//   PA1-g  an older `psql` in a container (`PA1_OLD_PSQL_IMAGES`, a comma list of image digests the workflow pulled) with the string V3 will write
//   PA1-h  what the runner carries
//   PA1-i  which file the program word `psql` is, and whether a `~/.postgresqlrc` in the home folder can make the version start and the query start differ (Debian and Ubuntu): the program each of the two
//          spawns started, with and without a marker that names a REMOTE cluster and one that names a LOCAL cluster of the other installed major (a real cluster made with that major's own
//          pg_createcluster under the system rig, dropped by the scope); a wrapper that follows neither is UNMEASURED, with the reason
//
// Clients are found by `BRIDGED_PSQL`, `BRIDGED_MYSQL_ORACLE`, `BRIDGED_MYSQL_ORACLE_OWN` (Oracle's own build, a second `oracle` client), `BRIDGED_MYSQL_MARIADB`, `BRIDGED_SQLCMD_GO`,
// `BRIDGED_SQLCMD_ODBC`, else by `PATH`. With `CI=true` on Linux a missing `psql`, Oracle's `mysql` or MariaDB's client FAILS; any other missing client is `UNMEASURED`, with its name. Off CI nothing
// is installed and a missing client is the same printed fact. Linux and Windows.
//
// `PA1_FAMILIES` (a comma list of `psql`, `oracle`, `mariadb`, `go-sqlcmd`, `odbc-sqlcmd`) limits the run to those families: the PS1 jobs name the two `sqlcmd` clients, so that PA1 records the
// build that PS1's legs run, in the same job (a row of the parent's table is judged per recorded build). The job prints one `record (R1) the builds every leg of this job ran` line at its end.
const fs = require('node:fs');
const path = require('node:path');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');
const rig = require('./lib/dbProbeRig.cjs');
const { discover, realVersion, buildsRecord, REQUIRED_ON_CI_LINUX } = require('./lib/dbProbeClients.cjs');
const clients = require('./lib/dbPa1Clients.cjs');
const psql = require('./lib/dbPa1Psql.cjs');
const wrapper = require('./lib/dbPa1Wrapper.cjs');

/** The legs one client family has, in order: its version line first (R1), then PA1-a, then its own. The client as measured: a new object with the driver it read, for the ODBC client. */
async function legsOf(scope, client, shared) {
  rig.announce(client.name, `${client.exe} (found by ${client.via})`, realVersion(client).line); // R1: the line comes first (the version line of the client's own family, not its first line)
  clients.legA(client, shared);
  if (client.family === 'psql') {
    psql.libpqLegs();
    await psql.legB(scope, client, shared);
  } else if (client.family === 'oracle' || client.family === 'mariadb') {
    await clients.legD(scope, client, shared);
    await clients.legE(scope, client, shared);
  } else {
    const measured = client.family === 'odbc-sqlcmd' ? { ...client, driver: await clients.odbcDriver(client, shared) } : client;
    await clients.legF(scope, measured, shared);
    return measured;
  }
  return client;
}

/** A client family the runner lacks: the rig's fault on a Linux CI run for the three the workflow installs, a printed `UNMEASURED` for any other. */
function missing(family) {
  const required = process.env.CI === 'true' && process.platform === 'linux' ? REQUIRED_ON_CI_LINUX.find(([name]) => name === family) : undefined;
  if (required === undefined) {
    rig.unmeasured(`PA1 ${family}`, `no ${family} client on this runner (not on PATH, and no BRIDGED_* name for it)`);
  } else {
    rig.check(`the ${family} client is installed`, false, `no ${family} client was found: install ${required[1]} — a skipped leg on the runner proves nothing`);
  }
}

/** The families this run covers: all five, or `PA1_FAMILIES`. */
const familiesOfRun = () => {
  const named = (process.env.PA1_FAMILIES ?? '').split(',').map((name) => name.trim()).filter((name) => name !== '');
  return named.length === 0 ? ['psql', 'oracle', 'mariadb', 'go-sqlcmd', 'odbc-sqlcmd'] : named;
};

async function main(scope) {
  const product = rig.loadProduct();
  const dir = ownedDir(scope, 'bridged-db-pa1');
  const home = path.join(dir, 'rig home');
  fs.mkdirSync(home, { recursive: true });
  const shared = { product, dir, home, absentFile: product.materializedKeyPath(dir, 'no-client-file') };
  console.log(`PA1: node ${process.version}; ${process.platform}/${process.arch}; CI=${process.env.CI ?? ''}; system rig ${rig.mayWriteSystem() ? 'on' : 'off'}`);
  console.log(`record (R1) the runner image of this job: ${rig.runnerImage()}`);
  wrapper.legH();
  const families = familiesOfRun();
  const found = discover().filter((client) => families.includes(client.family));
  for (const family of families) {
    if (!found.some((client) => client.family === family)) {
      missing(family);
    }
  }
  const measured = [];
  for (const client of found) {
    measured.push(await legsOf(scope, client, shared));
  }
  let ranByWord;
  if (process.platform === 'linux' && families.includes('psql')) {
    await psql.legG(scope, shared);
    ranByWord = await wrapper.legI(scope, shared);
  }
  // PA1-i runs the word on PATH, which can be another file than the psql the other legs ran: then it is named too, as a client of its own.
  const another = ranByWord !== undefined && !measured.some((client) => client.family === 'psql' && client.exe === ranByWord.exe);
  buildsRecord([...measured, ...(another ? [ranByWord] : [])]);
  return rig.finish('bridged db PA1');
}

harnessScope.run(main);
