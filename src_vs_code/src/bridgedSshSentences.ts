import * as crypto from 'node:crypto';
import { HostKey, hostKeyFingerprint } from './hostKeyPin';
import type { EntityMetadata } from './types';

/**
 * The journal sentences of a bridged `ssh:exec` (the E1.6 spec §S6.4, R1-R10, J1, J2) and the reading of a known-hosts file they need.
 *
 * <p>Pure, no `vscode`, no `fs`. Every sentence says what the code has just checked and nothing about what comes next, and R6 and R10 hold
 * no part of a value: a path, a user and a host are named by the entry they belong to, never quoted. The agent reads none of these: it
 * reads `BRIDGE_USE_REFUSED(<entry of the call>)` and nothing else.</p>
 */

/** Whose value it is: the entry of the call, or a jump host of its chain. */
export interface Whose {
  readonly entity: EntityMetadata;
  readonly hop: boolean;
}

const of = (who: Whose, what: string): string => (who.hop ? `the ${what} of the jump host "${who.entity.name}"` : `the ${what} of "${who.entity.name}"`);

const R6_USER = 'is not a valid user name, or holds "$" or a backslash';
const R6_HOST = 'is not a valid host, or holds ":" or a square bracket and is not an IPv6 address in the form a bridge takes';
const R6_PATH = 'is empty, or holds a quote, a control character or "${", or ends with a backslash';

const r6 = (field: string, why: string): string => `A value of this call cannot be given to ssh through a Remote Bridge: ${field} ${why}.`;

export const sentences = {
  /** R1 */ hopPassword: (hop: string): string => `The jump host "${hop}" logs in by password. Through a Remote Bridge a jump host needs a key of its own.`,
  /** R2 */ hopNoKey: (hop: string): string => `The jump host "${hop}" has no key. Through a Remote Bridge a jump host needs a key of its own.`,
  /** R4 */ sameHost: (word: string): string => `Two connections of this call go to the host "${word}". Through a Remote Bridge the destination and each jump host need a different host.`,
  /** R5 */ passwordNoPin: (entry: string): string => `"${entry}" logs in by password and pins no host key. Through a Remote Bridge a password goes only to a host whose key is pinned.`,
  /** R6, a user */ user: (who: Whose): string => r6(of(who, 'user'), R6_USER),
  /** R6, a host */ host: (who: Whose): string => r6(of(who, 'host'), R6_HOST),
  /** R6, the key path of an entry */ keyPath: (who: Whose): string => r6(of(who, 'key path'), R6_PATH),
  /** R6, our own folders */ keysFolder: (): string => r6('the keys folder', R6_PATH),
  /** R6, the known-hosts paths */ knownHostsPath: (): string => r6('the known-hosts path', R6_PATH),
  /** R7 */ writeFailed: (why: string): string => `Could not write the files of this call: ${why}`,
  /** R8 */ argvRefused: (entry: string): string => `"${entry}" cannot be given to ssh through a Remote Bridge: its host, its user or its key path is not one a bridge takes.`,
  /** R9 */ noHopEntries: (): string => 'The jump chain of this call gave no entries to check.',
  /** R10 */ percent: (who: Whose): string => `A Remote Bridge does not support "%" in a key path: ${of(who, 'key path')}. Choose a key file whose absolute path has no "%".`,
  /** J1 */ firstContactAdded: (entry: string, firstField: string, algorithm: string, fingerprint: string): string =>
    `${entry}: first contact through a Remote Bridge: ${firstField} ${algorithm} ${fingerprint} was added to bridges/known_hosts`,
  /** J2 */ firstContactNotKept: (entry: string, name: string): string =>
    `${entry}: after this call no host key line for ${name} is in bridges/known_hosts, and none that this check can read is in your own known_hosts. `
    + 'If ssh reached that host in this call, it accepted the key and kept no record, and the next call accepts any key.',
};

/** The lines of a known-hosts text that a person or `ssh` wrote: no blank line, no comment. */
export function knownHostsLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
}

/** Whether one comma-separated part of a line's first field is the name, or is a hashed part (`|1|<salt>|<hash>`) that the name matches by HMAC-SHA1. */
function partNames(part: string, name: string): boolean {
  if (!part.startsWith('|1|')) {
    return part === name;
  }
  const [, , salt, hash] = part.split('|');
  if (salt === undefined || hash === undefined) {
    return false;
  }
  return crypto.createHmac('sha1', Buffer.from(salt, 'base64')).update(name).digest('base64') === hash;
}

/**
 * Whether a known-hosts text holds a line for the name. A pattern line and a certificate-authority line are not read: the line must be
 * a plain one (no `@marker`), and the name must equal a part of its first field or match a hashed part.
 */
export function knownHostsHolds(text: string, name: string): boolean {
  return knownHostsLines(text).some((line) => !line.startsWith('@') && (line.split(/\s+/)[0] ?? '').split(',').some((part) => partNames(part, name)));
}

/** The fingerprint of a key line's key, or a plain words when the key cannot be read (the line is still reported). */
function fingerprintOf(key: HostKey): string {
  try {
    return hostKeyFingerprint(key);
  } catch {
    return '(no fingerprint could be read)';
  }
}

/** J1 for a line that was not there before, or nothing for a line that is not a key line. */
export function addedSentence(entry: string, line: string): string | undefined {
  const [first, algorithm, base64] = line.split(/\s+/);
  if (first === undefined || algorithm === undefined || base64 === undefined) {
    return undefined;
  }
  return sentences.firstContactAdded(entry, first, algorithm, fingerprintOf({ algorithm, base64 }));
}

/** The lines of `after` that are not in `before`, each count kept: a line added twice is two lines. */
function addedLines(before: readonly string[], after: readonly string[]): string[] {
  const counts = new Map<string, number>();
  before.forEach((line) => counts.set(line, (counts.get(line) ?? 0) + 1));
  return after.filter((line) => {
    const left = counts.get(line) ?? 0;
    counts.set(line, left - 1);
    return left <= 0;
  });
}

/**
 * What the call leaves in the journal about first contact: J1 for each line added to `bridges/known_hosts` since the writer read it, and J2 for
 * each first-contact leg whose name is in neither file. `before` is the lines the writer kept; `own` and `person` are the two files as they are now.
 */
export function firstContactSentences(entry: string, before: readonly string[], own: string, person: string, names: readonly string[]): string[] {
  const added = addedLines(before, knownHostsLines(own)).flatMap((line) => addedSentence(entry, line) ?? []);
  const kept = names.filter((name) => !knownHostsHolds(own, name) && !knownHostsHolds(person, name));
  return [...added, ...kept.map((name) => sentences.firstContactNotKept(entry, name))];
}
