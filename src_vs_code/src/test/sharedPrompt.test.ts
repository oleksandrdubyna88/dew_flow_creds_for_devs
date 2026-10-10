import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ABANDONED, SharedPrompts } from '../sharedPrompt';

/**
 * One prompt, shared by every request waiting on the same answer — and left by any request whose client
 * is gone (`PLAN_wsl_bridge_outlives_its_client.md` §5.7).
 *
 * <p>The prompt is played by a promise the test settles, and `ask` reads `stillWanted` the moment it
 * settles — exactly where the broker reads it before applying an Allow.</p>
 */

interface Scripted {
  /** How many times a prompt was raised. */
  raised: number;
  /** What `stillWanted` said when each answer landed. */
  wantedAtAnswer: boolean[];
  /** Answer the open prompt. */
  answer(value: string): void;
  ask: (stillWanted: () => boolean) => Promise<string>;
}

function scripted(): Scripted {
  const s: Scripted = {
    raised: 0,
    wantedAtAnswer: [],
    answer: () => undefined,
    ask: async (stillWanted) => {
      s.raised += 1;
      const value = await new Promise<string>((resolve) => {
        s.answer = resolve;
      });
      s.wantedAtAnswer.push(stillWanted());
      return value;
    },
  };
  return s;
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

test('a waiter whose request ends leaves at once, without waiting for the answer', async () => {
  const prompts = new SharedPrompts<string>();
  const s = scripted();
  const request = new AbortController();

  const waiting = prompts.join('grant', request.signal, s.ask);
  request.abort();

  assert.equal(await waiting, ABANDONED);
  assert.equal(prompts.isOpen('grant'), true, 'the prompt itself cannot be closed, so it stays open');
});

test('an answer that lands after every waiter left is NOT wanted — that is what defuses the modal', async () => {
  const prompts = new SharedPrompts<string>();
  const s = scripted();
  const request = new AbortController();

  const waiting = prompts.join('grant', request.signal, s.ask);
  request.abort();
  await waiting;
  s.answer('Allow');
  await tick();

  assert.deepEqual(s.wantedAtAnswer, [false], 'a late Allow would be applied for a request nobody waits for');
  assert.equal(prompts.isOpen('grant'), false, 'the answered prompt is forgotten');
});

test('two waiters on one prompt: one leaves, the other is still answered, and the answer IS wanted', async () => {
  const prompts = new SharedPrompts<string>();
  const s = scripted();
  const stays = new AbortController();
  const leaves = new AbortController();

  const first = prompts.join('grant', stays.signal, s.ask);
  const second = prompts.join('grant', leaves.signal, s.ask);
  leaves.abort();
  s.answer('Allow');

  assert.equal(await second, ABANDONED);
  assert.equal(await first, 'Allow');
  assert.equal(s.raised, 1, 'two waiters on one key share one prompt');
  assert.deepEqual(s.wantedAtAnswer, [true], 'the live waiter lost its answer to the one that left');
});

test('a request that has already ended neither joins nor raises a prompt', async () => {
  const prompts = new SharedPrompts<string>();
  const s = scripted();
  const gone = new AbortController();
  gone.abort();

  assert.equal(await prompts.join('grant', gone.signal, s.ask), ABANDONED);
  assert.equal(s.raised, 0, 'a modal was raised for a request already gone');
});

test('a new request does not join a prompt every earlier waiter left — it is asked with its own details', async () => {
  // The review gate's finding on E4.S1 (code round 2): the defused modal stays on screen showing the
  // request that LEFT — its command, its caller. A later request joining it would be allowed by a person
  // reading somebody else's command. So an orphaned prompt takes no new waiters; it is answered to nobody.
  const prompts = new SharedPrompts<string>();
  const first = scripted();
  const second = scripted();
  const gone = new AbortController();
  const later = new AbortController();

  const left = prompts.join('grant', gone.signal, first.ask);
  gone.abort();
  await left;
  const joined = prompts.join('grant', later.signal, second.ask);

  assert.equal(second.raised, 1, 'the later request joined a modal showing the request that had left');
  first.answer('Allow');
  await tick();
  assert.deepEqual(first.wantedAtAnswer, [false], 'the orphaned modal decided something');
  second.answer('Deny');
  assert.equal(await joined, 'Deny');
  assert.deepEqual(second.wantedAtAnswer, [true]);
  assert.equal(prompts.isOpen('grant'), false, 'the stale prompt settling later must not forget the new one');
});

test('different keys are different prompts', async () => {
  const prompts = new SharedPrompts<string>();
  const a = scripted();
  const b = scripted();

  const first = prompts.join('one', new AbortController().signal, a.ask);
  const second = prompts.join('two', new AbortController().signal, b.ask);
  a.answer('Allow');
  b.answer('Deny');

  assert.equal(await first, 'Allow');
  assert.equal(await second, 'Deny');
});

test('a prompt that fails fails every waiter still attached, and is forgotten', async () => {
  const prompts = new SharedPrompts<string>();

  const waiting = prompts.join('grant', new AbortController().signal, () => Promise.reject(new Error('no window')));

  await assert.rejects(waiting, /no window/);
  await tick();
  assert.equal(prompts.isOpen('grant'), false);
});

test('a request that leaves in the same tick as the answer arrives does not get that answer applied', async () => {
  // The consultant's ordering (a): the modal resolves, and the request's signal fires before any
  // continuation runs. `stillWanted` is read in that continuation, so it must already see the request gone.
  const prompts = new SharedPrompts<string>();
  const s = scripted();
  const request = new AbortController();

  const waiting = prompts.join('grant', request.signal, s.ask);
  s.answer('Allow');
  request.abort();

  assert.equal(await waiting, ABANDONED);
  await tick();
  assert.deepEqual(s.wantedAtAnswer, [false], 'an Allow was applied for a request that left as it arrived');
});
