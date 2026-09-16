import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module from 'node:module';
import { parseSecondValues } from '../secondValues';
import { SHUFFLE_CODES } from '../shuffle';
import { unweaveSecret } from '../wovenSecret';

/**
 * S5 — the payment side of the gate, driven through the real save path.
 *
 * <p>The refusal runs BEFORE the checksum gate, which is the plan's order and not an accident: a
 * refused pair must mean nothing was woven, rather than a card woven under a method whose partner was
 * then rejected. These assert the sentence and the record, not the plumbing between them.</p>
 */

/**
 * The gate imports `dialogs`, which imports `vscode`, so it is loaded behind the same stub
 * `paymentSaveGate.test.ts` uses. Nothing here raises a dialog: every test below reads a sentence or
 * a record, and the confirm path has its own tests next door.
 */
function gate(): typeof import('../paymentSaveGate') {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    return request === 'vscode'
      ? {
        window: { showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined) },
        workspace: { getConfiguration: () => ({ get: (_k: string, fallback: unknown) => fallback }) },
      }
      : original.call(this, request, ...rest);
  };
  try {
    return require('../paymentSaveGate') as typeof import('../paymentSaveGate');
  } finally {
    loader._load = original;
  }
}

const { paymentRecordFor, paymentWeavingNow, secondPairRefusal } = gate();

function page(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    paymentForm: 'card',
    cardNumber: '4111111111111111',
    cardCvv: '481',
    cardPin: '9137',
    mixFields: ['cvv'],
    mixMethod: SHUFFLE_CODES[0],
    mixSecondMode: 'own',
    secondValues: { cvv2: '737' },
    ...over,
  };
}

test('a good pair weaves the person’s OWN half in, and both halves come back', () => {
  const record = paymentRecordFor(page(), 'card');

  assert.deepEqual(record.shuffledFields, ['cvv']);
  assert.deepEqual(record.ownSecond, ['cvv'], 'and the record says the half was theirs');
  const reading = unweaveSecret(record.cvv ?? '', SHUFFLE_CODES[0]);
  assert.deepEqual([reading?.first, reading?.second].sort(), ['481', '737']);
});

test('a mismatched pair is REFUSED, and the sentence names the field a person sees', () => {
  const refusal = secondPairRefusal(page({ secondValues: { cvv2: '73' } }), 'card');

  assert.match(refusal, /second CVV/i);
  assert.match(refusal, /same length/i);
  assert.match(refusal, /Nothing has been saved/);
});

test('choosing to supply the half and leaving the box empty is refused too', () => {
  const refusal = secondPairRefusal(page({ secondValues: {} }), 'card');

  assert.match(refusal, /box is empty/);
});

test('the same empty box on DECOY refuses nothing and weaves as it always did', () => {
  const data = page({ mixSecondMode: 'decoy', secondValues: {} });

  assert.equal(secondPairRefusal(data, 'card'), '');
  const record = paymentRecordFor(data, 'card');
  assert.deepEqual(record.shuffledFields, ['cvv']);
  assert.equal(record.ownSecond, undefined, 'a generated half is not the person’s own');
});

test('a field nobody marked is judged by nothing, however filled its box is', () => {
  const refusal = secondPairRefusal(page({ mixFields: [], secondValues: { cvv2: 'nonsense length' } }), 'card');

  assert.equal(refusal, '');
});

test('a phrase is judged by its own gate, not this one', () => {
  // A phrase's two columns ARE the pair; `phraseRefusal` judges them, and judging them twice would
  // mean two sentences about one problem that could come to disagree.
  assert.equal(secondPairRefusal(page({ paymentForm: 'phrase' }), 'phrase'), '');
});

test('the fields being woven are the ticked ones that are weave points, and nothing else', () => {
  assert.deepEqual(
    [...paymentWeavingNow(page({ mixFields: ['cvv', 'holder', 'pin'] }), 'card')],
    ['cvv', 'pin'],
    'a holder is not a weave point, so it cannot be one here either',
  );
});

test('a woven field’s typed half is NOT left in the record beside it', () => {
  // The rule the feature stands on, asserted where the save actually runs rather than in the pure
  // module alone: what `paymentRecordFor` returns carries the woven value, and the second value it
  // was woven with is nowhere in it.
  const record = paymentRecordFor(page(), 'card');

  assert.ok(!JSON.stringify(record).includes('737'), 'the half is inside the woven value and nowhere else');
  assert.deepEqual(parseSecondValues(JSON.stringify(record)), {}, 'and the record is not a second-values record');
});

/**
 * ONE answer to "which fields is this save weaving", asked by both halves.
 *
 * <p>From the code round. The gate had its own filter written to agree with the weaver's; a field the
 * weaver consumed and the record kept would leave a reader the half to subtract, and a field the
 * record dropped and the weaver never touched would lose a value somebody typed. Two filters written
 * to agree are two filters that can stop agreeing, so there is one function and both call it.</p>
 */
test('the list names exactly what the weaver will consume, and nothing else', () => {
  // Every condition `weaveOne` applies, asked once: marked, a weave point, not woven already, a
  // method this build knows, and a value long enough to weave. A field the weaver consumed and the
  // record kept would leave a reader the half to subtract; a field the record dropped and the weaver
  // never touched would lose a value somebody typed.
  assert.deepEqual([...paymentWeavingNow(page(), 'card')], ['cvv'], 'a marked field with a value');
  assert.deepEqual(
    [...paymentWeavingNow(page({ mixFields: ['holder'] }), 'card')],
    [],
    'a holder is not a weave point',
  );
  assert.deepEqual(
    [...paymentWeavingNow(page({ cardCvv: '' }), 'card')],
    [],
    'an emptied field has nothing to weave, so it consumes no second value either',
  );
  assert.deepEqual(
    [...paymentWeavingNow(page({ mixMethod: 'not-a-method' }), 'card')],
    [],
    'and a method this build does not know weaves nothing — the typed half stays in the record',
  );
});

/**
 * A form switch must not refuse on a field the chosen form does not own.
 *
 * <p>Raised by the automated reviewer. `confirmFormSwitch` asks the question and leaves `data` as it
 * was, so a card's ticked CVV is still in the message when somebody has switched to bank details.
 * `paymentRecordFor` drops it afterwards through `clearForForm` — so the value is not stored either
 * way — but the GATE ran first and could refuse a save over a field that was about to be discarded.
 * A false refusal, which is the worse of the two failures: nothing is at risk and the person cannot
 * save.</p>
 */
test('a card field left ticked does not refuse a save of bank details', () => {
  const switched = page({
    paymentForm: 'bank',
    bankIban: 'DE02120300000000202051',
    mixFields: ['cvv'],
    secondValues: { cvv2: 'nonsense length' },
  });

  assert.equal(secondPairRefusal(switched, 'bank'), '', 'the CVV is not the bank form’s to judge');
});

test('and the same save still judges a field the chosen form DOES own', () => {
  // The companion: a fix that made the gate ignore everything would pass the test above.
  const switched = page({
    paymentForm: 'bank',
    bankIban: 'DE02120300000000202051',
    mixFields: ['iban'],
    secondValues: { iban2: 'too short' },
  });

  assert.match(secondPairRefusal(switched, 'bank'), /same length/);
});
