import { SecondKey, SecondValues, WeavePoint, secondKeyOf } from './secondValues';
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
 * <h3>The MODE is not here, and that is deliberate</h3>
 *
 * <p>"A decoy, or my own" is a control on a form, and one page carries two of them — the password's
 * and the payment section's — governing different fields. So the rule is handed the ANSWER rather
 * than the control: `ownWoven` names the fields being woven with the person's own half, and a form
 * left on `decoy` contributes none. That is also what makes the refusal below total: a field in
 * `ownWoven` must have a value and it must pair, whichever form it came from.</p>
 *
 * <p>Pure: no `vscode`, no storage, no randomness.</p>
 */

/** Everything a save knows about the second half, gathered from whatever forms are on the page. */
export interface SecondInput {
  /** What the boxes hold, exactly as typed. A key absent is a box nobody touched. */
  readonly typed: SecondValues;
  /** Which CLEAR boxes are ticked. */
  readonly cleared: readonly SecondKey[];
  /**
   * The fields this save is about to weave WITH THE PERSON'S OWN half.
   *
   * <p>Not "the fields being woven": one woven with a generated decoy consumes nothing the person
   * typed, so a value typed beside it is an ordinary second value and belongs in the record. And not
   * "the fields already woven" either — those are not being woven again and their boxes are not read
   * at all.</p>
   */
  readonly ownWoven: readonly WeavePoint[];
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
  // The FIRST refusal is the answer: a person fixes one thing at a time, and a paragraph listing
  // every field at once is a paragraph nobody reads to the end.
  return input.ownWoven.map((point) => onePair(
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
 * value they did not choose, in a field they will later be asked to recognise. A form left on `decoy`
 * contributes nothing to `ownWoven`, so the same empty box never reaches here.</p>
 */
function onePair(first: string, second: string, label: string): string {
  if (second.trim().length === 0) {
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
  return new Set<string>([...input.ownWoven.map((point) => secondKeyOf(point)), ...input.cleared]);
}

/** Only boxes somebody actually typed in: a blank one is not an empty value, it is silence. */
function typedOnly(input: SecondInput): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input.typed).filter(([, value]) => value.trim().length > 0),
  );
}
