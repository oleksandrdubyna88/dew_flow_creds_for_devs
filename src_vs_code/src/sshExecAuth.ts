import * as crypto from 'node:crypto';
import { describeError } from './describeError';
import { StorageManager } from './storageManager';
import { SshExecAuth } from './sshExecCommand';
import { resolveSshCredential } from './sshCredential';
import { askpassEnv } from './sshAskpass';
import { materializePrivateKey, writeAskpassScriptFile } from './keyInstaller';
import { EntityMetadata } from './types';

/**
 * Turning a saved credential into what a NON-INTERACTIVE `ssh` needs: a key path, an
 * environment, and which of the two authentication modes the argv must be built for.
 *
 * <p><b>This exists because it was written twice and the second copy only handled one case.</b>
 * The agent exec path resolved all four credential kinds — a stored key, a key file on disk, a
 * password through `SSH_ASKPASS`, and none at all. The `ssh -R` bridge, added later, resolved
 * `storedKey` and passed `undefined` for the other three. An entity that authenticates by
 * password therefore got a bridge with no credential, and — because the bridge argv also set no
 * `BatchMode` — `ssh` did not refuse it. It waited at a password prompt on a pipe, forever, with
 * a live process and an established connection, while the window said the bridge was open.</p>
 *
 * <p>So the resolution lives in one place and every caller gets all four kinds. What is
 * deliberately NOT here is the reporting: this returns a `warning` rather than showing one, and
 * a neutral failure rather than a broker error code, because the two callers must present them
 * differently and a function that pops a dialog cannot be unit-tested.</p>
 */
export type ExecAuth =
  | {
      readonly ok: true;
      readonly keyPath?: string;
      readonly env: NodeJS.ProcessEnv;
      readonly auth: SshExecAuth;
      /** Set only when a key was WRITTEN for this call, and only that caller may delete it. */
      readonly materialized?: string;
      readonly warning?: string;
    }
  | {
      readonly ok: false;
      readonly reason: 'no_credential' | 'internal';
      readonly message: string;
      readonly warning?: string;
    };

/**
 * Resolve the credential saved for one entity.
 *
 * <p>The key is materialized per CALL, under a name of this call's own: the file name decides
 * who may delete it, and a shared one meant the first call to finish pulled the key out from
 * under every other that was still authenticating with it.</p>
 */
// eslint-disable-next-line complexity
export async function resolveExecAuth(
  storage: StorageManager,
  accountId: string,
  entity: EntityMetadata,
  storageDir: string,
): Promise<ExecAuth> {
  const source = await resolveSshCredential(storage, accountId, entity);
  const warning = source.warning;

  if (source.kind === 'none') {
    return {
      ok: false,
      reason: 'no_credential',
      message: `"${entity.name}" has no stored password or key any more.`,
      warning,
    };
  }
  if (source.kind === 'password') {
    const scriptPath = writeAskpassScriptFile(storageDir, process.platform);
    return {
      ok: true,
      auth: 'askpass',
      // spawn REPLACES the environment rather than merging it (unlike createTerminal), so the
      // parent's PATH and HOME must be carried in explicitly — without them ssh is unresolvable
      // and known_hosts is not found.
      env: { ...process.env, ...askpassEnv(scriptPath, source.password, process.platform) },
      warning,
    };
  }
  if (source.kind === 'keyPath') {
    return { ok: true, keyPath: source.path, env: { ...process.env }, auth: 'key', warning };
  }
  try {
    const keyPath = materializePrivateKey(
      storageDir,
      `${source.keyEntityId}-${crypto.randomUUID()}`,
      source.content,
    );
    return { ok: true, keyPath, env: { ...process.env }, auth: 'key', materialized: keyPath, warning };
  } catch (error) {
    return {
      ok: false,
      reason: 'internal',
      message: `Could not write the stored key to disk: ${describeError(error)}`,
      warning,
    };
  }
}
