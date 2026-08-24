/**
 * The plain-text block for an entity — the details view, the tooltip, `Copy All`.
 *
 * <p>Lifted out of `dialogs.ts` so it can be tested: it takes only data, and the one
 * thing it needed from a `vscode`-importing file (`buildSshCommand`) moved to
 * `sshCommand.ts` for the same reason.</p>
 */

import { DB_DEFAULT_PORTS, parseDbConnectionString } from './dbConnString';
import { buildSshCommand } from './sshCommand';
import { describeCommand } from './commandLine';
import { EntityMetadata } from './types';

export function formatEntityBlock(
  details: EntityMetadata,
  password: string | undefined,
  dbConnection?: string,
  notes?: string,
): string {
  const lines = [`Name: ${details.name}`];

  // A command entry has none of the other flags, and describeCommand already renders
  // exactly what this block wants — the line, what it is for, and what each argument
  // means. It was written for the tooltip and simply was not reached from here, which
  // is why the details view showed a name and nothing else.
  if (details.isTerminal) {
    const described = describeCommand(details.command ?? '', details.commandArgs, details.commandNote);
    if (described.length > 0) {
      lines.push('', described);
    }
  } else if (details.isDb) {
    lines.push(`DB type: ${details.dbType ?? 'unknown'}`);
    if (dbConnection !== undefined && dbConnection.length > 0) {
      lines.push(`Connection string: ${dbConnection}`);
      const p = parseDbConnectionString(dbConnection);
      const port =
        p.port ?? (details.dbType !== undefined ? DB_DEFAULT_PORTS[details.dbType] : undefined);
      if (p.host) {
        lines.push(`Host: ${p.host}`);
      }
      if (port) {
        lines.push(`Port: ${port}`);
      }
      if (p.database) {
        lines.push(`Database: ${p.database}`);
      }
      if (p.user) {
        lines.push(`User: ${p.user}`);
      }
      if (p.password) {
        lines.push(`Password: ${p.password}`);
      }
    }
  } else {
    if (details.isVpn) {
      lines.push(`VPN type: ${details.vpnType ?? 'unknown'}`);
      if (details.vpnConfigFileName) {
        lines.push(`VPN config file: ${details.vpnConfigFileName}`);
      }
    }
    if (details.host) {
      lines.push(`Host: ${details.host}`);
    }
    if (details.user) {
      lines.push(`User: ${details.user}`);
    }
    if (details.port !== undefined) {
      lines.push(`Port: ${details.port}`);
    }
    if (password !== undefined) {
      lines.push(`Password: ${password}`);
    }
    const ssh = buildSshCommand(details);
    if (ssh !== undefined) {
      lines.push(`SSH: ${ssh}`);
    }
    if (details.publicKey) {
      lines.push(`Public key: ${details.publicKey}`);
    }
    if (details.sshKeyPath) {
      lines.push(`Key path: ${details.sshKeyPath}`);
    }
  }

  const noteText = notes ?? details.notes;
  if (noteText) {
    lines.push(`Notes: ${noteText}`);
  }
  return lines.join('\n');
}
