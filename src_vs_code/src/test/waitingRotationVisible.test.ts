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
