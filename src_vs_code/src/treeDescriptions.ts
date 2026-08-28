/**
 * The folder row's description, underlined (tails T30, the owner's yes on 2026-08-28).
 *
 * <p>A tree row's description is plain text — VS Code offers no styling for it — so the only
 * underline available is the one written INTO the text: Unicode's combining low line (U+0332)
 * after every character, `db` → `d̲b̲`. It renders as an underline in the editor fonts VS Code
 * ships with, costs nothing, and is removable the day the API learns styling. It is a hack,
 * shipped behind the owner's explicit yes after seeing it in his font.</p>
 *
 * <p>Two rules keep it harmless: entity descriptions are never touched (they carry hosts and
 * users a person copies by eye), and the marks are woven in at RENDER time only — `nodeHaystack`
 * reads `folderType` off the node, so search never sees them. `plain()` is the inverse, pinned
 * by test, for any future reader of a description.</p>
 */

const LOW_LINE = '̲';

/** `db` → `d̲b̲`: a combining low line after every character. */
export function underlined(text: string): string {
  return [...text].map((ch) => ch + LOW_LINE).join('');
}

/** The inverse — what a description said before it was underlined. */
export function plain(text: string): string {
  return text.split(LOW_LINE).join('');
}
