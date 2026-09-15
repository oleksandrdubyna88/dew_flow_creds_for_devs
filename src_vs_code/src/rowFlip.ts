import { Random } from './decoyDigits';

/**
 * Which of a reading's two halves is shown FIRST — decided per entry, held here, told to nobody.
 *
 * <h3>The defect this exists for</h3>
 *
 * <p>A woven value is the person's value and a decoy interleaved, and the row they are read back
 * through says it cannot tell you which is which: <i>"nothing here can tell you which one is yours,
 * and that is deliberate"</i>. That was not true of the build. `weaveSecret` weaves the real value
 * as the FIRST column, `unweaveSecret` gives it back as `first`, both hosts put `first` into row
 * <b>a</b>, and `rowOf` mapped `b` to the decoy outright. Under the correct method, row one was
 * always yours — so somebody working through the twelve methods never had to read row two, and the
 * protection was twelve readings rather than twenty-four.</p>
 *
 * <p>This module makes the sentence true by drawing the order. One extra bit, and no more than
 * that: the METHOD is still the only real secret, and it is still stored nowhere.</p>
 *
 * <h3>Where the state lives, and for how long</h3>
 *
 * <p>One store per mounted viewer panel, constructed with that panel's random. An order is minted
 * on the FIRST ask for an `(entityId, key)` pair and answered from memory every time afterwards,
 * so pressing Show twice never swaps the rows under somebody's hands, and a Copy resolves `a`/`b`
 * against the same order the rows were drawn in. It is cleared when the panel renders another
 * entry and when the panel is disposed — for every kind of entry, not only a payment record, since
 * a credential's woven password is read through the same row and never passes through the card's
 * own reset.</p>
 *
 * <h3>The one way this must not be built</h3>
 *
 * <p><b>The order never leaves the host.</b> Not in a message, not in an id, not in a class, not in
 * a caption. The page's whole defence is that its DOM says `a` and `b` and nothing else; a `flip`
 * travelling in the reading answer would put the answer one inspector away from exactly the reader
 * this feature is built against, and deriving it page-side from a nonce fails the same way because
 * the derivation would be in the source. The host knows. That is the end of it.</p>
 *
 * <p>Pure: the randomness is a parameter and there is no `vscode` here, so every claim above is a
 * test rather than a hope.</p>
 */

/**
 * The two display orders.
 *
 * <p>Named for what they do to the ARITHMETIC's pair, not for what is in them — `swapped` does not
 * mean "the decoy is first", it means the second reading is shown first. Which of them holds the
 * person's value is a question this module cannot answer and must never look able to.</p>
 */
export type RowOrder = 'as-read' | 'swapped';

/** The two readings a method gives back, in the order the arithmetic produced them. */
export interface ReadingPair<T> {
  readonly first: T;
  readonly second: T;
}

/** Where the draw falls. Exported so a test can sit either side of it deliberately. */
export const SWAP_THRESHOLD = 0.5;

/**
 * The per-entry orders a viewer panel is holding right now.
 *
 * <p>A class rather than a module-level map: two panels must not share one, and a map that outlives
 * its panel is both a leak and a promise broken — re-opening an entry is exactly when the order
 * should be drawn afresh.</p>
 */
export class RowOrderStore {
  /**
   * Entry, then field.
   *
   * <p>Two maps rather than one joined key: a card holds several woven fields and they are drawn
   * independently, while two entries sharing a field name are two different secrets. Joining them
   * into one string would need a separator that cannot occur in either half, and picking one is a
   * question with no good answer — nesting has none of that and reads as what it is.</p>
   */
  private readonly orders = new Map<string, Map<string, RowOrder>>();

  public constructor(private readonly random: Random) {}

  /** This entry's order for this field — drawn once, then remembered. */
  public orderFor(entityId: string, key: string): RowOrder {
    const fields = this.orders.get(entityId) ?? new Map<string, RowOrder>();
    this.orders.set(entityId, fields);
    const known = fields.get(key);
    if (known !== undefined) {
      return known;
    }
    const drawn: RowOrder = this.random() < SWAP_THRESHOLD ? 'as-read' : 'swapped';
    fields.set(key, drawn);
    return drawn;
  }

  /** Forget everything: the panel is showing another entry, or is going away. */
  public clear(): void {
    this.orders.clear();
  }
}

/**
 * The pair as the rows will SHOW it.
 *
 * <p>Everything downstream — the message, the copy, the picture's colours — is built from what this
 * returns, which is what keeps them from disagreeing with each other. After this call there is no
 * function on the display path that knows which reading is the person's, and that is the point.</p>
 */
export function displayed<T>(pair: ReadingPair<T>, order: RowOrder): ReadingPair<T> {
  return order === 'swapped' ? { first: pair.second, second: pair.first } : pair;
}
