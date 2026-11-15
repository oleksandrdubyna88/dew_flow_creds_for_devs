import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ConnectOptions } from '../sshConnect';
import type { EntityMetadata } from '../types';
import {
  ACCOUNT_ID,
  CALL_KEY_FILE,
  E1_IN_FOLDER,
  FOLDER,
  LINKED_KEY_ID,
  LINKED_KEY_NAME,
  LINKED_KEY_NODE,
  LINKED_SOURCE,
  LOCAL_LINUX,
  OPTIONS,
  SSH_TITLE,
  connectBase,
  entity,
  keyLeaks,
  lastPart,
  storageWith,
  world,
  writtenCallKey,
} from './sshConnectWorld';
import type { Parts, Terminal, World } from './sshConnectWorld';

/**
 * N17: the key file of a terminal has a call name (`PLAN_open_terminal_key_file_name.md`, E1.S1).
 *
 * <p>The line that Connect and an agent's `creds_open_terminal` type into a terminal names the key file after `-i`. When the SSH
 * entry borrows the key of a linked key entry, a file named from that entry's id would put the id into a text that an agent can
 * read. These tests run the REAL `openSshTerminal` and `buildSshCommand` (`realTerminal`), so the text they read is the text that
 * is typed, and they read the path from the list of written files, never from a name they typed themselves.</p>
 */

const linked = (): EntityMetadata => entity({ sshKeyEntityId: LINKED_KEY_ID });
const linkedStorage = (): ReturnType<typeof storageWith> => storageWith(E1_IN_FOLDER, FOLDER, LINKED_KEY_NODE);
const linkedWorld = (extra: Partial<Parts> = {}): World => world({ source: LINKED_SOURCE, options: OPTIONS, realTerminal: true, ...extra });
/** The options of the agent's `creds_open_terminal` (`sshUseActions.ts:382-392`), in a local window with a pinned shell. */
const connect = (extra: Partial<ConnectOptions> = {}): ConnectOptions => ({
  ...connectBase(),
  storage: linkedStorage(),
  storageDir: '/storage',
  agentServesKey: false,
  remote: LOCAL_LINUX,
  startGate: new AbortController().signal,
  ...extra,
});
/** The written key files that nobody has forgotten yet, in the order of their writes. */
const kept = (w: World): string[] => w.materialised.filter((file) => !w.forgotten.includes(file));

test('FX, the fixture of N17: the key entry is in the world under an id that reads like a name, and its id and name are in no other text of the world', () => {
  assert.notEqual(LINKED_KEY_ID, linked().id);
  assert.equal(linked().sshKeyEntityId, LINKED_SOURCE.keyEntityId);
  assert.equal(linkedStorage().getNode(ACCOUNT_ID, LINKED_KEY_ID)?.name, LINKED_KEY_NAME, 'the name is in the storage that the product reads');
  const others = ['/storage', SSH_TITLE, ACCOUNT_ID, FOLDER.name, LINKED_SOURCE.content, linked().id, linked().name, linked().host as string];
  for (const text of others) {
    assert.deepEqual(keyLeaks(text), [], `the fixture text ${text} holds the id or the name of the linked key entry`);
  }
  assert.deepEqual(keyLeaks(LINKED_KEY_ID), [LINKED_KEY_ID], 'the reader finds an id');
  assert.deepEqual(keyLeaks(`x ${LINKED_KEY_NAME} y`), [LINKED_KEY_NAME], 'the reader finds a name');
});

test('T-N17b: the line typed into the terminal names the written key file after -i, and holds no id and no name of the linked key entry', async () => {
  const w = linkedWorld();

  const opened = await w.mod.connectEntity(ACCOUNT_ID, linked(), connect());

  assert.equal(opened, true);
  assert.equal(w.created.length, 1);
  assert.equal(w.created[0].sent.length, 1);
  assert.equal(w.materialised.length, 1);
  const written = w.materialised[0];
  const line = w.created[0].sent[0];
  assert.ok(line.includes(`-i "${written}"`), `T-N17b: the typed line does not name the written key file (${written}): ${line}`);
  const found = keyLeaks(line);
  assert.deepEqual(found, [], `T-N17b: the typed line holds ${found.join(' and ')}: ${line}`);
  assert.deepEqual(keyLeaks(w.created[0].name), [], 'the tab');
  assert.match(lastPart(written), CALL_KEY_FILE);
});

test('T-N17c: two Connects of one entry, each with its own terminal, write two call-named files, and each close forgets its own file only', async () => {
  const w = linkedWorld();
  const options = connect();

  await w.mod.connectEntity(ACCOUNT_ID, linked(), options);
  const first = w.created[0];
  first.exitStatus = { code: 0 };
  await w.mod.connectEntity(ACCOUNT_ID, linked(), options);

  assert.equal(w.created.length, 2);
  const second = w.created[1];
  assert.notEqual(first, second);
  assert.equal(first.sent.length, 1);
  assert.equal(second.sent.length, 1);
  assert.equal(w.materialised.length, 2);
  assert.equal(new Set(w.materialised).size, 2, `T-N17c: two Connects of one entry wrote one path: ${w.materialised.join(', ')}`);
  const [a, b] = w.materialised;
  assert.ok(first.sent[0].includes(`-i "${a}"`), `the first line names its own path ${a}: ${first.sent[0]}`);
  assert.ok(second.sent[0].includes(`-i "${b}"`), `the second line names its own path ${b}: ${second.sent[0]}`);
  for (const text of [first.sent[0], second.sent[0], first.name, second.name]) {
    assert.deepEqual(keyLeaks(text), [], `T-N17c: ${text}`);
  }
  assert.match(lastPart(a), CALL_KEY_FILE);
  assert.match(lastPart(b), CALL_KEY_FILE);
  assert.deepEqual(
    w.forgotten,
    [],
    `T-N17c: the key of the terminal that replaced an ended one was forgotten before a close: ${w.forgotten.join(', ')}`,
  );
  assert.equal(w.closeListenerCount(), 2);

  w.closeTerminal(first);
  assert.deepEqual(w.forgotten, [a]);
  assert.equal(w.closeListenerCount(), 1);

  w.closeTerminal(second);
  assert.deepEqual(w.forgotten, [a, b]);
  assert.equal(w.closeListenerCount(), 0);
});

test('G1: a second Connect of a live session opens no terminal and types nothing, and its key file is forgotten at once; the first file stays until the terminal closes', async () => {
  const w = linkedWorld();
  const options = connect();

  await w.mod.connectEntity(ACCOUNT_ID, linked(), options);
  assert.deepEqual(w.forgotten, [], 'G1: the key of a NEW terminal is kept');
  assert.equal(w.closeListenerCount(), 1);

  await w.mod.connectEntity(ACCOUNT_ID, linked(), options);

  assert.equal(w.created.length, 1);
  assert.equal(w.created[0].sent.length, 1);
  assert.equal(w.materialised.length, 2);
  assert.equal(new Set(w.materialised).size, 2);
  const [a, b] = w.materialised;
  assert.ok(w.created[0].sent[0].includes(`-i "${a}"`), `G1: the live line does not name the first file (${a}): ${w.created[0].sent[0]}`);
  assert.deepEqual(
    w.forgotten,
    [b],
    `G1: the key file of a Connect that reused a live terminal was not forgotten at once; kept: ${kept(w).join(', ')}`,
  );
  assert.equal(w.closeListenerCount(), 1, 'G1: a reused terminal got one more close listener');

  w.closeTerminal({ name: 'somebody else' });
  assert.deepEqual(w.forgotten, [b]);
  assert.equal(w.closeListenerCount(), 1);

  w.closeTerminal(w.created[0]);
  assert.deepEqual(w.forgotten, [b, a]);
  assert.equal(w.closeListenerCount(), 0);
});

test('G2: five calls on one live terminal leave one key file and one close listener', async () => {
  const w = linkedWorld();
  const options = connect();

  for (let call = 0; call < 5; call += 1) {
    await w.mod.connectEntity(ACCOUNT_ID, linked(), options);
  }

  assert.equal(w.created.length, 1);
  assert.equal(w.created[0].sent.length, 1);
  assert.equal(w.materialised.length, 5);
  assert.deepEqual(kept(w), [w.materialised[0]], `G2: 5 calls on one live terminal left ${kept(w).length} key files: ${kept(w).join(', ')}`);
  assert.equal(w.closeListenerCount(), 1);

  w.closeTerminal(w.created[0]);

  assert.deepEqual(kept(w), []);
  assert.equal(w.forgotten.length, 5);
  assert.equal(w.closeListenerCount(), 0);
});

test('G3: three Connects that overlap open one terminal, and the one key file that is left is the file that its line names', async () => {
  let arrived = 0;
  let createdWhenAllArrived = -1;
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const w = linkedWorld({
    lookupGate: gate,
    duringLookup: () => {
      arrived += 1;
      if (arrived === 3) {
        createdWhenAllArrived = w.created.length;
        open();
      }
    },
  });
  const options = connect();

  const opened = await Promise.all([1, 2, 3].map(() => w.mod.connectEntity(ACCOUNT_ID, linked(), options)));

  assert.deepEqual(opened, [true, true, true]);
  assert.equal(createdWhenAllArrived, 0, 'G3: the three Connects were all inside prepare before a terminal existed');
  assert.equal(w.created.length, 1);
  assert.equal(w.created[0].sent.length, 1);
  assert.equal(w.materialised.length, 3);
  assert.equal(new Set(w.materialised).size, 3);
  const named = w.materialised.filter((file) => w.created[0].sent[0].includes(`-i "${file}"`));
  assert.equal(named.length, 1);
  assert.deepEqual(
    kept(w),
    named,
    `G3: 3 Connects at once left ${kept(w).length} key files (the typed line names ${named[0]}): ${kept(w).join(', ')}`,
  );
  assert.equal(w.closeListenerCount(), 1);

  w.closeTerminal(w.created[0]);

  assert.deepEqual(kept(w), []);
  assert.equal(w.forgotten.length, 3);
  assert.equal(w.closeListenerCount(), 0);
});

test('G4: another terminal in the window changes nothing: the key of a new terminal is kept until its own terminal closes', async () => {
  const w = linkedWorld();
  const foreign: Terminal = { name: 'somebody else', sent: [], disposed: false };
  w.existing.push(foreign);

  await w.mod.connectEntity(ACCOUNT_ID, linked(), connect());

  assert.equal(w.created.length, 1);
  assert.equal(w.created[0].sent.length, 1);
  const a = writtenCallKey(w);
  assert.deepEqual(
    w.forgotten,
    [],
    `G4: another terminal was in the window, and the key of the NEW terminal was forgotten: ${w.forgotten.join(', ')}`,
  );
  assert.equal(w.closeListenerCount(), 1);

  w.closeTerminal(foreign);
  assert.deepEqual(w.forgotten, []);
  assert.equal(w.closeListenerCount(), 1);

  w.closeTerminal(w.created[0]);
  assert.deepEqual(w.forgotten, [a]);
  assert.equal(w.closeListenerCount(), 0);
});

test("FX-D, the world's key writer: the key file is under the folder that the product handed to the writer", async () => {
  const w = linkedWorld();

  await w.mod.connectEntity(ACCOUNT_ID, linked(), connect({ storageDir: '/elsewhere' }));

  assert.equal(w.materialised.length, 1);
  const written = w.materialised[0];
  assert.ok(
    written.startsWith('/elsewhere/keys/'),
    `FX-D: the key file is not under the folder that the product handed to the writer (/elsewhere): ${written}`,
  );
  assert.match(lastPart(written), CALL_KEY_FILE);
  assert.ok(w.created[0].sent[0].includes(`-i "${written}"`));
});

test("FX-L, the close event of the world: a listener that was disposed hears no later close", async () => {
  const w = linkedWorld();
  await w.mod.connectEntity(ACCOUNT_ID, linked(), connect());
  const a = writtenCallKey(w);

  w.closeTerminal(w.created[0]);
  assert.deepEqual(w.forgotten, [a]);

  w.closeTerminal(w.created[0]);
  assert.deepEqual(w.forgotten, [a], `FX-L: a listener that was disposed heard a later close: ${w.forgotten.join(', ')}`);
});

test("T-N17d: the dialog of a key that could not be written names the call-named file, and holds no id and no name of the linked key entry", async () => {
  const w = linkedWorld({ materialiseFails: true });

  const opened = await w.mod.connectEntity(ACCOUNT_ID, linked(), connect());

  assert.equal(opened, false);
  assert.deepEqual(w.created, []);
  assert.deepEqual(w.materialised, []);
  assert.equal(w.errors.length, 1);
  const text = w.errors[0];
  assert.match(text, /^Could not write the stored key to disk: /);
  const named = /open '([^']+)'/.exec(text);
  assert.notEqual(
    named,
    null,
    `T-N17d: the dialog does not name the file that could not be written, as the text of the operating system does: ${text}`,
  );
  const found = keyLeaks(text);
  assert.deepEqual(found, [], `T-N17d: the dialog holds ${found.join(' and ')}: ${text}`);
  assert.match(lastPart((named as RegExpExecArray)[1]), CALL_KEY_FILE);
});
