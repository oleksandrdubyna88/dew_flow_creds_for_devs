import { sentences } from './bridgedSshSentences';

/**
 * The client check of a bridged `ssh:exec` and the floor under it (the E1.6 spec §S6.14 Y3, the parent's §4.9 and Q12): what `ssh -V` answered,
 * read as a verdict. Pure and `vscode`-free.
 *
 * <p>The floor is a version that was run, not one that was read about: the oldest OpenSSH the bridged itest runs on in CI (probe PV1) and the
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

/** Held until probe PV1 has run: the values are set in the commit that follows it. Until then no version is below it. */
export const BRIDGED_SSH_FLOOR: BridgedFloor = { other: [0, 0], win32: [0, 0] };

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

function tokenOf(stderr: string): Token | undefined {
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
  const token = exit === 0 ? tokenOf(stderr) : undefined;
  if (token === undefined) {
    return { ok: false, sentence: sentences.clientNoVersion(exit) };
  }
  return acceptable(token, platform, floor)
    ? { ok: true, version: textOf(token.version) }
    : { ok: false, sentence: sentences.clientBelowFloor(token.text, textOf(floor.other), textOf(floor.win32)) };
}
