import {
  attachmentSecretKey,
  configSecretKey,
  dbConnSecretKey,
  fieldsSecretKey,
  imageSecretKey,
  notesSecretKey,
  paymentSecretKey,
  privateKeySecretKey,
  secretKey,
  totpSecretKey,
  vpnConfigSecretKey,
} from './secretKeys';

/**
 * Every per-entity secret kept as ONE string under ONE key, by the bundle field that carries it.
 *
 * <p>Export, import, snapshot and the delete-with-the-entry all walk THIS list. It used to be
 * ten hand-written blocks per site — the audit's "seven kinds walked by hand" — and a kind added
 * to one site and forgotten in another exported silently incomplete files. Now a kind is a row.</p>
 *
 * <p>Its own module since S1.4, and not only for the size ratchet: five other files carry lists
 * that must AGREE with this one (`syncMerge`'s snapshot, `syncManager`'s vault read-back,
 * `idQuarantine`'s remap, `revisionHistory`, `externalSecretsApply`), and a shared truth living
 * inside the one class that happens to use it is a shared truth nothing else can be checked
 * against. Free of `vscode`, so a test can walk it.</p>
 *
 * <p>Not to be confused with `secretKinds.ts`, which is about what this extension can GENERATE.</p>
 */
export type SecretMapKey =
  | 'passwords'
  | 'privateKeys'
  | 'vpnConfigs'
  | 'dbConnections'
  | 'notes'
  | 'attachments'
  | 'images'
  | 'totps'
  | 'configs'
  | 'fields'
  | 'payments';

export type SecretMaps = Record<SecretMapKey, Record<string, string>>;

export const SECRET_KINDS: ReadonlyArray<{
  bundleKey: SecretMapKey;
  key: (accountId: string, entityId: string) => string;
}> = [
  { bundleKey: 'passwords', key: (a, e) => secretKey(a, e) },
  { bundleKey: 'privateKeys', key: (a, e) => privateKeySecretKey(a, e) },
  { bundleKey: 'vpnConfigs', key: (a, e) => vpnConfigSecretKey(a, e) },
  { bundleKey: 'dbConnections', key: (a, e) => dbConnSecretKey(a, e) },
  { bundleKey: 'notes', key: (a, e) => notesSecretKey(a, e) },
  { bundleKey: 'attachments', key: (a, e) => attachmentSecretKey(a, e) },
  { bundleKey: 'images', key: (a, e) => imageSecretKey(a, e) },
  { bundleKey: 'totps', key: (a, e) => totpSecretKey(a, e) },
  { bundleKey: 'configs', key: (a, e) => configSecretKey(a, e) },
  { bundleKey: 'fields', key: (a, e) => fieldsSecretKey(a, e) },
  // ONE row is the whole of a new secret kind's storage — export, import, snapshot and delete all
  // walk this list, so a kind reaches four sites with no line written at any of them.
  { bundleKey: 'payments', key: (a, e) => paymentSecretKey(a, e) },
];

/**
 * A full set of empty maps — DERIVED from the rows above, not written out again.
 *
 * <p>It used to be an eleventh hand-kept list, and the kind of list that is wrong for a release
 * before anyone notices: a key missing here reads as "this bundle carried no payments" rather
 * than as a mistake.</p>
 */
export function emptySecretMaps(): SecretMaps {
  return Object.fromEntries(SECRET_KINDS.map((kind) => [kind.bundleKey, {}])) as SecretMaps;
}

/** Just enough of `vscode.SecretStorage` to move maps in and out of it, and not a line more. */
export interface SecretChest {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

/** The bundle's maps with every absent one an empty record — a pre-0.57 file has no totps at all. */
export function secretMapsOf(bundle: Partial<Record<SecretMapKey, Record<string, string>>>): SecretMaps {
  const maps = emptySecretMaps();
  for (const kind of SECRET_KINDS) {
    maps[kind.bundleKey] = bundle[kind.bundleKey] ?? {};
  }
  return maps;
}

/** One entity's secrets, kind by kind, into the maps — absent kinds leave no entry. */
export async function readKindsInto(
  chest: SecretChest,
  accountId: string,
  entityId: string,
  maps: SecretMaps,
): Promise<void> {
  for (const kind of SECRET_KINDS) {
    const value = await chest.get(kind.key(accountId, entityId));
    if (value !== undefined) {
      maps[kind.bundleKey][entityId] = value;
    }
  }
}

/** Every map's entries into the keychain, kind by kind. */
export async function storeSecretMaps(chest: SecretChest, accountId: string, maps: SecretMaps): Promise<void> {
  for (const kind of SECRET_KINDS) {
    for (const [entityId, value] of Object.entries(maps[kind.bundleKey])) {
      await chest.store(kind.key(accountId, entityId), value);
    }
  }
}

/** The kinds the incoming maps do not carry for this entity are gone from the keychain. */
export async function dropAbsentKinds(
  chest: SecretChest,
  accountId: string,
  entityId: string,
  maps: SecretMaps,
): Promise<void> {
  for (const kind of SECRET_KINDS) {
    if (maps[kind.bundleKey][entityId] === undefined) {
      await chest.delete(kind.key(accountId, entityId));
    }
  }
}

/**
 * Every entity's secrets, kind by kind — plus any legacy plaintext note, migrated into the map.
 *
 * <p>A note written before 0.20 is still sitting in the node's plaintext metadata. It is read here
 * so that a backup carries it as a proper secret, and only when no STORED note has replaced it —
 * otherwise a restore would resurrect the old text over the new.</p>
 */
export async function readSecretMaps(
  chest: SecretChest,
  accountId: string,
  nodes: readonly { id: string; type: string; details?: { notes?: string } }[],
): Promise<SecretMaps> {
  const maps = emptySecretMaps();
  for (const node of nodes.filter((n) => n.type === 'entity')) {
    await readKindsInto(chest, accountId, node.id, maps);
    const legacyNote = legacyNoteOf(node, maps);
    if (legacyNote !== undefined) {
      maps.notes[node.id] = legacyNote;
    }
  }
  return maps;
}

/** A pre-0.20 note still in plaintext metadata, when no stored note has replaced it. */
function legacyNoteOf(node: { id: string; details?: { notes?: string } }, maps: SecretMaps): string | undefined {
  const stored = maps.notes[node.id];
  return stored === undefined ? nonEmpty(node.details?.notes) : undefined;
}

function nonEmpty(text: string | undefined): string | undefined {
  return text !== undefined && text.length > 0 ? text : undefined;
}
