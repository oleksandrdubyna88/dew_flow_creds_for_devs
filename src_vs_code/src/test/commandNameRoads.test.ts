import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { after, test } from 'node:test';
import { resolveCommand, shownCommandLine } from '../commandLine';
import { NAME_REFUSAL, nameRefusal } from '../commandName';
import { isCommandTrusted } from '../commandTrust';
import { shellRead } from '../runPlan';
import { chainTerminalTitle, maskedRunTitle } from '../terminalTitles';
import { CommandArg, EntityMetadata } from '../types';
import { arrowWorld, vaultOf } from './arrowWorld';
import { memoryTrust, ownerChain, rootTitle, startVpn, terminalNamed, world } from './vpnWorld';
import { cleanupScope } from '../../scripts/lib/leftovers.cjs';

/** Every folder this file makes is owned and claimed, and removed when the file's tests end. */
const scope = cleanupScope();
after(() => scope.close());

/**
 * `{name}` on every road that runs an entry's line (parent `PLAN_terminal_folder_run.md` §1, story S2): the green
 * arrow, Run with Secrets, a dependency step, a VPN launcher. The invariant: what the modal shows, what the trust
 * store approves, and what the terminal or the child gets is ONE string, `resolveCommand(entry).line`.
 */

function E(name: string, command: string, args?: CommandArg[]): EntityMetadata {
  return { id: 'e1', name, isSshEnabled: false, isTerminal: true, command, commandArgs: args };
}

const RUN_THIS = /Run this command/;

function modals(aw: { warnings: string[] }): string[] {
  return aw.warnings.filter((t) => RUN_THIS.test(t));
}

/** The refusal sentence the arrow says, for a name that is not on the allow-list. */
function willNotRun(name: string): string {
  return `"${name}" will not run: ${NAME_REFUSAL}`;
}

// ---------- the green arrow ----------

test('the_arrow_displays_approves_fingerprints_and_types_one_string', async () => {
  const entry = E('alert', 'tmux attach', [{ value: '-t {name}' }]);
  const L = 'tmux attach -t alert';
  const aw = arrowWorld();
  await aw.run(entry);
  assert.equal(modals(aw).length, 1, aw.warnings.join('\n'));
  assert.ok(modals(aw)[0].includes(`\n\n${L}\n\n`), modals(aw)[0]);
  assert.equal(isCommandTrusted(aw.trust, 'e1', L), true, 'the resolved line is what the store approved');
  assert.deepEqual(terminalNamed(aw, rootTitle('alert')).sent, [L]);
});

test('the_arrow_refuses_a_name_with_no_modal_and_types_nothing', async () => {
  const aw = arrowWorld();
  await aw.run(E('a b', 'tmux attach', [{ value: '-t {name}' }]));
  assert.deepEqual(modals(aw), [], 'nobody is asked to approve a line that will not run');
  assert.deepEqual(aw.warnings, [willNotRun('a b')]);
  assert.deepEqual(aw.terminals, []);
  assert.deepEqual(aw.trust.get(), []);
});

test('a_rename_asks_again_and_types_the_new_line', async () => {
  const entry = E('alert', 'tmux attach', [{ value: '-t {name}' }]);
  const aw = arrowWorld();
  await aw.run(entry);
  await aw.run({ ...entry, name: 'bravo' });
  assert.equal(modals(aw).length, 2, aw.warnings.join('\n'));
  assert.deepEqual(terminalNamed(aw, rootTitle('alert')).sent, ['tmux attach -t alert']);
  assert.deepEqual(terminalNamed(aw, rootTitle('bravo')).sent, ['tmux attach -t bravo']);
});

test('the_name_and_the_terminal_title_are_both_details_name', async () => {
  const aw = arrowWorld();
  await aw.run(E('alert', 'x {name}'), 'other');
  assert.deepEqual(terminalNamed(aw, rootTitle('alert')).sent, ['x alert']);
  assert.equal(aw.terminals.length, 1, 'nothing opened under the node name');
});

test('a_history_row_titles_its_terminal_from_that_versions_details_name', async () => {
  const aw = arrowWorld();
  const live = E('alert', 'x {name}');
  await aw.runRevision(live, { name: 'row-name', details: E('older', 'x {name}') });
  assert.deepEqual(aw.terminals.map((t) => [t.name, t.sent]), [[rootTitle('older'), ['x older']]]);
});

test('an_empty_command_still_says_so_as_before', async () => {
  const aw = arrowWorld();
  await aw.run(E('alert', ''));
  assert.deepEqual(aw.warnings, ['"alert" has no command yet — edit it and fill in the command.']);
  assert.deepEqual(aw.terminals, []);
});

test('a_literal_in_an_old_entry_is_asked_about_once', async () => {
  // Vouched for when `{name}` meant nothing: the line it types now is another one.
  const aw = arrowWorld({}, [['e1', 'jq {name}']]);
  await aw.run(E('alert', 'jq {name}'));
  assert.equal(modals(aw).length, 1, aw.warnings.join('\n'));
  assert.ok(modals(aw)[0].includes('\n\njq alert\n\n'), modals(aw)[0]);
  assert.deepEqual(terminalNamed(aw, rootTitle('alert')).sent, ['jq alert']);
});

// ---------- Run with Secrets ----------

const TOKEN_REF: CommandArg[] = [{ value: 'creds://me/{name}/password' }];

test('the_masked_run_is_titled_creds_run', async () => {
  const aw = arrowWorld({}, [], vaultOf(['alert']).source);
  await aw.runWithSecrets(E('alert', 'tool', TOKEN_REF), 'node-alert');
  assert.equal(aw.masked.length, 1, aw.warnings.join('\n'));
  assert.equal(aw.masked[0].name, maskedRunTitle('node-alert'), "the title keeps the NODE's name, as before; only the prefix changed");
});

test('a_reference_holding_the_token_resolves', async () => {
  const vault = vaultOf(['alert']);
  const aw = arrowWorld({}, [], vault.source);
  await aw.runWithSecrets(E('alert', 'tool', TOKEN_REF));
  assert.equal(aw.masked.length, 1, aw.warnings.join('\n'));
  assert.equal(aw.masked[0].commandLine, 'tool ' + shellRead('CREDS_REF_1', process.platform, undefined));
  assert.equal(aw.masked[0].env.CREDS_REF_1, 'correct-horse-battery');
  assert.ok(modals(aw)[0].includes('\n\ntool creds://me/alert/password\n\n'), modals(aw)[0]);
});

test('a_refused_name_runs_nothing_and_reads_no_secret', async () => {
  const vault = vaultOf(['alert']);
  const aw = arrowWorld({}, [], vault.source);
  await aw.runWithSecrets(E('a b', 'tool', TOKEN_REF));
  assert.deepEqual(aw.masked, []);
  assert.deepEqual(vault.calls, []);
  assert.deepEqual(modals(aw), []);
  assert.deepEqual(aw.warnings, [willNotRun('a b')]);
});

test('secrets_approve_and_fingerprint_the_resolved_line', async () => {
  const aw = arrowWorld({}, [], vaultOf(['alert']).source);
  await aw.runWithSecrets(E('alert', 'tool', TOKEN_REF));
  assert.equal(isCommandTrusted(aw.trust, 'e1', 'tool creds://me/alert/password'), true);
  assert.equal(isCommandTrusted(aw.trust, 'e1', 'tool creds://me/{name}/password'), false, 'the template was not what was approved');
});

const PLAIN_AND_DISABLED_TOKEN: CommandArg[] = [{ value: 'creds://me/other/password' }, { value: 'creds://me/{name}/password', disabled: true }];

test('a_disabled_row_holding_the_token_is_no_reference', async () => {
  const aw = arrowWorld({}, [], vaultOf(['other']).source);
  await aw.runWithSecrets(E('alert', 'tool', PLAIN_AND_DISABLED_TOKEN));
  assert.equal(aw.masked.length, 1, aw.warnings.join('\n'));
  assert.deepEqual(Object.keys(aw.masked[0].env), ['CREDS_REF_1']);
  assert.equal(aw.masked[0].env.CREDS_REF_1, 'correct-horse-battery');
});

test('a_refused_name_used_only_by_a_disabled_row_still_runs', async () => {
  const aw = arrowWorld({}, [], vaultOf(['other']).source);
  await aw.runWithSecrets(E('a b', 'tool', PLAIN_AND_DISABLED_TOKEN));
  assert.equal(aw.masked.length, 1, aw.warnings.join('\n'));
  assert.deepEqual(Object.keys(aw.masked[0].env), ['CREDS_REF_1']);
});

test('a_disabled_literal_reference_is_scanned_as_today', async () => {
  const aw = arrowWorld({}, [], vaultOf(['other', 'other2']).source);
  const rows: CommandArg[] = [{ value: 'creds://me/other/password', disabled: true }, { value: 'creds://me/other2/notes' }];
  await aw.runWithSecrets(E('alert', 'tool', rows));
  assert.equal(aw.masked.length, 1, aw.warnings.join('\n'));
  assert.deepEqual(Object.keys(aw.masked[0].env), ['CREDS_REF_1', 'CREDS_REF_2']);
  const line = aw.masked[0].commandLine ?? ''; // optional in the record since E3.S1 (an argv run has none); a local run always has one
  assert.ok(line.includes('CREDS_REF_2'));
  assert.ok(!line.includes('CREDS_REF_1'), line);
});

test('the_token_alone_is_no_reference', async () => {
  const aw = arrowWorld({}, [], vaultOf(['alert']).source);
  await aw.runWithSecrets(E('alert', 'tool {name}'));
  assert.ok(aw.warnings.some((t) => /holds no creds:\/\/ reference/.test(t)), aw.warnings.join('\n'));
  assert.deepEqual(aw.masked, []);
});

// ---------- a dependency step and a VPN launcher ----------

test('a_chain_step_runs_its_resolved_line', async () => {
  const nodes = ownerChain();
  nodes.install = { ...nodes.install, name: 'install-openvpn', command: 'installer {name}' };
  const w = world({});
  const trust = memoryTrust();
  const { dir } = await startVpn(scope, w, nodes, { trust });
  try {
    assert.ok(w.warnings.some((t) => t.includes('install-openvpn: installer install-openvpn')), w.warnings.join('\n'));
    assert.deepEqual(terminalNamed(w, chainTerminalTitle('ops relay stage')).executed, ['installer install-openvpn']);
    assert.equal(isCommandTrusted(trust, 'install', 'installer install-openvpn'), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A launcher whose command holds both tokens, and a VPN that depends on nothing. */
function launcherWorld(launcherName: string): Record<string, EntityMetadata> {
  const { start, vpn } = ownerChain();
  return {
    start: { ...start, name: launcherName, command: 'openvpn --config {config} --remote {name}', dependsOn: [] },
    vpn: { ...vpn, dependsOn: [], runDependencies: false },
  };
}

test('the_launcher_fingerprint_keeps_config_and_fills_name', async () => {
  const w = world({});
  const trust = memoryTrust();
  const { dir } = await startVpn(scope, w, launcherWorld('start-openvpn'), { trust });
  try {
    const line = 'openvpn --config {config} --remote start-openvpn';
    assert.ok(modals(w).some((t) => t.includes(`\n\n${line}\n\n`)), w.warnings.join('\n'));
    assert.equal(isCommandTrusted(trust, 'start', line), true);
    assert.match(terminalNamed(w, rootTitle('start-openvpn')).sent[0], /^openvpn --config '.*' --remote start-openvpn$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a_refused_step_refuses_the_whole_chain', async () => {
  const nodes = ownerChain();
  nodes.install = { ...nodes.install, command: 'installer {name}' };
  const w = world({});
  const { started, dir } = await startVpn(scope, w, nodes);
  try {
    assert.equal(started, false);
    assert.deepEqual(
      w.terminals.flatMap((t) => [...t.executed, ...t.sent]),
      [],
      'nothing was typed anywhere',
    );
    assert.ok(w.warnings.some((t) => t.startsWith('"install openvpn" cannot run as a dependency: ')), w.warnings.join('\n'));
    assert.ok(!w.warnings.some((t) => /^Before /.test(t)), 'the chain modal never opened');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a_refused_launcher_warns_and_starts_nothing', async () => {
  const w = world({});
  const { started, dir } = await startVpn(scope, w, launcherWorld('start openvpn'));
  try {
    assert.equal(started, false);
    assert.deepEqual(w.terminals, []);
    assert.ok(w.warnings.some((t) => t.startsWith('The launcher "start openvpn" will not start: ')), w.warnings.join('\n'));
    assert.deepEqual(modals(w), [], 'no trust modal for a line that will not run');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Sanity on the fixtures the rows above lean on: the names are what the allow-list says they are.
test('the_fixture_names_are_the_ones_the_rows_mean', () => {
  assert.equal(nameRefusal('start-openvpn'), undefined);
  assert.equal(nameRefusal('install-openvpn'), undefined);
  assert.equal(nameRefusal('start openvpn'), NAME_REFUSAL);
  assert.equal(resolveCommand(E('alert', 'tmux attach', [{ value: '-t {name}' }])).kind, 'ready');
  assert.equal(shownCommandLine(E('alert', 'x {name}')), 'x alert');
});
