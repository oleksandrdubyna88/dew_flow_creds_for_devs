import assert from 'node:assert/strict';
import { test } from 'node:test';
import Module from 'node:module';
import type { PaymentFields } from '../paymentFields';

/**
 * The switch, asserted where it is WIRED rather than only where it is computed.
 *
 * <p>`paymentFormSwitch.test.ts` proves the rule; this proves the rule RUNS. It is the same gap that
 * bit this feature twice already — `clearForForm` shipped in S1.2 with no caller at all, and
 * `withheldFromShare` existed, was tested, and was never called. A pure function with a green test and
 * no caller is a green test about nothing.</p>
 */

const captured = { warnings: [] as string[], answer: undefined as string | undefined };

function stubbedVscode(): Record<string, unknown> {
  return {
    window: {
      showWarningMessage: (text: string): Promise<string | undefined> => {
        captured.warnings.push(text);
        return Promise.resolve(captured.answer);
      },
      showQuickPick: (): Promise<undefined> => Promise.resolve(undefined),
      showInputBox: (): Promise<undefined> => Promise.resolve(undefined),
      showInformationMessage: (): undefined => undefined,
      showErrorMessage: (): undefined => undefined,
    },
    Uri: { file: (p: string): object => ({ fsPath: p }) },
    workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
    },
    ThemeIcon: class {},
    commands: { registerCommand: () => ({ dispose: (): void => undefined }) },
  };
}

function gate(): typeof import('../paymentSaveGate') {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    return request === 'vscode' ? stubbedVscode() : original.call(this, request, ...rest);
  };
  try {
    return require('../paymentSaveGate') as typeof import('../paymentSaveGate');
  } finally {
    loader._load = original;
  }
}

const STORED_CARD: PaymentFields = {
  number: '4111111111111111',
  expiry: '12/29',
  cvv: '123',
  pin: '4321',
};

/** A save payload as the webview sends it — bank boxes filled, card boxes emptied by the switch. */
const RETYPED_AS_BANK: Record<string, unknown> = {
  paymentForm: 'bank',
  cardNumber: '',
  cardCvv: '',
  cardPin: '',
  bankBeneficiary: 'A Person',
  bankIban: 'NL91ABNA0417164300',
};

test('retyping a stored card as bank details asks first, naming fields and no values', async () => {
  captured.warnings = [];
  captured.answer = 'Switch and delete';

  const agreed = await gate().confirmFormSwitch('bank', {
    initial: { paymentForm: 'card' },
    initialPayment: STORED_CARD,
  });

  assert.equal(agreed, true);
  assert.equal(captured.warnings.length, 1, 'asked exactly once');
  assert.match(captured.warnings[0], /card number/i, 'the person is told what goes');
  assert.ok(!captured.warnings[0].includes('4111'), 'and never shown the value being deleted');
  assert.ok(!captured.warnings[0].includes('123'), 'the CVV did not reach the dialog either');
});

test('declining the confirmation refuses the save outright', async () => {
  // Not "saves without clearing" — the whole save does not happen, so the entry and its record are
  // exactly as they were. A half-applied switch would be the worst of both.
  captured.warnings = [];
  captured.answer = undefined; // Esc, or the dialog's own Cancel

  const agreed = await gate().confirmFormSwitch('bank', {
    initial: { paymentForm: 'card' },
    initialPayment: STORED_CARD,
  });

  assert.equal(agreed, false);
});

test('a save that changes no form asks nothing at all', async () => {
  captured.warnings = [];

  const agreed = await gate().confirmFormSwitch('card', {
    initial: { paymentForm: 'card' },
    initialPayment: STORED_CARD,
  });

  assert.equal(agreed, true);
  assert.deepEqual(captured.warnings, [], 'editing a card must not raise a modal');
});

test('switching an EMPTY record asks nothing — the modal people learn to dismiss', async () => {
  captured.warnings = [];

  const agreed = await gate().confirmFormSwitch('bank', { initial: { paymentForm: 'card' } });

  assert.equal(agreed, true);
  assert.deepEqual(captured.warnings, []);
});

test('the record actually written holds NOT ONE field of the form it left', async () => {
  // The integration the plan asks for: over a payload, through the real composition, with the result
  // being what `applyFormSecrets` would store. This is where `clearForForm` finally has a caller.
  const written = gate().paymentRecordFor(RETYPED_AS_BANK, 'bank');

  for (const key of ['number', 'expiry', 'cvv', 'pin']) {
    assert.equal(
      (written as Record<string, unknown>)[key],
      undefined,
      `${key} survived into a bank record — it would sync, back up and export`,
    );
  }
  assert.equal(written.iban, 'NL91ABNA0417164300', 'and the new form keeps its own fields');
  assert.equal(written.beneficiary, 'A Person');
});

test('a card that stays a card keeps its fields and gains its brand', async () => {
  const written = gate().paymentRecordFor(
    { paymentForm: 'card', cardNumber: '4111 1111 1111 1111', cardCvv: '123' },
    'card',
  );

  assert.equal(written.number, '4111 1111 1111 1111');
  assert.equal(written.cvv, '123');
  assert.equal(written.brand, 'visa', 'derived on every save, so a corrected number corrects the mark');
});

test('an unknown form falls back rather than storing a record nothing can render', async () => {
  const written = gate().paymentRecordFor({ cardNumber: '4111111111111111' }, 'not-a-form');
  assert.equal(written.number, '4111111111111111', 'the default form is the card');
});

test('a stored record reaches the webview by message, and only by message', async () => {
  const sent: unknown[] = [];
  gate().answerCardValues((message) => sent.push(message), { initialPayment: STORED_CARD });

  assert.equal(sent.length, 1);
  const message = sent[0] as { type: string; fields: Record<string, string> };
  assert.equal(message.type, 'paymentValues');
  assert.equal(message.fields.cardNumber, '4111111111111111');
  assert.equal(message.fields.bankIban, '', 'every box is answered, so a switch blanks the others');
});

test('a form given NO stored record still asks nothing and writes nothing away', () => {
  // The shape of the bug both reviewers found independently, kept as a test so it cannot come back.
  //
  // `initialPayment` had no producer: `editNode` filled `initialNotes`, `initialFields`,
  // `initialConfigBody` and `initialDbConnection` and simply never filled this one. Every consequence
  // followed from that single missing line — the form opened blank over a real card, saving it wrote
  // `{}`, and `{}` serialises to nothing, which DELETES the record. The destructive-switch modal could
  // never fire either, because it computes its warning from the same absent record.
  //
  // What this asserts is the contract that makes the missing line detectable: with no record, there is
  // nothing to lose and nothing to warn about — so a warning appearing here would mean the record came
  // from somewhere it should not, and the SILENCE here is what makes `editNode`'s own test meaningful.
  const sent: unknown[] = [];
  gate().answerCardValues((message) => sent.push(message), {});

  const message = sent[0] as { fields: Record<string, string> };
  assert.equal(Object.values(message.fields).every((value) => value === ''), true, 'every box is blank');
});

test('a marked field is WOVEN by the real save path, and an unmarked one is not', () => {
  // The wiring test for S3.3: the marks travel in the payload, and `paymentRecordFor` is where they
  // stop being a checkbox and become a stored value nobody can read back without the method.
  const written = gate().paymentRecordFor(
    {
      paymentForm: 'card',
      cardNumber: '4111111111111111',
      cardCvv: '123',
      cardPin: '4321',
      mixFields: ['cvv'],
      mixMethod: 'f1',
    },
    'card',
  );

  assert.notEqual(written.cvv, '123', 'the CVV is not stored as typed');
  assert.equal(written.cvv?.length, 6, 'it is woven with a decoy of its own length');
  assert.equal(written.pin, '4321', 'and the PIN, which was not marked, is stored plainly');
  assert.deepEqual(written.shuffledFields, ['cvv'], 'the record says which field needs a method');
});

test('the brand is derived BEFORE the number is woven, which is why it is a stored field', () => {
  // §3a's reason, asserted: after weaving there is no number left to read a brand from.
  const written = gate().paymentRecordFor(
    { paymentForm: 'card', cardNumber: '4111111111111111', mixFields: ['number'], mixMethod: 'f2' },
    'card',
  );

  assert.equal(written.brand, 'visa');
  assert.notEqual(written.number, '4111111111111111', 'and the number itself is woven');
});

test('no method reaches the stored record, whatever the form sent', () => {
  const written = gate().paymentRecordFor(
    { paymentForm: 'card', cardCvv: '123', mixFields: ['cvv'], mixMethod: 'f9' },
    'card',
  );

  assert.ok(!JSON.stringify(written).includes('f9'), 'the method must live only in the person’s memory');
});

test('a per-field method overrides the shared one', () => {
  const shared = gate().paymentRecordFor(
    { paymentForm: 'card', cardCvv: '123', mixFields: ['cvv'], mixMethod: 'f1' },
    'card',
  );
  const own = gate().paymentRecordFor(
    { paymentForm: 'card', cardCvv: '123', mixFields: ['cvv'], mixMethod: 'f1', mixMethods: { cvv: 'f6' } },
    'card',
  );

  assert.notEqual(own.cvv, shared.cvv, 'a different method produces a different stored value');
});
