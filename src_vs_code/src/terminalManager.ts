import * as vscode from 'vscode';
import { EntityMetadata } from './types';

const DEFAULT_SSH_PORT = 22;

/**
 * Quote a value for the integrated terminal's shell. On Windows shells
 * (PowerShell/cmd) backslashes are path separators, not escapes — only
 * embedded double quotes need care there. On POSIX shells escape the
 * characters that are special inside double quotes.
 */
function shellQuote(value: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `"${value.replace(/([\\"$`])/g, '\\$1')}"`;
}

/** `user@host:port` (port omitted when default) — the connection identity. */
export function describeSshTarget(entity: EntityMetadata): string | undefined {
  if (!entity.host) {
    return undefined;
  }
  const base = entity.user ? `${entity.user}@${entity.host}` : entity.host;
  return entity.port !== undefined && entity.port !== DEFAULT_SSH_PORT
    ? `${base}:${entity.port}`
    : base;
}

/**
 * Build the ssh command line for an entity:
 * `ssh -i "<sshKeyPath>" -p <port> <user>@<host>`
 * `-i` is omitted when no key path is set, `-p` when the port is empty or 22.
 * Returns undefined when the entity has no host.
 */
export function buildSshCommand(
  entity: EntityMetadata,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (!entity.host) {
    return undefined;
  }
  const parts: string[] = ['ssh'];
  if (entity.sshKeyPath) {
    parts.push('-i', shellQuote(entity.sshKeyPath, platform));
  }
  if (entity.port !== undefined && entity.port !== DEFAULT_SSH_PORT) {
    parts.push('-p', String(entity.port));
  }
  parts.push(entity.user ? `${entity.user}@${entity.host}` : entity.host);
  return parts.join(' ');
}

/**
 * Open (or reuse) the terminal for this entity's full connection identity
 * (`SSH: user@host:port`, so two accounts on one host don't collide) and
 * run the ssh command. An existing live terminal is revealed as-is — it
 * most likely already holds a session; re-sending `ssh` into it would
 * type into the remote shell.
 */
export function openSshTerminal(entity: EntityMetadata): vscode.Terminal | undefined {
  const command = buildSshCommand(entity);
  const target = describeSshTarget(entity);
  if (command === undefined || target === undefined) {
    void vscode.window.showWarningMessage(
      `"${entity.name}" has no host configured — cannot start SSH.`,
    );
    return undefined;
  }

  const name = `SSH: ${target}`;
  const existing = vscode.window.terminals.find(
    (t) => t.name === name && t.exitStatus === undefined,
  );
  if (existing) {
    existing.show();
    return existing;
  }

  const terminal = vscode.window.createTerminal({ name });
  terminal.show();
  terminal.sendText(command, true);
  return terminal;
}
