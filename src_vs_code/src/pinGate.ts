import { grantPin, grantedPin, forgetPin } from './pinSession';
import { SecretEnvelope, readSecret, unlockSecret } from './secretEnvelope';

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
}

/** What opening a value produced. `cancelled` is a decision, not a failure — it says nothing more. */
export type PinOpen =
  | { readonly kind: 'value'; readonly value: string }
  | { readonly kind: 'unprotected'; readonly value: string | undefined }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'wrong'; readonly reason: string }
  | { readonly kind: 'corrupt'; readonly reason: string };

/**
 * The stored string, opened — asking for the PIN only if this window has not been given it.
 *
 * <p>The grant is read HERE, at the moment of use, rather than being captured when an operation
 * started. A reviewer was right that a grant taken early and spent late can be gone by then; read
 * late, its absence is simply another question rather than a failure.</p>
 */
export async function openStored(stored: string | undefined, gate: PinGate): Promise<PinOpen> {
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
  const remembered = grantedPin(gate.entityId);
  const withRemembered = remembered === undefined ? undefined : await tryPin(envelope, gate, remembered);
  if (withRemembered !== undefined) {
    return { kind: 'value', value: withRemembered };
  }
  // A remembered PIN that no longer opens this entry is worse than none: it turns "type your PIN"
  // into "this entry is broken". Dropped, and the person is asked as if for the first time.
  forgetPin(gate.entityId);
  return askOnce(envelope, gate);
}

async function askOnce(envelope: SecretEnvelope, gate: PinGate): Promise<PinOpen> {
  const typed = await gate.ask(PROMPT, gate.entryName);
  if (typed === undefined || typed.length === 0) {
    return { kind: 'cancelled' };
  }
  const opened = await tryPin(envelope, gate, typed);
  if (opened === undefined) {
    return { kind: 'wrong', reason: WRONG_PIN };
  }
  grantPin(gate.entityId, typed);
  return { kind: 'value', value: opened };
}

/** One attempt. A wrong PIN is an ANSWER here — the throw belongs to the layer that must report it. */
async function tryPin(
  envelope: SecretEnvelope,
  gate: PinGate,
  pin: string,
): Promise<string | undefined> {
  try {
    return await unlockSecret(envelope, gate.accountId, pin);
  } catch {
    return undefined;
  }
}

const PROMPT = 'This entry is protected with its own PIN. Enter it to open this value.';

const WRONG_PIN =
  'That PIN does not open this entry. Nothing has been changed — try again, and remember there is '
  + 'no recovery for a forgotten entry PIN: the vault recovery code opens the VAULT, not an entry.';

function corruptReason(entryName: string, why: string): string {
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
export function automaticPinRefusal(stored: string | undefined, entryName: string): string {
  return readSecret(stored).kind === 'locked'
    ? `"${entryName}" is protected with its own PIN, so it cannot be used automatically. Open the `
      + 'entry and enter the PIN, or remove the PIN protection from its General section.'
    : '';
}
