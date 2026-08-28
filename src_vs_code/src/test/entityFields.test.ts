import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFields, pickFields, serializeFields } from '../entityFields';

test('a record round-trips through its JSON; unknown keys and blanks are dropped', () => {
  const raw = serializeFields({ login: ' me@corp.com ', url: 'https://x' });
  assert.equal(raw, JSON.stringify({ login: 'me@corp.com', url: 'https://x' }));
  assert.deepEqual(parseFields(raw), { login: 'me@corp.com', url: 'https://x' });
  assert.deepEqual(pickFields({ login: 'a', url: '', extra: 'no' }), { login: 'a' });
});

test('nothing to store means nothing stored — an empty record serializes to undefined', () => {
  assert.equal(serializeFields({}), undefined);
  assert.equal(serializeFields({ login: '   ' }), undefined);
  assert.equal(serializeFields(undefined), undefined);
});

test('what does not parse is no fields, never a crash', () => {
  assert.deepEqual(parseFields('{not json'), {});
  assert.deepEqual(parseFields('"a string"'), {});
  assert.deepEqual(parseFields(undefined), {});
  assert.deepEqual(parseFields(''), {});
});
