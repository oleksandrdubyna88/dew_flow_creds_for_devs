import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { HIDDEN_ID, LINKED_KEY, OWN_KEY, SSH_SAYS, SecondOptions, SecondWorld, VISIBLE_NAME, secondEntryWorld } from './secondEntryWorld';

/**
 * Part C of the class test: the PATH of the key file that an agent's call writes holds no id and no name of a hidden entry (rule C of
 * `PLAN_agent_refusal_key_file_path.md`).
 *
 * <p>Part B (`agentNamesOnlyViewable.test.ts`) proves what the answers say about the entries. This part proves what they say about a FILE.
 * The SSH entry `prod` borrows the key of a hidden entry whose id reads like a name (`hid-key-8f3k2`), and the key works. The path of
 * the file written for that key reaches the agent in three ways: (a) the write fails, (b) the run fails, (c) `ssh` prints the path.
 * Each way is made on three doors: `creds_exec`, `creds_rotate` on an SSH entry, and a linked `creds_run`. Each cell reads, first,
 * that the path IS in the answer (the one positive of a file of negative assertions), then the status of today, then that the answer
 * holds no hidden id and no hidden name.</p>
 *
 * <p>No test guesses a name: a path comes from the world's own lists (`attempted`, `materialised`, `spawned`).</p>
 */

const DOORS = ['exec', 'rotate', 'run'] as const;
type CallDoor = (typeof DOORS)[number];

interface Body {
  readonly error?: { readonly code?: string; readonly message?: string };
  readonly stderr?: string;
  readonly exitCode?: number;
}

const PIN_FLAG = 'UserKnownHostsFile=';

async function inWorld(options: SecondOptions, scenario: (w: SecondWorld) => Promise<void>): Promise<void> {
  const w = await secondEntryWorld(options);
  try {
    await scenario(w);
  } finally {
    w.cleanup();
  }
}

/** The word after `-i`: the key file that `ssh` is told to read. */
const keyOf = (argv: string[]): string => argv[argv.indexOf('-i') + 1];

/** The value of `-o UserKnownHostsFile=<file>`. */
function pinOf(argv: string[]): string {
  const word = argv.find((one) => one.startsWith(PIN_FLAG));
  assert.ok(word !== undefined, `no ${PIN_FLAG} in the argv: ${argv.join(' ')}`);
  return word.slice(PIN_FLAG.length);
}

/** The texts of the world that the id of the key entry must not be a part of: it can reach the agent only through the path. */
function otherTexts(w: SecondWorld, answer: string): string[] {
  const hidden = w.hiddenNames.filter((name) => name !== w.names.key);
  return [...Object.values(VISIBLE_NAME), 'e1', 't1', 't2', 'v1', w.storageDir, OWN_KEY, LINKED_KEY, ...hidden, answer];
}

/* ---------------------------------------------------------------------------------------------------------------
 * The fixture is proved first: with no option the three calls reach ssh once each and answer 200
 * ------------------------------------------------------------------------------------------------------------- */

for (const door of DOORS) {
  test(`C, the fixture, ${door}: with no option the call reaches ssh one time and answers 200, the key entry is hidden, and its id is in no other text`, async () => {
    await inWorld({ key: 'plain' }, async (w) => {
      const result = await w.call[door]();
      const answer = JSON.stringify(result.body);
      assert.equal(result.status, 200, answer);
      assert.equal(w.spawned.length, 1);
      assert.equal(w.materialised.length, 1);
      assert.deepEqual(w.attempted, w.materialised);
      assert.ok(w.spawned[0].includes('-i'), `the key is handed to ssh: ${w.spawned[0].join(' ')}`);
      assert.equal(keyOf(w.spawned[0]), w.materialised[0]);
      assert.equal(w.mayView(HIDDEN_ID.key), false, 'the key entry is one that the agent may not view');
      assert.equal(w.mayView('e1'), true, 'the SSH entry is one that the agent may view');
      assert.ok(w.hiddenIds.includes(HIDDEN_ID.key), 'the list of hidden ids holds the id of the key entry');
      assert.deepEqual(otherTexts(w, answer).filter((text) => text.includes(HIDDEN_ID.key)), [], 'the id of the key entry is a part of another text');
    });
  });
}

/* ---------------------------------------------------------------------------------------------------------------
 * K1 — the argv
 * ------------------------------------------------------------------------------------------------------------- */

for (const door of DOORS) {
  test(`K1, ${door}: no word of the argv holds a hidden id or a hidden name, and the word after -i is the file that was written`, async () => {
    await inWorld({ key: 'plain' }, async (w) => {
      await w.call[door]();
      assert.equal(w.spawned.length, 1);
      assert.ok(w.spawned[0].includes('-i'), `the key is handed to ssh: ${w.spawned[0].join(' ')}`);
      assert.equal(keyOf(w.spawned[0]), w.materialised[0]);
      const found = w.spawned[0].flatMap((word) => w.leaks(word));
      assert.deepEqual(found, [], `${door}: the argv holds ${found.join(' and ')}: ${keyOf(w.spawned[0])}`);
    });
  });
}

/* ---------------------------------------------------------------------------------------------------------------
 * K2, K3, K4 — the three ways, on the three doors: nine cells
 * ------------------------------------------------------------------------------------------------------------- */

interface Way {
  readonly row: 'K2' | 'K3' | 'K4';
  readonly way: '(a)' | '(b)' | '(c)';
  readonly title: string;
  readonly options: SecondOptions;
  readonly status: number;
  /** The paths of the key file that the world saw: the one that the answer must show. */
  readonly paths: (w: SecondWorld) => string[];
  /** The text of the answer that the agent reads. */
  readonly text: (body: Body) => string;
  /** Whether that text shows the path. */
  readonly shows: (text: string, file: string) => boolean;
  /** The status, the code and the sentence of today. */
  readonly shape: (body: Body, text: string) => void;
}

/** (a) and (b): a refusal, `internal`, with a sentence of today that carries the path. */
const refusal =
  (sentence: string) =>
  (body: Body, text: string): void => {
    assert.equal(body.error?.code, 'internal');
    assert.ok(text.startsWith(sentence), `the sentence of today is "${sentence}…": ${text}`);
  };

const WAYS: readonly Way[] = [
  {
    row: 'K2',
    way: '(a)',
    title: 'the key cannot be written: the message holds the path that was asked, and no hidden id or name',
    options: { key: 'plain', writeFails: true },
    status: 500,
    paths: (w) => w.attempted,
    text: (body) => body.error?.message ?? '',
    shows: (text, file) => text.includes(file),
    shape: refusal('Could not write the stored key to disk: '),
  },
  {
    row: 'K3',
    way: '(b)',
    title: "ssh cannot be run: the message holds the argv, and no hidden id or name (a stand-in for the worst case: Node's own message holds no argv)",
    options: { key: 'plain', startFails: true },
    status: 500,
    paths: (w) => w.materialised,
    text: (body) => body.error?.message ?? '',
    shows: (text, file) => text.includes(file),
    shape: refusal('Could not run ssh: '),
  },
  {
    row: 'K4',
    way: '(c)',
    title: 'ssh prints the path of the key file: the stderr holds it, and no hidden id or name',
    options: { key: 'plain', sshPrints: true },
    status: 200,
    paths: (w) => w.materialised,
    text: (body) => body.stderr ?? '',
    shows: (text, file) => text.includes(SSH_SAYS.loadKey(file)) && text.includes(SSH_SAYS.notAccessible(file)),
    shape: (body) => assert.equal(body.exitCode, 255),
  },
];

/** One cell. Assertion 1 is the one positive: without it a cell can pass because the path never reached the answer. */
async function checkCell(way: Way, door: CallDoor, w: SecondWorld): Promise<void> {
  const cell = `${way.way} on ${door}`;
  const result = await w.call[door]();
  const body = result.body as Body;
  const text = way.text(body);
  const files = way.paths(w);
  assert.ok(files.length === 1 && way.shows(text, files[0]), `${cell}: the channel is not live: the answer does not hold the path of the call file (${files[0]}): ${text}`);
  assert.equal(result.status, way.status, `${cell}: ${JSON.stringify(result.body)}`);
  way.shape(body, text);
  const found = w.leaks(JSON.stringify(result.body));
  assert.deepEqual(found, [], `${cell}: the answer holds ${found.join(' and ')}: ${text}`);
}

for (const way of WAYS) {
  for (const door of DOORS) {
    test(`${way.row} ${way.way} on ${door}: ${way.title}`, async () => {
      await inWorld(way.options, (w) => checkCell(way, door, w));
    });
  }
}

/* ---------------------------------------------------------------------------------------------------------------
 * G5 — the pin file carries the id of the SSH entry of the call, which the agent may view (green before the fix and after it)
 * ------------------------------------------------------------------------------------------------------------- */

for (const door of ['exec', 'run'] as const) {
  test(`G5, ${door}: the pin file of the call carries the id of the SSH entry of the call, and the agent may view that entry`, async () => {
    await inWorld({ key: 'plain', sshPrints: true, pinned: true }, async (w) => {
      const result = await w.call[door]();
      assert.equal(result.status, 200, JSON.stringify(result.body));
      const pin = pinOf(w.spawned[0]);
      assert.ok(((result.body as Body).stderr ?? '').includes(SSH_SAYS.pin(pin)), 'the channel is live: ssh prints the pin file');
      assert.equal(path.basename(pin), 'known_hosts-e1');
      assert.equal(fs.existsSync(pin), true, 'the real writer wrote the pin file');
      assert.equal(w.mayView('e1'), true);
      assert.deepEqual(w.leaks(pin), []);
    });
  });
}
