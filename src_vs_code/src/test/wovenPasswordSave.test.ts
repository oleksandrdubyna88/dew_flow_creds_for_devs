import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wovenSave } from '../wovenPasswordSave';
import { unweaveSecret } from '../wovenSecret';
import { SHUFFLE_CODES } from '../shuffle';

/**
 * The four states a save meets: typed or not, marked or not, already woven or not, and a method
 * that may be nonsense because it came off a page message.
 */

function pinnedRandom(): () => number {
  let seed = 20260903;
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

test('typing nothing keeps everything, the mark included', () => {
  // An edit that changes a URL must not quietly unmark a woven password.
  assert.deepEqual(wovenSave('', false, '', true, pinnedRandom()), {
    value: '',
    woven: true,
    refusal: '',
  });
});

test('a new password WITHOUT the mark replaces the old one and drops the mark', () => {
  // The "replace" path, not an "unweave" one: nothing is unwoven, the old value is overwritten by
  // one the person just typed, and the entry stops claiming a property it no longer has.
  const saved = wovenSave('a-new-password', false, SHUFFLE_CODES[0], true, pinnedRandom());

  assert.equal(saved.value, 'a-new-password');
  assert.equal(saved.woven, false);
});

test('a marked password is stored woven, and comes back under its method', () => {
  const saved = wovenSave('hunter2!', true, SHUFFLE_CODES[4], false, pinnedRandom());

  assert.equal(saved.woven, true);
  assert.notEqual(saved.value, 'hunter2!');
  const reading = unweaveSecret(saved.value, SHUFFLE_CODES[4]);
  assert.ok(reading !== undefined);
  assert.ok(reading.first === 'hunter2!' || reading.second === 'hunter2!');
});

test('a method this build does not know is not a method — and the save SAYS so', () => {
  // It arrives from a page message. Storing the value plain under a form that said it would weave
  // is the one outcome that must not happen quietly.
  const saved = wovenSave('hunter2!', true, 'f99', false, pinnedRandom());

  assert.equal(saved.value, 'hunter2!', 'stored as typed');
  assert.equal(saved.woven, false, 'and the entry does not claim otherwise');
  assert.match(saved.refusal, /No weaving method was chosen/);
});

test('a password too short to weave is stored plain, with the reason', () => {
  const saved = wovenSave('a', true, SHUFFLE_CODES[0], false, pinnedRandom());

  assert.equal(saved.value, 'a');
  assert.equal(saved.woven, false);
  assert.match(saved.refusal, /cannot be woven/);
});

test('nothing is refused silently — a refusal always comes with a sentence', () => {
  for (const [typed, weave, method] of [
    ['a', true, SHUFFLE_CODES[0]],
    ['hunter2!', true, 'nonsense'],
  ] as const) {
    const saved = wovenSave(typed, weave, method, false, pinnedRandom());
    assert.equal(saved.woven, false);
    assert.notEqual(saved.refusal, '', `"${typed}" was refused without saying why`);
  }
});
