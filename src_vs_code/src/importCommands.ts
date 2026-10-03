/* eslint-disable complexity -- moved verbatim out of extension.ts (roadmap A1, 2026-08-28):
   the ceilings are a boundary for NEW code here; each function meets them when it is next touched for a reason of its own. */
export interface NodeLocation {
  accountId: string;
  parentId: string | null;
}

import { EntryLandedError } from './entityWrite';
import { FolderQuestion, Landing, arrivalPins, declinedLanding } from './arrivalPin';
import type { ArrivalPins } from './arrivalPin';
import { CreatePin, SettledPin, applyCreatePin } from './pinOnCreate';
import { EntryWriter, writerForNew } from './entryWriter';
import { StorageManager } from './storageManager';
import { ImportedEntity } from './importFormats';
import { toTreeNodes } from './importFormats';
import { TreeElement, TreeNode } from './types';
import { pickAccount } from './dialogs';
/** What an import did: how many entries it created, and the ones it skipped, each with the reason. */
export interface ImportOutcome {
  readonly created: number;
  readonly skipped: readonly string[];
}

/**
 * Land an import: the folders it asked for, then the nodes, then their secrets.
 *
 * <p>Folders are created once and reused, so a hundred rows from one Bitwarden folder produce
 * one folder here rather than a hundred. Secrets go through `StorageManager`, which puts them
 * in the keychain — never into the node metadata that syncs in plaintext.</p>
 *
 * <p><b>Into a folder that asks for a PIN, the import asks it</b> (`PLAN_pin_folder_asks_on_accept_and_import.md`,
 * B6) — the question Add asks there, once per destination (`arrivalPin.ts`), BEFORE any write. An entry
 * whose landing settled a PIN is sealed under it before its first write and marked after its node, the
 * road Add takes; a declined landing writes nothing — no value, no node, no folder made only for it —
 * and is named in `skipped`. `question` is REQUIRED: a caller that forgot it would write plain into a
 * protected folder.</p>
 */
export async function importEntities(
  storage: StorageManager,
  location: NodeLocation,
  entities: readonly ImportedEntity[],
  question: FolderQuestion,
): Promise<ImportOutcome> {
  const settled = await settleEach(arrivalPins(question), location, entities);
  const going = entities.filter((_, at) => settled[at].kind !== 'cancelled');
  const pins = settled.filter((pin): pin is SettledPin => pin.kind !== 'cancelled');
  const parents = await foldersFor(storage, location, going);
  const made = toTreeNodes(going, () => StorageManager.newId(), (folder) => parents.get(folder ?? '') ?? null);
  for (const [at, { node, secrets }] of made.entries()) {
    await landImported(storage, location, node, secrets, pins[at]);
  }
  return { created: made.length, skipped: skippedFor(storage, location, entities, settled) };
}

/** Each entry's answer, asked in order and before anything is written. */
async function settleEach(pins: ArrivalPins, location: NodeLocation, entities: readonly ImportedEntity[]): Promise<CreatePin[]> {
  const settled: CreatePin[] = [];
  for (const entity of entities) {
    settled.push(await pins.settledFor(importLanding(location, entity.folder)));
  }
  return settled;
}

/**
 * Where one imported entry lands: in the folder the import was started on, or in the folder named for it
 * there — always a NEW folder (`foldersFor` never reuses one), so its landing creates it.
 */
function importLanding(location: NodeLocation, folder: string | undefined): Landing {
  const creates = folder === undefined || folder.length === 0 ? [] : [{ name: folder }];
  return { accountId: location.accountId, existing: location.parentId, creates };
}

/** The entries a declined landing kept out, each with the sentence that says why. */
function skippedFor(storage: StorageManager, location: NodeLocation, entities: readonly ImportedEntity[], settled: readonly CreatePin[]): string[] {
  const folder = location.parentId === null ? '' : (storage.getNode(location.accountId, location.parentId)?.name ?? '');
  return entities.flatMap((entity, at) => (settled[at].kind === 'cancelled' ? [`"${entity.name}" — ${declinedLanding(folder)}`] : []));
}

/** The import's skipped entries said in one sentence for the closing message, or `''`. */
export function notImported(skipped: readonly string[]): string {
  return skipped.length === 0 ? '' : ` ${skipped.length} not imported: ${skipped.slice(0, 8).join('; ')}.`;
}

/** The folders the GOING entries asked for, created once each — none for an entry a decline kept out. */
async function foldersFor(storage: StorageManager, location: NodeLocation, entities: readonly ImportedEntity[]): Promise<Map<string, string | null>> {
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
  return parents;
}

/**
 * One imported entry: its secrets through the writer its landing settled — sealed under the folder's PIN
 * before the first write when it asked (rule R3) — then its node, then the mark (`applyCreatePin`, last).
 *
 * <p>A landed-but-failed entry is a PARTIAL SUCCESS for a batch: the entry is in the tree with its
 * secrets, and throwing here would abandon every row after it while reporting the whole import
 * failed — after which a retry duplicates the rows that did land. Raised by the review; the count
 * this returns still includes it, because it is there. Secrets, then the node — and on any observable
 * failure the secrets go back.</p>
 */
async function landImported(storage: StorageManager, location: NodeLocation, node: TreeNode, secrets: ImportedEntity['secrets'], pin: SettledPin): Promise<void> {
  await landedIsFine(() => storage.runCreate({
    writeSecrets: () => writeImportedSecrets(writerForNew(storage, location.accountId, node.id, pin), location.accountId, node.id, secrets),
    writeNode: () => storage.addNode(location.accountId, node),
    presence: () => storage.nodePresence(location.accountId, node.id),
    deferCleanup: () => storage.deferSecretCleanup(location.accountId, node.id),
    finishCleanup: () => storage.endSecretCleanup(location.accountId, node.id),
    undoSecrets: () => undoImportedSecrets(storage, location.accountId, node.id),
  }));
  await applyCreatePin(pin, storage, location.accountId, node.id);
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
 *
 * <p>Through the writer `entryWriter.writerForNew` gives a new id under the PIN its landing settled — never
 * the storage itself (the typed-secrets plan's T4; the PIN-folder plan's B6 answered §2.7's question).</p>
 */
async function writeImportedSecrets(
  writer: EntryWriter,
  accountId: string,
  entityId: string,
  secrets: { password?: string; notes?: string; privateKey?: string; dbConnection?: string; totp?: string },
): Promise<void> {
  const writes: ReadonlyArray<[string | undefined, (v: string) => Promise<void>]> = [
    [secrets.password, (v) => writer.setPassword(accountId, entityId, v)],
    [secrets.notes, (v) => writer.setNotes(accountId, entityId, v)],
    [secrets.privateKey, (v) => writer.setPrivateKey(accountId, entityId, v)],
    [secrets.dbConnection, (v) => writer.setDbConnection(accountId, entityId, v)],
    [secrets.totp, (v) => writer.setTotp(accountId, entityId, v)],
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
