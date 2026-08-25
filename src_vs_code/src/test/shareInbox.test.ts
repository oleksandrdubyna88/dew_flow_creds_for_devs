import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import type { OwnedShare, SharePayload, StoredAccount, TreeNode } from '../types';

/**
 * The sharing conversation, extracted from activate() (audit 2026-08-25, A1).
 *
 * <p>What is asserted is the part that guards other people's data: an accepted share gets a
 * FRESH local id (a sender can never overwrite an entry they did not send), an update from
 * the same sender records what the entry was before replacing it, the round-robin accept
 * tries only the PIN just typed, and a server-stamped sender is never second-guessed with a
 * modal. Real `sealShare`/`openShare` are used — the tests prove the wiring carries the
 * right fields into the real crypto, not into a stub of it.</p>
 */

/** Everything the vscode stub records and lets a test steer. */
const ui = {
  inputs: [] as (string | undefined)[],
  warningAnswer: undefined as string | undefined,
  warningsAsked: 0,
  infosAsked: 0,
  errors: [] as string[],
  infos: [] as string[],
  config: { nasBackupPath: '' } as Record<string, unknown>,
};

function resetUi(): void {
  ui.inputs = [];
  ui.warningAnswer = undefined;
  ui.warningsAsked = 0;
  ui.infosAsked = 0;
  ui.errors = [];
  ui.infos = [];
  ui.config = { nasBackupPath: '' };
}

const loaded = ((): {
  ShareInbox: new (deps: unknown) => {
    acceptOne(share: OwnedShare): Promise<void>;
    acceptMany(items: OwnedShare[]): Promise<void>;
    shareNodes(accountId: string, nodes: TreeNode[]): Promise<void>;
  };
  sealShare: typeof import('../shareFormat').sealShare;
} => {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request === 'vscode') {
      return {
        window: {
          showInputBox: () => Promise.resolve(ui.inputs.shift()),
          showQuickPick: () => Promise.resolve(undefined),
          showWarningMessage: (): Promise<string | undefined> => {
            ui.warningsAsked += 1;
            return Promise.resolve(ui.warningAnswer);
          },
          showInformationMessage: (message: string): Promise<string | undefined> => {
            ui.infosAsked += 1;
            ui.infos.push(message);
            return Promise.resolve(undefined);
          },
          showErrorMessage: (message: string): Promise<undefined> => {
            ui.errors.push(message);
            return Promise.resolve(undefined);
          },
        },
        workspace: {
          getConfiguration: () => ({
            get: <T>(key: string, fallback: T): T => (ui.config[key] as T) ?? fallback,
          }),
        },
        EventEmitter: class {
          event = (): void => {};
          fire(): void {}
        },
        Uri: { file: (p: string): object => ({ fsPath: p }) },
      };
    }
    return original.call(this, request, ...rest);
  };
  try {
    const inbox = require('../shareInbox') as { ShareInbox: never };
    const fmt = require('../shareFormat') as { sealShare: never };
    return { ShareInbox: inbox.ShareInbox, sealShare: fmt.sealShare } as never;
  } finally {
    loader._load = original;
  }
})();

const { StorageManager } = ((): typeof import('../storageManager') => {
  // Loaded under the same stub by the block above (require cache), so a plain require
  // here resolves the already-instantiated module.
  return require('../storageManager') as typeof import('../storageManager');
})();

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

function secrets(): object {
  const map = new Map<string, string>();
  return {
    get: (k: string) => Promise.resolve(map.get(k)),
    store: (k: string, v: string) => {
      map.set(k, v);
      return Promise.resolve();
    },
    delete: (k: string) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => ({ dispose(): void {} }),
  };
}

const RECIPIENT: StoredAccount = { accountId: 'acc-me', email: 'me@corp.com', provider: 'google' };
const SENDER: StoredAccount = { accountId: 'acc-bob', email: 'bob@corp.com', provider: 'google' };
const KEY_ID = 'my-share-key-id';
const PIN = 'a-good-share-pin';

function payloadFor(name: string, senderSideId: string): SharePayload {
  return {
    node: {
      id: senderSideId,
      name,
      type: 'entity',
      parentId: null,
      details: { id: senderSideId, name, isSshEnabled: false },
    },
    secrets: { password: `pw-of-${name}` },
  };
}

function sealedShare(payload: SharePayload, pin: string): OwnedShare {
  return {
    accountId: RECIPIENT.accountId,
    shareKeyId: KEY_ID,
    item: loaded.sealShare(payload, KEY_ID, SENDER, pin, 1_756_000_000_000, undefined, RECIPIENT.email),
  };
}

interface World {
  inbox: InstanceType<typeof loaded.ShareInbox>;
  storage: InstanceType<typeof StorageManager>;
  state: ReturnType<typeof memento>;
  mutations: () => number;
  removed: OwnedShare[];
}

function world(): World {
  resetUi();
  // A server location: the sender is stamped by a verified sign-in, so senderCheck must
  // pass silently. The folder-transport verdicts have their own suite (senderPinning).
  ui.config.nasBackupPath = 'https://vault.corp.com';
  const state = memento();
  const storage = new StorageManager(memento() as never, secrets() as never);
  void storage.upsertAccount(RECIPIENT);
  let mutated = 0;
  const removed: OwnedShare[] = [];
  const sharing = {
    teamFor: () => [],
    appendShares: () => Promise.resolve(),
    reload: () => Promise.resolve(),
    removeOwnShare: (share: OwnedShare) => {
      removed.push(share);
      return Promise.resolve();
    },
    ownShares: [] as OwnedShare[],
  };
  const inbox = new loaded.ShareInbox({
    storage,
    sharing,
    state,
    onMutated: () => {
      mutated += 1;
    },
  });
  return { inbox, storage, state, mutations: () => mutated, removed };
}

test('an accepted share gets a FRESH local id — a sender cannot address our entries', async () => {
  const w = world();
  const share = sealedShare(payloadFor('prod api', 'sender-side-id'), PIN);
  ui.inputs = [PIN];

  await w.inbox.acceptOne(share);

  const nodes = w.storage.getNodes(RECIPIENT.accountId);
  assert.equal(nodes.length, 1);
  assert.notEqual(nodes[0].id, 'sender-side-id', 'the sender-side id must never become ours');
  assert.equal(await w.storage.getPassword(RECIPIENT.accountId, nodes[0].id), 'pw-of-prod api');
  assert.deepEqual(w.removed.map((s) => s.item.entityName), ['prod api'], 'consumed from the inbox');
  assert.equal(w.mutations(), 1, 'the tree changed once');
});

test('a second share of the SAME entity from the same sender offers Update, and records what it was', async () => {
  const w = world();
  ui.inputs = [PIN];
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 'sender-side-id'), PIN));
  const firstLocalId = w.storage.getNodes(RECIPIENT.accountId)[0].id;

  ui.inputs = [PIN];
  ui.warningAnswer = 'Update it';
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api v2', 'sender-side-id'), PIN));

  const nodes = w.storage.getNodes(RECIPIENT.accountId);
  assert.equal(nodes.length, 1, 'updated in place, not duplicated');
  assert.equal(nodes[0].id, firstLocalId, 'same local id — it keeps its place in the tree');
  assert.equal(nodes[0].name, 'prod api v2');
  const history = await w.storage.getHistory(RECIPIENT.accountId, firstLocalId);
  assert.equal(history.length, 1, 'what it was before is one twisty away');
  assert.equal(history[0].name, 'prod api');
  assert.equal(history[0].secrets.password, 'pw-of-prod api');
});

test('dismissing the Update/Keep-both question leaves the share in the inbox', async () => {
  const w = world();
  ui.inputs = [PIN];
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 'sender-side-id'), PIN));

  ui.inputs = [PIN];
  ui.warningAnswer = undefined; // Esc on the modal
  await w.inbox.acceptOne(sealedShare(payloadFor('prod api v2', 'sender-side-id'), PIN));

  assert.equal(w.storage.getNodes(RECIPIENT.accountId).length, 1, 'nothing imported');
  assert.equal(w.removed.length, 1, 'only the FIRST accept consumed its share');
});

test('a server-stamped sender is never second-guessed: no modal before the PIN prompt', async () => {
  const w = world();
  ui.inputs = [PIN];

  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 's1'), PIN));

  assert.equal(ui.warningsAsked, 0, 'no trust modal on a server location');
});

test('the wrong PIN reports, imports nothing, and the share survives', async () => {
  const w = world();
  ui.inputs = ['not-the-pin'];

  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 's1'), PIN));

  assert.equal(w.storage.getNodes(RECIPIENT.accountId).length, 0);
  assert.equal(w.removed.length, 0);
  assert.ok(ui.errors.some((e) => e.includes('does not decrypt')), ui.errors.join('; '));
});

test('a save that fails after a CORRECT PIN says so, instead of blaming the PIN', async () => {
  // The reader retyping a PIN that was right, against a tree the failed import already
  // half-changed, is the outcome a single catch around both steps produced.
  const w = world();
  ui.inputs = [PIN];
  const boom = new Error('the keychain refused the write');
  w.storage.addNode = () => Promise.reject(boom);

  await w.inbox.acceptOne(sealedShare(payloadFor('prod api', 's1'), PIN));

  assert.equal(ui.errors.length, 1, ui.errors.join(' | '));
  assert.ok(ui.errors[0].includes('the keychain refused the write'), ui.errors[0]);
  assert.equal(
    ui.errors[0].includes('does not decrypt'),
    false,
    'the PIN was right — saying otherwise sends the reader to retype it',
  );
  assert.equal(w.mutations(), 0, 'nothing is reported as accepted');
  assert.equal(w.removed.length, 0, 'the share stays in the inbox');
});

test('acceptMany asks per resisting item and stops on Esc, importing what opened', async () => {
  const w = world();
  const a = sealedShare(payloadFor('alpha', 'sa'), 'pin-one-111');
  const b = sealedShare(payloadFor('beta', 'sb'), 'pin-two-222');
  const c = sealedShare(payloadFor('gamma', 'sc'), 'pin-three-333');
  ui.inputs = ['pin-one-111', 'pin-two-222', undefined]; // Esc before gamma's PIN

  await w.inbox.acceptMany([a, b, c]);

  const names = w.storage.getNodes(RECIPIENT.accountId).map((n) => n.name).sort();
  assert.deepEqual(names, ['alpha', 'beta'], 'what opened was imported');
  assert.ok(ui.infos.some((m) => m.includes('Accepted 2 item(s), 1 still pending')), ui.infos.join(' | '));
  assert.equal(w.mutations(), 1, 'one refresh for the whole batch');
});

test('sharing an empty folder says so instead of asking for recipients', async () => {
  const w = world();
  const folder: TreeNode = { id: 'f1', name: 'Empty', type: 'folder', parentId: null };

  await w.inbox.shareNodes(RECIPIENT.accountId, [folder]);

  assert.ok(ui.infos.some((m) => m.includes('holds no entities')), ui.infos.join(' | '));
});
