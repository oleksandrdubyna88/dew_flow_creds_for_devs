import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeRecoveryCodeInput,
  generateRecoveryCode,
  isRecoveryCodeError,
  parseRecoveryCode,
} from '../recoveryCode';

/**
 * The printed recovery code's own guarantees, before any wrap crypto touches it:
 * the shape a person reads from paper, the tolerance for how humans type, and the
 * checksum that turns "wrong" into "look at character 12 again".
 */

test('a generated code has the printed shape and exactly 150 bits', () => {
  const code = generateRecoveryCode();
  assert.match(
    code.formatted,
    /^RC1(-[0-9A-HJKMNP-TV-Z]{5}){6}-[0-9A-HJKMNP-TV-Z]{4}$/,
    'RC1 + six groups of five + four checksum symbols, Crockford alphabet only',
  );
  assert.equal(code.entropyBits, 150, 'reported exactly, never rounded up to flatter');
  assert.equal(code.secret.length, 30, 'the HKDF input is the bare core, no dashes');
});

test('generate → parse round-trips to the same secret', () => {
  const code = generateRecoveryCode();
  const parsed = parseRecoveryCode(code.formatted);
  assert.ok(!isRecoveryCodeError(parsed));
  assert.deepEqual(parsed.secret, code.secret);
});

test('two generations differ — the code is drawn, not derived', () => {
  assert.notEqual(generateRecoveryCode().formatted, generateRecoveryCode().formatted);
});

test('case, spaces and dashes do not matter — paper is read back loosely', () => {
  const code = generateRecoveryCode();
  const sloppy = code.formatted.toLowerCase().replace(/-/g, ' ');
  const parsed = parseRecoveryCode(`  ${sloppy}  `);
  assert.ok(!isRecoveryCodeError(parsed));
  assert.deepEqual(parsed.secret, code.secret);
});

test('the Crockford confusables map back: O reads as 0, I and L as 1', () => {
  // Draw until the core actually contains a 0 and a 1, so the mapping is exercised
  // rather than vacuously true.
  let code = generateRecoveryCode();
  while (!code.formatted.includes('0') || !code.formatted.includes('1')) {
    code = generateRecoveryCode();
  }
  const confused = code.formatted.replace(/0/g, 'O').replace(/1/g, 'l');
  const parsed = parseRecoveryCode(confused);
  assert.ok(!isRecoveryCodeError(parsed), 'a confusable is a reading, not a typo');
  assert.deepEqual(parsed.secret, code.secret);
});

test('a single mistyped character is caught by the checksum, locally', () => {
  const code = generateRecoveryCode();
  // Flip one core character to a different alphabet symbol.
  const at = 'RC1-'.length + 2;
  const original = code.formatted[at];
  const flipped = original === 'A' ? 'B' : 'A';
  const typo = code.formatted.slice(0, at) + flipped + code.formatted.slice(at + 1);
  assert.equal(parseRecoveryCode(typo), 'bad-checksum');
});

test('garbage is bad-format, not a checksum complaint', () => {
  assert.equal(parseRecoveryCode(''), 'bad-format');
  assert.equal(parseRecoveryCode('not a code'), 'bad-format');
  assert.equal(parseRecoveryCode('RC1-SHORT'), 'bad-format');
  // The right length but a symbol outside the alphabet (U is excluded by Crockford).
  const code = generateRecoveryCode();
  assert.equal(parseRecoveryCode(code.formatted.replace(/^RC1-./, 'RC1-U')), 'bad-format');
});

test('the input-box text distinguishes "incomplete" from "mistyped"', () => {
  const code = generateRecoveryCode();
  assert.equal(describeRecoveryCodeInput(code.formatted), undefined);
  assert.match(describeRecoveryCodeInput('RC1-ABC') ?? '', /Not a complete/);
  const at = 'RC1-'.length;
  const flipped = code.formatted[at] === 'A' ? 'B' : 'A';
  const typo = code.formatted.slice(0, at) + flipped + code.formatted.slice(at + 1);
  assert.match(describeRecoveryCodeInput(typo) ?? '', /mistyped/);
});

/**
 * The shared vectors — the same file the C# suite reads.
 *
 * <p>`RC1` lives here and `BK1` lives in the server, and they are one construction: the same alphabet,
 * the same grouping, the same checksum shape with its own domain string. Two implementations of one
 * construction drift, and the drift would be a code that will not type a year from now — so
 * `contract/printable-key-v1.json` holds the cases and BOTH suites assert them. A vector this file
 * copied into itself would defeat the point: it would go green while the other side went red.</p>
 */
test('every RC1 vector in the shared contract parses to its own core', () => {
  const vectors = sharedVectors().filter((vector) => vector.prefix === 'RC1');
  assert.ok(vectors.length > 0, 'the contract file carries RC1 vectors');
  for (const vector of vectors) {
    const parsed = parseRecoveryCode(vector.formatted);
    assert.ok(typeof parsed === 'object' && 'secret' in parsed, `${vector.formatted} parses`);
    assert.equal((parsed as { secret: Buffer }).secret.toString('utf8'), vector.core);
  }
});

test('the shared contract agrees with this file about the alphabet and the confusables', () => {
  // The two things a reader of a code relies on, pinned where both languages can see them.
  const contract = sharedContract();
  assert.equal(contract.alphabet, '0123456789ABCDEFGHJKMNPQRSTVWXYZ');
  assert.deepEqual(contract.confusables, { O: '0', I: '1', L: '1' });
  assert.equal(contract.forms.RC1.checksumInfo, 'cred-ssh-manager/recovery-checksum:');
});

test('a vector with one character altered is refused as a CHECKSUM failure', () => {
  // The distinction is the feature, on this side as much as on the server's: "one character is wrong"
  // sends somebody back to the paper, "that is not a code" sends them looking for a different one.
  const vector = sharedVectors().find((v) => v.prefix === 'RC1');
  assert.ok(vector);
  const last = vector.formatted.slice(-1);
  const altered = vector.formatted.slice(0, -1) + (last === 'Z' ? 'Y' : 'Z');

  assert.equal(parseRecoveryCode(altered), 'bad-checksum');
});

interface SharedVector {
  prefix: string;
  core: string;
  checksum: string;
  formatted: string;
  derivedKeyHex?: string;
}

function sharedContract(): {
  alphabet: string;
  confusables: Record<string, string>;
  forms: Record<string, { checksumInfo: string }>;
  vectors: SharedVector[];
} {
  const path = require('node:path').join(__dirname, '..', '..', '..', 'contract', 'printable-key-v1.json');
  return JSON.parse(require('node:fs').readFileSync(path, 'utf8'));
}

function sharedVectors(): SharedVector[] {
  return sharedContract().vectors;
}
