import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExternalBundle } from '../externalBundle';
import type { StorageManager } from '../storageManager';
import { EntityMetadata, TreeNode } from '../types';
import { ACCOUNT, PIN, Sinks, clickVscode, locked, memoryStorage, seedEntry, sinks } from './pinWorld';
import { loadWithVscode } from './vscodeStub';

/**
 * Exporting a PIN-protected entry — D8 of the entry-PIN plan, through the REAL export command over the
 * real vault.
 *
 * <p>An export is a full copy the person makes deliberately, for somebody else. It asked nothing of a
 * protected entry and wrote its envelopes into the file — values bound to this account, which no
 * recipient could open — and dropped its login and URL, because the record parsed as `{}`. Now it asks
 * each protected entry's PIN once (a decline writes nothing), writes the OPENED values, claims no PIN
 * for the copy, and says how many protected entries go in.</p>
 */

interface Exported {
  s: Sinks;
  /** Every quick-pick title and modal message, in order. */
  asked: string[];
  file: ExternalBundle | undefined;
}

/** A `vscode` for the export flow: the plain-JSON form chosen, its modal confirmed, the file captured. */
function exportVscode(inputs: (string | undefined)[], s: Sinks, asked: string[], written: Record<string, string>): Record<string, unknown> {
  const base = clickVscode(inputs, s);
  const window = base.window as Record<string, unknown>;
  const uri = (p: string): object => ({ fsPath: p, path: p, with: (change: { path: string }) => uri(change.path) });
  return {
    ...base,
    window: {
      ...window,
      showQuickPick: (items: { plain: boolean }[], options: { title: string }) => {
        asked.push(options.title);
        return Promise.resolve(items.find((item) => item.plain));
      },
      showWarningMessage: (message: string, ...rest: unknown[]) => {
        asked.push(message);
        return Promise.resolve(rest.includes('Write plain JSON') ? 'Write plain JSON' : (s.warnings.push(message), undefined));
      },
      showSaveDialog: () => Promise.resolve(uri('/tmp/export.json')),
    },
    Uri: { file: (p: string) => uri(p) },
    workspace: {
      ...(base.workspace as Record<string, unknown>),
      fs: {
        writeFile: (target: { path: string }, bytes: Uint8Array) => {
          written[target.path] = Buffer.from(bytes).toString('utf8');
          return Promise.resolve();
        },
        rename: (from: { path: string }, to: { path: string }) => {
          written[to.path] = written[from.path];
          delete written[from.path];
          return Promise.resolve();
        },
        delete: (target: { path: string }) => {
          delete written[target.path];
          return Promise.resolve();
        },
      },
    },
  };
}

const card = (): EntityMetadata =>
  ({ id: 'p1', name: 'orest payoneer', kind: 'payment', isPayment: true, isSshEnabled: false, pinProtected: true }) as EntityMetadata;
const plain = (): EntityMetadata => ({ id: 'c2', name: 'wiki', kind: 'credential', isSshEnabled: false }) as EntityMetadata;

/** Seed a protected card and an ordinary credential, and export both. */
async function exportBoth(inputs: (string | undefined)[]): Promise<Exported> {
  const s = sinks();
  const asked: string[] = [];
  const written: Record<string, string> = {};
  const stub = exportVscode([...inputs], s, asked, written);
  const storage: StorageManager = memoryStorage(stub);
  await seedEntry(storage, card(), {
    'payment details': await locked('{"number":"4111111111111111","cvv":"123"}'),
    'login and URL': await locked('{"login":"orest","url":"https://payoneer.com"}'),
  });
  await seedEntry(storage, plain(), { password: 'wiki-pw' });
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const { registerExportCommand } = loadWithVscode<typeof import('../commands/exportCommand')>('../commands/exportCommand', stub);
  registerExportCommand({
    register: (command, handler) => handlers.set(command, handler),
    storage,
    vaultKeys: { noteUserActivity: () => undefined } as never,
    log: { info: () => undefined, warn: () => undefined, error: () => undefined } as never,
  });
  const nodes = storage.getNodes(ACCOUNT) as TreeNode[];
  await handlers.get('credSshManager.exportExternal')?.({ kind: 'node', accountId: ACCOUNT, node: nodes[0] }, nodes.map((node) => ({ kind: 'node', accountId: ACCOUNT, node })));
  const content = written['/tmp/export.json'];
  return { s, asked, file: content === undefined ? undefined : (JSON.parse(content) as ExternalBundle) };
}

test('exporting a protected entry asks its PIN once and writes the OPENED values, its login and URL, and no PIN claim', async () => {
  const { s, file } = await exportBoth([PIN]);

  assert.ok(file !== undefined, `no file was written; warnings: ${s.warnings.join(' | ')}`);
  assert.ok(!JSON.stringify(file).includes('"lock"'), 'the file carried an envelope no recipient can open');
  assert.deepEqual(JSON.parse(file.secrets.p1.payment ?? '{}'), { number: '4111111111111111', cvv: '123' });
  assert.equal(file.secrets.p1.login, 'orest');
  assert.equal(file.secrets.p1.url, 'https://payoneer.com');
  assert.equal(file.secrets.c2.password, 'wiki-pw', 'the ordinary entry is exported as it always was');
  const exported = file.nodes.find((node) => node.id === 'p1');
  assert.equal(exported?.details?.pinProtected, undefined, 'the copy claims a PIN nobody at the other end has');
  assert.equal(s.boxes, 1, 'one PIN, for the one protected entry');
});

test('a declined PIN exports NOTHING, and says which entry stopped it', async () => {
  const { s, file } = await exportBoth([undefined]);

  assert.equal(file, undefined, 'a file was written after the person said no');
  assert.match(s.warnings.join(' '), /"orest payoneer" is protected with its own PIN, so nothing was exported\. Its values have to be unwrapped here before they can leave\./);
});

test('the picker and the plain-JSON modal say how many protected entries go in, and the card note counts the protected CVV', async () => {
  const { asked } = await exportBoth([PIN]);

  const [title, modal] = asked;
  assert.match(title, /1 of these entries is protected with its own PIN; its values go into the file unwrapped/);
  assert.match(modal, /1 of these entries is protected with its own PIN/);
  assert.match(title, /Includes 1 value a share would remove, across 1 entry/, 'the CVV of the protected card was not counted');
});
