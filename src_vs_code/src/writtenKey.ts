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
