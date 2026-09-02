import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import type { EntityMetadata, TreeNode } from '../types';

/**
 * A clone is metadata only — so it must not inherit the metadata that CLAIMS a secret.
 *
 * <p>Found by an audit of every write path, in answer to the question "is there a path that writes a
 * node claiming a secret it never writes". This is the permanent version of the state S1.4's write
 * order exists to prevent: it never heals, and it syncs.</p>
 *
 * <p>The worst field is `configKeyHash`. Two entries answering to one application key make
 * `findConfigKeyHolder`'s `.find()` a race, and the copy has no config body — so a sync reorder, or
 * trashing the original, can leave a running application answered <b>401 "That key does not open a
 * config in this window"</b> by an entry the person made with Duplicate.</p>
 */

type Handler = (...args: unknown[]) => unknown;

function stubbedVscode(name: string): Record<string, unknown> {
  return {
    window: {
      showInputBox: (): Promise<string> => Promise.resolve(name),
      showQuickPick: (): Promise<undefined> => Promise.resolve(undefined),
      showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined),
      showInformationMessage: (): undefined => undefined,
      showErrorMessage: (): undefined => undefined,
      createOutputChannel: () => ({
        appendLine: (): void => undefined,
        show: (): void => undefined,
        dispose: (): void => undefined,
      }),
    },
    Uri: { file: (p: string): object => ({ fsPath: p }), joinPath: (): object => ({}) },
    ViewColumn: { Active: 1 },
    workspace: {
      getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
      onDidChangeConfiguration: () => ({ dispose: (): void => undefined }),
      fs: { writeFile: (): Promise<undefined> => Promise.resolve(undefined) },
    },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
    },
    ThemeIcon: class {
      constructor(readonly id: string) {}
    },
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
    TreeItem: class {},
    commands: { registerCommand: () => ({ dispose: (): void => undefined }) },
    env: { clipboard: { writeText: (): Promise<undefined> => Promise.resolve(undefined) } },
  };
}

/** Run the REAL clone command against a storage that records what it was asked to write. */
async function cloneOf(source: TreeNode): Promise<TreeNode> {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    return request === 'vscode' ? stubbedVscode('Copy of Prod') : original.call(this, request, ...rest);
  };
  const written: TreeNode[] = [];
  try {
    const { registerTreeMutationCommands } = require('../commands/treeMutationCommands') as {
      registerTreeMutationCommands(host: Record<string, unknown>): void;
    };
    const handlers = new Map<string, Handler>();
    registerTreeMutationCommands({
      announceArrival: () => Promise.resolve(),
      doorsFor: () => undefined,
      mutated: () => undefined,
      register: (command: string, handler: Handler) => handlers.set(command, handler),
      storage: {
        getNodes: () => [source],
        getNode: () => source,
        addNode: (_a: string, node: TreeNode) => {
          written.push(node);
          return Promise.resolve();
        },
      },
      transports: {},
      vaultKeys: { noteUserActivity: () => undefined },
    } as never);
    const handler = handlers.get('credSshManager.cloneNode');
    assert.ok(handler, 'the clone command must be registered, or this test asserts nothing');
    await handler({ kind: 'node', accountId: 'acc-1', node: source });
  } finally {
    loader._load = original;
  }
  assert.equal(written.length, 1, 'exactly one node was written');
  return written[0];
}

const CLAIMS: EntityMetadata = {
  id: 'e1',
  name: 'Prod',
  isSshEnabled: false,
  hasTotp: true,
  configKeyHash: 'sha256:the-live-app-key',
  attachmentFileName: 'ca.pem',
  attachmentSize: 4096,
  attachmentChangedBy: 'someone@example.com',
  imageFileName: 'logo.png',
  imageSize: 512,
  envBindings: { DB_PASSWORD: 'password' },
};

const SOURCE: TreeNode = { id: 'e1', name: 'Prod', type: 'entity', parentId: null, details: CLAIMS };

test('a clone inherits no claim about a secret it does not have', async () => {
  const details = detailsOf(await cloneOf(SOURCE));

  assert.equal(details.hasTotp, undefined, 'no Copy One-Time Code on an entry with no seed');
  assert.equal(details.attachmentFileName, undefined, 'no download row for a file that is not there');
  assert.equal(details.attachmentSize, undefined);
  assert.equal(details.attachmentChangedBy, undefined);
  assert.equal(details.imageFileName, undefined);
  assert.equal(details.envBindings, undefined, 'no env var promising a value it cannot fill');
});

/** A clone of an entry WITH metadata has metadata — asserted once, so each test reads as one claim. */
function detailsOf(node: TreeNode): EntityMetadata {
  assert.ok(node.details !== undefined, 'the clone carried its metadata across');
  return node.details;
}

test('a clone never inherits the config key — the field that can break a running application', async () => {
  const clone = await cloneOf(SOURCE);

  assert.equal(
    detailsOf(clone).configKeyHash,
    undefined,
    'two holders of one key make findConfigKeyHolder a race the empty copy can win',
  );
});

test('a clone is still the entry it was copied from', async () => {
  const clone = await cloneOf(SOURCE);

  const details = detailsOf(clone);
  assert.equal(details.name, 'Copy of Prod', 'renamed as asked');
  assert.equal(details.id, clone.id, 'and the details point at the new id, not the old one');
  assert.notEqual(clone.id, SOURCE.id);
  assert.equal(details.isSshEnabled, false, 'everything that is not a claim comes across');
  assert.equal(clone.parentId, null);
});
