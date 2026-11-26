'use strict';
// Probe P4 of E3.S3 (`todo/PLAN_person_roads_pin_host_key_E3_S3_spec.md`): a handed config that the nested client of a jump host reads too (M5 f).
//
// What it shows: the nested `ssh` that a `ProxyJump` starts reads the config that the harness handed (the shim's `-F`), not the person's
// files: it refuses the jump host by the known-hosts file that only that config names, and passes when that file holds the right key.
// Two counterparts: D, the destination (K1), and J, the jump host (a third host key, made here). The outer client carries the pin words of D
// (the product's), which do not reach the nested client: the jump host's known-hosts file is named by the handed config alone.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rigOf, installShim, makeKeys, recordedStarts } = require('./itestPinnedRoads.cjs');
const { tool } = require('./itestNoSharing.cjs');

const me = os.userInfo().username;
const VERIFY_FAILED = 'Host key verification failed.';
/** A line of an sshd log that only a client past the key check can cause. */
const AUTH_ATTEMPT = /Accepted |Failed |Postponed |Invalid user|authenticating user/;

/** `text` as a regular expression that matches it literally. */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** The handed config: the specific blocks first (the first value of a keyword wins), then `Host *` with the two lines of `writeClientConfig`. */
function writeConfig(rig, jump, jumpHosts) {
  const lines = [
    'Host jump',
    '  HostName 127.0.0.1',
    `  Port ${jump.port}`,
    `  User ${me}`,
    `  IdentityFile ${rig.userKey}`,
    '  IdentitiesOnly yes',
    '  BatchMode yes',
    '  StrictHostKeyChecking yes',
    `  UserKnownHostsFile ${jumpHosts}`,
    '  GlobalKnownHostsFile /dev/null',
    '',
    'Host 127.0.0.1',
    '  ProxyJump jump',
    '',
    'Host *',
    '  UserKnownHostsFile /dev/null',
    '  GlobalKnownHostsFile /dev/null',
    '',
  ];
  fs.writeFileSync(rig.clientConfig, lines.join('\n'));
  return lines.join('\n');
}

/** One outer login through the shim to D, with the pin words of D's key: what it ended with, said, and what each log grew by. */
async function outerLogin(ctx, rig, dest, jump) {
  const logs = { dest: dest.sshd.stderr.length, jump: jump.sshd.stderr.length };
  const pin = await ctx.pinFor(rig, 'dest', dest.port, rig.k1);
  const done = await ctx.run(path.join(rig.shimDir, 'ssh'), ctx.clientArgv(rig, rig.product.hostKeyWords(pin), dest.port, 'true'), { env: rig.env });
  await ctx.settle(600);
  return { done, destLog: dest.sshd.stderr.slice(logs.dest), jumpLog: jump.sshd.stderr.slice(logs.jump) };
}

/** The host key line of `keyFile` for `[127.0.0.1]:<port>`, as the product writes it. */
const lineOf = (rig, port, keyFile) => rig.product.knownHostsLine('127.0.0.1', port, rig.product.parseHostKey(fs.readFileSync(`${keyFile}.pub`, 'utf8')));

async function probeJumpConfig(ctx) {
  const rig = rigOf(ctx.section, ctx.dir, ctx.out);
  const kj = path.join(ctx.dir, 'kj_key');
  const jumpHosts = path.join(ctx.dir, 'jump_known_hosts');
  const keys = (await makeKeys(ctx.check, rig)) && (await tool('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', kj])) === undefined;
  ctx.check('the third host key, J\'s own, was generated', keys);
  if (!keys) {
    return;
  }
  const real = installShim(rig);
  ctx.check('the shim resolved the real ssh outside its own folder', real !== undefined, process.env.PATH);
  const dest = real === undefined ? undefined : await ctx.serve(rig, 'k1', rig.k1);
  const jump = dest === undefined ? undefined : await ctx.serve(rig, 'kj', kj);
  if (jump === undefined) {
    return;
  }
  const config = writeConfig(rig, jump, jumpHosts);
  const texts = [];
  // P4.1 refused: the file holds K2's line for J's address; J presents its own key.
  fs.writeFileSync(jumpHosts, lineOf(rig, jump.port, rig.k2));
  texts.push({ leg: 'P4.1 refused', jumpKnownHosts: fs.readFileSync(jumpHosts, 'utf8') });
  const refused = await outerLogin(ctx, rig, dest, jump);
  const offending = new RegExp(String.raw`^Offending \S+ key in ${literal(jumpHosts)}:\d+\r?$`, 'm');
  ctx.check('P4.1 refused: the outer ends with 255', refused.done.code === 255, JSON.stringify(refused.done));
  ctx.check(`P4.1 refused: its stderr holds "${VERIFY_FAILED}" and the line "Offending <type> key in <jump_known_hosts>:<n>" that names the file only the handed config names`, refused.done.stderr.split(/\r?\n/).includes(VERIFY_FAILED) && offending.test(refused.done.stderr), JSON.stringify(refused.done.stderr));
  ctx.check('P4.1 refused: J logged a connection and no authentication attempt', ctx.connections(refused.jumpLog, jump.port) >= 1 && !AUTH_ATTEMPT.test(refused.jumpLog), refused.jumpLog.trim().split('\n').slice(-12).join('\n'));
  ctx.check('P4.1 refused: D logged no connection', ctx.connections(refused.destLog, dest.port) === 0 && !AUTH_ATTEMPT.test(refused.destLog), refused.destLog.trim());
  // P4.2 the control, accepted: the file holds J's own line.
  fs.writeFileSync(jumpHosts, lineOf(rig, jump.port, kj));
  texts.push({ leg: 'P4.2 accepted', jumpKnownHosts: fs.readFileSync(jumpHosts, 'utf8') });
  const accepted = await outerLogin(ctx, rig, dest, jump);
  ctx.check('P4.2 the control, accepted: the outer ends with 0', accepted.done.code === 0, JSON.stringify(accepted.done));
  ctx.check('P4.2 the control, accepted: J logged one Accepted publickey and D logged one Accepted publickey', ctx.accepted(accepted.jumpLog) === 1 && ctx.accepted(accepted.destLog) === 1, JSON.stringify({ jump: accepted.jumpLog.trim().split('\n').slice(-8), dest: accepted.destLog.trim().split('\n').slice(-8) }));
  const starts = recordedStarts(rig);
  const nested = starts.filter((one) => one.argv.includes('-W'));
  ctx.info(`P4.3 the shim recorded ${starts.length} starts of ssh over both legs; ${nested.length} of them with -W (the nested client): ${JSON.stringify(nested.map((one) => one.argv))}`);
  await ctx.stopServing(rig, dest, 'D (K1)');
  await ctx.stopServing(rig, jump, 'J');
  const probe = {
    name: ctx.name,
    executables: [],
    configs: [{ file: 'client_config (handed, P4)', sha256: ctx.sha256Of(rig.clientConfig), text: config }, ...texts.map((one) => ({ file: `jump_known_hosts, ${one.leg}`, sha256: crypto.createHash('sha256').update(one.jumpKnownHosts).digest('hex'), text: one.jumpKnownHosts }))],
  };
  await ctx.recordWithListener(rig, real, probe);
}

module.exports = { probeJumpConfig };
