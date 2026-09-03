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
const { BRAND_ICON_DIR, BRAND_ICON_THEMES, brandIconFile, brandMarkSvg } = await import(
  pathToFileURL(path.join(root, 'out', 'cardBrandIcons.js')).href
);

// One stroke colour per theme. The editor draws these beside a tree row and beside form text, on both
// a dark and a light ground, so a single colour cannot serve — the whole reason for two files.
const INK = { dark: '#cfd3d8', light: '#3b4048' };

// The drawing itself now lives in src/cardBrandIcons.ts, so the files on disk and the glyph the
// webviews inline are the same mark. This script's job is the two inks and the file names.
const markFor = (brand, theme) => brandMarkSvg(brand, INK[theme]);

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
