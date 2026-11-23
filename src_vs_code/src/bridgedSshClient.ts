import * as fs from 'node:fs';
import { describeError } from './describeError';
import { bridgedSshEnv } from './bridgedSshEnv';
import { sentences } from './bridgedSshSentences';
import { bridgedCallFolder, callKeyName } from './materializedKeys';
import { endedStage, notStarted } from './requestLife';
import { SshExecOptions, SshExecOutcome, runSshExec } from './sshExecRunner';

/**
 * The client check of a bridged `ssh:exec` and the floor under it (the E1.6 spec §S6.14 Y3, the parent's §4.9 and Q12): what `ssh -V` answered,
 * read as a verdict. Pure and `vscode`-free: the reading (`clientVerdict`) is pure, and the spawn that asks (`bridgedSshClientCheck`) takes its runner as a part.
 *
 * <p>The floor is meant to be a version that was run, not one that was read about: the oldest OpenSSH the bridged itest runs on in CI (probe PV1, not yet run) and the
 * one Win32-OpenSSH measured. It is the one constant here, `BRIDGED_SSH_FLOOR`, and the verdict takes it as a parameter so a test can say
 * which floor it is about.</p>
 */

/** A version, as `[major, minor]`. */
export type Version = readonly [number, number];

/** The oldest client a bridge accepts: `other` for every build off Windows, `win32` for the OpenSSH that Windows ships. */
export interface BridgedFloor {
  readonly other: Version;
  readonly win32: Version;
}

/** OpenSSH 8.9, and Win32-OpenSSH 9.5 on Windows (the owner's Q12, 2026-11-16; 8.9 is held until probe PV1 has run the bridged itest on it). */
export const BRIDGED_SSH_FLOOR: BridgedFloor = { other: [8, 9], win32: [9, 5] };

export type ClientVerdict = { ok: true; version: string } | { ok: false; sentence: string };

/** `ssh -V` prints its version on stderr; the token is read from the very start of it, so a word later in a line, or on stdout, is not a version. */
const VERSION_TOKEN = /^OpenSSH_(for_Windows_)?(\d+)\.(\d+)/;

const textOf = (version: Version): string => `${version[0]}.${version[1]}`;

/** Whether `version` is at or above `floor`: major and minor compared as numbers. */
function atLeast(version: Version, floor: Version): boolean {
  return version[0] > floor[0] || (version[0] === floor[0] && version[1] >= floor[1]);
}

/** The version token at the start of stderr: the matched text, the version, and whether it names the build Windows ships. */
interface Token {
  readonly text: string;
  readonly version: Version;
  readonly windowsBuild: boolean;
}

export function versionTokenOf(stderr: string): Token | undefined {
  const found = VERSION_TOKEN.exec(stderr);
  return found === null ? undefined : { text: found[0], version: [Number(found[2]), Number(found[3])], windowsBuild: found[1] !== undefined };
}

/** On `win32` only the build Windows ships counts, and against its own floor; elsewhere the version alone, against the other. */
const acceptable = (token: Token, platform: NodeJS.Platform, floor: BridgedFloor): boolean =>
  platform === 'win32' ? token.windowsBuild && atLeast(token.version, floor.win32) : atLeast(token.version, floor.other);

/**
 * Reads what `ssh -V` answered. `ok: false` with R12 when the exit is not 0 or stderr starts with no version token; with R13 when the version is
 * below the floor or, on `win32`, the build is not the one Windows ships (`OpenSSH_for_Windows_`). The sentences hold the exit code, the
 * matched token and the floor, and no other part of the output.
 */
export function clientVerdict(exit: number | null, stdout: string, stderr: string, platform: NodeJS.Platform): ClientVerdict {
  return clientVerdictUnder(BRIDGED_SSH_FLOOR, exit, stdout, stderr, platform);
}

/** `clientVerdict` under a floor of the caller's: what a test says when it is about the rule and not about the constant. */
export function clientVerdictUnder(floor: BridgedFloor, exit: number | null, _stdout: string, stderr: string, platform: NodeJS.Platform): ClientVerdict {
  const token = exit === 0 ? versionTokenOf(stderr) : undefined;
  if (token === undefined) {
    return { ok: false, sentence: sentences.clientNoVersion(exit) };
  }
  return acceptable(token, platform, floor)
    ? { ok: true, version: textOf(token.version) }
    : { ok: false, sentence: sentences.clientBelowFloor(token.text, textOf(floor.other), textOf(floor.win32)) };
}

// ---- the spawn that asks -------------------------------------------------------------------------------------------------------------

/** How long `ssh -V` has: a client that does not answer in this time is killed and has not answered. */
export const CLIENT_CHECK_TIMEOUT_MS = 10_000;

/** What the runner answers: the part of `SshExecOutcome` the verdict reads. */
export type ClientRunner = (argv: string[], options: SshExecOptions) => Promise<Pick<SshExecOutcome, 'exitCode' | 'stdout' | 'stderr'>>;

/** One check: the program `sshSpawnLaunch` chose for the call, and the guards that end the child with the window or the request. */
export interface ClientCheckCall {
  readonly program: string;
  readonly guards?: Pick<SshExecOptions, 'signal' | 'startGate'>;
}

export type BridgedClientCheck = (call: ClientCheckCall) => Promise<ClientVerdict>;

/** What the check is built from; everything but `storageDir` is for a test to say. */
export interface ClientCheckParts {
  readonly storageDir: string;
  readonly run?: ClientRunner;
  readonly floor?: BridgedFloor;
  readonly platform?: NodeJS.Platform;
  readonly source?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  /** The journal's line writer, for what the check cannot say any other way: its folder could not be removed, or `ssh` could not be started. */
  readonly note?: (message: string) => void;
}

/** The parts with every default filled in. */
type Resolved = Required<Omit<ClientCheckParts, 'note'>> & Pick<ClientCheckParts, 'note'>;

/**
 * The check a bridged call makes before its per-call files are written (the destination's own key file, written by the auth step, comes
 * earlier and goes with the call): `ssh -V` through the runner, with the program the call would use, the
 * environment of a bridged child and a folder of its own that holds nothing and is removed afterwards (a bare `ssh` on Windows is resolved
 * through the current folder before `PATH`, so the child is never started in a folder with anything in it). A GOOD verdict is kept for this
 * check's life, per program; a bad one is not kept, so the next call asks again. A runner that fails (no `ssh` at all) is a client that did
 * not answer; a request that ended is not, and its error goes on.
 */
export function bridgedSshClientCheck(given: ClientCheckParts): BridgedClientCheck {
  const parts: Resolved = { run: runSshExec, floor: BRIDGED_SSH_FLOOR, platform: process.platform, source: process.env, timeoutMs: CLIENT_CHECK_TIMEOUT_MS, ...given };
  const good = new Map<string, ClientVerdict>();
  return async (call) => {
    const kept = good.get(call.program);
    if (kept !== undefined) {
      return kept;
    }
    const verdict = await ask(parts, call);
    if (verdict.ok) {
      good.set(call.program, verdict);
    }
    return verdict;
  };
}

/** The child, in a folder of its own: the runner's answer read as a verdict, or R12 when it could not be started. */
async function spawnVersion(parts: Resolved, call: ClientCheckCall, dir: string): Promise<ClientVerdict> {
  try {
    const outcome = await parts.run(['-V'], {
      program: call.program,
      env: bridgedSshEnv(parts.source, parts.platform),
      cwd: dir,
      timeoutMs: parts.timeoutMs,
      ...call.guards,
    });
    if (guardsEnded(call.guards)) {
      // The runner killed the child because the window or the request went: that is not the client's answer.
      throw notStarted();
    }
    return clientVerdictUnder(parts.floor, outcome.exitCode, outcome.stdout, outcome.stderr, parts.platform);
  } catch (error) {
    return notStartedVerdict(parts, error);
  }
}

/** A runner that threw: a request that ended goes on as itself; anything else is a client that did not answer (R12), with its cause in the journal. */
function notStartedVerdict(parts: Resolved, error: unknown): ClientVerdict {
  if (endedStage(error) !== undefined) {
    throw error;
  }
  parts.note?.(`ssh:exec — the client check could not start ssh: ${describeError(error)}`);
  return { ok: false, sentence: sentences.clientNoVersion(null) };
}

/** Whether the window or the request this check serves has gone (any kill signal, or the start gate). */
function guardsEnded(guards: ClientCheckCall['guards']): boolean {
  return [...signalsOf(guards?.signal), guards?.startGate].some((signal) => signal?.aborted === true);
}

/** The kill signals, as a list whatever shape they were given in. */
function signalsOf(given: SshExecOptions['signal']): readonly AbortSignal[] {
  if (given === undefined) {
    return [];
  }
  return given instanceof AbortSignal ? [given] : given;
}

/** Removes the folder; a failure is one journal note, never a throw that would hide the verdict. */
function removeFolder(parts: Resolved, dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    parts.note?.(`ssh:exec — the folder of the client check could not be removed: ${describeError(error)}`);
  }
}

async function ask(parts: Resolved, call: ClientCheckCall): Promise<ClientVerdict> {
  const folder = bridgedCallFolder(parts.storageDir, callKeyName());
  try {
    fs.mkdirSync(folder.dir, { recursive: true, mode: 0o700 });
    return await spawnVersion(parts, call, folder.dir);
  } finally {
    removeFolder(parts, folder.dir);
  }
}
