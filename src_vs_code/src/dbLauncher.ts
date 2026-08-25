import * as vscode from 'vscode';
import { copySecret } from './secretClipboard';
import { DbType, EntityMetadata } from './types';

/**
 * Open a database entity in a dedicated DB extension. There is no universal
 * VS Code API for handing over a connection, so integration is tiered:
 *
 *  1. Resolve the target extension: user override
 *     (`credSshManager.dbExtensions`) → first installed candidate →
 *     recommended default (offered for one-click install).
 *  2. Launch: copy the connection string to the clipboard, activate the
 *     target extension, and invoke its "add/connect" command (known ids
 *     first, otherwise discovered from the extension's own manifest) —
 *     the user pastes once into the opened form. MongoDB's official
 *     extension accepts the URI directly in its connect prompt.
 *
 * We deliberately never write into another extension's private storage.
 */

const CONFIG_SECTION = 'credSshManager';
const DB_EXTENSIONS_SETTING = 'dbExtensions';

interface DbTarget {
  id: string;
  label: string;
}

/** Candidates in priority order; the first entry is the recommendation. */
const DB_TARGETS: Record<DbType, DbTarget[]> = {
  postgres: [
    { id: 'ms-ossdata.vscode-pgsql', label: 'PostgreSQL (Microsoft)' },
    { id: 'cweijan.vscode-postgresql-client2', label: 'Database Client (PostgreSQL)' },
    { id: 'cweijan.vscode-mysql-client2', label: 'Database Client' },
  ],
  mysql: [
    { id: 'cweijan.vscode-mysql-client2', label: 'Database Client' },
    { id: 'cweijan.vscode-database-client2', label: 'Database Client 2' },
    { id: 'oracle.mysql-shell-for-vs-code', label: 'MySQL Shell for VS Code (Oracle)' },
  ],
  mssql: [
    { id: 'ms-mssql.mssql', label: 'SQL Server (Microsoft)' },
    { id: 'cweijan.vscode-mysql-client2', label: 'Database Client' },
  ],
  mongodb: [
    { id: 'mongodb.mongodb-vscode', label: 'MongoDB for VS Code (MongoDB Inc.)' },
    { id: 'cweijan.vscode-mysql-client2', label: 'Database Client' },
  ],
};

/** Known "open the add-connection flow" command per extension. */
const KNOWN_CONNECT_COMMANDS: Record<string, string> = {
  'mongodb.mongodb-vscode': 'mdb.connectWithURI',
  'cweijan.vscode-mysql-client2': 'mysql.connection.add',
  'cweijan.vscode-postgresql-client2': 'postgresql.connection.add',
  'ms-mssql.mssql': 'mssql.addObjectExplorer',
};

/**
 * How to get the clipboard string INTO the opened form, per extension.
 * Database Client has no API to prefill (verified: no exports, no settings
 * store, no URI handler) — but its form has a "Use Connection String"
 * toggle that fills every field from one paste.
 */
const PASTE_HINTS: Record<string, string> = {
  'cweijan.vscode-mysql-client2':
    'In the form, flip "Use Connection String" (bottom) and press Ctrl+V — all fields fill at once.',
  'cweijan.vscode-postgresql-client2':
    'In the form, flip "Use Connection String" (bottom) and press Ctrl+V — all fields fill at once.',
  'mongodb.mongodb-vscode': 'Press Ctrl+V into the URI prompt.',
};

function findExtension(candidates: DbTarget[]): {
  installed?: vscode.Extension<unknown>;
  target: DbTarget;
} {
  for (const target of candidates) {
    const installed = vscode.extensions.getExtension(target.id);
    if (installed !== undefined) {
      return { installed, target };
    }
  }
  return { target: candidates[0] };
}

function resolveCandidates(dbType: DbType): DbTarget[] {
  const overrides = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<Record<string, string>>(DB_EXTENSIONS_SETTING, {});
  const override = overrides[dbType]?.trim();
  const defaults = DB_TARGETS[dbType];
  if (override === undefined || override.length === 0) {
    return defaults;
  }
  return [{ id: override, label: override }, ...defaults.filter((t) => t.id !== override)];
}

/** Find an add-connection-ish command in the target's own manifest. */
// eslint-disable-next-line complexity
function discoverConnectCommand(extension: vscode.Extension<unknown>): string | undefined {
  const known = KNOWN_CONNECT_COMMANDS[extension.id.toLowerCase()] ?? KNOWN_CONNECT_COMMANDS[extension.id];
  if (known !== undefined) {
    return known;
  }
  const manifest = extension.packageJSON as {
    contributes?: { commands?: Array<{ command?: string }> };
  };
  const commands = (manifest.contributes?.commands ?? [])
    .map((c) => c.command)
    .filter((c): c is string => typeof c === 'string');
  return (
    commands.find((c) => /connectwithuri/i.test(c)) ??
    commands.find((c) => /connection\.add$|addconnection|addobjectexplorer|connection\.quickconnect/i.test(c)) ??
    commands.find((c) => /\badd\b.*connection|connection.*\badd\b/i.test(c))
  );
}

// eslint-disable-next-line complexity
export async function openInDbExtension(
  entity: EntityMetadata,
  connectionString: string | undefined,
): Promise<void> {
  const dbType = entity.dbType ?? 'postgres';
  const { installed, target } = findExtension(resolveCandidates(dbType));

  if (installed === undefined) {
    const choice = await vscode.window.showInformationMessage(
      `For ${dbType} the recommended extension is "${target.label}" (${target.id}) — it is not installed.`,
      'Install',
    );
    if (choice === 'Install') {
      await vscode.commands.executeCommand('workbench.extensions.installExtension', target.id);
      void vscode.window.showInformationMessage(
        `"${target.label}" installed — press Connect again to open the connection.`,
      );
    }
    return;
  }

  if (connectionString !== undefined && connectionString.length > 0) {
    await copySecret(vscode.env.clipboard, connectionString);
  }

  try {
    await installed.activate();
  } catch {
    // Target failed to activate — still try the command; VS Code will complain.
  }
  const command = discoverConnectCommand(installed);
  if (command === undefined) {
    void vscode.window.showInformationMessage(
      `Connection string — INCLUDING THE PASSWORD — copied to the clipboard. "${target.label}" exposes no add-connection command — open it and paste manually.`,
    );
    return;
  }
  try {
    await vscode.commands.executeCommand(command);
    const hint =
      PASTE_HINTS[installed.id] ??
      PASTE_HINTS[installed.id.toLowerCase()] ??
      'The connection string is on your clipboard — paste it into the form.';
    void vscode.window.showInformationMessage(
      connectionString !== undefined && connectionString.length > 0
        ? `Opened "${target.label}". ${hint}`
        : `Opened "${target.label}" — this entity has no stored connection string.`,
    );
  } catch (error) {
    void vscode.window.showWarningMessage(
      `Could not invoke ${command} in "${target.label}": ${error instanceof Error ? error.message : String(error)}. The connection string is on your clipboard.`,
    );
  }
}
