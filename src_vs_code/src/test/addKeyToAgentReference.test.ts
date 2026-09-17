import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';

/**
 * *Add Key to Agent*, reached from the refusal a WSL window now shows.
 *
 * <p>Reported by a person clicking that button, 2026-09-17, with the entry `project-tools` whose
 * <b>Key source</b> is <i>entity: server key 2</i> — a connection that POINTS AT a key rather than
 * carrying one. Two things went wrong, and the screenshots showed both:</p>
 *
 * <ul>
 *   <li>the agent was handed the CONNECTION, so it looked for a key on `project-tools`, found none,
 *       and said <i>"project-tools" has no private key stored in the vault</i> — true of the
 *       connection, false of the question, and confusing because the key was right there;</li>
 *   <li>the remedy reported success regardless, so the connect retried, refused for the same
 *       reason, and put a second identical dialog on screen the instant the first was dismissed.</li>
 * </ul>
 *
 * <p>The handler is captured from the real `register` rather than imported, so what these drive is
 * what the extension REGISTERED — the same reason `forgetAgentConsents.test.ts` does it that way.</p>
 */

type Handler = (...args: unknown[]) => unknown;

interface Loaded {
  accountId: string;
  entityId: string;
  entityName: string;
}

interface World {
  handler: Handler;
  loads: Loaded[];
  marked: { id: string; fields: unknown }[];
  warned: string[];
  told: string[];
}

const CONNECTION = {
  id: 'c1',
  name: 'project-tools',
  details: { id: 'c1', name: 'project-tools', host: '10.120.39.139', sshKeyEntityId: 'k2' },
};
const KEY = { id: 'k2', name: 'server key 2', details: { id: 'k2', name: 'server key 2' } };

function world(loadFails = false): World {
  const loads: Loaded[] = [];
  const marked: { id: string; fields: unknown }[] = [];
  const warned: string[] = [];
  const told: string[] = [];
  const handlers = new Map<string, Handler>();
  const mod = loadWithVscode<{ registerAgentCommands(host: Record<string, unknown>): void }>(
    '../commands/agentCommands',
    {
      window: {
        showWarningMessage: (m: string): Thenable<undefined> => {
          warned.push(m);
          return Promise.resolve(undefined);
        },
        showInformationMessage: (m: string): Thenable<undefined> => {
          told.push(m);
          return Promise.resolve(undefined);
        },
        showErrorMessage: (m: string): Thenable<undefined> => {
          told.push(m);
          return Promise.resolve(undefined);
        },
      },
    },
  );
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
    setAliasMap: (): Thenable<void> => Promise.resolve(),
    sshAgent: {
      load: (accountId: string, details: { id: string; name: string }): Promise<unknown> => {
        loads.push({ accountId, entityId: details.id, entityName: details.name });
        return Promise.resolve(
          loadFails
            ? { ok: false, reason: `"${details.name}" has no private key stored in the vault.` }
            : { ok: true, fingerprint: 'SHA256:test' },
        );
      },
    },
    state: { get: (): undefined => undefined, update: (): Thenable<void> => Promise.resolve() },
    storage: {
      getAccounts: () => [],
      getNodes: () => [],
      getNode: (_a: string, id: string): unknown => (id === 'k2' ? KEY : undefined),
      updateDetailsFields: (_a: string, id: string, fields: unknown): Thenable<void> => {
        marked.push({ id, fields });
        return Promise.resolve();
      },
    },
    storageDir: '',
    vaultKeys: { noteUserActivity: (): void => undefined },
    wslRelay: { serving: () => [], socketPathFor: () => '' },
  });
  const handler = handlers.get('credSshManager.addKeyToAgent');
  assert.ok(handler !== undefined, `not registered; got: ${[...handlers.keys()].join(', ')}`);
  return { handler, loads, marked, warned, told };
}

const clickOn = (w: World): Promise<unknown> =>
  Promise.resolve(w.handler({ kind: 'node', accountId: 'a1', node: CONNECTION }));

test('a connection row loads the KEY it points at, not the connection itself', async () => {
  // The report. Handed the connection, the agent looked for a key on `project-tools`, found none,
  // and said so — about an entry that never had one, while `server key 2` sat beside it.
  const w = world();

  await clickOn(w);

  assert.deepEqual(w.loads, [{ accountId: 'a1', entityId: 'k2', entityName: 'server key 2' }]);
  assert.deepEqual(w.warned, [], `it warned: ${w.warned.join(' | ')}`);
});

test('and the agent flag is written on the KEY, which is what is being served', async () => {
  const w = world();

  await clickOn(w);

  assert.deepEqual(w.marked, [{ id: 'k2', fields: { sshAgent: true } }]);
});

test('it ANSWERS true when the key was loaded, so a caller may retry the connection', async () => {
  const w = world();

  assert.equal(await clickOn(w), true);
});

test('it answers FALSE when the agent refused — the second dialog came from not asking', async () => {
  // Reporting success regardless is what made the refusal appear twice: the retry fired, refused
  // for the same reason, and said the same thing again.
  const w = world(true);

  assert.equal(await clickOn(w), false);
  assert.equal(w.warned.length, 1, 'the reason was not shown');
});

test('a reference pointing at an entry that is gone is refused, not loaded blindly', async () => {
  const w = world();
  const dangling = { ...CONNECTION, details: { ...CONNECTION.details, sshKeyEntityId: 'missing' } };

  const answer = await w.handler({ kind: 'node', accountId: 'a1', node: dangling });

  assert.equal(answer, false);
  assert.deepEqual(w.loads, [], 'it tried to load something it could not find');
  assert.match(w.warned[0], /no longer in the vault/);
});

test('an entry that carries its OWN key still loads itself — the reference is optional', async () => {
  const w = world();
  const ownKey = { id: 'k9', name: 'git key', details: { id: 'k9', name: 'git key' } };

  await w.handler({ kind: 'node', accountId: 'a1', node: ownKey });

  assert.deepEqual(w.loads, [{ accountId: 'a1', entityId: 'k9', entityName: 'git key' }]);
});
