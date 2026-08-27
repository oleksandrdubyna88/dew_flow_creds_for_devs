import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONFIG_KEY_PREFIX,
  configKeyHash,
  configKeyMatches,
  describeConfigKey,
  findConfigKeyHolder,
  isConfigKeyShape,
  newConfigKey,
} from '../configKey';

/**
 * The key an application holds to read one config.
 *
 * <p>Not a grant token, and the difference is its whole reason for existing: grants die with the
 * window and carry that window's TCP port in their text, while this is pasted into a `Program.cs`
 * or an `.env` and has to still work in a year.</p>
 */

test('a fresh key is prefixed, long, and never the same twice', () => {
  const a = newConfigKey();
  const b = newConfigKey();

  assert.ok(a.startsWith(CONFIG_KEY_PREFIX));
  assert.notEqual(a, b);
  assert.ok(a.length > 40, `too short to be 256 bits: ${a.length}`);
});

test('a key says what it is, so pasting the wrong secret is answered rather than guessed', () => {
  assert.equal(isConfigKeyShape(newConfigKey()), true);
  assert.equal(isConfigKeyShape('54720.g7S3ifzDinTLO_W0KWn'), false, 'a grant token is not one');
  assert.equal(isConfigKeyShape('hunter2'), false);
  assert.equal(isConfigKeyShape(''), false);
  assert.equal(isConfigKeyShape(CONFIG_KEY_PREFIX), false, 'the prefix alone is not a key');
  assert.equal(isConfigKeyShape(`${CONFIG_KEY_PREFIX}short`), false);
});

test('the vault stores a hash, and the hash is not the key', () => {
  const key = newConfigKey();
  const hash = configKeyHash(key);

  assert.notEqual(hash, key);
  assert.equal(hash.includes(key.slice(CONFIG_KEY_PREFIX.length)), false, 'the key is IN the hash');
  assert.equal(configKeyHash(key), hash, 'the same key hashes the same way twice');
});

test('a key matches its own hash and nothing else', () => {
  const key = newConfigKey();
  const other = newConfigKey();

  assert.equal(configKeyMatches(key, configKeyHash(key)), true);
  assert.equal(configKeyMatches(other, configKeyHash(key)), false);
});

test('a malformed key is refused before anything is hashed', () => {
  const hash = configKeyHash(newConfigKey());

  assert.equal(configKeyMatches('hunter2', hash), false);
  assert.equal(configKeyMatches('', hash), false);
});

test('a stored hash of the wrong length cannot crash the comparison', () => {
  // The hash arrives from stored metadata, which comes back from sync, import and restore — so it
  // is untrusted input at the moment it is compared. `timingSafeEqual` THROWS on a length
  // mismatch rather than returning false, which would turn a corrupt record into a broken read
  // route instead of a refused key.
  const key = newConfigKey();

  assert.equal(configKeyMatches(key, 'dG9vLXNob3J0'), false);
  assert.equal(configKeyMatches(key, ''), false);
  assert.equal(configKeyMatches(key, 'not base64 at all !!!'), false);
});

test('the label identifies a key without reconstructing it', () => {
  const key = newConfigKey();
  const label = describeConfigKey(key);

  assert.ok(label.startsWith(CONFIG_KEY_PREFIX), 'the label must say which KIND of secret it is');
  assert.ok(label.endsWith('…'));
  assert.ok(label.length < 20, `too much of the key survives: ${label}`);
  assert.equal(key.startsWith(label.slice(0, -1)), true, 'the label is a real prefix of the key');
});

test('two different keys get two different labels, which is what makes revoking possible', () => {
  // A label that collided would leave somebody choosing which of two identical rows to revoke.
  const labels = new Set(Array.from({ length: 50 }, () => describeConfigKey(newConfigKey())));

  assert.equal(labels.size, 50);
});

test('a key finds the one entry it was minted for', () => {
  const wanted = newConfigKey();
  const other = newConfigKey();
  const holders = [
    { accountId: 'a', entityId: 'no-key' },
    { accountId: 'a', entityId: 'other', configKeyHash: configKeyHash(other) },
    { accountId: 'b', entityId: 'wanted', configKeyHash: configKeyHash(wanted) },
  ];

  assert.equal(findConfigKeyHolder(wanted, holders)?.entityId, 'wanted');
  assert.equal(findConfigKeyHolder(other, holders)?.entityId, 'other');
});

test('a key nobody minted opens nothing', () => {
  const holders = [{ accountId: 'a', entityId: 'x', configKeyHash: configKeyHash(newConfigKey()) }];

  assert.equal(findConfigKeyHolder(newConfigKey(), holders), undefined);
  assert.equal(findConfigKeyHolder('hunter2', holders), undefined);
});

test('an entry with no key is never reachable, whatever is presented', () => {
  // Off by default is the whole gate: a vault where nobody has opened anything to code answers
  // every key the same way, and there is nothing to get wrong per entry.
  const holders = [{ accountId: 'a', entityId: 'closed' }];

  assert.equal(findConfigKeyHolder(newConfigKey(), holders), undefined);
  assert.equal(findConfigKeyHolder('', holders), undefined);
});
