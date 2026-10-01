import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeError } from '../describeError';
import { NOTHING_OPENED } from '../editPrefill';
import { protectEntity } from '../entityPin';
import { EntryWriter, ProtectedMeanwhile, writerFor } from '../entryWriter';
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
