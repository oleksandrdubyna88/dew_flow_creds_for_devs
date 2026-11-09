import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envAppliedNotice } from '../envApplyNotice';

/**
 * Issue #48 — what a save SAYS about the env bindings it applied.
 *
 * <p>Two defects, one sentence each. D1: the form's checkbox wrote the variable on save and said
 * nothing, so somebody looked at the terminal that was already open, saw nothing, and filed "does
 * not work on Linux". D2: a value the policy withholds — a woven password, a PIN-locked field — was
 * skipped in silence, so an entry created with a PIN and a binding wrote nothing and said nothing.
 * The viewer's `ENV` button already had the right sentence; it is moved here so the three surfaces
 * that apply a binding say ONE thing, and a withheld name is reported with the reason the policy
 * gave, never dropped.</p>
 */

const SET_FOR_NEW_TERMINALS =
  'for NEW integrated terminals in this window. Already-open terminals keep their old environment.';

test('written names are announced for NEW terminals in this window, and nothing is warned', () => {
  const notice = envAppliedNotice({ written: ['DB_PW', 'PUB'], withheld: [] });

  assert.equal(notice.info, `$DB_PW, $PUB are set ${SET_FOR_NEW_TERMINALS}`);
  assert.equal(notice.warning, undefined);
});

test('one written name reads in the singular — the viewer’s own sentence, unchanged', () => {
  const notice = envAppliedNotice({ written: ['PROD_PW'], withheld: [] });

  assert.equal(notice.info, `$PROD_PW is set ${SET_FOR_NEW_TERMINALS}`);
});

test('a withheld name is warned WITH the policy’s reason, and nothing is announced as set', () => {
  const notice = envAppliedNotice({
    written: [],
    withheld: [{ name: 'PROD_PW', reason: '"prod" is protected with its own PIN, so it cannot be used automatically.' }],
  });

  assert.equal(notice.info, undefined, 'nothing was set, so nothing claims to be');
  assert.equal(
    notice.warning,
    '$PROD_PW was not written: "prod" is protected with its own PIN, so it cannot be used automatically.',
  );
});

test('a mixed result says both — each name once, in its own sentence', () => {
  const notice = envAppliedNotice({
    written: ['PUB'],
    withheld: [
      { name: 'PROD_PW', reason: 'reason one.' },
      { name: 'DB_PW', reason: 'reason two.' },
    ],
  });

  assert.equal(notice.info, `$PUB is set ${SET_FOR_NEW_TERMINALS}`);
  assert.equal(notice.warning, '$PROD_PW was not written: reason one. $DB_PW was not written: reason two.');
});

test('a save that bound nothing says nothing at all', () => {
  const notice = envAppliedNotice({ written: [], withheld: [] });

  assert.equal(notice.info, undefined);
  assert.equal(notice.warning, undefined);
});

/**
 * E1.1 — the warning when the terminals are on another computer (`PLAN_remote_bridge_scoped_E1.md`).
 * The value is still written (owner decision 5); the person is told where it goes.
 */

const REACHES_ONE =
  '$X reaches another computer: the new terminals of this window run there (ssh-remote), so each one starts on that computer with the value in its environment, where any process running under your login can read it. The value stays until you remove the binding through Edit in this window; deleting the entry does not remove it. Terminals already open keep it until they close.';

const REACHES_TWO =
  '$X, $Y reach another computer: the new terminals of this window run there (ssh-remote), so each one starts on that computer with the values in their environment, where any process running under your login can read them. The values stay until you remove their bindings through Edit in this window; deleting the entry does not remove them. Terminals already open keep them until they close.';

test('W1: one name written in an ssh-remote window: info as today, and exactly the one-name warning', () => {
  const notice = envAppliedNotice({ written: ['X'], withheld: [] }, 'ssh-remote');

  assert.equal(notice.info, `$X is set ${SET_FOR_NEW_TERMINALS}`);
  assert.equal(notice.warning, REACHES_ONE);
});

test('W2: two names, and a withheld name beside them: the two-name sentence comes after the withheld one', () => {
  const notice = envAppliedNotice(
    { written: ['X', 'Y'], withheld: [{ name: 'PROD_PW', reason: 'reason one.' }] },
    'ssh-remote',
  );

  assert.equal(notice.warning, `$PROD_PW was not written: reason one. ${REACHES_TWO}`);
});

test('W2: the name in brackets is the remoteName given, not a fixed word', () => {
  const notice = envAppliedNotice({ written: ['X'], withheld: [] }, 'dev-container');

  assert.equal(notice.warning, REACHES_ONE.replace('(ssh-remote)', '(dev-container)'));
});

test('W3: a local window, a WSL window, and nothing written say no such sentence', () => {
  const written = { written: ['X'], withheld: [] };

  assert.equal(envAppliedNotice(written, undefined).warning, undefined);
  assert.equal(envAppliedNotice(written, '').warning, undefined);
  assert.equal(envAppliedNotice(written, 'wsl').warning, undefined);
  assert.deepEqual(envAppliedNotice({ written: [], withheld: [] }, 'ssh-remote'), {});
  assert.equal(
    envAppliedNotice({ written: [], withheld: [{ name: 'A', reason: 'r.' }] }, 'ssh-remote').warning,
    '$A was not written: r.',
    'nothing reached the other computer, so the sentence about it is not said',
  );
});

test('W3: with one argument the answer is today’s answer', () => {
  const result = { written: ['X'], withheld: [{ name: 'A', reason: 'r.' }] };

  assert.deepEqual(envAppliedNotice(result), envAppliedNotice(result, undefined));
  assert.equal(envAppliedNotice(result).warning, '$A was not written: r.');
});
