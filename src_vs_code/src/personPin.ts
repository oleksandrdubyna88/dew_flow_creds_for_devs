import { randomUUID } from 'node:crypto';
import { describeError } from './describeError';
import { PinClientAsk, windowPinClient } from './pinClient';
import { PinDecision, decidePinOfCall } from './pinOfCall';
import type { SshExecAuth } from './sshExecCommand';
import type { EntityMetadata } from './types';
import type { PinOfCall, PinWriter } from './writtenKey';

/**
 * The saved host key of ONE call on the three roads of the person (G1): the bridge socket check, *Install creds on host* and
 * *Open Remote Bridge…*. One of three answers, and never a throw:
 *
 * <ul>
 * <li>the entry has no saved host key (`hostKey` is absent, empty or only white space): unpinned, nothing is asked and nothing is
 *     written;</li>
 * <li>the saved host key can be used: it is written to a file of this call alone, `known_hosts-<entry id>-<uuid>`, and the answer
 *     holds the CHECKED pin (`hostKeyPin.ts`: its path by the rule, its client by its version);</li>
 * <li>refused, with the sentence for the person: the saved host key is there and cannot be used (A), its file cannot be written (B),
 *     the path of its file cannot be handed to `ssh` (E), or the `ssh` program cannot be asked for its version (F). E and F are
 *     decided BEFORE a file is written.</li>
 * </ul>
 *
 * <p>It is called by the guards of `writtenKey.ts` and by nothing else: they keep the path and delete the file. The decision, its
 * order and the write are `decidePinOfCall` (`pinOfCall.ts`), which the agent's exec asks too; `materializeKnownHosts` is unchanged.</p>
 */

/** The program that the three roads start: the bare word, found on `PATH` (`runSshExec`'s default, and the bridge's own `'ssh'`). */
export const PERSON_SSH_PROGRAM = 'ssh';

/**
 * Sentence A: the saved host key is there and cannot be used. The login of the call chooses the form: a password entry is never
 * sent to Connect SSH, because Connect sends the password without a check of the host when its key scan answers nothing.
 */
export function unusablePinSentence(name: string, auth: SshExecAuth): string {
  const opening = `The saved host key of "${name}" cannot be used, so nothing was sent to that host. `;
  return auth === 'askpass'
    ? `${opening}Do not use Connect SSH to save it again: this entry signs in with a password, and when Connect SSH cannot read the host's key first, it sends the password without checking the host. There is no safe repair for such an entry yet; the bridge and the install stay refused for it.`
    : `${opening}Get the host's key fingerprint from the person who runs the server. Then use Connect SSH on this entry, and go on only if it shows that fingerprint: Trust and connect saves the key.`;
}

/** Sentence B: the file of the saved host key could not be written. */
export function pinWriteFailedSentence(name: string, error: unknown): string {
  return `Could not write the saved host key of "${name}" to disk: ${describeError(error)}`;
}

/** What a pin writer of the person is built from: the window's storage folder, the call's snapshot of the entry, and the asker of the client. */
export interface PersonPinParts {
  readonly storageDir: string;
  readonly entity: EntityMetadata;
  readonly ask: PinClientAsk;
}

/** The sentence of a decision that starts nothing: E or F as they were written, A by the login, B with the cause. */
function refusalOf(name: string, auth: SshExecAuth, decided: Exclude<PinDecision, { kind: 'none' | 'pinned' }>): string {
  if (decided.kind === 'refused') {
    return decided.message;
  }
  return decided.kind === 'unusable' ? unusablePinSentence(name, auth) : pinWriteFailedSentence(name, decided.error);
}

/**
 * Decide the pin of one call, and write its file when there is one to write. `auth` only chooses the form of sentence A; `env` is the
 * environment the call's `ssh` will be started with, so the question about the client finds the program that the call will find.
 */
export async function writePersonPin(parts: PersonPinParts, auth: SshExecAuth, env: NodeJS.ProcessEnv): Promise<PinOfCall> {
  const decided = await decidePinOfCall({ ...parts, suffix: randomUUID() }, { program: PERSON_SSH_PROGRAM, env });
  if (decided.kind === 'none') {
    return { ok: true };
  }
  return decided.kind === 'pinned' ? { ok: true, knownHostsFile: decided.pin } : { ok: false, message: refusalOf(parts.entity.name, auth, decided) };
}

/** The pin writer of one call of a road, with this window's asker: what a road hands its guard. */
export function personPinWriter(storageDir: string, entity: EntityMetadata): PinWriter {
  return (auth, env) => writePersonPin({ storageDir, entity, ask: windowPinClient }, auth, env);
}
