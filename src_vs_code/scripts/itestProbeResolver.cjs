'use strict';
// Probe P2 of E3.S3 (`todo/PLAN_person_roads_pin_host_key_E3_S3_spec.md`): a resolver that the run owns, whose answer the client takes as secure, in a
// container (M10). The brief's way: the counterpart, the client, the resolver and the harness of the roads all run INSIDE one container, because a port
// that `wslc` publishes is on the Windows loopback only and the distro cannot reach it. Containers on this machine are `wslc`'s, never Docker's.
//
//   node --import ./scripts/lower-priority.mjs scripts/itestFeasibility.cjs resolver           (the host part: starts the container)
//   ... scripts/itestFeasibility.cjs resolver --inside                                          (run by the container's start, as a plain user)
//
// The HOST part answers R1 and R2 (the image has no `git`), starts the container from the image named by its id (`--rm`, the owner-form name and the
// owner label, the worktree mounted read-only, `--dns 127.0.0.1` with the options `trust-ad` and `edns0`), and removes it by its EXACT name on every path:
// in a `finally` and in the scope's `after`. The INSIDE part is the probe proper: the resolver (`itestResolverServer.cjs`, root, port 53) answers what
// the harness writes into its zone file and sets the AD bit; the counterparts are started by the serving launcher (the image's own `sshd`, no
// `CREDS_ITEST_SSHD`); the client is the image's `ssh`. Checks P2.2 to P2.6 are inside; P2.1 is the host's.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { boundedRun } = require('./lib/boundedRun.cjs');
const { rigOf, installShim, writeClientConfig, makeKeys, openLeg, startsOf, finishes } = require('./itestPinnedRoads.cjs');
const { checkedPinOf, SSHD } = require('./itestSshd.cjs');
const { installStandIn } = require('./itestProbeInstall.cjs');
const { ownedName, ownedPattern, formatOwner, runRecord } = require('./lib/leftovers.cjs');

const me = os.userInfo().username;
/** The repository of the tag below, and the file whose git blob names the image (E3.S9, D13: the tag is `creds-itest-e3-resolver:<the first 12 hex digits of the file's blob id>`). Not swept by the janitor (it reads Docker only). */
const CONTAINERFILE = 'src_vs_code/scripts/containers/e3-resolver.Containerfile';
const IMAGE_REPOSITORY = 'creds-itest-e3-resolver';
const WSLC = 'wslc.exe';
/** The folder that the container's start makes for the resolver's three files (`containers/e3-resolver-init.sh`). */
const CONTROL = '/run/e3-resolver';
/** The name that the probe gives its counterpart; its zone answers `A` and `SSHFP` for it. */
const NAME = 'k2.e3-probe.test';
const VERIFY_FAILED = 'Host key verification failed.';
const AUTH_ATTEMPT = /Accepted |Failed |Postponed |Invalid user|authenticating user/;
/** What the image's id is called in the record: the part after `sha256:`. */
const IMAGE_ID_VARIABLE = 'CREDS_ITEST_E3_IMAGE_ID';

/** One program, bounded, exe + argv: `{ code, stdout, stderr }`; its limit ends its whole process tree (`lib/boundedRun.cjs`). Never rejects. */
async function runBounded(program, args, timeoutMs, env = process.env) {
  // wslc.exe, wslpath and git are the machine's own programs, found by PATH: a CI rig, not a product call.
  const { code, stdout, stderr } = await boundedRun(program, args, { env, timeoutMs, maxOutputBytes: 32 * 1024 * 1024 });
  return { code, stdout, stderr };
}

// ---- the host part ----------------------------------------------------------------------------------------------------------------------

/** The tree's own facts, answered on the host (the image has no `git`): R1 and R2 of the record of identities. */
async function gitFacts(repo) {
  const git = async (args) => {
    const said = await runBounded('git', ['-C', repo, ...args], 10_000);
    return said.code === 0 ? said.stdout.replace(/\n$/, '') : null;
  };
  return { commit: await git(['rev-parse', 'HEAD']), trackedChanges: await git(['status', '--porcelain', '--untracked-files=no']), conventions: await git(['rev-parse', 'HEAD:.agents/conventions']) };
}

/** Removes the container by its EXACT name; idempotent. Answers the text of what `wslc` said. */
async function removeContainer(name) {
  const said = await runBounded(WSLC, ['rm', '-f', '-v', name], 60_000);
  return `${said.stdout}${said.stderr}`.trim();
}

/** The names of every container `wslc list -a` shows, one per row (the last column). */
async function containerNames() {
  const said = await runBounded(WSLC, ['list', '-a', '--no-trunc'], 30_000); // without --no-trunc a long name is cut with an ellipsis, and a match on it proves nothing
  return said.code === 0 ? said.stdout.split('\n').slice(1).map((line) => line.trim().split(/\s+/).at(-1)).filter((name) => name) : undefined;
}

/** The tag of the image that the committed Containerfile builds, or `undefined` when git cannot answer. */
async function imageTag(repo = path.resolve(__dirname, '..', '..')) {
  const said = await runBounded('git', ['-C', repo, 'rev-parse', `HEAD:${CONTAINERFILE}`], 10_000);
  const blob = said.code === 0 ? said.stdout.trim() : '';
  return /^[0-9a-f]{40}$/.test(blob) ? `${IMAGE_REPOSITORY}:${blob.slice(0, 12)}` : undefined;
}

/** The image of the probe: its id (`sha256:<hex>`), or `undefined`. */
async function imageId(tag) {
  const said = await runBounded(WSLC, ['image', 'inspect', tag], 30_000);
  try {
    return JSON.parse(said.stdout)[0].Id;
  } catch {
    return undefined;
  }
}

/** What `wslc inspect` says of the RUNNING container `name`: `{ image, name, labels }`, or `undefined` while it does not run. */
async function inspectRunning(name) {
  const said = await runBounded(WSLC, ['inspect', name], 30_000);
  try {
    const parsed = JSON.parse(said.stdout);
    const one = Array.isArray(parsed) ? parsed[0] : parsed;
    return { image: one.Image, name: one.Name, labels: one.Config?.Labels ?? one.Labels ?? {} };
  } catch {
    return undefined;
  }
}

/** Prints the container's output as the harness's inside lines, each prefixed, and counts what the inside part said. */
function insideReport(ctx, output) {
  const lines = output.split(/\r?\n/).filter((line) => line !== '');
  lines.forEach((line) => console.log(`inside | ${line}`));
  const failed = lines.filter((line) => line.startsWith('FAIL'));
  const last = lines.filter((line) => line.startsWith('probe resolver:')).at(-1);
  return { failed, last, identities: lines.find((line) => line.startsWith('identities ')) };
}

/**
 * The host part, as a function (E3.S9, D13): R1 and R2 on the host, the image by its tag, the container started with `insideArgs` (the harness it runs and its arguments, D14), removed by its EXACT name on every path.
 * `what` is the checks' prefix (`P2.1` for the probe). Answers `{ outcome, report }` once the container ran, or `undefined`.
 */
async function runInContainer(ctx, insideArgs, what = 'P2.1') {
  const repo = path.resolve(__dirname, '..', '..');
  const facts = await gitFacts(repo);
  const HEX40 = /^[0-9a-f]{40}$/;
  console.log(`identities-host ${JSON.stringify(facts)}`);
  ctx.check('the run is a run of its commit: git status --porcelain --untracked-files=no answered, and it is empty (answered on the host)', facts.trackedChanges === '', JSON.stringify(facts.trackedChanges));
  ctx.check('the record names the commit and the pin of the shared rules (git rev-parse HEAD and HEAD:.agents/conventions) (answered on the host)', HEX40.test(facts.commit ?? '') && HEX40.test(facts.conventions ?? ''), JSON.stringify([facts.commit, facts.conventions]));
  const before = await containerNames();
  ctx.check('wslc answers `wslc list -a` (the container runtime of this machine; Docker is not used)', before !== undefined);
  const tag = await imageTag(repo);
  const id = tag === undefined ? undefined : await imageId(tag);
  ctx.check(`the image ${tag} exists and wslc answers its id`, id !== undefined, JSON.stringify({ tag, id }));
  const unc = await runBounded('wslpath', ['-w', repo], 10_000);
  ctx.check('the worktree has a path that wslc.exe can mount (wslpath -w)', unc.code === 0 && unc.stdout.trim() !== '', JSON.stringify(unc));
  if (before === undefined || id === undefined || unc.code !== 0) {
    return;
  }
  const name = ownedName('e3-resolver');
  const owner = formatOwner(runRecord());
  const label = `testsToDelete.owner=${owner}`;
  ctx.info(`wslc list -a before the run: ${JSON.stringify(before)}`);
  const run = ['run', '--pull', 'never', '--rm', '--name', name, '--label', label, '-v', `${unc.stdout.trim()}:/work:ro`, '--dns', '127.0.0.1', '--dns-option', 'trust-ad', '--dns-option', 'edns0',
    '-e', `${IMAGE_ID_VARIABLE}=${id.replace(/^sha256:/, '')}`, id, 'sh', '/work/src_vs_code/scripts/containers/e3-resolver-init.sh', ...insideArgs];
  ctx.section.after(() => removeContainer(name)); // the scope's own removal, by the exact name
  let outcome;
  let finished = false;
  let seen;
  // While the container runs, the runtime is asked what it says of it (`wslc inspect`, by the exact name) until it answers once.
  const watching = (async () => {
    while (!finished && seen === undefined) {
      seen = await inspectRunning(name);
      if (seen === undefined) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  })();
  try {
    outcome = await runBounded(WSLC, run, 480_000);
  } finally {
    finished = true;
    await watching;
    ctx.info(`wslc rm -f -v ${name}: ${JSON.stringify(await removeContainer(name))}`);
  }
  ctx.info(`wslc inspect while it ran: ${JSON.stringify(seen ?? null)}`);
  const after = await containerNames();
  const report = insideReport(ctx, `${outcome.stdout}${outcome.stderr === '' ? '' : `\nstderr: ${outcome.stderr}`}`);
  ctx.check(`${what} the container ran from the image ${id.slice(0, 19)}… (inspect while it ran: that image id, the name ${name}, the owner label), started with --rm and the owner-form name; after the probe wslc list -a --no-trunc shows no container of that name`,
    ownedPattern().test(name) && run.includes('--rm') && seen?.image === id && seen?.name === `/${name}` && seen?.labels?.['testsToDelete.owner'] === owner && after !== undefined && !after.includes(name), JSON.stringify({ name, seen, after }));
  ctx.info(`wslc list -a after the run: ${JSON.stringify(after)}`);
  return { outcome, report, tag, id };
}

async function hostPart(ctx) {
  const ran = await runInContainer(ctx, ['scripts/itestFeasibility.cjs', 'resolver', '--inside']);
  if (ran !== undefined) {
    const { outcome, report } = ran;
    ctx.check('the inside part ran to its end: exit 0, no FAIL line, and its last line is "probe resolver: worked"', outcome.code === 0 && report.failed.length === 0 && report.last === 'probe resolver: worked', JSON.stringify({ code: outcome.code, failed: report.failed, last: report.last }));
  }
}

// ---- the inside part --------------------------------------------------------------------------------------------------------------------

/** The questions the resolver recorded, parsed. */
function questions() {
  try {
    return fs.readFileSync(path.join(CONTROL, 'queries.jsonl'), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/** The SSHFP records of a host key, as `ssh-keygen -r <name> -f <key>.pub` prints them: `[{ algorithm, type, hex }]`. */
async function sshfpOf(ctx, name, keyFile) {
  const said = await ctx.run('ssh-keygen', ['-r', name, '-f', `${keyFile}.pub`]);
  const records = said.stdout.split('\n').map((line) => /^\S+ IN SSHFP (\d+) (\d+) ([0-9a-f]+)$/.exec(line.trim())).filter((found) => found !== null)
    .map((found) => ({ algorithm: Number(found[1]), type: Number(found[2]), hex: found[3] }));
  return { records, said };
}

/** The pin file of a counterpart for `name`: K1's line for `[<name>]:<port>`, then the CHECKED pin of it. */
async function pinForName(rig, port, keyFile) {
  const { parseHostKey, knownHostsLine } = rig.product;
  const folder = path.join(rig.dir, 'pins');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'known_hosts-name');
  fs.writeFileSync(file, knownHostsLine(NAME, port, parseHostKey(fs.readFileSync(`${keyFile}.pub`, 'utf8'))));
  return checkedPinOf(rig.out, file);
}

/** E1's words for the control, without the three pairs that would hide it: `VerifyHostKeyDNS=no` and `LogLevel=ERROR` (the handed config and `-v` speak instead). */
function controlWords(rig, pin) {
  const words = rig.product.hostKeyWords(pin);
  const kept = [];
  for (let at = 0; at < words.length; at += 2) {
    if (!/^(VerifyHostKeyDNS|LogLevel)=/.test(words[at + 1])) {
      kept.push(words[at], words[at + 1]);
    }
  }
  return kept;
}

/** A handed config with `VerifyHostKeyDNS <value>`; the two known-hosts lines are the command line's to override. */
function handConfig(rig, value) {
  const text = `Host *\n  VerifyHostKeyDNS ${value}\n  UserKnownHostsFile /dev/null\n  GlobalKnownHostsFile /dev/null\n`;
  fs.writeFileSync(rig.clientConfig, text);
  return text;
}

/** One control login to `NAME`: what it ended with and said, what K2 logged and what the resolver was asked during it. */
async function controlLogin(ctx, rig, server, pin) {
  const log = server.sshd.stderr.length;
  const asked = questions().length;
  const argv = [...controlWords(rig, pin), '-v', '-i', rig.userKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-p', String(server.port), `${me}@${NAME}`, 'true'];
  const done = await ctx.run(path.join(rig.shimDir, 'ssh'), argv, { env: rig.env });
  await ctx.settle(600);
  return { done, serverLog: server.sshd.stderr.slice(log), asked: questions().slice(asked), argv };
}

/** P2.5: the roads' harness runs inside: `openLeg` and one click of *Install creds on host*, pinned to K1, K1 answering, to its question. */
async function installReachesItsQuestion(ctx, rig, k1) {
  const { product } = rig;
  const pinned = { ...rig, pin: product.formatHostKey(product.parseHostKey(fs.readFileSync(`${rig.k1}.pub`, 'utf8')) ?? { algorithm: '', base64: '' }) };
  const leg = openLeg(pinned, k1.port);
  ctx.section.after(() => leg.w.bridges.dispose());
  const asked = leg.w.asked.length;
  const click = await finishes(product.world.click(leg.w, 'installRemoteCli'), 30_000);
  ctx.check('P2.5 Install creds on host ended within 30 s', click.ended, click.error);
  const probe = leg.outcomes.find((one) => one.argv.at(-1) === product.probeCommand());
  const facts = product.interpretProbe(probe?.outcome?.stdout ?? '');
  ctx.check('P2.5 the install\'s probe was answered: exit 0, and no blocker', probe?.outcome?.exitCode === 0 && product.blockerFor(facts) === '', JSON.stringify({ probe, blocker: product.blockerFor(facts) }));
  const questionsAsked = leg.w.asked.slice(asked);
  const expected = product.confirmationFor(facts, product.world.ROW.node.name).message;
  ctx.check('P2.5 Install creds on host reached its question: one question, the one confirmationFor builds from the probe\'s answer', questionsAsked.length === 1 && questionsAsked[0].message === expected, JSON.stringify(questionsAsked));
  const starts = startsOf(rig, leg);
  const question = starts.filter((one) => one.argv.length === 1 && one.argv[0] === '-V');
  const connections = starts.filter((one) => one.argv.at(-1) === product.probeCommand());
  ctx.check('P2.5 the shim recorded the question ssh -V (one start) and the probe (one connection start whose last word is the probe command), each whole', starts.every((one) => one.whole) && question.length === 1 && connections.length === 1, JSON.stringify(starts.map((one) => ({ argv: one.argv.map((word) => word.slice(0, 40)), whole: one.whole }))));
}

/** `<program> -V`'s first line (OpenSSH prints it on stderr), or `null`. */
async function versionLine(ctx, program) {
  const said = await ctx.run(program, ['-V']);
  return `${said.stdout}${said.stderr}`.split('\n').find((line) => line.startsWith('OpenSSH_')) ?? null;
}

async function insidePart(ctx) {
  const given = process.env[IMAGE_ID_VARIABLE] ?? null;
  const ready = fs.existsSync(path.join(CONTROL, 'ready'));
  ctx.check('P2.0 this is the probe\'s container: a plain user, the resolver\'s control folder ready and the image id handed in', typeof process.getuid === 'function' && process.getuid() !== 0 && ready && given !== null, JSON.stringify({ uid: process.getuid?.(), ready, given }));
  if (!ready || given === null) {
    return;
  }
  const rig = rigOf(ctx.section, ctx.dir, ctx.out);
  if (!(await makeKeys(ctx.check, rig))) {
    return;
  }
  writeClientConfig(rig);
  const real = installShim(rig);
  ctx.check('the shim resolved the real ssh outside its own folder', real !== undefined, process.env.PATH);
  const k2 = real === undefined ? undefined : await ctx.serve(rig, 'k2', rig.k2);
  if (k2 === undefined) {
    return;
  }
  const { records, said } = await sshfpOf(ctx, NAME, rig.k2);
  ctx.check('ssh-keygen -r printed the two SSHFP records of K2 (Ed25519; SHA-1 and SHA-256)', records.length === 2 && records.every((one) => one.algorithm === 4), JSON.stringify(said));
  fs.writeFileSync(path.join(CONTROL, 'zone.json'), `${JSON.stringify({ name: NAME, a: '127.0.0.1', sshfp: records })}\n`);
  // P2.2: the resolver answers.
  const resolvConf = fs.readFileSync('/etc/resolv.conf', 'utf8');
  ctx.info(`/etc/resolv.conf inside: ${JSON.stringify(resolvConf)}`);
  const host = await ctx.run('getent', ['hosts', NAME]);
  ctx.check(`P2.2 the resolver answers: getent hosts ${NAME} answers 127.0.0.1, and the resolver's record holds that A question`, /^127\.0\.0\.1\s/.test(host.stdout) && questions().some((one) => one.name === NAME && one.type === 'A' && one.answer === 'records'), JSON.stringify({ host, questions: questions() }));
  // P2.3 the control of M10: E1's words, a handed config that says VerifyHostKeyDNS yes, K1's line in the pin, K2 answering.
  const pin = await pinForName(rig, k2.port, rig.k1);
  const configYes = handConfig(rig, 'yes');
  const yes = await controlLogin(ctx, rig, k2, pin);
  const found = /found (\d+) secure fingerprints? in DNS/.exec(yes.done.stderr);
  ctx.check('P2.3 the control, DNS on: exit 0; K2 logged one Accepted publickey; stderr holds "found <n> secure fingerprints in DNS" and "matching host key fingerprint found in DNS"; the resolver was asked the SSHFP question for the name',
    yes.done.code === 0 && ctx.accepted(yes.serverLog) === 1 && found !== null && yes.done.stderr.includes('matching host key fingerprint found in DNS') && yes.asked.some((one) => one.name === NAME && one.type === 'SSHFP' && one.answer === 'records'),
    JSON.stringify({ code: yes.done.code, accepted: ctx.accepted(yes.serverLog), dns: yes.done.stderr.split('\n').filter((line) => /DNS|fingerprint|Host key|identification|Offending/i.test(line)), asked: yes.asked }));
  ctx.info(`P2.3 the count the client found: ${found === null ? 'none' : found[0]}; the questions it asked: ${JSON.stringify(yes.asked.map((one) => `${one.type} ${one.answer}`))}`);
  // P2.4 the opposite: the same client, VerifyHostKeyDNS no.
  const configNo = handConfig(rig, 'no');
  const no = await controlLogin(ctx, rig, k2, pin);
  ctx.check('P2.4 the control\'s opposite, DNS off: exit 255 with "Host key verification failed."; K2 logged no authentication attempt',
    no.done.code === 255 && no.done.stderr.split(/\r?\n/).includes(VERIFY_FAILED) && !AUTH_ATTEMPT.test(no.serverLog), JSON.stringify({ code: no.done.code, stderr: no.done.stderr.split('\n').slice(-8), log: no.serverLog.trim().split('\n').slice(-6) }));
  ctx.info(`P2.4 the questions the resolver was asked with DNS off: ${JSON.stringify(no.asked.map((one) => `${one.type} ${one.answer}`))}`);
  await ctx.stopServing(rig, k2, 'K2');
  // P2.5: the harness of the roads runs inside, on K1.
  writeClientConfig(rig);
  // The image has no curl and no wget (D4 allows none), so the install's probe would answer a blocker, not a question. P1's stand-in (its `curl`, found first on
  // the login's PATH by the `SetEnv` line of `extra`) is the downloader that the probe's host answers; the install itself is not run here.
  const standIn = installStandIn(rig, crypto.randomUUID());
  const k1 = await ctx.serve(rig, 'k1', rig.k1, standIn.extra);
  if (k1 !== undefined) {
    await installReachesItsQuestion(ctx, rig, k1);
    await ctx.stopServing(rig, k1, 'K1');
  }
  // P2.6: the record of identities inside (R3 to R6; R1 and R2 are the host's).
  const executable = (role, file, version) => ctx.executableOf(role, file, version);
  const probe = {
    name: ctx.name,
    executables: [
      { role: 'the image (its id; the sha256 is the image id, not a file digest)', path: given === null ? null : 'the image of the container', version: null, sha256: given },
      executable('ssh, the client inside', '/usr/bin/ssh', await versionLine(ctx, '/usr/bin/ssh')),
      executable('the image\'s sshd (the default of lib/sshdRun.cjs: no CREDS_ITEST_SSHD inside)', SSHD, await versionLine(ctx, SSHD)),
      executable('the resolver (itestResolverServer.cjs, root)', path.join(__dirname, 'itestResolverServer.cjs')),
      executable('the stand-in curl of P1 (P2.5: the probe\'s downloader; it fetches nothing)', standIn.files.curl),
    ],
    configs: [
      { file: 'client_config, P2.3 (handed)', sha256: crypto.createHash('sha256').update(configYes).digest('hex'), text: configYes },
      { file: 'client_config, P2.4 (handed)', sha256: crypto.createHash('sha256').update(configNo).digest('hex'), text: configNo },
      { file: '/etc/resolv.conf inside', sha256: crypto.createHash('sha256').update(resolvConf).digest('hex'), text: resolvConf },
      { file: 'extra of K1 (P2.5)', sha256: crypto.createHash('sha256').update(standIn.extra.join('\n')).digest('hex'), text: standIn.extra.join('\n') },
      { file: 'zone.json', sha256: ctx.sha256Of(path.join(CONTROL, 'zone.json')), text: fs.readFileSync(path.join(CONTROL, 'zone.json'), 'utf8') },
    ],
  };
  await ctx.recordWithListener(rig, real, probe);
}

async function probeResolver(ctx) {
  await (ctx.flags.includes('--inside') ? insidePart(ctx) : hostPart(ctx));
}

module.exports = { probeResolver, runInContainer, imageTag, NAME, CONTROL, questions, sshfpOf };
