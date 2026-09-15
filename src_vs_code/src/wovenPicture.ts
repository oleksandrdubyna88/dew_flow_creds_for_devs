import { ShuffleCode, Slot, shuffleLayout } from './shuffle';
import { PhraseLayout, phraseColumns } from './phraseLayout';
import { ExampleToken } from './weaveExample';
import { RowOrder } from './rowFlip';

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
 */
export function wovenPictureTokens(
  stored: readonly string[],
  code: ShuffleCode,
  order: RowOrder,
  layout: PhraseLayout = 'vertical',
): readonly ExampleToken[] {
  const half = stored.length / 2;
  const rows = displayedRows(order, half);
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
 * The two rows' labels, in the order the arithmetic produced the readings.
 *
 * <p>Under `swapped` the arithmetic's first reading is drawn SECOND, so every token that came from
 * it belongs to the second row — which is the whole of what the order means here.</p>
 */
function displayedRows(order: RowOrder, length: number): { first: RowLabel[]; second: RowLabel[] } {
  const filled = (label: RowLabel): RowLabel[] => Array.from({ length }, () => label);
  return order === 'swapped'
    ? { first: filled('second'), second: filled('first') }
    : { first: filled('first'), second: filled('second') };
}
