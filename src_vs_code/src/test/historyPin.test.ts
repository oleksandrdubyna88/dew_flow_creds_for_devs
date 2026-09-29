import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SECRET_SLOTS } from '../entitySlots';
import { protectHistory, unprotectHistory } from '../historyPin';
import type { Revision, RevisionSecrets } from '../revisionHistory';
import { writeHistory } from '../revisionStore';
import { lockSecret, plainSecret, readSecret, unlockSecret } from '../secretEnvelope';
import type { StorageManager } from '../storageManager';
import { EntityMetadata } from '../types';
import { loadWithVscode } from './vscodeStub';
import { ACCOUNT, PIN, clickVscode, locked, memoryStorage, seedEntry, sinks } from './pinWorld';

/**
 * D10 of the entry-PIN plan — an entry's KEPT versions under its PIN.
 *
 * <p>Protect sealed the live values and left the three kept versions alone, so everything the entry
 * held before the PIN — a CVV included — stayed plaintext in this machine's keychain and opened from
 * the history row with no PIN at all, until three later edits pushed it out. And history is per
 * machine: Protect on one machine can only seal that machine's, so every OTHER machine's kept
 * versions are sealed at the first door there, in the background.</p>
 *
 * <p>Over the REAL `StorageManager` with every lock a real `lockSecret` wrap (`pinWorld.ts`).</p>
 */

const ENTRY = 'e1';

/** One plaintext value per field a revision keeps — DERIVED from the slot table, so an eleventh slot gets one too. */
const PLAIN: RevisionSecrets = Object.fromEntries(SECRET_SLOTS.map((slot) => [slot.revisionField, `old ${slot.label}`]));

const details = (over: Partial<EntityMetadata> = {}): EntityMetadata =>
  ({ id: ENTRY, name: 'orest payoneer', isSshEnabled: false, kind: 'credential', ...over }) as EntityMetadata;

function revision(at: number, secrets: RevisionSecrets): Revision {
  return { at, name: 'as it was', details: details({ name: 'as it was' }), secrets };
}

/** The entry with one live slot, and `kept` recorded as its history — asserted to have been ACCEPTED. */
async function entryWithHistory(storage: StorageManager, live: Record<string, string>, kept: RevisionSecrets[], over: Partial<EntityMetadata> = {}): Promise<void> {
  await seedEntry(storage, details(over), live);
  for (const [at, secrets] of kept.entries()) {
    await storage.recordRevision(ACCOUNT, ENTRY, revision(at + 1, secrets));
  }
  assert.equal((await storage.getHistory(ACCOUNT, ENTRY)).length, kept.length, 'precondition: the revision validator took the fixture');
}

/**
 * The door's heal runs in the background, deliberately — nothing a click does waits for it. So a test
 * waits for its status-bar line (the one visible trace it leaves), or for a settled moment to prove
 * it left none.
 */
async function settled(done: () => boolean, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (!done() && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A kept value, which must be LOCKED under `pin`, opened — or the assertion names what is there. */
async function openedKept(stored: string | undefined, pin: string = PIN): Promise<string> {
  const read = readSecret(stored);
  assert.equal(read.kind, 'locked', `a kept value is not sealed; stored: ${String(stored)}`);
  return read.kind === 'locked' ? unlockSecret(read.envelope, ACCOUNT, pin) : '';
}

test('Protect seals every kept version of the entry — every field the slot table has — under the entry’s PIN', async () => {
  const s = sinks();
  const stub = clickVscode([PIN, PIN], s);
  const storage = memoryStorage(stub);
  await entryWithHistory(storage, { notes: 'live note' }, [PLAIN]);
  const commands = loadWithVscode<typeof import('../pinCommands')>('../pinCommands', stub);

  await commands.protectEntry(storage.getNode(ACCOUNT, ENTRY)!, { storage, accountId: ACCOUNT, refresh: () => undefined });

  const [kept] = await storage.getHistory(ACCOUNT, ENTRY);
  for (const slot of SECRET_SLOTS) {
    assert.equal(await openedKept(kept.secrets[slot.revisionField]), `old ${slot.label}`, `the kept ${slot.label} opens to what it was`);
  }
  assert.equal(await openedKept(await storage.getNotes(ACCOUNT, ENTRY)), 'live note', 'and the live entry is protected as before');
});

test('a revision recorded while the kept versions are being sealed is kept, not written out of history', async () => {
  const storage = memoryStorage(clickVscode([], sinks()));
  await entryWithHistory(storage, {}, [{ password: 'first' }]);

  const sealing = protectHistory(storage, ACCOUNT, ENTRY, PIN);
  await storage.recordRevision(ACCOUNT, ENTRY, revision(9, { password: 'saved meanwhile' }));
  await sealing;

  const kept = await storage.getHistory(ACCOUNT, ENTRY);
  assert.deepEqual(kept.map((r) => r.at), [9, 1], 'the Save that landed in between is still in history');
  assert.equal(await openedKept(kept[1].secrets.password), 'first');
});

test('a damaged kept value is never rewritten — it is the only copy of whatever it was', async () => {
  const storage = memoryStorage(clickVscode([], sinks()));
  const damaged = '{"v":1,"lock":{"wrap":{}}}';
  await entryWithHistory(storage, {}, [{ notes: damaged, password: 'pw' }]);

  assert.equal(await protectHistory(storage, ACCOUNT, ENTRY, PIN), 1, 'the one plain value was sealed');

  const [kept] = await storage.getHistory(ACCOUNT, ENTRY);
  assert.equal(kept.secrets.notes, damaged, 'byte-identical');
  assert.equal(await openedKept(kept.secrets.password), 'pw');
});

test('a history that is absent, or does not parse, is never overwritten by a rewrite', async () => {
  for (const raw of [undefined, 'not json at all', '[{"at":"not a number"}]']) {
    const stored: string[] = [];
    const chest = { get: () => Promise.resolve(raw), store: (_k: string, v: string) => void stored.push(v), delete: () => Promise.resolve() };

    await writeHistory(chest as never, ACCOUNT, ENTRY, () => assert.fail('nothing kept, nothing to revise'));

    assert.deepEqual(stored, [], `nothing written over ${String(raw)}`);
  }
});

test('the PIN coming off opens every kept value it sealed, keeps a woven one woven, and leaves one under another PIN sealed and counted', async () => {
  const storage = memoryStorage(clickVscode([], sinks()));
  const foreign = await lockSecret('under the other PIN', ACCOUNT, '9876');
  await entryWithHistory(storage, {}, [{ password: await lockSecret('woven pw', ACCOUNT, PIN, true), notes: await locked('kept note'), config: foreign }]);

  const result = await unprotectHistory(storage, ACCOUNT, ENTRY, PIN);

  const [kept] = await storage.getHistory(ACCOUNT, ENTRY);
  assert.equal(kept.secrets.password, plainSecret('woven pw', true), 'the woven mark survives the unwrap');
  assert.equal(kept.secrets.notes, 'kept note');
  assert.equal(kept.secrets.config, foreign, 'a value this PIN does not open is left exactly as it was');
  assert.equal(result.foreign, 1, 'and counted, so the person can be told');
});

test('another machine’s kept versions are sealed at the first door here, in the background, and the status bar says so', async () => {
  // Protect ran on the OTHER machine: this one's live values arrived sealed by sync, and its own
  // history — per machine, never synced — is still plaintext.
  const s = sinks();
  const stub = clickVscode([PIN], s);
  const storage = memoryStorage(stub);
  await entryWithHistory(storage, { notes: await locked('live note') }, [{ password: 'old pw', payment: '{"cvv":"123"}' }], { pinProtected: true });
  const prompt = loadWithVscode<typeof import('../pinPrompt')>('../pinPrompt', stub);

  const gate = await prompt.admitEntry(storage, ACCOUNT, ENTRY, 'orest payoneer', 'copy its password');

  assert.ok(gate !== undefined, 'admitted');
  await settled(() => s.statusBar.length > 0, 3000);
  assert.deepEqual(s.statusBar.map((m) => m.text), ['Sealing the kept versions of "orest payoneer" under its PIN…']);
  await s.statusBar[0].work;
  const [kept] = await storage.getHistory(ACCOUNT, ENTRY);
  assert.equal(await openedKept(kept.secrets.password), 'old pw');
  assert.equal(await openedKept(kept.secrets.payment), '{"cvv":"123"}');
});

test('the door seals nothing for an entry that holds no locked value, whatever grant this window still remembers', async () => {
  // Unprotected on another machine and synced here: the grant from this morning is still in memory,
  // and sealing this machine's history under it would re-protect what the person unprotected.
  const s = sinks();
  const stub = clickVscode([], s);
  const storage = memoryStorage(stub);
  await entryWithHistory(storage, { notes: 'plain now' }, [{ password: 'old pw' }]);
  const prompt = loadWithVscode<typeof import('../pinPrompt')>('../pinPrompt', stub);
  (require('../pinSession') as typeof import('../pinSession')).grantPin(ACCOUNT, ENTRY, PIN);

  assert.ok((await prompt.admitEntry(storage, ACCOUNT, ENTRY, 'orest payoneer', 'view it')) !== undefined);
  await settled(() => false, 200);

  assert.deepEqual(s.statusBar, []);
  assert.equal((await storage.getHistory(ACCOUNT, ENTRY))[0].secrets.password, 'old pw');
});
