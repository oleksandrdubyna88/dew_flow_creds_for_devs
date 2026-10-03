import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SlotRead } from '../pinClick';
import { fingerprintOf, holdRotated } from '../rotationQuarantine';
import { rotationQuarantineSecretKey, secretKey } from '../secretKeys';
import type { StorageManager } from '../storageManager';
import { EntityMetadata } from '../types';
import { loadEachWithVscode } from './vscodeStub';
import { ACCOUNT, ModalAnswer, Sinks, carried, clickVscode, memoryStorage, seedEntry, sinks } from './pinWorld';

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

const details = (): EntityMetadata => ({ id: ENTRY, name: 'portal', kind: 'credential', isSshEnabled: false }) as EntityMetadata;

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

  const opened = await w.click.clickedSecret(w.storage, ACCOUNT, OWNER, readPassword, 'copy its password');

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

  const opened = await w.click.clickOpener(w.storage, ACCOUNT, 'connect')(OWNER, readFirst);

  assert.equal(opened.kind === 'open' && opened.value, NEW, 'the opener used the password the rotation replaced');
  assert.equal(w.s.boxes, 0, 'a PIN box was raised for an entry with no PIN');
});

test('a click on an unprotected entry whose password changed after the rotation ASKS — and "Store the rotated one" is what the click uses', async () => {
  const w = await world({ live: OTHER, modal: [STORE_ROTATED] });

  const opened = await w.click.clickedSecret(w.storage, ACCOUNT, OWNER, readPassword, 'copy its password');

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

  await w.click.clickedSecret(w.storage, ACCOUNT, OWNER, readPassword, 'copy its password');

  assert.equal(w.s.modals.length, 1, 'the conflict was never asked at the click');
  assert.equal(other, 'ran', 'the click held the lease across the conflict modal');
  assert.equal(await stillHeld(w), true, 'a dismissed conflict lost the waiting value');
});

test('a release that FAILS at the click keeps the waiting value — the click uses the stored password and nothing is lost', async () => {
  const w = await world();
  let attempted = 0;
  const host = w.storage as unknown as { setPassword: () => Promise<never> };
  host.setPassword = () => {
    attempted += 1;
    return Promise.reject(new Error('the keychain refused the write (injected)'));
  };

  const opened = await w.click.clickedSecret(w.storage, ACCOUNT, OWNER, readPassword, 'copy its password');

  assert.ok(attempted > 0, 'the setup: the click never tried to store the waiting password');
  assert.equal(opened.kind === 'open' && opened.value, OLD, 'a failed release changed what the click used');
  assert.equal(carried((await w.storage.heldRotations.read(ACCOUNT, ENTRY)).password?.value), NEW, 'the waiting password was lost when its release failed');
  assert.deepEqual(await w.storage.heldRotations.listed(), [{ accountId: ACCOUNT, entityId: ENTRY }], 'the index forgot a value that still waits');
});

test('a click on an unprotected entry with nothing waiting reads the clicked slot and nothing else — no :rotationQuarantine read', async () => {
  const w = await world({ waiting: false });

  const opened = await w.click.clickedSecret(w.storage, ACCOUNT, OWNER, readPassword, 'copy its password');

  assert.equal(opened.kind === 'open' && opened.value, OLD);
  assert.ok(!w.reads.includes(rotationQuarantineSecretKey(ACCOUNT, ENTRY)), 'an unlisted entry\'s click read the held-rotation item');
  assert.deepEqual(w.reads, [secretKey(ACCOUNT, ENTRY)], 'an unlisted entry\'s click read more than the slot it clicked');
});

// ---- W3: what the person reads about a waiting value is true of THIS entry ----

const CTX = { accountId: ACCOUNT, entityId: ENTRY, entityName: 'portal' };

/** Every call of `name` on `host` after this one rejects once with `reason`, then works again. */
function failsOnce(host: object, name: string, reason: string): void {
  const target = host as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const real = target[name].bind(target);
  let failed = false;
  target[name] = (...args: unknown[]): Promise<unknown> => {
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
  failsOnce(w.storage, 'setPassword', 'the keychain refused the write');
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

const dbDetails = (): EntityMetadata => ({ id: DB, name: 'orders-db', kind: 'db', isSshEnabled: false, dbType: 'mysql' }) as EntityMetadata;

interface AgentWorld {
  readonly storage: StorageManager;
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
  const [{ dbQueryAction }] = loadEachWithVscode(['../agentUseActions'], stub, { './sshExecRunner': runner }) as [typeof import('../agentUseActions')];
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
  return { storage, reads, written, launched, query: () => action.run(DB_CTX, { query: 'select 1' }) };
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

/** A `Memento` the sweeper's leases live in — empty, as a fresh window's is. */
function leases(): { get<T>(key: string, fallback?: T): T | undefined; update(key: string, value: unknown): Promise<void> } {
  const map = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback?: T): T | undefined => (map.has(key) ? (map.get(key) as T) : fallback),
    update: (key: string, value: unknown): Promise<void> => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

test('the sweep that stores a waiting password says so to the person, once — and a tick that stores nothing says nothing', async () => {
  const w = await world();
  // Wired as `extension.ts` wires it: the sweeper's release is `rotationWaiting.releaseAndSay`.
  const [{ EphemeralSweeper }, { releaseAndSay }] = loadEachWithVscode(['../ephemeralSweeper', '../rotationWaiting'], clickVscode([], w.s)) as [
    typeof import('../ephemeralSweeper'),
    typeof import('../rotationWaiting'),
  ];
  const lines: string[] = [];
  const sweeper = new EphemeralSweeper(w.storage, leases() as never, (line) => lines.push(line), () => undefined, () => releaseAndSay(w.storage));

  await sweeper.runOnce();

  assert.equal(await slotNow(w), NEW, 'the setup: the sweep did not store the waiting password');
  const said = w.s.infos.filter((info) => /The new password of "portal" from .* is now stored\./.test(info));
  assert.equal(said.length, 1, `the sweep stored a waiting password and the person was never told (the log alone said: ${lines.join(' | ')})`);
  assert.doesNotMatch(said[0], /sealed/);
  const before = w.s.infos.length;

  await sweeper.runOnce();

  assert.equal(w.s.infos.length, before, 'a tick that stored nothing said something');
});
