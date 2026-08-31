import * as vscode from 'vscode';
import { EntityKind, FolderType, TreeNode } from './types';
import { assertNever, isEntityKind, resolveKind } from './entityKind';
import { accessLevel, mcpIconFile } from './mcpIcons';
import { resolveMcpInTree } from './mcpAccess';

/**
 * What a tree row LOOKS like: its icon, and the tooltip behind it.
 *
 * <p>Moved out of `treeDataProvider.ts` whole, and for a reason worth writing down: that file had
 * six lines of headroom against the 800-line limit `eslint.config.mjs` enforces, so the next
 * feature to touch the tree could not have added a line to it. These three functions are the
 * obvious tenants — they take data and return a `vscode` object, they read nothing off the
 * provider, and nothing else in the file wants to be near them.</p>
 *
 * <p>`HISTORY_COLOR` and `TEAM_COLOR` deliberately did NOT come along: they are used by the item
 * builders that stayed behind, and moving a constant away from its only callers to sit beside a
 * function that never mentions it is filing, not decomposition.</p>
 */

// No `default` on purpose: every kind is named, so adding one to ENTITY_KINDS without giving
// it an icon is a type error here rather than a silent padlock in the tree (audit A4).
// eslint-disable-next-line complexity
export function kindIcon(kind: EntityKind): string {
  switch (kind) {
    case 'terminal':
      return 'terminal';
    case 'script':
      return 'file-code';
    case 'config':
      return 'settings-gear';
    case 'db':
      return 'database';
    case 'vpn':
      return 'shield';
    case 'sshkey':
      return 'key';
    case 'ssh':
      return 'remote';
    case 'credential':
      return 'lock';
    default:
      return assertNever(kind, 'kindIcon');
  }
}

/**
 * An entity row's icon: the editor's own codicon, or a generated glyph with the ladder under it.
 *
 * <p>The split is at level 0 on purpose. An entry no agent can reach — every entry, until
 * somebody says otherwise — keeps the codicon and the history tint exactly as before, so the
 * hand-drawn glyphs never spread across a whole tree that has nothing to say. Where there IS
 * something to say, the one icon slot carries it, and the history tint comes along inside the
 * generated file rather than being lost: a themed colour cannot be applied to a file icon, so
 * the file is drawn in that colour instead.</p>
 */
export function entityIcon(
  extensionUri: vscode.Uri,
  node: TreeNode,
  byId: (id: string) => TreeNode | undefined,
  history: boolean,
): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
  // The same kind→icon table the "Shared with me" rows use. It was a flag ladder in the tree
  // and a switch here, which is two places to teach about a new kind (audit A4).
  const kind = resolveKind(node.details);
  // Inheritance and the Trash included — a row must not claim more than the broker will give.
  const level = accessLevel(resolveMcpInTree(node, byId).access);
  // The pentagon (T25): one glyph for every kind, edges lit up to the level. The kind's own
  // codicon returns the moment the last switch goes off.
  const light = mcpIconFile(level, history, 'light');
  const dark = mcpIconFile(level, history, 'dark');
  if (light === undefined || dark === undefined) {
    return new vscode.ThemeIcon(kindIcon(kind), history ? HISTORY_COLOR : undefined);
  }
  return {
    light: vscode.Uri.joinPath(extensionUri, 'media', ...light.split('/')),
    dark: vscode.Uri.joinPath(extensionUri, 'media', ...dark.split('/')),
  };
}

/**
 * Tinted when previous versions are kept, so "this has been changed" is visible in the tree
 * rather than only after opening the entry. A theme colour rather than a second set of SVG
 * files: seven kinds times two states is fourteen files to keep in step, and the tint says the
 * same thing.
 */
const HISTORY_COLOR = new vscode.ThemeColor('credSshManager.historyIcon');

/** Folders are painted dark orange so they never blend in with items. */
export const FOLDER_COLOR = new vscode.ThemeColor('credSshManager.folderIcon');

export function folderIcon(folderType: FolderType | undefined): vscode.ThemeIcon {
  return new vscode.ThemeIcon(folderIconId(folderType), FOLDER_COLOR);
}

/**
 * A folder's glyph: the icon of the kind it holds.
 *
 * <p><b>Asked of `kindIcon` rather than listed again here</b>, and that is the whole fix. This
 * used to be a second switch over the same union with a `default` at the bottom, so a kind added
 * to `ENTITY_KINDS` was a compile error in `kindIcon` and silence here — it just started falling
 * through. `script` and `config` did exactly that, and they are not obscure: `defaultFolders.ts`
 * SEEDS a folder of each, so every vault this product has ever created carried two folders with
 * a fallback icon on them. Now the ninth kind is a compile error for folders too, because there
 * is one table.</p>
 *
 * <p>`project` is not an entity kind — nothing is OF that kind, it is a folder that holds
 * anything about one project — so it is the one case named here.</p>
 *
 * <p>The fallback stays for a type this build does not know: a vault written by a newer build
 * can carry one, and a row that refuses to draw hides its contents entirely.</p>
 */
function folderIconId(folderType: FolderType | undefined): string {
  if (folderType === 'project') {
    return 'project';
  }
  return isEntityKind(folderType) ? kindIcon(folderType) : UNTYPED_FOLDER_ICON;
}

/**
 * The glyph for a folder whose type we do not know — and NOT `'folder'`.
 *
 * <p>`new ThemeIcon('folder')` is `ThemeIcon.Folder`, which VS Code does not paint as a codicon:
 * it hands the row's `resourceUri` to the active FILE ICON THEME and draws whatever that answers.
 * Folder rows carry a synthetic `dep:` URI — they need one for the dependency colour and the
 * arrival tint — and no theme knows that scheme, so the answer is nothing and the row renders
 * with a blank where its icon belongs. Confirmed on a real tree (the owner, 2026-08-31): an
 * untyped folder had no icon at all, which is the state every hand-made folder starts in.</p>
 *
 * <p>Any codicon that is not `folder` or `file` escapes the special case; `folder-opened` is the
 * one that still reads as a plain folder and adds no second meaning, which `folder-library` and
 * `root-folder` both would.</p>
 */
const UNTYPED_FOLDER_ICON = 'folder-opened';

// eslint-disable-next-line complexity
export function buildTooltip(node: TreeNode): vscode.MarkdownString {
  // Entity fields can originate from another user (accepted shares), so the
  // tooltip must not render sender-controlled markdown/images. appendText
  // escapes every metacharacter; isTrusted stays false.
  const md = new vscode.MarkdownString();
  md.supportThemeIcons = false;
  const d0 = node.details;
  const rows: string[] = [node.name];
  if (d0?.host) rows.push(`Host: ${d0.host}`);
  if (d0?.user) rows.push(`User: ${d0.user}`);
  if (d0?.port !== undefined) rows.push(`Port: ${d0.port}`);
  if (d0?.sshKeyPath) rows.push(`Key: ${d0.sshKeyPath}`);
  rows.push(d0?.host ? 'Click: details · connects SSH via the play button' : 'Click: view details');
  if (d0?.notes) rows.push('', d0.notes);
  md.appendText(rows.join('\n'));
  return md;
}
