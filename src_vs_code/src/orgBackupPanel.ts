import * as path from 'node:path';
import * as vscode from 'vscode';
import { writeArchiveTo } from './archiveDownload';
import { isBackupPageMessage } from './backupPage';
import { BackupTab } from './backupTab';
import { MintedBackupKey, OrgBackupClient } from './orgBackupClient';
import { StoredAccount } from './types';

/**
 * The **Server backup** tab: the `vscode` half, and only that.
 *
 * <p>It creates the panel, routes its messages to `BackupTab`, raises the one modal in this feature
 * that must not be missable, and streams the archive to a path a person chose. Everything that
 * decides anything is in `backupTab.ts` and `backupPage.ts`, which import no `vscode`.</p>
 */
export function showOrgBackup(client: OrgBackupClient, account: StoredAccount): void {
  const panel = vscode.window.createWebviewPanel(
    'credSshOrgBackup',
    `CredsForDevs: Server backup — ${account.email}`,
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] },
  );
  // A request in flight when somebody closes the tab still answers, and assigning to a disposed
  // webview throws inside a promise nobody is awaiting — an unhandled rejection in the extension
  // host rather than anything a person sees. So the draw stops at the door.
  let closed = false;
  panel.onDidDispose(() => {
    closed = true;
  });
  const tab = new BackupTab(client, account, {
    draw: (html) => {
      if (!closed) {
        panel.webview.html = html;
      }
    },
    showKey: (minted) => showKeyOnce(minted, account),
    saveArchive: () => saveArchive(client, account),
  });
  panel.webview.onDidReceiveMessage((message: unknown) => {
    if (isBackupPageMessage(message)) {
      void tab.handle(message);
    }
  });
  panel.onDidChangeViewState(() => {
    if (panel.visible) {
      tab.redraw();
    }
  });
  void tab.start();
}

/**
 * The one screen in this feature where getting it wrong is unrecoverable.
 *
 * <p>The words exist for the length of this dialog and nowhere else: what the server keeps is their
 * HKDF output, and HKDF does not run backwards. So it is <b>modal</b> — a toast can be missed while
 * somebody is looking at another window — it offers <b>Copy</b>, and it does not close on the first
 * button: the person has to say they have saved them. A dialog dismissed by reflex is how a
 * deployment ends up with archives nobody can open, and the day that is discovered is a restore.</p>
 *
 * <p>The key is never written to a file by this extension, never logged, and never put in the
 * webview's DOM. Clipboard is the person's own choice, made by pressing a button.</p>
 */
async function showKeyOnce(minted: MintedBackupKey, account: StoredAccount): Promise<boolean> {
  const warning = `This is the backup key for ${account.email}. It is shown ONCE — nothing can `
    + 'produce it again, and without it every archive this server takes is unopenable. It is the '
    + 'highest-value secret in the deployment: this key and one archive rebuild everything, '
    + 'including the key that seals developer logins. Write it down somewhere off this machine.';
  // Shown again and again until the person says one of the two things that end it. Copying does
  // not end it: somebody who copies still has to say they have saved it.
  for (;;) {
    const ending = await shownOnce(warning, minted);
    if (ending !== 'again') {
      // SAVED or DISCARDED, and the caller is told which. The server acknowledged this key by
      // answering, so a discard leaves a deployment sealing archives under words nobody has — and
      // reporting that as an ordinary success is the one thing this return value prevents.
      return ending === 'saved';
    }
  }
}

/** How one showing ended: they saved it, they threw it away, or the dialog goes up again. */
type KeyEnding = 'saved' | 'discarded' | 'again';

async function shownOnce(warning: string, minted: MintedBackupKey): Promise<KeyEnding> {
  const answer = await askOnce(warning, minted);
  if (answer === 'Copy to clipboard') {
    await vscode.env.clipboard.writeText(minted.key);
    return 'again';
  }
  if (answer === 'I have saved it') {
    return 'saved';
  }
  return (await wantsItAgain()) ? 'again' : 'discarded';
}

/** The modal itself. Its own function so the loop above is a decision and not a dialog. */
function askOnce(warning: string, minted: MintedBackupKey): Thenable<string | undefined> {
  return vscode.window.showWarningMessage(
    `${warning}\n\n${minted.key}`,
    { modal: true, detail: `${Math.round(minted.entropyBits)} bits of entropy.` },
    'Copy to clipboard',
    'I have saved it',
  );
}

/**
 * The dialog was DISMISSED — Escape, or the X. Ask again rather than accept it.
 *
 * <p>"I closed it by accident" and "I have written it down" must not be the same gesture, because
 * one of them ends with a deployment whose archives nobody can ever open and the other does not.</p>
 */
async function wantsItAgain(): Promise<boolean> {
  const sure = await vscode.window.showWarningMessage(
    'The backup key has not been saved. Close this and it is gone for good — no archive taken under '
    + 'it could ever be opened.',
    { modal: true },
    'Show it again',
    'Discard it anyway',
  );
  return sure === 'Show it again';
}

/**
 * Stream the newest archive to a path the person chooses.
 *
 * <p><b>To a temporary file beside the destination, then renamed.</b> A 400 MB download that fails
 * halfway would otherwise leave a truncated file at the chosen path — indistinguishable from a good
 * archive until a restore, and it may have overwritten the previous one on the way. The rename is
 * atomic within a directory, so what appears at the chosen path is either the whole archive or
 * nothing.</p>
 *
 * <p>The body is piped, never buffered: this is the largest thing this extension writes to disk, and
 * a response read into memory first is an out-of-memory on a machine that was fine a moment ago.</p>
 */
async function saveArchive(client: OrgBackupClient, account: StoredAccount): Promise<void> {
  const download = await client.downloadArchive(account);
  const target = await vscode.window.showSaveDialog({
    saveLabel: 'Save archive',
    defaultUri: vscode.Uri.file(download.name),
    filters: { 'Encrypted vault archive': ['cvbk'] },
  });
  if (target === undefined) {
    await download.body.cancel().catch(() => undefined);
    return;
  }
  const written = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Downloading ${download.name}…` },
    (progress) => writeArchiveTo(download.body, target.fsPath, (bytes) => {
      progress.report({ message: percent(bytes, download.bytes) });
    }),
  );
  void vscode.window.showInformationMessage(
    `Saved ${download.name} — ${written} bytes — to ${path.basename(target.fsPath)}. `
    + 'It opens only with this deployment’s backup key.',
  );
}

/** How far along, when the server told us how much to expect. */
function percent(written: number, total: number): string {
  return total > 0 ? `${Math.floor((written / total) * 100)}%` : `${written} bytes`;
}
