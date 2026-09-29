import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntityViewOptions } from '../entityViewPage';
import { parseFields } from '../entityFields';
import { parsePaymentFields } from '../paymentFields';
import { forgetAllPins } from '../pinSession';
import { parseSecondValues } from '../secondValues';
import { lockSecret } from '../secretEnvelope';
import { EntityMetadata, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * D1 of the entry-PIN plan, driven through the REAL `openEntityViewer`: a protected entry opens
 * with everything it holds, after one PIN.
 *
 * <p>The owner's report (2026-09-29): a payment card was protected with a PIN, and afterwards View
 * asked for the PIN, accepted it, and showed only the name and the dates — the card number, the CVV
 * and the rest were gone from the page. Nothing was deleted. The viewer built the card's SHAPE from
 * the typed getters, which parse the stored string and keep only keys they know; a locked envelope
 * has none, so a protected card read as `{}` and the card frame was dropped. The values themselves
 * were reachable the whole time, through the gated reader the same function already built two
 * lines later. No test drove the real viewer, so nothing noticed for three weeks.</p>
 *
 * <p>The vault here is a real in-memory store whose typed getters do what the real ones do — parse
 * the raw string — so a locked record reads as `{}` exactly as it did in the product. A stub that
 * answered `getPayment` with the card would have proven nothing.</p>
 */

const ACCOUNT = 'a1';
const PIN = '1234';

/** Locked values, one wrap per plaintext, made once — scrypt costs about a second each. */
const wraps = new Map<string, Promise<string>>();
function locked(plain: string): Promise<string> {
  let wrap = wraps.get(plain);
  if (wrap === undefined) {
    wrap = lockSecret(plain, ACCOUNT, PIN);
    wraps.set(plain, wrap);
  }
  return wrap;
}

interface Said {
  warnings: string[];
  /** How many PIN boxes were raised — the card must open after ONE. */
  boxes: number;
}

/** The `vscode` the viewer touches on the way to its page: the PIN box answered from a queue, notices recorded. */
function stubbedVscode(inputs: (string | undefined)[], said: Said): Record<string, unknown> {
  return {
    window: {
      showInputBox: (): Promise<string | undefined> => {
        said.boxes += 1;
        return Promise.resolve(inputs.shift());
      },
      showWarningMessage: (message: string): Promise<undefined> => {
        said.warnings.push(message);
        return Promise.resolve(undefined);
      },
      showInformationMessage: (): Promise<undefined> => Promise.resolve(undefined),
      showErrorMessage: (): undefined => undefined,
      createOutputChannel: () => ({ appendLine: (): void => undefined, show: (): void => undefined, dispose: (): void => undefined }),
    },
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
      onDidChangeConfiguration: () => ({ dispose: (): void => undefined }),
      fs: { writeFile: (): Promise<undefined> => Promise.resolve(undefined) },
    },
    Uri: { file: (p: string): object => ({ fsPath: p }), joinPath: (): object => ({}) },
    ViewColumn: { Active: 1 },
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
    InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
    commands: { registerCommand: () => ({ dispose: (): void => undefined }) },
    env: { clipboard: { writeText: (): Promise<undefined> => Promise.resolve(undefined) }, shell: '/bin/sh' },
  };
}

/**
 * A vault in memory whose typed getters are the REAL parse of the raw string — the reading the
 * viewer used before the fix, and the reason a locked record silently became `{}`.
 */
function memoryVault(node: TreeNode, secrets: Map<string, string>): unknown {
  const get = (slot: string) => (): Promise<string | undefined> => Promise.resolve(secrets.get(slot));
  return {
    getNodes: () => [node],
    getNode: (_a: string, id: string) => (node.id === id ? node : undefined),
    updateDetailsFields: () => Promise.resolve(),
    getPassword: get('password'),
    getPrivateKey: get('privateKey'),
    getVpnConfig: get('vpnConfig'),
    getDbConnection: get('dbConnection'),
    getNotes: get('notes'),
    getTotp: get('totp'),
    getConfigBody: get('configBody'),
    getFieldsRaw: get('fieldsRaw'),
    getFields: async (): Promise<unknown> => parseFields(await get('fieldsRaw')()),
    getSecondRaw: get('secondRaw'),
    getSecond: async (): Promise<unknown> => parseSecondValues(await get('secondRaw')()),
    getPaymentRaw: get('paymentRaw'),
    getPayment: async (): Promise<unknown> => parsePaymentFields(await get('paymentRaw')()),
    getAttachment: get('attachment'),
    getImage: get('image'),
    getHistory: (): Promise<unknown[]> => Promise.resolve([]),
  };
}

interface World {
  open(): Promise<void>;
  /** Every page the viewer showed — the options it built, which is where the card's shape lives. */
  shown: EntityViewOptions[];
  said: Said;
}

function world(details: EntityMetadata, secrets: Map<string, string>, inputs: (string | undefined)[]): World {
  forgetAllPins();
  const said: Said = { warnings: [], boxes: 0 };
  const shown: EntityViewOptions[] = [];
  const node = { id: details.id, name: details.name, type: 'entity', parentId: null, details } as TreeNode;
  const mod = loadWithVscode<typeof import('../entityViewerCommands')>('../entityViewerCommands', stubbedVscode([...inputs], said), {
    './entityViewPanel': { showEntityView: (options: EntityViewOptions): void => void shown.push(options) },
  });
  const doors = { cliAliases: [], codeAccess: false, bridgeOpen: false, wslRelay: false };
  return {
    said,
    shown,
    open: () => mod.openEntityViewer(ACCOUNT, node, memoryVault(node, secrets) as never, doors as never),
  };
}

const CARD = JSON.stringify({ number: '4111111111111111', cvv: '123', pin: '4321' });

test('a protected payment entry opens with its WHOLE card after one PIN — the reported bug', async () => {
  const details = { id: 'p1', name: 'orest payoneer', isSshEnabled: false, kind: 'payment', isPayment: true, paymentForm: 'card', pinProtected: true } as EntityMetadata;
  const secrets = new Map<string, string>([
    ['paymentRaw', await locked(CARD)],
    ['secondRaw', await locked(JSON.stringify({ cvv2: '999' }))],
  ]);
  const w = world(details, secrets, [PIN]);

  await w.open();

  assert.equal(w.shown.length, 1, 'the viewer opened');
  assert.equal(w.said.boxes, 1, 'one PIN, not one per field');
  const card = w.shown[0].payment;
  assert.ok(card !== undefined, 'the card frame was dropped — the page shows only Main and Dates & history');
  assert.deepEqual([...card.present].sort(), ['cvv', 'number', 'pin'], 'every stored field is drawn');
  assert.deepEqual([...card.seconds], ['cvv2'], 'and the second value the card holds has its row');
  assert.ok(w.shown[0].resolvePayment !== undefined, 'so the per-field reveal has something to answer');
  assert.deepEqual(w.said.warnings, []);
});

test('a protected credential draws its second-password row, and its login and URL', async () => {
  const details = { id: 'c1', name: 'godaddy', isSshEnabled: false, kind: 'credential', pinProtected: true } as EntityMetadata;
  const secrets = new Map<string, string>([
    ['password', await locked('hunter2')],
    ['secondRaw', await locked(JSON.stringify({ password2: 'swordfish' }))],
    ['fieldsRaw', await locked(JSON.stringify({ login: 'me', url: 'https://godaddy.com' }))],
  ]);
  const w = world(details, secrets, [PIN]);

  await w.open();

  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].hasSecondPassword, true, 'the second-password row is hidden — the record read as {}');
  assert.deepEqual(w.shown[0].fields, { login: 'me', url: 'https://godaddy.com' }, 'the eager reads were gated already; they still are');
  assert.equal(w.shown[0].hasPassword, true);
  assert.equal(w.said.boxes, 1);
});

test('a declined PIN opens no viewer and says nothing more — the person chose', async () => {
  const details = { id: 'p1', name: 'orest payoneer', isSshEnabled: false, kind: 'payment', isPayment: true, paymentForm: 'card', pinProtected: true } as EntityMetadata;
  const secrets = new Map<string, string>([['paymentRaw', await locked(CARD)]]);
  const w = world(details, secrets, [undefined]);

  await w.open();

  assert.deepEqual(w.shown, [], 'a viewer full of empty boxes is a worse answer than no viewer');
  assert.deepEqual(w.said.warnings, []);
});

test('a wrong PIN opens no viewer and shows the gate\'s own reason', async () => {
  const details = { id: 'p1', name: 'orest payoneer', isSshEnabled: false, kind: 'payment', isPayment: true, paymentForm: 'card', pinProtected: true } as EntityMetadata;
  const secrets = new Map<string, string>([['paymentRaw', await locked(CARD)]]);
  const w = world(details, secrets, ['not-the-pin']);

  await w.open();

  assert.deepEqual(w.shown, []);
  assert.equal(w.said.warnings.length, 1);
  assert.match(w.said.warnings[0], /does not open this entry/);
});

test('an unprotected card still opens without a question — the door is only for a locked entry', async () => {
  const details = { id: 'p2', name: 'visa', isSshEnabled: false, kind: 'payment', isPayment: true, paymentForm: 'card' } as EntityMetadata;
  const secrets = new Map<string, string>([['paymentRaw', CARD]]);
  const w = world(details, secrets, []);

  await w.open();

  assert.equal(w.shown.length, 1);
  assert.equal(w.said.boxes, 0, 'nothing to ask about');
  assert.deepEqual([...(w.shown[0].payment?.present ?? [])].sort(), ['cvv', 'number', 'pin']);
});
