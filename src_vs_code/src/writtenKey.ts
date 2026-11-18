import type { CheckedPin } from './hostKeyPin';
import { forgetMaterializedKey } from './keyInstaller';
import type { ExecAuth } from './sshExecAuth';
import type { SshExecAuth } from './sshExecCommand';

/**
 * The two files that the extension WROTE for one call of a road of the person, and the rules about them (N16, G1). The KEY file is
 * the one `resolveExecAuth` wrote (`materialized`). The PIN file is the one the pin writer of the call wrote (the saved host key,
 * `personPin.ts`). The caller that got them deletes each when no `ssh` of its own will read the path again.
 *
 * <ul>
 * <li>A credential with no `materialized` (the person's own key file, a password, a refusal) has no key file to delete.</li>
 * <li>A call with no pin (an unpinned entry, a refusal) has no pin file to delete.</li>
 * <li>The two deletes do not depend on each other.</li>
 * <li>Only a path that the pin writer returned in THIS call is deleted as a pin file. No caller hands a guard a pin path.</li>
 * </ul>
 *
 * <p>Both guards take what `resolveExecAuth` answered, as it is, so that no statement stands between the resolve and the guard. Both
 * call the pin writer themselves, inside their guarded span, and hand the road ONE value: the credential and the pin, decided
 * together ({@link CallAuth}). A road cannot hold a credential that is ready without a pin decision.</p>
 */

/**
 * What the pin writer of one call answers: no pin, a pin file written now and CHECKED (its path by the rule, its client by its version:
 * `checkedPin`), or a refusal with its sentence. It never throws.
 */
export type PinOfCall =
  | { readonly ok: true; readonly knownHostsFile?: CheckedPin }
  | { readonly ok: false; readonly message: string };

/**
 * The pin writer of one call, bound to the call's storage folder and to its snapshot of the entry. `auth` is the login of the credential
 * and `env` the environment its `ssh` will be started with. It is asynchronous since E2: before it writes, it asks the `ssh` program for
 * its version, and that is a spawn.
 */
export type PinWriter = (auth: SshExecAuth, env: NodeJS.ProcessEnv) => Promise<PinOfCall>;

/** The call may start `ssh`: the credential, and `knownHostsFile` when the entry is pinned. */
export type ReadyCall = Extract<ExecAuth, { ok: true }> & { readonly knownHostsFile?: CheckedPin };

/** The call starts nothing: the refusal of the credential as it is, or the refusal of the pin in the same shape. */
export interface RefusedCall {
  readonly ok: false;
  readonly message: string;
  readonly warning?: string;
}

/** The ONE value a road reads. */
export type CallAuth = ReadyCall | RefusedCall;

/** Delete the key file written for this credential, when one was. Never throws (`forgetMaterializedKey` is best effort). */
export function forgetWrittenKey(credential: ExecAuth): void {
  if (credential.ok && credential.materialized !== undefined) {
    forgetMaterializedKey(credential.materialized);
  }
}

/** Delete both files of one call: the key file when one was written, and the pin file when one was written. Never throws. */
function forgetBoth(credential: ExecAuth, pinFile: string | undefined): void {
  forgetWrittenKey(credential);
  if (pinFile !== undefined) {
    forgetMaterializedKey(pinFile);
  }
}

/** What one call decided: the value for the road, and the path of the pin file that the writer wrote for it. */
interface Decided {
  readonly call: CallAuth;
  readonly pinFile?: string;
}

/**
 * Decide the credential and the pin of one call together. The pin writer is called only for a credential that is `ok`. A refused
 * credential goes on as it is; a refused pin goes on as a refusal with the pin's sentence and the credential's warning.
 */
async function decide(credential: ExecAuth, writePin: PinWriter): Promise<Decided> {
  if (!credential.ok) {
    return { call: credential };
  }
  const pin = await writePin(credential.auth, credential.env);
  if (!pin.ok) {
    return { call: { ok: false, message: pin.message, warning: credential.warning } };
  }
  const checked = pin.knownHostsFile;
  return checked === undefined ? { call: credential } : { call: { ...credential, knownHostsFile: checked }, pinFile: checked.file };
}

/**
 * Decide the call (the pin is written here, inside the guarded span), run `run` with the decided value, and delete both files of
 * the call when `run` has ended: after its value, after its rejection and after a synchronous throw alike. The value or the SAME
 * error goes on to the caller. A pin writer that throws (it must not) is inside the span too: the key file is deleted and its
 * error goes on.
 */
export async function withWrittenKey<T>(credential: ExecAuth, writePin: PinWriter, run: (call: CallAuth) => Promise<T>): Promise<T> {
  let pinFile: string | undefined;
  try {
    const decided = await decide(credential, writePin);
    pinFile = decided.pinFile;
    return await run(decided.call);
  } finally {
    forgetBoth(credential, pinFile);
  }
}

/** What a started bridge hands back, as much as the handoff reads: its process, whose `exited` settles when the process has ended. */
interface Started {
  readonly process: { readonly exited: Promise<unknown> };
}

/**
 * Decide the call (the pin is written here, inside the guarded span), run `start` with the decided value while both files of the
 * call are the caller's to delete, and hand both files to the process that `start` started.
 *
 * <ul>
 * <li>`start` returns a started thing: ONE continuation on its process's `exited` deletes both files when that process has ended,
 *     whatever ended it; nothing is deleted now.</li>
 * <li>`start` returns `undefined` (nothing was started): both files are deleted at once.</li>
 * <li>`start` or the pin writer throws: what was written is deleted at once and the SAME error goes on to the caller.</li>
 * </ul>
 *
 * <p>`handed` is set by the statement directly after the one that attaches the continuation, with nothing between them: an attach
 * that throws leaves it false and the `finally` deletes; an attach that worked cannot be followed by a throw before the flag. So
 * exactly one of the two deletes runs, on every path, and it deletes both files. `start` is synchronous on purpose: no `await`
 * stands between the start and the attach.</p>
 *
 * <p><b>The one `await` of this guard</b> (E2) is the decision, BEFORE `start`: the pin writer asks the `ssh` program for its version.
 * It stands inside the `try`, so while it waits both files are this guard's: a decision that rejects ends in the `finally`, which
 * deletes what was written. A window that goes away while it waits does not end here: the guard goes on to `start` when the writer settles, and the manager, already disposed, kills what `start` spawned at once and
 * keeps it out of its map (`SshBridgeManager`); the continuation on the process's `exited` then deletes both files. From `start` to the flag the
 * guard is synchronous, as before.</p>
 */
export async function withWrittenKeyUntilExit<T extends Started>(
  credential: ExecAuth,
  writePin: PinWriter,
  start: (call: CallAuth) => T | undefined,
): Promise<T | undefined> {
  let pinFile: string | undefined;
  let handed = false;
  const forget = (): void => forgetBoth(credential, pinFile);
  try {
    const decided = await decide(credential, writePin);
    pinFile = decided.pinFile;
    const started = start(decided.call);
    if (started !== undefined) {
      void started.process.exited.then(forget, forget);
      handed = true;
    }
    return started;
  } finally {
    if (!handed) {
      forget();
    }
  }
}
