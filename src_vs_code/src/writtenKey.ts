import { forgetMaterializedKey } from './keyInstaller';
import type { ExecAuth } from './sshExecAuth';

/**
 * The key file that `resolveExecAuth` WROTE for one call, and the one rule about it (N16): the caller that got `materialized` deletes
 * the file when no `ssh` of its own will read the path again. A credential with no `materialized` (the person's own key file, a
 * password, a refusal) deletes nothing: the extension did not write it.
 *
 * <p>Both functions take what `resolveExecAuth` answered, as it is, so that no statement stands between the resolve and the guard.</p>
 */

/** Delete the key file written for this credential, when one was. Never throws (`forgetMaterializedKey` is best effort). */
export function forgetWrittenKey(credential: ExecAuth): void {
  if (credential.ok && credential.materialized !== undefined) {
    forgetMaterializedKey(credential.materialized);
  }
}

/**
 * Run `run` and delete the key file of `credential` when it has ended: after its value, after its rejection and after a synchronous
 * throw alike. The value or the SAME error goes on to the caller.
 */
export async function withWrittenKey<T>(credential: ExecAuth, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } finally {
    forgetWrittenKey(credential);
  }
}

/** What a started bridge hands back, as much as the handoff reads: its process, whose `exited` settles when the process has ended. */
interface Started {
  readonly process: { readonly exited: Promise<unknown> };
}

/**
 * Run `start` while the key file of `credential` is the caller's to delete, and hand the file to the process that `start` started.
 *
 * <ul>
 * <li>`start` returns a started thing: ONE continuation on its process's `exited` deletes the file when that process has ended,
 *     whatever ended it; nothing is deleted now.</li>
 * <li>`start` returns `undefined` (nothing was started): the file is deleted at once.</li>
 * <li>`start` throws: the file is deleted at once and the SAME error goes on to the caller.</li>
 * </ul>
 *
 * <p>`handed` is set by the statement directly after the one that attaches the continuation, with nothing between them: an attach
 * that throws leaves it false and the `finally` deletes; an attach that worked cannot be followed by a throw before the flag. So
 * exactly one of the two deletes runs, on every path. `start` is synchronous on purpose: no `await` stands between the start and
 * the attach.</p>
 */
export function withWrittenKeyUntilExit<T extends Started>(credential: ExecAuth, start: () => T | undefined): T | undefined {
  let handed = false;
  try {
    const started = start();
    if (started !== undefined) {
      const forget = (): void => forgetWrittenKey(credential);
      void started.process.exited.then(forget, forget);
      handed = true;
    }
    return started;
  } finally {
    if (!handed) {
      forgetWrittenKey(credential);
    }
  }
}
