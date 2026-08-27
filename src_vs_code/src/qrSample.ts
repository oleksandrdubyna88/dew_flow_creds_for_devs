/**
 * Finding a QR symbol in a picture — the half that turns pixels into a module matrix.
 *
 * <p>The picture is whatever somebody had on the clipboard: a `Win+Shift+S` snip of a phone
 * screenshot, a photograph of a poster, a screen capture with a browser window around it. So the
 * symbol is somewhere inside a larger image, at an unknown scale, possibly rotated, possibly
 * light-on-dark. What it is <b>not</b>, in this product, is a live camera frame — nothing here
 * needs to run thirty times a second, which is why the search below prefers being obvious over
 * being clever.</p>
 *
 * <p>The route is the one every reader of this format takes, for the same reasons: threshold
 * locally rather than globally (a photograph is never evenly lit), find the three finder patterns
 * by their 1:1:3:1:1 signature, read the fourth corner from the alignment pattern when the version
 * has one, and sample module centres through a perspective transform. Written from the standard
 * rather than taken from a library — see the note in {@link ./qrDecode} about the dependency the
 * owner chose not to add.</p>
 */

import { QrDecodeResult, QrMatrix, decodeMatrix } from './qrDecode';

/** A picture as one byte of brightness per pixel, row-major. */
export interface GrayImage {
  readonly gray: Uint8Array;
  readonly width: number;
  readonly height: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Finder extends Point {
  readonly moduleSize: number;
  readonly votes: number;
}

/** Rows of `true` where the image is dark. */
type Bitmap = { readonly dark: Uint8Array; readonly width: number; readonly height: number };

// ---- thresholding -------------------------------------------------------------------------

const BLOCK = 8;

/**
 * Dark or light, decided per neighbourhood rather than once for the whole picture.
 *
 * <p>A global threshold is right for a screenshot and wrong for a photograph, where one side of
 * the paper is always brighter than the other; the block average with a low-contrast fallback
 * costs twenty lines and removes the entire class of "it works on my monitor" failures.</p>
 */
export function binarize(image: GrayImage): Bitmap {
  const { gray, width, height } = image;
  const columns = Math.max(1, Math.ceil(width / BLOCK));
  const rows = Math.max(1, Math.ceil(height / BLOCK));
  const blackPoints = blackPointsOf(image, columns, rows);
  const dark = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const by = Math.min(rows - 1, Math.floor(y / BLOCK));
    for (let x = 0; x < width; x++) {
      const bx = Math.min(columns - 1, Math.floor(x / BLOCK));
      dark[y * width + x] = gray[y * width + x] < smoothed(blackPoints, columns, rows, bx, by) ? 1 : 0;
    }
  }
  return { dark, width, height };
}

/**
 * One threshold per block of the picture.
 *
 * <p>The block average is the right threshold wherever the block contains both colours. Where it
 * does not — a block entirely inside one dark module, which is what a large, sharp screenshot is
 * mostly made of — its own statistics say nothing, and the neighbours decide instead. Getting
 * this wrong does not look like a threshold bug: it looks like the reader failing only on
 * <b>big</b> pictures, because only there does a block fit inside a module.</p>
 */
function blackPointsOf(image: GrayImage, columns: number, rows: number): Float32Array {
  const points = new Float32Array(columns * rows);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < columns; bx++) {
      const stats = blockStats(image, bx, by);
      points[by * columns + bx] =
        stats.high - stats.low > 24 ? stats.average : flatBlockPoint(points, columns, bx, by, stats.low);
    }
  }
  return points;
}

/** The brightness of one block, summarised. */
function blockStats(image: GrayImage, bx: number, by: number): { average: number; low: number; high: number } {
  const { gray, width, height } = image;
  let sum = 0;
  let count = 0;
  let low = 255;
  let high = 0;
  for (let y = by * BLOCK; y < Math.min((by + 1) * BLOCK, height); y++) {
    for (let x = bx * BLOCK; x < Math.min((bx + 1) * BLOCK, width); x++) {
      const value = gray[y * width + x];
      sum += value;
      count++;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
  }
  return { average: count === 0 ? 128 : sum / count, low, high };
}

/** A block with no contrast of its own: half its darkest pixel, unless the neighbours know better. */
function flatBlockPoint(points: Float32Array, columns: number, bx: number, by: number, low: number): number {
  if (bx === 0 || by === 0) {
    return low / 2;
  }
  const neighbours =
    (points[(by - 1) * columns + bx] + 2 * points[by * columns + bx - 1] + points[(by - 1) * columns + bx - 1]) / 4;
  return low < neighbours ? neighbours : low / 2;
}

/** The average threshold over the blocks around one block — a hard edge between blocks is visible. */
function smoothed(points: Float32Array, columns: number, rows: number, bx: number, by: number): number {
  let sum = 0;
  let count = 0;
  for (let ny = Math.max(0, by - 2); ny <= Math.min(rows - 1, by + 2); ny++) {
    for (let nx = Math.max(0, bx - 2); nx <= Math.min(columns - 1, bx + 2); nx++) {
      sum += points[ny * columns + nx];
      count++;
    }
  }
  return sum / count;
}

// ---- finder patterns ----------------------------------------------------------------------

/** One line of the bitmap as alternating runs, starting with whatever colour the line starts with. */
function runsOf(read: (index: number) => number, length: number): { start: number; length: number; dark: boolean }[] {
  const runs: { start: number; length: number; dark: boolean }[] = [];
  let start = 0;
  let current = read(0);
  for (let i = 1; i < length; i++) {
    const value = read(i);
    if (value !== current) {
      runs.push({ start, length: i - start, dark: current === 1 });
      start = i;
      current = value;
    }
  }
  runs.push({ start, length: length - start, dark: current === 1 });
  return runs;
}

/** Does this run of five match a finder's 1:1:3:1:1? Answers the module size, or 0. */
function finderModuleSize(lengths: readonly number[]): number {
  const total = lengths.reduce((sum, value) => sum + value, 0);
  if (total < 7) {
    return 0;
  }
  const module = total / 7;
  const tolerance = module / 2;
  const wanted = [1, 1, 3, 1, 1];
  for (let i = 0; i < 5; i++) {
    if (Math.abs(lengths[i] - wanted[i] * module) > wanted[i] * tolerance) {
      return 0;
    }
  }
  return module;
}

/** Scan one line for finder signatures; answers the centre index and module size of each. */
function scanLine(read: (index: number) => number, length: number): { centre: number; moduleSize: number }[] {
  const runs = runsOf(read, length);
  const hits: { centre: number; moduleSize: number }[] = [];
  for (let i = 0; i + 4 < runs.length; i++) {
    if (!runs[i].dark) {
      continue;
    }
    const window = runs.slice(i, i + 5);
    const moduleSize = finderModuleSize(window.map((run) => run.length));
    if (moduleSize > 0) {
      hits.push({ centre: window[2].start + window[2].length / 2, moduleSize });
    }
  }
  return hits;
}

/**
 * The finder patterns, by scanning every row and confirming each hit down its own column.
 *
 * <p>A row scan alone finds the middle of a wide dark band as readily as a finder; the vertical
 * confirmation at the same x is what separates them, and it costs one scan per candidate rather
 * than one per pixel.</p>
 */
// eslint-disable-next-line complexity -- one scan of the picture whose confirmations are the search
export function findFinders(bitmap: Bitmap): Finder[] {
  const { dark, width, height } = bitmap;
  const clusters: { x: number; y: number; moduleSize: number; votes: number }[] = [];
  const step = Math.max(1, Math.floor(height / 400)); // a very large screenshot needs no every-row scan
  for (let y = 0; y < height; y += step) {
    for (const hit of scanLine((x) => dark[y * width + x], width)) {
      const column = scanLine((row) => dark[row * width + Math.round(hit.centre)], height);
      const vertical = column.find((candidate) => Math.abs(candidate.centre - y) <= hit.moduleSize * 2);
      if (vertical === undefined || Math.abs(vertical.moduleSize - hit.moduleSize) > hit.moduleSize / 2) {
        continue;
      }
      addVote(clusters, { x: hit.centre, y: vertical.centre, moduleSize: (hit.moduleSize + vertical.moduleSize) / 2 });
    }
  }
  return clusters
    .filter((cluster) => cluster.votes >= 2)
    .sort((a, b) => b.votes - a.votes)
    .map((cluster) => ({ x: cluster.x, y: cluster.y, moduleSize: cluster.moduleSize, votes: cluster.votes }));
}

function addVote(
  clusters: { x: number; y: number; moduleSize: number; votes: number }[],
  found: { x: number; y: number; moduleSize: number },
): void {
  for (const cluster of clusters) {
    const near = Math.abs(cluster.x - found.x) < found.moduleSize && Math.abs(cluster.y - found.y) < found.moduleSize;
    if (near) {
      const total = cluster.votes + 1;
      cluster.x = (cluster.x * cluster.votes + found.x) / total;
      cluster.y = (cluster.y * cluster.votes + found.y) / total;
      cluster.moduleSize = (cluster.moduleSize * cluster.votes + found.moduleSize) / total;
      cluster.votes = total;
      return;
    }
  }
  clusters.push({ ...found, votes: 1 });
}

const distance = (p: Point, q: Point): number => Math.hypot(p.x - q.x, p.y - q.y);

/**
 * Which three of the candidates are the finders, and which corner each one is.
 *
 * <p><b>Not the three most popular.</b> A busy picture produces confident false positives — a
 * logo, a barcode, a run of table borders — and one of them can collect as many votes as a real
 * finder, which is exactly what happened on the first version-18 fixture: the true bottom-left
 * was pushed out of the top three by a pattern in the middle of the symbol. What separates them
 * is not popularity but <b>geometry</b>: three finders agree on a module size and stand at the
 * corners of a right isosceles triangle whose legs measure a legal number of modules.</p>
 *
 * <p>Handedness then names them: a QR symbol is never mirrored, so the cross product of the two
 * edges leaving the top-left corner has a known sign.</p>
 */
// eslint-disable-next-line complexity -- a search over every triple of candidates: three nested loops and the comparison that keeps the best
function selectFinders(
  finders: readonly Finder[],
): { topLeft: Finder; topRight: Finder; bottomLeft: Finder } | undefined {
  const pool = finders.slice(0, 12);
  let best: { corner: Finder; first: Finder; second: Finder; score: number } | undefined;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const triple = [pool[i], pool[j], pool[k]] as const;
        const scored = scoreTriple(triple);
        if (scored !== undefined && (best === undefined || scored.score < best.score)) {
          best = scored;
        }
      }
    }
  }
  if (best === undefined) {
    return undefined;
  }
  const { corner, first, second } = best;
  const cross = (first.x - corner.x) * (second.y - corner.y) - (first.y - corner.y) * (second.x - corner.x);
  return cross > 0
    ? { topLeft: corner, topRight: first, bottomLeft: second }
    : { topLeft: corner, topRight: second, bottomLeft: first };
}

/** How much this triple looks like three finder patterns. Lower is better; `undefined` is "no". */
// eslint-disable-next-line complexity -- one geometric judgement, in the terms the standard describes the three patterns
function scoreTriple(
  triple: readonly [Finder, Finder, Finder],
): { corner: Finder; first: Finder; second: Finder; score: number } | undefined {
  const sizes = triple.map((finder) => finder.moduleSize);
  const spread = (Math.max(...sizes) - Math.min(...sizes)) / Math.min(...sizes);
  if (spread > 0.5) {
    return undefined;
  }
  const moduleSize = sizes.reduce((sum, size) => sum + size, 0) / 3;
  let best: { corner: Finder; first: Finder; second: Finder; score: number } | undefined;
  for (let corner = 0; corner < 3; corner++) {
    const others = [0, 1, 2].filter((index) => index !== corner).map((index) => triple[index]);
    const legA = distance(triple[corner], others[0]);
    const legB = distance(triple[corner], others[1]);
    const hypotenuse = distance(others[0], others[1]);
    if (legA < moduleSize * 10 || legB < moduleSize * 10) {
      continue; // two finders closer than the smallest symbol allows are not two finders
    }
    const rightness = Math.abs(hypotenuse - Math.hypot(legA, legB)) / hypotenuse;
    const isosceles = Math.abs(legA - legB) / Math.max(legA, legB);
    const modules = (legA + legB) / 2 / moduleSize + 7;
    const legal = Math.round((modules - 21) / 4) * 4 + 21;
    const fit = Math.min(1, Math.abs(modules - legal) / 4);
    const score = spread + rightness * 3 + isosceles * 3 + fit;
    if (rightness < 0.25 && isosceles < 0.25 && (best === undefined || score < best.score)) {
      best = { corner: triple[corner], first: others[0], second: others[1], score };
    }
  }
  return best;
}

// ---- the grid -------------------------------------------------------------------------------

type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

/** The unit square's corners onto four points, in the order TL, TR, BR, BL. */
function squareToQuad(quad: readonly Point[]): Matrix3 {
  const [p0, p1, p2, p3] = quad;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  if (dx3 === 0 && dy3 === 0) {
    return [p1.x - p0.x, p2.x - p1.x, p0.x, p1.y - p0.y, p2.y - p1.y, p0.y, 0, 0, 1];
  }
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const a13 = (dx3 * dy2 - dx2 * dy3) / denominator;
  const a23 = (dx1 * dy3 - dx3 * dy1) / denominator;
  return [
    p1.x - p0.x + a13 * p1.x,
    p3.x - p0.x + a23 * p3.x,
    p0.x,
    p1.y - p0.y + a13 * p1.y,
    p3.y - p0.y + a23 * p3.y,
    p0.y,
    a13,
    a23,
    1,
  ];
}

function adjugate(m: Matrix3): Matrix3 {
  return [
    m[4] * m[8] - m[7] * m[5],
    m[7] * m[2] - m[1] * m[8],
    m[1] * m[5] - m[4] * m[2],
    m[6] * m[5] - m[3] * m[8],
    m[0] * m[8] - m[6] * m[2],
    m[3] * m[2] - m[0] * m[5],
    m[3] * m[7] - m[6] * m[4],
    m[6] * m[1] - m[0] * m[7],
    m[0] * m[4] - m[3] * m[1],
  ];
}

function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const out = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      out[row * 3 + column] =
        a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column];
    }
  }
  return out as unknown as Matrix3;
}

function apply(m: Matrix3, point: Point): Point {
  const denominator = m[6] * point.x + m[7] * point.y + m[8];
  return {
    x: (m[0] * point.x + m[1] * point.y + m[2]) / denominator,
    y: (m[3] * point.x + m[4] * point.y + m[5]) / denominator,
  };
}

/** Module coordinates → image coordinates, from four corresponding points. */
function gridTransform(source: readonly Point[], destination: readonly Point[]): Matrix3 {
  return multiply(squareToQuad(destination), adjugate(squareToQuad(source)));
}

/**
 * The alignment pattern near where the grid says it should be.
 *
 * <p>Only the bottom-right one is looked for, and only to pin the corner the three finders leave
 * unknown. Without it a photographed symbol is sampled on a parallelogram — which is right in the
 * middle and drifts by half a module in the corner, exactly where the last codewords live.</p>
 */
// eslint-disable-next-line complexity -- a windowed search: two loops, the confirmation and the nearest-so-far comparison
function findAlignment(bitmap: Bitmap, expected: Point, moduleSize: number): Point | undefined {
  const radius = Math.ceil(moduleSize * 4);
  const left = Math.max(0, Math.round(expected.x - radius));
  const right = Math.min(bitmap.width - 1, Math.round(expected.x + radius));
  const top = Math.max(0, Math.round(expected.y - radius));
  const bottom = Math.min(bitmap.height - 1, Math.round(expected.y + radius));
  let best: { point: Point; distance: number } | undefined;
  for (let y = top; y <= bottom; y++) {
    const line = (index: number): number => bitmap.dark[y * bitmap.width + (left + index)];
    for (const hit of centresOf(line, right - left + 1, moduleSize)) {
      const x = left + hit;
      const column = (index: number): number => bitmap.dark[(top + index) * bitmap.width + Math.round(x)];
      const vertical = centresOf(column, bottom - top + 1, moduleSize).map((value) => top + value);
      const nearest = vertical.find((candidate) => Math.abs(candidate - y) <= moduleSize * 2);
      if (nearest === undefined) {
        continue;
      }
      const point = { x, y: nearest };
      const distance = Math.hypot(point.x - expected.x, point.y - expected.y);
      if (best === undefined || distance < best.distance) {
        best = { point, distance };
      }
    }
  }
  return best?.point;
}

/** Centres of a dark-light-dark 1:1:1 signature — an alignment pattern seen along one line. */
function centresOf(read: (index: number) => number, length: number, moduleSize: number): number[] {
  const runs = runsOf(read, length);
  const centres: number[] = [];
  for (let i = 0; i + 2 < runs.length; i++) {
    const window = runs.slice(i, i + 3);
    const matches =
      window[0].dark &&
      window.every((run) => Math.abs(run.length - moduleSize) <= Math.max(1, moduleSize * 0.6));
    if (matches) {
      centres.push(window[1].start + window[1].length / 2);
    }
  }
  return centres;
}

/** Where to sample one module: its centre, and a small cross when a module is big enough for one. */
function tapsFor(row: number, column: number, offset: number): Point[] {
  const centre = { x: column + 0.5, y: row + 0.5 };
  return offset === 0
    ? [centre]
    : [
        centre,
        { x: centre.x - offset, y: centre.y },
        { x: centre.x + offset, y: centre.y },
        { x: centre.x, y: centre.y - offset },
        { x: centre.x, y: centre.y + offset },
      ];
}

function darkAt(bitmap: Bitmap, point: Point): number {
  // Coerced to unsigned so a negative coordinate becomes an enormous one: two bounds instead of
  // four, and a sample that falls outside the picture reads as light either way.
  const x = Math.round(point.x) >>> 0;
  const y = Math.round(point.y) >>> 0;
  return x < bitmap.width && y < bitmap.height ? bitmap.dark[y * bitmap.width + x] : 0;
}

/** Read the modules by sampling the middle of each one, taking the majority of a small cross. */
function sampleGrid(bitmap: Bitmap, transform: Matrix3, dimension: number, moduleSize: number): QrMatrix {
  // Off-centre taps only where a module is several pixels across; on a tight capture they would
  // land in the neighbouring module and vote against the one being read.
  const offset = moduleSize > 4 ? 0.25 : 0;
  const matrix: boolean[][] = [];
  for (let row = 0; row < dimension; row++) {
    const line: boolean[] = [];
    for (let column = 0; column < dimension; column++) {
      const taps = tapsFor(row, column, offset);
      const dark = taps.reduce((count, tap) => count + darkAt(bitmap, apply(transform, tap)), 0);
      line.push(dark * 2 > taps.length);
    }
    matrix.push(line);
  }
  return matrix;
}

/**
 * The module size, measured ALONG the line between two finder centres.
 *
 * <p>The width of a finder's rings in a row scan is only the true module size when the symbol is
 * square to the picture. Rotate it and every horizontal chord grows by up to forty per cent,
 * which does not break the finder search — the ratios are unchanged — but does break everything
 * downstream that divides a distance by it. Measuring along the axis that will actually be
 * divided removes the dependency on angle entirely.</p>
 *
 * <p>From a finder's centre outwards there are 1.5 dark modules, 1 light, 1 dark; both ways that
 * is seven modules, which is the number this divides by.</p>
 */
function moduleSizeAlong(bitmap: Bitmap, centre: Point, towards: Point): number | undefined {
  const dx = towards.x - centre.x;
  const dy = towards.y - centre.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return undefined;
  }
  const forward = ringDistance(bitmap, centre, { x: dx / length, y: dy / length });
  const backward = ringDistance(bitmap, centre, { x: -dx / length, y: -dy / length });
  return forward === undefined || backward === undefined ? undefined : (forward + backward) / 7;
}

/** How far from a finder's centre its outer dark ring ends, in the given direction. */
function ringDistance(bitmap: Bitmap, centre: Point, direction: Point): number | undefined {
  const at = (distance: number): number =>
    darkAt(bitmap, { x: centre.x + direction.x * distance, y: centre.y + direction.y * distance });
  let transitions = 0;
  let previous = at(0);
  for (let distance = 0.5; distance < Math.max(bitmap.width, bitmap.height); distance += 0.5) {
    const value = at(distance);
    if (value !== previous) {
      transitions++;
      previous = value;
      if (transitions === 3) {
        return distance; // dark centre → light ring → dark ring → out
      }
    }
  }
  return undefined;
}

/** The module count across the symbol, snapped to the nearest legal size. */
function dimensionFrom(topLeft: Point, topRight: Point, bottomLeft: Point, moduleSize: number): number | undefined {
  const across = distance(topLeft, topRight) / moduleSize;
  const down = distance(topLeft, bottomLeft) / moduleSize;
  const raw = (across + down) / 2 + 7;
  // Legal sizes are 21, 25, … 177 — one more than a multiple of four.
  const dimension = Math.round((raw - 21) / 4) * 4 + 21;
  return dimension >= 21 && dimension <= 177 ? dimension : undefined;
}

/**
 * Every plausible reading of this picture, best guess first.
 *
 * <p>More than one is offered because the module count is <b>measured</b>, not read: it comes
 * from a distance divided by an estimated module size, and one per cent of error over eighty
 * modules is a whole module. A wrong count does not fail loudly — it samples a grid that is
 * subtly out of step and hands back a matrix of confident nonsense — so the neighbouring legal
 * sizes are offered too, and the decoder, which has error correction and a checksum-like format
 * code, is what decides. Sampling a grid costs microseconds; guessing costs the feature.</p>
 */
export function findMatrices(image: GrayImage): QrMatrix[] {
  return matricesIn(binarize(image));
}

function matricesIn(bitmap: Bitmap): QrMatrix[] {
  const ordered = selectFinders(findFinders(bitmap));
  if (ordered === undefined) {
    return [];
  }
  const { topLeft, topRight, bottomLeft } = ordered;
  const measured = [
    moduleSizeAlong(bitmap, topLeft, topRight),
    moduleSizeAlong(bitmap, topRight, topLeft),
    moduleSizeAlong(bitmap, topLeft, bottomLeft),
    moduleSizeAlong(bitmap, bottomLeft, topLeft),
  ].filter((value): value is number => value !== undefined && value > 0.5);
  const moduleSize =
    measured.length === 0
      ? (topLeft.moduleSize + topRight.moduleSize + bottomLeft.moduleSize) / 3
      : measured.reduce((sum, value) => sum + value, 0) / measured.length;
  const dimension = dimensionFrom(topLeft, topRight, bottomLeft, moduleSize);
  if (dimension === undefined) {
    return [];
  }
  const sizes = [dimension, dimension - 4, dimension + 4, dimension - 8, dimension + 8].filter(
    (value) => value >= 21 && value <= 177,
  );
  // With the alignment pattern and without it: on a flat screenshot the two agree, and on the
  // one picture where the search locks onto the wrong 5×5 block, the plain quadrilateral is
  // what saves the read. Sampling is cheap; a failed paste is not.
  return sizes.flatMap((value) => [
    sampleAt(bitmap, ordered, value, moduleSize, true),
    sampleAt(bitmap, ordered, value, moduleSize, false),
  ]);
}

function sampleAt(
  bitmap: Bitmap,
  finders: { topLeft: Finder; topRight: Finder; bottomLeft: Finder },
  dimension: number,
  moduleSize: number,
  useAlignment: boolean,
): QrMatrix {
  const { topLeft, topRight, bottomLeft } = finders;
  const corners: Point[] = [
    { x: topLeft.x, y: topLeft.y },
    { x: topRight.x, y: topRight.y },
    { x: topRight.x + bottomLeft.x - topLeft.x, y: topRight.y + bottomLeft.y - topLeft.y },
    { x: bottomLeft.x, y: bottomLeft.y },
  ];
  const source: Point[] = [
    { x: 3.5, y: 3.5 },
    { x: dimension - 3.5, y: 3.5 },
    { x: dimension - 3.5, y: dimension - 3.5 },
    { x: 3.5, y: dimension - 3.5 },
  ];
  if (useAlignment && dimension >= 25) {
    const rough = gridTransform(source, corners);
    const expected = apply(rough, { x: dimension - 6.5, y: dimension - 6.5 });
    const found = findAlignment(bitmap, expected, moduleSize);
    if (found !== undefined) {
      corners[2] = found;
      source[2] = { x: dimension - 6.5, y: dimension - 6.5 };
    }
  }
  return sampleGrid(bitmap, gridTransform(source, corners), dimension, moduleSize);
}

/**
 * A picture → the string its QR code carries.
 *
 * <p>Tried right way up and then inverted, because a dark-mode screenshot is a QR code with its
 * colours swapped and every other step here assumes dark modules on light paper.</p>
 */
export function decodeQr(image: GrayImage): QrDecodeResult {
  // Two thresholds, then both of them inverted. The per-block threshold is the right one for a
  // photograph and the one global threshold is the right one for a blurred or low-contrast
  // capture, where block statistics chase the blur; inverting covers a dark-mode screenshot,
  // which is a QR code with its colours swapped and would otherwise fail at the first step.
  const bitmaps = [binarize(image), otsu(image)];
  const attempts = [...bitmaps, ...bitmaps.map(inverted)];
  let reason = 'No QR code was found in that image.';
  for (const bitmap of attempts) {
    for (const matrix of matricesIn(bitmap)) {
      const result = decodeMatrix(matrix);
      if (result.ok) {
        return result;
      }
      reason = result.reason;
    }
  }
  return { ok: false, reason };
}

function inverted(bitmap: Bitmap): Bitmap {
  return { ...bitmap, dark: bitmap.dark.map((value) => (value === 1 ? 0 : 1)) };
}

/** One threshold for the whole picture, chosen where the two brightness populations part. */
// eslint-disable-next-line complexity -- the textbook between-class-variance sweep, whose guards are the histogram's empty ends
export function otsu(image: GrayImage): Bitmap {
  const histogram = new Array<number>(256).fill(0);
  for (const value of image.gray) {
    histogram[value]++;
  }
  const total = image.gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }
  let backgroundSum = 0;
  let backgroundCount = 0;
  let best = 0;
  let bestVariance = -1;
  for (let level = 0; level < 256; level++) {
    backgroundCount += histogram[level];
    if (backgroundCount === 0) {
      continue;
    }
    const foregroundCount = total - backgroundCount;
    if (foregroundCount === 0) {
      break;
    }
    backgroundSum += level * histogram[level];
    const backgroundMean = backgroundSum / backgroundCount;
    const foregroundMean = (sum - backgroundSum) / foregroundCount;
    const variance = backgroundCount * foregroundCount * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = level;
    }
  }
  const dark = new Uint8Array(image.gray.length);
  for (let i = 0; i < dark.length; i++) {
    dark[i] = image.gray[i] <= best ? 1 : 0;
  }
  return { dark, width: image.width, height: image.height };
}
