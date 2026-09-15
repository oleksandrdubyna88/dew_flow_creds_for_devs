import { COPY_ICON, escapeHtml } from './webviewHtml';
import { ShuffleCode, methodLabel } from './shuffle';

/**
 * The two-column row a woven value is read back through — for a card's field, and for a password.
 *
 * <p>Extracted from `paymentViewCard.ts` when the second consumer arrived, rather than copied. The
 * two would have drifted, and what they would then disagree about is what a woven value LOOKS like
 * — which is a disagreement about whether somebody can read their own secret back.</p>
 *
 * <h3>The rule the two rows are built around</h3>
 *
 * <p>A reassembly <b>hints at nothing</b>. Both rows are drawn identically, neither is marked, and
 * the order is the arithmetic's rather than a guess at which is likelier. They are numbered — First
 * and Second — and the ids are `a` and `b` rather than `real` and `decoy`: which column the
 * arithmetic calls which is the host's business, and a DOM that says `decoy` out loud is a hint
 * sitting one inspector away from the person this design defends against.</p>
 *
 * <p>Pure markup. No `vscode`, and nothing from the record: the values arrive by message.</p>
 */

/** What a method picker's Show asks for: the field rebuilt under the chosen method. */
export const REASSEMBLE_ACTION = 'reassemble';

export interface WovenRowOptions {
  /** The key the page and the host name this field by. */
  readonly key: string;
  /** What a person calls it — a constant of this build, never a stored value. */
  readonly label: string;
  /** The twelve methods, in the order this render drew them. */
  readonly methods: readonly ShuffleCode[];
  /** The sentence under the picker, before anything is rebuilt. */
  readonly note: string;
}

/**
 * A woven field: the methods, a Show, and two rows that start empty.
 *
 * <p>The method list is in a different ORDER every time (`methodOrder`), so that "the third one"
 * never becomes a habit worth forming. The NAME comes from the code (`methodLabel`), so the
 * shuffling costs nobody the one thing they have to remember.</p>
 */
export function wovenRowMarkup(options: WovenRowOptions): string {
  const label = escapeHtml(options.label);
  const key = escapeHtml(options.key);
  const picker = options.methods
    .map((code) => `<option value="${code}">${methodLabel(code)}</option>`)
    .join('');
  return `<div class="row wovenRow" data-key="${key}">
      <label>${label} — stored woven with a decoy</label>
      <div class="line">
        <select class="mixPick" data-key="${key}" aria-label="Method for ${label}">${picker}</select>
        <button data-field="${key}" data-action="${REASSEMBLE_ACTION}" class="icon" title="Rebuild ${label} under the chosen method" aria-label="Show ${label}">Show</button>
      </div>
      <div class="note payNote" id="payNote_${key}">${escapeHtml(options.note)}</div>
      <div class="readingRows" id="payRows_${key}" hidden>
        ${readingRow(key, 'a', label)}
        ${readingRow(key, 'b', label)}
      </div>
    </div>`;
}

/** One of the two rows. Deliberately identical in every respect a reader could use. */
function readingRow(key: string, which: 'a' | 'b', label: string): string {
  const ordinal = which === 'a' ? 'First' : 'Second';
  return `<div class="line readingLine">
          <div class="reading" id="payReading_${key}_${which}" aria-label="${ordinal} row for ${label}"></div>
          <button data-field="${key}|${which}" data-action="copyReading" class="icon" title="Copy the ${ordinal.toLowerCase()} row" aria-label="Copy the ${ordinal.toLowerCase()} row">${COPY_ICON}</button>
        </div>`;
}

/**
 * What the row says before anything is rebuilt — and what it must never say afterwards.
 *
 * <p>It used to end <i>"nothing here can tell you which one is yours, and that is deliberate"</i>,
 * and the build did not keep that promise. The real value is woven as the FIRST column, and every
 * host put the first reading in row one — so under the correct method row one was always yours, and
 * somebody working through the methods never had to read row two. The order is drawn per entry now,
 * which is what makes the sentence true; it says the size of what that buys rather than implying
 * more, because the method is still the only thing a person has to remember.</p>
 */
export const WOVEN_ROW_NOTE =
  'Pick a method and press Show. Both rows come back the same way whichever method you pick, and '
  + 'which of the two is drawn first is decided again each time you open this entry — so the '
  + 'position tells you nothing either. Only you can recognise your own value. The method is still '
  + 'the one thing that has to be remembered, and it is stored nowhere.';

/** The styles both consumers draw the rows with, so neither can style them differently. */
export const WOVEN_ROW_STYLES = `
  .wovenRow .readingLine { margin-top: 4px; align-items: center; }
  .reading { flex: 1; padding: 5px 7px; min-height: 1.4em; border-radius: 3px;
             background: var(--vscode-input-background); color: var(--vscode-input-foreground);
             border: 1px solid var(--vscode-input-border, transparent);
             font-family: var(--vscode-editor-font-family, monospace); word-break: break-all; }
  .reading .word { display: inline-block; margin-right: .5em; }
  .payNote { margin: 3px 0; }`;
