// Leg (s4) of the bridged `ssh` harness (change 11.1, the 72-hour slice, S4; parent §4.6): a stored script run on a Remote Bridge's server.
//
// The production road a bridged `run` takes on the server: the product's own `writeBridgedCall` and `bridgedSpawn` for the call (no hop, the
// destination pinned), the remote command `loginShellCommand(serverScriptCommand(...))` from `out/`, and the production spawner (`runBounded`,
// `sshExecRunner.ts`) with the script's body as the child's `input`, as `execOverSsh` hands it. A real `ssh` to a real `sshd -d`.
//
// The server side runs as this user with HOME at a folder of the rig (`ForceCommand`), so no file lands in the real home. The control is the
// same call with no input: the script file is then empty and nothing of the body runs, so the body travelled on standard input and nowhere else.
const fs = require('fs');
const path = require('path');
const R = require('./itestBridgedRig.cjs');
const { endChild } = require('./itestSshd.cjs');

/** A body that shows what it read on ITS standard input, that its arguments are none, and an exit status of its own. */
const BODY = 'read -r line && echo "ate: $line" || echo "own input empty"\necho "args: $#"\nexit 5\n';

/** One server for one call: `sshd -d` serves one connection. HOME is the rig's `home` (no space in it, quoted anyway). */
async function server(rig, name, home) {
  return R.sshd(rig, name, {
    hostKey: 'host_dest',
    authorized: 'authorized_dest',
    address: '127.0.0.2',
    extra: [`ForceCommand HOME='${home}' exec /bin/sh -c "$SSH_ORIGINAL_COMMAND"`],
  });
}

/** The production call to `started` with `remoteCommand`, the body given as input or not; the argv kept for a check. */
async function productionCall(rig, started, remoteCommand, input) {
  const destination = R.destinationEntry(started, { jumpHostEntityId: undefined, hostKey: R.pinOf(rig.key('host_dest')) });
  const files = rig.product.writeBridgedCall(rig.base, { destination, auth: 'key', keyPath: rig.key('dest_key'), hops: [] });
  if (!files.ok) {
    return { refused: files };
  }
  try {
    const spawn = rig.product.bridgedSpawn({ destination, keyPath: rig.key('dest_key'), auth: 'key', askpassEnv: {}, remoteCommand, files, sourceEnv: process.env, platform: process.platform });
    if (spawn === undefined) {
      return { refused: 'the argv rules refused' };
    }
    rig.spawns += 1;
    const result = await rig.product.runBounded('ssh', spawn.argv, false, { env: spawn.env, cwd: spawn.cwd, timeoutMs: 25_000, input });
    return { ...result, argv: spawn.argv };
  } finally {
    files.remove();
  }
}

/** (s4) the script runs on the server from its body on standard input; the control, with no input, runs nothing of it. */
async function legS4(rig, check) {
  const { serverScriptCommand } = require(path.join(R.OUT, 'bridgedRun.js'));
  const { loginShellCommand } = require(path.join(R.OUT, 'remoteLaunch.js'));
  const remoteCommand = loginShellCommand(serverScriptCommand('sh', '.sh'));
  const home = path.join(rig.dir, 's4-home');
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  const runFolder = path.join(home, '.creds-for-devs', 'run');

  const started = await server(rig, 's4', home);
  check('(s4) the sshd started', started.failure === undefined, started.failure);
  if (started.failure !== undefined) {
    return;
  }
  try {
    const result = await productionCall(rig, started, remoteCommand, BODY);
    const why = JSON.stringify({ refused: result.refused, exit: result.exitCode, stdout: result.stdout, stderr: result.stderr, sshd: R.tail(started) });
    check('(s4) the script ran on the server from its body on standard input: its own input empty, no arguments, its exit status kept', result.exitCode === 5 && result.stdout === 'own input empty\nargs: 0\n', why);
    check('(s4) no word of the body is on the command line of the outer ssh', result.argv !== undefined && !result.argv.join(' ').includes('own input empty'), JSON.stringify(result.argv));
    const left = fs.existsSync(runFolder) ? fs.readdirSync(runFolder) : ['(no run folder)'];
    check('(s4) the run folder on the server is empty after the run, and owner-only', left.length === 0 && (fs.statSync(runFolder).mode & 0o777) === 0o700, JSON.stringify(left));
  } finally {
    await endChild(started.sshd);
  }

  const again = await server(rig, 's4-control', home);
  check('(s4) control: the sshd started', again.failure === undefined, again.failure);
  if (again.failure !== undefined) {
    return;
  }
  try {
    const control = await productionCall(rig, again, remoteCommand, undefined);
    check('(s4) control: the same call with no input runs an empty script (exit 0, no output): the body travels on standard input only', control.exitCode === 0 && control.stdout === '', JSON.stringify({ exit: control.exitCode, stdout: control.stdout, stderr: control.stderr }));
  } finally {
    await endChild(again.sshd);
  }
}

module.exports = { legS4 };
