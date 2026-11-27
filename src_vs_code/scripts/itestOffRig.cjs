'use strict';
// The rows of G1's E3 that run OFF the rig (E3.S9; `research/PLAN_person_roads_pin_host_key_E3_S9_spec.md` §1.1): M10, M11 and M13, and the run of test 34 with the older client first on `PATH`. They are not in section 10 of
// `ssh-agent-itest.cjs`, and CI runs none of them: each needs an instrument that CI has no way to give (a `wslc` container with a resolver of its own, an unpacked OpenSSH 8.4p1, the owner's Windows `ssh.exe`).
//
//   node --import ./scripts/lower-priority.mjs scripts/itestOffRig.cjs <name> [--legs <a,b,...>]
//   <name> is one of: m10 (the host part starts the container; `--inside` is the part that runs in it), m11, m13, unit-older.
//
// `--legs` is for the hand checks only: it runs the named legs of m10 or m11 and nothing else, and the run says that it is no proving run. An unknown name, a second name, `--inside` with another name than m10, `--legs` with m13 or
// unit-older, or a `--legs` name that the row does not have, ends at once with exit 2 and names the legal values. A run prints its checks (`ok`, `FAIL`; `info` decides nothing), its record of identities, and ONE last line
// `off-rig <name>: <n> ok, <m> FAIL`; the exit code is 0 only when no check failed. One section scope and one owned folder (`off`) per run; the person's `~/.ssh/known_hosts` is read before and after. Linux only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const harnessScope = require('./lib/harnessScope.cjs');
const { ownedDir, shortSocketRoot } = require('./lib/leftovers.cjs');
const off = require('./lib/offRigRecord.cjs');
const sec = require('./itestPinnedRoads.cjs');
const rowRig = require('./itestRowRig.cjs');
const { setChildTemp, launch, endChild } = require('./itestSshd.cjs');
const { recordIdentities, identitiesOf } = require('./itestIdentities.cjs');
const older = require('./itestProbeOlderClient.cjs');
const { devNullScan } = require('./itestRowM12.cjs');
const { runInContainer } = require('./itestProbeResolver.cjs');
const { rowM11 } = require('./itestRowM11.cjs');
const { rowM13 } = require('./itestRowM13.cjs');
const { SSH_EXE } = require('./itestProbeWindows.cjs');

const OUT = path.join(__dirname, '..', 'out');
const NAMES = ['m10', 'm11', 'm13', 'unit-older'];
const ROW_LEGS = { m10: off.M10_LEGS, m11: off.M11_LEGS.map((one) => one.name) };
const HEX40 = /^[0-9a-f]{40}$/;
const UNIT_LIMIT_MS = 600_000;
const sha256Of = (file) => {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
};

/** The command line: `{ name, inside, legs }`, or `{ refusal }` that names the legal values. */
function parse(argv) {
  const names = [];
  let inside = false;
  let legs;
  for (let at = 0; at < argv.length; at += 1) {
    if (argv[at] === '--inside') {
      inside = true;
    } else if (argv[at] === '--legs') {
      legs = (argv[at + 1] ?? '').split(',').filter((one) => one !== '');
      at += 1;
    } else {
      names.push(argv[at]);
    }
  }
  const legal = `the names are ${NAMES.join(', ')}; the flags are --inside (with m10 only) and --legs <a,b,...> (with m10 or m11 only)`;
  const name = names[0];
  const bad = names.length !== 1 ? `${names.length === 0 ? 'no name' : `a second name (${names.join(' ')})`} was given` : !NAMES.includes(name) ? `unknown name ${name}`
    : inside && name !== 'm10' ? '--inside is for m10 only' : legs !== undefined && !Object.hasOwn(ROW_LEGS, name) ? `--legs is for m10 or m11 only, not ${name}`
      : legs !== undefined && (legs.length === 0 || legs.some((one) => !ROW_LEGS[name].includes(one))) ? `--legs names a leg that ${name} does not have (${ROW_LEGS[name].join(', ')})` : undefined;
  return bad === undefined ? { name, inside, legs } : { refusal: `itestOffRig: ${bad}; ${legal}` };
}

/** One program, bounded, exe + argv: `{ code, stdout, stderr }`. Never rejects. */
function run(program, args, { env = process.env, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve) => {
    // dpkg-deb and the unpacked client: the instruments of the run, not a product call.
    const child = execFile(program, args, { env, timeout: timeoutMs, encoding: 'utf8' }, (error, stdout, stderr) => { // NOSONAR: a CI rig
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
    child.stdin?.end();
  });
}

const executableOf = (role, file, version = null) => ({ role, path: file ?? null, version, sha256: file === undefined ? null : sha256Of(file) });

/** The version of a client by its path: `{ code, line, token, parser, kind }` as the product and the lib read it. */
async function clientFacts(product, program) {
  const said = await run(program, ['-V'], { timeoutMs: 10_000 });
  const token = said.code === 0 ? product.versionTokenOf(said.stderr) : undefined;
  return { code: said.code, line: said.stderr.split(/\r?\n/).find((one) => one.startsWith('OpenSSH_')) ?? null, token, parser: off.parserOf(token?.version), kind: product.pinClientOf(said.code, said.stderr).kind };
}

/** The older client, unpacked as S3.P3 does (checked against its SHA256SUMS at each run) into `<dir>/oldssh`: `{ wrapper, root, debs, libraries }`, or `{ failed }`. */
async function unpackOlder(check, dir) {
  const given = older.debsFolderOf(process.env);
  const checked = given.refusal === undefined ? older.checkedDebs(given.folder) : { debs: [], refusal: given.refusal };
  check(`M11.0d ${older.DEBS_VARIABLE} names an absolute folder, and each .deb in it has the SHA-256 that its SHA256SUMS line says`, checked.refusal === undefined, checked.refusal);
  if (checked.refusal !== undefined) {
    return { failed: checked.refusal };
  }
  const unpacked = await older.unpack({ dir, run: (program, args, options) => run(program, args, { ...options, env: harnessScope.tempEnv(dir, process.env) }) }, checked.debs);
  check('M11.0u both packages were unpacked into the owned folder with dpkg-deb -x (nothing is installed) and the wrapper was written', unpacked.failed === undefined, unpacked.failed);
  return unpacked.failed === undefined ? { ...unpacked, debs: checked.debs, libraries: older.librariesOf({ executableOf }, unpacked.root) } : { failed: unpacked.failed };
}

/** The top of the rows' legs, as section 10 builds it (`pinnedLegs`): the keys, the handed config, the shim, the pin of K1 and `rowsTop`. Answers `{ top, rig, real }`, or `undefined`. */
async function topOf(check, section, dir, product) {
  const rig = sec.rigOf(section, dir, OUT, product);
  if (!(await sec.makeKeys(check, rig))) {
    return undefined;
  }
  sec.writeClientConfig(rig);
  const real = sec.installShim(rig);
  check('the shim resolved the real ssh outside its own folder', real !== undefined, process.env.PATH);
  const pinned = { ...rig, pin: rig.product.formatHostKey(rig.product.parseHostKey(fs.readFileSync(`${rig.k1}.pub`, 'utf8')) ?? { algorithm: '', base64: '' }) };
  const top = real === undefined ? undefined : await rowRig.rowsTop(check, pinned);
  return top === undefined ? undefined : { top, rig: pinned, real };
}

/** The record of identities, then the run's own part written beside it: the record is printed as `identities <json>` and the off-rig part as `identities-offrig <json>`. */
async function record(check, ctx, built, real, parts, which) {
  const checkOf = ctx.inside ? (name, ok, detail) => (/^(the run is a run of its commit|the record names the commit)/.test(name) ? ctx.info(`${name}: answered on the host, the image has no git (here: ${ok ? 'ok' : 'not answerable'})`) : check(name, ok, detail)) : check;
  const done = await recordIdentities(checkOf, built.rig, real, which);
  fs.writeFileSync(path.join(built.rig.dir, 'identities.json'), `${JSON.stringify({ ...done, offRig: parts }, null, 2)}\n`);
  console.log(`identities-offrig ${JSON.stringify(parts)}`);
}

// ---- the rows -------------------------------------------------------------------------------------------------------------------------

/** M10, the part that runs in the container (`--inside`): the image's own sshd and ssh, the resolver of the run, the leg `m10`. */
async function m10Inside(ctx) {
  const { check, section, dir } = ctx;
  const control = '/run/e3-resolver';
  const given = process.env.CREDS_ITEST_E3_IMAGE_ID ?? null;
  const ready = fs.existsSync(path.join(control, 'ready'));
  check('M10.i this is the container of M10: a plain user, the resolver\'s control folder ready and the image id handed in', typeof process.getuid === 'function' && process.getuid() !== 0 && ready && given !== null, JSON.stringify({ uid: process.getuid?.(), ready, given }));
  if (!ready || given === null) {
    return;
  }
  const built = await topOf(check, section, dir, sec.productOf(OUT));
  if (built === undefined) {
    return;
  }
  await rowRig.runLeg(check, built.top, 'M10', 'm10');
  devNullScan(check, built.top);
  const image = { role: 'the image (its id; the sha256 is the image id, not a file digest)', path: 'the image of the container', version: null, sha256: given };
  await record(check, ctx, built, built.real, { image, resolver: executableOf('the resolver (itestResolverServer.cjs, root)', path.join(__dirname, 'itestResolverServer.cjs')), zone: sha256Of(path.join(control, 'zone.json')), resolvConf: sha256Of('/etc/resolv.conf') }, { tools: false, commands: false });
}

/** M10 on the host: the container is started with the harness `m10 --inside`; what it printed is read as the inside part's own result. */
async function m10Host(ctx) {
  const { check, info, section } = ctx;
  const ran = await runInContainer({ check, info, section }, ['scripts/itestOffRig.cjs', 'm10', '--inside'], 'M10.h');
  if (ran === undefined) {
    return;
  }
  const lines = `${ran.outcome.stdout}`.split(/\r?\n/);
  const last = lines.filter((line) => line.startsWith('off-rig m10 inside:')).at(-1) ?? null;
  const counted = /: (\d+) ok, (\d+) FAIL$/.exec(last ?? '');
  info(`the inside part counted ${counted === null ? 'nothing' : `${counted[1]} ok and ${counted[2]} FAIL`}`);
  check('M10.h the inside part ran to its end: exit 0, no FAIL line, and its last line is "off-rig m10 inside: <n> ok, 0 FAIL"', ran.outcome.code === 0 && ran.report.failed.length === 0 && counted !== null && counted[2] === '0', JSON.stringify({ code: ran.outcome.code, failed: ran.report.failed, last }));
  ctx.add(counted === null ? 0 : Number(counted[1]), counted === null ? 0 : Number(counted[2]));
}

/** M11: the two clients, M11.0 and M11.0n, the legs, the scan for /dev/null, the record, and the words of the result (decision 22). */
async function m11(ctx) {
  const { check, info, section, dir, legs } = ctx;
  const newer = sec.realSsh(dir); // before the PATH changes: the rig's own client, as section 10 resolves it
  const product = sec.productOf(OUT);
  const unpacked = await unpackOlder(check, dir);
  if (unpacked.failed !== undefined || newer === undefined) {
    check('M11.0n the rig has a client of its own on the PATH', newer !== undefined, process.env.PATH);
    return;
  }
  const [oldFacts, newFacts] = [await clientFacts(product, unpacked.wrapper), await clientFacts(product, newer)];
  check(`M11.0 the wrapper -V ended with 0 and printed OpenSSH_8.4p1; the product's pinClientOf reads it as older; the lib reads its parser as older (below 8.7)`, oldFacts.code === 0 && oldFacts.line?.startsWith('OpenSSH_8.4p1 ') === true && oldFacts.kind === 'older' && oldFacts.parser === 'older', JSON.stringify(oldFacts));
  check('M11.0n the rig\'s client -V printed a version that the lib reads as newer (8.7 or later)', newFacts.code === 0 && newFacts.parser === 'newer' && newFacts.kind === 'knows', JSON.stringify(newFacts));
  const own = process.env.PATH;
  process.env.PATH = `${path.dirname(unpacked.wrapper)}${path.delimiter}${own ?? ''}`;
  section.after(() => {
    process.env.PATH = own;
  });
  const built = await topOf(check, section, dir, product);
  if (built === undefined) {
    return;
  }
  Object.assign(built.top, { older: unpacked.wrapper, newer });
  await rowM11(check, built.top, legs);
  devNullScan(check, built.top);
  const words = `M11.words: on ${oldFacts.line} the row does not show the collision of a pair of apostrophes, which that client does not have (M7 shows it on a client from 8.7 on); it shows the collision of a bare equals sign and its repair by the double quotes; on ${newFacts.line} the same pair shows no collision of that kind; no row ran a client of 8.5 or 8.6 (C21)`;
  info(words);
  const programs = ['c-install', 'c-bridge', 'd-install', 'd-bridge'].map((one) => executableOf(`the program of the leg m11-${one}`, path.join(dir, 'programs', `m11-${one}`, 'ssh')));
  const parts = {
    older: { wrapper: executableOf('oldssh/bin/ssh (the wrapper)', unpacked.wrapper, oldFacts.line), ssh: executableOf('the unpacked older ssh (usr/bin/ssh)', path.join(unpacked.root, 'usr', 'bin', 'ssh'), oldFacts.line), libraries: unpacked.libraries, debs: unpacked.debs.map((deb) => ({ role: deb.role, name: deb.name, sha256: deb.sha256 })) },
    newer: executableOf('the rig\'s client (top.newer)', newer, newFacts.line),
    programs: legs === undefined ? programs : programs.filter((one) => legs.some((name) => one.path.includes(`/${name}/`))),
    words,
  };
  await record(check, ctx, built, unpacked.wrapper, parts, { tools: false, commands: legs === undefined || legs.some((name) => name.startsWith('m11-a-')) });
}

/** M13: the client alone, in this process: ssh.exe -V and -G and where.exe ssh only. */
async function m13(ctx) {
  const { check, info, dir } = ctx;
  const product = sec.productOf(OUT);
  const result = await rowM13(check, info, { out: OUT, product, dir });
  const rig = { dir };
  const identities = { ...(await identitiesOf(rig, SSH_EXE)), offRig: result };
  fs.writeFileSync(path.join(dir, 'identities.json'), `${JSON.stringify(identities, null, 2)}\n`);
  console.log(`identities ${JSON.stringify(identities)}`);
  check('the run is a run of its commit: git status --porcelain --untracked-files=no answered, and it is empty', identities.trackedChanges === '', JSON.stringify(identities.trackedChanges));
  check('the record names the commit and the pin of the shared rules (git rev-parse HEAD and HEAD:.agents/conventions)', HEX40.test(identities.commit ?? '') && HEX40.test(identities.conventions ?? ''), JSON.stringify([identities.commit, identities.conventions]));
}

/** Test 34 with the older client first on PATH: `run-tests.mjs out/test/pinWords.test.js` as ONE child, relayed as `unit | <line>`; its exit code is this run's. */
async function unitOlder(ctx) {
  const { check, info, section, dir } = ctx;
  const product = sec.productOf(OUT);
  const unpacked = await unpackOlder(check, dir);
  if (unpacked.failed !== undefined) {
    return;
  }
  const facts = await clientFacts(product, unpacked.wrapper);
  check('U.0 the wrapper -V ended with 0 and printed OpenSSH_8.4p1, and the lib reads its parser as older', facts.code === 0 && facts.line?.startsWith('OpenSSH_8.4p1 ') === true && facts.parser === 'older', JSON.stringify(facts));
  const env = { ...process.env, PATH: `${path.dirname(unpacked.wrapper)}${path.delimiter}${process.env.PATH ?? ''}` };
  const seen = await run('ssh', ['-V'], { env, timeoutMs: 10_000 });
  check('U.0b ssh -V with the child\'s own environment (the wrapper\'s folder first on PATH) printed OpenSSH_8.4p1: the child finds the older client by name', seen.code === 0 && seen.stderr.startsWith('OpenSSH_8.4p1 '), JSON.stringify({ code: seen.code, said: seen.stderr.trim() }));
  const child = launch(section, process.execPath, ['--import', './scripts/lower-priority.mjs', 'scripts/run-tests.mjs', 'out/test/pinWords.test.js'], { cwd: path.join(__dirname, '..'), env });
  let rest = '';
  child.child.stdout.on('data', (chunk) => {
    const lines = `${rest}${chunk}`.split('\n');
    rest = lines.pop();
    lines.forEach((line) => console.log(`unit | ${line}`));
  });
  const code = await Promise.race([child.done, new Promise((resolve) => setTimeout(resolve, UNIT_LIMIT_MS, 'limit'))]);
  if (code === 'limit') {
    await endChild(child);
  }
  await Promise.race([child.closed, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  if (rest !== '') {
    console.log(`unit | ${rest}`);
  }
  child.stderr.trim().split('\n').filter((line) => line !== '').forEach((line) => console.log(`unit stderr | ${line}`));
  const count = (key) => /(\d+)\s*$/.exec(child.stdout.split('\n').find((line) => new RegExp(`^ℹ ${key} \\d+`).test(line)) ?? '')?.[1] ?? null;
  info(`unit-older: the child's exit code ${code}; tests ${count('tests')}, pass ${count('pass')}, fail ${count('fail')}, skipped ${count('skipped')}`);
  check('U.1 the child run of test 34 ended with 0, within 10 minutes, with the older client first on PATH', code === 0, JSON.stringify({ code }));
  // A8: the child's runner sweeps only what a KILLED run left and audits only its own record; the folder of THIS run (its claim is this process's) must be whole after it.
  check('U.2 the parent\'s off folder is whole after the child run: the folder, the wrapper and the unpacked ssh are there', fs.existsSync(dir) && fs.existsSync(unpacked.wrapper) && fs.existsSync(path.join(unpacked.root, 'usr', 'bin', 'ssh')), JSON.stringify({ dir, wrapper: fs.existsSync(unpacked.wrapper) }));
}

const RUNNERS = { m10: (ctx) => (ctx.inside ? m10Inside(ctx) : m10Host(ctx)), m11, m13, 'unit-older': unitOlder };

async function main() {
  const given = parse(process.argv.slice(2));
  if (given.refusal !== undefined) {
    console.error(given.refusal);
    return 2;
  }
  if (process.platform !== 'linux') {
    console.error('itestOffRig: Linux only (the end of a server reads /proc)');
    return 2;
  }
  const { name, inside, legs } = given;
  const section = harnessScope.sectionScope();
  const dir = ownedDir(section, 'off', { parent: shortSocketRoot() });
  if (name !== 'unit-older') {
    setChildTemp(dir);
  }
  const tally = { ok: 0, fail: 0 };
  const check = (text, ok, detail) => {
    if (text.includes(' — ')) {
      throw new Error(`a check name holds " — ", which splits a FAIL line there: ${text}`);
    }
    tally[ok ? 'ok' : 'fail'] += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}${ok || detail === undefined ? '' : ` — ${String(detail).replaceAll(/\r?\n/g, ' | ')}`}`);
  };
  const info = (text) => console.log(`info  ${text}`);
  const ctx = { check, info, section, dir, inside, legs, add: (ok, fail) => { tally.ok += ok; tally.fail += fail; } };
  console.log(`--- off-rig ${name}${inside ? ' (inside)' : ''}`);
  if (legs !== undefined) {
    info(`--legs given: this run is no proving run (${legs.join(', ')})`);
  }
  const before = sec.knownHostsDigest();
  try {
    await RUNNERS[name](ctx);
  } catch (error) {
    check(`the run ran to its end without an uncaught error`, false, String(error?.stack ?? error));
  } finally {
    check('the person\'s ~/.ssh/known_hosts is unchanged: the same bytes, or absent before and after', sec.knownHostsDigest() === before);
    await section.close();
  }
  check('the run\'s owned folder is gone after its scope closed', !fs.existsSync(dir), dir);
  console.log(`off-rig ${name}${inside ? ' inside' : ''}: ${tally.ok} ok, ${tally.fail} FAIL`);
  return tally.fail === 0 ? 0 : 1;
}

if (require.main === module) {
  harnessScope.run(main);
}

module.exports = { parse };
