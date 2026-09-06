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
  const reconcile = projectFolderReconciler({ nodesOf: () => [], host: spy.host });

  const outcome = await reconcile(ACCOUNT, state({ projects: [{ projectId: ATLAS, share: 'inherit', name: 'Atlas' }] }));

  assert.equal(outcome.created, 1);
  assert.equal(spy.added[0].name, 'Atlas');
  assert.equal(spy.added[0].projectId, ATLAS);
  assert.equal(spy.added[0].id, projectFolderNodeId(ACCOUNT.accountId, ATLAS));
});

test('a personal account does nothing at all — no storage, no network', async () => {
  // corpMode false is the inert default document: no assignments, no instructions.
  const spy = spyHost();
  const reconcile = projectFolderReconciler({ nodesOf: () => [], host: spy.host });

  await reconcile(ACCOUNT, state({ corpMode: false }));

  assert.deepEqual(spy.order, []);
});

test('an assignment whose name the server could not resolve still makes a readable folder', async () => {
  // A pre-epic-3 server sends the assignment with no name at all.
  const spy = spyHost();
  const reconcile = projectFolderReconciler({ nodesOf: () => [], host: spy.host });

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
  const reconcile = projectFolderReconciler({ nodesOf: () => [here], host: spy.host });

  await reconcile(ACCOUNT, state({ pendingFolderRemovals: [{ projectId: ATLAS, deleteFolder: true }] }));

  assert.deepEqual(spy.order, ['delete:' + here.id, 'push', 'ack:' + ATLAS, 'announce']);
});
