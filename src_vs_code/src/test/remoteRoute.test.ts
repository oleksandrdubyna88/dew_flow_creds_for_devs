import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WindowSide } from '../remoteWindow';
import {
  CREDENTIAL_KINDS,
  ConnectRoute,
  RelayReadiness,
  remoteRoute,
} from '../remoteRoute';

// The defect this table exists for surfaced one argument at a time: fix the `-i` and the pinned
// UserKnownHostsFile breaks the same way, fix that and the askpass script does. So the decision is
// one total function, enumerated here rather than sampled.

const READY: RelayReadiness = { enabled: true, running: true, socket: '/run/user/1000/creds.sock' };
const OFF: RelayReadiness = { enabled: false, running: false, socket: '' };
const STARTING: RelayReadiness = { enabled: true, running: false, socket: '' };

const LOCAL: WindowSide = { kind: 'local' };
const WSL: WindowSide = { kind: 'wsl', distro: 'Ubuntu' };
const AMBIGUOUS: WindowSide = { kind: 'wsl', distro: '', problem: 'ambiguous' };
const UNKNOWN: WindowSide = { kind: 'wsl', distro: '', problem: 'unknown' };
const SSH_REMOTE: WindowSide = { kind: 'other', remoteName: 'ssh-remote' };

const ALL_SIDES = [LOCAL, WSL, AMBIGUOUS, UNKNOWN, SSH_REMOTE];
// Iterated from the production tuple, never retyped: a test that holds its own copy of a list will
// not notice the fifth entry, and this matrix is exactly the test that has to.
const ALL_CREDENTIALS = CREDENTIAL_KINDS;
const ALL_RELAYS = [READY, OFF, STARTING];

const refusals = (route: ConnectRoute): readonly string[] =>
  route.kind === 'refuse' ? route.reasons : [];

test('every combination lands on exactly one route, and a refusal is never empty', () => {
  for (const side of ALL_SIDES) {
    for (const credential of ALL_CREDENTIALS) {
      for (const agentServesKey of [true, false]) {
        for (const relay of ALL_RELAYS) {
          const route = remoteRoute(side, credential, agentServesKey, relay);
          const where = `${side.kind}/${credential}/agent=${agentServesKey}/relay=${relay.enabled}${relay.running}`;

          assert.ok(
            route.kind === 'compose' || route.kind === 'agent' || route.kind === 'refuse',
            `${where} produced no route`,
          );
          if (route.kind === 'refuse') {
            assert.ok(route.reasons.length > 0, `${where} refused without saying why`);
            assert.equal(
              new Set(route.reasons).size,
              route.reasons.length,
              `${where} repeated a reason`,
            );
          }
        }
      }
    }
  }
});

test('a local window composes exactly as it always did, whatever the relay says', () => {
  // The DoD's "byte-identical locally" clause starts here: no reading of relay state can change a
  // local window's answer.
  for (const credential of ALL_CREDENTIALS) {
    for (const relay of ALL_RELAYS) {
      assert.deepEqual(remoteRoute(LOCAL, credential, false, relay), { kind: 'compose' });
      assert.deepEqual(remoteRoute(LOCAL, credential, true, relay), { kind: 'compose' });
    }
  }
});

test('a stored key with the agent serving it and the relay up goes through the socket', () => {
  assert.deepEqual(remoteRoute(WSL, 'storedKey', true, READY), {
    kind: 'agent',
    socketPath: '/run/user/1000/creds.sock',
  });
});

test('the socket is carried verbatim — it is read from the relay, never recomposed', () => {
  const odd: RelayReadiness = { enabled: true, running: true, socket: '/tmp/creds-agent-jinx.sock' };
  assert.deepEqual(remoteRoute(WSL, 'storedKey', true, odd), {
    kind: 'agent',
    socketPath: '/tmp/creds-agent-jinx.sock',
  });
});

test('the relay being OFF and the agent lacking the key are said in ONE refusal, in fix order', () => {
  // Somebody who has neither should hear both at once rather than discover the second after
  // fixing the first — wslRelayReadiness.ts's rule, and the reason reasons is a list.
  assert.deepEqual(remoteRoute(WSL, 'storedKey', false, OFF), {
    kind: 'refuse',
    reasons: ['relay-off', 'agent-has-no-key'],
  });
});

test('a relay switched ON but not yet listening is a DIFFERENT reason from one switched off', () => {
  // Two sentences, two buttons. Telling someone to switch on what is already on sends them round.
  assert.deepEqual(refusals(remoteRoute(WSL, 'storedKey', true, STARTING)), ['relay-not-running']);
  assert.deepEqual(refusals(remoteRoute(WSL, 'storedKey', true, OFF)), ['relay-off']);
});

test('a relay reported running but with no socket yet is not running', () => {
  // It announces its address on its first line of stdout; until it has, there is nothing to point
  // SSH_AUTH_SOCK at.
  const silent: RelayReadiness = { enabled: true, running: true, socket: '' };
  assert.deepEqual(refusals(remoteRoute(WSL, 'storedKey', true, silent)), ['relay-not-running']);
});

test('a password refuses ALONE, because no relay can carry an askpass script into WSL', () => {
  // Listing relay problems beside it would point at a button that cannot help.
  for (const relay of ALL_RELAYS) {
    assert.deepEqual(refusals(remoteRoute(WSL, 'password', true, relay)), [
      'credential-is-a-password',
    ]);
    assert.deepEqual(refusals(remoteRoute(AMBIGUOUS, 'password', false, relay)), [
      'credential-is-a-password',
    ]);
  }
});

test('a key PATH refuses alone too — it names a file on the Windows disk', () => {
  for (const relay of ALL_RELAYS) {
    assert.deepEqual(refusals(remoteRoute(WSL, 'keyPath', true, relay)), [
      'credential-is-a-key-path',
    ]);
  }
});

test('no credential at all composes in WSL: nothing of ours crosses', () => {
  // `ssh user@host` with no -i and no askpass is a line the distribution's shell runs correctly.
  for (const relay of ALL_RELAYS) {
    assert.deepEqual(remoteRoute(WSL, 'none', false, relay), { kind: 'compose' });
  }
});

test('…but an unresolved distribution still refuses, because a pinned host key is translated against it', () => {
  assert.deepEqual(refusals(remoteRoute(AMBIGUOUS, 'none', false, READY)), ['distro-ambiguous']);
  assert.deepEqual(refusals(remoteRoute(UNKNOWN, 'none', false, READY)), ['distro-unknown']);
});

test('an unresolved distribution refuses ALONE — we cannot report a relay we never asked about', () => {
  // Found by the code round. Readiness is read for ONE distribution, so when the distribution
  // could not be named, `running` is false and `socket` empty whatever the machine is doing.
  // Adding `relay-off` there tells somebody their relay is off while it may be running, which is
  // worse than saying one thing at a time.
  assert.deepEqual(remoteRoute(AMBIGUOUS, 'storedKey', false, OFF), {
    kind: 'refuse',
    reasons: ['distro-ambiguous'],
  });
  assert.deepEqual(remoteRoute(UNKNOWN, 'storedKey', true, READY), {
    kind: 'refuse',
    reasons: ['distro-unknown'],
  });
});

test('a ready relay that is not serving THIS key refuses for the key alone', () => {
  // The combination the matrix could otherwise have let slip: everything about the transport is
  // right, and the agent simply does not hold this key.
  assert.deepEqual(remoteRoute(WSL, 'storedKey', false, READY), {
    kind: 'refuse',
    reasons: ['agent-has-no-key'],
  });
});

test('every other remote kind refuses as not-wsl, whatever else is true', () => {
  // Nothing here bridges Remote-SSH or a container; the broker's own ssh -R bridge is another plan.
  for (const credential of ALL_CREDENTIALS) {
    for (const relay of ALL_RELAYS) {
      assert.deepEqual(refusals(remoteRoute(SSH_REMOTE, credential, true, relay)), ['not-wsl']);
    }
  }
});

test('a WSL window NEVER composes a stored key, however ready everything looks', () => {
  // The whole point: `ssh -i` with a Windows-side key cannot work inside WSL — /mnt/c is 0777 and
  // chmod there is a no-op, so OpenSSH ignores the key. It is the agent route or a refusal.
  for (const agentServesKey of [true, false]) {
    for (const relay of ALL_RELAYS) {
      const route = remoteRoute(WSL, 'storedKey', agentServesKey, relay);
      assert.notEqual(route.kind, 'compose');
    }
  }
});
