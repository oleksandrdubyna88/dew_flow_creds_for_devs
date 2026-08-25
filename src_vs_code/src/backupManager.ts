import * as vscode from 'vscode';
import { verifyAccountSession } from './authManager';
import { planBackupFileNames } from './backupNaming';
import {
  BackupError,
  decryptJsonAsync,
  decryptJsonWithMasterKey,
  readBackupAccount,
  readVaultWraps,
} from './cryptoUtils';
import { isKeyWrap, unwrapWithPinAsync, wrapPinVaultAsync } from './keyWrap';
import { nasDirFor } from './nasPaths';
import { validatePin } from './pinPolicy';
import { sharesFromEnvelope } from './shareFormat';
import { StorageManager } from './storageManager';
import { StoredAccount, isBackupBundle } from './types';
import { backupWriteMode } from './backupPlan';
import { VaultKeys } from './vaultKeys';
import { writeVaultFileAtomically } from './nasFileWrite';

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

// eslint-disable-next-line complexity
async function promptMasterPin(
  purpose: string,
  confirm: boolean,
  detail?: string,
): Promise<string | undefined> {
  const pin = await vscode.window.showInputBox({
    title: purpose,
    prompt: detail ?? 'Master PIN/password for the encrypted backup',
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

// eslint-disable-next-line complexity
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
// eslint-disable-next-line complexity, max-lines-per-function
export async function backupToNas(
  storage: StorageManager,
  vaultKeys: VaultKeys,
): Promise<void> {
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
  // The PIN is asked for LAZILY, and only for a vault that has no other key. Asking up
  // front is what made this command look like it did not know about the security key —
  // and it did not: it wrote the PIN-only envelope over the same file sync uses, so a
  // vault with a key registered came back as one without. See backupPlan.ts.
  let pin: string | undefined;
  let pinAsked = false;
  const askPin = async (): Promise<string | undefined> => {
    if (!pinAsked) {
      pinAsked = true;
      pin = await promptMasterPin('Backup to NAS', true);
    }
    return pin;
  };

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
      // Preserve pending shares living in the existing file's envelope — and read the
      // envelope itself, because what is already in that file decides how it may be
      // written.
      let existing: string | undefined;
      let pendingShares: unknown[] = [];
      try {
        existing = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
        pendingShares = sharesFromEnvelope(existing);
      } catch {
        // no existing file — nothing to preserve
      }

      let content: string;
      if (backupWriteMode(existing).kind === 'wrapped') {
        // Unlock through the vault's own key slots: a registered security key is touched,
        // a stored PIN is used, and the wraps are carried into what we write. Anything
        // else here silently removes the ability to open this vault with that key.
        const key = await vaultKeys.unlock(account, existing, { interactive: true });
        if (key === undefined) {
          throw new Error('vault stayed locked — nothing was written, so its keys are intact');
        }
        content = await vaultKeys.encrypt(bundle, key, account, pendingShares);
      } else {
        const entered = await askPin();
        if (entered === undefined) {
          throw new Error('no PIN given');
        }
        // v3, self-contained: a fresh master sealed in a pin-wrap under the standalone
        // backup PIN — so scrypt runs once on restore, not per read, and no v1 is written.
        // Keyed by the backup PIN alone, never the vault-key cache (see backupWriteMode).
        content = (await wrapPinVaultAsync(
          bundle,
          account.accountId,
          entered,
          Date.now(),
          account,
          pendingShares,
        )).content;
      }
      // Atomic, like FolderTransport: this writes the SAME file automatic sync reads, so a
      // dropped NAS connection mid-write must leave the previous good file, not a truncated
      // one under the name other machines treat as authoritative.
      await writeVaultFileAtomically(dirUri, fileName, content);
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
// eslint-disable-next-line complexity, max-lines-per-function
export async function restoreFromBackup(
  storage: StorageManager,
  vaultKeys: VaultKeys,
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

  // Which recipe opens this file is a property OF THE FILE, not of the command. A
  // vault with a security key is a v2 envelope: its payload is sealed with the master
  // key, and the PIN opens only the wrap holding that key — so decrypting v2 with the
  // v1 scrypt(accountId + PIN) recipe fails whatever PIN is typed. That was "signed in,
  // entered the PIN, restore still errors".
  let payload: unknown;
  try {
    // Routed by the presence of KEY SLOTS, not by a version number: `=== 2` broke the
    // day the wrapped format moved to 3, sending key-wrapped vaults into the PIN-only
    // branch — a PIN prompt on a file a PIN alone cannot open. backupWriteMode is the
    // one place that answers this, and unparseable content counts as wrapped there.
    if (backupWriteMode(content).kind === 'wrapped') {
      // Through the vault's own key slots: the stored PIN, a security-key touch, or the
      // PIN typed — the same door sync uses, on the same file format.
      const key = await vaultKeys.unlock(account, content, { interactive: true });
      if (key === undefined) {
        void vscode.window.showErrorMessage('Restore cancelled — the backup stayed locked.');
        return;
      }
      payload = await vaultKeys.decrypt(content, key);
    } else {
      // Say WHY it is a PIN and not a key touch: the question every owner of a security
      // key asks here, and silence reads as the key being ignored.
      const pin = await promptMasterPin(
        `Restore ${account.email}`,
        false,
        'This backup is opened by its own backup PIN — it has no security-key slot, so a ' +
          'key touch cannot open it. Enter the PIN that was set when this backup was made.',
      );
      if (pin === undefined) {
        return;
      }
      // A v3 self-contained backup carries a pin-wrap: unwrap the master with the backup PIN,
      // one scrypt, then read the payload. A legacy v1 backup has no wrap and decrypts
      // directly. Both are keyed by the standalone backup PIN, never the vault-key cache.
      const pinWrap = readVaultWraps(content)
        .filter(isKeyWrap)
        .find((w) => w.kind === 'pin');
      payload =
        pinWrap === undefined
          ? await decryptJsonAsync(content, profilePassphrase(account.accountId, pin))
          : decryptJsonWithMasterKey(content, await unwrapWithPinAsync(pinWrap, account.accountId, pin));
    }
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
