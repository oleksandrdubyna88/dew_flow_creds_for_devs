import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { CREDS_MCP, binaryNameFor, ridFor } from '../credsInstall';
import { WslOutcome } from '../wslProcess';

/**
 * Plan §5.8 / E4.S2 — the WINDOW's half of the stale-install check, driven through the real
 * `mcpInstallTarget.ts` under the `vscode` stub, with `wsl.exe` stood in for.
 *
 * <p>What is under test is what a person sees and what each click does: the command offers only a
 * running distribution and never probes a stopped one; an older install is shown with its three
 * answers; *Not for this version* is remembered; *Update* runs the install into WSL again, puts the
 * block with the new path on the clipboard and records the two paths the next check replays; and a
 * window whose own `creds-mcp` predates `--version` is sent to *Install the MCP Server…* instead.</p>
 */

type Handler = (...args: unknown[]) => unknown;

const LINUX = '/home/dev/.local/bin/creds-mcp';
const WINDOWS_IN_WSL = '/mnt/c/Users/dev/AppData/creds-mcp.exe';

interface Shown {
  readonly level: string;
  readonly text: string;
  readonly choices: readonly string[];
}

interface Options {
  readonly running: readonly string[];
  readonly version?: WslOutcome;
  readonly clicks?: readonly (string | undefined)[];
  readonly expected?: string;
}

interface Harness {
  readonly run: () => Promise<void>;
  readonly shown: Shown[];
  readonly probed: string[][];
  readonly executed: string[];
  readonly state: Map<string, unknown>;
  readonly clipboard: () => string;
  readonly storageDir: string;
}

/** Every temporary storage folder a harness made — removed when the file's tests end. */
const made: string[] = [];
after(() => {
  for (const dir of made) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const olderAnswer: WslOutcome = {
  kind: 'exited',
  code: 0,
  stdout: `creds-mcp 0.10.0\nwindows half: creds-mcp 0.10.0 (${WINDOWS_IN_WSL})\n`,
};

function harness(options: Options): Harness {
  const shown: Shown[] = [];
  const probed: string[][] = [];
  const executed: string[] = [];
  const clicks = [...(options.clicks ?? [])];
  const state = new Map<string, unknown>([['credsInstall.creds-mcp', { version: options.expected ?? '0.12.0' }]]);
  let clipboard = '';
  const show = (level: string) => (text: string, ...choices: string[]): Promise<string | undefined> => {
    shown.push({ level, text, choices });
    return Promise.resolve(clicks.shift());
  };
  const stub = {
    window: {
      showInformationMessage: show('info'),
      showWarningMessage: show('warning'),
      showErrorMessage: show('error'),
      withProgress: (_options: unknown, task: () => Promise<unknown>) => task(),
      showQuickPick: (items: readonly string[]) => Promise.resolve(items[0]),
    },
    env: {
      clipboard: {
        writeText: (text: string): Promise<void> => {
          clipboard = text;
          return Promise.resolve();
        },
      },
    },
    commands: {
      executeCommand: (id: string): Promise<void> => {
        executed.push(id);
        return Promise.resolve();
      },
    },
    ProgressLocation: { Notification: 15 },
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (base: { fsPath: string }, ...parts: string[]) => ({ fsPath: path.join(base.fsPath, ...parts) }),
    },
  };
  const wslProcess = {
    runningDistros: (): Promise<string[]> => Promise.resolve([...options.running]),
    runWslOutcome: (argv: readonly string[]): Promise<WslOutcome> => {
      probed.push([...argv]);
      return Promise.resolve(options.version ?? olderAnswer);
    },
    runWsl: (argv: readonly string[]): Promise<string> => Promise.resolve(wslSays(argv)),
    runWslRaw: (): Promise<Buffer> => Promise.resolve(Buffer.alloc(0)),
  };
  const mod = loadWithVscode<{
    registerWslMcpCheck(register: (id: string, h: Handler) => void, host: unknown, warn: (m: string) => void, platform: string): void;
  }>('../mcpInstallTarget', stub, { './wslProcess': wslProcess });

  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsl-mcp-check-'));
  made.push(storageDir);
  const handlers = new Map<string, Handler>();
  const store = {
    get: <T>(key: string): T | undefined => state.get(key) as T | undefined,
    update: (key: string, value: unknown): Promise<void> => {
      state.set(key, value);
      return Promise.resolve();
    },
  };
  mod.registerWslMcpCheck((id, h) => handlers.set(id, h), { storageDir, state: store }, () => undefined, 'linux');
  const handler = handlers.get('credSshManager.checkWslMcpInstall');
  assert.ok(handler, 'the command is not registered');
  return {
    run: async () => {
      await handler();
      await settle();
    },
    shown,
    probed,
    executed,
    state,
    clipboard: () => clipboard,
    storageDir,
  };
}

/** What the stand-in distribution answers: the install script, `wslpath`, `--help`. */
function wslSays(argv: readonly string[]): string {
  const words = argv.join(' ');
  if (words.includes('bash -lc')) {
    return `downloading…\ninstalled: ${LINUX}\n`;
  }
  if (words.includes('wslpath')) {
    return `${WINDOWS_IN_WSL}\n`;
  }
  return words.includes('--help') ? 'usage … CREDS_MCP_WINDOWS_BINARY …' : '';
}

/** Lets the not-awaited dialogs and their clicks finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function recordInstall(h: Harness, distro: string): void {
  h.state.set('wslMcpCheck.installs', { [distro]: { linuxBinary: LINUX, windowsBinary: WINDOWS_IN_WSL } });
}

function placeWindowsHalf(h: Harness): void {
  const rid = ridFor(process.platform, process.arch);
  assert.ok(rid, 'this test needs a platform the release matrix builds for');
  fs.mkdirSync(path.join(h.storageDir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(h.storageDir, 'bin', binaryNameFor(CREDS_MCP, rid)), '');
}

test('with no distribution running the command says so and probes nothing — it never starts a VM', async () => {
  const h = harness({ running: [] });
  recordInstall(h, 'Ubuntu');

  await h.run();

  assert.deepEqual(h.probed, [], 'a probe ran with no distribution running');
  assert.ok(h.shown[0]?.text.includes('No WSL distribution is running'), JSON.stringify(h.shown));
});

test('an older recorded install is shown with Update, Later and Not for this version', async () => {
  const h = harness({ running: ['Ubuntu'] });
  recordInstall(h, 'Ubuntu');

  await h.run();

  assert.deepEqual(h.probed, [['-d', 'Ubuntu', '-e', 'env', `CREDS_MCP_WINDOWS_BINARY=${WINDOWS_IN_WSL}`, LINUX, '--version']]);
  assert.equal(h.shown[0]?.level, 'warning');
  assert.deepEqual(h.shown[0]?.choices, ['Update', 'Later', 'Not for this version']);
  assert.ok(h.shown[0]?.text.includes('older than this window'));
});

test('"Not for this version" is remembered for the version this window ships', async () => {
  const h = harness({ running: ['Ubuntu'], clicks: ['Not for this version'] });
  recordInstall(h, 'Ubuntu');

  await h.run();

  assert.deepEqual(h.state.get('wslMcpCheck.dismissed'), { Ubuntu: '0.12.0' });
});

test('Update installs again, puts the block with the new path on the clipboard and records both paths', async () => {
  // Nothing recorded: the motivating case, a config written by hand. The command says so and offers Update.
  const h = harness({ running: ['Ubuntu'], clicks: ['Update'] });
  placeWindowsHalf(h);

  await h.run();

  assert.ok(h.shown[0]?.text.includes('has not recorded'), JSON.stringify(h.shown[0]));
  assert.ok(h.clipboard().includes(LINUX), 'the block on the clipboard does not name the new Linux binary');
  assert.ok(h.clipboard().includes(WINDOWS_IN_WSL), 'the block does not point at the Windows half');
  assert.deepEqual(h.state.get('wslMcpCheck.installs'), {
    Ubuntu: { linuxBinary: LINUX, windowsBinary: WINDOWS_IN_WSL },
  });
});

test('right after the install an older verdict is said without an Update that would reinstall the same release', async () => {
  const h = harness({ running: ['Ubuntu'], clicks: ['Update'] });
  placeWindowsHalf(h);

  await h.run();

  const afterInstall = h.shown.find((shown) => shown.text.includes('older than this window'));
  assert.ok(afterInstall, JSON.stringify(h.shown));
  assert.deepEqual(afterInstall.choices, ['Later', 'Not for this version']);
});

test('a current install, after Update, ends with the installed message naming where it goes', async () => {
  const current: WslOutcome = { kind: 'exited', code: 0, stdout: `creds-mcp 0.12.0\nwindows half: creds-mcp 0.12.0 (${WINDOWS_IN_WSL})\n` };
  const h = harness({ running: ['Ubuntu'], clicks: ['Update'], version: current });
  placeWindowsHalf(h);

  await h.run();

  assert.ok(h.shown.some((shown) => shown.level === 'info' && shown.text.includes('is installed in Ubuntu')), JSON.stringify(h.shown));
});

test('Update with no Windows half on this machine sends the person to Install the MCP Server…', async () => {
  const h = harness({ running: ['Ubuntu'], clicks: ['Update', 'Install the MCP Server…'] });

  await h.run();

  assert.deepEqual(h.executed, ['credSshManager.installMcpServer']);
});

test('a window whose own creds-mcp predates --version is sent to install first, and nothing is probed', async () => {
  const h = harness({ running: ['Ubuntu'], expected: '0.9.1', clicks: ['Install the MCP Server…'] });
  recordInstall(h, 'Ubuntu');

  await h.run();

  assert.deepEqual(h.probed, []);
  assert.ok(h.shown[0]?.text.includes('0.10.0'));
  assert.deepEqual(h.executed, ['credSshManager.installMcpServer']);
});

test('a timed-out probe is said as unanswered and offers nothing', async () => {
  const h = harness({ running: ['Ubuntu'], version: { kind: 'timeout' } });
  recordInstall(h, 'Ubuntu');

  await h.run();

  assert.ok(h.shown[0]?.text.includes('did not answer'));
  assert.deepEqual(h.shown[0]?.choices, []);
});
