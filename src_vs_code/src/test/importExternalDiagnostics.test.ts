import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encryptJson } from '../cryptoUtils';
import { loadWithVscode } from './vscodeStub';

/**
 * The other half of the reported failure: an export file the recipient cannot import.
 *
 * <p>`shareDiagnostics.test.ts` proves the LINE says the right things. This drives the real
 * `credSshManager.importExternal` handler, because the two ways this feature can be absent are a
 * line that says nothing and a line that is never written — and only the second one was the actual
 * defect. Both cases here are ones a pure test cannot reach: a wrong password, and a file that
 * cannot be read at all.</p>
 */

type Handler = (...args: unknown[]) => unknown;

interface Logged {
  source: string;
  message: string;
}

const ACCOUNT = { accountId: 'a1', email: 'mark@remsoft.dev', provider: 'microsoft' };

/** A real sealed export — `encryptJson`, so the blob fingerprint is a real one. */
const SEALED = encryptJson(
  { format: 'creds-for-devs-external', version: 1, nodes: [], secrets: {} },
  'zqxjvkbnm-the-real-export-password',
);

interface Run {
  logged: Logged[];
  errors: string[];
}

/** Drive the REAL import command against a file the test supplies, and record what it reported. */
async function importing(read: () => Promise<Uint8Array>, password: string): Promise<Run> {
  const run: Run = { logged: [], errors: [] };
  const stub = {
    window: {
      showInputBox: (): Promise<string> => Promise.resolve(password),
      showOpenDialog: (): Promise<object[]> => Promise.resolve([{ fsPath: '/tmp/ionos-server.enc' }]),
      showQuickPick: (): Promise<undefined> => Promise.resolve(undefined),
      showWarningMessage: (): Promise<undefined> => Promise.resolve(undefined),
      showInformationMessage: (): undefined => undefined,
      showErrorMessage: (message: string): undefined => void run.errors.push(message),
      createOutputChannel: () => ({
        appendLine: (): void => undefined,
        show: (): void => undefined,
        dispose: (): void => undefined,
      }),
    },
    Uri: { file: (p: string): object => ({ fsPath: p }), joinPath: (): object => ({}) },
    ViewColumn: { Active: 1 },
    workspace: {
      getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
      onDidChangeConfiguration: () => ({ dispose: (): void => undefined }),
      fs: { readFile: read, writeFile: (): Promise<undefined> => Promise.resolve(undefined) },
    },
    EventEmitter: class {
      event = (): void => undefined;
      fire(): void {}
    },
    ThemeIcon: class {},
    ThemeColor: class {},
    TreeItem: class {},
    commands: { registerCommand: () => ({ dispose: (): void => undefined }) },
    env: { clipboard: { writeText: (): Promise<undefined> => Promise.resolve(undefined) } },
  };
  // Through the shared loader, which EVICTS the module graph first. Hand-rolling the `Module._load`
  // patch here reused the copy the previous case had bound to ITS stub, so the second run read the
  // first run's file and asked for the first run's password while logging into this run's host —
  // a green-looking test that proved nothing about the case it was named for.
  const { registerTreeMutationCommands } = loadWithVscode<{
    registerTreeMutationCommands(host: Record<string, unknown>): void;
  }>('../commands/treeMutationCommands', stub);
  {
    const handlers = new Map<string, Handler>();
    registerTreeMutationCommands({
      announceArrival: () => Promise.resolve(),
      doorsFor: () => undefined,
      log: {
        info: (source: string, message: string) => void run.logged.push({ source, message }),
        warn: (source: string, message: string) => void run.logged.push({ source, message }),
        error: (source: string, message: string) => void run.logged.push({ source, message }),
      },
      mutated: () => undefined,
      policyOf: () => undefined,
      register: (command: string, handler: Handler) => handlers.set(command, handler),
      storage: { getNodes: () => [], getNode: () => undefined, getAccounts: () => [ACCOUNT] },
      transports: {},
      vaultKeys: { noteUserActivity: () => undefined },
    });
    await handlers.get('credSshManager.importExternal')?.({ kind: 'account', account: ACCOUNT });
  }
  return run;
}

const failures = (run: Run): string[] =>
  run.logged.filter((line) => line.message.includes('external import FAILED')).map((l) => l.message);

test('a wrong export password leaves a line naming the bytes, the key and the password shape', async () => {
  const run = await importing(
    () => Promise.resolve(Buffer.from(SEALED, 'utf8')),
    'zqxjvkbnm-the-real-export-password ',
  );

  assert.equal(failures(run).length, 1, `nothing was recorded; got ${JSON.stringify(run.logged)}`);
  const line = failures(run)[0];
  assert.match(line, /file=ionos-server\.enc/);
  assert.match(line, /blob=[0-9a-f]{8}/);
  assert.match(line, /key=[0-9a-f]{8}/);
  // The trailing space this file's whole story is about, visible at last.
  assert.match(line, /password len=35 cp=35 ws=trailing/);
  assert.match(line, /reason=/);
  assert.ok(!line.includes('zqxjvkbnm'), `the password leaked: ${line}`);
  // And the person still gets the message they always got.
  assert.ok(run.errors.some((message) => message.startsWith('Import failed:')), run.errors.join(' | '));
});

test('a file that cannot be read at all still reaches the diagnostic and the error', async () => {
  // Deleted between the picker and the read, locked by another process, or on a share that dropped.
  // The read used to sit OUTSIDE the try, so this produced no line and no message — the command
  // rejected into VS Code's generic "running the contributed command failed", if anything.
  const run = await importing(() => Promise.reject(new Error('EBUSY: resource busy or locked')), 'anything');

  assert.equal(failures(run).length, 1, `nothing was recorded; got ${JSON.stringify(run.logged)}`);
  assert.match(failures(run)[0], /blob=unavailable/);
  assert.match(failures(run)[0], /key=unavailable/);
  assert.match(failures(run)[0], /reason=EBUSY/);
  // No password was ever asked for on this path, and the line says that rather than describing
  // an empty one — which would read as somebody having submitted a blank password.
  assert.match(failures(run)[0], /password not-asked/);
  assert.ok(run.errors.some((message) => message.startsWith('Import failed:')), run.errors.join(' | '));
});
