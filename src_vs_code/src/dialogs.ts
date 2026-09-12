import * as vscode from 'vscode';
import { StorageManager } from './storageManager';
import {
  ENTITY_KINDS,
  ENTITY_KIND_LABELS,
  EntityKind,
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

/**
 * One row per entity kind — THE kind list, derived from `ENTITY_KINDS` and shared by both pickers.
 *
 * <p>This used to be a hand-written copy inside `pickFolderType`, and adding a kind left it offering
 * the old five — so a folder of the new kind could not be created at all. A second picker is exactly
 * the moment a second copy would be written, which is why the rows are built here and nowhere else.</p>
 */
function kindItems(): Array<vscode.QuickPickItem & { value: EntityKind }> {
  return ENTITY_KINDS.map((kind) => ({
    label: `$(${ENTITY_KIND_LABELS[kind].icon}) ${ENTITY_KIND_LABELS[kind].label}`,
    value: kind,
  }));
}

/** The same rows with `(current)` on the one that is — new items, nothing mutated. */
function markCurrent<T extends vscode.QuickPickItem & { value: string }>(
  items: readonly T[],
  current: string | undefined,
): T[] {
  return items.map((item) =>
    item.value === current
      ? { ...item, description: [item.description, '(current)'].filter(Boolean).join(' ') }
      : item,
  );
}

/**
 * QuickPick of ONE entity kind — asked wherever no folder dictates it (issue #57).
 *
 * <p>"Create Entity for…" from a Team row has no folder, so the form opened on
 * `resolveKind(undefined)` — `credential` — and the heading <i>New entity [credential]</i> read as a
 * restriction that was never there. The kind is now asked, and asked FIRST — before the account and
 * the recipients — so a dismissed pick costs nothing, the same shape `pinForNewEntry` has on Add.</p>
 *
 * <p>`current` marks the kind an existing entity has. A NEW entity passes none and nothing is
 * marked: marking Credential would make the old silent default look like a choice somebody made.</p>
 */
export async function pickEntityKind(current?: EntityKind): Promise<EntityKind | undefined> {
  const picked = await vscode.window.showQuickPick(markCurrent(kindItems(), current), {
    title: 'Entity type',
    placeHolder: 'What kind of entity this is',
  });
  return picked?.value;
}

/** QuickPick of a folder's content type (Credential first = default). */
export async function pickFolderType(
  current?: FolderType,
): Promise<FolderType | undefined> {
  const items: Array<vscode.QuickPickItem & { value: FolderType }> = [
    ...kindItems().map((item) => ({ ...item, value: item.value as FolderType })),
    {
      label: '$(project) Project',
      description: 'creates the full folder set inside (db, vpn, ssh keys, ssh, passwords, terminal)',
      value: 'project' as FolderType,
    },
    { label: '$(folder) Any type', description: 'no restriction', value: 'any' as FolderType },
  ];
  const picked = await vscode.window.showQuickPick(markCurrent(items, current ?? 'credential'), {
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
