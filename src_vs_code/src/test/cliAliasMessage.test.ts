import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { cliCommandFor } from '../cliCommandText';
import { resolveKind, stampKind } from '../entityKind';
import { ENTITY_KINDS, EntityKind, EntityMetadata, TreeNode } from '../types';

/**
 * *Enable in CLI* says the command that will actually run the entry.
 *
 * <p>After naming an alias, the window told the person `creds ssh <alias>` for every kind that was not a
 * database — a Terminal entry included, whose verb is `creds run`. `cliCommandText.cliCommandFor` is the
 * one rule for the verb (the CLI row in the viewer reads it); the message now reads it too. The handler
 * is captured from the real `registerAgentCommands`, so what is invoked is what the window registered.</p>
 */

type Handler = (...args: unknown[]) => unknown;

const ALIAS = 'quota';

function stamped(kind: EntityKind, over: Partial<EntityMetadata> = {}): EntityMetadata {
  return stampKind({ id: `e-${kind}`, name: `${kind} entry`, isSshEnabled: kind === 'ssh', kind, ...over } as EntityMetadata);
}

/** What the window says after the alias is named, for an entry holding `details`. */
async function toldAfterNaming(details: EntityMetadata): Promise<string> {
  const told: string[] = [];
  const handlers = new Map<string, Handler>();
  const node: TreeNode = { id: details.id, name: details.name, type: 'entity', parentId: null, details };
  const mod = loadWithVscode<{ registerAgentCommands(host: Record<string, unknown>): void }>('../commands/agentCommands', {
    window: {
      showInputBox: (): Promise<string> => Promise.resolve(ALIAS),
      showInformationMessage: (message: string): Promise<undefined> => Promise.resolve(void told.push(message)),
    },
  });
  mod.registerAgentCommands({
    MACHINES: [],
    agentServer: { setFolderHooks: (): void => undefined },
    aliasMap: () => ({}),
    bridges: {},
    log: {},
    mutated: (): void => undefined,
    offerInstall: (): Promise<void> => Promise.resolve(),
    provider: {},
    register: (command: string, handler: Handler): void => void handlers.set(command, handler),
    setAliasMap: (): Promise<void> => Promise.resolve(),
    sshAgent: {},
    state: {},
    storage: { getAccounts: () => [], getNodes: () => [], getNode: (_a: string, id: string) => (id === node.id ? node : undefined) },
    storageDir: '',
    vaultKeys: {},
  });
  const enable = handlers.get('credSshManager.enableCliAccess');
  assert.ok(enable !== undefined, 'the command is registered');
  await enable({ accountId: 'a1', node: { id: node.id, name: node.name } });
  assert.equal(told.length, 1, 'the window said what the alias runs');
  return told[0];
}

test('a Terminal entry is told `creds run <alias>`, not `creds ssh`', async () => {
  const terminal = stamped('terminal', { command: 'pwsh' });
  assert.equal(resolveKind(terminal), 'terminal', 'precondition: the fixture is a Terminal entry');
  const message = await toldAfterNaming(terminal);
  assert.match(message, /creds run quota$/, 'the message named the wrong verb for a command');
  assert.doesNotMatch(message, /creds ssh/, 'a Terminal entry was told to ssh');
});

test('the message names the same command as the CLI row, for every kind', async () => {
  for (const kind of ENTITY_KINDS) {
    const details = stamped(kind, kind === 'ssh' ? { host: 'box.example.com' } : {});
    const message = await toldAfterNaming(details);
    assert.ok(message.endsWith(`: ${cliCommandFor(details, ALIAS)}`), `a ${kind} entry was told "${message}"`);
  }
});
