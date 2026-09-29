import { sealValue } from './sealValue';
import { attemptUnlock, cooldownMs, coolingReason, retryGranted } from './pinAttempts';
import { PinGate, PinOpen, openStored, silentPinGate } from './pinGate';
import { Revision, RevisionSecrets, SMALL_FIELDS } from './revisionHistory';
import { SecretEnvelope, SecretRead, plainSecret, readSecret } from './secretEnvelope';
import type { StorageManager } from './storageManager';

/**
 * An entry's KEPT versions under its PIN — sealed when it is protected, opened when the PIN comes off,
 * and opened for one look through the door (entry-PIN plan, D10).
 *
 * <p>Until 1.12 Protect sealed the live values and left the history alone, so the three versions from
 * before the PIN stayed plaintext in the keychain and opened with no PIN at all: a CVV readable and
 * copyable from the history row until three later edits pushed it out. The format this module writes
 * is the one a snapshot of a protected entry already has — <b>one envelope per field</b> inside each
 * revision — so one reader serves both, and running any of this twice changes nothing the first run
 * did not.</p>
 *
 * <p>Every rewrite goes through `StorageManager.replaceHistory` with a MAP from the stored string to
 * its replacement, applied to the list as it is at write time. A revision a Save recorded while the
 * seals were running is kept; a value somebody else already sealed is not in the map and is left as
 * it is.</p>
 *
 * <p>Pure of `vscode`: the storage and the prompt arrive as arguments.</p>
 */

/** The two history calls this module makes — so a test can hand it any store that keeps a list. */
export type HistoryStore = Pick<StorageManager, 'getHistory' | 'replaceHistory'>;

type Field = (typeof SMALL_FIELDS)[number];

/** Every stored string the kept versions hold, field by field. */
function storedValues(kept: readonly Revision[]): string[] {
  return kept.flatMap((revision) => SMALL_FIELDS.map((field) => revision.secrets[field]).filter(isText));
}

function isText(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** How many kept values are in the clear — the door's reason to seal, and zero means nothing to do. */
export function plainHistoryValues(kept: readonly Revision[]): number {
  return storedValues(kept).filter((stored) => readSecret(stored).kind === 'value').length;
}

/** The first sealed kept value — what a PIN is checked against when the live entry holds none. */
export function firstSealedKept(kept: readonly Revision[]): SecretRead | undefined {
  return storedValues(kept)
    .map((stored) => readSecret(stored))
    .find((read) => read.kind === 'locked');
}

/** How many kept values are sealed — *Remove PIN Protection…* is offered while this is above zero. */
export function lockedHistoryValues(kept: readonly Revision[]): number {
  return storedValues(kept).filter((stored) => readSecret(stored).kind === 'locked').length;
}

/**
 * Seal every kept value that is in the clear, under `pin`. Answers how many were sealed.
 *
 * <p>Only a `value` is sealed: one already locked is left exactly as it is (under this PIN it is done,
 * under another it cannot be opened here and must not be replaced), and a `corrupt` one is the only
 * copy of the evidence, which no rewrite may touch — the rule `protectEntity` keeps for live slots.</p>
 */
export async function protectHistory(storage: HistoryStore, accountId: string, entityId: string, pin: string): Promise<number> {
  const plain = [...new Set(storedValues(await storage.getHistory(accountId, entityId)))].filter(
    (stored) => readSecret(stored).kind === 'value',
  );
  if (plain.length === 0) {
    return 0;
  }
  const sealed = new Map(await Promise.all(plain.map(async (stored) => [stored, await sealValue(stored, accountId, pin)] as const)));
  await rewriteHistory(storage, accountId, entityId, sealed);
  return sealed.size;
}

/** What opening the kept versions with one PIN produced, in memory — nothing has been written yet. */
export interface OpenedHistory {
  /** Stored string → its opened form (`plainSecret`, so a woven value stays woven). */
  readonly rewrite: ReadonlyMap<string, string>;
  /** Values this PIN does not open — left sealed and counted, never replaced. */
  readonly foreign: number;
}

/**
 * Open every sealed kept value with `pin`, leniently: a value under ANOTHER PIN (two protects mixed by
 * a sync) is left sealed and counted rather than failing the whole run.
 *
 * <p>The PIN has already been checked against the entry by the caller, so trying it on a kept value
 * is not a guess and counts no wrong attempt (`retryGranted`). A miss is a value under another PIN.</p>
 */
export async function openHistory(kept: readonly Revision[], accountId: string, entityId: string, pin: string): Promise<OpenedHistory> {
  const sealed = [...new Set(storedValues(kept))].filter((stored) => readSecret(stored).kind === 'locked');
  const opened = await Promise.all(sealed.map((stored) => openedForm(stored, (envelope) => retryGranted(envelope, accountId, entityId, pin))));
  const rewrite = new Map<string, string>();
  sealed.forEach((stored, at) => {
    const value = opened[at];
    if (value !== undefined) {
      rewrite.set(stored, value);
    }
  });
  return { rewrite, foreign: sealed.length - rewrite.size };
}

/** One sealed stored string, opened into the form an unprotected value is stored in — or nothing. */
async function openedForm(stored: string, unlock: (envelope: SecretEnvelope) => Promise<string | undefined>): Promise<string | undefined> {
  const read = readSecret(stored);
  if (read.kind !== 'locked') {
    return undefined;
  }
  const value = await unlock(read.envelope);
  return value === undefined ? undefined : plainSecret(value, read.woven);
}

/** Apply a stored→replacement map to the kept versions as they are at write time. */
export function rewriteHistory(
  storage: HistoryStore,
  accountId: string,
  entityId: string,
  rewrite: ReadonlyMap<string, string>,
): Promise<void> {
  return rewrite.size === 0 ? Promise.resolve() : storage.replaceHistory(accountId, entityId, (kept) => kept.map((r) => revised(r, rewrite)));
}

/** One revision with every mapped value replaced; everything else — and every other field — as it was. */
function revised(revision: Revision, rewrite: ReadonlyMap<string, string>): Revision {
  const secrets: RevisionSecrets = { ...revision.secrets };
  for (const field of SMALL_FIELDS) {
    const replacement = replacementOf(secrets[field], rewrite);
    if (replacement !== undefined) {
      secrets[field] = replacement;
    }
  }
  return { ...revision, secrets };
}

function replacementOf(stored: string | undefined, rewrite: ReadonlyMap<string, string>): string | undefined {
  return stored === undefined ? undefined : rewrite.get(stored);
}

/** Seal-free Remove PIN for the kept versions: open with `pin`, write the opened list. */
export async function unprotectHistory(storage: HistoryStore, accountId: string, entityId: string, pin: string): Promise<OpenedHistory> {
  const opened = await openHistory(await storage.getHistory(accountId, entityId), accountId, entityId, pin);
  await rewriteHistory(storage, accountId, entityId, opened.rewrite);
  return opened;
}

/** How a kept version's own PIN is asked for — `undefined` means the person dismissed the box. */
export type VersionAsk = (prompt: string) => Thenable<string | undefined>;

/** A kept version, opened for one look or one restore — or refused with the sentence to say (`''`: declined). */
export type RevisionOpen = { readonly kind: 'open'; readonly revision: Revision } | { readonly kind: 'refused'; readonly reason: string };

/**
 * One kept version with every value opened — the copy the viewer and *Restore This Version…* work from.
 *
 * <p>Called after the door admitted the LIVE entry, so its grant is tried first, silently. A value the
 * grant does not open (the version is from before a PIN change, or the entry was unprotected on another
 * machine and synced here while this machine's history stayed sealed — plan gate, finding 3) is asked
 * for ONCE, as the VERSION's PIN, with its own sentence — and that PIN is never granted, so the live
 * entry's grant is not overwritten by a PIN it does not use.</p>
 */
export async function openRevision(revision: Revision, gate: PinGate, askVersion: VersionAsk, purpose: string): Promise<RevisionOpen> {
  const silent = silentPinGate(gate.accountId, gate.entityId, gate.entryName);
  const fields = SMALL_FIELDS.filter((field) => isText(revision.secrets[field]));
  const opens = await Promise.all(fields.map((field) => openStored(revision.secrets[field], silent)));
  const stopped = opens.find((open) => open.kind === 'corrupt' || open.kind === 'cooling');
  if (stopped !== undefined) {
    return { kind: 'refused', reason: reasonOf(stopped) };
  }
  const pending = fields.filter((_field, at) => opens[at].kind === 'cancelled');
  const own = await versionValues(revision, pending, gate, askVersion, purpose);
  return own.kind === 'refused' ? own : { kind: 'open', revision: withValues(revision, fields, opens, own.values) };
}

function reasonOf(open: PinOpen): string {
  return open.kind === 'corrupt' || open.kind === 'cooling' ? open.reason : '';
}

type VersionValues = { readonly kind: 'open'; readonly values: ReadonlyMap<Field, string> } | { readonly kind: 'refused'; readonly reason: string };

/** The values the live grant did not open, opened with the version's own PIN — asked once, never granted. */
async function versionValues(
  revision: Revision,
  pending: readonly Field[],
  gate: PinGate,
  askVersion: VersionAsk,
  purpose: string,
): Promise<VersionValues> {
  if (pending.length === 0) {
    return { kind: 'open', values: new Map() };
  }
  // Checked BEFORE the box, as `pinGate.askOnce` does: a box whose answer cannot be tried is a
  // question spent on the person's wait.
  const cooling = cooldownMs(gate.accountId, gate.entityId, Date.now());
  if (cooling > 0) {
    return { kind: 'refused', reason: coolingReason(cooling, gate.entryName) };
  }
  const typed = await askVersion(versionPrompt(purpose));
  return isText(typed) ? openedWithTyped(revision, pending, gate, typed) : { kind: 'refused', reason: '' };
}

/**
 * What the person TYPED is a guess until it opens something, so its first try counts (`attemptUnlock`);
 * once it has opened one value of this version, trying it on the rest is not a guess (`retryGranted`) —
 * one wrong PIN costs one attempt, not one per field.
 */
async function openedWithTyped(revision: Revision, pending: readonly Field[], gate: PinGate, typed: string): Promise<VersionValues> {
  const [first, ...rest] = pending;
  const firstValue = await openedForm(revision.secrets[first] ?? '', (envelope) => attemptUnlock(envelope, gate.accountId, gate.entityId, typed));
  if (firstValue === undefined) {
    return versionRefusal(gate.entryName);
  }
  const others = await Promise.all(
    rest.map((field) => openedForm(revision.secrets[field] ?? '', (envelope) => retryGranted(envelope, gate.accountId, gate.entityId, typed))),
  );
  const opened = [firstValue, ...others];
  return opened.every(isText) ? { kind: 'open', values: new Map(pending.map((field, at) => [field, opened[at] as string])) } : versionRefusal(gate.entryName);
}

function versionRefusal(entryName: string): VersionValues {
  return {
    kind: 'refused',
    reason: `That PIN does not open this kept version of "${entryName}". Nothing has been changed — the version stays sealed as it was.`,
  };
}

/** The sentence the plan gives the version's own box (§5.7, finding 3). */
export function versionPrompt(purpose: string): string {
  return `This kept version is sealed under the PIN the entry used to have. Enter it to ${purpose}.`;
}

/** The version with every field in the form an unprotected revision holds it. */
function withValues(revision: Revision, fields: readonly Field[], opens: readonly PinOpen[], own: ReadonlyMap<Field, string>): Revision {
  const secrets: RevisionSecrets = { ...revision.secrets };
  fields.forEach((field, at) => {
    secrets[field] = own.get(field) ?? storedForm(revision.secrets[field], opens[at]);
  });
  return { ...revision, secrets };
}

/** An opened value keeps its woven mark (`plainSecret`); a value that was never sealed stays byte-identical. */
function storedForm(stored: string | undefined, open: PinOpen): string | undefined {
  if (open.kind !== 'value') {
    return stored;
  }
  const read = readSecret(stored);
  return plainSecret(open.value, read.kind === 'locked' && read.woven);
}
