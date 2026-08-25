import * as vscode from 'vscode';
import { EntityMetadata } from './types';
import { StorageManager } from './storageManager';
import { askpassEnv } from './sshAskpass';
import { buildSshCommand, describeSshTarget, openSshTerminal } from './terminalManager';
import {
  forgetMaterializedKey,
  materializePrivateKey,
  writeAskpassScriptFile,
} from './keyInstaller';
import { resolveSshCredential } from './sshCredential';

/**
 * The human Connect path: open an SSH session for an entity in a VS Code
 * terminal. Moved out of `extension.ts` so the agent broker's terminal action
 * can call the exact same code the tree's Connect button runs.
 */
// eslint-disable-next-line complexity, max-lines-per-function
export async function connectEntity(
  accountId: string,
  entity: EntityMetadata,
  storage: StorageManager,
  storageDir: string,
): Promise<void> {
  const source = await resolveSshCredential(storage, accountId, entity);
  if (source.warning !== undefined) {
    void vscode.window.showWarningMessage(source.warning);
  }

  let keyPath: string | undefined;
  let materialized: string | undefined;
  if (source.kind === 'storedKey') {
    try {
      keyPath = materializePrivateKey(storageDir, source.keyEntityId, source.content);
      materialized = keyPath;
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Could not write the stored key to disk: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
  } else if (source.kind === 'keyPath') {
    keyPath = source.path;
  }

  // No key anywhere, but a password stored: supply it through SSH_ASKPASS in a
  // dedicated terminal, so nobody retypes what the vault already knows. The password
  // rides the terminal's ENVIRONMENT — not a file, not the command line.
  if (source.kind === 'password') {
    const command = buildSshCommand(entity);
    const target = describeSshTarget(entity);
    if (command === undefined || target === undefined) {
      void vscode.window.showWarningMessage(`"${entity.name}" has no host configured — cannot start SSH.`);
      return;
    }
    const scriptPath = writeAskpassScriptFile(storageDir, process.platform);
    // A FRESH terminal every time: the env carries this entity's password, and reusing
    // one would run the new session with the previous entity's credentials.
    const name = `SSH: ${target}`;
    vscode.window.terminals.find((t) => t.name === name && t.exitStatus === undefined)?.dispose();
    const passTerminal = vscode.window.createTerminal({
      name,
      env: askpassEnv(scriptPath, source.password, process.platform),
    });
    passTerminal.show();
    // accept-new: with SSH_ASKPASS_REQUIRE=force even the host-key yes/no question
    // would be answered by the askpass program — with the password.
    passTerminal.sendText(`${command.replace(/^ssh /, 'ssh -o StrictHostKeyChecking=accept-new ')}`, true);
    return;
  }

  const terminal = openSshTerminal({ ...entity, sshKeyPath: keyPath });
  // Wipe the decrypted key from disk as soon as the session ends.
  if (materialized !== undefined) {
    if (terminal === undefined) {
      forgetMaterializedKey(materialized);
    } else {
      const sub = vscode.window.onDidCloseTerminal((closed) => {
        if (closed === terminal) {
          forgetMaterializedKey(materialized as string);
          sub.dispose();
        }
      });
    }
  }
}
