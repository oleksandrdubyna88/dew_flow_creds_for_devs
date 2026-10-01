import * as crypto from 'node:crypto';
import type { LeasedQueue } from './leasedQueue';
import { rotationQuarantineSecretKey } from './secretKeys';
import type { SecretChest } from './secretMaps';
import type { RotationSlot } from './secretRotation';
import { plainSecret } from './secretEnvelope';
import type { StorageManager } from './storageManager';
import { StoredSecret, carried, stored } from './storedSecret';

/**
 * A rotated value the vault could not store, kept on this machine until the entry's PIN is entered
 * (`todo/PLAN_rotation_quarantine.md`).
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
  /** SHA-256 hex of the slot's text the rotation replaced — the release refuses to overwrite anything else. */
  readonly was: string;
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
 * The item's own keychain verbs and the index — a narrow port, not the slot setters (plan §4.1). Every verb
 * runs under the storage's cross-window lease (`StorageManager.writes`, re-entrant), so a compound step that
 * holds the lease itself (`read` then `put`) is still one step to another window.
 */
export interface QuarantineStore {
  read(accountId: string, entityId: string): Promise<HeldSlots>;
  /** Writes the record — or deletes the item when it holds nothing. */
  put(accountId: string, entityId: string, slots: HeldSlots): Promise<void>;
  drop(accountId: string, entityId: string): Promise<void>;
  /** The index: every pair that may have an item. A hint — an item is read before it is believed. */
  listed(): Promise<readonly HeldEntry[]>;
  list(accountId: string, entityId: string): Promise<void>;
  unlist(accountId: string, entityId: string): Promise<void>;
}

/** The store over the profile's keychain and local state — made once, by `StorageManager`. */
export function quarantineStore(chest: SecretChest, state: IndexState, writes: LeasedQueue): QuarantineStore {
  const key = rotationQuarantineSecretKey;
  return {
    read: (a, e) => writes.run(async () => heldOf(await chest.get(key(a, e)))),
    put: (a, e, slots) => writes.run(() => Promise.resolve(isEmpty(slots) ? chest.delete(key(a, e)) : chest.store(key(a, e), serialised(slots)))),
    drop: (a, e) => writes.run(() => Promise.resolve(chest.delete(key(a, e)))),
    listed: () => writes.run(() => Promise.resolve(indexOf(state))),
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
 * What a held value replaced, as the release compares it: SHA-256 hex of the slot's text when the rotation
 * read it — `''` for an empty slot. Never the text itself: the item holds the new value, not the old one.
 */
export function fingerprintOf(text: string | undefined): string {
  return crypto.createHash('sha256').update(text ?? '', 'utf8').digest('hex');
}

/**
 * Keep a value the far side accepted and the entry refused, beside the entry — index FIRST, item second, one
 * step under the lease. The last value wins: a second hold of the same slot overwrites the first, because the
 * far side holds the latest. Stored in its plain stored form (`plainSecret`), minted by `heldFor`.
 */
export async function holdRotated(storage: StorageManager, accountId: string, entityId: string, slot: RotationSlot, value: string, was: string): Promise<void> {
  const store = storage.heldRotations;
  await storage.writes.run(async () => {
    await store.list(accountId, entityId);
    await store.put(accountId, entityId, { ...(await store.read(accountId, entityId)), [slot]: heldFor(value, was) });
  });
}

/** The held form of a value the rotation drew — minted here, as the parse mints what it reads. */
function heldFor(value: string, was: string): Held {
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

// ---- the item's wire form: `{ v: 1, slots: { password?: Held, dbConnection?: Held } }` ----

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

function parsedRecord(raw: string | undefined): WireRecord | undefined {
  const parsed = parsedJson(raw) as WireRecord | null | undefined;
  return parsed?.v === 1 ? parsed : undefined;
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
  readonly was: string;
}

function heldIn(wire: unknown): Held | undefined {
  const held = (wire ?? {}) as WireHeld;
  return wellFormed(held) ? { value: stored(held.value), at: held.at, was: held.was } : undefined;
}

function wellFormed(held: WireHeld): held is WellFormed {
  return typeof held.value === 'string' && Number.isFinite(held.at) && isFingerprint(held.was);
}

function isFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
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
  return JSON.stringify({ v: 1, slots: wire });
}
