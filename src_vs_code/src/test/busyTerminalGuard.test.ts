import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EntityMetadata } from '../types';
import { ArrowWorld, arrowWorld } from './arrowWorld';
import { WorldOptions, noteOurSend, rootTitle, terminalNamed, until } from './vpnWorld';

/**
 * The green arrow never types into a terminal whose command may still be running (parent
 * `PLAN_terminal_folder_run.md` §2, story S1). The handler is the real `runCommand`; a terminal is the
 * stub's record of what was typed into it, and shell integration's start and end are fired by the test.
 */

/** The terminal the arrow's entry names, and the line it would type. */
const A = rootTitle('alert');
const L = 'tmux attach -t alert';

const entry: EntityMetadata = {
  id: 'alert',
  name: 'alert',
  isSshEnabled: false,
  isTerminal: true,
  command: 'tmux attach',
  commandArgs: [{ value: '-t alert' }],
};

const QUESTION = /was not typed/;

/** The arrow's world with `entry`'s line already vouched for; every busy question is HELD for the test to answer. */
function arrow(opts: WorldOptions = {}): ArrowWorld {
  return arrowWorld({ holdDialogs: QUESTION, ...opts }, [['alert', L]]);
}

/** Start `run` and wait until its question is on screen — `count` held in all, this one the newest. */
async function asked(aw: ArrowWorld, count = 1): Promise<void> {
  await until(() => aw.held.length === count, `question number ${count}`);
}

/** The extension has typed into A this activation: `running` and `finished` both need it (parent §2). */
function armed(aw: ArrowWorld): void {
  noteOurSend(aw.live[A]);
}

/** The terminal A has run a command to its end with `exitCode`. */
function finish(aw: ArrowWorld, exitCode: number | undefined): object {
  const execution = aw.shell.start(aw.live[A]);
  aw.shell.end(aw.live[A], execution, exitCode);
  return execution;
}

test('the_arrow_never_types_into_a_terminal_whose_command_is_running', async () => {
  const aw = arrow({ preopened: [A], modal: 'dismiss', holdDialogs: undefined });
  armed(aw);
  aw.shell.start(aw.live[A]);
  await aw.run(entry);
  assert.deepEqual(terminalNamed(aw, A).sent, [], 'the arrow typed into a terminal whose command is running');
  assert.equal(aw.terminals.length, 1, 'nothing was created');
  const questions = aw.warnings.filter((w) => /is still running a command/.test(w));
  assert.equal(questions.length, 1, aw.warnings.join('\n'));
  assert.ok(questions[0].includes(L));
});

test('the_arrow_types_as_today_when_the_last_command_finished', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  finish(aw, 0);
  await aw.run(entry);
  assert.deepEqual(terminalNamed(aw, A).sent, [L]);
  assert.equal(terminalNamed(aw, A).shown, 1, 'the terminal was brought to the front');
  assert.equal(aw.terminals.length, 1);
  assert.deepEqual(aw.warnings, []);
  assert.deepEqual(aw.held, []);
});

test('a_nonzero_exit_still_counts_as_finished', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  finish(aw, 1);
  await aw.run(entry);
  assert.deepEqual(terminalNamed(aw, A).sent, [L]);
  assert.deepEqual(aw.held, []);
});

test('the_arrow_opens_a_new_terminal_when_none_is_live', async () => {
  const aw = arrow();
  await aw.run(entry);
  assert.equal(aw.terminals.length, 1);
  assert.equal(aw.terminals[0].name, A);
  assert.deepEqual(aw.terminals[0].sent, [L]);
  assert.deepEqual(aw.held, []);
});

test('a_live_terminal_with_no_evidence_asks_and_cancel_types_nothing', async () => {
  const aw = arrow({ preopened: [A] });
  const p = aw.run(entry);
  await asked(aw);
  assert.match(aw.held[0].text, new RegExp(`cannot tell whether "${A}"`));
  assert.ok(aw.held[0].text.includes(L));
  assert.deepEqual(aw.held[0].buttons, ['Type It Anyway']);
  assert.equal(terminalNamed(aw, A).shown, 1, 'the terminal is shown while it is asked about');
  aw.held[0].answer(undefined);
  await p;
  assert.deepEqual(terminalNamed(aw, A).sent, []);
});

test('type_it_anyway_types_once_into_the_same_terminal_object', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  const t = aw.live[A];
  const c = aw.shell.start(t);
  const p = aw.run(entry);
  await asked(aw);
  // While the question is open the terminal is closed and another of the same name opens, and the old one's end arrives late.
  const other = aw.open(A);
  (aw.vscode.window as { terminals: unknown[] }).terminals = [other];
  aw.shell.end(t, c, 0);
  aw.held[0].answer('Type It Anyway');
  await p;
  assert.deepEqual(aw.terminals[0].sent, [L], 'the original object received the line');
  assert.deepEqual(aw.terminals[1].sent, [], 'the terminal that later carries the name did not');
  assert.equal(aw.terminals.length, 2, 'no third terminal was opened');
});

test('a_double_click_asks_once_and_types_at_most_once', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  aw.shell.start(aw.live[A]);
  const p1 = aw.run(entry);
  const p2 = aw.run(entry);
  await asked(aw);
  await p2; // settles on its own: a question is already open for that object
  aw.held[0].answer('Type It Anyway');
  await p1;
  assert.equal(aw.held.length, 1, 'one question, ever');
  assert.deepEqual(terminalNamed(aw, A).sent, [L]);
});

test('a_double_click_on_a_finished_terminal_types_once_then_asks', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  finish(aw, 0);
  const p1 = aw.run(entry);
  const p2 = aw.run(entry);
  await asked(aw);
  aw.held[0].answer(undefined);
  await Promise.all([p1, p2]);
  assert.deepEqual(terminalNamed(aw, A).sent, [L], 'the first typed synchronously, the second found unknown and asked');
});

test('type_it_anyway_on_a_terminal_that_closed_meanwhile_types_nothing', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  aw.shell.start(aw.live[A]);
  const p = aw.run(entry);
  await asked(aw);
  aw.live[A].exitStatus = { code: 0 };
  aw.held[0].answer('Type It Anyway');
  await p;
  assert.deepEqual(terminalNamed(aw, A).sent, []);
  assert.ok(aw.warnings.some((w) => /closed while the question was open/.test(w)), aw.warnings.join('\n'));
  assert.equal(aw.terminals.length, 1, 'no new terminal was opened for the override');
});

test('after_our_send_a_start_and_a_numeric_end_make_the_next_click_silent', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  finish(aw, 0);
  await aw.run(entry);
  finish(aw, 0);
  await aw.run(entry);
  assert.deepEqual(terminalNamed(aw, A).sent, [L, L]);
  assert.deepEqual(aw.held, []);
});

test('after_our_send_with_no_new_evidence_the_next_click_asks', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  const c = finish(aw, 0);
  await aw.run(entry);
  aw.shell.end(aw.live[A], c, 0); // a replay
  const p = aw.run(entry);
  await asked(aw);
  assert.match(aw.held[0].text, /cannot tell/);
  aw.held[0].answer(undefined);
  await p;
  assert.deepEqual(terminalNamed(aw, A).sent, [L]);
});

test('a_sub_shell_signature_keeps_asking_for_the_terminals_life', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  finish(aw, undefined);
  const first = aw.run(entry);
  await asked(aw);
  aw.held[0].answer(undefined);
  await first;
  finish(aw, 0);
  const second = aw.run(entry);
  await asked(aw, 2);
  aw.held[1].answer(undefined);
  await second;
  assert.deepEqual(terminalNamed(aw, A).sent, []);
  assert.ok(aw.held.every((d) => /cannot tell/.test(d.text)));
});

test('the_tracker_is_registered_through_registerRunCommands_and_disposes', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  assert.equal(aw.subscriptions.length, 1);
  const tracker = aw.subscriptions[0] as { dispose?: unknown };
  assert.equal(typeof tracker.dispose, 'function');
  (tracker as { dispose(): void }).dispose();
  finish(aw, 0); // not heard any more
  const p = aw.run(entry);
  await asked(aw);
  assert.match(aw.held[0].text, /cannot tell/);
  aw.held[0].answer(undefined);
  await p;
  assert.deepEqual(terminalNamed(aw, A).sent, []);
});

test('an_open_question_stops_a_second_send_even_when_the_command_ends_meanwhile', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  const t = aw.live[A];
  const c = aw.shell.start(t);
  const p = aw.run(entry);
  await asked(aw);
  aw.shell.end(t, c, 0); // the command ends while the question is open
  await aw.run(entry); // a second click reads `finished` — and must not type under the open question
  assert.deepEqual(terminalNamed(aw, A).sent, [], 'a second send typed under an open question');
  aw.held[0].answer('Type It Anyway');
  await p;
  assert.deepEqual(terminalNamed(aw, A).sent, [L], 'the answered question typed once');
});

test('a_command_started_after_a_finished_one_makes_the_next_click_ask', async () => {
  const aw = arrow({ preopened: [A] });
  armed(aw);
  finish(aw, 0);
  aw.shell.start(aw.live[A]);
  const p = aw.run(entry);
  await asked(aw);
  assert.match(aw.held[0].text, /is still running a command/);
  aw.held[0].answer(undefined);
  await p;
  assert.deepEqual(terminalNamed(aw, A).sent, []);
});

test('a_start_and_end_with_no_send_of_ours_never_read_finished', async () => {
  const aw = arrow({ preopened: [A], modal: 'dismiss', holdDialogs: undefined });
  finish(aw, 0);
  await aw.run(entry);
  assert.deepEqual(terminalNamed(aw, A).sent, [], 'typed on a start and end the extension had no part in');
  assert.equal(aw.warnings.filter((w) => /cannot tell/.test(w)).length, 1, aw.warnings.join('\n'));
});

test('a_start_with_no_send_of_ours_asks_as_unknown_not_as_running', async () => {
  const aw = arrow({ preopened: [A], modal: 'dismiss', holdDialogs: undefined });
  aw.shell.start(aw.live[A]);
  await aw.run(entry);
  assert.deepEqual(terminalNamed(aw, A).sent, []);
  assert.equal(aw.warnings.filter((w) => /cannot tell/.test(w)).length, 1, aw.warnings.join('\n'));
});

test('type_it_anyway_then_a_seen_start_and_end_reads_finished', async () => {
  const aw = arrow({ preopened: [A] });
  const first = aw.run(entry);
  await asked(aw);
  aw.held[0].answer('Type It Anyway');
  await first;
  finish(aw, 0);
  await aw.run(entry);
  assert.deepEqual(terminalNamed(aw, A).sent, [L, L]);
  assert.equal(aw.held.length, 1, 'silent again after the person had said so and the command was seen to end');
});

test('type_it_anyway_with_no_start_seen_still_asks', async () => {
  const aw = arrow({ preopened: [A] });
  const first = aw.run(entry);
  await asked(aw);
  aw.held[0].answer('Type It Anyway');
  await first;
  const second = aw.run(entry);
  await asked(aw, 2);
  assert.match(aw.held[1].text, /cannot tell/);
  aw.held[1].answer(undefined);
  await second;
  assert.deepEqual(terminalNamed(aw, A).sent, [L]);
});

test('a_terminal_the_arrow_opened_asks_while_its_command_runs_and_repeats_silently_once_it_ended', async () => {
  const aw = arrow();
  await aw.run(entry);
  const t = aw.live[A];
  const c = aw.shell.start(t);
  const running = aw.run(entry);
  await asked(aw);
  assert.match(aw.held[0].text, /is still running a command/);
  aw.held[0].answer(undefined);
  await running;
  aw.shell.end(t, c, 0);
  await aw.run(entry);
  assert.equal(aw.terminals.length, 1, 'the same terminal, listed at once');
  assert.deepEqual(terminalNamed(aw, A).sent, [L, L]);
  assert.equal(aw.held.length, 1);
});
