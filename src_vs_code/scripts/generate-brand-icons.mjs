// Draw one neutral mark per payment system, light and dark.
//
// Generated rather than hand-drawn for the reason `generate-mcp-icons.mjs` gives: the names and the
// files then come from ONE list (`src/cardBrandIcons.ts`), so a file cannot be written under a name
// nothing asks for, or asked for under a name nothing wrote.
//
// The marks are deliberately GENERIC — a rounded card outline with the system's initials. Not the
// networks' trademarked logos: this repository is public and MIT, and shipping Visa's or Mastercard's
// actual mark would put a licence question into every fork and every .vsix. See `cardBrandIcons.ts`.
//
// Run: npm run icons:brands

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const { CARD_BRANDS } = await import(pathToFileURL(path.join(root, 'out', 'cardBrand.js')).href);
const { BRAND_ICON_DIR, BRAND_ICON_THEMES, BRAND_INITIALS, brandIconFile } = await import(
  pathToFileURL(path.join(root, 'out', 'cardBrandIcons.js')).href
);

// One stroke colour per theme. The editor draws these beside a tree row and beside form text, on both
// a dark and a light ground, so a single colour cannot serve — the whole reason for two files.
const INK = { dark: '#cfd3d8', light: '#3b4048' };

/** Letters get narrower as there are more of them, so three still fit inside a 16px card. */
function fontSize(initials) {
  return [0, 8, 7, 5.6][Math.min(initials.length, 3)];
}

function markFor(brand, theme) {
  const initials = BRAND_INITIALS[brand];
  const ink = INK[theme];
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">',
    `  <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" fill="none" stroke="${ink}" stroke-width="1.1"/>`,
    `  <rect x="1.5" y="5.6" width="13" height="1.6" fill="${ink}" opacity="0.55"/>`,
    `  <text x="8" y="11.4" text-anchor="middle" font-family="Segoe UI, DejaVu Sans, sans-serif"`,
    `        font-size="${fontSize(initials)}" font-weight="600" fill="${ink}">${initials}</text>`,
    '</svg>',
    '',
  ].join('\n');
}

const dir = path.join(root, 'media', BRAND_ICON_DIR);
fs.mkdirSync(dir, { recursive: true });

const written = [];
for (const brand of CARD_BRANDS) {
  for (const theme of BRAND_ICON_THEMES) {
    const file = path.join(root, 'media', brandIconFile(brand, theme));
    fs.writeFileSync(file, markFor(brand, theme), 'utf8');
    written.push(path.basename(file));
  }
}

// Anything in the folder that this run did not write is an orphan — the same check the test makes,
// done here so the generator cleans up after a brand that was renamed or removed.
for (const found of fs.readdirSync(dir)) {
  if (!written.includes(found)) {
    fs.unlinkSync(path.join(dir, found));
    console.log(`removed orphan ${found}`);
  }
}

console.log(`wrote ${written.length} brand marks to media/${BRAND_ICON_DIR}/`);
