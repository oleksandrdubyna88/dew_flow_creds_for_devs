import { ENTITY_KINDS, EntityKind } from './types';
import { McpAccess, accessMask } from './mcpAccess';

/**
 * The composite tree icon: a kind glyph with the agent-access ladder drawn under it.
 *
 * <p><b>Why a generated file at all.</b> A tree row has four channels that can carry colour, and
 * none of them can carry five: `ThemeIcon` gives one colour and is already spent on history,
 * `FileDecoration` gives one colour plus a two-character badge and is already spent on
 * dependencies, and `TreeItemLabel.highlights` lets the THEME choose the style rather than the
 * extension. Per-segment colouring does not exist in any of them. `iconPath` takes a file,
 * though — this extension already ships `account-green.svg` for a reason of the same shape — so
 * five colours are drawable, at the price of the one slot the kind glyph sits in. Hence a
 * composite rather than a second icon: there is no second icon to have.</p>
 *
 * <p><b>Six levels, not thirty-two combinations.</b> Access is a ladder — deleting implies
 * creating implies editing implies using implies seeing — so the mask is monotone by
 * construction and a mask of five bits has six reachable values, not 2^5. That is what makes
 * this a small generated set (7 kinds x 5 levels x 2 themes x 2 history states) rather than the
 * 224 files the plan estimated before the ladder existed.</p>
 *
 * <p><b>Level 0 gets no file.</b> An entry with no agent access — which is every entry until
 * somebody says otherwise — keeps the editor's own codicon, tint and all. The generated glyph
 * appears only where it means something, so a hand-drawn shape sitting slightly off the
 * editor's icon set reads as a signal rather than as noise across the whole tree.</p>
 *
 * <p>Pure: no `vscode`, no filesystem. The generator script and the extension both read the
 * names from here, which is what stops a file being written under one name and asked for under
 * another.</p>
 */

/** Where the generated files live, under `media/`. */
export const MCP_ICON_DIR = 'mcp';

export type IconTheme = 'dark' | 'light';

export const ICON_THEMES: readonly IconTheme[] = ['dark', 'light'];

/** How far up the ladder this access reaches: 0 (nothing) to 5 (deleting). */
export function accessLevel(access: McpAccess): number {
  // The HIGHEST set bit, not the count. They agree for every mask the ladder can produce, and
  // where they disagree — a record from a build that knew a rung this one does not — the
  // highest is the honest answer: something above what we can name is on.
  const mask = accessMask(access);
  let level = 0;
  mask.forEach((on, index) => {
    if (on) {
      level = index + 1;
    }
  });
  return level;
}

export interface McpIconName {
  kind: EntityKind;
  level: number;
  history: boolean;
  theme: IconTheme;
  /** The path under `media/`, in the form the extension joins onto its own Uri. */
  file: string;
}

/** The name of one generated file. Level 0 has none — see the note above. */
export function mcpIconFile(
  kind: EntityKind,
  level: number,
  history: boolean,
  theme: IconTheme,
): string | undefined {
  if (level <= 0 || level > 5) {
    return undefined;
  }
  return `${MCP_ICON_DIR}/${kind}-${level}${history ? '-history' : ''}-${theme}.svg`;
}

/** Every file the generator writes, and every file the extension can ask for. One list. */
export const MCP_ICON_NAMES: readonly McpIconName[] = ENTITY_KINDS.flatMap((kind) =>
  [1, 2, 3, 4, 5].flatMap((level) =>
    [false, true].flatMap((history) =>
      ICON_THEMES.map((theme) => ({
        kind,
        level,
        history,
        theme,
        file: mcpIconFile(kind, level, history, theme) as string,
      })),
    ),
  ),
);

/**
 * The glyphs, drawn in a 16x16 box and shrunk into the top twelve by the generator.
 *
 * <p>`{C}` is the one colour the glyph is painted in — the theme's foreground, or the history
 * blue when the entry keeps previous versions. Written as markup rather than as path data
 * because two of these want a stroke and two want a fill, and a table with a `filled` column
 * beside it would be a second thing to keep in step.</p>
 *
 * <p>Approximations of the codicons the tree uses at level 0 (`lock`, `key`, `remote`, `shield`,
 * `database`, `terminal`, `file-code`) — VS Code ships no source for those, so a row that grows
 * stripes also changes shape slightly. That is the visible cost of the one icon slot, and it is
 * why nothing below level 1 is drawn here.</p>
 */
export const KIND_GLYPHS: Record<EntityKind, string> = {
  credential:
    '<path d="M5 7.4V5.2a3 3 0 0 1 6 0v2.2" fill="none" stroke="{C}" stroke-width="1.5"/>' +
    '<rect x="3" y="7.2" width="10" height="7" rx="1.3" fill="{C}"/>',
  sshkey:
    '<circle cx="5.2" cy="5.6" r="2.7" fill="none" stroke="{C}" stroke-width="1.5"/>' +
    '<path d="M7.2 7.6l6.2 6.2M10 10.4l1.7-1.7M12 12.4l1.7-1.7" fill="none" stroke="{C}" ' +
    'stroke-width="1.5" stroke-linecap="round"/>',
  ssh:
    '<rect x="1.8" y="2.6" width="12.4" height="8.4" rx="1.4" fill="none" stroke="{C}" stroke-width="1.5"/>' +
    '<circle cx="8" cy="6.8" r="1.5" fill="{C}"/>' +
    '<path d="M5.6 13.6h4.8" fill="none" stroke="{C}" stroke-width="1.5" stroke-linecap="round"/>',
  vpn: '<path d="M8 1.8l5.2 2v4.1c0 3.1-2.2 5.4-5.2 6.3-3-.9-5.2-3.2-5.2-6.3V3.8z" fill="none" stroke="{C}" stroke-width="1.5"/>',
  db:
    '<ellipse cx="8" cy="3.5" rx="5.5" ry="2.2" fill="none" stroke="{C}" stroke-width="1.4"/>' +
    '<path d="M2.5 3.5v9c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2v-9" fill="none" stroke="{C}" stroke-width="1.4"/>' +
    '<path d="M2.5 8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2" fill="none" stroke="{C}" stroke-width="1.4"/>',
  terminal:
    '<rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.4" fill="none" stroke="{C}" stroke-width="1.4"/>' +
    '<path d="M4.6 6.4L6.9 8.2 4.6 10M8.4 10.4h3.2" fill="none" stroke="{C}" stroke-width="1.4" ' +
    'stroke-linecap="round" stroke-linejoin="round"/>',
  script:
    '<path d="M3.6 1.8h5.2l3.6 3.6v8.8H3.6z" fill="none" stroke="{C}" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M8.8 1.8v3.6h3.6" fill="none" stroke="{C}" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M6.9 8.6L5.6 10l1.3 1.4M9.1 8.6L10.4 10l-1.3 1.4" fill="none" stroke="{C}" ' +
    'stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
  // The script's page and folded corner, with sliders where its chevrons are: a config IS a
  // document, and what distinguishes it is that the values in it are meant to be turned. Two
  // sliders rather than a gear, because a gear at sixteen pixels above a stripe band is a blob.
  config:
    '<path d="M3.6 1.8h5.2l3.6 3.6v8.8H3.6z" fill="none" stroke="{C}" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M8.8 1.8v3.6h3.6" fill="none" stroke="{C}" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<path d="M5.4 8.9h5.2M5.4 11.5h5.2" fill="none" stroke="{C}" stroke-width="1.3" stroke-linecap="round"/>' +
    '<circle cx="7.1" cy="8.9" r="1.05" fill="{C}"/>' +
    '<circle cx="8.9" cy="11.5" r="1.05" fill="{C}"/>',
};

/** The stripe band: five bars across the bottom, lit up to `level`. */
export interface StripeGeometry {
  x: number;
  width: number;
}

export const STRIPE_TOP = 12.9;
export const STRIPE_HEIGHT = 2.6;
export const STRIPE_RADIUS = 0.7;

/** Five bars, edge to edge, with a gap between them. Stated once, drawn from here. */
export function stripeGeometry(): readonly StripeGeometry[] {
  const gap = 0.5;
  const width = (16 - gap * 4) / 5;
  return [0, 1, 2, 3, 4].map((i) => ({ x: i * (width + gap), width }));
}

/** The glyph occupies the top twelve of sixteen; the band has the rest. */
export const GLYPH_TRANSFORM = 'translate(2 0) scale(0.75)';
