import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ASK_WINDOW_MS,
  ConsentStamp,
  ConsentStampStore,
  ConsentStamps,
  MAX_STAMPS,
  consentDue,
  consentStampsFor,
  STAMPS_KEY,
  stampKey,
} from '../mcpConsentPolicy';

/**
 * When an agent's use of an entry has to raise a dialog, and what this machine remembers.
 *
 * <p>Every guard here is a place where being wrong SILENCES a prompt, so each one is observed
 * rather than argued: the clock is an argument, the store is a fake, and nothing waits.</p>
 */

const NOW = 1_700_000_000_000;
const E1 = stampKey('a', 'e1');
const RUNGS = 'true,true,false,false,,false,false,';

/**
 * The `Memento` subset, keyed for real.
 *
 * <p>Keyed rather than single-valued because the code now writes two keys, and a store that ignored
 * the key would let a test assert against a record the code never wrote there — the same trap as
 * guessing a computed name. `stamps()` reads back through the constant the code uses.</p>
 *
 * <p>The counter lives in the closure rather than on the returned object, so the fake answers a
 * question without mutating itself to do it.</p>
 */
function fakeStore(initial: Record<string, unknown> = {}): ConsentStampStore & {
  writes: () => number;
  stamps: () => Record<string, ConsentStamp>;
} {
  const held = new Map<string, unknown>([[STAMPS_KEY, initial]]);
  let written = 0;
  return {
    get<T>(key: string): T | undefined {
      return held.get(key) as T | undefined;
    },
    update(key: string, value: unknown): Thenable<void> {
      written += 1;
      held.set(key, value);
      return Promise.resolve();
    },
    writes: () => written,
    stamps: () => (held.get(STAMPS_KEY) ?? {}) as Record<string, ConsentStamp>,
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
  const store = fakeStore({ [E1]: { at: NOW - 13 * 60 * 60_000, rungs: RUNGS } });
  const stamps = new ConsentStamps(store);

  assert.equal(stamps.get(E1, NOW), undefined, 'a record that is present but expired is not an answer');
  assert.equal(consentDue('every12h', stamps.get(E1, NOW), RUNGS, NOW), true);
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
  // Keyed the way the code keys it, so each `get` reaches the record it is about: a fixture whose
  // keys do not match is a test that passes because it looked nothing up.
  const damaged: Record<string, unknown> = {
    [E1]: JSON.parse('{"at":"soon","rungs":"x"}'),
    [stampKey('a', 'e2')]: JSON.parse('{"rungs":"y"}'),
    [stampKey('a', 'e3')]: null,
    [stampKey('a', 'e4')]: { at: NOW, rungs: RUNGS },
  };
  const stamps = new ConsentStamps(fakeStore(damaged));

  assert.equal(stamps.get(E1, NOW), undefined, 'a time that is not a number');
  assert.equal(stamps.get(stampKey('a', 'e2'), NOW), undefined, 'no time at all');
  assert.equal(stamps.get(stampKey('a', 'e3'), NOW), undefined, 'not an object');
  // The control: one good record in the same map, so this is not passing because nothing was read.
  assert.notEqual(stamps.get(stampKey('a', 'e4'), NOW), undefined, 'the sound record was dropped too');
});

test('two consents settling at once BOTH survive', () => {
  // globalState.update rewrites the whole record, so without a queue the second writer composes
  // onto a copy it read before the first ran, and the first entry prompts again inside its own
  // window. Started together, awaited together — the interleaving this exists to prevent.
  const stamps = new ConsentStamps(fakeStore());

  return Promise.all([
    stamps.remember(E1, RUNGS, NOW),
    stamps.remember(stampKey('a', 'e2'), RUNGS, NOW),
  ]).then(() => {
    assert.notEqual(stamps.get(E1, NOW), undefined, 'the first consent was overwritten');
    assert.notEqual(stamps.get(stampKey('a', 'e2'), NOW), undefined, 'the second consent was overwritten');
  });
});

test('a read after a write sees it without waiting for the store', async () => {
  const store = fakeStore();
  const stamps = new ConsentStamps(store);

  await stamps.remember(E1, RUNGS, NOW);

  assert.equal(stamps.get(E1, NOW)?.rungs, RUNGS);
  assert.equal(store.writes(), 1, 'and it reached the store exactly once');
});

test('the prune drops expired records before the cap drops the oldest', async () => {
  // Capping first would evict a window somebody is still inside while a record that stopped
  // meaning anything hours ago kept its place.
  const old: Record<string, ConsentStamp> = {};
  for (let i = 0; i < MAX_STAMPS; i += 1) {
    old[stampKey('a', `old${i}`)] = { at: NOW - 13 * 60 * 60_000, rungs: RUNGS };
  }
  const stamps = new ConsentStamps(fakeStore(old));

  await stamps.remember(stampKey('a', 'fresh'), RUNGS, NOW);

  assert.notEqual(stamps.get(stampKey('a', 'fresh'), NOW), undefined, 'the new consent was evicted by expired ones');
  assert.equal(stamps.get(stampKey('a', 'old0'), NOW), undefined);
});

test('the cap holds at 256, and the oldest is what goes', async () => {
  const many: Record<string, ConsentStamp> = {};
  for (let i = 0; i < MAX_STAMPS; i += 1) {
    // All live, and each one a millisecond older than the last.
    many[stampKey('a', `e${i}`)] = { at: NOW - MAX_STAMPS + i, rungs: RUNGS };
  }
  const store = fakeStore(many);
  const stamps = new ConsentStamps(store);

  await stamps.remember(stampKey('a', 'newest'), RUNGS, NOW);

  assert.equal(Object.keys(store.stamps()).length, MAX_STAMPS, 'the cap did not hold');
  assert.notEqual(stamps.get(stampKey('a', 'newest'), NOW), undefined);
  assert.equal(stamps.get(stampKey('a', 'e0'), NOW), undefined, 'the oldest should have been the one dropped');
  assert.notEqual(stamps.get(stampKey('a', `e${MAX_STAMPS - 1}`), NOW), undefined, 'and the newest kept');
});

test('updating a key that is already there evicts nothing', async () => {
  const many: Record<string, ConsentStamp> = {};
  for (let i = 0; i < MAX_STAMPS; i += 1) {
    many[stampKey('a', `e${i}`)] = { at: NOW - MAX_STAMPS + i, rungs: RUNGS };
  }
  const store = fakeStore(many);
  const stamps = new ConsentStamps(store);

  await stamps.remember(stampKey('a', 'e0'), RUNGS, NOW);

  assert.equal(Object.keys(store.stamps()).length, MAX_STAMPS, 'a replacement should not grow the map');
  assert.notEqual(stamps.get(stampKey('a', 'e1'), NOW), undefined, 'and should evict nobody');
});

test('two accounts cannot collide into one window, whatever their ids contain', () => {
  // `a:b` + `c` and `a` + `b:c` join to the same string. Ids are uuids today and this is
  // unreachable today; the encoding is injective so it does not depend on that staying true, and
  // the consequence of a collision would be consent for one account silencing another's.
  assert.notEqual(stampKey('a:b', 'c'), stampKey('a', 'b:c'));
  assert.notEqual(stampKey('', 'a:b'), stampKey('a', 'b'));
});

test('forgetting leaves the key empty, and the next call has no window', async () => {
  const store = fakeStore();
  const stamps = new ConsentStamps(store);
  await stamps.remember(E1, RUNGS, NOW);

  await stamps.forgetAll(NOW);

  assert.deepEqual(store.stamps(), {});
  assert.equal(consentDue('every12h', stamps.get(E1, NOW), RUNGS, NOW), true);
});

test('the key names the account as well as the entry', () => {
  // An id is unique to a vault and a window holds several; two accounts must not share a window.
  assert.notEqual(E1, stampKey('b', 'e1'));
});

test('a stamp survives the window closing: a fresh reader over the same store still has it', async () => {
  // The read-after-write test above can pass with a correct object and a wrong persisted shape.
  // This is the case a person actually meets — the editor restarted inside the twelve hours — and
  // it is the whole promise of a machine-local record.
  const store = fakeStore();
  await new ConsentStamps(store).remember(E1, RUNGS, NOW);

  const afterRestart = new ConsentStamps(store);

  assert.equal(afterRestart.get(E1, NOW + 60_000)?.rungs, RUNGS, 'the stamp did not survive reconstruction');
  assert.equal(consentDue('every12h', afterRestart.get(E1, NOW + 60_000), RUNGS, NOW + 60_000), false);
});

test('forgetting in one window is not undone by another window that was already open', async () => {
  // Two readers over one store, which is what two VS Code windows are. The failure this pins is
  // not an extra dialog: it is silent use AFTER an explicit revocation, and a stale in-memory map
  // would produce both halves of it — B suppressing a prompt with a forgotten stamp, and B's next
  // write restoring that stamp over the emptied store.
  const store = fakeStore();
  const windowA = new ConsentStamps(store);
  const windowB = new ConsentStamps(store);
  await windowA.remember(E1, RUNGS, NOW);
  assert.notEqual(windowB.get(E1, NOW), undefined, 'the fixture must start with something to forget');

  await windowA.forgetAll(NOW);

  assert.equal(windowB.get(E1, NOW), undefined, 'a forgotten consent still silenced the other window');
  assert.equal(consentDue('every12h', windowB.get(E1, NOW), RUNGS, NOW), true);

  // And B writing afterwards must not bring it back.
  await windowB.remember(stampKey('a', 'e2'), RUNGS, NOW);
  assert.equal(windowA.get(E1, NOW), undefined, 'a stale window resurrected a forgotten consent');
});

test('a window that was mid-write when Forget ran cannot put the stamp back', async () => {
  // The race the mark exists for, and the one clearing the map does not close: the other window's
  // READ happened before the revocation and its WRITE lands after it. Simulated by writing the map
  // that window had already composed, which is exactly what the store sees.
  const store = fakeStore();
  const stamps = new ConsentStamps(store);
  await stamps.remember(E1, RUNGS, NOW);
  const alreadyComposed = { ...store.stamps() };

  await stamps.forgetAll(NOW);
  await store.update(STAMPS_KEY, alreadyComposed);

  assert.equal(stamps.get(E1, NOW), undefined, 'a forgotten consent was resurrected');
  assert.equal(consentDue('every12h', stamps.get(E1, NOW), RUNGS, NOW), true);
});

test('a consent given AFTER a Forget is honoured — the mark is a line, not a wall', async () => {
  const store = fakeStore();
  const stamps = new ConsentStamps(store);
  await stamps.forgetAll(NOW);

  await stamps.remember(E1, RUNGS, NOW + 1);

  assert.notEqual(stamps.get(E1, NOW + 1), undefined, 'forgetting once must not silence the feature');
  assert.equal(consentDue('every12h', stamps.get(E1, NOW + 1), RUNGS, NOW + 1), false);
});

test('a stamp whose time is not finite is not a stamp', async () => {
  // typeof NaN is 'number', and the infinities pass it too. The window arithmetic downstream
  // already refuses all three, but that is emergent; rejecting them at the read makes it structural.
  const store = fakeStore({
    [E1]: JSON.parse('{"at":null,"rungs":"x"}'),
    [stampKey('a', 'e2')]: { at: Number.NaN, rungs: RUNGS },
    [stampKey('a', 'e3')]: { at: Number.NEGATIVE_INFINITY, rungs: RUNGS },
    [stampKey('a', 'e4')]: { at: Number.POSITIVE_INFINITY, rungs: RUNGS },
  });
  const stamps = new ConsentStamps(store);

  for (const id of ['e1', 'e2', 'e3', 'e4']) {
    assert.equal(stamps.get(stampKey('a', id), NOW), undefined, `${id} was read as a stamp`);
  }
});

test('one store gets one ConsentStamps, and a different store gets its own', async () => {
  // The memo exists so that the broker's hooks and the Forget command queue against the SAME queue:
  // two instances over one store would each read the map before the other had written, and one
  // update would throw the other away. Identity is the whole of the guarantee, so identity is what
  // is asserted here — `mcpHooks.test.ts` proves the consequence, that a concurrent write survives.
  const store = fakeStore();

  assert.equal(consentStampsFor(store), consentStampsFor(store), 'a second caller built its own store');
  assert.notEqual(consentStampsFor(store), consentStampsFor(fakeStore()), 'and two stores are two stores');
});

/* ---------------------------------------------------------------------------------------------------------------
 * E1.4 — a stamp per server (C1, C2, C3, C8, C18)
 * ------------------------------------------------------------------------------------------------------------- */

test('C1: the on-disk form is today\'s, byte for byte, and a store seeded with it is still read', async () => {
  // Pinned BEFORE the third parameter exists: every machine that has answered a dialog has keys of this shape, and a
  // change here is a silent forget for all of them.
  assert.equal(stampKey('acct', 'e1'), '4:acct:e1');
  assert.equal(stampKey('acct', 'e1', undefined), '4:acct:e1', 'an absent server id is the two-segment key');
  const store = fakeStore({ '4:acct:e1': { at: NOW, rungs: RUNGS } });
  const stamps = new ConsentStamps(store);

  assert.deepEqual(stamps.get('4:acct:e1', NOW), { at: NOW, rungs: RUNGS });
  assert.equal(consentDue('every12h', stamps.get(stampKey('acct', 'e1'), NOW), RUNGS, NOW), false, 'the entry stays quiet for local use');
});

test('C2: a server id makes a key of its own, and the key is injective in all three positions', () => {
  assert.notEqual(stampKey('a', 'e', 's'), stampKey('a', 'e'));
  assert.notEqual(stampKey('a', 'e', 's'), stampKey('a', 'e', 't'));
  assert.equal(stampKey('a', 'e', 's'), stampKey('a', 'e', 's'), 'and it is stable');
  // The account/entity split, the entity/server split and the account/server split each move a `:` across a boundary.
  assert.notEqual(stampKey('a:b', 'c', 's'), stampKey('a', 'b:c', 's'));
  assert.notEqual(stampKey('a', 'e:x', 'y'), stampKey('a', 'e', 'x:y'));
  assert.notEqual(stampKey('a', 'b', 'c:d'), stampKey('a:b', 'c', 'd'));
  assert.notEqual(stampKey('a', '', 'x'), stampKey('a', 'x', 'x'), 'an empty entity id is still its own key');
});

test('C3: no id that arrives by sync can make a local key equal a server key', () => {
  // `<n>:<a>:<m>:<e>:<s>` would collide with a local entry whose id is `<m>:<e>:<s>`; the leading `s` is what it takes.
  assert.notEqual(stampKey('a', '1:e:s'), stampKey('a', 'e', 's'));
  assert.notEqual(stampKey('a', '1:e:s'), `s${stampKey('a', 'e', 's').slice(1)}`);
  for (const [account, entity] of [['a', 'e'], ['', ''], ['s', 's'], ['1:e', 's'], ['a:b', 's1:x:y']] as const) {
    assert.match(stampKey(account, entity), /^\d/, `a local key starts with a digit (${account}/${entity})`);
    assert.match(stampKey(account, entity, 'srv'), /^s\d/, `a server key starts with an s and a digit (${account}/${entity})`);
  }
});

test('C18: an empty server id cannot make a key', () => {
  assert.throws(() => stampKey('a', 'e', ''), { message: 'A server stamp needs a server entity id.' });
  assert.equal(stampKey('a', 'e'), '1:a:e');
  assert.equal(stampKey('a', 'e', undefined), '1:a:e');
});

test('C8: forgetting clears the server stamps with the local ones, and a late write of an old server stamp is dropped', async () => {
  const store = fakeStore();
  const stamps = new ConsentStamps(store);
  const viaA = stampKey('a', 'e1', 'server-A');
  await stamps.remember(viaA, RUNGS, NOW);
  await stamps.remember(E1, RUNGS, NOW);
  assert.notEqual(stamps.get(viaA, NOW), undefined, 'the fixture starts with a server stamp to forget');
  const alreadyComposed = { ...store.stamps() };

  await stamps.forgetAll(NOW);
  await store.update(STAMPS_KEY, alreadyComposed);

  assert.equal(stamps.get(viaA, NOW), undefined, 'a forgotten server stamp was resurrected by a window that composed it earlier');
  assert.equal(stamps.get(E1, NOW), undefined, 'and so was the local one');
  await stamps.remember(viaA, RUNGS, NOW + 1);
  assert.notEqual(stamps.get(viaA, NOW + 1), undefined, 'a server consent given after the Forget is honoured');
});
