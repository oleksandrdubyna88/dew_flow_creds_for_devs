import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SECOND_KEYS,
  SECOND_LABELS,
  WEAVE_POINTS,
  firstKeyOf,
  isSecondKey,
  keepSecondKeys,
  parseSecondValues,
  pickSecondValues,
  secondKeyOf,
  serializeSecondValues,
} from '../secondValues';

/**
 * S3 — the second-values record on its own, before any storage is involved.
 *
 * <p>The shape is `entityFields.ts`'s and so are the guarantees, which is the whole argument for
 * one record rather than six secret kinds: parse what is there, pick by the KEY LIST rather than by
 * the incoming object, and serialize an empty record to `undefined` so storing nothing DELETES the
 * key instead of leaving `{}` behind for a reader to wonder about.</p>
 *
 * <p>The derivation is the other half. A hand-written second list is a list that drifts — the way
 * `SECRET_KINDS` and `ProfileSnapshot` drifted and deleted payment records — so the keys come from
 * the weave points by a template-literal type and the way back is a total table. Both directions are
 * asserted here, because the compiler's version of that promise disappears at runtime.</p>
 */

test('every weave point has a key, and every key names its weave point back', () => {
  assert.deepEqual(
    [...SECOND_KEYS],
    ['number2', 'cvv2', 'pin2', 'iban2', 'accountNumber2', 'password2'],
    'the six weave points, each with a 2 — derived, not typed out twice',
  );
  for (const point of WEAVE_POINTS) {
    assert.equal(firstKeyOf(secondKeyOf(point)), point, `${point} survives the round trip`);
  }
  // The way back is a table rather than `key.slice(0, -1)`, which works until a weave point ends in
  // a digit and is then wrong silently. Asserted as totality: no key answers undefined.
  assert.ok(SECOND_KEYS.every((key) => WEAVE_POINTS.includes(firstKeyOf(key))));
});

test('a person is never shown a record key — every key has a sentence of its own', () => {
  for (const key of SECOND_KEYS) {
    const label = SECOND_LABELS[key];
    assert.ok(label !== undefined && label.length > 0, `${key} has a label`);
    assert.ok(!label.includes('2'), `${label} reads as English, not as the key it came from`);
  }
});

test('a string that does not parse is no values, never a throw', () => {
  assert.deepEqual(parseSecondValues(undefined), {});
  assert.deepEqual(parseSecondValues(''), {});
  assert.deepEqual(parseSecondValues('not json at all'), {});
  assert.deepEqual(parseSecondValues('null'), {}, 'and neither is a JSON null');
  assert.deepEqual(parseSecondValues('"a string"'), {});
});

test('a key from a newer build — or a crafted one — does not enter the record', () => {
  // Walking the KEY LIST rather than the incoming object is what buys this, and it is the same
  // reason `pickPaymentFields` and `pickFields` are written that way.
  const picked = parseSecondValues(
    '{"password2":"kept","holder2":"a key this build has never heard of",'
      + '"password":"the FIRST value, which does not live in this record",'
      + '"__proto__":{"polluted":true}}',
  );

  assert.deepEqual(picked, { password2: 'kept' });
  // `JSON.parse` makes `__proto__` an OWN property, so a pick that spread its input would carry it.
  // This one assigns only the six keys it knows, and never that one.
  assert.equal(({} as Record<string, unknown>).polluted, undefined, 'and nothing was polluted');
  assert.equal(Object.getPrototypeOf(picked), Object.prototype);
});

test('a blank value is not a value — it is trimmed away rather than stored as emptiness', () => {
  assert.deepEqual(pickSecondValues({ password2: '   ', cvv2: '  481  ', pin2: 7 }), { cvv2: '481' });
});

test('an empty record serializes to undefined, which is what DELETES the key', () => {
  assert.equal(serializeSecondValues({}), undefined);
  assert.equal(serializeSecondValues(undefined), undefined);
  assert.equal(serializeSecondValues({ password2: '  ' }), undefined, 'and so does a record of blanks');
});

test('what is stored parses back to exactly what was given', () => {
  const values = { password2: 'the other one', cvv2: '481' };
  const raw = serializeSecondValues(values);

  assert.ok(raw !== undefined);
  assert.deepEqual(parseSecondValues(raw), values);
});

test('a card retyped as bank details does not go on holding a second CVV', () => {
  // The record's `clearForForm`: a value whose field is gone describes nothing, and is one more
  // secret sitting in a vault for no reason.
  const held = { number2: '4242424242424242', cvv2: '481', iban2: 'DE02120300000000202051' };

  assert.deepEqual(keepSecondKeys(held, ['iban2', 'accountNumber2']), { iban2: 'DE02120300000000202051' });
  assert.deepEqual(keepSecondKeys(held, []), {}, 'and keeping nothing keeps nothing');
});

test('isSecondKey answers for the list, not for the shape of the word', () => {
  assert.ok(isSecondKey('password2'));
  assert.ok(!isSecondKey('password'));
  assert.ok(!isSecondKey('holder2'), 'ending in a 2 is not what makes a key');
});
