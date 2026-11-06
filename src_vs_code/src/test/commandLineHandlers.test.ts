import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NAME_REFUSAL } from '../commandName';
import { EntityMetadata } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * Copy Command and Show Command (parent `PLAN_terminal_folder_run.md` §1, story S2): the REAL handlers of
 * `registerEntityCommands`, under the `vscode` stub. A refused name copies the template and says so; it never
 * copies a resolved line.
 */

type Handler = (target: unknown) => Promise<void>;

interface Sinks {
  warnings: string[];
  infos: string[];
  copied: string[];
  documents: string[];
  copy(node: unknown): Promise<void>;
  show(node: unknown): Promise<void>;
}

function handlers(): Sinks {
  const warnings: string[] = [];
  const infos: string[] = [];
  const copied: string[] = [];
  const documents: string[] = [];
  const stub = {
    window: {
      showWarningMessage: (m: string) => (warnings.push(m), Promise.resolve(undefined)),
      showInformationMessage: (m: string) => (infos.push(m), Promise.resolve(undefined)),
      showTextDocument: () => Promise.resolve(undefined),
    },
    env: { clipboard: { writeText: (t: string) => (copied.push(t), Promise.resolve()) } },
    workspace: { openTextDocument: (o: { content: string }) => (documents.push(o.content), Promise.resolve({})) },
  };
  const mod = loadWithVscode<typeof import('../commands/entityCommands')>('../commands/entityCommands', stub, { '../extension': { maskingBanner: () => '' } });
  const registered: Record<string, Handler> = {};
  const register = (command: string, handler: Handler): void => void (registered[command] = handler);
  const storage = { getNode: () => undefined, getHistory: () => Promise.resolve([]) };
  // `registerEntityCommands` reads a dozen host keys; only `register`, `storage` and `vaultKeys` matter to these two
  // handlers, so the rest answer a no-op through a Proxy.
  const host = new Proxy({ register, storage, vaultKeys: { noteUserActivity: () => undefined } }, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => undefined) });
  mod.registerEntityCommands(host as never);
  const click = (command: string) => (node: unknown): Promise<void> => registered[command]({ kind: 'node', accountId: 'a1', node });
  return { warnings, infos, copied, documents, copy: click('credSshManager.copyCommand'), show: click('credSshManager.showCommand') };
}

function node(name: string, command: string): { id: string; name: string; type: 'entity'; details: EntityMetadata } {
  return { id: 'e1', name, type: 'entity', details: { id: 'e1', name, isSshEnabled: false, isTerminal: true, command } };
}

test('copy_command_copies_the_line_and_says_copied', async () => {
  const h = handlers();
  await h.copy(node('alert', 'x {name}'));
  await h.show(node('alert', 'x {name}'));

  assert.deepEqual(h.copied, ['x alert']);
  assert.deepEqual(h.infos, ['Copied: x alert']);
  assert.deepEqual(h.warnings, []);
  assert.ok(h.documents[0].startsWith('x alert'), h.documents[0]);
});

test('copy_of_a_refused_name_copies_the_template_and_warns', async () => {
  const h = handlers();
  await h.copy(node('a b', 'x {name}'));
  await h.show(node('a b', 'x {name}'));

  assert.deepEqual(h.copied, ['x {name}']);
  assert.deepEqual(h.infos, []);
  assert.deepEqual(h.warnings, [`Copied the template: "a b" will not run: ${NAME_REFUSAL}`]);
  assert.ok(h.documents[0].includes('x {name}'), h.documents[0]);
  assert.ok(h.documents[0].includes('will not run:'), h.documents[0]);
});

test('no_details_still_says_no_command', async () => {
  const h = handlers();
  const bare = { id: 'n', name: 'n', type: 'entity' };
  await h.copy(bare);
  await h.show(bare);

  assert.deepEqual(h.warnings, ['"n" has no command yet.']);
  assert.deepEqual(h.copied, []);
  assert.deepEqual(h.documents, ['This entry has no command yet.']);
});
