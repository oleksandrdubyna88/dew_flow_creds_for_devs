/**
 * The `git config` lines that make Git sign commits with a key this agent serves.
 *
 * <p>Git can sign with SSH since 2.34 (`gpg.format ssh`), and `user.signingkey` may be a
 * literal public key rather than a file — the `key::` prefix — which is what lets a key that
 * exists only inside this extension sign a commit. The agent supplies the private half.</p>
 *
 * <p><b>The Windows line is the one nobody expects.</b> `gpg.ssh.program` must point at the
 * BUILT-IN OpenSSH `ssh-keygen.exe`, because the Git-for-Windows one is an MSYS binary that
 * cannot talk to a named pipe — measured, 2026-08-25: it answers `Bad file descriptor` where the
 * built-in client answers correctly. Without that line Git would use its own ssh-keygen, fail to
 * reach the agent, and report a signing error with nothing pointing at the cause.</p>
 *
 * <p>Pure and `vscode`-free.</p>
 */

const WINDOWS_SSH_KEYGEN = 'C:/Windows/System32/OpenSSH/ssh-keygen.exe';

export interface GitSigningConfig {
  /** The `git config --global …` commands, in the order they should be run. */
  commands: string[];
  /** What to say alongside them — the caveats that are not expressible as config. */
  note: string;
}

/**
 * The key as it may appear inside a shell command: algorithm and base64, never a comment.
 *
 * <p>Belt and braces. `sshKeyParse.publicKeyOnly` already excludes the comment, and the
 * comment is sanitized besides — but this function's output is pasted into a terminal by a
 * person who was told to, so it refuses anything outside the two fields a public key has rather
 * than trusting its caller to have passed the right one.</p>
 */
export function shellSafeKey(publicLine: string): string | undefined {
  // An SSH key type, then a substantial base64 body. Deliberately strict: a loose pattern
  // ("a word, then a word") accepts `not a key at all` and hands back `not a`, which is how a
  // guard becomes decoration. 32 characters is shorter than the smallest real key body.
  const match = /^((?:ssh|ecdsa|sk)-[a-z0-9@.-]+)\s+([A-Za-z0-9+/]{32,}={0,2})/.exec(publicLine.trim());
  return match === null ? undefined : `${match[1]} ${match[2]}`;
}

export function gitSigningConfig(
  publicLine: string,
  platform: NodeJS.Platform,
  socketPath: string,
): GitSigningConfig {
  const key = shellSafeKey(publicLine);
  return key === undefined ? unreadableKey() : configFor(key, platform, socketPath);
}

function unreadableKey(): GitSigningConfig {
  return {
    commands: [],
    note:
      'That key could not be read as an SSH public key, so no config was produced. ' +
      'Nothing is copied rather than copying a command that is not what it looks like.',
  };
}

function configFor(key: string, platform: NodeJS.Platform, socketPath: string): GitSigningConfig {
  const commands = [
    'git config --global gpg.format ssh',
    `git config --global user.signingkey "key::${key}"`,
    'git config --global commit.gpgsign true',
    'git config --global tag.gpgsign true',
  ];
  if (platform === 'win32') {
    commands.push(`git config --global gpg.ssh.program "${WINDOWS_SSH_KEYGEN}"`);
  }
  const exportLine =
    platform === 'win32'
      ? `$env:SSH_AUTH_SOCK = "${socketPath}"`
      : `export SSH_AUTH_SOCK="${socketPath}"`;
  return {
    commands,
    note:
      `New integrated terminals already have SSH_AUTH_SOCK set. Elsewhere: ${exportLine}` +
      (platform === 'win32'
        ? '\nOn Windows use the built-in OpenSSH client (C:\\Windows\\System32\\OpenSSH) — the ' +
          'MSYS ssh that ships with Git for Windows cannot connect to a named pipe.'
        : '') +
      '\nTo let others verify your commits, add the public key to your forge as a SIGNING key ' +
      '(GitHub and GitLab keep signing keys separate from authentication keys).',
  };
}

/** The clipboard text: the commands, then the note as comments. */
export function gitSigningClipboardText(config: GitSigningConfig): string {
  const comments = config.note
    .split('\n')
    .map((line) => `# ${line}`)
    .join('\n');
  return `${config.commands.join('\n')}\n\n${comments}\n`;
}
