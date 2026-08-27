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
  level: number;
  history: boolean;
  theme: IconTheme;
  /** The path under `media/`, in the form the extension joins onto its own Uri. */
  file: string;
}

/**
 * The name of one generated file. Level 0 has none — see the note above.
 *
 * <p><b>The pentagon (tails T25, owner 2026-08-27).</b> The composite used to be the kind glyph
 * with a stripe band under it, and on a credential row the glyph is a padlock — which read as a
 * LOCK STATE, not as a kind. The owner's redesign replaces the whole composite for MCP-active
 * rows: a regular pentagon whose five edges are the five switch colours, clockwise from the
 * upper-LEFT edge (the green one), an unlit switch's edge grey. The whole permission set in one
 * glyph, in the same colours the switch bars already use; the kind stays readable from the
 * row's description and the level-0 rows keep their codicons. The icon set shrank from
 * 7 kinds x 5 levels to 5 levels — the file name no longer carries a kind.</p>
 *
 * <p><b>Five edges, six switches — recorded, not fudged:</b> the bar has always shown five
 * segments because the two delete rungs share a slot (`accessMask`), and the pentagon shows
 * exactly what the bar shows. The sixth switch's distinction (delete-own vs delete-any) lives
 * in the form and the filter, not in a 16px glyph.</p>
 */
export function mcpIconFile(
  level: number,
  history: boolean,
  theme: IconTheme,
): string | undefined {
  if (level <= 0 || level > 5) {
    return undefined;
  }
  return `${MCP_ICON_DIR}/pent-${level}${history ? '-history' : ''}-${theme}.svg`;
}

/** Every file the generator writes, and every file the extension can ask for. One list. */
export const MCP_ICON_NAMES: readonly McpIconName[] = [1, 2, 3, 4, 5].flatMap((level) =>
  [false, true].flatMap((history) =>
    ICON_THEMES.map((theme) => ({
      level,
      history,
      theme,
      file: mcpIconFile(level, history, theme) as string,
    })),
  ),
);

/** One pentagon edge, drawable: from (x1,y1) to (x2,y2). */
export interface PentagonEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The five edges, CLOCKWISE from the upper-left one — the order the switches wear them, so the
 * first (green, view) is the left side, per the owner's spec. Top vertex up; centre (8, 8.4),
 * radius 6.6, which fills the 16px box with room for the stroke.
 */
export function pentagonEdges(): readonly PentagonEdge[] {
  const cx = 8;
  const cy = 8.4;
  const r = 6.6;
  const vertex = (k: number): [number, number] => {
    const angle = ((-90 + 72 * k) * Math.PI) / 180;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };
  const [p0, p1, p2, p3, p4] = [0, 1, 2, 3, 4].map(vertex);
  // upper-left, upper-right, lower-right, bottom, lower-left — clockwise from the left side.
  const pairs: ReadonlyArray<[[number, number], [number, number]]> = [
    [p4, p0],
    [p0, p1],
    [p1, p2],
    [p2, p3],
    [p3, p4],
  ];
  return pairs.map(([a, b]) => ({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
}


