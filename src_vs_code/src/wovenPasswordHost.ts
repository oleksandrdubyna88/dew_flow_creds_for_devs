import { ShuffleCode, isShuffleCode } from './shuffle';
import { unweaveSecret } from './wovenSecret';

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
  const stored = await deps.read();
  await answer(type, rest, stored, entityId, deps);
  return true;
}

async function answer(
  type: string,
  rest: readonly string[],
  stored: string | undefined,
  entityId: string,
  deps: WovenPasswordDeps,
): Promise<void> {
  const code = codeIn(type, rest);
  const reading = readingOf(stored, code);
  if (type === 'reassemble') {
    deps.post(readingMessage(entityId, code, reading));
    return;
  }
  await copyRow(rest[0] ?? 'a', reading, entityId, deps);
}

/** `reassemble` is sent as `password|<code>`; `copyReading` as `password|<a|b>|<code>`. */
function codeIn(type: string, rest: readonly string[]): string {
  return (type === 'reassemble' ? rest[0] : rest[1]) ?? '';
}

/** Copy one of the two rows — rebuilt here, never taken from the page. */
async function copyRow(
  which: string,
  reading: { first: string; second: string } | undefined,
  entityId: string,
  deps: WovenPasswordDeps,
): Promise<void> {
  if (reading === undefined) {
    return;
  }
  await deps.copy(which === 'b' ? reading.second : reading.first);
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
  reading: { first: string; second: string } | undefined,
): unknown {
  return reading === undefined
    ? { type: 'paymentReading', entityId, key: WOVEN_PASSWORD_KEY, ok: false, why: UNREADABLE }
    : {
        type: 'paymentReading',
        entityId,
        key: WOVEN_PASSWORD_KEY,
        code,
        ok: true,
        words: false,
        first: [...reading.first],
        second: [...reading.second],
        visibleMs: 0,
      };
}

/** What a refusal says: what happened, and that nothing was lost by it. */
const UNREADABLE =
  'This password cannot be rebuilt: what is stored is not a whole woven pair. Nothing has been '
  + 'changed — the entry is exactly as it was.';
