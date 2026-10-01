import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeError } from '../describeError';
import { NOTHING_OPENED } from '../editPrefill';
import { protectEntity } from '../entityPin';
import { EntryWriter, ProtectedMeanwhile, writerFor, writerForNew } from '../entryWriter';
import { unattendedSealing } from '../sealingAtWrite';
import type { StorageManager } from '../storageManager';
import { protectionDecision } from '../syncPinRule';
import { EntityMetadata } from '../types';
import { ACCOUNT, PIN, clickVscode, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * The plain writer under the lease, write by write (`PLAN_typed_stored_secrets.md` T4, the E2 code
 * round's findings 1, 4, 7, 9, 10 and 12).
 *
 * <p>A plain proof is a decision made BEFORE the writes; another window can protect the entry between
 * any two of them. So every slot write of a plain writer over an entry that existed runs inside the
 * storage's cross-window lease together with its own re-check — not only the first — and a write that
 * failed for a passing reason never stands in the way of the next one.</p>
 *
 * <p>Over the real `StorageManager`, with every value the keychain is handed logged.</p>
 */

const ENTRY = 'db1';
const OWNER = { id: ENTRY, name: 'prod db' };

const entry = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: ENTRY, name: 'prod db', kind: 'db', isSshEnabled: false, ...over }) as EntityMetadata;

async function vault(slots: Record<string, string>, written: string[] = []): Promise<StorageManager> {
  const storage = memoryStorage(clickVscode([], sinks()), written);
  await seedEntry(storage, entry(), slots);
  return storage;
}

/** The plain writer an unattended write is given for this (plain, unmarked) entry — decided now. */
async function plainWriterOver(storage: StorageManager): Promise<EntryWriter> {
  const sealing = await unattendedSealing(storage, ACCOUNT, OWNER);
  assert.equal(sealing.kind, 'plain', 'precondition: the entry is plain and unmarked, so the proof is plain');
  return writerFor(storage, ACCOUNT, ENTRY, sealing.kind === 'plain' ? sealing : (undefined as never), NOTHING_OPENED);
}

/** Another window protecting the entry the way *Protect with a PIN…* does: every value sealed, then the mark. */
async function protectedElsewhere(storage: StorageManager): Promise<void> {
  await protectEntity(storage, ACCOUNT, ENTRY, PIN);
  await storage.updateNodeFields(ACCOUNT, ENTRY, protectionDecision(true));
}

test('protected by another window after the first write and before the second — the second write is refused and nothing after the protection is stored in the clear', async () => {
  const written: string[] = [];
  const storage = await vault({ notes: 'old note', password: 'old pw' }, written);
  const writer = await plainWriterOver(storage);

  await writer.setNotes(ACCOUNT, ENTRY, 'new note');
  await protectedElsewhere(storage);
  written.length = 0;
  const second = await writer.setPassword(ACCOUNT, ENTRY, 'new pw').then(() => 'written', (error: unknown) => error);

  assert.deepEqual(written.filter((value) => value === 'new pw'), [], 'the second write of a plain writer reached the keychain in the clear, after the entry was protected');
  assert.ok(second instanceof ProtectedMeanwhile, `the second write was not refused: ${describeError(second)}`);
});

test('a first write that fails for a passing reason does not block a later write on the same writer', async () => {
  const storage = await vault({ notes: 'old note', password: 'old pw' });
  const writer = await plainWriterOver(storage);
  const setNotes = storage.setNotes.bind(storage);
  let failed = false;
  storage.setNotes = (a, e, value) => {
    if (!failed) {
      failed = true;
      return Promise.reject(new Error('the keychain was busy'));
    }
    return setNotes(a, e, value);
  };

  await assert.rejects(writer.setNotes(ACCOUNT, ENTRY, 'new note'), /the keychain was busy/);
  const later = await writer.setPassword(ACCOUNT, ENTRY, 'new pw').then(() => 'written', (error: unknown) => error);

  assert.equal(later, 'written', `a later write was blocked by an earlier write's passing failure: ${describeError(later)}`);
  assert.equal(await storage.getPassword(ACCOUNT, ENTRY), 'new pw');
});

test('every write of a plain writer runs inside the storage\'s cross-window lease, not only the first', async () => {
  const storage = await vault({ notes: 'old note', password: 'old pw' });
  const writer = await plainWriterOver(storage);
  const lease = storage.writes;
  const run = lease.run.bind(lease);
  let inside = 0;
  lease.run = async <T>(work: () => Promise<T>): Promise<T> =>
    run(async () => {
      inside += 1;
      try {
        return await work();
      } finally {
        inside -= 1;
      }
    });
  const leased: string[] = [];
  for (const name of ['setNotes', 'setPassword'] as const) {
    const real = storage[name].bind(storage);
    storage[name] = (a: string, e: string, value: string | undefined) => {
      leased.push(`${name} ${inside > 0 ? 'leased' : 'OUTSIDE the lease'}`);
      return real(a, e, value);
    };
  }

  await writer.setNotes(ACCOUNT, ENTRY, 'new note');
  await writer.setPassword(ACCOUNT, ENTRY, 'new pw');

  assert.deepEqual(leased, ['setNotes leased', 'setPassword leased']);
});

// ---- writerForNew: the caller's word that an id is new, verified (the E2 code round, findings 0 and 6) ----

test('writerForNew over an id whose entry exists and was protected stores nothing in the clear — the word "new" is checked, not taken', async () => {
  const written: string[] = [];
  const storage = await vault({ password: 'old pw' }, written);
  await protectedElsewhere(storage);
  written.length = 0;

  const outcome = await writerForNew(storage, ACCOUNT, ENTRY).setPassword(ACCOUNT, ENTRY, 'new pw').then(() => 'written', (error: unknown) => error);

  assert.deepEqual(written.filter((value) => value === 'new pw'), [], 'a writer for a "new" id wrote in the clear into an existing, protected entry');
  assert.ok(outcome instanceof ProtectedMeanwhile, `the write was not refused: ${describeError(outcome)}`);
});

test('the companion: writerForNew over a genuinely new id writes without reading a single slot — an import pays no keychain re-check', async () => {
  const storage = await vault({});
  const reads: string[] = [];
  for (const getter of ['getNotes', 'getFieldsRaw', 'getSecondRaw', 'getPaymentRaw', 'getConfigBody', 'getDbConnection', 'getVpnConfig', 'getTotp', 'getPrivateKey', 'getPassword'] as const) {
    const real = storage[getter].bind(storage);
    storage[getter] = (a: string, e: string) => {
      reads.push(getter);
      return real(a, e);
    };
  }
  const writer = writerForNew(storage, ACCOUNT, 'brand-new');

  await writer.setPassword(ACCOUNT, 'brand-new', 'pw');
  await writer.setNotes(ACCOUNT, 'brand-new', 'note');
  await writer.setDbConnection(ACCOUNT, 'brand-new', 'postgres://h/db');

  assert.deepEqual(reads, [], 'the fast path for a new id read the keychain');
  assert.equal(await storage.getPassword(ACCOUNT, 'brand-new'), 'pw');
});

// ---- writerForNew: "new" is verified at EVERY write, not remembered (the E2 second code round, findings 0-4) ----

test('writerForNew: a node that appears and is protected after the first write refuses the second — "new" is not remembered', async () => {
  const written: string[] = [];
  const storage = memoryStorage(clickVscode([], sinks()), written);
  const writer = writerForNew(storage, ACCOUNT, ENTRY);

  await writer.setNotes(ACCOUNT, ENTRY, 'first note');
  await seedEntry(storage, entry(), { notes: 'first note' });
  await protectedElsewhere(storage);
  written.length = 0;
  const second = await writer.setPassword(ACCOUNT, ENTRY, 'new pw').then(() => 'written', (error: unknown) => error);

  assert.deepEqual(written.filter((value) => value === 'new pw'), [], 'a "new" writer remembered its first check and wrote in the clear into an entry protected since');
  assert.ok(second instanceof ProtectedMeanwhile, `the write was not refused: ${describeError(second)}`);
});

test('writerForNew over an unreadable tree takes the re-checked road — an unknowable node is not an absent one', async () => {
  const written: string[] = [];
  const storage = await vault({ password: 'old pw' }, written);
  await protectedElsewhere(storage);
  storage.metadataFault = 'the tree could not be read (simulated)';
  // What a fault does to every node read (storageManager.nodePresence: 'a metadataFault makes every node read as missing').
  storage.getNode = () => undefined;
  written.length = 0;

  const outcome = await writerForNew(storage, ACCOUNT, ENTRY).setPassword(ACCOUNT, ENTRY, 'new pw').then(() => 'written', (error: unknown) => error);

  assert.deepEqual(written.filter((value) => value === 'new pw'), [], 'an unreadable tree was read as "no node", and the "new" writer wrote in the clear into a protected entry');
  assert.ok(outcome instanceof ProtectedMeanwhile, `the write was not refused: ${describeError(outcome)}`);
});
