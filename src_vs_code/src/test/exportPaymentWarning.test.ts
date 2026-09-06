import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';
import { serializePaymentFields } from '../paymentFields';
import type { TreeNode } from '../types';

/**
 * The export warning, asserted where it is WIRED rather than only where it is computed.
 *
 * <p>Raised by my own reviewer, and the inconsistency it named is the point: within one story the
 * SHARE direction got both a pure test (`paymentRedaction.test.ts`) and a wiring test
 * (`shareInbox.test.ts`, which calls the real `buildSharePayload`), while the EXPORT direction got
 * only the pure one. There is no `treeMutationCommands.test.ts` in this repository at all, so nothing
 * proved the command passes the real exported secrets to the note builder or puts the result in front
 * of the person — a refactor could drop `cardNote` and every test would stay green.</p>
 *
 * <p>That is exactly the "asserted only at the pure level, could silently be left unwired" pattern,
 * and it is not an untestable-in-isolation case: the command module loads fine under a `vscode` stub
 * (measured before this file was written), so the honest answer was to write the test rather than to
 * claim an exemption.</p>
 */

interface Captured {
  quickPickTitle: string;
  modalText: string;
  warnings: string[];
  secretsRead: number;
}

const captured: Captured = { quickPickTitle: '', modalText: '', warnings: [], secretsRead: 0 };

/** Just enough `vscode` for the export command to reach its first dialog. */
function stubbedVscode(): Record<string, unknown> {
  return {
    window: {
      showQuickPick: (_items: unknown, options: { title?: string }): Promise<undefined> => {
        captured.quickPickTitle = options?.title ?? '';
        // Returning undefined ends the command here, which is all this test needs: the note is built
        // before the choice and appears in the title either way.
        return Promise.resolve(undefined);
      },
      showWarningMessage: (text: string): Promise<undefined> => {
        captured.modalText = text;
        captured.warnings.push(text);
        return Promise.resolve(undefined);
      },
      showInformationMessage: (): undefined => undefined,
      showSaveDialog: (): Promise<undefined> => Promise.resolve(undefined),
      showInputBox: (): Promise<undefined> => Promise.resolve(undefined),
      createOutputChannel: () => ({ appendLine: (): void => undefined, show: (): void => undefined, dispose: (): void => undefined }),
    },
    Uri: { file: (p: string): object => ({ fsPath: p }), joinPath: (): object => ({}) },
    ViewColumn: { Active: 1 },
    workspace: {
      getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
      onDidChangeConfiguration: () => ({ dispose: (): void => undefined }),
      fs: { writeFile: (): Promise<undefined> => Promise.resolve(undefined) },
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
    env: { clipboard: { writeText: (): Promise<undefined> => Promise.resolve(undefined) } },
  };
}

type Handler = (...args: unknown[]) => unknown;

/** Register the real commands against the stub and hand back the export one. */
function exportHandler(
  secrets: Record<string, { payment?: string }>,
  node: TreeNode,
  corpPolicyOf?: (accountId: string) => unknown,
): Handler {
  const loader = Module as unknown as { _load(request: string, ...rest: unknown[]): unknown };
  const original = loader._load;
  loader._load = function patched(request: string, ...rest: unknown[]): unknown {
    return request === 'vscode' ? stubbedVscode() : original.call(this, request, ...rest);
  };
  try {
    // The handler moved to its own module when the corporate export ban pushed treeMutationCommands
    // past its line ceiling; the guarantee under test — that an export SAYS what card fields it
    // carries — did not move with it.
    const { registerExportCommand } = require('../commands/exportCommand') as {
      registerExportCommand(host: Record<string, unknown>): void;
    };
    const handlers = new Map<string, Handler>();
    registerExportCommand({
      announceArrival: () => Promise.resolve(),
      doorsFor: () => undefined,
      mutated: () => undefined,
      register: (command: string, handler: Handler) => handlers.set(command, handler),
      corpPolicyOf,
      storage: {
        getNodes: () => [node],
        exportSecretsFor: () => {
          captured.secretsRead += 1;
          return Promise.resolve(secrets);
        },
      },
      transports: {},
      vaultKeys: { noteUserActivity: () => undefined },
    } as never);
    const handler = handlers.get('credSshManager.exportExternal');
    assert.ok(handler, 'the export command must be registered, or this test is asserting nothing');
    return handler;
  } finally {
    loader._load = original;
  }
}

const CARD_NODE: TreeNode = {
  id: 'p1',
  name: 'Visa',
  type: 'entity',
  parentId: null,
  details: { id: 'p1', name: 'Visa', isSshEnabled: false, kind: 'payment', isPayment: true },
};

const target = { kind: 'node', accountId: 'acc-1', node: CARD_NODE };

test('exporting a card tells the person its CVV and PIN are going with it', async () => {
  captured.quickPickTitle = '';
  const handler = exportHandler(
    { p1: { payment: serializePaymentFields({ number: '4111111111111111', cvv: '123', pin: '4321' }) } },
    CARD_NODE,
  );

  await handler(target, undefined);

  // Two fields in ONE record — which is the distinction the two reviewers disagreed about and the
  // reason the sentence carries both numbers. This assertion was written as "1 CVV or PIN" and the
  // test caught it: the wiring was right and the expectation was wrong.
  assert.match(
    captured.quickPickTitle,
    /2 CVV\/PIN values across 1 payment record\b/,
    `the note never reached the dialog — got: ${captured.quickPickTitle}`,
  );
  assert.match(
    captured.quickPickTitle,
    /a share removes those, an export does not/,
    'the asymmetry is the whole reason the sentence exists',
  );
  assert.equal(
    captured.quickPickTitle.includes('4111'),
    false,
    'and no value is in it — this string reaches a notification, which several UI layers log',
  );
  assert.equal(captured.quickPickTitle.includes('123'), false);
});

test('a card with only a CVV reads in the singular', async () => {
  captured.quickPickTitle = '';
  const handler = exportHandler(
    { p1: { payment: serializePaymentFields({ number: '4111111111111111', cvv: '123' }) } },
    CARD_NODE,
  );

  await handler(target, undefined);

  assert.match(captured.quickPickTitle, /1 CVV or PIN across 1 payment record\b/);
});

test('exporting something with no card says nothing about cards', async () => {
  captured.quickPickTitle = '';
  const handler = exportHandler({ p1: {} }, CARD_NODE);

  await handler(target, undefined);

  assert.ok(captured.quickPickTitle.length > 0, 'the dialog still opens');
  assert.equal(
    /CVV/.test(captured.quickPickTitle),
    false,
    'a warning about nothing trains people to dismiss the one that matters',
  );
});

/** A corporate policy document, as the tree caches it. */
function policy(exportAllowed: boolean): Record<string, unknown> {
  return {
    corpMode: true,
    role: exportAllowed ? 'member' : 'dev',
    isOfficer: false,
    isAdmin: false,
    active: true,
    policy: { export: exportAllowed, share: 'project', moveOutOfProject: false },
    policyFromServer: true,
    projects: [],
    leaseHours: 24,
    fetchedAt: 1_000_000,
  };
}

test('a developer forbidden to export is refused before any secret is read', async () => {
  // The gate where it is WIRED, not only where it is computed. Without this, a refactor could drop
  // the call and every pure test would stay green while a forbidden export ran.
  captured.warnings = [];
  captured.secretsRead = 0;
  captured.quickPickTitle = '';
  const handler = exportHandler({ p1: {} }, CARD_NODE, () => policy(false));

  await handler(target, undefined);

  assert.equal(captured.secretsRead, 0, 'the vault must not even be read for an export that may not happen');
  assert.equal(captured.quickPickTitle, '', 'and no export dialog may open');
  assert.equal(captured.warnings.length, 1);
  assert.match(captured.warnings[0], /not allowed for your role/);
});

test('a member is not refused, and the export proceeds to its first dialog', async () => {
  // The control. A gate that refused everybody would pass the test above for the wrong reason.
  captured.warnings = [];
  captured.secretsRead = 0;
  captured.quickPickTitle = '';
  const handler = exportHandler({ p1: {} }, CARD_NODE, () => policy(true));

  await handler(target, undefined);

  assert.equal(captured.secretsRead, 1);
  assert.match(captured.quickPickTitle, /^Export /);
});

test('a personal account is not asked about a policy it does not have', async () => {
  captured.secretsRead = 0;
  captured.quickPickTitle = '';
  const handler = exportHandler({ p1: {} }, CARD_NODE);

  await handler(target, undefined);

  assert.equal(captured.secretsRead, 1);
});
