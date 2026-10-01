import { NOTHING_OPENED } from './editPrefill';
import { protectEntity, sealValue } from './entityPin';
import { SECRET_SLOTS, SecretSlot } from './entitySlots';
import { writerFor } from './entryWriter';
import { Revision } from './revisionHistory';
import { snapshotForRevision } from './revisionSnapshot';
import type { Sealing } from './sealingAtWrite';
import { readSecret } from './secretEnvelope';
import type { StorageManager } from './storageManager';
import { EntityMetadata } from './types';

/**
 * Bringing an entry back to one of its kept versions — the writes, in the order that keeps every rule
 * (entry-PIN plan §5.7, D11; the command around it is `revisionRestore.ts`).
 *
 * <p>Until 1.12 the history row's tooltip said *"Clone it to bring it back"*, and Clone copies the
 * metadata only; the one surviving copy of what an Edit had deleted (D2) was unreachable. Restore
 * writes the version's values into the SAME entry, in this order:</p>
 *
 * <ol>
 *   <li><b>Every value is prepared in memory first</b> — sealed under the entry's PIN when the live
 *       entry is protected, so a version from before the PIN comes back SEALED (rule R3). Nothing is
 *       written until all of it is ready (plan gate, finding 1): an interruption can only leave a
 *       mixture of two already-sealed states, never plaintext.</li>
 *   <li><b>Today's state is recorded as the newest kept version</b> before anything changes, so a
 *       restore is undone the same way it was done.</li>
 *   <li>The values (the password last, as the slot table orders them), the node, then the removals of
 *       every value the version did not hold — through each slot's own deleter, because
 *       `setPassword('')` KEEPS. Into an unprotected entry the values go through the plain writer
 *       `writerFor` gives Restore's plain proof: every write under the cross-window lease and re-checked,
 *       so an entry another window protects between the decision and a write refuses that write (the E2
 *       security review, finding 2). The node is rebuilt from the node AS IT IS at its write, inside the
 *       lease — a mark another window set meanwhile is today's, and stays.</li>
 *   <li>The `protectEntity` sweep, for a protected entry: idempotent, it seals anything a racing
 *       writer left in the clear.</li>
 * </ol>
 *
 * <p><b>Idempotent, not atomic.</b> `SecretStorage` has no transaction. Running it again with the same
 * version converges on that version, which is what finishes an interrupted run.</p>
 *
 * <p>Pure of `vscode`: the storage arrives as an argument.</p>
 */

/**
 * What a restore keeps from TODAY rather than from the version: who may use the entry and how
 * (agent access, the not-for-export switch, the code-access key — a revoked key is never revived),
 * when it expires or burns, the SSH-agent switch, its colour, and the PIN mark. And every attachment
 * and image claim, because a revision keeps no files: the version's claim would name a file that is
 * not there.
 */
const TODAY: readonly (keyof EntityMetadata)[] = [
  'pinProtected',
  'mcp',
  'mcpCreatedByAgent',
  'notForExport',
  'configKeyHash',
  'expiresAt',
  'burnPolicy',
  'sshAgent',
  'depColor',
];
const TODAY_PREFIXES = ['attachment', 'image'];

function isToday(key: string): boolean {
  return (TODAY as readonly string[]).includes(key) || TODAY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * The version's content with today's switches — `hasTotp` derived from the seed the restore writes,
 * never taken from a flag that may describe a seed that is not coming back.
 */
export function restoredDetails(version: Revision, live: EntityMetadata): EntityMetadata {
  const content = Object.entries(version.details).filter(([key]) => !isToday(key));
  const today = Object.entries(live).filter(([key]) => isToday(key));
  const hasTotp = version.secrets.totp === undefined ? undefined : true;
  return { ...Object.fromEntries(content), ...Object.fromEntries(today), id: live.id, name: version.name, hasTotp } as EntityMetadata;
}

/** Every slot's fate, decided and SEALED in memory before the first write. */
interface RestorePlan {
  readonly writes: readonly (readonly [SecretSlot, string])[];
  readonly removals: readonly SecretSlot[];
}

async function planned(storage: StorageManager, accountId: string, entityId: string, version: Revision, pin: string | undefined): Promise<RestorePlan> {
  const fates = await Promise.all(SECRET_SLOTS.map((slot) => fateOf(storage, accountId, entityId, slot, version, pin)));
  return {
    writes: fates.flatMap((fate, at) => (fate.kind === 'write' ? [[SECRET_SLOTS[at], fate.value] as const] : [])),
    removals: SECRET_SLOTS.filter((_slot, at) => fates[at].kind === 'remove'),
  };
}

type Fate = { readonly kind: 'write'; readonly value: string } | { readonly kind: 'remove' } | { readonly kind: 'keep' };

/** One slot: the version's value (sealed first when there is a PIN), a removal, or nothing to do. */
async function fateOf(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  slot: SecretSlot,
  version: Revision,
  pin: string | undefined,
): Promise<Fate> {
  const wanted = version.secrets[slot.revisionField];
  const stored = await slot.read(storage, accountId, entityId);
  if (wanted === undefined || wanted.length === 0) {
    return removalFate(stored);
  }
  return pin === undefined ? plainFate(stored, wanted) : { kind: 'write', value: await sealValue(wanted, accountId, pin) };
}

/**
 * Whether the version holds a value in any slot the entry PIN covers — the same test `fateOf` writes
 * by. A restore into an entry protected while empty asks for the entry's first PIN only when it does.
 */
export function holdsValue(version: Revision): boolean {
  return SECRET_SLOTS.some((slot) => (version.secrets[slot.revisionField] ?? '').length > 0);
}

/** The version held nothing here: whatever the entry holds now goes. */
function removalFate(stored: string | undefined): Fate {
  return stored === undefined ? { kind: 'keep' } : { kind: 'remove' };
}

/** An unprotected entry: a value already equal to the version's is left byte-identical (no sync churn). */
function plainFate(stored: string | undefined, wanted: string): Fate {
  return stored === wanted ? { kind: 'keep' } : { kind: 'write', value: wanted };
}

/** How a restore writes: the entry's PIN (a protected entry — every value sealed first), or the plain proof its decision made. */
export type RestoreUnder = string | Extract<Sealing, { readonly kind: 'plain' }>;

/**
 * Restore `version` — already OPENED (`historyPin.openRevision`) — into the live entry `entityId`.
 * `under` is the entry's PIN when it is protected, and the plain proof `sealingAtWrite` gave when it is
 * not. Answers the details it wrote, for the terminal bindings the caller refreshes.
 */
export async function restoreVersion(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  version: Revision,
  under: RestoreUnder,
): Promise<EntityMetadata> {
  const pin = typeof under === 'string' ? under : undefined;
  const live = liveEntry(storage, accountId, entityId);
  const plan = await planned(storage, accountId, entityId, version, pin);
  await storage.recordRevision(accountId, entityId, await snapshotForRevision(storage, accountId, live));
  await (typeof under === 'string' ? writeSealed(storage, accountId, entityId, plan) : writePlain(storage, accountId, entityId, plan, under));
  let details = restoredDetails(version, live.details);
  await storage.updateNodeFields(accountId, entityId, (node) => {
    details = restoredDetails(version, node.details ?? live.details);
    return { name: version.name, details };
  });
  for (const slot of plan.removals) {
    await slot.remove(storage, accountId, entityId);
  }
  await sweep(storage, accountId, entityId, pin);
  return details;
}

/** A protected entry: every value was sealed in memory under its PIN by `planned`, before the first write (R3). */
async function writeSealed(storage: StorageManager, accountId: string, entityId: string, plan: RestorePlan): Promise<void> {
  for (const [slot, value] of plan.writes) {
    await slot.write(storage, accountId, entityId, value);
  }
}

/** An unprotected entry: through the plain writer — each write under the lease, re-checked against the decision. */
async function writePlain(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  plan: RestorePlan,
  proof: Extract<Sealing, { readonly kind: 'plain' }>,
): Promise<void> {
  const writer = writerFor(storage, accountId, entityId, proof, NOTHING_OPENED);
  for (const [slot, value] of plan.writes) {
    await slot.write(writer, accountId, entityId, value);
  }
}

function liveEntry(storage: StorageManager, accountId: string, entityId: string): { id: string; name: string; details: EntityMetadata } {
  const live = storage.getNode(accountId, entityId);
  if (live?.details === undefined) {
    throw new Error('the entry this version belongs to no longer exists');
  }
  return { id: entityId, name: live.name, details: live.details };
}

function sweep(storage: StorageManager, accountId: string, entityId: string, pin: string | undefined): Promise<unknown> {
  return pin === undefined ? Promise.resolve() : protectEntity(storage, accountId, entityId, pin);
}

/**
 * The labels of the live slots whose wrap is damaged. A restore over one of them would overwrite the
 * only copy of whatever it was (R4), so the command refuses before anything is written.
 */
export async function damagedSlots(storage: StorageManager, accountId: string, entityId: string): Promise<string[]> {
  const reads = await Promise.all(SECRET_SLOTS.map((slot) => slot.read(storage, accountId, entityId)));
  return SECRET_SLOTS.filter((_slot, at) => readSecret(reads[at]).kind === 'corrupt').map((slot) => slot.label);
}
