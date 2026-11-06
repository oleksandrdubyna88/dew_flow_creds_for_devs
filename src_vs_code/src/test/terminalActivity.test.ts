import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActivityEvent, ActivityState, TYPE_ANYWAY, UNKNOWN, agentRefusal, busyQuestion, closedMeanwhile, nextActivity as n, readActivity as r } from '../terminalActivity';

/**
 * The pure half of the busy-terminal guard: every cell of the transition table is a test here (parent
 * `PLAN_terminal_folder_run.md` §2, as revised for epoch 2). Executions are plain objects, compared by identity.
 */

const start = (execution: object): ActivityEvent => ({ kind: 'start', execution });
const end = (execution: object, exitCode: number | undefined): ActivityEvent => ({ kind: 'end', execution, exitCode });
const SENT: ActivityEvent = { kind: 'sent' };

/** Fold `events` over `from`, the way the tracker does. */
function fold(from: ActivityState, ...events: ActivityEvent[]): ActivityState {
  return events.reduce(n, from);
}

/** We typed, and no start has been seen since. */
const ARMED = n(UNKNOWN, SENT);

const finishedVia = (c: object): ActivityState => fold(ARMED, start(c), end(c, 0));

type Kind = ActivityState['kind'];

/** Each state of the table, reached through the reducer alone; `c` is what `running(c)` runs. */
const REACH: Record<Kind, (c: object) => ActivityState> = {
  unknown: () => UNKNOWN,
  armed: () => ARMED,
  running: (c) => fold(ARMED, start(c)),
  finished: finishedVia,
  poisoned: (c) => fold(ARMED, start(c), end(c, undefined)),
};

/** The columns of §2's table, in its order. `c` is the running execution, `e` a new one. */
const COLUMNS: Record<string, (c: object, e: object) => ActivityEvent> = {
  'start(e)': (_c, e) => start(e),
  'end(c), numeric': (c) => end(c, 0),
  'end(c), undefined': (c) => end(c, undefined),
  'any other end': (_c, e) => end(e, 0),
  'our own send': () => SENT,
};

/** §2's table, cell for cell, written out here and not computed. */
const TABLE: Record<Kind, readonly [Kind, Kind, Kind, Kind, Kind]> = {
  unknown: ['unknown', 'unknown', 'unknown', 'unknown', 'armed'],
  armed: ['running', 'armed', 'armed', 'armed', 'armed'],
  running: ['poisoned', 'finished', 'poisoned', 'running', 'poisoned'],
  finished: ['running', 'finished', 'finished', 'finished', 'armed'],
  poisoned: ['poisoned', 'poisoned', 'poisoned', 'poisoned', 'poisoned'],
};

const READS: Record<Kind, 'finished' | 'running' | 'unknown'> = {
  unknown: 'unknown',
  armed: 'unknown',
  running: 'running',
  finished: 'finished',
  poisoned: 'unknown',
};

for (const [kind, row] of Object.entries(TABLE) as [Kind, readonly Kind[]][]) {
  Object.keys(COLUMNS).forEach((column, i) => {
    test(`the_table_${kind}_on_${column}_is_${row[i]}`, () => {
      const [c, e] = [{}, {}];
      const after = n(REACH[kind](c), COLUMNS[column](c, e));
      assert.equal(after.kind, row[i]);
      assert.equal(r(after), READS[row[i]]);
    });
  });
  test(`the_table_${kind}_reads_${READS[kind]}`, () => {
    assert.equal(r(REACH[kind]({})), READS[kind]);
  });
}

test('a_start_and_end_with_no_send_of_ours_never_read_finished', () => {
  const [c, e] = [{}, {}];
  for (const code of [0, 1, undefined]) {
    const state = fold(UNKNOWN, start(c), end(c, code));
    assert.equal(state.kind, 'unknown', `end(c, ${String(code)})`);
    assert.equal(r(state), 'unknown', `end(c, ${String(code)})`);
  }
  assert.equal(r(fold(UNKNOWN, start(c), start(e), end(e, 0), end(c, 0))), 'unknown', 'two starts and two ends say no more');
});

test('a_start_with_no_send_of_ours_says_nothing_it_does_not_read_running', () => {
  assert.equal(r(fold(UNKNOWN, start({}))), 'unknown');
});

test('a_start_before_our_send_and_its_end_after_it_stay_armed', () => {
  const c = {};
  const state = fold(UNKNOWN, start(c), SENT, end(c, 0));
  assert.equal(state.kind, 'armed');
  assert.equal(r(state), 'unknown');
});

test('our_own_send_then_a_seen_start_and_end_read_finished', () => {
  const c = {};
  assert.equal(r(n(UNKNOWN, SENT)), 'unknown', 'armed reads unknown: nothing has been seen yet');
  assert.equal(r(fold(UNKNOWN, SENT, start(c))), 'running');
  assert.equal(r(fold(UNKNOWN, SENT, start(c), end(c, 0))), 'finished');
});

test('a_double_send_stays_armed', () => {
  const c = {};
  assert.equal(n(ARMED, SENT).kind, 'armed');
  assert.equal(r(fold(ARMED, SENT, start(c), end(c, 0))), 'finished');
});

test('end_undefined_then_a_second_execution_stays_poisoned', () => {
  const [c, e] = [{}, {}];
  assert.equal(fold(ARMED, start(c), end(c, undefined), start(e), end(e, 0)).kind, 'poisoned');
});

test('nothing_recorded_reads_unknown', () => {
  assert.equal(r(undefined), 'unknown');
  assert.equal(r(UNKNOWN), 'unknown');
});

test('after_our_send_a_start_then_its_end_with_a_numeric_code_reads_finished_nonzero_included', () => {
  for (const code of [0, 1, -1978335189]) {
    const c = {};
    assert.equal(r(fold(ARMED, start(c), end(c, code))), 'finished', `exit code ${code}`);
  }
});

test('after_our_send_a_start_with_no_end_reads_running', () => {
  assert.equal(r(fold(ARMED, start({}))), 'running');
});

test('an_end_with_undefined_code_on_the_current_execution_poisons_for_life', () => {
  const [c, e, f] = [{}, {}, {}];
  let state = fold(ARMED, start(c));
  for (const event of [end(c, undefined), start(e), end(e, 0), SENT, start(f), end(f, 0)]) {
    state = n(state, event);
    assert.equal(r(state), 'unknown', JSON.stringify(event));
    assert.equal(state.kind, 'poisoned', JSON.stringify(event));
  }
});

test('a_start_while_running_poisons_in_either_delivery_order', () => {
  const [c, e] = [{}, {}];
  const running = fold(ARMED, start(c));
  const orders: Record<string, ActivityEvent[]> = {
    'start then the undefined end': [start(e), end(c, undefined)],
    'the undefined end then start': [end(c, undefined), start(e)],
    // tmux with an inner shell that reports its own sequences: the inner pair must not read as the outer finishing.
    'start of the inner command, then its numeric end': [start(e), end(e, 0)],
  };
  for (const [order, events] of Object.entries(orders)) {
    const state = fold(running, ...events);
    assert.equal(r(state), 'unknown', order);
    assert.equal(state.kind, 'poisoned', order);
  }
});

test('an_end_for_another_execution_is_ignored', () => {
  const [c, e] = [{}, {}];
  const state = fold(ARMED, start(c), end(e, 0));
  assert.equal(r(state), 'running');
  assert.equal(state.kind === 'running' && state.current, c);
});

test('an_end_with_no_start_is_ignored', () => {
  const e = {};
  for (const code of [0, undefined]) {
    assert.equal(r(fold(UNKNOWN, end(e, code))), 'unknown', `from unknown, code ${String(code)}`);
    assert.equal(r(fold(finishedVia({}), end(e, code))), 'finished', `from finished, code ${String(code)}`);
  }
});

test('our_own_send_clears_the_evidence_and_a_late_end_cannot_restore_it', () => {
  const [c, e] = [{}, {}];
  for (const before of [finishedVia(c), UNKNOWN]) {
    const sent = n(before, SENT);
    assert.equal(sent.kind, 'armed');
    assert.equal(r(sent), 'unknown');
    assert.equal(r(n(sent, end(c, 0))), 'unknown', 'a late end for the execution before our send');
  }
  // The aws-sso re-run: after our send, a new start and its numeric end make the terminal free again.
  assert.equal(r(fold(n(finishedVia(c), SENT), start(e), end(e, 0))), 'finished');
});

test('a_start_after_a_finished_command_reads_running_with_the_new_execution', () => {
  const [c, e] = [{}, {}];
  const state = fold(finishedVia(c), start(e));
  assert.equal(r(state), 'running');
  assert.equal(state.kind === 'running' && state.current, e);
});

test('our_own_send_over_a_running_command_poisons_it_so_the_inner_pair_never_reads_finished', () => {
  const [tmux, inner] = [{}, {}];
  const state = fold(ARMED, start(tmux), SENT, start(inner), end(inner, 0));
  assert.equal(r(state), 'unknown');
  assert.equal(state.kind, 'poisoned');
  assert.equal(fold(ARMED, start(tmux), SENT).kind, 'poisoned', 'the send itself already poisons');
});

test('our_own_send_arms_unknown_and_finished_and_leaves_a_poisoned_terminal_poisoned', () => {
  const c = {};
  assert.equal(n(UNKNOWN, SENT).kind, 'armed');
  assert.equal(n(finishedVia(c), SENT).kind, 'armed');
  assert.equal(n(fold(ARMED, start(c), end(c, undefined)), SENT).kind, 'poisoned');
});

test('an_undefined_end_for_another_execution_is_ignored_while_running', () => {
  const [c, e] = [{}, {}];
  const state = fold(ARMED, start(c), end(e, undefined));
  assert.equal(r(state), 'running');
  assert.equal(state.kind === 'running' && state.current, c);
});

test('states_are_values_not_mutated', () => {
  const [c, e, f] = [{}, {}, {}];
  const sequences: ActivityEvent[][] = [
    [SENT, start(c), end(c, 0)],
    [SENT, start(c), end(c, undefined), start(e), end(e, 0), SENT, start(f), end(f, 0)],
    [SENT, start(c), end(c, 0), SENT, end(c, 0), start(e), end(e, 0)],
  ];
  for (const events of sequences) {
    let state: ActivityState = UNKNOWN;
    for (const event of events) {
      const copy = { ...state };
      const output = n(state, event);
      assert.deepEqual(state, copy, 'the input state is unchanged');
      assert.ok(Object.isFrozen(output), JSON.stringify(event));
      state = output;
    }
  }
});

test('the_question_names_the_terminal_and_shows_the_line_verbatim', () => {
  const name = 'CredsForDevs: alert';
  const line = 'tmux attach -t alert';
  const running = busyQuestion(name, 'running', line);
  const unknown = busyQuestion(name, 'unknown', line);
  for (const text of [running, unknown]) {
    assert.ok(text.includes(`"${name}"`), text);
    assert.ok(text.includes(`\n\n${line}\n\n`), 'the line stands on its own, verbatim');
    assert.ok(text.includes(TYPE_ANYWAY), text);
  }
  assert.match(running, /still running a command/);
  assert.match(unknown, /cannot tell/);
  for (const text of [agentRefusal(name), closedMeanwhile(name)]) {
    assert.ok(text.includes(`"${name}"`), text);
    assert.match(text, /nothing was typed/i);
  }
});
