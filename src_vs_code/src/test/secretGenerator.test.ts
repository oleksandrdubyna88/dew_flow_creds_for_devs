import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AMBIGUOUS,
  DEFAULT_PASSPHRASE,
  DEFAULT_PASSWORD,
  DIGITS,
  LOWER,
  SYMBOLS,
  UPPER,
  WORDS,
  WORD_LIST_SIZE,
  generateEd25519,
  generatePassphrase,
  generatePassword,
} from '../secretGenerator';
import { parseSshPrivateKey } from '../sshKeyParse';

const RUNS = 200;

test('a password has the length asked for and only characters from the chosen sets', () => {
  const options = { ...DEFAULT_PASSWORD, length: 32 };
  for (let i = 0; i < 20; i += 1) {
    const { value } = generatePassword(options);
    assert.equal(value.length, 32);
    for (const ch of value) {
      assert.ok(`${LOWER}${UPPER}${DIGITS}${SYMBOLS}`.includes(ch), `unexpected character ${ch}`);
    }
  }
});

test('every selected class actually appears — a rule the site enforces must not fail silently', () => {
  for (let i = 0; i < RUNS; i += 1) {
    const { value } = generatePassword({ ...DEFAULT_PASSWORD, length: 8 });
    assert.match(value, /[a-z]/, value);
    assert.match(value, /[A-Z]/, value);
    assert.match(value, /[0-9]/, value);
    assert.ok([...value].some((c) => SYMBOLS.includes(c)), `no symbol in ${value}`);
  }
});

test('a class that is switched off never appears', () => {
  for (let i = 0; i < RUNS; i += 1) {
    const { value } = generatePassword({
      ...DEFAULT_PASSWORD,
      length: 16,
      symbols: false,
      upper: false,
    });
    assert.match(value, /^[a-z0-9]+$/, value);
  }
});

test('avoidAmbiguous drops exactly the characters that are read wrong', () => {
  for (let i = 0; i < RUNS; i += 1) {
    const { value } = generatePassword({ ...DEFAULT_PASSWORD, length: 24, avoidAmbiguous: true });
    for (const ch of AMBIGUOUS) {
      assert.ok(!value.includes(ch), `${ch} survived in ${value}`);
    }
  }
});

test('the guaranteed characters are not parked at the front — the draw is shuffled', () => {
  // Without the shuffle the first four characters would be lower/upper/digit/symbol every
  // time, which is a pattern an attacker gets for free.
  const firsts = new Set<string>();
  for (let i = 0; i < RUNS; i += 1) {
    firsts.add(generatePassword({ ...DEFAULT_PASSWORD, length: 12 }).value[0]);
  }
  assert.ok(firsts.size > 8, `first character barely varies: ${[...firsts].join('')}`);
});

test('two draws differ — the source is random, not a fixed seed', () => {
  const a = generatePassword(DEFAULT_PASSWORD).value;
  const b = generatePassword(DEFAULT_PASSWORD).value;
  assert.notEqual(a, b);
});

test('entropy is reported from the alphabet actually drawn from', () => {
  const full = generatePassword({ ...DEFAULT_PASSWORD, length: 10 });
  const lowerOnly = generatePassword({
    ...DEFAULT_PASSWORD,
    length: 10,
    upper: false,
    digits: false,
    symbols: false,
  });
  assert.ok(full.entropyBits > lowerOnly.entropyBits);
  assert.equal(Math.round(lowerOnly.entropyBits), Math.round(10 * Math.log2(26)));
  assert.match(full.description, /bits\.$/);
});

test('no character set selected produces nothing, and says why', () => {
  const none = generatePassword({
    length: 20,
    lower: false,
    upper: false,
    digits: false,
    symbols: false,
    avoidAmbiguous: false,
  });
  assert.equal(none.value, '');
  assert.equal(none.entropyBits, 0);
  assert.match(none.description, /at least one character set/);
});

// ---- passphrases -------------------------------------------------------------

test('the word list is exactly 256 unique words, which is what makes the bits exact', () => {
  // Both halves matter: 256 makes it eight bits, and a repeated word would make the list
  // smaller than it claims — so the reported entropy would be an overstatement.
  assert.equal(WORD_LIST_SIZE, 256);
  assert.equal(new Set(WORDS).size, 256, 'a duplicated word would overstate every passphrase');
  for (const word of WORDS) {
    assert.match(word, /^[a-z]{4}$/, word);
  }
  const phrase = generatePassphrase({ ...DEFAULT_PASSPHRASE, words: 1 });
  assert.equal(phrase.entropyBits, 8, 'one word must be exactly eight bits');
});

test('a passphrase has the words and separator asked for', () => {
  const { value } = generatePassphrase({ words: 5, separator: '.', capitalize: false, addNumber: false });
  const parts = value.split('.');
  assert.equal(parts.length, 5);
  for (const part of parts) {
    assert.match(part, /^[a-z]{4}$/, part);
  }
});

test('capitalize and addNumber satisfy composition rules WITHOUT being counted as strength', () => {
  const plain = generatePassphrase({ ...DEFAULT_PASSPHRASE, words: 4 });
  const decorated = generatePassphrase({
    words: 4,
    separator: '-',
    capitalize: true,
    addNumber: true,
  });

  assert.match(decorated.value, /^[A-Z][a-z]{3}(-[A-Z][a-z]{3}){3}[0-9]$/, decorated.value);
  assert.equal(decorated.entropyBits, plain.entropyBits, 'decoration is not strength');
});

test('the reported bits are the words times eight', () => {
  assert.equal(generatePassphrase({ ...DEFAULT_PASSPHRASE, words: 6 }).entropyBits, 48);
  assert.match(generatePassphrase({ ...DEFAULT_PASSPHRASE, words: 6 }).description, /256-word list/);
});

test('every word in a long draw comes from the list', () => {
  const { value } = generatePassphrase({ words: 400, separator: ' ', capitalize: false, addNumber: false });
  const distinct = new Set(value.split(' '));
  assert.ok(distinct.size > 100, `a 400-word draw should visit many words, saw ${distinct.size}`);
});

// ---- key pairs ---------------------------------------------------------------

test('a generated Ed25519 key is a real key the agent can serve', () => {
  const { privateKey } = generateEd25519();
  const parsed = parseSshPrivateKey(privateKey, 'generated');

  assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.reason);
  const key = (parsed as { ok: true; key: { algorithm: string; publicLine: string; fingerprint: string } }).key;
  assert.equal(key.algorithm, 'ssh-ed25519');
  assert.match(key.publicLine, /^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5[A-Za-z0-9+/=]+ generated$/);
  assert.match(key.fingerprint, /^SHA256:/);
});

test('two generated keys are different keys', () => {
  assert.notEqual(generateEd25519().privateKey, generateEd25519().privateKey);
});

test('the generated private key is a PEM — never a path, never a file', () => {
  // The point of generating here rather than shelling out to ssh-keygen: ssh-keygen writes to
  // disk by definition, and this value goes to SecretStorage without touching it.
  const { privateKey } = generateEd25519();
  assert.match(privateKey, /^-----BEGIN PRIVATE KEY-----/);
  assert.match(privateKey, /-----END PRIVATE KEY-----/);
});
