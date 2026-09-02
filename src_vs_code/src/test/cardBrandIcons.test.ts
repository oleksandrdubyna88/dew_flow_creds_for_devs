import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { CARD_BRANDS } from '../cardBrand';
import {
  BRAND_ICON_DIR,
  BRAND_ICON_FILES,
  BRAND_ICON_THEMES,
  BRAND_INITIALS,
  brandIconFile,
} from '../cardBrandIcons';

/**
 * Every brand has a mark, and every mark is claimed by a brand — in both directions.
 *
 * <p>The `manifestIcons.test.ts` / `mcpIcons.test.ts` shape, and for their reason: adding a tenth
 * payment system without its glyph should redden here, not produce a blank square next to somebody's
 * card. The reverse direction matters just as much — an orphaned SVG is a file the packager ships
 * forever because nobody remembers what asked for it.</p>
 */

const MEDIA = path.join(__dirname, '..', '..', 'media');
const BRANDS = path.join(MEDIA, BRAND_ICON_DIR);

test('every brand has a file for both themes', () => {
  for (const brand of CARD_BRANDS) {
    for (const theme of BRAND_ICON_THEMES) {
      const file = path.join(MEDIA, brandIconFile(brand, theme));
      assert.ok(fs.existsSync(file), `${brand} has no ${theme} mark — expected ${brandIconFile(brand, theme)}`);
    }
  }
});

test('every file in the folder is claimed by a brand', () => {
  const claimed = new Set(BRAND_ICON_FILES.map((file) => path.basename(file)));
  for (const found of fs.readdirSync(BRANDS)) {
    assert.ok(claimed.has(found), `media/${BRAND_ICON_DIR}/${found} is claimed by no brand — orphan`);
  }
});

test('the light and dark marks are actually different files', () => {
  // A copied pair passes "the file exists" and then draws a dark stroke on a dark background. The
  // cheapest way to catch that is to notice they are byte-identical.
  for (const brand of CARD_BRANDS) {
    const dark = fs.readFileSync(path.join(MEDIA, brandIconFile(brand, 'dark')), 'utf8');
    const light = fs.readFileSync(path.join(MEDIA, brandIconFile(brand, 'light')), 'utf8');
    assert.notEqual(dark, light, `${brand}'s two marks are the same file, so one of them is invisible`);
  }
});

test('each mark is an SVG that carries its own initials', () => {
  // Not a rendering test — a wiring one. It catches the copy-paste where a new brand's file keeps the
  // letters of the brand it was copied from, which no amount of looking at a 16px icon would reveal.
  for (const brand of CARD_BRANDS) {
    const svg = fs.readFileSync(path.join(MEDIA, brandIconFile(brand, 'dark')), 'utf8');
    assert.match(svg, /^<svg\b/, `${brand}'s mark is not an SVG`);
    assert.ok(
      svg.includes(`>${BRAND_INITIALS[brand]}<`),
      `${brand}'s mark does not carry "${BRAND_INITIALS[brand]}" — copied from another brand?`,
    );
  }
});

test('no mark carries a payment network’s actual trademark', () => {
  // The deliberate limit, asserted so it survives somebody helpfully "improving" the glyphs. This
  // repository is public and MIT; a network's real logo is not ours to ship, and the day one appears
  // is the day every fork inherits a licence question.
  const forbidden = [/viselec/i, /interbank/i, /<image\b/i, /xlink:href/i, /base64/i];
  for (const file of BRAND_ICON_FILES) {
    const svg = fs.readFileSync(path.join(MEDIA, file), 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(svg, pattern, `${file} embeds artwork rather than drawing a generic mark`);
    }
  }
});

test('the initials table covers exactly the brands, so a new one cannot be half-added', () => {
  assert.deepEqual([...CARD_BRANDS].sort(), Object.keys(BRAND_INITIALS).sort());
});
