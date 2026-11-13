// Integration test of the bridged `ssh:exec` (E1.6, parent §4.9 and §7 *The SSH contract*, legs (a)-(k) and (n); the trust legs (f), (h), (i) are
// in `itestBridgedTrust.cjs`, the rig in `itestBridgedRig.cjs`):
//
//   npm run compile && node scripts/bridged-ssh-itest.cjs        (`npm run itest:bridged-ssh`)
//
// What a unit test cannot show: that a REAL `ssh` and a REAL `sshd -d` do what the per-call file says. Every production leg is the product's own
// `writeBridgedCall` and `bridgedSpawn` from `out/`, then a spawn of `ssh` with that argv, environment and cwd, so the harness runs what
// production runs. Every control is written by hand under `-F <rig home>/.ssh/config`, and shows that THIS rig can make the bad thing happen:
// a leg that says "X does not happen" has a control in which X happens. A RECORD leg asserts nothing about the build; it prints what the build
// did, and the line goes into the spec's As-built.
//
// The rig: a hop on 127.0.0.1 and a destination on 127.0.0.2 (two legs, two hosts), a storage folder and a home with a SPACE in their names, keys
// made by `ssh-keygen`. `sshd -d` serves ONE connection, so each login has its own run. POSIX only. With `CI=true` a missing `sshd` fails; off
// CI the legs that need it print a skip, and leg 0 and the refusals (which need no `sshd`) still run.
const fs = require('fs');
const path = require('path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { SSHD, launch, endChild } = require('./itestSshd.cjs');
const harnessScope = require('./lib/harnessScope.cjs');
const { trustLegs } = require('./itestBridgedTrust.cjs');
const R = require('./itestBridgedRig.cjs');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}`);
  if (!ok) {
    failures += 1;
    if (detail !== undefined) {
      console.log(`       ${String(detail).split('\n').join('\n       ')}`);
    }
  }
}

const ASKPASS_ENV = (rig) => ({ SSH_ASKPASS: rig.key('askpass.sh'), SSH_ASKPASS_REQUIRE: 'force', CREDS_SSH_PASSWORD: 'not-the-password', DISPLAY: ':0' });
const askpassLog = (rig) => (fs.existsSync(rig.key('askpass.log')) ? fs.readFileSync(rig.key('askpass.log'), 'utf8').trim().split('\n').filter((l) => l !== '') : []);
const clearAskpassLog = (rig) => fs.rmSync(rig.key('askpass.log'), { force: true });
const writeControl = (rig, text) => fs.writeFileSync(rig.control, text);
const CONTROL_BASE = ['StrictHostKeyChecking no', 'UserKnownHostsFile /dev/null', 'LogLevel ERROR'];
const asHop = (rig, started, name) => [{ entity: R.hopEntry(started), credential: R.storedKeyOf(rig, name) }];

/** `ssh -G` of a nested leg under the call's file: what it would use, with no `sshd`. Values keep their text; a path loses its quotes. */
function dump(files, args) {
  const text = execFileSync('ssh', ['-G', '-F', 'c.conf', ...args], { cwd: files.cwd, encoding: 'utf8' }); // NOSONAR: the PATH's ssh is the tool under test
  return text.trim().split('\n').map((line) => line.replace(/^(\S+) /, '$1\u0000').split('\u0000')).map(([key, value]) => [key, (value ?? '').replace(/^"(.*)"$/, '$1')]);
}

/** (a) leg 0, no `sshd`: the hop leg of the production file reports the lock-down, an identity of its own, and nothing else that could connect. */
async function leg0(rig) {
  const hop = R.hopEntry({ port: 1 });
  const destination = R.destinationEntry({ port: 22 });
  const files = rig.product.writeBridgedCall(rig.base, { destination, auth: 'key', keyPath: rig.key('dest_key'), hops: asHop(rig, { port: 1 }, 'hop_key') });
  check('(a) 0: the production file of a call with one hop is written', files.ok, JSON.stringify(files));
  if (!files.ok) {
    return;
  }
  try {
    const conf = fs.readFileSync(path.join(files.cwd, 'c.conf'), 'utf8');
    const hopKey = /^Host 127\.0\.0\.1\n  IdentityFile "([^"]+)"/m.exec(conf)?.[1];
    const lines = dump(files, ['-l', hop.user, '-p', '1', '-W', '[127.0.0.2]:22', '127.0.0.1']);
    const values = (key) => lines.filter(([k]) => k === key).map(([, v]) => v);
    for (const [key, value] of [['batchmode', 'yes'], ['passwordauthentication', 'no'], ['kbdinteractiveauthentication', 'no'], ['identityagent', 'none'], ['gssapiauthentication', 'no'],
      ['hostbasedauthentication', 'no'], ['canonicalizehostname', 'false'], ['updatehostkeys', 'false'], ['verifyhostkeydns', 'false']]) {
      check(`(a) 0: the hop leg reports ${key} ${value}`, values(key).join(',') === value, JSON.stringify(values(key)));
    }
    const identities = values('identityfile');
    check('(a) 0: the hop leg lists the hop key then the sentinel and no other identityfile', identities.length === 2 && identities[0] === hopKey && identities[1].endsWith('no-default-identity'), JSON.stringify(identities));
    for (const key of ['pkcs11provider', 'knownhostscommand', 'sendenv']) {
      check(`(a) 0: no ${key} line`, values(key).length === 0, JSON.stringify(values(key)));
    }
  } finally {
    files.remove();
  }
}

/** (a) legs 5-7: what a hop and a destination are ASKED for. */
async function legs567(rig) {
  const passwordsOnly = ['PubkeyAuthentication no', 'PasswordAuthentication yes', 'KbdInteractiveAuthentication no'];
  const sshdA = await R.pair(rig, 'a5', { hop: { first: passwordsOnly } });
  try {
    writeControl(rig, `Host *\n  BatchMode no\n  PasswordAuthentication yes\n  KbdInteractiveAuthentication no\n  PubkeyAuthentication no\n  NumberOfPasswordPrompts 1\n${CONTROL_BASE.map((l) => `  ${l}`).join('\n')}\n`);
    clearAskpassLog(rig);
    const argv = ['-v', '-F', rig.control, '-J', `${R.ME}@127.0.0.1:${sshdA.hop.port}`, '-p', String(sshdA.destination.port), `${R.ME}@127.0.0.2`, 'true'];
    const done = await R.control(rig, argv, { env: { ...process.env, ...ASKPASS_ENV(rig) } });
    const why = { askpass: askpassLog(rig), code: done.code, stderr: done.stderr.trim().split(/\r?\n/).slice(-25), hop: R.tail(sshdA.hop) };
    check('(a) 5 control: a hop that offers passwords only DOES ask the askpass script, with this rig\'s hand-written argv', askpassLog(rig).some((line) => line.includes('127.0.0.1')), JSON.stringify(why, null, 1));
  } finally {
    await sshdA.close();
  }
  const sshdB = await R.pair(rig, 'a6', { hop: { first: passwordsOnly } });
  try {
    clearAskpassLog(rig);
    // A PASSWORD destination, so that the askpass names ARE in the environment of the outer ssh and so of the hop leg: this is the call that would hand the destination's password to the hop.
    const destination = R.destinationEntry(sshdB.destination, { hostKey: R.pinOf(rig.key('host_dest')) });
    const result = await R.production(rig, { destination, auth: 'askpass', keyPath: undefined, hops: asHop(rig, sshdB.hop, 'hop_key'), askpassEnv: ASKPASS_ENV(rig) });
    check('(a) 6: the production call never asks the askpass script (its log is empty)', askpassLog(rig).length === 0, JSON.stringify(askpassLog(rig)));
    check('(a) 6: and the hop\'s sshd saw the connection, so the empty log is not a rig that could not connect', R.sawConnection(sshdB.hop), R.tail(sshdB.hop));
    check('(a) 6: the call did not log in (the hop takes passwords only)', result.refused === undefined && result.code !== 0, JSON.stringify(result.code));
  } finally {
    await sshdB.close();
  }
  const sshdC = await R.pair(rig, 'a7', { destination: { first: ['PasswordAuthentication yes', 'KbdInteractiveAuthentication no'] } });
  try {
    clearAskpassLog(rig);
    const destination = R.destinationEntry(sshdC.destination, { hostKey: R.pinOf(rig.key('host_dest')) });
    const result = await R.production(rig, { destination, auth: 'askpass', keyPath: undefined, hops: asHop(rig, sshdC.hop, 'hop_key'), askpassEnv: ASKPASS_ENV(rig) });
    const log = askpassLog(rig);
    check('(a) 7: a password destination is asked exactly once, and the prompt names the destination, not the hop', result.refused === undefined && log.length === 1 && log[0].includes('127.0.0.2'), JSON.stringify([log, result.refused]));
    check('(a) 7: the hop took the hop key (its sshd accepted it)', R.accepted(sshdC.hop, R.fingerprint(rig.key('hop_key.pub'))), R.tail(sshdC.hop));
    console.log(`record (P3) (a) 7 stderr, to see whether the sentinel's path is printed: ${JSON.stringify(result.stderr ?? '')}`);
  } finally {
    await sshdC.close();
  }
}

/** (b) the environment: the remote cannot read a variable of the extension host, whatever the sshd accepts and the config sends. */
async function legB(rig) {
  const secret = { ...process.env, BRIDGE_TEST_SECRET: 'the-secret-of-the-test-process' };
  const control = await R.pair(rig, 'b-control', { destination: { extra: ['AcceptEnv BRIDGE_TEST_*'] } });
  try {
    writeControl(rig, `Host *\n  SendEnv BRIDGE_TEST_*\n${CONTROL_BASE.map((l) => `  ${l}`).join('\n')}\n`);
    const done = await R.control(rig, ['-F', rig.control, '-i', rig.key('dest_key'), '-o', 'BatchMode=yes', '-p', String(control.destination.port), `${R.ME}@127.0.0.2`, 'printenv BRIDGE_TEST_SECRET'], { env: secret });
    check('(b) control: with SendEnv, AcceptEnv and the whole environment, the remote prints the value', done.stdout.trim() === secret.BRIDGE_TEST_SECRET, JSON.stringify(done));
  } finally {
    await control.close();
  }
  const production = await R.pair(rig, 'b', { destination: { extra: ['AcceptEnv BRIDGE_TEST_*'] } });
  try {
    const result = await R.production(rig, { destination: R.destinationEntry(production.destination, { jumpHostEntityId: undefined }), keyPath: rig.key('dest_key'), command: 'printenv BRIDGE_TEST_SECRET', sourceEnv: secret });
    const allowed = ['PATH', 'HOME'].filter((name) => process.env[name] !== undefined);
    check('(b): production: printenv answers 1 and prints nothing', result.refused === undefined && result.code === 1 && result.stdout.trim() === '', JSON.stringify(result));
    check('(b): and the environment of the spawn has exactly the allow-list', JSON.stringify(Object.keys(result.env).sort()) === JSON.stringify(allowed.sort()), JSON.stringify(Object.keys(result.env ?? {})));
  } finally {
    await production.close();
  }
}

/** (c) no local program is started by a configuration of the person's: a ProxyCommand, a LocalCommand, a Host alias. */
async function legC(rig) {
  const markers = [rig.key('marker1'), rig.key('marker2')];
  const control = await R.pair(rig, 'c-control', {});
  try {
    fs.rmSync(markers[0], { force: true });
    fs.rmSync(markers[1], { force: true });
    writeControl(rig, `Host dest-alias\n  HostName 127.0.0.2\nHost *\n  ProxyCommand sh -c 'touch "${markers[0]}"; exec nc %h %p'\n  PermitLocalCommand yes\n  LocalCommand touch "${markers[1]}"\n${CONTROL_BASE.map((l) => `  ${l}`).join('\n')}\n`);
    await R.control(rig, ['-F', rig.control, '-i', rig.key('dest_key'), '-o', 'BatchMode=yes', '-p', String(control.destination.port), `${R.ME}@dest-alias`, 'true']);
    check('(c) control: the rig\'s own config starts both local programs (both markers exist)', markers.every((m) => fs.existsSync(m)), JSON.stringify(markers.map((m) => fs.existsSync(m))));
  } finally {
    await control.close();
  }
  fs.rmSync(markers[0], { force: true });
  fs.rmSync(markers[1], { force: true });
  const production = await R.pair(rig, 'c', {});
  try {
    const result = await R.production(rig, { destination: R.destinationEntry(production.destination, { jumpHostEntityId: undefined }), keyPath: rig.key('dest_key') });
    check('(c): production: no marker exists', result.refused === undefined && !markers.some((m) => fs.existsSync(m)), JSON.stringify(markers.map((m) => fs.existsSync(m))));
    const alias = await R.production(rig, { destination: R.destinationEntry({ port: 22 }, { host: 'dest-alias', jumpHostEntityId: undefined }), keyPath: rig.key('dest_key') });
    check('(c): production: an entry whose host is dest-alias fails to resolve', alias.refused === undefined && /Could not resolve hostname/.test(alias.stderr), JSON.stringify(alias.stderr));
  } finally {
    await production.close();
  }
}

/** Whether the file exists by `deadline`; polls every 50 ms. */
async function socketAppears(file, deadline) {
  while (!fs.existsSync(file) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return fs.existsSync(file);
}

/** (d) an agent's keys are not offered: the control logs in with a key that only the agent holds; production, with and without the socket, does not. */
async function legD(rig) {
  const socket = path.join(rig.dir, 'agent.sock');
  const agent = launch(rig.scope, 'ssh-agent', ['-D', '-a', socket]);
  check('(d) a real ssh-agent is listening', await socketAppears(socket, Date.now() + 5000), agent.stderr);
  const env = { ...process.env, SSH_AUTH_SOCK: socket };
  try {
    execFileSync('ssh-add', [rig.key('dest_key')], { env, stdio: 'ignore' }); // NOSONAR: the PATH's ssh-add is the tool under test
    const control = await R.pair(rig, 'd-control', {});
    try {
      writeControl(rig, `Host *\n${CONTROL_BASE.map((l) => `  ${l}`).join('\n')}\n`);
      const done = await R.control(rig, ['-F', rig.control, '-o', 'BatchMode=yes', '-p', String(control.destination.port), `${R.ME}@127.0.0.2`, 'true'], { env });
      check('(d) control: a key held only by the agent logs in', done.code === 0, JSON.stringify(done));
    } finally {
      await control.close();
    }
    for (const [at, [label, extraEnv]] of [['without SSH_AUTH_SOCK', {}], ['with SSH_AUTH_SOCK put back by hand under the production file', { SSH_AUTH_SOCK: socket }]].entries()) {
      const started = await R.pair(rig, `d-${at}`, {});
      try {
        // `-i` names the agent key's PUBLIC file: with IdentitiesOnly, an agent key that matches an identity file is the only one the agent could add, so only `IdentityAgent none` keeps it out.
        const result = await R.production(rig, { destination: R.destinationEntry(started.destination, { jumpHostEntityId: undefined }), keyPath: rig.key('dest_key.pub'), extraEnv });
        check(`(d): production ${label}: Permission denied`, result.refused === undefined && result.code === 255 && /Permission denied/.test(result.stderr) && result.env.SSH_AUTH_SOCK === undefined, JSON.stringify([result.code, result.stderr]));
      } finally {
        await started.close();
      }
    }
  } finally {
    await endChild(agent);
  }
}

/** (e) each leg is offered its own key and no other, and the refusals of the hops spend no spawn and reach no sshd. */
async function legE(rig) {
  const started = await R.pair(rig, 'e', {});
  try {
    const spawns = rig.spawns;
    const destination = R.destinationEntry(started.destination, { hostKey: R.pinOf(rig.key('host_dest')) });
    const cases = [
      ['a hop with a password', [{ entity: R.hopEntry(started.hop), credential: { kind: 'password', password: 'x' } }], 'logs in by password'],
      ['a hop with no key', [{ entity: R.hopEntry(started.hop), credential: { kind: 'none' } }], 'has no key'],
      ['a hop with a key sealed by its own PIN', [{ entity: R.hopEntry(started.hop), credential: { kind: 'stopped', reason: '', ownerName: 'k', ownerId: 'k1' } }], 'is protected with its own PIN'],
      ['two hops with one host', [{ entity: R.hopEntry(started.hop), credential: R.storedKeyOf(rig, 'hop_key') }, { entity: { ...R.hopEntry(started.hop), id: 'hop2', name: 'hop two' }, credential: R.storedKeyOf(rig, 'hop_key') }], 'need a different host'],
    ];
    for (const [label, hops, words] of cases) {
      const result = await R.production(rig, { destination, keyPath: rig.key('dest_key'), hops });
      check(`(e): ${label}: refused with the sentence, no spawn`, result.refused !== undefined && result.refused.reason.includes(words), JSON.stringify(result.refused));
    }
    check('(e): none of the four refusals spent a spawn, and the hop\'s sshd saw no connection', rig.spawns === spawns && !R.sawConnection(started.hop), R.tail(started.hop));
    const ok = await R.production(rig, { destination, keyPath: rig.key('dest_key'), hops: asHop(rig, started.hop, 'hop_key') });
    check('(e): production: the call logs in through the hop', ok.refused === undefined && ok.code === 0, JSON.stringify(ok));
    const hopFp = R.fingerprint(rig.key('hop_key.pub'));
    const destFp = R.fingerprint(rig.key('dest_key.pub'));
    check('(e): the hop\'s sshd accepted the hop key and its log names no other key', R.accepted(started.hop, hopFp) && !started.hop.sshd.stderr.includes(destFp), R.tail(started.hop));
    check('(e): the destination\'s sshd accepted the destination key and its log names no other key', R.accepted(started.destination, destFp) && !started.destination.sshd.stderr.includes(hopFp), R.tail(started.destination));
  } finally {
    await started.close();
  }
  await legEOffers(rig);
}

/** (e) again: a destination that refuses the first key it is offered is not offered the hop's key next (a hop `IdentityFile` written under `Host *` would be). */
async function legEOffers(rig) {
  const started = await R.pair(rig, 'e2', {});
  try {
    const destination = R.destinationEntry(started.destination, { hostKey: R.pinOf(rig.key('host_dest')) });
    const result = await R.production(rig, { destination, keyPath: rig.key('other_key'), hops: asHop(rig, started.hop, 'hop_key') });
    const log = started.destination.sshd.stderr;
    check('(e): the destination refused the first key (the call is Permission denied)', result.refused === undefined && result.code === 255, JSON.stringify([result.code, result.stderr]));
    check('(e): the destination\'s sshd log names the key it was offered', log.includes(R.fingerprint(rig.key('other_key.pub'))), R.tail(started.destination));
    check('(e): and names the hop key nowhere: a destination is offered its own key and no other', !log.includes(R.fingerprint(rig.key('hop_key.pub'))), R.tail(started.destination));
  } finally {
    await started.close();
  }
}

/** (j) a value that could change what `ssh` reads: `${VAR}` in a path is replaced by `ssh` (control); the production writer refuses it, and a user that reaches a shell. */
async function legJ(rig) {
  const server = net.createServer((socket) => socket.on('error', () => undefined));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    writeControl(rig, `Host 127.0.0.1\n  IdentityFile "\${BRIDGE_TEST_SECRET}"\n${CONTROL_BASE.map((l) => `  ${l}`).join('\n')}\n`);
    const done = await R.control(rig, ['-v', '-F', rig.control, '-o', 'ConnectTimeout=2', '-p', String(server.address().port), `${R.ME}@127.0.0.1`, 'true'], { env: { ...process.env, BRIDGE_TEST_SECRET: 'a-value-of-the-process' } });
    check('(j) control: ssh -v names a file called by the value of the variable', done.stderr.includes('identity file a-value-of-the-process'), done.stderr.slice(0, 600));
  } finally {
    server.close();
  }
  const started = await R.pair(rig, 'j', {});
  try {
    const spawns = rig.spawns;
    process.env.BRIDGE_PROBE = 'dummy';
    for (const user of ['$BRIDGE_PROBE', 'CORP\\alice']) {
      const result = await R.production(rig, { destination: R.destinationEntry(started.destination), keyPath: rig.key('dest_key'), hops: [{ entity: R.hopEntry(started.hop, { user }), credential: R.storedKeyOf(rig, 'hop_key') }] });
      check(`(j): a hop whose user is ${user} is refused (R6), zero spawns`, result.refused !== undefined && result.refused.reason.includes('the user of the jump host'), JSON.stringify(result.refused));
    }
    check('(j): no spawn was spent and the hop\'s sshd saw no connection', rig.spawns === spawns && !R.sawConnection(started.hop), R.tail(started.hop));
    const record = await R.control(rig, ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-J', `$BRIDGE_PROBE@127.0.0.1:${started.hop.port}`, '-p', String(started.destination.port), `${R.ME}@127.0.0.2`, 'true'], { env: { ...process.env, BRIDGE_PROBE: 'dummy' } });
    const refusedUser = /invalid username|Invalid -J argument/.test(record.stderr);
    console.log(`record (H7a) (j): this build ${refusedUser ? 'REFUSED' : 'did not refuse'} the user "$BRIDGE_PROBE" in -J; "dummy" is ${record.stderr.includes('dummy') ? '' : 'not '}in ssh's stderr and ${started.hop.sshd.stderr.includes('dummy') ? '' : 'not '}in the hop's sshd log`);
  } finally {
    delete process.env.BRIDGE_PROBE;
    await started.close();
  }
}

/** (k) a pin line is matched with the name `ssh` looks up: a hop whose host is typed `LocalHost` logs in, and the control with another key in the pin line does not. */
async function legK(rig) {
  const wrong = await R.pair(rig, 'k-wrong', {});
  try {
    const hop = R.hopEntry(wrong.hop, { host: 'LocalHost', hostKey: R.pinOf(rig.key('host_other')) });
    const result = await R.production(rig, { destination: R.destinationEntry(wrong.destination), keyPath: rig.key('dest_key'), hops: [{ entity: hop, credential: R.storedKeyOf(rig, 'hop_key') }] });
    check('(k) control: another host key in the pin line is refused on that leg', result.refused === undefined && result.code !== 0 && /Host key verification failed|REMOTE HOST IDENTIFICATION/.test(result.stderr), JSON.stringify([result.code, result.stderr]));
  } finally {
    await wrong.close();
  }
  const right = await R.pair(rig, 'k', {});
  try {
    const hop = R.hopEntry(right.hop, { host: 'LocalHost', hostKey: R.pinOf(rig.key('host_hop')) });
    const result = await R.production(rig, { destination: R.destinationEntry(right.destination), keyPath: rig.key('dest_key'), hops: [{ entity: hop, credential: R.storedKeyOf(rig, 'hop_key') }] });
    check('(k): a pinned hop typed LocalHost logs in: the block matched the host as typed and the pin line matched the name ssh looks up', result.refused === undefined && result.code === 0, JSON.stringify([result.code, result.stderr, result.conf]));
  } finally {
    await right.close();
  }
}

async function main() {
  if (process.platform === 'win32') {
    console.log('skip  the bridged ssh harness — POSIX only; M8 and M9 cover Windows');
    return 0;
  }
  const section = harnessScope.sectionScope();
  const rig = await R.makeRig(section, check);
  const haveSshd = fs.existsSync(SSHD);
  await leg0(rig);
  if (!haveSshd) {
    check('the live legs ran', process.env.CI !== 'true', `${SSHD} is missing — a skipped live leg on the runner proves nothing`);
    console.log('skip  the legs that need sshd — sshd is not installed');
  } else {
    // BRIDGED_ITEST_LEGS (e.g. "d,f"): run only these legs; the mutation runner uses it. Unset: every leg.
    const only = process.env.BRIDGED_ITEST_LEGS?.split(',');
    const wanted = (tag) => only === undefined || only.includes(tag);
    for (const [tag, leg] of [['a', legs567], ['b', legB], ['c', legC], ['d', legD], ['e', legE], ['j', legJ], ['k', legK]]) {
      if (wanted(tag)) {
        await leg(rig, check);
      }
    }
    if (only === undefined || only.some((tag) => 'fhin'.includes(tag))) {
      await trustLegs(rig, check, only);
    }
  }
  console.log(failures === 0 ? '\nall bridged ssh checks passed' : `\n${failures} check(s) failed`);
  return failures === 0 ? 0 : 1;
}

harnessScope.run(main);
