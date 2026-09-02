import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAdditions, applyRemovals } from '../applyFormSecrets';
import { loadWithVscode } from './vscodeStub';
import type { EntityFormValues } from '../entityFormPanel';

/** `importCommands` reaches `vscode` through `dialogs`, so it loads against the shared stub. */
const { importEntities } = loadWithVscode<typeof import('../importCommands')>('../importCommands', {
  window: { showQuickPick: () => Promise.resolve(undefined), showInputBox: () => Promise.resolve(undefined) },
  Uri: { file: (p: string): object => ({ fsPath: p }) },
});

/**
 * The ORDER, asserted — which nothing did until this file existed.
 *
 * <p>Three reviewers said the same thing about S1.4: the invariant was written down, the paths were
 * reordered, and **no test asserted the order on any path**. One of them noticed that a comment in
 * `applyFormSecrets.ts` claimed `entityWriteOrder.test.ts` held it, when that file only tests the
 * sweep's pure arithmetic. A rule with no test is a comment, and this feature's whole history is
 * comments that stopped being true.</p>
 *
 * <p>So these tests record the SEQUENCE of storage calls and assert what came before what. The
 * invariant, once more:</p>
 *
 * <blockquote>An orphaned secret is the only torn state allowed to exist. Adding a reference writes
 * the referent first (secret, then node); removing one writes the referrer first (node, then
 * secret).</blockquote>
 */

/**
 * The setters that DELETE when handed nothing — as opposed to the one that keeps.
 *
 * <p>Written down here because it is genuinely confusing and it is what the whole additions/removals
 * split turns on. `setPassword(undefined)` means *"keep whatever is stored"* and returns without
 * touching the keychain (`storageManager.ts`, and the reason is recorded there: an entity converted
 * between kinds must not lose a password it still needs). Every setter below does the opposite and
 * DELETES, which makes calling it with nothing a removal — and removals belong after the node write.</p>
 *
 * <p>Verified against the implementations rather than assumed, after a test in this very file
 * mislabelled `setPassword` and sent me looking.</p>
 */
const DELETES_WHEN_EMPTY = new Set(['setNotes', 'setFields', 'setConfigBody', 'setPaymentRaw', 'setAttachment', 'setImage']);

/**
 * How one call is recorded. A `deleteX` verb is always a removal and needs no marking; a
 * dual-purpose setter is one only when handed nothing, and `setPassword` never is, because it keeps.
 */
function label(verb: string, value: unknown): string {
  if (verb.startsWith('delete')) {
    return verb;
  }
  return DELETES_WHEN_EMPTY.has(verb) && value === undefined ? `${verb}(delete)` : verb;
}

/** Every storage call, in order, as `verb` strings — the only thing these tests look at. */
function recorder(): { calls: string[]; storage: Record<string, unknown> } {
  const calls: string[] = [];
  const note = (verb: string) => (...args: unknown[]): Promise<void> => {
    calls.push(label(verb, args[2]));
    return Promise.resolve();
  };
  const storage: Record<string, unknown> = {
    addNode: (...a: unknown[]) => note('addNode')(...a, 'node'),
    updateNode: (...a: unknown[]) => note('updateNode')(...a, 'node'),
    setPassword: note('setPassword'),
    deletePassword: note('deletePassword'),
    setPrivateKey: note('setPrivateKey'),
    deletePrivateKey: note('deletePrivateKey'),
    setVpnConfig: note('setVpnConfig'),
    deleteVpnConfig: note('deleteVpnConfig'),
    setDbConnection: note('setDbConnection'),
    deleteDbConnection: note('deleteDbConnection'),
    setNotes: note('setNotes'),
    setFields: note('setFields'),
    setConfigBody: note('setConfigBody'),
    setAttachment: note('setAttachment'),
    setImage: note('setImage'),
    setTotp: note('setTotp'),
    deleteTotp: note('deleteTotp'),
    getNodes: () => [],
    getNode: () => undefined,
  };
  return { calls, storage };
}

/** A form result with nothing set — each test turns on only what it is about. */
function values(over: Partial<EntityFormValues>): EntityFormValues {
  return { details: { id: 'e1', name: 'x', isSshEnabled: false }, ...over } as EntityFormValues;
}

test('the additions pass writes values and never deletes anything', async () => {
  const { calls, storage } = recorder();
  await applyAdditions(storage as never, 'a1', 'e1', values({
    newPassword: 'pw',
    newPrivateKey: 'key',
    newNotes: 'note',
    newTotp: 'otpauth://x',
    clearPrivateKey: true,
    clearTotp: true,
    clearPassword: false,
  }));

  assert.deepEqual(
    calls.filter((c) => c.includes('delete')),
    [],
    'a delete in the additions pass happens BEFORE the node write, which is the torn state Rule A forbids',
  );
  assert.ok(calls.includes('setPassword'));
  assert.ok(calls.includes('setPrivateKey'), 'a clear flag must not suppress a value in this pass');
});

test('the removals pass deletes and never writes a value', async () => {
  const { calls, storage } = recorder();
  await applyRemovals(storage as never, 'a1', 'e1', values({
    newPassword: 'pw',
    newPrivateKey: 'key',
    clearPassword: true,
    clearPrivateKey: true,
    clearTotp: true,
  }));

  assert.deepEqual(calls, ['deletePassword', 'deletePrivateKey', 'deleteTotp', 'setNotes(delete)', 'setFields(delete)', 'setConfigBody(delete)']);
});

test('clearing notes deletes AFTER the node write, not before it', async () => {
  // The review's finding on my own split: `setNotes(undefined)` DELETES, so it is a removal. I had it
  // in the additions pass, arguing the node written afterwards would agree — but the crash happens
  // BEFORE that write, so the node still live at that moment is the OLD one, left claiming a note the
  // keychain no longer has. Exactly the failure Rule A exists to prevent, introduced by its own fix.
  const add = recorder();
  await applyAdditions(add.storage as never, 'a1', 'e1', values({ newNotes: undefined }));
  // `setPassword` is always called and is a no-op when handed nothing — it KEEPS rather than deletes,
  // which is why it is safe on this side of the node write. Filtered out so the assertion is about
  // notes and nothing else.
  assert.deepEqual(add.calls.filter((c) => c !== 'setPassword'), [], 'no deletion in the additions pass');

  const remove = recorder();
  await applyRemovals(remove.storage as never, 'a1', 'e1', values({ newNotes: undefined }));
  assert.ok(remove.calls.includes('setNotes(delete)'), 'the deletion happens in the removals pass');
});

test('a note WITH a value is written in the additions pass and not touched in removals', async () => {
  const add = recorder();
  await applyAdditions(add.storage as never, 'a1', 'e1', values({ newNotes: 'keep me' }));
  assert.deepEqual(add.calls.filter((c) => c !== 'setPassword'), ['setNotes']);

  const remove = recorder();
  await applyRemovals(remove.storage as never, 'a1', 'e1', values({ newNotes: 'keep me' }));
  // Scoped to notes: this fixture leaves `newFields` and `newConfigBody` undefined, and for those two
  // the removals pass correctly deletes — which is the behaviour the test above asserts.
  assert.deepEqual(remove.calls.filter((c) => c.startsWith('setNotes')), [], 'the note is not deleted a moment later');
});

test('importing entries writes every secret BEFORE the node that claims it', async () => {
  // One of three paths my own reviewers found with the order reversed — and the one whose window is
  // per-entity, so a five-entry import had five chances to leave a synced entry claiming a password,
  // notes, a key, a connection string and a one-time-code seed that nobody wrote.
  const { calls, storage } = recorder();

  const count = await importEntities(
    storage as never,
    { accountId: 'a1', parentId: null },
    [
      {
        name: 'prod',
        details: { name: 'prod', isSshEnabled: false },
        secrets: { password: 'pw', notes: 'n', privateKey: 'k', dbConnection: 'c', totp: 'otpauth://x' },
      } as never,
    ],
  );

  assert.equal(count, 1);
  const node = calls.indexOf('addNode');
  assert.ok(node >= 0, 'the node was written');
  for (const secret of ['setPassword', 'setNotes', 'setPrivateKey', 'setDbConnection', 'setTotp']) {
    const at = calls.indexOf(secret);
    assert.ok(at >= 0, `${secret} was written`);
    assert.ok(at < node, `${secret} must come before addNode — it came after (${calls.join(' → ')})`);
  }
});

test('importing writes no deletions at all, because an import has nothing to delete', async () => {
  // The reason each write became conditional: four of these five DELETE when handed nothing, and
  // calling them on a brand-new entry is a removal on the wrong side of the node write for no
  // benefit. (`setPassword` is the exception — it KEEPS — which is why it is not in the set above.)
  const { calls, storage } = recorder();
  await importEntities(storage as never, { accountId: 'a1', parentId: null }, [
    { name: 'bare', details: { name: 'bare', isSshEnabled: false }, secrets: {} } as never,
  ]);
  assert.deepEqual(calls, ['addNode'], 'a bare entry writes its node and nothing else');
});

/**
 * A keychain and a tree as MAPS, so a failed create can be asked what it left behind.
 *
 * <p>The recorder above watches the order; this watches the residue. Both reviewers of round 1
 * raised the same risk about the import undo — that a compensation written with the symmetric
 * setters would call `setPassword(undefined)`, which KEEPS, and silently leave the password behind.
 * The implementation calls `deletePassword`, and this is the test that says so per kind rather than
 * leaving it to the reader of one line.</p>
 */
function stores(options: { addNodeFails: boolean }): {
  storage: Record<string, unknown>;
  chain: Map<string, string>;
  tree: string[];
} {
  const chain = new Map<string, string>();
  const tree: string[] = [];
  const set = (kind: string) => (_a: string, e: string, v: string | undefined): Promise<void> => {
    // Modelled on the real setters: a value stores, and nothing DELETES — except for a password,
    // where nothing means keep. That asymmetry is the whole point of the test.
    if (v !== undefined) {
      chain.set(`${kind}:${e}`, v);
    } else if (kind !== 'password') {
      chain.delete(`${kind}:${e}`);
    }
    return Promise.resolve();
  };
  const del = (kind: string) => (_a: string, e: string): Promise<void> => {
    chain.delete(`${kind}:${e}`);
    return Promise.resolve();
  };
  const storage: Record<string, unknown> = {
    addNode: (_a: string, node: { id: string }): Promise<void> => {
      // A refused write does not land the node — which is exactly the case the compensation covers,
      // and the only one it can settle without deciding what other machines may keep.
      if (options.addNodeFails) {
        return Promise.reject(new Error('globalState is full'));
      }
      tree.push(node.id);
      return Promise.resolve();
    },
    getNode: (_a: string, id: string): object | undefined => (tree.includes(id) ? { id } : undefined),
    setPassword: set('password'),
    deletePassword: del('password'),
    setNotes: set('notes'),
    setPrivateKey: set('privateKey'),
    deletePrivateKey: del('privateKey'),
    setDbConnection: set('dbConnection'),
    deleteDbConnection: del('dbConnection'),
    setTotp: set('totp'),
    deleteTotp: del('totp'),
    getNodes: () => [],
  };
  return { storage, chain, tree };
}

const IMPORTED_KINDS = ['password', 'notes', 'privateKey', 'dbConnection', 'totp'] as const;

test('an import whose node write fails leaves NO secret of any kind behind', async () => {
  // Named per kind because the failure mode is per kind: one setter that keeps instead of deleting
  // is one permanently uncollectable orphan, and there is no tombstone to find it by.
  const { storage, chain, tree } = stores({ addNodeFails: true });

  await assert.rejects(() =>
    importEntities(storage as never, { accountId: 'a1', parentId: null }, [
      {
        name: 'prod',
        details: { name: 'prod', isSshEnabled: false },
        secrets: { password: 'pw', notes: 'n', privateKey: 'k', dbConnection: 'c', totp: 'otpauth://x' },
      } as never,
    ]),
  );

  for (const kind of IMPORTED_KINDS) {
    assert.deepEqual(
      [...chain.keys()].filter((k) => k.startsWith(`${kind}:`)),
      [],
      `${kind} survived the failed create — an orphan nothing can ever collect`,
    );
  }
  assert.deepEqual(tree, [], 'nothing to tombstone: a refused write never put the node anywhere');
});

test('the import undo asks whether the node landed, and only then deletes', async () => {
  // The single question this compensation is allowed to answer for itself. If the node IS there, the
  // entry is live and consistent and nothing is taken from it — see `entityWrite.ts` on why one
  // machine cannot decide that for its peers.
  const order: string[] = [];
  const { storage } = stores({ addNodeFails: true });
  const getNode = storage.getNode as (a: string, i: string) => object | undefined;
  const deletePassword = storage.deletePassword as (a: string, e: string) => Promise<void>;
  storage.getNode = (a: string, i: string): object | undefined => {
    order.push('getNode');
    return getNode(a, i);
  };
  storage.deletePassword = (a: string, e: string): Promise<void> => {
    order.push('deletePassword');
    return deletePassword(a, e);
  };

  await assert.rejects(() =>
    importEntities(storage as never, { accountId: 'a1', parentId: null }, [
      { name: 'x', details: { name: 'x', isSshEnabled: false }, secrets: { password: 'pw' } } as never,
    ]),
  );

  assert.deepEqual(order, ['getNode', 'deletePassword']);
});

test('a successful import leaves every secret in place and undoes nothing', async () => {
  const { storage, chain, tree } = stores({ addNodeFails: false });

  await importEntities(storage as never, { accountId: 'a1', parentId: null }, [
    {
      name: 'prod',
      details: { name: 'prod', isSshEnabled: false },
      secrets: { password: 'pw', notes: 'n', privateKey: 'k', dbConnection: 'c', totp: 'otpauth://x' },
    } as never,
  ]);

  assert.equal(chain.size, IMPORTED_KINDS.length, 'all five kinds stored');
  assert.equal(tree.length, 1);
});

/**
 * A restore/sync-apply records what it is about to make unreachable — Rule B, on the one path that
 * removes entities without ever calling a delete.
 *
 * <p>Found by my own reviewer in the S1.4 round, and it is the same defect class the story exists to
 * close: `importBundle` replaced the tree and only then dropped the secrets of the entities the new
 * tree no longer contains. A crash in between left keychain entries that NOTHING named — the sweep
 * only ever considers tombstoned ids — so they were uncollectable forever.</p>
 */
test('a restore RECORDS the entries it is dropping before it replaces the tree', async () => {
  const { StorageManager } = loadWithVscode<{ StorageManager: new (m: unknown, s: unknown) => Record<string, Function> }>(
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

  const order: string[] = [];
  const map = new Map<string, unknown>();
  const mem = {
    keys: () => [...map.keys()],
    get: <T>(k: string, f?: T): T | undefined => (map.has(k) ? (map.get(k) as T) : f),
    update: (k: string, v: unknown): Promise<void> => {
      const note = mementoNote(k, v);
      if (note !== undefined) {
        order.push(note);
      }
      map.set(k, v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
      return Promise.resolve();
    },
  };
  const chain = new Map<string, string>();
  const store = {
    keys: () => [...chain.keys()],
    get: (k: string) => Promise.resolve(chain.get(k)),
    store: (k: string, v: string) => {
      chain.set(k, v);
      return Promise.resolve();
    },
    delete: (k: string) => {
      order.push('secretDelete');
      chain.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => {},
  };
  const storage = new StorageManager(mem, store);

  const entry = (id: string): object => ({
    id,
    name: id,
    type: 'entity',
    parentId: null,
    details: { id, name: id, isSshEnabled: false },
  });
  await storage.addNode('a1', entry('keeps'));
  await storage.addNode('a1', entry('vanishes'));
  await storage.setPassword('a1', 'vanishes', 'pw');
  order.length = 0;

  // A backup that simply does not contain `vanishes` — it carries no tombstone for it either.
  await storage.importBundle('a1', { nodes: [entry('keeps')], passwords: {} });

  const recorded = order.findIndex((c) => c.startsWith('pending:'));
  const treeReplaced = order.indexOf('nodes');
  const firstDelete = order.indexOf('secretDelete');
  assert.ok(recorded >= 0, `a record was written (${order.join(' → ')})`);
  assert.ok(order[recorded].includes('vanishes'), 'and it names the id that is going');
  assert.ok(recorded < treeReplaced, 'before the tree that named it was replaced');
  assert.ok(treeReplaced < firstDelete, 'and the secret went after the node stopped claiming it');
  assert.deepEqual([...chain.keys()], [], 'the vanished entry keeps nothing in the keychain');
  // The bundle's OWN tombstones are restored at the end, as the final state — that write is fine.
  // What must not exist is a MINTED one, before the tree goes: a published record of this removal
  // either loses the merge to a live remote node, or publishes a deletion meant only locally.
  const mintedEarly = order.slice(0, treeReplaced).some((c) => c.startsWith('tombstones:'));
  assert.equal(mintedEarly, false, `no tombstone was minted for the vanishing id (${order.join(' → ')})`);
});

/** What a memento write means for the order under test — the tree, or the record naming what leaves it. */
function mementoNote(key: string, value: unknown): string | undefined {
  const notes: ReadonlyArray<[string, (v: unknown) => string]> = [
    ['credSshManager.pendingCleanup', (v) => `pending:${JSON.stringify(v ?? {})}`],
    ['credSshManager.tombstones.', (v) => `tombstones:${Object.keys((v ?? {}) as object).join(',')}`],
    ['credSshManager.nodes.', () => 'nodes'],
  ];
  return notes.find(([prefix]) => key.startsWith(prefix))?.[1](value);
}
