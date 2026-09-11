import type { PathProbe } from '../sshProgram';

/**
 * The `PATH` states the two SSH entry points are asserted against.
 *
 * <p>One fixture, imported by both suites. They had a copy each until the review gate pointed out
 * that the day somebody teaches a `PathProbe` to normalise a directory, one copy learns it and the
 * other does not — and both stay green while one of them has stopped testing the state it names.</p>
 *
 * <p>These two directories are the real ones. `PATH` putting Git's MSYS `ssh` first is why T20
 * exists: that client cannot open the named pipe our agent listens on, so a forwarding connection
 * must be given the built-in by full path. `PATH` putting the built-in first is why T20 has a
 * second half: then the bare word already resolves to it, and the command shown in the viewer is
 * one a person could have typed.</p>
 */

export const GIT_SSH = String.raw`C:\Program Files\Git\usr\bin`;
export const BUILT_IN_DIR = String.raw`C:\Windows\System32\OpenSSH`;

/** A `PATH` that holds an `ssh` in each of these directories, in this order, and nowhere else. */
export function pathWith(...dirs: readonly string[]): PathProbe {
  return { pathDirs: dirs, hasTool: (dir) => dirs.includes(dir) };
}
