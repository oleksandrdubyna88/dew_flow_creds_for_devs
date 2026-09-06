import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * Two changes to one node, and the second must not erase the first.
 *
 * <p><b>The defect.</b> `updateNode(accountId, node)` takes a WHOLE node from its caller and maps it
 * over the stored list. Whatever that caller read earlier is what gets written — so a rename that
 * landed in between is gone, silently, and the end state is so self-consistent that no later sweep
 * can find the loss. Fourteen call sites outside `storageManager.ts` pass a node they read earlier.</p>
 *
 * <p>It was raised by a reviewer against the PIN repair on PR #25, and verifying it showed the
 * finding was right about the property and wrong about the blame: `this.writes` — the cross-window
 * lease — guards account listing, account removal, `createEntityWithSecrets` and `applyBundle`, and
 * does NOT guard `updateNode`, `relocate` or `moveNode`. So a rename from the entity form is exposed
 * exactly as much as the PIN repair was.</p>
 *
 * <p><b>What `relocate` already does right</b> is the shape of the fix: it composes its patch onto
 * the node as it is AT WRITE TIME, so anything that changed underneath survives. These tests hold
 * that line for the whole surface.</p>
 */

function memento(): unknown {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown): Promise<void> => {
      map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      return Promise.resolve();
    },
  };
}

function secrets(): unknown {
  const map = new Map<string, string>();
  return {
    keys: (): string[] => [...map.keys()],
    get: (k: string): Promise<string | undefined> => Promise.resolve(map.get(k)),
    store: (k: string, v: string): Promise<void> => {
      map.set(k, v);
      return Promise.resolve();
    },
    delete: (k: string): Promise<void> => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: (): void => undefined,
  };
}

interface Storage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
  getNode(accountId: string, id: string): TreeNode | undefined;
  getNodes(accountId: string): readonly TreeNode[];
  updateNode(accountId: string, node: TreeNode): Promise<void>;
  updateNodeFields?(accountId: string, id: string, patch: Partial<TreeNode>): Promise<void>;
  updateDetailsFields?(accountId: string, id: string, fields: Record<string, unknown>): Promise<void>;
}

function manager(): Storage {
  const { StorageManager } = loadWithVscode<{ StorageManager: new (m: unknown, s: unknown) => Storage }>(
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
  return new StorageManager(memento(), secrets());
}

const A = 'acc-1';

const entity = (over: Partial<TreeNode> = {}): TreeNode =>
  ({
    id: 'e1',
    name: 'prod-db',
    type: 'entity',
    parentId: null,
    details: { id: 'e1', name: 'prod-db', isSshEnabled: false },
    ...over,
  }) as TreeNode;

/**
 * THE DEFECT, in the shape a person meets it: two windows, or two commands, one node.
 *
 * <p>The first reads the node. The second renames it. The first then writes what it read — and the
 * rename is gone. Nothing reports it; the vault is internally consistent afterwards; the person
 * simply finds the old name back one day.</p>
 */
test('a change that lands between a read and a write SURVIVES that write', async () => {
  const storage = manager();
  await storage.addNode(A, entity());

  // What a caller reads before it does its own work — the PIN door, the form, a mark.
  const asItWas = storage.getNode(A, 'e1')!;

  // Somebody else renames it in the meantime.
  await storage.updateNodeFields!(A, 'e1', { name: 'renamed by the other window' });

  // Now the first caller writes ITS change, composed at write time rather than from its snapshot.
  await storage.updateNodeFields!(A, 'e1', {
    details: { ...asItWas.details!, pinProtected: undefined },
  });

  const after = storage.getNode(A, 'e1')!;
  assert.equal(after.name, 'renamed by the other window', 'the rename must not be erased by a later write');
  assert.equal(after.details?.pinProtected, undefined, 'and the later write must still have happened');
});

/**
 * The same, from the other direction: a patch touches ONE field and leaves the rest alone.
 *
 * <p>A reviewer of the plan asked for exactly this, and it is the trap in the obvious alternative: a
 * merge that resurrects a field the person deliberately CLEARED is a worse defect than the one being
 * fixed, and it is silent in the same way.</p>
 */
test('a patch changes what it names and nothing else — including a field just cleared', async () => {
  const storage = manager();
  await storage.addNode(A, entity({ details: { id: 'e1', name: 'prod-db', isSshEnabled: false, host: 'db.internal' } as never }));

  // The person clears the host.
  await storage.updateNodeFields!(A, 'e1', {
    details: { id: 'e1', name: 'prod-db', isSshEnabled: false } as never,
  });
  // An unrelated write follows.
  await storage.updateNodeFields!(A, 'e1', { name: 'prod-db (retired)' });

  const after = storage.getNode(A, 'e1')!;
  assert.equal(after.name, 'prod-db (retired)');
  assert.equal(
    (after.details as { host?: string } | undefined)?.host,
    undefined,
    'a cleared field must stay cleared — a merge that brings it back is the worse defect',
  );
});

test('a patch for a node that is gone changes nothing and does not throw', async () => {
  const storage = manager();
  await storage.addNode(A, entity());

  await storage.updateNodeFields!(A, 'nobody', { name: 'ghost' });

  assert.equal(storage.getNodes(A).length, 1, 'no node was invented');
  assert.equal(storage.getNode(A, 'e1')!.name, 'prod-db', 'and the real one is untouched');
});

/**
 * The other half of the same defect, and a reviewer found it after the first half shipped.
 *
 * <p>`updateNodeFields` composes TOP-LEVEL fields at write time, and `details` is one of them — so a
 * caller changing one field inside `details` still has to build the whole object from a snapshot it
 * read earlier. Six callers do exactly that: the PIN mark, the agent flag, a dependency colour. If
 * another window changes a DIFFERENT field of the same `details` in between, this write replaces the
 * lot and that change is gone. The fix for whole nodes left the fix for their metadata undone.</p>
 *
 * <p>`updateDetailsFields` merges into the details as they ARE, and an explicitly present
 * `undefined` still clears — which is how every mark in this product is written
 * (`pinProtected: on ? true : undefined`), so clearing keeps working and omitting stops erasing.</p>
 */
test('a details field written by one caller does not erase another caller’s details field', async () => {
  const storage = manager();
  await storage.addNode(A, entity({ details: { id: 'e1', name: 'prod-db', isSshEnabled: false } as never }));

  // What a caller holds before it does its work.
  const asItWas = storage.getNode(A, 'e1')!;

  // Somebody else marks it in the meantime.
  await storage.updateDetailsFields!(A, 'e1', { sshAgent: true } as never);

  // The first caller now writes ITS field, from the snapshot it is holding.
  await storage.updateDetailsFields!(A, 'e1', { pinProtected: true } as never);

  const after = storage.getNode(A, 'e1')!.details as { sshAgent?: boolean; pinProtected?: boolean };
  assert.equal(after.sshAgent, true, 'the other field must survive — this is the defect');
  assert.equal(after.pinProtected, true, 'and this write must still have happened');
  assert.equal(asItWas.details?.name, 'prod-db', 'the snapshot the caller held is untouched');
});

test('an explicit undefined still CLEARS a details field', async () => {
  const storage = manager();
  await storage.addNode(A, entity({ details: { id: 'e1', name: 'prod-db', isSshEnabled: false, sshAgent: true } as never }));

  await storage.updateDetailsFields!(A, 'e1', { sshAgent: undefined } as never);

  const after = storage.getNode(A, 'e1')!.details as { sshAgent?: boolean };
  assert.equal(after.sshAgent, undefined, 'naming a field with undefined is how this product clears one');
  assert.equal(storage.getNode(A, 'e1')!.details?.name, 'prod-db', 'and nothing else moved');
});
