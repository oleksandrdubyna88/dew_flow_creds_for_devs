import { FieldReading, readingOf, withheld } from './fieldReading';
import { corruptReason, pinFieldRefusal } from './pinGate';
import { readSecret } from './secretEnvelope';
import { StoredSecret, carried } from './storedSecret';

/**
 * Opening one stored value for one operation — the seam a path that may be a CLICK or may be
 * AUTOMATIC takes, so the two answers are decided by whoever calls it and never by the path itself.
 *
 * <p>The entry-PIN plan (rules R1 and R2) draws one line: a click may ask for the PIN, nothing
 * automatic may. Most sinks are one or the other, and call `pinClick.clickedSecret` or
 * `pinGate.automaticPinRefusal` directly. A few are BOTH — the SSH credential is resolved for the
 * person's own Connect and for an agent's exec; a key is loaded into the SSH agent by a click and by
 * the startup sweep — and for those the opener is an argument, and `automaticOpener` is the default,
 * because the safe default is the one that never prompts and never hands out a sealed value.</p>
 *
 * <p>Pure of `vscode`: the click opener is built in `pinClick.ts`.</p>
 */

/** Whose value it is — the entry a PIN would be asked for, which is not always the entry clicked. */
export interface SecretOwner {
  readonly id: string;
  readonly name: string;
  readonly pinProtected?: boolean;
}

/**
 * What opening produced. `stopped.reason` is what the CALLER still has to say: the sentence for an
 * automatic refusal, and `''` for a click, whose opener has already said it (or the person declined).
 */
export type OpenedSecret =
  | {
      readonly kind: 'open';
      readonly value: string | undefined;
      /** The value was sealed, or its entry claims a PIN — so a file written from it is outside the PIN. */
      readonly protectedEntry: boolean;
    }
  | { readonly kind: 'stopped'; readonly reason: string };

/** Opens one stored value of `owner`. */
export type SecretOpener = (owner: SecretOwner, stored: StoredSecret | undefined) => Promise<OpenedSecret>;

/**
 * Nothing automatic asks, and nothing automatic is handed a value of a protected entry: a sealed
 * value — or any value of an entry that claims a PIN (`pinFieldRefusal`, the wrap first and the mark
 * second) — is refused with the sentence that says why, and a damaged wrap is refused as damaged. An
 * absent value is simply absent: there is nothing to withhold.
 */
export const automaticOpener: SecretOpener = (owner, stored) => Promise.resolve(automaticOpen(owner, stored));

function automaticOpen(owner: SecretOwner, stored: StoredSecret | undefined): OpenedSecret {
  const refusal = stored === undefined ? '' : pinFieldRefusal(owner, stored);
  return refusal === '' ? plainOpen(owner, stored) : { kind: 'stopped', reason: refusal };
}

/** A value that is not sealed: in the clear (a woven pair's envelope read as its value), or damaged. */
function plainOpen(owner: SecretOwner, stored: StoredSecret | undefined): OpenedSecret {
  const read = readSecret(stored);
  if (read.kind === 'corrupt') {
    return { kind: 'stopped', reason: corruptReason(owner.name, read.why) };
  }
  return { kind: 'open', value: read.kind === 'value' ? read.value : undefined, protectedEntry: false };
}

/**
 * What an opener's answer is to an AUTOMATIC consumer — `FieldReading`'s three answers, from
 * `OpenedSecret`'s two (`PLAN_typed_stored_secrets.md` §2.3).
 *
 * <p>`OpenedSecret` folds "absent" into `open` with no value, and the consumers this is for — a
 * `creds://` reference, the config route, a terminal variable, the broker — must tell absent from
 * withheld (`fieldReading.ts` says why). So: `stopped` is `withheld` with the opener's sentence, an
 * open value is a `value`, and an open nothing — or an empty string, as every one of them already
 * read it — is `absent`. For an automatic opener only: a click's stop carries `''`, because it has
 * already been said, and a withheld reading must carry its reason.</p>
 *
 * <p><b>`claimedBy`</b> — the entry, for the consumers that withhold EVERY field of an entry claiming a
 * PIN, held or not: a terminal variable and a `creds://` reference have answered a protected entry with
 * the PIN sentence whether or not that slot holds anything since the entry-PIN plan (`pinGate.pinFieldRefusal`
 * refuses on the mark alone; `pinSlotMatrix` holds it for every slot). The opener answers an absent value
 * as absent — nothing to withhold — so without the owner here those consumers would start telling the
 * world which fields a protected entry does not hold. Omitted, absent is absent (the broker's db query,
 * which says "no stored connection string" first).</p>
 */
export function fieldReadingOf(opened: OpenedSecret, claimedBy?: SecretOwner): FieldReading {
  if (opened.kind === 'stopped') {
    return withheld(opened.reason);
  }
  return opened.value === undefined && claimsPin(claimedBy) ? withheld(pinFieldRefusal(claimedBy, undefined)) : readingOf(opened.value);
}

function claimsPin(owner: SecretOwner | undefined): owner is SecretOwner {
  return owner?.pinProtected === true;
}

/**
 * The value as a PASSWORD can be judged, with no owner and nothing asked — or nothing at all.
 *
 * <p>For the health report, which reads every entry of the vault with no window to ask in and grades
 * what it reads. Only a value in the clear that is not woven is one: a sealed value is the ciphertext of
 * a random data key, a damaged wrap is envelope-shaped text, and a woven pair is the person's value
 * interleaved with a decoy — each of the three would be graded as a strong, unique password, the lie
 * `hygieneScan.ts` describes. Absent, sealed, woven and damaged all answer `undefined`.</p>
 */
export function plainText(stored: StoredSecret | undefined): string | undefined {
  const read = readSecret(stored);
  return read.kind === 'value' && !read.woven ? read.value : undefined;
}

/**
 * The stored text as it is, unless it is sealed — with no owner and nothing asked.
 *
 * <p>For the readers that look at what is stored without using it as a value: the output masker,
 * which masks everything it can see (`maskFailClosed` — a woven envelope and a damaged wrap included,
 * because the cost of masking a string no tool prints is nothing), and the tree's config-validity and
 * URL hints, which judge a body and must not judge a wrap. A sealed value is `undefined`: there is
 * nothing in it to mask or judge.</p>
 */
export function unsealedText(stored: StoredSecret | undefined): string | undefined {
  return readSecret(stored).kind === 'locked' ? undefined : carried(stored);
}
