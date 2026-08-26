import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { ALLOW_ONCE, ALLOW_WINDOW, DENY } from '../agentConsent';
import { EntityMetadata, TreeNode } from '../types';

/**
 * The editor's half of the SSH agent (audit A3).
 *
 * <p>The feature's entire claim is that key material lives in this object's memory and nowhere
 * else — no file with mode 0600 to be read, copied, or left behind by a crash — and that every
 * signature is answered by a human. So the tests worth having are about the gate and the
 * lifetime: a key that cannot be served says WHY, an unloaded key takes its material with it,
 * a dismissed dialog refuses that one signature and remembers nothing, and `SSH_AUTH_SOCK`
 * appears only while there is something to serve.</p>
 *
 * <p>`agentConsent.ts` decides what an answer MEANS and is tested there. What is only true
 * here is that the decision is applied — the presence signal fired, the ten-minute window
 * remembered per key, and the window never surviving the key it belongs to.</p>
 *
 * <p>The socket server is substituted, which is what makes the `confirm` callback reachable
 * through its real wiring rather than by reaching into a private method: the manager hands the
 * server that callback, so holding the server means holding the gate.</p>
 */

type Manager = typeof import('../sshAgentManager');

interface FakeServer {
  socketPath: string;
  listening: boolean;
  confirm(key: { entityId: string; name: string; fingerprint: string }, purpose: unknown): Promise<boolean>;
  keys(): unknown[];
  dispose(): void;
}

interface World {
  mod: Manager;
  server(): FakeServer | undefined;
  /** Modal answers, consumed in order; undefined means the dialog was dismissed. */
  answers: (string | undefined)[];
  dialogs: string[];
  env: Record<string, string>;
  envDescription: string;
  presence: number;
  logs: string[];
  disposals: number;
}

function realPrivateKey(): string {
  // Generated, never committed: a private key in a repository is a private key on the internet.
  const { privateKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }) as unknown as { privateKey: string };
  return privateKey;
}

function world(options: {
  keys?: Record<string, string | undefined>;
  nodes?: TreeNode[];
  answers?: (string | undefined)[];
}): World {
  let server: FakeServer | undefined;
  const w: World = {
    mod: undefined as never,
    server: (): FakeServer | undefined => server,
    answers: [...(options.answers ?? [])],
    dialogs: [],
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
        showWarningMessage: (m: string): Promise<string | undefined> => {
          w.dialogs.push(m);
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

function manager(w: World, options: { keys?: Record<string, string | undefined>; nodes?: TreeNode[] }): {
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
    instance: new w.mod.SshAgentManager(storage as never, dir, envCollection as never, () => {
      w.presence += 1;
    }),
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

function storageDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creds-agent-test-'));
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

const keyEntity = (id: string, name: string): EntityMetadata =>
  ({ id, name, kind: 'sshkey' }) as EntityMetadata;

const KEY_ID = 'key-1';

test('a key with nothing stored is refused with an instruction, not "could not load"', async () => {
  // Every reason `parseSshPrivateKey` gives is actionable; "could not load the key" is not.
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: undefined } });

  const result = await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.reason, /no private key stored/);
  assert.match(result.ok ? '' : result.reason, /key file \(which the agent cannot serve\)/);
});

test('an unparseable key names the parse failure rather than swallowing it', async () => {
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: 'not a key at all' } });

  const result = await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.reason, /cannot be served/);
});

test('a real key loads, is served, and SSH_AUTH_SOCK appears for every later terminal', async () => {
  const w = world({});
  const { instance, dir } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });

  const result = await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  assert.equal(result.ok, true);
  assert.match(result.ok ? result.fingerprint : '', /^SHA256:/);
  assert.equal(instance.isLoaded(KEY_ID), true);
  assert.equal(w.env.SSH_AUTH_SOCK, path.join(dir, 'agent-' + String(process.pid) + '.sock'));
  assert.match(w.envDescription, /CredsForDevs/);
});

test('unloading a key takes its material AND its allow-window with it', async () => {
  // A ten-minute allowance that outlived the key would apply to whatever was loaded next
  // under the same entity id.
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:x' };
  await gate.confirm(key, { kind: 'auth' });

  assert.equal(instance.unload(KEY_ID), true);
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  w.answers = [DENY];
  const allowedAgain = await (w.server() as FakeServer).confirm(key, { kind: 'auth' });

  assert.equal(allowedAgain, false, 'the window did not survive the unload');
});

test('unloading the LAST key stops the agent and removes SSH_AUTH_SOCK', async () => {
  // Leaving the variable pointing at a dead socket makes every later `ssh` hang instead of
  // falling back to its own key.
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  instance.unload(KEY_ID);

  assert.equal(w.env.SSH_AUTH_SOCK, undefined);
  assert.equal(w.disposals, 1);
});

test('unloading one of two keys leaves the agent running', async () => {
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey(), 'key-2': realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  await instance.load('a1', keyEntity('key-2', 'staging'));

  instance.unload(KEY_ID);

  assert.equal(w.env.SSH_AUTH_SOCK !== undefined, true, 'the other key is still served');
  assert.equal(instance.loadedKeys().map((k) => k.entityId).join(), 'key-2');
});

test('unloading something that was never loaded is false, not a crash', () => {
  const w = world({});
  const { instance } = manager(w, {});

  assert.equal(instance.unload('nope'), false);
});

test('every signature asks, and the dialog names the key, the fingerprint and the purpose', async () => {
  // "A key is being used" is not a decision anybody can make.
  const w = world({ answers: [ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  const allowed = await (w.server() as FakeServer).confirm(
    { entityId: KEY_ID, name: 'prod', fingerprint: 'SHA256:abc' },
    { kind: 'auth' },
  );

  assert.equal(allowed, true);
  assert.match(w.dialogs[0], /"prod"/);
  assert.match(w.dialogs[0], /SHA256:abc/);
  assert.match(w.dialogs[0], /never leaves this window/);
});

test('answering a dialog is the one provable moment of human presence', async () => {
  const w = world({ answers: [ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  await (w.server() as FakeServer).confirm({ entityId: KEY_ID, name: 'prod', fingerprint: 'f' }, { kind: 'auth' });

  assert.equal(w.presence, 1);
});

test('"allow once" is exactly once — the next signature asks again', async () => {
  const w = world({ answers: [ALLOW_ONCE, ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'f' };

  await gate.confirm(key, { kind: 'auth' });
  await gate.confirm(key, { kind: 'auth' });

  assert.equal(w.dialogs.length, 2);
});

test('the ten-minute window covers the SECOND use without a dialog', async () => {
  // `git push` signs and authenticates in one breath; two modals per push teaches people to
  // click without reading, which is worse than one they actually see.
  const w = world({ answers: [ALLOW_WINDOW] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'f' };

  await gate.confirm(key, { kind: 'auth' });
  const second = await gate.confirm(key, { kind: 'gitCommit' });

  assert.equal(second, true);
  assert.equal(w.dialogs.length, 1, 'one dialog covered both halves of the push');
});

test('the window is per KEY — it never covers a different one', async () => {
  const w = world({ answers: [ALLOW_WINDOW, DENY] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey(), 'key-2': realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  await instance.load('a1', keyEntity('key-2', 'staging'));
  const gate = w.server() as FakeServer;

  await gate.confirm({ entityId: KEY_ID, name: 'prod', fingerprint: 'f' }, { kind: 'auth' });
  const other = await gate.confirm({ entityId: 'key-2', name: 'staging', fingerprint: 'g' }, { kind: 'auth' });

  assert.equal(other, false, 'allowing one key allowed nothing else');
});

test('a DISMISSED dialog refuses this signature and remembers nothing', async () => {
  // The same rule the broker's consent follows: a mis-click must not lock a key out for the
  // window's life, and must not silently allow anything either.
  const w = world({ answers: [undefined, ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'f' };

  assert.equal(await gate.confirm(key, { kind: 'auth' }), false);
  assert.equal(await gate.confirm(key, { kind: 'auth' }), true, 'and the next use is asked, not refused');
  assert.equal(w.presence, 1, 'a dismissal proves nobody was there');
});

test('an explicit Deny refuses without remembering a refusal either', async () => {
  const w = world({ answers: [DENY, ALLOW_ONCE] });
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));
  const gate = w.server() as FakeServer;
  const key = { entityId: KEY_ID, name: 'prod', fingerprint: 'f' };

  assert.equal(await gate.confirm(key, { kind: 'auth' }), false);
  assert.equal(await gate.confirm(key, { kind: 'auth' }), true);
});

function node(id: string, sshAgent: boolean, extra: Partial<EntityMetadata> = {}): TreeNode {
  return {
    id,
    name: id,
    type: 'entity',
    details: { id, name: id, kind: 'sshkey', sshAgent, ...extra },
  } as TreeNode;
}

test('loadMarked loads only the entities that ask to be served', async () => {
  const w = world({});
  const { instance } = manager(w, {
    keys: { wanted: realPrivateKey(), unwanted: realPrivateKey() },
    nodes: [node('wanted', true), node('unwanted', false)],
  });

  assert.equal(await instance.loadMarked(), 1);
  assert.equal(instance.isLoaded('unwanted'), false);
});

test('a marked key that cannot be loaded is logged ONCE, never a modal at every window start', async () => {
  // A key that stopped being loadable would otherwise open a dialog on every single startup.
  const w = world({});
  const { instance } = manager(w, {
    keys: { broken: 'not a key' },
    nodes: [node('broken', true)],
  });

  assert.equal(await instance.loadMarked(), 0);
  assert.deepEqual(w.dialogs, []);
  assert.ok(w.logs.some((l) => /could not load "broken"/.test(l)), w.logs.join(' | '));
});

test('loadMarked does not reload what is already loaded', async () => {
  const w = world({});
  const { instance } = manager(w, {
    keys: { wanted: realPrivateKey() },
    nodes: [node('wanted', true)],
  });
  await instance.loadMarked();

  assert.equal(await instance.loadMarked(), 0, 'a sync does not re-add every key');
  assert.equal(instance.loadedKeys().length, 1);
});

test('an SSH entity pointing at a loaded KEY entity is served by the agent', async () => {
  // This is what decides whether Connect writes the key to disk or lets the agent answer.
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  const sshEntity = { id: 'ssh-1', name: 'host', type: 'entity', details: { id: 'ssh-1', sshKeyEntityId: KEY_ID } } as TreeNode;
  assert.equal(instance.servesKeyFor(sshEntity), true);
});

test('an entity with no details at all is not served', () => {
  const w = world({});
  const { instance } = manager(w, {});

  assert.equal(instance.servesKeyFor({ id: 'x', name: 'x', type: 'folder' } as TreeNode), false);
});

test('disposing drops every key — that is the whole revocation story', async () => {
  const w = world({});
  const { instance } = manager(w, { keys: { [KEY_ID]: realPrivateKey() } });
  await instance.load('a1', keyEntity(KEY_ID, 'prod'));

  instance.dispose();

  assert.deepEqual(instance.loadedKeys(), []);
  assert.equal(instance.isLoaded(KEY_ID), false);
  assert.equal(w.disposals, 1, 'and the socket is gone with it');
});
