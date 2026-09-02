import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PaymentViewHost, isPaymentMessage } from '../paymentViewHost';
import { paymentCardFor } from '../paymentViewMessages';
import { PaymentFields } from '../paymentFields';
import { PHRASE_VISIBLE_MS } from '../revealGate';
import { SHUFFLE_CODES, shuffleTokens } from '../shuffle';

/**
 * The host half of the payment card: what is asked before a value is answered.
 *
 * <p>The second test here is the one the plan review earned its cost with. The first draft attached
 * the reveal gate to the `reveal` message and not to `reassemble` — so a woven PIN reached through
 * the method picker would have come back with no second question, which is the requirement inverted
 * while every test of the requirement stayed green.</p>
 */

const CODE = SHUFFLE_CODES[2];
const WOVEN_PIN = shuffleTokens([...'4821'], [...'9137'], CODE).join('');

const random = (): number => 0.5;

interface Harness {
  readonly host: PaymentViewHost;
  readonly posted: unknown[];
  readonly copied: string[];
  readonly asked: string[];
  answer: boolean;
}

function harness(fields: PaymentFields, form: 'card' | 'phrase' = 'card'): Harness {
  const posted: unknown[] = [];
  const copied: string[] = [];
  const asked: string[] = [];
  const state = { answer: true };
  const view = paymentCardFor('entity-1', form, fields, random);
  const host = new PaymentViewHost({
    view: () => view,
    record: () => Promise.resolve(fields),
    post: (message) => posted.push(message),
    confirm: (text) => {
      asked.push(text);
      return Promise.resolve(state.answer);
    },
    copy: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
  });
  return {
    host,
    posted,
    copied,
    asked,
    get answer() {
      return state.answer;
    },
    set answer(value: boolean) {
      state.answer = value;
    },
  };
}

test('the card is filled on load with everything that does not have to be asked for', async () => {
  const h = harness({ number: '4111', holder: 'A Person', cvv: '737' });

  await h.host.handle('payment', 'values');

  assert.deepEqual(h.posted, [
    { type: 'paymentValues', entityId: 'entity-1', values: { number: '4111', holder: 'A Person' } },
  ]);
  assert.deepEqual(h.asked, [], 'and nothing was asked, because nothing gated was sent');
});

test('reassembling a woven PIN asks the same question revealing one does', async () => {
  // The review finding. Guarding `reveal` alone leaves the second question on the door beside an
  // open window: the value that comes back through the picker is the same PIN.
  const h = harness({ pin: WOVEN_PIN, shuffledFields: ['pin'] });
  h.answer = false;

  await h.host.handle('reassemble', `pin|${CODE}`);

  assert.equal(h.asked.length, 1, 'it asked');
  assert.match(h.asked[0], /PIN/, 'and it named the field rather than asking an abstract question');
  assert.deepEqual(h.posted, [], 'a declined question posts nothing at all — not even an empty row');
});

test('a granted field is asked once per card, not once per method', async () => {
  const h = harness({ pin: WOVEN_PIN, shuffledFields: ['pin'] });

  await h.host.handle('reassemble', `pin|${CODE}`);
  await h.host.handle('reassemble', `pin|${SHUFFLE_CODES[5]}`);
  await h.host.handle('reassemble', `pin|${SHUFFLE_CODES[9]}`);

  assert.equal(h.asked.length, 1, 'twelve modals to try twelve methods is a control nobody uses');
  assert.equal(h.posted.length, 3, 'and all three readings came back');
});

test('the grant does not survive the card — the preview tab shows another entry next', async () => {
  const h = harness({ pin: WOVEN_PIN, shuffledFields: ['pin'] });
  await h.host.handle('reassemble', `pin|${CODE}`);

  h.host.reset();
  await h.host.handle('reassemble', `pin|${CODE}`);

  assert.equal(h.asked.length, 2, 'a question answered about one entry is not an answer about the next');
});

test('a woven CARD NUMBER does not ask, because a card number is not a gated field', async () => {
  const woven = shuffleTokens([...'4111111111111111'], [...'4222222222222222'], CODE).join('');
  const h = harness({ number: woven, shuffledFields: ['number'] });

  await h.host.handle('reassemble', `number|${CODE}`);

  assert.deepEqual(h.asked, [], 'the rung is CVV, PIN and an assembled phrase — and only those');
  assert.equal(h.posted.length, 1);
});

test('an assembled phrase asks, comes back as words, and carries its own closing time', async () => {
  const real = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
  const decoy = ['zulu', 'yankee', 'xray', 'whiskey', 'victor', 'uniform'];
  const h = harness(
    { mixed: shuffleTokens(real, decoy, CODE), layout: 'vertical', shuffledFields: ['mixed'] },
    'phrase',
  );

  await h.host.handle('reassemble', `mixed|${CODE}`);

  const message = h.posted[0] as Record<string, unknown>;
  assert.match(h.asked[0], /6 words/, 'the question says how much is about to be on screen');
  assert.equal(message.words, true, 'words, so the page puts each in its own node');
  assert.deepEqual(message.first, real);
  assert.equal(message.visibleMs, PHRASE_VISIBLE_MS, 'and it closes itself');
  assert.equal(h.host.holding, 1, 'the words are held in a buffer while they are on screen');
});

test('every way out of a phrase leads to the same place: the buffer is cleared', async () => {
  const h = harness(
    { mixed: shuffleTokens(['a', 'b', 'c', 'd'], ['w', 'x', 'y', 'z'], CODE), shuffledFields: ['mixed'] },
    'phrase',
  );
  await h.host.handle('reassemble', `mixed|${CODE}`);

  await h.host.handle('paymentClose', 'mixed');

  assert.equal(h.host.holding, 0, 'the page closing it clears it');
  await h.host.handle('reassemble', `mixed|${CODE}`);
  h.host.reset();
  assert.equal(h.host.holding, 0, 'and so does the panel going away');
  await h.host.handle('paymentClose', 'mixed');
  assert.equal(h.host.holding, 0, 'closing twice is not a crash at the moment of going away');
});

test('copying a rebuilt row copies the row, never what is stored', async () => {
  const h = harness({ pin: WOVEN_PIN, shuffledFields: ['pin'] });

  await h.host.handle('copyReading', `pin|a|${CODE}`);

  assert.deepEqual(h.copied, ['4821'], 'the row on screen');
  assert.ok(!h.copied.includes(WOVEN_PIN), 'and never the woven pair the record holds');
  const ack = h.posted.at(-1) as Record<string, unknown>;
  assert.equal(ack.type, 'copied', 'and it says so — the one button whose value is not in a box');
  assert.equal(ack.field, `pin|a`);
});

test('a reading says which method it is FOR, so a late answer can be dropped', async () => {
  // Two clicks are two record reads and their answers can arrive in the other order. Without the
  // method on the message the page would show the first one's rows under a picker naming the second,
  // and a copy would then recompute something else again. (Code review.)
  const h = harness({ pin: WOVEN_PIN, shuffledFields: ['pin'] });

  await h.host.handle('reassemble', `pin|${CODE}`);

  assert.equal((h.posted[0] as Record<string, unknown>).code, CODE);
});

test('a post that throws holds nothing — every path out leads to the same place', async () => {
  // The buffers are installed before the message goes out, because the message is built from them.
  // A webview disposed a moment ago is the ordinary way `postMessage` throws, and an assembled
  // phrase held with nothing on screen to close it would outlive the view it was assembled for.
  const posted: unknown[] = [];
  const host = new PaymentViewHost({
    view: () => paymentCardFor('entity-1', 'card', { pin: WOVEN_PIN, shuffledFields: ['pin'] }, random),
    record: () => Promise.resolve({ pin: WOVEN_PIN, shuffledFields: ['pin'] }),
    post: (message) => {
      posted.push(message);
      throw new Error('the webview is gone');
    },
    confirm: () => Promise.resolve(true),
    copy: () => Promise.resolve(),
  });

  await assert.rejects(() => host.handle('reassemble', `pin|${CODE}`));

  assert.equal(host.holding, 0, 'nothing is held for a reading that never arrived');
});

test('a per-field Copy asks exactly what its Show asks', async () => {
  const h = harness({ cvv: '737', number: '4111' });
  h.answer = false;

  assert.equal(await h.host.allowCopy('pay_cvv'), false, 'copying is showing, to the clipboard');
  assert.equal(await h.host.allowCopy('pay_number'), true, 'and an ordinary field is not gated');
  assert.equal(await h.host.allowCopy('name'), true, 'nor is anything that is not a payment field');
});

test('a declined reveal posts nothing, and a granted one posts exactly the field asked for', async () => {
  const h = harness({ cvv: '737', pin: '4821' });
  h.answer = false;
  await h.host.handle('reveal', 'cvv');
  assert.deepEqual(h.posted, []);

  h.answer = true;
  await h.host.handle('reveal', 'cvv');

  assert.deepEqual(h.posted, [{ type: 'paymentValues', entityId: 'entity-1', values: { cvv: '737' } }]);
});

test('a message naming a field the record does not hold is answered with nothing', async () => {
  const h = harness({ number: '4111' });

  await h.host.handle('reveal', 'cvv');
  await h.host.handle('reassemble', `number|${CODE}`);
  await h.host.handle('copyReading', `holder|a|${CODE}`);

  assert.deepEqual(h.posted, [], 'the payload is checked against the record that is actually loaded');
  assert.deepEqual(h.copied, []);
});

test('the message list is the one the panel routes on', () => {
  for (const type of ['payment', 'reveal', 'reassemble', 'copyReading', 'paymentClose']) {
    assert.ok(isPaymentMessage(type), `${type} is the card's`);
  }
  for (const type of ['copy', 'totp', 'snippet', 'close', 'env']) {
    assert.ok(!isPaymentMessage(type), `${type} belongs to the panel and must keep working`);
  }
});
