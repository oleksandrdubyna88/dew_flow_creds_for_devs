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
  noteLeg('PA1-c psql', base.reached, `gssencmode=require: ${needGss.reached ? 'the client tried (it reached the listener)' : 'the client refused before connecting'}`);
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

/** The older clients PA1-g asks, each by an image digest the workflow pulled. `PA1_OLD_PSQL_IMAGES` is a comma list of `postgres@sha256:...`. */
const oldImages = () => (process.env.PA1_OLD_PSQL_IMAGES ?? '').split(',').map((name) => name.trim()).filter((name) => name !== '');

/**
 * PA1-g: a `psql` whose libpq does not know the controls, in a container of an older distribution's own image on the host's network, against the listener. Its
 * environment is the image's own (a container cannot take the bridged one, R2). A missing `docker` or image is `UNMEASURED`, a printed fact with the missing thing named.
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
      unmeasured(`PA1-g ${image}`, 'the image is not on this runner (the step pulls it first)');
      continue;
    }
    await olderClient(scope, docker, image, rig);
  }
}

/** One older image: its `psql --version`, the controls, the three candidates and the string V3 will write. */
async function olderClient(scope, docker, image, rig) {
  const stem = ownedName('pa1-old-psql');
  let runs = 0;
  const nameOfRun = () => {
    runs += 1;
    const name = `${stem}-${runs}`;
    scope.after(() => spawnSync(docker, ['rm', '-f', name], { stdio: 'ignore' })); // NOSONAR: the rig's own docker, an argument list
    return name;
  };
  const versionAnswer = runSync(docker, ['run', '--rm', image, 'psql', '--version'], process.env, 60_000);
  console.log(`record (R1) older psql ${image}: ${oneLine(versionAnswer.text)}; node ${process.version}; ${process.platform}/${process.arch}`);
  const client = { exe: docker, versionWord: `(older, ${image.slice(0, 24)})` };
  const run = (label, extra) => R.psqlRun(scope, docker, {
    prepare: () => undefined,
    build: (port) => ({ args: ['run', '--rm', '--network', 'host', '--name', nameOfRun(), '-e', 'PGCONNECT_TIMEOUT=10', image, 'psql', ...argsOf(port, extra)], env: { PATH: process.env.PATH, HOME: process.env.HOME } }),
  }).then((answer) => {
    const reached = reachedOf(answer);
    console.log(`record (PA1-g) ${client.versionWord} ${label}: the listener ${reached ? 'got a connection' : 'got NO connection'}; exit ${answer.code}; the client said ${R.said(answer)}`);
    return reached;
  });
  const base = await run('control, no candidate', []);
  check('(PA1-g) older psql control: the string with no candidate reaches the listener', base, `${image}`);
  const did = [];
  for (const [key, value] of V3_PAIRS) {
    did.push(`${key} ${(await run(`${key}='${value}'`, [[key, value]])) ? 'known' : 'refused'}`);
  }
  const whole = await run('the three together, as V3 will write them', V3_PAIRS);
  noteLeg(`PA1-g ${client.versionWord}`, base, `${did.join('; ')}; all three: ${whole ? 'GOES ON (an older client does not fail closed on this string)' : 'refused (fails closed)'}`);
  if (whole) {
    console.log('STOP (PA1-g): an older client goes on with the string V3 will write: the client check is its only lock, and the row says so (parent §7, row PA1)');
  }
}

module.exports = { legB, libpqLegs, legG };
