/**
 * Reading a QR symbol — the half that turns a module matrix back into the string it carries.
 *
 * <p><b>Why this exists at all.</b> A TOTP seed is one of the very few secrets a person cannot
 * type: Google Authenticator exports only as a picture, and the enrolment QR a service draws is
 * often the only place the base32 is shown. So the seed field has to accept an image, and an
 * image means a QR decoder. The extension ships <b>zero runtime dependencies</b> — a property
 * stated in the README and in `research/module_extension.md` — and the owner chose to keep it
 * rather than take `jsqr`. This file and {@link ./qrSample} are the cost of that decision, and
 * they are written to be paid once.</p>
 *
 * <p><b>What is hand-written and what is standard.</b> Everything here is ISO/IEC 18004: the
 * codeword count per version, the error-correction block structure, the eight mask functions,
 * the BCH format code and Reed–Solomon over GF(256). The tables are the risk — a single wrong
 * number decodes seven versions and fails the eighth — so the tests do not round-trip against
 * an encoder of mine, which would cancel such a bug out. They decode matrices produced by a
 * third-party encoder (`qrcode` on npm, at authoring time only, outside the repository).</p>
 *
 * <p>Pure and `vscode`-free by the repository's rule for testable logic: the webview obtains the
 * pixels, the host decodes them, and every step below is reachable from `node:test`.</p>
 */

/** What a decode attempt answers. A failure carries a reason a person can act on. */
export type QrDecodeResult = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: string };

/** A symbol as modules: `true` is dark. Row-major, always square. */
export type QrMatrix = readonly (readonly boolean[])[];

// ---- the standard's tables ---------------------------------------------------------------
// Verified against an independent implementation of the same standard before being written
// down; `qrDecode.test.ts` then decodes real symbols at versions 1, 5, 8, 9, 15 and 18 across
// all four levels, which is what actually keeps them honest.

/** Total codewords (data + error correction) per version, 1-indexed by `TOTAL_CODEWORDS[v - 1]`. */
const TOTAL_CODEWORDS = [
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034,
  3196, 3362, 3532, 3706,
];

/** Error-correction codewords per version, in level order L, M, Q, H. */
const EC_CODEWORDS = [
  [7, 10, 13, 17], [10, 16, 22, 28], [15, 26, 36, 44], [20, 36, 52, 64], [26, 48, 72, 88],
  [36, 64, 96, 112], [40, 72, 108, 130], [48, 88, 132, 156], [60, 110, 160, 192], [72, 130, 192, 224],
  [80, 150, 224, 264], [96, 176, 260, 308], [104, 198, 288, 352], [120, 216, 320, 384],
  [132, 240, 360, 432], [144, 280, 408, 480], [168, 308, 448, 532], [180, 338, 504, 588],
  [196, 364, 546, 650], [224, 416, 600, 700], [224, 442, 644, 750], [252, 476, 690, 816],
  [270, 504, 750, 900], [300, 560, 810, 960], [312, 588, 870, 1050], [336, 644, 952, 1110],
  [360, 700, 1020, 1200], [390, 728, 1050, 1260], [420, 784, 1140, 1350], [450, 812, 1200, 1440],
  [480, 868, 1290, 1530], [510, 924, 1350, 1620], [540, 980, 1440, 1710], [570, 1036, 1530, 1800],
  [570, 1064, 1590, 1890], [600, 1120, 1680, 1980], [630, 1204, 1770, 2100], [660, 1260, 1860, 2220],
  [720, 1316, 1950, 2310], [750, 1372, 2040, 2430],
];

/** Error-correction blocks per version, in level order L, M, Q, H. */
const EC_BLOCKS = [
  [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 2, 2], [1, 2, 2, 4], [1, 2, 4, 4], [2, 4, 4, 4], [2, 4, 6, 5],
  [2, 4, 6, 6], [2, 5, 8, 8], [4, 5, 8, 8], [4, 5, 8, 11], [4, 8, 10, 11], [4, 9, 12, 16],
  [4, 9, 16, 16], [6, 10, 12, 18], [6, 10, 17, 16], [6, 11, 16, 19], [6, 13, 18, 21],
  [7, 14, 21, 25], [8, 16, 20, 25], [8, 17, 23, 25], [9, 17, 23, 34], [9, 18, 25, 30],
  [10, 20, 27, 32], [12, 21, 29, 35], [12, 23, 34, 37], [12, 25, 34, 40], [13, 26, 35, 42],
  [14, 28, 38, 45], [15, 29, 40, 48], [16, 31, 43, 51], [17, 33, 45, 54], [18, 35, 48, 57],
  [19, 37, 51, 60], [19, 38, 53, 63], [20, 40, 56, 66], [21, 43, 59, 70], [22, 45, 62, 74],
  [24, 47, 65, 77], [25, 49, 68, 81],
];

/** The five bits a format code carries, by the level's own two-bit encoding: L=01, M=00, Q=11, H=10. */
const LEVEL_BY_FORMAT_BITS = [1, 0, 3, 2] as const; // index = L,M,Q,H → the bits that name it

/**
 * Where alignment patterns sit, by version.
 *
 * <p>The spec prints this as a table of forty rows; it is also a formula, and the formula is
 * shorter than the table and cannot be mistyped. Version 32 is the one row the formula misses,
 * which is why the standard's own table exists — so it is special-cased rather than smoothed
 * over.</p>
 */
export function alignmentCoordinates(version: number): number[] {
  if (version < 2) {
    return [];
  }
  const size = 17 + 4 * version;
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((size - 13) / (2 * count - 2)) * 2;
  const last = size - 7;
  const coords = [6];
  for (let i = count - 1; i >= 1; i--) {
    coords.push(last - (i - 1) * step);
  }
  return coords.sort((a, b) => a - b).filter((value, index, all) => all.indexOf(value) === index);
}

// ---- GF(256) and Reed–Solomon ------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function buildTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d; // the primitive polynomial QR uses
    }
  }
  for (let i = 255; i < 512; i++) {
    EXP[i] = EXP[i - 255];
  }
})();

const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
const inverse = (a: number): number => EXP[255 - LOG[a]];

// Polynomials are coefficient arrays, LOWEST power first, everywhere in this file. One
// convention, chosen because the syndrome vector is naturally indexed that way, and mixing the
// two orders is the classic way to write a Reed-Solomon decoder that works only on clean data.

function polyEval(poly: readonly number[], x: number): number {
  let value = 0;
  for (let i = poly.length - 1; i >= 0; i--) {
    value = mul(value, x) ^ poly[i];
  }
  return value;
}

function polyMul(a: readonly number[], b: readonly number[]): number[] {
  const product = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      product[i + j] ^= mul(a[i], b[j]);
    }
  }
  return product;
}

function polyAdd(a: readonly number[], b: readonly number[]): number[] {
  const sum = new Array<number>(Math.max(a.length, b.length)).fill(0);
  for (let i = 0; i < sum.length; i++) {
    sum[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return sum;
}

function polyScale(poly: readonly number[], factor: number): number[] {
  return poly.map((coefficient) => mul(coefficient, factor));
}

function degree(poly: readonly number[]): number {
  let last = -1;
  for (let i = 0; i < poly.length; i++) {
    if (poly[i] !== 0) {
      last = i;
    }
  }
  return last;
}

/**
 * Correct one block in place, or refuse it.
 *
 * <p>Syndromes → Berlekamp–Massey → Chien search → Forney. <b>Refusing matters as much as
 * correcting</b>: a block with more errors than its level can carry must come back as a failure,
 * never as plausible bytes, because what the caller does with those bytes is store a credential.
 * That is also why the recovered positions are counted against the locator's degree — a locator
 * whose roots do not all lie inside the block is a decode that went wrong quietly.</p>
 */
// eslint-disable-next-line complexity -- the Reed-Solomon repair in one place: syndromes, locator, roots, magnitudes, and the re-check that refuses a block it only rearranged
function correctBlock(block: number[], ecCount: number): boolean {
  // The block arrives highest-index-last; Reed-Solomon reads it as a polynomial whose lowest
  // power is the LAST codeword, so one reversal here keeps every step below in one order.
  const received = [...block].reverse();
  const syndromes: number[] = [];
  let damaged = false;
  for (let i = 0; i < ecCount; i++) {
    const value = polyEval(received, EXP[i]);
    syndromes.push(value);
    damaged = damaged || value !== 0;
  }
  if (!damaged) {
    return true;
  }
  const locator = errorLocator(syndromes, ecCount);
  if (locator === undefined) {
    return false;
  }
  const positions = chienSearch(locator, received.length);
  if (positions.length !== degree(locator)) {
    return false;
  }
  if (!applyForney(received, locator, syndromes, positions, ecCount)) {
    return false;
  }
  // A block whose syndromes are not all zero afterwards was not corrected — it was rearranged,
  // and rearranged bytes are exactly the failure mode that must not reach a stored secret.
  for (let i = 0; i < ecCount; i++) {
    if (polyEval(received, EXP[i]) !== 0) {
      return false;
    }
  }
  const corrected = received.reverse();
  for (let i = 0; i < block.length; i++) {
    block[i] = corrected[i];
  }
  return true;
}

/** Berlekamp–Massey. Answers the error locator, or `undefined` when the damage is past the limit. */
// eslint-disable-next-line complexity -- Berlekamp-Massey is one loop with one branch; cutting it in half would hide the invariant that makes it correct
function errorLocator(syndromes: readonly number[], ecCount: number): number[] | undefined {
  let locator = [1];
  let previous = [1];
  for (let round = 0; round < ecCount; round++) {
    let discrepancy = syndromes[round];
    for (let i = 1; i <= degree(locator); i++) {
      discrepancy ^= mul(locator[i], syndromes[round - i] ?? 0);
    }
    previous = [0, ...previous];
    if (discrepancy === 0) {
      continue;
    }
    if (previous.length > locator.length) {
      // The swap is not an alternative to the update below — it chooses which polynomial the
      // update is applied to. Writing it as an `else` produces a decoder that passes every
      // clean symbol and repairs nothing, which is the least useful place for a bug to hide.
      const next = polyScale(previous, discrepancy);
      previous = polyScale(locator, inverse(discrepancy));
      locator = next;
    }
    locator = polyAdd(locator, polyScale(previous, discrepancy));
  }
  const errors = degree(locator);
  return errors < 0 || errors * 2 > ecCount ? undefined : locator;
}

/** The powers `i` for which the locator vanishes at α^-i — one per corrupted codeword. */
function chienSearch(locator: readonly number[], length: number): number[] {
  const found: number[] = [];
  for (let i = 0; i < length; i++) {
    if (polyEval(locator, inverse(EXP[i])) === 0) {
      found.push(i);
    }
  }
  return found;
}

/**
 * Forney's magnitudes, applied to the received polynomial.
 *
 * <p>The denominator is the explicit product over the other roots rather than the formal
 * derivative: both are correct, but the product cannot be got subtly wrong by a factor of X,
 * which is precisely the mistake that makes a decoder pass every clean symbol and corrupt every
 * damaged one.</p>
 */
// eslint-disable-next-line complexity -- one formula over the located errors, with its two ways of not being applicable
function applyForney(
  received: number[],
  locator: readonly number[],
  syndromes: readonly number[],
  positions: readonly number[],
  ecCount: number,
): boolean {
  const omega = polyMul(syndromes, locator).slice(0, ecCount);
  for (const position of positions) {
    const x = EXP[position];
    const xInverse = inverse(x);
    let denominator = 1;
    for (const other of positions) {
      if (other !== position) {
        denominator = mul(denominator, 1 ^ mul(EXP[other], xInverse));
      }
    }
    if (denominator === 0 || position >= received.length) {
      return false;
    }
    received[position] ^= mul(polyEval(omega, xInverse), inverse(denominator));
  }
  return true;
}

// ---- the matrix: format, masks, codewords -------------------------------------------------

const MASKS: ReadonlyArray<(row: number, column: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The 32 valid format codes, by (level index, mask). Built, not tabulated: BCH(15,5) is ten lines. */
function formatCode(levelBits: number, mask: number): number {
  const data = (levelBits << 3) | mask;
  let remainder = data << 10;
  for (let bit = 14; bit >= 10; bit--) {
    if (remainder & (1 << bit)) {
      remainder ^= 0x537 << (bit - 10);
    }
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function bitCount(value: number): number {
  let count = 0;
  for (let v = value; v !== 0; v >>= 1) {
    count += v & 1;
  }
  return count;
}

/**
 * The level and mask, from the two copies of the format code.
 *
 * <p>Read as "closest of the thirty-two" rather than by inverting the BCH code: the two copies
 * are independent, and taking the best over both is both simpler and strictly more tolerant
 * than correcting either alone.</p>
 */
function readFormat(matrix: QrMatrix): { levelIndex: number; mask: number } | undefined {
  const bit = (row: number, column: number): number => (matrix[row][column] ? 1 : 0);
  const copies = [formatBesideTopLeft(bit), formatBesideTheOthers(bit, matrix.length)];
  const candidates: { levelIndex: number; mask: number; distance: number }[] = [];
  for (let levelIndex = 0; levelIndex < 4; levelIndex++) {
    for (let mask = 0; mask < 8; mask++) {
      const code = formatCode(LEVEL_BY_FORMAT_BITS[levelIndex], mask);
      candidates.push({ levelIndex, mask, distance: Math.min(...copies.map((copy) => bitCount(code ^ copy))) });
    }
  }
  const best = candidates.reduce((chosen, candidate) => (candidate.distance < chosen.distance ? candidate : chosen));
  // Four wrong bits is not a format code read badly; it is a grid sampled somewhere else.
  return best.distance > 3 ? undefined : { levelIndex: best.levelIndex, mask: best.mask };
}

/** The copy that wraps the top-left finder, most significant bit first. */
function formatBesideTopLeft(bit: (row: number, column: number) => number): number {
  let code = 0;
  for (let i = 0; i < 6; i++) {
    code = (code << 1) | bit(8, i);
  }
  code = (code << 1) | bit(8, 7); // column 6 is timing, and carries no format bit
  code = (code << 1) | bit(8, 8);
  code = (code << 1) | bit(7, 8);
  for (let j = 5; j >= 0; j--) {
    code = (code << 1) | bit(j, 8);
  }
  return code;
}

/** The copy split between the other two finders. */
function formatBesideTheOthers(bit: (row: number, column: number) => number, size: number): number {
  let code = 0;
  for (let j = size - 1; j >= size - 7; j--) {
    code = (code << 1) | bit(j, 8);
  }
  for (let i = size - 8; i < size; i++) {
    code = (code << 1) | bit(8, i);
  }
  return code;
}

/** Mark a rectangle as reserved, clipped to the symbol. */
function reserve(map: boolean[][], top: number, left: number, height: number, width: number): void {
  const size = map.length;
  for (let row = Math.max(0, top); row < Math.min(size, top + height); row++) {
    for (let column = Math.max(0, left); column < Math.min(size, left + width); column++) {
      map[row][column] = true;
    }
  }
}

/** The alignment patterns — every crossing of the version's coordinates except the three corners. */
function reserveAlignment(map: boolean[][], version: number): void {
  const size = map.length;
  const coords = alignmentCoordinates(version);
  // The three crossings that fall on a finder pattern carry no alignment pattern.
  const corners = new Set([`6:6`, `6:${size - 7}`, `${size - 7}:6`]);
  for (const row of coords) {
    for (const column of coords) {
      if (!corners.has(`${row}:${column}`)) {
        reserve(map, row - 2, column - 2, 5, 5);
      }
    }
  }
}

/** Every module the standard reserves — everything else carries data. */
function functionModules(version: number): boolean[][] {
  const size = 17 + 4 * version;
  const map = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  reserve(map, 0, 0, 9, 9); // top-left finder, its separator and the format strip
  reserve(map, 0, size - 8, 9, 8); // top-right
  reserve(map, size - 8, 0, 8, 9); // bottom-left
  reserve(map, 6, 0, 1, size); // timing, both ways
  reserve(map, 0, 6, size, 1);
  reserveAlignment(map, version);
  if (version >= 7) {
    reserve(map, size - 11, 0, 3, 6); // the version blocks
    reserve(map, 0, size - 11, 6, 3);
  }
  return map;
}

/** The interleaved codeword stream, read in the standard's zigzag with the mask undone. */
// eslint-disable-next-line complexity -- the standard's zigzag: one traversal whose skips (timing column, function modules, byte boundary) are the traversal
function readCodewords(matrix: QrMatrix, version: number, mask: number): number[] {
  const size = matrix.length;
  const reserved = functionModules(version);
  const unmask = MASKS[mask];
  const codewords: number[] = [];
  let current = 0;
  let bits = 0;
  let readingUp = true;
  for (let column = size - 1; column > 0; column -= 2) {
    // The vertical timing column is not a data column, and stepping OVER it shifts every pair
    // to its left by one — the loop variable itself moves, or the pairs start overlapping.
    if (column === 6) {
      column--;
    }
    for (let count = 0; count < size; count++) {
      const row = readingUp ? size - 1 - count : count;
      for (let offset = 0; offset < 2; offset++) {
        const c = column - offset;
        if (reserved[row][c]) {
          continue;
        }
        const dark = matrix[row][c] !== unmask(row, c);
        current = (current << 1) | (dark ? 1 : 0);
        bits++;
        if (bits === 8) {
          codewords.push(current);
          current = 0;
          bits = 0;
        }
      }
    }
    readingUp = !readingUp;
  }
  return codewords;
}

interface BlockLayout {
  readonly blockCount: number;
  readonly ecPerBlock: number;
  /** Data codewords in the shorter blocks; the rest hold one more. */
  readonly shortLength: number;
  /** How many blocks are the shorter kind — always the first ones. */
  readonly shortBlocks: number;
}

/** How this version and level cut the stream into blocks. */
function blockLayout(version: number, levelIndex: number): BlockLayout {
  const ecTotal = EC_CODEWORDS[version - 1][levelIndex];
  const blockCount = EC_BLOCKS[version - 1][levelIndex];
  const dataTotal = TOTAL_CODEWORDS[version - 1] - ecTotal;
  return {
    blockCount,
    ecPerBlock: ecTotal / blockCount,
    shortLength: Math.floor(dataTotal / blockCount),
    shortBlocks: blockCount - (dataTotal % blockCount),
  };
}

/**
 * The interleaved stream back into blocks.
 *
 * <p>The standard interleaves so that a scratch across the symbol damages a few codewords of
 * every block instead of destroying one block entirely — which is also why getting this order
 * subtly wrong produces a symbol that decodes at one version and fails at the next.</p>
 */
// eslint-disable-next-line complexity -- three passes over one cursor: the short rows, the long blocks' extra byte, then the error-correction rows
function deinterleave(codewords: readonly number[], layout: BlockLayout): { data: number[]; ec: number[] }[] {
  const blocks = Array.from({ length: layout.blockCount }, () => ({ data: [] as number[], ec: [] as number[] }));
  let index = 0;
  const next = (): number => codewords[index++] ?? 0;
  for (let i = 0; i < layout.shortLength; i++) {
    for (const block of blocks) {
      block.data.push(next());
    }
  }
  for (let b = layout.shortBlocks; b < layout.blockCount; b++) {
    blocks[b].data.push(next());
  }
  for (let i = 0; i < layout.ecPerBlock; i++) {
    for (const block of blocks) {
      block.ec.push(next());
    }
  }
  return blocks;
}

/** De-interleave into blocks, correct each, and answer the data bytes in order. */
function correctedData(codewords: readonly number[], version: number, levelIndex: number): number[] | undefined {
  const layout = blockLayout(version, levelIndex);
  const out: number[] = [];
  for (const { data, ec } of deinterleave(codewords, layout)) {
    const block = [...data, ...ec];
    if (!correctBlock(block, layout.ecPerBlock)) {
      return undefined;
    }
    out.push(...block.slice(0, data.length));
  }
  return out;
}

// ---- the bit stream ------------------------------------------------------------------------

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

class BitReader {
  private position = 0;

  constructor(private readonly bytes: readonly number[]) {}

  get remaining(): number {
    return this.bytes.length * 8 - this.position;
  }

  read(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = this.bytes[this.position >> 3] ?? 0;
      value = (value << 1) | ((byte >> (7 - (this.position & 7))) & 1);
      this.position++;
    }
    return value;
  }
}

/** Character-count bit widths, by mode, for the three version bands the standard defines. */
const COUNT_BITS: Record<number, readonly [number, number, number]> = {
  1: [10, 12, 14],
  2: [9, 11, 13],
  4: [8, 16, 16],
  8: [8, 10, 12],
};

function versionBand(version: number): 0 | 1 | 2 {
  if (version <= 9) {
    return 0;
  }
  return version <= 26 ? 1 : 2;
}

/** How many bits the character count occupies. Zero means "a mode this reader does not read". */
function countBits(mode: number, version: number): number {
  const widths = COUNT_BITS[mode];
  return widths === undefined ? 0 : widths[versionBand(version)];
}

/**
 * The segments, in the order they were written.
 *
 * <p>An encoder mixes modes freely to save room, and a real `otpauth://` URI is the perfect
 * example: the punctuation is a byte segment, the base32 secret in the middle is alphanumeric,
 * and the issuer after it is byte again. So the pieces are kept in order and only <b>adjacent</b>
 * byte runs are joined before being read as UTF-8 — joined because a multi-byte character may
 * legally straddle two segments, and only adjacent ones because gathering them all to the end
 * would rebuild the string in the wrong order.</p>
 */
// eslint-disable-next-line complexity -- the segment loop, whose four exits (terminator, ECI, unknown mode, truncation) are the format
function decodeSegments(bytes: readonly number[], version: number): QrDecodeResult {
  const reader = new BitReader(bytes);
  const pieces: (string | number[])[] = [];
  while (reader.remaining >= 4) {
    const mode = reader.read(4);
    if (mode === 0) {
      break;
    }
    if (mode === 7) {
      readEci(reader);
      continue;
    }
    const width = countBits(mode, version);
    if (width === 0) {
      return { ok: false, reason: `This QR code uses a mode this reader does not implement (${mode}).` };
    }
    const count = reader.read(width);
    const segment = readSegment(reader, mode, count);
    if (segment === undefined) {
      return { ok: false, reason: 'This QR code is damaged: its content ran out mid-way.' };
    }
    pieces.push(segment);
  }
  return { ok: true, text: joinPieces(pieces) };
}

/**
 * Bytes → characters.
 *
 * <p>UTF-8 first, because that is what every payload this feature exists for uses. Shift-JIS
 * second, because the format was designed in Japan and a great many QR codes in the wild carry
 * Japanese text with no ECI header to say so — a byte sequence that is not valid UTF-8 but is
 * valid Shift-JIS is one of them, and the alternative is handing back replacement characters.</p>
 */
function decodeBytes(bytes: readonly number[]): string {
  const data = new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    try {
      return new TextDecoder('shift_jis', { fatal: true }).decode(data);
    } catch {
      return new TextDecoder('utf-8').decode(data);
    }
  }
}

function joinPieces(pieces: readonly (string | number[])[]): string {
  let text = '';
  let run: number[] = [];
  const flush = (): void => {
    if (run.length > 0) {
      text += decodeBytes(run);
      run = [];
    }
  };
  for (const piece of pieces) {
    if (typeof piece === 'string') {
      flush();
      text += piece;
    } else {
      run = [...run, ...piece];
    }
  }
  flush();
  return text;
}

/** ECI designators name a character set; the count is skipped and UTF-8 is assumed either way. */
function readEci(reader: BitReader): void {
  const first = reader.read(8);
  if ((first & 0x80) === 0) {
    return;
  }
  reader.read((first & 0x40) === 0 ? 8 : 16);
}

// eslint-disable-next-line complexity -- a dispatch over the three modes this reader implements
function readSegment(reader: BitReader, mode: number, count: number): string | number[] | undefined {
  if (mode === 4) {
    if (reader.remaining < count * 8) {
      return undefined;
    }
    const bytes: number[] = [];
    for (let i = 0; i < count; i++) {
      bytes.push(reader.read(8));
    }
    return bytes;
  }
  if (mode === 1) {
    return readNumeric(reader, count);
  }
  if (mode === 2) {
    return readAlphanumeric(reader, count);
  }
  return undefined;
}

// eslint-disable-next-line complexity -- three digits per ten bits, then the standard's two shorter tails
function readNumeric(reader: BitReader, count: number): string | undefined {
  let text = '';
  let left = count;
  while (left >= 3) {
    if (reader.remaining < 10) {
      return undefined;
    }
    text += String(reader.read(10)).padStart(3, '0');
    left -= 3;
  }
  if (left === 2) {
    text += String(reader.read(7)).padStart(2, '0');
  } else if (left === 1) {
    text += String(reader.read(4));
  }
  return text;
}

function readAlphanumeric(reader: BitReader, count: number): string | undefined {
  let text = '';
  let left = count;
  while (left >= 2) {
    if (reader.remaining < 11) {
      return undefined;
    }
    const pair = reader.read(11);
    text += ALPHANUMERIC[Math.floor(pair / 45)] + ALPHANUMERIC[pair % 45];
    left -= 2;
  }
  if (left === 1) {
    text += ALPHANUMERIC[reader.read(6)];
  }
  return text;
}

// ---- the entry point -----------------------------------------------------------------------

/** A square matrix whose side is one of the forty legal sizes. */
function isSymbolShaped(matrix: QrMatrix): boolean {
  const size = matrix.length;
  if (size < 21 || size > 177 || (size - 17) % 4 !== 0) {
    return false;
  }
  return matrix.every((row) => row.length === size);
}

/**
 * A module matrix → the string it carries.
 *
 * <p>The version comes from the matrix's own size rather than from the version information
 * blocks: the size is unambiguous and present at every version, while the blocks exist only
 * from version 7 and would need their own BCH correction to be trusted.</p>
 */
// eslint-disable-next-line complexity -- a chain of guards, each answering a different reason a picture failed to decode
export function decodeMatrix(matrix: QrMatrix): QrDecodeResult {
  const size = matrix.length;
  if (!isSymbolShaped(matrix)) {
    return { ok: false, reason: 'That is not the shape of a QR code.' };
  }
  const version = (size - 17) / 4;
  const format = readFormat(matrix);
  if (format === undefined) {
    return { ok: false, reason: 'The QR code was found but its header could not be read — try a sharper picture.' };
  }
  const codewords = readCodewords(matrix, version, format.mask);
  if (codewords.length < TOTAL_CODEWORDS[version - 1]) {
    return { ok: false, reason: 'The QR code was found but is incomplete — part of it is missing from the picture.' };
  }
  const data = correctedData(codewords.slice(0, TOTAL_CODEWORDS[version - 1]), version, format.levelIndex);
  if (data === undefined) {
    return { ok: false, reason: 'The QR code has more damage than it can repair — try a sharper or larger picture.' };
  }
  return decodeSegments(data, version);
}
