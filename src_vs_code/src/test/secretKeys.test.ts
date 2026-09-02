import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attachmentSecretKey,
  configSecretKey,
  dbConnSecretKey,
  entitySecretKeys,
  fieldsSecretKey,
  historySecretKey,
  imageSecretKey,
  keyPart,
  notesSecretKey,
  orgEscrowShareSecretKey,
  paymentSecretKey,
  privateKeySecretKey,
  secretKey,
  signingKeySecretKey,
  totpSecretKey,
  vpnConfigSecretKey,
} from '../secretKeys';

/**
 * GOLDEN STRINGS. Every one of these is the literal key an installed build already wrote.
 *
 * <p>Accepted from the code review of S1.2, twice and by both reviewers, and it is the finding that
 * mattered most in that round. These builders were moved out of `storageManager.ts` because the size
 * ratchet forbade growing that file, and they were rewritten through a new `suffixed()` helper on the
 * way. Nothing checked that the STRINGS survived.</p>
 *
 * <p>The failure that would have followed is the worst available: a separator or an escaping order
 * changed by one character, build green, typecheck green, every payment test green — and every secret
 * a person already had orphaned in the OS keychain, reported as simply missing. A refactor performed
 * for line count would have destroyed data it never mentioned.</p>
 *
 * <p>So these are hardcoded literals, deliberately NOT built from the same helper they check. A test
 * that composes its expectation the way the code does cannot fail; it agrees with itself. If a change
 * to `suffixed()` reddens this file, the change is wrong — the keys are a storage format, and the
 * only correct edit to a stored key is a migration.</p>
 */

const A = 'acct-7';
const E = 'ent-42';

test('every per-entity key is byte for byte what it was before the extraction', () => {
  assert.equal(secretKey(A, E), 'acct-7_ent-42');
  assert.equal(privateKeySecretKey(A, E), 'acct-7_ent-42:sshPrivateKey');
  assert.equal(vpnConfigSecretKey(A, E), 'acct-7_ent-42:vpnConfig');
  assert.equal(notesSecretKey(A, E), 'acct-7_ent-42:notes');
  assert.equal(fieldsSecretKey(A, E), 'acct-7_ent-42:fields');
  assert.equal(configSecretKey(A, E), 'acct-7_ent-42:config');
  assert.equal(paymentSecretKey(A, E), 'acct-7_ent-42:payment');
  assert.equal(historySecretKey(A, E), 'acct-7_ent-42:history');
  assert.equal(attachmentSecretKey(A, E), 'acct-7_ent-42:attachment');
  assert.equal(imageSecretKey(A, E), 'acct-7_ent-42:image');
  assert.equal(dbConnSecretKey(A, E), 'acct-7_ent-42:dbConn');
  assert.equal(totpSecretKey(A, E), 'acct-7_ent-42:totp');
});

test('the two account-scoped keys are unchanged, and carry no entity part', () => {
  assert.equal(signingKeySecretKey(A), 'acct-7:shareSigningKey');
  assert.equal(orgEscrowShareSecretKey(A), 'acct-7:orgEscrowShare');
});

test('the escape is unchanged for every character it exists for, and in the same order', () => {
  // `%` FIRST, or an id literally named `x%3AsshPrivateKey` encodes onto the same key as one named
  // `x:sshPrivateKey` — trading one collision for another. The order is part of the format.
  assert.equal(keyPart('plain'), 'plain');
  assert.equal(keyPart('a:b'), 'a%3Ab');
  assert.equal(keyPart('a_b'), 'a%5Fb');
  assert.equal(keyPart('a%b'), 'a%25b');
  assert.equal(keyPart('a%3Ab'), 'a%253Ab', 'an already-encoded colon is encoded again, not decoded');
  assert.equal(keyPart('x:sshPrivateKey'), 'x%3AsshPrivateKey');
  assert.equal(keyPart('a%b:c_d'), 'a%25b%3Ac%5Fd', 'all three, one pass each, % first');
});

/**
 * Every per-entity builder, so a NEW one added without a golden string cannot slip through.
 *
 * <p>Accepted from the review, whose premise was inaccurate and whose fix was right anyway. The
 * premise: that the escape is new and so an id like `team:west` was previously stored unescaped.
 * It is not — `keyPart(entityId)` was applied inside every original builder at `fbdf6bb`
 * (`storageManager.ts:83` for the private key), and the extraction preserved it verbatim, which is
 * what the byte-for-byte test above proves.</p>
 *
 * <p>The real gap the fix closes is narrower and worth closing: the golden strings above use a clean
 * `ent-42`, so a builder written LATER that composed its key by hand — bypassing `suffixed()` and
 * therefore `keyPart` — would pass them. Driving the list here means every builder is exercised with
 * an id carrying all three reserved characters, and a bypass shows up as an unescaped separator.</p>
 */
const PER_ENTITY_BUILDERS: ReadonlyArray<[string, (a: string, e: string) => string]> = [
  ['password', secretKey],
  ['sshPrivateKey', privateKeySecretKey],
  ['vpnConfig', vpnConfigSecretKey],
  ['notes', notesSecretKey],
  ['fields', fieldsSecretKey],
  ['config', configSecretKey],
  ['payment', paymentSecretKey],
  ['history', historySecretKey],
  ['attachment', attachmentSecretKey],
  ['image', imageSecretKey],
  ['dbConn', dbConnSecretKey],
  ['totp', totpSecretKey],
];

test('every per-entity builder escapes an id carrying all three reserved characters', () => {
  const hostile = 'a%b:c_d';
  const escaped = 'a%25b%3Ac%5Fd';
  for (const [name, build] of PER_ENTITY_BUILDERS) {
    const key = build('acct-7', hostile);
    assert.ok(
      key.startsWith(`acct-7_${escaped}`),
      `${name} did not escape the id — got ${key}. A builder that composes its key by hand bypasses keyPart.`,
    );
    assert.ok(!key.includes(':c_d'), `${name} left a raw separator in the id part: ${key}`);
  }
});

test('the builder list is complete, so a new kind cannot be added without a golden string', () => {
  // Twelve per-entity builders plus the two account-scoped ones. A thirteenth added to secretKeys.ts
  // without a row here leaves the count wrong, which is the cheapest available reminder.
  assert.equal(PER_ENTITY_BUILDERS.length, 12);
  const suffixes = PER_ENTITY_BUILDERS.map(([name]) => name);
  assert.equal(new Set(suffixes).size, suffixes.length, 'two builders claiming one suffix collide');
});

test('a uuid passes through untouched — which is why no key already written changed', () => {
  const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
  assert.equal(keyPart(uuid), uuid);
  assert.equal(privateKeySecretKey(A, uuid), `acct-7_${uuid}:sshPrivateKey`);
});

test('the exploit the escape exists for stays closed', () => {
  // An entity whose id is `x:sshPrivateKey` once produced exactly the key holding entity `x`'s
  // PRIVATE KEY: saving the crafted entity's password destroyed a real key, and reading that key
  // back returned the attacker's password, with no error anywhere.
  const crafted = secretKey(A, 'x:sshPrivateKey');
  const real = privateKeySecretKey(A, 'x');
  assert.notEqual(crafted, real, 'the crafted password key must not be the real private-key key');
  assert.equal(crafted, 'acct-7_x%3AsshPrivateKey');
  assert.equal(real, 'acct-7_x:sshPrivateKey');
});

test('no two kinds share a key for the same entity', () => {
  const keys = [
    secretKey(A, E),
    privateKeySecretKey(A, E),
    vpnConfigSecretKey(A, E),
    notesSecretKey(A, E),
    fieldsSecretKey(A, E),
    configSecretKey(A, E),
    paymentSecretKey(A, E),
    historySecretKey(A, E),
    attachmentSecretKey(A, E),
    imageSecretKey(A, E),
    dbConnSecretKey(A, E),
    totpSecretKey(A, E),
  ];
  assert.equal(new Set(keys).size, keys.length, 'two kinds on one key means one overwrites the other');
});

test('two accounts and two entities never collide', () => {
  assert.notEqual(paymentSecretKey('a', 'b_c'), paymentSecretKey('a_b', 'c'));
  assert.notEqual(paymentSecretKey('a', 'b'), paymentSecretKey('b', 'a'));
});

test('entitySecretKeys still names every key it did before it moved modules', () => {
  // The one risk in moving it out of `storageManager.ts`: a key dropped from the list is a secret
  // that survives its entry's deletion FOREVER, in the OS keychain, where nothing will look for it
  // again. That is the failure the list was extracted to prevent in the first place.
  //
  // Hardcoded literals rather than composed from the builders, for the same reason the golden strings
  // above are: a test that builds its expectation the way the code does agrees with itself.
  assert.deepEqual(
    [...entitySecretKeys('acct-7', 'ent-42')].sort(),
    [
      'acct-7_ent-42',
      'acct-7_ent-42:attachment',
      'acct-7_ent-42:config',
      'acct-7_ent-42:dbConn',
      'acct-7_ent-42:fields',
      'acct-7_ent-42:history',
      'acct-7_ent-42:image',
      'acct-7_ent-42:notes',
      'acct-7_ent-42:payment',
      'acct-7_ent-42:sshPrivateKey',
      'acct-7_ent-42:totp',
      'acct-7_ent-42:vpnConfig',
    ],
    'twelve keys — eleven secret kinds plus the revision history, because past versions are secrets',
  );
});

test('every per-entity builder is in the owned-keys list', () => {
  // The list and the builders must not part company: a twelfth kind added as a builder but not to
  // ENTITY_KEY_BUILDERS is a secret nothing deletes.
  const owned = new Set(entitySecretKeys('acct-7', 'ent-42'));
  for (const [name, build] of PER_ENTITY_BUILDERS) {
    assert.ok(
      owned.has(build('acct-7', 'ent-42')),
      `${name} builds a key that entitySecretKeys does not own — it would survive deletion`,
    );
  }
  assert.equal(owned.size, PER_ENTITY_BUILDERS.length, 'and nothing is owned that no builder makes');
});
