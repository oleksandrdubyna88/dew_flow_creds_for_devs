import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import type { McpCreateHooks } from '../brokerMcpDoor';
import type { EntityMetadata, FolderType, TreeNode } from '../types';

/**
 * An agent's create, through the real vault: what lands, in which slot, and what is refused before
 * anybody is asked.
 *
 * <p>The defect this file was written against (2026-09-29): an agent asked to store two PowerShell
 * commands in a Terminal folder sent the only thing the tool let it send — a `host` — and the window
 * stored it. The entry was a Terminal entry with an empty Command box and an SSH line in its viewer.
 * The first test below is that request, and it must be REFUSED with a sentence naming what a
 * terminal entry takes, with nothing written.</p>
 *
 * <p>Over the real `StorageManager` rather than a stub, because the claim is about what is STORED —
 * which slot a database's connection string goes to, that a credential's login is in the fields
 * record and not on the node — and a stub of storage would be a second opinion about that.</p>
 */

interface Storage {
  upsertAccount(account: { accountId: string; email: string; provider: 'microsoft' }): Promise<void>;
  addNode(accountId: string, node: TreeNode): Promise<void>;
  getNodes(accountId: string): readonly TreeNode[];
  getPassword(accountId: string, id: string): Promise<string | undefined>;
  getDbConnection(accountId: string, id: string): Promise<string | undefined>;
  getConfigBody(accountId: string, id: string): Promise<string | undefined>;
  getVpnConfig(accountId: string, id: string): Promise<string | undefined>;
  getPrivateKey(accountId: string, id: string): Promise<string | undefined>;
  getFields(accountId: string, id: string): Promise<{ login?: string; url?: string }>;
  getNotes(accountId: string, id: string): Promise<string | undefined>;
}

const STUB = {
  window: {},
  EventEmitter: class {
    event = (): void => {};
    fire(): void {}
  },
  Uri: { file: (p: string): object => ({ fsPath: p }) },
  workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
};

function memento(): { get<T>(key: string, fallback?: T): T | undefined; update(key: string, value: unknown): Promise<void> } {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown): Promise<void> => {
      map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      return Promise.resolve();
    },
  };
}

function secrets(): { get(k: string): Promise<string | undefined>; store(k: string, v: string): Promise<void>; delete(k: string): Promise<void>; onDidChange(): void } {
  const map = new Map<string, string>();
  return {
    get: (k) => Promise.resolve(map.get(k)),
    store: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
    delete: (k) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => {},
  };
}

const A = 'acc-1';

/** A vault with one account and one folder open to creation, typed or not, and the hooks over it. */
async function vault(folderType?: FolderType): Promise<{ storage: Storage; hooks: McpCreateHooks; made: string[] }> {
  const { StorageManager } = loadWithVscode<{ StorageManager: new (memento: unknown, secrets: unknown) => Storage }>('../storageManager', STUB);
  const { mcpCreateHooks } = loadWithVscode<{ mcpCreateHooks: (storage: Storage, onMade: () => void) => McpCreateHooks }>('../mcpHooks', STUB);
  const storage = new StorageManager(memento(), secrets());
  await storage.upsertAccount({ accountId: A, email: 'me@example.com', provider: 'microsoft' });
  await storage.addNode(A, { id: 'f1', name: 'Commands', type: 'folder', parentId: null, mcp: { create: true }, ...(folderType === undefined ? {} : { folderType }) });
  const made: string[] = [];
  return { storage, hooks: mcpCreateHooks(storage, () => made.push('made')), made };
}

/** Choose, and if accepted, make — the two hook calls the door makes, in order. */
async function create(hooks: McpCreateHooks, body: Record<string, unknown>): Promise<{ ok: boolean; message: string; id: string }> {
  const chosen = hooks.choose(body);
  if (!chosen.ok) {
    return { ok: false, message: chosen.message, id: '' };
  }
  const made = await hooks.make(chosen, body);
  return { ok: true, message: chosen.summary, id: made.id };
}

function entries(storage: Storage): TreeNode[] {
  return storage.getNodes(A).filter((node) => node.type === 'entity');
}

/** The stored record of one entry, or a failure naming it — so no assertion reads through `?.`. */
function detailsOf(storage: Storage, id: string): EntityMetadata {
  const node = entries(storage).find((e) => e.id === id);
  return node?.details ?? assert.fail(`no entry ${id} was stored`);
}

test('a terminal entry asked for with a host is refused naming the terminal fields, and nothing is created', async () => {
  // The owner's two entries, exactly as the other session sent them. Before this, `choose` accepted
  // the request and `make` stored the host on a kind that has none.
  const { storage, hooks } = await vault('terminal');

  const answer = await create(hooks, { name: 'qwen token plan: quota left', kind: 'terminal', host: 'token-plan.ap-southeast-1.maas.aliyuncs.com' });

  assert.equal(answer.ok, false, `the request was accepted: ${answer.message}`);
  assert.match(answer.message, /`host` is not a field of a terminal entry/);
  assert.match(answer.message, /command \(required\), args, commandNote, terminalOs, notes/);
  assert.deepEqual(entries(storage), [], 'nothing was created');
});

test('a terminal entry is created with its command, args, note and OS — and no host', async () => {
  const { storage, hooks, made } = await vault('terminal');

  const answer = await create(hooks, {
    name: 'grok key: status and limits',
    kind: 'terminal',
    fields: {
      command: 'pwsh',
      args: [{ value: '-File' }, { value: 'check-quota.ps1', note: 'the script beside the repo' }, { value: '-Verbose', enabled: false }],
      commandNote: 'How much of the plan is left.',
      terminalOs: 'windows',
    },
  });

  assert.equal(answer.ok, true, answer.message);
  const details = detailsOf(storage, answer.id);
  assert.equal(entries(storage)[0].name, 'grok key: status and limits');
  assert.equal(details.kind, 'terminal');
  assert.equal(details.command, 'pwsh');
  assert.deepEqual(details.commandArgs, [
    { value: '-File' },
    { value: 'check-quota.ps1', note: 'the script beside the repo' },
    { value: '-Verbose', disabled: true },
  ]);
  assert.equal(details.commandNote, 'How much of the plan is left.');
  assert.equal(details.terminalOs, 'windows');
  assert.equal(details.host, undefined, 'a terminal entry has no host');
  assert.equal(details.mcpCreatedByAgent, true);
  assert.deepEqual(made, ['made']);
});

test('a missing required field and a bad enum word are each refused with the kind\'s sentence', async () => {
  const { storage, hooks } = await vault('terminal');

  const noCommand = await create(hooks, { name: 'x', kind: 'terminal', fields: { commandNote: 'no command here' } });
  const badOs = await create(hooks, { name: 'x', kind: 'terminal', fields: { command: 'ls', terminalOs: 'amiga' } });

  assert.match(noCommand.message, /A terminal entry needs `command`/);
  assert.match(badOs.message, /`terminalOs` must be one of: windows, macos, linux/);
  assert.deepEqual(entries(storage), []);
});

test('a secret inside `fields` is refused by name, pointing at secret and secretKind', async () => {
  const { storage, hooks } = await vault();

  const answer = await create(hooks, { name: 'x', kind: 'credential', fields: { password: 'hunter2' } });

  assert.equal(answer.ok, false);
  assert.match(answer.message, /`password` is a secret: send it as `secret`, or prefer `secretKind`/);
  assert.deepEqual(entries(storage), []);
});

test('the secret lands in the slot its kind owns: connection string, config body, VPN config, private key, password', async () => {
  // Routed by kind through the same additions pass the form uses. Before this, every kind's secret
  // went to the password slot — which a database does not even keep.
  const { storage, hooks } = await vault();

  const db = await create(hooks, { name: 'orders', kind: 'db', secret: 'postgres://app:pw@db/orders', fields: { dbType: 'postgres' } });
  const config = await create(hooks, { name: 'dev settings', kind: 'config', secret: 'A=1\n', fields: { configFormat: 'env', configFileName: '.env' } });
  const vpn = await create(hooks, { name: 'office', kind: 'vpn', secret: '[Interface]\n', fields: { vpnType: 'wireguard' } });
  const key = await create(hooks, { name: 'ci key', kind: 'sshkey', secret: '-----BEGIN KEY-----', fields: { publicKey: 'ssh-ed25519 AAAA ci' } });
  const login = await create(hooks, { name: 'console', kind: 'credential', secret: 'pw', fields: { login: 'svc', url: 'https://c.example', notes: 'made by the agent' } });

  assert.equal(await storage.getDbConnection(A, db.id), 'postgres://app:pw@db/orders');
  assert.equal(await storage.getPassword(A, db.id), undefined, 'a database has no password slot');
  assert.equal(await storage.getConfigBody(A, config.id), 'A=1\n');
  assert.equal(await storage.getVpnConfig(A, vpn.id), '[Interface]\n');
  assert.equal(await storage.getPrivateKey(A, key.id), '-----BEGIN KEY-----');
  assert.equal(await storage.getPassword(A, login.id), 'pw');
  assert.deepEqual(await storage.getFields(A, login.id), { login: 'svc', url: 'https://c.example' });
  assert.equal(await storage.getNotes(A, login.id), 'made by the agent');
  assert.equal(JSON.stringify(detailsOf(storage, login.id)).includes('svc'), false, 'the login is not on the node');
  assert.equal(detailsOf(storage, config.id).configFormat, 'env');
});

test('a kind whose secret cannot be drawn refuses `secretKind` before anybody is asked', async () => {
  const { storage, hooks } = await vault();

  const answer = await create(hooks, { name: 'orders', kind: 'db', secretKind: 'password', fields: { dbType: 'postgres' } });

  assert.equal(answer.ok, false);
  assert.match(answer.message, /A db entry's secret is its connection string, which cannot be generated here/);
  assert.deepEqual(entries(storage), []);
});

test('an untyped folder validates against the kind the agent NAMED', async () => {
  const { storage, hooks } = await vault();

  const refused = await create(hooks, { name: 'x', kind: 'terminal', fields: { host: 'h' } });
  const accepted = await create(hooks, { name: 'y', kind: 'ssh', fields: { host: 'h' } });

  assert.match(refused.message, /not a field of a terminal entry/);
  assert.equal(accepted.ok, true, accepted.message);
  assert.equal(detailsOf(storage, accepted.id).host, 'h');
});

test('an old relay\'s top-level host, user and port still work for an ssh entry', async () => {
  const { storage, hooks } = await vault('ssh');

  const answer = await create(hooks, { name: 'app-03', kind: 'ssh', secret: 'k', host: 'app-03.internal', user: 'deploy', port: 2222 });

  assert.equal(answer.ok, true, answer.message);
  const details = detailsOf(storage, answer.id);
  assert.equal(details.host, 'app-03.internal');
  assert.equal(details.user, 'deploy');
  assert.equal(details.port, 2222);
  assert.equal(details.isSshEnabled, true);
});

test('a payment folder refuses every creation, in the owner\'s words (D-A)', async () => {
  const { storage, hooks } = await vault('payment');

  const answer = await create(hooks, { name: 'corp card', kind: 'payment', fields: {} });

  assert.equal(answer.ok, false);
  assert.match(answer.message, /A payment entry cannot be created by an agent/);
  assert.deepEqual(entries(storage), []);
});

test('a script is stored whole, with its variables, and defaults to bash', async () => {
  const body = '#!/usr/bin/env bash\nset -euo pipefail\ncurl -fsS "https://api.example.com/quota?plan=${PLAN}"\n';
  const { storage, hooks } = await vault('script');

  const answer = await create(hooks, { name: 'quota', kind: 'script', fields: { script: body, vars: [{ name: 'PLAN', value: 'token-plan' }] } });

  assert.equal(answer.ok, true, answer.message);
  const details = detailsOf(storage, answer.id);
  assert.equal(details.script, body, 'the body is kept exactly, untrimmed');
  assert.deepEqual(details.scriptVars, [{ name: 'PLAN', value: 'token-plan' }]);
  assert.equal(details.scriptLanguage, 'bash');
});
