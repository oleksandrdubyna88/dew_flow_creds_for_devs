import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deadPidSubdirs } from '../keysPurge';

/**
 * The failure this guards: materialized SSH keys and script files lived directly in a
 * `keys/` directory shared by every window, and any window's activate/dispose deleted the
 * WHOLE directory — clobbering a live SSH session's key in another window. Each window now
 * owns `keys/<pid>/`; the sweep must reclaim a crashed window's leftovers without ever
 * touching a live one's.
 */

test('only numeric subdirs of dead processes are swept', () => {
  const alive = new Set([100, 200]);

  const swept = deadPidSubdirs(['100', '200', '300', 'legacy.key', 'abc', '0'], (pid) =>
    alive.has(pid),
  );

  // 100/200 belong to live windows — never touched. 300 is a dead window's leftovers.
  // legacy.key/abc are not pid dirs; 0 is not a real pid.
  assert.deepEqual(swept, ['300']);
});

test('a live window keeps its directory even when it is the only one', () => {
  assert.deepEqual(
    deadPidSubdirs(['4242'], () => true),
    [],
  );
});

test('everything is swept when nothing is alive', () => {
  assert.deepEqual(
    deadPidSubdirs(['1', '2', '3'], () => false),
    ['1', '2', '3'],
  );
});
