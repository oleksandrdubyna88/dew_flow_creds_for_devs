// The `container` platform's assertions (change 11.1, the 72-hour slice, S3 part 2; consult ae318292): the ODBC `sqlcmd` of the image a Windows laptop runs a bridged query in, built from the
// shipped recipe (`containers/db-sqlcmd.Containerfile`) by the product's own `buildArgv` and probed by the product's own `containerCheck`, with every leg run through the product's
// `spawnInContainer` (the env file, `run --rm --pull never --cap-drop ALL --user 65534:65534`). Docker stands in for wslc: the road gives both the same `run` words.
//
//   npm run compile && node scripts/bridged-container-sqlcmd-itest.cjs        (a Linux CI runner whose step sets BRIDGED_DB_SYSTEM_RIG=1)
//
// The legs (`lib/containerLegs.cjs`, `containerSqlcmdRules` of `lib/dbAssertRules.cjs`): CI-0/CI-1 (the runner holds an identity, the container sees none), PS1-1, PE1-7 (the server's own word: the
// session's auth_scheme and its log), PS1-8, PS1-9 and PS1-4 (with their controls), CI-argv and CI-envfile. Until the `container` row is served the check is handed the production table with
// `CONTAINER_SQLCMD_CANDIDATE` put in (`CANDIDATE ... container`); once it is served the production table alone (`PRODUCTION ... container`), and `BRIDGED_DB_JOB` applies the lock.
//
// The receiver is rig Q (`lib/psSqlServer.cjs`), also published on the docker bridge's gateway so that a container on the default network reaches it, with a certificate that names that address.
// The legs run in a TEST image: the shipped one with two files added, the throwaway CA in its trust store (the profile refuses TrustServerCertificate) and a system data source for PS1-4. The
// test image's client and driver are probed too and must answer as the shipped image does.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const harnessScope = require('./lib/harnessScope.cjs');
const owned = require('./lib/leftovers.cjs');
const probe = require('./lib/dbProbe.cjs');
const { startRealm, putBackSystemFiles } = require('./lib/pkKrbRig.cjs');
const { startSqlServer } = require('./lib/psSqlServer.cjs');
const { legBuilt, legEntry, legScripting, listener } = require('./lib/psLegs.cjs');
const legs = require('./lib/containerLegs.cjs');
const { tapped, conclude } = require('./lib/dbAssert.cjs');

const OUT = path.join(__dirname, '..', 'out');
const NAME = 'container-odbc-sqlcmd';
const RECIPE = path.join(__dirname, '..', 'containers', 'db-sqlcmd.Containerfile');

const product = () => ({
  db: require(path.join(OUT, 'containerDb.js')),
  road: require(path.join(OUT, 'containerDbQuery.js')),
  profile: require(path.join(OUT, 'bridgedDbProfile.js')),
  runner: require(path.join(OUT, 'sshExecRunner.js')),
});

/** The gateway of docker's default bridge: the address a container on the default network reaches this runner by. */
function gateway() {
  return probe.rigRun('docker', ['network', 'inspect', 'bridge', '--format', '{{(index .IPAM.Config 0).Gateway}}']).trim();
}

/** Builds an image and removes it by its exact tag when the scope ends. */
function built(scope, argv, tag) {
  scope.after(() => probe.rigRun('docker', ['rmi', '-f', tag]));
  probe.rigRun('docker', argv, { timeout: 1_500_000, maxBuffer: 64 * 1024 * 1024 });
}

/** The test image: the shipped one with the throwaway CA and PS1-4's system data source. */
function testImage(scope, dir, base, ca, dsn) {
  const folder = path.join(dir, 'test-image');
  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(ca, path.join(folder, 'ca.crt'));
  fs.writeFileSync(path.join(folder, 'odbc.ini'), dsn);
  fs.writeFileSync(path.join(folder, 'Containerfile'), [
    `FROM ${base}`, 'USER 0:0', 'COPY ca.crt /usr/local/share/ca-certificates/bridge-test-ci.crt', 'COPY odbc.ini /etc/odbc.ini', 'RUN update-ca-certificates', 'USER 65534:65534', '',
  ].join('\n'));
  const tag = `creds-ci-sqlcmd-test:${crypto.randomBytes(6).toString('hex')}`;
  built(scope, ['build', '--label', `testsToDelete.owner=${owned.formatOwner(owned.thisOwner())}`, '-t', tag, '-f', path.join(folder, 'Containerfile'), folder], tag);
  return tag;
}

/** The table the check is handed, and its mode: the production table when it serves the `container` row, else with the candidate row put in. */
function tableOf(parts) {
  const rows = parts.profile.BRIDGED_DB_PROFILES;
  const row = rows.find((one) => one.client === 'sqlcmd' && one.platform === 'container');
  return row?.served === true ? { rows, mode: 'PRODUCTION' } : { rows: rows.map((one) => (one === row ? parts.profile.CONTAINER_SQLCMD_CANDIDATE : one)), mode: 'CANDIDATE' };
}

/** The verdict of the product's own check on an image, under `table`. */
async function verdictOn(parts, deps, useCtx, image) {
  return parts.road.containerCheck({ ...deps, container: { ...deps.container, runtime: { tool: 'docker', image } } }, useCtx, 'sqlcmd');
}

/** The verdict's build as the ledger's table line reads it. */
const tableLine = (mode, verdict, image) => `${mode} sqlcmd ${verdict.vendor} ${verdict.version} ${JSON.stringify(verdict.tag)} container${verdict.driver === undefined ? '' : ` driver ${verdict.driver.version}`}  (${NAME}: ${image})`;

/** The road's deps: an owned storage folder, one exec slot at a time, the recorder as its runner. */
function roadOf(parts, dir, table) {
  const storageDir = path.join(dir, 'storage');
  fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  const rec = legs.recorder(parts.runner.runBounded, path.join(storageDir, parts.db.ENV_FILES_DIR));
  const deps = { storageDir, signal: new AbortController().signal, acquireExecSlot: () => () => undefined, note: (message) => console.log(`rig note (the container road): ${message}`), container: { runtime: undefined, run: rec.run }, profiles: table.rows };
  return { deps, rec };
}

/** The rig: the images, the receiver, the realm and the listener. `{ ok, why }` or the parts the legs need. */
async function rigOf(scope, dir, parts, go) {
  const gw = gateway();
  const shipped = parts.db.imageTagOf(fs.readFileSync(RECIPE));
  built(scope, parts.db.buildArgv({ tool: 'docker', image: shipped }, RECIPE), shipped);
  console.log(`rig: the shipped image ${shipped} was built from ${path.basename(RECIPE)} by the product's buildArgv; the docker bridge's gateway is ${gw}`);
  const q = await startSqlServer(scope, path.join(dir, 'q'), go, { also: gw }).catch((error) => ({ ok: false, why: error.message }));
  if (!q.ok) {
    return { ok: false, why: `no receiver (${q.why})` };
  }
  const home = path.join(dir, 'rig home');
  fs.mkdirSync(home, { recursive: true });
  const realm = await startRealm(scope, path.join(dir, 'k'), home).catch((error) => ({ ok: false, why: error.message }));
  const other = await listener(gw);
  scope.after(() => other.close());
  const dsn = ['[ps1dsn]', 'Driver=ODBC Driver 18 for SQL Server', `Server=${gw},${other.port}`, 'Trusted_Connection=yes', 'Encrypt=no', ''].join('\n');
  const test = testImage(scope, dir, shipped, q.ca, dsn);
  console.log(`rig: the legs run ${test}: the shipped image with the throwaway CA in its trust store and a system data source for PS1-4, and nothing else`);
  return { ok: true, q, home, realm, other, shipped, test };
}

async function measured(scope) {
  const go = process.env.BRIDGED_SQLCMD_GO;
  if (go === undefined || !fs.existsSync(go)) {
    probe.check('go-sqlcmd (the rig\'s own administrator) is installed, or this is no CI run', process.env.CI !== 'true', 'set BRIDGED_SQLCMD_GO');
    console.log('UNMEASURED CI: the rig\'s administrator (go-sqlcmd) is missing');
    return;
  }
  if (!probe.systemRig()) {
    console.log('UNMEASURED CI: the receiver is a container and the CA goes in the runner\'s trust store: a CI runner whose step sets BRIDGED_DB_SYSTEM_RIG=1 (rule R3)');
    return;
  }
  const parts = product();
  const dir = owned.ownedDir(scope, 'bridged-container-sqlcmd');
  const rig = await rigOf(scope, dir, parts, go);
  if (!rig.ok) {
    console.log(`UNMEASURED CI: ${rig.why}`);
    return;
  }
  const table = tableOf(parts);
  const { deps, rec } = roadOf(parts, dir, table);
  const useCtx = { accountId: 'rig', entityId: 'rig', entityName: 'the container rig', signal: new AbortController().signal };
  const verdict = await verdictOn(parts, deps, useCtx, rig.shipped);
  const onTest = await verdictOn(parts, deps, useCtx, rig.test);
  if (!verdict.ok || !onTest.ok || onTest.version !== verdict.version || onTest.driver?.version !== verdict.driver?.version) {
    console.log(`FINDING (rig/record) ${NAME}: the product's check under the ${table.mode} table: the shipped image ${verdict.ok ? `answered ${verdict.version}` : `was refused (${verdict.sentence})`}; the test image ${onTest.ok ? `answered ${onTest.version}` : `was refused (${onTest.sentence})`}`);
    console.log(`UNMEASURED CI-${NAME}: the check did not serve both images alike, so no leg ran`);
    return;
  }
  console.log(tableLine(table.mode, verdict, rig.shipped));
  console.log(`record (verdict) CI ${NAME}: the launch is built under the product check's verdict on the shipped image: ${verdict.vendor} ${verdict.version} driver ${verdict.driver?.version} at ${verdict.file.path}; the test image answered the same`);
  const left = [];
  const legDeps = { ...deps, container: { ...deps.container, runtime: { tool: 'docker', image: rig.test } } };
  const client = { name: NAME, exe: verdict.file.path };
  const ctx = { scope, dir, product: probe.productOf(), home: rig.home, q: rig.q, realm: rig.realm, verdict, container: true, run: legs.containerRun(parts.road.spawnInContainer, legDeps, useCtx, left, rec.leftAfter) };
  const shown = await legs.legIsolation(ctx, client);
  await legBuilt(ctx, client, shown);
  await legEntry(ctx, client);
  await legs.legAccount(ctx, client);
  await legScripting(ctx, client);
  await legs.legDataSource(ctx, client, rig.other);
  legs.legRoad(NAME, rec.runs, left);
}

async function main(scope) {
  if (process.platform !== 'linux') {
    console.log(`skip  the container legs on ${process.platform}: they run on a Linux CI runner's docker`);
    return 0;
  }
  console.log(`container sqlcmd assertions: node ${process.version}; ${process.platform}/${process.arch}; CI=${process.env.CI ?? ''}; BRIDGED_DB_JOB=${process.env.BRIDGED_DB_JOB ?? ''}`);
  if (!fs.existsSync(path.join(OUT, 'containerDbQuery.js'))) {
    console.log('FAIL the product is compiled (npm run compile): out/containerDbQuery.js is missing');
    return 1;
  }
  const { lines } = await tapped(async () => {
    try {
      return await measured(scope);
    } finally {
      putBackSystemFiles();
    }
  });
  return conclude('sqlcmd', lines, 'container');
}

harnessScope.run(main);
