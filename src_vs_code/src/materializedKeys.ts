import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import { currentOwner, restrictToOwnerArgv } from './fileAcl';

/**
 * The vscode-free half of writing secret material to disk: locking a written file down to
 * its owner, and naming this window's private key directory.
 *
 * <p>These live apart from `keyInstaller.ts` because that module imports `vscode` (its
 * install/remove flows show dialogs), and the agent broker's `agentUseActions.ts` — which
 * needs `lockToOwner` and `materializedKeysDir` — runs partly under plain `node` and cannot
 * load `vscode`. Same reason `keysPurge.ts` holds the sweep decision. `keyInstaller.ts`
 * re-exports both, so its own callers are unchanged.</p>
 */

/**
 * Apply the tightest access this OS can express to a file we just wrote a secret into.
 *
 * <p>POSIX `chmod` is already applied by the callers and is real there. On Windows it is
 * not: the inherited NTFS ACL still grants SYSTEM and the local Administrators group full
 * control. Where the operator is not the administrator that is precisely the wrong
 * audience, so the inheritance is broken and the owner alone is granted.</p>
 *
 * <p>Best-effort by design: a failure here must not stop a key from being usable — it is
 * a hardening step over an already-restricted profile directory, not the only lock.</p>
 */
export function lockToOwner(filePath: string): void {
  const argv = restrictToOwnerArgv(filePath, process.platform, currentOwner(process.env));
  if (argv === undefined) {
    return;
  }
  try {
    childProcess.execFileSync(argv[0], argv.slice(1), { stdio: 'ignore', timeout: 5_000 });
  } catch {
    // An unwritable ACL is a weaker file, not a broken feature.
  }
}

/**
 * The subdirectory of `keys/` this window owns.
 *
 * <p>Materialized key material used to live directly in `keys/`, shared by every window of
 * the same profile — so any window's activate/dispose purged the WHOLE directory, deleting a
 * live SSH session's key or a running script's file out from under a window that did nothing
 * wrong (opening a second window, or reloading one, was enough). Each window now writes under
 * `keys/<pid>/` and purges only its own, so one window can never delete another's in-use
 * file. The pid is stable for a window's extension host and changes on reload — exactly the
 * boundary wanted.</p>
 */
export function materializedKeysDir(storageDir: string): string {
  return path.join(storageDir, 'keys', String(process.pid));
}
