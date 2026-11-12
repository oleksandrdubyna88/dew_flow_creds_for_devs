import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { DEP_COLOR_KEYS, DepColorKey, isDepColorKey } from '../depColors';
import { ensureFolderColor, FolderColorStorage } from '../folderColors';
import { nodesKey } from '../stateKeys';
import { TreeNode, isTreeNode } from '../types';
import { FolderColorFake, folderColorStorage } from './folderColorStorage';
import { sharedMemento, sharedSecrets, storageManagerOver, twoWindows } from './twoWindowsWorld';
import { cleanupScope, ownedDir } from '../../scripts/lib/leftovers.cjs';

/**
 * `ensureFolderColor`: the first terminal of an uncoloured folder gives the folder a colour, once, and
 * two callers never leave two folders with one colour.
 *
 * <p>Run over a fake storage (`folderColorStorage.ts`, a second implementation of the contract) and, for the
 * scenarios marked [fake] and [real], over one real `StorageManager` too. Two windows are two real managers
 * over ONE memento object and one real lock directory (R4): that proves the lease's serialization, and only because
 * window a is held at its memento write while b starts; without that hold the calls never overlap at a write and the
 * lock proves nothing. It does NOT prove the broadcast of a real window, whose late arrival R4b and the R4 control
 * show. Every scenario that expects
 * "nothing was written" ends with a positive tail in the same world, so a fake that records nothing cannot pass.</p>
 */
const scope = cleanupScope();
after(() => scope.close());

const A = 'acc-a';
const B = 'acc-b';
const K = DEP_COLOR_KEYS;

/** A fixture that is a real node: it passes the same guard storage reads through. */
function node(fields: Partial<TreeNode> & Pick<TreeNode, 'id' | 'type'>): TreeNode {
  const built: TreeNode = { name: fields.id, parentId: null, ...fields };
  assert.ok(isTreeNode(built), `the fixture ${fields.id} is not a valid node`);
  return built;
}
const folder = (id: string, folderColor?: string, parentId: string | null = null): TreeNode =>
  node({ id, type: 'folder', parentId, folderColor });
const entry = (id: string, parentId: string | null | undefined, depColor?: string): TreeNode =>
  node({ id, type: 'entity', parentId, details: { id, name: id, isSshEnabled: false, depColor } });
const trash = (folderColor?: string): TreeNode => node({ id: 'trash', type: 'folder', isTrash: true, folderColor });
/** The positive tail's world: an uncoloured folder with an entry. */
const LIVE: readonly TreeNode[] = [folder('f-live'), entry('e-live', 'f-live')];

interface RealStorage extends FolderColorStorage {
  addNode(accountId: string, node: TreeNode): Promise<void>;
}

/** One storage under test, fake or real, seeded; `writes` counts list writes and `updates` every memento write. */
interface World {
  readonly storage: FolderColorStorage;
  readonly fake?: FolderColorFake;
  readonly writes: () => number;
  readonly updates: () => number;
}
type Seed = Readonly<Record<string, readonly TreeNode[]>>;
type Build = (seed: Seed) => Promise<World>;

const buildFake: Build = (seed) => {
  const fake = folderColorStorage(seed);
  return Promise.resolve({ storage: fake, fake, writes: () => fake.written.length, updates: () => fake.written.length });
};

async function seeded(storage: RealStorage, seed: Seed): Promise<void> {
  for (const [account, nodes] of Object.entries(seed)) {
    for (const n of nodes) {
      await storage.addNode(account, n);
    }
  }
}

const buildReal: Build = async (seed) => {
  const memento = sharedMemento();
  const keys: string[] = [];
  const recording = {
    get: memento.api.get,
    update: (key: string, value: unknown): Promise<void> => {
      keys.push(key);
      return memento.api.update(key, value);
    },
  };
  const storage = storageManagerOver<RealStorage>(recording, sharedSecrets().api);
  await seeded(storage, seed);
  keys.length = 0;
  const lists = new Set(Object.keys(seed).map(nodesKey));
  return { storage, writes: () => keys.filter((key) => lists.has(key)).length, updates: () => keys.length };
};

/** The same body over the fake and over one real `StorageManager`. */
function both(name: string, body: (build: Build) => Promise<void>): void {
  for (const [kind, build] of [['fake', buildFake], ['real', buildReal]] as const) {
    test(`${name} [${kind}]`, () => body(build));
  }
}

const colorOf = (w: World, id: string, account = A): string | undefined => w.storage.getNode(account, id)?.folderColor;
const textOf = (w: World, id: string, account = A): string => JSON.stringify(w.storage.getNode(account, id));
const ensure = (w: World, entryId: string, account = A): Promise<DepColorKey | undefined> =>
  ensureFolderColor(w.storage, account, entryId);

function assertQuiet(w: World): void {
  assert.equal(w.writes(), 0, 'no list write');
  assert.equal(w.updates(), 0, 'no memento write at all');
}

/** In the same world, an entry of the uncoloured `f-live` gets a key and costs exactly one write. */
async function positiveTail(w: World): Promise<void> {
  const before = w.writes();
  const key = await ensure(w, 'e-live');
  assert.ok(isDepColorKey(key), 'positive tail: the live folder got a palette key');
  assert.equal(colorOf(w, 'f-live'), key);
  assert.equal(w.writes(), before + 1, 'positive tail: and it cost one write');
}

// ---------- 5.1 It assigns, once ----------

both('the_first_call_colours_the_folder_once_and_returns_the_key', async (build) => {
  const w = await build({ [A]: [folder('f1'), entry('e1', 'f1')] });
  assert.equal(colorOf(w, 'f1'), undefined, 'Given: f1 has no colour');

  assert.equal(await ensure(w, 'e1'), K[0]);
  assert.equal(colorOf(w, 'f1'), K[0]);
  assert.equal(w.writes(), 1, 'exactly one write');
  if (w.fake !== undefined) {
    assert.deepEqual(w.fake.written.map((c) => [c.id, c.byFunction]), [['f1', true]], 'on f1, with a function patch');
  }
  assert.equal(await ensure(w, 'e1'), K[0]);
  assert.equal(w.writes(), 1, 'the second call is no call');
});

both('a_known_colour_is_returned_and_nothing_is_written', async (build) => {
  const w = await build({ [A]: K.flatMap((key, i) => [folder(`f${i}`, key), entry(`e${i}`, `f${i}`)]) });
  for (const [i, key] of K.entries()) {
    assert.equal(colorOf(w, `f${i}`), key, 'Given: the folder wears the key');
    assert.equal(await ensure(w, `e${i}`), key);
  }
  assertQuiet(w);
});

both('an_unknown_stored_value_is_kept_as_it_is_and_gives_no_key', async (build) => {
  assert.equal(isDepColorKey('depColor99'), false, 'Given: this build does not know depColor99');
  const w = await build({ [A]: [folder('f1', 'depColor99'), entry('e1', 'f1'), folder('f2', ''), entry('e2', 'f2'), ...LIVE] });
  assert.equal(colorOf(w, 'f1'), 'depColor99');
  assert.equal(colorOf(w, 'f2'), '');
  const [one, two] = [w.storage.getNode(A, 'f1'), w.storage.getNode(A, 'f2')];
  const text = [textOf(w, 'f1'), textOf(w, 'f2')];

  assert.deepEqual([await ensure(w, 'e1'), await ensure(w, 'e2')], [undefined, undefined]);
  assertQuiet(w);
  assert.deepEqual([textOf(w, 'f1'), textOf(w, 'f2')], text, 'byte-identical, v and updatedAt included');
  if (w.fake !== undefined) {
    assert.equal(w.storage.getNode(A, 'f1'), one, 'the fake: the same node object');
    assert.equal(w.storage.getNode(A, 'f2'), two);
  } else {
    assert.deepEqual([w.storage.getNode(A, 'f1'), w.storage.getNode(A, 'f2')], [one, two]);
  }
  await positiveTail(w);
});

test('nothing_is_written_at_the_root_for_a_dangling_parent_or_a_missing_entry', async () => {
  const w = await buildFake({ [A]: [entry('e-null', null), entry('e-undef', undefined), entry('e-gone', 'gone'), ...LIVE] });
  assert.equal(w.storage.getNode(A, 'gone'), undefined, 'Given: the parent is not there');
  assert.deepEqual(['e-null', 'e-undef'].map((id) => w.storage.getNode(A, id)?.parentId ?? null), [null, null], 'Given: no parent');
  assert.equal(w.storage.getNode(A, 'e-gone')?.parentId, 'gone', 'Given: a dangling parent');
  const list = w.storage.getNodes(A);

  for (const id of ['e-null', 'e-undef', 'e-gone', 'no-such-entry']) {
    assert.equal(await ensure(w, id), undefined, id);
  }
  assertQuiet(w);
  assert.equal(w.storage.getNodes(A), list, 'the node list is the same object');
  await positiveTail(w);
});

test('nothing_is_written_in_the_trash_at_any_depth', async () => {
  const w = await buildFake({
    [A]: [
      trash(), entry('e1', 'trash'),
      folder('f-del', undefined, 'trash'), entry('e2', 'f-del'),
      folder('f-deep', undefined, 'f-del'), entry('e3', 'f-deep'),
      folder('f-kept', K[3], 'trash'), entry('e4', 'f-kept'),
      ...LIVE,
    ],
  });
  assert.equal(colorOf(w, 'f-kept'), K[3], 'Given: the kept folder wears a key');
  assert.deepEqual(['f-del', 'f-kept'].map((id) => w.storage.getNode(A, id)?.parentId), ['trash', 'trash'], 'Given: under the trash');
  assert.equal(w.storage.getNode(A, 'f-deep')?.parentId, 'f-del', 'Given: f-deep sits in f-del, two levels down');

  assert.deepEqual([await ensure(w, 'e1'), await ensure(w, 'e2'), await ensure(w, 'e3')], [undefined, undefined, undefined]);
  assert.equal(await ensure(w, 'e4'), K[3]);
  assertQuiet(w);
  await positiveTail(w);
});

test('a_parent_that_is_not_a_folder_is_left_alone', async () => {
  const w = await buildFake({ [A]: [entry('ent', null), entry('e1', 'ent'), ...LIVE] });
  assert.equal(w.storage.getNode(A, 'ent')?.type, 'entity', 'Given: the parent is an entity');

  assert.equal(await ensure(w, 'e1'), undefined);
  assertQuiet(w);
  await positiveTail(w);
});

test('the_pick_is_the_least_used_among_this_accounts_folders_only', async () => {
  const free = K[5];
  const worn = K.filter((key) => key !== free).map((key, i) => folder(`f-${i}`, key));
  const w = await buildFake({
    [A]: [
      ...worn, trash(free), folder('f-bad', 'depColor99'),
      entry('d1', null, free), entry('d2', null, free), entry('d3', null, free),
      folder('f1'), entry('e1', 'f1'),
    ],
    [B]: [0, 1, 2, 3].map((i) => folder(`b-${i}`, free)),
  });
  assert.equal(w.storage.getNodes(A).filter((n) => n.folderColor === free).length, 1, 'Given: only the trash wears it');

  assert.equal(await ensure(w, 'e1'), free);
});

test('only_the_direct_parent_folder_is_coloured', async () => {
  const w = await buildFake({ [A]: [folder('outer'), folder('inner', undefined, 'outer'), entry('e1', 'inner')] });

  assert.equal(await ensure(w, 'e1'), K[0]);
  assert.deepEqual(w.fake?.written.map((c) => c.id), ['inner']);
  assert.equal(colorOf(w, 'inner'), K[0]);
  assert.equal(colorOf(w, 'outer'), undefined);
});

// ---------- 5.2 Races ----------

both('two_calls_for_one_uncoloured_folder_change_it_once_and_agree', async (build) => {
  const w = await build({ [A]: [folder('f0', K[0]), folder('f1'), entry('e1', 'f1'), entry('e2', 'f1')] });
  assert.equal(colorOf(w, 'f1'), undefined, 'Given: f1 has no colour');

  const [first, second] = await Promise.all([ensure(w, 'e1'), ensure(w, 'e2')]);

  assert.deepEqual([first, second], [K[1], K[1]]);
  assert.equal(colorOf(w, 'f1'), K[1]);
  if (w.fake !== undefined) {
    const changes = w.fake.written.map((c) => c.change);
    assert.equal(changes.filter((c) => c?.folderColor !== undefined).length, 1, 'one change carries the colour');
    assert.deepEqual(changes.filter((c) => c?.folderColor === undefined), [{}], 'the other is empty');
  }
});

both('two_calls_for_two_uncoloured_folders_get_two_keys', async (build) => {
  const w = await build({ [A]: [folder('f1'), entry('e1', 'f1'), folder('f2'), entry('e2', 'f2')] });

  const [first, second] = await Promise.all([ensure(w, 'e1'), ensure(w, 'e2')]);

  assert.notEqual(first, second);
  assert.deepEqual([first, second].sort(), [K[0], K[1]].sort());
  assert.deepEqual([colorOf(w, 'f1'), colorOf(w, 'f2')], [first, second]);
});

test('without_a_lease_two_folders_would_get_one_key_and_that_is_the_point', async () => {
  const fake = folderColorStorage(
    { [A]: [folder('f1'), entry('e1', 'f1'), folder('f2'), entry('e2', 'f2')] },
    { serial: false },
  );

  const keys = await Promise.all([ensureFolderColor(fake, A, 'e1'), ensureFolderColor(fake, A, 'e2')]);

  assert.deepEqual(keys, [K[0], K[0]], 'the control: the fake CAN interleave, so R2 passes by serialization');
});

/** Two real managers over ONE memento, seeded through window `a`; with `locked` they share a real lock directory. */
async function windows(seed: readonly TreeNode[], locked = true) {
  const world = twoWindows<RealStorage>(locked ? ownedDir(scope, 'window-lock') : undefined);
  await seeded(world.a, { [A]: seed });
  return world;
}

/**
 * Window a is held at its memento write of the list, window b starts meanwhile, a few macrotasks pass, then a goes on.
 * Without the hold the real manager reads, patches and sets the shared map in one synchronous run and the lock has
 * nothing to serialize.
 */
async function startedWhileAIsHeld(world: Awaited<ReturnType<typeof windows>>, entries: readonly [string, string]) {
  const gate = world.memento.pauseOn(nodesKey(A));
  const fromA = ensureFolderColor(world.a, A, entries[0]);
  await gate.reached;
  const fromB = ensureFolderColor(world.b, A, entries[1]);
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  gate.release();
  return Promise.all([fromA, fromB]);
}

test('two_windows_with_the_lock_give_two_folders_two_keys_and_one_folder_one_key', async () => {
  const seed = [folder('f1'), entry('e1', 'f1'), entry('e1b', 'f1'), folder('f2'), entry('e2', 'f2')];
  const two = await startedWhileAIsHeld(await windows(seed), ['e1', 'e2']);
  assert.deepEqual([...two].sort(), [K[0], K[1]].sort(), 'a is held at its write: b waited for the lease; two keys');

  const one = await startedWhileAIsHeld(await windows(seed), ['e1', 'e1b']);
  assert.equal(one[0], one[1], 'one folder, one key');
  assert.ok(isDepColorKey(one[0]));
});

// A DEMONSTRATION of the residual (P1), not a guarantee: without the lock directory the same hold shows what the lease
// is for. b tallies the list a has not written yet, both folders get K[0], and a's later whole-list write drops the
// colour b stored on f2 (b's write landed first in the shared memento).
test('without_the_lock_the_held_window_gives_both_folders_one_key_and_loses_a_stored_colour_the_residual', async () => {
  const world = await windows([folder('f1'), entry('e1', 'f1'), folder('f2'), entry('e2', 'f2')], false);

  assert.deepEqual(await startedWhileAIsHeld(world, ['e1', 'e2']), [K[0], K[0]], 'the real-manager version of R3');
  assert.equal(world.a.getNode(A, 'f1')?.folderColor, K[0]);
  assert.equal(world.a.getNode(A, 'f2')?.folderColor, undefined, 'f2\'s colour was dropped by a\'s whole-list write');
});

// ACCEPTED OUTCOME, not a guarantee (E1 plan round 1, residual P1): a window whose copy of `globalState` has not yet
// received the other's write tallies an old list, so two folders can wear one colour. The late broadcast is modelled
// by two managers over two mementos, so b never sees a's write. Nobody should read a repeat here as a promise of two keys.
// "Loses nothing" means only that b's patch writes f2 alone in b's own copy. When the copies meet, b's whole-list write
// can drop a's f1 colour; this model does not test that, and the no-lock control above shows it.
test('a_stale_window_copy_may_repeat_a_colour_and_loses_nothing', async () => {
  const seed = [folder('f1'), entry('e1', 'f1'), folder('f2'), entry('e2', 'f2')];
  const [a, b] = [storageManagerOver<RealStorage>(sharedMemento().api, sharedSecrets().api),
    storageManagerOver<RealStorage>(sharedMemento().api, sharedSecrets().api)];
  await seeded(a, { [A]: seed });
  await seeded(b, { [A]: seed });
  const bBefore = JSON.stringify(b.getNodes(A).filter((n) => n.id !== 'f2'));

  const fromA = await ensureFolderColor(a, A, 'e1');
  const fromB = await ensureFolderColor(b, A, 'e2');

  assert.ok(isDepColorKey(fromA) && isDepColorKey(fromB), 'both calls resolved with a palette key; a repeat is accepted');
  assert.equal(a.getNode(A, 'f1')?.folderColor, fromA, 'f1 keeps its key in a\'s copy');
  assert.equal(b.getNode(A, 'f2')?.folderColor, fromB);
  assert.equal(JSON.stringify(b.getNodes(A).filter((n) => n.id !== 'f2')), bBefore, 'b wrote only f2');
});

/** The world changes between the outside check and the patch; returns what the call gave and what was recorded. */
async function raced(hook: (fake: FolderColorFake) => void, extra: readonly TreeNode[] = []) {
  const fake = folderColorStorage({ [A]: [trash(), folder('f1'), entry('e1', 'f1'), ...extra] });
  assert.equal(fake.getNode(A, 'f1')?.folderColor, undefined, 'Given: f1 has no colour');
  fake.beforePatch(() => hook(fake));
  const result = await ensureFolderColor(fake, A, 'e1');
  return { fake, result, change: fake.written[0]?.change, count: fake.written.length };
}
const f1With = (fake: FolderColorFake, over: Partial<TreeNode>): void => fake.put(A, { ...folder('f1'), ...over });

test('the_folder_is_checked_again_inside_the_lease_a_colour_saved_meanwhile_wins', async () => {
  const r = await raced((fake) => f1With(fake, { folderColor: K[7] }));
  assert.deepEqual([r.count, r.change, r.result], [1, {}, K[7]]);
  assert.equal(r.fake.getNode(A, 'f1')?.folderColor, K[7]);
});

test('the_folder_is_checked_again_inside_the_lease_an_unknown_value_saved_meanwhile_is_kept', async () => {
  const r = await raced((fake) => f1With(fake, { folderColor: 'depColor99' }));
  assert.deepEqual([r.count, r.change, r.result], [1, {}, undefined]);
  assert.equal(r.fake.getNode(A, 'f1')?.folderColor, 'depColor99');
});

test('the_folder_is_checked_again_inside_the_lease_a_folder_trashed_meanwhile_is_left_alone', async () => {
  const r = await raced((fake) => f1With(fake, { parentId: 'trash' }));
  assert.deepEqual([r.count, r.change, r.result], [1, {}, undefined]);
  assert.equal(r.fake.getNode(A, 'f1')?.folderColor, undefined);
});

test('the_folder_is_checked_again_inside_the_lease_a_folder_deleted_meanwhile_invents_nothing', async () => {
  const r = await raced((fake) => fake.remove(A, 'f1'));
  assert.deepEqual([r.count, r.change, r.result], [1, undefined, undefined], 'recorded, but no patch call');
  assert.equal(r.fake.getNode(A, 'f1'), undefined, 'no node f1');
});

test('the_tally_is_taken_inside_the_lease', async () => {
  const r = await raced((fake) => fake.put(A, folder('f2', K[0])), [folder('f2')]);
  assert.equal(r.result, K[1]);
  assert.equal(r.fake.getNode(A, 'f1')?.folderColor, K[1]);
});

// ---------- 5.3 A failed write ----------

test('a_failed_write_rejects_that_call_and_the_next_call_assigns', async () => {
  const fake = folderColorStorage({ [A]: [folder('f1'), entry('e1', 'f1')] });
  const boom = new Error('boom');
  fake.failNextWrite(boom);

  await assert.rejects(ensureFolderColor(fake, A, 'e1'), (error) => error === boom, 'the same error object');
  assert.equal(fake.getNode(A, 'f1')?.folderColor, undefined, 'f1 has no colour');
  assert.equal(await ensureFolderColor(fake, A, 'e1'), K[0]);
  assert.equal(fake.getNode(A, 'f1')?.folderColor, K[0]);
});

test('a_failed_write_does_not_stop_a_call_started_with_it', async () => {
  const fake = folderColorStorage({ [A]: [folder('f1'), entry('e1', 'f1'), folder('f2'), entry('e2', 'f2')] });
  const boom = new Error('boom');
  fake.failNextWrite(boom);

  const [first, second] = await Promise.allSettled([ensureFolderColor(fake, A, 'e1'), ensureFolderColor(fake, A, 'e2')]);

  assert.deepEqual([first.status, first.status === 'rejected' && first.reason === boom], ['rejected', true]);
  assert.deepEqual(second, { status: 'fulfilled', value: K[0] });
  assert.deepEqual([fake.getNode(A, 'f1')?.folderColor, fake.getNode(A, 'f2')?.folderColor], [undefined, K[0]]);
});

// ---------- 5.4 Accounts ----------

test('a_call_for_one_account_never_touches_another', async () => {
  const fake = folderColorStorage({
    [A]: [folder('f1'), entry('e1', 'f1')],
    [B]: [folder('f1'), entry('e1', 'f1'), folder('fb', K[0])],
  });
  const listB = fake.getNodes(B);
  assert.deepEqual([fake.getNode(A, 'f1')?.folderColor, fake.getNode(B, 'f1')?.folderColor], [undefined, undefined]);
  let mark = fake.touched.length;

  assert.equal(await ensureFolderColor(fake, A, 'e1'), K[0]);
  assert.deepEqual([...new Set(fake.touched.slice(mark))], [A], 'only A was touched');
  const listA = fake.getNodes(A);
  assert.equal(fake.getNodes(B), listB, 'B\'s list is the same object');
  assert.ok(fake.written.every((change) => change.accountId === A), 'no write names B');
  mark = fake.touched.length;

  assert.equal(await ensureFolderColor(fake, B, 'e1'), K[1]);
  assert.deepEqual([...new Set(fake.touched.slice(mark))], [B], 'only B was touched since');
  assert.equal(fake.getNodes(A), listA, 'A\'s list is the same object as after the first call');
});

// ---------- 5.5 Structure ----------

const sourceOf = (file: string): string => fs.readFileSync(path.join(__dirname, '..', '..', 'src', file), 'utf8');
const VSCODE_IMPORT = /from\s+['"]vscode['"]/;

test('the_module_imports_no_vscode', () => {
  assert.doesNotMatch(sourceOf('folderColors.ts'), VSCODE_IMPORT);
});

test('the_scan_still_finds_a_vscode_import_where_there_is_one', () => {
  assert.match(sourceOf('leasedWrites.ts'), VSCODE_IMPORT);
});

both('the_fake_and_the_real_storage_agree_on_a_function_patch', async (build) => {
  const w = await build({ [A]: [folder('f1', K[1])] });
  const strip = (id: string): string => JSON.stringify({ ...w.storage.getNode(A, id), updatedAt: undefined, v: undefined });
  const count = w.storage.getNodes(A).length;
  let seen: string | undefined;
  let called = false;

  // (i) a function patch sees a field written just before it, even when both calls start together.
  await Promise.all([
    w.storage.updateNodeFields(A, 'f1', () => ({ folderColor: K[2] })),
    w.storage.updateNodeFields(A, 'f1', (n) => {
      seen = n.folderColor;
      return {};
    }),
  ]);
  assert.equal(seen, K[2], '(i) the patch saw the earlier write');

  // (ii) a patch returning {} changes no field other than updatedAt and v.
  const was = strip('f1');
  await w.storage.updateNodeFields(A, 'f1', () => ({}));
  assert.equal(strip('f1'), was, '(ii) nothing but the stamp moved');

  // (iii) a patch for a missing id is not called and no node appears.
  await w.storage.updateNodeFields(A, 'nope', () => {
    called = true;
    return { folderColor: K[0] };
  });
  assert.deepEqual([called, w.storage.getNode(A, 'nope'), w.storage.getNodes(A).length], [false, undefined, count]);
});
