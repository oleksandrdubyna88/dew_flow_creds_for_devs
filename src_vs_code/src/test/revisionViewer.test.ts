import assert from 'node:assert/strict';
import { stored } from '../storedSecret';
import { test } from 'node:test';
import type { EntityViewOptions } from '../entityViewPage';
import type { Revision, RevisionSecrets } from '../revisionHistory';
import type { StorageManager } from '../storageManager';
import { EntityMetadata, TreeNode } from '../types';
import { loadWithVscode } from './vscodeStub';
import { copyValueFor } from '../entityViewCopy';
import { plainSecret } from '../secretEnvelope';
import { ACCOUNT, PIN, Sinks, clickVscode, everythingSunk, locked, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * D10 of the entry-PIN plan — a KEPT version opens only through the door of the entry it belongs to.
 *
 * <p>The revision viewer asked nothing. A kept version of a protected entry from before the PIN — the
 * CVV included — opened from its history row with no PIN at all; one from after the PIN rendered its
 * envelopes, so the card read as `{}` and Copy copied `{"v":1,"lock":…}`. Now the LIVE entry's door is
 * asked for every version of a protected entry (plan gate, finding 0), and a version sealed under a PIN
 * the entry no longer uses asks for that PIN separately and never grants it (finding 3).</p>
 *
 * <p>Over the REAL `StorageManager` and the real `openRevisionViewer`; only the webview is a spy.</p>
 */

const ENTRY = 'p1';
const OLD_PIN = '9876';
const CARD = JSON.stringify({ number: '4111111111111111', cvv: '123', pin: '4321' });

const card = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: ENTRY, name: 'orest payoneer', isSshEnabled: false, kind: 'payment', isPayment: true, paymentForm: 'card', ...over }) as EntityMetadata;

interface World {
  view(): Promise<void>;
  shown: EntityViewOptions[];
  s: Sinks;
  storage: StorageManager;
}

/** The live entry, one kept version, and the viewer with its webview spied on. */
async function world(live: Record<string, string>, kept: RevisionSecrets, inputs: (string | undefined)[], over: Partial<EntityMetadata> = {}): Promise<World> {
  const s = sinks();
  const stub = clickVscode([...inputs], s);
  const storage = memoryStorage(stub);
  await seedEntry(storage, card(over), live);
  const version: Revision = { at: 1_700_000_000_000, name: 'orest payoneer (old)', details: card({ name: 'orest payoneer (old)' }), secrets: kept };
  await storage.recordRevision(ACCOUNT, ENTRY, version);
  const [recorded] = await storage.getHistory(ACCOUNT, ENTRY);
  assert.ok(recorded !== undefined, 'precondition: the revision validator took the fixture');
  const shown: EntityViewOptions[] = [];
  const mod = loadWithVscode<typeof import('../entityViewerCommands')>('../entityViewerCommands', stub, {
    './entityViewPanel': { showEntityView: (options: EntityViewOptions): void => void shown.push(options) },
  });
  const node = storage.getNode(ACCOUNT, ENTRY) as TreeNode;
  return { shown, s, storage, view: () => mod.openRevisionViewer(ACCOUNT, node, recorded, storage) };
}

function session(): typeof import('../pinSession') {
  return require('../pinSession') as typeof import('../pinSession');
}

test('a kept version of a protected entry opens only after the entry’s PIN, and draws its whole card', async () => {
  const w = await world({ 'payment details': await locked(CARD) }, { payment: stored(await locked(CARD)), password: stored(await locked('old pw')) }, [PIN], { pinProtected: true });

  await w.view();

  assert.equal(w.s.boxes, 1, 'the door of the entry it belongs to was asked');
  assert.equal(w.shown.length, 1, 'the version opened');
  const page = w.shown[0];
  assert.deepEqual([...(page.payment?.present ?? [])].sort(), ['cvv', 'number', 'pin'], 'the card frame is drawn from the OPENED record');
  assert.deepEqual(await page.resolvePayment?.(), JSON.parse(CARD));
  assert.equal(await page.resolveSecret('password'), 'old pw', 'Copy copies the value');
  assert.doesNotMatch(JSON.stringify([await page.copyAllText(), everythingSunk(w.s)]), /"lock"/, 'and never an envelope');
});

test('a kept version from BEFORE the PIN still asks the entry’s PIN — a history row is not a way round it', async () => {
  // Plan gate, finding 0: the plaintext CVV of the version replaced before Protect ran.
  const w = await world({ 'payment details': await locked(CARD) }, { payment: stored(CARD) }, [undefined], { pinProtected: true });

  await w.view();

  assert.equal(w.s.boxes, 1, 'asked');
  assert.deepEqual(w.shown, [], 'declined: no viewer, and the plaintext card was never on a page');
  assert.deepEqual(w.s.warnings, [], 'a decline says nothing more');
});

test('a version sealed under the PIN the entry used to have asks for THAT PIN with its own sentence, and never grants it', async () => {
  // Plan gate, finding 3: unprotected on another machine and synced here, while this machine's kept
  // versions stayed sealed. The live entry holds no lock and no grant; the version holds both.
  const w = await world({ 'payment details': CARD }, { payment: stored(await locked(CARD, OLD_PIN)) }, [OLD_PIN]);

  await w.view();

  assert.equal(w.s.boxes, 1, 'the live entry asked nothing; the version asked once');
  assert.deepEqual(w.s.boxPrompts, ['This kept version is sealed under the PIN the entry used to have. Enter it to see it.']);
  assert.equal(w.shown.length, 1);
  assert.deepEqual(await w.shown[0].resolvePayment?.(), JSON.parse(CARD));
  assert.equal(session().grantedPin(ACCOUNT, ENTRY), undefined, 'the version’s PIN is not the entry’s, so it is not remembered as one');
});

test('a version under an OLDER PIN of a protected entry keeps the live grant as it was', async () => {
  const w = await world({ 'payment details': await locked(CARD) }, { payment: stored(await locked(CARD, OLD_PIN)) }, [PIN, OLD_PIN], { pinProtected: true });

  await w.view();

  assert.equal(w.s.boxes, 2, 'the door, then the version');
  assert.equal(w.shown.length, 1);
  assert.equal(session().grantedPin(ACCOUNT, ENTRY), PIN, 'the grant is still the PIN the entry uses now');
});

test('a wrong PIN for a kept version opens nothing, says so, and changes nothing', async () => {
  const w = await world({ 'payment details': CARD }, { payment: stored(await locked(CARD, OLD_PIN)) }, ['not-it']);
  const before = await w.storage.getHistory(ACCOUNT, ENTRY);

  await w.view();

  assert.deepEqual(w.shown, []);
  assert.match(w.s.warnings.join(' '), /That PIN does not open this kept version of "orest payoneer"\. Nothing has been changed/);
  assert.deepEqual(await w.storage.getHistory(ACCOUNT, ENTRY), before);
});

test('an unprotected version of an unprotected entry still opens without a question', async () => {
  const w = await world({ 'payment details': CARD }, { payment: stored(CARD), password: stored('old pw') }, []);

  await w.view();

  assert.equal(w.s.boxes, 0);
  assert.equal(w.shown.length, 1);
  assert.equal(await w.shown[0].resolveSecret('password'), 'old pw');
});

// ---------------------------------------------------------------------------------------------
// The typed-secrets plan, T3 (second plan round, finding 0): a kept version is admitted ONCE, by
// `revisionDoor.openKeptVersion`, and every field of the opened copy is read through the viewer's own
// gated reader behind a SILENT gate — the road the live viewer takes, so the two cannot answer differently.
// ---------------------------------------------------------------------------------------------

test('a kept WOVEN password is read by the revision viewer as the live viewer reads it — the pair, never its envelope', async () => {
  const woven = plainSecret('hhuunntteerr22', true);
  const w = await world({ 'payment details': CARD }, { payment: stored(CARD), password: stored(woven) }, []);

  await w.view();

  assert.equal(w.shown.length, 1);
  assert.equal(await w.shown[0].resolveSecret('password'), 'hhuunntteerr22', 'the revision viewer handed its page the woven envelope');
  assert.doesNotMatch(await w.shown[0].copyAllText(), /"woven"/, 'Copy All carried the envelope');
});

/** The LIVE viewer of the same world, its page spied on — what the history row's Copy is pressed on. */
async function liveViewer(w: World, stub: Record<string, unknown>): Promise<EntityViewOptions> {
  const shown: EntityViewOptions[] = [];
  const mod = loadWithVscode<typeof import('../entityViewerCommands')>('../entityViewerCommands', stub, {
    './entityViewPanel': { showEntityView: (options: EntityViewOptions): void => void shown.push(options) },
  });
  const node = w.storage.getNode(ACCOUNT, ENTRY) as TreeNode;
  await mod.openEntityViewer(ACCOUNT, node, w.storage, { cliAliases: [], codeAccess: false, bridgeOpen: false, wslRelay: false } as never);
  assert.equal(shown.length, 1, `the live viewer did not open; warnings: ${w.s.warnings.join(' | ')}`);
  return shown[0];
}

test('the history row’s Copy on a protected entry copies the kept value, never its envelope — and asks the PIN once', async () => {
  const s = sinks();
  const stub = clickVscode([PIN], s);
  const storage = memoryStorage(stub);
  await seedEntry(storage, card({ pinProtected: true }), { 'payment details': await locked(CARD) });
  await storage.recordRevision(ACCOUNT, ENTRY, { at: 1_700_000_000_000, name: 'orest payoneer (old)', details: card(), secrets: { password: stored(await locked('old pw')) } });
  const w: World = { shown: [], s, storage, view: () => Promise.resolve() };

  const page = await liveViewer(w, stub);
  const copied = await copyValueFor(page, 'rev0');

  assert.equal(copied, 'old pw', `the history row copied ${String(copied).slice(0, 40)}`);
  assert.equal(s.boxes, 1, 'the live door was asked once; the kept version opened behind it with no second box');
});

test('viewing a kept version of a protected entry and copying from it asks the PIN ONCE — the guard over the silent reader', async () => {
  // Green before T3 too: a grant in the session already kept a second door silent. It is the guard that
  // the silent reader did not add a box.
  const w = await world({ 'payment details': await locked(CARD) }, { payment: stored(await locked(CARD)), password: stored(await locked('old pw')) }, [PIN], { pinProtected: true });

  await w.view();
  const page = w.shown[0];
  await page.resolveSecret('password');
  await page.copyAllText();
  await page.resolvePayment?.();
  await page.resolveSecond?.();

  assert.equal(w.s.boxes, 1, 'a kept version asked twice');
});

test('the history row’s Copy of a version sealed under the entry’s OLDER PIN asks for that PIN, as the revision viewer does', async () => {
  const s = sinks();
  const stub = clickVscode([PIN, OLD_PIN], s);
  const storage = memoryStorage(stub);
  await seedEntry(storage, card({ pinProtected: true }), { 'payment details': await locked(CARD) });
  await storage.recordRevision(ACCOUNT, ENTRY, { at: 1_700_000_000_000, name: 'orest payoneer (old)', details: card(), secrets: { password: stored(await locked('older pw', OLD_PIN)) } });
  const w: World = { shown: [], s, storage, view: () => Promise.resolve() };

  const page = await liveViewer(w, stub);
  const copied = await copyValueFor(page, 'rev0');

  assert.equal(copied, 'older pw', 'the version was not opened through its own door');
  assert.equal(s.boxes, 2, 'the live door, then the version\'s own PIN');
  assert.equal(session().grantedPin(ACCOUNT, ENTRY), PIN, 'the version\'s PIN is not granted over the entry\'s');
});
