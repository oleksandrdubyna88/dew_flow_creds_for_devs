import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NAME_REFUSAL, nameRefusal, substituteName, usesNameToken } from '../commandName';
import { ACCEPTED, REFUSED, REFUSED_MORE, TOKEN_ROWS } from './commandNameTable';

/**
 * `{name}` in a terminal command: the token, the allow-list, and the substitution (parent
 * `PLAN_terminal_folder_run.md` \u00a71). Pure \u2014 a name is refused rather than quoted, so what these tests hold
 * down is the one list of names that may become part of a shell line.
 */

const SUBSTITUTES = new Set(TOKEN_ROWS.slice(0, 9));

test('the_token_is_only_the_bare_name_in_braces', () => {
  for (const text of TOKEN_ROWS) {
    const used = SUBSTITUTES.has(text);
    assert.equal(usesNameToken(text), used, `usesNameToken(${JSON.stringify(text)})`);
    const filled = substituteName(text, 'N');
    if (used) {
      assert.ok(!filled.includes('{name}'), `${text} -> ${filled}`);
      assert.ok(filled.includes('N'), `${text} -> ${filled}`);
    } else {
      assert.equal(filled, text, `${text} must come back identical`);
    }
  }
  assert.equal(substituteName('user@{name}', 'N'), 'user@N');
  assert.equal(substituteName('{name}.{name}', 'N'), 'N.N');
  assert.equal(substituteName('{name}{name}', 'N'), 'NN');
  assert.equal(substituteName("'={name}'", 'N'), "'=N'");
  assert.equal(substituteName('{config} {name}', 'N'), '{config} N');
  assert.equal(substituteName('creds://me/{name}/password', 'N'), 'creds://me/N/password');
});

test('dollar_patterns_in_a_name_mean_nothing', () => {
  for (const name of ['$&', '$`', "$'"]) {
    assert.equal(substituteName('a {name} b', name), `a ${name} b`);
  }
});

test('a_name_is_never_scanned_again', () => {
  assert.equal(substituteName('{name} {name}', '{name}'), '{name} {name}');
});

test('usesNameToken_keeps_no_state', () => {
  // A `.test` on a `g` regex would answer true, false, ...: `lastIndex` stays between calls.
  assert.deepEqual([usesNameToken('{name}'), usesNameToken('{name}'), usesNameToken('x'), usesNameToken('{name}')], [true, true, false, true]);
});

test('every_accepted_name_passes', () => {
  for (const name of ACCEPTED) {
    assert.equal(nameRefusal(name), undefined, JSON.stringify(name));
  }
  assert.equal(ACCEPTED.length + REFUSED.length, 28);
});

test('every_other_name_is_refused', () => {
  for (const name of [...REFUSED, ...REFUSED_MORE]) {
    assert.equal(nameRefusal(name), NAME_REFUSAL, JSON.stringify(name));
  }
});

test('marks_only_after_a_letter', () => {
  for (const name of ['x\u0301', 'x\u0300\u0301']) {
    assert.equal(nameRefusal(name), undefined, JSON.stringify(name));
  }
  // A mark first, after a digit or after `_`, and a letter whose marks are not in NFC order.
  for (const name of ['\u0301x', '1\u0301', '_\u0301', 'x\u0301\u0323']) {
    assert.equal(nameRefusal(name), NAME_REFUSAL, JSON.stringify(name));
  }
});

test('the_refusal_says_why_and_how_to_keep_a_literal', () => {
  assert.ok(NAME_REFUSAL.includes('letters, digits'));
  assert.ok(NAME_REFUSAL.includes('shell syntax'));
  assert.ok(NAME_REFUSAL.includes("{na''me}"));
  assert.ok(!NAME_REFUSAL.includes('{ name }'), 'bash prints three words for { name }: it does not keep a literal');
});
