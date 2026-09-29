import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_SLOTS, SecretSlot } from '../entitySlots';
import type { RevisionSecrets } from '../revisionHistory';
import type { StorageManager } from '../storageManager';
import { EntityMetadata, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';
import { ACCOUNT, PIN, Sinks, clickVscode, locked, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * D14-D15 of the entry-PIN plan, through the commands a person runs: *Protect with a PIN…* and
 * *Remove PIN Protection…*, over the REAL `StorageManager`.
 *
 * <p>D15 was a dead end: an entry whose mark was lost (an Edit before 1.12, a sync) while its values
 * stayed locked showed only *Protect…*, which answered "already has its own PIN" and offered nothing.
 * D14: Remove PIN over a damaged value cleared the mark anyway. And an entry unprotected on another
 * machine, whose kept versions HERE are still sealed, answered "is not protected" — the one command
 * that could open this machine's history refused to (plan gate, finding 3).</p>
 */

const ENTRY = 'c1';
const DAMAGED = '{"v":1,"lock":{"wrap":{}}}';

const credential = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: ENTRY, name: 'godaddy', isSshEnabled: false, kind: 'credential', ...over }) as EntityMetadata;

interface World {
  commands: typeof import('../pinCommands');
  storage: StorageManager;
  s: Sinks;
  node(): TreeNode;
  deps: { storage: StorageManager; accountId: string; refresh: () => void };
}

async function world(details: EntityMetadata, slots: Record<string, string>, inputs: (string | undefined)[], modal: (string | undefined)[] = [], kept?: RevisionSecrets): Promise<World> {
  const s = sinks();
  s.modalAnswers.push(...modal);
  const stub = clickVscode([...inputs], s);
  const storage = memoryStorage(stub);
  await seedEntry(storage, details, slots);
  if (kept !== undefined) {
    await storage.recordRevision(ACCOUNT, ENTRY, { at: 1, name: 'godaddy', details, secrets: kept });
    assert.equal((await storage.getHistory(ACCOUNT, ENTRY)).length, 1, 'precondition: the revision validator took the fixture');
  }
  const commands = loadWithVscode<typeof import('../pinCommands')>('../pinCommands', stub);
  const node = (): TreeNode => storage.getNode(ACCOUNT, ENTRY) as TreeNode;
  return { commands, storage, s, node, deps: { storage, accountId: ACCOUNT, refresh: () => undefined } };
}

function slot(label: string): SecretSlot {
  const found = SECRET_SLOTS.find((one) => one.label === label);
  assert.ok(found !== undefined);
  return found;
}

const stored = (w: World, label: string): Thenable<string | undefined> => slot(label).read(w.storage, ACCOUNT, ENTRY);

test('Protect on an entry that is already protected says how much is locked and offers Remove PIN Protection… — not a dead end', async () => {
  // The mark was lost (D3, D12) while the values stayed locked: the row is `:pinoff`, so Protect is
  // the only thing offered on it.
  const w = await world(credential(), { notes: await locked('the note'), password: await locked('hunter2') }, [PIN], ['Remove PIN Protection…']);

  await w.commands.protectEntry(w.node(), w.deps);

  assert.match(w.s.warnings[0] ?? '', /^"godaddy" already has its own PIN \(2 of 2 values are locked\)\. To set a different one, remove the protection first\.$/);
  assert.equal(await stored(w, 'password'), 'hunter2', 'the button did what it says');
  assert.equal(await stored(w, 'notes'), 'the note');
});

test('Remove PIN over a damaged value asks first, and "Remove the PIN from the rest" leaves that value exactly as it was', async () => {
  const w = await world(credential({ pinProtected: true }), { notes: DAMAGED, password: await locked('hunter2') }, [PIN], ['Remove the PIN from the rest']);

  await w.commands.unprotectEntry(w.node(), w.deps);

  assert.equal(
    w.s.warnings[0],
    '"godaddy" holds a damaged protected value (notes). Removing the PIN cannot open it: it would stay unreadable while the entry stops claiming a PIN.',
  );
  assert.equal(await stored(w, 'password'), 'hunter2');
  assert.equal(await stored(w, 'notes'), DAMAGED, 'byte-identical');
  assert.equal(w.node().details?.pinProtected, undefined, 'the person chose to take the mark off the rest');
  assert.match(w.s.infos.join(' '), /"godaddy" is no longer protected with its own PIN\. Its notes could not be opened and was left exactly as it was\./);
});

test('Remove PIN over a damaged value, declined, changes nothing and keeps the mark', async () => {
  const lockedPw = await locked('hunter2');
  const w = await world(credential({ pinProtected: true }), { notes: DAMAGED, password: lockedPw }, [PIN], [undefined]);

  await w.commands.unprotectEntry(w.node(), w.deps);

  assert.equal(await stored(w, 'password'), lockedPw);
  assert.equal(await stored(w, 'notes'), DAMAGED);
  assert.equal(w.node().details?.pinProtected, true, 'an entry with an unreadable value keeps claiming its PIN');
});

test('Remove PIN Protection… on an entry whose only sealed values are its kept versions opens them', async () => {
  // Plan gate, finding 3: unprotected on another machine and synced here.
  const w = await world(credential(), { password: 'hunter2' }, [PIN], [], { password: await locked('old pw') });

  await w.commands.unprotectEntry(w.node(), w.deps);

  assert.doesNotMatch(w.s.infos.join(' '), /is not protected/);
  assert.equal((await w.storage.getHistory(ACCOUNT, ENTRY))[0].secrets.password, 'old pw');
});

test('Protect on an entry whose kept versions are still sealed under its old PIN offers Remove PIN Protection… for them', async () => {
  const w = await world(credential(), { password: 'hunter2' }, [PIN], ['Remove PIN Protection…'], { password: await locked('old pw') });

  await w.commands.protectEntry(w.node(), w.deps);

  assert.match(w.s.warnings[0] ?? '', /"godaddy" is not protected, but 1 value in its kept versions on this machine is still sealed under the PIN it used to have\./);
  assert.equal((await w.storage.getHistory(ACCOUNT, ENTRY))[0].secrets.password, 'old pw');
  assert.equal(await stored(w, 'password'), 'hunter2', 'the live entry stayed as it was');
});

test('Remove PIN reports a kept value under a different PIN as left sealed', async () => {
  const w = await world(credential({ pinProtected: true }), { password: await locked('hunter2') }, [PIN], [], { notes: await locked('other', '9876') });

  await w.commands.unprotectEntry(w.node(), w.deps);

  assert.equal(await stored(w, 'password'), 'hunter2');
  assert.match(w.s.infos.join(' '), /1 value in its kept versions is sealed under a different PIN and stays sealed\./);
});

test('Protect and Remove PIN each write the mark AND one more protection decision, in ONE node write (R6)', async () => {
  // The sync rule settles a concurrent disagreement by the later DECISION (§5.9), so the count has to
  // move with the mark, never apart from it: one write, evaluated inside the write lease.
  const w = await world(credential(), { password: 'hunter2' }, [PIN, PIN, PIN]);
  let nodeWrites = 0;
  const real = w.storage.updateNodeFields.bind(w.storage);
  w.storage.updateNodeFields = (a, id, patch) => {
    nodeWrites += 1;
    return real(a, id, patch);
  };

  await w.commands.protectEntry(w.node(), w.deps);
  assert.deepEqual([w.node().details?.pinProtected, w.node().pinEpoch, nodeWrites], [true, 1, 1], 'protected: the mark, epoch 1, one write');

  await w.commands.unprotectEntry(w.node(), w.deps);
  assert.deepEqual([w.node().details?.pinProtected, w.node().pinEpoch, nodeWrites], [undefined, 2, 2], 'removed: no mark, epoch 2, one more write');
});
