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
import type { ConfigFormat } from './configFormat';
import { clickOpener, clickedSecret } from './pinClick';
import { OpenedSecret, SecretOwner, automaticOpener } from './secretOpener';
import { FieldReading, withheld } from './fieldReading';
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
 *
 * <p>Both bodies are OPENED first, through the entry's door (entry-PIN plan, D6/D18): a protected
 * config was compared envelope against envelope, and the modal listed the wrap's own fields —
 * `lock.sealed.data` and the rest — as the keys that had changed.</p>
 */
export async function showConfigChanges(
  storage: StorageManager,
  accountId: string,
  node: TreeNode,
): Promise<void> {
  const compared = await comparedBodies(storage, accountId, node);
  if (compared === undefined) {
    return;
  }
  const changes = diffConfigs(compared.format, compared.previous, compared.current);
  void vscode.window.showInformationMessage(
    `"${node.name}": ${summarizeChanges(changes)} since ${new Date(compared.at).toLocaleString()}.`,
    { modal: true, detail: describeChanges(changes) },
  );
}

interface ComparedBodies {
  readonly format: ConfigFormat;
  readonly previous: string;
  readonly current: string;
  /** When the previous body was replaced. */
  readonly at: number;
}

/** The newest kept body and today's, both opened — or nothing, having said why. */
async function comparedBodies(storage: StorageManager, accountId: string, node: TreeNode): Promise<ComparedBodies | undefined> {
  const details = node.details;
  const newest = (await storage.getHistory(accountId, node.id))[0];
  const previousRaw = newest?.secrets.config;
  if (details === undefined || previousRaw === undefined) {
    void vscode.window.showInformationMessage(`"${node.name}" has no previous version to compare with.`);
    return undefined;
  }
  return openedBodies(storage, accountId, details, previousRaw, newest.at);
}

const COMPARE = 'compare it with its previous version';

/** One door for both: the live body opens it, and the kept body is opened with the grant it left. */
async function openedBodies(
  storage: StorageManager,
  accountId: string,
  details: EntityMetadata,
  previousRaw: string,
  at: number,
): Promise<ComparedBodies | undefined> {
  const current = bodyText(await clickedSecret(storage, accountId, details, (s, a, e) => s.getConfigBody(a, e), COMPARE));
  if (current === undefined) {
    return undefined;
  }
  const previous = bodyText(await clickOpener(storage, accountId, COMPARE)(details, previousRaw));
  return previous === undefined ? undefined : { format: details.configFormat ?? 'json', previous, current, at };
}

/** An opened body (an absent one is empty, as it always was); a stop is nothing — it has been said. */
function bodyText(opened: OpenedSecret): string | undefined {
  return opened.kind === 'open' ? (opened.value ?? '') : undefined;
}

// eslint-disable-next-line complexity -- moved verbatim out of extension.ts (roadmap A1); split when next touched
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

/**
 * What the config route may serve for one holder: the body, READ — never an envelope.
 *
 * <p>The route is AUTOMATIC — an application calls it with a key and no window asks anybody — so the
 * body goes through `automaticOpener` (entry-PIN plan, rule R2): a sealed body, or any body of an
 * entry that claims a PIN, is `withheld` with the sentence, and the route answers it as the refusal
 * it already has. Until 1.12 this was the raw getter, and a protected config was served as its
 * envelope. An empty body is still a body, as it always was.</p>
 */
export async function configBodyReading(storage: StorageManager, holder: ConfigHolder): Promise<FieldReading> {
  const opened = await automaticOpener(holderOwner(storage, holder), await storage.getConfigBody(holder.accountId, holder.entityId));
  if (opened.kind === 'stopped') {
    return withheld(opened.reason);
  }
  return opened.value === undefined ? { kind: 'absent' } : { kind: 'value', value: opened.value };
}

/** The entry behind a holder, as an opener sees it — its mark read from the node, where it lives. */
function holderOwner(storage: StorageManager, holder: ConfigHolder): SecretOwner {
  const details = storage.getNode(holder.accountId, holder.entityId)?.details;
  return { id: holder.entityId, name: holder.entityName, pinProtected: details?.pinProtected };
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
// eslint-disable-next-line complexity -- moved verbatim out of extension.ts (roadmap A1); split when next touched
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
