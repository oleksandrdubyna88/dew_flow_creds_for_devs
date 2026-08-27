#!/usr/bin/env node
// Draw media/mcp/*.svg — the kind glyph with the agent-access ladder under it.
//
// A tree row has one icon slot, and five colours do not fit in any other channel it has (see the
// note at the top of src/mcpIcons.ts). So the stripes and the glyph share the slot, and every
// combination is a file. The ladder keeps that set small: access is monotone by construction, so
// five bits have six values rather than thirty-two, and only five of those get drawn — an entry
// with no agent access keeps the editor's own codicon.
//
// Nothing here decides anything. The kinds, the levels, the file names, the glyphs and the
// geometry all come from the compiled module; the five stripe colours come from the SWITCH
// catalog by way of package.json's own `contributes.colors`, so the icons are painted in exactly
// the palette the form and the card use. A generator with its own opinion about any of that is a
// second source of truth that agrees until someone edits one of them.
//
// Run it from the extension folder, after `npm run compile`:
//   node scripts/generate-mcp-icons.mjs
//
// The output is committed, the way media/icon.png is: a build that has to run node to produce
// what the package needs is a build that fails in someone else's clone.

import { writeFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(here, '..');

const icons = await import(pathToFileURL(join(extensionRoot, 'out', 'mcpIcons.js')).href);
const switches = await import(pathToFileURL(join(extensionRoot, 'out', 'mcpSwitches.js')).href);

const manifest = JSON.parse(readFileSync(join(extensionRoot, 'package.json'), 'utf8'));
const contributed = new Map(manifest.contributes.colors.map((c) => [c.id, c.defaults]));

/** The colour a contributed id resolves to in this theme — the same default a theme starts from. */
function colorOf(id, theme) {
  const defaults = contributed.get(`credSshManager.${id}`);
  if (defaults === undefined) {
    throw new Error(`package.json contributes no colour credSshManager.${id}`);
  }
  return defaults[theme];
}

// The tree's own foreground, near enough: VS Code gives no way to bake a theme colour into a
// file, so a generated icon is a fixed colour by nature. These are the default light/dark
// foregrounds, which is what a codicon looks like in an untouched theme.
const GLYPH_COLOR = { dark: '#CCCCCC', light: '#424242' };

const edges = icons.pentagonEdges();
const edgeColors = switches.MCP_BAR_COLORS;
if (edges.length !== edgeColors.length) {
  throw new Error(`${edges.length} edges but ${edgeColors.length} colours`);
}

// The grey an unlit edge wears — visible in both themes, quiet next to a lit one.
const OFF_COLOR = { dark: '#4d4d4d', light: '#c9c9c9' };

function svg({ level, history, theme }) {
  const lines = edges
    .map((edge, index) => {
      const lit = index < level;
      const stroke = lit ? colorOf(edgeColors[index], theme) : OFF_COLOR[theme];
      return (
        `<line x1="${round(edge.x1)}" y1="${round(edge.y1)}" x2="${round(edge.x2)}" ` +
        `y2="${round(edge.y2)}" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>`
      );
    })
    .join('');
  // History used to be the glyph's tint; the pentagon keeps it as the centre dot.
  const dot = history ? `<circle cx="8" cy="8.4" r="1.8" fill="${colorOf('historyIcon', theme)}"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">` +
    `${lines}${dot}</svg>\n`
  );
}

function round(value) {
  return Number(value.toFixed(2));
}

const outDir = join(extensionRoot, 'media', icons.MCP_ICON_DIR);
mkdirSync(outDir, { recursive: true });

// Sweep first: a kind renamed or a level dropped otherwise leaves a file nobody writes and
// nobody reads, and the next person cannot tell it from one that is still in use.
const wanted = new Set(icons.MCP_ICON_NAMES.map((n) => n.file.split('/').pop()));
let removed = 0;
for (const existing of readdirSync(outDir)) {
  if (!wanted.has(existing)) {
    rmSync(join(outDir, existing));
    removed += 1;
  }
}

let written = 0;
for (const name of icons.MCP_ICON_NAMES) {
  writeFileSync(join(outDir, name.file.split('/').pop()), svg(name), 'utf8');
  written += 1;
}

console.log(`media/${icons.MCP_ICON_DIR}: ${written} written, ${removed} removed`);
