import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  MCP_ICON_DIR,
  MCP_ICON_NAMES,
  accessLevel,
  mcpIconFile,
  pentagonEdges,
} from '../mcpIcons';
import { MCP_BAR_COLORS } from '../mcpSwitches';
import { normalizeMcpAccess } from '../mcpAccess';

/**
 * The generated tree icons — since T25, the PENTAGON: five edges, one per switch colour,
 * clockwise from the upper-left (green) edge, unlit edges grey. It replaced the kind-glyph
 * composite whose credential glyph was a padlock — which read as a lock state, not a kind.
 */

const MEDIA = path.join(__dirname, '..', '..', 'media');
const ICON_DIR = path.join(MEDIA, MCP_ICON_DIR);

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as {
  contributes: { colors: Array<{ id: string; defaults: Record<string, string> }> };
};

function colorOf(key: string, theme: string): string {
  const entry = manifest.contributes.colors.find((c) => c.id === `credSshManager.${key}`);
  assert.ok(entry !== undefined, `package.json contributes no colour credSshManager.${key}`);
  return entry.defaults[theme];
}

test('the ladder maps to levels, both delete rungs on the top one', () => {
  assert.equal(accessLevel(normalizeMcpAccess(undefined)), 0);
  assert.equal(accessLevel(normalizeMcpAccess({ view: true })), 1);
  assert.equal(accessLevel(normalizeMcpAccess({ use: true })), 2);
  assert.equal(accessLevel(normalizeMcpAccess({ edit: true })), 3);
  assert.equal(accessLevel(normalizeMcpAccess({ create: true })), 4);
  assert.equal(accessLevel(normalizeMcpAccess({ delete: 'own' })), 5);
  assert.equal(accessLevel(normalizeMcpAccess({ delete: 'any' })), 5);
});

test('level 0 has no file, because an unreachable entry keeps the editor s own icon', () => {
  assert.equal(mcpIconFile(0, false, 'dark'), undefined);
  assert.equal(mcpIconFile(6, false, 'dark'), undefined);
});

test('every file the extension can ask for exists on disk', () => {
  // The silent failure this whole file is for: a missing icon file is a blank row, not an error.
  for (const name of MCP_ICON_NAMES) {
    const file = path.join(MEDIA, ...name.file.split('/'));
    assert.ok(fs.existsSync(file), `missing generated icon ${name.file} — run scripts/generate-mcp-icons.mjs`);
  }
});

test('and nothing else is there — an orphan is indistinguishable from one still in use', () => {
  const wanted = new Set(MCP_ICON_NAMES.map((n) => n.file.split('/').pop()));
  for (const found of fs.readdirSync(ICON_DIR)) {
    assert.ok(wanted.has(found), `media/${MCP_ICON_DIR}/${found} is written by nothing and read by nothing`);
  }
});

test('a regular pentagon: five edges, closed, clockwise from the upper-left one', () => {
  const edges = pentagonEdges();
  assert.equal(edges.length, 5);
  // Closed: each edge ends where the next begins.
  for (let i = 0; i < edges.length; i += 1) {
    const next = edges[(i + 1) % edges.length];
    assert.ok(Math.abs(edges[i].x2 - next.x1) < 1e-9 && Math.abs(edges[i].y2 - next.y1) < 1e-9);
  }
  // The FIRST edge is the left side — both its ends left of centre — because the owner said
  // "левая сторона — это зелёный", and green is the first switch colour.
  assert.ok(edges[0].x1 < 8 && edges[0].x2 <= 8, 'the first (green) edge must be the left side');
  // Equal lengths — regular, as asked.
  const lengths = edges.map((e) => Math.hypot(e.x2 - e.x1, e.y2 - e.y1));
  for (const length of lengths) {
    assert.ok(Math.abs(length - lengths[0]) < 1e-9);
  }
});

test('the drawing lights exactly as many edges as the level, and the rest go grey', () => {
  for (const level of [1, 2, 3, 4, 5]) {
    const file = mcpIconFile(level, false, 'dark') as string;
    const svg = fs.readFileSync(path.join(MEDIA, ...file.split('/')), 'utf8');
    const strokes = [...svg.matchAll(/<line[^>]*stroke="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
    assert.equal(strokes.length, 5);
    const palette = MCP_BAR_COLORS.map((color) => colorOf(color, 'dark'));
    assert.deepEqual(strokes.slice(0, level), palette.slice(0, level), `level ${level} lit edges`);
    assert.ok(strokes.slice(level).every((stroke) => stroke === strokes[5 - 1] || !palette.includes(stroke)),
      'an unlit edge must wear the grey, not a switch colour');
  }
});

test('the edges are painted in the palette the form uses, in both themes', () => {
  for (const theme of ['dark', 'light'] as const) {
    const file = mcpIconFile(5, false, theme) as string;
    const svg = fs.readFileSync(path.join(MEDIA, ...file.split('/')), 'utf8');
    const strokes = [...svg.matchAll(/<line[^>]*stroke="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
    assert.deepEqual(
      strokes,
      MCP_BAR_COLORS.map((color) => colorOf(color, theme)),
    );
  }
});

test('an entry that keeps history wears the centre dot in the history colour', () => {
  const plain = fs.readFileSync(
    path.join(MEDIA, ...(mcpIconFile(2, false, 'dark') as string).split('/')),
    'utf8',
  );
  const kept = fs.readFileSync(
    path.join(MEDIA, ...(mcpIconFile(2, true, 'dark') as string).split('/')),
    'utf8',
  );
  // The tint used to live on the glyph; the pentagon keeps the signal as a dot. Losing it
  // would silently regress "this entry has previous versions".
  assert.ok(kept.includes(colorOf('historyIcon', 'dark')));
  assert.ok(!plain.includes(colorOf('historyIcon', 'dark')));
});

test('every file is a 16x16 svg and the pentagon stays inside the box', () => {
  const svg = fs.readFileSync(
    path.join(MEDIA, ...(mcpIconFile(3, false, 'light') as string).split('/')),
    'utf8',
  );
  assert.match(svg, /viewBox="0 0 16 16"/);
  const coords = [...svg.matchAll(/[xy][12]="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(coords.every((value) => value >= 0 && value <= 16), 'an edge leaves the 16px box');
});
