import * as vscode from 'vscode';
import { EntityKind, FolderType, TreeNode } from './types';
import { assertNever } from './entityKind';

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

/** Folders are painted dark orange so they never blend in with items. */
export const FOLDER_COLOR = new vscode.ThemeColor('credSshManager.folderIcon');

// eslint-disable-next-line complexity
export function folderIcon(folderType: FolderType | undefined): vscode.ThemeIcon {
  switch (folderType) {
    case 'project':
      return new vscode.ThemeIcon('project', FOLDER_COLOR);
    case 'db':
      return new vscode.ThemeIcon('database', FOLDER_COLOR);
    case 'vpn':
      return new vscode.ThemeIcon('shield', FOLDER_COLOR);
    case 'sshkey':
      return new vscode.ThemeIcon('key', FOLDER_COLOR);
    case 'ssh':
      return new vscode.ThemeIcon('remote', FOLDER_COLOR);
    case 'credential':
      return new vscode.ThemeIcon('lock', FOLDER_COLOR);
    case 'terminal':
      return new vscode.ThemeIcon('terminal', FOLDER_COLOR);
    default:
      return new vscode.ThemeIcon('folder', FOLDER_COLOR);
  }
}

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
