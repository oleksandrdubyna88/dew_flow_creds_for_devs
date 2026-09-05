import { SharePayload } from './types';
import { lockSecret } from './secretEnvelope';
import { newPin } from './pinPrompt';

/**
 * What a PROTECTED share becomes at the far end.
 *
 * <p>The sending half is `sharePayloadBuild.ts`: it asks the sender for the entry's PIN and unwraps
 * every value, because a payload wrapped under a PIN nobody at the far end has is a payload nobody
 * can ever open. This is the other side of that decision — the copy arrives in the clear, so the
 * recipient is offered a PIN of their OWN before it is written anywhere.</p>
 *
 * <p><b>The wrap happens in memory, before a single write.</b> Three reviewers made the same point
 * about the obvious order (import, then protect): a crash between the two steps leaves an
 * unprotected copy on disk, which is exactly what "declining imports nothing" promises against.
 * Wrapped first, there is no moment at which that copy exists.</p>
 *
 * <p>Its own module because `shareInbox.ts` is at its ceiling, and because this is a decision about
 * a VALUE rather than about the conversation around accepting one.</p>
 */
/** What the recipient chose to do about a protection the sender had. */
type RecipientPin =
  | { readonly kind: 'none' }
  | { readonly kind: 'wrap'; readonly pin: string }
  | { readonly kind: 'declined' };

/**
 * The recipient’s own PIN, when the sender had this entry protected.
 *
 * <p>Their own, and the prompt says so: the sender's PIN was never sent and never will be — the
 * share was unwrapped before it travelled, because a payload wrapped under a PIN nobody at the far
 * end has is a payload nobody can ever open. Declining imports NOTHING: a person who protected an
 * entry did not agree to share it unprotected, and importing it in the clear would be the product
 * deciding that for them.</p>
 */
async function recipientPin(payload: SharePayload): Promise<RecipientPin> {
  if (payload.node.details?.pinAskOnImport !== true) {
    return { kind: 'none' };
  }
  const typed = await newPin(payload.node.name, RECIPIENT_PIN);
  return typed === undefined ? { kind: 'declined' } : { kind: 'wrap', pin: typed };
}

/**
 * The same payload with every secret wrapped, and the marks set for what it now is.
 *
 * <p>In memory, before a single write. That is what makes "declining imports nothing" true of a
 * crash as well as of a click: there is no moment at which an unprotected copy exists on disk.</p>
 */
async function wrappedPayload(
  payload: SharePayload,
  accountId: string,
  pin: string,
): Promise<SharePayload> {
  const secrets: Record<string, string | undefined> = {};
  for (const [slot, value] of Object.entries(payload.secrets)) {
    secrets[slot] = await lockedOrAsIs(value, accountId, pin);
  }
  return {
    ...payload,
    node: {
      ...payload.node,
      details:
        payload.node.details === undefined
          ? undefined
          // The instruction is SPENT: it has been acted on, so what the entry carries now is the
          // ordinary mark saying its values are wrapped — which is true of this copy.
          : { ...payload.node.details, pinAskOnImport: undefined, pinProtected: true },
    },
    secrets: secrets as SharePayload["secrets"],
  };
}

/** Why nothing was imported — said, because a silent nothing reads as a failure. */
export function declinedMessage(name: string): string {
  return (
    `"${name}" was not imported. The person who sent it had it protected with a PIN, and their PIN ` +
    'was never sent — so a copy here needs one of yours. Accept it again when you have chosen one.'
  );
}

const RECIPIENT_PIN =
  'The person who sent this had it protected with a PIN of their own. That PIN was never sent and '
  + 'cannot be — so choose one for YOUR copy. It is stored nowhere, and there is no way to recover it.';

/** One slot, wrapped — or left exactly as it is, because there is nothing there to wrap. */
async function lockedOrAsIs(
  value: unknown,
  accountId: string,
  pin: string,
): Promise<string | undefined> {
  if (typeof value !== 'string' || value.length === 0) {
    return typeof value === 'string' ? value : undefined;
  }
  return lockSecret(value, accountId, pin);
}

/**
 * The payload as it should ARRIVE, or nothing when the recipient declined a PIN it needs.
 *
 * <p>One step rather than three lines inside `acceptOne`, which is at its fifty-line budget — and
 * it reads better as one question anyway: what should land here, and is it allowed to.</p>
 */
export async function forThisRecipient(
  payload: SharePayload,
  accountId: string,
): Promise<SharePayload | undefined> {
  const own = await recipientPin(payload);
  if (own.kind === 'declined') {
    return undefined;
  }
  return own.kind === 'wrap' ? wrappedPayload(payload, accountId, own.pin) : payload;
}
