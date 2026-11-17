// The probe legs of the bridged `psql` harness: PQ2 (the E1.6 spec §S6.15 Z0; parent §7's probe table) and leg (s) (Z5).
//
// PQ2 legs a, b, c and e hand a stored URI WHOLE to `psql`, as the builder did until Z2 wrote the connection itself. They were run through the builder as it stood (CI run
// 44123897355, recorded in the parent's probe table); the builder now refuses those URIs, so the launch is written by hand here (`storedWhole`: the arguments and the
// three variables of that builder) and each of those legs is the CONTROL of (s): it shows that the rig can make the bad thing happen. Legs d1-d4, g and h are hand-written
// keyword strings. Leg f goes through the builder, with an entry that stores a password. Record legs print what the client did and fail only for the rig's own faults;
// the control and the production cases of (s) are assertions.
const fs = require('fs');
const path = require('path');
const R = require('./psqlRig.cjs');
const { check } = require('./psqlCheck.cjs');
const { PD2_PASSWORD_MARKER, PD3_MARKER_CN, PQ2_SECOND_CN, PQ2_SERVICE_PASSWORD_MARKER, PQ2_SERVICE_PASSFILE_MARKER, PQ2_STORED_PASSWORD,
  labelled, isMarker, said, shape, keywordString, psqlRun, startedCount, throwawayCertificate, throwawayCa } = R;

/**
 * The rig of PQ2: a home that holds every file the person's libpq could read (a `.pgpass`, a `.pg_service.conf` with three sections, the
 * marker client certificate of PD3 under `.postgresql`), a second throwaway client certificate that a URI or a service file can name, a TLS
 * server certificate signed by a CA, and the absent file of the production launch. `write(port)` writes what depends on the fake server's port.
 */
function pq2Rig(scope, dir, product) {
  const home = path.join(dir, 'pq2 home');
  const material = path.join(dir, 'pq2-material');
  fs.mkdirSync(path.join(home, '.postgresql'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(material, { recursive: true });
  const person = throwawayCertificate(material, 'person', PD3_MARKER_CN);
  const second = throwawayCertificate(material, 'second', PQ2_SECOND_CN);
  const selfSigned = throwawayCertificate(material, 'self-signed-server', 'localhost');
  const ca = throwawayCa(path.join(dir, 'pq2-ca'));
  const marker = { cert: path.join(home, '.postgresql', 'postgresql.crt'), key: path.join(home, '.postgresql', 'postgresql.key') };
  fs.copyFileSync(person.cert, marker.cert);
  fs.copyFileSync(person.key, marker.key);
  fs.chmodSync(marker.key, 0o600);
  const tlsOf = (files) => ({ key: fs.readFileSync(files.key), cert: fs.readFileSync(files.cert) });
  const rig = {
    scope, dir, product, home, second, marker,
    pgpass: path.join(home, '.pgpass'),
    serviceFile: path.join(home, '.pg_service.conf'),
    servicePassfile: path.join(material, 'service.pgpass'),
    absentFile: product.materializedKeyPath(dir, 'no-client-file'),
    selfSignedTls: tlsOf(selfSigned),
    caTls: { ...tlsOf(ca.server), conversation: true },
    ca,
    exe: undefined,
    /** The runs of the legs that hand a stored URI whole, by leg id: (s)'s controls. */
    controls: {},
    write(port) {
      fs.writeFileSync(rig.pgpass, `127.0.0.1:${port}:*:pdprobe:${PD2_PASSWORD_MARKER}\n`, { mode: 0o600 });
      fs.writeFileSync(rig.servicePassfile, `127.0.0.1:${port}:*:pdprobe:${PQ2_SERVICE_PASSFILE_MARKER}\n`, { mode: 0o600 });
      const section = (name, lines) => `[${name}]\n${lines.join('\n')}\n`;
      const target = ['host=127.0.0.1', `port=${port}`, 'user=pdprobe', 'dbname=pdprobe'];
      fs.writeFileSync(rig.serviceFile, [
        section('s1', [...target, `password=${PQ2_SERVICE_PASSWORD_MARKER}`]),
        section('s2', [...target, `passfile=${rig.servicePassfile}`]),
        section('s3', ['sslmode=require', `sslcert=${second.cert}`, `sslkey=${second.key}`]),
      ].join('\n'));
    },
  };
  rig.uris = storedUris(rig);
  return rig;
}

/** The stored URIs of PQ2 legs a, b and c, and of (s) after them: each names a setting that a built connection never carries (§S6.15 Q15). `uri(port)` holds no password. */
function storedUris(rig) {
  const base = (port) => `postgresql://pdprobe@127.0.0.1:${port}/pdprobe`;
  return {
    'PQ2-a': (port) => `${base(port)}?sslmode=require&sslcert=${encodeURIComponent(rig.second.cert)}&sslkey=${encodeURIComponent(rig.second.key)}`,
    'PQ2-b': (port) => `${base(port)}?service=s3`,
    'PQ2-c1': (port) => `${base(port)}?passfile=${encodeURIComponent(rig.pgpass)}`,
    'PQ2-c2': (port) => `${base(port)}?service=s1`,
    'PQ2-c3': (port) => `${base(port)}?service=s2`,
    'PQ2-e1': (port) => `${base(port)}?%70assfile=${encodeURIComponent(rig.pgpass)}`,
  };
}

/** An entry that stores a password and names nothing but the profile: what the builder serves (Q16). `query` is a string of the profile's settings, with its `?`. */
const entryUri = (port, query = '') => `postgresql://pdprobe:${PQ2_STORED_PASSWORD}@127.0.0.1:${port}/pdprobe${query}`;

/** One `psql` of PQ2 against one fake server (`options`: `build(port, otherPort)`, `tlsMaterial`, `second`); the rig's files are written for its port first. */
function pq2Run(rig, options) {
  return psqlRun(rig.scope, rig.exe, { prepare: (port) => rig.write(port), ...options });
}

/** A production launch of the stored URI `uriOf(port)`: the builder's arguments, and its environment through `bridgedSshEnv`. A refusal is the rig's fault, named (the entry of such a leg stores a password and names only the profile). */
function viaBuilder(rig, uriOf) {
  return (port) => {
    const uri = uriOf(port);
    const launchOf = rig.product.buildDbQueryLaunch('postgres', uri, 'select 1', { bridged: true, absentFile: rig.absentFile });
    if (launchOf === undefined) {
      throw new Error('buildDbQueryLaunch refused the entry of a leg that must launch (it stores a password and names only the profile)');
    }
    return { args: launchOf.args, env: rig.product.bridgedSshEnv({ PATH: process.env.PATH, HOME: rig.home }, 'linux', launchOf.env) };
  };
}

/** Y6's three variables at the absent file: what a bridged `psql` is asked for besides its password. */
const closingVariables = (rig) => ({ PGPASSFILE: rig.absentFile, PGSSLCERT: rig.absentFile, PGSSLKEY: rig.absentFile });

/**
 * The launch the builder made for a stored URI until Z2, written by hand now that the builder refuses these URIs: `-X`, `-c`, the query with its one leading space, `--`,
 * the URI whole (these hold no password, so nothing is taken out of them); the environment of Y6, through `bridgedSshEnv`. The control of (s).
 */
function storedWhole(rig, uriOf) {
  return (port) => ({
    args: ['-X', '-c', ' select 1', '--', uriOf(port)],
    env: rig.product.bridgedSshEnv({ PATH: process.env.PATH, HOME: rig.home }, 'linux', closingVariables(rig)),
  });
}

/** A hand-written launch: `-X`, `-c`, the query with its one leading space, `--`, `string`. The environment is Y6's three paths, and `PGPASSWORD` when `password` is given, through `bridgedSshEnv`, then `over`. */
function byHand(rig, string, { password, over } = {}) {
  const closing = { ...closingVariables(rig), ...(password === undefined ? {} : { PGPASSWORD: password }) };
  return { args: ['-X', '-c', ' select 1', '--', string], env: { ...rig.product.bridgedSshEnv({ PATH: process.env.PATH, HOME: rig.home }, 'linux', closing), ...over } };
}

/** The rig's own faults: the client must have ended; and, where the leg says so, it must have reached the fake server (a TLS leg: completed the handshake). */
function pq2Check(id, run, reach) {
  check(`(${id}) the client ended in time`, run.ended, shape(run));
  if (reach === 'plain') {
    check(`(${id}) the client reached the fake server`, run.state.startups >= 1, shape(run));
  } else if (reach === 'tls') {
    check(`(${id}) the client reached the fake server and completed TLS`, run.state.secured >= 1, shape(run));
  }
}

/** The record of a password leg. */
function recordPassword(id, label, run) {
  const reached = run.state.startups >= 1;
  console.log(`record (${id}) ${label}: exit ${run.code}; the fake server ${reached ? 'was reached' : 'was NOT reached'}; the password message: ${labelled(run.state.password)}; psql said ${said(run)}`);
}

/** What a client certificate was, in words. */
function certificateWords(peer) {
  if (peer === undefined || !peer.offered) {
    return 'NOT offered';
  }
  const names = { [PD3_MARKER_CN]: 'the person\'s marker certificate', [PQ2_SECOND_CN]: 'the second certificate' };
  return `OFFERED (${names[peer.commonName] ?? 'another certificate'}, subject CN ${JSON.stringify(peer.commonName ?? null)})`;
}

/** The record of a certificate leg; `extra` is a clause that goes after the TLS words. */
function recordCertificate(id, label, run, extra = '') {
  const tlsWords = run.state.secured >= 1 ? `TLS completed (${run.state.peer?.protocol})` : `TLS NOT completed${run.state.tlsError === undefined ? '' : ` (server side: ${JSON.stringify(run.state.tlsError)})`}`;
  console.log(`record (${id}) ${label}: exit ${run.code}; ${tlsWords}; a client certificate: ${certificateWords(run.state.peer)};${extra} psql said ${said(run)}`);
}

const stop = (id, text) => console.log(`STOP (${id}): ${text} — the work stops here and the line goes to the lead (parent §7, rows PQ2)`);

/** PQ2-a, -b: a stored URI handed whole offers the certificate it names, or the one a service file names (TLS leg, `sslmode=require`). */
async function legPQ2ab(rig) {
  const cases = [
    ['PQ2-a', 'the URI names sslcert and sslkey (a second certificate), sslmode=require'],
    ['PQ2-b', 'the URI names service=s3 (the service file holds sslcert, sslkey and sslmode=require)'],
  ];
  for (const [id, label] of cases) {
    const run = await pq2Run(rig, { build: storedWhole(rig, rig.uris[id]), tlsMaterial: rig.selfSignedTls });
    rig.controls[id] = run;
    pq2Check(id, run, 'tls');
    recordCertificate(id, `the stored URI whole, ${label}`, run);
    if (run.state.peer?.commonName !== PQ2_SECOND_CN) {
      stop(id, 'the second certificate was NOT offered; the parent expects the URI and the service file to outrank Y6\'s variables');
    }
  }
}

/** PQ2-c: PQ1's three legs on this client, the stored URI handed whole. */
async function legPQ2c(rig) {
  const cases = [
    ['PQ2-c1', '?passfile= naming the rig home\'s .pgpass', 'the .pgpass marker'],
    ['PQ2-c2', '?service=s1 (a password in the section)', 'the service-file password marker'],
    ['PQ2-c3', '?service=s2 (a passfile in the section)', 'the service-file passfile marker'],
  ];
  for (const [id, label, expected] of cases) {
    const run = await pq2Run(rig, { build: storedWhole(rig, rig.uris[id]) });
    rig.controls[id] = run;
    pq2Check(id, run, 'plain');
    recordPassword(id, `the stored URI whole, ${label}`, run);
    if (labelled(run.state.password) !== expected) {
      stop(id, `the password message was not ${expected}; the parent expects this URI to leak it`);
    }
  }
}

/** The environment of PQ2-d1 and d4: the three client files named by hand at the rig's marker files (the opposite of Y6). */
const markerEnv = (rig) => ({ PGPASSFILE: rig.pgpass, PGSSLCERT: rig.marker.cert, PGSSLKEY: rig.marker.key });

/** The shape Z2 will write, ending in the three keywords at the absent file. */
const zShape = (port, settings, tail) => keywordString([['host', '127.0.0.1'], ['port', String(port)], ['dbname', 'pdprobe'], ['user', 'pdprobe'], ...settings, ...tail]);
const absentThree = (rig) => [['passfile', rig.absentFile], ['sslcert', rig.absentFile], ['sslkey', rig.absentFile]];

/** PQ2-d1: the keywords at the absent file against an environment that names the person's marker files. */
async function legPQ2d1(rig) {
  const password = await pq2Run(rig, { build: (port) => byHand(rig, zShape(port, [['sslmode', 'disable']], absentThree(rig)), { over: markerEnv(rig) }) });
  pq2Check('PQ2-d1', password, 'plain');
  recordPassword('PQ2-d1', 'a keyword string ending in passfile, sslcert and sslkey at the absent file; PGPASSFILE, PGSSLCERT and PGSSLKEY at the rig\'s marker files (password leg)', password);
  if (isMarker(password.state.password)) {
    stop('PQ2-d1', 'the .pgpass marker was sent although the keyword names the absent file: a keyword loses to the environment');
  }
  const certificate = await pq2Run(rig, { tlsMaterial: rig.selfSignedTls, build: (port) => byHand(rig, zShape(port, [['sslmode', 'require']], absentThree(rig)), { over: markerEnv(rig) }) });
  pq2Check('PQ2-d1', certificate, 'tls');
  recordCertificate('PQ2-d1', 'the same string with sslmode=require and the same environment (certificate leg)', certificate);
  if (certificate.state.peer?.offered) {
    stop('PQ2-d1', 'a client certificate was offered although the keywords name the absent file: a keyword loses to the environment');
  }
}

/** PQ2-d2: a service file with a password is present, and no service is named anywhere. */
async function legPQ2d2(rig) {
  const run = await pq2Run(rig, { build: (port) => byHand(rig, zShape(port, [['sslmode', 'disable']], absentThree(rig))) });
  pq2Check('PQ2-d2', run, 'plain');
  check('(PQ2-d2) the rig home holds a .pg_service.conf', fs.existsSync(rig.serviceFile), rig.serviceFile);
  recordPassword('PQ2-d2', 'the same string under Y6\'s environment; the rig home\'s .pg_service.conf holds a section with a password (s1) and no service is named anywhere', run);
  if (isMarker(run.state.password)) {
    stop('PQ2-d2', 'a marker was sent with no service named: the client read the unnamed service file');
  }
}

/** PQ2-d3: `passfile` twice in the string, in both orders. */
async function legPQ2d3(rig) {
  for (const [label, first, second] of [['the absent file first, the rig\'s .pgpass second', rig.absentFile, rig.pgpass], ['the rig\'s .pgpass first, the absent file second', rig.pgpass, rig.absentFile]]) {
    const run = await pq2Run(rig, { build: (port) => byHand(rig, zShape(port, [['sslmode', 'disable']], [['passfile', first], ['passfile', second]])) });
    pq2Check('PQ2-d3', run, 'plain');
    recordPassword('PQ2-d3', `passfile written twice, ${label}`, run);
  }
}

/** PQ2-d4: `require_auth` and `sslcertmode`, each against an environment that says the opposite, each with a control that has no keyword. */
async function legPQ2d4(rig) {
  const authCases = [
    ['require_auth=scram-sha-256 in the string; PGREQUIREAUTH=password; the stored password in PGPASSWORD', [['require_auth', 'scram-sha-256']]],
    ['control: no require_auth keyword; PGREQUIREAUTH=password; the stored password in PGPASSWORD', []],
  ];
  for (const [label, keywords] of authCases) {
    const run = await pq2Run(rig, { build: (port) => byHand(rig, zShape(port, [['sslmode', 'disable'], ...keywords], absentThree(rig)), { password: PQ2_STORED_PASSWORD, over: { PGREQUIREAUTH: 'password' } }) });
    check(`(PQ2-d4) the client ended in time (${keywords.length > 0 ? 'require_auth' : 'control'})`, run.ended, shape(run));
    recordPassword('PQ2-d4', label, run);
  }
  const certCases = [
    ['sslcertmode=disable in the string; PGSSLCERTMODE=allow with PGSSLCERT and PGSSLKEY at the rig\'s marker files', [['sslcertmode', 'disable']]],
    ['control: no sslcertmode keyword; PGSSLCERTMODE=allow with PGSSLCERT and PGSSLKEY at the rig\'s marker files', []],
  ];
  for (const [label, keywords] of certCases) {
    const run = await pq2Run(rig, { tlsMaterial: rig.selfSignedTls, build: (port) => byHand(rig, zShape(port, [['sslmode', 'require'], ...keywords], []), { over: { ...markerEnv(rig), PGSSLCERTMODE: 'allow' } }) });
    check(`(PQ2-d4) the client ended in time (${keywords.length > 0 ? 'sslcertmode' : 'control'})`, run.ended, shape(run));
    recordCertificate('PQ2-d4', label, run);
  }
}

/** PQ2-e: the stored URI whole with the key `passfile` spelled four other ways. */
async function legPQ2e(rig) {
  const enc = encodeURIComponent;
  const uri = (port, query) => `postgresql://pdprobe@127.0.0.1:${port}/pdprobe?${query}`;
  const cases = [
    ['%70assfile (the first letter percent-encoded)', (port) => uri(port, `%70assfile=${enc(rig.pgpass)}`)],
    ['PASSFILE (capital letters)', (port) => uri(port, `PASSFILE=${enc(rig.pgpass)}`)],
    ['passfile twice, the absent file first and the rig\'s .pgpass second', (port) => uri(port, `passfile=${enc(rig.absentFile)}&passfile=${enc(rig.pgpass)}`)],
    ['passfile twice, the rig\'s .pgpass first and the absent file second', (port) => uri(port, `passfile=${enc(rig.pgpass)}&passfile=${enc(rig.absentFile)}`)],
  ];
  for (const [label, uriOf] of cases) {
    const run = await pq2Run(rig, { build: storedWhole(rig, uriOf) });
    check(`(PQ2-e) the client ended in time (${label})`, run.ended, shape(run));
    recordPassword('PQ2-e', `the stored URI whole, the key spelled ${label}`, run);
  }
}

/**
 * PQ2-f: `sslmode=verify-full` against a server certificate a marker CA signed: the CA file, no CA file, and a revocation list. Through the builder, with an entry that stores
 * a password: what the server may read after the handshake is the start-up message and the entry's own password message, and nothing of the person's.
 */
async function legPQ2f(rig) {
  const root = path.join(rig.home, '.postgresql', 'root.crt');
  const crl = path.join(rig.home, '.postgresql', 'root.crl');
  const cases = [
    ['with the CA in the rig home\'s .postgresql/root.crt', () => fs.copyFileSync(rig.ca.cert, root)],
    ['without root.crt', () => fs.rmSync(root, { force: true })],
    ['with root.crt and a root.crl that revokes the server\'s certificate', () => {
      rig.ca.revoke();
      fs.copyFileSync(rig.ca.cert, root);
      fs.copyFileSync(rig.ca.crl, crl);
    }],
  ];
  const read = [];
  try {
    for (const [label, arrange] of cases) {
      arrange();
      const run = await pq2Run(rig, { tlsMaterial: rig.caTls, build: viaBuilder(rig, (port) => entryUri(port, '?sslmode=verify-full')) });
      check(`(PQ2-f) the client ended in time and asked for TLS (${label})`, run.ended && run.state.sslRequests >= 1, shape(run));
      const connected = run.state.secured >= 1 && run.state.startups >= 1;
      recordCertificate('PQ2-f', `sslmode=verify-full through buildDbQueryLaunch (an entry with a stored password), ${label}: the connection ${connected ? 'WAS made' : 'was NOT made'}`, run, ` the server read ${JSON.stringify(run.state.kinds)} after the handshake (\`p\` is a password message: ${labelled(run.state.password)});`);
      read.push({ connected, run });
    }
  } finally {
    fs.rmSync(root, { force: true });
    fs.rmSync(crl, { force: true });
  }
  if (!read[0].connected || read.some(({ run }) => run.state.peer?.offered || run.state.kinds.some((kind) => kind !== 'startup' && kind !== 'p') || (run.state.password !== undefined && run.state.password !== PQ2_STORED_PASSWORD))) {
    stop('PQ2-f', 'with the CA in root.crt the connection was not made, or a client certificate was offered, or the server read more than the handshake, the start-up message and the entry\'s own password');
  }
}

/** PQ2-g, -h: the shape Z2 will write, with every marker file in the rig home; and a database name that looks like a connection string. */
async function legPQ2gh(rig) {
  const g = await pq2Run(rig, { build: (port) => byHand(rig, keywordString([['host', '127.0.0.1'], ['port', String(port)], ['dbname', 'pdprobe'], ['user', 'pdprobe'], ['sslmode', 'disable']]), { password: PQ2_STORED_PASSWORD }) });
  pq2Check('PQ2-g', g, 'plain');
  recordPassword('PQ2-g', 'host, port, dbname, user and sslmode in one keyword string after --; the stored password in PGPASSWORD; every marker file in the rig home', g);
  if (labelled(g.state.password) !== 'the stored password') {
    stop('PQ2-g', 'the server did not receive the stored password and nothing else');
  }
  const named = await pq2Run(rig, { build: (port) => byHand(rig, keywordString([['host', '127.0.0.1'], ['port', String(port)], ['dbname', 'service=s1'], ['user', 'pdprobe'], ['sslmode', 'disable']]), { password: PQ2_STORED_PASSWORD }) });
  pq2Check('PQ2-h', named, 'plain');
  recordPassword('PQ2-h', 'PQ2-g with the database name service=s1', named);
  console.log(`record (PQ2-h) the database name the server read in the start-up message: ${JSON.stringify(named.state.params?.database ?? null)} (the leg wrote "service=s1")`);
  if (named.state.params?.database !== 'service=s1' || labelled(named.state.password) !== 'the stored password') {
    stop('PQ2-h', 'a database name that looks like a connection string was read as one');
  }
  const uri = await pq2Run(rig, {
    second: true,
    build: (port, otherPort) => byHand(rig, keywordString([['host', '127.0.0.1'], ['port', String(port)], ['dbname', `postgresql://127.0.0.1:${otherPort}/other`], ['user', 'pdprobe'], ['sslmode', 'disable']]), { password: PQ2_STORED_PASSWORD }),
  });
  check('(PQ2-h) the client ended in time and reached one of the two fake servers', uri.ended && uri.state.startups + uri.other.startups >= 1, shape(uri));
  const where = uri.other.startups > 0 ? 'the OTHER server (named inside the database name)' : 'the named host';
  console.log(`record (PQ2-h) PQ2-g with a database name that begins postgresql:// and names another host: the client reached ${where}; the named host read the database name ${JSON.stringify(uri.state.params?.database ?? null)}; the other server read ${JSON.stringify(uri.other.params?.database ?? null)}; the password messages: named host ${labelled(uri.state.password)}, other server ${labelled(uri.other.password)}; psql said ${said(uri)}`);
  if (uri.other.startups > 0) {
    stop('PQ2-h', 'a database name that begins postgresql:// sent the client to another host');
  }
}

/**
 * Leg (s) (§S6.15 Z5; parent §7), in three parts.
 *   Control      the stored URI handed whole (legs a, b, c1 and c2 above, under Y6's variables): `?passfile=` and `?service=s1` each deliver the rig home's marker to PD2's
 *                server, and a certificate and key named in the URI are offered to PD3's server. The certificate is asserted when PQ2-a showed it and recorded when not.
 *   Production   `buildDbQueryLaunch` for each of those URIs, with a stored password put in so that only the setting is at fault, answers `undefined`; the same entry without
 *                the setting is built (so the refusal is the setting's); and the harness started no process for any of it.
 *   Inside       an entry with a stored password and `sslmode=disable`, launched from the builder's answer under a rig home that holds every marker file: PD2's server receives
 *                the stored password and no marker; the same entry with `sslmode=require` against PD3's server offers no certificate.
 */
async function legS(rig) {
  const sent = (id) => labelled(rig.controls[id].state.password);
  check('(s) control: ?passfile= in the stored URI delivers the rig home\'s .pgpass marker (the leak the builder must not make)', sent('PQ2-c1') === 'the .pgpass marker', sent('PQ2-c1'));
  check('(s) control: ?service=s1 in the stored URI delivers the service file\'s password marker', sent('PQ2-c2') === 'the service-file password marker', sent('PQ2-c2'));
  if (rig.controls['PQ2-a'].state.peer?.commonName === PQ2_SECOND_CN) {
    check('(s) control: a certificate and key named in the stored URI are offered to the server (asserted: PQ2-a showed it)', true);
  } else {
    console.log('record (s) control: the certificate named in the stored URI was NOT offered on this client; recorded, not asserted');
  }
  const before = startedCount();
  for (const id of Object.keys(rig.uris)) {
    const entry = rig.uris[id](1).replace('pdprobe@', `pdprobe:${PQ2_STORED_PASSWORD}@`);
    const launchOf = rig.product.buildDbQueryLaunch('postgres', entry, 'select 1', { bridged: true, absentFile: rig.absentFile });
    check(`(s) production: the entry of ${id} (a stored password and its setting) is refused: no launch`, launchOf === undefined, JSON.stringify(launchOf === undefined ? null : launchOf.args.length));
  }
  const clean = rig.product.buildDbQueryLaunch('postgres', entryUri(1), 'select 1', { bridged: true, absentFile: rig.absentFile });
  check('(s) production: the same entry without a setting is built, so each refusal above is the setting\'s', clean !== undefined && clean.env.PGPASSWORD === PQ2_STORED_PASSWORD);
  check('(s) production: the harness started no process for any of those entries', startedCount() === before, `${startedCount() - before} started`);

  const password = await pq2Run(rig, { build: viaBuilder(rig, (port) => entryUri(port, '?sslmode=disable')) });
  pq2Check('s inside the profile, password', password, 'plain');
  recordPassword('s', 'an entry with a stored password and sslmode=disable, launched from the builder\'s answer; every marker file in the rig home', password);
  check('(s) inside the profile: PD2\'s server receives the stored password and no marker', labelled(password.state.password) === 'the stored password' && !isMarker(password.state.password), labelled(password.state.password));
  const certificate = await pq2Run(rig, { tlsMaterial: rig.selfSignedTls, build: viaBuilder(rig, (port) => entryUri(port, '?sslmode=require')) });
  pq2Check('s inside the profile, certificate', certificate, 'tls');
  recordCertificate('s', 'the same entry with sslmode=require against PD3\'s server', certificate);
  check('(s) inside the profile: PD3\'s server is offered no certificate, the marker\'s included', certificate.state.peer?.offered !== true, JSON.stringify(certificate.state.peer ?? null));
}

/** All of PQ2, and then (s), after the client's version. */
async function legPQ2(scope, exe, dir, product, version) {
  console.log(`record (PQ2) psql --version: ${version}`);
  const rig = pq2Rig(scope, dir, product);
  rig.exe = exe;
  check('(PQ2) the path given as the absent file does not exist', !fs.existsSync(rig.absentFile), rig.absentFile);
  for (const leg of [legPQ2ab, legPQ2c, legPQ2d1, legPQ2d2, legPQ2d3, legPQ2d4, legPQ2e, legPQ2f, legPQ2gh, legS]) {
    await leg(rig);
  }
}

module.exports = { legPQ2 };
