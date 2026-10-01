import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CreateAccepted, CreateSettled, McpCreateHooks } from '../brokerMcpDoor';
import { isLockedSecret, readSecret, unlockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import type { StoredSecret } from '../storedSecret';
import type { TreeNode } from '../types';
import { StubCancellationToken, loadEachWithVscode } from './vscodeStub';
import { ACCOUNT, PIN, Sinks, clickVscode, locked, sinks } from './pinWorld';
import { call, code, message, share, world as broker } from './brokerWorld';

/**
 * D-B of `PLAN_agent_creates_what_the_folder_holds.md` (§4.7): an agent's `creds_create` into a folder
 * that asks for a PIN on new entries.
 *
 * <p>The person's Add honours the folder (`pinOnCreate.pinForNewEntry`); the agent's create did not — it
 * wrote the values in the clear into a folder whose whole point is that nothing in it is. Now, after
 * the person allows the creation, the window asks the folder's PIN inside the same consent step, checks
 * it the way Add does, and seals every value BEFORE `runCreate` writes anything (rule R3 of the entry-PIN
 * plan). Dismissed, not agreed to three times, or out of time: the agent is told so and nothing is
 * made.</p>
 *
 * <p>Over the real `StorageManager` with every keychain write logged (`written`, the pattern of
 * `pinWorld.ts`), and the real hooks the broker calls, in the order the door calls them.</p>
 */

const SECRET = 'hunter2-quota-token-7f3a';
const LOGIN = 'quota-bot@example.com';
const BODY = { name: 'qwen quota', kind: 'credential', secret: SECRET, fields: { login: LOGIN } };
const FAR = (): number => Date.now() + 60_000;

interface World {
  storage: StorageManager;
  hooks: McpCreateHooks;
  s: Sinks;
  stub: Record<string, unknown>;
  /** Every value the keychain was ever handed. */
  written: string[];
  /** The person's own Add, loaded in the same graph — so the wrong-PIN counts are the ones the hooks see. */
  onCreate: typeof import('../pinOnCreate');
}

interface Keychain {
  keys(): string[];
  get(k: string): Promise<string | undefined>;
  store(k: string, v: string): Promise<void>;
  delete(k: string): Promise<void>;
  onDidChange(): undefined;
}

function keychain(written: string[]): Keychain {
  const map = new Map<string, string>();
  return {
    keys: () => [...map.keys()],
    get: (k) => Promise.resolve(map.get(k)),
    store: (k, v) => {
      map.set(k, v);
      written.push(v);
      return Promise.resolve();
    },
    delete: (k) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => undefined,
  };
}

function memento(): object {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown): Promise<void> => {
      map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      return Promise.resolve();
    },
  };
}

/**
 * One folder open to creation. `asks` sets the folder's preference; `sibling` puts a protected entry in
 * it under `PIN`, which is what makes a folder ask without the preference.
 */
async function world(folder: { asks?: boolean; sibling?: boolean }, inputs: (string | undefined)[]): Promise<World> {
  // A fresh module graph per world, so the wrong-PIN counts of `pinAttempts` start at zero too.
  const s = sinks();
  const stub = clickVscode([...inputs], s);
  const written: string[] = [];
  const [storageModule, hooksModule, onCreate] = loadEachWithVscode(['../storageManager', '../mcpHooks', '../pinOnCreate'], stub) as [
    typeof import('../storageManager'),
    typeof import('../mcpHooks'),
    typeof import('../pinOnCreate'),
  ];
  const storage = new storageModule.StorageManager(memento() as never, keychain(written) as never);
  await storage.upsertAccount({ accountId: ACCOUNT, email: 'me@example.com', provider: 'google' });
  await storage.addNode(ACCOUNT, { id: 'f1', name: 'Quotas', type: 'folder', parentId: null, mcp: { create: true }, ...(folder.asks === true ? { folderAsksForPin: true } : {}) });
  if (folder.sibling === true) {
    await storage.addNode(ACCOUNT, { id: 's1', name: 'grok key', type: 'entity', parentId: 'f1', details: { id: 's1', name: 'grok key', isSshEnabled: false, kind: 'credential', pinProtected: true } });
    await storage.setPassword(ACCOUNT, 's1', await locked('the sibling’s password'));
  }
  written.length = 0;
  return { storage, hooks: hooksModule.mcpCreateHooks(storage, () => undefined), s, stub, written, onCreate };
}

/** The door's order: choose, then — once the person allowed it — settle, then make only if settled. */
async function create(w: World, deadline: number = FAR()): Promise<CreateSettled> {
  const chosen = w.hooks.choose(BODY);
  assert.ok(chosen.ok, `precondition: the request fits the folder — ${chosen.ok ? '' : chosen.message}`);
  const accepted: CreateAccepted = chosen;
  const settled = await w.hooks.settle(accepted, deadline);
  if (settled.ok) {
    await w.hooks.make(accepted, BODY, settled);
  }
  return settled;
}

function made(w: World): TreeNode[] {
  return w.storage.getNodes(ACCOUNT).filter((node) => node.type === 'entity' && node.id !== 's1');
}

function onlyMade(w: World): TreeNode {
  const nodes = made(w);
  assert.equal(nodes.length, 1, 'one entry was created');
  return nodes[0];
}

async function opened(value: StoredSecret | string | undefined, pin: string): Promise<string> {
  const read = readSecret(value);
  assert.equal(read.kind, 'locked', `stored in the clear: ${String(value)}`);
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, pin) : '';
}

test('an agent’s entry in a folder that asks for a PIN is sealed before it is written, and never reaches the keychain in the clear', async () => {
  const w = await world({ asks: true }, ['2468', '2468']);

  const settled = await create(w);

  assert.equal(settled.ok, true, JSON.stringify(settled));
  assert.ok(w.written.length > 0, 'precondition: something was written');
  for (const value of w.written) {
    assert.ok(!value.includes(SECRET) && !value.includes(LOGIN), `the keychain was handed a value in the clear: ${value}`);
    assert.ok(isLockedSecret(value), `a value written unsealed: ${value}`);
  }
  assert.equal(w.s.boxes, 2, 'the first PIN of the folder, typed twice');
  const entry = onlyMade(w);
  assert.equal(entry.details?.pinProtected, true, 'the entry carries the mark');
  assert.equal(entry.pinEpoch, 1, 'and its first protection decision');
  assert.equal(await opened(await w.storage.getPassword(ACCOUNT, entry.id), '2468'), SECRET, 'the PIN opens what was sealed');
  assert.match(await opened(await w.storage.getFieldsRaw(ACCOUNT, entry.id), '2468'), new RegExp(LOGIN));
});

test('in a folder of protected entries the PIN is checked against them, as Add checks it, and the count is said in a message that asks nothing', async () => {
  const w = await world({ sibling: true }, [PIN]);

  const settled = await create(w);

  assert.equal(settled.ok, true, JSON.stringify(settled));
  assert.match(w.s.infos.join('\n'), /This PIN opens 1 of the 1 protected entries in this folder/);
  assert.equal(await opened(await w.storage.getPassword(ACCOUNT, onlyMade(w).id), PIN), SECRET);
  assert.ok(w.written.every((value) => !value.includes(SECRET)), 'nothing in the clear');
});

test('the agent’s PIN step raises no modal that could outlive it', async () => {
  // VS Code closes a box whose token is cancelled, and cannot close a modal from code at all: a modal
  // raised inside the step would stay on screen after its deadline, and its answer would be ignored.
  for (const [folder, inputs] of [
    [{ sibling: true }, [PIN]], // checked against a protected sibling
    [{ sibling: true }, ['9999', PIN]], // a miss first, then the sibling's PIN
    [{ asks: true }, ['2468', '2468']], // the folder's first PIN, typed twice
  ] as const) {
    const w = await world(folder, [...inputs]);

    const settled = await create(w);

    assert.deepEqual(w.s.modals, [], `a modal was raised inside the agent's PIN step (${JSON.stringify(inputs)})`);
    assert.equal(settled.ok, true, JSON.stringify(settled));
  }
});

test('a PIN that opens none of the folder’s protected entries is a declined attempt, and the box asks again', async () => {
  const w = await world({ sibling: true }, ['9999', PIN]);

  const settled = await create(w);

  assert.equal(settled.ok, true, JSON.stringify(settled));
  assert.equal(w.s.boxes, 2, 'the PIN that opened nothing was taken, or ended the step');
  assert.match(w.s.warnings.join('\n'), /This PIN opens none of the 1 protected entries in this folder/);
  assert.equal(await opened(await w.storage.getPassword(ACCOUNT, onlyMade(w).id), PIN), SECRET, 'sealed under the PIN the sibling opens');
});

test('the person’s own Add still confirms the count', async () => {
  // Add has no deadline, and "it opened none" is a real choice there — a folder may hold two PINs — so
  // the count stays a question the person answers, in a modal, and only an agreed count is taken.
  const w = await world({ sibling: true }, [PIN, '9999']);
  w.s.modalAnswers.push('Use this PIN', undefined);

  assert.deepEqual(await w.onCreate.pinForNewEntry(w.storage, ACCOUNT, 'f1'), { kind: 'pin', pin: PIN });
  assert.deepEqual(await w.onCreate.pinForNewEntry(w.storage, ACCOUNT, 'f1'), { kind: 'cancelled', typed: true }, 'a declined count is not a PIN');

  assert.equal(w.s.modals.length, 2, 'Add asked for no agreement');
  assert.match(w.s.modals[0], /^This PIN opens 1 of the 1 protected entries in this folder\.$/);
  assert.match(w.s.modals[1], /^This PIN opens none of the 1 protected entries in this folder\. The new entry will be the first under it/);
  assert.deepEqual(w.s.infos, [], 'the count was said without being asked');
});

test('a declined PIN creates nothing and tells the agent', async () => {
  const w = await world({ sibling: true }, [undefined]);

  const settled = await create(w);

  assert.equal(settled.ok, false, 'the create went ahead without the folder’s PIN');
  assert.ok(!settled.ok && settled.code === 'denied', JSON.stringify(settled));
  assert.match(settled.ok ? '' : settled.message, /"Quotas" asks for a PIN on every new entry.*Nothing was created/s);
  assert.deepEqual(made(w), [], 'nothing was created');
  assert.deepEqual(w.written, [], 'and nothing was written, not even for a moment');
});

test('three PINs that open none of the folder’s protected entries create nothing and say so', async () => {
  const w = await world({ sibling: true }, ['1111', '2222', '3333', '4444']);

  const settled = await create(w);

  assert.equal(w.s.boxes, 3, 'asked three times, not a fourth');
  assert.match(settled.ok ? '' : settled.message, /none of the 3 PINs typed opens its protected entries.*Nothing was created/s);
  assert.deepEqual(made(w), []);
  assert.deepEqual(w.written, []);
});

test('a PIN nobody gives before the consent step’s time runs out creates nothing, and the agent hears it timed out', async () => {
  const w = await world({ asks: true }, []);
  (w.stub.window as Record<string, unknown>).showInputBox = (): Promise<string> => new Promise(() => undefined);

  const settled = await create(w, Date.now() + 50);

  assert.ok(!settled.ok && settled.code === 'consent_timeout', JSON.stringify(settled));
  assert.match(settled.ok ? '' : settled.message, /not given in time.*Nothing was created/s);
  assert.deepEqual(made(w), []);
  assert.deepEqual(w.written, []);
});

test('a PIN box still open when the consent step’s time runs out is closed with it', async () => {
  // The agent is answered at the deadline and nothing is written; a box left on screen after that takes a
  // PIN nobody will use. VS Code closes a box whose token is cancelled — this stub does the same.
  const w = await world({ asks: true }, []);
  let closed = false;
  (w.stub.window as Record<string, unknown>).showInputBox = (_options: unknown, token?: StubCancellationToken): Promise<undefined> => {
    w.s.boxes += 1;
    w.s.boxTokens.push(token);
    return new Promise((resolve) => void token?.onCancellationRequested(() => resolve(void (closed = true))));
  };

  const settled = await create(w, Date.now() + 50);
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(!settled.ok && settled.code === 'consent_timeout', JSON.stringify(settled));
  assert.ok(w.s.boxTokens[0] !== undefined, 'the PIN box was raised with no cancellation token, so nothing could close it when the step ran out');
  assert.equal(closed, true, 'the PIN box stayed on screen after the step ran out');
  assert.equal(w.s.boxes, 1, 'and no second box followed the closed one');
  assert.ok(w.s.tokenSources.length === 1 && w.s.tokenSources[0].disposed, 'the token source was disposed');
  assert.deepEqual(made(w), []);
});

test('every PIN box an agent’s create raises carries the step’s token, and a PIN given in time cancels nothing', async () => {
  for (const [folder, inputs] of [
    [{ asks: true }, ['2468', '2468']], // the folder's first PIN, typed twice (`newPin`)
    [{ sibling: true }, [PIN]], // checked against a protected sibling
  ] as const) {
    const w = await world(folder, [...inputs]);

    const settled = await create(w);

    assert.equal(settled.ok, true, JSON.stringify(settled));
    assert.equal(w.s.boxTokens.length, inputs.length, 'precondition: every box was raised');
    assert.equal(w.s.tokenSources.length, 1, 'one source for the step');
    const [source] = w.s.tokenSources;
    assert.ok(w.s.boxTokens.every((token) => token === source.token), `a box without the step's token: ${JSON.stringify(folder)}`);
    assert.equal(source.token.isCancellationRequested, false, 'a PIN given in time cancelled the step');
    assert.equal(source.disposed, true, 'the token source was disposed');
  }
});

test('a folder that asks nothing asks nothing — the entry is written as before', async () => {
  const w = await world({}, []);

  const settled = await create(w);

  assert.deepEqual(settled, { ok: true });
  assert.equal(w.s.boxes, 0);
  assert.equal(await w.storage.getPassword(ACCOUNT, onlyMade(w).id), SECRET, 'the vault seals it; no entry PIN was asked for');
  assert.equal(onlyMade(w).details?.pinProtected, undefined);
});

test('a folder PIN not given after Allow answers the agent with the window’s sentence, and makes nothing (D-B)', async () => {
  // The PIN is asked INSIDE the consent step: the door hands `settle` the step's own deadline, taken
  // before the modal, and a refusal from it reaches the agent word for word — never a bare "denied".
  const sentence = 'The folder "Servers" asks for a PIN on every new entry, and the person did not give it. Nothing was created.';
  const w = broker({ create: 'open', settle: { ok: false, code: 'denied', message: sentence } });
  try {
    const { port } = await share(w);
    const before = Date.now();

    const answer = await call(port, '/v1/mcp/create', { body: { name: 'app-03', kind: 'ssh', secret: 'k' } });

    assert.equal(code(answer), 'denied');
    assert.equal(message(answer), sentence);
    assert.deepEqual(w.created, [], 'nothing was made');
    assert.equal(w.dialogs.length, 1, 'the person was asked first');
    assert.equal(w.settleDeadlines.length, 1);
    const bound = w.settleDeadlines[0] - before;
    assert.ok(bound > 4 * 60_000 && bound <= 5 * 60_000 + 1_000, `the PIN is bounded by the consent step's five minutes, not its own: ${bound} ms`);
  } finally {
    w.server.dispose();
  }
});

test('a Deny never reaches the PIN step', async () => {
  const w = broker({ create: 'open', answers: ['Deny'] });
  try {
    const { port } = await share(w);

    await call(port, '/v1/mcp/create', { body: { name: 'app-03', kind: 'ssh' } });

    assert.deepEqual(w.settleDeadlines, [], 'nobody is asked for a PIN for an entry they refused');
  } finally {
    w.server.dispose();
  }
});

