// Leg (q) of `bridged-ssh-itest.cjs` (E1.6, the spec §S6.14 Y3; parent §7 *The SSH contract* (q) and §4.9's row 5): the client check, observed on a real client.
// It needs no `sshd`. The harness calls the product's own check from `out/` (`bridgedSshClientCheck`, the very function `sshUseActions` wires as
// `SshUseDeps.bridgedClient`), with the storage folder of the rig, and the program NAMED to it, as the road names it:
//
//   - the real `ssh -V` on every CI image: the verdict is ok and the version it read is PRINTED (the floor is the lowest of those);
//   - a stand-in program, a shell script of the rig, that prints `OpenSSH_8.6p1` on stderr and exits 0: R13, and the stand-in ran once;
//   - a stand-in that exits 255 and prints nothing: R12, and the stand-in ran once.
//
// "No other spawn" is a count, not a word: every one of the three programs logs each start to a file of its own, the real one through an `ssh` of this
// rig's `bin` folder that logs its arguments and then runs the real client (the check's child is started with the PATH it is given). After the two
// stand-ins the real client's log still holds the one line it held, so neither verdict started an `ssh`; the harness's own counter did not move either;
// and the folder the check made for each of the three is gone. The control is the first of the three, which shows this rig sees an `ssh` start.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');
const R = require('./itestBridgedRig.cjs');

const linesOf = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter((line) => line !== '') : []);

/** A stand-in that logs its arguments to `log`, then answers like the text says. */
function standIn(file, log, body) {
  fs.writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\n${body}\n`, { mode: 0o755 });
}

/** Every file under `dir`, sorted: the folder the check made would be in it while it ran, and must not be after. */
function names(dir) {
  const walk = (at) => (fs.existsSync(at) ? fs.readdirSync(at, { withFileTypes: true }).flatMap((item) => (item.isDirectory() ? [path.join(at, item.name), ...walk(path.join(at, item.name))] : [path.join(at, item.name)])) : []);
  return walk(dir).sort();
}

/** (q) the client check on the real `ssh -V`, and on two stand-ins. */
async function legQ(rig, check) {
  const { bridgedSshClientCheck } = require(path.join(R.OUT, 'bridgedSshClient.js'));
  const bin = rig.key('q-bin');
  fs.mkdirSync(bin, { recursive: true });
  const real = execFileSync('sh', ['-c', 'command -v ssh'], { encoding: 'utf8' }).trim(); // NOSONAR: the PATH's ssh is the tool under test
  const logs = { ssh: rig.key('q-ssh.log'), below: rig.key('q-below.log'), dead: rig.key('q-dead.log') };
  for (const log of Object.values(logs)) {
    fs.rmSync(log, { force: true });
  }
  fs.writeFileSync(path.join(bin, 'ssh'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${logs.ssh}"\nexec "${real}" "$@"\n`, { mode: 0o755 });
  standIn(rig.key('q-below.sh'), logs.below, "printf 'OpenSSH_8.6p1, OpenSSL 1.1.1k  25 Mar 2021\\n' >&2");
  standIn(rig.key('q-dead.sh'), logs.dead, 'exit 255');
  const notes = [];
  const askedWith = (program) => bridgedSshClientCheck({ storageDir: rig.storageDir, source: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` }, note: (message) => notes.push(message) })({ program });
  const before = JSON.stringify(names(rig.storageDir));
  const spawns = rig.spawns;

  const good = await askedWith('ssh');
  console.log(`record (q) the real ssh -V through the client check: ${good.ok ? `ok, version ${good.version}` : `not ok: ${good.sentence}`}`);
  check('(q) the real ssh -V is read through the check and the verdict is ok (the version is printed above)', good.ok && /^\d+\.\d+$/.test(good.version), JSON.stringify(good));
  check('(q) control: that check started the real ssh once, with -V and nothing else (this rig sees an ssh start)', JSON.stringify(linesOf(logs.ssh)) === JSON.stringify(['-V']), JSON.stringify(linesOf(logs.ssh)));

  const below = await askedWith(rig.key('q-below.sh'));
  check('(q) a stand-in that prints OpenSSH_8.6p1 is refused as below the floor (R13), naming the token', !below.ok && below.sentence.includes('The ssh on this computer answered OpenSSH_8.6.') && below.sentence.includes('needs OpenSSH 8.9 or newer') && !below.sentence.includes('OpenSSL'), JSON.stringify(below));
  check('(q) and it was started once, with -V', JSON.stringify(linesOf(logs.below)) === JSON.stringify(['-V']), JSON.stringify(linesOf(logs.below)));

  const dead = await askedWith(rig.key('q-dead.sh'));
  check('(q) a stand-in that exits 255 and prints nothing is refused as no version (R12), naming the exit code', !dead.ok && dead.sentence.includes('did not answer its version') && dead.sentence.includes('(exit 255)'), JSON.stringify(dead));
  check('(q) and it was started once, with -V', JSON.stringify(linesOf(logs.dead)) === JSON.stringify(['-V']), JSON.stringify(linesOf(logs.dead)));

  check('(q) no other spawn: the real client still holds its one start, and the harness started no ssh', linesOf(logs.ssh).length === 1 && rig.spawns === spawns, JSON.stringify([linesOf(logs.ssh), rig.spawns - spawns]));
  check('(q) the folder of each check is gone, and no note says one could not be removed', JSON.stringify(names(rig.storageDir)) === before && notes.length === 0, JSON.stringify([notes, names(rig.storageDir)]));
}

module.exports = { legQ };
