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
  // The name is UNTRUSTED. `envBindings` is plaintext metadata that syncs, and the
  // entity shape guard only asked whether it was a string — so an entity arriving from
  // a shared vault location or an accepted share could carry a name that is not a name.
  // This line is typed into a terminal with Enter pressed, so an unchecked name is a
  // command. `isValidEnvName` was enforced on the form's own input and nowhere else,
  // which is exactly backwards: the form is the one path that was never the threat.
  if (!isValidEnvName(name)) {
    return '';
  }
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
