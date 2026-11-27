'use strict';
// Probe P1 of E3.S3 (`research/PLAN_person_roads_pin_host_key_E3_S3_spec.md`): the install's stand-in, for M1, M2 (the switch), M3 (the switch), M6, M7, M9
// and M11 (b). The product's *Install creds on host* runs `installCommand()` on the host, which downloads the published installer and runs it. A
// row must run that install to its end on the real `sshd` without fetching the installer and without writing outside the owned folder.
//
// The stand-in (the first candidate of the brief), in `<dir>/standin/`: `bin/curl` records its start and fetches nothing; `bin/sh` records its start
// and `exec`s the real `/bin/sh` with `installer.sh` by its absolute path; `installer.sh` writes the run's nonce, writes what `command -v` answers,
// and prints the line the product looks for. The login's `PATH` is the `extra` line `SetEnv PATH=<dir>/standin/bin:...` of the serving launcher.
// `installStandIn` and `listingOf` are what a row of E3.S4 and later calls; the probe below shows that they work.
//
// Two legs: (a) the client alone: the command read from the compiled product, through the shim, with the words of a pin of K1; (b) the road:
// the registered command, with `answer` giving the button that `confirmationFor` names. The listing of `/usr/local/bin/creds` and of every
// `/tmp/creds-install.*` is taken before (a) and after (b), and the two must be the same.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { rigOf, installShim, writeClientConfig, makeKeys, openLeg, startsOf, recordedStarts, finishes } = require('./itestPinnedRoads.cjs');
const { ownedPattern } = require('./lib/leftovers.cjs');

/** The folder the product's install command writes its script to, on the host: a fixed word of the command (`remoteCliInstall.ts`). */
const HOST_TMP = '/tmp';
const HOST_CREDS = '/usr/local/bin/creds';
const SCRIPT = /^\/tmp\/creds-install\.\d+\.sh$/;

/** `text` in single quotes for `sh` (a `'` inside ends the quote, is escaped, and opens it again). */
const quoted = (text) => `'${text.replaceAll("'", String.raw`'\''`)}'`;

/** The lines of a stand-in that records its start as the shim does (pid, start time, count, each word NUL-ended), into `records`. */
const recordLines = (records) => [
  'set -C',
  `{ printf '%s\\0' "$$" "$(cut -d' ' -f22 /proc/$$/stat)" "$#"; printf '%s\\0' "$@"; } > ${quoted(records)}/"$$".argv || exit 97`,
];

/**
 * The stand-in of the install, written into `<rig.dir>/standin`. `nonce` is this run's. Answers `{ extra, bin, records, marker, env, files }`: the
 * `extra` lines of the serving launcher, the folder to put first, the two folders the stand-ins record into (`records.curl`, `records.sh`), the file
 * the installer writes the nonce into, the file it writes its environment into, and the three files by role.
 */
function installStandIn(rig, nonce) {
  const root = path.join(rig.dir, 'standin');
  const bin = path.join(root, 'bin');
  const records = { curl: path.join(root, 'records', 'curl'), sh: path.join(root, 'records', 'sh') };
  [bin, records.curl, records.sh].forEach((folder) => fs.mkdirSync(folder, { recursive: true }));
  const marker = path.join(root, 'marker');
  const env = path.join(root, 'env');
  const files = { curl: path.join(bin, 'curl'), sh: path.join(bin, 'sh'), installer: path.join(root, 'installer.sh') };
  const write = (file, lines) => fs.writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o700 });
  write(files.curl, ['#!/bin/sh', '# The curl of probe P1: records its start, fetches nothing, writes no file.', ...recordLines(records.curl), 'exit 0']);
  write(files.sh, ['#!/bin/sh', '# The sh of probe P1: records its start, then runs the stand-in installer with the real sh.', ...recordLines(records.sh), `exec /bin/sh ${quoted(files.installer)}`]);
  write(files.installer, [
    '#!/bin/sh',
    '# The installer of probe P1: it writes the nonce of the run and what it sees, and prints the line the product looks for.',
    `printf '%s\\n' ${quoted(nonce)} > ${quoted(marker)}`,
    `{ printf 'PATH=%s\\n' "$PATH"; printf 'curl=%s\\n' "$(command -v curl)"; printf 'sh=%s\\n' "$(command -v sh)"; } > ${quoted(env)}`,
    `printf 'creds-install: installed %s\\n' ${quoted(path.join(bin, 'creds'))}`,
  ]);
  return { extra: [`SetEnv PATH=${bin}:/usr/local/bin:/usr/bin:/bin`], bin, records, marker, env, files };
}

/** `file` listed with its size, time and SHA-256, or as absent. */
function listFile(file) {
  try {
    const stat = fs.statSync(file);
    return { file, size: stat.size, mtimeMs: stat.mtimeMs, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
  } catch (error) {
    return error.code === 'ENOENT' ? { file, state: 'absent' } : { file, state: `unreadable (${error.code})` };
  }
}

/** The listing of the two things the install would write: `/usr/local/bin/creds` and every `/tmp/creds-install.*`. */
function listingOf() {
  const scripts = fs.readdirSync(HOST_TMP).filter((name) => name.startsWith('creds-install.')).sort().map((name) => path.join(HOST_TMP, name));
  return [HOST_CREDS, ...scripts].map(listFile);
}

/** The names in `/tmp` (depth 1, names only). */
const tmpNames = () => fs.readdirSync(HOST_TMP).sort();

/** The starts a stand-in recorded: each `{ pid, argv, whole }`. */
const startsIn = (records) => recordedStarts({ records });

/** Whether a stand-in's starts are exactly `count`, each whole, each with the argv that `expected(argv)` accepts. */
const exactly = (starts, count, expected) => starts.length === count && starts.every((one) => one.whole && expected(one.argv));

/** The argv of the stand-in `curl`: `-fsSL`, the installer's URL, `-o`, the script's name (`/tmp/creds-install.<n>.sh`). */
const curlArgv = (url) => (argv) => argv.length === 4 && argv[0] === '-fsSL' && argv[1] === url && argv[2] === '-o' && SCRIPT.test(argv[3]);
/** The argv of the stand-in `sh`: that same script alone. */
const shArgv = (argv) => argv.length === 1 && SCRIPT.test(argv[0]);

/** Leg (a): the client alone. Answers the number of accepted logins K1 logged so far. */
async function clientAlone(ctx, rig, server, standIn) {
  const { product } = rig;
  const pin = await ctx.pinFor(rig, 'k1', server.port, rig.k1);
  const done = await ctx.run(path.join(rig.shimDir, 'ssh'), ctx.clientArgv(rig, product.hostKeyWords(pin), server.port, product.installCommand()), { env: rig.env, timeoutMs: 60_000 });
  await ctx.settle();
  const installed = `creds-install: installed ${path.join(standIn.bin, 'creds')}`;
  ctx.check('leg (a): the install command through the shim ended with 0 and printed the installer\'s line', done.code === 0 && done.stdout.split('\n').includes(installed), JSON.stringify(done));
  ctx.check('leg (a): the stand-in curl recorded ONE start, the stand-in sh ONE start, with the argv of the install command', exactly(startsIn(standIn.records.curl), 1, curlArgv(product.INSTALLER_URL)) && exactly(startsIn(standIn.records.sh), 1, shArgv), JSON.stringify({ curl: startsIn(standIn.records.curl), sh: startsIn(standIn.records.sh) }));
  const shim = recordedStarts(rig);
  ctx.info(`leg (a): the shim recorded ${shim.length} start(s) of ssh: ${JSON.stringify(shim.map((one) => one.argv.at(-1)?.slice(0, 40)))}`);
  return ctx.accepted(server.sshd.stderr);
}

/** The recorded run of the road whose last word is `command`. */
const runOf = (leg, command) => leg.outcomes.find((one) => one.argv.at(-1) === command);

/** Leg (b): the road, to the end of the install. Answers `{ leg, click }`. */
async function theRoad(ctx, rig, server) {
  const { product } = rig;
  const holder = {};
  const button = () => product.confirmationFor(product.interpretProbe(runOf(holder.leg, product.probeCommand())?.outcome?.stdout ?? ''), product.world.ROW.node.name).action;
  holder.leg = openLeg(rig, server.port, { answer: () => button() });
  ctx.section.after(() => holder.leg.w.bridges.dispose());
  const click = await finishes(product.world.click(holder.leg.w, 'installRemoteCli'), 200_000);
  await ctx.settle();
  return { leg: holder.leg, click };
}

/** The checks of the road (P1.5, the road's part). */
function roadChecks(ctx, rig, standIn, { leg, click }) {
  const { product } = rig;
  const w = leg.w;
  ctx.check('leg (b): Install creds on host ended within 200 s', click.ended, click.error);
  const probe = runOf(leg, product.probeCommand());
  const facts = product.interpretProbe(probe?.outcome?.stdout ?? '');
  ctx.check('leg (b): the probe was answered: exit 0, no blocker (the downloader it found is the stand-in curl)', probe?.outcome?.exitCode === 0 && product.blockerFor(facts) === '' && facts.downloader === path.join(standIn.bin, 'curl'), JSON.stringify({ probe, facts }));
  const asked = w.asked.filter((one) => one.message === product.confirmationFor(facts, product.world.ROW.node.name).message);
  ctx.check('leg (b): the install reached its question, the one confirmationFor builds, and the button it names was given', asked.length === 1, JSON.stringify(w.asked));
  const install = runOf(leg, product.installCommand());
  const outcome = install?.outcome === undefined ? undefined : product.interpretInstall(install.outcome.stdout, install.outcome.stderr, install.outcome.exitCode);
  ctx.check('leg (b): interpretInstall answered installed, with the stand-in\'s path', outcome?.kind === 'installed' && outcome.path === path.join(standIn.bin, 'creds'), JSON.stringify({ install, outcome }));
  const message = `\`creds\` is installed on "${product.world.ROW.node.name}" at ${path.join(standIn.bin, 'creds')}.`;
  ctx.check('leg (b): the world shows the product\'s message for an installed creds, and no warning and no error', w.infos.includes(message) && w.warnings.length === 0 && w.errors.length === 0, JSON.stringify({ infos: w.infos, warnings: w.warnings, errors: w.errors }));
  const starts = startsOf(rig, leg);
  const questions = starts.filter((one) => one.argv.length === 1 && one.argv[0] === '-V');
  const connections = starts.filter((one) => !questions.includes(one));
  const kinds = connections.map((one) => (one.argv.at(-1) === product.probeCommand() ? 'probe' : one.argv.at(-1) === product.installCommand() ? 'install' : 'other')).sort();
  ctx.check('leg (b): the shim recorded ONE question ssh -V and TWO connection starts, the probe and the install run', starts.every((one) => one.whole) && questions.length === 1 && kinds.join(',') === 'install,probe', JSON.stringify({ questions: questions.length, kinds }));
}

/** The checks that read what the stand-in left, once both legs ran (P1.2 to P1.5). */
function standInChecks(ctx, rig, standIn, nonce, acceptedAfterA, acceptedTotal) {
  const { product } = rig;
  ctx.check('P1.1 K1 logged one Accepted publickey for leg (a) and two for leg (b): the install run passed the real authentication', acceptedAfterA === 1 && acceptedTotal === 3, JSON.stringify({ afterA: acceptedAfterA, total: acceptedTotal }));
  const env = fs.existsSync(standIn.env) ? fs.readFileSync(standIn.env, 'utf8').split('\n') : [];
  ctx.check('P1.2 the env file of the install run says PATH=<standin>/bin:... and command -v curl and command -v sh both answer the stand-ins', env.some((line) => line.startsWith(`PATH=${standIn.bin}:`)) && env.includes(`curl=${standIn.files.curl}`) && env.includes(`sh=${standIn.files.sh}`), JSON.stringify(env));
  const curl = startsIn(standIn.records.curl);
  const sh = startsIn(standIn.records.sh);
  ctx.check('P1.3 the stand-in curl recorded exactly ONE start per install run (2), each with the argv -fsSL, INSTALLER_URL, -o, /tmp/creds-install.<n>.sh', exactly(curl, 2, curlArgv(product.INSTALLER_URL)), JSON.stringify(curl));
  ctx.check('P1.4 the stand-in sh recorded exactly ONE start per install run (2), each with the argv /tmp/creds-install.<n>.sh', exactly(sh, 2, shArgv), JSON.stringify(sh));
  ctx.check('P1.3/P1.4 each run named its own script: the two scripts differ, and curl and sh of a run name the same one', new Set(curl.map((one) => one.argv[3])).size === 2 && curl.map((one) => one.argv[3]).sort().join() === sh.map((one) => one.argv[0]).sort().join(), JSON.stringify({ curl, sh }));
  const marker = fs.existsSync(standIn.marker) ? fs.readFileSync(standIn.marker, 'utf8') : null;
  ctx.check('P1.5 the marker holds this run\'s nonce', marker === `${nonce}\n`, JSON.stringify({ marker, nonce }));
}

/** P1.6 and P1.7: what the install could have written outside the owned folder, before and after. */
function nothingWritten(ctx, ownedFolder, before, after, tmpBefore, tmpAfter) {
  ctx.info(`P1.6 the listing before, as taken: ${JSON.stringify(before)}`);
  ctx.check('P1.6 the listing of /usr/local/bin/creds and of every /tmp/creds-install.* is the same before and after: the same names, sizes, times and SHA-256', JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
  const fresh = tmpAfter.filter((name) => !tmpBefore.includes(name));
  const gone = tmpBefore.filter((name) => !tmpAfter.includes(name));
  fresh.forEach((name) => ctx.info(`P1.7 a new name in /tmp: ${name}`));
  gone.forEach((name) => ctx.info(`P1.7 a name gone from /tmp: ${name}`));
  const ours = (name) => /^creds-/.test(name) || ownedPattern().test(name) || name.startsWith(path.basename(ownedFolder));
  ctx.check('P1.7 no file is new outside the owned folder that the install could have made: no new name in /tmp is creds-*, an owned name of this repository, or the probe\'s own (each new name is recorded above)', !fresh.some(ours), JSON.stringify(fresh));
}

async function probeInstallStandIn(ctx) {
  const rig = rigOf(ctx.section, ctx.dir, ctx.out);
  if (!(await makeKeys(ctx.check, rig))) {
    return;
  }
  writeClientConfig(rig);
  const real = installShim(rig);
  ctx.check('the shim resolved the real ssh outside its own folder', real !== undefined, process.env.PATH);
  if (real === undefined) {
    return;
  }
  const nonce = crypto.randomUUID();
  const standIn = installStandIn(rig, nonce);
  const server = await ctx.serve(rig, 'k1', rig.k1, standIn.extra);
  if (server === undefined) {
    return;
  }
  const { product } = rig;
  const pinned = { ...rig, pin: product.formatHostKey(product.parseHostKey(fs.readFileSync(`${rig.k1}.pub`, 'utf8'))) };
  const before = listingOf();
  const tmpBefore = tmpNames();
  const acceptedAfterA = await clientAlone(ctx, pinned, server, standIn);
  const road = await theRoad(ctx, pinned, server);
  roadChecks(ctx, pinned, standIn, road);
  const acceptedTotal = ctx.accepted(server.sshd.stderr);
  standInChecks(ctx, pinned, standIn, nonce, acceptedAfterA, acceptedTotal);
  nothingWritten(ctx, ctx.dir, before, listingOf(), tmpBefore, tmpNames());
  road.leg.w.bridges.dispose();
  await ctx.stopServing(rig, server, 'K1');
  const probe = {
    name: ctx.name,
    executables: [
      ctx.executableOf('the stand-in curl', standIn.files.curl),
      ctx.executableOf('the stand-in sh', standIn.files.sh),
      ctx.executableOf('the stand-in installer', standIn.files.installer),
    ],
    configs: [{ file: 'extra of k1 (candidate 1: SetEnv)', sha256: crypto.createHash('sha256').update(standIn.extra.join('\n')).digest('hex'), text: standIn.extra.join('\n') }],
  };
  await ctx.recordWithListener(rig, real, probe);
}

module.exports = { probeInstallStandIn, installStandIn, listingOf, tmpNames, startsIn, exactly, curlArgv, shArgv };
