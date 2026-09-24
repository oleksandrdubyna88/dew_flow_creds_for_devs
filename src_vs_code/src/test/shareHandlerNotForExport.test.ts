import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * Issue #122 — *Share with…*'s HANDLER: a marked entry selected alone is refused before the share
 * conversation starts, and a partial share is named before its first prompt (the TOTP question,
 * the recipients). What reaches `shareNodes` never includes a marked root.
 */

type Handler = (...args: unknown[]) => unknown;

interface World {
  run(target: TreeNode, selected?: TreeNode[]): Promise<void>;
  /** In order: `warn:<text>` and `shareNodes:<ids>` — the conversation starts at shareNodes. */
  readonly events: string[];
}

function world(nodes: TreeNode[]): World {
  const events: string[] = [];
  const handlers = new Map<string, Handler>();
  const vscode = {
    window: {
      showWarningMessage: (text: string) => {
        events.push(`warn:${text}`);
        return Promise.resolve(undefined);
      },
    },
  };
  const mod = loadWithVscode<typeof import('../commands/shareCommands')>('../commands/shareCommands', vscode);
  mod.registerShareCommands({
    register: (command, handler) => handlers.set(command, handler),
    shareInbox: {
      shareNodes: (_accountId: string, roots: TreeNode[]) => {
        events.push(`shareNodes:${roots.map((n) => n.id).join(',')}`);
        return Promise.resolve();
      },
    } as never,
    sharing: {} as never,
    storage: { getNodes: () => nodes } as never,
  });
  const row = (node: TreeNode) => ({ kind: 'node', accountId: 'acc', node });
  return {
    events,
    run: async (target, selected) => {
      await handlers.get('credSshManager.shareEntity')!(row(target), selected?.map(row));
    },
  };
}

function entity(id: string, parentId: string | null, marked = false): TreeNode {
  const details = { id, name: id, isSshEnabled: false, ...(marked ? { notForExport: true } : {}) };
  return { id, name: id, type: 'entity', parentId, details };
}

const ops: TreeNode = { id: 'ops', name: 'ops', type: 'folder', parentId: null };
const prod = entity('prod', 'ops', true);
const stage = entity('stage', 'ops');
const loose = entity('loose', null);

test('a marked entry shared alone is refused — the share conversation never starts', async () => {
  const w = world([ops, prod, stage, loose]);
  await w.run(prod);
  assert.deepEqual(w.events, [
    'warn:Nothing to share: "prod" is marked Not for export. Untick it in the entry\'s Edit → General to let it leave.',
  ]);
});

test('a folder is shared with its marked entry named FIRST — the walk skips it', async () => {
  const w = world([ops, prod, stage, loose]);
  await w.run(ops);
  assert.deepEqual(w.events, [
    'warn:"prod" is marked Not for export and will not be shared; the rest will be.',
    'shareNodes:ops',
  ]);
});

test('a multi-selection drops the marked root and shares the rest', async () => {
  const w = world([ops, prod, stage, loose]);
  await w.run(prod, [prod, loose]);
  assert.deepEqual(w.events, [
    'warn:"prod" is marked Not for export and will not be shared; the rest will be.',
    'shareNodes:loose',
  ]);
});

test('an unmarked share says nothing new', async () => {
  const w = world([ops, stage, loose]);
  await w.run(loose);
  assert.deepEqual(w.events, ['shareNodes:loose']);
});
