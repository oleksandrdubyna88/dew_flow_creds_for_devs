import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { isIdleCycle, markAfterCycle } from '../syncIdle';

/**
 * When a sync cycle may skip the snapshot and the merge (audit 2026-08-25, C4).
 *
 * <p>An idle cycle used to rebuild the local snapshot — seven keychain reads per entity — and
 * fingerprint three snapshots to learn that nothing had changed. The decision to skip is pure:
 * a mark from the last converged cycle, the storage's change token, the hash of the remote
 * bytes. What matters is the edges: every way either side can move must MISS.</p>
 */

const MARK = { token: '3.1', rawHash: 'sha-of-remote' };

test('nothing moved on either side → idle', () => {
  assert.equal(isIdleCycle(MARK, '3.1', 'sha-of-remote'), true);
});

test('a local write (the token moved) → not idle', () => {
  assert.equal(isIdleCycle(MARK, '4.1', 'sha-of-remote'), false);
});

test('a keychain change event (the secrets epoch moved) → not idle', () => {
  assert.equal(isIdleCycle(MARK, '3.2', 'sha-of-remote'), false);
});

test('a different remote file → not idle', () => {
  assert.equal(isIdleCycle(MARK, '3.1', 'sha-of-other'), false);
});

test('no mark yet (first cycle after startup) → not idle', () => {
  assert.equal(isIdleCycle(undefined, '3.1', 'sha-of-remote'), false);
});

test('no remote yet (the first write to a location still has to happen) → not idle', () => {
  assert.equal(isIdleCycle(MARK, '3.1', undefined), false);
});

test('a cycle that applied nothing and wrote nothing leaves a mark naming its two inputs', () => {
  assert.deepEqual(markAfterCycle(false, false, '3.1', 'sha-of-remote'), MARK);
});

test('a cycle that applied locally leaves no mark — the state it saw no longer exists', () => {
  assert.equal(markAfterCycle(true, false, '3.1', 'sha-of-remote'), undefined);
});

test('a cycle that wrote the remote leaves no mark — the next read will not match anyway', () => {
  assert.equal(markAfterCycle(false, true, '3.1', 'sha-of-remote'), undefined);
});

test('a cycle with no remote leaves no mark', () => {
  assert.equal(markAfterCycle(false, false, '3.1', undefined), undefined);
});
