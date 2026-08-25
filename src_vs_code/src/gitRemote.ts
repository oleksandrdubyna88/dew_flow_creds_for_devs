/**
 * Everything about talking to `git` that can be decided without running it.
 *
 * <p>The argv for each command, how a remote is recognised and named, and what git's exit
 * codes and stderr mean in this application's terms. Pure and `vscode`-free, so the parts
 * that are easy to get wrong — a secret leaking into argv, a rejected push mistaken for a
 * network failure — are unit tests rather than something you discover against a real
 * repository.</p>
 *
 * <p><b>Why a system `git` and not a library.</b> The extension has zero runtime dependencies:
 * Node built-ins and the `vscode` API only. That rules out `simple-git`/`isomorphic-git`, so
 * the binary on PATH is the only option — and it becomes a real prerequisite for anyone who
 * turns this transport on, which the caller must say out loud rather than fail obscurely.</p>
 */

/** The branch the vault lives on. Never `main`: this is not a repository people read. */
export const VAULT_BRANCH = 'creds-vault';

/**
 * Options forced on EVERY git invocation, ahead of the subcommand.
 *
 * <p>`core.autocrlf=false` and `core.eol=lf` are not style preferences here, they are
 * correctness. On Windows git's default is to rewrite line endings on checkout, so a vault
 * written on one machine came back with different bytes on another — caught the first time
 * this transport was run against a real repository, where a byte-for-byte comparison failed
 * while the file was plainly present. An encrypted envelope is data, not source: whatever was
 * written must be exactly what is read.</p>
 *
 * <p>`.gitattributes` says the same thing to every OTHER client that touches the repository —
 * a colleague's clone, a web UI, a CI job — because a setting in our own clone binds only
 * us.</p>
 */
export const GIT_BASE_ARGS: readonly string[] = [
  '-c',
  'core.autocrlf=false',
  '-c',
  'core.eol=lf',
];

/** What `.gitattributes` must contain for the vault files to survive any client. */
export const GITATTRIBUTES = '*.enc -text -diff -merge\n';

export type GitAuth =
  /** `GIT_SSH_COMMAND` pointed at a materialized key. */
  | { kind: 'ssh'; keyPath: string }
  /** A token supplied over stdin by a credential helper — never in the URL. */
  | { kind: 'token'; token: string }
  /** Whatever the machine's own git is already configured to do. */
  | { kind: 'inherit' };

export interface GitRemote {
  /** The URL as the person entered it. */
  readonly url: string;
  /** ssh-style (`git@host:path`, `ssh://…`) or https. */
  readonly scheme: 'ssh' | 'https';
}

/**
 * Whether a location names a git remote.
 *
 * <p>Deliberately NOT a guess from the URL alone: `https://github.com/me/vault` is
 * indistinguishable from a Cred Vault Server URL, and picking wrong would mean an account
 * silently syncing nowhere. A location counts as git only when it is unambiguous — an
 * `ssh://`/`scp`-style address, or an explicit `git+` prefix, or a `.git` suffix — and the
 * settings key that carries it is separate from the server one anyway.</p>
 */
const GIT_SHAPES: readonly RegExp[] = [
  /^git\+/,
  /^ssh:\/\//,
  /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+:/,
  /\.git\/?$/i,
];

export function isGitLocation(location: string): boolean {
  const value = location.trim();
  return GIT_SHAPES.some((shape) => shape.test(value));
}

export function parseGitRemote(location: string): GitRemote | undefined {
  const raw = location.trim();
  if (!isGitLocation(raw)) {
    return undefined;
  }
  const url = raw.startsWith('git+') ? raw.slice('git+'.length) : raw;
  return { url, scheme: /^https?:\/\//i.test(url) ? 'https' : 'ssh' };
}

/**
 * A stable directory name for a remote's local clone.
 *
 * <p>Derived from the URL rather than the account, because two accounts pointed at one
 * repository should share a clone instead of fetching it twice. Non-word characters collapse
 * so the name is a legal directory on every platform.</p>
 */
export function cloneDirName(remote: GitRemote): string {
  const flat = remote.url.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return flat.slice(0, 64) || 'remote';
}

/** The file inside the repository that holds one account's vault. */
export function vaultFileName(accountEmailHash: string): string {
  return `vault_${accountEmailHash}.enc`;
}

/**
 * The environment for a git child.
 *
 * <p>Three things are forced regardless of auth: no interactive prompt (a child that blocks
 * on a username is a hung sync with no error), no system-wide credential helper hijacking the
 * request, and `GIT_TERMINAL_PROMPT=0`. A token is NOT placed here — it goes over stdin to a
 * helper — because the environment of a child is readable by anything running as the same
 * user, which is the leak `sshAskpass` exists to avoid for SSH.</p>
 */
export function gitEnv(auth: GitAuth, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...base,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
  };
  if (auth.kind === 'ssh') {
    // IdentitiesOnly so a loaded agent key cannot be used instead of the one chosen here,
    // and accept-new for the same reason the SSH path uses it: a first connection to a known
    // host should not require the person to answer a prompt they cannot see.
    env.GIT_SSH_COMMAND = `ssh -i "${auth.keyPath}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
  }
  return env;
}

/** `git clone` for a fresh local copy: shallow, one branch, no checkout of anything else. */
export function cloneArgv(remote: GitRemote, targetDir: string): string[] {
  return [
    'clone',
    '--depth',
    '1',
    '--single-branch',
    '--branch',
    VAULT_BRANCH,
    '--',
    remote.url,
    targetDir,
  ];
}

/** `git init` for a repository whose branch does not exist yet (a brand-new vault repo). */
export function initArgv(remote: GitRemote): string[][] {
  return [
    ['init', '--initial-branch', VAULT_BRANCH],
    ['remote', 'add', 'origin', remote.url],
  ];
}

export function fetchArgv(): string[] {
  return ['fetch', '--depth', '1', 'origin', VAULT_BRANCH];
}

/** Hard reset onto what was just fetched: the working copy is a cache, never a source of truth. */
export function resetArgv(): string[] {
  return ['reset', '--hard', 'FETCH_HEAD'];
}

/**
 * Commit argv.
 *
 * <p>The message names the account only by a hash prefix and the time. Not the entry count,
 * not a name, not what changed: the log of this repository is readable by anyone who can read
 * the repository, and "renamed prod-db" in a commit subject is metadata the encryption was
 * supposed to cover.</p>
 */
export function commitArgv(accountHashPrefix: string, isoTime: string): string[] {
  return [
    '-c',
    'user.name=CredsForDevs',
    '-c',
    'user.email=creds@localhost',
    'commit',
    '--quiet',
    '--message',
    `vault: ${accountHashPrefix} ${isoTime}`,
  ];
}

export function pushArgv(force = false): string[] {
  return force
    ? ['push', '--force-with-lease', 'origin', VAULT_BRANCH]
    : ['push', 'origin', VAULT_BRANCH];
}

export type GitFailure =
  /** Someone else pushed in between — re-read, merge, try again next cycle. */
  | 'rejected'
  /** The branch (or the repository) has nothing yet. */
  | 'empty'
  /** Credentials refused. */
  | 'auth'
  /** The remote could not be reached at all. */
  | 'unreachable'
  /** Anything else — reported with git's own words. */
  | 'other';

/**
 * What a failed git invocation meant.
 *
 * <p>Classified from stderr rather than the exit code, because git returns 1 for most of
 * these and the difference between "rejected" and "unreachable" decides whether the caller
 * retries the cycle or tells the person their network is down.</p>
 */
const FAILURE_SIGNS: readonly { readonly sign: RegExp; readonly failure: GitFailure }[] = [
  { sign: /non-fast-forward|\[rejected\]|fetch first|stale info/, failure: 'rejected' },
  { sign: /couldn't find remote ref|does not appear to be a git repository|remote branch .* not found/, failure: 'empty' },
  { sign: /authentication failed|permission denied|access denied|could not read username|invalid username or password/, failure: 'auth' },
  { sign: /could not resolve host|connection refused|network is unreachable|operation timed out|failed to connect/, failure: 'unreachable' },
];

export function classifyGitError(stderr: string): GitFailure {
  const text = stderr.toLowerCase();
  return FAILURE_SIGNS.find(({ sign }) => sign.test(text))?.failure ?? 'other';
}

/** One sentence for the person, in terms of what they can do about it. */
export function describeGitFailure(failure: GitFailure, location: string, stderr: string): string {
  const say: Record<GitFailure, () => string> = {
    rejected: () =>
      `Another machine wrote to ${location} first. The next sync will merge and retry — nothing was lost.`,
    empty: () =>
      `${location} has no "${VAULT_BRANCH}" branch yet. It will be created on the first successful sync.`,
    auth: () =>
      `${location} refused the credentials. Check the deploy key or token configured for this account.`,
    unreachable: () => `${location} could not be reached. Check the network, then sync again.`,
    other: () => `git failed for ${location}: ${firstLine(stderr)}`,
  };
  return say[failure]();
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0);
  return line === undefined ? 'no output' : line.trim().slice(0, 200);
}
