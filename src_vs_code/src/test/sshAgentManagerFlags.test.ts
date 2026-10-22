import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALLOW_ONCE, ALLOW_WINDOW } from '../agentConsent';
import { ByteReader, SSH_AGENT_FAILURE, SSH_AGENT_SIGN_RESPONSE } from '../sshAgentProtocol';
import { askOnOneSocket, signRequestFor } from './sshAgentClient';
import { FOUR_BUTTONS, LONGER, THREE_BUTTONS } from './sshAgentLongerRig';
import { KEY_ID, keyEntity, keyMaterialLogged, manager, realPrivateKey, world } from './sshAgentWorld';
import { userauth } from './sshUserauth';

/**
 * The request's flags reach the gate (#197, E3.3), through the REAL server and the manager's own forwarding lambda —
 * the one place no stubbed-server test crosses. An RSA key signs with SHA-1 unless the client sets
 * `SSH_AGENT_RSA_SHA2_256` (2) or `_512` (4), and a login window of 1–12 hours must never cover a SHA-1 signature
 * (the owner's decision of 2026-10-21): the algorithm NAME in the userauth request is the client's claim, the flags
 * are what the signer will really do, and only the flags are asked.
 */

const SHA1 = 'Longer windows need a SHA-2 signature: this RSA login asked for SHA-1';

/** The algorithm an OpenSSH client names in the userauth request for each flag value. */
const ALGORITHM_FOR_FLAGS = new Map<number, string>([
  [0, 'ssh-rsa'],
  [1, 'ssh-rsa'],
  [2, 'rsa-sha2-256'],
  [4, 'rsa-sha2-512'],
  [6, 'rsa-sha2-512'],
]);

test('L10 through the real server: an RSA key\'s login window covers logins with flags 2, 4 and 6; flags 0 and 1 prompt and say why', async () => {
  const w = world({ realServer: true, answers: [LONGER, ALLOW_ONCE, ALLOW_WINDOW] });
  w.pickAnswers.push('1 hour');
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey('rsa') }, autoLockMinutes: 60, locked: false, overdue: false });
  try {
    await instance.load('a1', keyEntity(KEY_ID, 'prod'));
    const blob = Buffer.from(instance.loadedKeys()[0].publicLine.split(' ')[1], 'base64');
    const socket = instance.socketPath as string;
    /** One login by `ssh`, with the flags it sets: true when the agent signed. */
    const login = async (flags: number): Promise<boolean> => {
      const data = userauth({ blob, algorithm: ALGORITHM_FOR_FLAGS.get(flags) });
      const [reply] = await askOnOneSocket(socket, [signRequestFor(blob, data, flags)]);
      const type = new ByteReader(reply).readByte();
      assert.ok(type === SSH_AGENT_SIGN_RESPONSE || type === SSH_AGENT_FAILURE, `an agent reply (${type})`);
      return type === SSH_AGENT_SIGN_RESPONSE;
    };

    assert.equal(await login(2), true, 'the first SHA-256 login is asked and answered with a long window');
    assert.equal(w.dialogs.length, 1);
    assert.deepEqual(w.buttons[0], FOUR_BUTTONS, 'a SHA-2 RSA login may be offered the longer window');
    assert.equal(await login(4), true, 'flags 4 (SHA-512) is covered');
    assert.equal(await login(6), true, 'flags 6 (both) is covered');
    assert.equal(w.dialogs.length, 1, 'neither of those raised a dialog');

    assert.equal(await login(0), true, 'flags 0 asks, and Allow once signs it');
    assert.equal(w.dialogs.length, 2, 'the SHA-1 login is NOT covered by the long window');
    assert.deepEqual(w.buttons[1], THREE_BUTTONS, 'and is offered no longer window');
    assert.ok(w.dialogs[1].includes(`${SHA1}.`), `the prompt says why:\n${w.dialogs[1]}`);

    assert.equal(await login(1), true, 'flags 1 asks too, and the 10-minute answer signs it');
    assert.equal(w.dialogs.length, 3);
    assert.deepEqual(w.buttons[2], THREE_BUTTONS);
    assert.ok(w.dialogs[2].includes(`${SHA1}.`));

    assert.equal(await login(0), true, 'the 10-minute window covers the next SHA-1 login, as it always did');
    assert.equal(w.dialogs.length, 3, 'covered: no dialog');
  } finally {
    instance.dispose();
  }
});

test('nothing this suite logged carries key material', () => {
  assert.deepEqual(keyMaterialLogged(), [], 'a log line carries key material');
});
