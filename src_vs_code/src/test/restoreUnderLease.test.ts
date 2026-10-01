import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectEntity } from '../entityPin';
import { readSecret, unlockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import { protectionDecision } from '../syncPinRule';
import { EntityMetadata, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';
import { ACCOUNT, PIN, clickVscode, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * *Restore This Version…* into a PLAIN entry, through the re-checked road (the E2 security review,
 * finding 2).
 *
 * <p>Restore decides after its confirmation (`sealingAtWrite`) — plain, for an entry that is neither
 * sealed nor marked — and then writes. Its plain path dropped the proof (`pinOf(sealing)` →
 * `undefined`) and wrote `slot.write(storage, …)`: no lease, no re-check. An entry another window
 * protected between the decision and the writes was restored IN THE CLEAR beside its seal. The plain
 * path now writes through `writerFor` with the plain proof: every write under the lease, each re-checked.</p>
 */

const ENTRY = 'c1';
const AT = 1_700_000_000_000;

const credential = (): EntityMetadata => ({ id: ENTRY, name: 'godaddy', isSshEnabled: false, kind: 'credential' }) as EntityMetadata;

async function openedPassword(storage: StorageManager): Promise<string | undefined> {
  const read = readSecret(await storage.getPassword(ACCOUNT, ENTRY));
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, PIN) : read.kind;
}

test('an entry protected between Restore\'s decision and its writes has nothing restored in the clear', async () => {
  const s = sinks();
  s.modalAnswers.push('Restore');
  const stub = clickVscode([], s);
  const written: string[] = [];
  const storage: StorageManager = memoryStorage(stub, written);
  await seedEntry(storage, credential(), { password: 'new pw', notes: 'new note' });
  await storage.recordRevision(ACCOUNT, ENTRY, { at: AT, name: 'godaddy', details: credential(), secrets: { password: 'old pw', notes: 'old note' } });
  const handlers = new Map<string, (target: unknown) => unknown>();
  const commands = loadWithVscode<typeof import('../pinCommands')>('../pinCommands', stub);
  commands.registerPinCommands({ register: (id, handler) => void handlers.set(id, handler), storage, refresh: () => undefined });
  (require('../envCollectionRef') as typeof import('../envCollectionRef')).setEnvCollection({ replace: () => undefined, delete: () => undefined } as never);
  // "Another window": after Restore decided (plain — nothing sealed, no mark) and recorded today's
  // state, before its first value — the entry is protected the way Protect does it.
  const record = storage.recordRevision.bind(storage);
  storage.recordRevision = async (a, e, revision) => {
    await record(a, e, revision);
    await protectEntity(storage, ACCOUNT, ENTRY, PIN);
    await storage.updateNodeFields(ACCOUNT, ENTRY, protectionDecision(true));
  };
  written.length = 0;

  const restore = handlers.get('credSshManager.restoreRevision') as (target: unknown) => Promise<void>;
  await restore({ kind: 'revision', accountId: ACCOUNT, node: storage.getNode(ACCOUNT, ENTRY) as TreeNode, index: 0 });

  assert.deepEqual(written.filter((value) => value === 'old pw' || value === 'old note'), [], 'Restore wrote the kept version in the clear into an entry protected meanwhile');
  assert.equal(await openedPassword(storage), 'new pw','the other window\'s seal was overwritten');
  assert.equal(storage.getNode(ACCOUNT, ENTRY)?.details?.pinProtected, true, 'the other window\'s mark was taken off');
  assert.match(s.warnings.join(' '), /was protected with a PIN — in another window or by a sync/, 'the person was not told why nothing was restored');
});
