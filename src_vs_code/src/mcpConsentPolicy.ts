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

const KEY = 'credSshManager.mcpConsentStamps';

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
  get(key: string): Record<string, ConsentStamp> | undefined;
  update(key: string, value: Record<string, ConsentStamp>): Thenable<void>;
}

/** An entry is unique to a vault and a window holds several, so the account is part of the name. */
export function stampKey(accountId: string, entityId: string): string {
  return `${accountId}:${entityId}`;
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
 * <p><b>One map, written through one queue.</b> `globalState.update` rewrites the whole record, so
 * two consents settling at the same moment each read the map, each add their own entry, and the
 * second write throws the first away — that entry then prompts again inside its own window. The
 * in-memory map is the source of truth and every write goes through a `SerialQueue`, so the second
 * writer composes onto the first's result rather than onto a copy it read before the first ran.</p>
 *
 * <p><b>The other WINDOW is deliberately not locked.</b> `leasedQueue.ts` exists for exactly this
 * shape — operations sharing a profile's `globalState` across VS Code windows — and it is the right
 * answer where losing a write loses data. Here it loses a stamp, and a lost stamp costs one extra
 * dialog: the failure is toward ASKING. Paying a file lock, a heartbeat and a status-bar notice so
 * that somebody is asked exactly as often as promised rather than once more is the wrong trade, and
 * it would put a cross-window wait in front of a call that is meant to be the quiet one.</p>
 */
export class ConsentStamps {
  private readonly writes = new SerialQueue();
  private cache: Record<string, ConsentStamp> | undefined;

  constructor(private readonly store: ConsentStampStore) {}

  /** The stamp for one entry, or nothing. Expired records are dropped on the way past. */
  get(key: string, now: number): ConsentStamp | undefined {
    const stamp = this.live()[key];
    // Expiry is arithmetic, never presence: a record still sitting in the store after thirteen
    // hours grants nothing, and the prune below only bounds the store's SIZE.
    return stamp !== undefined && stillOpen(stamp, now) ? stamp : undefined;
  }

  /** Record that a person answered a dialog for this entry, covering this ladder. */
  remember(key: string, rungs: string, now: number): Promise<void> {
    return this.writes.run(async () => {
      const next = prune({ ...this.live(), [key]: { at: now, rungs } }, now);
      this.cache = next;
      await this.store.update(KEY, next);
    });
  }

  /** What the Forget command clears — everything, on this machine, at once. */
  forgetAll(): Promise<void> {
    return this.writes.run(async () => {
      this.cache = {};
      await this.store.update(KEY, {});
    });
  }

  /** What is on record right now, read once and then kept — see the class docblock. */
  private live(): Record<string, ConsentStamp> {
    this.cache ??= readStamps(this.store.get(KEY));
    return this.cache;
  }
}

/**
 * The stored map, read defensively.
 *
 * <p>`globalState` holds whatever JSON was last written to it, by a build that may not be this one,
 * so the declared type is a description of what it OUGHT to contain. A record that is not a number
 * and a string is not half-repaired, it is dropped: the consequence of dropping one is a dialog.</p>
 */
function readStamps(raw: Record<string, ConsentStamp> | undefined): Record<string, ConsentStamp> {
  const entries = Object.entries(raw ?? {}).flatMap(([key, value]) => {
    const stamp = readStamp(value);
    return stamp === undefined ? [] : [[key, stamp] as const];
  });
  return Object.fromEntries(entries);
}

function readStamp(raw: unknown): ConsentStamp | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  return stampFields(raw as Record<string, unknown>);
}

/** Both fields or neither: a stamp missing its time is not a stamp with an unknown time. */
function stampFields(r: Record<string, unknown>): ConsentStamp | undefined {
  return typeof r.at === 'number' && typeof r.rungs === 'string' ? { at: r.at, rungs: r.rungs } : undefined;
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
