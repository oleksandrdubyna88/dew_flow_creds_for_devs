import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lockSecret } from '../secretEnvelope';
import { openedText } from '../pinAdmission';
import { protectEntity } from '../entityPin';
import { forgetAllPins, grantCount, grantPin, grantedPin } from '../pinSession';
import { StorageManager } from '../storageManager';
import { KEY_ID, RECIPIENT, TEAM_MEMBER, World, loaded, ui, world } from './shareWorld';

/**
 * The holes a code round found in the PIN work, each with the test that would have caught it.
 *
 * <p>Written before the fixes and watched failing, which is the only way to know a regression test
 * has teeth. Each one names the reviewer's finding it belongs to.</p>
 */

const ACCOUNT = 'acct-1';
const PIN = 'correct-horse-battery';

let lockedValue: Promise<string> | undefined;
const locked = (): Promise<string> => (lockedValue ??= lockSecret('hunter2', ACCOUNT, PIN));

/**
 * A CORRUPT envelope must not travel as text.
 *
 * <p>The finding: `openedText` special-cased `locked` only, so envelope-shaped text that will not
 * parse fell through and was RETURNED — which puts `{"v":1,"lock":…}` in the notes box, in the
 * connection string the viewer displays, and into a share payload. The envelope's own contract
 * separates "mine and damaged" from "not mine" precisely so this cannot happen.</p>
 */
test('a CORRUPT envelope is withheld, never handed on as if it were the value', async () => {
  const damaged = '{"v":1,"lock":{"wrap":{}}}';

  const out = await openedText(damaged, {
    accountId: ACCOUNT,
    entityId: 'e1',
    entryName: 'prod-db',
    ask: () => assert.fail('a damaged wrap is not a PIN question'),
  });

  assert.equal(out, undefined, 'the viewer shows nothing rather than ciphertext');
});

test('an ordinary value and a locked one still pass through as before', async () => {
  const gate = {
    accountId: ACCOUNT,
    entityId: 'e1',
    entryName: 'prod-db',
    ask: () => Promise.resolve(PIN),
  };
  forgetAllPins();

  assert.equal(await openedText('plain notes', gate), 'plain notes');
  assert.equal(await openedText(await locked(), gate), 'hunter2');
  assert.equal(await openedText(undefined, gate), undefined);
});

/**
 * A grant belongs to an entry IN AN ACCOUNT.
 *
 * <p>The finding: the session Map was keyed by entity id alone. Ids are UUIDs, so a collision is not
 * an accident — but a RESTORE puts one id into two profiles, which this repository already has a
 * test for elsewhere ("the flag is scoped to the account, because a restore can put one id into two
 * profiles"). A grant that crosses that boundary opens one profile's entry with another's PIN.</p>
 */
test('a grant is scoped to the ACCOUNT as well as the entry', () => {
  forgetAllPins();

  grantPin(ACCOUNT, 'e1', 'pin-for-a');

  assert.equal(grantedPin(ACCOUNT, 'e1'), 'pin-for-a');
  assert.equal(grantedPin('acct-2', 'e1'), undefined, 'the same id in another profile is another entry');
  assert.equal(grantCount(), 1);
});

test('forgetting one account’s grant leaves the other account’s', () => {
  forgetAllPins();
  grantPin(ACCOUNT, 'e1', 'pin-for-a');
  grantPin('acct-2', 'e1', 'pin-for-b');

  assert.equal(grantCount(), 2, 'they are two grants, not one');
});

/**
 * An empty PIN is not a PIN.
 *
 * <p>The finding: `protectEntity` is exported and pure, and would happily wrap every slot under `''`.
 * The input box validates, but a validator is not a guarantee about a function — and the failure is
 * the cruellest shape available: the entry locks, and every later attempt to open it is answered
 * "that PIN does not open this entry", which is true and useless.</p>
 */
test('protecting with an EMPTY pin is refused, and nothing is written', async () => {
  const held = new Map<string, string>([['password', 'hunter2']]);
  const storage = vaultOver(held);

  await assert.rejects(
    () => protectEntity(storage, ACCOUNT, 'e1', ''),
    /pin/i,
    'it says what was wrong rather than locking the entry under nothing',
  );
  assert.equal(held.get('password'), 'hunter2', 'byte-identical — nothing was touched');
});

test('protecting with a real pin still works', async () => {
  const held = new Map<string, string>([['password', 'hunter2']]);

  await protectEntity(vaultOver(held), ACCOUNT, 'e1', PIN);

  assert.notEqual(held.get('password'), 'hunter2');
});

/** The nine slots over one Map, which is all `protectEntity` touches. */
function vaultOver(held: Map<string, string>): StorageManager {
  const get = (label: string) => Promise.resolve(held.get(label));
  const set = (label: string, value: string): Promise<void> => {
    held.set(label, value);
    return Promise.resolve();
  };
  return {
    getNotes: () => get('notes'),
    setNotes: (_a: string, _e: string, v: string) => set('notes', v),
    getFieldsRaw: () => get('fields'),
    setFieldsRaw: (_a: string, _e: string, v: string) => set('fields', v),
    getPaymentRaw: () => get('payment'),
    setPaymentRaw: (_a: string, _e: string, v: string) => set('payment', v),
    getConfigBody: () => get('config'),
    setConfigBody: (_a: string, _e: string, v: string) => set('config', v),
    getDbConnection: () => get('db'),
    setDbConnection: (_a: string, _e: string, v: string) => set('db', v),
    getVpnConfig: () => get('vpn'),
    setVpnConfig: (_a: string, _e: string, v: string) => set('vpn', v),
    getTotp: () => get('totp'),
    setTotp: (_a: string, _e: string, v: string) => set('totp', v),
    getPrivateKey: () => get('key'),
    setPrivateKey: (_a: string, _e: string, v: string) => set('key', v),
    getPassword: () => get('password'),
    setPassword: (_a: string, _e: string, v: string) => set('password', v),
  } as unknown as StorageManager;
}

/**
 * Sharing a FOLDER must gate every protected entry inside it.
 *
 * <p>The finding, and it is the serious one: `shareNodes` gated an entity node and delegated a
 * FOLDER to a walk that called `buildSharePayload` with no gate at all. So sharing the folder that
 * holds a protected entry sent its raw envelope — a payload the recipient can never open, because
 * unwrapping it needs a PIN they do not have and must never be given.</p>
 *
 * <p>Driven through the real `ShareInbox` over the real `StorageManager`, because a hand-rolled stub
 * would have proved only that the stub has the shape the fix expects.</p>
 */
test('a folder share gates the protected entry inside it, and sends a usable value', async () => {
  const w = world();
  await plantProtectedEntry(w);
  ui.inputs = [PIN_FOR_ENTRY, TRANSIT_PIN, TRANSIT_PIN];
  ui.quickPickAnswers = [[{ member: TEAM_MEMBER }]];

  await w.inbox.shareNodes(RECIPIENT.accountId, [FOLDER]);

  assert.equal(w.delivered.length, 1, `picks: ${ui.quickPickTitles.join(', ')} | ${ui.infos.concat(ui.errors).join(' | ')}`);
  const opened = openSent(w.delivered[0]);
  assert.equal(opened.secrets.password, 'hunter2', 'the recipient gets a usable value');
  assert.ok(!String(opened.secrets.password).includes('"v":1'), 'and never the envelope');
});

test('declining inside a folder share sends NOTHING, not the rest of the folder', async () => {
  const w = world();
  await plantProtectedEntry(w);
  ui.inputs = [undefined]; // the entry's own PIN box, dismissed

  await w.inbox.shareNodes(RECIPIENT.accountId, [FOLDER]);

  assert.deepEqual(w.delivered, [], 'a selection is one act to the person who made it');
});

const FOLDER = { id: 'pin-f1', name: 'Production', type: 'folder', parentId: null } as never;
const PIN_FOR_ENTRY = 'correct-horse-battery';
// The SAME string as the entry's PIN, deliberately. Without the fix no box is raised for the entry,
// so a different transit PIN would shift the input queue and the test would fail for that reason
// instead of the real one. Equal, the queue is harmless and the only difference left is whether the
// payload was unwrapped — which is the defect.
const TRANSIT_PIN = PIN_FOR_ENTRY;

/** One folder, one entry inside it, and that entry's password wrapped under its own PIN. */
async function plantProtectedEntry(w: World): Promise<void> {
  await w.storage.addNode(RECIPIENT.accountId, FOLDER);
  await w.storage.addNode(RECIPIENT.accountId, {
    id: 'pin-e1',
    name: 'prod-db',
    type: 'entity',
    parentId: 'pin-f1',
    details: { id: 'pin-e1', name: 'prod-db' },
  } as never);
  await w.storage.setPassword(
    RECIPIENT.accountId,
    'pin-e1',
    await lockSecret('hunter2', RECIPIENT.accountId, PIN_FOR_ENTRY),
  );
}

/** What the transport was handed, opened with the transit PIN — the recipient's own view of it. */
function openSent(sent: unknown): { secrets: { password?: string } } {
  return loaded.openShare(sent as never, KEY_ID, TRANSIT_PIN) as unknown as {
    secrets: { password?: string };
  };
}
