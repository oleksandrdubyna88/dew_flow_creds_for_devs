import { SECRET_SLOTS } from '../entitySlots';
import { lockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import { stored } from '../storedSecret';
import { EntityMetadata } from '../types';
import { StubCancellationToken, StubCancellationTokenSource, loadWithVscode } from './vscodeStub';

/**
 * A protected entry over the REAL `StorageManager`, and a `vscode` whose every sink is a spy — for the
 * entry-PIN plan's click and reader tests (P4/P5).
 *
 * <p>The vault is the product's own `StorageManager` over an in-memory keychain, the typed setters are
 * the real ones, and every locked value is a real `lockSecret` wrap — the rule `editProtected.test.ts`
 * set after the old fake made `setPayment` a no-op and hid D2. The sinks are what a click hands a value
 * to: the clipboard, a saved file, a warning. A test asserts on WHAT reached them, which is where
 * `{"v":1,"lock":…}` used to arrive.</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

export const ACCOUNT = 'a1';
export const PIN = '1234';

/**
 * The stored-secret type at a test's edge (typed-secrets plan T5): a fake mints what it holds as the
 * keychain does (`stored`), and a test that inspects a stored value byte for byte reads it back
 * (`carried`). Identity at run time — no assertion sees a different value.
 */
export { carried, stored } from '../storedSecret';

/** Locked values, one wrap per plaintext and PIN, made once per process — scrypt costs about a second. */
const wraps = new Map<string, Promise<string>>();
export function locked(plain: string, pin: string = PIN): Promise<string> {
  const key = `${pin}\u0000${plain}`;
  let wrap = wraps.get(key);
  if (wrap === undefined) {
    wrap = lockSecret(plain, ACCOUNT, pin);
    wraps.set(key, wrap);
  }
  return wrap;
}

/** Everything a click can hand a value to, and everything the window said. */
export interface Sinks {
  clipboard: string[];
  /** Files written through `workspace.fs.writeFile`, by path. */
  files: Record<string, string>;
  infos: string[];
  warnings: string[];
  errors: string[];
  /**
   * Every MODAL's message, whichever sink it went through. VS Code cannot close a modal from code, so a
   * step with a deadline must raise none — this is where a test sees whether it did.
   */
  modals: string[];
  /** Each modal's buttons, in the order the modals were raised — what the person could have pressed. */
  modalButtons: string[][];
  /** Each modal's `detail`, `''` where it had none. */
  modalDetails: string[];
  /** PIN boxes raised — every door asks once at most. */
  boxes: number;
  /** The box titles, which name the entry whose PIN was asked for. */
  boxTitles: string[];
  /** The prompts the boxes carried — the sentence a version's own box says is asserted here. */
  boxPrompts: string[];
  /** The cancellation token each box was raised with, `undefined` where none was passed. */
  boxTokens: (StubCancellationToken | undefined)[];
  /** Every `CancellationTokenSource` the code under test made, so a test can see it cancelled and disposed. */
  tokenSources: StubCancellationTokenSource[];
  /** Status-bar messages, with the work each one stands for — a test awaits `work` to see the end. */
  statusBar: { readonly text: string; readonly work: Thenable<unknown> | undefined }[];
  /**
   * What the person presses on each MODAL, in order; a modal with nothing queued is dismissed. A
   * FUNCTION is a modal that stays open while something else happens — another window, a sync — and
   * answers only when that is done: the capture-then-wait races are driven through it.
   */
  modalAnswers: ModalAnswer[];
}

export type ModalAnswer = string | undefined | (() => Promise<string | undefined>);

export function sinks(): Sinks {
  return { clipboard: [], files: {}, infos: [], warnings: [], errors: [], modals: [], modalButtons: [], modalDetails: [], boxes: 0, boxTitles: [], boxPrompts: [], boxTokens: [], tokenSources: [], statusBar: [], modalAnswers: [] };
}

/** Every sink's contents in one string — for "nothing sealed reached anything". */
export function everythingSunk(s: Sinks): string {
  return JSON.stringify([s.clipboard, s.files]);
}

/** The `vscode` the click paths touch: PIN boxes answered from a queue, a save dialog that says `saveTo`. */
export function clickVscode(inputs: (string | undefined)[], s: Sinks, saveTo = '/workspace/chosen-in-the-dialog/saved.file'): Record<string, unknown> {
  const modalAnswer = (message: string, options: { detail?: string }, buttons: string[]): ModalAnswer => {
    s.modals.push(message);
    s.modalDetails.push(options.detail ?? '');
    s.modalButtons.push(buttons);
    return s.modalAnswers.shift();
  };
  const said =(into: string[]) => (message: string, options?: { modal?: boolean; detail?: string }, ...buttons: string[]): Promise<string | undefined> => {
    into.push(message);
    const answer = options?.modal === true ? modalAnswer(message, options, buttons) : undefined;
    return typeof answer === 'function' ? answer() : Promise.resolve(answer);
  };
  return {
    window: {
      showInputBox: (options: { title?: string; prompt?: string }, token?: StubCancellationToken): Promise<string | undefined> => {
        s.boxes += 1;
        s.boxTitles.push(options.title ?? '');
        s.boxPrompts.push(options.prompt ?? '');
        s.boxTokens.push(token);
        return Promise.resolve(inputs.shift());
      },
      setStatusBarMessage: (text: string, work?: Thenable<unknown>): { dispose(): void } => {
        s.statusBar.push({ text, work });
        return { dispose: (): void => undefined };
      },
      showQuickPick: (): Promise<undefined> => Promise.resolve(undefined),
      showInformationMessage: said(s.infos),
      showWarningMessage: said(s.warnings),
      showErrorMessage: said(s.errors),
      showSaveDialog: (): Promise<object> => Promise.resolve({ fsPath: saveTo }),
      createOutputChannel: () => ({ appendLine: (): void => undefined, show: (): void => undefined, dispose: (): void => undefined }),
      withProgress: (_o: unknown, task: (p: unknown, t: unknown) => unknown) => task({ report: () => undefined }, { isCancellationRequested: false }),
    },
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
      onDidChangeConfiguration: () => ({ dispose: (): void => undefined }),
      fs: {
        writeFile: (uri: { fsPath: string }, bytes: Uint8Array): Promise<undefined> => {
          s.files[uri.fsPath] = Buffer.from(bytes).toString('utf8');
          return Promise.resolve(undefined);
        },
      },
    },
    Uri: { file: (p: string): object => ({ fsPath: p }), joinPath: (): object => ({ fsPath: saveTo }) },
    ViewColumn: { Active: 1 },
    ProgressLocation: { Notification: 15 },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
    },
    CancellationTokenSource: class extends StubCancellationTokenSource {
      constructor() {
        super();
        s.tokenSources.push(this);
      }
    },
    ThemeIcon: class {
      constructor(readonly id: string) {}
    },
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
    TreeItem: class {},
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
    commands: { registerCommand: () => ({ dispose: (): void => undefined }), executeCommand: (): Promise<undefined> => Promise.resolve(undefined) },
    extensions: { getExtension: (): undefined => undefined },
    env: {
      clipboard: {
        writeText: (text: string): Promise<undefined> => {
          s.clipboard.push(text);
          return Promise.resolve(undefined);
        },
        readText: (): Promise<string> => Promise.resolve(s.clipboard[s.clipboard.length - 1] ?? ''),
      },
      remoteName: undefined,
    },
  };
}

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

/**
 * The keychain, in memory, with every value ever stored logged in `written` (rule R3's evidence) and, when
 * asked, every key READ logged in `reads` — what a carrier touched, for "the held rotation is read by nothing".
 */
function keychain(written: string[], reads?: string[]): object {
  const map = new Map<string, string>();
  return {
    keys: () => [...map.keys()],
    get: (k: string) => {
      reads?.push(k);
      return Promise.resolve(map.get(k));
    },
    store: (k: string, v: string) => {
      map.set(k, v);
      written.push(v);
      return Promise.resolve();
    },
    delete: (k: string) => {
      map.delete(k);
      return Promise.resolve();
    },
    onDidChange: () => undefined,
  };
}

/**
 * The real `StorageManager`, loaded under `stub`, with every value it stores logged in `written`. With
 * `lockDir` its writes go through the real cross-window lease there — a second storage over the same
 * directory is a second window, for "no lease is held across a box".
 */
export function memoryStorage(stub: Record<string, unknown>, written: string[] = [], reads?: string[], lockDir?: string): StorageManager {
  const { StorageManager } = loadWithVscode<typeof import('../storageManager')>('../storageManager', stub);
  return new StorageManager(memento() as never, keychain(written, reads) as never, lockDir);
}

/**
 * Several real `StorageManager`s from ONE module graph, as one extension host holds them — for state that must belong
 * to a storage and not to a module (`rotationQuarantine.announceReleasesWith`). `memoryStorage` loads a fresh graph
 * per call, so two of those could never show a module-level value being shared.
 */
export function memoryStorages(stub: Record<string, unknown>, count: number): StorageManager[] {
  const { StorageManager } = loadWithVscode<typeof import('../storageManager')>('../storageManager', stub);
  return Array.from({ length: count }, () => new StorageManager(memento() as never, keychain([]) as never));
}

/** Add one entry and write its slots by LABEL, through the slot table — the names the product uses. */
export async function seedEntry(storage: StorageManager, details: EntityMetadata, slots: Record<string, string>): Promise<void> {
  // Listed as an account, so the sweeps that walk `getAccounts()` (the SSH agent's `loadMarked`) see it.
  await storage.upsertAccount({ accountId: ACCOUNT, email: 'me@example.com', provider: 'google' });
  await storage.addNode(ACCOUNT, { id: details.id, name: details.name, type: 'entity', parentId: null, details });
  for (const slot of SECRET_SLOTS) {
    const value = slots[slot.label];
    if (value !== undefined) {
      await slot.store(storage, ACCOUNT, details.id, stored(value));
    }
  }
}

/**
 * The slot getters of a vault that holds nothing — for a hand-built storage fake that a PIN door now
 * reads through (`pinAdmission.firstLockedStored` walks every slot). The getter names are the ones
 * the slot table calls, so a fake built with this answers the door the way an empty entry does.
 */
export const NO_SLOTS: Readonly<Record<string, () => Promise<undefined>>> = Object.fromEntries(
  ['getNotes', 'getFieldsRaw', 'getSecondRaw', 'getPaymentRaw', 'getConfigBody', 'getDbConnection', 'getVpnConfig', 'getTotp', 'getPrivateKey', 'getPassword'].map(
    (name) => [name, (): Promise<undefined> => Promise.resolve(undefined)],
  ),
);
