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
 * Connect SSH in a window whose terminal is NOT on this machine.
 *
 * <p>Split out of <code>sshConnect.test.ts</code> when that file reached the 800-line ceiling —
 * the fixture lives in <code>sshConnectWorld.ts</code> and both files read it, so this is a move
 * and not a fork. The three routes a WSL window has, the refusals it can still produce, and the
 * two states that have to be re-read rather than remembered.</p>
 */

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

test('the machine in the heading comes from the DEPS, not from whatever runs the test', async () => {
  // The teeth for the pinned fixture, and they have to be a platform no runner can be: asserting
  // "(Windows)" cannot tell "it was handed win32" from "it read a Windows process", which is exactly
  // how the first version passed here and failed on the Ubuntu runner. macOS can be neither, so this
  // goes red the moment the value comes from the environment again.
  const w = world({ source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' }, options: OPTIONS });

  await w.mod.connectEntity('a1', entity(), {
    storage: storage,
    storageDir: '/storage',
    agentServesKey: false,
    remote: { ...WSL_NO_RELAY, hostPlatform: 'darwin' as NodeJS.Platform },
  });

  assert.match(w.warnings[0], /CredsForDevs runs on this computer \(macOS\)/);
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

// --- an adopted relay is asked before it is trusted --------------------------------------------
//
// A second window that finds the socket already served adopts it rather than declaring a working
// relay broken. Nothing then tells that window when the relay it adopted exits — its owner can close
// at any time — so `serving()` would go on advertising a socket that is gone. Raised by a review.

test('an adopted relay whose owner has gone REFUSES instead of pointing ssh at nothing', async () => {
  // The line would carry `env SSH_AUTH_SOCK=<dead>` and no `-i`, which does not fail: ssh falls back
  // to whatever keys that shell has. Refusing is the same answer an unquotable socket already gets.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' },
    options: { knownHostsFile: OUR_PIN },
    socketAlive: false,
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
    storage: storage,
    storageDir: '/storage',
    agentServesKey: true,
    remote: { ...WSL_READY, relay: { ...WSL_READY.relay, adopted: true } },
  });

  assert.deepEqual(w.sshTerminals, [], 'no terminal, so no session authenticated by accident');
  assert.match(w.warnings[0], /relay/i);
  assert.deepEqual(w.forgotten, [OUR_PIN], 'and the pin it had already written is taken back');
});

test('an adopted relay that IS still there connects, and pays one probe for it', async () => {
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' },
    options: OPTIONS,
    socketAlive: true,
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
    storage: storage,
    storageDir: '/storage',
    agentServesKey: true,
    remote: { ...WSL_READY, relay: { ...WSL_READY.relay, adopted: true } },
  });

  assert.equal(w.sshTerminals.length, 1);
  assert.equal(
    w.sshTerminals[0].prefix,
    "env SSH_AUTH_SOCK='/run/user/1000/creds-agent.sock' ",
    'the adopted socket, confirmed and then used',
  );
});

test('a relay this window STARTED is not probed — its exit already removes the entry', async () => {
  // The cost lands on the case that needs it. A `socketAlive: false` world here would refuse if the
  // probe ran, so this also proves the guard is keyed on `adopted` and not on the route.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' },
    options: OPTIONS,
    socketAlive: false,
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
    storage: storage,
    storageDir: '/storage',
    agentServesKey: true,
    remote: WSL_READY,
  });

  assert.equal(w.sshTerminals.length, 1, 'our own relay is watched, not interrogated');
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

test('an unnameable distribution CONNECTS through it, which is the whole claim', async () => {
  // Raised by a review, and it was right: `remoteRoute` returned `windowsClient` here — nothing on
  // this route is translated, so the distribution's name is not needed — and then `terminalPlatform`
  // answered `undefined` for a `problem`, and `connectEntity` refused as `not-wsl` in a WSL window.
  // The route test passed throughout: it proved the ROUTE was chosen, not that a terminal opened.
  for (const problem of ['ambiguous', 'unknown'] as const) {
    const w = world({
      source: { kind: 'storedKey', keyEntityId: 'k1', content: 'PRIVATE' },
      options: OPTIONS,
      sshTerminal: {},
    });

    await w.mod.connectEntity('a1', entity(), {
      storage: storage,
      storageDir: '/storage',
      agentServesKey: false,
      remote: { ...WSL_WINDOWS_CLIENT, side: { kind: 'wsl' as const, distro: '', problem } },
    });

    assert.equal(w.sshTerminals.length, 1, `${problem}: refused instead of connecting`);
    assert.equal(
      (w.sshTerminals[0].options as { program?: string }).program,
      '/mnt/c/Windows/System32/OpenSSH/ssh.exe',
      `${problem}: opened without naming the client`,
    );
    assert.deepEqual(w.warnings, [], `${problem}: warned about something it did fine`);
  }
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
  // A REAL Windows path, with its backslashes doubled. The first version wrote them singly — `\s`
  // and `\k` are not escapes, so JavaScript dropped them and the test round-tripped
  // `storagekeysknown_hosts-e1`, a string no Windows machine produces and the separator handling
  // never exercised. Found by a review; the answer is now pinned on both sides, what goes IN and
  // what comes back.
  const windowsPin = 'C:\\Users\\me\\AppData\\Roaming\\Code\\keys\\known_hosts-e1';
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' },
    options: { knownHostsFile: windowsPin },
    translated: '/mnt/c/Users/me/AppData/Roaming/Code/keys/known_hosts-e1',
    sshTerminal: {},
  });

  await w.mod.connectEntity('a1', entity(), {
        storage: storage,
        storageDir: '/storage',
        agentServesKey: true,
        remote: WSL_READY,
      });

  assert.equal(w.sshTerminals.length, 1);
  assert.deepEqual(
    w.translated,
    [{ distro: 'Ubuntu', windowsPath: windowsPin }],
    'the distribution was asked about the path as Windows spells it, separators and all',
  );
  assert.deepEqual(w.sshTerminals[0].options, {
    knownHostsFile: '/mnt/c/Users/me/AppData/Roaming/Code/keys/known_hosts-e1',
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

test('the retry asks the AGENT again, not only the window', async () => {
  // Raised by a review, and it is the same defect as the window snapshot one layer along: the retry
  // rebuilt `remote` and kept every other field, including `agentServesKey` read before *Add Key to
  // Agent* ran. The remedy loaded the key, the retry read the old `false`, and the refusal came back
  // naming the thing that had just been fixed.
  //
  // No Windows client in this world, deliberately: with one the second attempt would connect through
  // it and the stale answer would be invisible again — which is exactly how this survived.
  const w = world({
    source: { kind: 'storedKey', keyEntityId: 'k1', content: 'x' },
    options: OPTIONS,
    chooseButton: true,
    sshTerminal: {},
  });
  let loaded = false;

  await w.mod.connectEntity('a1', entity(), {
    storage: storage,
    storageDir: '/storage',
    agentServesKey: false,
    refreshAgentServesKey: (): boolean => loaded,
    remote: {
      ...WSL_READY,
      runRemedy: async (): Promise<boolean> => {
        loaded = true; // the remedy did what it said
        return true;
      },
    },
  });

  assert.equal(w.warnings.length, 1, 'one refusal, then the retry succeeded');
  assert.equal(w.sshTerminals.length, 1, 'the retry connected instead of refusing again');
  assert.equal(w.sshTerminals[0].keyPath, undefined, 'and through the agent, which is what was fixed');
  assert.equal(
    w.sshTerminals[0].prefix,
    "env SSH_AUTH_SOCK='/run/user/1000/creds-agent.sock' ",
    'the relay route, which is what the remedy was for',
  );
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
