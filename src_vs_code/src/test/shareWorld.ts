/**
 * The sharing harness, as a helper module rather than a block at the top of one test file.
 *
 * <p>Extracted for the reason `brokerWorld.ts` was: there are two suites now.
 * `shareInbox.test.ts` drives the accept conversation — fresh ids, the update path, the PIN
 * round-robin, sender pinning — and `sharePayment.test.ts` drives what a payment record does and
 * does not carry across that same boundary. They must exercise the SAME `ShareInbox`, because the
 * whole claim of the redaction work is that it holds on the real paths, and a copied harness would
 * have been the first thing to drift.</p>
 *
 * <p>The immediate trigger was the 800-line ceiling: the payment cases took the combined file past
 * it. The ceiling asked for a split, and this is the split the file already wanted.</p>
 */
import Module from 'node:module';
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
    deliverBatch(
      senderAccountId: string,
      payloads: SharePayload[],
      recipients: unknown[],
      pin: string,
    ): Promise<void>;
  };
  sealShare: typeof import('../shareFormat').sealShare;
  openShare: typeof import('../shareFormat').openShare;
  buildSharePayload: typeof import('../sharePayloadBuild').buildSharePayload;
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
    const inbox = require('../shareInbox') as { ShareInbox: never };
    // Moved out of `shareInbox` when the entry PIN pushed that file over its ceiling: the payload
    // builder is about a VALUE, the inbox about the conversation around sending it.
    const build = require('../sharePayloadBuild') as { buildSharePayload: never };
    const fmt = require('../shareFormat') as { sealShare: never; openShare: never };
    return {
      ShareInbox: inbox.ShareInbox,
      sealShare: fmt.sealShare,
      openShare: fmt.openShare,
      buildSharePayload: build.buildSharePayload,
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

function memento(seed: Record<string, unknown> = {}): {
  get<T>(key: string, fallback?: T): T | undefined;
  update(key: string, value: unknown): Promise<void>;
  keys(): string[];
} {
  const map = new Map<string, unknown>(Object.entries(seed));
  return {
    get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown): Promise<void> => {
      map.set(key, value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
      return Promise.resolve();
    },
    keys: () => [...map.keys()],
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
  // Seeded rather than upserted: `upsertAccount` is queued (`serialQueue`), so calling it without
  // awaiting would leave `world()` handing back a storage whose account is not listed yet — and this
  // builder is synchronous by design, used by thirty tests.
  const store = memento({ 'credSshManager.accounts': [RECIPIENT] });
  const storage = new StorageManager(store as never, secrets() as never);
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

export {
  ui,
  resetUi,
  loaded,
  StorageManager,
  memento,
  secrets,
  RECIPIENT,
  SENDER,
  KEY_ID,
  PIN,
  payloadFor,
  sealedShare,
  TEAM_MEMBER,
  team,
  world,
};
export type { World };
