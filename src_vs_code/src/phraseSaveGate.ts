import { PaymentFields, pickPaymentFields } from './paymentFields';
import { PhraseLayout, layoutRefusal, layoutsFor, phraseColumns, phraseRefusal } from './phraseLayout';
import { ShuffleCode, isShuffleCode, SHUFFLE_CODES, shuffleTokens } from './shuffle';
import { WordlistId, isWordlistId, wordsOf } from './wordlists';
import { Random } from './decoyDigits';
import { generateDecoyPhrase } from './decoyPhrase';

/**
 * What a phrase save writes — and what it refuses to write.
 *
 * <p>The record is `mixed` (the woven tokens, as an ARRAY and never a joined string), the layout and
 * the two wordlists. Its own presence is what marks it woven — see `wovenKeys` — so `hasMixedField`
 * is true and the edit guard fires. <b>The words themselves are stored nowhere</b>, which is the whole
 * point: what is kept is the phrase and its second column shuffled together, and the method that would
 * separate them again lives only in the person's memory.</p>
 *
 * <p><b>Refusals come BEFORE anything is woven</b>, for the reason S4.4 recorded: a refusal after a
 * filled-in form is the failure being prevented, and after the weave there is no original left to
 * compare anything against.</p>
 *
 * <p>Pure: no `vscode`, and the randomness is a parameter.</p>
 */

/** The form's phrase boxes, read and typed. */
export interface PhraseInput {
  readonly words: readonly string[];
  /** The second column as TYPED. Empty unless `ownWords` — a decoy is drawn, not typed. */
  readonly second: readonly string[];
  readonly ownWords: boolean;
  readonly listFirst: WordlistId;
  readonly listSecond: WordlistId;
  readonly layout: PhraseLayout;
  readonly code: ShuffleCode;
}

/** The default list, and the default everything: an unset select is not a reason to refuse a save. */
const DEFAULT_LIST: WordlistId = 'bip39-en';

/**
 * The boxes off the save payload.
 *
 * <p>Every value is checked rather than trusted — the payload crosses a webview boundary, and a
 * `<select>` posting a list this build does not have would otherwise reach `wordlistOf` and throw
 * inside a save. Unknown values fall back; they never refuse, because a refusal here would be about
 * our own defaults rather than about anything the person did.</p>
 */
export function phraseInputFrom(data: Record<string, unknown>): PhraseInput {
  const code = text(data, 'phraseMethod');
  return {
    words: wordsOf(text(data, 'phraseWords')),
    second: wordsOf(text(data, 'phraseSecond')),
    ownWords: text(data, 'phraseSecondMode') === 'own',
    listFirst: listOf(data, 'phraseListFirst'),
    listSecond: listOf(data, 'phraseListSecond'),
    layout: text(data, 'phraseLayout') === 'horizontal' ? 'horizontal' : 'vertical',
    code: isShuffleCode(code) ? code : SHUFFLE_CODES[0],
  };
}

/**
 * Why this cannot be saved, in a sentence — or `''` when it can.
 *
 * <p>A generated decoy is always the phrase's own length, so the pair check for that case is the
 * phrase against itself: what it is really testing is the 6–50 range, which is the half a decoy
 * cannot fix. Only an own-words column can be the wrong LENGTH, and that is the case somebody pastes
 * their way into.</p>
 */
export function phraseRefusalFor(input: PhraseInput): string {
  if (input.words.length === 0) {
    return '';
  }
  const pair = phraseRefusal(input.words, input.ownWords ? input.second : input.words);
  return pair !== '' ? pair : layoutCheck(input);
}

/** A layout the count cannot carry — the arithmetic the form already removes from the list. */
function layoutCheck(input: PhraseInput): string {
  return layoutsFor(input.words.length).includes(input.layout) ? '' : layoutRefusal(input.words.length);
}

/**
 * The record to store.
 *
 * <p>Callers check `phraseRefusalFor` first. This throws only where `generateDecoyPhrase` does —
 * loudly and by design, because an unbounded search in a save path is a hung window rather than a
 * test failure — and the gate runs a build of its own so that failure is a refusal rather than an
 * exception out of a save.</p>
 *
 * <p><b>The decoy is drawn HERE and only here</b>, on a save that is actually going through. A
 * refusal, a declined confirmation or a second attempt never leaves a spent decoy behind, and the one
 * that is stored is the one this call made.</p>
 */
export function phraseRecordFor(input: PhraseInput, random: Random): PaymentFields {
  if (input.words.length === 0) {
    return {};
  }
  const second = input.ownWords
    ? input.second
    : generateDecoyPhrase({ words: input.words, from: input.listFirst, to: input.listSecond }, random);
  const columns = phraseColumns(input.words, second, input.layout);
  return pickPaymentFields({
    mixed: shuffleTokens(columns.first, columns.secondColumn, input.code),
    layout: input.layout,
    wordlistFirst: input.listFirst,
    wordlistSecond: input.listSecond,
    ownWords: input.ownWords,
    // No `shuffledFields` entry, and that is the design rather than an omission: `mixed` is not a
    // field that got woven, it IS the woven phrase, so its PRESENCE is the mark (`wovenKeys`).
    // Naming it there would be pruned by `pickPaymentFields` anyway — `SHUFFLEABLE_KEYS` excludes
    // it, and the compiler enforces that list.
  });
}

function text(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : '';
}

function listOf(data: Record<string, unknown>, key: string): WordlistId {
  const value = data[key];
  return isWordlistId(value) ? value : DEFAULT_LIST;
}
