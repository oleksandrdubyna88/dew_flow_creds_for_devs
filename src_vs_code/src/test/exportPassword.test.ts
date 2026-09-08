import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { decryptJson } from '../cryptoUtils';
import type { TreeNode } from '../types';

/**
 * The password on `Export / Share Externally…`, driven the way a person drives it.
 *
 * <p>This box is the older half of the same problem the share PIN had. It seals a file that
 * outlives the session, it says <i>"Tell it to the recipient out-of-band — it is the only key to
 * this file"</i>, and until this story it was a bare `showInputBox`: no generator, no reveal, and —
 * alone among the transit-secret boxes here — no confirmation of a typed value, so a typo was
 * discovered by the recipient who could not open the file, long after the plaintext was gone.</p>
 *
 * <p>Wiring tests, deliberately, in the style of `exportPaymentWarning.test.ts`: the guarantee is
 * that the COMMAND asks through the shared box and hands the drawn password on to the save. Pure
 * assertions about the box itself live in `transitPinPrompt.test.ts`. The end-to-end claim here is
 * the one that cannot be faked — the written file is decrypted with the CLIPBOARD's contents, which
 * is exactly what the person on the other end does.</p>
 */

interface FakeBox {
  value: string;
  password: boolean;
  buttons: { tooltip?: string }[];
  validationMessage: unknown;
  [key: string]: unknown;
}

const ui = {
  /** 'sealed' takes the encrypted form, 'plain' takes the JSON one. */
  form: 'sealed' as 'sealed' | 'plain',
  /** What the person does in the password box. */
  pin: 'accept-drawn' as 'accept-drawn' | 'type' | 'escape',
  /** The value they type, when they type one. */
  typed: '',
  /** Answers handed to the repeat box, in order. */
  repeats: [] as (string | undefined)[],
  repeatsAsked: 0,
  /** undefined means they cancelled the save dialog. */
  saveTo: '/tmp/export.enc' as string | undefined,
  /** Set to make the file write reject, the way a full or read-only disk does. */
  writeFails: false,
  /** Every filesystem operation the command performed, in order. */
  fsOps: [] as string[],
  /** What exists on disk afterwards, by path. */
  files: new Map<string, string>(),
  clipboard: '',
  clipboardWrites: 0,
  infos: [] as string[],
  infoActions: [] as string[][],
  errors: [] as string[],
  boxes: [] as FakeBox[],
};

function reset(): void {
  ui.form = 'sealed';
  ui.pin = 'accept-drawn';
  ui.typed = '';
  ui.repeats = [];
  ui.repeatsAsked = 0;
  ui.saveTo = '/tmp/export.enc';
  ui.writeFails = false;
  ui.fsOps = [];
  ui.files = new Map<string, string>();
  ui.clipboard = '';
  ui.clipboardWrites = 0;
  ui.infos = [];
  ui.infoActions = [];
  ui.errors = [];
  ui.boxes = [];
}

/** The InputBox VS Code would have handed the prompt, driven from `ui.pin`. */
function makeInputBox(): FakeBox {
  const accepts: (() => void)[] = [];
  const hides: (() => void)[] = [];
  const changes: ((value: string) => void)[] = [];
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
    onDidTriggerButton: () => ({ dispose(): void {} }),
    hide: (): void => hides.forEach((cb) => cb()),
    dispose: (): void => {},
    show: (): void => {
      void drive();
    },
  } as unknown as FakeBox;

  async function drive(): Promise<void> {
    // The draw copies asynchronously; accepting before it settles would test a race nobody ships.
    await new Promise((r) => setImmediate(r));
    if (ui.pin === 'escape') {
      hides.forEach((cb) => cb());
      return;
    }
    if (ui.pin === 'type') {
      box.value = ui.typed;
    }
    accepts.forEach((cb) => cb());
  }

  ui.boxes.push(box);
  return box;
}

/** Just enough `vscode` for the export command to run end to end. */
function stubbedVscode(): Record<string, unknown> {
  return {
    window: {
      createInputBox: makeInputBox,
      showInputBox: (): Promise<string | undefined> => {
        ui.repeatsAsked += 1;
        return Promise.resolve(ui.repeats.shift());
      },
      showQuickPick: (items: { plain: boolean }[]): Promise<unknown> =>
        Promise.resolve(items.find((i) => i.plain === (ui.form === 'plain'))),
      showWarningMessage: (_text: string, ..._rest: unknown[]): Promise<string> =>
        Promise.resolve('Write plain JSON'),
      showErrorMessage: (text: string): Promise<undefined> => {
        ui.errors.push(text);
        return Promise.resolve(undefined);
      },
      showInformationMessage: (text: string, ...actions: unknown[]): Promise<undefined> => {
        ui.infos.push(text);
        ui.infoActions.push(actions.filter((a): a is string => typeof a === 'string'));
        return Promise.resolve(undefined);
      },
      showSaveDialog: (): Promise<unknown> =>
        Promise.resolve(ui.saveTo === undefined ? undefined : { fsPath: ui.saveTo }),
      createOutputChannel: () => ({
        appendLine: (): void => undefined,
        show: (): void => undefined,
        dispose: (): void => undefined,
      }),
    },
    env: {
      clipboard: {
        readText: (): Promise<string> => Promise.resolve(ui.clipboard),
        writeText: (value: string): Promise<void> => {
          ui.clipboardWrites += 1;
          ui.clipboard = value;
          return Promise.resolve();
        },
      },
    },
    Uri: { file: (p: string): object => ({ fsPath: p }), joinPath: (): object => ({}) },
    ViewColumn: { Active: 1 },
    InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
    workspace: {
      getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
      onDidChangeConfiguration: () => ({ dispose: (): void => undefined }),
      fs: {
        writeFile: (uri: { fsPath: string }, bytes: Buffer): Promise<undefined> => {
          ui.fsOps.push(`write ${uri.fsPath}`);
          if (ui.writeFails) {
            return Promise.reject(new Error('disk is full'));
          }
          ui.files.set(uri.fsPath, Buffer.from(bytes).toString('utf8'));
          return Promise.resolve(undefined);
        },
        rename: (from: { fsPath: string }, to: { fsPath: string }): Promise<undefined> => {
          ui.fsOps.push(`rename ${from.fsPath} -> ${to.fsPath}`);
          const held = ui.files.get(from.fsPath);
          ui.files.delete(from.fsPath);
          if (held !== undefined) {
            ui.files.set(to.fsPath, held);
          }
          return Promise.resolve(undefined);
        },
        delete: (uri: { fsPath: string }): Promise<undefined> => {
          ui.fsOps.push(`delete ${uri.fsPath}`);
          ui.files.delete(uri.fsPath);
          return Promise.resolve(undefined);
        },
      },
    },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
    },
    ThemeIcon: class {
      constructor(readonly id: string) {}
    },
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
    TreeItem: class {},
    commands: { registerCommand: () => ({ dispose: (): void => undefined }) },
  };
}

type Handler = (...args: unknown[]) => unknown;

const NODE: TreeNode = {
  id: 'e1',
  name: 'prod api',
  type: 'entity',
  parentId: null,
  details: { id: 'e1', name: 'prod api', isSshEnabled: false },
};

const target = { kind: 'node', accountId: 'acc-1', node: NODE };

/** Register the real command against the stub and hand back the export handler. */
function exportHandler(): Handler {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    return request === 'vscode' ? stubbedVscode() : original.call(this, request, ...rest);
  };
  try {
    const { registerExportCommand } = require('../commands/exportCommand') as {
      registerExportCommand(host: Record<string, unknown>): void;
    };
    const handlers = new Map<string, Handler>();
    registerExportCommand({
      register: (command: string, handler: Handler) => handlers.set(command, handler),
      storage: {
        getNodes: () => [NODE],
        exportSecretsFor: () => Promise.resolve({ e1: { password: 'pw' } }),
      },
      vaultKeys: { noteUserActivity: () => undefined },
    } as never);
    const handler = handlers.get('credSshManager.exportExternal');
    assert.ok(handler, 'the export command must be registered, or this test asserts nothing');
    return handler;
  } finally {
    loader._load = original;
  }
}

/** What ended up under a path, '' when nothing did. */
function written(path = '/tmp/export.enc'): string {
  return ui.files.get(path) ?? '';
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((r) => setImmediate(r));
  }
};

test('the export password is asked for through the shared box, drawn and copied', async () => {
  reset();
  await exportHandler()(target, undefined);
  await flush();

  const box = ui.boxes.at(-1);
  assert.ok(box !== undefined, 'the export must use createInputBox, not a bare showInputBox');
  assert.equal(box.password, true, 'a password box is masked');
  assert.equal(box.buttons.length, 2, 'the sparkle and the eye, exactly as the share box has them');
  assert.notEqual(box.value, '', 'it opens with one drawn — that is the whole point of the story');
  assert.equal(ui.repeatsAsked, 0, 'nothing to mistype in a value nobody typed');
});

/**
 * The claim the whole story rests on, and the only assertion that catches a substitution anywhere
 * in the chain: open the written file with what is on the clipboard.
 */
test('the file is sealed with exactly the password that reached the clipboard', async () => {
  reset();
  await exportHandler()(target, undefined);
  await flush();

  assert.notEqual(written(), '', 'nothing was written');
  assert.notEqual(ui.clipboard, '', 'nothing reached the clipboard for the person to paste');
  const opened = decryptJson(written(), ui.clipboard) as { nodes?: unknown[] };
  assert.ok(opened !== undefined, 'the clipboard did not open the file it is supposed to open');
});

test('a typed export password is confirmed, and a mismatch writes no file', async () => {
  reset();
  ui.pin = 'type';
  ui.typed = 'a-good-export-password';
  ui.repeats = ['something-else'];

  await exportHandler()(target, undefined);
  await flush();

  assert.equal(ui.repeatsAsked, 1, 'the only key to a file that outlives the session is confirmed');
  assert.equal(written(), '', 'a mismatch must write nothing at all');
  assert.equal(ui.errors.length, 1, 'and the person is told why');
});

test('the plain JSON export says nothing about a PIN', async () => {
  reset();
  ui.form = 'plain';
  ui.saveTo = '/tmp/export.json';

  await exportHandler()(target, undefined);
  await flush();

  assert.notEqual(written('/tmp/export.json'), '', 'the plain form still writes its file');
  assert.equal(ui.boxes.length, 0, 'there is no password on that path, so no box is raised');
  assert.deepEqual(
    ui.infoActions.at(-1),
    [],
    'and nothing may offer to re-copy a password that was never generated',
  );
});

test('a cancelled save dialog takes the export password with it', async () => {
  reset();
  ui.saveTo = undefined; // the person backs out of the file dialog

  await exportHandler()(target, undefined);
  await flush();

  assert.equal(written(), '', 'precondition: no file was written');
  assert.equal(ui.clipboard, '', 'no file exists, so its password must not stay on the clipboard');
});

test('a write that fails takes the export password with it too', async () => {
  reset();
  ui.writeFails = true;

  // The handler is typed `unknown`, and a failing write may reject rather than be swallowed — which
  // is itself part of what this test is checking is survivable.
  await Promise.resolve(exportHandler()(target, undefined)).catch(() => undefined);
  await flush();

  assert.equal(written(), '', 'precondition: the write did not happen');
  assert.equal(ui.clipboard, '', 'a password for a file that does not exist is a secret for nothing');
});

test('a delivered export offers the password again, and never prints it', async () => {
  reset();
  await exportHandler()(target, undefined);
  await flush();

  const said = ui.infos.at(-1) ?? '';
  const actions = ui.infoActions.at(-1) ?? [];
  assert.ok(actions.includes('Copy again'), `the save dialog can outlast the 45s window: ${actions}`);
  assert.ok(actions.includes('Show PIN'), `and a masked value must be readable aloud: ${actions}`);
  assert.ok(!said.includes(ui.clipboard), 'a notification is retained — it may never carry the value');
});

/**
 * RED FIRST, and the one real finding of story 2's plan round (codex, Blocking).
 *
 * <p>`workspace.fs.writeFile` truncates and then writes, so a failure partway through — a full
 * disk, a network share dropping, a permission prompt refused — can leave a TRUNCATED file sitting
 * under the name the person chose. An encrypted export is AES-GCM over the whole payload, so that
 * file cannot be opened by any password: it is an artefact that looks like an export, is named like
 * an export, and is not one. Meanwhile the failure path discards the password, on the reasoning
 * that no file exists.</p>
 *
 * <p>The repository already had the answer and this export was simply not using it:
 * `writeFileAtomically` writes a temp sibling and renames over the target, a rename being the one
 * operation a filesystem makes atomic. Its own doc comment says why it exists — two writers of the
 * vault file needed it and "one of them" did not have it. This is the third.</p>
 */
test('the export arrives by a rename, so a failed write cannot leave a half file under its name', async () => {
  reset();
  await exportHandler()(target, undefined);
  await flush();

  assert.notEqual(written(), '', 'precondition: the export landed');
  const direct = ui.fsOps.filter((op) => op === `write ${'/tmp/export.enc'}`);
  assert.deepEqual(direct, [], `the final name must never be written directly: ${ui.fsOps}`);
  assert.ok(
    ui.fsOps.some((op) => op.startsWith('rename ') && op.endsWith('-> /tmp/export.enc')),
    `the content must arrive by a rename: ${ui.fsOps}`,
  );
});

test('a failed write leaves nothing at all — no export, and no temp beside it', async () => {
  reset();
  ui.writeFails = true;

  await Promise.resolve(exportHandler()(target, undefined)).catch(() => undefined);
  await flush();

  assert.deepEqual(
    [...ui.files.keys()],
    [],
    'a truncated file under the export name would be unopenable by any password',
  );
});
