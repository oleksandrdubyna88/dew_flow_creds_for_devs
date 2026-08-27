/**
 * Installing `creds` on the host an entity points at, from its context menu.
 *
 * <p>The bridge tells a person to run `creds` on a machine that has never had it, and until this
 * existed the answer to "so how does it get there" was to build it and copy it by hand. This is
 * the same connection the entity already describes, used once more: probe the host, then run the
 * published installer on it.</p>
 *
 * <p><b>Every decision here is a string, and none of them touch `vscode`.</b> What a remote
 * command does is decided by exactly what characters reach the remote shell, so the shape of that
 * string is the behaviour — and it is testable only if nothing else is in the way.</p>
 *
 * <p><b>Nothing here can hang.</b> That is a deliberate constraint learnt from the bridge, where
 * an `ssh` with no `BatchMode` waited at a password prompt on a pipe forever and every check
 * downstream read as "not yet" rather than "never". The probe is one command with a bounded
 * answer; the installer is run with stdin closed, and its own `sudo` handling refuses rather than
 * prompts when there is no terminal.</p>
 */

/** Where the installer is published. A raw URL, so no API call and no token is involved. */
export const INSTALLER_URL =
  'https://raw.githubusercontent.com/oleksandrdubyna88/dew_flow_creds_for_devs/main/install.sh';

/** What one probe of the remote host reports. */
export interface RemoteFacts {
  /** Absolute path of an existing `creds`, or empty when there is none. */
  readonly credsPath: string;
  /** `uname -m`, empty when the host did not answer. */
  readonly arch: string;
  /** `uname -s`. */
  readonly os: string;
  /** `curl` or `wget`, whichever the host has; empty when it has neither. */
  readonly downloader: string;
  /** Whether the answer was readable at all. */
  readonly answered: boolean;
}

/**
 * One command, four facts.
 *
 * <p>One round trip rather than four, because each is an `ssh` connection with its own
 * authentication, and because four answers that arrive separately can disagree about the machine
 * they describe. `-` stands in for "not found" so a missing value is a value rather than a blank
 * line that could equally mean the command never ran.</p>
 */
export function probeCommand(): string {
  return [
    "printf 'creds=%s\n' \"$(command -v creds || echo -)\"",
    "printf 'arch=%s\n' \"$(uname -m || echo -)\"",
    "printf 'os=%s\n' \"$(uname -s || echo -)\"",
    "printf 'get=%s\n' \"$(command -v curl || command -v wget || echo -)\"",
  ].join('; ');
}

/** Read the probe's four lines. An unreadable answer is `answered: false`, never a guess. */
export function interpretProbe(stdout: string): RemoteFacts {
  const value = (key: string): string => {
    const line = stdout.split('\n').find((l) => l.trim().startsWith(`${key}=`));
    const raw = line === undefined ? '' : line.trim().slice(key.length + 1);
    return raw === '-' ? '' : raw;
  };
  const os = value('os');
  return {
    credsPath: value('creds'),
    arch: value('arch'),
    os,
    downloader: value('get'),
    answered: os.length > 0,
  };
}

/** The two the release matrix builds, under both spellings `uname -m` uses. */
const SUPPORTED_ARCH = ['x86_64', 'amd64', 'aarch64', 'arm64'];

/** Why the host cannot be installed to, or empty when it can. */
export function blockerFor(facts: RemoteFacts): string {
  // A table rather than a chain: each row is one reason with its own sentence, and adding a
  // platform is a row rather than another branch. The order is the order they are checked in,
  // and the first that applies is the one a person is told about — knowing that a host is
  // unreachable makes its architecture beside the point.
  const reasons: ReadonlyArray<readonly [boolean, string]> = [
    [!facts.answered, "the host did not answer the probe, so nothing is known about it yet."],
    [
      facts.os !== 'Linux',
      `there is no build for ${facts.os}. The published binaries are Linux and Windows, and this installs the Linux one.`,
    ],
    [
      !SUPPORTED_ARCH.includes(facts.arch),
      `there is no build for ${facts.arch}. The published architectures are x86_64 and aarch64.`,
    ],
    [
      facts.downloader.length === 0,
      "the host has neither curl nor wget, so it cannot fetch the installer.",
    ],
  ];
  return reasons.find(([applies]) => applies)?.[1] ?? "";
}

/**
 * The command that installs, or re-installs, on the remote.
 *
 * <p><b>Downloaded to a file, then run — never piped.</b> The obvious
 * `curl … | sh &lt; /dev/null` is wrong in a way that only a live host revealed: the
 * redirection wins over the pipe, so the shell reads an empty stdin, and stdin is where the
 * SCRIPT was arriving. It executes nothing, exits, and curl dies writing into a closed pipe:</p>
 *
 * <pre>curl: (23) Failure writing output to destination</pre>
 *
 * <p>Both requirements are real and they conflict on one file descriptor: the installer must
 * reach the shell, and the shell must be unable to wait for input (`sudo` over a
 * non-interactive ssh waits forever otherwise — the same shape as the bridge without
 * `BatchMode`). A file separates them: the script comes from the filesystem, stdin is closed.</p>
 *
 * <p>The temporary file carries the pid so two installs cannot collide, and is removed
 * unconditionally — `;` rather than `&amp;&amp;`, because the run that FAILED is exactly the one
 * whose leftovers nobody would come back for.</p>
 */
export function installCommand(prefix: string = ''): string {
  const env = prefix.length > 0 ? `CREDS_PREFIX=${shellQuote(prefix)} ` : '';
  const script = '/tmp/creds-install.$$.sh';
  return (
    `curl -fsSL ${INSTALLER_URL} -o ${script} && ` +
    `${env}sh ${script} < /dev/null; rm -f ${script}`
  );
}

/** Single-quote for a POSIX shell; the only characters that need it here are the quotes. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\''`)}'`;
}

export type InstallOutcome =
  | { kind: 'installed'; path: string }
  | { kind: 'failed'; reason: string };

/**
 * What the install actually did.
 *
 * <p>The exit code alone is not enough and never was: a pipeline's status is its LAST command's,
 * so `curl … | sh` reports the shell's status and a 404 body fed to `sh` can exit 0 having done
 * nothing. So the installer's own success line is what is looked for, and its absence is a
 * failure however cheerful the exit code.</p>
 */
export function interpretInstall(stdout: string, stderr: string, exitCode: number): InstallOutcome {
  const all = `${stdout}\n${stderr}`;
  const line = all.split('\n').find((l) => l.includes('creds-install: installed '));
  if (line !== undefined) {
    return { kind: 'installed', path: line.slice(line.indexOf('installed ') + 'installed '.length).trim() };
  }
  const complaint = all
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('creds-install:') || l.startsWith('curl:'))
    .pop();
  return {
    kind: 'failed',
    reason: complaint ?? `the installer produced no result and exited ${exitCode}.`,
  };
}

/** What to ask before running anything on someone else's machine. */
export function confirmationFor(facts: RemoteFacts, entityName: string): {
  readonly message: string;
  readonly detail: string;
  readonly action: string;
} {
  const replacing = facts.credsPath.length > 0;
  return {
    message: replacing
      ? `Replace \`creds\` on "${entityName}"?`
      : `Install \`creds\` on "${entityName}"?`,
    // The exact command, because this downloads a binary onto a machine that is not this one and
    // a person is entitled to see what will run before it does.
    detail: [
      replacing ? `A copy already exists at ${facts.credsPath} and will be overwritten.` : '',
      'This runs on the remote host:',
      `  ${installCommand()}`,
      'The installer verifies the release checksum and refuses a mismatch. No credential is sent —',
      '`creds` holds none and can obtain none.',
    ]
      .filter((l) => l.length > 0)
      .join('\n'),
    action: replacing ? 'Replace it' : 'Install it',
  };
}
