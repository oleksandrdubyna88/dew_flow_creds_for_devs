import { ShuffleCode, isShuffleCode, methodLabel } from './shuffle';
import { wovenPictureTokens } from './wovenPicture';
import { unweaveSecret } from './wovenSecret';
import { DisplayedPair, RowOrder, RowOrderStore, displayed, rowIn } from './rowFlip';

/**
 * The viewer's half of a woven password: what a Show or a Copy on those two rows is answered with.
 *
 * <p>Its own module rather than a branch inside `PaymentViewHost`, which is about a payment RECORD
 * — its grants, its assembled-phrase buffers, its form. What the two share is the page, the row and
 * the messages, and they share those directly. What they do NOT share is where the value comes
 * from: a card reads a field of a record, and this reads the entry's password.</p>
 *
 * <p><b>It says nothing about which row is which.</b> The host knows — the arithmetic calls one
 * `first` — and it must never pass that on: a wrong method answers in the same shape as a right
 * one, and anything marking either row would do the guessing for whoever is reading over the
 * person's shoulder. The same rule the card's readings follow, for the same reason.</p>
 *
 * <p>Pure of `vscode`: the read, the clipboard and the webview all arrive as functions.</p>
 */

/** The one field this answers for. A credential has one password and no record of fields. */
export const WOVEN_PASSWORD_KEY = 'password';

export interface WovenPasswordDeps {
  /** The entry the card is showing NOW — the preview tab is reused, so this is read per call. */
  readonly entityId: () => string;
  /** The stored value, woven. Read at the moment it is asked for, never held. */
  readonly read: () => Thenable<string | undefined>;
  readonly post: (message: unknown) => void;
  readonly copy: (text: string) => Promise<void>;
  /**
   * Which of the two readings is shown first, for this entry's password.
   *
   * <p>Injected rather than held here, so this module stays the set of pure functions its header
   * promises: the state belongs to the panel, which hands the SAME store to the card's host. A Show
   * and the Copy that follows it therefore read one order, and the order reaches no message.</p>
   */
  readonly orders: RowOrderStore;
}

/**
 * Answer one message, or say it was not ours.
 *
 * <p>Returns whether it WAS ours, so the panel's dispatch stays one line — the same shape
 * `PaymentViewHost.handle` has, and for the same reason.</p>
 */
export async function handleWovenPassword(
  type: string,
  field: string,
  deps: WovenPasswordDeps,
): Promise<boolean> {
  const [key, ...rest] = field.split('|');
  if (key !== WOVEN_PASSWORD_KEY || (type !== 'reassemble' && type !== 'copyReading')) {
    return false;
  }
  // Sampled BEFORE the await, and that order is the whole point. This panel is the shared preview
  // tab, so by the time the keychain answers, the entry on screen may be a different one — and an
  // id read afterwards would stamp THIS entry's password with THAT entry's id, which is precisely
  // the stamp the page trusts. Read first, and a stale answer is one the page drops.
  const entityId = deps.entityId();
  // Sampled BEFORE the await for the same reason the id above it is, and it is the same bug: the
  // panel can render another entry while the keychain is answering, which CLEARS the store — and an
  // order read afterwards would be a fresh draw, so a Copy would hand over the row this page is not
  // showing. Read here, and the copy follows what was on screen. (Code review, S3.)
  const order = deps.orders.orderFor(entityId, WOVEN_PASSWORD_KEY);
  const stored = await deps.read();
  await answer(type, rest, stored, entityId, order, deps);
  return true;
}

async function answer(
  type: string,
  rest: readonly string[],
  stored: string | undefined,
  entityId: string,
  order: RowOrder,
  deps: WovenPasswordDeps,
): Promise<void> {
  const code = codeIn(type, rest);
  // The rows, in the order sampled before the read, and read by BOTH branches below — so a Copy can
  // never resolve `a` against a different order from the one the Show drew.
  const shown = shownPair(stored, code, order);
  if (type === 'reassemble') {
    deps.post(readingMessage(entityId, code, shown, stored, order));
    return;
  }
  await copyRow(rest[0] ?? 'a', shown, entityId, deps);
}

/** The two readings in the order they will be DRAWN, or nothing when they cannot be rebuilt. */
function shownPair(
  stored: string | undefined,
  code: string,
  order: RowOrder,
): DisplayedPair<string> | undefined {
  const reading = readingOf(stored, code);
  return reading === undefined ? undefined : displayed(reading, order);
}

/** `reassemble` is sent as `password|<code>`; `copyReading` as `password|<a|b>|<code>`. */
function codeIn(type: string, rest: readonly string[]): string {
  return (type === 'reassemble' ? rest[0] : rest[1]) ?? '';
}

/** Copy one of the two rows — rebuilt here, never taken from the page. */
async function copyRow(
  which: string,
  shown: DisplayedPair<string> | undefined,
  entityId: string,
  deps: WovenPasswordDeps,
): Promise<void> {
  if (shown === undefined) {
    return;
  }
  // `b` is the SECOND ROW SHOWN, not the decoy. It used to be the decoy, which is how row a came to
  // be the person's value under every correct method while the page promised otherwise. The
  // mapping is `rowIn`'s, shared with the card's path, so the two cannot come to disagree.
  await deps.copy(rowIn(shown, which));
  // The same acknowledgement every other Copy in this viewer gets: the one button whose value
  // cannot be seen in a box must not also be the one that never says it worked.
  deps.post({ type: 'copied', entityId, field: `${WOVEN_PASSWORD_KEY}|${which}` });
}

/** The two readings, or nothing at all — a method this build has no name for is not a method. */
function readingOf(stored: string | undefined, code: string): { first: string; second: string } | undefined {
  return stored === undefined || !isShuffleCode(code) ? undefined : unweaveSecret(stored, code as ShuffleCode);
}

/**
 * What the page is told. The SAME message the card's readings use, so one script paints both.
 *
 * <p>`words: false` — a password is characters, and the page joins them; only a phrase is drawn one
 * word-node at a time. `visibleMs: 0` — nothing closes itself here, unlike an assembled phrase.</p>
 */
function readingMessage(
  entityId: string,
  code: string,
  shown: DisplayedPair<string> | undefined,
  stored: string | undefined,
  order: RowOrder,
): unknown {
  return shown === undefined
    ? { type: 'paymentReading', entityId, key: WOVEN_PASSWORD_KEY, code, ok: false, why: UNREADABLE }
    : {
        type: 'paymentReading',
        entityId,
        key: WOVEN_PASSWORD_KEY,
        code,
        ok: true,
        words: false,
        // The rows as drawn. Nothing here says which order produced them: the message has the same
        // keys, the same lengths and the same shape either way.
        first: [...shown.first],
        second: [...shown.second],
        // The stored value character by character, each tagged with the ROW it is in — built from
        // the SAME order the rows were, so the picture cannot contradict them. A password has no
        // layout of its own, so the default (vertical) is the right one.
        woven: wovenPictureTokens([...(stored ?? '')], code as ShuffleCode, order),
        // The name, never the code: every picker on every surface says `Method 4`.
        methodName: methodLabel(code as ShuffleCode),
        visibleMs: 0,
      };
}

/** What a refusal says: what happened, and that nothing was lost by it. */
const UNREADABLE =
  'This password cannot be rebuilt: what is stored is not a whole woven pair. Nothing has been '
  + 'changed — the entry is exactly as it was.';
