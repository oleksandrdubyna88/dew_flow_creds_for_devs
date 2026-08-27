import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NO_GENERATOR_OUTCOME,
  SECRET_KINDS,
  canGenerate,
  generatableKinds,
  generateSecret,
  isSecretKind,
} from '../secretKinds';

/**
 * Where the generators stop — which is a more useful thing to be precise about than where they
 * reach.
 *
 * <p>Levels 3 and 4 rest on a value being made HERE and never entering an agent's context. That
 * holds exactly as far as this module goes, and the moment it does not, an agent fills the gap —
 * at which point the value IS in its context. So the kinds this extension does not make are named
 * one at a time, with the reason, and each refusal is counted in the journal.</p>
 *
 * <p>The alternative — a generic "unknown kind" — would leave an agent unable to tell a typo from
 * a policy, and would leave the person with no way to see the shape of what is missing.</p>
 */

test('a password and a passphrase are made here, and are different from each other', () => {
  const password = generateSecret('password');
  const passphrase = generateSecret('passphrase');

  assert.ok(password.ok);
  assert.ok(passphrase.ok);
  assert.ok(password.ok && password.value.length > 8);
  assert.ok(passphrase.ok && passphrase.value.includes('-'), 'a passphrase is words, not characters');
});

test('two draws of the same kind are not the same value', () => {
  // The one property a generator cannot be wrong about quietly.
  const first = generateSecret('password');
  const second = generateSecret('password');

  assert.ok(first.ok && second.ok && first.value !== second.value);
});

test('a kind we know and do not make is refused WITH the reason', () => {
  for (const kind of ['x509', 'totp', 'rsa', 'ecdsa', 'ed25519']) {
    const drawn = generateSecret(kind);

    assert.equal(drawn.ok, false, kind);
    assert.equal(!drawn.ok && drawn.kind, kind, 'it is a kind we recognise, not a typo');
    assert.ok(!drawn.ok && drawn.message.length > 40, `${kind} must say why, not just no`);
  }
});

test('a keypair is NOT offered even though the extension can make one', () => {
  // `generateEd25519` exists, and rotating an SSH key still means installing the public half on
  // the far side — a different operation with a different failure mode. Promising it here and
  // half-doing it would be worse than saying no.
  const drawn = generateSecret('ed25519');

  assert.equal(drawn.ok, false);
  assert.ok(!drawn.ok && drawn.message.includes('public half'));
});

test('a word that is not a kind at all is a different refusal, and lists the vocabulary', () => {
  // A typo and a policy are different problems. An agent can act on the first immediately.
  const drawn = generateSecret('supersecret');

  assert.equal(drawn.ok, false);
  assert.equal(!drawn.ok && drawn.kind, undefined);
  assert.ok(!drawn.ok && drawn.message.includes('password'));
});

test('what can be generated is derived, not listed twice', () => {
  // A second list would agree with the first until somebody added a generator to one of them.
  assert.deepEqual(generatableKinds(), SECRET_KINDS.filter((kind) => canGenerate(kind)));
  assert.deepEqual(generatableKinds(), ['password', 'passphrase']);
});

test('the vocabulary check accepts every kind and nothing else', () => {
  for (const kind of SECRET_KINDS) {
    assert.equal(isSecretKind(kind), true, kind);
  }
  assert.equal(isSecretKind('sudo'), false);
  assert.equal(isSecretKind(''), false);
});

test('the audit word is one string, because a view greps for it', () => {
  // Two copies of a word a filter matches on is two until somebody edits one of them.
  assert.equal(NO_GENERATOR_OUTCOME, 'no generator');
});
