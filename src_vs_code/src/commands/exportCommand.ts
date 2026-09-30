import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CorpPolicyState } from '../corpPolicy';
import { refuseExit } from '../corpExits';
import { StorageManager } from '../storageManager';
import { TreeNode } from '../types';
import { admitLeaving, isNotForExport } from '../exportScope';
import { VaultKeys } from '../vaultKeys';
import { ExternalSecrets, buildExternalBundle } from '../externalBundle';
import { exportOpener, exportedNode } from '../exportSecrets';
import { firstLockedStored } from '../pinAdmission';
import { admitEntry } from '../pinPrompt';
import { exportSensitiveNote, paymentFieldsInExport } from '../paymentRedaction';
import { resolveBulkTargets } from '../commandTargets';
import { encryptJson } from '../cryptoUtils';
import { writeFileAtomically } from '../atomicFileWrite';
import { describeError } from '../describeError';
import { DiagnosticWriter } from '../diagnosticWriter';
import { noteExportWritten, sealedBlobOf } from '../shareDiagnostics';
import { describeTransitSecret } from '../transitSecretReport';
import { SharePin } from '../sharePin';
import {
  EXPORT_PASSWORD,
  announceHandover,
  chooseExportPassword,
  discardTransitPin,
} from '../transitPinPrompt';

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
  /** Where an export records the password's SHAPE, so a recipient who cannot open it can be helped. */
  readonly log: DiagnosticWriter;
  /** This window's view of who each account is to its server; absent for a personal deployment. */
  readonly corpPolicyOf?: (accountId: string) => CorpPolicyState | undefined;
}

/**
 * What a chosen export form produces: the bytes, and what to call the file.
 *
 * <p>A union rather than one shape with an optional password, so that "sealed" and "has a password"
 * cannot come apart. With an optional field a future form could return `{ ext: 'enc', content }`
 * and compile: the file would be encrypted and `announceWritten` would take the plain branch, so
 * the person would never be offered the password their recipient needs. Discriminating on `ext`
 * makes that unwriteable, and costs no extra field — the two literal types already differ.</p>
 */
type ExportFile =
  | { readonly content: string; readonly ext: 'json' }
  | {
      readonly content: string;
      readonly ext: 'enc';
      readonly pin: SharePin;
      /** From the derivation `encryptJson` already performed — see `keyFingerprint.ts`. */
      readonly keyFingerprint: string;
    };

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
  await exportWhatMayLeave(host, targets);
}

/**
 * What goes into the file: the selection's subtrees without the entries marked *Not for export*
 * (issue #122) — decided and SAID before the first prompt, so nobody picks a form and types a
 * password for a file that will be partial, or, when every entry is marked, for no file at all.
 */
async function exportWhatMayLeave(
  host: ExportCommandHost,
  targets: readonly { accountId: string; node: TreeNode }[],
): Promise<void> {
  const scope = admitLeaving('export', host.storage.getNodes(targets[0].accountId), targets.map((t) => t.node), warn);
  if (scope !== undefined) {
    // The withheld roots do not name the file either: [marked, loose] exports ONE entry, not "2-items".
    await writeExport(host, targets.filter((t) => !isNotForExport(t.node)), scope.kept);
  }
}

function warn(message: string): void {
  void vscode.window.showWarningMessage(message);
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
  picked: readonly TreeNode[],
): Promise<void> {
  const accountId = targets[0].accountId;
  const exportName = targets.length === 1 ? targets[0].node.name : `${targets.length}-items`;
  const collected = await collectForExport(host.storage, accountId, picked);
  if (collected === undefined) {
    return;
  }
  // The copy claims no PIN: its values are opened, and the PIN is this person's (entry-PIN plan, D8).
  const bundle = buildExternalBundle(picked.map(exportedNode), collected.secrets);
  const file = await chooseForm(bundle, Object.keys(collected.secrets).length, exportName, collected.notes);
  if (file !== undefined) {
    await save(host.log, file, exportName, picked.length);
  }
}

/** What the form says about the file before it is written — the card's values and the PIN-protected entries. */
interface ExportNotes {
  readonly card: string;
  readonly protectedCount: number;
}

/**
 * What goes into the file, OPENED — after the door of every protected entry (entry-PIN plan, D8) —
 * and what the form says about it. Nothing, having said why, when a door stopped it or a value did
 * not open.
 */
async function collectForExport(
  storage: StorageManager,
  accountId: string,
  picked: readonly TreeNode[],
): Promise<{ secrets: Record<string, ExternalSecrets>; notes: ExportNotes } | undefined> {
  const entities = picked.filter((n) => n.type === 'entity');
  const protectedCount = await admitForExport(storage, accountId, entities);
  const secrets = protectedCount === undefined ? undefined : await openedSecrets(storage, accountId, entities);
  if (protectedCount === undefined || secrets === undefined) {
    return undefined;
  }
  // An export carries what a SHARE removes: a card's CVV and PIN, and since #52 every second value
  // too — which belongs to credentials as well as to cards. That asymmetry is deliberate — an export
  // is a full copy the person made once — and it is exactly the thing somebody who just watched a
  // share leave the CVV behind would assume applies here too. So it is said, when there is something
  // to say. Counted, never printed: a CVV must not reach a notification, which several UI layers log.
  // The sentence lives beside the rule it describes, not here. Counted over the OPENED records, so a
  // protected card's CVV is counted — as an envelope it counted as nothing.
  return { secrets, notes: { card: exportSensitiveNote(paymentFieldsInExport(Object.values(secrets))), protectedCount } };
}

/**
 * Every picked entry with a sealed value, asked for its PIN once each (the purpose: "export it") —
 * the precedent the share already set. A decline, a wrong PIN or a damaged value on ANY of them ends
 * the whole export with nothing written, naming the entry. Answers how many were protected.
 */
async function admitForExport(storage: StorageManager, accountId: string, entities: readonly TreeNode[]): Promise<number | undefined> {
  const guarded = await lockedAmong(storage, accountId, entities);
  for (const node of guarded) {
    if ((await admitEntry(storage, accountId, node.id, node.name, 'export it')) === undefined) {
      warn(`"${node.name}" is protected with its own PIN, so nothing was exported. Its values have to be unwrapped here before they can leave.`);
      return undefined;
    }
  }
  return guarded.length;
}

/** The entries holding a sealed value — the wrap decides, as the door does, never the mark alone. */
async function lockedAmong(storage: StorageManager, accountId: string, entities: readonly TreeNode[]): Promise<TreeNode[]> {
  const guarded: TreeNode[] = [];
  for (const node of entities) {
    if ((await firstLockedStored(storage, accountId, node.id)) !== undefined) {
      guarded.push(node);
    }
  }
  return guarded;
}

/** The secrets, opened with the grants the doors left — or nothing, having said "Export failed". */
async function openedSecrets(
  storage: StorageManager,
  accountId: string,
  entities: readonly TreeNode[],
): Promise<Record<string, ExternalSecrets> | undefined> {
  const names = new Map(entities.map((n) => [n.id, n.name]));
  try {
    return await storage.exportSecretsFor(accountId, entities.map((n) => n.id), exportOpener(accountId, (id) => names.get(id) ?? id));
  } catch (err) {
    void vscode.window.showErrorMessage(`Export failed: ${describeError(err)}. Nothing was written.`);
    return undefined;
  }
}

/**
 * What the form adds when protected entries go in: their values leave unwrapped, and `protection`
 * says what guards them instead. `''` when none does.
 */
function pinNote(count: number, protection: string): string {
  const subject =
    count === 1
      ? ' 1 of these entries is protected with its own PIN; its values go'
      : ` ${count} of these entries are protected with their own PIN; their values go`;
  return count === 0 ? '' : `${subject} into the file unwrapped, ${protection}.`;
}

/** The file this export becomes: protected under a password, or plain JSON the person insisted on. */
async function chooseForm(
  bundle: unknown,
  entityCount: number,
  exportName: string,
  notes: ExportNotes,
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
    {
      title: `Export "${exportName}" for someone outside the organisation.${notes.card}${pinNote(notes.protectedCount, "protected only by the file's password")}`,
      ignoreFocusOut: true,
    },
  );
  if (mode === undefined) {
    return undefined;
  }
  return mode.plain ? plainForm(bundle, entityCount, notes) : sealedForm(bundle);
}

/** Plain JSON, behind a modal that says exactly what it will contain. */
async function plainForm(
  bundle: unknown,
  entityCount: number,
  notes: ExportNotes,
): Promise<ExportFile | undefined> {
  // A plain file has no password, so the PIN note says what does guard those values: nothing.
  const pins = pinNote(notes.protectedCount, 'readable by anyone who has the file');
  const sure = await vscode.window.showWarningMessage(
    `The plain JSON file will contain ${entityCount} entities' secrets readable by ANYONE.${notes.card}${pins} Continue?`,
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
  if (pin === undefined) {
    return undefined;
  }
  let keyFingerprint = '';
  const content = encryptJson(bundle, pin.value, undefined, undefined, (fingerprint) => {
    keyFingerprint = fingerprint;
  });
  return { content, ext: 'enc', pin, keyFingerprint };
}

async function save(
  log: DiagnosticWriter,
  file: ExportFile,
  exportName: string,
  nodeCount: number,
): Promise<void> {
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
    await writeExportAtomically(targetUri, file.content);
  } catch (err) {
    await abandon(file);
    // Said here rather than thrown. A rejection out of a command handler reaches the person as VS
    // Code's generic "running the contributed command failed", if they see anything at all — and
    // they picked a destination, waited, and are owed a sentence saying no file exists. The reason
    // is included; the password never is.
    void vscode.window.showErrorMessage(`Export failed: ${describeError(err)}. Nothing was written.`);
    return;
  }
  noteWritten(log, file, targetUri.fsPath);
  await announceWritten(file, nodeCount, targetUri.fsPath);
}

/**
 * What was written, and what its password looked like — never what it was.
 *
 * <p>The sender's half of a pair, exactly as `share SENT` is: when a recipient reports that the
 * file will not open, this line and their `external import FAILED` line answer between them
 * whether the bytes changed, whether the password did, or whether neither did. A plain JSON export
 * has no password and no key, so there is nothing to pair and nothing is written.</p>
 */
function noteWritten(log: DiagnosticWriter, file: ExportFile, target: string): void {
  if (file.ext !== 'enc') {
    return;
  }
  noteExportWritten(log, {
    file: path.basename(target),
    secretShape: describeTransitSecret(file.pin.value),
    keyFingerprint: file.keyFingerprint,
    blob: sealedBlobOf(file.content),
  });
}

/**
 * Write the export through a temp sibling and a rename, never straight onto the chosen name.
 *
 * <p>`fs.writeFile` truncates and then writes, so a failure partway through — a full disk, a
 * network share dropping — leaves a TRUNCATED file under the name the person picked. An encrypted
 * export is AES-GCM over the whole payload, so no password opens that file: it is an artefact that
 * looks like an export, is named like an export, and is not one. Meanwhile the failure path
 * discards the password on the reasoning that no file exists.</p>
 *
 * <p>Raised by the review gate against this story's plan, and the answer was already in the
 * repository: `writeFileAtomically` exists because two writers of the vault file needed exactly
 * this and, as its own comment records, one of them did not have it. This is the third.</p>
 */
function writeExportAtomically(target: vscode.Uri, content: string): Promise<void> {
  return writeFileAtomically(
    {
      writeFile: (uri, data) => vscode.workspace.fs.writeFile(uri, data),
      rename: (from, to, options) => vscode.workspace.fs.rename(from, to, options),
      remove: (uri) => vscode.workspace.fs.delete(uri),
    },
    tempSiblingOf(target),
    target,
    content,
  );
}

/**
 * Where the ciphertext goes before the rename puts it in place.
 *
 * <p>Two things the review round caught, and both are about a path that looked obvious.
 * `vscode.Uri.file()` FORCES the scheme back to `file:`, so an export to a remote or virtual
 * workspace would write its temp onto local disk and then rename across two filesystems — atomic
 * writing broken exactly where the workspace is not local. `with()` keeps the scheme and the
 * authority.</p>
 *
 * <p>And a fixed `.tmp` is the same path for every export of the same name: two started together
 * trade ciphertext, and the file that lands can be paired with the password the OTHER export
 * announced. A pre-existing `.tmp` beside somebody's file would also be overwritten and then
 * deleted on the failure path. The id is `StorageManager.newId()` — the one this codebase already
 * mints ids with.</p>
 */
function tempSiblingOf(target: vscode.Uri): vscode.Uri {
  return target.with({ path: `${target.path}.${StorageManager.newId()}.tmp` });
}

/**
 * The export did not happen: no file exists, so its password is a secret for nothing.
 *
 * <p>This is the fourth route out of a drawn value, and the only one that is not in the box's own
 * file — the save dialog is raised long after the password is chosen, and a native file dialog is
 * somewhere a person can sit for minutes before backing out of it.</p>
 */
async function abandon(file: ExportFile): Promise<void> {
  if (file.ext === 'enc') {
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
  if (file.ext === 'json') {
    void vscode.window.showInformationMessage(headline);
    return;
  }
  await announceHandover(EXPORT_PASSWORD, headline, '', file.pin);
}

/** A node's name as a file name: no separators, no traversal, never empty. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\/:*?"<>|]/g, '-').replace(/^\.+/, '').trim();
  return cleaned.length === 0 ? 'export' : cleaned;
}
