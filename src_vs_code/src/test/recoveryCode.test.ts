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
