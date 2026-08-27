import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alignmentCoordinates, decodeMatrix } from '../qrDecode';
import { QR_CORPUS, matrixOf } from './qrCorpus';

/**
 * The matrix half of the reader: everything that happens once the modules are known — the format
 * code, the mask, the codeword order, the error-correction block layout and Reed–Solomon.
 *
 * <p>The corpus these run against was encoded by a third party; see the note in `qrCorpus.ts` for
 * why that is the only kind of fixture worth having here.</p>
 */

test('every payload in the corpus decodes from its own matrix', () => {
  for (const fixture of QR_CORPUS) {
    const result = decodeMatrix(matrixOf(fixture));
    if (!result.ok) {
      assert.fail(`${fixture.name} (v${fixture.version}${fixture.ec}): ${result.reason}`);
    }
    assert.equal(result.text, fixture.text, fixture.name);
  }
});

test('the corpus itself still spans the versions, levels and modes it was built for', () => {
  assert.ok(QR_CORPUS.length >= 40, 'the corpus should not quietly shrink');
  const versions = new Set(QR_CORPUS.map((fixture) => fixture.version));
  assert.ok(Math.min(...versions) <= 2, 'a smallest-symbol case');
  assert.ok(Math.max(...versions) >= 18, 'a symbol big enough to need many error-correction blocks');
  assert.deepEqual(new Set(QR_CORPUS.map((fixture) => fixture.ec)), new Set(['L', 'M', 'Q', 'H']));
  const kinds = ['otpauth://', 'otpauth-migration://', 'WIFI:', 'BEGIN:VCARD', 'MECARD:', 'geo:', 'tel:'];
  for (const kind of kinds) {
    assert.ok(
      QR_CORPUS.some((fixture) => fixture.text.startsWith(kind)),
      `the corpus lost its ${kind} case`,
    );
  }
});

test('alignment pattern coordinates match the standard table', () => {
  assert.deepEqual(alignmentCoordinates(1), []);
  assert.deepEqual(alignmentCoordinates(2), [6, 18]);
  assert.deepEqual(alignmentCoordinates(7), [6, 22, 38]);
  // Version 32 is the one row the spacing formula does not produce; the standard prints it.
  assert.deepEqual(alignmentCoordinates(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(alignmentCoordinates(40), [6, 30, 58, 86, 114, 142, 170]);
});

// eslint-disable-next-line complexity -- a loop that damages or draws a picture, then asserts on it
test('damage inside what the level can carry is repaired', () => {
  const fixture = QR_CORPUS.find((entry) => entry.name === 'otpauth github');
  assert.ok(fixture !== undefined);
  const matrix = matrixOf(fixture);
  // Twelve modules in the lower right, which is data in every version.
  let broken = 0;
  for (let row = matrix.length - 1; row > matrix.length - 5 && broken < 12; row--) {
    for (let column = matrix.length - 1; column > matrix.length - 5 && broken < 12; column--) {
      matrix[row][column] = !matrix[row][column];
      broken++;
    }
  }
  const result = decodeMatrix(matrix);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.text, fixture.text);
});

// eslint-disable-next-line complexity -- a loop that damages or draws a picture, then asserts on it
test('damage past the limit is refused, never guessed', () => {
  const fixture = QR_CORPUS.find((entry) => entry.name === 'otpauth github');
  assert.ok(fixture !== undefined);
  // The guarantee is not "it repairs a lot" — it is that it never invents a payload. A wrong
  // seed stored silently is the one outcome this feature must not have, so every damage level
  // must end in the true text or in a refusal, and nothing else.
  for (let damage = 4; damage <= 260; damage += 8) {
    const matrix = matrixOf(fixture);
    let broken = 0;
    for (let row = 9; row < matrix.length && broken < damage; row++) {
      for (let column = 9; column < matrix.length && broken < damage; column++) {
        matrix[row][column] = !matrix[row][column];
        broken++;
      }
    }
    const result = decodeMatrix(matrix);
    if (result.ok) {
      assert.equal(result.text, fixture.text, `invented a payload after ${damage} broken modules`);
    }
  }
});

test('what is not a QR symbol is refused with a reason', () => {
  const ragged = [[true, false], [true]];
  const notSquare = Array.from({ length: 21 }, () => new Array<boolean>(22).fill(false));
  const wrongSize = Array.from({ length: 22 }, () => new Array<boolean>(22).fill(false));
  const empty = Array.from({ length: 25 }, () => new Array<boolean>(25).fill(false));
  for (const matrix of [ragged, notSquare, wrongSize, empty]) {
    const result = decodeMatrix(matrix);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.reason.length > 0);
  }
});

test('a Japanese payload with no ECI header comes back as Japanese', () => {
  // The format was designed in Japan and a great many symbols carry Shift-JIS bytes with nothing
  // to announce it. Read as UTF-8 they are replacement characters — which is a decode that
  // "succeeds" and is wrong, the worst kind.
  const fixture = QR_CORPUS.find((entry) => entry.name.includes('shift-jis'));
  assert.ok(fixture !== undefined);
  const result = decodeMatrix(matrixOf(fixture));
  assert.equal(result.ok && result.text, 'コーヒー無料クーポン');
  assert.ok(!(result.ok && result.text.includes('�')), 'no replacement characters');
});
