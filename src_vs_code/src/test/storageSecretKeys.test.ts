import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { TreeNode } from '../types';

/**
 * One entity's secrets can never land in another entity's slot.
 *
 * <p>SecretStorage keys are built by concatenation — `${accountId}_${entityId}` for a password,
 * and the same with a `:sshPrivateKey` / `:vpnConfig` / `:notes` / … suffix for everything else.
 * Concatenation without an escape is ambiguous, and here the ambiguity is reachable: an entity
 * whose id is `x:sshPrivateKey` produces the key that holds entity `x`'s PRIVATE KEY.</p>
 *
 * <p><b>Entity ids are normally uuids, so no ordinary vault can do this</b> — and accepting a
 * share cannot either, because `shareInbox` gives every accepted entry a fresh local id. But
 * IMPORT and RESTORE write an envelope's nodes with their own ids, so a backup file someone is
 * talked into importing puts an arbitrary id into the tree. Saving that entity's password then
 * overwrites another entity's private key, and reading that key back returns the attacker's
 * password. The vault reports no error at any point.</p>
 *
 * <p>Same trust boundary as the path traversal fixed in `909eaf9` and `3e198a1`, a different
 * mechanism: sanitising a file name does nothing for a keychain key.</p>
 */

type Storage = typeof import('../storageManager');

interface Slots {
  ctor: Storage['StorageManager'];
  /** Every SecretStorage key written, so a collision is visible as a shared key. */
  keys(): string[];
}

function world(): Slots {
  const map = new Map<string, string>();
  const mod = loadWithVscode<Storage>('../storageManager', {
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {
        /* nothing listens in these tests */
      }
    },
    Uri: { file: (p: string): object => ({ fsPath: p }) },
    workspace: { getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) },
  });
  const slots: Slots = { ctor: mod.StorageManager, keys: (): string[] => [...map.keys()] };
  Object.assign(slots, { map });
  return slots;
}

function instance(slots: Slots): {
  storage: InstanceType<Storage['StorageManager']>;
  secrets: Map<string, string>;
} {
  const secrets = new Map<string, string>();
  const memento = new Map<string, unknown>();
  const store = {
    get: (k: string): Promise<string | undefined> => Promise.resolve(secrets.get(k)),
    store: (k: string, v: string): Promise<void> => {
      secrets.set(k, v);
      return Promise.resolve();
    },
    delete: (k: string): Promise<void> => {
      secrets.delete(k);
      return Promise.resolve();
    },
    // The manager subscribes to keychain changes on construction; nothing here fires them.
    onDidChange: (): { dispose(): void } => ({ dispose: (): void => undefined }),
  };
  const state = {
    get: <T>(key: string, fallback?: T): T | undefined =>
      memento.has(key) ? (memento.get(key) as T) : fallback,
    update: (key: string, value: unknown): Promise<void> => {
      memento.set(key, value === null || typeof value !== 'object' ? value : JSON.parse(JSON.stringify(value)));
      return Promise.resolve();
    },
  };
  return {
    storage: new slots.ctor(state as never, store as never) as InstanceType<Storage['StorageManager']>,
    secrets,
  };
}

const entity = (id: string): TreeNode =>
  ({
    id,
    name: id,
    type: 'entity',
    parentId: null,
    details: { id, name: id, kind: 'credential', isSshEnabled: false },
  }) as unknown as TreeNode;

const ACCOUNT = 'a1';

test("a crafted id cannot reach another entity's private-key slot", async () => {
  // The concrete collision: `secretKey(a1, 'x:sshPrivateKey')` and
  // `privateKeySecretKey(a1, 'x')` are the same string under plain concatenation.
  const w = instance(world());
  await w.storage.addNode(ACCOUNT, entity('x'));
  await w.storage.addNode(ACCOUNT, entity('x:sshPrivateKey'));

  await w.storage.setPrivateKey(ACCOUNT, 'x', 'THE REAL PRIVATE KEY');
  await w.storage.setPassword(ACCOUNT, 'x:sshPrivateKey', 'attacker-password');

  assert.equal(
    await w.storage.getPrivateKey(ACCOUNT, 'x'),
    'THE REAL PRIVATE KEY',
    'the crafted entity overwrote a private key it does not own',
  );
});

test('and it cannot reach the other suffixed slots either', async () => {
  // Every kind uses the same shape, so every kind is reachable the same way.
  for (const suffix of ['vpnConfig', 'notes', 'dbConn', 'attachment', 'image']) {
    const w = instance(world());
    await w.storage.addNode(ACCOUNT, entity('x'));
    await w.storage.addNode(ACCOUNT, entity(`x:${suffix}`));

    await w.storage.setNotes(ACCOUNT, 'x', 'THE REAL NOTE');
    await w.storage.setPassword(ACCOUNT, `x:${suffix}`, 'attacker-password');

    assert.equal(await w.storage.getNotes(ACCOUNT, 'x'), 'THE REAL NOTE', suffix);
  }
});

test('two ordinary entities keep separate slots — the fix must not merge them', async () => {
  // The failure a heavy-handed escape would introduce: two entities sharing one slot is a
  // credential served for the wrong entry, which is worse than the collision it replaced.
  const w = instance(world());
  await w.storage.addNode(ACCOUNT, entity('a1b2c3d4-e5f6-7890-abcd-ef1234567890'));
  await w.storage.addNode(ACCOUNT, entity('11111111-2222-3333-4444-555555555555'));

  await w.storage.setPassword(ACCOUNT, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'first');
  await w.storage.setPassword(ACCOUNT, '11111111-2222-3333-4444-555555555555', 'second');

  assert.equal(await w.storage.getPassword(ACCOUNT, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'), 'first');
  assert.equal(await w.storage.getPassword(ACCOUNT, '11111111-2222-3333-4444-555555555555'), 'second');
});

test('an ordinary uuid still reads back what it stored, across every kind', async () => {
  // The compatibility half: whatever the fix does to the key, a normal vault must keep working
  // — these keys are what an already-installed build wrote.
  const w = instance(world());
  const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  await w.storage.addNode(ACCOUNT, entity(id));

  await w.storage.setPassword(ACCOUNT, id, 'pw');
  await w.storage.setPrivateKey(ACCOUNT, id, 'key');
  await w.storage.setNotes(ACCOUNT, id, 'note');

  assert.equal(await w.storage.getPassword(ACCOUNT, id), 'pw');
  assert.equal(await w.storage.getPrivateKey(ACCOUNT, id), 'key');
  assert.equal(await w.storage.getNotes(ACCOUNT, id), 'note');
});

test('an already-stored secret keeps the key an existing install wrote', async () => {
  // Stated as a test because it is the whole migration question: a fix that changes the key
  // for a normal id makes every installed vault look empty.
  const w = instance(world());
  const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  await w.storage.addNode(ACCOUNT, entity(id));
  await w.storage.setPassword(ACCOUNT, id, 'pw');

  assert.ok(w.secrets.has(`${ACCOUNT}_${id}`), [...w.secrets.keys()].join(' | '));
});

/**
 * The boundary itself: `importBundle` is where an outside id enters.
 *
 * <p>Reached by RESTORE (a file whose PIN someone may have been handed along with it) and by
 * SYNC (an envelope written by whatever can write the sync location). `idQuarantine.ts` decides
 * WHICH ids are renamed and is tested there; what is only true here is that the decision is
 * actually applied at the door, and that an ordinary vault passes through unchanged.</p>
 */

function bundleOf(nodes: TreeNode[], passwords: Record<string, string> = {}): never {
  return { nodes, passwords } as never;
}

test('an imported entity with a dangerous id is RENAMED before it enters the vault', async () => {
  const w = instance(world());

  await w.storage.importBundle(ACCOUNT, bundleOf([entity('x:sshPrivateKey')], { 'x:sshPrivateKey': 'pw' }));

  const ids = w.storage.getNodes(ACCOUNT).map((n) => n.id);
  assert.equal(ids.length, 1);
  assert.notEqual(ids[0], 'x:sshPrivateKey', 'the crafted id reached the vault');
  assert.equal(await w.storage.getPassword(ACCOUNT, ids[0]), 'pw', 'and its password came with it');
});

test('an ordinary vault imports with its ids UNCHANGED', async () => {
  // Sync runs this on every cycle. Renaming here would rename the whole tree each time, push
  // the renames, and replace every other machine's vault with strangers.
  const w = instance(world());
  const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  await w.storage.importBundle(ACCOUNT, bundleOf([entity(id)], { [id]: 'pw' }));

  assert.deepEqual(w.storage.getNodes(ACCOUNT).map((n) => n.id), [id]);
});

test('importing the same crafted bundle twice does not leave two copies', async () => {
  // The reason the rename is remembered rather than minted fresh each time.
  const w = instance(world());
  const crafted = bundleOf([entity('x:notes')]);

  await w.storage.importBundle(ACCOUNT, crafted);
  const firstId = w.storage.getNodes(ACCOUNT)[0].id;
  await w.storage.importBundle(ACCOUNT, bundleOf([entity('x:notes')]));

  assert.deepEqual(w.storage.getNodes(ACCOUNT).map((n) => n.id), [firstId]);
});
