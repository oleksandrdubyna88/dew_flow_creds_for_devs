import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { after, test } from 'node:test';
import { isCommandTrusted } from '../commandTrust';
import { changedStepRefusal, passwordStepRefusal, planDependencyRun } from '../dependencyRun';
import { USES_CONFIG } from '../vpnLauncher';
import { RemotePlan, planLaunch, sshLinkOf, sshLinkRefusal, trustLineFor, typedLine } from '../remoteLaunch';
import { chainTerminalTitle } from '../terminalTitles';
import type { ReadySsh } from '../sshSession';
import type { EntityMetadata, TreeNode } from '../types';
import { ArrowOptions, ArrowWorld, arrowWorld } from './arrowWorld';
import { FakeRoad, RoadScript, fakeRoad, recordDialogs, sshNode } from './sshRoadWorld';
import { hostOs, rootTitle, terminalNamed, until } from './vpnWorld';
import { cleanupScope } from '../../scripts/lib/leftovers.cjs';

/**
 * E2.S3 of `PLAN_terminal_command_over_ssh_E2.md`, as amended by E2.A (A2, A3, A4): a dependency step linked to an SSH
 * entry runs over SSH with the BARE line (D11), so the chain sees its exit code. The chain follows the FOLDER model: its
 * modal shows each step's trust line with NO preparation; after the approval the linked steps are prepared in step
 * order; a step whose rebuilt trust line differs from the shown one is not run; a password step is refused after its
 * preparation and before any step runs; the owner holds every session in a list made before the first `prepare`.
 * The roots run from the arrow world with a fake road (`sshRoadWorld.ts`), so the chain is the real `runDependenciesFirst`.
 */

const scope = cleanupScope();
after(() => scope.close());

const S1 = sshNode('s1');
const S2 = sshNode('s2', { name: 'stage box', host: 'stage.example' });
const J1 = sshNode('j1', { name: 'jump one', host: 'jump1.example' });
const J2 = sshNode('j2', { name: 'jump two', host: 'jump2.example' });
const TYPED_SHELL = { shellPath: '/bin/bash', family: 'posix' as const };

/** The dependency step of the spec: `migrate`, linked to `s1`. */
const STEP: EntityMetadata = { id: 'st', name: 'migrate', isSshEnabled: false, isTerminal: true, command: 'migrate', sshEntityId: 's1' };
const asNode = (details: EntityMetadata): TreeNode => ({ id: details.id, name: details.name, type: 'entity', details, parentId: null });
const step = (id: string, name: string, extra: Partial<EntityMetadata> = {}): EntityMetadata => ({ ...STEP, id, name, command: name, ...extra });

/** The entry the person clicks: a local Terminal entry that asks for its dependencies first. */
const ROOT: EntityMetadata = { id: 'r', name: 'deploy', isSshEnabled: false, isTerminal: true, command: 'echo root', terminalOs: hostOs, dependsOn: ['st'], runDependencies: true };
const ROOT_TITLE = rootTitle('deploy');
const CHAIN_TITLE = chainTerminalTitle('deploy');
const BEFORE = /^Before "deploy"/;

interface Setup {
  aw: ArrowWorld;
  road: FakeRoad;
  events: string[];
  lookup: (id: string) => TreeNode | undefined;
  /** The bare-line plan of `e` over the vault as it is now. */
  planOf(e: EntityMetadata): RemotePlan;
}

function setup(script?: RoadScript, options: ArrowOptions = {}, trusted: readonly (readonly [string, string])[] = [], others: TreeNode[] = [S1, asNode(STEP)]): Setup {
  const events: string[] = [];
  const box: { aw?: ArrowWorld } = {};
  const lookup = (id: string): TreeNode | undefined => box.aw?.nodes[id] as TreeNode | undefined;
  const road = fakeRoad(script, lookup, events);
  const aw = arrowWorld({ others, sshRoad: road, ...options }, [['r', 'echo root'], ...trusted]);
  box.aw = aw;
  recordDialogs(aw, events);
  return { aw, road, events, lookup, planOf: (e) => planOf(e, lookup) };
}

function planOf(e: EntityMetadata, lookup: (id: string) => TreeNode | undefined): RemotePlan {
  const plan = planLaunch(e, sshLinkOf(e, lookup), { stayOpen: false });
  assert.equal(plan.kind, 'remote', `the plan of ${e.name} is not remote: ${JSON.stringify(plan)}`);
  return plan as RemotePlan;
}

const TRUST = (r: ReadySsh, plan: RemotePlan): string => trustLineFor(r.entity, r.jump, plan.line);
const TYPED = (r: ReadySsh, plan: RemotePlan): string => {
  const typed = typedLine(plan, r, TYPED_SHELL);
  assert.equal(typed.kind, 'typed');
  return (typed as { line: string }).line;
};

const executedAnywhere = (aw: ArrowWorld): string[] => aw.terminals.flatMap((t) => t.executed);
const sentAnywhere = (aw: ArrowWorld): string[] => aw.terminals.flatMap((t) => t.sent);
const only = <T>(list: readonly T[]): T => {
  assert.equal(list.length, 1, `expected one, got ${list.length}`);
  return list[0];
};

/** A chain whose root depends on the steps `ids`, in that order. */
const rootOver = (...ids: string[]): EntityMetadata => ({ ...ROOT, dependsOn: ids });

// ---- the plan (pure) ------------------------------------------------------------------------------------------------

function planChain(steps: readonly EntityMetadata[], refusal: (name: string, os: string | undefined) => string | undefined, lookup?: (id: string) => TreeNode | undefined): ReturnType<typeof planDependencyRun> {
  const root = rootOver(...steps.map((s) => s.id));
  const byId = new Map([root, ...steps].map((n) => [n.id, n]));
  return planDependencyRun([root], (id) => byId.get(id), refusal, undefined, lookup);
}

const here = (id: string): TreeNode | undefined => (id === 's1' ? S1 : undefined);

// D1
test('a_linked_step_is_planned_with_the_bare_line_and_no_os_refusal', () => {
  const plan = planChain([STEP], () => 'refused here', here);
  assert.equal(plan.ok, true, JSON.stringify(plan));
  const steps = (plan as { steps: { remote?: RemotePlan }[] }).steps;
  const remote = only(steps).remote;
  assert.equal(remote?.remoteCommand, 'migrate');
  assert.ok(!remote?.remoteCommand.includes('eval'), 'no stay-open wrapper (D11)');
});

// D2 — GREEN before and after: the agent's start has no lookup and keeps E1's sentence.
test('without_a_lookup_a_linked_step_still_refuses_the_whole_chain', () => {
  assert.deepEqual(planChain([STEP], () => undefined), { ok: false, reason: sshLinkRefusal(STEP) });
});

// D3
test('a_linked_step_for_windows_is_refused_with_the_windows_remote_sentence', () => {
  const windows = { ...STEP, terminalOs: 'windows' };
  const plan = planChain([windows], () => undefined, here);
  const expected = planLaunch(windows, sshLinkOf(windows, here), { stayOpen: false });
  assert.equal(expected.kind, 'refused');
  assert.deepEqual(plan, { ok: false, reason: (expected as { reason: string }).reason });
});

// A3: one test per check that applies to a linked step
test('a_linked_step_that_uses_config_is_refused_with_the_config_sentence', () => {
  const plan = planChain([{ ...STEP, command: 'x {config}' }], () => undefined, here);
  assert.equal(plan.ok, false);
  assert.equal((plan as { reason: string }).reason, `"migrate" ${USES_CONFIG}. Pick it as the VPN's launcher there instead of running it as a dependency.`);
});

test('a_linked_step_with_a_line_break_is_refused', () => {
  const broken = { ...STEP, command: 'echo a\nb' };
  const expected = planLaunch(broken, sshLinkOf(broken, here), { stayOpen: false });
  assert.equal(expected.kind, 'refused');
  assert.deepEqual(planChain([broken], () => undefined, here), { ok: false, reason: (expected as { reason: string }).reason });
});

test('a_linked_step_whose_name_cannot_fill_name_is_refused_as_everywhere', () => {
  const named = { ...STEP, name: 'bad\nname', command: 'echo {name}' };
  const plan = planChain([named], () => undefined, here);
  assert.equal(plan.ok, false);
  assert.match((plan as { reason: string }).reason, /^"bad\nname" cannot run as a dependency: /);
});

test('a_local_os_refusal_is_not_applied_to_a_linked_step_but_still_to_a_local_one', () => {
  const refuseEverything = (name: string): string => `local refusal for ${name}`;
  assert.equal(planChain([{ ...STEP, terminalOs: 'linux' }], refuseEverything, here).ok, true, 'a linked step: Runs on names the remote (D14)');
  assert.deepEqual(planChain([{ ...STEP, sshEntityId: undefined }], refuseEverything, here), { ok: false, reason: 'local refusal for migrate' });
});

// ---- the road -------------------------------------------------------------------------------------------------------

// D4
test('a_linked_step_runs_its_typed_line_and_the_chain_waits_for_its_exit', async () => {
  const s = setup();
  await s.aw.run(ROOT);
  const r1 = only(s.road.readies);
  const plan = s.planOf(STEP);
  assert.deepEqual(terminalNamed(s.aw, CHAIN_TITLE).executed, [TYPED(r1, plan)]);
  assert.ok(!TYPED(r1, plan).includes('eval'), 'the bare line: the step ends and its exit code reaches the chain');
  assert.deepEqual(terminalNamed(s.aw, ROOT_TITLE).sent, ['echo root'], 'the root is typed after the step');
  const modal = s.aw.warnings.find((t) => BEFORE.test(t));
  assert.ok(modal?.includes(`migrate: ${TRUST(r1, plan)}`), modal);
});

test('a_step_that_exits_non_zero_asks_and_stop_runs_nothing_after_it', async () => {
  const s = setup(undefined, { holdExecutions: true, notification: 'Stop' });
  const running = s.aw.run(ROOT);
  await until(() => s.aw.executions.length === 1, 'the step runs');
  s.aw.shell.end(s.aw.executions[0].terminal, s.aw.executions[0].execution, 1);
  await running;
  assert.equal(s.aw.terminals.find((t) => t.name === ROOT_TITLE), undefined, 'the root is not typed');
  assert.ok(s.aw.infos.some((t) => /"migrate" exited with code 1/.test(t)), s.aw.infos.join('\n'));
});

// D5 — the modal comes BEFORE preparation (E2.A A2), so it is shown once; the refusal comes after the preparation.
test('a_password_step_refuses_the_whole_chain_before_any_step_and_cleans', async () => {
  const s = setup(() => ({ password: true }));
  await s.aw.run(ROOT);
  assert.ok(s.aw.warnings.includes(passwordStepRefusal('migrate', 'prod box')), s.aw.warnings.join('\n'));
  assert.deepEqual(executedAnywhere(s.aw), []);
  assert.deepEqual(sentAnywhere(s.aw), [], 'the root is not typed');
  assert.deepEqual(s.road.cleaned, ['s1#1']);
});

test('a_password_step_after_a_local_step_still_runs_nothing', async () => {
  const local = step('lo', 'prep', { sshEntityId: undefined, terminalOs: hostOs });
  const s = setup((ssh) => (ssh.id === 's1' ? { password: true } : {}), {}, [['lo', 'prep']], [S1, asNode(STEP), asNode(local)]);
  await s.aw.run(rootOver('lo', 'st'));
  assert.ok(s.aw.warnings.includes(passwordStepRefusal('migrate', 'prod box')), s.aw.warnings.join('\n'));
  assert.deepEqual(executedAnywhere(s.aw), [], 'the local step before it did not run either: refused before any step runs');
});

// D5 (coai, accepted): the chain stops preparing at the FIRST password step — a later step is not prepared (no PIN or host-key question, no files).
test('a_password_step_stops_the_preparation_so_no_later_step_is_prepared', async () => {
  const second = step('st2', 'seed', { sshEntityId: 's2' });
  const s = setup((ssh) => (ssh.id === 's1' ? { password: true } : {}), {}, [], [S1, S2, asNode(STEP), asNode(second)]);
  await s.aw.run(rootOver('st', 'st2'));
  assert.deepEqual(s.road.calls.map((c) => c.ssh.id), ['s1'], 'step 2 was never prepared');
  assert.ok(s.aw.warnings.includes(passwordStepRefusal('migrate', 'prod box')), s.aw.warnings.join('\n'));
  assert.deepEqual(s.road.cleaned, ['s1#1'], 'the session already prepared is cleaned');
  assert.deepEqual(executedAnywhere(s.aw), []);
});

// D6
test('owner_the_steps_session_is_cleaned_when_the_step_ends', async () => {
  const box: { s?: Setup } = {};
  const cleanedAtRootSend: string[][] = [];
  const s = setup(undefined, { holdExecutions: true, onSend: () => cleanedAtRootSend.push([...(box.s?.road.cleaned ?? [])]) });
  box.s = s;
  const running = s.aw.run(ROOT);
  await until(() => s.aw.executions.length === 1, 'the step runs');
  assert.deepEqual(s.road.cleaned, [], 'while the step runs its files stay');
  s.aw.shell.end(s.aw.executions[0].terminal, s.aw.executions[0].execution, 0);
  await running;
  assert.deepEqual(s.road.cleaned, ['s1#1']);
  assert.deepEqual(cleanedAtRootSend, [['s1#1']], 'cleaned BEFORE the root is sent');
});

// D7
test('owner_a_step_on_the_same_ssh_entry_as_its_parent_leaves_the_parents_files', async () => {
  const root = { ...ROOT, sshEntityId: 's1' };
  // The root's trust line over s1 and the step's are seeded, so only the two preparations are under test.
  const ssh = S1.details as EntityMetadata;
  const trusted: (readonly [string, string])[] = [['r', trustLineFor(ssh, undefined, 'echo root')], ['st', trustLineFor(ssh, undefined, 'migrate')]];
  const s = setup(undefined, {}, trusted);
  await s.aw.run(root);
  assert.deepEqual(s.road.cleaned, ['s1#2'], 'the step ended: only its own files are gone');
  const sent = only(terminalNamed(s.aw, ROOT_TITLE).sent);
  assert.ok(sent.includes('/keys/s1-1.key'), sent);
  assert.ok(!sent.includes('/keys/s1-2.key'), sent);
  s.aw.exit(s.aw.live[ROOT_TITLE]);
  assert.deepEqual(s.road.cleaned, ['s1#2', 's1#1'], 'the root session goes with its terminal');
});

// D8
test('owner_a_stopped_step_preparation_runs_nothing_and_cleans_what_was_prepared', async () => {
  const second = step('st2', 'seed', { sshEntityId: 's2' });
  const s = setup((ssh) => (ssh.id === 's2' ? 'stopped' : {}), {}, [], [S1, S2, asNode(STEP), asNode(second)]);
  await s.aw.run(rootOver('st', 'st2'));
  assert.deepEqual(executedAnywhere(s.aw), []);
  assert.deepEqual(s.road.cleaned, ['s1#1']);
  assert.deepEqual(s.aw.warnings.filter((t) => !BEFORE.test(t)), [], 'stopped is quiet');
});

// D9
test('owner_a_chain_stopped_after_a_typed_step_cleans_every_session', async () => {
  const second = step('st2', 'seed', { sshEntityId: 's2' });
  const s = setup(undefined, { holdExecutions: true, notification: 'Stop' }, [], [S1, S2, asNode(STEP), asNode(second)]);
  const running = s.aw.run(rootOver('st', 'st2'));
  await until(() => s.aw.executions.length === 1, 'the first step runs');
  s.aw.shell.end(s.aw.executions[0].terminal, s.aw.executions[0].execution, 1);
  await running;
  assert.equal(s.aw.executions.length, 1, 'the second step never ran');
  assert.deepEqual([...s.road.cleaned].sort(), ['s1#1', 's2#1']);
});

// D10
test('a_refused_step_preparation_shows_the_remedy_and_runs_nothing', async () => {
  const s = setup(() => 'refused');
  await s.aw.run(ROOT);
  assert.equal(s.road.refusedShown, 1);
  assert.deepEqual(executedAnywhere(s.aw), []);
  assert.deepEqual(sentAnywhere(s.aw), []);
});

// D11
test('the_chain_is_pinned_when_a_step_is_linked_in_a_local_window', async () => {
  const local = step('lo', 'prep', { sshEntityId: undefined });
  const s = setup(undefined, {}, [['lo', 'prep']], [S1, asNode(STEP), asNode(local)]);
  await s.aw.run(rootOver('lo', 'st'));
  const pinned = process.platform === 'win32' ? /^(pwsh|powershell)\.exe$/ : new RegExp(`^${fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh'}$`);
  assert.match(String(terminalNamed(s.aw, CHAIN_TITLE).shellPath), pinned);
  assert.equal(terminalNamed(s.aw, CHAIN_TITLE).executed.length, 2);
});

// D13
test('the_chain_approval_is_keyed_on_the_trust_line', async () => {
  const s = setup();
  await s.aw.run(ROOT);
  const trustLine = TRUST(only(s.road.readies), s.planOf(STEP));
  assert.equal(isCommandTrusted(s.aw.trust, 'st', trustLine), true);
  assert.equal(isCommandTrusted(s.aw.trust, 'st', 'migrate'), false);
});

// ---- E2.A A2: the chain follows the folder model --------------------------------------------------------------------

test('nothing_is_prepared_before_the_chain_modal_is_answered', async () => {
  const s = setup(undefined, { holdDialogs: BEFORE });
  const running = s.aw.run(ROOT);
  await until(() => s.aw.held.length === 1, 'the chain modal');
  assert.deepEqual(s.road.calls, [], 'no prepare while the modal is open');
  assert.ok(s.aw.held[0].text.includes(`migrate: ${trustLineFor(S1.details as EntityMetadata, undefined, 'migrate')}`), s.aw.held[0].text);
  s.aw.held[0].answer('Run');
  await running;
  assert.equal(s.road.calls.length, 1);
  assert.deepEqual(s.events.filter((e) => e.startsWith('prepare ') || e.startsWith('dialog: Before')), ['dialog: ' + s.aw.held[0].text, 'prepare s1#1']);
});

test('a_declined_chain_modal_prepares_nothing', async () => {
  const s = setup(undefined, { modal: 'dismiss' });
  await s.aw.run(ROOT);
  assert.deepEqual(s.road.calls, []);
  assert.deepEqual(s.road.cleaned, []);
  assert.deepEqual(executedAnywhere(s.aw), []);
});

test('a_trusted_chain_is_prepared_without_a_modal', async () => {
  const s = setup(undefined, {}, [['st', trustLineFor(S1.details as EntityMetadata, undefined, 'migrate')]]);
  await s.aw.run(ROOT);
  assert.deepEqual(s.aw.warnings.filter((t) => BEFORE.test(t)), []);
  assert.equal(s.road.calls.length, 1);
  assert.equal(terminalNamed(s.aw, CHAIN_TITLE).executed.length, 1);
});

test('a_host_changed_while_the_modal_is_open_stops_the_chain', async () => {
  const s = setup(undefined, { holdDialogs: BEFORE });
  const running = s.aw.run(ROOT);
  await until(() => s.aw.held.length === 1, 'the chain modal');
  s.aw.nodes.s1 = sshNode('s1', { host: 'evil.example' });
  s.aw.held[0].answer('Run');
  await running;
  assert.ok(s.aw.warnings.includes(changedStepRefusal('migrate')), s.aw.warnings.join('\n'));
  assert.deepEqual(executedAnywhere(s.aw), [], 'nothing ran: not the shown host, not the changed one');
  assert.deepEqual(sentAnywhere(s.aw), []);
  assert.deepEqual(s.road.cleaned, ['s1#1']);
});

test('a_jump_changed_while_the_modal_is_open_stops_the_chain', async () => {
  const withJump = (jump: string): TreeNode => sshNode('s1', { jumpHostEntityId: jump });
  const s = setup(undefined, { holdDialogs: BEFORE }, [], [withJump('j1'), J1, J2, asNode(STEP)]);
  const running = s.aw.run(ROOT);
  await until(() => s.aw.held.length === 1, 'the chain modal');
  s.aw.nodes.s1 = withJump('j2');
  s.aw.held[0].answer('Run');
  await running;
  assert.ok(s.aw.warnings.includes(changedStepRefusal('migrate')), s.aw.warnings.join('\n'));
  assert.deepEqual(executedAnywhere(s.aw), []);
  assert.deepEqual(s.road.cleaned, ['s1#1']);
});

test('a_changed_second_step_stops_the_chain_before_the_first_step_runs_and_cleans_both', async () => {
  const second = step('st2', 'seed', { sshEntityId: 's2' });
  const s = setup(undefined, { holdDialogs: BEFORE }, [], [S1, S2, asNode(STEP), asNode(second)]);
  const running = s.aw.run(rootOver('st', 'st2'));
  await until(() => s.aw.held.length === 1, 'the chain modal');
  s.aw.nodes.s2 = sshNode('s2', { name: 'stage box', host: 'evil.example' });
  s.aw.held[0].answer('Run');
  await running;
  assert.ok(s.aw.warnings.includes(changedStepRefusal('seed')), s.aw.warnings.join('\n'));
  assert.deepEqual(executedAnywhere(s.aw), [], 'the first step did not run either');
  assert.deepEqual([...s.road.cleaned].sort(), ['s1#1', 's2#1']);
});

// ---- E2.A A4: preparation inside the owner --------------------------------------------------------------------------

test('owner_a_throw_at_the_second_steps_prepare_cleans_the_first', async () => {
  const second = step('st2', 'seed', { sshEntityId: 's2' });
  const s = setup(undefined, {}, [], [S1, S2, asNode(STEP), asNode(second)]);
  const prepare = s.road.prepare;
  s.road.prepare = (accountId, ssh) => (ssh.id === 's2' ? Promise.reject(new Error('the vault is down')) : prepare(accountId, ssh));
  await assert.rejects(s.aw.run(rootOver('st', 'st2')), /the vault is down/);
  assert.deepEqual(s.road.cleaned, ['s1#1']);
  assert.deepEqual(executedAnywhere(s.aw), []);
  assert.deepEqual(sentAnywhere(s.aw), []);
});

test('owner_a_closed_chain_terminal_cleans_the_steps_not_yet_run', async () => {
  const second = step('st2', 'seed', { sshEntityId: 's2' });
  const s = setup(undefined, { integration: false }, [], [S1, S2, asNode(STEP), asNode(second)]);
  await s.aw.run(rootOver('st', 'st2'));
  assert.deepEqual(executedAnywhere(s.aw), []);
  assert.deepEqual([...s.road.cleaned].sort(), ['s1#1', 's2#1'], 'the terminal closed before it was ready: the finally cleans every session');
});
