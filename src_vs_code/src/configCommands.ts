/* eslint-disable complexity -- moved verbatim out of extension.ts (roadmap A1, 2026-08-28):
   the ceilings are a boundary for NEW code here; each function meets them when it is next touched for a reason of its own. */
import { StorageManager } from './storageManager';
import { TreeNode } from './types';
import * as vscode from 'vscode';
import { diffConfigs } from './configDiff';
import { summarizeChanges } from './configDiff';
import { describeChanges } from './configDiff';
import { ConfigHolder } from './brokerConfigRoute';
import { isInTrash } from './trash';
import { EntityMetadata } from './types';
import { configFileNameFor } from './configFile';
import { isTrackedHere } from './gitTracked';
import { trackedCopyWarning } from './configFile';
/**
 * What changed since the previous version of this config, by KEY.
 *
 * <p>Against the newest revision rather than against a sync event, deliberately: a body arrives
 * from a colleague's sync, an accepted share, a restore, or the person's own edit, and all four
 * put the previous one into history. Asking history covers every route with one answer instead of
 * instrumenting each of them.</p>
 *
 * <p>Shown as a modal list of KEY NAMES and no values. A config holds connection strings and
 * passwords; which keys moved is the reviewable half and carries neither.</p>
 */
export async function showConfigChanges(
  storage: StorageManager,
  accountId: string,
  node: TreeNode,
): Promise<void> {
  const details = node.details;
  const history = await storage.getHistory(accountId, node.id);
  const previous = history[0]?.secrets.config;
  if (details === undefined || previous === undefined) {
    void vscode.window.showInformationMessage(`"${node.name}" has no previous version to compare with.`);
    return;
  }
  const current = (await storage.getConfigBody(accountId, node.id)) ?? '';
  const changes = diffConfigs(details.configFormat ?? 'json', previous, current);
  void vscode.window.showInformationMessage(
    `"${node.name}": ${summarizeChanges(changes)} since ${new Date(history[0].at).toLocaleString()}.`,
    { modal: true, detail: describeChanges(changes) },
  );
}

export function addConfigHolder(
  found: ConfigHolder[],
  accountId: string,
  node: TreeNode,
  byId: (id: string) => TreeNode | undefined,
): void {
  const details = node.details;
  if (details?.configKeyHash === undefined || isInTrash(node, byId)) {
    return;
  }
  found.push({
    accountId,
    entityId: node.id,
    entityName: node.name,
    format: details.configFormat ?? 'json',
    configKeyHash: details.configKeyHash,
  });
}

export function collectConfigHolders(storage: StorageManager): ConfigHolder[] {
  const found: ConfigHolder[] = [];
  for (const { accountId } of storage.getAccounts()) {
    const byId = (id: string): TreeNode | undefined => storage.getNode(accountId, id);
    for (const node of storage.getNodes(accountId)) {
      addConfigHolder(found, accountId, node, byId);
    }
  }
  return found;
}

/**
 * Say something when the file this config describes is ALSO in the repository.
 *
 * <p>Fire-and-forget on purpose: it runs `git` and a save must not wait on that. The failure it
 * catches is quiet — the vault becomes a second place to keep the secrets rather than the place —
 * so a warning that arrives a moment late is still the whole value.</p>
 */
export async function warnIfTrackedCopy(details: EntityMetadata): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (details.isConfig !== true || folder === undefined) {
    return;
  }
  const name = configFileNameFor(details.configFileName, details.configFormat ?? 'json', details.name);
  if (await isTrackedHere(name, folder.uri.fsPath)) {
    void vscode.window.showWarningMessage(trackedCopyWarning(name));
  }
}
