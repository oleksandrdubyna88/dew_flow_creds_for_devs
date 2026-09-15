import { ShuffleCode, Slot, shuffleLayout } from './shuffle';
import { PhraseLayout, phraseColumns } from './phraseLayout';
import { ExampleToken } from './weaveExample';
import { RowOrder, displayed } from './rowFlip';

/**
 * The stored value, token by token, each marked with the ROW it is shown in.
 *
 * <p>The third column of the viewer's picture: your first row, your second row, and what is
 * actually stored — with every token of the stored value coloured by which of the two rows above it
 * came from. The form paints the same three columns on values it made up; this paints them on the
 * reading a person just asked for.</p>
 *
 * <h3>It holds no value and can name none</h3>
 *
 * <p>What travels through the arithmetic here is a pair of side LABELS, never the tokens. The
 * result is the stored tokens tagged `first` or `second`, meaning <b>the first row on screen</b> and
 * <b>the second row on screen</b> — never real and never decoy. This module imports neither
 * `phraseReassembly` nor `wovenSecret`, so it has no way to obtain the distinction it must not
 * make.</p>
 *
 * <h3>Two traps, both paid for by the rows disagreeing with their own colours</h3>
 *
 * <p><b>The display order.</b> The rows may be shown swapped (`rowFlip.ts`). Colouring by the
 * arithmetic's own sides while the rows were drawn from the swapped pair would paint column three
 * as the exact negative of the two rows beneath it — and a person reading the colours to decide
 * which row to copy would take the wrong one. The order is therefore an argument, applied to the
 * labels before they are woven.</p>
 *
 * <p><b>The horizontal layout.</b> Under `layout: 'horizontal'` the two woven COLUMNS are not the
 * two rows: each column is half of each phrase (`phraseLayout.ts`). Tagging straight from
 * `Slot.side` would then contradict the rows for every horizontal phrase record. So the labels are
 * put through `phraseColumns` — the same function the real weave puts the values through — and the
 * colours cannot disagree with the rows by construction rather than by a second piece of arithmetic
 * somebody has to keep in step.</p>
 *
 * <p>Pure, and `vscode`-free.</p>
 */

/** A row of the picture, named for where it is on screen. */
type RowLabel = Slot['side'];

/**
 * Which row each stored token is in.
 *
 * <p>`layout` defaults to `'vertical'`, which is the password's case: a password is one pair of
 * character columns and has no layout of its own. A phrase passes the layout it was woven under.</p>
 *
 * <p>`displayOrder` is the order the ROWS ARE DRAWN IN, never the order the arithmetic produced
 * them. Handing it the source order instead would invert every tag silently, which is the whole
 * failure this parameter exists to prevent — hence the name. (Code review, S2.)</p>
 */
export function wovenPictureTokens(
  stored: readonly string[],
  code: ShuffleCode,
  displayOrder: RowOrder,
  layout: PhraseLayout = 'vertical',
): readonly ExampleToken[] {
  // Odd, or too short to be a pair: a weave always produces 2N tokens, so this cannot have come
  // from one. Nothing is painted rather than a half-picture whose colours would be a guess — the
  // reading itself is refused for the same reason one step earlier (`unweaveSecret`).
  if (stored.length === 0 || stored.length % 2 !== 0) {
    return [];
  }
  const half = stored.length / 2;
  const rows = displayedRows(displayOrder, half);
  const columns = phraseColumns(rows.first, rows.second, layout);
  const sides: Readonly<Record<RowLabel, readonly RowLabel[]>> = {
    first: columns.first,
    second: columns.secondColumn,
  };
  return shuffleLayout(half, code).map((slot, at) => ({
    text: stored[at] ?? '',
    side: sides[slot.side][slot.index] ?? 'first',
  }));
}

/**
 * Which ROW each of the arithmetic's two readings ends up in, as a column of labels each.
 *
 * <p>The mapping is not written out a second time here: it is obtained by putting the two labels
 * through `displayed` — the same function the hosts put the readings through. A swap is its own
 * inverse, so asking "what is shown first" of the label pair answers "which row does the
 * arithmetic's first reading land in", which is precisely what is needed. Writing the `swapped`
 * branch again would be a second copy of the one rule this feature turns on, free to drift from the
 * host's copy while both kept compiling. (Code review, S2.)</p>
 */
function displayedRows(displayOrder: RowOrder, length: number): { first: RowLabel[]; second: RowLabel[] } {
  const labels = displayed<RowLabel>({ first: 'first', second: 'second' }, displayOrder);
  const filled = (label: RowLabel): RowLabel[] => Array.from({ length }, () => label);
  return { first: filled(labels.first), second: filled(labels.second) };
}
