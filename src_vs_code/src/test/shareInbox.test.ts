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
  /** Titles of every quick pick raised, in order — what the user was actually asked. */
  quickPickTitles: [] as (string | undefined)[],
  /** One answer per quick pick, in order; an exhausted queue answers "cancelled". */
  quickPickAnswers: [] as unknown[],
};

function resetUi(): void {
  ui.inputs = [];
  ui.warningAnswer = undefined;
  ui.warningsAsked = 0;
  ui.infosAsked = 0;
  ui.errors = [];
  ui.infos = [];
  ui.config = { nasBackupPath: '' };
  ui.quickPickTitles = [];
  ui.quickPickAnswers = [];
}

const loaded = ((): {
  ShareInbox: new (deps: unknown) => {
    acceptOne(share: OwnedShare): Promise<void>;
    acceptMany(items: OwnedShare[]): Promise<void>;
    shareNodes(accountId: string, nodes: TreeNode[]): Promise<void>;
  };
  sealShare: typeof import('../shareFormat').sealShare;
  openShare: typeof import('../shareFormat').openShare;
  buildSharePayload: typeof import('../shareInbox').buildSharePayload;
} => {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    if (request === 'vscode') {
      return {
        window: {
          showInputBox: () => Promise.resolve(ui.inputs.shift()),
          showQuickPick: (_items: unknown, options?: { title?: string }): Promise<unknown> => {
            ui.quickPickTitles.push(options?.title);
            return Promise.resolve(ui.quickPickAnswers.shift());
          },
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
    const inbox = require('../shareInbox') as { ShareInbox: never; buildSharePayload: never };
    const fmt = require('../shareFormat') as { sealShare: never; openShare: never };
    return {
      ShareInbox: inbox.ShareInbox,
      sealShare: fmt.sealShare,
      openShare: fmt.openShare,
      buildSharePayload: inbox.buildSharePayload,
    } as never;
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
    item: loaded.sealShare(payload, KEY_ID, SENDER, pin, 1_756_000_000_000, { toEmail: RECIPIENT.email }),
  };
}

interface World {
  inbox: InstanceType<typeof loaded.ShareInbox>;
  storage: InstanceType<typeof StorageManager>;
  state: ReturnType<typeof memento>;
  mutations: () => number;
  removed: OwnedShare[];
  /** Every ShareItem handed to the transport, in order. */
  delivered: unknown[];
}

/** One colleague to share with, so the conversation can reach its end. */
const TEAM_MEMBER = {
  account: SENDER,
  location: 'https://vault.corp.com',
  shareKeyId: KEY_ID,
  isSelf: false,
};
const team = [TEAM_MEMBER];

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
  const delivered: unknown[] = [];
  const sharing = {
    teamFor: () => team,
    appendShares: (_sender: unknown, _recipient: unknown, items: unknown[]) => {
      delivered.push(...items);
      return Promise.resolve();
    },
    reload: () => Promise.resolve(),
    removeOwnShare: (share: OwnedShare) => {
      removed.push(share);
      return Promise.resolve();
    },
    ownShares: [] as OwnedShare[],
    // This world has no vault server: a folder account seals the bound form and its shares
    // are never treated as server-stamped. The server side of both is proven in
    // shareFormat.test.ts, which can reach it without a transport.
    shareFormFor: () => 'bound' as const,
    serverStamped: () => false,
  };
  const inbox = new loaded.ShareInbox({
    storage,
    sharing,
    state,
    onMutated: () => {
      mutated += 1;
    },
  });
  return { inbox, storage, state, mutations: () => mutated, removed, delivered };
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

test('an accepted config arrives with its contents, which is the whole point of sharing one', async () => {
  // The gap the owner found by trying it: a config could be shared and its JSON did not survive.
  // This is the far end — the sending half is `buildSharePayload`, and the two are useless apart.
  const w = world();
  const body = '{\n  "ConnectionStrings": { "Default": "Server=prod" }\n}';
  const share = sealedShare(
    {
      node: {
        id: 'sender-side-config',
        name: 'appsettings.Development.json',
        type: 'entity',
        parentId: null,
        details: {
          id: 'sender-side-config',
          name: 'appsettings.Development.json',
          isSshEnabled: false,
          kind: 'config',
          isConfig: true,
          configFormat: 'json',
          configFileName: 'appsettings.Development.json',
        },
      },
      secrets: { config: body },
    },
    PIN,
  );
  ui.inputs = [PIN];

  await w.inbox.acceptOne(share);

  const nodes = w.storage.getNodes(RECIPIENT.accountId);
  assert.equal(await w.storage.getConfigBody(RECIPIENT.accountId, nodes[0].id), body);
  // The format travels with it: without one the document cannot be validated, laid out as fields,
  // or written with the right extension.
  assert.equal(nodes[0].details?.configFormat, 'json');
});

test('an accepted config carries no key hash, so the recipient mints their own', async () => {
  // `shareableDetails` strips it on the way out; this is the assertion from the receiving side,
  // because that is where the damage would be — an entry claiming a key its owner was never given,
  // cannot use, and cannot revoke.
  const w = world();
  const share = sealedShare(
    {
      node: {
        id: 'sender-side-config',
        name: 'conf',
        type: 'entity',
        parentId: null,
        details: { id: 'sender-side-config', name: 'conf', isSshEnabled: false, isConfig: true },
      },
      secrets: { config: '{}' },
    },
    PIN,
  );
  ui.inputs = [PIN];

  await w.inbox.acceptOne(share);

  const nodes = w.storage.getNodes(RECIPIENT.accountId);
  assert.equal(nodes[0].details?.configKeyHash, undefined);
});

const SEED = 'otpauth://totp/GitHub:me@corp.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30';

/** An entry with a stored one-time-code seed, in the sender's vault. */
async function entryWithTotp(storage: InstanceType<typeof StorageManager>): Promise<TreeNode> {
  const node: TreeNode = {
    id: 'sender-side-totp',
    name: 'GitHub',
    type: 'entity',
    parentId: null,
    details: { id: 'sender-side-totp', name: 'GitHub', isSshEnabled: false, hasTotp: true },
  };
  await storage.addNode(RECIPIENT.accountId, node);
  await storage.setPassword(RECIPIENT.accountId, node.id, 'pw');
  await storage.setTotp(RECIPIENT.accountId, node.id, SEED);
  return node;
}

test('sharing an entry that has a one-time code carries the seed', async () => {
  const w = world();
  const node = await entryWithTotp(w.storage);

  const payload = await loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, true);

  assert.equal(payload.secrets.totp, SEED);
});

test('an entry shared WITHOUT its one-time code does not claim to have one', async () => {
  // The half-delivery this pairs with: the seed stays behind but `hasTotp` travels, so the
  // recipient's tree offers "Copy One-Time Code" on an entry with no seed to compute from.
  const w = world();
  const node = await entryWithTotp(w.storage);

  const payload = await loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, false);

  assert.equal(payload.secrets.totp, undefined);
  assert.equal(payload.node.details?.hasTotp, undefined);
});

test('a seed that travels arrives usable at the other end', async () => {
  // The two halves are useless apart: the accept side has always written `secrets.totp`, and
  // the sending side never filled it in.
  const w = world();
  const node = await entryWithTotp(w.storage);
  const payload = await loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, true);
  ui.inputs = [PIN];

  await w.inbox.acceptOne(sealedShare(payload, PIN));

  const arrived = w.storage.getNodes(RECIPIENT.accountId).find((n) => n.id !== node.id);
  assert.ok(arrived !== undefined, 'the share should have created a second entry');
  assert.equal(await w.storage.getTotp(RECIPIENT.accountId, arrived.id), SEED);
  assert.equal(arrived.details?.hasTotp, true);
});

test('a share sent without the seed arrives without the claim, and without a code', async () => {
  const w = world();
  const node = await entryWithTotp(w.storage);
  const payload = await loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, false);
  ui.inputs = [PIN];

  await w.inbox.acceptOne(sealedShare(payload, PIN));

  const arrived = w.storage.getNodes(RECIPIENT.accountId).find((n) => n.id !== node.id);
  assert.ok(arrived !== undefined);
  assert.equal(await w.storage.getTotp(RECIPIENT.accountId, arrived.id), undefined);
  assert.equal(arrived.details?.hasTotp, undefined, 'no tree token for a code it cannot produce');
});

test('the one-time-code question is asked before anything is read, and cancelling it cancels the share', async () => {
  const w = world();
  const node = await entryWithTotp(w.storage);
  ui.quickPickAnswers = []; // the list is dismissed

  await w.inbox.shareNodes(RECIPIENT.accountId, [node]);

  assert.deepEqual(ui.quickPickTitles, ['What travels with this share?']);
  assert.equal(ui.inputs.length, 0, 'no share PIN was asked for');
});

test('an entry with no seed is never asked about', async () => {
  // The question only exists because there is something to decide. Asking it for every share
  // would train people to click through it, which is how a checkbox stops meaning anything.
  const w = world();
  const node: TreeNode = {
    id: 'plain',
    name: 'no second factor here',
    type: 'entity',
    parentId: null,
    details: { id: 'plain', name: 'no second factor here', isSshEnabled: false },
  };
  await w.storage.addNode(RECIPIENT.accountId, node);

  await w.inbox.shareNodes(RECIPIENT.accountId, [node]);

  // One quick pick only — the recipients, which this world has none of.
  assert.equal(ui.quickPickTitles.includes('What travels with this share?'), false);
});

/** What a full share conversation actually put on the wire, decrypted. */
async function shareAndOpen(w: World, node: TreeNode, tick: boolean): Promise<SharePayload[]> {
  // The three answers the conversation asks for, in order: the checkbox, the recipients, the PIN.
  ui.quickPickAnswers = [
    tick ? [{ label: 'Include the one-time code (TOTP) seed' }] : [],
    [{ label: SENDER.email, member: TEAM_MEMBER }],
  ];
  ui.inputs = [PIN, PIN];

  await w.inbox.shareNodes(RECIPIENT.accountId, [node]);

  assert.equal(w.delivered.length, 1, 'exactly one item should have been delivered');
  return w.delivered.map((item) => loaded.openShare(item as never, KEY_ID, PIN));
}

test('ticking the box puts the seed on the wire — the whole conversation, end to end', async () => {
  // The payload-level tests prove buildSharePayload obeys its parameter. This one proves the
  // ANSWER reaches it: an inverted condition between the checkbox and the builder would pass
  // every other test in this file.
  const w = world();
  const node = await entryWithTotp(w.storage);

  const [payload] = await shareAndOpen(w, node, true);

  assert.equal(payload.secrets.totp, SEED);
  assert.equal(payload.node.details?.hasTotp, true);
  assert.equal(payload.secrets.password, 'pw', 'everything else still travels');
});

test('leaving it unticked delivers the entry without the seed and without the claim', async () => {
  const w = world();
  const node = await entryWithTotp(w.storage);

  const [payload] = await shareAndOpen(w, node, false);

  assert.equal(payload.secrets.totp, undefined);
  assert.equal(payload.node.details?.hasTotp, undefined);
  assert.equal(payload.secrets.password, 'pw', 'the rest of the entry is unaffected');
});

test('an entry whose flag never got set is still asked about', async () => {
  // `hasTotp` is a plaintext convenience the tree reads per row; the seed in the keychain is the
  // truth. They can disagree — an older write, a metadata edit, an import — and when they do, a
  // question gated on the flag alone never gets asked, so the seed can never be opted IN. That is
  // the same silent "no" this whole fix exists to remove, arriving through another door.
  const w = world();
  const node: TreeNode = {
    id: 'flagless',
    name: 'VPN with a seed and no flag',
    type: 'entity',
    parentId: null,
    details: { id: 'flagless', name: 'VPN with a seed and no flag', isSshEnabled: false },
  };
  await w.storage.addNode(RECIPIENT.accountId, node);
  await w.storage.setTotp(RECIPIENT.accountId, node.id, SEED);

  await w.inbox.shareNodes(RECIPIENT.accountId, [node]);

  assert.equal(ui.quickPickTitles[0], 'What travels with this share?');
});

test('a flag with no seed behind it never becomes a claim on the other side', async () => {
  // The mirror case: metadata says there is a one-time code and the keychain has none. Sending
  // the flag would put a *Copy One-Time Code* row in somebody else's tree over nothing at all.
  const w = world();
  const node: TreeNode = {
    id: 'claims-one',
    name: 'says it has a code',
    type: 'entity',
    parentId: null,
    details: { id: 'claims-one', name: 'says it has a code', isSshEnabled: false, hasTotp: true },
  };
  await w.storage.addNode(RECIPIENT.accountId, node);

  const payload = await loaded.buildSharePayload(w.storage, RECIPIENT.accountId, node, true);

  assert.equal(payload.secrets.totp, undefined);
  assert.equal(payload.node.details?.hasTotp, undefined, 'the flag travels only with a seed');
});
