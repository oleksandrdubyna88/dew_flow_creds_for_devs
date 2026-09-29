import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lockSecret } from '../secretEnvelope';
import {
  FIRST_WAIT_MS,
  FREE_TRIES,
  LONGEST_WAIT_MS,
  attemptUnlock,
  cooldownMs,
  forgetAllAttempts,
  noteRight,
  noteWrong,
} from '../pinAttempts';
import { openStored } from '../pinGate';
import { forgetAllPins } from '../pinSession';

/**
 * D16 — a wrong PIN costs more than a second of scrypt after the fifth one in a row.
 *
 * <p>Before this module an unlocked, unattended window took PIN guesses without limit: the box came
 * back after every miss, and scrypt was the only cost. Five wrong in a row now make the person wait
 * 30 s, doubling to a 15-minute cap; the right PIN resets; nothing is ever wiped for a wrong PIN.
 * Kept in memory only, so a reload starts the count over — which is stated honestly in the help:
 * this slows guessing at a window somebody left open; it does not stop an offline attacker, for
 * whom scrypt is the cost.</p>
 *
 * <p>The clock is an ARGUMENT everywhere below (`now`), so the doubling is asserted at exact
 * instants rather than by sleeping.</p>
 */

const ACCOUNT = 'acct-1';
const ENTITY = 'e1';
const PIN = 'correct-horse-battery';
const T0 = 1_700_000_000_000;

let lockedValue: Promise<string> | undefined;
const locked = (): Promise<string> => (lockedValue ??= lockSecret('hunter2', ACCOUNT, PIN));

test('four wrong PINs cost nothing but the scrypt; the fifth starts a 30 s wait', () => {
  forgetAllAttempts();

  for (let i = 0; i < FREE_TRIES - 1; i += 1) {
    noteWrong(ACCOUNT, ENTITY, T0);
  }
  assert.equal(cooldownMs(ACCOUNT, ENTITY, T0), 0, 'a typo is not an attack');

  noteWrong(ACCOUNT, ENTITY, T0);

  assert.equal(cooldownMs(ACCOUNT, ENTITY, T0), FIRST_WAIT_MS);
  assert.equal(cooldownMs(ACCOUNT, ENTITY, T0 + FIRST_WAIT_MS - 1), 1, 'counted down, not re-armed');
  assert.equal(cooldownMs(ACCOUNT, ENTITY, T0 + FIRST_WAIT_MS), 0, 'and over when the time is up');
});

test('every further wrong PIN doubles the wait, up to fifteen minutes and no further', () => {
  forgetAllAttempts();
  for (let i = 0; i < FREE_TRIES; i += 1) {
    noteWrong(ACCOUNT, ENTITY, T0);
  }
  let expected = FIRST_WAIT_MS;
  let now = T0;
  for (let round = 0; round < 8; round += 1) {
    now += expected;
    noteWrong(ACCOUNT, ENTITY, now);
    expected = Math.min(LONGEST_WAIT_MS, expected * 2);
    assert.equal(cooldownMs(ACCOUNT, ENTITY, now), expected, `wrong PIN number ${FREE_TRIES + round + 1}`);
  }
  assert.equal(expected, LONGEST_WAIT_MS, 'the cap was reached inside the loop, so it was asserted');
});

test('the right PIN resets the count — the next wrong one is a free try again', () => {
  forgetAllAttempts();
  for (let i = 0; i < FREE_TRIES; i += 1) {
    noteWrong(ACCOUNT, ENTITY, T0);
  }
  assert.ok(cooldownMs(ACCOUNT, ENTITY, T0) > 0);

  noteRight(ACCOUNT, ENTITY);
  assert.equal(cooldownMs(ACCOUNT, ENTITY, T0), 0);

  noteWrong(ACCOUNT, ENTITY, T0);
  assert.equal(cooldownMs(ACCOUNT, ENTITY, T0), 0, 'one wrong after a right one is a typo again');
});

test('the count is per entry IN AN ACCOUNT, like the grant it mirrors', () => {
  forgetAllAttempts();
  for (let i = 0; i < FREE_TRIES; i += 1) {
    noteWrong(ACCOUNT, ENTITY, T0);
  }

  assert.equal(cooldownMs(ACCOUNT, 'e2', T0), 0, 'another entry is untouched');
  assert.equal(cooldownMs('acct-2', ENTITY, T0), 0, 'the same id in another profile is another entry');
});

test('attemptUnlock is the choke point: a wrong PIN is counted, the right one opens and resets', async () => {
  forgetAllAttempts();
  const envelope = JSON.parse(await locked()) as never;

  for (let i = 0; i < FREE_TRIES; i += 1) {
    assert.equal(await attemptUnlock(envelope, ACCOUNT, ENTITY, 'not-it', T0), undefined);
  }
  assert.equal(cooldownMs(ACCOUNT, ENTITY, T0), FIRST_WAIT_MS, 'five misses through the choke point arm the wait');

  // While cooling, the right PIN is NOT tried — nothing is spent on scrypt and nothing opens.
  assert.equal(await attemptUnlock(envelope, ACCOUNT, ENTITY, PIN, T0), undefined, 'a cooling entry opens for nobody');

  assert.equal(await attemptUnlock(envelope, ACCOUNT, ENTITY, PIN, T0 + FIRST_WAIT_MS), 'hunter2');
  assert.equal(cooldownMs(ACCOUNT, ENTITY, T0 + FIRST_WAIT_MS), 0, 'and the right PIN resets the count');
});

test('a cooling entry is refused WITHOUT a prompt, and the sentence says how long', async () => {
  // The whole point: after five wrong PINs the box must NOT come back. A gate whose `ask` fails the
  // test is how that is asserted — the old `askOnce` prompted every time and this would have thrown.
  forgetAllAttempts();
  forgetAllPins();
  const now = Date.now();
  for (let i = 0; i < FREE_TRIES; i += 1) {
    noteWrong(ACCOUNT, ENTITY, now);
  }

  const opened = await openStored(await locked(), {
    accountId: ACCOUNT,
    entityId: ENTITY,
    entryName: 'prod-db',
    ask: () => assert.fail('the PIN box was raised while the entry is cooling down'),
  });

  assert.equal(opened.kind, 'cooling');
  const reason = opened.kind === 'cooling' ? opened.reason : '';
  assert.match(reason, /Too many wrong PINs for "prod-db"/);
  assert.match(reason, /Nothing has been changed/, 'a wrong PIN never wipes anything, and the sentence says so');
  assert.match(reason, /try again in (30|29) s/);
});

test('five wrong PINs typed into the box arm the wait — the box is the road people actually take', async () => {
  forgetAllAttempts();
  forgetAllPins();
  const value = await locked();
  const gate = { accountId: ACCOUNT, entityId: ENTITY, entryName: 'prod-db', ask: () => Promise.resolve('wrong-one') };

  for (let i = 0; i < FREE_TRIES; i += 1) {
    assert.equal((await openStored(value, gate)).kind, 'wrong');
  }

  assert.ok(cooldownMs(ACCOUNT, ENTITY, Date.now()) > 0, 'the gate counted through the same choke point');
});
