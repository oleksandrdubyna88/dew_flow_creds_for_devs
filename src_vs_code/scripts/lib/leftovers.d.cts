// Types for `leftovers.cjs`, the Node WRAPPER over the mounted test-leftovers reference
// (`.claude/rules/shared/tools/lib/owned.mjs`). One `export` line per name the module exports: a test reads
// this file and compares the list with `Object.keys(require('./leftovers.cjs'))` in both directions, so a name
// added to one and not the other is a red suite.

/** What a cleanup needs of a scope: node:test's `TestContext` satisfies it, so does `cleanupScope()`. */
export interface Scope {
  after(fn: () => unknown): void;
}

/** A scope outside node:test: `close()` runs what `after` registered, last first, and never rejects. */
export interface CleanupScope extends Scope {
  close(): Promise<void>;
}

/** An owner record, `<owner>:<host>@<os>:<pid>[:<start>[:<ns>]]`, parsed. */
export interface Owner {
  owner: string;
  host: string;
  pid: number;
  start?: number;
  ns?: number;
  nonCanonical?: boolean;
}

/** What a claim read can answer: nobody's (no claim), an owner, or a claim that cannot be read. */
export type OwnerRead = null | Owner | { unreadable: true; reason?: string };

/** `live`, `gone` or `unknown` — rule section 3. */
export type OwnerState = 'live' | 'gone' | 'unknown';

export interface OwnedDirOptions {
  /** The folder the owned folder is made in; the temp root by default. */
  parent?: string;
}

/** The repository's token, written once. */
export const REPO_TOKEN: string;
/** The repository's row of the `## Tokens` table of the mounted rule. */
export const REPO_ROW: string;
/** The mounted reference's `tools/lib` folder — the one place the mount's location is written. */
export const REFERENCE_LIB: string;

/** A fresh name `testsToDelete-<owner>-creds-<what>-<id>`; nothing is made. */
export function ownedName(what: string): string;
/** The pattern of this repository's names for one owner (default: the caller's). */
export function ownedPattern(owner?: string): RegExp;
/** An owned, claimed folder, removed with its claim when `scope` ends. */
export function ownedDir(scope: Scope, what: string, options?: OwnedDirOptions): string;
/** A scope for a script that has no node:test context. */
export function cleanupScope(): CleanupScope;
/** The one place a test learns the temp root. */
export function tempRoot(): string;
/** Remove a folder, then its claim. Never throws. */
export function removeQuietly(dir: string): boolean;
/** The claim of a folder: `null` (unmarked), an owner, or `{ unreadable: true }`. */
export function readOwner(target: string, kind: 'folder' | 'worktree', options?: { mine?: (target: string) => boolean }): OwnerRead;
/** The liveness of an owner record. */
export function ownerState(owner: OwnerRead, probe?: (pid: number) => unknown, facts?: object): OwnerState;
/** The caller's kernel-owner question, rule section 3: the real uid on POSIX; a path inside the profile on Windows. */
export function isMine(target: string): boolean;
/** What the OS says of a pid, never signalling it: `live`, `dead` or something that is neither, and on Linux its start in Unix seconds. */
export function processProbe(pid: number): { state: string; start?: number };
/** This process as an owner record. */
export function thisOwner(): Owner;
/** The caller's owner token: `u<uid>` on POSIX, `w<digits>` on Windows. */
export function thisOwnerToken(): string;
/** An owner record as the text a claim holds. */
export function formatOwner(owner: Owner): string;
/** The record a helper writes: the run's own, from `TESTSTODELETE_RUN`, or this process's. */
export function runRecord(env?: Record<string, string | undefined>): Owner;

/** The folder a Unix socket may be made in: short enough for macOS's 103 bytes. `/tmp` on Linux and macOS, the temp root on Windows. */
export function shortSocketRoot(): string;
/** A path inside an owned folder `what`: `<ownedDir(scope, what)>/<name>`. The file is not made. */
export function ownedFile(scope: Scope, what: string, name: string): string;
/** Write `text` as a file inside an owned folder `what`; returns the file's path. */
export function writeStub(scope: Scope, what: string, text: string): string;
