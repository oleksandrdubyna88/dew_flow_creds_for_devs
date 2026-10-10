import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { test } from 'node:test';
import { EntityMetadata } from '../types';
import { STORED_CONFIG, World, filesUnder, hostOs, ownerChain, startVpn, storageOf, until, world } from './vpnWorld';

/**
 * A gone request starts no VPN (`PLAN_wsl_bridge_outlives_its_client.md` §5.7, story E4.S3).
 *
 * <p>The defect, as it stood: an agent's `creds_vpn_up` reached `runVpn` with no signal at all, and
 * `runVpn` awaits before it sends anything — the stored config's read, the dependency chain's modal and
 * every step, the launcher's trust modal, OpenVPN Connect's import question, the install offer. A client
 * that left during any of them still got the config written into a private file, its installers run,
 * a custom launcher typed, a profile imported, or the tunnel itself started.</p>
 *
 * <p>Every test holds ONE await open, fires the request's signal while it is open, then lets it go —
 * the moment a person answers a modal nobody is waiting for. Nothing here starts a process or a
 * tunnel: every terminal is the stub's record of what would have been typed.</p>
 */

/** The built-in launcher found on PATH — the question is what happens around it, not where it lives. */
const CLI = { './vpnExec': { resolveVpnLauncher: () => ({ kind: 'cli', exe: 'wg-quick' }) } };

const VPN_TERMINAL = /^CredsForDevs VPN: /;

function wireguard(extra: Partial<EntityMetadata> = {}): Record<string, EntityMetadata> {
  return { vpn: { id: 'vpn', name: 'org meter stage', isSshEnabled: false, isVpn: true, vpnType: 'wireguard', ...extra } };
}

/** A read the test releases by hand — the stored config, in flight. */
function heldRead(): { read: () => Promise<string | undefined>; release(): void; started: () => boolean } {
  let release = (): void => undefined;
  let started = false;
  const read = (): Promise<string | undefined> => {
    started = true;
    return new Promise((resolve) => {
      release = () => resolve(STORED_CONFIG);
    });
  };
  return { read, release: () => release(), started: () => started };
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function nothingStarted(w: World, dir: string, started: boolean): void {
  const typed = w.terminals.filter((t) => t.sent.length + t.executed.length > 0).map((t) => `${t.name}: ${[...t.executed, ...t.sent].join(' ; ')}`);
  assert.deepEqual(typed, [], 'a line was typed for a request whose client had gone');
  assert.deepEqual(filesUnder(dir), [], 'the stored VPN config was written for a request whose client had gone');
  assert.equal(started, false, 'the caller must hear that nothing was started');
}

test('the built-in start: a client gone while its config is read gets no config file and no tunnel', async () => {
  const request = new AbortController();
  const config = heldRead();
  const w = world({});
  const run = startVpn(w, wireguard(), { startGate: request.signal, storage: storageOf(wireguard(), config.read), mocks: CLI });
  await until(config.started, 'the config read to begin');

  request.abort();
  config.release();
  const { started, dir } = await run;
  try {
    nothingStarted(w, dir, started);
  } finally {
    cleanup(dir);
  }
});

test('the dependency chain: a client gone while its modal is open runs no installer when Run is clicked', async () => {
  const request = new AbortController();
  const w = world({}, { holdDialogs: /these run in/ });
  const run = startVpn(w, ownerChain(), { startGate: request.signal });
  await until(() => w.held.length === 1, 'the chain modal');

  request.abort();
  w.held[0].answer(w.held[0].buttons[0]);
  const { started, dir } = await run;
  try {
    nothingStarted(w, dir, started);
    assert.equal(w.terminals.length, 0, 'a chain terminal opened for a request whose client had gone');
  } finally {
    cleanup(dir);
  }
});

test('the dependency chain: a client gone during the first step gets no second step, no config and no tunnel', async () => {
  const request = new AbortController();
  const first: EntityMetadata = { id: 'a', name: 'first', isSshEnabled: false, isTerminal: true, command: 'first-step', terminalOs: hostOs };
  const second: EntityMetadata = { id: 'b', name: 'second', isSshEnabled: false, isTerminal: true, command: 'second-step', terminalOs: hostOs };
  const nodes = { a: first, b: second, ...wireguard({ dependsOn: ['a', 'b'], runDependencies: true }) };
  const w = world({}, { onExecute: (line) => (line === 'first-step' ? request.abort() : undefined) });

  const { started, dir } = await startVpn(w, nodes, { startGate: request.signal, mocks: CLI });
  try {
    assert.deepEqual(w.terminals.flatMap((t) => t.executed), ['first-step'], 'a step ran after the client had gone');
    assert.deepEqual(filesUnder(dir), [], 'the stored VPN config was written for a request whose client had gone');
    assert.equal(w.terminals.find((t) => VPN_TERMINAL.test(t.name)), undefined, 'the tunnel was started');
    assert.equal(started, false);
  } finally {
    cleanup(dir);
  }
});

test('the install offer: a client gone while it is open installs nothing when Install is clicked', async () => {
  const request = new AbortController();
  const w = world({}, { holdDialogs: /is not installed\. Install it\?/ });
  const mocks = {
    './vpnExec': { resolveVpnLauncher: () => ({ kind: 'missing', looked: [] }) },
    './toolCheck': { installRecipe: () => ({ display: 'WireGuard', command: 'install-wireguard', note: '' }) },
  };
  const run = startVpn(w, wireguard(), { startGate: request.signal, mocks });
  await until(() => w.held.length === 1, 'the install offer');

  request.abort();
  w.held[0].answer('Install');
  const { started, dir } = await run;
  try {
    assert.deepEqual(w.terminals.map((t) => t.name), [], 'an installer terminal opened for a request whose client had gone');
    assert.equal(started, false);
  } finally {
    cleanup(dir);
  }
});

test('the custom launcher: a client gone while its trust modal is open gets no line typed when Run is clicked', async () => {
  const request = new AbortController();
  const nodes = ownerChain();
  nodes.start = { ...nodes.start, command: 'rasdial "Work VPN"', runDependencies: undefined };
  nodes.vpn = { ...nodes.vpn, runDependencies: undefined };
  const w = world({}, { holdDialogs: /rasdial/ });
  const run = startVpn(w, nodes, { startGate: request.signal });
  await until(() => w.held.length === 1, 'the launcher trust modal');

  request.abort();
  w.held[0].answer('Run');
  const { started, dir } = await run;
  try {
    nothingStarted(w, dir, started);
  } finally {
    cleanup(dir);
  }
});

test('the custom launcher: a client gone while its {config} is read gets no config file and no line', async () => {
  const request = new AbortController();
  const nodes = ownerChain();
  nodes.start = { ...nodes.start, runDependencies: undefined };
  nodes.vpn = { ...nodes.vpn, runDependencies: undefined };
  const config = heldRead();
  const w = world({});
  const run = startVpn(w, nodes, { startGate: request.signal, storage: storageOf(nodes, config.read) });
  await until(config.started, 'the config read to begin');

  request.abort();
  config.release();
  const { started, dir } = await run;
  try {
    nothingStarted(w, dir, started);
  } finally {
    cleanup(dir);
  }
});

test('OpenVPN Connect: a client gone while its import question is open imports nothing', async () => {
  const request = new AbortController();
  const w = world({}, { holdDialogs: /Import this profile/ });
  const mocks = { './vpnExec': { resolveVpnLauncher: () => ({ kind: 'openvpn-connect', exe: 'C:\\OpenVPN Connect\\OpenVPNConnect.exe' }) } };
  const nodes = wireguard({ vpnType: 'openvpn' });
  const run = startVpn(w, nodes, { startGate: request.signal, mocks });
  await until(() => w.held.length === 1, 'the import question');

  request.abort();
  w.held[0].answer('Import profile');
  const { started, dir } = await run;
  try {
    assert.deepEqual(w.terminals.map((t) => `${t.name}: ${t.sent.join(' ; ')}`), [], 'a profile was imported for a request whose client had gone');
    assert.equal(started, false);
  } finally {
    cleanup(dir);
  }
});

test('a stop for a request already gone types nothing', async () => {
  const request = new AbortController();
  request.abort();
  const w = world({});

  const { started, dir } = await startVpn(w, wireguard(), { action: 'stop', startGate: request.signal, mocks: CLI });
  try {
    assert.deepEqual(w.terminals.map((t) => `${t.name}: ${t.sent.join(' ; ')}`), [], 'a stop was typed for a request whose client had gone');
    assert.equal(started, false);
  } finally {
    cleanup(dir);
  }
});

test('a live request starts exactly as before: the config is written and the tunnel line is typed', async () => {
  const w = world({});

  const { started, dir } = await startVpn(w, wireguard(), { startGate: new AbortController().signal, mocks: CLI });
  try {
    assert.equal(started, true, w.warnings.join('\n'));
    assert.equal(filesUnder(dir).length, 1, 'the config the tunnel reads');
    assert.equal(w.terminals.filter((t) => VPN_TERMINAL.test(t.name) && t.sent.length === 1).length, 1);
  } finally {
    cleanup(dir);
  }
});

test('the person\'s own Start, with no request behind it, is unchanged', async () => {
  const w = world({});

  const { started, dir } = await startVpn(w, wireguard(), { mocks: CLI });
  try {
    assert.equal(started, true, w.warnings.join('\n'));
    assert.equal(filesUnder(dir).length, 1);
    assert.equal(w.terminals.filter((t) => VPN_TERMINAL.test(t.name) && t.sent.length === 1).length, 1);
  } finally {
    cleanup(dir);
  }
});

test('the custom launcher with a chain: a client gone at its trust modal is not shown the chain modal at all', async () => {
  const request = new AbortController();
  const w = world({}, { holdDialogs: /openvpn --config/ });
  const run = startVpn(w, ownerChain(), { startGate: request.signal });
  await until(() => w.held.length === 1, 'the launcher trust modal');

  request.abort();
  w.held[0].answer('Run');
  const { started, dir } = await run;
  try {
    assert.deepEqual(w.warnings.filter((t) => /these run in/.test(t)), [], 'the chain modal was raised for a request whose client had gone');
    nothingStarted(w, dir, started);
  } finally {
    cleanup(dir);
  }
});

test('the built-in start: a client gone during its last dependency step is not even asked for the config', async () => {
  const request = new AbortController();
  const only: EntityMetadata = { id: 'a', name: 'only', isSshEnabled: false, isTerminal: true, command: 'only-step', terminalOs: hostOs };
  const nodes = { a: only, ...wireguard({ dependsOn: ['a'], runDependencies: true }) };
  let reads = 0;
  const storage = storageOf(nodes, () => {
    reads += 1;
    return Promise.resolve(STORED_CONFIG);
  });
  const w = world({}, { onExecute: () => request.abort() });

  const { started, dir } = await startVpn(w, nodes, { startGate: request.signal, storage, mocks: CLI });
  try {
    assert.equal(reads, 0, 'the stored config was read — and its PIN asked — for a request whose client had gone');
    assert.deepEqual(filesUnder(dir), []);
    assert.equal(started, false);
  } finally {
    cleanup(dir);
  }
});

test('the custom launcher without {config}: a client gone during its last dependency step gets no launcher line', async () => {
  const request = new AbortController();
  const nodes = ownerChain();
  nodes.start = { ...nodes.start, command: 'rasdial "Work VPN"' };
  nodes.vpn = { ...nodes.vpn, runDependencies: undefined };
  const w = world({}, { onExecute: () => request.abort() });

  const { started, dir } = await startVpn(w, nodes, { startGate: request.signal });
  try {
    assert.deepEqual(w.terminals.flatMap((t) => t.executed), ['install-openvpn']);
    assert.deepEqual(w.terminals.flatMap((t) => t.sent), [], 'the launcher was typed for a request whose client had gone');
    assert.equal(started, false);
  } finally {
    cleanup(dir);
  }
});

test('a start for a request already gone asks the person nothing', async () => {
  const request = new AbortController();
  request.abort();
  const w = world({});

  const { started, dir } = await startVpn(w, ownerChain(), { startGate: request.signal });
  try {
    assert.deepEqual([...w.warnings, ...w.infos], [], 'a question was raised for a request whose client had already gone');
    nothingStarted(w, dir, started);
  } finally {
    cleanup(dir);
  }
});
