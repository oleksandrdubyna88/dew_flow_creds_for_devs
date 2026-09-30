import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * Save-As for a text secret the caller already holds. `note` is what the confirmation adds — for a
 * value of a protected entry, that the file is outside the PIN (`pinClick.outsidePinNote`).
 */
export async function saveTextAs(title: string, suggestedName: string, content: string, note?: string): Promise<void> {
  const uri = await vscode.window.showSaveDialog({
    title,
    defaultUri: vscode.Uri.file(path.join(os.homedir(), suggestedName)),
  });
  if (uri === undefined) {
    return;
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  void vscode.window.showInformationMessage(`Saved to ${uri.fsPath}.${note ?? ''}`);
}
