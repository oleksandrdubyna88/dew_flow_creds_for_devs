'use strict';
// PA1, the legs of `psql` (E1.7 spec §S7.4: PA1-b, PA1-c, PA1-g, and the libpq half of PA1-a). RECORD legs against the fake server of `psqlRig.cjs`: a candidate
// keyword is KNOWN when the listener gets a connection, and refused in the client's own words when it does not. The positive control is the same string with no
// candidate (it must reach the listener, or a refusal below proves nothing); the negative control is a keyword that does not exist (every libpq refuses it).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const R = require('./psqlRig.cjs');
const { ownedName } = require('./leftovers.cjs');
const { check, bridgedEnv, runSync, oneLine, noteLeg, unmeasured, resolveProgram, IS_WINDOWS } = require('./dbProbeRig.cjs');

/** The three controls V3 will write after `sslkey`, in the shape V3 writes them (the spec's §S7.5). */
const V3_PAIRS = [['gssencmode', 'disable'], ['sslcertmode', 'disable'], ['require_auth', 'password,md5,scram-sha-256']];

const basePairs = (port) => [['host', '127.0.0.1'], ['port', String(port)], ['dbname', 'pa1'], ['user', 'pa1']];

/** The arguments of one `psql` run: `-w` so that nothing asks for a password, then the launch's own shape (`-X`, `-c`, the string after `--`). */
const argsOf = (port, extra) => ['-X', '-w', '-c', ' select 1', '--', R.keywordString([...basePairs(port), ...extra])];

/** Whether the listener got a connection of any kind: a start-up, or a request for encryption that it refused. */
const reachedOf = (run) => run.state.startups + run.state.refused + run.state.sslRequests > 0;

/** One run of the client under `exe`, as a record line; the answer says whether the listener was reached. */
async function candidateRun(scope, client, rig, leg, label, extra) {
  const run = await R.psqlRun(scope, client.exe, { prepare: () => undefined, build: (port) => ({ args: argsOf(port, extra), env: bridgedEnv(rig.product, rig.home) }) });
  const reached = reachedOf(run);
  console.log(`record (${leg}) psql ${client.versionWord === undefined ? "" : `${client.versionWord} `}${label}: the listener ${reached ? 'got a connection' : 'got NO connection'}; exit ${run.code}; the client said ${R.said(run)}`);
  return { run, reached };
}

/** PA1-b and PA1-c on `client`: the three candidates, each alone and together as V3 writes them, beside the two controls; then `gssencmode=require`. */
async function legB(scope, client, rig) {
  const base = await candidateRun(scope, client, rig, 'PA1-b', 'control, no candidate', []);
  check('(PA1-b) psql control: the string with no candidate reaches the listener and the client ended in time', base.run.ended && base.reached, R.shape(base.run));
  const invented = await candidateRun(scope, client, rig, 'PA1-b', 'a keyword that does not exist (pa1_not_a_keyword)', [['pa1_not_a_keyword', 'x']]);
  if (invented.reached) {
    console.log('STOP (PA1-b): this client ignores a keyword it does not know and goes on — the database client check is then its only lock, and a client that neither knows the control nor fails on it is not served (parent §7, row PA1)');
  }
  const known = {};
  for (const [key, value] of V3_PAIRS) {
    const run = await candidateRun(scope, client, rig, 'PA1-b', `${key}='${value}'`, [[key, value]]);
    known[key] = run.reached;
  }
  const all = await candidateRun(scope, client, rig, 'PA1-b', 'the three together, as V3 will write them', V3_PAIRS);
  const needGss = await candidateRun(scope, client, rig, 'PA1-c', "gssencmode='require' (does this build do GSSAPI at all?)", [['gssencmode', 'require']]);
  noteLeg('PA1-b psql', base.reached, `${V3_PAIRS.map(([key]) => `${key} ${known[key] ? 'known' : 'refused'}`).join('; ')}; all three: ${all.reached ? 'goes on' : 'refused'}; an invented keyword: ${invented.reached ? 'IGNORED' : 'refused'}`);
  // A refusal before connecting has two causes: a build without GSSAPI (it says so: "not compiled in") and a build with it but no credential in reach. Only the first answers PA1-c.
  const compiledOut = !needGss.reached && /not compiled in|GSSAPI support is not/i.test(needGss.run.said);
  const gssWords = needGss.reached ? 'the client tried (it reached the listener): this build does GSSAPI' : (compiledOut ? 'this build cannot do GSSAPI (its own words: not compiled in)' : 'refused before connecting, and its words do not say the build lacks GSSAPI (no credential in reach is the other cause): not shown');
  noteLeg('PA1-c psql', base.reached && (needGss.reached || compiledOut), `gssencmode=require: ${gssWords}`);
}

/** The libpq file each installed `psql` loads (N3): `ldd` of the binary, then the real name of the library (it carries the version). Linux only. */
function libpqLegs() {
  if (IS_WINDOWS) {
    return;
  }
  const root = '/usr/lib/postgresql';
  const versions = fs.existsSync(root) ? fs.readdirSync(root).filter((name) => /^\d+$/.test(name)).sort((a, b) => Number(a) - Number(b)) : [];
  for (const version of versions) {
    const binary = path.join(root, version, 'bin', 'psql');
    if (!fs.existsSync(binary)) {
      continue;
    }
    const line = runSync('ldd', [binary], process.env).stdout.split('\n').find((text) => text.includes('libpq.so'));
    const library = /=>\s*(\S+)/.exec(line ?? '')?.[1];
    const real = library !== undefined && fs.existsSync(library) ? path.basename(fs.realpathSync(library)) : 'not found';
    console.log(`record (PA1-a) psql ${version}: ${binary}: loads the libpq file ${real}`);
  }
}

/** The older clients PA1-g asks, each an image the workflow BUILT from a distribution's own base image (pinned by digest): `PA1_OLD_PSQL_IMAGES` is a comma list of image names. */
const oldImages = () => (process.env.PA1_OLD_PSQL_IMAGES ?? '').split(',').map((name) => name.trim()).filter((name) => name !== '');

/** The first libpq that knows `require_auth` and `sslcertmode` (PostgreSQL 16): a client whose libpq file is older than this cannot know the controls V3 writes. */
const FIRST_LIBPQ_WITH_CONTROLS = 16;

/**
 * Which libpq a `psql` in an image loads, read INSIDE the image: the file the program's own `ldd` names, its real name (`libpq.so.5.14` is libpq 14) and the package that owns it. A
 * client's own version line does not say it: the first run's images were PostgreSQL's own (`psql` 12 and 15), whose `psql` loaded the NEWEST `libpq5` the same repository carries, and so
 * took `require_auth` as a new client does. `{ file, major, package }`, or `{ why }`.
 */
function libpqOfImage(docker, image) {
  // The newest major's binary (what the packaging's wrapper starts with no cluster): the runs below start this very path, so the libpq read here is the one they load.
  const script = String.raw`p=$(ls /usr/lib/postgresql/*/bin/psql 2>/dev/null | sort -V | tail -n 1); l=$(ldd "$p" 2>/dev/null | sed -n 's/.*libpq[.]so[.]5 => \([^ ]*\) .*/\1/p' | head -n 1); echo "libpq=$(readlink -f "$l" 2>/dev/null) psql=$p package=$(dpkg-query -W libpq5 2>/dev/null | tr "\t" " ")"`;
  const answer = runSync(docker, ['run', '--rm', image, 'sh', '-c', script], process.env, 60_000);
  const file = /libpq=\S*?(libpq\.so\.5\.(\d+))/.exec(answer.stdout);
  if (file === null) {
    return { why: oneLine(answer.text, 200) };
  }
  return { file: file[1], major: Number(file[2]), package: /package=(.*)$/m.exec(answer.stdout)?.[1]?.trim() ?? 'unknown', psql: /psql=(\S+)/.exec(answer.stdout)?.[1] };
}

/**
 * PA1-g: a `psql` whose libpq does not know the controls, in a container of a distribution's OWN image on the host's network, against the listener. The workflow builds each image from
 * a base image pinned by digest and the distribution's own `postgresql-client` (no PostgreSQL project repository), and the harness READS which libpq each loads: a `psql` whose libpq file is
 * 16 or newer is not an older client, whatever its version line says, and is `UNMEASURED`. Its environment is the image's own (a container cannot take the bridged one, R2). A missing
 * `docker` or image is `UNMEASURED`, a printed fact with the missing thing named.
 */
async function legG(scope, rig) {
  const images = oldImages();
  if (images.length === 0) {
    unmeasured('PA1-g', 'no older client was named (PA1_OLD_PSQL_IMAGES is empty): fails closed is not measured for an older libpq');
    return;
  }
  const docker = resolveProgram('docker');
  if (docker === undefined) {
    unmeasured('PA1-g', 'docker is not on PATH');
    return;
  }
  for (const image of images) {
    if (spawnSync(docker, ['image', 'inspect', image], { stdio: 'ignore' }).status !== 0) { // NOSONAR: the rig's own docker, an argument list
      unmeasured(`PA1-g ${image}`, 'the image is not on this runner (the step builds it first)');
      continue;
    }
    await olderClient(scope, docker, image, rig);
  }
}

/** One older image: its `psql --version` and the libpq it loads, the controls, the three candidates and the string V3 will write. */
async function olderClient(scope, docker, image, rig) {
  const stem = ownedName('pa1-old-psql');
  let runs = 0;
  const nameOfRun = () => {
    runs += 1;
    const name = `${stem}-${runs}`;
    scope.after(() => spawnSync(docker, ['rm', '-f', name], { stdio: 'ignore' })); // NOSONAR: the rig's own docker, an argument list
    return name;
  };
  const libpq = libpqOfImage(docker, image);
  // One absolute path for the version, the libpq and every run; the word `psql` only when no binary was found (the libpq is then unread, and the leg says so below).
  const program = libpq.psql ?? 'psql';
  const versionAnswer = runSync(docker, ['run', '--rm', image, program, '--version'], process.env, 60_000);
  const loaded = libpq.why === undefined ? `loads the libpq file ${libpq.file} (package ${libpq.package}; ${libpq.psql})` : `the libpq it loads could not be read (${libpq.why})`;
  console.log(`record (R1) older psql ${image}: ${oneLine(versionAnswer.text)}; ${loaded}; node ${process.version}; ${process.platform}/${process.arch}`);
  console.log(`record (PA1-a) older psql ${image}: ${loaded}`);
  const client = { exe: docker, versionWord: `(older, ${image.slice(0, 40)}, libpq ${libpq.file ?? 'unread'})` };
  const run = (label, extra) => R.psqlRun(scope, docker, {
    prepare: () => undefined,
    build: (port) => ({ args: ['run', '--rm', '--network', 'host', '--name', nameOfRun(), '-e', 'PGCONNECT_TIMEOUT=10', image, program, ...argsOf(port, extra)], env: { PATH: process.env.PATH, HOME: process.env.HOME } }),
  }).then((answer) => {
    const reached = reachedOf(answer);
    console.log(`record (PA1-g) ${client.versionWord} ${label}: the listener ${reached ? 'got a connection' : 'got NO connection'}; exit ${answer.code}; the client said ${R.said(answer)}`);
    // A refusal is read only from libpq's own words about the string, in a run that ended: a container that did not start (docker's exit 125-127) or a run past its bound refuses nothing.
    const refusedByLibpq = !reached && answer.ended && /invalid connection option|invalid (?:\w+ )?value for (?:parameter|option)/i.test(answer.said);
    return { reached, refusedByLibpq, words: `exit ${answer.code}${answer.ended ? '' : ', past its bound'}; the client said ${R.said(answer)}` };
  });
  const base = (await run('control, no candidate', [])).reached;
  check('(PA1-g) older psql control: the string with no candidate reaches the listener', base, `${image}`);
  const did = [];
  for (const [key, value] of V3_PAIRS) {
    const one = await run(`${key}='${value}'`, [[key, value]]);
    did.push(`${key} ${one.reached ? 'known' : (one.refusedByLibpq ? 'refused' : 'not answered (no refusal of libpq seen)')}`);
  }
  const wholeRun = await run('the three together, as V3 will write them', V3_PAIRS);
  const whole = wholeRun.reached;
  if (libpq.major === undefined || libpq.major >= FIRST_LIBPQ_WITH_CONTROLS) {
    // A rig that produced no older client says so: this is no answer of an older client, and no STOP.
    unmeasured(`PA1-g ${client.versionWord}`, `the rig did not produce an older libpq (${libpq.major === undefined ? 'the libpq could not be read' : `${libpq.file} knows the controls: libpq ${FIRST_LIBPQ_WITH_CONTROLS} is the first that does`}); what it did: ${did.join('; ')}; all three: ${whole ? 'goes on' : 'refused'}`);
    return;
  }
  if (!whole && !wholeRun.refusedByLibpq) {
    unmeasured(`PA1-g ${client.versionWord}`, `the string V3 will write reached no listener, and no refusal of libpq was seen (${wholeRun.words}): fails closed is not shown; what the candidates did: ${did.join('; ')}`);
    return;
  }
  noteLeg(`PA1-g ${client.versionWord}`, base, `${did.join('; ')}; all three: ${whole ? 'GOES ON (an older client does not fail closed on this string)' : 'refused by libpq (fails closed)'}`);
  if (whole) {
    console.log('STOP (PA1-g): an older client goes on with the string V3 will write: the client check is its only lock, and the row says so (parent §7, row PA1)');
  }
}

module.exports = { legB, libpqLegs, legG };
