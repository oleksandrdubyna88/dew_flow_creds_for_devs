import * as assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { after, mock, test } from 'node:test';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';
import { parseAuditLine } from '../agentAuditLog';
import { BUSY_PLACE } from '../aliasThrottle';
import { VpnUseDeps, vpnAction } from '../agentUseActions';
import { chainTerminalTitle, vpnTerminalTitle } from '../terminalTitles';
import { EntityMetadata } from '../types';
import { Reply, message, pause } from './bridgeDoorHarness';
import { Ask, Door, answeredAtOnce, send, sendAbortable, until } from './bridgeWallWorld';
import { World as BrokerWorld, share, world as brokerWorld } from './brokerWorld';
import { loadWithVscode } from './vscodeStub';
import { World as VpnWorld, WorldOptions, filesUnder, hostOs, memoryTrust, ownerChain, rootTitle, startVpn, storageOf, world as vpnWorld } from './vpnWorld';
import { recordingLog } from './liveColourStorage';

/**
 * D14 (parent §4.10, E1.5): an agent's `up` is not held by a request nobody is waiting on. The OpenVPN Connect import question and the dependency
 * chain's *Continue* question are modals on an agent call and are raced against the request's life; a running dependency step is raced too. A client
 * that leaves ends the request at once; a standing question keeps the one dialog place until a person settles it (F1, change 7.3), and a running step
 * with no question up frees it at the call's end. A late click leaves the late-answer line and does nothing. The person's own Start is unchanged.
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
// The titles come from the real functions (`terminalTitles.ts`), never retyped: a rename must not leave a test looking for a terminal that no longer exists.
const VPN_TERMINAL = new RegExp(`^${vpnTerminalTitle('')}`);
const CHAIN_TERMINAL = chainTerminalTitle('ops relay stage');

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
  /** Every `up` the test sent, so a failing test hangs up on all of them and the run can end. */
  readonly calls: { abort(): void }[];
}

/** An agent `up` through the broker: the real action, the real opener, a vpn world that holds what the test asks it to. */
async function rig(nodes: Record<string, EntityMetadata>, exitCodes: Record<string, number>, options: WorldOptions, mocks?: Record<string, unknown>, quiet = false): Promise<Rig> {
  const vw = vpnWorld(exitCodes, options);
  const dir = ownedDir(scope, 'consent');
  const { agentVpnOpener } = loadWithVscode<{ agentVpnOpener: (...args: unknown[]) => VpnUseDeps['open'] }>('../vpnRun', vw.vscode, mocks);
  const open = agentVpnOpener(storageOf(nodes), dir, { noteUserActivity: () => undefined }, memoryTrust(), recordingLog().log);
  const gates: AbortSignal[] = [];
  const entity = { id: 'e1', name: 'prod', type: 'entity' as const, details: { id: 'e1', name: 'prod', isSshEnabled: false, isVpn: true, vpnType: 'wireguard' as const } };
  const deps: VpnUseDeps = {
    storage: { getNode: () => entity },
    open: (accountId, _entityId, action, gate, lateAnswer, standingPrompt) => {
      gates.push(gate);
      return open(accountId, 'vpn', action, gate, lateAnswer, standingPrompt);
    },
  };
  const bw = brokerWorld({ kind: 'vpn', holdDialogs: true, supports: ['up', 'exec'], realActions: { up: vpnAction(deps, 'up') }, aliasMap: { one: TARGET }, mcpUse: 'usable', mcpPreConsented: quiet });
  const { port } = await share(bw);
  return { bw, vw, port, dir, gates, calls: [] };
}

/** Let every request still waiting go, whatever the test did, so no pending call holds the process open. */
function settle(r: Rig): void {
  r.calls.forEach((call) => call.abort());
  r.bw.openDialogs.forEach((answer) => answer('Deny'));
  r.vw.held.forEach((held) => held.answer(undefined));
  r.vw.executions.forEach(({ terminal, execution }) => r.vw.shell.end(terminal, execution, 0));
  r.bw.server.dispose();
}

const upAsk: Ask = { path: '/v1/mcp/use/up', body: { entry: 'e1' } };
const execAsk: Ask = { path: '/v1/alias/exec', body: { alias: 'one', command: 'id' } };

/** An agent `up` through the main port's MCP door, remembered by the rig so `settle` can hang up on it. */
function startUp(r: Rig): ReturnType<typeof sendAbortable> {
  const call = sendAbortable(door(r.port), upAsk);
  call.reply.catch(() => undefined);
  r.calls.push(call);
  return call;
}

/** An agent `up` through the main port's MCP door, hung up on by the test: its dialog is Allowed once it is open. */
async function allowedUp(r: Rig): Promise<{ abort(): void; reply: Promise<Reply> }> {
  const dialogs = r.bw.openDialogs.length;
  const call = startUp(r);
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
    assert.equal(r.vw.terminals.find((t) => t.name === rootTitle('start openvpn')), undefined, 'the launcher was never typed');
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

/** Old and new answers of a place held by a question: asked of the door at once, by the event loop's immediates (a mocked `setTimeout` leaves them alone). */
async function answeredNow(reply: Promise<Reply>, what: string): Promise<Reply> {
  const raced = await Promise.race([reply, (async (): Promise<string> => {
    for (let turn = 0; turn < 3_000; turn += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return what;
  })()]);
  assert.notEqual(typeof raced, 'string', typeof raced === 'string' ? `${raced}: not answered at once, so it was let in behind the standing place` : '');
  return raced as Reply;
}

async function assertBusyNow(r: Rig, ask: Ask, what: string): Promise<void> {
  const refused = await answeredNow(send(door(r.port), ask), what);
  assert.deepEqual([refused.status, message(refused)], [429, BUSY_PLACE], what);
}

/**
 * F1a / F1b, steps (i)-(iv): the client leaves a standing question — the request ends at once (its ABANDONED line), the place stays the QUESTION's (no new consent modal,
 * the question still the one on screen), a late click on `button` is journalled with the contract's words and does not deny what the ABANDONED line says, and the place frees.
 */
async function leaveAndSettleLate(r: Rig, call: { abort(): void }, button: string, stage: string): Promise<void> {
  const [dialogs, buttons] = [r.bw.openDialogs.length, r.bw.buttons.length];
  call.abort();
  await untilImmediate(() => lines(r, 'ABANDONED').length === 1, '(i) the abandoned line');
  assert.ok(lines(r, 'ABANDONED')[0].includes(stage), lines(r, 'ABANDONED')[0]);
  await assertBusyNow(r, execAsk, '(ii) an alias exec while the question stands');
  await assertBusyNow(r, upAsk, '(ii) an MCP up while the question stands');
  assert.equal(r.vw.held.length, 1, 'one question on screen');
  assert.equal(r.bw.openDialogs.length, dialogs, 'and no new consent modal opened over it');
  assert.equal(r.bw.buttons.length, buttons, 'no Allow-first modal was shown');
  mock.timers.reset();
  r.vw.held[0].answer(button);
  await until(() => lines(r, 'ignored').length === 1, `(iii) the late ${button} to be journalled`);
  assertLateLine(lines(r, 'ignored')[0], lines(r, 'ABANDONED')[0], button);
  assert.equal(lines(r, 'ignored')[0].includes('nothing ran'), false, 'the late line does not claim what ran');
  assert.ok(lines(r, 'ABANDONED')[0].includes(stage), 'and does not deny the ABANDONED line');
  await assertPlaceFree(r, '(iv) after the late click');
}

test('F1a (runStep): the Continue question keeps the place after its client leaves — busy for the alias and the MCP door, no new modal, a late Continue types nothing, then the place frees', async () => {
  const r = await rig(chainOf('a', 'b'), {}, NO_INTEGRATION, CLI);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const call = startUp(r);
    call.reply.catch(() => undefined);
    await untilImmediate(() => r.bw.openDialogs.length === 1, 'the consent dialog of the up');
    r.bw.openDialogs[0]('Allow');
    await untilImmediate(() => r.vw.terminals.some((t) => t.name === CHAIN_TERMINAL), 'the chain terminal');
    mock.timers.tick(ACTIVATION_BUDGET_MS);
    await untilImmediate(() => r.vw.held.length === 1, 'the Continue question');
    assert.equal(r.vw.held[0].modal, true, 'a modal on an agent call');
    await leaveAndSettleLate(r, call, 'Continue', 'after a dependency step had been typed');
    assert.deepEqual(r.vw.terminals.find((t) => t.name === CHAIN_TERMINAL)?.sent, ['a-step'], 'no second step was typed');
    assert.equal(r.vw.held.length, 1, 'and no second question was raised');
  } finally {
    mock.timers.reset();
    settle(r);
  }
});

for (const button of ['Continue', 'Stop']) {
  test(`F1a (settle): the question after a failed step keeps the place after its client leaves — a late ${button} is journalled, types nothing, and frees the place`, async () => {
    const r = await rig(chainOf('a', 'b'), { 'a-step': 1 }, { holdDialogs: /exited with code 1/ }, CLI);
    try {
      const call = await allowedUp(r);
      await until(() => r.vw.held.length === 1, 'the question after the failed step');
      assert.equal(r.vw.held[0].modal, true);
      await leaveAndSettleLate(r, call, button, 'after a dependency step had been typed');
      assert.deepEqual(r.vw.terminals.flatMap((t) => t.executed), ['a-step'], 'no second step ran');
    } finally {
      settle(r);
    }
  });
}

test('F1c: five never-ask ups, each hung up at its question — one question, four busy, one ABANDONED line; a late Stop frees the place and a sixth up reaches its own question', async () => {
  const r = await rig(chainOf('a'), {}, NO_INTEGRATION, CLI, true);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const first = startUp(r);
    first.reply.catch(() => undefined);
    await untilImmediate(() => r.vw.terminals.some((t) => t.name === CHAIN_TERMINAL), 'the first up\'s chain terminal');
    mock.timers.tick(ACTIVATION_BUDGET_MS);
    await untilImmediate(() => r.vw.held.length === 1, 'the first up\'s question');
    first.abort();
    await untilImmediate(() => lines(r, 'ABANDONED').length === 1, 'the abandoned line');
    for (let up = 2; up <= 5; up += 1) {
      await assertBusyNow(r, upAsk, `up #${up}`);
    }
    // The never-ask road: the orphaned question was raised with no Allow, and the help the caller hears names it (change 8.1).
    const heard = message(await answeredNow(send(door(r.port), upAsk), 'a fifth caller'));
    assert.ok(heard.includes('a prompt the request raised after its consent, asked or not') && heard.includes('a VPN question'), heard);
    assert.equal(r.vw.held.length, 1, 'one modal in all');
    assert.equal(r.bw.dialogs.length, 0, 'no consent modal: the entry never asks');
    assert.equal(lines(r, 'ABANDONED').length, 1);
    assert.equal(r.gates.length, 1, 'only one up reached its action');
    r.vw.held[0].answer('Stop');
    const sixth = startUp(r);
    sixth.reply.catch(() => undefined);
    await untilImmediate(() => r.vw.terminals.filter((t) => t.name === CHAIN_TERMINAL).length === 2, 'the sixth up\'s own chain terminal');
    mock.timers.tick(ACTIVATION_BUDGET_MS);
    await untilImmediate(() => r.vw.held.length === 2, 'the sixth up\'s own question: the place was freed by the late Stop');
    assert.equal(r.gates.length, 2);
    sixth.abort();
  } finally {
    mock.timers.reset();
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
  assert.deepEqual([entry.outcome, entry.action, entry.detail], ['ignored', 'up', `"${button}" answered after its call had ended; the answer changed nothing`]);
  assert.equal(entry.grant, first.grant, 'the line carries the call\'s own grant');
  assert.notEqual(entry.grant, '\u2014', 'and not a dash');
}

test('F1b: the OpenVPN Connect question keeps the place after its client leaves — busy, no new modal, a late Import profile writes no profile and types nothing, then the place frees', async () => {
  const r = await rig({ vpn: vpn({ vpnType: 'openvpn' }) }, {}, { holdDialogs: IMPORT }, CONNECT);
  try {
    const call = await allowedUp(r);
    await until(() => r.vw.held.length === 1, 'the import question');
    assert.equal(r.vw.held[0].modal, true);
    const ran = r.bw.ran.length;
    await leaveAndSettleLate(r, call, 'Import profile', 'as the action was starting — it was not launched');
    assert.deepEqual(filesUnder(r.dir), [], 'no profile was written');
    assert.deepEqual(r.vw.terminals.map((t) => t.sent.length + t.executed.length), [], 'nothing was typed');
    assert.equal(r.bw.ran.length, ran + 1, 'and nothing ran for the up: only the exec of step (iv)');
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

/* ---------------------------------------------------------------------------------------------------------------
 * C8 (b) and C12 — a local `down` held in its install offer: busy beyond any former timer, free at the click
 * ------------------------------------------------------------------------------------------------------------- */

test('C8 (b) and C12: a local down whose install offer stands for 400 ms with the wait at 100 ms — busy at 150 ms and at 350 ms on both local doors, one modal, the offer held; free at the click on it', async () => {
  const vw = vpnWorld({}, { holdDialogs: /is not installed\. Install it\?/ });
  const mocks = {
    './vpnExec': { resolveVpnLauncher: () => ({ kind: 'missing', looked: [] }) },
    './toolCheck': { installRecipe: () => ({ display: 'WireGuard', command: 'install-wireguard', note: '' }) },
  };
  const { agentVpnOpener } = loadWithVscode<{ agentVpnOpener: (...args: unknown[]) => VpnUseDeps['open'] }>('../vpnRun', vw.vscode, mocks);
  const nodes = { vpn: vpn() };
  const open = agentVpnOpener(storageOf(nodes), ownedDir(scope, 'down'), { noteUserActivity: () => undefined }, memoryTrust(), recordingLog().log);
  const entity = { id: 'e1', name: 'prod', type: 'entity' as const, details: { id: 'e1', name: 'prod', isSshEnabled: false, isVpn: true, vpnType: 'wireguard' as const } };
  const deps: VpnUseDeps = { storage: { getNode: () => entity }, open: (accountId, _entityId, action, gate, late) => open(accountId, 'vpn', action, gate, late) };
  const bw = brokerWorld({ kind: 'vpn', holdDialogs: true, consentTimeoutMs: 100, supports: ['down', 'exec'], realActions: { down: vpnAction(deps, 'down') }, aliasMap: { one: TARGET }, mcpUse: 'usable' });
  const r: Rig = { bw, vw, port: (await share(bw)).port, dir: '', gates: [], calls: [] };
  try {
    const first = send(door(r.port), { path: '/v1/alias/down', body: { alias: 'one' } });
    first.catch(() => undefined);
    await until(() => bw.openDialogs.length === 1, 'the consent dialog of the down');
    bw.openDialogs[0]('Allow');
    await until(() => vw.held.length === 1, 'the install offer, after the Allow');
    for (const [wait, at] of [[150, '150 ms'], [200, '350 ms']] as const) {
      await pause(wait);
      await assertBusy(r, `${at}: a local alias call`);
      const mcpBusy = await answeredAtOnce(send(door(r.port), { path: '/v1/mcp/use/exec', body: { entry: 'e1', command: 'id' } }), 'a local MCP call was let in');
      assert.deepEqual([mcpBusy.status, message(mcpBusy)], [429, BUSY_PLACE], 'a local MCP call');
    }
    assert.equal(bw.dialogs.length, 1, 'one modal in all');
    assert.equal(vw.held.length, 1, 'the offer is held (C8 b)');
    vw.held[0].answer(undefined);
    await first;
    await assertPlaceFree(r, 'at the click on the offer');
  } finally {
    settle(r);
  }
});

/* ---------------------------------------------------------------------------------------------------------------
 * F8a — a gate that fires between `runStep`'s check and the type: nothing is typed, and the journal never claims a step
 * ------------------------------------------------------------------------------------------------------------- */

test('F8a: a gate that fires after runStep\'s own check and before the step is typed — nothing is typed, the chain is {ready: false, typed: false}, and nothing is thrown', async () => {
  const vw = vpnWorld({}, { holdExecutions: true });
  const controller = new AbortController();
  const window = vw.vscode.window as { createTerminal: (options: { name: string }) => object };
  const create = window.createTerminal;
  window.createTerminal = (options) => {
    const terminal = create(options);
    // `runStep` reads `exitStatus` after its own gate check and before it types: the gate fires there, with no await in between.
    Object.defineProperty(terminal, 'exitStatus', { get: () => (controller.abort(), undefined) });
    return terminal;
  };
  const nodes = chainOf('a');
  const host = loadWithVscode<typeof import('../dependencyRunHost')>('../dependencyRunHost', vw.vscode);
  const request = { ...host.dependencyRequest(storageOf(nodes) as never, 'a1', [nodes.vpn], nodes.vpn.name, memoryTrust()), startGate: controller.signal };
  assert.deepEqual(await host.runDependenciesFirst(request), { ready: false, typed: false });
  assert.equal(vw.executions.length, 0, 'no step was handed to the shell');
  assert.deepEqual(vw.terminals.flatMap((t) => [...t.executed, ...t.sent]), [], 'and nothing was sent');
});

/* ---------------------------------------------------------------------------------------------------------------
 * F1e — a question answered while the client is still there keeps the call's place, as before
 * ------------------------------------------------------------------------------------------------------------- */

test('F1e: a Continue clicked in time keeps the place for the call still running — busy while step b runs, asked once the up has answered', async () => {
  const r = await rig(chainOf('a', 'b'), {}, { holdExecutions: true, holdDialogs: /exited with code 1/ }, CLI);
  try {
    const call = await allowedUp(r);
    await stepTyped(r);
    r.vw.shell.end(r.vw.executions[0].terminal, r.vw.executions[0].execution, 1);
    await until(() => r.vw.held.length === 1, 'the question after the failed step a');
    r.vw.held[0].answer('Continue');
    await stepTyped(r, 2);
    await assertBusy(r, 'an alias exec while step b runs: the call is still running and keeps the place by its flag');
    r.vw.shell.end(r.vw.executions[1].terminal, r.vw.executions[1].execution, 0);
    const reply = await call.reply;
    assert.equal(reply.status, 200, reply.body);
    await assertPlaceFree(r, 'after the up has answered');
  } finally {
    settle(r);
  }
});
