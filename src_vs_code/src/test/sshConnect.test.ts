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
  sshTerminals: { keyPath: string | undefined; options: unknown }[];
  created: Terminal[];
  existing: Terminal[];
  warnings: string[];
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
        showWarningMessage: (m: string): Promise<undefined> => {
          w.warnings.push(m);
          return Promise.resolve(undefined);
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
      './terminalManager': {
        openSshTerminal: (entity: { sshKeyPath?: string }, options: unknown): unknown => {
          w.sshTerminals.push({ keyPath: entity.sshKeyPath, options });
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

  await w.mod.connectEntity('a1', entity(), storage, '/storage', true);

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

  await w.mod.connectEntity('a1', entity(), storage, '/storage');

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
  await w.mod.connectEntity('a1', entity(), storage, '/storage');
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

  await w.mod.connectEntity('a1', entity(), storage, '/storage');

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

  await w.mod.connectEntity('a1', entity(), storage, '/storage');

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

  await w.mod.connectEntity('a1', entity(), storage, '/storage');

  assert.deepEqual(w.materialised, []);
  assert.deepEqual(w.sshTerminals, []);
  assert.deepEqual(w.created, []);
});

test('a key PATH on the entity is used as it is — nothing is materialised', async () => {
  const w = world({ source: { kind: 'keyPath', path: '/home/me/.ssh/id_ed25519' }, options: OPTIONS, sshTerminal: {} });

  await w.mod.connectEntity('a1', entity(), storage, '/storage');

  assert.deepEqual(w.materialised, []);
  assert.equal(w.sshTerminals[0].keyPath, '/home/me/.ssh/id_ed25519');
});

test('a password rides the ENVIRONMENT, never the command line', async () => {
  // A password on the command line is in the process table and in the shell history of
  // everyone on the box.
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), storage, '/storage');

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

  await w.mod.connectEntity('a1', entity(), storage, '/storage');

  assert.equal(w.existing[0].disposed, true, 'the stale one is gone');
  assert.equal(w.created.length, 1);
});

test('without a pinned host key, accept-new is added — with one, it is NOT', async () => {
  // With SSH_ASKPASS_REQUIRE=force even the host-key question would be answered by the askpass
  // program, with the password. A pinned host needs no such question and must not have its
  // checking softened.
  const unpinned = world({ source: { kind: 'password', password: 'p' }, options: { knownHostsFile: undefined } });
  await unpinned.mod.connectEntity('a1', entity(), storage, '/storage');

  const pinned = world({ source: { kind: 'password', password: 'p' }, options: { knownHostsFile: '/storage/known_hosts' } });
  await pinned.mod.connectEntity('a1', entity(), storage, '/storage');

  assert.match(unpinned.created[0].sent[0], /StrictHostKeyChecking=accept-new/);
  assert.ok(!pinned.created[0].sent[0].includes('accept-new'), pinned.created[0].sent[0]);
});

test('a password entity with no host says so instead of starting a broken session', async () => {
  const w = world({ source: { kind: 'password', password: 'p' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity({ host: undefined }), storage, '/storage');

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

  await w.mod.connectEntity('a1', entity(), storage, '/storage');

  assert.match(w.warnings[0], /key entity is gone/);
  assert.equal(w.sshTerminals.length, 1, 'and it still connected');
});

test('an entity with NO credential at all still opens a terminal for an agent or a config key', async () => {
  // `ssh` may still succeed through SSH_AUTH_SOCK or ~/.ssh/config; refusing here would break
  // the setups that never stored anything in the vault.
  const w = world({ source: { kind: 'none' }, options: OPTIONS, sshTerminal: {} });

  await w.mod.connectEntity('a1', entity(), storage, '/storage');

  assert.equal(w.sshTerminals.length, 1);
  assert.equal(w.sshTerminals[0].keyPath, undefined);
});
