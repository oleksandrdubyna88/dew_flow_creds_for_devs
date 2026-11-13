import * as path from 'node:path';
import { bridgedHostWord, bridgedKeyPathProblem, unsafeBridgedUser, unsafeSshConfigValue } from './bridgedSshConfig';
import { Whose, sentences } from './bridgedSshSentences';
import { knownHostsLine, parseHostKey } from './hostKeyPin';
import { materializedKeyPath, materializedKeysDir } from './materializedKeys';
import type { SshCredentialSource, SshCredentialStopped } from './sshCredential';
import { sealedKeyRefusal, stoppedSentence } from './sshExecAuth';
import type { SshExecAuth } from './sshExecCommand';
import type { EntityMetadata } from './types';

/**
 * Pass 1 of a bridged call (the E1.6 spec B5): every refusal, made before anything is written, and the small facts the second pass needs (the
 * `Host` word of a leg, its pin line, what a hop's credential allows). Nothing here touches the disk. The sentences are `bridgedSshSentences.ts`'s.
 */

/** One hop of the chain, with its credential as `resolveSshCredential` answered it. */
export interface BridgedLeg {
  readonly entity: EntityMetadata;
  readonly credential: SshCredentialSource | SshCredentialStopped;
}

export interface BridgedCallInput {
  readonly destination: EntityMetadata;
  readonly auth: SshExecAuth;
  readonly keyPath: string | undefined;
  readonly hops: readonly BridgedLeg[];
}

export interface BridgedBase {
  readonly storageDir: string;
  /** The home the person's own `known_hosts` is read from: injected, so a test and the itest give their own. */
  readonly home: string;
  readonly platform: NodeJS.Platform;
  note(message: string): void;
}

export interface Refusal {
  readonly code: 'no_credential' | 'internal';
  readonly reason: string;
}
export const noCredential = (reason: string): Refusal => ({ code: 'no_credential', reason });

export const firstContactPath = (base: BridgedBase): string => path.join(base.storageDir, 'bridges', 'known_hosts');
export const personPath = (base: BridgedBase): string => path.join(base.home, '.ssh', 'known_hosts');
export const noDefaultIdentity = (base: BridgedBase): string => materializedKeyPath(base.storageDir, 'no-default-identity');

/** The destination first, then each hop in the order `ssh` contacts them. */
export const legsOf = (input: BridgedCallInput): Whose[] => [{ entity: input.destination, hop: false }, ...input.hops.map((leg) => ({ entity: leg.entity, hop: true }))];
export const wordOf = (who: Whose): string | undefined => bridgedHostWord(who.entity.host ?? '', who.hop ? 'hop' : 'destination');
const hasUser = (entity: EntityMetadata): entity is EntityMetadata & { user: string } => entity.user !== undefined && entity.user.length > 0;

function userRefusal(input: BridgedCallInput): Refusal | undefined {
  const bad = legsOf(input).find((who) => hasUser(who.entity) && unsafeBridgedUser(who.entity.user));
  return bad === undefined ? undefined : noCredential(sentences.user(bad));
}

function hostRefusal(input: BridgedCallInput): Refusal | undefined {
  const bad = legsOf(input).find((who) => wordOf(who) === undefined);
  return bad === undefined ? undefined : noCredential(sentences.host(bad));
}

/** R4: two legs with one `Host` word, compared in lower case after the brackets are off. */
function sameHostRefusal(input: BridgedCallInput): Refusal | undefined {
  const words = legsOf(input).map((who) => wordOf(who) as string);
  const again = words.find((word, at) => words.findIndex((other) => other.toLowerCase() === word.toLowerCase()) !== at);
  return again === undefined ? undefined : noCredential(sentences.sameHost(again));
}

export type HopKey = { readonly stored: string } | { readonly typed: string };

/** What a hop's credential allows: a stored key's content, a typed path, or why not (R1-R3). */
export function hopKeyOf(leg: BridgedLeg): HopKey | Refusal {
  const credential = leg.credential;
  const name = leg.entity.name;
  if (credential.kind === 'storedKey') {
    return storedHop(credential.content, name);
  }
  return credential.kind === 'keyPath' ? typedHop(credential.path, name) : noCredential(withoutKey(credential, name));
}

/** A stored key is a hop's key unless it is still sealed (R3). */
function storedHop(content: string, name: string): HopKey | Refusal {
  const sealed = sealedKeyRefusal(content, name);
  return sealed === '' ? { stored: content } : noCredential(sealed);
}

/** A typed path is a hop's key unless it is empty (R2). */
const typedHop = (value: string, name: string): HopKey | Refusal => (value.length > 0 ? { typed: value } : noCredential(sentences.hopNoKey(name)));

/** Why a hop credential that is not a key cannot be used: a password (R1), a value its opener stopped (R3), or nothing at all (R2). */
function withoutKey(credential: Exclude<SshCredentialSource | SshCredentialStopped, { kind: 'storedKey' | 'keyPath' }>, name: string): string {
  if (credential.kind === 'password') {
    return sentences.hopPassword(name);
  }
  return credential.kind === 'stopped' ? stoppedSentence(credential) : sentences.hopNoKey(name);
}

const isRefusal = (value: HopKey | Refusal): value is Refusal => 'reason' in value;

function credentialRefusal(input: BridgedCallInput): Refusal | undefined {
  return input.hops.map(hopKeyOf).find(isRefusal);
}

/** The pin line of an entry for a `Host` word (`ssh` looks a host up in lower case and with no brackets: X12), or `undefined` when the entry pins no usable key. */
export function pinLineOf(entity: EntityMetadata, word: string): string | undefined {
  const key = parseHostKey(entity.hostKey);
  return key === undefined ? undefined : knownHostsLine(word.toLowerCase(), entity.port, key);
}

/** R5: a password goes only to a destination whose key is pinned. */
function passwordRefusal(input: BridgedCallInput): Refusal | undefined {
  const word = wordOf({ entity: input.destination, hop: false }) as string;
  return input.auth === 'askpass' && pinLineOf(input.destination, word) === undefined ? noCredential(sentences.passwordNoPin(input.destination.name)) : undefined;
}

/** The key paths a person typed or a call names: the `-i` path (typed, or the file written for this call) and each typed hop path. */
function keyPathsOf(input: BridgedCallInput): { who: Whose; value: string }[] {
  const own = input.keyPath === undefined ? [] : [{ who: { entity: input.destination, hop: false }, value: input.keyPath }];
  const hops = input.hops.flatMap((leg) => {
    const key = hopKeyOf(leg);
    return 'typed' in key ? [{ who: { entity: leg.entity, hop: true }, value: key.typed }] : [];
  });
  return [...own, ...hops];
}

/** `%` is R10, any other fault of a key path R6. */
function keyPathRefusal(who: Whose, value: string): Refusal | undefined {
  const problem = bridgedKeyPathProblem(value);
  if (problem === undefined) {
    return undefined;
  }
  return noCredential(problem === 'percent' ? sentences.percent(who) : sentences.keyPath(who));
}

function ownPathRefusal(base: BridgedBase): Refusal | undefined {
  if (unsafeSshConfigValue(materializedKeysDir(base.storageDir))) {
    return noCredential(sentences.keysFolder());
  }
  return unsafeSshConfigValue(firstContactPath(base)) || unsafeSshConfigValue(personPath(base)) ? noCredential(sentences.knownHostsPath()) : undefined;
}

function pathRefusal(base: BridgedBase, input: BridgedCallInput): Refusal | undefined {
  return keyPathsOf(input).map((typed) => keyPathRefusal(typed.who, typed.value)).find((refusal) => refusal !== undefined) ?? ownPathRefusal(base);
}

/** What is wrong with the legs themselves: a user, a host, or two legs with one host. */
function legsRefusal(input: BridgedCallInput): Refusal | undefined {
  return userRefusal(input) ?? hostRefusal(input) ?? sameHostRefusal(input);
}

/** The first refusal, in this order: users, hosts, equal hosts, hop credentials, a password with no pin, paths. */
export function refusalOf(base: BridgedBase, input: BridgedCallInput): Refusal | undefined {
  return legsRefusal(input) ?? credentialRefusal(input) ?? passwordRefusal(input) ?? pathRefusal(base, input);
}
