import { isValidEnvName } from './envBinding';

/**
 * The probe line typed into a fresh terminal after a variable is written, so the person
 * SEES it is really there instead of trusting a notification.
 *
 * <p>Which spelling works is a property of the SHELL, not the OS — a Windows machine
 * whose default terminal is git-bash needs the POSIX form, and the wrong guess prints a
 * literal `$env:NAME`, which reads as "it did not work" about a variable that is set.</p>
 */
export function envProbeCommand(
  shellPath: string | undefined,
  name: string,
  platform: NodeJS.Platform = process.platform,
): string {
  // Names arrive validated (readEnvBindings), but a binding synced from another client
  // is data from elsewhere: never interpolate an unvalidated name into a shell line.
  if (!isValidEnvName(name)) {
    return 'echo "CredsForDevs: that variable name is not a valid environment name"';
  }
  const shell = (shellPath ?? '').toLowerCase().replace(/\\/g, '/');
  const base = shell.split('/').pop() ?? '';
  const powershell = base.startsWith('powershell') || base.startsWith('pwsh');
  const cmd = base.startsWith('cmd');

  if (powershell || (base.length === 0 && platform === 'win32')) {
    return `if ($env:${name}) { "${name}: SET (len=$($env:${name}.Length))" } else { "${name}: NOT SET" }`;
  }
  if (cmd) {
    // cmd has no cheap string-length primitive; presence only, deliberately asymmetric.
    return `if defined ${name} (echo ${name}: SET) else (echo ${name}: NOT SET)`;
  }
  return `if [ -n "$${name}" ]; then echo "${name}: SET (len=\${#${name}})"; else echo "${name}: NOT SET"; fi`;
}
