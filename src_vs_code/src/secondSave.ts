import { SecondKey, SecondValues, WeavePoint, secondKeyOf } from './secondValues';
import { SecondMode } from './secondModeMarkup';
import { pairRefusal } from './secondPair';

/**
 * What a save does with the second values a person typed — the rule, away from any form.
 *
 * <h3>The sharpest rule in the feature, and this is where it is true rather than promised</h3>
 *
 * <p>A second value that is WOVEN is not stored beside the pair. It becomes one half of the woven
 * string and lives nowhere else, because a reader of the vault holding both the pair and one half
 * can subtract to get the other, and the twelve methods would stop being twelve — they would stop
 * being anything. `secondRecordFor` drops every value a weave consumed, and its test reads back what
 * the save wrote rather than asking whether a decoy was generated: "the random was never called"
 * proves a decoy was not drawn and says nothing about whether the typed value was ALSO written.</p>
 *
 * <h3>An empty box means KEEP, never CLEAR</h3>
 *
 * <p>The rule an empty password box already follows (`wovenSave` answers `woven: wasWoven` for one).
 * Somebody editing an unrelated field leaves every box they did not come for untouched, and a save
 * that read those as deletions would lose secrets for free. Deleting is therefore something a person
 * says — the `clearSecond_*` box, offered only when there is something to clear.</p>
 *
 * <p>Pure: no `vscode`, no storage, no randomness.</p>
 */

/** Everything a save knows about the second half, gathered from one form. */
export interface SecondInput {
  /** Whose the other half is. One answer per form; only `own` reads a box. */
  readonly mode: SecondMode;
  /** What the boxes hold, exactly as typed. A key absent is a box nobody touched. */
  readonly typed: SecondValues;
  /** Which CLEAR boxes are ticked. */
  readonly cleared: readonly SecondKey[];
  /** The fields this save is about to weave — not the ones already woven. */
  readonly weaving: readonly WeavePoint[];
  /** What the record holds now, so an untouched box can keep it. */
  readonly stored: SecondValues;
}

/**
 * Why this save cannot happen, in a sentence a form can print — or `''` when it can.
 *
 * <p>Runs BEFORE the checksum gate, so a refused pair means nothing was woven rather than a card
 * woven under a method whose partner was then rejected. `first` is what each field holds now, which
 * is the half the typed one has to match.</p>
 */
export function refuseSecondPairs(
  first: Readonly<Partial<Record<WeavePoint, string>>>,
  labels: Readonly<Partial<Record<WeavePoint, string>>>,
  input: SecondInput,
): string {
  const judged = input.mode === 'own' ? input.weaving : [];
  // The FIRST refusal is the answer: a person fixes one thing at a time, and a paragraph listing
  // every field at once is a paragraph nobody reads to the end.
  return judged.map((point) => onePair(
    first[point] ?? '',
    input.typed[secondKeyOf(point)] ?? '',
    labels[point] ?? point,
  )).find((refusal) => refusal !== '') ?? '';
}

/**
 * One field: nothing typed is a refusal HERE and only here.
 *
 * <p>This is the one place "blank" is not "keep what is stored": the person chose to supply the other
 * half and supplied none, and the alternative — drawing a decoy behind their back — would store a
 * value they did not choose in a field they will later be asked to recognise. With the mode set to
 * `decoy` the same empty box means exactly what it says and never reaches here.</p>
 */
function onePair(first: string, second: string, label: string): string {
  if (second.length === 0) {
    return `You chose to supply the second ${label} yourself and the box is empty. Type it, or `
      + 'choose a decoy and one will be made for you. Nothing has been saved.';
  }
  return pairRefusal(first, second, label);
}

/**
 * The record to store: what was kept, what was typed, and NOTHING a weave consumed.
 *
 * <p>Total over the three answers a box can give — cleared, typed, untouched — so there is no state
 * in which the outcome depends on which branch happened to run first.</p>
 */
export function secondRecordFor(input: SecondInput): SecondValues {
  const gone = dropped(input);
  const kept = Object.entries({ ...input.stored, ...typedOnly(input) })
    .filter(([key]) => !gone.has(key));
  return Object.fromEntries(kept) as SecondValues;
}

/**
 * The keys this save removes: cleared by hand, or consumed by a weave.
 *
 * <p>Consumed is the one that matters. Somebody who stored a second PIN in the clear and later wove
 * the PIN with it must not leave the stored copy behind — that is exactly the half a reader would
 * subtract, and it would be the worst version of the defect, because the record would look
 * untouched.</p>
 */
function dropped(input: SecondInput): ReadonlySet<string> {
  const consumed = (input.mode === 'own' ? input.weaving : []).map((point) => secondKeyOf(point));
  return new Set<string>([...consumed, ...input.cleared]);
}

/** Only boxes somebody actually typed in: a blank one is not an empty value, it is silence. */
function typedOnly(input: SecondInput): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input.typed).filter(([, value]) => value.trim().length > 0),
  );
}
