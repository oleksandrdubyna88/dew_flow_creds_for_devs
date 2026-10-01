import { attemptUnlock, cooldownMs, coolingReason, retryGranted } from './pinAttempts';
import { grantPin, grantedPin, forgetPin } from './pinSession';
import { SecretEnvelope, readSecret } from './secretEnvelope';
import type { StoredSecret } from './storedSecret';

/**
 * Opening one PIN-protected value for one operation the person just asked for.
 *
 * <p>The owner's rule, in their words: <i>"а остальные все операции — просто спрашивать ввести
 * пин"</i>. So the line this module draws is between an operation somebody CLICKED and one that
 * runs by itself. A click may ask. Nothing that runs by itself may — sync, a startup sweep, a tree
 * render and headless tooling have no window to ask in, and a prompt there would hang them.</p>
 *
 * <p>Those two answers are different and must stay different:</p>
 *
 * <ul>
 *   <li>a CLICK gets `askForPin`, which asks, remembers what worked, and hands back the value;</li>
 *   <li>anything automatic gets `automaticPinRefusal`, which returns a sentence and never a prompt
 *       — the same shape the woven password's refusal already has, so `FieldReading.withheld`
 *       carries it and no caller can spend it as a value.</li>
 * </ul>
 *
 * <p><b>A refusal is always SAID.</b> The defect this repository fixed a version ago was every
 * automatic path answering `string | undefined`, so "there is nothing here" and "there is something
 * here you may not have" arrived identically. Nothing here returns a bare `undefined` without the
 * caller having been given the words for it.</p>
 *
 * <p>Pure of `vscode`: the prompt arrives as a function, so every path is a unit test.</p>
 */

/** How a PIN is asked for. `undefined` means the person dismissed the box. */
export type AskPin = (prompt: string, entryName: string) => Thenable<string | undefined>;

export interface PinGate {
  readonly accountId: string;
  readonly entityId: string;
  readonly entryName: string;
  readonly ask: AskPin;
  /**
   * What the person is about to do, in the words the box says it: <i>"Enter it to copy its
   * password"</i>, <i>"… to edit it"</i>, <i>"… to save it"</i>. A box that names what pressing OK
   * will do is a decision; one that says "open this value" for a copy, an export and a save alike
   * is a reflex. Absent, the generic question is asked.
   */
  readonly purpose?: string;
  /**
   * A gate that never asks (`silentPinGate`). Its miss with the granted PIN is a fact about THAT
   * value — sealed under another PIN — and not a reason to drop the grant the door just took.
   */
  readonly silent?: boolean;
}

/** What opening a value produced. `cancelled` is a decision, not a failure — it says nothing more. */
export type PinOpen =
  | { readonly kind: 'value'; readonly value: string }
  | { readonly kind: 'unprotected'; readonly value: string | undefined }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'wrong'; readonly reason: string }
  /** Five wrong PINs in a row: nothing was tried and no box was raised — see `pinAttempts`. */
  | { readonly kind: 'cooling'; readonly reason: string }
  | { readonly kind: 'corrupt'; readonly reason: string };

/**
 * A gate that never asks: it opens only with the grant this window already holds, and answers
 * `cancelled` otherwise. For a path that runs AFTER a door admitted the entry — the share's withheld
 * notice, the export's opener — where a second box would be a second question about an entry the
 * person answered for a moment ago.
 */
export function silentPinGate(accountId: string, entityId: string, entryName: string): PinGate {
  return { accountId, entityId, entryName, silent: true, ask: () => Promise.resolve(undefined) };
}

/**
 * The stored string, opened — asking for the PIN only if this window has not been given it.
 *
 * <p>The grant is read HERE, at the moment of use, rather than being captured when an operation
 * started. A reviewer was right that a grant taken early and spent late can be gone by then; read
 * late, its absence is simply another question rather than a failure.</p>
 */
export async function openStored(stored: StoredSecret | string | undefined, gate: PinGate): Promise<PinOpen> {
  const read = readSecret(stored);
  if (read.kind === 'corrupt') {
    return { kind: 'corrupt', reason: corruptReason(gate.entryName, read.why) };
  }
  if (read.kind !== 'locked') {
    return { kind: 'unprotected', value: read.kind === 'value' ? read.value : undefined };
  }
  return openLocked(read.envelope, gate);
}

async function openLocked(envelope: SecretEnvelope, gate: PinGate): Promise<PinOpen> {
  const withRemembered = await openWithGrant(envelope, gate);
  if (withRemembered !== undefined) {
    return { kind: 'value', value: withRemembered };
  }
  if (gate.silent === true) {
    // Behind a door: the grant opened the entry a moment ago, so a value it does not open is sealed
    // under another PIN. That is said by the caller; the grant stays, and nothing was guessed.
    return { kind: 'cancelled' };
  }
  // A remembered PIN that no longer opens this entry is worse than none: it turns "type your PIN"
  // into "this entry is broken". Dropped, and the person is asked as if for the first time.
  forgetPin(gate.accountId, gate.entityId);
  return askOnce(envelope, gate);
}

/** The grant, tried — never counted as a wrong attempt (`retryGranted`): the person typed it right once. */
function openWithGrant(envelope: SecretEnvelope, gate: PinGate): Promise<string | undefined> {
  const remembered = grantedPin(gate.accountId, gate.entityId);
  return remembered === undefined ? Promise.resolve(undefined) : retryGranted(envelope, gate.accountId, gate.entityId, remembered);
}

/**
 * The box, once — after the one check that must come BEFORE it (D16): an entry that has taken five
 * wrong PINs in a row is refused without the box being raised at all, with the sentence that says
 * how long. Raising it anyway and refusing what is typed would spend the person's wait on a
 * question that cannot be answered.
 */
async function askOnce(envelope: SecretEnvelope, gate: PinGate): Promise<PinOpen> {
  const cooling = cooldownMs(gate.accountId, gate.entityId, Date.now());
  if (cooling > 0) {
    return { kind: 'cooling', reason: coolingReason(cooling, gate.entryName) };
  }
  const typed = await gate.ask(pinPromptFor(gate.purpose), gate.entryName);
  if (dismissed(typed)) {
    return { kind: 'cancelled' };
  }
  const opened = await tryPin(envelope, gate, typed);
  if (opened === undefined) {
    return { kind: 'wrong', reason: WRONG_PIN };
  }
  grantPin(gate.accountId, gate.entityId, typed);
  return { kind: 'value', value: opened };
}

/** Dismissed, or an empty box: either way there is nothing to try. */
function dismissed(typed: string | undefined): typed is undefined {
  return typed === undefined || typed.length === 0;
}

/** One attempt, through the choke point that counts it. A wrong PIN is an ANSWER here — the words belong to the layer that must report it. */
function tryPin(envelope: SecretEnvelope, gate: PinGate, pin: string): Promise<string | undefined> {
  return attemptUnlock(envelope, gate.accountId, gate.entityId, pin);
}

/** The generic question, or the one that names what the person is about to do (`PinGate.purpose`). */
export function pinPromptFor(purpose: string | undefined): string {
  return purpose === undefined
    ? PROMPT
    : `This entry is protected with its own PIN. Enter it to ${purpose}. It is remembered until this window closes or the vault locks.`;
}

const PROMPT = 'This entry is protected with its own PIN. Enter it to open this value.';

const WRONG_PIN =
  'That PIN does not open this entry. Nothing has been changed — try again, and remember there is '
  + 'no recovery for a forgotten entry PIN: the vault recovery code opens the VAULT, not an entry.';

/** The sentence a damaged wrap earns — exported so an automatic reader refuses one in the same words. */
export function corruptReason(entryName: string, why: string): string {
  return (
    `"${entryName}" holds a protected value that cannot be read: ${why} Nothing has been changed, `
    + 'and nothing here will overwrite it — a damaged wrap is the only copy of what was there.'
  );
}

/**
 * Why an AUTOMATIC path cannot have this value, or `''` when it can.
 *
 * <p>Never a prompt. The readers that reach this are sync, the tree, a startup sweep and headless
 * tooling, none of which has a window — and a modal there hangs the operation rather than asking
 * anybody anything.</p>
 */
export function automaticPinRefusal(stored: StoredSecret | string | undefined, entryName: string): string {
  return readSecret(stored).kind === 'locked' ? pinRefusalFor(entryName) : '';
}

/**
 * The sentence a protected entry earns, whatever established that it is protected.
 *
 * <p>Its own function because there are two ways to know. The WRAP inside a value is the truth and
 * is asked first. The entry's own MARK catches what the wrap cannot — a value that is plaintext at
 * this instant inside an entry that is protected — which `envApply.automaticFieldRefusal` asks
 * about. Two ways to know, one thing to say: a second wording would be two answers to one question.</p>
 */
export function pinRefusalFor(entryName: string): string {
  // D17: this used to end "from its General section", which has no such control — the command lives
  // on the tree row's context menu, and the sentence now says so.
  return `"${entryName}" is protected with its own PIN, so it cannot be used automatically. Open the `
    + 'entry and enter the PIN, or remove the PIN protection: right-click it and choose Remove PIN Protection….';
}

/**
 * Why NOTHING automatic may have this stored field of this entry, or `''` when it may — the wrap
 * first, the mark second, one sentence for both.
 *
 * <p>The WRAP is the truth and is asked first: a mark can be absent from an entry whose values are
 * locked, which is why nothing here has ever keyed on it alone. The MARK is asked as well because it
 * catches a state the wrap cannot — an entry marked protected whose stored value is, at this instant,
 * plaintext (a value written by an older build, or arriving from another machine). Either signal
 * refuses; that cannot under-refuse, it can only refuse something the wrap would have allowed.</p>
 *
 * <p>It lived inside `envApply.automaticFieldRefusal` and was extracted here (entry-PIN plan §5.4)
 * so the `creds://` reads, the TOTP reading and the SSH broker's key path ask the SAME question,
 * rather than each asking the wrap alone and forgetting the mark — the omission the code round of
 * 2026-09-12 found once, on the held-value road.</p>
 */
export function pinFieldRefusal(
  details: { readonly name: string; readonly pinProtected?: boolean },
  stored: StoredSecret | string | undefined,
): string {
  const locked = automaticPinRefusal(stored, details.name);
  if (locked !== '') {
    return locked;
  }
  // The same sentence the wrap earns, because it is the same fact about the same entry.
  return details.pinProtected === true ? pinRefusalFor(details.name) : '';
}
