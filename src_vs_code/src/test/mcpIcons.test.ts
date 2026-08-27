import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  KIND_GLYPHS,
  MCP_ICON_DIR,
  MCP_ICON_NAMES,
  accessLevel,
  mcpIconFile,
  stripeGeometry,
} from '../mcpIcons';
import { MCP_BAR_COLORS } from '../mcpSwitches';
import { normalizeMcpAccess } from '../mcpAccess';
import { ENTITY_KINDS } from '../types';

/**
 * The generated tree icons — 140 files, and the one way they can fail silently.
 *
 * <p>A `TreeItem.iconPath` pointing at a file that is not there does not throw and does not warn:
 * the row simply has no icon. So the guarantee worth testing is not that the drawing is pretty —
 * a person has to look at that — but that every name the extension can ASK for is a name the
 * generator WROTE, in both directions. A kind added to `ENTITY_KINDS` without re-running the
 * generator is the obvious way to arrive at a blank row, and it fails here instead.</p>
 *
 * <p>The other half is that the icons and the form agree about colour. The stripes are drawn from
 * `package.json`'s contributed defaults by way of the switch catalog, so this reads the files
 * back and checks the hex against the manifest — a palette that drifts between the form and the
 * tree is exactly the sort of thing nobody notices until the two are seen side by side.</p>
 */

const MEDIA = path.resolve(__dirname, '..', '..', 'media');
const ICON_DIR = path.join(MEDIA, MCP_ICON_DIR);
const MANIFEST = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'),
) as { contributes: { colors: { id: string; defaults: Record<string, string> }[] } };

function colorOf(id: string, theme: string): string {
  const found = MANIFEST.contributes.colors.find((c) => c.id === `credSshManager.${id}`);
  assert.ok(found !== undefined, `package.json contributes no colour ${id}`);
  return found.defaults[theme];
}

test('the ladder has six levels, and nothing between them', () => {
  assert.equal(accessLevel(normalizeMcpAccess(undefined)), 0);
  assert.equal(accessLevel(normalizeMcpAccess({ view: true })), 1);
  assert.equal(accessLevel(normalizeMcpAccess({ use: true })), 2);
  assert.equal(accessLevel(normalizeMcpAccess({ edit: true })), 3);
  assert.equal(accessLevel(normalizeMcpAccess({ create: true })), 4);
  assert.equal(accessLevel(normalizeMcpAccess({ delete: 'own' })), 5);
  assert.equal(accessLevel(normalizeMcpAccess({ delete: 'any' })), 5);
});

test('level 0 has no file, because an unreachable entry keeps the editor s own icon', () => {
  for (const kind of ENTITY_KINDS) {
    assert.equal(mcpIconFile(kind, 0, false, 'dark'), undefined);
    assert.equal(mcpIconFile(kind, 6, false, 'dark'), undefined);
  }
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

test('every kind has a glyph, and every glyph is painted in the one colour it is given', () => {
  for (const kind of ENTITY_KINDS) {
    const glyph = KIND_GLYPHS[kind];
    assert.ok(glyph !== undefined && glyph.length > 0, `${kind} has no glyph`);
    assert.ok(glyph.includes('{C}'), `${kind}'s glyph paints itself rather than taking a colour`);
    // A stray colour would survive the substitution and never follow the theme or the history tint.
    assert.equal(/#[0-9a-fA-F]{3,8}/.test(glyph), false, `${kind}'s glyph carries a literal colour`);
  }
});

test('the drawing lights exactly as many stripes as the level, and the rest stay faint', () => {
  for (const level of [1, 2, 3, 4, 5]) {
    const file = mcpIconFile('db', level, false, 'dark') as string;
    const svg = fs.readFileSync(path.join(MEDIA, ...file.split('/')), 'utf8');
    const opacities = [...svg.matchAll(/<rect[^>]*opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.equal(opacities.length, stripeGeometry().length);
    assert.equal(opacities.filter((o) => o === 1).length, level);
    assert.ok(opacities.slice(level).every((o) => o < 0.5));
  }
});

test('the stripes are painted in the palette the form uses, in both themes', () => {
  for (const theme of ['dark', 'light']) {
    const file = mcpIconFile('db', 5, false, theme as 'dark' | 'light') as string;
    const svg = fs.readFileSync(path.join(MEDIA, ...file.split('/')), 'utf8');
    const fills = [...svg.matchAll(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
    assert.deepEqual(
      fills,
      MCP_BAR_COLORS.map((color) => colorOf(color, theme)),
    );
  }
});

test('an entry that keeps history is drawn in the history colour, not the foreground', () => {
  const plain = fs.readFileSync(
    path.join(MEDIA, ...(mcpIconFile('ssh', 2, false, 'dark') as string).split('/')),
    'utf8',
  );
  const kept = fs.readFileSync(
    path.join(MEDIA, ...(mcpIconFile('ssh', 2, true, 'dark') as string).split('/')),
    'utf8',
  );
  // A file icon cannot take a ThemeColor, so the tint has to be drawn in. Losing it would have
  // been a silent regression of a shipped signal: "this entry has previous versions".
  assert.ok(kept.includes(colorOf('historyIcon', 'dark')));
  assert.ok(!plain.includes(colorOf('historyIcon', 'dark')));
});

test('every file is a 16x16 svg with the band along the bottom', () => {
  const svg = fs.readFileSync(
    path.join(MEDIA, ...(mcpIconFile('terminal', 3, false, 'light') as string).split('/')),
    'utf8',
  );
  assert.match(svg, /viewBox="0 0 16 16"/);
  // After the glyph group, because a glyph may itself be built out of rects — the terminal's
  // screen is one, and reading it as a stripe is how this assertion first went red.
  const band = svg.slice(svg.lastIndexOf('</g>'));
  // `\sy=` and not `y=`: greedy matching happily reads the y out of `opacity="1"`, which is how
  // this first went red against files that were perfectly correct.
  const ys = [...band.matchAll(/<rect[^>]*\sy="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(ys.length, stripeGeometry().length);
  assert.ok(ys.every((y) => y >= 12 && y < 16), 'stripes must sit under the glyph, not across it');
  const widths = stripeGeometry();
  const span = widths[widths.length - 1].x + widths[widths.length - 1].width;
  assert.equal(Math.round(span), 16, 'the band spans the icon edge to edge');
});
