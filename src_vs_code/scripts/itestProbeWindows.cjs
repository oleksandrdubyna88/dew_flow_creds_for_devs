'use strict';
// Probe P5 of E3.S3 (`todo/PLAN_person_roads_pin_host_key_E3_S3_spec.md`): the Windows client from this machine, for M13.
//
// What it shows: the harness starts the `ssh.exe` of the owner's Windows from WSL (interop), with the argv as separate arguments (Node's
// `execFile`, no shell), reads its `-G` output, and tells one file from two by the control of K7 (E1.S1): a path with ` ~` after a space.
// The client alone: no login, no counterpart, nothing written on Windows. The pin path is written as the product writes it on Windows
// (`path.win32.join`) under a made-up user folder; the owner's name is never used.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { rigOf } = require('./itestPinnedRoads.cjs');

/** The Windows client, as WSL sees it. */
const SSH_EXE = '/mnt/c/Windows/System32/OpenSSH/ssh.exe';
/** What `ssh.exe -V` printed on 2026-11-23 (K7 of the E1.S1 spec, F4 of the brief). */
const EXPECTED_VERSION = 'OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2';
/**
 * The storage folder of the editor on a made-up Windows user (the user folder is two words, `probe` and `user`: a name with a space, never the
 * owner's): the product's `globalStorage` folder for an extension named `probe`. The name is joined at run time, so no line of this file reads as a
 * real user folder to the public-hygiene scan.
 */
const WINDOWS_USER = ['probe', 'user'].join(' ');
const storageOf = (below) => [String.raw`C:\Users`, WINDOWS_USER, ...below, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'probe'].join('\\');
const STORAGE = storageOf([]);
/** The control: the same, with ` ~` after a space inside the first folder below the user's (K7). */
const STORAGE_WITH_TILDE = storageOf(['x ~y']);

/** The pin file of a call, as the product writes the name on Windows: `<storage>\keys\<pid>\known_hosts-e1-<uuid>`. */
const pinPathIn = (storage) => path.win32.join(storage, 'keys', String(process.pid), `known_hosts-e1-${crypto.randomUUID()}`);

/** The lines of `-G`'s output, the carriage returns removed. */
const linesOf = (text) => text.split('\n').map((line) => line.replace(/\r$/, ''));

/** `ssh.exe -G` with the words and the fixed rest of the argv: `-F none` and a made-up host (no name is resolved by `-G`). */
const resolve = (ctx, words) => ctx.run(SSH_EXE, ['-G', '-F', 'none', ...words, '-p', '22', 'probe-host'], { timeoutMs: 10_000 });

/** P5.1: the version, and the product's own asker. Answers the client the asker read, or `undefined`. */
async function askVersion(ctx, rig) {
  const said = await ctx.run(SSH_EXE, ['-V'], { timeoutMs: 10_000 });
  const first = linesOf(`${said.stdout}${said.stderr}`).find((line) => line.startsWith('OpenSSH_'));
  ctx.check(`P5.1 ssh.exe -V (execFile, 10 s) prints ${EXPECTED_VERSION}`, said.code === 0 && first === EXPECTED_VERSION, JSON.stringify({ code: said.code, said: `${said.stdout}${said.stderr}` }));
  const client = await rig.product.pinClientAsker()({ program: SSH_EXE, env: process.env });
  ctx.check('P5.1 the product\'s asker (pinClientAsker) answered knows for ssh.exe', client.kind === 'knows', JSON.stringify(client));
  return client;
}

/** P5.2: the words of the product for a Windows pin path, resolved by `ssh.exe -G`. */
async function resolvesTheWords(ctx, rig, client) {
  const file = pinPathIn(STORAGE);
  const checked = rig.product.checkedPin(file, client);
  ctx.check('P5.2 the rule of the path accepts the Windows pin path (checkedPin)', checked.ok === true, JSON.stringify(checked));
  if (checked.ok !== true) {
    return;
  }
  const said = await resolve(ctx, rig.product.hostKeyWords(checked.pin));
  const lines = linesOf(said.stdout);
  const holds = (line) => lines.includes(line);
  ctx.check('P5.2 the -G run ends with 0', said.code === 0, JSON.stringify(said));
  ctx.check('P5.2 its lines hold stricthostkeychecking true, and both known-hosts files, each the whole path as the sole value', holds('stricthostkeychecking true') && holds(`userknownhostsfile ${file}`) && holds(`globalknownhostsfile ${file}`), JSON.stringify({ file, lines: lines.filter((line) => /known|strict/.test(line)) }));
  ctx.check('P5.2 and verifyhostkeydns false, loglevel ERROR, and no line that starts with knownhostscommand', holds('verifyhostkeydns false') && holds('loglevel ERROR') && !lines.some((line) => line.startsWith('knownhostscommand')), JSON.stringify(lines.filter((line) => /verifyhostkeydns|loglevel|knownhostscommand/.test(line))));
}

/** P5.3: K7's control, the one that tells one file from two. */
async function tellsOneFileFromTwo(ctx, rig, client) {
  const file = pinPathIn(STORAGE_WITH_TILDE);
  const checked = rig.product.checkedPin(file, client);
  ctx.check('P5.3 the rule of the path accepts the path with a space and a tilde (checkedPin)', checked.ok === true, JSON.stringify(checked));
  if (checked.ok !== true) {
    return;
  }
  const quoted = await resolve(ctx, rig.product.hostKeyWords(checked.pin));
  const lines = linesOf(quoted.stdout);
  ctx.check('P5.3 the product\'s word (quoted): exit 0 and the path whole, in both files', quoted.code === 0 && lines.includes(`userknownhostsfile ${file}`) && lines.includes(`globalknownhostsfile ${file}`), JSON.stringify({ code: quoted.code, stderr: quoted.stderr, lines: lines.filter((line) => /known/.test(line)) }));
  const bareWords = rig.product.hostKeyWords(checked.pin).map((word) => word.replace(`"${file}"`, file));
  const bare = await resolve(ctx, bareWords);
  ctx.check('P5.3 the BARE word: exit 255 and a line with tilde_expand, so the probe can tell one file from two', bare.code === 255 && /tilde_expand/.test(`${bare.stdout}${bare.stderr}`), JSON.stringify({ code: bare.code, stdout: bare.stdout, stderr: bare.stderr }));
}

async function probeWindowsClient(ctx) {
  const rig = rigOf(ctx.section, ctx.dir, ctx.out);
  const present = fs.existsSync(SSH_EXE);
  ctx.check('ssh.exe of the owner\'s Windows is on this machine, as WSL sees it', present, SSH_EXE);
  if (!present) {
    return;
  }
  const client = await askVersion(ctx, rig);
  if (client.kind === 'knows') {
    await resolvesTheWords(ctx, rig, client);
    await tellsOneFileFromTwo(ctx, rig, client);
  }
  const version = (await ctx.run(SSH_EXE, ['-V'], { timeoutMs: 10_000 }));
  const line = linesOf(`${version.stdout}${version.stderr}`).find((one) => one.startsWith('OpenSSH_')) ?? null;
  const probe = { name: ctx.name, executables: [ctx.executableOf('ssh.exe, the Windows client of the owner, read through /mnt/c', SSH_EXE, line)], configs: [] };
  await ctx.recordWithoutListener(rig, SSH_EXE, probe);
}

module.exports = { probeWindowsClient };
