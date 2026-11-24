'use strict';
// Probe P3 of E3.S3 (`todo/PLAN_person_roads_pin_host_key_E3_S3_spec.md`): a client older than 8.5 that runs here, for M11; with the lead's check Q1
// (`ssh -G` of a quoted path that holds `=`).
//
// The way: an unpacked package. The two `.deb` files (an `openssh-client` 8.4 and a `libssl1.1` of Debian 11, kept with their `SHA256SUMS` in the folder
// that `CREDS_ITEST_OLD_SSH_DEBS` names, an absolute path) are checked against `SHA256SUMS` at EACH run, unpacked with `dpkg-deb -x` into
// `<dir>/oldssh/root/`, and `<dir>/oldssh/bin/ssh` is a wrapper that sets `LD_LIBRARY_PATH` and `exec`s the unpacked `ssh`. The unpacked program lives in
// the owned folder and goes with it. `<dir>/oldssh/bin` then goes FIRST on `process.env.PATH`, and only after that `rigOf` and `installShim` run, so the
// shim resolves the wrapper as the real client (F15 of the brief). Nothing is installed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { rigOf, installShim, writeClientConfig, makeKeys, recordedStarts } = require('./itestPinnedRoads.cjs');
const harnessScope = require('./lib/harnessScope.cjs');

/** The new run parameter of this probe, in the way of E3.S2's two: a variable, and no tracked file edited. */
const DEBS_VARIABLE = 'CREDS_ITEST_OLD_SSH_DEBS';
const CLIENT_DEB = /^openssh-client_8\.4p1-[^/]+_amd64\.deb$/;
const LIBRARY_DEB = /^libssl1\.1_[^/]+_amd64\.deb$/;
const LIB_DIR = ['usr', 'lib', 'x86_64-linux-gnu'];

/** The SHA-256 of a file's bytes, or `null`. */
function digestOf(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

/** The folder that `env` names for the two packages, or a refusal that names the variable. */
function debsFolderOf(env) {
  const named = env[DEBS_VARIABLE];
  if (named === undefined || named === '') {
    return { refusal: `${DEBS_VARIABLE} is not set: it must name the absolute path of the folder that holds the two .deb files and their SHA256SUMS` };
  }
  if (!path.isAbsolute(named)) {
    return { refusal: `${DEBS_VARIABLE} must be an absolute path; got ${JSON.stringify(named)}` };
  }
  return { folder: named };
}

/**
 * The two packages of `folder`, each checked against its line of `SHA256SUMS` (`<sha256>  <name>`, `sha256sum`'s own format). Answers
 * `{ debs: [{ role, name, file, sha256 }], refusal }`; a missing file, a missing line or a different SHA-256 is a refusal that names the file.
 */
function checkedDebs(folder) {
  let sums;
  try {
    sums = new Map(fs.readFileSync(path.join(folder, 'SHA256SUMS'), 'utf8').split('\n').map((line) => /^([0-9a-f]{64}) [ *](\S+)$/.exec(line)).filter((found) => found !== null).map((found) => [found[2], found[1]]));
  } catch (error) {
    return { debs: [], refusal: `${DEBS_VARIABLE}: ${path.join(folder, 'SHA256SUMS')} cannot be read (${error.code ?? error.message})` };
  }
  const names = [...sums.keys()];
  const wanted = [['openssh-client (older than 8.5)', CLIENT_DEB], ['libssl1.1 (libcrypto.so.1.1)', LIBRARY_DEB]];
  const debs = [];
  for (const [role, pattern] of wanted) {
    const found = names.filter((name) => pattern.test(name));
    if (found.length !== 1) {
      return { debs, refusal: `${DEBS_VARIABLE}: SHA256SUMS names ${found.length} files for ${role}; exactly one is needed` };
    }
    const file = path.join(folder, found[0]);
    const sha256 = digestOf(file);
    if (sha256 !== sums.get(found[0])) {
      return { debs, refusal: `${DEBS_VARIABLE}: ${file} has SHA-256 ${sha256}, SHA256SUMS says ${sums.get(found[0])}` };
    }
    debs.push({ role, name: found[0], file, sha256 });
  }
  return { debs };
}

/** `text` in single quotes for `sh`. */
const quoted = (text) => `'${text.replaceAll("'", String.raw`'\''`)}'`;

/** Unpacks both packages into `<oldssh>/root` and writes the wrapper `<oldssh>/bin/ssh`. Answers `{ root, wrapper, text, failed }`. */
async function unpack(ctx, debs) {
  const oldssh = path.join(ctx.dir, 'oldssh');
  const root = path.join(oldssh, 'root');
  const bin = path.join(oldssh, 'bin');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(bin);
  const env = harnessScope.tempEnv(ctx.dir, process.env);
  for (const deb of debs) {
    const done = await ctx.run('dpkg-deb', ['-x', deb.file, root], { env, timeoutMs: 60_000 });
    if (done.code !== 0) {
      return { failed: `dpkg-deb -x ${deb.name}: ${JSON.stringify(done)}` };
    }
  }
  const wrapper = path.join(bin, 'ssh');
  const text = ['#!/bin/sh', '# The wrapper of probe P3: the older client, with the unpacked libraries first; `exec`, so the recorded pid is the client\'s.',
    `LD_LIBRARY_PATH=${quoted(path.join(root, ...LIB_DIR))} exec ${quoted(path.join(root, 'usr', 'bin', 'ssh'))} "$@"`, ''].join('\n');
  fs.writeFileSync(wrapper, text, { mode: 0o700 });
  return { root, wrapper, text };
}

/** Every `.so` file (and link) under the unpacked library folder, as `{ role, path, sha256 }`. */
function librariesOf(ctx, root) {
  const dir = path.join(root, ...LIB_DIR);
  return fs.readdirSync(dir).filter((name) => /\.so(\.|$)/.test(name)).sort().map((name) => ctx.executableOf(`unpacked library ${name}`, path.join(dir, name)));
}

/** The lines of `-G` output (CR removed). */
const linesOf = (text) => text.split(/\r?\n/);

/** P3.4 (the lead's check, Q1) and P3.5 (recorded): `ssh -G -F /dev/null` through the wrapper, with the quoted words and with the bare ones. */
async function equalsChecks(ctx, rig, wrapper) {
  const file = path.join(ctx.dir, 'data=prod', 'keys', 'known_hosts-e1');
  const checked = rig.product.checkedPin(file, { kind: 'older', token: 'OpenSSH_8.4' });
  const words = checked.ok ? rig.product.hostKeyWords(checked.pin) : [];
  ctx.check('P3.4 the product writes a path with = for an older client as a checked pin (the path is accepted and written in double quotes)', checked.ok && checked.pin.word === `"${file}"`, JSON.stringify(checked));
  const quotedRun = await ctx.run(wrapper, ['-G', '-F', '/dev/null', ...words, '127.0.0.1'], { env: rig.env });
  const quotedLines = linesOf(quotedRun.stdout);
  ctx.check(`P3.4 (Q1) ssh -G -F /dev/null with the quoted words ends with 0 and prints "userknownhostsfile ${file}" and "globalknownhostsfile ${file}", each exactly so: the path whole, as the sole value`,
    quotedRun.code === 0 && quotedLines.includes(`userknownhostsfile ${file}`) && quotedLines.includes(`globalknownhostsfile ${file}`),
    JSON.stringify({ code: quotedRun.code, lines: quotedLines.filter((line) => /knownhostsfile/i.test(line)), stderr: quotedRun.stderr }));
  const bare = await ctx.run(wrapper, ['-G', '-F', '/dev/null', '-o', `UserKnownHostsFile=${file}`, '-o', `GlobalKnownHostsFile=${file}`, '127.0.0.1'], { env: rig.env });
  ctx.info(`P3.5 the same -G with the BARE words UserKnownHostsFile=<path> and GlobalKnownHostsFile=<path>: exit ${bare.code}; ${JSON.stringify(linesOf(bare.stdout).filter((line) => /knownhostsfile/i.test(line)))}; stderr ${JSON.stringify(bare.stderr.trim())}`);
  return words;
}

async function probeOlderClient(ctx) {
  const given = debsFolderOf(process.env);
  const checked = given.refusal === undefined ? checkedDebs(given.folder) : { debs: [], refusal: given.refusal };
  ctx.check(`P3.0 ${DEBS_VARIABLE} names an absolute folder, and each .deb in it has the SHA-256 that its SHA256SUMS line says`, checked.refusal === undefined, checked.refusal);
  if (checked.refusal !== undefined) {
    return;
  }
  const unpacked = await unpack(ctx, checked.debs);
  ctx.check('P3.0 both packages were unpacked into the owned folder with dpkg-deb -x (nothing is installed) and the wrapper was written', unpacked.failed === undefined, unpacked.failed);
  if (unpacked.failed !== undefined) {
    return;
  }
  const { wrapper } = unpacked;
  const said = await ctx.run(wrapper, ['-V']);
  const version = /^OpenSSH_8\.4p1 .*, OpenSSL 1\.1\.1\S* /m.exec(said.stderr);
  ctx.check('P3.1 the wrapper -V ends with 0 and prints OpenSSH_8.4p1 …, OpenSSL 1.1.1… (the version of the package)', said.code === 0 && version !== null, JSON.stringify(said));
  // F15: the wrapper is first on this process's PATH BEFORE the rig and the shim are made, so the shim resolves it as the real client. Put back at the end.
  const ownPath = process.env.PATH;
  process.env.PATH = `${path.dirname(wrapper)}${path.delimiter}${ownPath ?? ''}`;
  ctx.section.after(() => {
    process.env.PATH = ownPath;
  });
  const rig = rigOf(ctx.section, ctx.dir, ctx.out);
  const keys = await makeKeys(ctx.check, rig);
  if (!keys) {
    return;
  }
  writeClientConfig(rig);
  const real = installShim(rig);
  ctx.check('P3.2 installShim resolved the wrapper as the real client (realSsh answered <dir>/oldssh/bin/ssh)', real === fs.realpathSync(wrapper), JSON.stringify({ real, wrapper }));
  if (real === undefined) {
    return;
  }
  const answer = await rig.product.pinClientAsker()({ program: 'ssh', env: rig.env });
  const asked = recordedStarts(rig);
  ctx.check('P3.2 the product\'s asker, through the shim, answered { kind: older, token: OpenSSH_8.4 }, and the shim recorded that start as -V', answer.kind === 'older' && answer.token === 'OpenSSH_8.4' && asked.length === 1 && asked[0].whole && asked[0].argv.join(' ') === '-V', JSON.stringify({ answer, asked }));
  const server = await ctx.serve(rig, 'k1', rig.k1);
  if (server === undefined) {
    return;
  }
  const pin = await ctx.pinFor(rig, 'k1', server.port, rig.k1);
  const words = rig.product.hostKeyWords(pin);
  const done = await ctx.run(path.join(rig.shimDir, 'ssh'), ctx.clientArgv(rig, words, server.port, 'true'), { env: rig.env });
  await ctx.settle();
  const wordsOk = words.length === 10 && !words.some((word) => word.startsWith('KnownHostsCommand')) && words.filter((word) => word === '-o').length === 5;
  ctx.check('P3.3 the words that the product writes for this client are five pairs and no KnownHostsCommand', wordsOk, JSON.stringify(words));
  ctx.check('P3.3 a login through the shim with those words and "true" ends with 0, and K1 logged one Accepted publickey', done.code === 0 && ctx.accepted(server.sshd.stderr) === 1, JSON.stringify({ done, log: server.sshd.stderr.trim().split('\n').slice(-8) }));
  await equalsChecks(ctx, rig, wrapper);
  await ctx.stopServing(rig, server, 'K1');
  const client = unpacked.root;
  const probe = {
    name: ctx.name,
    executables: [
      ctx.executableOf('the unpacked older ssh (usr/bin/ssh)', path.join(client, 'usr', 'bin', 'ssh'), version?.[0] ?? null),
      ...librariesOf(ctx, client),
      ...checked.debs.map((deb) => ({ role: `the package ${deb.role}: ${deb.name}`, path: deb.file, version: null, sha256: deb.sha256 })),
    ],
    configs: [{ file: 'oldssh/bin/ssh (the wrapper)', sha256: crypto.createHash('sha256').update(unpacked.text).digest('hex'), text: unpacked.text }],
  };
  await ctx.recordWithListener(rig, real, probe);
}

module.exports = { probeOlderClient, DEBS_VARIABLE };
