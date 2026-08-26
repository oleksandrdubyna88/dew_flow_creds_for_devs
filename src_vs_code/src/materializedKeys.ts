import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
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

/**
 * A file name that cannot leave the directory it is joined to.
 *
 * <p>Both writers below build a name from vault data — an entity id, or a name a caller derived
 * from one. A share cannot reach them (`shareInbox` gives every accepted entry a fresh local id,
 * deliberately), but IMPORT and RESTORE write the envelope's nodes with their own ids, so a
 * crafted backup someone is talked into importing puts an arbitrary id into the tree. An id of
 * `x/../../../../evil` then resolves clean out of `keys/&lt;pid&gt;/` and the entity's private key
 * is written wherever it says.</p>
 *
 * <p><b>It must not collapse two different ids onto one name.</b> That would be the worse bug:
 * two entities sharing a key file means a connection authenticating with the wrong credential,
 * and it would look like a working feature. So anything that had to be rewritten carries a short
 * digest of the ORIGINAL, and a name that needed no rewriting — the ordinary uuid — is passed
 * through untouched, because the file name is also how the purge and the wipe find it again.</p>
 *
 * <p>`vpnCommand.ts` already sanitised its own name for this reason. Doing it here instead of at
 * each caller is the difference between a site that is safe and a site that is safe today.</p>
 */
export function safeFileComponent(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  if (cleaned === name && cleaned.length > 0) {
    return cleaned;
  }
  const digest = crypto.createHash('sha256').update(name).digest('hex').slice(0, 8);
  return `${cleaned.slice(0, 60)}-${digest}`;
}

/**
 * A path inside this window's key directory — the ONE way to build one.
 *
 * <p>That directory holds decrypted private keys, VPN configs, `known_hosts` files and
 * executable script bodies, and every name written there is built from vault data. Sanitising at
 * each call site was tried: four were fixed by hand and enumerating them properly afterwards
 * found two more, both of which write a file with mode 0700 and then execute it. So the sanitiser
 * lives here, on the only road in, and `keysDirPaths.test.ts` fails if anything joins into the
 * directory by hand again.</p>
 *
 * <p>It does not create the directory: callers differ on the mode they want it at, and one that
 * silently created it would make a purge race a write.</p>
 */
export function materializedKeyPath(storageDir: string, name: string): string {
  return path.join(materializedKeysDir(storageDir), safeFileComponent(name));
}
