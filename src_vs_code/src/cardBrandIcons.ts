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

/**
 * What a person is shown, as opposed to what fits in a 16-pixel glyph.
 *
 * <p>Separate from `BRAND_INITIALS` because they answer different questions: "MC" belongs inside the
 * mark, and "Mastercard" belongs in the sentence under the number. One table serving both would make
 * every caller pick a substring.</p>
 */
/**
 * The mark itself: a rounded card outline with the system's initials.
 *
 * <p>Here rather than in the generator script, and that is the point — the script wrote the files
 * AND owned the drawing, so a glyph rendered anywhere else would have been a second drawing of the
 * same thing. Now the script imports this, and so does the webview.</p>
 *
 * <p><b>`ink` is a colour or `currentColor`.</b> The generated FILES need a literal colour, twice,
 * because a file icon beside a tree row cannot follow a theme. A webview does not have that problem:
 * inlined with `currentColor` the mark takes the colour of the text beside it, in either theme,
 * from one string — which is also why the panels need no `localResourceRoots` opening up.</p>
 */
export function brandMarksMarkup(): string {
  return CARD_BRANDS.map(
    (brand) => `<span class="brandMark" data-brand="${brand}" hidden>${brandMarkSvg(brand)}</span>`,
  ).join('');
}

/**
 * The style both surfaces draw the marks with, so the form and the card cannot disagree about it.
 *
 * <p>`currentColor` inside the mark means the CSS below decides nothing about colour — the glyph
 * takes the colour of the text beside it, in either theme.</p>
 */
export const BRAND_MARK_STYLES = `
  .brandMark { display: inline-flex; align-items: center; margin-left: 6px; vertical-align: middle; }
  .brandMark svg { display: block; }`;

export function brandMarkSvg(brand: CardBrand, ink: string = 'currentColor'): string {
  const initials = BRAND_INITIALS[brand];
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">',
    `  <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" fill="none" stroke="${ink}" stroke-width="1.1"/>`,
    `  <rect x="1.5" y="5.6" width="13" height="1.6" fill="${ink}" opacity="0.55"/>`,
    `  <text x="8" y="11.4" text-anchor="middle" font-family="Segoe UI, DejaVu Sans, sans-serif"`,
    `        font-size="${initialsFontSize(initials)}" font-weight="600" fill="${ink}">${initials}</text>`,
    '</svg>',
    '',
  ].join('\n');
}

/** Letters get narrower as there are more of them, so three still fit inside a 16px card. */
export function initialsFontSize(initials: string): number {
  return [0, 8, 7, 5.6][Math.min(initials.length, 3)];
}

export const PAYMENT_BRAND_LABELS: Readonly<Record<CardBrand, string>> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  jcb: 'JCB',
  diners: 'Diners Club',
  unionpay: 'UnionPay',
  mir: 'Mir',
  maestro: 'Maestro',
};
