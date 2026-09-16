import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PASSWORD_FORM, PAYMENT_FORM, secondInputFrom, secondsForWeave } from '../secondFormInput';
import { SECOND_KEYS } from '../secondValues';

/**
 * S4/S5 — the page's message read into the shape the rule takes.
 *
 * <p>Two things are asserted here and nowhere else. First, that a payload is walked by the KEY LIST
 * rather than spread, so a name a newer build — or a crafted message — put in it cannot enter a save.
 * Second, that the two mode controls on one page each answer for THEIR OWN fields: the password's
 * cannot decide a card's, which is the defect a single-control read would have.</p>
 */

const CARD = {
  secondValues: { cvv2: '481', pin2: '9137', password2: 'other' },
  weaveSecondMode: 'decoy',
  mixSecondMode: 'own',
};

test('each control answers for its own fields, and for no others', () => {
  const input = secondInputFrom(CARD, {}, ['password', 'cvv', 'pin']);

  assert.deepEqual([...input.ownWoven], ['cvv', 'pin'], 'the payment control said own');
  assert.ok(!input.ownWoven.includes('password' as never), 'and the password control said decoy');
});

test('and the other way round, so neither is right by accident', () => {
  const input = secondInputFrom(
    { ...CARD, weaveSecondMode: 'own', mixSecondMode: 'decoy' },
    {},
    ['password', 'cvv', 'pin'],
  );

  assert.deepEqual([...input.ownWoven], ['password']);
});

test('a field nobody is weaving is never own-woven, whatever the mode says', () => {
  // `weaving` is what the save is about to do; the mode only narrows it. A mode on `own` cannot
  // conjure a weave that is not happening, and a box under a field nobody ticked stays an ordinary
  // second value.
  const input = secondInputFrom(CARD, {}, []);

  assert.deepEqual([...input.ownWoven], []);
});

test('the boxes are read by the key list — a name from elsewhere does not enter the save', () => {
  const input = secondInputFrom(
    {
      secondValues: { cvv2: '481', holder2: 'not a key here', password: 'the FIRST value', pin2: 7 },
      mixSecondMode: 'own',
    },
    {},
    [],
  );

  assert.deepEqual(input.typed, { cvv2: '481' }, 'only known keys, only strings');
});

test('the clear ticks are read the same way, so an unknown name cannot delete anything', () => {
  const input = secondInputFrom(
    { clearSecond: { cvv2: true, pin2: false, holder2: true, password2: 'yes' } },
    {},
    [],
  );

  assert.deepEqual([...input.cleared], ['cvv2'], 'true, and a known key — a string is not a tick');
});

test('a message with nothing in it is an empty answer rather than a throw', () => {
  const input = secondInputFrom({}, { cvv2: 'held' }, ['cvv']);

  assert.deepEqual(input.typed, {});
  assert.deepEqual([...input.cleared], []);
  assert.deepEqual([...input.ownWoven], [], 'no mode is the safe mode');
  assert.deepEqual(input.stored, { cvv2: 'held' }, 'and what is held is carried through untouched');
});

test('the halves handed to the weave are keyed by FIELD, and only the own-woven ones', () => {
  const input = secondInputFrom(CARD, {}, ['password', 'cvv', 'pin']);

  assert.deepEqual(secondsForWeave(input), { cvv: '481', pin: '9137' });
});

test('an own-woven field with an empty box contributes NO half — the refusal is the gate’s job', () => {
  // Handing the weave an empty string would make it draw a decoy, which is precisely the outcome
  // the refusal exists to prevent. So this says nothing and lets the gate speak.
  const input = secondInputFrom(
    { secondValues: { cvv2: '' }, mixSecondMode: 'own' },
    {},
    ['cvv'],
  );

  assert.deepEqual(secondsForWeave(input), {});
  assert.deepEqual([...input.ownWoven], ['cvv'], 'and it is still own-woven, so the gate will refuse');
});

test('the two forms between them cover every weave point, with none in both', () => {
  // The guard that keeps a seventh weave point from being governed by nothing: every key must have a
  // form that answers for it, and no field may have two answers.
  const covered = [...PASSWORD_FORM.points, ...PAYMENT_FORM.points];

  assert.equal(new Set(covered).size, covered.length, 'no field is governed twice');
  assert.deepEqual(
    [...covered].map((point) => `${point}2`).sort(),
    [...SECOND_KEYS].sort(),
    'and every record key has a form that answers for it',
  );
});
