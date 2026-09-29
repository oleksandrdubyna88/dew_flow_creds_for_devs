import { corruptReason, pinFieldRefusal } from './pinGate';
import { readSecret } from './secretEnvelope';

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
export type SecretOpener = (owner: SecretOwner, stored: string | undefined) => Promise<OpenedSecret>;

/**
 * Nothing automatic asks, and nothing automatic is handed a value of a protected entry: a sealed
 * value — or any value of an entry that claims a PIN (`pinFieldRefusal`, the wrap first and the mark
 * second) — is refused with the sentence that says why, and a damaged wrap is refused as damaged. An
 * absent value is simply absent: there is nothing to withhold.
 */
export const automaticOpener: SecretOpener = (owner, stored) => Promise.resolve(automaticOpen(owner, stored));

function automaticOpen(owner: SecretOwner, stored: string | undefined): OpenedSecret {
  const refusal = stored === undefined ? '' : pinFieldRefusal(owner, stored);
  return refusal === '' ? plainOpen(owner, stored) : { kind: 'stopped', reason: refusal };
}

/** A value that is not sealed: in the clear (a woven pair's envelope read as its value), or damaged. */
function plainOpen(owner: SecretOwner, stored: string | undefined): OpenedSecret {
  const read = readSecret(stored);
  if (read.kind === 'corrupt') {
    return { kind: 'stopped', reason: corruptReason(owner.name, read.why) };
  }
  return { kind: 'open', value: read.kind === 'value' ? read.value : undefined, protectedEntry: false };
}
