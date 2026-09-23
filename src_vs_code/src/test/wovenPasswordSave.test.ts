import assert from 'node:assert/strict';
import { test } from 'node:test';
import { passwordPairRefusal, unwovenWarning, wovenSave } from '../wovenPasswordSave';
import { ownHalfRefusal } from '../secondSave';
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

/**
 * The other half of a save, and four reviewers found it missing: a weave that was REFUSED stored
 * the password exactly as typed and said so nowhere — a ticked box, a saved entry, and a secret in
 * the clear that looks woven. What the form asks BEFORE it settles is decided here, beside what it
 * would store, so the two cannot come to disagree about which of the four states a save is in.
 */
test('a refused weave is put to the person, and says what would be stored instead', () => {
  const tooShort = unwovenWarning('a', true, SHUFFLE_CODES[0], false);
  const noMethod = unwovenWarning('hunter2!', true, 'f99', false);

  assert.match(String(tooShort), /clear/i, 'it says what would be stored');
  assert.match(String(noMethod), /method/i, 'and why');
});

test('unticking the box on a woven entry, with nothing typed, is put to the person too', () => {
  // The narrow half of a reviewer's last finding. The box now arrives TICKED for a woven entry, so
  // unticking it is deliberate — and on its own it does nothing at all, which is a gap between what
  // somebody did and what happened. Said once, at the moment it matters.
  assert.match(String(unwovenWarning('', false, '', true)), /still woven/i);
  assert.equal(unwovenWarning('', false, '', false), undefined, 'nothing to say about an ordinary entry');
});

test('a weave that succeeds asks nothing, and neither does an ordinary save', () => {
  assert.equal(unwovenWarning('hunter2!', true, SHUFFLE_CODES[0], false), undefined);
  assert.equal(unwovenWarning('', true, SHUFFLE_CODES[0], false), undefined, 'nothing typed is nothing to weave');
  assert.equal(unwovenWarning('plain-one', false, '', false), undefined);
});

/* ── the person's OWN second half (#52) ───────────────────────────────────────────────────── */

test('a typed second half is woven in, and BOTH values come back under the method', () => {
  // The whole point of #52: not "a value and a decoy" but "two values of mine". Both halves of the
  // reading are real, which is what "seed 1, seed 2" asks for.
  const saved = wovenSave('hunter2x', true, SHUFFLE_CODES[3], false, pinnedRandom(), {
    own: true,
    typed: 'flyfish7',
  });

  assert.equal(saved.woven, true);
  assert.equal(saved.refusal, '');
  const reading = unweaveSecret(saved.value, SHUFFLE_CODES[3]);
  assert.deepEqual(
    [reading?.first, reading?.second].sort(),
    ['flyfish7', 'hunter2x'],
    'the pair, and nothing says which row is which',
  );
});

test('with a typed second half the decoy generator is NEVER reached', () => {
  // "We did not call it" is a claim only a throwing random can settle.
  const explode = (): number => {
    throw new Error('a decoy was drawn for a second value the person typed');
  };

  assert.doesNotThrow(() => wovenSave('hunter2x', true, SHUFFLE_CODES[0], false, explode, {
    own: true,
    typed: 'flyfish7',
  }));
});

test('choosing to supply the half and supplying none refuses, and stores the password AS TYPED', () => {
  // Not woven under a decoy drawn behind their back — that would store a value they did not choose,
  // in a field they will later be asked to recognise. Stored plain, and said out loud.
  const saved = wovenSave('hunter2x', true, SHUFFLE_CODES[0], false, pinnedRandom(), { own: true, typed: '' });

  assert.equal(saved.woven, false);
  assert.equal(saved.value, 'hunter2x');
  assert.match(saved.refusal, /box is empty/);
  assert.match(saved.refusal, /stored as you typed it, unwoven/);
});

test('a second half that cannot PAIR refuses with the pair rule’s own sentence', () => {
  const saved = wovenSave('hunter2!', true, SHUFFLE_CODES[0], false, pinnedRandom(), {
    own: true,
    typed: 'hunter2x',
  });

  assert.equal(saved.woven, false, 'and nothing was woven — the pair is judged BEFORE the weave');
  assert.equal(saved.value, 'hunter2!');
  assert.match(saved.refusal, /different kinds of character/);
});

test('an empty box under a DECOY is the ordinary case, and weaves', () => {
  const saved = wovenSave('hunter2x', true, SHUFFLE_CODES[0], false, pinnedRandom(), { own: false, typed: '' });

  assert.equal(saved.woven, true);
  assert.equal(saved.refusal, '');
});

/* ── owner decision 4: a pair that cannot pair is REFUSED, never put as a question ─────────── */

const OWN = (typed: string): { own: boolean; typed: string } => ({ own: true, typed });

test('a second half that cannot pair is refused, in the sentence a payment field refuses with', () => {
  // The dialog used to offer "Save the password in the clear?" for these — a way through a refusal,
  // under a sentence that already ended "Nothing has been saved".
  const mismatched = passwordPairRefusal('hunter2!', true, SHUFFLE_CODES[0], OWN('hunter2x'));
  const empty = passwordPairRefusal('hunter2x', true, SHUFFLE_CODES[0], OWN(''));
  const blank = passwordPairRefusal('hunter2x', true, SHUFFLE_CODES[0], OWN('   '));

  assert.equal(mismatched, ownHalfRefusal('hunter2!', 'hunter2x', 'password'), 'ONE sentence, shared with payment');
  assert.match(mismatched, /different kinds of character.*Nothing has been saved/s);
  assert.match(empty, /second password yourself and the box is empty.*Nothing has been saved/s);
  assert.equal(blank, empty, 'whitespace is no second half, exactly as for a card');
});

test('nothing is refused where no weave would happen, or where the pair is fine', () => {
  // The companions: without them, a gate that refused every save would pass the test above.
  const cases: ReadonlyArray<[string, string, boolean, string, { own: boolean; typed: string }]> = [
    ['a good pair', 'hunter2x', true, SHUFFLE_CODES[0], OWN('flyfish7')],
    ['a decoy', 'hunter2x', true, SHUFFLE_CODES[0], { own: false, typed: '' }],
    ['weaving unticked', 'hunter2x', false, SHUFFLE_CODES[0], OWN('')],
    ['nothing typed (an untouched woven entry)', '', true, SHUFFLE_CODES[0], OWN('')],
    ['too short to weave — a question, not this', 'a', true, SHUFFLE_CODES[0], OWN('')],
    ['a method this build does not know — a question, not this', 'hunter2x', true, 'f99', OWN('')],
  ];

  for (const [name, typed, weave, method, second] of cases) {
    assert.equal(passwordPairRefusal(typed, weave, method, second), '', name);
  }
});

test('the question never speaks for the pair: it cannot even be told about one', () => {
  // `unwovenWarning` lost its second-half parameter, so it can only be about the password and the
  // method. What it still asks is unchanged — pinned so the split did not drop a question.
  assert.match(String(unwovenWarning('a', true, SHUFFLE_CODES[0], false)), /cannot be woven[\s\S]*in the clear\?/);
  assert.match(String(unwovenWarning('hunter2x', true, 'f99', false)), /No weaving method/);
  assert.equal(unwovenWarning('hunter2x', true, SHUFFLE_CODES[0], false), undefined);
});
