import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AliasMap,
  MAX_ALIAS_LENGTH,
  aliasFor,
  danglingAliases,
  describeAliasProblem,
  isValidAlias,
  listAliases,
  resolveAlias,
  withAlias,
  withoutAlias,
} from '../cliAliases';

/**
 * The name registry. Most of these are about what an alias is NOT: it names an entry, it is
 * never a right to use one, and it never carries anything that could be replayed.
 */

const PROD: AliasMap = { 'prod-db': { accountId: 'a1', entityId: 'e1', kind: 'db' } };

test('an alias stores which entry, and nothing that could be used as a credential', () => {
  const map = withAlias({}, 'staging', { accountId: 'a1', entityId: 'e2', kind: 'ssh' });

  assert.deepEqual(Object.keys(map.staging).sort(), ['accountId', 'entityId', 'kind']);
  // Pinned as a type-level fact too: adding a `secret` here would have to change this test,
  // which is the point of asserting the exact key set rather than a subset.
  assert.equal(JSON.stringify(map).includes('secret'), false);
});

test('a name resolves to its entry, and an unknown one resolves to nothing', () => {
  assert.deepEqual(resolveAlias(PROD, 'prod-db'), { accountId: 'a1', entityId: 'e1', kind: 'db' });
  assert.equal(resolveAlias(PROD, 'nope'), undefined);
});

test('a name that is a property of every object still resolves to nothing', () => {
  // The name arrives from a command line, so an object-literal lookup would answer
  // `constructor` and `toString` with something that is not undefined.
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(resolveAlias(PROD, name), undefined, name);
  }
});

test('names are narrow, because they are typed on a command line', () => {
  for (const good of ['prod-db', 'a', 'srv_01', 'x9']) {
    assert.equal(isValidAlias(good), true, good);
  }
  for (const bad of [
    '',
    'Prod-DB',          // uppercase: two names differing by case invite a typo that works
    '-leading',
    'has space',
    'semi;colon',
    'dollar$sign',
    'star*',
    'slash/path',
    'quote"',
    "tick'",
    'pipe|',
    'back`tick',
    '../escape',
    'null\0byte',
  ]) {
    assert.equal(isValidAlias(bad), false, JSON.stringify(bad));
  }
});

test('a name longer than the cap is refused', () => {
  assert.equal(isValidAlias('a'.repeat(MAX_ALIAS_LENGTH)), true);
  assert.equal(isValidAlias('a'.repeat(MAX_ALIAS_LENGTH + 1)), false);
});

test('a refusal says what to do about it, not just that it failed', () => {
  assert.match(describeAliasProblem('') ?? '', /required/i);
  assert.match(describeAliasProblem('a'.repeat(99)) ?? '', /40/);
  assert.match(describeAliasProblem('Bad Name') ?? '', /lowercase/i);
  assert.equal(describeAliasProblem('prod-db'), undefined);
});

test('re-pointing an existing name is allowed, because that is how an alias moves', () => {
  const moved = withAlias(PROD, 'prod-db', { accountId: 'a1', entityId: 'e9', kind: 'ssh' });

  assert.equal(moved['prod-db'].entityId, 'e9');
  assert.equal(Object.keys(moved).length, 1, 'it moved rather than duplicating');
});

test('the map is never mutated in place', () => {
  const before = JSON.stringify(PROD);
  withAlias(PROD, 'other', { accountId: 'a2', entityId: 'e3', kind: 'ssh' });
  withoutAlias(PROD, 'prod-db');

  assert.equal(JSON.stringify(PROD), before);
});

test('an entry knows its own alias, so the command can offer to remove it', () => {
  assert.equal(aliasFor(PROD, 'a1', 'e1'), 'prod-db');
  assert.equal(aliasFor(PROD, 'a1', 'other'), undefined);
  assert.equal(aliasFor(PROD, 'a2', 'e1'), undefined, 'a different profile is a different entry');
});

test('an alias whose entry is gone is dangling, so ls never lists something that cannot work', () => {
  const map = withAlias(PROD, 'deleted', { accountId: 'a1', entityId: 'gone', kind: 'ssh' });

  assert.deepEqual(danglingAliases(map, (a) => a.entityId !== 'gone'), ['deleted']);
});

test('the listing is sorted, so two runs of ls agree', () => {
  const map = withAlias(withAlias({}, 'zeta', { accountId: 'a', entityId: '1', kind: 'ssh' }), 'alpha', {
    accountId: 'a',
    entityId: '2',
    kind: 'db',
  });

  assert.deepEqual(listAliases(map), [
    { name: 'alpha', kind: 'db' },
    { name: 'zeta', kind: 'ssh' },
  ]);
});
