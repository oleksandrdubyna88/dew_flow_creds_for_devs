import { McpAskPolicy } from './mcpAccess';
import { SerialQueue } from './serialQueue';
import { withinAllowWindow } from './agentConsent';

/**
 * Whether an agent's use of an entry must raise a dialog — and what this machine remembers about
 * the last time one was answered.
 *
 * <p>Two halves of one question. The POLICY is a person's standing answer and rides the vault
 * record, inherited from a folder like every other agent setting. The STAMP is a fact about this
 * machine — when a dialog was last answered here, and for which rungs — and it never leaves it.</p>
 *
 * <p><b>Why the stamp is local.</b> `commandTrust.ts` made this argument first and it carries
 * unchanged: a remembered answer stored on the entity would ride SYNC and a share, so whoever sends
 * you the entity also sends the record saying you already agreed. A trust flag the threat controls
 * is not a check. The policy itself can be synced because it is a SETTING somebody chose, and
 * because `shareFormat.ts` strips the whole `mcp` object out of a share; the stamp is evidence, and
 * evidence has to be local to mean anything.</p>
 *
 * <p><b>Why not `agentConsent.ts`.</b> That module decides the SSH agent's signature dialog and it
 * stores an absolute deadline fixed at the moment of the click, which is right for "allow for ten
 * minutes" — changing the constant must not extend a window already granted. A policy is read fresh
 * at every call, so what has to be stored is the START: flipping a folder from twelve hours to
 * every-time must take effect at once, and flipping it back must not retroactively authorise
 * anything. One shared comparison is borrowed (`withinAllowWindow`) and the shapes stay apart.</p>
 *
 * <p>Pure and `vscode`-free — the clock is an argument and the storage is passed in.</p>
 */

/** One prompt covers twelve hours: a working day either side of lunch, and never a whole one. */
export const ASK_WINDOW_MS = 12 * 60 * 60_000;

/**
 * How many stamps stay on record, after the expired ones have gone.
 *
 * <p>Mirrors `MAX_GRANTS` rather than the tombstone cap: sixty-four entries consented inside one
 * twelve-hour window is reachable for somebody with a large vault and an agent doing real work,
 * and 256 records is about 30 KB — a ceiling nobody meets and a bound that exists.</p>
 */
export const MAX_STAMPS = 256;

/** Where the record lives. Exported so a test reads it back rather than spelling it again. */
export const STAMPS_KEY = 'credSshManager.mcpConsentStamps';

/**
 * When Forget was last run on this machine — and the reason a second key exists.
 *
 * <p>Clearing the map is not enough on its own. Another window that had already READ the map before
 * the clear can finish its own write afterwards and put the forgotten stamp back; the read is
 * serialised within a window, and windows do not share a queue. Rather than take a cross-window
 * file lock for a write whose only ordinary cost is one extra dialog, a revocation leaves a mark:
 * every stamp at or before it is ignored for good, so a resurrected record answers nothing.</p>
 *
 * <p>Written BEFORE the map is cleared, so a crash between the two leaves the stricter half.</p>
 */
const FORGOTTEN_KEY = 'credSshManager.mcpConsentForgotten';

/**
 * When a dialog was last answered for one entry, and what it covered.
 *
 * <p><b>`rungs` is why this is a record and not a timestamp.</b> The dialog grants every action of
 * the entry's kind, so a window keyed on the entry alone would let a rung turned on an hour later
 * ride in on an answer given before it existed. It is compared against the ladder resolved at the
 * moment of the call, never against the one stored beside it.</p>
 */
export interface ConsentStamp {
  at: number;
  rungs: string;
}

/** The subset of `Memento` this needs, so the rules test without an editor. As `TrustStore`. */
export interface ConsentStampStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

/**
 * An entry is unique to a vault and a window holds several, so the account is part of the name.
 *
 * <p><b>Length-prefixed rather than joined by a separator.</b> `a:b` + `c` and `a` + `b:c` produce
 * the same joined string, and the consequence of a collision here is that consent for one account's
 * entry silences another's. Ids are uuids today and the collision is unreachable today; an
 * injective encoding costs one number and does not depend on that staying true.</p>
 */
export function stampKey(accountId: string, entityId: string): string {
  return `${accountId.length}:${accountId}:${entityId}`;
}

/**
 * Must this call raise a dialog?
 *
 * <p>The policy is read fresh every time and the stamp only matters under `every12h`, so there is
 * no state machine between the three answers — changing the setting takes effect on the next call
 * rather than the next window.</p>
 */
export function consentDue(
  policy: McpAskPolicy,
  stamp: ConsentStamp | undefined,
  rungsNow: string,
  now: number,
): boolean {
  if (policy === 'never') {
    return false;
  }
  if (policy !== 'every12h') {
    return true;
  }
  return !covers(stamp, rungsNow, now);
}

/** Does this stamp still cover a call — the same grant, and inside its window? */
function covers(stamp: ConsentStamp | undefined, rungsNow: string, now: number): boolean {
  if (stamp === undefined || stamp.rungs !== rungsNow) {
    return false;
  }
  return stillOpen(stamp, now);
}

function stillOpen(stamp: ConsentStamp, now: number): boolean {
  return withinAllowWindow(windowEnd(stamp, now), now);
}

/**
 * When the window this stamp opened runs out — or nothing, when it opened none.
 *
 * <p><b>A stamp from the FUTURE opens nothing</b>, and that single comparison is the most
 * security-relevant line here. `globalState` is a plain file this user's own processes can write,
 * so a value ahead of `now` would keep a credential usable unattended for as long as somebody cared
 * to set it. It also closes both directions of clock skew for free: a machine clock set BACK puts
 * every existing stamp in the future, and they are all discarded. A value that is not a number
 * fails the same comparison, because `NaN` is not less than or equal to anything.</p>
 *
 * <p>Every one of those is a test, not an argument.</p>
 */
function windowEnd(stamp: ConsentStamp, now: number): number | undefined {
  const at = stamp.at;
  return typeof at === 'number' && at <= now ? at + ASK_WINDOW_MS : undefined;
}

/**
 * This machine's record of the dialogs answered on it.
 *
 * <p><b>Nothing is cached, and that is the design rather than an omission.</b> Every read goes to
 * the store and every write composes onto a read taken INSIDE the queue. A cached map would be
 * faster and would break the one control this feature offers: Forget. With a cache, a second window
 * holding a stale map both suppresses prompts using a stamp that has been forgotten and, on its
 * next write, restores that stamp over the emptied store — silent use after an explicit
 * revocation, which is a different thing from being asked once too often.</p>
 *
 * <p><b>One queue, for the window's own concurrency.</b> `globalState.update` rewrites the whole
 * record, so two consents settling at the same moment each read the map, each add their own entry,
 * and the second write throws the first away — that entry then prompts again inside its own window.
 * Serialising the writes means the second one reads after the first has written.</p>
 *
 * <p><b>The other WINDOW is still not locked, and the residue is one dialog.</b> `leasedQueue.ts`
 * exists for this shape and is the right answer where losing a write loses data; here the only race
 * left is a read that crossed another window's write, which costs a prompt and cannot suppress one.
 * Paying a file lock, a heartbeat and a status-bar wait to be asked exactly as often as promised
 * rather than once more would put a cross-window wait in front of the call that is meant to be the
 * quiet one.</p>
 *
 * <p><b>Reverting a policy does not invalidate a stamp</b>, and that is a decision. Tightening an
 * entry to every-time and then setting `every12h` again inside the window reuses the earlier
 * answer — which is what `every12h` says: the person was asked, less than twelve hours ago. A
 * policy generation would have to live either on the record, where it SYNCS and a machine that
 * never saw the tightening resurrects it anyway, or on the machine, where it drifts exactly like
 * the stamp it was meant to fence.</p>
 */
export class ConsentStamps {
  private readonly writes = new SerialQueue();

  constructor(private readonly store: ConsentStampStore) {}

  /** The stamp for one entry, or nothing — read from the store, every time. */
  get(key: string, now: number): ConsentStamp | undefined {
    const stamp = this.live()[key];
    // Expiry is arithmetic, never presence: a record still sitting in the store after thirteen
    // hours grants nothing, and the prune below only bounds the store's SIZE.
    return stamp !== undefined && stillOpen(stamp, now) ? stamp : undefined;
  }

  /** Record that a person answered a dialog for this entry, covering this ladder. */
  remember(key: string, rungs: string, now: number): Promise<void> {
    return this.writes.run(async () => {
      // Read INSIDE the queue. Reading outside it is how the second of two concurrent writes
      // composes onto a map taken before the first one ran, and how a window that has been open
      // for an hour writes back a record another window forgot.
      await this.store.update(STAMPS_KEY, prune({ ...this.live(), [key]: { at: now, rungs } }, now));
    });
  }

  /**
   * What the Forget command clears — everything, on this machine, at once.
   *
   * <p>All of it rather than one entry, because that is the control this offers: taking back one
   * entry's window is what changing its policy already does, and the policy is read at every call.
   * The mark goes down first — see `FORGOTTEN_KEY`.</p>
   */
  forgetAll(now: number): Promise<void> {
    return this.writes.run(async () => {
      await this.store.update(FORGOTTEN_KEY, now);
      await this.store.update(STAMPS_KEY, {});
    });
  }

  /** What is on record right now — read fresh, for the reason in the class docblock. */
  private live(): Record<string, ConsentStamp> {
    return readStamps(this.store.get(STAMPS_KEY), this.store.get(FORGOTTEN_KEY));
  }
}

/**
 * The one stamp store a given `Memento` gets, for as long as anything holds that `Memento`.
 *
 * <p><b>The memo is not an optimisation.</b> Two `ConsentStamps` over one store are two
 * `SerialQueue`s, and the queue above is the whole of what stops the second of two concurrent
 * writes composing onto a map read before the first one ran. It is also how a command — Forget —
 * reaches the same instance as the broker's hooks without a handle threaded through the window's
 * activation, which is a file that may not grow.</p>
 *
 * <p><b>The key is the object's IDENTITY, not its type.</b> A `WeakMap`'s type parameter is erased
 * at run time, and `vscode.Memento` satisfies {@link ConsentStampStore} structurally, so a window
 * passing `context.globalState` finds exactly what it stored under it. A caller that builds a fresh
 * object each time gets a fresh store, correctly — it IS a different store. `WeakMap` rather than
 * `Map` so a store nothing else holds is not kept alive by this module.</p>
 *
 * <p>It lives HERE rather than beside the broker's hooks because it is a consent-policy question:
 * a Forget that constructed its own `ConsentStamps` would queue against a different queue from the
 * one that writes stamps, which is the single thing this memo exists to prevent.</p>
 *
 * <p><b>What no memo can do is serialise one window against another.</b> `globalState` is
 * machine-wide, each window holds its own copy, and the last update written wins — so two windows
 * remembering different entries in the same moment can cost one of them its stamp. That costs one
 * more dialog, never a consent that should not have been granted, and the dangerous direction is
 * closed elsewhere: a stale window writing its map back cannot resurrect what a Forget cleared,
 * because `forgetAll` writes the tombstone first and `wasForgotten` drops every record taken at or
 * before it. What remains is that a window whose own copy has not yet seen the tombstone keeps
 * honouring its own stamps until it does.</p>
 */
const STAMP_STORES = new WeakMap<ConsentStampStore, ConsentStamps>();

export function consentStampsFor(store: ConsentStampStore): ConsentStamps {
  const known = STAMP_STORES.get(store);
  if (known !== undefined) {
    return known;
  }
  const made = new ConsentStamps(store);
  STAMP_STORES.set(store, made);
  return made;
}

/**
 * The stored map, read defensively.
 *
 * <p>`globalState` holds whatever JSON was last written to it, by a build that may not be this one,
 * so the declared type is a description of what it OUGHT to contain. A record that is not a number
 * and a string is not half-repaired, it is dropped: the consequence of dropping one is a dialog.</p>
 */
function readStamps(raw: unknown, forgottenAt: unknown): Record<string, ConsentStamp> {
  const forgotten = typeof forgottenAt === 'number' && Number.isFinite(forgottenAt) ? forgottenAt : undefined;
  const entries = Object.entries((raw ?? {}) as Record<string, unknown>).flatMap(([key, value]) => {
    const stamp = readStamp(value);
    return stamp === undefined || wasForgotten(stamp, forgotten) ? [] : [[key, stamp] as const];
  });
  return Object.fromEntries(entries);
}

/** A stamp taken at or before the last Forget was revoked, whoever writes it back afterwards. */
function wasForgotten(stamp: ConsentStamp, forgottenAt: number | undefined): boolean {
  return forgottenAt !== undefined && stamp.at <= forgottenAt;
}

function readStamp(raw: unknown): ConsentStamp | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  return stampFields(raw as Record<string, unknown>);
}

/**
 * Both fields or neither: a stamp missing its time is not a stamp with an unknown time.
 *
 * <p>`Number.isFinite` rather than `typeof === 'number'`, which admits `NaN` and the infinities.
 * The window arithmetic downstream already refuses all three — `NaN` fails every comparison and
 * `-Infinity` produces a deadline already past — but that is emergent, and a guard whose
 * correctness depends on the behaviour of a function in another module is a guard somebody will
 * change. Rejecting the value where it is read makes it structural.</p>
 */
function stampFields(r: Record<string, unknown>): ConsentStamp | undefined {
  const { at, rungs } = r;
  return typeof at === 'number' && Number.isFinite(at) && typeof rungs === 'string' ? { at, rungs } : undefined;
}

/**
 * Expired first, then oldest — and in that order for a reason.
 *
 * <p>Capping before expiring would drop a window somebody is still inside while a record that
 * stopped meaning anything hours ago kept its place. Updating a key that is already there evicts
 * nothing, because the replacement happens before this runs and the count does not grow.</p>
 */
function prune(map: Record<string, ConsentStamp>, now: number): Record<string, ConsentStamp> {
  const live = Object.entries(map).filter(([, stamp]) => stillOpen(stamp, now));
  return Object.fromEntries(live.length <= MAX_STAMPS ? live : newestFirst(live).slice(0, MAX_STAMPS));
}

/** Newest first, so taking the head is keeping the newest and dropping the oldest. */
function newestFirst(entries: (readonly [string, ConsentStamp])[]): (readonly [string, ConsentStamp])[] {
  return [...entries].sort((a, b) => b[1].at - a[1].at);
}

/**
 * Does this policy remember anything at all?
 *
 * <p>Only `every12h` consults a stamp, so only `every12h` is worth writing one for: an entry set to
 * ask every time would put a record in `globalState` on every consent that nothing ever reads, and
 * one set to never ask never reaches a dialog. Asked HERE rather than spelled at the write site,
 * because a fourth cadence added to `consentDue` and not to that comparison would be a policy whose
 * dialog is answered and never remembered — asked again forever, with nothing failing.</p>
 */
export function remembersConsent(policy: McpAskPolicy): boolean {
  return policy === 'every12h';
}
