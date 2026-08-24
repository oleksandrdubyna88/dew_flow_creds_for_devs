/**
 * Password SSH without retyping the password.
 *
 * <p>ssh refuses a password on stdin — it asks the TTY, or, pointed at a program via
 * `SSH_ASKPASS`, it asks the program. Ours echoes an env variable, so the password is
 * never written to a file, never on a command line, and never echoed into scrollback:
 * it travels only in the dedicated terminal's environment.</p>
 *
 * <p>`SSH_ASKPASS_REQUIRE=force` matters: inside a terminal ssh HAS a TTY and would
 * ignore askpass without it (OpenSSH ≥ 8.4 — Windows 11 and current distros ship it).
 * The connect command also passes `-o StrictHostKeyChecking=accept-new`, because with
 * force even the host-key yes/no question would be answered by the askpass program —
 * with the password.</p>
 */

export interface AskpassScript {
  name: string;
  content: string;
}

/** The static helper script. Not a secret — it names a variable, it holds no value. */
export function askpassScript(platform: NodeJS.Platform): AskpassScript {
  if (platform === 'win32') {
    return { name: 'askpass.bat', content: '@echo off\necho %CREDS_SSH_PASSWORD%\n' };
  }
  return { name: 'askpass.sh', content: '#!/bin/sh\nprintf %s "$CREDS_SSH_PASSWORD"\n' };
}

/** The environment for the dedicated terminal a password connect runs in. */
export function askpassEnv(
  scriptPath: string,
  password: string,
  platform: NodeJS.Platform,
): Record<string, string> {
  const env: Record<string, string> = {
    SSH_ASKPASS: scriptPath,
    SSH_ASKPASS_REQUIRE: 'force',
    CREDS_SSH_PASSWORD: password,
  };
  if (platform !== 'win32') {
    // Pre-8.4 builds refuse askpass without a DISPLAY; on a desktop this is harmlessly
    // already set, and the terminal is dedicated to this connection anyway.
    env.DISPLAY = ':0';
  }
  return env;
}
