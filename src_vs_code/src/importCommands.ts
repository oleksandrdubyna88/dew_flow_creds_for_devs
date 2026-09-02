/* eslint-disable complexity -- moved verbatim out of extension.ts (roadmap A1, 2026-08-28):
   the ceilings are a boundary for NEW code here; each function meets them when it is next touched for a reason of its own. */
export interface NodeLocation {
  accountId: string;
  parentId: string | null;
}

import { StorageManager } from './storageManager';
import { EntryLandedError, createEntityWithSecrets } from './entityWrite';
import { ImportedEntity } from './importFormats';
import { toTreeNodes } from './importFormats';
import { TreeElement } from './types';
import { pickAccount } from './dialogs';
/**
 * Land an import: the folders it asked for, then the nodes, then their secrets.
 *
 * <p>Folders are created once and reused, so a hundred rows from one Bitwarden folder produce
 * one folder here rather than a hundred. Secrets go through `StorageManager`, which puts them
 * in the keychain — never into the node metadata that syncs in plaintext.</p>
 */
export async function importEntities(
  storage: StorageManager,
  location: NodeLocation,
  entities: readonly ImportedEntity[],
): Promise<number> {
  const folders = new Map<string, string>();
  const folderFor = async (name: string | undefined): Promise<string | null> => {
    if (name === undefined || name.length === 0) {
      return location.parentId;
    }
    const existing = folders.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const id = StorageManager.newId();
    await storage.addNode(location.accountId, {
      id,
      name,
      type: 'folder',
      parentId: location.parentId,
      folderType: 'any',
    });
    folders.set(name, id);
    return id;
  };

  // Resolved up front so `toTreeNodes` stays pure and synchronous.
  const parents = new Map<string, string | null>();
  for (const entity of entities) {
    const key = entity.folder ?? '';
    if (!parents.has(key)) {
      parents.set(key, await folderFor(entity.folder));
    }
  }

  const made = toTreeNodes(entities, () => StorageManager.newId(), (folder) => parents.get(folder ?? '') ?? null);
  for (const { node, secrets } of made) {
    // A landed-but-failed entry is a PARTIAL SUCCESS for a batch: the entry is in the tree with its
    // secrets, and throwing here would abandon every row after it while reporting the whole import
    // failed — after which a retry duplicates the rows that did land. Raised by the review; the count
    // this returns still includes it, because it is there.
    // Secrets, then the node — and on any observable failure the secrets go back, so a refused
    // keychain does not leave this id's values unreachable in it. See `entityWrite.ts`.
    await landedIsFine(() => createEntityWithSecrets({
      writeSecrets: () => writeImportedSecrets(storage, location.accountId, node.id, secrets),
      writeNode: () => storage.addNode(location.accountId, node),
      presence: () => storage.nodePresence(location.accountId, node.id),
      deferCleanup: () => storage.deferSecretCleanup(location.accountId, node.id),
      undoSecrets: () => undoImportedSecrets(storage, location.accountId, node.id),
    }));
  }
  return made.length;
}

/** Where a new node goes, based on what the command was invoked on. */
export async function resolveLocation(
  element: TreeElement | undefined,
  storage: StorageManager,
  accountPlaceholder: string,
): Promise<NodeLocation | undefined> {
  if (element?.kind === 'account') {
    return { accountId: element.account.accountId, parentId: null };
  }
  if (element?.kind === 'node') {
    return {
      accountId: element.accountId,
      parentId: element.node.type === 'folder' ? element.node.id : (element.node.parentId ?? null),
    };
  }
  const account = await pickAccount(storage, accountPlaceholder);
  return account === undefined ? undefined : { accountId: account.accountId, parentId: null };
}

/** Undo exactly what `writeImportedSecrets` writes — no more, so it is safe on a fresh id. */
async function undoImportedSecrets(storage: StorageManager, accountId: string, entityId: string): Promise<void> {
  await storage.deletePassword(accountId, entityId);
  await storage.setNotes(accountId, entityId, undefined);
  await storage.deletePrivateKey(accountId, entityId);
  await storage.deleteDbConnection(accountId, entityId);
  await storage.deleteTotp(accountId, entityId);
}

/**
 * One imported entry's secrets, written BEFORE its node — Rule A, see `applyFormSecrets.ts`.
 *
 * <p>Its own function so `importEntities` stays under the 50-line ceiling, which it crossed the
 * moment each write became conditional. Conditional because `setPassword(undefined)` and
 * `setNotes(undefined)` DELETE, and a deletion is a removal that belongs after the node — on an
 * import there is nothing to delete, so the honest form is not to call them at all.</p>
 */
async function writeImportedSecrets(
  storage: StorageManager,
  accountId: string,
  entityId: string,
  secrets: { password?: string; notes?: string; privateKey?: string; dbConnection?: string; totp?: string },
): Promise<void> {
  const writes: ReadonlyArray<[string | undefined, (v: string) => Promise<void>]> = [
    [secrets.password, (v) => storage.setPassword(accountId, entityId, v)],
    [secrets.notes, (v) => storage.setNotes(accountId, entityId, v)],
    [secrets.privateKey, (v) => storage.setPrivateKey(accountId, entityId, v)],
    [secrets.dbConnection, (v) => storage.setDbConnection(accountId, entityId, v)],
    [secrets.totp, (v) => storage.setTotp(accountId, entityId, v)],
  ];
  for (const [value, write] of writes) {
    if (value !== undefined) {
      await write(value);
    }
  }
}

/** Swallow ONLY the "it is in the tree" outcome — every other failure still stops the import. */
async function landedIsFine(create: () => Promise<void>): Promise<void> {
  try {
    await create();
  } catch (error) {
    if (!(error instanceof EntryLandedError)) {
      throw error;
    }
  }
}
