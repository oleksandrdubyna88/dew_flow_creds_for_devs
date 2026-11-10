import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { isCommandTrusted } from '../commandTrust';
import { CHANGED_ROW, FolderFacts, planFolderRun, refusedRowReason, sshStopped } from '../folderRun';
import { RemotePlan, planLaunch, shownTrustLine, sshLinkOf, trustLineFor, typedLine } from '../remoteLaunch';
import { USES_CONFIG } from '../vpnLauncher';
import type { EntityMetadata, TreeNode } from '../types';
import { FOLDER, FolderWorld, FolderWorldOptions, L, T, choose, clickAndWait, everyText, folderModals, folderWorld, held, named, session, step } from './folderWorld';
import { FakeRoad, RoadScript, fakeRoad, recordDialogs, sshNode } from './sshRoadWorld';
import { cleanupScope } from '../../scripts/lib/leftovers.cjs';

/**
 * E2.S2 of `PLAN_terminal_command_over_ssh_E2.md`: *Run All in Folder* with linked rows. The modal shows each linked row's
 * trust line; after the modal and the chain, every linked row is prepared in row order, before the synchronous send; a
 * refused or changed row fails alone; a stopped row stops the WHOLE run; the run's `finally` cleans every session it did
 * not hand to a terminal, also when a later preparation throws (E2.A A4). The seam is the fake road of `sshRoadWorld.ts`.
 */

const scope = cleanupScope();
after(() => scope.close());

const S1 = sshNode('s1');
const S2 = sshNode('s2', { name: 'stage box', host: 'stage.example' });
const S3 = sshNode('s3', { name: 'dev box', host: 'dev.example' });
const J1 = sshNode('j1', { name: 'jump one', host: 'jump1.example' });
const J2 = sshNode('j2', { name: 'jump two', host: 'jump2.example' });
const SSH_ENTRIES = [S1, S2, S3, J1, J2];
const TYPED_SHELL = { shellPath: '/bin/bash', family: 'posix' as const };

/** A Terminal row of the folder that runs over the SSH entry `ssh`. */
const linked = (name: string, ssh: string, extra: Partial<EntityMetadata> = {}): EntityMetadata => session(name, { sshEntityId: ssh, ...extra });

interface Setup {
  w: FolderWorld;
  road: FakeRoad;
  /** Dialogs, prepares, executions and sends, in the order they happened. */
  events: string[];
  /** What was already typed anywhere at each `prepare`, in call order. */
  sentAtPrepare: string[][];
  lookup: (id: string) => TreeNode | undefined;
  /** The plan of `row` over the vault as it is now. */
  planOf(row: EntityMetadata): RemotePlan;
  /** What the modal shows for `row`, read from the vault as it is now. */
  shown(row: EntityMetadata): string;
}

const sshDetails = (nodes: readonly TreeNode[] = SSH_ENTRIES): EntityMetadata[] => nodes.map((n) => n.details as EntityMetadata);

interface SetupOptions extends FolderWorldOptions {
  script?: RoadScript;
  /** The folder's modal waits for the test. */
  waiting?: boolean;
  /** SSH entries other than the default five, by id. */
  ssh?: readonly TreeNode[];
}

function setup(entries: readonly EntityMetadata[], options: SetupOptions = {}): Setup {
  const { script, waiting, ssh, outside, ...rest } = options;
  const events: string[] = [];
  const box: { w?: FolderWorld } = {};
  const lookup = (id: string): TreeNode | undefined => box.w?.nodes.find((n) => n.id === id);
  const road = fakeRoad(script, lookup, events);
  const sentAtPrepare: string[][] = [];
  const prepare = road.prepare;
  road.prepare = (accountId, entity) => {
    sentAtPrepare.push(box.w?.terminals.flatMap((t) => t.sent) ?? []);
    return prepare(accountId, entity);
  };
  const worldOptions: FolderWorldOptions = {
    outside: [...sshDetails(ssh), ...(outside ?? [])],
    sshRoad: road,
    onExecute: (line) => events.push(`execute: ${line}`),
    onSend: (name) => events.push(`send: ${name}`),
    ...rest,
  };
  const w = (waiting === true ? held : folderWorld)(entries, worldOptions);
  box.w = w;
  recordDialogs(w, events);
  const planOf = (row: EntityMetadata): RemotePlan => {
    const plan = planLaunch(row, sshLinkOf(row, lookup), { stayOpen: true });
    assert.equal(plan.kind, 'remote', `the plan of ${row.name} is not remote: ${JSON.stringify(plan)}`);
    return plan as RemotePlan;
  };
  const shown = (row: EntityMetadata): string => {
    const answer = shownTrustLine(planOf(row), lookup);
    assert.equal(answer.kind, 'shown');
    return (answer as { line: string }).line;
  };
  return { w, road, events, sentAtPrepare, lookup, planOf, shown };
}

const TYPED = (s: Setup, row: EntityMetadata, ready = s.road.readies[0]): string => {
  const typed = typedLine(s.planOf(row), ready, TYPED_SHELL);
  assert.equal(typed.kind, 'typed');
  return (typed as { line: string }).line;
};

const sentOf = (w: FolderWorld, name: string): string[] => named(w, name).flatMap((t) => t.sent);
const everySent = (w: FolderWorld): string[] => w.terminals.flatMap((t) => t.sent);

/** Replace a node of the vault, as a sync that wrote a new record does while a modal sits. */
function replaceNode(w: FolderWorld, node: TreeNode): void {
  const at = w.nodes.findIndex((n) => n.id === node.id);
  assert.ok(at >= 0, `no node ${node.id}`);
  w.nodes[at] = node;
}

const stopsAt = (id: string): RoadScript => (ssh) => (ssh.id === id ? 'stopped' : {});

// ---- the modal and the order ----------------------------------------------------------------------------------

// F1
test('the_modal_shows_each_linked_rows_trust_line', async () => {
  const b = linked('b', 's1');
  const s = setup([session('a'), b]);
  await s.w.click();
  const modal = folderModals(s.w)[0];
  assert.ok(modal.includes(`b: ${s.shown(b)}`), modal);
  assert.ok(modal.includes(`a: ${L('a')}`), modal);
  assert.ok(!modal.includes('Not run:'), modal);
});

// F2
test('linked_rows_are_prepared_in_row_order_after_the_modal_and_the_chain_and_before_any_typing', async () => {
  const b = linked('b', 's1', { dependsOn: ['dep'], runDependencies: true });
  const s = setup([session('a'), b, linked('c', 's2')], { outside: [step('dep')], trusted: [['dep', 'do-dep']] });
  await s.w.click();
  const marks: [RegExp, (e: string) => string][] = [
    [/^dialog: Run the entries of /, () => 'modal'],
    [/^execute: /, (e) => e],
    [/^prepare /, (e) => e],
    [/^send: /, () => 'send'],
  ];
  const labels = s.events.flatMap((e) => marks.filter(([pattern]) => pattern.test(e)).map(([, label]) => label(e)));
  assert.deepEqual(labels, ['modal', 'execute: do-dep', 'prepare s1#1', 'prepare s2#1', 'send', 'send', 'send'], s.events.join('\n'));
  assert.deepEqual(s.sentAtPrepare, [[], []], 'nothing was typed when a row was prepared');
  assert.equal(sentOf(s.w, 'b').length, 1);
  assert.equal(sentOf(s.w, 'c').length, 1);
});

// ---- a refused row, a stopped row -----------------------------------------------------------------------------

// F3
test('a_refused_row_is_reported_and_the_others_are_typed', async () => {
  const b = linked('b', 's1');
  const s = setup([session('a'), b, linked('c', 's2')], { script: (ssh) => (ssh.id === 's1' ? 'refused' : {}) });
  await s.w.click();
  assert.equal(s.road.calls.length, 2, 'both linked rows were prepared');
  assert.deepEqual(sentOf(s.w, 'a'), [L('a')]);
  assert.deepEqual(sentOf(s.w, 'c'), [TYPED(s, linked('c', 's2'), s.road.readies[0])]);
  assert.deepEqual(sentOf(s.w, 'b'), []);
  assert.ok(everyText(s.w).includes(refusedRowReason('prod box')), everyText(s.w));
  assert.equal(s.road.refusedShown, 0, 'no modal per row');
});

// F4
test('a_stopped_row_stops_the_whole_run_and_cleans_every_prepared_row', async () => {
  const s = setup([linked('b', 's1'), linked('c', 's2'), linked('d', 's3')], { script: stopsAt('s2') });
  await s.w.click();
  assert.deepEqual(everySent(s.w), []);
  assert.equal(s.road.calls.length, 2, 'no prepare after the stop');
  assert.deepEqual(s.road.cleaned, ['s1#1']);
  assert.ok(s.w.warnings.includes(sshStopped(FOLDER)), s.w.warnings.join('\n'));
  assert.ok(s.w.terminals.every((t) => t.disposed === 0), 'no terminal was closed');
});

// F5
test('cancel_after_mixed_linked_and_unlinked_rows_types_no_row', async () => {
  const s = setup([session('a'), linked('b', 's1'), session('c'), linked('d', 's2')], { script: stopsAt('s2') });
  await s.w.click();
  assert.deepEqual(named(s.w, 'a'), []);
  assert.deepEqual(named(s.w, 'c'), []);
  assert.deepEqual(everySent(s.w), []);
  assert.deepEqual(s.road.cleaned, ['s1#1']);
  assert.ok(s.w.warnings.includes(sshStopped(FOLDER)), s.w.warnings.join('\n'));
});

// F5b: the first linked row stops: nothing was prepared before it, nothing to clean, nothing typed.
test('a_stop_at_the_first_linked_row_types_the_unlinked_rows_after_it_nowhere_either', async () => {
  const s = setup([linked('b', 's1'), session('c')], { script: stopsAt('s1') });
  await s.w.click();
  assert.equal(s.road.calls.length, 1, 'the first linked row was prepared, and it stopped the run');
  assert.deepEqual(everySent(s.w), []);
  assert.deepEqual(named(s.w, 'c'), []);
  assert.deepEqual(s.road.cleaned, []);
});

// ---- the snapshot ---------------------------------------------------------------------------------------------

// F6
test('snapshot_a_jump_host_changed_while_the_modal_was_open_is_not_typed', async () => {
  const b = linked('b', 's1');
  const s = setup([session('a'), b], { waiting: true, ssh: [sshNode('s1', { jumpHostEntityId: 'j1' }), J1, J2] });
  const { done, modal } = await clickAndWait(s.w);
  const shown = s.shown(b);
  assert.ok(modal.text.includes(shown), 'the modal showed the jump through j1');
  replaceNode(s.w, sshNode('s1', { jumpHostEntityId: 'j2' }));
  choose(modal, 'first');
  await done;
  assert.deepEqual(sentOf(s.w, 'b'), []);
  assert.ok(everyText(s.w).includes(CHANGED_ROW), everyText(s.w));
  assert.ok(s.road.cleaned.includes('s1#1'), 'the changed row is cleaned');
  assert.deepEqual(sentOf(s.w, 'a'), [L('a')]);
});

// F7
test('snapshot_a_host_changed_while_the_modal_was_open_is_not_typed', async () => {
  const s = setup([session('a'), linked('b', 's1')], { waiting: true });
  const { done, modal } = await clickAndWait(s.w);
  replaceNode(s.w, sshNode('s1', { host: 'moved.example' }));
  choose(modal, 'first');
  await done;
  assert.deepEqual(sentOf(s.w, 'b'), []);
  assert.ok(everyText(s.w).includes(CHANGED_ROW), everyText(s.w));
  assert.ok(s.road.cleaned.includes('s1#1'), 'the changed row is cleaned');
  assert.deepEqual(sentOf(s.w, 'a'), [L('a')]);
});

// ---- the owner ------------------------------------------------------------------------------------------------

// F8
test('owner_an_unsent_linked_row_is_cleaned_by_the_runs_finally', async () => {
  const s = setup([linked('b', 's1')], { waiting: true });
  const { done, modal } = await clickAndWait(s.w);
  s.w.list(s.w.open(T('b')));
  choose(modal, 'first');
  await done;
  assert.deepEqual(sentOf(s.w, 'b'), []);
  assert.ok(everyText(s.w).includes('Left alone, terminal already open: b'), everyText(s.w));
  assert.deepEqual(s.road.cleaned, ['s1#1']);
});

// F9
test('owner_a_typed_row_is_handed_to_its_terminal', async () => {
  const s = setup([linked('b', 's1')]);
  await s.w.click();
  assert.equal(sentOf(s.w, 'b').length, 1);
  assert.deepEqual(s.road.cleaned, [], 'a typed row keeps its session while its terminal lives');
  s.w.exit(s.w.live[T('b')]);
  assert.deepEqual(s.road.cleaned, ['s1#1']);
});

// F10
test('owner_a_failed_send_is_the_rows_failure_and_is_cleaned', async () => {
  const s = setup([session('a'), linked('b', 's1')], { failSend: /b$/ });
  await s.w.click();
  assert.deepEqual(sentOf(s.w, 'a'), [L('a')]);
  assert.deepEqual(sentOf(s.w, 'b'), []);
  assert.ok(everyText(s.w).includes('no line for'), everyText(s.w));
  assert.deepEqual(s.road.cleaned, ['s1#1']);
});

// A4
test('owner_a_throw_in_a_later_preparation_cleans_the_earlier_rows_and_types_nothing', async () => {
  const s = setup([session('a'), linked('b', 's1'), linked('c', 's2')]);
  const prepare = s.road.prepare;
  s.road.prepare = (accountId, ssh) => (ssh.id === 's2' ? Promise.reject(new Error('the second preparation threw')) : prepare(accountId, ssh));
  await assert.rejects(s.w.click(), /the second preparation threw/);
  assert.deepEqual(everySent(s.w), []);
  assert.deepEqual(s.road.cleaned, ['s1#1'], 'row one was prepared before the throw, and its session was cleaned');
});

// ---- the typed line, the password, the trust ------------------------------------------------------------------

// F11
test('a_password_row_opens_a_new_terminal_with_its_env', async () => {
  const b = linked('b', 's1');
  const s = setup([b], { script: () => ({ password: true }) });
  await s.w.click();
  assert.equal(s.road.readies.length, 1, 'the row was prepared');
  const ready = s.road.readies[0];
  assert.ok(ready.env !== undefined, 'the scripted session carries an environment');
  assert.deepEqual(named(s.w, 'b')[0].env, ready.env);
  assert.deepEqual(sentOf(s.w, 'b'), [TYPED(s, b)]);
});

// F11b: the PowerShell 5.1 refusal belongs to the row, after its preparation (E2-D6).
test('a_typed_line_refusal_cleans_the_row_and_the_others_are_typed', async () => {
  const bad = linked('b', 's1', { command: 'echo "x"', commandArgs: [] });
  const s = setup([session('a'), bad]);
  const env = s.w.vscode.env as { remoteName?: string; shell?: string };
  env.remoteName = 'wsl'; // a WSL window reads a typed ssh line in its default profile
  env.shell = 'powershell.exe';
  await s.w.click();
  assert.deepEqual(sentOf(s.w, 'b'), []);
  assert.ok(everyText(s.w).includes('PowerShell 5.1'), everyText(s.w));
  assert.deepEqual(s.road.cleaned, ['s1#1']);
});

// F12
test('one_approval_covers_the_folder_and_the_arrow', async () => {
  const b = linked('b', 's1');
  const s = setup([session('a'), b]);
  const trustLine = s.shown(b);
  assert.equal(isCommandTrusted(s.w.trust, 'b', trustLine), false);
  await s.w.click();
  assert.equal(isCommandTrusted(s.w.trust, 'b', trustLine), true);
  await s.w.arrow('b');
  assert.equal(s.road.calls.length, 2, 'the arrow got as far as its preparation');
  assert.deepEqual(s.w.warnings.filter((text) => /Run this command/.test(text)), [], 'no trust modal');
});

test('the_trusted_line_is_the_one_the_prepared_snapshot_gives', async () => {
  const b = linked('b', 's1');
  const s = setup([b]);
  await s.w.click();
  assert.equal(s.road.readies.length, 1, 'the row was prepared');
  const ready = s.road.readies[0];
  assert.equal(trustLineFor(ready.entity, ready.jump, s.planOf(b).line), s.shown(b));
});

// ---- the plan: which local checks apply to a linked row (E2.A A3) ---------------------------------------------

const node = (details: EntityMetadata): TreeNode => ({ id: details.id, name: details.name, type: 'entity', details });
const VAULT: ReadonlyMap<string, TreeNode> = new Map([['s1', S1]]);
const FACTS: FolderFacts = { shellRefusal: () => 'not this window', isOpen: () => false, lookup: (id) => VAULT.get(id) };

type Row = { kind: string; name: string; reason?: string; line?: string };
const rowOf = (details: EntityMetadata, facts: FolderFacts = FACTS): Row => {
  const rows = planFolderRun([node(details)], facts).rows as unknown as Row[];
  assert.equal(rows.length, 1);
  return rows[0];
};

// F13
test('the_plan_gives_a_linked_row_no_local_os_refusal_and_refuses_a_windows_remote', () => {
  const ok = rowOf(linked('b', 's1', { terminalOs: 'linux' }));
  assert.equal(ok.kind, 'run', `a linked row is not asked the local shell question: ${JSON.stringify(ok)}`);
  const windows = linked('b', 's1', { terminalOs: 'windows' });
  const refused = rowOf(windows);
  assert.equal(refused.kind, 'notRun');
  const plan = planLaunch(windows, sshLinkOf(windows, (id) => VAULT.get(id)), { stayOpen: true });
  assert.equal(plan.kind, 'refused');
  assert.equal(refused.reason, (plan as { reason: string }).reason);
});

// A3: the local OS check is NOT applied to a linked row; it still is to an unlinked one.
test('a3_a_local_os_refusal_is_not_applied_to_a_linked_row_but_is_to_an_unlinked_one', () => {
  assert.equal(rowOf(linked('b', 's1')).kind, 'run');
  assert.deepEqual(rowOf(session('b')), { kind: 'notRun', id: 'b', name: 'b', reason: 'not this window' });
});

// A3: `{config}` is a file on this machine.
test('a3_a_linked_row_whose_line_uses_config_is_refused', () => {
  const row = rowOf(linked('b', 's1', { command: 'openvpn --config {config}', commandArgs: [] }));
  assert.equal(row.kind, 'notRun');
  assert.equal(row.reason, USES_CONFIG);
});

// A3: control characters — in the line (planLaunch P6) and in the name (the folder's own rule).
test('a3_a_linked_row_with_a_line_break_in_its_line_is_refused', () => {
  const details = linked('b', 's1', { command: 'echo a\necho b', commandArgs: [] });
  const row = rowOf(details);
  assert.equal(row.kind, 'notRun');
  const plan = planLaunch(details, sshLinkOf(details, (id) => VAULT.get(id)), { stayOpen: true });
  assert.equal(plan.kind, 'refused');
  assert.equal(row.reason, (plan as { reason: string }).reason);
});

test('a3_a_linked_row_whose_name_holds_a_control_character_is_refused', () => {
  const row = rowOf(linked('b\tb', 's1', { id: 'tab', command: 'uptime', commandArgs: [] }));
  assert.equal(row.kind, 'notRun');
  assert.match(row.reason ?? '', /control character/);
});

// A3: the `{name}` rule, as on every road.
test('a3_the_name_rule_applies_to_a_linked_row_as_on_every_road', () => {
  const details = linked('a b', 's1', { id: 'space' });
  const row = rowOf(details);
  assert.equal(row.kind, 'notRun');
  const plan = planLaunch(details, sshLinkOf(details, (id) => VAULT.get(id)), { stayOpen: true });
  assert.equal(plan.kind, 'refused');
  assert.equal(row.reason, (plan as { reason: string }).reason);
  assert.match(row.reason ?? '', /name/);
});

test('a_linked_row_whose_ssh_entry_is_missing_says_why_in_the_plan', () => {
  const details = linked('b', 'gone');
  const row = rowOf(details);
  const link = sshLinkOf(details, () => undefined);
  assert.equal(link.kind, 'refused');
  assert.deepEqual(row, { kind: 'notRun', id: 'b', name: 'b', reason: (link as { reason: string }).reason });
});

test('a_linked_row_is_shown_by_its_trust_line_and_carries_its_plan', () => {
  const details = linked('b', 's1');
  const rows = planFolderRun([node(details)], FACTS).rows as unknown as { line: string; remote?: RemotePlan }[];
  const plan = planLaunch(details, sshLinkOf(details, (id) => VAULT.get(id)), { stayOpen: true }) as RemotePlan;
  const shown = shownTrustLine(plan, (id) => VAULT.get(id));
  assert.equal(shown.kind, 'shown');
  assert.equal(rows[0].line, (shown as { line: string }).line);
  assert.equal(rows[0].remote?.line, L('b'));
});
