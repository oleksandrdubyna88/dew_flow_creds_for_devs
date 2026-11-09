import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { isCommandTrusted } from '../commandTrust';
import { CLOSE_AND_RUN, NO_FOLDER_TARGET, RUN } from '../folderRun';
import type { TreeNode } from '../types';
import { FOLDER, FolderWorld, L, T, choose, clickAndWait, everyText, folderModals, folderWorld, held, modalNumber, named, needing, session, step } from './folderWorld';
import { LiveTerminal, hostOs, until } from './vpnWorld';

/**
 * The folder run, end to end under the `vscode` stub: the real handler of `registerRunCommands`, over a real display
 * order, with the real trust store, guard, pinned-shell decision and dependency chain. Every terminal is a record of what
 * was typed into it and how often it was disposed; a dispose closes nothing here (the worst case VS Code allows).
 */

const BEFORE = `CredsForDevs: before ${FOLDER}`;

/** The window's default shell is not a shell of this OS, so an entry written for this OS takes the pinned road. */
function pin(w: FolderWorld): void {
  (w.vscode.env as { shell?: string }).shell = process.platform === 'win32' ? '/bin/bash' : 'pwsh';
}

function listedLive(w: FolderWorld, name: string, shellPath?: string): LiveTerminal {
  return w.list(w.open(T(name), shellPath));
}

// ---- The run --------------------------------------------------------------------------------------------------

test('a_run_types_each_line_into_its_own_new_terminal_and_reports_typed', async () => {
  const w = folderWorld([session('a'), session('b')]);

  await w.click();

  assert.deepEqual(named(w, 'a').map((t) => t.sent), [[L('a')]]);
  assert.deepEqual(named(w, 'b').map((t) => t.sent), [[L('b')]]);
  assert.deepEqual(w.infos, [`Typed 2 of 2 in "${FOLDER}". Typed: a, b.`]);
  assert.doesNotMatch(everyText(w), /started/i);
});

test('the_modal_is_always_shown_even_when_every_line_is_trusted', async () => {
  const w = folderWorld([session('a')], { trusted: [['a', L('a')]] });

  await w.click();

  assert.equal(folderModals(w).length, 1);
  assert.doesNotMatch(folderModals(w)[0], /\(new\)/);
});

test('a_dismissed_modal_runs_nothing_and_trusts_nothing', async () => {
  const fresh = folderWorld([session('a')], { modal: 'dismiss' });
  const known = folderWorld([session('a')], { modal: 'dismiss', trusted: [['a', L('a')]] });

  await fresh.click();
  await known.click();

  assert.equal(fresh.terminals.length, 0);
  assert.equal(isCommandTrusted(fresh.trust, 'a', L('a')), false);
  assert.deepEqual(fresh.infos, []);
  assert.equal(known.terminals.length, 0, 'a trusted line is not typed past a dismissal either');
});

test('approving_trusts_each_typed_line_and_new_marks_the_untrusted', async () => {
  const w = folderWorld([session('a'), session('b')], { trusted: [['b', L('b')]] });

  await w.click();

  assert.ok(folderModals(w)[0].includes(`1. (new) a: ${L('a')}\n2. b: ${L('b')}`), folderModals(w)[0]);
  assert.equal(isCommandTrusted(w.trust, 'a', L('a')), true);
});

test('all_lines_are_trusted_though_the_store_rewrites_its_whole_list', async () => {
  const names = ['a', 'b', 'c', 'd'];
  const w = folderWorld(names.map((n) => session(n)), { slowTrust: true });

  await w.click();

  for (const name of names) {
    assert.equal(isCommandTrusted(w.trust, name, L(name)), true, `${name} is trusted`);
  }
});

test('the_line_typed_is_the_approved_string_even_if_the_entry_changed_meanwhile', async () => {
  const w = held([session('a')]);
  const { done, modal } = await clickAndWait(w);

  const node = w.nodes.find((n) => n.id === 'a');
  assert.ok(node?.details, 'the entry is in the tree');
  node.details.commandArgs = [{ value: '-t evil' }];
  choose(modal, 'first');
  await done;

  assert.deepEqual(named(w, 'a')[0].sent, [L('a')]);
});

test('thirty_three_lines_refuse_with_no_modal', async () => {
  const w = folderWorld(Array.from({ length: 33 }, (_, i) => session(`e${i}`)));

  await w.click();

  assert.equal(w.terminals.length, 0);
  assert.equal(w.warnings.length, 1);
  assert.match(w.warnings[0], /has 33 entries that could run/);
});

test('thirty_two_lines_all_run', async () => {
  const w = folderWorld(Array.from({ length: 32 }, (_, i) => session(`e${i}`)));

  await w.click();

  assert.equal(w.terminals.length, 32);
});

test('nothing_with_a_line_reports_with_no_modal', async () => {
  const w = folderWorld([session('a b')]);

  await w.click();

  assert.equal(w.warnings.length, 1);
  assert.ok(w.warnings[0].startsWith(`Typed 0 of 1 in "${FOLDER}". Not run: a b — `), w.warnings[0]);
});

test('the_activity_is_noted_first', async () => {
  const w = folderWorld([session('a')]);

  await w.click();
  assert.equal(w.activity(), 1);
  await w.click({ kind: 'nothing' });

  assert.equal(w.activity(), 2, 'also on a refused target');
});

// ---- Left alone, and the re-check ------------------------------------------------------------------------------

test('run_leaves_an_open_terminal_alone_types_the_rest_and_does_not_trust_its_line', async () => {
  const w = folderWorld([session('a'), session('o')], { preopened: [T('o')] });

  await w.click();

  assert.deepEqual(named(w, 'o').map((t) => [t.sent, t.disposed]), [[[], 0]]);
  assert.equal(isCommandTrusted(w.trust, 'o', L('o')), false);
  assert.deepEqual(named(w, 'a')[0].sent, [L('a')]);
  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Left alone, terminal already open: o. Typed: a.`]);
});

test('the_open_test_is_any_shell', async () => {
  const w = folderWorld([session('a'), session('o', { terminalOs: hostOs })]);
  pin(w);
  listedLive(w, 'o', '/some/other/shell');

  await w.click();

  assert.deepEqual(named(w, 'o').map((t) => t.sent), [[]], 'the pinned road same-shell test would have called this free');
});

test('a_run_row_whose_terminal_appeared_while_the_modal_sat_moves_to_open', async () => {
  const w = held([session('a'), session('b')]);
  const { done, modal } = await clickAndWait(w);

  w.list(w.open(T('a')));
  choose(modal, 'first');
  await done;

  assert.deepEqual(named(w, 'a').map((t) => t.sent), [[]]);
  assert.deepEqual(named(w, 'b')[0].sent, [L('b')]);
  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Left alone, terminal already open: a. Typed: b.`]);
});

test('a_terminal_opened_while_the_chain_ran_moves_its_row_to_open', async () => {
  const w: FolderWorld = folderWorld([needing('a', 'dep'), session('b')], {
    outside: [step('dep')],
    onExecute: () => void w.list(w.open(T('a'))),
  });

  await w.click();

  assert.deepEqual(named(w, 'a').map((t) => t.sent), [[]]);
  assert.deepEqual(named(w, 'b')[0].sent, [L('b')]);
  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Left alone, terminal already open: a. Typed: b.`]);
});

test('an_open_row_whose_terminal_closed_under_run_is_not_run_saying_so', async () => {
  const w = held([session('a'), session('o')], { preopened: [T('o')] });
  const { done, modal } = await clickAndWait(w);

  w.exit(w.live[T('o')]);
  choose(modal, 'first');
  await done;

  assert.deepEqual(named(w, 'o').map((t) => t.sent), [[]], 'Run approved no line for it');
  assert.equal(isCommandTrusted(w.trust, 'o', L('o')), false);
  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Not run: o — its terminal closed while the question was open, and Run approved no line for it. Typed: a.`]);
  assert.doesNotMatch(w.infos[0], /already open/);
});

// ---- Close Open Terminals and Run ---------------------------------------------------------------------------

test('with_only_open_rows_the_only_button_closes', async () => {
  const w = held([session('o')], { preopened: [T('o')] });
  const { done, modal } = await clickAndWait(w);

  assert.deepEqual(modal.buttons, [CLOSE_AND_RUN]);
  modal.answer(undefined);
  await done;

  assert.equal(named(w, 'o')[0].disposed, 0);
  assert.deepEqual(w.infos, []);
});

test('both_buttons_when_both_kinds_of_row_exist', async () => {
  const w = held([session('a'), session('o')], { preopened: [T('o')] });
  const { done, modal } = await clickAndWait(w);

  assert.deepEqual(modal.buttons, [RUN, CLOSE_AND_RUN]);
  modal.answer(undefined);
  await done;
});

test('close_closes_every_live_terminal_of_the_name_in_any_shell_and_types_into_a_new_one', async () => {
  const w = folderWorld([session('a'), session('o', { terminalOs: hostOs })], { modal: 'last' });
  pin(w);
  listedLive(w, 'o');
  listedLive(w, 'o', '/some/other/shell');

  await w.click();

  assert.deepEqual(named(w, 'o').map((t) => [t.disposed, t.sent]), [[1, []], [1, []], [0, [L('o')]]]);
  assert.equal(isCommandTrusted(w.trust, 'o', L('o')), true);
  assert.deepEqual(w.infos, [`Typed 2 of 2 in "${FOLDER}". Typed: a, o.`]);
});

test('a_new_terminal_never_comes_from_find', async () => {
  const w = folderWorld([session('o')], { preopened: [T('o')] });

  await w.click();

  assert.deepEqual(
    named(w, 'o').map((t) => [t.sent, t.disposed]),
    [[[], 1], [[L('o')], 0]],
    'the world leaves a disposed terminal listed and live, so a find would type into it',
  );
});

test('nothing_reads_the_terminal_list_after_a_close', async () => {
  const w = folderWorld([session('a'), session('o'), session('z')], { preopened: [T('o')], modal: 'last' });

  await w.click();

  assert.equal(named(w, 'o')[0].disposed, 1, 'the fixture ran: o was closed before z was typed');
  assert.equal(named(w, 'z')[0].sent.length, 1, 'the fixture ran: z was typed after o was closed');
  assert.equal(w.listReadsAfterDispose(), 0);
});

test('a_terminal_opened_while_the_modal_sat_stays_open_and_its_row_is_left_alone', async () => {
  const w = held([session('a'), session('o')], { preopened: [T('o')] });
  const { done, modal } = await clickAndWait(w);

  w.list(w.open(T('o')));
  choose(modal, 'last');
  await done;

  assert.deepEqual(named(w, 'o').map((t) => [t.sent, t.disposed]), [[[], 0], [[], 0]], 'the newcomer was never authorised');
  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Left alone, terminal already open: o. Typed: a.`]);
});

test('an_authorised_terminal_that_exits_while_the_modal_sat_is_not_disposed_and_its_line_is_typed', async () => {
  const w = held([session('o')], { preopened: [T('o')] });
  const { done, modal } = await clickAndWait(w);

  w.exit(w.live[T('o')]);
  choose(modal, 'last');
  await done;

  assert.deepEqual(named(w, 'o').map((t) => [t.disposed, t.sent]), [[0, []], [0, [L('o')]]]);
});

test('an_authorised_terminal_that_started_a_command_while_the_modal_sat_is_still_closed', async () => {
  const w = held([session('o')], { preopened: [T('o')] });
  const { done, modal } = await clickAndWait(w);

  w.shell.start(w.live[T('o')]);
  choose(modal, 'last');
  await done;

  assert.equal(named(w, 'o')[0].disposed, 1, 'the modal said closing ends whatever runs there');
});

test('closing_comes_after_the_chain_is_ready', async () => {
  const seen: number[] = [];
  const w: FolderWorld = folderWorld([needing('o', 'dep')], {
    preopened: [T('o')],
    outside: [step('dep')],
    modal: 'last',
    onExecute: () => seen.push(named(w, 'o')[0].disposed),
  });

  await w.click();

  assert.deepEqual(seen, [0]);
  assert.equal(named(w, 'o')[0].disposed, 1, 'afterwards');
});

test('a_chain_refusal_types_nothing_and_closes_nothing', async () => {
  const w = folderWorld([needing('o', 'bad')], { preopened: [T('o')], outside: [{ ...step('bad'), terminalOs: 'plan9' }], modal: 'last' });

  await w.click();

  assert.deepEqual(named(w, 'o').map((t) => [t.sent, t.disposed]), [[[], 0]]);
  assert.equal(w.warnings.filter((text) => /plan9/.test(text)).length, 1, w.warnings.join('\n'));
  assert.ok(w.warnings.includes(`Nothing was typed in "${FOLDER}" and no entry's terminal was closed: the dependencies did not finish.`), w.warnings.join('\n'));
  assert.deepEqual(w.infos, []);
});

test('a_declined_chain_types_nothing_and_closes_nothing', async () => {
  const w = held([needing('o', 'dep')], { preopened: [T('o')], outside: [step('dep')], holdDialogs: /^(Run the entries|Before )/ });
  const done = w.click();

  choose(await modalNumber(w, 1), 'last');
  const second = await modalNumber(w, 2);
  assert.match(second.text, new RegExp(`^Before "${FOLDER}", these run in`));
  second.answer(undefined);
  await done;

  assert.deepEqual(named(w, 'o').map((t) => [t.sent, t.disposed]), [[[], 0]]);
});

// ---- Refusals, overlap, failures -----------------------------------------------------------------------------

test('the_handler_refuses_in_code', async () => {
  const any = folderWorld([session('a')], { folder: { folderType: 'any' } });
  const trashed = folderWorld([session('a')], { folder: { parentId: 'trash' }, trash: true });
  const none = folderWorld([session('a')]);
  const entry = folderWorld([session('a')]);

  await any.click();
  await trashed.click();
  await none.click(undefined);
  await entry.click({ kind: 'node', accountId: 'a1', node: { id: 'a', name: 'a', type: 'entity' } });

  for (const w of [any, trashed, none, entry]) {
    assert.equal(w.terminals.length, 0);
    assert.equal(w.warnings.length, 1);
    assert.equal(w.activity(), 1);
  }
  assert.match(any.warnings[0], /is not a Terminal folder/);
  assert.match(trashed.warnings[0], /is in the Trash/);
  assert.equal(none.warnings[0], NO_FOLDER_TARGET);
  assert.match(entry.warnings[0], /"a" is not a folder/);
});

test('a_second_click_while_the_modal_is_open_does_nothing', async () => {
  const w = held([session('a')]);
  const { done, modal } = await clickAndWait(w);

  const second = w.click(); // not awaited: without the mark it would sit in a second modal and hang the suite
  await until(() => w.infos.length === 1 || w.held.length === 2, 'the second click to answer');
  w.held.slice(1).forEach((extra) => extra.answer(undefined)); // only a broken mark gets here; it must fail the test, not hang it
  choose(modal, 'first');
  await Promise.all([done, second]);

  assert.equal(folderModals(w).length, 1);
  assert.equal(w.infos[0], `A run of "${FOLDER}" is already waiting for you or for its dependencies, so this click did nothing.`);
  assert.deepEqual(named(w, 'a').map((t) => t.sent), [[L('a')]]);
});

test('two_folders_whose_account_and_folder_ids_join_to_the_same_text_do_not_block_each_other', async () => {
  const w = held([session('a')]);
  const terminalFolder = (id: string, name: string): TreeNode => ({ id, name, type: 'folder', folderType: 'terminal', parentId: null });
  const entry = (id: string, parentId: string): TreeNode => ({ id, name: id, type: 'entity', parentId, details: session(id) });
  w.nodes.push(terminalFolder('b/c', 'one'), entry('x', 'b/c'), terminalFolder('c', 'two'), entry('y', 'c'));
  const clickOn = (accountId: string, id: string): Promise<void> => w.click({ kind: 'node', accountId, node: w.nodes.find((n) => n.id === id) });

  const first = clickOn('a', 'b/c'); // the pairs ('a', 'b/c') and ('a/b', 'c') both read `a/b/c` when joined with a slash
  await modalNumber(w, 1);
  const second = clickOn('a/b', 'c'); // not awaited: if the two block each other it answers with an info instead of a modal
  await until(() => w.infos.length === 1 || w.held.length === 2, 'the second click to answer');
  const modalsHeld = w.held.length;
  w.held.forEach((dialog) => dialog.answer(undefined));
  await Promise.all([first, second]);

  assert.equal(modalsHeld, 2, w.infos.join('\n'));
  assert.ok(!w.infos.some((text) => /already waiting/.test(text)));
});

test('a_second_click_while_the_chain_runs_does_nothing', async () => {
  let again: Promise<void> | undefined;
  const w: FolderWorld = folderWorld([needing('a', 'dep')], {
    outside: [step('dep')],
    onExecute: () => {
      again ??= w.click();
    },
  });

  await w.click();
  await again;

  assert.equal(folderModals(w).length, 1);
  assert.equal(named(w, 'a').length, 1);
});

test('the_next_click_asks_again_after_a_dismissal', async () => {
  const w = folderWorld([session('a')], { modal: 'dismiss' });

  await w.click();
  await w.click();

  assert.equal(folderModals(w).length, 2);
});

test('another_folder_is_not_held_up', async () => {
  const w = held([session('a')], { subfolders: ['s'] });
  const { done, modal } = await clickAndWait(w);

  await w.click({ kind: 'node', accountId: 'a1', node: { id: 'sub-s', name: 's', type: 'folder', folderType: 'terminal' } });
  modal.answer(undefined);
  await done;

  assert.ok(w.infos[0].startsWith('"s" has no entries of its own to run. '), w.infos[0]);
  assert.ok(!w.infos.some((text) => /already waiting/.test(text)));
});

test('one_failure_at_opening_does_not_stop_the_rest', async () => {
  const w = folderWorld([session('a'), session('b'), session('c')], { failCreate: / \/ b$/ });

  await w.click();

  assert.deepEqual(named(w, 'a').map((t) => t.sent), [[L('a')]]);
  assert.deepEqual(named(w, 'c').map((t) => t.sent), [[L('c')]]);
  assert.equal(named(w, 'b').length, 0);
  assert.equal(w.warnings[w.warnings.length - 1], `Typed 2 of 3 in "${FOLDER}". Not run: b — no terminal for ${T('b')}. Typed: a, c.`);
  assert.deepEqual(w.infos, []);
});

test('one_failure_at_typing_does_not_stop_the_rest', async () => {
  const w = folderWorld([session('a'), session('b')], { failSend: / \/ a$/ });

  await w.click();

  assert.deepEqual(named(w, 'b').map((t) => t.sent), [[L('b')]]);
  assert.match(w.warnings[w.warnings.length - 1], /^Typed 1 of 2 in ".*"\. Not run: a — no line for .*\. Typed: b\.$/);
});

test('the_tracker_hears_of_the_send_before_the_keystrokes_leave', async () => {
  const log: string[] = [];
  const w = folderWorld([session('a')], {
    mocks: { './terminalActivityTracker': { noteSent: () => log.push('noted'), activityOf: () => 'unknown' } },
    onSend: (_name, line) => log.push(`sent ${line}`),
  });

  await w.click();

  assert.deepEqual(log, ['noted', `sent ${L('a')}`]);
});

test('a_pinned_entry_opens_with_the_pinned_shell_and_a_default_one_without', async () => {
  const w = folderWorld([session('p', { terminalOs: hostOs }), session('d')]);
  pin(w);

  await w.click();

  assert.notEqual(named(w, 'p')[0].shellPath, undefined);
  assert.equal(named(w, 'd')[0].shellPath, undefined);
});

test('opening_disposes_nothing_on_the_run_button', async () => {
  const w = folderWorld([session('a')], { preopened: [T('a-other')] });

  await w.click();

  assert.ok(w.terminals.length >= 2);
  assert.deepEqual(w.terminals.map((t) => t.disposed), w.terminals.map(() => 0));
});

// ---- The chain ---------------------------------------------------------------------------------------------

test('roots_are_only_the_lines_to_be_typed_a_skipped_entry_does_not_rerun_its_dependencies', async () => {
  const w = folderWorld([session('a'), needing('o', 'dep')], { preopened: [T('o')], outside: [step('dep')] });

  await w.click();

  assert.equal(w.terminals.filter((t) => t.name === BEFORE).length, 0);
  assert.deepEqual(named(w, 'a')[0].sent, [L('a')]);
});

test('close_makes_an_open_row_a_root', async () => {
  const w = folderWorld([session('a'), needing('o', 'dep')], { preopened: [T('o')], outside: [step('dep')], modal: 'last' });

  await w.click();

  assert.deepEqual(w.terminals.filter((t) => t.name === BEFORE).map((t) => t.executed), [['do-dep']]);
});

test('run_dependencies_false_on_every_root_opens_no_chain_and_asks_nothing_more', async () => {
  const w = folderWorld([session('a', { dependsOn: ['dep'], runDependencies: false })], { outside: [step('dep')] });

  await w.click();

  assert.deepEqual(w.terminals.map((t) => t.name), [T('a')]);
  assert.equal(w.warnings.length, 1, 'the folder modal and nothing else');
});

test('a_sibling_named_in_depends_on_is_not_a_step_and_not_awaited', async () => {
  const w = folderWorld([needing('a', 'b', 'dep'), session('b')], { outside: [step('dep')] });

  await w.click();

  assert.deepEqual(w.terminals.filter((t) => t.name === BEFORE).map((t) => t.executed), [['do-dep']]);
  assert.deepEqual(named(w, 'b')[0].sent, [L('b')]);
});

test('a_refused_sibling_named_in_depends_on_does_not_refuse_the_chain', async () => {
  const w = folderWorld([needing('a', 'c d'), session('c d')]);

  await w.click();

  assert.deepEqual(named(w, 'a')[0].sent, [L('a')]);
  assert.ok(w.infos[0].includes('Not run: c d — '), w.infos[0]);
});

test('a_sibling_passes_on_its_own_dependencies_when_a_typed_line_names_it', async () => {
  const w = folderWorld([needing('a', 'o'), needing('o', 'dep')], { preopened: [T('o')], outside: [step('dep')] });

  await w.click();

  assert.deepEqual(w.terminals.filter((t) => t.name === BEFORE).map((t) => t.executed), [['do-dep']]);
  assert.deepEqual(named(w, 'o').map((t) => t.sent), [[]], 'visitNode follows an excluded entry edges, as for a launcher: this pins it');
});

test('siblings_in_a_circle_refuse_the_chain_and_type_nothing', async () => {
  const w = folderWorld([needing('a', 'b'), needing('b', 'a')]);

  await w.click();

  assert.equal(w.terminals.length, 0);
  assert.ok(w.warnings.some((text) => text.includes('depend on each other in a circle')), w.warnings.join('\n'));
});

test('a_missing_dependency_with_no_step_asks_nothing_more', async () => {
  const w = folderWorld([needing('a', 'gone')]);

  await w.click();

  assert.equal(w.warnings.length, 1);
  assert.deepEqual(named(w, 'a')[0].sent, [L('a')]);
});

test('a_failed_step_stopped_by_the_person_types_nothing', async () => {
  const w = folderWorld([needing('a', 'dep')], { outside: [step('dep')], exitCodes: { 'do-dep': 1 }, notification: 'Stop' });

  await w.click();

  assert.equal(named(w, 'a').length, 0);
});

test('the_chain_modal_names_the_folder', async () => {
  const w = folderWorld([needing('a', 'dep')], { outside: [step('dep')] });

  await w.click();

  assert.ok(w.warnings.some((text) => text.startsWith(`Before "${FOLDER}", these run in `)), w.warnings.join('\n'));
});

test('the_chain_modal_of_a_folder_says_to_edit_the_entry_that_lists_a_missing_row', async () => {
  const w = folderWorld([needing('a', 'dep', 'gone')], { outside: [step('dep')] });

  await w.click();

  const chain = w.warnings.find((text) => text.startsWith('Before '));
  assert.ok(chain !== undefined, 'the chain modal was asked');
  assert.ok(chain.includes('edit the entry that lists the missing row under Depends on, and remove that row.'), chain);
  assert.ok(!chain.includes(`edit "${FOLDER}"`), 'a folder has no Depends on of its own');
});

// ---- The manifest ------------------------------------------------------------------------------------------

test('the_manifest_hides_the_command_from_the_palette', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
    contributes: { commands: { command: string; title: string; category?: string }[]; menus: { commandPalette: { command: string; when?: string }[] } };
  };

  const command = manifest.contributes.commands.find((c) => c.command === 'credSshManager.runFolder');
  assert.equal(command?.title, 'Run All in Folder');
  assert.equal(command?.category, 'CredsForDevs');
  assert.deepEqual(manifest.contributes.menus.commandPalette.find((m) => m.command === 'credSshManager.runFolder'), {
    command: 'credSshManager.runFolder',
    when: 'false',
  });
});
