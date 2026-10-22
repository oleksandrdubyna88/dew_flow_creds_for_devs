import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SigningWindows } from '../sshAgentWindows';

/**
 * The holder of the SSH agent's windows (#197, E3.1/E3.3), on its own: no editor, no manager. What the book MEANS is
 * `allowWindows.test.ts`; what the manager does with the holder is `sshAgentManagerWindows.test.ts`. What is only
 * true here is the order the holder reads its two clocks in — the gate's "one reading of the clock" accounting and
 * the stepped clocks of the manager suites both lean on it.
 */

test('moment() reads the wall clock first and the monotonic clock second, once each', () => {
  const reads: string[] = [];
  const windows = new SigningWindows(
    () => {
      reads.push('wall');
      return new Date(1_800_000_000_000);
    },
    () => {
      reads.push('mono');
      return 50_000;
    },
    () => undefined,
  );

  const at = windows.moment();

  assert.deepEqual(reads, ['wall', 'mono']);
  assert.deepEqual(at, { wall: 1_800_000_000_000, mono: 50_000 });
  windows.dispose();
});
