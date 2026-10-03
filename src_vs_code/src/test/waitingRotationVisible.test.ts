import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import type { Memento } from 'vscode';
import * as ts from 'typescript';
import type { SlotRead } from '../pinClick';
import { fingerprintOf, holdRotated, releaseUnprotected } from '../rotationQuarantine';
import { rotationQuarantineSecretKey, secretKey } from '../secretKeys';
import type { StorageManager } from '../storageManager';
import { EntityMetadata } from '../types';
import type { UseAction } from '../useActions';
import { loadEachWithVscode } from './vscodeStub';
import { world as brokerWorld, call, share } from './brokerWorld';
import { ACCOUNT, ModalAnswer, Sinks, carried, clickVscode, memoryStorage, memoryStorages, seedEntry, sinks } from './pinWorld';

/**
 * A rotated value that waits beside an UNPROTECTED entry is used, and said, at every door
 * (`todo/PLAN_waiting_rotation_visible.md`). Over the REAL `StorageManager` with every keychain read and
 * write logged (`pinWorld.ts`), in the shape of the rotation worlds of `rotationQuarantine.test.ts`.
 *
 * <p>The rotation-quarantine plan shipped with two limits: a click on an unprotected entry used the old value
 * until the sweep released the new one, and the person was never told when a value went in without a door.
 * These are the guarantees that close them.</p>
 */

const ENTRY = 'c1';
const OLD = 'old-Password-3d9a';
const NEW = 'NEW-rotated-Password-7c1e';
const OTHER = 'CHANGED-elsewhere-Password-5e0f';
const STORE_ROTATED = 'Store the rotated one';

/**
 * An entry's metadata, TYPED: the compiler checks every field `EntityMetadata` requires, so a field added to it later
 * breaks this build instead of every test that uses the fixture (typescript doctrine §3 — no cast in a fixture).
 */
function entry(fields: Pick<EntityMetadata, 'id' | 'name'> & Partial<EntityMetadata>): EntityMetadata {
  return { isSshEnabled: false, ...fields };
}

const details = (): EntityMetadata => entry({ id: ENTRY, name: 'portal', kind: 'credential' });

/** The click's owner of an entry with no PIN mark. */
const OWNER = { id: ENTRY, name: 'portal' };

interface World {
  readonly storage: StorageManager;
  readonly s: Sinks;
  /** Every keychain key read after the setup. */
  readonly reads: string[];
  /** Every value the keychain was handed after the setup. */
  readonly written: string[];
  readonly click: typeof import('../pinClick');
}

interface WorldOptions {
  readonly live: string;
  readonly waiting: boolean;
  readonly modal: ModalAnswer[];
}

const PLAIN_WAITING: WorldOptions = { live: OLD, waiting: true, modal: [] };

/**
 * An UNPROTECTED credential entry whose slot holds `live`, with — when `waiting` — a rotated password held
 * beside it that replaced `OLD`: the rotation's unattended store failed (a keychain error), or the entry was
 * unprotected by a sync or another window after the hold.
 */
async function world(given: Partial<WorldOptions> = {}): Promise<World> {
  const options: WorldOptions = { ...PLAIN_WAITING, ...given };
  const s = sinks();
  s.modalAnswers.push(...options.modal);
  const stub = clickVscode([], s);
  const reads: string[] = [];
  const written: string[] = [];
  const storage = memoryStorage(stub, written, reads);
  await seedEntry(storage, details(), { password: options.live });
  if (options.waiting) {
    await holdRotated(storage, ACCOUNT, ENTRY, 'password', NEW, await fingerprintOf(OLD));
  }
  const [click] = loadEachWithVscode(['../pinClick'], stub) as [typeof import('../pinClick')];
  reads.length = 0;
  written.length = 0;
  return { storage, s, reads, written, click };
}

const readPassword: SlotRead = (storage, accountId, entityId) => storage.getPassword(accountId, entityId);

const slotNow = async (w: World): Promise<string | undefined> => carried(await w.storage.getPassword(ACCOUNT, ENTRY));

const stillHeld = async (w: World): Promise<boolean> => (await w.storage.heldRotations.read(ACCOUNT, ENTRY)).password !== undefined;

// ---- W1: a click on an unprotected entry with a waiting value uses the new one ----

test('Copy Password on an UNPROTECTED entry with a rotated password waiting copies the NEW one, stores it plain, and says so — no PIN box', async () => {
  const w = await world();

  const opened = await w.click.clickedSecret(w.storage, ACCOUNT, OWNER, readPassword, 'copy its password', 'password');

  assert.equal(opened.kind === 'open' && opened.value, NEW, 'the click used the password the rotation replaced');
  assert.equal(await slotNow(w), NEW, 'the entry still holds the old password after the click');
  assert.equal(await stillHeld(w), false, 'the held value survived its release');
  assert.deepEqual(await w.storage.heldRotations.listed(), [], 'the index still names a released entry');
  const said = w.s.infos.join('\n');
  assert.match(said, /The new password of "portal" from .* is now stored\./, 'the person was not told the waiting password went in');
  assert.doesNotMatch(said, /sealed/, `a plain slot was said to be sealed: ${said}`);
  assert.equal(w.s.boxes, 0, 'a PIN box was raised for an entry with no PIN');
});

test('a click opener handed the value read BEFORE its door (Connect, SSH, exec) on an unprotected entry uses the waiting value', async () => {
  const w = await world();
  const readFirst = await w.storage.getPassword(ACCOUNT, ENTRY);

  const opened = await w.click.clickOpener(w.storage, ACCOUNT, 'connect')(OWNER, readFirst, 'password');

  assert.equal(opened.kind === 'open' && opened.value, NEW, 'the opener used the password the rotation replaced');
  assert.equal(w.s.boxes, 0, 'a PIN box was raised for an entry with no PIN');
});

test('a click on an unprotected entry whose password changed after the rotation ASKS — and "Store the rotated one" is what the click uses', async () => {
  const w = await world({ live: OTHER, modal: [STORE_ROTATED] });

  const opened = await w.click.clickedSecret(w.storage, ACCOUNT, OWNER, readPassword, 'copy its password', 'password');

  assert.match(w.s.modals[0] ?? '(nothing asked)', /changed after it/, 'the conflict between the waiting password and the stored one was never asked');
  assert.equal(opened.kind === 'open' && opened.value, NEW, 'the click used the password the person had just chosen to replace');
  assert.equal(await slotNow(w), NEW);
  assert.equal(w.s.boxes, 0);
});

test('the conflict modal at a click is asked with no lease held — another window\'s sweep runs while it is open', async () => {
  let other = '(the modal never opened)';
  const w = await world({ live: OTHER });
  w.s.modalAnswers.push(async () => {
    other = await Promise.race([
      w.storage.writes.runOrSkip(() => Promise.resolve('ran'), () => 'skipped'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked behind the click'), 2_000)),
    ]);
    return undefined;
  });

  await w.click.clickedSecret(w.storage, ACCOUNT, OWNER, readPassword, 'copy its password', 'password');

  assert.equal(w.s.modals.length, 1, 'the conflict was never asked at the click');
  assert.equal(other, 'ran', 'the click held the lease across the conflict modal');
  assert.equal(await stillHeld(w), true, 'a dismissed conflict lost the waiting value');
});

test('a release that FAILS at the click keeps the waiting value — the click uses the stored password and nothing is lost', async () => {
  const w = await world();
  let attempted = 0;
  w.storage.setPassword = () => {
    attempted += 1;
    return Promise.reject(new Error('the keychain refused the write (injected)'));
  };

  const opened = await w.click.clickedSecret(w.storage, ACCOUNT, OWNER, readPassword, 'copy its password', 'password');

  assert.ok(attempted > 0, 'the setup: the click never tried to store the waiting password');
  assert.equal(opened.kind === 'open' && opened.value, OLD, 'a failed release changed what the click used');
  assert.equal(carried((await w.storage.heldRotations.read(ACCOUNT, ENTRY)).password?.value), NEW, 'the waiting password was lost when its release failed');
  assert.deepEqual(await w.storage.heldRotations.listed(), [{ accountId: ACCOUNT, entityId: ENTRY }], 'the index forgot a value that still waits');
});

test('a click on an unprotected entry with nothing waiting reads the clicked slot and nothing else — no :rotationQuarantine read', async () => {
  const w = await world({ waiting: false });

  const opened = await w.click.clickedSecret(w.storage, ACCOUNT, OWNER, readPassword, 'copy its password', 'password');

  assert.equal(opened.kind === 'open' && opened.value, OLD);
  assert.ok(!w.reads.includes(rotationQuarantineSecretKey(ACCOUNT, ENTRY)), 'an unlisted entry\'s click read the held-rotation item');
  assert.deepEqual(w.reads, [secretKey(ACCOUNT, ENTRY)], 'an unlisted entry\'s click read more than the slot it clicked');
});

// ---- W3: what the person reads about a waiting value is true of THIS entry ----

const CTX = { accountId: ACCOUNT, entityId: ENTRY, entityName: 'portal' };

/** The next `setPassword` of `storage` rejects with `reason`; every one after it works again. */
function setPasswordFailsOnce(storage: StorageManager, reason: string): void {
  const real = storage.setPassword.bind(storage);
  let failed = false;
  storage.setPassword = (...args) => {
    if (failed) {
      return real(...args);
    }
    failed = true;
    return Promise.reject(new Error(reason));
  };
}

/** Wait until `done` holds, or give up after two seconds — for what a modal nobody awaits goes on to do. */
async function eventually(done: () => Promise<boolean>): Promise<boolean> {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await done()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

/**
 * The rotation's own store on an UNPROTECTED entry whose keychain refuses the write once: the hold lands
 * beside it, and the modal at the hold is raised (shown, never awaited by the rotation).
 */
async function heldAfterAKeychainFailure(modal: ModalAnswer[] = ['Later']): Promise<World & { readonly outcome: string }> {
  const w = await world({ waiting: false, modal });
  setPasswordFailsOnce(w.storage, 'the keychain refused the write');
  const [{ storeRotated }] = loadEachWithVscode(['../rotationStore'], clickVscode([], w.s)) as [typeof import('../rotationStore')];
  const outcome = await storeRotated(w.storage, CTX, 'password', NEW, await fingerprintOf(OLD));
  return { ...w, outcome };
}

test('the modal at a hold after a KEYCHAIN failure on an unprotected entry names that failure — never a PIN — and says when the value goes in', async () => {
  const w = await heldAfterAKeychainFailure();

  assert.equal(w.outcome, 'quarantined', 'the setup: the failed store did not hold the value');
  const said = w.s.modals[0] ?? '(no modal)';
  assert.doesNotMatch(said, /protected with a PIN|until its PIN is entered/, `the person was told of a PIN nobody set: ${said}`);
  assert.match(said, /the keychain refused the write/, 'the person was not told why the new password could not be stored');
  assert.match(said, /stored the next time you use "portal", or within a minute/, 'the person was not told when the waiting password goes in');
  assert.deepEqual(w.s.modalButtons[0], ['Store it now', 'Later'], 'the button of an entry with no PIN says it asks for one');
});

test('"Store it now" at that modal stores the waiting password plain, with no PIN box, and says so', async () => {
  const w = await heldAfterAKeychainFailure(['Store it now']);

  assert.ok(await eventually(async () => (await slotNow(w)) === NEW), 'the button did not store the waiting password');
  assert.equal(w.s.boxes, 0, 'a PIN box was raised for an entry with no PIN');
  assert.ok(await eventually(() => Promise.resolve(w.s.infos.some((info) => /The new password of "portal" from .* is now stored\./.test(info)))), 'the release was not said');
});

test('the row of an entry with NO PIN names no PIN in its tooltip; a protected entry\'s row still does', () => {
  const [{ waitingHint }] = loadEachWithVscode(['../rotationWaiting'], clickVscode([], sinks())) as [typeof import('../rotationWaiting')];

  const plain = waitingHint(details(), true).tooltip.join('\n');
  const marked = waitingHint({ ...details(), pinProtected: true }, true).tooltip.join('\n');

  assert.doesNotMatch(plain, /PIN/, `the row of an entry with no PIN tells the person to enter its PIN: ${plain}`);
  assert.match(plain, /stored the next time you use the entry, or within a minute/);
  assert.match(marked, /open the entry and enter its PIN to store it/, 'a protected entry\'s row no longer says how to store the waiting value');
  assert.equal(waitingHint(details(), true).description, 'rotated password waiting');
});

// ---- W5: an agent's use of an unprotected entry stores a waiting value first (the owner's decision §9.1) ----

const DB = 'db1';
const OLD_CONN = 'mysql://app:old-password-9f2c@db-01.example.internal:3306/orders';
const NEW_CONN = 'mysql://app:HELD-rotated-77ab@db-01.example.internal:3306/orders';
const OTHER_CONN = 'mysql://app:CHANGED-elsewhere-5e0f@db-01.example.internal:3306/orders';
const DB_CTX = { accountId: ACCOUNT, entityId: DB, entityName: 'orders-db' };

const dbDetails = (): EntityMetadata => entry({ id: DB, name: 'orders-db', kind: 'db', dbType: 'mysql' });

interface AgentWorld {
  readonly storage: StorageManager;
  readonly s: Sinks;
  readonly reads: string[];
  readonly written: string[];
  /** The environment each launched database client was handed — where the connection's password travels. */
  readonly launched: string[];
  readonly query: () => Promise<unknown>;
}

/**
 * An UNPROTECTED database entry whose slot holds `live`, with — when `waiting` — a rotated connection string
 * held beside it that replaced `OLD_CONN`, and the REAL `creds_query` action over it, the client's launch
 * captured instead of spawned.
 */
async function agentWorld(live: string = OLD_CONN, waiting = true): Promise<AgentWorld> {
  const s = sinks();
  const stub = clickVscode([], s);
  const reads: string[] = [];
  const written: string[] = [];
  const launched: string[] = [];
  const storage = memoryStorage(stub, written, reads);
  await seedEntry(storage, dbDetails(), { 'database connection': live });
  if (waiting) {
    await holdRotated(storage, ACCOUNT, DB, 'dbConnection', NEW_CONN, await fingerprintOf(OLD_CONN));
  }
  const runner = { ...(require('../sshExecRunner') as object), runBounded: (_exe: string, _args: string[], _shell: boolean, options: { env?: object }) => {
    launched.push(JSON.stringify(options.env ?? {}));
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
  } };
  const [{ dbQueryAction }, quarantine, words] = loadEachWithVscode(['../agentUseActions', '../rotationQuarantine', '../rotationWaiting'], stub, { './sshExecRunner': runner }) as [
    typeof import('../agentUseActions'),
    typeof import('../rotationQuarantine'),
    typeof import('../rotationWaiting'),
  ];
  // As `extension.ts` does at activation: an agent's use that stores a waiting value is said in the door's words.
  quarantine.announceReleasesWith(storage, words.sayReleasedValues);
  const action = dbQueryAction({
    storage,
    storageDir: '/tmp/does-not-matter',
    signal: new AbortController().signal,
    acquireExecSlot: () => () => undefined,
    note: () => undefined,
    trustStore: { get: () => [], update: () => Promise.resolve() },
    applyEnv: () => Promise.resolve({ written: [], withheld: [] }),
    onPath: () => true,
  });
  reads.length = 0;
  written.length = 0;
  return { storage, s, reads, written, launched, query: () => action.run(DB_CTX, { query: 'select 1' }) };
}

const connNow = async (w: AgentWorld): Promise<string | undefined> => carried(await w.storage.getDbConnection(ACCOUNT, DB));

const heldConn = async (w: AgentWorld): Promise<string | undefined> => carried((await w.storage.heldRotations.read(ACCOUNT, DB)).dbConnection?.value);

test('an agent\'s query against an UNPROTECTED entry with a rotated connection string waiting uses the NEW one — stored plain first, the hold gone', async () => {
  const w = await agentWorld();

  await w.query();

  assert.equal(w.launched.length, 1, 'the setup: the database client was never launched');
  assert.match(w.launched[0], /HELD-rotated-77ab/, 'the agent\'s query used the connection string the rotation replaced');
  assert.equal(await connNow(w), NEW_CONN, 'the entry still holds the old connection string after the agent used it');
  assert.equal(await heldConn(w), undefined, 'the held value survived its release');
  assert.deepEqual(await w.storage.heldRotations.listed(), [], 'the index still names a released entry');
});

test('an agent\'s query when the stored connection string changed after the rotation: nothing written, the stored one used, the hold waits for the person', async () => {
  const w = await agentWorld(OTHER_CONN);

  await w.query();

  assert.match(w.launched[0] ?? '', /CHANGED-elsewhere-5e0f/, 'the agent did not use the stored connection string');
  assert.deepEqual(w.written, [], 'a conflict was resolved automatically');
  assert.equal(await heldConn(w), NEW_CONN, 'the conflicting hold was dropped without the person');
});

test('an agent\'s query against an entry with nothing waiting reads no :rotationQuarantine key', async () => {
  const w = await agentWorld(OLD_CONN, false);

  await w.query();

  assert.match(w.launched[0] ?? '', /old-password-9f2c/);
  assert.ok(!w.reads.includes(rotationQuarantineSecretKey(ACCOUNT, DB)), 'an unlisted entry\'s agent use read the held-rotation item');
});

test('a MARKED entry\'s waiting value is left to the person\'s door — an agent\'s use writes nothing', async () => {
  const w = await agentWorld();
  await w.storage.updateDetailsFields(ACCOUNT, DB, { pinProtected: true });
  w.written.length = 0;

  await w.query();

  assert.deepEqual(w.written, [], 'an agent\'s use stored a waiting value into an entry that claims a PIN');
  assert.equal(await heldConn(w), NEW_CONN);
  assert.deepEqual(w.launched, [], 'an entry that claims a PIN was used automatically');
});

test('env apply and creds:// (bindableFieldReading) on an unprotected entry with a rotated password waiting read the NEW one', async () => {
  const w = await world();
  const [{ bindableFieldReading }] = loadEachWithVscode(['../envApply'], clickVscode([], w.s)) as [typeof import('../envApply')];

  const reading = await bindableFieldReading(w.storage, ACCOUNT, details(), 'password');

  assert.deepEqual(reading, { kind: 'value', value: NEW }, 'the binding read the password the rotation replaced');
  assert.equal(await slotNow(w), NEW);
  assert.equal(await stillHeld(w), false);
});

test('the agent\'s ssh credential (the automatic opener) on an unprotected entry with a rotated password waiting is the NEW password', async () => {
  const w = await world();
  const [{ resolveSshCredential }] = loadEachWithVscode(['../sshCredential'], clickVscode([], w.s)) as [typeof import('../sshCredential')];

  const source = await resolveSshCredential(w.storage, ACCOUNT, { ...details(), kind: 'ssh', isSshEnabled: true });

  assert.equal(source.kind === 'password' && source.password, NEW, 'the agent\'s ssh login used the password the rotation replaced');
  assert.equal(await stillHeld(w), false);
});

// ---- W6: the sweep's release is said to the person (the owner's decision §9.2) ----

/** The `Memento` the sweeper's leases live in — empty, as a fresh window's is; a real one, typed by its interface. */
class Leases implements Memento {
  private readonly map = new Map<string, unknown>();

  keys(): readonly string[] {
    return [...this.map.keys()];
  }

  get<T>(key: string): T | undefined;
  get<T>(key: string, fallback: T): T;
  get<T>(key: string, fallback?: T): T | undefined {
    return this.map.has(key) ? (this.map.get(key) as T) : fallback;
  }

  update(key: string, value: unknown): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }
}

test('the sweep that stores a waiting password says so to the person, once — and a tick that stores nothing says nothing', async () => {
  const w = await world();
  // Wired as `extension.ts` wires it: the sweeper's release is `rotationWaiting.releaseAndSay`.
  const [{ EphemeralSweeper }, { releaseAndSay }] = loadEachWithVscode(['../ephemeralSweeper', '../rotationWaiting'], clickVscode([], w.s)) as [
    typeof import('../ephemeralSweeper'),
    typeof import('../rotationWaiting'),
  ];
  const lines: string[] = [];
  const sweeper = new EphemeralSweeper(w.storage, new Leases(), (line) => lines.push(line), () => undefined, () => releaseAndSay(w.storage));

  await sweeper.runOnce();

  assert.equal(await slotNow(w), NEW, 'the setup: the sweep did not store the waiting password');
  const said = w.s.infos.filter((info) => /The new password of "portal" from .* is now stored\./.test(info));
  assert.equal(said.length, 1, `the sweep stored a waiting password and the person was never told (the log alone said: ${lines.join(' | ')})`);
  assert.doesNotMatch(said[0], /sealed/);
  const before = w.s.infos.length;

  await sweeper.runOnce();

  assert.equal(w.s.infos.length, before, 'a tick that stored nothing said something');
});

// ---- the owner's follow-up (2026-10-03): the release right after a pulled sync is said too ----

/** The non-comment lines of `extension.ts` — where the window wires the release after a pulled sync. */
function extensionLines(): string[] {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8');
  return source.split(/\r?\n/).filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
}

/** The function the sync's post-pull callback releases through — the line that then refreshes the entity flags. */
function postPullRelease(): string {
  const wired = extensionLines().flatMap((line) => {
    const found = /void (\w+)\(storage\)\.finally\(\(\) => void refreshEntityFlags\(\)\)/.exec(line);
    return found === null ? [] : [found[1]];
  });
  assert.equal(wired.length, 1, 'the scan no longer finds the release in the sync\'s post-pull callback — fix the scan, not the wiring');
  return wired[0];
}

test('a sync that unprotects an entry with a waiting value releases it AND tells the person', async () => {
  const release = postPullRelease();
  // What a pulled sync leaves: the entry protected when the hold was written, unprotected by the pull.
  const w = await world();
  const [waiting] = loadEachWithVscode(['../rotationWaiting'], clickVscode([], w.s)) as [typeof import('../rotationWaiting')];
  const releases: Readonly<Record<string, (storage: StorageManager) => Promise<unknown>>> = { releaseAndSay: waiting.releaseAndSay, releaseUnprotected };
  const wiredRelease = releases[release] ?? (() => Promise.resolve(undefined));

  await wiredRelease(w.storage);

  assert.equal(release, 'releaseAndSay', `a sync that unprotects an entry with a waiting value releases it and the person is never told — extension.ts releases through ${release}`);
  assert.equal(await slotNow(w), NEW);
  assert.equal(w.s.infos.filter((info) => /The new password of "portal" from .* is now stored\./.test(info)).length, 1, 'the release after the pull was not said once');
});

test('the positive control: the scan of extension.ts still finds the sweeper\'s speaking release', () => {
  assert.ok(extensionLines().some((line) => line.includes('() => releaseAndSay(storage)')), 'the sweeper\'s wiring is no longer where the scan looks');
});

test("an agent's query that stores a waiting connection string TELLS the person — an info message, never a modal", async () => {
  const w = await agentWorld();

  await w.query();

  assert.equal(await connNow(w), NEW_CONN, "the setup: the agent's use did not store the waiting value");
  const said = w.s.infos.filter((info) => /The new connection string of "orders-db" from .* is now stored\./.test(info));
  assert.equal(said.length, 1, `the agent's query stored the waiting value and nothing was said to the person (infos: ${JSON.stringify(w.s.infos)})`);
  assert.deepEqual(w.s.modals, [], "an agent's use raised a modal — the call would wait on the person");
});

test("the window hands an agent's release its words — extension.ts registers them, or every test above is about a wiring no window makes", () => {
  assert.ok(
    extensionLines().some((line) => line.includes('announceReleasesWith(storage, sayReleasedValues)')),
    "extension.ts never hands rotationQuarantine the words for an agent's release: the person would never be told",
  );
});

test("an agent's query that stores NOTHING says nothing — a conflict, or nothing waiting", async () => {
  const conflict = await agentWorld(OTHER_CONN);
  const quiet = await agentWorld(OLD_CONN, false);

  await conflict.query();
  await quiet.query();

  assert.deepEqual([conflict.s.infos, quiet.s.infos], [[], []]);
});

// ---- the code round (2026-10-03): the words belong to ONE storage, never to the module ----

test("the words for an agent's release belong to the storage they were given to — another storage's release is never said through them", async () => {
  // Two storages and the quarantine module from ONE module graph, as one extension host has them: what a module
  // would share between them is what this test can see.
  const storages = memoryStorages(clickVscode([], sinks()), 2);
  const quarantine = require('../rotationQuarantine') as typeof import('../rotationQuarantine');
  for (const storage of storages) {
    await seedEntry(storage, dbDetails(), { 'database connection': OLD_CONN });
    await quarantine.holdRotated(storage, ACCOUNT, DB, 'dbConnection', NEW_CONN, await quarantine.fingerprintOf(OLD_CONN));
  }
  const heard: string[][] = [[], []];
  storages.forEach((storage, index) => quarantine.announceReleasesWith(storage, (released) => heard[index].push(...released.map((value) => value.entryName))));

  await quarantine.releaseBeforeAutomaticUse(storages[0], ACCOUNT, DB);

  assert.equal(carried(await storages[0].getDbConnection(ACCOUNT, DB)), NEW_CONN, 'the setup: the first storage did not release its waiting value');
  assert.deepEqual(heard, [['orders-db'], []], "the first storage's release was told through the second storage's words — the announcer is shared, not the storage's own");
});

// ---- the code round (2026-10-03): the release is in the ONE automatic opener, not at each reader ----

test('a NEW automatic reader — written here, through the common automatic opener and calling nothing else — is handed the rotated value', async () => {
  const w = await world();
  const [{ automaticOpenerFor }] = loadEachWithVscode(['../automaticRead'], clickVscode([], w.s)) as [typeof import('../automaticRead')];
  const stored = await w.storage.getPassword(ACCOUNT, ENTRY);

  const opened = await automaticOpenerFor(w.storage, ACCOUNT)(details(), stored, 'password');

  assert.equal(opened.kind === 'open' && opened.value, NEW, 'a new automatic reader was handed the password the rotation replaced');
  assert.equal(await slotNow(w), NEW);
  assert.equal(await stillHeld(w), false);
});

test('the common automatic opener on an entry with nothing waiting reads no :rotationQuarantine key and nothing beyond the slot read', async () => {
  const w = await world({ waiting: false });
  const [{ automaticOpenerFor }] = loadEachWithVscode(['../automaticRead'], clickVscode([], w.s)) as [typeof import('../automaticRead')];
  const stored = await w.storage.getPassword(ACCOUNT, ENTRY);

  const opened = await automaticOpenerFor(w.storage, ACCOUNT)(details(), stored, 'password');

  assert.equal(opened.kind === 'open' && opened.value, OLD);
  assert.deepEqual(w.reads, [secretKey(ACCOUNT, ENTRY)], 'the automatic opener read more than the slot its reader read');
});

/** Every production file that names the bare `automaticOpener` (an identifier — a comment is not a use). */
function bareOpenerUses(files: readonly { readonly name: string; readonly text: string }[]): string[] {
  return files.flatMap(({ name, text }) => {
    const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node.text === 'automaticOpener') {
        found.push(`${name}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  });
}

function productionFiles(dir: string = path.join(__dirname, '..', '..', 'src'), prefix = ''): { name: string; text: string }[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : productionFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`);
    }
    return entry.name.endsWith('.ts') ? [{ name: `${prefix}${entry.name}`, text: fs.readFileSync(path.join(dir, entry.name), 'utf8') }] : [];
  });
}

/** Where the bare opener may be named: its definition, and the one opener every automatic reader goes through. */
const BARE_OPENER_ALLOWED = new Set(['secretOpener.ts', 'automaticRead.ts']);

test('no automatic reader opens a stored value with the bare automaticOpener — every one takes automaticOpenerFor, which stores a waiting value first', () => {
  const outside = bareOpenerUses(productionFiles()).filter((use) => !BARE_OPENER_ALLOWED.has(use.split(':')[0]));

  assert.deepEqual(outside, [], 'an automatic reader opens with the bare automaticOpener — it would hand an agent the value a rotation replaced; use automaticRead.automaticOpenerFor');
});

test('the scan for the bare opener: a planted reader is reported, and the scan still finds the sanctioned use', () => {
  const planted = { name: 'newReader.ts', text: "import { automaticOpener } from './secretOpener';\nexport const read = (s: S) => automaticOpener(owner, s);" };

  assert.deepEqual(bareOpenerUses([planted]), ['newReader.ts:1', 'newReader.ts:2']);
  assert.ok(bareOpenerUses(productionFiles()).some((use) => use.startsWith('automaticRead.ts:')), 'the sanctioned use in automaticRead.ts is no longer seen — the scan matches nothing');
});

// ---- the security review (2026-10-03), fix 1: the mask table is read AFTER the waiting value went in ----

test("an agent's output that prints a password released by its own call is MASKED — the broker releases before it reads the mask table", async () => {
  // The grant the broker harness shares is a1/e1 "prod": an unprotected ssh entry with a rotated password waiting.
  const storage = memoryStorage(clickVscode([], sinks()));
  const prod = entry({ id: 'e1', name: 'prod', kind: 'ssh', isSshEnabled: true });
  await seedEntry(storage, prod, { password: OLD });
  await holdRotated(storage, ACCOUNT, 'e1', 'password', NEW, await fingerprintOf(OLD));
  const [{ maskEntriesFor }, { automaticOpenerFor }, quarantine] = loadEachWithVscode(['../maskEntries', '../automaticRead', '../rotationQuarantine'], clickVscode([], sinks())) as [
    typeof import('../maskEntries'),
    typeof import('../automaticRead'),
    typeof import('../rotationQuarantine'),
  ];
  // The window's hooks, as `extension.ts` passes them: the real masker and the real release.
  const w = brokerWorld({
    masker: (accountId, entityId) => maskEntriesFor(storage, accountId, entityId),
    hooks: { releaseWaiting: (accountId: string, entityId: string) => quarantine.releaseBeforeAutomaticUse(storage, accountId, entityId) },
  });
  // A non-mutating action that reads its password the automatic way — releasing the waiting one — and prints it.
  w.hold = async (): Promise<void> => {
    const opened = await automaticOpenerFor(storage, ACCOUNT)(prod, await storage.getPassword(ACCOUNT, 'e1'), 'password');
    w.result = { status: 200, body: { exitCode: 0, stdout: `the password is ${opened.kind === 'open' ? opened.value : '?'}\n`, stderr: '' } };
  };
  try {
    const { port, secret } = await share(w);

    const answer = await call(port, '/v1/use/exec', { token: secret, body: { command: 'echo $PW' } });

    assert.equal(carried(await storage.getPassword(ACCOUNT, 'e1')), NEW, 'the setup: the call did not release the waiting password');
    assert.ok(!JSON.stringify(answer.body).includes(NEW), `the agent's output carried the released password UNMASKED: ${JSON.stringify(answer.body)}`);
    assert.match(String(answer.body.stdout), /the password is /);
  } finally {
    w.server.dispose();
  }
});

test('the window hands the broker its release-before-the-table — or the test above is about a wiring no window makes', () => {
  assert.ok(
    extensionLines().some((line) => line.includes('releaseWaiting: (accountId, entityId) => releaseBeforeAutomaticUse(storage, accountId, entityId)')),
    'extension.ts never gives the broker releaseWaiting: an agent could print a released password the mask table never saw',
  );
});

// ---- the security review (2026-10-03), fix 2: the rotation reads what it replaces AFTER a waiting value went in ----

test("a rotation of an entry whose rotated value was waiting fingerprints the value it really replaced — no spurious conflict when its own store fails", async () => {
  const s = sinks();
  s.modalAnswers.push('Later');
  const stub = clickVscode([], s);
  const storage = memoryStorage(stub);
  await seedEntry(storage, dbDetails(), { 'database connection': OLD_CONN });
  await holdRotated(storage, ACCOUNT, DB, 'dbConnection', NEW_CONN, await fingerprintOf(OLD_CONN));
  const [{ rotateAction }, { rotationCurrent, storeRotated }, { automaticOpenerFor }, quarantine, { snapshotForRevision }, { NEW_SECRET_PLACEHOLDER }] = loadEachWithVscode(
    ['../rotateAction', '../rotationStore', '../automaticRead', '../rotationQuarantine', '../revisionSnapshot', '../secretRotation'],
    stub,
  ) as [typeof import('../rotateAction'), typeof import('../rotationStore'), typeof import('../automaticRead'), typeof import('../rotationQuarantine'), typeof import('../revisionSnapshot'), typeof import('../secretRotation')];
  const farSide: UseAction = {
    kind: 'db',
    action: 'query',
    mutatesSecrets: false,
    verb: 'run a query against',
    validate: () => ({ ok: true }),
    summarize: () => '',
    describeOutcome: () => 'ok',
    run: async () => {
      // The query reads its connection the automatic way — which stores the waiting value — and the far side
      // takes the new password. Then the rotation's own store fails (a keychain error).
      await automaticOpenerFor(storage, ACCOUNT)(dbDetails(), await storage.getDbConnection(ACCOUNT, DB), 'dbConnection');
      const real = storage.setDbConnection.bind(storage);
      storage.setDbConnection = () => {
        storage.setDbConnection = real;
        return Promise.reject(new Error('the keychain refused the write (injected)'));
      };
      return { status: 200, body: { exitCode: 0, stdout: 'ALTER\n', stderr: '' } };
    },
  };
  // The rotation's dependencies as `extension.ts` builds them — `current` is the window's own.
  const action = rotateAction(farSide, 'query', {
    generate: () => ({ ok: true, value: 'NEWER-generated-Pw-31d7', kind: 'password' }),
    entity: (ctx) => storage.getNode(ctx.accountId, ctx.entityId)?.details,
    current: (ctx, slot) => rotationCurrent(storage, ctx, slot),
    snapshot: (ctx, d) => snapshotForRevision(storage, ctx.accountId, { id: ctx.entityId, name: ctx.entityName, details: d }),
    record: (ctx, revision) => storage.recordRevision(ctx.accountId, ctx.entityId, revision),
    store: (ctx, slot, value, was) => storeRotated(storage, ctx, slot, value, was),
  });

  await action.run(DB_CTX, { statement: `ALTER USER app IDENTIFIED BY '${NEW_SECRET_PLACEHOLDER}'` });

  assert.equal(carried(await storage.getDbConnection(ACCOUNT, DB)), NEW_CONN, 'the setup: the waiting value did not go in during the rotation');
  assert.match(carried((await storage.heldRotations.read(ACCOUNT, DB)).dbConnection?.value) ?? '', /NEWER-generated/, 'the setup: the failed store did not hold the rotated value');
  const release = await quarantine.releaseHeld(storage, ACCOUNT, DB, 'orders-db', quarantine.UNATTENDED);
  assert.deepEqual(release.conflicts, [], "a spurious conflict: the hold's fingerprint was taken from the value the waiting one had already replaced");
  assert.match(carried(await storage.getDbConnection(ACCOUNT, DB)) ?? '', /NEWER-generated/);
});

test("the window's rotation reads what it replaces through rotationCurrent", () => {
  assert.ok(extensionLines().some((line) => line.includes('current: (ctx, slot) => rotationCurrent(storage, ctx, slot)')), "extension.ts's rotation reads the slot raw again");
});

// ---- the security review (2026-10-03), fix 3: a value is re-read by its SLOT, never because its text matches ----

/** An unprotected entry whose password and `slotLabel` both hold OLD, with a rotated password waiting. */
async function sameTextElsewhere(slotLabel: string): Promise<{ readonly storage: StorageManager; readonly stub: Record<string, unknown> }> {
  const stub = clickVscode([], sinks());
  const storage = memoryStorage(stub);
  await seedEntry(storage, details(), { password: OLD, [slotLabel]: OLD });
  await holdRotated(storage, ACCOUNT, ENTRY, 'password', NEW, await fingerprintOf(OLD));
  return { storage, stub };
}

test('a creds:// reference to NOTES whose text equals the replaced password answers the notes — never the released password', async () => {
  const { storage, stub } = await sameTextElsewhere('notes');
  const [{ entityFieldReading }] = loadEachWithVscode(['../entityFieldReading'], stub) as [typeof import('../entityFieldReading')];

  const reading = await entityFieldReading(storage, ACCOUNT, ENTRY, 'notes');

  assert.equal(carried(await storage.getPassword(ACCOUNT, ENTRY)), NEW, 'the setup: the waiting password did not go in');
  assert.deepEqual(reading, { kind: 'value', value: OLD }, `creds://…/notes was answered with the released PASSWORD: ${JSON.stringify(reading)}`);
});

test('a click on a CONFIG BODY whose text equals the replaced password gets the body — never the released password', async () => {
  const { storage, stub } = await sameTextElsewhere('config body');
  const [click] = loadEachWithVscode(['../pinClick'], stub) as [typeof import('../pinClick')];

  const opened = await click.clickedSecret(storage, ACCOUNT, OWNER, (s, a, e) => s.getConfigBody(a, e), 'write its config file');

  assert.equal(carried(await storage.getPassword(ACCOUNT, ENTRY)), NEW, 'the setup: the click did not release the waiting password');
  assert.equal(opened.kind === 'open' && opened.value, OLD, 'the click on the config body was handed the released PASSWORD');
});

// ---- the code round 3 (2026-10-03), finding 4: a slot that was EMPTY before the rotation ----

/** An unprotected entry with NO password, and a rotated one waiting beside it — the rotation replaced nothing. */
async function emptyBeforeTheRotation(): Promise<{ readonly storage: StorageManager; readonly stub: Record<string, unknown> }> {
  const stub = clickVscode([], sinks());
  const storage = memoryStorage(stub);
  await seedEntry(storage, details(), {});
  await holdRotated(storage, ACCOUNT, ENTRY, 'password', NEW, await fingerprintOf(undefined));
  return { storage, stub };
}

test('Copy Password on an entry whose password was EMPTY before the rotation copies the rotated password the door just stored', async () => {
  const { storage, stub } = await emptyBeforeTheRotation();
  const [click] = loadEachWithVscode(['../pinClick'], stub) as [typeof import('../pinClick')];

  const opened = await click.clickedSecret(storage, ACCOUNT, OWNER, readPassword, 'copy its password', 'password');

  assert.equal(carried(await storage.getPassword(ACCOUNT, ENTRY)), NEW, 'the setup: the door did not store the waiting password');
  assert.equal(opened.kind === 'open' && opened.value, NEW, 'the click copied nothing — "no stored password" — though the rotated password is now stored');
});

test('an automatic read of a password that was EMPTY before the rotation gets the rotated password the opener just stored', async () => {
  const { storage, stub } = await emptyBeforeTheRotation();
  const [{ automaticOpenerFor }] = loadEachWithVscode(['../automaticRead'], stub) as [typeof import('../automaticRead')];

  const opened = await automaticOpenerFor(storage, ACCOUNT)(details(), await storage.getPassword(ACCOUNT, ENTRY), 'password');

  assert.equal(carried(await storage.getPassword(ACCOUNT, ENTRY)), NEW, 'the setup: the opener did not store the waiting password');
  assert.equal(opened.kind === 'open' && opened.value, NEW, 'the automatic reader got nothing though the rotated password is now stored');
});
