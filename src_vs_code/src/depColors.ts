/**
 * The dependency palette — ten keys, and the one mapping from a stored key to the
 * `contributes.colors` id that paints it.
 *
 * <p>A KEY is stored, never a hex value. The reason is the same one the four existing tree
 * colours already answer to: a contributed colour carries four variants (dark, light, and both
 * high-contrast flavours), so "readable in whichever theme the person actually uses" is the
 * theme's arithmetic rather than a hex somebody eyeballed once in dark mode. A stored hex
 * would also freeze today's palette into every vault that ever synced.</p>
 *
 * <p>`vscode`-free on purpose: the auto-pick arithmetic below is the part worth testing, and a
 * test for it should not need a fake editor.</p>
 */

export const DEP_COLOR_KEYS = [
  'depColor1',
  'depColor2',
  'depColor3',
  'depColor4',
  'depColor5',
  'depColor6',
  'depColor7',
  'depColor8',
  'depColor9',
  'depColor10',
  // Added with the coloured section borders on the entity form: eleven sections can be on
  // screen at once for an SSH connection, which is one more than the dependency tints needed.
  'depColor11',
  // The MCP section's border. Always on screen, so it cannot share with the SSH sections that
  // are also on screen for an ssh entry — see formSections.ts's collision check.
  'depColor12',
] as const;

export type DepColorKey = (typeof DEP_COLOR_KEYS)[number];

/** The names the form's swatches carry, so a picker is not ten unlabelled squares. */
export const DEP_COLOR_LABELS: Readonly<Record<DepColorKey, string>> = {
  depColor1: 'Blue',
  depColor2: 'Amber',
  depColor3: 'Red',
  depColor4: 'Cyan',
  depColor5: 'Green',
  depColor6: 'Pink',
  depColor7: 'Purple',
  depColor8: 'Brown',
  depColor9: 'Turquoise',
  depColor10: 'Lime',
  depColor11: 'Orange',
  depColor12: 'Slate',
};

/**
 * The dark-theme hex of each key — a FALLBACK for the form's swatches and nothing else.
 *
 * <p>A webview is given every registered theme colour as a CSS variable (`.` becoming `-`), so a
 * swatch is painted with `var(--vscode-credSshManager-depColor3)` and shows the colour the tree
 * will actually use, in whichever theme is on. These values exist only for the case where that
 * variable is not there, so a picker degrades to ten distinguishable squares instead of ten
 * invisible ones. Never store or render a hex from here — the row's colour is the theme's.</p>
 */
export const DEP_COLOR_FALLBACK: Readonly<Record<DepColorKey, string>> = {
  depColor1: '#6E9BF0',
  depColor2: '#E8B02A',
  depColor3: '#FF8A76',
  depColor4: '#5BC8DE',
  depColor5: '#5CC46F',
  depColor6: '#FF8FBC',
  depColor7: '#B482F5',
  depColor8: '#C0906A',
  depColor9: '#4FCBB0',
  depColor10: '#B9C742',
  depColor11: '#FF9147',
  depColor12: '#8FA8C8',
};

/**
 * `depColor3` -> `credSshManager.depColor3`.
 *
 * <p>The ONE place the stored key and the manifest's colour id meet. Spelling the prefix at a
 * call site is how a renamed contribution becomes a silently uncoloured row: a `ThemeColor`
 * naming an id nobody contributed is not an error, it simply paints nothing.</p>
 */
export function depColorThemeId(key: DepColorKey): string {
  return `credSshManager.${key}`;
}

export function isDepColorKey(value: unknown): value is DepColorKey {
  return typeof value === 'string' && (DEP_COLOR_KEYS as readonly string[]).includes(value);
}
