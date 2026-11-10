import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { after, test } from 'node:test';
import { isCommandTrusted } from '../commandTrust';
import { RemotePlan, planLaunch, sshLinkOf, sshLinkRefusal, trustLineFor, typedLine } from '../remoteLaunch';
import type { ReadySsh } from '../sshSession';
import type { EntityMetadata, TreeNode } from '../types';
import { ArrowOptions, ArrowWorld, arrowWorld } from './arrowWorld';
import { FakeRoad, RoadScript, fakeRoad, recordDialogs, sshNode } from './sshRoadWorld';
import { filesUnder, hostOs, ownerChain, rootTitle, startVpn, storageOf, terminalNamed, until, world } from './vpnWorld';
import { loadWithVscode } from './vscodeStub';
import { cleanupScope } from '../../scripts/lib/leftovers.cjs';

/**
 * E2.S1 of `PLAN_terminal_command_over_ssh.md`: the green arrow and a VPN's *Started by* run a linked entry on the chosen
 * host, in the order link, prepare, typed-line refusal, trust, dependencies, synchronous send, from ONE snapshot, with ONE
 * OWNER for the prepared session. The seam is a fake road (`sshRoadWorld.ts`); everything a road does with its answer is real.
 */

const scope = cleanupScope();
after(() => scope.close());

const LINKED: EntityMetadata = { id: 'e1', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo linked', sshEntityId: 's1' };
const S1 = sshNode('s1');
const TITLE = rootTitle('deploy');
const RUN_THIS = /Run this command/;
const TYPED_SHELL = { shellPath: '/bin/bash', family: 'posix' as const };

interface Setup {
  aw: ArrowWorld;
  road: FakeRoad;
  events: string[];
  /** The plan of `e` over the vault as it is now. */
  planOf(e: EntityMetadata): RemotePlan;
}

function setup(script?: RoadScript, options: ArrowOptions = {}, trusted: readonly (readonly [string, string])[] = [], others: TreeNode[] = [S1]): Setup {
  const events: string[] = [];
  const box: { aw?: ArrowWorld } = {};
  const lookup = (id: string): TreeNode | undefined => box.aw?.nodes[id] as TreeNode | undefined;
  const road = fakeRoad(script, lookup, events);
  const aw = arrowWorld({ others, sshRoad: road, ...options }, trusted);
  box.aw = aw;
  recordDialogs(aw, events);
  return { aw, road, events, planOf: (e) => planFor(e, lookup) };
}

function planFor(e: EntityMetadata, lookup: (id: string) => TreeNode | undefined): RemotePlan {
  const plan = planLaunch(e, sshLinkOf(e, lookup), { stayOpen: true });
  assert.equal(plan.kind, 'remote', `the plan of ${e.name} is not remote: ${JSON.stringify(plan)}`);
  return plan as RemotePlan;
}

const TRUST = (r: ReadySsh, plan: RemotePlan): string => trustLineFor(r.entity, r.jump, plan.line);
const TYPED = (r: ReadySsh, plan: RemotePlan): string => {
  const typed = typedLine(plan, r, TYPED_SHELL);
  assert.equal(typed.kind, 'typed');
  return (typed as { line: string }).line;
};

const only = <T>(list: readonly T[]): T => {
  assert.equal(list.length, 1, `expected one, got ${list.length}`);
  return list[0];
};

const pattern = (text: string): RegExp => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

// ---- the arrow's road -----------------------------------------------------------------------------------------------

// A1
test('the_arrow_types_the_composed_line_into_the_entry_terminal', async () => {
  const { aw, road, planOf } = setup();
  await aw.run(LINKED);
  const r1 = only(road.readies);
  assert.deepEqual(road.calls, [{ ssh: S1.details, n: 1 }]);
  const terminal = terminalNamed(aw, TITLE);
  const line = TYPED(r1, planOf(LINKED));
  assert.deepEqual(terminal.sent, [line]);
  assert.ok(line.includes('-- deploy@prod.example'), line);
  assert.ok(line.includes("eval '"), line);
  // The composed shell of this window: the host's native one, pinned (D14), never the default profile.
  const pinned = process.platform === 'win32' ? /^(pwsh|powershell)\.exe$/ : new RegExp(`^${fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh'}$`);
  assert.match(String(terminal.shellPath), pinned);
});

// A2
test('the_trust_question_shows_the_trust_line_and_records_it', async () => {
  const { aw, road, planOf } = setup();
  await aw.run(LINKED);
  const trustLine = TRUST(only(road.readies), planOf(LINKED));
  const modal = only(aw.warnings);
  assert.ok(modal.includes(trustLine), modal);
  assert.equal(isCommandTrusted(aw.trust, 'e1', trustLine), true);
  assert.equal(isCommandTrusted(aw.trust, 'e1', 'echo linked'), false);
});

// A3
test('a_trusted_local_line_does_not_cover_the_ssh_run', async () => {
  const { aw } = setup(undefined, { modal: 'dismiss' }, [['e1', 'echo linked']]);
  await aw.run(LINKED);
  assert.equal(aw.warnings.filter((t) => RUN_THIS.test(t)).length, 1, 'the trust modal was shown');
  assert.deepEqual(aw.terminals, []);
});

// A4
test('the_order_is_prepare_then_typed_refusal_then_trust_then_dependencies_then_send', async () => {
  const dep: TreeNode = { id: 'dep', name: 'dep', type: 'entity', details: { id: 'dep', name: 'dep', isSshEnabled: false, isTerminal: true, command: 'echo dep', terminalOs: hostOs } };
  const events: string[] = [];
  const box: { aw?: ArrowWorld } = {};
  const road = fakeRoad(undefined, (id) => box.aw?.nodes[id] as TreeNode | undefined, events);
  const aw = arrowWorld({ others: [S1, dep], sshRoad: road, onExecute: (line) => events.push(`execute: ${line}`), onSend: (name) => events.push(`send: ${name}`) }, [['dep', 'echo dep']]);
  box.aw = aw;
  recordDialogs(aw, events);
  await aw.run({ ...LINKED, dependsOn: ['dep'], runDependencies: true });
  const marks: [RegExp, string][] = [[/^prepare /, 'prepare'], [/^dialog: [\s\S]*Run this command/, 'trust'], [/^execute: /, 'execute'], [/^send: /, 'send']];
  const labels = events.flatMap((e) => marks.filter(([pattern]) => pattern.test(e)).map(([, label]) => label));
  assert.deepEqual(labels, ['prepare', 'trust', 'execute', 'send'], events.join('\n'));
  assert.equal(events.find((e) => e.startsWith('execute: ')), 'execute: echo dep');
  assert.equal(events.find((e) => e.startsWith('send: ')), `send: ${TITLE}`);
});

// A5
test('a_missing_ssh_entry_says_why_and_prepares_nothing', async () => {
  const { aw, road } = setup(undefined, {}, [], []);
  await aw.run(LINKED);
  const missing = sshLinkOf(LINKED, () => undefined);
  assert.equal(missing.kind, 'refused');
  assert.deepEqual(aw.warnings, [(missing as { reason: string }).reason]);
  assert.deepEqual(road.calls, []);
  assert.deepEqual(aw.terminals, []);
});

// A6
test('a_linked_entry_written_for_windows_is_refused_before_prepare', async () => {
  const windows = { ...LINKED, terminalOs: 'windows' };
  const { aw, road } = setup();
  await aw.run(windows);
  const plan = planLaunch(windows, sshLinkOf(windows, (id) => aw.nodes[id] as TreeNode | undefined), { stayOpen: true });
  assert.equal(plan.kind, 'refused');
  assert.deepEqual(aw.warnings, [(plan as { reason: string }).reason]);
  assert.deepEqual(road.calls, []);
});

// A7
test('a_linux_runs_on_with_a_link_is_not_an_os_refusal_on_this_machine', async () => {
  const elsewhere = { ...LINKED, terminalOs: hostOs === 'linux' ? 'macos' : 'linux' };
  const { aw, road } = setup();
  await aw.run(elsewhere);
  assert.equal(road.calls.length, 1);
  assert.equal(only(terminalNamed(aw, TITLE).sent).includes('-- deploy@prod.example'), true, aw.warnings.join('\n'));
});

// A8
test('a_stopped_preparation_types_nothing_and_asks_nothing', async () => {
  const { aw, road } = setup(() => 'stopped');
  await aw.run(LINKED);
  assert.deepEqual(aw.warnings, []);
  assert.deepEqual(aw.terminals, []);
  assert.equal(road.refusedShown, 0);
});

// A9
test('a_refused_preparation_shows_the_remedy_and_types_nothing', async () => {
  const { aw, road } = setup(() => 'refused');
  await aw.run(LINKED);
  assert.equal(road.refusedShown, 1);
  assert.deepEqual(aw.warnings.filter((t) => RUN_THIS.test(t)), [], 'no trust modal');
  assert.deepEqual(aw.terminals, []);
});

// ---- ONE OWNER ------------------------------------------------------------------------------------------------------

// O1
test('owner_a_declined_trust_cleans_the_session', async () => {
  const { aw, road } = setup(undefined, { modal: 'dismiss' });
  await aw.run(LINKED);
  assert.deepEqual(road.cleaned, ['s1#1']);
  assert.deepEqual(aw.terminals, []);
});

// O2
test('owner_a_cancelled_dependency_cleans_the_session', async () => {
  const dep: TreeNode = { id: 'dep', name: 'dep', type: 'entity', details: { id: 'dep', name: 'dep', isSshEnabled: false, isTerminal: true, command: 'echo dep', terminalOs: hostOs } };
  const { aw, road } = setup(undefined, { others: [S1, dep], holdDialogs: /^Before / });
  const running = aw.run({ ...LINKED, dependsOn: ['dep'], runDependencies: true });
  await until(() => aw.held.length === 1, 'the chain modal');
  aw.held[0].answer(undefined);
  await running;
  assert.deepEqual(road.cleaned, ['s1#1']);
  assert.deepEqual(aw.terminals.filter((t) => t.name === TITLE).flatMap((t) => t.sent), []);
});

// O3
test('owner_a_thrown_send_cleans_the_session', async () => {
  const { aw, road } = setup(undefined, { failSend: pattern(TITLE) });
  await assert.rejects(aw.run(LINKED), /no line for/);
  assert.deepEqual(road.cleaned, ['s1#1']);
});

// O4
test('owner_a_failed_terminal_creation_cleans_the_session', async () => {
  const { aw, road } = setup(undefined, { failCreate: pattern(TITLE) });
  await assert.rejects(aw.run(LINKED), /no terminal for/);
  assert.deepEqual(road.cleaned, ['s1#1']);
});

// O5
test('owner_a_declined_busy_question_cleans_only_the_second_session', async () => {
  const { aw, road } = setup(undefined, { holdDialogs: /was not typed/ });
  await aw.run(LINKED);
  const second = aw.run(LINKED);
  await until(() => aw.held.length === 1, 'the busy-terminal question');
  assert.match(aw.held[0].text, /still running|cannot tell/);
  aw.held[0].answer(undefined);
  await second;
  assert.deepEqual(road.cleaned, ['s1#2']);
  assert.equal(only(terminalNamed(aw, TITLE).sent).length > 0, true);
});

// O6
test('owner_the_terminal_owns_the_session_after_the_send', async () => {
  const { aw, road } = setup();
  await aw.run(LINKED);
  assert.deepEqual(road.cleaned, []);
  assert.ok(aw.live[TITLE] !== undefined, 'the entry terminal was opened');
  aw.exit(aw.live[TITLE]);
  assert.deepEqual(road.cleaned, ['s1#1']);
});

// ---- ONE SNAPSHOT ---------------------------------------------------------------------------------------------------

// N1
test('snapshot_a_host_changed_during_the_trust_question_does_not_reach_the_line', async () => {
  const box: { aw?: ArrowWorld; readsAtPrepare?: number } = {};
  const { aw, road } = setup((ssh) => {
    box.readsAtPrepare = box.aw?.reads(ssh.id);
    return {};
  }, { holdDialogs: RUN_THIS });
  box.aw = aw;
  const running = aw.run(LINKED);
  await until(() => aw.held.length === 1, 'the trust modal');
  aw.nodes.s1 = sshNode('s1', { host: 'evil.example' });
  aw.held[0].answer('Run');
  await running;
  const line = only(terminalNamed(aw, TITLE).sent);
  assert.ok(line.includes('prod.example'), line);
  assert.ok(!line.includes('evil'), line);
  assert.equal(aw.reads('s1'), box.readsAtPrepare, 'nothing read the SSH entry again after prepare returned');
  assert.equal(only(road.calls).ssh.host, 'prod.example');
});

// ---- a password, a reused terminal ----------------------------------------------------------------------------------

// P1
test('a_password_entry_opens_a_new_terminal_with_its_env_beside_a_live_one_and_disposes_nothing', async () => {
  const { aw, road } = setup(() => ({ password: true }));
  await aw.run(LINKED);
  await aw.run(LINKED);
  const opened = aw.terminals.filter((t) => t.name === TITLE);
  assert.equal(opened.length, 2, 'two terminals');
  assert.deepEqual(opened.map((t) => t.env), road.readies.map((r) => r.env));
  assert.ok(opened.every((t) => t.env?.SSH_ASKPASS !== undefined));
  assert.deepEqual(opened.map((t) => t.disposed), [0, 0]);
  assert.equal(opened.every((t) => t.sent.length === 1), true);
  assert.deepEqual(aw.warnings.filter((t) => /was not typed/.test(t)), [], 'no busy question');
});

// P2
test('a_key_entry_reuses_a_finished_terminal_of_the_composed_shell', async () => {
  const { aw } = setup();
  await aw.run(LINKED);
  assert.ok(aw.live[TITLE] !== undefined, 'the entry terminal was opened');
  const execution = aw.shell.start(aw.live[TITLE]);
  aw.shell.end(aw.live[TITLE], execution, 0);
  await aw.run(LINKED);
  const opened = aw.terminals.filter((t) => t.name === TITLE);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].sent.length, 2);
});

// ---- the VPN launcher -----------------------------------------------------------------------------------------------

const START_TITLE = rootTitle('start openvpn');

function launcherNodes(extra: Partial<EntityMetadata>): Record<string, EntityMetadata> {
  const nodes = ownerChain();
  return { ...nodes, start: { ...nodes.start, sshEntityId: 's1', ...extra }, s1: S1.details as EntityMetadata };
}

function launcherRoad(nodes: Record<string, EntityMetadata>): { road: FakeRoad; storage: ReturnType<typeof storageOf> } {
  const storage = storageOf(nodes);
  return { road: fakeRoad(undefined, (id) => storage.getNode('a1', id)), storage };
}

const launcherPlan = (nodes: Record<string, EntityMetadata>, storage: ReturnType<typeof storageOf>): RemotePlan =>
  planFor(nodes.start, (id) => storage.getNode('a1', id));

const configRefusal = (name: string): string => {
  const mod = loadWithVscode<typeof import('../vpnLauncherRun')>('../vpnLauncherRun', { window: {} });
  return mod.linkedConfigRefusal(name);
};

// L1
test('the_persons_start_runs_a_linked_launcher_over_ssh', async () => {
  const nodes = launcherNodes({ command: 'openvpn --config /etc/vpn.conf' });
  const { road, storage } = launcherRoad(nodes);
  const w = world({});
  const { started, dir } = await startVpn(scope, w, nodes, { sshRoad: road, storage });
  assert.equal(started, true, w.warnings.join('\n'));
  const r1 = only(road.readies);
  assert.deepEqual(terminalNamed(w, START_TITLE).sent, [TYPED(r1, launcherPlan(nodes, storage))]);
  assert.deepEqual(filesUnder(dir), [], 'no config file was written');
  w.exit(w.live[START_TITLE]);
  assert.deepEqual(road.cleaned, ['s1#1']);
});

// L2
test('a_linked_launcher_with_config_is_refused_before_prepare', async () => {
  const nodes = launcherNodes({});
  const { road, storage } = launcherRoad(nodes);
  const w = world({});
  const { started, dir } = await startVpn(scope, w, nodes, { sshRoad: road, storage });
  assert.equal(started, false);
  assert.deepEqual(w.warnings, [configRefusal('start openvpn')]);
  assert.deepEqual(road.calls, []);
  assert.deepEqual(filesUnder(dir), [], 'no config was written');
  assert.deepEqual(w.terminals, []);
});

// L3
test('the_launcher_asks_trust_on_the_trust_line_after_prepare_and_cleans_on_decline', async () => {
  const nodes = launcherNodes({ command: 'openvpn --config /etc/vpn.conf' });
  const { road, storage } = launcherRoad(nodes);
  const w = world({}, { modal: 'dismiss' });
  const { started } = await startVpn(scope, w, nodes, { sshRoad: road, storage });
  assert.equal(started, false);
  assert.equal(road.calls.length, 1);
  assert.ok(only(w.warnings.filter((t) => RUN_THIS.test(t))).includes(TRUST(only(road.readies), launcherPlan(nodes, storage))));
  assert.deepEqual(road.cleaned, ['s1#1']);
});

// L4 — a guard of E2-D2, GREEN before and after: an agent's start has no road, so a linked launcher keeps E1's refusal.
test('an_agents_start_of_a_linked_launcher_stays_refused', async () => {
  const nodes = launcherNodes({ command: 'openvpn --config /etc/vpn.conf' });
  const w = world({});
  const refusal = sshLinkRefusal(nodes.start) as string;
  const { started } = await startVpn(scope, w, nodes, { startGate: new AbortController().signal });
  assert.equal(started, false);
  assert.ok(w.warnings.some((t) => t.includes(refusal)), w.warnings.join('\n'));
  assert.deepEqual(w.terminals, []);
});
