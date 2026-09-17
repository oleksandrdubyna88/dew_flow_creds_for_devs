import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RefusalReason } from '../remoteRoute';
import {
  BUTTON_LABELS,
  RELAY_ONLY_LABEL,
  RefusalContext,
  refusalFor,
} from '../remoteWindowMessage';

// The message this replaces was "Identity file c:\Users\...\keys\23284\<guid>.key not accessible:
// No such file or directory" — true, and useless. The file is exactly where it was put; the fact
// worth saying is that the extension and the terminal are on two different computers.

const IN_WSL: RefusalContext = { distro: 'Ubuntu', remoteName: 'wsl', hostPlatform: 'win32' };

const ALL_REASONS: RefusalReason[] = [
  'not-wsl',
  'distro-ambiguous',
  'distro-unknown',
  'relay-off',
  'relay-not-running',
  'agent-has-no-key',
  'credential-is-a-password',
  'credential-is-a-key-path',
  'known-hosts-translation-failed',
];

test('every reason has a sentence, and none of them is empty or a placeholder', () => {
  for (const reason of ALL_REASONS) {
    const said = refusalFor([reason], IN_WSL).message;
    const line = said.split('\n')[1];

    assert.ok(line !== undefined && line.startsWith('• '), `${reason} produced no line`);
    assert.ok(line.length > 40, `${reason} says too little to act on: ${line}`);
    assert.doesNotMatch(line, /undefined|\[object/, `${reason} leaked a value into its sentence`);
  }
});

test('the message names BOTH machines — the one holding the key and the one running the shell', () => {
  // The whole point. Without this line a person reads "file not accessible" and goes looking for a
  // missing file, which is not the problem and never was.
  const said = refusalFor(['relay-off'], IN_WSL).message;

  assert.match(said, /CredsForDevs runs on this computer \(Windows\)/);
  assert.match(said, /this window's terminal runs in WSL \(Ubuntu\)/);
  assert.match(said, /keys are held on this computer/);
});

test('the distribution is named when it is known, and not invented when it is not', () => {
  const unknown: RefusalContext = { distro: '', remoteName: 'wsl', hostPlatform: 'win32' };

  assert.match(refusalFor(['relay-off'], IN_WSL).message, /WSL \(Ubuntu\)/);
  assert.match(refusalFor(['relay-off'], unknown).message, /terminal runs in WSL\./);
  assert.doesNotMatch(refusalFor(['relay-off'], unknown).message, /\(\)/);
});

test('a non-WSL window is named by its own kind, not called WSL', () => {
  const ssh: RefusalContext = { distro: '', remoteName: 'ssh-remote', hostPlatform: 'win32' };
  const said = refusalFor(['not-wsl'], ssh).message;

  assert.match(said, /a ssh-remote window/);
  assert.match(said, /Remote Bridge/);
});

test('EVERY reason given is said — the list is not truncated to the first', () => {
  // Someone who has neither the relay nor the key in the agent should hear both at once, rather
  // than discover the second after fixing the first.
  const said = refusalFor(['relay-off', 'agent-has-no-key'], IN_WSL).message;

  assert.match(said, /switched off/);
  assert.match(said, /not loaded into the SSH agent/);
  assert.equal(said.split('\n').length, 3, 'one heading and one line per reason');
});

test('the reasons keep the order they were given, because the button follows the first', () => {
  const said = refusalFor(['distro-ambiguous', 'relay-off', 'agent-has-no-key'], IN_WSL).message;
  const lines = said.split('\n').slice(1);

  assert.match(lines[0], /more than one WSL distribution/);
  assert.match(lines[1], /switched off/);
  assert.match(lines[2], /not loaded into the SSH agent/);
});

test('the button comes from the FIRST reason and there is exactly one', () => {
  // One primary action, never a row of them: offering the third fix beside the first invites
  // someone to start in the wrong place.
  const refusal = refusalFor(['relay-off', 'agent-has-no-key'], IN_WSL);

  assert.equal(refusal.buttons.length, 1);
  assert.equal(refusal.buttons[0].action, 'setUpRelay');
});

test('the relay button promises a connection ONLY when the relay is the last thing missing', () => {
  // Found by the plan round: `setUpWslRelay` starts the relay, it does not put this key into the
  // agent. A button saying "and Connect" on a refusal that also names a missing key would set the
  // relay up, retry, and land the person on a second refusal — having promised the opposite.
  assert.deepEqual(refusalFor(['relay-off'], IN_WSL).buttons, [
    { label: 'Set Up the Relay and Connect', action: 'setUpRelay' },
  ]);
  assert.deepEqual(refusalFor(['relay-off', 'agent-has-no-key'], IN_WSL).buttons, [
    { label: RELAY_ONLY_LABEL, action: 'setUpRelay' },
  ]);
  assert.equal(RELAY_ONLY_LABEL, 'Set Up the WSL Agent Relay');
});

test('each reason maps to the action that actually fixes it', () => {
  const expected: Record<RefusalReason, string> = {
    'not-wsl': 'openRemoteBridge',
    'distro-ambiguous': 'chooseDistribution',
    'distro-unknown': 'chooseDistribution',
    'relay-off': 'setUpRelay',
    'relay-not-running': 'setUpRelay',
    'agent-has-no-key': 'addKeyToAgent',
    'credential-is-a-password': 'copyWindowsCommand',
    'credential-is-a-key-path': 'copyWindowsCommand',
    'known-hosts-translation-failed': 'retry',
  };

  for (const reason of ALL_REASONS) {
    assert.deepEqual(
      refusalFor([reason], IN_WSL).buttons,
      [{ label: BUTTON_LABELS[expected[reason] as keyof typeof BUTTON_LABELS], action: expected[reason] }],
      `${reason} offered the wrong action`,
    );
  }
});

test('the relay button does not promise a silence it cannot deliver', () => {
  // DEC-1 wanted "Turn It On and Connect". The command it runs opens a distribution picker and a
  // readiness modal first, so the label says what happens instead of what would sound best.
  assert.equal(BUTTON_LABELS.setUpRelay, 'Set Up the Relay and Connect');
});

test('a refusal with no reasons offers no button rather than throwing', () => {
  // remoteRoute never produces one, but a message module that crashes on an empty list turns a
  // refusal into a stack trace.
  assert.deepEqual(refusalFor([], IN_WSL).buttons, []);
});

test('the host machine is named the way a person says it, not the way Node spells it', () => {
  const onMac: RefusalContext = { distro: 'Ubuntu', remoteName: 'wsl', hostPlatform: 'darwin' };

  assert.match(refusalFor(['relay-off'], IN_WSL).message, /\(Windows\)/);
  assert.match(refusalFor(['relay-off'], onMac).message, /\(macOS\)/);
  assert.doesNotMatch(refusalFor(['relay-off'], IN_WSL).message, /win32/);
});
