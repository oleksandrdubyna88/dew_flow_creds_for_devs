import * as fs from 'node:fs';
import * as path from 'node:path';
import { describeError } from './describeError';
import { HopBlock, bridgedConfigText, knownHostsName } from './bridgedSshConfig';
import { BRIDGED_ENV_EXTRA, bridgedSshEnv } from './bridgedSshEnv';
import {
  BridgedBase,
  BridgedCallInput,
  HopKey,
  fieldRefusal,
  firstContactPath,
  hopKeyOf,
  legsOf,
  noDefaultIdentity,
  personPath,
  pinLineOf,
  refusalOf,
  wordOf,
} from './bridgedSshRefusals';
import { Whose, firstContactSentences, knownHostsLines, sentences } from './bridgedSshSentences';
import { materializeCallKey } from './keyInstaller';
import { BRIDGED_CONFIG_FILE, bridgedCallFolder, callKeyName, lockToOwner, materializedKeyPath, materializedKeysDir } from './materializedKeys';
import { resolveSshCredential } from './sshCredential';
import { SshExecAuth, buildSshExecArgv } from './sshExecCommand';
import { hopOf } from './sshOptions';
import type { StorageManager } from './storageManager';
import type { EntityMetadata } from './types';

export type { BridgedBase, BridgedCallInput, BridgedLeg } from './bridgedSshRefusals';

/**
 * The files of ONE bridged `ssh:exec` call, and the spawn that reads them (parent §4.9, the E1.6 spec B5): the per-call `ssh_config`
 * (`bridgedSshConfig.ts`), the key file of each hop, the pin file of each pinned leg, and the first-contact file `bridges/known_hosts`.
 *
 * <p>Two passes. The first writes nothing and refuses; the second writes, and a failure in it removes what it wrote. Every refusal is
 * made before any spawn. `bridgedSpawn` builds the argv, the environment and the `cwd` of the spawn from what the writer checked, so no hop
 * and no environment name can be in them that the rules did not see.</p>
 */

export type BridgedCallFiles =
  | {
      readonly ok: true;
      readonly cwd: string;
      readonly configFile: typeof BRIDGED_CONFIG_FILE;
      readonly pinned: boolean;
      /** The `-J` text, built with `hopOf` from the hop entries THIS call checked; `undefined` with no hop. */
      readonly jump: string | undefined;
      /** After the run, in the caller's `finally`: the journal sentences J1 and J2 of §S6.4. Never throws. */
      afterRun(): readonly string[];
      /** Removes every file and the folder this call wrote. Never throws; a failure is one note. */
      remove(): void;
    }
  | { readonly ok: false; readonly code: 'no_credential' | 'internal'; readonly reason: string };

/** What `execOverSsh` hands the writer: the destination as it resolved its credential, and the hop entries of the chain. */
export type BridgedSshConfigWriter = (call: {
  readonly accountId: string;
  readonly destination: EntityMetadata;
  readonly auth: SshExecAuth;
  readonly keyPath: string | undefined;
  readonly hops: readonly EntityMetadata[];
}) => Promise<BridgedCallFiles>;

// ---- pass 2: the files ---------------------------------------------------------------------------------------------------------------

/** What pass 1 decided for one leg. */
interface Leg {
  readonly who: Whose;
  readonly word: string;
  readonly pinLine: string | undefined;
}

const legOf = (who: Whose): Leg => {
  const word = wordOf(who) as string;
  return { who, word, pinLine: pinLineOf(who.entity, word) };
};

/** What this call has written so far: the files (removed by `remove()`), and its folder. */
interface Written {
  readonly files: string[];
  dir?: string;
}

function writeFile(file: string, content: string): string {
  fs.writeFileSync(file, content, { mode: 0o600 });
  lockToOwner(file);
  return file;
}

/** The key file of each stored hop (a random name, no id in it, `materializeCallKey`); a typed path is used as typed and never copied. */
function writeKeys(base: BridgedBase, keys: readonly HopKey[], written: Written): string[] {
  return keys.map((key) => {
    if ('typed' in key) {
      return key.typed;
    }
    const file = materializeCallKey(base.storageDir, key.stored);
    written.files.push(file);
    return file;
  });
}

/** One pin file for each pinned leg: a line, a random name with no id in it (the destination first, then each hop). */
function writePins(base: BridgedBase, legs: readonly Leg[], written: Written): (string | undefined)[] {
  return legs.map((leg) => {
    if (leg.pinLine === undefined) {
      return undefined;
    }
    const file = materializedKeyPath(base.storageDir, `${callKeyName()}.known_hosts`);
    written.files.push(file); // before the write: a write that fails half way leaves a file this call must still remove
    return writeFile(file, leg.pinLine);
  });
}

/** A known-hosts file as text: a file that is not there is an empty one (first contact); any other failure is an error to surface, not an empty file. */
function readText(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

/**
 * Under `accept-new`, `ssh` goes on when it cannot write the new line, and then nothing is recorded: so a call with a first-contact leg
 * does not start when the file cannot be opened for writing. `bridges/` is made (0700) and the file opened for append (made 0600).
 */
function openFirstContact(base: BridgedBase, legs: readonly Leg[]): void {
  fs.mkdirSync(path.dirname(firstContactPath(base)), { recursive: true, mode: 0o700 });
  if (legs.some((leg) => leg.pinLine === undefined)) {
    fs.closeSync(fs.openSync(firstContactPath(base), 'a', 0o600));
  }
}

function hopBlocks(input: BridgedCallInput, keys: readonly HopKey[], hopFiles: readonly string[], pins: readonly (string | undefined)[]): HopBlock[] {
  return input.hops.map((leg, at) => ({
    host: leg.entity.host as string,
    identityFile: hopFiles[at],
    typedKeyPath: 'typed' in keys[at],
    check: pins[at + 1] === undefined ? { firstContact: true } : { pinnedFile: pins[at + 1] as string },
  }));
}

/** What the call leaves in the journal about first contact (J1, J2), read from the two files as they are now. Never throws: a file that cannot be read leaves one note. */
function afterRunOf(base: BridgedBase, entry: string, before: readonly string[], names: readonly string[]): () => readonly string[] {
  return () => {
    try {
      return firstContactSentences(entry, before, readText(firstContactPath(base)), readText(personPath(base)), names);
    } catch (error) {
      noteSafely(base, `ssh:exec — first contact of the call could not be reported: ${describeError(error)}`);
      return [];
    }
  };
}

/** A line to the journal that never throws: a journal that will not take it costs neither the slot nor the result (as `removeKeyFile` does). */
function noteSafely(base: BridgedBase, message: string): void {
  try {
    base.note(message);
  } catch {
    /* the journal is the only place this could be said, and it will not take the line */
  }
}

/** Removes the files and the folder; each in its own try. A failure is ONE note, and nothing is thrown (as `removeKeyFile` does). */
function removeAll(base: BridgedBase, written: Written): void {
  const failures: unknown[] = [];
  const attempt = (removal: () => void): void => {
    try {
      removal();
    } catch (error) {
      failures.push(error);
    }
  };
  written.files.forEach((file) => attempt(() => fs.rmSync(file, { force: true })));
  if (written.dir !== undefined) {
    const dir = written.dir;
    attempt(() => fs.rmSync(dir, { recursive: true, force: true }));
  }
  if (failures.length > 0) {
    noteSafely(base, `ssh:exec — a file of the call could not be removed: ${describeError(failures[0])}`);
  }
}

/** `-J` text from the hop entries this call checked. */
const jumpOf = (input: BridgedCallInput): string | undefined => (input.hops.length === 0 ? undefined : input.hops.map((leg) => hopOf(leg.entity)).join(','));

function writeFiles(base: BridgedBase, input: BridgedCallInput, written: Written): BridgedCallFiles {
  const legs = legsOf(input).map(legOf);
  const keys = input.hops.map((leg) => hopKeyOf(leg) as HopKey);
  fs.mkdirSync(materializedKeysDir(base.storageDir), { recursive: true, mode: 0o700 });
  const hopFiles = writeKeys(base, keys, written);
  const pins = writePins(base, legs, written);
  openFirstContact(base, legs);
  const before = knownHostsLines(readText(firstContactPath(base)));
  const text = bridgedConfigText({
    hops: hopBlocks(input, keys, hopFiles, pins),
    destination: { host: input.destination.host as string, pinnedFile: pins[0] },
    noDefaultIdentity: noDefaultIdentity(base),
    firstContactFile: firstContactPath(base),
    personKnownHosts: personPath(base),
  });
  if (!text.ok) {
    return { ok: false, ...fieldRefusal(text.field, input) };
  }
  const folder = bridgedCallFolder(base.storageDir, callKeyName());
  fs.mkdirSync(folder.dir, { recursive: true, mode: 0o700 });
  written.dir = folder.dir;
  writeFile(folder.file, text.text);
  const names = legs.filter((leg) => leg.pinLine === undefined).map((leg) => knownHostsName(leg.word, leg.who.entity.port));
  return {
    ok: true,
    cwd: folder.dir,
    configFile: BRIDGED_CONFIG_FILE,
    pinned: pins[0] !== undefined,
    jump: jumpOf(input),
    afterRun: afterRunOf(base, input.destination.name, before, names),
    remove: () => removeAll(base, written),
  };
}

/** A hop credential's `warning` goes to the journal first, as `<entry of the call>: <warning>` (`prepareAuth` does it for the destination): the journal's only. */
function noteWarnings(base: BridgedBase, input: BridgedCallInput): void {
  input.hops.forEach((leg) => {
    if (leg.credential.warning !== undefined) {
      base.note(`${input.destination.name}: ${leg.credential.warning}`);
    }
  });
}

/** No vault: the legs are given. The itest calls this. */
export function writeBridgedCall(base: BridgedBase, input: BridgedCallInput): BridgedCallFiles {
  noteWarnings(base, input);
  const refusal = refusalOf(base, input);
  if (refusal !== undefined) {
    return { ok: false, ...refusal };
  }
  const written: Written = { files: [] };
  try {
    const files = writeFiles(base, input, written);
    if (!files.ok) {
      removeAll(base, written);
    }
    return files;
  } catch (error) {
    removeAll(base, written);
    return { ok: false, code: 'internal', reason: sentences.writeFailed(describeError(error)) };
  }
}

/** The vault half: reads each hop's credential with `resolveSshCredential` (the automatic opener: it never prompts), then `writeBridgedCall`. */
export function bridgedSshConfigWriter(parts: { storage: StorageManager; storageDir: string; home: string; note(message: string): void }): BridgedSshConfigWriter {
  const base: BridgedBase = { storageDir: parts.storageDir, home: parts.home, platform: process.platform, note: parts.note };
  return async (call) => {
    const hops = await Promise.all(call.hops.map(async (entity) => ({ entity, credential: await resolveSshCredential(parts.storage, call.accountId, entity) })));
    return writeBridgedCall(base, { destination: call.destination, auth: call.auth, keyPath: call.keyPath, hops });
  };
}

/** The four names the credential of a password destination adds to the environment of the outer `ssh`. */
function askpassOf(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): Record<string, string> {
  // `DISPLAY` is an askpass name off Windows only (`askpassEnv` sets none there), so a `DISPLAY` of the host that rode in with the merged environment is dropped.
  const names = BRIDGED_ENV_EXTRA.slice(0, 4).filter((name) => platform !== 'win32' || name !== 'DISPLAY');
  return Object.fromEntries(names.flatMap((name) => (env[name] === undefined ? [] : [[name, env[name]]])));
}

/**
 * The argv, the environment and the `cwd` of the spawn. `execOverSsh` and the itest both call it, so the itest runs what production runs. The `-J`
 * text is `files.jump`, built from the entries the writer checked; the environment is `bridgedSshEnv` and nothing else, plus the four askpass
 * names of a password destination. `undefined` is the second line of the argv rules (R8): no spawn.
 */
export function bridgedSpawn(input: {
  destination: EntityMetadata;
  keyPath: string | undefined;
  auth: SshExecAuth;
  askpassEnv: NodeJS.ProcessEnv;
  remoteCommand: string;
  files: Extract<BridgedCallFiles, { ok: true }>;
  sourceEnv: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
}): { readonly argv: string[]; readonly env: NodeJS.ProcessEnv; readonly cwd: string } | undefined {
  const argv = buildSshExecArgv(input.destination, input.keyPath, input.remoteCommand, input.auth, {
    bridged: true,
    ownAgent: false, // a bridged call forwards no agent, and the composer takes the entry's own `-A` away: said here, because every call of the builder says it (`launchRoadScan.test.ts`)
    jump: input.files.jump,
    configFile: input.files.configFile,
    pinned: input.files.pinned,
  });
  if (argv === undefined) {
    return undefined;
  }
  const extra = input.auth === 'askpass' ? askpassOf(input.askpassEnv, input.platform) : {};
  return { argv, env: bridgedSshEnv(input.sourceEnv, input.platform, extra), cwd: input.files.cwd };
}
