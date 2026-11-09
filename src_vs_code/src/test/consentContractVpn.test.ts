import * as assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { after, mock, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { parseAuditLine } from '../agentAuditLog';
import { BUSY_PLACE } from '../aliasThrottle';
import { VpnUseDeps, vpnAction } from '../agentUseActions';
import { EntityMetadata } from '../types';
import { message, pause } from './bridgeDoorHarness';
import { Door, answeredAtOnce, send, sendAbortable, until } from './bridgeWallWorld';
import { World as BrokerWorld, share, world as brokerWorld } from './brokerWorld';
import { loadWithVscode } from './vscodeStub';
import { World as VpnWorld, WorldOptions, filesUnder, hostOs, memoryTrust, ownerChain, startVpn, storageOf, world as vpnWorld } from './vpnWorld';

/**
 * D14 (parent §4.10, E1.5): an agent's `up` is not held by a question nobody is waiting on. The OpenVPN Connect import question and the dependency
 * chain's *Continue* question are modals on an agent call and are raced against the request's life; a running dependency step is raced too. A client
 * that leaves frees the place; a late click leaves the late-answer line and does nothing. The person's own Start is unchanged.
 *
 * <p>The REAL `vpnAction` over the real `agentVpnOpener` and the VPN test world, inside the broker world (so the real `performCall` builds
 * `ctx.lateAnswer`): the rig of `consentFollowUps.test.ts`.</p>
 */

const scope = cleanupScope();
after(() => scope.close());

const door = (port: number): Door => ({ port, headers: { Host: `127.0.0.1:${port}` } });
const TARGET = { accountId: 'a1', entityId: 'e1', entityName: 'prod', kind: 'vpn' };
const CLI = { './vpnExec': { resolveVpnLauncher: () => ({ kind: 'cli', exe: 'wg-quick' }) } };
const CONNECT = { './vpnExec': { resolveVpnLauncher: () => ({ kind: 'openvpn-connect', exe: 'C:\\OpenVPN Connect\\OpenVPNConnect.exe' }) } };
const VPN_TERMINAL = /^CredsForDevs VPN: /;
const CHAIN_TERMINAL = 'CredsForDevs: before ops relay stage';

const step = (id: string, line: string): EntityMetadata => ({ id, name: id, isSshEnabled: false, isTerminal: true, command: line, terminalOs: hostOs });
const vpn = (extra: Partial<EntityMetadata> = {}): EntityMetadata => ({ id: 'vpn', name: 'ops relay stage', isSshEnabled: false, isVpn: true, vpnType: 'wireguard', ...extra });
/** A VPN that depends on one terminal step per id, run first. */
const chainOf = (...ids: string[]): Record<string, EntityMetadata> => ({ ...Object.fromEntries(ids.map((id) => [id, step(id, `${id}-step`)])), vpn: vpn({ dependsOn: ids, runDependencies: true }) });

interface Rig {
  readonly bw: BrokerWorld;
  readonly vw: VpnWorld;
  readonly port: number;
  readonly dir: string;
  /** The start gate each `open` was handed, in order: the request's own signal. */
  readonly gates: AbortSignal[];
}

/** An agent `up` through the broker: the real action, the real opener, a vpn world that holds what the test asks it to. */
async function rig(nodes: Record<string, EntityMetadata>, exitCodes: Record<string, number>, options: WorldOptions, mocks?: Record<string, unknown>): Promise<Rig> {
  const vw = vpnWorld(exitCodes, options);
  const dir = ownedDir(scope, 'consent');
  const { agentVpnOpener } = loadWithVscode<{ agentVpnOpener: (...args: unknown[]) => VpnUseDeps['open'] }>('../vpnRun', vw.vscode, mocks);
  const open = agentVpnOpener(storageOf(nodes), dir, { noteUserActivity: () => undefined }, memoryTrust());
  const gates: AbortSignal[] = [];
  const entity = { id: 'e1', name: 'prod', type: 'entity' as const, details: { id: 'e1', name: 'prod', isSshEnabled: false, isVpn: true, vpnType: 'wireguard' as const } };
  const deps: VpnUseDeps = {
    storage: { getNode: () => entity },
    open: (accountId, _entityId, action, gate, lateAnswer) => {
      gates.push(gate);
      return open(accountId, 'vpn', action, gate, lateAnswer);
    },
  };
  const bw = brokerWorld({ kind: 'vpn', holdDialogs: true, supports: ['up', 'exec'], realActions: { up: vpnAction(deps, 'up') }, aliasMap: { one: TARGET }, mcpUse: 'usable' });
  const { port } = await share(bw);
  return { bw, vw, port, dir, gates };
}

/** Let every request still waiting go, whatever the test did, so no pending call holds the process open. */
function settle(r: Rig): void {
  r.bw.openDialogs.forEach((answer) => answer('Deny'));
  r.vw.held.forEach((held) => held.answer(undefined));
  r.vw.executions.forEach(({ terminal, execution }) => r.vw.shell.end(terminal, execution, 0));
  r.bw.server.dispose();
}

const upAsk = { path: '/v1/mcp/use/up', body: { entry: 'e1' } };
const execAsk = { path: '/v1/alias/exec', body: { alias: 'one', command: 'id' } };

/** An agent `up` through the main port's MCP door, hung up on by the test: its dialog is Allowed once it is open. */
async function allowedUp(r: Rig): Promise<{ abort(): void }> {
  const dialogs = r.bw.openDialogs.length;
  const call = sendAbortable(door(r.port), upAsk);
  call.reply.catch(() => undefined);
  await until(() => r.bw.openDialogs.length === dialogs + 1, 'the consent dialog of the up');
  r.bw.openDialogs[dialogs]('Allow');
  return call;
}

const lines = (r: Rig, text: string): string[] => r.bw.audit.filter((line) => line.includes(text));

async function assertBusy(r: Rig, what: string): Promise<void> {
  const refused = await answeredAtOnce(send(door(r.port), execAsk), `${what}: not answered at once, so it was let in behind the standing place`);
  assert.deepEqual([refused.status, message(refused)], [429, BUSY_PLACE], what);
}

/** The place is free: an exec through the local alias door is ASKED and, once Allowed, runs. */
async function assertPlaceFree(r: Rig, what: string): Promise<void> {
  const dialogs = r.bw.openDialogs.length;
  const ran = r.bw.ran.length;
  const next = send(door(r.port), execAsk);
  await until(() => r.bw.openDialogs.length === dialogs + 1, `${what}: the next call to be asked`);
  r.bw.openDialogs[dialogs]('Allow');
  assert.equal((await next).status, 200, what);
  assert.equal(r.bw.ran.length, ran + 1, `${what}: it ran`);
}

/** The step was typed and never ended: the broker is told so by `executeCommand` having been called, and `executions` holds it. */
const stepTyped = (r: Rig, count = 1): Promise<void> => until(() => r.vw.executions.length === count, 'the dependency step to be handed to the shell');

/* ---------------------------------------------------------------------------------------------------------------
 * C10 — a dependency step that never ends frees the place when the client leaves
 * ------------------------------------------------------------------------------------------------------------- */

test('C10: an agent up whose dependency step never ends — busy while it runs; when the client leaves one ABANDONED line, the place is free, nothing written, no VPN terminal', async () => {
  const r = await rig(chainOf('a'), {}, { holdExecutions: true }, CLI);
  try {
    const call = await allowedUp(r);
    await stepTyped(r);
    await assertBusy(r, '(i) a local alias call while the step runs');
    assert.equal(r.vw.executions.length, 1, 'the chain terminal holds an execution that has not ended (C8 c)');
    const dialogs = r.bw.dialogs.length;
    call.abort();
    await until(() => lines(r, 'ABANDONED').length === 1, 'the abandoned line');
    assert.ok(lines(r, 'ABANDONED')[0].includes('after a dependency step had been typed'), lines(r, 'ABANDONED')[0]);
    await assertPlaceFree(r, '(ii) after the hang-up');
    assert.equal(r.bw.dialogs.length, dialogs + 1, 'the dialog count: only the next call\'s own');
    assert.deepEqual(filesUnder(r.dir), [], 'no VPN config was written');
    assert.equal(r.vw.terminals.find((t) => VPN_TERMINAL.test(t.name)), undefined, 'no VPN terminal');
  } finally {
    settle(r);
  }
});

test('C10b: the same through the launcher path — the launcher\'s chain has the never-ending step', async () => {
  const nodes = ownerChain();
  const r = await rig(nodes, {}, { holdExecutions: true });
  try {
    const call = await allowedUp(r);
    await stepTyped(r);
    await assertBusy(r, 'a local alias call while the launcher\'s chain runs');
    call.abort();
    await until(() => lines(r, 'ABANDONED').length === 1, 'the abandoned line');
    assert.ok(lines(r, 'ABANDONED')[0].includes('after a dependency step had been typed'));
    await assertPlaceFree(r, 'after the hang-up');
    assert.deepEqual(filesUnder(r.dir), []);
    assert.equal(r.vw.terminals.find((t) => t.name === 'CredsForDevs: start openvpn'), undefined, 'the launcher was never typed');
  } finally {
    settle(r);
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C10c / C10d — the Continue question: modal on an agent call, a toast on the person's own Start
 * ------------------------------------------------------------------------------------------------------------- */

const CONTINUE = /Continue once it has finished/;

/** Wait on the event loop's immediates, which a mocked `setTimeout` leaves alone. */
async function untilImmediate(done: () => boolean, what: string): Promise<void> {
  for (let turn = 0; !done(); turn += 1) {
    assert.ok(turn < 20_000, `timed out waiting for ${what}`);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** A shell that never reports integration: past the activation budget the chain types the step and ASKS the person to continue. */
const NO_INTEGRATION: WorldOptions = { integration: 'absent', holdDialogs: CONTINUE };
const ACTIVATION_BUDGET_MS = 10_000;

test('C10c (runStep): the Continue question is a modal on an agent call and a client leaving ends the call — ABANDONED, the place free before the click, and a late Continue types nothing and is journalled', async () => {
  const r = await rig(chainOf('a', 'b'), {}, NO_INTEGRATION, CLI);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const call = sendAbortable(door(r.port), upAsk);
    call.reply.catch(() => undefined);
    await untilImmediate(() => r.bw.openDialogs.length === 1, 'the consent dialog of the up');
    r.bw.openDialogs[0]('Allow');
    await untilImmediate(() => r.vw.terminals.some((t) => t.name === CHAIN_TERMINAL), 'the chain terminal');
    mock.timers.tick(ACTIVATION_BUDGET_MS);
    await untilImmediate(() => r.vw.held.length === 1, 'the Continue question');
    assert.equal(r.vw.held[0].modal, true, 'a modal on an agent call');
    call.abort();
    await untilImmediate(() => lines(r, 'ABANDONED').length === 1, 'the abandoned line');
    assert.ok(lines(r, 'ABANDONED')[0].includes('after a dependency step had been typed'));
    mock.timers.reset();
    await assertPlaceFree(r, 'before any click on the question');
    r.vw.held[0].answer('Continue');
    await until(() => lines(r, 'ignored').length === 1, 'the late click to be journalled');
    assert.ok(lines(r, 'ignored')[0].includes('"Continue" answered after its call had ended; nothing ran'), lines(r, 'ignored')[0]);
    assert.deepEqual(r.vw.terminals.find((t) => t.name === CHAIN_TERMINAL)?.sent, ['a-step'], 'no second step was typed');
    assert.equal(r.vw.held.length, 1, 'and no second question was raised');
  } finally {
    mock.timers.reset();
    settle(r);
  }
});

test('C10c (settle): the Continue question after a failed step is a modal on an agent call too — a late Continue types no second step and is journalled', async () => {
  const r = await rig(chainOf('a', 'b'), { 'a-step': 1 }, { holdDialogs: /exited with code 1/ }, CLI);
  try {
    const call = await allowedUp(r);
    await until(() => r.vw.held.length === 1, 'the question after the failed step');
    assert.equal(r.vw.held[0].modal, true);
    call.abort();
    await until(() => lines(r, 'ABANDONED').length === 1, 'the abandoned line');
    await assertPlaceFree(r, 'before any click on the question');
    r.vw.held[0].answer('Continue');
    await until(() => lines(r, 'ignored').length === 1, 'the late click to be journalled');
    assert.ok(lines(r, 'ignored')[0].includes('"Continue" answered after its call had ended; nothing ran'));
    assert.deepEqual(r.vw.terminals.flatMap((t) => t.executed), ['a-step'], 'no second step ran');
  } finally {
    settle(r);
  }
});

test('C10d: the person\'s own Start keeps the toast — the Continue question is no modal, and the chain goes on when it is clicked', async () => {
  const w = vpnWorld({}, NO_INTEGRATION);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const run = startVpn(scope, w, chainOf('a'), { mocks: CLI });
    await untilImmediate(() => w.terminals.some((t) => t.name === CHAIN_TERMINAL), 'the chain terminal');
    mock.timers.tick(ACTIVATION_BUDGET_MS);
    await untilImmediate(() => w.held.length === 1, 'the Continue question');
    assert.equal(w.held[0].modal, false, 'a toast for the person\'s own click');
    mock.timers.reset();
    w.held[0].answer('Continue');
    const { started } = await run;
    assert.equal(started, true, w.warnings.join('\n'));
    assert.equal(w.terminals.filter((t) => VPN_TERMINAL.test(t.name) && t.sent.length === 1).length, 1, 'the tunnel line was typed');
  } finally {
    mock.timers.reset();
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * C11 — the OpenVPN Connect question
 * ------------------------------------------------------------------------------------------------------------- */

const IMPORT = /Import this profile/;

/** The late-answer line of an `up`: outcome, action and words as the contract says, and the call's own grant (the one its ABANDONED line carries). */
function assertLateLine(late: string, abandoned: string, button: string): void {
  const entry = parseAuditLine(late);
  const first = parseAuditLine(abandoned);
  assert.ok(entry !== undefined && first !== undefined, 'both lines parse');
  assert.deepEqual([entry.outcome, entry.action, entry.detail], ['ignored', 'up', `"${button}" answered after its call had ended; nothing ran`]);
  assert.equal(entry.grant, first.grant, 'the line carries the call\'s own grant');
  assert.notEqual(entry.grant, '\u2014', 'and not a dash');
}

test('C11: the OpenVPN Connect question is a modal on an agent call — a client leaving frees the place before any click, and the late click leaves one ignored line, writes no profile and types nothing', async () => {
  const r = await rig({ vpn: vpn({ vpnType: 'openvpn' }) }, {}, { holdDialogs: IMPORT }, CONNECT);
  try {
    const call = await allowedUp(r);
    await until(() => r.vw.held.length === 1, 'the import question');
    assert.equal(r.vw.held[0].modal, true);
    await assertBusy(r, '(i) a local alias call while the question stands');
    call.abort();
    await until(() => lines(r, 'ABANDONED').length === 1, '(ii) the abandoned line');
    assert.ok(lines(r, 'ABANDONED')[0].includes('as the action was starting — it was not launched'), lines(r, 'ABANDONED')[0]);
    await assertPlaceFree(r, 'after the hang-up, before any click');
    const journal = r.bw.audit.length;
    const ran = r.bw.ran.length;
    r.vw.held[0].answer('Import profile');
    await until(() => r.bw.audit.length === journal + 1, '(iii) the late click to be journalled');
    assertLateLine(r.bw.audit[journal], lines(r, 'ABANDONED')[0], 'Import profile');
    assert.deepEqual(filesUnder(r.dir), [], 'no profile was written');
    assert.deepEqual(r.vw.terminals.map((t) => t.sent.length + t.executed.length), [], 'nothing was typed');
    assert.equal(r.bw.ran.length, ran, 'and nothing ran');
  } finally {
    settle(r);
  }
});

test('C11b: the person\'s own Start — the question is no modal, and the profile is written and the import line typed, as today', async () => {
  const w = vpnWorld({}, { holdDialogs: IMPORT });
  const run = startVpn(scope, w, { vpn: vpn({ vpnType: 'openvpn' }) }, { mocks: CONNECT });
  await until(() => w.held.length === 1, 'the import question');
  assert.equal(w.held[0].modal, false, 'a toast for the person\'s own click');
  w.held[0].answer('Import profile');
  const { started, dir } = await run;
  assert.equal(started, true, w.warnings.join('\n'));
  assert.equal(filesUnder(dir).length, 1, 'the profile was written');
  assert.equal(w.terminals.filter((t) => VPN_TERMINAL.test(t.name) && t.sent.length === 1).length, 1, 'the import line was typed');
});

/* ---------------------------------------------------------------------------------------------------------------
 * C20 — abandoned runs on one open terminal leave nothing behind
 * ------------------------------------------------------------------------------------------------------------- */

const abortListeners = (signal: AbortSignal): number => getEventListeners(signal, 'abort').length;

/** One abandoned run of C20: Allowed, hung up while its step runs; what it must leave behind is nothing. */
async function abandonedRun(r: Rig, run: number, before: { ended: number; closed: number }): Promise<void> {
  mock.timers.tick(61_000);
  const call = await allowedUp(r);
  await stepTyped(r, run);
  call.abort();
  await until(() => lines(r, 'ABANDONED').length === run, `the abandoned line of run ${run}`);
  assert.deepEqual(r.vw.listenerCounts(), before, `run ${run}: the terminal events hold no listener of an abandoned run`);
  assert.equal(abortListeners(r.gates[run - 1]), 0, `run ${run}: the gate holds no listener`);
  await assertPlaceFree(r, `run ${run}`);
}

test('C20: five agent up calls on one terminal name, each hung up while its step runs — the listener arrays do not grow, no gate keeps a listener, and the five stale executions that end later reach no question, no step and no write', async () => {
  const r = await rig(chainOf('a'), {}, { holdExecutions: true, preopened: [CHAIN_TERMINAL] }, CLI);
  // Ten dialogs in all, and a door may prompt five times a minute: the throttle's clock moves a minute per run.
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    const before = r.vw.listenerCounts();
    for (let run = 1; run <= 5; run += 1) {
      await abandonedRun(r, run, before);
    }
    const audit = r.bw.audit.length;
    const typed = r.vw.terminals.map((t) => [t.name, t.executed.length, t.sent.length]);
    for (const { terminal, execution } of r.vw.executions) {
      r.vw.shell.end(terminal, execution, 0);
    }
    await pause(80);
    assert.equal(r.vw.held.length, 0, 'no Continue question was raised');
    assert.deepEqual(r.vw.infos, [], 'and no notice');
    assert.deepEqual(r.vw.terminals.map((t) => [t.name, t.executed.length, t.sent.length]), typed, 'no second step was typed');
    assert.deepEqual(filesUnder(r.dir), [], 'no config appeared');
    assert.equal(r.bw.audit.length, audit, 'and the journal gained no line');
  } finally {
    mock.timers.reset();
    settle(r);
  }
});

test('C20: a run that ends by itself on a live gate leaves no listener on it either', async () => {
  const w = vpnWorld({}, {});
  const gate = new AbortController();
  const { started } = await startVpn(scope, w, chainOf('a'), { startGate: gate.signal, mocks: CLI });
  assert.equal(started, true, w.warnings.join('\n'));
  assert.equal(abortListeners(gate.signal), 0, 'the gate is clean after a chain that ran to its end');
});
