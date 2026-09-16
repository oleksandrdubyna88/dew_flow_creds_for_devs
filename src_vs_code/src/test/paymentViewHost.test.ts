import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PaymentViewHost, isPaymentMessage } from '../paymentViewHost';
import { paymentCardFor } from '../paymentViewMessages';
import { PaymentFields } from '../paymentFields';
import { PHRASE_VISIBLE_MS } from '../revealGate';
import { SHUFFLE_CODES, shuffleTokens } from '../shuffle';
import { RowOrderStore } from '../rowFlip';
import { phraseColumns } from '../phraseLayout';

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

/**
 * The order store gets its OWN pinned random, never the card's.
 *
 * <p>`paymentCardFor` draws from `random` for the method order — once per method, per card — so a
 * shared sequence would make which row order is drawn depend on how many methods happen to exist.</p>
 */
const orderStore = (draw: number): RowOrderStore => new RowOrderStore(() => draw);
const AS_READ = 0.1;
const SWAPPED = 0.9;

/** Draws in sequence, repeating the last — so "before and after a clear" is two known answers. */
const scriptedDraws = (...draws: readonly number[]) => {
  let at = 0;
  return (): number => draws[Math.min(at++, draws.length - 1)] ?? 0;
};

function harness(
  fields: PaymentFields,
  form: 'card' | 'phrase' = 'card',
  orders: RowOrderStore = orderStore(AS_READ),
): Harness {
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
    orders,
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

/**
 * The defect: row one was the person's value under every correct method.
 *
 * <p>`weaveSecret` weaves the real value as the first column, `reassemble` returns it as `real`, and
 * the host put `real` into row a — so somebody working through the twelve methods never had to read
 * row two, and the page's promise that neither row is marked was kept by the DOM and broken by the
 * arithmetic. These two tests fail against that build.</p>
 */
test('the first row is not always the person’s value — under a swapped order the real reading is row b', async () => {
  const h = harness({ pin: WOVEN_PIN, shuffledFields: ['pin'] }, 'card', orderStore(SWAPPED));

  await h.host.handle('reassemble', `pin|${CODE}`);

  const message = h.posted[0] as Record<string, unknown>;
  assert.deepEqual(message.first, [...'9137'], 'row one holds the other reading here');
  assert.deepEqual(message.second, [...'4821'], 'and the person’s value is row two');
});

test('a Copy of row a under a swapped order copies what row a SHOWS', async () => {
  const h = harness({ pin: WOVEN_PIN, shuffledFields: ['pin'] }, 'card', orderStore(SWAPPED));

  await h.host.handle('reassemble', `pin|${CODE}`);
  await h.host.handle('copyReading', `pin|a|${CODE}`);

  const message = h.posted[0] as Record<string, unknown>;
  assert.deepEqual(h.copied, [(message.first as string[]).join('')], 'the clipboard is the row on screen');
  assert.deepEqual(h.copied, ['9137'], 'which under this order is not the arithmetic’s first reading');
});

test('the order is stable across two Shows, and drawn again once the store is cleared', async () => {
  // Pressing Show twice must not swap the rows under somebody's hands; re-opening the entry may.
  const orders = new RowOrderStore(scriptedDraws(SWAPPED, AS_READ));
  const h = harness({ pin: WOVEN_PIN, shuffledFields: ['pin'] }, 'card', orders);

  // The SAME method twice: a second method would answer with a wrong-method reading, and this test
  // is about the ORDER, not the arithmetic. The scripted random's second draw is the other order, so
  // a redraw would be visible here rather than silently identical.
  await h.host.handle('reassemble', `pin|${CODE}`);
  await h.host.handle('reassemble', `pin|${CODE}`);
  const first = h.posted[0] as Record<string, unknown>;
  const again = h.posted[1] as Record<string, unknown>;
  assert.deepEqual(first.first, [...'9137'], 'drawn swapped');
  assert.deepEqual(again.first, [...'9137'], 'and still swapped on the second press');

  orders.clear();
  await h.host.handle('reassemble', `pin|${CODE}`);

  const third = h.posted[2] as Record<string, unknown>;
  assert.deepEqual(third.first, [...'4821'], 'a cleared store draws afresh — that is what re-opening does');
});

test('no message carries the order — the answer has the same shape either way', async () => {
  const asRead = harness({ pin: WOVEN_PIN, shuffledFields: ['pin'] }, 'card', orderStore(AS_READ));
  const swapped = harness({ pin: WOVEN_PIN, shuffledFields: ['pin'] }, 'card', orderStore(SWAPPED));

  await asRead.host.handle('reassemble', `pin|${CODE}`);
  await swapped.host.handle('reassemble', `pin|${CODE}`);

  const one = asRead.posted[0] as Record<string, unknown>;
  const two = swapped.posted[0] as Record<string, unknown>;
  // EXACT, not just the keys: every field except the two rows is identical under both orders. A
  // looser check passes for a host that leaks the order through a class, a caption, a count or a
  // number, and an inspector reading that would know which row is the person's without reading
  // either. So the payload is compared whole, with only `first` and `second` taken out.
  const withoutRows = (m: Record<string, unknown>): Record<string, unknown> => {
    const { first: _f, second: _s, woven: _w, ...rest } = m;
    return rest;
  };
  assert.deepEqual(withoutRows(one), withoutRows(two), 'everything but the rows is the same message');
  // The picture is excluded above because its TAGS follow the rows — so it is checked here instead,
  // and checked for the property that matters: the same tokens in the same places, tagged the other
  // way round. A picture whose texts differed between orders would be leaking through its content.
  const texts = (m: Record<string, unknown>): string[] =>
    (m.woven as { text: string }[]).map((t) => t.text);
  const sides = (m: Record<string, unknown>): string[] =>
    (m.woven as { side: string }[]).map((t) => t.side);
  assert.deepEqual(texts(one), texts(two), 'the stored value is painted identically either way');
  assert.deepEqual(
    sides(one),
    sides(two).map((side) => (side === 'first' ? 'second' : 'first')),
    'and the tags are the exact mirror, which is what following the rows means',
  );
  assert.notDeepEqual(one.first, two.first, 'and the rows really did come out the other way round');
  assert.deepEqual([one.first, one.second].sort(), [two.first, two.second].sort(), 'same pair, reordered');
  assert.ok(!/real|decoy|swap|flip|order/i.test(JSON.stringify([one, two])));
});

/**
 * The card's own version of the race the password host was fixed for.
 *
 * <p>A gated field asks before it answers, and that modal is the long await: the panel can render
 * another entry while it is on screen, which clears the store. An order read after the question
 * would be a fresh draw, and the clipboard would hold the row the person did not point at.</p>
 */
test('a Copy whose question is answered during a re-render still follows the order the rows showed', async () => {
  const copied: string[] = [];
  // Swapped first, as-read after the clear — so a redraw is visible rather than silently identical.
  const draws = [SWAPPED, AS_READ];
  let at = 0;
  const orders = new RowOrderStore(() => draws[Math.min(at++, draws.length - 1)] ?? 0);
  const fields: PaymentFields = { pin: WOVEN_PIN, shuffledFields: ['pin'] };
  const view = paymentCardFor('entity-1', 'card', fields, random);
  const host = new PaymentViewHost({
    view: () => view,
    record: () => Promise.resolve(fields),
    post: () => undefined,
    // The panel loads another entry WHILE the question is on screen, which is what the shared
    // preview tab does on the next single click.
    confirm: () => {
      orders.clear();
      return Promise.resolve(true);
    },
    orders,
    copy: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
  });

  // The rows were SHOWN first — that is what puts an order in the store for the copy to follow.
  // Drawn directly here rather than through a Show, because a Show also grants the field and the
  // copy would then never reach the question this test needs it to be interrupted by.
  orders.orderFor('entity-1', 'pin');

  await host.handle('copyReading', `pin|a|${CODE}`);

  assert.equal(copied.length, 1, 'the copy happened');
  assert.deepEqual(copied, ['9137'], 'the row that was shown, not the one a fresh draw would name');
  assert.equal(at, 1, 'and the clear did not cause a second draw for this copy');
});

/**
 * The picture that travels with a reading, and the one property it must have.
 *
 * <p>Every token of the stored value is tagged with the ROW it is in. Asserted by MEMBERSHIP per
 * row rather than by counting tags, under both orders: a count passes for a colouring that is
 * exactly backwards, which would paint column three as the negative of the rows above it.</p>
 */
for (const [name, order] of [['as-read', AS_READ], ['swapped', SWAPPED]] as const) {
  test(`a reading's picture agrees with its own rows — ${name}`, async () => {
    const h = harness({ pin: WOVEN_PIN, shuffledFields: ['pin'] }, 'card', orderStore(order));

    await h.host.handle('reassemble', `pin|${CODE}`);

    const message = h.posted[0] as Record<string, unknown>;
    const rows = { first: message.first as string[], second: message.second as string[] };
    const woven = message.woven as { text: string; side: 'first' | 'second' }[];
    assert.equal(woven.length, WOVEN_PIN.length, 'one painted token per stored character');
    for (const token of woven) {
      const claimed = token.side === 'first' ? rows.first : rows.second;
      assert.ok(claimed.includes(token.text), `${token.text} is painted as the ${token.side} row, which lacks it`);
    }
    assert.equal(message.methodName, 'Method 3', 'named as a person sees it, never as f3');
    assert.ok(!/real|decoy/i.test(JSON.stringify(message)), 'and it names neither row');
  });
}

test('a woven PHRASE paints its picture by the ROWS, not by the woven columns', async () => {
  // Horizontal is where a naive colouring disagrees with the rows for every record: each woven
  // column is half of each phrase, so the columns are not the rows.
  const real = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
  const second = ['zulu', 'yankee', 'xray', 'whiskey', 'victor', 'uniform'];
  const columns = phraseColumns(real, second, 'horizontal');
  const h = harness(
    { mixed: shuffleTokens(columns.first, columns.secondColumn, CODE), layout: 'horizontal', shuffledFields: ['mixed'] },
    'phrase',
    orderStore(SWAPPED),
  );

  await h.host.handle('reassemble', `mixed|${CODE}`);

  const message = h.posted[0] as Record<string, unknown>;
  const rows = { first: message.first as string[], second: message.second as string[] };
  const woven = message.woven as { text: string; side: 'first' | 'second' }[];
  assert.equal(woven.length, real.length + second.length, 'every woven word is painted');
  for (const token of woven) {
    const claimed = token.side === 'first' ? rows.first : rows.second;
    assert.ok(claimed.includes(token.text), `${token.text} is painted as the ${token.side} row, which lacks it`);
  }
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
  // ONE view object, returned every time: the host compares identity to tell whether the card that
  // asked is still the card on screen, and a harness minting a fresh one per call would look to it
  // exactly like the panel having re-rendered.
  const view = paymentCardFor('entity-1', 'card', { pin: WOVEN_PIN, shuffledFields: ['pin'] }, random);
  const host = new PaymentViewHost({
    view: () => view,
    record: () => Promise.resolve({ pin: WOVEN_PIN, shuffledFields: ['pin'] }),
    post: (message) => {
      posted.push(message);
      throw new Error('the webview is gone');
    },
    confirm: () => Promise.resolve(true),
    copy: () => Promise.resolve(),
    orders: orderStore(AS_READ),
  });

  await assert.rejects(() => host.handle('reassemble', `pin|${CODE}`));

  assert.equal(host.holding, 0, 'nothing is held for a reading that never arrived');
});

test('nothing is copied or shown for a card the panel has since replaced', async () => {
  // The gap the code review found on the panel's own copy path, on the four paths that never reach
  // it: a payment message is answered by this class and returns before the panel's guard. Both await
  // boundaries are covered — the record read, and the modal, which is the long one.
  const fields: PaymentFields = { pin: WOVEN_PIN, cvv: '737', shuffledFields: ['pin'] };
  const posted: unknown[] = [];
  const copied: string[] = [];
  const shown = paymentCardFor('entity-1', 'card', fields, random);
  const state = { view: shown };
  const host = new PaymentViewHost({
    view: () => state.view,
    record: () => Promise.resolve(fields),
    post: (message) => posted.push(message),
    // The panel re-renders for another entry WHILE the question is on screen — which is exactly
    // what the shared preview tab does on the next single click.
    confirm: () => {
      state.view = paymentCardFor('entity-2', 'card', fields, random);
      return Promise.resolve(true);
    },
    orders: orderStore(AS_READ),
    copy: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
  });

  await host.handle('copyReading', `pin|a|${CODE}`);
  await host.handle('reveal', 'cvv');

  assert.deepEqual(copied, [], 'the previous entry\'s PIN did not reach the clipboard');
  assert.deepEqual(posted, [], 'and its CVV was not sent to a card showing something else');
  assert.equal(host.holding, 0);
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
