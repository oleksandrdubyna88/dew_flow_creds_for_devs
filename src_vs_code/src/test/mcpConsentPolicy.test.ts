import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ASK_WINDOW_MS,
  ConsentStamp,
  ConsentStampStore,
  ConsentStamps,
  MAX_STAMPS,
  consentDue,
  stampKey,
} from '../mcpConsentPolicy';

/**
 * When an agent's use of an entry has to raise a dialog, and what this machine remembers.
 *
 * <p>Every guard here is a place where being wrong SILENCES a prompt, so each one is observed
 * rather than argued: the clock is an argument, the store is a fake, and nothing waits.</p>
 */

const NOW = 1_700_000_000_000;
const RUNGS = 'true,true,false,false,,false,false,';

/** The `Memento` subset, over a Map, with the writes counted so a test can see them happen. */
function fakeStore(initial: Record<string, ConsentStamp> = {}): ConsentStampStore & { writes: number } {
  let held: Record<string, ConsentStamp> = initial;
  return {
    writes: 0,
    get(): Record<string, ConsentStamp> | undefined {
      return held;
    },
    update(_key: string, value: Record<string, ConsentStamp>): Thenable<void> {
      this.writes += 1;
      held = value;
      return Promise.resolve();
    },
  };
}

test('ask-every-time asks, and never-ask never does', () => {
  assert.equal(consentDue('always', undefined, RUNGS, NOW), true);
  assert.equal(consentDue('always', { at: NOW, rungs: RUNGS }, RUNGS, NOW), true, 'a stamp cannot silence always');
  assert.equal(consentDue('never', undefined, RUNGS, NOW), false);
});

test('every-12h asks until a dialog is answered, and not again inside the window', () => {
  assert.equal(consentDue('every12h', undefined, RUNGS, NOW), true, 'no stamp, no window');
  assert.equal(consentDue('every12h', { at: NOW, rungs: RUNGS }, RUNGS, NOW), false);
  assert.equal(consentDue('every12h', { at: NOW, rungs: RUNGS }, RUNGS, NOW + ASK_WINDOW_MS - 1), false);
});

test('at exactly twelve hours it asks — the boundary belongs to the next dialog', () => {
  // `withinAllowWindow` is exclusive, which is the behaviour the SSH agent's window already has.
  assert.equal(consentDue('every12h', { at: NOW, rungs: RUNGS }, RUNGS, NOW + ASK_WINDOW_MS), true);
});

test('twelve hours is the stated number', () => {
  // The help and the form both say "12 hours" in words. If the constant moves, one of them is lying.
  assert.equal(ASK_WINDOW_MS, 12 * 60 * 60_000);
});

test('a stamp from the FUTURE opens no window', () => {
  // globalState is a plain file this user's own processes can write. A value ahead of now would
  // otherwise keep a credential usable unattended for as long as somebody cared to set it.
  assert.equal(consentDue('every12h', { at: NOW + 1, rungs: RUNGS }, RUNGS, NOW), true);
  assert.equal(consentDue('every12h', { at: NOW + ASK_WINDOW_MS * 10, rungs: RUNGS }, RUNGS, NOW), true);
});

test('a clock set BACK asks, and a clock jumped FORWARD asks — both directions of skew', () => {
  const stamp = { at: NOW, rungs: RUNGS };
  // Set back thirteen hours: every existing stamp is now in the future, and the guard above
  // discards them. Jumped forward: they age out early. Both cost a dialog, which is the safe way
  // for a clock to be wrong.
  assert.equal(consentDue('every12h', stamp, RUNGS, NOW - 13 * 60 * 60_000), true, 'a clock set back');
  assert.equal(consentDue('every12h', stamp, RUNGS, NOW + 13 * 60 * 60_000), true, 'a clock jumped forward');
});

test('a stamp still in the store after thirteen hours asks — expiry is arithmetic, not presence', () => {
  const store = fakeStore({ 'a:e1': { at: NOW - 13 * 60 * 60_000, rungs: RUNGS } });
  const stamps = new ConsentStamps(store);

  assert.equal(stamps.get('a:e1', NOW), undefined, 'a record that is present but expired is not an answer');
  assert.equal(consentDue('every12h', stamps.get('a:e1', NOW), RUNGS, NOW), true);
});

test('a stamp whose rungs differ from the ladder resolved NOW asks again', () => {
  // The dialog grants every action of the entry's kind. A rung turned on an hour after somebody
  // agreed was not in the sentence they read, so it does not ride in on their answer.
  const stamp = { at: NOW, rungs: RUNGS };
  assert.equal(consentDue('every12h', stamp, 'true,true,true,false,,false,false,', NOW), true);
  assert.equal(consentDue('every12h', stamp, RUNGS, NOW), false, 'and the unchanged ladder still does not');
});

test('a stored record that is not a stamp is dropped rather than half-read', () => {
  // globalState holds whatever JSON was last written to it, by a build that may not be this one.
  const store = fakeStore(JSON.parse('{"a:e1":{"at":"soon","rungs":"x"},"a:e2":{"rungs":"y"},"a:e3":null}'));
  const stamps = new ConsentStamps(store);

  assert.equal(stamps.get('a:e1', NOW), undefined);
  assert.equal(stamps.get('a:e2', NOW), undefined);
  assert.equal(stamps.get('a:e3', NOW), undefined);
});

test('two consents settling at once BOTH survive', () => {
  // globalState.update rewrites the whole record, so without a queue the second writer composes
  // onto a copy it read before the first ran, and the first entry prompts again inside its own
  // window. Started together, awaited together — the interleaving this exists to prevent.
  const stamps = new ConsentStamps(fakeStore());

  return Promise.all([
    stamps.remember(stampKey('a', 'e1'), RUNGS, NOW),
    stamps.remember(stampKey('a', 'e2'), RUNGS, NOW),
  ]).then(() => {
    assert.notEqual(stamps.get('a:e1', NOW), undefined, 'the first consent was overwritten');
    assert.notEqual(stamps.get('a:e2', NOW), undefined, 'the second consent was overwritten');
  });
});

test('a read after a write sees it without waiting for the store', async () => {
  const store = fakeStore();
  const stamps = new ConsentStamps(store);

  await stamps.remember('a:e1', RUNGS, NOW);

  assert.equal(stamps.get('a:e1', NOW)?.rungs, RUNGS);
  assert.equal(store.writes, 1, 'and it reached the store exactly once');
});

test('the prune drops expired records before the cap drops the oldest', async () => {
  // Capping first would evict a window somebody is still inside while a record that stopped
  // meaning anything hours ago kept its place.
  const old: Record<string, ConsentStamp> = {};
  for (let i = 0; i < MAX_STAMPS; i += 1) {
    old[`a:old${i}`] = { at: NOW - 13 * 60 * 60_000, rungs: RUNGS };
  }
  const stamps = new ConsentStamps(fakeStore(old));

  await stamps.remember('a:fresh', RUNGS, NOW);

  assert.notEqual(stamps.get('a:fresh', NOW), undefined, 'the new consent was evicted by expired ones');
  assert.equal(stamps.get('a:old0', NOW), undefined);
});

test('the cap holds at 256, and the oldest is what goes', async () => {
  const many: Record<string, ConsentStamp> = {};
  for (let i = 0; i < MAX_STAMPS; i += 1) {
    // All live, and each one a millisecond older than the last.
    many[`a:e${i}`] = { at: NOW - MAX_STAMPS + i, rungs: RUNGS };
  }
  const store = fakeStore(many);
  const stamps = new ConsentStamps(store);

  await stamps.remember('a:newest', RUNGS, NOW);

  assert.equal(Object.keys(store.get('k') ?? {}).length, MAX_STAMPS, 'the cap did not hold');
  assert.notEqual(stamps.get('a:newest', NOW), undefined);
  assert.equal(stamps.get('a:e0', NOW), undefined, 'the oldest should have been the one dropped');
  assert.notEqual(stamps.get(`a:e${MAX_STAMPS - 1}`, NOW), undefined, 'and the newest kept');
});

test('updating a key that is already there evicts nothing', async () => {
  const many: Record<string, ConsentStamp> = {};
  for (let i = 0; i < MAX_STAMPS; i += 1) {
    many[`a:e${i}`] = { at: NOW - MAX_STAMPS + i, rungs: RUNGS };
  }
  const store = fakeStore(many);
  const stamps = new ConsentStamps(store);

  await stamps.remember('a:e0', RUNGS, NOW);

  assert.equal(Object.keys(store.get('k') ?? {}).length, MAX_STAMPS, 'a replacement should not grow the map');
  assert.notEqual(stamps.get('a:e1', NOW), undefined, 'and should evict nobody');
});

test('forgetting leaves the key empty, and the next call has no window', async () => {
  const store = fakeStore();
  const stamps = new ConsentStamps(store);
  await stamps.remember('a:e1', RUNGS, NOW);

  await stamps.forgetAll();

  assert.deepEqual(store.get('k'), {});
  assert.equal(consentDue('every12h', stamps.get('a:e1', NOW), RUNGS, NOW), true);
});

test('the key names the account as well as the entry', () => {
  // An id is unique to a vault and a window holds several; two accounts must not share a window.
  assert.notEqual(stampKey('a', 'e1'), stampKey('b', 'e1'));
});
