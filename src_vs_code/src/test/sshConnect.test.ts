import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OPTIONS,
  OUR_PIN,
  WSL_NO_RELAY,
  WSL_READY,
  WSL_WINDOWS_CLIENT,
  entity,
  storage,
  world,
} from './sshConnectWorld';

/**
 * The human Connect path (audit A3): WHICH credential reaches ssh, and what each way leaves behind.
 *
 * <p>Tested as a SEQUENCE rather than as a result, because nothing this module returns tells you
 * whether a decrypted key was written to disk or whether it was wiped afterwards. Its collaborators
 * are substituted in <code>sshConnectWorld.ts</code>, which is what makes the sequence observable:
 * the point is not what <code>materializePrivateKey</code> does but whether this module calls it.</p>
 */



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


// The real shape of a pin path: `materializeKnownHosts` writes into `keys/<pid>/`, and the deletion
// guard is keyed on THAT directory rather than on anything about the file's name.

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

test('a key PATH in a WSL window refuses when there is no Windows client to hand it to', async () => {
  const w = world({ source: { kind: 'keyPath', path: 'C:\\keys\\id_ed25519' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: false,
        remote: WSL_NO_RELAY,
      });

  assert.deepEqual(w.sshTerminals, []);
  assert.match(w.warnings[0], /points at a key FILE on this computer/);
});

// --- the Windows client, launched from the distribution's shell -------------------------------
//
// What the three tests above describe is a machine with no Windows OpenSSH installed. With one —
// which is every Windows 10/11 since 2018 — the same clicks connect instead of refusing, because
// `ssh.exe` reads the key where it already is, under the Windows ACLs that make its permissions
// real. The key never enters the distribution on this route either; it never leaves Windows at all.


test('a stored key the agent cannot serve is handed to the WINDOWS client, spelled the Windows way', async () => {
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
    storage: storage,
    storageDir: '/storage',
    agentServesKey: false,
    remote: WSL_WINDOWS_CLIENT,
  });

  assert.deepEqual(w.materialised, ['/storage/keys/k1.key'], 'written where ssh.exe can read it');
  assert.equal(w.sshTerminals.length, 1);
  assert.equal(w.sshTerminals[0].keyPath, '/storage/keys/k1.key', 'NOT translated — this client reads Windows paths');
  assert.equal(
    (w.sshTerminals[0].options as { program?: string }).program,
    '/mnt/c/Windows/System32/OpenSSH/ssh.exe',
    'the line SAYS which client it is, rather than leaving it to the PATH',
  );
  assert.equal(
    w.sshTerminals[0].platform,
    'linux',
    'the SHELL is still bash — only the client is Windows, and conflating the two is the whole defect',
  );
  assert.deepEqual(w.warnings, [], 'an ordinary connection says nothing');
});

test('the agent is NOT trusted on this route, however loaded it is', async () => {
  // `agentServesKey` is a fact about the agent the extension host can reach. A Windows ssh.exe
  // launched from bash reaches SSH_AUTH_SOCK only if WSLENV names it, which nothing here does — so
  // dropping `-i` would hand the connection to whatever the Windows agent happened to hold.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
    storage: storage,
    storageDir: '/storage',
    agentServesKey: true,
    remote: WSL_WINDOWS_CLIENT,
  });

  assert.equal(w.sshTerminals.length, 1);
  assert.equal(w.sshTerminals[0].keyPath, '/storage/keys/k1.key', 'this entity’s key, named');
});

test('a pinned host key is NOT translated for a client that cannot open a /mnt/c path', async () => {
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: { knownHostsFile: OUR_PIN },
    sshTerminal: {},
    translated: '/mnt/c/storage/known_hosts',
  });

  await w.mod.connectEntity('a1', entity(), {
    storage: storage,
    storageDir: '/storage',
    agentServesKey: false,
    remote: WSL_WINDOWS_CLIENT,
  });

  assert.equal(w.sshTerminals.length, 1);
  assert.equal(
    (w.sshTerminals[0].options as { knownHostsFile?: string }).knownHostsFile,
    OUR_PIN,
    'asking the distribution would have produced exactly the path this client cannot open',
  );
  assert.deepEqual(w.forgotten, [], 'and nothing was taken back, because nothing was refused');
});

test('a key PATH goes straight to it — that path was already what this client wanted', async () => {
  const w = world({
    source: { kind: 'keyPath', path: 'C:\\keys\\id_ed25519' },
    options: OPTIONS,
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
    storage: storage,
    storageDir: '/storage',
    agentServesKey: false,
    remote: WSL_WINDOWS_CLIENT,
  });

  assert.deepEqual(w.materialised, [], 'nothing to materialise; the file is already there');
  assert.equal(w.sshTerminals.length, 1);
  assert.equal(w.sshTerminals[0].keyPath, 'C:\\keys\\id_ed25519');
});

test('a PASSWORD still refuses, Windows client or not', async () => {
  const w = world({ source: { kind: 'password', password: 'hunter2' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), {
    storage: storage,
    storageDir: '/storage',
    agentServesKey: false,
    remote: WSL_WINDOWS_CLIENT,
  });

  assert.deepEqual(w.created, [], 'no terminal, so no password in its environment');
  assert.match(w.warnings[0], /authenticates with a PASSWORD/);
});

test('a port forward is CONNECTED and said out loud, because its meaning changed', async () => {
  // `-L 5432:db:5432` binds on the CLIENT, and the client is now a Windows process: the listening
  // socket is Windows's, so `localhost:5432` typed into this very terminal does not reach it.
  // A refusal would take away a connection that works; silence would cost somebody an afternoon.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
    options: OPTIONS,
    sshTerminal: {},
  });

  await w.mod.connectEntity(
    'a1',
    entity({ portForwards: [{ kind: 'local', bindPort: 5432, host: 'db', hostPort: 5432 }] } as never),
    {
      storage: storage,
      storageDir: '/storage',
      agentServesKey: false,
      remote: WSL_WINDOWS_CLIENT,
    },
  );

  assert.equal(w.sshTerminals.length, 1, 'a note, not a refusal');
  assert.equal(w.warnings.length, 1);
  assert.match(w.warnings[0], /binds on WINDOWS/);
  assert.deepEqual(w.offered, [[]], 'and no button, because there is nothing to press');
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
