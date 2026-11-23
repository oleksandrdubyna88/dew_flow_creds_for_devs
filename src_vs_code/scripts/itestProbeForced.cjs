'use strict';
// Probe P6 of E3.S3 (`todo/PLAN_person_roads_pin_host_key_E3_S3_spec.md`): a forced command that writes the verification line to its stderr
// and then runs the command it was asked for, to 0 (M5 h).
//
// What it shows: a counterpart whose login is accepted, whose remote side writes `Host key verification failed.` to its stderr and then
// runs the command that the client asked for, so that the run ends with that command's exit code, 0. Three counterparts, one host key (K1),
// each with its own port, every `sshd` line through the `extra` of the serving launcher (the lead's answer Q4):
//   K1   `ForceCommand zero.sh`: the line, then `exec "$SHELL" -c "$SSH_ORIGINAL_COMMAND"`;
//   K1b  (control of M5 g) `ForceCommand fail.sh`: the same line, then `exit 255`;
//   K1c  (reference) no extra line: what the asked command prints when nothing forces anything.
const fs = require('node:fs');
const path = require('node:path');
const { rigOf, installShim, writeClientConfig, makeKeys } = require('./itestPinnedRoads.cjs');

const VERIFY_FAILED = 'Host key verification failed.';

/** The two forced commands, written once into the probe's folder; answers their paths. */
function writeScripts(dir) {
  const folder = path.join(dir, 'forced');
  fs.mkdirSync(folder);
  const say = `printf '%s\\n' '${VERIFY_FAILED}' >&2`;
  const zero = path.join(folder, 'zero.sh');
  const fail = path.join(folder, 'fail.sh');
  fs.writeFileSync(zero, ['#!/bin/sh', say, 'exec "$SHELL" -c "$SSH_ORIGINAL_COMMAND"', ''].join('\n'), { mode: 0o700 });
  fs.writeFileSync(fail, ['#!/bin/sh', say, 'exit 255', ''].join('\n'), { mode: 0o700 });
  return { zero, fail };
}

/** One login through the shim with the pin words of `server`: the product's `probeCommand()`, and what the run left. */
async function loginTo(ctx, rig, name, server) {
  const pin = await ctx.pinFor(rig, name, server.port, rig.k1);
  const argv = ctx.clientArgv(rig, rig.product.hostKeyWords(pin), server.port, rig.product.probeCommand());
  const done = await ctx.run(path.join(rig.shimDir, 'ssh'), argv, { env: rig.env });
  await ctx.settle();
  return { pin, done, lines: done.stderr.split(/\r?\n/) };
}

async function probeForcedZero(ctx) {
  const rig = rigOf(ctx.section, ctx.dir, ctx.out);
  if (!(await makeKeys(ctx.check, rig))) {
    return;
  }
  writeClientConfig(rig);
  const real = installShim(rig);
  ctx.check('the shim resolved the real ssh outside its own folder', real !== undefined, process.env.PATH);
  const scripts = writeScripts(ctx.dir);
  const extras = { k1: [`ForceCommand ${scripts.zero}`], k1b: [`ForceCommand ${scripts.fail}`], k1c: [] };
  const servers = {};
  for (const [name, extra] of Object.entries(extras)) {
    servers[name] = real === undefined ? undefined : await ctx.serve(rig, name, rig.k1, extra);
  }
  if (real === undefined || Object.values(servers).includes(undefined)) {
    return;
  }
  const zero = await loginTo(ctx, rig, 'k1', servers.k1);
  ctx.check('P6.1 probeCommand() through the shim, K1 forcing zero.sh: exit code 0', zero.done.code === 0, JSON.stringify(zero.done));
  ctx.check(`P6.1 its stderr holds a line that is exactly "${VERIFY_FAILED}"`, zero.lines.includes(VERIFY_FAILED), JSON.stringify(zero.done.stderr));
  ctx.check('P6.1 K1 logged one Accepted publickey', ctx.accepted(servers.k1.sshd.stderr) === 1, servers.k1.sshd.stderr.trim().split('\n').slice(-12).join('\n'));
  const plain = await loginTo(ctx, rig, 'k1c', servers.k1c);
  const facts = (login) => JSON.stringify(rig.product.interpretProbe(login.done.stdout));
  ctx.check('P6.2 the stdout read by interpretProbe equals that of the same command against a counterpart with no extra line, and is whole: the command that was asked for ran', plain.done.code === 0 && facts(zero) === facts(plain) && zero.done.stdout === plain.done.stdout && rig.product.interpretProbe(zero.done.stdout).answered, JSON.stringify({ forced: zero.done.stdout, plain: plain.done.stdout }));
  ctx.check('P6.2 and the reference counterpart wrote no verification line', !plain.lines.includes(VERIFY_FAILED), JSON.stringify(plain.done.stderr));
  const fail = await loginTo(ctx, rig, 'k1b', servers.k1b);
  ctx.check('P6.3 the control K1b forcing fail.sh: exit code 255', fail.done.code === 255, JSON.stringify(fail.done));
  ctx.check(`P6.3 its stderr holds the same line, "${VERIFY_FAILED}"`, fail.lines.includes(VERIFY_FAILED), JSON.stringify(fail.done.stderr));
  ctx.check('P6.3 K1b logged one Accepted publickey', ctx.accepted(servers.k1b.sshd.stderr) === 1, servers.k1b.sshd.stderr.trim().split('\n').slice(-12).join('\n'));
  const told = (login, code) => JSON.stringify(rig.product.hostKeyTold(login.pin, login.done.stderr, 'box', code) ?? null);
  ctx.info(`P6.4 hostKeyTold(pin, the stderr of K1, box, 0) = ${told(zero, 0)}`);
  ctx.info(`P6.4 hostKeyTold(pin, the stderr of K1, box, 255) = ${told(zero, 255)}`);
  ctx.info(`P6.4 hostKeyTold(pin, the stderr of K1b, box, 255) = ${told(fail, 255)}`);
  for (const [name, server] of Object.entries(servers)) {
    await ctx.stopServing(rig, server, name.toUpperCase());
  }
  const probe = {
    name: ctx.name,
    executables: [ctx.executableOf('zero.sh, the forced command that ends with the asked command', scripts.zero), ctx.executableOf('fail.sh, the control that ends with 255', scripts.fail)],
    configs: Object.entries(extras).map(([name, extra]) => ({ file: `extra of ${name}`, sha256: ctx.sha256Of(path.join(ctx.dir, name, 'sshd_config')), text: extra.join('\n') })),
  };
  await ctx.recordWithListener(rig, real, probe);
}

module.exports = { probeForcedZero };
