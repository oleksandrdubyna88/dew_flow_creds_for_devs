import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_CONCURRENT_EXECS } from '../brokerProtocol';
import { ExecSlots } from '../execSlots';
import { world } from './brokerWorld';

/** The bounded concurrency of the agent's exec actions: moved out of `credsAgentServer.ts` to pay for the launch gate (E1.3 epoch 3, A.3.8). */

test('ExecSlots hands out exactly its cap and then refuses with undefined', () => {
  const slots = new ExecSlots(3);
  const held = [slots.acquire(), slots.acquire(), slots.acquire()];
  assert.ok(held.every((release) => typeof release === 'function'), 'the first three are granted');
  assert.equal(slots.acquire(), undefined, 'the fourth is refused: the cap is the cap');
});

test('a released slot is available again, and the cap holds afterwards', () => {
  const slots = new ExecSlots(1);
  const release = slots.acquire();
  assert.equal(slots.acquire(), undefined);
  release?.();
  const again = slots.acquire();
  assert.equal(typeof again, 'function', 'the freed slot is granted');
  assert.equal(slots.acquire(), undefined, 'and only one of them');
});

test('releasing a slot twice frees it once: the second call is a no-op and cannot open a ninth slot', () => {
  const slots = new ExecSlots(2);
  const first = slots.acquire();
  const second = slots.acquire();
  first?.();
  first?.();
  assert.equal(typeof slots.acquire(), 'function', 'one slot came back');
  assert.equal(slots.acquire(), undefined, 'a double release did not free the second holder\'s slot');
  second?.();
  assert.equal(typeof slots.acquire(), 'function', 'the second holder\'s own release still works');
});

test('the broker hands the actions this cap: MAX_CONCURRENT_EXECS slots and then undefined, and a release makes room again', () => {
  const w = world({});
  try {
    const held = Array.from({ length: MAX_CONCURRENT_EXECS }, () => w.server.acquireExecSlot());
    assert.ok(held.every((release) => typeof release === 'function'), `${MAX_CONCURRENT_EXECS} are granted`);
    assert.equal(w.server.acquireExecSlot(), undefined, 'the next is refused');
    held[0]?.();
    assert.equal(typeof w.server.acquireExecSlot(), 'function', 'and a release makes room');
  } finally {
    w.server.dispose();
  }
});

test('acquireExecSlot is the bound function the actions are handed (they take it off the server as a bare value)', () => {
  const w = world({});
  try {
    const { acquireExecSlot } = w.server;
    assert.equal(typeof acquireExecSlot(), 'function', 'it works without its receiver');
  } finally {
    w.server.dispose();
  }
});
