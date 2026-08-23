import * as vscode from 'vscode';
import { DB_DEFAULT_PORTS, parseDbConnectionString } from './dbConnString';
import { copiedMessage, copySecret } from './secretClipboard';
import { StorageManager } from './storageManager';
import { buildSshCommand } from './terminalManager';
import { EntityMetadata, FolderType, StoredAccount, TreeNode } from './types';

export async function promptFolderName(initial?: string): Promise<string | undefined> {
  const name = await vscode.window.showInputBox({
    title: initial === undefined ? 'New folder' : 'Rename folder',
    prompt: 'Folder name',
    value: initial ?? '',
    validateInput: (v) => (v.trim().length === 0 ? 'Name must not be empty.' : undefined),
  });
  return name?.trim();
}

/**
 * Format an entity into one key-value block for "Copy All" — kind-aware
 * and listing only fields that actually hold a value.
 */
export function formatEntityBlock(
  details: EntityMetadata,
  password: string | undefined,
  dbConnection?: string,
  notes?: string,
): string {
  const lines = [`Name: ${details.name}`];

  if (details.isDb) {
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

/** QuickPick of a folder's content type (Credential first = default). */
export async function pickFolderType(
  current?: FolderType,
): Promise<FolderType | undefined> {
  const items: Array<vscode.QuickPickItem & { value: FolderType }> = [
    { label: '$(lock) Credential', value: 'credential' },
    { label: '$(remote) SSH connection', value: 'ssh' },
    { label: '$(key) SSH key', value: 'sshkey' },
    { label: '$(shield) VPN', value: 'vpn' },
    { label: '$(database) Database', value: 'db' },
    { label: '$(folder) Any type', description: 'no restriction', value: 'any' },
  ];
  for (const item of items) {
    if (item.value === (current ?? 'credential')) {
      item.description = [item.description, '(current)'].filter(Boolean).join(' ');
    }
  }
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Folder type',
    placeHolder: 'Entities in this folder will be of this type',
  });
  return picked?.value;
}

export type DetailsAction = 'edit' | 'connect' | 'install' | undefined;

/**
 * Details view as a QuickPick: read-only field rows on top, action rows
 * below. Secrets are masked in the list; only the copy actions read the
 * real values from SecretStorage. Actions that need wiring outside this
 * dialog ('edit', 'connect', 'install') are returned to the caller.
 */
export async function showEntityDetails(
  accountId: string,
  node: TreeNode,
  storage: StorageManager,
): Promise<DetailsAction> {
  const details = node.details;
  if (!details) {
    return undefined;
  }
  const password = await storage.getPassword(accountId, details.id);
  const privateKey = await storage.getPrivateKey(accountId, details.id);
  const dbConnection = details.isDb
    ? await storage.getDbConnection(accountId, details.id)
    : undefined;
  const notes = (await storage.getNotes(accountId, details.id)) ?? details.notes;
  const keySourceName =
    details.sshKeyEntityId !== undefined
      ? (storage.getNode(accountId, details.sshKeyEntityId)?.name ?? '(missing entity)')
      : undefined;

  const fieldItems: vscode.QuickPickItem[] = [
    { label: 'Details', kind: vscode.QuickPickItemKind.Separator },
    { label: `$(server) Host: ${details.host ?? '—'}` },
    { label: `$(account) User: ${details.user ?? '—'}` },
    { label: `$(plug) Port: ${details.port ?? '22 (default)'}` },
    { label: `$(lock) Password: ${password !== undefined ? '••••••••' : '— (not set)'}` },
    {
      label: `$(shield) Private key: ${privateKey !== undefined ? 'stored' : details.sshKeyPath ? `path (${details.sshKeyPath})` : '— (not set)'}`,
    },
    { label: `$(broadcast) Public key: ${details.publicKey ? 'stored' : '— (not set)'}` },
    ...(keySourceName !== undefined
      ? [{ label: `$(references) Key source: entity "${keySourceName}"` }]
      : []),
    { label: `$(note) Notes: ${notes ?? '—'}` },
    { label: 'Actions', kind: vscode.QuickPickItemKind.Separator },
  ];

  const copyAll = { label: '$(copy) Copy All' };
  const copyPassword = { label: '$(key) Copy Password' };
  const copyPublicKey = { label: '$(broadcast) Copy Public Key' };
  const copyPrivateKey = { label: '$(shield) Copy Private Key' };
  const connectSsh = { label: '$(terminal) Connect SSH' };
  const install = { label: '$(desktop-download) Install key to system (~/.ssh)' };
  const edit = { label: '$(edit) Edit…' };

  // Offer only actions this entity can actually perform.
  const actions = [
    copyAll,
    ...(password !== undefined ? [copyPassword] : []),
    ...(details.publicKey ? [copyPublicKey] : []),
    ...(privateKey !== undefined ? [copyPrivateKey] : []),
    ...(details.host ? [connectSsh] : []),
    ...(details.isSshKey ? [install] : []),
    edit,
  ];

  const picked = await vscode.window.showQuickPick([...fieldItems, ...actions], {
    title: node.name,
    placeHolder: 'Choose an action',
  });
  if (picked === undefined) {
    return undefined;
  }

  switch (picked) {
    case copyAll:
      await copySecret(
        vscode.env.clipboard,
        formatEntityBlock(details, password, dbConnection, notes),
      );
      void vscode.window.showInformationMessage(copiedMessage(`All fields of "${node.name}"`));
      return undefined;
    case copyPassword:
      if (password === undefined) {
        void vscode.window.showWarningMessage(`"${node.name}" has no stored password.`);
        return undefined;
      }
      await copySecret(vscode.env.clipboard, password);
      void vscode.window.showInformationMessage(copiedMessage(`Password of "${node.name}"`));
      return undefined;
    case copyPublicKey:
      await vscode.env.clipboard.writeText(details.publicKey ?? '');
      void vscode.window.showInformationMessage(`Public key of "${node.name}" copied.`);
      return undefined;
    case copyPrivateKey:
      await copySecret(vscode.env.clipboard, privateKey ?? '');
      void vscode.window.showInformationMessage(copiedMessage(`Private key of "${node.name}"`));
      return undefined;
    case connectSsh:
      return 'connect';
    case install:
      return 'install';
    case edit:
      return 'edit';
    default:
      // A field row was picked — reopen so the dialog feels read-only.
      return showEntityDetails(accountId, node, storage);
  }
}

/** QuickPick of one account's folders (plus root) for "Move to Folder…". */
export async function pickTargetFolder(
  storage: StorageManager,
  accountId: string,
  moving: TreeNode,
): Promise<{ parentId: string | null } | undefined> {
  const folders = storage
    .getNodes(accountId)
    .filter(
      (n) =>
        n.type === 'folder' &&
        n.id !== moving.id &&
        !storage.isSelfOrDescendant(accountId, moving.id, n.id),
    );
  const rootItem = { label: '$(root-folder) (profile root)', parentId: null as string | null };
  const items = [
    rootItem,
    ...folders.map((f) => ({ label: `$(folder) ${f.name}`, parentId: f.id as string | null })),
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: `Move "${moving.name}" to…`,
    placeHolder: 'Target folder',
  });
  return picked === undefined ? undefined : { parentId: picked.parentId };
}

/** QuickPick over the stored account profiles (for toolbar-invoked actions). */
export async function pickAccount(
  storage: StorageManager,
  placeHolder: string,
): Promise<StoredAccount | undefined> {
  const accounts = storage.getAccounts();
  if (accounts.length === 0) {
    void vscode.window.showInformationMessage(
      'No account profiles yet — run "Cred SSH: Add Account" first.',
    );
    return undefined;
  }
  if (accounts.length === 1) {
    return accounts[0];
  }
  const picked = await vscode.window.showQuickPick(
    accounts.map((a) => ({ label: a.email, description: a.provider, account: a })),
    { placeHolder },
  );
  return picked?.account;
}
