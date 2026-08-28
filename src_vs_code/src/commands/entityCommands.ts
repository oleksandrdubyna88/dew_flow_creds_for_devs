/* eslint-disable complexity, max-lines-per-function -- command registrations moved verbatim out of extension.ts
   (roadmap A1 stage 2, 2026-08-28): one function that registers a family of closures, each the size it
   was. The ceilings are a boundary for NEW code here; a handler meets them when it is next touched. */
import { TreeNode } from '../types';
import { AgentDoors } from '../agentDoors';
import { StorageManager } from '../storageManager';
import { VaultKeys } from '../vaultKeys';
import { asElement } from '../commandTargets';
import * as vscode from 'vscode';
import { nodeAt } from '../entityViewerCommands';
import { buildCommandLine } from '../commandLine';
import { describeCommand } from '../commandLine';
import { openEntityViewer } from '../entityViewerCommands';
import { copySecret } from '../secretClipboard';
import { copiedMessage } from '../secretClipboard';
import { totpSnapshot } from '../totp';
import { runHygieneScan } from '../hygieneScan';
import { generatePassphrase } from '../secretGenerator';
import { DEFAULT_PASSPHRASE } from '../secretGenerator';
import { generatePassword } from '../secretGenerator';
import { DEFAULT_PASSWORD } from '../secretGenerator';
import { installKeyToSystem } from '../keyInstaller';
import { removeInstalledKey } from '../keyInstaller';
import { saveVpnConfigToFile } from '../vpnRun';
import { runVpn } from '../vpnRun';
import { withoutPassword } from '../dbConnString';
import { openInDbExtension } from '../dbLauncher';
export interface EntityCommandsHost {
  readonly doorsAt: (accountId: string, node: TreeNode) => AgentDoors;
  readonly mutated: () => void;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly storageDir: string;
  readonly vaultKeys: VaultKeys;
}

export function registerEntityCommands(host: EntityCommandsHost): void {
  const { doorsAt, mutated, register, storage, storageDir, vaultKeys } = host;

  register('credSshManager.copyCommand', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node') {
      return;
    }
    const d = element.node.details;
    const line = buildCommandLine(d?.command ?? '', d?.commandArgs);
    if (line.length === 0) {
      void vscode.window.showWarningMessage(`"${element.node.name}" has no command yet.`);
      return;
    }
    // Not a secret, so it does not expire the way a password copy does.
    await vscode.env.clipboard.writeText(line);
    void vscode.window.showInformationMessage(`Copied: ${line}`);
  });

  register('credSshManager.showCommand', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node') {
      return;
    }
    const d = element.node.details;
    const text = describeCommand(d?.command ?? '', d?.commandArgs, d?.commandNote);
    const document = await vscode.workspace.openTextDocument({
      content: text.length > 0 ? text : 'This entry has no command yet.',
      language: 'shellscript',
    });
    await vscode.window.showTextDocument(document, { preview: true });
  });

  register('credSshManager.viewDetails', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    // The viewer, not the old QuickPick: that one knew only the SSH fields, so a VPN, database,
    // script or command entity opened as "Host —, Password not set" and read as broken.
    await openEntityViewer(element.accountId, element.node, storage, doorsAt(element.accountId, element.node));
  });

  register('credSshManager.copyPassword', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const password = await storage.getPassword(element.accountId, element.node.details.id);
    if (password === undefined) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has no stored password.`,
      );
      return;
    }
    await copySecret(vscode.env.clipboard, password);
    void vscode.window.showInformationMessage(
      copiedMessage(`Password of "${element.node.name}"`),
    );
  });

  // The current one-time code, computed from the stored seed at this moment. The seed
  // itself never leaves SecretStorage; what lands on the clipboard expires twice — once
  // when the period ends, once when the clipboard TTL clears it.
  register('credSshManager.copyTotpCode', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const now = Date.now();
    const snapshot = totpSnapshot(await storage.getTotp(element.accountId, element.node.details.id), now);
    if (snapshot === undefined) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has no one-time code seed — open Edit and paste the otpauth:// URI or the base32 secret.`,
      );
      return;
    }
    await copySecret(vscode.env.clipboard, snapshot.code);
    const secondsLeft = Math.ceil((snapshot.validUntil - now) / 1000);
    void vscode.window.showInformationMessage(
      copiedMessage(`One-time code of "${element.node.name}" (valid for ${secondsLeft} s more)`),
    );
  });

  // Per-entry SSH on/off switch (default is off for new entities).
  register('credSshManager.toggleSsh', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const details = { ...element.node.details, isSshEnabled: !element.node.details.isSshEnabled };
    await storage.updateNode(element.accountId, { ...element.node, details });
    mutated();
    void vscode.window.showInformationMessage(
      `SSH ${details.isSshEnabled ? 'enabled' : 'disabled'} for "${element.node.name}".`,
    );
  });

  register('credSshManager.healthReport', async () => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'CredsForDevs: checking…',
        // Cancellable because the optional breach check makes network calls: without this the
        // only way out of a long scan is reloading the window.
        cancellable: true,
      },
      (_progress, token) => runHygieneScan(storage, token),
    );
    const document = await vscode.workspace.openTextDocument({
      content: result.markdown,
      language: 'markdown',
    });
    await vscode.window.showTextDocument(document, { preview: true });
  });

  register('credSshManager.generateSecret', async () => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const kind = await vscode.window.showQuickPick(
      [
        { label: '$(key) Password', detail: '32 characters, mixed sets — for a field, not for typing', id: 'password' },
        { label: '$(comment) Passphrase', detail: '6 words — for a PIN, or anything said aloud', id: 'passphrase' },
      ],
      { title: 'Generate a secret', ignoreFocusOut: true },
    );
    if (kind === undefined) {
      return;
    }
    const made = kind.id === 'passphrase'
      ? generatePassphrase(DEFAULT_PASSPHRASE)
      : generatePassword(DEFAULT_PASSWORD);
    await copySecret(vscode.env.clipboard, made.value);
    void vscode.window.showInformationMessage(`${made.description} ${copiedMessage('It')}`);
  });

  register('credSshManager.installSshKey', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const privateKey = await storage.getPrivateKey(element.accountId, element.node.details.id);
    await installKeyToSystem(element.node.details, privateKey);
  });

  // Write the stored VPN config back out as a file.
  register('credSshManager.removeInstalledKey', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    await removeInstalledKey(element.node.details);
  });

  register('credSshManager.saveVpnConfig', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    await saveVpnConfigToFile(element.accountId, element.node.details, storage);
  });

  register('credSshManager.startVpn', (target) =>
    runVpn(target, 'start', storage, storageDir, vaultKeys),
  );

  // Open a database entity in the matching DB extension.
  register('credSshManager.copyDbConnectionNoPassword', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const conn = await storage.getDbConnection(element.accountId, element.node.details.id);
    if (conn === undefined) {
      void vscode.window.showWarningMessage('No connection string stored for this entry.');
      return;
    }
    await copySecret(vscode.env.clipboard, withoutPassword(conn));
    void vscode.window.showInformationMessage(
      'Connection string copied WITHOUT the password. It clears from the clipboard shortly.',
    );
  });

  register('credSshManager.connectDb', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const connectionString = await storage.getDbConnection(
      element.accountId,
      element.node.details.id,
    );
    await openInDbExtension(element.node.details, connectionString);
  });

  register('credSshManager.copyDbConnection', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node' || !element.node.details) {
      return;
    }
    const value = await storage.getDbConnection(element.accountId, element.node.details.id);
    if (value === undefined) {
      void vscode.window.showWarningMessage(
        `"${element.node.name}" has no stored connection string.`,
      );
      return;
    }
    await copySecret(vscode.env.clipboard, value);
    void vscode.window.showInformationMessage(
      copiedMessage(`Connection string of "${element.node.name}"`),
    );
  });

}
