import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_SLOTS } from '../entitySlots';
import { SMALL_FIELDS } from '../revisionHistory';
import { snapshotForRevision } from '../revisionSnapshot';
import { SECRET_KINDS } from '../secretMaps';
import { rotationQuarantineSecretKey } from '../secretKeys';
import { clickVscode, memoryStorage, sinks } from './pinWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * The slot table is the ONE list every walker of an entry's secrets reads (§7.3 of the entry-PIN
 * plan). Two more columns joined it: the field a revision keeps the slot under, and the deleter
 * that removes it — so a restore and the history rewrite can walk the same ten rows instead of
 * spelling a second list that drifts.
 *
 * <p>Derived, never retyped: the revision's own `SMALL_FIELDS` is the source of truth for what a
 * revision keeps, and the table is asserted against it rather than against a copy written here —
 * the rule the testing doctrine states about a test that repeats a list the code also holds.</p>
 */

test('every slot names the revision field it is kept under, and together they are exactly what a revision keeps', () => {
  assert.deepEqual(
    [...SECRET_SLOTS.map((slot) => slot.revisionField)].sort(),
    [...SMALL_FIELDS].sort(),
    'a slot without a revision field is a value history silently drops; a field without a slot is one nothing restores',
  );
});

test('no two slots share a label or a revision field', () => {
  const labels = SECRET_SLOTS.map((slot) => slot.label);
  const fields = SECRET_SLOTS.map((slot) => slot.revisionField);
  assert.equal(new Set(labels).size, labels.length, 'two slots with one label would be reported as one');
  assert.equal(new Set(fields).size, fields.length, 'two slots under one revision field would overwrite each other');
});

test('every slot has a remove, and each one really empties its slot — the password through its DELETER, never the "keep" an empty write means', async () => {
  // Over the REAL StorageManager, because the trap is specific: `setPassword('')` keeps what is
  // stored, so a remove that reached the writer with nothing would be a no-op that reads as a
  // deletion. Only the slot's own deleter empties it, and only reading it back proves that.
  const { StorageManager } = loadWithVscode<{ StorageManager: new (memento: unknown, secrets: unknown) => unknown }>(
    '../storageManager',
    {
      EventEmitter: class {
        event = (): void => {};
        fire(): void {}
      },
      Uri: { file: (p: string): object => ({ fsPath: p }) },
      workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
    },
  );
  const storage = new StorageManager(memento(), secrets()) as never;

  for (const slot of SECRET_SLOTS) {
    assert.equal(typeof slot.remove, 'function', `${slot.label} has no remove`);
    await slot.write(storage, 'acc', 'e1', `value of ${slot.label}`);
    assert.equal(await slot.read(storage, 'acc', 'e1'), `value of ${slot.label}`, `${slot.label} was not written`);

    await slot.remove(storage, 'acc', 'e1');

    assert.equal(await slot.read(storage, 'acc', 'e1'), undefined, `${slot.label} survived its own remove`);
  }
});

/** The two kinds the vault stores that the table deliberately leaves outside the PIN (`entitySlots.ts`). */
const OUTSIDE_THE_PIN = ['attachments', 'images'];

test('every bundle key the vault stores is a slot’s bundleKey or one of the two outside the PIN, and no slot names a key the vault does not store', () => {
  assert.deepEqual(
    [...SECRET_SLOTS.map((slot) => slot.bundleKey), ...OUTSIDE_THE_PIN].sort(),
    SECRET_KINDS.map((kind) => kind.bundleKey).sort(),
    'a slot the bundle cannot carry is a value sync drops; a stored kind with no slot is one the PIN never wraps',
  );
});

test('snapshotForRevision reads exactly the table’s getters — every slot once, nothing beside them', async () => {
  // The recording storage `pinReaderBoundary.slotGetters` asks the table with, here asked of the
  // snapshot too: a getter the snapshot reads and no slot names is a value history keeps that no
  // restore puts back; a slot the snapshot skips is a value history silently drops.
  const fromTable = recordedReads();
  for (const slot of SECRET_SLOTS) {
    await slot.read(fromTable.storage, 'acc', 'e1');
  }
  const fromSnapshot = recordedReads();
  const details = { id: 'e1', name: 'n', isSshEnabled: false };
  await snapshotForRevision(fromSnapshot.storage, 'acc', { id: 'e1', name: 'n', details });

  assert.equal(new Set(fromTable.called).size, SECRET_SLOTS.length, 'the recorder saw one distinct getter per slot');
  assert.deepEqual([...fromSnapshot.called].sort(), [...fromTable.called].sort());
});

/** A storage that answers every method with nothing and records which ones were called. */
function recordedReads(): { storage: never; called: string[] } {
  const called: string[] = [];
  const storage = new Proxy(
    {},
    {
      get: (_target, name) => (): Promise<undefined> => {
        called.push(String(name));
        return Promise.resolve(undefined);
      },
    },
  ) as never;
  return { storage, called };
}

function memento(): { get<T>(key: string, fallback?: T): T | undefined; update(key: string, value: unknown): Promise<void> } {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown): Promise<void> => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

function secrets(): { keys(): string[]; get(k: string): Promise<string | undefined>; store(k: string, v: string): Promise<void>; delete(k: string): Promise<void>; onDidChange(): void } {
  const map = new Map<string, string>();
  return {
    keys: () => [...map.keys()],
    get: (k) => Promise.resolve(map.get(k)),
    store: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
    delete: (k) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => {},
  };
}

test('the rotation\'s held value is in no slot and no bundle kind, so nothing that walks either ever reads it (rotation-quarantine plan §4.1)', async () => {
  const held = rotationQuarantineSecretKey('acc', 'e1');
  const reads: string[] = [];
  const storage = memoryStorage(clickVscode([], sinks()), [], reads);

  for (const slot of SECRET_SLOTS) {
    await slot.read(storage, 'acc', 'e1');
  }

  assert.ok(!SECRET_KINDS.some((kind) => kind.key('acc', 'e1') === held), 'a bundle kind carries the held rotation — sync, backup and import would move it');
  assert.ok(reads.length >= SECRET_SLOTS.length, 'the control: the slot reads were not seen at all');
  assert.ok(!reads.includes(held), 'a slot reads the held rotation — Protect, the door and history would treat it as the entry\'s');
});
