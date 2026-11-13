// The trust legs of `bridged-ssh-itest.cjs` (E1.6, parent §7 *The SSH contract*, legs (f), (h), (i) and (n)): who a leg trusts as the host, what a changed
// host key does, what the person's own files are never allowed to do, and that no default identity is offered. A file of its own so the harness
// stays under the 800-line limit. Same conventions: a production leg is the product's own `writeBridgedCall` and `bridgedSpawn`, a control is
// written by hand, and a leg that says "this does not happen" has a control in which it does. `sshd -d` serves ONE connection, so a leg that
// calls twice starts its sshd twice; a SECOND sshd with another host key on the address and port of the first is how "the host key changed" is made.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('node:child_process');
const R = require('./itestBridgedRig.cjs');
const { endChild } = require('./itestSshd.cjs');

const CHANGED = /REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/;
const noDest = (started, extra = {}) => R.destinationEntry(started, { jumpHostEntityId: undefined, ...extra });
const knownHostsOf = (rig) => path.join(rig.storageDir, 'bridges', 'known_hosts');
const ownLines = (rig) => (fs.existsSync(knownHostsOf(rig)) ? fs.readFileSync(knownHostsOf(rig), 'utf8').split('\n').filter((l) => l !== '') : []);

/** Waits for a one-connection `sshd -d` to end by itself, then starts another on the same address and port with ANOTHER host key. */
async function replaced(rig, name, old, hostKey, address) {
  await R.within(old.sshd.done, 5000);
  return R.sshd(rig, name, { hostKey, authorized: 'authorized_dest', address, port: old.port });
}

/** (f) first contact: recorded outside the keys folder, kept after a purge, enforced the next time; a password goes only to a pinned host. */
async function legF(rig, check) {
  const first = await R.pair(rig, 'f1', {});
  let second;
  try {
    const before = ownLines(rig).length;
    const one = await R.production(rig, { destination: noDest(first.destination), keyPath: rig.key('dest_key') });
    check('(f): the first call of the leg logs in (so a later refusal is not a rig that cannot connect)', one.refused === undefined && one.code === 0, JSON.stringify(one));
    check('(f): one line was added to bridges/known_hosts and the journal says so once (J1)', ownLines(rig).length === before + 1 && one.first.filter((s) => s.includes('first contact through a Remote Bridge')).length === 1, JSON.stringify([ownLines(rig), one.first]));
    rig.product.purge(rig.storageDir);
    second = await replaced(rig, 'f2', first.destination, 'host_other', '127.0.0.2');
    check('(f): a second sshd with another host key on the same address and port started', second.failure === undefined, second.failure);
    const next = await R.production(rig, { destination: noDest(second), keyPath: rig.key('dest_key') });
    check('(f): after purgeMaterializedKeys the next call fails on that leg: the record outlived the keys folder', next.refused === undefined && next.code !== 0 && CHANGED.test(next.stderr), JSON.stringify([next.code, next.stderr]));
  } finally {
    await first.close();
    if (second !== undefined && second.sshd !== undefined) {
      await endChild(second.sshd);
    }
  }
  const spawns = rig.spawns;
  const password = await R.production(rig, { destination: noDest({ port: 22 }), auth: 'askpass', keyPath: undefined });
  check('(f): an unpinned password destination is refused (R5) with zero spawns', password.refused !== undefined && password.refused.reason.includes('pins no host key') && rig.spawns === spawns, JSON.stringify(password.refused));
  const wrongHop = await R.pair(rig, 'f3', { hop: { hostKey: 'host_other' } });
  try {
    const hop = R.hopEntry(wrongHop.hop, { hostKey: R.pinOf(rig.key('host_hop')) });
    const result = await R.production(rig, { destination: R.destinationEntry(wrongHop.destination), keyPath: rig.key('dest_key'), hops: [{ entity: hop, credential: R.storedKeyOf(rig, 'hop_key') }] });
    check('(f): a pinned hop whose key changed fails on that leg', result.refused === undefined && result.code !== 0 && CHANGED.test(result.stderr), JSON.stringify([result.code, result.stderr]));
  } finally {
    await wrongHop.close();
  }
  await readOnlyLeg(rig, check);
  check('(f): the person\'s own known_hosts is byte for byte the same', R.sha(rig.personFile) === rig.personHash);
}

/** `bridges/known_hosts` read-only: the call is refused (R7) before any spawn, because an `accept-new` that cannot write goes on and records nothing. */
async function readOnlyLeg(rig, check) {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    console.log('skip  (f) read-only bridges/known_hosts — running as root, which can write a 0444 file');
    return;
  }
  fs.mkdirSync(path.dirname(knownHostsOf(rig)), { recursive: true });
  fs.appendFileSync(knownHostsOf(rig), '');
  fs.chmodSync(knownHostsOf(rig), 0o444);
  const spawns = rig.spawns;
  try {
    const result = await R.production(rig, { destination: noDest({ port: 22 }), keyPath: rig.key('dest_key') });
    check('(f): bridges/known_hosts made read-only: the call is refused (R7) with zero spawns', result.refused !== undefined && result.refused.code === 'internal' && rig.spawns === spawns, JSON.stringify(result.refused));
    const started = await R.sshd(rig, 'f-record', { hostKey: 'host_dest', authorized: 'authorized_dest', address: '127.0.0.2' });
    const readOnly = rig.key('read-only-known-hosts');
    fs.writeFileSync(readOnly, '', { mode: 0o444 });
    const done = await R.control(rig, ['-F', '/dev/null', '-o', 'StrictHostKeyChecking=accept-new', '-o', `UserKnownHostsFile=${readOnly}`, '-o', 'BatchMode=yes', '-i', rig.key('dest_key'), '-p', String(started.port), `${R.ME}@127.0.0.2`, 'true']);
    console.log(`record (f): a hand-written accept-new call with a read-only known-hosts file ${done.code === 0 ? 'LOGGED IN' : `failed (${done.code})`}, and ${fs.statSync(readOnly).size > 0 ? 'wrote' : 'wrote no'} line`);
    await endChild(started.sshd);
  } finally {
    fs.chmodSync(knownHostsOf(rig), 0o644);
  }
}

/** (h) a pin file at a path with a space; no `-o UserKnownHostsFile=`; a changed key refused for a destination and for a hop; a key at a path with a space. */
async function legH(rig, check) {
  const lone = await R.pair(rig, 'h-control', {});
  try {
    fs.writeFileSync(rig.control, 'Host *\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n  LogLevel ERROR\n');
    const done = await R.control(rig, ['-F', rig.control, '-i', rig.key('does-not-exist'), '-o', 'BatchMode=yes', '-p', String(lone.destination.port), `${R.ME}@127.0.0.2`, 'true']);
    check('(h) control: with the key file gone the login is Permission denied', done.code === 255 && /Permission denied/.test(done.stderr), JSON.stringify(done));
  } finally {
    await lone.close();
  }
  const spaced = path.join(rig.home, 'key with space');
  fs.copyFileSync(rig.key('dest_key'), spaced);
  fs.chmodSync(spaced, 0o600);
  const one = await R.pair(rig, 'h1', {});
  let again;
  try {
    const pinned = noDest(one.destination, { hostKey: R.pinOf(rig.key('host_dest')) });
    const result = await R.production(rig, { destination: pinned, keyPath: spaced });
    check('(h): a pinned destination whose pin file path holds a space logs in, with a key at a path with a space', result.refused === undefined && result.code === 0, JSON.stringify([result.code, result.stderr]));
    check('(h): and the argv has no UserKnownHostsFile= word', result.argv !== undefined && !result.argv.some((word) => word.startsWith('UserKnownHostsFile=')), JSON.stringify(result.argv));
    again = await replaced(rig, 'h2', one.destination, 'host_other', '127.0.0.2');
    const changed = await R.production(rig, { destination: noDest(again, { hostKey: R.pinOf(rig.key('host_dest')) }), keyPath: spaced });
    check('(h): another host key on the same address is refused for the destination', changed.refused === undefined && changed.code !== 0 && CHANGED.test(changed.stderr), JSON.stringify([changed.code, changed.stderr]));
  } finally {
    await one.close();
    if (again !== undefined && again.sshd !== undefined) {
      await endChild(again.sshd);
    }
  }
  await hopRefused(rig, check);
}

async function hopRefused(rig, check) {
  const hopOne = await R.pair(rig, 'h3', {});
  let hopAgain;
  try {
    const hop = R.hopEntry(hopOne.hop, { hostKey: R.pinOf(rig.key('host_hop')) });
    const legs = (entity) => [{ entity, credential: R.storedKeyOf(rig, 'hop_key') }];
    const ok = await R.production(rig, { destination: R.destinationEntry(hopOne.destination), keyPath: rig.key('dest_key'), hops: legs(hop) });
    check('(h): a pinned hop logs in', ok.refused === undefined && ok.code === 0, JSON.stringify([ok.code, ok.stderr]));
    hopAgain = await replaced(rig, 'h4', hopOne.hop, 'host_other', '127.0.0.1');
    const changed = await R.production(rig, { destination: R.destinationEntry(hopOne.destination), keyPath: rig.key('dest_key'), hops: legs(R.hopEntry(hopAgain, { hostKey: R.pinOf(rig.key('host_hop')) })) });
    check('(h): another host key on the hop\'s address is refused for the hop', changed.refused === undefined && changed.code !== 0 && CHANGED.test(changed.stderr), JSON.stringify([changed.code, changed.stderr]));
  } finally {
    await hopOne.close();
    if (hopAgain !== undefined && hopAgain.sshd !== undefined) {
      await endChild(hopAgain.sshd);
    }
  }
}

const sudoOk = () => {
  try {
    execFileSync('sudo', ['-n', 'true'], { stdio: 'ignore' }); // NOSONAR: the CI runner's own sudo
    return true;
  } catch {
    return false;
  }
};

/** (i) CI only: a hostile system ssh_config. Control: it works when read. Production: it is never read (`-F c.conf` replaces the system file too). */
async function legI(rig, check) {
  if (process.env.CI !== 'true') {
    console.log('skip  (i) the system ssh_config legs — they write /etc/ssh/ssh_config, so they run on the CI runner only');
    return;
  }
  const system = '/etc/ssh/ssh_config';
  const backup = rig.key('ssh_config.backup');
  check('(i) the runner has a passwordless sudo', sudoOk());
  fs.copyFileSync(system, backup);
  const hash = R.sha(system);
  const hostile = `\nHost *\n  ForwardAgent yes\n  RemoteForward 2299 127.0.0.1:22\n  IdentityFile ${rig.key('dest_key')}\n`;
  try {
    execFileSync('sudo', ['-n', 'tee', '-a', system], { input: hostile, stdio: ['pipe', 'ignore', 'ignore'] }); // NOSONAR: CI runner
    const control = await R.pair(rig, 'i-control', {});
    try {
      const done = await R.control(rig, ['-v', '-F', system, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-p', String(control.destination.port), `${R.ME}@127.0.0.2`, 'true']);
      check('(i) control: under -F /etc/ssh/ssh_config the hostile IdentityFile logs in and -v shows the forwarding request', done.code === 0 && /remote forward|forwarded to local/i.test(done.stderr), JSON.stringify([done.code, done.stderr.slice(-400)]));
    } finally {
      await control.close();
    }
    const production = await R.pair(rig, 'i', {});
    try {
      const result = await R.production(rig, { destination: noDest(production.destination), keyPath: rig.key('other_key'), extraArgs: ['-v'] });
      check('(i): production: Permission denied for that key, and -v shows no forwarding request', result.refused === undefined && result.code === 255 && !/remote forward|forwarded to local|agent forwarding/i.test(result.stderr), JSON.stringify([result.code, result.stderr.slice(-400)]));
    } finally {
      await production.close();
    }
  } finally {
    execFileSync('sudo', ['-n', 'cp', backup, system], { stdio: 'ignore' }); // NOSONAR: CI runner
    check('(i) the system file was put back, byte for byte', R.sha(system) === hash);
  }
}

/** (n) CI only: no default identity is offered to a password destination, whatever `~/.ssh` of the account holds. */
async function legN(rig, check) {
  const defaultKey = path.join(os.homedir(), '.ssh', 'id_ed25519');
  if (process.env.CI !== 'true') {
    console.log('skip  (n) the default-identity leg — it writes the account\'s own ~/.ssh/id_ed25519, so it runs on the CI runner only');
    return;
  }
  if (fs.existsSync(defaultKey) || fs.existsSync(`${defaultKey}.pub`)) {
    check('(n) the runner has no ~/.ssh/id_ed25519 of its own (the leg writes nothing over one)', false, defaultKey);
    return;
  }
  fs.mkdirSync(path.dirname(defaultKey), { recursive: true, mode: 0o700 });
  try {
    check('(n) the default key was generated', (await R.keygen(defaultKey)) === undefined);
    fs.writeFileSync(rig.key('authorized_n'), `${fs.readFileSync(`${defaultKey}.pub`, 'utf8')}${fs.readFileSync(rig.key('dest_key.pub'), 'utf8')}`);
    const options = { destination: { authorized: 'authorized_n', first: ['PasswordAuthentication yes', 'KbdInteractiveAuthentication no'] } };
    const control = await R.pair(rig, 'n-control', options);
    try {
      const empty = rig.key('empty-config');
      fs.writeFileSync(empty, '');
      const done = await R.control(rig, ['-F', empty, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-p', String(control.destination.port), `${R.ME}@127.0.0.2`, 'true']);
      check('(n) control: under an empty config the default key logs in', done.code === 0, JSON.stringify(done));
    } finally {
      await control.close();
    }
    const production = await R.pair(rig, 'n', options);
    try {
      fs.rmSync(rig.key('askpass.log'), { force: true });
      const destination = noDest(production.destination, { hostKey: R.pinOf(rig.key('host_dest')) });
      const env = { SSH_ASKPASS: rig.key('askpass.sh'), SSH_ASKPASS_REQUIRE: 'force', CREDS_SSH_PASSWORD: 'not-the-password', DISPLAY: ':0' };
      const result = await R.production(rig, { destination, auth: 'askpass', keyPath: undefined, askpassEnv: env });
      check('(n): a pinned password destination is Permission denied, and sshd saw no public-key attempt', result.refused === undefined && result.code === 255 && !/method publickey/.test(production.destination.sshd.stderr), R.tail(production.destination));
      console.log(`record (P3) (n): the call's stderr, to see whether the sentinel's path is in it: ${JSON.stringify(result.stderr ?? '')}`);
    } finally {
      await production.close();
    }
  } finally {
    fs.rmSync(defaultKey, { force: true });
    fs.rmSync(`${defaultKey}.pub`, { force: true });
  }
}

async function trustLegs(rig, check) {
  for (const leg of [legF, legH, legI, legN]) {
    await leg(rig, check);
  }
  check('the person\'s own known_hosts is byte for byte the same after every leg of the harness', R.sha(rig.personFile) === rig.personHash);
}

module.exports = { trustLegs };
