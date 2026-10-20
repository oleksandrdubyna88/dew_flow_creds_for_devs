import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EntityMetadata, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';

/**
 * The SSH agent manager's test world: the real `SshAgentManager` over a stub socket server and a `vscode`
 * whose every sink is a spy, shared by the suites that exercise the gate (`sshAgentManager.test.ts`,
 * and the window book's suite after it).
 *
 * <p>The socket server is substituted, which is what makes the `confirm` callback reachable through its
 * real wiring rather than by reaching into a private method: the manager hands the server that callback,
 * so holding the server means holding the gate.</p>
 *
 * <p>Not named `*.test.ts`, so the runner never treats it as a suite.</p>
 */

export type Manager = typeof import('../sshAgentManager');

export interface FakeServer {
  socketPath: string;
  listening: boolean;
  confirm(key: { entityId: string; name: string; fingerprint: string }, purpose: unknown): Promise<boolean>;
  keys(): unknown[];
  dispose(): void;
}

export interface World {
  mod: Manager;
  server(): FakeServer | undefined;
  /** Modal answers, consumed in order; undefined means dismissed, a pending promise means unanswered. */
  answers: (string | undefined | Promise<string>)[];
  dialogs: string[];
  /** The buttons each dialog offered, in order — what the prompt really lets a person answer. */
  buttons: string[][];
  env: Record<string, string>;
  envDescription: string;
  presence: number;
  logs: string[];
  disposals: number;
}

export function realPrivateKey(): string {
  // Generated, never committed: a private key in a repository is a private key on the internet.
  const { privateKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }) as unknown as { privateKey: string };
  return privateKey;
}

export function world(options: {
  keys?: Record<string, string | undefined>;
  nodes?: TreeNode[];
  answers?: (string | undefined | Promise<string>)[];
}): World {
  let server: FakeServer | undefined;
  const w: World = {
    mod: undefined as never,
    server: (): FakeServer | undefined => server,
    answers: [...(options.answers ?? [])],
    dialogs: [],
    buttons: [],
    env: {},
    envDescription: '',
    presence: 0,
    logs: [],
    disposals: 0,
  };

  class StubAgentServer {
    readonly socketPath: string;
    listening = false;
    readonly confirm: FakeServer['confirm'];
    readonly keys: () => unknown[];

    constructor(o: {
      socketPath: string;
      keys: () => unknown[];
      confirm: FakeServer['confirm'];
      log: (m: string) => void;
    }) {
      this.socketPath = o.socketPath;
      this.confirm = o.confirm;
      this.keys = o.keys;
      server = this as unknown as FakeServer;
    }

    listen(): Promise<void> {
      this.listening = true;
      return Promise.resolve();
    }

    dispose(): void {
      this.listening = false;
      w.disposals += 1;
    }
  }

  w.mod = loadWithVscode<Manager>(
    '../sshAgentManager',
    {
      window: {
        showWarningMessage: (m: string, _options?: unknown, ...buttons: string[]): Promise<string | undefined> => {
          w.dialogs.push(m);
          w.buttons.push(buttons);
          return Promise.resolve(w.answers.shift());
        },
        createOutputChannel: (): unknown => ({
          appendLine: (line: string): void => {
            w.logs.push(line);
          },
          dispose: (): void => undefined,
        }),
      },
    },
    {
      './sshAgentServer': {
        SshAgentServer: StubAgentServer,
        agentSocketPath: (dir: string, _p: string, pid: number): string =>
          path.join(dir, `agent-${pid}.sock`),
      },
    },
  );
  return w;
}

export function manager(
  w: World,
  options: {
    keys?: Record<string, string | undefined>;
    nodes?: TreeNode[];
    clock?: () => Date;
    consentTimeoutMs?: number;
  },
): {
  instance: InstanceType<Manager['SshAgentManager']>;
  /** The storage root this manager was given — the socket path is derived from it. */
  dir: string;
} {
  const dir = storageDir();
  const storage = {
    getPrivateKey: (_a: string, id: string): Promise<string | undefined> =>
      Promise.resolve((options.keys ?? {})[id]),
    getAccounts: (): unknown[] => [{ accountId: 'a1', email: 'me@corp.com', provider: 'google' }],
    getNodes: (): TreeNode[] => options.nodes ?? [],
  };
  const envCollection = {
    replace: (name: string, value: string): void => {
      w.env[name] = value;
    },
    delete: (name: string): void => {
      delete w.env[name];
    },
    set description(value: string) {
      w.envDescription = value;
    },
  };
  return {
    dir,
    instance: new w.mod.SshAgentManager(
      storage as never,
      dir,
      envCollection as never,
      () => {
        w.presence += 1;
      },
      undefined,
      options.clock,
      options.consentTimeoutMs,
    ),
  };
}

/**
 * A real, writable storage directory.
 *
 * <p>Was the literal `/storage`, which resolves to a drive-relative path Windows tolerates and
 * to the filesystem root on Linux, where creating it needs privileges no test has. These fifteen
 * tests therefore passed on Windows and failed on Linux with `EACCES` — meaning the SSH agent
 * had never actually been exercised under WSL or in a Linux CI.</p>
 */
const tempDirs: string[] = [];

export function storageDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testsToDelete-agent-'));
  tempDirs.push(dir);
  return dir;
}

// One directory per manager, twenty-odd per run: swept at exit rather than in each test, so a
// failing assertion still leaves nothing behind in the system temp folder.
process.on('exit', () => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // a file another process still holds — the OS clears temp eventually
    }
  }
});

export const keyEntity = (id: string, name: string): EntityMetadata =>
  ({ id, name, kind: 'sshkey' }) as EntityMetadata;

export const KEY_ID = 'key-1';

/** A modal nobody answers, and a way to answer it LATE — after the bound has already refused. */
export function unanswered(): { answer: Promise<string>; clickLate: (choice: string) => void } {
  let clickLate: (choice: string) => void = () => undefined;
  const answer = new Promise<string>((resolve) => {
    clickLate = resolve;
  });
  return { answer, clickLate };
}
