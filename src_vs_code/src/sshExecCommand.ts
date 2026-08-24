import { EntityMetadata } from './types';
import { DEFAULT_SSH_PORT } from './sshCommand';

/**
 * Assemble the argv for a non-interactive agent `ssh` exec — an ARRAY, never
 * a shell string. The remote command is passed as ssh's single trailing
 * operand and reaches the remote shell exactly as typed; nothing the agent
 * supplies is ever parsed by a LOCAL shell, because there is no local shell in
 * the path (`spawn('ssh', argv, {shell:false})`).
 *
 * Pure and `vscode`-free so the flag rules are a unit test. Sibling of
 * `sshCommand.ts`'s `buildSshCommand`, which returns a quoted string for a
 * human terminal — the two must not be collapsed: turning the string back into
 * an argv is exactly the re-entry into shell parsing this file exists to avoid.
 */

/** Caller-supplied command guard: non-empty, no NUL, within a sane length. */
export const MAX_REMOTE_COMMAND_CHARS = 8000;

export function validateRemoteCommand(command: unknown): { ok: true } | { ok: false; message: string } {
  if (typeof command !== 'string') {
    return { ok: false, message: 'command must be a string' };
  }
  if (command.length === 0) {
    return { ok: false, message: 'command must not be empty' };
  }
  if (command.length > MAX_REMOTE_COMMAND_CHARS) {
    return { ok: false, message: `command must be at most ${MAX_REMOTE_COMMAND_CHARS} characters` };
  }
  if (command.includes('\0')) {
    return { ok: false, message: 'command must not contain a NUL byte' };
  }
  return { ok: true };
}

/**
 * How the exec authenticates, because it decides one ssh option that must not
 * be guessed. `askpass` means the password rides `SSH_ASKPASS` (the mechanism
 * the human Connect path has used since 0.42.0); `key` means a key file or
 * nothing at all.
 */
export type SshExecAuth = 'askpass' | 'key';

/**
 * `[(-o BatchMode=yes | -o NumberOfPasswordPrompts=1), -o
 *   StrictHostKeyChecking=accept-new, -o ConnectTimeout=10, (-i keyPath)?,
 *   (-p port)?, user@host, command]`. Returns `undefined` with no host.
 *
 * <p><b>Why BatchMode is conditional.</b> An unattended exec must never hang on
 * a prompt, and `BatchMode=yes` is the usual way to say so — but BatchMode has
 * historically ALSO meant "never ask for a password", by zeroing
 * `NumberOfPasswordPrompts`, which would silently disable the askpass path this
 * feature exists to use. The evidence is ambiguous: `ssh -G -o BatchMode=yes`
 * on OpenSSH 10.3 still reports `numberofpasswordprompts 3`, and that dump is
 * not the authentication code. Rather than depend on an interaction we cannot
 * test without a live SSH server, the password branch takes the ssh options the
 * human path already proves in production and adds nothing: forced askpass
 * answers the prompt, and stdin is closed, so there is no prompt left to hang
 * on. `NumberOfPasswordPrompts=1` replaces BatchMode's protection where it
 * actually mattered — a wrong stored password fails once instead of asking our
 * script for the same wrong password three times.</p>
 *
 * <p>The key branch keeps `BatchMode=yes`: there, nothing supplies a
 * passphrase, so failing fast is exactly right.</p>
 */
export function buildSshExecArgv(
  entity: EntityMetadata,
  keyPath: string | undefined,
  remoteCommand: string,
  auth: SshExecAuth = 'key',
): string[] | undefined {
  if (!entity.host) {
    return undefined;
  }
  const argv: string[] =
    auth === 'askpass'
      ? ['-o', 'NumberOfPasswordPrompts=1']
      : ['-o', 'BatchMode=yes'];
  argv.push(
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=10',
  );
  if (keyPath !== undefined && keyPath.length > 0) {
    argv.push('-i', keyPath);
  }
  if (entity.port !== undefined && entity.port !== DEFAULT_SSH_PORT) {
    argv.push('-p', String(entity.port));
  }
  argv.push(entity.user ? `${entity.user}@${entity.host}` : entity.host);
  argv.push(remoteCommand);
  return argv;
}
