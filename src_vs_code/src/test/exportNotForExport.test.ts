import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * Issue #122 — *Export / Share Externally…* never writes an entry marked *Not for export*.
 *
 * <p>Driven through the REAL command registration, so what is asserted is the handler: which ids it
 * asks the store to decrypt (a marked entry's secrets are never even read), and what the person meets
 * FIRST — the note or the refusal comes before the form pick, never after a password was typed.</p>
 */

type Handler = (...args: unknown[]) => unknown;

interface World {
  run(target: TreeNode): Promise<void>;
  /** Every prompt in the order a person met it: `warn:<text>` or `pick:<title>`. */
  readonly prompts: string[];
  /** The entity ids the handler asked the store to decrypt. */
  readonly secretsAskedFor: string[][];
}

function world(nodes: TreeNode[]): World {
  const prompts: string[] = [];
  const secretsAskedFor: string[][] = [];
  const vscode = {
    window: {
      // Dismissing the form pick ends the command — everything under test happens before it.
      showQuickPick: (_items: unknown, options: { title?: string }) => {
        prompts.push(`pick:${options?.title ?? ''}`);
        return Promise.resolve(undefined);
      },
      showWarningMessage: (text: string) => {
        prompts.push(`warn:${text}`);
        return Promise.resolve(undefined);
      },
      showInformationMessage: () => Promise.resolve(undefined),
    },
  };
  const { registerExportCommand } = loadWithVscode<typeof import('../commands/exportCommand')>(
    '../commands/exportCommand',
    vscode,
  );
  const handlers = new Map<string, Handler>();
  registerExportCommand({
    register: (command: string, handler: Handler) => handlers.set(command, handler),
    storage: {
      getNodes: () => nodes,
      exportSecretsFor: (_accountId: string, ids: string[]) => {
        secretsAskedFor.push(ids);
        return Promise.resolve({});
      },
    },
    vaultKeys: { noteUserActivity: () => undefined },
    log: {},
  } as never);
  const handler = handlers.get('credSshManager.exportExternal')!;
  return {
    prompts,
    secretsAskedFor,
    run: async (target) => {
      await handler({ kind: 'node', accountId: 'acc', node: target }, undefined);
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

test('a marked entry exported alone is refused before anything is asked or read', async () => {
  const w = world([ops, prod, stage]);
  await w.run(prod);
  assert.deepEqual(w.prompts, [
    'warn:Nothing to export: "prod" is marked Not for export. Untick it in the entry\'s Edit → General to let it leave.',
  ]);
  assert.deepEqual(w.secretsAskedFor, [], 'a refused export must not decrypt anything');
});

test('a folder exports without its marked entry — said FIRST, and the secret is never read', async () => {
  const w = world([ops, prod, stage]);
  await w.run(ops);
  assert.equal(w.prompts[0], 'warn:"prod" is marked Not for export and will not be exported; the rest will be.');
  assert.match(w.prompts[1] ?? '', /^pick:Export "ops"/, 'the form pick comes after the note');
  assert.deepEqual(w.secretsAskedFor, [['stage']]);
});

test('a folder of nothing but marked entries is refused like a lone one', async () => {
  const w = world([ops, prod]);
  await w.run(ops);
  assert.equal(w.prompts.length, 1);
  assert.match(w.prompts[0], /^warn:Nothing to export: "prod" is marked/);
  assert.deepEqual(w.secretsAskedFor, []);
});

test('an unmarked export is untouched — no note, straight to the form', async () => {
  const w = world([ops, stage]);
  await w.run(ops);
  assert.equal(w.prompts.length, 1);
  assert.match(w.prompts[0], /^pick:/);
  assert.deepEqual(w.secretsAskedFor, [['stage']]);
});

test('the FILE a folder exports holds the unmarked entry and not the marked one — metadata included', async () => {
  // The other tests stop at the form pick. This one writes the plain JSON file through the real save
  // path and reads it back: a regression that bundled the whole subtree would leak the marked entry's
  // name and host even with its secrets withheld.
  const written: string[] = [];
  const uri = (p: string) => ({ fsPath: p, path: p, with: (c: { path: string }) => uri(c.path) });
  const vscode = {
    window: {
      showQuickPick: (items: { plain: boolean }[]) => Promise.resolve(items.find((i) => i.plain)),
      showWarningMessage: (_text: string, options?: { modal?: boolean }) =>
        Promise.resolve(options?.modal === true ? 'Write plain JSON' : undefined),
      showInformationMessage: () => Promise.resolve(undefined),
      showSaveDialog: () => Promise.resolve(uri('/tmp/ops.json')),
      showErrorMessage: (text: string) => {
        written.push(`ERROR ${text}`);
        return Promise.resolve(undefined);
      },
    },
    Uri: { file: (p: string) => uri(p) },
    workspace: {
      fs: {
        writeFile: (_u: unknown, data: Uint8Array) => {
          written.push(Buffer.from(data).toString('utf8'));
          return Promise.resolve();
        },
        rename: () => Promise.resolve(),
        delete: () => Promise.resolve(),
      },
    },
  };
  const { registerExportCommand } = loadWithVscode<typeof import('../commands/exportCommand')>('../commands/exportCommand', vscode);
  const handlers = new Map<string, Handler>();
  const hostProd = { ...prod, details: { ...prod.details!, host: 'prod.internal' } };
  registerExportCommand({
    register: (command: string, handler: Handler) => handlers.set(command, handler),
    storage: { getNodes: () => [ops, hostProd, stage], exportSecretsFor: () => Promise.resolve({}) },
    vaultKeys: { noteUserActivity: () => undefined },
    log: {},
  } as never);

  await handlers.get('credSshManager.exportExternal')!({ kind: 'node', accountId: 'acc', node: ops }, undefined);

  assert.equal(written.length, 1, `exactly one file write: ${written.join(' | ')}`);
  assert.match(written[0], /"stage"/);
  assert.doesNotMatch(written[0], /prod/, 'neither the marked entry nor its host may be in the file');
});
