import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CorpPolicyState } from '../corpPolicy';
import { refuseExit } from '../corpExits';
import { StorageManager } from '../storageManager';
import { TreeNode } from '../types';
import { VaultKeys } from '../vaultKeys';
import { buildExternalBundle } from '../externalBundle';
import { exportSensitiveNote, paymentFieldsInExport } from '../paymentRedaction';
import { resolveBulkTargets } from '../commandTargets';
import { encryptJson } from '../cryptoUtils';
import { SharePin } from '../sharePin';
import { announceHandover, chooseExportPassword, discardTransitPin } from '../transitPinPrompt';

/**
 * `credSshManager.exportExternal` — the one command that writes decrypted secrets to a file the
 * person chooses.
 *
 * <p>Out of `commands/treeMutationCommands.ts`, which reached its 800-line ceiling when the
 * corporate export ban was added here. The move is worth more than the lines it freed: this is the
 * one place a CVV and a PIN leave the product, and it now reads as its own decision — gate, collect,
 * choose a form, write — rather than as one of fifteen handlers in a file about tree edits. Splitting
 * it also brought it under the complexity and function-length ceilings it had been exempt from.</p>
 */
export interface ExportCommandHost {
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly vaultKeys: VaultKeys;
  /** This window's view of who each account is to its server; absent for a personal deployment. */
  readonly corpPolicyOf?: (accountId: string) => CorpPolicyState | undefined;
}

/** What a chosen export form produces: the bytes, and what to call the file. */
interface ExportFile {
  readonly content: string;
  readonly ext: string;
  /**
   * The password this file is sealed with. Absent on the plain-JSON form, which has none — which is
   * what keeps `save` honest about which of the two forms it just wrote.
   */
  readonly pin?: SharePin;
}

export function registerExportCommand(host: ExportCommandHost): void {
  host.register('credSshManager.exportExternal', (target, selected) => runExport(host, target, selected));
}

async function runExport(host: ExportCommandHost, target: unknown, selected: unknown): Promise<void> {
  host.vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
  const { targets, skippedNote } = resolveBulkTargets(host.storage, target, selected);
  if (targets.length === 0) {
    return;
  }
  // The corporate export ban, in the HANDLER rather than only in a `when` clause: a window-global
  // context key cannot be true for a personal account and false for a corporate one at the same
  // time, and this window may hold both. Refusing here with a sentence also beats a button that
  // quietly disappears, which reads as a broken feature rather than as a policy.
  if (refused(host, targets[0].accountId)) {
    return;
  }
  if (skippedNote !== '') {
    void vscode.window.showWarningMessage(skippedNote);
  }
  await writeExport(host, targets);
}

/** The ban, said out loud. True when this export must not happen. */
function refused(host: ExportCommandHost, accountId: string): boolean {
  const refusal = refuseExit(host.corpPolicyOf?.(accountId), 'export');
  if (refusal === '') {
    return false;
  }
  void vscode.window.showWarningMessage(refusal);
  return true;
}

/** Everything after the decision to export: what goes in the file, in what form, and where. */
async function writeExport(
  host: ExportCommandHost,
  targets: readonly { accountId: string; node: TreeNode }[],
): Promise<void> {
  const accountId = targets[0].accountId;
  const exportName = targets.length === 1 ? targets[0].node.name : `${targets.length}-items`;
  const picked = subtreeOf(host.storage, accountId, targets);
  const secrets = await host.storage.exportSecretsFor(
    accountId,
    picked.filter((n) => n.type === 'entity').map((n) => n.id),
  );
  // An export carries a card's CVV and PIN; a SHARE removes them. That asymmetry is deliberate — an
  // export is a full copy the person made once — and it is exactly the thing somebody who just
  // watched a share leave the CVV behind would assume applies here too. So it is said, when there is
  // something to say. Counted, never printed: a CVV must not reach a notification, which several UI
  // layers log. The sentence lives beside the rule it describes, not here.
  const cardNote = exportSensitiveNote(paymentFieldsInExport(Object.values(secrets)));
  const file = await chooseForm(
    buildExternalBundle(picked, secrets),
    Object.keys(secrets).length,
    exportName,
    cardNote,
  );
  if (file !== undefined) {
    await save(file, exportName, picked.length);
  }
}

/**
 * A folder exports its whole subtree; an entity exports itself. The resolver already dropped any
 * target contained by another, so the union cannot repeat a node.
 */
function subtreeOf(
  storage: StorageManager,
  accountId: string,
  targets: readonly { node: TreeNode }[],
): TreeNode[] {
  // Indexed once rather than filtered per folder: the filter form is O(nodes x folders), which on a
  // vault of ten thousand nodes is the difference between an instant prompt and a visible pause.
  const children = indexByParent(storage.getNodes(accountId));
  const picked: TreeNode[] = [];
  const collect = (n: TreeNode): void => {
    picked.push(n);
    for (const child of children.get(n.id) ?? []) {
      collect(child);
    }
  };
  for (const t of targets) {
    collect(t.node);
  }
  return picked;
}

/** Every node's children, in one pass — the index that keeps the walk above linear. */
function indexByParent(nodes: readonly TreeNode[]): Map<string, TreeNode[]> {
  const children = new Map<string, TreeNode[]>();
  for (const node of nodes) {
    const parent = node.parentId ?? '';
    const siblings = children.get(parent) ?? [];
    siblings.push(node);
    children.set(parent, siblings);
  }
  return children;
}

/** The file this export becomes: protected under a password, or plain JSON the person insisted on. */
async function chooseForm(
  bundle: unknown,
  entityCount: number,
  exportName: string,
  cardNote: string,
): Promise<ExportFile | undefined> {
  const mode = await vscode.window.showQuickPick(
    [
      {
        label: '$(lock) Password-protected file',
        detail: 'scrypt + AES-256-GCM under a password you tell the recipient out-of-band.',
        plain: false,
      },
      {
        label: '$(warning) Plain JSON — NOT protected',
        detail: 'Readable by anyone who touches the file. Secrets included. Your explicit choice.',
        plain: true,
      },
    ],
    { title: `Export "${exportName}" for someone outside the organisation.${cardNote}`, ignoreFocusOut: true },
  );
  if (mode === undefined) {
    return undefined;
  }
  return mode.plain ? plainForm(bundle, entityCount, cardNote) : sealedForm(bundle);
}

/** Plain JSON, behind a modal that says exactly what it will contain. */
async function plainForm(
  bundle: unknown,
  entityCount: number,
  cardNote: string,
): Promise<ExportFile | undefined> {
  const sure = await vscode.window.showWarningMessage(
    `The plain JSON file will contain ${entityCount} entities' secrets readable by ANYONE.${cardNote} Continue?`,
    { modal: true },
    'Write plain JSON',
  );
  return sure === 'Write plain JSON'
    ? { content: JSON.stringify(bundle, null, 2), ext: 'json' }
    : undefined;
}

/**
 * The whole password, not just its text: `SharePin` carries where the value came from, and the
 * message at the end of this command may offer completely different things depending on that.
 *
 * <p>`undefined` — Escape, or a repeat box mismatched or backed out of — ends the export with
 * nothing written, exactly as it always did. There is deliberately no retry loop: *both boxes or
 * nothing* is `confirmTyped`'s existing contract on the share path, and the point of moving this
 * one onto the shared box is that the two behave identically.</p>
 */
async function sealedForm(bundle: unknown): Promise<ExportFile | undefined> {
  const pin = await chooseExportPassword();
  return pin === undefined ? undefined : { content: encryptJson(bundle, pin.value), ext: 'enc', pin };
}

async function save(file: ExportFile, exportName: string, nodeCount: number): Promise<void> {
  const targetUri = await vscode.window.showSaveDialog({
    title: 'Export to file',
    // The name comes from a node the person named, so it may hold separators or dots. The dialog
    // shows where it will write, but a default that walks out of the home directory is a default
    // somebody accepts without reading.
    defaultUri: vscode.Uri.file(path.join(os.homedir(), `${safeFileName(exportName)}.${file.ext}`)),
    filters: file.ext === 'json' ? { JSON: ['json'] } : { 'Encrypted export': ['enc'] },
  });
  if (targetUri === undefined) {
    await abandon(file);
    return;
  }
  try {
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(file.content, 'utf8'));
  } catch (err) {
    await abandon(file);
    throw err;
  }
  await announceWritten(file, nodeCount, targetUri.fsPath);
}

/**
 * The export did not happen: no file exists, so its password is a secret for nothing.
 *
 * <p>This is the fourth route out of a drawn value, and the only one that is not in the box's own
 * file — the save dialog is raised long after the password is chosen, and a native file dialog is
 * somewhere a person can sit for minutes before backing out of it.</p>
 */
async function abandon(file: ExportFile): Promise<void> {
  if (file.pin !== undefined) {
    await discardTransitPin(file.pin);
  }
}

/**
 * The file landed, and now its password has to reach a person.
 *
 * <p>Through the same announcement the share path uses, and for a sharper version of the same
 * reason: the 45 s clipboard window starts at the copy, and between drawing the password and this
 * line there is a form to pick and a native save dialog to walk. `announceHandover` re-copies
 * immediately before it speaks, so the sentence about the clipboard is true when it is READ. A
 * typed password is offered nothing — it was never ours to re-copy.</p>
 */
async function announceWritten(file: ExportFile, nodeCount: number, where: string): Promise<void> {
  const headline = `Exported ${nodeCount} node(s) to ${where}.`;
  if (file.pin === undefined) {
    void vscode.window.showInformationMessage(headline);
    return;
  }
  await announceHandover(headline, '', file.pin);
}

/** A node's name as a file name: no separators, no traversal, never empty. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\/:*?"<>|]/g, '-').replace(/^\.+/, '').trim();
  return cleaned.length === 0 ? 'export' : cleaned;
}
