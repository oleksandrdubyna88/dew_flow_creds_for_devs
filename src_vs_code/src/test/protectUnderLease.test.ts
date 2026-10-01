import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeError } from '../describeError';
import { NOTHING_OPENED } from '../editPrefill';
import { protectEntity } from '../entityPin';
import { EntryWriter, ProtectedMeanwhile, writerFor } from '../entryWriter';
import { readSecret, unlockSecret } from '../secretEnvelope';
import { unattendedSealing } from '../sealingAtWrite';
import type { StorageManager } from '../storageManager';
import { EntityMetadata, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';
import { ACCOUNT, PIN, clickVscode, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * Protect against a plain write, both ways round (the E2 security review's finding 3).
 *
 * <p>The plain writer re-checks under the storage's cross-window lease that nothing was protected since
 * its decision — which guards nothing while *Protect with a PIN…* writes AROUND that lease: Protect read
 * a slot, spent a second sealing it, and wrote seal(old value) over whatever a plain write had put there
 * in that second. Each slot's read → seal → write is now atomic with respect to the lease: sealed outside
 * it (scrypt is about a second), then, under it, the slot re-read — written if unchanged, sealed again
 * from the new value if a plain write landed in between.</p>
 */

const ENTRY = 'db1';
const OWNER = { id: ENTRY, name: 'prod db' };

const entry = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: ENTRY, name: 'prod db', kind: 'db', isSshEnabled: false, ...over }) as EntityMetadata;

async function vault(slots: Record<string, string>, written: string[] = [], inputs: string[] = []): Promise<{ storage: StorageManager; stub: Record<string, unknown> }> {
  const stub = clickVscode(inputs, sinks());
  const storage = memoryStorage(stub, written);
  await seedEntry(storage, entry(), slots);
  return { storage, stub };
}

async function plainWriterOver(storage: StorageManager): Promise<EntryWriter> {
  const sealing = await unattendedSealing(storage, ACCOUNT, OWNER);
  assert.equal(sealing.kind, 'plain', 'precondition: the entry is plain and unmarked, so the proof is plain');
  return writerFor(storage, ACCOUNT, ENTRY, sealing.kind === 'plain' ? sealing : (undefined as never), NOTHING_OPENED);
}

async function opened(storage: StorageManager): Promise<string> {
  const read = readSecret(await storage.getPassword(ACCOUNT, ENTRY));
  assert.equal(read.kind, 'locked', 'the password is not sealed after Protect');
  return read.kind === 'locked' ? ((await unlockSecret(read.envelope, ACCOUNT, PIN)) ?? '') : '';
}

test('a plain write that lands while Protect is sealing that slot ends sealed — with the NEW value inside the seal, not the old', async () => {
  const { storage } = await vault({ password: 'old pw' });
  const writer = await plainWriterOver(storage);
  // The plain write lands right after Protect READ the password and before it wrote the seal: it is
  // started from inside Protect's read, the way another window's save would arrive.
  const getPassword = storage.getPassword.bind(storage);
  let plainWrite: Promise<unknown> | undefined;
  storage.getPassword = (a, e) => {
    const read = getPassword(a, e);
    plainWrite ??= writer.setPassword(ACCOUNT, ENTRY, 'new pw').then(() => 'written', (error: unknown) => error);
    return read;
  };

  await protectEntity(storage, ACCOUNT, ENTRY, PIN);

  assert.equal(await plainWrite, 'written', 'precondition: the plain write landed before anything was sealed');
  assert.equal(await opened(storage), 'new pw', 'Protect sealed the value it read before the plain write landed — the new value was overwritten and is gone');
});

test('a plain write after Protect sealed one slot of the entry is refused — nothing lands in the clear beside the seal', async () => {
  const written: string[] = [];
  const { storage } = await vault({ notes: 'old note', password: 'old pw' }, written);
  const writer = await plainWriterOver(storage);
  // The notes come first in the slot table: once their seal is written, the entry IS protected.
  const setNotes = storage.setNotes.bind(storage);
  let notesSealed: () => void = () => undefined;
  const sealedOne = new Promise<void>((done) => (notesSealed = done));
  storage.setNotes = async (a, e, value) => {
    await setNotes(a, e, value);
    notesSealed();
  };

  const protecting = protectEntity(storage, ACCOUNT, ENTRY, PIN);
  await sealedOne;
  const late = await writer.setPassword(ACCOUNT, ENTRY, 'new pw').then(() => 'written', (error: unknown) => error);
  await protecting;

  assert.deepEqual(written.filter((value) => value === 'new pw'), [], 'the plain write reached the keychain in the clear beside a sealed slot');
  assert.ok(late instanceof ProtectedMeanwhile, `the plain write was not refused: ${describeError(late)}`);
  assert.equal(await opened(storage), 'old pw');
});

test('Protect with a PIN… on an EMPTY entry writes the mark through a leased node write — a plain write decided before it is refused', async () => {
  const written: string[] = [];
  const { storage, stub } = await vault({}, written, [PIN, PIN]);
  const writer = await plainWriterOver(storage);
  const commands = loadWithVscode<typeof import('../pinCommands')>('../pinCommands', stub);
  // The mark written INSIDE a turn of the lease — the one the plain writer's re-check reads under.
  const marked = (): boolean => storage.getNode(ACCOUNT, ENTRY)?.details?.pinProtected === true;
  const lease = storage.writes;
  const run = lease.run.bind(lease);
  const markedInside: boolean[] = [];
  lease.run = async <T>(work: () => Promise<T>): Promise<T> =>
    run(async () => {
      const was = marked();
      try {
        return await work();
      } finally {
        if (!was && marked()) {
          markedInside.push(true);
        }
      }
    });

  await commands.protectEntry(storage.getNode(ACCOUNT, ENTRY) as TreeNode, { storage, accountId: ACCOUNT, refresh: () => undefined });
  const late = await writer.setPassword(ACCOUNT, ENTRY, 'new pw').then(() => 'written', (error: unknown) => error);

  assert.equal(storage.getNode(ACCOUNT, ENTRY)?.details?.pinProtected, true, 'precondition: Protect marked the empty entry');
  assert.deepEqual(markedInside, [true], 'the mark was not written inside the lease the re-check reads under');
  assert.deepEqual(written.filter((value) => value === 'new pw'), [], 'the plain write reached the keychain in the clear under the mark');
  assert.ok(late instanceof ProtectedMeanwhile, `the plain write was not refused: ${describeError(late)}`);
});
