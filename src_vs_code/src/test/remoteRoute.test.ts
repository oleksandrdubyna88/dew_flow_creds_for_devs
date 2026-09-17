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

interface Case {
  readonly side: WindowSide;
  readonly credential: (typeof ALL_CREDENTIALS)[number];
  readonly agentServesKey: boolean;
  readonly relay: RelayReadiness;
  readonly windowsClient: boolean;
}

/**
 * Every input this function can be given, built ONCE and iterated by name.
 *
 * <p>A cartesian product rather than five nested `for`s, and not only for the ceiling the linter
 * puts on a function: the five dimensions are what the table IS, and naming them once means a sixth
 * is added in one place instead of in every test that sweeps them.</p>
 */
const EVERY_CASE: readonly Case[] = ALL_SIDES.flatMap((side) =>
  ALL_CREDENTIALS.flatMap((credential) =>
    [true, false].flatMap((agentServesKey) =>
      ALL_RELAYS.flatMap((relay) =>
        [true, false].map((windowsClient) => ({ side, credential, agentServesKey, relay, windowsClient })),
      ),
    ),
  ),
);

const ROUTE_KINDS = ['compose', 'agent', 'windowsClient', 'refuse'];

const describeCase = (c: Case): string =>
  `${c.side.kind}/${c.credential}/agent=${c.agentServesKey}/relay=${c.relay.enabled}${c.relay.running}/win=${c.windowsClient}`;

const routeFor = (c: Case, windowsClient = c.windowsClient): ConnectRoute =>
  remoteRoute(c.side, c.credential, c.agentServesKey, c.relay, windowsClient);

function checkOneRoute(c: Case): void {
  const route = routeFor(c);
  const where = describeCase(c);

  assert.ok(ROUTE_KINDS.includes(route.kind), `${where} produced no route`);
  if (route.kind === 'refuse') {
    assert.ok(route.reasons.length > 0, `${where} refused without saying why`);
    assert.equal(new Set(route.reasons).size, route.reasons.length, `${where} repeated a reason`);
  }
}

test('every combination lands on exactly one route, and a refusal is never empty', () => {
  for (const c of EVERY_CASE) {
    checkOneRoute(c);
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

// --- the Windows client, launched from inside WSL -------------------------------------------
//
// The premise the table above was built on turned out to be half true, and measuring it is what
// found that. `ssh -i <windows path>` cannot work with the DISTRIBUTION'S client — /mnt/c reports
// 0777, `chmod` there is a no-op, and OpenSSH refuses a key whose permissions it cannot trust. It
// works perfectly with the WINDOWS client, which WSL launches through interop and which reads that
// same file under Windows ACLs, where the permissions are real. Measured on the reporting machine
// with the very ed25519 key our own agent cannot parse:
//
//   /mnt/c/Windows/System32/OpenSSH/ssh.exe -V   ->  OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2
//
// So a key in a WSL window has two working answers, and the refusal is now the third.

test('a stored key the agent cannot serve runs the WINDOWS client instead of refusing', () => {
  // The report, as a row: relay off, agent empty, and until now a modal.
  assert.deepEqual(remoteRoute(WSL, 'storedKey', false, OFF, true), { kind: 'windowsClient' });
  assert.deepEqual(remoteRoute(WSL, 'storedKey', false, READY, true), { kind: 'windowsClient' });
  assert.deepEqual(remoteRoute(WSL, 'storedKey', true, STARTING, true), { kind: 'windowsClient' });
});

test('the relay still WINS where it can serve — a native client beats a borrowed one', () => {
  // Not a preference for the older code: the distribution's own ssh uses the distribution's
  // ~/.ssh/config, resolver, network namespace and idea of `localhost`. The Windows client is the
  // one that always WORKS, not the one that always fits, so it takes what the relay cannot.
  assert.deepEqual(remoteRoute(WSL, 'storedKey', true, READY, true), {
    kind: 'agent',
    socketPath: READY.socket,
  });
});

test('a key PATH is what the Windows client is best at — it already IS a Windows path', () => {
  // And the one case no relay can ever serve: there is nothing in the vault to load into an agent.
  for (const relay of ALL_RELAYS) {
    assert.deepEqual(remoteRoute(WSL, 'keyPath', true, relay, true), { kind: 'windowsClient' });
  }
});

test('an unnameable distribution stops mattering — this route asks the distribution nothing', () => {
  // Nothing is translated on it, so `distro-ambiguous` and `distro-unknown` have nothing to block.
  for (const side of [AMBIGUOUS, UNKNOWN]) {
    assert.deepEqual(remoteRoute(side, 'storedKey', false, OFF, true), { kind: 'windowsClient' });
    assert.deepEqual(remoteRoute(side, 'keyPath', false, READY, true), { kind: 'windowsClient' });
  }
});

test('a PASSWORD still refuses: the askpass helper is a script only this shell could run', () => {
  // A Windows program cannot exec a shell script the distribution holds, and the environment the
  // password would ride does not cross interop unless WSLENV names it.
  for (const relay of ALL_RELAYS) {
    assert.deepEqual(refusals(remoteRoute(WSL, 'password', true, relay, true)), [
      'credential-is-a-password',
    ]);
  }
});

test('with no Windows client installed, every answer is byte-for-byte what it was', () => {
  // The clause that keeps this change from being a rewrite of the table above: the new parameter
  // can only ADD answers, never move one.
  for (const c of EVERY_CASE) {
    assert.deepEqual(
      routeFor(c, false),
      remoteRoute(c.side, c.credential, c.agentServesKey, c.relay),
      `${describeCase(c)} moved with no client installed`,
    );
  }
});

test('a LOCAL window composes whatever clients are installed, and no other window borrows one', () => {
  for (const credential of ALL_CREDENTIALS) {
    assert.deepEqual(remoteRoute(LOCAL, credential, false, OFF, true), { kind: 'compose' });
    // Remote-SSH and containers are somewhere ELSE: the Windows client is reachable from WSL only
    // because WSL runs on this machine, and there is no interop to borrow across a network.
    assert.deepEqual(refusals(remoteRoute(SSH_REMOTE, credential, false, READY, true)), ['not-wsl']);
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
