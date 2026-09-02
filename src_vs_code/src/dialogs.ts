import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import {
  ENTITY_KINDS,
  ENTITY_KIND_LABELS,
  FolderType,
  StoredAccount,
  TreeNode,
} from './types';

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
import { formatEntityBlock } from './entityText';

export { formatEntityBlock };

/** QuickPick of a folder's content type (Credential first = default). */
// eslint-disable-next-line complexity
export async function pickFolderType(
  current?: FolderType,
): Promise<FolderType | undefined> {
  // Derived from ENTITY_KINDS rather than restated: this list used to be a hand-written
  // copy, and adding a kind left it offering the old five — so a folder of the new kind
  // could not be created at all.
  const items: Array<vscode.QuickPickItem & { value: FolderType }> = [
    ...ENTITY_KINDS.map((kind) => ({
      label: `$(${ENTITY_KIND_LABELS[kind].icon}) ${ENTITY_KIND_LABELS[kind].label}`,
      value: kind as FolderType,
    })),
    {
      label: '$(project) Project',
      description: 'creates the full folder set inside (db, vpn, ssh keys, ssh, passwords, terminal)',
      value: 'project' as FolderType,
    },
    { label: '$(folder) Any type', description: 'no restriction', value: 'any' as FolderType },
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

// `showEntityDetails` — the QuickPick "details view" — used to live here. It knew only the SSH
// fields, so a VPN, database, script or command entity opened as `Host —` / `Password — (not
// set)` and read as broken, while the double-click viewer showed everything correctly. View
// Details now opens that viewer; one surface, no second copy of what an entity looks like.

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
      'No account profiles yet — run "CredsForDevs: Add Account" first.',
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

/**
 * A modal that must be agreed to before something is destroyed.
 *
 * <p>The `reuse-first` step-2 move, written for S2.4's form switch and named as a helper because the
 * shape already existed by hand in several places (`burnNowCommand.ts:17`, `configWrite.ts:75`,
 * `backupManager.ts:317`, `authManager.ts:75`, and more). Those call sites are <b>deliberately not
 * rewritten here</b> — that is a separate change nobody asked for, and it would put a dozen unrelated
 * files into a payment story's diff. They are named in the report with a recommendation to migrate,
 * which is what `reuse-first` asks for: describe it, propose it, ask.</p>
 *
 * <p>`showWarningMessage` returns the button's own label when it is pressed and `undefined` for Esc or
 * the dialog's Cancel — so the comparison, not a truthiness check, is what makes a dismissed dialog a
 * refusal rather than an accident.</p>
 */
export async function confirmDestructive(text: string, actionLabel: string): Promise<boolean> {
  const answer = await vscode.window.showWarningMessage(text, { modal: true }, actionLabel);
  return answer === actionLabel;
}

/**
 * A refusal: something cannot be done, and there is nothing to decide.
 *
 * <p>Here rather than at the call site so that a module deciding WHETHER to refuse does not have to
 * import `vscode` to SAY so — repository rule 3, which a code review caught being bent by the phrase
 * gate. It is the same seam `confirmDestructive` is: the decision stays testable, the dialog does
 * not have to be.</p>
 */
export function refuse(text: string): void {
  void vscode.window.showWarningMessage(text);
}
