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
  /**
   * Make the next `withProgress` REJECT, with this message.
   *
   * <p>The recipient-side wrap runs inside it, so this is how a test says "the sealing failed" —
   * the one failure that cannot be provoked from outside, because `lockSecret` only fails on a
   * broken machine. What is under test is what the accept command does about it.</p>
   */
  progressFails: undefined as string | undefined,
  /** What the clipboard holds — the share PIN's whole delivery route to the recipient. */
  clipboard: '',
  /** How many times anything was WRITTEN to it — one copy or two is the whole question. */
  clipboardWrites: 0,
  /** Which action a test presses on an information message ('Copy again', 'Show PIN'). */
  infoAnswer: undefined as string | undefined,
  /** The actions each information message offered, in order. */
  infoActions: [] as string[][],
  /** Message texts shown MODALLY — where the PIN is allowed to appear, and only there. */
  modals: [] as string[],
};

/**
 * The ui.inputs entry that means "press the generate button instead of typing".
 *
 * <p>A sentinel rather than a separate flag because the PIN box is one step in a queued
 * conversation — the checkbox, the recipients, the PIN — and a flag beside a queue cannot say
 * WHICH of two boxes it meant.</p>
 */
const GENERATE = '#generate';

interface FakeBox {
  value: string;
  password: boolean;
  buttons: { tooltip?: string }[];
  validationMessage: unknown;
  [key: string]: unknown;
}

/**
 * The InputBox VS Code would have handed the prompt, driven from `ui.inputs`.
 *
 * <p>`value` is a real setter, because VS Code raises `onDidChangeValue` when the extension
 * ASSIGNS the value and not only when a person types — and the generated-PIN path assigns.</p>
 */
function makeInputBox(): FakeBox {
  const accepts: (() => void)[] = [];
  const hides: (() => void)[] = [];
  const changes: ((value: string) => void)[] = [];
  const presses: ((button: { tooltip?: string }) => void)[] = [];
  let current = '';
  const box = {
    password: false,
    title: undefined as string | undefined,
    prompt: undefined as string | undefined,
    ignoreFocusOut: false,
    buttons: [] as { tooltip?: string }[],
    validationMessage: undefined as unknown,
    get value(): string {
      return current;
    },
    set value(next: string) {
      current = next;
      changes.forEach((cb) => cb(next));
    },
    onDidAccept: (cb: () => void) => (accepts.push(cb), { dispose(): void {} }),
    onDidHide: (cb: () => void) => (hides.push(cb), { dispose(): void {} }),
    onDidChangeValue: (cb: (v: string) => void) => (changes.push(cb), { dispose(): void {} }),
    onDidTriggerButton: (cb: (b: { tooltip?: string }) => void) => (presses.push(cb), { dispose(): void {} }),
    hide: (): void => hides.forEach((cb) => cb()),
    dispose: (): void => {},
    show: (): void => {
      void drive();
    },
  } as unknown as FakeBox;

  async function drive(): Promise<void> {
    const next = ui.inputs.shift();
    if (next === undefined) {
      hides.forEach((cb) => cb());
      return;
    }
    if (next === GENERATE) {
      const button = box.buttons.find((b) => (b.tooltip ?? '').includes('Generate'));
      presses.forEach((cb) => cb(button as { tooltip?: string }));
      // The press writes the value synchronously and copies asynchronously; accepting before the
      // copy settles would test a race nobody ships.
      await new Promise((r) => setImmediate(r));
    } else {
      box.value = next;
    }
    accepts.forEach((cb) => cb());
  }

  return box;
}

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
  ui.progressFails = undefined;
  ui.clipboard = '';
  ui.clipboardWrites = 0;
  ui.infoAnswer = undefined;
  ui.infoActions = [];
  ui.modals = [];
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
      pin: import('../sharePin').SharePin,
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
          // The share PIN's box is a createInputBox now, and the harness drives it the way a
          // person would: the next ui.inputs entry is TYPED into it, or, when it is the sentinel
          // GENERATE, the generate button is pressed instead. Existing suites feed the same
          // [PIN, PIN] they always did and are untouched by the change.
          createInputBox: (): unknown => makeInputBox(),
          showInputBox: () => Promise.resolve(ui.inputs.shift()),
          showQuickPick: (_items: unknown, options?: { title?: string }): Promise<unknown> => {
            ui.quickPickTitles.push(options?.title);
            return Promise.resolve(ui.quickPickAnswers.shift());
          },
          showWarningMessage: (
            message: string,
            options?: { modal?: boolean },
          ): Promise<string | undefined> => {
            ui.warningsAsked += 1;
            // A modal is the ONE surface a live PIN may be shown on, so which messages were modal
            // is a fact the tests need rather than a detail.
            if (options?.modal === true) {
              ui.modals.push(message);
            }
            return Promise.resolve(ui.warningAnswer);
          },
          showInformationMessage: (
            message: string,
            ...actions: string[]
          ): Promise<string | undefined> => {
            ui.infosAsked += 1;
            ui.infos.push(message);
            ui.infoActions.push(actions);
            return Promise.resolve(ui.infoAnswer);
          },
          showErrorMessage: (message: string): Promise<undefined> => {
            ui.errors.push(message);
            return Promise.resolve(undefined);
          },
          // Runs the task straight through: what the notification is for is the SECONDS the
          // recipient-side wrap takes, and a test that skipped it would not be exercising the wrap.
          withProgress: (_o: unknown, task: () => Promise<unknown>): Promise<unknown> =>
            ui.progressFails === undefined
              ? task()
              : Promise.reject(new Error(ui.progressFails)),
        },
        ProgressLocation: { Notification: 15 },
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
        env: {
          clipboard: {
            readText: (): Promise<string> => Promise.resolve(ui.clipboard),
            writeText: (value: string): Promise<void> => {
              ui.clipboard = value;
              ui.clipboardWrites += 1;
              return Promise.resolve();
            },
          },
        },
        ThemeIcon: class {
          constructor(public readonly id: string) {}
        },
        InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
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
  GENERATE,
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
