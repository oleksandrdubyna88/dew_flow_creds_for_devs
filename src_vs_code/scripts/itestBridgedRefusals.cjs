// Leg (p) of `bridged-ssh-itest.cjs` (E1.6, the spec §S6.14 Y5; parent §7 *The SSH contract* (p) and §4.9's rows 3 and 4): a jump that `ssh` would drop,
// and a pin that is not one. Neither needs an `sshd`: both are refusals of pass 1, so the leg's observations are a refusal that names the
// sentence, a spawn counter that did not move, and the files of the storage folder, the pin file and the person's `known_hosts` as they were.
//
//   1. a chain whose one hop has the host `none`, no user and the default port: refused (R6), zero spawns, nothing written. `-J none` DROPS the jump
//      (OpenSSH prints no `proxyjump` line for it), so a call that ran it would have gone straight to the destination, with the hop's key never used.
//   2. a RECORD of what this client does with the word: `ssh -G -J none` and `ssh -G -J u@none`, the first with no `proxyjump` line on the clients
//      the spec was measured on (10.2p1); the other images print what they print and the line goes into the spec's As-built.
//   3. a key destination whose `hostKey` does not parse (R11): zero spawns, nothing written, `bridges/known_hosts` byte for byte as it was.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');
const R = require('./itestBridgedRig.cjs');

/** Every file under `dir` with its size, sorted: what a call that wrote anything would have changed. */
function listing(dir) {
  const walk = (at) => (fs.existsSync(at) ? fs.readdirSync(at, { withFileTypes: true }).flatMap((item) => (item.isDirectory() ? walk(path.join(at, item.name)) : [`${path.join(at, item.name)}:${fs.statSync(path.join(at, item.name)).size}`])) : []);
  return walk(dir).sort();
}

/** The rig's storage folder, the pin file and the person's own `known_hosts`, as one string to compare. */
function disk(rig) {
  const pins = path.join(rig.storageDir, 'bridges', 'known_hosts');
  return JSON.stringify([listing(rig.storageDir), fs.existsSync(pins) ? R.sha(pins) : 'absent', R.sha(rig.personFile)]);
}

/** `ssh -G -J <jump>` to a host that is not the jump: the `proxyjump` lines it prints, or why it printed none. */
function proxyJumpOf(jump) {
  try {
    const text = execFileSync('ssh', ['-G', '-F', '/dev/null', '-J', jump, '127.0.0.2'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); // NOSONAR: the PATH's ssh is the tool under test
    return { lines: text.split('\n').filter((line) => line.startsWith('proxyjump ')) };
  } catch (error) {
    return { failed: String(error.stderr ?? error).trim().slice(0, 160), lines: [] };
  }
}

/** (p) a hop named `none` and a pin that does not parse: refused before anything is written or started. */
async function legP(rig, check) {
  const hop = R.hopEntry({ port: 22 }, { host: 'none', user: undefined });
  const before = disk(rig);
  let spawns = rig.spawns;
  const dropped = await R.production(rig, { destination: R.destinationEntry({ port: 22 }), keyPath: rig.key('dest_key'), hops: [{ entity: hop, credential: R.storedKeyOf(rig, 'hop_key') }] });
  check('(p) a chain whose one hop has the host none, no user and port 22 is refused with the host sentence (R6)', dropped.refused !== undefined && dropped.refused.reason.includes('the host of the jump host "the hop"') && dropped.refused.reason.includes('the word "none"'), JSON.stringify(dropped.refused ?? dropped.argv));
  check('(p) and it spent no spawn and wrote nothing (the storage folder, the pin file and the person\'s known_hosts are as they were)', rig.spawns === spawns && disk(rig) === before, JSON.stringify([rig.spawns - spawns, before, disk(rig)]));
  for (const jump of ['none', 'u@none']) {
    const answer = proxyJumpOf(jump);
    console.log(`record (p) ssh -G -J ${jump}: ${answer.failed === undefined ? (answer.lines.length === 0 ? 'NO proxyjump line (the jump is dropped)' : `proxyjump line(s) ${JSON.stringify(answer.lines)} (the jump is kept)`) : `ssh failed: ${JSON.stringify(answer.failed)}`}`);
  }
  spawns = rig.spawns;
  const unreadable = await R.production(rig, { destination: R.destinationEntry({ port: 22 }, { jumpHostEntityId: undefined, hostKey: 'garbage' }), keyPath: rig.key('dest_key') });
  check('(p) a key destination whose pin does not parse is refused with the host key sentence (R11)', unreadable.refused !== undefined && unreadable.refused.reason.includes('cannot be read as a host key'), JSON.stringify(unreadable.refused ?? unreadable.argv));
  check('(p) and it spent no spawn and wrote nothing, bridges/known_hosts byte for byte as it was', rig.spawns === spawns && disk(rig) === before, JSON.stringify([rig.spawns - spawns, before, disk(rig)]));
}

module.exports = { legP };
