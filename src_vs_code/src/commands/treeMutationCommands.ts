/* eslint-disable complexity, max-lines-per-function -- command registrations moved verbatim out of extension.ts
   (roadmap A1 stage 2, 2026-08-28): one function that registers a family of closures, each the size it
   was. The ceilings are a boundary for NEW code here; a handler meets them when it is next touched. */
import { TreeNode } from '../types';
import { DoorsFor } from '../entityEditCommands';
import { StorageManager } from '../storageManager';
import { TransportFactory } from '../transportFactory';
import { VaultKeys } from '../vaultKeys';
import { asElement } from '../commandTargets';
import { TRASH_RETENTION_CHOICES } from '../trash';
import * as vscode from 'vscode';
import { nodeAt } from '../entityViewerCommands';
import { resolveLocation } from '../importCommands';
import { promptFolderName } from '../dialogs';
import { folderKindOf } from '../commandTargets';
import { pickFolderType } from '../dialogs';
import { buildDefaultFolders } from '../defaultFolders';
import { showEntityForm } from '../entityFormPanel';
import { collectKeyCandidates } from '../entityEditCommands';
import { buildDependencyCandidates } from '../depGraph';
import { buildDependencyColorMap } from '../depGraph';
import { collectJumpCandidates } from '../commandTargets';
import { carryThroughDetails } from '../attachmentMeta';
import { applyAdditions, applyRemovals } from '../applyFormSecrets';
import { EntryLandedError } from '../entityWrite';
import { withoutSecretClaims } from '../secretClaims';
import { warnIfTrackedCopy } from '../configCommands';
import { applyDependencyColors } from '../entityEditCommands';
import { applyEnvBindings } from '../envApply';
import { envCollection } from '../envCollectionRef';
import { editNode } from '../entityEditCommands';
import { resolveBulkTargets } from '../commandTargets';
import { pickTargetFolder } from '../dialogs';
import { resolveKind } from '../entityKind';
import { runBurnNow } from '../burnNowCommand';
import { accountFromTargetOrPick } from '../accountPick';
import { runServerMetrics } from '../serverMetricsCommand';
import { runRestoreFromTrash } from '../restoreCommandHost';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseImport } from '../importFormats';
import { importEntities } from '../importCommands';
import { buildExternalBundle } from '../externalBundle';
import { exportSensitiveNote, paymentFieldsInExport } from '../paymentRedaction';
import { applyExternalSecrets } from '../externalSecretsApply';
import { pinValidator } from '../pinInput';
import { encryptJson } from '../cryptoUtils';
import { decryptJson } from '../cryptoUtils';
import { describeError } from '../describeError';
import { isExternalBundle } from '../externalBundle';
import { remapExternalIds } from '../externalBundle';
import { enableConfigAccess } from '../configAccess';
import { updateConfigDetails } from '../entityEditCommands';
import { revokeConfigAccess } from '../configAccess';
import { showConfigChanges } from '../configCommands';
import { writeConfigFile } from '../configWrite';
import { configFileNameFor } from '../configFile';
import { runBounded } from '../sshExecRunner';
import { lockToOwner } from '../materializedKeys';
import { ServerTransport } from '../serverTransport';
import { withdrawalMessage } from '../commandTargets';
import { keyFingerprint } from '../shareSignature';
export interface TreeMutationCommandsHost {
  readonly announceArrival: (accountId: string, entityId: string) => Promise<void>;
  readonly doorsFor: DoorsFor;
  readonly mutated: () => void;
  readonly register: (command: string, handler: (...args: unknown[]) => unknown) => void;
  readonly storage: StorageManager;
  readonly transports: TransportFactory;
  readonly vaultKeys: VaultKeys;
}

export function registerTreeMutationCommands(host: TreeMutationCommandsHost): void {
  const { announceArrival, doorsFor, mutated, register, storage, transports, vaultKeys } = host;

  /**
   * How long the trash keeps what is in it.
   *
   * <p>Stored on the folder rather than in settings: each account has its own trash, so it has
   * its own answer, and the answer has to travel with the vault to the next machine.</p>
   */
  register('credSshManager.setTrashRetention', async (target?: unknown) => {
    const element = asElement(target);
    if (element?.kind !== 'node') {
      return;
    }
    const items = [
      { label: 'Keep until I empty it', days: undefined as number | undefined },
      ...TRASH_RETENTION_CHOICES.map((days) => ({
        label: days === 1 ? 'Empty after 1 day' : `Empty after ${days} days`,
        days: days as number | undefined,
      })),
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: 'Empty the Trash automatically',
      placeHolder: 'Entries older than this are deleted for real — secrets, history and all.',
    });
    if (picked === undefined) {
      return;
    }
    await storage.setTrashRetention(element.accountId, picked.days);
    mutated();
  });

  register('credSshManager.emptyTrash', async (target?: unknown) => {
    const element = asElement(target);
    if (element?.kind !== 'node') {
      return;
    }
    const inside = storage.getChildren(element.accountId, element.node.id);
    if (inside.length === 0) {
      void vscode.window.showInformationMessage('The Trash is already empty.');
      return;
    }
    const confirmed = await vscode.window.showWarningMessage(
      `Permanently delete ${inside.length === 1 ? '1 item' : `${inside.length} items`} from the Trash?`,
      {
        modal: true,
        detail:
          'This removes the secrets, the revision history, and propagates to every machine that syncs. It cannot be undone.',
      },
      'Delete Permanently',
    );
    if (confirmed !== 'Delete Permanently') {
      return;
    }
    // Sequential for the same reason every other bulk delete is: each mutator is an unlocked
    // read-modify-write of one array, so two in flight would drop one of the deletions.
    for (const node of inside) {
      await storage.deleteNodeRecursive(element.accountId, node.id);
    }
    mutated();
    void vscode.window.showInformationMessage(`Emptied the Trash — ${inside.length} deleted.`);
  });

  register('credSshManager.cloneNode', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node') {
      return;
    }
    const source = element.node;
    const accountId = element.accountId;

    const name = await vscode.window.showInputBox({
      title: `Clone "${source.name}"`,
      prompt: 'Name for the copy',
      value: `${source.name} (copy)`,
      validateInput: (v) => (v.trim().length === 0 ? 'Name must not be empty.' : undefined),
    });
    if (name === undefined) {
      return;
    }

    const clonedId = StorageManager.newId();
    await storage.addNode(accountId, {
      id: clonedId,
      name: name.trim(),
      type: source.type,
      parentId: source.parentId,
      folderType: source.folderType,
      // A clone is metadata only by design. Copying the SECRETS would double every
      // password on disk and in every backup, and the usual reason to clone is to make
      // a near-identical entry that needs its OWN credential anyway.
      //
      // Which is exactly why the CLAIMS must go too (`secretClaims.ts`). Copying `details` wholesale
      // gave the clone a one-time-code menu with no seed, an attachment row for no file, env
      // bindings that resolve to nothing — and, worst, the same `configKeyHash`, which makes the
      // clone a second holder of one application's key: `findConfigKeyHolder` takes the FIRST match,
      // so a sync reorder or a trashed original can point a live application at the copy, which has
      // no config body, and it is answered 401. Found by an audit, not by a report.
      details:
        source.details === undefined
          ? undefined
          : withoutSecretClaims({ ...source.details, id: clonedId, name: name.trim() }),
    });
    mutated();

    const hint =
      source.type === 'folder'
        ? 'The folder was copied; its contents were not.'
        : 'Settings were copied; passwords and keys were not — set them on the copy.';
    void vscode.window.showInformationMessage(`Cloned as "${name.trim()}". ${hint}`);
  });

  register('credSshManager.addFolder', async (target) => {
    const location = await resolveLocation(asElement(target), storage, 'Add folder to which profile?');
    if (location === undefined) {
      return;
    }
    const name = await promptFolderName();
    if (name === undefined) {
      return;
    }
    // A subfolder of a typed folder is of that type. Asking would offer answers the
    // parent already refuses.
    const inherited = folderKindOf(storage, location.accountId, location.parentId);
    const folderType = inherited ?? (await pickFolderType());
    if (folderType === undefined) {
      return;
    }
    const folderId = StorageManager.newId();
    await storage.addNode(location.accountId, {
      id: folderId,
      name,
      type: 'folder',
      parentId: location.parentId,
      folderType,
    });
    if (folderType === 'project') {
      // The feature itself: a project is the account's structure in miniature — the
      // same named, typed set the account starts with, seeded inside this folder.
      for (const sub of buildDefaultFolders(() => StorageManager.newId(), folderId)) {
        await storage.addNode(location.accountId, sub);
      }
    }
    mutated();
    await announceArrival(location.accountId, folderId);
  });

  register('credSshManager.changeFolderType', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node' || element.node.type !== 'folder') {
      return;
    }
    const folderType = await pickFolderType(element.node.folderType);
    if (folderType === undefined) {
      return;
    }
    await storage.updateNode(element.accountId, { ...element.node, folderType });
    mutated();
  });

  register('credSshManager.addEntity', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const location = await resolveLocation(asElement(target), storage, 'Add entity to which profile?');
    if (location === undefined) {
      return;
    }
    const id = StorageManager.newId();
    const result = await showEntityForm({
      mode: 'create',
      entityId: id,
      hasStoredPassword: false,
      hasStoredPrivateKey: false,
      hasStoredAttachment: false,
      hasStoredImage: false,
      hasStoredVpnConfig: false,
      hasStoredDbConnection: false,
      hasStoredTotp: false,
      hasStoredHostKey: false,
      lockedKind: folderKindOf(storage, location.accountId, location.parentId),
      keyCandidates: await collectKeyCandidates(storage, location.accountId, id),
      dependencyFolders: buildDependencyCandidates(storage.getNodes(location.accountId), id),
      dependencyColors: buildDependencyColorMap(storage.getNodes(location.accountId)),
      jumpCandidates: collectJumpCandidates(storage, location.accountId, id),
    });
    if (result === undefined) {
      return;
    }
    // ADDITIONS before the node, so a crash cannot leave a node claiming a value nobody wrote.
    // A create has no removals to speak of, but the pass runs anyway: the form can arrive with a
    // clearX set on a brand-new entry, and one caller doing this differently is how the two paths
    // drifted before. Compensated since the S1.4 review, which pointed out that the path a PERSON
    // uses was the one still leaving an uncollectable orphan when the node write failed.
    await createdOrExplained(() => storage.runCreate({
      writeSecrets: () => applyAdditions(storage, location.accountId, id, result),
      writeNode: () =>
        storage.addNode(location.accountId, {
          id,
          name: result.details.name,
          type: 'entity',
          parentId: location.parentId,
          // The seam that stamps attachment metadata — and, found while building it, the one that
          // keeps configKeyHash alive across an edit (see carryThroughDetails).
          details: carryThroughDetails(
            result,
            undefined,
            storage.getAccount(location.accountId)?.email,
            Date.now(),
          ),
        }),
      presence: () => storage.nodePresence(location.accountId, id),
      deferCleanup: () => storage.deferSecretCleanup(location.accountId, id),
      finishCleanup: () => storage.endSecretCleanup(location.accountId, id),
      // Safe as a blanket delete BECAUSE the id is new: nothing older sits under any of its keys.
      undoSecrets: () => storage.forgetEntitySecrets(location.accountId, id),
    }));
    await applyRemovals(storage, location.accountId, id, result);
    void warnIfTrackedCopy(result.details);
    await applyDependencyColors(storage, location.accountId, result.dependsOnColors);
    await applyEnvBindings(envCollection(), storage, location.accountId, result.details);
    mutated();
    await announceArrival(location.accountId, id);
  });

  register('credSshManager.editNode', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = asElement(target);
    if (element?.kind !== 'node') {
      return;
    }
    await editNode(element.accountId, element.node, storage, mutated, doorsFor);
  });

  register('credSshManager.deleteNode', async (target, selected) => {
    const { targets, skippedNote } = resolveBulkTargets(storage, target, selected);
    if (targets.length === 0) {
      return;
    }
    const what =
      targets.length === 1
        ? targets[0].node.type === 'folder'
          ? `folder "${targets[0].node.name}" and everything inside it`
          : `entity "${targets[0].node.name}" and its stored secrets`
        : `${targets.length} selected items, folders with everything inside them`;
    // "Move to Trash" is FIRST, which makes it the button Enter presses. The safe answer being
    // the reflex answer is the whole point of having a trash at all.
    const confirmed = await vscode.window.showWarningMessage(
      `Delete ${what}?${skippedNote === '' ? '' : ` ${skippedNote}`}`,
      {
        modal: true,
        detail:
          'Moving to Trash can be undone by dragging it back out. Deleting permanently cannot: it removes the secrets, the revision history, and propagates to every machine that syncs.',
      },
      'Move to Trash',
      'Delete Permanently',
    );
    if (confirmed === undefined) {
      return;
    }
    // Sequential, and not as a matter of style: every storage mutator is an unlocked
    // read-modify-write of one flat array per account, so two of these in flight would
    // race and the later write would silently drop the earlier deletion.
    const removed: string[] = [];
    for (const t of targets) {
      if (confirmed === 'Delete Permanently') {
        removed.push(...(await storage.deleteNodeRecursive(t.accountId, t.node.id)));
        continue;
      }
      await storage.moveToTrash(t.accountId, t.node.id);
      removed.push(t.node.name);
    }
    mutated();
    const verb = confirmed === 'Delete Permanently' ? 'Deleted' : 'Moved to Trash:';
    void vscode.window.showInformationMessage(
      removed.length === 1 ? `${verb} "${removed[0]}".` : `${verb} ${removed.length} items.`,
    );
  });

  register('credSshManager.moveNode', async (target) => {
    const element = asElement(target);
    if (element?.kind !== 'node') {
      return;
    }
    const picked = await pickTargetFolder(storage, element.accountId, element.node);
    if (picked === undefined) {
      return;
    }
    if (element.node.type === 'entity' && picked.parentId !== null) {
      const targetFolder = storage.getNode(element.accountId, picked.parentId);
      const required = targetFolder?.folderType;
      if (
        required !== undefined &&
        required !== 'any' &&
        required !== 'project' &&
        resolveKind(element.node.details) !== required
      ) {
        void vscode.window.showWarningMessage(
          `Folder "${targetFolder?.name}" holds only ${required} entities — "${element.node.name}" is ${resolveKind(element.node.details)}.`,
        );
        return;
      }
    }
    await storage.moveNode(element.accountId, element.node.id, picked.parentId);
    mutated();
  });

  register('credSshManager.burnNow', (target) => runBurnNow(asElement(target), storage, mutated));

  register('credSshManager.serverMetrics', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Server metrics for…');
    if (account !== undefined) {
      await runServerMetrics(account, (a) => transports.orgRecoveryFor(a));
    }
  });

  register('credSshManager.restoreFromTrash', (target, selected) =>
    runRestoreFromTrash(resolveBulkTargets(storage, target, selected).targets, storage, async (a, id) => { mutated(); await announceArrival(a, id); }),
  );

  /**
   * The health report: weak and reused passwords, unencrypted keys in `~/.ssh`, plaintext
   * credentials in the workspace's `.env` files.
   *
   * <p>Local by construction. The one check that could leave the machine — the breach corpus —
   * is off by default and asks before it runs, saying exactly what travels.</p>
   */
  /**
   * Import from another tool: `~/.ssh/config`, or a CSV/JSON export from Bitwarden, 1Password,
   * KeePass, LastPass or Termius.
   *
   * <p>Nothing lands until the reader has seen the count and what was skipped — an import that
   * silently drops a quarter of a file is worse than one that refuses it. Every node gets a
   * fresh id: an id from somebody else's export would collide in the next sync merge.</p>
   */
  register('credSshManager.importFrom', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const location = await resolveLocation(asElement(target), storage, 'Import into which profile?');
    if (location === undefined) {
      return;
    }
    const uris = await vscode.window.showOpenDialog({
      title: 'Import from another tool',
      canSelectMany: false,
      filters: { 'Exports and ssh config': ['csv', 'json', 'txt', 'config'], 'Any file': ['*'] },
      defaultUri: vscode.Uri.file(path.join(os.homedir(), '.ssh')),
    });
    const uri = uris?.[0];
    if (uri === undefined) {
      return;
    }
    const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
    const parsed = parseImport(text, uri.fsPath);
    if (parsed.entities.length === 0) {
      void vscode.window.showWarningMessage(
        `Nothing to import from ${path.basename(uri.fsPath)} (read as ${parsed.source}). ` +
          (parsed.skipped[0] ?? 'The file held no entries this reader understands.'),
      );
      return;
    }
    const skippedNote =
      parsed.skipped.length === 0
        ? ''
        : `\n\n${parsed.skipped.length} entr(ies) will be SKIPPED:\n· ${parsed.skipped.slice(0, 8).join('\n· ')}`;
    const confirmed = await vscode.window.showWarningMessage(
      `Import ${parsed.entities.length} entr(ies) from ${path.basename(uri.fsPath)}, read as ${parsed.source}?` +
        skippedNote,
      { modal: true },
      'Import',
    );
    if (confirmed !== 'Import') {
      return;
    }
    const created = await importEntities(storage, location, parsed.entities);
    mutated();
    void vscode.window.showInformationMessage(
      `Imported ${created} entr(ies) into ${storage.getAccount(location.accountId)?.email ?? 'the profile'}.` +
        (parsed.skipped.length > 0 ? ` ${parsed.skipped.length} skipped.` : ''),
    );
  });

  register('credSshManager.exportExternal', async (target, selected) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const { targets, skippedNote } = resolveBulkTargets(storage, target, selected);
    if (targets.length === 0) {
      return;
    }
    if (skippedNote !== '') {
      void vscode.window.showWarningMessage(skippedNote);
    }
    const accountId = targets[0].accountId;
    const exportName =
      targets.length === 1 ? targets[0].node.name : `${targets.length}-items`;

    // A folder exports its whole subtree; an entity exports itself. The resolver already
    // dropped any target contained by another, so the union cannot repeat a node.
    const all = storage.getNodes(accountId);
    const picked: TreeNode[] = [];
    const collect = (n: TreeNode): void => {
      picked.push(n);
      if (n.type === 'folder') {
        for (const c of all.filter((x) => x.parentId === n.id)) {
          collect(c);
        }
      }
    };
    for (const t of targets) {
      collect(t.node);
    }

    const secrets = await storage.exportSecretsFor(
      accountId,
      picked.filter((n) => n.type === 'entity').map((n) => n.id),
    );
    const bundle = buildExternalBundle(picked, secrets);

    // An export carries a card's CVV and PIN; a SHARE removes them. That asymmetry is deliberate —
    // an export is a full copy the person made once — and it is exactly the thing somebody who just
    // watched a share leave the CVV behind would assume applies here too. So it is said, when there
    // is something to say. Counted, never printed: a CVV must not reach a notification, which
    // several UI layers log.
    // The sentence lives beside the rule it describes, not here: both reviewers pointed out that
    // "the CVV and PIN of N records" implies both values exist in each, and they asked for different
    // metrics — one for records, one for occurrences — which is what made the ambiguity visible.
    const cardNote = exportSensitiveNote(paymentFieldsInExport(Object.values(secrets)));

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
      return;
    }

    let content: string;
    let ext: string;
    if (mode.plain) {
      const sure = await vscode.window.showWarningMessage(
        `The plain JSON file will contain ${Object.keys(secrets).length} entities' secrets readable by ANYONE.${cardNote} Continue?`,
        { modal: true },
        'Write plain JSON',
      );
      if (sure !== 'Write plain JSON') {
        return;
      }
      content = JSON.stringify(bundle, null, 2);
      ext = 'json';
    } else {
      const password = await vscode.window.showInputBox({
        title: 'Password for the export',
        prompt: 'Tell it to the recipient out-of-band — it is the only key to this file.',
        password: true,
        ignoreFocusOut: true,
        validateInput: pinValidator('choosing'),
      });
      if (password === undefined) {
        return;
      }
      content = encryptJson(bundle, password);
      ext = 'enc';
    }
    const targetUri = await vscode.window.showSaveDialog({
      title: 'Export to file',
      defaultUri: vscode.Uri.file(path.join(os.homedir(), `${exportName}.${ext}`)),
      filters: mode.plain ? { JSON: ['json'] } : { 'Encrypted export': ['enc'] },
    });
    if (targetUri === undefined) {
      return;
    }
    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
    void vscode.window.showInformationMessage(
      `Exported ${picked.length} node(s) to ${targetUri.fsPath}.`,
    );
  });

  register('credSshManager.importExternal', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const location = await resolveLocation(asElement(target), storage, 'Import into which profile?');
    if (location === undefined) {
      return;
    }
    const uris = await vscode.window.showOpenDialog({
      title: 'Import from external file',
      canSelectMany: false,
      filters: { 'CredsForDevs export': ['enc', 'json'] },
    });
    const uri = uris?.[0];
    if (uri === undefined) {
      return;
    }
    const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');

    let payload: unknown;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.format === 'creds-for-devs-external') {
        payload = parsed;
      } else {
        // A sealed envelope: ask for the password it was exported with.
        const password = await vscode.window.showInputBox({
          title: 'Password for this export',
          prompt: 'The password the sender protected the file with.',
          password: true,
          ignoreFocusOut: true,
        });
        if (password === undefined) {
          return;
        }
        payload = decryptJson(raw, password);
      }
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Import failed: ${describeError(error)}`,
      );
      return;
    }
    if (!isExternalBundle(payload)) {
      void vscode.window.showErrorMessage('Import failed: this is not a CredsForDevs export file.');
      return;
    }

    // NEW ids for everything — the sender's ids belong to the sender's tree.
    const remapped = remapExternalIds(payload, () => StorageManager.newId(), location.parentId);
    // ADDITIONS first, then the nodes — Rule A (`applyFormSecrets.ts`). This had the widest window
    // of the paths the audit found: the ENTIRE tree was committed and visible before one secret
    // landed, so an interruption left every imported entry claiming values nobody had written.
    await applyExternalSecrets(storage, location.accountId, remapped.secrets);
    for (const n of remapped.nodes) {
      await storage.addNode(location.accountId, n);
    }
    // The secrets landed above, before the nodes. What used to be here was a hand-written loop that
    // had silently stopped agreeing with `ExternalSecrets` TWICE — `config` had never been restored
    // since the kind shipped, and `payment` was added to the export and not here — so an
    // export-then-import round trip created the entry and discarded the card. It lives in
    // `externalSecretsApply.ts` now, where a test drives the field list.
    mutated();
    // The first imported ROOT is where the reveal lands: the import's whole shape arrived
    // under it, and highlighting all N rows would highlight nothing.
    const firstRoot = remapped.nodes.find((n) => n.parentId === location.parentId);
    if (firstRoot !== undefined) {
      await announceArrival(location.accountId, firstRoot.id);
    }
    void vscode.window.showInformationMessage(
      `Imported ${remapped.nodes.length} node(s) from ${path.basename(uri.fsPath)}.`,
    );
  });

  register('credSshManager.enableConfigAccess', async (target) => {
    vaultKeys.noteUserActivity();
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node' || element.node.details === undefined) {
      return;
    }
    await enableConfigAccess({
      entityName: element.node.name,
      store: (configKeyHash) => updateConfigDetails(storage, element, { configKeyHash }),
    });
    mutated();
  });

  register('credSshManager.revokeConfigAccess', async (target) => {
    vaultKeys.noteUserActivity();
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node' || element.node.details === undefined) {
      return;
    }
    if (await revokeConfigAccess({ entityName: element.node.name, store: () => Promise.resolve() })) {
      await updateConfigDetails(storage, element, { configKeyHash: undefined });
      mutated();
    }
  });

  register('credSshManager.showConfigChanges', async (target) => {
    vaultKeys.noteUserActivity();
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node' || element.node.details === undefined) {
      return;
    }
    await showConfigChanges(storage, element.accountId, element.node);
  });

  register('credSshManager.writeConfigFile', async (target) => {
    vaultKeys.noteUserActivity(); // the user is here: postpone auto-lock
    const element = await nodeAt(asElement(target), storage);
    if (element?.kind !== 'node' || element.node.details === undefined) {
      return;
    }
    const body = await storage.getConfigBody(element.accountId, element.node.id);
    if (body === undefined || body.length === 0) {
      void vscode.window.showWarningMessage(`"${element.node.name}" has nothing in it yet.`);
      return;
    }
    const details = element.node.details;
    await writeConfigFile({
      suggestedName: configFileNameFor(details.configFileName, details.configFormat ?? 'json', element.node.name),
      body,
      git: (args, cwd) =>
        runBounded('git', [...args], false, { cwd, env: process.env, timeoutMs: 10_000 }).then(
          (outcome) => outcome.exitCode,
        ),
      lock: lockToOwner,
    });
  });

  /**
   * Take back a share that is still waiting for someone.
   *
   * <p>Until the server kept a sender-side receipt this was impossible rather than merely
   * missing: an inbox is keyed by the RECIPIENT, so the sender had no way to learn the id of the
   * thing waiting there. It matters most for a secret that burns on first use — that has no
   * deadline, so the sender's copy can be gone while the pending share stays live.</p>
   *
   * <p>Server transport only, and that is not an omission: a folder or a git remote has nothing
   * in flight — a share written there is delivered the moment it syncs.</p>
   */
  register('credSshManager.withdrawShare', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Withdraw from which account?');
    if (account === undefined) {
      return;
    }
    const transport = transports.forAccount(account);
    if (transport === undefined || transport.kind !== 'server') {
      void vscode.window.showInformationMessage(
        'Withdrawing only applies to a vault server — a folder or git remote delivers a share the '
          + 'moment it syncs, so there is nothing pending to take back.',
      );
      return;
    }
    let sent;
    try {
      sent = await (transport as ServerTransport).listSent(account);
    } catch (error) {
      // The one that matters is a server too old to have the route: it answers 404, which would
      // otherwise read as an empty outbox.
      void vscode.window.showErrorMessage(`CredsForDevs: ${describeError(error)}`);
      return;
    }
    if (sent.length === 0) {
      void vscode.window.showInformationMessage('Nothing you sent is still waiting to be accepted.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      sent.map((item) => ({
        label: item.entityName,
        description: `to ${item.toEmail}`,
        detail: new Date(item.createdAt).toLocaleString(),
        id: item.id,
      })),
      { placeHolder: 'Which share should be taken back?' },
    );
    if (picked === undefined) {
      return;
    }
    const outcome = await (transport as ServerTransport).withdrawSent(account, picked.id);
    void vscode.window.showInformationMessage(withdrawalMessage(outcome, picked.label));
  });

  /**
   * Show this account's own fingerprint, so the comparison can be two-sided.
   *
   * <p>The recipient is shown the sender's fingerprint on first contact — but a
   * comparison needs both halves, and until now the sender had no way to read
   * theirs. Without this the fingerprint step is theatre: the only person who can
   * confirm the key is the one who cannot see it.</p>
   */
  register('credSshManager.showShareFingerprint', async (target) => {
    const account = await accountFromTargetOrPick(target, storage, 'Whose signing fingerprint?');
    if (account === undefined) {
      return;
    }
    const keypair = await storage.ensureSigningKeypair(account.accountId);
    const print = keyFingerprint(keypair.publicKey);
    const choice = await vscode.window.showInformationMessage(
      `Signing fingerprint for ${account.email}:

${print}

Read this to whoever is accepting your first share. It only matters on a shared folder — over the vault server the sender is stamped from your sign-in and cannot be forged.`,
      { modal: true },
      'Copy',
    );
    if (choice === 'Copy') {
      await vscode.env.clipboard.writeText(print);
    }
  });
}

/**
 * Run a create and, when it fails having LEFT THE ENTRY BEHIND, say exactly that.
 *
 * <p>Raised by the review as the gap between changing the thrown error and changing what the person
 * reads: without this, an `EntryLandedError` reaches VS Code's generic command-failure notification,
 * which reads as "it did not work" — and the person retries the same form and makes a duplicate. Every
 * other failure is rethrown untouched, so nothing else is swallowed.</p>
 */
async function createdOrExplained(create: () => Promise<void>): Promise<void> {
  try {
    await create();
  } catch (error) {
    if (!(error instanceof EntryLandedError)) {
      throw error;
    }
    void vscode.window.showWarningMessage(error.message);
  }
}
