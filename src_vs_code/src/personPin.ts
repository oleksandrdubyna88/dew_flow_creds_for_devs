import { randomUUID } from 'node:crypto';
import { describeError } from './describeError';
import { materializeKnownHosts } from './hostKeyTrust';
import type { SshExecAuth } from './sshExecCommand';
import type { EntityMetadata } from './types';
import type { PinOfCall } from './writtenKey';

/**
 * The saved host key of ONE call on the three roads of the person (G1): the bridge socket check, *Install creds on host* and
 * *Open Remote Bridge…*. One of three answers, and never a throw:
 *
 * <ul>
 * <li>the entry has no saved host key (`hostKey` is absent, empty or only white space): unpinned, nothing is written;</li>
 * <li>the saved host key can be used: it is written to a file of this call alone, `known_hosts-<entry id>-<uuid>`, and the answer
 *     holds the path;</li>
 * <li>the saved host key is there and cannot be used, or its file cannot be written: refused, with the sentence for the person.</li>
 * </ul>
 *
 * <p>It is called by the guards of `writtenKey.ts` and by nothing else: they keep the path and delete the file. The parse and the
 * write are `materializeKnownHosts`, unchanged; the agent's exec calls that function too and still reads `undefined` as "no pin".</p>
 */

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

/** Absent is not unusable: the same trim that `parseHostKey` does. */
function isAbsent(hostKey: string | undefined): boolean {
  return (hostKey ?? '').trim() === '';
}

/** Decide the pin of one call, and write its file when there is one to write. `auth` only chooses the form of sentence A. */
export function writePersonPin(storageDir: string, entity: EntityMetadata, auth: SshExecAuth): PinOfCall {
  if (isAbsent(entity.hostKey)) {
    return { ok: true };
  }
  try {
    const knownHostsFile = materializeKnownHosts(storageDir, entity, randomUUID());
    return knownHostsFile === undefined ? { ok: false, message: unusablePinSentence(entity.name, auth) } : { ok: true, knownHostsFile };
  } catch (error) {
    return { ok: false, message: pinWriteFailedSentence(entity.name, error) };
  }
}
