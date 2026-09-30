import { entryPinKey } from './pinSession';
import { SecretEnvelope, unlockSecret } from './secretEnvelope';

/**
 * How many wrong PINs an entry takes before it makes the person wait (entry-PIN plan, D16).
 *
 * <p>Before this module an unlocked, unattended window took guesses without limit: the box came back
 * after every miss, and scrypt's second per try was the only cost. Now <b>five wrong in a row</b>
 * start a wait of 30 s, <b>doubling</b> with every further miss up to a 15-minute cap; the right
 * PIN resets the count; <b>nothing is ever wiped</b> for a wrong PIN. The owner confirmed those
 * numbers on 2026-09-29.</p>
 *
 * <p><b>In memory only, on purpose.</b> Keyed exactly as the session grant is (`pinSession`) — per
 * entry in an account, per extension host — so a reload starts the count over. That is stated
 * honestly in the help: this slows guessing at a window somebody left open; it does not stop an
 * offline attacker with a copy of the vault, for whom scrypt is the cost. A persisted counter would
 * buy nothing against the second and would be one more thing to sync and to get wrong.</p>
 *
 * <p><b>`attemptUnlock` is the one choke point.</b> Every path that tries a PIN against an envelope
 * — the gate's box, the sibling checks, Remove PIN — goes through it, so no path can bypass the
 * count; `unlockSecret` itself is called from here and from nowhere else outside its own module.
 * While an entry is cooling it opens for nobody, the right PIN included, and spends no scrypt.</p>
 *
 * <p>Pure of `vscode`, and the clock is an argument, so the doubling is a test at exact instants.</p>
 */

/** Wrong PINs that cost nothing but the scrypt. The fifth starts the wait. */
export const FREE_TRIES = 5;
/** The first wait, after the fifth wrong PIN. */
export const FIRST_WAIT_MS = 30_000;
/** Doubling stops here. */
export const LONGEST_WAIT_MS = 15 * 60_000;

interface Attempts {
  /** Wrong PINs in a row since the last right one. */
  readonly wrong: number;
  /** When the current wait ends (ms epoch); at or before `now` means no wait. */
  readonly until: number;
}

/** account + entry -> the run of wrong PINs it has taken in this window. */
const attempts = new Map<string, Attempts>();

/** How long this entry still refuses every PIN, or 0 when it takes one. */
export function cooldownMs(accountId: string, entityId: string, now: number): number {
  const run = attempts.get(entryPinKey(accountId, entityId));
  return run === undefined ? 0 : Math.max(0, run.until - now);
}

/** One more wrong PIN. The wait it earns is decided here and nowhere else. */
export function noteWrong(accountId: string, entityId: string, now: number): void {
  const key = entryPinKey(accountId, entityId);
  const wrong = (attempts.get(key)?.wrong ?? 0) + 1;
  attempts.set(key, { wrong, until: now + waitAfter(wrong) });
}

/** The wait a run of `wrong` misses earns: none before the fifth, then 30 s doubling to the cap. */
function waitAfter(wrong: number): number {
  if (wrong < FREE_TRIES) {
    return 0;
  }
  return Math.min(LONGEST_WAIT_MS, FIRST_WAIT_MS * 2 ** (wrong - FREE_TRIES));
}

/** The right PIN. The run is over, and the next wrong one is a typo again. */
export function noteRight(accountId: string, entityId: string): void {
  attempts.delete(entryPinKey(accountId, entityId));
}

/** Everything at once — what the vault's own lock calls, and what the tests call between cases. */
export function forgetAllAttempts(): void {
  attempts.clear();
}

/**
 * The sentence a cooling entry answers with. It says that nothing was changed, because a wrong PIN
 * never wipes anything and a person who has just typed five of them is exactly the person who
 * needs to hear that.
 */
export function coolingReason(ms: number, entryName?: string): string {
  const who = entryName === undefined ? '' : ` for "${entryName}"`;
  return `Too many wrong PINs${who}. Nothing has been changed — try again in ${Math.ceil(ms / 1000)} s.`;
}

/**
 * ONE try of ONE PIN against ONE envelope — the choke point.
 *
 * <p>Answers the value or `undefined`, never throws: a wrong PIN is an answer here, and the layer
 * that must SAY it (`pinGate.askOnce`, `entityPin.openedSlots`) has the words. A cooling entry
 * answers `undefined` without trying, so a guess made through any path while the wait runs costs
 * the guesser the wait and costs this host nothing.</p>
 */
export async function attemptUnlock(
  envelope: SecretEnvelope,
  accountId: string,
  entityId: string,
  pin: string,
  now: number = Date.now(),
): Promise<string | undefined> {
  if (cooldownMs(accountId, entityId, now) > 0) {
    return undefined;
  }
  try {
    const value = await unlockSecret(envelope, accountId, pin);
    noteRight(accountId, entityId);
    return value;
  } catch {
    noteWrong(accountId, entityId, now);
    return undefined;
  }
}

/**
 * The PIN this window already GRANTED for the entry, tried again — which is not a guess.
 *
 * <p>The grant is a PIN the person typed and that opened this entry. Trying it on a second value is
 * what every silent gate behind a door does, and when that value is sealed under a different PIN (two
 * protects on two machines, mixed by a sync) it does not open. Counting that as a wrong attempt made
 * the sixth Edit of such an entry find it cooling, for a PIN nobody had typed wrong. So a miss here
 * counts nothing; the cooldown still applies (a cooling entry opens for nobody), and a hit still
 * resets the run, because the PIN is right.</p>
 */
export async function retryGranted(
  envelope: SecretEnvelope,
  accountId: string,
  entityId: string,
  pin: string,
  now: number = Date.now(),
): Promise<string | undefined> {
  return openUncounted(envelope, accountId, entityId, pin, now);
}

/** One try whose miss counts nothing: the cooldown still refuses, a hit still resets the run. */
async function openUncounted(
  envelope: SecretEnvelope,
  accountId: string,
  entityId: string,
  pin: string,
  now: number,
): Promise<string | undefined> {
  if (cooldownMs(accountId, entityId, now) > 0) {
    return undefined;
  }
  try {
    const value = await unlockSecret(envelope, accountId, pin);
    noteRight(accountId, entityId);
    return value;
  } catch {
    return undefined;
  }
}

/** One sibling a folder-wide PIN is tried on: the entry, and the first envelope it holds. */
export interface SiblingTry {
  readonly entityId: string;
  readonly envelope: SecretEnvelope;
}

/**
 * A SIBLING check (§5.10) — one typed PIN tried on one envelope of each protected entry in a folder,
 * answering how many it opened.
 *
 * <p>A PIN that opens NONE of them is one wrong attempt on EACH: it is a guess against every one. A
 * PIN that opens SOME charges nobody, because a folder may legitimately hold entries under two PINs
 * and the misses on the others are not guesses — the person typed a PIN that is right here. Callers
 * refuse before asking while any sibling is cooling (`coolingAmong`); a cooling sibling tried here
 * opens for nobody and is counted as not opened.</p>
 */
export async function attemptAcross(
  tries: readonly SiblingTry[],
  accountId: string,
  pin: string,
  now: number = Date.now(),
): Promise<number> {
  const opened = await countOpened(tries, accountId, pin, now);
  if (opened === 0) {
    chargeEach(tries, accountId, now);
  }
  return opened;
}

async function countOpened(tries: readonly SiblingTry[], accountId: string, pin: string, now: number): Promise<number> {
  let opened = 0;
  for (const one of tries) {
    opened += (await openUncounted(one.envelope, accountId, one.entityId, pin, now)) === undefined ? 0 : 1;
  }
  return opened;
}

function chargeEach(tries: readonly SiblingTry[], accountId: string, now: number): void {
  for (const one of tries) {
    noteWrong(accountId, one.entityId, now);
  }
}

/**
 * The first of these entries that is cooling, and for how long — or `undefined` when none is. A
 * sibling check refuses while any is: a cooling sibling opens for nobody, so the check would report
 * "opens none" and invite the person to seal a new entry under a PIN nothing verified.
 */
export function coolingAmong<T extends { readonly id: string }>(
  accountId: string,
  entries: readonly T[],
  now: number = Date.now(),
): { readonly entry: T; readonly ms: number } | undefined {
  for (const entry of entries) {
    const ms = cooldownMs(accountId, entry.id, now);
    if (ms > 0) {
      return { entry, ms };
    }
  }
  return undefined;
}
