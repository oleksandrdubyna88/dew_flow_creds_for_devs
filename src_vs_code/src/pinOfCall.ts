import { CheckedPin, PinPathKind, PinRefusalField, checkedPin, pinClientSentence, pinPathRefusal, pinPathSentence } from './hostKeyPin';
import { knownHostsPath, materializeKnownHosts } from './hostKeyTrust';
import { forgetMaterializedKey } from './keyInstaller';
import type { PinClientAsk, PinClientCall, ReadablePinClient } from './pinClient';
import type { EntityMetadata } from './types';

/**
 * The pin of ONE call that the extension starts with no terminal, off a bridge (G1, E2: the plan's §3.10 and §3.11): decided before
 * anything is written or started. Every such road asks here: the three roads of the person (`personPin.ts`), the agent's exec
 * (`sshUseActions.ts`). Run with Secrets over SSH holds a pin file that Connect's options wrote before, and asks `checkExistingPin`
 * (`hostKeyPin.ts`) in its place.
 *
 * <p>The order of {@link decidePinOfCall} is the contract. (1) An entry with no saved host key is asked nothing and gets nothing.
 * (2) The rule of the path is asked of the WHOLE path the pin file would have, before a file is written. (3) The `ssh` program the
 * call will start is asked for its version. (4) Only then is the file written, by `materializeKnownHosts`, unchanged. The value for
 * the words is made from the path that was written.</p>
 *
 * <p>Sentences E and F are written here for every road, so that the roads cannot say two things for one refusal.</p>
 */

export type PinDecision =
  /** The entry has no saved host key: the call is unpinned, as before. */
  | { readonly kind: 'none' }
  /** The pin file was written, and its path and the client are checked. */
  | { readonly kind: 'pinned'; readonly pin: CheckedPin }
  /** The saved host key is there and cannot be used (`materializeKnownHosts` answered none). Nothing was written. */
  | { readonly kind: 'unusable' }
  /** The write threw. */
  | { readonly kind: 'unwritten'; readonly error: unknown }
  /** Sentence E or F: nothing may start. */
  | { readonly kind: 'refused'; readonly field: PinRefusalField; readonly message: string };

export interface PinOfCallParts {
  readonly storageDir: string;
  /** The snapshot of the entry that the call holds. */
  readonly entity: EntityMetadata;
  readonly ask: PinClientAsk;
  /** What makes the file this call's alone (a uuid, never vault data). Absent: the entry's own file, `known_hosts-<id>`, which other calls share. */
  readonly suffix?: string;
}

/** Absent is not unusable: the same trim that `parseHostKey` does. */
export function pinAbsent(hostKey: string | undefined): boolean {
  return (hostKey ?? '').trim() === '';
}

const refusedPath = (name: string, kind: PinPathKind): PinDecision => ({ kind: 'refused', field: 'known-hosts-file', message: pinPathSentence(name, kind) });
const refusedClient = (name: string, exitCode: number | null): PinDecision => ({ kind: 'refused', field: 'ssh-program', message: pinClientSentence(name, exitCode) });

/** Decide the pin of one call. `call` says how the call's `ssh` will be started: its program word, its folder, its environment. It never throws. */
export async function decidePinOfCall(parts: PinOfCallParts, call: PinClientCall): Promise<PinDecision> {
  const { storageDir, entity, suffix } = parts;
  if (pinAbsent(entity.hostKey)) {
    return { kind: 'none' };
  }
  const kind = pinPathRefusal(knownHostsPath(storageDir, entity.id, suffix));
  if (kind !== undefined) {
    return refusedPath(entity.name, kind);
  }
  const client = await parts.ask(call);
  return client.kind === 'unreadable' ? refusedClient(entity.name, client.exitCode) : written(parts, client);
}

/** The write. `undefined` from it: the saved key is there and cannot be used. */
function written(parts: PinOfCallParts, client: ReadablePinClient): PinDecision {
  let file: string | undefined;
  try {
    file = materializeKnownHosts(parts.storageDir, parts.entity, parts.suffix);
  } catch (error) {
    return { kind: 'unwritten', error };
  }
  return file === undefined ? { kind: 'unusable' } : checkedOf(parts, file, client);
}

/**
 * The value for the words, from the path that was WRITTEN. The rule passed for the path that was planned, and both come from
 * `knownHostsPath`, so the refusal here is reached only if the two ever differ: then a file that is this call's alone is deleted, and
 * the call is refused. The entry's own file (no suffix) is never deleted here: other calls read it.
 */
function checkedOf(parts: PinOfCallParts, file: string, client: ReadablePinClient): PinDecision {
  const checked = checkedPin(file, client);
  if (checked.ok) {
    return { kind: 'pinned', pin: checked.pin };
  }
  if (parts.suffix !== undefined) {
    forgetMaterializedKey(file);
  }
  return refusedPath(parts.entity.name, checked.kind);
}
