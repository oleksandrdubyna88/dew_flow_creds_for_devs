import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paymentCardFor, plainSeconds, revealSecond } from '../paymentViewMessages';
import { paymentCardMarkup } from '../paymentViewCard';
import type { SecondValues } from '../secondValues';
import { PaymentViewHost } from '../paymentViewHost';
import { RowOrderStore } from '../rowFlip';

/**
 * S6 — the rows a second value gets in the viewer.
 *
 * <p>Three guarantees, and the middle one is the reason this story exists at all: the gate a second
 * CVV asks is the gate a CVV asks, derived from the field rather than listed again. The other two are
 * this card's standing rules, applied to a new row — no value is written into the markup, and a WOVEN
 * field has no second row because it has no stored second value to show.</p>
 */

const HELD: SecondValues = { cvv2: '737', pin2: '4821', number2: '4242424242424242' };

function card(fields: Record<string, unknown>, seconds: SecondValues = HELD) {
  return paymentCardFor('e1', 'card', fields as never, () => 0.5, seconds);
}

test('the card draws a row per stored second value, and names each one in English', () => {
  const view = card({ number: '4111111111111111', cvv: '481', pin: '9137' });
  const html = paymentCardMarkup(view);

  assert.deepEqual([...view.seconds].sort(), ['cvv2', 'number2', 'pin2']);
  assert.match(html, /Second CVV/);
  assert.match(html, /Second PIN/);
  assert.match(html, /Second card number/);
  assert.ok(!html.includes('cvv2<'), 'the record key is never shown to a person');
});

test('no value reaches the markup — not a second value, not a length, not a first digit', () => {
  const html = paymentCardMarkup(card({ number: '4111111111111111', cvv: '481' }));

  for (const value of Object.values(HELD)) {
    assert.ok(!html.includes(value), `${value} is filled in by message, never written into the page`);
  }
});

test('a second CVV and a second PIN ask before they appear; the others do not', () => {
  const html = paymentCardMarkup(card({ number: '4111111111111111', cvv: '481', pin: '9137' }));
  const shows = [...html.matchAll(/data-field="(\w+2)" data-action="reveal"/g)].map((one) => one[1]);

  assert.deepEqual([...shows].sort(), ['cvv2', 'pin2'], 'derived from the field, not listed again');
});

test('an ungated second value is filled on load, and a gated one is not', () => {
  const view = card({ number: '4111111111111111', cvv: '481', pin: '9137' });

  assert.deepEqual(plainSeconds(HELD, view.seconds), { number2: '4242424242424242' });
});

test('a gated second value comes back only after the question, and only if this card shows it', () => {
  const view = card({ number: '4111111111111111', cvv: '481', pin: '9137' });

  assert.equal(revealSecond(HELD, view.seconds, 'cvv2'), '737');
  assert.equal(revealSecond(HELD, view.seconds, 'iban2'), undefined, 'a key this card does not show');
  assert.equal(revealSecond(HELD, view.seconds, 'number2'), undefined, 'and an ungated one is not revealed');
  assert.equal(revealSecond(HELD, view.seconds, 'nonsense'), undefined, 'nor is a name that is not a key');
});

test('the form decides which second values are its own — a card shows no second IBAN', () => {
  const view = card({ number: '4111111111111111' }, { cvv2: '737', iban2: 'DE02120300000000202051' });

  assert.deepEqual([...view.seconds], ['cvv2'], 'a card has no IBAN row to put one under');
});

test('a WOVEN field has no second row, because there is no stored second value to show', () => {
  // Not a filter: the save consumes the typed half into the woven string and stores nothing, so the
  // record simply has no key. The rule shows through as an absence rather than as a second rule the
  // viewer would have to keep in step.
  const view = card({ number: '4111111111111111', cvv: 'woven-value', shuffledFields: ['cvv'] }, {});

  assert.deepEqual([...view.seconds], []);
  assert.ok(!paymentCardMarkup(view).includes('secondValueRow'));
});

test('an entry with no second values draws exactly the card it drew before this feature', () => {
  const plain = paymentCardMarkup(card({ number: '4111111111111111', cvv: '481' }, {}));

  assert.ok(!plain.includes('secondValueRow'));
  assert.ok(plain.includes('id="pay_number"'), 'and still draws its own fields');
});

/** A host over the card above, with the second values held and every answer given by `answer`. */
function secondsHost(answer: boolean) {
  const asked: string[] = [];
  const posted: unknown[] = [];
  const view = card({ number: '4111111111111111', cvv: '481', pin: '9137' });
  const host = new PaymentViewHost({
    view: () => view,
    record: () => Promise.resolve({}),
    seconds: () => Promise.resolve(HELD),
    post: (message) => posted.push(message),
    confirm: (text: string) => {
      asked.push(text);
      return Promise.resolve(answer);
    },
    copy: () => Promise.resolve(),
    orders: new RowOrderStore(() => 0),
  });
  return { host, asked, posted };
}

/**
 * The gate a second value inherits, driven through the SHOW the panel routes to this host.
 *
 * <p>`gated` is private, so it is asked through `reveal`. A Copy of a second value asks nothing, like
 * every other Copy (#153) — that is pinned over the panel's own copy path in
 * `entityViewPanelWiring.test.ts`, because the per-field Copy never reaches this class.</p>
 */
test('showing a second CVV asks, in the words the first CVV uses; a second card number is never asked about', async () => {
  const { host, asked, posted } = secondsHost(true);

  await host.handle('reveal', 'number2');
  assert.deepEqual(asked, [], 'a second card number is not one of the two decisive values');

  await host.handle('reveal', 'cvv2');
  assert.equal(asked.length, 1, 'a second CVV asked');
  assert.match(asked[0] ?? '', /^Show the/, 'and asked in the Show words');
  assert.deepEqual(posted.at(-1), { type: 'paymentValues', entityId: 'e1', values: { cvv2: '737' } });
});

test('a declined Show of a second CVV shows nothing, and a suffix cannot slip past the question', async () => {
  const { host, asked, posted } = secondsHost(false);

  await host.handle('reveal', 'cvv2');
  await host.handle('reveal', 'cvv2|anything');

  assert.equal(asked.length, 2, 'the KEY is what is gated, never the suffix');
  assert.deepEqual(posted, [], 'and nothing was sent to the page');
});

