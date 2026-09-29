import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_SLOTS } from '../entitySlots';
import { SMALL_FIELDS } from '../revisionHistory';
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
