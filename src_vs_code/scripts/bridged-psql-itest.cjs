// Record legs of the bridged `psql` client (E1.6, the spec §S6.14 Y0, probes PD2 and PD3; parent §4.11 rows 7 and 9):
//
//   npm run compile && node scripts/bridged-psql-itest.cjs        (`npm run itest:bridged-psql`)
//
// The bridged launcher gives `psql` `HOME`, so libpq may read the PERSON's own files under it: `.pgpass` for a password, `.postgresql/postgresql.crt`
// and `.key` for a client certificate. Whether it does, and whether a variable that names a path that never exists closes the file, are facts of the
// client, so this asks a real `psql` against a fake server (as `bridged-mysql-itest.cjs` does for `mysql`). These are RECORD legs: they assert nothing
// about the build and print what the client did, in a form that goes into the spec's As-built. The only failures are the rig's own: no `psql`, a fake
// server the client never reached (so an empty answer would prove nothing), a folder or file the rig could not make.
//
//   PD2  a fake server answers a start-up message with a request for a clear-text password, records the password message and closes; `psql -w` runs
//        under a rig home whose `.pgpass` holds a MARKER for that host and port, with no `PGPASSWORD`: once with no `PGPASSFILE`, once with it at a
//        path that does not exist. Expected by the parent: the file is used with no variable, and the variable closes it.
//
//   PD3  a fake server answers `SSLRequest` with `S`, completes TLS with a throwaway server certificate, REQUESTS a client certificate and records
//        whether one was offered; `psql` runs with `sslmode=require` under a rig home whose `.postgresql` holds a throwaway `postgresql.crt` and
//        `postgresql.key` (the marker: its subject is `CN=${PD3_MARKER_CN}`): once with no `PGSSLCERT` and `PGSSLKEY`, once with both at paths that do not exist.
//        Expected by the parent: the certificate is offered with no variable, and the variables close it. A marker offered WITH the variables too
//        stops the work and goes to the lead. Server and client certificates are made by `openssl` at run time, in the owned folder: nothing is committed.
//
// Leg (r) (§S6.14 Y6), the two cases as ASSERTIONS, reshaped for the builder of the E1.6 spec §S6.15 Z2. The CONTROL (the first run of each: no variable) leaks the marker. The
// PRODUCTION launch is now the builder's own for an ENTRY THAT STORES A PASSWORD (Q16 refuses one that does not): its arguments (`buildDbQueryLaunch('postgres', …, { bridged: true,
// absentFile })`) and the environment of `bridgedSshEnv`, under the same rig homes. PD2 observes that the stored password arrives and the person's .pgpass marker does not (psql
// reads PGPASSWORD before any password file, so this alone no longer shows the `passfile` keyword at work); so a second case takes PGPASSWORD and PGPASSFILE out of the environment
// and shows that the built string's own `passfile` keyword keeps the .pgpass closed, beside a control with the three keywords cut out of the string, which sends the marker. PD3 does
// the same for the certificate: production offers none, and with PGSSLCERT and PGSSLKEY taken out the `sslcert` and `sslkey` keywords alone offer none, beside a control with the keywords cut out.
//
// PQ2 and (s) are in `lib/psqlProbeLegs.cjs`: PQ2 (§S6.15 Z0) completes PQ1 on this client, record legs whose lines start `record (PQ2-x)` (a line that starts `STOP (PQ2-` says an answer
// went against the parent's row), and (s) (Z5) is the stored URI handed whole as a control, the builder's refusal of it, and the builder's own launch for an entry inside the profile.
// The fake servers and the run of one `psql` are in `lib/psqlRig.cjs`.
//
// `psql` is named by an absolute path (`BRIDGED_PSQL`, default `/usr/bin/psql`); the harness prints its `--version`. With `CI=true` a missing one
// FAILS; off CI it is a printed skip. POSIX only.

const fs = require('fs');
const path = require('path');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir } = require('./lib/leftovers.cjs');
const R = require('./lib/psqlRig.cjs');
const { check, failureCount } = require('./lib/psqlCheck.cjs');
const { legPQ2 } = require('./lib/psqlProbeLegs.cjs');
const candidates = require('./lib/dbCandidates.cjs');
const { registerRan } = require('./lib/dbProbeClients.cjs');
const { PD2_PASSWORD_MARKER, PD3_MARKER_CN, holdsMarker, described, versionOf, psqlRun, throwawayCertificate } = R;

const OUT = path.join(__dirname, '..', 'out');

/** The rig's own failure, if there is one: the client must have reached the fake server, or an empty answer proves nothing. */
const reached = (name, run) => check(`${name}: the client reached the fake server and ended in time`, run.ended && run.state.startups >= 1, JSON.stringify({ ...run.state, ended: run.ended, code: run.code, stderr: run.stderr }));

const writePgpass = (home) => (port) => fs.writeFileSync(path.join(home, '.pgpass'), `127.0.0.1:${port}:*:pdprobe:${PD2_PASSWORD_MARKER}\n`, { mode: 0o600 });

/** PD2: the person's `.pgpass`, with no `PGPASSFILE` and with one that names a path that does not exist. */
async function legPD2(scope, exe, dir, product, verdict) {
  const home = path.join(dir, 'pd2 home');
  const absent = path.join(dir, 'pd2-pgpass-that-never-exists');
  fs.mkdirSync(home, { recursive: true });
  for (const withVariable of [false, true]) {
    const label = withVariable ? 'with PGPASSFILE at a path that does not exist' : 'with no PGPASSFILE';
    const run = await psqlRun(scope, exe, {
      env: { PATH: process.env.PATH, HOME: home, ...(withVariable ? { PGPASSFILE: absent } : {}) },
      prepare: writePgpass(home),
    });
    reached(`(PD2) psql ${label}`, run);
    const sent = run.state.sent;
    if (!withVariable) {
      check('(r) PD2 control: with no PGPASSFILE the person\'s .pgpass is used and its marker is sent (this rig can make the bad thing happen)', holdsMarker(sent), JSON.stringify({ sent: described(sent), stderr: run.stderr }));
    }
    console.log(`record (PD2) psql, ${label}: exit ${run.code}; a password message ${sent === undefined ? 'was NOT sent' : 'was sent'}; the marker from .pgpass ${holdsMarker(sent) ? 'STANDS' : 'does not stand'} in it; psql said ${JSON.stringify(run.stderr)}`);
    if (withVariable && holdsMarker(sent)) {
      console.log('STOP (PD2): the marker was sent WITH PGPASSFILE set too — no remedy is built, and row 7 returns to the lead (parent §7, row PD2)');
    }
  }
  check('(PD2) the path given as PGPASSFILE does not exist', !fs.existsSync(absent), absent);
  await legR2(scope, exe, dir, home, product, verdict);
}

/** The entry of every (r) production launch: it stores its own password (Q16 refuses one that does not) and names nothing but the profile. */
const entryUri = (port, query = '') => `postgresql://pdprobe:${R.PQ2_STORED_PASSWORD}@127.0.0.1:${port}/pdprobe${query}`;

/**
 * The controls of the two roads this leg isolates, cut out of the built string: the three keywords at the absent file (`passfile`, `sslcert`, `sslkey`) and `sslcertmode` (E1.7 V3 writes it after them, and it
 * alone keeps a client certificate from being offered, so a control that left it in would not show the person's certificate). `gssencmode` and `require_auth` stay: they are no road of these two legs. A path of the rig holds no quote.
 */
const withoutControls = (text) => text.replace(/ passfile='[^']*' sslcert='[^']*' sslkey='[^']*'/, '').replace(/ sslcertmode='[^']*'/, '');
/** The string with `sslcertmode` alone taken out: what isolates the `sslcert` and `sslkey` keywords (PD3's keyword case and its control differ by them alone). */
const withoutCertMode = (text) => text.replace(/ sslcertmode='[^']*'/, '');

/**
 * The production launch of `psql` for `uri`: the builder's arguments and, through `bridgedSshEnv`, the environment a bridged client gets, under `home`.
 * `without` names variables left out of that environment and `bare` leaves the three control keywords out of the string: the two ways (r) isolates one control
 * from another (the keyword alone; the variable alone is Q4b's and the PD legs'). A refusal by the builder is the rig's own fault, named.
 */
function productionLaunch(product, verdict, uri, home, absentFile, { without = [], bare = false, noCertMode = false } = {}) {
  const launchOf = product.buildDbQueryLaunch('postgres', uri, 'select 1', { bridged: true, absentFile, verdict });
  if (launchOf === undefined) {
    throw new Error('buildDbQueryLaunch refused the entry of a leg that must launch (it stores a password and names only the profile, under a good verdict of the real client check)');
  }
  const env = product.bridgedSshEnv({ PATH: process.env.PATH, HOME: home }, 'linux', launchOf.env);
  for (const name of without) {
    delete env[name];
  }
  const last = launchOf.args.length - 1;
  const cut = bare ? withoutControls : (noCertMode ? withoutCertMode : undefined);
  return { args: cut === undefined ? launchOf.args : launchOf.args.map((arg, at) => (at === last ? cut(arg) : arg)), env };
}

/**
 * (r), PD2's case, after Z2 (the E1.6 spec §S6.15, the sort for epoch 11): the entry stores a password, so the built launch sends it through PGPASSWORD, and psql
 * asks no password file for it. Three observations, under the rig home whose .pgpass holds the marker for this host and port:
 *   production      the stored password arrives and the marker does not (the case the leg was written for: the person's file is not used by a built launch);
 *   keyword alone   the built string with PGPASSWORD and PGPASSFILE taken out of the environment: only the `passfile` keyword stands between psql and the person's
 *                   .pgpass, and the marker still does not arrive;
 *   its control     the same with the three controls taken out of the string: the marker arrives, so the rig can make the bad thing happen.
 */
async function legR2(scope, exe, dir, home, product, verdict) {
  const absentFile = product.materializedKeyPath(dir, 'no-client-file');
  const cases = [
    ['production', {}],
    ['keyword alone: no PGPASSWORD and no PGPASSFILE in the environment, the built string', { without: ['PGPASSWORD', 'PGPASSFILE'] }],
    ['keyword alone, control: no PGPASSWORD and no PGPASSFILE, and the three controls out of the string', { without: ['PGPASSWORD', 'PGPASSFILE'], bare: true }],
  ];
  const sent = [];
  for (const [label, options] of cases) {
    const run = await psqlRun(scope, exe, { prepare: writePgpass(home), build: (port) => productionLaunch(product, verdict, entryUri(port), home, absentFile, options) });
    reached(`(r) PD2 ${label}`, run);
    sent.push(run.state.sent);
    console.log(`record (r) PD2 ${label}: exit ${run.code}; the password message: ${R.labelled(run.state.sent)}`);
  }
  check('(r) PD2 production: the stored password arrives and the marker from the person\'s .pgpass does not', sent[0] === R.LABEL_STORED && !holdsMarker(sent[0]), JSON.stringify({ sent: R.labelled(sent[0]) }));
  check('(r) PD2 keyword alone: the passfile keyword at the absent file keeps the person\'s .pgpass closed with no variable to help it', !holdsMarker(sent[1]), JSON.stringify({ sent: R.labelled(sent[1]) }));
  check('(r) PD2 keyword alone, control: without the keyword the person\'s .pgpass is used and its marker is sent (this rig can make the bad thing happen)', holdsMarker(sent[2]), JSON.stringify({ sent: R.labelled(sent[2]) }));
}

/** PD3: the person's client certificate, with no `PGSSLCERT` and `PGSSLKEY` and with both at paths that do not exist. */
async function legPD3(scope, exe, dir, product, verdict) {
  const home = path.join(dir, 'pd3 home');
  const material = path.join(dir, 'pd3 material');
  const absent = { cert: path.join(dir, 'pd3-client-cert-that-never-exists.crt'), key: path.join(dir, 'pd3-client-key-that-never-exists.key') };
  fs.mkdirSync(path.join(home, '.postgresql'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(material, { recursive: true });
  const server = throwawayCertificate(material, 'server', 'localhost');
  const person = throwawayCertificate(material, 'person', PD3_MARKER_CN);
  fs.copyFileSync(person.cert, path.join(home, '.postgresql', 'postgresql.crt'));
  fs.copyFileSync(person.key, path.join(home, '.postgresql', 'postgresql.key'));
  fs.chmodSync(path.join(home, '.postgresql', 'postgresql.key'), 0o600);
  const tlsMaterial = { key: fs.readFileSync(server.key), cert: fs.readFileSync(server.cert) };
  for (const withVariables of [false, true]) {
    const label = withVariables ? 'with PGSSLCERT and PGSSLKEY at paths that do not exist' : 'with no PGSSLCERT and no PGSSLKEY';
    const run = await psqlRun(scope, exe, {
      env: { PATH: process.env.PATH, HOME: home, PGSSLMODE: 'require', ...(withVariables ? { PGSSLCERT: absent.cert, PGSSLKEY: absent.key } : {}) },
      prepare: () => undefined,
      tlsMaterial,
    });
    check(`(PD3) psql ${label}: the client reached the fake server, completed TLS and ended in time`, run.ended && run.state.secured >= 1, JSON.stringify({ ...run.state, ended: run.ended, code: run.code, stderr: run.stderr }));
    const peer = run.state.peer ?? { offered: false };
    if (!withVariables) {
      check('(r) PD3 control: with no PGSSLCERT and PGSSLKEY the person\'s client certificate is offered (this rig can make the bad thing happen)', peer.commonName === PD3_MARKER_CN, JSON.stringify(peer));
    }
    console.log(`record (PD3) psql, ${label}: exit ${run.code}; TLS ${run.state.secured >= 1 ? `completed (${peer.protocol})` : 'did NOT complete'}; a client certificate ${peer.offered ? 'was OFFERED' : 'was NOT offered'}; the marker (CN=${PD3_MARKER_CN}) ${peer.commonName === PD3_MARKER_CN ? 'STANDS' : 'does not stand'} in it (subject CN ${JSON.stringify(peer.commonName ?? null)}); psql said ${JSON.stringify(run.stderr)}`);
    if (withVariables && peer.commonName === PD3_MARKER_CN) {
      console.log('STOP (PD3): the marker was offered WITH PGSSLCERT and PGSSLKEY set too — no remedy is built, and row 9 returns to the lead (parent §7, row PD3)');
    }
  }
  check('(PD3) the paths given as PGSSLCERT and PGSSLKEY do not exist', !fs.existsSync(absent.cert) && !fs.existsSync(absent.key), JSON.stringify(absent));
  await legR3(scope, exe, dir, home, tlsMaterial, product, verdict);
}

/**
 * (r), PD3's case, after Z2: the entry stores a password and names `sslmode=require`, under the rig home with the marker certificate.
 *   production      the built launch offers no client certificate, the marker's included;
 *   keyword alone   the built string with PGSSLCERT and PGSSLKEY taken out of the environment AND `sslcertmode` taken out: the `sslcert` and `sslkey` keywords at the absent file
 *                   alone still offer none (with `sslcertmode='disable'` left in, this run would pass without them);
 *   its control     the same with the three controls out of the string: the person's certificate is offered, so the rig can make the bad thing happen. The two differ by
 *                   the `sslcert` and `sslkey` keywords alone.
 */
async function legR3(scope, exe, dir, home, tlsMaterial, product, verdict) {
  const absentFile = product.materializedKeyPath(dir, 'no-client-file');
  const cases = [
    ['production', {}],
    ['keyword alone: no PGSSLCERT and no PGSSLKEY in the environment, the built string with sslcertmode taken out', { without: ['PGSSLCERT', 'PGSSLKEY'], noCertMode: true }],
    ['keyword alone, control: no PGSSLCERT and no PGSSLKEY, and the three controls out of the string', { without: ['PGSSLCERT', 'PGSSLKEY'], bare: true }],
  ];
  const peers = [];
  for (const [label, options] of cases) {
    const run = await psqlRun(scope, exe, { prepare: () => undefined, tlsMaterial, build: (port) => productionLaunch(product, verdict, entryUri(port, '?sslmode=require'), home, absentFile, options) });
    check(`(r) PD3 ${label}: the client reached the fake server, completed TLS and ended in time`, run.ended && run.state.secured >= 1, JSON.stringify({ ...run.state, ended: run.ended, code: run.code, stderr: run.stderr }));
    const peer = run.state.peer ?? { offered: false };
    peers.push(peer);
    console.log(`record (r) PD3 ${label}: exit ${run.code}; a client certificate ${peer.offered ? 'was OFFERED' : 'was NOT offered'}; the marker ${peer.commonName === PD3_MARKER_CN ? 'STANDS' : 'does not stand'} in it`);
  }
  check('(r) PD3 production: no client certificate is offered, the marker\'s included', !peers[0].offered && peers[0].commonName !== PD3_MARKER_CN, JSON.stringify(peers[0]));
  check('(r) PD3 keyword alone: the sslcert and sslkey keywords at the absent file keep the person\'s certificate closed with no variable to help them', !peers[1].offered && peers[1].commonName !== PD3_MARKER_CN, JSON.stringify(peers[1]));
  check('(r) PD3 keyword alone, control: without the keywords the person\'s certificate is offered (this rig can make the bad thing happen)', peers[2].commonName === PD3_MARKER_CN, JSON.stringify(peers[2]));
}

async function main(scope) {
  if (process.platform === 'win32') {
    console.log('skip  the bridged psql harness — Linux only');
    return 0;
  }
  const exe = process.env.BRIDGED_PSQL ?? '/usr/bin/psql';
  const version = fs.existsSync(exe) ? versionOf(exe) : undefined;
  console.log(`psql: ${exe}: ${version ?? 'not found'}`);
  if (version === undefined) {
    check('the psql client is installed', process.env.CI !== 'true', `${exe} is missing (the postgresql-client package) — a skipped leg on the runner proves nothing`);
  } else {
    const dir = ownedDir(scope, 'bridged-psql');
    const product = { ...require(path.join(OUT, 'dbCliLauncher.js')), ...require(path.join(OUT, 'bridgedSshEnv.js')), ...require(path.join(OUT, 'materializedKeys.js')) };
    // Every production launch below is built under the verdict of the REAL database client check, asked of this very client under the candidate table (§S7.7, §S7.12).
    const under = await candidates.verdictFor({ family: 'psql', exe, name: 'psql' }, { dir, home: dir });
    if (under.ok) {
      registerRan([{ name: 'psql', family: 'psql', exe, via: 'BRIDGED_PSQL' }]); // the job's last line lists the clients whose legs ran (BRIDGED_BUILDS_FILE): only once the check let them run
      candidates.say('(r) PD2, PD3, PQ2 and (s)', under);
      await legPD2(scope, exe, dir, product, under.verdict);
      await legPD3(scope, exe, dir, product, under.verdict);
      await legPQ2(scope, exe, dir, product, version, under.verdict);
    } else {
      console.log('UNMEASURED (r) PD2, PD3, PQ2 and (s): the real check refused this psql under the candidate table, so the builder launches nothing (the finding is printed above)');
    }
  }
  const failures = failureCount();
  console.log(failures === 0 ? '\nall bridged psql checks passed' : `\n${failures} check(s) failed`);
  return failures === 0 ? 0 : 1;
}

harnessScope.run(main);
