import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NAME_REFUSAL } from '../commandName';
import { READ_EACH_LINE } from '../dependencyRun';
import {
  CLOSE_AND_RUN,
  FolderFacts,
  FolderNotice,
  FolderOutcome,
  FolderPlan,
  FolderRow,
  LineRow,
  MAX_FOLDER_LINES,
  MAX_QUESTION_CHARACTERS,
  NO_FOLDER_TARGET,
  RUN,
  beforeAsking,
  chainStopped,
  failedAfterClosing,
  folderButtons,
  folderQuestion,
  folderReport,
  folderTarget,
  lineRows,
  linesToType,
  planFolderRun,
  reportNotice,
  settleRow,
} from '../folderRun';
import { CommandArg, EntityMetadata, TreeNode } from '../types';

/**
 * The pure half of the folder run. Importing `../folderRun` directly, with no `vscode` stub, is the proof that it holds none.
 */

const FACTS: FolderFacts = { shellRefusal: () => undefined, isOpen: () => false };

const ARGS: CommandArg[] = [{ value: '-t {name}' }];

/** A Terminal entry as a node of the tree; `extra` overrides the details (and so the id, when it holds one). */
function term(name: string, command = 'tmux attach', args: CommandArg[] | undefined = ARGS, extra: Partial<EntityMetadata> = {}): TreeNode {
  const details: EntityMetadata = { id: name, name, isSshEnabled: false, isTerminal: true, command, commandArgs: args, ...extra };
  return { id: details.id, name, type: 'entity', details };
}

function subfolder(name: string): TreeNode {
  return { id: `sub-${name}`, name, type: 'folder', folderType: 'terminal' };
}

function many(count: number, prefix = 'e'): TreeNode[] {
  return Array.from({ length: count }, (_, i) => term(`${prefix}${i}`));
}

/** A row reduced to what a test compares. */
function summary(row: FolderRow): string {
  return row.kind === 'notRun' ? `notRun ${row.name}: ${row.reason}` : `${row.kind} ${row.name}: ${row.line}`;
}

const never = (): boolean => false;

const CONTROL_REASON = 'its name holds a control character: rename it to run it here';

function textOf(notice: FolderNotice | undefined): string {
  return notice?.text ?? '';
}

test('every_reason_in_order_first_match_wins', () => {
  const children: TreeNode[] = [
    term('pw', 'x', [], { isTerminal: false }),
    term('empty', '  ', []),
    term('a b'),
    term('c\nd', 'ls', []),
    term('cfg', 'openvpn {config}', []),
    term('os', 'ls', [], { terminalOs: 'plan9' }),
    term('dup', 'tmux attach', ARGS, { id: 'dup1' }),
    term('dup', 'tmux attach', ARGS, { id: 'dup2' }),
    term('ok'),
  ];
  const facts: FolderFacts = { ...FACTS, shellRefusal: (name, os) => (os === 'plan9' ? `"${name}" is written for plan9.` : undefined) };

  const plan = planFolderRun(children, facts);

  assert.deepEqual(plan.rows.map(summary), [
    'notRun pw: not a Terminal entry',
    'notRun empty: no command',
    `notRun a b: ${NAME_REFUSAL}`,
    `notRun c\nd: ${CONTROL_REASON}`,
    'notRun cfg: uses {config}, which only a VPN\'s "Started by" fills in',
    'notRun os: "os" is written for plan9.',
    'notRun dup: another direct entry has the same name, and they would share one terminal',
    'notRun dup: another direct entry has the same name, and they would share one terminal',
    'run ok: tmux attach -t ok',
  ]);
});

test('an_earlier_reason_beats_open', () => {
  const plan = planFolderRun([term('a b')], { ...FACTS, isOpen: () => true });

  assert.deepEqual(plan.rows.map((row) => row.kind), ['notRun']);
});

test('a_duplicate_is_only_among_rows_that_could_run', () => {
  const plan = planFolderRun(
    [term('x', 'p', [], { id: 'i1', isTerminal: false }), term('x', '', [], { id: 'i2' }), term('x', 'tmux attach', ARGS, { id: 'i3' })],
    FACTS,
  );

  assert.deepEqual(plan.rows.map((row) => row.kind), ['notRun', 'notRun', 'run']);
  assert.equal((plan.rows[2] as LineRow).line, 'tmux attach -t x', 'the first two would have no terminal to share');
});

test('both_duplicates_open_stay_not_run', () => {
  const plan = planFolderRun([term('dup', 'ls', [], { id: 'd1' }), term('dup', 'ls', [], { id: 'd2' })], { ...FACTS, isOpen: () => true });

  assert.deepEqual(plan.rows.map((row) => row.kind), ['notRun', 'notRun']);
});

test('open_comes_from_the_fact_and_only_there', () => {
  const plan = planFolderRun([term('a'), term('b')], { ...FACTS, isOpen: (name) => name === 'a' });

  assert.deepEqual(plan.rows.map((row) => row.kind), ['open', 'run']);
});

test('names_and_lines_come_from_details_name', () => {
  const node = { ...term('alert', 'x {name}', []), name: 'other' };

  const plan = planFolderRun([node], FACTS);

  assert.deepEqual(plan.rows.map(summary), ['run alert: x alert']);
});

test('no_details_is_named_by_the_node', () => {
  const plan = planFolderRun([{ id: 'bare', name: 'bare', type: 'entity' }], FACTS);

  assert.deepEqual(plan.rows.map(summary), ['notRun bare: not a Terminal entry']);
});

test('display_order_is_kept_and_subfolders_are_named_not_rows', () => {
  const plan = planFolderRun([subfolder('sub'), term('b'), term('a')], FACTS);

  assert.deepEqual(plan.rows.map((row) => row.name), ['b', 'a']);
  assert.deepEqual(plan.subfolders, ['sub']);
  assert.deepEqual([...plan.directIds], ['b', 'a']);
});

test('a_disabled_row_cannot_refuse', () => {
  const plan = planFolderRun([term('a b', 'ls', [{ value: '-t {name}', disabled: true }])], FACTS);

  assert.deepEqual(plan.rows.map(summary), ['run a b: ls']);
});

test('run_types_run_rows_and_close_types_open_rows_too', () => {
  const plan = planFolderRun([term('a'), term('b'), term('a b')], { ...FACTS, isOpen: (name) => name === 'b' });

  assert.deepEqual(linesToType(plan, false).map((row) => row.name), ['a']);
  assert.deepEqual(linesToType(plan, true).map((row) => row.name), ['a', 'b']);
});

test('the_cap_counts_every_row_with_a_line_and_names_the_count', () => {
  const within = planFolderRun(many(MAX_FOLDER_LINES), FACTS);
  const over = planFolderRun(many(MAX_FOLDER_LINES + 1), FACTS);
  const overWithOpen = planFolderRun(many(MAX_FOLDER_LINES + 1), { ...FACTS, isOpen: (name) => name !== 'e0' });

  assert.equal(beforeAsking('F', within, never), undefined);
  const refused = beforeAsking('F', over, never);
  assert.equal(refused?.warning, true);
  assert.match(textOf(refused), /"F" has 33 entries that could run.*at most 32/);
  assert.equal(textOf(beforeAsking('F', overWithOpen, never)), textOf(refused), 'Close Open Terminals and Run could type all of them, and the modal shows all of them');
});

test('the_cap_ignores_rows_with_no_line', () => {
  const refused = Array.from({ length: 40 }, (_, i) => term(`a b${i}`));
  const plan = planFolderRun([...refused, term('ok')], FACTS);

  assert.equal(plan.rows.filter((row) => row.kind === 'notRun').length, 40);
  assert.equal(lineRows(plan).length, 1, 'the one row with a line: the fixture is not rejected wholesale');
  assert.equal(beforeAsking('F', plan, never), undefined);
});

test('no_line_reports_with_no_modal_and_an_empty_folder_says_so', () => {
  const none = planFolderRun([term('x', '', [])], FACTS);
  const empty = planFolderRun([subfolder('sub')], FACTS);

  assert.deepEqual(beforeAsking('F', none, never), { text: 'Typed 0 of 1 in "F". Not run: x — no command.', warning: true });
  assert.deepEqual(beforeAsking('F', empty, never), {
    text: '"F" has no entries of its own to run. A folder run covers only its direct entries, and subfolders are not run.',
    warning: false,
  });
});

test('the_buttons_follow_the_rows', () => {
  const onlyRun = planFolderRun([term('a')], FACTS);
  const both = planFolderRun([term('a'), term('b')], { ...FACTS, isOpen: (name) => name === 'b' });
  const onlyOpen = planFolderRun([term('b')], { ...FACTS, isOpen: () => true });

  assert.deepEqual(folderButtons(onlyRun), [RUN]);
  assert.deepEqual(folderButtons(both), [RUN, CLOSE_AND_RUN]);
  assert.deepEqual(folderButtons(onlyOpen), [CLOSE_AND_RUN]);
});

test('the_question_says_everything_the_plan_requires', () => {
  const longLine = 'x'.repeat(400);
  const plan = planFolderRun(
    [subfolder('sub'), term('a'), term('long', longLine, []), term('o'), term('p', '', [])],
    { ...FACTS, isOpen: (name) => name === 'o' },
  );
  const isNew = (row: LineRow): boolean => row.name === 'a' || row.name === 'o';

  const text = folderQuestion('F', plan, isNew);

  assert.ok(text.startsWith('Run the entries of "F"?\n\nTyped, each into a new terminal:\n1. (new) a: tmux attach -t a\n2. '), text);
  assert.ok(text.includes(`\n2. long: ${longLine}\n`), 'the 400-character line is shown whole');
  assert.ok(text.includes('\n\nTerminal already open:\n1. (new) o: tmux attach -t o\n\n'), text);
  assert.ok(text.includes('\n\nNot run:\np — no command\n\n'), text);
  for (const sentence of [
    '1 subfolder is not run: sub.',
    'do not wait for each other',
    'sibling named under Depends on is not awaited',
    'Run leaves the open terminals alone. Close Open Terminals and Run closes',
    'Closing ends whatever runs there; a tmux client only detaches',
    '(new) marks a line',
  ]) {
    assert.ok(text.includes(sentence), `missing: ${sentence}`);
  }
  assert.ok(text.endsWith(READ_EACH_LINE), 'the sentence of the chain modal is the last');
});

test('the_question_drops_what_does_not_apply', () => {
  const trustedRun = folderQuestion('F', planFolderRun([term('a')], FACTS), () => false);
  const openOnly = folderQuestion('F', planFolderRun([term('o')], { ...FACTS, isOpen: () => true }), () => false);

  for (const absent of ['(new)', 'Terminal already open', 'Not run:', 'subfolder', 'Close Open']) {
    assert.ok(!trustedRun.includes(absent), `"${absent}" in: ${trustedRun}`);
  }
  assert.ok(!openOnly.includes('Run leaves'), openOnly);
  assert.ok(!openOnly.includes('Typed, each'), openOnly);
  assert.ok(openOnly.includes('Close Open Terminals and Run closes'), openOnly);
});

test('the_report_is_the_exact_sentence', () => {
  const outcomes: FolderOutcome[] = [
    { kind: 'typed', name: 'a' },
    { kind: 'typed', name: 'b' },
    { kind: 'typed', name: 'c' },
    { kind: 'open', name: 'd' },
    { kind: 'notRun', name: 'e', reason: 'reason' },
  ];

  assert.equal(folderReport('claude sessions', outcomes), 'Typed 3 of 5 in "claude sessions". Not run: e — reason. Left alone, terminal already open: d. Typed: a, b, c.');
});

test('the_report_groups_reasons_and_trims_a_full_stop_and_never_says_started', () => {
  const outcomes: FolderOutcome[] = [
    { kind: 'notRun', name: 'e', reason: 'same.' },
    { kind: 'failed', name: 'f', reason: 'other' },
    { kind: 'notRun', name: 'g', reason: 'same.' },
  ];

  const text = folderReport('F', outcomes);

  assert.equal(text, 'Typed 0 of 3 in "F". Not run: e, g — same; f — other.');
  assert.doesNotMatch(text, /started/i);
});

test('the_channel_follows_the_outcome', () => {
  const typed: FolderOutcome = { kind: 'typed', name: 'a' };
  const open: FolderOutcome = { kind: 'open', name: 'b' };
  const notRun: FolderOutcome = { kind: 'notRun', name: 'c', reason: 'r' };
  const failed: FolderOutcome = { kind: 'failed', name: 'd', reason: 'r' };

  assert.equal(reportNotice('F', [typed, open, notRun]).warning, false);
  assert.equal(reportNotice('F', [open]).warning, true);
  assert.equal(reportNotice('F', [typed, failed]).warning, true);
});

test('settle_follows_the_button_and_what_is_live_now', () => {
  const plan = planFolderRun([term('a'), term('b'), term('x', '', [])], { ...FACTS, isOpen: (name) => name === 'b' });
  const kinds = (closing: boolean, appeared: boolean): string[] => plan.rows.map((row) => settleRow(row, closing, () => appeared).kind);

  assert.deepEqual(kinds(false, true), ['open', 'open', 'notRun'], 'Run: a live terminal is left alone');
  assert.deepEqual(kinds(false, false), ['type', 'notRun', 'notRun'], 'Run: an open row with nothing live any more types nothing');
  assert.deepEqual(kinds(true, false), ['type', 'type', 'notRun'], 'the closing button types the open rows too');
  assert.deepEqual(kinds(true, true), ['open', 'open', 'notRun'], 'an unauthorised newcomer leaves its row alone, whichever button');
});

test('an_open_row_closed_under_run_says_so_and_never_says_already_open', () => {
  const plan = planFolderRun([term('b')], { ...FACTS, isOpen: () => true });

  const settled = settleRow(plan.rows[0], false, never);

  assert.equal(settled.kind, 'notRun');
  const report = folderReport('F', [settled as FolderOutcome]);
  assert.equal(report, 'Typed 0 of 1 in "F". Not run: b — its terminal closed while the question was open, and Run approved no line for it.');
  assert.doesNotMatch(report, /already open/);
});

test('the_target_is_refused_in_code', () => {
  const folder: TreeNode = { id: 'f', name: 'F', type: 'folder', folderType: 'terminal', parentId: null };
  const trash: TreeNode = { id: 'trash', name: 'Trash', type: 'folder', parentId: null, isTrash: true };
  const inTrash: TreeNode = { ...folder, id: 'g', name: 'G', parentId: 'trash' };
  const byId = (id: string): TreeNode | undefined => [folder, trash, inTrash].find((n) => n.id === id);

  assert.deepEqual(folderTarget(folder, byId), { ok: true, node: folder });
  assert.deepEqual(folderTarget(undefined, byId), { ok: false, reason: 'That folder no longer exists, so nothing was run.' });
  assert.deepEqual(folderTarget({ ...folder, type: 'entity' }, byId), { ok: false, reason: '"F" is not a folder, so Run All in Folder has nothing to run.' });
  assert.deepEqual(folderTarget({ ...folder, folderType: 'any' }, byId), { ok: false, reason: '"F" is not a Terminal folder, so Run All in Folder does not run it.' });
  assert.deepEqual(folderTarget(inTrash, byId), { ok: false, reason: '"G" is in the Trash, so nothing in it runs. Restore it first.' });
  assert.ok(NO_FOLDER_TARGET.length > 0);
});

test('a_name_or_a_line_with_a_control_character_is_escaped_in_the_question_the_report_and_the_notices', () => {
  const forged = 'a\n2. (new) b';
  const plan = planFolderRun(
    [subfolder('s\nub'), term('ok', 'echo hi\r\nrm -rf ~', [], { id: 'line' }), term(forged, 'ls', [], { id: 'forged' }), term('p\nq', '', [], { id: 'empty' })],
    FACTS,
  );

  const text = folderQuestion('F\n9. fake', plan, never);
  const report = folderReport('F\n9. fake', [{ kind: 'typed', name: forged }, { kind: 'failed', name: 'p\nq', reason: 'no\nline' }]);

  assert.deepEqual(text.split('\n').filter((line) => /^\d+\. /.test(line)), ['1. ok: echo hi\\u000d\\u000arm -rf ~']);
  assert.ok(text.includes(`a\\u000a2. (new) b — ${CONTROL_REASON}`), text);
  assert.ok(text.includes('Run the entries of "F\\u000a9. fake"?'), text);
  assert.ok(text.includes('p\\u000aq — no command'), text);
  assert.ok(text.includes('1 subfolder is not run: s\\u000aub.'), text);
  assert.ok(!report.includes('\n'), report);
  assert.equal(report, 'Typed 1 of 2 in "F\\u000a9. fake". Not run: p\\u000aq — no\\u000aline. Typed: a\\u000a2. (new) b.');
  assert.ok(!textOf(beforeAsking('F\nG', planFolderRun([term('x', '', [])], FACTS), never)).includes('\n'));
  assert.equal(lineRows(plan)[0].line, 'echo hi\r\nrm -rf ~', 'the row keeps the string that is typed, unescaped');
});

test('every_control_character_class_in_a_name_is_not_run_and_a_clean_name_runs', () => {
  for (const name of ['a\nb', 'a\tb', 'a\u007fb', 'a\u0085b', 'a\u009fb', 'a\u2028b', 'a\u061cb', 'a\u200eb', 'a\u200fb', 'a\u202eb', 'a\u2066b']) {
    const plan = planFolderRun([term(name, 'ls', [])], FACTS);
    assert.deepEqual(plan.rows.map(summary), [`notRun ${name}: ${CONTROL_REASON}`], JSON.stringify(name));
  }
  for (const name of ['alert', 'a b', 'a\u00b7b', 'a\u00a0b', '\u0416']) {
    const plan = planFolderRun([term(name, 'ls', [])], FACTS);
    assert.deepEqual(plan.rows.map(summary), [`run ${name}: ls`], JSON.stringify(name));
  }
});

test('a_refused_name_comes_before_the_control_character_reason', () => {
  const plan = planFolderRun([term('a\nb')], FACTS);

  assert.deepEqual(plan.rows.map(summary), [`notRun a\nb: ${NAME_REFUSAL}`], 'the row holds {name}, so the allow-list answers first');
});

test('the_control_character_reason_comes_before_config_the_shell_open_and_a_duplicate', () => {
  const facts: FolderFacts = { shellRefusal: () => 'not this window', isOpen: () => true };
  const plan = planFolderRun(
    [term('a\nb', 'openvpn {config}', [], { id: '1' }), term('c\nd', 'ls', [], { id: '2' }), term('e\nf', 'ls', [], { id: '3' }), term('e\nf', 'ls', [], { id: '4' })],
    facts,
  );

  assert.deepEqual(plan.rows.map((row) => (row as { reason?: string }).reason), [CONTROL_REASON, CONTROL_REASON, CONTROL_REASON, CONTROL_REASON]);
});

test('a_name_with_a_control_character_is_no_duplicate_of_the_name_without_it', () => {
  const plan = planFolderRun([term('ab', 'ls', [], { id: '1' }), term('a\nb', 'ls', [], { id: '2' }), term('dup', 'ls', [], { id: '3' }), term('dup', 'ls', [], { id: '4' })], FACTS);

  assert.deepEqual(plan.rows.map((row) => row.kind), ['run', 'notRun', 'notRun', 'notRun']);
  assert.equal((plan.rows[1] as { reason: string }).reason, CONTROL_REASON);
  assert.match((plan.rows[2] as { reason: string }).reason, /same name/);
});

test('a_question_of_exactly_the_bound_is_asked_and_one_more_character_is_refused_naming_the_count', () => {
  const planOf = (length: number): FolderPlan => planFolderRun([term('a', 'x'.repeat(length), [])], FACTS);
  const overhead = folderQuestion('F', planOf(1), never).length - 1;
  const exact = planOf(MAX_QUESTION_CHARACTERS - overhead);

  assert.equal(MAX_QUESTION_CHARACTERS, 4000);
  assert.equal(folderQuestion('F', exact, never).length, 4000);
  assert.equal(beforeAsking('F', exact, never), undefined);
  assert.deepEqual(beforeAsking('F', planOf(MAX_QUESTION_CHARACTERS - overhead + 1), never), {
    text: 'The question for "F" would run to 4001 characters, and a folder run shows at most 4000, because the question has to show every line. Nothing was typed. Shorten a line, or move some entries into a subfolder: a subfolder is not run.',
    warning: true,
  });
});

test('the_bound_counts_the_text_as_shown', () => {
  const planOf = (line: string): FolderPlan => planFolderRun([term('a', line, [])], FACTS);
  const overhead = folderQuestion('F', planOf('x'), never).length - 1;
  const atTheBound = 'x'.repeat(MAX_QUESTION_CHARACTERS - overhead);

  assert.equal(beforeAsking('F', planOf(atTheBound), never), undefined);
  assert.match(textOf(beforeAsking('F', planOf(atTheBound), () => true)), /would run to 4\d\d\d characters/, '(new) and its note count');
  assert.match(textOf(beforeAsking('F', planOf(`x\n${atTheBound.slice(2)}`), never)), /would run to 4005 characters/, 'an escape counts as the six characters it shows');
});

test('the_row_cap_is_judged_before_the_character_bound', () => {
  const long = Array.from({ length: MAX_FOLDER_LINES + 1 }, (_, i) => term(`e${i}`, 'x'.repeat(200), []));

  assert.match(textOf(beforeAsking('F', planFolderRun(long, FACTS), never)), /has 33 entries that could run/);
});

test('rows_with_no_line_ask_nothing_so_the_bound_does_not_reach_them', () => {
  const plan = planFolderRun(Array.from({ length: 40 }, (_, i) => term(`${'x'.repeat(200)}${i}`, '', [])), FACTS);

  assert.match(textOf(beforeAsking('F', plan, never)), /^Typed 0 of 40 in "F"\. Not run: /);
});

test('the_report_says_what_must_not_be_lost_first', () => {
  const report = folderReport('F', [
    { kind: 'typed', name: 'a' },
    { kind: 'open', name: 'b' },
    { kind: 'notRun', name: 'c', reason: 'r' },
  ]);

  const order = ['Typed 1 of 3 in "F".', 'Not run: c', 'Left alone', 'Typed: a.'].map((clause) => report.indexOf(clause));
  assert.deepEqual([...order].sort((x, y) => x - y), order, report);
  assert.ok(!order.includes(-1), report);
});

test('the_report_drops_what_did_not_happen', () => {
  assert.equal(folderReport('F', [{ kind: 'typed', name: 'a' }]), 'Typed 1 of 1 in "F". Typed: a.');
  assert.equal(folderReport('F', [{ kind: 'open', name: 'a' }]), 'Typed 0 of 1 in "F". Left alone, terminal already open: a.');
});

test('a_failure_after_closing_says_what_was_closed', () => {
  assert.equal(failedAfterClosing('no terminal', 0), 'no terminal');
  assert.equal(failedAfterClosing('no terminal', 1), 'its terminal was closed, and its line was not typed: no terminal');
  assert.equal(failedAfterClosing('no terminal', 2), 'its 2 terminals were closed, and its line was not typed: no terminal');
});

test('a_stopped_chain_says_nothing_was_typed_and_no_entrys_terminal_was_closed', () => {
  assert.equal(chainStopped('F\nG'), 'Nothing was typed in "F\\u000aG" and no entry\'s terminal was closed: the dependencies did not finish.');
});

test('a_middle_dot_in_a_name_stays_readable_in_the_question_and_the_report', () => {
  const name = 'a\u00b7b';
  const plan = planFolderRun([term(name, 'ls \u00b7', [])], FACTS);

  assert.ok(folderQuestion(`F\u00b7`, plan, never).includes(`1. ${name}: ls \u00b7`));
  assert.ok(folderQuestion(`F\u00b7`, plan, never).startsWith('Run the entries of "F\u00b7"?'));
  assert.equal(folderReport('F', [{ kind: 'typed', name }]), `Typed 1 of 1 in "F". Typed: ${name}.`);
});
