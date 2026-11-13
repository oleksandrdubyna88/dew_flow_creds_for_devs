import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordingLog } from './liveColourStorage';
import { E1_IN_FOLDER, FOLDER, OPTIONS, entity, storageWith, world } from './sshConnectWorld';

/**
 * The person's own Connect SSH command (`credSshManager.connectSsh`, registered by `registerAgentCommands`) hands
 * `connectEntity` the host's diagnostic log (E1.S3, decision D2: a failed colour write is never silent).
 *
 * <p>The review finding this holds: the command built its options WITHOUT `log`, so the one line a failed write
 * leaves was dropped on the road most people use. `ConnectOptions.log` is required now, so the compiler refuses the
 * omission; this runs the REAL command registration over the real `connectEntity` and a storage whose colour write
 * rejects, because the compiler cannot say whether the log handed over is the host's.</p>
 */
test('the_connect_ssh_command_leaves_one_folderColors_line_when_the_colour_write_fails_and_still_connects', async () => {
  const failing = storageWith(E1_IN_FOLDER, FOLDER);
  failing.failNextWrite(new Error('the store is down'));
  const { log, lines } = recordingLog();
  const w = world(
    {
      source: { kind: 'password', password: 'hunter2' },
      options: OPTIONS,
      hostStub: {
        env: { remoteName: undefined, clipboard: { writeText: (): Promise<void> => Promise.resolve() } },
        workspace: { workspaceFolders: undefined, getConfiguration: () => ({ get: (_key: string, fallback: unknown): unknown => fallback }) },
      },
    },
    ['../commands/agentCommands'],
  );
  const { registerAgentCommands } = w.loaded[0] as { registerAgentCommands(host: Record<string, unknown>): void };
  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  registerAgentCommands({
    MACHINES: [],
    agentServer: { setFolderHooks: (): void => undefined },
    aliasMap: () => ({}),
    bridges: {},
    log,
    mutated: (): void => undefined,
    offerInstall: (): Promise<void> => Promise.resolve(),
    provider: {},
    register: (command: string, handler: (...args: unknown[]) => unknown): void => void handlers.set(command, handler),
    setAliasMap: (): Thenable<void> => Promise.resolve(),
    sshAgent: { servesKeyFor: (): boolean => false },
    state: { get: (): undefined => undefined, update: (): Thenable<void> => Promise.resolve() },
    storage: failing,
    storageDir: '/storage',
    vaultKeys: { noteUserActivity: (): void => undefined },
    wslRelay: { serving: () => [], socketPathFor: () => '' },
  });
  const connect = handlers.get('credSshManager.connectSsh');
  assert.ok(connect !== undefined, `not registered; got: ${[...handlers.keys()].join(', ')}`);

  await connect({ kind: 'node', accountId: 'a1', node: { id: 'e1', name: 'prod', details: entity() } });

  assert.equal(w.created.length, 1, 'the terminal opened');
  assert.equal('color' in w.created[0], false, 'without a colour');
  assert.deepEqual(
    lines.map((line) => ({ level: line.level, source: line.source })),
    [{ level: 'warn', source: 'folderColors' }],
    `exactly one folderColors line in the host's log, got: ${JSON.stringify(lines)}`,
  );
  assert.match(lines[0].message, /the store is down/);
  assert.doesNotMatch(lines[0].message, /prod|ssh connections/, 'it names no folder and no entry');
});
