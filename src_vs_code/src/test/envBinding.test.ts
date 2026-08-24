import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BINDABLE_FIELDS,
  defaultEnvName,
  isValidEnvName,
  staleEnvNames,
} from '../envBinding';

/**
 * Secret fields exported as terminal environment variables. The names travel with the
 * entity's metadata (they are not secrets); the VALUES are written only on this machine,
 * from this machine's own SecretStorage.
 */

test('the default name is derived from the entity name and the field', () => {
  // The requested shape verbatim: entity "git key", private key ->
  assert.equal(defaultEnvName('git key', 'privateKey'), 'ENV_GITKEY_PRIVATEKEY');
  assert.equal(defaultEnvName('git key', 'password'), 'ENV_GITKEY_PASSWORD');
  assert.equal(defaultEnvName('prod db', 'dbConnection'), 'ENV_PRODDB_DBCONNECTION');
  assert.equal(defaultEnvName('prod db', 'dbPassword'), 'ENV_PRODDB_DBPASSWORD');
  assert.equal(defaultEnvName('git key', 'publicKey'), 'ENV_GITKEY_PUBLICKEY');
});

test('an entity name is sanitized into something a shell accepts', () => {
  assert.equal(defaultEnvName('Cient secret 1', 'password'), 'ENV_CIENTSECRET1_PASSWORD');
  assert.equal(defaultEnvName('key — prod (frankfurt)', 'password'), 'ENV_KEYPRODFRANKFURT_PASSWORD');
  // A name that sanitizes to nothing still yields something usable.
  assert.equal(defaultEnvName('———', 'password'), 'ENV_ENTITY_PASSWORD');
});

test('validity is the shell rule: letter or underscore first, then word characters', () => {
  assert.equal(isValidEnvName('ENV_GITKEY_PRIVATEKEY'), true);
  assert.equal(isValidEnvName('_MY_KEY'), true);
  assert.equal(isValidEnvName('my_key2'), true);

  assert.equal(isValidEnvName('2KEY'), false);
  assert.equal(isValidEnvName('MY KEY'), false);
  assert.equal(isValidEnvName('MY-KEY'), false);
  assert.equal(isValidEnvName(''), false);
});

test('renaming or disabling a binding names the variable to delete', () => {
  // The collection outlives the binding: a variable the user renamed or switched off
  // stays set in every future terminal unless the save that changed it also deletes it.
  const before = { password: 'ENV_A_PASSWORD', privateKey: 'ENV_A_PRIVATEKEY' };

  assert.deepEqual(staleEnvNames(before, { password: 'ENV_A_PASSWORD' }), ['ENV_A_PRIVATEKEY']);
  assert.deepEqual(staleEnvNames(before, { password: 'RENAMED', privateKey: 'ENV_A_PRIVATEKEY' }), ['ENV_A_PASSWORD']);
  assert.deepEqual(staleEnvNames(before, before), []);
  assert.deepEqual(staleEnvNames(undefined, { password: 'X' }), []);
});

test('a rename to a name another field still uses deletes nothing', () => {
  // Deleting it would tear down the variable the OTHER field just wrote.
  const before = { password: 'SHARED' };
  const after = { password: 'ENV_NEW', privateKey: 'SHARED' };

  assert.deepEqual(staleEnvNames(before, after), []);
});

test('the bindable field list covers what the viewer masks', () => {
  assert.deepEqual(
    [...BINDABLE_FIELDS],
    ['password', 'privateKey', 'publicKey', 'dbConnection', 'dbPassword'],
  );
});
