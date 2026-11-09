import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCommandTrusted } from '../commandTrust';
import { CLOSE_AND_RUN, MAX_QUESTION_CHARACTERS } from '../folderRun';
import { FOLDER, FolderWorld, L, T, choose, clickAndWait, everyText, folderModals, folderWorld, held, modalNumber, named, needing, session, step } from './folderWorld';
import { hostOs } from './vpnWorld';

/**
 * The folder run where it meets the rest of the window (parent `PLAN_terminal_folder_run.md` §3, story S5): names that try to draw
 * rows, the character bound, what the closing button types, a terminal a flow creates, and the in-flight mark. The world is
 * `folderWorld.ts`, as for `folderRunCommand.test.ts`, which this file was split from at the 800-line limit.
 */

const BEFORE = `CredsForDevs: before ${FOLDER}`;
const BUSY_QUESTION = /was not typed/;

// ---- Names that try to draw rows --------------------------------------------------------------------------

test('a_name_with_a_newline_is_not_run_and_cannot_draw_a_row_in_the_folder_modal', async () => {
  const forged = 'a\n2. (new) b';
  const entry = session('forged', { name: forged, command: 'ls', commandArgs: [] });
  const w = folderWorld([entry, session('ok')]);

  await w.click();

  const rows = folderModals(w)[0].split('\n').filter((text) => /^\d+\. /.test(text));
  assert.deepEqual(rows, [`1. (new) ok: ${L('ok')}`], 'one row, and the name drew none');
  assert.ok(folderModals(w)[0].includes('\n\nNot run:\na\\u000a2. (new) b — its name holds a control character'), folderModals(w)[0]);
  assert.equal(named(w, forged).length, 0);
  assert.equal(isCommandTrusted(w.trust, 'forged', 'ls'), false);
  assert.deepEqual(w.infos, [`Typed 1 of 2 in "${FOLDER}". Not run: a\\u000a2. (new) b — its name holds a control character: rename it to run it here. Typed: ok.`]);
});

test('a_line_with_a_control_character_is_shown_escaped_and_typed_unchanged', async () => {
  const line = 'echo hi\r\nrm -rf ~';
  const w = folderWorld([session('e', { command: line, commandArgs: [] })]);

  await w.click();

  assert.ok(folderModals(w)[0].includes('1. (new) e: echo hi\\u000d\\u000arm -rf ~\n'), folderModals(w)[0]);
  assert.deepEqual(named(w, 'e').map((t) => t.sent), [[line]], 'what is typed is the approved string, unchanged');
  assert.equal(isCommandTrusted(w.trust, 'e', line), true);
});

test('a_name_with_a_middle_dot_runs_and_stays_readable', async () => {
  const name = 'a\u00b7b';
  const w = folderWorld([session('e', { name, command: 'ls', commandArgs: [] })]);

  await w.click();

  assert.ok(folderModals(w)[0].includes(`1. (new) ${name}: ls`), folderModals(w)[0]);
  assert.deepEqual(named(w, name).map((t) => t.sent), [['ls']]);
  assert.deepEqual(w.infos, [`Typed 1 of 1 in "${FOLDER}". Typed: ${name}.`]);
});

test('a_step_name_with_a_newline_cannot_draw_a_row_in_the_chain_modal', async () => {
  const w = folderWorld([needing('a', 'dep')], { outside: [{ ...step('dep'), name: 'dep\n2. evil', command: 'do\r\nit' }] });

  await w.click();

  const chain = w.warnings.find((text) => text.startsWith('Before '));
  assert.ok(chain !== undefined, 'the chain modal was asked');
  assert.deepEqual(chain.split('\n').filter((text) => /^\d+\. /.test(text)), ['1. dep\\u000a2. evil: do\\u000d\\u000ait']);
});

test('the_chain_modal_of_the_arrow_escapes_too', async () => {
  const w = folderWorld([needing('a', 'dep')], { outside: [{ ...step('dep'), name: 'dep\n2. evil' }], trusted: [['a', L('a')]] });

  await w.arrow('a');

  const chain = w.warnings.find((text) => text.startsWith('Before '));
  assert.ok(chain !== undefined, 'the chain modal was asked');
  assert.deepEqual(chain.split('\n').filter((text) => /^\d+\. /.test(text)), ['1. dep\\u000a2. evil: do-dep']);
});

// ---- The character bound ------------------------------------------------------------------------------------

test('a_question_over_the_bound_refuses_with_no_modal_and_types_nothing', async () => {
  const w = folderWorld([session('a', { command: 'x'.repeat(MAX_QUESTION_CHARACTERS), commandArgs: [] })]);

  await w.click();

  assert.equal(w.terminals.length, 0);
  assert.equal(folderModals(w).length, 0);
  assert.equal(w.warnings.length, 1);
  assert.match(w.warnings[0], /^The question for "claude sessions" would run to \d+ characters, and a folder run shows at most 4000/);
});

test('the_bound_is_judged_on_the_question_as_it_will_be_shown_new_marks_included', async () => {
  const probe = folderWorld([session('a', { command: 'x', commandArgs: [] })], { trusted: [['a', 'x']], modal: 'dismiss' });
  await probe.click();
  const line = 'x'.repeat(MAX_QUESTION_CHARACTERS - folderModals(probe)[0].length + 1);
  const entry = session('a', { command: line, commandArgs: [] });
  const trusted = folderWorld([entry], { trusted: [['a', line]], modal: 'dismiss' });
  const fresh = folderWorld([entry], { modal: 'dismiss' });

  await trusted.click();
  await fresh.click();

  assert.equal(folderModals(trusted)[0].length, MAX_QUESTION_CHARACTERS, 'a trusted line is exactly at the bound, and asked');
  assert.equal(folderModals(fresh).length, 0, 'the same line with (new) and its note is over it');
  assert.match(fresh.warnings[0], /would run to 40\d\d characters/);
});

// ---- The closing button types the open rows ------------------------------------------------------------------

test('under_the_closing_button_the_open_rows_are_typed_in_row_order_trusted_and_roots', async () => {
  const typed: string[] = [];
  const w: FolderWorld = folderWorld([session('a'), needing('o', 'dep'), session('z')], {
    preopened: [T('o')],
    outside: [step('dep')],
    modal: 'last',
    onSend: (name) => {
      assert.equal(isCommandTrusted(w.trust, 'o', L('o')), true, `trusted before ${name} was typed`);
      typed.push(name);
    },
  });

  await w.click();

  assert.deepEqual(typed, [T('a'), T('o'), T('z')]);
  assert.deepEqual(w.terminals.filter((t) => t.name === BEFORE).map((t) => t.executed), [['do-dep']], 'the open row is a root of the chain');
  assert.deepEqual(named(w, 'o').map((t) => [t.disposed, t.sent]), [[1, []], [0, [L('o')]]]);
  assert.deepEqual(w.infos, [`Typed 3 of 3 in "${FOLDER}". Typed: a, o, z.`]);
});

test('a_closed_terminal_with_no_replacement_says_it_was_closed', async () => {
  const w = folderWorld([session('a'), session('o')], { preopened: [T('o')], modal: 'last', failCreate: / \/ o$/ });

  await w.click();

  assert.equal(named(w, 'o')[0].disposed, 1);
  assert.equal(w.warnings[w.warnings.length - 1], `Typed 1 of 2 in "${FOLDER}". Not run: o — its terminal was closed, and its line was not typed: no terminal for ${T('o')}. Typed: a.`);
  assert.deepEqual(w.infos, []);
});

test('a_closed_terminal_whose_replacement_took_no_line_says_it_was_closed', async () => {
  const w = folderWorld([session('o')], { preopened: [T('o')], failSend: / \/ o$/ });

  await w.click();

  assert.deepEqual(named(w, 'o').map((t) => [t.disposed, t.sent]), [[1, []], [0, []]]);
  assert.equal(w.warnings[w.warnings.length - 1], `Typed 0 of 1 in "${FOLDER}". Not run: o — its terminal was closed, and its line was not typed: no line for ${T('o')}.`);
});

test('a_closed_terminal_whose_replacement_was_refused_says_it_was_closed', async () => {
  const other = hostOs === 'windows' ? 'linux' : 'windows';
  const w = held([session('o', { terminalOs: other })], { preopened: [T('o')] });
  const env = w.vscode.env as { remoteName?: string };
  env.remoteName = 'ssh-remote'; // that computer's OS is not ours to know, so the plan lets the row through
  const { done, modal } = await clickAndWait(w);

  env.remoteName = undefined; // and by the time it is typed, this window can refuse it
  choose(modal, 'last');
  await done;

  assert.equal(named(w, 'o')[0].disposed, 1);
  assert.match(w.warnings[w.warnings.length - 1], /^Typed 0 of 1 in ".*"\. Not run: o — its terminal was closed, and its line was not typed: "o" /);
});

test('a_failure_with_nothing_closed_claims_no_close', async () => {
  const w = held([session('o')], { preopened: [T('o')], failCreate: / \/ o$/ });
  const { done, modal } = await clickAndWait(w);

  w.exit(w.live[T('o')]);
  choose(modal, 'last');
  await done;

  assert.equal(named(w, 'o')[0].disposed, 0);
  assert.equal(w.warnings[w.warnings.length - 1], `Typed 0 of 1 in "${FOLDER}". Not run: o — no terminal for ${T('o')}.`);
});

// ---- What a flow creates is listed at once ---------------------------------------------------------------------

test('a_second_folder_click_reads_what_the_first_typed_into_as_open', async () => {
  const w = held([session('a')]);
  const first = await clickAndWait(w);
  choose(first.modal, 'first');
  await first.done;

  const second = w.click();
  const modal = await modalNumber(w, 2);

  assert.ok(modal.text.includes(`Terminal already open:\n1. a: ${L('a')}`), modal.text);
  assert.deepEqual(modal.buttons, [CLOSE_AND_RUN]);
  modal.answer(undefined);
  await second;
  assert.deepEqual(named(w, 'a').map((t) => [t.sent, t.disposed]), [[[L('a')], 0]]);
});

test('the_arrow_reads_the_object_the_folder_run_typed_into_and_types_silently_once_its_command_is_seen_finished', async () => {
  const w = folderWorld([session('a')], { holdDialogs: BUSY_QUESTION });
  await w.click();
  const t = w.live[T('a')];

  const armed = w.arrow('a');
  const first = await modalNumber(w, 1);
  assert.match(first.text, /cannot tell/, 'the folder run typed, and no start has been seen');
  first.answer(undefined);
  await armed;

  const c = w.shell.start(t);
  const running = w.arrow('a');
  const second = await modalNumber(w, 2);
  assert.match(second.text, /is still running a command/, 'the object the folder run typed into');
  second.answer(undefined);
  await running;

  w.shell.end(t, c, 0);
  await w.arrow('a');

  assert.equal(w.held.length, 2, 'no third question');
  assert.deepEqual(named(w, 'a').map((n) => n.sent), [[L('a'), L('a')]], 'one terminal, typed into twice');
});

test('after_a_split_name_the_folder_run_and_the_arrow_find_the_same_terminal', async () => {
  const w = folderWorld([session('alert')]);
  const node = w.nodes.find((n) => n.id === 'alert');
  assert.ok(node !== undefined, 'the entry is in the tree');
  node.name = 'other';
  await w.click();

  await w.arrow('alert');

  assert.deepEqual(w.terminals.map((t) => t.name), [T('alert')], 'the arrow found it, and opened none under the node name');
  assert.ok(w.warnings.some((text) => text.includes(`cannot tell whether "${T('alert')}"`)), w.warnings.join('\n'));
});

test('after_a_split_name_the_folder_run_reads_the_terminal_the_arrow_opened_as_open', async () => {
  const w = folderWorld([session('alert')], { trusted: [['alert', L('alert')]], modal: 'dismiss' });
  const node = w.nodes.find((n) => n.id === 'alert');
  assert.ok(node !== undefined, 'the entry is in the tree');
  node.name = 'other';
  await w.arrow('alert');

  await w.click();

  assert.deepEqual(w.terminals.map((t) => t.name), [T('alert')]);
  assert.ok(folderModals(w)[0].includes(`Terminal already open:\n1. alert: ${L('alert')}`), folderModals(w)[0]);
});

// ---- The in-flight mark --------------------------------------------------------------------------------------

test('the_in_flight_mark_is_released_on_a_throw', async () => {
  const w = folderWorld([session('a')], { failTrust: true });

  await assert.rejects(w.click(), /the store is down/);
  await assert.rejects(w.click(), /the store is down/, 'the second click reached the modal, and went on to the same store');

  assert.equal(folderModals(w).length, 2);
  assert.equal(w.terminals.length, 0);
  assert.doesNotMatch(everyText(w), /already waiting/);
});
