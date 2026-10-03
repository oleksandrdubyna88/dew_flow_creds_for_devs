import * as crypto from 'node:crypto';
import { NOTHING_OPENED } from './editPrefill';
import { entityKey } from './entityFlags';
import { lockedSlotCount } from './entityPin';
import { CommitGuard, EntryWriter, writerFor } from './entryWriter';
import type { LeasedQueue } from './leasedQueue';
import { openStored, silentPinGate } from './pinGate';
import { grantedPin } from './pinSession';
import { Sealing, UpdateDoors, isMarked, sealingForUpdate, unattendedSealing } from './sealingAtWrite';
import { plainText } from './secretOpener';
import { rotationQuarantineSecretKey } from './secretKeys';
import type { SecretChest } from './secretMaps';
import type { RotationSlot } from './secretRotation';
import { plainSecret } from './secretEnvelope';
import type { StorageManager } from './storageManager';
import { StoredSecret, carried, stored } from './storedSecret';

/**
 * A rotated value the vault could not store, kept on this machine until the entry's PIN is entered
 * (`research/PLAN_rotation_quarantine.md`).
 *
 * <p>A rotation changes the far side FIRST and stores after. An entry protected with a PIN while the
 * statement ran refuses the unattended store — nothing automatic holds a PIN — and until this module the
 * only copy of a password the far side already accepted lived in process memory behind a modal. Now the
 * refusal writes it HERE: one keychain item per entry, beside the entry and outside its slots, which the
 * entry-PIN door (`pinAdmission.admit`) puts into the entry, sealed, the next time the PIN is entered.</p>
 *
 * <p><b>Outside the entry, on purpose</b> (plan §4.1). The item is not a slot: it is in neither
 * `entitySlots.SECRET_SLOTS` nor `secretMaps.SECRET_KINDS`, so Protect, Remove PIN, the door's walk, the
 * revision snapshot, Restore, sync, backup, export, a share and import never see it — R3 holds because a
 * protected ENTRY is never written in the clear, and this is not the entry. It IS in
 * `secretKeys.ENTITY_KEY_BUILDERS`, so everything that deletes an entry's keys deletes it. Its protection is
 * the OS keychain's alone — the protection an unprotected entry's password has — for the time between the
 * refused store and the next PIN (§3, the owner's accepted trade-off).</p>
 *
 * <p><b>Who reaches it.</b> Only this module: `StorageManager.quarantine` is the one field that holds the
 * store, and `rotationQuarantineBoundary.test.ts` fails when anything but this file, `secretKeys.ts` and that
 * field names the key builder or the store. A held value is a `StoredSecret` minted at this module's own
 * parse boundary and never handed out — the release writes it through `entryWriter.writerFor`.</p>
 *
 * <p><b>The local index</b> (§4.2). The keychain cannot be listed and the tree cannot await, so a LOCAL,
 * never-synced `globalState` key holds the `[accountId, entityId]` pairs that have an item — ids only. Index
 * first, item second at a hold; item first, index second at a release: the one torn state is an index
 * entry without an item, which every reader drops.</p>
 */

/** One held value: the stored form, when the rotation ran (UTC epoch ms), and what it replaced. */
export interface Held {
  readonly value: StoredSecret;
  readonly at: number;
  /** The fingerprint of the slot's text the rotation replaced — the release refuses to overwrite anything else. */
  readonly was: Fingerprint;
}

/** What one entry's item holds, by slot — a password hold and a connection-string hold never overwrite each other. */
export type HeldSlots = Readonly<Partial<Record<RotationSlot, Held>>>;

/** The never-synced `globalState` key of the index — the `PENDING_KEY` precedent (`pendingCleanup.ts`). */
export const QUARANTINE_INDEX_KEY = 'credSshManager.rotationQuarantine';

/** One indexed entry. */
export interface HeldEntry {
  readonly accountId: string;
  readonly entityId: string;
}

/** Just enough of `vscode.Memento` for the index. */
export interface IndexState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

/**
 * The item's own keychain verbs and the index — a narrow port, not the slot setters (plan §4.1). Every WRITE
 * runs under the storage's cross-window lease (`StorageManager.writes`, re-entrant), and a compound step that
 * reads and then writes holds the lease itself, so it is one step to another window. A plain `read` is one
 * keychain `get`, atomic on its own, and takes no lease: the door pays it on every open of every entry, and a
 * cross-window file lock per click would be the cost of a feature that is almost always empty.
 */
export interface QuarantineStore {
  read(accountId: string, entityId: string): Promise<HeldSlots>;
  /** Writes the record — or deletes the item when it holds nothing. */
  put(accountId: string, entityId: string, slots: HeldSlots): Promise<void>;
  /** The index: every pair that may have an item. A hint — an item is read before it is believed. */
  listed(): Promise<readonly HeldEntry[]>;
  list(accountId: string, entityId: string): Promise<void>;
  unlist(accountId: string, entityId: string): Promise<void>;
  /**
   * Tell the person what an automatic use stored, in the words THIS storage's window gave (`announceReleasesWith`) —
   * nothing until then. Per store, never per module: two storages never hear each other (the code round, 2026-10-03).
   */
  announce(released: readonly ReleasedValue[]): void;
  announceWith(say: (released: readonly ReleasedValue[]) => void): void;
}

/** The store over the profile's keychain and local state — made once, by `StorageManager`. */
export function quarantineStore(chest: SecretChest, state: IndexState, writes: LeasedQueue): QuarantineStore {
  const key = rotationQuarantineSecretKey;
  let say: (released: readonly ReleasedValue[]) => void = () => undefined;
  return {
    announce: (released) => say(released),
    announceWith: (words) => {
      say = words;
    },
    read: async (a, e) => heldOf(await chest.get(key(a, e))),
    put: (a, e, slots) => writes.run(() => Promise.resolve(isEmpty(slots) ? chest.delete(key(a, e)) : chest.store(key(a, e), serialised(slots)))),
    listed: () => Promise.resolve(indexOf(state)),
    list: (a, e) => writes.run(() => Promise.resolve(state.update(QUARANTINE_INDEX_KEY, [...without(indexOf(state), a, e), { accountId: a, entityId: e }]))),
    unlist: (a, e) => writes.run(() => Promise.resolve(state.update(QUARANTINE_INDEX_KEY, nonEmpty(without(indexOf(state), a, e))))),
  };
}

function isEmpty(slots: HeldSlots): boolean {
  return Object.keys(slots).length === 0;
}

function without(entries: readonly HeldEntry[], accountId: string, entityId: string): HeldEntry[] {
  return entries.filter((entry) => entry.accountId !== accountId || entry.entityId !== entityId);
}

/** An empty index is no key at all, as `PENDING_KEY`'s is. */
function nonEmpty(entries: readonly HeldEntry[]): readonly HeldEntry[] | undefined {
  return entries.length === 0 ? undefined : entries;
}

/** The index as stored, every malformed pair dropped — it is only ever a hint. */
function indexOf(state: IndexState): readonly HeldEntry[] {
  const raw = state.get<unknown>(QUARANTINE_INDEX_KEY);
  return Array.isArray(raw) ? raw.filter(isHeldEntry) : [];
}

function isHeldEntry(value: unknown): value is HeldEntry {
  const entry = value as Partial<HeldEntry> | null;
  return typeof entry?.accountId === 'string' && typeof entry.entityId === 'string';
}

// ---- the hold (plan §4.3) ----

/**
 * What a held value replaced, as the release compares it — never the text itself: the item holds the new
 * value, not the old one. The text replaced is a PASSWORD (or a connection string carrying one), so its
 * fingerprint is a memory-hard derivation, as the entry's own seal is: scrypt of the slot's text (`''` for an
 * empty slot) under 16 random bytes drawn for each hold, the cost written beside it so it can be raised later
 * (CodeQL js/insufficient-password-hash on PR #179, replacing the salted HMAC of the security review's
 * finding 6 — a fast hash, so an offline guessing check on the replaced password for whoever can read the
 * keychain item). Derived on Node's thread pool (`crypto.scrypt`, never the synchronous one), about 32 ms at
 * the cost below; a hold pays it once and a door once per held slot.
 *
 * <p>`unknown` is a hold whose fingerprint this build cannot check — a record written by a development build
 * of this feature (v1: plain SHA-256, v2: HMAC-SHA-256), never released. It is still HELD (never a silent
 * drop, never a plaintext orphan), and nothing automatic releases it: the door asks the person (a conflict).</p>
 */
export type Fingerprint = ScryptFingerprint | UnknownFingerprint;

export interface ScryptFingerprint {
  readonly kdf: 'scrypt';
  readonly N: number;
  readonly r: number;
  readonly p: number;
  /** 16 random bytes, hex. */
  readonly salt: string;
  /** The derived key, 32 bytes, hex. */
  readonly key: string;
}

export interface UnknownFingerprint {
  readonly kdf: 'unknown';
}

export const UNKNOWN_FINGERPRINT: UnknownFingerprint = { kdf: 'unknown' };

/** scrypt's cost for a new hold: 16 MiB and ~32 ms — slow for a guesser, cheap for one hold and one door. */
const COST = { N: 2 ** 14, r: 8, p: 1 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export async function fingerprintOf(text: string | undefined): Promise<Fingerprint> {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  return { kdf: 'scrypt', ...COST, salt, key: (await derived(text, salt, COST)).toString('hex') };
}

/** Whether `text` is what the fingerprint was taken of — compared in constant time. An unknown fingerprint matches nothing. */
export async function matchesFingerprint(was: Fingerprint, text: string | undefined): Promise<boolean> {
  if (was.kdf !== 'scrypt') {
    return false;
  }
  const now = await derived(text, was.salt, was);
  const kept = Buffer.from(was.key, 'hex');
  return now.length === kept.length && crypto.timingSafeEqual(now, kept);
}

/** scrypt on the thread pool, its memory bound to what the cost needs. */
function derived(text: string | undefined, salt: string, cost: { readonly N: number; readonly r: number; readonly p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(text ?? '', Buffer.from(salt, 'hex'), KEY_BYTES, { N: cost.N, r: cost.r, p: cost.p, maxmem: 2 * 128 * cost.N * cost.r }, (error, key) =>
      error === null ? resolve(key) : reject(error),
    );
  });
}

/**
 * Keep a value the far side accepted and the entry refused, beside the entry — index FIRST, item second, one
 * step under the lease. The last value wins: a second hold of the same slot overwrites the first, because the
 * far side holds the latest. Stored in its plain stored form (`plainSecret`), minted by `heldFor`.
 */
export async function holdRotated(storage: StorageManager, accountId: string, entityId: string, slot: RotationSlot, value: string, was: Fingerprint): Promise<void> {
  const store = storage.heldRotations;
  await storage.writes.run(async () => {
    await store.list(accountId, entityId);
    await store.put(accountId, entityId, { ...(await store.read(accountId, entityId)), [slot]: heldFor(value, was) });
  });
}

/** The held form of a value the rotation drew — minted here, as the parse mints what it reads. */
function heldFor(value: string, was: Fingerprint): Held {
  return { value: stored(plainSecret(value, false)), at: Date.now(), was };
}

/**
 * The rotation's own value LANDED in the entry: any older hold of that slot is superseded — the far side
 * holds the newer value, and a door must never overwrite it with the older one. Best-effort: a hold left
 * behind by a failed drop is still refused by the release, whose `was` no longer matches the slot.
 */
export async function supersedeHeld(storage: StorageManager, accountId: string, entityId: string, slot: RotationSlot): Promise<void> {
  const store = storage.heldRotations;
  await storage.writes
    .run(async () => {
      const { [slot]: superseded, ...rest } = await store.read(accountId, entityId);
      if (superseded !== undefined) {
        await settle(store, accountId, entityId, rest);
      }
    })
    .catch(() => undefined);
}

/** Write what is left — item first, then the index entry when nothing is (the release order, §4.2). */
async function settle(store: QuarantineStore, accountId: string, entityId: string, rest: HeldSlots): Promise<void> {
  await store.put(accountId, entityId, rest);
  if (isEmpty(rest)) {
    await store.unlist(accountId, entityId);
  }
}

/**
 * The entries a bundle apply REMOVES — an older backup restored, a sync that no longer carries them — own a
 * held item that no bundle carries and no tombstone names (the security review, finding 7a): the apply
 * deleted their kinds and left the item, a plaintext value in the keychain nothing would ever look for.
 * Item first, then the index entry, under the lease; a failure propagates like the apply's other deletes,
 * and the apply's pending-cleanup record then finishes it on the next sweep.
 */
export async function forgetHeld(storage: StorageManager, accountId: string, entityIds: readonly string[]): Promise<void> {
  for (const entityId of entityIds) {
    await storage.writes.run(() => settle(storage.heldRotations, accountId, entityId, {}));
  }
}

// ---- the release (plan §4.4, §4.5) ----

/** A slot whose held value is now in the entry — sealed under its PIN, or plain in an unprotected entry. */
export interface ReleasedSlot {
  readonly slot: RotationSlot;
  readonly at: number;
  readonly sealed: boolean;
}

/** A held value NOT written because the slot changed after the rotation — the person decides (§4.6). */
export interface HeldConflict {
  readonly slot: RotationSlot;
  readonly at: number;
}

/** What a release did. Ids and times only — never a value. */
export interface Release {
  readonly released: readonly ReleasedSlot[];
  readonly conflicts: readonly HeldConflict[];
}

export const NOTHING_RELEASED: Release = { released: [], conflicts: [] };

/**
 * How a release decides whether it seals — the proof its write is made under (`sealingAtWrite.ts` makes
 * every one; this only chooses which).
 */
export type ReleaseProof = (storage: StorageManager, accountId: string, entityId: string, entryName: string) => Promise<Sealing>;

/**
 * At the door, just after it admitted the entry: `sealingForUpdate` — reused, its decision table is the
 * release's — with doors that ASK NOTHING: the live door answers the grant the door just took, the first-PIN
 * road answers nothing. A sealed slot seals with the grant (R3: sealed in memory, committed under the lease);
 * no sealed slot and no mark writes plain, re-checked under the lease; marked over nothing stops.
 */
export const AT_THE_DOOR: ReleaseProof = (storage, accountId, entityId) => sealingForUpdate(storage, accountId, entityId, true, releaseDoors(accountId, entityId));

/**
 * Without a door — the startup sweep, a pulled sync, *Remove PIN Protection…*: the unattended proof, exactly
 * the store the rotation would have made. Plain only for an entry with no sealed slot and no mark; anything
 * protected stops, because nothing automatic holds a PIN, even one this window was given.
 */
export const UNATTENDED: ReleaseProof = (storage, accountId, entityId, entryName) => unattendedSealing(storage, accountId, { id: entityId, name: entryName });

function releaseDoors(accountId: string, entityId: string): UpdateDoors {
  return { door: () => Promise.resolve(grantedPin(accountId, entityId)), firstPin: () => Promise.resolve(undefined) };
}

/**
 * Put every value held beside this entry into it — per slot, in an order where a crash at any point loses
 * nothing (§4.4): read the item; open the live slot silently; equal to the held value → an earlier release
 * wrote it and died before dropping it, so only the drop is left; changed since the rotation (`was`) → a
 * conflict, nothing written; otherwise the write, through `writerFor` under `proof`; and only after the
 * write LANDED, under the lease, the slot is dropped from the item — if its `at` is still the one released.
 *
 * <p>Best-effort, like the door's other repairs: a release that fails is never a failure to open, the item is
 * kept, and the next door tries again. `force` names slots whose conflict the person settled for the rotated
 * value (*Store the rotated one*). No lease is held across anything slow: the sealing writer seals outside it.</p>
 */
export async function releaseHeld(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  entryName: string,
  proof: ReleaseProof = AT_THE_DOOR,
  force: readonly RotationSlot[] = [],
): Promise<Release> {
  return releaseAll({ storage, accountId, entityId, entryName, proof }, force).catch(() => NOTHING_RELEASED);
}

/** One slot after the other: each write takes its own proof and its own lease, never two at once. */
async function releaseAll(at: ReleaseAt, force: readonly RotationSlot[]): Promise<Release> {
  const held = await at.storage.heldRotations.read(at.accountId, at.entityId);
  const outcomes: SlotOutcome[] = [];
  for (const slot of SLOTS) {
    outcomes.push(await releaseOne(at, slot, held[slot], force.includes(slot)));
  }
  return combined(outcomes);
}

/** Where a release runs: the entry, and the proof its writes are made under. */
interface ReleaseAt {
  readonly storage: StorageManager;
  readonly accountId: string;
  readonly entityId: string;
  readonly entryName: string;
  readonly proof: ReleaseProof;
}

/** One slot's outcome — `kept` says nothing: the item stays and the next door tries again. */
type SlotOutcome = { readonly kind: 'released'; readonly slot: ReleasedSlot } | { readonly kind: 'conflict'; readonly conflict: HeldConflict } | { readonly kind: 'kept' };

const KEPT: SlotOutcome = { kind: 'kept' };

function combined(outcomes: readonly SlotOutcome[]): Release {
  return {
    released: outcomes.flatMap((outcome) => (outcome.kind === 'released' ? [outcome.slot] : [])),
    conflicts: outcomes.flatMap((outcome) => (outcome.kind === 'conflict' ? [outcome.conflict] : [])),
  };
}

async function releaseOne(at: ReleaseAt, slot: RotationSlot, held: Held | undefined, forced: boolean): Promise<SlotOutcome> {
  const text = held === undefined ? undefined : plainText(held.value);
  if (held === undefined || text === undefined) {
    // Nothing held, or a held value that is not plain text this build wrote (sealed, woven, damaged):
    // refused, and kept — it is never written anywhere.
    return KEPT;
  }
  return releaseText(at, slot, held, text, forced).catch(() => KEPT);
}

async function releaseText(at: ReleaseAt, slot: RotationSlot, held: Held, text: string, forced: boolean): Promise<SlotOutcome> {
  const live = await liveText(at, slot);
  if (live === UNREADABLE) {
    return KEPT;
  }
  if (live.text === text) {
    return finished(at, slot, held, live.sealed);
  }
  return (await changedSince(live.text, held, forced)) ? { kind: 'conflict', conflict: { slot, at: held.at } } : written(at, slot, held, text, live.raw);
}

/**
 * The slot no longer holds what the rotation replaced — and the person has not chosen the rotated value
 * anyway. A fingerprint this build cannot check counts as changed: the person is asked, nothing is overwritten.
 */
async function changedSince(live: string | undefined, held: Held, forced: boolean): Promise<boolean> {
  return !forced && !(await matchesFingerprint(held.was, live));
}

/**
 * The write, under the proof and GUARDED — and the drop only once it landed. The decision above read the
 * slot and the item without the lease, and sealing takes about a second outside it; another window's Edit,
 * a pulled sync or a rotation that landed plain could store a newer value in that gap (the security review,
 * finding 1). So inside the commit's own lease the guard re-reads both: the slot must still be, byte for
 * byte, what was compared, and the item must still hold this hold. Otherwise nothing is written and the
 * item is kept — the next door decides again.
 */
async function written(at: ReleaseAt, slot: RotationSlot, held: Held, text: string, compared: StoredSecret | undefined): Promise<SlotOutcome> {
  const sealing = await at.proof(at.storage, at.accountId, at.entityId, at.entryName);
  if (sealing.kind === 'stopped') {
    return KEPT;
  }
  await writeSlot(writerFor(at.storage, at.accountId, at.entityId, sealing, NOTHING_OPENED, unchangedSince(at, slot, held, compared)), at, slot, text);
  return finished(at, slot, held, sealing.kind === 'sealed');
}

/** The release's precondition, checked under the commit's lease (`entryWriter.CommitGuard`). */
function unchangedSince(at: ReleaseAt, slot: RotationSlot, held: Held, compared: StoredSecret | undefined): CommitGuard {
  return async () => {
    const now = await rawSlot(at, slot);
    const still = (await at.storage.heldRotations.read(at.accountId, at.entityId))[slot];
    if (now !== compared || still?.at !== held.at) {
      throw new ReleaseOvertaken();
    }
  };
}

/** The slot or the hold changed between the release's decision and its commit — nothing was written. */
class ReleaseOvertaken extends Error {
  constructor() {
    super('The value changed while the release was being sealed; nothing was written and the held value is kept.');
    this.name = 'ReleaseOvertaken';
  }
}

function rawSlot(at: Pick<ReleaseAt, 'storage' | 'accountId' | 'entityId'>, slot: RotationSlot): PromiseLike<StoredSecret | undefined> {
  return slot === 'password' ? at.storage.getPassword(at.accountId, at.entityId) : at.storage.getDbConnection(at.accountId, at.entityId);
}

function writeSlot(writer: EntryWriter, at: ReleaseAt, slot: RotationSlot, text: string): Promise<void> {
  return slot === 'password' ? writer.setPassword(at.accountId, at.entityId, text) : writer.setDbConnection(at.accountId, at.entityId, text);
}

/** The value is in the slot: drop it from the item — a failed drop is finished by the next door (step 2). */
async function finished(at: ReleaseAt, slot: RotationSlot, held: Held, sealed: boolean): Promise<SlotOutcome> {
  await dropHeld(at.storage, at.accountId, at.entityId, slot, held.at).catch(() => undefined);
  return { kind: 'released', slot: { slot, at: held.at, sealed } };
}

/**
 * Drop one held slot — under the lease, and only if it is still the hold of `heldAt`: a newer rotation that
 * landed meanwhile stays. The index entry goes when the item is empty (item first, index second).
 */
export async function dropHeld(storage: StorageManager, accountId: string, entityId: string, slot: RotationSlot, heldAt: number): Promise<void> {
  const store = storage.heldRotations;
  await storage.writes.run(async () => {
    const { [slot]: current, ...rest } = await store.read(accountId, entityId);
    if (current?.at === heldAt) {
      await settle(store, accountId, entityId, rest);
    }
  });
}

/**
 * Re-reads, after a door, the value a click read before it — see `beforeTheDoor`. `slot` is the rotation slot the
 * value was read from; a value read from any other slot is never re-read, whatever its text (fix 3 above).
 */
export type AfterTheDoor = (value: StoredSecret | undefined, release: Release, slot?: RotationSlot) => Promise<StoredSecret | undefined>;

const AS_READ: AfterTheDoor = (value) => Promise.resolve(value);

/**
 * Taken BEFORE a click's door: what the slots of a held rotation hold now (nothing is read when nothing is
 * held — one keychain get). After the door, a value equal to what a RELEASED slot held before is the value the
 * door replaced, and the slot is read again (the security review, finding 2). The caller opens what it gets
 * through the grant the door left — this never opens anything.
 */
export async function beforeTheDoor(storage: StorageManager, accountId: string, entityId: string): Promise<AfterTheDoor> {
  try {
    const held = await storage.heldRotations.read(accountId, entityId);
    return isEmpty(held) ? AS_READ : rereadAfter(storage, accountId, entityId, await slotsNow(storage, accountId, entityId, held));
  } catch {
    return AS_READ;
  }
}

async function slotsNow(storage: StorageManager, accountId: string, entityId: string, held: HeldSlots): Promise<Partial<Record<RotationSlot, StoredSecret | undefined>>> {
  const now: Partial<Record<RotationSlot, StoredSecret | undefined>> = {};
  for (const slot of SLOTS.filter((one) => held[one] !== undefined)) {
    now[slot] = await rawSlot({ storage, accountId, entityId }, slot);
  }
  return now;
}

function rereadAfter(storage: StorageManager, accountId: string, entityId: string, before: Partial<Record<RotationSlot, StoredSecret | undefined>>): AfterTheDoor {
  return async (value, release, slot) => {
    const replaced = release.released.find((one) => one.slot === slot && value !== undefined && before[one.slot] === value);
    return replaced === undefined ? value : rawSlot({ storage, accountId, entityId }, replaced.slot);
  };
}

/** What the release compared: the slot's text, whether it was sealed, and the stored string it was read from. */
interface Live {
  readonly text: string | undefined;
  readonly sealed: boolean;
  readonly raw: StoredSecret | undefined;
}

/** The live slot's text, opened silently with the grant the door just took — or `UNREADABLE`. */
async function liveText(at: ReleaseAt, slot: RotationSlot): Promise<Live | typeof UNREADABLE> {
  const raw = await rawSlot(at, slot);
  const opened = await openStored(raw, silentPinGate(at.accountId, at.entityId, at.entryName));
  if (opened.kind === 'value' || opened.kind === 'unprotected') {
    return { text: opened.value, sealed: opened.kind === 'value', raw };
  }
  return UNREADABLE;
}

/** A live slot this release cannot read — sealed with no grant, damaged: nothing is compared, nothing written. */
const UNREADABLE = 'unreadable';

/**
 * Store every indexed hold whose entry is no longer protected — unprotected by a sync or another window, with
 * no door to open it (plan §4.5): the startup sweep's and a pulled sync's half. Through the same release with
 * the UNATTENDED proof, i.e. exactly the store the rotation would have made; a protected entry's hold is left
 * alone — nothing automatic holds a PIN, even one this window was given. An index entry whose entry or item
 * is gone is dropped; one whose tree cannot be read is kept. WHICH values went in — by entry name and slot, so
 * the sweeper can say each one to the person (`PLAN_waiting_rotation_visible.md` W6); never throws.
 */
export async function releaseUnprotected(storage: StorageManager): Promise<readonly ReleasedValue[]> {
  const released: ReleasedValue[] = [];
  for (const entry of await Promise.resolve(storage.heldRotations.listed()).catch(() => [])) {
    released.push(...(await releaseIfUnprotected(storage, entry).catch(() => [])));
  }
  return released;
}

/** One value a release without a door put into its entry: the entry's name and the slot — never the value. */
export interface ReleasedValue {
  readonly entryName: string;
  readonly slot: ReleasedSlot;
}

/**
 * At an AUTOMATIC read of this entry (`PLAN_waiting_rotation_visible.md` W5, the owner's decision §9.1): a rotated
 * value waiting beside it, when it is UNPROTECTED, goes in first — the sweep's own release, with the UNATTENDED
 * proof, i.e. exactly the store the rotation would have made (the plain writer, re-checked under the lease). Never a
 * PIN, never a modal: a marked or sealed entry is left to the person's door, and a CONFLICT is written nowhere — the
 * reader gets what is stored and the person's next door asks. What went in is said through the storage's words.
 * The index is asked first, so an unlisted entry — every entry, almost always — costs one memento read and no
 * keychain `get`. Called by ONE place, `automaticRead.automaticOpenerFor` (the code round, 2026-10-03). Never throws.
 */
export async function releaseBeforeAutomaticUse(storage: StorageManager, accountId: string, entityId: string): Promise<Release> {
  if (!(await isWaiting(storage, accountId, entityId).catch(() => false))) {
    return NOTHING_RELEASED;
  }
  const released = await releaseIfUnprotected(storage, { accountId, entityId }).catch(() => []);
  told(storage, released);
  return { released: released.map((value) => value.slot), conflicts: [] };
}

/** What an agent's use stored, handed to the storage's words — a failure to tell never fails the agent's call. */
function told(storage: StorageManager, released: readonly ReleasedValue[]): void {
  try {
    storage.heldRotations.announce(released);
  } catch {
    /* the value is stored either way; the row's hint is gone, which is the other way the person sees it */
  }
}

/**
 * The window's words for a value an AGENT's use stored in THIS storage (the owner's follow-up to W5: the person must
 * see it). This module is free of `vscode`, and so are the automatic readers — so `extension.ts` hands the storage it
 * built `rotationWaiting.sayReleasedValues` once, at activation. Kept on the storage's own store, not in this
 * module: a second storage (another test, another run) never says through them (the code round, 2026-10-03). An
 * info message, never a modal, never awaited; until it is set — a test, a host with no window — nothing is said.
 */
export function announceReleasesWith(storage: StorageManager, say: (released: readonly ReleasedValue[]) => void): void {
  storage.heldRotations.announceWith(say);
}

async function releaseIfUnprotected(storage: StorageManager, entry: HeldEntry): Promise<readonly ReleasedValue[]> {
  const node = storage.getNode(entry.accountId, entry.entityId);
  if (node === undefined) {
    return forgetIfAbsent(storage, entry);
  }
  if (isEmpty(await storage.heldRotations.read(entry.accountId, entry.entityId))) {
    await unlistIfEmpty(storage, entry);
    return [];
  }
  return (await protectedNow(storage, entry)) ? [] : releasedValues(node.name, await releaseHeld(storage, entry.accountId, entry.entityId, node.name, UNATTENDED));
}

function releasedValues(entryName: string, release: Release): readonly ReleasedValue[] {
  return release.released.map((slot) => ({ entryName, slot }));
}

/** No node — gone, or a tree that cannot be read (`metadataFault`), which is "unknown", never "absent". */
async function forgetIfAbsent(storage: StorageManager, entry: HeldEntry): Promise<readonly ReleasedValue[]> {
  if (storage.nodePresence(entry.accountId, entry.entityId) === 'absent') {
    await storage.heldRotations.unlist(entry.accountId, entry.entityId);
  }
  return [];
}

/** The mark, or a sealed slot — the protection `unattendedSealing` refuses on, asked before anything is read. */
async function protectedNow(storage: StorageManager, entry: HeldEntry): Promise<boolean> {
  return isMarked(storage, entry.accountId, entry.entityId) || (await lockedSlotCount(storage, entry.accountId, entry.entityId)).locked > 0;
}

// ---- what the person sees (plan §4.6) ----

/**
 * Whether the local index lists this entry — the index ALONE, a memento read and no keychain `get`
 * (`PLAN_waiting_rotation_visible.md` §3.1). A hint like every read of the index: a listed entry is read
 * before anything is believed, and an unlisted one — every entry, almost always — costs nothing more. What
 * lets a click on an UNPROTECTED entry take its door only when a rotated value waits beside it.
 */
export async function isWaiting(storage: StorageManager, accountId: string, entityId: string): Promise<boolean> {
  return (await storage.heldRotations.listed()).some((entry) => entry.accountId === accountId && entry.entityId === entityId);
}

/**
 * The tree's hint: every entry with a value held beside it, as `entityFlags.entityKey` — read from the local
 * index, verified by one keychain get per LISTED entry (the tree cannot await, so the flags walk asks this).
 * An index entry whose entry or item is gone is dropped here too; one whose tree cannot be read is kept, and
 * not shown. Ids only.
 */
export async function waitingKeys(storage: StorageManager): Promise<ReadonlySet<string>> {
  const keys = new Set<string>();
  for (const entry of await storage.heldRotations.listed()) {
    if (await stillWaiting(storage, entry)) {
      keys.add(entityKey(entry.accountId, entry.entityId));
    }
  }
  return keys;
}

async function stillWaiting(storage: StorageManager, entry: HeldEntry): Promise<boolean> {
  const presence = storage.nodePresence(entry.accountId, entry.entityId);
  if (presence === 'unknown') {
    return false;
  }
  const held = presence === 'present' && !isEmpty(await storage.heldRotations.read(entry.accountId, entry.entityId));
  if (!held) {
    await unlistIfEmpty(storage, entry);
  }
  return held;
}

/**
 * Drop an index entry only if its item is STILL empty, decided under the lease (the security review, finding
 * 3): the reader saw "empty" without it, and a hold — index first, item second, one step under the lease —
 * can land between that look and this write. Unlisted then, the item would exist with nothing to find it:
 * no tree hint, no sweep. A node that is gone takes its entry with it either way (`forgetIfAbsent`).
 */
async function unlistIfEmpty(storage: StorageManager, entry: HeldEntry): Promise<void> {
  const store = storage.heldRotations;
  await storage.writes.run(async () => {
    if (storage.nodePresence(entry.accountId, entry.entityId) === 'absent' || isEmpty(await store.read(entry.accountId, entry.entityId))) {
      await store.unlist(entry.accountId, entry.entityId);
    }
  });
}

/** One value a permanent deletion would lose: the entry it waits beside, and which slot. Never the value. */
export interface WaitingValue {
  readonly entryName: string;
  readonly slot: RotationSlot;
}

/**
 * The values held beside `rootIds` or anything under them — what a permanent deletion of those would lose
 * (the owner's answer to the plan's open question 1: the confirmation names it). Read from the index and
 * verified by a get per listed entry.
 */
export async function waitingUnder(storage: StorageManager, accountId: string, rootIds: readonly string[]): Promise<readonly WaitingValue[]> {
  const under = (await storage.heldRotations.listed()).filter(
    (entry) => entry.accountId === accountId && rootIds.some((root) => storage.isSelfOrDescendant(accountId, root, entry.entityId)),
  );
  const found: WaitingValue[] = [];
  for (const entry of under) {
    found.push(...heldNames(storage.getNode(accountId, entry.entityId)?.name ?? entry.entityId, await storage.heldRotations.read(accountId, entry.entityId)));
  }
  return found;
}

function heldNames(entryName: string, held: HeldSlots): WaitingValue[] {
  return SLOTS.filter((slot) => held[slot] !== undefined).map((slot) => ({ entryName, slot }));
}

// ---- the item's wire form: `{ v: 3, slots: { password?: { value, at, was }, dbConnection?: … } }` ----
// `was` is `{ kdf: 'scrypt', N, r, p, salt, key }`, or `{ kdf: 'unknown' }`. v1 (`was` a plain SHA-256 hex) and
// v2 (`was` an HMAC-SHA-256 `{ salt, mac }`) were written only by development builds of this feature, never
// released: their holds are read with an UNKNOWN fingerprint — still held, released only by the person's
// answer — and no fast hash of a slot's text is computed or written again.

const SLOTS: readonly RotationSlot[] = ['password', 'dbConnection'];

/** The parse boundary — the one place a held value is minted (`stored`). Anything malformed is nothing held. */
function heldOf(raw: string | undefined): HeldSlots {
  const slots = parsedRecord(raw)?.slots ?? {};
  return Object.fromEntries(SLOTS.flatMap((slot) => present(slot, heldIn(slots[slot]))));
}

function present(slot: RotationSlot, held: Held | undefined): [RotationSlot, Held][] {
  return held === undefined ? [] : [[slot, held]];
}

interface WireRecord {
  readonly v?: unknown;
  readonly slots?: Partial<Record<RotationSlot, unknown>>;
}

const WIRE_VERSION = 3;
const READABLE_VERSIONS: ReadonlySet<unknown> = new Set([1, 2, WIRE_VERSION]);

function parsedRecord(raw: string | undefined): WireRecord | undefined {
  const parsed = (parsedJson(raw) ?? undefined) as WireRecord | undefined;
  return parsed !== undefined && READABLE_VERSIONS.has(parsed.v) ? parsed : undefined;
}

function parsedJson(raw: string | undefined): unknown {
  if (raw === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

interface WireHeld {
  readonly value?: unknown;
  readonly at?: unknown;
  readonly was?: unknown;
}

interface WellFormed {
  readonly value: string;
  readonly at: number;
}

function heldIn(wire: unknown): Held | undefined {
  const held = (wire ?? {}) as WireHeld;
  const was = fingerprintIn(held.was);
  return wellFormed(held) ? { value: stored(held.value), at: held.at, was } : undefined;
}

function wellFormed(held: WireHeld): held is WellFormed {
  return typeof held.value === 'string' && Number.isFinite(held.at);
}

/** The fingerprint as written — a scrypt one this build can check, or UNKNOWN (a v1/v2 fast hash, anything else). */
function fingerprintIn(wire: unknown): Fingerprint {
  const was = (wire ?? {}) as Partial<ScryptFingerprint>;
  return isScrypt(was) ? { kdf: 'scrypt', N: was.N, r: was.r, p: was.p, salt: was.salt, key: was.key } : UNKNOWN_FINGERPRINT;
}

function isScrypt(was: Partial<ScryptFingerprint>): was is ScryptFingerprint {
  return was.kdf === 'scrypt' && isCost(was.N, was.r, was.p) && isHex(was.salt, SALT_BYTES * 2) && isHex(was.key, KEY_BYTES * 2);
}

/** A cost a release may run: N a power of two from 2^10, r and p from 1, p at most 16, the memory (128·N·r) at most 64 MiB. */
function isCost(N: unknown, r: unknown, p: unknown): boolean {
  return isPowerOfTwo(N) && inRange(r, 1, MAX_SCRYPT_MEMORY / (128 * (N as number))) && inRange(p, 1, 16);
}

function isPowerOfTwo(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 2 ** 10 && ((n as number) & ((n as number) - 1)) === 0;
}

function inRange(n: unknown, low: number, high: number): boolean {
  return Number.isInteger(n) && (n as number) >= low && (n as number) <= high;
}

const MAX_SCRYPT_MEMORY = 64 * 1024 * 1024;

function isHex(value: unknown, length: number): value is string {
  return typeof value === 'string' && value.length === length && /^[0-9a-f]*$/.test(value);
}

/** The serialiser — the stored form carried out as the bytes it is (`carried`). */
function serialised(slots: HeldSlots): string {
  const wire: Partial<Record<RotationSlot, WireHeld>> = {};
  for (const slot of SLOTS) {
    const held = slots[slot];
    if (held !== undefined) {
      wire[slot] = { value: carried(held.value), at: held.at, was: held.was };
    }
  }
  return JSON.stringify({ v: WIRE_VERSION, slots: wire });
}
