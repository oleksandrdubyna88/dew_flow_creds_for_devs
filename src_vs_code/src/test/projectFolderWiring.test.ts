import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CorpPolicyState } from '../corpPolicy';
import { projectFolderNodeId } from '../projectFolders';
import { projectFolderReconciler } from '../projectFolderWiring';
import { ProjectFolderHost } from '../projectFolderSync';
import { StoredAccount, TreeNode } from '../types';

const ACCOUNT: StoredAccount = { accountId: 'acct-1', email: 'alice@example.com', provider: 'microsoft' };
const ATLAS = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function state(over: Partial<CorpPolicyState> = {}): CorpPolicyState {
  return {
    corpMode: true,
    role: 'dev',
    isOfficer: false,
    isAdmin: false,
    active: true,
    policy: { export: false, share: 'project', moveOutOfProject: false },
    policyFromServer: true,
    projects: [],
    pendingFolderRemovals: [],
    leaseHours: 24,
    fetchedAt: 1_000_000,
    ...over,
  };
}

function spyHost(): { host: ProjectFolderHost; order: string[]; added: TreeNode[] } {
  const order: string[] = [];
  const added: TreeNode[] = [];
  return {
    order,
    added,
    host: {
      addFolder: async (_a, node) => {
        order.push('add');
        added.push(node);
      },
      setFields: async (_a, id) => void order.push('patch:' + id),
      deleteRecursive: async (_a, id) => void order.push('delete:' + id),
      push: async () => void order.push('push'),
      ack: async (_a, projectId) => void order.push('ack:' + projectId),
      announce: () => void order.push('announce'),
      now: () => 1_000,
    },
  };
}

test('an assignment the machine has never seen becomes a folder named by the server', async () => {
  const spy = spyHost();
  const reconcile = projectFolderReconciler({ nodesOf: () => [], pull: async () => undefined, host: spy.host });

  const outcome = await reconcile(ACCOUNT, state({ projects: [{ projectId: ATLAS, share: 'inherit', name: 'Atlas' }] }));

  assert.equal(outcome.created, 1);
  assert.equal(spy.added[0].name, 'Atlas');
  assert.equal(spy.added[0].projectId, ATLAS);
  assert.equal(spy.added[0].id, projectFolderNodeId(ACCOUNT.accountId, ATLAS));
});

test('a personal account does nothing at all — no storage, no network', async () => {
  // corpMode false is the inert default document: no assignments, no instructions.
  const spy = spyHost();
  const reconcile = projectFolderReconciler({ nodesOf: () => [], pull: async () => undefined, host: spy.host });

  await reconcile(ACCOUNT, state({ corpMode: false }));

  assert.deepEqual(spy.order, []);
});

test('an assignment whose name the server could not resolve still makes a readable folder', async () => {
  // A pre-epic-3 server sends the assignment with no name at all.
  const spy = spyHost();
  const reconcile = projectFolderReconciler({ nodesOf: () => [], pull: async () => undefined, host: spy.host });

  await reconcile(ACCOUNT, state({ projects: [{ projectId: ATLAS, share: 'inherit' }] }));

  assert.match(spy.added[0].name, /^Project /);
});

test('a removal deletes, pushes and only then acknowledges', async () => {
  const here: TreeNode = {
    id: projectFolderNodeId(ACCOUNT.accountId, ATLAS),
    name: 'Atlas',
    type: 'folder',
    projectId: ATLAS,
  };
  const spy = spyHost();
  const reconcile = projectFolderReconciler({ nodesOf: () => [here], pull: async () => undefined, host: spy.host });

  await reconcile(ACCOUNT, state({ pendingFolderRemovals: [{ projectId: ATLAS, deleteFolder: true }] }));

  assert.deepEqual(spy.order, ['delete:' + here.id, 'push', 'ack:' + ATLAS, 'announce']);
});

test('the vault is pulled BEFORE anything is reconciled, or a second device resurrects a deleted folder', async () => {
  // The code round's sharpest finding. One machine deletes the folder, pushes the tombstone and acks;
  // the instruction is per person, so the server clears it. A second machine then reads a document
  // with no assignment and no instruction — and if it reconciles against its OWN stale nodes it reads
  // that as 'the assignment quietly ended', UNLOCKS the folder, and that edit carries a newer version
  // vector than the tombstone: the merge then resurrects the folder the organisation removed.
  //
  // Pulling first is what makes the sequence impossible: by the time anything is decided, the
  // tombstone has landed and the node is gone.
  const order: string[] = [];
  const spy = spyHost();
  const reconcile = projectFolderReconciler({
    nodesOf: () => {
      order.push('read-nodes');
      return [];
    },
    pull: async () => void order.push('pull'),
    host: spy.host,
  });

  await reconcile(ACCOUNT, state({ projects: [{ projectId: ATLAS, share: 'inherit', name: 'Atlas' }] }));

  assert.deepEqual(order, ['pull', 'read-nodes']);
});

test('a pull that fails decides nothing at all', async () => {
  // Reconciling on stale nodes is the whole hazard above; a machine that could not pull has nothing
  // trustworthy to reconcile against, so it waits for the next cycle.
  const spy = spyHost();
  const reconcile = projectFolderReconciler({
    nodesOf: () => [],
    pull: async () => {
      throw new Error('offline');
    },
    host: spy.host,
  });

  await assert.rejects(
    reconcile(ACCOUNT, state({ projects: [{ projectId: ATLAS, share: 'inherit', name: 'Atlas' }] })),
    /offline/,
  );
  assert.deepEqual(spy.order, []);
});
