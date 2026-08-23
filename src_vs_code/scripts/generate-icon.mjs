#!/usr/bin/env node
/**
 * Renders media/icon.png (128x128) from the same key glyph as media/icon.svg.
 *
 * The Marketplace listing icon must be a raster image — an SVG in package.json's `icon`
 * field is rejected — while the Activity Bar container keeps using the SVG. Rather than
 * carry a binary nobody can regenerate, this script draws it: no dependencies, just
 * node:zlib for the PNG stream.
 *
 * Usage: node scripts/generate-icon.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SIZE = 128;
const SS = 4; // supersample factor; 4x4 box filter gives 17 levels of anti-aliasing
const HI = SIZE * SS;
const UNITS = 24; // the SVG viewBox
const SCALE = HI / UNITS;

const BACKGROUND = [0x1f, 0x4e, 0x96, 0xff]; // credSshManager.teamIcon light
const GLYPH = [0xff, 0xff, 0xff, 0xff];

const STROKE = 1.8;
const HALF = (STROKE / 2) * SCALE;

const circle = { cx: 8 * SCALE, cy: 8 * SCALE, r: 4.5 * SCALE };
const segments = [
  [11.2, 11.2, 20, 20],
  [16, 16, 18.5, 13.5],
  [18, 18, 20.5, 15.5],
].map(([x1, y1, x2, y2]) => ({
  x1: x1 * SCALE,
  y1: y1 * SCALE,
  x2: x2 * SCALE,
  y2: y2 * SCALE,
}));

/** Distance from a point to a line segment — round caps come free. */
function distanceToSegment(px, py, s) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / lengthSquared));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

function isGlyph(px, py) {
  const ring = Math.abs(Math.hypot(px - circle.cx, py - circle.cy) - circle.r);
  if (ring <= HALF) {
    return true;
  }
  return segments.some((s) => distanceToSegment(px, py, s) <= HALF);
}

/** Rounded-square mask so the icon reads as a tile rather than a bleeding square. */
function isBackground(px, py) {
  const radius = 22 * SS;
  const x = Math.min(px, HI - px);
  const y = Math.min(py, HI - py);
  if (x >= radius || y >= radius) {
    return true;
  }
  return Math.hypot(radius - x, radius - y) <= radius;
}

// --- rasterize at HI, then box-downsample to SIZE ---
const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let glyphHits = 0;
    let backgroundHits = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x * SS + sx + 0.5;
        const py = y * SS + sy + 0.5;
        if (!isBackground(px, py)) {
          continue;
        }
        backgroundHits++;
        if (isGlyph(px, py)) {
          glyphHits++;
        }
      }
    }
    const samples = SS * SS;
    const coverage = backgroundHits / samples;
    const glyph = glyphHits / samples;
    const offset = (y * SIZE + x) * 4;
    // Composite glyph over background, then apply the rounded-square alpha.
    for (let c = 0; c < 3; c++) {
      const blended =
        coverage === 0
          ? 0
          : (GLYPH[c] * glyph + BACKGROUND[c] * (coverage - glyph)) / coverage;
      pixels[offset + c] = Math.round(blended);
    }
    pixels[offset + 3] = Math.round(coverage * 255);
  }
}

// --- PNG container ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
// 10..12 stay zero: deflate, adaptive filtering, no interlace

// One filter byte (0 = None) per scanline.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0;
  pixels.copy(raw, rowStart + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'media', 'icon.png');
writeFileSync(target, png);
console.log(`wrote ${target} (${SIZE}x${SIZE}, ${png.length} bytes)`);
