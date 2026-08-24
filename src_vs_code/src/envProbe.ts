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
  const shell = (shellPath ?? '').toLowerCase().replace(/\\/g, '/');
  const base = shell.split('/').pop() ?? '';

  if (base.startsWith('powershell') || base.startsWith('pwsh')) {
    return `echo "${name}=$env:${name}"`;
  }
  if (base.startsWith('cmd')) {
    return `echo ${name}=%${name}%`;
  }
  if (base.length > 0) {
    return `echo "${name}=$${name}"`;
  }
  return platform === 'win32' ? `echo "${name}=$env:${name}"` : `echo "${name}=$${name}"`;
}
