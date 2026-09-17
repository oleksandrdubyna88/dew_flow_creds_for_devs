import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REFUSAL_REASONS, RefusalReason } from '../remoteRoute';
import {
  BUTTON_LABELS,
  RELAY_ONLY_LABEL,
  RefusalContext,
  refusalFor,
  windowsClientCaveat,
} from '../remoteWindowMessage';

// The message this replaces was "Identity file c:\Users\...\keys\23284\<guid>.key not accessible:
// No such file or directory" — true, and useless. The file is exactly where it was put; the fact
// worth saying is that the extension and the terminal are on two different computers.

const IN_WSL: RefusalContext = { distro: 'Ubuntu', remoteName: 'wsl', hostPlatform: 'win32' };

// Iterated from the production tuple, never retyped — a copy of a list goes stale on the tenth
// entry and the coverage loop stays green while saying nothing about it.
const ALL_REASONS = REFUSAL_REASONS;

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

  assert.equal(
    said.split('\n')[0],
    "CredsForDevs runs on this computer (Windows), while this window's terminal runs in WSL (Ubuntu).",
  );
});

test('the heading says WHERE, and never claims a key the refusal may not be about', () => {
  // It used to end "Your keys are held on this computer…", which is a claim: a refusal for an
  // unresolved distribution, or for an entity with no credential at all, is not about a key, and
  // sending that reader hunting for one wastes the attention the heading exists to direct.
  const heading = refusalFor(['distro-ambiguous'], IN_WSL).message.split('\n')[0];

  assert.doesNotMatch(heading, /key/i);
});

test('the distribution is named when it is known, and not invented when it is not', () => {
  const unknown: RefusalContext = { distro: '', remoteName: 'wsl', hostPlatform: 'win32' };

  assert.match(refusalFor(['relay-off'], IN_WSL).message, /WSL \(Ubuntu\)/);
  assert.match(refusalFor(['relay-off'], unknown).message, /terminal runs in WSL\./);
  assert.doesNotMatch(refusalFor(['relay-off'], unknown).message, /\(\)/);
});

test('a distribution the refusal says it could not identify is NOT named in the heading', () => {
  // A heading reading "WSL (Ubuntu)" above a line reading "this window has folders in more than
  // one distribution" points the reader at the one thing the message just said it cannot identify.
  for (const reason of ['distro-ambiguous', 'distro-unknown'] as const) {
    const heading = refusalFor([reason], IN_WSL).message.split('\n')[0];
    assert.doesNotMatch(heading, /Ubuntu/, `${reason} named a distribution it could not resolve`);
  }
});

test('a non-WSL window is named by its own kind, and told the remedy for THAT kind', () => {
  const ssh: RefusalContext = { distro: '', remoteName: 'ssh-remote', hostPlatform: 'win32' };
  const container: RefusalContext = { distro: '', remoteName: 'dev-container', hostPlatform: 'win32' };

  assert.match(refusalFor(['not-wsl'], ssh).message, /a remote window \(ssh-remote\)/);
  assert.match(refusalFor(['not-wsl'], ssh).message, /Remote Bridge/);

  // A person in a dev container was being told to install `creds` on an SSH host.
  assert.match(refusalFor(['not-wsl'], container).message, /a remote window \(dev-container\)/);
  assert.doesNotMatch(refusalFor(['not-wsl'], container).message, /Remote Bridge/);
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

test('the relay button promises a connection ONLY when switching it on is the whole fix', () => {
  // Found by both gate rounds, in two halves. First: `setUpWslRelay` starts the relay, it does not
  // put this key into the agent, so "and Connect" beside a missing key would set the relay up,
  // retry, and land the person on a second refusal. Second, which the first fix missed:
  // `relay-not-running` means the relay is ALREADY on and still not listening, so running setup
  // again may not fix it — that reason never promises a connection, even alone.
  assert.deepEqual(refusalFor(['relay-off'], IN_WSL).buttons, [
    { label: 'Set Up the Relay and Connect', action: 'setUpRelay' },
  ]);
  assert.deepEqual(refusalFor(['relay-off', 'agent-has-no-key'], IN_WSL).buttons, [
    { label: RELAY_ONLY_LABEL, action: 'setUpRelay' },
  ]);
  assert.deepEqual(refusalFor(['relay-not-running'], IN_WSL).buttons, [
    { label: RELAY_ONLY_LABEL, action: 'setUpRelay' },
  ]);
  assert.equal(RELAY_ONLY_LABEL, 'Set Up the WSL Agent Relay');
});

test('a reason nothing we can run would fix offers NO button', () => {
  // The relay's socket path comes from `CREDS_RELAY_SOCKET` by way of the CLI; no command here
  // changes it, so *Set Up the WSL Agent Relay* would restart the relay at the same unusable path.
  // A button that cannot deliver its promise is the defect this module has already been corrected
  // for twice — the sentence names the variable instead.
  const refusal = refusalFor(['relay-socket-unusable'], IN_WSL);

  assert.deepEqual(refusal.buttons, []);
  assert.match(refusal.message, /CREDS_RELAY_SOCKET/);
});

test('each reason maps to the action that actually fixes it', () => {
  const expected: Record<RefusalReason, string | undefined> = {
    'not-wsl': 'openRemoteBridge',
    'distro-ambiguous': 'chooseDistribution',
    'distro-unknown': 'chooseDistribution',
    'relay-off': 'setUpRelay',
    'relay-not-running': 'setUpRelay',
    'agent-has-no-key': 'addKeyToAgent',
    'credential-is-a-password': 'copyWindowsCommand',
    'credential-is-a-key-path': 'copyWindowsCommand',
    // `undefined` means NO button, and it is a decision rather than an omission: see the test
    // above. Written here too so a new reason cannot be added without choosing one way or another.
    'relay-socket-unusable': undefined,
    'known-hosts-translation-failed': 'retry',
  };

  // The ACTION is what this test pins; the LABEL has its own test, because one action deliberately
  // carries two labels depending on whether it is the whole fix.
  for (const reason of ALL_REASONS) {
    checkTheButton(reason, expected[reason]);
  }
});

const knownLabel = (label: string): boolean =>
  Object.values(BUTTON_LABELS).includes(label) || label === RELAY_ONLY_LABEL;

function checkTheButton(reason: RefusalReason, action: string | undefined): void {
  const buttons = refusalFor([reason], IN_WSL).buttons;

  assert.equal(buttons.length, action === undefined ? 0 : 1, `${reason} offered ${buttons.length} buttons`);
  if (action === undefined) {
    return;
  }
  assert.equal(buttons[0].action, action, `${reason} offered the wrong action`);
  assert.ok(knownLabel(buttons[0].label), `${reason} invented a label`);
}

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

// --- the caveat that rides the Windows-client route -----------------------------------------
//
// Not a refusal: the connection works. Two of its properties move to the other machine, and only
// a connection that ASKS for one of them can be surprised by it.

test('an ordinary connection is told nothing, and that is the point', () => {
  assert.equal(windowsClientCaveat({ name: 'prod' }), '');
  assert.equal(windowsClientCaveat({ name: 'prod', portForwards: [], agentForward: false }), '');
});

test('a forward is told WHOSE localhost it binds, because the answer changed machines', () => {
  const note = windowsClientCaveat({ name: 'prod', portForwards: [{}] });

  assert.match(note, /binds on WINDOWS/);
  assert.match(note, /One thing behaves/, 'one fact, counted as one');
  assert.match(note, /"prod"/, 'named, because a person may have several open');
});

test('agent forwarding is told whose agent it carries', () => {
  const note = windowsClientCaveat({ name: 'prod', agentForward: true });

  assert.match(note, /WINDOWS agent/);
  assert.match(note, /One thing behaves/);
});

test('and both together are counted, rather than read as one sentence about the other', () => {
  const note = windowsClientCaveat({ name: 'prod', portForwards: [{}], agentForward: true });

  assert.match(note, /Two things behave/);
  assert.match(note, /binds on WINDOWS/);
  assert.match(note, /WINDOWS agent/);
});
