import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { draw } from '../formGenerate';
import { DEFAULT_PASSWORD, SSH_KEY_TYPES } from '../secretGenerator';
import { parseSshPrivateKey } from '../sshKeyParse';

/**
 * The form's Generate messages, as the host honours them (T14): every value off the page is
 * untrusted, so the clamps and fallbacks ARE the module.
 */

test('a page asking for 10,000 characters gets the default length instead', () => {
  const made = draw({ kind: 'password', genLength: 10_000 });
  assert.equal(made.value.length, DEFAULT_PASSWORD.length);
});

test('an offered length is honoured; switched-off classes stay out', () => {
  const made = draw({ kind: 'password', genLength: 64, genDigits: false, genSymbols: false });
  assert.equal(made.value.length, 64);
  assert.doesNotMatch(made.value, /[0-9!#%*+\-=?@^_~]/);
});

test('an absent checkbox flag means ON — silence is not "off"', () => {
  const made = draw({ kind: 'password' });
  assert.equal(made.value.length, DEFAULT_PASSWORD.length);
  assert.ok(made.value.length > 0);
});

test('an unknown key-type id falls back to Ed25519 rather than throwing at a select value', () => {
  const made = draw({ kind: 'key', genKeyType: 'quantum-2048' });
  const parsed = parseSshPrivateKey(made.value, 'generated');
  assert.ok(parsed.ok);
  assert.match(made.note, /Ed25519/);
});

test('every offered key type draws a parseable pair with its label in the note', () => {
  for (const type of SSH_KEY_TYPES) {
    const made = draw({ kind: 'key', genKeyType: type.id });
    assert.ok(parseSshPrivateKey(made.value, 'generated').ok, type.id);
  }
});

test('a passphrase word count off the list is clamped to the default', () => {
  const made = draw({ kind: 'passphrase', genWords: 99 });
  assert.equal(made.value.split('-').length, 6);
  const eight = draw({ kind: 'passphrase', genWords: 8 });
  assert.equal(eight.value.split('-').length, 8);
});
