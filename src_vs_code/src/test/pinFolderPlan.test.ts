import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TreeNode } from '../types';
import { entriesUnder, protectionSummary, runReport, siblingReport } from '../pinFolderPlan';
import { hiddenFromAgents } from '../mcpEntries';
import { loadWithVscode } from './vscodeStub';
import { lockSecret } from '../secretEnvelope';

/**
 * What a folder run would DO, and what it SAYS before doing it.
 *
 * <p>The finding this file exists for: somebody running a folder with a new PIN expects the folder
 * to be uniformly theirs afterwards. It will not be — entries already wrapped under another PIN are
 * skipped and keep it — and somebody who does not know that PIN has just locked themselves out of
 * entries they could read yesterday, while believing the opposite.</p>
 */

const folder = (id: string, parentId: string | null = null): TreeNode =>
  ({ id, name: id, type: 'folder', parentId }) as TreeNode;

const entry = (id: string, parentId: string | null): TreeNode =>
  ({ id, name: id, type: 'entity', parentId, details: { id, name: id } }) as TreeNode;

test('the walk reaches entries at ANY depth, and stops at the folder it was given', () => {
  const nodes = [
    folder('top'),
    folder('inner', 'top'),
    folder('deeper', 'inner'),
    entry('a', 'top'),
    entry('b', 'inner'),
    entry('c', 'deeper'),
    folder('elsewhere'),
    entry('d', 'elsewhere'),
    entry('e', null),
  ];

  assert.deepEqual(
    entriesUnder(nodes, 'top').map((n) => n.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    entriesUnder(nodes, 'elsewhere').map((n) => n.id),
    ['d'],
  );
});

test('a parent chain that points nowhere costs ONE entry, not the walk', () => {
  // Sync can deliver a node whose parent is not here yet. Recursing on children would have made
  // that a stack overflow; walking parents with a depth cap makes it one skipped row.
  const nodes = [folder('top'), entry('orphan', 'a-folder-that-is-not-here'), entry('a', 'top')];

  assert.deepEqual(
    entriesUnder(nodes, 'top').map((n) => n.id),
    ['a'],
  );
});

test('a cycle in the parent chain terminates rather than hanging', () => {
  const looped = [
    { id: 'x', name: 'x', type: 'folder', parentId: 'y' },
    { id: 'y', name: 'y', type: 'folder', parentId: 'x' },
    { id: 'a', name: 'a', type: 'entity', parentId: 'x', details: { id: 'a', name: 'a' } },
  ] as TreeNode[];

  assert.deepEqual(
    entriesUnder(looped, 'nowhere').map((n) => n.id),
    [],
  );
});

test('the report names the count that will be SKIPPED, and what that means', () => {
  const plan = {
    toProtect: [entry('a', 'f'), entry('b', 'f')],
    alreadyProtected: [entry('c', 'f'), entry('d', 'f'), entry('e', 'f')],
  };

  const said = siblingReport('Production', plan);

  assert.match(said, /3 of the 5 entries in "Production"/);
  assert.match(said, /left exactly as they are/, 'it says what happens to them');
  assert.match(said, /still need their own PIN/, 'and what that costs the person reading it');
  assert.match(said, /2 unprotected entries will be protected/, 'and what the run WILL do');
});

test('one entry reads as "entry", not "1 entries"', () => {
  const said = siblingReport('Production', {
    toProtect: [entry('a', 'f')],
    alreadyProtected: [entry('c', 'f')],
  });

  assert.match(said, /1 unprotected entry will be protected/);
});

test('the summary is a state, not a verdict — and an empty folder says so', () => {
  assert.match(
    protectionSummary('Production', { toProtect: [], alreadyProtected: [entry('c', 'f')] }),
    /All 1 entries in "Production" already have a PIN/,
  );
  assert.match(
    protectionSummary('Production', { toProtect: [entry('a', 'f')], alreadyProtected: [entry('c', 'f')] }),
    /1 of 2 entries in "Production" are protected/,
    'the count is what makes an interrupted run visible',
  );
  assert.match(
    protectionSummary('Empty', { toProtect: [], alreadyProtected: [] }),
    /holds no entries to protect/,
  );
});

/**
 * §2.4 — one predicate, at the listing AND at the lookup.
 */
test('a protected entry is hidden from agents; an ordinary one is not', () => {
  const protectedNode = {
    id: 'e1',
    name: 'prod',
    type: 'entity',
    details: { id: 'e1', name: 'prod', pinProtected: true },
  } as TreeNode;

  assert.equal(hiddenFromAgents(protectedNode), true);
  assert.equal(hiddenFromAgents(entry('e2', null)), false);
  assert.equal(hiddenFromAgents(undefined), false, 'a missing node is not a protected one');
});

/**
 * §2.3 — a new entry in a folder whose entries are protected.
 *
 * <p>The owner's requirement: <i>"при создании новой в такой папке — пин обязательное поле"</i>.
 * Asked BEFORE the form, so dismissing means no entry rather than an unprotected one sitting in a
 * folder whose whole point is that nothing in it is.</p>
 */
/**
 * A vault holding real values, keyed by entity id — because the question this asks is about the
 * WRAP, not about the mark beside it.
 */
function vaultWith(nodes: readonly TreeNode[], passwords: Record<string, string>): never {
  const nothing = (): Promise<undefined> => Promise.resolve(undefined);
  return {
    getNodes: () => nodes,
    getNode: (_a: string, id: string) => nodes.find((n) => n.id === id),
    getPassword: (_a: string, id: string) => Promise.resolve(passwords[id]),
    getNotes: nothing,
    getFieldsRaw: nothing,
    getPaymentRaw: nothing,
    getConfigBody: nothing,
    getDbConnection: nothing,
    getVpnConfig: nothing,
    getTotp: nothing,
    getPrivateKey: nothing,
  } as never;
}

test('a folder with a protected entry asks; one without does not', async () => {
  // The ask is driven by the WRAP, not by `pinProtected`. That mark is the synchronous mirror the
  // agent surfaces need, and its staleness fails closed for them; here the same staleness would fail
  // the other way — a folder whose mark was lost would stop asking, and the next entry created in it
  // would be stored in the clear. So this vault carries a real locked value and no mark at all.
  const nodes = [folder('locked'), entry('a', 'locked'), folder('open'), entry('b', 'open')];
  const storage = vaultWith(nodes, { a: await lockSecret('hunter2', 'a1', 'correct-horse-battery') });
  const mod = loadWithVscode<typeof import('../pinOnCreate')>('../pinOnCreate', {
    window: { showInputBox: () => Promise.resolve(undefined) },
  });

  assert.deepEqual(await mod.pinForNewEntry(storage, 'a1', 'open'), { kind: 'none' });
  assert.deepEqual(
    await mod.pinForNewEntry(storage, 'a1', 'locked'),
    { kind: 'cancelled' },
    'dismissing the box means no entry is created — not an unprotected one',
  );
});

test('a folder of UNPROTECTED entries does not ask, however many there are', async () => {
  const nodes = [folder('open'), entry('a', 'open'), entry('b', 'open')];
  const storage = vaultWith(nodes, { a: 'hunter2', b: 'swordfish' });
  const mod = loadWithVscode<typeof import('../pinOnCreate')>('../pinOnCreate', {
    window: { showInputBox: () => assert.fail('nothing here is protected') },
  });

  assert.deepEqual(await mod.pinForNewEntry(storage, 'a1', 'open'), { kind: 'none' });
});

test('an entry created at the ROOT is never asked — the root is not a folder', async () => {
  const storage = vaultWith([], {});
  const mod = loadWithVscode<typeof import('../pinOnCreate')>('../pinOnCreate', {
    window: { showInputBox: () => assert.fail('the root has no siblings to be protected by') },
  });

  assert.deepEqual(await mod.pinForNewEntry(storage, 'a1', null), { kind: 'none' });
});

/**
 * What a finished run says — three numbers, not one.
 *
 * <p>A reviewer's finding: a run that stopped part-way aborted with nothing said, so the person saw
 * the progress notification vanish and could not tell a finished run from a failed one. Naming the
 * failures is what makes "run it again" usable, because a re-run skips what is already done.</p>
 */
test('a run that fully succeeded says so, and names the entry when there was one', () => {
  assert.match(runReport(['prod-db'], []), /"prod-db" is protected with its own PIN/);
  assert.match(runReport(['a', 'b', 'c'], []), /3 entries are protected/);
  assert.match(runReport(['a'], []), /no way to recover it/, 'the stakes, every time');
});

test('a PARTIAL run names what could not be done, and that a re-run finishes it', () => {
  const said = runReport(['a', 'b'], ['c', 'd']);

  assert.match(said, /2 entries are protected/);
  assert.match(said, /2 could not be: c, d/, 'which ones — not a count nobody can act on');
  assert.match(said, /unchanged and still readable/, 'and what state they are in');
  assert.match(said, /run it again/, 'and the repair, which is the same command');
});

/**
 * A run that protected NOTHING must not record the preference.
 *
 * <p>A reviewer's finding, and the right half of a question this plan got wrong twice. The first
 * draft set the mark BEFORE the run, so a run nobody finished left a folder asking about entries it
 * had never protected. Moving it after the run fixed that — and left this: `runProtect` keeps each
 * failure rather than throwing (the rest of the folder deserves a try), so when EVERY entry fails
 * the code carried on and set the preference anyway. The next entry created there is then asked for
 * a PIN in a folder where nothing is protected.</p>
 *
 * <p>An empty folder is the deliberate exception and keeps its own path: there the preference is the
 * ONLY record that can exist, which is the whole reason the field was added.</p>
 */
test('a folder run where every entry FAILED records no preference', async () => {
  const folder = { id: 'f1', name: 'Production', type: 'folder', parentId: null } as TreeNode;
  const entity = {
    id: 'e1',
    name: 'prod-db',
    type: 'entity',
    parentId: 'f1',
    details: { id: 'e1', name: 'prod-db', isSshEnabled: false },
  } as TreeNode;
  const written: TreeNode[] = [];
  const storage = {
    getNodes: () => [folder, entity],
    getNode: (_a: string, id: string) => [folder, entity].find((n) => n.id === id),
    // Reads succeed so the PLAN can be built — the failure has to land on the RUN, which is what
    // the finding is about. The write is what fails, so `protectEntity` throws for this entry and
    // `protectOne` records it as failed.
    getPassword: () => Promise.resolve('hunter2'),
    setPassword: () => Promise.reject(new Error('the keychain is unavailable')),
    getNotes: () => Promise.resolve(undefined),
    getFieldsRaw: () => Promise.resolve(undefined),
    getPaymentRaw: () => Promise.resolve(undefined),
    getConfigBody: () => Promise.resolve(undefined),
    getDbConnection: () => Promise.resolve(undefined),
    getVpnConfig: () => Promise.resolve(undefined),
    getTotp: () => Promise.resolve(undefined),
    getPrivateKey: () => Promise.resolve(undefined),
    updateNode: (_a: string, node: TreeNode) => {
      written.push(node);
      return Promise.resolve();
    },
  } as never;
  const mod = folderCommands(['a-real-pin-1234', 'a-real-pin-1234']);

  await mod.protectFolder(folder, { storage, accountId: 'a1', refresh: () => undefined });

  assert.equal(
    written.some((n) => n.id === 'f1' && n.folderAsksForPin === true),
    false,
    'nothing was protected, so nothing may claim the folder asks: ' + JSON.stringify(written),
  );
});

test('…but a run where at least ONE entry succeeded does record it', async () => {
  const folder = { id: 'f1', name: 'Production', type: 'folder', parentId: null } as TreeNode;
  const entity = {
    id: 'e1',
    name: 'prod-db',
    type: 'entity',
    parentId: 'f1',
    details: { id: 'e1', name: 'prod-db', isSshEnabled: false },
  } as TreeNode;
  const written: TreeNode[] = [];
  const nothing = (): Promise<undefined> => Promise.resolve(undefined);
  const storage = {
    getNodes: () => [folder, entity],
    getNode: (_a: string, id: string) => [folder, entity].find((n) => n.id === id),
    getPassword: () => Promise.resolve('hunter2'),
    setPassword: () => Promise.resolve(),
    getNotes: nothing,
    getFieldsRaw: nothing,
    getPaymentRaw: nothing,
    getConfigBody: nothing,
    getDbConnection: nothing,
    getVpnConfig: nothing,
    getTotp: nothing,
    getPrivateKey: nothing,
    updateNode: (_a: string, node: TreeNode) => {
      written.push(node);
      return Promise.resolve();
    },
  } as never;
  const mod = folderCommands(['a-real-pin-1234', 'a-real-pin-1234']);

  await mod.protectFolder(folder, { storage, accountId: 'a1', refresh: () => undefined });

  assert.equal(
    written.some((n) => n.id === 'f1' && n.folderAsksForPin === true),
    true,
    'one protected entry is a protected folder: ' + JSON.stringify(written),
  );
});

/** `pinCommands` with the two PIN boxes answered and every notification swallowed. */
function folderCommands(inputs: readonly string[]): typeof import('../pinCommands') {
  const queue = [...inputs];
  return loadWithVscode<typeof import('../pinCommands')>('../pinCommands', {
    window: {
      showInputBox: () => Promise.resolve(queue.shift()),
      showWarningMessage: () => Promise.resolve('Protect the rest'),
      showInformationMessage: () => Promise.resolve(undefined),
      showErrorMessage: () => Promise.resolve(undefined),
      withProgress: (_o: unknown, task: (p: { report(): void }) => Promise<unknown>) =>
        task({ report: () => undefined }),
    },
    ProgressLocation: { Notification: 15 },
  });
}
