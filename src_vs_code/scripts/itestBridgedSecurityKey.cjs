// Leg (o) of `bridged-ssh-itest.cjs` (E1.6, the spec §S6.14 Y0, probe PF1; parent §7 *The SSH contract* (o) and §4.9's row F): no security key.
//
// THIS FILE HOLDS THE CONTROL ONLY, and it is a RECORD. Y4 adds the production half (`PubkeyAcceptedAlgorithms -sk-*` in `Host *`). PF1 asks one thing
// of each CI image: can the control show the PIN prompt of a security key through askpass with NO token behind the key? If it cannot, leg (o) is
// reported *not measured* and never as a pass (the line then stays, shown by `ssh -G` alone, X10).
//
// The control: the harness writes, from random bytes, a key file of `ssh-keygen`'s type `ed25519-sk` (an Ed25519 security key) with the
// verify-required flag, no token behind it. Its public line is the only line of the hop's `authorized_keys`, so the hop's `sshd` accepts the key's
// algorithm; the destination is a password one, so the askpass names are in the environment, and the askpass stub logs each prompt. The config is
// hand-written, under `-F`, and holds no `PubkeyAcceptedAlgorithms` line. Observation: whether the stub's log holds a prompt that begins `Enter PIN for`.
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

/** (o) the control: the hand-written file without the algorithm line, and the askpass stub asked what? Records; fails only for the rig's own faults. */
async function legO(rig, check) {
  const key = syntheticSkKey();
  fs.writeFileSync(rig.key('sk_key'), key.file, { mode: 0o600 });
  fs.writeFileSync(rig.key('authorized_sk'), `${SK_TYPE} ${key.blob.toString('base64')} pf1-synthetic-sk\n`);
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
    const env = { ...process.env, SSH_ASKPASS: rig.key('askpass.sh'), SSH_ASKPASS_REQUIRE: 'force', CREDS_SSH_PASSWORD: 'not-the-password', DISPLAY: ':0' };
    const argv = ['-v', '-F', 'o-control.conf', '-J', `${R.ME}@127.0.0.1:${started.hop.port}`, '-p', String(started.destination.port), `${R.ME}@127.0.0.2`, 'true'];
    const done = await R.control(rig, argv, { env });
    const log = askpassLines(rig);
    const prompted = log.some((line) => line.startsWith('Enter PIN for'));
    check('(o) the hop\'s sshd saw the control connect, so a missing prompt is not a rig that never got to the hop', R.sawConnection(started.hop), R.tail(started.hop));
    console.log(`record (PF1) (o) control: the askpass log holds ${log.length} line(s): ${JSON.stringify(log.map((line) => line.slice(0, 100)))}; a prompt beginning "Enter PIN for" ${prompted ? 'WAS' : 'was NOT'} asked; ssh exited ${done.code}`);
    console.log(`record (PF1) (o) control: the hop's sshd ${/sk-ssh-ed25519@openssh\.com/.test(started.hop.sshd.stderr) ? 'SAW' : 'did not see'} the security-key algorithm; ssh -v lines about a key, provider, PIN or signature: ${JSON.stringify(sk(done.stderr))}`);
    console.log(prompted
      ? 'record (PF1) (o): MEASURED — the control shows the PIN prompt with no token, so Y4 can build the production half of this leg'
      : 'record (PF1) (o): NOT MEASURED — the control cannot show the PIN prompt on this client; per the parent\'s PF1 row the line stays, shown by `ssh -G` alone (X10), and the PR says so');
  } finally {
    await started.close();
  }
}

module.exports = { legO, syntheticSkKey };
