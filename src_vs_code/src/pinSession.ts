/**
 * The PIN a person has already typed for one entry, remembered for as long as this window lives.
 *
 * <p>Asking again for every field of the entry somebody just unlocked is how a prompt becomes a
 * reflex, and a prompt people type through without reading has stopped being a decision. So the
 * answer is remembered — and remembered in the smallest place that can hold it.</p>
 *
 * <p><b>What "smallest" means, exactly.</b> A module-level Map in the extension host: not
 * `globalState`, not `SecretStorage`, not a file. A grant that survives a reload is a PIN written
 * to disk, and the whole point of the wrap is that the PIN is in one person's head. Three reviewers
 * asked what the lifetime is, so it is written down here rather than implied:</p>
 *
 * <ul>
 *   <li><b>Per extension host.</b> A reload, a host restart and a crash each end every grant. Two
 *       windows of one profile hold two independent grants, because they are two processes.</li>
 *   <li><b>Read at the moment of USE.</b> A grant taken at the start of a long operation and spent
 *       at the end can be gone by then; callers ask here every time and treat a miss as a fresh
 *       question, never as a failure and never as corruption.</li>
 *   <li><b>No idle timer.</b> A timeout that re-asks mid-task trains people to type through the
 *       box. The vault's own lock is the timer that matters — `forgetAll` runs with it.</li>
 * </ul>
 *
 * <p>Pure of `vscode`, so the lifetime is a test rather than a claim.</p>
 */

/**
 * account + entry -> the PIN that opened it in this window.
 *
 * <p>Keyed by BOTH, and a reviewer was right to insist. Ids are UUIDs, so a collision is not an
 * accident — but a RESTORE puts one id into two profiles, which this repository already has a test
 * for elsewhere ("the flag is scoped to the account, because a restore can put one id into two
 * profiles"). A grant keyed by the id alone would carry one profile's PIN into another's entry, and
 * if the two PINs happened to match it would open silently.</p>
 */
const granted = new Map<string, string>();

/** The one place the composite key is spelled, so no caller can build a different one. */
function keyOf(accountId: string, entityId: string): string {
  return `${accountId}\u0000${entityId}`;
}

/** Remember what opened this entry. Called only after the PIN has actually opened something. */
export function grantPin(accountId: string, entityId: string, pin: string): void {
  granted.set(keyOf(accountId, entityId), pin);
}

/** The PIN for this entry, or nothing — and nothing means ASK, never "it failed". */
export function grantedPin(accountId: string, entityId: string): string | undefined {
  return granted.get(keyOf(accountId, entityId));
}

/**
 * Forget one entry's PIN.
 *
 * <p>Called when the entry stops being protected, when a PIN is replaced, and when a wrap refuses
 * to open with what is remembered — a stale grant that keeps failing is worse than no grant, since
 * it turns "type your PIN" into "this entry is broken".</p>
 */
export function forgetPin(accountId: string, entityId: string): void {
  granted.delete(keyOf(accountId, entityId));
}

/** Everything, at once: what the vault's own lock calls, and what a sign-out calls. */
export function forgetAllPins(): void {
  granted.clear();
}

/** How many grants are held — for the tests, and for a diagnostic that must never print a PIN. */
export function grantCount(): number {
  return granted.size;
}
