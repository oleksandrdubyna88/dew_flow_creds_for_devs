import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProjectFolderHost, applyProjectFolders } from '../projectFolderSync';
import { NO_PROJECT_FOLDER_WORK, ProjectFolderPlan } from '../projectFolders';
import { TreeNode } from '../types';

const ACCOUNT = 'acct-1';

interface Recorder {
  readonly host: ProjectFolderHost;
  readonly order: string[];
  readonly added: TreeNode[];
  readonly patched: { id: string; patch: Partial<TreeNode> }[];
  readonly announced: string[];
}

function recorder(over: Partial<ProjectFolderHost> = {}): Recorder {
  const order: string[] = [];
  const added: TreeNode[] = [];
  const patched: { id: string; patch: Partial<TreeNode> }[] = [];
  const announced: string[] = [];
  const host: ProjectFolderHost = {
    addFolder: async (_a, node) => {
      order.push('add:' + node.id);
      added.push(node);
    },
    setFields: async (_a, id, patch) => {
      order.push('patch:' + id);
      patched.push({ id, patch });
    },
    deleteRecursive: async (_a, id) => {
      order.push('delete:' + id);
      return [];
    },
    push: async () => {
      order.push('push');
    },
    ack: async (_a, projectId) => {
      order.push('ack:' + projectId);
    },
    announce: (message) => {
      announced.push(message);
    },
    now: () => 1_000,
    ...over,
  };
  return { host, order, added, patched, announced };
}

function plan(over: Partial<ProjectFolderPlan> = {}): ProjectFolderPlan {
  return { ...NO_PROJECT_FOLDER_WORK, ...over };
}

test('an empty plan touches nothing at all — not even a push', () => {
  const r = recorder();

  return applyProjectFolders(ACCOUNT, plan(), r.host).then((outcome) => {
    assert.deepEqual(r.order, []);
    assert.equal(outcome.created, 0);
  });
});

test('a created folder sits at the root, carries its project, and is a folder', async () => {
  const r = recorder();

  await applyProjectFolders(ACCOUNT, plan({ toCreate: [{ nodeId: 'n1', projectId: 'p1', name: 'Atlas' }] }), r.host);

  assert.deepEqual(r.added, [
    { id: 'n1', name: 'Atlas', type: 'folder', parentId: null, projectId: 'p1', createdAt: 1_000, updatedAt: 1_000 },
  ]);
});

test('the acknowledgement happens after the push, never before it', async () => {
  // The instruction is per PERSON: the first machine to ack clears it for every other one. Acked
  // before the push, a machine that then died would leave the instruction gone and the tombstone
  // never sent — and every other machine of theirs keeps the folder forever.
  const r = recorder();

  await applyProjectFolders(
    ACCOUNT,
    plan({ toDelete: [{ nodeId: 'n1', projectId: 'p1' }], toAck: ['p1'] }),
    r.host,
  );

  assert.deepEqual(r.order, ['delete:n1', 'push', 'ack:p1']);
});

test('a push that fails acknowledges nothing, and the instruction stands for the next cycle', async () => {
  const r = recorder({
    push: async () => {
      throw new Error('offline');
    },
  });

  await assert.rejects(
    applyProjectFolders(ACCOUNT, plan({ toDelete: [{ nodeId: 'n1', projectId: 'p1' }], toAck: ['p1'] }), r.host),
    /offline/,
  );

  assert.deepEqual(r.order, ['delete:n1']);
});

test('a delete that fails pushes nothing and acknowledges nothing', async () => {
  const r = recorder({
    deleteRecursive: async () => {
      throw new Error('vault locked');
    },
  });

  await assert.rejects(
    applyProjectFolders(ACCOUNT, plan({ toDelete: [{ nodeId: 'n1', projectId: 'p1' }], toAck: ['p1'] }), r.host),
    /vault locked/,
  );

  assert.equal(r.order.includes('push'), false);
  assert.equal(r.order.includes('ack:p1'), false);
});

test('an instruction with nothing to delete is still acknowledged, so it cannot repeat forever', async () => {
  const r = recorder();

  const outcome = await applyProjectFolders(ACCOUNT, plan({ toAck: ['p1'] }), r.host);

  assert.deepEqual(r.order, ['push', 'ack:p1']);
  assert.equal(outcome.deleted, 0);
  assert.equal(outcome.acked, 1);
});

test('unlocking clears the project and leaves everything else on the node alone', async () => {
  const r = recorder();

  await applyProjectFolders(ACCOUNT, plan({ toUnlock: [{ nodeId: 'n1' }] }), r.host);

  assert.deepEqual(r.patched, [{ id: 'n1', patch: { projectId: undefined } }]);
});

test('a rename changes the name and nothing else', async () => {
  const r = recorder();

  await applyProjectFolders(ACCOUNT, plan({ toRename: [{ nodeId: 'n1', name: 'Atlas II' }] }), r.host);

  assert.deepEqual(r.patched, [{ id: 'n1', patch: { name: 'Atlas II' } }]);
});

test('a removal is announced, and a creation is not', async () => {
  // No confirmation: an instruction a developer can decline is not an instruction. But a folder
  // vanishing with no explanation is a support conversation about data loss.
  const removing = recorder();
  await applyProjectFolders(
    ACCOUNT,
    plan({ toDelete: [{ nodeId: 'n1', projectId: 'p1' }], toAck: ['p1'] }),
    removing.host,
  );
  assert.equal(removing.announced.length, 1);
  assert.match(removing.announced[0], /took you off the project/);

  const creating = recorder();
  await applyProjectFolders(
    ACCOUNT,
    plan({ toCreate: [{ nodeId: 'n1', projectId: 'p1', name: 'Atlas' }] }),
    creating.host,
  );
  assert.deepEqual(creating.announced, []);
});

test('several removals are announced once, counted', async () => {
  const r = recorder();

  await applyProjectFolders(
    ACCOUNT,
    plan({
      toDelete: [
        { nodeId: 'n1', projectId: 'p1' },
        { nodeId: 'n2', projectId: 'p2' },
      ],
      toAck: ['p1', 'p2'],
    }),
    r.host,
  );

  assert.equal(r.announced.length, 1);
  assert.match(r.announced[0], /2 project folders were removed/);
});
