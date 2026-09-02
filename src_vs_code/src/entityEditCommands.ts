/* eslint-disable complexity, max-lines-per-function -- moved verbatim out of extension.ts (roadmap A1, 2026-08-28):
   the ceilings are a boundary for NEW code here; each function meets them when it is next touched for a reason of its own. */
export type DoorsFor = (accountId: string, node: TreeNode) => Partial<Pick<EntityFormOptions, 'agentDoors' | 'entityTarget'>>;

import * as vscode from 'vscode';
import { hasMixedField, mixedEditRefusal } from './mixedFieldGuard';
import { parsePaymentFields } from './paymentFields';
import { TreeNode } from './types';
import { entriesUnder, resolveMcpInTree } from './mcpAccess';
import { StorageManager } from './storageManager';
import { parseHostKey } from './hostKeyPin';
import { parseTotpSecret } from './totp';
import { describeTotp } from './totp';
import { showEntityForm } from './entityFormPanel';
import { folderKindOf } from './commandTargets';
import { imageMime } from './attachment';
import { buildDependencyCandidates } from './depGraph';
import { buildDependencyColorMap } from './depGraph';
import { collectJumpCandidates } from './commandTargets';
import { hostKeyFingerprint } from './hostKeyPin';
import { snapshotForRevision } from './revisionSnapshot';
import { carryThroughDetails } from './attachmentMeta';
import { applyAdditions, applyRemovals } from './applyFormSecrets';
import { warnIfTrackedCopy } from './configCommands';
import { applyEnvBindings } from './envApply';
import { showFolderForm } from './folderFormPanel';
import { isInTrash } from './trash';
import { KeyCandidate } from './entityFormPanel';
import { EntityMetadata } from './types';
import type { EntityFormOptions } from './entityFormPanel';
import { envCollection } from './envCollectionRef';
export async function editNode(
  accountId: string,
  node: TreeNode,
  storage: StorageManager,
  onMutated: () => void,
  doorsFor: DoorsFor = () => ({}),
): Promise<void> {
  if (node.type === 'folder') {
    await editFolder(accountId, node, storage, onMutated);
    return;
  }

  if (!node.details) {
    return;
  }
  // A record with a woven field has no original to put in the form — editing it would weave the woven
  // value a SECOND time and destroy it, silently, one save at a time. The menu item is hidden by a
  // context token as well; this is the guarantee, because a command can also be reached from the
  // palette, a keybinding, or another extension. See `mixedFieldGuard.ts`.
  const storedPayment = parsePaymentFields(await storage.getPaymentRaw(accountId, node.id));
  if (hasMixedField(storedPayment)) {
    void vscode.window.showWarningMessage(mixedEditRefusal(storedPayment));
    return;
  }
  const storedHostKey = parseHostKey(node.details.hostKey);
  // The form is told a seed exists and how it is configured — never the seed itself.
  const storedTotp = await storage.getTotp(accountId, node.id);
  const storedTotpParsed = storedTotp === undefined ? undefined : parseTotpSecret(storedTotp);
  const storedTotpDescription =
    storedTotpParsed === undefined ? undefined : describeTotp(storedTotpParsed.config);
  const result = await showEntityForm({
    initialPayment: storedPayment,
    mode: 'edit',
    entityId: node.id,
    initial: node.details,
    lockedKind: folderKindOf(storage, accountId, node.parentId ?? null),
    hasStoredPassword: (await storage.getPassword(accountId, node.id)) !== undefined,
    hasStoredPrivateKey: (await storage.getPrivateKey(accountId, node.id)) !== undefined,
    hasStoredAttachment: (await storage.getAttachment(accountId, node.id)) !== undefined,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    hasStoredImage: (await storage.getImage(accountId, node.id)) !== undefined,
    // T27: the edit form shows WHAT is stored, not only that something is.
    imageDataUri: await (async () => {
      const b64 = await storage.getImage(accountId, node.id);
      const mime = node.details?.imageFileName === undefined ? undefined : imageMime(node.details.imageFileName);
      return b64 !== undefined && mime !== undefined ? `data:${mime};base64,${b64}` : undefined;
    })(),
    hasStoredVpnConfig: (await storage.getVpnConfig(accountId, node.id)) !== undefined,
    hasStoredDbConnection: (await storage.getDbConnection(accountId, node.id)) !== undefined,
    initialDbConnection: await storage.getDbConnection(accountId, node.id),
    initialNotes: (await storage.getNotes(accountId, node.id)) ?? node.details?.notes,
    initialFields: await storage.getFields(accountId, node.id),
    // Prefilled, unlike the password and the key: a config is a document somebody opens Edit to
    // change one line of, and a blank box would make every edit a retype from memory.
    initialConfigBody: await storage.getConfigBody(accountId, node.id),
    hasStoredTotp: storedTotpDescription !== undefined,
    storedTotpDescription,
    keyCandidates: await collectKeyCandidates(storage, accountId, node.id),
    dependencyFolders: buildDependencyCandidates(storage.getNodes(accountId), node.id),
    dependencyColors: buildDependencyColorMap(storage.getNodes(accountId)),
    jumpCandidates: collectJumpCandidates(storage, accountId, node.id),
    hasStoredHostKey: storedHostKey !== undefined,
    hostKeyFingerprint: storedHostKey === undefined ? undefined : hostKeyFingerprint(storedHostKey),
    ...doorsFor(accountId, node),
  });
  if (result === undefined) {
    return;
  }
  // Snapshot what is there before it is replaced — the whole point of history is being
  // able to see what a change changed, which is only knowable from the old state.
  await storage.recordRevision(
    accountId,
    node.id,
    await snapshotForRevision(storage, accountId, {
      id: node.id,
      name: node.name,
      details: node.details,
    }),
  );
  // The three writes, in the one order that keeps the invariant: an orphaned secret is the only torn
  // state allowed to exist. ADDITIONS first, so the node never claims a value that was not written;
  // then the node; then REMOVALS, so no node outlives a value it still claims. Two rounds of the plan
  // gate shaped this, including finding that the first version of the rule destroyed data on delete
  // and that a single `applySecrets` call cannot be right for a save that both adds and clears.
  await applyAdditions(storage, accountId, node.id, result);
  await storage.updateNode(accountId, {
    ...node,
    name: result.details.name,
    details: carryThroughDetails(
      result,
      node.details,
      storage.getAccount(accountId)?.email,
      Date.now(),
    ),
  });
  await applyRemovals(storage, accountId, node.id, result);
  void warnIfTrackedCopy(result.details);
  await applyDependencyColors(storage, accountId, result.dependsOnColors);
  // AFTER the secrets land, so the values written are the ones just saved. The old
  // bindings are passed so a renamed or switched-off variable is deleted, not orphaned.
  await applyEnvBindings(envCollection(), storage, accountId, result.details, node.details.envBindings);
  onMutated();
}

/**
 * A folder's own form — its name, and the agent access its contents inherit.
 *
 * <p>This used to be `promptFolderName`, an input box with one field in it, because a folder had
 * nothing else to say. Agent access is inherited from the folder, so there is now a second thing,
 * and five permissions do not fit in a text prompt.</p>
 *
 * <p>An empty name leaves the folder alone rather than blanking it: the box comes back empty when
 * somebody clears it and saves, and a nameless folder is not a thing anyone asked for.</p>
 */
export async function editFolder(
  accountId: string,
  node: TreeNode,
  storage: StorageManager,
  onMutated: () => void,
): Promise<void> {
  const nodes = storage.getNodes(accountId);
  const byId = (id: string): TreeNode | undefined => storage.getNode(accountId, id);
  // What this folder is subject to from above, so the form can say so instead of claiming
  // nothing here is reachable while an open parent says otherwise.
  const resolved = resolveMcpInTree(node, byId);
  const result = await showFolderForm({
    name: node.name,
    mcp: node.mcp,
    entryCount: entriesUnder(node.id, nodes),
    inherited:
      node.mcp === undefined && resolved.source === 'folder' && resolved.folder !== undefined
        ? { access: resolved.access, from: resolved.folder.name }
        : undefined,
    inTrash: isInTrash(node, byId),
  });
  if (result === undefined) {
    return;
  }
  await storage.updateNode(accountId, {
    ...node,
    name: result.name.length > 0 ? result.name : node.name,
    mcp: result.mcp,
  });
  onMutated();
}

export async function collectKeyCandidates(
  storage: StorageManager,
  accountId: string,
  excludeEntityId: string,
): Promise<KeyCandidate[]> {
  const candidates: KeyCandidate[] = [];
  for (const node of storage.getNodes(accountId)) {
    if (node.type !== 'entity' || node.id === excludeEntityId || !node.details) {
      continue;
    }
    const hasKey =
      node.details.isSshKey === true ||
      node.details.sshKeyPath !== undefined ||
      (await storage.getPrivateKey(accountId, node.id)) !== undefined;
    if (hasKey) {
      candidates.push({ id: node.id, name: node.name });
    }
  }
  return candidates;
}

/**
 * Stamp the picked colour onto the entities this one now depends ON.
 *
 * <p>A write to a DIFFERENT record than the one being saved, and deliberately so: the colour
 * belongs to the target, which is what makes "change it once and every dependent follows" true
 * with no propagation code anywhere — the dependents do not store a colour to update. The cost
 * is this one extra write, and a crash between the two leaves the colour unset, which the next
 * save re-picks. Self-healing, and the same single-node-at-a-time shape every other mutator
 * here has.</p>
 *
 * <p>Unchanged colours are skipped rather than rewritten: a rewrite would bump the target's
 * version vector and make an untouched entity look edited to every other machine.</p>
 */
export async function applyDependencyColors(
  storage: StorageManager,
  accountId: string,
  picks: readonly { targetId: string; color: string }[],
): Promise<void> {
  for (const pick of picks) {
    const target = storage.getNode(accountId, pick.targetId);
    if (target?.details !== undefined && target.details.depColor !== pick.color) {
      await storage.updateNode(accountId, {
        ...target,
        details: { ...target.details, depColor: pick.color },
      });
    }
  }
}

/** Persist the password/private-key changes coming out of the form. */
/**
 * Change one config-only field on an entity, leaving everything else exactly as it was.
 *
 * <p>A read-modify-write rather than a targeted setter, because `updateNode` takes a whole node —
 * and spelling the spread at both call sites is how one of them eventually drops a field nobody
 * was thinking about.</p>
 */
export async function updateConfigDetails(
  storage: StorageManager,
  element: { accountId: string; node: TreeNode },
  change: Partial<EntityMetadata>,
): Promise<void> {
  const details = element.node.details;
  if (details === undefined) {
    return;
  }
  await storage.updateNode(element.accountId, { ...element.node, details: { ...details, ...change } });
}
