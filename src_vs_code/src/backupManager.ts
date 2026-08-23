import * as vscode from 'vscode';
import { verifyAccountSession } from './authManager';
import { planBackupFileNames } from './backupNaming';
import { BackupError, decryptJson, encryptJson, readBackupAccount } from './cryptoUtils';
import { nasDirFor } from './nasPaths';
import { validatePin } from './pinPolicy';
import { sharesFromEnvelope } from './shareFormat';
import { StorageManager } from './storageManager';
import { StoredAccount, isBackupBundle } from './types';

const CONFIG_SECTION = 'credSshManager';
const NAS_PATH_SETTING = 'nasBackupPath';

/**
 * NAS backup engine: one AES-256-GCM encrypted file per account profile,
 * keyed by `scrypt(accountId + masterPin)` so a file can only be restored
 * by (a holder of) the matching account plus the PIN.
 */

/** The profile-bound passphrase mandated by the backup design. */
function profilePassphrase(accountId: string, masterPin: string): string {
  return accountId + masterPin;
}

async function promptMasterPin(purpose: string, confirm: boolean): Promise<string | undefined> {
  const pin = await vscode.window.showInputBox({
    title: purpose,
    prompt: 'Master PIN/password for the encrypted backup',
    password: true,
    validateInput: validatePin,
  });
  if (pin === undefined || !confirm) {
    return pin;
  }
  const repeat = await vscode.window.showInputBox({
    title: purpose,
    prompt: 'Repeat the master PIN/password',
    password: true,
  });
  if (repeat === undefined) {
    return undefined;
  }
  if (repeat !== pin) {
    void vscode.window.showErrorMessage('PINs do not match — cancelled.');
    return undefined;
  }
  return pin;
}

async function resolveNasDirectory(): Promise<vscode.Uri | undefined> {
  const nasPath = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<string>(NAS_PATH_SETTING, '')
    .trim();
  if (nasPath.length === 0) {
    const choice = await vscode.window.showErrorMessage(
      `NAS backup path is not configured (setting "${CONFIG_SECTION}.${NAS_PATH_SETTING}").`,
      'Open Settings',
    );
    if (choice === 'Open Settings') {
      void vscode.commands.executeCommand(
        'workbench.action.openSettings',
        `${CONFIG_SECTION}.${NAS_PATH_SETTING}`,
      );
    }
    return undefined;
  }

  const dirUri = vscode.Uri.file(nasPath);
  try {
    const stat = await vscode.workspace.fs.stat(dirUri);
    if ((stat.type & vscode.FileType.Directory) === 0) {
      void vscode.window.showErrorMessage(`NAS backup path is not a directory: ${nasPath}`);
      return undefined;
    }
  } catch {
    void vscode.window.showErrorMessage(
      `NAS backup path is missing or unreachable: ${nasPath}`,
    );
    return undefined;
  }
  return dirUri;
}

/** "Backup to NAS": one encrypted file per logged-in account profile. */
export async function backupToNas(storage: StorageManager): Promise<void> {
  const accounts = storage.getAccounts();
  if (accounts.length === 0) {
    void vscode.window.showInformationMessage(
      'Nothing to back up — add an account profile first.',
    );
    return;
  }

  const anyDir = accounts.some((a) => nasDirFor(a) !== undefined);
  if (!anyDir) {
    const fallback = await resolveNasDirectory(); // shows the settings hint
    if (fallback === undefined) {
      return;
    }
  }
  const pin = await promptMasterPin('Backup to NAS', true);
  if (pin === undefined) {
    return;
  }

  // Unique name per account — same email under two providers must not
  // silently overwrite each other's backup file.
  const fileNames = planBackupFileNames(accounts);
  const written: string[] = [];
  const failed: string[] = [];
  for (const account of accounts) {
    try {
      const bundle = await storage.exportBundle(account.accountId);
      const fileName = fileNames.get(account.accountId);
      if (fileName === undefined) {
        throw new Error('internal: no backup filename planned for this account');
      }
      const dirUri = nasDirFor(account);
      if (dirUri === undefined) {
        throw new Error('no sync folder configured for this account');
      }
      const fileUri = vscode.Uri.joinPath(dirUri, fileName);
      // Preserve pending shares living in the existing file's envelope.
      let pendingShares: unknown[] = [];
      try {
        pendingShares = sharesFromEnvelope(
          Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8'),
        );
      } catch {
        // no existing file — nothing to preserve
      }
      const content = encryptJson(
        bundle,
        profilePassphrase(account.accountId, pin),
        account,
        pendingShares,
      );
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
      written.push(fileUri.fsPath);
    } catch (error) {
      failed.push(`${account.email}: ${describeUnknown(error)}`);
    }
  }

  if (failed.length > 0) {
    void vscode.window.showErrorMessage(
      `Backup finished with errors — written: ${written.length}, failed: ${failed.join('; ')}`,
    );
    return;
  }
  void vscode.window.showInformationMessage(
    `Backed up ${written.length} account profile(s).`,
  );
}

/**
 * "Import / Restore": pick an .enc file, verify the auth session for the
 * account it belongs to, then decrypt with accountId+PIN and restore.
 */
export async function restoreFromBackup(
  storage: StorageManager,
  onRestored: () => void,
): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    title: 'Open encrypted backup',
    canSelectMany: false,
    filters: { 'Encrypted backup': ['enc'] },
  });
  const uri = uris?.[0];
  if (uri === undefined) {
    return;
  }

  let content: string;
  let account: StoredAccount | undefined;
  try {
    content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    account = readBackupAccount(content);
  } catch (error) {
    void vscode.window.showErrorMessage(`Restore failed: ${describeUnknown(error)}`);
    return;
  }
  if (account === undefined) {
    void vscode.window.showErrorMessage(
      'Restore failed: this backup carries no account metadata, so its profile-bound key cannot be derived.',
    );
    return;
  }

  const authorized = await verifyAccountSession(account);
  if (!authorized) {
    void vscode.window.showErrorMessage(
      `Restore failed: no active ${account.provider} session for ${account.email}. Sign in with that account and retry.`,
    );
    return;
  }

  const pin = await promptMasterPin(`Restore ${account.email}`, false);
  if (pin === undefined) {
    return;
  }

  let payload: unknown;
  try {
    payload = decryptJson(content, profilePassphrase(account.accountId, pin));
  } catch (error) {
    void vscode.window.showErrorMessage(`Restore failed: ${describeUnknown(error)}`);
    return;
  }
  if (!isBackupBundle(payload)) {
    void vscode.window.showErrorMessage(
      'Restore failed: the backup decrypted, but its content does not match the expected schema.',
    );
    return;
  }

  const existing = storage.getNodes(account.accountId).length;
  if (existing > 0) {
    const confirmed = await vscode.window.showWarningMessage(
      `Restoring replaces the current tree of ${account.email} (${existing} nodes) and its passwords. Continue?`,
      { modal: true },
      'Replace',
    );
    if (confirmed !== 'Replace') {
      return;
    }
  }

  await storage.upsertAccount(account);
  await storage.importBundle(account.accountId, payload);
  onRestored();
  void vscode.window.showInformationMessage(
    `Restored ${payload.nodes.length} nodes and ${Object.keys(payload.passwords).length} passwords into ${account.email}.`,
  );
}

function describeUnknown(error: unknown): string {
  if (error instanceof BackupError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
