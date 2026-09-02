import { CARD_BRANDS, CardBrand } from './cardBrand';

/**
 * A mark for each payment system, served the way `mcpIcons.ts` already serves a generated glyph.
 *
 * <p>A codicon cannot draw a payment-system mark, and this extension already has the answer to that:
 * `iconPath` takes a file, and `media/` already ships `account-green.svg` and the generated `mcp/`
 * set for reasons of exactly the same shape. So this is a path that exists, not a new one.</p>
 *
 * <h3>Generic glyphs, not the networks' logos</h3>
 *
 * <p>The marks are neutral shapes with the system's initials — <b>deliberately not</b> the trademarked
 * logos. This repository is public and MIT-licensed, and a trademark is not ours to ship: bundling
 * Visa's or Mastercard's actual mark would put a licence question into every fork and every `.vsix`.
 * A recognisable-enough placeholder next to a masked number does the job the glyph is for, which is
 * telling two cards apart at a glance.</p>
 *
 * <p>Pure: no `vscode`, no filesystem. The names live here so a file cannot be written under one name
 * and asked for under another — the same reason `mcpIcons.ts` gives for its own list.</p>
 */
export const BRAND_ICON_DIR = 'brands';

export type BrandIconTheme = 'dark' | 'light';

export const BRAND_ICON_THEMES: readonly BrandIconTheme[] = ['dark', 'light'];

/**
 * The file this brand's mark lives in, relative to `media/`.
 *
 * <p>Two files per brand, light and dark, following the `media/` convention already in the tree
 * (`db-green.svg` / `db-green-light.svg`). The marks are line drawings, so they genuinely need both:
 * one stroke colour cannot sit on both an editor background and its inverse.</p>
 */
export function brandIconFile(brand: CardBrand, theme: BrandIconTheme): string {
  return `${BRAND_ICON_DIR}/${brand}${theme === 'light' ? '-light' : ''}.svg`;
}

/** Every file this module can ask for — what the test walks, and what the packager must ship. */
export const BRAND_ICON_FILES: readonly string[] = CARD_BRANDS.flatMap((brand) =>
  BRAND_ICON_THEMES.map((theme) => brandIconFile(brand, theme)),
);

/**
 * The two-or-three letters drawn inside the mark.
 *
 * <p>Initials rather than names: the glyph is 16 pixels beside a tree row, and "unionpay" at that size
 * is a grey smear. Kept here rather than in the SVG generator so the label and the file name come from
 * one place.</p>
 */
export const BRAND_INITIALS: Readonly<Record<CardBrand, string>> = {
  visa: 'V',
  mastercard: 'MC',
  amex: 'AX',
  discover: 'DS',
  jcb: 'JCB',
  diners: 'DC',
  unionpay: 'UP',
  mir: 'MIR',
  maestro: 'MO',
};
