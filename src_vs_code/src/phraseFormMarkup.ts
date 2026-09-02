import { WORDLIST_IDS, wordlistLabel } from './wordlists';
import { SHUFFLE_CODES } from './shuffle';
import { PHRASE_RANGE } from './shuffle';

/**
 * The phrase form: two columns, a wordlist for each, a layout, and the method that will be kept
 * nowhere.
 *
 * <p>The third form of a payment instrument, and the one the selector has been offering since the
 * kind shipped while nothing stood behind it — choosing <i>Phrase</i> left the selector alone on
 * screen and saved an entry with an empty record. This is that missing half.</p>
 *
 * <p><b>Nothing stored is written into this markup</b>, exactly as the card and bank fieldsets do
 * not write theirs. There is nothing to prefill in any case: a saved phrase is woven, and a woven
 * record cannot be opened for editing at all (`mixedFieldGuard`) — the form would have nothing to put
 * where the original belongs, and saving would weave the woven value a second time.</p>
 *
 * <p>Pure: no `vscode`.</p>
 */
export function phraseMarkup(openSection: (id: string) => string): string {
  return `  ${openSection('phraseSection')}
${firstColumn()}
${secondColumn()}
${weaveControls()}
  </fieldset>
`;
}

/** The phrase itself, and the list it is written in. */
function firstColumn(): string {
  return `    <label for="phraseWords">The phrase</label>
    <textarea id="phraseWords" rows="4" spellcheck="false" autocomplete="off"
              placeholder="the words, separated by spaces or newlines"></textarea>
    <p class="hint" id="phraseCount"></p>

    <label for="phraseListFirst">Wordlist</label>
    <select id="phraseListFirst">${listOptions()}</select>
    <p class="hint">The list decides what a decoy is drawn from and how the checksum is read — it is
    a property of the PHRASE, not of a network. Bitcoin, Ethereum and Solana seeds are all BIP-39
    English.</p>`;
}

/**
 * The second column: a generated decoy, or words of your own.
 *
 * <p>Two real keys in one entry is a deliberate option and a sharp one: it doubles what a single
 * assembled view reveals, which is said here rather than in a document nobody opens.</p>
 */
function secondColumn(): string {
  return `    <label for="phraseSecondMode">Second column</label>
    <select id="phraseSecondMode">
      <option value="decoy">A decoy, generated for you</option>
      <option value="own">My own words — a second real key, or a phrase I choose</option>
    </select>
    <p class="hint" id="phraseSecondNote"></p>

    <div id="phraseOwnBox" style="display:none">
      <label for="phraseSecond">The second column's words</label>
      <textarea id="phraseSecond" rows="4" spellcheck="false" autocomplete="off"></textarea>
      <p class="hint" id="phraseSecondCount"></p>
      <label for="phraseListSecond">Wordlist for the second column</label>
      <select id="phraseListSecond">${listOptions()}</select>
    </div>`;
}

/** The layout, the method, and the bargain nobody should meet for the first time at save time. */
function weaveControls(): string {
  return `    <label for="phraseLayout">Layout</label>
    <select id="phraseLayout">
      <option value="vertical">One under the other</option>
      <option value="horizontal">Side by side</option>
    </select>
    <p class="hint" id="phraseLayoutNote"></p>

    <label for="phraseMethod">Weaving method</label>
    <select id="phraseMethod">${methodOptions()}</select>
    <p class="hint"><b>The method is never stored</b> — not in this vault, not in a backup, not in
    the sync. Nobody can unweave the phrase but you, from memory, and a forgotten method is a lost
    phrase. Write down which one you chose, somewhere this vault is not.<br>
    A phrase is between ${PHRASE_RANGE.min} and ${PHRASE_RANGE.max} words. Weaving protects against
    somebody <b>reading</b> an open vault; it does nothing against somebody who can try every
    method, and there are only twelve of them.</p>`;
}

/** Every list, by the name a person recognises rather than by its id. */
function listOptions(): string {
  return WORDLIST_IDS.map(
    (id) => `<option value="${id}">${wordlistLabel(id)}</option>`,
  ).join('');
}

/** The twelve methods, numbered — the same shape the card's picker uses. */
function methodOptions(): string {
  return SHUFFLE_CODES.map((code, index) => `<option value="${code}">Method ${index + 1}</option>`).join('');
}
