import { DEFAULT_PASSPHRASE, generatePassphrase } from './secretGenerator';
import { copiedMessage } from './secretClipboard';

/**
 * The one-time PIN a share is sealed with — where it came from, and what may be said about it.
 *
 * <p>Pure, and deliberately so: the two decisions here are the kind that get written as a comment
 * and then quietly stop being true. First, that a generated share PIN is a PASSPHRASE and not a
 * password — `secretGenerator.ts` names this exact case in its own header, and the reason is not
 * entropy but the PIN's job: it crosses a chat, it may be read aloud, and the recipient retypes it
 * into `askSharePin` when the paste does not survive. Second, that nothing said about a PIN ever
 * carries the PIN. Both are `node:test` assertions in `sharePin.test.ts`.</p>
 *
 * <p><b>Why `generated` is carried rather than inferred.</b> The delivery message can only be
 * raised where the share is known to have landed, which is far from where the PIN was chosen, and
 * what it may offer differs completely between the two origins: a PIN the person invented is
 * already theirs, while one this extension drew exists nowhere but the clipboard. A boolean beside
 * a string would have been the same information with nothing keeping the two together.</p>
 */
export interface SharePin {
  readonly value: string;
  /** True when this extension drew it; false when the person typed or edited it. */
  readonly generated: boolean;
}

/** A PIN the person typed. */
export function typedPin(value: string): SharePin {
  return { value, generated: false };
}

/**
 * A PIN this extension drew: six four-letter words, 48 exact bits.
 *
 * <p>The options are COPIED rather than passed through. `DEFAULT_PASSPHRASE` is an exported
 * mutable object shared with the entry form, and a share PIN's shape must not depend on what some
 * other surface last did to it.</p>
 */
export function generateSharePin(): SharePin {
  return { value: generatePassphrase({ ...DEFAULT_PASSPHRASE }).value, generated: true };
}

/**
 * What the delivery message adds about the PIN, or '' when there is nothing to add.
 *
 * <p>Never the PIN itself. A notification is retained in the Notification Center until it is
 * dismissed, and `withheldNote` in the same method already refuses to put anything but field NAMES
 * there for that reason; a live transit secret is not the exception to that. Seeing the value is a
 * separate, deliberate act — the `Show PIN` modal — rather than something the person is given
 * whether they asked or not.</p>
 *
 * <p>The sentence itself is `copiedMessage`'s, so the clipboard promise is worded in exactly one
 * place. It is written in the present tense and is true when it is read, because the caller
 * re-copies the value immediately before showing it.</p>
 */
export function sharePinNotice(pin: SharePin, ttlMs: number): string {
  return pin.generated ? ` ${copiedMessage('It', ttlMs)}` : '';
}
