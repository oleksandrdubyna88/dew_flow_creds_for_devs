import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_PASSPHRASE_WORDS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  readSecretOptions,
  wanted,
} from '../mcpSecretOptions';
import { DEFAULT_PASSPHRASE, DEFAULT_PASSWORD, generatePassword } from '../secretGenerator';
import { generateSecret } from '../secretKinds';

/**
 * What an agent may say about a secret the window is going to make.
 *
 * <p>The dangerous one first. `generatePassword` answers with an EMPTY STRING when no character
 * class is selected — a vault would then hold "" as though it were a password, and the entry
 * would look exactly like a working one until somebody used it. Every other test here is about
 * a wasted round trip; this one is about a silent hole.</p>
 */

test('a password with no character sets is refused, not drawn', () => {
  // The proof that the refusal is needed, from the generator itself.
  const empty = generatePassword({ ...DEFAULT_PASSWORD, lower: false, upper: false, digits: false, symbols: false });
  assert.equal(empty.value, '', 'the generator answers with an empty secret, which is why this is refused above it');

  const read = readSecretOptions({
    secretKind: 'password',
    lower: false,
    upper: false,
    digits: false,
    symbols: false,
  });

  assert.equal(read.ok, false);
  assert.match(read.ok === false ? read.message : '', /at least one character set/);
});

test('an absent field means "as you normally would", never "off"', () => {
  // A request naming only a length must not silently lose the symbols.
  const read = readSecretOptions({ secretKind: 'password', length: 16 });

  assert.equal(read.ok, true);
  if (read.ok) {
    assert.equal(read.password.length, 16);
    assert.equal(read.password.symbols, DEFAULT_PASSWORD.symbols);
    assert.equal(read.password.digits, DEFAULT_PASSWORD.digits);
    assert.equal(read.passphrase.words, DEFAULT_PASSPHRASE.words);
  }
});

test('a length outside the range is refused with the range in the sentence', () => {
  for (const length of [0, 1, MIN_PASSWORD_LENGTH - 1, MAX_PASSWORD_LENGTH + 1, 100000]) {
    const read = readSecretOptions({ secretKind: 'password', length });
    assert.equal(read.ok, false, `${length} was accepted`);
    assert.match(read.ok === false ? read.message : '', /8–128 characters/);
  }
});

test('the ends of the range are IN it — a boundary refused is a boundary nobody can use', () => {
  assert.equal(readSecretOptions({ secretKind: 'password', length: MIN_PASSWORD_LENGTH }).ok, true);
  assert.equal(readSecretOptions({ secretKind: 'password', length: MAX_PASSWORD_LENGTH }).ok, true);
  assert.equal(readSecretOptions({ secretKind: 'passphrase', words: MAX_PASSPHRASE_WORDS }).ok, true);
});

test('numbers and booleans are accepted as strings, because that is what a model sends', () => {
  const read = readSecretOptions({ secretKind: 'password', length: '20', symbols: 'false', digits: 'true' });

  assert.equal(read.ok, true);
  if (read.ok) {
    assert.equal(read.password.length, 20);
    assert.equal(read.password.symbols, false);
    assert.equal(read.password.digits, true);
  }
});

test('a separator nobody offers is refused rather than quietly replaced', () => {
  // Substituting one would produce a passphrase that is not what was asked for, stored as if it
  // were — the same class of quiet wrongness as an empty password.
  assert.equal(readSecretOptions({ secretKind: 'passphrase', separator: '||' }).ok, false);
  for (const separator of ['-', '_', '.', ' ', '']) {
    assert.equal(readSecretOptions({ secretKind: 'passphrase', separator }).ok, true, separator);
  }
});

test('options without a secretKind are refused — they would have been ignored', () => {
  // Silently dropping them is how an agent believes it asked for a 12-character password and the
  // vault holds a 32-character one. Neither value is wrong; the belief is.
  const read = readSecretOptions({ length: 12 });

  assert.equal(read.ok, false);
  assert.match(read.ok === false ? read.message : '', /without `secretKind`/);
});

test('a request that asks for nothing is not an options request at all', () => {
  assert.equal(wanted({ name: 'x', kind: 'ssh' }), false);
  assert.equal(wanted({ name: 'x', length: 16 }), true);
  assert.equal(readSecretOptions({ name: 'x', kind: 'ssh' }).ok, true, 'the defaults still apply');
});

test('the consent modal is told what was asked for, and only when something was', () => {
  const plain = readSecretOptions({ secretKind: 'password' });
  assert.equal(plain.ok === true ? plain.said : 'x', '', 'reciting the defaults every time is how a prompt stops being read');

  const asked = readSecretOptions({ secretKind: 'password', length: 12, symbols: false, avoidAmbiguous: true });
  const said = asked.ok === true ? asked.said : '';
  assert.match(said, /12 characters/);
  assert.match(said, /a-z \+ A-Z \+ 0-9/);
  assert.doesNotMatch(said, /symbols/);
  assert.match(said, /no look-alike/);
});

test('a passphrase says its shape in words a person reads', () => {
  const read = readSecretOptions({ secretKind: 'passphrase', words: 4, separator: '_', capitalize: true });
  const said = read.ok === true ? read.said : '';

  assert.match(said, /4 words/);
  assert.match(said, /separated by "_"/);
  assert.match(said, /capitalised/);
});

test('the options actually reach the draw — the whole point of carrying them', () => {
  // Without this the module would be a well-tested opinion nobody applies.
  const read = readSecretOptions({ secretKind: 'password', length: 12, symbols: false, upper: false });
  assert.equal(read.ok, true);
  if (!read.ok) {
    return;
  }

  const drawn = generateSecret('password', { password: read.password, passphrase: read.passphrase });

  assert.equal(drawn.ok, true);
  const value = drawn.ok ? drawn.value : '';
  assert.equal(value.length, 12);
  assert.match(value, /^[a-z0-9]+$/, 'symbols and upper case were asked off and appeared anyway');
});

test('a passphrase draw honours the word count', () => {
  const read = readSecretOptions({ secretKind: 'passphrase', words: 4, separator: '-' });
  assert.equal(read.ok, true);
  if (!read.ok) {
    return;
  }

  const drawn = generateSecret('passphrase', { password: read.password, passphrase: read.passphrase });

  assert.equal(drawn.ok, true);
  assert.equal(valueOf(drawn).split('-').length, 4);
});

/** The drawn value, or empty when the draw was refused — asserted separately just above. */
function valueOf(outcome: ReturnType<typeof generateSecret>): string {
  return outcome.ok ? outcome.value : '';
}
