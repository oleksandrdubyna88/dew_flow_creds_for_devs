import * as vscode from 'vscode';
import * as nodePath from 'node:path';
import { LeasedQueue } from './leasedQueue';
import { WindowLock, nodeLockFs } from './windowLock';

/**
 * The one thing `storageManager.ts` has to import to be serialized against other windows.
 *
 * <p>A façade, and deliberately: `leasedQueue.ts` and `windowLock.ts` are free of `vscode` so that
 * the claim, the stale break, the fenced release and the waiting are unit tests. Something still has
 * to reach `vscode` to say "waiting" where a person can see it, and this is that something — the
 * whole vscode-facing surface of the feature, six lines of it.</p>
 *
 * <p>It re-exports what the manager needs so that file gains one import and not three. That file is
 * at its size-ratchet baseline and may not grow by a line; this is not a style preference.</p>
 */
export { LeasedQueue, sweepWithRetry } from './leasedQueue';

/** Under the profile's own storage directory — the one place every window of it already shares. */
const LOCK_DIR = 'write.lock';

/**
 * The write queue for a `StorageManager`.
 *
 * <p>Without a directory it is a plain `SerialQueue`, which is what tests get and what a build with
 * no writable storage falls back to: the behaviour this extension had until now, not a failure.</p>
 */
export function leasedWrites(lockDir?: string): LeasedQueue {
  if (lockDir === undefined || lockDir.length === 0) {
    return new LeasedQueue(undefined);
  }
  return new LeasedQueue(new WindowLock(nodePath.join(lockDir, LOCK_DIR), nodeLockFs()), { notice: waiting });
}

/**
 * What the person sees while another window finishes.
 *
 * <p>The status bar rather than a modal: this is a wait, not a question, and the operation continues
 * on its own. <b>It never names a window</b> — "window 12345" is meaningless to a human and was a
 * review finding on the plan. It names what is happening, which is the part somebody can act on.</p>
 */
function waiting(): () => void {
  const shown = vscode.window.setStatusBarMessage(
    '$(sync~spin) CredsForDevs: another window is writing — waiting for it to finish…',
  );
  return () => shown.dispose();
}
