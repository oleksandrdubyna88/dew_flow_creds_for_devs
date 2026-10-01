import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntityFormOptions, EntityFormValues } from '../entityFormShape';
import { isLockedSecret, readSecret, unlockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import type { EntityMetadata, TreeNode } from '../types';
import { loadEachWithVscode } from './vscodeStub';
import { ACCOUNT, PIN, Sinks, clickVscode, locked, memoryStorage, sinks } from './pinWorld';

/**
 * A person's Add into a folder that asks for a PIN — rule R3 of the entry-PIN plan on the one create
 * path that did not keep it (`PLAN_typed_stored_secrets.md` §2.7, found on 2026-09-30).
 *
 * <p>The handler wrote every value through the storage itself and sealed afterwards with
 * `applyCreatePin`, "because it wraps what is THERE" — the "write, then protect" order R3 rejected for
 * Edit, and the one the agent's create in the same folder was deliberately built without. A process
 * killed between the two left the new entry's values in the clear in the keychain under a node that
 * claimed nothing. Now the additions go through the same sealing writer the agent's create uses, so
 * the keychain never sees a value of such an entry unsealed, and `applyCreatePin` runs after as the
 * idempotent sweep, the history and the mark.</p>
 *
 * <p>Over the REAL `StorageManager` with every keychain write logged (`written`, the pattern of
 * `pinWorld.ts`) and the real `credSshManager.addEntity` handler; the form is a mock that posts what a
 * person typed.</p>
 */

const SECRET = 'hunter2-typed-into-the-form';
const NOTE = 'a note typed into the form';
const LOGIN = 'quota-bot@example.com';
const FIRST_PIN = '2468';

type Handler = (...args: unknown[]) => unknown;

interface World {
  readonly storage: StorageManager;
  readonly s: Sinks;
  /** Every value the keychain was ever handed, in order — R3 is about the moment between two writes. */
  readonly written: string[];
  /** The PIN boxes' answers; a second run pushes its own. */
  readonly inputs: (string | undefined)[];
  add(): Promise<void>;
  entries(): TreeNode[];
}

/** What the form posts: a password, a note and a login — three slots, so a kill can land between two. */
function posted(id: string): EntityFormValues {
  return {
    details: { id, name: 'prod-db', isSshEnabled: false, kind: 'credential' } as EntityMetadata,
    newPassword: SECRET,
    newNotes: NOTE,
    newFields: { login: LOGIN },
    clearPassword: false,
    clearPrivateKey: false,
    clearVpnConfig: false,
    clearDbConnection: false,
    clearAttachment: false,
    clearImage: false,
    clearTotp: false,
    clearHostKey: false,
    dependsOnColors: [],
  } as EntityFormValues;
}

/**
 * One folder to add into. `asks` sets the folder's preference (the first PIN here is typed twice);
 * `sibling` puts a protected entry in it under `PIN`, which makes the folder ask and check.
 */
async function world(folder: { asks?: boolean; sibling?: boolean }, inputs: (string | undefined)[]): Promise<World> {
  const s = sinks();
  const queue = [...inputs];
  const stub = clickVscode(queue, s);
  const written: string[] = [];
  const storage = memoryStorage(stub, written);
  await storage.upsertAccount({ accountId: ACCOUNT, email: 'me@example.com', provider: 'google' });
  await storage.addNode(ACCOUNT, { id: 'f1', name: 'Production', type: 'folder', parentId: null, ...(folder.asks === true ? { folderAsksForPin: true } : {}) });
  if (folder.sibling === true) {
    await storage.addNode(ACCOUNT, { id: 's1', name: 'prod-cache', type: 'entity', parentId: 'f1', details: { id: 's1', name: 'prod-cache', isSshEnabled: false, kind: 'credential', pinProtected: true } as EntityMetadata });
    await storage.setPassword(ACCOUNT, 's1', await locked('the sibling’s password'));
  }
  const handlers = new Map<string, Handler>();
  const [mod] = loadEachWithVscode(['../commands/treeMutationCommands'], stub, {
    '../entityFormPanel': { showEntityForm: (options: EntityFormOptions): Promise<EntityFormValues> => Promise.resolve(posted(options.entityId)) },
  }) as [typeof import('../commands/treeMutationCommands')];
  (require('../envCollectionRef') as typeof import('../envCollectionRef')).setEnvCollection({ replace: () => undefined, delete: () => undefined } as never);
  mod.registerTreeMutationCommands({
    announceArrival: () => Promise.resolve(),
    log: { write: (): void => undefined },
    doorsFor: () => ({}),
    mutated: () => undefined,
    policyOf: () => undefined,
    register: (command: string, handler: Handler) => handlers.set(command, handler),
    storage,
    transports: {},
    vaultKeys: { noteUserActivity: () => undefined },
  } as never);
  written.length = 0;
  return {
    storage,
    s,
    written,
    inputs: queue,
    add: async () => {
      const handler = handlers.get('credSshManager.addEntity');
      assert.ok(handler !== undefined, 'addEntity is not registered — nothing would run');
      await handler({ kind: 'node', accountId: ACCOUNT, node: storage.getNode(ACCOUNT, 'f1') });
    },
    entries: () => storage.getNodes(ACCOUNT).filter((node) => node.type === 'entity' && node.id !== 's1'),
  };
}

function onlyMade(w: World): TreeNode {
  const nodes = w.entries();
  assert.equal(nodes.length, 1, `one entry was created, found ${nodes.length}`);
  return nodes[0];
}

/** A slot that must be SEALED — opened with `pin`, or the assertion names what is stored. */
async function opened(value: string | undefined, pin: string): Promise<string> {
  const read = readSecret(value);
  assert.equal(read.kind, 'locked', `stored in the clear: ${String(value)}`);
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, pin) : '';
}

function everySealed(w: World): void {
  for (const value of w.written) {
    assert.ok(!value.includes(SECRET) && !value.includes(NOTE) && !value.includes(LOGIN), `the keychain was handed a value in the clear: ${value}`);
    assert.ok(isLockedSecret(value), `a value written unsealed: ${value}`);
  }
}

test('a person’s Add into a folder that asks for a PIN never writes a value in the clear — the keychain write log sees only sealed values', async () => {
  const w = await world({ asks: true }, [FIRST_PIN, FIRST_PIN]);

  await w.add();

  assert.equal(w.s.boxes, 2, 'the first PIN of the folder, typed twice');
  assert.ok(w.written.length > 0, 'precondition: something was written');
  everySealed(w);
  const entry = onlyMade(w);
  assert.equal(entry.details?.pinProtected, true, 'the entry carries the mark');
  assert.equal(entry.pinEpoch, 1, 'and its first protection decision');
  assert.equal(await opened(await w.storage.getPassword(ACCOUNT, entry.id), FIRST_PIN), SECRET, 'the PIN opens what was sealed');
  assert.equal(await opened(await w.storage.getNotes(ACCOUNT, entry.id), FIRST_PIN), NOTE);
  assert.match(await opened(await w.storage.getFieldsRaw(ACCOUNT, entry.id), FIRST_PIN), new RegExp(LOGIN));
});

test('an Add into a PIN folder killed after its first slot write leaves that slot SEALED and the node absent, and running it again converges', async () => {
  // `SecretStorage` has no transaction; the promise is that every value was sealed BEFORE its own
  // write, so what a kill leaves behind is sealed-or-unwritten, never plaintext — and that the next
  // Add finishes the job.
  const w = await world({ asks: true }, [FIRST_PIN, FIRST_PIN]);
  const realNotes = w.storage.setNotes.bind(w.storage);
  let killed = false;
  w.storage.setNotes = async (a, e, v) => {
    if (!killed) {
      killed = true;
      throw new Error('the window was closed');
    }
    return realNotes(a, e, v);
  };

  await assert.rejects(w.add(), /the window was closed/);

  assert.ok(killed, 'the kill landed after the password and before the note');
  assert.equal(w.written.length, 1, `one slot was written before the kill, found ${w.written.length}`);
  assert.ok(isLockedSecret(w.written[0]), `the slot written before the kill is in the clear: ${w.written[0]}`);
  assert.deepEqual(w.entries(), [], 'the node landed although the secrets did not');

  w.inputs.push(FIRST_PIN, FIRST_PIN);
  await w.add();

  const entry = onlyMade(w);
  assert.equal(entry.details?.pinProtected, true);
  assert.equal(entry.pinEpoch, 1);
  assert.equal(await opened(await w.storage.getPassword(ACCOUNT, entry.id), FIRST_PIN), SECRET);
  assert.equal(await opened(await w.storage.getNotes(ACCOUNT, entry.id), FIRST_PIN), NOTE);
  everySealed(w);
});

test('in a folder of protected entries the PIN is checked against them, agreed to, and seals the new entry', async () => {
  const w = await world({ sibling: true }, [PIN]);
  w.s.modalAnswers.push('Use this PIN');

  await w.add();

  assert.equal(w.s.boxes, 1, 'typed once: the protected sibling is the check');
  assert.match(w.s.modals.join('\n'), /This PIN opens 1 of the 1 protected entries in this folder/);
  everySealed(w);
  assert.equal(await opened(await w.storage.getPassword(ACCOUNT, onlyMade(w).id), PIN), SECRET, 'sealed under the PIN the folder already uses');
});

test('a folder that asks nothing asks nothing — the entry is written as before, under the vault alone', async () => {
  const w = await world({}, []);

  await w.add();

  assert.equal(w.s.boxes, 0);
  const entry = onlyMade(w);
  assert.equal(await w.storage.getPassword(ACCOUNT, entry.id), SECRET, 'the vault seals it; no entry PIN was asked for');
  assert.equal(entry.details?.pinProtected, undefined);
  assert.equal(entry.pinEpoch, undefined);
});
