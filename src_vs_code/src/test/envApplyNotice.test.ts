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
