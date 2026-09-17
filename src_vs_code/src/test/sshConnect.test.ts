import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadWithVscode } from './vscodeStub';
import { EntityMetadata } from '../types';

/**
 * The human Connect path (audit A3).
 *
 * <p>This module decides HOW a credential reaches `ssh`, and the three ways differ in what
 * they leave behind. That is the whole reason it is worth testing as a sequence rather than as
 * a result: nothing it returns tells you whether a decrypted key was written to disk, or
 * whether it was wiped afterwards.</p>
 *
 * <ul>
 *   <li><b>The agent serves the key.</b> Nothing is written at all — no `-i`, no file. Writing
 *       one anyway would defeat the feature precisely where someone could see it working.</li>
 *   <li><b>A stored key.</b> Materialised to a 0600 file, and wiped when the terminal closes.
 *       A missed wipe leaves a decrypted private key on disk for the life of the window.</li>
 *   <li><b>A password.</b> It rides the terminal's ENVIRONMENT through askpass — never a file,
 *       never the command line — and in a FRESH terminal, because reusing one would run the
 *       new session with the previous entity's credentials.</li>
 * </ul>
 *
 * <p>Its collaborators are substituted, which is what makes the sequence observable: the point
 * is not what `materializePrivateKey` does (that is `keyInstaller.test.ts`) but whether this
 * module calls it, and whether it calls `forgetMaterializedKey` afterwards.</p>
 */

type Connect = typeof import('../sshConnect');

interface Terminal {
  name: string;
  sent: string[];
  env?: Record<string, string>;
  disposed: boolean;
  exitStatus?: unknown;
}

interface World {
  mod: Connect;
  materialised: string[];
  forgotten: string[];
  /** Terminals opened through `openSshTerminal`, with the key path each was given. */
  sshTerminals: { keyPath: string | undefined; options: unknown; platform?: string; prefix?: string }[];
  created: Terminal[];
  existing: Terminal[];
  warnings: string[];
  /** The button labels each warning offered, in order. */
  offered: string[][];
  errors: string[];
  /** Fires the onDidCloseTerminal listeners with a terminal. */
  closeTerminal(t: unknown): void;
  /** What `openSshTerminal` returned — the terminal the wipe is registered against. */
  sshTerminalHandle?: unknown;
}

interface Parts {
  source: Record<string, unknown>;
  /** undefined = the host key was refused, so the connection must not proceed. */
  options?: Record<string, unknown>;
  materialiseFails?: boolean;
  /** What `openSshTerminal` hands back; undefined = it could not open one. */
  sshTerminal?: unknown;
  existingNamed?: string;
  /** What the fake distribution answers when asked where a Windows path is. */
  translated?: string;
  /** Press the button every refusal offers, so the remedy-and-retry path runs. */
  chooseButton?: boolean;
}

function world(parts: Parts): World {
  const closeListeners: ((t: unknown) => void)[] = [];
  const w: World = {
    mod: undefined as never,
    materialised: [],
    forgotten: [],
    sshTerminals: [],
    created: [],
    existing: [],
    warnings: [],
    offered: [],
    errors: [],
    closeTerminal: (t: unknown): void => closeListeners.forEach((l) => l(t)),
  };
  if (parts.existingNamed !== undefined) {
    const stale: Terminal = { name: parts.existingNamed, sent: [], disposed: false };
    Object.assign(stale, {
      dispose: (): void => {
        stale.disposed = true;
      },
    });
    w.existing.push(stale);
  }
  // The object `openSshTerminal` hands back. A test closes THIS one, because the wipe is
  // registered against it and must not fire for anybody else's terminal.
  const opened = parts.sshTerminal === undefined ? undefined : { name: 'ssh', dispose: (): void => undefined };
  w.sshTerminalHandle = opened;

  w.mod = loadWithVscode<Connect>(
    '../sshConnect',
    {
      window: {
        terminals: w.existing,
        createTerminal: (o: { name: string; env?: Record<string, string> }): Terminal => {
          const t: Terminal = { name: o.name, env: o.env, sent: [], disposed: false };
          Object.assign(t, {
            show: (): void => undefined,
            sendText: (line: string): void => {
              t.sent.push(line);
            },
            dispose: (): void => {
              t.disposed = true;
            },
          });
          w.created.push(t);
          return t;
        },
        onDidCloseTerminal: (listener: (t: unknown) => void): { dispose(): void } => {
          closeListeners.push(listener);
          return { dispose: (): void => undefined };
        },
        showWarningMessage: (m: string, ...rest: unknown[]): Promise<string | undefined> => {
          w.warnings.push(m);
          const labels = rest.filter((r): r is string => typeof r === 'string');
          w.offered.push(labels);
          // `chooseButton` presses the offered button, so the remedy-and-retry path is drivable.
          return Promise.resolve(parts.chooseButton === true ? labels[0] : undefined);
        },
        showErrorMessage: (m: string): Promise<undefined> => {
          w.errors.push(m);
          return Promise.resolve(undefined);
        },
      },
    },
    {
      './sshCredential': {
        resolveSshCredential: (): Promise<unknown> => Promise.resolve(parts.source),
      },
      './connectionOptions': {
        connectionOptions: (): Promise<unknown> => Promise.resolve(parts.options),
      },
      './keyInstaller': {
        materializePrivateKey: (_dir: string, entityId: string): string => {
          if (parts.materialiseFails === true) {
            throw new Error('disk full');
          }
          const path = `/storage/keys/${entityId}.key`;
          w.materialised.push(path);
          return path;
        },
        forgetMaterializedKey: (path: string): void => {
          w.forgotten.push(path);
        },
        writeAskpassScriptFile: (): string => '/storage/keys/askpass.sh',
      },
      './wslProcess': {
        // Never a real `wsl.exe` in a unit test. '' is the module's own "it would not say".
        translateWindowsPath: (_distro: string, windowsPath: string): Promise<string> =>
          Promise.resolve(parts.translated ?? `/mnt/c${windowsPath}`),
      },
      './terminalManager': {
        openSshTerminal: (
          entity: { sshKeyPath?: string },
          options: unknown,
          platform?: string,
          prefix?: string,
        ): unknown => {
          w.sshTerminals.push({ keyPath: entity.sshKeyPath, options, platform, prefix });
          return opened;
        },
        buildSshCommand: (entity: { host?: string }): string | undefined =>
          entity.host === undefined ? undefined : `ssh ${String(entity.host)}`,
        describeSshTarget: (entity: { host?: string }): string | undefined => entity.host,
      },
      './sshAskpass': {
        askpassEnv: (script: string, password: string): Record<string, string> => ({
          SSH_ASKPASS: script,
          SSH_ASKPASS_REQUIRE: 'force',
          CREDS_PASSWORD: password,
        }),
      },
    },
  );
  return w;
}

const entity = (extra: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: 'e1', name: 'prod', kind: 'ssh', host: 'prod.corp.com', ...extra }) as unknown as EntityMetadata;

const storage = {} as never;
const OPTIONS = { knownHostsFile: undefined };

test('when the AGENT serves the key, nothing is written to disk and no -i is passed', async () => {
  // The feature's whole claim. Writing the key out anyway would defeat it exactly where a
  // person can see it working.
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: true,
      });

  assert.deepEqual(w.materialised, [], 'no key file');
  assert.equal(w.sshTerminals.length, 1);
  assert.equal(w.sshTerminals[0].keyPath, undefined, 'and no -i for ssh to find');
});

test('a stored key is materialised and passed to the terminal', async () => {
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });

  assert.deepEqual(w.materialised, ['/storage/keys/k1.key']);
  assert.equal(w.sshTerminals[0].keyPath, '/storage/keys/k1.key');
});

test('the decrypted key is WIPED when the terminal closes', async () => {
  // A missed wipe leaves a decrypted private key on disk for the life of the window — the one
  // outcome the materialise-per-connection design exists to avoid.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    sshTerminal: {},
  });
  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });
  assert.deepEqual(w.forgotten, [], 'not while the session is alive');

  w.closeTerminal({ name: 'somebody else' });
  assert.deepEqual(w.forgotten, [], 'and not when an unrelated terminal closes');

  w.closeTerminal(w.sshTerminalHandle);

  assert.deepEqual(w.forgotten, ['/storage/keys/k1.key'], 'wiped when THIS session ends');
});

test('a terminal that could not be opened wipes the key IMMEDIATELY', async () => {
  // Otherwise the file waits for a close event that will never arrive.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    sshTerminal: undefined,
  });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });

  assert.deepEqual(w.forgotten, ['/storage/keys/k1.key']);
});

test('a key that cannot be written is reported, and no terminal is opened', async () => {
  // Opening a terminal that would prompt for a password the person does not have is worse
  // than saying what went wrong.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    materialiseFails: true,
  });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });

  assert.match(w.errors[0], /Could not write the stored key/);
  assert.deepEqual(w.sshTerminals, []);
});

test('a REFUSED host key stops before anything is written or opened', async () => {
  // Resolved before any disk write on purpose: a refused host key must cost nothing and leave
  // nothing behind.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: undefined,
  });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });

  assert.deepEqual(w.materialised, []);
  assert.deepEqual(w.sshTerminals, []);
  assert.deepEqual(w.created, []);
});

test('a key PATH on the entity is used as it is — nothing is materialised', async () => {
  const w = world({ source: { kind: 'keyPath', path: '/home/me/.ssh/id_ed25519' }, options: OPTIONS, sshTerminal: {} });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });

  assert.deepEqual(w.materialised, []);
  assert.equal(w.sshTerminals[0].keyPath, '/home/me/.ssh/id_ed25519');
});

test('a password rides the ENVIRONMENT, never the command line', async () => {
  // A password on the command line is in the process table and in the shell history of
  // everyone on the box.
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });

  assert.equal(w.created.length, 1);
  assert.equal(w.created[0].env?.CREDS_PASSWORD, 'hunter2');
  assert.ok(!w.created[0].sent.join(' ').includes('hunter2'), w.created[0].sent.join(' '));
});

test('a password session gets a FRESH terminal — an old one with that name is disposed', async () => {
  // The env carries THIS entity's password; reusing a terminal would run the new session with
  // the previous entity's credentials.
  const w = world({
    source: { kind: 'password', password: 'hunter2' },
    options: OPTIONS,
    existingNamed: 'SSH: prod.corp.com',
  });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });

  assert.equal(w.existing[0].disposed, true, 'the stale one is gone');
  assert.equal(w.created.length, 1);
});

test('without a pinned host key, accept-new is added — with one, it is NOT', async () => {
  // With SSH_ASKPASS_REQUIRE=force even the host-key question would be answered by the askpass
  // program, with the password. A pinned host needs no such question and must not have its
  // checking softened.
  const unpinned = world({ source: { kind: 'password', password: 'p' }, options: { knownHostsFile: undefined } });
  await unpinned.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });

  const pinned = world({ source: { kind: 'password', password: 'p' }, options: { knownHostsFile: '/storage/known_hosts' } });
  await pinned.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });

  assert.match(unpinned.created[0].sent[0], /StrictHostKeyChecking=accept-new/);
  assert.ok(!pinned.created[0].sent[0].includes('accept-new'), pinned.created[0].sent[0]);
});

test('a password entity with no host says so instead of starting a broken session', async () => {
  const w = world({ source: { kind: 'password', password: 'p' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity({ host: undefined }), {
        storage: storage,
        storageDir: '/storage',
      });

  assert.match(w.warnings[0], /no host configured/);
  assert.deepEqual(w.created, []);
});

test('a warning from the credential resolver is surfaced, and the connection still proceeds', async () => {
  // "This entity points at a key that no longer exists, falling back to the password" is worth
  // saying, and is not a reason to refuse the connection.
  const w = world({
    source: { kind: 'keyPath', path: '/k', warning: 'the referenced key entity is gone' },
    options: OPTIONS,
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });

  assert.match(w.warnings[0], /key entity is gone/);
  assert.equal(w.sshTerminals.length, 1, 'and it still connected');
});

test('an entity with NO credential at all still opens a terminal for an agent or a config key', async () => {
  // `ssh` may still succeed through SSH_AUTH_SOCK or ~/.ssh/config; refusing here would break
  // the setups that never stored anything in the vault.
  const w = world({ source: { kind: 'none' }, options: OPTIONS, sshTerminal: {} });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
      });

  assert.equal(w.sshTerminals.length, 1);
  assert.equal(w.sshTerminals[0].keyPath, undefined);
});

// --- the remote window, and the report this whole change came from -------------------------
//
// Reported with a screenshot: Connect SSH works from a VS Code window on Windows and, from one
// attached to WSL, posts
//   ssh -i "c:\Users\strug\...\keys\23284\<guid>.key" ubuntu@10.120.39.139
// into a bash shell, which answers "Identity file ... not accessible: No such file or directory".
// Measured on that machine: translating the path is not a fix either — /mnt/c is DrvFs without
// `metadata`, every file on it is 0777, `chmod 600` there is a silent no-op, and `ssh-keygen -y -f`
// answers "Permissions 0777 ... are too open. ... This private key will be ignored."

const WSL_NO_RELAY = {
  side: { kind: 'wsl' as const, distro: 'Ubuntu' },
  relay: { enabled: false, running: false, socket: '' },
};
const WSL_READY = {
  side: { kind: 'wsl' as const, distro: 'Ubuntu' },
  relay: { enabled: true, running: true, socket: '/run/user/1000/creds-agent.sock' },
};

// The real shape of a pin path: `materializeKnownHosts` writes into `keys/<pid>/`, and the deletion
// guard is keyed on THAT directory rather than on anything about the file's name.
const OUR_PIN = `/storage/keys/${process.pid}/known_hosts-e1`;

test('in a WSL window with a stored key and no relay, NOTHING is written and no terminal opens', async () => {
  // The report, as a test. Before the fix this materialised /storage/keys/k1.key and opened a
  // terminal carrying it — a Windows path posted into a shell that cannot read it.
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: false,
        remote: WSL_NO_RELAY,
      });

  assert.deepEqual(w.materialised, [], 'a decrypted key was written for a shell that cannot read it');
  assert.deepEqual(w.sshTerminals, [], 'a command was composed for the wrong machine');
  assert.equal(w.warnings.length, 1);
  assert.match(w.warnings[0], /CredsForDevs runs on this computer \(Windows\)/);
  assert.match(w.warnings[0], /terminal runs in WSL \(Ubuntu\)/);
});

test('the refusal offers the button that fixes the FIRST thing missing', async () => {
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: false,
        remote: WSL_NO_RELAY,
      });

  assert.deepEqual(w.offered, [['Set Up the WSL Agent Relay']]);
});

test('with the relay up and the agent serving the key, the line goes through the socket', async () => {
  // The working route: no -i, nothing on disk, and the key never enters the distribution.
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS, sshTerminal: {} });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: true,
        remote: WSL_READY,
      });

  assert.deepEqual(w.materialised, []);
  assert.equal(w.sshTerminals.length, 1);
  assert.equal(w.sshTerminals[0].keyPath, undefined, 'no -i');
  assert.equal(w.sshTerminals[0].platform, 'linux', 'composed for the shell that will parse it');
  assert.equal(
    w.sshTerminals[0].prefix,
    "env SSH_AUTH_SOCK='/run/user/1000/creds-agent.sock' ",
    'an env WORD, so fish and pwsh can run it too',
  );
});

test('a PASSWORD in a WSL window refuses before any askpass file is written', async () => {
  // The askpass helper is a script on THIS machine; no relay carries it across.
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: false,
        remote: WSL_NO_RELAY,
      });

  assert.deepEqual(w.created, [], 'no terminal, so no password in its environment');
  assert.match(w.warnings[0], /authenticates with a PASSWORD/);
  assert.deepEqual(w.offered, [['Copy the Windows Command']]);
});

test('a key PATH in a WSL window refuses rather than passing a Windows path', async () => {
  const w = world({ source: { kind: 'keyPath', path: 'C:\keys\id_ed25519' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: false,
        remote: WSL_NO_RELAY,
      });

  assert.deepEqual(w.sshTerminals, []);
  assert.match(w.warnings[0], /points at a key FILE on this computer/);
});

test('every other remote window kind refuses, naming the machine that holds the key', async () => {
  for (const remoteName of ['ssh-remote', 'dev-container', 'codespaces']) {
    const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' }, options: OPTIONS });

    await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: true,
        remote: {
      side: { kind: 'other', remoteName },
      relay: { enabled: true, running: true, socket: '/run/s.sock' },
    },
      });

    assert.deepEqual(w.materialised, [], `${remoteName} wrote a key`);
    assert.deepEqual(w.sshTerminals, [], `${remoteName} opened a terminal`);
    assert.ok(
      w.warnings[0].includes(`a remote window (${remoteName})`),
      `${remoteName} was not named: ${w.warnings[0]}`,
    );
  }
});

test('a pinned host key is translated by ASKING the distribution', async () => {
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' },
    options: { knownHostsFile: '\storage\keys\known_hosts-e1' },
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: true,
        remote: WSL_READY,
      });

  assert.equal(w.sshTerminals.length, 1);
  assert.deepEqual(w.sshTerminals[0].options, {
    knownHostsFile: '/mnt/c\storage\keys\known_hosts-e1',
  });
});

test('a refused translation deletes the file it had already written, and opens nothing', async () => {
  // `materializeKnownHosts` has written a Windows file by the time translation is attempted. A
  // connection that did not happen must leave nothing behind.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' },
    options: { knownHostsFile: OUR_PIN },
    translated: '',
  });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: true,
        remote: WSL_READY,
      });

  assert.deepEqual(w.sshTerminals, []);
  assert.deepEqual(w.forgotten, [OUR_PIN], 'the pin file was stranded');
  assert.match(w.warnings[0], /pinned/);
});

test('a known_hosts path OUTSIDE our own directory is never deleted, whatever it is called', async () => {
  // The guard is the directory we write into, not a name that merely looks like ours: an unguarded
  // delete on whatever that field holds is one refactor away from removing somebody's own file.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' },
    options: { knownHostsFile: '/home/someone/.ssh/known_hosts-e1' },
    translated: '',
  });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: true,
        remote: WSL_READY,
      });

  assert.deepEqual(w.sshTerminals, [], 'it still refused');
  assert.deepEqual(w.forgotten, [], 'it deleted a file it does not own');
});

test('a LOCAL window is untouched: the platform is the host and there is no prefix', async () => {
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' }, options: OPTIONS, sshTerminal: {} });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: false,
      });

  assert.deepEqual(w.materialised, ['/storage/keys/k1.key']);
  assert.equal(w.sshTerminals[0].platform, process.platform);
  assert.equal(w.sshTerminals[0].prefix, undefined);
});

test('THE REPORT, both halves: the same click writes a key when the window is not known to be WSL', async () => {
  // This pair is the regression evidence, kept rather than produced once by breaking the source.
  // `remote` absent is exactly the code path every caller took before this change, and it is what a
  // WSL window used to get: a decrypted key on the Windows disk and a terminal carrying its path.
  const before = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS, sshTerminal: {} });
  await before.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: false,
      });

  assert.deepEqual(before.materialised, ['/storage/keys/k1.key']);
  assert.deepEqual(before.sshTerminals.map((t) => t.keyPath), ['/storage/keys/k1.key']);

  // The same inputs, with the window identified. Nothing is written, nothing is opened.
  const after = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS, sshTerminal: {} });
  await after.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: false,
        remote: WSL_NO_RELAY,
      });

  assert.deepEqual(after.materialised, []);
  assert.deepEqual(after.sshTerminals, []);
});

test('a relay socket that cannot be quoted REFUSES rather than running ssh without the agent', async () => {
  // The worst failure this file could have had, found by a code round. `envPrefix` drops a value it
  // cannot single-quote — right for its original caller, where the relay falls back to the PATH.
  // Here the fallback would be `ssh` with no agent and no -i, which does not fail: it silently
  // authenticates with whatever keys that shell already has.
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' }, options: OPTIONS, sshTerminal: {} });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: true,
        remote: {
    side: { kind: 'wsl', distro: 'Ubuntu' },
    relay: { enabled: true, running: true, socket: "/tmp/it's/creds.sock" },
  },
      });

  assert.deepEqual(w.sshTerminals, [], 'an unprefixed ssh command was posted');
  assert.deepEqual(w.materialised, []);
  assert.match(w.warnings[0], /contains a quote/);
});

test('the remedy retries the connect exactly ONCE, however often it keeps failing', async () => {
  // The plan claimed "at most once" and nothing enforced it: the retry re-entered with a full
  // budget, so a remedy that never fixes anything could be ridden indefinitely.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' },
    options: OPTIONS,
    chooseButton: true, // the person presses it every time it is offered
  });
  const remedies: string[] = [];

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: false,
        remote: {
    ...WSL_NO_RELAY,
    runRemedy: async (action): Promise<boolean> => {
      remedies.push(action);
      return true; // it always claims to have fixed it, and never does
    },
  },
      });

  // Two modals — the first click and its one retry — and then it stops, even though the button was
  // pressed on the second one too. Without the budget this recurses until the stack gives out.
  assert.equal(w.warnings.length, 2, `modals shown: ${w.warnings.length}`);
  assert.deepEqual(remedies, ['setUpRelay', 'setUpRelay']);
  assert.deepEqual(w.materialised, [], 'and still nothing was written');
});
