import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type SecondInput, refuseSecondPairs, secondRecordFor } from '../secondSave';
import type { SecondValues } from '../secondValues';

/**
 * S5 — the save gate: one test per row of the plan's state table, and the named one first.
 *
 * <p>The named test asserts the STORED state rather than the generator. "The random was never
 * called" proves a decoy was not drawn; it says nothing about whether the typed value was ALSO
 * written to the slot, which is the thing that would hand a reader of the vault the half to
 * subtract. So these read back what the save decided to store.</p>
 */

function input(over: Partial<SecondInput> = {}): SecondInput {
  return { typed: {}, cleared: [], ownWoven: [], stored: {}, ...over };
}

const LABELS = { password: 'password', cvv: 'CVV', iban: 'IBAN' } as const;

/* ── the rule the whole feature stands on ─────────────────────────────────────────────────── */

test('a woven field’s second value is never stored beside it', () => {
  const stored = secondRecordFor(input({
    ownWoven: ['password'],
    typed: { password2: 'the other password' },
  }));

  assert.deepEqual(stored, {}, 'it lives inside the woven string and nowhere else');
});

test('and the field NOT being woven in the same save keeps its second value', () => {
  // The companion that stops the rule above being implemented as "drop everything": one card can
  // have a woven CVV and an ordinary second PIN, and the save must tell them apart per field.
  const stored = secondRecordFor(input({
    ownWoven: ['cvv'],
    typed: { cvv2: '481', pin2: '9137' },
  }));

  assert.deepEqual(stored, { pin2: '9137' });
});

test('a decoy save stores what was typed — the box is not a weave half then', () => {
  // With the mode on `decoy` the weave draws its own partner, so a second value typed beside it is
  // an ordinary second value and belongs in the record.
  const stored = secondRecordFor(input({
    ownWoven: [],
    typed: { password2: 'kept in the clear' },
  }));

  assert.deepEqual(stored, { password2: 'kept in the clear' });
});

/* ── the state table, a row at a time ─────────────────────────────────────────────────────── */

test('an untouched box KEEPS what is stored — an unrelated edit loses nothing', () => {
  const held: SecondValues = { password2: 'typed last week', cvv2: '481' };

  assert.deepEqual(secondRecordFor(input({ stored: held })), held);
  assert.deepEqual(
    secondRecordFor(input({ stored: held, typed: { cvv2: '737' } })),
    { password2: 'typed last week', cvv2: '737' },
    'and a box somebody DID touch replaces just that one',
  );
});

test('a box holding only whitespace is an untouched box, not an empty value', () => {
  assert.deepEqual(
    secondRecordFor(input({ stored: { password2: 'held' }, typed: { password2: '   ' } })),
    { password2: 'held' },
  );
});

test('a value is stored exactly as typed — spaces inside it are part of the secret', () => {
  assert.deepEqual(
    secondRecordFor(input({ typed: { password2: ' pass word ' } })),
    { password2: ' pass word ' },
  );
});

test('CLEAR deletes, and beats anything left in the box', () => {
  assert.deepEqual(secondRecordFor(input({ stored: { cvv2: '481' }, cleared: ['cvv2'] })), {});
  assert.deepEqual(
    secondRecordFor(input({ stored: { cvv2: '481' }, typed: { cvv2: '737' }, cleared: ['cvv2'] })),
    {},
    'ticking clear and typing is a person changing their mind, and the tick is the deliberate act',
  );
});

test('nothing typed and nothing stored stores nothing', () => {
  assert.deepEqual(secondRecordFor(input()), {});
  assert.deepEqual(secondRecordFor(input({ typed: { pin2: '' } })), {});
});

test('weaving a field CONSUMES a value that was stored for it in the clear', () => {
  // Somebody stored a second PIN, then came back and wove the PIN with it. The stored copy must go:
  // leaving it is precisely the "half to subtract" this rule exists to prevent, and it would be the
  // worst version of the defect because the record would look untouched.
  const stored = secondRecordFor(input({
    ownWoven: ['pin'],
    stored: { pin2: '9137', cvv2: '481' },
    typed: { pin2: '9137' },
  }));

  assert.deepEqual(stored, { cvv2: '481' });
});

/* ── the refusals ─────────────────────────────────────────────────────────────────────────── */

test('choosing to supply the half and supplying none is refused, and says which way out', () => {
  const refusal = refuseSecondPairs(
    { password: 'hunter2x' },
    LABELS,
    input({ ownWoven: ['password'], typed: {} }),
  );

  assert.match(refusal, /chose to supply the second password yourself and the box is empty/);
  assert.match(refusal, /choose a decoy and one will be made for you/, 'the way out is in the sentence');
  assert.match(refusal, /Nothing has been saved/);
});

test('the same empty box with a DECOY chosen is not a refusal at all', () => {
  // The two meanings of blank, and the mode is what tells them apart. This is the row that could not
  // exist when the box was going to be the only control.
  assert.equal(
    refuseSecondPairs({ password: 'hunter2x' }, LABELS, input({ ownWoven: [] })),
    '',
  );
});

test('a mismatched pair is refused with the pair rule’s own sentence, not a second one', () => {
  const refusal = refuseSecondPairs(
    { password: 'hunter2!' },
    LABELS,
    input({ ownWoven: ['password'], typed: { password2: 'hunter2x' } }),
  );

  assert.match(refusal, /different kinds of character/);
});

test('a good pair refuses nothing, and neither does a field this save is not weaving', () => {
  assert.equal(
    refuseSecondPairs(
      { password: 'hunter2x', cvv: '481' },
      LABELS,
      input({ ownWoven: ['password'], typed: { password2: 'flyfish7', cvv2: '' } }),
    ),
    '',
    'the CVV is not being woven, so its empty box is nobody’s business here',
  );
});

test('the FIRST refusal is the one shown — a person fixes one thing at a time', () => {
  const refusal = refuseSecondPairs(
    { password: 'hunter2x', cvv: '481' },
    LABELS,
    input({ ownWoven: ['password', 'cvv'], typed: { password2: '', cvv2: '' } }),
  );

  assert.match(refusal, /second password/);
  assert.ok(!refusal.includes('CVV'), 'one sentence, about one field');
});
