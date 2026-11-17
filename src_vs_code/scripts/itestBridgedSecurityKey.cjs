// Leg (o) of `bridged-ssh-itest.cjs` (E1.6, the spec §S6.14 Y0 and Y4, probe PF1; parent §7 *The SSH contract* (o) and §4.9's row F): no security key.
//
// TWO HALVES. The CONTROL is a RECORD (probe PF1); the PRODUCTION half is the assertion of Y4's line, `PubkeyAcceptedAlgorithms -sk-*` in `Host *`.
// PF1 asks one thing of each CI image: can the control show the PIN prompt of a security key through askpass with NO token behind the key? If it
// cannot, leg (o) is reported NOT MEASURED, printed and never failed and never a pass (the line then stays, shown by `ssh -G` alone, F11 and X10); the
// production half still runs there, but only as a record, since an empty log proves nothing where the control's log would have been empty too.
// Where the control does show the prompt, production MUST show an empty log and a hop leg that ends `Permission denied`.
// CI run 43919975918 (PF1): the control showed the prompt on OpenSSH 8.9p1 only; on 9.6p1 and 10.2p1 it asked only to confirm user presence. That
// answer is NOT widened here: the user-presence prompt is not the spec's leg.
//
// The control: the harness writes, from random bytes, a key file of `ssh-keygen`'s type `ed25519-sk` (an Ed25519 security key) with the
// verify-required flag, no token behind it. Its public line is the only line of the hop's `authorized_keys`, so the hop's `sshd` accepts the key's
// algorithm; the destination is a password one, so the askpass names are in the environment, and the askpass stub logs each prompt. The config is
// hand-written, under `-F`, and holds no `PubkeyAcceptedAlgorithms` line. Observation: whether the stub's log holds a prompt that begins `Enter PIN for`.
// The production half: the same key file as the hop's stored key, the product's own per-call file, a pinned password destination, the same askpass.
//
// The file's layout is the `openssh-key-v1` one of `PROTOCOL.u2f`, written from memory: cipher and kdf `none`; the public blob is the type, 32 bytes
// and the application `ssh:`; the private part is two check ints, the type, the 32 bytes, the application, one flag byte, a key handle, an empty
// reserved string and a comment, padded to eight. The rig checks that `ssh-keygen -y` reads it back as the same public key: a file that `ssh-keygen`
// cannot read is a failure of THIS rig, and nothing about the client.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');
const R = require('./itestBridgedRig.cjs');

// Built by a join, as sshAgentProtocol.test.ts builds its certificate type: the public-hygiene scan reads `name@domain` as an e-mail address.
const SK_TYPE = ['sk-ssh-ed25519', '@openssh.com'].join('');
const SK_APPLICATION = 'ssh:';
/** `SSH_SK_USER_PRESENCE_REQD` (1) and `SSH_SK_USER_VERIFICATION_REQD` (4): what `ssh-keygen -O verify-required` writes. */
const SK_FLAGS = 0x01 | 0x04;

/** An SSH string: four bytes of length, then the bytes. */
function sshString(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(bytes.length);
  return Buffer.concat([head, bytes]);
}

/** The public blob and the private file of one synthetic `ed25519-sk` key, from random bytes. `blob` is what an `authorized_keys` line carries in base64. */
function syntheticSkKey() {
  const publicKey = crypto.randomBytes(32);
  const blob = Buffer.concat([sshString(SK_TYPE), sshString(publicKey), sshString(SK_APPLICATION)]);
  const checkInt = crypto.randomBytes(4);
  const privateSection = Buffer.concat([
    checkInt, checkInt, sshString(SK_TYPE), sshString(publicKey), sshString(SK_APPLICATION),
    Buffer.from([SK_FLAGS]), sshString(crypto.randomBytes(64)), sshString(Buffer.alloc(0)), sshString('pf1-synthetic-sk'),
  ]);
  const padding = Buffer.from(Array.from({ length: (8 - (privateSection.length % 8)) % 8 }, (_, at) => at + 1));
  const body = Buffer.concat([
    Buffer.from('openssh-key-v1\0'), sshString('none'), sshString('none'), sshString(Buffer.alloc(0)),
    Buffer.from([0, 0, 0, 1]), sshString(blob), sshString(Buffer.concat([privateSection, padding])),
  ]);
  const lines = body.toString('base64').match(/.{1,70}/g).join('\n');
  return { blob, file: `-----BEGIN OPENSSH PRIVATE KEY-----\n${lines}\n-----END OPENSSH PRIVATE KEY-----\n` };
}

const askpassLines = (rig) => (fs.existsSync(rig.key('askpass.log')) ? fs.readFileSync(rig.key('askpass.log'), 'utf8').trim().split('\n').filter((line) => line !== '') : []);

/** The lines of `ssh -v`'s stderr that talk of a security key, a provider, a PIN, a device or a signature: what a reader needs when the prompt did not come. */
const sk = (stderr) => stderr.split(/\r?\n/).filter((line) => /sk-|security key|provider|PIN|device|sign|invalid format/i.test(line)).slice(0, 12).map((line) => line.trim().slice(0, 160));

const ASKPASS_ENV = (rig) => ({ SSH_ASKPASS: rig.key('askpass.sh'), SSH_ASKPASS_REQUIRE: 'force', CREDS_SSH_PASSWORD: 'not-the-password', DISPLAY: ':0' });

/**
 * (o) the control: the hand-written file without the algorithm line, and the askpass stub asked what? Records; fails only for the rig's own faults.
 * Answers whether the control showed the PIN prompt (MEASURED) or not (NOT MEASURED), which decides what the production half may assert.
 */
async function controlO(rig, check, key) {
  const readBack = (() => {
    try {
      return execFileSync('ssh-keygen', ['-y', '-f', rig.key('sk_key')], { encoding: 'utf8' }).trim(); // NOSONAR: the PATH's ssh-keygen is the tool under test
    } catch (error) {
      return `ssh-keygen -y failed: ${String(error.stderr ?? error).trim().slice(0, 200)}`;
    }
  })();
  check('(o) the synthetic security-key file is read back by ssh-keygen as the public key the hop will accept', readBack.startsWith(`${SK_TYPE} ${key.blob.toString('base64')}`), readBack);
  const started = await R.pair(rig, 'o', {
    hop: { authorized: 'authorized_sk' },
    destination: { first: ['PasswordAuthentication yes', 'KbdInteractiveAuthentication no'] },
  });
  try {
    fs.writeFileSync(path.join(rig.dir, 'o-control.conf'), `Host *\n  IdentityFile "${rig.key('sk_key')}"\n  IdentitiesOnly yes\n  IdentityAgent none\n  PubkeyAuthentication yes\n  PasswordAuthentication yes\n  KbdInteractiveAuthentication no\n  NumberOfPasswordPrompts 1\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n`);
    fs.rmSync(rig.key('askpass.log'), { force: true });
    const env = { ...process.env, ...ASKPASS_ENV(rig) };
    const argv = ['-v', '-F', 'o-control.conf', '-J', `${R.ME}@127.0.0.1:${started.hop.port}`, '-p', String(started.destination.port), `${R.ME}@127.0.0.2`, 'true'];
    const done = await R.control(rig, argv, { env });
    const log = askpassLines(rig);
    const prompted = log.some((line) => line.startsWith('Enter PIN for'));
    check('(o) the hop\'s sshd saw the control connect, so a missing prompt is not a rig that never got to the hop', R.sawConnection(started.hop), R.tail(started.hop));
    console.log(`record (PF1) (o) control: the askpass log holds ${log.length} line(s): ${JSON.stringify(log.map((line) => line.slice(0, 100)))}; a prompt beginning "Enter PIN for" ${prompted ? 'WAS' : 'was NOT'} asked; ssh exited ${done.code}`);
    console.log(`record (PF1) (o) control: the hop's sshd ${/sk-ssh-ed25519@openssh\.com/.test(started.hop.sshd.stderr) ? 'SAW' : 'did not see'} the security-key algorithm; ssh -v lines about a key, provider, PIN or signature: ${JSON.stringify(sk(done.stderr))}`);
    console.log(prompted
      ? 'record (PF1) (o): MEASURED — the control shows the PIN prompt with no token, so the production half below asserts'
      : 'record (PF1) (o): NOT MEASURED — the control cannot show the PIN prompt on this client; per the parent\'s PF1 row the line stays, shown by `ssh -G` alone (F11, X10), and the PR says so');
    return prompted;
  } finally {
    await started.close();
  }
}

/**
 * (o) the production half (Y4): the same synthetic key as the hop's stored key, under the product's own per-call file (which holds `PubkeyAcceptedAlgorithms
 * -sk-*` in `Host *`), with a pinned password destination so the askpass names are in the child's environment. The hop's `sshd` accepts nothing but
 * that key, and the file allows no password there. MEASURED: the askpass log is empty (the key was never offered, so its PIN was never asked for) and the
 * hop leg ends `Permission denied`. NOT MEASURED: the same facts are printed as a record and nothing is asserted, since the control showed no prompt either.
 */
async function productionO(rig, check, measured) {
  const started = await R.pair(rig, 'o-prod', { hop: { authorized: 'authorized_sk' }, destination: { first: ['PasswordAuthentication yes', 'KbdInteractiveAuthentication no'] } });
  try {
    fs.rmSync(rig.key('askpass.log'), { force: true });
    const destination = R.destinationEntry(started.destination, { hostKey: R.pinOf(rig.key('host_dest')) });
    const hops = [{ entity: R.hopEntry(started.hop), credential: R.storedKeyOf(rig, 'sk_key') }];
    const result = await R.production(rig, { destination, auth: 'askpass', keyPath: undefined, hops, askpassEnv: ASKPASS_ENV(rig), extraArgs: ['-v'] });
    if (result.refused !== undefined) {
      check('(o) production: the call was written and started (it was not refused before any spawn)', false, JSON.stringify(result.refused));
      return;
    }
    const log = askpassLines(rig);
    const denied = result.code === 255 && /Permission denied/.test(result.stderr);
    const sawConnection = R.sawConnection(started.hop);
    console.log(`record (o) production: the askpass log holds ${log.length} line(s): ${JSON.stringify(log.map((line) => line.slice(0, 100)))}; ssh exited ${result.code}; the hop's sshd ${started.hop.sshd.stderr.includes(SK_TYPE) ? 'SAW' : 'did not see'} the security-key algorithm`);
    console.log(`record (o) production: ssh -v lines about a key, provider, PIN or signature: ${JSON.stringify(sk(result.stderr))}`);
    if (!measured) {
      console.log('record (o) production: NOT MEASURED on this client, nothing is asserted; F11 pins the line');
      return;
    }
    check('(o) production: the askpass log is empty (the security key was not offered, so no PIN was asked for)', log.length === 0, JSON.stringify(log));
    check('(o) production: the hop leg ends Permission denied', denied, JSON.stringify([result.code, result.stderr.trim().split(/\r?\n/).slice(-6)]));
    check('(o) production: and the hop\'s sshd saw the connection, so the empty log is not a rig that never got to the hop', sawConnection, R.tail(started.hop));
  } finally {
    await started.close();
  }
}

/** (o): the control, then the production half. */
async function legO(rig, check) {
  const key = syntheticSkKey();
  fs.writeFileSync(rig.key('sk_key'), key.file, { mode: 0o600 });
  fs.writeFileSync(rig.key('authorized_sk'), `${SK_TYPE} ${key.blob.toString('base64')} pf1-synthetic-sk\n`);
  const measured = await controlO(rig, check, key);
  await productionO(rig, check, measured);
}

module.exports = { legO, syntheticSkKey };
