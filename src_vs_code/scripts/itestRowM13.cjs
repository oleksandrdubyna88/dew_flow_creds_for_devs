'use strict';
// Row M13 of G1 (E3.S9; `research/PLAN_person_roads_pin_host_key.md`, `## Epics`, E3; `research/PLAN_person_roads_pin_host_key_E3_S9_spec.md` §1.5, §4): the Windows client alone. `ssh.exe -G` of the Windows that the owner's machine has, started from
// WSL (interop; Node's `execFile`, no shell, the argv as separate arguments: S3.P5's way), with the product's own argv for a pin file whose Windows path holds (a) a space, (b) an apostrophe, (c) a space and an apostrophe, and the rule
// asked for a UNC folder. The words are the product's (`buildSshExecArgv`, `buildBridgeArgv`, each with `knownHostsFile: await checkedPinOf(out, <pin path>, SSH_EXE)`), never typed here. Only `ssh.exe -V`, `ssh.exe -G` and
// `where.exe ssh` are started: no login, no network, no file written on Windows. One file is told from two by the control of K7 (E1.S1): a path with ` ~` after a space. NOT in this row: a login on Windows (C6). The Windows user
// folder is made up (two words joined by the case's separator); the owner's name is never used. No leg process, no counterpart, no world: the row runs in the entry's own process. A proving run of this file passes no row.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { checkedPinOf } = require('./itestSshd.cjs');
const { SSH_EXE } = require('./itestProbeWindows.cjs');
const off = require('./lib/offRigRecord.cjs');
const pr = require('./lib/pathRecord.cjs');

const WHERE_EXE = '/mnt/c/Windows/System32/where.exe';
const ENTITY = { id: 'e1', name: 'box', host: 'probe-host', user: 'probe', port: 22, isSshEnabled: true, hostKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM13probe' };

/** The storage folder of the editor on a made-up Windows user, as the product's `globalStorage` folder of an extension named `x.creds` is written. */
const windowsStorage = (user) => [String.raw`C:\Users`, user, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'x.creds'].join('\\');

/** The pin path of one call: `<storage>\keys\<pid>\known_hosts-e1-<uuid>`, joined as the product does on Windows (`path.win32`). */
const pinPathIn = (storage, uuid) => path.win32.join(storage, 'keys', String(process.pid), `known_hosts-e1-${uuid}`);

/** One program, bounded (10 s), exe + argv: `{ code, stdout, stderr }`. Never rejects. */
function run(program, args) {
  return new Promise((resolve) => {
    // ssh.exe and where.exe of the owner's Windows, through WSL's interop: the subject of the row, never a product call.
    const child = execFile(program, args, { timeout: 10_000, encoding: 'utf8' }, (error, stdout, stderr) => { // NOSONAR: a CI rig
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout: String(stdout), stderr: `${stderr}${error && typeof error.code !== 'number' ? `\n${String(error)}` : ''}` });
    });
    child.stdin?.end();
  });
}

const sha256Of = (file) => {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
};

/** Every start of `ssh.exe` of the run, by ONE function: its argv and its answer (the carriage returns of Windows kept as they came). */
function recorder() {
  const starts = [];
  const ssh = async (args) => {
    const said = await run(SSH_EXE, args);
    starts.push({ argv: args, code: said.code, stdout: said.stdout, stderr: said.stderr });
    return said;
  };
  return { starts, ssh };
}

const linesOf = (text) => text.split('\n').map((line) => line.replace(/\r$/, ''));
const named = (lines, key) => lines.filter((line) => line.startsWith(`${key} `));
const bareOf = (words, file) => words.map((word) => word.replace(`"${file}"`, file));

/** The facts of what `ssh.exe -G` printed that M13.x2 and M13.x3 hold: strict checking, no DNS, no command, quiet, and both lists the intended path, whole. */
function resolvesAsIntended(said, file) {
  const lines = linesOf(said.stdout);
  return said.code === 0 && lines.includes('stricthostkeychecking true') && lines.includes('verifyhostkeydns false') && lines.includes('loglevel ERROR') && !lines.some((line) => line.startsWith('knownhostscommand'))
    && lines.includes(`userknownhostsfile ${file}`) && lines.includes(`globalknownhostsfile ${file}`);
}

/** M13.0: ssh.exe is there as WSL sees it, its version, and the product's asker answered `knows` (the asker's runner is counted: M13.u2 holds that it started nothing more). */
async function clientCheck(check, product, count) {
  const present = fs.existsSync(SSH_EXE);
  const said = present ? await run(SSH_EXE, ['-V']) : { code: null, stdout: '', stderr: '' };
  const line = linesOf(`${said.stdout}${said.stderr}`).find((one) => one.startsWith('OpenSSH_for_Windows_')) ?? null;
  const asker = product.pinClientAsker({ run: (argv, options) => { count.n += 1; return product.runner.runSshExec(argv, options); } });
  const client = present ? await asker({ program: SSH_EXE, env: process.env }) : { kind: 'unreadable', exitCode: null };
  check(`M13.0 ssh.exe is there as WSL sees it; -V printed ${line ?? 'no OpenSSH_for_Windows version'}; the product's asker answered knows, by one start of ssh.exe`, present && said.code === 0 && line !== null && client.kind === 'knows' && count.n === 1, JSON.stringify({ present, said, client, starts: count.n }));
  return { line, asker, client };
}

/** One of the three cases: M13.p, M13.x1 to M13.x4. Answers the record of the case. */
async function caseOf(check, ctx, one, ssh) {
  const { out, product } = ctx;
  const buildExec = require(path.join(out, 'sshExecCommand.js')).buildSshExecArgv;
  const { buildBridgeArgv } = product;
  const { isSafeSshTarget } = require(path.join(out, 'sshCommand.js'));
  const storage = windowsStorage(one.user);
  const uuid = crypto.randomUUID();
  const file = pinPathIn(storage, uuid);
  const tails = (text, separator) => text.split(separator).slice(-3);
  const made = tails(product.knownHostsPath(storage, 'e1', uuid), '/');
  check(`M13.p (${one.letter}): the pin path's last three segments are those that the product's knownHostsPath makes for the same storage string: keys, <pid>, known_hosts-e1-<uuid>`, JSON.stringify(tails(file, '\\')) === JSON.stringify(made) && made[1] === String(process.pid) && file.startsWith(storage), JSON.stringify({ file, made }));
  const refusal = product.pinPathRefusal(file) ?? null;
  check(`M13.x1 (${one.letter}): the product's rule answers no refusal for the pathname`, refusal === null, JSON.stringify(refusal));
  const exec = buildExec({ ...ENTITY }, undefined, 'true', 'key', { knownHostsFile: await checkedPinOf(out, file, SSH_EXE) });
  const bridge = buildBridgeArgv({ ...ENTITY }, { port: 1, remote: { path: '/probe/socket' }, knownHostsFile: await checkedPinOf(out, file, SSH_EXE), auth: 'key' }, isSafeSshTarget);
  const [execSaid, bridgeSaid] = [await ssh(['-G', '-F', 'none', ...(exec ?? [])]), await ssh(['-G', '-F', 'none', ...(bridge ?? [])])];
  check(`M13.x2 (${one.letter}): ssh.exe -G with the exec argv ended with 0: stricthostkeychecking true, verifyhostkeydns false, no knownhostscommand line, loglevel ERROR, both lists the intended path, whole`, exec !== undefined && resolvesAsIntended(execSaid, file), JSON.stringify({ code: execSaid.code, lines: linesOf(execSaid.stdout).filter((line) => /known|strict|verify|loglevel/.test(line)), stderr: execSaid.stderr }));
  check(`M13.x3 (${one.letter}): the same with the bridge argv`, bridge !== undefined && resolvesAsIntended(bridgeSaid, file), JSON.stringify({ code: bridgeSaid.code, lines: linesOf(bridgeSaid.stdout).filter((line) => /known|strict|verify|loglevel/.test(line)), stderr: bridgeSaid.stderr }));
  return { ...(await k7Control(check, ctx, one, ssh)), letter: one.letter, user: one.user, file, exec: execSaid.code, bridge: bridgeSaid.code };
}

/** M13.x4, K7's control: under the twin folder (` ~` after the space) the product's word ended with 0 and the path whole and the bare word ended with 255 and a `tilde_expand` line; for (b) and (c), the bare word ended with 255 and `invalid quotes` (entry 4.1: an apostrophe is refused before any tilde, so K7's twin shows two files for (a) only). */
async function k7Control(check, ctx, one, ssh) {
  const apostrophe = one.letter !== 'a';
  const twin = apostrophe ? one.user : off.k7Twin(one.user);
  const file = pinPathIn(windowsStorage(twin), crypto.randomUUID());
  const words = ctx.product.hostKeyWords(await checkedPinOf(ctx.out, file, SSH_EXE));
  const quoted = await ssh(['-G', '-F', 'none', ...words, '-p', '22', 'probe-host']);
  const bare = await ssh(['-G', '-F', 'none', ...bareOf(words, file), '-p', '22', 'probe-host']);
  const text = `${bare.stdout}${bare.stderr}`;
  const quotedWhole = quoted.code === 0 && linesOf(quoted.stdout).includes(`userknownhostsfile ${file}`) && linesOf(quoted.stdout).includes(`globalknownhostsfile ${file}`);
  const expect = apostrophe ? /invalid quotes/ : /tilde_expand/;
  check(`M13.x4 (${one.letter}): ${apostrophe ? 'the bare word ended with 255 and invalid quotes' : "K7's control: under the twin folder (' ~' after the space) the product's word ended with 0 and the path whole, the bare word ended with 255 and a tilde_expand line"}`,
    (apostrophe || quotedWhole) && bare.code === 255 && expect.test(text), JSON.stringify({ twin, quoted: { code: quoted.code, stderr: quoted.stderr }, bare: { code: bare.code, text } }));
  return { k7: { quoted: quoted.code, bare: bare.code } };
}

/** M13.u1 to M13.u3 and M13.uc: the UNC folder. The rule refuses it; the product's decision for a call whose storage folder is that one is refused with sentence E and its asker started ssh.exe NOT ONE more time; nothing was written. */
async function uncChecks(check, ctx, ssh, asker, count) {
  const { product, dir } = ctx;
  const file = pinPathIn(UNC.storage, crypto.randomUUID());
  check(`M13.u1 the product's rule refuses the pathname under ${UNC.storage} with doubleBackslash`, product.pinPathRefusal(file) === 'doubleBackslash', JSON.stringify(product.pinPathRefusal(file)));
  const here = process.cwd();
  const folder = path.join(dir, 'unc-step');
  fs.mkdirSync(folder);
  const before = count.n;
  let decision;
  try {
    process.chdir(folder);
    decision = await product.decidePinOfCall({ storageDir: UNC.storage, entity: { ...ENTITY }, ask: asker, suffix: crypto.randomUUID() }, { program: SSH_EXE, env: process.env });
  } finally {
    process.chdir(here);
  }
  check(`M13.u2 decidePinOfCall answered refused with the product's sentence E for doubleBackslash, and its asker started ssh.exe 0 times`, decision?.kind === 'refused' && decision.message === product.pinPathSentence(ENTITY.name, 'doubleBackslash') && count.n === before, JSON.stringify({ decision, started: count.n - before }));
  check('M13.u3 no file was written for it: the owned folder holds no keys folder after the step', fs.readdirSync(folder).length === 0, JSON.stringify(fs.readdirSync(folder)));
  const words = [['bare', (value) => value], ['quoted', (value) => `"${value}"`]].map(([kind, word]) => [kind, ['-o', `UserKnownHostsFile=${word(file)}`, '-o', `GlobalKnownHostsFile=${word(file)}`]]);
  const said = [];
  for (const [kind, argv] of words) {
    said.push([kind, await ssh(['-G', '-F', 'none', ...argv, '-p', '22', 'probe-host'])]);
  }
  const resolved = said.map(([kind, one]) => ({ kind, code: one.code, user: linesOf(one.stdout).find((line) => line.startsWith('userknownhostsfile ')) ?? null }));
  check(`M13.uc the control: ssh.exe -G with the bare and with the quoted UNC word each ended with 0 and resolved ${UNC.resolved}..., not the intended path`, resolved.every((one) => one.code === 0 && one.user !== null && one.user.startsWith(`userknownhostsfile ${UNC.resolved}`) && one.user !== `userknownhostsfile ${file}`), JSON.stringify({ file, resolved }));
  return { decision: decision?.kind ?? null, resolved };
}

const UNC = off.UNC_WORDS;

/**
 * M13 in the entry's own process. `ctx`: `{ out, product, dir }` (the owned folder of the run). Answers the record of the row for the evidence: ssh.exe's version, its SHA-256, the answer of `where.exe ssh`, each case's resolved lines and the
 * count of starts of ssh.exe.
 */
async function rowM13(check, info, ctx) {
  const { starts, ssh } = recorder();
  const count = { n: 0 };
  const client = await clientCheck(check, ctx.product, count);
  const where = fs.existsSync(WHERE_EXE) ? await run(WHERE_EXE, ['ssh']) : { code: null, stdout: '', stderr: '' };
  info(`M13: where.exe ssh answered ${JSON.stringify({ code: where.code, stdout: linesOf(where.stdout).filter((line) => line !== ''), stderr: where.stderr.trim() })}`);
  const cases = [];
  if (client.client.kind === 'knows') {
    for (const one of off.M13_CASES) {
      cases.push(await caseOf(check, ctx, { letter: one.letter, user: one.user }, ssh));
    }
  } else {
    check('M13.x the three cases ran: ssh.exe knows the words of the product (the client was read)', false, JSON.stringify(client.client));
  }
  const unc = client.client.kind === 'knows' ? await uncChecks(check, ctx, ssh, client.asker, count) : null;
  const argvs = starts.map((one) => one.argv);
  const hits = argvs.flatMap((argv) => pr.devNullIn(argv));
  check('M13.z no argv of the run names /dev/null as a known-hosts file', argvs.length > 0 && hits.length === 0, JSON.stringify({ argvs: argvs.length, hits }));
  return { version: client.line, sha256: sha256Of(SSH_EXE), where: { code: where.code, stdout: linesOf(where.stdout).filter((line) => line !== '') }, cases, unc, starts: starts.length, argv: argvs };
}

module.exports = { rowM13, windowsStorage, pinPathIn, SSH_EXE };
